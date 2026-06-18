import { describe, expect, it } from "vitest";

import { repoName } from "./paths";

describe("repoName", () => {
  it("returns the last path segment", () => {
    expect(repoName("/Users/me/code/claudecue")).toBe("claudecue");
  });

  it("ignores a trailing slash", () => {
    expect(repoName("/Users/me/code/claudecue/")).toBe("claudecue");
  });

  it("falls back to the input for a root-ish path", () => {
    expect(repoName("/")).toBe("/");
  });
});
