import { useEffect, useRef, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { FileDiff, FileText, Plus, X } from "lucide-react";

import { listFiles } from "../../ipc";
import { repoName, sessionLabel } from "../../paths";
import {
  dedupeBranchLabels,
  REPO_PALETTE,
  repoColor,
  repoOrder,
  useStore,
} from "../../store";
import type { SessionView } from "../../types";
import BusyIndicator from "../BusyIndicator/BusyIndicator";
import FilePicker from "../FilePicker/FilePicker";
import ViewSwitch from "../ViewSwitch/ViewSwitch";
import styles from "./Sidebar.module.css";

interface SessionRowProps {
  session: SessionView;
  /** Primary label: the (deduped) branch, or folder name for a non-git repo. */
  label: string;
  selected: boolean;
  /** The session is currently working (#42). */
  busy: boolean;
  onSelect: () => void;
  onRemove: () => void;
  /** Set (or clear, when blank) the session's custom name (#57). */
  onRename: (name: string) => void;
}

function SessionRow({
  session,
  label,
  selected,
  busy,
  onSelect,
  onRemove,
  onRename,
}: SessionRowProps) {
  // Draggable into Canvas (#47); a small activation distance keeps the click
  // (select) working. The drag snaps back outside Canvas's drop zones.
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `session:${session.id}`,
      data: {
        kind: "session",
        sessionId: session.id,
        repoPath: session.repoPath,
      },
    });
  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  // Right-click menu (Rename / Remove, #57) + the inline rename editor.
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const committed = useRef(false);

  // Escape closes the row menu (keyboard-dismissable, like the repo menu #54).
  useEffect(() => {
    if (!menu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const beginRename = () => {
    setDraft(session.name ?? "");
    committed.current = false;
    setEditing(true);
  };
  // Enter / blur commit; Escape cancels. The guard avoids a double-commit when
  // Enter both fires and blurs the (now-unmounting) input.
  const finishRename = () => {
    if (committed.current) return;
    committed.current = true;
    setEditing(false);
    onRename(draft);
  };
  const cancelRename = () => {
    committed.current = true;
    setEditing(false);
  };

  // Unified label rule (#67): a custom name is primary with the branch as the
  // subtitle; with no name the branch (the deduped `label`, folder name when
  // non-git) is primary and there is no subtitle.
  const { primary, subtitle } = sessionLabel(session.name, label);

  return (
    <div
      ref={setNodeRef}
      className={`${styles.row} ${selected ? styles.rowSelected : ""} ${isDragging ? styles.rowDragging : ""}`}
      style={style}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setMenu({
          x: Math.max(8, Math.min(event.clientX, window.innerWidth - 160)),
          y: Math.max(8, Math.min(event.clientY, window.innerHeight - 96)),
        });
      }}
    >
      {editing ? (
        <input
          className={styles.renameInput}
          autoFocus
          value={draft}
          placeholder={label}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              finishRename();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancelRename();
            }
          }}
          onBlur={finishRename}
          aria-label="Rename session"
        />
      ) : (
        <button
          type="button"
          className={styles.rowMain}
          onClick={onSelect}
          {...attributes}
          {...listeners}
        >
          <span className={styles.rowPrimary}>{primary}</span>
          {subtitle && <span className={styles.rowSecondary}>{subtitle}</span>}
        </button>
      )}
      {/* Status ball (#55): always shown (dimmed when idle); the Remove ghost
          shows on hover to its right. */}
      <span className={styles.rowBusy}>
        <BusyIndicator busy={busy} />
      </span>
      <button
        type="button"
        className={styles.remove}
        onClick={onRemove}
        title="Remove (kill + forget)"
        aria-label="Remove session"
      >
        <X size={14} strokeWidth={1.5} />
      </button>

      {menu && (
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
                setMenu(null);
                beginRename();
              }}
            >
              Rename
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.menuItemDanger}
              onClick={() => {
                setMenu(null);
                onRemove();
              }}
            >
              Remove
            </button>
          </div>
        </>
      )}
    </div>
  );
}

interface FileRowProps {
  repoPath: string;
  /** Repo-relative file path. */
  file: string;
  onOpen: () => void;
  onClose: () => void;
}

