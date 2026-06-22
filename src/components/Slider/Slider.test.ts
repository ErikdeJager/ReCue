import { describe, expect, it } from "vitest";

import { fillPercent } from "./sliderFill";

describe("fillPercent (#122)", () => {
  it("maps value→percent across the range", () => {
    expect(fillPercent(10, 10, 16)).toBe(0); // at min
    expect(fillPercent(16, 10, 16)).toBe(100); // at max
    expect(fillPercent(13, 10, 16)).toBe(50); // midpoint
  });

  it("handles fractional steps (the Settings line-height range)", () => {
    expect(fillPercent(1.4, 1, 1.8)).toBeCloseTo(50, 5);
    expect(fillPercent(1.0, 1, 1.8)).toBe(0);
    expect(fillPercent(1.8, 1, 1.8)).toBe(100);
  });

  it("clamps out-of-range values to 0–100", () => {
    expect(fillPercent(5, 10, 16)).toBe(0); // below min
    expect(fillPercent(20, 10, 16)).toBe(100); // above max
  });

  it("returns 0 for a degenerate range (max <= min)", () => {
    expect(fillPercent(5, 10, 10)).toBe(0);
    expect(fillPercent(5, 10, 5)).toBe(0);
  });
});
