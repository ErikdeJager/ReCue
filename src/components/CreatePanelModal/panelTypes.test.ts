import { describe, expect, it } from "vitest";

import { ITEM_TYPE_ORDER } from "../../itemTypeOrder";
import { PANEL_TYPES, panelTypeForDigit } from "./panelTypes";

describe("Create-panel type registry (#189)", () => {
  it("has the six addable types in the canonical digit order (task 392)", () => {
    expect(PANEL_TYPES.map((t) => t.key)).toEqual([
      "session",
      "terminal",
      "filetree",
      "file",
      "diff",
      "kanban",
    ]);
  });

  it("derives its order from the shared canonical source (task 392)", () => {
    expect(PANEL_TYPES.map((t) => t.key)).toEqual([...ITEM_TYPE_ORDER]);
  });

  it("maps the 1-based digit to its type, and out-of-range to undefined", () => {
    expect(panelTypeForDigit(1)).toBe("session");
    expect(panelTypeForDigit(2)).toBe("terminal");
    expect(panelTypeForDigit(3)).toBe("filetree");
    expect(panelTypeForDigit(4)).toBe("file");
    expect(panelTypeForDigit(5)).toBe("diff");
    expect(panelTypeForDigit(6)).toBe("kanban");
    expect(panelTypeForDigit(0)).toBeUndefined();
    expect(panelTypeForDigit(7)).toBeUndefined();
  });
});
