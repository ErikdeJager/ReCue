// Pure membership + ordering for the Attention triage queue (#398). No React / DOM
// so it's unit-testable and shared by the store (dismiss actions), the ViewSwitch
// count badge, the keyboard nav, and the Attention view itself — one source of truth.

import type { SessionView } from "../../types";

export interface AttentionQueueInput {
  sessions: readonly SessionView[];
  /** Sessions currently working (#42) — busy agents are never in the queue. */
  sessionBusy: Record<string, boolean>;
  /** Sessions that have been active at least once (#112) — the queue's precondition. */
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
 * The Attention queue (#398): the agents that have gone idle and likely need the user
 * — **awaiting** (active-but-idle, #112) — in true **FIFO** order (oldest idle first).
 *
 * An agent is a member **iff** it has been active (`sessionActive`) AND is not busy
 * (`!sessionBusy`) AND has not been dismissed since its last idle edge (`!dismissed`),
 * excluding recurring-owned children, exited sessions (`exitedCode != null`), and
 * boot-reconnecting ones. The sort key is the busy→idle edge time `idleSince[id]`,
 * falling back to the session's `createdAt` (unix **seconds**, scaled to ms) for a
 * boot-persisted-awaiting agent with no recorded transition; ties break by ascending
 * `createdAt` then `id` so the order is stable and deterministic.
 */
export function attentionQueue(input: AttentionQueueInput): SessionView[] {
  const {
    sessions,
    sessionBusy,
    sessionActive,
    dismissed,
    idleSince,
    recurringChildIds,
  } = input;

  const members = sessions.filter((s) => {
    if (recurringChildIds.has(s.id)) return false;
    if (s.exitedCode != null) return false;
    if (s.reconnecting) return false;
    if (!sessionActive[s.id]) return false;
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
