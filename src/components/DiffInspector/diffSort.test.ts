import { describe, expect, it } from "vitest";

import { reconcileOccurrence, sortFiles } from "./diffSort";

/** A minimal `FileDiff`-like row for the sort tests. */
const f = (path: string) => ({ path });

describe("reconcileOccurrence (#258)", () => {
  it("assigns new paths in encounter order, appending at the bottom", () => {
    const r = reconcileOccurrence({}, ["b.txt", "a.txt"], 0);
    expect(r.seq).toEqual({ "b.txt": 0, "a.txt": 1 });
    expect(r.counter).toBe(2);
  });

  it("keeps an already-seen file's position when it re-changes", () => {
    const first = reconcileOccurrence({}, ["b.txt"], 0);
    // b.txt re-changes and a.txt newly appears: b keeps seq 0, a appends after.
    const second = reconcileOccurrence(
      first.seq,
      ["b.txt", "a.txt"],
      first.counter,
    );
    expect(second.seq).toEqual({ "b.txt": 0, "a.txt": 1 });
    expect(second.counter).toBe(2);
  });

  it("preserves order regardless of the backend's emission order on re-poll", () => {
    const first = reconcileOccurrence({}, ["b.txt", "a.txt"], 0);
    // Backend later emits them alphabetically; occurrence seq must not move.
    const second = reconcileOccurrence(
      first.seq,
      ["a.txt", "b.txt"],
      first.counter,
    );
    expect(second.seq).toEqual({ "b.txt": 0, "a.txt": 1 });
  });

  it("drops a vanished file, then re-appends it at the bottom when it reappears", () => {
    const first = reconcileOccurrence({}, ["a.txt", "b.txt"], 0);
    // b.txt leaves the diff entirely.
    const second = reconcileOccurrence(first.seq, ["a.txt"], first.counter);
    expect(second.seq).toEqual({ "a.txt": 0 });
    expect(second.counter).toBe(2);
    // b.txt reappears: treated as new → next counter value (below a.txt).
    const third = reconcileOccurrence(
      second.seq,
      ["a.txt", "b.txt"],
      second.counter,
    );
    expect(third.seq).toEqual({ "a.txt": 0, "b.txt": 2 });
    expect(third.counter).toBe(3);
  });

  it("does not mutate the previous map", () => {
    const prev = { "a.txt": 0 };
    reconcileOccurrence(prev, ["a.txt", "b.txt"], 1);
    expect(prev).toEqual({ "a.txt": 0 });
  });

  it("handles duplicate paths within one batch without double-advancing", () => {
    const r = reconcileOccurrence({}, ["a.txt", "a.txt"], 0);
    expect(r.seq).toEqual({ "a.txt": 0 });
    expect(r.counter).toBe(1);
  });
});

describe("sortFiles (#258)", () => {
  it("orders by occurrence using the seq map", () => {
    const files = [f("a.txt"), f("b.txt"), f("c.txt")];
    const seq = { "b.txt": 0, "c.txt": 1, "a.txt": 2 };
    expect(sortFiles(files, "occurrence", seq).map((x) => x.path)).toEqual([
      "b.txt",
      "c.txt",
      "a.txt",
    ]);
  });

  it("sorts alphabetically case-insensitively", () => {
    const files = [f("Zebra.md"), f("apple.md"), f("Banana.md")];
    expect(sortFiles(files, "alphabetical", {}).map((x) => x.path)).toEqual([
      "apple.md",
      "Banana.md",
      "Zebra.md",
    ]);
  });

  it("is stable for alphabetical ties (same lowercased path keeps incoming order)", () => {
    const a = { path: "x.md", id: 1 };
    const b = { path: "X.md", id: 2 };
    const sorted = sortFiles([a, b], "alphabetical", {});
    // "x.md" and "X.md" compare equal lowercased → original order preserved.
    expect(sorted.map((x) => x.id)).toEqual([1, 2]);
  });

  it("sorts a file missing from the seq map last in occurrence mode", () => {
    const files = [f("ghost.txt"), f("a.txt"), f("b.txt")];
    const seq = { "a.txt": 0, "b.txt": 1 };
    expect(sortFiles(files, "occurrence", seq).map((x) => x.path)).toEqual([
      "a.txt",
      "b.txt",
      "ghost.txt",
    ]);
  });

  it("does not mutate the input array", () => {
    const files = [f("b.txt"), f("a.txt")];
    sortFiles(files, "alphabetical", {});
    expect(files.map((x) => x.path)).toEqual(["b.txt", "a.txt"]);
  });
});
