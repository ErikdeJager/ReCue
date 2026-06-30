//! Pure, immutable mutations on a Kanban {@link Board} (#143). The editor calls
//! these, then re-`serializeBoard`s + writes the `.md` (debounced) — keeping all
//! mutation logic side-effect-free + unit-testable, away from the React panel.

import type { Board, Card, Column } from "./kanban";

/** Frontmatter marking a `.md` as an Obsidian-Kanban board. */
const BOARD_FRONTMATTER = "---\n\nkanban-plugin: board\n\n---";

/** A fresh board with the default To Do / Doing / Done lanes (#143) — used to
 * author a new board from nothing. */
export function defaultBoard(): Board {
  return {
    frontmatter: BOARD_FRONTMATTER,
    columns: [
      { name: "To Do", complete: false, cards: [] },
      { name: "Doing", complete: false, cards: [] },
      { name: "Done", complete: false, cards: [] },
    ],
    settingsBlock: null,
  };
}

/** An empty card (optionally pre-titled). */
export function newCard(title = ""): Card {
  return { title, body: "", checked: false };
}

function replaceColumn(
  board: Board,
  idx: number,
  fn: (c: Column) => Column,
): Board {
  if (idx < 0 || idx >= board.columns.length) return board;
  return {
    ...board,
    columns: board.columns.map((c, i) => (i === idx ? fn(c) : c)),
  };
}

// --- Card mutations ---

export function addCard(board: Board, colIdx: number, card: Card): Board {
  return replaceColumn(board, colIdx, (c) => ({
    ...c,
    cards: [...c.cards, card],
  }));
}

/** Insert a card back into a column at a specific index (#277 — the undo of
 * `deleteCard`). The index is clamped to `[0, column length]`, so an out-of-range
 * idx appends; an out-of-range column leaves the board unchanged. */
export function insertCardAt(
  board: Board,
  colIdx: number,
  cardIdx: number,
  card: Card,
): Board {
  return replaceColumn(board, colIdx, (c) => {
    const cards = c.cards.slice();
    const clamped = Math.max(0, Math.min(cardIdx, cards.length));
    cards.splice(clamped, 0, card);
    return { ...c, cards };
  });
}

export function updateCard(
  board: Board,
  colIdx: number,
  cardIdx: number,
  patch: Partial<Card>,
): Board {
  return replaceColumn(board, colIdx, (c) => ({
    ...c,
    cards: c.cards.map((cd, i) => (i === cardIdx ? { ...cd, ...patch } : cd)),
  }));
}

export function deleteCard(
  board: Board,
  colIdx: number,
  cardIdx: number,
): Board {
  return replaceColumn(board, colIdx, (c) => ({
    ...c,
    cards: c.cards.filter((_, i) => i !== cardIdx),
  }));
}

export function toggleCard(
  board: Board,
  colIdx: number,
  cardIdx: number,
): Board {
  return replaceColumn(board, colIdx, (c) => ({
    ...c,
    // A plain-bullet card (#194, `checked === null`) renders no checkbox, so it's
    // unreachable from the UI; guard anyway so `null` stays `null` (never `true`).
    cards: c.cards.map((cd, i) =>
      i === cardIdx
        ? { ...cd, checked: cd.checked === null ? null : !cd.checked }
        : cd,
    ),
  }));
}

/**
 * Move a card within a column (reorder) or between columns (status change) —
 * the one op covering both, so dnd-kit's drop just computes source + target. A
 * within-column move matches `arrayMove` semantics (`toIdx` is the destination
 * index in the original ordering); a cross-column move inserts before the target
 * index. Out-of-range source/target → the board unchanged.
 */
export function moveCard(
  board: Board,
  fromCol: number,
  fromIdx: number,
  toCol: number,
  toIdx: number,
): Board {
  const cols = board.columns;
  const source = cols[fromCol];
  const target = cols[toCol];
  if (!source || !target) return board;
  const card = source.cards[fromIdx];
  if (card === undefined) return board;

  if (fromCol === toCol) {
    const cards = source.cards.slice();
    cards.splice(fromIdx, 1);
    const clamped = Math.max(0, Math.min(toIdx, cards.length));
    cards.splice(clamped, 0, card);
    return replaceColumn(board, fromCol, (c) => ({ ...c, cards }));
  }

  const srcCards = source.cards.filter((_, i) => i !== fromIdx);
  const tgtCards = target.cards.slice();
  const clamped = Math.max(0, Math.min(toIdx, tgtCards.length));
  tgtCards.splice(clamped, 0, card);
  return {
    ...board,
    columns: cols.map((c, i) =>
      i === fromCol
        ? { ...c, cards: srcCards }
        : i === toCol
          ? { ...c, cards: tgtCards }
          : c,
    ),
  };
}

// --- Column mutations ---

export function addColumn(board: Board, name: string): Board {
  return {
    ...board,
    columns: [...board.columns, { name, complete: false, cards: [] }],
  };
}

export function renameColumn(
  board: Board,
  colIdx: number,
  name: string,
): Board {
  return replaceColumn(board, colIdx, (c) => ({ ...c, name }));
}

export function deleteColumn(board: Board, colIdx: number): Board {
  if (colIdx < 0 || colIdx >= board.columns.length) return board;
  return { ...board, columns: board.columns.filter((_, i) => i !== colIdx) };
}

/** Move a column (reorder the lanes); out-of-range source → unchanged. */
export function moveColumn(
  board: Board,
  fromIdx: number,
  toIdx: number,
): Board {
  if (fromIdx < 0 || fromIdx >= board.columns.length) return board;
  const cols = board.columns.slice();
  const [col] = cols.splice(fromIdx, 1);
  if (!col) return board;
  const clamped = Math.max(0, Math.min(toIdx, cols.length));
  cols.splice(clamped, 0, col);
  return { ...board, columns: cols };
}

/**
 * Move EVERY card in `fromCol` into the column immediately to its right (#283),
 * appending them after that column's existing cards. No-op if `fromCol` is the
 * rightmost column, out of range, or already empty. Cards keep their `checked`
 * state (no auto-complete), consistent with a drag-move.
 */
export function moveAllCardsRight(board: Board, fromCol: number): Board {
  const target = fromCol + 1;
  const source = board.columns[fromCol];
  const dest = board.columns[target];
  if (!source || !dest || source.cards.length === 0) return board;
  return {
    ...board,
    columns: board.columns.map((c, i) =>
      i === fromCol
        ? { ...c, cards: [] }
        : i === target
          ? { ...c, cards: [...c.cards, ...source.cards] }
          : c,
    ),
  };
}
