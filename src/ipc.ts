// Typed IPC layer: thin wrappers over the Tauri commands plus session-event
// subscription. Keeping every `invoke` call here means the rest of the app talks
// to typed functions, not stringly-typed command names.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

import type {
  BranchList,
  CanvasNode,
  CanvasTemplate,
  ExitPayload,
  ForkablePayload,
  NamePayload,
  OutputPayload,
  OverviewPanel,
  PersistedCanvases,
  ScheduledSession,
  ScheduleErrorPayload,
  ScheduleFiredPayload,
  SessionRecord,
  Settings,
  SkillInfo,
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

/** Native open-file picker (#163). Returns the chosen absolute file path, or null
 * if cancelled. The dialog is the user's explicit consent to open that file; it is
 * then read/written confined to its own parent directory (see `splitPath`). */
export async function pickFile(): Promise<string | null> {
  const selection = await open({
    directory: false,
    multiple: false,
    title: "Open file",
  });
  return typeof selection === "string" ? selection : null;
}

/** Spawn a new `claude` session in `cwd`. An optional `prompt` pre-seeds it
 * (positional, like a scheduled session #93) — used by Canvas template `new-agent`
 * blocks (#118). */
export const spawnSession = (cwd: string, name?: string, prompt?: string) =>
  invoke<SessionRecord>("spawn_session", {
    cwd,
    name: name ?? null,
    prompt: prompt ?? null,
  });

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

/** Fork `sourceId`'s conversation into a new parallel `claude` session (#126) —
 * `claude --session-id <new> --resume <source> --fork-session`. Returns the new
 * persisted record (app-owned id, `forked_from = sourceId`); the source is untouched. */
export const forkSession = (sourceId: string) =>
  invoke<SessionRecord>("fork_session", { sourceId });

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

/** Add a folder to persisted recents without spawning an agent (#172 sidebar
 * background menu → "New folder…"). */
export const addRecent = (path: string) => invoke<void>("add_recent", { path });

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

/** Legacy per-repo opened files (#45); read once on boot to clear the stale map
 * (#110 — the #59 fold no longer runs). */
export const listOpenFiles = () =>
  invoke<Record<string, string[]>>("list_open_files");

/** Clear (or replace) a repo's legacy opened-file list (#110). Called once on boot
 * with `[]` to permanently empty the stale `open_files` map so a closed file viewer
 * can't be resurrected; the Rust setter drops a now-empty key. */
export const setOpenFiles = (path: string, files: string[]) =>
  invoke<void>("set_open_files", { path, files });

/** The legacy single Canvas layout tree (#46); read once to migrate into #58. */
export const getCanvasLayout = () =>
  invoke<CanvasNode | null>("get_canvas_layout");

/** The multi-canvas tab state (#58); null before the first migration/write. */
export const getCanvases = () =>
  invoke<PersistedCanvases | null>("get_canvases");

/** Persist the multi-canvas tab state (#58). The backend broadcasts
 * `canvas://changed` so other windows (#84) stay in sync. */
export const setCanvases = (state: PersistedCanvases) =>
  invoke<void>("set_canvases", { state });

/** Saved Canvas templates (#117); `null` before the first write. Persisted in its
 * own `canvas_templates` blob, separate from `canvases`. */
export const getCanvasTemplates = () =>
  invoke<CanvasTemplate[] | null>("get_canvas_templates");

/** Replace the saved Canvas templates (#117). */
export const setCanvasTemplates = (templates: CanvasTemplate[]) =>
  invoke<void>("set_canvas_templates", { templates });

/** Open (or focus, if already open) a detached window for canvas `id` (#84). */
export const openCanvasWindow = (id: string, title: string) =>
  invoke<void>("open_canvas_window", { id, title });

/** Raise the detached window for canvas `id` (#84); false if none is open. */
export const focusCanvasWindow = (id: string) =>
  invoke<boolean>("focus_canvas_window", { id });

/** Close the detached window for canvas `id` (#84) — it re-docks on close. */
export const closeCanvasWindow = (id: string) =>
  invoke<void>("close_canvas_window", { id });

/** Canvas ids that currently have a detached window (#84); fetched on startup
 * since a just-opened window may have missed the `canvas://windows` broadcast. */
export const listCanvasWindows = () => invoke<string[]>("list_canvas_windows");

/** One immediate child of a directory in the lazy file tree (#167). */
export interface DirEntry {
  /** Last path segment — the row label. */
  name: string;
  /** Repo-relative path (POSIX `/`), e.g. `src/components`. */
  path: string;
  /** An expandable folder vs a viewable file. */
  is_dir: boolean;
}

/** Immediate children of one directory (`subdir` repo-relative, empty = repo root)
 * for the **lazy** file tree (#167): folders first then viewable files, no count or
 * depth cap — the tree fetches one level per expansion, so it scales to deep / huge
 * repos. Rejects paths outside the repo. */
export const listDir = (repo: string, subdir: string) =>
  invoke<DirEntry[]>("list_dir", { repo, subdir });

/** Search a repo's viewable files for the picker (#56) — case-insensitive substring
 * over repo-relative paths, optionally restricted to an extension (e.g. `.md`),
 * result-capped server-side so it scales to very large repos. Empty `query` returns
 * the first files. */
export const searchFiles = (
  repo: string,
  query: string,
  ext?: string,
  limit?: number,
) =>
  invoke<string[]>("search_files", {
    repo,
    query,
    ext: ext ?? null,
    limit: limit ?? null,
  });

/** One content-search hit (#202): a matching line inside a file. */
export interface ContentMatch {
  /** Repo-relative path (POSIX `/`). */
  path: string;
  /** 1-based line number of the match. */
  line: number;
  /** The matching line, trimmed + clamped (windowed around the match for long
   *  lines); the UI re-finds + highlights the case-insensitive match in it. */
  snippet: string;
}

/** Result of `searchFileContents` (#202): the bounded matches + a `truncated` flag
 *  set when the global or a per-file cap was hit (so the UI can say "more not shown"). */
export interface ContentSearchResult {
  matches: ContentMatch[];
  truncated: boolean;
}

/** Search a repo's viewable files **by content** (#202) — case-insensitive substring
 *  over file lines, returning `{ path, line, snippet }` matches. Bounded server-side
 *  (per-file size cap, per-file match cap, result cap) so it scales to large repos;
 *  empty `query` returns no matches. */
export const searchFileContents = (
  repo: string,
  query: string,
  limit?: number,
) =>
  invoke<ContentSearchResult>("search_file_contents", {
    repo,
    query,
    limit: limit ?? null,
  });

/** Read a repo-relative text file (validated inside the repo, #40/#44). */
export const readTextFile = (repo: string, file: string) =>
  invoke<string>("read_text_file", { repo, file });

/** Write a repo-relative text file (validated inside the repo, #141 — backs the
 * Kanban editor; the app's first arbitrary file write). Rejects traversal. */
export const writeTextFile = (repo: string, file: string, contents: string) =>
  invoke<void>("write_text_file", { repo, file, contents });

/** Best-effort slash-invokable skills/commands for `cwd` (#114) — the
 * scheduled-prompt autocomplete. Reads project + user `.claude/{skills,commands}`,
 * project shadowing user; a missing dir just yields fewer entries (never throws). */
export const listSkills = (cwd: string) =>
  invoke<SkillInfo[]>("list_skills", { cwd });

/** Whether a repo-relative file exists inside `repo` (#118) — resolves a Canvas
 * template `open-file` block (path-validated). */
export const fileExists = (repo: string, file: string) =>
  invoke<boolean>("file_exists", { repo, file });

/** Whether `cwd` is a git work tree (#118) — gates a template `open-diff` block. */
export const isGitRepo = (cwd: string) =>
  invoke<boolean>("is_git_repo", { cwd });

export const currentBranch = (cwd: string) =>
  invoke<string>("current_branch", { cwd });

/** Branch for many repos in one round-trip (used by the sidebar). */
export const currentBranches = (paths: string[]) =>
  invoke<Record<string, string>>("current_branches", { paths });

export const workingDiff = (cwd: string) =>
  invoke<WorkingDiff>("working_diff", { cwd });

/** Two-dot branch comparison for the diff viewer (#81): git diff base target. */
export const compareBranches = (cwd: string, base: string, target: string) =>
  invoke<WorkingDiff>("compare_branches", { cwd, base, target });

/** Local + remote branches + current branch for a folder (new-session branch
 * picker). `remote` is populated by a prior `fetchRemotes` (#180). */
export const listBranches = (cwd: string) =>
  invoke<BranchList>("list_branches", { cwd });

/** Best-effort `git fetch --prune` to refresh remote-tracking refs before listing
 * remote branches in the new-session picker (#180). A network read; a failure
 * (offline / auth / no remote) rejects with a typed error the caller swallows. */
export const fetchRemotes = (cwd: string) =>
  invoke<void>("fetch_remotes", { cwd });

/** Fast-forward the current branch of `cwd` to its upstream — `git pull --ff-only`
 * (#181, sidebar repo / worktree "Pull"). Resolves with git's summary; rejects with
 * the git error (diverged / no upstream / not a repo) for an error toast. */
export const pull = (cwd: string) => invoke<string>("pull_branch", { cwd });

/** Check out an existing local branch in `cwd` (the first git write — #27). */
export const checkoutBranch = (cwd: string, branch: string) =>
  invoke<void>("checkout_branch", { cwd, branch });

/** Create + check out a new branch `name` from `base` (empty = HEAD) in `cwd` —
 * the branch-creation git write (#124). Rejects an invalid / already-existing name
 * or unknown base with a typed error (shown inline in the new-session modal). */
export const createBranch = (cwd: string, name: string, base: string) =>
  invoke<void>("create_branch", { cwd, name, base });

/** Start an agent in an isolated worktree on a **new** branch `name` (from `base`,
 * empty = HEAD) of `repo` — the ⌘⏎ create-branch-as-worktree path (#124). */
export const spawnWorktreeAgentNewBranch = (
  repo: string,
  name: string,
  base: string,
) =>
  invoke<SessionRecord>("spawn_worktree_agent_new_branch", {
    repo,
    name,
    base,
  });

/** Create a scheduled session (#93); `at` is the fire time in unix secs. Returns
 * the persisted record (the backend owns its id + created_at). When `createBranch`
 * is true, `branch` is a **new** branch created at fire time (#125) from `base`
 * (null = HEAD); otherwise `branch` is an existing branch to check out. */
export const createSchedule = (
  cwd: string,
  branch: string | null,
  name: string | null,
  prompt: string | null,
  at: number,
  createBranch = false,
  base: string | null = null,
  worktree = false,
) =>
  invoke<ScheduledSession>("create_schedule", {
    cwd,
    branch,
    name,
    prompt,
    at,
    createBranch,
    base,
    worktree,
  });

/** All pending scheduled sessions (#93). */
export const listSchedules = () => invoke<ScheduledSession[]>("list_schedules");

/** Cancel a pending scheduled session (#93). */
export const cancelSchedule = (id: string) =>
  invoke<void>("cancel_schedule", { id });

/** Update a schedule's prompt / name / fire time (#93). */
export const updateSchedule = (
  id: string,
  prompt: string | null,
  name: string | null,
  at: number,
) => invoke<void>("update_schedule", { id, prompt, name, at });

/** Application settings (#100): an opaque persisted blob the store merges with its
 * TS defaults (so an older file with no `settings` upgrades cleanly). */
export const getSettings = () =>
  invoke<Partial<Settings> | null>("get_settings");
export const setSettings = (settings: Settings) =>
  invoke<void>("set_settings", { settings });
/** Sidebar width in px (#108), persisted separately from the Settings blob so the
 * modal's draft can't clobber a mid-session drag. `null` until first set. */
export const getSidebarWidth = () => invoke<number | null>("get_sidebar_width");
export const setSidebarWidth = (width: number) =>
  invoke<void>("set_sidebar_width", { width });
/** Sidebar collapsed-to-rail flag (#168), persisted separately from Settings like
 * the width above. `null` until first set (the frontend defaults to expanded). */
export const getSidebarCollapsed = () =>
  invoke<boolean | null>("get_sidebar_collapsed");
export const setSidebarCollapsed = (collapsed: boolean) =>
  invoke<void>("set_sidebar_collapsed", { collapsed });
/** Top-level sidebar folder order (#211), persisted separately from Settings like
 * the width/collapsed flags above. Empty array until first set; the frontend
 * merges it with the live repo set (`mergeRepoOrder`) so a missing/partial order
 * just appends new repos. */
export const getRepoOrder = () => invoke<string[]>("get_repo_order");
export const setRepoOrder = (order: string[]) =>
  invoke<void>("set_repo_order", { order });
/** Last-seen app version (#190), persisted separately so boot can detect a
 * self-update and toast the new version. `null` on first launch. */
export const getLastVersion = () => invoke<string | null>("get_last_version");
export const setLastVersion = (version: string) =>
  invoke<void>("set_last_version", { version });
/** Clear the recents list (#100 Settings → Data). */
export const clearRecents = () => invoke<void>("clear_recents");
/** Reveal the app-data folder (where sessions.json lives) in Finder (#100). */
export const openDataFolder = () => invoke<void>("open_data_folder");
/** Open an http/https URL in the default browser (#109) — ⌘-click on a linkified
 * terminal URL. The backend rejects any non-http(s) scheme. */
export const openUrl = (url: string) => invoke<void>("open_url", { url });
/** Reveal a folder in Finder (#129 repo menu → "Reveal in Finder") — `open <path>`. */
export const revealPath = (path: string) =>
  invoke<void>("reveal_path", { path });
/** Reveal (select) a **file** in Finder (#171 sidebar file/Kanban row) — `open -R
 * <path>`, selecting the file rather than launching it (the file counterpart of
 * `revealPath`). */
export const revealFileInFinder = (path: string) =>
  invoke<void>("reveal_file_in_finder", { path });
/** ClaudeCue version, and claude's version (best-effort) (#100 Settings → About). */
export const appVersion = () => invoke<string>("app_version");
export const claudeVersion = () => invoke<string | null>("claude_version");

/** 5-hour Claude session usage (#154). `usedPercent` is 0–100 (clamped in Rust);
 * `resetsAt` is the raw `resets_at` (an ISO-8601 string or a stringified unix
 * timestamp). `null` when unavailable (no token, non-Pro/Max, endpoint error, or a
 * response-shape mismatch). The OAuth token is read + used entirely in Rust — it
 * never reaches JS. */
export interface UsageSnapshot {
  usedPercent: number;
  resetsAt: string | null;
}
export const claudeSessionUsage = () =>
  invoke<UsageSnapshot | null>("claude_session_usage");

export interface SessionEventHandlers {
  onOutput: (payload: OutputPayload) => void;
  onExited: (payload: ExitPayload) => void;
  /** Busy/idle transition for a session (#42). */
  onState: (payload: StatePayload) => void;
  /** claude's auto-title for a session changed (#97). */
  onName: (payload: NamePayload) => void;
  /** The session's forkability changed (#138) — gate the Fork affordance. */
  onForkable: (payload: ForkablePayload) => void;
}

/** Subscribe to the per-session output/exit/state/name/forkable events. Returns an unlisten fn. */
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
  const unlistenName = await listen<NamePayload>("session://name", (event) =>
    handlers.onName(event.payload),
  );
  const unlistenForkable = await listen<ForkablePayload>(
    "session://forkable",
    (event) => handlers.onForkable(event.payload),
  );
  return () => {
    unlistenOutput();
    unlistenExited();
    unlistenState();
    unlistenName();
    unlistenForkable();
  };
}

