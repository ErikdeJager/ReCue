// Window identity (task 434/437). Every ReCue window is a **full app window** —
// the complete shell (sidebar + Overview/Attention/Canvas + modals) — told who it
// is via URL params:
//
//  - the **main** window (no params, Tauri label `"main"`) — the config-created
//    full shell;
//  - an additional **app** window (task 434, `?win=<id>` → label `app-<id>`) —
//    the same complete shell with its own window-local view/selection/tab/filter
//    state, optionally preset via `&repo=` (Overview repo filter) / `&canvas=`
//    (boot into that Canvas tab).
//
// These are derived once at module load (the URL never changes within a window),
// so they're plain constants the rest of the app branches on. There is no
// terminal *ownership* any more (task 437 deleted the #84 single-owner layer): a
// PTY renders in ANY window that shows it — tasks 426/427 made every pooled
// terminal mirror-capable (per-window attached views, the backend arbitrates one
// smallest-wins grid, each window letterboxes). **Typing into one agent from two
// windows interleaves at the PTY like two tmux clients attached to one session —
// expected, not a bug.** `isPrimaryLabel` (task 433) matches the Rust-elected
// primary full window's label against WINDOW_LABEL to gate the
// exactly-once-per-app effects.

/** The two window kinds (task 434/437). */
export type WindowKind = "main" | "app";

/** Everything the URL says about a window's identity (task 434). */
export interface WindowIdentity {
  kind: WindowKind;
  /** The Tauri window label: `"main"` | `app-<id>` (| the legacy `canvas-<id>`,
   * see the compat branch in {@link parseWindowIdentity}). */
  label: string;
  /** The `?win=` id of a full app window, or null. */
  appWindowId: string | null;
  /** The `?repo=` init preset of a full app window (percent-decoded), or null —
   * the new window boots with its Overview filtered to this repo (task 434). */
  initRepoPath: string | null;
  /** The `?canvas=` init preset, or null — the window boots into Canvas on this
   * tab when it exists (task 434; also the 9/16 legacy `?canvas=` route). */
  initCanvasId: string | null;
}

/**
 * Parse a window's identity from its URL search string (task 434/437). Pure.
 *
 * `?win=<id>` wins over `?canvas=<id>`: with both present this is a full app
 * window and the canvas id becomes its soft `initCanvasId` preset. Empty param
 * values read as absent (`?win=` alone is the main window). `URLSearchParams`
 * percent-decodes values — including `%5C`/`%3A` in Windows `?repo=` paths.
 *
 * `?canvas=<id>` WITHOUT `?win=` is the legacy #84/9-16 detached-canvas route,
 * kept as one-release compat: nothing creates these windows anymore (task 437
 * deleted the canvas-window creator command); if one ever loads, it gets the
 * full shell booted into Canvas on that tab. The label keeps the window's REAL Tauri label
 * (`canvas-<id>`) so the task-426 per-label view purge and the task-427
 * `attach_terminal(id, WINDOW_LABEL, …)` stay per-window-correct. Delete next
 * release.
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
      initRepoPath: repo,
      initCanvasId: canvas,
    };
  }
  if (canvas) {
    // Legacy #84 detached route → a full app window on that canvas (see the doc
    // comment above). One-release compat; delete next release.
    return {
      kind: "app",
      label: `canvas-${canvas}`,
      appWindowId: null,
      initRepoPath: null,
      initCanvasId: canvas,
    };
  }
  return {
    kind: "main",
    label: "main",
    appWindowId: null,
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

/** This window's kind: `"main"` | `"app"` (task 434/437). */
export const WINDOW_KIND: WindowKind = IDENTITY.kind;

/** This window's Tauri label — `"main"` or `app-<id>` (or a legacy compat
 * `canvas-<id>`) — matched against the per-window terminal-view registry
 * (tasks 426/427) and the elected primary label (task 433). */
export const WINDOW_LABEL = IDENTITY.label;

/** The `?win=` id of this full app window (task 434), or null. */
export const APP_WINDOW_ID: string | null = IDENTITY.appWindowId;

/** The `?repo=` init preset (task 434): an app window opened for a repo boots
 * with its Overview filtered to it. Null everywhere else. */
export const INIT_REPO_PATH: string | null = IDENTITY.initRepoPath;

/** The `?canvas=` init preset (task 434/437): a window opened onto a canvas
 * boots into Canvas on that tab (when it exists). Null everywhere else. */
export const INIT_CANVAS_ID: string | null = IDENTITY.initCanvasId;

/** True when THIS window is the app's primary (task 433): the oldest surviving
 * full window, elected by Rust and broadcast as `window://primary` (null = no
 * full window survives). Exactly-once-per-APP effects gate on this — never on
 * the window kind, which every `app-<id>` window (task 434) shares. */
export function isPrimaryLabel(primary: string | null): boolean {
  return primary !== null && primary === WINDOW_LABEL;
}
