// The wave background runtime (task 384) — reached ONLY via `import("./waveHost")`
// from WaveBackground.tsx, so the vendored engine + this glue stay off the
// first-paint path (#356). It owns everything the component's effect used to own,
// for BOTH render modes:
//   - main mode: today's rAF loop on the webview main thread (byte-for-byte
//     semantics), with the frame gate + adaptive governor.
//   - worker mode: the same unmodified engine rendering from a Web Worker into an
//     OffscreenCanvas, so the simulation never competes with xterm paints / React
//     commits. Recolors, presets, resizes, hidden/covered/busy all forward as
//     messages; a worker-init failure falls back to main mode.
// Feature-detected + `localStorage["recue.waveMode"]`-overridable via waveMode.ts.

import type { WaveConfig } from "../../vendor/waveEngineLoader";
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
  type StatsSnapshot,
} from "./waveGovernor";
import type { WaveFromWorker, WaveToWorker } from "./waveMessages";
import { detectWorkerWave, resolveWaveMode, type WaveMode } from "./waveMode";
import {
  gateFrame,
  initialGateState,
  rearmSettle,
  type GateState,
} from "./waveTick";

/** Trailing debounce (ms) coalescing a ResizeObserver burst (e.g. dragging the
 * sidebar handle, #108) into one buffer reset + `eng.resize`. */
const RESIZE_DEBOUNCE_MS = 150;

export interface WaveHandle {
  /** A preset switch or recolor mutated the shared config; push it to the engine
   * (a no-op in main mode, which reads the shared object live — but worker mode
   * needs it forwarded). `rearm` grants a frozen reduced-motion wave one more
   * settle window (accent/theme recolor). */
  configChanged(opts?: { rearm?: boolean }): void;
  /** The stage is (un)covered by panels — pause / resume. */
  setCovered(v: boolean): void;
  /** Any agent is (not) busy — govern the fps cap. */
  setBusy(v: boolean): void;
  /** Tear everything down (loop, worker, observers, timers). */
  dispose(): void;
}

export interface StartWaveOpts {
  canvas: HTMLCanvasElement;
  cfg: WaveConfig;
  seed: number;
  covered: boolean;
  busy: boolean;
  /** Skip worker detection and run the main-thread loop (set after a worker-init
   * fallback so the retry doesn't loop). */
  forceMain?: boolean;
  /** Called when worker mode can't start on a fresh element: `"transfer"` (the
   * canvas was already transferred — remount for a clean one) or `"worker-init"`
   * (the worker reported it couldn't init — force main mode). */
  onFallback(reason: "transfer" | "worker-init"): void;
}

const now = (): number => performance.now();

const reducedNow = (): boolean =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
  document.body.classList.contains("reduce-motion");

function readStatsFlag(): boolean {
  try {
    return localStorage.getItem("recue.waveStats") === "1";
  } catch {
    return false;
  }
}

function readModeOverride(): string | null {
  try {
    return localStorage.getItem("recue.waveMode");
  } catch {
    return null;
  }
}

/** Read the live resolved colors off <html>'s computed style into the shared cfg
 * (the default tokens, an accent swatch, a custom hex, the 373 per-launch random,
 * and a data-theme flip all land there). Runs on the main thread in both modes. */
function readColorsInto(cfg: WaveConfig): void {
  const cs = getComputedStyle(document.documentElement);
  cfg.primaryColor = cs.getPropertyValue("--accent").trim() || "#fab387";
  cfg.bgColor = cs.getPropertyValue("--bg-base").trim() || "#11111b";
}

function publishStats(
  mode: WaveMode,
  scale: number,
  snap: StatsSnapshot,
): void {
  const payload = {
    mode,
    fps: Math.round(snap.fps * 10) / 10,
    avg: Math.round(snap.avg * 100) / 100,
    p95: Math.round(snap.p95 * 100) / 100,
    scale,
    drawn: snap.drawn,
  };
  (window as unknown as { __waveStats?: typeof payload }).__waveStats = payload;
  console.info(
    `[wave] mode=${payload.mode} fps=${payload.fps} avg=${payload.avg}ms p95=${payload.p95}ms scale=${payload.scale}`,
  );
}

