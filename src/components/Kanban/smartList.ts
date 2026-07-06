/** Smart-list continuation for the Kanban card composer/edit textareas (#341).
 *
 * Pure, DOM-free, dependency-free: given a controlled textarea's value and its
 * selection (0-based caret offsets into an LF-only string), decide what a Shift+Enter
 * over a `-` bullet line should do — continue the list with a fresh `- ` prefix, or, on
 * an *empty* bullet, terminate the list by removing that blank bullet. Any non-bullet
 * line returns `null`, meaning "not special — let the native newline happen".
 *
 * Only the `-` marker is handled (incl. `- [ ] `/`- [x] ` task-list items); `*`/`+` and
 * ordered lists are deliberately out of scope. Leading indentation is preserved. This is
 * platform-neutral WebView string logic (identical on macOS and Windows).
 */
export function applySmartNewline(
  value: string,
  selStart: number,
  selEnd: number,
): { value: string; caret: number } | null {
  const start = Math.min(selStart, selEnd);
  const end = Math.max(selStart, selEnd);

  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = value.indexOf("\n", start);
  if (lineEnd === -1) lineEnd = value.length;
  const lineText = value.slice(lineStart, lineEnd);

  const m = /^([ \t]*)- (\[[ xX]\] )?/.exec(lineText);
  if (!m) return null;

  const task = m[2];
  const indent = m[1] ?? "";
  const markerPrefix = m[0];
  const content = lineText.slice(markerPrefix.length);

  // Empty bullet → terminate the list: drop the blank bullet line, caret on the
  // now-blank line. No extra bullet inserted.
  if (content.trim() === "") {
    return {
      value: value.slice(0, lineStart) + value.slice(lineEnd),
      caret: lineStart,
    };
  }

  // Non-empty bullet → continue: a fresh `- ` (a checked task continues unchecked).
  const newPrefix = "\n" + indent + "- " + (task ? "[ ] " : "");
  const nextValue = value.slice(0, start) + newPrefix + value.slice(end);
  return { value: nextValue, caret: start + newPrefix.length };
}
