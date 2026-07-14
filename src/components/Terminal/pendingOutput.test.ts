import { describe, expect, it } from "vitest";

import {
  PENDING_CAP_BYTES,
  type PendingChunk,
  pushPending,
} from "./pendingOutput";

const chunk = (size: number, offset: number): PendingChunk => ({
  bytes: new Uint8Array(size),
  offset,
});

const totalBytes = (p: PendingChunk[]) =>
  p.reduce((n, c) => n + c.bytes.length, 0);

describe("pushPending", () => {
  it("appends in order while under the cap", () => {
    const pending: PendingChunk[] = [];
    pushPending(pending, chunk(10, 10), 100);
    pushPending(pending, chunk(20, 30), 100);
    pushPending(pending, chunk(30, 60), 100);
    expect(pending.map((c) => c.offset)).toEqual([10, 30, 60]);
    expect(totalBytes(pending)).toBe(60);
  });

  it("drops the OLDEST chunks once the cap is exceeded, preserving order", () => {
    const pending: PendingChunk[] = [];
    pushPending(pending, chunk(40, 40), 100);
    pushPending(pending, chunk(40, 80), 100);
    pushPending(pending, chunk(40, 120), 100);
    // 120 > 100 → the first (offset 40) is dropped
    expect(pending.map((c) => c.offset)).toEqual([80, 120]);
    expect(totalBytes(pending)).toBe(80);

    pushPending(pending, chunk(40, 160), 100);
    expect(pending.map((c) => c.offset)).toEqual([120, 160]);
    expect(totalBytes(pending)).toBeLessThanOrEqual(100);
  });

  it("drops as many old chunks as needed in one push", () => {
    const pending: PendingChunk[] = [];
    for (let i = 1; i <= 5; i++) pushPending(pending, chunk(10, i * 10), 1000);
    expect(pending).toHaveLength(5);
    // a single big chunk evicts everything older
    pushPending(pending, chunk(95, 145), 100);
    expect(pending.map((c) => c.offset)).toEqual([145]);
  });

  it("always keeps the newest chunk even if it alone exceeds the cap", () => {
    const pending: PendingChunk[] = [];
    pushPending(pending, chunk(10, 10), 100);
    pushPending(pending, chunk(500, 510), 100);
    expect(pending.map((c) => c.offset)).toEqual([510]);
    expect(totalBytes(pending)).toBe(500);
  });

  it("keeps everything with an infinite cap", () => {
    const pending: PendingChunk[] = [];
    for (let i = 1; i <= 20; i++) {
      pushPending(pending, chunk(1000, i * 1000), Number.POSITIVE_INFINITY);
    }
    expect(pending).toHaveLength(20);
    expect(totalBytes(pending)).toBe(20_000);
  });

  it("mutates and returns the same array", () => {
    const pending: PendingChunk[] = [];
    const out = pushPending(pending, chunk(1, 1), PENDING_CAP_BYTES);
    expect(out).toBe(pending);
    expect(PENDING_CAP_BYTES).toBeGreaterThan(0);
  });
});
