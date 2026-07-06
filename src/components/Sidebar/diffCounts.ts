import type { DiffLineCounts } from "../../types";

/**
 * Decide whether — and with what values — an agent row's added/removed line-count
 * badge should render (#335). Pure so it's unit-testable with no store/DOM.
 *
 * Returns `null` (no badge) when the feature is disabled, when there are no counts
 * for the agent yet, or when the tree is clean (`added === 0 && removed === 0`) — so
 * a clean repo never shows `+0 −0` clutter. Otherwise returns the counts to render.
 */
export function diffCountBadge(
  counts: DiffLineCounts | undefined,
  enabled: boolean,
): { added: number; removed: number } | null {
  if (!enabled) return null;
  if (!counts) return null;
  if (counts.added === 0 && counts.removed === 0) return null;
  return { added: counts.added, removed: counts.removed };
}
