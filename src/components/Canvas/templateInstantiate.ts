// Pure template→tab instantiation mapping (#118). Turning a saved Canvas template
// (a tree of inert blocks, #117) into a new Canvas tab whose leaves are **pending**
// panels bound to one chosen folder; an async executor (the store) then resolves
// each pending leaf into live content. Kept dependency-free + id-injected so it's
// deterministic and unit-testable, like `canvasTree.ts`.

import { splitPath } from "../../paths";
import type {
  CanvasContent,
  CanvasNode,
  CanvasTab,
  CanvasTemplate,
} from "../../types";
import { blockDescriptor } from "./templateBlocks";

/**
 * Where an `open-file`/`open-kanban` block's `file` resolves (#224), as a
 * `{ repoPath, file }` pair the backend's repo-confined read accepts:
 * - **relative** (default / absent `filePathMode`): `{ repoPath: cwd, file }` — the
 *   chosen folder as root; subfolders are allowed (the backend `repo.join` validates).
 * - **absolute**: split the full path into `{ dir, base }` and use the file's **own
 *   parent dir** as the root (`{ repoPath: dir, file: base }`) — the #163 pattern, so
 *   the containment check passes with no backend change. `splitPath` handles `/` and
 *   `\`, so it's cross-platform. Pure + dependency-light for unit testing.
 */
export function fileBlockTarget(
  block: CanvasContent,
  cwd: string,
): { repoPath: string; file: string } {
  const file = block.file ?? "";
  if (block.filePathMode === "absolute") {
    const { dir, base } = splitPath(file);
    return { repoPath: dir, file: base };
  }
  return { repoPath: cwd, file };
}

/** The pending content a block becomes on instantiation (#118): `kind:"pending"`
 * carrying the originating `block` + the chosen folder, awaiting async resolution. */
export function pendingContent(
  block: CanvasContent,
  cwd: string,
): CanvasContent {
  return { kind: "pending", repoPath: cwd, block: { ...block } };
}

/** Deep-map a template layout into a fresh tab layout: every leaf becomes a pending
 * panel for its block, bound to `cwd`; all ids are regenerated via `genId` so the
 * new tab never collides with the template (or another instantiation). */
function instantiateLayout(
  node: CanvasNode,
  cwd: string,
  genId: () => string,
): CanvasNode {
  if (node.type === "leaf") {
    return {
      type: "leaf",
      id: genId(),
      content: pendingContent(node.content, cwd),
    };
  }
  return {
    type: "split",
    id: genId(),
    dir: node.dir,
    a: instantiateLayout(node.a, cwd, genId),
    b: instantiateLayout(node.b, cwd, genId),
    sizes: node.sizes,
  };
}

/** Instantiate a template into a new `CanvasTab` (#118): same layout shape, leaves
 * pending against `cwd`, named after the template. An empty template → an empty tab. */
export function instantiateTemplate(
  template: CanvasTemplate,
  cwd: string,
  genId: () => string,
): CanvasTab {
  return {
    id: genId(),
    name: template.name,
    layout: template.layout
      ? instantiateLayout(template.layout, cwd, genId)
      : null,
  };
}

/** The live content a resolved block becomes (#118): an agent/terminal carry the
 * spawned `sessionId`; file/diff carry the folder (and the block's relative file).
 * Pure — the store supplies the async spawn result. */
export function resolvedContent(
  block: CanvasContent,
  cwd: string,
  resolved: { sessionId?: string },
): CanvasContent {
  const liveKind = blockDescriptor(block.kind)?.liveKind ?? block.kind;
  switch (liveKind) {
    case "agent":
      return { kind: "agent", sessionId: resolved.sessionId, repoPath: cwd };
    case "terminal":
      return { kind: "terminal", sessionId: resolved.sessionId, repoPath: cwd };
    case "file": {
      // Resolve relative-vs-absolute (#224): absolute opens via its own parent dir.
      const { repoPath, file } = fileBlockTarget(block, cwd);
      return { kind: "file", repoPath, file };
    }
    case "kanban": {
      // Mirror `file`: the live KanbanPanel/CanvasSurface need BOTH refs, so carry
      // the resolved path through (the default branch would drop `file`).
      const { repoPath, file } = fileBlockTarget(block, cwd);
      return { kind: "kanban", repoPath, file };
    }
    case "diff":
      return { kind: "diff", repoPath: cwd };
    default:
      return { kind: liveKind, repoPath: cwd };
  }
}
