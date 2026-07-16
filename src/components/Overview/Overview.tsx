import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Clock,
  GripVertical,
  Maximize2,
  Play,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { noAutoCapitalize } from "../../inputProps";
import {
  overviewClusters,
  ownedChildSessionIds,
  repoColor,
  useStore,
} from "../../store";
import {
  effectiveRepo,
  repoName,
  sessionInFilter,
  sessionLabel,
} from "../../paths";
import { formatFireTime, formatInterval, formatNextRun } from "../../time";
import {
  detectedWorktreeParents,
  sessionActiveWorktree,
} from "../../worktrees";
import type {
  OverviewPanel,
  RecurringSession,
  ScheduledSession,
  SessionView,
} from "../../types";
import { overviewPanelToContent } from "../Canvas/canvasDrop";
import AutoContinueToggle from "../AutoContinueToggle/AutoContinueToggle";
import BusyIndicator from "../BusyIndicator/BusyIndicator";
import EmptyState from "../EmptyState/EmptyState";
import TipRow from "../TipRow/TipRow";
import FileSwitcher from "../FileSwitcher/FileSwitcher";
// The shared item renderer (#157) maps a content descriptor → the right live child
// (terminal / file / kanban / diff / scheduled) with the big-mode placeholder —
// one source of truth shared with Canvas + the modal.
import ItemContent from "../ItemContent/ItemContent";
import OpenViewButton from "../OpenViewButton/OpenViewButton";
import AgentHeaderMenu from "../AgentHeaderMenu/AgentHeaderMenu";
import { useKeybindLabel } from "../../useKeybind";
import { shouldHoverSelect } from "../Terminal/hoverFocus";
import { blurTerminals, focusTerminal } from "../Terminal/terminalPool";
import { TerminalScrollRootContext } from "../Terminal/useVisibleOnce";
import { overviewIsEmpty } from "../WaveBackground/wavePresets";
import styles from "./Overview.module.css";

// A hover-driven select (#371) must not scroll the wall: scrollIntoView would move
// the cards under the stationary cursor, hover-entering a different card — a
// select/scroll feedback cascade. Set right before a hover select, consumed by the
// selection scroll effect that select() triggers.
let hoverSelecting = false;

/**
 * The horizontally scrolling agent wall — and the observer root for the #351 terminal
 * visibility gate.
 *
 * A pooled xterm is now created on a card's first visibility, and `IntersectionObserver`
 * clips a target against every intermediate scroll container *before* applying
 * `rootMargin` — so a viewport-rooted observer could never pre-load a card scrolled out of
 * this `overflow-x: auto` wall (its horizontal margin would be dead). Providing the wall
 * element as the observer root makes the pre-load margin real. Everywhere else the context
 * stays `null` ⇒ the viewport root, which is correct for Canvas panels, big mode (#157) and
 * detached windows (#84). The provider value is the stable ref object, so this adds no
 * re-renders.
 */
