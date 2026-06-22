import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  Clock,
  FileDiff,
  FileText,
  Folder,
  GitBranch,
  GitFork,
  Plus,
  Settings as SettingsIcon,
  Terminal as TerminalIcon,
  X,
} from "lucide-react";

import { listFiles, revealPath } from "../../ipc";
import { repoName, sessionLabel } from "../../paths";
import { formatFireTime } from "../../time";
import {
  dedupeBranchLabels,
  REPO_PALETTE,
  repoColor,
  repoOrder,
  useStore,
} from "../../store";
import type { ScheduledSession, SessionView } from "../../types";
import BusyIndicator from "../BusyIndicator/BusyIndicator";
import FilePicker from "../FilePicker/FilePicker";
import ViewSwitch from "../ViewSwitch/ViewSwitch";
import styles from "./Sidebar.module.css";

/** Shared right-click menu state for the non-agent sidebar rows (#132). Mirrors
 * `SessionRow`'s pattern — a cursor-positioned, viewport-clamped `{x,y}` that
 * Escape / overlay-click dismisses. Returns the open handler for the row's
 * `onContextMenu` and a `closeMenu` for the menu/overlay. */
function useRowMenu() {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);
  const openMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 160)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 96)),
    });
  };
  return { menu, openMenu, closeMenu: () => setMenu(null) };
}

/** One entry in a `RowContextMenu` (#132/#133). `danger` paints it red
 * (`menuItemDanger`) for destructive actions (Remove / Cancel); otherwise it
 * uses the neutral `menuItem` style (the worktree header's Reveal / Copy, #133). */
type RowMenuItem = { label: string; onActivate: () => void; danger?: boolean };

/** A minimal cursor-positioned context menu for the non-agent sidebar rows
 * (#132/#133): renders one or more `items`, each calling its `onActivate` and
 * closing the menu. The non-agent rows show a single red Remove (or Cancel)
 * item; the worktree header (#133) shows two neutral items (Reveal in Finder,
 * Copy absolute path). Reuses the `.menuOverlay` / `.menu` classes. */
