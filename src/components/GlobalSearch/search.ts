// Pure ranking / grouping / highlight helpers for the global search modal (#337).
//
// Deliberately free of any store / Tauri / React import (the `SidebarItem` type is a
// **type-only** import, erased at build time), so it's a self-contained, unit-tested
// module: the modal builds a flat `SearchResult[]` (from in-store items + async file /
// terminal-output searches) and hands it here to be scored, grouped **by repo then item
// type**, and flattened for keyboard navigation. Case-insensitive throughout; string-only
// (no path/shell primitives), so identical on macOS and Windows.

import { repoName } from "../../paths";
import type { SidebarItem } from "../../store";

/** The item types a result can be, ordered by `KIND_ORDER` within each repo. `output` is
 * a live-terminal-output hit that navigates to its agent. */
export type ResultKind =
  | "agent"
  | "terminal"
  | "file"
  | "diff"
  | "kanban"
  | "scheduled"
  | "recurring"
  | "output";

/** How to navigate when a result is activated: jump to an already-tracked item
 * (`selectItem`), or open a not-yet-open file viewer first (`addOverviewPanel` → then
 * select). */
export type SearchNav =
  | { type: "item"; item: SidebarItem }
  | { type: "openFile"; repoPath: string; file: string };

/** One search result row. `repo` is the grouping repo (a worktree item groups under its
 * parent repo); `title` is the primary label matched; `snippet`/`line` carry a content or
 * terminal-output hit; `score` ranks within its `(repo, kind)` bucket. */
export interface SearchResult {
  key: string;
  kind: ResultKind;
  repo: string;
  title: string;
  subtitle?: string | null;
  snippet?: string | null;
  line?: number | null;
  score: number;
  nav: SearchNav;
}

/** A run of text plus whether it is a (case-insensitive) query match — the pure form of
 * FileTree's `renderSnippet`, so the UI wraps `match` runs in `<mark>`. */
export interface HighlightSegment {
  text: string;
  match: boolean;
}

export interface KindGroup {
  kind: ResultKind;
  items: SearchResult[];
}

export interface RepoResults {
  repo: string;
  groups: KindGroup[];
}

/** The within-repo rendering order of item types. Titles (agent/terminal/…) rank above
 * files, which rank above terminal output — so a title match reads first. */
export const KIND_ORDER: ResultKind[] = [
  "agent",
  "terminal",
  "file",
  "diff",
  "kanban",
  "scheduled",
  "recurring",
  "output",
];

/** Fixed score bases so a title match > filename match > content match > output match
 * across kinds (title tiers below start at 40, filename at 35, content 25, output 20). */
export const FILENAME_SCORE = 35;
export const CONTENT_SCORE = 25;
export const OUTPUT_SCORE = 20;

/** Whether `idx` in `lowerText` starts at a word boundary — the string start or just
 * after a `/`, `-`, `_`, `.`, or space. Used to rank a boundary-anchored match above a
 * mid-word one. */
function isWordBoundary(lowerText: string, idx: number): boolean {
  if (idx === 0) return true;
  const prev = lowerText[idx - 1];
  return (
    prev === "/" || prev === "-" || prev === "_" || prev === "." || prev === " "
  );
}

/**
 * Score a title against `query` (#337). Returns 0 when the query isn't a case-insensitive
 * substring of `title`; else a base of **120** (exact) / **90** (prefix) / **70** (word
 * boundary) / **40** (mid-string substring), minus the match position (earlier = higher)
 * and plus a small bonus for shorter titles. Pure + deterministic.
 */
export function scoreTitle(query: string, title: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = title.toLowerCase();
  const idx = t.indexOf(q);
  if (idx === -1) return 0;
  let base: number;
  if (t === q) base = 120;
  else if (idx === 0) base = 90;
  else if (isWordBoundary(t, idx)) base = 70;
  else base = 40;
  const positionPenalty = Math.min(idx, 20);
  const lengthBonus = Math.max(0, 10 - Math.floor(title.length / 8));
  return base - positionPenalty + lengthBonus;
}

