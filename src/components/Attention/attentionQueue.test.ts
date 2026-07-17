import { describe, expect, it } from "vitest";

import type { SessionView } from "../../types";
import { attentionQueue, formatIdleAge } from "./attentionQueue";

/** Minimal SessionView factory — only the fields the queue reads. */
function sess(id: string, over: Partial<SessionView> = {}): SessionView {
  return {
    id,
    claudeSessionId: `c-${id}`,
    repoPath: `/repo/${id}`,
    name: null,
    createdAt: 1000,
    ...over,
  };
}

const emptyInput = {
  sessions: [] as SessionView[],
  sessionBusy: {} as Record<string, boolean>,
  sessionActive: {} as Record<string, boolean>,
  dismissed: {} as Record<string, boolean>,
  eligible: {} as Record<string, boolean>,
  idleSince: {} as Record<string, number>,
  recurringChildIds: new Set<string>(),
};

describe("attentionQueue membership (#398)", () => {
  it("includes an active, idle, non-dismissed agent", () => {
    const s = sess("a");
    const q = attentionQueue({
      ...emptyInput,
      sessions: [s],
      sessionActive: { a: true },
      eligible: { a: true },
    });
    expect(q.map((x) => x.id)).toEqual(["a"]);
  });

  it("includes a fresh never-active (gray) idle agent (task 410)", () => {
    const q = attentionQueue({
      ...emptyInput,
      sessions: [sess("a")],
      sessionActive: {},
      eligible: { a: true },
    });
    expect(q.map((x) => x.id)).toEqual(["a"]);
  });

  it("excludes an idle agent whose admission grace hasn't confirmed yet", () => {
    // The busy heuristic settles ~700ms after any output pause, so a raw idle edge
    // is NOT membership — only the store's ATTENTION_GRACE_MS confirmation is.
    const q = attentionQueue({
      ...emptyInput,
      sessions: [sess("a")],
      sessionActive: { a: true },
      eligible: {},
    });
    expect(q).toHaveLength(0);
  });

  it("includes a busy agent that is still eligible (eviction is store-debounced)", () => {
    // Raw `sessionBusy` is deliberately not a membership test: the store revokes
    // `eligible` only once its eviction debounce confirms the busy signal is
    // sustained — so a sub-second spurious blip (a resize/focus repaint) can never
    // blink a queued agent out or reset its FIFO position. A genuinely-working
    // member leaves when the store confirms and revokes eligibility.
    const q = attentionQueue({
      ...emptyInput,
      sessions: [sess("a")],
      sessionActive: { a: true },
      sessionBusy: { a: true },
      eligible: { a: true },
    });
    expect(q.map((x) => x.id)).toEqual(["a"]);
  });

  it("excludes a busy agent once the store's confirmed eviction revokes eligibility", () => {
    const q = attentionQueue({
      ...emptyInput,
      sessions: [sess("a")],
      sessionActive: { a: true },
      sessionBusy: { a: true },
      eligible: {},
    });
    expect(q).toHaveLength(0);
  });

  it("excludes a fresh never-active agent once dismissed (task 410)", () => {
    const q = attentionQueue({
      ...emptyInput,
      sessions: [sess("a")],
      sessionActive: {},
      dismissed: { a: true },
      eligible: { a: true },
    });
    expect(q).toHaveLength(0);
  });

  it("excludes a dismissed agent", () => {
    const q = attentionQueue({
      ...emptyInput,
      sessions: [sess("a")],
      sessionActive: { a: true },
      dismissed: { a: true },
      eligible: { a: true },
    });
    expect(q).toHaveLength(0);
  });

  it("excludes a recurring-owned child session", () => {
    const q = attentionQueue({
      ...emptyInput,
      sessions: [sess("a")],
      sessionActive: { a: true },
      eligible: { a: true },
      recurringChildIds: new Set(["a"]),
    });
    expect(q).toHaveLength(0);
  });

  it("excludes an exited session", () => {
    const q = attentionQueue({
      ...emptyInput,
      sessions: [sess("a", { exitedCode: 1 })],
      sessionActive: { a: true },
      eligible: { a: true },
    });
    expect(q).toHaveLength(0);
  });

  it("excludes a session that exited cleanly (code 0)", () => {
    const q = attentionQueue({
      ...emptyInput,
      sessions: [sess("a", { exitedCode: 0 })],
      sessionActive: { a: true },
      eligible: { a: true },
    });
    expect(q).toHaveLength(0);
  });

  it("excludes a boot-reconnecting session", () => {
    const q = attentionQueue({
      ...emptyInput,
      sessions: [sess("a", { reconnecting: true })],
      sessionActive: { a: true },
      eligible: { a: true },
    });
    expect(q).toHaveLength(0);
  });
});

