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
  AlertTriangle,
  Bug,
  Clock,
  FileDiff,
  FileText,
  Folder,
  FolderTree,
  GitBranch,
  GitFork,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelsTopLeft,
  Play,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  SquareKanban,
  Terminal as TerminalIcon,
  X,
} from "lucide-react";

import { agentSupportsResume } from "../../agents";
import { noAutoCapitalize } from "../../inputProps";
import {
  listBranches,
  openUrl,
  revealFileInFinder,
  revealPath,
} from "../../ipc";
import {
  forkUnavailableReason,
  recurringNestsUnderWorktree,
  repoName,
  scheduleNestsUnderWorktree,
  sessionLabel,
  worktreeGroupPaths,
} from "../../paths";
import { joinPath, kbdHint, revealLabel } from "../../platform";
import { formatFireTime, formatNextRun } from "../../time";
import {
  dedupeBranchLabels,
  mergeRepoOrder,
  ownedChildSessionIds,
  REPO_PALETTE,
  repoColor,
  repoOrder,
  useStore,
} from "../../store";
import type {
  BranchList,
  RecurringSession,
  ScheduledSession,
  SessionView,
} from "../../types";
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

/** Branch ordering for the repo-menu "Checkout branch…" picker (#266) — mirrors the
 * new-session modal's helpers: pin the well-known branches to the top, then git
 * order. (The picker UI isn't shared, so the tiny logic is replicated here.) */
const CHECKOUT_BRANCH_PRIORITY = ["main", "master", "dev", "develop"];
const checkoutBranchRank = (b: string) => {
  const i = CHECKOUT_BRANCH_PRIORITY.indexOf(b);
  return i === -1 ? CHECKOUT_BRANCH_PRIORITY.length : i;
};
const sortCheckoutBranches = (all: string[]) =>
  all.slice().sort((a, b) => checkoutBranchRank(a) - checkoutBranchRank(b));
/** The local name a remote-tracking ref pulls into (`origin/feature/foo` →
 * `feature/foo`); matches the backend dedup split (#180). */
