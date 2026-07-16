// Shared TypeScript types for ReCue.
//
// The first group mirrors the Rust backend (see src-tauri/src/{store,git,pty}.rs)
// so the typed IPC layer and the store share one source of truth; the second
// group is frontend-only UI state.

// --- Backend-mirrored models ---

/** Persisted session record (mirrors `store::PersistedSession`). */
export interface SessionRecord {
  id: string;
  claude_session_id: string;
  repo_path: string;
  name: string | null;
  created_at: number;
  /** Worktree agent (#74): the parent repo path; absent for a normal agent. */
  worktree_parent?: string | null;
  /** claude's auto-generated session title (#97); absent until captured. */
  auto_name?: string | null;
  /** Whether this session has ever been active (#112): drives the third "finished /
   * needs input" (yellow) activity state; absent/false for never-active records. */
  has_been_active?: boolean;
  /** The coding agent this session runs (#101); `"claude"` for older records. */
  agent?: string;
  /** The source session this was forked from (#126); absent for non-fork sessions.
   * Drives the "fork" badge + records provenance. */
  forked_from?: string | null;
  /** Whether the session has forkable conversation history (#138): false until its
   * on-disk claude log has a real turn, gating the Fork affordance. Defaults true
   * (fail-open) for older records without the field. */
  forkable?: boolean;
  /** Per-agent auto-continue opt-out (#297): when the global `autoContinueAfterLimit`
   * (#296) is on, an agent participates unless this is `true`. Absent/false for older
   * records → inherit the global behavior. */
  auto_continue_disabled?: boolean;
  /** Per-agent "watch" opt-in (#336): when `true`, a native OS notification pops up
   * each time this agent finishes a turn / needs input (its busy→idle edge). Opt-in
   * per agent; the global `watchAllAgents` setting can force it on. Absent/false for
   * older records → unwatched. */
  watch?: boolean;
  /** Dev-container session: the docker image it runs in (spawn + resume wrap the
   * agent CLI in `docker run <image> …`). Absent/null for a normal host-PTY
   * session and for older records. */
  container_image?: string | null;
}

/** Payload of `container://building`: the default dev-container image is being
 * built (first run, one-time) — surfaced as a toast so a spawn waiting behind the
 * build reads as progress, not a hang. */
export interface ContainerBuildingPayload {
  message: string;
}

/** The docker runtime state (the `container_runtime_status` command): drives the
 * New Session modal's container toggle — hidden when docker isn't installed,
 * disabled-with-a-hint when installed but not running. */
export type DockerStatus = "absent" | "stopped" | "running";

/** A slash-invokable skill/command (#114, mirrors `skills::SkillInfo`). Powers
 * the scheduled-prompt autocomplete; `name` is bare (inserted as `/<name>`),
 * `source` is `"project"` or `"user"`. */
export interface SkillInfo {
  name: string;
  description: string;
  source: string;
}

/** Agent catalog metadata (#141/#142, from the `agent_info` command) — snake_case
 * to match the Rust serialization. `version` is `null` when the CLI isn't installed,
 * so it doubles as the presence check for the missing-binary screen. */
export interface AgentInfo {
  id: string;
  display_name: string;
  binary_name: string;
  install_hint: string;
  supports_resume: boolean;
  supports_auto_name: boolean;
  version: string | null;
}

/** One editor catalog entry's live detection result ("Open in editor", from the
 * `detect_editors` command) — snake_case to match the Rust serialization, like
 * `AgentInfo`. Existence-based: `found` means a launchable install was resolved;
 * `via` names where ("PATH" / "Toolbox" / "Applications" / "Program Files"). */
export interface EditorInfo {
  id: string;
  display_name: string;
  found: boolean;
  via: string | null;
}

/** What ReCue decided about the WebKitGTK DMA-BUF renderer at boot (#357), for
 * Settings → Rendering. Mirrors Rust's `linux_webkit::RendererReport` — snake_case on the
 * wire, like `AgentInfo`. `renderer_diagnostics` returns `null` on macOS/Windows (nothing
 * is decided there), which is what hides the whole Rendering section. */
export interface RendererReport {
  /** Did ReCue export `WEBKIT_DISABLE_DMABUF_RENDERER=1`? */
  dmabuf_disabled: boolean;
  /** Why — the detection's reason, or the Settings override naming itself. */
  reason: string;
  /** The evidence the boot probes saw: GPUs, NVIDIA flavor/version, VM verdict, session. */
  evidence: string;
  /** The exact `[recue] WebKitGTK: …` line printed at boot. */
  log_line: string;
  /** What decided it: `"auto"` | `"setting"` | `"env"` (`RECUE_DISABLE_DMABUF`) |
   * `"user_env"` (the user's own `WEBKIT_DISABLE_DMABUF_RENDERER`). */
  source: string;
  /** The normalized persisted mode **in effect at boot** (`"auto"` | `"on"` | `"off"`) —
   * what a draft is compared against to decide whether a restart is needed. */
  setting: string;
}

