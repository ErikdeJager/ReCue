import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  adjacentSessionId,
  dedupeBranchLabels,
  mergeRepoOrder,
  REPO_PALETTE,
  repoColor,
  repoOrder,
  useStore,
} from "./store";
import type { SessionView } from "./types";

function session(id: string): SessionView {
  return {
    id,
    claudeSessionId: id,
    repoPath: `/repo/${id}`,
    name: null,
    createdAt: 0,
  };
}

beforeEach(() => {
  vi.useRealTimers();
  useStore.setState({
    sessions: [],
    selectedId: null,
    view: "overview",
    overviewRepoFilter: null,
    inspectorOpen: false,
    recents: [],
    branches: {},
    repoColors: {},
    overviewPanels: {},
    overviewOrder: {},
    openFiles: {},
    sessionBusy: {},
    claudeMissing: false,
    toasts: [],
    newSessionOpen: false,
    newSessionRepo: null,
    update: {
      available: false,
      version: null,
      dismissed: false,
      installing: false,
    },
  });
});

describe("app store", () => {
  it("switches the view", () => {
    useStore.getState().setView("focus");
    expect(useStore.getState().view).toBe("focus");
  });

  it("selecting a session highlights it without changing the view (#22)", () => {
    expect(useStore.getState().view).toBe("overview");
    useStore.getState().select("abc");
    expect(useStore.getState().selectedId).toBe("abc");
    // Selection is decoupled from the view — it must not force Focus.
    expect(useStore.getState().view).toBe("overview");
  });

  it("showFocus focuses the first agent when nothing is selected (#25)", () => {
    useStore.setState({ sessions: [session("s1"), session("s2")] });
    useStore.getState().showFocus();
    expect(useStore.getState().selectedId).toBe("s1");
    expect(useStore.getState().view).toBe("focus");
  });

  it("showFocus keeps a valid selection", () => {
    useStore.setState({
      sessions: [session("s1"), session("s2")],
      selectedId: "s2",
    });
    useStore.getState().showFocus();
    expect(useStore.getState().selectedId).toBe("s2");
    expect(useStore.getState().view).toBe("focus");
  });

  it("showFocus falls back to the first agent when the selection is stale", () => {
    useStore.setState({ sessions: [session("s1")], selectedId: "gone" });
    useStore.getState().showFocus();
    expect(useStore.getState().selectedId).toBe("s1");
    expect(useStore.getState().view).toBe("focus");
  });

  it("showFocus is a no-op with zero agents", () => {
    useStore.getState().showFocus();
    expect(useStore.getState().selectedId).toBeNull();
    expect(useStore.getState().view).toBe("overview");
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

  it("markExited clears a busy flag (an exited session isn't working) (#42)", () => {
    useStore.setState({ sessions: [session("s1")], sessionBusy: { s1: true } });
    useStore.getState().markExited("s1", 0);
    expect(useStore.getState().sessionBusy.s1).toBeUndefined();
  });

  it("setOverviewRepoFilter toggles, switches, and clears (#34)", () => {
    useStore.getState().setOverviewRepoFilter("/repo/x");
    expect(useStore.getState().overviewRepoFilter).toBe("/repo/x");
    // clicking the active repo clears it
    useStore.getState().setOverviewRepoFilter("/repo/x");
    expect(useStore.getState().overviewRepoFilter).toBeNull();
    // another repo sets it; null is "Show all"
    useStore.getState().setOverviewRepoFilter("/repo/y");
    expect(useStore.getState().overviewRepoFilter).toBe("/repo/y");
    useStore.getState().setOverviewRepoFilter(null);
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
      view: "focus",
      overviewRepoFilter: "/repo/x",
    });
    // ipc calls reject without a Tauri host and are caught; the state update runs.
    await useStore.getState().forgetRepo("/repo/x");
    expect(useStore.getState().sessions.map((s) => s.id)).toEqual(["b"]);
    expect(useStore.getState().recents).toEqual(["/repo/y"]);
    expect(useStore.getState().selectedId).toBeNull();
    expect(useStore.getState().view).toBe("overview");
    expect(useStore.getState().overviewRepoFilter).toBeNull();
  });

  it("toggles the inspector", () => {
    expect(useStore.getState().inspectorOpen).toBe(false);
    useStore.getState().toggleInspector();
    expect(useStore.getState().inspectorOpen).toBe(true);
  });

  it("upserts (de-duplicating by id) and drops sessions, fixing selection", () => {
    useStore.getState().upsertSession(session("s1"));
    useStore.getState().upsertSession(session("s1"));
    useStore.getState().select("s1");
    useStore.getState().setView("focus"); // simulate focusing s1
    expect(useStore.getState().sessions).toHaveLength(1);

    useStore.getState().dropSession("s1");
    expect(useStore.getState().sessions).toHaveLength(0);
    expect(useStore.getState().selectedId).toBeNull();
    // Removing the focused session returns to Overview (no stranded empty Focus).
    expect(useStore.getState().view).toBe("overview");
  });

  it("marks a session as exited, then running again (restart)", () => {
    useStore.getState().upsertSession(session("s1"));
    useStore.getState().markExited("s1", 0);
    expect(useStore.getState().sessions[0]?.exitedCode).toBe(0);
    useStore.getState().markRunning("s1");
    expect(useStore.getState().sessions[0]?.exitedCode).toBeUndefined();
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

  it("dismisses an available update for the session", () => {
    useStore.setState({
      update: {
        available: true,
        version: "1.2.3",
        dismissed: false,
        installing: false,
      },
    });
    useStore.getState().dismissUpdate();
    expect(useStore.getState().update.dismissed).toBe(true);
    expect(useStore.getState().update.available).toBe(true);
  });

  it("opens and closes the new-session modal with an optional repo", () => {
    useStore.getState().openNewSession("/repo/a");
    expect(useStore.getState().newSessionOpen).toBe(true);
    expect(useStore.getState().newSessionRepo).toBe("/repo/a");
    useStore.getState().closeNewSession();
    expect(useStore.getState().newSessionOpen).toBe(false);
    expect(useStore.getState().newSessionRepo).toBeNull();
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
});

describe("opened-file tree (#45)", () => {
  it("openFile appends, dedups, and closeFile removes (dropping empties)", async () => {
    await useStore.getState().openFile("/repo/a", "README.md");
    await useStore.getState().openFile("/repo/a", "src/main.rs");
    await useStore.getState().openFile("/repo/a", "README.md"); // dup → no-op
    expect(useStore.getState().openFiles["/repo/a"]).toEqual([
      "README.md",
      "src/main.rs",
    ]);

    await useStore.getState().closeFile("/repo/a", "README.md");
    expect(useStore.getState().openFiles["/repo/a"]).toEqual(["src/main.rs"]);

    await useStore.getState().closeFile("/repo/a", "src/main.rs");
    expect(useStore.getState().openFiles["/repo/a"]).toBeUndefined();
  });

  it("addOverviewPanel with a file registers it as an opened file (#45)", async () => {
    await useStore
      .getState()
      .addOverviewPanel("/repo/a", "markdown", "docs/x.md");
    expect(useStore.getState().openFiles["/repo/a"]).toEqual(["docs/x.md"]);
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
