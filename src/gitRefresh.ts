/**
 * Pure helpers for the sidebar's coalesced git-refresh volley (#359).
 *
 * The sidebar's git-backed decorations (branch labels #212/#225, GitHub URLs #327,
 * per-agent line counts #335, ahead/behind #338, FileTree tints #252) used to be five
 * independent, unscoped, un-guarded refresh actions fired together — ~7–8 `git` process
 * spawns **per folder** on boot and on **every** busy→idle settle, racing the boot resume
 * of every persisted PTY. The store now routes all of them through one `refreshRepoGit`
 * action whose request shape, unioning, scoped-map merge, after-paint scheduling and
 * focus policy are the host-free functions below (mirroring `autoContinue.ts` /
 * `Canvas/canvasTree.ts`: the decisions are pure, the effects live in the store).
 *
 * Platform-neutral: no OS-specific API. `afterPaint` uses `requestAnimationFrame` with a
 * `setTimeout` fallback — deliberately **not** `requestIdleCallback`, whose WKWebView /
 * WebKitGTK support isn't worth relying on.
 */

/** The five git reads the sidebar drives, each a separate backend command. */
export type GitRefreshKind =
  | "branches"
  | "githubUrls"
  | "fileStatuses"
  | "diffLineCounts"
  | "aheadBehind";

/** Every kind — the default (full) volley. */
export const ALL_GIT_REFRESH_KINDS: readonly GitRefreshKind[] = [
  "branches",
  "githubUrls",
  "fileStatuses",
  "diffLineCounts",
  "aheadBehind",
];

/**
 * A normalized refresh request. `repos: null` means **every** sidebar folder (unscoped);
 * a non-empty array scopes the volley to exactly those folder paths (the key of every map
 * involved — repos *and* worktree folders).
 */
export interface GitRefreshRequest {
  repos: string[] | null;
  kinds: GitRefreshKind[];
}

/**
 * Normalize caller options into a request: missing/empty `kinds` ⇒ all kinds;
 * missing/empty `repos` ⇒ unscoped (`null`). Repos are deduped, preserving order.
 */
export function normalizeRequest(opts?: {
  repos?: readonly string[] | null;
  kinds?: readonly GitRefreshKind[];
}): GitRefreshRequest {
  const kinds =
    opts?.kinds && opts.kinds.length > 0
      ? dedupeKinds(opts.kinds)
      : [...ALL_GIT_REFRESH_KINDS];
  const repos =
    opts?.repos && opts.repos.length > 0 ? [...new Set(opts.repos)] : null;
  return { repos, kinds };
}

/** Kinds in the canonical `ALL_GIT_REFRESH_KINDS` order, deduped. */
function dedupeKinds(kinds: readonly GitRefreshKind[]): GitRefreshKind[] {
  const set = new Set(kinds);
  return ALL_GIT_REFRESH_KINDS.filter((k) => set.has(k));
}

/**
 * Union two requests (the trailing-rerun merge): kinds union, repos union — with `null`
 * (all folders) **absorbing** any scope, since an unscoped volley is a superset of any
 * scoped one. `mergeRequests(null, b)` is `b`.
 */
export function mergeRequests(
  a: GitRefreshRequest | null,
  b: GitRefreshRequest,
): GitRefreshRequest {
  if (!a) return { repos: b.repos ? [...b.repos] : null, kinds: [...b.kinds] };
  const kinds = dedupeKinds([...a.kinds, ...b.kinds]);
  // `null` = every folder, so it absorbs the other side's scope.
  const repos =
    a.repos === null || b.repos === null
      ? null
      : [...new Set([...a.repos, ...b.repos])];
  return { repos, kinds };
}

/**
 * Merge a **scoped** batch result into a full `path → T` map. For each folder in `scope`:
 * set it from `next`, or **delete** it when absent there — preserving the unscoped
 * full-replace semantics *within the scope*, so a folder that lost its upstream / remote
 * drops out of the map rather than showing a stale badge. Folders outside the scope are
 * untouched. Returns `prev` **by reference** when nothing changed, so the store's
 * selectors stay referentially stable (no needless sidebar re-render). Pure.
 */
export function mergeScoped<T>(
  prev: Record<string, T>,
  scope: readonly string[],
  next: Record<string, T>,
  equal: (a: T, b: T) => boolean = (a, b) => a === b,
): Record<string, T> {
  let changed = false;
  const merged = { ...prev };
  for (const path of scope) {
    const value = next[path];
    if (value === undefined) {
      if (path in merged) {
        delete merged[path];
        changed = true;
      }
      continue;
    }
    const before = merged[path];
    if (before === undefined || !equal(before, value)) {
      merged[path] = value;
      changed = true;
    }
  }
  return changed ? merged : prev;
}

/**
 * Run `cb` **after the current frame has painted** — a double `requestAnimationFrame`
 * (the first fires before the paint of the pending frame, the second after it), so the
 * deferred git volley never competes with the first render. Falls back to a `setTimeout`
 * where rAF is unavailable (non-browser test envs). Returns a cancel function, so an
 * effect can drop a pending callback on unmount / re-run.
 */
export function afterPaint(cb: () => void): () => void {
  if (typeof requestAnimationFrame !== "function") {
    const timer = setTimeout(cb, 0);
    return () => clearTimeout(timer);
  }
  let inner: number | undefined;
  let cancelled = false;
  const outer = requestAnimationFrame(() => {
    if (cancelled) return;
    inner = requestAnimationFrame(() => {
      if (!cancelled) cb();
    });
  });
  return () => {
    cancelled = true;
    cancelAnimationFrame(outer);
    if (inner !== undefined) cancelAnimationFrame(inner);
  };
}

/**
 * How often a **full, unscoped** volley may run off the focus / visibility backstop
 * (#359). Coming back to the window re-reads everything (so a folder edited in an
 * external editor updates its badges), but at most twice a minute.
 */
export const FOCUS_FULL_REFRESH_MIN_MS = 30_000;

/**
 * The kinds a focus/visibility (or poll) refresh should run: the **full** set when the
 * last full volley is older than `FOCUS_FULL_REFRESH_MIN_MS`, else just the cheap pair
 * (branch label + ahead/behind — 2 `git` spawns per folder, no untracked-file reads).
 * Pure, so the throttle policy is unit-tested. A `lastFullAt` of 0 (never) always yields
 * the full set.
 */
export function focusRefreshKinds(
  now: number,
  lastFullAt: number,
): GitRefreshKind[] {
  if (now - lastFullAt >= FOCUS_FULL_REFRESH_MIN_MS) {
    return [...ALL_GIT_REFRESH_KINDS];
  }
  return ["branches", "aheadBehind"];
}