/** Typed command error (mirrors `pty::SessionError`, serialized `{ kind, message }`). */
export interface SessionError {
  kind:
    | "BinaryNotFound"
    | "SessionNotFound"
    | "Spawn"
    | "Io"
    | "Git"
    | "NothingToFork"
    | "ResumeUnsupported";
  message: string;
}

/** Branches of a folder + the current one (mirrors `git::BranchList`). `remote`
 * holds qualified remote-tracking refs (e.g. `origin/feature-x`), deduped against
 * local branches and excluding the symbolic remote HEAD (#180); optional so older
 * callers and `{ all: [], current: "" }` fallbacks stay valid (backend always sends it). */
export interface BranchList {
  current: string;
  all: string[];
  remote?: string[];
}

/** A user-added Overview panel — a non-agent column (mirrors `store::OverviewPanel`, #38). */
export interface OverviewPanel {
  id: string;
  kind: "diff" | "markdown" | "terminal" | "kanban" | "filetree";
  /** Panel parameter, e.g. the markdown / kanban-board file path; absent for
   * diff/terminal/filetree panels. A `kanban` panel reuses this `file` ref (#142);
   * a `filetree` panel is repo-scoped with no `file` (#167). */
  file?: string;
  /** Diff panel source (#81/#230): "working" (vs HEAD), "compare" (base → target), or
   * "commits" (a chosen commit's diff); plus the chosen branches / commit sha. Absent
   * on non-diff panels. */
  diff_source?: "working" | "compare" | "commits";
  compare_base?: string;
  compare_target?: string;
  /** Selected commit sha when `diff_source === "commits"` (#230). */
  commit_sha?: string;
}

/** A pending scheduled session (#93, mirrors `store::ScheduledSession`). An agent
 * launches automatically at `fire_at` (unix secs, local clock); one-shot. */
export interface ScheduledSession {
  id: string;
  cwd: string;
  /** Branch to use before spawning. When `create_branch` is false, an existing
   * branch to check out (absent = none); when true, the **new** branch to create at
   * fire time (#125). */
  branch?: string | null;
  /** Create + check out `branch` at fire time from `branch_base` (or HEAD), rather
   * than checking out an existing branch (#125); absent/false for older records. */
  create_branch?: boolean;
  /** Base for the new branch when `create_branch` (absent = HEAD) (#125). */
  branch_base?: string | null;
  /** Launch into an isolated git worktree (#198/#74), created at fire time on
   * `branch` (existing, or new when `create_branch`); absent/false = in-folder. */
  worktree?: boolean;
  /** The app-managed worktree folder for a worktree schedule (#218), computed at
   * create time; drives the sidebar worktree sub-group nesting (the same key the
   * live session uses after firing). Absent for non-worktree schedules and for
   * schedules created before #218. */
  worktree_path?: string | null;
  name?: string | null;
  prompt?: string | null;
  fire_at: number;
  created_at: number;
  /** The coding agent to launch (#101); `"claude"` for older records. */
  agent?: string;
}

/** Payload of the `schedule://fired` event (#93): a schedule became a live session. */
export interface ScheduleFiredPayload {
  id: string;
  session: SessionRecord;
}

/** Payload of the `schedule://error` event (#93): a schedule's spawn failed. */
export interface ScheduleErrorPayload {
  id: string;
  message: string;
}

/** An active recurring session (#294, mirrors `store::RecurringSession`). A
 * persistent, repeating agent: each time `next_fire_at` (unix secs, local clock)
 * passes, the poll loop kills the current child and spawns a **fresh** `claude`
 * seeded with `prompt`, rotating `current_session_id` in place (its sidebar row /
 * Overview card / Canvas panel key on `id`, so no new surface is ever created). */
export interface RecurringSession {
  id: string;
  cwd: string;
  /** Branch to use before spawning each child (checkout, or new when `create_branch`);
   * absent = none. Mirrors `ScheduledSession`. */
  branch?: string | null;
  create_branch?: boolean;
  branch_base?: string | null;
  /** Launch each child into an isolated git worktree (#74), created eagerly at
   * create time on `branch`; absent/false = in-folder. */
  worktree?: boolean;
  /** The app-managed worktree folder for a worktree recurring, computed at create
   * time; drives the sidebar worktree sub-group nesting. Absent for non-worktree. */
  worktree_path?: string | null;
  name?: string | null;
  prompt?: string | null;
  /** Repeat interval in seconds (minimum 60). Each fire advances `next_fire_at`. */
  interval_secs: number;
  /** Next time (unix secs) a fresh child should be spawned. */
  next_fire_at: number;
  /** The live child agent this recurring currently owns (rotated each cycle), or
   * absent before the first fire / after a child exits. */
  current_session_id?: string | null;
  created_at: number;
  /** The coding agent to launch (#101); `"claude"` for older records. */
  agent?: string;
}

