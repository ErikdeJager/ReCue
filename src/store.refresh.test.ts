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
  // Primary-window election (task 433): the snapshot + broadcast subscription.
  primaryWindow: vi.fn(),
  subscribePrimaryEvents: vi.fn(),
  // Same-file soft claims (task 435): the snapshot + broadcast subscription.
  fileClaims: vi.fn(),
  subscribeFileClaimEvents: vi.fn(),
  // The #369 folder-color auto-assign (primary-gated since task 433) persists
  // through this — a benign mock keeps recents-driven tests quiet.
  setRepoColor: vi.fn(),
}));

import * as ipc from "./ipc";
import { useStore } from "./store";
import type { BootState, OverviewPanel, SessionRecord } from "./types";

const m = vi.mocked;

/** The `schedule://fired` / `schedule://error` handler object `init()` registers
 * (task 433 tests drive `onFired` under both primary states). Captured once — the
 * store subscribes exactly once per module lifetime (the `eventsSubscribed` flag),
 * so only the FIRST `init()` in this file ever registers it; the mock
 * implementation (re-primed each test) stashes it here where `clearAllMocks`
 * can't reach. */
let scheduleHandlers: ipc.ScheduleEventHandlers | null = null;

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
    ...over,
  };
}

/** Default every boot IPC call to a benign resolved value; each test overrides the
 * boot payload (or a specific setter) to set up its scenario. */
