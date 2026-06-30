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
  moveAllCardsRight,
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

describe("kanbanOps moveAllCardsRight (#283)", () => {
  // A three-lane board so "columns ≥2 untouched" is observable.
  function board3(): Board {
    return {
      frontmatter: null,
      columns: [
        {
          name: "To Do",
          complete: false,
          cards: [
            { title: "A", body: "", checked: false },
            { title: "B", body: "", checked: true },
          ],
        },
        {
          name: "Doing",
          complete: false,
          cards: [{ title: "C", body: "", checked: false }],
        },
        {
          name: "Done",
          complete: true,
          cards: [{ title: "D", body: "", checked: true }],
        },
      ],
      settingsBlock: null,
    };
  }

  it("moves every card from column 0 into column 1, appended after its cards", () => {
    const b = moveAllCardsRight(board3(), 0);
    expect(titles(b, 0)).toEqual([]); // source emptied
    expect(titles(b, 1)).toEqual(["C", "A", "B"]); // appended after existing "C"
    expect(titles(b, 2)).toEqual(["D"]); // columns ≥2 untouched
  });

  it("preserves each moved card's checked state (no auto-complete)", () => {
    const b = moveAllCardsRight(board3(), 0);
    // A (false) and B (true) keep their checked verbatim even into a Complete lane.
    expect(b.columns[1]?.cards).toEqual([
      { title: "C", body: "", checked: false },
      { title: "A", body: "", checked: false },
      { title: "B", body: "", checked: true },
    ]);
  });

  it("keeps the moved cards' relative order after the target's existing cards", () => {
    const b = moveAllCardsRight(board3(), 1); // Doing → Done
    expect(titles(b, 1)).toEqual([]);
    expect(titles(b, 2)).toEqual(["D", "C"]);
  });

  it("is a no-op on the rightmost column", () => {
    const b = board3();
    expect(moveAllCardsRight(b, b.columns.length - 1)).toEqual(b);
  });

  it("is a no-op on an empty source column", () => {
    const b = board3();
    b.columns[0]!.cards = [];
    expect(moveAllCardsRight(b, 0)).toEqual(b);
  });

  it("is a no-op for an out-of-range source column", () => {
    expect(moveAllCardsRight(board3(), -1)).toEqual(board3());
    expect(moveAllCardsRight(board3(), 9)).toEqual(board3());
  });

  it("does not mutate the original board (new column arrays)", () => {
    const original = board3();
    const snapshot = board3();
    const next = moveAllCardsRight(original, 0);
    expect(original).toEqual(snapshot); // original untouched
    expect(next.columns[0]).not.toBe(original.columns[0]);
    expect(next.columns[1]).not.toBe(original.columns[1]);
    expect(next.columns[1]?.cards).not.toBe(original.columns[1]?.cards);
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
