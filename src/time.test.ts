import { describe, expect, it } from "vitest";

import { formatResetCountdown, parseResetsAt } from "./time";

describe("parseResetsAt (#154)", () => {
  it("parses a timezone-aware ISO-8601 string", () => {
    expect(parseResetsAt("2026-04-11T07:00:00+00:00")).toBe(
      Date.parse("2026-04-11T07:00:00+00:00"),
    );
  });

  it("treats a small numeric string as unix seconds", () => {
    expect(parseResetsAt("1760166000")).toBe(1760166000 * 1000);
  });

  it("treats a large numeric string as unix milliseconds", () => {
    expect(parseResetsAt("1760166000000")).toBe(1760166000000);
  });

  it("returns null for null / empty / garbage", () => {
    expect(parseResetsAt(null)).toBeNull();
    expect(parseResetsAt("")).toBeNull();
    expect(parseResetsAt("not a date")).toBeNull();
  });
});

describe("formatResetCountdown (#154)", () => {
  const now = Date.parse("2026-04-11T07:00:00Z");

  it("formats hours and minutes", () => {
    expect(formatResetCountdown(now + (2 * 60 + 14) * 60_000, now)).toBe("2h 14m");
  });

  it("formats minutes only under an hour", () => {
    expect(formatResetCountdown(now + 14 * 60_000, now)).toBe("14m");
  });

  it("shows <1m at or past the reset", () => {
    expect(formatResetCountdown(now + 30_000, now)).toBe("<1m");
    expect(formatResetCountdown(now - 60_000, now)).toBe("<1m");
  });
});
