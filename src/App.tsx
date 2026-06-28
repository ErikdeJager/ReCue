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
import { arrayMove } from "@dnd-kit/sortable";

import Canvas from "./components/Canvas/Canvas";
import {
  applyCanvasDrop,
  applyCanvasLiftEnd,
  payloadToContent,
} from "./components/Canvas/canvasDrop";
import { CanvasDragOverlay } from "./components/Canvas/CanvasSurface";
import BigModeModal from "./components/BigMode/BigModeModal";
import {
  computeSessionOwners,
  sessionIdsInLayout,
} from "./components/Canvas/canvasTree";
import CanvasCloseModal from "./components/CanvasCloseModal/CanvasCloseModal";
import CanvasWindow from "./components/CanvasWindow/CanvasWindow";
import ClaudeMissing from "./components/ClaudeMissing/ClaudeMissing";
import CreatePanelModal from "./components/CreatePanelModal/CreatePanelModal";
import NewSessionModal from "./components/NewSessionModal/NewSessionModal";
import OnboardingModal from "./components/Onboarding/OnboardingModal";
import Overview from "./components/Overview/Overview";
import Settings from "./components/Settings/Settings";
import Sidebar from "./components/Sidebar/Sidebar";
import TemplateEditor from "./components/TemplateEditor/TemplateEditor";
import TemplateManager from "./components/TemplateManager/TemplateManager";
import TemplateUseModal from "./components/TemplateUseModal/TemplateUseModal";
import { reconcileTerminals } from "./components/Terminal/terminalPool";
import Toaster from "./components/Toaster/Toaster";
import UpdateModal from "./components/Update/UpdateModal";
import { useStore } from "./store";
import { useKeyboardNav } from "./useKeyboardNav";
import { IS_MAIN_WINDOW, ownedHere } from "./windowContext";

/**
 * Application shell: a sidebar region (#9) and the main content area, which
 * routes between the Overview wall (#11) and Canvas (#46),
 * under the native macOS title bar (#19 — no custom chrome). Cross-cutting
 * surfaces (toasts, the claude-missing banner) live at the top level. State +
 * IPC are wired through the Zustand store.
 *
 * One **app-level dnd-kit context** (#47) spans the sidebar (drag sources:
 * sessions + opened files) and Canvas (drop targets), so items drag from the
 * tree into the workspace. The Overview wall keeps its own nested sortable
 * context (#43); the two never both have live targets (one view mounts at a time).
 */
