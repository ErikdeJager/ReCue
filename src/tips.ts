import tipsJson from "./tips.json";
import { isLinux, isWindows } from "./platform";

/** Startup tips (UI v2 task 379) — shown one-at-a-time on the empty-state hero. */
export const TIPS: readonly string[] = tipsJson;

/** Mac chord token → Windows/Linux form: ⌘→Ctrl+, ⇧→Shift+, ⌥→Alt+, ⏎→Enter.
 * The pattern is the contract — a tip chord that doesn't match it renders as-is
 * (and the unit test fails loudly on an unrecognized ⌘ usage). */
export const CHORD_RE = /⌘([⇧⌥]?)([A-Z0-9⏎\\])/gu;

/** Render a tip for the platform (`kbdHint` semantics, #143/#345): identity on
 * macOS (and before the platform loads); mac chords become their Ctrl+ form on
 * Windows AND Linux. */
export function renderTip(platform: string, tip: string): string {
  if (!(isWindows(platform) || isLinux(platform))) return tip;
  return tip.replace(CHORD_RE, (_m, mod: string, key: string) => {
    const m = mod === "⇧" ? "Shift+" : mod === "⌥" ? "Alt+" : "";
    return `Ctrl+${m}${key === "⏎" ? "Enter" : key}`;
  });
}

/** A random tip index; `rand` injectable for tests. */
export function randomTipIndex(
  count: number,
  rand: () => number = Math.random,
): number {
  if (count <= 0) return 0;
  // rand() < 1, so the floor stays in [0, count); clamp anyway for a hostile rand.
  return Math.min(count - 1, Math.floor(rand() * count));
}

/** A different random index (the shuffle affordance) — never `current` when
 * count > 1: draw from `count - 1` slots and skip past `current`. */
export function nextTipIndex(
  current: number,
  count: number,
  rand: () => number = Math.random,
): number {
  if (count <= 1) return 0;
  const draw = randomTipIndex(count - 1, rand);
  return draw >= current ? draw + 1 : draw;
}
