import { useEffect, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ExternalLink,
  LayoutTemplate,
  Plus,
  X,
} from "lucide-react";

import { useStore } from "../../store";
import type { CanvasTab } from "../../types";
import styles from "./Canvas.module.css";

// How far a tab must be dragged out of the strip (vertically) to tear off into
// its own window (#84). True cross-window drag isn't native to the webview
// (wry#648), so this is a pragmatic gesture: pull a tab down/away and release.
const TEAROFF_THRESHOLD_PX = 50;

/**
 * One canvas tab (#58): click to select, double-click to rename inline (Enter
 * commits, Escape cancels, blur commits), × to close. The tab is a dnd-kit
 * sortable item so the strip reorders by dragging — reusing the #43 pattern. A
 * small activation distance keeps the click (select) working. A pop-out button
 * opens the canvas in its own window (#84); when detached, the tab is marked and
 * its label/pop-out button raise that window instead.
 */
function Tab({ tab, active }: { tab: CanvasTab; active: boolean }) {
  const selectCanvas = useStore((s) => s.selectCanvas);
  const closeCanvas = useStore((s) => s.closeCanvas);
  const renameCanvas = useStore((s) => s.renameCanvas);
  const popOutCanvas = useStore((s) => s.popOutCanvas);
  const focusCanvasWindow = useStore((s) => s.focusCanvasWindow);
  const detached = useStore((s) => s.detachedCanvasIds.includes(tab.id));

  const [editing, setEditing] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      className={`${styles.tab} ${active ? styles.tabActive : ""} ${detached ? styles.tabDetached : ""} ${isDragging ? styles.tabDragging : ""}`}
      style={style}
      role="tab"
      aria-selected={active}
    >
      {editing ? (
        <input
          className={styles.tabInput}
          autoFocus
          defaultValue={tab.name}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              renameCanvas(tab.id, event.currentTarget.value);
              setEditing(false);
            } else if (event.key === "Escape") {
              event.preventDefault();
              setEditing(false);
            }
          }}
          onBlur={(event) => {
            renameCanvas(tab.id, event.currentTarget.value);
            setEditing(false);
          }}
          aria-label="Rename canvas"
        />
      ) : (
        <button
          type="button"
          className={styles.tabLabel}
          // A detached tab's PTYs live in its window (#84): clicking raises that
          // window rather than selecting it as the (non-rendered) active tab.
          onClick={() =>
            detached ? focusCanvasWindow(tab.id) : selectCanvas(tab.id)
          }
          onDoubleClick={() => setEditing(true)}
          title={detached ? `${tab.name} (in window)` : tab.name}
          {...attributes}
          {...listeners}
        >
          {tab.name}
        </button>
      )}
      <button
        type="button"
        className={styles.tabPopOut}
        onClick={() =>
          detached ? focusCanvasWindow(tab.id) : popOutCanvas(tab.id)
        }
        title={detached ? "Focus window" : "Open in new window"}
        aria-label={detached ? "Focus canvas window" : "Open canvas in window"}
      >
        <ExternalLink size={13} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        className={styles.tabClose}
        onClick={() => closeCanvas(tab.id)}
        title="Close canvas"
        aria-label={`Close ${tab.name}`}
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}

/**
 * Canvas tab strip (#58): one tab per canvas (active highlighted), a "+" to add
 * an empty canvas, drag-to-reorder. Its own nested DndContext (like the Overview
 * sortable #43) so tab drags don't clash with the app-level drag-into-canvas
 * context; only the Canvas view mounts at a time, so targets never overlap.
 * Dragging a tab out of the strip tears it off into its own window (#84).
 */
