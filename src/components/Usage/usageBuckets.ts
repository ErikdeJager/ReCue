// Pure helpers for the expandable "all usage" viewer (#370): humanize + order the
// generic usage buckets the API reports so a new metric added by Anthropic renders
// with a reasonable label and no code change. No React / IO here — unit-tested.

/** A store usage bucket (mirrors `store.usage.buckets[number]`). */
export interface StoreUsageBucket {
  key: string;
  usedPercent: number;
  resetsAtMs: number | null;
}

/** A bucket ready to render: the store bucket plus a humanized display label. */
export interface UsageBucketView extends StoreUsageBucket {
  label: string;
}

/** Known API keys → friendly labels. Anything not here falls through to the generic
 * humanizer, so an unknown window (e.g. `monthly`) still reads sensibly. */
const KNOWN_LABELS: Record<string, string> = {
  five_hour: "5-hour",
  seven_day: "7-day",
  seven_day_opus: "7-day (Opus)",
};

/** Display priority for ordering (lower = earlier). Unknown keys sort after all known
 * ones, then alphabetically by key — so the five-hour window always leads and any new
 * metric lands predictably at the end. */
const ORDER_PRIORITY: Record<string, number> = {
  five_hour: 0,
  seven_day: 1,
  seven_day_opus: 2,
};
const UNKNOWN_PRIORITY = Number.MAX_SAFE_INTEGER;

/** Humanize a raw usage-window key (#370). Known keys get a curated label; unknown
 * keys are generically humanized — underscores → spaces, first letter capitalized
 * (`monthly` → "Monthly", `some_new_window` → "Some new window"). */
export function humanizeUsageLabel(key: string): string {
  const known = KNOWN_LABELS[key];
  if (known) return known;
  const spaced = key.replace(/_/g, " ").trim();
  if (spaced.length === 0) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Deterministically order buckets: known windows first (by priority), then unknown
 * windows, ties broken alphabetically by raw key. Pure — returns a new array. */
export function orderUsageBuckets<T extends { key: string }>(
  buckets: T[],
): T[] {
  return [...buckets].sort((a, b) => {
    const pa = ORDER_PRIORITY[a.key] ?? UNKNOWN_PRIORITY;
    const pb = ORDER_PRIORITY[b.key] ?? UNKNOWN_PRIORITY;
    if (pa !== pb) return pa - pb;
    return a.key.localeCompare(b.key);
  });
}

/** Map the store's usage buckets into ordered, labeled views for rendering (#370). */
export function prepareUsageBuckets(
  buckets: StoreUsageBucket[],
): UsageBucketView[] {
  return orderUsageBuckets(buckets).map((b) => ({
    ...b,
    label: humanizeUsageLabel(b.key),
  }));
}
