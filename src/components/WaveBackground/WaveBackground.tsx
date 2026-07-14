import { useEffect, useRef } from "react";

import { useStore } from "../../store";
import type { WaveConfig } from "../../vendor/waveEngineLoader";
import styles from "./WaveBackground.module.css";
import { WAVE_BASE, WAVE_PRESETS, type WavePresetName } from "./wavePresets";
import { gateFrame, initialGateState, rearmSettle } from "./waveTick";

/**
 * The wave background layer (UI v2 §3, task 377): one Canvas2D running the
 * vendored WaveEngine behind the whole stage — the Overview wall, the Canvas
 * strip + panes (ONE canvas spans both), and each detached canvas window.
 * The engine itself is lazy-loaded (#356 — the mermaid precedent), so the
 * vendored source never rides the first-paint path.
 */

// One per window document: rolled once per launch (random seed every launch, §3);
// a detached canvas window is its own document, so it rolls its own.
const LAUNCH_SEED = ((Math.random() * 99999) | 0) + 1;

export default function WaveBackground({ preset }: { preset: WavePresetName }) {
  const enabled = useStore((s) => s.settings.backgroundAnimation);
  const booted = useStore((s) => s.booted);
  // OFF ⇒ no canvas element at all (plain static crust from .main/.window). Waiting
  // for `booted` keeps a disabled persisted setting from flashing a wave pre-boot.
  if (!enabled || !booted) return null;
  return <WaveCanvas preset={preset} />;
}

/** Inner component so the outer setting gate never conditionalizes hooks. */
function WaveCanvas({ preset }: { preset: WavePresetName }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // ONE mutable config object, shared with the engine for its whole lifetime —
  // preset switches and recolors are plain mutations the engine reads next frame.
  const cfgRef = useRef<WaveConfig | null>(null);
  cfgRef.current ??= {
    ...WAVE_BASE,
    ...WAVE_PRESETS[preset],
    primaryColor: "#fab387",
    bgColor: "#11111b",
  };

  // Live preset switch (Overview ↔ Canvas ↔ hero): mutate the shared config —
  // never remount the canvas, never reseed (the pattern visibly persists).
  useEffect(() => {
    if (cfgRef.current) Object.assign(cfgRef.current, WAVE_PRESETS[preset]);
  }, [preset]);

  useEffect(() => {
    const canvas = ref.current;
    const cfg = cfgRef.current;
    if (!canvas || !cfg) return;
    let disposed = false;
    let raf = 0;
    let state = initialGateState();
    let ro: ResizeObserver | null = null;
    let mo: MutationObserver | null = null;

    // The live resolved colors always come off <html>'s computed style: the
    // default tokens, an accent swatch, a custom hex, 373's per-launch "random"
    // (written inline on <html>), and a theme flip (data-theme) all land there.
    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      cfg.primaryColor = cs.getPropertyValue("--accent").trim() || "#fab387";
      cfg.bgColor = cs.getPropertyValue("--bg-base").trim() || "#11111b";
    };
    readColors();

    // The #356 lazy boundary: the vendored engine is its own async chunk.
    void import("../../vendor/waveEngineLoader").then(({ createEngine }) => {
      if (disposed || !ref.current) return;
      // Buffer sized in CSS pixels — deliberately no devicePixelRatio scaling,
      // matching the reference host (softer look, ~4× cheaper on Retina/WebKitGTK).
      let w = Math.max(4, canvas.clientWidth | 0);
      let h = Math.max(4, canvas.clientHeight | 0);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return; // fail-open: the static crust stays
      const eng = createEngine(LAUNCH_SEED, w, h, cfg);

      const reducedNow = () =>
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        document.body.classList.contains("reduce-motion");

      // rAF stays scheduled every frame (deviation from fx.js, which cancels on
      // freeze): a reduce-motion un-toggle resumes and a recolor re-arms without
      // extra listeners; a skipped frame is two comparisons, and hidden windows
      // are throttled by the browser anyway.
      const loop = (now: number) => {
        if (disposed) return;
        raf = requestAnimationFrame(loop);
        const gate = gateFrame(state, now, {
          hidden: document.hidden,
          reduced: reducedNow(),
        });
        state = gate.next;
        if (!gate.draw) return;
        eng.setConfig(cfg);
        eng.frame(ctx, gate.dt);
      };
      raf = requestAnimationFrame(loop);

      ro = new ResizeObserver(() => {
        const nw = canvas.clientWidth | 0;
        const nh = canvas.clientHeight | 0;
        if (nw < 4 || nh < 4 || (nw === w && nh === h)) return;
        w = nw;
        h = nh;
        // Resetting the buffer clears it — the engine's needBg repaints the
        // background and the strands redraw from their kept positions.
        canvas.width = w;
        canvas.height = h;
        eng.resize(w, h);
      });
      ro.observe(canvas);

      // Live recolor seam: applySettingsEffects writes custom/random accents
      // inline on <html> and theme flips toggle data-theme — re-read the computed
      // colors and grant a frozen (reduced-motion) wave one more settle window.
      mo = new MutationObserver(() => {
        readColors();
        state = rearmSettle(state);
      });
      mo.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["style", "data-theme"],
      });
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={styles.wave} aria-hidden />;
}
