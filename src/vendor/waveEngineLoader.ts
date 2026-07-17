// WaveEngine loader (UI v2 task 377). The vendored src/vendor/WaveEngine.js is a
// plain script (no export) and is NEVER edited (sha256-pinned by waveEngine.test.ts);
// evaluate its verbatim source in a function scope and capture the factory. Requires
// no CSP or a CSP with 'unsafe-eval' — tauri.conf.json ships csp: null. This module
// is loaded only via dynamic import() (#356), keeping the engine off the first-paint path.
//
// Named waveEngineLoader (NOT waveEngine.ts): an extensionless `./waveEngine` import
// resolves through Vite's extension order (`.js` before `.ts`), and on a
// case-insensitive filesystem (macOS/Windows dev boxes) `waveEngine.js` matches the
// vendored `WaveEngine.js` — silently importing the export-less engine script on one
// OS and the loader on another. A non-colliding basename removes the trap entirely.
import raw from "./WaveEngine.js?raw";

export interface WaveConfig {
  speed: number;
  waveScale: number;
  swirl: number;
  density: number;
  trailLength: number;
  primaryWaves: number;
  lifeMin: number;
  lifeMax: number;
  primaryColor: string; // "#rrggbb"
  bgColor: string; // "#rrggbb"
}

export interface WaveEngine {
  frame(ctx: CanvasRenderingContext2D, dt: number): void;
  resize(w: number, h: number): void;
  reseed(seed: number): void;
  setConfig(cfg: WaveConfig): void;
}

export type CreateEngine = (
  seed: number,
  width: number,
  height: number,
  cfg: WaveConfig,
) => WaveEngine;

export const createEngine = new Function(
  `${raw}\n;return createEngine;`,
)() as CreateEngine;
