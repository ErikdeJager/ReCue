import { beforeEach, describe, expect, it, vi } from "vitest";

// Worktree detection store integration: refresh merge (fail-open), the vanish
// lifecycle (auto-close + toast, never a worktree removal), scope mapping, the
// relocation handler, the heuristic, the cleanup short-circuit, and the
// Overview cluster attribution. Owns its own ./ipc mock, mirroring
// `store.gitRefresh.test.ts`.
vi.mock("./ipc", () => ({
  bootState: vi.fn(),
  currentBranches: vi.fn(),
  githubWebUrls: vi.fn(),
  diffLineCounts: vi.fn(),
  branchAheadBehind: vi.fn(),
  fileStatuses: vi.fn(),
  listRepoWorktrees: vi.fn(),
  killSession: vi.fn(),
  removeWorktree: vi.fn(),
  cleanupWorktreeIfEmpty: vi.fn(),
  deleteWorktree: vi.fn(),
  cancelSchedule: vi.fn(),
  setOverviewPanels: vi.fn(),
  spawnSession: vi.fn(),
  spawnTerminal: vi.fn(),
  setOpenFiles: vi.fn(),
  setCanvases: vi.fn(),
  setLastVersion: vi.fn(),
  claudeSessionUsage: vi.fn(),
}));

import * as ipc from "./ipc";
import { DEFAULT_SETTINGS, overviewClusters, useStore } from "./store";
import type { RepoWorktree, SessionView } from "./types";

const m = vi.mocked;

const REPO = "/repo/a";
const WT = "/repo/a/.claude/worktrees/feat-x";

const entry = (
  over: Partial<RepoWorktree> & { path: string },
): RepoWorktree => ({
  head: "abc",
  branch: "worktree-feat-x",
  is_main: false,
  managed: false,
  exists: true,
  locked: false,
  locked_reason: null,
  prunable: false,
  ...over,
});

const mainEntry = entry({ path: REPO, is_main: true, branch: "main" });

const session = (over: Partial<SessionView> & { id: string }): SessionView => ({
  claudeSessionId: over.id,
  repoPath: REPO,
  name: null,
  createdAt: 1,
  worktreeParent: null,
  autoName: null,
  hasBeenActive: false,
  agent: "claude",
  forkedFrom: null,
  forkable: true,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  m(ipc.currentBranches).mockResolvedValue({});
  m(ipc.githubWebUrls).mockResolvedValue({});
  m(ipc.diffLineCounts).mockResolvedValue({});
  m(ipc.branchAheadBehind).mockResolvedValue({});
  m(ipc.fileStatuses).mockResolvedValue([]);
  m(ipc.listRepoWorktrees).mockResolvedValue({});
  m(ipc.killSession).mockResolvedValue(undefined);
  m(ipc.removeWorktree).mockResolvedValue(undefined);
  m(ipc.deleteWorktree).mockResolvedValue(undefined);
  m(ipc.cancelSchedule).mockResolvedValue(undefined);
  m(ipc.setOverviewPanels).mockResolvedValue(undefined);
  useStore.setState({
    sessions: [],
    recents: [REPO],
    branches: {},
    repoWorktrees: {},
    heuristicWorktrees: {},
    overviewPanels: {},
    sessionBusy: {},
    schedules: [],
    toasts: [],
    fileTreeMounts: {},
    resumeSettled: true,
    platform: "macos",
    settings: { ...DEFAULT_SETTINGS },
  });
});

