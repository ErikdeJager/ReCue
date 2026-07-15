// Global keyboard shortcuts — the dispatcher for the configurable keybind system
// (`src/keybinds.ts`).
//
// **Rebindable** actions resolve through the registry + the user's
// `settings.keybinds` overrides (Settings → Shortcuts). The defaults:
//
//   ⌥1 / ⌥2 / ⌥3       switch to Overview / Attention / Canvas
//   ⌘W / Ctrl+W        close the focused panel (big mode → Canvas leaf → Overview × →
//                      remove the focused Attention agent)
//   ⌘, / Ctrl+,        open Settings
//   ⌘E / Ctrl+E        toggle big mode for the selected item              (#284)
//   ⌘N / Ctrl+N        open the new-session flow from anywhere            (#26)
//   ⌘⇧N / Ctrl+Shift+N open the schedule-session flow                     (#93)
//   ⌘B / Ctrl+B        collapse / expand the sidebar (main window only)   (#168)
//   ⌘K / Ctrl+K        open the Create-panel launcher (type step)         (#189)
//   ⌘F / Ctrl+F        toggle the global search modal                     (#337)
//   ⌘D / Ctrl+D        toggle dense panels (UI v2 §9)                     (#373)
//   ⌘O / Ctrl+O        open the selected item's folder in your editor
//   ⌘⇧O / Ctrl+Shift+O choose the editor "Open in editor" uses
//
// **Fixed** (contextual, not rebindable — listed read-only in Settings):
//
//   ⌘S / Ctrl+S        flush the focused editor (manual-save mode only)   (#162)
//   ⌘⏎ / Ctrl+Enter    dismiss the selected agent in Attention            (#398)
//   ⌘⌥1 … ⌘⌥6          Create-panel launcher straight to the folder step  (#189)
//   Shift+← / Shift+→  select prev/next column in Overview (any kind)     (#24/#174)
//   Shift+↑ / Shift+↓  select prev/next agent in the Attention queue      (#398)
//   Shift+arrows       move the focused panel spatially in Canvas         (#76)
//
// Removed by the keybind rework: ⌘T (new Canvas tab, #206), ⌘1–⌘9 (canvas jump,
// #76), ⌘\ (Overview ↔ Canvas toggle, #77). The modal-internal digit chords they
// deferred to (new-session recents #61/#66, global-search folder chips task 397)
// are unaffected — those handlers live in the modals.
//
// xterm forwards keystrokes to the PTY when a terminal is focused, so the
// listener runs in the **capture phase on window** — it fires before xterm's
// textarea handler, and `stopPropagation()` keeps the focused terminal from ever
// seeing the handled combos. Matching is platform-resolved (`eventChord`): `mod`
// is ⌘ on macOS and Ctrl on Windows/Linux, so a **bare ⌃-chord on macOS now
// passes through to the terminal's readline** (⌃E end-of-line, ⌃N history, …)
// instead of triggering the app action — the old `metaKey || ctrlKey` matching
// swallowed those. Every other key (normal typing, Shift+letters, other combos)
// passes straight through.

import { useEffect } from "react";

import { attentionQueue } from "./components/Attention/attentionQueue";
import { panelTypeForDigit } from "./components/CreatePanelModal/panelTypes";
import {
  eventChord,
  isEditableTarget,
  keybindCaptureActive,
  keybindMapFor,
  type KeybindActionId,
} from "./keybinds";
import { detectPlatform } from "./platform";
import { saveFocused } from "./saverRegistry";
import {
  adjacentId,
  contentForSelected,
  overviewClusterKeys,
  ownedChildSessionIds,
  useStore,
} from "./store";
import { IS_MAIN_WINDOW } from "./windowContext";

/** The platform for chord resolution: the authoritative store signal once loaded,
 * else the synchronous UA sniff (#363's precedent) — so Ctrl reads as `mod` on
 * Windows/Linux from the very first keydown, before the async `platform()` IPC. */
function effectivePlatform(): string {
  const fromStore = useStore.getState().platform;
  if (fromStore) return fromStore;
  if (typeof navigator !== "undefined") {
    return detectPlatform(navigator.userAgent, navigator.platform ?? "");
  }
  return "";
}

/** What dispatching an action does to the event: `swallow` = preventDefault +
 * stopPropagation even when the action was inert (the established "swallowed but
 * inert in a detached window" semantics of ⌘N/⌘B/⌘K); `pass` = leave the event
 * alone so it reaches the focused element / modal (the old ⌘\ guard behavior). */
type Dispatch = "swallow" | "pass";

/** Run a rebindable action with its window/modal guards. Each case preserves the
 * exact guard semantics its hardcoded predecessor had. */
