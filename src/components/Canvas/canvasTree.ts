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

/**
 * Move an existing leaf to another panel's `edge` (#135) — one op for both reorder
 * and reposition within the active tab. Computed **atomically on drop**: capture the
 * source leaf's id + content, `removeLeaf` it (its sibling reflows to fill the gap),
 * then `splitLeaf` the target reusing the source's **original id + content** (not
 * fresh ones) so the moved panel keeps its React key + #18 pool mapping and its
 * terminal reparents rather than being disposed/recreated.
 *
 * No-op (returns the original tree) when: `sourceId === targetId`, the source isn't
 * in the tree, the source is the whole canvas (`removeLeaf` → null), or the target
 * isn't present after the removal — so a stale/invalid drop never loses the panel.
 */
export function moveLeaf(
  tree: CanvasNode,
  sourceId: string,
  targetId: string,
  edge: CanvasEdge,
  newSplitId: string,
): CanvasNode {
  if (sourceId === targetId) return tree;
  const source = collectLeaves(tree).find((l) => l.id === sourceId);
  if (!source) return tree;
  const pruned = removeLeaf(tree, sourceId);
  if (pruned === null) return tree; // source was the whole canvas
  if (!leafIds(pruned).includes(targetId)) return tree; // target gone → don't drop it
  return splitLeaf(
    pruned,
    targetId,
    edge,
    source.content,
    sourceId,
    newSplitId,
  );
}

/**
 * The layout to **render** while a panel is lifted out mid-drag (#155): the active
 * layout with `liftedLeafId` removed (so the remaining panels reflow to fill the
 * gap and the lifted panel can't be its own drop target). Returns the original
 * layout when nothing is lifted, and `null` when the lifted leaf was the whole
 * canvas (→ the empty-canvas center drop target shows). Pure — the lift is
 * transient view state, never persisted, so an interrupted drag restores exactly.
 */
