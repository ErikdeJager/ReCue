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
}

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

export type FileStatusCode = "M" | "A" | "D" | "I";
export type HunkLineKind = "hunk" | "context" | "add" | "del";

/** One file's working-tree git status (#252, mirrors `git::FileStatusEntry`) — the
 * lightweight per-file signal the FileTree colors by. `path` is repo-relative POSIX
 * (`/`), matching `DirEntry.path`, so the lookup is a direct string key on both OSes. */
export interface FileStatusEntry {
  path: string;
  status: FileStatusCode;
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

/** A session's retained scrollback plus its absolute end-offset (dedupe boundary). */
export interface ScrollbackReply {
  bytes: number[];
  end: number;
}

/** Payload of the `session://exited` event. */
export interface ExitPayload {
  id: string;
  code: number | null;
}

/** Payload of the `session://state` event — busy/idle (#42). */
export interface StatePayload {
  id: string;
  busy: boolean;
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

export type View = "overview" | "canvas";

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
  // Appearance (wired by a follow-up)
  /** Accent color hex from `REPO_PALETTE`, or "" to use the default token. */
  accentColor: string;
  /** Force reduced motion beyond the OS setting. */
  reduceMotion: boolean;
  /** Overview column minimum width in px (320–600); the floor before columns
   * scroll horizontally (#176). Applied as the `--overview-card-min` CSS var. */
  overviewPanelMinWidth: number;
  // Behavior (wired by a follow-up)
  /** View shown on launch. */
  defaultView: View;
  /** Confirm destructive Sidebar actions (Remove / Kill all / Close all). */
  confirmDestructive: boolean;
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
   * their recorded `agent` (#101). `"claude"` (default), `"codex"`, or `"opencode"`
   * — the latter two are untested; Claude Code is recommended. */
  defaultAgent: string;
  /** Whether the first-launch coding-agent picker has run. Defaults `false`, so an
   * existing install also runs the one-time detection on its next launch (auto-pick
   * if exactly one CLI is installed, the picker modal if 2+). Set once, then never
   * re-prompts. Kept in the settings blob (no separate Rust scalar). */
  onboarded: boolean;
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

export type ToastTone = "info" | "error" | "success";

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
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
}
