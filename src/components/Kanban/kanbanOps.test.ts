import { describe, expect, it } from "vitest";

import type { Board } from "./kanban";
import { serializeBoard } from "./kanban";
import {
  addCard,
  addColumn,
  defaultBoard,
  deleteCard,
  deleteColumn,
  insertCardAt,
  moveCard,
  moveColumn,
  newCard,
  renameColumn,
  toggleCard,
  updateCard,
} from "./kanbanOps";

function board(): Board {
  return {
    frontmatter: null,
    columns: [
      {
        name: "To Do",
        complete: false,
        cards: [
          { title: "A", body: "", checked: false },
          { title: "B", body: "", checked: false },
        ],
      },
      {
        name: "Done",
        complete: true,
        cards: [{ title: "C", body: "", checked: true }],
      },
    ],
    settingsBlock: null,
  };
}

const titles = (b: Board, col: number) =>
  b.columns[col]?.cards.map((c) => c.title);

describe("kanbanOps card mutations (#143)", () => {
  it("addCard appends to the column", () => {
    const b = addCard(board(), 0, newCard("X"));
    expect(titles(b, 0)).toEqual(["A", "B", "X"]);
  });

  it("updateCard patches title/body without touching others", () => {
    const b = updateCard(board(), 0, 1, { title: "B!", body: "note" });
    expect(b.columns[0]?.cards[1]).toEqual({
      title: "B!",
      body: "note",
      checked: false,
    });
    expect(b.columns[0]?.cards[0]?.title).toBe("A");
  });

  it("deleteCard removes one card", () => {
    expect(titles(deleteCard(board(), 0, 0), 0)).toEqual(["B"]);
  });

  it("insertCardAt splices a card in at the index (#277)", () => {
    expect(titles(insertCardAt(board(), 0, 1, newCard("X")), 0)).toEqual([
      "A",
      "X",
      "B",
    ]);
    expect(titles(insertCardAt(board(), 0, 0, newCard("X")), 0)).toEqual([
      "X",
      "A",
      "B",
    ]);
  });

  it("insertCardAt clamps an out-of-range index to the column bounds (#277)", () => {
    expect(titles(insertCardAt(board(), 0, 99, newCard("X")), 0)).toEqual([
      "A",
      "B",
      "X",
    ]);
    expect(titles(insertCardAt(board(), 0, -5, newCard("Y")), 0)).toEqual([
      "Y",
      "A",
      "B",
    ]);
  });

  it("insertCardAt is a no-op for an out-of-range column (#277)", () => {
    expect(insertCardAt(board(), 9, 0, newCard("X"))).toEqual(board());
  });

  it("deleteCard then insertCardAt round-trips a card back to its spot (#277)", () => {
    const original = board();
    const deleted = deleteCard(original, 0, 1); // remove B
    expect(titles(deleted, 0)).toEqual(["A"]);
    const restored = insertCardAt(deleted, 0, 1, {
      title: "B",
      body: "",
      checked: false,
    });
    expect(titles(restored, 0)).toEqual(["A", "B"]);
    expect(restored).toEqual(original);
  });

  it("toggleCard flips checked", () => {
    expect(toggleCard(board(), 0, 0).columns[0]?.cards[0]?.checked).toBe(true);
    expect(toggleCard(board(), 1, 0).columns[1]?.cards[0]?.checked).toBe(false);
  });

  it("addCard (newCard) defaults to a `- [ ]` checkbox card (#194)", () => {
    expect(newCard("X").checked).toBe(false);
  });

  it("toggleCard leaves a plain-bullet card unchecked-less (#194)", () => {
    // A `checked: null` card has no checkbox in the UI, so this is unreachable —
    // but the guard keeps `null` as `null` rather than turning it into `true`.
    const b = addCard(board(), 0, { title: "P", body: "", checked: null });
    const plainIdx = 2;
    expect(
      toggleCard(b, 0, plainIdx).columns[0]?.cards[plainIdx]?.checked,
    ).toBeNull();
  });

  it("moveCard preserves a plain-bullet card's null checked (#194)", () => {
    const b = addCard(board(), 0, { title: "P", body: "", checked: null });
    // Move the plain card (index 2) from To Do → Done.
    const moved = moveCard(b, 0, 2, 1, 0);
    expect(moved.columns[1]?.cards[0]).toEqual({
      title: "P",
      body: "",
      checked: null,
    });
  });

  it("moveCard reorders within a column (arrayMove semantics)", () => {
    expect(titles(moveCard(board(), 0, 0, 0, 1), 0)).toEqual(["B", "A"]);
  });

  it("moveCard moves a card between columns (status change)", () => {
    const b = moveCard(board(), 0, 0, 1, 0); // A → Done at index 0
    expect(titles(b, 0)).toEqual(["B"]);
    expect(titles(b, 1)).toEqual(["A", "C"]);
  });

  it("moveCard is a no-op for an out-of-range source", () => {
    expect(moveCard(board(), 0, 9, 1, 0)).toEqual(board());
    expect(moveCard(board(), 5, 0, 1, 0)).toEqual(board());
  });
});

describe("kanbanOps column mutations (#143)", () => {
  it("addColumn appends an empty column", () => {
    const b = addColumn(board(), "Doing");
    expect(b.columns.map((c) => c.name)).toEqual(["To Do", "Done", "Doing"]);
    expect(b.columns[2]?.cards).toEqual([]);
  });

  it("renameColumn changes only the name", () => {
    const b = renameColumn(board(), 0, "Backlog");
    expect(b.columns[0]?.name).toBe("Backlog");
    expect(titles(b, 0)).toEqual(["A", "B"]);
  });

  it("deleteColumn removes the lane with its cards", () => {
    expect(deleteColumn(board(), 0).columns.map((c) => c.name)).toEqual([
      "Done",
    ]);
  });

  it("moveColumn reorders lanes", () => {
    expect(moveColumn(board(), 1, 0).columns.map((c) => c.name)).toEqual([
      "Done",
      "To Do",
    ]);
  });
});

describe("kanbanOps defaultBoard (#143)", () => {
  it("has the default lanes and a board frontmatter, and serializes cleanly", () => {
    const b = defaultBoard();
    expect(b.columns.map((c) => c.name)).toEqual(["To Do", "Doing", "Done"]);
    expect(b.frontmatter).toContain("kanban-plugin: board");
    // A mutation result is still a serializable board.
    const md = serializeBoard(addCard(b, 0, newCard("First")));
    expect(md).toContain("kanban-plugin: board");
    expect(md).toContain("- [ ] First");
  });
});
