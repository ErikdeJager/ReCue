import { describe, expect, it } from "vitest";

import { resolveCanvases } from "./boot";
import type { CanvasNode, CanvasTab } from "./types";

const tab = (id: string, name = id): CanvasTab => ({ id, name, layout: null });

/** A deterministic id factory so the migration branch is assertable. */
const ids = (...values: string[]) => {
  let i = 0;
  return () => values[i++] ?? "extra";
};

describe("resolveCanvases (#58/#84/#352/task 434)", () => {
  it("keeps the persisted tabs and their active id", () => {
    const persisted = {
      canvases: [tab("c1"), tab("c2")],
      activeId: "c2",
    };

    const r = resolveCanvases(persisted, null, null, null, ids("new"));

    expect(r.canvases).toEqual(persisted.canvases);
    expect(r.activeCanvasId).toBe("c2");
    expect(r.migrated).toBe(false);
  });

  it("falls back to the first tab when the persisted active id is stale", () => {
    const persisted = {
      canvases: [tab("c1"), tab("c2")],
      activeId: "gone",
    };

    const r = resolveCanvases(persisted, null, null, null, ids("new"));

    expect(r.activeCanvasId).toBe("c1");
    expect(r.migrated).toBe(false);
  });

  it("migrates the legacy single canvas_layout into one tab (#58)", () => {
    const legacy: CanvasNode = {
      type: "leaf",
      id: "l1",
      content: { kind: "terminal", sessionId: "t1", repoPath: "/repo/a" },
    };

    const r = resolveCanvases(null, legacy, null, null, ids("fresh"));

    expect(r.canvases).toEqual([
      { id: "fresh", name: "Canvas 1", layout: legacy },
    ]);
    expect(r.activeCanvasId).toBe("fresh");
    // The caller persists the migrated shape once (main window only).
    expect(r.migrated).toBe(true);
  });

  it("starts with one empty canvas when nothing is persisted at all", () => {
    const r = resolveCanvases(null, null, null, null, ids("fresh"));

    expect(r.canvases).toEqual([
      { id: "fresh", name: "Canvas 1", layout: null },
    ]);
    expect(r.activeCanvasId).toBe("fresh");
    expect(r.migrated).toBe(true);
  });

  it("treats an empty persisted tab list as nothing persisted", () => {
    const r = resolveCanvases(
      { canvases: [], activeId: "" },
      null,
      null,
      null,
      ids("fresh"),
    );

    expect(r.canvases.map((c) => c.id)).toEqual(["fresh"]);
    expect(r.migrated).toBe(true);
  });

  it("a detached window's pin always shows its own canvas (#84)", () => {
    const persisted = {
      canvases: [tab("c1"), tab("c2")],
      activeId: "c1",
    };

    const r = resolveCanvases(persisted, null, "c2", null, ids("new"));

    // The tabs are untouched; only the active tab is forced to this window's canvas.
    expect(r.canvases).toEqual(persisted.canvases);
    expect(r.activeCanvasId).toBe("c2");
    expect(r.migrated).toBe(false);
  });

  it("the pin wins even when the pinned canvas is not in the tab list (#84)", () => {
    const persisted = {
      canvases: [tab("c1")],
      activeId: "c1",
    };

    const r = resolveCanvases(persisted, null, "ghost", null, ids("new"));

    expect(r.activeCanvasId).toBe("ghost");
  });

  it("an app window's ?canvas= preset selects the tab when it exists (task 434)", () => {
    const persisted = {
      canvases: [tab("c1"), tab("c2")],
      activeId: "c1",
    };

    const r = resolveCanvases(persisted, null, null, "c2", ids("new"));

    expect(r.canvases).toEqual(persisted.canvases);
    expect(r.activeCanvasId).toBe("c2");
    expect(r.migrated).toBe(false);
  });

  it("a stale ?canvas= preset falls back to the persisted active tab (task 434)", () => {
    const persisted = {
      canvases: [tab("c1"), tab("c2")],
      activeId: "c2",
    };

    const r = resolveCanvases(persisted, null, null, "gone", ids("new"));

    expect(r.activeCanvasId).toBe("c2");
  });

  it("the detached pin beats the app-window preset (task 434)", () => {
    const persisted = {
      canvases: [tab("c1"), tab("c2")],
      activeId: "c1",
    };

    const r = resolveCanvases(persisted, null, "c1", "c2", ids("new"));

    expect(r.activeCanvasId).toBe("c1");
  });
});