export interface CanvasEventHandlers {
  /** The canvas tab set changed in some window (#84) — re-apply the new list. */
  onCanvasesChanged: (state: PersistedCanvases) => void;
  /** The set of detached canvas windows changed (#84). */
  onWindowsChanged: (detachedCanvasIds: string[]) => void;
}

/** Subscribe to cross-window canvas sync events (#84): `canvas://changed`
 * (tab/layout edits in any window) and `canvas://windows` (a detached window
 * opened/closed). Returns an unlisten fn. */
export async function subscribeCanvasEvents(
  handlers: CanvasEventHandlers,
): Promise<UnlistenFn> {
  const unlistenChanged = await listen<PersistedCanvases>(
    "canvas://changed",
    (event) => handlers.onCanvasesChanged(event.payload),
  );
  const unlistenWindows = await listen<{ detached: string[] }>(
    "canvas://windows",
    (event) => handlers.onWindowsChanged(event.payload.detached),
  );
  return () => {
    unlistenChanged();
    unlistenWindows();
  };
}

export interface ScheduleEventHandlers {
  /** A schedule fired into a live session (#93). */
  onFired: (payload: ScheduleFiredPayload) => void;
  /** A schedule's spawn failed (#93) — it's dropped, not retried. */
  onError: (payload: ScheduleErrorPayload) => void;
}

/** Subscribe to scheduled-session events (#93): `schedule://fired` (a schedule
 * became a live agent) and `schedule://error`. Returns an unlisten fn. */
export async function subscribeScheduleEvents(
  handlers: ScheduleEventHandlers,
): Promise<UnlistenFn> {
  const unlistenFired = await listen<ScheduleFiredPayload>(
    "schedule://fired",
    (event) => handlers.onFired(event.payload),
  );
  const unlistenError = await listen<ScheduleErrorPayload>(
    "schedule://error",
    (event) => handlers.onError(event.payload),
  );
  return () => {
    unlistenFired();
    unlistenError();
  };
}
