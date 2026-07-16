// Pure same-file soft-claim helpers (Multi-window task 435). The Rust
// `file_claims.rs` registry owns the state ((repo_path, file) → window label);
// every window mirrors its `file_claims://changed` broadcasts into the transient
// `store.fileClaims` map. These helpers are the map's key scheme plus the two
// decisions `useAutoSaveFile` needs: "is this file held by a FOREIGN window?"
// (`heldElsewhere` → read-only + Take over) and "should this hook instance
// assert/drop its claim right now?" (`claimIntent`). Pure and unit-tested;
// nothing here touches IPC or the store.

import type { FileClaim } from "./types";

/**
 * Map key for a claim. NUL never appears in a path on any OS, so the join is
 * collision-free; keys are **exact strings** (no normalization/canonicalization
 * — panels replicate across windows from the shared persisted blobs, so the
 * spellings match by construction).
 */
export function claimKey(repoPath: string, file: string): string {
  return `${repoPath}\u0000${file}`;
}

/** The broadcast/snapshot list → the store's `fileClaims` map (claimKey → label). */
export function claimsToMap(claims: FileClaim[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const c of claims) map[claimKey(c.repo_path, c.file)] = c.window;
  return map;
}

/**
 * The FOREIGN window holding `{repoPath, file}`, or `null` when the file is free
 * or held by this window (`ownLabel`) — own-label claims are invisible, so a
 * single window editing a file behaves exactly as before task 435.
 */
export function heldElsewhere(
  map: Record<string, string>,
  repoPath: string,
  file: string,
  ownLabel: string,
): string | null {
  const holder = map[claimKey(repoPath, file)];
  return holder !== undefined && holder !== ownLabel ? holder : null;
}

export type ClaimIntent = "claim" | "release" | "none";

/**
 * When should this hook instance assert / drop its soft claim (task 435)? Pure —
 * the single decision point every `useAutoSaveFile` claim-lifecycle call site
 * routes through. The pinned truth table:
 * - `"claim"` when `!held && !lockedByOther && (focused || dirty)` — the editor
 *   engaged (focus) or mutated without focus (the Kanban drag path).
 * - `"release"` when `held && !focused && !dirty` — blurred/idle AND clean (a
 *   manual-mode dirty buffer keeps the claim past blur until Save settles).
 * - `"none"` in every `lockedByOther` state (a locked editor never claims, and a
 *   lost claim is surrendered by the loss-of-claim effect, never "released" —
 *   that would race the new holder) and in all remaining combinations.
 */
export function claimIntent(s: {
  held: boolean;
  focused: boolean;
  dirty: boolean;
  lockedByOther: boolean;
}): ClaimIntent {
  if (s.lockedByOther) return "none";
  if (!s.held && (s.focused || s.dirty)) return "claim";
  if (s.held && !s.focused && !s.dirty) return "release";
  return "none";
}
