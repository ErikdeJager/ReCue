import { describe, expect, it } from "vitest";

import { KEYBIND_ACTIONS } from "../../keybinds";
import { SHORTCUT_GROUPS } from "./shortcuts";

describe("SHORTCUT_GROUPS (fixed shortcuts, keybind rework)", () => {
  it("has at least one group", () => {
    expect(SHORTCUT_GROUPS.length).toBeGreaterThan(0);
  });

  it("gives every group a non-empty title and at least one shortcut", () => {
    for (const group of SHORTCUT_GROUPS) {
      expect(group.title.trim().length).toBeGreaterThan(0);
      expect(group.shortcuts.length).toBeGreaterThan(0);
    }
  });

  it("gives every shortcut a non-empty mac, win, and description", () => {
    for (const group of SHORTCUT_GROUPS) {
      for (const shortcut of group.shortcuts) {
        expect(shortcut.mac.trim().length).toBeGreaterThan(0);
        expect(shortcut.win.trim().length).toBeGreaterThan(0);
        expect(shortcut.description.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the fixed contextual chords documented", () => {
    const macs = SHORTCUT_GROUPS.flatMap((g) => g.shortcuts.map((s) => s.mac));
    // The hardcoded (non-rebindable) chords of useKeyboardNav.ts + the
    // component-scoped diff keys.
    for (const chord of ["⌘S", "⌘⏎", "⇧←/→", "⇧↑/↓"]) {
      expect(macs).toContain(chord);
    }
    expect(macs.some((m) => m.includes("⌘⌥1") && m.includes("⌘⌥6"))).toBe(true);
  });

  it("never duplicates a rebindable action (those render from the registry)", () => {
    const macs = SHORTCUT_GROUPS.flatMap((g) => g.shortcuts.map((s) => s.mac));
    // The rebindable defaults must not reappear in the fixed list…
    for (const gone of ["⌘N", "⌘⇧N", "⌘B", "⌘K", "⌘F", "⌘E", "⌘D", "⌘W"]) {
      expect(macs).not.toContain(gone);
    }
    // …and the chords the rework removed outright are gone everywhere.
    expect(macs).not.toContain("⌘T");
    expect(macs).not.toContain("⌘\\");
    expect(macs.some((m) => m.includes("⌘1") && m.includes("⌘9"))).toBe(false);
    // Sanity: the registry actually carries the rebindable set instead.
    expect(KEYBIND_ACTIONS.length).toBeGreaterThanOrEqual(12);
  });
});
