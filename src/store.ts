// Zustand store: backend-mirrored session state + UI state, plus the
// cross-cutting actions used across views. Terminal bytes are intentionally not
// stored here (see outputBus.ts).

import { create } from "zustand";

import {
  collectLeaves,
  spatialNeighbor,
  updateLeafContent,
} from "./components/Canvas/canvasTree";
import { applyTerminalSettings } from "./components/Terminal/terminalPool";
import * as ipc from "./ipc";
import { emitSessionOutput } from "./outputBus";
import { repoName } from "./paths";
import { DETACHED_CANVAS_ID, IS_MAIN_WINDOW } from "./windowContext";
import type {
  CanvasContent,
  CanvasNode,
  CanvasTab,
  OverviewPanel,
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
// Subscribe to session events exactly once: StrictMode double-invokes the init
// effect in dev, which would otherwise register duplicate listeners and
// double-fire every exit toast (#32).
let eventsSubscribed = false;
// Sessions killed intentionally (Remove / Forget) — their backend `Exited` event
// must not add a second "Session exited" toast on top of the action's toast (#32).
const intentionalKills = new Set<string>();

// Sidebar width (#108): drag-resizable, clamped to [min, max] and persisted
// separately from the Settings blob (so the modal's draft can't clobber a drag).
const SIDEBAR_WIDTH_DEFAULT = 260;
const SIDEBAR_WIDTH_MIN = 180;
const SIDEBAR_WIDTH_MAX = 560;
const clampSidebarWidth = (w: number): number =>
  Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, Math.round(w)));
// Debounce the persist so a drag's many updates don't spam IPC (state updates live).
let sidebarWidthPersistTimer: ReturnType<typeof setTimeout> | undefined;

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
  if (kind === "terminal") return "terminal";
  return file ? (file.split("/").pop() ?? file) : "file viewer";
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
  defaultView: "overview",
  confirmDestructive: true,
  autoName: true,
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
}

/** A clicked sidebar item — an agent/terminal (by PTY id) or a file/diff panel
 * (by repo path + file). Matched against Canvas leaves for view-aware nav (#79). */
type SidebarItem = {
  id: string;
  kind: "agent" | "terminal" | "file" | "diff" | "scheduled";
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
    case "diff":
      return content.kind === "diff" && content.repoPath === item.repoPath;
    case "scheduled":
      return content.kind === "scheduled" && content.scheduleId === item.id;
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
  const panels = overviewPanels[content.repoPath ?? ""] ?? [];
  if (content.kind === "file") {
    return (
      panels.find((p) => p.kind === "markdown" && p.file === content.file)
        ?.id ?? null
    );
  }
  if (content.kind === "diff") {
    return panels.find((p) => p.kind === "diff")?.id ?? null;
  }
  return null;
}

export interface AppState {
  // --- State ---
  sessions: SessionView[];
  selectedId: string | null;
  view: View;
  /** Overview filter: show only this repo's agents, or all when null (#34). */
  overviewRepoFilter: string | null;
  recents: string[];
  /** Current branch per repo path (from git reading); "" when unknown/non-git. */
  branches: Record<string, string>;
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
  /** The keyboard-focused Canvas panel (leaf id), or null (#76). */
  activeLeafId: string | null;
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
  toasts: Toast[];
  /** New session modal (rendered by #10); `newSessionRepo` optionally prefills it. */
  newSessionOpen: boolean;
  newSessionRepo: string | null;
  /** The same modal opened in **schedule** mode (#93): folder → branch → a final
   * time/prompt/name step that creates a scheduled session instead of spawning. */
  scheduleMode: boolean;
  /** Pending scheduled sessions (#93), newest-first; main window only. */
  schedules: ScheduledSession[];
  /** Application settings (#100), merged with defaults on load. */
  settings: Settings;
  /** Whether the Settings modal is open (#100). */
  settingsOpen: boolean;
  /** Sidebar width in px (#108), drag-resizable + persisted (main window). */
  sidebarWidth: number;

  // --- Sync reducers ---
  setView: (view: View) => void;
  select: (id: string | null) => void;
  /** Select/jump to a sidebar item, view-aware (#79): in Overview select + scroll
   * its column; in Canvas focus its panel if present, else toast + deselect.
   * Never switches the view. */
  selectItem: (item: SidebarItem) => void;
  /** Toggle the Overview repo filter (clicking the active repo clears it); pass
   * null to clear ("Show all"). #34 */
  setOverviewRepoFilter: (repo: string | null) => void;
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
  /** Clear the boot "reconnecting" flag once a session proves it's live (#30). */
  markConnected: (id: string) => void;
  setClaudeMissing: (missing: boolean) => void;
  pushToast: (message: string, tone?: ToastTone) => string;
  dismissToast: (id: string) => void;
  openNewSession: (repo?: string) => void;
  /** Open the modal in schedule mode (#93). */
  openSchedule: (repo?: string) => void;
  closeNewSession: () => void;
  /** Open/close the Settings modal (#100). */
  setSettingsOpen: (open: boolean) => void;
  /** Set the sidebar width (#108): clamp to [180, 560] + persist (debounced). */
  setSidebarWidth: (width: number) => void;

