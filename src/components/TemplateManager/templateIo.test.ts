import { describe, expect, it } from "vitest";

import type { CanvasNode, CanvasTemplate } from "../../types";
import {
  parseTemplateJson,
  serializeTemplate,
  type ImportedTemplate,
} from "./templateIo";

const leaf = (id: string, kind: string): CanvasNode => ({
  type: "leaf",
  id,
  content: { kind },
});

const split = (): CanvasNode => ({
  type: "split",
  id: "s1",
  dir: "row",
  a: leaf("a", "new-agent"),
  b: leaf("b", "open-file"),
  sizes: [50, 50],
});

describe("serializeTemplate (#275)", () => {
  it("drops the local id and pretty-prints name + layout", () => {
    const template: CanvasTemplate = {
      id: "local-id-123",
      name: "My layout",
      layout: split(),
    };
    const json = serializeTemplate(template);
    expect(json).not.toContain("local-id-123");
    const back = JSON.parse(json) as Record<string, unknown>;
    expect(back).not.toHaveProperty("id");
    expect(back.name).toBe("My layout");
    expect(back.layout).toEqual(split());
    // Pretty-printed (2-space indent).
    expect(json).toContain("\n  ");
  });

  it("preserves a null layout", () => {
    const json = serializeTemplate({ id: "x", name: "Empty", layout: null });
    expect(JSON.parse(json)).toEqual({ name: "Empty", layout: null });
  });
});

describe("parseTemplateJson (#275)", () => {
  it("round-trips an exported template (same layout/blocks)", () => {
    const template: CanvasTemplate = {
      id: "abc",
      name: "Round trip",
      layout: split(),
    };
    const parsed = parseTemplateJson(serializeTemplate(template));
    expect(parsed).toEqual<ImportedTemplate>({
      name: "Round trip",
      layout: split(),
    });
  });

  it("accepts a leaf-only layout", () => {
    const parsed = parseTemplateJson(
      JSON.stringify({ name: "Solo", layout: leaf("l", "new-terminal") }),
    );
    expect(parsed?.layout).toEqual(leaf("l", "new-terminal"));
  });

  it("accepts a null layout", () => {
    const parsed = parseTemplateJson(
      JSON.stringify({ name: "Empty", layout: null }),
    );
    expect(parsed).toEqual({ name: "Empty", layout: null });
  });

  it("treats a missing layout as null", () => {
    const parsed = parseTemplateJson(JSON.stringify({ name: "No layout" }));
    expect(parsed).toEqual({ name: "No layout", layout: null });
  });

  it("trims the name", () => {
    const parsed = parseTemplateJson(
      JSON.stringify({ name: "  spaced  ", layout: null }),
    );
    expect(parsed?.name).toBe("spaced");
  });

  it("ignores any id present in the file (importer re-mints)", () => {
    const parsed = parseTemplateJson(
      JSON.stringify({ id: "foreign-id", name: "X", layout: null }),
    );
    expect(parsed).toEqual({ name: "X", layout: null });
    expect(parsed).not.toHaveProperty("id");
  });

  it("rejects malformed JSON", () => {
    expect(parseTemplateJson("{ not json")).toBeNull();
    expect(parseTemplateJson("")).toBeNull();
  });

  it("rejects a non-object top level", () => {
    expect(parseTemplateJson(JSON.stringify([1, 2, 3]))).toBeNull();
    expect(parseTemplateJson(JSON.stringify("a string"))).toBeNull();
    expect(parseTemplateJson(JSON.stringify(42))).toBeNull();
    expect(parseTemplateJson(JSON.stringify(null))).toBeNull();
  });

  it("rejects a missing or blank name", () => {
    expect(parseTemplateJson(JSON.stringify({ layout: null }))).toBeNull();
    expect(
      parseTemplateJson(JSON.stringify({ name: "   ", layout: null })),
    ).toBeNull();
    expect(
      parseTemplateJson(JSON.stringify({ name: 5, layout: null })),
    ).toBeNull();
  });

  it("rejects a foreign / malformed layout shape", () => {
    expect(
      parseTemplateJson(JSON.stringify({ name: "X", layout: { foo: "bar" } })),
    ).toBeNull();
    expect(
      parseTemplateJson(
        JSON.stringify({ name: "X", layout: { type: "leaf", id: "a" } }),
      ),
    ).toBeNull();
    // A split missing a child.
    expect(
      parseTemplateJson(
        JSON.stringify({
          name: "X",
          layout: {
            type: "split",
            id: "s",
            dir: "row",
            a: leaf("a", "k"),
            sizes: [50, 50],
          },
        }),
      ),
    ).toBeNull();
    // A split with a bad direction.
    expect(
      parseTemplateJson(
        JSON.stringify({
          name: "X",
          layout: {
            type: "split",
            id: "s",
            dir: "diagonal",
            a: leaf("a", "k"),
            b: leaf("b", "k"),
            sizes: [50, 50],
          },
        }),
      ),
    ).toBeNull();
  });

  it("rejects a non-string content.kind in a leaf", () => {
    expect(
      parseTemplateJson(
        JSON.stringify({
          name: "X",
          layout: { type: "leaf", id: "a", content: { kind: 7 } },
        }),
      ),
    ).toBeNull();
  });
});