/** Payload of the `recurring://fired` event (#294): a recurring rotated its child.
 * `session` is the freshly-spawned child; `next_fire_at` the advanced time. */
export interface RecurringFiredPayload {
  id: string;
  session: SessionRecord;
  next_fire_at: number;
}

/** Payload of the `recurring://error` event (#294): a recurring's spawn failed. The
 * record is KEPT (time still advanced) — one failure never wedges the poll. */
export interface RecurringErrorPayload {
  id: string;
  message: string;
}

export type FileStatusCode = "M" | "A" | "D" | "I";
export type HunkLineKind = "hunk" | "context" | "add" | "del";

/** One file's working-tree git status (#252, mirrors `git::FileStatusEntry`) — the
 * lightweight per-file signal the FileTree colors by. `path` is repo-relative POSIX
 * (`/`), matching `DirEntry.path`, so the lookup is a direct string key on both OSes. */
export interface FileStatusEntry {
  path: string;
  status: FileStatusCode;
}

/** Summed added/removed line counts of an agent's working tree vs `HEAD` (#335,
 * mirrors `git::DiffLineCounts`) — the sidebar's per-agent green `+A` / red `−D`
 * badge source. `added` covers tracked edits plus untracked (new) files; `removed`
 * is tracked-only. A missing key / both-zero = a clean tree (no badge). */
export interface DiffLineCounts {
  added: number;
  removed: number;
}

/** Ahead/behind commit counts of a folder's current branch vs its upstream
 * remote-tracking branch (#338, mirrors `git::AheadBehind`) — the sidebar's `↑A ↓B`
 * branch indicator source. `ahead` = local commits not yet on the upstream; `behind`
 * = upstream commits not yet local. Both are **as of the last `git fetch`** (computed
 * locally against the remote-tracking ref — no network). A folder with no upstream is
 * **absent** from the map; a both-zero (in-sync) entry renders nothing. */
export interface AheadBehind {
  ahead: number;
  behind: number;
}

export interface HunkLine {
  type: HunkLineKind;
  old_no?: number;
  new_no?: number;
  text: string;
}

export interface FileDiff {
  path: string;
  status: FileStatusCode;
  add: number;
  del: number;
  binary: boolean;
  hunks: HunkLine[];
}

export interface DiffSummary {
  branch: string;
  files_changed: number;
  adds: number;
  dels: number;
}

export interface WorkingDiff {
  summary: DiffSummary;
  files: FileDiff[];
}

/** Per-repo diff "seen" review markers (#278): a content digest per reviewed file,
 * keyed `{ [repoPath]: { [filePath]: digest } }`. A file is "Seen" when its current
 * content digest equals the stored one, "ChangedSinceSeen" when it differs, and
 * "NotSeen" when absent. Persisted opaquely (the frontend owns the digest shape). */
export type DiffSeenMap = Record<string, Record<string, string>>;

/** A diff-seen **write patch** (task 429): per-repo, per-file deltas the backend
 * merges over the persisted map under the Store mutex, so a stale window's
 * debounced write can't drop another window's concurrent marks. A string sets that
 * file's digest; a `null` file tombstones (deletes) the entry; a `null` repo
 * deletes the whole repo key (the server also prunes a repo object emptied by file
 * tombstones, so the frontend never needs the repo tombstone). */
export type DiffSeenPatch = Record<
  string,
  Record<string, string | null> | null
>;

/** One commit in a folder's history (#230, mirrors `git::CommitInfo`) — the diff
 * viewer's "Commits" source list. */
export interface CommitInfo {
  sha: string;
  short_sha: string;
  author: string;
  date: string;
  subject: string;
}

/** Payload of the `session://output` event — base64-encoded PTY bytes (#261). */
export interface OutputPayload {
  id: string;
  b64: string;
  /** Absolute end-offset of this chunk (running total of bytes the session has ever
   * produced). Lets the terminal replay dedupe the scrollback ↔ live overlap that
   * otherwise double-paints a freshly-spawned session's startup. */
  offset: number;
}

/** A session's retained scrollback plus its absolute end-offset (dedupe boundary).
 * The bytes travel base64-encoded like live output (#261/#346) — never a JSON
 * integer array, which cost a megabyte-plus parse per terminal mount. */
export interface ScrollbackReply {
  b64: string;
  end: number;
}

/** Payload of the `session://exited` event. */
export interface ExitPayload {
  id: string;
  code: number | null;
}

