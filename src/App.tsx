import { useEffect, useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import Canvas from "./components/Canvas/Canvas";
import {
  applyCanvasDrop,
  payloadToContent,
} from "./components/Canvas/canvasDrop";
import ClaudeMissing from "./components/ClaudeMissing/ClaudeMissing";
import Focus from "./components/Focus/Focus";
import NewSessionModal from "./components/NewSessionModal/NewSessionModal";
import Overview from "./components/Overview/Overview";
import Sidebar from "./components/Sidebar/Sidebar";
import { reconcileTerminals } from "./components/Terminal/terminalPool";
import Toaster from "./components/Toaster/Toaster";
import { useStore } from "./store";
import { useKeyboardNav } from "./useKeyboardNav";

/**
 * Application shell: a sidebar region (#9) and the main content area, which
 * routes between the Overview wall (#11), Focus view (#12), and Canvas (#46),
 * under the native macOS title bar (#19 — no custom chrome). Cross-cutting
 * surfaces (toasts, the claude-missing banner) live at the top level. State +
 * IPC are wired through the Zustand store.
 *
 * One **app-level dnd-kit context** (#47) spans the sidebar (drag sources:
 * sessions + opened files) and Canvas (drop targets), so items drag from the
 * tree into the workspace. The Overview wall keeps its own nested sortable
 * context (#43); the two never both have live targets (one view mounts at a time).
 */
function App() {
  const view = useStore((s) => s.view);
  const claudeMissing = useStore((s) => s.claudeMissing);
  const sessions = useStore((s) => s.sessions);
  const overviewPanels = useStore((s) => s.overviewPanels);
  const init = useStore((s) => s.init);
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
  // they survive Overview↔Focus↔Canvas switches. Dispose one only when its
  // session is truly gone — this fires on the (infrequent) session-list change.
  useEffect(() => {
    // Keep alive both agent PTYs and terminal-item PTYs (#72); dispose the rest.
    const terminalIds = Object.values(overviewPanels)
      .flat()
      .filter((p) => p.kind === "terminal")
      .map((p) => p.id);
    reconcileTerminals([...sessions.map((s) => s.id), ...terminalIds]);
  }, [sessions, overviewPanels]);

  const onDragEnd = (event: DragEndEvent) => {
    setDragActive(false);
    const { active, over } = event;
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
        onDragStart={() => setDragActive(true)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragActive(false)}
      >
        <div className="app-body">
          <Sidebar />
          <main className="main">
            <div className="main-content">
              {view === "overview" ? (
                <Overview />
              ) : view === "canvas" ? (
                <Canvas dragActive={dragActive} />
              ) : (
                <Focus />
              )}
            </div>
          </main>
        </div>
      </DndContext>
      <Toaster />
      <NewSessionModal />
    </div>
  );
}

export default App;
