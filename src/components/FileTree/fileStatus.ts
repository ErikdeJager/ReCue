// Pure git-status helpers for the FileTree coloring (#252). Kept React-free so the
// folder roll-up + deleted-children logic is unit-tested in isolation. The status
// map is `{ repo-relative POSIX path → "A" | "M" | "D" | "I" }` (from the backend
// `file_statuses` reader; `"I"` = gitignored, #270); `DirEntry.path` is the same shape,
// so every lookup is a direct string-keyed hit (no path-join / separator handling) on
// macOS and Windows.

import type { FileStatusCode } from "../../types";

/** A per-repo status map: repo-relative POSIX path → working-tree status. */
export type FileStatusMap = Record<string, FileStatusCode>;

/** The roll-up-eligible (tracked-change) statuses. Gitignored (`"I"`, #270) is
 *  deliberately excluded so an ignored child never grays a tracked parent folder. */
type TrackedStatusCode = Exclude<FileStatusCode, "I">;

// Severity for the folder roll-up: red (deleted) > yellow (modified) > green (added).
const SEVERITY: Record<TrackedStatusCode, number> = { A: 1, M: 2, D: 3 };

/** The more-severe of two statuses (`D` > `M` > `A`). */
function moreSevere(
  a: TrackedStatusCode,
  b: TrackedStatusCode,
): TrackedStatusCode {
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}

/**
 * Precompute, for every ancestor folder of every changed path, the highest-severity
 * status among its descendants. Returns a `Map<folderPath, status>` so a folder row
 * can look up its roll-up in O(1) at render — far cheaper than re-scanning the whole
 * status map per folder. A folder containing a deleted descendant rolls up to `D`
 * (red) even when that descendant's own directory no longer exists on disk and so
 * never renders — which is what makes "something was deleted out of a folder → that
 * folder is marked red" work for collapsed / vanished subtrees.
 */
export function buildFolderRollup(
  map: FileStatusMap,
): Map<string, TrackedStatusCode> {
  const rollup = new Map<string, TrackedStatusCode>();
  for (const path in map) {
    const status = map[path];
    // Skip unset and gitignored (`"I"`, #270) entries: an ignored descendant must not
    // gray a tracked parent — only a folder's *own* ignored entry dims it (see `isIgnored`).
    if (!status || status === "I") continue;
    const parts = path.split("/");
    let acc = "";
    // Every ancestor folder (exclude the file itself, the last segment).
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : (parts[i] ?? "");
      const prev = rollup.get(acc);
      rollup.set(acc, prev ? moreSevere(prev, status) : status);
    }
  }
  return rollup;
}

/**
 * The deleted files whose immediate parent directory is `dir` (repo-relative;
 * `""` = repo root) and that are **not** present as a real entry at that level
 * (`existing` = the names `list_dir` returned). These become red, struck-through,
 * non-openable "ghost" rows so a deletion is visible in place. Returned
 * alphabetically (the FileTree appends them after the real entries at that level).
 */
export function deletedChildrenAt(
  map: FileStatusMap,
  dir: string,
  existing: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const path in map) {
    if (map[path] !== "D") continue;
    const idx = path.lastIndexOf("/");
    const parent = idx === -1 ? "" : path.slice(0, idx);
    if (parent !== dir) continue;
    const name = idx === -1 ? path : path.slice(idx + 1);
    if (!name || existing.has(name)) continue;
    out.push(name);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** Whether a path is itself gitignored (#270) — its own entry in the status map is
 *  `"I"`. Dims a file row, or a wholly-ignored folder row (matching mode reports such a
 *  directory by its own path). Deliberately keyed on the path's *own* status, never a
 *  roll-up, so an ignored child can't gray a tracked parent. */
export function isIgnored(
  map: FileStatusMap | undefined,
  path: string,
): boolean {
  return map?.[path] === "I";
}

/** Shallow-equality of two status maps — lets the store skip a re-render when a
 *  refresh produced no change (referential stability for the FileTree selector). */
export function statusMapsEqual(
  a: FileStatusMap | undefined,
  b: FileStatusMap | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  return true;
}
