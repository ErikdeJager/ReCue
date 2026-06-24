import { describe, expect, it } from "vitest";

import { effectiveRepo, repoName, splitPath } from "./paths";

describe("splitPath (#163)", () => {
  it("splits a nested absolute path into parent dir + basename", () => {
    expect(splitPath("/Users/me/notes/todo.md")).toEqual({
      dir: "/Users/me/notes",
      base: "todo.md",
    });
  });

  it("keeps the root for a file directly at the filesystem root", () => {
    expect(splitPath("/readme.md")).toEqual({ dir: "/", base: "readme.md" });
  });

  it("returns an empty dir for a bare filename (no slash)", () => {
    expect(splitPath("todo.md")).toEqual({ dir: "", base: "todo.md" });
  });
});

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

describe("effectiveRepo (#96)", () => {
  it("uses the repo path for a normal agent", () => {
    expect(effectiveRepo({ repoPath: "/Users/me/code/repo" })).toBe(
      "/Users/me/code/repo",
    );
  });

  it("uses the parent repo for a worktree agent", () => {
    expect(
      effectiveRepo({
        repoPath: "/data/worktrees/repo-id/feature",
        worktreeParent: "/Users/me/code/repo",
      }),
    ).toBe("/Users/me/code/repo");
  });

  it("ignores a null worktreeParent", () => {
    expect(
      effectiveRepo({ repoPath: "/Users/me/code/repo", worktreeParent: null }),
    ).toBe("/Users/me/code/repo");
  });
});
