/**
 * Pure helpers for **detected git worktrees** — the agent-created-worktree
 * feature's decision core (the `gitRefresh.ts` pattern: host-free functions the
 * store calls, so classification / dedupe / relocation / lifecycle logic is
 * unit-tested without a backend).
 *
 * The backend's `list_repo_worktrees` reports every checkout of each registered
 * repo (`git worktree list --porcelain`, stamped `is_main` / `managed` /
 * `exists`). These helpers turn that raw listing into what the UI shows:
 * - `detectedWorktreesFor` — the repo's DETECTED worktree sub-groups (drop the
 *   main checkout, host-missing container paths, prunable leftovers, the
 *   registered folder itself, and anything a session record already renders —
 *   records stay authoritative, detection only adds).
 * - `worktreeSourceOf` — `record` / `orphan` (ReCue-managed, no records: the
 *   dirty-kept leftover) / `external` (agent / hook / manual — never deletable).
 * - `sessionActiveWorktree` — the relocation signal: which detected worktree a
 *   session is currently working in (claude's `currentCwd`, else the non-claude
 *   heuristic), re-parenting its sidebar row.
 * - `attributeNewWorktrees` / `vanishedWorktrees` / `worktreeScopeRepos` — the
 *   refresh lifecycle (best-effort attribution, auto-close on removal, scope
 *   mapping for the busy→idle volley).
 *
 * Platform-neutral by parameterization: path identity goes through
 * `normPathKey(path, platform)` — `\` → `/`, trailing separators trimmed, and
 * case-folded on Windows only (its filesystems are case-insensitive) — mirroring
 * the backend's `norm_path_key`.
 */

import type { RepoWorktree } from "./types";
import { isWindows } from "./platform";

/** Normalize a path into a comparison key (see module doc). Lexical only — the
 * backend canonicalizes where symlink identity matters; frontend paths all come
 * from the same backend reads, so lexical identity is sufficient here. */
