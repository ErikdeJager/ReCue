import { describe, expect, it } from "vitest";

import type { CanvasContent, CanvasNode } from "../../types";
import {
  appendLeaf,
  collectLeaves,
  collectSplits,
  displayedLayout,
  equalize,
  equalizeSplit,
  leafCount,
  leafIds,
  leafRects,
  moveLeaf,
  removeLeaf,
  sessionIdsInLayout,
  spatialNeighbor,
  splitLeaf,
  updateLeafContent,
  updateSizes,
} from "./canvasTree";

const ph: CanvasContent = { kind: "placeholder" };
const leaf = (id: string): CanvasNode => ({ type: "leaf", id, content: ph });
const agentLeaf = (id: string, sessionId: string): CanvasNode => ({
  type: "leaf",
  id,
  content: { kind: "agent", sessionId },
});

describe("canvas BSP tree (#46)", () => {
  it("splits a leaf to the right into a row split (existing first)", () => {
    const tree = splitLeaf(leaf("p1"), "p1", "right", ph, "p2", "s1");
    expect(tree).toMatchObject({
      type: "split",
      dir: "row",
      sizes: [50, 50],
      a: { id: "p1" },
      b: { id: "p2" },
    });
  });

  it("splits to the left/top placing the new panel first", () => {
    const left = splitLeaf(leaf("p1"), "p1", "left", ph, "p2", "s1");
    expect(left).toMatchObject({
      dir: "row",
      a: { id: "p2" },
      b: { id: "p1" },
    });
    const top = splitLeaf(leaf("p1"), "p1", "top", ph, "p3", "s2");
    expect(top).toMatchObject({ dir: "col", a: { id: "p3" }, b: { id: "p1" } });
  });

  it("splits recursively, finding a nested leaf", () => {
    let tree = splitLeaf(leaf("p1"), "p1", "right", ph, "p2", "s1");
    tree = splitLeaf(tree, "p2", "bottom", ph, "p3", "s2");
    expect(leafIds(tree)).toEqual(["p1", "p2", "p3"]);
  });

  it("removes a leaf, collapsing its split into the sibling", () => {
    const tree = splitLeaf(leaf("p1"), "p1", "right", ph, "p2", "s1");
    expect(removeLeaf(tree, "p2")).toEqual(leaf("p1")); // collapse to sibling
    expect(removeLeaf(leaf("p1"), "p1")).toBeNull(); // last leaf → empty canvas
  });

  it("keeps unaffected subtrees' identity on remove", () => {
    let tree = splitLeaf(leaf("p1"), "p1", "right", ph, "p2", "s1");
    tree = splitLeaf(tree, "p1", "bottom", ph, "p3", "s2") as CanvasNode;
    // tree = split(s1){ a: split(s2){p1,p3}, b: p2 }; removing p2 keeps the s2 subtree.
    if (tree.type !== "split") throw new Error("expected split");
    const subtree = tree.a;
    const after = removeLeaf(tree, "p2");
    expect(after).toBe(subtree); // collapsed to the untouched a-subtree (same ref)
  });

  it("updates a split's sizes", () => {
    const tree = splitLeaf(leaf("p1"), "p1", "right", ph, "p2", "s1");
    const resized = updateSizes(tree, "s1", [70, 30]);
    expect(resized).toMatchObject({ sizes: [70, 30] });
  });

  it("appends a leaf to the right of the whole canvas (#47)", () => {
    const tree = splitLeaf(leaf("p1"), "p1", "right", ph, "p2", "s1");
    const appended = appendLeaf(tree, ph, "p3", "s2");
    expect(appended).toMatchObject({
      type: "split",
      dir: "row",
      b: { id: "p3" },
    });
    expect(leafIds(appended)).toEqual(["p1", "p2", "p3"]);
  });

  it("collects every leaf node, left-to-right (#47)", () => {
    let tree = splitLeaf(leaf("p1"), "p1", "right", ph, "p2", "s1");
    tree = splitLeaf(tree, "p2", "bottom", ph, "p3", "s2");
    expect(collectLeaves(tree).map((l) => l.id)).toEqual(["p1", "p2", "p3"]);
    expect(collectLeaves(null)).toEqual([]);
  });

  it("moves a leaf to reorder siblings, preserving its id + content (#135)", () => {
    // split(s1){ a: agent(p1,A), b: p2 }; move p1 onto p2's right → order p2, p1.
    const tree = splitLeaf(agentLeaf("p1", "A"), "p1", "right", ph, "p2", "s1");
    const moved = moveLeaf(tree, "p1", "p2", "right", "s2");
    expect(leafIds(moved)).toEqual(["p2", "p1"]);
    // The moved leaf keeps its id AND its agent content (so the pool reparents).
    expect(collectLeaves(moved).find((l) => l.id === "p1")?.content).toEqual({
      kind: "agent",
      sessionId: "A",
    });
  });

  it("repositions a leaf across branches (#135)", () => {
    // split(s1){ a: split(s2){p1,p3}, b: p2 }; move p2 onto p1's top.
    let tree = splitLeaf(leaf("p1"), "p1", "right", ph, "p2", "s1");
    tree = splitLeaf(tree, "p1", "bottom", ph, "p3", "s2");
    const moved = moveLeaf(tree, "p2", "p1", "top", "s3");
    // p2 removed from its branch (its split collapses), re-split above p1.
    expect(leafIds(moved).sort()).toEqual(["p1", "p2", "p3"]);
    expect(leafIds(moved).indexOf("p2")).toBeLessThan(
      leafIds(moved).indexOf("p1"),
    );
  });

  it("is a no-op for self-drop, single-leaf, or a missing target (#135)", () => {
    const tree = splitLeaf(leaf("p1"), "p1", "right", ph, "p2", "s1");
    expect(moveLeaf(tree, "p1", "p1", "right", "s2")).toBe(tree); // self-drop
    expect(moveLeaf(leaf("p1"), "p1", "p1", "right", "s2")).toEqual(leaf("p1")); // single leaf
    expect(moveLeaf(tree, "p9", "p1", "right", "s2")).toBe(tree); // source missing
    expect(moveLeaf(tree, "p1", "p9", "right", "s2")).toBe(tree); // target missing → keep panel
  });

  it("displayedLayout removes the lifted leaf, reflowing the rest (#155)", () => {
    const tree = splitLeaf(leaf("p1"), "p1", "right", ph, "p2", "s1");
    // Lifting p2 collapses the split to its sibling p1 (the gap is filled).
    expect(displayedLayout(tree, "p2")).toEqual(leaf("p1"));
    // Lifting the sole panel exposes the empty canvas (→ the center drop target).
    expect(displayedLayout(leaf("p1"), "p1")).toBeNull();
  });

  it("displayedLayout is identity when nothing is lifted (#155)", () => {
    const tree = splitLeaf(leaf("p1"), "p1", "right", ph, "p2", "s1");
    expect(displayedLayout(tree, null)).toBe(tree); // no lift → same reference
    expect(displayedLayout(tree, undefined)).toBe(tree);
    expect(displayedLayout(tree, "p9")).toBe(tree); // unknown id → unchanged
    expect(displayedLayout(null, "p1")).toBeNull();
  });

  it("merges partial content into a leaf, keeping other subtrees' identity (#90)", () => {
    const fileLeaf: CanvasNode = {
      type: "leaf",
      id: "p1",
      content: { kind: "file", repoPath: "/r", file: "a.md" },
    };
    const tree = splitLeaf(fileLeaf, "p1", "right", ph, "p2", "s1");
    if (tree.type !== "split") throw new Error("expected split");
    const sibling = tree.b; // the untouched p2 leaf
    const next = updateLeafContent(tree, "p1", { file: "b.md" });
    expect(collectLeaves(next).find((l) => l.id === "p1")?.content).toEqual({
      kind: "file",
      repoPath: "/r",
      file: "b.md",
    });
    if (next.type !== "split") throw new Error("expected split");
    expect(next.b).toBe(sibling); // unaffected subtree keeps its identity
    // A missing leaf id leaves the tree untouched (same ref).
    expect(updateLeafContent(tree, "nope", { file: "x.md" })).toBe(tree);
  });
});

