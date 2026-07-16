import { describe, expect, it } from "vitest";

import {
  BUSY_FPS_CAP,
  FPS_CAP,
  gateFrame,
  initialGateState,
  rearmSettle,
  SETTLE_FRAMES,
  WAVE_TIME_SCALE,
  type GateState,
} from "./waveTick";

const visible = { hidden: false, reduced: false, covered: false, busy: false };

describe("gateFrame", () => {
  it("first frame draws with dt = 1/60 (no timebase yet)", () => {
    const r = gateFrame(initialGateState(), 1000, visible);
    expect(r.draw).toBe(true);
    expect(r.dt).toBeCloseTo((1 / 60) * WAVE_TIME_SCALE);
    expect(r.next).toEqual({
      last: 1000,
      frames: 1,
      freezeFloor: SETTLE_FRAMES,
    });
  });

  it("hidden skips and resets the timebase (no dt jump on return)", () => {
    const s: GateState = { last: 1000, frames: 5, freezeFloor: SETTLE_FRAMES };
    const r = gateFrame(s, 61000, { ...visible, hidden: true });
    expect(r.draw).toBe(false);
    expect(r.next).toEqual({ ...s, last: 0 });
    // The return frame draws with the fresh-timebase dt, not a 60s jump.
    const back = gateFrame(r.next, 61016, visible);
    expect(back.draw).toBe(true);
    expect(back.dt).toBeCloseTo((1 / 60) * WAVE_TIME_SCALE);
  });

  it("covered skips and resets the timebase, exactly like hidden (task 384)", () => {
    const s: GateState = { last: 1000, frames: 5, freezeFloor: SETTLE_FRAMES };
    const r = gateFrame(s, 61000, { ...visible, covered: true });
    expect(r.draw).toBe(false);
    // Timebase reset; frames untouched (no eng.frame ran).
    expect(r.next).toEqual({ ...s, last: 0 });
    // Uncovering (last panel closed) resumes the SAME state with a default dt =
    // 1/60, not the whole covered span integrated as one giant step.
    const back = gateFrame(r.next, 90000, visible);
    expect(back.draw).toBe(true);
    expect(back.dt).toBeCloseTo((1 / 60) * WAVE_TIME_SCALE);
  });

  it("covered does not advance the reduced-motion settle counter", () => {
    // A run that has already settled + frozen under reduced motion stays frozen —
    // a covered skip must not touch `frames`/`freezeFloor`, so it never re-arms
    // or exhausts the settle window.
    const s: GateState = {
      last: 1000,
      frames: SETTLE_FRAMES + 50,
      freezeFloor: SETTLE_FRAMES,
    };
    const r = gateFrame(s, 2000, { ...visible, covered: true, reduced: true });
    expect(r.draw).toBe(false);
    expect(r.next.frames).toBe(s.frames);
    expect(r.next.freezeFloor).toBe(s.freezeFloor);
  });

  it("covered outranks the fps cap (a due frame still skips while covered)", () => {
    const s: GateState = { last: 1000, frames: 1, freezeFloor: SETTLE_FRAMES };
    // Well past the 48fps window, so uncovered it would draw — covered skips it.
    expect(gateFrame(s, 2000, { ...visible, covered: true }).draw).toBe(false);
    expect(gateFrame(s, 2000, visible).draw).toBe(true);
  });

  it("caps at ~48fps: a too-soon frame skips without touching state", () => {
    const s: GateState = { last: 1000, frames: 1, freezeFloor: SETTLE_FRAMES };
    const soon = gateFrame(s, 1000 + 1000 / FPS_CAP - 2, visible);
    expect(soon.draw).toBe(false);
    expect(soon.next).toEqual(s);
    const due = gateFrame(s, 1000 + 1000 / FPS_CAP, visible);
    expect(due.draw).toBe(true);
  });

  it("caps at ~24fps when any agent is busy (task 384)", () => {
    const s: GateState = { last: 1000, frames: 1, freezeFloor: SETTLE_FRAMES };
    // ~40ms after the last frame: under the 24fps window (1000/24 ≈ 41.7ms), skip.
    const soon = gateFrame(s, 1040, { ...visible, busy: true });
    expect(soon.draw).toBe(false);
    expect(soon.next).toEqual(s);
    // ~41.7ms after: the 24fps frame is due, so draw.
    const due = gateFrame(s, 1000 + 1000 / BUSY_FPS_CAP, {
      ...visible,
      busy: true,
    });
    expect(due.draw).toBe(true);
    // That same 40ms frame *would* have drawn at 48fps — the busy cap skips it.
    expect(gateFrame(s, 1040, visible).draw).toBe(true);
  });

  it("clamps dt to [0.001, 0.05]", () => {
    const s: GateState = { last: 1000, frames: 1, freezeFloor: SETTLE_FRAMES };
    // A huge gap (e.g. a paused debugger) clamps to 0.05 (pre-scale), then scales.
    expect(gateFrame(s, 9000, visible).dt).toBeCloseTo(0.05 * WAVE_TIME_SCALE);
    // dt from `now - last` never goes below the 0.001 floor (pre-scale); the
    // scaled value ((1/48)*0.7 ≈ 0.0146) is still above the floor.
    const tiny = gateFrame(s, 1000 + 1000 / FPS_CAP, visible);
    expect(tiny.dt).toBeGreaterThanOrEqual(0.001);
    expect(tiny.dt).toBeCloseTo((1 / FPS_CAP) * WAVE_TIME_SCALE, 3);
  });

  it("scales the drawn dt by WAVE_TIME_SCALE (task 442 — slower wave drift)", () => {
    const s: GateState = { last: 1000, frames: 1, freezeFloor: SETTLE_FRAMES };
    const r = gateFrame(s, 1000 + 1000 / FPS_CAP, visible);
    const physical = 1 / FPS_CAP;
    expect(r.draw).toBe(true);
    expect(r.dt).toBeCloseTo(physical * WAVE_TIME_SCALE, 4);
    expect(r.dt).toBeLessThan(physical);
  });

  it("reduced motion settles for SETTLE_FRAMES frames, then freezes", () => {
    const reduced = { ...visible, reduced: true };
    // Not yet settled: draws.
    const settling: GateState = {
      last: 1000,
      frames: SETTLE_FRAMES,
      freezeFloor: SETTLE_FRAMES,
    };
    expect(gateFrame(settling, 2000, reduced).draw).toBe(true);
    // Past the floor: frozen, state unchanged.
    const settled: GateState = {
      last: 1000,
      frames: SETTLE_FRAMES + 1,
      freezeFloor: SETTLE_FRAMES,
    };
    const frozen = gateFrame(settled, 2000, reduced);
    expect(frozen.draw).toBe(false);
    expect(frozen.next).toEqual(settled);
    // The instant `reduced` clears, the same state resumes drawing.
    expect(gateFrame(settled, 2000, visible).draw).toBe(true);
  });

  it("rearmSettle grants one more settle window while frozen (recolor)", () => {
    const reduced = { ...visible, reduced: true };
    const settled: GateState = {
      last: 1000,
      frames: 500,
      freezeFloor: SETTLE_FRAMES,
    };
    expect(gateFrame(settled, 2000, reduced).draw).toBe(false);
    const rearmed = rearmSettle(settled);
    expect(rearmed.freezeFloor).toBe(500 + SETTLE_FRAMES);
    // Draws again for another SETTLE_FRAMES frames...
    expect(gateFrame(rearmed, 2000, reduced).draw).toBe(true);
    // ...then freezes once past the new floor.
    const again: GateState = { ...rearmed, frames: 500 + SETTLE_FRAMES + 1 };
    expect(gateFrame(again, 3000, reduced).draw).toBe(false);
  });
});
