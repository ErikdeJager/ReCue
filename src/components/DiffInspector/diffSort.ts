// Pure file-ordering helpers for the diff viewer (#258). Kept React-free so the
// occurrence-tracking + sort logic is unit-tested without the DOM. The component owns
// the mutable sequence map (`seqRef`); these functions just reconcile + sort.

/** How the diff viewer orders its changed files (#258). */
export type DiffSortOrder = "occurrence" | "alphabetical";

/**
 * Reconcile the remembered occurrence sequence against the current set of changed
 * file paths:
 *   - a path **not** already in the map gets the next counter value (so it lands at
 *     the **bottom** of the occurrence ordering — newly-changed files append);
 *   - an existing path **keeps** its value (re-changing a listed file never reorders it);
 *   - a path no longer present is **dropped** (so a file that leaves the diff and later
 *     reappears is treated as new again → bottom).
 *
 * Pure: returns a fresh map + the advanced counter; never mutates `prev`. New paths are
 * assigned in the order they appear in `paths` (the backend's emission order), so a
 * fresh mount seeds a stable, sensible baseline.
 */
export function reconcileOccurrence(
  prev: Record<string, number>,
  paths: string[],
  nextCounter: number,
): { seq: Record<string, number>; counter: number } {
  const seq: Record<string, number> = {};
  let counter = nextCounter;
  for (const path of paths) {
    if (path in prev) {
      seq[path] = prev[path] as number;
    } else if (!(path in seq)) {
      // New path (and not a duplicate within this batch) → append at the bottom.
      seq[path] = counter;
      counter += 1;
    }
  }
  return { seq, counter };
}

/**
 * Order a list of files by `mode`:
 *   - `"occurrence"`: ascending by the file's sequence number in `seq` (first-seen →
 *     bottom-appended). A path missing from `seq` (shouldn't happen after a reconcile)
 *     sorts last. Ties (and missing entries) keep their incoming order (stable).
 *   - `"alphabetical"`: case-insensitive A→Z by path; ties keep incoming order (stable).
 *
 * Pure: returns a new array; never mutates `files`.
 */
export function sortFiles<T extends { path: string }>(
  files: T[],
  mode: DiffSortOrder,
  seq: Record<string, number>,
): T[] {
  // Index-keyed for a stable sort (Array.prototype.sort is spec-stable, but we keep the
  // tie-break explicit so behavior is obvious + test-pinned across engines).
  const indexed = files.map((file, index) => ({ file, index }));
  if (mode === "alphabetical") {
    indexed.sort((a, b) => {
      const cmp = a.file.path
        .toLowerCase()
        .localeCompare(b.file.path.toLowerCase());
      return cmp !== 0 ? cmp : a.index - b.index;
    });
  } else {
    indexed.sort((a, b) => {
      const sa = seq[a.file.path];
      const sb = seq[b.file.path];
      const va = sa === undefined ? Number.POSITIVE_INFINITY : sa;
      const vb = sb === undefined ? Number.POSITIVE_INFINITY : sb;
      return va !== vb ? va - vb : a.index - b.index;
    });
  }
  return indexed.map((entry) => entry.file);
}
