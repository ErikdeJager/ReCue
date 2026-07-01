import { beforeEach, describe, expect, it, vi } from "vitest";

import { collectLeaves } from "./components/Canvas/canvasTree";
import {
  accentCompanions,
  adjacentId,
  adjacentSessionId,
  anchorAgentForPanel,
  contentForSelected,
  DEFAULT_SETTINGS,
  dedupeBranchLabels,
  isClaudeActive,
  isCleanExit,
  kanbanColumnColor,
  mergeRepoOrder,
  mergeSettings,
  moveResultMessage,
  overviewClusterKeys,
  ownedChildSessionIds,
  placeAfterAnchor,
  REPO_PALETTE,
  repoColor,
  repoOrder,
  useStore,
  versionIncreased,
  worktreeHasItems,
} from "./store";
import type {
  AgentInfo,
  CanvasContent,
  CanvasNode,
  OverviewPanel,
  ScheduledSession,
  SessionView,
} from "./types";
import * as ipc from "./ipc";
import { isMockUpdate } from "./updater";

function session(id: string): SessionView {
  return {
    id,
    claudeSessionId: id,
    repoPath: `/repo/${id}`,
    name: null,
    createdAt: 0,
  };
}

/** A session with explicit repo / createdAt / worktree parent for ordering tests. */
function ovSession(
  id: string,
  repoPath: string,
  createdAt: number,
  worktreeParent?: string,
): SessionView {
  return {
    id,
    claudeSessionId: id,
    repoPath,
    name: null,
    createdAt,
    ...(worktreeParent ? { worktreeParent } : {}),
  };
}

