// Dev-only update mock (#193). Registers a small `window.__recue` helper so a
// developer can fake an available update in a dev run and watch the whole update UI
// react (the #190 indicator + confirm/freeze/progress flow, the #191 Settings
// "Updates" pane, the #192 patch-notes render) without a signed release.
//
// Imported ONLY under `import.meta.env.DEV` (see `main.tsx`), so Vite tree-shakes
// this module — and the `window` global — out of a production build.

import { useStore } from "./store";

declare global {
  interface Window {
    /** Dev-only update mock helpers (#193); undefined in production. */
    __recue?: {
      /** Fake an available update → the indicator + Updates pane + notes light up.
       *  `notes` defaults to a sample changelog; pass `null` to omit notes. */
      mockUpdate: (opts?: { version?: string; notes?: string | null }) => void;
      /** Drive the install download progress bar / freeze overlay (0–100). */
      mockProgress: (percent: number) => void;
      /** Put the updater into the error state with a message. */
      mockError: (message?: string) => void;
      /** Reset everything back to idle (and disarm the mock). */
      clearUpdate: () => void;
    };
  }
}

export function registerDevMock(): void {
  const state = useStore.getState;
  window.__recue = {
    mockUpdate: (opts) => state().mockUpdate(opts),
    mockProgress: (percent) =>
      state().setUpdateState({
        status: "downloading",
        progress: Math.max(0, Math.min(100, Math.round(percent))),
      }),
    mockError: (message) =>
      state().setUpdateState({
        status: "error",
        error: message ?? "Mock update failed",
      }),
    clearUpdate: () => state().clearUpdate(),
  };
  console.info(
    "[recue] dev update mock ready — try window.__recue.mockUpdate()",
  );
}
