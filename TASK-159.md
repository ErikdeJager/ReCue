### 159. [ ] Remove Kanban column move-left/right buttons (move per task, not whole columns)

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-24

**Description**

The Kanban board's column header has two chevron buttons — **Move column left**
(`‹`) and **Move column right** (`›`) — that shift an entire column (with all its
cards) one position over. The card: "The Kanban UI should not have buttons to move the
entire content from one column to the next. We want to move things per task." i.e.
remove these whole-column move buttons; moving should be done **per card** via the
existing drag handle.

**Goal / why:** declutter the column header and steer interaction toward per-card
drag-and-drop (the intended way to move a task between lanes), removing the
coarse "move the whole column" affordance the user finds confusing/unwanted.

**Grounding (concrete files / symbols):**

- `src/components/Kanban/KanbanPanel.tsx`
  - `BoardColumn` column header (`styles.columnActions`, ≈ lines 260-296) renders
    **three** buttons: `onMove(-1)` "Move column left" (`<ChevronLeft>`, ≈ 261-270),
    `onMove(1)` "Move column right" (`<ChevronRight>`, ≈ 271-280), and Delete. Only
    the two chevrons are in scope.
  - `ColumnProps` declares `onMove: (dir: -1 | 1) => void`, `isFirst: boolean`,
    `isLast: boolean` (≈ lines 211-219) — used only to wire/disable those chevrons.
  - Call site (≈ lines 505-525): `isFirst={col === 0}`, `isLast={col ===
    board.columns.length - 1}`, `onMove={(dir) => mutate(moveColumn(board, col, col +
    dir))}`.
  - Imports: `ChevronLeft`, `ChevronRight` (lines 26-27) and `moveColumn` (line 49)
    — all become unused after the removal.
- `src/components/Kanban/kanbanOps.ts` — `moveColumn(board, fromIdx, toIdx)` pure op
  (≈ line 154), unit-tested in `kanbanOps.test.ts` (≈ line 104). After this change the
  **only** caller (the chevrons) is gone.
- **Cards already move per task:** each card has a `GripVertical` drag handle
  ("Drag to move card", ≈ lines 115-124) and dragging between lanes is a status change
  (the board's nested dnd-kit, `moveCard`). The card-level actions are only Edit/Done +
  Delete — no per-card move buttons. So per-task movement is fully preserved.

**Scope:** remove the two column move-left/right buttons and their now-dead wiring
(props, handler, imports) from `KanbanPanel.tsx`. Keep the column **rename** and
**delete** header actions, and all per-card behavior.

**Explicitly out of scope:**

- **Column reordering by drag.** These buttons are currently the *only* way to reorder
  columns, so removing them removes column reordering from the UI (a deliberate
  consequence the card accepts — "move things per task"). Adding drag-to-reorder
  columns is **not** part of this task; it belongs to the broader **"Kanban UI
  iteration"** card (also in Refine) — cross-reference there.
- The `moveColumn` pure op in `kanbanOps.ts` and its unit test — **keep** them (see
  Notes); only its UI caller is removed.
- Per-card drag, rename, delete, the Board/Raw toggle, and any other Kanban behavior.

**Subtasks**

1. [ ] In `KanbanPanel.tsx` `BoardColumn`, delete the two chevron buttons
   (`onMove(-1)` / `onMove(1)`, ≈ lines 261-280) from `styles.columnActions`, leaving
   the Delete button as the sole column action.
2. [ ] Remove `onMove`, `isFirst`, and `isLast` from the `ColumnProps` interface
   (≈ lines 211-219).
3. [ ] Remove the `isFirst={…}`, `isLast={…}`, and `onMove={…}` props from the
   `<BoardColumn>` call site (≈ lines 511-519).
4. [ ] Remove the now-unused imports `ChevronLeft`, `ChevronRight` (lines 26-27) and
   `moveColumn` (line 49) from `KanbanPanel.tsx`. (Leave `moveColumn`'s **export** in
   `kanbanOps.ts` — it is still imported by `kanbanOps.test.ts`.)
5. [ ] Confirm `npm run lint` reports no unused-variable/import errors and `npm run
   build` (type-check) passes — the removed props must not be referenced anywhere.
6. [ ] **Manual verification:** open a Kanban board (Overview and Canvas) → the column
   headers show only the name, count, and Delete; there are no left/right column-move
   buttons; cards still drag between columns (status change) and within a column;
   rename and delete columns still work; add card/column still work.
7. [ ] Run `npm run build`, `npm run lint`, `npm test` (the existing
   `kanbanOps.test.ts moveColumn` test still passes since the op is retained).

**Acceptance criteria**

- [ ] The Kanban column header no longer shows Move-left / Move-right buttons (in both
      Overview and Canvas).
- [ ] Moving a card between columns (drag) and reordering within a column still work;
      column rename, delete, add-card, and add-column still work.
- [ ] No dead/unused imports or props remain (`KanbanPanel.tsx` clean); `npm run
      build`, `npm run lint`, `npm test` pass.

**Notes**

- **Interpretation:** "buttons to move the entire content from one column to the next"
  = the column move-left/right chevrons (they shift a whole column — its entire
  contents — past the neighbor). The fix removes exactly those two buttons; per-card
  drag (already present) is the supported way to "move things per task."
- **Keep `moveColumn` + its test.** It's a small, tested pure op and the upcoming
  **"Kanban UI iteration"** card may re-introduce column reordering via drag, which
  would reuse it. Its export stays live (the test imports it), so no lint error. If a
  future reviewer insists on zero unreferenced-by-app code, deleting `moveColumn` and
  its test is acceptable since no shipped feature would use it — but keeping is
  preferred to avoid churn.
- **Consequence to flag:** with the buttons gone, columns can no longer be reordered
  until drag-reorder is added (out of scope here; tracked under the Kanban UI
  iteration card).
- **Task numbering:** highest existing is #158 (TASK-154…158.md; board #155–#158;
  `TASK_ARCHIVE.md` ≤ #153). Hence #159.
- **Dependencies:** none — a self-contained removal in `KanbanPanel.tsx`. Independent
  of #156 (kanban scroll) and #158 (FileViewer); related to the broader Kanban UI
  iteration card but not blocked by it.
- **References:** `KanbanPanel.tsx` (`BoardColumn` header ≈ 260-296, `ColumnProps`
  ≈ 207-227, call site ≈ 505-525, imports 26-27 & 43-54, card grip ≈ 115-124),
  `kanbanOps.ts` (`moveColumn` ≈ 154, `moveCard`), `kanbanOps.test.ts` (≈ 104).
