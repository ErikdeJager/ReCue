import { useEffect, useRef, useState } from "react";

import { useStore } from "../../store";
import type { WaveConfig } from "../../vendor/waveEngineLoader";
import styles from "./WaveBackground.module.css";
import type { WaveHandle } from "./waveHost";
import { WAVE_BASE, WAVE_PRESETS, type WavePresetName } from "./wavePresets";

/**
 * The wave background layer (UI v2 §3, task 377): one Canvas2D running the
 * vendored WaveEngine behind the whole stage — the Overview wall, the Canvas
 * strip + panes (ONE canvas spans both), and each detached canvas window.
 *
 * The runtime lives in the lazy `waveHost` (task 384) — the engine + all of its
 * glue never ride the first-paint path (#356). `waveHost` renders either on the
 * main thread (today's loop) or, where supported, from an OffscreenCanvas Web
 * Worker; it also governs frame cost under load and pauses when panels cover the
 * stage (`covered` + the `pauseWaveWhenCovered` setting).
 */

// One per window document: rolled once per launch (random seed every launch, §3);
// a detached canvas window is its own document, so it rolls its own.
const LAUNCH_SEED = ((Math.random() * 99999) | 0) + 1;

export default function WaveBackground({
  preset,
  covered,
}: {
  preset: WavePresetName;
  covered: boolean;
}) {
  const enabled = useStore((s) => s.settings.backgroundAnimation);
  const booted = useStore((s) => s.booted);
  // OFF ⇒ no canvas element at all (plain static crust from .main/.window). Waiting
  // for `booted` keeps a disabled persisted setting from flashing a wave pre-boot.
  if (!enabled || !booted) return null;
  return <WaveCanvas preset={preset} covered={covered} />;
}

/** Inner component so the outer setting gate never conditionalizes hooks. */
function WaveCanvas({
  preset,
  covered,
}: {
  preset: WavePresetName;
  covered: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // ONE mutable config object, shared with the engine for its whole lifetime —
  // preset switches and recolors are plain mutations the engine reads next frame
  // (main mode) / that get forwarded to the worker (worker mode).
  const cfgRef = useRef<WaveConfig | null>(null);
  cfgRef.current ??= {
    ...WAVE_BASE,
    ...WAVE_PRESETS[preset],
    primaryColor: "#fab387",
    bgColor: "#11111b",
  };

  // The pause-when-covered setting (task 384): panels tiling over the stage pause
  // the wave only when this is on (default). backgroundAnimation OFF already
  // unmounts the canvas entirely and wins over this.
  const pauseWhenCovered = useStore((s) => s.settings.pauseWaveWhenCovered);
  const anyBusy = useStore((s) => Object.values(s.sessionBusy).some(Boolean));
  const effectiveCovered = pauseWhenCovered && covered;

  const handleRef = useRef<WaveHandle | null>(null);
  // The init-failure remount seam (the ONLY allowed remount): a fresh <canvas key>
  // for a one-shot-transfer retry; `forceMain` skips worker detection after a
  // worker-init failure. Preset / pause / setting changes NEVER remount.
  const [epoch, setEpoch] = useState(0);
  const [forceMain, setForceMain] = useState(false);
  const retried = useRef({ transfer: false, workerInit: false });

  // Read the latest covered/busy through refs so the mount effect can start the
  // engine with current values without listing them as deps (no stale closure, no
  // remount on their change — the dedicated effects below push updates).
  const coveredRef = useRef(effectiveCovered);
  coveredRef.current = effectiveCovered;
  const busyRef = useRef(anyBusy);
  busyRef.current = anyBusy;

  // Live preset switch (Overview ↔ Canvas ↔ hero): mutate the shared config, then
  // notify the handle (worker mode forwards it) — never remount, never reseed.
  useEffect(() => {
    if (cfgRef.current) Object.assign(cfgRef.current, WAVE_PRESETS[preset]);
    handleRef.current?.configChanged();
  }, [preset]);

  // Push covered / busy to the running engine.
  useEffect(() => {
    handleRef.current?.setCovered(effectiveCovered);
  }, [effectiveCovered]);
  useEffect(() => {
    handleRef.current?.setBusy(anyBusy);
  }, [anyBusy]);

  useEffect(() => {
    const canvas = ref.current;
    const cfg = cfgRef.current;
    if (!canvas || !cfg) return;
    let handle: WaveHandle | null = null;
    let disposed = false;
    void import("./waveHost").then(({ startWave }) => {
      // The `disposed` gate makes StrictMode's mount→cleanup→mount safe: the first
      // mount's cleanup runs before this microtask resolves, so only the surviving
      // mount ever transfers the canvas / starts a worker.
      if (disposed) return;
      handle = startWave({
        canvas,
        cfg,
        seed: LAUNCH_SEED,
        covered: coveredRef.current,
        busy: busyRef.current,
        forceMain,
        onFallback: (reason) => {
          if (reason === "transfer") {
            if (retried.current.transfer) return;
            retried.current.transfer = true;
            setEpoch((e) => e + 1); // remount for a fresh (untransferred) canvas
          } else {
            if (retried.current.workerInit) return;
            retried.current.workerInit = true;
            setForceMain(true); // give up the worker, run the main-thread loop
            setEpoch((e) => e + 1);
          }
        },
      });
      handleRef.current = handle;
      // Sync to the latest in case covered/busy changed during the async import.
      handle.setCovered(coveredRef.current);
      handle.setBusy(busyRef.current);
    });

    return () => {
      disposed = true;
      handle?.dispose();
      handleRef.current = null;
    };
  }, [epoch, forceMain]);

  return <canvas key={epoch} ref={ref} className={styles.wave} aria-hidden />;
}
