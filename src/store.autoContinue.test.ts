import { beforeEach, describe, expect, it, vi } from "vitest";

// #296/task 430: the auto-continue engine (poll, reducer, nudge) lives in Rust —
// the store keeps only an event-fed mirror (`applyAutoContinueSync`) plus the
// persistence paths (the setting toggles + the per-agent flag). These tests pin
// the task-428 apply rules (equality-guarded, ZERO ipc calls) and that the
// persistence paths still write through `saveSettings` / `setSessionAutoContinue`.
// Own ./ipc mock, isolated per-file by Vitest (store.test.ts's real ipc is
// unaffected).
vi.mock("./ipc", () => ({
  writeStdin: vi.fn().mockResolvedValue(undefined),
  setSettings: vi.fn().mockResolvedValue(undefined),
  setSessionAutoContinue: vi.fn().mockResolvedValue(undefined),
  setThemeBackground: vi.fn().mockResolvedValue(undefined),
}));

import { IDLE_AUTO_CONTINUE } from "./autoContinue";
import * as ipc from "./ipc";
import { DEFAULT_SETTINGS, useStore } from "./store";
import type { SessionView } from "./types";

const m = vi.mocked;

function claudeSession(id: string): SessionView {
  return {
    id,
    claudeSessionId: id,
    repoPath: `/repo/${id}`,
    name: null,
    createdAt: 0,
    agent: "claude",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({
    autoContinue: IDLE_AUTO_CONTINUE,
    sessions: [],
    settings: { ...DEFAULT_SETTINGS },
  });
});

describe("applyAutoContinueSync (task 430 mirror)", () => {
  it("mirrors the Rust engine's state into the slice", () => {
    const state = { armed: true, resetsAtMs: 10_000, sessionIds: ["s1", "s2"] };
    useStore.getState().applyAutoContinueSync(state);
    expect(useStore.getState().autoContinue).toEqual(state);
  });

  it("is an equality-guarded no-op (same state reference kept)", () => {
    const state = { armed: true, resetsAtMs: 10_000, sessionIds: ["s1"] };
    useStore.getState().applyAutoContinueSync(state);
    const applied = useStore.getState().autoContinue;
    // An equal echo (a fresh but deep-equal object) must not replace the slice.
    useStore.getState().applyAutoContinueSync({ ...state, sessionIds: ["s1"] });
    expect(useStore.getState().autoContinue).toBe(applied);
  });

  it("never calls any ipc setter (apply-only, the task-428 rule)", () => {
    useStore.getState().applyAutoContinueSync({
      armed: true,
      resetsAtMs: 5_000,
      sessionIds: ["s1"],
    });
    useStore.getState().applyAutoContinueSync(IDLE_AUTO_CONTINUE);
    expect(m(ipc.setSettings)).not.toHaveBeenCalled();
    expect(m(ipc.setSessionAutoContinue)).not.toHaveBeenCalled();
    expect(m(ipc.writeStdin)).not.toHaveBeenCalled();
  });
});

describe("the persistence paths (unchanged by task 430)", () => {
  it("toggleAutoContinue persists via saveSettings as a one-field patch", async () => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, autoContinueAfterLimit: false },
    });
    useStore.getState().toggleAutoContinue();
    expect(useStore.getState().settings.autoContinueAfterLimit).toBe(true);
    await vi.waitFor(() => expect(m(ipc.setSettings)).toHaveBeenCalledTimes(1));
    // 429's shape: only the changed key travels.
    expect(m(ipc.setSettings)).toHaveBeenCalledWith({
      autoContinueAfterLimit: true,
    });
  });

  it("enableAutoContinueAfterLimit turns the setting on (idempotent)", async () => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, autoContinueAfterLimit: false },
    });
    useStore.getState().enableAutoContinueAfterLimit();
    expect(useStore.getState().settings.autoContinueAfterLimit).toBe(true);
    await vi.waitFor(() => expect(m(ipc.setSettings)).toHaveBeenCalledTimes(1));
    expect(m(ipc.setSettings)).toHaveBeenCalledWith({
      autoContinueAfterLimit: true,
    });
    // Already on → no second write.
    useStore.getState().enableAutoContinueAfterLimit();
    expect(m(ipc.setSettings)).toHaveBeenCalledTimes(1);
  });

  it("setAutoContinueDisabled optimistically flips the flag + persists", () => {
    useStore.setState({ sessions: [claudeSession("s1")] });
    useStore.getState().setAutoContinueDisabled("s1", true);
    expect(
      useStore.getState().sessions.find((s) => s.id === "s1")
        ?.autoContinueDisabled,
    ).toBe(true);
    expect(m(ipc.setSessionAutoContinue)).toHaveBeenCalledWith("s1", true);
  });
});
