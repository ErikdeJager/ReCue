import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  Bot,
  Clock,
  FileText,
  GitCompare,
  type LucideIcon,
  Repeat,
  ScrollText,
  Search,
  SquareKanban,
  SquareTerminal,
} from "lucide-react";

import { noAutoCapitalize } from "../../inputProps";
import {
  searchFileContents,
  searchFiles,
  searchSessionOutput,
} from "../../ipc";
import {
  effectiveRepo,
  lastSegment,
  repoName,
  sessionLabel,
} from "../../paths";
import { kbdHint } from "../../platform";
import {
  ownedChildSessionIds,
  repoColor,
  repoOrder,
  useStore,
} from "../../store";
import styles from "./GlobalSearch.module.css";
import {
  CONTENT_SCORE,
  flatOrder,
  OUTPUT_SCORE,
  rankAndGroup,
  scoreFilename,
  scoreTitle,
  splitHighlight,
  type HighlightSegment,
  type ResultKind,
  type SearchNav,
  type SearchResult,
} from "./search";

const KIND_ICON: Record<ResultKind, LucideIcon> = {
  agent: Bot,
  terminal: SquareTerminal,
  file: FileText,
  diff: GitCompare,
  kanban: SquareKanban,
  scheduled: Clock,
  recurring: Repeat,
  output: ScrollText,
};

const KIND_LABEL: Record<ResultKind, string> = {
  agent: "Agents",
  terminal: "Terminals",
  file: "Files",
  diff: "Diffs",
  kanban: "Boards",
  scheduled: "Scheduled",
  recurring: "Recurring",
  output: "Terminal output",
};

/** Per-repo file / content search cap and the total terminal-output cap (#337) — kept
 * small so a keystroke's fan-out across every open repo stays bounded. */
const PER_REPO_FILE_CAP = 20;

/** How many folder-filter chips to show under the search bar (⌘1…⌘9), one per matching
 * repo in group order — matches the single-digit ⌘-Number range (task 397). */
const MAX_FILTER_CHIPS = 9;

/** First non-empty line of a multi-line prompt, trimmed — the display title for a
 * scheduled / recurring session with no custom name. */
function firstLine(text: string | null | undefined): string {
  if (!text) return "";
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t) return t;
  }
  return "";
}

/**
 * The ⌘F / Ctrl+F **global search** modal (#337): one keystroke opens a keyboard-first
 * search across **everything** in every open folder — agents, shell terminals, file /
 * diff / kanban viewers, scheduled + recurring sessions (matched on titles), **files on
 * disk** (filename + content, across every sidebar repo), and **live terminal output**
 * (best-effort). Results are ranked (pure `search.ts`) and laid out **grouped by repo,
 * then by item type**. Activating a result jumps to it (opening a file viewer first when
 * the match is a not-yet-open file).
 *
 * Mounted only while open (App gates on `globalSearchOpen`); centered, focus-trapped,
 * Escape / scrim close; ↑/↓ move the highlight, Enter activates. Main-window only.
 */
