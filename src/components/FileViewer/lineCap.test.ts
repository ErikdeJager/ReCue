import { describe, expect, it } from "vitest";

import { LINE_CAP, LINE_CHUNK, lineTruncation, nextVisible } from "./lineCap";

describe("nextVisible", () => {
  it("steps up by the default chunk", () => {
    expect(nextVisible(500, 5000)).toBe(500 + LINE_CHUNK);
  });

  it("steps up by a custom chunk", () => {
    expect(nextVisible(10, 5000, 25)).toBe(35);
  });

  it("clamps to the total when the next step would overshoot", () => {
    expect(nextVisible(900, 1000)).toBe(1000);
  });

  it("never exceeds the total even when already at it", () => {
    expect(nextVisible(1000, 1000)).toBe(1000);
  });

  it("clamps a partial final chunk exactly to the total", () => {
    expect(nextVisible(1742 - 42, 1742)).toBe(1742);
  });
});

describe("lineTruncation", () => {
  it("reports truncation when total exceeds visible", () => {
    const t = lineTruncation(1742, LINE_CAP);
    expect(t.truncated).toBe(true);
    expect(t.total).toBe(1742);
    expect(t.shown).toBe(LINE_CAP);
    expect(t.remaining).toBe(1742 - LINE_CAP);
    expect(t.nextChunk).toBe(LINE_CHUNK);
  });

  it("clamps nextChunk when fewer than a chunk remain", () => {
    // 1742 total, 1000 shown → 742 remain, less than a 1000 chunk.
    const t = lineTruncation(1742, 1000);
    expect(t.truncated).toBe(true);
    expect(t.remaining).toBe(742);
    expect(t.nextChunk).toBe(742);
  });

  it("is not truncated when visible equals total", () => {
    const t = lineTruncation(300, 300);
    expect(t.truncated).toBe(false);
    expect(t.shown).toBe(300);
    expect(t.remaining).toBe(0);
    expect(t.nextChunk).toBe(0);
  });

  it("is not truncated when visible exceeds total (small file under the cap)", () => {
    const t = lineTruncation(12, LINE_CAP);
    expect(t.truncated).toBe(false);
    expect(t.shown).toBe(12);
    expect(t.remaining).toBe(0);
    expect(t.nextChunk).toBe(0);
  });

  it("respects a custom chunk size", () => {
    const t = lineTruncation(100, 40, 25);
    expect(t.truncated).toBe(true);
    expect(t.remaining).toBe(60);
    expect(t.nextChunk).toBe(25);
  });
});
