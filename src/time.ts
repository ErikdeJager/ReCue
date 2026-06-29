// Small shared time helpers for scheduled sessions (#93/#94). Times are the local
// machine clock (the scheduling engine fires on the local clock).

/** Format a Date as a local `<input type="datetime-local">` value (no timezone
 * suffix — datetime-local is local-clock). */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Compact local fire time for a schedule. When the fire time is on the **same local
 * calendar day** as `now`, show only the time (e.g. "3:45 PM") to keep the UI cleaner
 * (#232); any other day keeps the date + time (e.g. "Jun 21, 3:45 PM"). `now` is
 * injectable so the "today" check is unit-testable with a fixed clock. */
export function formatFireTime(fireAt: number, now: Date = new Date()): string {
  const at = new Date(fireAt * 1000);
  const isToday =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate();
  return at.toLocaleString(
    [],
    isToday
      ? { hour: "numeric", minute: "2-digit" }
      : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  );
}

// Persistent helper copy shown beneath the natural-language launch-time field
// (#268) — shared by the New Session modal schedule step and the ScheduledPanel so
// the wording stays in lockstep.
export const SCHEDULE_TIME_HINT =
  "Type a time or duration — e.g. 1h, 30m, 15:00, 6pm, tomorrow 9am";

const zeroPad = (n: number) => String(n).padStart(2, "0");

// Duration units → milliseconds, keyed by the normalized kind.
const UNIT_MS: Record<"minute" | "hour" | "day", number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
};

/** Normalize a matched duration unit token to its kind (minute / hour / day). */
function unitKind(unit: string): "minute" | "hour" | "day" | null {
  if (unit === "m" || unit.startsWith("min")) return "minute";
  if (unit.startsWith("h")) return "hour";
  if (unit.startsWith("d")) return "day";
  return null;
}

/** "in 1 hour 30 minutes" — pluralized friendly echo of a parsed duration. */
function humanizeDuration(
  parts: { value: number; kind: "minute" | "hour" | "day" }[],
): string {
  const pieces = parts.map((p) => {
    const noun = p.kind;
    return `${p.value} ${p.value === 1 ? noun : `${noun}s`}`;
  });
  return `in ${pieces.join(" ")}`;
}

/** Parse a (possibly compound) relative duration like "1h", "30 min", "1h 30m",
 * "2 days" → total milliseconds + a friendly label. Returns null unless the WHOLE
 * string is duration tokens (so "1h foo" / "1 month" are rejected). */
function parseDuration(input: string): { ms: number; label: string } | null {
  const re =
    /(\d+(?:\.\d+)?)\s*(minutes|minute|mins|min|hours|hour|hrs|hr|days|day|m|h|d)/g;
  let matched = false;
  let totalMs = 0;
  const parts: { value: number; kind: "minute" | "hour" | "day" }[] = [];
  const leftover = input.replace(re, (full, num: string, unit: string) => {
    const kind = unitKind(unit);
    if (!kind) return full;
    const value = parseFloat(num);
    totalMs += value * UNIT_MS[kind];
    parts.push({ value, kind });
    matched = true;
    return " ";
  });
  if (!matched || totalMs <= 0) return null;
  if (leftover.trim() !== "") return null;
  return { ms: totalMs, label: humanizeDuration(parts) };
}

/** Parse a clock time — "15:00", "6pm", "6 PM", "9:30am", "9.30pm", or a bare hour
 * "6" (24h). Returns the {hours, minutes} (24h) or null when out of range / shaped
 * wrong. Day rolling is the caller's job. */
function parseClock(input: string): { hours: number; minutes: number } | null {
  const m = input.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  const ampm = m[3]?.toLowerCase();
  if (minutes > 59) return null;
  if (ampm) {
    if (hours < 1 || hours > 12) return null;
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }
  return { hours, minutes };
}

