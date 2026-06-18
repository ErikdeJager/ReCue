import { useEffect } from "react";

import ClaudeMissing from "./components/ClaudeMissing/ClaudeMissing";
import Focus from "./components/Focus/Focus";
import NewSessionModal from "./components/NewSessionModal/NewSessionModal";
import Overview from "./components/Overview/Overview";
import Sidebar from "./components/Sidebar/Sidebar";
import { reconcileTerminals } from "./components/Terminal/terminalPool";
import Toaster from "./components/Toaster/Toaster";
import UpdatePopup from "./components/UpdatePopup/UpdatePopup";
import { useStore } from "./store";
import { useKeyboardNav } from "./useKeyboardNav";

/**
 * Application shell: a sidebar region (#9) and the main content area, which
 * routes between the Overview wall (#11) and Focus view (#12), under the native
 * macOS title bar (#19 — no custom chrome). Cross-cutting surfaces (toasts, the
 * claude-missing banner) live at the top level. State + IPC are wired through
 * the Zustand store.
 */
function App() {
  const view = useStore((s) => s.view);
  const claudeMissing = useStore((s) => s.claudeMissing);
  const sessions = useStore((s) => s.sessions);
  const init = useStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  // Global Shift+Arrow navigation between agents / views (#24).
  useKeyboardNav();

  // Terminal instances live in a persistent pool (not the React view tree) so
  // they survive Overview↔Focus switches. Dispose one only when its session is
  // truly gone — this fires on the (infrequent) session-list change, not output.
  useEffect(() => {
    reconcileTerminals(sessions.map((s) => s.id));
  }, [sessions]);

  return (
    <div className="app">
      {claudeMissing && <ClaudeMissing />}
      <div className="app-body">
        <Sidebar />
        <main className="main">
          <div className="main-content">
            {view === "overview" ? <Overview /> : <Focus />}
          </div>
        </main>
      </div>
      <Toaster />
      <NewSessionModal />
      <UpdatePopup />
    </div>
  );
}

export default App;
