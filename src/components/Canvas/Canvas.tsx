import { type ReactElement, useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Plus, X } from "lucide-react";
import { Group, type Layout, Panel, Separator } from "react-resizable-panels";

import { useStore } from "../../store";
import type {
  CanvasContent,
  CanvasEdge,
  CanvasLeaf,
  CanvasNode,
} from "../../types";
import { removeLeaf, splitLeaf, updateSizes } from "./canvasTree";
import styles from "./Canvas.module.css";

const EDGES: CanvasEdge[] = ["top", "right", "bottom", "left"];

/**
 * The built-in drag source (#46): a palette chip that creates placeholder
 * panels, so the engine is usable standalone. #47 adds the real sources (agents,
 * files, diffs dragged from the sidebar) carrying richer `content` descriptors.
 */
function PaletteChip() {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: "canvas-palette",
    data: {
      content: { kind: "placeholder", label: "Panel" } satisfies CanvasContent,
    },
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`${styles.chip} ${isDragging ? styles.chipDragging : ""}`}
      {...attributes}
      {...listeners}
    >
      <Plus size={14} strokeWidth={1.5} />
      Panel
    </button>
  );
}

/** Empty-canvas center target — the first drop creates the first panel. */
function CenterDrop() {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas-center" });
  return (
    <div
      ref={setNodeRef}
      className={`${styles.center} ${isOver ? styles.centerOver : ""}`}
    >
      <p className={styles.centerHint}>Drag a panel here to start</p>
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
  dragging,
  onClose,
}: {
  leaf: CanvasLeaf;
  dragging: boolean;
  onClose: () => void;
}) {
  return (
    <div className={styles.panel}>
      <header className={styles.panelHeader}>
        <span className={styles.panelTitle}>
          {leaf.content.label ?? leaf.content.kind}
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
      <div className={styles.panelBody}>
        {/* #46 placeholder; #47 renders real content by leaf.content.kind. */}
        <span className={styles.placeholder}>Empty panel</span>
      </div>
      {dragging && (
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
 * Canvas (#46): a recursive binary split-panel workspace. The layout is a BSP
 * tree (persisted); dropping the palette chip onto a panel edge splits it
 * (recursively), borders resize via react-resizable-panels, and panels close
 * (collapsing their split). The tree ops are the pure `canvasTree` helpers, so
 * relayout keeps unaffected branches' identity and the #18 pool can keep any
 * future terminal content alive across relayout. Content + sidebar drag-in is #47.
 */
function Canvas() {
  const layout = useStore((s) => s.canvasLayout);
  const setCanvasLayout = useStore((s) => s.setCanvasLayout);
  const [dragging, setDragging] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // react-resizable-panels' `onLayoutChanged` fires once, after the resize ends,
  // with a { panelId: flexGrow } map — commit those two values to the split.
  const commitResize = (
    splitId: string,
    aId: string,
    bId: string,
    next: Layout,
  ) => {
    const a = next[aId];
    const b = next[bId];
    if (typeof a !== "number" || typeof b !== "number") return;
    const tree = useStore.getState().canvasLayout;
    if (tree) setCanvasLayout(updateSizes(tree, splitId, [a, b]));
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDragging(false);
    const { active, over } = event;
    if (!over) return;
    const content = (
      active.data.current as { content?: CanvasContent } | undefined
    )?.content;
    if (!content) return;
    const overId = String(over.id);
    if (overId === "canvas-center") {
      setCanvasLayout({ type: "leaf", id: crypto.randomUUID(), content });
      return;
    }
    const match = /^panel:(.+):(left|right|top|bottom)$/.exec(overId);
    const current = useStore.getState().canvasLayout;
    if (match && current) {
      const panelId = match[1] as string;
      const edge = match[2] as CanvasEdge;
      setCanvasLayout(
        splitLeaf(
          current,
          panelId,
          edge,
          content,
          crypto.randomUUID(),
          crypto.randomUUID(),
        ),
      );
    }
  };

  const closePanel = (leafId: string) => {
    const current = useStore.getState().canvasLayout;
    if (current) setCanvasLayout(removeLeaf(current, leafId));
  };

  const renderNode = (node: CanvasNode): ReactElement => {
    if (node.type === "leaf") {
      return (
        <LeafPanel
          key={node.id}
          leaf={node}
          dragging={dragging}
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
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={() => setDragging(true)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(false)}
      >
        <div className={styles.toolbar}>
          <PaletteChip />
          <span className={styles.hint}>
            Drag a panel onto an edge to split, or close panels with ×.
          </span>
        </div>
        <div className={styles.area}>
          {layout ? renderNode(layout) : <CenterDrop />}
        </div>
      </DndContext>
    </div>
  );
}

export default Canvas;
