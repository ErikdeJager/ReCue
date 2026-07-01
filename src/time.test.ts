import { describe, expect, it } from "vitest";

import {
  formatFireTime,
  formatInterval,
  formatNextRun,
  formatResetCountdown,
  intervalToSeconds,
  parseResetsAt,
  parseWhen,
  secondsToInterval,
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

describe("intervalToSeconds (#294)", () => {
  it("converts each unit", () => {
    expect(intervalToSeconds(5, "minute")).toBe(300);
    expect(intervalToSeconds(2, "hour")).toBe(7200);
    expect(intervalToSeconds(3, "day")).toBe(259200);
  });

  it("floors at 60s (1 minute)", () => {
    // A sub-minute amount is impossible via the unit list, but a rounding-to-zero
    // or blank amount must never produce a hot-looping interval.
    expect(intervalToSeconds(0, "minute")).toBe(60);
    expect(intervalToSeconds(-5, "hour")).toBe(60);
    expect(intervalToSeconds(Number.NaN, "day")).toBe(60);
  });

  it("rounds a fractional amount", () => {
    expect(intervalToSeconds(1.4, "hour")).toBe(3600);
    expect(intervalToSeconds(2.6, "minute")).toBe(180);
  });
});

describe("secondsToInterval (#294)", () => {
  it("prefers the largest whole unit", () => {
    expect(secondsToInterval(86400)).toEqual({ amount: 1, unit: "day" });
    expect(secondsToInterval(7200)).toEqual({ amount: 2, unit: "hour" });
    expect(secondsToInterval(300)).toEqual({ amount: 5, unit: "minute" });
  });

  it("falls back to minutes when not whole hours/days", () => {
    // 90000s = 25h, not a whole day → hours.
    expect(secondsToInterval(90000)).toEqual({ amount: 25, unit: "hour" });
    // 5400s = 90m, not a whole hour → minutes.
    expect(secondsToInterval(5400)).toEqual({ amount: 90, unit: "minute" });
  });

  it("floors below the 60s minimum", () => {
    expect(secondsToInterval(30)).toEqual({ amount: 1, unit: "minute" });
  });

  it("round-trips with intervalToSeconds", () => {
    for (const secs of [60, 300, 3600, 7200, 86400, 172800]) {
      const { amount, unit } = secondsToInterval(secs);
      expect(intervalToSeconds(amount, unit)).toBe(secs);
    }
  });
});

describe("formatInterval (#294)", () => {
  it("pluralizes", () => {
    expect(formatInterval(3600)).toBe("every 1 hour");
    expect(formatInterval(7200)).toBe("every 2 hours");
    expect(formatInterval(60)).toBe("every 1 minute");
    expect(formatInterval(86400)).toBe("every 1 day");
  });
});

describe("formatNextRun (#294)", () => {
  const now = Date.parse("2026-04-11T07:00:00Z");

  it("reads 'now' when due", () => {
    expect(formatNextRun(Math.floor(now / 1000) - 10, now)).toBe(
      "next run now",
    );
  });

  it("reads a relative countdown when future", () => {
    expect(formatNextRun(Math.floor(now / 1000) + 5 * 60, now)).toBe(
      "next run in 5m",
    );
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

describe("formatFireTime (#93/#94/#232)", () => {
  // A fixed "now" on a DIFFERENT day than the fire times below, so the date-included
  // path is exercised deterministically (independent of the real clock).
  const otherDay = new Date(2026, 5, 28, 9, 0); // Jun 28 2026, 9:00 AM

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
    expect(formatFireTime(fireAtSecs, otherDay)).toBe(expected);
  });

  it("includes the day-of-month for a fire time on another day (#232)", () => {
    const local = new Date(2026, 5, 21, 15, 45);
    const fireAtSecs = Math.floor(local.getTime() / 1000);
    expect(formatFireTime(fireAtSecs, otherDay)).toContain("21");
  });

  it("shows only the time when the fire time is today (#232)", () => {
    const now = new Date(2026, 5, 28, 9, 0); // Jun 28 2026, 9:00 AM
    const fireAt = new Date(2026, 5, 28, 15, 45); // same day, 3:45 PM
    const fireAtSecs = Math.floor(fireAt.getTime() / 1000);
    const out = formatFireTime(fireAtSecs, now);
    // Time-only: matches the locale time and omits the month/day.
    const timeOnly = fireAt.toLocaleString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    expect(out).toBe(timeOnly);
    expect(out).not.toContain("28");
    expect(out).not.toMatch(/Jun/);
  });
});

describe("parseWhen (#268)", () => {
  // A fixed local "now": Tue Jun 30 2026, 14:00 (2:00 PM). All assertions are
  // relative to this so the clock is deterministic.
  const now = new Date(2026, 5, 30, 14, 0, 0);

  // Helper: assert the parse resolved to a specific local Y/M/D H:M.
  const expectAt = (
    input: string,
    y: number,
    mo: number,
    d: number,
    h: number,
    mi: number,
  ) => {
    const r = parseWhen(input, now);
    expect(r, `parseWhen(${JSON.stringify(input)})`).not.toBeNull();
    expect(r!.at.getTime()).toBe(new Date(y, mo, d, h, mi, 0, 0).getTime());
  };

  describe("relative durations (always future)", () => {
    it('"1h" → in one hour', () => {
      expectAt("1h", 2026, 5, 30, 15, 0);
      expect(parseWhen("1h", now)!.label).toBe("in 1 hour");
    });

    it('"1 hour" → in one hour', () => {
      expectAt("1 hour", 2026, 5, 30, 15, 0);
      expect(parseWhen("1 hour", now)!.label).toBe("in 1 hour");
    });

    it('"30m" → in thirty minutes', () => {
      expectAt("30m", 2026, 5, 30, 14, 30);
      expect(parseWhen("30m", now)!.label).toBe("in 30 minutes");
    });

    it('"90 min" → in ninety minutes', () => {
      expectAt("90 min", 2026, 5, 30, 15, 30);
      expect(parseWhen("90 min", now)!.label).toBe("in 90 minutes");
    });

    it('compound "1h 30m" → ninety minutes out', () => {
      expectAt("1h 30m", 2026, 5, 30, 15, 30);
      expect(parseWhen("1h 30m", now)!.label).toBe("in 1 hour 30 minutes");
    });

    it('fractional "1.5h" → ninety minutes out', () => {
      expectAt("1.5h", 2026, 5, 30, 15, 30);
      expect(parseWhen("1.5h", now)!.label).toBe("in 1.5 hours");
    });

    it('"2 days" → two days out', () => {
      expectAt("2 days", 2026, 6, 2, 14, 0);
      expect(parseWhen("2 days", now)!.label).toBe("in 2 days");
    });

    it('an optional leading "in" is accepted', () => {
      expectAt("in 1 hour", 2026, 5, 30, 15, 0);
    });

    it("a zero duration is rejected", () => {
      expect(parseWhen("0m", now)).toBeNull();
    });
  });

  describe("clock times today / tomorrow", () => {
    it('"15:00" → today 3 PM (still future)', () => {
      expectAt("15:00", 2026, 5, 30, 15, 0);
      expect(parseWhen("15:00", now)!.label).toBe("today 15:00");
    });

    it('"6pm" / "6 PM" / "6 pm" all → today 18:00', () => {
      for (const v of ["6pm", "6 PM", "6 pm"]) {
        expectAt(v, 2026, 5, 30, 18, 0);
        expect(parseWhen(v, now)!.label).toBe("today 18:00");
      }
    });

    it('"9:30am" already passed today → tomorrow 09:30', () => {
      expectAt("9:30am", 2026, 6, 1, 9, 30);
      expect(parseWhen("9:30am", now)!.label).toBe("tomorrow 09:30");
    });

    it('"9.30pm" (dot separator) → today 21:30', () => {
      expectAt("9.30pm", 2026, 5, 30, 21, 30);
    });

    it('"12pm" → noon, "12am" → midnight (both past 14:00 → tomorrow)', () => {
      // 12:00 (noon) is before now 14:00 → rolls to tomorrow noon.
      expectAt("12pm", 2026, 6, 1, 12, 0);
      // 12am = 00:00 today is past → tomorrow midnight.
      expectAt("12am", 2026, 6, 1, 0, 0);
    });
  });

  describe("a bare time already past today rolls to tomorrow", () => {
    it('"1pm" (13:00 < now 14:00) → tomorrow 13:00', () => {
      expectAt("1pm", 2026, 6, 1, 13, 0);
      expect(parseWhen("1pm", now)!.label).toBe("tomorrow 13:00");
    });
  });

  describe("explicit day prefixes", () => {
    it('"tomorrow 9am" → tomorrow 09:00', () => {
      expectAt("tomorrow 9am", 2026, 6, 1, 9, 0);
      expect(parseWhen("tomorrow 9am", now)!.label).toBe("tomorrow 09:00");
    });

    it('"today 16:00" → today 16:00 (even later today)', () => {
      expectAt("today 16:00", 2026, 5, 30, 16, 0);
      expect(parseWhen("today 16:00", now)!.label).toBe("today 16:00");
    });

    it('"tomorrow" with no time defaults to 09:00', () => {
      expectAt("tomorrow", 2026, 6, 1, 9, 0);
    });

    it("a bad time after the prefix is rejected", () => {
      expect(parseWhen("tomorrow nonsense", now)).toBeNull();
    });
  });

  describe("the machine toLocalInput value round-trips exactly", () => {
    it("parses YYYY-MM-DDTHH:MM as a local-clock time (past or future)", () => {
      // A future schedule.
      expectAt("2026-07-02T15:45", 2026, 6, 2, 15, 45);
      // toLocalInput → parseWhen → toLocalInput is identity.
      const seeded = toLocalInput(new Date(2026, 6, 2, 15, 45));
      const r = parseWhen(seeded, now);
      expect(r).not.toBeNull();
      expect(toLocalInput(r!.at)).toBe(seeded);
    });
  });

  describe("explicit future dates (Date.parse fallback)", () => {
    it("accepts a future date+time string", () => {
      const r = parseWhen("2026-12-25 08:00", now);
      expect(r).not.toBeNull();
      expect(r!.at.getFullYear()).toBe(2026);
      expect(r!.at.getMonth()).toBe(11);
      expect(r!.at.getDate()).toBe(25);
    });
  });

  describe("unparseable input → null", () => {
    it.each(["", "   ", "blah", "next week", "1h foo", "1 month", "soon"])(
      "%j is null",
      (v) => {
        expect(parseWhen(v, now)).toBeNull();
      },
    );
  });
});
