import { describe, expect, it } from "vitest";

import {
  formatFireTime,
  formatResetCountdown,
  parseResetsAt,
  toLocalInput,
} from "./time";

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
    expect(formatResetCountdown(now + (2 * 60 + 14) * 60_000, now)).toBe(
      "2h 14m",
    );
  });

  it("formats minutes only under an hour", () => {
    expect(formatResetCountdown(now + 14 * 60_000, now)).toBe("14m");
  });

  it("shows <1m at or past the reset", () => {
    expect(formatResetCountdown(now + 30_000, now)).toBe("<1m");
    expect(formatResetCountdown(now - 60_000, now)).toBe("<1m");
  });
});

describe("toLocalInput (#93/#94)", () => {
  it("formats a local Date as a zero-padded datetime-local value", () => {
    // Jan 5 2026, 09:07 local — every field needs zero-padding.
    expect(toLocalInput(new Date(2026, 0, 5, 9, 7))).toBe("2026-01-05T09:07");
  });

  it("leaves already-two-digit fields unpadded", () => {
    // Dec 25 2026, 13:30 local.
    expect(toLocalInput(new Date(2026, 11, 25, 13, 30))).toBe(
      "2026-12-25T13:30",
    );
  });

  it("renders midnight as 00:00 (not blank)", () => {
    expect(toLocalInput(new Date(2026, 5, 1, 0, 0))).toBe("2026-06-01T00:00");
  });
});

describe("formatFireTime (#93/#94)", () => {
  it("interprets the input as epoch SECONDS (×1000 → ms)", () => {
    // The value is stored in seconds; the helper must multiply to ms. Compare
    // against the same locale-aware formatting so the assertion is timezone- and
    // locale-robust while still pinning the seconds→ms conversion + options.
    const local = new Date(2026, 5, 21, 15, 45, 30); // Jun 21 2026, 3:45:30 PM
    const fireAtSecs = Math.floor(local.getTime() / 1000);
    const expected = new Date(fireAtSecs * 1000).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    expect(formatFireTime(fireAtSecs)).toBe(expected);
  });

  it("includes the day-of-month in the rendered string", () => {
    const local = new Date(2026, 5, 21, 15, 45);
    const fireAtSecs = Math.floor(local.getTime() / 1000);
    expect(formatFireTime(fireAtSecs)).toContain("21");
  });
});
