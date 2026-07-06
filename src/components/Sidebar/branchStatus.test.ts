import { describe, expect, it } from "vitest";

import { aheadBehindBadge } from "./branchStatus";

describe("aheadBehindBadge (#338)", () => {
  it("returns null when there are no counts yet (undefined) — no upstream / non-git", () => {
    expect(aheadBehindBadge(undefined)).toBeNull();
  });

  it("returns null for an in-sync branch (both zero) — no ↑0 ↓0 clutter", () => {
    expect(aheadBehindBadge({ ahead: 0, behind: 0 })).toBeNull();
  });

  it("returns ahead-only counts", () => {
    expect(aheadBehindBadge({ ahead: 2, behind: 0 })).toEqual({
      ahead: 2,
      behind: 0,
    });
  });

  it("returns behind-only counts", () => {
    expect(aheadBehindBadge({ ahead: 0, behind: 1 })).toEqual({
      ahead: 0,
      behind: 1,
    });
  });

  it("returns both counts when ahead and behind", () => {
    expect(aheadBehindBadge({ ahead: 2, behind: 1 })).toEqual({
      ahead: 2,
      behind: 1,
    });
  });
});
