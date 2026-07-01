import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// #296: exercise the store's auto-continue wiring (`applyAutoContinue`) against a
// mocked IPC layer so we can assert the Enter → `continue` → Enter injection. Own
// ./ipc mock, isolated per-file by Vitest (store.test.ts's real ipc is unaffected).
vi.mock("./ipc", () => ({
  writeStdin: vi.fn().mockResolvedValue(undefined),
  claudeSessionUsage: vi.fn().mockResolvedValue(null),
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

/** A Claude agent with the #297 per-agent auto-continue opt-out set — excluded from
 * the fire step even though the global option is on. */
function disabledClaudeSession(id: string): SessionView {
  return { ...claudeSession(id), autoContinueDisabled: true };
}

/** Wait until `writeStdin` has been called `n` times (the nudge has small inter-key
 * delays), or fail after a bound. Uses real timers so the sequence resolves. */
async function waitForCalls(n: number, timeoutMs = 1_000): Promise<void> {
  const start = Date.now();
  while (m(ipc.writeStdin).mock.calls.length < n) {
    if (Date.now() - start > timeoutMs) break;
    await new Promise((r) => setTimeout(r, 10));
  }
}

beforeEach(() => {
  m(ipc.writeStdin).mockClear();
  useStore.getState().stopUsagePolling();
  useStore.setState({
    autoContinue: IDLE_AUTO_CONTINUE,
    settings: {
      ...DEFAULT_SETTINGS,
      autoContinueAfterLimit: true,
      defaultAgent: "claude",
    },
  });
});

afterEach(() => {
  // Clear the armed poll interval `applyAutoContinue` may have started.
  useStore.getState().stopUsagePolling();
});

describe("applyAutoContinue (store wiring)", () => {
  it("arms (no injection) when the limit is reached with live Claude sessions", () => {
    useStore.setState({
      sessions: [claudeSession("s1"), claudeSession("s2")],
      usage: { usedPercent: 100, resetsAtMs: 10_000, available: true },
    });
    useStore.getState().applyAutoContinue();
    const ac = useStore.getState().autoContinue;
    expect(ac.armed).toBe(true);
    expect(ac.sessionIds).toEqual(["s1", "s2"]);
    expect(m(ipc.writeStdin)).not.toHaveBeenCalled();
  });

  it("sends Enter → continue → Enter to each fired session on reset, then disarms", async () => {
    useStore.setState({
      sessions: [claudeSession("s1")],
      usage: { usedPercent: 5, resetsAtMs: 1_000, available: true },
      autoContinue: { armed: true, resetsAtMs: 1_000, sessionIds: ["s1"] },
    });
    useStore.getState().applyAutoContinue();
    // Disarms immediately; the injection completes asynchronously.
    expect(useStore.getState().autoContinue.armed).toBe(false);
    await waitForCalls(3);
    const calls = m(ipc.writeStdin).mock.calls;
    expect(calls).toEqual([
      ["s1", "\r"],
      ["s1", "continue"],
      ["s1", "\r"],
    ]);
  });

  it("does nothing when the feature is off", () => {
    useStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        autoContinueAfterLimit: false,
        defaultAgent: "claude",
      },
      sessions: [claudeSession("s1")],
      usage: { usedPercent: 100, resetsAtMs: 10_000, available: true },
    });
    useStore.getState().applyAutoContinue();
    expect(useStore.getState().autoContinue.armed).toBe(false);
    expect(m(ipc.writeStdin)).not.toHaveBeenCalled();
  });

  it("does nothing when the default agent is not Claude", () => {
    useStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        autoContinueAfterLimit: true,
        defaultAgent: "codex",
      },
      sessions: [claudeSession("s1")],
      usage: { usedPercent: 100, resetsAtMs: 10_000, available: true },
    });
    useStore.getState().applyAutoContinue();
    expect(useStore.getState().autoContinue.armed).toBe(false);
    expect(m(ipc.writeStdin)).not.toHaveBeenCalled();
  });

  // #297: a per-agent opt-out (`autoContinueDisabled`) excludes that one Claude agent
  // from the fire step, while the others still get nudged.
  it("excludes an auto-continue-disabled agent from the captured arm-set", () => {
    useStore.setState({
      sessions: [claudeSession("s1"), disabledClaudeSession("s2")],
      usage: { usedPercent: 100, resetsAtMs: 10_000, available: true },
    });
    useStore.getState().applyAutoContinue();
    const ac = useStore.getState().autoContinue;
    expect(ac.armed).toBe(true);
    // s2 is disabled → never captured for the nudge; only s1 is.
    expect(ac.sessionIds).toEqual(["s1"]);
  });

  it("on reset, nudges only the enabled agent (skips the disabled one)", async () => {
    useStore.setState({
      sessions: [claudeSession("s1"), disabledClaudeSession("s2")],
      usage: { usedPercent: 5, resetsAtMs: 1_000, available: true },
      // Both were captured at arm time (simulating an agent disabled *after* arming);
      // the fire step still filters s2 out because it's disabled now.
      autoContinue: {
        armed: true,
        resetsAtMs: 1_000,
        sessionIds: ["s1", "s2"],
      },
    });
    useStore.getState().applyAutoContinue();
    expect(useStore.getState().autoContinue.armed).toBe(false);
    await waitForCalls(3);
    const calls = m(ipc.writeStdin).mock.calls;
    // Only s1 receives Enter → continue → Enter; s2 is never written to.
    expect(calls).toEqual([
      ["s1", "\r"],
      ["s1", "continue"],
      ["s1", "\r"],
    ]);
    expect(calls.some(([id]) => id === "s2")).toBe(false);
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
