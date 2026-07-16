import { beforeEach, describe, expect, it, vi } from "vitest";

// #326/task 430: the usage poll — and with it the "never read the OAuth token
// while 'Show session usage' is off" guarantee — lives in Rust now (`poll_gate`
// in `src-tauri/src/autocontinue.rs`, unit-tested there). Frontend-side the
// `usage` slice is an event-fed mirror: these tests pin the pure
// `usageFromSnapshot` mapping and the `applyUsageSync` apply rules (equality-
// guarded, ZERO ipc calls — the task-428 conventions). Own ./ipc mock, isolated
// per-file by Vitest.
vi.mock("./ipc", () => ({
  writeStdin: vi.fn().mockResolvedValue(undefined),
  setSettings: vi.fn().mockResolvedValue(undefined),
  setSessionAutoContinue: vi.fn().mockResolvedValue(undefined),
}));

import * as ipc from "./ipc";
import { usageFromSnapshot, useStore } from "./store";
import { parseResetsAt } from "./time";

const m = vi.mocked;

const SNAPSHOT: ipc.UsageSnapshot = {
  usedPercent: 42,
  resetsAt: "2026-04-11T07:00:00+00:00",
  buckets: [
    { key: "five_hour", usedPercent: 42, resetsAt: "1760166000" },
    { key: "seven_day", usedPercent: 7, resetsAt: null },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({
    usage: {
      usedPercent: null,
      resetsAtMs: null,
      available: false,
      buckets: [],
    },
  });
});

describe("usageFromSnapshot (pure)", () => {
  it("maps a snapshot: scalar + each bucket through parseResetsAt", () => {
    expect(usageFromSnapshot(SNAPSHOT)).toEqual({
      usedPercent: 42,
      resetsAtMs: parseResetsAt("2026-04-11T07:00:00+00:00"),
      available: true,
      buckets: [
        {
          key: "five_hour",
          usedPercent: 42,
          resetsAtMs: parseResetsAt("1760166000"),
        },
        { key: "seven_day", usedPercent: 7, resetsAtMs: null },
      ],
    });
  });

  it("maps null (unavailable) to the hidden-bar shape", () => {
    expect(usageFromSnapshot(null)).toEqual({
      usedPercent: null,
      resetsAtMs: null,
      available: false,
      buckets: [],
    });
  });
});

describe("applyUsageSync (task 430 mirror)", () => {
  it("mirrors a snapshot into the usage slice", () => {
    useStore.getState().applyUsageSync(SNAPSHOT);
    expect(useStore.getState().usage).toEqual(usageFromSnapshot(SNAPSHOT));
  });

  it("clears stale usage to unavailable on a null broadcast", () => {
    useStore.setState({
      usage: {
        usedPercent: 42,
        resetsAtMs: 10_000,
        available: true,
        buckets: [],
      },
    });
    useStore.getState().applyUsageSync(null);
    expect(useStore.getState().usage).toEqual({
      usedPercent: null,
      resetsAtMs: null,
      available: false,
      buckets: [],
    });
  });

  it("is an equality-guarded no-op (same slice reference kept)", () => {
    useStore.getState().applyUsageSync(SNAPSHOT);
    const applied = useStore.getState().usage;
    // The same value again (a fresh but deep-equal payload) must not re-set.
    useStore.getState().applyUsageSync({ ...SNAPSHOT });
    expect(useStore.getState().usage).toBe(applied);
  });

  it("never calls any ipc setter (apply-only, the task-428 rule)", () => {
    useStore.getState().applyUsageSync(SNAPSHOT);
    useStore.getState().applyUsageSync(null);
    expect(m(ipc.setSettings)).not.toHaveBeenCalled();
    expect(m(ipc.setSessionAutoContinue)).not.toHaveBeenCalled();
    expect(m(ipc.writeStdin)).not.toHaveBeenCalled();
  });
});