describe("canvas distribute / equalize (#186)", () => {
  // A 3-panel row nests binary: split(l1, split(l2, l3)). Start uneven so the
  // distribute has work to do.
  const threeRow = (): CanvasNode => ({
    type: "split",
    id: "outer",
    dir: "row",
    sizes: [50, 50],
    a: leaf("l1"),
    b: {
      type: "split",
      id: "inner",
      dir: "row",
      sizes: [50, 50],
      a: leaf("l2"),
      b: leaf("l3"),
    },
  });
  // Each leaf's rendered share of the canvas (area %), from leafRects.
  const areas = (tree: CanvasNode): Record<string, number> =>
    Object.fromEntries(leafRects(tree).map((r) => [r.id, (r.w * r.h) / 100]));

  it("counts leaves in a subtree", () => {
    expect(leafCount(leaf("solo"))).toBe(1);
    expect(leafCount(threeRow())).toBe(3);
  });

  it("equalize is a no-op (same reference) for a single leaf", () => {
    const solo = leaf("solo");
    expect(equalize(solo)).toBe(solo);
  });

  it("distributes a 3-panel row to equal thirds (leaf-count weighting)", () => {
    const even = equalize(threeRow());
    if (even.type !== "split") throw new Error("expected split");
    // Outer split weighted 1 vs 2 leaves; inner split 1 vs 1.
    expect(even.sizes[0]).toBeCloseTo(100 / 3, 6);
    expect(even.sizes[1]).toBeCloseTo(200 / 3, 6);
    expect(even.b).toMatchObject({ sizes: [50, 50] });
    // Every leaf ends at an equal third of the canvas area.
    for (const id of ["l1", "l2", "l3"]) {
      expect(areas(even)[id]).toBeCloseTo(100 / 3, 4);
    }
  });

  it("distributes a mixed row/col tree to equal area per leaf", () => {
    // root(col): a = row(p1,p2), b = col(p3, row(p4,p5)) → 5 leaves total.
    const mixed: CanvasNode = {
      type: "split",
      id: "root",
      dir: "col",
      sizes: [20, 80],
      a: {
        type: "split",
        id: "a",
        dir: "row",
        sizes: [10, 90],
        a: leaf("p1"),
        b: leaf("p2"),
      },
      b: {
        type: "split",
        id: "b",
        dir: "col",
        sizes: [30, 70],
        a: leaf("p3"),
        b: {
          type: "split",
          id: "c",
          dir: "row",
          sizes: [60, 40],
          a: leaf("p4"),
          b: leaf("p5"),
        },
      },
    };
    const even = equalize(mixed);
    const a = areas(even);
    for (const id of ["p1", "p2", "p3", "p4", "p5"]) {
      expect(a[id]).toBeCloseTo(100 / 5, 4);
    }
  });

  it("is idempotent — re-equalizing an even tree returns the same reference", () => {
    const even = equalize(threeRow());
    expect(equalize(even)).toBe(even);
  });

  it("equalizeSplit only touches the named subtree", () => {
    const tree: CanvasNode = {
      type: "split",
      id: "root",
      dir: "col",
      sizes: [70, 30],
      a: {
        type: "split",
        id: "top",
        dir: "row",
        sizes: [80, 20],
        a: leaf("tl"),
        b: leaf("tr"),
      },
      b: leaf("bot"),
    };
    const next = equalizeSplit(tree, "top");
    if (next.type !== "split") throw new Error("expected split");
    expect(next.sizes).toEqual([70, 30]); // outer untouched
    expect(next.b).toBe(tree.b); // sibling subtree keeps identity
    expect((next.a as { sizes: [number, number] }).sizes).toEqual([50, 50]);
    // Unknown id, or a leaf id, leaves the whole tree unchanged (same ref).
    expect(equalizeSplit(tree, "nope")).toBe(tree);
    expect(equalizeSplit(tree, "bot")).toBe(tree);
  });

  it("collectSplits lists every split with its child ids + sizes", () => {
    const splits = collectSplits(threeRow());
    expect(splits.map((s) => s.id)).toEqual(["outer", "inner"]);
    expect(splits[0]).toMatchObject({ id: "outer", aId: "l1", bId: "inner" });
    expect(splits[1]).toMatchObject({ id: "inner", aId: "l2", bId: "l3" });
    expect(collectSplits(leaf("solo"))).toEqual([]);
    expect(collectSplits(null)).toEqual([]);
  });
});

