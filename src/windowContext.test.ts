import { describe, expect, it } from "vitest";

import {
  DETACHED_CANVAS_ID,
  IS_DETACHED_CANVAS_WINDOW,
  IS_MAIN_WINDOW,
  WINDOW_LABEL,
  ownedHere,
  ownerCanvasId,
} from "./windowContext";

// These module-load constants derive from `window.location.search`. In the Node
// test environment there is no `window`, so the try/catch falls back to the
// main-window identity — which is exactly the default-window contract we assert.
describe("window identity defaults (#84)", () => {
  it("reads as the main window when there is no ?canvas= param", () => {
    expect(DETACHED_CANVAS_ID).toBeNull();
    expect(IS_MAIN_WINDOW).toBe(true);
    expect(WINDOW_LABEL).toBe("main");
  });

  it("is not a detached canvas window by default, and the predicate equals !IS_MAIN_WINDOW today (task 427)", () => {
    expect(IS_DETACHED_CANVAS_WINDOW).toBe(false);
    // Today the only window kinds are main and canvas-<id>, so the #105 WebGL
    // gate's new constant is provably byte-identical to the old !IS_MAIN_WINDOW.
    expect(IS_DETACHED_CANVAS_WINDOW).toBe(!IS_MAIN_WINDOW);
  });
});

describe("ownedHere (#84)", () => {
  it("owns an unmapped session (defaults to main)", () => {
    expect(ownedHere({}, "s1")).toBe(true);
  });

  it("owns a session explicitly mapped to this (main) window", () => {
    expect(ownedHere({ s1: "main" }, "s1")).toBe(true);
  });

  it("does not own a session owned by a detached canvas window", () => {
    expect(ownedHere({ s1: "canvas-c1" }, "s1")).toBe(false);
  });
});

describe("ownerCanvasId (#84)", () => {
  it("extracts the canvas id from a canvas owner label", () => {
    expect(ownerCanvasId("canvas-abc")).toBe("abc");
  });

  it("preserves ids that themselves contain hyphens", () => {
    expect(ownerCanvasId("canvas-a1-b2-c3")).toBe("a1-b2-c3");
  });

  it("returns null for the main label and for undefined", () => {
    expect(ownerCanvasId("main")).toBeNull();
    expect(ownerCanvasId(undefined)).toBeNull();
  });
});
