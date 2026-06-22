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

/** The PTY session ids referenced by a layout's agent/terminal leaves (#84) —
 * the sessions whose terminal a window must render (and own) for that canvas. */
export function sessionIdsInLayout(tree: CanvasNode | null): string[] {
  return collectLeaves(tree)
    .filter((l) => l.content.kind === "agent" || l.content.kind === "terminal")
    .map((l) => l.content.sessionId)
    .filter((id): id is string => typeof id === "string");
}

/**
 * Which window owns each PTY session (#84). A `claude`/shell PTY is a full-screen
 * TUI sized for one width, so it must render in exactly **one** window (the #18
 * constraint). A **detached** canvas (one with an open window) claims the sessions
 * in its layout; the first detached canvas to reference a session wins (stable by
 * canvas order); every other session is owned by `"main"` (absent from the map).
 * Pure — every window computes the same map from the synced canvases + detached
 * set, so they agree on who renders what without extra coordination.
 */
export function computeSessionOwners(
  canvases: { id: string; layout: CanvasNode | null }[],
  detachedCanvasIds: Iterable<string>,
): Record<string, string> {
  const detached = new Set(detachedCanvasIds);
  const owners: Record<string, string> = {};
  for (const canvas of canvases) {
    if (!detached.has(canvas.id)) continue;
    for (const sessionId of sessionIdsInLayout(canvas.layout)) {
      if (!(sessionId in owners)) owners[sessionId] = `canvas-${canvas.id}`;
    }
  }
  return owners;
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
