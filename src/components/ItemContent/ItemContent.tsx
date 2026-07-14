import { lazy, type ReactNode, Suspense } from "react";

import { useSessionOwners } from "../../ownership";
import { useStore } from "../../store";
import type { CanvasContent } from "../../types";
import { ownedHere } from "../../windowContext";
import { sameItem } from "../Canvas/canvasDrop";
import TemplatePendingPanel from "../Canvas/TemplatePendingPanel";
import DetachedNote from "../DetachedNote/DetachedNote";
import MaximizedNote from "../MaximizedNote/MaximizedNote";
import RecurringPanel from "../RecurringPanel/RecurringPanel";
import ScheduledPanel from "../ScheduledPanel/ScheduledPanel";
import Terminal from "../Terminal/Terminal";
import styles from "./ItemContent.module.css";

// The four content panels that are NOT the app's first paint (terminals are) — and that
// carry the whole markdown + Prism stack (react-markdown / remark-gfm / micromark / hast /
// prismjs, ~221 kB) plus their own weight. Loading them through `import()` keeps every byte
// of that out of the first-paint graph (#356); each is fetched the moment a panel of that
// kind actually renders, and warmed on idle by `src/prefetch.ts` so it is already in memory.
// Mermaid (#254) stays a further lazy chunk *inside* FileViewer — a markdown file with no
// ```mermaid fence still never fetches it.
const DiffInspector = lazy(() => import("../DiffInspector/DiffInspector"));
const FileTree = lazy(() => import("../FileTree/FileTree"));
const FileViewer = lazy(() => import("../FileViewer/FileViewer"));
const KanbanPanel = lazy(() => import("../Kanban/KanbanPanel"));

/**
 * One Suspense boundary per lazy branch — **never** one around the whole component.
 * A suspending boundary hides its already-rendered children with `display: none`; a
 * pooled xterm (#18) inside one would become un-measurable and misfit on resume. Wrapping
 * only the four lazy panels means a terminal is never inside a boundary. The fallback
 * reuses the existing muted `.placeholder` style and FileViewer's own "Loading…" copy, so
 * a restored file/diff/kanban/tree panel looks exactly as it does today.
 */
function PanelSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className={styles.placeholder}>Loading…</div>}>
      {children}
    </Suspense>
  );
}

/**
 * The single source of truth for rendering an item's **live content** from a
 * `CanvasContent` descriptor (#157) — agent/shell terminals (#18 pool), file (#44),
 * kanban (#145), diff (#39), scheduled (#94), and pending template panels (#118).
 * Shared by Canvas panels, Overview columns, and the big-mode modal so the exact
 * same rendering (including the #84 ownership guard) is used everywhere.
 *
 * Two "render in one place" guards keep a pooled terminal / single auto-save hook
 * from mounting twice:
 *  - **#84 ownership:** a PTY owned by another window shows a `DetachedNote`.
 *  - **#157 big mode:** while this exact item is maximized and this is **not** the
 *    modal's instance (`inModal`), show a `MaximizedNote` so the live render is the
 *    modal's alone.
 */
function ItemContent({
  content,
  active = true,
  inModal = false,
  leafId,
}: {
  content: CanvasContent;
  active?: boolean;
  /** True only for the modal's own instance — bypasses the big-mode placeholder. */
  inModal?: boolean;
  /** Canvas leaf id, required to render a `pending` template panel (#118). */
  leafId?: string;
}) {
  const sessions = useStore((s) => s.sessions);
  const maximizedItem = useStore((s) => s.maximizedItem);
  const owners = useSessionOwners();

  // Big mode (#157): everywhere but the modal, a maximized item shows a placeholder
  // so its pooled terminal / auto-save hook lives only in the modal.
  if (!inModal && maximizedItem && sameItem(content, maximizedItem)) {
    return <MaximizedNote />;
  }

  if (content.kind === "agent" && content.sessionId) {
    const session = sessions.find((s) => s.id === content.sessionId);
    if (!session) {
      return <div className={styles.placeholder}>Session closed.</div>;
    }
    // One PTY renders in one window (#84): defer to the owning window otherwise.
    if (!ownedHere(owners, content.sessionId)) {
      return <DetachedNote ownerLabel={owners[content.sessionId]} />;
    }
    return <Terminal sessionId={content.sessionId} />;
  }
  if (content.kind === "terminal" && content.sessionId) {
    if (!ownedHere(owners, content.sessionId)) {
      return <DetachedNote ownerLabel={owners[content.sessionId]} />;
    }
    // Plain shell terminal item (#72): repoPath lets Restart respawn the shell.
    return (
      <Terminal sessionId={content.sessionId} repoPath={content.repoPath} />
    );
  }
  if (content.kind === "file" && content.repoPath && content.file) {
    return (
      <PanelSuspense>
        <FileViewer
          repoPath={content.repoPath}
          file={content.file}
          active={active}
        />
      </PanelSuspense>
    );
  }
  if (content.kind === "kanban" && content.repoPath && content.file) {
    return (
      <PanelSuspense>
        <KanbanPanel
          repoPath={content.repoPath}
          file={content.file}
          active={active}
        />
      </PanelSuspense>
    );
  }
  if (content.kind === "diff" && content.repoPath) {
    return (
      <PanelSuspense>
        <DiffInspector repoPath={content.repoPath} active={active} />
      </PanelSuspense>
    );
  }
  if (content.kind === "filetree" && content.repoPath) {
    // Stateless repo data (#167), like diff — no ownership/PTY guard needed.
    return (
      <PanelSuspense>
        <FileTree repoPath={content.repoPath} />
      </PanelSuspense>
    );
  }
  if (content.kind === "scheduled" && content.scheduleId) {
    return <ScheduledPanel scheduleId={content.scheduleId} />;
  }
  if (content.kind === "recurring" && content.recurringId) {
    return <RecurringPanel recurringId={content.recurringId} />;
  }
  // A pending/erroring template panel (#118): loading → live, or error + Retry.
  if (content.kind === "pending" && leafId) {
    return <TemplatePendingPanel leafId={leafId} content={content} />;
  }
  return <div className={styles.placeholder}>Empty panel</div>;
}

export default ItemContent;
