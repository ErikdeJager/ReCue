// Bounded-concurrency FIFO queue for terminal scrollback replays (#351).
//
// Creating a pooled terminal fetches up to 256 KB of backend scrollback and writes it
// into xterm — an ANSI parse on the single WebView main thread. When several terminals
// become visible in the same frame (a boot straight into an Overview wall, or a fast
// scroll across the wall), running those replays concurrently means N × (IPC round-trip
// + 256 KB parse) racing each other on one thread, so nothing paints until they all
// finish. Serializing them through this queue (`MAX_CONCURRENT_REPLAYS = 1` in the pool)
// makes the FIRST terminal paint as fast as a single replay, and yields a macrotask
// between jobs so the webview can paint / process input in between.
//
// Kept pure (no DOM, no xterm, no Tauri) so it runs in the node-env vitest — the repo's
// convention for pool logic (`poolReconcile.ts`, `replayDedupe.ts`, `webglRenderer.ts`).

interface QueuedJob {
  key: string;
  job: () => Promise<void>;
}

export interface ReplayQueue {
  /** Append a job. Jobs run in FIFO order, at most `limit` at a time. */
  enqueue(key: string, job: () => Promise<void>): void;
  /** Drop any not-yet-started job for `key` (an already-running one is left alone). */
  cancel(key: string): void;
  /** Jobs waiting to start (tests). */
  readonly queued: number;
  /** Jobs currently running (tests). */
  readonly running: number;
}

/** A macrotask gap: lets the webview paint / handle input between two replays. */
const macrotask = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Create a bounded-concurrency FIFO queue.
 *
 * - At most `limit` jobs run at once; the rest wait in insertion order.
 * - A job that REJECTS is treated exactly like one that resolves (its error is
 *   swallowed) — a failing scrollback fetch must never stall the queue.
 * - After each job settles the queue awaits `yieldFn()` before starting the next.
 * - `cancel(key)` removes queued entries with that key. A job already started is not
 *   interrupted (the pool's `disposed` flag makes it a no-op instead).
 */
export function createReplayQueue(
  limit: number,
  yieldFn: () => Promise<void> = macrotask,
): ReplayQueue {
  const q: QueuedJob[] = [];
  let running = 0;

  const pump = (): void => {
    while (running < limit && q.length > 0) {
      const next = q.shift();
      if (!next) return;
      running += 1;
      void (async () => {
        try {
          await next.job();
        } catch {
          // a failed replay (no scrollback, backend unavailable, disposed host) is
          // never fatal — the terminal just starts empty and live output flows in
        }
        running -= 1;
        try {
          await yieldFn();
        } catch {
          // a custom yieldFn must not be able to wedge the queue either
        }
        pump();
      })();
    }
  };

  return {
    enqueue(key, job) {
      q.push({ key, job });
      pump();
    },
    cancel(key) {
      for (let i = q.length - 1; i >= 0; i--) {
        if (q[i]?.key === key) q.splice(i, 1);
      }
    },
    get queued() {
      return q.length;
    },
    get running() {
      return running;
    },
  };
}
