// Shared TypeScript types for ClaudeCue.
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
}

/** A slash-invokable skill/command (#114, mirrors `skills::SkillInfo`). Powers
 * the scheduled-prompt autocomplete; `name` is bare (inserted as `/<name>`),
 * `source` is `"project"` or `"user"`. */
export interface SkillInfo {
  name: string;
  description: string;
  source: string;
}

/** Typed command error (mirrors `pty::SessionError`, serialized `{ kind, message }`). */
export interface SessionError {
  kind: "BinaryNotFound" | "SessionNotFound" | "Spawn" | "Io" | "Git";
  message: string;
}

/** Local branches of a folder + the current one (mirrors `git::BranchList`). */
export interface BranchList {
  current: string;
  all: string[];
}

/** A user-added Overview panel — a non-agent column (mirrors `store::OverviewPanel`, #38). */
export interface OverviewPanel {
  id: string;
  kind: "diff" | "markdown" | "terminal";
  /** Panel parameter, e.g. the markdown file path; absent for diff/terminal panels. */
  file?: string;
  /** Diff panel branch-compare state (#81): "working" (vs HEAD) or "compare"
   * (base → target), plus the two chosen branches; absent on non-diff panels. */
  diff_source?: "working" | "compare";
  compare_base?: string;
  compare_target?: string;
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

export type FileStatusCode = "M" | "A" | "D";
export type HunkLineKind = "hunk" | "context" | "add" | "del";

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

/** Payload of the `session://output` event. */
export interface OutputPayload {
  id: string;
  bytes: number[];
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
  // Behavior (wired by a follow-up)
  /** View shown on launch. */
  defaultView: View;
  /** Confirm destructive Sidebar actions (Remove / Kill all / Close all). */
  confirmDestructive: boolean;
  // Sessions
  /** Use claude's `ai-title` (#97) for unnamed agents; off → the branch label. */
  autoName: boolean;
}

// --- Canvas (#46): a recursive binary split-panel (BSP) layout tree ---

/** What a Canvas leaf shows. #46 uses `kind: "placeholder"`; #47 adds real
 * content kinds (agent / file / diff) with the extra fields below. */
export interface CanvasContent {
  kind: string;
  label?: string;
  repoPath?: string;
  file?: string;
  sessionId?: string;
  /** Pending scheduled session this panel shows (#94, kind: "scheduled"). */
  scheduleId?: string;
  /** Initial prompt for a `new-agent` **template block** (#117) — pre-sent to the
   * agent when the template is instantiated (#118), like a scheduled session (#93).
   * Only set on template-block leaves, never on live content. */
  prompt?: string;
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
 * `open-file` / `open-diff`) carrying inert action descriptors — config like the
 * agent `prompt` or the `open-file` relative `file` path — rather than live
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

export type ToastTone = "info" | "error";

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
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
}
