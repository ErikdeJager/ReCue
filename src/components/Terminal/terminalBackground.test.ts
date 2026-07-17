import { describe, expect, it } from "vitest";

import {
  TERMINAL_BG_DARKEST,
  TERMINAL_BG_LIGHTEST,
  terminalBackgroundColor,
} from "./terminalBackground";

const HEX = /^#[0-9a-f]{6}$/i;

describe("terminalBackgroundColor (#390)", () => {
  it("returns the base (the app's panel surface) at lightness 0", () => {
    expect(terminalBackgroundColor(0)).toBe(TERMINAL_BG_DARKEST);
    expect(terminalBackgroundColor(0, "#202030")).toBe("#202030");
  });

  it("returns the gray-ish endpoint at lightness 100", () => {
    expect(terminalBackgroundColor(100)).toBe(TERMINAL_BG_LIGHTEST);
  });

  it("interpolates the midpoint halfway between base and lightest", () => {
    // #1e1e2e -> #3a3a45, midpoint each channel:
    // R (0x1e..0x3a) = (30+58)/2 = 44 = 0x2c
    // G same as R = 0x2c
    // B (0x2e..0x45) = (46+69)/2 = 57.5 -> round 58 = 0x3a
    expect(terminalBackgroundColor(50)).toBe("#2c2c3a");
  });

  it("clamps values below 0 to the base", () => {
    expect(terminalBackgroundColor(-40)).toBe(TERMINAL_BG_DARKEST);
    expect(terminalBackgroundColor(-Infinity)).toBe(TERMINAL_BG_DARKEST);
  });

  it("clamps values above 100 to the lightest", () => {
    expect(terminalBackgroundColor(140)).toBe(TERMINAL_BG_LIGHTEST);
    expect(terminalBackgroundColor(Infinity)).toBe(TERMINAL_BG_LIGHTEST);
  });

  it("falls back to the darkest base when the base is malformed", () => {
    expect(terminalBackgroundColor(0, "not-a-color")).toBe(TERMINAL_BG_DARKEST);
    expect(terminalBackgroundColor(100, "")).toBe(TERMINAL_BG_LIGHTEST);
  });

  it("accepts a 3-digit shorthand base", () => {
    // #123 -> #112233
    expect(terminalBackgroundColor(0, "#123")).toBe("#112233");
  });

  it("is monotonic and always a valid 7-char hex across the domain", () => {
    let prevSum = -1;
    for (let l = 0; l <= 100; l += 5) {
      const hex = terminalBackgroundColor(l);
      expect(hex).toMatch(HEX);
      const [r, g, b] = [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
      ];
      const sum = r + g + b;
      expect(sum).toBeGreaterThanOrEqual(prevSum);
      prevSum = sum;
    }
  });

  it("keeps NaN safe (returns the base)", () => {
    expect(terminalBackgroundColor(NaN)).toBe(TERMINAL_BG_DARKEST);
  });
});
