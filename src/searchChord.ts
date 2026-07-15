// The global-search chord (#337/#399), extracted as a pure predicate so it's
// unit-testable (precedents: Terminal/pasteHandler.ts, Terminal/hoverFocus.ts).

/** The slice of `KeyboardEvent` the predicate reads — structural, so tests can
 * pass a plain object; a real `KeyboardEvent` satisfies it. */
export interface ChordEvent {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  key: string;
}

/** True for the global-search chord: ⌘F on macOS / Ctrl+F on Windows & Linux —
 * i.e. EXACTLY ONE of Cmd/Ctrl, no Shift/Alt, the F key. When BOTH Cmd and Ctrl
 * are held (macOS Ctrl+⌘+F = native fullscreen, #399) this is false, so the
 * caller does not `preventDefault` and the combo passes through to the OS.
 * Platform-agnostic — no dependence on the async `platform()` signal, so it is
 * correct from the first frame. */
export function isGlobalSearchChord(e: ChordEvent): boolean {
  return (
    (e.metaKey || e.ctrlKey) &&
    !(e.metaKey && e.ctrlKey) &&
    !e.shiftKey &&
    !e.altKey &&
    e.key.toLowerCase() === "f"
  );
}
