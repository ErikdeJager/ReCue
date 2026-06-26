import { describe, expect, it } from "vitest";

import type { CanvasContent, CanvasNode } from "../../types";
import { canvasToTemplate } from "./canvasToTemplate";

const live = (id: string, content: CanvasContent): CanvasNode => ({
  type: "leaf",
  id,
  content,
});

describe("canvasToTemplate (#187)", () => {
  it("maps each live kind to the equivalent block kind", () => {
    const cases: Array<[string, CanvasContent, string]> = [
      [
        "agent",
        { kind: "agent", sessionId: "s1", repoPath: "/r" },
        "new-agent",
      ],
      ["terminal", { kind: "terminal", sessionId: "t1" }, "new-terminal"],
      ["file", { kind: "file", repoPath: "/r", file: "a.ts" }, "open-file"],
      ["diff", { kind: "diff", repoPath: "/r" }, "open-diff"],
      [
        "kanban",
        { kind: "kanban", repoPath: "/r", file: "KANBAN.md" },
        "open-kanban",
      ],
      ["filetree", { kind: "filetree", repoPath: "/r" }, "open-filetree"],
    ];
    for (const [, content, blockKind] of cases) {
      const out = canvasToTemplate(live("p1", content));
      expect(out).not.toBeNull();
      if (out?.type !== "leaf") throw new Error("expected leaf");
      expect(out.content.kind).toBe(blockKind);
      expect(out.id).toBe("p1"); // reuses the leaf id (deterministic/pure)
    }
  });

  it("carries the relative path for file/kanban and drops repoPath", () => {
    const file = canvasToTemplate(
      live("p1", { kind: "file", repoPath: "/repo", file: "src/x.ts" }),
    );
    expect(file).toMatchObject({
      type: "leaf",
      content: { kind: "open-file", file: "src/x.ts" },
    });
    if (file?.type !== "leaf") throw new Error("expected leaf");
    expect(file.content.repoPath).toBeUndefined();

    const kanban = canvasToTemplate(
      live("p2", { kind: "kanban", repoPath: "/repo", file: "board.md" }),
    );
    expect(kanban).toMatchObject({
      content: { kind: "open-kanban", file: "board.md" },
    });
  });

  it("carries the agent's resolved custom name, or omits it when none", () => {
    const named = canvasToTemplate(
      live("p1", { kind: "agent", sessionId: "s1" }),
      (id) => (id === "s1" ? "My agent" : undefined),
    );
    expect(named).toMatchObject({
      content: { kind: "new-agent", name: "My agent" },
    });

    const unnamed = canvasToTemplate(
      live("p2", { kind: "agent", sessionId: "s2" }),
      () => undefined,
    );
    if (unnamed?.type !== "leaf") throw new Error("expected leaf");
    expect(unnamed.content.kind).toBe("new-agent");
    expect(unnamed.content.name).toBeUndefined();
    // No prompt is ever recovered from a live agent.
    expect(unnamed.content.prompt).toBeUndefined();
  });

  it("drops scheduled/pending panels, collapsing the split to the sibling", () => {
    const tree: CanvasNode = {
      type: "split",
      id: "root",
      dir: "row",
      sizes: [40, 60],
      a: live("p1", { kind: "file", repoPath: "/r", file: "a.ts" }),
      b: live("p2", { kind: "scheduled", scheduleId: "sch1" }),
    };
    const out = canvasToTemplate(tree);
    // The scheduled panel is dropped → collapse to the file block (the survivor).
    expect(out).toMatchObject({
      type: "leaf",
      id: "p1",
      content: { kind: "open-file", file: "a.ts" },
    });
  });

  it("returns null for an empty or all-dropped canvas", () => {
    expect(canvasToTemplate(null)).toBeNull();
    expect(
      canvasToTemplate(live("p1", { kind: "pending", repoPath: "/r" })),
    ).toBeNull();
    const allDropped: CanvasNode = {
      type: "split",
      id: "root",
      dir: "row",
      sizes: [50, 50],
      a: live("p1", { kind: "scheduled", scheduleId: "s1" }),
      b: live("p2", { kind: "pending", repoPath: "/r" }),
    };
    expect(canvasToTemplate(allDropped)).toBeNull();
  });

  it("preserves dir, sizes, and panel order in a mixed nested tree", () => {
    const tree: CanvasNode = {
      type: "split",
      id: "root",
      dir: "col",
      sizes: [30, 70],
      a: live("p1", { kind: "agent", sessionId: "s1" }),
      b: {
        type: "split",
        id: "inner",
        dir: "row",
        sizes: [25, 75],
        a: live("p2", { kind: "file", repoPath: "/r", file: "a.ts" }),
        b: live("p3", { kind: "terminal", sessionId: "t1" }),
      },
    };
    const out = canvasToTemplate(tree, () => "Agent A");
    expect(out).toMatchObject({
      type: "split",
      id: "root",
      dir: "col",
      sizes: [30, 70],
      a: { content: { kind: "new-agent", name: "Agent A" } },
      b: {
        type: "split",
        dir: "row",
        sizes: [25, 75],
        a: { content: { kind: "open-file", file: "a.ts" } },
        b: { content: { kind: "new-terminal" } },
      },
    });
  });
});