function RowContextMenu({
  menu,
  items,
  onClose,
}: {
  menu: { x: number; y: number } | null;
  items: RowMenuItem[];
  onClose: () => void;
}) {
  if (!menu) return null;
  return (
    <>
      <div
        className={styles.menuOverlay}
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        className={styles.menu}
        style={{ left: menu.x, top: menu.y }}
        role="menu"
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={item.danger ? styles.menuItemDanger : styles.menuItem}
            onClick={() => {
              onClose();
              item.onActivate();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}

/** A pending scheduled-session row (#93/#94): a dnd-kit draggable item (drops into
 * Canvas as a scheduled panel), click selects/jumps to it (#79), × cancels. The
 * whole label is the drag handle; a small activation distance keeps clicks working.
 * Right-click opens a single-item **Cancel** menu (#132). */
function ScheduleRow({
  schedule,
  selected,
  onOpen,
  onCancel,
}: {
  schedule: ScheduledSession;
  selected: boolean;
  onOpen: () => void;
  onCancel: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `schedule:${schedule.id}`,
      data: {
        kind: "scheduled",
        scheduleId: schedule.id,
        repoPath: schedule.cwd,
      },
    });
  const label =
    schedule.name?.trim() || schedule.branch || repoName(schedule.cwd);
  const { menu, openMenu, closeMenu } = useRowMenu();
  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      className={`${styles.scheduleRow} ${selected ? styles.scheduleRowSelected : ""} ${isDragging ? styles.scheduleRowDragging : ""}`}
      style={style}
      title={`Scheduled for ${new Date(schedule.fire_at * 1000).toLocaleString()}`}
      onContextMenu={openMenu}
    >
      <button
        type="button"
        className={styles.scheduleMain}
        onClick={onOpen}
        {...attributes}
        {...listeners}
      >
        <Clock
          size={13}
          strokeWidth={1.5}
          className={styles.scheduleIcon}
          aria-hidden
        />
        <span className={styles.scheduleName}>{label}</span>
        <span className={styles.scheduleWhen}>
          {formatFireTime(schedule.fire_at)}
        </span>
      </button>
      <button
        type="button"
        className={styles.scheduleCancel}
        onClick={onCancel}
        title="Cancel schedule"
        aria-label={`Cancel scheduled session ${label}`}
      >
        <X size={13} strokeWidth={1.5} />
      </button>
      <RowContextMenu
        menu={menu}
        items={[{ label: "Cancel", onActivate: onCancel, danger: true }]}
        onClose={closeMenu}
      />
    </div>
  );
}

interface SessionRowProps {
  session: SessionView;
  /** Primary label: the (deduped) branch, or folder name for a non-git repo. */
  label: string;
  selected: boolean;
  /** The session is currently working (#42). */
  busy: boolean;
  /** The session has been active at least once (#112) → yellow when idle. */
  hasBeenActive: boolean;
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
  hasBeenActive,
  onSelect,
  onRemove,
  onRename,
}: SessionRowProps) {
  // Fork (#126) + copy session ID (#131) reuse the store directly — the row menu
  // surfaces the same fork action as the Overview/Canvas header buttons.
  const forkSession = useStore((s) => s.forkSession);
  const copyToClipboard = useStore((s) => s.copyToClipboard);

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

  // Agent label (#95): a single line showing only the primary — the custom name if
  // set, else the branch (deduped `label`, folder name when non-git). `sessionLabel`
  // still computes the subtitle (#67); the row just doesn't render it.
  // The #100 "auto-name" setting gates claude's auto-title (#97); off → branch.
  const autoNameOn = useStore((s) => s.settings.autoName);
  const { primary } = sessionLabel(
    session.name,
    autoNameOn ? session.autoName : null,
    label,
  );

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
          // Clamp for the taller menu (#131 added Fork / Copy session ID, so it
          // now has 4 items + a separator) so it never overflows the bottom edge.
          y: Math.max(8, Math.min(event.clientY, window.innerHeight - 160)),
        });
      }}
    >
      {/* Activity indicator (#71): far left of the row, before the label. Always
          shown — a calm dot when idle, a spinner when working. */}
      <span className={styles.rowBusy}>
        <BusyIndicator busy={busy} hasBeenActive={hasBeenActive} />
      </span>
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
        </button>
      )}
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
            {/* Fork the agent's conversation (#131) — reuses the #126 action,
                same as the Overview/Canvas header fork buttons. The icon+label
                layout reuses the Views items' flex styling (#82). */}
            <button
              type="button"
              role="menuitem"
              className={`${styles.menuItem} ${styles.menuItemView}`}
              onClick={() => {
                setMenu(null);
                void forkSession(session.id);
              }}
            >
              <GitFork
                size={14}
                strokeWidth={1.5}
                className={styles.menuIcon}
              />
              Fork conversation
            </button>
            {/* Copy the claude session UUID (#131) — usable with `claude --resume`. */}
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => {
                setMenu(null);
                void copyToClipboard(session.claudeSessionId, "session ID");
              }}
            >
              Copy session ID
            </button>
            <div className={styles.menuSeparator} role="separator" />
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
  selected: boolean;
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
function FileRow({ repoPath, file, selected, onOpen, onClose }: FileRowProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `file:${repoPath}:${file}`,
      data: { kind: "file", repoPath, file },
    });
  const name = file.split("/").pop() || file;
  const { menu, openMenu, closeMenu } = useRowMenu();
  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      className={`${styles.fileRow} ${selected ? styles.fileRowSelected : ""} ${isDragging ? styles.fileRowDragging : ""}`}
      style={style}
      onContextMenu={openMenu}
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
      <RowContextMenu
        menu={menu}
        items={[{ label: "Remove", onActivate: onClose, danger: true }]}
        onClose={closeMenu}
      />
    </div>
  );
}

/**
 * A diff-viewer item in the sidebar tree (#59): a repo's diff panel as a
 * draggable row that drops into Canvas as a diff panel (`{kind:"diff"}`). Click
 * selects/jumps to it in the current view (#79); the × removes the panel (its
 * 1:1). Mirrors FileRow — the forward-looking rule: a new left-panel item type is
 * a draggable row + a `payloadToContent` case, draggable into Canvas by default.
 */
