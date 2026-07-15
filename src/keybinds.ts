// Configurable keyboard shortcuts — the registry + pure chord logic.
//
// Every **rebindable** global shortcut is an action in `KEYBIND_ACTIONS` with a
// default chord; the user's overrides persist in `settings.keybinds` (action id →
// serialized chord, `""` = unbound) and win over the defaults. `useKeyboardNav.ts`
// dispatches by serializing each keydown (`eventChord`) and looking it up in
// `keybindMapFor`; Settings → Shortcuts edits the overrides with `captureProblem`
// guarding the recorder. Contextual chords (⌘S manual save, ⌘⏎, ⌘⌥1–6, Shift+arrows,
// the diff-viewer keys) stay hardcoded and are listed read-only in
// `components/Settings/shortcuts.ts`.
//
// Chord serialization: `"mod+alt+shift+<key>"` — modifiers in the canonical order
// mod, ctrl, super, alt, shift; the key token last. **`mod` is platform-resolved**:
// ⌘ on macOS, Ctrl on Windows AND Linux (the app-wide display rule, #143/#345). On
// macOS a *bare* Ctrl chord serializes with the distinct `ctrl` token, so ⌃E is NOT
// ⌘E — control chords flow through to a focused terminal's readline instead of being
// swallowed by the app (the old `metaKey || ctrlKey` matching stole them). Keys match
// on `KeyboardEvent.code` (the physical key) wherever possible, so ⌥1 works on macOS
// even though Option+digit composes a glyph in `e.key`, and letter chords survive
// non-QWERTY layouts (the `e.code` precedent of the ⌘E/⌘D/⌘⌥1–6 handlers).

import { isLinux, isWindows } from "./platform";

export type KeybindActionId =
  | "view-overview"
  | "view-attention"
  | "view-canvas"
  | "close-panel"
  | "big-mode"
  | "dense-panels"
  | "open-launcher"
  | "new-session"
  | "schedule-session"
  | "global-search"
  | "toggle-sidebar"
  | "open-settings";

export interface KeybindAction {
  id: KeybindActionId;
  /** Row label in Settings → Shortcuts. */
  label: string;
  /** Settings → Shortcuts group heading. */
  group: string;
  /** Default serialized chord (e.g. `"mod+w"`, `"alt+1"`). */
  defaultChord: string;
}

/** The rebindable actions, in Settings display order. Dispatch is deterministic:
 * when two actions resolve to the same chord (only possible via a hand-edited
 * settings blob — the recorder refuses conflicts), the earlier entry wins. */
export const KEYBIND_ACTIONS: readonly KeybindAction[] = [
  {
    id: "view-overview",
    label: "Go to Overview",
    group: "Views",
    defaultChord: "alt+1",
  },
  {
    id: "view-attention",
    label: "Go to Attention",
    group: "Views",
    defaultChord: "alt+2",
  },
  {
    id: "view-canvas",
    label: "Go to Canvas",
    group: "Views",
    defaultChord: "alt+3",
  },
  {
    id: "close-panel",
    label: "Close the focused panel",
    group: "Panels",
    defaultChord: "mod+w",
  },
  {
    id: "big-mode",
    label: "Toggle big mode for the selected item",
    group: "Panels",
    defaultChord: "mod+e",
  },
  {
    id: "dense-panels",
    label: "Toggle dense panels",
    group: "Panels",
    defaultChord: "mod+d",
  },
  {
    id: "open-launcher",
    label: "Open the panel launcher",
    group: "Panels",
    defaultChord: "mod+k",
  },
  {
    id: "new-session",
    label: "New session",
    group: "Sessions",
    defaultChord: "mod+n",
  },
  {
    id: "schedule-session",
    label: "Schedule session",
    group: "Sessions",
    defaultChord: "mod+shift+n",
  },
  {
    id: "global-search",
    label: "Global search",
    group: "App",
    defaultChord: "mod+f",
  },
  {
    id: "toggle-sidebar",
    label: "Collapse / expand the sidebar",
    group: "App",
    defaultChord: "mod+b",
  },
  {
    id: "open-settings",
    label: "Open Settings",
    group: "App",
    defaultChord: "mod+,",
  },
];

/** Per-action overrides persisted in `settings.keybinds`: action id → serialized
 * chord, `""` = explicitly unbound. Only overrides are stored (an untouched action
 * has no key), so new defaults reach existing installs. */
