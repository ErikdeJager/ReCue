// Canvas drop + content placement (#47). Maps dnd-kit drag payloads (sidebar
// sessions / opened files, or pre-made content) to Canvas content descriptors,
// and applies them to the persisted layout via the store. Kept out of components
// so both the app-level DndContext (drops) and the repo menu (append) share it.

import { useStore } from "../../store";
import type { CanvasContent, CanvasEdge, CanvasNode } from "../../types";
import { collectLeaves, splitLeaf } from "./canvasTree";

/** The active Canvas tab's layout tree (#58), or null. */
function activeLayout(
  store: ReturnType<typeof useStore.getState>,
): CanvasNode | null {
  return (
    store.canvases.find((c) => c.id === store.activeCanvasId)?.layout ?? null
  );
}

/** Translate a dnd-kit drag payload into a Canvas content descriptor, or null. */
export function payloadToContent(
  data: Record<string, unknown> | undefined,
): CanvasContent | null {
  if (!data) return null;
  // Pre-made content (e.g. a future palette) passes a `content` descriptor.
  if (data.content && typeof data.content === "object") {
    return data.content as CanvasContent;
  }
  const repoPath = typeof data.repoPath === "string" ? data.repoPath : "";
  if (data.kind === "session" && typeof data.sessionId === "string") {
    return { kind: "agent", sessionId: data.sessionId, repoPath };
  }
  if (data.kind === "file" && typeof data.file === "string") {
    return { kind: "file", repoPath, file: data.file };
  }
  if (data.kind === "kanban" && typeof data.file === "string") {
    return { kind: "kanban", repoPath, file: data.file };
  }
  if (data.kind === "diff") {
    return { kind: "diff", repoPath };
  }
  if (data.kind === "terminal" && typeof data.sessionId === "string") {
    return { kind: "terminal", sessionId: data.sessionId, repoPath };
  }
  if (data.kind === "scheduled" && typeof data.scheduleId === "string") {
    return { kind: "scheduled", scheduleId: data.scheduleId, repoPath };
  }
  return null;
}

/** An agent already lives in the canvas — the #18 pool gives it one terminal slot. */
function isDuplicate(tree: CanvasNode | null, content: CanvasContent): boolean {
  const leaves = collectLeaves(tree);
  if (content.kind === "agent") {
    return leaves.some(
      (l) =>
        l.content.kind === "agent" && l.content.sessionId === content.sessionId,
    );
  }
  if (content.kind === "diff") {
    return leaves.some(
      (l) =>
        l.content.kind === "diff" && l.content.repoPath === content.repoPath,
    );
  }
  if (content.kind === "terminal") {
    return leaves.some(
      (l) =>
        l.content.kind === "terminal" &&
        l.content.sessionId === content.sessionId,
    );
  }
  if (content.kind === "scheduled") {
    return leaves.some(
      (l) =>
        l.content.kind === "scheduled" &&
        l.content.scheduleId === content.scheduleId,
    );
  }
  if (content.kind === "kanban") {
    return leaves.some(
      (l) =>
        l.content.kind === "kanban" &&
        l.content.repoPath === content.repoPath &&
        l.content.file === content.file,
    );
  }
  return false;
}

const leaf = (content: CanvasContent): CanvasNode => ({
  type: "leaf",
  id: crypto.randomUUID(),
  content,
});

/**
 * Apply a panel-reorder drop (#135): a grip-drag (`move-leaf`) landing on a panel
 * edge zone moves the existing `sourceLeafId` there. Parses `over.id` as
 * `panel:<target>:<edge>`, ignoring `canvas-center` and a self-target. Shared by the
 * main window and a detached canvas window's `DndContext` (#84). `moveCanvasLeaf`
 * targets the active tab, which a detached window forces to its own id.
 */
export function applyCanvasMove(sourceLeafId: string, overId: string): void {
  const match = /^panel:(.+):(left|right|top|bottom)$/.exec(overId);
  if (!match) return;
  const targetId = match[1] as string;
  if (targetId === sourceLeafId) return;
  useStore
    .getState()
    .moveCanvasLeaf(sourceLeafId, targetId, match[2] as CanvasEdge);
}

/** Apply a drop onto a Canvas zone — the center (first panel) or a panel edge. */
export function applyCanvasDrop(overId: string, content: CanvasContent): void {
  const store = useStore.getState();
  const tree = activeLayout(store);
  if (isDuplicate(tree, content)) return;
  if (overId === "canvas-center") {
    store.setActiveCanvasLayout(leaf(content));
    return;
  }
  const match = /^panel:(.+):(left|right|top|bottom)$/.exec(overId);
  if (match && tree) {
    store.setActiveCanvasLayout(
      splitLeaf(
        tree,
        match[1] as string,
        match[2] as CanvasEdge,
        content,
        crypto.randomUUID(),
        crypto.randomUUID(),
      ),
    );
  }
}
