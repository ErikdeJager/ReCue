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
import { type LucideIcon, X } from "lucide-react";
import { Group, type Layout, Panel, Separator } from "react-resizable-panels";

import { noAutoCapitalize } from "../../inputProps";
import { useStore } from "../../store";
import type { CanvasContent, CanvasEdge, CanvasNode } from "../../types";
import canvasStyles from "../Canvas/Canvas.module.css";
import {
  removeLeaf,
  splitLeaf,
  updateLeafContent,
  updateSizes,
} from "../Canvas/canvasTree";
import {
  BLOCK_REGISTRY,
  type BlockKind,
  blockDescriptor,
  newBlockContent,
} from "../Canvas/templateBlocks";
import styles from "./TemplateEditor.module.css";

const EDGES: CanvasEdge[] = ["top", "right", "bottom", "left"];

/** Empty-template center target — the first dropped block becomes the first panel. */
function CenterDrop() {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas-center" });
  return (
    <div
      ref={setNodeRef}
      className={`${canvasStyles.center} ${isOver ? canvasStyles.centerOver : ""}`}
    >
      <p className={canvasStyles.centerHint}>
        Drag a block here to start the template
      </p>
    </div>
  );
}

/** One of a panel's four edge split-targets, shown only during a palette drag. */
function EdgeZone({ panelId, edge }: { panelId: string; edge: CanvasEdge }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `panel:${panelId}:${edge}`,
  });
  return (
    <div
      ref={setNodeRef}
      className={`${canvasStyles.edge} ${canvasStyles[edge]} ${isOver ? canvasStyles.edgeOver : ""}`}
    />
  );
}

/** A draggable block in the palette (the only drag source in template mode — there
 * are no live sidebar items to drag in). */
