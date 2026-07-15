import { describe, expect, it } from "vitest";

import { SHORTCUT_GROUPS } from "./shortcuts";

describe("SHORTCUT_GROUPS (#318)", () => {
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

  it("lists the complete global chord map (UI v2 task 373)", () => {
    const macs = SHORTCUT_GROUPS.flatMap((g) => g.shortcuts.map((s) => s.mac));
    // Every global ⌘-chord wired in useKeyboardNav.ts must be documented here,
    // including the #337 ⌘F global search and the task-373 ⌘D dense toggle.
    for (const chord of [
      "⌘N",
      "⌘⇧N",
      "⌘B",
      "⌘K",
      "⌘F",
      "⌘T",
      "⌘E",
      "⌘\\",
      "⌘D",
    ]) {
      expect(macs).toContain(chord);
    }
    // The canvas-jump digits are documented as a range entry.
    expect(macs.some((m) => m.includes("⌘1") && m.includes("⌘9"))).toBe(true);
  });
});
