// Zustand store: backend-mirrored session state + UI state, plus the
// cross-cutting actions used across views. Terminal bytes are intentionally not
// stored here (see outputBus.ts).

import { create } from "zustand";

import { agentCaps, SELECTABLE_AGENTS } from "./agents";
import {
  ARMED_POLL_MS,
  evaluateAutoContinue,
  IDLE_AUTO_CONTINUE,
  type AutoContinueState,
} from "./autoContinue";
import { overviewPanelToContent } from "./components/Canvas/canvasDrop";
import { canvasToTemplate } from "./components/Canvas/canvasToTemplate";
import { rewriteScheduledLeaves } from "./components/Canvas/canvasSchedule";
import { statusMapsEqual } from "./components/FileTree/fileStatus";
import {
  appendLeaf,
  collectLeaves,
  equalize,
  equalizeSplit,
  moveLeaf,
  removeLeaf,
  setLeafContent,
  spatialNeighbor,
  updateLeafContent,
} from "./components/Canvas/canvasTree";
import { blockDescriptor } from "./components/Canvas/templateBlocks";
import {
  fileBlockTarget,
  instantiateTemplate,
  resolvedContent,
} from "./components/Canvas/templateInstantiate";
import { serializeBoard } from "./components/Kanban/kanban";
import { defaultBoard } from "./components/Kanban/kanbanOps";
import {
  parseTemplateJson,
  serializeTemplate,
} from "./components/TemplateManager/templateIo";
import { applyTerminalSettings } from "./components/Terminal/terminalPool";
import { decodeOutputB64 } from "./decodeOutput";
import * as ipc from "./ipc";
import { emitSessionOutput } from "./outputBus";
import { isWindows } from "./platform";
import {
  effectiveRepo,
  type OverviewFilter,
  recurringNestsUnderWorktree,
  repoName,
  scheduleNestsUnderWorktree,
  sessionInFilter,
  splitPath,
} from "./paths";
import { formatInterval, parseResetsAt } from "./time";
import * as updater from "./updater";
import { DETACHED_CANVAS_ID, IS_MAIN_WINDOW } from "./windowContext";
import type {
  AgentInfo,
  BranchList,
  CanvasContent,
  CanvasEdge,
  CanvasNode,
  CanvasTab,
  CanvasTemplate,
  DiffSeenMap,
  FileStatusCode,
  OverviewPanel,
  RecurringSession,
  ScheduledSession,
  SessionRecord,
  SessionView,
  Settings,
  Toast,
  ToastTone,
  View,
} from "./types";

const TOAST_TTL_MS = 3500;
// Boot resume window (#30): clear any lingering "reconnecting" flag after this in
// case a resumed session's first output raced the event listener (its scrollback
// still replays the conversation; no live output then arrives to clear the flag).
const RECONNECT_BACKSTOP_MS = 4000;
let toastSeq = 0;
// True during the boot resume window. A boot-resume failure prints its error
// (e.g. "No conversation found") then exits — both arrive here — so exit toasts
// are suppressed during this window to avoid a wall of them (#30). Module-local
// (no component reacts to it), like `toastSeq`.
let booting = false;
// Ids of sessions still in the boot "reconnecting" window (#30). Mirrors the
// per-session `reconnecting` flag, but lets the output hot path clear it with an
// O(1) Set check instead of scanning every session on each chunk (#261). Seeded in
// `refresh`, drained in `markConnected`/`markExited`/`markRunning`, cleared when the
// reconnect backstop fires.
const reconnectingIds = new Set<string>();
// Subscribe to session events exactly once: StrictMode double-invokes the init
// effect in dev, which would otherwise register duplicate listeners and
// double-fire every exit toast (#32).
let eventsSubscribed = false;
// Sessions killed intentionally (Remove / Forget) — their backend `Exited` event
// must not add a second "Session exited" toast on top of the action's toast (#32).
const intentionalKills = new Set<string>();

// Worktree folder → parent repo (#199), recorded whenever the auto-delete guard runs
// (i.e. an agent of the worktree is removed/exits) so a later **panel/schedule** close
// can still resolve the worktree's parent after its last agent is gone — the parent is
// required to `git worktree remove`. Module-level + in-memory (rebuilt from the session
// lifecycle each run), like `intentionalKills`; cleared when the worktree is removed.
const worktreeParents = new Map<string, string>();

/**
 * Whether a worktree folder `dest` is still referenced by any item (#199): a session
 * (`repoPath === dest` — including an exited-but-still-shown agent with a Restart
 * overlay), an `overviewPanels[dest]` entry (file/diff/terminal/kanban/filetree, #164),
 * a scheduled session created **inside** it (`cwd === dest`, #198), or a worktree
 * schedule that **targets** it (`worktree_path === dest`, #259 — its `cwd` is the
 * parent repo, but its eagerly-created worktree folder is `worktree_path`). Pure — the
 * auto-delete guard keeps the worktree exactly as long as ANY item of ANY type points
 * at it, and removes it only once none remain.
 */
export function worktreeHasItems(
  state: {
    sessions: readonly { repoPath: string }[];
    overviewPanels: Record<string, readonly unknown[]>;
    schedules: readonly { cwd: string; worktree_path?: string | null }[];
    recurrings: readonly { cwd: string; worktree_path?: string | null }[];
  },
  dest: string,
): boolean {
  return (
    state.sessions.some((s) => s.repoPath === dest) ||
    (state.overviewPanels[dest]?.length ?? 0) > 0 ||
    state.schedules.some(
      (sc) => sc.cwd === dest || sc.worktree_path === dest,
    ) ||
    // A recurring created inside the worktree (`cwd === dest`) or a worktree
    // recurring targeting it (`worktree_path === dest`, its `cwd` is the parent)
    // still references it (#294) — keep the worktree until neither remains.
    state.recurrings.some((r) => r.cwd === dest || r.worktree_path === dest)
  );
}

/**
 * The set of session ids **owned** by a recurring session (#294) — its rotating child
 * agent. These are real tracked sessions, but they render only inside the recurring
 * surfaces (never their own sidebar row / Overview column / Canvas panel), so the
 * sidebar + Overview session lists exclude them. Pure.
 */
export function ownedChildSessionIds(
  recurrings: readonly { current_session_id?: string | null }[],
): Set<string> {
  const ids = new Set<string>();
  for (const r of recurrings) {
    if (r.current_session_id) ids.add(r.current_session_id);
  }
  return ids;
}

/** Resolve a worktree folder's parent repo (#199) — from a live session of the
 *  worktree, else the recorded mapping (which survives the last agent's removal). */
function worktreeParentOf(
  state: {
    sessions: readonly { repoPath: string; worktreeParent?: string | null }[];
  },
  dest: string,
): string | undefined {
  return (
    state.sessions.find((s) => s.repoPath === dest && !!s.worktreeParent)
      ?.worktreeParent ?? worktreeParents.get(dest)
  );
}

// Sidebar width (#108): drag-resizable, clamped to [min, max] and persisted
// separately from the Settings blob (so the modal's draft can't clobber a drag).
const SIDEBAR_WIDTH_DEFAULT = 260;
const SIDEBAR_WIDTH_MIN = 180;
const SIDEBAR_WIDTH_MAX = 560;
const clampSidebarWidth = (w: number): number =>
  Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, Math.round(w)));
// Debounce the persist so a drag's many updates don't spam IPC (state updates live).
let sidebarWidthPersistTimer: ReturnType<typeof setTimeout> | undefined;

// Diff "seen" markers (#278): the live map updates immediately; the persist is
// debounced so toggling several files in a row (button or `s` keybind) coalesces into
// one write, like the sidebar-width persist above.
let diffSeenPersistTimer: ReturnType<typeof setTimeout> | undefined;
function persistDiffSeen(): void {
  if (diffSeenPersistTimer) clearTimeout(diffSeenPersistTimer);
  diffSeenPersistTimer = setTimeout(() => {
    diffSeenPersistTimer = undefined;
    void ipc.setDiffSeen(useStore.getState().diffSeen).catch(() => {});
  }, 300);
}

// Branch-label refresh debounce (#212): an in-terminal `git checkout` settles on a
// session's busy→idle edge, so re-read branch labels then (mirrors the #97 title
// reader's cadence). Coalesce a burst of sessions settling together into a single
// `current_branches` call, like `sidebarWidthPersistTimer`. The same edge is exactly
// when an agent's file edits land, so the FileTree git-status coloring (#252) is
// refreshed on the same debounced tick.
const BRANCH_REFRESH_DEBOUNCE_MS = 600;
let branchRefreshTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleBranchRefresh(): void {
  if (branchRefreshTimer) clearTimeout(branchRefreshTimer);
  branchRefreshTimer = setTimeout(() => {
    branchRefreshTimer = undefined;
    void useStore.getState().refreshBranches();
    void useStore.getState().refreshFileStatuses();
    // A finished turn is exactly when an agent's just-written files land. The
    // git-status re-tint above can't add a *new* row (rows come only from `list_dir`),
    // so also re-list every open tree's loaded levels so created/removed files appear
    // right after the agent settles, without collapsing expanded folders (#264).
    useStore.getState().bumpFileTreeRefresh();
  }, BRANCH_REFRESH_DEBOUNCE_MS);
}

// FileTree disk-change refresh (#264): a tree's rows come only from `list_dir`, so a
// file created/removed on disk (by an agent or the user) isn't shown until that level
// is re-listed. A gentle visibility poll (every ~5s, paused while the window is hidden)
// plus a focus/visibility backstop re-list every mounted tree's loaded levels (and
// re-tint its git statuses) — so changes appear within a few seconds without a manual
// Refresh and without losing expanded folders. Bounded: only repos with an open tree
// are touched, and only their already-loaded levels are re-fetched (even on huge repos).
const FILE_TREE_POLL_MS = 5_000;
let fileTreePollTimer: ReturnType<typeof setInterval> | undefined;
let fileTreeFocusListener: (() => void) | undefined;
let fileTreeVisibilityListener: (() => void) | undefined;
// Coalesce a poll tick + a focus/visibility event landing close together into one
// refresh, so they never double-fire.
const FILE_TREE_REFRESH_DEBOUNCE_MS = 400;
let fileTreeRefreshDebounce: ReturnType<typeof setTimeout> | undefined;
function scheduleOpenFileTreeRefresh(): void {
  if (fileTreeRefreshDebounce) clearTimeout(fileTreeRefreshDebounce);
  fileTreeRefreshDebounce = setTimeout(() => {
    fileTreeRefreshDebounce = undefined;
    useStore.getState().refreshOpenFileTrees();
  }, FILE_TREE_REFRESH_DEBOUNCE_MS);
}

// 5-hour usage poll (#154): 180s — the OAuth usage endpoint aggressively 429s below
// that even with the claude-code User-Agent. Module-scoped so the timer survives
// <UsageBar/> unmounting (the bar returns null when usage is unavailable) and never
// double-arms.
const USAGE_POLL_MS = 180_000;
let usagePollTimer: ReturnType<typeof setInterval> | undefined;

// Auto-continue after limit reset (#296): while the machine is armed (limit hit,
// waiting for the window to reset) the usage poll runs on the tighter ARMED_POLL_MS
// cadence so the continue fires promptly after reset. Module-scoped alongside
// `usagePollTimer`; main-window-only + idempotent, cleared on disarm / poll stop.
let armedPollTimer: ReturnType<typeof setInterval> | undefined;

/** Milliseconds between the three keystrokes of the auto-continue nudge (#296) — a
 * tiny gap so claude's TUI registers Enter, the typed text, and Enter as separate
 * events rather than a single paste. */
const CONTINUE_KEY_DELAY_MS = 120;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Send the auto-continue nudge to one session (#296): Enter → `continue` → Enter,
 * with a small gap between sends. Best-effort — a dead PTY / IPC error just means
 * that agent isn't nudged, never a surfaced error. The exact sequence is isolated
 * here so a real-CLI sanity check can adjust it in one place (e.g. drop the leading
 * Enter to `"continue\r"`). `writeStdin` is platform-neutral (same bytes on macOS
 * and Windows). */
async function sendContinue(id: string): Promise<void> {
  try {
    await ipc.writeStdin(id, "\r");
    await sleep(CONTINUE_KEY_DELAY_MS);
    await ipc.writeStdin(id, "continue");
    await sleep(CONTINUE_KEY_DELAY_MS);
    await ipc.writeStdin(id, "\r");
  } catch {
    // Best-effort: swallow so one dead session never breaks the rest.
  }
}

/** Start/stop the tighter armed-cadence usage poll (#296) to match the machine's
 * `armed` state. Main-window-only + idempotent, mirroring `startUsagePolling`. */
function syncArmedPoll(armed: boolean, refresh: () => void): void {
  if (!IS_MAIN_WINDOW) return;
  if (armed && !armedPollTimer) {
    armedPollTimer = setInterval(refresh, ARMED_POLL_MS);
  } else if (!armed && armedPollTimer) {
    clearInterval(armedPollTimer);
    armedPollTimer = undefined;
  }
}

/** Copy of `map` without `key` — returns the same ref when `key` is absent so
 * callers don't trigger needless re-renders. */
function omitKey<T>(map: Record<string, T>, key: string): Record<string, T> {
  if (!(key in map)) return map;
  const next = { ...map };
  delete next[key];
  return next;
}

/** Short, human label for a view panel — used in #83's open/close toasts:
 * "diff viewer" / "terminal", or the file's basename for a file (markdown) panel. */
function panelLabel(kind: OverviewPanel["kind"], file?: string): string {
  if (kind === "diff") return "diff viewer";
  if (kind === "filetree") return "file tree";
  if (kind === "terminal") return "terminal";
  if (kind === "kanban")
    return file ? (file.split(/[\\/]/).pop() ?? file) : "kanban board";
  return file ? (file.split(/[\\/]/).pop() ?? file) : "file viewer";
}

function toSessionView(record: SessionRecord): SessionView {
  return {
    id: record.id,
    claudeSessionId: record.claude_session_id,
    repoPath: record.repo_path,
    name: record.name,
    createdAt: record.created_at,
    worktreeParent: record.worktree_parent ?? null,
    autoName: record.auto_name ?? null,
    hasBeenActive: record.has_been_active ?? false,
    agent: record.agent ?? "claude",
    forkedFrom: record.forked_from ?? null,
    // Fail-open (#138): undefined (older record) → forkable; only a persisted `false`
    // disables Fork. Live updates arrive via `session://forkable` → setForkable.
    forkable: record.forkable ?? true,
    // Per-agent auto-continue opt-out (#297): absent/false (older record) → inherit the
    // global behavior; only a persisted `true` excludes this agent from the fire step.
    autoContinueDisabled: record.auto_continue_disabled ?? false,
  };
}

function isSessionError(
  value: unknown,
): value is { kind: string; message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    "message" in value
  );
}

/** True if semver `to` is strictly higher than `from` — a numeric component-wise
 * compare ignoring any pre-release/build suffix. Drives the post-update toast
 * (#190): a downgrade or no-change must NOT toast "Updated to v…". */
export function versionIncreased(from: string, to: string): boolean {
  const parse = (v: string) =>
    v.split(/[.+-]/).map((n) => Number.parseInt(n, 10) || 0);
  const a = parse(from);
  const b = parse(to);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (y > x) return true;
    if (y < x) return false;
  }
  return false;
}

/** Whether every active session runs Claude (#154) — the single gate the usage bar
 * + its poller read. The Claude usage endpoint is meaningless for any other agent
 * (Codex / OpenCode are untested and have no usage feed), so the bar hides whenever a
 * non-Claude session is active. A legacy `null` agent predates #101 and is Claude. */
export function isClaudeActive(state: AppState): boolean {
  return state.sessions.every((s) => (s.agent ?? "claude") === "claude");
}

/** Build the toast message for an OS-file drop-move (#253). Pure (testable): names
 * how many items moved + where, and surfaces the first error when some/all failed. */
export function moveResultMessage(
  moved: number,
  destSubdir: string,
  errors: string[],
): string {
  const where = destSubdir ? destSubdir : "the repo root";
  const items = (n: number) => `${n} item${n === 1 ? "" : "s"}`;
  if (moved > 0 && errors.length === 0) {
    return `Moved ${items(moved)} into ${where}`;
  }
  if (moved > 0) {
    return `Moved ${items(moved)} into ${where}; ${items(errors.length)} failed: ${errors[0]}`;
  }
  return errors[0] ?? "Move failed";
}

/** Sample markdown changelog for the dev mock update (#193) — exercises the #192
 * patch-notes render (headings, bullets, an inline link) in the "What's new" slot. */
const SAMPLE_UPDATE_NOTES = [
  "### Features",
  "- A brand-new **mock** feature, for testing the update UI.",
  "- Renders [release notes](https://github.com/ErikdeJager/ReCue) inline.",
  "",
  "### Fixes",
  "- Fixed a simulated bug that never really existed.",
].join("\n");

/**
 * Classify a session exit (#63). A **clean** exit — `claude` exits **code 0**
 * while the app is running and the kill was not user-initiated (Remove/Forget) —
 * means the user ended the agent: it is forgotten everywhere (kill + forget),
 * never showing a "Process exited" overlay. Anything else — a non-zero/unknown
 * code (crash), the boot resume window (#30, where a failed resume exits and is
 * offered a Restart), or an intentional kill (which toasts on its own) — is
 * **not** a clean exit and keeps the existing path. Pure — unit-tested; the lone
 * discriminator behind the `onExited` branch. */
export function isCleanExit(
  code: number | null,
  booting: boolean,
  intentional: boolean,
): boolean {
  return code === 0 && !booting && !intentional;
}

/**
 * The set of repositories shown in the sidebar: the union of persisted recents
 * and active-session repos (so a repo stays visible even with no active session),
 * sorted **alphabetically** by displayed name — case-insensitive, with a
 * full-path tiebreak for same-named repos. The order is stable: starting a new
 * agent never reshuffles the groups. `recents` itself stays most-recent-first
 * (the new-session chips read it directly); only this grouping is alphabetical.
 */
export function repoOrder(
  recents: string[],
  sessions: SessionView[],
): string[] {
  const paths = new Set(recents);
  for (const session of sessions) paths.add(session.repoPath);
  return [...paths].sort((a, b) => {
    const byName = repoName(a)
      .toLowerCase()
      .localeCompare(repoName(b).toLowerCase());
    return byName !== 0 ? byName : a.localeCompare(b);
  });
}

/**
 * Disambiguate repeated sidebar row labels. Branch is tracked per repo path, so
 * every session in a repo group shares the same branch label; this appends a
 * 1-based index to the 2nd+ occurrence (`main`, `main (2)`, `main (3)`) so rows
 * stay distinguishable. Order is preserved (stable within the group). Pure.
 */
export function dedupeBranchLabels(labels: string[]): string[] {
  const counts = new Map<string, number>();
  return labels.map((label) => {
    const n = (counts.get(label) ?? 0) + 1;
    counts.set(label, n);
    return n === 1 ? label : `${label} (${n})`;
  });
}

/**
 * Merge a repo cluster's saved drag order with the items currently present (#43):
 * keep the saved order for items that still exist, then append present items not
 * in the saved order (in their default order). So a reorder persists, while a
 * spawned agent appends and a closed one drops out — never scrambling the rest.
 * Pure — unit-tested and reused by the Overview render + drag handlers.
 */
export function mergeRepoOrder(saved: string[], present: string[]): string[] {
  const presentSet = new Set(present);
  const kept = saved.filter((key) => presentSet.has(key));
  const keptSet = new Set(kept);
  const appended = present.filter((key) => !keptSet.has(key));
  return [...kept, ...appended];
}

/**
 * Place `id` immediately **after** `anchorId` within an ordered key list (#285) —
 * removing any prior occurrence of `id` first (so a key created at the end of a
 * cluster lands next to the agent it belongs with). If `anchorId` isn't present (or
 * is `id` itself), the input is returned **unchanged** (same reference). Idempotent:
 * an `id` already directly after `anchorId` round-trips to the same order. Pure —
 * drives `addOverviewPanel`'s "next to the worktree/branch agent" insertion and is
 * unit-tested.
 */
export function placeAfterAnchor(
  orderedKeys: string[],
  id: string,
  anchorId: string,
): string[] {
  if (anchorId === id || !orderedKeys.includes(anchorId)) return orderedKeys;
  const without = orderedKeys.filter((key) => key !== id);
  const anchorIdx = without.indexOf(anchorId);
  return [
    ...without.slice(0, anchorIdx + 1),
    id,
    ...without.slice(anchorIdx + 1),
  ];
}

/**
 * The id to select when moving `delta` (+1 next / -1 prev) through `sessions` in
 * displayed (left-to-right wall) order, with wrap-around at the ends. With
 * nothing currently selected, returns the first session; returns null only when
 * there are no sessions. Pure — drives Shift+←/→ keyboard nav (#24).
 */
export function adjacentSessionId(
  sessions: SessionView[],
  selectedId: string | null,
  delta: number,
): string | null {
  const n = sessions.length;
  if (n === 0) return null;
  const i = sessions.findIndex((s) => s.id === selectedId);
  if (i === -1) return sessions[0]?.id ?? null;
  const next = (((i + delta) % n) + n) % n;
  return sessions[next]?.id ?? null;
}

/**
 * Generic flat-list adjacency: the id to select when moving `delta` (+1 next / -1
 * prev) through `ids` in displayed order, with wrap-around at the ends. Empty list
 * → null; a `selectedId` that is null or not in the list → the first id. Mirrors
 * `adjacentSessionId`'s semantics on a plain id array — drives Shift+←/→ Overview
 * nav across **every** column kind, not just agents (#174). Pure.
 */
export function adjacentId(
  ids: string[],
  selectedId: string | null,
  delta: number,
): string | null {
  const n = ids.length;
  if (n === 0) return null;
  const i = selectedId === null ? -1 : ids.indexOf(selectedId);
  if (i === -1) return ids[0] ?? null;
  const next = (((i + delta) % n) + n) % n;
  return ids[next] ?? null;
}

/**
 * The Overview wall's columns, grouped per repo, in exactly the order they render
 * (#174) — the single source of truth shared by `Overview.tsx` (rendering) and the
 * Shift+←/→ keyboard nav (`useKeyboardNav.ts`), so the two can never drift. Each
 * cluster's `keys` lists its column ids — agent terminals **and** every non-agent
 * column (diff / markdown / terminal / kanban / filetree panels and pending
 * schedule cards). Pure.
 *
 * Replicates the wall's grouping: filter to one folder when `filter` is set — a
 * repo (matches `effectiveRepo`, incl. its worktree items) or a single **worktree**
 * folder (matches the item's own folder, #197); group sessions by `effectiveRepo`
 * (#96) so a
 * worktree agent clusters under its parent repo; attribute each panel to its
 * cluster (a worktree-keyed panel → its parent, #164); include repos that have only
 * panels or only schedules; sort repos by `repoName` (lowercased) then path; and
 * within each repo apply the persisted drag order (`mergeRepoOrder(overviewOrder[
 * repo], [...agentIds, ...panelIds, ...scheduleIds])`). Empty clusters are dropped.
 */
