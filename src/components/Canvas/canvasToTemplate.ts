// Pure live-canvas → template mapping (#187), the inverse of #118's
// `templateInstantiate.ts`. Turns the active tab's live BSP layout (real agents,
// files, diffs, kanban boards, terminals) into a tree of inert template **blocks**
// (#117) so the Template Editor can open pre-populated. Kept dependency-free +
// deterministic (reuses each node's existing id; no `crypto.randomUUID`) so it's
// unit-testable, like `canvasTree.ts` / `templateInstantiate.ts`.

import type { CanvasContent, CanvasNode } from "../../types";
import { blockForLiveKind } from "./templateBlocks";

/**
 * Map a live canvas `layout` into a template block tree, preserving the split
 * structure (`dir` + `sizes`) and panel order.
 *
 * Each live leaf is reverse-looked-up by its `kind` (via `blockForLiveKind`):
 * - **No matching block** (`scheduled` / `pending` / `placeholder`) → the leaf is
 *   **dropped** and its split collapses to the sibling (like `removeLeaf`).
 * - `open-file` / `open-kanban` (config `"file"`) carry the **repo-relative `file`**
 *   only — `repoPath` is intentionally dropped (a template is folder-agnostic; the
 *   folder is chosen when the template is used, #118).
 * - `new-agent` carries the agent's **custom name** when `resolveAgentName` returns
 *   one (#136). The auto-title (#97) and the conversation/prompt are **not**
 *   recoverable from a live session, so `prompt` is left empty.
 *
 * Returns `null` for an empty layout or a canvas with **nothing** templatable.
 */
export function canvasToTemplate(
  layout: CanvasNode | null,
  resolveAgentName?: (sessionId?: string) => string | undefined,
): CanvasNode | null {
  if (!layout) return null;
  if (layout.type === "leaf") {
    const desc = blockForLiveKind(layout.content.kind);
    if (!desc) return null; // scheduled / pending / placeholder → drop
    const content: CanvasContent = { kind: desc.kind };
    // File-configured blocks carry the relative path; repoPath is dropped.
    if (desc.config === "file" && layout.content.file) {
      content.file = layout.content.file;
    }
    // Agent blocks carry a deliberate custom name only (not the auto-title).
    if (desc.liveKind === "agent") {
      const name = resolveAgentName?.(layout.content.sessionId);
      if (name) content.name = name;
    }
    return { type: "leaf", id: layout.id, content };
  }
  const a = canvasToTemplate(layout.a, resolveAgentName);
  const b = canvasToTemplate(layout.b, resolveAgentName);
  if (a === null && b === null) return null;
  if (a === null) return b; // collapse: only b survived
  if (b === null) return a; // collapse: only a survived
  return { ...layout, a, b }; // keep id, dir, sizes
}
