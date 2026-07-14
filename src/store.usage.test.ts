import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// #326: exercise the store's session-usage gating (`refreshUsage`) against a mocked
// IPC layer so we can assert that the usage IPC — and therefore the Rust Claude
// OAuth token read — is never invoked when the "Show session usage" setting is off,
// and is invoked (once) when it's on. Own ./ipc mock, isolated per-file by Vitest.
vi.mock("./ipc", () => ({
  claudeSessionUsage: vi.fn().mockResolvedValue(null),
  writeStdin: vi.fn().mockResolvedValue(undefined),
  setSettings: vi.fn().mockResolvedValue(undefined),
  setSessionAutoContinue: vi.fn().mockResolvedValue(undefined),
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
  m(ipc.claudeSessionUsage).mockClear();
  useStore.getState().stopUsagePolling();
  useStore.setState({
    autoContinue: IDLE_AUTO_CONTINUE,
    sessions: [claudeSession("s1")],
    usage: {
      usedPercent: null,
      resetsAtMs: null,
      available: false,
      buckets: [],
    },
    settings: { ...DEFAULT_SETTINGS },
  });
});

afterEach(() => {
  // Clear any armed poll interval `applyAutoContinue` may have started.
  useStore.getState().stopUsagePolling();
});

describe("refreshUsage — showSessionUsage gate (#326)", () => {
  it("never calls the usage IPC (no token read) when the setting is off", async () => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, showSessionUsage: false },
    });
    await useStore.getState().refreshUsage();
    expect(m(ipc.claudeSessionUsage)).not.toHaveBeenCalled();
    expect(useStore.getState().usage.available).toBe(false);
  });

  it("clears any stale usage data to unavailable when turned off", async () => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, showSessionUsage: false },
      usage: {
        usedPercent: 42,
        resetsAtMs: 10_000,
        available: true,
        buckets: [],
      },
    });
    await useStore.getState().refreshUsage();
    expect(m(ipc.claudeSessionUsage)).not.toHaveBeenCalled();
    expect(useStore.getState().usage).toEqual({
      usedPercent: null,
      resetsAtMs: null,
      available: false,
      buckets: [],
    });
  });

  it("calls the usage IPC once when the setting is on and Claude is active", async () => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, showSessionUsage: true },
    });
    await useStore.getState().refreshUsage();
    expect(m(ipc.claudeSessionUsage)).toHaveBeenCalledTimes(1);
  });
});
