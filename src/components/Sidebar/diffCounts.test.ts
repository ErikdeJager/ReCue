import { describe, expect, it } from "vitest";

import { diffCountBadge } from "./diffCounts";

describe("diffCountBadge (#335)", () => {
  it("returns null when the feature is disabled", () => {
    expect(diffCountBadge({ added: 5, removed: 3 }, false)).toBeNull();
  });

  it("returns null for a clean tree (both zero) — no +0 −0 clutter", () => {
    expect(diffCountBadge({ added: 0, removed: 0 }, true)).toBeNull();
  });

  it("returns null when there are no counts yet (undefined)", () => {
    expect(diffCountBadge(undefined, true)).toBeNull();
  });

  it("returns additions-only counts", () => {
    expect(diffCountBadge({ added: 5, removed: 0 }, true)).toEqual({
      added: 5,
      removed: 0,
    });
  });

  it("returns deletions-only counts", () => {
    expect(diffCountBadge({ added: 0, removed: 3 }, true)).toEqual({
      added: 0,
      removed: 3,
    });
  });

  it("returns both counts", () => {
    expect(diffCountBadge({ added: 5, removed: 3 }, true)).toEqual({
      added: 5,
      removed: 3,
    });
  });
});
