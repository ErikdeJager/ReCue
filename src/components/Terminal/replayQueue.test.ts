import { describe, expect, it } from "vitest";

import { createReplayQueue } from "./replayQueue";

/** A job whose promise is resolved/rejected by the test, recording when it started. */
function deferredJob(log: string[], key: string) {
  let settle!: (fail?: boolean) => void;
  const job = () =>
    new Promise<void>((resolve, reject) => {
      log.push(key);
      settle = (fail = false) =>
        fail ? reject(new Error(`boom ${key}`)) : resolve();
    });
  return { job, settle: (fail?: boolean) => settle(fail) };
}

/** One macrotask. */
const flush = () => new Promise((r) => setTimeout(r, 0));

/** Two macrotasks: enough for a settled job to release its slot, run the queue's own
 * macrotask `yieldFn`, and start the next job. */
const tick = async () => {
  await flush();
  await flush();
};

/** Spin the event loop until the queue is fully drained (bounded, so a stalled queue
 * fails the test instead of hanging it). */
async function drain(q: { running: number; queued: number }): Promise<void> {
  for (let i = 0; i < 50 && (q.running > 0 || q.queued > 0); i++) await flush();
}

describe("createReplayQueue", () => {
  it("runs at most `limit` jobs at a time", async () => {
    const log: string[] = [];
    const q = createReplayQueue(1);
    const a = deferredJob(log, "a");
    const b = deferredJob(log, "b");

    q.enqueue("a", a.job);
    q.enqueue("b", b.job);

    expect(log).toEqual(["a"]);
    expect(q.running).toBe(1);
    expect(q.queued).toBe(1);

    a.settle();
    await tick();

    expect(log).toEqual(["a", "b"]);
    expect(q.running).toBe(1);
    expect(q.queued).toBe(0);

    b.settle();
    await tick();
    expect(q.running).toBe(0);
  });

  it("honors a limit > 1", async () => {
    const log: string[] = [];
    const q = createReplayQueue(2);
    const a = deferredJob(log, "a");
    const b = deferredJob(log, "b");
    const c = deferredJob(log, "c");

    q.enqueue("a", a.job);
    q.enqueue("b", b.job);
    q.enqueue("c", c.job);

    expect(log).toEqual(["a", "b"]);
    expect(q.running).toBe(2);
    expect(q.queued).toBe(1);

    a.settle();
    b.settle();
    await tick();
    expect(log).toEqual(["a", "b", "c"]);
  });

  it("runs jobs in FIFO order", async () => {
    const log: string[] = [];
    const q = createReplayQueue(1);
    for (const key of ["a", "b", "c", "d"]) {
      q.enqueue(key, async () => {
        log.push(key);
        await Promise.resolve();
      });
    }
    await drain(q);
    expect(log).toEqual(["a", "b", "c", "d"]);
  });

  it("cancel drops a queued job that has not started", async () => {
    const log: string[] = [];
    const q = createReplayQueue(1);
    const a = deferredJob(log, "a");

    q.enqueue("a", a.job);
    q.enqueue("b", async () => {
      log.push("b");
    });
    q.enqueue("c", async () => {
      log.push("c");
    });

    q.cancel("b");
    expect(q.queued).toBe(1);

    a.settle();
    await drain(q);

    expect(log).toEqual(["a", "c"]);
  });

  it("cancel does not interrupt an already-started job", async () => {
    const log: string[] = [];
    const q = createReplayQueue(1);
    const a = deferredJob(log, "a");

    q.enqueue("a", a.job);
    expect(log).toEqual(["a"]);

    q.cancel("a");
    a.settle();
    await drain(q);

    // it ran (and completed) — cancel only prunes the waiting queue
    expect(log).toEqual(["a"]);
    expect(q.running).toBe(0);
  });

  it("a rejecting job does not stall the queue", async () => {
    const log: string[] = [];
    const q = createReplayQueue(1);
    const a = deferredJob(log, "a");

    q.enqueue("a", a.job);
    q.enqueue("b", async () => {
      log.push("b");
    });

    a.settle(true); // reject
    await drain(q);

    expect(log).toEqual(["a", "b"]);
    expect(q.running).toBe(0);
    expect(q.queued).toBe(0);
  });

  it("a synchronously-throwing job does not stall the queue", async () => {
    const log: string[] = [];
    const q = createReplayQueue(1);

    q.enqueue("a", () => {
      log.push("a");
      throw new Error("sync boom");
    });
    q.enqueue("b", async () => {
      log.push("b");
    });

    await drain(q);

    expect(log).toEqual(["a", "b"]);
    expect(q.running).toBe(0);
  });

  it("yields between jobs (the yieldFn runs once per finished job)", async () => {
    const order: string[] = [];
    const q = createReplayQueue(1, async () => {
      order.push("yield");
    });

    q.enqueue("a", async () => {
      order.push("a");
    });
    q.enqueue("b", async () => {
      order.push("b");
    });

    await drain(q);
    expect(order).toEqual(["a", "yield", "b", "yield"]);
  });

  it("a throwing yieldFn cannot wedge the queue", async () => {
    const log: string[] = [];
    const q = createReplayQueue(1, () => Promise.reject(new Error("nope")));

    q.enqueue("a", async () => {
      log.push("a");
    });
    q.enqueue("b", async () => {
      log.push("b");
    });

    await drain(q);

    expect(log).toEqual(["a", "b"]);
  });
});
