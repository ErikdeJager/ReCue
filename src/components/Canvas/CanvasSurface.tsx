import { type ReactElement, useEffect } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Copy, ExternalLink, X } from "lucide-react";
import { Group, type Layout, Panel, Separator } from "react-resizable-panels";

import { useSessionOwners } from "../../ownership";
import { repoName, sessionLabel } from "../../paths";
import { repoColor, useStore } from "../../store";
import type {
  CanvasContent,
  CanvasEdge,
  CanvasLeaf,
  CanvasNode,
} from "../../types";
import { IS_MAIN_WINDOW, ownedHere } from "../../windowContext";
import DetachedNote from "../DetachedNote/DetachedNote";
import DiffInspector from "../DiffInspector/DiffInspector";
import FileSwitcher from "../FileSwitcher/FileSwitcher";
import FileViewer from "../FileViewer/FileViewer";
import ScheduledPanel from "../ScheduledPanel/ScheduledPanel";
import Terminal from "../Terminal/Terminal";
import { focusTerminal } from "../Terminal/terminalPool";
import { removeLeaf, updateSizes } from "./canvasTree";
import TemplatePendingPanel from "./TemplatePendingPanel";
import { blockPlaceholderLabel } from "./templateBlocks";
import styles from "./Canvas.module.css";

const EDGES: CanvasEdge[] = ["top", "right", "bottom", "left"];

/** Empty-canvas center target — the first drop creates the first panel. */
function CenterDrop() {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas-center" });
  return (
    <div
      ref={setNodeRef}
      className={`${styles.center} ${isOver ? styles.centerOver : ""}`}
    >
      <p className={styles.centerHint}>
        Drag an agent or file from the sidebar here
      </p>
    </div>
  );
}

/** One of a panel's four edge split-targets, shown only during a drag. */
function EdgeZone({ panelId, edge }: { panelId: string; edge: CanvasEdge }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `panel:${panelId}:${edge}`,
  });
  return (
    <div
      ref={setNodeRef}
      className={`${styles.edge} ${styles[edge]} ${isOver ? styles.edgeOver : ""}`}
    />
  );
}

/** A panel's title + repo (resolved live from the store, so renames/branch
 * changes stay fresh); the content descriptor only stores refs. */
function panelTitle(content: CanvasContent): string {
  if (content.kind === "file") return content.file?.split("/").pop() ?? "File";
  if (content.kind === "diff") return "Diff";
  if (content.kind === "terminal") return "Terminal";
  if (content.kind === "scheduled") return "Scheduled";
  // A pending template panel (#118) shows its block's label until it resolves.
  if (content.kind === "pending")
    return content.block ? blockPlaceholderLabel(content.block) : "Panel";
  return content.label ?? "Panel";
}

