// Message contracts between the wave host (main thread) and the OffscreenCanvas
// worker (task 384). Type-only module (no runtime), so importing it from either
// side drags no glue into the other's bundle.

import type { WaveConfig } from "../../vendor/waveEngineLoader";
import type { StatsSnapshot } from "./waveGovernor";

/** Main thread → worker. */
export type WaveToWorker =
  | {
      type: "init";
      canvas: OffscreenCanvas;
      seed: number;
      cfg: WaveConfig;
      w: number;
      h: number;
      covered: boolean;
      busy: boolean;
      hidden: boolean;
      reduced: boolean;
      stats: boolean;
    }
  | { type: "cfg"; cfg: WaveConfig; rearm: boolean }
  | {
      type: "state";
      hidden?: boolean;
      reduced?: boolean;
      covered?: boolean;
      busy?: boolean;
    }
  | { type: "resize"; w: number; h: number }
  | { type: "dispose" };

/** Worker → main thread. */
export type WaveFromWorker =
  | { type: "fallback" }
  | { type: "stats"; scale: number; snapshot: StatsSnapshot };
