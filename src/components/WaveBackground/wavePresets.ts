// Wave background surface presets (UI v2 §3, task 377) + the pure selector that
// decides which preset the main window's wave runs. Kept pure/unit-testable —
// the WaveBackground host applies a preset by MUTATING its live config object
// (never a remount, never a reseed).

export type WavePresetName = "overview" | "canvas" | "hero";

/** Spec §3 tuned surface presets (density / speed / primaryWaves / trailLength). */
export const WAVE_PRESETS: Record<
  WavePresetName,
  { density: number; speed: number; primaryWaves: number; trailLength: number }
> = {
  overview: { density: 420, speed: 0.85, primaryWaves: 0.04, trailLength: 3.4 },
  canvas: { density: 420, speed: 0.8, primaryWaves: 0.035, trailLength: 3.4 },
  hero: { density: 950, speed: 1.05, primaryWaves: 0.07, trailLength: 3.4 },
};

/** The non-preset cfg fields, from the reference host (fx.js). */
export const WAVE_BASE = { waveScale: 1, swirl: 1.9, lifeMin: 10, lifeMax: 20 };

/** True when the Overview wall would show the welcome EmptyState — no agents, no
 * panels, no schedules, no recurrings (mirrors Overview.tsx's gate; shared so the
 * hero preset can never drift from the EmptyState render). */
export function overviewIsEmpty(args: {
  sessions: readonly unknown[];
  overviewPanels: Record<string, readonly unknown[]>;
  schedules: readonly unknown[];
  recurrings: readonly unknown[];
}): boolean {
  const anyPanels = Object.values(args.overviewPanels).some(
    (list) => list.length > 0,
  );
  return (
    args.sessions.length === 0 &&
    !anyPanels &&
    args.schedules.length === 0 &&
    args.recurrings.length === 0
  );
}

/** Which preset the main window's wave runs (detached windows are always "canvas"). */
export function selectWavePreset(
  view: "overview" | "canvas",
  overviewEmpty: boolean,
): WavePresetName {
  if (view === "canvas") return "canvas";
  return overviewEmpty ? "hero" : "overview";
}
