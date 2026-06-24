### 161. [ ] Kanban board UI/UX polish pass

**Status:** Not started
**Depends on:** #159, #160
**Created:** 2026-06-24

**Description**

The user is unhappy with the Kanban board's look and feel: "I don't like the UI of the
kanban items. Iterate over the entire Kanban screen UI and ensure it is optimized for
UX." This is a **visual + interaction polish pass** over the existing board — not a
data-model or format change.

**Goal / why:** make the board feel clean, legible, and direct: tidy visual hierarchy,
uncluttered cards, clear drag/drop affordances, sensible empty states, and a toolbar
that survives narrow widths — while keeping every existing capability and the
Obsidian-Kanban `.md` round-trip intact.

**Builds on (why the dependencies):** this is the *last* kanban pass, so it iterates
on the cleaned-up code rather than fighting it:
- **#159** removes the column move-left/right buttons → the column header's only action
  becomes Delete. Polish the header around that final shape (don't re-add the buttons).
- **#160** changes card editing to **commit-on-confirm** (local draft, write on the
  Done-editing checkmark) → polish the card edit affordances (edit/confirm/cancel)
  around that model, not the old per-keystroke one.
(#156 — Overview horizontal scroll — is already done; no dependency needed.)

**Current UI (grounded) — `src/components/Kanban/KanbanPanel.tsx` +
`KanbanPanel.module.css`:**

- `.panel` = a `.toolbar` (right-aligned Board/Raw `.segmented` toggle + a
  `margin-right:auto` "Saving…/Saved" `.status`) over the `.board`.
- `.board` = horizontal flex of `.column`s (each `flex:0 0 auto; width:248px`),
  `overflow-x:auto`.
- `.column` = `.columnHeader` (`.columnName` button — uppercase 600 — + `.count` badge
  + `.columnActions`) then `.cards` (`overflow-y:auto`, gap 8, the drop target;
  `.cardsOver` tints the whole column `--accent-dim` on drag-over) then a dashed
  `.addCard` button. A dashed `.addColumn` button trails the columns.
- `.card` = `.cardTop` (a 13px `GripVertical` `.cardGrip` drag handle, a `Checkbox`,
  the `.cardTitle` button / edit input, and `.cardActions` Edit+Delete — **always
  visible**) plus an optional rendered-markdown `.cardBody`. Cards use `useSortable`
  (drag → `opacity:0.4` + transform); the board `DndContext` uses
  `collisionDetection={closestCorners}`. There is **no `DragOverlay`** and **no precise
  insertion indicator** (only the column tint) and **no empty-column state**.

**Scope:** restyle/retune the board, columns, cards, toolbar, and drag/drop
affordances using **on-system tokens only**, preserving all behavior. Concrete targets
in Subtasks.

**Explicitly out of scope:**

- The `.md` data model, `parseBoard`/`serializeBoard`, and the Obsidian-Kanban format
  (frontmatter / `**Complete**` / `%% kanban:settings %%`) — untouched; the round-trip
  must stay lossless.
- Re-introducing the column move buttons removed by #159, or changing #160's save model
  (only style the affordances around it).
- New features beyond UX polish (e.g. card labels/dates/assignees, swimlanes,
  collapsible columns, WIP limits) — not part of "polish."
- FileViewer (#158 handles its toolbar). This task **does** fix the *kanban* toolbar
  (identical structure) that #158 explicitly deferred here.

**Subtasks** (each is a concrete, verifiable improvement; keep behavior identical)

1. [ ] **Card clutter → hover/focus-revealed actions:** make `.cardActions` (Edit /
   Delete) and the `.cardGrip` reveal on card **hover** and on keyboard **focus-within**
   (always visible when focused for a11y), instead of always-on. The title, checkbox,
   and body stay always interactive.
2. [ ] **Card visual hierarchy:** refine `.card` padding, border, and a subtle
   hover/active elevation (`--bg-hover`/`--bg-elevated`, hairline border, `--radius-*`);
   make the title the focal element; keep the done state (`.cardDone` strike-through +
   muted) but ensure it reads clearly. Tighten/normalize spacing tokens.
3. [ ] **Clearer drop affordance:** improve on the whole-column `--accent-dim` tint —
   add a visible **insertion indicator** (a thin `--accent` line / gap showing where the
   card will land) using the existing `useSortable` ordering, and/or a `DragOverlay`
   ghost of the dragged card so the drag reads cleanly (the card currently just dims to
   0.4 in place). Keep cross-column drag = status change.
4. [ ] **Column header polish:** tidy the `.columnHeader` around its post-#159 shape —
   `.columnName` rename affordance (hover cue that it's editable), the `.count` badge
   styling, and the lone Delete action (reveal on hover/focus like card actions).
   Ensure the rename input and the confirm-delete state look intentional.
5. [ ] **Empty states:** an empty column shows a subtle "No cards yet" hint above the
   Add-card button (not just an empty gap); confirm the Add-card / Add-column dashed
   buttons read as clearly secondary/affordant. (Structure-less files already open in
   Raw — unchanged.)
6. [ ] **Toolbar responsiveness (folded in from #158):** make the kanban `.toolbar`
   usable at narrow widths — `.toolbar { min-width:0 }`, `.status { min-width:0;
   overflow:hidden; text-overflow:ellipsis; white-space:nowrap }`, `.segmented {
   flex-shrink:0 }` so the Board/Raw toggle never clips (mirroring TASK-158's FileViewer
   toolbar fix).
7. [ ] **Consistency + a11y + motion:** on-system tokens only (no off-palette colors);
   `:focus-visible` outlines on all interactive elements (cards, buttons, inputs);
   honor `prefers-reduced-motion` for any new transitions/animations; verify dark-theme
   contrast.
8. [ ] **No regressions:** add/edit/delete cards, toggle done, drag within + across
   columns (status change), add/rename/delete columns, Board⟷Raw toggle, hot-reload,
   and the #160 commit-on-confirm save all still work, in **both** Overview and Canvas
   (and a detached window).
9. [ ] **Verify:** `npm run build`, `npm run lint`, `npm run format:check`, `npm test`
   (the existing `kanban.test.ts` / `kanbanOps.test.ts` parse/serialize + ops tests must
   still pass — this is style only). Manually walk every interaction above.

**Acceptance criteria**

- [ ] Cards look less cluttered: Edit/Delete (and grip) appear on hover/focus, not
      always; the card has a clear hover/active state and a legible title-first
      hierarchy.
- [ ] Dragging a card shows a clear destination cue (insertion indicator and/or drag
      ghost), better than the current whole-column tint alone; cross-column drag still
      changes status.
- [ ] The column header (rename, count, Delete) reads as intentional and uncluttered
      after #159's button removal.
- [ ] Empty columns show a subtle hint rather than a bare gap.
- [ ] The Board/Raw toggle stays visible/usable at narrow widths (kanban toolbar
      responsive, mirroring #158).
- [ ] All on-system tokens, `:focus-visible` outlines present, reduced-motion honored.
- [ ] Every existing interaction works unchanged in Overview, Canvas, and a detached
      window; the `.md` round-trip is lossless.
- [ ] `npm run build`, `npm run lint`, `npm run format:check`, `npm test` pass.

**Notes**

- **Vague-request handling:** "optimize the UX" is subjective, so this plan fixes
  *concrete* current shortcomings (always-visible clutter, weak drop cue, no empty
  state, fragile toolbar, minimal hover/focus states) rather than an open-ended
  "redesign." The implementer may use judgment on exact spacing/visuals **within** the
  listed targets and the on-system token system; the bound is "polish the existing
  structure," not "new features."
- **Why depend on #159 + #160:** both edit `KanbanPanel.tsx` (column header / card
  editing). Doing this pass last means iterating on the final shape and avoids redoing
  or conflicting with their changes (the iteration-last pattern). If the implementer
  picks this up before #159/#160 land, it should be rebased after them.
- **Toolbar fix ownership:** TASK-158 deferred the kanban toolbar (identical structure
  to the FileViewer's) to "the Kanban UI cards" — subtask 6 is that fix.
- **Task numbering:** highest existing is #160 (TASK-154…160.md; board #156–#160;
  `TASK_ARCHIVE.md` ≤ #153). Hence #161.
- **References:** `KanbanPanel.tsx` (`.toolbar` ≈ 470-484, `SortableCard` ≈ 95-205,
  `BoardColumn` ≈ 231-326, `.cardsOver`/`isOver` ≈ 300, `DndContext`
  `closestCorners` ≈ 495-501), `KanbanPanel.module.css` (all `.board/.column/.card/
  .toolbar/...` rules), TASK-158 (FileViewer toolbar fix to mirror), `tokens.css`
  (design tokens), `global.css` (reduced-motion killswitch).
