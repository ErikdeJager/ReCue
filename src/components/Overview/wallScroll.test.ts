import { describe, expect, it } from "vitest";

import { horizontalWheelDelta, isHorizontalWheelIntent } from "./wallScroll";

describe("isHorizontalWheelIntent", () => {
  it("is true for a horizontally-dominant trackpad swipe", () => {
    expect(
      isHorizontalWheelIntent({ deltaX: 20, deltaY: 3, shiftKey: false }),
    ).toBe(true);
    expect(
      isHorizontalWheelIntent({ deltaX: -20, deltaY: 0, shiftKey: false }),
    ).toBe(true);
  });

  it("is false for a vertically-dominant wheel (flows to the agent)", () => {
    expect(
      isHorizontalWheelIntent({ deltaX: 3, deltaY: 20, shiftKey: false }),
    ).toBe(false);
    expect(
      isHorizontalWheelIntent({ deltaX: 0, deltaY: 20, shiftKey: false }),
    ).toBe(false);
  });

  it("treats a shift+vertical wheel as horizontal", () => {
    expect(
      isHorizontalWheelIntent({ deltaX: 0, deltaY: 20, shiftKey: true }),
    ).toBe(true);
  });

  it("does not treat a shift with no vertical delta as horizontal", () => {
    expect(
      isHorizontalWheelIntent({ deltaX: 0, deltaY: 0, shiftKey: true }),
    ).toBe(false);
  });

  it("is false for a zero delta", () => {
    expect(
      isHorizontalWheelIntent({ deltaX: 0, deltaY: 0, shiftKey: false }),
    ).toBe(false);
  });
});

describe("horizontalWheelDelta", () => {
  it("uses the horizontal delta when present", () => {
    expect(
      horizontalWheelDelta({ deltaX: 15, deltaY: 4, shiftKey: false }),
    ).toBe(15);
    expect(
      horizontalWheelDelta({ deltaX: -15, deltaY: 0, shiftKey: false }),
    ).toBe(-15);
  });

  it("falls back to the vertical delta for a shift+wheel", () => {
    expect(
      horizontalWheelDelta({ deltaX: 0, deltaY: 20, shiftKey: true }),
    ).toBe(20);
  });
});
