import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// #110/#352: exercise refresh()'s handling of the batched `boot_state` payload (the
// legacy `open_files` clear, the #112 sessionActive seeding, …) against a fully mocked
// IPC layer. This file owns its own ./ipc mock; Vitest isolates module mocks per file,
// so store.test.ts — which relies on the real (host-less, rejecting) ipc — is unaffected.
vi.mock("./ipc", () => ({
  bootState: vi.fn(),
  subscribeSessionEvents: vi.fn(),
  subscribeCanvasEvents: vi.fn(),
  subscribeScheduleEvents: vi.fn(),
  subscribeRecurringEvents: vi.fn(),
  subscribeStateSyncEvents: vi.fn(),
  subscribeUsageEvents: vi.fn(),
  subscribeContainerEvents: vi.fn(),
  listSessions: vi.fn(),
  listRecents: vi.fn(),
  listRepoColors: vi.fn(),
  listOverviewPanels: vi.fn(),
  listOverviewOrder: vi.fn(),
  listOpenFiles: vi.fn(),
  setOpenFiles: vi.fn(),
  setOverviewPanels: vi.fn(),
  getCanvasLayout: vi.fn(),
  getCanvases: vi.fn(),
  setCanvases: vi.fn(),
  getSettings: vi.fn(),
  getSidebarWidth: vi.fn(),
  getSidebarCollapsed: vi.fn(),
  getRepoOrder: vi.fn(),
  getDiffSeen: vi.fn(),
  getCanvasTemplates: vi.fn(),
  setCanvasTemplates: vi.fn(),
  spawnTerminal: vi.fn(),
  listSchedules: vi.fn(),
  listRecurrings: vi.fn(),
  appVersion: vi.fn(),
  getLastVersion: vi.fn(),
  setLastVersion: vi.fn(),
  listCanvasWindows: vi.fn(),
  platform: vi.fn(),
  windowsBuild: vi.fn(),
  forkSession: vi.fn(),
  listBranches: vi.fn(),
  spawnSession: vi.fn(),
  currentBranches: vi.fn(),
  fileStatuses: vi.fn(),
  githubWebUrls: vi.fn(),
  diffLineCounts: vi.fn(),
  branchAheadBehind: vi.fn(),
  // Post-boot, off-the-critical-path probes `init()` fires and forgets.
  agentInfo: vi.fn(),
  dirExists: vi.fn(),
  installKind: vi.fn(),
  autoContinueSnapshot: vi.fn(),
}));

import * as ipc from "./ipc";
import { useStore } from "./store";
import type { BootState, OverviewPanel, SessionRecord } from "./types";

const m = vi.mocked;

/** A benign, fully-populated boot payload (#352) — one call now carries everything the
 * boot used to fetch in ~21 separate commands. Each test overrides just the fields its
 * scenario needs. */
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
    detached_canvas_ids: [],
    ...over,
  };
}

/** Default every boot IPC call to a benign resolved value; each test overrides the
 * boot payload (or a specific setter) to set up its scenario. */
