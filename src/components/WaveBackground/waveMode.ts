// Wave render-mode resolution (task 384). Worker + OffscreenCanvas rendering is
// feature-detected; when unavailable (e.g. WebKitGTK ≤2.38 on the Ubuntu 22.04
// floor) the wave falls back to the main-thread loop. `localStorage["recue.waveMode"]`
// force-picks for testing ("main" always honored; "worker" still requires detection).

export type WaveMode = "worker" | "main";

/**
 * Resolve the effective mode from the optional `recue.waveMode` override and the
 * feature-detection result. Pure:
 *   - `"main"`  → always main (a hard opt-out for testing / broken worker).
 *   - `"worker"` → worker only when detected (a supported platform), else main.
 *   - anything else (null / unset / junk) → worker when detected, else main.
 */
export function resolveWaveMode(
  override: string | null,
  detected: boolean,
): WaveMode {
  if (override === "main") return "main";
  return detected ? "worker" : "main";
}

/**
 * Feature-detect worker + OffscreenCanvas rendering. Impure (touches DOM globals),
 * kept thin so the pure resolver above carries all the branching logic. Any missing
 * primitive — or a browser that has the constructors but can't actually make a 2d
 * OffscreenCanvas context — reads as unsupported ⇒ the main-thread loop runs.
 */
export function detectWorkerWave(): boolean {
  if (
    typeof Worker !== "function" ||
    typeof OffscreenCanvas !== "function" ||
    typeof HTMLCanvasElement === "undefined" ||
    !("transferControlToOffscreen" in HTMLCanvasElement.prototype)
  ) {
    return false;
  }
  try {
    return new OffscreenCanvas(2, 2).getContext("2d") !== null;
  } catch {
    return false;
  }
}
