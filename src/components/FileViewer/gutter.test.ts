import { describe, expect, it } from "vitest";

import type { HunkLine } from "../../types";
import { EOF_DELETION, gutterMarkers } from "./gutter";

// Fixture builders mirroring `parse_unified_diff`'s output (git.rs): an `add` carries
// only its new-file line number, a `del` only the old-file number, a `context` both,
// a hunk header neither.
const hunk = (): HunkLine => ({ type: "hunk", text: "@@ ... @@" });
const ctx = (oldNo: number, newNo: number): HunkLine => ({
  type: "context",
  old_no: oldNo,
  new_no: newNo,
  text: "",
});
const add = (newNo: number): HunkLine => ({
  type: "add",
  new_no: newNo,
  text: "",
});
const del = (oldNo: number): HunkLine => ({
  type: "del",
  old_no: oldNo,
  text: "",
});

describe("gutterMarkers (#324)", () => {
  it("marks a pure insertion green (added), no dots", () => {
    // Insert two lines after line 1: new lines 2,3.
    const m = gutterMarkers([hunk(), ctx(1, 1), add(2), add(3), ctx(2, 4)]);
    expect(m.lines.get(2)).toBe("added");
    expect(m.lines.get(3)).toBe("added");
    expect(m.lines.size).toBe(2);
    expect(m.deletions.size).toBe(0);
  });

  it("marks a 1:1 replacement yellow (modified), no dots", () => {
    // Line 2 changed in place.
    const m = gutterMarkers([hunk(), ctx(1, 1), del(2), add(2), ctx(3, 3)]);
    expect(m.lines.get(2)).toBe("modified");
    expect(m.lines.size).toBe(1);
    expect(m.deletions.size).toBe(0);
  });

  it("marks an add-heavy modification yellow then a green tail", () => {
    // 1 line replaced by 3: first new line modified, the extra two added.
    const m = gutterMarkers([
      hunk(),
      ctx(1, 1),
      del(2),
      add(2),
      add(3),
      add(4),
      ctx(3, 5),
    ]);
    expect(m.lines.get(2)).toBe("modified");
    expect(m.lines.get(3)).toBe("added");
    expect(m.lines.get(4)).toBe("added");
    expect(m.deletions.size).toBe(0);
  });

  it("marks a delete-heavy modification yellow with a dot for the surplus", () => {
    // 3 lines replaced by 1: one modified line + a dot on the line below the block.
    const m = gutterMarkers([
      hunk(),
      ctx(1, 1),
      del(2),
      del(3),
      del(4),
      add(2),
      ctx(5, 3),
    ]);
    expect(m.lines.get(2)).toBe("modified");
    expect(m.lines.size).toBe(1);
    expect(m.deletions.has(3)).toBe(true);
    expect(m.deletions.size).toBe(1);
  });

  it("marks a pure mid-file deletion with a dot on the following line", () => {
    // Delete line 2; the following line is new-file line 2.
    const m = gutterMarkers([hunk(), ctx(1, 1), del(2), ctx(3, 2)]);
    expect(m.lines.size).toBe(0);
    expect(m.deletions.has(2)).toBe(true);
    expect(m.deletions.size).toBe(1);
  });

  it("places a deletion at the very top on line 1", () => {
    // Delete line 1; remaining lines shift up so the following context is new-file 1.
    const m = gutterMarkers([hunk(), del(1), ctx(2, 1), ctx(3, 2)]);
    expect(m.deletions.has(1)).toBe(true);
    expect(m.lines.size).toBe(0);
  });

  it("marks an end-of-file deletion with the EOF sentinel", () => {
    // Delete the last line — nothing follows the block.
    const m = gutterMarkers([hunk(), ctx(1, 1), ctx(2, 2), del(3)]);
    expect(m.deletions.has(EOF_DELETION)).toBe(true);
    expect(m.deletions.size).toBe(1);
    expect(m.lines.size).toBe(0);
  });

  it("marks a brand-new file's every line green (added)", () => {
    // `git diff --no-index /dev/null <file>` → all adds from line 1.
    const m = gutterMarkers([hunk(), add(1), add(2), add(3)]);
    expect(m.lines.get(1)).toBe("added");
    expect(m.lines.get(2)).toBe("added");
    expect(m.lines.get(3)).toBe("added");
    expect(m.deletions.size).toBe(0);
  });

  it("returns empty markers for no hunks (clean file)", () => {
    const m = gutterMarkers([]);
    expect(m.lines.size).toBe(0);
    expect(m.deletions.size).toBe(0);
  });

  it("keeps a modified last line without a trailing newline a single block", () => {
    // git emits del, `\ No newline`, add, `\ No newline` — the markers must not flush
    // the block, so the replacement still reads as modified (not add + dot).
    const noNewline: HunkLine = {
      type: "context",
      text: "\\ No newline at end of file",
    };
    const m = gutterMarkers([
      hunk(),
      ctx(1, 1),
      del(2),
      noNewline,
      add(2),
      noNewline,
    ]);
    expect(m.lines.get(2)).toBe("modified");
    expect(m.deletions.size).toBe(0);
  });

  it("handles multiple independent change blocks across hunks", () => {
    const m = gutterMarkers([
      hunk(),
      ctx(1, 1),
      add(2), // pure insertion → green
      ctx(2, 3),
      hunk(),
      ctx(10, 11),
      del(11),
      add(12), // 1:1 replacement → yellow
      ctx(12, 13),
    ]);
    expect(m.lines.get(2)).toBe("added");
    expect(m.lines.get(12)).toBe("modified");
    expect(m.deletions.size).toBe(0);
  });
});