describe("accentCompanions (#107)", () => {
  it("derives --accent-dim as the accent at 0.14 alpha", () => {
    // Peach default = rgb(250, 179, 135).
    expect(accentCompanions("#fab387").dim).toBe("rgba(250, 179, 135, 0.14)");
  });

  it("uses a dark fg + a valid lighter hover for every (light pastel) palette color", () => {
    for (const hex of REPO_PALETTE) {
      const c = accentCompanions(hex);
      expect(c.fg).toBe("#11111b"); // all REPO_PALETTE swatches are light pastels
      expect(c.hover).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("uses a light fg on a dark accent", () => {
    expect(accentCompanions("#1e1e2e").fg).toBe("#ffffff");
  });

  it("falls back for an unparseable hex", () => {
    expect(accentCompanions("nope")).toEqual({
      hover: "nope",
      dim: "nope",
      fg: "#11111b",
    });
  });
});

beforeEach(() => {
  vi.useRealTimers();
  useStore.setState({
    sessions: [],
    selectedId: null,
    view: "overview",
    overviewRepoFilter: null,
    recents: [],
    branches: {},
    repoColors: {},
    overviewPanels: {},
    overviewOrder: {},
    canvases: [{ id: "canvas-1", name: "Canvas 1", layout: null }],
    activeCanvasId: "canvas-1",
    liftedLeaf: null,
    maximizedItem: null,
    canvasTemplates: [],
    sessionBusy: {},
    sessionActive: {},
    claudeMissing: false,
    toasts: [],
    newSessionOpen: false,
    newSessionRepo: null,
  });
});

describe("app store", () => {
  it("switches the view", () => {
    useStore.getState().setView("canvas");
    expect(useStore.getState().view).toBe("canvas");
  });

  it("selecting a session highlights it without changing the view (#22)", () => {
    expect(useStore.getState().view).toBe("overview");
    useStore.getState().select("abc");
    expect(useStore.getState().selectedId).toBe("abc");
    // Selection is decoupled from the view — it must not force Focus.
    expect(useStore.getState().view).toBe("overview");
  });

  it("toggles the sidebar collapsed flag (#168)", () => {
    // Defaults to expanded; the footer chevron / ⌘B toggle it.
    expect(useStore.getState().sidebarCollapsed).toBe(false);
    useStore.getState().toggleSidebarCollapsed();
    expect(useStore.getState().sidebarCollapsed).toBe(true);
    useStore.getState().setSidebarCollapsed(false);
    expect(useStore.getState().sidebarCollapsed).toBe(false);
    // A redundant set is a no-op (same value).
    useStore.getState().setSidebarCollapsed(false);
    expect(useStore.getState().sidebarCollapsed).toBe(false);
  });

  it("markConnected clears the boot reconnecting flag (#30)", () => {
    useStore.setState({ sessions: [{ ...session("s1"), reconnecting: true }] });
    useStore.getState().markConnected("s1");
    expect(useStore.getState().sessions[0]?.reconnecting).toBe(false);
  });

  it("markExited clears reconnecting and records the exit code", () => {
    useStore.setState({ sessions: [{ ...session("s1"), reconnecting: true }] });
    useStore.getState().markExited("s1", 1);
    expect(useStore.getState().sessions[0]?.reconnecting).toBe(false);
    expect(useStore.getState().sessions[0]?.exitedCode).toBe(1);
  });

  it("setBusy tracks and clears a session's working state (#42)", () => {
    useStore.getState().setBusy("s1", true);
    expect(useStore.getState().sessionBusy.s1).toBe(true);
    // Idle deletes the key rather than storing false.
    useStore.getState().setBusy("s1", false);
    expect(useStore.getState().sessionBusy.s1).toBeUndefined();
    // A redundant update keeps the same map reference (no needless re-render).
    useStore.getState().setBusy("s2", true);
    const ref = useStore.getState().sessionBusy;
    useStore.getState().setBusy("s2", true);
    expect(useStore.getState().sessionBusy).toBe(ref);
  });

  it("tracks 'has been active' for the third yellow/settled state (#112)", () => {
    // Fresh: never active → gray (no flag).
    expect(useStore.getState().sessionActive.s1).toBeUndefined();
    // First activity (busy) sets the flag → blue while working.
    useStore.getState().setBusy("s1", true);
    expect(useStore.getState().sessionBusy.s1).toBe(true);
    expect(useStore.getState().sessionActive.s1).toBe(true);
    // Going idle clears busy but KEEPS the active flag → yellow "settled".
    useStore.getState().setBusy("s1", false);
    expect(useStore.getState().sessionBusy.s1).toBeUndefined();
    expect(useStore.getState().sessionActive.s1).toBe(true);
    // Going busy again leaves yellow (blue) and the flag stays set.
    useStore.getState().setBusy("s1", true);
    expect(useStore.getState().sessionActive.s1).toBe(true);
    // Removing the session clears both per-session flags.
    useStore.setState({ sessions: [session("s1")] });
    useStore.getState().dropSession("s1");
    expect(useStore.getState().sessionActive.s1).toBeUndefined();
    expect(useStore.getState().sessionBusy.s1).toBeUndefined();
  });

  it("markExited clears a busy flag (an exited session isn't working) (#42)", () => {
    useStore.setState({ sessions: [session("s1")], sessionBusy: { s1: true } });
    useStore.getState().markExited("s1", 0);
    expect(useStore.getState().sessionBusy.s1).toBeUndefined();
  });

  it("re-reads branch labels on a busy→idle settle, debounced (#212)", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    // Replace refreshBranches so we observe the debounced call (the real one hits
    // the host-less ipc); restore via real timers + the beforeEach reset.
    useStore.setState({ refreshBranches: refresh });
    const setBusy = useStore.getState().setBusy;

    setBusy("s1", true); // idle→busy: no refresh
    expect(refresh).not.toHaveBeenCalled();
    setBusy("s1", false); // busy→idle: schedules a debounced refresh
    expect(refresh).not.toHaveBeenCalled(); // still debounced
    vi.advanceTimersByTime(600);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("coalesces a burst of busy→idle settles into one branch refresh (#212)", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    useStore.setState({ refreshBranches: refresh });
    const setBusy = useStore.getState().setBusy;

    setBusy("s1", true);
    setBusy("s2", true);
    setBusy("s1", false); // schedules
    vi.advanceTimersByTime(200); // within the window
    setBusy("s2", false); // resets the debounce
    vi.advanceTimersByTime(600);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("bumpFileTreeRefresh increments one repo's re-list counter (#253/#264)", () => {
    useStore.setState({ fileTreeRefresh: {}, fileTreeMounts: {} });
    useStore.getState().bumpFileTreeRefresh("/repo/a");
    expect(useStore.getState().fileTreeRefresh["/repo/a"]).toBe(1);
    useStore.getState().bumpFileTreeRefresh("/repo/a");
    expect(useStore.getState().fileTreeRefresh["/repo/a"]).toBe(2);
    // An untouched repo isn't created.
    expect(useStore.getState().fileTreeRefresh["/repo/b"]).toBeUndefined();
  });

  it("bumpFileTreeRefresh() bumps only repos with a mounted tree (#264)", () => {
    useStore.setState({
      fileTreeRefresh: {},
      fileTreeMounts: { "/repo/a": 1, "/repo/b": 2 },
    });
    useStore.getState().bumpFileTreeRefresh();
    expect(useStore.getState().fileTreeRefresh["/repo/a"]).toBe(1);
    expect(useStore.getState().fileTreeRefresh["/repo/b"]).toBe(1);
    // No mounted trees → no-op (no churn when nothing is open).
    useStore.setState({ fileTreeRefresh: {}, fileTreeMounts: {} });
    useStore.getState().bumpFileTreeRefresh();
    expect(useStore.getState().fileTreeRefresh).toEqual({});
  });

  it("register/unregisterFileTree ref-counts open trees (#264)", () => {
    useStore.setState({ fileTreeMounts: {} });
    const { registerFileTree, unregisterFileTree } = useStore.getState();
    registerFileTree("/repo/a");
    registerFileTree("/repo/a");
    expect(useStore.getState().fileTreeMounts["/repo/a"]).toBe(2);
    // One unmount leaves the other instance registered.
    unregisterFileTree("/repo/a");
    expect(useStore.getState().fileTreeMounts["/repo/a"]).toBe(1);
    // The last unmount drops the key entirely (not a lingering 0).
    unregisterFileTree("/repo/a");
    expect(useStore.getState().fileTreeMounts["/repo/a"]).toBeUndefined();
    expect("/repo/a" in useStore.getState().fileTreeMounts).toBe(false);
  });

  it("refreshOpenFileTrees re-lists + re-tints only mounted repos (#264)", () => {
    const statuses = vi.fn();
    useStore.setState({
      fileTreeRefresh: {},
      fileTreeMounts: { "/repo/a": 1, "/repo/b": 1 },
      refreshFileStatuses: statuses,
    });
    useStore.getState().refreshOpenFileTrees();
    // Re-list both open trees …
    expect(useStore.getState().fileTreeRefresh["/repo/a"]).toBe(1);
    expect(useStore.getState().fileTreeRefresh["/repo/b"]).toBe(1);
    // … and re-tint each (one scoped status read per open repo).
    expect(statuses).toHaveBeenCalledTimes(2);
    expect(statuses).toHaveBeenCalledWith("/repo/a");
    expect(statuses).toHaveBeenCalledWith("/repo/b");
  });

  it("refreshOpenFileTrees is a no-op when no tree is open (#264)", () => {
    const statuses = vi.fn();
    useStore.setState({
      fileTreeRefresh: {},
      fileTreeMounts: {},
      refreshFileStatuses: statuses,
    });
    useStore.getState().refreshOpenFileTrees();
    expect(statuses).not.toHaveBeenCalled();
    expect(useStore.getState().fileTreeRefresh).toEqual({});
  });

  it("also re-lists open trees on the busy→idle settle, debounced (#264)", () => {
    vi.useFakeTimers();
    const bump = vi.fn();
    useStore.setState({
      refreshBranches: vi.fn(),
      refreshFileStatuses: vi.fn(),
      bumpFileTreeRefresh: bump,
    });
    const setBusy = useStore.getState().setBusy;
    setBusy("s1", true); // idle→busy: no refresh
    expect(bump).not.toHaveBeenCalled();
    setBusy("s1", false); // busy→idle: schedules the debounced refresh
    expect(bump).not.toHaveBeenCalled(); // still debounced
    vi.advanceTimersByTime(600);
    expect(bump).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("setOverviewRepoFilter toggles, switches, and clears (#34)", () => {
    // Default mode is "all" (folder click).
    useStore.getState().setOverviewRepoFilter("/repo/x");
    expect(useStore.getState().overviewRepoFilter).toEqual({
      path: "/repo/x",
      mode: "all",
    });
    // clicking the active repo with the same mode clears it
    useStore.getState().setOverviewRepoFilter("/repo/x");
    expect(useStore.getState().overviewRepoFilter).toBeNull();
    // another repo sets it; null is "Show all"
    useStore.getState().setOverviewRepoFilter("/repo/y");
    expect(useStore.getState().overviewRepoFilter).toEqual({
      path: "/repo/y",
      mode: "all",
    });
    useStore.getState().setOverviewRepoFilter(null);
    expect(useStore.getState().overviewRepoFilter).toBeNull();
  });

  it("setOverviewRepoFilter switches mode on the same path, and toggles per (path, mode) (#247)", () => {
    // "all" then "own" on the same path → switches (does not clear)
    useStore.getState().setOverviewRepoFilter("/repo/x", "all");
    expect(useStore.getState().overviewRepoFilter).toEqual({
      path: "/repo/x",
      mode: "all",
    });
    useStore.getState().setOverviewRepoFilter("/repo/x", "own");
    expect(useStore.getState().overviewRepoFilter).toEqual({
      path: "/repo/x",
      mode: "own",
    });
    // re-selecting the same path AND mode clears it
    useStore.getState().setOverviewRepoFilter("/repo/x", "own");
    expect(useStore.getState().overviewRepoFilter).toBeNull();
  });

  it("forgetRepo drops the repo's sessions + recent, selection, and filter (#31/#34)", async () => {
    useStore.setState({
      sessions: [
        { ...session("a"), repoPath: "/repo/x" },
        { ...session("b"), repoPath: "/repo/y" },
      ],
      recents: ["/repo/x", "/repo/y"],
      selectedId: "a",
      view: "canvas",
      overviewRepoFilter: { path: "/repo/x", mode: "all" },
    });
    // ipc calls reject without a Tauri host and are caught; the state update runs.
    await useStore.getState().forgetRepo("/repo/x");
    expect(useStore.getState().sessions.map((s) => s.id)).toEqual(["b"]);
    expect(useStore.getState().recents).toEqual(["/repo/y"]);
    expect(useStore.getState().selectedId).toBeNull();
    expect(useStore.getState().view).toBe("overview");
    expect(useStore.getState().overviewRepoFilter).toBeNull();
  });

  it("upserts (de-duplicating by id) and drops sessions, fixing selection", () => {
    useStore.getState().upsertSession(session("s1"));
    useStore.getState().upsertSession(session("s1"));
    useStore.getState().select("s1");
    useStore.getState().setView("canvas"); // simulate viewing s1 in a canvas
    expect(useStore.getState().sessions).toHaveLength(1);

    useStore.getState().dropSession("s1");
    expect(useStore.getState().sessions).toHaveLength(0);
    expect(useStore.getState().selectedId).toBeNull();
    // Removing the selected session returns to Overview (#75).
    expect(useStore.getState().view).toBe("overview");
  });

  it("marks a session as exited, then running again (restart)", () => {
    useStore.getState().upsertSession(session("s1"));
    useStore.getState().markExited("s1", 0);
    expect(useStore.getState().sessions[0]?.exitedCode).toBe(0);
    useStore.getState().markRunning("s1");
    expect(useStore.getState().sessions[0]?.exitedCode).toBeUndefined();
  });

  it("forgetExitedSession drops a clean-exited agent + toasts 'Agent exited' (#63)", async () => {
    useStore.setState({
      sessions: [session("s1"), session("s2")],
      selectedId: "s1",
      view: "canvas",
    });
    // ipc.killSession rejects without a Tauri host and is caught; the local
    // forget still runs (kill + forget locally regardless).
    await useStore.getState().forgetExitedSession("s1");
    expect(useStore.getState().sessions.map((s) => s.id)).toEqual(["s2"]);
    // The selected agent vanishing returns to Overview (#75).
    expect(useStore.getState().selectedId).toBeNull();
    expect(useStore.getState().view).toBe("overview");
    expect(useStore.getState().toasts.map((t) => t.message)).toContain(
      "Agent exited",
    );
  });

  it("restartSession resolves false (and toasts an error) when resume fails (#63)", async () => {
    useStore.setState({ sessions: [{ ...session("s1"), exitedCode: 1 }] });
    // No Tauri host → ipc.resumeSession rejects → the action reports failure so
    // the caller skips the terminal reset; the session stays exited.
    const ok = await useStore.getState().restartSession("s1");
    expect(ok).toBe(false);
    expect(useStore.getState().sessions[0]?.exitedCode).toBe(1);
    expect(useStore.getState().toasts.at(-1)?.tone).toBe("error");
  });

  it("sets the claude-missing flag", () => {
    useStore.getState().setClaudeMissing(true);
    expect(useStore.getState().claudeMissing).toBe(true);
  });

  it("pushes a toast that auto-dismisses", () => {
    vi.useFakeTimers();
    const id = useStore.getState().pushToast("hello");
    expect(useStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(4000);
    expect(useStore.getState().toasts.find((t) => t.id === id)).toBeUndefined();
  });

  it("dismisses a toast manually", () => {
    const id = useStore.getState().pushToast("hello");
    useStore.getState().dismissToast(id);
    expect(useStore.getState().toasts).toHaveLength(0);
  });

  it("opens and closes the new-session modal with an optional repo", () => {
    useStore.getState().openNewSession("/repo/a");
    expect(useStore.getState().newSessionOpen).toBe(true);
    expect(useStore.getState().newSessionRepo).toBe("/repo/a");
    useStore.getState().closeNewSession();
    expect(useStore.getState().newSessionOpen).toBe(false);
    expect(useStore.getState().newSessionRepo).toBeNull();
  });

  it("opens Settings at an optional deep-link section (#191)", () => {
    // The updater indicator deep-links to the Updates pane.
    useStore.getState().setSettingsOpen(true, "updates");
    expect(useStore.getState().settingsOpen).toBe(true);
    expect(useStore.getState().settingsSection).toBe("updates");
    // A plain gear open resets to the default (no section).
    useStore.getState().setSettingsOpen(true);
    expect(useStore.getState().settingsSection).toBeNull();
    // Closing clears the deep-link target.
    useStore.getState().setSettingsOpen(true, "updates");
    useStore.getState().setSettingsOpen(false);
    expect(useStore.getState().settingsOpen).toBe(false);
    expect(useStore.getState().settingsSection).toBeNull();
  });

  it("drives the updater confirm dialog (#190)", () => {
    useStore
      .getState()
      .setUpdateState({ status: "available", version: "1.2.3" });
    expect(useStore.getState().update.confirming).toBe(false);
    useStore.getState().openUpdateConfirm();
    expect(useStore.getState().update.confirming).toBe(true);
    expect(useStore.getState().update.status).toBe("available");
    useStore.getState().cancelUpdate();
    expect(useStore.getState().update.confirming).toBe(false);
  });

  it("setUpdateState drives every updater state for the mock (#190/#193)", () => {
    useStore.getState().setUpdateState({ status: "downloading", progress: 42 });
    expect(useStore.getState().update.status).toBe("downloading");
    expect(useStore.getState().update.progress).toBe(42);
    useStore.getState().setUpdateState({ status: "error", error: "boom" });
    expect(useStore.getState().update.status).toBe("error");
    expect(useStore.getState().update.error).toBe("boom");
  });

  it("mockUpdate/clearUpdate arm + reset the dev mock (#193)", () => {
    // Default args → an available update with sample notes + the updater mock armed.
    useStore.getState().mockUpdate();
    let u = useStore.getState().update;
    expect(u.status).toBe("available");
    expect(u.version).toBe("9.9.9");
    expect(u.notes).toBeTruthy();
    expect(isMockUpdate()).toBe(true);

    // Custom version; `notes: null` explicitly omits the notes.
    useStore.getState().mockUpdate({ version: "1.2.3", notes: null });
    u = useStore.getState().update;
    expect(u.version).toBe("1.2.3");
    expect(u.notes).toBeNull();

    // Clear → idle + the updater mock disarmed (so real checks resume).
    useStore.getState().clearUpdate();
    u = useStore.getState().update;
    expect(u.status).toBe("idle");
    expect(u.version).toBeNull();
    expect(u.notes).toBeNull();
    expect(isMockUpdate()).toBe(false);
  });
});

describe("versionIncreased (#190)", () => {
  it("is true only when the new version is strictly higher", () => {
    expect(versionIncreased("0.0.1", "0.0.2")).toBe(true);
    expect(versionIncreased("0.0.9", "0.0.10")).toBe(true); // numeric, not lexical
    expect(versionIncreased("0.1.0", "1.0.0")).toBe(true);
    expect(versionIncreased("0.0.1", "0.0.1")).toBe(false); // unchanged
    expect(versionIncreased("0.0.2", "0.0.1")).toBe(false); // downgrade
    expect(versionIncreased("1.2.0", "1.2.0-beta")).toBe(false); // pre-release ≤
  });
});

describe("moveResultMessage (#253)", () => {
  it("reports a successful move with item count and destination", () => {
    expect(moveResultMessage(1, "src/utils", [])).toBe(
      "Moved 1 item into src/utils",
    );
    expect(moveResultMessage(3, "src", [])).toBe("Moved 3 items into src");
  });

  it("names the repo root for an empty destination", () => {
    expect(moveResultMessage(2, "", [])).toBe(
      "Moved 2 items into the repo root",
    );
  });

  it("surfaces the first error when some moved and some failed", () => {
    expect(moveResultMessage(1, "src", ["`x` already exists here"])).toBe(
      "Moved 1 item into src; 1 item failed: `x` already exists here",
    );
  });

  it("reports the error when nothing moved", () => {
    expect(moveResultMessage(0, "src", ["`x` already exists here"])).toBe(
      "`x` already exists here",
    );
    expect(moveResultMessage(0, "src", [])).toBe("Move failed");
  });
});

describe("repoOrder", () => {
  it("sorts groups alphabetically by repo name, not by recents order", () => {
    const recents = ["/repo/zeta", "/repo/alpha"]; // recent-first, non-alphabetical
    const sessions = [{ ...session("s1"), repoPath: "/repo/mid" }];
    expect(repoOrder(recents, sessions)).toEqual([
      "/repo/alpha",
      "/repo/mid",
      "/repo/zeta",
    ]);
  });

  it("de-duplicates repos shared by recents and sessions", () => {
    const sessions = [{ ...session("s1"), repoPath: "/repo/a" }];
    expect(repoOrder(["/repo/a"], sessions)).toEqual(["/repo/a"]);
  });

  it("is stable regardless of spawn/recents order (no reorder on new agent)", () => {
    expect(repoOrder(["/repo/b", "/repo/a"], [])).toEqual(
      repoOrder(["/repo/a", "/repo/b"], []),
    );
    expect(repoOrder(["/repo/b", "/repo/a"], [])).toEqual([
      "/repo/a",
      "/repo/b",
    ]);
  });

  it("orders case-insensitively and breaks name ties on the full path", () => {
    // Names apple / Banana / Cherry -> case-insensitive alphabetical.
    expect(repoOrder(["/x/Banana", "/z/Cherry", "/y/apple"], [])).toEqual([
      "/y/apple",
      "/x/Banana",
      "/z/Cherry",
    ]);
    // Same displayed name "app" -> deterministic tiebreak on the full path.
    expect(repoOrder(["/two/app", "/one/app"], [])).toEqual([
      "/one/app",
      "/two/app",
    ]);
  });
});

describe("dedupeBranchLabels", () => {
  it("indexes repeated labels, leaving the first bare", () => {
    expect(dedupeBranchLabels(["main", "main", "main"])).toEqual([
      "main",
      "main (2)",
      "main (3)",
    ]);
  });

  it("leaves distinct labels untouched", () => {
    expect(dedupeBranchLabels(["main", "dev"])).toEqual(["main", "dev"]);
  });

  it("indexes each label group independently, preserving order", () => {
    expect(dedupeBranchLabels(["main", "dev", "main"])).toEqual([
      "main",
      "dev",
      "main (2)",
    ]);
  });

  it("returns an empty array for no sessions", () => {
    expect(dedupeBranchLabels([])).toEqual([]);
  });
});

describe("overview panels (#38)", () => {
  const panels = [
    { id: "p1", kind: "diff" as const },
    { id: "p2", kind: "markdown" as const, file: "a.md" },
    { id: "p3", kind: "markdown" as const, file: "b.md" },
  ];

  it("removes a panel and drops the repo entry when empty", async () => {
    useStore.setState({ overviewPanels: { "/repo/a": [...panels] } });
    await useStore.getState().removeOverviewPanel("/repo/a", "p2");
    expect(
      useStore.getState().overviewPanels["/repo/a"]?.map((p) => p.id),
    ).toEqual(["p1", "p3"]);
    await useStore.getState().removeOverviewPanel("/repo/a", "p1");
    await useStore.getState().removeOverviewPanel("/repo/a", "p3");
    expect(useStore.getState().overviewPanels["/repo/a"]).toBeUndefined();
  });

  it("reorderOverview persists a repo cluster's drag order (#43)", async () => {
    await useStore.getState().reorderOverview("/repo/a", ["s2", "p1", "s1"]);
    expect(useStore.getState().overviewOrder["/repo/a"]).toEqual([
      "s2",
      "p1",
      "s1",
    ]);
  });

  it("reorderRepos persists the top-level folder order (#211)", async () => {
    await useStore.getState().reorderRepos(["/repo/b", "/repo/a", "/repo/c"]);
    // Optimistic set lands even though the host-less persist rejects (swallowed).
    expect(useStore.getState().folderOrder).toEqual([
      "/repo/b",
      "/repo/a",
      "/repo/c",
    ]);
  });
});

describe("global bulk actions (#293)", () => {
  const s = () => useStore.getState();

  it("killAllAgentsGlobal kills every running agent across all folders, leaving items", async () => {
    const killSpy = vi.spyOn(ipc, "killSession").mockResolvedValue();
    useStore.setState({
      sessions: [
        ovSession("a", "/repo/a", 1),
        ovSession("b", "/repo/b", 2),
        // A worktree agent whose repo_path is the worktree dir but parent is /repo/a.
        ovSession("wt", "/wt/a-feat", 3, "/repo/a"),
        // An already-exited agent must be left untouched (not "running").
        { ...ovSession("dead", "/repo/b", 4), exitedCode: 0 },
      ],
      recents: ["/repo/a", "/repo/b"],
      overviewPanels: {
        "/repo/a": [{ id: "p1", kind: "diff" }],
        "/repo/b": [{ id: "p2", kind: "markdown", file: "x.md" }],
      },
    });
    await s().killAllAgentsGlobal();
    // The three running agents (incl. the worktree agent) are gone; the exited one stays.
    expect(s().sessions.map((x) => x.id)).toEqual(["dead"]);
    // Killed once each — no double-kill despite the parent-folder sweep.
    expect(killSpy).toHaveBeenCalledTimes(3);
    // Non-agent items are untouched.
    expect(s().overviewPanels["/repo/a"]).toHaveLength(1);
    expect(s().overviewPanels["/repo/b"]).toHaveLength(1);
    // One summary toast.
    expect(s().toasts.map((t) => t.message)).toContain("Killed 3 agents");
    killSpy.mockRestore();
  });

  it("closeAllItemsGlobal kills all agents AND clears every folder's items", async () => {
    const killSpy = vi.spyOn(ipc, "killSession").mockResolvedValue();
    useStore.setState({
      sessions: [ovSession("a", "/repo/a", 1), ovSession("b", "/repo/b", 2)],
      recents: ["/repo/a", "/repo/b"],
      overviewPanels: {
        "/repo/a": [
          { id: "t1", kind: "terminal" },
          { id: "d1", kind: "diff" },
        ],
        "/repo/b": [{ id: "m1", kind: "markdown", file: "x.md" }],
      },
    });
    await s().closeAllItemsGlobal();
    // Every agent gone AND every non-agent item cleared app-wide.
    expect(s().sessions).toHaveLength(0);
    expect(s().overviewPanels["/repo/a"]).toBeUndefined();
    expect(s().overviewPanels["/repo/b"]).toBeUndefined();
    // The two agents + the one terminal panel's shell PTY were all killed.
    expect(killSpy).toHaveBeenCalledTimes(3);
    // Folders remain in recents (unlike Forget folder).
    expect(s().recents).toEqual(["/repo/a", "/repo/b"]);
    // One summary toast mirroring the per-repo wording.
    expect(s().toasts.map((t) => t.message)).toContain(
      "Closed 2 agents + 3 views",
    );
    killSpy.mockRestore();
  });

  it("closeAllItemsGlobal toasts 'Nothing to close' when the workspace is empty", async () => {
    useStore.setState({ sessions: [], recents: [], overviewPanels: {} });
    await s().closeAllItemsGlobal();
    expect(s().toasts.map((t) => t.message)).toContain("Nothing to close");
  });
});

describe("repo items — overviewPanels as the single source (#59)", () => {
  it("addOverviewPanel dedups: one diff per repo, one markdown per file", async () => {
    const add = () => useStore.getState().addOverviewPanel;
    await add()("/repo/a", "markdown", "docs/x.md");
    await add()("/repo/a", "markdown", "docs/x.md"); // dup file → no-op
    await add()("/repo/a", "diff");
    await add()("/repo/a", "diff"); // dup diff → no-op
    await add()("/repo/a", "markdown", "docs/y.md");

    const items = useStore.getState().overviewPanels["/repo/a"] ?? [];
    expect(items.filter((p) => p.kind === "diff")).toHaveLength(1);
    expect(
      items.filter((p) => p.kind === "markdown").map((p) => p.file),
    ).toEqual(["docs/x.md", "docs/y.md"]);
  });

  it("addOverviewPanel adds a kanban board, deduped by file (#142)", async () => {
    const add = () => useStore.getState().addOverviewPanel;
    await add()("/repo/a", "kanban", "board.md");
    await add()("/repo/a", "kanban", "board.md"); // dup file → no-op
    await add()("/repo/a", "kanban", "other.md");
    // A markdown file viewer of the same path is a distinct panel kind.
    await add()("/repo/a", "markdown", "board.md");

    const items = useStore.getState().overviewPanels["/repo/a"] ?? [];
    expect(items.filter((p) => p.kind === "kanban").map((p) => p.file)).toEqual(
      ["board.md", "other.md"],
    );
    expect(items.filter((p) => p.kind === "markdown")).toHaveLength(1);
  });

  it("removeOverviewPanel drops the item (and its repo entry when empty)", async () => {
    await useStore.getState().addOverviewPanel("/repo/a", "markdown", "z.md");
    const id = useStore.getState().overviewPanels["/repo/a"]?.[0]?.id ?? "";
    await useStore.getState().removeOverviewPanel("/repo/a", id);
    expect(useStore.getState().overviewPanels["/repo/a"]).toBeUndefined();
  });
});

describe("action toasts (#83)", () => {
  const lastToast = () => {
    const { toasts } = useStore.getState();
    return toasts[toasts.length - 1]?.message;
  };

  it("addOverviewPanel toasts 'Opened …'; a deduped re-add toasts 'Already open'", async () => {
    const add = useStore.getState().addOverviewPanel;
    await add("/repo/a", "diff");
    expect(lastToast()).toBe("Opened diff viewer");
    await add("/repo/a", "markdown", "docs/readme.md");
    expect(lastToast()).toBe("Opened readme.md"); // basename, not the full path
    await add("/repo/a", "diff"); // dup diff → no second "Opened"
    expect(lastToast()).toBe("Already open");
    const opened = useStore
      .getState()
      .toasts.filter((t) => t.message.startsWith("Opened "));
    expect(opened).toHaveLength(2);
  });

  it("removeOverviewPanel toasts a kind-aware 'Closed …'", async () => {
    await useStore
      .getState()
      .addOverviewPanel("/repo/a", "markdown", "src/main.ts");
    const id = useStore.getState().overviewPanels["/repo/a"]?.[0]?.id ?? "";
    await useStore.getState().removeOverviewPanel("/repo/a", id);
    expect(lastToast()).toBe("Closed main.ts");
  });

  it("canvas add / rename / close each toast; a no-op rename doesn't", () => {
    const s = () => useStore.getState();
    s().addCanvas();
    expect(lastToast()).toBe("Canvas created");
    const canvases = s().canvases;
    const created = canvases[canvases.length - 1];
    const cid = created?.id ?? "";
    s().renameCanvas(cid, created?.name ?? ""); // unchanged → no toast
    expect(lastToast()).toBe("Canvas created");
    s().renameCanvas(cid, "Renamed");
    expect(lastToast()).toBe("Canvas renamed");
    s().closeCanvas(cid);
    expect(lastToast()).toBe("Canvas closed");
  });
});

describe("mergeRepoOrder (#43)", () => {
  it("keeps the saved order for present items", () => {
    expect(mergeRepoOrder(["b", "a", "c"], ["a", "b", "c"])).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("appends present items missing from the saved order (new agents)", () => {
    // saved had a, c; b and d are new → appended in their default order.
    expect(mergeRepoOrder(["c", "a"], ["a", "b", "c", "d"])).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });

  it("drops saved keys no longer present (closed items)", () => {
    expect(mergeRepoOrder(["a", "gone", "b"], ["b", "a"])).toEqual(["a", "b"]);
  });

  it("returns the default order when nothing was saved", () => {
    expect(mergeRepoOrder([], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  // The displayed sidebar folder order (#211) is exactly this composition:
  // mergeRepoOrder(folderOrder, repoOrder(recents, sessions)). Verify the
  // user's drag order wins, a new repo appends, and a forgotten one drops.
  it("composes with repoOrder for the displayed folder order (#211)", () => {
    const recents = ["/x/alpha", "/x/beta", "/x/gamma"];
    const def = repoOrder(recents, []); // alphabetical default
    expect(def).toEqual(["/x/alpha", "/x/beta", "/x/gamma"]);

    // User dragged gamma to the top → that order is kept.
    const saved = ["/x/gamma", "/x/alpha", "/x/beta"];
    expect(mergeRepoOrder(saved, def)).toEqual([
      "/x/gamma",
      "/x/alpha",
      "/x/beta",
    ]);

    // A newly added repo (delta) appends after the saved order.
    const withDelta = repoOrder([...recents, "/x/delta"], []);
    expect(mergeRepoOrder(saved, withDelta)).toEqual([
      "/x/gamma",
      "/x/alpha",
      "/x/beta",
      "/x/delta",
    ]);

    // A forgotten repo (beta) drops without scrambling the rest.
    const withoutBeta = repoOrder(["/x/alpha", "/x/gamma"], []);
    expect(mergeRepoOrder(saved, withoutBeta)).toEqual([
      "/x/gamma",
      "/x/alpha",
    ]);
  });
});

describe("placeAfterAnchor (#285)", () => {
  it("inserts id immediately after anchorId, removing a prior occurrence", () => {
    // The new key starts at the end of the cluster (mergeRepoOrder appends it).
    expect(placeAfterAnchor(["a", "b", "p"], "p", "a")).toEqual([
      "a",
      "p",
      "b",
    ]);
  });

  it("returns the input unchanged (same reference) when anchorId is absent", () => {
    const input = ["a", "b", "p"];
    expect(placeAfterAnchor(input, "p", "zzz")).toBe(input);
  });

  it("is idempotent when id already directly follows anchorId", () => {
    expect(placeAfterAnchor(["a", "p", "b"], "p", "a")).toEqual([
      "a",
      "p",
      "b",
    ]);
  });

  it("preserves the relative order of the other keys", () => {
    expect(placeAfterAnchor(["x", "a", "y", "p", "z"], "p", "a")).toEqual([
      "x",
      "a",
      "p",
      "y",
      "z",
    ]);
  });

  it("returns the input unchanged when id equals anchorId", () => {
    const input = ["a", "b", "c"];
    expect(placeAfterAnchor(input, "a", "a")).toBe(input);
  });
});

describe("anchorAgentForPanel (#285)", () => {
  const base = {
    sessions: [
      ovSession("wt", "/repo/P/wt", 1, "/repo/P"),
      ovSession("p1", "/repo/P", 2),
      ovSession("p2", "/repo/P", 3),
    ],
    // Cluster render order for parent P (createdAt order, panel appended).
    clusterKeys: ["wt", "p1", "p2", "panel"],
  };

  it("anchors to the worktree's own agent for a worktree-folder panel", () => {
    expect(
      anchorAgentForPanel({
        ...base,
        repoPath: "/repo/P/wt",
        selectedId: null,
      }),
    ).toBe("wt");
  });

  it("anchors to the last folder agent in render order when none selected", () => {
    expect(
      anchorAgentForPanel({ ...base, repoPath: "/repo/P", selectedId: null }),
    ).toBe("p2");
  });

  it("prefers the selected agent when it runs in the folder", () => {
    expect(
      anchorAgentForPanel({ ...base, repoPath: "/repo/P", selectedId: "p1" }),
    ).toBe("p1");
  });

  it("ignores a selection that isn't an agent in this folder", () => {
    // wt is selected but the panel is scoped to the parent repo P, not the worktree.
    expect(
      anchorAgentForPanel({ ...base, repoPath: "/repo/P", selectedId: "wt" }),
    ).toBe("p2");
  });

  it("returns null when no agent runs in the folder", () => {
    expect(
      anchorAgentForPanel({ ...base, repoPath: "/repo/Q", selectedId: null }),
    ).toBeNull();
  });
});

describe("addOverviewPanel places a panel next to its agent (#285)", () => {
  const add = () => useStore.getState().addOverviewPanel;
  const order = (repo: string) => useStore.getState().overviewOrder[repo];

  it("places a worktree-folder panel right after the worktree agent in the parent cluster", async () => {
    useStore.setState({
      sessions: [
        ovSession("wt", "/repo/P/wt", 1, "/repo/P"),
        ovSession("p1", "/repo/P", 2),
      ],
      overviewPanels: {},
      overviewOrder: {},
      schedules: [],
    });
    const id = await add()("/repo/P/wt", "diff");
    // Default order would append the panel last ([wt, p1, id]); instead it lands
    // right after the worktree agent, ahead of the parent repo's own agent.
    expect(order("/repo/P")).toEqual(["wt", id, "p1"]);
  });

  it("places a repo panel after the repo's agent, ahead of an existing panel", async () => {
    useStore.setState({
      sessions: [ovSession("a1", "/repo/P", 1)],
      overviewPanels: {
        "/repo/P": [{ id: "pX", kind: "markdown", file: "x.md" }],
      },
      overviewOrder: {},
      schedules: [],
    });
    const id = await add()("/repo/P", "diff");
    expect(order("/repo/P")).toEqual(["a1", id, "pX"]);
  });

  it("anchors after the selected agent when one in the folder is selected", async () => {
    useStore.setState({
      sessions: [ovSession("a1", "/repo/P", 1), ovSession("a2", "/repo/P", 2)],
      overviewPanels: {},
      overviewOrder: {},
      schedules: [],
      selectedId: "a1",
    });
    const id = await add()("/repo/P", "diff");
    // Without the selection tie-break the anchor would be the last agent (a2).
    expect(order("/repo/P")).toEqual(["a1", id, "a2"]);
  });

  it("does not write an order when no agent runs in the folder", async () => {
    useStore.setState({
      sessions: [],
      overviewPanels: {},
      overviewOrder: {},
      schedules: [],
    });
    await add()("/repo/P", "diff");
    expect(order("/repo/P")).toBeUndefined();
  });

  it("a dedup hit returns the existing id and does not reposition", async () => {
    useStore.setState({
      sessions: [ovSession("a1", "/repo/P", 1)],
      overviewPanels: {},
      overviewOrder: {},
      schedules: [],
    });
    const id1 = await add()("/repo/P", "diff");
    expect(order("/repo/P")).toEqual(["a1", id1]);
    // A sentinel order proves the deduped re-add leaves overviewOrder untouched.
    useStore.setState({ overviewOrder: { "/repo/P": ["sentinel"] } });
    const id2 = await add()("/repo/P", "diff");
    expect(id2).toBe(id1);
    expect(order("/repo/P")).toEqual(["sentinel"]);
  });
});

describe("repoColor", () => {
  it("returns the assigned color when set", () => {
    expect(repoColor("/repo/a", { "/repo/a": "#abcdef" })).toBe("#abcdef");
  });

  it("derives a stable palette default when unassigned (#35)", () => {
    const c = repoColor("/repo/a", {});
    expect(REPO_PALETTE).toContain(c);
    expect(repoColor("/repo/a", {})).toBe(c); // stable across calls
  });
});

describe("kanbanColumnColor (#239)", () => {
  const configured = [
    { name: "To Do", color: "#abcdef" },
    { name: "Doing", color: "#123456" },
  ];

  it("returns the configured color for an exact name match", () => {
    expect(kanbanColumnColor("To Do", configured)).toBe("#abcdef");
  });

  it("matches case-insensitively and trims whitespace", () => {
    expect(kanbanColumnColor("  to do ", configured)).toBe("#abcdef");
    expect(kanbanColumnColor("DOING", configured)).toBe("#123456");
  });

  it("falls back to a stable hashed palette color for an unlisted name", () => {
    const c = kanbanColumnColor("Backlog", configured);
    expect(REPO_PALETTE).toContain(c);
    // Stable across calls + independent of the configured list for unlisted names.
    expect(kanbanColumnColor("Backlog", configured)).toBe(c);
    expect(kanbanColumnColor("Backlog", [])).toBe(c);
  });

  it("ignores a blank-color entry (a row mid-edit) and falls through to the hash", () => {
    const c = kanbanColumnColor("Review", [{ name: "Review", color: "" }]);
    expect(c).toBe(kanbanColumnColor("Review", []));
    expect(REPO_PALETTE).toContain(c);
  });

  it("seeds DEFAULT_SETTINGS with the three default lanes", () => {
    expect(DEFAULT_SETTINGS.kanbanColumnColors.map((c) => c.name)).toEqual([
      "To Do",
      "Doing",
      "Done",
    ]);
    // The seeded color matches the hashed-name fallback (what an unconfigured board shows).
    for (const { name, color } of DEFAULT_SETTINGS.kanbanColumnColors) {
      expect(color).toBe(kanbanColumnColor(name, []));
    }
  });
});

describe("adjacentSessionId", () => {
  const ss = [session("a"), session("b"), session("c")];

  it("returns null when there are no sessions", () => {
    expect(adjacentSessionId([], null, 1)).toBeNull();
    expect(adjacentSessionId([], "a", -1)).toBeNull();
  });

  it("selects the first when nothing is selected or the id is unknown", () => {
    expect(adjacentSessionId(ss, null, 1)).toBe("a");
    expect(adjacentSessionId(ss, null, -1)).toBe("a");
    expect(adjacentSessionId(ss, "zzz", 1)).toBe("a");
  });

  it("moves to the next / previous in order", () => {
    expect(adjacentSessionId(ss, "a", 1)).toBe("b");
    expect(adjacentSessionId(ss, "b", 1)).toBe("c");
    expect(adjacentSessionId(ss, "b", -1)).toBe("a");
  });

  it("wraps around at the ends", () => {
    expect(adjacentSessionId(ss, "c", 1)).toBe("a"); // last -> first
    expect(adjacentSessionId(ss, "a", -1)).toBe("c"); // first -> last
  });

  it("stays on the only session when there is one", () => {
    expect(adjacentSessionId([session("solo")], "solo", 1)).toBe("solo");
    expect(adjacentSessionId([session("solo")], "solo", -1)).toBe("solo");
  });
});

describe("adjacentId (#174)", () => {
  const ids = ["a", "b", "c"];

  it("returns null for an empty list", () => {
    expect(adjacentId([], null, 1)).toBeNull();
    expect(adjacentId([], "a", -1)).toBeNull();
  });

  it("selects the first when nothing is selected or the id is unknown", () => {
    expect(adjacentId(ids, null, 1)).toBe("a");
    expect(adjacentId(ids, null, -1)).toBe("a");
    expect(adjacentId(ids, "zzz", 1)).toBe("a");
  });

  it("moves to the next / previous in order", () => {
    expect(adjacentId(ids, "a", 1)).toBe("b");
    expect(adjacentId(ids, "b", 1)).toBe("c");
    expect(adjacentId(ids, "b", -1)).toBe("a");
  });

  it("wraps around at the ends", () => {
    expect(adjacentId(ids, "c", 1)).toBe("a"); // last -> first
    expect(adjacentId(ids, "a", -1)).toBe("c"); // first -> last
  });
});

describe("overviewClusterKeys (#174)", () => {
  // Two repos (alpha, beta) with a mix of agent, panel, worktree-panel and
  // schedule columns. s3 is a worktree agent of alpha; p-wt is a panel keyed by
  // the worktree folder that must cluster under the parent repo (#164).
  const s1 = ovSession("s1", "/work/beta", 1);
  const s2 = ovSession("s2", "/work/alpha", 2);
  const s3 = ovSession("s3", "/work/alpha/wt", 3, "/work/alpha");
  const sessions = [s1, s2, s3];
  const overviewPanels: Record<string, OverviewPanel[]> = {
    "/work/alpha": [{ id: "p-alpha", kind: "diff" }],
    "/work/alpha/wt": [{ id: "p-wt", kind: "markdown" }],
  };
  const schedules: ScheduledSession[] = [
    { id: "sc-beta", cwd: "/work/beta", fire_at: 0, created_at: 0 },
  ];

  it("orders repos alphabetically with the default per-repo order (agents, panels, schedules)", () => {
    const ids = overviewClusterKeys({
      sessions,
      overviewPanels,
      overviewOrder: {},
      schedules,
      filter: null,
    });
    // alpha (agents s2,s3 then panels p-alpha,p-wt) then beta (agent s1, schedule).
    // p-wt clusters under alpha despite its worktree key.
    expect(ids).toEqual(["s2", "s3", "p-alpha", "p-wt", "s1", "sc-beta"]);
  });

  it("interleaves every column kind per the persisted overviewOrder", () => {
    const ids = overviewClusterKeys({
      sessions,
      overviewPanels,
      overviewOrder: { "/work/alpha": ["p-alpha", "s2", "s3", "p-wt"] },
      schedules,
      filter: null,
    });
    expect(ids).toEqual(["p-alpha", "s2", "s3", "p-wt", "s1", "sc-beta"]);
  });

  it("confines navigation to the visible cluster when an 'all' repo filter is active", () => {
    const ids = overviewClusterKeys({
      sessions,
      overviewPanels,
      overviewOrder: { "/work/alpha": ["p-alpha", "s2", "s3", "p-wt"] },
      schedules,
      filter: { path: "/work/alpha", mode: "all" },
    });
    expect(ids).toEqual(["p-alpha", "s2", "s3", "p-wt"]);
  });

  it("an 'own' repo filter hides worktree agents AND worktree-path panels (#247)", () => {
    // "own" on /work/alpha keeps the repo's own agent (s2) + own panel (p-alpha),
    // but excludes the worktree agent (s3) and the worktree-keyed panel (p-wt).
    const ids = overviewClusterKeys({
      sessions,
      overviewPanels,
      overviewOrder: { "/work/alpha": ["p-alpha", "s2", "s3", "p-wt"] },
      schedules,
      filter: { path: "/work/alpha", mode: "own" },
    });
    expect(ids).toEqual(["p-alpha", "s2"]);
  });

  it("an 'own' repo filter hides worktree schedules but keeps the repo's own schedule (#247)", () => {
    const ownSchedule: ScheduledSession = {
      id: "sc-alpha",
      cwd: "/work/alpha",
      fire_at: 0,
      created_at: 0,
    };
    const wtSchedule: ScheduledSession = {
      id: "sc-alpha-wt",
      cwd: "/work/alpha",
      fire_at: 0,
      created_at: 0,
      worktree: true,
      worktree_path: "/work/alpha/wt",
    };
    const ids = overviewClusterKeys({
      sessions: [s2], // alpha's own agent only, to isolate the schedule behavior
      overviewPanels: {},
      overviewOrder: {},
      schedules: [ownSchedule, wtSchedule],
      filter: { path: "/work/alpha", mode: "own" },
    });
    // The own schedule survives; the worktree schedule (nests under a worktree) is hidden.
    expect(ids).toEqual(["s2", "sc-alpha"]);
  });

  it("narrows to a single worktree's items when a worktree-folder filter is active (#197)", () => {
    // Filtering on the worktree folder shows ONLY that worktree's agent + panel
    // (s3, p-wt), not the parent's direct items (s2, p-alpha) or other repos.
    const ids = overviewClusterKeys({
      sessions,
      overviewPanels,
      overviewOrder: { "/work/alpha": ["p-alpha", "s2", "s3", "p-wt"] },
      schedules,
      filter: { path: "/work/alpha/wt", mode: "all" },
    });
    expect(ids).toEqual(["s3", "p-wt"]);
  });

  it("drops empty clusters (an empty panel list adds no column)", () => {
    const ids = overviewClusterKeys({
      sessions: [s2],
      overviewPanels: { "/work/alpha": [], "/work/gamma": [] },
      overviewOrder: {},
      schedules: [],
      filter: null,
    });
    expect(ids).toEqual(["s2"]);
  });

  it("adds a recurring column and hides its owned child agent (#294)", () => {
    // A recurring in beta owns child agent "child-1" (a live session). The recurring
    // shows as one column keyed on its id; the child is filtered out of the wall.
    const child = ovSession("child-1", "/work/beta", 9);
    const ids = overviewClusterKeys({
      sessions: [s2, child],
      overviewPanels: {},
      overviewOrder: {},
      schedules: [],
      recurrings: [
        {
          id: "rec-beta",
          cwd: "/work/beta",
          interval_secs: 3600,
          next_fire_at: 0,
          created_at: 0,
          current_session_id: "child-1",
        },
      ],
      filter: null,
    });
    // alpha's own agent, then beta's recurring column — the child never appears.
    expect(ids).toEqual(["s2", "rec-beta"]);
    expect(ids).not.toContain("child-1");
  });
});

describe("ownedChildSessionIds (#294)", () => {
  it("collects each recurring's current child, skipping unset ones", () => {
    const ids = ownedChildSessionIds([
      { current_session_id: "c1" },
      { current_session_id: null },
      { current_session_id: "c2" },
      {},
    ]);
    expect([...ids].sort()).toEqual(["c1", "c2"]);
  });

  it("is empty when no recurrings have a live child", () => {
    expect(ownedChildSessionIds([]).size).toBe(0);
    expect(ownedChildSessionIds([{ current_session_id: null }]).size).toBe(0);
  });
});

describe("worktreeHasItems (#199)", () => {
  const dest = "/data/worktrees/repo-id/feat";
  const empty = {
    sessions: [],
    overviewPanels: {},
    schedules: [],
    recurrings: [],
  };

  it("is false for a worktree with no items (→ safe to remove)", () => {
    expect(worktreeHasItems(empty, dest)).toBe(false);
  });

  it("counts an agent whose repoPath is the worktree (incl. an exited-but-shown one)", () => {
    // The guard counts ANY session at this folder — including an exited agent still
    // shown with a Restart overlay (the old guard only counted live agents).
    expect(
      worktreeHasItems({ ...empty, sessions: [{ repoPath: dest }] }, dest),
    ).toBe(true);
  });

  it("counts an overview panel keyed to the worktree folder", () => {
    expect(
      worktreeHasItems(
        { ...empty, overviewPanels: { [dest]: [{ id: "p1" }] } },
        dest,
      ),
    ).toBe(true);
    // An empty panel list does not count.
    expect(
      worktreeHasItems({ ...empty, overviewPanels: { [dest]: [] } }, dest),
    ).toBe(false);
  });

  it("counts a scheduled session targeting the worktree folder", () => {
    expect(
      worktreeHasItems({ ...empty, schedules: [{ cwd: dest }] }, dest),
    ).toBe(true);
  });

  it("counts a worktree schedule by its worktree_path (#259 — its cwd is the parent repo)", () => {
    // A worktree schedule's `cwd` is the PARENT repo, not the worktree folder; its
    // eagerly-created worktree (#259) lives at `worktree_path`. So matching only `cwd`
    // would miss it and wrongly free a worktree another pending schedule still uses.
    expect(
      worktreeHasItems(
        {
          ...empty,
          schedules: [{ cwd: "/work/parent-repo", worktree_path: dest }],
        },
        dest,
      ),
    ).toBe(true);
    // A worktree schedule for a DIFFERENT folder does not count.
    expect(
      worktreeHasItems(
        {
          ...empty,
          schedules: [
            { cwd: "/work/parent-repo", worktree_path: "/data/other" },
          ],
        },
        dest,
      ),
    ).toBe(false);
  });

  it("counts a recurring session targeting the worktree folder (#294)", () => {
    // A recurring created inside the worktree (`cwd === dest`) …
    expect(
      worktreeHasItems({ ...empty, recurrings: [{ cwd: dest }] }, dest),
    ).toBe(true);
    // … or a worktree recurring whose eager worktree is `worktree_path`.
    expect(
      worktreeHasItems(
        {
          ...empty,
          recurrings: [{ cwd: "/work/parent-repo", worktree_path: dest }],
        },
        dest,
      ),
    ).toBe(true);
    // A recurring for a different folder does not count.
    expect(
      worktreeHasItems(
        { ...empty, recurrings: [{ cwd: "/work/other" }] },
        dest,
      ),
    ).toBe(false);
  });

  it("ignores items belonging to other folders", () => {
    expect(
      worktreeHasItems(
        {
          sessions: [{ repoPath: "/work/other" }],
          overviewPanels: { "/work/other": [{ id: "p" }] },
          schedules: [{ cwd: "/work/other" }],
          recurrings: [{ cwd: "/work/other" }],
        },
        dest,
      ),
    ).toBe(false);
  });

  it("mixed items all count; only true emptiness (all types gone) is removable", () => {
    const full = {
      sessions: [{ repoPath: dest }],
      overviewPanels: { [dest]: [{ id: "p" }] },
      schedules: [{ cwd: dest }],
      recurrings: [{ cwd: dest }],
    };
    expect(worktreeHasItems(full, dest)).toBe(true);
    // Drop the agent → still has a panel + schedule + recurring.
    expect(worktreeHasItems({ ...full, sessions: [] }, dest)).toBe(true);
    // Drop the panel too → still has the schedule + recurring.
    expect(
      worktreeHasItems(
        {
          sessions: [],
          overviewPanels: {},
          schedules: [{ cwd: dest }],
          recurrings: [{ cwd: dest }],
        },
        dest,
      ),
    ).toBe(true);
    // Everything gone → empty → removable.
    expect(worktreeHasItems(empty, dest)).toBe(false);
  });
});

describe("isCleanExit (#63)", () => {
  it("treats code 0 while running (not intentional) as a clean exit → forget", () => {
    expect(isCleanExit(0, false, false)).toBe(true);
  });

  it("keeps non-zero / unknown exits as a recoverable overlay (not clean)", () => {
    expect(isCleanExit(1, false, false)).toBe(false);
    expect(isCleanExit(137, false, false)).toBe(false);
    expect(isCleanExit(null, false, false)).toBe(false);
  });

  it("never auto-forgets during the boot resume window (#30)", () => {
    // A code-0 exit while booting keeps the overlay + Restart instead of vanishing.
    expect(isCleanExit(0, true, false)).toBe(false);
  });

  it("never auto-forgets an intentional kill (Remove/Forget toasts on its own)", () => {
    expect(isCleanExit(0, false, true)).toBe(false);
  });
});

describe("canvas templates (#117)", () => {
  it("saveTemplate creates a new template and returns its id", () => {
    const id = useStore.getState().saveTemplate("Dev workspace", null);
    const templates = useStore.getState().canvasTemplates;
    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({ id, name: "Dev workspace" });
  });

  it("saveTemplate with an existing id updates in place (no new record)", () => {
    const id = useStore.getState().saveTemplate("First", null);
    const layout = {
      type: "leaf" as const,
      id: "leaf-1",
      content: { kind: "new-agent" },
    };
    const sameId = useStore
      .getState()
      .saveTemplate("First (edited)", layout, id);
    expect(sameId).toBe(id);
    const templates = useStore.getState().canvasTemplates;
    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({
      id,
      name: "First (edited)",
      layout,
    });
  });

  it("blank name falls back to a placeholder", () => {
    useStore.getState().saveTemplate("   ", null);
    expect(useStore.getState().canvasTemplates[0]?.name).toBe(
      "Untitled template",
    );
  });

  it("renameTemplate updates the name; blank is ignored", () => {
    const id = useStore.getState().saveTemplate("Old", null);
    useStore.getState().renameTemplate(id, "New");
    expect(useStore.getState().canvasTemplates[0]?.name).toBe("New");
    useStore.getState().renameTemplate(id, "  ");
    expect(useStore.getState().canvasTemplates[0]?.name).toBe("New");
  });

  it("duplicateTemplate appends a copy with an independent layout", () => {
    const layout = {
      type: "leaf" as const,
      id: "leaf-1",
      content: { kind: "open-file", file: "README.md" },
    };
    const id = useStore.getState().saveTemplate("Base", layout, null);
    useStore.getState().duplicateTemplate(id);
    const templates = useStore.getState().canvasTemplates;
    expect(templates).toHaveLength(2);
    expect(templates[1]?.name).toBe("Base copy");
    // The copy's layout is a deep clone, not the same object reference.
    expect(templates[1]?.layout).not.toBe(templates[0]?.layout);
    expect(templates[1]?.layout).toEqual(templates[0]?.layout);
  });

  it("deleteTemplate removes the template", () => {
    const id = useStore.getState().saveTemplate("Gone", null);
    useStore.getState().deleteTemplate(id);
    expect(useStore.getState().canvasTemplates).toEqual([]);
  });

  it("openTemplateEditor / close toggle the editor flags", () => {
    useStore.getState().openTemplateEditor("t1");
    expect(useStore.getState().templateEditorOpen).toBe(true);
    expect(useStore.getState().templateEditorId).toBe("t1");
    expect(useStore.getState().templateManagerOpen).toBe(false);
    useStore.getState().closeTemplateEditor();
    expect(useStore.getState().templateEditorOpen).toBe(false);
    expect(useStore.getState().templateEditorId).toBe(null);
  });
});

describe("canvas template instantiation (#118)", () => {
  const pendingTab = (block: { kind: string; file?: string }): CanvasNode => ({
    type: "leaf",
    id: "L",
    content: { kind: "pending", repoPath: "/repo/x", block },
  });

  it("useTemplate replaces a sole empty canvas in place (pending panels), switches to Canvas (#142)", () => {
    const layout: CanvasNode = {
      type: "leaf",
      id: "lt",
      content: { kind: "new-terminal" },
    };
    const id = useStore.getState().saveTemplate("Term", layout, null);
    // beforeEach seeds a single empty "Canvas 1" → the template replaces it in
    // place (no leftover empty tab) rather than appending (#142).
    useStore.getState().useTemplate(id, "/repo/x");
    const s = useStore.getState();
    expect(s.canvases.length).toBe(1);
    expect(s.view).toBe("canvas");
    const tab = s.canvases[0];
    expect(tab?.name).toBe("Term");
    expect(s.activeCanvasId).toBe(tab?.id);
    // The leaf opens as a pending panel bound to the chosen folder (resolution is
    // async + rejects host-less, but the tab opens immediately).
    const leaf = collectLeaves(tab?.layout ?? null)[0];
    expect(leaf?.content.kind).toBe("pending");
    expect(leaf?.content.block).toEqual({ kind: "new-terminal" });
    expect(leaf?.content.repoPath).toBe("/repo/x");
  });

  it("useTemplate appends (removes nothing) when 2+ canvases exist (#142)", () => {
    const layout: CanvasNode = {
      type: "leaf",
      id: "lt",
      content: { kind: "new-terminal" },
    };
    const id = useStore.getState().saveTemplate("Term", layout, null);
    // 2+ canvases — even though both are empty, always append and remove none.
    useStore.setState({
      canvases: [
        { id: "c1", name: "Canvas 1", layout: null },
        { id: "c2", name: "Canvas 2", layout: null },
      ],
      activeCanvasId: "c1",
    });
    useStore.getState().useTemplate(id, "/repo/x");
    const s = useStore.getState();
    expect(s.canvases.length).toBe(3);
    expect(s.canvases.map((c) => c.id)).toEqual([
      "c1",
      "c2",
      expect.any(String),
    ]);
    const tab = s.canvases[2];
    expect(tab?.name).toBe("Term");
    expect(s.activeCanvasId).toBe(tab?.id);
  });

  it("useTemplate appends when the sole canvas has panels (#142)", () => {
    const layout: CanvasNode = {
      type: "leaf",
      id: "lt",
      content: { kind: "new-terminal" },
    };
    const id = useStore.getState().saveTemplate("Term", layout, null);
    // A single canvas that HAS panels survives — append beside it.
    useStore.setState({
      canvases: [
        {
          id: "c1",
          name: "Canvas 1",
          layout: pendingTab({ kind: "new-terminal" }),
        },
      ],
      activeCanvasId: "c1",
    });
    useStore.getState().useTemplate(id, "/repo/x");
    const s = useStore.getState();
    expect(s.canvases.length).toBe(2);
    expect(s.canvases[0]?.id).toBe("c1");
    const tab = s.canvases[1];
    expect(tab?.name).toBe("Term");
    expect(s.activeCanvasId).toBe(tab?.id);
  });

  it("resolveTemplateBlock sets an inline error when a block can't resolve", async () => {
    useStore.setState({
      canvases: [
        { id: "c1", name: "T", layout: pendingTab({ kind: "open-diff" }) },
      ],
      activeCanvasId: "c1",
    });
    // Host-less: ipc.isGitRepo rejects → the panel records an inline error and
    // RETAINS its block so Retry can re-run it.
    await useStore.getState().resolveTemplateBlock("c1", "L");
    const leaf = collectLeaves(
      useStore.getState().canvases[0]?.layout ?? null,
    )[0];
    expect(leaf?.content.kind).toBe("pending");
    expect(leaf?.content.error).toBeTruthy();
    expect(leaf?.content.block).toEqual({ kind: "open-diff" });
  });

  it("pickTemplateBlockFile replaces the pending block's relative path", () => {
    useStore.setState({
      canvases: [
        {
          id: "c1",
          name: "T",
          layout: pendingTab({ kind: "open-file", file: "missing.md" }),
        },
      ],
      activeCanvasId: "c1",
    });
    useStore.getState().pickTemplateBlockFile("c1", "L", "README.md");
    const leaf = collectLeaves(
      useStore.getState().canvases[0]?.layout ?? null,
    )[0];
    expect(leaf?.content.block).toEqual({
      kind: "open-file",
      file: "README.md",
    });
  });

  it("pickTemplateBlockFile preserves an open-kanban block kind (#154)", () => {
    useStore.setState({
      canvases: [
        {
          id: "c1",
          name: "T",
          layout: pendingTab({ kind: "open-kanban", file: "missing.md" }),
        },
      ],
      activeCanvasId: "c1",
    });
    // Picking a file for a kanban block must keep it kanban (resolves into a
    // KanbanPanel), not silently degrade to an open-file viewer.
    useStore.getState().pickTemplateBlockFile("c1", "L", "TASKS.md");
    const leaf = collectLeaves(
      useStore.getState().canvases[0]?.layout ?? null,
    )[0];
    expect(leaf?.content.block).toEqual({
      kind: "open-kanban",
      file: "TASKS.md",
    });
  });

  it("openTemplateUse / close toggle the chooser flag", () => {
    useStore.getState().openTemplateUse();
    expect(useStore.getState().templateUseOpen).toBe(true);
    useStore.getState().closeTemplateUse();
    expect(useStore.getState().templateUseOpen).toBe(false);
  });
});

describe("canvas panel lift (#155)", () => {
  // split(s1){ a: agent(L1, A), b: file(L2) } — two panels in the active tab.
  const twoPanels = (): CanvasNode => ({
    type: "split",
    id: "s1",
    dir: "row",
    sizes: [50, 50],
    a: { type: "leaf", id: "L1", content: { kind: "agent", sessionId: "A" } },
    b: {
      type: "leaf",
      id: "L2",
      content: { kind: "file", repoPath: "/repo/x", file: "a.md" },
    },
  });

  const seed = (layout: CanvasNode | null) => {
    useStore.setState({
      canvases: [{ id: "c1", name: "T", layout }],
      activeCanvasId: "c1",
      liftedLeaf: null,
    });
  };

  it("beginCanvasLift records the active tab + leaf without touching the layout", () => {
    const layout = twoPanels();
    seed(layout);
    useStore.getState().beginCanvasLift("L1");
    const s = useStore.getState();
    expect(s.liftedLeaf).toEqual({ canvasId: "c1", leafId: "L1" });
    // The persisted layout is unchanged (same reference) — the lift is transient.
    expect(s.canvases[0]?.layout).toBe(layout);
  });

  it("commit moves the lifted panel to the target edge, preserving id + content", () => {
    seed(twoPanels());
    useStore.getState().beginCanvasLift("L1");
    // Drop L1 onto L2's right edge → order becomes L2, L1.
    useStore.getState().commitCanvasLift("L2", "right");
    const s = useStore.getState();
    expect(s.liftedLeaf).toBeNull();
    const leaves = collectLeaves(s.canvases[0]?.layout ?? null);
    expect(leaves.map((l) => l.id)).toEqual(["L2", "L1"]);
    // The moved panel keeps its id AND agent content (so the pooled terminal reparents).
    expect(leaves.find((l) => l.id === "L1")?.content).toEqual({
      kind: "agent",
      sessionId: "A",
    });
  });

  it("commit of a sole panel onto the center keeps it as the single leaf", () => {
    const sole: CanvasNode = {
      type: "leaf",
      id: "L1",
      content: { kind: "agent", sessionId: "A" },
    };
    seed(sole);
    useStore.getState().beginCanvasLift("L1");
    useStore.getState().commitCanvasLift("canvas-center", "left");
    const s = useStore.getState();
    expect(s.liftedLeaf).toBeNull();
    // Already the whole tree — restored in place, unchanged.
    expect(s.canvases[0]?.layout).toEqual(sole);
  });

  it("cancel restores the panel — the persisted layout is byte-for-byte unchanged", () => {
    const layout = twoPanels();
    seed(layout);
    useStore.getState().beginCanvasLift("L1");
    useStore.getState().cancelCanvasLift();
    const s = useStore.getState();
    expect(s.liftedLeaf).toBeNull();
    // Never mutated during the lift → same reference as before.
    expect(s.canvases[0]?.layout).toBe(layout);
  });
});

describe("big mode (#157)", () => {
  it("maximizeItem sets the overlay item; closeMaximized clears it", () => {
    const content = { kind: "agent" as const, sessionId: "s1", repoPath: "/r" };
    useStore.getState().maximizeItem(content);
    expect(useStore.getState().maximizedItem).toEqual(content);
    useStore.getState().closeMaximized();
    expect(useStore.getState().maximizedItem).toBeNull();
  });

  it("closeMaximized is a no-op when nothing is maximized", () => {
    expect(useStore.getState().maximizedItem).toBeNull();
    useStore.getState().closeMaximized();
    expect(useStore.getState().maximizedItem).toBeNull();
  });
});

describe("canvas tab close behavior (#137)", () => {
  const agentLayout = (sessionId: string): CanvasNode => ({
    type: "leaf",
    id: `leaf-${sessionId}`,
    content: { kind: "agent", sessionId, repoPath: `/repo/${sessionId}` },
  });
  const s = () => useStore.getState();
  const seed = (behavior: "ask" | "kill" | "keep") => {
    useStore.setState({
      sessions: [session("a1")],
      canvases: [
        { id: "c-full", name: "Full", layout: agentLayout("a1") },
        { id: "c-empty", name: "Empty", layout: null },
      ],
      activeCanvasId: "c-full",
      settings: { ...s().settings, canvasCloseBehavior: behavior },
      canvasClosePromptId: null,
    });
  };

  it("closes an empty tab silently (no prompt) in every mode", () => {
    for (const mode of ["ask", "kill", "keep"] as const) {
      seed(mode);
      s().requestCloseCanvas("c-empty");
      expect(s().canvasClosePromptId).toBeNull();
      expect(s().canvases.some((c) => c.id === "c-empty")).toBe(false);
    }
  });

  it("'ask' opens the prompt for a tab with contents; cancel leaves it open", () => {
    seed("ask");
    s().requestCloseCanvas("c-full");
    expect(s().canvasClosePromptId).toBe("c-full");
    expect(s().canvases.some((c) => c.id === "c-full")).toBe(true); // not closed yet
    s().cancelCloseCanvas();
    expect(s().canvasClosePromptId).toBeNull();
    expect(s().canvases.some((c) => c.id === "c-full")).toBe(true);
  });

  it("'keep' closes the tab without killing its agent", () => {
    seed("keep");
    s().requestCloseCanvas("c-full");
    expect(s().canvasClosePromptId).toBeNull();
    expect(s().canvases.some((c) => c.id === "c-full")).toBe(false);
    expect(s().sessions.some((x) => x.id === "a1")).toBe(true); // agent survives
  });

  it("confirming kill drops the tab's agent from sessions and closes the tab", async () => {
    seed("ask");
    s().requestCloseCanvas("c-full");
    await s().confirmCloseCanvas("c-full", true);
    expect(s().canvasClosePromptId).toBeNull();
    expect(s().canvases.some((c) => c.id === "c-full")).toBe(false);
    expect(s().sessions.some((x) => x.id === "a1")).toBe(false); // killed + dropped
  });
});

describe("left panel as source of truth (#152)", () => {
  const s = () => useStore.getState();
  const leaf = (id: string, content: CanvasContent): CanvasNode => ({
    type: "leaf",
    id,
    content,
  });
  const split = (a: CanvasNode, b: CanvasNode): CanvasNode => ({
    type: "split",
    id: "sp",
    dir: "row",
    sizes: [50, 50],
    a,
    b,
  });

  it("removeOverviewPanel cascades into every Canvas tab showing the item", async () => {
    // A file panel in the left panel, shown in a Canvas leaf beside a terminal.
    useStore.setState({
      overviewPanels: {
        "/repo/x": [{ id: "p1", kind: "markdown", file: "a.md" }],
      },
      canvases: [
        {
          id: "c1",
          name: "C1",
          layout: split(
            leaf("lf", { kind: "file", repoPath: "/repo/x", file: "a.md" }),
            leaf("lt", {
              kind: "terminal",
              repoPath: "/repo/x",
              sessionId: "t9",
            }),
          ),
        },
      ],
      activeCanvasId: "c1",
    });
    await s().removeOverviewPanel("/repo/x", "p1");
    // Gone from the left panel (Overview mirrors this) ...
    expect(s().overviewPanels["/repo/x"]).toBeUndefined();
    // ... and the Canvas split collapsed to the surviving terminal leaf.
    const leaves = collectLeaves(s().canvases[0]?.layout ?? null);
    expect(leaves.map((l) => l.content.kind)).toEqual(["terminal"]);
  });

  it("dropSession cascades agent leaves out of Canvas, keeping siblings", () => {
    useStore.setState({
      sessions: [session("a1")],
      canvases: [
        {
          id: "c1",
          name: "C1",
          layout: split(
            leaf("la", {
              kind: "agent",
              sessionId: "a1",
              repoPath: "/repo/a1",
            }),
            leaf("lb", {
              kind: "agent",
              sessionId: "a2",
              repoPath: "/repo/a2",
            }),
          ),
        },
      ],
      activeCanvasId: "c1",
    });
    s().dropSession("a1");
    const leaves = collectLeaves(s().canvases[0]?.layout ?? null);
    expect(leaves.map((l) => l.content.sessionId)).toEqual(["a2"]);
  });

  it("cancelSchedule removes the schedule's Canvas panel", async () => {
    useStore.setState({
      schedules: [{ id: "sch1", cwd: "/repo/x", fire_at: 0, created_at: 0 }],
      canvases: [
        {
          id: "c1",
          name: "C1",
          layout: leaf("ls", {
            kind: "scheduled",
            scheduleId: "sch1",
            repoPath: "/repo/x",
          }),
        },
      ],
      activeCanvasId: "c1",
    });
    await s().cancelSchedule("sch1");
    expect(s().schedules).toHaveLength(0);
    expect(collectLeaves(s().canvases[0]?.layout ?? null)).toHaveLength(0);
  });

  it("startScheduleNow fires the schedule and does not toast on success (#269)", async () => {
    const spy = vi.spyOn(ipc, "fireScheduleNow").mockResolvedValue();
    useStore.setState({
      schedules: [{ id: "sch1", cwd: "/repo/x", fire_at: 0, created_at: 0 }],
      toasts: [],
    });
    await s().startScheduleNow("sch1");
    expect(spy).toHaveBeenCalledWith("sch1");
    // The scheduled→live transition is driven by the `schedule://fired` event
    // (onFired), not by this action — so no optimistic removal and no toast here.
    expect(s().toasts).toHaveLength(0);
  });

  it("startScheduleNow toasts the error and leaves the schedule intact on failure (#269)", async () => {
    vi.spyOn(ipc, "fireScheduleNow").mockRejectedValue({
      kind: "Spawn",
      message: "boom",
    });
    useStore.setState({
      schedules: [{ id: "sch1", cwd: "/repo/x", fire_at: 0, created_at: 0 }],
      toasts: [],
    });
    await s().startScheduleNow("sch1");
    // The schedule stays (the backend keeps it; onFired never ran), and the error
    // surfaces as a toast.
    expect(s().schedules).toHaveLength(1);
    expect(s().toasts.at(-1)?.message).toBe("boom");
    expect(s().toasts.at(-1)?.tone).toBe("error");
  });

  it("leaves unrelated Canvas panels untouched", async () => {
    useStore.setState({
      overviewPanels: { "/repo/x": [{ id: "p1", kind: "diff" }] },
      canvases: [
        {
          id: "c1",
          name: "C1",
          layout: leaf("lf", {
            kind: "file",
            repoPath: "/repo/x",
            file: "a.md",
          }),
        },
      ],
      activeCanvasId: "c1",
    });
    // Removing the diff panel must not disturb the unrelated file leaf.
    await s().removeOverviewPanel("/repo/x", "p1");
    expect(collectLeaves(s().canvases[0]?.layout ?? null)).toHaveLength(1);
  });
});

describe("openSessionInCanvas (#153)", () => {
  const s = () => useStore.getState();
  const agentLeaf = (id: string, sessionId: string): CanvasNode => ({
    type: "leaf",
    id,
    content: { kind: "agent", sessionId, repoPath: `/repo/${sessionId}` },
  });

  it("creates a new 'Canvas N' tab when the agent isn't in any canvas", () => {
    useStore.setState({
      sessions: [session("a1")],
      canvases: [{ id: "c1", name: "Canvas 1", layout: null }],
      activeCanvasId: "c1",
      view: "overview",
      detachedCanvasIds: [],
    });
    s().openSessionInCanvas("a1");
    const st = s();
    expect(st.canvases).toHaveLength(2);
    const tab = st.canvases[1];
    expect(tab?.name).toBe("Canvas 2");
    expect(st.activeCanvasId).toBe(tab?.id);
    expect(st.view).toBe("canvas");
    const leaves = collectLeaves(tab?.layout ?? null);
    expect(leaves).toHaveLength(1);
    expect(leaves[0]?.content).toMatchObject({
      kind: "agent",
      sessionId: "a1",
    });
    expect(st.activeLeafId).toBe(leaves[0]?.id);
    expect(st.selectedId).toBe("a1");
  });

  it("focuses the agent's existing tab instead of duplicating it", () => {
    useStore.setState({
      sessions: [session("a1")],
      canvases: [
        { id: "c1", name: "Canvas 1", layout: null },
        { id: "c2", name: "Canvas 2", layout: agentLeaf("L", "a1") },
      ],
      activeCanvasId: "c1",
      view: "overview",
      detachedCanvasIds: [],
    });
    s().openSessionInCanvas("a1");
    const st = s();
    expect(st.canvases).toHaveLength(2); // no new tab
    expect(st.activeCanvasId).toBe("c2");
    expect(st.activeLeafId).toBe("L");
    expect(st.view).toBe("canvas");
    expect(st.selectedId).toBe("a1");
  });

  it("raises a detached window without switching the main view (#84)", () => {
    useStore.setState({
      sessions: [session("a1")],
      canvases: [
        { id: "c1", name: "Canvas 1", layout: null },
        { id: "c2", name: "Canvas 2", layout: agentLeaf("L", "a1") },
      ],
      activeCanvasId: "c1",
      view: "overview",
      detachedCanvasIds: ["c2"],
    });
    s().openSessionInCanvas("a1");
    const st = s();
    expect(st.canvases).toHaveLength(2); // no new tab
    expect(st.view).toBe("overview"); // main view unchanged
    expect(st.activeCanvasId).toBe("c1"); // unchanged
    expect(st.selectedId).toBe("a1"); // row still highlighted
  });
});

describe("mergeSettings (#100/#176)", () => {
  it("defaults the Overview panel min width to 400px", () => {
    expect(DEFAULT_SETTINGS.overviewPanelMinWidth).toBe(400);
  });

  it("back-fills a newly-added key for an older persisted blob", () => {
    // A pre-#176 blob (no overviewPanelMinWidth) upgrades cleanly to the default.
    const old = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
    delete old.overviewPanelMinWidth;
    const merged = mergeSettings(old as Partial<typeof DEFAULT_SETTINGS>);
    expect(merged.overviewPanelMinWidth).toBe(400);
    // A persisted value is preserved over the default.
    expect(
      mergeSettings({ overviewPanelMinWidth: 520 }).overviewPanelMinWidth,
    ).toBe(520);
  });
});

describe("openFileFromTree (#175)", () => {
  const s = () => useStore.getState();
  const fileLeaf = (
    id: string,
    repoPath: string,
    file: string,
  ): CanvasNode => ({
    type: "leaf",
    id,
    content: { kind: "file", repoPath, file },
  });

  it("Overview, file not open: adds a markdown column and selects it", async () => {
    useStore.setState({
      view: "overview",
      overviewPanels: {},
      selectedId: null,
    });
    await s().openFileFromTree("/repo/a", "notes.md", "markdown");
    const st = s();
    const panels = st.overviewPanels["/repo/a"] ?? [];
    expect(panels).toHaveLength(1);
    expect(panels[0]).toMatchObject({ kind: "markdown", file: "notes.md" });
    expect(st.selectedId).toBe(panels[0]?.id);
  });

  it("Overview, file already open: jumps to the existing column, no duplicate", async () => {
    useStore.setState({
      view: "overview",
      overviewPanels: {
        "/repo/a": [{ id: "p1", kind: "markdown", file: "notes.md" }],
      },
      selectedId: null,
    });
    await s().openFileFromTree("/repo/a", "notes.md", "markdown");
    const st = s();
    expect(st.overviewPanels["/repo/a"]).toHaveLength(1); // no duplicate
    expect(st.selectedId).toBe("p1");
  });

  it("Canvas, file not a leaf: registers the panel and appends a leaf to the active tab", async () => {
    useStore.setState({
      view: "canvas",
      canvases: [{ id: "canvas-1", name: "Canvas 1", layout: null }],
      activeCanvasId: "canvas-1",
      overviewPanels: {},
      detachedCanvasIds: [],
      selectedId: null,
      activeLeafId: null,
    });
    await s().openFileFromTree("/repo/a", "notes.md", "markdown");
    const st = s();
    // Registered in the source of truth (sidebar + Overview + #152 cascade).
    const panels = st.overviewPanels["/repo/a"] ?? [];
    expect(panels).toHaveLength(1);
    expect(panels[0]).toMatchObject({ kind: "markdown", file: "notes.md" });
    // Appended as a {kind:"file"} leaf in the active tab, focused + selected.
    const leaves = collectLeaves(st.canvases[0]?.layout ?? null);
    expect(leaves).toHaveLength(1);
    expect(leaves[0]?.content).toMatchObject({
      kind: "file",
      repoPath: "/repo/a",
      file: "notes.md",
    });
    expect(st.activeLeafId).toBe(leaves[0]?.id);
    expect(st.selectedId).toBe(panels[0]?.id);
  });

  it("Canvas, file already a leaf in the active tab: focuses it, no second leaf or panel", async () => {
    useStore.setState({
      view: "canvas",
      canvases: [
        {
          id: "canvas-1",
          name: "Canvas 1",
          layout: fileLeaf("L", "/repo/a", "notes.md"),
        },
      ],
      activeCanvasId: "canvas-1",
      overviewPanels: {
        "/repo/a": [{ id: "p1", kind: "markdown", file: "notes.md" }],
      },
      detachedCanvasIds: [],
      selectedId: null,
      activeLeafId: null,
    });
    await s().openFileFromTree("/repo/a", "notes.md", "markdown");
    const st = s();
    const leaves = collectLeaves(st.canvases[0]?.layout ?? null);
    expect(leaves).toHaveLength(1); // no second leaf
    expect(st.overviewPanels["/repo/a"]).toHaveLength(1); // no duplicate panel
    expect(st.activeLeafId).toBe("L");
    expect(st.selectedId).toBe("p1");
  });

  it("Canvas, leaf lives in a detached tab: raises that window, no main-view switch (#84)", async () => {
    useStore.setState({
      view: "canvas",
      canvases: [
        { id: "canvas-1", name: "Canvas 1", layout: null },
        {
          id: "c2",
          name: "Canvas 2",
          layout: fileLeaf("L", "/repo/a", "notes.md"),
        },
      ],
      activeCanvasId: "canvas-1",
      overviewPanels: {
        "/repo/a": [{ id: "p1", kind: "markdown", file: "notes.md" }],
      },
      detachedCanvasIds: ["c2"],
      selectedId: null,
      activeLeafId: null,
    });
    const focusSpy = vi.spyOn(s(), "focusCanvasWindow");
    await s().openFileFromTree("/repo/a", "notes.md", "markdown");
    const st = s();
    expect(focusSpy).toHaveBeenCalledWith("c2");
    expect(st.activeCanvasId).toBe("canvas-1"); // main view's active tab unchanged
    expect(st.selectedId).toBe("p1");
    // Nothing appended to the main tab.
    expect(collectLeaves(st.canvases[0]?.layout ?? null)).toHaveLength(0);
    focusSpy.mockRestore();
  });

  it("addOverviewPanel returns the new id on add and the existing id on a dedup hit", async () => {
    useStore.setState({ overviewPanels: {} });
    const id1 = await s().addOverviewPanel("/repo/a", "markdown", "notes.md");
    expect(typeof id1).toBe("string");
    const id2 = await s().addOverviewPanel("/repo/a", "markdown", "notes.md");
    expect(id2).toBe(id1); // dedup hit returns the existing id
    expect(s().overviewPanels["/repo/a"]).toHaveLength(1);
  });
});

describe("forkability gating (#138)", () => {
  const s = () => useStore.getState();

  it("setForkable updates the session flag and is a no-op for an unknown id", () => {
    useStore.setState({ sessions: [session("f1")] });
    // Seeded undefined (fail-open → forkable in the UI); setForkable flips it.
    s().setForkable("f1", false);
    expect(s().sessions.find((x) => x.id === "f1")?.forkable).toBe(false);
    s().setForkable("f1", true);
    expect(s().sessions.find((x) => x.id === "f1")?.forkable).toBe(true);
    // An unknown id (e.g. a shell terminal also poked by the title worker) is a no-op.
    s().setForkable("missing", false);
    expect(s().sessions).toHaveLength(1);
  });
});

describe("isClaudeActive — usage bar gate (#154)", () => {
  const withAgent = (id: string, agent?: string): SessionView => ({
    ...session(id),
    ...(agent ? { agent } : {}),
  });

  it("is true when every session is Claude or a legacy null agent", () => {
    useStore.setState({
      sessions: [withAgent("a", "claude"), withAgent("b")],
    });
    expect(isClaudeActive(useStore.getState())).toBe(true);
  });

  it("is false when a Codex or OpenCode session is active", () => {
    useStore.setState({ sessions: [withAgent("a", "opencode")] });
    expect(isClaudeActive(useStore.getState())).toBe(false);
    useStore.setState({ sessions: [withAgent("a", "codex"), withAgent("b")] });
    expect(isClaudeActive(useStore.getState())).toBe(false);
  });
});

describe("first-launch agent onboarding", () => {
  const s = () => useStore.getState();
  const info = (id: string, installed: boolean): AgentInfo => ({
    id,
    display_name: id === "opencode" ? "OpenCode" : id,
    binary_name: id,
    install_hint: "",
    supports_resume: false,
    supports_auto_name: false,
    version: installed ? "1.0.0" : null,
  });

  beforeEach(() => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, onboarded: false },
      onboardingOpen: false,
      onboardingChoices: [],
    });
    vi.restoreAllMocks();
  });

  it("opens the picker with the installed agents when 2+ are present", async () => {
    vi.spyOn(ipc, "agentInfo").mockImplementation(async (id: string) =>
      info(id, id !== "opencode"),
    );
    await s().maybeOnboardAgent();
    expect(s().onboardingOpen).toBe(true);
    expect(s().onboardingChoices.map((c) => c.id)).toEqual(["claude", "codex"]);
    // The user hasn't picked yet, so onboarded stays false until they do.
    expect(s().settings.onboarded).toBe(false);
  });

  it("auto-selects the sole installed agent without a modal", async () => {
    vi.spyOn(ipc, "agentInfo").mockImplementation(async (id: string) =>
      info(id, id === "codex"),
    );
    await s().maybeOnboardAgent();
    expect(s().onboardingOpen).toBe(false);
    expect(s().settings.defaultAgent).toBe("codex");
    expect(s().settings.onboarded).toBe(true);
  });

  it("does nothing (and re-checks next launch) when no agent is installed", async () => {
    vi.spyOn(ipc, "agentInfo").mockImplementation(async (id: string) =>
      info(id, false),
    );
    await s().maybeOnboardAgent();
    expect(s().onboardingOpen).toBe(false);
    expect(s().settings.onboarded).toBe(false);
  });

  it("skips entirely once already onboarded", async () => {
    useStore.setState({ settings: { ...DEFAULT_SETTINGS, onboarded: true } });
    const spy = vi.spyOn(ipc, "agentInfo");
    await s().maybeOnboardAgent();
    expect(spy).not.toHaveBeenCalled();
  });

  it("chooseOnboardingAgent records the default, marks onboarded, and closes", async () => {
    useStore.setState({ onboardingOpen: true });
    await s().chooseOnboardingAgent("opencode");
    expect(s().settings.defaultAgent).toBe("opencode");
    expect(s().settings.onboarded).toBe(true);
    expect(s().onboardingOpen).toBe(false);
  });

  it("dismissOnboarding keeps the current default but marks onboarded", () => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, defaultAgent: "claude" },
      onboardingOpen: true,
    });
    s().dismissOnboarding();
    expect(s().settings.defaultAgent).toBe("claude");
    expect(s().settings.onboarded).toBe(true);
    expect(s().onboardingOpen).toBe(false);
  });
});

describe("contentForSelected (#284, big-mode keybind resolution)", () => {
  // Minimal store-shaped state for the pure helper. Each field defaults empty; a
  // test overrides only what it needs.
  const base = {
    selectedId: null as string | null,
    canvases: [
      { id: "canvas-1", name: "Canvas 1", layout: null as CanvasNode | null },
    ],
    activeCanvasId: "canvas-1",
    sessions: [] as SessionView[],
    schedules: [] as ScheduledSession[],
    overviewPanels: {} as Record<string, OverviewPanel[]>,
  };

  it("returns null when nothing is selected", () => {
    expect(contentForSelected({ ...base, selectedId: null })).toBeNull();
  });

  it("returns null for an unknown selected id", () => {
    expect(contentForSelected({ ...base, selectedId: "nope" })).toBeNull();
  });

  it("resolves a selected session id to an agent content", () => {
    const sess: SessionView = {
      id: "s1",
      claudeSessionId: "s1",
      repoPath: "/repo/a",
      name: null,
      createdAt: 0,
    };
    expect(
      contentForSelected({ ...base, selectedId: "s1", sessions: [sess] }),
    ).toEqual({ kind: "agent", sessionId: "s1", repoPath: "/repo/a" });
  });

  it("resolves a selected schedule id to a scheduled content (repoPath = cwd)", () => {
    const sch: ScheduledSession = {
      id: "sch1",
      cwd: "/repo/b",
      fire_at: 0,
      created_at: 0,
    };
    expect(
      contentForSelected({ ...base, selectedId: "sch1", schedules: [sch] }),
    ).toEqual({ kind: "scheduled", scheduleId: "sch1", repoPath: "/repo/b" });
  });

  it("resolves a selected markdown panel id via overviewPanelToContent", () => {
    const panels: Record<string, OverviewPanel[]> = {
      "/repo/c": [{ id: "p1", kind: "markdown", file: "README.md" }],
    };
    expect(
      contentForSelected({
        ...base,
        selectedId: "p1",
        overviewPanels: panels,
      }),
    ).toEqual({ kind: "file", repoPath: "/repo/c", file: "README.md" });
  });

  it("resolves a selected diff/terminal/kanban/filetree panel id", () => {
    const panels: Record<string, OverviewPanel[]> = {
      "/repo/c": [
        { id: "pd", kind: "diff" },
        { id: "pt", kind: "terminal" },
        { id: "pk", kind: "kanban", file: "board.md" },
        { id: "pf", kind: "filetree" },
      ],
    };
    const pick = (id: string) =>
      contentForSelected({ ...base, selectedId: id, overviewPanels: panels });
    expect(pick("pd")).toEqual({ kind: "diff", repoPath: "/repo/c" });
    expect(pick("pt")).toEqual({
      kind: "terminal",
      sessionId: "pt",
      repoPath: "/repo/c",
    });
    expect(pick("pk")).toEqual({
      kind: "kanban",
      repoPath: "/repo/c",
      file: "board.md",
    });
    expect(pick("pf")).toEqual({ kind: "filetree", repoPath: "/repo/c" });
  });

  it("preserves a worktree-keyed repoPath for the panel's map key", () => {
    const panels: Record<string, OverviewPanel[]> = {
      "/repo/c/.worktrees/feat": [{ id: "pd", kind: "diff" }],
    };
    expect(
      contentForSelected({ ...base, selectedId: "pd", overviewPanels: panels }),
    ).toEqual({ kind: "diff", repoPath: "/repo/c/.worktrees/feat" });
  });

  it("returns the active Canvas leaf's content verbatim when it maps to the selection", () => {
    const leafContent = {
      kind: "agent",
      sessionId: "s9",
      repoPath: "/repo/z",
    };
    const layout: CanvasNode = {
      type: "leaf",
      id: "leaf-abc",
      content: leafContent,
    };
    const sess: SessionView = {
      id: "s9",
      claudeSessionId: "s9",
      repoPath: "/repo/z",
      name: null,
      createdAt: 0,
    };
    const result = contentForSelected({
      ...base,
      selectedId: "s9", // the item id (leafItemId), not the leaf id
      canvases: [{ id: "canvas-1", name: "Canvas 1", layout }],
      sessions: [sess],
    });
    // The exact leaf content object is returned (no reconstruction).
    expect(result).toBe(leafContent);
  });
});

describe("toggleMaximizeSelected (#284)", () => {
  const s = () => useStore.getState();

  it("opens big mode for the selected session when closed", () => {
    useStore.setState({
      sessions: [
        {
          id: "s1",
          claudeSessionId: "s1",
          repoPath: "/repo/a",
          name: null,
          createdAt: 0,
        },
      ],
      selectedId: "s1",
      maximizedItem: null,
    });
    s().toggleMaximizeSelected();
    expect(s().maximizedItem).toEqual({
      kind: "agent",
      sessionId: "s1",
      repoPath: "/repo/a",
    });
  });

  it("closes big mode (same chord) regardless of selection when already open", () => {
    useStore.setState({
      selectedId: null,
      maximizedItem: { kind: "diff", repoPath: "/repo/a" },
    });
    s().toggleMaximizeSelected();
    expect(s().maximizedItem).toBeNull();
  });

  it("is a no-op when closed and nothing maximizable is selected", () => {
    useStore.setState({ selectedId: null, maximizedItem: null });
    s().toggleMaximizeSelected();
    expect(s().maximizedItem).toBeNull();
  });
});

describe("cloneRepo (#295)", () => {
  const s = () => useStore.getState();

  it("open/close toggle the modal flag", () => {
    expect(s().cloneRepoOpen).toBe(false);
    s().openCloneRepo();
    expect(s().cloneRepoOpen).toBe(true);
    s().closeCloneRepo();
    expect(s().cloneRepoOpen).toBe(false);
  });

  it("on success prepends the dest to recents and starts a session there", async () => {
    const cloneSpy = vi
      .spyOn(ipc, "cloneRepo")
      .mockResolvedValue("/parent/repo");
    // Isolate the action from the real spawn (host-less): stub the store's own
    // `spawnSession` (which cloneRepo delegates to) with a resolving spy.
    const spawnSpy = vi.fn().mockResolvedValue(true);
    useStore.setState({ recents: ["/existing"], spawnSession: spawnSpy });

    const result = await s().cloneRepo(
      "https://github.com/owner/repo.git",
      "/parent",
    );

    expect(result).toBe(true);
    expect(cloneSpy).toHaveBeenCalledWith(
      "https://github.com/owner/repo.git",
      "/parent",
    );
    // Dest is prepended (and the old recent kept).
    expect(s().recents).toEqual(["/parent/repo", "/existing"]);
    expect(spawnSpy).toHaveBeenCalledWith("/parent/repo");
    expect(s().toasts.at(-1)?.message).toBe("Cloned repo");
  });

  it("on failure returns the git error and adds no recent / no session", async () => {
    vi.spyOn(ipc, "cloneRepo").mockRejectedValue({
      kind: "Git",
      message: "fatal: repository not found",
    });
    const spawnSpy = vi.fn().mockResolvedValue(true);
    useStore.setState({ recents: [], spawnSession: spawnSpy });

    const result = await s().cloneRepo("https://bad/url.git", "/parent");

    expect(result).toBe("fatal: repository not found");
    expect(s().recents).toEqual([]);
    expect(spawnSpy).not.toHaveBeenCalled();
  });
});