function primeIpc(): void {
  m(ipc.bootState).mockResolvedValue(makeBootState());
  m(ipc.subscribeSessionEvents).mockResolvedValue(() => {});
  m(ipc.subscribeCanvasEvents).mockResolvedValue(() => {});
  m(ipc.subscribeScheduleEvents).mockResolvedValue(() => {});
  m(ipc.subscribeRecurringEvents).mockResolvedValue(() => {});
  m(ipc.subscribeStateSyncEvents).mockResolvedValue(() => {});
  m(ipc.subscribeUsageEvents).mockResolvedValue(() => {});
  m(ipc.subscribeContainerEvents).mockResolvedValue(() => {});
  m(ipc.setOpenFiles).mockResolvedValue(undefined);
  m(ipc.setOverviewPanels).mockResolvedValue(undefined);
  m(ipc.setCanvases).mockResolvedValue(undefined);
  m(ipc.setCanvasTemplates).mockResolvedValue(undefined);
  m(ipc.setLastVersion).mockResolvedValue(undefined);
  m(ipc.spawnTerminal).mockResolvedValue(undefined);
  m(ipc.listBranches).mockResolvedValue({ all: [], current: "" });
  m(ipc.spawnSession).mockResolvedValue({
    id: "spawned",
    claude_session_id: "spawned",
    repo_path: "/repo/plain",
    name: null,
    created_at: 0,
  });
  m(ipc.currentBranches).mockResolvedValue({});
  m(ipc.fileStatuses).mockResolvedValue([]);
  m(ipc.githubWebUrls).mockResolvedValue({});
  m(ipc.diffLineCounts).mockResolvedValue({});
  m(ipc.branchAheadBehind).mockResolvedValue({});
  // `init()`'s fire-and-forget probes (#352 leaves them exactly where they were):
  // no agent installed → onboarding no-ops; folders exist; usage unavailable.
  m(ipc.agentInfo).mockResolvedValue({
    id: "claude",
    display_name: "Claude Code",
    binary_name: "claude",
    install_hint: "",
    supports_resume: true,
    supports_auto_name: true,
    version: null,
  });
  m(ipc.dirExists).mockResolvedValue(true);
  m(ipc.installKind).mockResolvedValue("bundle");
  // The task-430 boot seed: the Rust engine's cached usage + machine state.
  m(ipc.autoContinueSnapshot).mockResolvedValue({
    usage: null,
    autoContinue: { armed: false, resetsAtMs: null, sessionIds: [] },
  });
}

