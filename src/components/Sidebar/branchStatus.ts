import type { AheadBehind } from "../../types";

/**
 * Decide whether — and with what values — a branch's ahead/behind indicator should
 * render (#338). Pure so it's unit-testable with no store/DOM.
 *
 * Returns `null` (nothing renders) when there are no counts for the folder yet (no
 * upstream / non-git → the folder is absent from the map) or when the branch is in
 * sync (`ahead === 0 && behind === 0`) — so an up-to-date branch never shows `↑0 ↓0`
 * clutter. Otherwise returns the counts to render (the caller draws only the non-zero
 * arm(s)).
 */
export function aheadBehindBadge(
  counts: AheadBehind | undefined,
): { ahead: number; behind: number } | null {
  if (!counts) return null;
  if (counts.ahead === 0 && counts.behind === 0) return null;
  return { ahead: counts.ahead, behind: counts.behind };
}
