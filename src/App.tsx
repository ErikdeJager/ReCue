import DesignSample from "./components/DesignSample/DesignSample";

/**
 * Root component. Renders the design-system sample for now (task #2); the custom
 * titlebar (#3), sidebar, and Overview/Focus views replace this in later tasks.
 */
function App() {
  return (
    <main className="app">
      <DesignSample />
    </main>
  );
}

export default App;