/** Payload of the `session://forgotten` event (task 431): a clean #63 exit Rust
 * already forgot — every window drops local state; only `toast_window` toasts. */
export interface ForgottenPayload {
  id: string;
  toast_window: string;
}

/** Payload of the `worktree://kept` event (task 431): the exit-driven worktree
 * cleanup found a dirty worktree and kept it (#74) — only `toast_window` warns. */
export interface WorktreeKeptPayload {
  dest: string;
  toast_window: string;
}

/** Outcome of the Rust ref-counted worktree cleanup (task 431,
 * `cleanup_worktree_if_empty`): removed (incl. already gone — idempotent), still
 * referenced by some item, or kept because git refused the non-forced remove. */
export type WorktreeCleanup = "removed" | "inUse" | "keptDirty";

/** Payload of the `session://state` event — busy/idle (#42). */
export interface StatePayload {
  id: string;
  busy: boolean;
}

/** Payload of the `session://size` broadcast (tasks 426/427): the authoritative,
 * smallest-wins-arbitrated PTY grid. The ONLY thing that ever resizes a pooled
 * xterm's grid (terminalPool applies it; nothing else calls term.resize). */
export interface SizePayload {
  id: string;
  cols: number;
  rows: number;
}

/** Return of `attach_terminal` (task 426): the effective grid the attaching host
 * must adopt before replaying scrollback. */
export interface GridPayload {
  cols: number;
  rows: number;
}

/** Payload of the `session://name` event (#97): claude's latest auto-title. */
export interface NamePayload {
  id: string;
  name: string;
}

/** Payload of the `session://forkable` event (#138): whether the session now has
 * forkable conversation history, gating the Fork affordance up front. */
export interface ForkablePayload {
  id: string;
  forkable: boolean;
}

// --- Frontend UI state ---

export type View = "overview" | "canvas" | "attention";

/**
 * Application settings (#100), persisted as an opaque blob through the Rust store
 * (`set_settings`) with these **frontend-owned defaults**, so an older
 * `sessions.json` without a `settings` key upgrades cleanly. The Settings modal
 * edits a draft of this and applies it on Save. Fields are grouped by section; not
 * every section is wired yet (Appearance / Behavior land in follow-ups), but the
 * shape is complete so those are purely additive.
 */
