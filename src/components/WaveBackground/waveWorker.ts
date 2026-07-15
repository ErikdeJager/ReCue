/// <reference lib="webworker" />
// The wave background's OffscreenCanvas worker (task 384). The UNMODIFIED vendored
// engine renders here, off the webview main thread, so its hundreds–thousands of
// strand simulations + full-canvas fills never compete with xterm paints / React
// commits. The engine is pure (no DOM/window/document — only Math + the ctx handed
// to frame()), and every ctx method/prop it uses exists on
// OffscreenCanvasRenderingContext2D, so it runs here verbatim. Reached only via the
// `new Worker(new URL("./waveWorker.ts", ...))` in waveHost (its own bundle), so no
// import-time side effects beyond the loader.

import {
  createEngine,
  type WaveConfig,
  type WaveEngine,
} from "../../vendor/waveEngineLoader";
import {
  govScale,
  initialGovState,
  initialStats,
  recordFrame,
  recordStat,
  statsSnapshot,
  STATS_INTERVAL_MS,
  type GovState,
  type StatsAccum,
} from "./waveGovernor";
import type { WaveFromWorker, WaveToWorker } from "./waveMessages";
import {
  gateFrame,
  initialGateState,
  rearmSettle,
  type GateState,
} from "./waveTick";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

const now = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

// rAF is available in a worker once an OffscreenCanvas is rendering; fall back to a
// ~60fps timer where it isn't.
const raf: (cb: (t: number) => void) => void =
  typeof ctx.requestAnimationFrame === "function"
    ? ctx.requestAnimationFrame.bind(ctx)
    : (cb) => {
        setTimeout(() => cb(now()), 1000 / 60);
      };

let offscreen: OffscreenCanvas | null = null;
let render: OffscreenCanvasRenderingContext2D | null = null;
let engine: WaveEngine | null = null;
let cfg: WaveConfig | null = null;
let state: GateState = initialGateState();
let gov: GovState = initialGovState(0);
let stats: StatsAccum = initialStats(0);
let statsOn = false;
let running = false;
let cssW = 4;
let cssH = 4;

const flags = { hidden: false, reduced: false, covered: false, busy: false };

const buf = (v: number): number => Math.max(4, Math.round(v * govScale(gov)));

function post(msg: WaveFromWorker): void {
  ctx.postMessage(msg);
}

function loop(t: number): void {
  if (!running) return;
  raf(loop);
  const gate = gateFrame(state, t, flags);
  state = gate.next;
  if (!gate.draw || !engine || !render || !cfg) return;
  engine.setConfig(cfg);
  const t0 = now();
  // The engine only uses ctx methods/props present on OffscreenCanvasRenderingContext2D.
  engine.frame(render as unknown as CanvasRenderingContext2D, gate.dt);
  const drawMs = now() - t0;
  const rec = recordFrame(gov, drawMs, t0);
  gov = rec.next;
  if (rec.degradeTo != null && offscreen) {
    offscreen.width = buf(cssW);
    offscreen.height = buf(cssH);
    engine.resize(offscreen.width, offscreen.height);
  }
  if (statsOn) {
    stats = recordStat(stats, drawMs);
    if (now() - stats.windowStart >= STATS_INTERVAL_MS) {
      post({
        type: "stats",
        scale: govScale(gov),
        snapshot: statsSnapshot(stats, now()),
      });
      stats = initialStats(now());
    }
  }
}

ctx.onmessage = (e: MessageEvent<WaveToWorker>) => {
  const d = e.data;
  if (!d) return;
  switch (d.type) {
    case "init": {
      try {
        offscreen = d.canvas;
        cssW = Math.max(4, d.w | 0);
        cssH = Math.max(4, d.h | 0);
        cfg = d.cfg;
        flags.hidden = d.hidden;
        flags.reduced = d.reduced;
        flags.covered = d.covered;
        flags.busy = d.busy;
        statsOn = d.stats;
        gov = initialGovState(now());
        stats = initialStats(now());
        offscreen.width = buf(cssW);
        offscreen.height = buf(cssH);
        const c = offscreen.getContext("2d", { alpha: false });
        if (!c) {
          post({ type: "fallback" });
          return;
        }
        render = c;
        engine = createEngine(d.seed, offscreen.width, offscreen.height, cfg);
        running = true;
        raf(loop);
      } catch {
        post({ type: "fallback" });
      }
      break;
    }
    case "cfg": {
      if (cfg) Object.assign(cfg, d.cfg);
      if (d.rearm) state = rearmSettle(state);
      break;
    }
    case "state": {
      if (typeof d.hidden === "boolean") flags.hidden = d.hidden;
      if (typeof d.reduced === "boolean") flags.reduced = d.reduced;
      if (typeof d.covered === "boolean") flags.covered = d.covered;
      if (typeof d.busy === "boolean") flags.busy = d.busy;
      break;
    }
    case "resize": {
      cssW = Math.max(4, d.w | 0);
      cssH = Math.max(4, d.h | 0);
      if (offscreen && engine) {
        offscreen.width = buf(cssW);
        offscreen.height = buf(cssH);
        engine.resize(offscreen.width, offscreen.height);
      }
      break;
    }
    case "dispose": {
      running = false;
      ctx.close();
      break;
    }
  }
};