function MainApp() {
  const view = useStore((s) => s.view);
  const claudeMissing = useStore((s) => s.claudeMissing);
  const sessions = useStore((s) => s.sessions);
  const overviewPanels = useStore((s) => s.overviewPanels);
  const canvases = useStore((s) => s.canvases);
  const detachedCanvasIds = useStore((s) => s.detachedCanvasIds);
  const templateEditorOpen = useStore((s) => s.templateEditorOpen);
  const templateManagerOpen = useStore((s) => s.templateManagerOpen);
  const templateUseOpen = useStore((s) => s.templateUseOpen);
  const createPanelOpen = useStore((s) => s.createPanelOpen);
  const canvasClosePromptId = useStore((s) => s.canvasClosePromptId);
  const onboardingOpen = useStore((s) => s.onboardingOpen);
  const init = useStore((s) => s.init);
  const beginCanvasLift = useStore((s) => s.beginCanvasLift);
  const cancelCanvasLift = useStore((s) => s.cancelCanvasLift);
  const reorderRepos = useStore((s) => s.reorderRepos);
  const [dragActive, setDragActive] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  useEffect(() => {
    void init();
  }, [init]);

  // Global Shift+Arrow navigation between agents / views (#24).
  useKeyboardNav();

  // Terminal instances live in a persistent pool (not the React view tree) so
  // they survive Overview↔Canvas switches. Dispose one only when its
  // session is truly gone — this fires on the (infrequent) session-list change.
  useEffect(() => {
    // Keep alive both agent PTYs and terminal-item PTYs (#72); dispose the rest.
    const terminalIds = Object.values(overviewPanels)
      .flat()
      .filter((p) => p.kind === "terminal")
      .map((p) => p.id);
    // A PTY rendered in a detached canvas window (#84) is owned by that window —
    // drop it from this window's pool so it isn't rendered/resized in two places.
    const owners = computeSessionOwners(canvases, detachedCanvasIds);
    // Template-created (#118) terminals live only in a Canvas layout — not in
    // `overviewPanels` — so collect terminal/agent PTY ids referenced by any canvas
    // too, else reconcile would dispose them. (Agent ids dedupe with `sessions`.)
    const canvasPtyIds = canvases.flatMap((c) => sessionIdsInLayout(c.layout));
    const active = [
      ...sessions.map((s) => s.id),
      ...terminalIds,
      ...canvasPtyIds,
    ].filter((id) => ownedHere(owners, id));
    reconcileTerminals(active);
  }, [sessions, overviewPanels, canvases, detachedCanvasIds]);

  // Lift an existing panel out of the layout at drag start (#155) so the rest
  // reflow and a ghost follows the cursor; sidebar→Canvas content drags are unaffected.
  const onDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    // A sidebar folder reorder (#211) stays within the sidebar — don't light up the
    // Canvas drop zones for it.
    if (data?.kind !== "folder-sort") setDragActive(true);
    if (data?.kind === "move-leaf") {
      beginCanvasLift(String(data.leafId));
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDragActive(false);
    const { active, over } = event;
    // Sidebar folder reorder (#211): the dragged repo header carries the full
    // displayed order in its `data`; move it to the dropped-on folder's slot and
    // persist. Handled here (not in the sidebar) so its SortableContext can live
    // inside this app-level context without a nested one breaking row→Canvas drags.
    if (active.data.current?.kind === "folder-sort") {
      if (!over) return;
      const overId = String(over.id);
      if (!overId.startsWith("repohead:")) return; // dropped off the folder list
      const order = (active.data.current.repos as string[] | undefined) ?? [];
      const activeRepo = String(active.data.current.repo);
      const overRepo = overId.slice("repohead:".length);
      const oldIndex = order.indexOf(activeRepo);
      const newIndex = order.indexOf(overRepo);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      void reorderRepos(arrayMove(order, oldIndex, newIndex));
      return;
    }
    // Existing-panel lift (#135/#155): commit to the drop target, or restore when
    // released on nothing. Always resolve the lift — an early `!over` return would
    // strand the panel out of the layout.
    if (active.data.current?.kind === "move-leaf") {
      applyCanvasLiftEnd(over ? String(over.id) : null);
      return;
    }
    if (!over) return;
    const content = payloadToContent(active.data.current);
    if (content) applyCanvasDrop(String(over.id), content);
  };

  return (
    <div className="app">
      {claudeMissing && <ClaudeMissing />}
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
        <div className="app-body">
          <Sidebar />
          <main className="main">
            <div className="main-content">
              {view === "overview" ? (
                <Overview />
              ) : (
                <Canvas dragActive={dragActive} />
              )}
            </div>
          </main>
        </div>
        <CanvasDragOverlay />
      </DndContext>
      <Toaster />
      <BigModeModal />
      <NewSessionModal />
      {createPanelOpen && <CreatePanelModal />}
      <Settings />
      <UpdateModal />
      {canvasClosePromptId && <CanvasCloseModal />}
      {templateUseOpen && <TemplateUseModal />}
      {templateManagerOpen && <TemplateManager />}
      {templateEditorOpen && <TemplateEditor />}
      {onboardingOpen && <OnboardingModal />}
    </div>
  );
}

/**
 * Root: the full app shell in the main window, or the canvas-only view in a
 * detached canvas window (#84). Window identity is fixed for a window's lifetime
 * (derived from its URL), so this branch is stable — hooks never run conditionally.
 */
function App() {
  return IS_MAIN_WINDOW ? <MainApp /> : <CanvasWindow />;
}

export default App;
