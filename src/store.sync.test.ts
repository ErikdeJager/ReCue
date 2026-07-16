// Cross-window state sync (task 428): the apply-sync actions + the pure
// `diffSessionRoster` roster reconcile. The backend broadcasts each "quiet"
// persisted slice's full new value (`commands.rs broadcast_*`); every window
// applies it through these actions. Two invariants are pinned here:
//   1. Each apply is JSON-equality-guarded — an identical value (the mutating
//      window's own echo) leaves the state OBJECT untouched (no `set()` at all).
//   2. No apply ever calls back into an `ipc` persist path — the no-echo-loop
//      invariant (spies assert zero calls).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { claimKey } from "./fileClaims";
import {
  cancelAllAttentionTimers,
  DEFAULT_SETTINGS,
  diffSessionRoster,
  SIDEBAR_WIDTH_DEFAULT,
  toSessionView,
  useStore,
} from "./store";
import type { SessionRecord, SessionView } from "./types";
import * as ipc from "./ipc";

/** A minimal persisted record (the backend shape). */
function record(id: string, name: string | null = null): SessionRecord {
  return {
    id,
    claude_session_id: id,
    repo_path: `/repo/${id}`,
    name,
    created_at: 0,
  };
}

/** Spy every ipc persist path an apply-sync could conceivably echo into (plus the
 * task-435 claim mutations — an apply must never claim/release either). */
function spyPersistPaths() {
  return [
    vi.spyOn(ipc, "setSettings"),
    vi.spyOn(ipc, "setDiffSeen"),
    vi.spyOn(ipc, "setRepoOrder"),
    vi.spyOn(ipc, "setRepoColor"),
    vi.spyOn(ipc, "setOverviewPanels"),
    vi.spyOn(ipc, "setOverviewOrder"),
    vi.spyOn(ipc, "setSidebarWidth"),
    vi.spyOn(ipc, "setSidebarCollapsed"),
    vi.spyOn(ipc, "setCanvasTemplates"),
    vi.spyOn(ipc, "setCanvases"),
    vi.spyOn(ipc, "removeRecent"),
    vi.spyOn(ipc, "addRecent"),
    vi.spyOn(ipc, "clearRecents"),
    vi.spyOn(ipc, "renameSession"),
    vi.spyOn(ipc, "killSession"),
    vi.spyOn(ipc, "claimFile"),
    vi.spyOn(ipc, "releaseFileClaim"),
  ].map((spy) => spy.mockResolvedValue(undefined as never));
}

beforeEach(() => {
  vi.useRealTimers();
  // Drop any admission-grace timers a prior test armed (module-level, #398).
  cancelAllAttentionTimers();
  useStore.setState({
    sessions: [],
    selectedId: null,
    view: "overview",
    recents: [],
    repoColors: {},
    overviewPanels: {},
    overviewOrder: {},
    canvases: [{ id: "canvas-1", name: "Canvas 1", layout: null }],
    activeCanvasId: "canvas-1",
    canvasTemplates: [],
    settings: { ...DEFAULT_SETTINGS },
    sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
    sidebarCollapsed: false,
    folderOrder: [],
    diffSeen: {},
    fileClaims: {},
    sessionBusy: {},
    sessionActive: {},
    sessionIdleSince: {},
    dismissedAttention: {},
    attentionEligible: {},
  });
});

afterEach(() => {
  cancelAllAttentionTimers();
  vi.restoreAllMocks();
});

