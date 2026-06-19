// Global keyboard shortcuts.
//
//   Shift+← / Shift+→  select prev/next agent in Overview                 (#24)
//   Shift+arrows       move the focused panel spatially in Canvas         (#76)
//   ⌘1 … ⌘9            jump to canvas N (Canvas view only)                (#76)
//   ⌘N / Ctrl+N        open the new-session flow from anywhere            (#26)
//
// xterm forwards keystrokes to the PTY when a terminal is focused, so the
// listener runs in the **capture phase on window** — it fires before xterm's
// textarea handler, and `stopPropagation()` keeps the focused terminal from ever
// seeing these combos. Only the handled combos are intercepted; every other key
// (normal typing, Shift+letters, Shift+Tab, other Cmd/Ctrl/Alt combos) passes
// straight through.

import { useEffect } from "react";

import { adjacentSessionId, useStore } from "./store";

export function useKeyboardNav(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ⌘N / Ctrl+N — open the new-session flow from anywhere (#26). Intercept
      // before the webview's default (new window) and before xterm; no-op when
      // the flow is already open.
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "n"
      ) {
        e.preventDefault();
        e.stopPropagation();
        const { newSessionOpen, openNewSession } = useStore.getState();
        if (!newSessionOpen) openNewSession();
        return;
      }

      // ⌘1 … ⌘9 — jump to canvas N, Canvas view only (#76). Safe over a focused
      // claude session: ⌘+number never reaches the PTY. Skipped while the
      // new-session modal is open so its own ⌘1–9 recents (#61/#66) aren't taken.
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        /^[1-9]$/.test(e.key)
      ) {
        const state = useStore.getState();
        if (state.view !== "canvas" || state.newSessionOpen) return;
        e.preventDefault();
        e.stopPropagation();
        const canvas = state.canvases[Number(e.key) - 1];
        if (canvas) state.selectCanvas(canvas.id);
        return;
      }

      // Plain Shift + Arrow — context-sensitive (#24/#76). Leave Cmd/Ctrl/Alt
      // combos (and claude's own Shift usage) untouched.
      if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key;
      const isArrow =
        key === "ArrowLeft" ||
        key === "ArrowRight" ||
        key === "ArrowUp" ||
        key === "ArrowDown";
      if (!isArrow) return;

      const state = useStore.getState();
      // Don't navigate while the new-session modal/popover is open (#27).
      if (state.newSessionOpen) return;

      // Canvas: Shift+arrows move the keyboard-focused panel spatially (#76).
      if (state.view === "canvas") {
        e.preventDefault();
        e.stopPropagation();
        const dir =
          key === "ArrowLeft"
            ? "left"
            : key === "ArrowRight"
              ? "right"
              : key === "ArrowUp"
                ? "up"
                : "down";
        state.moveCanvasFocus(dir);
        return;
      }

      // Overview: only ←/→ navigate agents (#24); ↑/↓ pass through.
      if (key === "ArrowLeft" || key === "ArrowRight") {
        // Intercept before xterm forwards the key to the PTY.
        e.preventDefault();
        e.stopPropagation();
        const id = adjacentSessionId(
          state.sessions,
          state.selectedId,
          key === "ArrowRight" ? 1 : -1,
        );
        if (id) state.select(id);
      }
    };

    window.addEventListener("keydown", onKeyDown, true); // capture phase
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
