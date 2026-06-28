// Window identity (#84). ReCue can open a Canvas tab in its own native
// window for multi-monitor use. Every window loads the same bundle; a detached
// canvas window is told which canvas it is via a `?canvas=<id>` URL param, and
// its Tauri window label is `canvas-<id>` (the backend creates it with that
// label). The main window has no param and the label `"main"`.
//
// These are derived once at module load (the URL never changes within a window),
// so they're plain constants the rest of the app branches on. Terminal ownership
// (computeSessionOwners) compares a session's owner label against WINDOW_LABEL to
// decide whether THIS window renders that PTY.

/** The canvas id this window is detached for, or null in the main window. */
export const DETACHED_CANVAS_ID: string | null = (() => {
  try {
    return new URLSearchParams(window.location.search).get("canvas");
  } catch {
    return null;
  }
})();

/** True in the main (sidebar + Overview/Canvas) window; false in a detached one. */
export const IS_MAIN_WINDOW = DETACHED_CANVAS_ID === null;

/** This window's Tauri label — `"main"` or `canvas-<id>` — matched against the
 * session-ownership map so each window renders only the PTYs it owns (#84). */
export const WINDOW_LABEL = IS_MAIN_WINDOW
  ? "main"
  : `canvas-${DETACHED_CANVAS_ID}`;

/** Whether THIS window owns (should render) the session, given an owners map from
 * computeSessionOwners. An unmapped session defaults to the main window. */
export function ownedHere(
  owners: Record<string, string>,
  sessionId: string,
): boolean {
  return (owners[sessionId] ?? "main") === WINDOW_LABEL;
}

/** The canvas id behind an owner label (`canvas-<id>` → `<id>`), or null for the
 * main window — used to point "open in another window" affordances at the right
 * detached window. */
export function ownerCanvasId(ownerLabel: string | undefined): string | null {
  if (!ownerLabel || !ownerLabel.startsWith("canvas-")) return null;
  return ownerLabel.slice("canvas-".length);
}
