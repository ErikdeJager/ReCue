import { type ReactElement, useEffect, useRef } from "react";
import { DragOverlay, useDraggable, useDroppable } from "@dnd-kit/core";
import {
  Copy,
  ExternalLink,
  GitFork,
  GripVertical,
  Maximize2,
  X,
} from "lucide-react";
import {
  Group,
  type GroupImperativeHandle,
  type Layout,
  Panel,
  Separator,
} from "react-resizable-panels";

import { FORK_UNAVAILABLE_REASON, repoName, sessionLabel } from "../../paths";
import { repoColor, useStore } from "../../store";
import type { CanvasEdge, CanvasLeaf, CanvasNode } from "../../types";
import { IS_MAIN_WINDOW } from "../../windowContext";
import FileSwitcher from "../FileSwitcher/FileSwitcher";
import ItemContent from "../ItemContent/ItemContent";
import { itemTitle, panelTitle } from "../ItemContent/itemTitle";
import OpenViewButton from "../OpenViewButton/OpenViewButton";
import WorktreeViewsBadge from "../WorktreeViewsBadge/WorktreeViewsBadge";
import { focusTerminal } from "../Terminal/terminalPool";
import {
  collectLeaves,
  collectSplits,
  displayedLayout,
  removeLeaf,
  updateSizes,
} from "./canvasTree";
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
  const forkSession = useStore((s) => s.forkSession);
  const setLeafFile = useStore((s) => s.setLeafFile);
  const setLeafFileAbsolute = useStore((s) => s.setLeafFileAbsolute);
  const maximizeItem = useStore((s) => s.maximizeItem);
  const isActive = leaf.id === activeLeafId;

  // Drag source for reorder/reposition (#135): the **whole header bar** carries the
  // listeners (#144, mirroring Overview #70) — the FileSwitcher (#90) + fork/copy/
  // close buttons stop pointerdown so they stay clickable. The 4px PointerSensor
  // activation constraint keeps a click (select) from dragging. At drag start the
  // panel is **lifted out** of the layout (#155, App/CanvasWindow `onDragStart` →
  // `beginCanvasLift`): the surface renders a derived layout without this leaf so
  // the others reflow and a `<DragOverlay>` ghost follows the cursor; a drop commits
  // it to the target edge, while Esc / a drop on nothing restores it in place.
  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setDragRef,
  } = useDraggable({
    id: `move:${leaf.id}`,
    data: { kind: "move-leaf", leafId: leaf.id },
  });

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

  return (
    <div
      className={`${styles.panel} ${isActive ? styles.panelActive : ""}`}
      onPointerDown={() => setActiveLeaf(leaf.id)}
    >
      {/* The whole header bar is the drag handle (#144, mirroring Overview #70):
          the dnd-kit move listeners live on the <header>, so grabbing anywhere on
          the bar reorders/repositions the panel (#135). The grip is just a visual
          hint; the panelActions group + the FileSwitcher stop pointerdown so they
          stay clickable and never start a drag. */}
      <header
        className={styles.panelHeader}
        ref={setDragRef}
        {...dragAttributes}
        {...dragListeners}
      >
        <span className={styles.panelTitleBlock}>
          {/* Non-interactive "this bar is draggable" hint (#144). */}
          <span
            className={styles.panelGrip}
            aria-hidden
            title="Drag to move panel"
          >
            <GripVertical size={14} strokeWidth={1.5} />
          </span>
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
            // The filename switcher (#90) stays clickable — stop pointerdown so it
            // opens the picker instead of starting a header drag (#144).
            <span
              className={styles.panelSwitcher}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <FileSwitcher
                repoPath={content.repoPath}
                file={content.file}
                onPick={(f) => setLeafFile(leaf.id, f)}
                onPickAbsolute={(repo, f) =>
                  setLeafFileAbsolute(leaf.id, repo, f)
                }
                nameClassName={styles.panelTitle}
              />
            </span>
          ) : (
            // Tooltip shows the full title when truncated (#146).
            <span className={styles.panelTitle} title={titleText}>
              {titleText}
            </span>
          )}
          {metaText && <span className={styles.panelMeta}>{metaText}</span>}
          {/* Worktree agent (#74/#96): the "worktree" cue is a clickable badge
              (#164) opening worktree-scoped add-view actions (`repoPath` is the
              worktree folder). */}
          {content.kind === "agent" && session?.worktreeParent && (
            <WorktreeViewsBadge repoPath={session.repoPath} />
          )}
          {/* A fork (#126) shares the source's auto-title — a badge distinguishes them. */}
          {content.kind === "agent" && session?.forkedFrom && (
            <span className={styles.worktreeBadge}>fork</span>
          )}
        </span>
        <span
          className={styles.panelActions}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {/* "Open view" in the agent's folder (#165) — normal agents only; a
              worktree agent uses its clickable badge (#164) instead. */}
          {content.kind === "agent" && session && !session.worktreeParent && (
            <OpenViewButton repoPath={repoPath} className={styles.panelClose} />
          )}
          {/* "Open view or start a session" in a non-agent panel's folder (#177)
              — file / diff / kanban / filetree / terminal, matching where agents
              have it. Scheduled / pending panels are excluded. */}
          {repoPath &&
            (content.kind === "file" ||
              content.kind === "diff" ||
              content.kind === "kanban" ||
              content.kind === "filetree" ||
              content.kind === "terminal") && (
              <OpenViewButton
                repoPath={repoPath}
                className={styles.panelClose}
              />
            )}
          {/* Fork the conversation into a new parallel session (#126) — agents only.
              Gated (#138): unavailable until the source has a real turn to fork. */}
          {content.kind === "agent" && session && (
            <button
              type="button"
              className={styles.panelClose}
              onClick={() => {
                if (session.forkable !== false) void forkSession(session.id);
              }}
              aria-disabled={session.forkable === false}
              title={
                session.forkable === false
                  ? FORK_UNAVAILABLE_REASON
                  : "Fork conversation into a new parallel session"
              }
              aria-label="Fork conversation"
            >
              <GitFork size={14} strokeWidth={1.5} />
            </button>
          )}
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
          {/* Maximize into big mode (#157) — every item except a pending template
              panel (no stable content to maximize yet). */}
          {content.kind !== "pending" && (
            <button
              type="button"
              className={styles.panelClose}
              onClick={() => maximizeItem(content)}
              title="Open in big mode"
              aria-label="Open in big mode"
            >
              <Maximize2 size={14} strokeWidth={1.5} />
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
      <div className={styles.panelBody}>
        <ItemContent content={content} active leafId={leaf.id} />
      </div>
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

/** The lightweight preview that follows the cursor while a panel is lifted (#155).
 * Required because the lifted panel's real DOM node is removed during the drag, so
 * dnd-kit has nothing of its own to render as the drag image. Reads the leaf's
 * content from the store and shows the same title the header would. */
function PanelDragGhost({ leafId }: { leafId: string }) {
  const canvases = useStore((s) => s.canvases);
  const sessions = useStore((s) => s.sessions);
  const branches = useStore((s) => s.branches);
  const autoNameOn = useStore((s) => s.settings.autoName);
  const leaf = canvases
    .flatMap((c) => collectLeaves(c.layout))
    .find((l) => l.id === leafId);
  if (!leaf) return null;
  const title = itemTitle(leaf.content, sessions, branches, autoNameOn);
  return (
    <div className={styles.dragGhost}>
      <GripVertical size={14} strokeWidth={1.5} aria-hidden />
      <span className={styles.dragGhostTitle} title={title}>
        {title}
      </span>
    </div>
  );
}

/** The Canvas drag overlay (#155): renders the {@link PanelDragGhost} while a panel
 * is lifted, nothing otherwise (sidebar→Canvas content drags keep their default
 * behavior). Placed inside each window's `DndContext` (main + detached, #84). */
export function CanvasDragOverlay() {
  const liftedLeaf = useStore((s) => s.liftedLeaf);
  return (
    <DragOverlay dropAnimation={null}>
      {liftedLeaf ? <PanelDragGhost leafId={liftedLeaf.leafId} /> : null}
    </DragOverlay>
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
  const equalizeCanvas = useStore((s) => s.equalizeCanvas);
  const liftedLeaf = useStore((s) => s.liftedLeaf);

  const rawLayout =
    canvases.find((c) => c.id === activeCanvasId)?.layout ?? null;

  // Imperative handles of the live Groups, keyed by split id (#186). A Group's
  // `defaultLayout` is initial-only and can't re-apply to a mounted Group, so the
  // equalize action (the first size-only programmatic change) commits the new tree
  // to the store and this effect pushes the sizes into each Group via `setLayout`
  // — remount-free, so a busy agent terminal keeps its scrollback (the #18 pool is
  // untouched). The "already matches" guard makes it a no-op on user drag-resize
  // (the store already holds the dragged values) and on structural changes (a
  // remounted Group's `defaultLayout` is already correct), so real work happens
  // only right after an equalize. Driven off `rawLayout` (the persisted tree); a
  // transient drag-lift doesn't change it, so the effect doesn't fire mid-lift.
  const groupHandles = useRef<Map<string, GroupImperativeHandle>>(new Map());
  useEffect(() => {
    for (const split of collectSplits(rawLayout)) {
      const handle = groupHandles.current.get(split.id);
      if (!handle) continue;
      const cur = handle.getLayout();
      const a = cur[split.aId];
      const b = cur[split.bId];
      if (
        typeof a === "number" &&
        typeof b === "number" &&
        Math.abs(a - split.sizes[0]) < 0.5 &&
        Math.abs(b - split.sizes[1]) < 0.5
      ) {
        continue; // already at the target sizes → don't fight the live Group
      }
      handle.setLayout({
        [split.aId]: split.sizes[0],
        [split.bId]: split.sizes[1],
      });
    }
  }, [rawLayout]);
  // While a panel is lifted (#155, drag in progress), render a derived layout with
  // that leaf removed so the rest reflow and the lifted panel can't self-target;
  // the persisted layout is untouched (commit/cancel handle the write/restore).
  const layout = displayedLayout(
    rawLayout,
    liftedLeaf?.canvasId === activeCanvasId ? liftedLeaf.leafId : null,
  );
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
        groupRef={(handle) => {
          if (handle) groupHandles.current.set(node.id, handle);
          else groupHandles.current.delete(node.id);
        }}
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
        {/* Double-click the border to distribute this region's panels evenly
            (#186). We own the gesture (`disableDoubleClick` suppresses the lib's
            built-in, which only resets to a Panel `defaultSize` we never set). */}
        <Separator
          className={styles.handle}
          disableDoubleClick
          onDoubleClick={() => equalizeCanvas(node.id)}
          title="Double-click to distribute panels evenly"
        />
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
