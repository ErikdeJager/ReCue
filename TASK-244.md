# TASK-244

### 244. [ ] Remove the Delete button from Kanban card edit mode (Save + Cancel only)

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-28

**Description**

When a Kanban card is in **edit mode**, the inline action row currently shows three
buttons — **Save**, **Cancel**, and **Delete** (the trash button, pushed to the right per
#238). See `src/components/Kanban/KanbanPanel.tsx` ~L205–233 (the `cardEditActions` row
inside the `editing ?` branch): the `cardEditDelete` button (`Trash2` + "Delete",
~L224–232) calls `onDelete`.

The user wants the edit-mode action row to offer **only Save and Cancel**. Deleting a card
should happen **outside** of editing, via the card's existing **view-mode delete button** —
the hover/focus-revealed trash icon in the card's top-right cluster (`cardActions`,
`KanbanPanel.tsx` ~L262–281, the `Trash2` button at ~L272–280 that already calls
`onDelete`). That view-mode affordance already exists and stays; only the **edit-mode**
Delete is removed.

So this is a small, focused UI change: drop the Delete button from the edit-mode action
row, leaving the editor with a clean Save / Cancel pair, and clean up the now-unused
styling/comments.

**Out of scope:**
- The **view-mode** delete button (the hover trash icon) — it stays exactly as is; it's
  the intended deletion path.
- Adding a keyboard Delete-key shortcut for cards — not requested by the card (the
  existing on-card trash button is "the delete button" referenced).
- The Save/Cancel buttons' appearance, padding, or keyboard-hint indicators — those are a
  separate Refine card (the "Kanban edit/save buttons keyboard shortcut indicator for
  Enter + thinner padding" card). This task only removes the Delete button. (Both touch
  the same `cardEditActions` row but neither blocks the other.)
- The add-card composer's buttons (its action row has no Delete to begin with).

**Subtasks**

1. [ ] In `src/components/Kanban/KanbanPanel.tsx`, inside the `editing ?` branch's
   `cardEditActions` row (~L205–233), **delete the `cardEditDelete` button** (the
   `<button … className={styles.cardEditDelete} onClick={onDelete} …><Trash2 …/> Delete
   </button>` block, ~L223–232 including its `{/* Delete pushed to the right … */}`
   comment). The row should then contain only the **Save** and **Cancel** buttons.
2. [ ] Keep the `onDelete` prop and the rest of the component intact — `onDelete` is still
   used by the **view-mode** trash button (~L275), so do **not** remove the prop, the
   `Trash2` import (still used in view mode at ~L279), or `deleteCard`.
3. [ ] Update the stale comment on the `cardEditActions` wrapper (~L199–204) that mentions
   "Save/Cancel/Delete" — change it to reference only Save/Cancel so the comment matches
   the code.
4. [ ] Remove the now-unused **`.cardEditDelete`** CSS rule from
   `src/components/Kanban/KanbanPanel.module.css` (search for `cardEditDelete`). Leave
   `cardActions` / `cardBtn` (view-mode buttons) untouched.
5. [ ] Verify the editor still commits/cancels correctly: Save commits, Cancel discards,
   Enter commits, Escape discards (unchanged) — and that removing the button doesn't
   affect the `onEditBlur` commit-on-blur logic (~L145–151) or the `onMouseDown`
   preventDefault focus guard (~L199–207).
6. [ ] Run `npm run build`, `npm run lint`, and `npm test` (the Kanban unit tests in
   `kanban.test.ts` / `kanbanOps.test.ts` should be unaffected — this is a presentational
   change only).

**Acceptance criteria**

- [ ] A Kanban card in **edit mode** shows only **Save** and **Cancel** — no Delete button.
- [ ] A Kanban card in **view mode** still shows the hover/focus-revealed **Delete (trash)**
  button, and clicking it still deletes the card.
- [ ] No leftover unused code: the `.cardEditDelete` CSS rule is removed, and there are no
  unused-import/variable lint errors (`Trash2` and `onDelete` remain used by view mode).
- [ ] Save / Cancel / Enter / Escape editing behavior is unchanged.
- [ ] `npm run build`, `npm run lint`, and `npm test` all pass.
- [ ] **Works on both macOS and Windows.** This is a pure frontend React/CSS change with
  no OS-divergent code (no paths, shell-outs, native open/reveal, or platform key
  handling), so it behaves identically on both platforms.

**Notes**

- Investigation findings: the edit-mode Delete is `KanbanPanel.tsx` ~L224–232; the
  view-mode Delete (which stays) is ~L272–280. Both call the same `onDelete` callback, so
  removing the edit-mode button changes nothing about how deletion works elsewhere.
- Assumption (trivial/obvious, not asked): "the delete button" in the card text refers to
  the **existing view-mode hover trash icon**, which already deletes a card — so no new
  deletion affordance (e.g. a keyboard shortcut) is needed; this task only removes the
  edit-mode button.
- Related Refine card (no dependency either way): the "Kanban edit/save buttons keyboard
  shortcut indicator for Enter + slightly thinner padding" card also edits this same
  `cardEditActions` / composer button area. They can be implemented in any order; just be
  aware both touch this region.
- This card was clear after grounding in the code; no user clarification was required.
