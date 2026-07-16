import { describe, expect, it } from "vitest";
import type { RepoWorktree } from "./types";
import {
  attributeNewWorktrees,
  detectedWorktreeParents,
  detectedWorktreesFor,
  normPathKey,
  pathWithin,
  samePath,
  sessionActiveWorktree,
  vanishedWorktrees,
  worktreeScopeRepos,
  worktreeSourceOf,
} from "./worktrees";

const wt = (over: Partial<RepoWorktree> & { path: string }): RepoWorktree => ({
  head: "abc",
  branch: "feat/x",
  is_main: false,
  managed: false,
  exists: true,
  locked: false,
  locked_reason: null,
  prunable: false,
  ...over,
});

describe("path identity (normPathKey / samePath / pathWithin)", () => {
  it("normalizes separators and trailing slashes; folds case on Windows only", () => {
    expect(normPathKey("/a/b/", "macos")).toBe("/a/b");
    expect(normPathKey("C:\\Data\\WT\\X\\", "windows")).toBe("c:/data/wt/x");
    // unix stays case-sensitive — /Repo and /repo are different folders there.
    expect(samePath("/Repo", "/repo", "linux")).toBe(false);
    expect(samePath("C:\\Repo", "c:/REPO", "windows")).toBe(true);
  });

  it("pathWithin is component-boundary-safe", () => {
    expect(pathWithin("/a/wt/sub/deep", "/a/wt", "macos")).toBe(true);
    expect(pathWithin("/a/wt", "/a/wt", "macos")).toBe(true);
    expect(pathWithin("/a/wt-evil/x", "/a/wt", "macos")).toBe(false);
  });
});

describe("detectedWorktreesFor", () => {
  const repo = "/repo";
  it("drops main, missing, prunable, self, and record-backed entries", () => {
    const entries = [
      wt({ path: "/repo", is_main: true, branch: "main" }),
      wt({ path: "/repo/.claude/worktrees/a", branch: "worktree-a" }),
      wt({ path: "/work/container", exists: false }),
      wt({ path: "/tmp/prunable", prunable: true }),
      // Record-backed (an app worktree agent already renders it) — dedupe.
      wt({ path: "/data/worktrees/repo-1/feat", managed: true }),
      // Managed but record-less — the dirty-kept orphan: KEPT.
      wt({ path: "/data/worktrees/repo-1/old", managed: true, branch: "old" }),
    ];
    const detected = detectedWorktreesFor(
      repo,
      entries,
      ["/data/worktrees/repo-1/feat"],
      "macos",
    );
    expect(detected.map((d) => d.path)).toEqual([
      "/repo/.claude/worktrees/a",
      "/data/worktrees/repo-1/old",
    ]);
    expect(detected[1].managed).toBe(true);
  });

  it("self-excludes a registered folder that IS a linked worktree (never by index)", () => {
    // The registered folder /wt is itself linked: git lists the true main first.
    const entries = [
      wt({ path: "/true-main", is_main: true, branch: "main" }),
      wt({ path: "/wt", branch: "feat/wt" }),
      wt({ path: "/other-wt", branch: "feat/other" }),
    ];
    const detected = detectedWorktreesFor("/wt", entries, [], "macos");
    expect(detected.map((d) => d.path)).toEqual(["/other-wt"]);
  });

  it("is empty for an absent (failed) listing", () => {
    expect(detectedWorktreesFor(repo, undefined, [], "macos")).toEqual([]);
  });
});

describe("worktreeSourceOf", () => {
  const ext = {
    path: "/x",
    branch: "b",
    head: "h",
    managed: false,
    locked: false,
    lockedReason: null,
  };
  it("record-backed wins; managed detected = orphan; else external", () => {
    expect(worktreeSourceOf(ext, true)).toBe("record");
    expect(worktreeSourceOf(undefined, false)).toBe("record");
    expect(worktreeSourceOf({ ...ext, managed: true }, false)).toBe("orphan");
    expect(worktreeSourceOf(ext, false)).toBe("external");
  });
});

describe("detectedWorktreeParents", () => {
  it("maps every detected path to its parent repo for cluster attribution", () => {
    const slice = {
      "/repo": [
        wt({ path: "/repo", is_main: true }),
        wt({ path: "/repo/.claude/worktrees/a" }),
        wt({ path: "/gone", exists: false }),
      ],
      "/other": [wt({ path: "/side-wt" })],
    };
    expect(detectedWorktreeParents(slice, "macos")).toEqual({
      "/repo/.claude/worktrees/a": "/repo",
      "/side-wt": "/other",
    });
  });
});