function runKeybindAction(action: KeybindActionId): Dispatch {
  const state = useStore.getState();
  switch (action) {
    // ⌘N (#26): no-op when the flow is already open. Swallowed but inert in a
    // detached canvas window (#84) — it has no sidebar / new-session UI.
    case "new-session": {
      if (IS_MAIN_WINDOW && !state.newSessionOpen) state.openNewSession();
      return "swallow";
    }
    // ⌘⇧N (#93): distinct from new-session; same window/modal guards.
    case "schedule-session": {
      if (IS_MAIN_WINDOW && !state.newSessionOpen) state.openSchedule();
      return "swallow";
    }
    // ⌘B (#168): main window only (a detached canvas window has no sidebar).
    case "toggle-sidebar": {
      if (IS_MAIN_WINDOW) state.toggleSidebarCollapsed();
      return "swallow";
    }
    // ⌘K (#189): main window only; inert while another modal is open.
    case "open-launcher": {
      if (IS_MAIN_WINDOW && !state.createPanelOpen && !state.newSessionOpen) {
        state.openCreatePanel();
      }
      return "swallow";
    }
    // ⌘F (#337): the same chord opens and closes; inert while the new-session or
    // create-panel modal is open (mirrors ⌘K's guard). Main window only. The old
    // #399 both-modifiers escape (macOS Ctrl+⌘+F native fullscreen) is now
    // structural: that combo serializes as "mod+ctrl+f", which matches nothing.
    case "global-search": {
      if (IS_MAIN_WINDOW) {
        if (state.globalSearchOpen) state.closeGlobalSearch();
        else if (!state.createPanelOpen && !state.newSessionOpen) {
          state.openGlobalSearch();
        }
      }
      return "swallow";
    }
    // ⌘E (#157/#284): same chord opens (the selected item — hover-focus #371 keeps
    // the selection on the hovered panel, so the panel under the cursor is what
    // maximizes) and closes. Works in both windows (big mode is per-window).
    case "big-mode": {
      state.toggleMaximizeSelected();
      return "swallow";
    }
    // ⌘D (task 373): main window only; inert while the Settings modal is open so
    // its draft can't clobber the toggle on Save.
    case "dense-panels": {
      if (IS_MAIN_WINDOW && !state.settingsOpen) state.toggleDensePanels();
      return "swallow";
    }
    // ⌘O: open the selected item's folder in the preferred editor (an agent's
    // `repoPath` is already its worktree for worktree agents); first use opens the
    // picker modal. Works in both windows like big-mode (the agent-header ⋯ menu
    // renders in detached canvases too). Inert while the Settings modal is open —
    // the picker's remember-write must not clobber the draft (the ⌘D guard) — and
    // while the picker itself is already up. No selection = safe no-op.
    case "open-in-editor": {
      if (!state.settingsOpen && !state.editorPickerOpen) {
        const content = contentForSelected(state);
        if (content?.repoPath) void state.openInEditor(content.repoPath);
      }
      return "swallow";
    }
    // ⌘⇧O: always re-open the editor picker for the selected item's folder (change
    // the remembered choice without visiting Settings). Same guards as ⌘O.
    case "choose-editor": {
      if (!state.settingsOpen && !state.editorPickerOpen) {
        const content = contentForSelected(state);
        if (content?.repoPath) state.openEditorPicker(content.repoPath);
      }
      return "swallow";
    }
    // ⌘W: close what the user is looking at (see store.closeFocusedPanel) — in
    // Attention it removes (kills + forgets) the focused agent, the view's primary
    // close affordance. Inert while a modal owns the keyboard — and still swallowed
    // there, so the chord can never fall through to a WebView "close window" default.
    case "close-panel": {
      const modalOpen =
        state.newSessionOpen ||
        state.settingsOpen ||
        state.globalSearchOpen ||
        state.createPanelOpen;
      if (!modalOpen) state.closeFocusedPanel();
      return "swallow";
    }
    // ⌘, — the OS-conventional Settings chord. Open-only (Escape/Save close the
    // modal); main window only (Settings lives in the main ModalHost).
    case "open-settings": {
      if (
        IS_MAIN_WINDOW &&
        !state.settingsOpen &&
        !state.newSessionOpen &&
        !state.createPanelOpen
      ) {
        state.setSettingsOpen(true);
      }
      return "swallow";
    }
    // ⌥1/⌥2/⌥3 — direct view switching (replaces the removed ⌘\ cycle). Like the
    // old ⌘\ guard, the event **passes through** when a modal owns the keyboard or
    // this is a detached window (#84 — no Overview), so ⌥-glyph typing in a modal
    // input / detached editor still works.
    case "view-overview":
    case "view-attention":
    case "view-canvas": {
      if (
        !IS_MAIN_WINDOW ||
        state.newSessionOpen ||
        state.settingsOpen ||
        state.createPanelOpen ||
        state.globalSearchOpen
      ) {
        return "pass";
      }
      state.setView(
        action === "view-overview"
          ? "overview"
          : action === "view-attention"
            ? "attention"
            : "canvas",
      );
      return "swallow";
    }
  }
}

