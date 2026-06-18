// Zustand store: backend-mirrored session state + UI state, plus the
// cross-cutting actions used across views. Terminal bytes are intentionally not
// stored here (see outputBus.ts).

import { create } from "zustand";

import * as ipc from "./ipc";
import { emitSessionOutput } from "./outputBus";
import { repoName } from "./paths";
import * as updater from "./updater";
import type {
  SessionRecord,
  SessionView,
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

export interface AppState {
  // --- State ---
  sessions: SessionView[];
  selectedId: string | null;
  view: View;
  inspectorOpen: boolean;
  recents: string[];
  /** Current branch per repo path (from git reading); "" when unknown/non-git. */
  branches: Record<string, string>;
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
  inspectorOpen: false,
  recents: [],
  branches: {},
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
    })),

  markExited: (id, code) =>
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === id ? { ...x, exitedCode: code, reconnecting: false } : x,
      ),
    })),

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
    try {
      await ipc.subscribeSessionEvents({
        onOutput: ({ id, bytes }) => {
          emitSessionOutput(id, Uint8Array.from(bytes));
          // First live output proves a reconnecting session is alive — clear the
          // flag. A plain read keeps output off the re-render path; the setter
          // only runs on the one transition (#30).
          if (get().sessions.find((x) => x.id === id)?.reconnecting) {
            get().markConnected(id);
          }
        },
        onExited: ({ id, code }) => {
          // A boot-resume that fails (e.g. no saved conversation) shows its state
          // in the terminal + a Restart — don't pile onto a toast wall during the
          // boot window. Genuine runtime exits (after boot) still toast.
          get().markExited(id, code);
          if (!booting) {
            get().pushToast(
              code != null ? `Session exited (code ${code})` : "Session exited",
            );
          }
        },
      });
    } catch {
      // Event subscription only works inside the Tauri webview.
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
    await Promise.all(ids.map((id) => ipc.killSession(id).catch(() => {})));
    await ipc.removeRecent(repoPath).catch(() => {});
    set((s) => {
      const clearSelection = s.selectedId != null && ids.includes(s.selectedId);
      return {
        sessions: s.sessions.filter((x) => x.repoPath !== repoPath),
        recents: s.recents.filter((r) => r !== repoPath),
        selectedId: clearSelection ? null : s.selectedId,
        view: clearSelection ? "overview" : s.view,
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
