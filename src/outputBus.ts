// Per-session output pub/sub.
//
// Terminal byte streams are deliberately kept OUT of the Zustand store (writing
// every chunk to React state would cause re-render storms). Instead the IPC
// subscription forwards `session://output` here, and the xterm.js terminal
// (task #8) subscribes per session and writes bytes straight into xterm.

// `offset` is the absolute end-offset of this chunk (running total of bytes the
// session has ever produced), forwarded so a terminal can dedupe the scrollback-replay
// ↔ live-stream overlap on a fresh spawn (the stray-glyph fix).
type OutputListener = (bytes: Uint8Array, offset: number) => void;

const listeners = new Map<string, Set<OutputListener>>();

/** Subscribe to a session's output. Returns an unsubscribe function. */
export function onSessionOutput(
  id: string,
  listener: OutputListener,
): () => void {
  let set = listeners.get(id);
  if (!set) {
    set = new Set();
    listeners.set(id, set);
  }
  set.add(listener);
  return () => {
    const current = listeners.get(id);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(id);
  };
}

/** Forward an output chunk (with its absolute end-offset) to all subscribers of `id`. */
export function emitSessionOutput(
  id: string,
  bytes: Uint8Array,
  offset: number,
): void {
  const set = listeners.get(id);
  if (!set) return;
  for (const listener of set) listener(bytes, offset);
}
