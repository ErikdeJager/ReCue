// The pre-replay pending-output buffer (#351).
//
// A pooled terminal buffers the live chunks that arrive BEFORE its historical scrollback
// has been replayed, so history and live bytes never interleave. Since #351 the replay is
// queued (see `replayQueue.ts`), so a terminal can sit in that pre-replay state for longer
// than one IPC round-trip — a very chatty agent could otherwise grow the buffer without
// bound while it waits its turn. Hence the cap.
//
// **Why dropping the oldest chunks is safe.** The cap is only applied WHILE THE SCROLLBACK
// FETCH HAS NOT YET BEEN DISPATCHED. The backend pushes bytes into its `Scrollback` ring
// *before* it emits them, so every chunk buffered before dispatch has an absolute
// end-offset ≤ the snapshot's `end`: those bytes are therefore either (a) still inside the
// backend's 256 KB window and replayed by the snapshot, or (b) already evicted from it —
// in which case no client could have shown them anyway. Dropping them can never leave a
// hole *above* `end`, which is the only region `dedupeAgainstScrollback` relies on.
// Once the fetch has been dispatched the pool passes `Number.POSITIVE_INFINITY` as the cap:
// the in-flight window is a single IPC round-trip (so the buffer stays small) and every
// byte above `end` must be preserved for the dedupe to hand it to xterm.
//
// Pure (no DOM / xterm / Tauri) so it is unit-tested in the node-env vitest.

export interface PendingChunk {
  bytes: Uint8Array;
  /** Absolute end-offset of this chunk in the session's byte stream. */
  offset: number;
}

/** ~2 MB of pre-dispatch live output is far more than a replay ever waits for. */
export const PENDING_CAP_BYTES = 2 * 1024 * 1024;

/**
 * Append `chunk` to `pending` (mutating it, and returning it for convenience), then drop
 * the OLDEST chunks while the buffered total exceeds `capBytes`. Order is preserved.
 * A `capBytes` of `Number.POSITIVE_INFINITY` keeps everything. The newest chunk is always
 * kept, even if it alone exceeds the cap.
 */
export function pushPending(
  pending: PendingChunk[],
  chunk: PendingChunk,
  capBytes: number,
): PendingChunk[] {
  pending.push(chunk);
  if (!Number.isFinite(capBytes)) return pending;
  let total = 0;
  for (const c of pending) total += c.bytes.length;
  while (total > capBytes && pending.length > 1) {
    const dropped = pending.shift();
    total -= dropped ? dropped.bytes.length : 0;
  }
  return pending;
}
