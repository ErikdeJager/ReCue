import { describe, expect, it } from "vitest";

import {
  APP_WINDOW_ID,
  INIT_CANVAS_ID,
  INIT_REPO_PATH,
  WINDOW_KIND,
  WINDOW_LABEL,
  isPrimaryLabel,
  parseWindowIdentity,
} from "./windowContext";

describe("parseWindowIdentity (task 434/437)", () => {
  it("no params → the main window", () => {
    expect(parseWindowIdentity("")).toEqual({
      kind: "main",
      label: "main",
      appWindowId: null,
      initRepoPath: null,
      initCanvasId: null,
    });
  });

  it("?canvas= without ?win= → a full app window on that canvas (the 9/16 compat route, task 437)", () => {
    // The label keeps the REAL Tauri label such a legacy window would carry
    // (`canvas-<id>`) so the 426 view purge / 427 attach stay per-window-correct.
    expect(parseWindowIdentity("?canvas=abc")).toEqual({
      kind: "app",
      label: "canvas-abc",
      appWindowId: null,
      initRepoPath: null,
      initCanvasId: "abc",
    });
  });

  it("?win= → a full app window", () => {
    expect(parseWindowIdentity("?win=u1")).toEqual({
      kind: "app",
      label: "app-u1",
      appWindowId: "u1",
      initRepoPath: null,
      initCanvasId: null,
    });
  });

  it("?win= beats ?canvas=: the canvas id becomes the soft init preset", () => {
    const id = parseWindowIdentity("?win=u1&canvas=c2");
    expect(id.kind).toBe("app");
    expect(id.label).toBe("app-u1");
    expect(id.initCanvasId).toBe("c2");
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
describe("window identity defaults (task 434/437)", () => {
  it("reads as the main window when there are no params", () => {
    expect(WINDOW_KIND).toBe("main");
    expect(WINDOW_LABEL).toBe("main");
    expect(APP_WINDOW_ID).toBeNull();
    expect(INIT_REPO_PATH).toBeNull();
    expect(INIT_CANVAS_ID).toBeNull();
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
