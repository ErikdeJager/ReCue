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
  Grid2x2,
  LayoutTemplate,
  Plus,
  X,
} from "lucide-react";

import { noAutoCapitalize } from "../../inputProps";
import { kbdHint } from "../../platform";
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
  const requestCloseCanvas = useStore((s) => s.requestCloseCanvas);
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
          {...noAutoCapitalize}
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
        onClick={() => requestCloseCanvas(tab.id)}
        title="Close canvas"
        aria-label={`Close ${tab.name}`}
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}

/**
 * A small fixed-position dropdown menu for the tab strip (#205, factored from the
 * #117 Templates menu so the "+" and "Templates ▾" dropdowns don't fight): tracks
 * open state + the anchor rect, and closes on outside-`pointerdown` / Escape. The
 * menu renders `position: fixed` from `menuPos` so it escapes the strip's
 * `overflow-x` clip (#129). One instance per menu.
 */
function useDropdownMenu() {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(
    null,
  );
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen((o) => !o);
  };
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return { open, menuPos, wrapRef, btnRef, toggle, close };
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
  const platform = useStore((s) => s.platform);
  const addCanvas = useStore((s) => s.addCanvas);
  const reorderCanvases = useStore((s) => s.reorderCanvases);
  const popOutCanvas = useStore((s) => s.popOutCanvas);
  const equalizeCanvas = useStore((s) => s.equalizeCanvas);
  const openTemplateEditor = useStore((s) => s.openTemplateEditor);
  const openTemplateEditorFromCanvas = useStore(
    (s) => s.openTemplateEditorFromCanvas,
  );
  const openTemplateManager = useStore((s) => s.openTemplateManager);
  const openTemplateUse = useStore((s) => s.openTemplateUse);
  const hasTemplates = useStore((s) => s.canvasTemplates.length > 0);

  // "Distribute evenly" (#186) is only meaningful with ≥2 panels — i.e. the
  // active canvas's layout is a `split` (a null/leaf layout has nothing to even).
  const activeLayout =
    canvases.find((c) => c.id === activeCanvasId)?.layout ?? null;
  const canEqualize = !!activeLayout && activeLayout.type === "split";
  // "Save current canvas as template…" (#187) needs at least one panel to map.
  const canSaveAsTemplate = !!activeLayout;

  // The "Templates ▾" dropdown (#205/#222): template management plus the "New tab from
  // template…" action (moved back here from the #205 "+" dropdown). A fixed-position
  // menu via useDropdownMenu. The "+" is now a plain new-tab button (no menu).
  const templatesMenu = useDropdownMenu();

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
      {/* "+" → create a new empty canvas tab in one click (#222, reverting the #205
          dropdown). The "from template" entry point lives in the Templates ▾ menu
          below. ⌘T/Ctrl+T (#206) also creates a tab; its hint stays on this tooltip. */}
      <button
        type="button"
        className={styles.tabAdd}
        onClick={() => addCanvas()}
        title={`New tab (${kbdHint(platform, "⌘T", "Ctrl+T")})`}
        aria-label={`New tab (${kbdHint(platform, "⌘T", "Ctrl+T")})`}
      >
        {/* #273: the Plus glyph is a sparse cross, so at size 14/1.5 it reads
            visually smaller than the denser LayoutTemplate/Grid2x2 neighbors. A
            larger 16px glyph + heavier 2px stroke gives it comparable mass while
            the 20px button box (hit-area/hover/disabled) stays unchanged. */}
        <Plus size={16} strokeWidth={2} />
      </button>
      {/* Templates ▾ menu (#117/#205/#222): "New tab from template…" (the primary "use"
          action) plus template management (New / Save current / Manage). */}
      <div className={styles.menuWrap} ref={templatesMenu.wrapRef}>
        <button
          type="button"
          ref={templatesMenu.btnRef}
          className={`${styles.tabAdd} ${styles.tabMenuTrigger}`}
          onClick={templatesMenu.toggle}
          title="Templates"
          aria-label="Templates"
          aria-haspopup="menu"
          aria-expanded={templatesMenu.open}
        >
          <LayoutTemplate size={14} strokeWidth={1.5} />
          <ChevronDown size={11} strokeWidth={1.5} />
        </button>
        {templatesMenu.open && templatesMenu.menuPos && (
          <div
            className={styles.menu}
            role="menu"
            style={{
              top: templatesMenu.menuPos.top,
              right: templatesMenu.menuPos.right,
            }}
          >
            <button
              type="button"
              className={styles.menuItem}
              role="menuitem"
              disabled={!hasTemplates}
              onClick={() => {
                templatesMenu.close();
                openTemplateUse();
              }}
            >
              New tab from template…
            </button>
            <button
              type="button"
              className={styles.menuItem}
              role="menuitem"
              onClick={() => {
                templatesMenu.close();
                openTemplateEditor(null);
              }}
            >
              New template…
            </button>
            <button
              type="button"
              className={styles.menuItem}
              role="menuitem"
              disabled={!canSaveAsTemplate}
              onClick={() => {
                templatesMenu.close();
                openTemplateEditorFromCanvas();
              }}
            >
              Save current canvas as template…
            </button>
            <button
              type="button"
              className={styles.menuItem}
              role="menuitem"
              onClick={() => {
                templatesMenu.close();
                openTemplateManager();
              }}
            >
              Manage templates…
            </button>
          </div>
        )}
      </div>
      {/* "Distribute evenly" (#186): moved to the right edge of the strip (#205)
          via .tabDistribute's margin-left:auto. Rebalances the active canvas's
          panels; disabled when there's nothing to even (<2 panels). */}
      <button
        type="button"
        className={`${styles.tabAdd} ${styles.tabDistribute}`}
        onClick={() => equalizeCanvas()}
        disabled={!canEqualize}
        title="Distribute panels evenly"
        aria-label="Distribute panels evenly"
      >
        <Grid2x2 size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}

export default CanvasTabs;
