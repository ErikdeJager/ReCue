import { type ReactElement } from "react";
import { useDroppable } from "@dnd-kit/core";
import { X } from "lucide-react";
import { Group, type Layout, Panel, Separator } from "react-resizable-panels";

import { repoName, sessionLabel } from "../../paths";
import { repoColor, useStore } from "../../store";
import type {
  CanvasContent,
  CanvasEdge,
  CanvasLeaf,
  CanvasNode,
} from "../../types";
import DiffInspector from "../DiffInspector/DiffInspector";
import FileViewer from "../FileViewer/FileViewer";
import Terminal from "../Terminal/Terminal";
import CanvasTabs from "./CanvasTabs";
import { removeLeaf, updateSizes } from "./canvasTree";
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

  const content = leaf.content;
  const session =
    content.kind === "agent"
      ? sessions.find((s) => s.id === content.sessionId)
      : undefined;
  const repoPath = content.repoPath ?? session?.repoPath ?? "";
  const branch = branches[repoPath] ?? "";
  // Agent panels use the unified label rule (#67): name primary, branch the
  // subtitle (branch primary when unnamed). File/diff panels keep their
  // filename/"Diff" title + repo·branch context.
  const agentLabel =
    content.kind === "agent"
      ? sessionLabel(session?.name, branch || repoName(repoPath))
      : null;
  const titleText = agentLabel ? agentLabel.primary : panelTitle(content);
  const metaText = agentLabel
    ? agentLabel.subtitle
    : repoPath
      ? `${repoName(repoPath)}${branch ? ` · ${branch}` : ""}`
      : null;

  const renderContent = (): ReactElement => {
    if (content.kind === "agent" && content.sessionId) {
      if (!session) {
        return <div className={styles.placeholder}>Session closed.</div>;
      }
      return <Terminal sessionId={content.sessionId} />;
    }
    if (content.kind === "file" && content.repoPath && content.file) {
      return (
        <FileViewer repoPath={content.repoPath} file={content.file} active />
      );
    }
    if (content.kind === "diff" && content.repoPath) {
      return <DiffInspector repoPath={content.repoPath} active />;
    }
    return <div className={styles.placeholder}>Empty panel</div>;
  };

  return (
    <div className={styles.panel}>
      <header className={styles.panelHeader}>
        <span className={styles.panelTitleBlock}>
          {repoPath && (
            <span
              className={styles.panelDot}
              style={{ background: repoColor(repoPath, repoColors) }}
            />
          )}
          <span className={styles.panelTitle}>{titleText}</span>
          {metaText && <span className={styles.panelMeta}>{metaText}</span>}
        </span>
        <button
          type="button"
          className={styles.panelClose}
          onClick={onClose}
          title="Close panel"
          aria-label="Close panel"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
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

/**
 * Canvas (#46/#47): a recursive binary split-panel workspace hosting real
 * content — agent terminals (via the #18 pool), file viewers (#44), and diff
 * viewers (#39). Items are dragged in from the sidebar (#45) via the app-level
 * DndContext; the layout is a persisted BSP tree. Splitting/closing use the pure
 * `canvasTree` ops (identity-preserving), and resizing uses react-resizable-panels.
 * `dragActive` (from the app DndContext) toggles the edge split-zones.
 */
function Canvas({ dragActive }: { dragActive: boolean }) {
  const canvases = useStore((s) => s.canvases);
  const activeCanvasId = useStore((s) => s.activeCanvasId);
  const setActiveCanvasLayout = useStore((s) => s.setActiveCanvasLayout);

  const layout = canvases.find((c) => c.id === activeCanvasId)?.layout ?? null;

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
    <div className={styles.canvas}>
      <CanvasTabs />
      <div className={styles.area}>
        {/* Key the area by tab so switching tabs swaps layouts cleanly; terminals
            survive via the #18 pool (parked on unmount, never disposed here). */}
        {layout ? renderNode(layout) : <CenterDrop />}
      </div>
    </div>
  );
}

export default Canvas;