/**
 * A file-viewer item in the sidebar tree (#45/#59): one per repo file panel
 * (`overviewPanels`, the single item source) — clickable (→ Overview), hover
 * close (×, removes the panel), and a dnd-kit draggable source that drops into
 * Canvas as a file viewer. The whole label is the drag handle; a small activation
 * distance keeps clicks working.
 */
function FileRow({ repoPath, file, onOpen, onClose }: FileRowProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `file:${repoPath}:${file}`,
      data: { kind: "file", repoPath, file },
    });
  const name = file.split("/").pop() || file;
  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      className={`${styles.fileRow} ${isDragging ? styles.fileRowDragging : ""}`}
      style={style}
    >
      <button
        type="button"
        className={styles.fileMain}
        onClick={onOpen}
        title={file}
        {...attributes}
        {...listeners}
      >
        <FileText
          size={13}
          strokeWidth={1.5}
          className={styles.fileIcon}
          aria-hidden
        />
        <span className={styles.fileName}>{name}</span>
      </button>
      <button
        type="button"
        className={styles.fileClose}
        onClick={onClose}
        title="Close file"
        aria-label={`Close ${name}`}
      >
        <X size={13} strokeWidth={1.5} />
      </button>
    </div>
  );
}

/**
 * A diff-viewer item in the sidebar tree (#59): a repo's diff panel as a
 * draggable row that drops into Canvas as a diff panel (`{kind:"diff"}`). Click
 * opens Overview; the × removes the panel (and its Overview column — they're
 * 1:1). Mirrors FileRow — the forward-looking rule: a new left-panel item type is
 * a draggable row + a `payloadToContent` case, draggable into Canvas by default.
 */
function DiffRow({
  repoPath,
  panelId,
  onOpen,
  onClose,
}: {
  repoPath: string;
  panelId: string;
  onOpen: () => void;
  onClose: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `diff:${repoPath}:${panelId}`,
      data: { kind: "diff", repoPath },
    });
  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      className={`${styles.fileRow} ${isDragging ? styles.fileRowDragging : ""}`}
      style={style}
    >
      <button
        type="button"
        className={styles.fileMain}
        onClick={onOpen}
        title="Diff"
        {...attributes}
        {...listeners}
      >
        <FileDiff
          size={13}
          strokeWidth={1.5}
          className={styles.fileIcon}
          aria-hidden
        />
        <span className={styles.fileName}>Diff</span>
      </button>
      <button
        type="button"
        className={styles.fileClose}
        onClick={onClose}
        title="Close diff viewer"
        aria-label="Close diff viewer"
      >
        <X size={13} strokeWidth={1.5} />
      </button>
    </div>
  );
}

/**
 * Left sidebar: New session button + sessions grouped by repository. Repos come
 * from persisted recents unioned with active-session repos, so a repo stays
 * listed (greyed, with a coral +) even when it has no active sessions.
 */
