### 160. [x] Kanban: commit card edits on confirm, not on every keystroke

**Status:** Done
**Depends on:** none
**Created:** 2026-06-24

**Description**

Editing a Kanban card writes to disk on **every keystroke**. The card: "I want, for
the kanban board specifically, it to only save once I click the little checkmark for
an individual card. Instead of the constant auto saving." So while you type a card's
title/body, the board is serialized and the file is (debounced) written over and over;
the user wants the edit **committed once when they confirm the card** (the per-card
**Done-editing checkmark**), not continuously.

**Goal / why:** stop the per-keystroke save churn during card editing. Hold the
card's in-progress title/body in **local draft state** and write it through the save
buffer **once** when the user finishes editing that card (clicks the Done-editing
checkmark, or blurs / presses Enter). Discrete actions (toggle done, drag a card,
add/delete) keep saving immediately — they aren't "constant," and the complaint is
specifically about typing.

**Grounding (concrete files / symbols) — `src/components/Kanban/KanbanPanel.tsx`:**

- Save path: `useAutoSaveFile(repoPath, file, active)` returns `text` + `setText`
  (debounced write, #148). `board = parseBoard(text)`; `mutate(next) =
  setText(serializeBoard(next))` (≈ lines 349-383). So **every** `mutate` re-serializes
  the whole board into the buffer → a debounced disk write.
- Card editing (the problem): `editing` state `{col, idx}` (≈ line 363). The
  `SortableCard` title `<input>` and body `<textarea>` call `onChange={(patch) =>
  props.onCardChange(idx, patch)}` (≈ lines 131-202), wired at the call site to
  `mutate(updateCard(board, col, idx, patch))` **on each keystroke**. The
  **Done-editing checkmark** is the `<Check>` button → `onStopEdit` (≈ lines 153-162),
  which only clears `editing` today (the edit was already saved per keystroke).
- Column rename has the same per-keystroke pattern: `onRename={(name) =>
  mutate(renameColumn(board, col, name))}` (≈ line 517) on every keystroke, with
  `onRenameStop` on blur/Enter.
- Discrete mutations (keep immediate): `onToggle` (`toggleCard`), `onDragEnd`
  (`moveCard`, ≈ 406-425), add card/column (`addCard`/`addColumn`), delete
  (`deleteCard`/`deleteColumnAt`).
- Pure ops in `kanbanOps.ts` (`updateCard`, `renameColumn`, etc.) are unchanged — this
  task changes *when* they're applied, not what they do.

**Scope:** change the Board-view **card title/body editing** (and column rename) to a
**commit-on-confirm** model — local draft while editing, one write on confirm. Keep
all other behavior.

**Explicitly out of scope:**

- The global **"Auto save settings"** card (auto vs. manual save + ⌘S). That is a
  separate, global mode; this task is kanban-specific **edit-commit timing** and
  composes with it (in either global mode, a card edit commits once on confirm rather
  than per keystroke). **Independent**, not dependent.
- The **Raw view** textarea (#149) — it stays a normal auto-saving raw editor like the
  FileViewer's raw mode; the complaint is about Board-view card editing.
- Discrete board mutations (toggle done, drag-move, add/delete card, add/delete
  column) — they persist immediately, as now.
- FileViewer / any non-kanban saver.

**Subtasks**

1. [ ] Add local **draft** state in `KanbanPanel` alongside `editing`, e.g.
   `editDraft: { title: string; body: string } | null`. When a card enters edit mode
   (`onCardStartEdit` / `setEditing`), seed the draft from that card's current
   `title`/`body`.
2. [ ] While a card is the one being edited, bind its title `<input>` and body
   `<textarea>` to the **draft** (`value={draft.title/body}`, `onChange` updates the
   draft **locally** — no `mutate`). Non-editing cards still render from `board`.
3. [ ] **Commit on confirm:** in `onCardStopEdit` (the Done-editing `<Check>` button),
   apply `mutate(updateCard(board, col, idx, draft))` once, then clear `editing` +
   draft. Also commit on the title input's **blur** and **Enter**; commit the body on
   **blur** / on stop-edit (don't commit on Enter in the textarea — newline). A no-op
   commit (draft equals the card) should not write.
4. [ ] **Commit-on-switch:** starting to edit a different card (or starting a column
   rename) first commits the in-flight draft, so switching never loses typed edits.
5. [ ] Apply the same **commit-on-confirm** to **column rename**: buffer the name
   locally while `renamingCol` is set and `mutate(renameColumn(...))` only on
   `onRenameStop` (blur/Enter), not per keystroke.
6. [ ] **No mid-edit clobber:** ensure the #148 hot-reload poll can't replace `text`/
   `board` while a card/column draft is open (the local draft isn't in the buffer, so
   the buffer isn't "dirty"). Treat an open edit as dirty/focused — e.g. wire the
   hook's `onFocus`/`onBlur` to the edit inputs (or guard reload while `editing` /
   `renamingCol` is set) so an external poll doesn't shift the board under the editor.
7. [ ] Leave discrete mutations (toggle/drag/add/delete) calling `mutate` immediately
   — unchanged.
8. [ ] **Verify:** `npm run build`, `npm run lint`, `npm test`. Manual: edit a card
   title and body — the "Saving…/Saved" status does **not** churn while typing; click
   the Done-editing checkmark → exactly one save; blur and Enter (title) also commit;
   switching cards mid-edit keeps the edit; column rename saves on blur/Enter only;
   toggling done / dragging / add / delete still save immediately; editing while a hot-
   reload would occur doesn't lose or scramble the edit.

**Acceptance criteria**

- [ ] Typing in a kanban card's title or body triggers **no** per-keystroke disk write
      (no "Saving…" churn while typing).
- [ ] The card edit is written **once** when confirmed — the Done-editing checkmark
      (and also title blur / Enter) — through the existing save buffer.
- [ ] Switching to edit another card or a column commits the in-flight draft (no lost
      edits).
- [ ] Column rename writes on confirm (blur/Enter), not per keystroke.
- [ ] Discrete actions (toggle done, drag, add/delete card, add/delete column) still
      persist immediately.
- [ ] A hot-reload during an open edit does not clobber the in-progress draft.
- [ ] `npm run build`, `npm run lint`, `npm test` pass.

**Notes**

- **Interpretation:** "the little checkmark for an individual card" = the Done-editing
  `<Check>` button shown while editing a card (it commits the card's text edit). Blur/
  Enter are added as equivalent commit triggers for robustness (and in case the user
  also meant clicking away).
- **Why not all mutations:** "constant auto saving" describes per-keystroke writes
  while typing; discrete one-shot actions aren't constant and saving them immediately
  is expected — so they stay immediate.
- **Relationship to "Auto save settings":** that card adds a **global** auto/manual
  toggle + ⌘S across all savers; this card changes kanban **card-edit commit timing**.
  They're orthogonal and compose (a confirmed card edit goes through the buffer, which
  the global mode then writes per its policy). Kept **independent** — no ordering
  dependency. If "Auto save settings" lands first, this still applies (commit-on-
  confirm feeds the buffer either way).
- **Implementation pointer:** the draft is cleanest held in `KanbanPanel` next to
  `editing`, threaded down to `BoardColumn`/`SortableCard` as `draft` + an
  `onDraftChange` (replacing the editing card's `onCardChange→mutate`) + the existing
  `onCardStopEdit` now doing the commit.
- **Task numbering:** highest existing is #159 (TASK-154…159.md; board #156–#159;
  `TASK_ARCHIVE.md` ≤ #153). Hence #160.
- **Dependencies:** none.
- **References:** `KanbanPanel.tsx` (`useAutoSaveFile` wiring ≈ 349-383, `editing`
  state ≈ 363, `SortableCard` inputs ≈ 131-202, `onStopEdit` ≈ 153-162, column rename
  call site ≈ 511-525, `onDragEnd` ≈ 406-425), `kanbanOps.ts` (`updateCard`,
  `renameColumn`), `useAutoSaveFile.ts` (debounced write + dirty/focus reload guard).

**Implementation note (done 2026-06-24)**

Commit-on-confirm model in `KanbanPanel.tsx` (no change to `kanbanOps.ts` /
`useAutoSaveFile.ts`):
- New local draft state `editDraft: CardDraft | null` (`{title, body}`) and
  `renameDraft: string | null`. The editing card's title `<input>` / body
  `<textarea>` (and the column-rename input) bind to the **draft**; `onChange`
  updates the draft via `setEditDraft`/`setRenameDraft` only — **never** `mutate` —
  so typing produces zero per-keystroke writes (the "Saving…" hint never churns).
- Commit handlers (`commitCardDraft` / `commitRenameDraft`) write **once** via the
  existing `mutate` (→ `setText` → the #148 debounced buffer), and only when the
  draft actually differs (no-op edits don't write). Triggers: the Done-editing
  `<Check>` (`stopCardEdit`), **Enter** in the title, and **blur-out of the whole
  card** — an `onBlur` on the `<article>` that uses `relatedTarget` containment so
  moving focus between the card's own controls (title ↔ body ↔ Done) does **not**
  prematurely commit/exit. Column rename commits on blur/Enter.
- **Commit-on-switch:** `startCardEdit` / `startColumnRename` / add-card / add-column
  / drag-start all commit the in-flight draft first, so switching never loses edits.
- **No mid-edit clobber:** a `useEffect` calls the hook's `onFocus()` while an edit
  is open (pauses the hot-reload poll) and `onBlur()` on close (resume + flush the
  committed write), since the local draft doesn't mark the buffer dirty.
- Discrete actions (toggle done, drag-move, add/delete card, add/delete column) keep
  calling `mutate` immediately — unchanged.
- Out of scope (untouched): the Raw-view textarea (#149) stays a normal auto-saving
  editor; the global "Auto save settings" card is independent.
- `npm run build`, `npm run lint`, `npm run format:check`, and `npm test` (205) all
  pass. Subtask 8 (manual UI verification) is interactive; the keystroke-no-write
  guarantee is structural (draft state, no `mutate` on `onChange`).
