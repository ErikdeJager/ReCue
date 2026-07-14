import { beforeEach, describe, expect, it } from "vitest";

import { createWebglFallback, webglFallback } from "./webglFallback";

describe("createWebglFallback (#364)", () => {
  it("starts armed: WebGL allowed, nothing lost, no records", () => {
    const gate = createWebglFallback();

    expect(gate.allowsWebgl()).toBe(true);
    expect(gate.hasLostContext()).toBe(false);
    expect(gate.rendererOf("a")).toBeUndefined();
  });

  it("records the renderer a host attached", () => {
    const gate = createWebglFallback();

    gate.noteRenderer("a", "webgl");
    gate.noteRenderer("b", "dom");

    expect(gate.rendererOf("a")).toBe("webgl");
    expect(gate.rendererOf("b")).toBe("dom");
    // Recording a renderer is not a loss.
    expect(gate.hasLostContext()).toBe(false);
    expect(gate.allowsWebgl()).toBe(true);
  });

  it("latches the window to the DOM renderer on the first context loss", () => {
    const gate = createWebglFallback();
    gate.noteRenderer("a", "webgl");

    expect(gate.noteContextLoss("a")).toBe(true);

    expect(gate.hasLostContext()).toBe(true);
    expect(gate.allowsWebgl()).toBe(false);
    // The addon is disposed, so the session is on the DOM renderer now.
    expect(gate.rendererOf("a")).toBe("dom");
  });

  it("returns false for every loss after the first, so the caller warns once", () => {
    const gate = createWebglFallback();
    gate.noteRenderer("a", "webgl");
    gate.noteRenderer("b", "webgl");

    // A real driver-level loss fires on every live context at once.
    expect(gate.noteContextLoss("a")).toBe(true);
    expect(gate.noteContextLoss("b")).toBe(false);
    // Idempotent: the same session losing twice does not re-arm anything.
    expect(gate.noteContextLoss("a")).toBe(false);

    expect(gate.hasLostContext()).toBe(true);
    expect(gate.allowsWebgl()).toBe(false);
    expect(gate.rendererOf("a")).toBe("dom");
    expect(gate.rendererOf("b")).toBe("dom");
  });

  it("does not re-arm WebGL for a terminal created after a loss", () => {
    const gate = createWebglFallback();
    gate.noteContextLoss("a");

    // A later spawn is gated off WebGL and records the DOM renderer.
    expect(gate.allowsWebgl()).toBe(false);
    gate.noteRenderer("c", "dom");
    expect(gate.rendererOf("c")).toBe("dom");
    expect(gate.allowsWebgl()).toBe(false);
  });

  it("forget() drops the record but keeps the latch", () => {
    const gate = createWebglFallback();
    gate.noteRenderer("a", "webgl");
    gate.noteContextLoss("a");

    gate.forget("a");

    expect(gate.rendererOf("a")).toBeUndefined();
    // A session Restart recreating a host must NOT re-attach WebGL.
    expect(gate.hasLostContext()).toBe(true);
    expect(gate.allowsWebgl()).toBe(false);
  });

  it("forget() of an unknown session is a no-op", () => {
    const gate = createWebglFallback();
    gate.noteRenderer("a", "webgl");

    gate.forget("nope");

    expect(gate.rendererOf("a")).toBe("webgl");
    expect(gate.allowsWebgl()).toBe(true);
  });

  it("reset() re-arms WebGL and clears the records", () => {
    const gate = createWebglFallback();
    gate.noteRenderer("a", "webgl");
    gate.noteContextLoss("a");

    gate.reset();

    expect(gate.allowsWebgl()).toBe(true);
    expect(gate.hasLostContext()).toBe(false);
    expect(gate.rendererOf("a")).toBeUndefined();
    // …and the latch works again from a clean slate.
    expect(gate.noteContextLoss("a")).toBe(true);
  });

  it("gates are independent (one per document — main vs detached window, #84)", () => {
    const main = createWebglFallback();
    const detached = createWebglFallback();

    main.noteContextLoss("a");

    expect(main.allowsWebgl()).toBe(false);
    expect(detached.allowsWebgl()).toBe(true);
    expect(detached.hasLostContext()).toBe(false);
  });
});

describe("webglFallback singleton (#364)", () => {
  beforeEach(() => {
    webglFallback.reset();
  });

  it("is a live gate that reset() returns to its fresh state", () => {
    expect(webglFallback.allowsWebgl()).toBe(true);
    expect(webglFallback.hasLostContext()).toBe(false);

    webglFallback.noteRenderer("s1", "webgl");
    expect(webglFallback.noteContextLoss("s1")).toBe(true);
    expect(webglFallback.allowsWebgl()).toBe(false);

    webglFallback.reset();

    expect(webglFallback.allowsWebgl()).toBe(true);
    expect(webglFallback.hasLostContext()).toBe(false);
    expect(webglFallback.rendererOf("s1")).toBeUndefined();
  });
});
