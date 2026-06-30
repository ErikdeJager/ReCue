// Global keyboard shortcuts.
//
//   Shift+← / Shift+→  select prev/next column in Overview (any kind)     (#24/#174)
//   Shift+arrows       move the focused panel spatially in Canvas         (#76)
//   ⌘1 … ⌘9            jump to canvas N (Canvas view only)                (#76)
//   ⌘\                 toggle the main view (Overview ↔ Canvas)           (#77)
//   ⌘N / Ctrl+N        open the new-session flow from anywhere            (#26)
//   ⌘⇧N / Ctrl+Shift+N open the schedule-session flow                     (#93)
//   ⌘B / Ctrl+B        collapse / expand the sidebar (main window only)   (#168)
//   ⌘K / Ctrl+K        open the Create-panel launcher (type step)         (#189)
//   ⌘⌥1 … ⌘⌥6          Create-panel launcher straight to the folder step  (#189)
//                      for type N (session/file/diff/terminal/kanban/tree)
//   ⌘T / Ctrl+T        new Canvas tab (switches to Canvas view)           (#206)
//   ⌘E / Ctrl+E        toggle big mode for the selected item              (#284)
//
// xterm forwards keystrokes to the PTY when a terminal is focused, so the
// listener runs in the **capture phase on window** — it fires before xterm's
// textarea handler, and `stopPropagation()` keeps the focused terminal from ever
// seeing these combos. Only the handled combos are intercepted; every other key
// (normal typing, Shift+letters, Shift+Tab, other Cmd/Ctrl/Alt combos) passes
// straight through.

import { useEffect } from "react";

import { panelTypeForDigit } from "./components/CreatePanelModal/panelTypes";
import { saveFocused } from "./saverRegistry";
import { adjacentId, overviewClusterKeys, useStore } from "./store";
import { IS_MAIN_WINDOW } from "./windowContext";

