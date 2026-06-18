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

// --- Frontend UI state ---

export type View = "overview" | "focus";

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
}
