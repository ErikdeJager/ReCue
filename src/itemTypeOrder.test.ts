import { describe, expect, it } from "vitest";

import {
  byItemTypeOrder,
  ITEM_TYPE_ORDER,
  type ItemTypeKey,
  itemTypeRank,
} from "./itemTypeOrder";

describe("itemTypeOrder — the one canonical creatable-type order (task 392)", () => {
  it("lists the six keys in canonical order", () => {
    expect([...ITEM_TYPE_ORDER]).toEqual([
      "session",
      "terminal",
      "filetree",
      "file",
      "diff",
      "kanban",
    ]);
  });

  it("ranks each key 0..5, and an unknown key last (never throws)", () => {
    expect(itemTypeRank("session")).toBe(0);
    expect(itemTypeRank("terminal")).toBe(1);
    expect(itemTypeRank("filetree")).toBe(2);
    expect(itemTypeRank("file")).toBe(3);
    expect(itemTypeRank("diff")).toBe(4);
    expect(itemTypeRank("kanban")).toBe(5);
    // Unknown → length (6), sorts last.
    expect(itemTypeRank("nope" as ItemTypeKey)).toBe(ITEM_TYPE_ORDER.length);
  });

  it("sorts an out-of-order sample into canonical order", () => {
    const sample: { key: ItemTypeKey }[] = [
      { key: "kanban" },
      { key: "file" },
      { key: "session" },
      { key: "diff" },
      { key: "terminal" },
      { key: "filetree" },
    ];
    expect(byItemTypeOrder(sample, (t) => t.key).map((t) => t.key)).toEqual([
      "session",
      "terminal",
      "filetree",
      "file",
      "diff",
      "kanban",
    ]);
  });

  it("is stable — equal/unknown ranks keep source order", () => {
    const sample: { key: ItemTypeKey; id: number }[] = [
      { key: "nope" as ItemTypeKey, id: 1 },
      { key: "diff", id: 2 },
      { key: "nope" as ItemTypeKey, id: 3 },
      { key: "terminal", id: 4 },
    ];
    expect(byItemTypeOrder(sample, (t) => t.key)).toEqual([
      { key: "terminal", id: 4 },
      { key: "diff", id: 2 },
      { key: "nope", id: 1 },
      { key: "nope", id: 3 },
    ]);
  });

  it("does not mutate the input array", () => {
    const sample: { key: ItemTypeKey }[] = [
      { key: "diff" },
      { key: "session" },
    ];
    const before = [...sample];
    byItemTypeOrder(sample, (t) => t.key);
    expect(sample).toEqual(before);
  });
});
