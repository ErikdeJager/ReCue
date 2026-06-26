import { describe, expect, it } from "vitest";

import { PANEL_TYPES, panelTypeForDigit } from "./panelTypes";

describe("Create-panel type registry (#189)", () => {
  it("has the six addable types in digit order", () => {
    expect(PANEL_TYPES.map((t) => t.key)).toEqual([
      "session",
      "file",
      "diff",
      "terminal",
      "kanban",
      "filetree",
    ]);
  });

  it("maps the 1-based digit to its type, and out-of-range to undefined", () => {
    expect(panelTypeForDigit(1)).toBe("session");
    expect(panelTypeForDigit(2)).toBe("file");
    expect(panelTypeForDigit(6)).toBe("filetree");
    expect(panelTypeForDigit(0)).toBeUndefined();
    expect(panelTypeForDigit(7)).toBeUndefined();
  });
});
