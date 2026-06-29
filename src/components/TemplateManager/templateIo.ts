// Pure import/export helpers for Canvas templates (#275).
//
// A `CanvasTemplate` is already plain JSON (`{ id, name, layout }` where `layout`
// is a serializable `CanvasNode` tree), so sharing one between machines/developers
// is just write-JSON / read-JSON. These helpers make the round-trip safe:
//   - `serializeTemplate` drops the machine-local `id` (the importer re-mints a
//     fresh one), so two machines never collide on ids.
//   - `parseTemplateJson` validates a foreign blob's *shape* before it ever reaches
//     the templates store — a malformed / foreign file is rejected (returns null)
//     instead of corrupting the `canvas_templates` blob.

import type { CanvasNode, CanvasTemplate } from "../../types";

/** The validated payload of a template `.json` file — everything but the local id. */
export interface ImportedTemplate {
  name: string;
  layout: CanvasNode | null;
}

/** Serialize a template for export (#275): a pretty-printed JSON object **without**
 * the local `id` (the importer mints a fresh one, so ids never collide across
 * machines). */
export function serializeTemplate(template: CanvasTemplate): string {
  const payload: ImportedTemplate = {
    name: template.name,
    layout: template.layout,
  };
  return JSON.stringify(payload, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether `value` is a structurally valid `CanvasNode` tree (leaf or split).
 * Recursive: a split's children must themselves be valid nodes. Kept permissive
 * about a leaf's `content` beyond requiring a string `kind`, since block kinds are
 * an open set (`templateBlocks.ts`) and a foreign template may carry a kind this
 * build doesn't yet know — instantiation handles unknown kinds gracefully. */
function isCanvasNode(value: unknown): value is CanvasNode {
  if (!isRecord(value)) return false;
  if (value.type === "leaf") {
    return (
      typeof value.id === "string" &&
      isRecord(value.content) &&
      typeof value.content.kind === "string"
    );
  }
  if (value.type === "split") {
    return (
      typeof value.id === "string" &&
      (value.dir === "row" || value.dir === "col") &&
      Array.isArray(value.sizes) &&
      value.sizes.length === 2 &&
      value.sizes.every((n) => typeof n === "number") &&
      isCanvasNode(value.a) &&
      isCanvasNode(value.b)
    );
  }
  return false;
}

/** Parse + validate a template `.json` file's text (#275). Returns `{ name, layout }`
 * on a structurally valid template, or `null` for anything malformed / foreign
 * (bad JSON, missing/blank name, a `layout` that isn't `null` or a valid
 * `CanvasNode` tree) — so a bad import can't corrupt the templates store. The id is
 * intentionally ignored; the importer mints a fresh one. */
export function parseTemplateJson(text: string): ImportedTemplate | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const { name, layout } = parsed;
  if (typeof name !== "string" || name.trim() === "") return null;
  if (layout !== null && layout !== undefined && !isCanvasNode(layout)) {
    return null;
  }
  return { name: name.trim(), layout: (layout ?? null) as CanvasNode | null };
}