function DiffRow({
  repoPath,
  panelId,
  selected,
  onOpen,
  onClose,
}: {
  repoPath: string;
  panelId: string;
  selected: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `diff:${repoPath}:${panelId}`,
      data: { kind: "diff", repoPath },
    });
  const { menu, openMenu, closeMenu } = useRowMenu();
  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      className={`${styles.fileRow} ${selected ? styles.fileRowSelected : ""} ${isDragging ? styles.fileRowDragging : ""}`}
      style={style}
      onContextMenu={openMenu}
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
      <RowContextMenu
        menu={menu}
        items={[{ label: "Remove", onActivate: onClose, danger: true }]}
        onClose={closeMenu}
      />
    </div>
  );
}

/**
 * A plain shell terminal item in the sidebar tree (#72): a draggable row that
 * drops into Canvas as a terminal panel (`{kind:"terminal"}`). Click selects/
 * jumps to it (#79); the × removes the panel (and kills its shell). Mirrors DiffRow.
 */
function TerminalRow({
  repoPath,
  panelId,
  selected,
  onOpen,
  onClose,
}: {
  repoPath: string;
  panelId: string;
  selected: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `terminal:${repoPath}:${panelId}`,
      data: { kind: "terminal", repoPath, sessionId: panelId },
    });
  const { menu, openMenu, closeMenu } = useRowMenu();
  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      className={`${styles.fileRow} ${selected ? styles.fileRowSelected : ""} ${isDragging ? styles.fileRowDragging : ""}`}
      style={style}
      onContextMenu={openMenu}
    >
      <button
        type="button"
        className={styles.fileMain}
        onClick={onOpen}
        title="Terminal"
        {...attributes}
        {...listeners}
      >
        <TerminalIcon
          size={13}
          strokeWidth={1.5}
          className={styles.fileIcon}
          aria-hidden
        />
        <span className={styles.fileName}>Terminal</span>
      </button>
      <button
        type="button"
        className={styles.fileClose}
        onClick={onClose}
        title="Close terminal"
        aria-label="Close terminal"
      >
        <X size={13} strokeWidth={1.5} />
      </button>
      <RowContextMenu
        menu={menu}
        items={[{ label: "Remove", onActivate: onClose, danger: true }]}
        onClose={closeMenu}
      />
    </div>
  );
}

/**
 * A worktree sub-group header (#74): the `GitBranch` icon + branch name +
 * "worktree" badge for an isolated worktree folder, with the worktree's absolute
 * path as its tooltip. Right-click opens a two-item menu (#133) mirroring the
 * repo menu (#130): **Reveal in Finder** / **Copy absolute path** — both
 * non-destructive, operating on the worktree's own absolute folder path (`path`).
 */
