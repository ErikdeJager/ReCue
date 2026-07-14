import { describe, expect, it } from "vitest";

import {
  FPS_CAP,
  gateFrame,
  initialGateState,
  rearmSettle,
  SETTLE_FRAMES,
  type GateState,
} from "./waveTick";

const visible = { hidden: false, reduced: false };

describe("gateFrame", () => {
  it("first frame draws with dt = 1/60 (no timebase yet)", () => {
    const r = gateFrame(initialGateState(), 1000, visible);
    expect(r.draw).toBe(true);
    expect(r.dt).toBeCloseTo(1 / 60);
    expect(r.next).toEqual({
      last: 1000,
      frames: 1,
      freezeFloor: SETTLE_FRAMES,
    });
  });

  it("hidden skips and resets the timebase (no dt jump on return)", () => {
    const s: GateState = { last: 1000, frames: 5, freezeFloor: SETTLE_FRAMES };
    const r = gateFrame(s, 61000, { hidden: true, reduced: false });
    expect(r.draw).toBe(false);
    expect(r.next).toEqual({ ...s, last: 0 });
    // The return frame draws with the fresh-timebase dt, not a 60s jump.
    const back = gateFrame(r.next, 61016, visible);
    expect(back.draw).toBe(true);
    expect(back.dt).toBeCloseTo(1 / 60);
  });

  it("caps at ~48fps: a too-soon frame skips without touching state", () => {
    const s: GateState = { last: 1000, frames: 1, freezeFloor: SETTLE_FRAMES };
    const soon = gateFrame(s, 1000 + 1000 / FPS_CAP - 2, visible);
    expect(soon.draw).toBe(false);
    expect(soon.next).toEqual(s);
    const due = gateFrame(s, 1000 + 1000 / FPS_CAP, visible);
    expect(due.draw).toBe(true);
  });

  it("clamps dt to [0.001, 0.05]", () => {
    const s: GateState = { last: 1000, frames: 1, freezeFloor: SETTLE_FRAMES };
    // A huge gap (e.g. a paused debugger) clamps to 0.05.
    expect(gateFrame(s, 9000, visible).dt).toBe(0.05);
    // dt from `now - last` never goes below the 0.001 floor.
    const tiny = gateFrame(s, 1000 + 1000 / FPS_CAP, visible);
    expect(tiny.dt).toBeGreaterThanOrEqual(0.001);
    expect(tiny.dt).toBeCloseTo(1 / FPS_CAP, 3);
  });

  it("reduced motion settles for SETTLE_FRAMES frames, then freezes", () => {
    const reduced = { hidden: false, reduced: true };
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
    const reduced = { hidden: false, reduced: true };
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
