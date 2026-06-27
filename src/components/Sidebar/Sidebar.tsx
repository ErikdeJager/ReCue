import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { useDraggable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Bug,
  Clock,
  FileDiff,
  FileText,
  Folder,
  FolderTree,
  GitBranch,
  GitFork,
  PanelLeftClose,
  PanelLeftOpen,
  PanelsTopLeft,
  Plus,
  Settings as SettingsIcon,
  SquareKanban,
  Terminal as TerminalIcon,
  X,
} from "lucide-react";

import { noAutoCapitalize } from "../../inputProps";
import { openUrl, revealFileInFinder, revealPath } from "../../ipc";
import { FORK_UNAVAILABLE_REASON, repoName, sessionLabel } from "../../paths";
import { formatFireTime } from "../../time";
import {
  dedupeBranchLabels,
  mergeRepoOrder,
  REPO_PALETTE,
  repoColor,
  repoOrder,
  useStore,
} from "../../store";
import type { ScheduledSession, SessionView } from "../../types";
import BusyIndicator from "../BusyIndicator/BusyIndicator";
import UpdateIndicator from "../Update/UpdateIndicator";
import UsageBar from "../Usage/UsageBar";
import ViewSwitch from "../ViewSwitch/ViewSwitch";
import ViewsMenu from "../ViewsMenu/ViewsMenu";
import styles from "./Sidebar.module.css";

/** Fixed width of the collapsed sidebar icon rail (#168/#214). Snug around its
 * ~36px buttons (a ~4px gutter each side). The persisted `sidebarWidth` is left
 * untouched while collapsed, so expanding restores it. */
const SIDEBAR_RAIL_WIDTH = 44;

/** Bug-report / feature-request Google Form, opened by the footer feedback button
 * (#210) in the default browser via the http/https-only `open_url` (#109). */
const FEEDBACK_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSf-EOSBcCTLUN-00UhBGj4XJ27ky7d2ZQp8YcOLwAVvTUkXGw/viewform?usp=publish-editor";

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

/** The absolute path of a sidebar file/Kanban row (#171): the folder root joined to
 * the (repo-relative) `file`, trailing slashes on the root trimmed so there's no
 * double slash. For an out-of-repo file opened via Browse… (#163) the root is the
 * file's own parent dir, so this stays correct. */
function rowAbsPath(repoPath: string, file: string): string {
  return `${repoPath.replace(/\/+$/, "")}/${file}`;
}

/** The shared right-click menu for a sidebar **file** row — a real file on disk
 * (#171): Reveal in Finder (`open -R`, which *selects* the file), Copy absolute path,
 * Copy relative path (the repo-relative `file` verbatim), then the red Remove. Used by
 * both `FileRow` and `KanbanRow` so the two menus never diverge. */
