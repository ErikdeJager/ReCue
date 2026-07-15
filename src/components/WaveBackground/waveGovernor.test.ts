import { describe, expect, it } from "vitest";

import {
  DEGRADE_BUDGET_MS,
  EVAL_WINDOW_MS,
  govScale,
  initialGovState,
  initialStats,
  MIN_DRAWN_TO_DEGRADE,
  recordFrame,
  recordStat,
  statsSnapshot,
  STATS_SAMPLE_CAP,
  WAVE_SCALES,
  type GovState,
  type StatsAccum,
} from "./waveGovernor";

/** Feed `count` frames of `drawMs` each within the window; return the state after. */
function feedWindow(s: GovState, drawMs: number, count: number): GovState {
  let st = s;
  for (let i = 0; i < count; i++) {
    // Keep every frame inside the window (well under EVAL_WINDOW_MS).
    const r = recordFrame(st, drawMs, st.windowStart + (i + 1));
    st = r.next;
  }
  return st;
}

describe("waveGovernor", () => {
  it("starts at full scale (1.0)", () => {
    const s = initialGovState(0);
    expect(s.scaleIdx).toBe(0);
    expect(govScale(s)).toBe(1);
  });

  it("does not degrade while frames are cheap", () => {
    let s = initialGovState(0);
    s = feedWindow(s, 2, MIN_DRAWN_TO_DEGRADE + 5);
    // Cross the window with the closing frame; cheap avg ⇒ no degrade, window resets.
    const r = recordFrame(s, 2, EVAL_WINDOW_MS + 1);
    expect(r.degradeTo).toBeNull();
    expect(govScale(r.next)).toBe(1);
    expect(r.next.drawn).toBe(0);
    expect(r.next.windowStart).toBe(EVAL_WINDOW_MS + 1);
  });

  it("degrades one step on sustained overrun once the window elapses", () => {
    let s = initialGovState(0);
    // Enough expensive frames to clear the min-frames guard.
    s = feedWindow(s, DEGRADE_BUDGET_MS + 4, MIN_DRAWN_TO_DEGRADE + 5);
    const r = recordFrame(s, DEGRADE_BUDGET_MS + 4, EVAL_WINDOW_MS + 1);
    expect(r.degradeTo).toBe(WAVE_SCALES[1]); // 0.75
    expect(r.next.scaleIdx).toBe(1);
    // Window reset after a degrade.
    expect(r.next.drawn).toBe(0);
    expect(r.next.totalMs).toBe(0);
  });

  it("will not degrade on a brief expensive stall (< MIN_DRAWN_TO_DEGRADE frames)", () => {
    let s = initialGovState(0);
    s = feedWindow(s, DEGRADE_BUDGET_MS + 20, MIN_DRAWN_TO_DEGRADE - 5);
    const r = recordFrame(s, DEGRADE_BUDGET_MS + 20, EVAL_WINDOW_MS + 1);
    expect(r.degradeTo).toBeNull();
    expect(govScale(r.next)).toBe(1);
  });

  it("steps 1 → 0.75 → 0.5 and never below (never back up)", () => {
    let s = initialGovState(0);
    const overrun = () => {
      s = feedWindow(s, DEGRADE_BUDGET_MS + 10, MIN_DRAWN_TO_DEGRADE + 2);
      return recordFrame(
        s,
        DEGRADE_BUDGET_MS + 10,
        s.windowStart + EVAL_WINDOW_MS + 1,
      );
    };
    const r1 = overrun();
    expect(r1.degradeTo).toBe(0.75);
    s = r1.next;
    const r2 = overrun();
    expect(r2.degradeTo).toBe(0.5);
    s = r2.next;
    // Already at the floor: still overrunning, but no further degrade is offered.
    const r3 = overrun();
    expect(r3.degradeTo).toBeNull();
    expect(govScale(r3.next)).toBe(0.5);
    s = r3.next;
    // Cheap frames afterward NEVER scale it back up within the run.
    s = feedWindow(s, 1, MIN_DRAWN_TO_DEGRADE + 2);
    const r4 = recordFrame(s, 1, s.windowStart + EVAL_WINDOW_MS + 1);
    expect(r4.degradeTo).toBeNull();
    expect(govScale(r4.next)).toBe(0.5);
  });

  it("accumulates within a window without resetting mid-window", () => {
    const s = initialGovState(1000);
    const r = recordFrame(s, 5, 1500); // still inside the window
    expect(r.degradeTo).toBeNull();
    expect(r.next.drawn).toBe(1);
    expect(r.next.totalMs).toBe(5);
    expect(r.next.windowStart).toBe(1000);
  });
});

describe("wave stats aggregator", () => {
  it("computes fps, avg and p95 over a window", () => {
    let s = initialStats(0);
    for (const ms of [2, 4, 6, 8, 10]) s = recordStat(s, ms);
    // 5 frames over 2.5s ⇒ 2fps; avg 6ms; p95 lands on the top sample here.
    const snap = statsSnapshot(s, 2500);
    expect(snap.drawn).toBe(5);
    expect(snap.fps).toBeCloseTo(2);
    expect(snap.avg).toBeCloseTo(6);
    expect(snap.p95).toBe(10);
  });

  it("bounds the sample array but keeps counting drawn frames", () => {
    let s: StatsAccum = initialStats(0);
    for (let i = 0; i < STATS_SAMPLE_CAP + 50; i++) s = recordStat(s, 3);
    expect(s.samples.length).toBe(STATS_SAMPLE_CAP);
    expect(s.drawn).toBe(STATS_SAMPLE_CAP + 50);
    const snap = statsSnapshot(s, 1000);
    expect(snap.drawn).toBe(STATS_SAMPLE_CAP + 50);
    expect(snap.avg).toBeCloseTo(3);
  });

  it("is safe with no samples", () => {
    const snap = statsSnapshot(initialStats(0), 1000);
    expect(snap.drawn).toBe(0);
    expect(snap.fps).toBe(0);
    expect(snap.avg).toBe(0);
    expect(snap.p95).toBe(0);
  });
});
