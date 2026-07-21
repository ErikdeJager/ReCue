import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// #359: exercise the coalesced git-refresh volley against a fully mocked IPC layer. This
// file owns its own ./ipc mock (Vitest isolates module mocks per file, so store.test.ts —
// which relies on the real, host-less ipc — is unaffected), mirroring
// `store.refresh.test.ts`.
vi.mock("./ipc", () => ({
  // #352: the boot read is one batched `boot_state` command, applied by `applyBootState`.
  bootState: vi.fn(),
  currentBranches: vi.fn(),
  githubWebUrls: vi.fn(),
  diffLineCounts: vi.fn(),
  branchAheadBehind: vi.fn(),
  fileStatuses: vi.fn(),
  listRepoWorktrees: vi.fn(),
  // Fire-and-forget writes/probes `applyBootState` may kick off after the payload lands.
  setOpenFiles: vi.fn(),
  setCanvases: vi.fn(),
  setLastVersion: vi.fn(),
  spawnTerminal: vi.fn(),
}));

import * as ipc from "./ipc";
import { DEFAULT_SETTINGS, useStore } from "./store";
import type { BootState, SessionRecord } from "./types";

const m = vi.mocked;

/** A benign boot payload (#352); each test overrides only the fields it needs. */
function makeBootState(over: Partial<BootState> = {}): BootState {
  return {
    sessions: [],
    recents: [],
    repo_colors: {},
    overview_panels: {},
    overview_order: {},
    open_files: {},
    canvas_layout: null,
    // A valid canvas state skips the migration branch (no crypto/randomUUID needed).
    canvases: {
      canvases: [{ id: "c1", name: "Canvas 1", layout: null }],
      activeId: "c1",
    },
    canvas_templates: null,
    settings: null,
    sidebar_width: null,
    sidebar_collapsed: null,
    repo_order: [],
    diff_seen: null,
    schedules: [],
    recurrings: [],
    last_version: null,
    app_version: "1.0.0",
    platform: "macos",
    windows_build: 0,
    // PTY liveness (task 450): default to "nothing live/exited/busy".
    live_ids: [],
    exit_codes: {},
    busy_ids: [],
    ...over,
  };
}

