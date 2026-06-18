import Titlebar from "./components/Titlebar/Titlebar";
import DesignSample from "./components/DesignSample/DesignSample";

/**
 * Root component. The custom titlebar (#3) sits above the main content area.
 * The body currently shows the design-system sample (#2); the sidebar and
 * Overview/Focus views replace it in later tasks.
 */
function App() {
  return (
    <div className="app">
      <Titlebar />
      <div className="app-body">
        <DesignSample />
      </div>
    </div>
  );
}

export default App;
