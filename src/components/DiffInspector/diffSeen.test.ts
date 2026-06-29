import { describe, expect, it } from "vitest";

import type { FileDiff, HunkLine } from "../../types";
import { fileDigest, seenState } from "./diffSeen";

/** A minimal `FileDiff` fixture for the digest/state tests. */
function file(overrides: Partial<FileDiff> = {}): FileDiff {
  const hunks: HunkLine[] = [
    { type: "hunk", text: "@@ -1,2 +1,2 @@" },
    { type: "add", new_no: 1, text: "hello" },
  ];
  return {
    path: "src/main.rs",
    status: "M",
    add: 1,
    del: 0,
    binary: false,
    hunks,
    ...overrides,
  };
}

describe("fileDigest (#278)", () => {
  it("is stable for identical content", () => {
    expect(fileDigest(file())).toBe(fileDigest(file()));
  });

  it("changes when the hunks change", () => {
    const a = file();
    const b = file({ hunks: [{ type: "add", new_no: 1, text: "goodbye" }] });
    expect(fileDigest(a)).not.toBe(fileDigest(b));
  });

  it("changes when the add/del counts change", () => {
    expect(fileDigest(file({ add: 1 }))).not.toBe(fileDigest(file({ add: 2 })));
    expect(fileDigest(file({ del: 0 }))).not.toBe(fileDigest(file({ del: 3 })));
  });

  it("changes when the status changes (e.g. A → M)", () => {
    expect(fileDigest(file({ status: "A" }))).not.toBe(
      fileDigest(file({ status: "M" })),
    );
  });

  it("ignores the path (digest is content-only)", () => {
    expect(fileDigest(file({ path: "a.txt" }))).toBe(
      fileDigest(file({ path: "b.txt" })),
    );
  });
});

describe("seenState (#278)", () => {
  it("is notSeen when there is no stored digest", () => {
    expect(seenState(file(), undefined)).toBe("notSeen");
  });

  it("is seen when the stored digest matches the current content", () => {
    const f = file();
    expect(seenState(f, fileDigest(f))).toBe("seen");
  });

  it("is changed when the content has drifted from the stored digest", () => {
    const marked = file();
    const stored = fileDigest(marked);
    // The file later picks up another change.
    const edited = file({
      add: 2,
      hunks: [
        { type: "hunk", text: "@@ -1,2 +1,3 @@" },
        { type: "add", new_no: 1, text: "hello" },
        { type: "add", new_no: 2, text: "world" },
      ],
    });
    expect(seenState(edited, stored)).toBe("changed");
  });
});