export function useKeyboardNav(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ⌘S / Ctrl+S — in manual-save mode (#162), flush the focused file editor
      // (or all dirty buffers if none is focused) instead of the browser default.
      // In auto mode, leave the keystroke alone (nothing to hijack). Works in the
      // main and detached canvas windows (both can host file/kanban editors).
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "s"
      ) {
        if (!useStore.getState().settings.autoSave) {
          e.preventDefault();
          e.stopPropagation();
          saveFocused();
        }
        return;
      }

      // ⌘N / Ctrl+N — open the new-session flow from anywhere (#26). Intercept
      // before the webview's default (new window) and before xterm; no-op when
      // the flow is already open. Swallowed but inert in a detached canvas window
      // (#84) — it has no sidebar / new-session UI.
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "n"
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (IS_MAIN_WINDOW) {
          const { newSessionOpen, openNewSession } = useStore.getState();
          if (!newSessionOpen) openNewSession();
        }
        return;
      }

      // ⌘⇧N / Ctrl+Shift+N — open the schedule-session flow (#93). Distinct from
      // ⌘N (new session, which requires !shiftKey). Swallowed but inert in a
      // detached canvas window (#84 — no sidebar/launcher).
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "n"
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (IS_MAIN_WINDOW) {
          const { newSessionOpen, openSchedule } = useStore.getState();
          if (!newSessionOpen) openSchedule();
        }
        return;
      }

      // ⌘B / Ctrl+B — collapse / expand the sidebar to the icon rail (#168).
      // ⌘-based, so it never reaches a focused claude/terminal; main window only
      // (a detached canvas window has no sidebar — swallowed but inert).
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "b"
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (IS_MAIN_WINDOW) {
          useStore.getState().toggleSidebarCollapsed();
        }
        return;
      }

      // ⌘K / Ctrl+K — open the Create-panel launcher at the type step (#189).
      // ⌘-based, so it never reaches a focused claude/terminal; main window only
      // (it adds to the sidebar/Overview); inert while another modal is open.
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "k"
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (IS_MAIN_WINDOW) {
          const { createPanelOpen, newSessionOpen, openCreatePanel } =
            useStore.getState();
          if (!createPanelOpen && !newSessionOpen) openCreatePanel();
        }
        return;
      }

      // ⌘T / Ctrl+T — create a new Canvas tab from anywhere (#206). A *create*
      // action like ⌘N/⌘K: switch to Canvas so the new (active) tab is visible,
      // then addCanvas(). ⌘-based, so it never reaches a focused claude/terminal;
      // main window only (tab creation belongs to the main strip — swallowed but
      // inert in a detached canvas window, #84); inert while the new-session or
      // create-panel modal is open (mirrors ⌘K's guard).
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "t"
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (IS_MAIN_WINDOW) {
          const { createPanelOpen, newSessionOpen, setView, addCanvas } =
            useStore.getState();
          if (!createPanelOpen && !newSessionOpen) {
            setView("canvas");
            addCanvas();
          }
        }
        return;
      }

      // ⌘E / Ctrl+E — toggle big mode (#157) for the selected item (#284). Same chord
      // opens (the selected item) and closes. Works in both windows (big mode is a
      // per-window overlay), so NOT gated on IS_MAIN_WINDOW. ⌘/Ctrl-based + capture
      // `stopPropagation`, so it never reaches a focused claude/terminal; matched on
      // `e.code` (physical key, like the digit shortcuts) for layout robustness.
      // Opening with nothing selected is a safe no-op.
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.code === "KeyE"
      ) {
        e.preventDefault();
        e.stopPropagation();
        useStore.getState().toggleMaximizeSelected();
        return;
      }

      // ⌘⌥1 … ⌘⌥6 — open the Create-panel launcher straight to the folder step for
      // type N (#189). Distinct from the ⌘1–9 canvas-jump (which requires !altKey),
      // so no collision. Option+digit composes a glyph in `e.key`, so match `e.code`
      // (Digit1…Digit6). Main window only; inert while another modal is open.
      if (
        (e.metaKey || e.ctrlKey) &&
        e.altKey &&
        !e.shiftKey &&
        /^Digit[1-6]$/.test(e.code)
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (IS_MAIN_WINDOW) {
          const { createPanelOpen, newSessionOpen, openCreatePanel } =
            useStore.getState();
          if (!createPanelOpen && !newSessionOpen) {
            const type = panelTypeForDigit(Number(e.code.slice(5)));
            if (type) openCreatePanel(type);
          }
        }
        return;
      }

      // ⌘\ — toggle the main view between Overview and Canvas (#77). ⌘-based, so
      // it never reaches a focused claude/terminal; inert while the new-session
      // modal is open, and in a detached canvas window (#84 — no Overview).
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key === "\\"
      ) {
        const state = useStore.getState();
        if (!IS_MAIN_WINDOW || state.newSessionOpen) return;
        e.preventDefault();
        e.stopPropagation();
        state.setView(state.view === "overview" ? "canvas" : "overview");
        return;
      }

      // ⌘1 … ⌘9 — jump to canvas N (main window, Canvas view only, #76). Safe over
      // a focused claude session: ⌘+number never reaches the PTY. Skipped while
      // the new-session modal is open so its own ⌘1–9 recents (#61/#66) aren't
      // taken. If canvas N is detached (#84), raise its window instead of switching.
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        /^[1-9]$/.test(e.key)
      ) {
        const state = useStore.getState();
        if (
          !IS_MAIN_WINDOW ||
          state.view !== "canvas" ||
          state.newSessionOpen
        ) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        const canvas = state.canvases[Number(e.key) - 1];
        if (canvas) {
          if (state.detachedCanvasIds.includes(canvas.id)) {
            state.focusCanvasWindow(canvas.id);
          } else {
            state.selectCanvas(canvas.id);
          }
        }
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

      // Canvas: Shift+arrows move the keyboard-focused panel spatially (#76). A
      // detached canvas window (#84) is always canvas-spatial (it has no Overview).
      if (state.view === "canvas" || !IS_MAIN_WINDOW) {
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

      // Overview: ←/→ step the full flat list of columns in rendered order —
      // agents **and** every non-agent column (file / diff / terminal / kanban /
      // filetree panels and pending schedule cards), #174. ↑/↓ keep passing
      // through to a focused terminal (#24).
      if (key === "ArrowLeft" || key === "ArrowRight") {
        // Intercept before xterm forwards the key to the PTY.
        e.preventDefault();
        e.stopPropagation();
        // The same ordering the wall renders (Overview consumes the sibling
        // `overviewClusters`), so nav can never land on a hidden/missing column.
        const ids = overviewClusterKeys({
          sessions: state.sessions,
          overviewPanels: state.overviewPanels,
          overviewOrder: state.overviewOrder,
          schedules: state.schedules,
          filter: state.overviewRepoFilter,
        });
        const id = adjacentId(
          ids,
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