describe("attentionQueue repo/folder filter (#445)", () => {
  const repoA = "/repo/a";
  const repoB = "/repo/b";
  // Three queue-eligible agents: repo-A own, repo-A worktree, repo-B own.
  const sessions = [
    sess("a-own", { repoPath: repoA }),
    sess("a-wt", { repoPath: "/wt/a-x", worktreeParent: repoA }),
    sess("b-own", { repoPath: repoB }),
  ];
  const base = {
    ...emptyInput,
    sessions,
    eligible: { "a-own": true, "a-wt": true, "b-own": true },
  };

  it("no filter (undefined) leaves the queue unchanged", () => {
    const q = attentionQueue(base);
    expect(q.map((x) => x.id)).toEqual(["a-own", "a-wt", "b-own"]);
  });

  it("no filter (null) leaves the queue unchanged", () => {
    const q = attentionQueue({ ...base, filter: null });
    expect(q.map((x) => x.id)).toEqual(["a-own", "a-wt", "b-own"]);
  });

  it("mode:'all' narrows to the repo's own AND its worktree agents", () => {
    const q = attentionQueue({ ...base, filter: { path: repoA, mode: "all" } });
    expect(q.map((x) => x.id).sort()).toEqual(["a-own", "a-wt"]);
  });

  it("mode:'own' narrows to the repo's own non-worktree agents (worktree excluded)", () => {
    const q = attentionQueue({ ...base, filter: { path: repoA, mode: "own" } });
    expect(q.map((x) => x.id)).toEqual(["a-own"]);
  });

  it("a worktree-folder filter (mode:'all') narrows to just that worktree", () => {
    const q = attentionQueue({
      ...base,
      filter: { path: "/wt/a-x", mode: "all" },
    });
    expect(q.map((x) => x.id)).toEqual(["a-wt"]);
  });
});

describe("attentionQueue ordering — FIFO oldest idle first (#398)", () => {
  it("orders by idleSince ascending (oldest idle at the top)", () => {
    const q = attentionQueue({
      ...emptyInput,
      sessions: [sess("new"), sess("old"), sess("mid")],
      sessionActive: { new: true, old: true, mid: true },
      eligible: { new: true, old: true, mid: true },
      idleSince: { new: 3000, old: 1000, mid: 2000 },
    });
    expect(q.map((x) => x.id)).toEqual(["old", "mid", "new"]);
  });

  it("falls back to createdAt (scaled seconds→ms) for a boot-persisted-awaiting agent", () => {
    // `boot` has no idleSince → key = createdAt*1000 = 1_500_000 ms, which sorts
    // BEFORE `live` whose recorded edge is 3_000_000 ms. (Verifies the seconds→ms
    // scaling — without it boot's raw 1500 would wrongly beat everything.)
    const q = attentionQueue({
      ...emptyInput,
      sessions: [
        sess("live", { createdAt: 5000 }),
        sess("boot", { createdAt: 1500 }),
      ],
      sessionActive: { live: true, boot: true },
      eligible: { live: true, boot: true },
      idleSince: { live: 3_000_000 },
    });
    expect(q.map((x) => x.id)).toEqual(["boot", "live"]);
  });

  it("interleaves fresh (createdAt) and awaiting (idleSince) agents oldest-wait-first (task 410)", () => {
    // A fresh agent keys off createdAt*1000, an awaiting one off idleSince — so the two
    // kinds interleave purely by wait time. A fresh agent created just now sorts BEHIND
    // an older awaiting agent, while a long-ago-created fresh agent sorts AHEAD of a
    // just-finished awaiting one. (Also re-verifies the seconds→ms createdAt scaling.)
    const q = attentionQueue({
      ...emptyInput,
      sessions: [
        sess("freshNow", { createdAt: 10_000 }), // no idleSince → key 10_000_000 ms
        sess("awaitOld", { createdAt: 2_000 }), // idleSince 5_000_000 ms
        sess("awaitRecent", { createdAt: 3_000 }), // idleSince 9_000_000 ms
        sess("freshOld", { createdAt: 1_000 }), // no idleSince → key 1_000_000 ms
      ],
      sessionActive: { awaitOld: true, awaitRecent: true },
      eligible: {
        freshNow: true,
        awaitOld: true,
        awaitRecent: true,
        freshOld: true,
      },
      idleSince: { awaitOld: 5_000_000, awaitRecent: 9_000_000 },
    });
    expect(q.map((x) => x.id)).toEqual([
      "freshOld",
      "awaitOld",
      "awaitRecent",
      "freshNow",
    ]);
  });

  it("breaks ties by ascending createdAt then id (stable, deterministic)", () => {
    const q = attentionQueue({
      ...emptyInput,
      sessions: [
        sess("z", { createdAt: 2 }),
        sess("a", { createdAt: 2 }),
        sess("early", { createdAt: 1 }),
      ],
      sessionActive: { z: true, a: true, early: true },
      eligible: { z: true, a: true, early: true },
      // Identical idleSince forces the tie-break onto createdAt, then id.
      idleSince: { z: 5000, a: 5000, early: 5000 },
    });
    expect(q.map((x) => x.id)).toEqual(["early", "a", "z"]);
  });
});

describe("formatIdleAge (#398)", () => {
  const now = 10_000_000;
  it("returns empty string when the edge time is unknown", () => {
    expect(formatIdleAge(undefined, now)).toBe("");
  });

  it("returns 'just now' under a minute", () => {
    expect(formatIdleAge(now - 0, now)).toBe("just now");
    expect(formatIdleAge(now - 59_000, now)).toBe("just now");
  });

  it("returns 'Xm ago' from one minute up to an hour", () => {
    expect(formatIdleAge(now - 60_000, now)).toBe("1m ago");
    expect(formatIdleAge(now - 59 * 60_000, now)).toBe("59m ago");
  });

  it("returns 'Xh ago' from an hour on", () => {
    expect(formatIdleAge(now - 60 * 60_000, now)).toBe("1h ago");
    expect(formatIdleAge(now - 3 * 60 * 60_000, now)).toBe("3h ago");
  });
});
