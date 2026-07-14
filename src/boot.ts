// Pure boot helpers (#352). Kept out of `store.ts` so the one non-trivial derivation
// in the boot payload — resolving the persisted Canvas tabs (incl. the one-shot #58
// legacy migration and the #84 detached-window override) — is unit-testable on its own.
// Imports only `./types`, so there is no cycle with the store.

import type { CanvasNode, CanvasTab, PersistedCanvases } from "./types";

/** The resolved Canvas tab state for this window at boot. */
export interface ResolvedCanvases {
  /** The tab list (always ≥ 1 — the always-one-canvas invariant, #58). */
  canvases: CanvasTab[];
  /** The tab this window shows. */
  activeCanvasId: string;
  /** True when the tabs were **synthesized** (from the legacy single `canvas_layout`,
   * or from nothing) rather than loaded — the caller persists the new shape once,
   * **main window only** (#84: a detached renderer never writes it). */
  migrated: boolean;
}

/**
 * Resolve the persisted Canvas tabs at boot (#58/#84/#352). Pure.
 *
 * - Persisted tabs (≥1) are used as-is; the active tab is `persisted.activeId` when it
 *   still exists, else the first tab (a stale id can't strand the window on a blank).
 * - Otherwise one tab is synthesized — carrying the legacy single `canvas_layout` (#46)
 *   when there is one — and `migrated` is set so the caller persists it once.
 * - A detached canvas window (#84) always shows **its own** canvas, whatever the
 *   persisted active tab says (that tracks the main window).
 */
export function resolveCanvases(
  persisted: PersistedCanvases | null,
  legacyLayout: CanvasNode | null,
  isMainWindow: boolean,
  detachedCanvasId: string | null,
  newId: () => string = () => crypto.randomUUID(),
): ResolvedCanvases {
  let canvases: CanvasTab[];
  let activeCanvasId: string;
  let migrated = false;

  if (persisted && persisted.canvases.length > 0) {
    canvases = persisted.canvases;
    activeCanvasId = canvases.some((c) => c.id === persisted.activeId)
      ? persisted.activeId
      : (canvases[0]?.id ?? "");
  } else {
    const first: CanvasTab = {
      id: newId(),
      name: "Canvas 1",
      layout: legacyLayout ?? null,
    };
    canvases = [first];
    activeCanvasId = first.id;
    migrated = true;
  }

  if (!isMainWindow && detachedCanvasId) {
    activeCanvasId = detachedCanvasId;
  }

  return { canvases, activeCanvasId, migrated };
}
