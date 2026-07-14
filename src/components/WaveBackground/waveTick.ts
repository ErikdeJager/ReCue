// Pure frame-gate for the wave background's rAF loop (UI v2 task 377) — the
// reference host's (fx.js) tick discipline as a testable reducer. The host owns
// the mutable GateState; each rAF calls gateFrame() and only simulates/draws
// when it says so.

export const FPS_CAP = 48;
export const SETTLE_FRAMES = 240; // ~5s at the cap — "settle a few seconds, then freeze"

export interface GateState {
  /** Timestamp of the last DRAWN frame; 0 = no timebase (first frame / just unhidden). */
  last: number;
  /** Frames drawn so far (drives the reduced-motion settle-then-freeze). */
  frames: number;
  /** Frame count past which a reduced-motion run freezes (re-armed on recolor). */
  freezeFloor: number;
}

export const initialGateState = (): GateState => ({
  last: 0,
  frames: 0,
  freezeFloor: SETTLE_FRAMES,
});

/** One rAF decision, mirroring the reference host: hidden ⇒ skip + reset the timebase;
 * frozen (reduced && settled) ⇒ skip; 48fps cap ⇒ skip; else draw with clamped dt. */
export function gateFrame(
  s: GateState,
  now: number,
  input: { hidden: boolean; reduced: boolean },
): { draw: boolean; dt: number; next: GateState } {
  // Hidden: no simulation work, and reset the timebase so the return frame
  // doesn't integrate the whole hidden span as one giant dt.
  if (input.hidden) return { draw: false, dt: 0, next: { ...s, last: 0 } };
  // Reduced motion, settled: freeze (the canvas keeps its last frame). State is
  // unchanged so the animation resumes the instant `reduced` clears.
  if (input.reduced && s.frames > s.freezeFloor) {
    return { draw: false, dt: 0, next: s };
  }
  // ~48fps cap (the -1ms slack absorbs rAF timestamp jitter).
  if (s.last && now - s.last < 1000 / FPS_CAP - 1) {
    return { draw: false, dt: 0, next: s };
  }
  const dt = s.last
    ? Math.min(0.05, Math.max(0.001, (now - s.last) / 1000))
    : 1 / 60;
  return {
    draw: true,
    dt,
    next: { last: now, frames: s.frames + 1, freezeFloor: s.freezeFloor },
  };
}

/** Re-arm one settle window (accent recolor while frozen): the wave repaints in the
 * new hue for SETTLE_FRAMES frames, then freezes again. */
export const rearmSettle = (s: GateState): GateState => ({
  ...s,
  freezeFloor: s.frames + SETTLE_FRAMES,
});
