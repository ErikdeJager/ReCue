// Server-side merge patches (task 429): the frontend sends only what it changed —
// a settings key diff, per-file diff-seen deltas with tombstones, or a field-wise
// canvases patch — and the backend merges it over the persisted state under the
// Store mutex. These tests pin the WIRE PAYLOADS (vi.spyOn on `ipc`): a stale
// window must never ship a whole blob that could revert another window's write.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS, settingsPatch, useStore } from "./store";
import type { CanvasTab, Settings } from "./types";
import * as ipc from "./ipc";

const tab = (id: string, name = `Canvas ${id}`): CanvasTab => ({
  id,
  name,
  layout: null,
});

beforeEach(() => {
  useStore.setState({
    settings: { ...DEFAULT_SETTINGS },
    diffSeen: {},
    canvases: [tab("c1"), tab("c2")],
    activeCanvasId: "c1",
    activeLeafId: null,
    detachedCanvasIds: [],
    toasts: [],
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("settingsPatch (task 429)", () => {
  it("is empty for identical settings", () => {
    expect(settingsPatch(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS })).toEqual(
      {},
    );
  });

  it("carries only the changed keys, verbatim", () => {
    const next: Settings = {
      ...DEFAULT_SETTINGS,
      terminalFontSize: DEFAULT_SETTINGS.terminalFontSize + 2,
    };
    expect(settingsPatch(DEFAULT_SETTINGS, next)).toEqual({
      terminalFontSize: DEFAULT_SETTINGS.terminalFontSize + 2,
    });
  });

  it("keeps an explicit null value (a legitimate value, not a delete)", () => {
    const base: Settings = { ...DEFAULT_SETTINGS, preferredEditor: "zed" };
    const next: Settings = { ...base, preferredEditor: null };
    const patch = settingsPatch(base, next);
    expect("preferredEditor" in patch).toBe(true);
    expect(patch.preferredEditor).toBeNull();
  });

  it("carries a changed nested object (keybinds) whole", () => {
    const next: Settings = {
      ...DEFAULT_SETTINGS,
      keybinds: { "close-panel": "mod+shift+w" },
    };
    expect(settingsPatch(DEFAULT_SETTINGS, next)).toEqual({
      keybinds: { "close-panel": "mod+shift+w" },
    });
  });
});

describe("saveSettings persists a patch (task 429)", () => {
  it("sends only the changed keys", async () => {
    const spy = vi.spyOn(ipc, "setSettings").mockResolvedValue(undefined);
    await useStore.getState().saveSettings({
      ...DEFAULT_SETTINGS,
      terminalFontSize: DEFAULT_SETTINGS.terminalFontSize + 2,
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(Object.keys(spy.mock.calls[0]?.[0] ?? {})).toEqual([
      "terminalFontSize",
    ]);
    expect(useStore.getState().settings.terminalFontSize).toBe(
      DEFAULT_SETTINGS.terminalFontSize + 2,
    );
  });

  it("skips the write AND the state churn on an empty patch", async () => {
    const spy = vi.spyOn(ipc, "setSettings").mockResolvedValue(undefined);
    const before = useStore.getState();
    await useStore.getState().saveSettings({ ...DEFAULT_SETTINGS });
    expect(spy).not.toHaveBeenCalled();
    expect(useStore.getState()).toBe(before); // no set() at all
  });

  it("diffs against the baseline: a foreign change survives locally and is not written", async () => {
    const spy = vi.spyOn(ipc, "setSettings").mockResolvedValue(undefined);
    // A foreign window's save (task 428) landed while the modal was open.
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, theme: "light" },
    });
    // The stale draft was seeded from the pre-change baseline (theme: dark) and
    // edits an unrelated key.
    const baseline: Settings = { ...DEFAULT_SETTINGS };
    const draft: Settings = { ...DEFAULT_SETTINGS, terminalFontSize: 15 };
    await useStore.getState().saveSettings(draft, baseline);
    // The write carries only the draft's own edit — never the stale theme…
    const written = spy.mock.calls[0]?.[0] ?? {};
    expect(Object.keys(written)).toEqual(["terminalFontSize"]);
    // …and locally the foreign theme is not reverted (patch-over-current, the
    // exact mirror of the server merge).
    const s = useStore.getState().settings;
    expect(s.theme).toBe("light");
    expect(s.terminalFontSize).toBe(15);
  });
});

describe("diff-seen delta accumulator (task 429)", () => {
  it("flushes one merged delta patch (with tombstones) after the debounce", () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(ipc, "setDiffSeen").mockResolvedValue(undefined);
    const s = useStore.getState();
    s.markDiffSeen("/r", "a.ts", "d1");
    s.markDiffSeen("/r", "b.ts", "d2");
    s.clearDiffSeen("/r", "b.ts");
    expect(spy).not.toHaveBeenCalled(); // still inside the 300ms debounce
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledTimes(1);
    // The deltas, never the whole map: b.ts cleared after marking → a tombstone.
    expect(spy).toHaveBeenCalledWith({ "/r": { "a.ts": "d1", "b.ts": null } });
  });

  it("resets the accumulator between flushes (a later mark sends only its delta)", () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(ipc, "setDiffSeen").mockResolvedValue(undefined);
    const s = useStore.getState();
    s.markDiffSeen("/r", "a.ts", "d1");
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledTimes(1);
    s.markDiffSeen("/s", "c.ts", "d3");
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith({ "/s": { "c.ts": "d3" } });
  });

  it("clearDiffSeen of an unmarked file records nothing and never writes", () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(ipc, "setDiffSeen").mockResolvedValue(undefined);
    useStore.getState().clearDiffSeen("/r", "missing.ts");
    vi.advanceTimersByTime(1000);
    expect(spy).not.toHaveBeenCalled();
    expect(useStore.getState().diffSeen).toEqual({});
  });
});