const noopHandle = (): WaveHandle => ({
  configChanged() {},
  setCovered() {},
  setBusy() {},
  dispose() {},
});

/** Entry point: resolve the render mode, then start it. Returns a live handle
 * immediately (the engine chunk / worker load asynchronously behind it). */
export function startWave(opts: StartWaveOpts): WaveHandle {
  const detected = opts.forceMain ? false : detectWorkerWave();
  const mode: WaveMode = opts.forceMain
    ? "main"
    : resolveWaveMode(readModeOverride(), detected);
  const statsOn = readStatsFlag();
  readColorsInto(opts.cfg);
  return mode === "worker"
    ? startWorker(opts, statsOn)
    : startMain(opts, statsOn);
}

// ---------- main-thread mode ----------

function startMain(opts: StartWaveOpts, statsOn: boolean): WaveHandle {
  const { canvas, cfg, seed } = opts;
  const local = { covered: opts.covered, busy: opts.busy };
  let disposed = false;
  let raf = 0;
  let state: GateState = initialGateState();
  let gov: GovState = initialGovState(now());
  let stats: StatsAccum = initialStats(now());
  let ro: ResizeObserver | null = null;
  let mo: MutationObserver | null = null;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  let statsTimer: ReturnType<typeof setInterval> | null = null;

  let cssW = Math.max(4, canvas.clientWidth | 0);
  let cssH = Math.max(4, canvas.clientHeight | 0);
  const buf = (v: number): number => Math.max(4, Math.round(v * govScale(gov)));

  void import("../../vendor/waveEngineLoader").then(({ createEngine }) => {
    if (disposed) return;
    canvas.width = buf(cssW);
    canvas.height = buf(cssH);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return; // fail-open: the static crust stays
    const eng = createEngine(seed, canvas.width, canvas.height, cfg);

    const loop = (t: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      const gate = gateFrame(state, t, {
        hidden: document.hidden,
        reduced: reducedNow(),
        covered: local.covered,
        busy: local.busy,
      });
      state = gate.next;
      if (!gate.draw) return;
      eng.setConfig(cfg);
      const t0 = now();
      eng.frame(ctx, gate.dt);
      const drawMs = now() - t0;
      const rec = recordFrame(gov, drawMs, t0);
      gov = rec.next;
      if (rec.degradeTo != null) {
        canvas.width = buf(cssW);
        canvas.height = buf(cssH);
        eng.resize(canvas.width, canvas.height);
      }
      if (statsOn) stats = recordStat(stats, drawMs);
    };
    raf = requestAnimationFrame(loop);

    ro = new ResizeObserver(() => {
      const nw = canvas.clientWidth | 0;
      const nh = canvas.clientHeight | 0;
      if (nw < 4 || nh < 4 || (nw === cssW && nh === cssH)) return;
      if (resizeTimer != null) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resizeTimer = null;
        const w2 = canvas.clientWidth | 0;
        const h2 = canvas.clientHeight | 0;
        if (w2 < 4 || h2 < 4 || (w2 === cssW && h2 === cssH)) return;
        cssW = w2;
        cssH = h2;
        // Resetting the buffer clears it — needBg repaints the background and the
        // strands redraw from their kept positions.
        canvas.width = buf(cssW);
        canvas.height = buf(cssH);
        eng.resize(canvas.width, canvas.height);
      }, RESIZE_DEBOUNCE_MS);
    });
    ro.observe(canvas);

    mo = new MutationObserver(() => {
      readColorsInto(cfg);
      state = rearmSettle(state);
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "data-theme"],
    });

    if (statsOn) {
      statsTimer = setInterval(() => {
        publishStats("main", govScale(gov), statsSnapshot(stats, now()));
        stats = initialStats(now());
      }, STATS_INTERVAL_MS);
    }
  });

  return {
    configChanged(o) {
      if (o?.rearm) state = rearmSettle(state);
      // Non-rearm preset changes need nothing: the engine reads the shared cfg live.
    },
    setCovered(v) {
      local.covered = v;
    },
    setBusy(v) {
      local.busy = v;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      mo?.disconnect();
      if (resizeTimer != null) clearTimeout(resizeTimer);
      if (statsTimer != null) clearInterval(statsTimer);
    },
  };
}

