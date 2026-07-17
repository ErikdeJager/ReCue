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
import { Grid2x2, type LucideIcon, X } from "lucide-react";
import { Group, type Layout, Panel, Separator } from "react-resizable-panels";

import { pickFile } from "../../ipc";
import { noAutoCapitalize } from "../../inputProps";
import { useStore } from "../../store";
import type { CanvasContent, CanvasEdge, CanvasNode } from "../../types";
import canvasStyles from "../Canvas/Canvas.module.css";
import {
  equalize,
  leafCount,
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
  // File/Kanban block path mode (#224): relative (from the chosen folder, default) or
  // absolute (a full filesystem path). Absent → relative for back-compat.
  const fileMode = content.filePathMode ?? "relative";
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
          <label className={`${styles.configField} ${styles.configFieldGrow}`}>
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
          <div className={styles.configField}>
            {/* Relative ⇄ absolute path choice (#224): relative joins to the folder
                chosen at use time (subfolders allowed); absolute is a full filesystem
                path opened via its own parent dir as root (the #163 pattern). */}
            <span className={styles.configLabel}>Path</span>
            <div
              className={styles.pathModeRow}
              role="radiogroup"
              aria-label="Path mode"
            >
              <button
                type="button"
                className={`${styles.pathModeBtn} ${fileMode === "relative" ? styles.pathModeActive : ""}`}
                onClick={() => onConfig({ filePathMode: "relative" })}
                role="radio"
                aria-checked={fileMode === "relative"}
              >
                Relative
              </button>
              <button
                type="button"
                className={`${styles.pathModeBtn} ${fileMode === "absolute" ? styles.pathModeActive : ""}`}
                onClick={() => onConfig({ filePathMode: "absolute" })}
                role="radio"
                aria-checked={fileMode === "absolute"}
              >
                Absolute
              </button>
            </div>
            {fileMode === "relative" ? (
              <>
                <input
                  className={styles.configLine}
                  {...noAutoCapitalize}
                  type="text"
                  value={content.file ?? ""}
                  placeholder="e.g. src/README.md"
                  onChange={(event) =>
                    onConfig({ file: event.currentTarget.value })
                  }
                  aria-label="Relative file path"
                />
                <span className={styles.helper}>
                  Resolved from the project root you pick when you use this
                  template; subfolders are allowed — e.g.{" "}
                  <code>src/components/App.tsx</code>.
                </span>
              </>
            ) : (
              <>
                <div className={styles.pathInputRow}>
                  <input
                    className={styles.configLine}
                    {...noAutoCapitalize}
                    type="text"
                    value={content.file ?? ""}
                    placeholder="e.g. /Users/you/notes.md"
                    onChange={(event) =>
                      onConfig({ file: event.currentTarget.value })
                    }
                    aria-label="Absolute file path"
                  />
                  <button
                    type="button"
                    className={styles.browseBtn}
                    onClick={() => {
                      void pickFile().then((picked) => {
                        if (picked) onConfig({ file: picked });
                      });
                    }}
                  >
                    Browse…
                  </button>
                </div>
                <span className={styles.helper}>
                  Absolute path from the filesystem root, e.g.{" "}
                  <code>/Users/you/notes.md</code> or{" "}
                  <code>C:\Users\you\notes.md</code>. This template only
                  resolves on a machine where that file exists.
                </span>
              </>
            )}
          </div>
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
  // "Save current canvas as template…" (#187) seeds a brand-new template from the
  // active canvas's mapped block tree; used only when not editing an existing one.
  const seed = useStore((s) => s.templateEditorSeed);
  const seedName = useStore((s) => s.templateEditorSeedName);

  // Draft state seeded once at mount; the layout is deep-cloned so edits don't
  // touch the stored template (or the live canvas seed) until Save.
  const [name, setName] = useState(() => existing?.name ?? seedName ?? "");
  const [layout, setLayout] = useState<CanvasNode | null>(() => {
    const source = existing?.layout ?? seed;
    return source ? (JSON.parse(JSON.stringify(source)) as CanvasNode) : null;
  });
  const [dragActive, setDragActive] = useState(false);
  // One-shot remount nonce for "Distribute panels evenly" (#223): bumped only by the
  // equalize action so the BSP surface re-reads each Group's initial-only
  // `defaultLayout` from the now-equalized sizes. Drag-resize never bumps it, so
  // interactive resizing is undisturbed. The editor's blocks are inert (no terminal
  // pool), so a remount is harmless — unlike the live canvas's imperative approach.
  const [equalizeNonce, setEqualizeNonce] = useState(0);
  // Nothing to distribute with fewer than 2 panels — mirrors the live canvas's gate.
  const canEqualize = layout ? leafCount(layout) >= 2 : false;

  const distribute = () => {
    setLayout((l) => (l ? equalize(l) : l));
    setEqualizeNonce((n) => n + 1);
  };

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
          {/* Distribute panels evenly (#223): the same op + icon/label as the live
              Canvas (#186), rebalancing the template's blocks to equal area. */}
          <button
            type="button"
            className={`modal-btn modal-btn-neutral ${styles.distributeBtn}`}
            onClick={distribute}
            disabled={!canEqualize}
            title="Distribute panels evenly"
            aria-label="Distribute panels evenly"
          >
            <Grid2x2 size={14} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            className="modal-btn modal-btn-neutral"
            onClick={close}
          >
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn modal-btn-primary"
            onClick={onSave}
          >
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
            {/* Keyed on the equalize nonce (#223) so a "Distribute panels evenly"
                click remounts the BSP surface, forcing each Group to re-read its
                initial-only `defaultLayout` from the equalized sizes. A normal
                drag-resize doesn't bump the nonce, so it never remounts here. */}
            <div className={canvasStyles.area} key={equalizeNonce}>
              {layout ? renderNode(layout) : <CenterDrop />}
            </div>
          </div>
        </DndContext>
      </div>
    </div>
  );
}

export default TemplateEditor;
