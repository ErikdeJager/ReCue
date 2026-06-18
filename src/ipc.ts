// Typed IPC layer: thin wrappers over the Tauri commands plus session-event
// subscription. Keeping every `invoke` call here means the rest of the app talks
// to typed functions, not stringly-typed command names.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

import type {
  BranchList,
  ExitPayload,
  OutputPayload,
  SessionRecord,
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

export const resumeSession = (id: string) =>
  invoke<SessionRecord>("resume_session", { id });

export const writeStdin = (id: string, data: string) =>
  invoke<void>("write_stdin", { id, data });

export const resizePty = (id: string, cols: number, rows: number) =>
  invoke<void>("resize_pty", { id, cols, rows });

export const killSession = (id: string) => invoke<void>("kill_session", { id });

export const sessionScrollback = (id: string) =>
  invoke<number[]>("session_scrollback", { id });

export const listSessions = () => invoke<SessionRecord[]>("list_sessions");

export const listRecents = () => invoke<string[]>("list_recents");

/** Drop a folder from persisted recents (the "Forget" action, #31). */
export const removeRecent = (path: string) =>
  invoke<void>("remove_recent", { path });

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
}

/** Subscribe to the per-session output/exit events. Returns an unlisten fn. */
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
  return () => {
    unlistenOutput();
    unlistenExited();
  };
}
