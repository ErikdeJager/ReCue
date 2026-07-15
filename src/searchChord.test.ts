import { describe, expect, it } from "vitest";

import { type ChordEvent, isGlobalSearchChord } from "./searchChord";

const chord = (over: Partial<ChordEvent> = {}): ChordEvent => ({
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  key: "f",
  ...over,
});

describe("isGlobalSearchChord", () => {
  it("matches Cmd+F (macOS)", () => {
    expect(isGlobalSearchChord(chord({ metaKey: true }))).toBe(true);
  });

  it("matches Ctrl+F (Windows/Linux)", () => {
    expect(isGlobalSearchChord(chord({ ctrlKey: true }))).toBe(true);
  });

  it("does NOT match Cmd+Ctrl+F (macOS native fullscreen carve-out)", () => {
    expect(isGlobalSearchChord(chord({ metaKey: true, ctrlKey: true }))).toBe(
      false,
    );
  });

  it("does NOT match Cmd+Shift+F", () => {
    expect(isGlobalSearchChord(chord({ metaKey: true, shiftKey: true }))).toBe(
      false,
    );
  });

  it("does NOT match Cmd+Alt+F", () => {
    expect(isGlobalSearchChord(chord({ metaKey: true, altKey: true }))).toBe(
      false,
    );
  });

  it("does NOT match a non-F key with Cmd", () => {
    expect(isGlobalSearchChord(chord({ metaKey: true, key: "g" }))).toBe(false);
  });

  it("does NOT match F with no modifier", () => {
    expect(isGlobalSearchChord(chord())).toBe(false);
  });

  it("is case-insensitive for the F key", () => {
    expect(isGlobalSearchChord(chord({ metaKey: true, key: "F" }))).toBe(true);
    expect(isGlobalSearchChord(chord({ ctrlKey: true, key: "F" }))).toBe(true);
  });
});