export interface Settings {
  // Terminal
  /** xterm font size in px (10–16). */
  terminalFontSize: number;
  /** xterm line height multiplier (1.0–1.8). */
  terminalLineHeight: number;
  /** xterm cursor blink. */
  terminalCursorBlink: boolean;
  /** Terminal background lightness (#390): 0 = near-black `#11111b` (default, today's
   * look byte-for-byte), 100 = a soft gray. Lightens ONLY the agent/shell terminal
   * background (xterm canvas + its padding frame); terminal-only and dark in both
   * themes, so it never touches the light/dark theme toggle or non-terminal surfaces. */
  terminalBackgroundLightness: number;
  // Appearance (wired by a follow-up)
  /** UI theme (#333): "dark" (default, Catppuccin Mocha) or "light" (Catppuccin
   * Latte). Applied as a `data-theme` attribute on <html> by applySettingsEffects;
   * the terminal stays dark in both. */
  theme: "dark" | "light";
  /** Accent color: a hex from `REPO_PALETTE`, "" to use the default token, or the
   * literal `"random"` sentinel (UI v2 task 373) — re-resolved to a random
   * `REPO_PALETTE` member once per launch by applySettingsEffects. */
  accentColor: string;
  /** Force reduced motion beyond the OS setting. */
  reduceMotion: boolean;
  /** Animate the app background (UI v2 wave, card 3). Default true; the visual
   * consumer lands with the wave background — until then the flag persists inertly. */
  backgroundAnimation: boolean;
  /** Pause the wave while panels cover the stage (UI v2 task 384). Default false
   * (opt-in, task 402); the wave stops rendering (zero frames) whenever the Overview
   * wall has cards / the active Canvas tab has panels, and resumes live the instant
   * the stage is clear.
   * Ignored when backgroundAnimation is off (that unmounts the canvas entirely). */
  pauseWaveWhenCovered: boolean;
  /** Dense panels (UI v2 §9): collapse every stage gap and pane padding to 0 so
   * panels tile edge-to-edge (hairlines keep them separated). Applied as a `dense`
   * class on <html> by applySettingsEffects (the task-372 `:root.dense` token hook);
   * toggled by ⌘D or Settings → Appearance. Default false. */
  densePanels: boolean;
  /** Cap every Overview panel at a comfortable max width (UI v2, card 5; broadened
   * task 419 to every column type — agent, recurring, file, diff, terminal, kanban,
   * filetree, scheduled). Default true (opt-out). */
  capAgentWidth: boolean;
  /** Overview column minimum width in px (320–600); the floor before columns
   * scroll horizontally (#176). Applied as the `--overview-card-min` CSS var. */
  overviewPanelMinWidth: number;
  /** Whole-app UI scale as an integer percent (#366): 100 = normal (default). Applied
   * as CSS `zoom` on <html> by applySettingsEffects; scales the entire UI (chrome,
   * text, spacing) AND the terminals uniformly, while the terminal font-size/line-height
   * (Terminal section) stay independent as the base. Clamped to 80–150; exactly 100
   * clears the `zoom` property so a default install is byte-for-byte unchanged. */
  displaySize: number;
  /** Show a compact green `+A` / red `−D` added/removed line-count badge on each
   * agent's sidebar row (#335). Default on. When off, no badge renders and the store
   * performs **no** `diff_line_counts` git reads (zero cost). */
  showDiffLineCounts: boolean;
  // Rendering — Linux only (#357). Hidden entirely on macOS/Windows, where both fields
  // are inert whatever their persisted value.
  /** WebKitGTK's **DMA-BUF** (zero-copy GPU) renderer: `"auto"` (#346/#347's GPU-aware
   * detection — the default), `"on"` (force-keep, overriding a detection that wrongly
   * disables it), `"off"` (force-disable ⇒ CPU rendering of the webview, the fix for a
   * broken NVIDIA-blob / VM stack). Read from `sessions.json` **before GTK init** (via the
   * Rust `early_settings`), so a change applies on the **next launch** — GTK reads the env
   * once at init and there is no way to re-apply it live. `RECUE_DISABLE_DMABUF=1|0`, and a
   * user-exported `WEBKIT_DISABLE_DMABUF_RENDERER`, still win over this for one run. */
  linuxDmabufRenderer: "auto" | "on" | "off";
  /** xterm's renderer: `"auto"` (the #346 software-rasterizer probe — the default),
   * `"webgl"` (force the WebGL addon even when the probe says llvmpipe/SwiftShader),
   * `"dom"` (force xterm's DOM renderer). Applied **live** to the pooled terminals on Save
   * — no terminal is ever disposed (the #18 invariant). Detached canvas windows always use
   * the DOM renderer regardless (#105). */
  linuxTerminalRenderer: "auto" | "webgl" | "dom";
  // Behavior (wired by a follow-up)
  /** View shown on launch. */
  defaultView: View;
  /** Confirm destructive Sidebar actions (Remove / Kill all / Close all). */
  confirmDestructive: boolean;
  /** Focus-follows-mouse (#368): when true, hovering an agent or shell terminal panel
   * focuses it immediately so keystrokes are captured without a click. Since #371 the
   * hover also moves the selection/active-panel highlight to the hovered Overview card
   * or Canvas panel, and entering a panel with no terminal input (diff/file/kanban/
   * filetree/scheduled/recurring, or an agent owned by another window) blurs the
   * previously focused terminal so keystrokes never silently keep flowing to it. On
   * by default (opt-out). Read live by Terminal.tsx / Overview / CanvasSurface; not a
   * side-effecting setting. */
  autoFocusOnHover: boolean;
  /** What closing a Canvas tab *with contents* does (#137): `ask` shows a modal,
   * `kill` tears down its agents/items, `keep` just drops the tab (today's behavior).
   * Self-contained — independent of `confirmDestructive`. */
  canvasCloseBehavior: "ask" | "kill" | "keep";
  /** Default diff-viewer display mode (#231): `focused` (one file fills the panel,
   * prev/next + picker) or `accordion` (single-open file cards). Each diff panel seeds
   * its in-panel toggle from this. */
  diffDisplayMode: "focused" | "accordion";
  /** Default diff-viewer line mode (#237): `unified` (one column) or `split`
   * (side-by-side). Each diff panel seeds its in-panel toggle from this; toggling in a
   * panel writes back here so the last choice becomes the default for new panels. */
  diffLineMode: "unified" | "split";
  /** Default diff-viewer file ordering (#258): `occurrence` (default — a file appends
   * to the bottom of the list the first time it changes; re-changes don't reorder it) or
   * `alphabetical` (case-insensitive A→Z by path). Each diff panel seeds its in-panel
   * toggle from this; toggling in a panel writes back here as the new default. The
   * per-panel occurrence sequence itself is not persisted — only this mode preference. */
  diffSortOrder: "occurrence" | "alphabetical";
  /** Kanban column colors by name (#239): an ordered list of column-name → color
   * entries applied to every board. A column whose name isn't listed gets a stable
   * color hashed from its name (see `kanbanColumnColor`). */
  kanbanColumnColors: { name: string; color: string }[];
  // Sessions
  /** Use claude's `ai-title` (#97) for unnamed agents; off → the branch label. */
  autoName: boolean;
  /** Auto-save edited files (#162): on (default) = debounced writes; off = manual
   * save only (⌘S / the Save button). Governs every `useAutoSaveFile` consumer
   * (FileViewer raw/text + Kanban Board/Raw). */
  autoSave: boolean;
  /** Coding-agent CLI for **newly created** sessions (#142). Existing sessions keep
   * their recorded `agent` (#101). `"claude"` (default), `"codex"`, `"opencode"`, or
   * `"custom"` (#325) — the non-claude ones are untested; Claude Code is recommended. */
  defaultAgent: string;
  /** Launch command for the **custom** coding agent (#325), used only when
   * `defaultAgent === "custom"`. An **argv** (a program plus its args, split on spaces,
   * quote to group) — NOT a shell line (no pipes / redirection / `$VAR` / globbing). The
   * backend parses it and runs the resolved program cross-platform (PATHEXT / `cmd.exe
   * /C`). Empty by default; a blank command makes a custom spawn fail with a clear toast. */
  customAgentCommand: string;
  /** Auto-continue Claude agents after the five-hour usage limit resets (#296): when
   * the limit is hit, ReCue waits for the window to reset (watching the reset time +
   * the usage percentage dropping) then nudges the running Claude agents to resume
   * (Enter → `continue` → Enter). Claude-only — inert unless `defaultAgent` is
   * `"claude"`. Default off. */
  autoContinueAfterLimit: boolean;
  /** Show the five-hour Claude usage bar above the sidebar footer (#154/#326). Default
   * true. When false the bar is hidden AND ReCue never reads the Claude OAuth token —
   * the Rust engine's usage poll (`autocontinue.rs poll_gate`, task 430) never runs. */
  showSessionUsage: boolean;
  /** Whether to offer the "Enable auto restart on limit reset" prompt button above the
   * usage bar when the five-hour limit is reached and auto-continue is off (#309). Default
   * true (the prompt is shown); turn off to never surface it. */
  promptEnableAutoContinueAtLimit: boolean;
  /** Global master switch for per-agent "watch" notifications (#336): when `true`, EVERY
   * agent (except recurring-owned children) pops a native OS notification on its busy→idle
   * edge, regardless of its per-agent `watch` flag (the per-agent flags are retained for
   * when this is turned back off). Default `false` — watch is otherwise opt-in per agent. */
  watchAllAgents: boolean;
  // Shortcuts
  /** Keyboard-shortcut overrides (Settings → Shortcuts): rebindable action id
   * (`KeybindActionId`, `src/keybinds.ts`) → serialized chord (`"mod+w"`,
   * `"alt+1"`, …), `""` = explicitly unbound. Only **overrides** live here — an
   * untouched action has no key and follows its registry default, so new defaults
   * reach existing installs. Read live by `useKeyboardNav` on every keydown (no
   * applySettingsEffects step); invalid persisted chords read as unbound. */
  keybinds: Record<string, string>;
  /** Whether the first-launch coding-agent picker has run. Defaults `false`, so an
   * existing install also runs the one-time detection on its next launch (auto-pick
   * if exactly one CLI is installed, the picker modal if 2+). Set once, then never
   * re-prompts. Kept in the settings blob (no separate Rust scalar). */
  onboarded: boolean;
  /** One-time #367 migration marker: whether the terminal line-height default drop
   *  (1.2 → 1.0) has been applied for this install. Defaults false so an older blob
   *  (lacking the key) is eligible for the one-time bump; set true once so a user who
   *  later re-picks 1.2 is never re-migrated. Mirrors `onboarded`. */
  terminalLineHeightMigrated: boolean;
  /** One-time #414 migration marker: whether the terminal background-lightness
   *  default raise (0 → 25) has been applied for this install. Defaults false so an
   *  older blob (lacking the key) is eligible for the one-time bump of an explicit
   *  legacy 0; set true once so a user who later re-picks 0 is never re-migrated.
   *  Mirrors `terminalLineHeightMigrated`. */
  terminalBackgroundMigrated: boolean;
  // Editor ("Open in editor")
  /** The editor "Open in editor" (⌘O, menus) launches: a catalog id from
   * `src/editors.ts` (`"vscode"`, `"idea"`, …), `"custom"` (→ `customEditorCommand`),
   * or `null` = not chosen yet — the next use opens the picker modal ("ask every
   * time" when the user unchecks Remember). */
  preferredEditor: string | null;
  /** Launch command for the **custom** editor, used when `preferredEditor ===
   * "custom"`. An **argv** like `customAgentCommand` (program + args, split on
   * spaces, quote to group) — NOT a shell line. Every `{path}` occurrence is
   * replaced with the target folder; without a placeholder the folder is appended
   * as the last arg. Terminal editors go through their emulator, e.g.
   * `alacritty -e nvim {path}`. */
  customEditorCommand: string;
}

