import { describe, expect, it } from "vitest";

// #296/task 430: only the pure UI helpers remain frontend-side — the reducer and
// its full case suite (arm/wait/fire, inert variants, fired-set filtering) moved
// to Rust with the engine (`src-tauri/src/autocontinue.rs`'s unit tests mirror the
// old cases one for one).
import {
  ARM_THRESHOLD_PCT,
  isLimitReached,
  LIMIT_REACHED_PCT,
  LIMIT_REACHED_TOLERANCE,
} from "./autoContinue";

const usage = (usedPercent: number | null, available = true) => ({
  usedPercent,
  available,
});

describe("limit constants", () => {
  it("uses the specified thresholds", () => {
    expect(LIMIT_REACHED_PCT).toBe(100);
    expect(LIMIT_REACHED_TOLERANCE).toBe(0.5);
    // The Rust engine's ARM_THRESHOLD_PCT mirrors this exact value (asserted in
    // its own unit tests), so UI "limit reached" and engine arming agree.
    expect(ARM_THRESHOLD_PCT).toBe(99.5);
  });
});

describe("isLimitReached", () => {
  it("is true at exactly the arm threshold (99.5%)", () => {
    expect(isLimitReached(usage(ARM_THRESHOLD_PCT))).toBe(true);
  });

  it("is true above the arm threshold (100%)", () => {
    expect(isLimitReached(usage(100))).toBe(true);
  });

  it("is false just below the arm threshold", () => {
    expect(isLimitReached(usage(99.4))).toBe(false);
    expect(isLimitReached(usage(0))).toBe(false);
  });

  it("is false when usage data is unavailable, even at 100%", () => {
    expect(isLimitReached(usage(100, false))).toBe(false);
  });

  it("is false when usedPercent is null", () => {
    expect(isLimitReached(usage(null))).toBe(false);
  });

  it("accepts the full usage slice (structural type)", () => {
    // The per-agent checkbox (#305) passes the whole store `usage` object; the
    // narrow param accepts it structurally, with the same threshold behavior as
    // the `{ usedPercent, available }` literals the #309 prompt button passes.
    const slice = {
      usedPercent: 99.5,
      resetsAtMs: 5_000,
      available: true,
      buckets: [],
    };
    expect(isLimitReached(slice)).toBe(true);
    expect(isLimitReached({ ...slice, usedPercent: 99.4 })).toBe(false);
    expect(isLimitReached({ ...slice, usedPercent: null })).toBe(false);
    expect(isLimitReached({ ...slice, available: false })).toBe(false);
  });
});
