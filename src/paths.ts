/** Why Fork is unavailable for a source with no conversation yet (#138). Shown as
 * the Fork affordance's hover tooltip at all three sites, mirroring the backend
 * `SessionError::NothingToFork` message (#134) for a consistent explanation. */
export const FORK_UNAVAILABLE_REASON =
  "Nothing to fork yet — send the agent a message first.";

/** The last path segment (folder name) of a path, for display. */
export function repoName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/**
 * Split an absolute path into its parent `dir` and `base` filename (#163). Used to
 * open an out-of-repo file `/a/b/c.md` as `{ repoPath: "/a/b", file: "c.md" }`, so
 * the existing repo-confined read/write validates against the file's own directory.
 * A file directly at the filesystem root (`/c.md`) → `{ dir: "/", base: "c.md" }`;
 * a path with no slash → `{ dir: "", base: path }`.
 */
export function splitPath(path: string): { dir: string; base: string } {
  const i = path.lastIndexOf("/");
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
