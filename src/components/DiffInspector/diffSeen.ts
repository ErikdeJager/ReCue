// Pure "seen" review-marker helpers for the diff viewer (#278). Kept React-free so the
// content-digest + tri-state logic is unit-tested without the DOM. The component owns
// the persisted `{ [repoPath]: { [filePath]: digest } }` map (via the store); these
// functions just derive a file's digest + its review state from a stored digest.

import type { FileDiff } from "../../types";

/** A changed file's review state (#278):
 *  - `notSeen`  — never marked reviewed;
 *  - `seen`     — marked reviewed and its diff content is unchanged since;
 *  - `changed`  — was marked seen, but its diff content changed afterward. */
export type SeenState = "notSeen" | "seen" | "changed";

/**
 * cyrb53 — a small, fast, well-distributed 53-bit string hash (no crypto needed; we
 * only need to detect that a file's diff content changed since it was marked seen).
 * Returns a base-36 string so the persisted digest stays short. Pure + deterministic.
 */
function cyrb53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const result = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return result.toString(36);
}

/**
 * A stable content digest for one changed file. Combines the file's `status`, its
 * add/del counts, and the **full parsed hunks** (`JSON.stringify(file.hunks)`) — so any
 * change to the diff content (even one the panel truncates at 600 rendered rows) flips
 * the digest. Pure: depends only on the `FileDiff`.
 */
export function fileDigest(file: FileDiff): string {
  return cyrb53(
    `${file.status}|${file.add}|${file.del}|${JSON.stringify(file.hunks)}`,
  );
}

/**
 * Derive a file's review state from the digest stored when it was last marked seen
 * (`undefined` when never marked). A stored digest that matches the file's current
 * digest is `seen`; one that differs is `changed`; an absent digest is `notSeen`.
 */
export function seenState(
  file: FileDiff,
  storedDigest: string | undefined,
): SeenState {
  if (storedDigest === undefined) return "notSeen";
  return fileDigest(file) === storedDigest ? "seen" : "changed";
}
