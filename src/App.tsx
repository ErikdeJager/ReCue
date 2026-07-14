import { lazy, Suspense } from "react";

import { useRevealWindow } from "./useRevealWindow";
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
 * Reveal trigger — where #348 (hidden-until-painted) meets #356 (lazy route chunks).
 *
 * Windows are created hidden with a themed native background, and the frontend shows this
 * one once React has committed a real frame. That trigger sits **inside** the Suspense
 * boundary, as a sibling of the route, on purpose: a boundary that is still pending commits
 * its *fallback*, not its children, so this component's effect — and therefore
 * `reveal_window` — fires only once the lazy route chunk has actually mounted. Calling
 * `useRevealWindow()` in `App` itself would show the window on the empty fallback frame
 * instead of the first real one.
 *
 * It cannot deadlock the window shut: if the chunk never loads (a crashed bundle, a dead dev
 * server) this simply never reveals, and Rust's 2 s `schedule_reveal_fallback` shows the
 * window anyway — the app can never end up running-but-invisible.
 *
 * Renders nothing, so it costs no DOM and no paint of its own.
 */
function RevealOnPaint() {
  useRevealWindow();
  return null;
}

/**
 * Root: the full app shell in the main window, or the canvas-only view in a
 * detached canvas window (#84). Window identity is fixed for a window's lifetime
 * (derived from its URL), so this branch is stable — hooks never run conditionally,
 * and exactly one of the two route chunks is ever fetched.
 *
 * The Suspense fallback is a bare `div.app` on purpose: it paints the app background
 * (no spinner, no layout) for the one frame before the route chunk executes. The window is
 * normally still hidden then (#348) — the fallback is what the Rust reveal fallback would
 * show if the chunk hung, so even that degraded path reveals ReCue's background rather than
 * a white flash.
 */
function App() {
  return (
    <Suspense fallback={<div className="app" />}>
      <RevealOnPaint />
      {IS_MAIN_WINDOW ? <MainApp /> : <CanvasWindow />}
    </Suspense>
  );
}

export default App;