export type KeybindOverrides = Record<string, string>;

/** The slice of `KeyboardEvent` the chord logic reads — structural, so the node
 * unit tests can pass plain objects (the `searchChord.ts` precedent). */
export interface ChordKeyEvent {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  key: string;
  code: string;
}

const MOD_ORDER = ["mod", "ctrl", "super", "alt", "shift"] as const;
type ModToken = (typeof MOD_ORDER)[number];

/** Punctuation / editing keys addressed by physical `e.code`. */
const CODE_TOKENS: Record<string, string> = {
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  Enter: "enter",
  NumpadEnter: "enter",
  Space: "space",
  Tab: "tab",
  Backspace: "backspace",
  Delete: "delete",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

const FKEY_RE = /^f([1-9]|1[0-2])$/;

/** Every non-modifier token the serializer can produce (used to validate persisted
 * overrides in `normalizeChord`). */
function isKeyToken(token: string): boolean {
  return (
    /^[a-z]$/.test(token) ||
    /^[0-9]$/.test(token) ||
    FKEY_RE.test(token) ||
    Object.values(CODE_TOKENS).includes(token)
  );
}

/** The chord key token for a keydown, from the **physical** `e.code` where possible
 * (letters, digits, punctuation — layout- and ⌥-glyph-proof), falling back to `e.key`
 * for named keys (F1–F12). `null` for a modifier-only keydown or an unmappable key. */
export function eventKeyToken(e: ChordKeyEvent): string | null {
  const code = e.code;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6);
  const mapped = CODE_TOKENS[code];
  if (mapped) return mapped;
  const key = e.key.toLowerCase();
  if (FKEY_RE.test(key)) return key;
  return null;
}

/** True when the platform string reads as Windows/Linux (Ctrl-as-mod); the empty
 * pre-load string reads as macOS, matching `kbdHint`. */
function ctrlIsMod(platform: string): boolean {
  return isWindows(platform) || isLinux(platform);
}

/**
 * Serialize a keydown to its chord string for lookup, or `null` when the event has
 * no key token (a bare modifier press). Platform-resolved: on macOS `metaKey` is
 * `mod` and `ctrlKey` the separate `ctrl` token (so ⌃+⌘+F ≠ ⌘F — the #399 native
 * fullscreen chord falls through unmatched, and bare ⌃-chords reach the terminal);
 * on Windows/Linux `ctrlKey` is `mod` and `metaKey` the (rarely delivered) `super`.
 */
export function eventChord(e: ChordKeyEvent, platform: string): string | null {
  const key = eventKeyToken(e);
  if (!key) return null;
  const mods: ModToken[] = [];
  if (ctrlIsMod(platform)) {
    if (e.ctrlKey) mods.push("mod");
    if (e.metaKey) mods.push("super");
  } else {
    if (e.metaKey) mods.push("mod");
    if (e.ctrlKey) mods.push("ctrl");
  }
  if (e.altKey) mods.push("alt");
  if (e.shiftKey) mods.push("shift");
  return [...mods, key].join("+");
}

/**
 * Canonicalize a serialized chord (sort modifiers, lowercase, validate). Returns
 * `""` for anything invalid — a hand-edited settings blob can never crash dispatch,
 * it just reads as unbound. `""` in → `""` out (explicitly unbound).
 */
export function normalizeChord(chord: string): string {
  if (!chord) return "";
  const parts = chord.toLowerCase().split("+");
  // A "+" key token would split wrong; the serializer never emits one, so any
  // empty segment marks an invalid chord.
  if (parts.some((p) => p.length === 0)) return "";
  const key = parts[parts.length - 1] as string;
  const mods = parts.slice(0, -1);
  if (!isKeyToken(key)) return "";
  const seen = new Set<string>();
  for (const m of mods) {
    if (!MOD_ORDER.includes(m as ModToken) || seen.has(m)) return "";
    seen.add(m);
  }
  const ordered = MOD_ORDER.filter((m) => seen.has(m));
  return [...ordered, key].join("+");
}

/** The effective chord for an action: the (normalized) override when present —
 * `""` = unbound — else the action's default. */
export function chordForAction(
  id: KeybindActionId,
  overrides: KeybindOverrides | undefined,
): string {
  const action = KEYBIND_ACTIONS.find((a) => a.id === id);
  if (!action) return "";
  const raw = overrides?.[id];
  if (raw === undefined) return action.defaultChord;
  return normalizeChord(raw);
}