function WorktreeHeader({ path, branch }: { path: string; branch: string }) {
  const copyToClipboard = useStore((s) => s.copyToClipboard);
  const { menu, openMenu, closeMenu } = useRowMenu();
  return (
    <div
      className={styles.worktreeHeader}
      title={path}
      onContextMenu={openMenu}
    >
      <GitBranch
        size={12}
        strokeWidth={1.5}
        className={styles.worktreeIcon}
        aria-hidden
      />
      <span className={styles.worktreeName}>{branch}</span>
      <span className={styles.worktreeBadge}>worktree</span>
      <RowContextMenu
        menu={menu}
        items={[
          { label: "Reveal in Finder", onActivate: () => void revealPath(path) },
          {
            label: "Copy absolute path",
            onActivate: () => void copyToClipboard(path, "path"),
          },
        ]}
        onClose={closeMenu}
      />
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
  const selectItem = useStore((s) => s.selectItem);
  const removeSession = useStore((s) => s.removeSession);
  const renameSession = useStore((s) => s.renameSession);
  const openNewSession = useStore((s) => s.openNewSession);
  const startRepoSession = useStore((s) => s.startRepoSession);
  const copyToClipboard = useStore((s) => s.copyToClipboard);
  const openSchedule = useStore((s) => s.openSchedule);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const confirmDestructive = useStore((s) => s.settings.confirmDestructive);
  const sidebarWidth = useStore((s) => s.sidebarWidth);
  const setSidebarWidth = useStore((s) => s.setSidebarWidth);
  const schedules = useStore((s) => s.schedules);
  const cancelSchedule = useStore((s) => s.cancelSchedule);
  const refreshBranches = useStore((s) => s.refreshBranches);
  const forgetRepo = useStore((s) => s.forgetRepo);
  const killAllAgents = useStore((s) => s.killAllAgents);
  const closeAllItems = useStore((s) => s.closeAllItems);
  const setView = useStore((s) => s.setView);
  const overviewRepoFilter = useStore((s) => s.overviewRepoFilter);
  const setOverviewRepoFilter = useStore((s) => s.setOverviewRepoFilter);
  const repoColors = useStore((s) => s.repoColors);
  const setRepoColor = useStore((s) => s.setRepoColor);
  const overviewPanels = useStore((s) => s.overviewPanels);
  const addOverviewPanel = useStore((s) => s.addOverviewPanel);
  const removeOverviewPanel = useStore((s) => s.removeOverviewPanel);
  const sessionBusy = useStore((s) => s.sessionBusy);
  const sessionActive = useStore((s) => s.sessionActive);

  // Right-click repo context menu (#31/#35), anchored at the cursor. `menuMode`
  // switches between the item list, the destructive Forget confirm, and the
  // color picker.
  const [menu, setMenu] = useState<{
    repo: string;
    x: number;
    y: number;
  } | null>(null);
  const [menuMode, setMenuMode] = useState<
    "menu" | "confirm" | "confirm-kill" | "confirm-close" | "color" | "files"
  >("menu");
  // The repo's files while the menu is in "files" mode (#44); null = loading.
  const [fileList, setFileList] = useState<string[] | null>(null);
  const closeMenu = () => {
    setMenu(null);
    setMenuMode("menu");
  };

  // Addable, non-agent view types for the repo menu's "Views" section (#82).
  // One entry per view kind — adding a future kind is a single entry here, not a
  // scattered menu edit. Each `onAdd` adds the view to the repo *without* forcing
  // a main-view switch (#79): it appears as a sidebar row + Overview column and
  // is draggable into a Canvas; the user switches views when ready.
  const viewTypes: {
    key: string;
    label: string;
    icon: typeof FileText;
    onAdd: (repo: string) => void;
  }[] = [
    {
      key: "file",
      label: "File viewer",
      icon: FileText,
      // The searchable file picker (#56) → file column (#44); the menu stays
      // open to pick, so this transitions mode rather than closing.
      onAdd: () => setMenuMode("files"),
    },
    {
      key: "diff",
      label: "Diff viewer",
      icon: FileDiff,
      onAdd: (repo) => {
        void addOverviewPanel(repo, "diff");
        closeMenu();
      },
    },
    {
      key: "terminal",
      label: "Terminal",
      icon: TerminalIcon,
      onAdd: (repo) => {
        void addOverviewPanel(repo, "terminal");
        closeMenu();
      },
    },
  ];

  // Top-level groups exclude worktree agents (#74) — their repo_path is the
  // worktree folder, not a repo — but include every worktree's parent so the
  // parent group is always present to nest under.
  const worktreeParents = sessions
    .filter((s) => s.worktreeParent)
    .map((s) => s.worktreeParent as string);
  const repos = repoOrder(
    [...recents, ...worktreeParents],
    sessions.filter((s) => !s.worktreeParent),
  );
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
  // Bulk repo actions (#91): counts that include worktree agents (#74).
  const menuRunningAll = menu
    ? sessions.filter(
        (s) =>
          (s.repoPath === menu.repo || s.worktreeParent === menu.repo) &&
          s.exitedCode === undefined,
      ).length
    : 0;
  const menuAgentCount = menu
    ? sessions.filter(
        (s) => s.repoPath === menu.repo || s.worktreeParent === menu.repo,
      ).length
    : 0;
  const menuPanelCount = menu ? (overviewPanels[menu.repo]?.length ?? 0) : 0;

  // Drag-to-resize the sidebar (#108): a right-edge handle with pointer capture so
  // the drag tracks even when the pointer leaves the thin handle. The store clamps
  // to [180, 560] + persists (debounced); double-click resets to the default.
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  const onResizeDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    resizeStart.current = { x: e.clientX, width: sidebarWidth };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = resizeStart.current;
    if (!start) return;
    setSidebarWidth(start.width + (e.clientX - start.x));
  };
  const onResizeUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    resizeStart.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <aside
      className={styles.sidebar}
      style={{ width: sidebarWidth }}
      aria-label="Sessions"
    >
      {/* Drag-to-resize handle on the right edge (#108). */}
      <div
        className={styles.resizeHandle}
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onDoubleClick={() => setSidebarWidth(260)}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar (double-click to reset)"
        title="Drag to resize · double-click to reset"
      />
      <button
        type="button"
        className={styles.newButton}
        onClick={() => openNewSession()}
      >
        <Plus size={16} strokeWidth={1.5} />
        New session
        <kbd className={styles.kbd}>⌘N</kbd>
      </button>

      {/* Schedule a session to launch later (#93) — same flow, plus a time step. */}
      <button
        type="button"
        className={styles.scheduleButton}
        onClick={() => openSchedule()}
      >
        <Clock size={15} strokeWidth={1.5} />
        Schedule session
        <kbd className={styles.kbd}>⌘⇧N</kbd>
      </button>

      <div className={styles.viewSwitch}>
        <ViewSwitch />
      </div>

      <div className={styles.repos}>
        {repos.length === 0 && (
          <p className={styles.emptyHint}>No repositories yet.</p>
        )}

        {repos.map((repo) => {
          const repoSessions = sessions.filter(
            (s) => s.repoPath === repo && !s.worktreeParent,
          );
          const isEmpty = repoSessions.length === 0;
          const isFiltered = overviewRepoFilter === repo;
          // Primary label = the repo's branch, or the folder name when non-git /
          // not yet known. All sessions in a group share it, so index duplicates.
          const baseLabel = (branches[repo] ?? "") || repoName(repo);
          const rowLabels = dedupeBranchLabels(
            repoSessions.map(() => baseLabel),
          );
          // Worktree agents (#74) of this repo, grouped by their worktree folder —
          // rendered as indented sub-groups below the repo's own sessions/items.
          const worktreeAgents = sessions.filter(
            (s) => s.worktreeParent === repo,
          );
          const worktreePaths = [
            ...new Set(worktreeAgents.map((s) => s.repoPath)),
          ];

          return (
            <div key={repo} className={styles.group}>
              <div
                className={`${styles.repoHeader} ${isEmpty ? styles.repoEmpty : ""} ${isFiltered ? styles.repoActive : ""}`}
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
                {/* Static repo-colored folder marker (#128, replaces the #115
                    cube): a non-interactive identity marker. The name still
                    filters Overview on click (#34). */}
                <span
                  className={styles.repoFolder}
                  style={{ color: repoColor(repo, repoColors) }}
                  aria-hidden
                >
                  <Folder size={12} strokeWidth={2} />
                </span>
                {/* Left-click a repo title filters Overview to it (toggle);
                    right-click opens the #31 context menu. */}
                <button
                  type="button"
                  className={styles.repoTitle}
                  onClick={() => {
                    setOverviewRepoFilter(repo);
                    setView("overview");
                  }}
                  title={`Filter Overview to ${repoName(repo)}`}
                  aria-pressed={isFiltered}
                >
                  <span className={styles.repoName}>{repoName(repo)}</span>
                  {!isEmpty && (
                    <span className={styles.count}>{repoSessions.length}</span>
                  )}
                </button>
                <button
                  type="button"
                  className={`${styles.plus} ${isEmpty ? styles.plusCoral : ""}`}
                  onClick={() => void startRepoSession(repo)}
                  title="New session in this repo"
                  aria-label="New session in this repo"
                >
                  <Plus size={14} strokeWidth={1.5} />
                </button>
              </div>

              {/* Child rows (#59/#74/#93): sessions, non-agent items, schedules,
                  and nested worktree agents — always rendered (#115 removed the
                  #113 collapse gate). */}
              {repoSessions.map((session, i) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  // rowLabels has one entry per session; fallback satisfies
                  // noUncheckedIndexedAccess and is never reached at runtime.
                  label={rowLabels[i] ?? baseLabel}
                  selected={session.id === selectedId}
                  busy={sessionBusy[session.id] ?? false}
                  hasBeenActive={sessionActive[session.id] ?? false}
                  onSelect={() =>
                    selectItem({
                      kind: "agent",
                      id: session.id,
                      repoPath: session.repoPath,
                    })
                  }
                  onRemove={() => void removeSession(session.id)}
                  onRename={(name) => void renameSession(session.id, name)}
                />
              ))}

              {/* This repo's non-agent items (#59) — the same `overviewPanels`
                  Overview shows, 1:1: file + diff viewers. A click selects/jumps
                  to the item in the current view (#79), the × removes it, and each
                  is draggable into a Canvas (file → file viewer, diff → diff). */}
              {(overviewPanels[repo] ?? []).map((panel) =>
                panel.kind === "diff" ? (
                  <DiffRow
                    key={panel.id}
                    repoPath={repo}
                    panelId={panel.id}
                    selected={panel.id === selectedId}
                    onOpen={() =>
                      selectItem({
                        kind: "diff",
                        id: panel.id,
                        repoPath: repo,
                      })
                    }
                    onClose={() => void removeOverviewPanel(repo, panel.id)}
                  />
                ) : panel.kind === "terminal" ? (
                  <TerminalRow
                    key={panel.id}
                    repoPath={repo}
                    panelId={panel.id}
                    selected={panel.id === selectedId}
                    onOpen={() =>
                      selectItem({
                        kind: "terminal",
                        id: panel.id,
                        repoPath: repo,
                      })
                    }
                    onClose={() => void removeOverviewPanel(repo, panel.id)}
                  />
                ) : panel.file ? (
                  <FileRow
                    key={panel.id}
                    repoPath={repo}
                    file={panel.file}
                    selected={panel.id === selectedId}
                    onOpen={() =>
                      selectItem({
                        kind: "file",
                        id: panel.id,
                        repoPath: repo,
                        file: panel.file,
                      })
                    }
                    onClose={() => void removeOverviewPanel(repo, panel.id)}
                  />
                ) : null,
              )}

              {/* Pending scheduled sessions for this repo (#93): name/branch +
                  fire time + cancel. Non-draggable, no rich panel (that's #94). */}
              {schedules
                .filter((s) => s.cwd === repo)
                .map((s) => (
                  <ScheduleRow
                    key={s.id}
                    schedule={s}
                    selected={s.id === selectedId}
                    onOpen={() =>
                      selectItem({
                        kind: "scheduled",
                        id: s.id,
                        repoPath: s.cwd,
                      })
                    }
                    onCancel={() => void cancelSchedule(s.id)}
                  />
                ))}

              {/* Isolated worktrees (#74), nested under their parent repo: each
                  worktree folder is a sub-group (branch + "worktree" badge) with
                  its agent(s). Their repo_path is the worktree, not this repo. */}
              {worktreePaths.map((wt) => {
                const wtAgents = worktreeAgents.filter(
                  (s) => s.repoPath === wt,
                );
                const wtBranch = (branches[wt] ?? "") || repoName(wt);
                const wtLabels = dedupeBranchLabels(
                  wtAgents.map(() => wtBranch),
                );
                return (
                  <div key={wt} className={styles.worktreeGroup}>
                    <WorktreeHeader path={wt} branch={wtBranch} />
                    {wtAgents.map((session, i) => (
                      <SessionRow
                        key={session.id}
                        session={session}
                        label={wtLabels[i] ?? wtBranch}
                        selected={session.id === selectedId}
                        busy={sessionBusy[session.id] ?? false}
                        hasBeenActive={sessionActive[session.id] ?? false}
                        onSelect={() =>
                          selectItem({
                            kind: "agent",
                            id: session.id,
                            repoPath: session.repoPath,
                          })
                        }
                        onRemove={() => void removeSession(session.id)}
                        onRename={(name) =>
                          void renameSession(session.id, name)
                        }
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer (#100): a thin bottom bar pinned below the scrolling repo list,
          laid out (a flex row) to hold more quick-action icons later. For now it
          holds the Settings gear. */}
      <div className={styles.footer}>
        <button
          type="button"
          className={styles.footerButton}
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          aria-label="Settings"
        >
          <SettingsIcon size={16} strokeWidth={1.5} />
        </button>
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
                  // store) — shows in both the sidebar and Overview. No forced
                  // view switch (#79/#82) — the user switches when ready.
                  void addOverviewPanel(menu.repo, "markdown", f);
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
            ) : menuMode === "confirm-kill" ? (
              <button
                type="button"
                role="menuitem"
                className={styles.menuDanger}
                onClick={() => {
                  void killAllAgents(menu.repo);
                  closeMenu();
                }}
              >
                Kill {menuRunningAll} agent{menuRunningAll === 1 ? "" : "s"}?
              </button>
            ) : menuMode === "confirm-close" ? (
              <button
                type="button"
                role="menuitem"
                className={styles.menuDanger}
                onClick={() => {
                  void closeAllItems(menu.repo);
                  closeMenu();
                }}
              >
                Close all items
                {menuRunningAll > 0
                  ? ` (kill ${menuRunningAll} agent${menuRunningAll === 1 ? "" : "s"})`
                  : ""}
                ?
              </button>
            ) : (
              <>
                {/* New session (#54): first item; mirrors the inline + button. */}
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    void startRepoSession(menu.repo);
                    closeMenu();
                  }}
                >
                  New session
                </button>
                <div className={styles.menuSeparator} role="separator" />
                {/* Views (#82): every addable non-agent view, rendered from a
                    single registry (`viewTypes`) so a new kind is a one-line
                    addition, not a scattered menu edit. New session stays a
                    separate item above; adding a view here doesn't switch the
                    main view (#79) — the user switches when ready. */}
                <div className={styles.menuSection}>Views</div>
                {viewTypes.map((v) => {
                  const Icon = v.icon;
                  return (
                    <button
                      key={v.key}
                      type="button"
                      role="menuitem"
                      className={`${styles.menuItem} ${styles.menuItemView}`}
                      onClick={() => v.onAdd(menu.repo)}
                    >
                      <Icon
                        size={14}
                        strokeWidth={1.5}
                        className={styles.menuIcon}
                      />
                      {v.label}
                    </button>
                  );
                })}
                {/* Non-destructive folder utilities (#129): reveal in Finder /
                    copy the absolute path. Reuses the `open`-shell-out backend
                    (#100/#109) and the store clipboard helper. */}
                <div className={styles.menuSeparator} role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    void revealPath(menu.repo);
                    closeMenu();
                  }}
                >
                  Reveal in Finder
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    void copyToClipboard(menu.repo, "path");
                    closeMenu();
                  }}
                >
                  Copy path
                </button>
                <div className={styles.menuSeparator} role="separator" />
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
                {/* Bulk actions (#91): kill the folder's running agents, or clear
                    its whole workspace (agents + views) while keeping the folder. */}
                {menuRunningAll > 0 && (
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItemDanger}
                    onClick={() => {
                      // Confirm first unless the user turned confirms off (#103).
                      if (confirmDestructive) setMenuMode("confirm-kill");
                      else {
                        void killAllAgents(menu.repo);
                        closeMenu();
                      }
                    }}
                  >
                    Kill all agents
                  </button>
                )}
                {(menuAgentCount > 0 || menuPanelCount > 0) && (
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItemDanger}
                    onClick={() => {
                      // Confirm only when agents are running and confirms are on
                      // (#103); else clear directly.
                      if (confirmDestructive && menuRunningAll > 0)
                        setMenuMode("confirm-close");
                      else {
                        void closeAllItems(menu.repo);
                        closeMenu();
                      }
                    }}
                  >
                    Close all items
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItemDanger}
                  onClick={() => {
                    // Confirm first only when agents are running in this folder and
                    // confirms are on (#103).
                    if (confirmDestructive && menuRunning > 0)
                      setMenuMode("confirm");
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