  // --- Async / cross-cutting actions ---
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshBranches: () => Promise<void>;
  /** Assign a repo's color (optimistic + persisted) (#35). */
  setRepoColor: (path: string, color: string) => Promise<void>;
  /** Apply + persist application settings (#100) and run their side-effects. */
  saveSettings: (settings: Settings) => Promise<void>;
  /** Add / close / reorder a repo's extra Overview panels (optimistic + persisted, #38). */
  addOverviewPanel: (
    repoPath: string,
    kind: OverviewPanel["kind"],
    file?: string,
  ) => Promise<void>;
  removeOverviewPanel: (repoPath: string, id: string) => Promise<void>;
  /** Persist a repo's diff-panel branch-compare config on its diff panel (#81). */
  setDiffCompare: (
    repoPath: string,
    config: {
      diff_source?: "working" | "compare";
      compare_base?: string;
      compare_target?: string;
    },
  ) => void;
  /** Switch an Overview file panel to another repo-relative file in place (#90). */
  setOverviewPanelFile: (
    repoPath: string,
    panelId: string,
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
  /** Add a new empty Canvas tab (default "Canvas N") and select it (#58). */
  addCanvas: () => void;
  /** Close a Canvas tab; always keeps ≥1 (closing the last leaves an empty one) (#58). */
  closeCanvas: (id: string) => void;
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
  /** Remove a worktree once its last active agent is gone (ref-counted, #74). */
  cleanupWorktreeIfEmpty: (parent: string, dest: string) => Promise<void>;
  /** Resume a crashed / boot-failed agent's PTY; resolves true on success so the
   * caller can reset the pooled terminal (#63). */
  restartSession: (id: string) => Promise<boolean>;
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
  /** Create a scheduled session (#93); resolves true on success. */
  scheduleSession: (
    cwd: string,
    branch: string | null,
    name: string | null,
    prompt: string | null,
    at: number,
  ) => Promise<boolean>;
  /** Cancel a pending scheduled session (#93). */
  cancelSchedule: (id: string) => Promise<void>;
  /** Update a schedule's prompt / name / fire time (#93). */
  updateSchedule: (
    id: string,
    prompt: string | null,
    name: string | null,
    at: number,
  ) => Promise<void>;
  copyToClipboard: (text: string, label?: string) => Promise<void>;
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
  for (const dest of worktreeDests) {
    await useStore.getState().cleanupWorktreeIfEmpty(repoPath, dest);
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

export const useStore = create<AppState>()((set, get) => ({
  sessions: [],
  selectedId: null,
  view: "overview",
  overviewRepoFilter: null,
  recents: [],
  branches: {},
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
  activeLeafId: null,
  sessionBusy: {},
  sessionActive: {},
  terminalExits: {},
  claudeMissing: false,
  toasts: [],
  newSessionOpen: false,
  newSessionRepo: null,
  scheduleMode: false,
  schedules: [],
  settings: DEFAULT_SETTINGS,
  settingsOpen: false,
  sidebarWidth: SIDEBAR_WIDTH_DEFAULT,

  setView: (view) => set({ view }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
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
  // Selection is decoupled from the view (#22): selecting only highlights. The
  // sidebar ViewSwitch is the only thing that changes the view (#75).
  select: (id) => set({ selectedId: id }),

  // Toggle the Overview repo filter: clicking the active repo (or passing null)
  // clears it; any other repo sets it (#34).
  setOverviewRepoFilter: (repo) =>
    set((s) => ({
      overviewRepoFilter: s.overviewRepoFilter === repo ? null : repo,
    })),

  setSessions: (sessions) => set({ sessions }),
  setRecents: (recents) => set({ recents }),

  upsertSession: (session) =>
    set((s) => ({
      sessions: [...s.sessions.filter((x) => x.id !== session.id), session],
    })),

  dropSession: (id) =>
    set((s) => ({
      sessions: s.sessions.filter((x) => x.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      view: s.selectedId === id ? "overview" : s.view,
      sessionBusy: omitKey(s.sessionBusy, id),
      sessionActive: omitKey(s.sessionActive, id),
    })),

  markExited: (id, code) =>
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === id ? { ...x, exitedCode: code, reconnecting: false } : x,
      ),
      // An exited session is not working — clear any busy flag (#42).
      sessionBusy: omitKey(s.sessionBusy, id),
    })),

  setBusy: (id, busy) =>
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
    }),

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

  markRunning: (id) =>
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === id ? { ...x, exitedCode: undefined, reconnecting: false } : x,
      ),
    })),

  markConnected: (id) =>
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === id ? { ...x, reconnecting: false } : x,
      ),
    })),

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
    }),
  openSchedule: (repo) =>
    set({
      newSessionOpen: true,
      newSessionRepo: repo ?? null,
      scheduleMode: true,
    }),
  closeNewSession: () =>
    set({ newSessionOpen: false, newSessionRepo: null, scheduleMode: false }),

  init: async () => {
    // Subscribe exactly once. The flag is set *before* the await so StrictMode's
    // synchronous double-invoke can't register a second set of listeners (#32).
    if (!eventsSubscribed) {
      eventsSubscribed = true;
      try {
        await ipc.subscribeSessionEvents({
          onOutput: ({ id, bytes }) => {
            emitSessionOutput(id, Uint8Array.from(bytes));
            // First live output proves a reconnecting session is alive — clear
            // the flag. A plain read keeps output off the re-render path; the
            // setter only runs on the one transition (#30).
            if (get().sessions.find((x) => x.id === id)?.reconnecting) {
              get().markConnected(id);
            }
          },
          onState: ({ id, busy }) => {
            // Busy/idle from the backend heuristic (#42); emitted only on change.
            get().setBusy(id, busy);
          },
          onName: ({ id, name }) => {
            // claude's own auto-title (#97); fills the label for an unnamed agent
            // (a custom name #57 still wins in sessionLabel).
            get().setAutoName(id, name);
          },
          onExited: ({ id, code }) => {
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
        // Scheduled sessions (#93): the backend engine fires schedules into live
        // agents — the main window listens to move them scheduled→live (and to
        // surface a failed spawn). Schedules are a main-window-only surface.
        if (IS_MAIN_WINDOW) {
          await ipc.subscribeScheduleEvents({
            onFired: ({ id, session }) => {
              set((s) => ({
                schedules: s.schedules.filter((x) => x.id !== id),
                recents: [
                  session.repo_path,
                  ...s.recents.filter((r) => r !== session.repo_path),
                ],
              }));
              get().upsertSession(toSessionView(session));
              get().pushToast(
                `Scheduled agent started${session.name ? `: ${session.name}` : ""}`,
              );
            },
            onError: ({ id, message }) => {
              set((s) => ({
                schedules: s.schedules.filter((x) => x.id !== id),
              }));
              get().pushToast(
                message || "Scheduled agent failed to start",
                "error",
              );
            },
          });
        }
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
    }
    // Learn the current detached-window set — a just-opened window may have missed
    // the `canvas://windows` broadcast that fired before it began listening (#84).
    try {
      get().setDetachedCanvasIds(await ipc.listCanvasWindows());
    } catch {
      // Outside Tauri / no windows; leave the (empty) default.
    }
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
      ] = await Promise.all([
        ipc.listRepoColors(),
        ipc.listOverviewPanels(),
        ipc.listOverviewOrder(),
        ipc.listOpenFiles(),
        ipc.getCanvasLayout(),
        ipc.getCanvases(),
        ipc.getSettings(),
        ipc.getSidebarWidth(),
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
    // Scheduled sessions (#93) — main-window-only surface; re-armed timers live in
    // the backend, so the frontend just lists the pending ones.
    if (IS_MAIN_WINDOW) {
      try {
        set({ schedules: await ipc.listSchedules() });
      } catch {
        // Backend unreachable; leave schedules as-is.
      }
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

  // Extra Overview panels (#38) — the single per-repo item source (#59): each is
  // also a sidebar row. Dedups so callers don't have to (one diff per repo; one
  // markdown panel per file); updates optimistically and persists the list.
  addOverviewPanel: async (repoPath, kind, file) => {
    const current = get().overviewPanels[repoPath] ?? [];
    // Terminals are never deduped — multiple independent shells per repo (#72);
    // one diff per repo; one markdown panel per file.
    const dup =
      kind === "diff"
        ? current.some((p) => p.kind === "diff")
        : kind === "markdown"
          ? current.some((p) => p.kind === "markdown" && p.file === file)
          : false;
    if (dup) {
      // Already open (#59 dedup) — a gentle nudge instead of a second "Opened…"
      // (#83), so re-clicking the menu item still gives feedback.
      get().pushToast("Already open");
      return;
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
        return;
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
      (diffPanel.compare_target ?? undefined) === config.compare_target
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

  // Switch a Canvas file panel to another file in place (#90): update the active
  // tab's leaf content and persist via setActiveCanvasLayout (the canvases blob).
  setLeafFile: (leafId, file) => {
    const { canvases, activeCanvasId } = get();
    const layout =
      canvases.find((c) => c.id === activeCanvasId)?.layout ?? null;
    if (!layout) return;
    get().setActiveCanvasLayout(updateLeafContent(layout, leafId, { file }));
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
    // Canvas (#79): jump to the item's panel if it's in the active tab, else
    // toast + deselect. Never switches the view or tab.
    const layout =
      s.canvases.find((c) => c.id === s.activeCanvasId)?.layout ?? null;
    const match = collectLeaves(layout).find((l) =>
      matchesCanvasItem(l.content, item),
    );
    if (match) {
      set({ selectedId: item.id, activeLeafId: match.id });
    } else {
      set({ selectedId: null });
      get().pushToast("Item not present in canvas — drag to add");
    }
  },

  spawnSession: async (cwd, name, branch) => {
    try {
      // Optional branch checkout (#27) before spawning the agent. A failed
      // checkout (e.g. dirty tree) aborts without spawning so nothing starts on
      // the wrong branch.
      if (branch) await ipc.checkoutBranch(cwd, branch);
      const record = await ipc.spawnSession(cwd, name);
      get().upsertSession(toSessionView(record));
      set((s) => ({ recents: [cwd, ...s.recents.filter((r) => r !== cwd)] }));
      get().select(record.id);
      get().pushToast(`Started ${record.name ?? cwd}`);
      // A checkout (or a brand-new repo) can change the branch label — refresh.
      void get().refreshBranches();
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
      const record = await ipc.spawnWorktreeAgent(repo, branch);
      get().upsertSession(toSessionView(record));
      get().select(record.id);
      get().pushToast(`Started isolated worktree on ${branch}`);
      void get().refreshBranches();
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

  cleanupWorktreeIfEmpty: async (parent, dest) => {
    // Ref-counted (#74): never remove a worktree while another active agent still
    // runs in it.
    const stillActive = get().sessions.some(
      (s) => s.repoPath === dest && s.exitedCode === undefined,
    );
    if (stillActive) return;
    try {
      // Non-forced: git refuses a dirty worktree, which is our dirty guard.
      await ipc.removeWorktree(parent, dest, false);
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
    set((s) => {
      const clearSelection = s.selectedId != null && ids.includes(s.selectedId);
      return {
        sessions: s.sessions.filter(
          (x) => x.repoPath !== repoPath && x.worktreeParent !== repoPath,
        ),
        recents: s.recents.filter((r) => r !== repoPath),
        schedules: s.schedules.filter((sc) => sc.cwd !== repoPath),
        selectedId: clearSelection ? null : s.selectedId,
        view: clearSelection ? "overview" : s.view,
        // Drop a now-dangling Overview filter on the forgotten repo (#34).
        overviewRepoFilter:
          s.overviewRepoFilter === repoPath ? null : s.overviewRepoFilter,
      };
    });
    // One summary toast (#83) listing everything removed, omitting zero parts.
    const parts: string[] = [];
    if (ids.length > 0)
      parts.push(`${ids.length} agent${ids.length === 1 ? "" : "s"}`);
    if (itemCount > 0)
      parts.push(`${itemCount} view${itemCount === 1 ? "" : "s"}`);
    if (scheduleIds.length > 0) parts.push(`${scheduleIds.length} scheduled`);
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

  scheduleSession: async (cwd, branch, name, prompt, at) => {
    try {
      const record = await ipc.createSchedule(cwd, branch, name, prompt, at);
      // Newest-first; surface the (possibly new) folder in recents immediately.
      set((s) => ({
        schedules: [record, ...s.schedules],
        recents: [cwd, ...s.recents.filter((r) => r !== cwd)],
      }));
      get().pushToast(`Scheduled for ${new Date(at * 1000).toLocaleString()}`);
      return true;
    } catch (err) {
      get().pushToast(
        isSessionError(err) ? err.message : "Could not schedule session",
        "error",
      );
      return false;
    }
  },

  cancelSchedule: async (id) => {
    set((s) => ({ schedules: s.schedules.filter((x) => x.id !== id) }));
    await ipc.cancelSchedule(id).catch(() => {});
    get().pushToast("Schedule canceled");
  },

  updateSchedule: async (id, prompt, name, at) => {
    set((s) => ({
      schedules: s.schedules.map((x) =>
        x.id === id ? { ...x, prompt, name, fire_at: at } : x,
      ),
    }));
    await ipc.updateSchedule(id, prompt, name, at).catch(() => {});
  },

  copyToClipboard: async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      get().pushToast(label ? `Copied ${label}` : "Copied");
    } catch {
      get().pushToast("Copy failed", "error");
    }
  },
}));