function Wall({
  wallRef,
  children,
}: {
  wallRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  return (
    <TerminalScrollRootContext.Provider value={wallRef}>
      <div ref={wallRef} className={styles.wall}>
        {children}
      </div>
    </TerminalScrollRootContext.Provider>
  );
}

/**
 * Shared column chrome (#38): every Overview column — an agent terminal, a diff
 * panel (#39), or a markdown panel (#41) — renders inside this frame (repo-color
 * top band, drag handle, header with a title + actions, and a body). It is a
 * dnd-kit sortable item (#43): keyed by a stable `id` (session id / panel id) so
 * a drag-reorder reparents the DOM node — React never remounts it and the
 * persistent terminal pool (#18) is untouched.
 */
interface PanelColumnProps {
  id: string;
  color: string;
  selected?: boolean;
  /** Cap the card at 900px (task 379) — the 373 "cap Overview panel width" setting
   * (task 419): when on, every Overview column type caps at 900px (agent, recurring,
   * file, diff, terminal, kanban/filetree, and scheduled panels alike). */
  capped?: boolean;
  title: ReactNode;
  /** Optional slot before the title (e.g. the agent activity indicator, #71). */
  leading?: ReactNode;
  actions: ReactNode;
  /** Optional thin strip rendered between the header and the body (e.g. the #297
   * per-agent auto-continue toggle). It provides its own chrome, so when it renders
   * nothing (`null`) no empty bar appears. Not part of the drag handle. */
  subheader?: ReactNode;
  onClickBody?: () => void;
  /** Hover-select (#371): the PTY session this window renders for the card, focused
   * when the pointer enters it; `undefined` ⇒ the card has no local terminal input,
   * so entering it blurs the previously focused xterm instead. */
  ptyFocusId?: string;
  children: ReactNode;
}

function PanelColumn({
  id,
  color,
  selected = false,
  capped = false,
  title,
  leading,
  actions,
  subheader,
  onClickBody,
  ptyFocusId,
  children,
}: PanelColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style = {
    borderTopColor: color,
    // Folder-color border/selection ring (task 386): the resting tint + selection
    // ring resolve `--repo-color` off this per-repo color instead of the app accent,
    // so selection never rides the accent (UI v2 §7). A worktree agent shares its
    // parent repo's color (its cluster's `color` already comes via `effectiveRepo`).
    "--repo-color": color,
    transform: CSS.Transform.toString(transform),
    transition,
  } as CSSProperties;
  // Hover-select (#371, extending #368): entering the card moves the selection ring
  // here (same path as a body click) — focusing its terminal when this window renders
  // one, otherwise blurring the previously focused xterm so keystrokes never silently
  // keep flowing to it. The `hoverSelecting` flag keeps the wall from auto-scrolling
  // under the stationary cursor; it is raised only when the selection actually
  // changes, so it can never linger and swallow a later explicit scroll.
  const autoFocusOnHover = useStore((s) => s.settings.autoFocusOnHover);
  const handleHoverEnter = (e: ReactMouseEvent) => {
    if (!shouldHoverSelect(autoFocusOnHover, e.buttons, document.activeElement))
      return;
    if (ptyFocusId) focusTerminal(ptyFocusId);
    else blurTerminals();
    if (!selected && onClickBody) {
      hoverSelecting = true;
      onClickBody(); // the card's select action — same as a body click
    }
  };
  return (
    <div
      ref={setNodeRef}
      data-item-id={id}
      className={`${styles.card} ${selected ? styles.cardSelected : ""} ${capped ? styles.cardCapped : ""} ${isDragging ? styles.cardDragging : ""}`}
      style={style}
      onMouseEnter={handleHoverEnter}
    >
      {/* The whole title bar is the drag handle (#70): dnd-kit attributes make it
          focusable for keyboard + screen-reader drag; the grip is just a visual
          hint. The .actions group stops pointerdown so its buttons stay clickable
          and never start a drag. The body (a sibling) stays separately clickable. */}
      <header className={styles.header} {...attributes} {...listeners}>
        <span className={styles.dragHandle} title="Drag to reorder" aria-hidden>
          <GripVertical size={13} strokeWidth={1.5} />
        </span>
        {leading}
        <div className={styles.titleBlock}>{title}</div>
        <div
          className={styles.actions}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {actions}
        </div>
      </header>
      {subheader}
      <div className={styles.body} onClick={onClickBody}>
        {children}
      </div>
    </div>
  );
}

interface SessionCardProps {
  session: SessionView;
  branch: string;
  color: string;
  selected: boolean;
  busy: boolean;
  /** The session has been active at least once (#112) → yellow when idle. */
  hasBeenActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

function SessionCard({
  session,
  branch,
  color,
  selected,
  busy,
  hasBeenActive,
  onSelect,
  onRemove,
}: SessionCardProps) {
  const maximizeItem = useStore((s) => s.maximizeItem);
  const bigModeKey = useKeybindLabel("big-mode");
  const renameSession = useStore((s) => s.renameSession);
  // The "cap Overview panel width" setting (373/419, default on): when on, every
  // Overview column caps at 900px — agent, recurring, file/diff/kanban/terminal, and
  // scheduled panels alike.
  const capWidth = useStore((s) => s.settings.capAgentWidth);
  // Hover-select (#371): hovering the card focuses this window's own live mirror
  // of the agent's terminal (task 437 — every window renders its sessions locally).
  // Agent label (#95): a single line showing only the primary — the custom name if
  // set, else the branch (folder name when non-git). No subtitle, no repo dot; repo
  // color reads from the card's top band (#36). `sessionLabel` still computes the
  // subtitle (#67) — agent surfaces just don't render it.
  // The #100 "auto-name" setting gates claude's auto-title (#97): off → the label
  // skips the auto-name and falls straight to the branch.
  const autoNameOn = useStore((s) => s.settings.autoName);
  // Relocation hint: the agent is currently working INSIDE a detected worktree
  // (per its own cwd / the heuristic) — a static "worktree" chip beside fork/
  // container. Record worktree agents (`worktreeParent`) return null here (their
  // #226 meta line already tells the story).
  const platform = useStore((s) => s.platform);
  const repoWorktreeEntries = useStore(
    (s) => s.repoWorktrees[effectiveRepo(session)],
  );
  const heuristicWorktrees = useStore((s) => s.heuristicWorktrees);
  const activeWorktree = sessionActiveWorktree(
    session,
    (repoWorktreeEntries ?? [])
      .filter((e) => !e.is_main && e.exists)
      .map((e) => e.path),
    heuristicWorktrees,
    platform,
  );
  const fallbackLabel = branch || repoName(session.repoPath);
  const { primary } = sessionLabel(
    session.name,
    autoNameOn ? session.autoName : null,
    fallbackLabel,
  );

  // Double-click the card header title to rename the agent inline (#188) — the same
  // state machine as the sidebar rename (#57): seed the current custom name,
  // placeholder = the derived label it reverts to, Enter/blur commit, Escape
  // cancels, a `committed` guard against double-commit. The input stops pointerdown
  // so the header drag (#70) can't grab it.
  const renamePlaceholder = sessionLabel(
    undefined,
    autoNameOn ? session.autoName : null,
    fallbackLabel,
  ).primary;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const committed = useRef(false);
  const beginRename = () => {
    setDraft(session.name ?? "");
    committed.current = false;
    setEditing(true);
  };
  const finishRename = () => {
    if (committed.current) return;
    committed.current = true;
    setEditing(false);
    void renameSession(session.id, draft);
  };
  const cancelRename = () => {
    committed.current = true;
    setEditing(false);
  };

  const titleRow = editing ? (
    <input
      className={styles.renameInput}
      {...noAutoCapitalize}
      autoFocus
      value={draft}
      placeholder={renamePlaceholder}
      onPointerDown={(event) => event.stopPropagation()}
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
      aria-label="Rename agent"
    />
  ) : (
    <span className={styles.agentTitle}>
      {/* preventDefault avoids selecting the title text on double-click (#188). */}
      <span
        className={styles.name}
        onDoubleClick={(event) => {
          event.preventDefault();
          beginRename();
        }}
      >
        {primary}
      </span>
      {/* A fork (#126) shares the source's auto-title, so a badge distinguishes them. */}
      {session.forkedFrom && <span className={styles.worktreeBadge}>fork</span>}
      {/* A dev-container session runs inside docker — a static badge (the #213
          worktree-badge pattern) marks it. */}
      {session.containerImage && (
        <span className={styles.worktreeBadge}>container</span>
      )}
      {/* The agent relocated itself into a worktree (EnterWorktree — its sidebar
          row moved under that worktree's group); the same static-badge pattern
          marks the card, with the worktree path as the tooltip. */}
      {activeWorktree && (
        <span className={styles.worktreeBadge} title={activeWorktree}>
          worktree
        </span>
      )}
    </span>
  );
  // Folder · branch indicator for every agent (#226, replacing the #213 "worktree"
  // badge) — mirrors the Kanban/file panel header. Folder = the parent repo name
  // (`effectiveRepo`), so a worktree agent reads "myrepo · feature-x" (not the
  // sanitized worktree-folder basename); branch = the agent's current branch.
  const title = (
    <>
      {titleRow}
      <span className={styles.meta}>
        <span className={styles.metaText}>
          {repoName(effectiveRepo(session))}
          {branch && ` · ${branch}`}
        </span>
      </span>
    </>
  );
  const actions = (
    <>
      {/* "Open view or start a session" in the agent's folder (#165/#213) — now for
          worktree agents too: `session.repoPath` is the worktree folder, so views
          open against the worktree (the old clickable "worktree" badge is now a
          static indicator in the title). */}
      <OpenViewButton repoPath={session.repoPath} className={styles.action} />
      {/* Secondary actions — Fork (#126) / Copy resume (#28) / Watch (#336) — folded
          into one "…" dropdown (#340) so the header stays uncluttered; all gating
          (#138/#142 fork, #142 resume) lives inside the shared menu. */}
      <AgentHeaderMenu
        session={session}
        className={styles.action}
        iconSize={14}
      />
      {/* Maximize into big mode (#157). */}
      <button
        type="button"
        className={styles.action}
        onClick={() =>
          maximizeItem({
            kind: "agent",
            sessionId: session.id,
            repoPath: session.repoPath,
          })
        }
        title={
          bigModeKey ? `Open in big mode (${bigModeKey})` : "Open in big mode"
        }
        aria-label="Open in big mode"
      >
        <Maximize2 size={14} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        className={`${styles.action} ${styles.actionDanger}`}
        onClick={onRemove}
        title="Remove (kill + forget)"
        aria-label="Remove session"
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </>
  );
  return (
    // Clicking the card body selects it (highlight in place). The shared ItemContent
    // (#157) renders the live terminal — or a MaximizedNote (#157) placeholder —
    // with the same per-window one-live-render-site guard as Canvas.
    <PanelColumn
      id={session.id}
      color={color}
      selected={selected}
      capped={capWidth}
      title={title}
      leading={<BusyIndicator busy={busy} hasBeenActive={hasBeenActive} />}
      actions={actions}
      subheader={<AutoContinueToggle session={session} />}
      onClickBody={onSelect}
      ptyFocusId={session.id}
    >
      <ItemContent
        content={{
          kind: "agent",
          sessionId: session.id,
          repoPath: session.repoPath,
        }}
        active
      />
    </PanelColumn>
  );
}

function panelLabel(panel: OverviewPanel): string {
  if (panel.kind === "diff") return "Diff";
  if (panel.kind === "filetree") return "File tree";
  if (panel.kind === "terminal") return "Terminal";
  if (panel.kind === "kanban")
    return panel.file?.split(/[\\/]/).pop() || "Kanban";
  return panel.file?.split(/[\\/]/).pop() || "File";
}

interface ExtraPanelProps {
  panel: OverviewPanel;
  repoPath: string;
  branch: string;
  color: string;
  selected: boolean;
  onSelect: () => void;
  onClose: () => void;
}

function ExtraPanel({
  panel,
  repoPath,
  branch,
  color,
  selected,
  onSelect,
  onClose,
}: ExtraPanelProps) {
  const setOverviewPanelFile = useStore((s) => s.setOverviewPanelFile);
  const moveOverviewPanelToFile = useStore((s) => s.moveOverviewPanelToFile);
  const maximizeItem = useStore((s) => s.maximizeItem);
  const bigModeKey = useKeybindLabel("big-mode");
  // Hover-select (#371): a shell terminal panel's PTY session id IS the panel id
  // (overviewPanelToContent) — hovering focuses this window's own live mirror.
  // File/diff/kanban/filetree panels have no terminal input ⇒ blur instead.
  // The "cap Overview panel width" setting (373/419, default on) — caps this
  // file/diff/terminal/kanban/filetree panel at 900px like the agent cards.
  const capWidth = useStore((s) => s.settings.capAgentWidth);
  const content = overviewPanelToContent(panel, repoPath);
  const title = (
    <>
      {/* File panels: the filename is a switcher (#90) — click to pick another
          file in this repo and swap the viewer in place. Diff/terminal keep a
          plain label. */}
      {panel.kind === "markdown" && panel.file ? (
        <FileSwitcher
          repoPath={repoPath}
          file={panel.file}
          onPick={(f) => setOverviewPanelFile(repoPath, panel.id, f)}
          onPickAbsolute={(newRepo, f) =>
            moveOverviewPanelToFile(repoPath, panel.id, newRepo, f)
          }
          nameClassName={styles.name}
        />
      ) : (
        <span className={styles.name}>{panelLabel(panel)}</span>
      )}
      <span className={styles.meta}>
        <span className={styles.metaText}>
          {repoName(repoPath)}
          {branch && ` · ${branch}`}
        </span>
      </span>
    </>
  );
  const actions = (
    <>
      {/* "Open view or start a session" in this panel's folder (#177) — matching
          where agents have it; uses the panel's own repoKey folder. */}
      <OpenViewButton repoPath={repoPath} className={styles.action} />
      {/* Maximize into big mode (#157). */}
      <button
        type="button"
        className={styles.action}
        onClick={() => maximizeItem(content)}
        title={
          bigModeKey ? `Open in big mode (${bigModeKey})` : "Open in big mode"
        }
        aria-label="Open in big mode"
      >
        <Maximize2 size={14} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        className={`${styles.action} ${styles.actionDanger}`}
        onClick={onClose}
        title="Close panel"
        aria-label="Close panel"
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </>
  );
  return (
    <PanelColumn
      id={panel.id}
      color={color}
      selected={selected}
      capped={capWidth}
      title={title}
      leading={
        // The demo's 8px repo-colored square in the dot slot — non-agent cards'
        // repo cue (UI v2 §7, task 379).
        <span
          className={styles.repoLead}
          style={{ background: color }}
          aria-hidden
        />
      }
      actions={actions}
      onClickBody={onSelect}
      ptyFocusId={panel.kind === "terminal" ? panel.id : undefined}
    >
      {/* The shared renderer (#157) maps diff/terminal/kanban/file → the live child
          (the same components Canvas uses), with the big-mode placeholder guard. */}
      <ItemContent content={content} active />
    </PanelColumn>
  );
}

interface ScheduleCardProps {
  schedule: ScheduledSession;
  branch: string;
  color: string;
  selected: boolean;
  onSelect: () => void;
  onCancel: () => void;
  onStartNow: () => Promise<void>;
}

/** A pending scheduled-session card in the Overview cluster (#94): the shared
 * ScheduledPanel body framed like the other columns, with a clock cue, a
 * "Start now" control (#269), and cancel. */
function ScheduleCard({
  schedule,
  branch,
  color,
  selected,
  onSelect,
  onCancel,
  onStartNow,
}: ScheduleCardProps) {
  const maximizeItem = useStore((s) => s.maximizeItem);
  const bigModeKey = useKeybindLabel("big-mode");
  // The "cap Overview panel width" setting (373/419, default on) — caps this
  // scheduled-session card at 900px like the agent cards.
  const capWidth = useStore((s) => s.settings.capAgentWidth);
  // Disable "Start now" while the spawn is in flight (the card vanishes on success
  // via `schedule://fired`; on failure it stays and the button re-enables).
  const [starting, setStarting] = useState(false);
  const title = (
    <>
      {/* Title row (#265): name + optional badge live in a flex row (like
          SessionCard's `.agentTitle`), so `.titleBlock` (a column) stacks just two
          lines — title row, then meta — instead of three with a full-width badge. */}
      <span className={styles.agentTitle}>
        <span className={styles.name}>
          {schedule.name?.trim() || schedule.branch || "Scheduled"}
        </span>
        {/* Worktree schedule (#218): a static "worktree" badge mirroring the live
            worktree agent's card (and the ScheduledPanel), so it reads as a worktree
            everywhere a fired worktree agent does. */}
        {schedule.worktree && (
          <span className={styles.worktreeBadge}>worktree</span>
        )}
      </span>
      <span className={styles.meta}>
        <span className={styles.metaText}>
          {repoName(schedule.cwd)}
          {branch && ` · ${branch}`} · {formatFireTime(schedule.fire_at)}
        </span>
      </span>
    </>
  );
  const actions = (
    <>
      {/* Start now (#269): fire the schedule immediately instead of waiting. */}
      <button
        type="button"
        className={styles.action}
        disabled={starting}
        onClick={() => {
          setStarting(true);
          void onStartNow().finally(() => setStarting(false));
        }}
        title="Start now"
        aria-label="Start now"
      >
        <Play size={14} strokeWidth={1.5} />
      </button>
      {/* Maximize into big mode (#157). */}
      <button
        type="button"
        className={styles.action}
        onClick={() =>
          maximizeItem({
            kind: "scheduled",
            scheduleId: schedule.id,
            repoPath: schedule.cwd,
          })
        }
        title={
          bigModeKey ? `Open in big mode (${bigModeKey})` : "Open in big mode"
        }
        aria-label="Open in big mode"
      >
        <Maximize2 size={14} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        className={`${styles.action} ${styles.actionDanger}`}
        onClick={onCancel}
        title="Cancel schedule"
        aria-label="Cancel schedule"
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </>
  );
  return (
    <PanelColumn
      id={schedule.id}
      color={color}
      selected={selected}
      capped={capWidth}
      title={title}
      leading={
        <Clock
          size={14}
          strokeWidth={1.5}
          className={styles.scheduleLeadIcon}
          aria-hidden
        />
      }
      actions={actions}
      onClickBody={onSelect}
    >
      <ItemContent
        content={{
          kind: "scheduled",
          scheduleId: schedule.id,
          repoPath: schedule.cwd,
        }}
        active
      />
    </PanelColumn>
  );
}

interface RecurringCardProps {
  recurring: RecurringSession;
  branch: string;
  color: string;
  selected: boolean;
  onSelect: () => void;
  onCancel: () => void;
}

/** A recurring-session card in the Overview cluster (#294): the shared RecurringPanel
 * body framed like the other columns, keyed on the recurring id so a fire only swaps
 * the hosted child terminal. */
function RecurringCard({
  recurring,
  branch,
  color,
  selected,
  onSelect,
  onCancel,
}: RecurringCardProps) {
  const maximizeItem = useStore((s) => s.maximizeItem);
  const bigModeKey = useKeybindLabel("big-mode");
  // A recurring card hosts an agent conversation, so it honors the 373 cap too.
  const capWidth = useStore((s) => s.settings.capAgentWidth);
  const title = (
    <>
      <span className={styles.agentTitle}>
        <span className={styles.name}>
          {recurring.name?.trim() || recurring.branch || "Recurring"}
        </span>
        <span className={styles.worktreeBadge}>recurring</span>
        {recurring.worktree && (
          <span className={styles.worktreeBadge}>worktree</span>
        )}
      </span>
      <span className={styles.meta}>
        <span className={styles.metaText}>
          {repoName(recurring.cwd)}
          {branch && ` · ${branch}`} · {formatInterval(recurring.interval_secs)}{" "}
          · {formatNextRun(recurring.next_fire_at)}
        </span>
      </span>
    </>
  );
  const actions = (
    <>
      <button
        type="button"
        className={styles.action}
        onClick={() =>
          maximizeItem({
            kind: "recurring",
            recurringId: recurring.id,
            repoPath: recurring.cwd,
          })
        }
        title={
          bigModeKey ? `Open in big mode (${bigModeKey})` : "Open in big mode"
        }
        aria-label="Open in big mode"
      >
        <Maximize2 size={14} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        className={`${styles.action} ${styles.actionDanger}`}
        onClick={onCancel}
        title="Cancel recurring session"
        aria-label="Cancel recurring session"
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </>
  );
  return (
    <PanelColumn
      id={recurring.id}
      color={color}
      selected={selected}
      capped={capWidth}
      title={title}
      leading={
        <RefreshCw
          size={14}
          strokeWidth={1.5}
          className={styles.scheduleLeadIcon}
          aria-hidden
        />
      }
      actions={actions}
      onClickBody={onSelect}
    >
      <ItemContent
        content={{
          kind: "recurring",
          recurringId: recurring.id,
          repoPath: recurring.cwd,
        }}
        active
      />
    </PanelColumn>
  );
}

type ColumnItem =
  | { kind: "agent"; session: SessionView }
  // `repoKey` is the panel's own `overviewPanels` key (#164) — the worktree path
  // for a worktree-opened view, else the cluster's repo — so it renders/removes
  // against the right folder even when shown under a parent cluster.
  | { kind: "panel"; panel: OverviewPanel; repoKey: string }
  | { kind: "schedule"; schedule: ScheduledSession }
  | { kind: "recurring"; recurring: RecurringSession };

/**
 * The Overview "agent wall" (#38): a customizable arrangement of equal-width
 * columns grouped by repo — each repo's live agent terminals plus its
 * user-managed extra panels (diff/markdown). Columns scroll horizontally past
 * capacity; the sidebar repo filter (#34/#36) narrows it to one repo. Items
 * **drag to reorder within their repo cluster** (#43, dnd-kit) and the order
 * persists per repo.
 */
function Overview() {
  const allSessions = useStore((s) => s.sessions);
  const branches = useStore((s) => s.branches);
  const repoWorktrees = useStore((s) => s.repoWorktrees);
  const platform = useStore((s) => s.platform);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const removeSession = useStore((s) => s.removeSession);
  const openNewSession = useStore((s) => s.openNewSession);
  // Empty-repo state (task 379): "New session" scoped to the filtered folder —
  // startRepoSession (#127) skips the folder step (a git folder opens straight at
  // the branch step); ⌘N itself still opens the global flow.
  const startRepoSession = useStore((s) => s.startRepoSession);
  const newSessionKey = useKeybindLabel("new-session");
  const filter = useStore((s) => s.overviewRepoFilter);
  const setOverviewRepoFilter = useStore((s) => s.setOverviewRepoFilter);
  const repoColors = useStore((s) => s.repoColors);
  const overviewPanels = useStore((s) => s.overviewPanels);
  const overviewOrder = useStore((s) => s.overviewOrder);
  const removeOverviewPanel = useStore((s) => s.removeOverviewPanel);
  const reorderOverview = useStore((s) => s.reorderOverview);
  const sessionBusy = useStore((s) => s.sessionBusy);
  const sessionActive = useStore((s) => s.sessionActive);
  const schedules = useStore((s) => s.schedules);
  const cancelSchedule = useStore((s) => s.cancelSchedule);
  const startScheduleNow = useStore((s) => s.startScheduleNow);
  const recurrings = useStore((s) => s.recurrings);
  const cancelRecurring = useStore((s) => s.cancelRecurring);
  // The boot payload has landed (#352) — gates the empty state (see below).
  const booted = useStore((s) => s.booted);

  // Recurring-owned child agents (#294) render only inside the recurring card, never
  // as their own column — exclude them from the session lists that drive the wall.
  const ownedChildIds = ownedChildSessionIds(recurrings);
  const sessions = allSessions.filter((s) => !ownedChildIds.has(s.id));

  // Drag with a small activation distance so clicking the handle doesn't start a
  // drag; keyboard sensor makes reordering accessible (#43).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Scroll the selected item's column into view when the selection changes (#79)
  // — so clicking a sidebar item in Overview reveals its column. The same ref is the
  // IntersectionObserver root for the #351 terminal visibility gate (see `Wall`), so
  // scrolling a column into view also mounts its terminal.
  const wallRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedId) return;
    if (hoverSelecting) {
      hoverSelecting = false; // hover put the border here; don't move the wall (#371)
      return;
    }
    wallRef.current
      ?.querySelector(`[data-item-id="${selectedId}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedId]);

  // The welcome empty state only when there's truly nothing — no agents and no
  // extra panels (a repo can have a diff/markdown panel without an agent, #39/#41)
  // — and only once the boot payload has landed (#352): before that everything is
  // empty simply because nothing has loaded yet, and showing "No active sessions"
  // for that round-trip would flash the wrong state right before the content pops in.
  // The gate is the shared `overviewIsEmpty` (task 377) so the wave background's
  // hero preset can never drift from this render.
  if (overviewIsEmpty({ sessions, overviewPanels, schedules, recurrings })) {
    return booted ? <EmptyState onNewSession={() => openNewSession()} /> : null;
  }

  // The sidebar filter (#34/#197) narrows the wall to one repo's agents — or, when
  // the filter is a worktree folder, to just that worktree's agents (matched by
  // `repoPath`). `byKey` building drives rendering, so worktree agents must survive
  // here even though the visible cluster keys come from `overviewClusters`.
  const shown = sessions.filter((s) => sessionInFilter(s, filter));

  // Always group by repo: sidebar's alphabetical order (#20), agents contiguous
  // within a repo (stable by createdAt) — the default order before any drag.
  const ordered = [...shown].sort((a, b) => {
    // Group by the effective repo (#96) so a worktree agent sorts next to its
    // parent's agents (and shares the parent's cluster), not in its own group.
    const aRepo = effectiveRepo(a);
    const bRepo = effectiveRepo(b);
    const byName = repoName(aRepo)
      .toLowerCase()
      .localeCompare(repoName(bRepo).toLowerCase());
    if (byName !== 0) return byName;
    const byPath = aRepo.localeCompare(bRepo);
    if (byPath !== 0) return byPath;
    return a.createdAt - b.createdAt;
  });

  // A worktree agent's panels are keyed by the worktree folder (#164), but must
  // cluster under the worktree's **parent** repo (where the worktree agent sits,
  // #96) — not as a stray group. Map worktree path → parent so a panel keyed by a
  // worktree path is attributed to the parent cluster (and rendered with its own
  // key). DETECTED worktrees (agent-created — no live session) contribute the
  // same mapping, so their panels never form a stray top-level cluster either;
  // a session-derived entry wins on overlap.
  const detectedParents = detectedWorktreeParents(repoWorktrees, platform);
  const wtParent = new Map<string, string>(Object.entries(detectedParents));
  for (const s of sessions) {
    if (s.worktreeParent) wtParent.set(s.repoPath, s.worktreeParent);
  }
  const clusterRepoOf = (path: string) => wtParent.get(path) ?? path;
  const panelsByCluster = new Map<
    string,
    { panel: OverviewPanel; repoKey: string }[]
  >();
  for (const [key, list] of Object.entries(overviewPanels)) {
    if (list.length === 0) continue;
    const parent = clusterRepoOf(key);
    const arr = panelsByCluster.get(parent) ?? [];
    for (const p of list) arr.push({ panel: p, repoKey: key });
    panelsByCluster.set(parent, arr);
  }

  // The rendered column order — repos to show, sorted, then each repo's
  // drag-reordered item list with empty clusters dropped — comes from the shared
  // pure `overviewClusters` helper (#174), so the wall and the Shift+←/→ keyboard
  // nav (`useKeyboardNav`) consume one source of truth and can never drift. The
  // component still builds its own `byKey`/`items` for rendering; only the
  // ordering/keys are shared.
  const clusters = overviewClusters({
    sessions,
    overviewPanels,
    overviewOrder,
    schedules,
    recurrings,
    worktreeParents: detectedParents,
    filter,
  }).map(({ repo, keys }) => {
    const agents = ordered.filter((s) => effectiveRepo(s) === repo);
    const extras = panelsByCluster.get(repo) ?? [];
    const repoSchedules = schedules.filter((sc) => sc.cwd === repo);
    const repoRecurrings = recurrings.filter((r) => r.cwd === repo);
    const byKey = new Map<string, ColumnItem>();
    for (const s of agents) byKey.set(s.id, { kind: "agent", session: s });
    for (const e of extras) {
      byKey.set(e.panel.id, {
        kind: "panel",
        panel: e.panel,
        repoKey: e.repoKey,
      });
    }
    for (const sc of repoSchedules) {
      byKey.set(sc.id, { kind: "schedule", schedule: sc });
    }
    for (const r of repoRecurrings) {
      byKey.set(r.id, { kind: "recurring", recurring: r });
    }
    const items = keys
      .map((k) => byKey.get(k))
      .filter((x): x is ColumnItem => x !== undefined);
    return { repo, keys, items };
  });

  // Map every item key → its repo, so a drag can be constrained to its cluster.
  const keyToRepo = new Map<string, string>();
  for (const c of clusters) for (const k of c.keys) keyToRepo.set(k, c.repo);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const repo = keyToRepo.get(activeId);
    // Within-cluster only: ignore a drop that landed over another repo's column.
    if (!repo || keyToRepo.get(overId) !== repo) return;
    const cluster = clusters.find((c) => c.repo === repo);
    if (!cluster) return;
    const oldIndex = cluster.keys.indexOf(activeId);
    const newIndex = cluster.keys.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    void reorderOverview(repo, arrayMove(cluster.keys, oldIndex, newIndex));
  };

  return (
    <div className={styles.overview}>
      {filter && (
        <div className={styles.filterBar}>
          <span className={styles.filterLabel}>
            Showing <strong>{repoName(filter.path)}</strong>
            {/* "own" mode (#247) narrows to the repo's own branch — worktrees hidden;
                spell that out so the wall reads differently from the "all" folder view. */}
            {filter.mode === "own" && " · this branch"}
          </span>
          <button
            type="button"
            className={styles.showAll}
            onClick={() => setOverviewRepoFilter(null)}
          >
            Show all
          </button>
        </div>
      )}
      {clusters.length === 0 ? (
        <div className={styles.filterEmpty}>
          {filter ? (
            <>
              <span className={styles.filterEmptyTitle}>
                No sessions in <strong>{repoName(filter.path)}</strong> yet
              </span>
              <button
                type="button"
                className={styles.newSessionBtn}
                onClick={() => startRepoSession(filter.path)}
              >
                <Plus size={14} strokeWidth={2.2} />
                New session
                {newSessionKey && (
                  <span className={styles.kbdChip}>{newSessionKey}</span>
                )}
              </button>
              <TipRow />
            </>
          ) : (
            "No agents yet."
          )}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <Wall wallRef={wallRef}>
            {clusters.map((cluster) => (
              <SortableContext
                key={cluster.repo}
                items={cluster.keys}
                strategy={horizontalListSortingStrategy}
              >
                {cluster.items.map((item) => {
                  const color = repoColor(cluster.repo, repoColors);
                  const branch = branches[cluster.repo] ?? "";
                  if (item.kind === "agent") {
                    const session = item.session;
                    return (
                      <SessionCard
                        key={session.id}
                        session={session}
                        branch={branches[session.repoPath] ?? ""}
                        color={color}
                        selected={session.id === selectedId}
                        busy={sessionBusy[session.id] ?? false}
                        hasBeenActive={sessionActive[session.id] ?? false}
                        onSelect={() => select(session.id)}
                        onRemove={() => void removeSession(session.id)}
                      />
                    );
                  }
                  if (item.kind === "schedule") {
                    return (
                      <ScheduleCard
                        key={item.schedule.id}
                        schedule={item.schedule}
                        branch={branch}
                        color={color}
                        selected={item.schedule.id === selectedId}
                        onSelect={() => select(item.schedule.id)}
                        onCancel={() => void cancelSchedule(item.schedule.id)}
                        onStartNow={() => startScheduleNow(item.schedule.id)}
                      />
                    );
                  }
                  if (item.kind === "recurring") {
                    return (
                      <RecurringCard
                        key={item.recurring.id}
                        recurring={item.recurring}
                        branch={branch}
                        color={color}
                        selected={item.recurring.id === selectedId}
                        onSelect={() => select(item.recurring.id)}
                        onCancel={() => void cancelRecurring(item.recurring.id)}
                      />
                    );
                  }
                  return (
                    <ExtraPanel
                      key={item.panel.id}
                      panel={item.panel}
                      // A worktree-opened view (#164) renders against its own
                      // worktree key while clustering under the parent repo.
                      repoPath={item.repoKey}
                      branch={branches[item.repoKey] ?? branch}
                      color={color}
                      selected={item.panel.id === selectedId}
                      onSelect={() => select(item.panel.id)}
                      onClose={() =>
                        void removeOverviewPanel(item.repoKey, item.panel.id)
                      }
                    />
                  );
                })}
              </SortableContext>
            ))}
          </Wall>
        </DndContext>
      )}
    </div>
  );
}

export default Overview;
