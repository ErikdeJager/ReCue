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
