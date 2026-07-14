import { describe, expect, it } from "vitest";

import {
  overviewIsEmpty,
  selectWavePreset,
  WAVE_BASE,
  WAVE_PRESETS,
} from "./wavePresets";

describe("WAVE_PRESETS", () => {
  // Anti-drift: the exact spec §3 table values.
  it("overview preset matches spec §3", () => {
    expect(WAVE_PRESETS.overview).toEqual({
      density: 420,
      speed: 0.85,
      primaryWaves: 0.04,
      trailLength: 3.4,
    });
  });

  it("canvas preset matches spec §3", () => {
    expect(WAVE_PRESETS.canvas).toEqual({
      density: 420,
      speed: 0.8,
      primaryWaves: 0.035,
      trailLength: 3.4,
    });
  });

  it("hero preset matches spec §3", () => {
    expect(WAVE_PRESETS.hero).toEqual({
      density: 950,
      speed: 1.05,
      primaryWaves: 0.07,
      trailLength: 3.4,
    });
  });

  it("WAVE_BASE carries the reference host defaults", () => {
    expect(WAVE_BASE).toEqual({
      waveScale: 1,
      swirl: 1.9,
      lifeMin: 10,
      lifeMax: 20,
    });
  });
});

describe("selectWavePreset", () => {
  it("canvas view always runs the canvas preset", () => {
    expect(selectWavePreset("canvas", false)).toBe("canvas");
    expect(selectWavePreset("canvas", true)).toBe("canvas");
  });

  it("overview runs the overview preset, or hero when truly empty", () => {
    expect(selectWavePreset("overview", false)).toBe("overview");
    expect(selectWavePreset("overview", true)).toBe("hero");
  });
});

describe("overviewIsEmpty", () => {
  const empty = {
    sessions: [],
    overviewPanels: {},
    schedules: [],
    recurrings: [],
  };

  it("true only when there is truly nothing", () => {
    expect(overviewIsEmpty(empty)).toBe(true);
    // Empty panel lists (a repo key with no panels) still count as empty.
    expect(overviewIsEmpty({ ...empty, overviewPanels: { "/repo": [] } })).toBe(
      true,
    );
  });

  it("a session makes it non-empty", () => {
    expect(overviewIsEmpty({ ...empty, sessions: [{ id: "a" }] })).toBe(false);
  });

  it("a panel alone makes it non-empty", () => {
    expect(
      overviewIsEmpty({
        ...empty,
        overviewPanels: { "/repo": [{ id: "p1" }] },
      }),
    ).toBe(false);
  });

  it("a schedule alone makes it non-empty", () => {
    expect(overviewIsEmpty({ ...empty, schedules: [{ id: "s1" }] })).toBe(
      false,
    );
  });

  it("a recurring alone makes it non-empty", () => {
    expect(overviewIsEmpty({ ...empty, recurrings: [{ id: "r1" }] })).toBe(
      false,
    );
  });
});
