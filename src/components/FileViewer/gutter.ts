//! Pure classifier turning a file's `git diff HEAD` hunks (#324) into the per-line
//! markers the FileViewer code-view gutter renders: a colored bar per changed
//! **current-file** line (green = added, yellow = modified) and a red "removed above"
//! dot where content was deleted with no replacement. No React, no I/O — unit-tested
//! against fixtures.

import type { HunkLine } from "../../types";

/** How a current-file line changed vs `HEAD`: a green (added) or yellow (modified) bar. */
export type LineChange = "added" | "modified";

export interface GutterMarkers {
  /** Current-file line number (1-based) → its bar color. */
  lines: Map<number, LineChange>;
  /** Current-file line numbers that carry a "removed above" red dot at their top
   * edge. The `EOF_DELETION` sentinel marks a removal *after* the last line (a
   * bottom-edge dot on the final cell). */
  deletions: Set<number>;
}

/** Sentinel line number for a deletion at end-of-file (rendered at the bottom edge
 * of the last line rather than the top edge of a line). */
export const EOF_DELETION = -1;

/**
 * Classify each current-file line from a file's diff hunks (#324).
 *
 * Walk the hunks in order, grouping every maximal run of consecutive `add`/`del`
 * rows into a **change block** (a `context` or hunk-header row flushes it; the
 * `\ No newline at end of file` marker — a context row with no line numbers — is
 * skipped so it neither flushes nor is mistaken for a following line). For each block
 * with `d` deletions and adds at new-file lines `adds` (length `a`):
 *
 * - `modified = min(d, a)`: the first `modified` adds are `"modified"` (yellow, a
 *   replaced line), any adds beyond that a pure-insertion `"added"` (green) tail.
 * - When `d > a` the excess deletions had no replacement → a red dot at the line
 *   **below** the block (the flushing context row's new-file number), or
 *   `EOF_DELETION` when the block ends at end-of-hunks / a hunk boundary. A deletion
 *   at the very top naturally lands on line 1.
 */
export function gutterMarkers(hunks: HunkLine[]): GutterMarkers {
  const lines = new Map<number, LineChange>();
  const deletions = new Set<number>();

  let dels = 0;
  let adds: number[] = []; // new-file line numbers of the block's `add` rows, in order

  const flush = (followingLine: number | null) => {
    const a = adds.length;
    const d = dels;
    if (a > 0) {
      const modified = Math.min(d, a);
      adds.forEach((lineNo, i) => {
        lines.set(lineNo, i < modified ? "modified" : "added");
      });
    }
    if (d > a) {
      // Excess deletions with no replacement → a "removed above" dot on the line
      // below the block, or an end-of-file dot when nothing follows.
      deletions.add(followingLine ?? EOF_DELETION);
    }
    dels = 0;
    adds = [];
  };

  for (const line of hunks) {
    if (line.type === "add") {
      if (line.new_no !== undefined) adds.push(line.new_no);
      continue;
    }
    if (line.type === "del") {
      dels += 1;
      continue;
    }
    // The `\ No newline at end of file` marker parses as a context row with no line
    // numbers — skip it so a modified last line stays a single block.
    if (
      line.type === "context" &&
      line.old_no === undefined &&
      line.new_no === undefined
    ) {
      continue;
    }
    // A context row (with a new-file number) or a hunk header flushes the block; the
    // context row supplies the "line below" for a dangling deletion, a hunk header
    // does not (→ EOF).
    const following =
      line.type === "context" && line.new_no !== undefined ? line.new_no : null;
    flush(following);
  }
  // Flush a block that runs to the end of the hunks (→ end-of-file dot for a
  // trailing deletion).
  flush(null);

  return { lines, deletions };
}
