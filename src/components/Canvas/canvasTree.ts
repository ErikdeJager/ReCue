// Pure operations on the Canvas BSP layout tree (#46). Kept dependency-free and
// id-injected (callers pass new ids) so they're deterministic and unit-testable.
// Unchanged subtrees keep their object identity, so a relayout only remounts the
// affected branch — the #18 terminal pool reparents the rest, never disposing.

import type {
  CanvasContent,
  CanvasEdge,
  CanvasLeaf,
  CanvasNode,
} from "../../types";

/**
 * Split the leaf `targetId`, placing `content` on the dropped `edge`: left/right
 * make a row split, top/bottom a column split; the new content takes the dropped
 * side and the existing leaf the other. No-op (returns the tree) if not found.
 */
export function splitLeaf(
  tree: CanvasNode,
  targetId: string,
  edge: CanvasEdge,
  content: CanvasContent,
  newLeafId: string,
  newSplitId: string,
): CanvasNode {
  const replace = (node: CanvasNode): CanvasNode => {
    if (node.type === "leaf") {
      if (node.id !== targetId) return node;
      const dir = edge === "left" || edge === "right" ? "row" : "col";
      const newLeaf: CanvasNode = { type: "leaf", id: newLeafId, content };
      const newFirst = edge === "left" || edge === "top";
      return {
        type: "split",
        id: newSplitId,
        dir,
        a: newFirst ? newLeaf : node,
        b: newFirst ? node : newLeaf,
        sizes: [50, 50],
      };
    }
    const a = replace(node.a);
    const b = replace(node.b);
    return a === node.a && b === node.b ? node : { ...node, a, b };
  };
  return replace(tree);
}

/**
 * Remove the leaf `targetId`, collapsing its parent split into the sibling.
 * Returns null when the removed leaf was the whole canvas.
 */
export function removeLeaf(
  tree: CanvasNode,
  targetId: string,
): CanvasNode | null {
  if (tree.type === "leaf") return tree.id === targetId ? null : tree;
  const a = removeLeaf(tree.a, targetId);
  const b = removeLeaf(tree.b, targetId);
  if (a === null) return b; // a removed → collapse to b
  if (b === null) return a; // b removed → collapse to a
  if (a === tree.a && b === tree.b) return tree; // unchanged → keep identity
  return { ...tree, a, b };
}

/** Set the two sizes of the split `splitId` (returns a new tree if changed). */
export function updateSizes(
  tree: CanvasNode,
  splitId: string,
  sizes: [number, number],
): CanvasNode {
  if (tree.type === "leaf") return tree;
  if (tree.id === splitId) return { ...tree, sizes };
  const a = updateSizes(tree.a, splitId, sizes);
  const b = updateSizes(tree.b, splitId, sizes);
  return a === tree.a && b === tree.b ? tree : { ...tree, a, b };
}

/** Every leaf id in the tree, left-to-right (diagnostics + tests). */
export function leafIds(tree: CanvasNode | null): string[] {
  if (!tree) return [];
  if (tree.type === "leaf") return [tree.id];
  return [...leafIds(tree.a), ...leafIds(tree.b)];
}

/** Every leaf node, left-to-right — used to dedup content (#47). */
export function collectLeaves(tree: CanvasNode | null): CanvasLeaf[] {
  if (!tree) return [];
  if (tree.type === "leaf") return [tree];
  return [...collectLeaves(tree.a), ...collectLeaves(tree.b)];
}

/**
 * Append a new leaf to the right of the whole canvas — used when content is
 * added without a specific drop target (e.g. the repo menu's "Open diff in
 * Canvas", #47). The existing tree keeps the larger share.
 */
export function appendLeaf(
  tree: CanvasNode,
  content: CanvasContent,
  newLeafId: string,
  newSplitId: string,
): CanvasNode {
  return {
    type: "split",
    id: newSplitId,
    dir: "row",
    a: tree,
    b: { type: "leaf", id: newLeafId, content },
    sizes: [70, 30],
  };
}
