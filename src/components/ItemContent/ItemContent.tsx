import { useSessionOwners } from "../../ownership";
import { useStore } from "../../store";
import type { CanvasContent } from "../../types";
import { ownedHere } from "../../windowContext";
import { sameItem } from "../Canvas/canvasDrop";
import TemplatePendingPanel from "../Canvas/TemplatePendingPanel";
import DetachedNote from "../DetachedNote/DetachedNote";
import DiffInspector from "../DiffInspector/DiffInspector";
import FileTree from "../FileTree/FileTree";
import FileViewer from "../FileViewer/FileViewer";
import KanbanPanel from "../Kanban/KanbanPanel";
import MaximizedNote from "../MaximizedNote/MaximizedNote";
import RecurringPanel from "../RecurringPanel/RecurringPanel";
import ScheduledPanel from "../ScheduledPanel/ScheduledPanel";
import Terminal from "../Terminal/Terminal";
import styles from "./ItemContent.module.css";

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
      <FileViewer
        repoPath={content.repoPath}
        file={content.file}
        active={active}
      />
    );
  }
  if (content.kind === "kanban" && content.repoPath && content.file) {
    return (
      <KanbanPanel
        repoPath={content.repoPath}
        file={content.file}
        active={active}
      />
    );
  }
  if (content.kind === "diff" && content.repoPath) {
    return <DiffInspector repoPath={content.repoPath} active={active} />;
  }
  if (content.kind === "filetree" && content.repoPath) {
    // Stateless repo data (#167), like diff — no ownership/PTY guard needed.
    return <FileTree repoPath={content.repoPath} />;
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