/**
 * Score a filename match against `query` (#337) — a repo-relative path (`relPath`) that
 * the backend's substring search already matched. Kept in **[35, 43]**: the `FILENAME_SCORE`
 * base plus a small tier bonus (exact / prefix / boundary) computed on the **basename**, so
 * it always ranks above a content hit (25) yet stays a distinct band. Returns 0 only when
 * the query is absent from the whole path (shouldn't happen for a real hit). Pure.
 */
export function scoreFilename(query: string, relPath: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const path = relPath.toLowerCase();
  if (!path.includes(q)) return 0;
  const base = basename(path);
  const idx = base.indexOf(q);
  let bonus = 1;
  if (idx !== -1) {
    if (base === q) bonus = 8;
    else if (idx === 0) bonus = 5;
    else if (isWordBoundary(base, idx)) bonus = 3;
    else bonus = 1;
  } else {
    // Matched only in a directory segment — the weakest filename hit.
    bonus = 0;
  }
  return FILENAME_SCORE + bonus;
}

/** The last `/`-separated segment of a repo-relative POSIX path. */
function basename(relPath: string): string {
  const parts = relPath.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? relPath;
}

/**
 * Group `results` **by repo, then by item type** (#337), each `(repo, kind)` bucket sorted
 * by score desc then title A→Z. Repos order by display name then full path; kinds by
 * `KIND_ORDER`. Empty buckets are dropped. Pure — the modal renders the returned tree and
 * flattens it (`flatOrder`) for ↑/↓ navigation.
 */
export function rankAndGroup(results: SearchResult[]): RepoResults[] {
  const byRepo = new Map<string, Map<ResultKind, SearchResult[]>>();
  for (const r of results) {
    let kinds = byRepo.get(r.repo);
    if (!kinds) {
      kinds = new Map();
      byRepo.set(r.repo, kinds);
    }
    const arr = kinds.get(r.kind);
    if (arr) arr.push(r);
    else kinds.set(r.kind, [r]);
  }
  const repos = [...byRepo.keys()].sort((a, b) => {
    const byName = repoName(a)
      .toLowerCase()
      .localeCompare(repoName(b).toLowerCase());
    return byName !== 0 ? byName : a.localeCompare(b);
  });
  return repos.map((repo) => {
    const kinds = byRepo.get(repo)!;
    const groups: KindGroup[] = [];
    for (const kind of KIND_ORDER) {
      const items = kinds.get(kind);
      if (!items || items.length === 0) continue;
      items.sort(
        (a, b) =>
          b.score - a.score ||
          a.title.toLowerCase().localeCompare(b.title.toLowerCase()),
      );
      groups.push({ kind, items });
    }
    return { repo, groups };
  });
}

/** The flat list of results in rendered order (repo → kind → item) — the target of the
 * modal's ↑/↓ highlight and Enter activation. */
export function flatOrder(grouped: RepoResults[]): SearchResult[] {
  const out: SearchResult[] = [];
  for (const rg of grouped) {
    for (const g of rg.groups) {
      for (const it of g.items) out.push(it);
    }
  }
  return out;
}

/**
 * Split `text` into runs around each case-insensitive occurrence of `query` (#337) — the
 * pure form of FileTree's `renderSnippet`, so the modal maps `match` runs to `<mark>`. A
 * blank query yields one non-match run of the whole text. Pure.
 */
export function splitHighlight(
  text: string,
  query: string,
): HighlightSegment[] {
  const q = query.trim().toLowerCase();
  if (!q) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const out: HighlightSegment[] = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(q, i);
    if (idx === -1) {
      out.push({ text: text.slice(i), match: false });
      break;
    }
    if (idx > i) out.push({ text: text.slice(i, idx), match: false });
    out.push({ text: text.slice(idx, idx + q.length), match: true });
    i = idx + q.length;
  }
  return out;
}
