import { describe, expect, it } from "vitest";

import {
  TERMINAL_BG_DARKEST,
  TERMINAL_BG_LIGHTEST,
  terminalBackgroundColor,
} from "./terminalBackground";

const HEX = /^#[0-9a-f]{6}$/i;

describe("terminalBackgroundColor (#390)", () => {
  it("returns the base (near-black) at lightness 0", () => {
    expect(terminalBackgroundColor(0)).toBe(TERMINAL_BG_DARKEST);
    expect(terminalBackgroundColor(0, "#202030")).toBe("#202030");
  });

  it("returns the gray-ish endpoint at lightness 100", () => {
    expect(terminalBackgroundColor(100)).toBe(TERMINAL_BG_LIGHTEST);
  });

  it("interpolates the midpoint halfway between base and lightest", () => {
    // #11111b -> #3a3a45, midpoint each channel:
    // R (0x11..0x3a) = (17+58)/2 = 37.5 -> round 38 = 0x26
    // G same as R = 0x26
    // B (0x1b..0x45) = (27+69)/2 = 48 = 0x30
    expect(terminalBackgroundColor(50)).toBe("#262630");
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
