import { type MouseEvent as ReactMouseEvent, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  RefreshCw,
} from "lucide-react";

import { listFiles, revealPath } from "../../ipc";
import { useStore } from "../../store";
import { buildFileTree, type FileTreeNode } from "./buildFileTree";
import styles from "./FileTree.module.css";

/** Right-click menu state: the cursor position + the file the menu targets. */
interface FileMenu {
  x: number;
  y: number;
  file: string;
}

/**
 * A collapsible repo file tree (#167) — a first-class, repo-scoped view rendered in
 * the sidebar, an Overview column, and a Canvas panel (and a Canvas-template block),
 * exactly like the diff panel. It loads the backend's **flat** `list_files` result
 * (already filtered: no hidden/heavy/binary files, capped at 500 / depth 8) and
 * builds the nested tree **client-side** via the pure `buildFileTree`. Folders
 * expand/collapse on click (state lives in local component state, not persisted);
 * clicking a file opens it in the file viewer; right-clicking a file offers
 * Open in file viewer / Open as Kanban board (`.md` only) / Reveal in Finder / Copy
 * path. Folders have no menu. No backend change — same data source as `FilePicker`.
 */
function FileTree({ repoPath }: { repoPath: string }) {
  const addOverviewPanel = useStore((s) => s.addOverviewPanel);
  const copyToClipboard = useStore((s) => s.copyToClipboard);
  const [tree, setTree] = useState<FileTreeNode[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<FileMenu | null>(null);
  const [nonce, setNonce] = useState(0);

  // Load (and reload on manual refresh) the repo's flat file list → nested tree.
  useEffect(() => {
    let cancelled = false;
    setTree(null);
    void listFiles(repoPath)
      .then((list) => {
        if (!cancelled) setTree(buildFileTree(list));
      })
      .catch(() => {
        if (!cancelled) setTree([]);
      });
    return () => {
      cancelled = true;
    };
  }, [repoPath, nonce]);

  // Dismiss the context menu on Escape.
  useEffect(() => {
    if (!menu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const openFile = (file: string) =>
    void addOverviewPanel(repoPath, "markdown", file);

  const openMenu = (event: ReactMouseEvent, file: string) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 200)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 160)),
      file,
    });
  };

  const renderNodes = (nodes: FileTreeNode[], depth: number) =>
    nodes.map((node) => {
      const indent = { paddingLeft: `${8 + depth * 14}px` };
      if (node.type === "folder") {
        const isOpen = expanded.has(node.path);
        const Chevron = isOpen ? ChevronDown : ChevronRight;
        const FolderIcon = isOpen ? FolderOpen : Folder;
        return (
          <div key={node.path}>
            <button
              type="button"
              className={styles.row}
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
            {isOpen && node.children
              ? renderNodes(node.children, depth + 1)
              : null}
          </div>
        );
      }
      return (
        <button
          key={node.path}
          type="button"
          className={styles.row}
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

  return (
    <div className={styles.tree}>
      <div className={styles.toolbar}>
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
        {tree === null ? (
          <p className={styles.hint}>Loading…</p>
        ) : tree.length === 0 ? (
          <p className={styles.hint}>No files in this repo.</p>
        ) : (
          renderNodes(tree, 0)
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
                  void addOverviewPanel(repoPath, "kanban", menu.file);
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
                void revealPath(`${repoPath}/${menu.file}`);
                setMenu(null);
              }}
            >
              Reveal in Finder
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => {
                void copyToClipboard(`${repoPath}/${menu.file}`, "path");
                setMenu(null);
              }}
            >
              Copy path
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default FileTree;