function filePathMenuItems(
  repoPath: string,
  file: string,
  copyToClipboard: (text: string, label?: string) => void,
  onRemove: () => void,
): RowMenuItem[] {
  const abs = rowAbsPath(repoPath, file);
  return [
    {
      label: "Reveal in Finder",
      onActivate: () => void revealFileInFinder(abs),
    },
    {
      label: "Copy absolute path",
      onActivate: () => copyToClipboard(abs, "path"),
    },
    {
      label: "Copy relative path",
      onActivate: () => copyToClipboard(file, "path"),
    },
    { label: "Remove", onActivate: onRemove, danger: true },
  ];
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
  // Open the agent in Canvas (#153) — reuse its existing tab or create a new one.
  const openSessionInCanvas = useStore((s) => s.openSessionInCanvas);
  // Fork is unavailable (#138) until the source has a real turn to fork; fail-open
  // (undefined/true → available, only a confident `false` disables it).
  const canFork = session.forkable !== false;

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
          // Clamp for the taller menu (#131 Fork / Copy session ID + #153 Open in
          // canvas → 5 items + a separator) so it never overflows the bottom edge.
          y: Math.max(8, Math.min(event.clientY, window.innerHeight - 200)),
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
          {...noAutoCapitalize}
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
              aria-disabled={!canFork}
              title={canFork ? undefined : FORK_UNAVAILABLE_REASON}
              onClick={() => {
                if (!canFork) return;
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
            {/* Open the agent in the Canvas view (#153): reuse its existing tab if
                it's already shown there (or raise its detached window #84), else a
                new "Canvas N" tab. Same icon+label layout as Fork (#82/#131). */}
            <button
              type="button"
              role="menuitem"
              className={`${styles.menuItem} ${styles.menuItemView}`}
              onClick={() => {
                setMenu(null);
                openSessionInCanvas(session.id);
              }}
            >
              <PanelsTopLeft
                size={14}
                strokeWidth={1.5}
                className={styles.menuIcon}
              />
              Open in canvas
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
  const copyToClipboard = useStore((s) => s.copyToClipboard);
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
        items={filePathMenuItems(repoPath, file, copyToClipboard, onClose)}
        onClose={closeMenu}
      />
    </div>
  );
}

interface KanbanRowProps {
  repoPath: string;
  /** Repo-relative `.md` board path. */
  file: string;
  selected: boolean;
  onOpen: () => void;
  onClose: () => void;
}

/**
 * A Kanban-board item in the sidebar tree (#142): one per repo `kanban` panel
 * (`overviewPanels`, the single item source). Mirrors FileRow — clickable
 * (selects/jumps in the current view #79), hover close (×, removes the panel),
 * and a dnd-kit draggable source that drops into Canvas as a `{kind:"kanban"}`
 * board panel. The whole label is the drag handle; a small activation distance
 * keeps clicks working.
 */
function KanbanRow({
  repoPath,
  file,
  selected,
  onOpen,
  onClose,
}: KanbanRowProps) {
  const copyToClipboard = useStore((s) => s.copyToClipboard);
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `kanban:${repoPath}:${file}`,
      data: { kind: "kanban", repoPath, file },
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
        <SquareKanban
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
        title="Close board"
        aria-label={`Close ${name}`}
      >
        <X size={13} strokeWidth={1.5} />
      </button>
      <RowContextMenu
        menu={menu}
        items={filePathMenuItems(repoPath, file, copyToClipboard, onClose)}
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
 * A file-tree item in the sidebar tree (#167): a repo's file-tree panel as a
 * draggable row that drops into Canvas as a file-tree panel (`{kind:"filetree"}`).
 * Click selects/jumps to it in the current view (#79); the × removes the panel (its
 * 1:1). Mirrors DiffRow — repo-scoped, one per repo.
 */
function FileTreeRow({
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
      id: `filetree:${repoPath}:${panelId}`,
      data: { kind: "filetree", repoPath },
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
        title="File tree"
        {...attributes}
        {...listeners}
      >
        <FolderTree
          size={13}
          strokeWidth={1.5}
          className={styles.fileIcon}
          aria-hidden
        />
        <span className={styles.fileName}>File tree</span>
      </button>
      <button
        type="button"
        className={styles.fileClose}
        onClick={onClose}
        title="Close file tree"
        aria-label="Close file tree"
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
 * path as its tooltip. Right-click opens a full action menu (#166) mirroring the
 * repo menu (#82/#130) but scoped to the worktree's own folder (`path`): **New
 * session** (reuses the worktree via `spawnWorktreeSession(parent, branch)`,
 * ref-counted), the shared **Views** add-view set (#164's `ViewsMenu`), **Reveal in
 * Finder** / **Copy absolute path**, and a destructive **Close worktree** that kills
 * the worktree's agents (ref-counted `git worktree remove`, dirty kept) + its items
 * — confirm-gated per `confirmDestructive` (#103).
 */
function WorktreeHeader({
  path,
  branch,
  parent,
  agentCount,
  compact = false,
}: {
  path: string;
  branch: string;
  /** The worktree's parent repo (#166) — needed to start a new worktree session;
   * undefined disables "New session". */
  parent?: string;
  /** Agents in this worktree (#166) — for the Close-worktree confirm label. */
  agentCount: number;
  /** Collapsed-rail mode (#168): icon-only (just the branch glyph), no name/badge,
   * the full right-click menu intact. */
  compact?: boolean;
}) {
  const copyToClipboard = useStore((s) => s.copyToClipboard);
  const pullFolder = useStore((s) => s.pullFolder);
  const spawnWorktreeSession = useStore((s) => s.spawnWorktreeSession);
  const killAllAgents = useStore((s) => s.killAllAgents);
  const closeAllItems = useStore((s) => s.closeAllItems);
  const confirmDestructive = useStore((s) => s.settings.confirmDestructive);
  // Click-to-filter Overview to just this worktree (#197), mirroring the repo name.
  const setOverviewRepoFilter = useStore((s) => s.setOverviewRepoFilter);
  const setView = useStore((s) => s.setView);
  const isFiltered = useStore((s) => s.overviewRepoFilter === path);
  const { menu, openMenu, closeMenu } = useRowMenu();
  const [confirming, setConfirming] = useState(false);
  const close = () => {
    setConfirming(false);
    closeMenu();
  };
  const closeWorktree = () => {
    void killAllAgents(path);
    void closeAllItems(path);
  };
  return (
    <div
      className={`${compact ? styles.railWorktree : styles.worktreeHeader} ${
        !compact && isFiltered ? styles.worktreeActive : ""
      }`}
      title={compact ? `${branch} · worktree` : path}
      onContextMenu={openMenu}
    >
      {/* The branch glyph marks the row as a worktree (#196, replacing the literal
          "worktree" word) — distinct from a repo's Folder icon (#128). Labelled so
          the meaning survives without the text. */}
      <GitBranch
        size={compact ? 16 : 12}
        strokeWidth={1.5}
        className={styles.worktreeIcon}
        role="img"
        aria-label="worktree"
      />
      {/* Click the name to filter Overview to just this worktree (#197), toggling
          off if already active — like the repo name (#34). Switches to Overview so
          the narrowed wall is visible (matching the repo filter). */}
      {!compact && (
        <button
          type="button"
          className={styles.worktreeName}
          onClick={() => {
            setOverviewRepoFilter(path);
            setView("overview");
          }}
          title={`Filter Overview to ${branch}`}
          aria-pressed={isFiltered}
        >
          {branch}
        </button>
      )}
      {/* Inline "+" new session in this worktree (#196), mirroring the repo header's
          + (#127): reuses the app-managed worktree folder (ref-count++, #166). The
          click is contained so it never opens the row's context menu. Disabled when
          the parent repo is unknown (like the menu's "New session", #166). */}
      {!compact && (
        <button
          type="button"
          className={styles.plus}
          onClick={(event) => {
            event.stopPropagation();
            if (parent) void spawnWorktreeSession(parent, branch);
          }}
          disabled={!parent}
          title={
            parent ? "New session in this worktree" : "Worktree parent unknown"
          }
          aria-label="New session in this worktree"
        >
          <Plus size={14} strokeWidth={1.5} />
        </button>
      )}
      {menu && (
        <>
          <div
            className={styles.menuOverlay}
            onClick={close}
            onContextMenu={(event) => {
              event.preventDefault();
              close();
            }}
          />
          <div
            className={styles.menu}
            style={{ left: menu.x, top: menu.y }}
            role="menu"
          >
            {confirming ? (
              <button
                type="button"
                role="menuitem"
                className={styles.menuDanger}
                onClick={() => {
                  closeWorktree();
                  close();
                }}
              >
                {agentCount > 0
                  ? `Kill ${agentCount} agent${agentCount === 1 ? "" : "s"} & close worktree?`
                  : "Close worktree & remove its items?"}
              </button>
            ) : (
              <>
                {/* New session in this worktree (#166): create-or-reuse the
                    app-managed worktree (ref-count++), nesting another agent here. */}
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  aria-disabled={!parent}
                  title={parent ? undefined : "Worktree parent unknown"}
                  onClick={() => {
                    if (!parent) return;
                    void spawnWorktreeSession(parent, branch);
                    close();
                  }}
                >
                  New session
                </button>
                <div className={styles.menuSeparator} role="separator" />
                {/* Open a view scoped to the worktree folder — the shared #164
                    ViewsMenu (file/diff/terminal/kanban), so the action set never
                    diverges from the repo menu and the badge popover. */}
                <div className={styles.menuSection}>Views</div>
                {/* No "New session here" — this menu already has its own top-level
                    "New session" above (#201). */}
                <ViewsMenu
                  repoPath={path}
                  onClose={close}
                  includeNewSession={false}
                />
                <div className={styles.menuSeparator} role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    void revealPath(path);
                    close();
                  }}
                >
                  Reveal in Finder
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    void copyToClipboard(path, "path");
                    close();
                  }}
                >
                  Copy absolute path
                </button>
                {/* Pull (#181): fast-forward this worktree's current branch
                    (`git pull --ff-only`); result is toasted. A worktree always has
                    a checked-out branch, so it's always shown here. */}
                {branch && (
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    title="git pull --ff-only"
                    onClick={() => {
                      void pullFolder(path);
                      close();
                    }}
                  >
                    Pull
                  </button>
                )}
                <div className={styles.menuSeparator} role="separator" />
                {/* Close the worktree entirely (#166): kill its agents (ref-counted
                    `git worktree remove`, dirty kept) + close its items. Confirm-gated. */}
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItemDanger}
                  onClick={() => {
                    if (confirmDestructive) {
                      setConfirming(true);
                    } else {
                      closeWorktree();
                      close();
                    }
                  }}
                >
                  Close worktree
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * A top-level repo "folder" group in the expanded sidebar (#211): the repo header
 * (whose **whole bar is the drag grip** — no separate handle), the repo's sessions /
 * non-agent items / pending schedules, and any nested worktree sub-groups.
 *
 * The group is a dnd-kit **sortable** so the user can drag a folder up/down to
 * reorder it. The sortable is bound to the **app-level** `DndContext` (App.tsx) — NOT
 * a new nested context, which would rebind the sidebar's row drag sources (#59) and
 * break drag-into-Canvas. App.tsx detects the `repohead:` drag id and persists the
 * new order via `reorderRepos`; the 4px pointer-activation distance lets a plain
 * click on the title (filter Overview) / `+` (new session) / right-click (repo menu)
 * still work without starting a drag.
 */
function RepoGroup({
  repo,
  repos,
  openRepoMenu,
  renderPanelRows,
}: {
  repo: string;
  /** The full displayed folder order — carried in the drag `data` so App.tsx can
   * compute the reordered list without recomputing it. */
  repos: string[];
  openRepoMenu: (repo: string, event: ReactMouseEvent) => void;
  renderPanelRows: (repoKey: string) => ReactNode;
}) {
  const sessions = useStore((s) => s.sessions);
  const branches = useStore((s) => s.branches);
  const selectedId = useStore((s) => s.selectedId);
  const selectItem = useStore((s) => s.selectItem);
  const removeSession = useStore((s) => s.removeSession);
  const renameSession = useStore((s) => s.renameSession);
  const startRepoSession = useStore((s) => s.startRepoSession);
  const cancelSchedule = useStore((s) => s.cancelSchedule);
  const setOverviewRepoFilter = useStore((s) => s.setOverviewRepoFilter);
  const setView = useStore((s) => s.setView);
  const overviewRepoFilter = useStore((s) => s.overviewRepoFilter);
  const repoColors = useStore((s) => s.repoColors);
  const sessionBusy = useStore((s) => s.sessionBusy);
  const sessionActive = useStore((s) => s.sessionActive);
  const schedules = useStore((s) => s.schedules);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `repohead:${repo}`,
    data: { kind: "folder-sort", repo, repos },
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const repoSessions = sessions.filter(
    (s) => s.repoPath === repo && !s.worktreeParent,
  );
  const isEmpty = repoSessions.length === 0;
  const isFiltered = overviewRepoFilter === repo;
  // Primary label = the repo's branch, or the folder name when non-git / not yet
  // known. All sessions in a group share it, so index duplicates.
  const baseLabel = (branches[repo] ?? "") || repoName(repo);
  const rowLabels = dedupeBranchLabels(repoSessions.map(() => baseLabel));
  // Worktree agents (#74) of this repo, grouped by their worktree folder — rendered
  // as indented sub-groups below the repo's own sessions/items.
  const worktreeAgents = sessions.filter((s) => s.worktreeParent === repo);
  const worktreePaths = [...new Set(worktreeAgents.map((s) => s.repoPath))];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.group} ${isDragging ? styles.groupDragging : ""}`}
    >
      {/* The whole header is the drag grip (#211): dnd-kit attributes/listeners make
      it focusable for keyboard + screen-reader drag. The `+` button stops pointerdown
      so it stays a pure click target; the title stays part of the grip (a <4px click
      filters Overview, a drag reorders). */}
      <div
        className={`${styles.repoHeader} ${isEmpty ? styles.repoEmpty : ""} ${isFiltered ? styles.repoActive : ""}`}
        onContextMenu={(event) => openRepoMenu(repo, event)}
        {...attributes}
        {...listeners}
      >
        {/* Static repo-colored folder marker (#128, replaces the #115 cube): a
        non-interactive identity marker. The name still filters Overview on click
        (#34). */}
        <span
          className={styles.repoFolder}
          style={{ color: repoColor(repo, repoColors) }}
          aria-hidden
        >
          <Folder size={12} strokeWidth={2} />
        </span>
        {/* Left-click a repo title filters Overview to it (toggle); right-click opens
        the #31 context menu. */}
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
          onPointerDown={(event) => event.stopPropagation()}
          title="New session in this repo"
          aria-label="New session in this repo"
        >
          <Plus size={14} strokeWidth={1.5} />
        </button>
      </div>

      {/* Child rows (#59/#74/#93): sessions, non-agent items, schedules, and nested
      worktree agents — always rendered (#115 removed the #113 collapse gate). */}
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

      {/* This repo's non-agent items (#59) — the same `overviewPanels` Overview
      shows, 1:1: file + diff viewers. A click selects/jumps to the item in the
      current view (#79), the × removes it, and each is draggable into a Canvas. */}
      {renderPanelRows(repo)}

      {/* Pending scheduled sessions for this repo (#93): name/branch + fire time +
      cancel. Non-draggable, no rich panel (that's #94). */}
      {schedules
        .filter((s) => s.cwd === repo)
        .map((s) => (
          <ScheduleRow
            key={s.id}
            schedule={s}
            selected={s.id === selectedId}
            onOpen={() =>
              selectItem({ kind: "scheduled", id: s.id, repoPath: s.cwd })
            }
            onCancel={() => void cancelSchedule(s.id)}
          />
        ))}

      {/* Isolated worktrees (#74), nested under their parent repo: each worktree
      folder is a sub-group (branch + "worktree" badge) with its agent(s). Their
      repo_path is the worktree, not this repo. */}
      {worktreePaths.map((wt) => {
        const wtAgents = worktreeAgents.filter((s) => s.repoPath === wt);
        const wtBranch = (branches[wt] ?? "") || repoName(wt);
        const wtLabels = dedupeBranchLabels(wtAgents.map(() => wtBranch));
        return (
          <div key={wt} className={styles.worktreeGroup}>
            <WorktreeHeader
              path={wt}
              branch={wtBranch}
              parent={wtAgents[0]?.worktreeParent ?? undefined}
              agentCount={wtAgents.length}
            />
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
                onRename={(name) => void renameSession(session.id, name)}
              />
            ))}
            {/* Views opened from the worktree badge (#164) are keyed by the worktree
            path, so they render here under their worktree. */}
            {renderPanelRows(wt)}
          </div>
        );
      })}
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
  const openNewSession = useStore((s) => s.openNewSession);
  const startRepoSession = useStore((s) => s.startRepoSession);
  const copyToClipboard = useStore((s) => s.copyToClipboard);
  const pullFolder = useStore((s) => s.pullFolder);
  const openSchedule = useStore((s) => s.openSchedule);
  const addFolder = useStore((s) => s.addFolder);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const confirmDestructive = useStore((s) => s.settings.confirmDestructive);
  const sidebarWidth = useStore((s) => s.sidebarWidth);
  const setSidebarWidth = useStore((s) => s.setSidebarWidth);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const toggleSidebarCollapsed = useStore((s) => s.toggleSidebarCollapsed);
  const autoNameOn = useStore((s) => s.settings.autoName);
  const folderOrder = useStore((s) => s.folderOrder);
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
    "menu" | "confirm" | "confirm-kill" | "confirm-close" | "color"
  >("menu");
  const closeMenu = () => {
    setMenu(null);
    setMenuMode("menu");
  };
  // Open the repo context menu at the cursor (#54), clamped so the menu — and the
  // taller file picker it can become (#56) — stays on-screen. Shared by the expanded
  // repo header and the collapsed rail's folder icon (#168) so both behave identically.
  const openRepoMenu = (repo: string, event: ReactMouseEvent) => {
    event.preventDefault();
    const x = Math.max(8, Math.min(event.clientX, window.innerWidth - 300));
    const y = Math.max(8, Math.min(event.clientY, window.innerHeight - 360));
    setMenu({ repo, x, y });
    setMenuMode("menu");
  };

  // Background (empty-area) context menu (#172): a non-repo-scoped menu opened by
  // right-clicking the sidebar's empty space — in both the expanded list and the
  // collapsed rail. Reuses the shared cursor-menu hook + `RowContextMenu` renderer.
  const bgMenu = useRowMenu();
  // Only fire on the container's *own* background, not when a right-click bubbles up
  // from a repo header / item row (whose handlers don't all stopPropagation, #172).
  const openBgMenu = (event: ReactMouseEvent) => {
    if (event.target !== event.currentTarget) return;
    bgMenu.openMenu(event);
  };
  const bgMenuItems: RowMenuItem[] = [
    { label: "New folder…", onActivate: () => void addFolder() },
    { label: "New session", onActivate: () => openNewSession() },
    { label: "Schedule session", onActivate: () => openSchedule() },
    {
      label: sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar",
      onActivate: () => toggleSidebarCollapsed(),
    },
    ...(overviewRepoFilter
      ? [
          {
            label: "Clear Overview filter",
            onActivate: () => setOverviewRepoFilter(null),
          },
        ]
      : []),
  ];

  // Top-level groups exclude worktree agents (#74) — their repo_path is the
  // worktree folder, not a repo — but include every worktree's parent so the
  // parent group is always present to nest under.
  const worktreeParents = sessions
    .filter((s) => s.worktreeParent)
    .map((s) => s.worktreeParent as string);
  // Displayed folder order (#211): the user's persisted drag order merged with the
  // live repo set, so a spawned/added repo appends and a forgotten one drops without
  // scrambling the rest. With nothing saved this is exactly the default alphabetical
  // `repoOrder`. Drives both the expanded list and the collapsed rail.
  const repos = mergeRepoOrder(
    folderOrder,
    repoOrder(
      [...recents, ...worktreeParents],
      sessions.filter((s) => !s.worktreeParent),
    ),
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

  // The non-agent rows (#59) for a folder key — file / diff / terminal / kanban
  // viewers from `overviewPanels[repoKey]`. Rendered both for a top-level repo and,
  // since #164, **inside a worktree sub-group** (its key is the worktree path) so a
  // view opened from the worktree badge appears under that worktree, not a stray group.
  const renderPanelRows = (repoKey: string) =>
    (overviewPanels[repoKey] ?? []).map((panel) =>
      panel.kind === "diff" ? (
        <DiffRow
          key={panel.id}
          repoPath={repoKey}
          panelId={panel.id}
          selected={panel.id === selectedId}
          onOpen={() =>
            selectItem({ kind: "diff", id: panel.id, repoPath: repoKey })
          }
          onClose={() => void removeOverviewPanel(repoKey, panel.id)}
        />
      ) : panel.kind === "filetree" ? (
        <FileTreeRow
          key={panel.id}
          repoPath={repoKey}
          panelId={panel.id}
          selected={panel.id === selectedId}
          onOpen={() =>
            selectItem({ kind: "filetree", id: panel.id, repoPath: repoKey })
          }
          onClose={() => void removeOverviewPanel(repoKey, panel.id)}
        />
      ) : panel.kind === "terminal" ? (
        <TerminalRow
          key={panel.id}
          repoPath={repoKey}
          panelId={panel.id}
          selected={panel.id === selectedId}
          onOpen={() =>
            selectItem({ kind: "terminal", id: panel.id, repoPath: repoKey })
          }
          onClose={() => void removeOverviewPanel(repoKey, panel.id)}
        />
      ) : panel.kind === "kanban" && panel.file ? (
        <KanbanRow
          key={panel.id}
          repoPath={repoKey}
          file={panel.file}
          selected={panel.id === selectedId}
          onOpen={() =>
            selectItem({
              kind: "kanban",
              id: panel.id,
              repoPath: repoKey,
              file: panel.file,
            })
          }
          onClose={() => void removeOverviewPanel(repoKey, panel.id)}
        />
      ) : panel.file ? (
        <FileRow
          key={panel.id}
          repoPath={repoKey}
          file={panel.file}
          selected={panel.id === selectedId}
          onOpen={() =>
            selectItem({
              kind: "file",
              id: panel.id,
              repoPath: repoKey,
              file: panel.file,
            })
          }
          onClose={() => void removeOverviewPanel(repoKey, panel.id)}
        />
      ) : null,
    );

  // The collapsed icon rail (#168): folder icons + per-session activity dots +
  // worktree icons + the New/Schedule/view-switch icons, with the repo & worktree
  // context menus still functional. The repo context-menu JSX (rendered after the
  // footer) and each WorktreeHeader's own menu sit over the rail unchanged.
  const rail = (
    <div className={styles.rail} onContextMenu={openBgMenu}>
      <button
        type="button"
        className={styles.railButton}
        onClick={() => openNewSession()}
        title="New session ⌘N"
        aria-label="New session"
      >
        <Plus size={18} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        className={styles.railButton}
        onClick={() => openSchedule()}
        title="Schedule session ⌘⇧N"
        aria-label="Schedule session"
      >
        <Clock size={16} strokeWidth={1.5} />
      </button>
      <ViewSwitch compact />
      <div className={styles.railRepos} onContextMenu={openBgMenu}>
        {repos.map((repo) => {
          const repoSessions = sessions.filter(
            (s) => s.repoPath === repo && !s.worktreeParent,
          );
          const isFiltered = overviewRepoFilter === repo;
          const baseLabel = (branches[repo] ?? "") || repoName(repo);
          const worktreeAgents = sessions.filter(
            (s) => s.worktreeParent === repo,
          );
          const worktreePaths = [
            ...new Set(worktreeAgents.map((s) => s.repoPath)),
          ];
          const dot = (s: SessionView, base: string) => (
            <BusyIndicator
              key={s.id}
              busy={sessionBusy[s.id] ?? false}
              hasBeenActive={sessionActive[s.id] ?? false}
              label={
                sessionLabel(s.name, autoNameOn ? s.autoName : null, base)
                  .primary
              }
            />
          );
          return (
            <div key={repo} className={styles.railRepo}>
              <button
                type="button"
                className={`${styles.railFolder} ${isFiltered ? styles.railFolderActive : ""}`}
                style={{ color: repoColor(repo, repoColors) }}
                onClick={() => {
                  setOverviewRepoFilter(repo);
                  setView("overview");
                }}
                onContextMenu={(event) => openRepoMenu(repo, event)}
                title={repoName(repo)}
                aria-label={repoName(repo)}
                aria-pressed={isFiltered}
              >
                <Folder size={18} strokeWidth={2} />
              </button>
              {repoSessions.length > 0 && (
                <div className={styles.railDots}>
                  {repoSessions.map((s) => dot(s, baseLabel))}
                </div>
              )}
              {worktreePaths.map((wt) => {
                const wtAgents = worktreeAgents.filter(
                  (s) => s.repoPath === wt,
                );
                const wtBranch = (branches[wt] ?? "") || repoName(wt);
                return (
                  <div key={wt} className={styles.railWorktreeGroup}>
                    <WorktreeHeader
                      compact
                      path={wt}
                      branch={wtBranch}
                      parent={wtAgents[0]?.worktreeParent ?? undefined}
                      agentCount={wtAgents.length}
                    />
                    {wtAgents.length > 0 && (
                      <div className={styles.railDots}>
                        {wtAgents.map((s) => dot(s, wtBranch))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <aside
      className={`${styles.sidebar} ${sidebarCollapsed ? styles.collapsed : ""}`}
      style={{ width: sidebarCollapsed ? SIDEBAR_RAIL_WIDTH : sidebarWidth }}
      aria-label="Sessions"
    >
      {/* Drag-to-resize handle on the right edge (#108) — hidden while collapsed
          (a fixed-width rail isn't resizable; expand via the chevron / ⌘B). */}
      {!sidebarCollapsed && (
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
      )}
      {sidebarCollapsed ? (
        rail
      ) : (
        <>
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

          <div className={styles.repos} onContextMenu={openBgMenu}>
            {repos.length === 0 && (
              <p className={styles.emptyHint} onContextMenu={bgMenu.openMenu}>
                No repositories yet.
              </p>
            )}

            {/* Drag-to-reorder the top-level folders (#211): a sortable list bound
            to the **app-level** DndContext (App.tsx) — never a new nested context,
            which would rebind the sidebar's row drag sources and break drag-into-
            Canvas. App.tsx detects the `repohead:` drag and persists the new order. */}
            <SortableContext
              items={repos.map((r) => `repohead:${r}`)}
              strategy={verticalListSortingStrategy}
            >
              {repos.map((repo) => (
                <RepoGroup
                  key={repo}
                  repo={repo}
                  repos={repos}
                  openRepoMenu={openRepoMenu}
                  renderPanelRows={renderPanelRows}
                />
              ))}
            </SortableContext>
          </div>
        </>
      )}

      {/* In-app update box (#190): directly above the footer/Settings gear, hidden
          unless an update is available/failed; collapses to its icon in the rail. */}
      <UpdateIndicator />

      {/* 5-hour Claude usage (#154): the thin separator above the footer — a plain
          hairline with no usage data, the thin usage fill (+ reset countdown + %)
          once data arrives. */}
      <UsageBar />

      {/* Footer (#100): a thin bottom bar pinned below the scrolling repo list,
          holding the Settings gear and (#168) the collapse/expand chevron. When
          collapsed the rail is too narrow for a row, so the footer stacks them. */}
      <div
        className={`${styles.footer} ${sidebarCollapsed ? styles.footerCollapsed : ""}`}
      >
        <button
          type="button"
          className={styles.footerButton}
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          aria-label="Settings"
        >
          <SettingsIcon size={16} strokeWidth={1.5} />
        </button>
        {/* Feedback (#210): opens the bug-report / feature-request Google Form in
            the default browser. Stacks with the others in the collapsed rail. */}
        <button
          type="button"
          className={styles.footerButton}
          onClick={() => void openUrl(FEEDBACK_FORM_URL)}
          title="Send feedback"
          aria-label="Send feedback"
        >
          <Bug size={16} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          className={styles.footerButton}
          onClick={() => toggleSidebarCollapsed()}
          title={sidebarCollapsed ? "Expand sidebar ⌘B" : "Collapse sidebar ⌘B"}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen size={16} strokeWidth={1.5} />
          ) : (
            <PanelLeftClose size={16} strokeWidth={1.5} />
          )}
        </button>
      </div>

      {/* Background (empty-area) context menu (#172) — works in both the expanded
          list and the collapsed rail; clamped + dismissed by the shared hook. */}
      <RowContextMenu
        menu={bgMenu.menu}
        items={bgMenuItems}
        onClose={bgMenu.closeMenu}
      />

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
                {/* Views (#82): the addable non-agent views, now from the shared
                    `ViewsMenu` (#164) so the repo menu and the worktree-badge
                    popover render one action set. File viewer / Kanban open a
                    picker inline; adding a view doesn't switch the main view (#79). */}
                <div className={styles.menuSection}>Views</div>
                {/* No "New session here" — this menu already has its own top-level
                    "New session" above (#201). */}
                <ViewsMenu
                  repoPath={menu.repo}
                  onClose={closeMenu}
                  includeNewSession={false}
                />
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
                {/* Pull (#181): fast-forward this folder's current branch
                    (`git pull --ff-only`); result is toasted. Shown only when a
                    current branch is known (hidden for non-git folders). */}
                {branches[menu.repo] && (
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    title="git pull --ff-only"
                    onClick={() => {
                      void pullFolder(menu.repo);
                      closeMenu();
                    }}
                  >
                    Pull
                  </button>
                )}
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
