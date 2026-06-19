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

// --- Frontend UI state ---

export type View = "overview" | "focus" | "canvas";

// --- Canvas (#46): a recursive binary split-panel (BSP) layout tree ---

/** What a Canvas leaf shows. #46 uses `kind: "placeholder"`; #47 adds real
 * content kinds (agent / file / diff) with the extra fields below. */
export interface CanvasContent {
  kind: string;
  label?: string;
  repoPath?: string;
  file?: string;
  sessionId?: string;
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
}
