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
});