describe("refreshWorktrees — merge + fail-open", () => {
  it("stores an authoritative listing and rides the refreshRepoGit volley", async () => {
    m(ipc.listRepoWorktrees).mockResolvedValue({
      [REPO]: [mainEntry, entry({ path: WT })],
    });
    await useStore.getState().refreshRepoGit({ kinds: ["worktrees"] });
    expect(ipc.listRepoWorktrees).toHaveBeenCalledWith([REPO]);
    expect(useStore.getState().repoWorktrees[REPO]).toHaveLength(2);
    // The worktrees-only volley runs none of the other reads.
    expect(ipc.currentBranches).not.toHaveBeenCalled();
  });

  it("keeps prior entries for a repo OMITTED from the reply (failed read)", async () => {
    useStore.setState({
      repoWorktrees: { [REPO]: [mainEntry, entry({ path: WT })] },
    });
    m(ipc.listRepoWorktrees).mockResolvedValue({}); // repo omitted = read failed
    await useStore.getState().refreshWorktrees();
    expect(useStore.getState().repoWorktrees[REPO]).toHaveLength(2);
    // No vanish lifecycle fired either — nothing authoritatively disappeared.
    expect(useStore.getState().toasts).toHaveLength(0);
  });

  it("keeps the slice untouched when the IPC itself rejects", async () => {
    useStore.setState({ repoWorktrees: { [REPO]: [mainEntry] } });
    m(ipc.listRepoWorktrees).mockRejectedValue(new Error("gone"));
    await useStore.getState().refreshWorktrees();
    expect(useStore.getState().repoWorktrees[REPO]).toHaveLength(1);
  });
});

describe("refreshWorktrees — vanish lifecycle", () => {
  it("auto-closes a removed worktree's items with one toast and never removes the worktree", async () => {
    useStore.setState({
      repoWorktrees: { [REPO]: [mainEntry, entry({ path: WT })] },
      overviewPanels: {
        [WT]: [
          { id: "p1", kind: "markdown", file: "notes.md" },
          { id: "t1", kind: "terminal" },
        ],
      },
    });
    // Authoritative listing without the worktree — Claude cleaned it up.
    m(ipc.listRepoWorktrees).mockResolvedValue({ [REPO]: [mainEntry] });
    await useStore.getState().refreshWorktrees([REPO]);

    expect(useStore.getState().overviewPanels[WT]).toBeUndefined();
    expect(ipc.killSession).toHaveBeenCalledWith("t1"); // the shell panel's PTY
    const toasts = useStore.getState().toasts.map((t) => t.message);
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toContain("was removed");
    // The lifecycle NEVER deletes the checkout itself.
    expect(ipc.removeWorktree).not.toHaveBeenCalled();
  });

  it("is silent for an idle worktree disappearing (no items open)", async () => {
    useStore.setState({
      repoWorktrees: { [REPO]: [mainEntry, entry({ path: WT })] },
    });
    m(ipc.listRepoWorktrees).mockResolvedValue({ [REPO]: [mainEntry] });
    await useStore.getState().refreshWorktrees([REPO]);
    expect(useStore.getState().toasts).toHaveLength(0);
  });
});

describe("refreshWorktrees — scope mapping", () => {
  it("maps a worktree agent's folder (the busy→idle scope) to its parent repo", async () => {
    useStore.setState({
      sessions: [
        session({ id: "w1", repoPath: "/wt/path", worktreeParent: REPO }),
      ],
    });
    await useStore.getState().refreshWorktrees(["/wt/path"]);
    expect(ipc.listRepoWorktrees).toHaveBeenCalledWith([REPO]);
  });

  it("falls back to every sidebar repo for an unknown scoped path", async () => {
    await useStore.getState().refreshWorktrees(["/mystery"]);
    expect(ipc.listRepoWorktrees).toHaveBeenCalledWith([REPO]);
  });
});

describe("setSessionCwd — the relocation handler", () => {
  it("updates on change, clears the heuristic, and fires a scoped worktrees+branches refresh", async () => {
    useStore.setState({
      sessions: [session({ id: "s1" })],
      heuristicWorktrees: { s1: "/old-guess" },
    });
    useStore.getState().setSessionCwd("s1", WT);
    expect(useStore.getState().sessions[0]?.currentCwd).toBe(WT);
    expect(useStore.getState().heuristicWorktrees.s1).toBeUndefined();
    // The scoped follow-up volley (debounced through refreshRepoGit) reaches both reads.
    await vi.waitFor(() => {
      expect(ipc.listRepoWorktrees).toHaveBeenCalledWith([REPO]);
      expect(ipc.currentBranches).toHaveBeenCalledWith([REPO]);
    });
  });

  it("is a no-op for an unknown session or an unchanged cwd", () => {
    useStore.setState({
      sessions: [session({ id: "s1", currentCwd: WT })],
    });
    useStore.getState().setSessionCwd("ghost", "/x");
    useStore.getState().setSessionCwd("s1", WT);
    expect(ipc.listRepoWorktrees).not.toHaveBeenCalled();
  });
});

