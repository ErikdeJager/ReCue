import { useEffect, useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import { useOsFileDrop } from "../../osFileDrop";
import { prefetchDeferredChunks } from "../../prefetch";
import { useStore } from "../../store";
import { useKeyboardNav } from "../../useKeyboardNav";
import { DETACHED_CANVAS_ID, ownedHere } from "../../windowContext";
import BigModeModal from "../BigMode/BigModeModal";
import { applyCanvasLiftEnd } from "../Canvas/canvasDrop";
import { computeSessionOwners, sessionIdsInLayout } from "../Canvas/canvasTree";
import CanvasSurface, { CanvasDragOverlay } from "../Canvas/CanvasSurface";
import { reconcileTerminals } from "../Terminal/terminalPool";
import Toaster from "../Toaster/Toaster";
import WaveBackground from "../WaveBackground/WaveBackground";
import { waveCovered } from "../WaveBackground/wavePresets";
import styles from "./CanvasWindow.module.css";

/**
 * The detached canvas window (#84): a canvas-only view — the BSP layout surface
 * (shared `CanvasSurface`) under a minimal header showing the tab name, with no
 * sidebar / Overview / tab strip. It runs the same store as the main window
 * (its own instance in this document): `init()` subscribes to the global session
 * events and loads the synced canvases, so its terminal pool renders the same
 * backend PTYs. It owns (renders) the agents in *its* canvas; the main window
 * shows them as "running in a separate window" via the shared ownership map. If
 * its canvas is closed elsewhere, the store self-closes this window.
 */
function CanvasWindow() {
  const init = useStore((s) => s.init);
  const canvases = useStore((s) => s.canvases);
  const detachedCanvasIds = useStore((s) => s.detachedCanvasIds);
  const canvas = canvases.find((c) => c.id === DETACHED_CANVAS_ID);
  // Panel reordering (#135/#155) is the only drag a detached window has (no sidebar) —
  // `dragActive` lights up the edge zones; at drag start the panel is lifted out so
  // the rest reflow, and `onDragEnd` commits it to the target or restores it. The
  // commit/cancel actions target the active tab (forced to this window's id, #84).
  const beginCanvasLift = useStore((s) => s.beginCanvasLift);
  const cancelCanvasLift = useStore((s) => s.cancelCanvasLift);
  const [dragActive, setDragActive] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const onDragStart = (event: DragStartEvent) => {
    setDragActive(true);
    if (event.active.data.current?.kind === "move-leaf") {
      beginCanvasLift(String(event.active.data.current.leafId));
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDragActive(false);
    const { active, over } = event;
    if (active.data.current?.kind !== "move-leaf") return;
    applyCanvasLiftEnd(over ? String(over.id) : null);
  };

  useEffect(() => {
    void init();
  }, [init]);

  // Warm the deferred panel chunks once idle (#356) — no modals in a detached window.
  useEffect(() => prefetchDeferredChunks(false), []);

  // Spatial panel nav (#76) works here; new-session / view-toggle / canvas-jump
  // are inert in a canvas-only window (guarded in the hook by window identity).
  useKeyboardNav();

  // OS file drag-drop into a FileTree panel in this detached window (#253).
  useOsFileDrop();

  // Own only the PTYs in this window's canvas (#84) — dispose any others the pool
  // might hold. On re-dock (window closing) the main window recreates them.
  useEffect(() => {
    const owners = computeSessionOwners(canvases, detachedCanvasIds);
    const owned = sessionIdsInLayout(canvas?.layout ?? null).filter((id) =>
      ownedHere(owners, id),
    );
    reconcileTerminals(owned);
  }, [canvases, detachedCanvasIds, canvas]);

  return (
    <div className="app">
      <div className={styles.window}>
        {/* Wave background (UI v2 §3, task 377): a detached window is its own
            document, so it runs its own engine + seed — always the canvas preset.
            Covered (task 384) tracks its own canvas layout, so it pauses when this
            window has panels and resumes when they're all closed. */}
        <WaveBackground
          preset="canvas"
          covered={waveCovered({
            view: "canvas",
            overviewHasCards: false,
            activeCanvasLayout: canvas?.layout ?? null,
            activeCanvasDetached: false,
          })}
        />
        <header className={styles.header}>
          <span className={styles.title}>{canvas?.name ?? "Canvas"}</span>
        </header>
        <div className={styles.body}>
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={() => {
              setDragActive(false);
              cancelCanvasLift();
            }}
          >
            <CanvasSurface dragActive={dragActive} />
            <CanvasDragOverlay />
          </DndContext>
        </div>
      </div>
      <BigModeModal />
      <Toaster />
    </div>
  );
}

export default CanvasWindow;
