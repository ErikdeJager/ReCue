import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  adjacentSessionId,
  dedupeBranchLabels,
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
    inspectorOpen: false,
    recents: [],
    branches: {},
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

  it("forgetRepo drops the repo's sessions + recent and fixes selection (#31)", async () => {
    useStore.setState({
      sessions: [
        { ...session("a"), repoPath: "/repo/x" },
        { ...session("b"), repoPath: "/repo/y" },
      ],
      recents: ["/repo/x", "/repo/y"],
      selectedId: "a",
      view: "focus",
    });
    // ipc calls reject without a Tauri host and are caught; the state update runs.
    await useStore.getState().forgetRepo("/repo/x");
    expect(useStore.getState().sessions.map((s) => s.id)).toEqual(["b"]);
    expect(useStore.getState().recents).toEqual(["/repo/y"]);
    expect(useStore.getState().selectedId).toBeNull();
    expect(useStore.getState().view).toBe("overview");
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