export function normPathKey(path: string, platform: string): string {
  let s = path.replace(/\\/g, "/");
  while (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return isWindows(platform) ? s.toLowerCase() : s;
}

/** Path equality under `normPathKey`. */
export function samePath(a: string, b: string, platform: string): boolean {
  return normPathKey(a, platform) === normPathKey(b, platform);
}

/** Whether `child` is `parent` or lives under it (component-boundary-safe:
 * `/a/wt-evil` never matches a parent of `/a/wt`). */
export function pathWithin(
  child: string,
  parent: string,
  platform: string,
): boolean {
  const c = normPathKey(child, platform);
  const p = normPathKey(parent, platform);
  return c === p || c.startsWith(`${p}/`);
}

/** Who a detected worktree belongs to — drives the header badge + menu matrix. */
export type WorktreeSource = "record" | "orphan" | "external";

/** One worktree the sidebar shows from detection (not from session records). */
export interface DetectedWorktree {
  /** Absolute checkout path. */
  path: string;
  /** Short branch name; null = detached HEAD. */
  branch: string | null;
  head: string;
  /** ReCue-managed (`<data-dir>/worktrees`) but record-less — the `kept` orphan. */
  managed: boolean;
  /** Claude Code locks a worktree while an agent actively works there. */
  locked: boolean;
  lockedReason: string | null;
}

/**
 * The DETECTED worktree sub-groups for `repo` out of its raw listing. Drops:
 * the main checkout (`is_main`), the registered folder itself (a registered
 * folder may BE a linked worktree — never index-based), paths missing on this
 * host (container-created `/work/…`), `prunable` leftovers, and any path a
 * session/schedule/recurring record already renders (`recordPaths` — the
 * load-bearing dedupe: records stay authoritative, detection only adds rows).
 * Order is the listing order (stable across polls).
 */
export function detectedWorktreesFor(
  repo: string,
  entries: readonly RepoWorktree[] | undefined,
  recordPaths: readonly string[],
  platform: string,
): DetectedWorktree[] {
  if (!entries) return [];
  const recorded = new Set(recordPaths.map((p) => normPathKey(p, platform)));
  return entries
    .filter(
      (e) =>
        !e.is_main &&
        e.exists &&
        !e.prunable &&
        !samePath(e.path, repo, platform) &&
        !recorded.has(normPathKey(e.path, platform)),
    )
    .map((e) => ({
      path: e.path,
      branch: e.branch,
      head: e.head,
      managed: e.managed,
      locked: e.locked,
      lockedReason: e.locked_reason,
    }));
}

/** The ownership class of a worktree sub-group: a record-backed path is
 * `record` (existing #74 flow, unchanged); a detected one is `orphan` when
 * ReCue-managed (the dirty-kept leftover — confirm-gated force-remove is
 * legitimate) else `external` (agent / hook / manual — ReCue NEVER deletes it). */
export function worktreeSourceOf(
  detected: DetectedWorktree | undefined,
  isRecordBacked: boolean,
): WorktreeSource {
  if (isRecordBacked || !detected) return "record";
  return detected.managed ? "orphan" : "external";
}

/** Map every detected (non-main, existing) worktree path → its parent repo,
 * across the whole detection slice — the Overview/Canvas cluster-attribution
 * input, so panels opened inside a detected worktree group under the parent
 * repo's cluster instead of forming a stray top-level one. Keys are the RAW
 * paths (exact-match, like the session-derived `wtParent` map it merges into —
 * panel keys and detection paths both come from the same backend reads). */
export function detectedWorktreeParents(
  repoWorktrees: Readonly<Record<string, RepoWorktree[]>>,
  platform: string,
): Record<string, string> {
  const parents: Record<string, string> = {};
  for (const [repo, entries] of Object.entries(repoWorktrees)) {
    for (const e of entries) {
      if (e.is_main || !e.exists || samePath(e.path, repo, platform)) continue;
      parents[e.path] = repo;
    }
  }
  return parents;
}

/**
 * The relocation signal: the detected worktree (of the session's own repo) this
 * session is CURRENTLY working in, or null when it's at home.
 *
 * - A record worktree agent (`worktreeParent` set) returns null — its grouping
 *   is record-driven (#74) and must not double-place.
 * - Claude sessions carry `currentCwd` from their own log (`session://cwd`);
 *   when it lands inside a detected worktree path, that path wins. `pathWithin`
 *   (not equality) so a `/cd` into a worktree SUBdirectory still counts.
 * - Non-claude agents fall back to the best-effort heuristic map (see
 *   `attributeNewWorktrees`).
 *
 * Self-healing: when the worktree vanishes, it leaves `detectedPaths`, so the
 * row returns to the repo level with no extra bookkeeping.
 */
export function sessionActiveWorktree(
  session: {
    id: string;
    repoPath: string;
    worktreeParent?: string | null;
    currentCwd?: string | null;
  },
  detectedPaths: readonly string[],
  heuristic: Readonly<Record<string, string>>,
  platform: string,
): string | null {
  if (session.worktreeParent) return null;
  const cwd = session.currentCwd;
  if (cwd && !samePath(cwd, session.repoPath, platform)) {
    const hit = detectedPaths.find((p) => pathWithin(cwd, p, platform));
    if (hit) return hit;
  }
  const guessed = heuristic[session.id];
  if (guessed && detectedPaths.some((p) => samePath(p, guessed, platform))) {
    return guessed;
  }
  return null;
}

/**
 * Best-effort attribution for agents with no claude log (codex/opencode — no
 * `currentCwd` signal): when a NEW external worktree appears in a repo while
 * EXACTLY ONE eligible session of that repo is busy, guess that session created
 * it. Returns the merged heuristic map (prior entries kept). Claude sessions
 * are excluded by the caller via `eligible` (their real signal supersedes —
 * never double-attribute) and a session already carrying a guess isn't
 * re-attributed.
 */
export function attributeNewWorktrees(
  prev: Readonly<Record<string, RepoWorktree[]>>,
  next: Readonly<Record<string, RepoWorktree[]>>,
  sessions: readonly {
    id: string;
    repoPath: string;
    worktreeParent?: string | null;
  }[],
  busy: Readonly<Record<string, boolean>>,
  eligible: (sessionId: string) => boolean,
  heuristic: Readonly<Record<string, string>>,
  platform: string,
): Record<string, string> {
  const out: Record<string, string> = { ...heuristic };
  for (const [repo, entries] of Object.entries(next)) {
    const before = new Set(
      (prev[repo] ?? []).map((e) => normPathKey(e.path, platform)),
    );
    const fresh = entries.filter(
      (e) =>
        !e.is_main &&
        e.exists &&
        !e.managed &&
        !before.has(normPathKey(e.path, platform)),
    );
    if (fresh.length === 0) continue;
    const candidates = sessions.filter(
      (s) =>
        samePath(s.repoPath, repo, platform) &&
        !s.worktreeParent &&
        busy[s.id] === true &&
        eligible(s.id) &&
        !out[s.id],
    );
    const soleCandidate = candidates.length === 1 ? candidates[0] : undefined;
    const soleFresh = fresh.length === 1 ? fresh[0] : undefined;
    if (soleCandidate && soleFresh) {
      out[soleCandidate.id] = soleFresh.path;
    }
  }
  return out;
}

/** The worktrees present in `prev` but gone from a repo's AUTHORITATIVE new
 * listing (the repo's key must be present in `next` — an omitted key means the
 * read failed and prior state is kept, so nothing "vanished"). Drives the
 * auto-close + toast lifecycle. */
export function vanishedWorktrees(
  prev: Readonly<Record<string, RepoWorktree[]>>,
  next: Readonly<Record<string, RepoWorktree[]>>,
  scope: readonly string[],
  platform: string,
): { repo: string; path: string; branch: string | null }[] {
  const gone: { repo: string; path: string; branch: string | null }[] = [];
  for (const repo of scope) {
    const after = next[repo];
    if (!after) continue; // failed read — fail-open, keep prior state
    const still = new Set(after.map((e) => normPathKey(e.path, platform)));
    for (const e of prev[repo] ?? []) {
      if (e.is_main || samePath(e.path, repo, platform)) continue;
      if (!still.has(normPathKey(e.path, platform))) {
        gone.push({ repo, path: e.path, branch: e.branch });
      }
    }
  }
  return gone;
}

/**
 * Map a git-refresh scope onto the repos whose worktree LISTINGS should re-run.
 * A busy→idle volley is scoped to the settling session's folder — for a
 * worktree agent that's the WORKTREE path, where `git worktree list` still
 * answers but the result must be keyed by the PARENT repo. `parentOf` resolves
 * a scoped path to its parent (session records + the detection slice); a path
 * that is itself a sidebar repo passes through; anything unknown falls back to
 * ALL sidebar repos (`null`, the unscoped read — fail-safe, matching the
 * store's unscoped-volley convention).
 */
export function worktreeScopeRepos(
  scope: readonly string[] | null,
  sidebarRepoList: readonly string[],
  parentOf: (path: string) => string | undefined,
  platform: string,
): string[] | null {
  if (!scope || scope.length === 0) return null;
  const out = new Set<string>();
  for (const path of scope) {
    const asRepo = sidebarRepoList.find((r) => samePath(r, path, platform));
    if (asRepo) {
      out.add(asRepo);
      continue;
    }
    const parent = parentOf(path);
    if (parent) {
      out.add(parent);
      continue;
    }
    return null; // unknown path — fall back to every sidebar repo
  }
  return [...out];
}
