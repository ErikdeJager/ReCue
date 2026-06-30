import { describe, expect, it } from "vitest";

import type { CanvasContent, CanvasNode, CanvasTab } from "../../types";
import { rewriteScheduledLeaves } from "./canvasSchedule";

const leaf = (id: string, content: CanvasContent): CanvasNode => ({
  type: "leaf",
  id,
  content,
});

const split = (id: string, a: CanvasNode, b: CanvasNode): CanvasNode => ({
  type: "split",
  id,
  dir: "row",
  a,
  b,
  sizes: [50, 50],
});

const agent: CanvasContent = {
  kind: "agent",
  sessionId: "sess-1",
  repoPath: "/repo",
};

describe("rewriteScheduledLeaves (#280)", () => {
  it("replaces a scheduled leaf with the live agent, preserving the leaf id", () => {
    const tabs: CanvasTab[] = [
      {
        id: "c1",
        name: "Canvas 1",
        layout: leaf("L1", { kind: "scheduled", scheduleId: "sch-1" }),
      },
    ];
    const next = rewriteScheduledLeaves(tabs, "sch-1", agent);
    expect(next).not.toBe(tabs);
    const layout = next[0]!.layout as Extract<CanvasNode, { type: "leaf" }>;
    expect(layout.id).toBe("L1"); // id preserved → pooled terminal reparents
    expect(layout.content).toEqual(agent);
  });

  it("rewrites the matching scheduled leaf deep in a split, keeping siblings", () => {
    const fileLeaf = leaf("L2", {
      kind: "file",
      repoPath: "/repo",
      file: "a.md",
    });
    const tabs: CanvasTab[] = [
      {
        id: "c1",
        name: "Canvas 1",
        layout: split(
          "s1",
          fileLeaf,
          leaf("L3", { kind: "scheduled", scheduleId: "sch-1" }),
        ),
      },
    ];
    const next = rewriteScheduledLeaves(tabs, "sch-1", agent);
    const layout = next[0]!.layout as Extract<CanvasNode, { type: "split" }>;
    // Untouched sibling keeps its object identity.
    expect(layout.a).toBe(fileLeaf);
    const rewritten = layout.b as Extract<CanvasNode, { type: "leaf" }>;
    expect(rewritten.id).toBe("L3");
    expect(rewritten.content).toEqual(agent);
  });

  it("rewrites the same schedule across multiple tabs", () => {
    const tabs: CanvasTab[] = [
      {
        id: "c1",
        name: "Canvas 1",
        layout: leaf("L1", { kind: "scheduled", scheduleId: "sch-1" }),
      },
      {
        id: "c2",
        name: "Canvas 2",
        layout: leaf("L2", { kind: "scheduled", scheduleId: "sch-1" }),
      },
    ];
    const next = rewriteScheduledLeaves(tabs, "sch-1", agent);
    for (const tab of next) {
      const layout = tab.layout as Extract<CanvasNode, { type: "leaf" }>;
      expect(layout.content).toEqual(agent);
    }
  });

  it("leaves a different schedule's leaf untouched", () => {
    const otherLeaf = leaf("L1", { kind: "scheduled", scheduleId: "sch-2" });
    const tabs: CanvasTab[] = [
      { id: "c1", name: "Canvas 1", layout: otherLeaf },
    ];
    const next = rewriteScheduledLeaves(tabs, "sch-1", agent);
    expect(next).toBe(tabs); // no match → same reference
    expect((next[0]!.layout as typeof otherLeaf).content.scheduleId).toBe(
      "sch-2",
    );
  });

  it("returns the same array reference when no leaf matches (incl. empty/null layouts)", () => {
    const tabs: CanvasTab[] = [
      { id: "c1", name: "Canvas 1", layout: null },
      {
        id: "c2",
        name: "Canvas 2",
        layout: leaf("L1", { kind: "agent", sessionId: "x" }),
      },
    ];
    expect(rewriteScheduledLeaves(tabs, "sch-1", agent)).toBe(tabs);
  });
});
