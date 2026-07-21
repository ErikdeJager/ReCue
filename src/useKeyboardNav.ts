// Global keyboard shortcuts — the dispatcher for the configurable keybind system
// (`src/keybinds.ts`).
//
// **Rebindable** actions resolve through the registry + the user's
// `settings.keybinds` overrides (Settings → Shortcuts). The defaults:
//
//   ⌥1 / ⌥2 / ⌥3       switch to Overview / Attention / Canvas
//   ⌘W / Ctrl+W        close the focused panel (big mode → Canvas leaf → Overview × →
//                      remove the focused Attention agent; the destructive
//                      fall-throughs are confirm-gated by `confirmDestructive`, and
//                      typed into a focused terminal the chord passes through to
//                      the PTY — Ctrl+W is delete-word there, task 448)
//   ⌘, / Ctrl+,        open Settings
//   ⌘E / Ctrl+E        toggle big mode for the selected item              (#284)
//   ⌘N / Ctrl+N        open the new-session flow from anywhere            (#26)
//   ⌘⇧N / Ctrl+Shift+N open the schedule-session flow                     (#93)
//   ⌘B / Ctrl+B        collapse / expand the sidebar                      (#168)
//   ⌘K / Ctrl+K        open the Create-panel launcher (type step)         (#189)
//   ⌘F / Ctrl+F        toggle the global search modal                     (#337)
//   ⌘D / Ctrl+D        toggle dense panels (UI v2 §9)                     (#373)
//   ⌘O / Ctrl+O        open the selected item's folder in your editor
//   ⌘⇧O / Ctrl+Shift+O choose the editor "Open in editor" uses
//   ⌘⌥N / Ctrl+Alt+N   open a new app window                           (10/16)
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
// swallowed those. **Bare-⌥/Alt chords** (the ⌥1/⌥2/⌥3 view defaults, or any
// alt-only rebind) also pass through when any modal owns the keyboard (the
// `anyModalOpen` pass in the view-* cases) OR when the target is editable / a
// focused terminal (#449) — a layout can compose them into typed glyphs (⌥2 = @
// on Nordic, ⌥3 = # on UK), so with a terminal focused ⌥1/⌥2/⌥3 type into the
// PTY; use the ViewSwitch (or click) to switch views from there. Every other
// key (normal typing, Shift+letters, other combos) passes straight through.

import { useEffect } from "react";

import { attentionQueue } from "./components/Attention/attentionQueue";
import { panelTypeForDigit } from "./components/CreatePanelModal/panelTypes";
import {
  eventChord,
  isBareAltChord,
  isEditableTarget,
  isTerminalTarget,
  keybindCaptureActive,
  keybindMapFor,
  terminalClaimsChord,
  type KeybindActionId,
} from "./keybinds";
import { detectPlatform } from "./platform";
import { saveFocused } from "./saverRegistry";
import { detectedWorktreeParents } from "./worktrees";
import {
  adjacentId,
  contentForSelected,
  overviewClusterKeys,
  ownedChildSessionIds,
  useStore,
} from "./store";

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
 * stopPropagation even when the action was inert (the established semantics of
 * ⌘N/⌘B/⌘K); `pass` = leave the event alone so it reaches the focused element /
 * modal (the old ⌘\ guard behavior). */
type Dispatch = "swallow" | "pass";

/** Every modal that can own the keyboard — the full #425 list. Guards any chord
 * whose action could otherwise land on the card/panel BEHIND a dialog (or yank
 * the view out from under one); new modal flags must be added here. */
function anyModalOpen(state: ReturnType<typeof useStore.getState>): boolean {
  return (
    state.newSessionOpen ||
    state.settingsOpen ||
    state.globalSearchOpen ||
    state.createPanelOpen ||
    state.templateEditorOpen ||
    state.templateManagerOpen ||
    state.templateUseOpen ||
    state.cloneRepoOpen ||
    state.onboardingOpen ||
    state.editorPickerOpen ||
    state.canvasClosePromptId !== null ||
    // The ⌘W destructive-close confirm (task 448) — chords must not act behind it.
    state.removePrompt !== null ||
    state.update.confirming
  );
}

