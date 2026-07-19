import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { attentionQueue } from "./components/Attention/attentionQueue";
import { cancelAllAttentionTimers, useStore } from "./store";
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

/** Membership snapshot from the pure queue fn over current store state. */
function queueIds(): string[] {
  const s = useStore.getState();
  return attentionQueue({
    sessions: s.sessions,
    sessionBusy: s.sessionBusy,
    sessionActive: s.sessionActive,
    dismissed: s.dismissedAttention,
    eligible: s.attentionEligible,
    idleSince: s.sessionIdleSince,
    recurringChildIds: new Set(),
  }).map((q) => q.id);
}

beforeEach(() => {
  vi.useRealTimers();
  cancelAllAttentionTimers();
  useStore.setState({
    sessions: [session("s1")],
    selectedId: null,
    view: "attention",
    overviewRepoFilter: null,
    sessionBusy: {},
    sessionActive: {},
    sessionIdleSince: {},
    dismissedAttention: {},
    attentionEligible: {},
    sessionTurnState: {},
    hookSeen: {},
    recurrings: [],
    primaryWindow: null, // suppress the #336 notification in these unit tests
    // scheduleGitRefresh (parity #212) fires a debounced volley through this — stub it
    // so a fired timer never reaches the tauri IPC.
    refreshRepoGit: vi.fn().mockResolvedValue(undefined),
  });
});

afterEach(() => {
  cancelAllAttentionTimers();
  vi.useRealTimers();
});

describe("setTurnState — turn-complete hook bridge", () => {
  it("admits to the Attention queue IMMEDIATELY, bypassing the 5s grace", () => {
    // No timer advance — admission is synchronous.
    useStore.getState().setTurnState("s1", "finished");
    const s = useStore.getState();
    expect(s.attentionEligible.s1).toBe(true);
    expect(s.sessionActive.s1).toBe(true); // renders IDLE/yellow, never NEW/gray
    expect(s.sessionTurnState.s1).toBe("finished");
    expect(s.hookSeen.s1).toBe(true);
    expect(typeof s.sessionIdleSince.s1).toBe("number");
    expect(s.sessionBusy.s1).toBeUndefined();
    expect(queueIds()).toEqual(["s1"]); // a member of the pure queue right away
  });

  it("records the approval state distinctly", () => {
    useStore.getState().setTurnState("s1", "approval");
    expect(useStore.getState().sessionTurnState.s1).toBe("approval");
    expect(useStore.getState().attentionEligible.s1).toBe(true);
  });

  it("keeps the FIFO stamp on a duplicate / escalation update", () => {
    useStore.getState().setTurnState("s1", "finished");
    const stamp = useStore.getState().sessionIdleSince.s1;
    // An approval escalation for the same already-queued agent only updates the badge.
    useStore.getState().setTurnState("s1", "approval");
    expect(useStore.getState().sessionIdleSince.s1).toBe(stamp);
    expect(useStore.getState().sessionTurnState.s1).toBe("approval");
  });

  it("makes a hook-driven session ignore the heuristic admission grace", () => {
    vi.useFakeTimers();
    const { setBusy, setTurnState } = useStore.getState();
    // First hook admits it.
    setTurnState("s1", "finished");
    expect(useStore.getState().attentionEligible.s1).toBe(true);
    // Agent resumes — a sustained busy signal evicts it (the heuristic may still revoke).
    setBusy("s1", true);
    vi.advanceTimersByTime(1_600); // > ATTENTION_EVICT_CONFIRM_MS
    expect(useStore.getState().attentionEligible.s1).toBeUndefined();
    // Heuristic idle edge: because the session is `hookSeen`, NO fallback grace is armed.
    setBusy("s1", false);
    vi.advanceTimersByTime(6_000); // > ATTENTION_GRACE_MS
    expect(useStore.getState().attentionEligible.s1).toBeUndefined();
    // Only the hook re-admits it.
    setTurnState("s1", "finished");
    expect(useStore.getState().attentionEligible.s1).toBe(true);
  });

  it("leaves a non-hooked session on the heuristic grace (fallback intact)", () => {
    vi.useFakeTimers();
    const { setBusy } = useStore.getState();
    setBusy("s1", true);
    setBusy("s1", false); // busy→idle arms the 5s admission grace
    expect(useStore.getState().attentionEligible.s1).toBeUndefined(); // not yet
    vi.advanceTimersByTime(5_100);
    expect(useStore.getState().attentionEligible.s1).toBe(true); // confirmed idle
  });

  it("clears the hook state on exit and on restart", () => {
    useStore.getState().setTurnState("s1", "approval");
    useStore.getState().markExited("s1", 1);
    let s = useStore.getState();
    expect(s.sessionTurnState.s1).toBeUndefined();
    expect(s.hookSeen.s1).toBeUndefined();
    expect(s.attentionEligible.s1).toBeUndefined();

    // Restart reverts to heuristic-driven.
    useStore.getState().setTurnState("s1", "finished");
    useStore.getState().markRunning("s1");
    s = useStore.getState();
    expect(s.sessionTurnState.s1).toBeUndefined();
    expect(s.hookSeen.s1).toBeUndefined();
  });
});
