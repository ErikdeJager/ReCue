import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Locate,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import {
  type ContentSearchResult,
  type DirEntry,
  listDir,
  revealPath,
  searchFileContents,
  searchFiles,
} from "../../ipc";
import { noAutoCapitalize } from "../../inputProps";
import { joinPath, revealLabel } from "../../platform";
import { useStore } from "../../store";
import type { FileStatusCode } from "../../types";
import { buildFolderRollup, deletedChildrenAt } from "./fileStatus";
import styles from "./FileTree.module.css";

/** Map a working-tree status to its tint class (green/yellow/red), or "" when the
 * path is unchanged. Drives the file/folder row coloring (#252). */
function statusClass(status: FileStatusCode | undefined): string {
  if (status === "A") return styles.statusAdded ?? "";
  if (status === "M") return styles.statusModified ?? "";
  if (status === "D") return styles.statusDeleted ?? "";
  return "";
}

/** Right-click menu state: the cursor position + the file the menu targets. */
interface FileMenu {
  x: number;
  y: number;
  file: string;
}

/** Debounce before a typed query hits the backend (#202) — coalesces keystrokes. */
const SEARCH_DEBOUNCE_MS = 200;
/** Max filename hits shown; hitting it flags "more not shown" (#202). */
const FILE_RESULT_LIMIT = 100;
/** Max content hits requested (the backend clamps + flags its own truncation). */
const CONTENT_RESULT_LIMIT = 200;

/**
 * A collapsible repo file tree (#167) — a first-class, repo-scoped view rendered in
 * the sidebar, an Overview column, and a Canvas panel (and a Canvas-template block),
 * exactly like the diff panel. It loads **lazily**, one directory level at a time, via
 * the backend `list_dir`: the root loads on mount and each folder fetches its children
 * the first time it's expanded. So the tree supports **arbitrarily deep** structures
 * and **very large repos** without ever walking the whole tree (no count or depth cap)
 * — the same data source as the file picker's `search_files`. Folder expansion state
 * lives in local component state (not persisted; refresh reloads from the root).
 * Clicking a file opens it in the file viewer; right-clicking a file offers Open in
 * file viewer / Open as Kanban board (`.md` only) / Reveal in Finder / Copy absolute
 * path / Copy relative path (#184). Folders have no menu.
 *
 * **In-panel search (#202):** a search box at the top replaces the tree with results
 * while a query is typed (debounced). Two groups — **Files** (filename hits via
 * `search_files`) and **In files** (content hits via `search_file_contents`, each with
 * the matching line as a highlighted mono **snippet**), run in parallel. Each result
 * row opens the file on click, or **reveals** it in the tree (lazy-expanding every
 * ancestor folder, then scrolling + briefly highlighting the row).
 */
