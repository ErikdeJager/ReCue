// Windows terminal paste (#220), extracted from terminalPool so it's unit-testable.
//
// By terminal convention xterm forwards Ctrl+V as the literal control byte ^V (0x16)
// rather than pasting, so on Windows we intercept the Ctrl+V / Ctrl+Shift+V chord,
// read the OS clipboard ourselves, and paste it. Returning false stops xterm's
// keydown→data path (no stray ^V reaches the PTY) — but ONLY that path: xterm's
// `_keyDown` early-returns on a custom-handler false WITHOUT calling
// `preventDefault()`, so the browser still performed its default Ctrl+V action,
// firing a native `paste` event on xterm's hidden textarea that xterm pasted a
// SECOND time (the Windows double-paste bug). `preventDefault()` cancels that
// default action, leaving exactly one paste — the manual one, which also covers the
// image fallback the native path can't. macOS/Linux are untouched: the handler
// returns true before touching the event when `isWin()` is false (⌘V keeps its
// native paste; Ctrl+V stays ^V). Ctrl+C is never touched, so it remains the
// agent's SIGINT.

/** The slice of `KeyboardEvent` the handler reads — structural, so tests can pass
 * a plain object; a real `KeyboardEvent` satisfies it. */
export interface PasteKeyEvent {
  type: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  key: string;
  preventDefault: () => void;
}

export interface PasteKeyDeps {
  /** Live platform check (read from the store at keystroke time). */
  isWin: () => boolean;
  /** `term.paste` — bracketed-paste-aware (multi-line OK). */
  paste: (text: string) => void;
  /** OS clipboard text, or null when it holds none (ipc `clipboardReadText`). */
  readText: () => Promise<string | null>;
  /** Save a clipboard image to a temp PNG, returning its path, or null
   * (ipc `saveClipboardImage`). */
  saveImage: () => Promise<string | null>;
}

/** Build the `attachCustomKeyEventHandler` callback for a pooled terminal. */
export function makePasteKeyHandler(deps: PasteKeyDeps) {
  return (event: PasteKeyEvent): boolean => {
    if (event.type !== "keydown") return true;
    if (!deps.isWin()) return true;
    const isPaste =
      event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      (event.key === "v" || event.key === "V");
    if (!isPaste) return true;
    // Suppress the browser's default paste action — without this the native
    // `paste` event still fires on xterm's textarea and pastes a second time.
    event.preventDefault();
    // Read text first; fall back to an image (saved as a temp PNG, its path pasted
    // so claude attaches it).
    void (async () => {
      try {
        const text = await deps.readText();
        if (text) {
          deps.paste(text);
          return;
        }
        const imagePath = await deps.saveImage();
        if (imagePath) deps.paste(imagePath);
      } catch {
        // best-effort: nothing pastes on a clipboard failure
      }
    })();
    return false;
  };
}
