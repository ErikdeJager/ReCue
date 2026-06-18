// Global keyboard navigation (#24): Shift+Arrow moves between agents and
// switches views.
//
//   Shift+← / Shift+→  select prev/next agent (wall order, wrap-around)
//   Shift+↓            Focus the selected agent
//   Shift+↑            back to Overview (keeps the selection)
//
// xterm forwards keystrokes to the PTY when a terminal is focused, so the
// listener runs in the **capture phase on window** — it fires before xterm's
// textarea handler, and `stopPropagation()` keeps the focused terminal from ever
// seeing these combos. Only the four Shift+Arrow combos are intercepted; all
// other keys (normal typing, Shift+letters, Shift+Tab, Cmd/Ctrl/Alt combos) pass
// straight through.

import { useEffect } from "react";

import { adjacentSessionId, useStore } from "./store";

export function useKeyboardNav(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Plain Shift + Arrow only — leave Cmd/Ctrl/Alt combos (and claude's own
      // Shift usage) untouched.
      if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key;
      if (
        key !== "ArrowLeft" &&
        key !== "ArrowRight" &&
        key !== "ArrowUp" &&
        key !== "ArrowDown"
      ) {
        return;
      }

      const state = useStore.getState();
      // Don't navigate while the new-session modal/popover is open (#27) — let
      // its inputs handle Shift+Arrow normally.
      if (state.newSessionOpen) return;

      // Intercept before xterm forwards the key to the PTY.
      e.preventDefault();
      e.stopPropagation();

      if (key === "ArrowLeft" || key === "ArrowRight") {
        const id = adjacentSessionId(
          state.sessions,
          state.selectedId,
          key === "ArrowRight" ? 1 : -1,
        );
        if (id) state.select(id);
      } else if (key === "ArrowDown") {
        // Focus the selected agent (selects the first if none; no-op if empty).
        state.showFocus();
      } else {
        // ArrowUp -> back to Overview, keeping the selection.
        state.setView("overview");
      }
    };

    window.addEventListener("keydown", onKeyDown, true); // capture phase
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