/** Run a rebindable action with its window/modal guards. Each case preserves the
 * exact guard semantics its hardcoded predecessor had. */
function runKeybindAction(action: KeybindActionId): Dispatch {
  const state = useStore.getState();
  switch (action) {
    // ⌘N (#26): no-op when the flow is already open.
    case "new-session": {
      if (!state.newSessionOpen) state.openNewSession();
      return "swallow";
    }
    // ⌘⇧N (#93): distinct from new-session; same modal guard.
    case "schedule-session": {
      if (!state.newSessionOpen) state.openSchedule();
      return "swallow";
    }
    // ⌘B (#168): collapse / expand this window's sidebar.
    case "toggle-sidebar": {
      state.toggleSidebarCollapsed();
      return "swallow";
    }
    // ⌘⌥N (Multi-window 10/16): open a new full app window. Unconditional — it is
    // non-destructive and meaningful from every window kind (main and app-*: this
    // hook mounts in all of them), and needs no modal guard.
    case "new-window": {
      state.openNewWindow();
      return "swallow";
    }
    // ⌘K (#189): inert while another modal is open.
    case "open-launcher": {
      if (!state.createPanelOpen && !state.newSessionOpen) {
        state.openCreatePanel();
      }
      return "swallow";
    }
    // ⌘F (#337): the same chord opens and closes; inert while the new-session or
    // create-panel modal is open (mirrors ⌘K's guard). The old #399 both-modifiers
    // escape (macOS Ctrl+⌘+F native fullscreen) is now structural: that combo
    // serializes as "mod+ctrl+f", which matches nothing.
    case "global-search": {
      if (state.globalSearchOpen) state.closeGlobalSearch();
      else if (!state.createPanelOpen && !state.newSessionOpen) {
        state.openGlobalSearch();
      }
      return "swallow";
    }
    // ⌘E (#157/#284): same chord opens (the selected item — hover-focus #371 keeps
    // the selection on the hovered panel, so the panel under the cursor is what
    // maximizes) and closes. Big mode is per-window.
    case "big-mode": {
      state.toggleMaximizeSelected();
      return "swallow";
    }
    // ⌘D (task 373): inert while the Settings modal is open so its draft can't
    // clobber the toggle on Save.
    case "dense-panels": {
      if (!state.settingsOpen) state.toggleDensePanels();
      return "swallow";
    }
    // ⌘O: open the selected item's folder in the preferred editor (an agent's
    // `repoPath` is already its worktree for worktree agents); first use opens the
    // picker modal. Inert while the Settings modal is open —
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
    // close affordance. Inert while ANY modal owns the keyboard — every modal flag,
    // not just the four keyboard-opened ones: since #425 the Overview fall-through
    // is destructive (removeSession / cancelSchedule / cancelRecurring — since task
    // 448 confirm-gated by the `confirmDestructive` setting), so a chord
    // aimed at dismissing a dialog must never reach the card behind it. Still
    // swallowed there, so the chord can never fall through to a WebView "close
    // window" default. (A focused-terminal keydown never reaches this case — the
    // dispatcher's terminalClaimsChord guard passes it to the PTY, task 448.)
    case "close-panel": {
      if (!anyModalOpen(state)) state.closeFocusedPanel();
      return "swallow";
    }
    // ⌘, — the OS-conventional Settings chord. Open-only (Escape/Save close the
    // modal); each window has its own ModalHost (task 434).
    case "open-settings": {
      if (
        !state.settingsOpen &&
        !state.newSessionOpen &&
        !state.createPanelOpen
      ) {
        state.setSettingsOpen(true);
      }
      return "swallow";
    }
    // ⌥1/⌥2/⌥3 — direct view switching (replaces the removed ⌘\ cycle). Like the
    // old ⌘\ guard, the event **passes through** when a modal owns the keyboard —
    // EVERY modal, so ⌥-glyph typing (⌥2 = @ on Nordic layouts) in any modal
    // input still types instead of flipping the view under the dialog. The
    // dispatch block additionally passes bare-⌥ chords through for editable /
    // focused-terminal targets (#449) — deliberately: with a terminal focused,
    // ⌥1/⌥2/⌥3 type into the PTY; switch views via the ViewSwitch or a click.
    case "view-overview":
    case "view-attention":
    case "view-canvas": {
      if (anyModalOpen(state)) {
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
      // In auto mode, leave the keystroke alone (nothing to hijack). Works in
      // every window (each can host file/kanban editors).
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
      // to the next queued agent. Only in the Attention view, and inert while ANY
      // modal owns the keyboard (the close-panel rule: a chord aimed at a dialog
      // must never act on the card behind it) — otherwise the combo passes straight
      // through (return WITHOUT preventing default) so ⌘⏎ still reaches the modal
      // or a focused terminal.
      if (chord === "mod+enter") {
        const state = useStore.getState();
        if (state.view !== "attention" || anyModalOpen(state)) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (state.selectedId) state.dismissAttention(state.selectedId);
        return;
      }

      // ⌘⌥1 … ⌘⌥6 — open the Create-panel launcher straight to the folder step for
      // type N (#189). Distinct from the rebindable ⌥1–⌥3 view chords (these carry
      // `mod`). Inert while another modal is open.
      if (chord && /^mod\+alt\+[1-6]$/.test(chord)) {
        e.preventDefault();
        e.stopPropagation();
        const { createPanelOpen, newSessionOpen, openCreatePanel } =
          useStore.getState();
        if (!createPanelOpen && !newSessionOpen) {
          const type = panelTypeForDigit(Number(chord.slice(-1)));
          if (type) openCreatePanel(type);
        }
        return;
      }

      // --- Rebindable actions (the keybinds registry + user overrides) ---
      if (chord) {
        const action = keybindMapFor(useStore.getState().settings.keybinds).get(
          chord,
        );
        if (action) {
          // Bare-⌥ chords (the ⌥1/⌥2/⌥3 view defaults, or any alt-only rebind)
          // compose typed glyphs on international layouts (⌥2 = @ on Nordic,
          // ⌥3 = # on UK) — never steal them from a real text field or a focused
          // terminal: return WITHOUT preventing default so the character reaches
          // the input / PTY. Mod-bearing chords are exempt (they can't type; the
          // AltGr-as-Ctrl+Alt caveat on new-window stays as documented in
          // keybinds.ts). Chord-class, not per-action, so the invariant holds
          // for ANY action rebound onto a bare-alt chord (#449).
          if (
            isBareAltChord(chord) &&
            (isEditableTarget(e.target) || isTerminalTarget(e.target))
          ) {
            return;
          }
          // Task 448: the close-panel chord typed into a focused terminal is a
          // terminal editing key (Ctrl+W = readline/claude delete-word on
          // Windows/Linux, where mod is Ctrl) — return WITHOUT preventDefault so
          // xterm forwards it to the PTY instead of the app killing the panel/
          // agent under the cursor. xterm cancels the keydown it converts to
          // data, so no WebView default can fire either.
          if (action === "close-panel" && terminalClaimsChord(e, e.target)) {
            return;
          }
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

      // Attention (#398): Shift+↑/↓ cycle the triage queue selection (prev/next).
      // Shift+←/→ are inert here. Uses the SAME `attentionQueue` ordering the view
      // renders, so nav can never land on a non-queued agent.
      if (state.view === "attention") {
        if (key === "ArrowUp" || key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          const ids = attentionQueue({
            sessions: state.sessions,
            sessionBusy: state.sessionBusy,
            sessionActive: state.sessionActive,
            dismissed: state.dismissedAttention,
            eligible: state.attentionEligible,
            idleSince: state.sessionIdleSince,
            recurringChildIds: ownedChildSessionIds(state.recurrings),
            // Cycle only the visible (filtered) queue (#445) so nav never lands on a
            // hidden agent.
            filter: state.overviewRepoFilter,
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
          worktreeParents: detectedWorktreeParents(
            state.repoWorktrees,
            state.platform,
          ),
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