function FileTree({ repoPath }: { repoPath: string }) {
  const openFileFromTree = useStore((s) => s.openFileFromTree);
  const copyToClipboard = useStore((s) => s.copyToClipboard);
  const platform = useStore((s) => s.platform);
  // Git working-tree status for this repo (#252): repo-relative path → "A"|"M"|"D".
  // Undefined = not loaded / non-git → no coloring. The map is shared in the store so
  // every FileTree instance for a repo reads one fetch; it's refreshed on busy→idle.
  const statusMap = useStore((s) => s.fileStatuses[repoPath]);
  const refreshFileStatuses = useStore((s) => s.refreshFileStatuses);
  // Precompute the folder roll-up once per status-map change so each folder row's
  // tint is an O(1) lookup rather than a re-scan of the whole map.
  const folderRollup = useMemo(
    () => buildFolderRollup(statusMap ?? {}),
    [statusMap],
  );
  // Children keyed by directory path ("" = repo root); a missing key = not yet loaded.
  const [children, setChildren] = useState<Record<string, DirEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<FileMenu | null>(null);
  const [nonce, setNonce] = useState(0);
  // Paths with an in-flight `list_dir` — guards against double-loading on re-render.
  const inFlight = useRef<Set<string>>(new Set());

  // Search state (#202): the raw input, its debounced value, and the two result sets.
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [fileHits, setFileHits] = useState<string[]>([]);
  const [fileCapped, setFileCapped] = useState(false);
  const [contentRes, setContentRes] = useState<ContentSearchResult | null>(
    null,
  );
  const [searching, setSearching] = useState(false);
  // The file path being revealed in the tree — drives the scroll-to + highlight.
  const [revealTarget, setRevealTarget] = useState<string | null>(null);
  const revealRef = useRef<HTMLButtonElement | null>(null);

  // Fetch one directory level (idempotent while a request is in flight).
  const load = useCallback(
    (path: string) => {
      if (inFlight.current.has(path)) return;
      inFlight.current.add(path);
      void listDir(repoPath, path)
        .then((list) => setChildren((prev) => ({ ...prev, [path]: list })))
        .catch(() => setChildren((prev) => ({ ...prev, [path]: [] })))
        .finally(() => inFlight.current.delete(path));
    },
    [repoPath],
  );

  // Reset and reload the root whenever the repo changes or the user refreshes.
  useEffect(() => {
    inFlight.current = new Set();
    setChildren({});
    setExpanded(new Set());
    load("");
  }, [repoPath, nonce, load]);

  // Refresh this repo's git status coloring (#252) on mount, on repo change, and when
  // the user hits Refresh (`nonce`) — so opening the tree shows current state at once,
  // even with no agent running. (Busy→idle edges refresh it via the store scheduler.)
  useEffect(() => {
    void refreshFileStatuses(repoPath);
  }, [repoPath, nonce, refreshFileStatuses]);

  // Clear the search when the repo changes (a stale query shouldn't carry over).
  useEffect(() => {
    setQuery("");
    setDebounced("");
  }, [repoPath]);

  // Debounce the typed query before searching.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  // Run the filename + content searches in parallel on the debounced query; an empty
  // query clears the results so the tree shows again. Latest-wins via `cancelled`.
  useEffect(() => {
    if (!debounced) {
      setFileHits([]);
      setFileCapped(false);
      setContentRes(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setFileHits([]);
    setContentRes(null);
    const fileP = searchFiles(repoPath, debounced, undefined, FILE_RESULT_LIMIT)
      .then((hits) => {
        if (cancelled) return;
        setFileHits(hits);
        setFileCapped(hits.length >= FILE_RESULT_LIMIT);
      })
      .catch(() => {
        if (cancelled) return;
        setFileHits([]);
        setFileCapped(false);
      });
    const contentP = searchFileContents(
      repoPath,
      debounced,
      CONTENT_RESULT_LIMIT,
    )
      .then((res) => {
        if (!cancelled) setContentRes(res);
      })
      .catch(() => {
        if (!cancelled) setContentRes({ matches: [], truncated: false });
      });
    void Promise.allSettled([fileP, contentP]).then(() => {
      if (!cancelled) setSearching(false);
    });
    return () => {
      cancelled = true;
    };
  }, [debounced, repoPath]);

  // Dismiss the context menu on Escape.
  useEffect(() => {
    if (!menu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  // Once a reveal target is set (and the tree re-rendered with its ancestors expanded),
  // scroll the row into view and clear the transient highlight after a moment.
  useEffect(() => {
    if (!revealTarget) return;
    const raf = requestAnimationFrame(() => {
      revealRef.current?.scrollIntoView({ block: "center" });
    });
    const clear = setTimeout(() => setRevealTarget(null), 1800);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(clear);
    };
  }, [revealTarget, children, expanded]);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        if (children[path] === undefined) load(path); // lazy first-open fetch
      }
      return next;
    });
  };

  const openFile = (file: string) =>
    void openFileFromTree(repoPath, file, "markdown");

  // Reveal a result in the tree: lazy-load every ancestor level (so the row renders),
  // expand them, leave the results view, then trigger the scroll-to + highlight (#202).
  const revealInTree = useCallback(
    async (path: string) => {
      const parts = path.split("/");
      const ancestors: string[] = [];
      let acc = "";
      for (let i = 0; i < parts.length - 1; i++) {
        const seg = parts[i] ?? "";
        acc = acc ? `${acc}/${seg}` : seg;
        ancestors.push(acc);
      }
      const loaded: Record<string, DirEntry[]> = {};
      for (const dir of ["", ...ancestors]) {
        loaded[dir] = await listDir(repoPath, dir).catch(() => []);
      }
      setChildren((prev) => ({ ...prev, ...loaded }));
      setExpanded((prev) => new Set([...prev, ...ancestors]));
      setQuery("");
      setDebounced("");
      setRevealTarget(path);
    },
    [repoPath],
  );

  const openMenu = (event: ReactMouseEvent, file: string) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 200)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 200)),
      file,
    });
  };

  // Split a snippet around the (case-insensitive) match, wrapping each hit in <mark>.
  const renderSnippet = (snippet: string, q: string): ReactNode => {
    const needle = q.toLowerCase();
    if (!needle) return snippet;
    const lower = snippet.toLowerCase();
    const out: ReactNode[] = [];
    let i = 0;
    let key = 0;
    while (i < snippet.length) {
      const idx = lower.indexOf(needle, i);
      if (idx === -1) {
        out.push(snippet.slice(i));
        break;
      }
      if (idx > i) out.push(snippet.slice(i, idx));
      out.push(
        <mark key={key++} className={styles.mark}>
          {snippet.slice(idx, idx + needle.length)}
        </mark>,
      );
      i = idx + needle.length;
    }
    return out;
  };

  // Render one directory level; recurses into expanded folders. A not-yet-loaded
  // level shows a brief "Loading…" hint, an empty one nothing (root handled below).
  const renderLevel = (path: string, depth: number): ReactNode => {
    const entries = children[path];
    if (entries === undefined) {
      return (
        <p
          className={styles.hint}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          Loading…
        </p>
      );
    }
    const indent = { paddingLeft: `${8 + depth * 14}px` };
    const rows = entries.map((node) => {
      if (node.is_dir) {
        const isOpen = expanded.has(node.path);
        const Chevron = isOpen ? ChevronDown : ChevronRight;
        const FolderIcon = isOpen ? FolderOpen : Folder;
        // A folder is tinted in its highest-severity descendant's color (#252) — so a
        // collapsed folder still shows that something inside it changed (red wins).
        const cls = statusClass(folderRollup.get(node.path));
        return (
          <div key={node.path}>
            <button
              type="button"
              className={`${styles.row}${cls ? ` ${cls}` : ""}`}
              style={indent}
              onClick={() => toggle(node.path)}
              title={node.path}
            >
              <Chevron
                size={13}
                strokeWidth={1.5}
                className={styles.chevron}
                aria-hidden
              />
              <FolderIcon
                size={13}
                strokeWidth={1.5}
                className={styles.folderIcon}
                aria-hidden
              />
              <span className={styles.name}>{node.name}</span>
            </button>
            {isOpen ? renderLevel(node.path, depth + 1) : null}
          </div>
        );
      }
      const isRevealed = node.path === revealTarget;
      // Tint the file name + icon by its working-tree status (#252): green = new,
      // yellow = edited; unchanged files keep the default styling.
      const cls = statusClass(statusMap?.[node.path]);
      return (
        <button
          key={node.path}
          ref={isRevealed ? revealRef : undefined}
          type="button"
          className={`${styles.row}${isRevealed ? ` ${styles.revealed}` : ""}${cls ? ` ${cls}` : ""}`}
          style={indent}
          onClick={() => openFile(node.path)}
          onContextMenu={(event) => openMenu(event, node.path)}
          title={node.path}
        >
          <FileText
            size={13}
            strokeWidth={1.5}
            className={styles.fileIcon}
            aria-hidden
          />
          <span className={styles.name}>{node.name}</span>
        </button>
      );
    });
    // Deleted files at this level (#252): a file removed from a folder that still
    // renders gets a red, struck-through, non-openable "ghost" row so the user sees
    // *what* was removed in place. Appended after the real entries, sorted by name.
    // (A deletion whose own parent directory no longer exists shows only via the red
    // ancestor roll-up — acceptable, since that level never renders.)
    const existing = new Set(entries.map((e) => e.name));
    const ghosts = deletedChildrenAt(statusMap ?? {}, path, existing).map(
      (name) => {
        const rel = path ? `${path}/${name}` : name;
        return (
          <div
            key={`ghost:${rel}`}
            className={styles.ghost}
            style={indent}
            title={`${rel} (deleted)`}
          >
            <FileText
              size={13}
              strokeWidth={1.5}
              className={styles.fileIcon}
              aria-hidden
            />
            <span className={styles.name}>{name}</span>
          </div>
        );
      },
    );
    return ghosts.length > 0 ? [...rows, ...ghosts] : rows;
  };

  // The search results view (#202) — shown while a (debounced) query is active.
  const renderResults = (): ReactNode => {
    const fileCount = fileHits.length;
    const matches = contentRes?.matches ?? [];
    const nothing = !searching && fileCount === 0 && matches.length === 0;
    return (
      <div className={styles.results}>
        <p className={styles.resultCount}>
          {searching
            ? "Searching…"
            : `${fileCount} file${fileCount === 1 ? "" : "s"}, ${matches.length} match${matches.length === 1 ? "" : "es"}`}
        </p>

        {nothing ? <p className={styles.hint}>No matches.</p> : null}

        {fileCount > 0 ? (
          <div className={styles.group}>
            <div className={styles.groupHeader}>Files</div>
            {fileHits.map((path) => (
              <div key={path} className={styles.result}>
                <button
                  type="button"
                  className={styles.resultMain}
                  onClick={() => openFile(path)}
                  title={`Open ${path}`}
                >
                  <FileText
                    size={13}
                    strokeWidth={1.5}
                    className={styles.fileIcon}
                    aria-hidden
                  />
                  <span className={styles.resultPath}>{path}</span>
                </button>
                <button
                  type="button"
                  className={styles.revealBtn}
                  onClick={() => void revealInTree(path)}
                  title="Reveal in tree"
                  aria-label="Reveal in tree"
                >
                  <Locate size={13} strokeWidth={1.5} />
                </button>
              </div>
            ))}
            {fileCapped ? (
              <p className={styles.capNote}>
                More filename matches not shown — refine your search.
              </p>
            ) : null}
          </div>
        ) : null}

        {matches.length > 0 ? (
          <div className={styles.group}>
            <div className={styles.groupHeader}>In files</div>
            {matches.map((m, i) => (
              <div key={`${m.path}:${m.line}:${i}`} className={styles.result}>
                <button
                  type="button"
                  className={styles.resultContent}
                  onClick={() => openFile(m.path)}
                  title={`Open ${m.path}:${m.line}`}
                >
                  <div className={styles.contentHead}>
                    <FileText
                      size={13}
                      strokeWidth={1.5}
                      className={styles.fileIcon}
                      aria-hidden
                    />
                    <span className={styles.resultPath}>{m.path}</span>
                    <span className={styles.resultLine}>:{m.line}</span>
                  </div>
                  <code className={styles.snippet}>
                    {renderSnippet(m.snippet, debounced)}
                  </code>
                </button>
                <button
                  type="button"
                  className={styles.revealBtn}
                  onClick={() => void revealInTree(m.path)}
                  title="Reveal in tree"
                  aria-label="Reveal in tree"
                >
                  <Locate size={13} strokeWidth={1.5} />
                </button>
              </div>
            ))}
            {contentRes?.truncated ? (
              <p className={styles.capNote}>
                More content matches not shown — refine your search.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const root = children[""];

  return (
    <div className={styles.tree}>
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Search
            size={12}
            strokeWidth={1.5}
            className={styles.searchIcon}
            aria-hidden
          />
          <input
            className={styles.searchInput}
            type="text"
            value={query}
            spellCheck={false}
            {...noAutoCapitalize}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search files & contents…"
            aria-label="Search files and contents"
          />
          {query ? (
            <button
              type="button"
              className={styles.clear}
              onClick={() => setQuery("")}
              title="Clear search"
              aria-label="Clear search"
            >
              <X size={12} strokeWidth={1.5} />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className={styles.refresh}
          onClick={() => setNonce((n) => n + 1)}
          title="Refresh file list"
          aria-label="Refresh file list"
        >
          <RefreshCw size={12} strokeWidth={1.5} />
        </button>
      </div>
      <div className={styles.body}>
        {debounced ? (
          renderResults()
        ) : root === undefined ? (
          <p className={styles.hint}>Loading…</p>
        ) : root.length === 0 ? (
          <p className={styles.hint}>No files in this repo.</p>
        ) : (
          renderLevel("", 0)
        )}
      </div>

      {menu ? (
        <>
          <div
            className={styles.menuOverlay}
            onClick={() => setMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu(null);
            }}
          />
          <div
            className={styles.menu}
            style={{ left: menu.x, top: menu.y }}
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => {
                openFile(menu.file);
                setMenu(null);
              }}
            >
              Open in file viewer
            </button>
            {menu.file.toLowerCase().endsWith(".md") ? (
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={() => {
                  void openFileFromTree(repoPath, menu.file, "kanban");
                  setMenu(null);
                }}
              >
                Open as Kanban board
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => {
                void revealPath(joinPath(platform, repoPath, menu.file));
                setMenu(null);
              }}
            >
              {revealLabel(platform)}
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => {
                void copyToClipboard(
                  joinPath(platform, repoPath, menu.file),
                  "path",
                );
                setMenu(null);
              }}
            >
              Copy absolute path
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => {
                void copyToClipboard(menu.file, "path");
                setMenu(null);
              }}
            >
              Copy relative path
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default FileTree;
