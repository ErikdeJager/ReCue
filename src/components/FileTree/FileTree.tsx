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
import { splitPath } from "../../paths";
import { joinPath, revealLabel } from "../../platform";
import { useStore } from "../../store";
import type { FileStatusCode } from "../../types";
import { buildFolderRollup, deletedChildrenAt, isIgnored } from "./fileStatus";
import styles from "./FileTree.module.css";

/** Map a working-tree status to its tint class (green/yellow/red, or dimmed gray for
 * gitignored #270), or "" when the path is unchanged. Drives file/folder coloring (#252). */
function statusClass(status: FileStatusCode | undefined): string {
  if (status === "A") return styles.statusAdded ?? "";
  if (status === "M") return styles.statusModified ?? "";
  if (status === "D") return styles.statusDeleted ?? "";
  if (status === "I") return styles.statusIgnored ?? "";
  return "";
}

/** Repo-relative directory of a file path (`""` for a root file) — the directory an
 * OS file dropped onto that file row would enter (#253). */
function parentDir(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

/** Right-click menu state: the cursor position + the row the menu targets and
 * whether it's a folder (folders get New folder… / Delete folder; files get the
 * open/reveal/copy items + Delete) (#184/#267). */
interface FileMenu {
  x: number;
  y: number;
  path: string;
  isDir: boolean;
}

/** Inline menu step (#267/#291): the base item list, the New-folder name input, the
 * Rename name input (#291), or the delete confirm (only used when confirm-destructive
 * is on). */
type MenuMode = "menu" | "newFolder" | "rename" | "confirmDelete";

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
 * path / Copy relative path (#184) / Add to .gitignore (#312) / Delete (#267).
 * Right-clicking a **folder** offers New folder… / Rename… / Reveal in Finder / Copy
 * absolute path / Copy relative path (#291) / Add to .gitignore (#312) / Delete folder
 * (#267). Deletes are confirm-gated by the Settings
 * confirm-destructive toggle (#103) and remove recursively; the tree refreshes in
 * place after any create/delete (the per-repo `fileTreeRefresh` signal, #253 pattern).
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
  const createFolder = useStore((s) => s.createFolder);
  const deleteTreePath = useStore((s) => s.deleteTreePath);
  const renameTreePath = useStore((s) => s.renameTreePath);
  const addToGitignore = useStore((s) => s.addToGitignore);
  const confirmDestructive = useStore((s) => s.settings.confirmDestructive);
  const platform = useStore((s) => s.platform);
  // Git working-tree status for this repo (#252): repo-relative path → "A"|"M"|"D"|"I"
  // ("I" = gitignored, #270). Undefined = not loaded / non-git → no coloring. The map is
  // shared in the store so every FileTree instance for a repo reads one fetch; it's
  // refreshed on busy→idle.
  const statusMap = useStore((s) => s.fileStatuses[repoPath]);
  const refreshFileStatuses = useStore((s) => s.refreshFileStatuses);
  // Register this tree so the disk-change visibility poll (#264) only re-lists/re-tints
  // repos with an open tree (bounded churn). Ref-counted, so several trees for the same
  // repo coexist and StrictMode's double-mount nets out correctly.
  const registerFileTree = useStore((s) => s.registerFileTree);
  const unregisterFileTree = useStore((s) => s.unregisterFileTree);
  // Precompute the folder roll-up once per status-map change so each folder row's
  // tint is an O(1) lookup rather than a re-scan of the whole map.
  const folderRollup = useMemo(
    () => buildFolderRollup(statusMap ?? {}),
    [statusMap],
  );
  // OS file-drag drop target (#253): when it points at this repo, the dir (`""` = root)
  // a drop would land in is highlighted. Refresh signal bumped after a successful move.
  const dropTarget = useStore((s) =>
    s.fileDropTarget?.repo === repoPath ? s.fileDropTarget.dir : null,
  );
  // Re-list signal: bumped after an OS drop-move (#253) and on the disk-change poll /
  // busy→idle edge (#264) to surface files created/removed on disk.
  const moveRefresh = useStore((s) => s.fileTreeRefresh[repoPath] ?? 0);
  // Children keyed by directory path ("" = repo root); a missing key = not yet loaded.
  const [children, setChildren] = useState<Record<string, DirEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<FileMenu | null>(null);
  // The inline menu step + the New-folder name draft (#267); reset whenever the menu
  // opens or closes so a prior input never leaks into the next right-click.
  const [menuMode, setMenuMode] = useState<MenuMode>("menu");
  const [newFolderName, setNewFolderName] = useState("");
  const newFolderRef = useRef<HTMLInputElement | null>(null);
  // The Rename name draft + its input (#291); reset with the menu like the New-folder
  // draft so a prior rename never leaks into the next right-click.
  const [renameName, setRenameName] = useState("");
  const renameRef = useRef<HTMLInputElement | null>(null);
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

  // Register/unregister this open tree with the store so the disk-change poll (#264)
  // refreshes only repos that actually have a tree mounted.
  useEffect(() => {
    registerFileTree(repoPath);
    return () => unregisterFileTree(repoPath);
  }, [repoPath, registerFileTree, unregisterFileTree]);

  // When the re-list signal bumps — an OS file-drop move (#253) or the disk-change
  // poll / busy→idle edge (#264) — reload every currently-loaded level so files
  // created/removed on disk appear **without** a full reset (expansion state and the
  // scroll position are preserved; rows are keyed by path so React reconciles in place).
  // `childrenRef` mirrors `children` so the effect can read the latest loaded levels
  // without depending on `children` (which would re-run it on every load).
  const childrenRef = useRef(children);
  childrenRef.current = children;
  const lastMoveRefresh = useRef(moveRefresh);
  useEffect(() => {
    if (moveRefresh === lastMoveRefresh.current) return; // mount / no move yet
    lastMoveRefresh.current = moveRefresh;
    for (const dir of Object.keys(childrenRef.current)) {
      inFlight.current.delete(dir); // force a re-fetch of this level
      load(dir);
    }
  }, [moveRefresh, load]);

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

  // Close the context menu and reset its inline step/draft (#267).
  const closeMenu = useCallback(() => {
    setMenu(null);
    setMenuMode("menu");
    setNewFolderName("");
    setRenameName("");
  }, []);

  // Dismiss the context menu on Escape.
  useEffect(() => {
    if (!menu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, closeMenu]);

  // Focus the New-folder input when that step opens so the user can type at once.
  useEffect(() => {
    if (menu && menuMode === "newFolder") newFolderRef.current?.focus();
  }, [menu, menuMode]);

  // Focus + select the Rename input when that step opens (#291): the field is seeded
  // with the current name, so selecting it lets the user type a replacement at once.
  useEffect(() => {
    if (menu && menuMode === "rename") {
      const input = renameRef.current;
      input?.focus();
      input?.select();
    }
  }, [menu, menuMode]);

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

  const openMenu = (event: ReactMouseEvent, path: string, isDir: boolean) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuMode("menu");
    setNewFolderName("");
    setRenameName("");
    setMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 200)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 200)),
      path,
      isDir,
    });
  };

  // Create a subfolder of the menu's target folder, then expand + reload that level so
  // the new folder shows in place (the store also bumps `fileTreeRefresh`). A blank /
  // separator-only name is a no-op; the backend rejects reserved / invalid names.
  const submitNewFolder = () => {
    if (!menu) return;
    const name = newFolderName.trim();
    if (!name || name.includes("/") || name.includes("\\")) return;
    const parent = menu.path;
    const target = parent ? `${parent}/${name}` : name;
    closeMenu();
    void createFolder(repoPath, target).then(() => {
      setExpanded((prev) => new Set([...prev, parent]));
      inFlight.current.delete(parent);
      load(parent);
    });
  };

  // Rename the menu's target file/folder in place (#291), then reload its parent level
  // so the new name shows without a full reset (siblings' expansion preserved; the
  // store also bumps `fileTreeRefresh`). A blank / separator-only name is a no-op, an
  // unchanged name just closes, and the backend rejects reserved / colliding names.
  const submitRename = () => {
    if (!menu) return;
    const name = renameName.trim();
    if (!name || name.includes("/") || name.includes("\\")) return;
    const { dir, base } = splitPath(menu.path);
    if (name === base) {
      closeMenu();
      return;
    }
    const to = dir ? `${dir}/${name}` : name;
    const parent = dir;
    closeMenu();
    void renameTreePath(repoPath, menu.path, to).then(() => {
      inFlight.current.delete(parent);
      load(parent);
    });
  };

  // Delete the menu's target row (file or folder). Confirm-gated by the Settings
  // confirm-destructive toggle (#103): on → step to the inline confirm; off → delete now.
  const requestDelete = () => {
    if (!menu) return;
    if (confirmDestructive) {
      setMenuMode("confirmDelete");
      return;
    }
    const path = menu.path;
    closeMenu();
    void deleteTreePath(repoPath, path);
  };

  const confirmDelete = () => {
    if (!menu) return;
    const path = menu.path;
    closeMenu();
    void deleteTreePath(repoPath, path);
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
        // collapsed folder still shows that something inside it changed (red wins). A
        // tracked change always wins; otherwise a folder whose *own* path is gitignored
        // is dimmed gray (#270) — an ignored child never grays a tracked parent.
        const cls = statusClass(
          folderRollup.get(node.path) ??
            (isIgnored(statusMap, node.path) ? "I" : undefined),
        );
        // OS-drop target (#253): a drop on this folder row lands inside it; highlight
        // it while the drag hovers here.
        const drop = dropTarget === node.path ? ` ${styles.dropTarget}` : "";
        return (
          <div key={node.path}>
            <button
              type="button"
              className={`${styles.row}${cls ? ` ${cls}` : ""}${drop}`}
              style={indent}
              onClick={() => toggle(node.path)}
              onContextMenu={(event) => openMenu(event, node.path, true)}
              title={node.path}
              data-filetree-droptarget={node.path}
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
      // yellow = edited, dimmed gray = gitignored (#270); unchanged files keep the
      // default styling.
      const cls = statusClass(statusMap?.[node.path]);
      return (
        <button
          key={node.path}
          ref={isRevealed ? revealRef : undefined}
          type="button"
          className={`${styles.row}${isRevealed ? ` ${styles.revealed}` : ""}${cls ? ` ${cls}` : ""}`}
          style={indent}
          onClick={() => openFile(node.path)}
          onContextMenu={(event) => openMenu(event, node.path, false)}
          title={node.path}
          // A drop on a file row lands in its containing directory (#253).
          data-filetree-droptarget={parentDir(node.path)}
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
            // A drop on a ghost row lands in this directory level (#253).
            data-filetree-droptarget={path}
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
    <div
      className={`${styles.tree}${dropTarget === "" ? ` ${styles.dropTarget}` : ""}`}
      // OS file-drop target markers (#253): the whole tree is the repo-root drop zone;
      // `data-filetree-repo` lets the window-global drop listener resolve which repo a
      // folder/file row (a descendant) belongs to. A drop on a row's own
      // `data-filetree-droptarget` (nearer via `closest`) wins over this root marker.
      data-filetree-repo={repoPath}
      data-filetree-droptarget=""
    >
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
            onClick={closeMenu}
            onContextMenu={(event) => {
              event.preventDefault();
              closeMenu();
            }}
          />
          <div
            className={styles.menu}
            style={{ left: menu.x, top: menu.y }}
            role="menu"
          >
            {menuMode === "newFolder" ? (
              // New-folder name input (#267): Enter creates, Escape (global) cancels.
              <div className={styles.menuForm}>
                <input
                  ref={newFolderRef}
                  className={styles.menuInput}
                  type="text"
                  value={newFolderName}
                  spellCheck={false}
                  {...noAutoCapitalize}
                  placeholder="New folder name"
                  aria-label="New folder name"
                  onChange={(event) =>
                    setNewFolderName(event.currentTarget.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitNewFolder();
                    }
                  }}
                />
                <button
                  type="button"
                  className={styles.menuFormBtn}
                  disabled={!newFolderName.trim()}
                  onClick={submitNewFolder}
                >
                  Create
                </button>
              </div>
            ) : menuMode === "rename" ? (
              // Rename name input (#291): Enter renames, Escape (global) cancels. The
              // field is seeded with the current name (focused + selected on open).
              <div className={styles.menuForm}>
                <input
                  ref={renameRef}
                  className={styles.menuInput}
                  type="text"
                  value={renameName}
                  spellCheck={false}
                  {...noAutoCapitalize}
                  placeholder="Rename folder"
                  aria-label="Rename folder"
                  onChange={(event) => setRenameName(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitRename();
                    }
                  }}
                />
                <button
                  type="button"
                  className={styles.menuFormBtn}
                  disabled={!renameName.trim()}
                  onClick={submitRename}
                >
                  Rename
                </button>
              </div>
            ) : menuMode === "confirmDelete" ? (
              <button
                type="button"
                role="menuitem"
                className={styles.menuItemDanger}
                onClick={confirmDelete}
              >
                {menu.isDir ? "Delete folder & its contents?" : "Delete file?"}
              </button>
            ) : menu.isDir ? (
              // ── Folder menu (#267 + Rename / Reveal / Copy paths #291) ──
              <>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => setMenuMode("newFolder")}
                >
                  New folder…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    setRenameName(splitPath(menu.path).base);
                    setMenuMode("rename");
                  }}
                >
                  Rename…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    void revealPath(joinPath(platform, repoPath, menu.path));
                    closeMenu();
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
                      joinPath(platform, repoPath, menu.path),
                      "path",
                    );
                    closeMenu();
                  }}
                >
                  Copy absolute path
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    void copyToClipboard(menu.path, "path");
                    closeMenu();
                  }}
                >
                  Copy relative path
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    void addToGitignore(repoPath, menu.path);
                    closeMenu();
                  }}
                >
                  Add to .gitignore
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItemDanger}
                  onClick={requestDelete}
                >
                  Delete folder
                </button>
              </>
            ) : (
              // ── File menu (#184 + Delete #267) ──
              <>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    openFile(menu.path);
                    closeMenu();
                  }}
                >
                  Open in file viewer
                </button>
                {menu.path.toLowerCase().endsWith(".md") ? (
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    onClick={() => {
                      void openFileFromTree(repoPath, menu.path, "kanban");
                      closeMenu();
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
                    void revealPath(joinPath(platform, repoPath, menu.path));
                    closeMenu();
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
                      joinPath(platform, repoPath, menu.path),
                      "path",
                    );
                    closeMenu();
                  }}
                >
                  Copy absolute path
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    void copyToClipboard(menu.path, "path");
                    closeMenu();
                  }}
                >
                  Copy relative path
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    void addToGitignore(repoPath, menu.path);
                    closeMenu();
                  }}
                >
                  Add to .gitignore
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItemDanger}
                  onClick={requestDelete}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default FileTree;
