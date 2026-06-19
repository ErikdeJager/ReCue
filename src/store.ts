// Zustand store: backend-mirrored session state + UI state, plus the
// cross-cutting actions used across views. Terminal bytes are intentionally not
// stored here (see outputBus.ts).

import { create } from "zustand";

import * as ipc from "./ipc";
import { emitSessionOutput } from "./outputBus";
import { repoName } from "./paths";
import * as updater from "./updater";
import type {
  CanvasNode,
  OverviewPanel,
  SessionRecord,
  SessionView,
  Toast,
  ToastTone,
  View,
} from "./types";

const TOAST_TTL_MS = 3500;
/** Focus inspector resize bounds (#51); the default when none is persisted. */
export const INSPECTOR_MIN_WIDTH = 240;
export const INSPECTOR_MAX_WIDTH = 720;
export const INSPECTOR_DEFAULT_WIDTH = 360;
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

/** Copy of `map` without `key` — returns the same ref when `key` is absent so
 * callers don't trigger needless re-renders. */
function omitKey<T>(map: Record<string, T>, key: string): Record<string, T> {
  if (!(key in map)) return map;
  const next = { ...map };
  delete next[key];
  return next;
}

function toSessionView(record: SessionRecord): SessionView {
  return {
    id: record.id,
    claudeSessionId: record.claude_session_id,
    repoPath: record.repo_path,
    name: record.name,
    createdAt: record.created_at,
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

export interface AppState {
  // --- State ---
  sessions: SessionView[];
  selectedId: string | null;
  view: View;
  /** Overview filter: show only this repo's agents, or all when null (#34). */
  overviewRepoFilter: string | null;
  inspectorOpen: boolean;
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
  /** Per-repo opened files for the sidebar tree (#45); repo-relative paths. */
  openFiles: Record<string, string[]>;
  /** The Canvas split-panel layout tree (#46); null = empty canvas. */
  canvasLayout: CanvasNode | null;
  /** The Focus inspector width in px (#51), within the resize bounds. */
  inspectorWidth: number;
  /** Sessions currently working, from the output-activity heuristic (#42); an
   * absent/false entry means idle. (The task's `sessionState`, as a boolean map.) */
  sessionBusy: Record<string, boolean>;
  claudeMissing: boolean;
  toasts: Toast[];
  /** New session modal (rendered by #10); `newSessionRepo` optionally prefills it. */
  newSessionOpen: boolean;
  newSessionRepo: string | null;
  /** In-app updater state (Tauri updater plugin); `dismissed` is session-only. */
  update: {
    available: boolean;
    version: string | null;
    dismissed: boolean;
    installing: boolean;
  };

  // --- Sync reducers ---
  setView: (view: View) => void;
  select: (id: string | null) => void;
  /** Toggle the Overview repo filter (clicking the active repo clears it); pass
   * null to clear ("Show all"). #34 */
  setOverviewRepoFilter: (repo: string | null) => void;
  /** Switch to Focus, ensuring an agent is selected (last/first); no-op if none. */
  showFocus: () => void;
  toggleInspector: () => void;
  setInspectorOpen: (open: boolean) => void;
  setSessions: (sessions: SessionView[]) => void;
  setRecents: (recents: string[]) => void;
  upsertSession: (session: SessionView) => void;
  dropSession: (id: string) => void;
  markExited: (id: string, code: number | null) => void;
  markRunning: (id: string) => void;
  /** Set a session's busy/idle state from the backend heuristic (#42). */
  setBusy: (id: string, busy: boolean) => void;
  /** Clear the boot "reconnecting" flag once a session proves it's live (#30). */
  markConnected: (id: string) => void;
  setClaudeMissing: (missing: boolean) => void;
  pushToast: (message: string, tone?: ToastTone) => string;
  dismissToast: (id: string) => void;
  openNewSession: (repo?: string) => void;
  closeNewSession: () => void;
  dismissUpdate: () => void;

  // --- Async / cross-cutting actions ---
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshBranches: () => Promise<void>;
  /** Assign a repo's color (optimistic + persisted) (#35). */
  setRepoColor: (path: string, color: string) => Promise<void>;
  /** Add / close / reorder a repo's extra Overview panels (optimistic + persisted, #38). */
  addOverviewPanel: (
    repoPath: string,
    kind: OverviewPanel["kind"],
    file?: string,
  ) => Promise<void>;
  removeOverviewPanel: (repoPath: string, id: string) => Promise<void>;
  /** Persist a repo cluster's drag-reordered item order (#43). */
  reorderOverview: (repoPath: string, orderedKeys: string[]) => Promise<void>;
  /** Register / forget an opened file in the sidebar tree (#45, persisted). */
  openFile: (repoPath: string, file: string) => Promise<void>;
  closeFile: (repoPath: string, file: string) => Promise<void>;
  /** Replace the Canvas layout tree and persist (#46). */
  setCanvasLayout: (tree: CanvasNode | null) => void;
  /** Set the Focus inspector width (clamped); live during a drag, not persisted (#51). */
  setInspectorWidth: (px: number) => void;
  /** Persist the current Focus inspector width — on drag end / keyboard step (#51). */
  persistInspectorWidth: () => void;
  checkForUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  /** Optionally `git checkout <branch>` first (#27); resolves true on success. */
  spawnSession: (
    cwd: string,
    name?: string,
    branch?: string,
  ) => Promise<boolean>;
  restartSession: (id: string) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  /** Forget a folder: kill+forget all its sessions and drop it from recents (#31). */
  forgetRepo: (repoPath: string) => Promise<void>;
  openInZed: (cwd: string) => Promise<void>;
  copyToClipboard: (text: string, label?: string) => Promise<void>;
}

export const useStore = create<AppState>()((set, get) => ({
  sessions: [],
  selectedId: null,
  view: "overview",
  overviewRepoFilter: null,
  inspectorOpen: false,
  recents: [],
  branches: {},
  repoColors: {},
  overviewPanels: {},
  overviewOrder: {},
  openFiles: {},
  canvasLayout: null,
  inspectorWidth: INSPECTOR_DEFAULT_WIDTH,
  sessionBusy: {},
  claudeMissing: false,
  toasts: [],
  newSessionOpen: false,
  newSessionRepo: null,
  update: {
    available: false,
    version: null,
    dismissed: false,
    installing: false,
  },

  setView: (view) => set({ view }),
  // Selection is decoupled from the view (#22): selecting only highlights — it
  // never forces Focus. Callers that intend a view change (Overview "Expand",
  // the ViewSwitch) call setView explicitly.
  select: (id) => set({ selectedId: id }),

  // Toggle the Overview repo filter: clicking the active repo (or passing null)
  // clears it; any other repo sets it (#34).
  setOverviewRepoFilter: (repo) =>
    set((s) => ({
      overviewRepoFilter: s.overviewRepoFilter === repo ? null : repo,
    })),

  // Switch to Focus from anywhere (#25). Keep the current selection if it's still
  // valid, else focus the first agent; with no agents this is a no-op so the
  // Focus toggle can't strand the user on an empty view.
  showFocus: () =>
    set((s) => {
      if (s.sessions.length === 0) return {};
      const valid = s.sessions.some((x) => x.id === s.selectedId);
      return {
        selectedId: valid ? s.selectedId : (s.sessions[0]?.id ?? null),
        view: "focus",
      };
    }),
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  setInspectorOpen: (open) => set({ inspectorOpen: open }),
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
      return {
        sessionBusy: busy
          ? { ...s.sessionBusy, [id]: true }
          : omitKey(s.sessionBusy, id),
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
    set({ newSessionOpen: true, newSessionRepo: repo ?? null }),
  closeNewSession: () => set({ newSessionOpen: false, newSessionRepo: null }),

  dismissUpdate: () =>
    set((s) => ({ update: { ...s.update, dismissed: true } })),

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
          onExited: ({ id, code }) => {
            get().markExited(id, code);
            // One notification per close (#32): skip the generic exit toast for
            // intentional kills (Remove/Forget already toast) and during the boot
            // resume window (#30). Unexpected exits still toast exactly once.
            const intentional = intentionalKills.delete(id);
            if (!booting && !intentional) {
              get().pushToast(
                code != null
                  ? `Session exited (code ${code})`
                  : "Session exited",
              );
            }
          },
        });
      } catch {
        // Event subscription only works inside the Tauri webview.
        eventsSubscribed = false;
      }
    }
    await get().refresh();
    void get().checkForUpdate();
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
      set({
        sessions: records.map((r) => ({
          ...toSessionView(r),
          reconnecting: true,
        })),
        recents,
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
      const [colors, panels, order, files, canvas, inspectorWidth] =
        await Promise.all([
          ipc.listRepoColors(),
          ipc.listOverviewPanels(),
          ipc.listOverviewOrder(),
          ipc.listOpenFiles(),
          ipc.getCanvasLayout(),
          ipc.getInspectorWidth(),
        ]);
      set({
        repoColors: colors,
        overviewPanels: panels,
        overviewOrder: order,
        openFiles: files,
        canvasLayout: canvas ?? null,
        inspectorWidth: inspectorWidth ?? INSPECTOR_DEFAULT_WIDTH,
      });
    } catch {
      // Backend unreachable; leave colors/panels/order/files/canvas/width as-is.
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

  // Extra Overview panels (#38) — each action recomputes the repo's ordered list,
  // updates optimistically, and persists the whole list for that repo.
  addOverviewPanel: async (repoPath, kind, file) => {
    const panel: OverviewPanel = {
      id: crypto.randomUUID(),
      kind,
      ...(file ? { file } : {}),
    };
    const next = [...(get().overviewPanels[repoPath] ?? []), panel];
    set((s) => ({
      overviewPanels: { ...s.overviewPanels, [repoPath]: next },
    }));
    // A file panel is also an "open file" — register it in the sidebar tree (#45).
    if (file) void get().openFile(repoPath, file);
    try {
      await ipc.setOverviewPanels(repoPath, next);
    } catch {
      // Persist failed (e.g. outside Tauri); keep the local layout for the session.
    }
  },

  removeOverviewPanel: async (repoPath, id) => {
    const next = (get().overviewPanels[repoPath] ?? []).filter(
      (p) => p.id !== id,
    );
    set((s) => {
      const map = { ...s.overviewPanels };
      if (next.length) map[repoPath] = next;
      else delete map[repoPath];
      return { overviewPanels: map };
    });
    try {
      await ipc.setOverviewPanels(repoPath, next);
    } catch {
      // ignore
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

  // Opened-file tree (#45). openFile appends (deduped, stable order); closeFile
  // removes; both persist the repo's list. Decoupled from Overview columns — the
  // tree is a per-repo "opened files" list that survives restarts.
  openFile: async (repoPath, file) => {
    const current = get().openFiles[repoPath] ?? [];
    if (current.includes(file)) return; // already listed — no-op
    const next = [...current, file];
    set((s) => ({ openFiles: { ...s.openFiles, [repoPath]: next } }));
    try {
      await ipc.setOpenFiles(repoPath, next);
    } catch {
      // Persist failed (e.g. outside Tauri); keep the local list for the session.
    }
  },

  closeFile: async (repoPath, file) => {
    const next = (get().openFiles[repoPath] ?? []).filter((f) => f !== file);
    set((s) => {
      const map = { ...s.openFiles };
      if (next.length) map[repoPath] = next;
      else delete map[repoPath];
      return { openFiles: map };
    });
    try {
      await ipc.setOpenFiles(repoPath, next);
    } catch {
      // ignore
    }
  },

  // Canvas layout (#46): the component computes the next tree via the pure
  // canvasTree helpers; this just commits + persists it (resize is debounced in
  // the component, so each call here is a settled structural/size change).
  setCanvasLayout: (tree) => {
    set({ canvasLayout: tree });
    void ipc.setCanvasLayout(tree).catch(() => {
      // Persist failed (e.g. outside Tauri); keep the local layout for the session.
    });
  },

  // Inspector resize (#51): `set` updates state live during the drag (cheap — the
  // terminal lives in the pool, not re-rendered); `persist` writes the settled
  // width on drag-end / keyboard step so we don't hit the disk every frame.
  setInspectorWidth: (px) => {
    const clamped = Math.round(
      Math.min(INSPECTOR_MAX_WIDTH, Math.max(INSPECTOR_MIN_WIDTH, px)),
    );
    if (clamped !== get().inspectorWidth) set({ inspectorWidth: clamped });
  },
  persistInspectorWidth: () => {
    void ipc.setInspectorWidth(get().inspectorWidth).catch(() => {
      // Persist failed (e.g. outside Tauri); the local width stays for the session.
    });
  },

  checkForUpdate: async () => {
    try {
      const info = await updater.checkForUpdate();
      if (info) {
        set({
          update: {
            available: true,
            version: info.version,
            dismissed: false,
            installing: false,
          },
        });
      }
    } catch {
      // Offline, no update, or running outside Tauri — ignore.
    }
  },

  installUpdate: async () => {
    set((s) => ({ update: { ...s.update, installing: true } }));
    try {
      await updater.downloadAndRelaunch();
      // On success the app relaunches into the new version.
    } catch {
      set((s) => ({ update: { ...s.update, installing: false } }));
      get().pushToast("Update failed", "error");
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

  restartSession: async (id) => {
    try {
      await ipc.resumeSession(id);
      get().markRunning(id);
      get().pushToast("Session restarted");
    } catch (err) {
      if (isSessionError(err) && err.kind === "BinaryNotFound") {
        get().setClaudeMissing(true);
      }
      get().pushToast(
        isSessionError(err) ? err.message : "Could not restart session",
        "error",
      );
    }
  },

  removeSession: async (id) => {
    // Intentional kill — the backend `Exited` toast is suppressed (#32); the
    // "Session removed" toast below is the single notification.
    intentionalKills.add(id);
    try {
      await ipc.killSession(id);
    } catch {
      // Forget locally regardless of whether the process was still live.
    }
    get().dropSession(id);
    get().pushToast("Session removed");
  },

  forgetRepo: async (repoPath) => {
    const ids = get()
      .sessions.filter((s) => s.repoPath === repoPath)
      .map((s) => s.id);
    // Kill + forget every session's process (kill_session also drops its record),
    // then drop the folder from persisted recents so it can't reappear on restart.
    // Mark them intentional so their exit events don't each pop a toast (#32).
    ids.forEach((id) => intentionalKills.add(id));
    await Promise.all(ids.map((id) => ipc.killSession(id).catch(() => {})));
    await ipc.removeRecent(repoPath).catch(() => {});
    set((s) => {
      const clearSelection = s.selectedId != null && ids.includes(s.selectedId);
      return {
        sessions: s.sessions.filter((x) => x.repoPath !== repoPath),
        recents: s.recents.filter((r) => r !== repoPath),
        selectedId: clearSelection ? null : s.selectedId,
        view: clearSelection ? "overview" : s.view,
        // Drop a now-dangling Overview filter on the forgotten repo (#34).
        overviewRepoFilter:
          s.overviewRepoFilter === repoPath ? null : s.overviewRepoFilter,
      };
    });
    get().pushToast(
      ids.length > 0
        ? `Forgot folder + ${ids.length} agent${ids.length === 1 ? "" : "s"}`
        : "Forgot folder",
    );
  },

  openInZed: async (cwd) => {
    try {
      await ipc.openInEditor(cwd);
    } catch (err) {
      get().pushToast(
        isSessionError(err) ? err.message : "Could not open Zed",
        "error",
      );
    }
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