/** A deferred promise, so a test can hold a volley "in flight". */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  m(ipc.bootState).mockResolvedValue(makeBootState());
  m(ipc.setOpenFiles).mockResolvedValue(undefined);
  m(ipc.setCanvases).mockResolvedValue(undefined);
  m(ipc.setLastVersion).mockResolvedValue(undefined);
  m(ipc.spawnTerminal).mockResolvedValue(undefined);
  m(ipc.currentBranches).mockResolvedValue({});
  m(ipc.githubWebUrls).mockResolvedValue({});
  m(ipc.diffLineCounts).mockResolvedValue({});
  m(ipc.branchAheadBehind).mockResolvedValue({});
  m(ipc.fileStatuses).mockResolvedValue([]);
  m(ipc.listRepoWorktrees).mockResolvedValue({});
  useStore.setState({
    sessions: [],
    recents: ["/repo/a", "/repo/b"],
    branches: {},
    githubUrls: {},
    diffLineCounts: {},
    branchAheadBehind: {},
    fileStatuses: {},
    fileTreeMounts: {},
    resumeSettled: true,
    settings: { ...DEFAULT_SETTINGS },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("refreshRepoGit — kinds (#359)", () => {
  it("issues only the requested kind (the boot tier-1 branch read)", async () => {
    await useStore.getState().refreshRepoGit({ kinds: ["branches"] });

    // One `current_branches` batch IPC — one `git rev-parse` per folder …
    expect(ipc.currentBranches).toHaveBeenCalledTimes(1);
    expect(ipc.currentBranches).toHaveBeenCalledWith(["/repo/a", "/repo/b"]);
    // … and none of the ~6-spawns-per-folder decorations.
    expect(ipc.githubWebUrls).not.toHaveBeenCalled();
    expect(ipc.diffLineCounts).not.toHaveBeenCalled();
    expect(ipc.branchAheadBehind).not.toHaveBeenCalled();
    expect(ipc.fileStatuses).not.toHaveBeenCalled();
  });

  it("runs every kind by default", async () => {
    await useStore.getState().refreshRepoGit();
    expect(ipc.currentBranches).toHaveBeenCalledTimes(1);
    expect(ipc.githubWebUrls).toHaveBeenCalledTimes(1);
    expect(ipc.diffLineCounts).toHaveBeenCalledTimes(1);
    expect(ipc.branchAheadBehind).toHaveBeenCalledTimes(1);
    expect(ipc.listRepoWorktrees).toHaveBeenCalledTimes(1);
  });
});

describe("refreshRepoGit — boot deferral (#359)", () => {
  it("issues ZERO git IPC while the resume window is open, then exactly one volley when it settles", async () => {
    useStore.setState({ resumeSettled: false });

    await useStore.getState().refreshRepoGit({ whenSettled: true });
    // Nothing runs while the persisted PTYs are still resuming.
    expect(ipc.currentBranches).not.toHaveBeenCalled();
    expect(ipc.githubWebUrls).not.toHaveBeenCalled();
    expect(ipc.diffLineCounts).not.toHaveBeenCalled();
    expect(ipc.branchAheadBehind).not.toHaveBeenCalled();

    // A second deferred request while still waiting is merged, not queued twice.
    await useStore.getState().refreshRepoGit({ whenSettled: true });
    expect(ipc.githubWebUrls).not.toHaveBeenCalled();
  });

  it("flushes the deferred volley from the 4s reconnect backstop, even if no session ever resumes", async () => {
    vi.useFakeTimers();
    // One persisted record whose resume never produces output → the boot apply marks the
    // resume window open; only the unconditional backstop closes it.
    const record: SessionRecord = {
      id: "s1",
      claude_session_id: "s1",
      repo_path: "/repo/a",
      name: null,
      created_at: 0,
    };
    m(ipc.bootState).mockResolvedValue(
      makeBootState({ sessions: [record], recents: ["/repo/a"] }),
    );

    await useStore.getState().refresh();
    expect(useStore.getState().resumeSettled).toBe(false);

    await useStore.getState().refreshRepoGit({ whenSettled: true });
    expect(ipc.diffLineCounts).not.toHaveBeenCalled();

    // The existing RECONNECT_BACKSTOP_MS (4s) timeout is the hard cap.
    await vi.advanceTimersByTimeAsync(4000);

    expect(useStore.getState().resumeSettled).toBe(true);
    expect(ipc.diffLineCounts).toHaveBeenCalledTimes(1);
    expect(ipc.githubWebUrls).toHaveBeenCalledTimes(1);
    expect(ipc.branchAheadBehind).toHaveBeenCalledTimes(1);
  });

  it("runs immediately (no deferral) when there is nothing to resume", async () => {
    vi.useFakeTimers();
    m(ipc.bootState).mockResolvedValue(
      makeBootState({ sessions: [], recents: ["/repo/a"] }),
    );

    await useStore.getState().refresh();
    expect(useStore.getState().resumeSettled).toBe(true);

    await useStore.getState().refreshRepoGit({ whenSettled: true });
    expect(ipc.diffLineCounts).toHaveBeenCalledTimes(1);
  });
});

describe("refreshRepoGit — per-repo scoping (#359)", () => {
  it("reads only the scoped folder, preserving the other folders' entries", async () => {
    useStore.setState({
      branches: { "/repo/a": "old", "/repo/b": "main" },
      branchAheadBehind: {
        "/repo/a": { ahead: 1, behind: 0 },
        "/repo/b": { ahead: 0, behind: 3 },
      },
    });
    m(ipc.currentBranches).mockResolvedValue({ "/repo/a": "feature" });
    m(ipc.branchAheadBehind).mockResolvedValue({
      "/repo/a": { ahead: 2, behind: 0 },
    });

    await useStore.getState().refreshRepoGit({ repos: ["/repo/a"] });

    expect(ipc.currentBranches).toHaveBeenCalledWith(["/repo/a"]);
    expect(ipc.branchAheadBehind).toHaveBeenCalledWith(["/repo/a"]);
    const s = useStore.getState();
    expect(s.branches).toEqual({ "/repo/a": "feature", "/repo/b": "main" });
    expect(s.branchAheadBehind).toEqual({
      "/repo/a": { ahead: 2, behind: 0 },
      "/repo/b": { ahead: 0, behind: 3 },
    });
  });

  it("drops a stale scoped key the read no longer returns (upstream removed)", async () => {
    useStore.setState({
      branchAheadBehind: {
        "/repo/a": { ahead: 1, behind: 0 },
        "/repo/b": { ahead: 0, behind: 3 },
      },
    });
    // /repo/a lost its upstream → it is absent from the scoped result.
    m(ipc.branchAheadBehind).mockResolvedValue({});

    await useStore
      .getState()
      .refreshRepoGit({ repos: ["/repo/a"], kinds: ["aheadBehind"] });

    const map = useStore.getState().branchAheadBehind;
    expect("/repo/a" in map).toBe(false);
    // The unscoped folder keeps its entry.
    expect(map["/repo/b"]).toEqual({ ahead: 0, behind: 3 });
  });
});

describe("refreshRepoGit — file statuses only for open trees (#359)", () => {
  it("issues ZERO file_statuses reads when no FileTree is mounted", async () => {
    await useStore.getState().refreshRepoGit();
    expect(ipc.fileStatuses).not.toHaveBeenCalled();
  });

  it("reads statuses once, for the mounted repo only", async () => {
    useStore.setState({ fileTreeMounts: { "/repo/a": 1 } });

    await useStore.getState().refreshRepoGit();

    expect(ipc.fileStatuses).toHaveBeenCalledTimes(1);
    expect(ipc.fileStatuses).toHaveBeenCalledWith("/repo/a");
  });

  it("intersects the mounted trees with the request's scope", async () => {
    useStore.setState({ fileTreeMounts: { "/repo/a": 1, "/repo/b": 1 } });

    // A settle in /repo/b must not re-read /repo/a's (heaviest) `git status`.
    await useStore.getState().refreshRepoGit({ repos: ["/repo/b"] });

    expect(ipc.fileStatuses).toHaveBeenCalledTimes(1);
    expect(ipc.fileStatuses).toHaveBeenCalledWith("/repo/b");
  });
});

describe("refreshRepoGit — in-flight coalescing (#359)", () => {
  it("never runs two volleys concurrently; a merged follow-up runs once afterwards", async () => {
    const gate = deferred<Record<string, string>>();
    m(ipc.currentBranches).mockReturnValueOnce(gate.promise);

    // Volley 1 (scoped to /repo/a) is in flight …
    const first = useStore
      .getState()
      .refreshRepoGit({ repos: ["/repo/a"], kinds: ["branches"] });
    expect(ipc.currentBranches).toHaveBeenCalledTimes(1);

    // … two more arrive while it is running: no second volley starts …
    void useStore
      .getState()
      .refreshRepoGit({ repos: ["/repo/b"], kinds: ["branches"] });
    void useStore
      .getState()
      .refreshRepoGit({ repos: ["/repo/b"], kinds: ["aheadBehind"] });
    expect(ipc.currentBranches).toHaveBeenCalledTimes(1);
    expect(ipc.branchAheadBehind).not.toHaveBeenCalled();

    gate.resolve({});
    await first;
    // Let the trailing (merged) rerun settle.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Exactly ONE follow-up, over the union of repos and of kinds.
    expect(ipc.currentBranches).toHaveBeenCalledTimes(2);
    expect(m(ipc.currentBranches).mock.calls[1]?.[0]).toEqual(["/repo/b"]);
    expect(ipc.branchAheadBehind).toHaveBeenCalledTimes(1);
    expect(m(ipc.branchAheadBehind).mock.calls[0]?.[0]).toEqual(["/repo/b"]);
  });

  it("keeps working after a rejecting sub-refresh (the in-flight guard cannot stick)", async () => {
    // Every sub-refresh try/catches internally, but even a hard IPC rejection must leave
    // the guard clear (`runGitRefresh` clears it in a `finally`).
    m(ipc.currentBranches).mockRejectedValueOnce(new Error("boom"));

    await useStore.getState().refreshRepoGit({ kinds: ["branches"] });
    await useStore.getState().refreshRepoGit({ kinds: ["branches"] });

    expect(ipc.currentBranches).toHaveBeenCalledTimes(2);
  });
});

describe("refreshRepoGit — full-volley throttle (#359)", () => {
  it("downgrades a throttled full request to the cheap pair right after a full volley", async () => {
    // A full, unscoped volley stamps `lastFullRefreshAt` …
    await useStore.getState().refreshRepoGit();
    expect(ipc.diffLineCounts).toHaveBeenCalledTimes(1);

    // … so the focus/visibility backstop that follows it immediately only re-reads the
    // cheap branches + ahead/behind pair (no untracked-file reads).
    await useStore.getState().refreshRepoGit({ throttleFull: true });
    expect(ipc.currentBranches).toHaveBeenCalledTimes(2);
    expect(ipc.branchAheadBehind).toHaveBeenCalledTimes(2);
    expect(ipc.diffLineCounts).toHaveBeenCalledTimes(1); // unchanged
    expect(ipc.githubWebUrls).toHaveBeenCalledTimes(1); // unchanged
  });

  it("does not throttle a scoped request", async () => {
    await useStore.getState().refreshRepoGit();
    await useStore
      .getState()
      .refreshRepoGit({ repos: ["/repo/a"], throttleFull: true });
    // A scoped request is cheap by construction — it runs all its kinds.
    expect(ipc.diffLineCounts).toHaveBeenCalledTimes(2);
    expect(m(ipc.diffLineCounts).mock.calls[1]?.[0]).toEqual(["/repo/a"]);
  });
});

describe("refreshDiffLineCounts — the setting still gates it (#335/#359)", () => {
  it("issues no git read at all when the badge is turned off", async () => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, showDiffLineCounts: false },
    });
    await useStore.getState().refreshRepoGit();
    expect(ipc.diffLineCounts).not.toHaveBeenCalled();
    // The other kinds still run.
    expect(ipc.currentBranches).toHaveBeenCalledTimes(1);
  });
});