describe("canvas spatial navigation (#76)", () => {
  // A 2×2 grid: top row (tl | tr) over bottom row (bl | br).
  const grid: CanvasNode = {
    type: "split",
    id: "root",
    dir: "col",
    sizes: [50, 50],
    a: {
      type: "split",
      id: "top",
      dir: "row",
      sizes: [50, 50],
      a: leaf("tl"),
      b: leaf("tr"),
    },
    b: {
      type: "split",
      id: "bot",
      dir: "row",
      sizes: [50, 50],
      a: leaf("bl"),
      b: leaf("br"),
    },
  };

  it("computes each leaf's rectangle from the tree + sizes", () => {
    const rects = Object.fromEntries(leafRects(grid).map((r) => [r.id, r]));
    expect(rects.tl).toMatchObject({ x: 0, y: 0, w: 50, h: 50 });
    expect(rects.br).toMatchObject({ x: 50, y: 50, w: 50, h: 50 });
  });

  it("finds the spatially adjacent panel in each direction", () => {
    expect(spatialNeighbor(grid, "tl", "right")).toBe("tr");
    expect(spatialNeighbor(grid, "tl", "down")).toBe("bl");
    expect(spatialNeighbor(grid, "tr", "left")).toBe("tl");
    expect(spatialNeighbor(grid, "br", "up")).toBe("tr");
  });

  it("returns null when there is no neighbor in that direction", () => {
    expect(spatialNeighbor(grid, "tl", "left")).toBeNull();
    expect(spatialNeighbor(grid, "tl", "up")).toBeNull();
    expect(spatialNeighbor(leaf("solo"), "solo", "right")).toBeNull();
    expect(spatialNeighbor(grid, "missing", "right")).toBeNull();
  });
});

describe("sessionIdsInLayout (the reconcile keep-alive, #118/task 437)", () => {
  it("lists agent/terminal session ids in a layout (ignoring file/diff)", () => {
    const tree: CanvasNode = {
      type: "split",
      id: "s1",
      dir: "row",
      sizes: [50, 50],
      a: agentLeaf("p1", "sess-a"),
      b: {
        type: "leaf",
        id: "p2",
        content: { kind: "file", repoPath: "/r", file: "README.md" },
      },
    };
    expect(sessionIdsInLayout(tree)).toEqual(["sess-a"]);
    expect(sessionIdsInLayout(null)).toEqual([]);
  });
});