// --- Canvas (#46): a recursive binary split-panel (BSP) layout tree ---

/** What a Canvas leaf shows. #46 uses `kind: "placeholder"`; #47 adds real
 * content kinds (agent / file / diff) with the extra fields below. */
export interface CanvasContent {
  kind: string;
  label?: string;
  repoPath?: string;
  file?: string;
  /** How an `open-file`/`open-kanban` **template block**'s `file` resolves (#224):
   * `"relative"` (default / absent) joins it to the folder chosen at template-use time
   * (subfolders allowed); `"absolute"` treats `file` as a full filesystem path, opened
   * via its own parent dir as the root (the #163 pattern). Only set on file/kanban
   * template-block leaves. */
  filePathMode?: "relative" | "absolute";
  sessionId?: string;
  /** Pending scheduled session this panel shows (#94, kind: "scheduled"). */
  scheduleId?: string;
  /** Recurring session this panel shows (#294, kind: "recurring"). */
  recurringId?: string;
  /** Initial prompt for a `new-agent` **template block** (#117) — pre-sent to the
   * agent when the template is instantiated (#118), like a scheduled session (#93).
   * Only set on template-block leaves, never on live content. */
  prompt?: string;
  /** Optional custom agent name for a `new-agent` **template block** (#136) — applied
   * as the spawned session's name on instantiation (#118), so an agent can be named
   * before it exists. Empty/unset → the agent auto-names from claude's `ai-title`
   * (#97), else the branch. Only set on `new-agent` template-block leaves. */
  name?: string;
  /** A `kind: "pending"` panel from instantiating a template (#118): the originating
   * template block, re-run on Retry. Cleared once the panel resolves to live content. */
  block?: CanvasContent;
  /** Set on a pending panel whose block failed to resolve (#118) — the inline error
   * message shown with a Retry button (and Pick file for `open-file`). */
  error?: string;
}

