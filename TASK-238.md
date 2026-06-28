# TASK-238

### 238. [x] Overhaul Kanban card interaction + unify the create/edit UI into a single-field composer (drag-only card surface, non-overlaying buttons)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

The Kanban board's card interaction and inline edit UI have grown inconsistent. Today
(`src/components/Kanban/KanbanPanel.tsx`):

- **Create** already uses a clean **single textarea composer** (`BoardColumn`'s
  `composing`/`composerText`, ~lines 343–501): first line → title, remaining lines →
  body; **Enter** submits, **Shift+Enter** inserts a detail line; an action row
  (`.composerActions`) with **Add card** + **Cancel** sits in normal flow below the
  textarea.
- **Edit**, by contrast, uses **two separate fields** — a title `<input>`
  (`.cardTitleInput`) and a body `<textarea>` (`.cardBodyInput`) — plus the
  **absolutely-positioned `.cardActions` overlay** (top-right, #195) that shows the Done
  (`Check`) + `Trash` buttons **on top of the text** (the title input even carries
  `padding-right: var(--space-24)` to keep its text out from under the Done button — i.e.
  the overlay literally covers the content).
- **Card surface:** the whole card is the drag grip (#233), but the **title is a
  `<button onClick={onStartEdit}>`** — so a plain click on the title opens edit, mixing
  the click-to-edit and click-to-drag gestures.

This task **overhauls card interaction and unifies create + edit into one single-field
composer-style UI:**

1. **Clicking/dragging a card always drags it.** The title stops being a click-to-edit
   button — it becomes plain display text, part of the draggable surface. **Editing is
   reachable only via the pencil button; deleting only via the trash button.**
2. **Create AND edit use a single input field.** Edit becomes a **single textarea**
   (exactly like the create composer): first line = the card "sentence" (title),
   **Shift+Enter** adds detail/description lines, **Enter** commits. Elaborate multi-line
   markdown edits are deliberately **left to the Raw editor** (the Board/Raw toggle,
   #147/#149) — the inline edit stays simple.
3. **Edit buttons no longer overlay the text.** In edit mode the action buttons render in
   **normal flow below the textarea** (like `.composerActions`), not in the absolute
   `.cardActions` overlay.

**User decisions (step 5):**

- **Edit action row = Save + Cancel + Delete** (full parity with the create composer's
  Add + Cancel, plus Delete). Save commits + exits; Cancel discards + exits; Delete
  removes the card. Layout: Save + Cancel grouped left, **Delete pushed to the right**.
- **Click-away while editing = commit** (preserve the current commit-on-blur-out and
  commit-on-switch behavior — no lost typing). Cancel is the only discard path.
- **Body interactivity stays:** the rendered body's **task-list checkboxes (#173) and
  links** remain clickable in view mode (they already stop the drag via `pointerdown`),
  and the card's own **done-checkbox** stays clickable. Only the **card surface + title**
  initiate a drag.

**Grounding — exactly what to change** (`src/components/Kanban/KanbanPanel.tsx` +
`KanbanPanel.module.css`):

- **`SortableCard` (view mode):** turn the title `<button className={styles.cardTitle}
  onClick={onStartEdit}>` (~lines 186–195) into a **non-interactive element** (e.g.
  `<div className={styles.cardTitle}>` / span) showing `card.title` (keep the `.untitled`
  fallback and the `.cardDone .cardTitle` strikethrough). Do **not** add `noDrag` to it —
  the title should be part of the drag surface. Remove the now-unused click-to-edit.
- **`.cardActions` overlay:** render it **only in view mode** — the hover/focus-revealed
  **pencil** (→ `onStartEdit`) + **trash** (→ `onDelete`) cluster stays for view mode
  (keep its CSS). Do **not** render it while editing.
- **`SortableCard` (edit mode):** replace the title input + body textarea + overlay with
  a **single textarea** (composer-style) followed by a **flow action row**:
  - The textarea binds to a single edit-text value (see state change below), placeholder
    like `"Write a card… Shift+Enter for detail lines"`, `autoFocus`, `noDrag`,
    `noAutoCapitalize`. **Enter** (no Shift, not `isComposing`) → commit (`onStopEdit`);
    **Shift+Enter** → newline; **Escape** → cancel (discard) — mirroring the composer's
    `onKeyDown`.
  - The action row (reuse/mirror `.composerActions`): **Save** (→ `onStopEdit`, styled
    like `.composerAdd`), **Cancel** (→ a new `onCancelEdit`, styled like
    `.composerCancel`), and **Delete** (→ `onDelete`, right-aligned — `margin-left:auto`
    or a spacer — styled as a subtle danger/`.cardBtn`-like control). Keep `noDrag` on
    the row. In edit mode, render **only** this textarea + action row (hide the
    checkbox/title row), matching the composer's shape.
- **State change (single-field edit):** the edit draft is currently `CardDraft =
  { title; body }` (`editDraft`, `onDraftChange(Partial<CardDraft>)`). Change the edit
  flow to a **single string**:
  - Seed in `startCardEdit` from the card: `card.title + (card.body ? "\n" + card.body :
    "")`.
  - On commit (`commitCardDraft`), **split** the text into `{ title, body }` with the
    **same rule the composer uses** (`submitComposer`, ~lines 354–364: first line →
    `title.trim()`, rest → `body` joined + `trimEnd()`), then `updateCard` only if it
    differs from the current card.
  - **Extract a shared helper** `splitCardText(text): { title, body }` (module-level in
    `KanbanPanel.tsx`) and use it in **both** `submitComposer` and `commitCardDraft` so
    the create/edit parse can't diverge.
  - Update `CardProps` accordingly (`editText: string | null` + `onEditTextChange` +
    `onCancelEdit` replacing `draft`/`onDraftChange`), and the `BoardColumn` →
    `SortableCard` wiring + the `KanbanPanel` handlers (`stopCardEdit` stays commit;
    add `cancelCardEdit` = clear `editing`/`editText` **without** committing).
- **Keep unchanged:** the create composer (already single-field — only optionally align
  class reuse), `CardPreview` (drag overlay, no buttons), the DnD wiring + 4px activation,
  `noDrag` on the done-checkbox + body, the Board/Raw toggle, column rename/add/delete,
  `kanbanOps`/`kanban.ts`, and the autosave/commit-on-confirm plumbing (#160).
- **CSS:** drop `cursor: text` from `.cardTitle` (it's display now; the card's grab
  cursor governs). Remove the now-unused `.cardTitleInput` + `.cardBodyInput`. Add a card
  edit textarea style (mirror `.composerInput`) + an edit action row (mirror
  `.composerActions`) with a right-aligned Delete; or reuse the `.composer*` classes
  directly. Keep `.cardActions`/`.cardBtn` for the view-mode overlay.

**Scope / out of scope.**

- **In scope:** the card view/edit interaction + the unified single-field edit UI as
  above (`KanbanPanel.tsx`, `KanbanPanel.module.css`).
- **Out of scope:** column color configuration and the "bigger Add card / Cancel buttons"
  request (separate Refine cards); the Raw editor; `kanbanOps.ts` / `kanban.ts` parsing
  engine (the markdown format is unchanged — title + body still serialize identically);
  the drag/drop mechanics and DragOverlay; any backend change. **Note:** the "bigger
  buttons" card may also touch `.composerAdd`/`.composerCancel`; reusing those classes for
  edit means that task would naturally style the edit buttons too — acceptable, not a
  blocking dependency.

**Subtasks**

1. [ ] **View-mode title → display text:** replace the `.cardTitle` `<button
   onClick={onStartEdit}>` with a non-interactive element (keep `.untitled` + strikethrough);
   ensure it's part of the drag surface (no `noDrag`). Remove the title's click-to-edit.
2. [ ] **View-mode actions:** keep the hover/focus `.cardActions` overlay (pencil + trash)
   but render it **only when not editing**.
3. [ ] **Single-field edit state:** add `splitCardText(text)` (module-level), switch the
   edit draft from `{title,body}` to a single `editText: string`, seed it as
   `title + ("\n" + body)?`, and split on commit via the shared helper. Add a
   `cancelCardEdit` (discard, no commit). Update `CardProps` + `BoardColumn` + `KanbanPanel`
   wiring.
4. [ ] **Edit-mode UI:** render a single textarea (Enter=commit, Shift+Enter=newline,
   Escape=cancel; `autoFocus`, `noDrag`) + a flow action row **Save | Cancel … Delete**
   (Delete right-aligned), no overlay. Hide the checkbox/title row while editing.
5. [ ] **CSS:** add the edit textarea + action-row styles (mirroring `.composerInput` /
   `.composerActions` / `.composerAdd` / `.composerCancel`, Delete right-aligned & subtle
   danger); remove `.cardTitleInput` + `.cardBodyInput`; drop `cursor:text` from `.cardTitle`.
6. [ ] **Verify:** `npm run build`, `npm run lint`, `npm test` (incl. `kanban*.test.ts`)
   pass. Manual: clicking a card surface/title drags (never edits); pencil opens the
   single-field editor; typing + Shift+Enter adds detail lines; Enter / Save / click-away
   commit; Cancel discards; Delete removes; the Save/Cancel/Delete buttons never overlap
   the textarea text; body task-checkboxes + links + the done-checkbox still work.

**Acceptance criteria**

- [x] Clicking anywhere on a card's surface or **title** initiates a **drag** (4px
      activation) and **never** opens edit. The title is plain display text.
- [x] **Edit** is reachable only via the **pencil** button; **delete** only via the
      **trash** button (view mode) and the **Delete** button (edit mode).
- [x] **Edit uses a single textarea** seeded with the card's title + body: first line =
      title, **Shift+Enter** adds detail lines, **Enter** commits. Title and body
      round-trip correctly through `splitCardText` (no data loss vs. the markdown format).
- [x] The edit action buttons (**Save**, **Cancel**, **Delete**) render in **normal flow
      below the textarea** and **never overlay** the text. Layout: Save + Cancel left,
      Delete right-aligned.
- [x] **Save** (and **Enter**, and **clicking away**) commit the edit; **Cancel** (and
      **Escape**) discard it and return to view mode; **Delete** removes the card.
- [x] Body **task-list checkboxes** and **links**, plus the card's **done-checkbox**,
      remain clickable in view mode (clicking them does not start a drag).
- [x] The create composer, drag/drop, DragOverlay, column ops, Board/Raw toggle, and the
      markdown serialization are unchanged. `npm run build` / `lint` / `test` pass.
- [x] Pure frontend — identical on macOS and Windows (the one platform-specific bit, the
      `kbdHint` for the Raw Save button, is untouched).

**Notes**

- **User answers (step 5):** edit row = **Save + Cancel + Delete** (Delete right-aligned);
  click-away **commits** (Cancel is the discard path); body checkboxes + links + the
  done-checkbox **stay clickable** (only the surface/title drags).
- **Why unify toward the composer:** create already nails the single-field UX; this makes
  edit match it (one `splitCardText` for both), removes the dual-input + overlay edit
  surface, and resolves the "buttons overlay the text" defect by moving them into flow.
- **Commit-on-blur preserved:** the existing `onEditBlur` (commit when focus leaves the
  whole card) keeps working — Save/Cancel/Delete are inside the card so they don't trigger
  a premature blur-commit, and Cancel discards before any commit. Keep `stopCardEdit`
  (commit) for blur/Enter/Save and switching cards; add `cancelCardEdit` (discard) for
  Cancel/Escape.
- **Reuse references:** `BoardColumn`'s composer (`composerText`, `submitComposer`,
  `.composer*` CSS) is the exact template for the edit textarea + action row; the
  view-mode `.cardActions` overlay (pencil/trash) is kept as-is.
- **Dependencies:** none — builds entirely on shipped Kanban code (#143/#160/#161/#173/
  #194/#233). The two sibling Kanban Refine cards (column colors, bigger buttons) are
  independent; if "bigger buttons" reuses the same composer classes, it will style the
  edit buttons too (harmless).
- **Cross-platform:** pure frontend; no OS-specific paths or shell-outs. Renders
  identically in WKWebView (macOS) and WebView2 (Windows).