// ---------- worker mode ----------

function startWorker(opts: StartWaveOpts, statsOn: boolean): WaveHandle {
  const { canvas, cfg, seed } = opts;
  let cssW = Math.max(4, canvas.clientWidth | 0);
  let cssH = Math.max(4, canvas.clientHeight | 0);

  // One-shot per element: a second transfer (or a later getContext) throws
  // InvalidStateError. On a throw the component remounts a fresh <canvas>.
  let offscreen: OffscreenCanvas;
  try {
    canvas.width = cssW;
    canvas.height = cssH;
    offscreen = canvas.transferControlToOffscreen();
  } catch {
    opts.onFallback("transfer");
    return noopHandle();
  }

  let disposed = false;
  const worker = new Worker(new URL("./waveWorker.ts", import.meta.url), {
    type: "module",
  });
  const post = (msg: WaveToWorker, transfer?: Transferable[]) => {
    if (disposed) return;
    if (transfer) worker.postMessage(msg, transfer);
    else worker.postMessage(msg);
  };

  worker.onmessage = (e: MessageEvent<WaveFromWorker>) => {
    const data = e.data;
    if (!data) return;
    if (data.type === "fallback") {
      opts.onFallback("worker-init");
    } else if (data.type === "stats") {
      publishStats("worker", data.scale, data.snapshot);
    }
  };

  post(
    {
      type: "init",
      canvas: offscreen,
      seed,
      cfg: { ...cfg },
      w: cssW,
      h: cssH,
      covered: opts.covered,
      busy: opts.busy,
      hidden: document.hidden,
      reduced: reducedNow(),
      stats: statsOn,
    },
    [offscreen],
  );

  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  const onVis = () => post({ type: "state", hidden: document.hidden });
  const onReduced = () => post({ type: "state", reduced: reducedNow() });
  document.addEventListener("visibilitychange", onVis);
  mql.addEventListener("change", onReduced);
  // The `reduce-motion` body class (the Settings reduce-motion toggle) is not a
  // media query — watch it too.
  const bodyMo = new MutationObserver(() =>
    post({ type: "state", reduced: reducedNow() }),
  );
  bodyMo.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });

  // Recolor seam: re-read <html>'s computed colors into cfg and forward, granting a
  // frozen (reduced-motion) wave one more settle window.
  const mo = new MutationObserver(() => {
    readColorsInto(cfg);
    post({ type: "cfg", cfg: { ...cfg }, rearm: true });
  });
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["style", "data-theme"],
  });

  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  const ro = new ResizeObserver(() => {
    const nw = canvas.clientWidth | 0;
    const nh = canvas.clientHeight | 0;
    if (nw < 4 || nh < 4 || (nw === cssW && nh === cssH)) return;
    if (resizeTimer != null) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      const w2 = canvas.clientWidth | 0;
      const h2 = canvas.clientHeight | 0;
      if (w2 < 4 || h2 < 4 || (w2 === cssW && h2 === cssH)) return;
      cssW = w2;
      cssH = h2;
      post({ type: "resize", w: cssW, h: cssH });
    }, RESIZE_DEBOUNCE_MS);
  });
  ro.observe(canvas);

  return {
    configChanged(o) {
      post({ type: "cfg", cfg: { ...cfg }, rearm: !!o?.rearm });
    },
    setCovered(v) {
      post({ type: "state", covered: v });
    },
    setBusy(v) {
      post({ type: "state", busy: v });
    },
    dispose() {
      disposed = true;
      document.removeEventListener("visibilitychange", onVis);
      mql.removeEventListener("change", onReduced);
      bodyMo.disconnect();
      mo.disconnect();
      ro.disconnect();
      if (resizeTimer != null) clearTimeout(resizeTimer);
      worker.postMessage({ type: "dispose" } satisfies WaveToWorker);
      worker.terminate();
    },
  };
}
