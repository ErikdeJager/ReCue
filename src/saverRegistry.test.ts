import { afterEach, describe, expect, it, vi } from "vitest";

import { registerSaver, saveFocused, saverCount } from "./saverRegistry";

// Each test registers its own savers and unregisters them after, so the singleton
// map starts empty per test.
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

function fakeSaver(opts: { focused?: boolean; dirty?: boolean }) {
  const save = vi.fn();
  const saver = {
    isFocused: () => opts.focused ?? false,
    isDirty: () => opts.dirty ?? false,
    save,
  };
  cleanups.push(registerSaver(`s-${cleanups.length}`, saver));
  return save;
}

describe("saverRegistry.saveFocused (#162)", () => {
  it("saves only the focused saver when one is focused and dirty", () => {
    const focused = fakeSaver({ focused: true, dirty: true });
    const other = fakeSaver({ focused: false, dirty: true });
    expect(saveFocused()).toBe(1);
    expect(focused).toHaveBeenCalledTimes(1);
    // The focused-save path does NOT also flush other dirty buffers.
    expect(other).not.toHaveBeenCalled();
  });

  it("saves nothing when the focused saver is clean", () => {
    const focused = fakeSaver({ focused: true, dirty: false });
    fakeSaver({ focused: false, dirty: true });
    expect(saveFocused()).toBe(0);
    expect(focused).not.toHaveBeenCalled();
  });

  it("saves ALL dirty savers when none is focused", () => {
    const a = fakeSaver({ focused: false, dirty: true });
    const b = fakeSaver({ focused: false, dirty: false });
    const c = fakeSaver({ focused: false, dirty: true });
    expect(saveFocused()).toBe(2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    expect(c).toHaveBeenCalledTimes(1);
  });

  it("unregister removes a saver from the registry", () => {
    expect(saverCount()).toBe(0);
    const unregister = registerSaver("x", {
      isFocused: () => false,
      isDirty: () => true,
      save: vi.fn(),
    });
    expect(saverCount()).toBe(1);
    unregister();
    expect(saverCount()).toBe(0);
  });
});
