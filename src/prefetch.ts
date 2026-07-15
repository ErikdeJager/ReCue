// Idle warm-up for the chunks that #356 deferred off the first-paint path.
//
// Code-splitting trades bytes-before-paint for a fetch-on-first-use. On local disk (the
// tauri:// asset protocol) that fetch is single-digit ms — but we can make it zero: once
// the window is idle, pre-import the chunks the user is most likely to reach, so opening a
// file/diff/kanban/tree panel or hitting ⌘/Ctrl+N is instant.
//
// The specifiers below are the SAME string literals as the matching `React.lazy()` calls
// (ItemContent.tsx / ModalHost.tsx), so each resolves to the already-emitted chunk and the
// module registry dedupes — no second copy, no second evaluation.

/** Chunks worth warming in every window: the four content panels (they also carry the
 *  shared markdown + Prism chunk that FileViewer / KanbanPanel / DiffInspector split into). */
function prefetchPanels(): void {
  void import("./components/FileViewer/FileViewer");
  void import("./components/DiffInspector/DiffInspector");
  void import("./components/Kanban/KanbanPanel");
  void import("./components/FileTree/FileTree");
}

/** The modals a main-window user actually reaches (a detached canvas window has none).
 *  The rare ones — the template trio, CanvasClose, Onboarding, CloneRepo — are deliberately
 *  left cold; they are small and their chunk lands well within a click's latency. */
function prefetchModals(): void {
  void import("./components/Settings/Settings");
  void import("./components/NewSessionModal/NewSessionModal");
  void import("./components/GlobalSearch/GlobalSearch");
  void import("./components/CreatePanelModal/CreatePanelModal");
  // The Attention triage view (#398) — a main-window lazy route branch in MainApp; a
  // detached canvas window (#84) never renders it, so it's warmed only here.
  void import("./components/Attention/Attention");
}

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/**
 * Warm the deferred chunks once this window is idle. Returns a cancel function, so it can
 * be returned straight from a mount effect.
 *
 * @param main true in the main window (also warms the common modals), false in a detached
 *   canvas window (#84), which has no modals to warm.
 */
export function prefetchDeferredChunks(main: boolean): () => void {
  const run = () => {
    prefetchPanels();
    if (main) prefetchModals();
  };

  // `requestIdleCallback` is absent on older WKWebView/Safari (macOS) — feature-detect it
  // and fall back to a timer, so the warm-up runs on macOS, Windows and Linux alike.
  const w = window as IdleWindow;
  const ric = w.requestIdleCallback;
  if (typeof ric === "function") {
    const id = ric.call(w, run, { timeout: 3000 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(run, 1500);
  return () => window.clearTimeout(id);
}
