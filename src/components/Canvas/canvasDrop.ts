// Canvas drop + content placement (#47). Maps dnd-kit drag payloads (sidebar
// sessions / opened files, or pre-made content) to Canvas content descriptors,
// and applies them to the persisted layout via the store. Kept out of components
// so both the app-level DndContext (drops) and the repo menu (append) share it.

import { useStore } from "../../store";
import type {
  CanvasContent,
  CanvasEdge,
  CanvasNode,
  OverviewPanel,
} from "../../types";
import { collectLeaves, splitLeaf } from "./canvasTree";

/**
 * Whether two content descriptors refer to the **same live item** (#157, big mode) —
 * agent/terminal by `sessionId`, file/kanban by `repoPath`+`file`, diff by
 * `repoPath`, scheduled by `scheduleId`. Mirrors `isDuplicate`'s identity logic but
 * compares two contents (not a content against a tree). Pure + unit-tested.
 */
export function sameItem(a: CanvasContent, b: CanvasContent): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "agent":
    case "terminal":
      return !!a.sessionId && a.sessionId === b.sessionId;
    case "file":
    case "kanban":
      return a.repoPath === b.repoPath && a.file === b.file;
    case "diff":
    case "filetree":
      return a.repoPath === b.repoPath;
    case "scheduled":
      return !!a.scheduleId && a.scheduleId === b.scheduleId;
    case "recurring":
      return !!a.recurringId && a.recurringId === b.recurringId;
    default:
      return false;
  }
}

/** Map an Overview panel (#38) to the live `CanvasContent` it renders, so big mode
 * (#157) can match/maximize an Overview column the same way it does a Canvas leaf.
 * Mirrors the Overview body render: markdown→file, terminal→a PTY by panel id. */
export function overviewPanelToContent(
  panel: OverviewPanel,
  repoPath: string,
): CanvasContent {
  switch (panel.kind) {
    case "diff":
      return { kind: "diff", repoPath };
    case "filetree":
      return { kind: "filetree", repoPath };
    case "terminal":
      return { kind: "terminal", sessionId: panel.id, repoPath };
    case "kanban":
      return { kind: "kanban", repoPath, file: panel.file };
    default: // "markdown"
      return { kind: "file", repoPath, file: panel.file };
  }
}

/**
 * Whether a maximized item (#157) still exists somewhere — used to auto-close big
 * mode when the underlying item is removed/exits. An agent must still be in
 * `sessions`, a schedule in `schedules`; a file/diff/kanban/terminal must still be
 * referenced by an Overview panel or a Canvas leaf. Pure + unit-tested.
 */
export function itemStillPresent(
  content: CanvasContent,
  state: {
    sessions: { id: string }[];
    overviewPanels: Record<string, OverviewPanel[]>;
    schedules: { id: string }[];
    recurrings: { id: string }[];
    canvases: { layout: CanvasNode | null }[];
  },
): boolean {
  if (content.kind === "agent") {
    return state.sessions.some((s) => s.id === content.sessionId);
  }
  if (content.kind === "scheduled") {
    return state.schedules.some((s) => s.id === content.scheduleId);
  }
  if (content.kind === "recurring") {
    return state.recurrings.some((r) => r.id === content.recurringId);
  }
  const inOverview = Object.entries(state.overviewPanels).some(
    ([repo, panels]) =>
      panels.some((p) => sameItem(overviewPanelToContent(p, repo), content)),
  );
  if (inOverview) return true;
  return state.canvases.some((c) =>
    collectLeaves(c.layout).some((l) => sameItem(l.content, content)),
  );
}

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
  if (data.kind === "filetree") {
    return { kind: "filetree", repoPath };
  }
  if (data.kind === "terminal" && typeof data.sessionId === "string") {
    return { kind: "terminal", sessionId: data.sessionId, repoPath };
  }
  if (data.kind === "scheduled" && typeof data.scheduleId === "string") {
    return { kind: "scheduled", scheduleId: data.scheduleId, repoPath };
  }
  if (data.kind === "recurring" && typeof data.recurringId === "string") {
    return { kind: "recurring", recurringId: data.recurringId, repoPath };
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
  if (content.kind === "filetree") {
    return leaves.some(
      (l) =>
        l.content.kind === "filetree" &&
        l.content.repoPath === content.repoPath,
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
  if (content.kind === "recurring") {
    return leaves.some(
      (l) =>
        l.content.kind === "recurring" &&
        l.content.recurringId === content.recurringId,
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
 * End an existing-panel lift drag (#155): commit the lifted panel to the drop
 * target or restore it. `overId` is the dnd-kit `over.id` (or null when released on
 * nothing). A `panel:<target>:<edge>` zone (target ≠ the lifted leaf) or the
 * empty-canvas `canvas-center` commits; anything else (no target / a self zone)
 * cancels, snapping the panel back. Shared by the main window and a detached canvas
 * window's `DndContext` (#84); the commit/cancel store actions target the active
 * tab, which a detached window forces to its own id. The lifted leaf id is read
 * from the store's transient lift state, set at drag start.
 */
export function applyCanvasLiftEnd(overId: string | null): void {
  const store = useStore.getState();
  const liftedId = store.liftedLeaf?.leafId;
  if (overId === "canvas-center") {
    store.commitCanvasLift("canvas-center", "left"); // edge unused for center
    return;
  }
  const match = overId
    ? /^panel:(.+):(left|right|top|bottom)$/.exec(overId)
    : null;
  if (match && match[1] !== liftedId) {
    store.commitCanvasLift(match[1] as string, match[2] as CanvasEdge);
    return;
  }
  // No valid target (or the panel's own zone) → restore to the previous position.
  store.cancelCanvasLift();
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