/** chord → action lookup for dispatch. First registry entry wins a (blob-forced)
 * duplicate, so dispatch stays deterministic. */
export function resolveKeybindMap(
  overrides: KeybindOverrides | undefined,
): Map<string, KeybindActionId> {
  const map = new Map<string, KeybindActionId>();
  for (const action of KEYBIND_ACTIONS) {
    const chord = chordForAction(action.id, overrides);
    if (chord && !map.has(chord)) map.set(chord, action.id);
  }
  return map;
}

// The resolved map is rebuilt only when the overrides object identity changes —
// the store replaces `settings` wholesale on Save, so this caches across the
// (very hot) per-keydown lookups.
let mapCache: {
  ref: KeybindOverrides | undefined;
  map: Map<string, KeybindActionId>;
} | null = null;

/** Cached `resolveKeybindMap` keyed on the overrides object identity. */
export function keybindMapFor(
  overrides: KeybindOverrides | undefined,
): Map<string, KeybindActionId> {
  if (!mapCache || mapCache.ref !== overrides) {
    mapCache = { ref: overrides, map: resolveKeybindMap(overrides) };
  }
  return mapCache.map;
}

/** Display label for a key token: single keys uppercase, named keys spelled out
 * (mac gets the ⏎ glyph + arrow glyphs the app already uses). */
function keyTokenLabel(token: string, mac: boolean): string {
  const NAMED: Record<string, [string, string]> = {
    // token: [mac, windows/linux]
    enter: ["⏎", "Enter"],
    space: ["Space", "Space"],
    tab: ["Tab", "Tab"],
    backspace: ["⌫", "Backspace"],
    delete: ["⌦", "Delete"],
    home: ["Home", "Home"],
    end: ["End", "End"],
    pageup: ["PgUp", "PgUp"],
    pagedown: ["PgDn", "PgDn"],
    left: ["←", "←"],
    right: ["→", "→"],
    up: ["↑", "↑"],
    down: ["↓", "↓"],
  };
  const named = NAMED[token];
  if (named) return mac ? named[0] : named[1];
  return token.toUpperCase();
}

/**
 * Human-readable chord label, platform-styled like `kbdHint`: macOS glyphs in the
 * app's established ⌘⌃⌥⇧ order ("⌘⇧N", "⌥1"), the "Ctrl+Shift+N" / "Alt+1" form on
 * Windows and Linux. `""` (unbound) renders as `""`.
 */
export function chordLabel(chord: string, platform: string): string {
  const normalized = normalizeChord(chord);
  if (!normalized) return "";
  const parts = normalized.split("+");
  const key = parts[parts.length - 1] as string;
  const mods = new Set(parts.slice(0, -1));
  const mac = !ctrlIsMod(platform);
  if (mac) {
    const glyphs = [
      mods.has("mod") ? "⌘" : "",
      mods.has("ctrl") ? "⌃" : "",
      // `super` can't be produced on macOS (meta serializes as `mod`); a
      // blob-forced one still renders visibly rather than vanishing.
      mods.has("super") ? "Super+" : "",
      mods.has("alt") ? "⌥" : "",
      mods.has("shift") ? "⇧" : "",
    ].join("");
    return `${glyphs}${keyTokenLabel(key, true)}`;
  }
  const words = [
    mods.has("mod") ? "Ctrl" : "",
    mods.has("ctrl") ? "Ctrl" : "",
    mods.has("super") ? "Super" : "",
    mods.has("alt") ? "Alt" : "",
    mods.has("shift") ? "Shift" : "",
  ].filter(Boolean);
  return [...words, keyTokenLabel(key, false)].join("+");
}

/** The fixed contextual chord that toggles "Run in dev container" on the
 * new-session branch step (matched with `eventChord` in the modal's form handler,
 * labeled with `chordLabel` — ⌘⇧C on macOS, Ctrl+Shift+C on Windows/Linux). One
 * source of truth for the modal kbd chip, the Settings reference row, and the
 * reserved-chords set below. */
export const CONTAINER_TOGGLE_CHORD = "mod+shift+c";

/**
 * Chords the recorder refuses because something above the registry owns them:
 * hardcoded app handlers (⌘S manual save, ⌘⏎, the ⌘⌥1–6 launcher, the ⌘⇧C
 * dev-container toggle), OS/menu accelerators that would preempt or shadow the
 * binding (macOS Quit/Hide/Minimize, the Edit-menu clipboard set, our ⇧⌘W Close
 * Window), and core editing chords on every platform (clipboard/undo — stealing
 * those would break every input field).
 */
