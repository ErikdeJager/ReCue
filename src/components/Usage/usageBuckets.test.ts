import { describe, expect, it } from "vitest";

import {
  humanizeUsageLabel,
  orderUsageBuckets,
  prepareUsageBuckets,
  type StoreUsageBucket,
} from "./usageBuckets";

describe("humanizeUsageLabel (#370)", () => {
  it("maps known keys to curated labels", () => {
    expect(humanizeUsageLabel("five_hour")).toBe("5-hour");
    expect(humanizeUsageLabel("seven_day")).toBe("7-day");
    expect(humanizeUsageLabel("seven_day_opus")).toBe("7-day (Opus)");
  });

  it("generically humanizes an unknown key (adaptivity)", () => {
    expect(humanizeUsageLabel("monthly")).toBe("Monthly");
    expect(humanizeUsageLabel("some_new_window")).toBe("Some new window");
    expect(humanizeUsageLabel("seven_day_opus_v2")).toBe("Seven day opus v2");
  });

  it("never throws on a degenerate key", () => {
    expect(humanizeUsageLabel("")).toBe("");
    expect(humanizeUsageLabel("_")).toBe("_");
  });
});

describe("orderUsageBuckets (#370)", () => {
  it("puts known windows first, then unknown windows alphabetically", () => {
    const buckets = [
      { key: "monthly" },
      { key: "seven_day" },
      { key: "five_hour" },
      { key: "annual" },
    ];
    expect(orderUsageBuckets(buckets).map((b) => b.key)).toEqual([
      "five_hour",
      "seven_day",
      "annual",
      "monthly",
    ]);
  });

  it("does not mutate its input", () => {
    const buckets = [{ key: "seven_day" }, { key: "five_hour" }];
    const copy = [...buckets];
    orderUsageBuckets(buckets);
    expect(buckets).toEqual(copy);
  });
});

describe("prepareUsageBuckets (#370)", () => {
  it("orders and attaches humanized labels", () => {
    const buckets: StoreUsageBucket[] = [
      { key: "monthly", usedPercent: 12, resetsAtMs: 3 },
      { key: "five_hour", usedPercent: 80, resetsAtMs: 1 },
      { key: "seven_day", usedPercent: 40, resetsAtMs: 2 },
    ];
    expect(prepareUsageBuckets(buckets)).toEqual([
      { key: "five_hour", usedPercent: 80, resetsAtMs: 1, label: "5-hour" },
      { key: "seven_day", usedPercent: 40, resetsAtMs: 2, label: "7-day" },
      { key: "monthly", usedPercent: 12, resetsAtMs: 3, label: "Monthly" },
    ]);
  });

  it("handles an empty list", () => {
    expect(prepareUsageBuckets([])).toEqual([]);
  });
});
