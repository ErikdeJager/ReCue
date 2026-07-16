import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ALL_GIT_REFRESH_KINDS,
  afterPaint,
  FOCUS_FULL_REFRESH_MIN_MS,
  focusRefreshKinds,
  mergeRequests,
  mergeScoped,
  normalizeRequest,
} from "./gitRefresh";

describe("normalizeRequest (#359)", () => {
  it("defaults to a full, unscoped volley", () => {
    expect(normalizeRequest()).toEqual({
      repos: null,
      kinds: [...ALL_GIT_REFRESH_KINDS],
    });
    expect(normalizeRequest({})).toEqual({
      repos: null,
      kinds: [...ALL_GIT_REFRESH_KINDS],
    });
  });

  it("treats empty repos/kinds as absent (unscoped / all kinds)", () => {
    expect(normalizeRequest({ repos: [], kinds: [] })).toEqual({
      repos: null,
      kinds: [...ALL_GIT_REFRESH_KINDS],
    });
  });

  it("keeps an explicit scope + kinds, deduped in canonical order", () => {
    const req = normalizeRequest({
      repos: ["/repo/a", "/repo/a", "/repo/b"],
      kinds: ["aheadBehind", "branches", "branches"],
    });
    expect(req.repos).toEqual(["/repo/a", "/repo/b"]);
    expect(req.kinds).toEqual(["branches", "aheadBehind"]);
  });
});

describe("mergeRequests (#359)", () => {
  it("returns a copy of b when there is no pending request", () => {
    const b = normalizeRequest({ repos: ["/repo/a"], kinds: ["branches"] });
    const merged = mergeRequests(null, b);
    expect(merged).toEqual(b);
    expect(merged.repos).not.toBe(b.repos); // copied, not aliased
  });

  it("unions kinds and repos", () => {
    const merged = mergeRequests(
      normalizeRequest({ repos: ["/repo/a"], kinds: ["branches"] }),
      normalizeRequest({ repos: ["/repo/b"], kinds: ["aheadBehind"] }),
    );
    expect(merged.repos).toEqual(["/repo/a", "/repo/b"]);
    expect(merged.kinds).toEqual(["branches", "aheadBehind"]);
  });

  it("lets an unscoped request absorb a scoped one (either side)", () => {
    const scoped = normalizeRequest({
      repos: ["/repo/a"],
      kinds: ["branches"],
    });
    const full = normalizeRequest();
    expect(mergeRequests(scoped, full).repos).toBeNull();
    expect(mergeRequests(full, scoped).repos).toBeNull();
    // The full request's kinds survive the union.
    expect(mergeRequests(scoped, full).kinds).toEqual([
      ...ALL_GIT_REFRESH_KINDS,
    ]);
  });
});

describe("mergeScoped (#359)", () => {
  it("sets a scoped key from the new result, leaving other folders untouched", () => {
    const prev = { "/repo/a": "old", "/repo/b": "main" };
    const next = mergeScoped(prev, ["/repo/a"], { "/repo/a": "feature" });
    expect(next).toEqual({ "/repo/a": "feature", "/repo/b": "main" });
  });

  it("DELETES a scoped key absent from the new result (lost upstream drops out)", () => {
    const prev = {
      "/repo/a": { ahead: 1, behind: 0 },
      "/repo/b": { ahead: 0, behind: 2 },
    };
    // The scoped read no longer returns /repo/a (its upstream was removed).
    const next = mergeScoped(prev, ["/repo/a"], {});
    expect("/repo/a" in next).toBe(false);
    // A folder outside the scope keeps its entry.
    expect(next["/repo/b"]).toEqual({ ahead: 0, behind: 2 });
  });

  it("ignores keys present in the result but outside the scope", () => {
    const prev = { "/repo/a": "main" };
    const next = mergeScoped(prev, ["/repo/a"], {
      "/repo/a": "main",
      "/repo/z": "stray",
    });
    expect(next).toBe(prev); // nothing changed within the scope
    expect("/repo/z" in next).toBe(false);
  });

  it("returns prev BY REFERENCE when nothing changed (selector stability)", () => {
    const prev = { "/repo/a": "main" };
    expect(mergeScoped(prev, ["/repo/a"], { "/repo/a": "main" })).toBe(prev);
    // A scoped folder that was already absent and still is → no churn either.
    expect(mergeScoped(prev, ["/repo/b"], {})).toBe(prev);
  });

  it("uses the element comparator for structured values", () => {
    const prev = { "/repo/a": { added: 1, removed: 2 } };
    const equal = (a: { added: number; removed: number }, b: typeof a) =>
      a.added === b.added && a.removed === b.removed;
    // Deep-equal but a fresh object → still referentially stable.
    expect(
      mergeScoped(
        prev,
        ["/repo/a"],
        { "/repo/a": { added: 1, removed: 2 } },
        equal,
      ),
    ).toBe(prev);
    // A real change writes a new map.
    const changed = mergeScoped(
      prev,
      ["/repo/a"],
      { "/repo/a": { added: 3, removed: 2 } },
      equal,
    );
    expect(changed).not.toBe(prev);
    expect(changed["/repo/a"]).toEqual({ added: 3, removed: 2 });
  });
});

