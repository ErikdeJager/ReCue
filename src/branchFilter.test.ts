import { describe, expect, it } from "vitest";

import { matchBranchFilter } from "./branchFilter";

describe("matchBranchFilter (#408)", () => {
  it("picks the top matching local branch", () => {
    expect(
      matchBranchFilter("fe", ["feat-a", "feat-b"], ["origin/feat-c"]),
    ).toEqual({ kind: "local", value: "feat-a" });
  });

  it("picks the top matching remote when there are no local matches", () => {
    expect(
      matchBranchFilter("fe", [], ["origin/feat-c", "origin/feat-d"]),
    ).toEqual({ kind: "remote", value: "origin/feat-c" });
  });

  it("locals win over remotes", () => {
    expect(matchBranchFilter("x", ["local-x"], ["origin/remote-x"])).toEqual({
      kind: "local",
      value: "local-x",
    });
  });

  it("converts to create when both lists are empty and the query is non-empty", () => {
    expect(matchBranchFilter("brand-new", [], [])).toEqual({
      kind: "create",
      name: "brand-new",
    });
  });

  it("trims the query into the create name", () => {
    expect(matchBranchFilter("  spaced-name  ", [], [])).toEqual({
      kind: "create",
      name: "spaced-name",
    });
  });

  it("preserves case in the create name", () => {
    expect(matchBranchFilter("Feature/ABC", [], [])).toEqual({
      kind: "create",
      name: "Feature/ABC",
    });
  });

  it("is 'none' when both lists are empty and the query is blank", () => {
    expect(matchBranchFilter("", [], [])).toEqual({ kind: "none" });
  });

  it("is 'none' when both lists are empty and the query is whitespace-only", () => {
    expect(matchBranchFilter("   ", [], [])).toEqual({ kind: "none" });
  });
});