beforeEach(() => {
  // refresh() schedules a 4s reconnect backstop timer (#30) — fake timers keep it
  // from dangling past the test; promises (the awaited mocks) still resolve.
  vi.useFakeTimers();
  vi.clearAllMocks();
  primeIpc();
  // Reset the slices the boot payload owns (the store is a module singleton shared
  // across the tests in this file).
  useStore.setState({
    overviewPanels: {},
    overviewOrder: {},
    booted: false,
    platform: "",
    windowsBuild: 0,
    sessions: [],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("refresh() — legacy open_files no longer resurrects items (#110)", () => {
  it("loads only persisted panels; a file lingering in open_files is NOT re-added", async () => {
    const persisted: OverviewPanel[] = [{ id: "p1", kind: "diff" }];
    m(ipc.bootState).mockResolvedValue(
      makeBootState({
        overview_panels: { "/repo/a": persisted },
        open_files: {
          "/repo/a": ["CLAUDE.md"], // the stuck legacy entry
          "/repo/b": ["X.md"],
        },
      }),
    );

    await useStore.getState().refresh();

    const panels = useStore.getState().overviewPanels;
    // The persisted diff panel loads…
    expect(panels["/repo/a"]?.map((p) => p.kind)).toEqual(["diff"]);
    // …but the legacy file is NOT resurrected as a markdown panel.
    expect(panels["/repo/a"]?.some((p) => p.kind === "markdown")).toBe(false);
    // …and a repo present only in open_files gets no panels at all.
    expect(panels["/repo/b"]).toBeUndefined();
  });

  it("empties every legacy open_files entry once on boot (main window)", async () => {
    m(ipc.bootState).mockResolvedValue(
      makeBootState({
        open_files: {
          "/repo/a": ["CLAUDE.md"],
          "/repo/b": ["X.md"],
        },
      }),
    );

    await useStore.getState().refresh();

    expect(ipc.setOpenFiles).toHaveBeenCalledWith("/repo/a", []);
    expect(ipc.setOpenFiles).toHaveBeenCalledWith("/repo/b", []);
    expect(m(ipc.setOpenFiles).mock.calls).toHaveLength(2);
  });

  it("does not call setOpenFiles when there is nothing legacy to clear", async () => {
    m(ipc.bootState).mockResolvedValue(makeBootState({ open_files: {} }));
    await useStore.getState().refresh();
    expect(ipc.setOpenFiles).not.toHaveBeenCalled();
  });
});

describe("refresh() — seeds the 'has been active' flag (#112)", () => {
  it("seeds sessionActive from each persisted record's has_been_active", async () => {
    m(ipc.bootState).mockResolvedValue(
      makeBootState({
        sessions: [
          // Was active in a previous run → seeded so the dot is yellow right on boot.
          {
            id: "s1",
            claude_session_id: "s1",
            repo_path: "/repo/a",
            name: null,
            created_at: 0,
            has_been_active: true,
          },
          // Explicitly never active → stays gray (no seed).
          {
            id: "s2",
            claude_session_id: "s2",
            repo_path: "/repo/b",
            name: null,
            created_at: 0,
            has_been_active: false,
          },
          // Older record without the field → defaults to not-seeded.
          {
            id: "s3",
            claude_session_id: "s3",
            repo_path: "/repo/c",
            name: null,
            created_at: 0,
          },
        ],
      }),
    );

    await useStore.getState().refresh();

    const active = useStore.getState().sessionActive;
    expect(active.s1).toBe(true);
    expect(active.s2).toBeUndefined();
    expect(active.s3).toBeUndefined();
  });
});

describe("boot is ONE batched round-trip (#352)", () => {
  it("init() issues only `boot_state` + the 7 subscribe waves — no per-slice reads", async () => {
    await useStore.getState().init();

    // The one data round-trip…
    expect(m(ipc.bootState).mock.calls).toHaveLength(1);
    // …and the 27 `listen` registrations, batched into their 7 helpers.
    expect(ipc.subscribeSessionEvents).toHaveBeenCalledTimes(1);
    expect(ipc.subscribeCanvasEvents).toHaveBeenCalledTimes(1);
    expect(ipc.subscribeScheduleEvents).toHaveBeenCalledTimes(1);
    expect(ipc.subscribeRecurringEvents).toHaveBeenCalledTimes(1);
    expect(ipc.subscribeStateSyncEvents).toHaveBeenCalledTimes(1);
    expect(ipc.subscribeUsageEvents).toHaveBeenCalledTimes(1);
    expect(ipc.subscribeContainerEvents).toHaveBeenCalledTimes(1);
    // …plus the one task-430 boot seed of the usage/auto-continue mirrors.
    expect(ipc.autoContinueSnapshot).toHaveBeenCalledTimes(1);
    // None of the individual boot reads it replaces are called any more (they all
    // still exist — other call sites use them — but the boot no longer waterfalls).
    for (const fn of [
      ipc.listSessions,
      ipc.listRecents,
      ipc.listRepoColors,
      ipc.listOverviewPanels,
      ipc.listOverviewOrder,
      ipc.listOpenFiles,
      ipc.getCanvasLayout,
      ipc.getCanvases,
      ipc.getSettings,
      ipc.getSidebarWidth,
      ipc.getCanvasTemplates,
      ipc.getSidebarCollapsed,
      ipc.getRepoOrder,
      ipc.getDiffSeen,
      ipc.listSchedules,
      ipc.listRecurrings,
      ipc.appVersion,
      ipc.getLastVersion,
      ipc.listCanvasWindows,
      ipc.platform,
      ipc.windowsBuild,
    ]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it("lands `platform` / `windowsBuild` no later than `sessions` (#346)", async () => {
    m(ipc.bootState).mockResolvedValue(
      makeBootState({
        platform: "linux",
        windows_build: 22631,
        sessions: [
          {
            id: "s1",
            claude_session_id: "s1",
            repo_path: "/repo/a",
            name: null,
            created_at: 0,
          },
        ],
      }),
    );

    // The terminal pool reads `platform` / `windowsBuild` at host-creation time, and
    // mounting `sessions` is what creates the hosts — so the very update that makes
    // `sessions` non-empty must already carry both.
    let seen: { platform: string; windowsBuild: number } | null = null;
    const unsub = useStore.subscribe((s) => {
      if (!seen && s.sessions.length > 0) {
        seen = { platform: s.platform, windowsBuild: s.windowsBuild };
      }
    });

    await useStore.getState().refresh();
    unsub();

    expect(seen).toEqual({ platform: "linux", windowsBuild: 22631 });
    expect(useStore.getState().platform).toBe("linux");
  });

  it("applies the whole payload — canvases, settings, sidebar, order, schedules", async () => {
    m(ipc.bootState).mockResolvedValue(
      makeBootState({
        recents: ["/repo/a"],
        repo_colors: { "/repo/a": "#fab387" },
        canvases: {
          canvases: [
            { id: "c1", name: "One", layout: null },
            { id: "c2", name: "Two", layout: null },
          ],
          activeId: "c2",
        },
        canvas_templates: [{ id: "t1", name: "T", layout: null }],
        sidebar_width: 300,
        sidebar_collapsed: true,
        repo_order: ["/repo/a"],
        diff_seen: { "/repo/a": { "src/x.ts": "d1" } },
      }),
    );

    await useStore.getState().refresh();

    const s = useStore.getState();
    expect(s.recents).toEqual(["/repo/a"]);
    expect(s.repoColors).toEqual({ "/repo/a": "#fab387" });
    expect(s.canvases.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(s.activeCanvasId).toBe("c2");
    expect(s.canvasTemplates.map((t) => t.id)).toEqual(["t1"]);
    expect(s.sidebarWidth).toBe(300);
    expect(s.sidebarCollapsed).toBe(true);
    expect(s.folderOrder).toEqual(["/repo/a"]);
    expect(s.diffSeen).toEqual({ "/repo/a": { "src/x.ts": "d1" } });
    expect(s.booted).toBe(true);
    // The persisted tabs are used as-is — no migration write.
    expect(ipc.setCanvases).not.toHaveBeenCalled();
  });

  it("respawns each persisted terminal panel's shell (#72)", async () => {
    m(ipc.bootState).mockResolvedValue(
      makeBootState({
        overview_panels: {
          "/repo/a": [
            { id: "t1", kind: "terminal" },
            { id: "p1", kind: "diff" },
          ],
        },
      }),
    );

    await useStore.getState().refresh();

    expect(ipc.spawnTerminal).toHaveBeenCalledWith("/repo/a", "t1");
    expect(m(ipc.spawnTerminal).mock.calls).toHaveLength(1);
  });

  it("records the running version and toasts a self-update — with no extra reads (#190)", async () => {
    m(ipc.bootState).mockResolvedValue(
      makeBootState({ last_version: "1.0.0", app_version: "1.1.0" }),
    );

    await useStore.getState().refresh();

    expect(ipc.setLastVersion).toHaveBeenCalledWith("1.1.0");
    expect(
      useStore.getState().toasts.some((t) => t.message.includes("1.1.0")),
    ).toBe(true);
    // Both versions rode in the boot payload — no `app_version` / `get_last_version`.
    expect(ipc.appVersion).not.toHaveBeenCalled();
    expect(ipc.getLastVersion).not.toHaveBeenCalled();
  });

  it("flips `booted` even when the boot command fails (outside Tauri)", async () => {
    m(ipc.bootState).mockRejectedValue(new Error("no backend"));

    await useStore.getState().refresh();

    const s = useStore.getState();
    expect(s.booted).toBe(true);
    // …and nothing else was clobbered — the defaults stand.
    expect(s.sessions).toHaveLength(0);
    expect(s.platform).toBe("");
  });
});

describe("forkSession (#126)", () => {
  it("adds and selects the forked session (carrying forkedFrom)", async () => {
    useStore.setState({ sessions: [], selectedId: null, view: "overview" });
    const forked: SessionRecord = {
      id: "fork-1",
      claude_session_id: "fork-1",
      repo_path: "/repo/x",
      name: null,
      created_at: 0,
      forked_from: "src-1",
    };
    m(ipc.forkSession).mockResolvedValue(forked);

    const ok = await useStore.getState().forkSession("src-1");

    expect(ok).toBe(true);
    expect(m(ipc.forkSession)).toHaveBeenCalledWith("src-1");
    const s = useStore.getState();
    expect(s.sessions.map((x) => x.id)).toContain("fork-1");
    expect(s.selectedId).toBe("fork-1");
    expect(s.sessions.find((x) => x.id === "fork-1")?.forkedFrom).toBe("src-1");
  });

  it("returns false and adds nothing when the fork spawn fails", async () => {
    useStore.setState({ sessions: [], selectedId: null, view: "overview" });
    m(ipc.forkSession).mockRejectedValue(new Error("boom"));

    const ok = await useStore.getState().forkSession("src-1");

    expect(ok).toBe(false);
    expect(useStore.getState().sessions).toHaveLength(0);
  });
});

describe("startRepoSession (#127/#263)", () => {
  it("opens the modal instantly at the branch step — no pre-open list_branches, no spawn", () => {
    useStore.setState({
      newSessionOpen: false,
      newSessionRepo: null,
      newSessionInitialBranches: null,
      newSessionAtBranch: false,
      scheduleMode: false,
    });

    // #263: synchronous open — the modal renders at once and loads branches itself.
    useStore.getState().startRepoSession("/repo/g");

    const s = useStore.getState();
    expect(s.newSessionOpen).toBe(true);
    expect(s.newSessionRepo).toBe("/repo/g");
    // No preloaded branches: the modal loads them asynchronously (loading affordance).
    expect(s.newSessionInitialBranches).toBeNull();
    // The branch-step flag tells the modal to open straight at the branch step.
    expect(s.newSessionAtBranch).toBe(true);
    expect(s.scheduleMode).toBe(false);
    // The slow pre-open round-trip is gone, and nothing is spawned synchronously.
    expect(ipc.listBranches).not.toHaveBeenCalled();
    expect(ipc.spawnSession).not.toHaveBeenCalled();
  });

  it("clears the branch-step flag when the folder-step open (⌘N) is used", () => {
    useStore.setState({ newSessionAtBranch: true });
    useStore.getState().openNewSession();
    expect(useStore.getState().newSessionAtBranch).toBe(false);
  });

  it("clears the branch-step flag on close", () => {
    useStore.getState().startRepoSession("/repo/g");
    expect(useStore.getState().newSessionAtBranch).toBe(true);
    useStore.getState().closeNewSession();
    expect(useStore.getState().newSessionAtBranch).toBe(false);
  });
});

describe("branch labels refresh on busy→idle (#212/#359)", () => {
  it("re-reads the SETTLING session's folder after the debounce, updating a (worktree) label", async () => {
    // A worktree folder + its parent live in recents. The settling agent runs in the
    // worktree, so the #359 volley is scoped to **its** folder only — the #212 contract
    // ("an in-terminal `git checkout` updates that folder's label") is about exactly that
    // folder. Label starts stale.
    useStore.setState({
      sessions: [
        {
          id: "wt1",
          claudeSessionId: "wt1",
          repoPath: "/repo/a-wt",
          name: null,
          createdAt: 0,
          worktreeParent: "/repo/a",
        },
      ],
      recents: ["/repo/a-wt", "/repo/a"],
      branches: { "/repo/a-wt": "old-branch", "/repo/a": "main" },
      sessionBusy: { wt1: true },
      fileTreeMounts: {},
    });
    // After the in-terminal checkout, current_branches reports the new branch.
    m(ipc.currentBranches).mockResolvedValue({ "/repo/a-wt": "new-branch" });

    // Busy→idle settle schedules the debounced refresh (not fired immediately).
    useStore.getState().setBusy("wt1", false);
    expect(ipc.currentBranches).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(600);

    // Scoped to the settling session's folder — not every sidebar repo.
    expect(ipc.currentBranches).toHaveBeenCalledWith(["/repo/a-wt"]);
    expect(useStore.getState().branches["/repo/a-wt"]).toBe("new-branch");
    // The other folder's label is untouched by the scoped read.
    expect(useStore.getState().branches["/repo/a"]).toBe("main");
    // `file_statuses` is read only for a repo with an open FileTree (#359) — none here.
    expect(ipc.fileStatuses).not.toHaveBeenCalled();
  });

  it("falls back to an unscoped volley for an unknown session id (#359, fail-safe)", async () => {
    useStore.setState({
      sessions: [],
      recents: ["/repo/a", "/repo/b"],
      branches: {},
      sessionBusy: { ghost: true },
    });
    m(ipc.currentBranches).mockResolvedValue({});

    useStore.getState().setBusy("ghost", false);
    await vi.advanceTimersByTimeAsync(600);

    // No session record for the id → read every sidebar folder rather than miss one.
    expect(ipc.currentBranches).toHaveBeenCalledWith(["/repo/a", "/repo/b"]);
  });
});
