// Motion policy for the terminal cursor (UI v2 §2.5, task 383).
//
// xterm paints its cursor on canvas/WebGL, so the global.css reduced-motion
// killswitch (which zeroes CSS animation/transition durations) can never reach
// it — it would be the one animation in the app that survives reduced motion.
// The pool computes the *effective* blink instead: the user's cursorBlink
// setting, gated off while reduced motion is in force. Applied at host creation
// and on every applyTerminalSettings (Settings Save and the boot refresh both
// call it), so flipping either toggle converges every live terminal without
// disposing a host (#18). Pure + injectable, so it unit-tests in node.

/** The user's cursorBlink setting, gated by reduced motion. */
export function effectiveCursorBlink(
  cursorBlink: boolean,
  reducedMotion: boolean,
): boolean {
  return cursorBlink && !reducedMotion;
}

/**
 * Whether reduced motion is in force for this document: the app's Settings
 * toggle (`appSetting` — read from the store by the caller rather than the
 * `body.reduce-motion` class, which applySettingsEffects toggles AFTER the
 * terminal settings apply, so the class alone would lag one Save) OR the OS
 * `prefers-reduced-motion` media query. Defensive for non-DOM (unit test)
 * environments — no motion signal reads as `false`.
 */
export function reducedMotionActive(
  appSetting: boolean,
  media?: (query: string) => { matches: boolean },
): boolean {
  if (appSetting) return true;
  const mm =
    media ??
    (typeof globalThis.matchMedia === "function"
      ? (query: string) => globalThis.matchMedia(query)
      : undefined);
  if (!mm) return false;
  try {
    return mm("(prefers-reduced-motion: reduce)").matches;
  } catch {
    // A locked-down WebView throwing on matchMedia never blocks the terminal.
    return false;
  }
}