export function useKeyboardNav(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Settings → Shortcuts is recording a chord: the recorder owns the next
      // keydown outright — dispatch nothing, swallow nothing.
      if (keybindCaptureActive()) return;

      const platform = effectivePlatform();
      const chord = eventChord(e, platform);

      // --- Fixed contextual chords (not rebindable) ---

      // ⌘S / Ctrl+S — in manual-save mode (#162), flush the focused file editor
      // (or all dirty buffers if none is focused) instead of the browser default.
      // In auto mode, leave the keystroke alone (nothing to hijack). Works in the
      // main and detached canvas windows (both can host file/kanban editors).
      if (chord === "mod+s") {
        if (!useStore.getState().settings.autoSave) {
          e.preventDefault();
          e.stopPropagation();
          saveFocused();
        }
        return;
      }

      // ⌘⏎ / Ctrl+Enter — dismiss the selected agent in the Attention view (#398):
      // it leaves the queue (and the page) but stays alive, and selection advances
      // to the next queued agent. Only in the Attention view of the main window,
      // and inert while a modal owns the keyboard — otherwise the combo passes
      // straight through (return WITHOUT preventing default) so ⌘⏎ still reaches a
      // focused terminal.
      if (chord === "mod+enter") {
        const state = useStore.getState();
        if (
          !IS_MAIN_WINDOW ||
          state.view !== "attention" ||
          state.newSessionOpen ||
          state.settingsOpen ||
          state.globalSearchOpen
        ) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (state.selectedId) state.dismissAttention(state.selectedId);
        return;
      }

      // ⌘⌥1 … ⌘⌥6 — open the Create-panel launcher straight to the folder step for
      // type N (#189). Distinct from the rebindable ⌥1–⌥3 view chords (these carry
      // `mod`). Main window only; inert while another modal is open.
      if (chord && /^mod\+alt\+[1-6]$/.test(chord)) {
        e.preventDefault();
        e.stopPropagation();
        if (IS_MAIN_WINDOW) {
          const { createPanelOpen, newSessionOpen, openCreatePanel } =
            useStore.getState();
          if (!createPanelOpen && !newSessionOpen) {
            const type = panelTypeForDigit(Number(chord.slice(-1)));
            if (type) openCreatePanel(type);
          }
        }
        return;
      }

      // --- Rebindable actions (the keybinds registry + user overrides) ---
      if (chord) {
        const action = keybindMapFor(useStore.getState().settings.keybinds).get(
          chord,
        );
        if (action) {
          if (runKeybindAction(action) === "swallow") {
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }
      }

      // --- Plain Shift + Arrow — context-sensitive (#24/#76). Leave Cmd/Ctrl/Alt
      // combos (and claude's own Shift usage) untouched.
      if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key;
      const isArrow =
        key === "ArrowLeft" ||
        key === "ArrowRight" ||
        key === "ArrowUp" ||
        key === "ArrowDown";
      if (!isArrow) return;

      // Never hijack Shift+arrows from a real text field — that's selection.
      // xterm's helper textarea is exempt (inside `.xterm`): intercepting ahead of
      // the PTY is exactly the intent there.
      if (isEditableTarget(e.target)) return;

      const state = useStore.getState();
      // Don't navigate while the new-session modal/popover is open (#27).
      if (state.newSessionOpen) return;

      // Attention (#398): Shift+↑/↓ cycle the triage queue selection (prev/next). Main
      // window only (the Attention view never renders in a detached canvas window).
      // Shift+←/→ are inert here. Uses the SAME `attentionQueue` ordering the view
      // renders, so nav can never land on a non-queued agent.
      if (state.view === "attention" && IS_MAIN_WINDOW) {
        if (key === "ArrowUp" || key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          const ids = attentionQueue({
            sessions: state.sessions,
            sessionBusy: state.sessionBusy,
            sessionActive: state.sessionActive,
            dismissed: state.dismissedAttention,
            idleSince: state.sessionIdleSince,
            recurringChildIds: ownedChildSessionIds(state.recurrings),
          }).map((q) => q.id);
          const id = adjacentId(
            ids,
            state.selectedId,
            key === "ArrowDown" ? 1 : -1,
          );
          if (id) state.select(id);
        }
        return;
      }

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
          recurrings: state.recurrings,
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
