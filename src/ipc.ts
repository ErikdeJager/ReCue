// Typed IPC layer: thin wrappers over the Tauri commands plus session-event
// subscription. Keeping every `invoke` call here means the rest of the app talks
// to typed functions, not stringly-typed command names.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

import type {
  BranchList,
  CanvasNode,
  ExitPayload,
  OutputPayload,
  OverviewPanel,
  PersistedCanvases,
  SessionRecord,
  StatePayload,
  WorkingDiff,
} from "./types";

/** Native folder picker. Returns the chosen directory, or null if cancelled. */
export async function pickDirectory(): Promise<string | null> {
  const selection = await open({
    directory: true,
    multiple: false,
    title: "Choose a working directory",
  });
  return typeof selection === "string" ? selection : null;
}

export const spawnSession = (cwd: string, name?: string) =>
  invoke<SessionRecord>("spawn_session", { cwd, name: name ?? null });

/** Spawn a plain shell terminal item (#72) in `cwd` under `id` (the panel id). */
export const spawnTerminal = (cwd: string, id: string) =>
  invoke<void>("spawn_terminal", { cwd, id });

/** Start an agent in an isolated git worktree for an existing `branch` of `repo`
 * (#74) — creates the app-managed worktree if absent, reuses it otherwise. */
export const spawnWorktreeAgent = (repo: string, branch: string) =>
  invoke<SessionRecord>("spawn_worktree_agent", { repo, branch });

/** Remove the worktree at `dest` from its `parent` repo (#74); `force` ignores a
 * dirty tree (a non-forced call fails on uncommitted changes — the dirty guard). */
export const removeWorktree = (parent: string, dest: string, force: boolean) =>
  invoke<void>("remove_worktree", { parent, dest, force });

export const resumeSession = (id: string) =>
  invoke<SessionRecord>("resume_session", { id });

export const writeStdin = (id: string, data: string) =>
  invoke<void>("write_stdin", { id, data });

export const resizePty = (id: string, cols: number, rows: number) =>
  invoke<void>("resize_pty", { id, cols, rows });

export const killSession = (id: string) => invoke<void>("kill_session", { id });

/** Set (or clear, when blank) a session's custom display name (#57). */
export const renameSession = (id: string, name: string) =>
  invoke<void>("rename_session", { id, name });

export const sessionScrollback = (id: string) =>
  invoke<number[]>("session_scrollback", { id });

export const listSessions = () => invoke<SessionRecord[]>("list_sessions");

export const listRecents = () => invoke<string[]>("list_recents");

/** Drop a folder from persisted recents (the "Forget" action, #31). */
export const removeRecent = (path: string) =>
  invoke<void>("remove_recent", { path });

/** Assigned per-repo colors, path → hex (#35). */
export const listRepoColors = () =>
  invoke<Record<string, string>>("list_repo_colors");

/** Assign a repo's color identity (#35). */
export const setRepoColor = (path: string, color: string) =>
  invoke<void>("set_repo_color", { path, color });

/** Per-repo Overview panel layouts, path → panels (#38). */
export const listOverviewPanels = () =>
  invoke<Record<string, OverviewPanel[]>>("list_overview_panels");

/** Replace a repo's Overview panel layout (#38). */
export const setOverviewPanels = (path: string, panels: OverviewPanel[]) =>
  invoke<void>("set_overview_panels", { path, panels });

/** Per-repo Overview drag-reorder orders, path → ordered item keys (#43). */
export const listOverviewOrder = () =>
  invoke<Record<string, string[]>>("list_overview_order");

/** Replace a repo's Overview item order (#43). */
export const setOverviewOrder = (path: string, order: string[]) =>
  invoke<void>("set_overview_order", { path, order });

/** Legacy per-repo opened files (#45); read once to migrate into overviewPanels (#59). */
export const listOpenFiles = () =>
  invoke<Record<string, string[]>>("list_open_files");

/** The legacy single Canvas layout tree (#46); read once to migrate into #58. */
export const getCanvasLayout = () =>
  invoke<CanvasNode | null>("get_canvas_layout");

/** The multi-canvas tab state (#58); null before the first migration/write. */
export const getCanvases = () =>
  invoke<PersistedCanvases | null>("get_canvases");

/** Persist the multi-canvas tab state (#58). */
export const setCanvases = (state: PersistedCanvases) =>
  invoke<void>("set_canvases", { state });

/** The Focus inspector width in px (#51); null = use the default. */
export const getInspectorWidth = () =>
  invoke<number | null>("get_inspector_width");

/** Persist the Focus inspector width (#51). */
export const setInspectorWidth = (width: number) =>
  invoke<void>("set_inspector_width", { width });

/** Repo-relative viewable (text-ish) files in a repo (file viewer, #44). */
export const listFiles = (repo: string) =>
  invoke<string[]>("list_files", { repo });

/** Read a repo-relative text file (validated inside the repo, #40/#44). */
export const readTextFile = (repo: string, file: string) =>
  invoke<string>("read_text_file", { repo, file });

export const openInEditor = (cwd: string) =>
  invoke<void>("open_in_editor", { cwd });

export const currentBranch = (cwd: string) =>
  invoke<string>("current_branch", { cwd });

/** Branch for many repos in one round-trip (used by the sidebar). */
export const currentBranches = (paths: string[]) =>
  invoke<Record<string, string>>("current_branches", { paths });

export const workingDiff = (cwd: string) =>
  invoke<WorkingDiff>("working_diff", { cwd });

/** Local branches + current branch for a folder (new-session branch picker). */
export const listBranches = (cwd: string) =>
  invoke<BranchList>("list_branches", { cwd });

/** Check out an existing local branch in `cwd` (the first git write — #27). */
export const checkoutBranch = (cwd: string, branch: string) =>
  invoke<void>("checkout_branch", { cwd, branch });

export interface SessionEventHandlers {
  onOutput: (payload: OutputPayload) => void;
  onExited: (payload: ExitPayload) => void;
  /** Busy/idle transition for a session (#42). */
  onState: (payload: StatePayload) => void;
}

/** Subscribe to the per-session output/exit/state events. Returns an unlisten fn. */
export async function subscribeSessionEvents(
  handlers: SessionEventHandlers,
): Promise<UnlistenFn> {
  const unlistenOutput = await listen<OutputPayload>(
    "session://output",
    (event) => handlers.onOutput(event.payload),
  );
  const unlistenExited = await listen<ExitPayload>(
    "session://exited",
    (event) => handlers.onExited(event.payload),
  );
  const unlistenState = await listen<StatePayload>("session://state", (event) =>
    handlers.onState(event.payload),
  );
  return () => {
    unlistenOutput();
    unlistenExited();
    unlistenState();
  };
}