/** A single panel. */
export interface CanvasLeaf {
  type: "leaf";
  id: string;
  content: CanvasContent;
}

/** A binary split of two child nodes; `sizes` are the two percentages (sum 100). */
export interface CanvasSplit {
  type: "split";
  id: string;
  dir: "row" | "col";
  a: CanvasNode;
  b: CanvasNode;
  sizes: [number, number];
}

export type CanvasNode = CanvasLeaf | CanvasSplit;

/** The edge of a panel a drop lands on, choosing the split direction + side. */
export type CanvasEdge = "left" | "right" | "top" | "bottom";

/** One named Canvas tab — its own independent BSP layout (#58). */
export interface CanvasTab {
  id: string;
  name: string;
  layout: CanvasNode | null;
}

/** A reusable, saved Canvas layout (#117). Same BSP shape as a `CanvasTab`, but
 * each leaf's `content.kind` is a **block kind** (`new-agent` / `new-terminal` /
 * `open-file` / `open-diff` / `open-kanban` #154) carrying inert action
 * descriptors — config like the agent `prompt` or the `open-file`/`open-kanban`
 * relative `file` path — rather than live
 * content. Instantiated into a real canvas in #118. Persisted as the separate
 * `canvas_templates` blob (kept apart from the `canvases` blob). */
export interface CanvasTemplate {
  id: string;
  name: string;
  layout: CanvasNode | null;
}

/** Persisted multi-canvas state (#58): the tab list + which tab is active. */
export interface PersistedCanvases {
  canvases: CanvasTab[];
  activeId: string;
}

/** A `set_canvases` **write patch** (task 429): send only the field(s) the action
 * changed — the backend merges field-wise over the persisted blob under the Store
 * mutex (a tab switch sends `activeId` only; a layout/rename/reorder edit sends
 * `canvases` only), so a stale window's write can't clobber the other field.
 * `PersistedCanvases` stays the read/boot shape. */
export interface PersistedCanvasesPatch {
  canvases?: CanvasTab[];
  activeId?: string;
}

/** Init presets for a full app window (task 434, mirrors `commands::AppWindowInit`).
 * Passed to `open_app_window` and carried as URL params, so the new window's OWN
 * store presets its local state at boot: `repo` filters its Overview to that repo;
 * `canvas` boots it into the Canvas view on that tab (when the tab exists). Local
 * UI only — nothing is persisted, no other window is touched. */
export interface AppWindowInit {
  repo?: string;
  canvas?: string;
}

export type ToastTone = "info" | "error" | "success";

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}