describe("refreshWorktrees — non-claude heuristic", () => {
  it("attributes a NEW external worktree to the single busy log-less session", async () => {
    useStore.setState({
      sessions: [
        session({ id: "cx", agent: "codex" }),
        session({ id: "cl", agent: "claude" }),
      ],
      sessionBusy: { cx: true },
      repoWorktrees: { [REPO]: [mainEntry] },
    });
    m(ipc.listRepoWorktrees).mockResolvedValue({
      [REPO]: [mainEntry, entry({ path: WT })],
    });
    await useStore.getState().refreshWorktrees([REPO]);
    expect(useStore.getState().heuristicWorktrees).toEqual({ cx: WT });
  });
});

describe("cleanupWorktreeIfEmpty — external worktrees", () => {
  it("calls the Rust cleanup for a detected EXTERNAL worktree (reason-gated unlock lives backend-side) — and never removes", async () => {
    // Task 451: the round-trip is required — the Rust NotManaged path releases
    // ReCue's own dev-container lock (exact-reason-gated, never deleting), so
    // the frontend must not short-circuit a detected external worktree. The
    // outcome handling is unchanged: `notManaged` → keep silently.
    m(ipc.cleanupWorktreeIfEmpty).mockResolvedValue("notManaged");
    useStore.setState({
      repoWorktrees: { [REPO]: [mainEntry, entry({ path: WT })] },
    });
    await useStore.getState().cleanupWorktreeIfEmpty(REPO, WT);
    expect(ipc.cleanupWorktreeIfEmpty).toHaveBeenCalledWith(REPO, WT);
    expect(ipc.removeWorktree).not.toHaveBeenCalled();
    expect(useStore.getState().toasts).toEqual([]);
  });

  it("still removes an empty app-managed worktree (#74 — ref-count + remove Rust-owned since task 431)", async () => {
    const managed = "/data/worktrees/repo-1/feat";
    m(ipc.cleanupWorktreeIfEmpty).mockResolvedValue("removed");
    useStore.setState({
      repoWorktrees: {
        [REPO]: [mainEntry, entry({ path: managed, managed: true })],
      },
    });
    await useStore.getState().cleanupWorktreeIfEmpty(REPO, managed);
    expect(ipc.cleanupWorktreeIfEmpty).toHaveBeenCalledWith(REPO, managed);
    // The non-forced `git worktree remove` happens inside the Rust command —
    // never a direct frontend removeWorktree on this path.
    expect(ipc.removeWorktree).not.toHaveBeenCalled();
  });

  it("keeps silently when Rust refuses a non-managed dest (notManaged — no toast)", async () => {
    // The frontend short-circuit needs the detection slice; the Rust guard does
    // not (it protects the clean-exit path too). A dest NOT in the local slice
    // (e.g. the listing hasn't loaded yet) reaches the Rust command, which
    // refuses — the store must keep silently, exactly like "inUse".
    m(ipc.cleanupWorktreeIfEmpty).mockResolvedValue("notManaged");
    await useStore.getState().cleanupWorktreeIfEmpty(REPO, "/home/user/own-wt");
    expect(ipc.cleanupWorktreeIfEmpty).toHaveBeenCalledWith(
      REPO,
      "/home/user/own-wt",
    );
    expect(ipc.removeWorktree).not.toHaveBeenCalled();
    expect(useStore.getState().toasts).toEqual([]);
  });
});

