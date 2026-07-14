import { describe, expect, it } from "vitest";

import { effectiveCursorBlink, reducedMotionActive } from "./motionPolicy";

describe("effectiveCursorBlink (UI v2 §2.5, task 383)", () => {
  it("keeps the user's blink setting when motion is allowed", () => {
    expect(effectiveCursorBlink(true, false)).toBe(true);
    expect(effectiveCursorBlink(false, false)).toBe(false);
  });

  it("gates blink off under reduced motion", () => {
    expect(effectiveCursorBlink(true, true)).toBe(false);
    expect(effectiveCursorBlink(false, true)).toBe(false);
  });
});

describe("reducedMotionActive", () => {
  const mediaMatching = (matches: boolean) => (query: string) => {
    expect(query).toBe("(prefers-reduced-motion: reduce)");
    return { matches };
  };

  it("the app's Settings toggle alone forces reduced motion", () => {
    expect(reducedMotionActive(true, mediaMatching(false))).toBe(true);
  });

  it("the OS prefers-reduced-motion query alone forces reduced motion", () => {
    expect(reducedMotionActive(false, mediaMatching(true))).toBe(true);
  });

  it("no signal → motion allowed", () => {
    expect(reducedMotionActive(false, mediaMatching(false))).toBe(false);
  });

  it("is defensive: no matchMedia (node) and a throwing matchMedia read false", () => {
    expect(reducedMotionActive(false)).toBe(false);
    expect(
      reducedMotionActive(false, () => {
        throw new Error("blocked");
      }),
    ).toBe(false);
  });
});
