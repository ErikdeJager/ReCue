import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import raw from "./WaveEngine.js?raw";
import { createEngine, type WaveConfig } from "./waveEngineLoader";

// The exact bytes handed off in docs/ui-v2-handoff/assets/WaveEngine.js (17,450
// bytes). The engine is vendored VERBATIM — any edit, reformat, or "cleanup"
// (including of seemingly unused rng() calls, which keep seed parity with the
// reference) must fail here.
const VENDORED_SHA256 =
  "10ae1e3e7ec42994df0f3c37801552d0b7c3e7e8e4bd25376c1c5fd59be6c12a";

/** The reference host's cfg defaults + the overview preset — a realistic config. */
function makeCfg(): WaveConfig {
  return {
    speed: 0.85,
    waveScale: 1,
    swirl: 1.9,
    density: 420,
    trailLength: 3.4,
    primaryWaves: 0.04,
    lifeMin: 10,
    lifeMax: 20,
    primaryColor: "#fab387",
    bgColor: "#11111b",
  };
}

/** A recording stub 2d context: settable style fields (globalCompositeOperation
 * must read back what was assigned — the engine's sweep-op detection relies on
 * it) and recorder methods for every call the engine makes. */
function makeStubCtx(): { ctx: CanvasRenderingContext2D; ops: string[] } {
  const ops: string[] = [];
  const state: Record<string, unknown> = {
    globalCompositeOperation: "source-over",
  };
  const ctx: Record<string, unknown> = {};
  for (const prop of [
    "fillStyle",
    "strokeStyle",
    "globalAlpha",
    "lineWidth",
    "lineCap",
    "lineJoin",
    "globalCompositeOperation",
  ]) {
    Object.defineProperty(ctx, prop, {
      get: () => state[prop],
      set: (v: unknown) => {
        state[prop] = v;
        ops.push(`set ${prop}=${String(v)}`);
      },
    });
  }
  for (const m of ["fillRect", "beginPath", "moveTo", "lineTo", "stroke"]) {
    ctx[m] = (...args: unknown[]) => {
      ops.push(`${m}(${args.map(String).join(",")})`);
    };
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

describe("vendored WaveEngine", () => {
  it("vendored engine is byte-for-byte (task 377) — never edit it; tune via the config object", () => {
    expect(createHash("sha256").update(raw).digest("hex")).toBe(
      VENDORED_SHA256,
    );
  });

  it("createEngine returns the {frame, resize, reseed, setConfig} factory shape", () => {
    const eng = createEngine(7, 320, 200, makeCfg());
    expect(typeof eng.frame).toBe("function");
    expect(typeof eng.resize).toBe("function");
    expect(typeof eng.reseed).toBe("function");
    expect(typeof eng.setConfig).toBe("function");
  });

  it("survives frames against a stub 2d context and records stroke work", () => {
    const eng = createEngine(7, 320, 200, makeCfg());
    const { ctx, ops } = makeStubCtx();
    expect(() => {
      for (let i = 0; i < 10; i++) eng.frame(ctx, 1 / 48);
    }).not.toThrow();
    // The background paint + fade passes land immediately; strands spawn
    // gradually and stroke within the first ~10 frames.
    expect(ops.some((op) => op.startsWith("fillRect("))).toBe(true);
    expect(ops.some((op) => op === "stroke()")).toBe(true);
  });

  it("is deterministic: same seed ⇒ identical draw sequence, different seed ⇒ diverges", () => {
    const run = (seed: number): string[] => {
      const eng = createEngine(seed, 320, 200, makeCfg());
      const { ctx, ops } = makeStubCtx();
      for (let i = 0; i < 12; i++) eng.frame(ctx, 1 / 48);
      return ops;
    };
    const a = run(42);
    const b = run(42);
    const c = run(43);
    expect(a).toEqual(b);
    // A different seed shuffles the flow field + strand styles — the recorded
    // op list must differ (fails loudly if someone "cleans up" an rng call).
    expect(c).not.toEqual(a);
  });
});