describe("deleteWorktree (Delete worktree…)", () => {
  it("kills the worktree's agents, closes its panels, deletes, and re-detects", async () => {
    useStore.setState({
      sessions: [
        // Lives in the worktree — killed + dropped.
        session({ id: "wt-agent", repoPath: WT, worktreeParent: REPO }),
        // Relocated into it via currentCwd — killed + dropped too.
        session({ id: "moved", currentCwd: `${WT}/src` }),
        // A home session of the parent repo — untouched.
        session({ id: "home" }),
      ],
      repoWorktrees: { [REPO]: [mainEntry, entry({ path: WT })] },
      overviewPanels: { [WT]: [{ id: "p1", kind: "diff" }] },
    });
    await useStore.getState().deleteWorktree(REPO, WT);

    expect(ipc.killSession).toHaveBeenCalledWith("wt-agent");
    expect(ipc.killSession).toHaveBeenCalledWith("moved");
    expect(useStore.getState().sessions.map((s) => s.id)).toEqual(["home"]);
    expect(useStore.getState().overviewPanels[WT]).toBeUndefined();
    expect(ipc.deleteWorktree).toHaveBeenCalledWith(REPO, WT);
    // The explicit delete owns the teardown — the ref-counted automation
    // (`remove_worktree`) never fires mid-delete.
    expect(ipc.removeWorktree).not.toHaveBeenCalled();
    const toasts = useStore.getState().toasts.map((t) => t.message);
    expect(toasts).toContain("Worktree deleted");
    await vi.waitFor(() => {
      expect(ipc.listRepoWorktrees).toHaveBeenCalled();
    });
  });

  it("cancels schedules targeting the worktree without the 'kept' mis-toast", async () => {
    useStore.setState({
      schedules: [
        {
          id: "sch1",
          cwd: REPO,
          worktree: true,
          worktree_path: WT,
          fire_at: 99,
          created_at: 1,
        },
      ],
      repoWorktrees: { [REPO]: [mainEntry, entry({ path: WT })] },
    });
    await useStore.getState().deleteWorktree(REPO, WT);

    expect(useStore.getState().schedules).toHaveLength(0);
    expect(ipc.cancelSchedule).toHaveBeenCalledWith("sch1");
    expect(ipc.deleteWorktree).toHaveBeenCalledWith(REPO, WT);
    // cancelSchedule's own worktree cleanup is suppressed by the in-flight
    // delete (the deletingWorktrees guard) — no non-forced remove, no
    // "Worktree kept — it has uncommitted changes" toast.
    expect(ipc.removeWorktree).not.toHaveBeenCalled();
    const toasts = useStore.getState().toasts.map((t) => t.message);
    expect(toasts).not.toContain("Worktree kept — it has uncommitted changes");
    expect(toasts).toContain("Worktree deleted");
  });

  it("toasts the backend error and still re-detects", async () => {
    m(ipc.deleteWorktree).mockRejectedValue(new Error("nope"));
    await useStore.getState().deleteWorktree(REPO, WT);
    const toasts = useStore.getState().toasts.map((t) => t.message);
    expect(toasts).toContain("Could not delete worktree");
    await vi.waitFor(() => {
      expect(ipc.listRepoWorktrees).toHaveBeenCalled();
    });
  });
});

describe("spawnSessionInWorktree", () => {
  it("spawns IN PLACE with the explicit parent and recents-touches the parent only", async () => {
    m(ipc.spawnSession).mockResolvedValue({
      id: "n1",
      claude_session_id: "n1",
      repo_path: WT,
      name: null,
      created_at: 1,
      worktree_parent: REPO,
    });
    const ok = await useStore.getState().spawnSessionInWorktree(WT, REPO);
    expect(ok).toBe(true);
    expect(ipc.spawnSession).toHaveBeenCalledWith(
      WT,
      undefined,
      undefined,
      DEFAULT_SETTINGS.defaultAgent,
      undefined,
      REPO,
    );
    const s = useStore.getState();
    expect(s.sessions[0]?.worktreeParent).toBe(REPO);
    expect(s.recents).toContain(REPO);
    expect(s.recents).not.toContain(WT);
  });
});

describe("overviewClusters — detected worktree attribution", () => {
  it("clusters a detected-worktree panel under the parent repo, not as a stray", () => {
    const clusters = overviewClusters({
      sessions: [],
      overviewPanels: { [WT]: [{ id: "p1", kind: "diff" }] },
      overviewOrder: {},
      schedules: [],
      recurrings: [],
      worktreeParents: { [WT]: REPO },
      filter: null,
    });
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.repo).toBe(REPO);
    expect(clusters[0]?.keys).toEqual(["p1"]);
  });
});
