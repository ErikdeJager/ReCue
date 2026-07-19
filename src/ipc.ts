// Typed IPC layer: thin wrappers over the Tauri commands plus session-event
// subscription. Keeping every `invoke` call here means the rest of the app talks
// to typed functions, not stringly-typed command names.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  readText as readClipboardText,
  writeText as writeClipboardText,
} from "@tauri-apps/plugin-clipboard-manager";
import { open, save } from "@tauri-apps/plugin-dialog";

import type {
  AgentInfo,
  AheadBehind,
  AppWindowInit,
  BootState,
  BranchList,
  CanvasNode,
  CanvasTemplate,
  CommitInfo,
  ContainerBuildingPayload,
  CwdPayload,
  DiffLineCounts,
  DiffSeenMap,
  DiffSeenPatch,
  DockerStatus,
  EditorInfo,
  ExitPayload,
  FileClaim,
  FileDiff,
  FileStatusEntry,
  ForgottenPayload,
  ForkablePayload,
  GridPayload,
  NamePayload,
  OutputPayload,
  OverviewPanel,
  PersistedCanvases,
  PersistedCanvasesPatch,
  RecurringErrorPayload,
  RecurringFiredPayload,
  RecurringSession,
  RendererReport,
  RepoWorktree,
  ScheduledSession,
  ScheduleErrorPayload,
  ScheduleFiredPayload,
  ScrollbackReply,
  SessionRecord,
  Settings,
  SizePayload,
  SkillInfo,
  StatePayload,
  TurnPayload,
  WorkingDiff,
  WorktreeCleanup,
  WorktreeKeptPayload,
} from "./types";
import type { Theme } from "./theme";
// windowContext is import-free, so this creates no cycle. WINDOW_LABEL scopes
// the two targeted listens below (task 440).
import { WINDOW_LABEL } from "./windowContext";

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
 * then read/written confined to its own parent directory (see `splitPath`). An
 * optional `extensions` filter (without the dot, e.g. `["json"]`) narrows the picker
 * to those types (#275 — importing a template). */
export async function pickFile(opts?: {
  title?: string;
  extensions?: string[];
}): Promise<string | null> {
  const selection = await open({
    directory: false,
    multiple: false,
    title: opts?.title ?? "Open file",
    filters: opts?.extensions
      ? [{ name: "Files", extensions: opts.extensions }]
      : undefined,
  });
  return typeof selection === "string" ? selection : null;
}

/** Native save-file dialog (#275 — exporting a template). Returns the chosen
 * absolute path (the user may rename / relocate), or null if cancelled. The file is
 * then written confined to its own parent directory (see `splitPath`), the dialog
 * being the user's explicit consent. Cross-platform: the path is reassembled by the
 * OS dialog, and `splitPath` handles `/` or `\`. */
export async function saveFileDialog(
  defaultName: string,
  extensions: string[] = ["json"],
): Promise<string | null> {
  const selection = await save({
    title: "Export template",
    defaultPath: defaultName,
    filters: [{ name: "JSON", extensions }],
  });
  return typeof selection === "string" ? selection : null;
}

/** Spawn a new `claude` session in `cwd`. An optional `prompt` pre-seeds it
 * (positional, like a scheduled session #93) — used by Canvas template `new-agent`
 * blocks (#118). `container` opts the session into a docker dev-container (the
 * modal toggle); omitted/false ⇒ a plain host PTY. `worktreeParent` nests the
 * session under that parent repo when spawning INTO a detected worktree ReCue
 * didn't create (no prior session exists there for the #331 auto-derive). */
export const spawnSession = (
  cwd: string,
  name?: string,
  prompt?: string,
  agent?: string,
  container?: boolean,
  worktreeParent?: string,
) =>
  invoke<SessionRecord>("spawn_session", {
    cwd,
    name: name ?? null,
    agent: agent ?? null,
    prompt: prompt ?? null,
    container: container ?? null,
    worktreeParent: worktreeParent ?? null,
  });

/** Spawn a plain shell terminal item (#72) in `cwd` under `id` (the panel id). */
export const spawnTerminal = (cwd: string, id: string) =>
  invoke<void>("spawn_terminal", { cwd, id });

/** Start an agent in an isolated git worktree for an existing `branch` of `repo`
 * (#74) — creates the app-managed worktree if absent, reuses it otherwise. */
export const spawnWorktreeAgent = (
  repo: string,
  branch: string,
  agent?: string,
  container?: boolean,
) =>
  invoke<SessionRecord>("spawn_worktree_agent", {
    repo,
    branch,
    agent: agent ?? null,
    container: container ?? null,
  });

/** Remove the worktree at `dest` from its `parent` repo (#74); `force` ignores a
 * dirty tree (a non-forced call fails on uncommitted changes — the dirty guard).
 * Still the **forced** path (`forgetRepo`); ref-counted auto-cleanup goes through
 * `cleanupWorktreeIfEmpty` (task 431). */
export const removeWorktree = (parent: string, dest: string, force: boolean) =>
  invoke<void>("remove_worktree", { parent, dest, force });

/** Ref-counted worktree auto-delete (task 431): the backend checks the persisted
 * items pointing at `dest` and removes it (non-forced — git refusing a dirty tree
 * is the #74 guard) only when unreferenced, under one app-wide mutex so N windows
 * (and the Rust clean-exit path) can never double-run `git worktree remove`. */
export const cleanupWorktreeIfEmpty = (parent: string, dest: string) =>
  invoke<WorktreeCleanup>("cleanup_worktree_if_empty", { parent, dest });

/** Permanently delete the worktree folder at `dest` from disk — the explicit,
 * always-confirmed user path (works on ANY listed worktree of `parent`, unlike
 * the automation-guarded `removeWorktree`). The branch is kept. */
export const deleteWorktree = (parent: string, dest: string) =>
  invoke<void>("delete_worktree", { parent, dest });

export const resumeSession = (id: string) =>
  invoke<SessionRecord>("resume_session", { id });

/** Fork `sourceId`'s conversation into a new parallel `claude` session (#126) —
 * `claude --session-id <new> --resume <source> --fork-session`. Returns the new
 * persisted record (app-owned id, `forked_from = sourceId`); the source is untouched. */
export const forkSession = (sourceId: string) =>
  invoke<SessionRecord>("fork_session", { sourceId });

export const writeStdin = (id: string, data: string) =>
  invoke<void>("write_stdin", { id, data });

/** Register (or upsert) this window's terminal view of a session (task 427),
 * proposing the grid its slot could show. Returns the arbitrated effective grid
 * — the component-wise min over all attached views — which the host must adopt
 * BEFORE replaying scrollback. The backend runs this synchronously (#353), so
 * call-order = apply-order. `windowLabel` → Rust `window_label` via Tauri's
 * automatic case conversion (the `createBranch`/`firstFireAt` precedent). */
export const attachTerminal = (
  id: string,
  windowLabel: string,
  cols: number,
  rows: number,
) => invoke<GridPayload>("attach_terminal", { id, windowLabel, cols, rows });

/** Remove this window's terminal view of a session (task 427): its proposal
 * stops clamping the arbitrated PTY grid. Synchronous backend (#353); a detach
 * of an absent view is a no-op. */
export const detachTerminal = (id: string, windowLabel: string) =>
  invoke<void>("detach_terminal", { id, windowLabel });

/** Update an already-attached view's desired grid (task 427) — the multi-window
 * analogue of the legacy PTY-resize ResizeObserver cadence. A proposal for a
 * never-attached/purged view is a backend no-op. Synchronous backend (#353). */
export const proposeTerminalSize = (
  id: string,
  windowLabel: string,
  cols: number,
  rows: number,
) => invoke<void>("propose_terminal_size", { id, windowLabel, cols, rows });

/** Register this window as an output subscriber for a session (task 440):
 * `session://output` / `session://size` are delivered only to subscriber
 * windows. Called at host CREATION (terminalPool.createHost), not at mount —
 * a parked host keeps its byte stream. `windowLabel` → Rust `window_label`
 * via Tauri's automatic case conversion (the `attachTerminal` precedent). */
export const subscribeOutput = (id: string, windowLabel: string) =>
  invoke<void>("subscribe_session_output", { id, windowLabel });

/** Remove this window from a session's output subscribers (task 440). Called
 * at host DISPOSAL (never at park/unmount); a closed window is swept by the
 * backend's Destroyed purge instead. */
export const unsubscribeOutput = (id: string, windowLabel: string) =>
  invoke<void>("unsubscribe_session_output", { id, windowLabel });

export const killSession = (id: string) => invoke<void>("kill_session", { id });

/** Set (or clear, when blank) a session's custom display name (#57). */
export const renameSession = (id: string, name: string) =>
  invoke<void>("rename_session", { id, name });

/** Set a session's per-agent auto-continue opt-out (#297): `disabled = true` excludes
 * this one Claude agent from the #296 auto-continue fire step. */
export const setSessionAutoContinue = (id: string, disabled: boolean) =>
  invoke<void>("set_session_auto_continue", { id, disabled });

/** Set a session's per-agent "watch" flag (#336): `watch = true` fires a native OS
 * notification when this agent finishes a turn / needs input (its busy→idle edge). */
export const setSessionWatch = (id: string, watch: boolean) =>
  invoke<void>("set_session_watch", { id, watch });

export const sessionScrollback = (id: string) =>
  invoke<ScrollbackReply>("session_scrollback", { id });

/** Everything the boot needs, in **one** round-trip (#352) — sessions, recents, repo
 * colors, Overview panels/order, legacy open files, canvas layout/tabs/templates,
 * settings, sidebar width/collapsed, folder order, diff-seen, schedules, recurrings,
 * last + running app version, platform, Windows build. The
 * individual commands below all remain (other call sites use them); this batches the
 * ~21 boot reads that used to run as ~22 sequential waves, each an evaluate-JS hop on
 * the webview main thread (costliest on Linux/WebKitGTK, #346). */
export const bootState = () => invoke<BootState>("boot_state");

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

/** Persist a multi-canvas patch (#58/task 429): send **only the field(s) the
 * action changed** — the backend merges field-wise over the persisted blob under
 * the Store mutex (a tab switch is `{activeId}` only, a layout edit `{canvases}`
 * only) and broadcasts `canvas://changed` with the merged blob so other windows
 * (#84) stay in sync. */
export const setCanvases = (state: PersistedCanvasesPatch) =>
  invoke<void>("set_canvases", { state });

/** Saved Canvas templates (#117); `null` before the first write. Persisted in its
 * own `canvas_templates` blob, separate from `canvases`. */
export const getCanvasTemplates = () =>
  invoke<CanvasTemplate[] | null>("get_canvas_templates");

/** Replace the saved Canvas templates (#117). */
export const setCanvasTemplates = (templates: CanvasTemplate[]) =>
  invoke<void>("set_canvas_templates", { templates });

/** Open an additional FULL app window (task 434) — label `app-<uuid>`, the
 * complete shell with window-local view/selection/tab/filter state. The init
 * presets ride the URL (`repo` → the Overview repo filter; `canvas` → boot into
 * Canvas on that tab when it exists). Resolves to the new window's id. Since
 * task 437 this is also the Canvas pop-out / tear-off target (`{ canvas: id }`). */
export const openAppWindow = (init: AppWindowInit = {}) =>
  invoke<string>("open_app_window", { init });

/** Raise an existing full app window by id (task 434); false if none is open. */
export const focusAppWindow = (id: string) =>
  invoke<boolean>("focus_app_window", { id });

/** Show + focus THIS window once the frontend has painted its first themed frame
 * (#348). Windows are created hidden so the OS never paints a white / wrong-theme
 * rectangle; Rust also shows any still-hidden window after 2 s as a safety net. */
export const revealWindow = () => invoke<void>("reveal_window");

/** Re-apply the themed native window background to every open window after a runtime
 * theme switch (#348), so a resize/repaint gap never exposes the old theme's color. */
export const setThemeBackground = (theme: Theme) =>
  invoke<void>("set_theme_background", { theme });

/** One immediate child of a directory in the lazy file tree (#167). */
export interface DirEntry {
  /** Last path segment — the row label. */
  name: string;
  /** Repo-relative path (POSIX `/`), e.g. `src/components`. */
  path: string;
  /** An expandable folder vs a viewable file. */
  is_dir: boolean;
  /** The folder is a linked git worktree root (its `.git` is a pointer file into
   * `.git/worktrees/`) — the FileTree renders it in place but gates its contents
   * behind "Show worktree contents…". Absent (never `false`) for ordinary rows:
   * the backend serde-skips the flag when unset. */
  worktree?: boolean;
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

/** One live-terminal-output search hit (#337): the session id, the 1-based line number
 *  of the match in its (ANSI-stripped) scrollback, and the clamped snippet. Mirrors
 *  `ContentMatch`. */
export interface SessionOutputMatch {
  id: string;
  line: number;
  snippet: string;
}

/** Search every live session's retained scrollback by content (#337) — the global
 *  search modal's best-effort terminal-output source. Bounded server-side (a few lines
 *  per session, `limit` total, default 50) and ANSI-stripped; never fails (blank query /
 *  no matches → empty). Only the in-memory scrollback tail is searched. */
export const searchSessionOutput = (query: string, limit?: number) =>
  invoke<SessionOutputMatch[]>("search_session_output", {
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

/** Move an external OS file/dir (`source`, an absolute OS-native path the user
 * dragged in) into the repo dir `destSubdir` (#253). The destination is confined to
 * the repo; the source is the user's drag (explicit consent, not confined). Returns
 * the moved item's new repo-relative path; rejects a collision / out-of-repo dest. */
export const moveIntoRepo = (
  repo: string,
  destSubdir: string,
  source: string,
) => invoke<string>("move_into_repo", { repo, destSubdir, source });

/** Create a new (empty) directory at repo-relative `path` (#267). Validated inside
 * the repo (the parent must exist + be in-repo); refuses to clobber an existing item
 * and (on Windows) a reserved device name. */
export const createDir = (repo: string, path: string) =>
  invoke<void>("create_dir", { repo, path });

/** Delete the repo-relative file or directory at `path` (#267 — recursive for a
 * directory). A genuinely destructive write: validated strictly inside the repo,
 * refuses the repo root, and never follows a symlink. */
export const deletePath = (repo: string, path: string) =>
  invoke<void>("delete_path", { repo, path });

/** Rename (or move within the repo) the repo-relative file/folder `from` to `to`
 * (#291). Both endpoints are confined to the repo (source inside + not the root,
 * destination's parent inside); the new leaf name is validated (no separators, `.`/
 * `..`, or — on Windows — a reserved device name) and a collision is refused. Returns
 * the destination's repo-relative POSIX path. */
export const renamePath = (repo: string, from: string, to: string) =>
  invoke<string>("rename_path", { repo, from, to });

/** Append the repo-relative file/folder `path` to the repo-root `.gitignore` (#312).
 * The item is confined to the repo; the pattern is anchored (`/path` for a file,
 * `/path/` for a directory), `.gitignore` is created if absent, and a line already
 * present is skipped. Resolves `true` when a line was appended, `false` when it was
 * already ignored (no write). */
export const addToGitignore = (repo: string, path: string) =>
  invoke<boolean>("add_to_gitignore", { repo, path });

/** Best-effort slash-invokable skills/commands for `cwd` (#114) — the
 * scheduled-prompt autocomplete. Reads project + user `.claude/{skills,commands}`,
 * project shadowing user; a missing dir just yields fewer entries (never throws). */
export const listSkills = (cwd: string) =>
  invoke<SkillInfo[]>("list_skills", { cwd });

/** Whether a repo-relative file exists inside `repo` (#118) — resolves a Canvas
 * template `open-file` block (path-validated). */
export const fileExists = (repo: string, file: string) =>
  invoke<boolean>("file_exists", { repo, file });

/** Whether `path` names an existing directory — used at startup to prune sidebar
 * folders that were deleted off-disk (absolute-path, unlike repo-relative `fileExists`). */
export const dirExists = (path: string) =>
  invoke<boolean>("dir_exists", { path });

/** Whether `cwd` is a git work tree (#118) — gates a template `open-diff` block. */
export const isGitRepo = (cwd: string) =>
  invoke<boolean>("is_git_repo", { cwd });

export const currentBranch = (cwd: string) =>
  invoke<string>("current_branch", { cwd });

/** Branch for many repos in one round-trip (used by the sidebar). */
export const currentBranches = (paths: string[]) =>
  invoke<Record<string, string>>("current_branches", { paths });

/**
 * GitHub web URL (`https://github.com/owner/repo`) for many repos in one round-trip
 * (#327). Only paths whose remote points at github.com are present in the map, so the
 * sidebar reads presence as "show the View-on-GitHub item".
 */
export const githubWebUrls = (paths: string[]) =>
  invoke<Record<string, string>>("github_web_urls", { paths });

/** Summed added/removed line counts vs `HEAD` for many working trees in one
 * round-trip (#335) — the sidebar's per-agent `+A`/`−D` badge source. Mirrors
 * `currentBranches`; each entry is fail-open (non-git / no-HEAD / error → `{0,0}`). */
export const diffLineCounts = (paths: string[]) =>
  invoke<Record<string, DiffLineCounts>>("diff_line_counts", { paths });

/** Ahead/behind commit counts vs each folder's upstream for many folders in one
 * round-trip (#338) — the sidebar's `↑A ↓B` branch indicator source. Computed locally
 * against the already-fetched remote-tracking ref (no network `git fetch`). Only folders
 * with an upstream are present in the map (no-upstream / non-git are omitted). */
export const branchAheadBehind = (paths: string[]) =>
  invoke<Record<string, AheadBehind>>("branch_ahead_behind", { paths });

/** Every checkout of each repo per `git worktree list` (the agent-created-worktree
 * detection read), stamped backend-side (`is_main` / `managed` / `exists`). Mirrors
 * `currentBranches`; **fail-open per repo**: a non-git / failed repo is OMITTED from
 * the map (keep prior state), while a present-but-empty list is authoritative. */
export const listRepoWorktrees = (paths: string[]) =>
  invoke<Record<string, RepoWorktree[]>>("list_repo_worktrees", { paths });

export const workingDiff = (cwd: string) =>
  invoke<WorkingDiff>("working_diff", { cwd });

/** Lightweight per-file git status for the FileTree coloring (#252) — one
 * `git status --porcelain` per repo (no hunk parse), repo-relative POSIX paths.
 * Non-git / clean folders return an empty list (fail-open); bounded server-side. */
export const fileStatuses = (repo: string) =>
  invoke<FileStatusEntry[]>("file_statuses", { repo });

/** Uncommitted working-tree diff for a single file vs `HEAD` (#324) — the source for
 * the FileViewer code view's per-line git-diff gutter. Returns `null` for a clean /
 * non-git / no-HEAD file (fail-open, no gutter); an untracked file yields an
 * all-added diff. */
export const fileDiff = (repo: string, file: string) =>
  invoke<FileDiff | null>("file_diff", { repo, file });

/** Two-dot branch comparison for the diff viewer (#81): git diff base target. */
export const compareBranches = (cwd: string, base: string, target: string) =>
  invoke<WorkingDiff>("compare_branches", { cwd, base, target });

/** Recent commits on a folder's HEAD for the diff viewer's "Commits" source (#230).
 * Bounded backend-side (the latest ~100); non-git folders return an empty list. */
export const listCommits = (cwd: string, limit?: number) =>
  invoke<CommitInfo[]>("list_commits", { cwd, limit });

/** The diff a single commit introduced (#230): `git show <sha>` → the same
 * `WorkingDiff` shape the diff body renders. Rejects an empty/invalid sha. */
export const commitDiff = (cwd: string, sha: string) =>
  invoke<WorkingDiff>("commit_diff", { cwd, sha });

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

/** Clone the git repo at `url` into `<parent>/<repo-name>`, ensure `main` is checked
 * out (creating it if the repo has none), register the folder in recents, and resolve
 * with the absolute destination path (#295). Runs **off the main thread** (#299) so the
 * clone doesn't freeze the UI while the sidebar shows a phantom folder + progress bar.
 * Rejects with a typed git error (bad URL / auth / network / existing dest), which the
 * store surfaces as an error toast (the modal closes immediately, #299). */
export const cloneRepo = (url: string, parent: string) =>
  invoke<string>("clone_repo", { url, parent });

/** Start an agent in an isolated worktree on a **new** branch `name` (from `base`,
 * empty = HEAD) of `repo` — the ⌘⏎ create-branch-as-worktree path (#124). */
export const spawnWorktreeAgentNewBranch = (
  repo: string,
  name: string,
  base: string,
  agent?: string,
  container?: boolean,
) =>
  invoke<SessionRecord>("spawn_worktree_agent_new_branch", {
    repo,
    name,
    base,
    agent: agent ?? null,
    container: container ?? null,
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
  agent?: string,
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
    agent: agent ?? null,
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

/** Fire a pending scheduled session **immediately** (#269) — the "Start now" button.
 * The backend takes the schedule out, spawns its agent now (seeded with the prompt,
 * in the right folder/worktree), and emits `schedule://fired` (same scheduled→live
 * transition as a natural fire). On a spawn failure the schedule is kept intact and
 * the command rejects so the UI can toast. */
export const fireScheduleNow = (id: string) =>
  invoke<void>("fire_schedule_now", { id });

/** Create a recurring session (#294); `firstFireAt` is the first-run time in unix
 * secs (now = immediate), `intervalSecs` the repeat cadence (floored at 60 backend).
 * When `createBranch` is true, `branch` is a **new** branch created at create time
 * from `base` (null = HEAD); otherwise `branch` is an existing branch to check out. */
export const createRecurring = (
  cwd: string,
  branch: string | null,
  name: string | null,
  prompt: string | null,
  intervalSecs: number,
  firstFireAt: number,
  createBranch = false,
  base: string | null = null,
  worktree = false,
  agent?: string,
) =>
  invoke<RecurringSession>("create_recurring", {
    cwd,
    branch,
    name,
    prompt,
    intervalSecs,
    firstFireAt,
    createBranch,
    base,
    worktree,
    agent: agent ?? null,
  });

/** All active recurring sessions (#294). */
export const listRecurrings = () =>
  invoke<RecurringSession[]>("list_recurrings");

/** Cancel a recurring session (#294): kills its current child (if any) + forgets the
 * record. The worktree cleanup (ref-counted) is done store-side. */
export const cancelRecurring = (id: string) =>
  invoke<void>("cancel_recurring", { id });

/** Update a recurring session's prompt / name / interval / next-run time (#294). */
export const updateRecurring = (
  id: string,
  prompt: string | null,
  name: string | null,
  intervalSecs: number,
  nextFireAt: number,
) =>
  invoke<void>("update_recurring", {
    id,
    prompt,
    name,
    intervalSecs,
    nextFireAt,
  });

/** Application settings (#100): an opaque persisted blob the store merges with its
 * TS defaults (so an older file with no `settings` upgrades cleanly). The write is
 * a **patch** (task 429): only the changed top-level keys travel, and the backend
 * merges them shallowly over the persisted blob under the Store mutex — so a
 * window holding a stale copy can't revert another window's save. */
export const getSettings = () =>
  invoke<Partial<Settings> | null>("get_settings");
export const setSettings = (settings: Partial<Settings>) =>
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
/** Per-repo diff "seen" review markers (#278): a content digest per reviewed file,
 * `{ [repoPath]: { [filePath]: digest } }`, persisted separately from the Settings
 * blob (like the sidebar width / repo order) so a Settings draft can't clobber it.
 * `null` until first written. The write is a **patch** (task 429): per-file deltas
 * with `null` tombstones, merged per key server-side under the Store mutex — the
 * whole map is never sent, so a stale window can't drop foreign marks. */
export const getDiffSeen = () => invoke<DiffSeenMap | null>("get_diff_seen");
export const setDiffSeen = (seen: DiffSeenPatch) =>
  invoke<void>("set_diff_seen", { seen });
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

/** Read the OS clipboard's text (#220, terminal paste on Windows) via the
 * clipboard-manager plugin — reliable under WebView2, unlike `navigator.clipboard`.
 * Returns null when the clipboard holds no text or the read fails. */
export async function clipboardReadText(): Promise<string | null> {
  try {
    const text = await readClipboardText();
    return text && text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

/** Write `text` to the OS clipboard (#282) via the clipboard-manager plugin — the
 * write counterpart of `clipboardReadText` (#220). Reliable under WebView2, where
 * `navigator.clipboard.writeText` can reject with "Document is not focused" for a copy
 * triggered from a context menu / hover button (a stricter focus requirement than
 * WKWebView's). Writes to the native OS clipboard, so no document focus is needed.
 * Rejects on failure so the caller can toast. */
export async function clipboardWriteText(text: string): Promise<void> {
  await writeClipboardText(text);
}

/** Save the OS clipboard **image** (#220) to a temp PNG and return its absolute path,
 * or null when the clipboard holds no image / the save fails. The terminal paste
 * handler pastes the path into `claude`, which attaches the referenced image. */
export async function saveClipboardImage(): Promise<string | null> {
  try {
    return await invoke<string>("save_clipboard_image");
  } catch {
    return null;
  }
}
/** Reveal a folder in Finder (#129 repo menu → "Reveal in Finder") — `open <path>`. */
export const revealPath = (path: string) =>
  invoke<void>("reveal_path", { path });
/** Reveal (select) a **file** in Finder (#171 sidebar file/Kanban row) — `open -R
 * <path>`, selecting the file rather than launching it (the file counterpart of
 * `revealPath`). */
export const revealFileInFinder = (path: string) =>
  invoke<void>("reveal_file_in_finder", { path });
/** ReCue version, and claude's version (best-effort) (#100 Settings → About). */
export const appVersion = () => invoke<string>("app_version");
export const claudeVersion = () => invoke<string | null>("claude_version");
/** The host OS family (#143) — "windows" / "macos" / "linux" — for OS-appropriate
 * display labels (Finder vs Explorer, ⌘ vs Ctrl). */
export const platform = () => invoke<string>("platform");
/** How this install is managed (#361) — "bundle" | "appimage" | "system". A "system"
 * (distro-packaged) Linux install is owned by the package manager, so the in-app
 * updater is disabled for it. Read once at boot; see `selfUpdates` in platform.ts. */
export const installKind = () => invoke<string>("install_kind");
/** The Windows build number (e.g. 22631), or 0 on non-Windows. Used to configure
 * xterm.js's ConPTY handling (`windowsPty.buildNumber`); read once at boot. */
export const windowsBuild = () => invoke<number>("windows_build");
/** Catalog metadata + live presence/version for an agent (#141/#142) — drives the
 * generalized missing-binary screen (`version: null` ⇒ the CLI isn't installed). */
export const agentInfo = (agent: string) =>
  invoke<AgentInfo>("agent_info", { agent });
/** Detect which catalog editors are installed ("Open in editor") — existence-based
 * (PATH / Toolbox scripts / app bundles / known install dirs), never `--version`.
 * Feeds the first-use picker + the Settings → Editor annotations. */
export const detectEditors = () => invoke<EditorInfo[]>("detect_editors");
/** Open the folder `path` in `editor` (a catalog id, or `"custom"` → the user's
 * `customEditorCommand`), detached. Rejects with a typed `SessionError` — a
 * `BinaryNotFound` kind means the choice is stale and the picker should reopen. */
export const openInEditor = (path: string, editor: string) =>
  invoke<void>("open_in_editor", { path, editor });

/** The boot rendering decision (#357) for Settings → Rendering: the DMA-BUF outcome, its
 * reason + evidence, and what decided it. `null` on macOS/Windows — nothing is decided
 * there, so the Rendering section is hidden. Read-only; safe to call any time. */
export const rendererDiagnostics = () =>
  invoke<RendererReport | null>("renderer_diagnostics");

/** 5-hour Claude session usage (#154). `usedPercent` is 0–100 (clamped in Rust);
 * `resetsAt` is the raw `resets_at` (an ISO-8601 string or a stringified unix
 * timestamp). `null` when unavailable (no token, non-Pro/Max, endpoint error, or a
 * response-shape mismatch). The OAuth token is read + used entirely in Rust — it
 * never reaches JS. Since task 430 **Rust owns the single per-app usage poll**
 * (the auto-continue engine; the endpoint 429s below ~180s, so there must never be
 * two pollers): snapshots arrive via `usage://changed` + the boot
 * `autoContinueSnapshot`, never a frontend fetch. */
export interface UsageSnapshot {
  usedPercent: number;
  resetsAt: string | null;
  /** Every usage window the API reports (#370) — five-hour, weekly, … — adaptive, so
   * a new metric surfaces with no code change. The scalars above keep the five-hour
   * window verbatim for the existing bar; `buckets` is purely additive. */
  buckets: UsageBucket[];
}
/** One usage window (#370): a raw API `key` (`five_hour`, `seven_day`, …), its clamped
 * percentage, and its own raw `resetsAt`. The frontend humanizes + orders it. */
export interface UsageBucket {
  key: string;
  usedPercent: number;
  resetsAt: string | null;
}

/** The auto-continue machine state (#296) mirrored from the Rust engine (task 430):
 * `armed` = the limit was detected and the engine is waiting for the five-hour
 * reset; `sessionIds` = the live Claude sessions captured at arm time (to be
 * nudged on reset). Transient — never persisted; carried by
 * `autocontinue://changed` + the boot `autoContinueSnapshot`. */
export interface AutoContinueStatePayload {
  armed: boolean;
  resetsAtMs: number | null;
  sessionIds: string[];
}

export interface UsageEventHandlers {
  /** The Rust engine's usage snapshot changed (`usage://changed`); `null` =
   * unavailable (gated off / fetch failed) — the bar hides. */
  onUsageChanged: (snap: UsageSnapshot | null) => void;
  /** The auto-continue machine state changed (`autocontinue://changed`). */
  onAutoContinueChanged: (state: AutoContinueStatePayload) => void;
}

/** Subscribe to the Rust auto-continue engine's state events (task 430):
 * `usage://changed` (the single per-app usage poll's snapshot) and
 * `autocontinue://changed` (the #296 machine state). The task-428 rule applies —
 * the store applies mirror only, never call back into a persist path. Returns an
 * unlisten fn. Registered as one wave (#352). */
export async function subscribeUsageEvents(
  handlers: UsageEventHandlers,
): Promise<UnlistenFn> {
  const [unlistenUsage, unlistenAutoContinue] = await Promise.all([
    listen<UsageSnapshot | null>("usage://changed", (event) =>
      handlers.onUsageChanged(event.payload),
    ),
    listen<AutoContinueStatePayload>("autocontinue://changed", (event) =>
      handlers.onAutoContinueChanged(event.payload),
    ),
  ]);
  return () => {
    unlistenUsage();
    unlistenAutoContinue();
  };
}

/** The boot-time seed for the usage / auto-continue mirrors (task 430): the Rust
 * engine's shared cache, which is written BEFORE each emit — so a
 * subscribe-then-fetch boot sequence can never regress to an older value than an
 * event it already saw. */
export const autoContinueSnapshot = () =>
  invoke<{
    usage: UsageSnapshot | null;
    autoContinue: AutoContinueStatePayload;
  }>("auto_continue_snapshot");

export interface SessionEventHandlers {
  onOutput: (payload: OutputPayload) => void;
  onExited: (payload: ExitPayload) => void;
  /** Busy/idle transition for a session (#42). */
  onState: (payload: StatePayload) => void;
  /** Authoritative turn-complete signal from an agent's own hook (turn-complete hook
   * bridge): drives the Attention queue's immediate admission. Optional so a window
   * that doesn't track the queue can ignore it. */
  onTurn?: (payload: TurnPayload) => void;
  /** claude's auto-title for a session changed (#97). */
  onName: (payload: NamePayload) => void;
  /** The session's forkability changed (#138) — gate the Fork affordance. */
  onForkable: (payload: ForkablePayload) => void;
  /** A clean #63 exit Rust already forgot (task 431) — drop local state; the
   * targeted window toasts. */
  onForgotten: (payload: ForgottenPayload) => void;
  /** The exit-driven worktree cleanup kept a dirty worktree (task 431/#74) — the
   * targeted window warns. */
  onWorktreeKept: (payload: WorktreeKeptPayload) => void;
  /** The session's working directory moved (EnterWorktree / /cd) — the
   * agent-relocation signal for the sidebar's worktree grouping. Optional: a
   * window that doesn't render the sidebar can ignore it. */
  onCwd?: (payload: CwdPayload) => void;
}

/** Subscribe to the per-session output/exit/state/name/forkable/forgotten/cwd
 * events. Returns an unlisten fn. Each `listen()` is its own `invoke`
 * (`plugin:event|listen`), so they register as **one parallel wave** rather than
 * eight sequential round-trips (#352). */
export async function subscribeSessionEvents(
  handlers: SessionEventHandlers,
): Promise<UnlistenFn> {
  const [
    unlistenOutput,
    unlistenExited,
    unlistenState,
    unlistenTurn,
    unlistenName,
    unlistenForkable,
    unlistenForgotten,
    unlistenWorktreeKept,
    unlistenCwd,
  ] = await Promise.all([
    // Label-scoped (task 440): the backend emit_filters session://output to the
    // windows holding a live host for the session, but a listener registered
    // with the DEFAULT target (`Any`) BYPASSES emit_filter backend-side
    // (tauri's match_any_or_filter) — so this scope is what makes the
    // targeting effective. A scoped listener still receives plain global
    // emits, so the other listens below stay default deliberately (their
    // emits are app-global lifecycle broadcasts).
    listen<OutputPayload>(
      "session://output",
      (event) => handlers.onOutput(event.payload),
      { target: WINDOW_LABEL },
    ),
    listen<ExitPayload>("session://exited", (event) =>
      handlers.onExited(event.payload),
    ),
    listen<StatePayload>("session://state", (event) =>
      handlers.onState(event.payload),
    ),
    // Default target (app-global, like session://state): every window's Attention
    // queue reacts to a turn-complete hook (turn-complete hook bridge).
    listen<TurnPayload>("session://turn", (event) =>
      handlers.onTurn?.(event.payload),
    ),
    listen<NamePayload>("session://name", (event) =>
      handlers.onName(event.payload),
    ),
    listen<ForkablePayload>("session://forkable", (event) =>
      handlers.onForkable(event.payload),
    ),
    listen<ForgottenPayload>("session://forgotten", (event) =>
      handlers.onForgotten(event.payload),
    ),
    listen<WorktreeKeptPayload>("worktree://kept", (event) =>
      handlers.onWorktreeKept(event.payload),
    ),
    listen<CwdPayload>("session://cwd", (event) =>
      handlers.onCwd?.(event.payload),
    ),
  ]);
  return () => {
    unlistenOutput();
    unlistenExited();
    unlistenState();
    unlistenTurn();
    unlistenName();
    unlistenForkable();
    unlistenForgotten();
    unlistenWorktreeKept();
    unlistenCwd();
  };
}

/** Subscribe to `session://size` (task 427) — consumed pool-level by
 * terminalPool, never by the store: grid geometry is terminal-plumbing like
 * output bytes (the outputBus philosophy), and writing it to React state would
 * re-render per resize. Deliberately NOT part of `subscribeSessionEvents`,
 * which feeds the store. Label-scoped since task 440 (targeted like
 * `session://output` — the default `Any` target would bypass the backend's
 * emit_filter); an attaching host is never stranded, it adopts the grid from
 * `attach_terminal`'s direct return. */
export async function subscribeSessionSize(
  handler: (payload: SizePayload) => void,
): Promise<UnlistenFn> {
  return listen<SizePayload>("session://size", (e) => handler(e.payload), {
    target: WINDOW_LABEL,
  });
}

export interface CanvasEventHandlers {
  /** The canvas tab set changed in some window (#84) — re-apply the new list. */
  onCanvasesChanged: (state: PersistedCanvases) => void;
}

/** Subscribe to the cross-window canvas sync event (#84): `canvas://changed`
 * (tab/layout edits in any window). Returns an unlisten fn. Registered as one
 * wave (#352). */
export async function subscribeCanvasEvents(
  handlers: CanvasEventHandlers,
): Promise<UnlistenFn> {
  return listen<PersistedCanvases>("canvas://changed", (event) =>
    handlers.onCanvasesChanged(event.payload),
  );
}

/** The current primary full-window label (task 433), or null when none survives.
 * Fetch AFTER subscribing to `window://primary` — Rust updates its state before
 * each emit, so subscribe-then-fetch never regresses (the task-430 discipline). */
export const primaryWindow = () => invoke<string | null>("primary_window");

/** Subscribe to primary-window election changes (task 433). Full-value payload,
 * emitted only on change; the frontend apply is equality-guarded, never persists. */
export async function subscribePrimaryEvents(
  onPrimaryChanged: (primary: string | null) => void,
): Promise<UnlistenFn> {
  return listen<{ primary: string | null }>("window://primary", (event) =>
    onPrimaryChanged(event.payload.primary),
  );
}

export interface ScheduleEventHandlers {
  /** A schedule fired into a live session (#93). */
  onFired: (payload: ScheduleFiredPayload) => void;
  /** A schedule's spawn failed (#93) — it's dropped, not retried. */
  onError: (payload: ScheduleErrorPayload) => void;
  /** The full pending-schedule list changed (#280) — emitted after any backend
   * create/update/cancel/fire so every window (incl. a detached canvas #84) can keep
   * its `schedules` slice in sync. Mirrors `canvas://changed`. */
  onChanged: (schedules: ScheduledSession[]) => void;
}

/** Subscribe to scheduled-session events (#93/#280): `schedule://fired` (a schedule
 * became a live agent), `schedule://error`, and `schedule://changed` (the pending
 * list changed). Returns an unlisten fn. Registered as one wave (#352). */
export async function subscribeScheduleEvents(
  handlers: ScheduleEventHandlers,
): Promise<UnlistenFn> {
  const [unlistenFired, unlistenError, unlistenChanged] = await Promise.all([
    listen<ScheduleFiredPayload>("schedule://fired", (event) =>
      handlers.onFired(event.payload),
    ),
    listen<ScheduleErrorPayload>("schedule://error", (event) =>
      handlers.onError(event.payload),
    ),
    listen<ScheduledSession[]>("schedule://changed", (event) =>
      handlers.onChanged(event.payload),
    ),
  ]);
  return () => {
    unlistenFired();
    unlistenError();
    unlistenChanged();
  };
}

export interface RecurringEventHandlers {
  /** A recurring rotated its child into a fresh live session (#294). */
  onFired: (payload: RecurringFiredPayload) => void;
  /** A recurring's spawn failed (#294) — the record is kept, time advanced. */
  onError: (payload: RecurringErrorPayload) => void;
  /** The full recurring list changed (#294) — emitted after any backend
   * create/update/cancel/fire so every window (incl. a detached canvas #84) keeps
   * its `recurrings` slice in sync. Mirrors `schedule://changed`. */
  onChanged: (recurrings: RecurringSession[]) => void;
}

/** Subscribe to recurring-session events (#294): `recurring://fired` (a child
 * rotated), `recurring://error`, and `recurring://changed` (the list changed).
 * Returns an unlisten fn. Registered as one wave (#352). */
export async function subscribeRecurringEvents(
  handlers: RecurringEventHandlers,
): Promise<UnlistenFn> {
  const [unlistenFired, unlistenError, unlistenChanged] = await Promise.all([
    listen<RecurringFiredPayload>("recurring://fired", (event) =>
      handlers.onFired(event.payload),
    ),
    listen<RecurringErrorPayload>("recurring://error", (event) =>
      handlers.onError(event.payload),
    ),
    listen<RecurringSession[]>("recurring://changed", (event) =>
      handlers.onChanged(event.payload),
    ),
  ]);
  return () => {
    unlistenFired();
    unlistenError();
    unlistenChanged();
  };
}

/** Handlers for the cross-window state-sync broadcasts (task 428): the backend emits
 * each "quiet" persisted slice's **full new value** after every successful persist
 * (`commands.rs broadcast_*`, the `broadcast_schedules` pattern), plus the full
 * session roster after add/remove/rename. The handlers must apply-only — never call
 * back into any `set*` persist path — so the sender's own echo is a guarded no-op
 * and no loop can form. */
export interface StateSyncHandlers {
  /** The persisted settings blob changed (`settings://changed`); `null` never-saved. */
  onSettingsChanged: (settings: Partial<Settings> | null) => void;
  /** The recents list changed (`recents://changed`). */
  onRecentsChanged: (recents: string[]) => void;
  /** The diff "seen" markers changed (`diff_seen://changed`); `null` never-written. */
  onDiffSeenChanged: (seen: DiffSeenMap | null) => void;
  /** The sidebar folder order changed (`repo_order://changed`). */
  onRepoOrderChanged: (order: string[]) => void;
  /** The repo-color map changed (`repo_colors://changed`). */
  onRepoColorsChanged: (colors: Record<string, string>) => void;
  /** The per-repo Overview panels changed (`overview_panels://changed`). */
  onOverviewPanelsChanged: (panels: Record<string, OverviewPanel[]>) => void;
  /** The per-repo Overview order changed (`overview_order://changed`). */
  onOverviewOrderChanged: (order: Record<string, string[]>) => void;
  /** The sidebar width changed (`sidebar_width://changed`); `null` never-set. */
  onSidebarWidthChanged: (width: number | null) => void;
  /** The sidebar collapsed flag changed (`sidebar_collapsed://changed`). */
  onSidebarCollapsedChanged: (collapsed: boolean | null) => void;
  /** The saved Canvas templates changed (`canvas_templates://changed`). */
  onCanvasTemplatesChanged: (templates: CanvasTemplate[] | null) => void;
  /** The persisted session roster changed (`sessions://changed`) — an agent was
   * spawned, removed, or renamed in some window. The schedule/recurring fire paths
   * deliberately don't emit it (`schedule://fired` / `recurring://fired` carry the
   * record). */
  onSessionsChanged: (sessions: SessionRecord[]) => void;
}

/** Subscribe to the eleven cross-window state-sync events (task 428). Mirrors
 * `subscribeScheduleEvents`: each `listen()` is its own `invoke`, so they register
 * as **one parallel wave** (#352). Returns an unlisten fn that drops all eleven. */
export async function subscribeStateSyncEvents(
  handlers: StateSyncHandlers,
): Promise<UnlistenFn> {
  const unlistens = await Promise.all([
    listen<Partial<Settings> | null>("settings://changed", (event) =>
      handlers.onSettingsChanged(event.payload),
    ),
    listen<string[]>("recents://changed", (event) =>
      handlers.onRecentsChanged(event.payload),
    ),
    listen<DiffSeenMap | null>("diff_seen://changed", (event) =>
      handlers.onDiffSeenChanged(event.payload),
    ),
    listen<string[]>("repo_order://changed", (event) =>
      handlers.onRepoOrderChanged(event.payload),
    ),
    listen<Record<string, string>>("repo_colors://changed", (event) =>
      handlers.onRepoColorsChanged(event.payload),
    ),
    listen<Record<string, OverviewPanel[]>>(
      "overview_panels://changed",
      (event) => handlers.onOverviewPanelsChanged(event.payload),
    ),
    listen<Record<string, string[]>>("overview_order://changed", (event) =>
      handlers.onOverviewOrderChanged(event.payload),
    ),
    listen<number | null>("sidebar_width://changed", (event) =>
      handlers.onSidebarWidthChanged(event.payload),
    ),
    listen<boolean | null>("sidebar_collapsed://changed", (event) =>
      handlers.onSidebarCollapsedChanged(event.payload),
    ),
    listen<CanvasTemplate[] | null>("canvas_templates://changed", (event) =>
      handlers.onCanvasTemplatesChanged(event.payload),
    ),
    listen<SessionRecord[]>("sessions://changed", (event) =>
      handlers.onSessionsChanged(event.payload),
    ),
  ]);
  return () => {
    for (const unlisten of unlistens) unlisten();
  };
}

/** Prefetch the default dev-container image (fired when the modal's "Run in dev
 * container" toggle switches ON) so the one-time `docker build` overlaps the user
 * finishing the modal. Best-effort: docker missing / a custom `containerImage`
 * override → quiet no-op (the spawn path is the authoritative error surface). */
export const ensureContainerImage = () =>
  invoke<void>("ensure_container_image");

/** The docker runtime state ("absent" | "stopped" | "running") — drives whether
 * the modal's container toggle renders, and whether it's usable. */
export const containerRuntimeStatus = () =>
  invoke<DockerStatus>("container_runtime_status");

/** Handlers for dev-container events. */
export interface ContainerEventHandlers {
  /** The default dev-container image is being built (first run) — toast it. */
  onBuilding: (payload: ContainerBuildingPayload) => void;
}

/** Subscribe to `container://…` events (mirrors `subscribeRecurringEvents`). */
export async function subscribeContainerEvents(
  handlers: ContainerEventHandlers,
): Promise<UnlistenFn> {
  return listen<ContainerBuildingPayload>("container://building", (event) =>
    handlers.onBuilding(event.payload),
  );
}

// --- Same-file soft claims (Multi-window task 435) ---

/** Soft-claim `{repoPath, file}` for this window's auto-save editor (task 435):
 * last claim wins (the Take-over path is this same call). Advisory only — never
 * an on-disk lock; a stale claim degrades to last-writer-wins. `windowLabel` →
 * Rust `window_label` (the `attachTerminal` precedent). */
export const claimFile = (
  repoPath: string,
  file: string,
  windowLabel: string,
) => invoke<void>("claim_file", { repoPath, file, windowLabel });

/** Release this window's soft claim (task 435) — the editor settled clean or
 * unmounted. A stale release (another window took over) is a backend no-op. */
export const releaseFileClaim = (
  repoPath: string,
  file: string,
  windowLabel: string,
) => invoke<void>("release_file_claim", { repoPath, file, windowLabel });

/** The full current soft-claim list (task 435) — fetch AFTER subscribing to
 * `file_claims://changed` (the task-428 subscribe-then-fetch discipline: the
 * backend updates its registry before each emit, so this never regresses). */
export const fileClaims = () => invoke<FileClaim[]>("file_claims");

/** Subscribe to `file_claims://changed` (task 435): the full sorted claim list,
 * emitted only on change. A dedicated subscription — deliberately NOT a
 * `StateSyncHandlers` entry (that interface documents the *persisted* slices;
 * claims are transient). */
export async function subscribeFileClaimEvents(
  onChanged: (claims: FileClaim[]) => void,
): Promise<UnlistenFn> {
  return listen<FileClaim[]>("file_claims://changed", (e) =>
    onChanged(e.payload),
  );
}