const checkoutRemoteShort = (ref: string) => {
  const i = ref.indexOf("/");
  return i === -1 ? ref : ref.slice(i + 1);
};
/** Show the checkout picker's filter input only once the list is long enough (#266). */
const CHECKOUT_FILTER_THRESHOLD = 4;

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
 * uses the neutral `menuItem` style (the worktree header's Reveal / Copy, #133).
 * `confirmLabel` (#293) opts a row into an inline two-step confirm — the first
 * click swaps the row into a danger button showing `confirmLabel` (the menu stays
 * open), a second click runs it — honoring the #103 destructive-confirm setting
 * without a modal. Omit it for the default single-click behavior. */
type RowMenuItem = {
  label: string;
  onActivate: () => void;
  danger?: boolean;
  confirmLabel?: string;
};

/** A minimal cursor-positioned context menu for the non-agent sidebar rows
 * (#132/#133): renders one or more `items`, each calling its `onActivate` and
 * closing the menu. The non-agent rows show a single red Remove (or Cancel)
 * item; the worktree header (#133) shows two neutral items (Reveal in Finder,
 * Copy absolute path). Reuses the `.menuOverlay` / `.menu` classes. An item with
 * a `confirmLabel` gets a backward-compatible inline confirm (#293/#103): the
 * first click arms it (danger label, menu stays open), a second click runs it;
 * clicking any other item or dismissing resets. */
function RowContextMenu({
  menu,
  items,
  onClose,
}: {
  menu: { x: number; y: number } | null;
  items: RowMenuItem[];
  onClose: () => void;
}) {
  // Which item (by index) is armed for its inline confirm step (#293). Reset
  // whenever the menu opens or closes so a stale confirm never carries over.
  const [pending, setPending] = useState<number | null>(null);
  useEffect(() => {
    setPending(null);
  }, [menu]);
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
        {items.map((item, i) => {
          const confirming = pending === i && item.confirmLabel != null;
          return (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={
                confirming || item.danger
                  ? styles.menuItemDanger
                  : styles.menuItem
              }
              onClick={() => {
                // A confirm-gated item's first click arms it in place (#293) —
                // keep the menu open; the second click (below) runs it.
                if (item.confirmLabel != null && !confirming) {
                  setPending(i);
                  return;
                }
                onClose();
                item.onActivate();
              }}
            >
              {confirming ? item.confirmLabel : item.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** The absolute path of a sidebar file/Kanban row (#171): the folder root joined to
 * the (repo-relative) `file` with OS-native separators (#143 `joinPath` — backslashes
 * on Windows so a revealed/copied path is native), trailing separators on the root
 * trimmed so there's no double separator. For an out-of-repo file opened via Browse…
 * (#163) the root is the file's own parent dir, so this stays correct. `platform` is a
 * boot-constant, so the non-reactive store read is correct in this non-hook helper. */
function rowAbsPath(repoPath: string, file: string): string {
  return joinPath(useStore.getState().platform, repoPath, file);
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
      // OS-appropriate label (Finder ↔ Explorer, #143); `platform` is a boot-constant
      // so a non-reactive store read is correct here in a non-hook helper.
      label: revealLabel(useStore.getState().platform),
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
 * Canvas as a scheduled panel), click selects/jumps to it (#79), ▶ starts it now
 * (#269), × cancels. The whole label is the drag handle; a small activation distance
 * keeps clicks working. Right-click opens a single-item **Cancel** menu (#132). */
function ScheduleRow({
  schedule,
  selected,
  onOpen,
  onCancel,
  onStartNow,
}: {
  schedule: ScheduledSession;
  selected: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onStartNow: () => Promise<void>;
}) {
  // Disable ▶ while the spawn is in flight (the row vanishes on success via
  // `schedule://fired`; on failure it stays and the button re-enables).
  const [starting, setStarting] = useState(false);
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
        className={styles.scheduleStart}
        disabled={starting}
        onClick={() => {
          setStarting(true);
          void onStartNow().finally(() => setStarting(false));
        }}
        title="Start now"
        aria-label={`Start scheduled session ${label} now`}
      >
        <Play size={13} strokeWidth={1.5} />
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
        items={[
          { label: "Start now", onActivate: () => void onStartNow() },
          { label: "Cancel", onActivate: onCancel, danger: true },
        ]}
        onClose={closeMenu}
      />
    </div>
  );
}

/** A recurring-session row (#294): a dnd-kit draggable (drops into Canvas as a
 * recurring panel), click selects/jumps to it (#79), × cancels. The whole label is
 * the drag handle. A small "recurring" badge distinguishes it from a schedule, and a
 * relative "next run in …" time shows the cadence. Right-click → Cancel menu (#132). */
function RecurringRow({
  recurring,
  selected,
  onOpen,
  onCancel,
}: {
  recurring: RecurringSession;
  selected: boolean;
  onOpen: () => void;
  onCancel: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `recurring:${recurring.id}`,
      data: {
        kind: "recurring",
        recurringId: recurring.id,
        repoPath: recurring.cwd,
      },
    });
  const label =
    recurring.name?.trim() || recurring.branch || repoName(recurring.cwd);
  const { menu, openMenu, closeMenu } = useRowMenu();
  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      className={`${styles.scheduleRow} ${selected ? styles.scheduleRowSelected : ""} ${isDragging ? styles.scheduleRowDragging : ""}`}
      style={style}
      title={formatNextRun(recurring.next_fire_at)}
      onContextMenu={openMenu}
    >
      <button
        type="button"
        className={styles.scheduleMain}
        onClick={onOpen}
        {...attributes}
        {...listeners}
      >
        <RefreshCw
          size={13}
          strokeWidth={1.5}
          className={styles.scheduleIcon}
          aria-hidden
        />
        <span className={styles.scheduleName}>{label}</span>
        <span className={styles.recurringBadge}>recurring</span>
        <span className={styles.scheduleWhen}>
          {formatNextRun(recurring.next_fire_at).replace("next run ", "")}
        </span>
      </button>
      <button
        type="button"
        className={styles.scheduleCancel}
        onClick={onCancel}
        title="Cancel recurring session"
        aria-label={`Cancel recurring session ${label}`}
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

/**
 * The agent right-click menu (#228), shared by the expanded `SessionRow` and the
 * collapsed-rail dots so the two never diverge: **Rename**, **Fork conversation**
 * (gated #138/#142), **Copy session ID** (resume-only #142), **Open in canvas**
 * (#153), and **Remove**. Renders a full-window dismiss overlay + the positioned menu;
 * Escape also closes. The caller pre-clamps `{x, y}` to the viewport.
 */
function AgentContextMenu({
  session,
  x,
  y,
  onClose,
  onRename,
  onRemove,
}: {
  session: SessionView;
  x: number;
  y: number;
  onClose: () => void;
  onRename: () => void;
  onRemove: () => void;
}) {
  // Fork (#126) + copy session ID (#131) reuse the store directly — the same fork
  // action as the Overview/Canvas header buttons. Open in canvas (#153) reuses a tab.
  const forkSession = useStore((s) => s.forkSession);
  const copyToClipboard = useStore((s) => s.copyToClipboard);
  const openSessionInCanvas = useStore((s) => s.openSessionInCanvas);
  // Fork is unavailable (#138/#142) until the source has a real turn, or when the agent
  // can't fork at all (Codex); `forkReason` (Codex takes precedence) is the disabled
  // tooltip. Copy session ID is resume-only (#142).
  const forkReason = forkUnavailableReason(session);
  const canFork = forkReason === null;
  const canResume = agentSupportsResume(session.agent);

  // Escape closes the menu (keyboard-dismissable, like the repo menu #54).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
      <div className={styles.menu} style={{ left: x, top: y }} role="menu">
        <button
          type="button"
          role="menuitem"
          className={styles.menuItem}
          onClick={() => {
            onClose();
            onRename();
          }}
        >
          Rename
        </button>
        {/* Fork the agent's conversation (#131) — reuses the #126 action, same as the
            Overview/Canvas header fork buttons. */}
        <button
          type="button"
          role="menuitem"
          className={`${styles.menuItem} ${styles.menuItemView}`}
          aria-disabled={!canFork}
          title={forkReason ?? undefined}
          onClick={() => {
            if (!canFork) return;
            onClose();
            void forkSession(session.id);
          }}
        >
          <GitFork size={14} strokeWidth={1.5} className={styles.menuIcon} />
          Fork conversation
        </button>
        {/* Copy the claude session UUID (#131) — usable with `claude --resume`. Hidden
            for non-resumable agents (Codex, #142). */}
        {canResume && (
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => {
              onClose();
              void copyToClipboard(session.claudeSessionId, "session ID");
            }}
          >
            Copy session ID
          </button>
        )}
        {/* Open the agent in the Canvas view (#153): reuse its tab/detached window, else
            a new "Canvas N" tab. */}
        <button
          type="button"
          role="menuitem"
          className={`${styles.menuItem} ${styles.menuItemView}`}
          onClick={() => {
            onClose();
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
            onClose();
            onRemove();
          }}
        >
          Remove
        </button>
      </div>
    </>
  );
}

/** Clamp a right-click position so the agent menu never overflows the viewport
 * (#131/#153 — 5 items + a separator). Shared by the row + rail menu (#228). */
function clampAgentMenuPos(clientX: number, clientY: number) {
  return {
    x: Math.max(8, Math.min(clientX, window.innerWidth - 160)),
    y: Math.max(8, Math.min(clientY, window.innerHeight - 200)),
  };
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
  // Begin an inline rename when the collapsed-rail Rename requested it (#228): the
  // rail expands the sidebar, then this now-visible row auto-starts editing.
  const pendingRenameSessionId = useStore((s) => s.pendingRenameSessionId);
  const setPendingRenameSession = useStore((s) => s.setPendingRenameSession);

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

  // Right-click menu (#57/#228, now the shared AgentContextMenu) + the inline rename
  // editor. `menu` holds the clamped open position.
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const committed = useRef(false);

  // Consume a rail-originated rename request (#228): when the collapsed rail asks to
  // rename this agent (it expands the sidebar first, since the narrow rail has no room
  // for the editor), auto-begin editing once this row mounts, then clear the flag.
  useEffect(() => {
    if (pendingRenameSessionId !== session.id) return;
    setDraft(session.name ?? "");
    committed.current = false;
    setEditing(true);
    setPendingRenameSession(null);
  }, [
    pendingRenameSessionId,
    session.id,
    session.name,
    setPendingRenameSession,
  ]);

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
        setMenu(clampAgentMenuPos(event.clientX, event.clientY));
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
        <AgentContextMenu
          session={session}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onRename={beginRename}
          onRemove={onRemove}
        />
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
  const name = file.split(/[\\/]/).pop() || file;
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
  // Split on `/` **or** `\` (Windows parity, #224) so a Kanban ref with native
  // separators still shows its basename — matching `Overview.tsx`; `/`-only unchanged.
  const name = file.split(/[\\/]/).pop() || file;
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
  const isFiltered = useStore((s) => s.overviewRepoFilter?.path === path);
  const platform = useStore((s) => s.platform);
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
            // A worktree click shows only that worktree (#197); mode is moot for a
            // worktree path (it has no sub-worktrees), so the default "all" is fine.
            setOverviewRepoFilter(path, "all");
            setView("overview");
          }}
          title={`Filter Overview to ${branch}`}
          aria-pressed={isFiltered}
        >
          {branch}
        </button>
      )}
      {/* "worktree" badge (#240): now that the sub-group isn't indented, this chip is
          what distinguishes a worktree branch from the repo's own branch line — mirrors
          the Overview/Canvas badge. Right-aligned (the flex:1 name pushes it + the "+"
          to the right edge). Rail mode stays icon-only. */}
      {!compact && <span className={styles.worktreeBadge}>worktree</span>}
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
                  {revealLabel(platform)}
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
 * The repo's own current-branch line (#236) with its own right-click menu (#243).
 * A left-click still filters Overview to the repo (toggle), exactly like the repo
 * name (#34); a right-click opens a slim action menu — deliberately separate from
 * the repo **header** menu (`openRepoMenu`), which is unchanged. Because this is the
 * real checked-out directory (not an app-managed worktree), the menu offers **no**
 * "Forget folder" / worktree-style remove — its only destructive actions operate on
 * the folder's *contents* (Kill all agents / Close all items). It adds two items the
 * header menu lacks: **Copy branch name** and **Fetch** (`git fetch --prune`). Only
 * rendered for a git folder with a known current branch, so Pull / Fetch / Copy
 * branch name always have a real branch to act on.
 */
function RepoBranchLine({
  repo,
  branch,
  isFiltered,
}: {
  repo: string;
  branch: string;
  isFiltered: boolean;
}) {
  const allSessions = useStore((s) => s.sessions);
  const recurrings = useStore((s) => s.recurrings);
  // Exclude recurring-owned child agents (#294) from the kill counts below.
  const ownedChildIds = ownedChildSessionIds(recurrings);
  const sessions = allSessions.filter((s) => !ownedChildIds.has(s.id));
  const overviewPanels = useStore((s) => s.overviewPanels);
  const startRepoSession = useStore((s) => s.startRepoSession);
  const copyToClipboard = useStore((s) => s.copyToClipboard);
  const pullFolder = useStore((s) => s.pullFolder);
  const fetchFolder = useStore((s) => s.fetchFolder);
  const killAllAgents = useStore((s) => s.killAllAgents);
  const closeAllItems = useStore((s) => s.closeAllItems);
  const setRepoColor = useStore((s) => s.setRepoColor);
  const repoColors = useStore((s) => s.repoColors);
  const confirmDestructive = useStore((s) => s.settings.confirmDestructive);
  const platform = useStore((s) => s.platform);
  const setOverviewRepoFilter = useStore((s) => s.setOverviewRepoFilter);
  const setView = useStore((s) => s.setView);
  const { menu, openMenu, closeMenu } = useRowMenu();
  // Mirrors the header menu's `menuMode` minus its `confirm` (forget) mode — this
  // menu never forgets the folder.
  const [mode, setMode] = useState<
    "menu" | "color" | "confirm-kill" | "confirm-close"
  >("menu");
  // Reset to the base menu whenever it closes (Escape / overlay / action) so a
  // reopen never lands mid-submenu — mirrors the header menu's Escape reset.
  useEffect(() => {
    if (!menu) setMode("menu");
  }, [menu]);
  const close = () => {
    setMode("menu");
    closeMenu();
  };

  // Destructive-action gating, matching the header menu's counts (which include
  // worktree agents, #74).
  const runningAll = sessions.filter(
    (s) =>
      (s.repoPath === repo || s.worktreeParent === repo) &&
      s.exitedCode === undefined,
  ).length;
  const agentCount = sessions.filter(
    (s) => s.repoPath === repo || s.worktreeParent === repo,
  ).length;
  const panelCount = overviewPanels[repo]?.length ?? 0;

  return (
    <>
      <button
        type="button"
        className={`${styles.repoBranchLine} ${isFiltered ? styles.repoBranchActive : ""}`}
        onClick={() => {
          // The branch line filters to the repo's **own** directory agents only —
          // worktrees hidden (#247), distinct from the folder header's "all".
          setOverviewRepoFilter(repo, "own");
          setView("overview");
        }}
        onContextMenu={openMenu}
        title={`Show only ${repoName(repo)}'s own branch (hide worktrees)`}
        aria-pressed={isFiltered}
      >
        <GitBranch
          size={12}
          strokeWidth={1.5}
          className={styles.repoBranchIcon}
          aria-hidden
        />
        <span className={styles.repoBranchText} title={branch}>
          {branch}
        </span>
      </button>
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
            {mode === "color" ? (
              <div className={styles.colorPicker}>
                <div className={styles.swatches}>
                  {REPO_PALETTE.map((hex) => {
                    const isCurrent = repoColor(repo, repoColors) === hex;
                    return (
                      <button
                        key={hex}
                        type="button"
                        className={`${styles.swatch} ${isCurrent ? styles.swatchActive : ""}`}
                        style={{ background: hex }}
                        onClick={() => {
                          void setRepoColor(repo, hex);
                          close();
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
                    value={repoColor(repo, repoColors)}
                    onChange={(event) =>
                      void setRepoColor(repo, event.currentTarget.value)
                    }
                  />
                </label>
              </div>
            ) : mode === "confirm-kill" ? (
              <button
                type="button"
                role="menuitem"
                className={styles.menuDanger}
                onClick={() => {
                  void killAllAgents(repo);
                  close();
                }}
              >
                Kill {runningAll} agent{runningAll === 1 ? "" : "s"}?
              </button>
            ) : mode === "confirm-close" ? (
              <button
                type="button"
                role="menuitem"
                className={styles.menuDanger}
                onClick={() => {
                  void closeAllItems(repo);
                  close();
                }}
              >
                Close all items
                {runningAll > 0
                  ? ` (kill ${runningAll} agent${runningAll === 1 ? "" : "s"})`
                  : ""}
                ?
              </button>
            ) : (
              <>
                {/* New session (#243): mirrors the header `+` and header menu. */}
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    void startRepoSession(repo);
                    close();
                  }}
                >
                  New session
                </button>
                <div className={styles.menuSeparator} role="separator" />
                {/* The shared #164 add-view set (file/diff/terminal/kanban), so the
                    action set never diverges from the header / worktree menus. */}
                <div className={styles.menuSection}>Views</div>
                <ViewsMenu
                  repoPath={repo}
                  onClose={close}
                  includeNewSession={false}
                />
                <div className={styles.menuSeparator} role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    void revealPath(repo);
                    close();
                  }}
                >
                  {revealLabel(platform)}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    void copyToClipboard(repo, "path");
                    close();
                  }}
                >
                  Copy path
                </button>
                {/* Copy branch name (#243): new vs the header menu — the branch line
                    is the natural place to grab the current branch. */}
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    void copyToClipboard(branch, "branch name");
                    close();
                  }}
                >
                  Copy branch name
                </button>
                {/* Pull (#181): fast-forward the folder's current branch. The branch
                    line only renders with a known branch, so it's always shown. */}
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  title="git pull --ff-only"
                  onClick={() => {
                    void pullFolder(repo);
                    close();
                  }}
                >
                  Pull
                </button>
                {/* Fetch (#243): new vs the header menu — `git fetch --prune`, reusing
                    the #180 backend; refreshes branch labels on success. */}
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  title="git fetch --prune"
                  onClick={() => {
                    void fetchFolder(repo);
                    close();
                  }}
                >
                  Fetch
                </button>
                <div className={styles.menuSeparator} role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => setMode("color")}
                >
                  Change color…
                </button>
                {/* Destructive actions (#243): only ever operate on the folder's
                    *contents* — there is intentionally NO "Forget folder" /
                    worktree-style remove here (the header menu keeps Forget). */}
                {(runningAll > 0 || agentCount > 0 || panelCount > 0) && (
                  <div className={styles.menuSeparator} role="separator" />
                )}
                {runningAll > 0 && (
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItemDanger}
                    onClick={() => {
                      if (confirmDestructive) setMode("confirm-kill");
                      else {
                        void killAllAgents(repo);
                        close();
                      }
                    }}
                  >
                    Kill all agents
                  </button>
                )}
                {(agentCount > 0 || panelCount > 0) && (
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItemDanger}
                    onClick={() => {
                      // Confirm only when agents are running and confirms are on.
                      if (confirmDestructive && runningAll > 0)
                        setMode("confirm-close");
                      else {
                        void closeAllItems(repo);
                        close();
                      }
                    }}
                  >
                    Close all items
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </>
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
  const startScheduleNow = useStore((s) => s.startScheduleNow);
  const cancelRecurring = useStore((s) => s.cancelRecurring);
  const setOverviewRepoFilter = useStore((s) => s.setOverviewRepoFilter);
  const setView = useStore((s) => s.setView);
  const overviewRepoFilter = useStore((s) => s.overviewRepoFilter);
  const repoColors = useStore((s) => s.repoColors);
  const sessionBusy = useStore((s) => s.sessionBusy);
  const sessionActive = useStore((s) => s.sessionActive);
  const schedules = useStore((s) => s.schedules);
  const recurrings = useStore((s) => s.recurrings);
  const overviewPanels = useStore((s) => s.overviewPanels);
  // Recurring-owned child agents (#294) render only inside the recurring surfaces,
  // never as their own sidebar row — filter them out of the session lists below.
  const ownedChildIds = ownedChildSessionIds(recurrings);

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
    (s) => s.repoPath === repo && !s.worktreeParent && !ownedChildIds.has(s.id),
  );
  const isEmpty = repoSessions.length === 0;
  // Branch-line gate (#250): show the repo's own branch line only when the folder
  // has at least one of its *own* items opened — own sessions, own non-agent panels
  // (files/diffs/terminals/kanban), or own-folder schedules. A worktree sub-group
  // does NOT count (it keeps its own WorktreeHeader branch indicator), so a folder
  // whose only content is a worktree hides the repo's own branch line. Broader than
  // `isEmpty` (which counts only sessions and drives the greyed header), so it's a
  // separate flag.
  const hasOwnSchedules = schedules.some(
    (s) => s.cwd === repo && !scheduleNestsUnderWorktree(s),
  );
  const hasOwnRecurrings = recurrings.some(
    (r) => r.cwd === repo && !recurringNestsUnderWorktree(r),
  );
  const hasOwnItems =
    repoSessions.length > 0 ||
    (overviewPanels[repo]?.length ?? 0) > 0 ||
    hasOwnSchedules ||
    hasOwnRecurrings;
  // Split the active highlight (#247): the folder header lights for the "all" filter,
  // the branch line for the "own" filter — never both at once.
  const folderActive =
    overviewRepoFilter?.path === repo && overviewRepoFilter.mode === "all";
  const branchActive =
    overviewRepoFilter?.path === repo && overviewRepoFilter.mode === "own";
  // Primary label = the repo's branch, or the folder name when non-git / not yet
  // known. All sessions in a group share it, so index duplicates.
  const baseLabel = (branches[repo] ?? "") || repoName(repo);
  const rowLabels = dedupeBranchLabels(repoSessions.map(() => baseLabel));
  // Worktree agents (#74) of this repo, grouped by their worktree folder — rendered
  // as indented sub-groups below the repo's own sessions/items.
  const worktreeAgents = sessions.filter(
    (s) => s.worktreeParent === repo && !ownedChildIds.has(s.id),
  );
  // Pending worktree schedules for this repo (#218): a worktree schedule with a
  // computed `worktree_path` nests under a worktree sub-group keyed by that path —
  // the same key the live session uses after it fires — instead of at the parent
  // repo's in-folder level.
  const worktreeSchedules = schedules.filter(
    (s) => s.cwd === repo && scheduleNestsUnderWorktree(s),
  );
  // Worktree recurrings (#294) nest under their worktree sub-group the same way.
  const worktreeRecurrings = recurrings.filter(
    (r) => r.cwd === repo && recurringNestsUnderWorktree(r),
  );
  const worktreePaths = worktreeGroupPaths(
    worktreeAgents,
    worktreeSchedules,
    worktreeRecurrings,
  );

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
        className={`${styles.repoHeader} ${isEmpty ? styles.repoEmpty : ""} ${folderActive ? styles.repoActive : ""}`}
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
        {/* Left-click a repo title filters Overview to everything in the folder —
        repo + worktrees, the "all" mode (#247, toggle); right-click opens the #31
        context menu. */}
        <button
          type="button"
          className={styles.repoTitle}
          onClick={() => {
            setOverviewRepoFilter(repo, "all");
            setView("overview");
          }}
          title={`Filter Overview to ${repoName(repo)}`}
          aria-pressed={folderActive}
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

      {/* Current branch on its own line below the header (#236, supersedes the #225
          inline badge): echoes the worktree branch indicator (GitBranch icon + muted
          text) without its left-border sub-group framing. A full line of its own means
          a long branch never crowds the name / count / +. Same data + sync as #225
          (the `branches` map, kept current by the #212 edge + the focus/poll effect
          below); hidden for a non-git / unknown folder. Clicking it filters Overview to
          the repo (toggle), exactly like clicking the repo name (#34). */}
      {branches[repo] && hasOwnItems && (
        <RepoBranchLine
          repo={repo}
          branch={branches[repo]}
          isFiltered={branchActive}
        />
      )}

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
      cancel. Worktree schedules (#218) nest under their worktree sub-group below, so
      they're excluded here and render at the parent level only when they have no
      computed worktree path (pre-#218 records). */}
      {schedules
        .filter((s) => s.cwd === repo && !scheduleNestsUnderWorktree(s))
        .map((s) => (
          <ScheduleRow
            key={s.id}
            schedule={s}
            selected={s.id === selectedId}
            onOpen={() =>
              selectItem({ kind: "scheduled", id: s.id, repoPath: s.cwd })
            }
            onCancel={() => void cancelSchedule(s.id)}
            onStartNow={() => startScheduleNow(s.id)}
          />
        ))}

      {/* Recurring sessions for this repo (#294): name/branch + "next run in …" +
      cancel. Worktree recurrings nest under their worktree sub-group below. */}
      {recurrings
        .filter((r) => r.cwd === repo && !recurringNestsUnderWorktree(r))
        .map((r) => (
          <RecurringRow
            key={r.id}
            recurring={r}
            selected={r.id === selectedId}
            onOpen={() =>
              selectItem({ kind: "recurring", id: r.id, repoPath: r.cwd })
            }
            onCancel={() => void cancelRecurring(r.id)}
          />
        ))}

      {/* Isolated worktrees (#74/#240), rendered flush at this repo's own level (no
      indent): each worktree folder is a sub-group — a branch header with a "worktree"
      badge — and its agent(s). Their repo_path is the worktree, not this repo. */}
      {worktreePaths.map((wt) => {
        const wtAgents = worktreeAgents.filter((s) => s.repoPath === wt);
        const wtSchedules = worktreeSchedules.filter(
          (s) => s.worktree_path === wt,
        );
        const wtRecurrings = worktreeRecurrings.filter(
          (r) => r.worktree_path === wt,
        );
        // Prefer the live checked-out branch; for a worktree with only a pending
        // schedule / recurring (no live agent) fall back to its intended branch so the
        // header reads the real branch, not the sanitized folder basename.
        const wtBranch =
          (branches[wt] ?? "") ||
          (wtSchedules[0]?.branch ?? "") ||
          (wtRecurrings[0]?.branch ?? "") ||
          repoName(wt);
        const wtLabels = dedupeBranchLabels(wtAgents.map(() => wtBranch));
        return (
          <div key={wt} className={styles.worktreeGroup}>
            <WorktreeHeader
              path={wt}
              branch={wtBranch}
              parent={
                wtAgents[0]?.worktreeParent ?? wtSchedules[0]?.cwd ?? undefined
              }
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
            {/* Pending worktree schedules (#218) nest here alongside live agents,
            keyed by the shared worktree_path; the schedule's logical home stays the
            parent repo identity (its cwd) for select/jump. */}
            {wtSchedules.map((s) => (
              <ScheduleRow
                key={s.id}
                schedule={s}
                selected={s.id === selectedId}
                onOpen={() =>
                  selectItem({ kind: "scheduled", id: s.id, repoPath: s.cwd })
                }
                onCancel={() => void cancelSchedule(s.id)}
                onStartNow={() => startScheduleNow(s.id)}
              />
            ))}
            {/* Worktree recurrings (#294) nest here alongside live agents, keyed by
            the shared worktree_path; select/jump keeps the parent repo identity. */}
            {wtRecurrings.map((r) => (
              <RecurringRow
                key={r.id}
                recurring={r}
                selected={r.id === selectedId}
                onOpen={() =>
                  selectItem({ kind: "recurring", id: r.id, repoPath: r.cwd })
                }
                onCancel={() => void cancelRecurring(r.id)}
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
  const allSessions = useStore((s) => s.sessions);
  const recurrings = useStore((s) => s.recurrings);
  // Recurring-owned child agents (#294) never get their own rail dot / count — they
  // render only inside the recurring surfaces. Filter them from every session list.
  const railOwnedChildIds = ownedChildSessionIds(recurrings);
  const sessions = allSessions.filter((s) => !railOwnedChildIds.has(s.id));
  const recents = useStore((s) => s.recents);
  const branches = useStore((s) => s.branches);
  const selectedId = useStore((s) => s.selectedId);
  const selectItem = useStore((s) => s.selectItem);
  // Rail agent dots (#228): select/jump + a shared right-click menu (Remove kills the
  // agent; Rename expands the sidebar then auto-edits via setPendingRenameSession).
  const removeSession = useStore((s) => s.removeSession);
  const setSidebarCollapsed = useStore((s) => s.setSidebarCollapsed);
  const setPendingRenameSession = useStore((s) => s.setPendingRenameSession);
  const openNewSession = useStore((s) => s.openNewSession);
  const startRepoSession = useStore((s) => s.startRepoSession);
  const copyToClipboard = useStore((s) => s.copyToClipboard);
  const pullFolder = useStore((s) => s.pullFolder);
  const checkoutFolderBranch = useStore((s) => s.checkoutFolderBranch);
  const createFolderBranch = useStore((s) => s.createFolderBranch);
  const openSchedule = useStore((s) => s.openSchedule);
  const openRecurring = useStore((s) => s.openRecurring);
  const addFolder = useStore((s) => s.addFolder);
  const platform = useStore((s) => s.platform);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const confirmDestructive = useStore((s) => s.settings.confirmDestructive);
  const sidebarWidth = useStore((s) => s.sidebarWidth);
  const setSidebarWidth = useStore((s) => s.setSidebarWidth);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const toggleSidebarCollapsed = useStore((s) => s.toggleSidebarCollapsed);
  const autoNameOn = useStore((s) => s.settings.autoName);
  const folderOrder = useStore((s) => s.folderOrder);
  const refreshBranches = useStore((s) => s.refreshBranches);
  const refreshFileStatuses = useStore((s) => s.refreshFileStatuses);
  const forgetRepo = useStore((s) => s.forgetRepo);
  const killAllAgents = useStore((s) => s.killAllAgents);
  const closeAllItems = useStore((s) => s.closeAllItems);
  const killAllAgentsGlobal = useStore((s) => s.killAllAgentsGlobal);
  const closeAllItemsGlobal = useStore((s) => s.closeAllItemsGlobal);
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
    "menu" | "confirm" | "confirm-kill" | "confirm-close" | "color" | "checkout"
  >("menu");
  // Checkout-branch picker (#266): the repo menu's "Checkout branch…" sub-mode loads
  // the folder's branches (cached remotes only — no network), filters them, and offers
  // an inline create-new form. State is reset whenever the sub-mode (re)opens.
  const [checkoutList, setCheckoutList] = useState<BranchList | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutFilter, setCheckoutFilter] = useState("");
  const [checkoutCreating, setCheckoutCreating] = useState(false);
  const [checkoutNewName, setCheckoutNewName] = useState("");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  // Collapsed-rail agent right-click menu (#228): the clicked session + clamped pos.
  const [railMenu, setRailMenu] = useState<{
    session: SessionView;
    x: number;
    y: number;
  } | null>(null);
  // Feedback nudge (#241): a one-shot glowing tooltip beside the footer feedback
  // button, shown on every launch (no persistence — plain state). Auto-hides after
  // 10s or as soon as the button is hovered/focused; never shown in the collapsed
  // rail (no horizontal room). The pill is position:fixed (it escapes `.sidebar`'s
  // overflow:hidden so the full text shows at any width), anchored to the button's
  // measured rect.
  const [feedbackNudgeDismissed, setFeedbackNudgeDismissed] = useState(false);
  const [feedbackNudgePos, setFeedbackNudgePos] = useState<{
    top: number;
    left: number;
    maxWidth: number;
  } | null>(null);
  const feedbackBtnRef = useRef<HTMLButtonElement | null>(null);
  const showFeedbackNudge = !feedbackNudgeDismissed && !sidebarCollapsed;
  // Start the 10s countdown when the nudge first becomes visible and measure the
  // button so the fixed pill anchors to it. Re-runs if it becomes visible again
  // (e.g. expanding after a collapsed launch); cleared on dismiss/unmount.
  useEffect(() => {
    if (!showFeedbackNudge) {
      setFeedbackNudgePos(null);
      return;
    }
    const btn = feedbackBtnRef.current;
    if (btn) {
      const r = btn.getBoundingClientRect();
      // The sidebar's left edge is at viewport x=0 and its width is `sidebarWidth`,
      // so clamp the pill's width to stay inside the panel (8px gutter at the edge)
      // — it overlays the space to the right of the icon and never spills past the
      // sidebar's right edge.
      const left = r.right + 8;
      const RIGHT_INSET = 8;
      const maxWidth = Math.max(0, sidebarWidth - left - RIGHT_INSET);
      setFeedbackNudgePos({ top: r.top + r.height / 2, left, maxWidth });
    }
    const timer = setTimeout(() => setFeedbackNudgeDismissed(true), 10000);
    return () => clearTimeout(timer);
  }, [showFeedbackNudge, sidebarWidth]);
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
  // The ⋯ overflow menu (#294) next to "Schedule session": extra session-creation
  // options. Reuses the shared cursor-menu primitive; later cards (Clone Repo #295,
  // Auto-continue #296) add entries here.
  const dotsMenu = useRowMenu();
  const dotsMenuItems: RowMenuItem[] = [
    { label: "Recurring session…", onActivate: () => openRecurring() },
  ];
  // App-wide bulk-action counts (#293) — every running agent (the #91 `exitedCode
  // === undefined` predicate) and every non-agent item, across all folders.
  const globalRunning = sessions.filter(
    (s) => s.exitedCode === undefined,
  ).length;
  const globalPanels = Object.values(overviewPanels).reduce(
    (n, ps) => n + ps.length,
    0,
  );
  const bgMenuItems: RowMenuItem[] = [
    { label: "New folder…", onActivate: () => void addFolder() },
    { label: "New session", onActivate: () => openNewSession() },
    { label: "Schedule session", onActivate: () => openSchedule() },
    { label: "Recurring session…", onActivate: () => openRecurring() },
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
    // Global destructive complements to the per-repo #91 actions — placed after
    // the constructive items; each shown only when it has something to act on, and
    // inline-confirm-gated per the #103 setting (Close all items only when it kills).
    ...(globalRunning > 0
      ? [
          {
            label: "Kill all agents",
            danger: true,
            confirmLabel: confirmDestructive
              ? `Kill ${globalRunning} agent${globalRunning === 1 ? "" : "s"}?`
              : undefined,
            onActivate: () => void killAllAgentsGlobal(),
          },
        ]
      : []),
    ...(globalRunning > 0 || globalPanels > 0
      ? [
          {
            label: "Close all items",
            danger: true,
            confirmLabel:
              confirmDestructive && globalRunning > 0
                ? `Close all items (kill ${globalRunning} agent${globalRunning === 1 ? "" : "s"})?`
                : undefined,
            onActivate: () => void closeAllItemsGlobal(),
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
  // Recurring sessions keep their repo listed even before their first fire adds it to
  // recents (#294), so a recurring-only folder never vanishes after a restart.
  const recurringRepos = recurrings.map((r) => r.cwd);
  const repos = mergeRepoOrder(
    folderOrder,
    repoOrder(
      [...recents, ...worktreeParents, ...recurringRepos],
      sessions.filter((s) => !s.worktreeParent),
    ),
  );
  const reposKey = repos.join("\n");

  useEffect(() => {
    // Refresh branch labels only when the set of repos changes — not on every
    // session mutation (exit, output) that allocates a new sessions array. The
    // FileTree git-status coloring (#252) refreshes on the same cadence so an open
    // tree shows current state right after boot / a repo being added.
    void refreshBranches();
    void refreshFileStatuses();
  }, [refreshBranches, refreshFileStatuses, reposKey]);

  // Keep the repo branch badges (#225) in sync with **external** checkouts — a `git
  // checkout` in a terminal of an idle repo (no busy→idle edge, #212) or in another
  // tool. The #212 edge refresh stays; this adds (a) a refresh when the window regains
  // focus / becomes visible ("changed it elsewhere, came back"), and (b) a modest poll
  // while the window is visible, paused when hidden. `refreshBranches` batches every
  // repo into one `currentBranches` IPC call, so a tick is one call. Main-window only —
  // the Sidebar mounts only there. The interval is tunable.
  useEffect(() => {
    const BRANCH_POLL_MS = 15_000;
    let timer: ReturnType<typeof setInterval> | undefined;
    const startPoll = () => {
      if (timer === undefined) {
        timer = setInterval(() => void refreshBranches(), BRANCH_POLL_MS);
      }
    };
    const stopPoll = () => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        stopPoll();
      } else {
        void refreshBranches();
        startPoll();
      }
    };
    const onFocus = () => void refreshBranches();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) startPoll();
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      stopPoll();
    };
  }, [refreshBranches]);

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

  // Load the folder's branches when the checkout sub-mode opens (#266). Cached
  // remotes only — no `fetchRemotes` network read, keeping the menu snappy. Reset
  // the picker state on each (re)open / repo change.
  useEffect(() => {
    if (menuMode !== "checkout" || !menu) return;
    const repo = menu.repo;
    setCheckoutList(null);
    setCheckoutLoading(true);
    setCheckoutFilter("");
    setCheckoutCreating(false);
    setCheckoutNewName("");
    setCheckoutError(null);
    setCheckoutBusy(false);
    let cancelled = false;
    void listBranches(repo)
      .then((bl) => {
        if (!cancelled) setCheckoutList(bl);
      })
      .catch(() => {
        if (!cancelled) setCheckoutList({ all: [], current: "", remote: [] });
      })
      .finally(() => {
        if (!cancelled) setCheckoutLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [menuMode, menu]);

  // Filtered + ordered branch rows for the checkout picker (#266): locals pinned-then-
  // git-order, remotes in git order, both narrowed by the filter input.
  const checkoutQuery = checkoutFilter.trim().toLowerCase();
  const checkoutLocals = checkoutList
    ? sortCheckoutBranches(checkoutList.all).filter(
        (b) => !checkoutQuery || b.toLowerCase().includes(checkoutQuery),
      )
    : [];
  const checkoutRemotes = checkoutList
    ? (checkoutList.remote ?? []).filter(
        (r) => !checkoutQuery || r.toLowerCase().includes(checkoutQuery),
      )
    : [];

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
        title={`New session ${kbdHint(platform, "⌘N", "Ctrl+N")}`}
        aria-label="New session"
      >
        <Plus size={18} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        className={styles.railButton}
        onClick={() => openSchedule()}
        title={`Schedule session ${kbdHint(platform, "⌘⇧N", "Ctrl+Shift+N")}`}
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
          // The rail folder is the folder affordance ("all"); it lights for an "all"
          // filter on this repo (#247) — the rail has no branch line for "own".
          const isFiltered =
            overviewRepoFilter?.path === repo &&
            overviewRepoFilter.mode === "all";
          const baseLabel = (branches[repo] ?? "") || repoName(repo);
          const worktreeAgents = sessions.filter(
            (s) => s.worktreeParent === repo,
          );
          const worktreePaths = [
            ...new Set(worktreeAgents.map((s) => s.repoPath)),
          ];
          // Rail agent dot (#228): now a clickable, selectable target — left-click
          // selects/jumps; right-click opens the shared agent menu (stopPropagation so
          // it isn't the rail's background/repo menu). The BusyIndicator is the dot.
          const dot = (s: SessionView, base: string) => {
            const dotLabel = sessionLabel(
              s.name,
              autoNameOn ? s.autoName : null,
              base,
            ).primary;
            return (
              <button
                key={s.id}
                type="button"
                className={`${styles.railDot} ${s.id === selectedId ? styles.railDotSelected : ""}`}
                onClick={() =>
                  selectItem({
                    kind: "agent",
                    id: s.id,
                    repoPath: s.repoPath,
                  })
                }
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const pos = clampAgentMenuPos(event.clientX, event.clientY);
                  setRailMenu({ session: s, x: pos.x, y: pos.y });
                }}
                title={dotLabel}
                aria-label={dotLabel}
              >
                <BusyIndicator
                  busy={sessionBusy[s.id] ?? false}
                  hasBeenActive={sessionActive[s.id] ?? false}
                />
              </button>
            );
          };
          return (
            <div key={repo} className={styles.railRepo}>
              <button
                type="button"
                className={`${styles.railFolder} ${isFiltered ? styles.railFolderActive : ""}`}
                style={{ color: repoColor(repo, repoColors) }}
                onClick={() => {
                  setOverviewRepoFilter(repo, "all");
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
      {/* Shared agent right-click menu for the rail (#228). Rename has no room in the
          narrow rail, so it expands the sidebar + requests an inline rename on the
          now-visible row (consumed via pendingRenameSessionId). */}
      {railMenu && (
        <AgentContextMenu
          session={railMenu.session}
          x={railMenu.x}
          y={railMenu.y}
          onClose={() => setRailMenu(null)}
          onRename={() => {
            setSidebarCollapsed(false);
            selectItem({
              kind: "agent",
              id: railMenu.session.id,
              repoPath: railMenu.session.repoPath,
            });
            setPendingRenameSession(railMenu.session.id);
          }}
          onRemove={() => void removeSession(railMenu.session.id)}
        />
      )}
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
            <kbd className={styles.kbd}>
              {kbdHint(platform, "⌘N", "Ctrl+N")}
            </kbd>
          </button>

          {/* Schedule a session to launch later (#93) — same flow, plus a time step.
          The ⋯ overflow button (#294) opens a dropdown of extra session-creation
          options (Recurring session…, and later cards). */}
          <div className={styles.scheduleActionRow}>
            <button
              type="button"
              className={styles.scheduleButton}
              onClick={() => openSchedule()}
            >
              <Clock size={15} strokeWidth={1.5} />
              Schedule session
              <kbd className={styles.kbd}>
                {kbdHint(platform, "⌘⇧N", "Ctrl+Shift+N")}
              </kbd>
            </button>
            <button
              type="button"
              className={styles.dotsButton}
              onClick={dotsMenu.openMenu}
              title="More session options"
              aria-label="More session options"
              aria-haspopup="menu"
            >
              <MoreHorizontal size={16} strokeWidth={1.5} />
            </button>
          </div>
          <RowContextMenu
            menu={dotsMenu.menu}
            items={dotsMenuItems}
            onClose={dotsMenu.closeMenu}
          />

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
            the default browser. Stacks with the others in the collapsed rail.
            Hovering/focusing it dismisses the #241 nudge. */}
        <button
          ref={feedbackBtnRef}
          type="button"
          className={styles.footerButton}
          onClick={() => void openUrl(FEEDBACK_FORM_URL)}
          onMouseEnter={() => setFeedbackNudgeDismissed(true)}
          onFocus={() => setFeedbackNudgeDismissed(true)}
          title="Send feedback"
          aria-label="Send feedback"
        >
          <Bug size={16} strokeWidth={1.5} />
        </button>
        {/* Attention nudge (#241): a glowing pill to the right of the feedback button,
            position:fixed (anchored to the button's measured rect) so it escapes the
            sidebar's overflow clip and shows its full text at any width.
            pointer-events:none + aria-hidden so it never blocks the button or
            double-announces (the button is already labeled). */}
        {showFeedbackNudge && feedbackNudgePos && (
          <div
            className={styles.feedbackNudge}
            style={{
              top: feedbackNudgePos.top,
              left: feedbackNudgePos.left,
              maxWidth: feedbackNudgePos.maxWidth,
            }}
            aria-hidden="true"
          >
            Report bugs &amp; features
          </div>
        )}
        {/* Collapse/expand (#168) sits at the far right of the expanded footer row
            (#219, `margin-left:auto`); Settings + Feedback stay grouped left. The
            `.footerCollapsed` rail neutralizes that margin so the icon stays centered
            in the vertical stack. */}
        <button
          type="button"
          className={`${styles.footerButton} ${styles.footerCollapseToggle}`}
          onClick={() => toggleSidebarCollapsed()}
          title={`${sidebarCollapsed ? "Expand" : "Collapse"} sidebar ${kbdHint(
            platform,
            "⌘B",
            "Ctrl+B",
          )}`}
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
            {menuMode === "checkout" ? (
              <div className={styles.checkout}>
                {/* Destructive-checkout advisory (#266, mirrors the new-session modal):
                    non-blocking, but visible — a checkout rewrites the working tree of
                    any agents running in this folder. */}
                {menuRunning > 0 && (
                  <div className={styles.checkoutWarning} role="alert">
                    <AlertTriangle
                      size={13}
                      strokeWidth={1.5}
                      className={styles.checkoutWarnIcon}
                    />
                    <span>
                      {menuRunning} agent{menuRunning === 1 ? "" : "s"} running
                      here — checkout changes their working tree.
                    </span>
                  </div>
                )}
                {checkoutLoading ? (
                  <p className={styles.checkoutEmpty}>Loading branches…</p>
                ) : (
                  <>
                    {(checkoutList?.all.length ?? 0) >
                      CHECKOUT_FILTER_THRESHOLD && (
                      <input
                        className={styles.checkoutFilter}
                        {...noAutoCapitalize}
                        type="text"
                        value={checkoutFilter}
                        placeholder="Filter branches…"
                        onChange={(event) =>
                          setCheckoutFilter(event.currentTarget.value)
                        }
                        aria-label="Filter branches"
                        autoFocus={!checkoutCreating}
                      />
                    )}
                    <div
                      className={styles.checkoutList}
                      role="listbox"
                      aria-label="Branch"
                    >
                      {checkoutLocals.length === 0 &&
                      checkoutRemotes.length === 0 ? (
                        <p className={styles.checkoutEmpty}>
                          No matching branches.
                        </p>
                      ) : (
                        <>
                          {checkoutLocals.map((b) => {
                            const isCurrent = b === checkoutList?.current;
                            return (
                              <button
                                key={b}
                                type="button"
                                role="option"
                                aria-selected={isCurrent}
                                aria-disabled={isCurrent || checkoutBusy}
                                className={`${styles.checkoutBranch} ${isCurrent ? styles.checkoutBranchCurrent : ""}`}
                                onClick={() => {
                                  if (isCurrent || checkoutBusy) return;
                                  void checkoutFolderBranch(menu.repo, b);
                                  closeMenu();
                                }}
                                title={b}
                              >
                                <GitBranch
                                  size={13}
                                  strokeWidth={1.5}
                                  className={styles.menuIcon}
                                />
                                <span className={styles.checkoutBranchName}>
                                  {b}
                                </span>
                                {isCurrent && (
                                  <span className={styles.checkoutCurrent}>
                                    current
                                  </span>
                                )}
                              </button>
                            );
                          })}
                          {checkoutRemotes.length > 0 && (
                            <>
                              <p className={styles.checkoutRemoteHeader}>
                                Remote branches
                              </p>
                              {checkoutRemotes.map((r) => (
                                <button
                                  key={r}
                                  type="button"
                                  role="option"
                                  aria-disabled={checkoutBusy}
                                  className={styles.checkoutBranch}
                                  onClick={() => {
                                    if (checkoutBusy) return;
                                    setCheckoutBusy(true);
                                    setCheckoutError(null);
                                    void createFolderBranch(
                                      menu.repo,
                                      checkoutRemoteShort(r),
                                      r,
                                    ).then((res) => {
                                      if (res === true) closeMenu();
                                      else {
                                        setCheckoutError(res);
                                        setCheckoutBusy(false);
                                      }
                                    });
                                  }}
                                  title={`${r} — check out as a local branch`}
                                >
                                  <GitBranch
                                    size={13}
                                    strokeWidth={1.5}
                                    className={styles.menuIcon}
                                  />
                                  <span className={styles.checkoutBranchName}>
                                    {r}
                                  </span>
                                </button>
                              ))}
                            </>
                          )}
                        </>
                      )}
                    </div>
                    {/* Create + check out a new branch off the current one (#266). */}
                    {checkoutCreating ? (
                      <div className={styles.checkoutCreate}>
                        <input
                          className={styles.checkoutFilter}
                          {...noAutoCapitalize}
                          type="text"
                          value={checkoutNewName}
                          placeholder="New branch name…"
                          onChange={(event) => {
                            setCheckoutNewName(event.currentTarget.value);
                            setCheckoutError(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              const name = checkoutNewName.trim();
                              if (!name || checkoutBusy) return;
                              setCheckoutBusy(true);
                              setCheckoutError(null);
                              void createFolderBranch(
                                menu.repo,
                                name,
                                branches[menu.repo] ?? "",
                              ).then((res) => {
                                if (res === true) closeMenu();
                                else {
                                  setCheckoutError(res);
                                  setCheckoutBusy(false);
                                }
                              });
                            }
                          }}
                          aria-label="New branch name"
                          autoFocus
                        />
                        <span className={styles.checkoutCreateBase}>
                          from {branches[menu.repo] || "HEAD"} — ↵ to create
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={`${styles.menuItem} ${styles.checkoutCreateToggle}`}
                        onClick={() => {
                          setCheckoutCreating(true);
                          setCheckoutError(null);
                        }}
                      >
                        <Plus
                          size={13}
                          strokeWidth={1.5}
                          className={styles.menuIcon}
                        />
                        Create new branch
                      </button>
                    )}
                    {checkoutError && (
                      <p className={styles.checkoutError} role="alert">
                        {checkoutError}
                      </p>
                    )}
                  </>
                )}
              </div>
            ) : menuMode === "color" ? (
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
                  {revealLabel(platform)}
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
                {/* Checkout branch… (#266): pick an existing local/remote branch or
                    create a new one and `git checkout` it in this folder (no agent
                    spawn). Gated like Pull on a known current branch (git folder). */}
                {branches[menu.repo] && (
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    onClick={() => setMenuMode("checkout")}
                  >
                    Checkout branch…
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
