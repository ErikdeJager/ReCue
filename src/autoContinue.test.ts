import { describe, expect, it } from "vitest";

import {
  ARM_THRESHOLD_PCT,
  ARMED_POLL_MS,
  evaluateAutoContinue,
  IDLE_AUTO_CONTINUE,
  isLimitReached,
  LIMIT_REACHED_PCT,
  RESET_CONFIRM_PCT,
  type AutoContinueConfig,
  type AutoContinueState,
  type AutoContinueUsage,
} from "./autoContinue";

const CLAUDE_ON: AutoContinueConfig = { enabled: true, defaultAgent: "claude" };

const usage = (
  usedPercent: number | null,
  resetsAtMs: number | null,
  available = true,
): AutoContinueUsage => ({ usedPercent, resetsAtMs, available });

const armed = (
  resetsAtMs: number | null,
  sessionIds: string[],
): AutoContinueState => ({ armed: true, resetsAtMs, sessionIds });

describe("evaluateAutoContinue constants", () => {
  it("uses the specified thresholds", () => {
    expect(LIMIT_REACHED_PCT).toBe(100);
    expect(ARM_THRESHOLD_PCT).toBe(99.5);
    expect(RESET_CONFIRM_PCT).toBe(90);
    expect(ARMED_POLL_MS).toBe(45_000);
  });
});

describe("isLimitReached", () => {
  it("is true at exactly the arm threshold (99.5%)", () => {
    expect(
      isLimitReached({ usedPercent: ARM_THRESHOLD_PCT, available: true }),
    ).toBe(true);
  });

  it("is true above the arm threshold (100%)", () => {
    expect(isLimitReached({ usedPercent: 100, available: true })).toBe(true);
  });

  it("is false just below the arm threshold", () => {
    expect(isLimitReached({ usedPercent: 99.4, available: true })).toBe(false);
    expect(isLimitReached({ usedPercent: 0, available: true })).toBe(false);
  });

  it("is false when usage data is unavailable, even at 100%", () => {
    expect(isLimitReached({ usedPercent: 100, available: false })).toBe(false);
  });

  it("is false when usedPercent is null", () => {
    expect(isLimitReached({ usedPercent: null, available: true })).toBe(false);
  });

  it("accepts the full usage slice (structural type)", () => {
    // The per-agent checkbox (#305) passes the whole store `usage` object; the
    // narrow param accepts it structurally, with the same threshold behavior as
    // the `{ usedPercent, available }` literals the #309 prompt button passes.
    expect(isLimitReached(usage(99.5, 5_000))).toBe(true);
    expect(isLimitReached(usage(100, 5_000))).toBe(true);
    expect(isLimitReached(usage(99.4, 5_000))).toBe(false);
    expect(isLimitReached(usage(null, 5_000))).toBe(false);
    expect(isLimitReached(usage(100, 5_000, false))).toBe(false);
  });

  it("agrees with the reducer's arm branch at the boundary", () => {
    // The reducer arms exactly when isLimitReached && there are live Claude ids.
    const boundary = usage(ARM_THRESHOLD_PCT, 5_000);
    expect(isLimitReached(boundary)).toBe(true);
    const { next } = evaluateAutoContinue(
      IDLE_AUTO_CONTINUE,
      boundary,
      1_000,
      CLAUDE_ON,
      ["a"],
    );
    expect(next.armed).toBe(true);

    const under = usage(ARM_THRESHOLD_PCT - 0.1, 5_000);
    expect(isLimitReached(under)).toBe(false);
    const { next: stay } = evaluateAutoContinue(
      IDLE_AUTO_CONTINUE,
      under,
      1_000,
      CLAUDE_ON,
      ["a"],
    );
    expect(stay.armed).toBe(false);
  });
});

describe("evaluateAutoContinue — arming", () => {
  it("arms at >= 100% with live Claude sessions, capturing reset time + ids", () => {
    const { next, fireIds } = evaluateAutoContinue(
      IDLE_AUTO_CONTINUE,
      usage(100, 5_000),
      1_000,
      CLAUDE_ON,
      ["a", "b"],
    );
    expect(next).toEqual({
      armed: true,
      resetsAtMs: 5_000,
      sessionIds: ["a", "b"],
    });
    expect(fireIds).toEqual([]);
  });

  it("arms at the 99.5 tolerance (a hair under 100)", () => {
    const { next } = evaluateAutoContinue(
      IDLE_AUTO_CONTINUE,
      usage(99.5, 5_000),
      1_000,
      CLAUDE_ON,
      ["a"],
    );
    expect(next.armed).toBe(true);
  });

  it("does NOT arm below the tolerance", () => {
    const { next, fireIds } = evaluateAutoContinue(
      IDLE_AUTO_CONTINUE,
      usage(99.4, 5_000),
      1_000,
      CLAUDE_ON,
      ["a"],
    );
    expect(next).toBe(IDLE_AUTO_CONTINUE);
    expect(fireIds).toEqual([]);
  });

  it("does NOT arm at the limit with no live Claude sessions", () => {
    const { next } = evaluateAutoContinue(
      IDLE_AUTO_CONTINUE,
      usage(100, 5_000),
      1_000,
      CLAUDE_ON,
      [],
    );
    expect(next.armed).toBe(false);
  });

  it("captures a snapshot copy of the live ids (later mutation is inert)", () => {
    const ids = ["a", "b"];
    const { next } = evaluateAutoContinue(
      IDLE_AUTO_CONTINUE,
      usage(100, 5_000),
      1_000,
      CLAUDE_ON,
      ids,
    );
    ids.push("c");
    expect(next.sessionIds).toEqual(["a", "b"]);
  });
});

