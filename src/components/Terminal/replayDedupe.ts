// Deduplicate the terminal's scrollback-replay against the live output stream.
//
// On a FRESH spawn, claude starts producing output before its terminal mounts, so by
// the time `createHost` subscribes to live output and fetches the backend scrollback,
// the same startup bytes live in BOTH: the scrollback snapshot AND the buffered live
// chunks. Writing both applies claude's cursor-positioned startup paint twice, which
// (because claude renders spacing with cursor-forward `ESC[1C` moves that don't erase)
// leaves a stray glyph — the reported stray-"C" on Windows/ConPTY. A resumed session
// subscribes before any output, so it never overlaps.
//
// Every live chunk carries its absolute end-offset (running total of bytes the session
// has ever produced) and the scrollback carries its own end-offset; both come from the
// same backend counter, so we can drop exactly the overlap.

/**
 * Given a live `bytes` chunk that covers absolute bytes `[offset - bytes.length, offset)`
 * and the replayed scrollback's absolute end-offset `scrollbackEnd`, return the portion
 * of the chunk NOT already covered by the scrollback:
 *  - fully within scrollback (`offset <= scrollbackEnd`) → empty,
 *  - fully after scrollback (`start >= scrollbackEnd`) → the whole chunk,
 *  - straddling → just the tail beyond `scrollbackEnd`.
 */
export function dedupeAgainstScrollback(
  bytes: Uint8Array,
  offset: number,
  scrollbackEnd: number,
): Uint8Array {
  const start = offset - bytes.length;
  if (offset <= scrollbackEnd) return bytes.subarray(0, 0);
  if (start >= scrollbackEnd) return bytes;
  return bytes.subarray(scrollbackEnd - start);
}
