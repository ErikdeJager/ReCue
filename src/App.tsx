import { lazy, Suspense } from "react";

import { IS_MAIN_WINDOW } from "./windowContext";

// The two window routes (#84) are the app's two lazy entry points (#356): the main shell
// (sidebar + Overview/Canvas + modals) and the canvas-only detached window. Splitting them
// means a detached window never downloads the sidebar, the Overview wall, or a single modal,
// and the main window's own code lands in its own chunk instead of the Vite entry.
const MainApp = lazy(() => import("./MainApp"));
const CanvasWindow = lazy(
  () => import("./components/CanvasWindow/CanvasWindow"),
);

/**
 * Root: the full app shell in the main window, or the canvas-only view in a
 * detached canvas window (#84). Window identity is fixed for a window's lifetime
 * (derived from its URL), so this branch is stable — hooks never run conditionally,
 * and exactly one of the two route chunks is ever fetched.
 *
 * The Suspense fallback is a bare `div.app` on purpose: it paints the app background
 * (no spinner, no layout) for the one frame before the route chunk executes, so the
 * window reveals as ReCue rather than as a white flash.
 */
function App() {
  return (
    <Suspense fallback={<div className="app" />}>
      {IS_MAIN_WINDOW ? <MainApp /> : <CanvasWindow />}
    </Suspense>
  );
}

export default App;
