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
  spawnTerminal: vi.fn(),
  listSchedules: vi.fn(),
}));

import * as ipc from "./ipc";
import { useStore } from "./store";
import type { OverviewPanel } from "./types";

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
  m(ipc.spawnTerminal).mockResolvedValue(undefined);
  m(ipc.listSchedules).mockResolvedValue([]);
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