function PaletteChip({
  kind,
  label,
  Icon,
}: {
  kind: BlockKind;
  label: string;
  Icon: LucideIcon;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${kind}`,
    data: { paletteBlock: kind },
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`${styles.chip} ${isDragging ? styles.chipDragging : ""}`}
      {...attributes}
      {...listeners}
    >
      <Icon size={15} strokeWidth={1.5} />
      <span className={styles.chipLabel}>{label}</span>
    </button>
  );
}

/** An inert, labelled block placeholder in the editor (no live PTY/file): the
 * block's icon + label, its inline config (agent prompt / file relative path), and
 * a remove button. Edge split-zones appear while a palette block is being dragged. */
function BlockPanel({
  leaf,
  dragActive,
  onClose,
  onConfig,
}: {
  leaf: { id: string; content: CanvasContent };
  dragActive: boolean;
  onClose: () => void;
  onConfig: (patch: Partial<CanvasContent>) => void;
}) {
  const content = leaf.content;
  const desc = blockDescriptor(content.kind);
  const Icon = desc?.icon;
  const label = desc?.label ?? content.kind;
  return (
    <div className={canvasStyles.panel}>
      <header className={canvasStyles.panelHeader}>
        <span className={canvasStyles.panelTitleBlock}>
          {Icon && (
            <Icon size={13} strokeWidth={1.5} className={styles.blockIcon} />
          )}
          <span className={canvasStyles.panelTitle}>{label}</span>
        </span>
        <span className={canvasStyles.panelActions}>
          <button
            type="button"
            className={canvasStyles.panelClose}
            onClick={onClose}
            title="Remove block"
            aria-label="Remove block"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </span>
      </header>
      <div className={styles.blockBody}>
        {/* Optional custom agent name (#136), gated on liveKind so it's specific to
            new-agent blocks (independent of the single-value BlockConfig). Empty →
            the agent auto-names from claude's ai-title (#97). */}
        {desc?.liveKind === "agent" && (
          <label className={styles.configField}>
            <span className={styles.configLabel}>Agent name (optional)</span>
            <input
              className={styles.configLine}
              {...noAutoCapitalize}
              type="text"
              value={content.name ?? ""}
              placeholder="e.g. Backend"
              onChange={(event) =>
                onConfig({ name: event.currentTarget.value })
              }
              aria-label="Agent name"
            />
            <span className={styles.helper}>
              Leave empty to use Claude&apos;s auto-generated title.
            </span>
          </label>
        )}
        {desc?.config === "prompt" && (
          <label className={styles.configField}>
            <span className={styles.configLabel}>
              Initial prompt (optional)
            </span>
            <textarea
              className={styles.configInput}
              {...noAutoCapitalize}
              value={content.prompt ?? ""}
              placeholder="Sent to the agent when the template is used…"
              rows={4}
              onChange={(event) =>
                onConfig({ prompt: event.currentTarget.value })
              }
              aria-label="Initial prompt"
            />
          </label>
        )}
        {desc?.config === "file" && (
          <label className={styles.configField}>
            <span className={styles.configLabel}>File (relative path)</span>
            <input
              className={styles.configLine}
              {...noAutoCapitalize}
              type="text"
              value={content.file ?? ""}
              placeholder="e.g. README.md"
              onChange={(event) =>
                onConfig({ file: event.currentTarget.value })
              }
              aria-label="File relative path"
            />
            <span className={styles.helper}>
              Resolved inside the folder you pick when you use this template —
              e.g. type <code>README.md</code> to open that folder&apos;s
              README.
            </span>
          </label>
        )}
        {desc?.config === "none" && (
          <p className={styles.blockNote}>
            Acts on the folder you choose when you use this template.
          </p>
        )}
      </div>
      {dragActive && (
        <div className={canvasStyles.edges}>
          {EDGES.map((edge) => (
            <EdgeZone key={edge} panelId={leaf.id} edge={edge} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Canvas-template editor (#117) — a full-screen "separate screen" that reuses the
 * Canvas BSP surface (`canvasTree` ops + react-resizable-panels) so building a
 * template feels exactly like building a canvas. A block **palette** is the only
 * drag source (no live sidebar items in template mode); blocks drop into the center
 * or onto panel edges to split, borders resize, panels close. Each block is an
 * inert, configurable placeholder — **no live PTY/file is created**. Save persists
 * to the separate `canvas_templates` blob (the `canvases` blob is untouched).
 *
 * Mounted only while open (App gates on `templateEditorOpen`), so the draft state
 * is seeded fresh from the edited template (or empty) on each open.
 */
function TemplateEditor() {
  const editingId = useStore((s) => s.templateEditorId);
  const templates = useStore((s) => s.canvasTemplates);
  const close = useStore((s) => s.closeTemplateEditor);
  const saveTemplate = useStore((s) => s.saveTemplate);

  const existing = editingId
    ? templates.find((t) => t.id === editingId)
    : undefined;

  // Draft state seeded once at mount; the layout is deep-cloned so edits don't
  // touch the stored template until Save.
  const [name, setName] = useState(() => existing?.name ?? "");
  const [layout, setLayout] = useState<CanvasNode | null>(() =>
    existing?.layout
      ? (JSON.parse(JSON.stringify(existing.layout)) as CanvasNode)
      : null,
  );
  const [dragActive, setDragActive] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    setDragActive(false);
    const { active, over } = event;
    if (!over) return;
    const kind = active.data.current?.paletteBlock as BlockKind | undefined;
    if (!kind) return;
    const content = newBlockContent(kind);
    const overId = String(over.id);
    if (overId === "canvas-center") {
      setLayout({ type: "leaf", id: crypto.randomUUID(), content });
      return;
    }
    const match = /^panel:(.+):(left|right|top|bottom)$/.exec(overId);
    if (match && layout) {
      setLayout(
        splitLeaf(
          layout,
          match[1] as string,
          match[2] as CanvasEdge,
          content,
          crypto.randomUUID(),
          crypto.randomUUID(),
        ),
      );
    }
  };

  const commitResize = (
    splitId: string,
    aId: string,
    bId: string,
    next: Layout,
  ) => {
    const a = next[aId];
    const b = next[bId];
    if (typeof a !== "number" || typeof b !== "number") return;
    setLayout((l) => (l ? updateSizes(l, splitId, [a, b]) : l));
  };

  const renderNode = (node: CanvasNode): ReactElement => {
    if (node.type === "leaf") {
      return (
        <BlockPanel
          key={node.id}
          leaf={node}
          dragActive={dragActive}
          onClose={() => setLayout((l) => (l ? removeLeaf(l, node.id) : null))}
          onConfig={(patch) =>
            setLayout((l) => (l ? updateLeafContent(l, node.id, patch) : l))
          }
        />
      );
    }
    return (
      <Group
        key={node.id}
        id={node.id}
        className={canvasStyles.group}
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
        <Separator className={canvasStyles.handle} />
        <Panel id={node.b.id} minSize="10%">
          {renderNode(node.b)}
        </Panel>
      </Group>
    );
  };

  const onSave = () => {
    saveTemplate(name, layout, editingId);
    close();
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.editor}>
        <header className={styles.toolbar}>
          <span className={styles.eyebrow}>
            {existing ? "Edit template" : "New template"}
          </span>
          <input
            className={styles.nameInput}
            {...noAutoCapitalize}
            value={name}
            placeholder="Template name…"
            onChange={(event) => setName(event.currentTarget.value)}
            aria-label="Template name"
          />
          <span className={styles.spacer} />
          <button type="button" className={styles.cancelBtn} onClick={close}>
            Cancel
          </button>
          <button type="button" className={styles.saveBtn} onClick={onSave}>
            Save template
          </button>
        </header>
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={() => setDragActive(true)}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragActive(false)}
        >
          <div className={styles.workspace}>
            <aside className={styles.palette}>
              <p className={styles.paletteTitle}>Blocks</p>
              {BLOCK_REGISTRY.map((b) => (
                <PaletteChip
                  key={b.kind}
                  kind={b.kind}
                  label={b.label}
                  Icon={b.icon}
                />
              ))}
              <p className={styles.paletteHint}>
                Drag a block into the layout, configure it, then Save. Blocks
                run when you use the template — nothing is launched here.
              </p>
            </aside>
            <div className={canvasStyles.area}>
              {layout ? renderNode(layout) : <CenterDrop />}
            </div>
          </div>
        </DndContext>
      </div>
    </div>
  );
}

export default TemplateEditor;
