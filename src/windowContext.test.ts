import { describe, expect, it } from "vitest";

import {
  APP_WINDOW_ID,
  DETACHED_CANVAS_ID,
  INIT_CANVAS_ID,
  INIT_REPO_PATH,
  IS_DETACHED_CANVAS_WINDOW,
  IS_FULL_APP_WINDOW,
  WINDOW_KIND,
  WINDOW_LABEL,
  isPrimaryLabel,
  ownedHere,
  ownerCanvasId,
  parseWindowIdentity,
} from "./windowContext";

describe("parseWindowIdentity (task 434)", () => {
  it("no params → the main window", () => {
    expect(parseWindowIdentity("")).toEqual({
      kind: "main",
      label: "main",
      appWindowId: null,
      detachedCanvasId: null,
      initRepoPath: null,
      initCanvasId: null,
    });
  });

  it("?canvas= without ?win= → the legacy detached canvas window (#84)", () => {
    expect(parseWindowIdentity("?canvas=abc")).toEqual({
      kind: "canvas",
      label: "canvas-abc",
      appWindowId: null,
      detachedCanvasId: "abc",
      initRepoPath: null,
      initCanvasId: null,
    });
  });

  it("?win= → a full app window", () => {
    expect(parseWindowIdentity("?win=u1")).toEqual({
      kind: "app",
      label: "app-u1",
      appWindowId: "u1",
      detachedCanvasId: null,
      initRepoPath: null,
      initCanvasId: null,
    });
  });

  it("?win= beats ?canvas=: the canvas id becomes the soft init preset", () => {
    const id = parseWindowIdentity("?win=u1&canvas=c2");
    expect(id.kind).toBe("app");
    expect(id.label).toBe("app-u1");
    expect(id.initCanvasId).toBe("c2");
    expect(id.detachedCanvasId).toBeNull();
  });

  it("percent-decodes the ?repo= init preset (a unix path with a space)", () => {
    const id = parseWindowIdentity("?win=u1&repo=%2Fa%2Fb%20c");
    expect(id.initRepoPath).toBe("/a/b c");
  });

  it("percent-decodes a Windows ?repo= path (backslashes, drive colon, space)", () => {
    const id = parseWindowIdentity("?win=u&repo=C%3A%5CUsers%5Ca%20b");
    expect(id.initRepoPath).toBe("C:\\Users\\a b");
  });

  it("an empty ?win= value reads as absent → the main window", () => {
    expect(parseWindowIdentity("?win=").kind).toBe("main");
  });

  it("an empty ?canvas= value reads as absent too", () => {
    expect(parseWindowIdentity("?canvas=").kind).toBe("main");
    expect(parseWindowIdentity("?win=u1&canvas=").initCanvasId).toBeNull();
  });

  it("param order is irrelevant", () => {
    const a = parseWindowIdentity("?win=u1&canvas=c2&repo=%2Fr");
    const b = parseWindowIdentity("?repo=%2Fr&canvas=c2&win=u1");
    expect(a).toEqual(b);
  });
});

// The module-load constants derive from `window.location.search`. In the Node
// test environment there is no `window`, so the try/catch falls back to the
// main-window identity — which is exactly the default-window contract we assert.
describe("window identity defaults (#84/task 434)", () => {
  it("reads as the main window when there are no params", () => {
    expect(WINDOW_KIND).toBe("main");
    expect(WINDOW_LABEL).toBe("main");
    expect(APP_WINDOW_ID).toBeNull();
    expect(DETACHED_CANVAS_ID).toBeNull();
    expect(INIT_REPO_PATH).toBeNull();
    expect(INIT_CANVAS_ID).toBeNull();
  });

  it("is a full app window, never a detached canvas — exact complements", () => {
    expect(IS_DETACHED_CANVAS_WINDOW).toBe(false);
    expect(IS_FULL_APP_WINDOW).toBe(true);
    // The two constants are exact complements by construction (task 434).
    expect(IS_FULL_APP_WINDOW).toBe(!IS_DETACHED_CANVAS_WINDOW);
  });
});

describe("ownedHere (#84/task 434)", () => {
  it("owns an unmapped session (defaults to main — this test env is a full window)", () => {
    expect(ownedHere({}, "s1")).toBe(true);
  });

  it('owns a session explicitly mapped to "main" (rendered by every full window)', () => {
    expect(ownedHere({ s1: "main" }, "s1")).toBe(true);
  });

  it("does not own a session owned by a detached canvas window (exclusive)", () => {
    expect(ownedHere({ s1: "canvas-c1" }, "s1")).toBe(false);
  });

  it("does not own a session mapped to a foreign app label (future-proofing — computeSessionOwners never emits one today)", () => {
    expect(ownedHere({ s1: "app-other" }, "s1")).toBe(false);
  });
});

describe("isPrimaryLabel (task 433)", () => {
  it("is primary when the elected label matches this window's label", () => {
    // The test env is the main window (no params), so WINDOW_LABEL is "main".
    expect(isPrimaryLabel("main")).toBe(true);
  });

  it("is not primary for any other elected label", () => {
    expect(isPrimaryLabel("canvas-x")).toBe(false);
    expect(isPrimaryLabel("app-2")).toBe(false);
  });

  it("is not primary when no full window survives (null)", () => {
    expect(isPrimaryLabel(null)).toBe(false);
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