describe("focusRefreshKinds (#359)", () => {
  it("runs a FULL volley when the last one is older than the throttle", () => {
    expect(focusRefreshKinds(FOCUS_FULL_REFRESH_MIN_MS, 0)).toEqual([
      ...ALL_GIT_REFRESH_KINDS,
    ]);
    expect(focusRefreshKinds(1_000_000, 0)).toEqual([...ALL_GIT_REFRESH_KINDS]);
  });

  it("downgrades to the cheap branch+ahead/behind+worktrees trio inside the throttle window", () => {
    // `worktrees` rides the cheap set so an agent's mid-turn `git worktree add`
    // surfaces within one 15 s poll tick, not the 30 s full backstop.
    expect(focusRefreshKinds(1_000, 500)).toEqual([
      "branches",
      "aheadBehind",
      "worktrees",
    ]);
    // Exactly at the boundary the full volley is allowed again.
    expect(focusRefreshKinds(FOCUS_FULL_REFRESH_MIN_MS + 500, 500)).toEqual([
      ...ALL_GIT_REFRESH_KINDS,
    ]);
    expect(focusRefreshKinds(FOCUS_FULL_REFRESH_MIN_MS + 499, 500)).toEqual([
      "branches",
      "aheadBehind",
      "worktrees",
    ]);
  });
});

describe("afterPaint (#359)", () => {
  // The test env is host-less (node), so rAF is installed/removed per test — which also
  // exercises both branches of the helper.
  const raf = globalThis.requestAnimationFrame;
  const caf = globalThis.cancelAnimationFrame;
  afterEach(() => {
    globalThis.requestAnimationFrame = raf;
    globalThis.cancelAnimationFrame = caf;
  });

  it("runs the callback after a double rAF and can be cancelled", () => {
    const frames: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    };
    globalThis.cancelAnimationFrame = () => {};

    const cb = vi.fn();
    afterPaint(cb);
    expect(cb).not.toHaveBeenCalled();
    frames[0]?.(0); // first frame — still before the paint
    expect(cb).not.toHaveBeenCalled();
    frames[1]?.(0); // after the paint
    expect(cb).toHaveBeenCalledTimes(1);

    // Cancelling before the second frame drops the callback.
    const cb2 = vi.fn();
    const cancel = afterPaint(cb2);
    frames[2]?.(0);
    cancel();
    frames[3]?.(0);
    expect(cb2).not.toHaveBeenCalled();
  });

  it("falls back to a timeout where rAF is unavailable", () => {
    vi.useFakeTimers();
    // @ts-expect-error — simulate a host without rAF (non-browser env).
    globalThis.requestAnimationFrame = undefined;
    const cb = vi.fn();
    const cancel = afterPaint(cb);
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
    cancel(); // cancelling after the fact is harmless
    vi.useRealTimers();
  });
});