describe("apply-sync actions (task 428)", () => {
  it("never calls any ipc persist path (the no-echo-loop invariant)", () => {
    const spies = spyPersistPaths();
    const s = useStore.getState();
    // Run every apply with a *changed* value (the non-no-op path — the one that
    // would echo if an apply ever persisted).
    s.applySettingsSync({ theme: "light" });
    s.applyRecentsSync(["/repo/x"]);
    s.applyDiffSeenSync({ "/repo/x": { "a.ts": "digest" } });
    s.applyRepoOrderSync(["/repo/x"]);
    s.applyRepoColorsSync({ "/repo/x": "#fab387" });
    s.applyOverviewPanelsSync({
      "/repo/x": [{ id: "p1", kind: "diff" }],
    });
    s.applyOverviewOrderSync({ "/repo/x": ["p1"] });
    s.applySidebarWidthSync(300);
    s.applySidebarCollapsedSync(true);
    s.applyCanvasTemplatesSync([{ id: "t1", name: "T", layout: null }]);
    s.applyFileClaimsSync([
      { repo_path: "/repo/x", file: "notes.md", window: "canvas-1" },
    ]);
    useStore.getState().applySessionsSync([record("a")]);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("applyRecentsSync updates on change and is a no-op on an identical echo", () => {
    useStore.getState().applyRecentsSync(["/repo/a", "/repo/b"]);
    expect(useStore.getState().recents).toEqual(["/repo/a", "/repo/b"]);
    const before = useStore.getState();
    // The echo: same value, different array instance — the guard must skip set().
    useStore.getState().applyRecentsSync(["/repo/a", "/repo/b"]);
    expect(useStore.getState()).toBe(before);
  });

  it("applyDiffSeenSync updates, normalizes null to {}, and no-ops on an echo", () => {
    useStore.getState().applyDiffSeenSync({ "/r": { "f.ts": "d1" } });
    expect(useStore.getState().diffSeen).toEqual({ "/r": { "f.ts": "d1" } });
    const before = useStore.getState();
    useStore.getState().applyDiffSeenSync({ "/r": { "f.ts": "d1" } });
    expect(useStore.getState()).toBe(before);
    // `null` = never written → empty map.
    useStore.getState().applyDiffSeenSync(null);
    expect(useStore.getState().diffSeen).toEqual({});
    // …and a null echo onto an already-empty map is a no-op too.
    const after = useStore.getState();
    useStore.getState().applyDiffSeenSync(null);
    expect(useStore.getState()).toBe(after);
  });

  it("applyRepoOrderSync updates folderOrder and no-ops on an echo", () => {
    useStore.getState().applyRepoOrderSync(["/b", "/a"]);
    expect(useStore.getState().folderOrder).toEqual(["/b", "/a"]);
    const before = useStore.getState();
    useStore.getState().applyRepoOrderSync(["/b", "/a"]);
    expect(useStore.getState()).toBe(before);
  });

  it("applyRepoColorsSync updates and no-ops on an echo", () => {
    useStore.getState().applyRepoColorsSync({ "/a": "#fab387" });
    expect(useStore.getState().repoColors).toEqual({ "/a": "#fab387" });
    const before = useStore.getState();
    useStore.getState().applyRepoColorsSync({ "/a": "#fab387" });
    expect(useStore.getState()).toBe(before);
  });

  it("applyOverviewPanelsSync replaces the map wholesale and no-ops on an echo", () => {
    const panels = { "/a": [{ id: "p1", kind: "terminal" as const }] };
    useStore.getState().applyOverviewPanelsSync(panels);
    expect(useStore.getState().overviewPanels).toEqual(panels);
    const before = useStore.getState();
    useStore
      .getState()
      .applyOverviewPanelsSync({ "/a": [{ id: "p1", kind: "terminal" }] });
    expect(useStore.getState()).toBe(before);
  });

  it("applyOverviewOrderSync replaces the map wholesale and no-ops on an echo", () => {
    useStore.getState().applyOverviewOrderSync({ "/a": ["x", "y"] });
    expect(useStore.getState().overviewOrder).toEqual({ "/a": ["x", "y"] });
    const before = useStore.getState();
    useStore.getState().applyOverviewOrderSync({ "/a": ["x", "y"] });
    expect(useStore.getState()).toBe(before);
  });

  it("applySidebarWidthSync clamps to the range and defaults null", () => {
    // Over the max → clamped to 560 (the [180, 560] range, #108).
    useStore.getState().applySidebarWidthSync(5000);
    expect(useStore.getState().sidebarWidth).toBe(560);
    // `null` (never persisted) → the default (248).
    useStore.getState().applySidebarWidthSync(null);
    expect(useStore.getState().sidebarWidth).toBe(SIDEBAR_WIDTH_DEFAULT);
    // Echo of the current value → no-op.
    const before = useStore.getState();
    useStore.getState().applySidebarWidthSync(SIDEBAR_WIDTH_DEFAULT);
    expect(useStore.getState()).toBe(before);
  });

  it("applySidebarCollapsedSync updates and defaults null to expanded", () => {
    useStore.getState().applySidebarCollapsedSync(true);
    expect(useStore.getState().sidebarCollapsed).toBe(true);
    useStore.getState().applySidebarCollapsedSync(null);
    expect(useStore.getState().sidebarCollapsed).toBe(false);
    const before = useStore.getState();
    useStore.getState().applySidebarCollapsedSync(false);
    expect(useStore.getState()).toBe(before);
  });

  it("applyCanvasTemplatesSync updates, defaults null to [], and no-ops on an echo", () => {
    const templates = [{ id: "t1", name: "T", layout: null }];
    useStore.getState().applyCanvasTemplatesSync(templates);
    expect(useStore.getState().canvasTemplates).toEqual(templates);
    const before = useStore.getState();
    useStore
      .getState()
      .applyCanvasTemplatesSync([{ id: "t1", name: "T", layout: null }]);
    expect(useStore.getState()).toBe(before);
    // `null` (never written) → none — a change from the current one template.
    useStore.getState().applyCanvasTemplatesSync(null);
    expect(useStore.getState().canvasTemplates).toEqual([]);
  });

  it("applySettingsSync merges a partial blob over the defaults", () => {
    useStore.getState().applySettingsSync({ theme: "light" });
    expect(useStore.getState().settings).toEqual({
      ...DEFAULT_SETTINGS,
      theme: "light",
    });
  });

  it("applyFileClaimsSync mirrors the claim list, no-ops on an echo, never persists or claims", () => {
    const spies = spyPersistPaths();
    useStore.getState().applyFileClaimsSync([
      { repo_path: "/repo/x", file: "notes.md", window: "canvas-1" },
      { repo_path: "/repo/x", file: "board.md", window: "main" },
    ]);
    // claimKey = repoPath + NUL + file (see fileClaims.ts).
    expect(useStore.getState().fileClaims).toEqual({
      [claimKey("/repo/x", "notes.md")]: "canvas-1",
      [claimKey("/repo/x", "board.md")]: "main",
    });
    // The echo: an equal list (new array/object instances) must skip set().
    const before = useStore.getState();
    useStore.getState().applyFileClaimsSync([
      { repo_path: "/repo/x", file: "notes.md", window: "canvas-1" },
      { repo_path: "/repo/x", file: "board.md", window: "main" },
    ]);
    expect(useStore.getState()).toBe(before);
    // An empty broadcast clears the transient map.
    useStore.getState().applyFileClaimsSync([]);
    expect(useStore.getState().fileClaims).toEqual({});
    // Apply-only: no persist path AND no claim/release echo (the 428 invariant).
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("applySettingsSync is a no-op on an identical (merged) echo", () => {
    useStore.getState().applySettingsSync({ theme: "light" });
    const before = useStore.getState();
    // The sender's echo arrives as the same partial blob → merges identically.
    useStore.getState().applySettingsSync({ theme: "light" });
    expect(useStore.getState()).toBe(before);
    // A blob equal to the defaults applied onto default settings: also a no-op.
    useStore.setState({ settings: { ...DEFAULT_SETTINGS } });
    const defaults = useStore.getState();
    useStore.getState().applySettingsSync(null);
    expect(useStore.getState()).toBe(defaults);
  });
});

describe("diffSessionRoster (task 428)", () => {
  it("returns a complete no-op plan for an identical roster", () => {
    const local = [toSessionView(record("a")), toSessionView(record("b"))];
    const plan = diffSessionRoster(local, [record("a"), record("b")]);
    expect(plan).toEqual({ removed: [], added: [], merged: null });
  });

  it("reports roster records absent locally as added", () => {
    const local = [toSessionView(record("a"))];
    const plan = diffSessionRoster(local, [record("a"), record("c")]);
    expect(plan.added.map((r) => r.id)).toEqual(["c"]);
    expect(plan.removed).toEqual([]);
    expect(plan.merged).toBeNull();
  });

  it("reports local ids absent from the roster as removed", () => {
    const local = [toSessionView(record("a")), toSessionView(record("b"))];
    const plan = diffSessionRoster(local, [record("a")]);
    expect(plan.removed).toEqual(["b"]);
    expect(plan.added).toEqual([]);
    expect(plan.merged).toBeNull();
  });

  it("merges a rename while preserving the view-only live fields", () => {
    const liveView: SessionView = {
      ...toSessionView(record("a")),
      reconnecting: true,
      exitedCode: 3,
    };
    const plan = diffSessionRoster(
      [liveView, toSessionView(record("b"))],
      [record("a", "Renamed"), record("b")],
    );
    expect(plan.removed).toEqual([]);
    expect(plan.added).toEqual([]);
    expect(plan.merged).not.toBeNull();
    const mergedA = plan.merged?.find((v) => v.id === "a");
    // Record-derived field refreshed from the roster…
    expect(mergedA?.name).toBe("Renamed");
    // …while the view-only live fields survive the merge.
    expect(mergedA?.reconnecting).toBe(true);
    expect(mergedA?.exitedCode).toBe(3);
  });

  it("keeps an unchanged view's object identity inside a changed merge", () => {
    const a = toSessionView(record("a"));
    const b = toSessionView(record("b"));
    const plan = diffSessionRoster(
      [a, b],
      [record("a", "Renamed"), record("b")],
    );
    // `b` didn't change — the merged array must reuse the exact same object so
    // React re-renders only the renamed card.
    expect(plan.merged?.find((v) => v.id === "b")).toBe(b);
  });

  it("excludes removed and added ids from the merged survivors", () => {
    const a = toSessionView(record("a"));
    const gone = toSessionView(record("gone"));
    const plan = diffSessionRoster(
      [a, gone],
      [record("a", "Renamed"), record("new")],
    );
    expect(plan.removed).toEqual(["gone"]);
    expect(plan.added.map((r) => r.id)).toEqual(["new"]);
    expect(plan.merged?.map((v) => v.id)).toEqual(["a"]);
  });
});

describe("applySessionsSync (task 428)", () => {
  it("is a complete no-op on an identical roster", () => {
    useStore.setState({
      sessions: [toSessionView(record("a")), toSessionView(record("b"))],
    });
    const before = useStore.getState();
    useStore.getState().applySessionsSync([record("a"), record("b")]);
    expect(useStore.getState()).toBe(before);
  });

  it("adds a roster record missing locally", () => {
    useStore.setState({ sessions: [toSessionView(record("a"))] });
    useStore.getState().applySessionsSync([record("a"), record("c")]);
    expect(useStore.getState().sessions.map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("drops a removed session through dropSession (busy map + selection cleared)", () => {
    useStore.setState({
      sessions: [toSessionView(record("a")), toSessionView(record("b"))],
      sessionBusy: { b: true },
      selectedId: "b",
    });
    useStore.getState().applySessionsSync([record("a")]);
    const s = useStore.getState();
    expect(s.sessions.map((x) => x.id)).toEqual(["a"]);
    // The dropSession choke point ran: its side-effects are visible.
    expect("b" in s.sessionBusy).toBe(false);
    expect(s.selectedId).toBeNull();
  });

  it("applies a rename to an existing session, preserving live view fields", () => {
    useStore.setState({
      sessions: [
        { ...toSessionView(record("a")), reconnecting: true, exitedCode: 3 },
      ],
    });
    useStore.getState().applySessionsSync([record("a", "Renamed")]);
    const view = useStore.getState().sessions[0];
    expect(view.name).toBe("Renamed");
    expect(view.reconnecting).toBe(true);
    expect(view.exitedCode).toBe(3);
  });

  it("handles add + remove + rename in one broadcast", () => {
    useStore.setState({
      sessions: [toSessionView(record("a")), toSessionView(record("gone"))],
      sessionBusy: { gone: true },
    });
    useStore
      .getState()
      .applySessionsSync([record("a", "Renamed"), record("new")]);
    const s = useStore.getState();
    expect(s.sessions.map((x) => x.id).sort()).toEqual(["a", "new"]);
    expect(s.sessions.find((x) => x.id === "a")?.name).toBe("Renamed");
    expect("gone" in s.sessionBusy).toBe(false);
  });
});
