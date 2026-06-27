import { describe, expect, it } from "vitest";

import {
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
    expect(repoName("/Users/me/code/claudecue")).toBe("claudecue");
  });

  it("ignores a trailing slash", () => {
    expect(repoName("/Users/me/code/claudecue/")).toBe("claudecue");
  });

  it("falls back to the input for a root-ish path", () => {
    expect(repoName("/")).toBe("/");
  });

  it("splits Windows backslash paths (#143)", () => {
    expect(repoName("C:\\Users\\me\\code\\claudecue")).toBe("claudecue");
    expect(repoName("C:\\Users\\me\\code\\claudecue\\")).toBe("claudecue");
    // Mixed separators (a normalized prefix + a raw segment) still take the tail.
    expect(repoName("C:/Users/me\\repo")).toBe("repo");
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

describe("sessionInFilter (#197)", () => {
  const repoAgent = { repoPath: "/work/repo" };
  const wtAgent = {
    repoPath: "/data/worktrees/repo-id/feat",
    worktreeParent: "/work/repo",
  };

  it("shows everything when there is no filter", () => {
    expect(sessionInFilter(repoAgent, null)).toBe(true);
    expect(sessionInFilter(wtAgent, null)).toBe(true);
  });

  it("a repo filter matches the repo's direct agents AND its worktree agents", () => {
    expect(sessionInFilter(repoAgent, "/work/repo")).toBe(true);
    expect(sessionInFilter(wtAgent, "/work/repo")).toBe(true); // effectiveRepo = parent
  });

  it("a worktree-folder filter matches only that worktree's agents", () => {
    expect(sessionInFilter(wtAgent, "/data/worktrees/repo-id/feat")).toBe(true); // repoPath === filter
    expect(sessionInFilter(repoAgent, "/data/worktrees/repo-id/feat")).toBe(
      false,
    );
  });

  it("excludes sessions of an unrelated folder", () => {
    expect(sessionInFilter(repoAgent, "/work/other")).toBe(false);
    expect(sessionInFilter(wtAgent, "/work/other")).toBe(false);
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