function CanvasTabs() {
  const canvases = useStore((s) => s.canvases);
  const activeCanvasId = useStore((s) => s.activeCanvasId);
  const addCanvas = useStore((s) => s.addCanvas);
  const reorderCanvases = useStore((s) => s.reorderCanvases);
  const popOutCanvas = useStore((s) => s.popOutCanvas);
  const openTemplateEditor = useStore((s) => s.openTemplateEditor);
  const openTemplateManager = useStore((s) => s.openTemplateManager);
  const openTemplateUse = useStore((s) => s.openTemplateUse);
  const hasTemplates = useStore((s) => s.canvasTemplates.length > 0);

  // Templates ▾ menu (#117): a small dropdown near the + with "New template…" /
  // "Manage templates…". Closes on outside-click, Escape, or a selection.
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const templatesRef = useRef<HTMLDivElement>(null);
  const templatesBtnRef = useRef<HTMLButtonElement>(null);
  // The menu is position: fixed, anchored to the button's viewport rect, so it
  // escapes the tab strip's overflow clip (#129): `.tabStrip`'s `overflow-x: auto`
  // forces its computed `overflow-y` to `auto`, which would clip a dropdown sitting
  // below the 34px strip. Mirrors the sidebar context-menu precedent (#31/#54).
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(
    null,
  );
  const toggleTemplates = () => {
    if (!templatesOpen && templatesBtnRef.current) {
      const rect = templatesBtnRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setTemplatesOpen((open) => !open);
  };
  useEffect(() => {
    if (!templatesOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!templatesRef.current?.contains(event.target as Node)) {
        setTemplatesOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTemplatesOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [templatesOpen]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over, delta } = event;
    // Tear-off (#84): a tab dropped outside the strip (no reorder target) and
    // pulled away vertically pops out into its own window. The vertical threshold
    // keeps a horizontal reorder that snapped back from triggering it.
    if (!over || over.id === active.id) {
      if (Math.abs(delta.y) > TEAROFF_THRESHOLD_PX) {
        popOutCanvas(String(active.id));
      }
      return;
    }
    const ids = canvases.map((c) => c.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    reorderCanvases(arrayMove(ids, oldIndex, newIndex));
  };

  return (
    <div className={styles.tabStrip} role="tablist" aria-label="Canvases">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={canvases.map((c) => c.id)}
          strategy={horizontalListSortingStrategy}
        >
          {canvases.map((c) => (
            <Tab key={c.id} tab={c} active={c.id === activeCanvasId} />
          ))}
        </SortableContext>
      </DndContext>
      <button
        type="button"
        className={styles.tabAdd}
        onClick={addCanvas}
        title="New canvas"
        aria-label="New canvas"
      >
        <Plus size={14} strokeWidth={1.5} />
      </button>
      {/* Templates ▾ menu (#117). */}
      <div className={styles.templatesWrap} ref={templatesRef}>
        <button
          type="button"
          ref={templatesBtnRef}
          className={styles.tabAdd}
          onClick={toggleTemplates}
          title="Templates"
          aria-label="Templates"
          aria-haspopup="menu"
          aria-expanded={templatesOpen}
        >
          <LayoutTemplate size={14} strokeWidth={1.5} />
          <ChevronDown size={11} strokeWidth={1.5} />
        </button>
        {templatesOpen && menuPos && (
          <div
            className={styles.templatesMenu}
            role="menu"
            style={{ top: menuPos.top, right: menuPos.right }}
          >
            <button
              type="button"
              className={styles.templatesItem}
              role="menuitem"
              disabled={!hasTemplates}
              onClick={() => {
                setTemplatesOpen(false);
                openTemplateUse();
              }}
            >
              New tab from template…
            </button>
            <button
              type="button"
              className={styles.templatesItem}
              role="menuitem"
              onClick={() => {
                setTemplatesOpen(false);
                openTemplateEditor(null);
              }}
            >
              New template…
            </button>
            <button
              type="button"
              className={styles.templatesItem}
              role="menuitem"
              onClick={() => {
                setTemplatesOpen(false);
                openTemplateManager();
              }}
            >
              Manage templates…
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default CanvasTabs;
