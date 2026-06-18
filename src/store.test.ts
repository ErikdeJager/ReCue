import { beforeEach, describe, expect, it, vi } from "vitest";

import { repoOrder, useStore } from "./store";
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
  });
});

describe("app store", () => {
  it("switches the view", () => {
    useStore.getState().setView("focus");
    expect(useStore.getState().view).toBe("focus");
  });

  it("selecting a session focuses it", () => {
    useStore.getState().select("abc");
    expect(useStore.getState().selectedId).toBe("abc");
    expect(useStore.getState().view).toBe("focus");
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
    expect(useStore.getState().sessions).toHaveLength(1);

    useStore.getState().dropSession("s1");
    expect(useStore.getState().sessions).toHaveLength(0);
    expect(useStore.getState().selectedId).toBeNull();
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
  it("lists recents first, then repos that only have active sessions", () => {
    const recents = ["/repo/a", "/repo/b"];
    const sessions = [session("s1"), { ...session("s2"), repoPath: "/repo/b" }];
    // session("s1") has repoPath "/repo/s1" (not in recents) -> appended last.
    expect(repoOrder(recents, sessions)).toEqual([
      "/repo/a",
      "/repo/b",
      "/repo/s1",
    ]);
  });

  it("de-duplicates repos shared by recents and sessions", () => {
    const sessions = [{ ...session("s1"), repoPath: "/repo/a" }];
    expect(repoOrder(["/repo/a"], sessions)).toEqual(["/repo/a"]);
  });
});
