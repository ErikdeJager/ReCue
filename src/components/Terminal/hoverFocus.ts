/** Should a hover over a terminal panel steal keyboard focus (#368)?
 * `enabled` is the opt-in setting. We must NOT yank focus out of a real text field
 * the user is typing in (a rename <input>, the FileViewer/Kanban <textarea>, a modal
 * input) — but moving BETWEEN terminals is fine, and xterm's focused element is its
 * own helper <textarea> that lives inside `.xterm`, so treat that as OK to leave. */
export function shouldHoverFocus(
  enabled: boolean,
  activeElement: Element | null,
): boolean {
  if (!enabled) return false;
  if (!activeElement) return true;
  if (activeElement.closest(".xterm")) return true;
  const el = activeElement as HTMLElement;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
  if (el.isContentEditable) return false;
  return true;
}

/** Should a hover over a panel move the selection border / focus (#371)?
 * Extends shouldHoverFocus (#368) with a buttons guard so a dnd-kit drag or any
 * held pointer button never sprays hover-selects across panels. */
export function shouldHoverSelect(
  enabled: boolean,
  buttons: number,
  activeElement: Element | null,
): boolean {
  return buttons === 0 && shouldHoverFocus(enabled, activeElement);
}

/** The focused element iff it belongs to a pooled xterm (its helper <textarea>
 * lives inside `.xterm`) — the thing blurTerminals() must blur; null otherwise. */
export function focusedTerminalElement(
  activeElement: Element | null,
): HTMLElement | null {
  if (!activeElement || !activeElement.closest(".xterm")) return null;
  return activeElement as HTMLElement;
}
