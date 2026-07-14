import { useEffect } from "react";

import * as ipc from "./ipc";

/** Module-level so a remount (StrictMode's double-invoke, HMR) can't re-reveal. */
let revealed = false;

function reveal(): void {
  if (revealed) return;
  revealed = true;
  void ipc.revealWindow().catch(() => {
    // Outside Tauri (plain Vite preview) there is no window to reveal.
  });
}

/**
 * Show this native window once React has committed its first frame (#348).
 *
 * Windows are created **hidden** (`visible: false`) with a themed native background
 * (`tauri.conf.json` / `open_canvas_window`), so the user never sees the WebView's
 * default white canvas while the bundle loads. Idempotent; called once from `App()`,
 * which is the root of BOTH the main window and a detached canvas window (#84).
 *
 * Rust keeps a 2 s fallback (`schedule_reveal_fallback`) so a bundle that never boots
 * can't leave the app running-but-invisible.
 */
export function useRevealWindow(): void {
  useEffect(() => {
    // Two triggers, whichever fires first (reveal() is idempotent):
    //  - rAF: fires right before the first paint (the ideal moment) — but a WebView
    //    whose window is not yet mapped may not tick rAF at all, so it can't be the
    //    only path;
    //  - a 0 ms timer: always fires, right after this (post-commit) effect.
    const raf = requestAnimationFrame(reveal);
    const timer = window.setTimeout(reveal, 0);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, []);
}
