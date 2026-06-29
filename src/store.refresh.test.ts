import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// #110: exercise refresh()'s legacy `open_files` handling against a fully mocked
// IPC layer. This file owns its own ./ipc mock; Vitest isolates module mocks per
// file, so store.test.ts — which relies on the real (host-less, rejecting) ipc —
// is unaffected.
vi.mock("./ipc", () => ({
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
  forkSession: vi.fn(),
  listBranches: vi.fn(),
  spawnSession: vi.fn(),
  currentBranches: vi.fn(),
  fileStatuses: vi.fn(),
}));

import * as ipc from "./ipc";
import { useStore } from "./store";
import type { OverviewPanel, SessionRecord } from "./types";

const m = vi.mocked;

/** Default every refresh() IPC call to a benign resolved value; each test
 * overrides listOverviewPanels / listOpenFiles to set up its scenario. */
function primeIpc(): void {
  m(ipc.listSessions).mockResolvedValue([]);
  m(ipc.listRecents).mockResolvedValue([]);
  m(ipc.listRepoColors).mockResolvedValue({});
  m(ipc.listOverviewPanels).mockResolvedValue({});
  m(ipc.listOverviewOrder).mockResolvedValue({});
  m(ipc.listOpenFiles).mockResolvedValue({});
  m(ipc.setOpenFiles).mockResolvedValue(undefined);
  m(ipc.setOverviewPanels).mockResolvedValue(undefined);
  m(ipc.getCanvasLayout).mockResolvedValue(null);
  // A valid canvas state skips the migration branch (no crypto/randomUUID needed).
  m(ipc.getCanvases).mockResolvedValue({
    canvases: [{ id: "c1", name: "Canvas 1", layout: null }],
    activeId: "c1",
  });
  m(ipc.setCanvases).mockResolvedValue(undefined);
  m(ipc.getSettings).mockResolvedValue(null);
  m(ipc.getSidebarWidth).mockResolvedValue(null);
  m(ipc.getSidebarCollapsed).mockResolvedValue(null);
  m(ipc.getRepoOrder).mockResolvedValue([]);
  m(ipc.getDiffSeen).mockResolvedValue(null);
  m(ipc.getCanvasTemplates).mockResolvedValue(null);
  m(ipc.setCanvasTemplates).mockResolvedValue(undefined);
  m(ipc.spawnTerminal).mockResolvedValue(undefined);
  m(ipc.listSchedules).mockResolvedValue([]);
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
}

beforeEach(() => {
  // refresh() schedules a 4s reconnect backstop timer (#30) — fake timers keep it
  // from dangling past the test; promises (the awaited mocks) still resolve.
  vi.useFakeTimers();
  vi.clearAllMocks();
  primeIpc();
  useStore.setState({ overviewPanels: {}, overviewOrder: {} });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("refresh() — legacy open_files no longer resurrects items (#110)", () => {
  it("loads only persisted panels; a file lingering in open_files is NOT re-added", async () => {
    const persisted: OverviewPanel[] = [{ id: "p1", kind: "diff" }];
    m(ipc.listOverviewPanels).mockResolvedValue({ "/repo/a": persisted });
    m(ipc.listOpenFiles).mockResolvedValue({
      "/repo/a": ["CLAUDE.md"], // the stuck legacy entry
      "/repo/b": ["X.md"],
    });

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
    m(ipc.listOpenFiles).mockResolvedValue({
      "/repo/a": ["CLAUDE.md"],
      "/repo/b": ["X.md"],
    });

    await useStore.getState().refresh();

    expect(ipc.setOpenFiles).toHaveBeenCalledWith("/repo/a", []);
    expect(ipc.setOpenFiles).toHaveBeenCalledWith("/repo/b", []);
    expect(m(ipc.setOpenFiles).mock.calls).toHaveLength(2);
  });

  it("does not call setOpenFiles when there is nothing legacy to clear", async () => {
    m(ipc.listOpenFiles).mockResolvedValue({});
    await useStore.getState().refresh();
    expect(ipc.setOpenFiles).not.toHaveBeenCalled();
  });
});

describe("refresh() — seeds the 'has been active' flag (#112)", () => {
  it("seeds sessionActive from each persisted record's has_been_active", async () => {
    m(ipc.listSessions).mockResolvedValue([
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
    ]);

    await useStore.getState().refresh();

    const active = useStore.getState().sessionActive;
    expect(active.s1).toBe(true);
    expect(active.s2).toBeUndefined();
    expect(active.s3).toBeUndefined();
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

describe("branch labels refresh on busy→idle (#212)", () => {
  it("re-reads branches after the debounce, updating a (worktree) label", async () => {
    // A worktree folder + its parent live in recents, so refreshBranches passes both
    // to current_branches (it already includes worktree paths). Label starts stale.
    useStore.setState({
      recents: ["/repo/a-wt", "/repo/a"],
      branches: { "/repo/a-wt": "old-branch", "/repo/a": "main" },
      sessionBusy: { wt1: true },
    });
    // After the in-terminal checkout, current_branches reports the new branch.
    m(ipc.currentBranches).mockResolvedValue({
      "/repo/a-wt": "new-branch",
      "/repo/a": "main",
    });

    // Busy→idle settle schedules the debounced refresh (not fired immediately).
    useStore.getState().setBusy("wt1", false);
    expect(ipc.currentBranches).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(600);

    expect(ipc.currentBranches).toHaveBeenCalled();
    expect(useStore.getState().branches["/repo/a-wt"]).toBe("new-branch");
  });
});
