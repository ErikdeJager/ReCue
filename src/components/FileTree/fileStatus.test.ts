import { describe, expect, it } from "vitest";

import {
  buildFolderRollup,
  deletedChildrenAt,
  isIgnored,
  statusMapsEqual,
  type FileStatusMap,
} from "./fileStatus";

describe("buildFolderRollup", () => {
  it("rolls a modified file up to every ancestor folder", () => {
    const map: FileStatusMap = { "src/components/Foo.tsx": "M" };
    const rollup = buildFolderRollup(map);
    expect(rollup.get("src")).toBe("M");
    expect(rollup.get("src/components")).toBe("M");
    // The file itself is not a folder key.
    expect(rollup.has("src/components/Foo.tsx")).toBe(false);
  });

  it("uses the highest-severity descendant (red > yellow > green)", () => {
    const map: FileStatusMap = {
      "src/a.ts": "A", // green
      "src/b.ts": "M", // yellow
      "src/sub/gone.ts": "D", // red, deeper
    };
    const rollup = buildFolderRollup(map);
    // `src` mixes add + modify + (nested) delete → red wins.
    expect(rollup.get("src")).toBe("D");
    // `src/sub` only has the deletion.
    expect(rollup.get("src/sub")).toBe("D");
  });

  it("rolls a folder up to green when it has only additions", () => {
    const map: FileStatusMap = { "pkg/x.ts": "A", "pkg/y.ts": "A" };
    expect(buildFolderRollup(map).get("pkg")).toBe("A");
  });

  it("marks an ancestor red when a file was deleted out of a now-vanished folder", () => {
    // The folder `src/old` no longer exists on disk (both its files deleted) — it
    // never renders, but `src` (which still renders) must show red.
    const map: FileStatusMap = {
      "src/old/a.ts": "D",
      "src/old/b.ts": "D",
    };
    const rollup = buildFolderRollup(map);
    expect(rollup.get("src")).toBe("D");
    expect(rollup.get("src/old")).toBe("D");
  });

  it("handles top-level files (no ancestor folders)", () => {
    expect(buildFolderRollup({ "README.md": "M" }).size).toBe(0);
  });

  it("returns an empty roll-up for an empty map", () => {
    expect(buildFolderRollup({}).size).toBe(0);
  });

  it("keeps gitignored entries out of the roll-up (no graying a tracked parent)", () => {
    // `src/secret.key` is ignored; `src` has no *tracked* change, so it must not roll up.
    const map: FileStatusMap = { "src/secret.key": "I" };
    expect(buildFolderRollup(map).size).toBe(0);
  });

  it("rolls up only the tracked change when an ignored sibling shares the folder", () => {
    const map: FileStatusMap = { "src/a.ts": "M", "src/cache.tmp": "I" };
    const rollup = buildFolderRollup(map);
    // The ignored sibling is invisible to the roll-up; `src` reflects only the edit.
    expect(rollup.get("src")).toBe("M");
  });
});

describe("isIgnored", () => {
  it("is true only when the path's own status is gitignored", () => {
    const map: FileStatusMap = { ".env": "I", "src/a.ts": "M" };
    expect(isIgnored(map, ".env")).toBe(true);
    expect(isIgnored(map, "src/a.ts")).toBe(false);
    expect(isIgnored(map, "unknown")).toBe(false);
  });

  it("treats a wholly-ignored directory (keyed by its own path) as ignored", () => {
    // The backend strips the trailing slash, so `build/` arrives as `build`.
    const map: FileStatusMap = { build: "I" };
    expect(isIgnored(map, "build")).toBe(true);
  });

  it("is false for an undefined map", () => {
    expect(isIgnored(undefined, "anything")).toBe(false);
  });
});

describe("deletedChildrenAt", () => {
  it("finds deleted files directly under a directory", () => {
    const map: FileStatusMap = {
      "src/gone.ts": "D",
      "src/kept.ts": "M",
      "src/deep/also-gone.ts": "D", // not a direct child of `src`
    };
    expect(deletedChildrenAt(map, "src", new Set())).toEqual(["gone.ts"]);
    expect(deletedChildrenAt(map, "src/deep", new Set())).toEqual([
      "also-gone.ts",
    ]);
  });

  it("finds deleted files at the repo root", () => {
    const map: FileStatusMap = { "gone.txt": "D", "sub/x.txt": "D" };
    expect(deletedChildrenAt(map, "", new Set())).toEqual(["gone.txt"]);
  });

  it("omits a deleted name that still exists as a real entry", () => {
    const map: FileStatusMap = { "src/x.ts": "D" };
    // A re-added file: present in `list_dir`, so no ghost row for it.
    expect(deletedChildrenAt(map, "src", new Set(["x.ts"]))).toEqual([]);
  });

  it("ignores non-deleted statuses and sorts alphabetically", () => {
    const map: FileStatusMap = {
      "src/zeta.ts": "D",
      "src/alpha.ts": "D",
      "src/mod.ts": "M",
    };
    expect(deletedChildrenAt(map, "src", new Set())).toEqual([
      "alpha.ts",
      "zeta.ts",
    ]);
  });
});

describe("statusMapsEqual", () => {
  it("is true for the same reference and for equal contents", () => {
    const a: FileStatusMap = { "a.ts": "M" };
    expect(statusMapsEqual(a, a)).toBe(true);
    expect(statusMapsEqual({ "a.ts": "M" }, { "a.ts": "M" })).toBe(true);
  });

  it("is false when a key or value differs", () => {
    expect(statusMapsEqual({ "a.ts": "M" }, { "a.ts": "A" })).toBe(false);
    expect(statusMapsEqual({ "a.ts": "M" }, { "b.ts": "M" })).toBe(false);
    expect(statusMapsEqual({ "a.ts": "M" }, {})).toBe(false);
    expect(statusMapsEqual({ "a.ts": "M" }, undefined)).toBe(false);
  });
});
