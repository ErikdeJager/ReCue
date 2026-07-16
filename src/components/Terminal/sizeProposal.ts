// Pure size-proposal helpers for the terminal pool (task 427). Since the
// multi-window rework a host never resizes its own xterm grid — it PROPOSES the
// grid its slot could show (a FitAddon measurement plus the #262 bottom-clearance
// shave) and renders whatever the backend's smallest-wins arbiter broadcasts.
// These helpers are the measurement math, kept DOM-free so they unit-test like
// `replayDedupe.ts` / `webglRenderer.ts`.

export interface GridSize {
  cols: number;
  rows: number;
}

/** Sanitize a FitAddon proposal (task 427): undefined / NaN / non-finite /
 * non-positive dims → null (skip the propose — the slot isn't measurable), else
 * integers clamped to ≥ 1. FitAddon's `proposeDimensions()` returns undefined on
 * an unmeasurable container and can produce NaN/0 mid-transition. */
export function sanitizeProposal(
  p: { cols: number; rows: number } | undefined,
): GridSize | null {
  if (!p) return null;
  if (!Number.isFinite(p.cols) || !Number.isFinite(p.rows)) return null;
  if (p.cols <= 0 || p.rows <= 0) return null;
  return {
    cols: Math.max(1, Math.floor(p.cols)),
    rows: Math.max(1, Math.floor(p.rows)),
  };
}

/** The #262 bottom-clearance shave applied to a PROPOSED row count: when the
 * painted rows would overflow the padded content box by more than 1px of
 * sub-pixel rounding, propose one fewer row so claude's input line is never
 * clipped. cellH undefined (metrics unreadable) or rows ≤ 1 ⇒ unchanged; the
 * result never drops below 1. */
export function shaveProposalRows(
  rows: number,
  cellH: number | undefined,
  contentH: number,
): number {
  if (cellH === undefined || rows <= 1 || contentH <= 0) return rows;
  // Tolerate sub-pixel rounding; only shave when a full visible row is clipped.
  if (rows * cellH > contentH + 1) return Math.max(1, rows - 1);
  return rows;
}