function Sidebar() {
  const sessions = useStore((s) => s.sessions);
  const recents = useStore((s) => s.recents);
  const branches = useStore((s) => s.branches);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const removeSession = useStore((s) => s.removeSession);
  const renameSession = useStore((s) => s.renameSession);
  const openNewSession = useStore((s) => s.openNewSession);
  const refreshBranches = useStore((s) => s.refreshBranches);
  const forgetRepo = useStore((s) => s.forgetRepo);
  const setView = useStore((s) => s.setView);
  const overviewRepoFilter = useStore((s) => s.overviewRepoFilter);
  const setOverviewRepoFilter = useStore((s) => s.setOverviewRepoFilter);
  const repoColors = useStore((s) => s.repoColors);
  const setRepoColor = useStore((s) => s.setRepoColor);
  const overviewPanels = useStore((s) => s.overviewPanels);
  const addOverviewPanel = useStore((s) => s.addOverviewPanel);
  const removeOverviewPanel = useStore((s) => s.removeOverviewPanel);
  const sessionBusy = useStore((s) => s.sessionBusy);

  // Right-click repo context menu (#31/#35), anchored at the cursor. `menuMode`
  // switches between the item list, the destructive Forget confirm, and the
  // color picker.
  const [menu, setMenu] = useState<{
    repo: string;
    x: number;
    y: number;
  } | null>(null);
  const [menuMode, setMenuMode] = useState<
    "menu" | "confirm" | "color" | "files"
  >("menu");
  // The repo's files while the menu is in "files" mode (#44); null = loading.
  const [fileList, setFileList] = useState<string[] | null>(null);
  const closeMenu = () => {
    setMenu(null);
    setMenuMode("menu");
  };

  const repos = repoOrder(recents, sessions);
  const reposKey = repos.join("\n");

  useEffect(() => {
    // Refresh branch labels only when the set of repos changes — not on every
    // session mutation (exit, output) that allocates a new sessions array.
    void refreshBranches();
  }, [refreshBranches, reposKey]);

  // Escape dismisses the context menu (keyboard-dismissable).
  useEffect(() => {
    if (!menu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(null);
        setMenuMode("menu");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  // Load the repo's files when the menu enters "files" mode (#44) — the same
  // repo-relative list the Focus Files tab uses.
  useEffect(() => {
    if (!menu || menuMode !== "files") return;
    let cancelled = false;
    setFileList(null);
    void listFiles(menu.repo)
      .then((list) => {
        if (!cancelled) setFileList(list);
      })
      .catch(() => {
        if (!cancelled) setFileList([]);
      });
    return () => {
      cancelled = true;
    };
  }, [menu, menuMode]);

  // Running (non-exited) agents in the menu's repo — gates the confirm step.
  const menuRunning = menu
    ? sessions.filter(
        (s) => s.repoPath === menu.repo && s.exitedCode === undefined,
      ).length
    : 0;

  return (
    <aside className={styles.sidebar} aria-label="Sessions">
      <button
        type="button"
        className={styles.newButton}
        onClick={() => openNewSession()}
      >
        <Plus size={16} strokeWidth={1.5} />
        New session
        <kbd className={styles.kbd}>⌘N</kbd>
      </button>

      <div className={styles.viewSwitch}>
        <ViewSwitch />
      </div>

      <div className={styles.repos}>
        {repos.length === 0 && (
          <p className={styles.emptyHint}>No repositories yet.</p>
        )}

        {repos.map((repo) => {
          const repoSessions = sessions.filter((s) => s.repoPath === repo);
          const isEmpty = repoSessions.length === 0;
          const isFiltered = overviewRepoFilter === repo;
          // Primary label = the repo's branch, or the folder name when non-git /
          // not yet known. All sessions in a group share it, so index duplicates.
          const baseLabel = (branches[repo] ?? "") || repoName(repo);
          const rowLabels = dedupeBranchLabels(
            repoSessions.map(() => baseLabel),
          );

          return (
            <div key={repo} className={styles.group}>
              <div
                className={`${styles.repoHeader} ${isEmpty ? styles.repoEmpty : ""}`}
                onContextMenu={(event) => {
                  event.preventDefault();
                  // Clamp so the menu — and the taller file picker it can become
                  // (#56) — stays on-screen near the viewport edges.
                  const x = Math.max(
                    8,
                    Math.min(event.clientX, window.innerWidth - 300),
                  );
                  const y = Math.max(
                    8,
                    Math.min(event.clientY, window.innerHeight - 360),
                  );
                  setMenu({ repo, x, y });
                  setMenuMode("menu");
                }}
              >
                {/* Left-click a repo title filters Overview to it (toggle);
                    right-click opens the #31 context menu. */}
                <button
                  type="button"
                  className={`${styles.repoTitle} ${isFiltered ? styles.repoActive : ""}`}
                  onClick={() => {
                    setOverviewRepoFilter(repo);
                    setView("overview");
                  }}
                  title={`Filter Overview to ${repoName(repo)}`}
                  aria-pressed={isFiltered}
                >
                  <span
                    className={styles.repoDot}
                    style={{ background: repoColor(repo, repoColors) }}
                  />
                  <span className={styles.repoName}>{repoName(repo)}</span>
                  {!isEmpty && (
                    <span className={styles.count}>{repoSessions.length}</span>
                  )}
                </button>
                <button
                  type="button"
                  className={`${styles.plus} ${isEmpty ? styles.plusCoral : ""}`}
                  onClick={() => openNewSession(repo)}
                  title="New session in this repo"
                  aria-label="New session in this repo"
                >
                  <Plus size={14} strokeWidth={1.5} />
                </button>
              </div>

              {repoSessions.map((session, i) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  // rowLabels has one entry per session; fallback satisfies
                  // noUncheckedIndexedAccess and is never reached at runtime.
                  label={rowLabels[i] ?? baseLabel}
                  selected={session.id === selectedId}
                  busy={sessionBusy[session.id] ?? false}
                  onSelect={() => select(session.id)}
                  onRemove={() => void removeSession(session.id)}
                  onRename={(name) => void renameSession(session.id, name)}
                />
              ))}

              {/* This repo's non-agent items (#59) — the same `overviewPanels`
                  Overview shows, 1:1: file + diff viewers. Each click opens
                  Overview, the × removes the item, and each is draggable into a
                  Canvas (file → file viewer, diff → diff panel). */}
              {(overviewPanels[repo] ?? []).map((panel) =>
                panel.kind === "diff" ? (
                  <DiffRow
                    key={panel.id}
                    repoPath={repo}
                    panelId={panel.id}
                    onOpen={() => setView("overview")}
                    onClose={() => void removeOverviewPanel(repo, panel.id)}
                  />
                ) : panel.file ? (
                  <FileRow
                    key={panel.id}
                    repoPath={repo}
                    file={panel.file}
                    onOpen={() => setView("overview")}
                    onClose={() => void removeOverviewPanel(repo, panel.id)}
                  />
                ) : null,
              )}
            </div>
          );
        })}
      </div>

      {menu && (
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
            {menuMode === "color" ? (
              <div className={styles.colorPicker}>
                <div className={styles.swatches}>
                  {REPO_PALETTE.map((hex) => {
                    const isCurrent = repoColor(menu.repo, repoColors) === hex;
                    return (
                      <button
                        key={hex}
                        type="button"
                        className={`${styles.swatch} ${isCurrent ? styles.swatchActive : ""}`}
                        style={{ background: hex }}
                        onClick={() => {
                          void setRepoColor(menu.repo, hex);
                          closeMenu();
                        }}
                        title={hex}
                        aria-pressed={isCurrent}
                        aria-label={`Set color ${hex}${isCurrent ? " (current)" : ""}`}
                      />
                    );
                  })}
                </div>
                <label className={styles.customColor}>
                  <span>Custom</span>
                  <input
                    type="color"
                    value={repoColor(menu.repo, repoColors)}
                    onChange={(event) =>
                      void setRepoColor(menu.repo, event.currentTarget.value)
                    }
                  />
                </label>
              </div>
            ) : menuMode === "files" ? (
              // Searchable file picker (#56) → open as an Overview file column (#44).
              <FilePicker
                files={fileList}
                onPick={(f) => {
                  // Opens it as the repo's single file item (#59, deduped in the
                  // store) — shows in both the sidebar and Overview.
                  void addOverviewPanel(menu.repo, "markdown", f);
                  setView("overview");
                  closeMenu();
                }}
              />
            ) : menuMode === "confirm" ? (
              <button
                type="button"
                role="menuitem"
                className={styles.menuDanger}
                onClick={() => {
                  void forgetRepo(menu.repo);
                  closeMenu();
                }}
              >
                Kill {menuRunning} agent{menuRunning === 1 ? "" : "s"} & forget?
              </button>
            ) : (
              <>
                {/* New session (#54): first item; mirrors the inline + button. */}
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    openNewSession(menu.repo);
                    closeMenu();
                  }}
                >
                  New session
                </button>
                <div className={styles.menuSeparator} role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    // Add the repo's diff item (#39/#59, deduped in the store);
                    // switch to Overview so the new column is visible. It now also
                    // appears in the sidebar and is draggable into a Canvas.
                    void addOverviewPanel(menu.repo, "diff");
                    setView("overview");
                    closeMenu();
                  }}
                >
                  Open diff viewer
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => setMenuMode("files")}
                >
                  Open file viewer…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => setMenuMode("color")}
                >
                  Change color…
                </button>
                {/* Destructive actions (#54): set apart and styled red. */}
                <div className={styles.menuSeparator} role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItemDanger}
                  onClick={() => {
                    // Confirm first only when agents are running in this folder.
                    if (menuRunning > 0) setMenuMode("confirm");
                    else {
                      void forgetRepo(menu.repo);
                      closeMenu();
                    }
                  }}
                >
                  Forget folder
                </button>
              </>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

export default Sidebar;
