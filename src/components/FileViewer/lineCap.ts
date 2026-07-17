// Line-cap for the universal file viewer (#413): render only the first N lines of a
// large text/markdown file so the panel opens instantly, and reveal the rest on demand.
// Pure + React-free so it's trivially unit-testable; the byte threshold (LARGE_BYTES in
// FileViewer) stays orthogonal — this caps by *line count* on the read-only render sinks.

/** Lines shown when a file first opens (and after switching files). */
export const LINE_CAP = 500;

/** Extra lines revealed by the "Show N more lines" button. */
export const LINE_CHUNK = 1000;

/** Next visible-line count after a reveal, clamped to the file's total. */
export function nextVisible(
  current: number,
  total: number,
  chunk = LINE_CHUNK,
): number {
  return Math.min(current + chunk, total);
}

export interface LineTruncation {
  /** Total lines in the file. */
  total: number;
  /** Lines actually rendered (== total when not truncated). */
  shown: number;
  /** Lines still hidden. */
  remaining: number;
  /** Whether any lines are hidden. */
  truncated: boolean;
  /** How many the next "Show more" reveal would add (clamped to `remaining`). */
  nextChunk: number;
}

/**
 * Describe the truncation state for `total` lines with `visible` currently shown.
 * `visible` may exceed `total` (a reveal clamps to total, but a fresh cap of 500 on a
 * 12-line file leaves `visible=500 > total=12`) — in which case nothing is truncated.
 */
export function lineTruncation(
  total: number,
  visible: number,
  chunk = LINE_CHUNK,
): LineTruncation {
  const truncated = total > visible;
  const shown = truncated ? visible : total;
  const remaining = total - shown;
  const nextChunk = Math.min(chunk, remaining);
  return { total, shown, remaining, truncated, nextChunk };
}
