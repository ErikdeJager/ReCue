import { describe, expect, it } from "vitest";

import { dedupeAgainstScrollback } from "./replayDedupe";

// Helpers to make intent obvious.
const bytes = (...n: number[]) => new Uint8Array(n);
const arr = (u: Uint8Array) => Array.from(u);

describe("dedupeAgainstScrollback", () => {
  it("drops a chunk fully covered by the scrollback", () => {
    // chunk covers absolute [4,8); scrollback ends at 8 → all already replayed.
    expect(arr(dedupeAgainstScrollback(bytes(1, 2, 3, 4), 8, 8))).toEqual([]);
    expect(arr(dedupeAgainstScrollback(bytes(1, 2, 3, 4), 6, 8))).toEqual([]);
  });

  it("keeps a chunk fully after the scrollback", () => {
    // chunk covers [8,12); scrollback ends at 8 → nothing overlaps.
    expect(arr(dedupeAgainstScrollback(bytes(9, 9, 9, 9), 12, 8))).toEqual([
      9, 9, 9, 9,
    ]);
  });

  it("keeps only the tail of a straddling chunk", () => {
    // chunk covers [6,10); scrollback ends at 8 → first 2 bytes already on screen,
    // keep the last 2.
    expect(arr(dedupeAgainstScrollback(bytes(1, 2, 3, 4), 10, 8))).toEqual([
      3, 4,
    ]);
  });

  it("keeps everything when there is no scrollback (end 0) — resume/first-mount", () => {
    expect(arr(dedupeAgainstScrollback(bytes(1, 2, 3), 3, 0))).toEqual([
      1, 2, 3,
    ]);
  });
});
