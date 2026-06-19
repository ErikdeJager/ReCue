import { describe, expect, it } from "vitest";

import type { CanvasContent, CanvasNode } from "../../types";
import {
  appendLeaf,
  collectLeaves,
  leafIds,
  leafRects,
  removeLeaf,
  spatialNeighbor,
  splitLeaf,
  updateSizes,
} from "./canvasTree";

const ph: CanvasContent = { kind: "placeholder" };
const leaf = (id: string): CanvasNode => ({ type: "leaf", id, content: ph });

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
