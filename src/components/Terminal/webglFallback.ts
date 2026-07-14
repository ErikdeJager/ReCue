// WebGL context-loss fallback latch (#364).
//
// xterm's WebGL addon renders glyphs on the GPU. A WebGL context can be revoked at
// runtime (GPU OOM, driver reset, suspend/resume — likeliest on Linux/WebKitGTK). The
// addon handles a *recoverable* loss itself (it `preventDefault()`s `webglcontextlost`
// and waits ~3s for `webglcontextrestored`); it only fires `onContextLoss` when the
// context was NEVER restored, i.e. the renderer is dead. The documented recovery is to
// dispose the addon — xterm then swaps its render service back to the DOM renderer and
// re-lays-out the SAME buffer, so the pooled terminal (#18) is never remounted and no
// scrollback is replayed.
//
// This module holds the two bits of state that recovery needs, kept pure (no DOM, no
// xterm, no store) so it is unit-testable in the node vitest env — `terminalPool.ts` is
// DOM/xterm glue and is excluded from coverage:
//
//   1. A **latch**: once any terminal in this window has suffered an unrecovered loss,
//      no *newly created* terminal re-attaches the addon. A GPU that dropped one context
//      (memory pressure, a sick driver) will drop the next one too, so retrying would be
//      a context storm on an already-sick driver. Deliberately window-wide and one-way —
//      it re-arms only via `reset()` (an explicit user override, never an automatic retry).
//   2. A **record** of which renderer each pooled terminal is actually running on, so a
//      future diagnostics/override surface can read it without touching the DOM.

/** Which renderer a pooled xterm is running on (#364). */
export type TerminalRenderer = "webgl" | "dom";

export interface WebglFallback {
  /** May a NEWLY created terminal attach xterm's WebGL addon? */
  allowsWebgl(): boolean;
  /** Record the renderer a freshly-created host actually attached. */
  noteRenderer(sessionId: string, renderer: TerminalRenderer): void;
  /**
   * Record an UNRECOVERED WebGL context loss for `sessionId`. Latches this window to the
   * DOM renderer for the rest of its lifetime. Returns `true` only for the FIRST loss, so
   * the caller logs exactly once no matter how many terminals lose their context (a real
   * driver-level loss fires on every live context at once).
   */
  noteContextLoss(sessionId: string): boolean;
  /** The renderer in force for a session, or `undefined` if it has no pooled terminal. */
  rendererOf(sessionId: string): TerminalRenderer | undefined;
  /** True once any terminal in this window has lost its WebGL context. */
  hasLostContext(): boolean;
  /** Drop a disposed session's record. Does NOT clear the latch. */
  forget(sessionId: string): void;
  /** Re-arm WebGL. Tests only — and the seam for a future explicit user override. */
  reset(): void;
}

export function createWebglFallback(): WebglFallback {
  let lost = false;
  const renderers = new Map<string, TerminalRenderer>();

  return {
    allowsWebgl: () => !lost,

    noteRenderer: (sessionId, renderer) => {
      renderers.set(sessionId, renderer);
    },

    noteContextLoss: (sessionId) => {
      const first = !lost;
      lost = true;
      // The addon is being disposed, so this terminal is on the DOM renderer now —
      // even if it was recorded as "webgl" a moment ago.
      renderers.set(sessionId, "dom");
      return first;
    },

    rendererOf: (sessionId) => renderers.get(sessionId),

    hasLostContext: () => lost,

    // Only the map entry: a session Restart (#63) recreating its host must NOT re-attach
    // WebGL on a GPU we already know dropped a context.
    forget: (sessionId) => {
      renderers.delete(sessionId);
    },

    reset: () => {
      lost = false;
      renderers.clear();
    },
  };
}

/**
 * The pool's gate — one per document, so the main window and each detached canvas window
 * (#84) latch independently (they are separate webviews with separate GL contexts).
 */
export const webglFallback: WebglFallback = createWebglFallback();
