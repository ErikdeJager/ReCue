import { agentCaps } from "./agents";

/** Why Fork is unavailable for a source with no conversation yet (#138). Shown as
 * the Fork affordance's hover tooltip at all three sites, mirroring the backend
 * `SessionError::NothingToFork` message (#134) for a consistent explanation. */
export const FORK_UNAVAILABLE_REASON =
  "Nothing to fork yet — send the agent a message first.";

/** The reason Fork is unavailable for a session, or `null` when it can be forked.
 * An agent that can't fork at all (Codex, #142) takes precedence over the
 * "no history yet" reason (#138). The three Fork sites disable + show this tooltip. */
export function forkUnavailableReason(session: {
  agent?: string | null;
  forkable?: boolean;
}): string | null {
  const caps = agentCaps(session.agent);
  if (!caps.supportsResume) {
    return `Fork isn't available for ${caps.displayName} sessions.`;
  }
  if (session.forkable === false) return FORK_UNAVAILABLE_REASON;
  return null;
}

/** The last segment of a `/`- or `\`-separated path (cross-platform, #143) — so a
 * Windows `repoPath` like `C:\foo\bar` renders as `bar`, not the whole string. */
export function lastSegment(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** The last path segment (folder name) of a path, for display. */
export function repoName(path: string): string {
  return lastSegment(path);
}

/**
 * Split an absolute path into its parent `dir` and `base` filename (#163). Used to
 * open an out-of-repo file `/a/b/c.md` as `{ repoPath: "/a/b", file: "c.md" }`, so
 * the existing repo-confined read/write validates against the file's own directory.
 * Cross-platform (#143): splits on `/` **or** `\`, so a Windows path
 * `C:\a\b\c.md` → `{ dir: "C:\\a\\b", base: "c.md" }`. A file directly at a POSIX
 * root (`/c.md`) → `{ dir: "/", base: "c.md" }`; a path with no separator →
 * `{ dir: "", base: path }`.
 */
export function splitPath(path: string): { dir: string; base: string } {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (i === -1) return { dir: "", base: path };
  if (i === 0) return { dir: "/", base: path.slice(1) };
  return { dir: path.slice(0, i), base: path.slice(i + 1) };
}

/**
 * The repo a session belongs to for grouping and coloring (#96). A worktree
 * agent (#74) runs in an isolated worktree folder but belongs to its **parent
 * repo**, so it groups and colors with the parent — not its own hashed path.
 */
export function effectiveRepo(session: {
  repoPath: string;
  worktreeParent?: string | null;
}): string {
  return session.worktreeParent ?? session.repoPath;
}

/**
 * Whether a pending scheduled session (#93) nests under a **worktree** sub-group in
 * the sidebar (#218), rather than at its parent repo's in-folder level. True only
 * for a worktree schedule whose deterministic `worktree_path` was computed at create
 * time — so it shares the sub-group key its live session will use after firing. A
 * worktree schedule created before #218 (no `worktree_path`) stays at the parent
 * level, as do all non-worktree schedules.
 */
export function scheduleNestsUnderWorktree(schedule: {
  worktree?: boolean | null;
  worktree_path?: string | null;
}): boolean {
  return Boolean(schedule.worktree && schedule.worktree_path);
}

/**
 * Whether a recurring session (#294) nests under a **worktree** sub-group in the
 * sidebar, rather than at its parent repo's in-folder level. True only for a worktree
 * recurring whose deterministic `worktree_path` was computed at create time — so it
 * shares the sub-group key its child agent uses. Mirrors `scheduleNestsUnderWorktree`.
 */
export function recurringNestsUnderWorktree(recurring: {
  worktree?: boolean | null;
  worktree_path?: string | null;
}): boolean {
  return Boolean(recurring.worktree && recurring.worktree_path);
}

/**
 * The ordered, deduped set of worktree sub-group folder paths for a repo (#74/#218):
 * the union of its live worktree agents' folders (`repoPath`), the `worktree_path` of
 * its pending worktree schedules, and (#294) its worktree recurrings. Live-agent paths
 * come first (in input order), then any schedule/recurring-only paths, so a worktree
 * with a live agent + a schedule + a recurring collapses to one sub-group keyed by the
 * shared path, while a worktree that currently has only a scheduled/recurring session
 * still gets its own sub-group.
 */
export function worktreeGroupPaths(
  worktreeAgents: { repoPath: string }[],
  worktreeSchedules: { worktree_path?: string | null }[],
  worktreeRecurrings: { worktree_path?: string | null }[] = [],
): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  const add = (p: string | null | undefined) => {
    if (p && !seen.has(p)) {
      seen.add(p);
      paths.push(p);
    }
  };
  for (const a of worktreeAgents) add(a.repoPath);
  for (const s of worktreeSchedules) add(s.worktree_path);
  for (const r of worktreeRecurrings) add(r.worktree_path);
  return paths;
}

/**
 * The Overview wall's filter (#34/#197/#247): a folder `path` plus a `mode` that
 * disambiguates a **repo** path's intent —
 * - `"all"`: show the repo's own agents **and** its worktree agents (the folder
 *   header / name click; also a worktree-path filter, where mode is moot since a
 *   worktree has no sub-worktrees).
 * - `"own"`: show **only** the repo's own non-worktree directory agents/items — all
 *   of its worktrees are hidden (the #236 branch-line click).
 * `null` = no filter (show everything). Transient (not persisted).
 */
export type OverviewFilter = { path: string; mode: "all" | "own" } | null;

/**
 * Whether a session is shown under the Overview filter (#34/#197/#247). `null` shows
 * everything. An **"own"** filter matches only the repo's own (non-worktree) agents
 * (`repoPath === path && !worktreeParent`) — worktree agents are hidden. An **"all"**
 * filter matches a session's **effective repo** (so a repo filter includes its
 * worktree agents, #96) **or** its actual `repoPath` (so a worktree-folder filter
 * narrows to that one worktree).
 */
export function sessionInFilter(
  session: { repoPath: string; worktreeParent?: string | null },
  filter: OverviewFilter,
): boolean {
  if (!filter) return true;
  if (filter.mode === "own")
    return session.repoPath === filter.path && !session.worktreeParent;
  return (
    effectiveRepo(session) === filter.path || session.repoPath === filter.path
  );
}

/**
 * Unified session label rule (#67, extended by #97). The **primary** title is the
 * user's custom name when set (#57), else claude's auto-title (#97), else the
 * branch (or the folder name for a non-git folder). The **subtitle** (the branch /
 * folder name) appears **only when a custom name is set**. Callers pass
 * `branchOrFolder` already resolved — typically `branches[repoPath] ||
 * repoName(repoPath)` (the sidebar passes its deduped branch label).
 */
export function sessionLabel(
  name: string | null | undefined,
  autoName: string | null | undefined,
  branchOrFolder: string,
): { primary: string; subtitle: string | null } {
  const custom = name?.trim() || null;
  const auto = autoName?.trim() || null;
  return {
    primary: custom || auto || branchOrFolder,
    subtitle: custom ? branchOrFolder : null,
  };
}
