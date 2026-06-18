import { useEffect } from "react";

import ClaudeMissing from "./components/ClaudeMissing/ClaudeMissing";
import Focus from "./components/Focus/Focus";
import NewSessionModal from "./components/NewSessionModal/NewSessionModal";
import Overview from "./components/Overview/Overview";
import Sidebar from "./components/Sidebar/Sidebar";
import Titlebar from "./components/Titlebar/Titlebar";
import Toaster from "./components/Toaster/Toaster";
import { useStore } from "./store";

/**
 * Application shell: custom titlebar (#3) over a sidebar region (#9) and the main
 * content area, which routes between the Overview wall (#11) and Focus view (#12).
 * Cross-cutting surfaces (toasts, the claude-missing banner) live at the top
 * level. State + IPC are wired through the Zustand store.
 */
function App() {
  const view = useStore((s) => s.view);
  const claudeMissing = useStore((s) => s.claudeMissing);
  const init = useStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="app">
      <Titlebar />
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
    </div>
  );
}

export default App;
