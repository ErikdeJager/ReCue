// Window identity (#84/task 434). ReCue windows come in three kinds, all loading
// the same bundle and told who they are via URL params:
//
//  - the **main** window (no params, Tauri label `"main"`) — the config-created
//    full shell;
//  - a **full app** window (task 434, `?win=<id>` → label `app-<id>`) — an
//    additional complete shell (sidebar + Overview/Attention/Canvas + modals)
//    with its own window-local view/selection/tab/filter state, optionally
//    preset via `&repo=` (Overview repo filter) / `&canvas=` (boot into that
//    Canvas tab);
//  - a **detached canvas** window (#84, `?canvas=<id>` without `?win=` → label
//    `canvas-<id>`) — the legacy single-canvas renderer, kept working this
//    release (card 11/16 deletes the route).
//
// These are derived once at module load (the URL never changes within a window),
// so they're plain constants the rest of the app branches on. Terminal ownership
// (computeSessionOwners) compares a session's owner label against WINDOW_LABEL to
// decide whether THIS window renders that PTY. `isPrimaryLabel` (task 433) is the
// live counterpart: it matches the Rust-elected primary full window's label against
// WINDOW_LABEL to gate the exactly-once-per-app effects.

/** The three window kinds (task 434). */
export type WindowKind = "main" | "app" | "canvas";

/** Everything the URL says about a window's identity (task 434). */
export interface WindowIdentity {
  kind: WindowKind;
  /** The Tauri window label: `"main"` | `app-<id>` | `canvas-<id>`. */
  label: string;
  /** The `?win=` id of a full app window, or null. */
  appWindowId: string | null;
  /** The `?canvas=` id of a detached canvas window (#84 — only WITHOUT `?win=`),
   * or null. */
  detachedCanvasId: string | null;
  /** The `?repo=` init preset of a full app window (percent-decoded), or null —
   * the new window boots with its Overview filtered to this repo (task 434). */
  initRepoPath: string | null;
  /** The `?canvas=` init preset of a full app window (i.e. WITH `?win=`), or
   * null — the new window boots into Canvas on this tab when it exists. */
  initCanvasId: string | null;
}

/**
 * Parse a window's identity from its URL search string (task 434). Pure.
 *
 * `?win=<id>` wins over `?canvas=<id>`: with both present this is a full app
 * window and the canvas id becomes its soft `initCanvasId` preset. Empty param
 * values read as absent (`?win=` alone is the main window). `URLSearchParams`
 * percent-decodes values — including `%5C`/`%3A` in Windows `?repo=` paths.
 */
export function parseWindowIdentity(search: string): WindowIdentity {
  const params = new URLSearchParams(search);
  // "" values read as absent — `?win=` without an id is not an app window.
  const win = params.get("win") || null;
  const canvas = params.get("canvas") || null;
  const repo = params.get("repo") || null;

  if (win) {
    return {
      kind: "app",
      label: `app-${win}`,
      appWindowId: win,
      detachedCanvasId: null,
      initRepoPath: repo,
      initCanvasId: canvas,
    };
  }
  if (canvas) {
    return {
      kind: "canvas",
      label: `canvas-${canvas}`,
      appWindowId: null,
      detachedCanvasId: canvas,
      initRepoPath: null,
      initCanvasId: null,
    };
  }
  return {
    kind: "main",
    label: "main",
    appWindowId: null,
    detachedCanvasId: null,
    initRepoPath: null,
    initCanvasId: null,
  };
}

/** This window's identity, derived once at module load. The try/catch keeps the
 * Node/vitest environment (no `window`) on the main-window identity. */
const IDENTITY: WindowIdentity = (() => {
  try {
    return parseWindowIdentity(window.location.search);
  } catch {
    return parseWindowIdentity("");
  }
})();

/** This window's kind: `"main"` | `"app"` (task 434) | `"canvas"` (#84). */
export const WINDOW_KIND: WindowKind = IDENTITY.kind;

/** This window's Tauri label — `"main"`, `app-<id>` or `canvas-<id>` — matched
 * against the session-ownership map so each window renders only the PTYs it owns
 * (#84), and against the elected primary label (task 433). */
export const WINDOW_LABEL = IDENTITY.label;

/** The `?win=` id of this full app window (task 434), or null. */
export const APP_WINDOW_ID: string | null = IDENTITY.appWindowId;

/** The canvas id this window is detached for (#84), or null in a full window. */
export const DETACHED_CANVAS_ID: string | null = IDENTITY.detachedCanvasId;

/** The `?repo=` init preset (task 434): an app window opened for a repo boots
 * with its Overview filtered to it. Null everywhere else. */
export const INIT_REPO_PATH: string | null = IDENTITY.initRepoPath;

/** The `?canvas=` init preset (task 434): an app window opened onto a canvas
 * boots into Canvas on that tab (when it exists). Null everywhere else. */
export const INIT_CANVAS_ID: string | null = IDENTITY.initCanvasId;

/** True in a detached CANVAS window (#84). Distinct from "not the main window"
 * on purpose (task 427): the #105 DOM-renderer fallback is a canvas-window glyph
 * artifact, so WebGL gating keys on THIS — a full app window (task 434) is not a
 * canvas window and gets WebGL. */
export const IS_DETACHED_CANVAS_WINDOW = WINDOW_KIND === "canvas";

/** True in any FULL app window — the main window or an `app-<id>` window (task
 * 434), i.e. the complete shell with sidebar + views + modals. The exact
 * complement of `IS_DETACHED_CANVAS_WINDOW`. */
export const IS_FULL_APP_WINDOW = !IS_DETACHED_CANVAS_WINDOW;

/** Whether THIS window renders the session, given an owners map from
 * computeSessionOwners. The default owner "main" means "the full app-window
 * set": since tasks 426/427 every pooled terminal is mirror-capable (per-window
 * attached views, the backend's smallest-wins grid), so main and every
 * `app-<id>` window (task 434) render it simultaneously. A `canvas-<id>` owner
 * stays exclusive to that detached window (#84); card 11/16 deletes this layer
 * entirely. */
export function ownedHere(
  owners: Record<string, string>,
  sessionId: string,
): boolean {
  const owner = owners[sessionId] ?? "main";
  if (owner === "main") return IS_FULL_APP_WINDOW;
  return owner === WINDOW_LABEL;
}

/** The canvas id behind an owner label (`canvas-<id>` → `<id>`), or null for the
 * main window — used to point "open in another window" affordances at the right
 * detached window. */
export function ownerCanvasId(ownerLabel: string | undefined): string | null {
  if (!ownerLabel || !ownerLabel.startsWith("canvas-")) return null;
  return ownerLabel.slice("canvas-".length);
}

/** True when THIS window is the app's primary (task 433): the oldest surviving
 * full window, elected by Rust and broadcast as `window://primary` (null = no
 * full window survives, e.g. only detached canvases remain). Exactly-once-per-APP
 * effects gate on this — never on IS_FULL_APP_WINDOW, which every `app-<id>`
 * window (task 434) also passes. */
export function isPrimaryLabel(primary: string | null): boolean {
  return primary !== null && primary === WINDOW_LABEL;
}
