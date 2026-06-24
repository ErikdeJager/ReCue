import { describe, expect, it } from "vitest";

import type { Board } from "./kanban";
import { serializeBoard } from "./kanban";
import {
  addCard,
  addColumn,
  defaultBoard,
  deleteCard,
  deleteColumn,
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

  it("toggleCard flips checked", () => {
    expect(toggleCard(board(), 0, 0).columns[0]?.cards[0]?.checked).toBe(true);
    expect(toggleCard(board(), 1, 0).columns[1]?.cards[0]?.checked).toBe(false);
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