/** A clone in progress (#299): a transient, in-memory "phantom" repo the sidebar
 * renders with an indeterminate progress bar while the backend `clone_repo` runs off
 * the main thread. `id` is a locally-generated unique key so two concurrent clones show
 * their own phantom and resolve independently (removed by id on success/failure);
 * `name` is derived from the URL (mirrors the backend's clone dir name). Never
 * persisted — a clone doesn't survive a restart. */
export interface CloningRepo {
  id: string;
  name: string;
  parent: string;
  url: string;
}

/** One grouped block of patch-notes (#192): a category + its bullet items. */
export interface PatchNotesChange {
  /** A small known set (`feature` / `fix` / `improvement` / `other`),
   * case-insensitive + extensible — unknown values render under their own heading. */
  category: string;
  /** Short bullet strings; may contain inline markdown (links/bold). */
  items: string[];
}

/** Per-version patch notes (#192), authored in-repo as `src/patchnotes/<version>.json`
 * and rendered in the Settings → Updates pane (#191). */
export interface PatchNotes {
  version: string;
  date: string;
  changes: PatchNotesChange[];
}

/** UI-facing session (camelCase, augmented with derived/live fields). */
export interface SessionView {
  id: string;
  claudeSessionId: string;
  repoPath: string;
  name: string | null;
  createdAt: number;
  /** Set once the underlying process has exited. */
  exitedCode?: number | null;
  /** True while a persisted session is being resumed on boot (#30). */
  reconnecting?: boolean;
  /** Worktree agent (#74): the parent repo path (its `repoPath` is the isolated
   * worktree folder); absent/null for a normal agent. Drives sidebar nesting. */
  worktreeParent?: string | null;
  /** claude's auto-generated title (#97): the display label for an agent with no
   * custom `name`. Refreshed as the session progresses; `name` still wins. */
  autoName?: string | null;
  /** Whether this session has ever been active (#112): seeds the live "has worked
   * at least once" flag so a previously-active agent shows the yellow "finished /
   * needs input" indicator right after boot. */
  hasBeenActive?: boolean;
  /** The coding agent this session runs (#101); `"claude"` for older records. */
  agent?: string;
  /** The source session this was forked from (#126); absent for non-fork sessions.
   * Drives the "fork" badge distinguishing it from the identically-titled source. */
  forkedFrom?: string | null;
  /** Whether the session has forkable conversation history (#138): when `false` the
   * Fork affordance is shown unavailable (no-op + explanatory tooltip). Seeded from the
   * record + updated by `session://forkable`. Undefined/true → forkable (fail-open). */
  forkable?: boolean;
  /** Per-agent auto-continue opt-out (#297): when `true`, this Claude agent is excluded
   * from the #296 auto-continue fire step even though the global `autoContinueAfterLimit`
   * is on. Seeded from the record; toggled via the per-agent checkbox. Default false. */
  autoContinueDisabled?: boolean;
  /** Per-agent "watch" opt-in (#336): when `true`, a native OS notification pops up each
   * time this agent finishes a turn / needs input (its busy→idle edge). Seeded from the
   * record; toggled via the sidebar menu / header WatchButton. Default false. The global
   * `watchAllAgents` setting can force notifications on regardless of this flag. */
  watch?: boolean;
  /** Dev-container session: the docker image it runs in; null/absent for a normal
   * host-PTY session. Drives the static "container" badge beside the fork badge. */
  containerImage?: string | null;
}

/** Everything the frontend needs at boot, in ONE IPC round-trip (#352 — mirrors
 * `commands::BootState`, so the fields keep the Rust snake_case names). Each field is
 * exactly what its individual command returns; all of those commands remain registered
 * for their other call sites (this is a batching read, not a replacement). */
export interface BootState {
  sessions: SessionRecord[];
  recents: string[];
  repo_colors: Record<string, string>;
  overview_panels: Record<string, OverviewPanel[]>;
  overview_order: Record<string, string[]>;
  /** Legacy per-repo opened files (#45), read once on boot only to clear it (#110). */
  open_files: Record<string, string[]>;
  /** Legacy single Canvas layout (#46), migrated once into `canvases` (#58). */
  canvas_layout: CanvasNode | null;
  canvases: PersistedCanvases | null;
  canvas_templates: CanvasTemplate[] | null;
  settings: Partial<Settings> | null;
  sidebar_width: number | null;
  sidebar_collapsed: boolean | null;
  repo_order: string[];
  diff_seen: DiffSeenMap | null;
  schedules: ScheduledSession[];
  recurrings: RecurringSession[];
  last_version: string | null;
  app_version: string;
  /** "macos" | "windows" | "linux" (#143). */
  platform: string;
  /** Windows build number, `0` elsewhere (#140). */
  windows_build: number;
  /** Canvas ids with a detached window open (#84). */
  detached_canvas_ids: string[];
}