export function overviewClusters(input: {
  sessions: SessionView[];
  overviewPanels: Record<string, OverviewPanel[]>;
  overviewOrder: Record<string, string[]>;
  schedules: ScheduledSession[];
  recurrings?: RecurringSession[];
  filter: OverviewFilter;
}): { repo: string; keys: string[] }[] {
  const {
    overviewPanels,
    overviewOrder,
    schedules,
    recurrings = [],
    filter,
  } = input;
  // Exclude recurring-owned child agents (#294): they render only inside the
  // recurring surfaces, never as their own column. The recurring itself is a column
  // keyed on its own id (added below).
  const ownedChildren = ownedChildSessionIds(recurrings);
  const sessions = input.sessions.filter((s) => !ownedChildren.has(s.id));

  // A worktree agent's panels are keyed by the worktree folder (#164) but cluster
  // under the worktree's **parent** repo (#96). Built first so the filter predicate
  // can map a worktree folder to its parent.
  const wtParent = new Map<string, string>();
  for (const s of sessions) {
    if (s.worktreeParent) wtParent.set(s.repoPath, s.worktreeParent);
  }
  const clusterRepoOf = (path: string) => wtParent.get(path) ?? path;
  // The sidebar filter (#34/#197/#247): an item's **folder** is shown when, for an
  // "all" filter, it equals the filter path (a worktree-folder filter → only that
  // worktree) or its cluster repo does (a repo filter → that repo + its worktree
  // items); for an "own" filter, only when it **equals** the filter path (the repo's
  // own directory — worktree-path panels are excluded). `null` shows everything.
  const folderInFilter = (folder: string) => {
    if (!filter) return true;
    if (filter.mode === "own") return folder === filter.path;
    return folder === filter.path || clusterRepoOf(folder) === filter.path;
  };
  // Schedules additionally: an "own" filter hides **worktree schedules** (#218,
  // `scheduleNestsUnderWorktree`) even though their `cwd` is the parent repo path —
  // they belong to a worktree sub-group, which "own" hides.
  const scheduleInFilter = (sc: ScheduledSession) =>
    folderInFilter(sc.cwd) &&
    !(filter?.mode === "own" && scheduleNestsUnderWorktree(sc));
  // Recurrings mirror schedules (#294): an "own" filter hides worktree recurrings.
  const recurringInFilter = (r: RecurringSession) =>
    folderInFilter(r.cwd) &&
    !(filter?.mode === "own" && recurringNestsUnderWorktree(r));

  // Narrow agents by the filter (a worktree filter matches `repoPath`, a repo filter
  // the effective repo, #197).
  const shown = sessions.filter((s) => sessionInFilter(s, filter));
  // Group by effective repo (#96), agents contiguous within a repo (stable by
  // createdAt) — the default order before any drag.
  const ordered = [...shown].sort((a, b) => {
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

  const panelsByCluster = new Map<string, string[]>();
  for (const [key, list] of Object.entries(overviewPanels)) {
    if (list.length === 0 || !folderInFilter(key)) continue;
    const parent = clusterRepoOf(key);
    const arr = panelsByCluster.get(parent) ?? [];
    for (const p of list) arr.push(p.id);
    panelsByCluster.set(parent, arr);
  }

  // Repos to render: those with agents, plus those with extra panels or pending
  // schedules (already filter-narrowed above / below).
  const repoSet = new Set<string>();
  for (const s of ordered) repoSet.add(effectiveRepo(s));
  for (const [parent, ids] of panelsByCluster) {
    if (ids.length > 0) repoSet.add(parent);
  }
  for (const sc of schedules) {
    if (scheduleInFilter(sc)) repoSet.add(sc.cwd);
  }
  for (const r of recurrings) {
    if (recurringInFilter(r)) repoSet.add(r.cwd);
  }
  const repoList = [...repoSet].sort((a, b) => {
    const byName = repoName(a)
      .toLowerCase()
      .localeCompare(repoName(b).toLowerCase());
    return byName !== 0 ? byName : a.localeCompare(b);
  });

  // Per repo: the drag-reordered item list (#43), merged with the live items so a
  // spawn appends and an exit drops out without scrambling the rest.
  const clusters: { repo: string; keys: string[] }[] = [];
  for (const repo of repoList) {
    const agentIds = ordered
      .filter((s) => effectiveRepo(s) === repo)
      .map((s) => s.id);
    const panelIds = panelsByCluster.get(repo) ?? [];
    const scheduleIds = schedules
      .filter((sc) => sc.cwd === repo && scheduleInFilter(sc))
      .map((sc) => sc.id);
    const recurringIds = recurrings
      .filter((r) => r.cwd === repo && recurringInFilter(r))
      .map((r) => r.id);
    const defaultKeys = [
      ...agentIds,
      ...panelIds,
      ...scheduleIds,
      ...recurringIds,
    ];
    if (defaultKeys.length === 0) continue; // drop empty clusters
    const keys = mergeRepoOrder(overviewOrder[repo] ?? [], defaultKeys);
    clusters.push({ repo, keys });
  }
  return clusters;
}

/**
 * The flat, left-to-right list of Overview column ids in rendered order (#174) —
 * `overviewClusters` flattened. What Shift+←/→ walks. Pure.
 */
export function overviewClusterKeys(input: {
  sessions: SessionView[];
  overviewPanels: Record<string, OverviewPanel[]>;
  overviewOrder: Record<string, string[]>;
  schedules: ScheduledSession[];
  recurrings?: RecurringSession[];
  filter: OverviewFilter;
}): string[] {
  return overviewClusters(input).flatMap((c) => c.keys);
}

/**
 * Resolve the agent a newly-created Overview panel should sit beside (#285), or
 * `null` when there's none — so a plain repo-level panel keeps appending at the end.
 * The anchor is an agent running in this **exact** folder (`repoPath`): the currently
 * **selected** such agent wins (so a panel opened from a specific agent's header lands
 * by *that* agent), else the **last** folder agent in the cluster's render order (so a
 * worktree panel lands right after the worktree's agent block, not amid the parent
 * repo's own agents). `clusterKeys` is the parent cluster's full rendered order. Pure.
 */
export function anchorAgentForPanel(input: {
  sessions: SessionView[];
  repoPath: string;
  selectedId: string | null;
  clusterKeys: string[];
}): string | null {
  const { sessions, repoPath, selectedId, clusterKeys } = input;
  const folderAgentIds = new Set(
    sessions.filter((s) => s.repoPath === repoPath).map((s) => s.id),
  );
  if (folderAgentIds.size === 0) return null;
  if (selectedId && folderAgentIds.has(selectedId)) return selectedId;
  let anchor: string | null = null;
  for (const key of clusterKeys) if (folderAgentIds.has(key)) anchor = key;
  return anchor;
}

/**
 * Splice a freshly-added Overview panel `id` next to the agent it belongs with (#285)
 * and persist the cluster's new order via `reorderOverview`. No-op (leaving the
 * append-at-end default) when no agent runs in `repoPath`. Called by `addOverviewPanel`
 * after the panel is in state, so `overviewClusters` already includes it.
 */
async function repositionPanelAfterAgent(
  get: () => AppState,
  repoPath: string,
  id: string,
): Promise<void> {
  const state = get();
  const parent = worktreeParentOf(state, repoPath) ?? repoPath;
  const cluster = overviewClusters({
    sessions: state.sessions,
    overviewPanels: state.overviewPanels,
    overviewOrder: state.overviewOrder,
    schedules: state.schedules,
    recurrings: state.recurrings,
    filter: null,
  }).find((c) => c.repo === parent);
  const keys = cluster?.keys ?? [];
  const anchorId = anchorAgentForPanel({
    sessions: state.sessions,
    repoPath,
    selectedId: state.selectedId,
    clusterKeys: keys,
  });
  if (!anchorId) return; // no agent in this folder → keep append-at-end
  // `anchorId` is always present in `keys` (it's derived from them), so this is a
  // real reorder; persist it exactly as a manual drag would.
  await get().reorderOverview(parent, placeAfterAnchor(keys, id, anchorId));
}

/**
 * The Catppuccin accent palette (#33) used for per-repo color identity (#35) —
 * the source for default repo colors and the picker swatches.
 */
export const REPO_PALETTE = [
  "#f5e0dc", // Rosewater
  "#f2cdcd", // Flamingo
  "#f5c2e7", // Pink
  "#cba6f7", // Mauve
  "#f38ba8", // Red
  "#eba0ac", // Maroon
  "#fab387", // Peach
  "#f9e2af", // Yellow
  "#a6e3a1", // Green
  "#94e2d5", // Teal
  "#89dceb", // Sky
  "#74c7ec", // Sapphire
  "#89b4fa", // Blue
  "#b4befe", // Lavender
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * A repo's color identity (#35): the user-assigned color if any, else a stable
 * default derived by hashing the path into the Catppuccin palette so each repo
 * starts distinct and consistent across restarts. Pure.
 */
export function repoColor(
  path: string,
  colors: Record<string, string>,
): string {
  const assigned = colors[path];
  if (assigned) return assigned;
  const idx = hashString(path) % REPO_PALETTE.length;
  return REPO_PALETTE[idx] ?? REPO_PALETTE[0] ?? "#cba6f7";
}

/**
 * A Kanban column's color (#239): the configured color when the column name matches
 * a Settings entry (case-insensitive + trimmed), else a stable default derived by
 * hashing the name into the Catppuccin palette — exactly like `repoColor` hashes a
 * path, so an unconfigured lane stays consistent across renders/reopens (no flicker).
 * Blank-color entries (a row mid-edit) are ignored so they fall through to the hash.
 * Pure.
 */
export function kanbanColumnColor(
  name: string,
  configured: { name: string; color: string }[],
): string {
  const key = name.trim().toLowerCase();
  const match = configured.find(
    (c) => c.color && c.name.trim().toLowerCase() === key,
  );
  if (match) return match.color;
  const idx = hashString(key) % REPO_PALETTE.length;
  return REPO_PALETTE[idx] ?? REPO_PALETTE[0] ?? "#cba6f7";
}

/**
 * Default application settings (#100). The frontend owns these, so an older
 * persisted file without a `settings` blob upgrades cleanly. `accentColor: ""`
 * means "use the default `--accent` token" (Peach).
 */
export const DEFAULT_SETTINGS: Settings = {
  terminalFontSize: 12.5,
  terminalLineHeight: 1.2,
  terminalCursorBlink: true,
  accentColor: "",
  reduceMotion: false,
  overviewPanelMinWidth: 400,
  defaultView: "overview",
  confirmDestructive: true,
  canvasCloseBehavior: "ask",
  diffDisplayMode: "focused",
  diffLineMode: "unified",
  diffSortOrder: "occurrence",
  // The three default-board lanes (#239), seeded with their hashed-name colors so the
  // Settings list matches what an unconfigured board shows out of the box; editable.
  kanbanColumnColors: ["To Do", "Doing", "Done"].map((name) => ({
    name,
    color: kanbanColumnColor(name, []),
  })),
  autoName: true,
  autoSave: true,
  defaultAgent: "claude",
  autoContinueAfterLimit: false,
  // False so the first-launch agent picker runs once for new AND existing installs
  // (an older sessions.json lacks the key → merges to false → detected next launch).
  onboarded: false,
};

/** Merge a persisted (possibly partial / null) settings blob over the defaults so
 * missing or newly-added keys take their default (#100). */
export function mergeSettings(
  raw: Partial<Settings> | null | undefined,
): Settings {
  return { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
}

/** Companion accent tokens derived from a chosen accent hex (#107): a lightened
 * `--accent-hover`, a translucent `--accent-dim` (the accent at 0.14 alpha, like
 * the default), and a contrast-safe on-accent `--accent-fg` (dark on a light
 * accent, light on a dark one). Falls back gracefully for an unparseable hex. */
export function accentCompanions(hex: string): {
  hover: string;
  dim: string;
  fg: string;
} {
  const digits = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1];
  if (!digits) return { hover: hex, dim: hex, fg: "#11111b" };
  const n = parseInt(digits, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const toHex = (c: number) => Math.round(c).toString(16).padStart(2, "0");
  // Hover: lighten ~18% toward white (the feel of the default Peach hover).
  const lighten = (c: number) => c + (255 - c) * 0.18;
  const hover = `#${toHex(lighten(r))}${toHex(lighten(g))}${toHex(lighten(b))}`;
  // Dim: the accent at 0.14 alpha (matches the default `--accent-dim`).
  const dim = `rgba(${r}, ${g}, ${b}, 0.14)`;
  // Foreground: dark text on a light accent, light on a dark one (relative
  // luminance). Today's palette is all light pastels → dark fg, as before.
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const fg = lum > 0.6 ? "#11111b" : "#ffffff";
  return { hover, dim, fg };
}

/** Apply the imperative side-effects of settings: the terminal options to the live
 * pool (#100), the accent tokens (#102/#107), and the reduce-motion class (#102). */
function applySettingsEffects(s: Settings): void {
  applyTerminalSettings({
    fontSize: s.terminalFontSize,
    lineHeight: s.terminalLineHeight,
    cursorBlink: s.terminalCursorBlink,
  });
  if (typeof document === "undefined") return; // non-DOM env (e.g. unit tests)
  // Accent (#102/#107): override --accent AND its derived companion tokens
  // (--accent-hover / -dim / -fg) on :root, so hover / dim / on-accent surfaces all
  // track the chosen color; clear all four for the default ("") so the Catppuccin
  // Peach tokens stand.
  const root = document.documentElement;
  if (s.accentColor) {
    const { hover, dim, fg } = accentCompanions(s.accentColor);
    root.style.setProperty("--accent", s.accentColor);
    root.style.setProperty("--accent-hover", hover);
    root.style.setProperty("--accent-dim", dim);
    root.style.setProperty("--accent-fg", fg);
  } else {
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-hover");
    root.style.removeProperty("--accent-dim");
    root.style.removeProperty("--accent-fg");
  }
  // Reduce motion (#102): force-on beyond the OS setting via a body class that
  // global.css zeroes the motion for (mirrors the prefers-reduced-motion killswitch).
  document.body.classList.toggle("reduce-motion", s.reduceMotion);
  // Overview column min width (#176): the floor before columns scroll horizontally.
  // Always set it — the `.card` CSS fallback only covers the pre-JS first paint.
  root.style.setProperty("--overview-card-min", `${s.overviewPanelMinWidth}px`);
}

/** A clicked sidebar item — an agent/terminal (by PTY id) or a file/diff panel
 * (by repo path + file). Matched against Canvas leaves for view-aware nav (#79). */
type SidebarItem = {
  id: string;
  kind:
    | "agent"
    | "terminal"
    | "file"
    | "diff"
    | "scheduled"
    | "recurring"
    | "kanban"
    | "filetree";
  repoPath?: string;
  file?: string;
};

/** Whether a Canvas leaf's content is the same item as a clicked sidebar item
 * (#79): agents/terminals match by PTY id, files by repo+path, diffs by repo. */
function matchesCanvasItem(content: CanvasContent, item: SidebarItem): boolean {
  switch (item.kind) {
    case "agent":
      return content.kind === "agent" && content.sessionId === item.id;
    case "terminal":
      return content.kind === "terminal" && content.sessionId === item.id;
    case "file":
      return (
        content.kind === "file" &&
        content.repoPath === item.repoPath &&
        content.file === item.file
      );
    case "kanban":
      return (
        content.kind === "kanban" &&
        content.repoPath === item.repoPath &&
        content.file === item.file
      );
    case "diff":
      return content.kind === "diff" && content.repoPath === item.repoPath;
    case "filetree":
      return content.kind === "filetree" && content.repoPath === item.repoPath;
    case "scheduled":
      return content.kind === "scheduled" && content.scheduleId === item.id;
    case "recurring":
      return content.kind === "recurring" && content.recurringId === item.id;
  }
}

/** The sidebar item id for a Canvas leaf's content (#79) — the reverse of
 * matchesCanvasItem, so focusing a panel highlights its sidebar row. Agents/
 * terminals carry their id directly; file/diff panels are looked up in
 * overviewPanels. Null when not resolvable. */
function leafItemId(
  content: CanvasContent,
  overviewPanels: Record<string, OverviewPanel[]>,
): string | null {
  if (content.kind === "agent" || content.kind === "terminal") {
    return content.sessionId ?? null;
  }
  if (content.kind === "scheduled") {
    return content.scheduleId ?? null;
  }
  if (content.kind === "recurring") {
    return content.recurringId ?? null;
  }
  const panels = overviewPanels[content.repoPath ?? ""] ?? [];
  if (content.kind === "file") {
    return (
      panels.find((p) => p.kind === "markdown" && p.file === content.file)
        ?.id ?? null
    );
  }
  if (content.kind === "kanban") {
    return (
      panels.find((p) => p.kind === "kanban" && p.file === content.file)?.id ??
      null
    );
  }
  if (content.kind === "diff") {
    return panels.find((p) => p.kind === "diff")?.id ?? null;
  }
  if (content.kind === "filetree") {
    return panels.find((p) => p.kind === "filetree")?.id ?? null;
  }
  return null;
}

/**
 * Resolve the currently **selected** item (`selectedId`) to the live `CanvasContent`
 * big mode (#157) would maximize — the keyboard ⌘E/Ctrl+E toggle's "what to open"
 * (#284). It must yield **exactly** the descriptor the click-to-maximize buttons pass
 * (Overview.tsx / CanvasSurface.tsx), so the keybind and a click open the same item.
 *
 * Resolution, most-precise first:
 *   1. **Canvas leaf** — if a leaf in the active tab maps back to `selectedId`
 *      (`leafItemId`), return that leaf's `content` verbatim (no reconstruction). In
 *      Canvas view `selectedId` tracks the active leaf, and a detached canvas window
 *      only has leaves, so this is the path there.
 *   2. **By id across the store** — a session → `agent`, a schedule → `scheduled`, an
 *      Overview panel → `overviewPanelToContent(panel, repoKey)` (the panel's map key
 *      preserves a worktree-keyed repoPath).
 * `null` when nothing is selected or the id resolves to no live item. Pure + unit-tested.
 */
export function contentForSelected(state: {
  selectedId: string | null;
  canvases: CanvasTab[];
  activeCanvasId: string;
  sessions: SessionView[];
  schedules: ScheduledSession[];
  recurrings?: RecurringSession[];
  overviewPanels: Record<string, OverviewPanel[]>;
}): CanvasContent | null {
  const { selectedId } = state;
  if (!selectedId) return null;

  // 1. Active Canvas tab — return the matching leaf's content directly.
  const activeLayout =
    state.canvases.find((c) => c.id === state.activeCanvasId)?.layout ?? null;
  for (const leaf of collectLeaves(activeLayout)) {
    if (leafItemId(leaf.content, state.overviewPanels) === selectedId) {
      return leaf.content;
    }
  }

  // 2. Resolve the id against sessions / schedules / Overview panels.
  const session = state.sessions.find((s) => s.id === selectedId);
  if (session) {
    return { kind: "agent", sessionId: session.id, repoPath: session.repoPath };
  }
  const schedule = state.schedules.find((s) => s.id === selectedId);
  if (schedule) {
    return {
      kind: "scheduled",
      scheduleId: schedule.id,
      repoPath: schedule.cwd,
    };
  }
  const recurring = (state.recurrings ?? []).find((r) => r.id === selectedId);
  if (recurring) {
    return {
      kind: "recurring",
      recurringId: recurring.id,
      repoPath: recurring.cwd,
    };
  }
  for (const [repoKey, panels] of Object.entries(state.overviewPanels)) {
    const panel = panels.find((p) => p.id === selectedId);
    if (panel) return overviewPanelToContent(panel, repoKey);
  }
  return null;
}

export interface AppState {
  // --- State ---
  sessions: SessionView[];
  selectedId: string | null;
  view: View;
  /** Overview filter: show only this repo's agents, or all when null (#34). */
  overviewRepoFilter: OverviewFilter;
  recents: string[];
  /** Current branch per repo path (from git reading); "" when unknown/non-git. */
  branches: Record<string, string>;
  /** Per-repo git working-tree status (#252): repoPath → { repo-relative POSIX path
   * → "A"|"M"|"D" }. Tints the FileTree rows; refreshed once-per-repo (mirroring
   * `branches`) on load, on each session busy→idle edge, and via the tree's Refresh
   * button. A missing repo key / empty map = no coloring (clean or non-git). */
  fileStatuses: Record<string, Record<string, FileStatusCode>>;
  /** The FileTree directory currently hovered by an OS file-drag (#253): the repo +
   * repo-relative dir (`""` = root) a drop would land in, or null when not over a
   * tree. Set by the window-global drag-drop listener; read by every FileTree to
   * highlight the precise drop target. Transient (never persisted). */
  fileDropTarget: { repo: string; dir: string } | null;
  /** Per-repo monotonic counter bumped to make each FileTree re-list its visible
   * levels in place — without a reset, so expanded folders are preserved. Bumped after
   * a successful drop-move (#253) and on the disk-change poll / busy→idle edge (#264). */
  fileTreeRefresh: Record<string, number>;
  /** Repos with a FileTree currently mounted in this window (#264, ref-counted) — the
   * disk-change visibility poll only re-lists/re-tints trees the user actually has open,
   * so background churn stays bounded. Per-window (each window has its own store). */
  fileTreeMounts: Record<string, number>;
  /** Assigned per-repo colors, path → hex (#35); unassigned repos derive a default. */
  repoColors: Record<string, string>;
  /** Per-repo ordered list of extra (non-agent) Overview panels (#38). */
  overviewPanels: Record<string, OverviewPanel[]>;
  /** Per-repo drag-reorder order (#43): item keys (agent ids + panel ids). Merged
   * with the live items at render — unknown keys filtered, new ones appended. */
  overviewOrder: Record<string, string[]>;
  /** The Canvas tabs (#58) — each a named, independent BSP layout; always ≥1. */
  canvases: CanvasTab[];
  /** Which Canvas tab is active (#58). In a detached canvas window (#84) this is
   * fixed to that window's own canvas. */
  activeCanvasId: string;
  /** Canvas ids currently open in a detached window (#84) — synced from the
   * backend; drives terminal ownership + the "in window" tab marker. */
  detachedCanvasIds: string[];
  /** Saved Canvas templates (#117) — reusable layouts of action blocks. */
  canvasTemplates: CanvasTemplate[];
  /** Whether the template editor surface is open (#117). */
  templateEditorOpen: boolean;
  /** The template being edited (#117); `null` = a brand-new template. Only
   * meaningful while `templateEditorOpen`. */
  templateEditorId: string | null;
  /** A live canvas's block tree seeded into the editor by "Save current canvas as
   * template…" (#187); the editor deep-clones it into its draft layout on open.
   * Cleared whenever the editor opens for a real/blank template or closes. */
  templateEditorSeed: CanvasNode | null;
  /** Default name for a seeded template (#187) — the source canvas's tab name. */
  templateEditorSeedName: string | null;
  /** Whether the "Manage templates" view is open (#117). */
  templateManagerOpen: boolean;
  /** Whether the "New tab from template" chooser is open (#118). */
  templateUseOpen: boolean;
  /** The keyboard-focused Canvas panel (leaf id), or null (#76). */
  activeLeafId: string | null;
  /** Transient (non-persisted) lift state while an existing panel is being dragged
   * (#155): the active tab + the leaf lifted out. The Canvas renders a **derived**
   * layout with this leaf removed (so panels reflow + it can't self-target); the
   * persisted `canvases` blob is untouched until a committed drop, so a cancel /
   * interrupted drag restores the panel exactly. `null` when no panel is lifted. */
  liftedLeaf: { canvasId: string; leafId: string } | null;
  /** The item currently maximized in **big mode** (#157), or null. Transient,
   * per-window, never persisted — a single near-fullscreen overlay shows this one
   * item live while its source panel/column shows a placeholder. */
  maximizedItem: CanvasContent | null;
  /** Sessions currently working, from the output-activity heuristic (#42); an
   * absent/false entry means idle. (The task's `sessionState`, as a boolean map.) */
  sessionBusy: Record<string, boolean>;
  /** Sessions that have been active at least once (#112): set on the first busy
   * transition (and seeded from each session's persisted `hasBeenActive` on load),
   * never cleared until the session is removed. An idle session with this set shows
   * the yellow "finished / needs input" indicator instead of never-active gray. */
  sessionActive: Record<string, boolean>;
  /** Terminal items (#72) whose shell has exited → exit code (or null); drives the
   * Terminal exit overlay for non-agent PTYs (they aren't in `sessions`). */
  terminalExits: Record<string, number | null>;
  claudeMissing: boolean;
  /** Host OS family (#143), read once at boot from the backend `platform()` command
   * — "windows" / "macos" / "linux", or "" until loaded. Drives OS-appropriate
   * display labels (Finder vs Explorer, ⌘ vs Ctrl); keyboard handling is unaffected. */
  platform: string;
  /** Windows build number (e.g. 22631), read once at boot; `0` on non-Windows or
   * until loaded. Only consumed under an `isWindows` guard, to set xterm.js's
   * `windowsPty.buildNumber` for correct ConPTY handling. */
  windowsBuild: number;
  toasts: Toast[];
  /** New session modal (rendered by #10); `newSessionRepo` optionally prefills it. */
  newSessionOpen: boolean;
  newSessionRepo: string | null;
  /** The same modal opened in **schedule** mode (#93): folder → branch → a final
   * time/prompt/name step that creates a scheduled session instead of spawning. */
  scheduleMode: boolean;
  /** The same modal opened in **recurring** mode (#294): folder → branch → a final
   * interval/first-run/prompt/name step that creates a repeating session. Mutually
   * exclusive with `scheduleMode`. */
  recurringMode: boolean;
  /** Branches preloaded by the per-repo start path (#127): when set, the modal opens
   * **directly at the branch step** for `newSessionRepo`, seeded with this list (no
   * folder step, no second `list_branches`). `null` for the folder-step open. */
  newSessionInitialBranches: BranchList | null;
  /** The per-repo start path (#263) opens the modal **directly at the branch step**
   * for `newSessionRepo` *without* pre-fetching branches, so it appears instantly;
   * the modal then loads branches asynchronously (and spawns directly + closes for a
   * non-git folder). `true` only via `startRepoSession`; the folder-step opens (global
   * ⌘N / schedule) leave it `false`. */
  newSessionAtBranch: boolean;
  /** The Clone Repo modal (#295): a git-URL + destination-parent picker that clones a
   * repo, ensures `main`, registers the folder, and starts a session there. Opened
   * from the sidebar ⋯ menu (#294) + background context menu. */
  cloneRepoOpen: boolean;
  /** The ⌘K "Create panel" launcher (#189): a keyboard-first modal to spawn any
   * panel type (session / file / diff / terminal / kanban / filetree) in a chosen
   * repo-or-worktree, reusing the existing creation actions. */
  createPanelOpen: boolean;
  /** A panel type pre-selected by ⌘⌥1–6 (#189): when set, the launcher skips the
   * type step and opens straight at the folder step for that type; `null` = ⌘K
   * (start at the type step). */
  createPanelType: string | null;
  /** In-app updater state (#190, Tauri updater plugin). `status` drives the sidebar
   * indicator + the confirm/install modal; `confirming` opens the confirm dialog
   * (only meaningful while `available`); `progress` (0–100) feeds the install
   * overlay's bar. Inert today (no signed release) but shaped so the mock (#193) can
   * drive every state. */
  update: {
    status: "idle" | "checking" | "available" | "downloading" | "error";
    version: string | null;
    progress: number;
    error?: string;
    confirming: boolean;
    /** The available update's release notes (#192) — markdown carried in the
     * release's `latest.json` (`update.body`), so a not-yet-installed version's
     * notes are readable before installing. `null` when none / up to date. */
    notes: string | null;
  };
  /** 5-hour Claude session usage (#154). `available` false → the bar hides. Fed by a
   * 180s poll; the OAuth token + HTTP live entirely in Rust. */
  usage: {
    usedPercent: number | null;
    resetsAtMs: number | null;
    available: boolean;
  };
  /** Transient auto-continue-after-limit-reset machine state (#296) — NOT persisted;
   * only the `autoContinueAfterLimit` setting is. Fed by the usage poll. */
  autoContinue: AutoContinueState;
  /** Pending scheduled sessions (#93), newest-first; main window only. */
  schedules: ScheduledSession[];
  /** Active recurring sessions (#294), newest-first; loaded in every window. */
  recurrings: RecurringSession[];
  /** Application settings (#100), merged with defaults on load. */
  settings: Settings;
  /** Whether the Settings modal is open (#100). */
  settingsOpen: boolean;
  /** Whether the first-launch coding-agent picker is open. Opened by `maybeOnboardAgent`
   * only when 2+ agent CLIs are installed; not persisted (the `onboarded` settings flag
   * is what prevents re-prompting). */
  onboardingOpen: boolean;
  /** The installed agents offered in the onboarding picker (presence-checked via
   * `agent_info`); the modal renders these as the pickable rows. */
  onboardingChoices: AgentInfo[];
  /** The section the Settings modal should open at (#191): set when a caller
   * deep-links (e.g. the updater indicator → "updates"); `null` = the default
   * (Terminal). The modal seeds its initial section from this and it's cleared on
   * close. */
  settingsSection: string | null;
  /** Sidebar width in px (#108), drag-resizable + persisted (main window). */
  sidebarWidth: number;
  /** Whether the sidebar is collapsed to the icon rail (#168), persisted separately
   * from Settings like the width. Main-window-only; a detached canvas has no sidebar. */
  sidebarCollapsed: boolean;
  /** The user's drag-chosen top-level sidebar folder order (#211): repo paths,
   * persisted separately from Settings like the width/collapsed flags. The displayed
   * order is `mergeRepoOrder(folderOrder, repoOrder(...))`, so a spawned repo appends
   * and a forgotten one drops without scrambling the rest. */
  folderOrder: string[];
  /** Per-repo diff "seen" review markers (#278): a content digest per reviewed changed
   * file, `{ [repoPath]: { [filePath]: digest } }`. The `DiffInspector` derives each
   * file's NotSeen/Seen/ChangedSinceSeen state from this. Persisted separately from the
   * Settings blob (loaded in every window so a detached canvas's diff panel reads it). */
  diffSeen: DiffSeenMap;
  /** Transient "begin renaming this agent" request (#228): set by the collapsed-rail
   * Rename action (which first expands the sidebar, since the narrow rail has no room
   * for the inline editor); the now-visible expanded `SessionRow` consumes it on mount
   * to auto-start its inline rename, then clears it. Not persisted. */
  pendingRenameSessionId: string | null;

  // --- Sync reducers ---
  setView: (view: View) => void;
  select: (id: string | null) => void;
  /** Select/jump to a sidebar item, view-aware (#79): in Overview select + scroll
   * its column; in Canvas focus its panel if present, else toast + deselect.
   * Never switches the view. */
  selectItem: (item: SidebarItem) => void;
  /** Toggle the Overview filter (#34/#247). `mode` (default `"all"`) disambiguates a
   * repo path: `"all"` = folder click (repo + worktrees), `"own"` = branch-line click
   * (repo's own directory only). Re-selecting the **same path AND mode** clears it;
   * a different path or mode switches. Pass `null` to clear ("Show all"). */
  setOverviewRepoFilter: (path: string | null, mode?: "all" | "own") => void;
  setSessions: (sessions: SessionView[]) => void;
  setRecents: (recents: string[]) => void;
  upsertSession: (session: SessionView) => void;
  dropSession: (id: string) => void;
  markExited: (id: string, code: number | null) => void;
  markRunning: (id: string) => void;
  /** Set a session's busy/idle state from the backend heuristic (#42). */
  setBusy: (id: string, busy: boolean) => void;
  /** Apply claude's auto-title (#97) to a session (no-op if unchanged). */
  setAutoName: (id: string, autoName: string | null) => void;
  /** Update a session's forkability (#138) — gates the Fork affordance (no-op if
   * the id isn't a tracked session, e.g. a shell terminal). */
  setForkable: (id: string, forkable: boolean) => void;
  /** Clear the boot "reconnecting" flag once a session proves it's live (#30). */
  markConnected: (id: string) => void;
  setClaudeMissing: (missing: boolean) => void;
  pushToast: (message: string, tone?: ToastTone) => string;
  dismissToast: (id: string) => void;
  openNewSession: (repo?: string) => void;
  /** Start a session for a known repo (#127): the sidebar context-menu "New session"
   * + the inline per-repo "+". Skips the redundant folder step and opens the modal
   * **instantly** at the branch step (#263, `newSessionAtBranch`) — the modal loads
   * branches asynchronously, and a non-git folder spawns immediately with **no modal**
   * (resolved after the open). (The global ⌘N / button still uses `openNewSession`.) */
  startRepoSession: (repo: string) => void;
  /** Open the modal in schedule mode (#93). */
  openSchedule: (repo?: string) => void;
  /** Open the modal in recurring mode (#294) — the ⋯ overflow menu's "Recurring
   * session…". */
  openRecurring: (repo?: string) => void;
  /** Open / close the Clone Repo modal (#295) — the ⋯ overflow menu + background
   * context menu's "Clone Repo…". */
  openCloneRepo: () => void;
  closeCloneRepo: () => void;
  /** Clone the git repo at `url` into the chosen `parent` dir (#295): clone → ensure
   * `main` → register the folder → start a session on `main`. Resolves `true` on
   * success (closing the modal), else the git error string for inline display (bad
   * URL / auth / network / existing dest). */
  cloneRepo: (url: string, parent: string) => Promise<true | string>;
  /** Open the ⌘K "Create panel" launcher (#189). `type` (set by ⌘⌥1–6) pre-selects
   * a panel type and skips the type step; omitted = open at the type step. */
  openCreatePanel: (type?: string) => void;
  /** Close the Create-panel launcher (#189). */
  closeCreatePanel: () => void;
  /** Check for an update (#190); best-effort — sets `available`+`version` or stays
   * idle. Called on boot and (later) the Settings "Check for updates" button. */
  checkForUpdate: () => Promise<void>;
  /** Open / cancel the update confirm dialog (#190). */
  openUpdateConfirm: () => void;
  cancelUpdate: () => void;
  /** Download + install the pending update (#190): `downloading` with a live
   * `progress`, then relaunch; on failure → `error` + a toast. */
  installUpdate: () => Promise<void>;
  /** Drive the updater state directly (#190) — used by the dev mock (#193) to
   * exercise every state without a real release. */
  setUpdateState: (next: Partial<AppState["update"]>) => void;
  /** Dev mock (#193): fake an available update (version + sample/custom markdown
   * notes) so the indicator + Updates pane + patch-notes render light up, and arm
   * `updater`'s mock so `installUpdate` simulates the download + post-update toast. */
  mockUpdate: (opts?: { version?: string; notes?: string | null }) => void;
  /** Dev mock (#193): clear the mock + reset the updater state to idle. */
  clearUpdate: () => void;
  /** Fetch + store the 5-hour Claude usage (#154); fail-open to unavailable. Gated
   * to Claude (no-op for a non-Claude agent). */
  refreshUsage: () => Promise<void>;
  /** Start the 180s usage poll (#154) — main window only, idempotent. */
  startUsagePolling: () => void;
  /** Stop the usage poll (#154). */
  stopUsagePolling: () => void;
  /** Run the auto-continue reducer (#296) against the current `usage` snapshot +
   * settings + live Claude sessions: arm/wait/fire the machine, sync the tighter
   * armed poll cadence, and send the continue nudge to any fired sessions. Called
   * by `refreshUsage` after it sets `usage`; safe to call directly (used by tests). */
  applyAutoContinue: () => void;
  /** Toggle the `autoContinueAfterLimit` setting (#296) — backs the ⋯-menu checkable
   * item + the Settings toggle. Persists via `saveSettings`. */
  toggleAutoContinue: () => void;
  /** Set a single Claude agent's per-agent auto-continue opt-out (#297): `disabled =
   * true` excludes that agent from the #296 fire step. Optimistically updates the
   * session then persists via `ipc.setSessionAutoContinue`. */
  setAutoContinueDisabled: (id: string, disabled: boolean) => void;
  /** Add an existing folder to recents without spawning an agent (#172 sidebar
   * background menu → "New folder…"): opens the native folder picker and persists
   * the choice so it shows as a folder group immediately. Cancel = no-op; an already
   * listed folder just moves to the top. Doesn't select or switch the view. */
  addFolder: () => Promise<void>;
  closeNewSession: () => void;
  /** Open/close the Settings modal (#100). */
  setSettingsOpen: (open: boolean, section?: string) => void;
  /** Set the sidebar width (#108): clamp to [180, 560] + persist (debounced). */
  setSidebarWidth: (width: number) => void;
  /** Set the sidebar collapsed flag (#168): set + persist (main window). */
  setSidebarCollapsed: (collapsed: boolean) => void;
  /** Toggle the sidebar collapsed flag (#168) — the footer chevron + ⌘B. */
  toggleSidebarCollapsed: () => void;
  /** Request (or clear) an inline rename for an agent (#228) — see
   * `pendingRenameSessionId`. */
  setPendingRenameSession: (id: string | null) => void;
  /** Persist the drag-reordered top-level sidebar folder order (#211): optimistic
   * `set` + persist via `setRepoOrder` (main window). */
  reorderRepos: (ordered: string[]) => Promise<void>;
  /** Mark a diff file as "seen" (#278): store its current content `digest` under
   * `[repoPath][filePath]` (optimistic + debounced persist). A later content change
   * makes the stored digest stale → the file reads as ChangedSinceSeen. */
  markDiffSeen: (repoPath: string, filePath: string, digest: string) => void;
  /** Clear a diff file's "seen" marker (#278) back to NotSeen (optimistic + debounced
   * persist); drops the repo's entry once empty so the map stays tidy. */
  clearDiffSeen: (repoPath: string, filePath: string) => void;

  // --- Async / cross-cutting actions ---
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshBranches: () => Promise<void>;
  /** Re-read git file statuses (#252) — one repo when `repo` is given (the FileTree
   * mount / Refresh path), else every repo in the sidebar set (load / busy→idle /
   * git-write paths). Fail-open per repo (a failed read leaves the prior map). */
  refreshFileStatuses: (repo?: string) => Promise<void>;
  /** Bump the FileTree re-list signal (#253/#264): one repo when `repo` is given, else
   * every repo with a mounted tree. Each mounted FileTree re-fetches its currently
   * loaded directory levels in place — surfacing files created/removed on disk —
   * **without** collapsing expanded folders. */
  bumpFileTreeRefresh: (repo?: string) => void;
  /** Register a mounted FileTree for `repo` (#264, ref-counted) so the disk-change poll
   * only refreshes trees the user actually has open. Call on mount. */
  registerFileTree: (repo: string) => void;
  /** Unregister a mounted FileTree for `repo` (#264). Call on unmount. */
  unregisterFileTree: (repo: string) => void;
  /** Re-list + re-tint every mounted FileTree (#264) — the disk-change poll + focus
   * backstop. No-op when no tree is open or the window is hidden. */
  refreshOpenFileTrees: () => void;
  /** Start the FileTree disk-change visibility poll (#264) — runs in any window (main
   * or a detached canvas) that can show a tree; idempotent. */
  startFileTreePolling: () => void;
  /** Stop the disk-change poll + its focus/visibility listeners (#264). */
  stopFileTreePolling: () => void;
  /** Set/clear the FileTree OS-drag drop target highlight (#253); no-ops when the
   * target is unchanged so a stream of "over" events doesn't churn re-renders. */
  setFileDropTarget: (target: { repo: string; dir: string } | null) => void;
  /** Move dragged OS files/dirs (`sources`, absolute OS paths) into `destSubdir` of
   * `repo` (#253). Calls the backend per source, bumps the repo's FileTree refresh
   * signal on any success, and toasts a concise result. Fail-open per source. */
  moveFilesIntoRepo: (
    repo: string,
    destSubdir: string,
    sources: string[],
  ) => Promise<void>;
  /** Create a new folder at repo-relative `path` in the FileTree (#267). On success
   * bumps the repo's FileTree refresh signal + re-reads git statuses so the new
   * folder appears in place, and toasts the result. Errors toast and no-op. */
  createFolder: (repo: string, path: string) => Promise<void>;
  /** Delete the repo-relative file/folder at `path` from the FileTree (#267 —
   * recursive for a folder). On success refreshes the tree + git statuses and toasts;
   * a confinement / not-found error toasts and no-ops. */
  deleteTreePath: (repo: string, path: string) => Promise<void>;
  /** Rename (or move within the repo) the repo-relative file/folder `from` to `to` in
   * the FileTree (#291). On success refreshes the tree + git statuses and toasts; a
   * confinement / collision / invalid-name error toasts and no-ops. */
  renameTreePath: (repo: string, from: string, to: string) => Promise<void>;
  /** Assign a repo's color (optimistic + persisted) (#35). */
  setRepoColor: (path: string, color: string) => Promise<void>;
  /** Apply + persist application settings (#100) and run their side-effects. */
  saveSettings: (settings: Settings) => Promise<void>;
  /** First-launch agent detection: if not yet `onboarded`, presence-check the
   * selectable CLIs. 0 installed → no-op (re-checks next launch); exactly 1 → silently
   * make it the default (+ a toast if it's an untested agent); 2+ → open the picker. */
  maybeOnboardAgent: () => Promise<void>;
  /** Picker confirm: record `id` as the default agent and mark onboarding done. */
  chooseOnboardingAgent: (id: string) => Promise<void>;
  /** Picker dismiss (Escape / scrim): keep the current default but mark onboarding
   * done so it doesn't re-prompt. */
  dismissOnboarding: () => void;
  /** Add / close / reorder a repo's extra Overview panels (optimistic + persisted, #38).
   * Returns the new panel's id on add, the **existing** panel's id on a dedup hit
   * (#175 — so a caller can select/focus it), or `null` on a real failure (e.g. a
   * terminal that couldn't spawn). */
  addOverviewPanel: (
    repoPath: string,
    kind: OverviewPanel["kind"],
    file?: string,
  ) => Promise<string | null>;
  /** Author a new Kanban board (#143): write `<name>.md` with the default
   * To Do/Doing/Done lanes via `writeTextFile`, then open it as a `kanban` panel. */
  createKanbanBoard: (repoPath: string, name: string) => Promise<void>;
  removeOverviewPanel: (repoPath: string, id: string) => Promise<void>;
  /** Persist a repo's diff-panel source config on its diff panel (#81/#230). */
  setDiffCompare: (
    repoPath: string,
    config: {
      diff_source?: "working" | "compare" | "commits";
      compare_base?: string;
      compare_target?: string;
      commit_sha?: string;
    },
  ) => void;
  /** Switch an Overview file panel to another repo-relative file in place (#90). */
  setOverviewPanelFile: (
    repoPath: string,
    panelId: string,
    file: string,
  ) => void;
  /** Open an **out-of-repo** absolute file in an Overview file panel (#163): move
   * the panel to the file's parent dir (`newRepo`) with `file` = basename, deduping
   * by repo+file. Same-repo falls back to `setOverviewPanelFile`. */
  moveOverviewPanelToFile: (
    repoPath: string,
    panelId: string,
    newRepo: string,
    file: string,
  ) => void;
  /** Record a terminal item's shell exit (#72) so its Terminal shows Restart. */
  markTerminalExited: (id: string, code: number | null) => void;
  /** Respawn a terminal item's shell in `repoPath` under the same id (#72). */
  restartTerminal: (id: string, repoPath: string) => Promise<boolean>;
  /** Persist a repo cluster's drag-reordered item order (#43). */
  reorderOverview: (repoPath: string, orderedKeys: string[]) => Promise<void>;
  /** Replace the active Canvas tab's layout tree and persist (#58). */
  setActiveCanvasLayout: (tree: CanvasNode | null) => void;
  /** Distribute the active Canvas tab's panels evenly (#186): rebalance split
   * sizes so every leaf is equal area. No `splitId` → the whole canvas (tab-strip
   * button); a `splitId` → just that split's subtree (border double-click). */
  equalizeCanvas: (splitId?: string) => void;
  /** Begin lifting an existing panel out of the active tab at drag start (#155):
   * record the transient `liftedLeaf` so the Canvas renders without it (reflow).
   * No layout write — the persisted `canvases` blob is untouched until commit. */
  beginCanvasLift: (leafId: string) => void;
  /** Commit a lifted panel onto a drop target (#155): for a panel edge, move it
   * there reusing its original id/content (so the #18 pooled terminal reparents);
   * for the empty-canvas center (the lifted panel was the sole one) it's already
   * the whole tree, so just clear the lift. Persists via `setActiveCanvasLayout`. */
  commitCanvasLift: (targetId: string, edge: CanvasEdge) => void;
  /** Cancel a lift (#155): Esc / drop on nothing → clear `liftedLeaf` with no
   * layout write, so the panel snaps back to its exact previous position. */
  cancelCanvasLift: () => void;
  /** Maximize an item into big mode (#157): set the single overlay item. */
  maximizeItem: (content: CanvasContent) => void;
  /** Close big mode (#157): restore the item to its panel/column. */
  closeMaximized: () => void;
  /** Toggle big mode for the **selected** item via ⌘E / Ctrl+E (#284): when open,
   * close it (same chord); when closed, maximize the item `selectedId` resolves to
   * (`contentForSelected`) — a no-op when nothing maximizable is selected. */
  toggleMaximizeSelected: () => void;
  /** Add a new empty Canvas tab (default "Canvas N") and select it (#58). */
  addCanvas: () => void;
  /** Close a Canvas tab; always keeps ≥1 (closing the last leaves an empty one) (#58). */
  closeCanvas: (id: string) => void;
  /** Id of the canvas whose close is awaiting the kill/keep prompt (#137), or null. */
  canvasClosePromptId: string | null;
  /** Tab × entry point (#137): an empty tab closes silently; a tab with contents
   * branches on the `canvasCloseBehavior` setting (kill / keep / ask-via-modal). */
  requestCloseCanvas: (id: string) => void;
  /** Resolve the #137 close prompt: when `kill`, tear down the tab's agents/items
   * (`closeCanvasContents`), then close the tab either way. */
  confirmCloseCanvas: (id: string, kill: boolean) => Promise<void>;
  /** Dismiss the #137 close prompt, leaving the tab open and untouched. */
  cancelCloseCanvas: () => void;
  /** Rename a Canvas tab; a blank name keeps the current one (#58). */
  renameCanvas: (id: string, name: string) => void;
  /** Reorder the Canvas tabs (#58, dnd-kit). */
  reorderCanvases: (orderedIds: string[]) => void;
  /** Switch the active Canvas tab (#58). */
  selectCanvas: (id: string) => void;
  /** Open (or focus) a Canvas tab in its own native window for multi-monitor use
   * (#84). */
  popOutCanvas: (id: string) => void;
  /** Raise the detached window for a canvas (#84) — ⌘-jump + detached-tab click. */
  focusCanvasWindow: (id: string) => void;
  /** Apply a cross-window canvas-list update broadcast by the backend (#84). */
  applyCanvasSync: (canvases: CanvasTab[]) => void;
  /** Replace the set of detached canvas windows (#84, from `canvas://windows`). */
  setDetachedCanvasIds: (ids: string[]) => void;
  /** Switch a Canvas file panel (the active tab's leaf) to another file (#90). */
  setLeafFile: (leafId: string, file: string) => void;
  /** Open an **out-of-repo** absolute file in a Canvas file panel (#163): set the
   * leaf's `repoPath` (= file's parent dir) **and** `file` (= basename). */
  setLeafFileAbsolute: (leafId: string, repoPath: string, file: string) => void;
  /** Open the template editor (#117) — `id` to edit an existing template, `null`
   * for a brand-new one. */
  openTemplateEditor: (id: string | null) => void;
  /** Open the template editor seeded from the **active canvas's** live layout
   * (#187): each panel maps to its template block (structure + sizes preserved,
   * file/kanban paths and agent custom names carried). Toast + no-op when the
   * canvas has nothing templatable. The draft is unsaved until the user Saves. */
  openTemplateEditorFromCanvas: () => void;
  /** Close the template editor without saving (#117). */
  closeTemplateEditor: () => void;
  /** Open / close the "Manage templates" view (#117). */
  openTemplateManager: () => void;
  closeTemplateManager: () => void;
  /** Save a template (#117): update `id` if given, else create a new one; persist.
   * Returns the saved template's id. */
  saveTemplate: (
    name: string,
    layout: CanvasNode | null,
    id?: string | null,
  ) => string;
  /** Rename a saved template (#117); a blank name is ignored. */
  renameTemplate: (id: string, name: string) => void;
  /** Duplicate a saved template (#117) as "<name> copy". */
  duplicateTemplate: (id: string) => void;
  /** Delete a saved template (#117). */
  deleteTemplate: (id: string) => void;
  /** Export a saved template to a user-chosen `.json` file for sharing (#275). */
  exportTemplate: (id: string) => Promise<void>;
  /** Import a template from a user-chosen `.json` file (#275): validates the shape,
   * then adds it to the list with a fresh id. */
  importTemplate: () => Promise<void>;
  /** Open / close the "New tab from template" chooser (#118). */
  openTemplateUse: () => void;
  closeTemplateUse: () => void;
  /** Instantiate a template (#118): open a new Canvas tab against `cwd` with each
   * block pending, then asynchronously resolve every pending panel. */
  useTemplate: (templateId: string, cwd: string) => void;
  /** (Re)run a pending template panel's block (#118) — initial resolution + Retry.
   * Resolves to live content on success, or sets the panel's inline error. */
  resolveTemplateBlock: (canvasId: string, leafId: string) => Promise<void>;
  /** Set a pending `open-file` panel's relative path then retry it (#118 Pick file). */
  pickTemplateBlockFile: (
    canvasId: string,
    leafId: string,
    file: string,
  ) => void;
  /** Set (or clear) the keyboard-focused Canvas panel (#76). */
  setActiveLeaf: (id: string | null) => void;
  /** Move the Canvas focus to the spatially adjacent panel (#76). */
  moveCanvasFocus: (dir: "left" | "right" | "up" | "down") => void;
  /** Optionally `git checkout <branch>` first (#27); resolves true on success. */
  spawnSession: (
    cwd: string,
    name?: string,
    branch?: string,
  ) => Promise<boolean>;
  /** Start an agent in an isolated git worktree for an existing branch (#74). */
  spawnWorktreeSession: (repo: string, branch: string) => Promise<boolean>;
  /** Create + check out a new branch from `base` (empty = HEAD), then start an agent
   * in the repo folder (#124). Resolves `true` on success, else an error message for
   * inline display (e.g. an invalid / already-existing name). */
  createBranchSession: (
    cwd: string,
    name: string,
    base: string,
  ) => Promise<true | string>;
  /** Create a new branch as an isolated worktree (#74/#124) and start an agent there
   * (the ⌘⏎ path). Resolves `true` on success, else an error message. */
  createBranchWorktreeSession: (
    repo: string,
    name: string,
    base: string,
  ) => Promise<true | string>;
  /** Remove a worktree once its last active agent is gone (ref-counted, #74). */
  cleanupWorktreeIfEmpty: (parent: string, dest: string) => Promise<void>;
  /** Resume a crashed / boot-failed agent's PTY; resolves true on success so the
   * caller can reset the pooled terminal (#63). */
  restartSession: (id: string) => Promise<boolean>;
  /** Fork a source agent's conversation into a new parallel session (#126): spawn the
   * fork, add + **select** it, and **surface** it (a new Canvas panel when in Canvas);
   * the source keeps running untouched. Resolves true on success. */
  forkSession: (sourceId: string) => Promise<boolean>;
  /** Open an agent in the Canvas view from its sidebar row menu (#153): reuse the
   * agent's existing Canvas tab if it already has a panel there (focus that tab, or
   * raise its detached window #84), else create a new "Canvas N" tab holding it.
   * Switches to Canvas + focuses the panel; the agent is already a `sessions` item
   * so no `overviewPanels` registration is needed (#152). */
  openSessionInCanvas: (sessionId: string) => void;
  /** View-aware file open from the file tree (#175). In **Overview**: add (or, on a
   * dedup hit, jump to the already-open) Overview column and select it (the
   * `selectedId` → `data-item-id` effect scrolls it into view). In **Canvas** (incl.
   * a detached canvas window): focus the file's existing leaf across all tabs —
   * switching to its tab or raising its detached window (#84) — else append it as a
   * panel to the active tab. Either way the file is registered in `overviewPanels`
   * (the #152 source of truth) so it also shows in the sidebar + Overview and its
   * removal cascades. `kind` is the panel kind: `"markdown"` (file viewer) or
   * `"kanban"` (board). */
  openFileFromTree: (
    repoPath: string,
    file: string,
    kind: "markdown" | "kanban",
  ) => Promise<void>;
  /** Forget a cleanly-exited (code 0) agent (#63): drop it from the store and its
   * persisted record (kill + forget, like Remove) so it vanishes from
   * Focus/Overview/sidebar and won't return on next boot; shows a brief toast. */
  forgetExitedSession: (id: string) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  /** Set (or clear, when blank) a session's custom name; propagates everywhere (#57). */
  renameSession: (id: string, name: string) => Promise<void>;
  /** Forget a folder: kill+forget all its sessions and drop it from recents (#31). */
  forgetRepo: (repoPath: string) => Promise<void>;
  /** Kill + forget every running agent in a folder — incl. its worktree agents
   * (#74) — keeping the folder + its non-agent items (#91). */
  killAllAgents: (repoPath: string) => Promise<void>;
  /** Clear a folder's workspace — kill all its agents AND remove all its non-agent
   * items (each terminal's shell killed) — but keep the folder in recents (#91). */
  closeAllItems: (repoPath: string) => Promise<void>;
  /** Kill + forget every running agent across **all** folders at once (#293) — the
   * sidebar background menu's global complement to the per-repo #91 action. Reuses
   * the shared per-repo mechanics (incl. #74 worktree cleanup); one summary toast. */
  killAllAgentsGlobal: () => Promise<void>;
  /** Clear every folder's workspace at once (#293) — kill all agents AND remove all
   * non-agent items app-wide (each terminal's shell killed) — keeping folders in
   * recents. The global complement to the per-repo #91 Close all items; one toast. */
  closeAllItemsGlobal: () => Promise<void>;
  /** Create a scheduled session (#93). Resolves `true` on success, else an error
   * message for inline display (e.g. a worktree schedule's bad/duplicate branch —
   * its worktree + branch are created eagerly at schedule time, #259). */
  scheduleSession: (
    cwd: string,
    branch: string | null,
    name: string | null,
    prompt: string | null,
    at: number,
    createBranch?: boolean,
    base?: string | null,
    worktree?: boolean,
  ) => Promise<true | string>;
  /** Cancel a pending scheduled session (#93). */
  cancelSchedule: (id: string) => Promise<void>;
  /** Update a schedule's prompt / name / fire time (#93). */
  updateSchedule: (
    id: string,
    prompt: string | null,
    name: string | null,
    at: number,
  ) => Promise<void>;
  /** Fire a pending scheduled session immediately (#269) — the "Start now" button.
   * Triggers the same backend firing path as a natural fire; the resulting
   * `schedule://fired` event drives the scheduled→live transition (`onFired`). On a
   * spawn failure the schedule stays and an error toast is shown. */
  startScheduleNow: (id: string) => Promise<void>;
  /** Apply a cross-window pending-schedule list broadcast by the backend (#280,
   * `schedule://changed`). Keeps a detached canvas window's `schedules` slice in sync
   * (so a scheduled panel renders + reflects live edits); a no-op when unchanged. */
  applyScheduleSync: (schedules: ScheduledSession[]) => void;
  /** Create a recurring session (#294). Resolves `true` on success, else an error
   * message for inline display (e.g. a worktree recurring's bad/duplicate branch). */
  createRecurring: (
    cwd: string,
    branch: string | null,
    name: string | null,
    prompt: string | null,
    intervalSecs: number,
    firstFireAt: number,
    createBranch?: boolean,
    base?: string | null,
    worktree?: boolean,
  ) => Promise<true | string>;
  /** Cancel a recurring session (#294): kill its child + remove the record + prune its
   * Canvas leaves + ref-counted worktree cleanup (mirrors `cancelSchedule`). */
  cancelRecurring: (id: string) => Promise<void>;
  /** Update a recurring's prompt / name / interval / next-run time (#294). */
  updateRecurring: (
    id: string,
    prompt: string | null,
    name: string | null,
    intervalSecs: number,
    nextFireAt: number,
  ) => Promise<void>;
  /** Apply a cross-window recurring-list broadcast by the backend (#294,
   * `recurring://changed`) — keeps a detached canvas window's `recurrings` slice in
   * sync; a no-op when unchanged. */
  applyRecurringSync: (recurrings: RecurringSession[]) => void;
  copyToClipboard: (text: string, label?: string) => Promise<void>;
  /** Fast-forward `cwd`'s current branch to its upstream — `git pull --ff-only`
   * (#181, sidebar repo / worktree "Pull"). Toasts the result (summary or git
   * error); never merges or leaves a partial state. */
  pullFolder: (cwd: string) => Promise<void>;
  /** Best-effort `git fetch --prune` on `cwd` (#243, the repo branch-line menu's
   * "Fetch"). Reuses the #180 `fetch_remotes` command — no new backend. Toasts
   * success ("Fetched <repo>") or git's error, then refreshes branch labels so any
   * branch movement is reflected. */
  fetchFolder: (cwd: string) => Promise<void>;
  /** Check out an existing local branch in `repo` from the sidebar repo menu (#266) —
   * `git checkout <branch>`, **no agent spawn** (unlike `spawnSession`'s checkout).
   * Toasts success ("Checked out <branch>") or the git error, then refreshes the
   * branch label (#212) + file-tree status coloring (#252). */
  checkoutFolderBranch: (repo: string, branch: string) => Promise<void>;
  /** Create + check out a new branch `name` from `base` (empty = HEAD) in `repo` from
   * the sidebar repo menu (#266) — `git checkout -b`, **no agent spawn**. Resolves
   * `true` on success (toasting), else the git error string for inline display (an
   * invalid / already-existing name, unknown base). Also pulls a remote-tracking ref
   * into a local branch (base = the remote ref), reusing the #124/#180 pattern. */
  createFolderBranch: (
    repo: string,
    name: string,
    base: string,
  ) => Promise<true | string>;
}

/**
 * Kill + forget every **running** agent in `repoPath` — including its worktree
 * agents (#74) — with ref-counted worktree cleanup (a dirty worktree is kept).
 * Shared by the #91 bulk repo actions; returns how many agents were killed. It
 * adds **no** toast — each caller emits its own single summary (#83). Kills are
 * marked intentional so the backend `Exited` events are swallowed (#32).
 */
async function killAgentsInRepo(repoPath: string): Promise<number> {
  const running = useStore
    .getState()
    .sessions.filter(
      (s) =>
        (s.repoPath === repoPath || s.worktreeParent === repoPath) &&
        s.exitedCode === undefined,
    );
  const ids = running.map((s) => s.id);
  if (ids.length === 0) return 0;
  const idSet = new Set(ids);
  const worktreeDests = [
    ...new Set(
      running
        .filter((s) => s.worktreeParent === repoPath)
        .map((s) => s.repoPath),
    ),
  ];
  ids.forEach((id) => intentionalKills.add(id));
  await Promise.all(ids.map((id) => ipc.killSession(id).catch(() => {})));
  useStore.setState((s) => {
    const clearSelection = s.selectedId != null && idSet.has(s.selectedId);
    return {
      sessions: s.sessions.filter((x) => !idSet.has(x.id)),
      selectedId: clearSelection ? null : s.selectedId,
      view: clearSelection ? "overview" : s.view,
      sessionBusy: Object.fromEntries(
        Object.entries(s.sessionBusy).filter(([id]) => !idSet.has(id)),
      ),
      sessionActive: Object.fromEntries(
        Object.entries(s.sessionActive).filter(([id]) => !idSet.has(id)),
      ),
    };
  });
  // Ref-counted worktree cleanup (#74): keep a dirty worktree rather than force it.
  // Fire-and-forget (#200): the FS delete runs off the main thread (async backend),
  // so this bulk action returns and toasts immediately instead of blocking on a
  // large worktree delete; the dir is removed in the background.
  for (const dest of worktreeDests) {
    void useStore.getState().cleanupWorktreeIfEmpty(repoPath, dest);
  }
  return ids.length;
}

/**
 * Remove `repoPath`'s non-agent items (#106) — file/diff viewers and shell
 * terminals (#72) — and kill each terminal's PTY (intentional, so no Restart
 * overlay). Drops `overviewPanels[repoPath]`, prunes the matching `terminalExits`,
 * and persists the cleared list. Shared by #91 Close all items and #106 Forget
 * folder; adds **no** toast (each caller emits its own summary). Returns the count.
 */
async function closeRepoItems(repoPath: string): Promise<number> {
  const panels = useStore.getState().overviewPanels[repoPath] ?? [];
  if (panels.length === 0) return 0;
  // Each terminal item owns a shell PTY (#72) — kill it (intentional, so no
  // Restart overlay). File/diff panels are pure UI.
  for (const p of panels) {
    if (p.kind === "terminal") {
      intentionalKills.add(p.id);
      await ipc.killSession(p.id).catch(() => {});
    }
  }
  const removed = new Set(panels.map((p) => p.id));
  useStore.setState((s) => {
    const map = { ...s.overviewPanels };
    delete map[repoPath];
    return {
      overviewPanels: map,
      terminalExits: Object.fromEntries(
        Object.entries(s.terminalExits).filter(([id]) => !removed.has(id)),
      ),
    };
  });
  void ipc.setOverviewPanels(repoPath, []).catch(() => {});
  return panels.length;
}

/**
 * Tear down everything a closing Canvas tab's `layout` held (#137): kill its agents
 * (with #74 worktree cleanup) and shell-terminal PTYs (intentional, #32 — no Exited
 * toast / Restart overlay), and remove its file / diff / terminal / scheduled items
 * from the sidebar + Overview. A **global** removal — the sidebar lists each item once,
 * so this also removes it from any other open tab (documented; protecting cross-tab
 * items is out of scope). Reuses the existing kill / overviewPanels / cancelSchedule
 * primitives, batched into one state update + **one** summary toast (#83).
 */
async function closeCanvasContents(layout: CanvasNode): Promise<void> {
  const { sessions, overviewPanels } = useStore.getState();
  const sessionIds = new Set(sessions.map((s) => s.id));
  const leaves = collectLeaves(layout);

  const agentIds = new Set<string>(); // tracked agent sessions to kill + drop
  const termPtyIds = new Set<string>(); // shell-terminal PTYs to kill
  const scheduleIds = new Set<string>(); // schedules to cancel
  // Overview/sidebar panel ids to drop, grouped by repo (file / diff / terminal items).
  const panelIdsByRepo = new Map<string, Set<string>>();
  let files = 0;
  let diffs = 0;
  let boards = 0;

  for (const { content: c } of leaves) {
    if (c.kind === "agent" && c.sessionId && sessionIds.has(c.sessionId)) {
      agentIds.add(c.sessionId);
    } else if (c.kind === "terminal" && c.sessionId) {
      termPtyIds.add(c.sessionId);
    } else if (c.kind === "scheduled" && c.scheduleId) {
      scheduleIds.add(c.scheduleId);
    } else if (c.kind === "file") {
      files += 1;
    } else if (c.kind === "diff") {
      diffs += 1;
    } else if (c.kind === "kanban") {
      boards += 1;
    }
    // File/diff/terminal panels that are also sidebar items (in overviewPanels) get
    // removed from the left panel. Since #152 a template-opened terminal (#118) is
    // also a sidebar item (registered under its PTY id), so this drops its panel too;
    // any non-registered terminal is still covered by the PTY kill above.
    const addPanel = (repo: string, id: string) => {
      if (!panelIdsByRepo.has(repo)) panelIdsByRepo.set(repo, new Set());
      panelIdsByRepo.get(repo)?.add(id);
    };
    if (c.kind === "file" || c.kind === "diff" || c.kind === "kanban") {
      const panelId = leafItemId(c, overviewPanels);
      if (panelId) addPanel(c.repoPath ?? "", panelId);
    } else if (c.kind === "terminal" && c.sessionId) {
      const repo = c.repoPath ?? "";
      if ((overviewPanels[repo] ?? []).some((p) => p.id === c.sessionId))
        addPanel(repo, c.sessionId);
    }
  }

  // Worktree dests to reclaim after the agents go (#74), captured pre-drop.
  const worktreeDests = [
    ...new Map(
      sessions
        .filter((s) => agentIds.has(s.id) && s.worktreeParent)
        .map((s) => [
          s.repoPath,
          { parent: s.worktreeParent as string, dest: s.repoPath },
        ]),
    ).values(),
  ];

  // Kill PTYs (intentional, so the exit doesn't toast / show Restart, #32).
  const killIds = [...agentIds, ...termPtyIds];
  killIds.forEach((id) => intentionalKills.add(id));
  await Promise.all(killIds.map((id) => ipc.killSession(id).catch(() => {})));
  await Promise.all(
    [...scheduleIds].map((id) => ipc.cancelSchedule(id).catch(() => {})),
  );

  // The full set of removed item ids, for clearing a now-dangling selection.
  const removedIds = new Set<string>([
    ...agentIds,
    ...termPtyIds,
    ...scheduleIds,
  ]);
  for (const ids of panelIdsByRepo.values())
    for (const id of ids) removedIds.add(id);

  // One batched state update across sessions / overviewPanels / schedules.
  useStore.setState((s) => {
    const map = { ...s.overviewPanels };
    for (const [repo, ids] of panelIdsByRepo) {
      const next = (map[repo] ?? []).filter((p) => !ids.has(p.id));
      if (next.length) map[repo] = next;
      else delete map[repo];
    }
    const clearSelection = s.selectedId != null && removedIds.has(s.selectedId);
    return {
      sessions: s.sessions.filter((x) => !agentIds.has(x.id)),
      schedules: s.schedules.filter((x) => !scheduleIds.has(x.id)),
      overviewPanels: map,
      selectedId: clearSelection ? null : s.selectedId,
      view: clearSelection ? "overview" : s.view,
      sessionBusy: Object.fromEntries(
        Object.entries(s.sessionBusy).filter(([id]) => !agentIds.has(id)),
      ),
      sessionActive: Object.fromEntries(
        Object.entries(s.sessionActive).filter(([id]) => !agentIds.has(id)),
      ),
      terminalExits: Object.fromEntries(
        Object.entries(s.terminalExits).filter(([id]) => !removedIds.has(id)),
      ),
    };
  });

  // Persist each affected repo's cleared panel list.
  for (const repo of panelIdsByRepo.keys()) {
    void ipc
      .setOverviewPanels(repo, useStore.getState().overviewPanels[repo] ?? [])
      .catch(() => {});
  }

  // Ref-counted worktree cleanup (#74): keep a dirty worktree rather than force it.
  // Fire-and-forget (#200): the FS delete runs off the main thread (async backend),
  // so this bulk action returns and toasts immediately instead of blocking on a
  // large worktree delete; the dir is removed in the background.
  for (const { parent, dest } of worktreeDests) {
    void useStore.getState().cleanupWorktreeIfEmpty(parent, dest);
  }

  // One summary toast (#83), not per-item spam.
  const parts: string[] = [];
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (agentIds.size) parts.push(plural(agentIds.size, "agent"));
  if (termPtyIds.size) parts.push(plural(termPtyIds.size, "terminal"));
  if (files) parts.push(plural(files, "file"));
  if (diffs) parts.push(plural(diffs, "diff"));
  if (boards) parts.push(plural(boards, "board"));
  if (scheduleIds.size) parts.push(plural(scheduleIds.size, "schedule"));
  if (parts.length)
    useStore.getState().pushToast(`Closed tab — removed ${parts.join(", ")}`);
}

/**
 * Register a template-opened (#118) non-agent item in the source of truth (#152) —
 * `overviewPanels`, which drives **both** the sidebar tree (#59) and the Overview
 * wall — so a file / diff / terminal opened through a Canvas template appears in the
 * left panel and Overview, not only in its Canvas leaf. Unlike `addOverviewPanel`,
 * this **does not** spawn a PTY (the template already spawned it) or toast (the
 * template open already toasts). A **terminal** panel MUST carry the spawned PTY's
 * id (== the Canvas leaf `sessionId`) so the matchers + the App reconcile line up
 * (no duplicate / orphan); file/diff/kanban dedup by repo+file / repo (mirroring
 * `addOverviewPanel`) so re-opening the same item doesn't add a second sidebar row.
 * Persists the repo's list best-effort.
 */
function registerOverviewPanel(repoPath: string, panel: OverviewPanel): void {
  const current = useStore.getState().overviewPanels[repoPath] ?? [];
  const dup =
    panel.kind === "diff"
      ? current.some((p) => p.kind === "diff")
      : panel.kind === "markdown" || panel.kind === "kanban"
        ? current.some((p) => p.kind === panel.kind && p.file === panel.file)
        : current.some((p) => p.id === panel.id); // terminal: same PTY id
  if (dup) return;
  const next = [...current, panel];
  useStore.setState((s) => ({
    overviewPanels: { ...s.overviewPanels, [repoPath]: next },
  }));
  void ipc.setOverviewPanels(repoPath, next).catch(() => {});
}

/**
 * Cascade a left-panel removal into Canvas (#152): remove every Canvas leaf —
 * across **all** tabs — whose content matches `match`, so removing an item from
 * the sidebar (file/diff/terminal/kanban via `removeOverviewPanel`, an agent via
 * `dropSession`, a schedule via `cancelSchedule`) also removes it from every Canvas
 * panel that shows it. Each emptied split collapses (`removeLeaf`), a now-dangling
 * keyboard focus (#76) is cleared, and the result is persisted + broadcast
 * (`setCanvases` → `canvas://changed`) so detached windows (#84) stay in sync. The
 * item's PTY is killed by the caller as today; Overview needs no extra work (it
 * mirrors `overviewPanels`). No-op when nothing matches.
 */
function pruneCanvasLeaves(match: (content: CanvasContent) => boolean): void {
  const { canvases, activeCanvasId, activeLeafId } = useStore.getState();
  const removedLeafIds = new Set<string>();
  const next = canvases.map((c) => {
    if (!c.layout) return c;
    const ids = collectLeaves(c.layout)
      .filter((l) => match(l.content))
      .map((l) => l.id);
    if (ids.length === 0) return c;
    let layout: CanvasNode | null = c.layout;
    for (const id of ids) {
      removedLeafIds.add(id);
      if (layout) layout = removeLeaf(layout, id);
    }
    return { ...c, layout };
  });
  if (removedLeafIds.size === 0) return;
  useStore.setState({
    canvases: next,
    activeLeafId:
      activeLeafId && removedLeafIds.has(activeLeafId) ? null : activeLeafId,
  });
  void ipc
    .setCanvases({ canvases: next, activeId: activeCanvasId })
    .catch(() => {});
}

export const useStore = create<AppState>()((set, get) => ({
  sessions: [],
  selectedId: null,
  view: "overview",
  overviewRepoFilter: null,
  recents: [],
  branches: {},
  fileStatuses: {},
  fileDropTarget: null,
  fileTreeRefresh: {},
  fileTreeMounts: {},
  repoColors: {},
  overviewPanels: {},
  overviewOrder: {},
  // One empty canvas until init loads/migrates the persisted tabs (#58) — keeps
  // the always-≥1 invariant even before the backend responds.
  canvases: [{ id: "canvas-1", name: "Canvas 1", layout: null }],
  // A detached window (#84) fixes its active tab to its own canvas from the start
  // so it renders the right layout before the persisted tabs load.
  activeCanvasId: DETACHED_CANVAS_ID ?? "canvas-1",
  detachedCanvasIds: [],
  canvasClosePromptId: null,
  canvasTemplates: [],
  templateEditorOpen: false,
  templateEditorId: null,
  templateEditorSeed: null,
  templateEditorSeedName: null,
  templateManagerOpen: false,
  templateUseOpen: false,
  activeLeafId: null,
  liftedLeaf: null,
  maximizedItem: null,
  sessionBusy: {},
  sessionActive: {},
  terminalExits: {},
  claudeMissing: false,
  platform: "",
  windowsBuild: 0,
  toasts: [],
  newSessionOpen: false,
  newSessionRepo: null,
  scheduleMode: false,
  recurringMode: false,
  newSessionInitialBranches: null,
  newSessionAtBranch: false,
  cloneRepoOpen: false,
  createPanelOpen: false,
  createPanelType: null,
  update: {
    status: "idle",
    version: null,
    progress: 0,
    confirming: false,
    notes: null,
  },
  usage: { usedPercent: null, resetsAtMs: null, available: false },
  autoContinue: IDLE_AUTO_CONTINUE,
  schedules: [],
  recurrings: [],
  settings: DEFAULT_SETTINGS,
  settingsOpen: false,
  onboardingOpen: false,
  onboardingChoices: [],
  settingsSection: null,
  sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
  sidebarCollapsed: false,
  folderOrder: [],
  diffSeen: {},
  pendingRenameSessionId: null,

  setView: (view) => set({ view }),
  // Open/close the Settings modal (#100); an optional `section` deep-links to a
  // pane (#191, e.g. the updater indicator → "updates"). Cleared on close so the
  // next plain open (the gear) starts at the default section.
  setSettingsOpen: (open, section) =>
    set({
      settingsOpen: open,
      settingsSection: open ? (section ?? null) : null,
    }),
  setSidebarWidth: (width) => {
    const clamped = clampSidebarWidth(width);
    if (clamped === get().sidebarWidth) return; // no-op (e.g. dragging past a bound)
    set({ sidebarWidth: clamped });
    // Persist debounced so a drag's many updates don't spam IPC; the last wins.
    if (sidebarWidthPersistTimer) clearTimeout(sidebarWidthPersistTimer);
    sidebarWidthPersistTimer = setTimeout(() => {
      void ipc.setSidebarWidth(clamped).catch(() => {});
    }, 300);
  },
  setSidebarCollapsed: (collapsed) => {
    if (collapsed === get().sidebarCollapsed) return;
    set({ sidebarCollapsed: collapsed });
    // Persist only from the main window (a detached canvas has no sidebar); rare
    // toggle, so no debounce.
    if (IS_MAIN_WINDOW) {
      void ipc.setSidebarCollapsed(collapsed).catch(() => {});
    }
  },
  toggleSidebarCollapsed: () =>
    get().setSidebarCollapsed(!get().sidebarCollapsed),
  setPendingRenameSession: (id) => set({ pendingRenameSessionId: id }),
  // Persist the drag-reordered top-level folder order (#211): optimistic local set,
  // then persist (main window only — a detached canvas has no sidebar). Mirrors
  // `reorderOverview`; a persist failure (e.g. outside Tauri) keeps the local order.
  reorderRepos: async (ordered) => {
    set({ folderOrder: ordered });
    if (!IS_MAIN_WINDOW) return;
    try {
      await ipc.setRepoOrder(ordered);
    } catch {
      // Persist failed; keep the local order for the session.
    }
  },
  // Diff "seen" markers (#278): optimistic local set, then a debounced persist of the
  // whole map (toggling a few files coalesces into one write). Persisted from any
  // window — a diff panel lives in the main window AND a detached canvas (#84).
  markDiffSeen: (repoPath, filePath, digest) => {
    set((s) => ({
      diffSeen: {
        ...s.diffSeen,
        [repoPath]: { ...s.diffSeen[repoPath], [filePath]: digest },
      },
    }));
    persistDiffSeen();
  },
  clearDiffSeen: (repoPath, filePath) => {
    set((s) => {
      const repo = s.diffSeen[repoPath];
      if (!repo || !(filePath in repo)) return {}; // nothing to clear
      const rest = { ...repo };
      delete rest[filePath];
      const next = { ...s.diffSeen };
      if (Object.keys(rest).length === 0) {
        delete next[repoPath]; // drop the now-empty repo entry
      } else {
        next[repoPath] = rest;
      }
      return { diffSeen: next };
    });
    persistDiffSeen();
  },
  // Selection is decoupled from the view (#22): selecting only highlights. The
  // sidebar ViewSwitch is the only thing that changes the view (#75).
  select: (id) => set({ selectedId: id }),

  // Toggle the Overview filter (#34/#247): re-selecting the same path AND mode (or
  // passing null) clears it; a different path or mode switches. `mode` defaults to
  // "all" (folder click); the branch line passes "own".
  setOverviewRepoFilter: (path, mode = "all") =>
    set((s) => {
      const cur = s.overviewRepoFilter;
      if (path === null || (cur && cur.path === path && cur.mode === mode))
        return { overviewRepoFilter: null };
      return { overviewRepoFilter: { path, mode } };
    }),

  setSessions: (sessions) => set({ sessions }),
  setRecents: (recents) => set({ recents }),

  upsertSession: (session) =>
    set((s) => ({
      sessions: [...s.sessions.filter((x) => x.id !== session.id), session],
    })),

  dropSession: (id) => {
    set((s) => ({
      sessions: s.sessions.filter((x) => x.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      view: s.selectedId === id ? "overview" : s.view,
      sessionBusy: omitKey(s.sessionBusy, id),
      sessionActive: omitKey(s.sessionActive, id),
    }));
    // An agent removed from the left panel (Remove #57, or a clean exit #63) also
    // disappears from every Canvas tab showing it (#152). The PTY is killed by the
    // caller (removeSession / forgetExitedSession); reconcile disposes the xterm.
    pruneCanvasLeaves((c) => c.kind === "agent" && c.sessionId === id);
  },

  markExited: (id, code) => {
    reconnectingIds.delete(id); // no longer reconnecting (#261)
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === id ? { ...x, exitedCode: code, reconnecting: false } : x,
      ),
      // An exited session is not working — clear any busy flag (#42).
      sessionBusy: omitKey(s.sessionBusy, id),
    }));
  },

  setBusy: (id, busy) => {
    const wasBusy = get().sessionBusy[id] ?? false;
    set((s) => {
      if ((s.sessionBusy[id] ?? false) === busy) return {}; // no-op, skip re-render
      // First activity marks the session "has been active" (#112): it stays set
      // (idle returns to yellow; only going busy again leaves it), and is cleared
      // with the other per-session state on removal. Only the false→true write
      // changes the map ref; busy→idle keeps it (the session has still worked).
      const sessionActive =
        busy && !s.sessionActive[id]
          ? { ...s.sessionActive, [id]: true }
          : s.sessionActive;
      return {
        sessionBusy: busy
          ? { ...s.sessionBusy, [id]: true }
          : omitKey(s.sessionBusy, id),
        sessionActive,
      };
    });
    // Busy→idle settle (#212): a turn just finished, so an in-terminal `git checkout`
    // during it has completed — re-read branch labels (debounced) so the sidebar
    // worktree/repo label tracks the new branch without an app restart. This is the
    // single transition point (the `session://state` handler's only caller).
    if (wasBusy && !busy) scheduleBranchRefresh();
  },

  setAutoName: (id, autoName) =>
    set((s) => {
      const session = s.sessions.find((x) => x.id === id);
      // No-op when the session is gone or the title is unchanged (#97), keeping
      // the busy/idle re-render path quiet.
      if (!session || (session.autoName ?? null) === autoName) return {};
      return {
        sessions: s.sessions.map((x) => (x.id === id ? { ...x, autoName } : x)),
      };
    }),

  setForkable: (id, forkable) =>
    set((s) => {
      const session = s.sessions.find((x) => x.id === id);
      // No-op when the id isn't a tracked session (e.g. a shell terminal also poked
      // by the title worker) or the flag is unchanged (#138) — keeps the busy/idle
      // re-render path quiet.
      if (!session || (session.forkable ?? true) === forkable) return {};
      return {
        sessions: s.sessions.map((x) => (x.id === id ? { ...x, forkable } : x)),
      };
    }),

  markRunning: (id) => {
    reconnectingIds.delete(id); // no longer reconnecting (#261)
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === id ? { ...x, exitedCode: undefined, reconnecting: false } : x,
      ),
    }));
  },

  markConnected: (id) => {
    reconnectingIds.delete(id); // drained on the first live output (#261)
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === id ? { ...x, reconnecting: false } : x,
      ),
    }));
  },

  setClaudeMissing: (missing) => set({ claudeMissing: missing }),

  pushToast: (message, tone = "info") => {
    const id = `toast-${++toastSeq}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }));
    setTimeout(() => get().dismissToast(id), TOAST_TTL_MS);
    return id;
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  openNewSession: (repo) =>
    set({
      newSessionOpen: true,
      newSessionRepo: repo ?? null,
      scheduleMode: false,
      recurringMode: false,
      // Folder-step open (global ⌘N / button): the modal loads branches itself (#127).
      newSessionInitialBranches: null,
      newSessionAtBranch: false,
    }),
  startRepoSession: (repo) => {
    // The folder is known (#127), so skip the folder step. Open the modal **instantly**
    // at the branch step (#263) — don't await `list_branches` first, which used to gate
    // the modal's appearance on a Tauri round-trip + git shell-out. The modal then loads
    // branches asynchronously (its own branch-detection effect) and, for a non-git /
    // empty / detection-failed folder, spawns directly + closes (preserving #127's
    // no-modal behavior, just deferred to after the open).
    set({
      newSessionOpen: true,
      newSessionRepo: repo,
      scheduleMode: false,
      recurringMode: false,
      newSessionInitialBranches: null,
      newSessionAtBranch: true,
    });
  },
  openSchedule: (repo) =>
    set({
      newSessionOpen: true,
      newSessionRepo: repo ?? null,
      scheduleMode: true,
      recurringMode: false,
      newSessionInitialBranches: null,
      newSessionAtBranch: false,
    }),
  openRecurring: (repo) =>
    set({
      newSessionOpen: true,
      newSessionRepo: repo ?? null,
      scheduleMode: false,
      recurringMode: true,
      newSessionInitialBranches: null,
      newSessionAtBranch: false,
    }),
  openCloneRepo: () => set({ cloneRepoOpen: true }),
  closeCloneRepo: () => set({ cloneRepoOpen: false }),
  closeNewSession: () =>
    set({
      newSessionOpen: false,
      newSessionRepo: null,
      scheduleMode: false,
      recurringMode: false,
      newSessionInitialBranches: null,
      newSessionAtBranch: false,
    }),

  // ⌘K / ⌘⌥1–6 Create-panel launcher (#189): pure open/close. The modal itself
  // orchestrates the existing creation actions (startRepoSession / addOverviewPanel
  // / createKanbanBoard) against the chosen folder.
  openCreatePanel: (type) =>
    set({ createPanelOpen: true, createPanelType: type ?? null }),
  closeCreatePanel: () =>
    set({ createPanelOpen: false, createPanelType: null }),

  // In-app updater (#190). Best-effort check on boot: returns null today (no signed
  // release / placeholder pubkey), so the indicator stays hidden. Structured so the
  // mock (#193) can `setUpdateState` any status.
  checkForUpdate: async () => {
    set((s) => ({ update: { ...s.update, status: "checking" } }));
    try {
      const info = await updater.checkForUpdate();
      set((s) => ({
        update: info
          ? {
              ...s.update,
              status: "available",
              version: info.version,
              // Release-carried notes (#192) so the not-yet-installed version's
              // notes render in the Updates pane's "What's new" slot.
              notes: info.notes,
            }
          : { ...s.update, status: "idle" },
      }));
    } catch {
      // Offline, no update, or running outside Tauri — stay idle (no error UI for a
      // background check).
      set((s) => ({ update: { ...s.update, status: "idle" } }));
    }
  },
  openUpdateConfirm: () =>
    set((s) => ({ update: { ...s.update, confirming: true } })),
  cancelUpdate: () =>
    set((s) => ({ update: { ...s.update, confirming: false } })),
  installUpdate: async () => {
    set((s) => ({
      update: {
        ...s.update,
        status: "downloading",
        progress: 0,
        confirming: false,
      },
    }));
    try {
      await updater.downloadAndRelaunch((percent) =>
        set((s) => ({ update: { ...s.update, progress: percent } })),
      );
      // Real mode relaunches into the new version and never returns here (#190).
      // Dev mock (#193): no relaunch — fire the post-update toast and reset to idle,
      // mirroring the real boot-time post-update step.
      if (updater.isMockUpdate()) {
        const version = get().update.version;
        get().pushToast(`Updated to v${version}`, "success");
        get().clearUpdate();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update failed";
      set((s) => ({
        update: { ...s.update, status: "error", error: message },
      }));
      get().pushToast("Update failed", "error");
    }
  },
  setUpdateState: (next) => set((s) => ({ update: { ...s.update, ...next } })),
  mockUpdate: (opts) => {
    const version = opts?.version ?? "9.9.9";
    // `notes: undefined` → the sample changelog (exercises #192); `notes: null`
    // explicitly omits notes.
    const notes = opts && "notes" in opts ? opts.notes : SAMPLE_UPDATE_NOTES;
    updater.setMockUpdate({ version, notes: notes ?? null });
    set((s) => ({
      update: {
        ...s.update,
        status: "available",
        version,
        notes: notes ?? null,
        progress: 0,
        confirming: false,
        error: undefined,
      },
    }));
  },
  clearUpdate: () => {
    updater.setMockUpdate(null);
    set((s) => ({
      update: {
        ...s.update,
        status: "idle",
        version: null,
        notes: null,
        progress: 0,
        confirming: false,
        error: undefined,
      },
    }));
  },

  refreshUsage: async () => {
    // Gate to Claude (forward-compatible). Non-Claude → hide, don't even call out.
    if (!isClaudeActive(get())) {
      set({ usage: { usedPercent: null, resetsAtMs: null, available: false } });
      // Still run the auto-continue reducer so it disarms (fail-open) when the
      // usage feed goes unavailable, e.g. a non-Claude session becoming active.
      get().applyAutoContinue();
      return;
    }
    try {
      const snap = await ipc.claudeSessionUsage();
      set({
        usage: snap
          ? {
              usedPercent: snap.usedPercent,
              resetsAtMs: parseResetsAt(snap.resetsAt),
              available: true,
            }
          : { usedPercent: null, resetsAtMs: null, available: false },
      });
    } catch {
      // Outside Tauri / command missing → hide; recover on the next tick.
      set({ usage: { usedPercent: null, resetsAtMs: null, available: false } });
    }
    // Drive the auto-continue machine off the fresh snapshot (#296).
    get().applyAutoContinue();
  },
  startUsagePolling: () => {
    if (!IS_MAIN_WINDOW || usagePollTimer) return; // main-window only, idempotent
    void get().refreshUsage();
    usagePollTimer = setInterval(
      () => void get().refreshUsage(),
      USAGE_POLL_MS,
    );
  },
  stopUsagePolling: () => {
    if (usagePollTimer) {
      clearInterval(usagePollTimer);
      usagePollTimer = undefined;
    }
    // Tear down the tighter armed poll too (#296) so nothing keeps ticking.
    syncArmedPoll(false, () => {});
  },
  applyAutoContinue: () => {
    const state = get();
    // Live Claude sessions = running (not exited, the #91 predicate) and running
    // claude (a legacy null agent predates #101 and is claude). Per-agent opt-out
    // (#297): an agent whose box is unchecked (`autoContinueDisabled`) is excluded
    // here, so it never enters the captured arm-set nor the fire-set — the pure #296
    // reducer stays agnostic while that one agent skips the continue nudge.
    const liveClaudeIds = state.sessions
      .filter(
        (s) =>
          s.exitedCode === undefined &&
          (s.agent ?? "claude") === "claude" &&
          !s.autoContinueDisabled,
      )
      .map((s) => s.id);
    const { next, fireIds } = evaluateAutoContinue(
      state.autoContinue,
      state.usage,
      Date.now(),
      {
        enabled: state.settings.autoContinueAfterLimit,
        defaultAgent: state.settings.defaultAgent,
      },
      liveClaudeIds,
    );
    if (next !== state.autoContinue) set({ autoContinue: next });
    // Match the poll cadence to the (new) armed state, then nudge fired sessions.
    syncArmedPoll(next.armed, () => void get().refreshUsage());
    for (const id of fireIds) void sendContinue(id);
  },
  toggleAutoContinue: () => {
    const settings = get().settings;
    void get().saveSettings({
      ...settings,
      autoContinueAfterLimit: !settings.autoContinueAfterLimit,
    });
  },
  setAutoContinueDisabled: (id, disabled) => {
    const session = get().sessions.find((x) => x.id === id);
    // No-op when the id isn't a tracked session or the flag is unchanged.
    if (!session || (session.autoContinueDisabled ?? false) === disabled)
      return;
    // Optimistic local update so both agent surfaces reflect it immediately; the
    // fire step (`applyAutoContinue`) reads this same flag on the next usage tick.
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === id ? { ...x, autoContinueDisabled: disabled } : x,
      ),
    }));
    void ipc.setSessionAutoContinue(id, disabled).catch(() => {});
  },

  addFolder: async () => {
    // Native folder picker (#172): cancel returns null → no-op.
    const path = await ipc.pickDirectory();
    if (!path) return;
    // Persist to recents (deduped/capped backend-side), then mirror the move-to-top
    // dedupe locally so the folder group appears immediately. No agent, no selection
    // change, no view switch.
    await ipc.addRecent(path).catch(() => {});
    set((s) => ({ recents: [path, ...s.recents.filter((r) => r !== path)] }));
  },

  init: async () => {
    // Subscribe exactly once. The flag is set *before* the await so StrictMode's
    // synchronous double-invoke can't register a second set of listeners (#32).
    if (!eventsSubscribed) {
      eventsSubscribed = true;
      try {
        await ipc.subscribeSessionEvents({
          onOutput: ({ id, b64, offset }) => {
            // Decode the compact base64 payload with a tight byte loop instead of a
            // multi-KB JSON.parse, then feed the bytes straight to the outputBus (off
            // the React re-render path) (#261). `offset` (absolute end-offset) rides
            // along so the terminal can dedupe the scrollback ↔ live overlap.
            emitSessionOutput(id, decodeOutputB64(b64), offset);
            // First live output proves a reconnecting session is alive — clear the
            // flag exactly once. An O(1) Set check keeps this per-chunk hot path off
            // a linear scan over every session (#261); `markConnected` does the one
            // store write (it also drains the Set) (#30).
            if (reconnectingIds.has(id)) {
              reconnectingIds.delete(id);
              get().markConnected(id);
            }
          },
          onState: ({ id, busy }) => {
            // Busy/idle from the backend heuristic (#42); emitted only on change.
            // `setBusy` also schedules a debounced branch-label refresh on the
            // busy→idle edge (#212) so an in-terminal `git checkout` is reflected.
            get().setBusy(id, busy);
          },
          onName: ({ id, name }) => {
            // claude's own auto-title (#97); fills the label for an unnamed agent
            // (a custom name #57 still wins in sessionLabel).
            get().setAutoName(id, name);
          },
          onForkable: ({ id, forkable }) => {
            // Forkability changed (#138) — gates the Fork affordance up front.
            get().setForkable(id, forkable);
          },
          onExited: ({ id, code }) => {
            // Recurring child rotation/crash (#294): a session owned as a recurring's
            // *current* child that exits — killed on rotation, or crashed on its own —
            // must NOT surface a "Process exited" overlay or toast (it's an internal,
            // rotating agent, not a user agent). The rotation-order race (its exit vs
            // the `recurring://fired` swapping `current_session_id`) is also covered by
            // `intentionalKills` in `onFired` below (which handles the case where the
            // record already points at the *new* child by the time this exit lands).
            const owningRec = get().recurrings.find(
              (r) => r.current_session_id === id,
            );
            if (owningRec) {
              intentionalKills.delete(id);
              if (IS_MAIN_WINDOW) {
                // Clear the pointer so the panel shows "next run in…" until the next
                // fire (a genuine crash); a rotation's `onFired` sets the fresh child.
                // Drop the dead child so its pooled xterm reconciles away.
                set((s) => ({
                  recurrings: s.recurrings.map((r) =>
                    r.id === owningRec.id
                      ? { ...r, current_session_id: null }
                      : r,
                  ),
                }));
                get().dropSession(id);
              }
              return;
            }
            // Session lifecycle (forget / toast / kill) is owned by the **main**
            // window (#84) — it's the source of truth for the session list. A
            // detached canvas window is a renderer: it only reflects the exit
            // locally so a terminal it shows gets the "Process exited" overlay,
            // never forgetting/killing/toasting (which the main window does).
            if (!IS_MAIN_WINDOW) {
              if (get().sessions.some((s) => s.id === id)) {
                get().markExited(id, code);
              } else {
                get().markTerminalExited(id, code);
              }
              return;
            }
            // One event per close. An intentional kill (Remove/Forget) already
            // toasts and is never auto-forgotten or double-toasted here (#32).
            const intentional = intentionalKills.delete(id);
            // Terminal item (#72): a shell PTY, not a claude session (not in
            // `sessions`). On an unintentional exit, record it so the pooled
            // <Terminal> shows a Restart overlay; an intentional × already removed
            // the panel, so just swallow it.
            if (!get().sessions.some((s) => s.id === id)) {
              if (!intentional) get().markTerminalExited(id, code);
              return;
            }
            // Clean exit (code 0 while running): the user ended the agent — forget
            // it like Remove so it vanishes everywhere and won't return on next
            // boot, with a brief "Agent exited" toast and no overlay/Restart (#63).
            if (isCleanExit(code, booting, intentional)) {
              void get().forgetExitedSession(id);
              return;
            }
            // Non-zero / crash exit (or a failed boot resume): keep the session
            // and its exit code so the Terminal shows the "Process exited" overlay
            // + Restart (#63/#30). The generic exit toast is suppressed for
            // intentional kills and during the boot window; others toast once.
            get().markExited(id, code);
            if (!booting && !intentional) {
              get().pushToast(
                code != null
                  ? `Session exited (code ${code})`
                  : "Session exited",
              );
            }
          },
        });
        // Cross-window canvas sync (#84): a tab/layout edit in any window, and
        // the detached-window set changing, both flow through the backend.
        await ipc.subscribeCanvasEvents({
          onCanvasesChanged: ({ canvases }) => get().applyCanvasSync(canvases),
          onWindowsChanged: (ids) => get().setDetachedCanvasIds(ids),
        });
        // Scheduled sessions (#93/#280): the backend engine fires schedules into live
        // agents. The **main** window owns the scheduled→live transition; a **detached**
        // canvas window (#84) also listens because it can hold a scheduled panel, so it
        // must follow the same fire (and keep its own `schedules` slice in sync). Both
        // subscribe; the per-window behavior is branched inside each handler. (Tauri
        // events are global on macOS and Windows alike, so this path is identical.)
        await ipc.subscribeScheduleEvents({
          onFired: ({ id, session }) => {
            get().upsertSession(toSessionView(session));
            if (!IS_MAIN_WINDOW) {
              // Detached canvas (#280): reflect the fire locally so the rewritten
              // agent leaf (arriving via `canvas://changed`) finds its session and
              // renders the terminal instead of "Session closed." The main window
              // owns the leaf rewrite, persistence, recents, and toast.
              set((s) => ({
                schedules: s.schedules.filter((x) => x.id !== id),
              }));
              return;
            }
            // The recent to surface is the *parent repo* for a worktree session
            // (its `repo_path` is the app-managed worktree folder), else the
            // session's own folder. This mirrors the backend, which touches
            // `sched.cwd` (the parent repo) — never the worktree dir — so the
            // worktree shows only as a sub-group under its parent, not as a
            // duplicate empty top-level folder (#279). The interactive worktree
            // spawn path likewise never adds the worktree dir to recents.
            const recentPath = session.worktree_parent ?? session.repo_path;
            set((s) => ({
              schedules: s.schedules.filter((x) => x.id !== id),
              recents: [
                recentPath,
                ...s.recents.filter((r) => r !== recentPath),
              ],
            }));
            // Rewrite any Canvas leaf showing this pending schedule into the live
            // agent (#280), in place (same leaf id → the #18 pooled terminal
            // reparents), then persist so the main window — and any detached canvas
            // holding it (via `canvas://changed`) — render the agent rather than the
            // now-removed schedule's "no longer pending" panel.
            const liveContent: CanvasContent = {
              kind: "agent",
              sessionId: session.id,
              repoPath: session.repo_path,
            };
            const { canvases, activeCanvasId } = get();
            const nextCanvases = rewriteScheduledLeaves(
              canvases,
              id,
              liveContent,
            );
            if (nextCanvases !== canvases) {
              set({ canvases: nextCanvases });
              void ipc
                .setCanvases({
                  canvases: nextCanvases,
                  activeId: activeCanvasId,
                })
                .catch(() => {});
            }
            get().pushToast(
              `Scheduled agent started${session.name ? `: ${session.name}` : ""}`,
            );
          },
          onError: ({ id, message }) => {
            set((s) => ({
              schedules: s.schedules.filter((x) => x.id !== id),
            }));
            // Only the main window toasts the failure (it owns the schedule surface).
            if (IS_MAIN_WINDOW) {
              get().pushToast(
                message || "Scheduled agent failed to start",
                "error",
              );
            }
          },
          onChanged: (schedules) => get().applyScheduleSync(schedules),
        });
        // Recurring sessions (#294): the backend poll rotates each recurring's child
        // agent. Both windows subscribe (a detached canvas #84 can hold a recurring
        // panel, so it must follow the rotation + keep its `recurrings` slice fresh).
        await ipc.subscribeRecurringEvents({
          onFired: ({ id, session, next_fire_at }) => {
            // The previous child (if any) is being retired; swap it for the fresh one
            // in a single state update so the survivor is never transiently dropped.
            const prev = get().recurrings.find(
              (r) => r.id === id,
            )?.current_session_id;
            get().upsertSession(toSessionView(session));
            set((s) => ({
              recurrings: s.recurrings.map((r) =>
                r.id === id
                  ? {
                      ...r,
                      current_session_id: session.id,
                      next_fire_at,
                    }
                  : r,
              ),
            }));
            if (prev && prev !== session.id) {
              // Swallow the old child's pending exit event (the kill lands async) so
              // it never shows a "Process exited" overlay/toast, then drop it.
              intentionalKills.add(prev);
              get().dropSession(prev);
            }
            // Surface the (possibly new) folder in recents — main window only, and
            // the *parent repo* for a worktree child (mirrors the backend).
            if (IS_MAIN_WINDOW) {
              const recentPath = session.worktree_parent ?? session.repo_path;
              set((s) => ({
                recents: [
                  recentPath,
                  ...s.recents.filter((r) => r !== recentPath),
                ],
              }));
            }
          },
          onError: ({ message }) => {
            // The record is kept + re-armed backend-side; just toast (main window).
            if (IS_MAIN_WINDOW) {
              get().pushToast(
                message || "Recurring agent failed to start",
                "error",
              );
            }
          },
          onChanged: (recurrings) => get().applyRecurringSync(recurrings),
        });
      } catch {
        // Event subscription only works inside the Tauri webview.
        eventsSubscribed = false;
      }
    }
    await get().refresh();
    // Default view on launch (#103): apply the saved preference once at boot (main
    // window only). `init` runs only on mount, so a mid-session view change is never
    // overridden (unlike `refresh`, which can re-run).
    if (IS_MAIN_WINDOW) {
      get().setView(get().settings.defaultView);
      // First-launch coding-agent picker: detect installed CLIs once and auto-pick /
      // prompt as needed (main window only — a detached canvas has no onboarding).
      void get().maybeOnboardAgent();
    }
    // Learn the current detached-window set — a just-opened window may have missed
    // the `canvas://windows` broadcast that fired before it began listening (#84).
    try {
      get().setDetachedCanvasIds(await ipc.listCanvasWindows());
    } catch {
      // Outside Tauri / no windows; leave the (empty) default.
    }
    // Host OS family (#143), once, for OS-appropriate display labels. On Windows also
    // read the build number so xterm.js can configure its ConPTY handling.
    try {
      set({ platform: await ipc.platform() });
      set({ windowsBuild: await ipc.windowsBuild() });
    } catch {
      // Outside Tauri; leave "" / 0 → the macOS-default labels + no windowsPty.
    }
    // FileTree disk-change poll (#264): runs in *any* window that can show a tree (the
    // main shell or a detached canvas), each refreshing only its own mounted trees, so
    // files created/removed on disk surface within a few seconds. Idempotent.
    get().startFileTreePolling();
  },

  refresh: async () => {
    try {
      const [records, recents] = await Promise.all([
        ipc.listSessions(),
        ipc.listRecents(),
      ]);
      // Persisted sessions are resumed on boot (claude --resume) — show them as
      // "reconnecting" (neutral) until their first output / a real exit, never as
      // a wall of errors (#30). Branch labels refresh from the sidebar.
      booting = records.length > 0;
      const views = records.map((r) => ({
        ...toSessionView(r),
        reconnecting: true,
      }));
      // Mirror the reconnecting flag into the Set the output hot path checks (#261).
      reconnectingIds.clear();
      for (const v of views) reconnectingIds.add(v.id);
      set({
        sessions: views,
        recents,
        // Seed the live "has been active" flag (#112) from the persisted records so
        // a previously-active agent shows the yellow "finished / needs input" dot
        // right after boot (reconnecting → idle), never reverting to gray.
        sessionActive: Object.fromEntries(
          views.filter((v) => v.hasBeenActive).map((v) => [v.id, true]),
        ),
      });
      // End the boot window: stop suppressing exit toasts, and clear any flag
      // still set (e.g. a resumed session whose first output raced the listener —
      // its scrollback still replays the conversation).
      setTimeout(() => {
        booting = false;
        reconnectingIds.clear(); // backstop fired — none are reconnecting now (#261)
        if (get().sessions.some((x) => x.reconnecting)) {
          set((s) => ({
            sessions: s.sessions.map((x) =>
              x.reconnecting ? { ...x, reconnecting: false } : x,
            ),
          }));
        }
      }, RECONNECT_BACKSTOP_MS);
    } catch {
      // Backend unreachable (e.g. running outside Tauri).
    }
    // Repo colors + Overview panel layouts load independently so a failure here
    // doesn't block sessions.
    try {
      const [
        colors,
        panels,
        order,
        files,
        canvas,
        canvasesState,
        rawSettings,
        rawSidebarWidth,
        rawTemplates,
        rawSidebarCollapsed,
        rawRepoOrder,
        rawDiffSeen,
      ] = await Promise.all([
        ipc.listRepoColors(),
        ipc.listOverviewPanels(),
        ipc.listOverviewOrder(),
        ipc.listOpenFiles(),
        ipc.getCanvasLayout(),
        ipc.getCanvases(),
        ipc.getSettings(),
        ipc.getSidebarWidth(),
        ipc.getCanvasTemplates(),
        ipc.getSidebarCollapsed(),
        ipc.getRepoOrder(),
        ipc.getDiffSeen(),
      ]);
      // Settings (#100): merge the persisted blob over the defaults and apply its
      // side-effects (live terminal options) before the first paint.
      const settings = mergeSettings(rawSettings);
      applySettingsEffects(settings);
      // Sidebar width (#108): restore the persisted value re-clamped to the range
      // (or the default when absent).
      const sidebarWidth = clampSidebarWidth(
        rawSidebarWidth ?? SIDEBAR_WIDTH_DEFAULT,
      );
      // Sidebar collapsed-to-rail flag (#168): default expanded when absent.
      const sidebarCollapsed = rawSidebarCollapsed ?? false;
      // Top-level folder order (#211): the saved repo paths (empty until first
      // drag), merged with the live repo set at render via `mergeRepoOrder`.
      const folderOrder = rawRepoOrder ?? [];
      // Diff "seen" markers (#278): the persisted `{ repoPath: { filePath: digest } }`
      // map, or empty until first marked. Loaded in every window (a diff panel lives in
      // the main window and a detached canvas alike).
      const diffSeen = (rawDiffSeen as DiffSeenMap | null) ?? {};
      // Multi-canvas (#58): use the persisted tabs; else migrate the old single
      // canvas_layout into "Canvas 1"; else start with one empty canvas. Persist
      // the migrated shape once so the new field becomes the source of truth.
      let canvases: CanvasTab[];
      let activeCanvasId: string;
      if (canvasesState && canvasesState.canvases.length > 0) {
        canvases = canvasesState.canvases;
        activeCanvasId = canvases.some((c) => c.id === canvasesState.activeId)
          ? canvasesState.activeId
          : (canvases[0]?.id ?? "");
      } else {
        const first: CanvasTab = {
          id: crypto.randomUUID(),
          name: "Canvas 1",
          layout: canvas ?? null,
        };
        canvases = [first];
        activeCanvasId = first.id;
        // Only the main window migrates/persists the canvas shape (#84); a
        // detached renderer never writes it.
        if (IS_MAIN_WINDOW) {
          void ipc
            .setCanvases({ canvases, activeId: activeCanvasId })
            .catch(() => {});
        }
      }
      // A detached window (#84) always shows its own canvas, regardless of the
      // persisted active tab (which tracks the main window).
      if (!IS_MAIN_WINDOW && DETACHED_CANVAS_ID) {
        activeCanvasId = DETACHED_CANVAS_ID;
      }
      // #110: the legacy per-repo `open_files` map (#45) is **no longer** folded
      // into `overviewPanels`. The #59 fold ran on every boot, and because nothing
      // ever cleared `open_files`, a closed/forgotten file viewer was **resurrected**
      // each launch (the file lingered in `open_files`, was seen absent from the
      // persisted panels, and was re-created as a fresh markdown panel). Every real
      // install long since migrated and persisted its panels, so we drop the fold
      // entirely — `overviewPanels` loads from the persisted layout only — and
      // permanently **empty** the stale `open_files` map (main window only; the Rust
      // setter drops each now-empty key) so it can never resurrect an item again.
      if (IS_MAIN_WINDOW) {
        for (const repo of Object.keys(files)) {
          void ipc.setOpenFiles(repo, []).catch(() => {});
        }
      }
      set({
        repoColors: colors,
        overviewPanels: panels,
        overviewOrder: order,
        canvases,
        activeCanvasId,
        settings,
        sidebarWidth,
        sidebarCollapsed,
        folderOrder,
        diffSeen,
        // Saved Canvas templates (#117); absent (null) → none saved yet.
        canvasTemplates: rawTemplates ?? [],
      });
      // Terminal items can't resume (#72): respawn a fresh shell for each
      // persisted terminal panel under its repo so the item is usable after a
      // restart (previous output/history is gone, by design). Main window only —
      // a detached window (#84) must not re-spawn shells the main window owns.
      if (IS_MAIN_WINDOW) {
        for (const [repo, list] of Object.entries(panels)) {
          for (const p of list) {
            if (p.kind === "terminal") {
              void ipc.spawnTerminal(repo, p.id).catch(() => {});
            }
          }
        }
      }
    } catch {
      // Backend unreachable; leave colors/panels/order/canvas/width as-is.
    }
    // Scheduled sessions (#93) — re-armed timers live in the backend, so the frontend
    // just lists the pending ones. Loaded in **every** window (#280), not only the
    // main one: a detached canvas (#84) can hold a scheduled panel, which needs the
    // schedule's data to render (else it falsely shows "no longer pending"). Live
    // mutations + the fire then sync via `schedule://changed` / `schedule://fired`.
    try {
      set({ schedules: await ipc.listSchedules() });
    } catch {
      // Backend unreachable; leave schedules as-is.
    }
    // Recurring sessions (#294) — the backend re-arms them; the frontend just lists
    // them. Loaded in every window like schedules (a detached canvas #84 can hold a
    // recurring panel). Live mutations + rotations sync via `recurring://*`.
    try {
      set({ recurrings: await ipc.listRecurrings() });
    } catch {
      // Backend unreachable; leave recurrings as-is.
    }
    // In-app updater (#190) — main window only. (1) Post-update toast: if the
    // running version is higher than the one recorded last boot, the app just
    // self-updated → toast it, then record the running version. (2) Best-effort
    // update check (inert today — placeholder pubkey + no signed release).
    if (IS_MAIN_WINDOW) {
      try {
        const running = await ipc.appVersion();
        const last = await ipc.getLastVersion();
        if (last && versionIncreased(last, running)) {
          get().pushToast(`Updated to v${running}`, "success");
        }
        if (last !== running) {
          void ipc.setLastVersion(running).catch(() => {});
        }
      } catch {
        // Outside Tauri / command missing — skip the version compare.
      }
      void get().checkForUpdate();
      // 5-hour usage bar (#154): kick off the 180s poll, kept alive at module scope
      // so it recovers (the bar unmounts when usage is unavailable). Gated to Claude
      // inside refreshUsage; re-guards IS_MAIN_WINDOW so a detached window never polls.
      get().startUsagePolling();
    }
  },

  refreshBranches: async () => {
    const repos = repoOrder(get().recents, get().sessions);
    if (repos.length === 0) return;
    try {
      // One IPC round-trip for all repos instead of one per repo.
      set({ branches: await ipc.currentBranches(repos) });
    } catch {
      // Backend unreachable; leave branches as-is.
    }
  },

  refreshFileStatuses: async (repo) => {
    // Scope: one repo for the FileTree's own mount/Refresh (cheap, immediate), or the
    // whole sidebar repo set (mirroring `refreshBranches`) for the load / busy→idle /
    // git-write paths so any open tree reflects an agent's edits without a restart.
    const repos = repo ? [repo] : repoOrder(get().recents, get().sessions);
    if (repos.length === 0) return;
    // One `git status --porcelain` per repo, in parallel; a failed repo is left as-is.
    const results = await Promise.allSettled(
      repos.map((r) => ipc.fileStatuses(r)),
    );
    set((s) => {
      let changed = false;
      const next = { ...s.fileStatuses };
      results.forEach((res, i) => {
        if (res.status !== "fulfilled") return; // fail-open: keep the prior map
        const r = repos[i] as string;
        const map: Record<string, FileStatusCode> = {};
        for (const entry of res.value) map[entry.path] = entry.status;
        // Skip the write when nothing changed so the FileTree selector stays stable
        // (no needless re-render on a busy→idle settle that didn't touch files).
        if (!statusMapsEqual(s.fileStatuses[r], map)) {
          next[r] = map;
          changed = true;
        }
      });
      return changed ? { fileStatuses: next } : {};
    });
  },

  bumpFileTreeRefresh: (repo) => {
    // One repo (a drop-move on it, #253), or every repo with an open tree (the
    // disk-change poll / busy→idle edge, #264). Bumping the counter makes each mounted
    // FileTree re-list its loaded levels in place — no reset, so expansion is preserved.
    const repos = repo ? [repo] : Object.keys(get().fileTreeMounts);
    if (repos.length === 0) return;
    set((s) => {
      const next = { ...s.fileTreeRefresh };
      for (const r of repos) next[r] = (next[r] ?? 0) + 1;
      return { fileTreeRefresh: next };
    });
  },

  registerFileTree: (repo) => {
    set((s) => ({
      fileTreeMounts: {
        ...s.fileTreeMounts,
        [repo]: (s.fileTreeMounts[repo] ?? 0) + 1,
      },
    }));
  },

  unregisterFileTree: (repo) => {
    set((s) => {
      const cur = s.fileTreeMounts[repo] ?? 0;
      if (cur <= 1) return { fileTreeMounts: omitKey(s.fileTreeMounts, repo) };
      return { fileTreeMounts: { ...s.fileTreeMounts, [repo]: cur - 1 } };
    });
  },

  refreshOpenFileTrees: () => {
    // Backstop for disk changes outside an agent's busy→idle edge (#264). No-op while
    // the window is hidden (so a backgrounded window does no work) or no tree is open.
    if (typeof document !== "undefined" && document.hidden) return;
    const repos = Object.keys(get().fileTreeMounts);
    if (repos.length === 0) return;
    // Re-list loaded levels (new/removed files appear) + re-tint git statuses. Scoped
    // to open trees so the cost stays bounded even with many sidebar repos.
    get().bumpFileTreeRefresh();
    for (const r of repos) void get().refreshFileStatuses(r);
  },

  startFileTreePolling: () => {
    // Per-window (main or detached canvas) — each window has its own mounted-tree set
    // and module-scoped timer. Idempotent; no-op outside a browser env.
    if (fileTreePollTimer || typeof window === "undefined") return;
    fileTreePollTimer = setInterval(() => {
      // Pause the work while hidden (the timer keeps ticking but does nothing) and when
      // no tree is open, so an idle/backgrounded window incurs no IPC or re-render.
      if (document.hidden) return;
      if (Object.keys(get().fileTreeMounts).length === 0) return;
      scheduleOpenFileTreeRefresh();
    }, FILE_TREE_POLL_MS);
    // Refresh immediately on regaining focus / becoming visible (catches changes made
    // while backgrounded), sharing the debounce so focus + the poll don't double-fire.
    fileTreeFocusListener = () => scheduleOpenFileTreeRefresh();
    window.addEventListener("focus", fileTreeFocusListener);
    fileTreeVisibilityListener = () => {
      if (!document.hidden) scheduleOpenFileTreeRefresh();
    };
    document.addEventListener("visibilitychange", fileTreeVisibilityListener);
  },

  stopFileTreePolling: () => {
    if (fileTreePollTimer) {
      clearInterval(fileTreePollTimer);
      fileTreePollTimer = undefined;
    }
    if (fileTreeFocusListener) {
      window.removeEventListener("focus", fileTreeFocusListener);
      fileTreeFocusListener = undefined;
    }
    if (fileTreeVisibilityListener) {
      document.removeEventListener(
        "visibilitychange",
        fileTreeVisibilityListener,
      );
      fileTreeVisibilityListener = undefined;
    }
    if (fileTreeRefreshDebounce) {
      clearTimeout(fileTreeRefreshDebounce);
      fileTreeRefreshDebounce = undefined;
    }
  },

  setFileDropTarget: (target) => {
    set((s) => {
      const cur = s.fileDropTarget;
      // No-op when unchanged (both null, or same repo+dir) — "over" fires rapidly
      // during a drag, so this keeps the FileTree from re-rendering on every tick.
      if (cur === target) return {};
      if (cur && target && cur.repo === target.repo && cur.dir === target.dir) {
        return {};
      }
      return { fileDropTarget: target };
    });
  },

  moveFilesIntoRepo: async (repo, destSubdir, sources) => {
    if (sources.length === 0) return;
    // Move each dragged item; fail-open per source so one bad file doesn't abort the
    // rest (e.g. a collision on one while others succeed).
    const results = await Promise.allSettled(
      sources.map((src) => ipc.moveIntoRepo(repo, destSubdir, src)),
    );
    const moved = results.filter((r) => r.status === "fulfilled").length;
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) =>
        isSessionError(r.reason) ? r.reason.message : "move failed",
      );
    if (moved > 0) {
      // Bump the per-repo refresh signal so the FileTree reloads its visible levels
      // (the moved-in item appears), and re-read git statuses (new files → green).
      get().bumpFileTreeRefresh(repo);
      void get().refreshFileStatuses(repo);
    }
    get().pushToast(
      moveResultMessage(moved, destSubdir, errors),
      moved === 0 ? "error" : undefined,
    );
  },

  // Bump the per-repo FileTree refresh signal + re-read git statuses so any open tree
  // reloads its visible levels in place after a folder create / delete (mirrors the
  // `moveFilesIntoRepo` pattern — expansion state is preserved, no full reset).
  createFolder: async (repo, path) => {
    try {
      await ipc.createDir(repo, path);
    } catch (err) {
      get().pushToast(
        isSessionError(err) ? err.message : "Could not create folder",
        "error",
      );
      return;
    }
    set((s) => ({
      fileTreeRefresh: {
        ...s.fileTreeRefresh,
        [repo]: (s.fileTreeRefresh[repo] ?? 0) + 1,
      },
    }));
    void get().refreshFileStatuses(repo);
    get().pushToast("Folder created", "success");
  },

  deleteTreePath: async (repo, path) => {
    try {
      await ipc.deletePath(repo, path);
    } catch (err) {
      get().pushToast(
        isSessionError(err) ? err.message : "Could not delete",
        "error",
      );
      return;
    }
    set((s) => ({
      fileTreeRefresh: {
        ...s.fileTreeRefresh,
        [repo]: (s.fileTreeRefresh[repo] ?? 0) + 1,
      },
    }));
    void get().refreshFileStatuses(repo);
    get().pushToast("Deleted", "success");
  },

  renameTreePath: async (repo, from, to) => {
    try {
      await ipc.renamePath(repo, from, to);
    } catch (err) {
      get().pushToast(
        isSessionError(err) ? err.message : "Could not rename",
        "error",
      );
      return;
    }
    set((s) => ({
      fileTreeRefresh: {
        ...s.fileTreeRefresh,
        [repo]: (s.fileTreeRefresh[repo] ?? 0) + 1,
      },
    }));
    void get().refreshFileStatuses(repo);
    get().pushToast("Renamed", "success");
  },

  setRepoColor: async (path, color) => {
    // Optimistic: the color is purely visual, so update immediately and persist
    // in the background (#35).
    set((s) => ({ repoColors: { ...s.repoColors, [path]: color } }));
    try {
      await ipc.setRepoColor(path, color);
    } catch {
      // Persist failed (e.g. outside Tauri); the local color stays for the session.
    }
  },

  saveSettings: async (settings) => {
    // Apply optimistically + run side-effects (live terminals, #100), then persist.
    set({ settings });
    applySettingsEffects(settings);
    try {
      await ipc.setSettings(settings);
    } catch {
      // Persist failed (e.g. outside Tauri); the change stays for the session.
    }
  },

  maybeOnboardAgent: async () => {
    if (get().settings.onboarded) return;
    // Presence-check each selectable CLI via `agent_info` (version === null ⇒ missing).
    // Best-effort: a failed probe (e.g. outside Tauri) counts as not installed.
    const infos = await Promise.all(
      SELECTABLE_AGENTS.map((a) =>
        ipc.agentInfo(a.id).catch((): AgentInfo | null => null),
      ),
    );
    const installed = infos.filter(
      (i): i is AgentInfo => !!i && i.version != null,
    );
    if (installed.length === 0) {
      // None installed yet — leave `onboarded` false so we re-check next launch and
      // auto-pick once the user installs one. The ClaudeMissing screen guides them.
      return;
    }
    const only = installed.length === 1 ? installed[0] : null;
    if (only) {
      await get().saveSettings({
        ...get().settings,
        defaultAgent: only.id,
        onboarded: true,
      });
      if (agentCaps(only.id).id !== "claude") {
        get().pushToast(
          `Using ${only.display_name} — it's untested; Claude Code is the recommended agent.`,
          "info",
        );
      }
      return;
    }
    // 2+ installed: let the user choose. `onboarded` is set only once they pick.
    set({ onboardingOpen: true, onboardingChoices: installed });
  },

  chooseOnboardingAgent: async (id) => {
    set({ onboardingOpen: false });
    await get().saveSettings({
      ...get().settings,
      defaultAgent: id,
      onboarded: true,
    });
  },

  dismissOnboarding: () => {
    set({ onboardingOpen: false });
    // Keep the current default but don't re-prompt.
    void get().saveSettings({ ...get().settings, onboarded: true });
  },

  // Extra Overview panels (#38) — the single per-repo item source (#59): each is
  // also a sidebar row. Dedups so callers don't have to (one diff per repo; one
  // markdown panel per file); updates optimistically and persists the list.
  addOverviewPanel: async (repoPath, kind, file) => {
    const current = get().overviewPanels[repoPath] ?? [];
    // Terminals are never deduped — multiple independent shells per repo (#72);
    // one diff per repo; one file tree per repo (#167); one markdown panel per file.
    const existing =
      kind === "diff" || kind === "filetree"
        ? current.find((p) => p.kind === kind)
        : kind === "markdown" || kind === "kanban"
          ? current.find((p) => p.kind === kind && p.file === file)
          : undefined;
    if (existing) {
      // Already open (#59 dedup) — a gentle nudge instead of a second "Opened…"
      // (#83), so re-clicking the menu item still gives feedback. Returns the
      // existing panel's id (#175) so a caller can jump to/select it.
      get().pushToast("Already open");
      return existing.id;
    }
    const panel: OverviewPanel = {
      id: crypto.randomUUID(),
      kind,
      ...(file ? { file } : {}),
    };
    // A terminal item is backed by a real shell PTY (#72): spawn it first under
    // the panel's id so the pooled <Terminal> has something to render; if the
    // shell is missing, surface it and don't add a dead panel.
    if (kind === "terminal") {
      try {
        await ipc.spawnTerminal(repoPath, panel.id);
      } catch (err) {
        get().pushToast(
          isSessionError(err) ? err.message : "Could not open terminal",
          "error",
        );
        return null;
      }
    }
    const next = [...current, panel];
    set((s) => ({
      overviewPanels: { ...s.overviewPanels, [repoPath]: next },
    }));
    // Low-key confirmation that the view was added (#83) — it doesn't switch the
    // main view (#79/#82), so the toast is the feedback that it happened.
    get().pushToast(`Opened ${panelLabel(kind, file)}`);
    try {
      await ipc.setOverviewPanels(repoPath, next);
    } catch {
      // Persist failed (e.g. outside Tauri); keep the local layout for the session.
    }
    // Place the new panel **next to the agent it belongs with** (#285). A
    // worktree-scoped panel is keyed by the worktree folder but clusters under the
    // parent repo (#164), so by default it renders in the panel block — separated
    // from its worktree agent by every other agent in the cluster. Instead, if an
    // agent is running in this exact folder (`repoPath`), splice the new panel
    // immediately after it in the parent cluster's Overview order. Every creation
    // path funnels through here, so this is the single source of truth; a repo with
    // no agent in `repoPath` keeps the append-at-end behavior. Done after the
    // `set`/persist above so `overviewClusters` sees the just-added panel id.
    await repositionPanelAfterAgent(get, repoPath, panel.id);
    return panel.id;
  },

  createKanbanBoard: async (repoPath, name) => {
    // Normalize to a repo-relative `<name>.md` (the user types a bare name).
    const trimmed = name.trim();
    if (!trimmed) return;
    const file = trimmed.toLowerCase().endsWith(".md")
      ? trimmed
      : `${trimmed}.md`;
    try {
      // Write the default To Do/Doing/Done board, then open it as a kanban panel
      // (#143). A pre-existing file would be overwritten — addOverviewPanel dedups
      // by file, so re-creating the same name just re-opens it.
      await ipc.writeTextFile(repoPath, file, serializeBoard(defaultBoard()));
    } catch (err) {
      get().pushToast(
        isSessionError(err) ? err.message : "Could not create board",
        "error",
      );
      return;
    }
    await get().addOverviewPanel(repoPath, "kanban", file);
  },

  removeOverviewPanel: async (repoPath, id) => {
    const panels = get().overviewPanels[repoPath] ?? [];
    const removed = panels.find((p) => p.id === id);
    const next = panels.filter((p) => p.id !== id);
    set((s) => {
      const map = { ...s.overviewPanels };
      if (next.length) map[repoPath] = next;
      else delete map[repoPath];
      return {
        overviewPanels: map,
        terminalExits: omitKey(s.terminalExits, id),
      };
    });
    // Low-key close confirmation (#83). Only direct user closes call this (the ×
    // on a sidebar row / Overview column) — bulk forgetRepo (#31) doesn't, so
    // there's no per-panel spam during a forget.
    if (removed) {
      get().pushToast(`Closed ${panelLabel(removed.kind, removed.file)}`);
      // The left panel is the source of truth (#152): removing an item here also
      // removes it from every Canvas tab showing it (Overview already mirrors
      // overviewPanels). Reuse the #79 matcher — mapping the panel's `markdown`
      // kind to the sidebar item's `file` kind.
      const item: SidebarItem = {
        id: removed.id,
        kind: removed.kind === "markdown" ? "file" : removed.kind,
        repoPath,
        file: removed.file,
      };
      pruneCanvasLeaves((c) => matchesCanvasItem(c, item));
    }
    // A terminal item owns a shell PTY (#72): kill it on close. Mark the kill
    // intentional so its exit doesn't pop the Restart overlay.
    if (removed?.kind === "terminal") {
      intentionalKills.add(id);
      await ipc.killSession(id).catch(() => {});
    }
    try {
      await ipc.setOverviewPanels(repoPath, next);
    } catch {
      // ignore
    }
    // Worktree auto-delete guard (#199): if this panel's folder is a worktree, remove
    // the worktree once this was the last item referencing it (any agent / panel /
    // schedule keeps it; dirty kept). No-op for a regular repo folder.
    const wtParent = worktreeParentOf(get(), repoPath);
    if (wtParent) void get().cleanupWorktreeIfEmpty(wtParent, repoPath);
  },

  setDiffCompare: (repoPath, config) => {
    const panels = get().overviewPanels[repoPath] ?? [];
    const diffPanel = panels.find((p) => p.kind === "diff");
    // No diff panel for this repo (e.g. a Canvas-only diff): nothing to persist.
    if (!diffPanel) return;
    // Skip when unchanged — the DiffInspector re-runs this on every mount.
    if (
      diffPanel.diff_source === config.diff_source &&
      (diffPanel.compare_base ?? undefined) === config.compare_base &&
      (diffPanel.compare_target ?? undefined) === config.compare_target &&
      (diffPanel.commit_sha ?? undefined) === config.commit_sha
    ) {
      return;
    }
    const next = panels.map((p) =>
      p.kind === "diff" ? { ...p, ...config } : p,
    );
    set((s) => ({
      overviewPanels: { ...s.overviewPanels, [repoPath]: next },
    }));
    void ipc.setOverviewPanels(repoPath, next).catch(() => {});
  },

  // Switch a file panel to another file in place (#90), mirroring setDiffCompare.
  // No dedup — switching to a file already open elsewhere is allowed (#90).
  setOverviewPanelFile: (repoPath, panelId, file) => {
    const panels = get().overviewPanels[repoPath] ?? [];
    const next = panels.map((p) => (p.id === panelId ? { ...p, file } : p));
    set((s) => ({
      overviewPanels: { ...s.overviewPanels, [repoPath]: next },
    }));
    void ipc.setOverviewPanels(repoPath, next).catch(() => {});
  },

  // Open an out-of-repo absolute file in an Overview file panel (#163). The panel is
  // keyed by repo (overviewPanels[repo]), so an out-of-repo file means MOVING the
  // panel to the file's parent dir; it then groups under a repo named for that dir
  // (#36/#96 — a documented consequence). Same-repo → just switch the file in place.
  moveOverviewPanelToFile: (repoPath, panelId, newRepo, file) => {
    if (newRepo === repoPath) {
      get().setOverviewPanelFile(repoPath, panelId, file);
      return;
    }
    const all = get().overviewPanels;
    const panel = (all[repoPath] ?? []).find((p) => p.id === panelId);
    if (!panel) return;
    const oldList = (all[repoPath] ?? []).filter((p) => p.id !== panelId);
    const newList = all[newRepo] ?? [];
    // Dedup by repo+file: if the target repo already shows this file, drop the moved
    // panel (the order-merge then surfaces the existing one) rather than duplicate.
    const dup = newList.some((p) => p.kind === panel.kind && p.file === file);
    const nextNew = dup ? newList : [...newList, { ...panel, file }];
    set((s) => ({
      overviewPanels: {
        ...s.overviewPanels,
        [repoPath]: oldList,
        [newRepo]: nextNew,
      },
    }));
    void ipc.setOverviewPanels(repoPath, oldList).catch(() => {});
    void ipc.setOverviewPanels(newRepo, nextNew).catch(() => {});
  },

  markTerminalExited: (id, code) =>
    set((s) => ({ terminalExits: { ...s.terminalExits, [id]: code } })),

  restartTerminal: async (id, repoPath) => {
    try {
      await ipc.spawnTerminal(repoPath, id);
      set((s) => ({ terminalExits: omitKey(s.terminalExits, id) }));
      return true;
    } catch (err) {
      get().pushToast(
        isSessionError(err) ? err.message : "Could not restart terminal",
        "error",
      );
      return false;
    }
  },

  reorderOverview: async (repoPath, orderedKeys) => {
    set((s) => ({
      overviewOrder: { ...s.overviewOrder, [repoPath]: orderedKeys },
    }));
    try {
      await ipc.setOverviewOrder(repoPath, orderedKeys);
    } catch {
      // Persist failed (e.g. outside Tauri); keep the local order for the session.
    }
  },

  // Canvas tabs (#58): the component computes each next layout tree via the pure
  // canvasTree helpers; these actions commit it to the active tab and persist the
  // whole tab set. Persist failures (e.g. outside Tauri) are swallowed — the
  // local state still drives the session.
  setActiveCanvasLayout: (tree) => {
    const { canvases, activeCanvasId } = get();
    const next = canvases.map((c) =>
      c.id === activeCanvasId ? { ...c, layout: tree } : c,
    );
    set({ canvases: next });
    void ipc
      .setCanvases({ canvases: next, activeId: activeCanvasId })
      .catch(() => {});
  },

  // Distribute the active tab's panels evenly (#186): equalize the whole layout
  // (no splitId, the tab-strip button) or just one split's subtree (the border
  // double-click). Persist + broadcast via setActiveCanvasLayout; CanvasSurface's
  // reconcile effect then pushes the new sizes into the live Groups imperatively,
  // so the relayout is remount-free (a busy agent keeps its terminal scrollback).
  // No-op when there's no active layout or it's already even (same reference).
  equalizeCanvas: (splitId) => {
    const { canvases, activeCanvasId } = get();
    const layout =
      canvases.find((c) => c.id === activeCanvasId)?.layout ?? null;
    if (!layout) return;
    const next = splitId ? equalizeSplit(layout, splitId) : equalize(layout);
    if (next === layout) return;
    get().setActiveCanvasLayout(next);
  },

  // Switch a Canvas file panel to another file in place (#90): update the active
  // tab's leaf content and persist via setActiveCanvasLayout (the canvases blob).
  setLeafFile: (leafId, file) => {
    const { canvases, activeCanvasId } = get();
    const layout =
      canvases.find((c) => c.id === activeCanvasId)?.layout ?? null;
    if (!layout) return;
    get().setActiveCanvasLayout(updateLeafContent(layout, leafId, { file }));
  },

  // Open an out-of-repo absolute file in a Canvas file panel (#163): set both the
  // leaf's repoPath (the file's parent dir) and file (basename), so the FileViewer
  // reads/writes it confined to that directory.
  setLeafFileAbsolute: (leafId, repoPath, file) => {
    const { canvases, activeCanvasId } = get();
    const layout =
      canvases.find((c) => c.id === activeCanvasId)?.layout ?? null;
    if (!layout) return;
    get().setActiveCanvasLayout(
      updateLeafContent(layout, leafId, { repoPath, file }),
    );
  },

  // Lift an existing panel out of the active tab at drag start (#155, supersedes
  // #135's atomic-on-drop move). The lift is purely transient view state — the
  // persisted `canvases` blob is NOT mutated — so the Canvas renders a derived
  // layout without this leaf (the panels reflow, exposing drop targets) while a
  // cancel restores it exactly and an interrupted drag can never strand a panel.
  beginCanvasLift: (leafId) => {
    const { activeCanvasId } = get();
    set({ liftedLeaf: { canvasId: activeCanvasId, leafId } });
  },

  // Commit a lifted panel onto its drop target (#155). The persisted layout still
  // contains the lifted leaf (the lift never mutated it), so `moveLeaf` does the
  // whole job for an edge drop: prune the source + re-split the target **reusing
  // the source's original id + content**, so its #18 pooled terminal reparents
  // rather than being disposed/recreated. A center drop only occurs when the lifted
  // panel was the sole one (the derived layout was null → the empty-canvas center
  // showed); it's already the whole tree, so committing it is just clearing the
  // lift (an exact restore). Persists via setActiveCanvasLayout (a detached
  // window's write merges, #84).
  commitCanvasLift: (targetId, edge) => {
    const { liftedLeaf, canvases, activeCanvasId } = get();
    if (!liftedLeaf) return;
    const layout =
      canvases.find((c) => c.id === activeCanvasId)?.layout ?? null;
    if (!layout) {
      set({ liftedLeaf: null });
      return;
    }
    if (targetId === "canvas-center") {
      // Sole panel re-placed onto the empty center — already the whole tree.
      set({ liftedLeaf: null });
      return;
    }
    const moved = moveLeaf(
      layout,
      liftedLeaf.leafId,
      targetId,
      edge,
      crypto.randomUUID(),
    );
    set({ liftedLeaf: null });
    get().setActiveCanvasLayout(moved);
  },

  // Cancel a lift (#155): Esc / drop on nothing. No layout write — since the
  // persisted layout was never mutated, clearing the transient lift restores the
  // panel to its exact previous position.
  cancelCanvasLift: () => {
    if (get().liftedLeaf) set({ liftedLeaf: null });
  },

  // Big mode (#157): a single per-window overlay item. Transient — never persisted.
  // The BigModeModal auto-closes it if the underlying item disappears.
  maximizeItem: (content) => set({ maximizedItem: content }),
  closeMaximized: () => {
    if (get().maximizedItem) set({ maximizedItem: null });
  },
  // ⌘E / Ctrl+E (#284): same chord opens/closes. Open → close (regardless of what's
  // selected); closed → maximize the selected item, or no-op if nothing resolves.
  toggleMaximizeSelected: () => {
    const s = get();
    if (s.maximizedItem) {
      s.closeMaximized();
      return;
    }
    const content = contentForSelected(s);
    if (content) s.maximizeItem(content);
  },

  // Canvas templates (#117): the editor builds a draft layout of inert blocks with
  // the same pure canvasTree helpers; these actions persist the saved-template set
  // (its own `canvas_templates` blob). Persist failures are swallowed.
  openTemplateEditor: (id) =>
    set({
      templateEditorOpen: true,
      templateEditorId: id,
      // A real/blank-template open never inherits a stale canvas seed (#187).
      templateEditorSeed: null,
      templateEditorSeedName: null,
      templateManagerOpen: false,
    }),
  // Seed the editor from the active canvas's live layout (#187): map each panel to
  // its template block (resolving an agent's custom name from `sessions`), preserve
  // structure + sizes. Toast + no-op when nothing is templatable; otherwise open the
  // editor as a brand-new template (id: null) carrying the seed for its draft.
  openTemplateEditorFromCanvas: () => {
    const { canvases, activeCanvasId, sessions } = get();
    const canvas = canvases.find((c) => c.id === activeCanvasId);
    const seed = canvasToTemplate(
      canvas?.layout ?? null,
      (id) => sessions.find((s) => s.id === id)?.name || undefined,
    );
    if (!seed) {
      get().pushToast("This canvas has nothing to save as a template");
      return;
    }
    set({
      templateEditorOpen: true,
      templateEditorId: null,
      templateEditorSeed: seed,
      templateEditorSeedName: canvas?.name ?? "",
      templateManagerOpen: false,
    });
  },
  closeTemplateEditor: () =>
    set({
      templateEditorOpen: false,
      templateEditorId: null,
      templateEditorSeed: null,
      templateEditorSeedName: null,
    }),
  openTemplateManager: () => set({ templateManagerOpen: true }),
  closeTemplateManager: () => set({ templateManagerOpen: false }),

  saveTemplate: (name, layout, id) => {
    const trimmed = name.trim() || "Untitled template";
    const { canvasTemplates } = get();
    const isUpdate = !!id && canvasTemplates.some((t) => t.id === id);
    let savedId: string;
    let next: CanvasTemplate[];
    if (isUpdate) {
      savedId = id as string;
      next = canvasTemplates.map((t) =>
        t.id === savedId ? { ...t, name: trimmed, layout } : t,
      );
    } else {
      savedId = crypto.randomUUID();
      next = [...canvasTemplates, { id: savedId, name: trimmed, layout }];
    }
    set({ canvasTemplates: next });
    void ipc.setCanvasTemplates(next).catch(() => {});
    get().pushToast(isUpdate ? "Template saved" : "Template created");
    return savedId;
  },

  renameTemplate: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return; // blank keeps the current name
    const { canvasTemplates } = get();
    const target = canvasTemplates.find((t) => t.id === id);
    if (!target || target.name === trimmed) return;
    const next = canvasTemplates.map((t) =>
      t.id === id ? { ...t, name: trimmed } : t,
    );
    set({ canvasTemplates: next });
    void ipc.setCanvasTemplates(next).catch(() => {});
    get().pushToast("Template renamed");
  },

  duplicateTemplate: (id) => {
    const { canvasTemplates } = get();
    const target = canvasTemplates.find((t) => t.id === id);
    if (!target) return;
    // Deep-clone the layout so the copy and original never share a tree object.
    const copy: CanvasTemplate = {
      id: crypto.randomUUID(),
      name: `${target.name} copy`,
      layout: target.layout
        ? (JSON.parse(JSON.stringify(target.layout)) as CanvasNode)
        : null,
    };
    const next = [...canvasTemplates, copy];
    set({ canvasTemplates: next });
    void ipc.setCanvasTemplates(next).catch(() => {});
    get().pushToast("Template duplicated");
  },

  deleteTemplate: (id) => {
    const { canvasTemplates } = get();
    if (!canvasTemplates.some((t) => t.id === id)) return;
    const next = canvasTemplates.filter((t) => t.id !== id);
    set({ canvasTemplates: next });
    void ipc.setCanvasTemplates(next).catch(() => {});
    get().pushToast("Template deleted");
  },

  // Export / import a template as JSON (#275): the data model is already plain JSON,
  // so export = write a (pretty, id-stripped) blob to a user-chosen file and import =
  // read + validate + add with a fresh id. Native dialogs are the user's consent and
  // `read_text_file`/`write_text_file` (the #163 pattern) confine each to the chosen
  // file's own directory — no new backend command, platform-neutral.
  exportTemplate: async (id) => {
    const template = get().canvasTemplates.find((t) => t.id === id);
    if (!template) return;
    try {
      const path = await ipc.saveFileDialog(`${template.name}.json`);
      if (!path) return; // cancelled
      const { dir, base } = splitPath(path);
      await ipc.writeTextFile(dir, base, serializeTemplate(template));
      get().pushToast(`Exported "${template.name}"`, "success");
    } catch {
      get().pushToast("Export failed", "error");
    }
  },

  importTemplate: async () => {
    try {
      const path = await ipc.pickFile({
        title: "Import template",
        extensions: ["json"],
      });
      if (!path) return; // cancelled
      const { dir, base } = splitPath(path);
      const text = await ipc.readTextFile(dir, base);
      const parsed = parseTemplateJson(text);
      if (!parsed) {
        get().pushToast("Not a valid template file", "error");
        return;
      }
      // Add directly (mint a fresh id) so a single "Imported …" toast fires rather
      // than saveTemplate's "Template created". A duplicate name is fine — the
      // manager lists by id.
      const imported = {
        id: crypto.randomUUID(),
        name: parsed.name,
        layout: parsed.layout,
      };
      const next = [...get().canvasTemplates, imported];
      set({ canvasTemplates: next });
      void ipc.setCanvasTemplates(next).catch(() => {});
      get().pushToast(`Imported "${imported.name}"`, "success");
    } catch {
      get().pushToast("Import failed", "error");
    }
  },

  // Canvas-template instantiation (#118): open a new tab from a template against one
  // chosen folder, then resolve each block (best-effort, independent) into live
  // content — agents/terminals spawn, files/diffs open, failures show inline Retry.
  openTemplateUse: () => set({ templateUseOpen: true }),
  closeTemplateUse: () => set({ templateUseOpen: false }),

  useTemplate: (templateId, cwd) => {
    const template = get().canvasTemplates.find((t) => t.id === templateId);
    if (!template) return;
    const tab = instantiateTemplate(template, cwd, () => crypto.randomUUID());
    // When the only canvas is empty (a fresh app's default "Canvas 1", no panels),
    // the template replaces it in place rather than leaving an empty tab dangling
    // beside the new one (#142). With 2+ canvases, or a single canvas that has
    // panels, append as before and remove nothing.
    const canvases = get().canvases;
    const soleEmpty =
      canvases.length === 1 &&
      collectLeaves(canvases[0]?.layout ?? null).length === 0;
    const next = soleEmpty ? [tab] : [...canvases, tab];
    // Open the new tab as the active Canvas (switch to Canvas if needed).
    set({
      canvases: next,
      activeCanvasId: tab.id,
      view: "canvas",
      templateUseOpen: false,
    });
    set((s) => ({ recents: [cwd, ...s.recents.filter((r) => r !== cwd)] }));
    void ipc.setCanvases({ canvases: next, activeId: tab.id }).catch(() => {});
    get().pushToast(`Opened template "${template.name}"`);
    // Kick off async resolution of every pending leaf (independent + best-effort).
    for (const leaf of collectLeaves(tab.layout)) {
      if (leaf.content.kind === "pending") {
        void get().resolveTemplateBlock(tab.id, leaf.id);
      }
    }
  },

  resolveTemplateBlock: async (canvasId, leafId) => {
    // Update just this canvas's layout leaf + persist (the tab may not be active if
    // the user switched away during async resolution).
    const applyLeaf = (mut: (tree: CanvasNode) => CanvasNode) => {
      const { canvases, activeCanvasId } = get();
      const next = canvases.map((c) =>
        c.id === canvasId && c.layout ? { ...c, layout: mut(c.layout) } : c,
      );
      set({ canvases: next });
      void ipc
        .setCanvases({ canvases: next, activeId: activeCanvasId })
        .catch(() => {});
    };

    const canvas = get().canvases.find((c) => c.id === canvasId);
    const leaf = canvas?.layout
      ? collectLeaves(canvas.layout).find((l) => l.id === leafId)
      : undefined;
    const block = leaf?.content.block;
    const cwd = leaf?.content.repoPath ?? "";
    if (!block) return;

    // Loading: clear any prior error.
    applyLeaf((tree) => updateLeafContent(tree, leafId, { error: undefined }));

    try {
      const liveKind = blockDescriptor(block.kind)?.liveKind;
      let live;
      if (liveKind === "agent") {
        // Apply the block's optional custom name (#136); empty/whitespace → undefined
        // so the agent auto-names from claude's ai-title (#97), as before.
        const record = await ipc.spawnSession(
          cwd,
          block.name?.trim() || undefined,
          block.prompt,
          get().settings.defaultAgent,
        );
        get().upsertSession(toSessionView(record));
        live = resolvedContent(block, cwd, { sessionId: record.id });
      } else if (liveKind === "terminal") {
        const termId = crypto.randomUUID();
        await ipc.spawnTerminal(cwd, termId);
        // If the panel (or its whole tab) was closed while the shell spawned, kill
        // the now-orphaned PTY rather than leaking it — a canvas terminal is tracked
        // only by its leaf, so once that's gone nothing else would dispose it.
        const layout = get().canvases.find((c) => c.id === canvasId)?.layout;
        const leafGone =
          !layout || !collectLeaves(layout).some((l) => l.id === leafId);
        if (leafGone) {
          void ipc.killSession(termId).catch(() => {});
          return;
        }
        // Register in the source of truth (#152) under the SAME id as the PTY /
        // leaf sessionId, so the sidebar row + Overview column line up with the
        // Canvas panel (and the App reconcile keeps exactly one PTY).
        registerOverviewPanel(cwd, { id: termId, kind: "terminal" });
        live = resolvedContent(block, cwd, { sessionId: termId });
      } else if (liveKind === "file") {
        // Resolve relative-vs-absolute (#224): absolute opens via its own parent dir.
        const target = fileBlockTarget(block, cwd);
        const exists = await ipc.fileExists(target.repoPath, target.file);
        if (!exists) {
          throw new Error(`File not found: ${block.file ?? "(no path)"}`);
        }
        live = resolvedContent(block, cwd, {});
        // Show the opened file in the left panel + Overview (#152); dedups by
        // repo+file so re-opening doesn't add a duplicate row.
        if (target.file) {
          registerOverviewPanel(target.repoPath, {
            id: crypto.randomUUID(),
            kind: "markdown",
            file: target.file,
          });
        }
      } else if (liveKind === "kanban") {
        // Read-only + gated like `file` (#154): no auto-create of a missing board.
        const target = fileBlockTarget(block, cwd);
        const exists = await ipc.fileExists(target.repoPath, target.file);
        if (!exists) {
          throw new Error(`File not found: ${block.file ?? "(no path)"}`);
        }
        live = resolvedContent(block, cwd, {});
        // Show the opened board in the left panel + Overview (#152); dedups by
        // repo+file so re-opening doesn't add a duplicate row.
        if (target.file) {
          registerOverviewPanel(target.repoPath, {
            id: crypto.randomUUID(),
            kind: "kanban",
            file: target.file,
          });
        }
      } else if (liveKind === "diff") {
        const isRepo = await ipc.isGitRepo(cwd);
        if (!isRepo) throw new Error("Not a git repository");
        live = resolvedContent(block, cwd, {});
        // Show the opened diff in the left panel + Overview (#152; one per repo).
        registerOverviewPanel(cwd, { id: crypto.randomUUID(), kind: "diff" });
      } else if (liveKind === "filetree") {
        // Stateless repo data (#167) — resolves immediately, no spawn/file/git gate.
        live = resolvedContent(block, cwd, {});
        // Show the file tree in the left panel + Overview (#152; one per repo).
        registerOverviewPanel(cwd, {
          id: crypto.randomUUID(),
          kind: "filetree",
        });
      } else {
        throw new Error(`Unknown block: ${block.kind}`);
      }
      applyLeaf((tree) => setLeafContent(tree, leafId, live));
    } catch (err) {
      // `claude` missing surfaces the global banner too (reuse #30's signal).
      if (isSessionError(err) && err.kind === "BinaryNotFound") {
        get().setClaudeMissing(true);
      }
      const message =
        err instanceof Error
          ? err.message
          : isSessionError(err)
            ? err.message
            : "Couldn't start this panel";
      applyLeaf((tree) => updateLeafContent(tree, leafId, { error: message }));
    }
  },

  pickTemplateBlockFile: (canvasId, leafId, file) => {
    // Replace the pending file block's path, then retry resolving it. Preserve the
    // existing block kind (#154) — picking a file for an `open-kanban` block must
    // keep it kanban (it resolves back into a KanbanPanel), not silently degrade to
    // an `open-file` viewer. Default to `open-file` when the kind can't be read.
    const { canvases, activeCanvasId } = get();
    const layout = canvases.find((c) => c.id === canvasId)?.layout;
    const kind =
      (layout
        ? collectLeaves(layout).find((l) => l.id === leafId)?.content.block
            ?.kind
        : undefined) ?? "open-file";
    const next = canvases.map((c) =>
      c.id === canvasId && c.layout
        ? {
            ...c,
            layout: updateLeafContent(c.layout, leafId, {
              block: { kind, file },
            }),
          }
        : c,
    );
    set({ canvases: next });
    void ipc
      .setCanvases({ canvases: next, activeId: activeCanvasId })
      .catch(() => {});
    void get().resolveTemplateBlock(canvasId, leafId);
  },

  addCanvas: () => {
    const { canvases } = get();
    // Incremental default name: the lowest "Canvas N" not already taken.
    const used = new Set(canvases.map((c) => c.name));
    let n = canvases.length + 1;
    while (used.has(`Canvas ${n}`)) n += 1;
    const created: CanvasTab = {
      id: crypto.randomUUID(),
      name: `Canvas ${n}`,
      layout: null,
    };
    const next = [...canvases, created];
    set({ canvases: next, activeCanvasId: created.id });
    void ipc
      .setCanvases({ canvases: next, activeId: created.id })
      .catch(() => {});
    get().pushToast("Canvas created");
  },

  closeCanvas: (id) => {
    const { canvases, activeCanvasId } = get();
    let next = canvases.filter((c) => c.id !== id);
    // Always keep at least one canvas (#58).
    if (next.length === 0) {
      next = [{ id: crypto.randomUUID(), name: "Canvas 1", layout: null }];
    }
    // If the active tab was closed, select the neighbor at the same index.
    let active = activeCanvasId;
    if (id === activeCanvasId) {
      const idx = canvases.findIndex((c) => c.id === id);
      active = next[Math.min(idx, next.length - 1)]?.id ?? next[0]?.id ?? "";
    }
    set({ canvases: next, activeCanvasId: active });
    void ipc.setCanvases({ canvases: next, activeId: active }).catch(() => {});
    // If this canvas had a detached window (#84), close it too (it would also
    // self-close on the canvas-sync, but do it directly for immediacy).
    if (get().detachedCanvasIds.includes(id)) {
      void ipc.closeCanvasWindow(id).catch(() => {});
    }
    get().pushToast("Canvas closed");
  },

  // Tab × entry point (#137). An empty tab closes silently in every mode; a tab with
  // contents follows the `canvasCloseBehavior` setting: kill / keep skip the modal,
  // ask opens it. Self-contained — does not read #103's `confirmDestructive`.
  requestCloseCanvas: (id) => {
    const { canvases, settings } = get();
    const canvas = canvases.find((c) => c.id === id);
    const hasContents = !!canvas && collectLeaves(canvas.layout).length > 0;
    if (!hasContents) {
      get().closeCanvas(id);
      return;
    }
    if (settings.canvasCloseBehavior === "kill") {
      void get().confirmCloseCanvas(id, true);
    } else if (settings.canvasCloseBehavior === "keep") {
      void get().confirmCloseCanvas(id, false);
    } else {
      set({ canvasClosePromptId: id });
    }
  },

  confirmCloseCanvas: async (id, kill) => {
    set({ canvasClosePromptId: null });
    const canvas = get().canvases.find((c) => c.id === id);
    // Tear down the tab's contents first (kill path) so reconcileTerminals sees both
    // the dropped sessions and the closed tab in one pass; then drop the tab.
    if (kill && canvas?.layout) await closeCanvasContents(canvas.layout);
    get().closeCanvas(id);
  },

  cancelCloseCanvas: () => set({ canvasClosePromptId: null }),

  renameCanvas: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return; // blank keeps the current name (#58)
    const { canvases, activeCanvasId } = get();
    const target = canvases.find((c) => c.id === id);
    // No-op rename (same name / missing tab): skip the write + toast (#83) so an
    // unchanged inline edit doesn't fire "Canvas renamed".
    if (!target || target.name === trimmed) return;
    const next = canvases.map((c) =>
      c.id === id ? { ...c, name: trimmed } : c,
    );
    set({ canvases: next });
    void ipc
      .setCanvases({ canvases: next, activeId: activeCanvasId })
      .catch(() => {});
    get().pushToast("Canvas renamed");
  },

  reorderCanvases: (orderedIds) => {
    const { canvases, activeCanvasId } = get();
    const byId = new Map(canvases.map((c) => [c.id, c]));
    const next = orderedIds
      .map((cid) => byId.get(cid))
      .filter((c): c is CanvasTab => c !== undefined);
    // Defensive: keep any tab missing from the order (no silent drops).
    for (const c of canvases) if (!orderedIds.includes(c.id)) next.push(c);
    set({ canvases: next });
    void ipc
      .setCanvases({ canvases: next, activeId: activeCanvasId })
      .catch(() => {});
  },

  selectCanvas: (id) => {
    const { canvases, activeCanvasId } = get();
    if (id === activeCanvasId || !canvases.some((c) => c.id === id)) return;
    // Clear the focused panel (#76) — the new tab has its own panels.
    set({ activeCanvasId: id, activeLeafId: null });
    void ipc.setCanvases({ canvases, activeId: id }).catch(() => {});
  },

  // Multi-window (#84): open/focus a canvas in its own native window. The backend
  // creates the `canvas-<id>` window (or focuses it if present) and broadcasts the
  // new detached set, which lands back here via `setDetachedCanvasIds`.
  popOutCanvas: (id) => {
    const canvas = get().canvases.find((c) => c.id === id);
    if (!canvas) return;
    void ipc.openCanvasWindow(id, canvas.name).catch(() => {});
    get().pushToast("Canvas opened in window");
  },

  focusCanvasWindow: (id) => {
    void ipc.focusCanvasWindow(id).catch(() => {});
  },

  // Apply a canvas-list update broadcast from another window (#84). Keep our own
  // active tab (the main window owns it; a detached window is pinned to its
  // canvas); only re-home it if it vanished. A detached window whose canvas was
  // closed elsewhere closes itself.
  applyCanvasSync: (canvases) => {
    if (JSON.stringify(get().canvases) === JSON.stringify(canvases)) return;
    set((s) => {
      const active = canvases.some((c) => c.id === s.activeCanvasId)
        ? s.activeCanvasId
        : (canvases[0]?.id ?? s.activeCanvasId);
      return { canvases, activeCanvasId: active };
    });
    if (
      !IS_MAIN_WINDOW &&
      DETACHED_CANVAS_ID &&
      !canvases.some((c) => c.id === DETACHED_CANVAS_ID)
    ) {
      void ipc.closeCanvasWindow(DETACHED_CANVAS_ID).catch(() => {});
    }
  },

  setDetachedCanvasIds: (ids) => {
    set({ detachedCanvasIds: ids });
    // The main window never renders a detached canvas as its active tab (its PTYs
    // belong to the other window): if our active tab just detached, switch to a
    // still-docked one (#84).
    if (IS_MAIN_WINDOW) {
      const s = get();
      if (ids.includes(s.activeCanvasId)) {
        const docked = s.canvases.find((c) => !ids.includes(c.id));
        if (docked) set({ activeCanvasId: docked.id, activeLeafId: null });
      }
    }
  },

  setActiveLeaf: (id) => {
    if (id === null) {
      set({ activeLeafId: null });
      return;
    }
    const s = get();
    const layout =
      s.canvases.find((c) => c.id === s.activeCanvasId)?.layout ?? null;
    const leaf = collectLeaves(layout).find((l) => l.id === id);
    // Keep the sidebar selection in sync with the focused panel (#79).
    set({
      activeLeafId: id,
      selectedId: leaf
        ? leafItemId(leaf.content, s.overviewPanels)
        : s.selectedId,
    });
  },

  moveCanvasFocus: (dir) => {
    const s = get();
    const layout =
      s.canvases.find((c) => c.id === s.activeCanvasId)?.layout ?? null;
    const leaves = collectLeaves(layout);
    if (leaves.length === 0) return;
    // No focused panel yet → focus the first; else move to the spatial neighbor.
    const hasCurrent = leaves.some((l) => l.id === s.activeLeafId);
    const targetId = hasCurrent
      ? spatialNeighbor(layout, s.activeLeafId as string, dir)
      : (leaves[0]?.id ?? null);
    if (!targetId) return;
    // Keep the sidebar selection in sync with the focused panel (#79).
    const leaf = leaves.find((l) => l.id === targetId);
    set({
      activeLeafId: targetId,
      selectedId: leaf
        ? leafItemId(leaf.content, s.overviewPanels)
        : s.selectedId,
    });
  },

  selectItem: (item) => {
    const s = get();
    if (s.view !== "canvas") {
      // Overview (or any non-canvas): select; Overview scrolls its column in.
      set({ selectedId: item.id });
      return;
    }
    // Canvas (#79/#207): jump to the item's panel if it's in the active tab;
    // else switch to Overview and select it. Tabs are never switched here —
    // cross-tab "bring into a canvas" stays with openSessionInCanvas (#153).
    const layout =
      s.canvases.find((c) => c.id === s.activeCanvasId)?.layout ?? null;
    const match = collectLeaves(layout).find((l) =>
      matchesCanvasItem(l.content, item),
    );
    if (match) {
      set({ selectedId: item.id, activeLeafId: match.id });
    } else {
      // Not in the active canvas tab (#207): instead of a dead-end toast +
      // deselect, go to Overview and select the item — Overview renders a column
      // for every sidebar item (#174), so the user lands on what they clicked.
      set({ view: "overview", selectedId: item.id });
    }
  },

  cloneRepo: async (url, parent) => {
    // The backend clones into `<parent>/<repo-name>`, ensures `main`, registers the
    // folder in recents, and returns the absolute dest path. A clone failure (bad URL /
    // auth / network / existing dest) returns the git error string for inline display —
    // no session started, no recent added (the backend only touches recents on success).
    let dest: string;
    try {
      dest = await ipc.cloneRepo(url, parent);
    } catch (err) {
      return isSessionError(err) ? err.message : "Could not clone repository";
    }
    // Show the group instantly (the backend already persisted the recent); the spawn
    // below re-prepends it too, which is a harmless no-op dedupe.
    set((s) => ({ recents: [dest, ...s.recents.filter((r) => r !== dest)] }));
    // Start a normal interactive agent on the already-checked-out `main`. `spawnSession`
    // selects it and refreshes branches + file statuses so the sidebar group shows its
    // `main` label + file-status colors. A spawn failure toasts on its own; the clone
    // still succeeded (the folder stays), so the modal closes either way.
    await get().spawnSession(dest);
    get().pushToast(`Cloned ${repoName(dest)}`);
    return true;
  },

  spawnSession: async (cwd, name, branch) => {
    try {
      // Optional branch checkout (#27) before spawning the agent. A failed
      // checkout (e.g. dirty tree) aborts without spawning so nothing starts on
      // the wrong branch.
      if (branch) await ipc.checkoutBranch(cwd, branch);
      // New sessions launch under the Settings-chosen coding agent (#142); existing
      // sessions keep their recorded agent (#101).
      const record = await ipc.spawnSession(
        cwd,
        name,
        undefined,
        get().settings.defaultAgent,
      );
      get().upsertSession(toSessionView(record));
      set((s) => ({ recents: [cwd, ...s.recents.filter((r) => r !== cwd)] }));
      get().select(record.id);
      get().pushToast(`Started ${record.name ?? cwd}`);
      // A checkout (or a brand-new repo) can change the branch label — refresh.
      void get().refreshBranches();
      // A checkout / branch-create can change which files differ from HEAD — refresh
      // the FileTree coloring too (#252).
      void get().refreshFileStatuses();
      return true;
    } catch (err) {
      if (isSessionError(err) && err.kind === "BinaryNotFound") {
        get().setClaudeMissing(true);
      }
      get().pushToast(
        isSessionError(err) ? err.message : "Failed to start session",
        "error",
      );
      return false;
    }
  },

  spawnWorktreeSession: async (repo, branch) => {
    try {
      // Isolated worktree agent (#74): no checkout, no custom name. The backend
      // creates-or-reuses the app-managed worktree and spawns claude there; the
      // record carries worktree_parent = repo for the sidebar nesting.
      const record = await ipc.spawnWorktreeAgent(
        repo,
        branch,
        get().settings.defaultAgent,
      );
      get().upsertSession(toSessionView(record));
      get().select(record.id);
      get().pushToast(`Started isolated worktree on ${branch}`);
      void get().refreshBranches();
      // A checkout / branch-create can change which files differ from HEAD — refresh
      // the FileTree coloring too (#252).
      void get().refreshFileStatuses();
      return true;
    } catch (err) {
      if (isSessionError(err) && err.kind === "BinaryNotFound") {
        get().setClaudeMissing(true);
      }
      get().pushToast(
        isSessionError(err) ? err.message : "Could not start worktree agent",
        "error",
      );
      return false;
    }
  },

  createBranchSession: async (cwd, name, base) => {
    // Branch-name validation errors (invalid / already-existing / unknown base) are
    // returned for inline display; the spawn itself reuses the normal flow.
    try {
      await ipc.createBranch(cwd, name, base);
    } catch (err) {
      return isSessionError(err) ? err.message : "Could not create branch";
    }
    try {
      // The branch is created + checked out, so HEAD is already correct — spawn
      // with no further checkout, under the chosen agent (#142).
      const record = await ipc.spawnSession(
        cwd,
        undefined,
        undefined,
        get().settings.defaultAgent,
      );
      get().upsertSession(toSessionView(record));
      set((s) => ({ recents: [cwd, ...s.recents.filter((r) => r !== cwd)] }));
      get().select(record.id);
      get().pushToast(`Created ${name} & started`);
      void get().refreshBranches();
      // A checkout / branch-create can change which files differ from HEAD — refresh
      // the FileTree coloring too (#252).
      void get().refreshFileStatuses();
      return true;
    } catch (err) {
      if (isSessionError(err) && err.kind === "BinaryNotFound") {
        get().setClaudeMissing(true);
      }
      return isSessionError(err) ? err.message : "Failed to start session";
    }
  },

  createBranchWorktreeSession: async (repo, name, base) => {
    try {
      const record = await ipc.spawnWorktreeAgentNewBranch(
        repo,
        name,
        base,
        get().settings.defaultAgent,
      );
      get().upsertSession(toSessionView(record));
      get().select(record.id);
      get().pushToast(`Created ${name} worktree & started`);
      void get().refreshBranches();
      // A checkout / branch-create can change which files differ from HEAD — refresh
      // the FileTree coloring too (#252).
      void get().refreshFileStatuses();
      return true;
    } catch (err) {
      if (isSessionError(err) && err.kind === "BinaryNotFound") {
        get().setClaudeMissing(true);
      }
      return isSessionError(err) ? err.message : "Could not create worktree";
    }
  },

  cleanupWorktreeIfEmpty: async (parent, dest) => {
    // Record the parent so a later panel/schedule close can resolve it once this
    // worktree's last agent is gone (#199).
    worktreeParents.set(dest, parent);
    // Ref-counted (#74/#199): keep the worktree while ANY item — an agent (incl. an
    // exited-but-shown one), a panel, or a scheduled session — still references it.
    if (worktreeHasItems(get(), dest)) return;
    try {
      // Non-forced: git refuses a dirty worktree, which is our dirty guard.
      await ipc.removeWorktree(parent, dest, false);
      worktreeParents.delete(dest);
    } catch {
      // Keep a dirty worktree rather than force-deleting uncommitted work (#74).
      get().pushToast("Worktree kept — it has uncommitted changes", "error");
    }
  },

  restartSession: async (id) => {
    try {
      await ipc.resumeSession(id);
      get().markRunning(id);
      get().pushToast("Session restarted");
      // Caller resets the pooled terminal on success so the relaunched PTY
      // repaints into a clean xterm instead of the dead session's screen (#63).
      return true;
    } catch (err) {
      if (isSessionError(err) && err.kind === "BinaryNotFound") {
        get().setClaudeMissing(true);
      }
      get().pushToast(
        isSessionError(err) ? err.message : "Could not restart session",
        "error",
      );
      return false;
    }
  },

  forkSession: async (sourceId) => {
    try {
      const record = await ipc.forkSession(sourceId);
      const view = toSessionView(record);
      get().upsertSession(view);
      get().select(record.id);
      // Surface it where the user is (#126): in Canvas, add the fork as an agent panel
      // to the active tab (empty canvas → first panel; else append) so they can type
      // immediately. In Overview the selected card already shows in the repo cluster.
      if (get().view === "canvas") {
        const content: CanvasContent = {
          kind: "agent",
          sessionId: record.id,
          repoPath: record.repo_path,
        };
        const { canvases, activeCanvasId } = get();
        const layout =
          canvases.find((c) => c.id === activeCanvasId)?.layout ?? null;
        get().setActiveCanvasLayout(
          layout
            ? appendLeaf(
                layout,
                content,
                crypto.randomUUID(),
                crypto.randomUUID(),
              )
            : { type: "leaf", id: crypto.randomUUID(), content },
        );
      }
      get().pushToast("Forked conversation");
      return true;
    } catch (err) {
      if (isSessionError(err) && err.kind === "BinaryNotFound") {
        get().setClaudeMissing(true);
      }
      get().pushToast(
        isSessionError(err) ? err.message : "Could not fork conversation",
        "error",
      );
      return false;
    }
  },

  openSessionInCanvas: (sessionId) => {
    const { canvases, sessions, detachedCanvasIds } = get();
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    // Already shown in some tab? Reuse it — a single PTY's xterm renders in one
    // slot at a time (#18/#84), so a second panel would fight over the terminal.
    for (const c of canvases) {
      const leaf = collectLeaves(c.layout).find(
        (l) => l.content.kind === "agent" && l.content.sessionId === sessionId,
      );
      if (!leaf) continue;
      if (detachedCanvasIds.includes(c.id)) {
        // Its tab is a detached window (#84): raise that window (it can't render
        // in the main view) and highlight the row, but don't switch the main view.
        get().focusCanvasWindow(c.id);
        set({ selectedId: sessionId });
      } else {
        // A main-window tab: switch to Canvas, make it active, focus the panel.
        set({
          view: "canvas",
          activeCanvasId: c.id,
          activeLeafId: leaf.id,
          selectedId: sessionId,
        });
        void ipc.setCanvases({ canvases, activeId: c.id }).catch(() => {});
      }
      return;
    }
    // Not in any canvas: create a new "Canvas N" tab (mirroring addCanvas's naming)
    // holding just this agent, then switch + focus it.
    const content: CanvasContent = {
      kind: "agent",
      sessionId,
      repoPath: session.repoPath,
    };
    const leafId = crypto.randomUUID();
    const used = new Set(canvases.map((c) => c.name));
    let n = canvases.length + 1;
    while (used.has(`Canvas ${n}`)) n += 1;
    const created: CanvasTab = {
      id: crypto.randomUUID(),
      name: `Canvas ${n}`,
      layout: { type: "leaf", id: leafId, content },
    };
    const next = [...canvases, created];
    set({
      canvases: next,
      activeCanvasId: created.id,
      activeLeafId: leafId,
      view: "canvas",
      selectedId: sessionId,
    });
    void ipc
      .setCanvases({ canvases: next, activeId: created.id })
      .catch(() => {});
  },

  openFileFromTree: async (repoPath, file, kind) => {
    // "Present" is judged relative to the current view (#175): a detached canvas
    // window is always Canvas; in the main window the mounted view decides which
    // tree the user clicked.
    const inCanvas = !IS_MAIN_WINDOW || get().view === "canvas";
    const content: CanvasContent =
      kind === "kanban"
        ? { kind: "kanban", repoPath, file }
        : { kind: "file", repoPath, file };

    if (!inCanvas) {
      // Overview: add the column (or get the existing one on a dedup hit) and
      // select it — selecting an existing column scrolls it into view, so a click
      // jumps to it instead of dead-ending or double-opening.
      const id = await get().addOverviewPanel(repoPath, kind, file);
      if (id) set({ selectedId: id });
      return;
    }

    // Canvas: register the file in overviewPanels (the #152 source of truth) so it
    // also shows in the sidebar + Overview and removal cascades — toast-less here
    // (the Canvas open isn't an Overview "Opened…" action). Reuse an existing
    // panel id when present so re-opening doesn't add a second sidebar row.
    let panelId = (get().overviewPanels[repoPath] ?? []).find(
      (p) => p.kind === kind && p.file === file,
    )?.id;
    if (!panelId) {
      panelId = crypto.randomUUID();
      registerOverviewPanel(repoPath, { id: panelId, kind, file });
    }

    // Already a leaf in some tab? Focus it (a single item renders in one slot at a
    // time, #18/#84) — switching to its tab, or raising its detached window.
    const { canvases, detachedCanvasIds, activeCanvasId } = get();
    const item: SidebarItem = {
      id: "",
      kind: kind === "kanban" ? "kanban" : "file",
      repoPath,
      file,
    };
    for (const c of canvases) {
      const leaf = collectLeaves(c.layout).find((l) =>
        matchesCanvasItem(l.content, item),
      );
      if (!leaf) continue;
      if (detachedCanvasIds.includes(c.id)) {
        get().focusCanvasWindow(c.id);
        set({ selectedId: panelId });
      } else {
        set({
          view: "canvas",
          activeCanvasId: c.id,
          activeLeafId: leaf.id,
          selectedId: panelId,
        });
        void ipc.setCanvases({ canvases, activeId: c.id }).catch(() => {});
      }
      return;
    }

    // Not present in the canvas: append it to the active tab (mirror forkSession's
    // append). setActiveCanvasLayout persists + broadcasts (#84) and targets the
    // detached canvas in a detached window.
    const layout =
      canvases.find((c) => c.id === activeCanvasId)?.layout ?? null;
    const leafId = crypto.randomUUID();
    get().setActiveCanvasLayout(
      layout
        ? appendLeaf(layout, content, leafId, crypto.randomUUID())
        : { type: "leaf", id: leafId, content },
    );
    set({ activeLeafId: leafId, selectedId: panelId });
  },

  forgetExitedSession: async (id) => {
    // Vanish from Focus/Overview/sidebar immediately; the session-list change
    // disposes the now-orphaned pooled xterm via reconcileTerminals (App.tsx).
    get().dropSession(id);
    get().pushToast("Agent exited");
    // Forget the persisted record so a cleanly-exited agent doesn't return on
    // next boot. kill_session also clears the (already-dead) PTY from the
    // manager; it's a no-op if the process is already gone (#63).
    await ipc.killSession(id).catch(() => {
      // Forget locally regardless of whether the backend call succeeded.
    });
  },

  removeSession: async (id) => {
    // Intentional kill — the backend `Exited` toast is suppressed (#32); the
    // "Session removed" toast below is the single notification.
    const session = get().sessions.find((s) => s.id === id);
    intentionalKills.add(id);
    try {
      await ipc.killSession(id);
    } catch {
      // Forget locally regardless of whether the process was still live.
    }
    get().dropSession(id);
    get().pushToast("Session removed");
    // Worktree cleanup (#74): if this was a worktree agent, remove its worktree
    // once it was the last active agent there (ref-counted; dirty = kept+warned).
    if (session?.worktreeParent) {
      void get().cleanupWorktreeIfEmpty(
        session.worktreeParent,
        session.repoPath,
      );
    }
  },

  renameSession: async (id, name) => {
    const trimmed = name.trim();
    const next = trimmed ? trimmed : null;
    // Optimistic: every name surface (sidebar / Overview / Canvas / Focus) reads
    // session.name, so they all reflect the change immediately (#57).
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, name: next } : x)),
    }));
    await ipc.renameSession(id, trimmed).catch(() => {});
  },

  forgetRepo: async (repoPath) => {
    // Include this repo's worktree agents (#74) — their repo_path is the worktree
    // folder, not the repo — so forgetting the repo also kills them and removes
    // their worktree folders (forgetRepo is explicitly destructive → force).
    const repoSessions = get().sessions.filter(
      (s) => s.repoPath === repoPath || s.worktreeParent === repoPath,
    );
    const ids = repoSessions.map((s) => s.id);
    const worktreeDests = [
      ...new Set(
        repoSessions
          .filter((s) => s.worktreeParent === repoPath)
          .map((s) => s.repoPath),
      ),
    ];
    // Pending scheduled sessions for this folder (#93/#94, keyed by `cwd`) — cancel
    // them so a forgotten folder can't later auto-spawn an agent into it (#106).
    const scheduleIds = get()
      .schedules.filter((sc) => sc.cwd === repoPath)
      .map((sc) => sc.id);
    // Recurring sessions for this folder (#294) — cancel them for the same reason: a
    // forgotten folder must not keep spawning repeating agents.
    const recurringIds = get()
      .recurrings.filter(
        (r) => r.cwd === repoPath || worktreeDests.includes(r.cwd),
      )
      .map((r) => r.id);
    // Kill + forget every session's process (kill_session also drops its record),
    // then drop the folder from persisted recents so it can't reappear on restart.
    // Mark them intentional so their exit events don't each pop a toast (#32).
    ids.forEach((id) => intentionalKills.add(id));
    await Promise.all(ids.map((id) => ipc.killSession(id).catch(() => {})));
    await ipc.removeRecent(repoPath).catch(() => {});
    await Promise.all(
      worktreeDests.map((dest) =>
        ipc.removeWorktree(repoPath, dest, true).catch(() => {}),
      ),
    );
    // Forget folder is a complete teardown (#106): also remove the folder's
    // non-agent items (files / diffs / terminals + their PTYs) via the shared #91
    // helper, and cancel its pending schedules (backend; dropped from state below).
    const itemCount = await closeRepoItems(repoPath);
    await Promise.all(
      scheduleIds.map((id) => ipc.cancelSchedule(id).catch(() => {})),
    );
    await Promise.all(
      recurringIds.map((id) => ipc.cancelRecurring(id).catch(() => {})),
    );
    set((s) => {
      const clearSelection = s.selectedId != null && ids.includes(s.selectedId);
      return {
        sessions: s.sessions.filter(
          (x) => x.repoPath !== repoPath && x.worktreeParent !== repoPath,
        ),
        recents: s.recents.filter((r) => r !== repoPath),
        schedules: s.schedules.filter((sc) => sc.cwd !== repoPath),
        recurrings: s.recurrings.filter(
          (r) => r.cwd !== repoPath && !worktreeDests.includes(r.cwd),
        ),
        selectedId: clearSelection ? null : s.selectedId,
        view: clearSelection ? "overview" : s.view,
        // Drop a now-dangling Overview filter on the forgotten repo (#34/#247).
        overviewRepoFilter:
          s.overviewRepoFilter?.path === repoPath ? null : s.overviewRepoFilter,
      };
    });
    // One summary toast (#83) listing everything removed, omitting zero parts.
    const parts: string[] = [];
    if (ids.length > 0)
      parts.push(`${ids.length} agent${ids.length === 1 ? "" : "s"}`);
    if (itemCount > 0)
      parts.push(`${itemCount} view${itemCount === 1 ? "" : "s"}`);
    if (scheduleIds.length > 0) parts.push(`${scheduleIds.length} scheduled`);
    if (recurringIds.length > 0) parts.push(`${recurringIds.length} recurring`);
    get().pushToast(
      parts.length > 0
        ? `Forgot folder + ${parts.join(" + ")}`
        : "Forgot folder",
    );
  },

  killAllAgents: async (repoPath) => {
    const killed = await killAgentsInRepo(repoPath);
    if (killed > 0) {
      get().pushToast(`Killed ${killed} agent${killed === 1 ? "" : "s"}`);
    }
  },

  closeAllItems: async (repoPath) => {
    // Kill the agents (shared mechanics; no toast), then clear the non-agent items
    // via the shared #106 helper. Unlike Forget folder, this keeps the folder in
    // recents — that's the only difference between the two.
    const killed = await killAgentsInRepo(repoPath);
    const panelCount = await closeRepoItems(repoPath);
    // One summary toast (#83) — no per-item spam.
    const parts: string[] = [];
    if (killed > 0) parts.push(`${killed} agent${killed === 1 ? "" : "s"}`);
    if (panelCount > 0)
      parts.push(`${panelCount} view${panelCount === 1 ? "" : "s"}`);
    get().pushToast(
      parts.length > 0 ? `Closed ${parts.join(" + ")}` : "Nothing to close",
    );
  },

  killAllAgentsGlobal: async () => {
    // Every folder that could host an agent — recents ∪ each session's parent repo
    // (a worktree agent maps to its #74 parent) ∪ every overviewPanels key.
    const s = get();
    const folders = [
      ...new Set([
        ...s.recents,
        ...s.sessions.map((x) => x.worktreeParent ?? x.repoPath),
        ...Object.keys(s.overviewPanels),
      ]),
    ];
    // Reuse the module-level helper (not the per-repo action) so there's no
    // per-folder toast spam. killAgentsInRepo(parent) sweeps a folder's worktree
    // agents via worktreeParent, so iterating the parent set kills each agent
    // exactly once with correct #74 ref-counted worktree cleanup.
    let killed = 0;
    for (const f of folders) killed += await killAgentsInRepo(f);
    if (killed > 0) {
      get().pushToast(`Killed ${killed} agent${killed === 1 ? "" : "s"}`);
    }
  },

  closeAllItemsGlobal: async () => {
    // Same folder set as killAllAgentsGlobal — kill every agent AND drop every
    // non-agent item app-wide, keeping folders in recents (mirrors per-repo #91).
    const s = get();
    const folders = [
      ...new Set([
        ...s.recents,
        ...s.sessions.map((x) => x.worktreeParent ?? x.repoPath),
        ...Object.keys(s.overviewPanels),
      ]),
    ];
    let killed = 0;
    let views = 0;
    for (const f of folders) {
      killed += await killAgentsInRepo(f);
      views += await closeRepoItems(f);
    }
    // One summary toast (#83) — no per-folder spam; mirrors closeAllItems wording.
    const parts: string[] = [];
    if (killed > 0) parts.push(`${killed} agent${killed === 1 ? "" : "s"}`);
    if (views > 0) parts.push(`${views} view${views === 1 ? "" : "s"}`);
    get().pushToast(
      parts.length > 0 ? `Closed ${parts.join(" + ")}` : "Nothing to close",
    );
  },

  scheduleSession: async (
    cwd,
    branch,
    name,
    prompt,
    at,
    createBranch = false,
    base = null,
    worktree = false,
  ) => {
    try {
      const record = await ipc.createSchedule(
        cwd,
        branch,
        name,
        prompt,
        at,
        createBranch,
        base,
        worktree,
        // The schedule fires under the agent chosen at schedule time (#142), recorded
        // on the ScheduledSession so it launches the right CLI at fire time.
        get().settings.defaultAgent,
      );
      // Newest-first; surface the (possibly new) folder in recents immediately.
      set((s) => ({
        schedules: [record, ...s.schedules],
        recents: [cwd, ...s.recents.filter((r) => r !== cwd)],
      }));
      get().pushToast(`Scheduled for ${new Date(at * 1000).toLocaleString()}`);
      return true;
    } catch (err) {
      // Return the error for inline display in the modal (#259 — a worktree schedule
      // now creates its worktree + branch eagerly, so a bad/duplicate branch must be
      // shown so the user can fix it), matching `createBranchSession`. `create_schedule`
      // only does git + persistence (no agent spawn), so there's no BinaryNotFound here.
      return isSessionError(err) ? err.message : "Could not schedule session";
    }
  },

  cancelSchedule: async (id) => {
    const schedule = get().schedules.find((x) => x.id === id);
    set((s) => ({ schedules: s.schedules.filter((x) => x.id !== id) }));
    // A schedule cancelled from the left panel also leaves every Canvas tab (#152).
    pruneCanvasLeaves((c) => c.kind === "scheduled" && c.scheduleId === id);
    await ipc.cancelSchedule(id).catch(() => {});
    get().pushToast("Schedule canceled");
    // Worktree auto-delete guard. Two shapes:
    // 1. A **worktree schedule** (#198/#259) whose worktree + branch were created
    //    eagerly at schedule time: its `cwd` is the parent repo and its folder is
    //    `worktree_path`. Cancelling frees that folder (ref-counted via the existing
    //    async `remove_worktree`; a dirty/in-use worktree is kept, never force-deleted),
    //    and the sidebar sub-group disappears once no item points at it.
    // 2. A schedule created **inside** an existing worktree folder (#199): its `cwd`
    //    is the worktree folder; resolve its parent and free it when empty.
    if (schedule) {
      if (schedule.worktree && schedule.worktree_path) {
        void get().cleanupWorktreeIfEmpty(schedule.cwd, schedule.worktree_path);
      } else {
        const wtParent = worktreeParentOf(get(), schedule.cwd);
        if (wtParent) void get().cleanupWorktreeIfEmpty(wtParent, schedule.cwd);
      }
    }
  },

  updateSchedule: async (id, prompt, name, at) => {
    set((s) => ({
      schedules: s.schedules.map((x) =>
        x.id === id ? { ...x, prompt, name, fire_at: at } : x,
      ),
    }));
    await ipc.updateSchedule(id, prompt, name, at).catch(() => {});
  },

  // Apply a cross-window pending-schedule list broadcast by the backend (#280,
  // `schedule://changed`). The main window owns schedule mutations and already tracks
  // them canonically (so this is usually a no-op echo, skipped by the equality guard);
  // a **detached** canvas window relies on it to keep its scheduled panel's data fresh
  // — incl. live edits to a pending schedule's time/prompt/name made in the main window.
  applyScheduleSync: (schedules) => {
    if (JSON.stringify(get().schedules) === JSON.stringify(schedules)) return;
    set({ schedules });
  },

  startScheduleNow: async (id) => {
    // The backend fires the schedule and emits `schedule://fired`, which `onFired`
    // turns into the live agent (removing the schedule). On a spawn failure the
    // schedule is kept (backend re-adds it; the frontend store still has it), so we
    // just toast — no optimistic removal here.
    try {
      await ipc.fireScheduleNow(id);
    } catch (err) {
      get().pushToast(
        isSessionError(err) ? err.message : "Could not start scheduled agent",
        "error",
      );
    }
  },

  createRecurring: async (
    cwd,
    branch,
    name,
    prompt,
    intervalSecs,
    firstFireAt,
    createBranch = false,
    base = null,
    worktree = false,
  ) => {
    try {
      const record = await ipc.createRecurring(
        cwd,
        branch,
        name,
        prompt,
        intervalSecs,
        firstFireAt,
        createBranch,
        base,
        worktree,
        // The recurring launches under the agent chosen at create time (#142).
        get().settings.defaultAgent,
      );
      set((s) => ({
        recurrings: [record, ...s.recurrings],
        recents: [cwd, ...s.recents.filter((r) => r !== cwd)],
      }));
      get().pushToast(
        `Recurring session created (${formatInterval(intervalSecs)})`,
      );
      return true;
    } catch (err) {
      // Inline error for the modal (a worktree recurring's bad/duplicate branch is
      // created eagerly, like a worktree schedule #259).
      return isSessionError(err)
        ? err.message
        : "Could not create recurring session";
    }
  },

  cancelRecurring: async (id) => {
    const recurring = get().recurrings.find((x) => x.id === id);
    set((s) => ({ recurrings: s.recurrings.filter((x) => x.id !== id) }));
    // A recurring cancelled from the left panel also leaves every Canvas tab (#294).
    pruneCanvasLeaves((c) => c.kind === "recurring" && c.recurringId === id);
    // Drop its live child locally (the backend kills it) so its column/terminal go.
    if (recurring?.current_session_id) {
      const child = recurring.current_session_id;
      intentionalKills.add(child);
      get().dropSession(child);
    }
    await ipc.cancelRecurring(id).catch(() => {});
    get().pushToast("Recurring session canceled");
    // Worktree auto-delete guard, mirroring `cancelSchedule` (#199/#259):
    // 1. A worktree recurring: its `cwd` is the parent repo, its folder `worktree_path`.
    // 2. A recurring created inside an existing worktree folder: `cwd` is the worktree.
    if (recurring) {
      if (recurring.worktree && recurring.worktree_path) {
        void get().cleanupWorktreeIfEmpty(
          recurring.cwd,
          recurring.worktree_path,
        );
      } else {
        const wtParent = worktreeParentOf(get(), recurring.cwd);
        if (wtParent)
          void get().cleanupWorktreeIfEmpty(wtParent, recurring.cwd);
      }
    }
  },

  updateRecurring: async (id, prompt, name, intervalSecs, nextFireAt) => {
    set((s) => ({
      recurrings: s.recurrings.map((x) =>
        x.id === id
          ? {
              ...x,
              prompt,
              name,
              interval_secs: intervalSecs,
              next_fire_at: nextFireAt,
            }
          : x,
      ),
    }));
    await ipc
      .updateRecurring(id, prompt, name, intervalSecs, nextFireAt)
      .catch(() => {});
  },

  applyRecurringSync: (recurrings) => {
    if (JSON.stringify(get().recurrings) === JSON.stringify(recurrings)) return;
    set({ recurrings });
  },

  copyToClipboard: async (text, label) => {
    try {
      // On Windows, route the write through the clipboard-manager plugin (#282): the
      // WebView2 async Clipboard API rejects `writeText` with "Document is not focused"
      // for a copy fired from a context menu / hover button, where WKWebView allows it.
      // The plugin writes the native OS clipboard (no document-focus requirement) — the
      // write twin of the #220 read seam. macOS keeps `navigator.clipboard.writeText`
      // byte-for-byte.
      if (isWindows(get().platform)) {
        await ipc.clipboardWriteText(text);
      } else {
        await navigator.clipboard.writeText(text);
      }
      get().pushToast(label ? `Copied ${label}` : "Copied");
    } catch {
      get().pushToast("Copy failed", "error");
    }
  },

  pullFolder: async (cwd) => {
    // `git pull --ff-only` (#181): toast git's summary on success, its error on
    // failure (diverged / no upstream). `--ff-only` never leaves a partial state.
    try {
      const summary = await ipc.pull(cwd);
      const upToDate = /already up to date/i.test(summary);
      get().pushToast(
        upToDate
          ? `${repoName(cwd)} already up to date`
          : `Pulled ${repoName(cwd)}`,
      );
    } catch (err) {
      const message = isSessionError(err) ? err.message : "Pull failed";
      get().pushToast(`Pull failed: ${message}`, "error");
    }
  },

  fetchFolder: async (cwd) => {
    // `git fetch --prune` (#243): reuses the #180 `fetch_remotes` command (already
    // registered + permitted for the branch picker; its `git fetch` goes through the
    // Rust `hidden_command` CREATE_NO_WINDOW guard, so no console flash on Windows).
    // Toast git's success/error, then refresh branch labels for any branch movement.
    try {
      await ipc.fetchRemotes(cwd);
      get().pushToast(`Fetched ${repoName(cwd)}`);
      await get().refreshBranches();
    } catch (err) {
      const message = isSessionError(err) ? err.message : "Fetch failed";
      get().pushToast(`Fetch failed: ${message}`, "error");
    }
  },

  checkoutFolderBranch: async (repo, branch) => {
    // `git checkout <existing branch>` in the folder (#266), with **no** agent spawn
    // (the distinction from `spawnSession`'s checkout). A failed checkout — a dirty
    // tree conflict or unknown branch — surfaces as an error toast and leaves state
    // untouched (git never half-switches).
    try {
      await ipc.checkoutBranch(repo, branch);
      get().pushToast(`Checked out ${branch}`);
      // Both the branch label (#212) and which files differ from HEAD (#252) change —
      // refresh both so the sidebar + file-tree coloring follow.
      await get().refreshBranches();
      void get().refreshFileStatuses(repo);
    } catch (err) {
      const message = isSessionError(err) ? err.message : "Checkout failed";
      get().pushToast(`Checkout failed: ${message}`, "error");
    }
  },

  createFolderBranch: async (repo, name, base) => {
    // `git checkout -b <name> [<base>]` in the folder (#266), **no** agent spawn.
    // Validation errors (invalid / already-existing name, unknown base) are returned
    // for inline display; a remote ref base pulls it into a local tracking branch
    // (reusing the #124/#180 create-branch write).
    try {
      await ipc.createBranch(repo, name, base);
    } catch (err) {
      return isSessionError(err) ? err.message : "Could not create branch";
    }
    get().pushToast(`Created ${name}`);
    await get().refreshBranches();
    void get().refreshFileStatuses(repo);
    return true;
  },
}));
