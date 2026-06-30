// Scheduled-leaf rewriting (#280). When a pending schedule fires into a live agent,
// every Canvas leaf that was showing its `ScheduledPanel` must flip to the live agent
// content — otherwise the panel keeps rendering the (now-removed) schedule and shows
// "This schedule is no longer pending." Kept pure (no store/IPC) so it's deterministic
// and unit-testable, mirroring `moveLeaf`/`pruneCanvasLeaves`. Cross-platform by
// construction — no path/shell/OS code.

import type { CanvasContent, CanvasNode, CanvasTab } from "../../types";

/**
 * Replace `content` for every leaf in `node` whose content is the pending schedule
 * `scheduleId` (`{ kind: "scheduled", scheduleId }`) — **preserving the leaf id** so
 * the #18 pooled terminal reparents into the same slot rather than being disposed and
 * recreated. Unchanged subtrees keep their object identity (only the affected branch
 * re-renders), and an unmatched tree returns the same reference.
 */
function rewriteNode(
  node: CanvasNode,
  scheduleId: string,
  content: CanvasContent,
): CanvasNode {
  if (node.type === "leaf") {
    return node.content.kind === "scheduled" &&
      node.content.scheduleId === scheduleId
      ? { ...node, content }
      : node;
  }
  const a = rewriteNode(node.a, scheduleId, content);
  const b = rewriteNode(node.b, scheduleId, content);
  return a === node.a && b === node.b ? node : { ...node, a, b };
}

/**
 * Rewrite the scheduled leaf `scheduleId` into `newContent` (the live agent, e.g.
 * `{ kind: "agent", sessionId }`) across **all** Canvas tabs (#280). Used on a
 * schedule's fire so the panel that showed the pending schedule becomes the live
 * agent terminal in place — in the main window and any detached canvas (#84) holding
 * it, since the result is persisted + broadcast (`setCanvases` → `canvas://changed`).
 * Returns the **same array reference** when nothing matched, so the caller can skip a
 * redundant persist/broadcast.
 */
export function rewriteScheduledLeaves(
  canvases: CanvasTab[],
  scheduleId: string,
  newContent: CanvasContent,
): CanvasTab[] {
  let changed = false;
  const next = canvases.map((tab) => {
    if (!tab.layout) return tab;
    const layout = rewriteNode(tab.layout, scheduleId, newContent);
    if (layout === tab.layout) return tab;
    changed = true;
    return { ...tab, layout };
  });
  return changed ? next : canvases;
}
