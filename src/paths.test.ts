import { describe, expect, it } from "vitest";

import {
  cloneRepoName,
  effectiveRepo,
  FORK_UNAVAILABLE_REASON,
  forkUnavailableReason,
  repoName,
  scheduleNestsUnderWorktree,
  sessionInFilter,
  splitPath,
  worktreeGroupPaths,
} from "./paths";

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

  it("splits a Windows path on the backslash separator (#143)", () => {
    expect(splitPath("C:\\Users\\me\\notes\\todo.md")).toEqual({
      dir: "C:\\Users\\me\\notes",
      base: "todo.md",
    });
  });
});

describe("repoName", () => {
  it("returns the last path segment", () => {
    expect(repoName("/Users/me/code/recue")).toBe("recue");
  });

  it("ignores a trailing slash", () => {
    expect(repoName("/Users/me/code/recue/")).toBe("recue");
  });

  it("falls back to the input for a root-ish path", () => {
    expect(repoName("/")).toBe("/");
  });

  it("splits Windows backslash paths (#143)", () => {
    expect(repoName("C:\\Users\\me\\code\\recue")).toBe("recue");
    expect(repoName("C:\\Users\\me\\code\\recue\\")).toBe("recue");
    // Mixed separators (a normalized prefix + a raw segment) still take the tail.
    expect(repoName("C:/Users/me\\repo")).toBe("repo");
  });
});

describe("cloneRepoName (#299)", () => {
  it("takes the last path segment and strips a trailing .git", () => {
    expect(cloneRepoName("https://github.com/owner/repo.git")).toBe("repo");
    expect(cloneRepoName("https://github.com/owner/repo")).toBe("repo");
  });

  it("handles the SCP form (git@host:owner/repo.git)", () => {
    expect(cloneRepoName("git@github.com:owner/repo.git")).toBe("repo");
  });

  it("ignores a trailing slash", () => {
    expect(cloneRepoName("https://host/owner/repo/")).toBe("repo");
  });

  it("trims surrounding whitespace", () => {
    expect(cloneRepoName("  https://host/owner/repo.git  ")).toBe("repo");
  });

  it("falls back to 'repo' when the derived name is empty", () => {
    expect(cloneRepoName("")).toBe("repo");
    expect(cloneRepoName("   ")).toBe("repo");
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

describe("sessionInFilter (#197/#247)", () => {
  const repoAgent = { repoPath: "/work/repo" };
  const wtAgent = {
    repoPath: "/data/worktrees/repo-id/feat",
    worktreeParent: "/work/repo",
  };

  it("shows everything when there is no filter", () => {
    expect(sessionInFilter(repoAgent, null)).toBe(true);
    expect(sessionInFilter(wtAgent, null)).toBe(true);
  });

  it("an 'all' repo filter matches the repo's direct agents AND its worktree agents", () => {
    const f = { path: "/work/repo", mode: "all" as const };
    expect(sessionInFilter(repoAgent, f)).toBe(true);
    expect(sessionInFilter(wtAgent, f)).toBe(true); // effectiveRepo = parent
  });

  it("an 'own' repo filter matches ONLY the repo's own (non-worktree) agents, hiding worktrees (#247)", () => {
    const f = { path: "/work/repo", mode: "own" as const };
    expect(sessionInFilter(repoAgent, f)).toBe(true);
    expect(sessionInFilter(wtAgent, f)).toBe(false); // worktree agent hidden
  });

  it("a worktree-folder filter matches only that worktree's agents", () => {
    const f = { path: "/data/worktrees/repo-id/feat", mode: "all" as const };
    expect(sessionInFilter(wtAgent, f)).toBe(true); // repoPath === filter.path
    expect(sessionInFilter(repoAgent, f)).toBe(false);
  });

  it("excludes sessions of an unrelated folder", () => {
    const all = { path: "/work/other", mode: "all" as const };
    const own = { path: "/work/other", mode: "own" as const };
    expect(sessionInFilter(repoAgent, all)).toBe(false);
    expect(sessionInFilter(wtAgent, all)).toBe(false);
    expect(sessionInFilter(repoAgent, own)).toBe(false);
  });
});

describe("forkUnavailableReason (#138/#142)", () => {
  it("is null for a claude session with conversation history", () => {
    expect(
      forkUnavailableReason({ agent: "claude", forkable: true }),
    ).toBeNull();
  });

  it("is the no-history reason for a claude session with no turn yet (#138)", () => {
    expect(forkUnavailableReason({ agent: "claude", forkable: false })).toBe(
      FORK_UNAVAILABLE_REASON,
    );
  });

  it("is a Codex-specific reason that takes precedence over forkable (#142)", () => {
    // Even with forkable true, a Codex session can't fork at all.
    const reason = forkUnavailableReason({ agent: "codex", forkable: true });
    expect(reason).toContain("Codex");
  });
});

describe("scheduleNestsUnderWorktree (#218)", () => {
  it("nests a worktree schedule with a computed worktree_path", () => {
    expect(
      scheduleNestsUnderWorktree({
        worktree: true,
        worktree_path: "/data/worktrees/repo-id/feat",
      }),
    ).toBe(true);
  });

  it("keeps a non-worktree schedule at the parent level", () => {
    expect(
      scheduleNestsUnderWorktree({ worktree: false, worktree_path: null }),
    ).toBe(false);
  });

  it("keeps a worktree schedule with no computed path at the parent level (pre-#218)", () => {
    // A worktree schedule created before #218 has no worktree_path, so it can't be
    // keyed to a sub-group and stays at the parent level until re-created.
    expect(
      scheduleNestsUnderWorktree({ worktree: true, worktree_path: null }),
    ).toBe(false);
    expect(scheduleNestsUnderWorktree({ worktree: true })).toBe(false);
  });
});

describe("worktreeGroupPaths (#74/#218)", () => {
  it("collapses a live agent and a schedule on the same path to one sub-group", () => {
    const wt = "/data/worktrees/repo-id/feat";
    expect(
      worktreeGroupPaths([{ repoPath: wt }], [{ worktree_path: wt }]),
    ).toEqual([wt]);
  });

  it("produces a sub-group for a schedule-only worktree path", () => {
    const wt = "/data/worktrees/repo-id/scheduled";
    expect(worktreeGroupPaths([], [{ worktree_path: wt }])).toEqual([wt]);
  });

  it("unions live-agent paths (first) with distinct schedule-only paths", () => {
    const live = "/data/worktrees/repo-id/live";
    const sched = "/data/worktrees/repo-id/sched";
    expect(
      worktreeGroupPaths(
        [{ repoPath: live }],
        [{ worktree_path: live }, { worktree_path: sched }],
      ),
    ).toEqual([live, sched]);
  });

  it("dedupes repeated live-agent paths and ignores null schedule paths", () => {
    const wt = "/data/worktrees/repo-id/feat";
    expect(
      worktreeGroupPaths(
        [{ repoPath: wt }, { repoPath: wt }],
        [{ worktree_path: null }, { worktree_path: undefined }],
      ),
    ).toEqual([wt]);
  });
});