export function reservedChords(platform: string): Set<string> {
  const reserved = new Set<string>([
    "mod+s",
    "mod+enter",
    "mod+c",
    "mod+v",
    "mod+x",
    "mod+a",
    "mod+z",
    "mod+shift+z",
    CONTAINER_TOGGLE_CHORD,
    ...[1, 2, 3, 4, 5, 6].map((n) => `mod+alt+${n}`),
  ]);
  if (ctrlIsMod(platform)) {
    reserved.add("mod+y"); // Windows/Linux redo
    reserved.add("alt+f4"); // OS window close (never reaches the webview)
  } else {
    reserved.add("mod+q"); // Quit (app-menu accelerator)
    reserved.add("mod+h"); // Hide
    reserved.add("mod+m"); // Minimize
    reserved.add("mod+shift+w"); // our Close Window menu item
    reserved.add("mod+ctrl+f"); // native fullscreen (#399)
    reserved.add("mod+`"); // macOS window cycling
  }
  return reserved;
}

/** Why a captured chord can't be used, or `null` when it's acceptable. */
export type CaptureProblem =
  | { kind: "needs-modifier" }
  | { kind: "reserved" }
  | { kind: "taken"; takenBy: KeybindActionId };

/**
 * Validate a chord the Settings recorder captured for `id`: it must carry a real
 * modifier (mod/ctrl/super/alt — Shift alone shadows typing) unless it's a bare
 * F-key; it must not be reserved; and it must not collide with another action's
 * effective chord. `null` = OK to assign.
 */
export function captureProblem(
  chord: string,
  id: KeybindActionId,
  overrides: KeybindOverrides | undefined,
  platform: string,
): CaptureProblem | null {
  const normalized = normalizeChord(chord);
  if (!normalized) return { kind: "needs-modifier" };
  const parts = normalized.split("+");
  const key = parts[parts.length - 1] as string;
  const mods = parts.slice(0, -1);
  const hasRealMod = mods.some((m) => m !== "shift");
  if (!hasRealMod && !FKEY_RE.test(key)) return { kind: "needs-modifier" };
  if (reservedChords(platform).has(normalized)) return { kind: "reserved" };
  for (const action of KEYBIND_ACTIONS) {
    if (action.id === id) continue;
    if (chordForAction(action.id, overrides) === normalized) {
      return { kind: "taken", takenBy: action.id };
    }
  }
  return null;
}

/** Duplicate-chord detection over the effective bindings (only reachable via a
 * hand-edited blob — the recorder refuses conflicts): chord → the 2+ actions
 * sharing it. Settings uses it to badge conflicted rows. */
export function keybindConflicts(
  overrides: KeybindOverrides | undefined,
): Map<string, KeybindActionId[]> {
  const byChord = new Map<string, KeybindActionId[]>();
  for (const action of KEYBIND_ACTIONS) {
    const chord = chordForAction(action.id, overrides);
    if (!chord) continue;
    byChord.set(chord, [...(byChord.get(chord) ?? []), action.id]);
  }
  return new Map([...byChord].filter(([, ids]) => ids.length > 1));
}

/**
 * True when `target` is a real text-entry element the global shortcuts must not
 * hijack **plain/Shift keys** from (an <input>/<textarea>/<select>/contenteditable)
 * — but NOT xterm's hidden helper <textarea> (inside `.xterm`), which the arrow
 * shortcuts deliberately intercept ahead of the PTY. Mirrors the
 * `Terminal/hoverFocus.ts` contract; structural for node tests. Modifier chords are
 * unaffected — they don't type text.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  if (el.closest(".xterm")) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return !!el.isContentEditable;
}

// --- Recorder gate -----------------------------------------------------------
// While Settings → Shortcuts is recording a chord, the global dispatcher must not
// act on (or swallow) anything — the recorder owns the next keydown. A module
// singleton is enough: the Settings modal exists only in the main window, and each
// window is its own document (#84).

let capturingKeybind = false;

/** Flip the "Settings is recording a chord" gate (recorder mount/unmount). */
export function setKeybindCapture(active: boolean): void {
  capturingKeybind = active;
}

/** True while the Settings recorder owns the next keydown. */
export function keybindCaptureActive(): boolean {
  return capturingKeybind;
}
