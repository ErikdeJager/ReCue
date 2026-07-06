import { describe, expect, it } from "vitest";

import { applySmartNewline } from "./smartList";

describe("applySmartNewline", () => {
  it("continues a bullet with a fresh `- ` prefix", () => {
    expect(applySmartNewline("- foo", 5, 5)).toEqual({
      value: "- foo\n- ",
      caret: 8,
    });
  });

  it("terminates the list on an empty bullet", () => {
    expect(applySmartNewline("- foo\n- ", 8, 8)).toEqual({
      value: "- foo\n",
      caret: 6,
    });
  });

  it("preserves leading indentation", () => {
    expect(applySmartNewline("  - a", 5, 5)).toEqual({
      value: "  - a\n  - ",
      caret: 10,
    });
  });

  it("continues a task-list item as a fresh unchecked box", () => {
    expect(applySmartNewline("- [ ] task", 10, 10)).toEqual({
      value: "- [ ] task\n- [ ] ",
      caret: 17,
    });
  });

  it("continues a checked task-list item as unchecked", () => {
    expect(applySmartNewline("- [x] done", 10, 10)).toEqual({
      value: "- [x] done\n- [ ] ",
      caret: 17,
    });
  });

  it("splits mid-line", () => {
    expect(applySmartNewline("- helloworld", 7, 7)).toEqual({
      value: "- hello\n- world",
      caret: 10,
    });
  });

  it("replaces a selection then continues", () => {
    expect(applySmartNewline("- ab", 3, 4)).toEqual({
      value: "- a\n- ",
      caret: 6,
    });
  });

  it("returns null on a non-bullet line", () => {
    expect(applySmartNewline("plain text", 10, 10)).toBeNull();
  });

  it("returns null for a bare `-` with no following space", () => {
    expect(applySmartNewline("-", 1, 1)).toBeNull();
  });
});
