/** Wheel-event fields the Overview wall's horizontal-scroll hijack needs — a
 * structural subset of the DOM `WheelEvent` so the decision stays pure + testable. */
export interface WheelIntent {
  deltaX: number;
  deltaY: number;
  shiftKey: boolean;
}

/** Is this wheel gesture a horizontal-scroll intent?
 *
 * `claude`'s full-screen TUI enables mouse tracking, so xterm binds a `{passive:false}`
 * wheel listener that unconditionally `preventDefault`s + `stopPropagation`s EVERY wheel
 * event — a horizontal two-finger swipe (or shift+wheel) over an agent therefore never
 * reaches the wall's `overflow-x:auto` scroller. The wall reclaims those — and ONLY those —
 * from a capture-phase listener. A trackpad swipe is `|deltaX| > |deltaY|`; a shift+wheel
 * reports its magnitude on `deltaY` (browser-dependent), so any shifted vertical wheel is
 * horizontal too. Vertical intent is left untouched, so it still flows down to the agent. */
export function isHorizontalWheelIntent(e: WheelIntent): boolean {
  if (e.shiftKey && e.deltaY !== 0) return true;
  return Math.abs(e.deltaX) > Math.abs(e.deltaY);
}

/** Pixels to add to the wall's `scrollLeft` for a horizontal-intent wheel — the
 * horizontal delta, falling back to the vertical delta for a shift+wheel that reports
 * its magnitude on `deltaY`. */
export function horizontalWheelDelta(e: WheelIntent): number {
  return e.deltaX || e.deltaY;
}
