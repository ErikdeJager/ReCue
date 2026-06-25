// Shared text-input props (#170). macOS WKWebView auto-capitalizes the first letter
// of (and auto-corrects) typed text via the system substitution layer, which leaks
// into the app's text fields — turning `fix-foo` into `Fix-foo` in a branch-name box,
// mangling identifiers, paths, and `/`-prefixed claude prompts. For a developer tool
// "keep whatever was typed" is the safe default, so every text `<input>`/`<textarea>`
// spreads this object. Both attributes are needed: on macOS WebKit the first-letter
// capitalization rides the auto-correct layer, so `autoCorrect="off"` is the reliable
// lever, paired with `autoCapitalize="none"`. `spellCheck` is deliberately untouched —
// red squiggles don't alter typed text.
export const noAutoCapitalize = {
  autoCapitalize: "none",
  autoCorrect: "off",
} as const;
