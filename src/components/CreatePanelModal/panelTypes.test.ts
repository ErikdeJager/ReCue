import { describe, expect, it } from "vitest";

import { filterPanelTypes, PANEL_TYPES, panelTypeForDigit } from "./panelTypes";

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

describe("filterPanelTypes (#189, task 391)", () => {
  it("returns the whole list for an empty or whitespace query", () => {
    expect(filterPanelTypes("").map((t) => t.key)).toEqual(
      PANEL_TYPES.map((t) => t.key),
    );
    expect(filterPanelTypes("   ").map((t) => t.key)).toEqual(
      PANEL_TYPES.map((t) => t.key),
    );
  });

  it("filters by a label substring (both viewer types for 'vie')", () => {
    const keys = filterPanelTypes("vie").map((t) => t.key);
    expect(keys).toContain("file");
    expect(keys).toContain("diff");
    expect(keys).not.toContain("session");
    expect(keys).not.toContain("terminal");
  });

  it("is case-insensitive ('KAN' matches the Kanban board)", () => {
    expect(filterPanelTypes("KAN").map((t) => t.key)).toEqual(["kanban"]);
    expect(filterPanelTypes("kan").map((t) => t.key)).toEqual(["kanban"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterPanelTypes("zzz-nope")).toEqual([]);
  });

  it("preserves PANEL_TYPES order in the filtered result", () => {
    const filtered = filterPanelTypes("e").map((t) => t.key);
    const canonical = PANEL_TYPES.filter((t) =>
      t.label.toLowerCase().includes("e"),
    ).map((t) => t.key);
    expect(filtered).toEqual(canonical);
  });
});
