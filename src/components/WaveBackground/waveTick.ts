// Pure frame-gate for the wave background's rAF loop (UI v2 task 377) — the
// reference host's (fx.js) tick discipline as a testable reducer. The host owns
// the mutable GateState; each rAF calls gateFrame() and only simulates/draws
// when it says so. Task 384 widened it with a `covered` pause (panels tile over
// the stage — treated exactly like `document.hidden`) and a busy-aware fps cap.

export const FPS_CAP = 48;
/** Any agent busy (#42) ⇒ cap the wave at half rate so it competes less with
 * xterm paints / React commits under load (task 384). dt-integrated, so the
 * pattern's drift speed is unchanged — only its refresh cost drops. */
export const BUSY_FPS_CAP = 24;
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
 * covered (panels tile over the stage, task 384) ⇒ identical skip + reset (nothing
 * shows, so no simulation cost); frozen (reduced && settled) ⇒ skip; fps cap (24 when
 * any agent is busy, else 48) ⇒ skip; else draw with clamped dt. */
export function gateFrame(
  s: GateState,
  now: number,
  input: { hidden: boolean; reduced: boolean; covered: boolean; busy: boolean },
): { draw: boolean; dt: number; next: GateState } {
  // Hidden: no simulation work, and reset the timebase so the return frame
  // doesn't integrate the whole hidden span as one giant dt.
  if (input.hidden) return { draw: false, dt: 0, next: { ...s, last: 0 } };
  // Covered by panels (task 384): the wave is entirely occluded, so skip exactly
  // like `hidden` — no `eng.frame`, and reset the timebase so the first resumed
  // frame (last panel closed) integrates dt = 1/60, not the whole covered span.
  // `frames` is untouched, so a covered pause never advances the settle counter.
  if (input.covered) return { draw: false, dt: 0, next: { ...s, last: 0 } };
  // Reduced motion, settled: freeze (the canvas keeps its last frame). State is
  // unchanged so the animation resumes the instant `reduced` clears.
  if (input.reduced && s.frames > s.freezeFloor) {
    return { draw: false, dt: 0, next: s };
  }
  // fps cap (the -1ms slack absorbs rAF timestamp jitter): 24 while any agent is
  // busy, 48 otherwise.
  const cap = input.busy ? BUSY_FPS_CAP : FPS_CAP;
  if (s.last && now - s.last < 1000 / cap - 1) {
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
