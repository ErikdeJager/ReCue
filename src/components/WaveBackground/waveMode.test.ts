import { describe, expect, it } from "vitest";

import { resolveWaveMode } from "./waveMode";

describe("resolveWaveMode (task 384)", () => {
  it('"main" override always forces the main-thread loop', () => {
    expect(resolveWaveMode("main", true)).toBe("main");
    expect(resolveWaveMode("main", false)).toBe("main");
  });

  it('"worker" override is honored only when detection passes', () => {
    expect(resolveWaveMode("worker", true)).toBe("worker");
    expect(resolveWaveMode("worker", false)).toBe("main");
  });

  it("no / junk override follows detection", () => {
    expect(resolveWaveMode(null, true)).toBe("worker");
    expect(resolveWaveMode(null, false)).toBe("main");
    expect(resolveWaveMode("", true)).toBe("worker");
    expect(resolveWaveMode("nonsense", false)).toBe("main");
  });
});