function primeIpc(): void {
  m(ipc.bootState).mockResolvedValue(makeBootState());
  m(ipc.subscribeSessionEvents).mockResolvedValue(() => {});
  m(ipc.subscribeCanvasEvents).mockResolvedValue(() => {});
  m(ipc.subscribeScheduleEvents).mockImplementation(async (handlers) => {
    scheduleHandlers = handlers;
    return () => {};
  });
  m(ipc.subscribeRecurringEvents).mockResolvedValue(() => {});
  m(ipc.subscribeStateSyncEvents).mockResolvedValue(() => {});
  m(ipc.subscribeUsageEvents).mockResolvedValue(() => {});
  m(ipc.subscribeContainerEvents).mockResolvedValue(() => {});
  m(ipc.subscribePrimaryEvents).mockResolvedValue(() => {});
  // The task-433 boot snapshot: this window ("main" in the test env) is primary.
  m(ipc.primaryWindow).mockResolvedValue("main");
  // The task-435 boot snapshot: no files claimed.
  m(ipc.subscribeFileClaimEvents).mockResolvedValue(() => {});
  m(ipc.fileClaims).mockResolvedValue([]);
  m(ipc.setRepoColor).mockResolvedValue(undefined);
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
  // across the tests in this file). `primaryWindow` back to its pre-sync default
  // ("main" assumes primary) — task-433 tests flip it per scenario.
  useStore.setState({
    overviewPanels: {},
    overviewOrder: {},
    booted: false,
    platform: "",
    windowsBuild: 0,
    sessions: [],
    primaryWindow: "main",
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
  it("init() issues only `boot_state` + the 8 subscribe waves — no per-slice reads", async () => {
    await useStore.getState().init();

    // The one data round-trip…
    expect(m(ipc.bootState).mock.calls).toHaveLength(1);
    // …and the 30 `listen` registrations, batched into their 8 helpers.
    expect(ipc.subscribeSessionEvents).toHaveBeenCalledTimes(1);
    expect(ipc.subscribeCanvasEvents).toHaveBeenCalledTimes(1);
    expect(ipc.subscribeScheduleEvents).toHaveBeenCalledTimes(1);
    expect(ipc.subscribeRecurringEvents).toHaveBeenCalledTimes(1);
    expect(ipc.subscribeStateSyncEvents).toHaveBeenCalledTimes(1);
    expect(ipc.subscribeUsageEvents).toHaveBeenCalledTimes(1);
    expect(ipc.subscribeContainerEvents).toHaveBeenCalledTimes(1);
    expect(ipc.subscribePrimaryEvents).toHaveBeenCalledTimes(1);
    // …plus the one task-430 boot seed of the usage/auto-continue mirrors and the
    // one task-433 primary-window snapshot (resolved before the boot apply).
    expect(ipc.autoContinueSnapshot).toHaveBeenCalledTimes(1);
    expect(ipc.primaryWindow).toHaveBeenCalledTimes(1);
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

  it("does not respawn terminal panels at boot — Rust owns it (task 432)", async () => {
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

    // The Rust boot sequence (`boot::respawn_shell_terminals`) respawns persisted
    // terminal panels next to the agent resume pass — the frontend never spawns at
    // boot; it just renders the panels, which still land in the store.
    expect(ipc.spawnTerminal).not.toHaveBeenCalled();
    expect(useStore.getState().overviewPanels["/repo/a"]).toEqual([
      { id: "t1", kind: "terminal" },
      { id: "p1", kind: "diff" },
    ]);
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

describe("a non-primary window skips the boot-time once-per-app effects (task 433)", () => {
  it("runs zero persists/toasts, but the payload still lands", async () => {
    useStore.setState({ primaryWindow: null, toasts: [] });
    m(ipc.bootState).mockResolvedValue(
      makeBootState({
        // Every once-per-app trigger at once: a legacy open_files entry, an
        // older last_version (the updated-toast + setLastVersion), and a null
        // canvases blob (the #58 migration persist).
        open_files: { "/repo/a": ["CLAUDE.md"] },
        last_version: "1.0.0",
        app_version: "1.1.0",
        canvases: null,
        canvas_layout: null,
        overview_panels: { "/repo/a": [{ id: "p1", kind: "diff" }] },
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

    await useStore.getState().refresh();

    // None of the once-per-app effects ran…
    expect(ipc.setOpenFiles).not.toHaveBeenCalled();
    expect(ipc.setLastVersion).not.toHaveBeenCalled();
    expect(ipc.setCanvases).not.toHaveBeenCalled();
    expect(
      useStore.getState().toasts.some((t) => t.message.includes("Updated to")),
    ).toBe(false);
    // …but the payload still lands (every-window state).
    const s = useStore.getState();
    expect(s.overviewPanels["/repo/a"]).toEqual([{ id: "p1", kind: "diff" }]);
    expect(s.sessions.map((x) => x.id)).toEqual(["s1"]);
    expect(s.booted).toBe(true);
  });
});

describe("init resolves the primary before the boot apply (task 433)", () => {
  it("gates the boot effects on the snapshot value, not the pre-load default", async () => {
    // The backend says another window is primary — even though this window's
    // pre-load default is "main" (assume primary), the snapshot resolves BEFORE
    // the boot payload is applied, so the once-per-app effects are skipped.
    m(ipc.primaryWindow).mockResolvedValue("someone-else");
    m(ipc.bootState).mockResolvedValue(
      makeBootState({ open_files: { "/repo/a": ["CLAUDE.md"] } }),
    );

    await useStore.getState().init();

    expect(useStore.getState().primaryWindow).toBe("someone-else");
    expect(ipc.setOpenFiles).not.toHaveBeenCalled();

    // Elected primary instead → the same boot payload runs the effects.
    m(ipc.primaryWindow).mockResolvedValue("main");
    await useStore.getState().init();

    expect(useStore.getState().primaryWindow).toBe("main");
    expect(ipc.setOpenFiles).toHaveBeenCalledWith("/repo/a", []);
  });
});

describe("schedule://fired runs the transition only in the primary (task 433)", () => {
  it("non-primary: upserts the session + drops the schedule locally — no toast, no persist", async () => {
    // The handler object was captured from the file's one real subscribe wave
    // (the store subscribes exactly once per module lifetime).
    if (!scheduleHandlers) await useStore.getState().init();
    expect(scheduleHandlers).not.toBeNull();

    useStore.setState({
      primaryWindow: null,
      toasts: [],
      recents: [],
      sessions: [],
      schedules: [{ id: "sch1", cwd: "/repo/s", fire_at: 0, created_at: 0 }],
    });

    scheduleHandlers!.onFired({
      id: "sch1",
      session: {
        id: "live1",
        claude_session_id: "live1",
        repo_path: "/repo/s",
        name: null,
        created_at: 0,
      },
    });

    const s = useStore.getState();
    // The every-window parts still happen…
    expect(s.sessions.map((x) => x.id)).toContain("live1");
    expect(s.schedules).toHaveLength(0);
    // …but the primary-only transition does not.
    expect(s.toasts).toHaveLength(0);
    expect(s.recents).toEqual([]);
    expect(ipc.setCanvases).not.toHaveBeenCalled();
  });

  it("primary: additionally prepends recents and toasts", async () => {
    if (!scheduleHandlers) await useStore.getState().init();
    expect(scheduleHandlers).not.toBeNull();

    useStore.setState({
      primaryWindow: "main",
      toasts: [],
      recents: [],
      sessions: [],
      schedules: [{ id: "sch2", cwd: "/repo/s2", fire_at: 0, created_at: 0 }],
    });

    scheduleHandlers!.onFired({
      id: "sch2",
      session: {
        id: "live2",
        claude_session_id: "live2",
        repo_path: "/repo/s2",
        name: null,
        created_at: 0,
      },
    });

    const s = useStore.getState();
    expect(s.sessions.map((x) => x.id)).toContain("live2");
    expect(s.schedules).toHaveLength(0);
    expect(s.recents[0]).toBe("/repo/s2");
    expect(
      s.toasts.some((t) => t.message.startsWith("Scheduled agent started")),
    ).toBe(true);
  });
});

describe("takeover arms the primary effects live (task 433)", () => {
  it("arms exactly once on a booted non-primary → primary transition", () => {
    const original = useStore.getState().checkForUpdate;
    const spy = vi.fn().mockResolvedValue(undefined);
    try {
      useStore.setState({
        booted: true,
        primaryWindow: "other",
        checkForUpdate: spy,
      });

      useStore.getState().applyPrimarySync("main");
      expect(useStore.getState().primaryWindow).toBe("main");
      expect(spy).toHaveBeenCalledTimes(1);

      // Equality guard: re-applying the same value never re-arms.
      useStore.getState().applyPrimarySync("main");
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      useStore.setState({ checkForUpdate: original });
    }
  });

  it("does not arm during boot — init/applyBootState own the boot-time effects", () => {
    const original = useStore.getState().checkForUpdate;
    const spy = vi.fn().mockResolvedValue(undefined);
    try {
      useStore.setState({
        booted: false,
        primaryWindow: "other",
        checkForUpdate: spy,
      });

      useStore.getState().applyPrimarySync("main");
      // The value still applies (the boot paths read it directly)…
      expect(useStore.getState().primaryWindow).toBe("main");
      // …but nothing is armed.
      expect(spy).not.toHaveBeenCalled();
    } finally {
      useStore.setState({ checkForUpdate: original });
    }
  });

  it("never arms when already primary (or on a demotion to null)", () => {
    const original = useStore.getState().checkForUpdate;
    const spy = vi.fn().mockResolvedValue(undefined);
    try {
      useStore.setState({
        booted: true,
        primaryWindow: "main",
        checkForUpdate: spy,
      });

      useStore.getState().applyPrimarySync("main"); // equality no-op
      expect(spy).not.toHaveBeenCalled();

      // A theoretical demotion (never happens today — the election is
      // monotonic) applies the value without arming anything.
      useStore.getState().applyPrimarySync(null);
      expect(useStore.getState().primaryWindow).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      useStore.setState({ checkForUpdate: original });
    }
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

describe("an app-* window's pre-sync primaryWindow default (task 434)", () => {
  it('is null for any non-"main" label — a secondary full window never assumes primary', () => {
    // The store's initial slice is `WINDOW_LABEL === "main" ? "main" : null`,
    // evaluated at module load — so the live store in this (main-labelled) test
    // env can only exercise the "main" branch. Pin the expression's contract for
    // the task-434 labels directly: an `app-<uuid>` full window boots with null
    // and waits for the `primary_window` snapshot that
    // `init` resolves before the boot apply, so it runs zero once-per-app effects
    // while an older full window lives.
    const defaultPrimaryFor = (label: string) =>
      label === "main" ? "main" : null;
    expect(defaultPrimaryFor("main")).toBe("main");
    expect(defaultPrimaryFor("app-1f2e")).toBeNull();
    expect(defaultPrimaryFor("canvas-c1")).toBeNull();
  });
});