/** "today" / "tomorrow" / null for a target relative to `now` (local calendar). */
function dayWord(at: Date, now: Date): "today" | "tomorrow" | null {
  const a = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const n = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((a.getTime() - n.getTime()) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  return null;
}

/** Friendly echo for an absolute target time: "today 18:00" / "tomorrow 09:30",
 * else "Jun 30 18:00" (a short date + 24h clock). */
function whenLabel(at: Date, now: Date): string {
  const time = `${zeroPad(at.getHours())}:${zeroPad(at.getMinutes())}`;
  const word = dayWord(at, now);
  if (word) return `${word} ${time}`;
  const date = at.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${date} ${time}`;
}

/**
 * Natural-language launch-time parser for scheduled sessions (#268). Accepts, in
 * order:
 *  - the machine `toLocalInput` value ("2026-06-30T16:00") — parsed from its
 *    components as a local-clock time, accepted regardless of past/future so
 *    re-saving an existing schedule's name/prompt never drifts its seeded time;
 *  - "today <time>" / "tomorrow <time>" (time optional → 09:00);
 *  - a relative duration ("1h", "1 hour", "30m", "90 min", "1h 30m", "2 days",
 *    optional leading "in"), always in the future;
 *  - a bare clock time ("15:00", "6pm", "6 PM", "9:30am", "9.30pm"), today, rolled
 *    to tomorrow when already past `now`;
 *  - any other date string `Date.parse` understands, taken as-is when in the future.
 *
 * Returns the resolved `at` Date plus a short friendly `label` ("in 1 hour",
 * "today 18:00", "tomorrow 09:30") for the live preview, or `null` when the input
 * can't be read. Pure + `now`-injectable so it's fully unit-testable with a fixed
 * clock; the caller renders the absolute time via `formatFireTime`.
 */
export function parseWhen(
  input: string,
  now: Date = new Date(),
): { at: Date; label: string } | null {
  const raw = input.trim();
  if (!raw) return null;
  const lc = raw.toLowerCase();

  // 1. The exact machine `toLocalInput` value (YYYY-MM-DDTHH:MM), local-clock.
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (iso) {
    const at = new Date(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3]),
      Number(iso[4]),
      Number(iso[5]),
      0,
      0,
    );
    return Number.isNaN(at.getTime())
      ? null
      : { at, label: whenLabel(at, now) };
  }

  // 2. "today <time>" / "tomorrow <time>" — explicit day + a clock (default 09:00).
  const dayMatch = lc.match(/^(today|tomorrow)\b\s*(.*)$/);
  if (dayMatch) {
    const rest = (dayMatch[2] ?? "").trim();
    const clock = rest ? parseClock(rest) : { hours: 9, minutes: 0 };
    if (!clock) return null;
    const at = new Date(now);
    if (dayMatch[1] === "tomorrow") at.setDate(at.getDate() + 1);
    at.setHours(clock.hours, clock.minutes, 0, 0);
    return { at, label: whenLabel(at, now) };
  }

  // 3. Relative duration (optional leading "in") → now + the summed duration.
  const dur = parseDuration(lc.replace(/^in\s+/, ""));
  if (dur) {
    return { at: new Date(now.getTime() + dur.ms), label: dur.label };
  }

  // 4. Bare clock time — today, rolled to tomorrow when already past `now`.
  const clock = parseClock(lc);
  if (clock) {
    const at = new Date(now);
    at.setHours(clock.hours, clock.minutes, 0, 0);
    if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
    return { at, label: whenLabel(at, now) };
  }

  // 5. Fallback: any other date string Date understands, taken as-is when future.
  const ms = Date.parse(raw);
  if (!Number.isNaN(ms)) {
    const at = new Date(ms);
    if (at.getTime() > now.getTime()) return { at, label: whenLabel(at, now) };
  }
  return null;
}

/** Convert a raw `resets_at` from the usage endpoint (#154) — an ISO-8601 string,
 * or a unix timestamp in seconds or milliseconds as a numeric string — to epoch ms.
 * `Date.parse` natively handles the endpoint's timezone-aware ISO form. Returns
 * `null` when absent or unparseable. */
export function parseResetsAt(raw: string | null): number | null {
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    // >= 1e12 → already milliseconds; otherwise seconds.
    return n >= 1e12 ? n : n * 1000;
  }
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

/** Compact reset countdown for the usage bar (#154): "2h 14m" / "14m" / "<1m". */
export function formatResetCountdown(
  resetsAtMs: number,
  nowMs: number,
): string {
  const minutes = Math.floor((resetsAtMs - nowMs) / 60_000);
  if (minutes <= 0) return "<1m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
