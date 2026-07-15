// Pure relevance ranking for the file-search dropdowns (task 415).
//
// The backend `search_files` (files.rs) returns matches in a **deterministic
// directory-walk order** — case-insensitive substring hits over repo-relative POSIX
// paths, capped, but unscored. That means a file whose *name* matches the query can sit
// below files that only match in a directory segment. These helpers reorder a hit list
// **best-match first** by scoring each path's **basename** against the query (a filename
// match outranks a directory-only match), mirroring `GlobalSearch/search.ts`'s
// `scoreFilename` tiering so the two surfaces rank consistently.
//
// Deliberately free of any React / store / Tauri import — a self-contained, unit-tested
// module of pure string logic over `/`-separated backend paths (no OS branch, so
// identical on macOS, Windows, and Linux).

/** The last `/`-separated segment of a repo-relative POSIX path. Backend paths are
 * always `/`-separated (files.rs reports repo-relative POSIX paths on every OS), so no
 * `\` handling is needed. */
export function basename(relPath: string): string {
  const parts = relPath.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? relPath;
}

/** Whether `idx` in `lowerText` starts at a word boundary — the string start or just
 * after a `/`, `-`, `_`, `.`, or space. Used to rank a boundary-anchored match above a
 * mid-word one (mirrors `GlobalSearch/search.ts`). */
export function isWordBoundary(lowerText: string, idx: number): boolean {
  if (idx === 0) return true;
  const prev = lowerText[idx - 1];
  return (
    prev === "/" || prev === "-" || prev === "_" || prev === "." || prev === " "
  );
}

/**
 * Score a repo-relative path against `query` by where the query hits its **basename**
 * (task 415). Tiers, from strongest to weakest — the ordering mirrors GlobalSearch's
 * `scoreFilename` (exact / prefix / word-boundary / mid-substring, then directory-only):
 *
 *   - exact basename (`base === q`) → **100**
 *   - basename prefix (`indexOf === 0`) → **80**
 *   - basename word-boundary → **60**
 *   - mid-basename substring → **40**
 *   - query present only in a directory segment → **20**
 *   - not present at all → **0**
 *
 * An empty / whitespace-only query scores **0** for every path. Pure + deterministic.
 */
export function scoreFilePath(query: string, relPath: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const path = relPath.toLowerCase();
  const base = basename(path);
  const idx = base.indexOf(q);
  if (idx !== -1) {
    if (base === q) return 100;
    if (idx === 0) return 80;
    if (isWordBoundary(base, idx)) return 60;
    return 40;
  }
  // Not in the basename — a directory-segment match is the weakest positive hit.
  return path.includes(q) ? 20 : 0;
}

/**
 * Reorder `paths` best-match first by `scoreFilePath` (task 415), **without mutating**
 * the caller's array. An empty / whitespace-only query returns the input order unchanged
 * (a shallow copy), so a blank search keeps the backend's walk order. Ties break by
 * shorter full path, then case-insensitive alphabetical, then stable input order.
 */
export function rankFileMatches(query: string, paths: string[]): string[] {
  if (!query.trim()) return paths.slice();
  return paths
    .map((p, i) => ({ p, i, s: scoreFilePath(query, p) }))
    .sort(
      (a, b) =>
        b.s - a.s ||
        a.p.length - b.p.length ||
        a.p.toLowerCase().localeCompare(b.p.toLowerCase()) ||
        a.i - b.i,
    )
    .map((entry) => entry.p);
}
