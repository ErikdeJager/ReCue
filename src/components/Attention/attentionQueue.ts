// Pure membership + ordering for the Attention triage queue (#398). No React / DOM
// so it's unit-testable and shared by the store (dismiss actions), the ViewSwitch
// count badge, the keyboard nav, and the Attention view itself — one source of truth.

import type { SessionView } from "../../types";

export interface AttentionQueueInput {
  sessions: readonly SessionView[];
  /** Sessions currently working (#42) — busy agents are never in the queue. */
  sessionBusy: Record<string, boolean>;
  /** Sessions that have been active at least once (#112). **No longer a membership
   * precondition** (task 410 — a fresh never-worked agent is now surfaced too);
   * retained on the input for API stability so the four call sites keep one signature.
   * The view reads it separately to pick the gray "NEW" vs yellow "IDLE" dot/tag. */
  sessionActive: Record<string, boolean>;
  /** Sessions the user has acknowledged (#398) — excluded until they go busy again. */
  dismissed: Record<string, boolean>;
  /** Timestamp (ms epoch) of each session's most recent busy→idle edge (#398). */
  idleSince: Record<string, number>;
  /** Recurring-owned child session ids (#294) — they render only in their recurring
   * surface, never as their own queue entry. */
  recurringChildIds: Set<string>;
}

/**
 * The Attention queue (#398, expanded by task 410): every agent that currently needs
 * the user — whether it just **started** and hasn't worked yet (a fresh gray "NEW"
 * agent) OR it finished a turn and is **awaiting** input (active-but-idle "IDLE", #112)
 * — in true **FIFO** order (oldest wait first).
 *
 * An agent is a member **iff** it is not busy (`!sessionBusy`) AND has not been
 * dismissed (`!dismissed`), excluding recurring-owned children, exited sessions
 * (`exitedCode != null`), and boot-reconnecting ones. Being active is **no longer**
 * required (task 410) — a freshly spawned idle agent qualifies; it simply drops out the
 * moment it goes busy and re-appears when it settles again. The sort key is the
 * busy→idle edge time `idleSince[id]`, falling back to the session's `createdAt` (unix
 * **seconds**, scaled to ms) for a fresh never-worked agent or a boot-persisted-awaiting
 * one with no recorded transition; ties break by ascending `createdAt` then `id` so the
 * order is stable and deterministic.
 */
export function attentionQueue(input: AttentionQueueInput): SessionView[] {
  const { sessions, sessionBusy, dismissed, idleSince, recurringChildIds } =
    input;

  const members = sessions.filter((s) => {
    if (recurringChildIds.has(s.id)) return false;
    if (s.exitedCode != null) return false;
    if (s.reconnecting) return false;
    if (sessionBusy[s.id]) return false;
    if (dismissed[s.id]) return false;
    return true;
  });

  const sortKey = (s: SessionView): number =>
    idleSince[s.id] ?? s.createdAt * 1000;

  return [...members].sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    if (ka !== kb) return ka - kb;
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * A short, human idle-age label (#398): `""` when the edge time is unknown,
 * `"just now"` under a minute, else `"Xm ago"` under an hour, else `"Xh ago"`. Pure.
 */
export function formatIdleAge(
  idleSinceMs: number | undefined,
  nowMs: number,
): string {
  if (idleSinceMs === undefined) return "";
  const secs = Math.floor((nowMs - idleSinceMs) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}
