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
    });
    expect(q.map((x) => x.id)).toEqual(["a"]);
  });

  it("excludes a never-active (gray) agent", () => {
    const q = attentionQueue({
      ...emptyInput,
      sessions: [sess("a")],
      sessionActive: {},
    });
    expect(q).toHaveLength(0);
  });

  it("excludes a busy (blue) agent even when it has been active", () => {
    const q = attentionQueue({
      ...emptyInput,
      sessions: [sess("a")],
      sessionActive: { a: true },
      sessionBusy: { a: true },
    });
    expect(q).toHaveLength(0);
  });

  it("excludes a dismissed agent", () => {
    const q = attentionQueue({
      ...emptyInput,
      sessions: [sess("a")],
      sessionActive: { a: true },
      dismissed: { a: true },
    });
    expect(q).toHaveLength(0);
  });

  it("excludes a recurring-owned child session", () => {
    const q = attentionQueue({
      ...emptyInput,
      sessions: [sess("a")],
      sessionActive: { a: true },
      recurringChildIds: new Set(["a"]),
    });
    expect(q).toHaveLength(0);
  });

  it("excludes an exited session", () => {
    const q = attentionQueue({
      ...emptyInput,
      sessions: [sess("a", { exitedCode: 1 })],
      sessionActive: { a: true },
    });
    expect(q).toHaveLength(0);
  });

  it("excludes a session that exited cleanly (code 0)", () => {
    const q = attentionQueue({
      ...emptyInput,
      sessions: [sess("a", { exitedCode: 0 })],
      sessionActive: { a: true },
    });
    expect(q).toHaveLength(0);
  });

  it("excludes a boot-reconnecting session", () => {
    const q = attentionQueue({
      ...emptyInput,
      sessions: [sess("a", { reconnecting: true })],
      sessionActive: { a: true },
    });
    expect(q).toHaveLength(0);
  });
});

describe("attentionQueue ordering — FIFO oldest idle first (#398)", () => {
  it("orders by idleSince ascending (oldest idle at the top)", () => {
    const q = attentionQueue({
      ...emptyInput,
      sessions: [sess("new"), sess("old"), sess("mid")],
      sessionActive: { new: true, old: true, mid: true },
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
      idleSince: { live: 3_000_000 },
    });
    expect(q.map((x) => x.id)).toEqual(["boot", "live"]);
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