describe("evaluateAutoContinue — staying armed", () => {
  it("stays armed while still over the limit before reset", () => {
    const prev = armed(10_000, ["a", "b"]);
    const { next, fireIds } = evaluateAutoContinue(
      prev,
      usage(100, 10_000),
      5_000, // now < resetsAtMs
      CLAUDE_ON,
      ["a", "b"],
    );
    expect(next).toBe(prev);
    expect(fireIds).toEqual([]);
  });

  it("stays armed when the reset time passed but the percentage is still high", () => {
    const prev = armed(10_000, ["a"]);
    const { next, fireIds } = evaluateAutoContinue(
      prev,
      usage(95, 10_000), // >= RESET_CONFIRM_PCT
      20_000, // now >= resetsAtMs
      CLAUDE_ON,
      ["a"],
    );
    expect(next).toBe(prev);
    expect(fireIds).toEqual([]);
  });

  it("stays armed when the percentage dropped but the reset time hasn't passed", () => {
    const prev = armed(10_000, ["a"]);
    const { next, fireIds } = evaluateAutoContinue(
      prev,
      usage(5, 10_000), // dropped
      5_000, // now < resetsAtMs
      CLAUDE_ON,
      ["a"],
    );
    expect(next).toBe(prev);
    expect(fireIds).toEqual([]);
  });
});

describe("evaluateAutoContinue — firing", () => {
  it("fires when both the reset time has passed AND the percentage dropped", () => {
    const prev = armed(10_000, ["a", "b"]);
    const { next, fireIds } = evaluateAutoContinue(
      prev,
      usage(5, 10_000),
      20_000, // now >= resetsAtMs
      CLAUDE_ON,
      ["a", "b"],
    );
    expect(next).toBe(IDLE_AUTO_CONTINUE);
    expect(fireIds).toEqual(["a", "b"]);
  });

  it("fires only the captured sessions still live (skips exited ones)", () => {
    const prev = armed(10_000, ["a", "b", "c"]);
    const { fireIds } = evaluateAutoContinue(
      prev,
      usage(5, 10_000),
      20_000,
      CLAUDE_ON,
      ["a", "c", "d"], // b exited, d is new/unrelated
    );
    expect(fireIds).toEqual(["a", "c"]);
  });

  it("no-reset-time fallback: fires on the percentage drop alone", () => {
    const prev = armed(null, ["a"]);
    const { next, fireIds } = evaluateAutoContinue(
      prev,
      usage(5, null),
      Date.now(),
      CLAUDE_ON,
      ["a"],
    );
    expect(next).toBe(IDLE_AUTO_CONTINUE);
    expect(fireIds).toEqual(["a"]);
  });

  it("does not fire at exactly the confirm threshold (must drop below)", () => {
    const prev = armed(10_000, ["a"]);
    const { next, fireIds } = evaluateAutoContinue(
      prev,
      usage(RESET_CONFIRM_PCT, 10_000),
      20_000,
      CLAUDE_ON,
      ["a"],
    );
    expect(next).toBe(prev);
    expect(fireIds).toEqual([]);
  });
});

describe("evaluateAutoContinue — inert / never fires", () => {
  it("never arms or fires when the feature is off (disarms if armed)", () => {
    const off: AutoContinueConfig = { enabled: false, defaultAgent: "claude" };
    // Would-arm snapshot:
    expect(
      evaluateAutoContinue(IDLE_AUTO_CONTINUE, usage(100, 1), 0, off, ["a"]),
    ).toEqual({ next: IDLE_AUTO_CONTINUE, fireIds: [] });
    // Would-fire snapshot while armed → disarm, no fire.
    const prev = armed(10_000, ["a"]);
    const res = evaluateAutoContinue(prev, usage(5, 10_000), 20_000, off, [
      "a",
    ]);
    expect(res.next).toBe(IDLE_AUTO_CONTINUE);
    expect(res.fireIds).toEqual([]);
  });

  it("never arms or fires when the default agent isn't Claude", () => {
    const codex: AutoContinueConfig = { enabled: true, defaultAgent: "codex" };
    expect(
      evaluateAutoContinue(IDLE_AUTO_CONTINUE, usage(100, 1), 0, codex, ["a"]),
    ).toEqual({ next: IDLE_AUTO_CONTINUE, fireIds: [] });
    const prev = armed(10_000, ["a"]);
    const res = evaluateAutoContinue(prev, usage(5, 10_000), 20_000, codex, [
      "a",
    ]);
    expect(res.next).toBe(IDLE_AUTO_CONTINUE);
    expect(res.fireIds).toEqual([]);
  });

  it("is inert (disarms) when usage data is unavailable", () => {
    const prev = armed(10_000, ["a"]);
    const res = evaluateAutoContinue(
      prev,
      usage(null, null, false),
      20_000,
      CLAUDE_ON,
      ["a"],
    );
    expect(res.next).toBe(IDLE_AUTO_CONTINUE);
    expect(res.fireIds).toEqual([]);
  });

  it("is inert (disarms) when usedPercent is null even if marked available", () => {
    const prev = armed(10_000, ["a"]);
    const res = evaluateAutoContinue(
      prev,
      usage(null, 10_000, true),
      20_000,
      CLAUDE_ON,
      ["a"],
    );
    expect(res.next).toBe(IDLE_AUTO_CONTINUE);
    expect(res.fireIds).toEqual([]);
  });

  it("returns the same disarmed reference when inert and already disarmed", () => {
    const res = evaluateAutoContinue(
      IDLE_AUTO_CONTINUE,
      usage(null, null, false),
      0,
      CLAUDE_ON,
      [],
    );
    expect(res.next).toBe(IDLE_AUTO_CONTINUE);
  });
});