describe("sessionActiveWorktree (relocation)", () => {
  const detected = ["/repo/.claude/worktrees/a", "/side-wt"];
  const base = { id: "s1", repoPath: "/repo" };

  it("follows claude's currentCwd into a detected worktree (subdirs count)", () => {
    expect(
      sessionActiveWorktree(
        { ...base, currentCwd: "/repo/.claude/worktrees/a" },
        detected,
        {},
        "macos",
      ),
    ).toBe("/repo/.claude/worktrees/a");
    expect(
      sessionActiveWorktree(
        { ...base, currentCwd: "/repo/.claude/worktrees/a/src/deep" },
        detected,
        {},
        "macos",
      ),
    ).toBe("/repo/.claude/worktrees/a");
  });

  it("returns null at home, for record worktree agents, and for unknown cwds", () => {
    expect(
      sessionActiveWorktree(
        { ...base, currentCwd: "/repo" },
        detected,
        {},
        "macos",
      ),
    ).toBeNull();
    expect(sessionActiveWorktree(base, detected, {}, "macos")).toBeNull();
    expect(
      sessionActiveWorktree(
        { ...base, worktreeParent: "/repo", currentCwd: "/side-wt" },
        detected,
        {},
        "macos",
      ),
    ).toBeNull();
    expect(
      sessionActiveWorktree(
        { ...base, currentCwd: "/elsewhere" },
        detected,
        {},
        "macos",
      ),
    ).toBeNull();
  });

  it("falls back to the heuristic map, but only while the worktree still exists", () => {
    expect(
      sessionActiveWorktree(base, detected, { s1: "/side-wt" }, "macos"),
    ).toBe("/side-wt");
    // Vanished worktree → the guess no longer places the row (self-healing).
    expect(
      sessionActiveWorktree(base, ["/other"], { s1: "/side-wt" }, "macos"),
    ).toBeNull();
  });
});

describe("attributeNewWorktrees (non-claude heuristic)", () => {
  const sessions = [
    { id: "codex1", repoPath: "/repo" },
    { id: "codex2", repoPath: "/repo" },
    { id: "claude1", repoPath: "/repo" },
  ];
  const prev = { "/repo": [wt({ path: "/repo", is_main: true })] };
  const next = {
    "/repo": [
      wt({ path: "/repo", is_main: true }),
      wt({ path: "/repo/.wt/x" }),
    ],
  };
  const notClaude = (id: string) => id.startsWith("codex");

  it("attributes a single new external worktree to the single busy eligible session", () => {
    const out = attributeNewWorktrees(
      prev,
      next,
      sessions,
      { codex1: true },
      notClaude,
      {},
      "macos",
    );
    expect(out).toEqual({ codex1: "/repo/.wt/x" });
  });

  it("stays silent when ambiguous (two busy candidates) or when claude is the busy one", () => {
    expect(
      attributeNewWorktrees(
        prev,
        next,
        sessions,
        { codex1: true, codex2: true },
        notClaude,
        {},
        "macos",
      ),
    ).toEqual({});
    expect(
      attributeNewWorktrees(
        prev,
        next,
        sessions,
        { claude1: true },
        notClaude,
        {},
        "macos",
      ),
    ).toEqual({});
  });

  it("never attributes managed worktrees and keeps prior guesses", () => {
    const managedNext = {
      "/repo": [
        wt({ path: "/repo", is_main: true }),
        wt({ path: "/m", managed: true }),
      ],
    };
    const out = attributeNewWorktrees(
      prev,
      managedNext,
      sessions,
      { codex1: true },
      notClaude,
      { codex2: "/old-guess" },
      "macos",
    );
    expect(out).toEqual({ codex2: "/old-guess" });
  });
});

describe("vanishedWorktrees (lifecycle)", () => {
  const prev = {
    "/repo": [
      wt({ path: "/repo", is_main: true }),
      wt({ path: "/repo/.wt/x", branch: "worktree-x" }),
    ],
  };

  it("reports a worktree missing from an authoritative new listing", () => {
    const next = { "/repo": [wt({ path: "/repo", is_main: true })] };
    expect(vanishedWorktrees(prev, next, ["/repo"], "macos")).toEqual([
      { repo: "/repo", path: "/repo/.wt/x", branch: "worktree-x" },
    ]);
  });

  it("treats an omitted repo key as a failed read — nothing vanished (fail-open)", () => {
    expect(vanishedWorktrees(prev, {}, ["/repo"], "macos")).toEqual([]);
  });
});

describe("worktreeScopeRepos (busy→idle scope mapping)", () => {
  const sidebar = ["/repo", "/other"];
  const parentOf = (p: string) => (p === "/repo/.wt/x" ? "/repo" : undefined);

  it("passes sidebar repos through and maps worktree paths to their parent", () => {
    expect(worktreeScopeRepos(["/repo"], sidebar, parentOf, "macos")).toEqual([
      "/repo",
    ]);
    expect(
      worktreeScopeRepos(["/repo/.wt/x"], sidebar, parentOf, "macos"),
    ).toEqual(["/repo"]);
    expect(
      worktreeScopeRepos(["/repo", "/repo/.wt/x"], sidebar, parentOf, "macos"),
    ).toEqual(["/repo"]);
  });

  it("falls back to unscoped (null) for unknown paths and passes null through", () => {
    expect(
      worktreeScopeRepos(["/mystery"], sidebar, parentOf, "macos"),
    ).toBeNull();
    expect(worktreeScopeRepos(null, sidebar, parentOf, "macos")).toBeNull();
    expect(worktreeScopeRepos([], sidebar, parentOf, "macos")).toBeNull();
  });
});