function LeafPanel({
  leaf,
  dragActive,
  onClose,
}: {
  leaf: CanvasLeaf;
  dragActive: boolean;
  onClose: () => void;
}) {
  const sessions = useStore((s) => s.sessions);
  const branches = useStore((s) => s.branches);
  const repoColors = useStore((s) => s.repoColors);
  const activeLeafId = useStore((s) => s.activeLeafId);
  const setActiveLeaf = useStore((s) => s.setActiveLeaf);
  const copyToClipboard = useStore((s) => s.copyToClipboard);
  const setLeafFile = useStore((s) => s.setLeafFile);
  const owners = useSessionOwners();
  const isActive = leaf.id === activeLeafId;

  const content = leaf.content;
  const session =
    content.kind === "agent"
      ? sessions.find((s) => s.id === content.sessionId)
      : undefined;
  const repoPath = content.repoPath ?? session?.repoPath ?? "";
  const branch = branches[repoPath] ?? "";
  // Agent panels (#95) render only their primary label (name if set, else branch) —
  // a single line, no subtitle and no repo dot (see below). File/diff/terminal panels
  // keep their filename/"Diff" title + repo·branch context + dot.
  // The #100 "auto-name" setting gates claude's auto-title (#97); off → branch.
  const autoNameOn = useStore((s) => s.settings.autoName);
  const agentLabel =
    content.kind === "agent"
      ? sessionLabel(
          session?.name,
          autoNameOn ? session?.autoName : null,
          branch || repoName(repoPath),
        )
      : null;
  const titleText = agentLabel ? agentLabel.primary : panelTitle(content);
  // Agent panels (#95) drop the subtitle line; non-agent panels keep repo·branch.
  const metaText = agentLabel
    ? null
    : repoPath
      ? `${repoName(repoPath)}${branch ? ` · ${branch}` : ""}`
      : null;

  // When this panel becomes the keyboard-focused one (#76), focus its terminal so
  // subsequent keystrokes go there; non-terminal panels just take the highlight.
  // No-op when the PTY is owned by another window (#84).
  useEffect(() => {
    if (
      isActive &&
      (content.kind === "agent" || content.kind === "terminal") &&
      content.sessionId
    ) {
      focusTerminal(content.sessionId);
    }
  }, [isActive, content.kind, content.sessionId]);

  const renderContent = (): ReactElement => {
    if (content.kind === "agent" && content.sessionId) {
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
        <FileViewer repoPath={content.repoPath} file={content.file} active />
      );
    }
    if (content.kind === "diff" && content.repoPath) {
      return <DiffInspector repoPath={content.repoPath} active />;
    }
    if (content.kind === "scheduled" && content.scheduleId) {
      return <ScheduledPanel scheduleId={content.scheduleId} />;
    }
    // A pending/erroring template panel (#118): loading → live, or error + Retry.
    if (content.kind === "pending") {
      return <TemplatePendingPanel leafId={leaf.id} content={content} />;
    }
    return <div className={styles.placeholder}>Empty panel</div>;
  };

  return (
    <div
      className={`${styles.panel} ${isActive ? styles.panelActive : ""}`}
      onPointerDown={() => setActiveLeaf(leaf.id)}
    >
      <header className={styles.panelHeader}>
        <span className={styles.panelTitleBlock}>
          {/* Agent panels drop the repo dot (#95); non-agent panels keep it. */}
          {repoPath && content.kind !== "agent" && (
            <span
              className={styles.panelDot}
              style={{ background: repoColor(repoPath, repoColors) }}
            />
          )}
          {/* File panels: the filename is a switcher (#90) — pick another file in
              this repo to swap the viewer in place. Other kinds keep a plain title. */}
          {content.kind === "file" && content.repoPath && content.file ? (
            <FileSwitcher
              repoPath={content.repoPath}
              file={content.file}
              onPick={(f) => setLeafFile(leaf.id, f)}
              nameClassName={styles.panelTitle}
            />
          ) : (
            <span className={styles.panelTitle}>{titleText}</span>
          )}
          {metaText && <span className={styles.panelMeta}>{metaText}</span>}
          {/* Worktree agent (#74/#96): it inherits the parent repo's color, so a
              text badge (mirroring the sidebar) is the sole worktree cue. */}
          {content.kind === "agent" && session?.worktreeParent && (
            <span className={styles.worktreeBadge}>worktree</span>
          )}
        </span>
        <span className={styles.panelActions}>
          {/* Copy `claude --resume <id>` (#28) — agents only, re-homed here
              post-Focus (#86). Non-agent panels have no resumable session. */}
          {content.kind === "agent" && session && (
            <button
              type="button"
              className={styles.panelClose}
              onClick={() =>
                void copyToClipboard(
                  `claude --resume ${session.id}`,
                  "resume command",
                )
              }
              title="Copy resume command (claude --resume <id>)"
              aria-label="Copy resume command"
            >
              <Copy size={14} strokeWidth={1.5} />
            </button>
          )}
          <button
            type="button"
            className={styles.panelClose}
            onClick={onClose}
            title="Close panel"
            aria-label="Close panel"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </span>
      </header>
      <div className={styles.panelBody}>{renderContent()}</div>
      {dragActive && (
        <div className={styles.edges}>
          {EDGES.map((edge) => (
            <EdgeZone key={edge} panelId={leaf.id} edge={edge} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Shown in the **main** window when its active tab is one that's been popped out
 * to its own window (#84) — the main window never renders a detached canvas's
 * PTYs, so it offers to raise / bring back that window instead. */
function DetachedCanvasNote({ canvasId }: { canvasId: string }) {
  const focusCanvasWindow = useStore((s) => s.focusCanvasWindow);
  return (
    <div className={styles.detachedNote}>
      <p className={styles.detachedText}>
        This canvas is open in its own window.
      </p>
      <button
        type="button"
        className={styles.detachedBtn}
        onClick={() => focusCanvasWindow(canvasId)}
      >
        <ExternalLink size={14} strokeWidth={1.5} /> Focus window
      </button>
    </div>
  );
}

/**
 * The Canvas BSP layout surface (#46/#47/#84): renders the active tab's recursive
 * split-panel tree of real content — agent terminals (#18 pool), file viewers
 * (#44), diff viewers (#39), shell terminals (#72). Shared by the main Canvas view
 * (under the tab strip) and a detached canvas window (#84), which both drive it via
 * the store's `activeCanvasId`. Splitting/closing use the pure `canvasTree` ops and
 * resizing uses react-resizable-panels. `dragActive` toggles the edge split-zones.
 */
export function CanvasSurface({ dragActive }: { dragActive: boolean }) {
  const canvases = useStore((s) => s.canvases);
  const activeCanvasId = useStore((s) => s.activeCanvasId);
  const detachedCanvasIds = useStore((s) => s.detachedCanvasIds);
  const setActiveCanvasLayout = useStore((s) => s.setActiveCanvasLayout);

  const layout = canvases.find((c) => c.id === activeCanvasId)?.layout ?? null;
  // In the main window, the active tab can (rarely) be a detached canvas — show a
  // note instead of rendering its PTYs in two windows (#84). Gate on IS_MAIN_WINDOW
  // (#98): the detached window forces activeCanvasId to its own (detached) id, so
  // without this guard it would show the note instead of its own panels.
  const activeDetached =
    IS_MAIN_WINDOW && detachedCanvasIds.includes(activeCanvasId);

  // Resize/close fire after a render, so re-derive the active tab's *current*
  // layout from the store rather than closing over `layout`.
  const activeLayout = (): CanvasNode | null => {
    const s = useStore.getState();
    return s.canvases.find((c) => c.id === s.activeCanvasId)?.layout ?? null;
  };

  // `onLayoutChanged` fires once, after a resize ends, with a { panelId: flexGrow }
  // map — commit those two values to the split.
  const commitResize = (
    splitId: string,
    aId: string,
    bId: string,
    next: Layout,
  ) => {
    const a = next[aId];
    const b = next[bId];
    if (typeof a !== "number" || typeof b !== "number") return;
    const tree = activeLayout();
    if (tree) setActiveCanvasLayout(updateSizes(tree, splitId, [a, b]));
  };

  const closePanel = (leafId: string) => {
    const current = activeLayout();
    if (current) setActiveCanvasLayout(removeLeaf(current, leafId));
  };

  const renderNode = (node: CanvasNode): ReactElement => {
    if (node.type === "leaf") {
      return (
        <LeafPanel
          key={node.id}
          leaf={node}
          dragActive={dragActive}
          onClose={() => closePanel(node.id)}
        />
      );
    }
    return (
      <Group
        key={node.id}
        id={node.id}
        className={styles.group}
        orientation={node.dir === "row" ? "horizontal" : "vertical"}
        defaultLayout={{
          [node.a.id]: node.sizes[0],
          [node.b.id]: node.sizes[1],
        }}
        onLayoutChanged={(next) =>
          commitResize(node.id, node.a.id, node.b.id, next)
        }
      >
        <Panel id={node.a.id} minSize="10%">
          {renderNode(node.a)}
        </Panel>
        <Separator className={styles.handle} />
        <Panel id={node.b.id} minSize="10%">
          {renderNode(node.b)}
        </Panel>
      </Group>
    );
  };

  return (
    <div className={styles.area}>
      {activeDetached ? (
        <DetachedCanvasNote canvasId={activeCanvasId} />
      ) : layout ? (
        renderNode(layout)
      ) : (
        <CenterDrop />
      )}
    </div>
  );
}

export default CanvasSurface;
