// Pure color math for the configurable terminal background (#390).
//
// The agent/shell terminal background is near-black by default (`--terminal-bg`
// `#11111b`, deliberately kept dark in both themes, #333). A Settings → Appearance
// slider lets the user lighten it toward a soft gray without touching the
// `--terminal-bg` token itself: this helper linearly interpolates each RGB channel
// from the base (`0` = today's near-black, byte-for-byte) to a gray-ish endpoint
// (`100`). Kept pure (no DOM / xterm imports) so it's unit-testable; the pool reads
// the live base off `--terminal-bg` and publishes the result to a separate
// `--terminal-bg-user` CSS var + the xterm theme.
//
// Platform-neutral: plain JS color math, no `color-mix`, no OS-specific code — so it
// behaves identically on macOS, Windows, and Linux (incl. detached canvas windows).

/** Lightness 0 endpoint — today's terminal background (Crust). Interpolating from
 * this at `lightness === 0` reproduces `#11111b` exactly. */
export const TERMINAL_BG_DARKEST = "#11111b";

/** Lightness 100 endpoint — a soft gray. Chosen to keep readable contrast with
 * `--terminal-fg` (`#cdd6f4`): the pair computes to ~7.75:1, above the WCAG AAA 7:1
 * bar, so terminal text stays legible even at the lightest setting. */
export const TERMINAL_BG_LIGHTEST = "#3a3a45";

/** Clamp to the integer-friendly [0, 100] slider domain. NaN → 0; ±Infinity clamp
 * through the numeric min/max (Infinity → 100, -Infinity → 0). */
function clampLightness(lightness: number): number {
  if (Number.isNaN(lightness)) return 0;
  return Math.min(100, Math.max(0, lightness));
}

/** Parse `#rrggbb` (or `#rgb`) into `[r, g, b]` (0–255), or `null` when malformed. */
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m?.[1]) return null;
  let body = m[1];
  if (body.length === 3) {
    body = body
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(body.slice(0, 2), 16);
  const g = parseInt(body.slice(2, 4), 16);
  const b = parseInt(body.slice(4, 6), 16);
  return [r, g, b];
}

/** Format a channel triple as a two-hex-digit-per-channel `#rrggbb`. */
function toHex([r, g, b]: [number, number, number]): string {
  const h = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * The terminal background color for a given slider `lightness` (0–100), linearly
 * interpolated per RGB channel from `base` (the `--terminal-bg` value, default
 * `#11111b`) toward {@link TERMINAL_BG_LIGHTEST}.
 *
 * - `0` → `base` exactly (so the default is byte-for-byte unchanged).
 * - `100` → {@link TERMINAL_BG_LIGHTEST}.
 * - Monotonic in between; values outside [0, 100] are clamped.
 * - A malformed `base` falls back to {@link TERMINAL_BG_DARKEST}, so the result is
 *   always a valid `#rrggbb`.
 */
export function terminalBackgroundColor(
  lightness: number,
  base: string = TERMINAL_BG_DARKEST,
): string {
  const from = parseHex(base) ?? parseHex(TERMINAL_BG_DARKEST)!;
  const to = parseHex(TERMINAL_BG_LIGHTEST)!;
  const t = clampLightness(lightness) / 100;
  return toHex([
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ]);
}