function GlobalSearch() {
  const sessions = useStore((s) => s.sessions);
  const overviewPanels = useStore((s) => s.overviewPanels);
  const schedules = useStore((s) => s.schedules);
  const recurrings = useStore((s) => s.recurrings);
  const recents = useStore((s) => s.recents);
  const branches = useStore((s) => s.branches);
  const repoColors = useStore((s) => s.repoColors);
  const platform = useStore((s) => s.platform);
  const selectItem = useStore((s) => s.selectItem);
  const addOverviewPanel = useStore((s) => s.addOverviewPanel);
  const close = useStore((s) => s.closeGlobalSearch);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [fileResults, setFileResults] = useState<SearchResult[]>([]);
  const [outputResults, setOutputResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  // The one active folder-filter chip (⌘-Number narrows results to a single repo,
  // lifting the per-repo cap for it), or null when unfiltered (task 397).
  const [filterRepo, setFilterRepo] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const requestSeq = useRef(0);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Autofocus the input; restore focus to the opener on close (a11y, like #189).
  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      clearTimeout(t);
      openerRef.current?.focus?.();
    };
  }, []);

  // Debounce the query (~180ms) so the async file/output fan-out doesn't fire per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 180);
    return () => clearTimeout(t);
  }, [query]);

  // Reset the highlight to the top whenever the query — or the active filter — changes.
  useEffect(() => setActiveIndex(0), [debouncedQuery]);
  useEffect(() => setActiveIndex(0), [filterRepo]);

  // The cluster repo a non-agent panel folder groups under: a worktree folder groups under
  // its parent repo (resolved via a worktree agent running there), else the folder itself.
  const clusterRepoOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sessions) {
      if (s.worktreeParent) map.set(s.repoPath, s.worktreeParent);
    }
    return (folder: string): string => map.get(folder) ?? folder;
  }, [sessions]);

  // The nav for a file hit: reuse an already-open markdown/kanban panel if present, else
  // open a fresh file viewer on activation.
  const fileNav = useMemo(() => {
    return (repo: string, path: string): SearchNav => {
      const panels = overviewPanels[repo] ?? [];
      const open = panels.find(
        (p) =>
          (p.kind === "markdown" || p.kind === "kanban") && p.file === path,
      );
      if (open) {
        return {
          type: "item",
          item: {
            kind: open.kind === "kanban" ? "kanban" : "file",
            id: open.id,
            repoPath: repo,
            file: path,
          },
        };
      }
      return { type: "openFile", repoPath: repo, file: path };
    };
  }, [overviewPanels]);

  // Synchronous in-store results (titles): agents, non-agent panels, schedules, recurrings.
  const storeResults = useMemo<SearchResult[]>(() => {
    const q = debouncedQuery.trim();
    if (!q) return [];
    const out: SearchResult[] = [];
    const ownedChildren = ownedChildSessionIds(recurrings);

    for (const s of sessions) {
      if (ownedChildren.has(s.id)) continue;
      const branchOrFolder = branches[s.repoPath] || repoName(s.repoPath);
      const label = sessionLabel(s.name, s.autoName, branchOrFolder);
      const score = scoreTitle(q, label.primary);
      if (score <= 0) continue;
      out.push({
        key: `agent:${s.id}`,
        kind: "agent",
        repo: effectiveRepo(s),
        title: label.primary,
        subtitle: label.subtitle,
        score,
        nav: {
          type: "item",
          item: { kind: "agent", id: s.id, repoPath: s.repoPath },
        },
      });
    }

    for (const [folder, panels] of Object.entries(overviewPanels)) {
      const repo = clusterRepoOf(folder);
      for (const p of panels) {
        let kind: ResultKind;
        let title: string;
        if (p.kind === "markdown") {
          kind = "file";
          title = p.file ? lastSegment(p.file) : "File";
        } else if (p.kind === "kanban") {
          kind = "kanban";
          title = p.file ? lastSegment(p.file) : "Board";
        } else if (p.kind === "diff") {
          kind = "diff";
          title = "Diff";
        } else if (p.kind === "terminal") {
          kind = "terminal";
          title = "Terminal";
        } else {
          // filetree panels aren't a searchable title kind.
          continue;
        }
        const score = scoreTitle(q, title);
        if (score <= 0) continue;
        const sidebarKind = p.kind === "markdown" ? "file" : p.kind;
        out.push({
          key: `panel:${p.id}`,
          kind,
          repo,
          title,
          subtitle: p.file ?? null,
          score,
          nav: {
            type: "item",
            item: {
              kind: sidebarKind,
              id: p.id,
              repoPath: folder,
              file: p.file,
            },
          },
        });
      }
    }

    for (const sc of schedules) {
      const title =
        sc.name?.trim() || firstLine(sc.prompt) || "Scheduled session";
      const score = scoreTitle(q, title);
      if (score <= 0) continue;
      out.push({
        key: `schedule:${sc.id}`,
        kind: "scheduled",
        repo: sc.cwd,
        title,
        score,
        nav: {
          type: "item",
          item: { kind: "scheduled", id: sc.id, repoPath: sc.cwd },
        },
      });
    }

    for (const rc of recurrings) {
      const title =
        rc.name?.trim() || firstLine(rc.prompt) || "Recurring session";
      const score = scoreTitle(q, title);
      if (score <= 0) continue;
      out.push({
        key: `recurring:${rc.id}`,
        kind: "recurring",
        repo: rc.cwd,
        title,
        score,
        nav: {
          type: "item",
          item: { kind: "recurring", id: rc.id, repoPath: rc.cwd },
        },
      });
    }

    return out;
  }, [
    debouncedQuery,
    sessions,
    overviewPanels,
    schedules,
    recurrings,
    branches,
    clusterRepoOf,
  ]);

  // Async file (filename + content) and terminal-output search across every open repo.
  useEffect(() => {
    const q = debouncedQuery.trim();
    const seq = ++requestSeq.current;
    if (q.length < 1) {
      setFileResults([]);
      setOutputResults([]);
      return;
    }
    let cancelled = false;
    const stale = () => cancelled || requestSeq.current !== seq;

    void (async () => {
      const repos = repoOrder(recents, sessions);
      const withContent = q.length >= 2;
      const fileOut: SearchResult[] = [];
      await Promise.all(
        repos.map(async (repo) => {
          try {
            const [names, contents] = await Promise.all([
              searchFiles(repo, q, undefined, PER_REPO_FILE_CAP),
              withContent
                ? searchFileContents(repo, q, PER_REPO_FILE_CAP)
                : Promise.resolve({ matches: [], truncated: false }),
            ]);
            for (const path of names) {
              fileOut.push({
                key: `file:name:${repo}:${path}`,
                kind: "file",
                repo,
                title: lastSegment(path),
                subtitle: path,
                score: scoreFilename(q, path),
                nav: fileNav(repo, path),
              });
            }
            for (const m of contents.matches) {
              fileOut.push({
                key: `file:content:${repo}:${m.path}:${m.line}`,
                kind: "file",
                repo,
                title: lastSegment(m.path),
                subtitle: m.path,
                snippet: m.snippet,
                line: m.line,
                score: CONTENT_SCORE,
                nav: fileNav(repo, m.path),
              });
            }
          } catch {
            // Per-repo fail-open: a non-repo / unreadable folder just contributes nothing.
          }
        }),
      );
      if (stale()) return;
      setFileResults(fileOut);

      if (!withContent) {
        setOutputResults([]);
        return;
      }
      try {
        const hits = await searchSessionOutput(q);
        if (stale()) return;
        const out: SearchResult[] = [];
        for (const h of hits) {
          const s = sessions.find((x) => x.id === h.id);
          if (!s) continue;
          const branchOrFolder = branches[s.repoPath] || repoName(s.repoPath);
          const label = sessionLabel(s.name, s.autoName, branchOrFolder);
          out.push({
            key: `output:${h.id}:${h.line}`,
            kind: "output",
            repo: effectiveRepo(s),
            title: label.primary,
            snippet: h.snippet,
            line: h.line,
            score: OUTPUT_SCORE,
            nav: {
              type: "item",
              item: { kind: "agent", id: s.id, repoPath: s.repoPath },
            },
          });
        }
        setOutputResults(out);
      } catch {
        if (!stale()) setOutputResults([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, recents, sessions, branches, fileNav]);

  // Repos with a currently-running agent (`exitedCode === undefined`) — surfaced first in
  // the grouped results (task 393), grouped by `effectiveRepo` like the rows themselves.
  const activeRepos = useMemo(
    () =>
      new Set(
        sessions
          .filter((s) => s.exitedCode === undefined)
          .map((s) => effectiveRepo(s)),
      ),
    [sessions],
  );

  const allResults = useMemo(
    () => [...storeResults, ...fileResults, ...outputResults],
    [storeResults, fileResults, outputResults],
  );

  // Active-first, per-repo-capped grouping — the source of the filter chips (chip #N is
  // the Nth group, since `grouped` is already active-first ordered).
  const grouped = useMemo(
    () => rankAndGroup(allResults, { activeRepos }),
    [allResults, activeRepos],
  );

  // The matching repos, in group order — chips (up to 9) map ⌘1…⌘9 onto them (task 397).
  const matchingRepos = useMemo(() => grouped.map((g) => g.repo), [grouped]);
  const chips = useMemo(
    () => matchingRepos.slice(0, MAX_FILTER_CHIPS),
    [matchingRepos],
  );

  // Drop a stale filter as soon as its folder no longer matches the query (so the list
  // never goes empty behind an orphaned filter).
  useEffect(() => {
    if (filterRepo && !matchingRepos.includes(filterRepo)) setFilterRepo(null);
  }, [filterRepo, matchingRepos]);

  // What renders + navigates: the capped groups when unfiltered, else the chosen folder
  // alone with the per-repo cap lifted (Infinity ⇒ keep everything, hiddenCount 0).
  const visibleGroups = useMemo(() => {
    if (!filterRepo) return grouped;
    return rankAndGroup(
      allResults.filter((r) => r.repo === filterRepo),
      { activeRepos, perRepoCap: Number.POSITIVE_INFINITY },
    );
  }, [filterRepo, grouped, allResults, activeRepos]);

  const flat = useMemo(() => flatOrder(visibleGroups), [visibleGroups]);

  // Clamp the highlight to the current result count.
  useEffect(() => {
    setActiveIndex((i) =>
      flat.length === 0 ? 0 : Math.min(i, flat.length - 1),
    );
  }, [flat.length]);

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    rowRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const activate = async (r: SearchResult) => {
    if (r.nav.type === "item") {
      selectItem(r.nav.item);
      close();
      return;
    }
    const { repoPath, file } = r.nav;
    const id = await addOverviewPanel(repoPath, "markdown", file);
    if (id) selectItem({ kind: "file", id, repoPath, file });
    close();
  };

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    // ⌘-Number / Ctrl+Number — toggle the Nth folder-filter chip (task 397). The input
    // is reliably focused; ⌘1–9 is freed from the Canvas-jump while the modal is open
    // (useKeyboardNav's globalSearchOpen guard). Matched on `e.code` for layout robustness.
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.shiftKey &&
      !event.altKey &&
      /^Digit[1-9]$/.test(event.code)
    ) {
      event.preventDefault();
      event.stopPropagation();
      const repo = chips[Number(event.code.slice(5)) - 1];
      if (repo) setFilterRepo((p) => (p === repo ? null : repo));
      return;
    }
    if (event.key === "ArrowDown") {
      if (flat.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (event.key === "ArrowUp") {
      if (flat.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      const r = flat[activeIndex];
      if (r) {
        event.preventDefault();
        void activate(r);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      // Peel off an active folder filter first; a second Escape closes the modal.
      if (filterRepo) setFilterRepo(null);
      else close();
    }
  };

  // Track a running flat index across the grouped render so ↑/↓ and click agree.
  let flatIndex = -1;
  const hint = kbdHint(platform, "⌘F", "Ctrl+F");

  return (
    <div className={`modal-scrim ${styles.overlay}`} onClick={close}>
      <div
        ref={dialogRef}
        className={`modal-pop ${styles.dialog}`}
        role="dialog"
        aria-modal="true"
        aria-label="Search everything"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.searchRow}>
          <Search size={16} strokeWidth={1.5} className={styles.searchIcon} />
          <input
            ref={inputRef}
            className={styles.input}
            {...noAutoCapitalize}
            type="text"
            value={query}
            placeholder="Search agents, terminals, files & output…"
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={onInputKeyDown}
            aria-label="Search everything"
          />
          <kbd className="kbd-chip">{hint}</kbd>
        </div>

        {debouncedQuery.trim() !== "" && chips.length >= 2 && (
          <div
            className={styles.filterChips}
            role="group"
            aria-label="Filter by folder"
          >
            {chips.map((repo, i) => {
              const on = filterRepo === repo;
              return (
                <button
                  key={repo}
                  type="button"
                  className={`${styles.filterChip} ${on ? styles.filterChipActive : ""}`}
                  aria-pressed={on}
                  title={repo}
                  onClick={() =>
                    setFilterRepo((p) => (p === repo ? null : repo))
                  }
                >
                  <span
                    className={styles.filterDot}
                    style={{ background: repoColor(repo, repoColors) }}
                    aria-hidden
                  />
                  <span className={styles.filterName}>{repoName(repo)}</span>
                  <kbd className={styles.filterKbd}>
                    {kbdHint(platform, `⌘${i + 1}`, `Ctrl+${i + 1}`)}
                  </kbd>
                </button>
              );
            })}
          </div>
        )}

        <div className={styles.results}>
          {debouncedQuery.trim() === "" ? (
            <p className={styles.hint}>
              Search across every open folder — agents, terminals, file &amp;
              diff viewers, files on disk, and live terminal output.
            </p>
          ) : flat.length === 0 ? (
            <p className={styles.hint}>
              No results for “{debouncedQuery.trim()}”.
            </p>
          ) : (
            visibleGroups.map((rg) => (
              <div key={rg.repo} className={styles.repoGroup}>
                <div className={styles.repoHeader}>
                  <span
                    className={styles.repoDot}
                    style={{ background: repoColor(rg.repo, repoColors) }}
                    aria-hidden
                  />
                  <span className={styles.repoName} title={rg.repo}>
                    {repoName(rg.repo)}
                  </span>
                </div>
                {rg.groups.map((g) => (
                  <div key={g.kind} className={styles.kindGroup}>
                    <p className={styles.kindHeader}>{KIND_LABEL[g.kind]}</p>
                    {g.items.map((r) => {
                      flatIndex += 1;
                      const index = flatIndex;
                      const Icon = KIND_ICON[r.kind];
                      const active = index === activeIndex;
                      return (
                        <button
                          key={r.key}
                          ref={(el) => {
                            rowRefs.current[index] = el;
                          }}
                          type="button"
                          className={`${styles.row} ${active ? styles.rowActive : ""}`}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => void activate(r)}
                          title={r.subtitle ?? r.title}
                        >
                          <Icon
                            size={14}
                            strokeWidth={1.5}
                            className={styles.rowIcon}
                          />
                          <span className={styles.rowBody}>
                            <span className={styles.rowTitle}>
                              {renderHighlight(
                                splitHighlight(r.title, debouncedQuery),
                              )}
                              {r.line != null && (
                                <span className={styles.rowLine}>
                                  :{r.line}
                                </span>
                              )}
                            </span>
                            {r.snippet ? (
                              <span className={styles.rowSnippet}>
                                {renderHighlight(
                                  splitHighlight(r.snippet, debouncedQuery),
                                )}
                              </span>
                            ) : r.subtitle ? (
                              <span className={styles.rowSub}>
                                {r.subtitle}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
                {rg.hiddenCount > 0 && (
                  <p className={styles.moreHint} aria-hidden>
                    … +{rg.hiddenCount} more
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/** Map highlight segments to React nodes, wrapping matches in `<mark>` (like FileTree). */
function renderHighlight(segments: HighlightSegment[]) {
  return segments.map((seg, i) =>
    seg.match ? (
      <mark key={i} className={styles.mark}>
        {seg.text}
      </mark>
    ) : (
      <span key={i}>{seg.text}</span>
    ),
  );
}

export default GlobalSearch;
