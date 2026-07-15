import { describe, expect, it } from "vitest";

import { EDITORS, editorLabel } from "./editors";

describe("EDITORS catalog mirror", () => {
  it("has unique ids and non-empty labels", () => {
    const ids = EDITORS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of EDITORS) {
      expect(e.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("never lists the custom pseudo-id (rendered as its own row/option)", () => {
    expect(EDITORS.some((e) => e.id === "custom")).toBe(false);
  });
});

describe("editorLabel", () => {
  it("resolves catalog ids to their labels", () => {
    expect(editorLabel("vscode")).toBe("Visual Studio Code");
    expect(editorLabel("idea")).toBe("IntelliJ IDEA");
  });

  it("labels custom and falls back to the raw id for unknowns", () => {
    expect(editorLabel("custom")).toBe("Custom command");
    // Only reachable via a hand-edited settings blob — degrade readably.
    expect(editorLabel("not-an-editor")).toBe("not-an-editor");
  });
});