describe("canvas write payloads (task 429)", () => {
  it("selectCanvas sends the activeId ONLY (no stale canvases array)", () => {
    const spy = vi.spyOn(ipc, "setCanvases").mockResolvedValue(undefined);
    useStore.getState().selectCanvas("c2");
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = spy.mock.calls[0]?.[0] ?? {};
    expect(payload).toEqual({ activeId: "c2" });
    expect("canvases" in payload).toBe(false);
  });

  it("renameCanvas sends the canvases array only (no activeId)", () => {
    const spy = vi.spyOn(ipc, "setCanvases").mockResolvedValue(undefined);
    useStore.getState().renameCanvas("c2", "Renamed");
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = spy.mock.calls[0]?.[0] ?? {};
    expect("activeId" in payload).toBe(false);
    expect(payload.canvases?.map((c) => c.name)).toEqual([
      "Canvas c1",
      "Renamed",
    ]);
  });

  it("addCanvas sends both fields (it creates AND switches to the tab)", () => {
    const spy = vi.spyOn(ipc, "setCanvases").mockResolvedValue(undefined);
    useStore.getState().addCanvas();
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = spy.mock.calls[0]?.[0] ?? {};
    expect(payload.canvases).toHaveLength(3);
    expect(payload.activeId).toBe(payload.canvases?.[2]?.id);
  });

  it("closeCanvas of a NON-active tab omits activeId (no re-home happened)", () => {
    const spy = vi.spyOn(ipc, "setCanvases").mockResolvedValue(undefined);
    useStore.getState().closeCanvas("c2"); // active is c1
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = spy.mock.calls[0]?.[0] ?? {};
    expect("activeId" in payload).toBe(false);
    expect(payload.canvases?.map((c) => c.id)).toEqual(["c1"]);
  });

  it("closeCanvas of the ACTIVE tab includes the re-homed activeId", () => {
    const spy = vi.spyOn(ipc, "setCanvases").mockResolvedValue(undefined);
    useStore.getState().closeCanvas("c1"); // active is c1 → re-homes to c2
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = spy.mock.calls[0]?.[0] ?? {};
    expect(payload.canvases?.map((c) => c.id)).toEqual(["c2"]);
    expect(payload.activeId).toBe("c2");
  });
});