export function displayedLayout(
  layout: CanvasNode | null,
  liftedLeafId: string | null | undefined,
): CanvasNode | null {
  if (!layout || !liftedLeafId) return layout;
  return removeLeaf(layout, liftedLeafId);
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
 * Merge `partial` into the leaf `leafId`'s content (#90) — used to switch a file
 * panel's `file` in place. Unchanged subtrees keep their identity, so only the
 * affected leaf re-renders (the #18 pool reparents the rest). Returns the tree
 * unchanged when the leaf isn't found.
 */
export function updateLeafContent(
  tree: CanvasNode,
  leafId: string,
  partial: Partial<CanvasContent>,
): CanvasNode {
  if (tree.type === "leaf") {
    return tree.id === leafId
      ? { ...tree, content: { ...tree.content, ...partial } }
      : tree;
  }
  const a = updateLeafContent(tree.a, leafId, partial);
  const b = updateLeafContent(tree.b, leafId, partial);
  return a === tree.a && b === tree.b ? tree : { ...tree, a, b };
}

/**
 * Replace the leaf `leafId`'s content **wholesale** (#118) — used when a pending
 * template panel resolves to live content (clearing its `block`/`error`), where a
 * merge wouldn't drop the old fields. Unchanged subtrees keep their identity.
 */
export function setLeafContent(
  tree: CanvasNode,
  leafId: string,
  content: CanvasContent,
): CanvasNode {
  if (tree.type === "leaf") {
    return tree.id === leafId ? { ...tree, content } : tree;
  }
  const a = setLeafContent(tree.a, leafId, content);
  const b = setLeafContent(tree.b, leafId, content);
  return a === tree.a && b === tree.b ? tree : { ...tree, a, b };
}

/** The PTY session ids referenced by a layout's agent/terminal leaves —
 * the sessions whose terminal a window must keep alive for that canvas
 * (template-created terminals #118 live only in a Canvas layout). */
export function sessionIdsInLayout(tree: CanvasNode | null): string[] {
  return collectLeaves(tree)
    .filter((l) => l.content.kind === "agent" || l.content.kind === "terminal")
    .map((l) => l.content.sessionId)
    .filter((id): id is string => typeof id === "string");
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

/** Number of leaves in the subtree (used to weight an equal-area distribute). */
export function leafCount(node: CanvasNode): number {
  if (node.type === "leaf") return 1;
  return leafCount(node.a) + leafCount(node.b);
}

/**
 * Rebalance so **every leaf has equal area** (#186, the design-tool "distribute"):
 * each split's `sizes` are set proportional to the **leaf count** of each child
 * subtree (`[na/(na+nb), nb/(na+nb)] * 100`). By induction every leaf ends at
 * `1/total` regardless of how rows/cols nest — and a simple N-panel row collapses
 * to exactly equal shares (a 3-panel row → true thirds), unlike resetting each
 * split to `[50,50]` (which leaves a 3-panel row at 50/25/25). Recurses children
 * first; a subtree already even (same children identity **and** matching sizes)
 * keeps its object identity (mirrors `updateSizes`/`removeLeaf`), so an
 * already-even region doesn't needlessly re-render and the op is idempotent.
 */
export function equalize(node: CanvasNode): CanvasNode {
  if (node.type === "leaf") return node;
  const a = equalize(node.a);
  const b = equalize(node.b);
  const na = leafCount(a);
  const nb = leafCount(b);
  const total = na + nb || 1;
  const sizes: [number, number] = [(na / total) * 100, (nb / total) * 100];
  if (
    a === node.a &&
    b === node.b &&
    node.sizes[0] === sizes[0] &&
    node.sizes[1] === sizes[1]
  ) {
    return node;
  }
  return { ...node, a, b, sizes };
}

/**
 * Equalize **only** the subtree rooted at the split `splitId` (#186, the border
 * double-click evens out just the region that border divides) — every other split
 * keeps its sizes and identity. Returns the tree unchanged when `splitId` isn't
 * found or names a leaf.
 */
export function equalizeSplit(tree: CanvasNode, splitId: string): CanvasNode {
  if (tree.type === "leaf") return tree;
  if (tree.id === splitId) return equalize(tree);
  const a = equalizeSplit(tree.a, splitId);
  const b = equalizeSplit(tree.b, splitId);
  return a === tree.a && b === tree.b ? tree : { ...tree, a, b };
}

/**
 * Every split node as `{ id, aId, bId, sizes }`, top-down (#186). The
 * CanvasSurface reconcile effect walks this to push equalized sizes into each
 * live `Group` via its imperative handle (a size-only change `defaultLayout`
 * can't re-apply), keeping the relayout remount-free so pooled terminals survive.
 */
export function collectSplits(
  tree: CanvasNode | null,
): { id: string; aId: string; bId: string; sizes: [number, number] }[] {
  if (!tree || tree.type === "leaf") return [];
  return [
    { id: tree.id, aId: tree.a.id, bId: tree.b.id, sizes: tree.sizes },
    ...collectSplits(tree.a),
    ...collectSplits(tree.b),
  ];
}

/** A leaf id with its rectangle (percent of the canvas, 0–100). */
export interface LeafRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Compute every leaf's rectangle from the tree + split sizes (percent units),
 * starting from the full canvas. `dir: "row"` puts `a` left of `b`, `"col"` puts
 * `a` above `b`; `sizes` are the two shares. Pure — drives spatial keyboard nav
 * (#76).
 */
export function leafRects(
  tree: CanvasNode | null,
  rect: LeafRect = { id: "", x: 0, y: 0, w: 100, h: 100 },
): LeafRect[] {
  if (!tree) return [];
  if (tree.type === "leaf") return [{ ...rect, id: tree.id }];
  const total = tree.sizes[0] + tree.sizes[1] || 1;
  if (tree.dir === "row") {
    const wa = (rect.w * tree.sizes[0]) / total;
    return [
      ...leafRects(tree.a, { ...rect, w: wa }),
      ...leafRects(tree.b, { ...rect, x: rect.x + wa, w: rect.w - wa }),
    ];
  }
  const ha = (rect.h * tree.sizes[0]) / total;
  return [
    ...leafRects(tree.a, { ...rect, h: ha }),
    ...leafRects(tree.b, { ...rect, y: rect.y + ha, h: rect.h - ha }),
  ];
}

/**
 * The leaf spatially adjacent to `fromId` in `dir`, or null if none. Considers
 * only leaves across the relevant edge that overlap on the perpendicular axis,
 * then picks the nearest (perpendicular-center distance breaks ties). Pure (#76).
 */
export function spatialNeighbor(
  tree: CanvasNode | null,
  fromId: string,
  dir: "left" | "right" | "up" | "down",
): string | null {
  const rects = leafRects(tree);
  const from = rects.find((r) => r.id === fromId);
  if (!from) return null;
  const fromCx = from.x + from.w / 2;
  const fromCy = from.y + from.h / 2;
  const EPS = 0.5;
  let best: { id: string; primary: number; secondary: number } | null = null;
  for (const r of rects) {
    if (r.id === fromId) continue;
    let primary: number;
    let secondary: number;
    let overlaps: boolean;
    if (dir === "right") {
      if (r.x < from.x + from.w - EPS) continue;
      overlaps = r.y < from.y + from.h - EPS && r.y + r.h > from.y + EPS;
      primary = r.x - (from.x + from.w);
      secondary = Math.abs(r.y + r.h / 2 - fromCy);
    } else if (dir === "left") {
      if (r.x + r.w > from.x + EPS) continue;
      overlaps = r.y < from.y + from.h - EPS && r.y + r.h > from.y + EPS;
      primary = from.x - (r.x + r.w);
      secondary = Math.abs(r.y + r.h / 2 - fromCy);
    } else if (dir === "down") {
      if (r.y < from.y + from.h - EPS) continue;
      overlaps = r.x < from.x + from.w - EPS && r.x + r.w > from.x + EPS;
      primary = r.y - (from.y + from.h);
      secondary = Math.abs(r.x + r.w / 2 - fromCx);
    } else {
      if (r.y + r.h > from.y + EPS) continue;
      overlaps = r.x < from.x + from.w - EPS && r.x + r.w > from.x + EPS;
      primary = from.y - (r.y + r.h);
      secondary = Math.abs(r.x + r.w / 2 - fromCx);
    }
    if (!overlaps) continue;
    if (
      !best ||
      primary < best.primary - EPS ||
      (Math.abs(primary - best.primary) <= EPS && secondary < best.secondary)
    ) {
      best = { id: r.id, primary, secondary };
    }
  }
  return best?.id ?? null;
}
