// Pure adaptive-resolution governor + stats aggregator for the wave background
// (task 384). Both the main-thread host and the OffscreenCanvas worker feed each
// DRAWN frame's `eng.frame` wall time in; the governor steps the render buffer
// down (1 → 0.75 → 0.5 of CSS pixels) on sustained overrun and NEVER back up
// within a run. CSS upscales the smaller buffer; the engine's area-scaled strand
// count also drops, so a struggling box gets cheaper frames automatically.

/** Render-buffer scale ladder (fraction of CSS pixels). One-way: only ever steps
 * down (index up), never back up within a run. */
export const WAVE_SCALES = [1, 0.75, 0.5] as const;

/** Average `eng.frame` wall time (ms) over an eval window above which we degrade. */
export const DEGRADE_BUDGET_MS = 8;

/** Length of one evaluation window (ms). */
export const EVAL_WINDOW_MS = 4000;

/** Minimum drawn frames in a window before a degrade decision is trusted (a brief
 * stall of a few frames must not trigger a downscale). */
export const MIN_DRAWN_TO_DEGRADE = 30;

export interface GovState {
  /** Index into WAVE_SCALES (0 = full res, 2 = half). */
  scaleIdx: 0 | 1 | 2;
  /** Wall-clock start of the current eval window. */
  windowStart: number;
  /** Accumulated `eng.frame` ms this window. */
  totalMs: number;
  /** Drawn frames this window. */
  drawn: number;
}

export const initialGovState = (now: number): GovState => ({
  scaleIdx: 0,
  windowStart: now,
  totalMs: 0,
  drawn: 0,
});

/** The current render scale (fraction of CSS pixels). */
export const govScale = (s: GovState): number => WAVE_SCALES[s.scaleIdx];

/**
 * Fold one drawn frame's `eng.frame` wall time into the governor. Returns the next
 * state and, when a window just closed with sustained overrun, the new (lower)
 * scale to apply — else `null`. The window resets whenever it elapses, degrade or
 * not, so measurement always covers a fresh EVAL_WINDOW_MS.
 */
export function recordFrame(
  s: GovState,
  drawMs: number,
  now: number,
): { next: GovState; degradeTo: number | null } {
  const totalMs = s.totalMs + drawMs;
  const drawn = s.drawn + 1;
  if (now - s.windowStart < EVAL_WINDOW_MS) {
    return { next: { ...s, totalMs, drawn }, degradeTo: null };
  }
  // Window elapsed: decide, then reset it either way.
  if (
    drawn >= MIN_DRAWN_TO_DEGRADE &&
    totalMs / drawn > DEGRADE_BUDGET_MS &&
    s.scaleIdx < 2
  ) {
    const scaleIdx = (s.scaleIdx + 1) as 0 | 1 | 2;
    return {
      next: { scaleIdx, windowStart: now, totalMs: 0, drawn: 0 },
      degradeTo: WAVE_SCALES[scaleIdx],
    };
  }
  return {
    next: { ...s, windowStart: now, totalMs: 0, drawn: 0 },
    degradeTo: null,
  };
}

// ---------- stats probe aggregator ----------
// The dev probe (localStorage["recue.waveStats"] = "1") reports fps + avg + p95
// `eng.frame` cost every ~5s. Kept pure so the host/worker just feed samples and
// snapshot; the impure log/window-mirror lives in waveHost.

/** How often the stats probe logs a snapshot (ms). */
export const STATS_INTERVAL_MS = 5000;

/** Bound the retained per-frame sample array so a long run can't grow it without
 * limit (48fps × 5s ≈ 240 < cap). */
export const STATS_SAMPLE_CAP = 320;

export interface StatsAccum {
  /** Recent per-frame `eng.frame` ms (bounded to STATS_SAMPLE_CAP for the percentile). */
  samples: number[];
  /** Drawn frames since `windowStart` (uncapped — drives fps). */
  drawn: number;
  /** Wall-clock start of the current stats window. */
  windowStart: number;
}

export const initialStats = (now: number): StatsAccum => ({
  samples: [],
  drawn: 0,
  windowStart: now,
});

/** Fold one drawn frame's wall time into the stats accumulator (bounded FIFO). */
export function recordStat(s: StatsAccum, drawMs: number): StatsAccum {
  const samples =
    s.samples.length >= STATS_SAMPLE_CAP
      ? [...s.samples.slice(1), drawMs]
      : [...s.samples, drawMs];
  return { samples, drawn: s.drawn + 1, windowStart: s.windowStart };
}

export interface StatsSnapshot {
  /** Drawn frames per second over the window. */
  fps: number;
  /** Mean `eng.frame` cost (ms). */
  avg: number;
  /** 95th-percentile `eng.frame` cost (ms). */
  p95: number;
  /** Drawn frames in the window. */
  drawn: number;
}

/** Snapshot the window's fps / avg / p95 from the accumulated samples. Pure. */
export function statsSnapshot(s: StatsAccum, now: number): StatsSnapshot {
  const seconds = Math.max(0.001, (now - s.windowStart) / 1000);
  const n = s.samples.length;
  const fps = s.drawn / seconds;
  const avg = n ? s.samples.reduce((a, b) => a + b, 0) / n : 0;
  const sorted = [...s.samples].sort((a, b) => a - b);
  const p95 = n ? (sorted[Math.min(n - 1, Math.floor(n * 0.95))] ?? 0) : 0;
  return { fps, avg, p95, drawn: s.drawn };
}
