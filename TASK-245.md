# TASK-245

### 245. [x] Kanban add/save buttons: Enter shortcut indicator + thinner vertical padding

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

Two small presentational tweaks to the Kanban card **action buttons** that submit text:

1. **Enter shortcut indicator.** The card composer's **"Add card"** submit button and the
   inline editor's **"Save"** button both commit on **Enter** (see the `onKeyDown`
   handlers — composer `KanbanPanel.tsx` ~L498–511, editor ~L182–196 — Enter submits,
   Shift+Enter inserts a detail line, Escape cancels). The user wants these buttons to
   **show a keyboard indicator for Enter**, like the rest of the app already does (an
   inline `<kbd>⏎</kbd>` chip — e.g. `NewSessionModal.tsx` "Schedule ⏎" at ~L1319, the
   `btnKbd` chips at ~L958/1233).

2. **Thinner buttons.** The user finds these buttons too tall: "The width is fine, but the
   padding above and underneath the text should be a bit thinner." Reduce the **vertical**
   padding only, keeping horizontal padding (width) the same.

Both buttons share the `composerAdd` class for the primary/submit button and
`composerCancel` for the secondary; both currently use `padding: var(--space-6)
var(--space-12)` (6px vertical / 12px horizontal — set in #240 to fix the broken
`--space-10` token). See `KanbanPanel.module.css` ~L696–728.

The relevant button sites:
- Edit-mode **Save** button: `KanbanPanel.tsx` ~L209–215 (`styles.composerAdd`).
- Edit-mode **Cancel** button: ~L216–222 (`styles.composerCancel`).
- Add-card composer **"Add card"** submit: ~L515–521 (`styles.composerAdd`).
- Add-card composer **Cancel**: ~L522–528 (`styles.composerCancel`).
- The per-column **"+ Add card" toggle** (`styles.addCard`, ~L532–538) just **opens** the
  composer (no Enter shortcut) — it does **not** get the ⏎ indicator.

**Out of scope:**
- The per-column "+ Add card" **toggle** button (`addCard`) — it opens the composer, it
  doesn't submit on Enter, so no ⏎ chip.
- Adding an **Esc** indicator to the Cancel buttons — the card asks only for an **Enter**
  indicator on the submit/save buttons. (Cancel buttons still get the thinner padding to
  stay the same height as their Save/Add partners — see #240's matched-size intent — but
  no kbd chip.)
- Any change to the buttons' **width**/horizontal padding, colors, or behavior.
- Column rename / other Kanban controls.

**Subtasks**

1. [ ] **Add a `.btnKbd` style** to `src/components/Kanban/KanbanPanel.module.css`,
   mirroring the app convention (`NewSessionModal.module.css` `.btnKbd` ~L411–416):
   `font-family: var(--mono); font-size: var(--fs-meta-sm); font-weight: 400; opacity:
   0.7;`. (It marks the chip as muted monospace.)
2. [ ] **Make the submit/save buttons lay out text + chip inline.** Give `.composerAdd`
   (and, for visual consistency, `.composerCancel`) `display: inline-flex; align-items:
   center; gap: var(--space-6);` so the `⏎` chip sits neatly beside the label without
   wrapping. (Keep their existing border/background/colors.)
3. [ ] **Render the Enter chip** on the two submit/save buttons in `KanbanPanel.tsx`:
   - Edit-mode **Save** (~L209–215): `Save <kbd className={styles.btnKbd}>⏎</kbd>`.
   - Composer **Add card** (~L515–521): `Add card <kbd className={styles.btnKbd}>⏎</kbd>`.
   - Use the literal `⏎` (U+23CE) — it is the same on macOS and Windows, so **do not** use
     `kbdHint` here (that helper is only for ⌘↔Ctrl divergence; plain Enter needs no
     branch, exactly as `NewSessionModal` renders `<kbd>⏎</kbd>` directly).
4. [ ] **Reduce the vertical padding** of `.composerAdd` and `.composerCancel` from
   `var(--space-6) var(--space-12)` to `var(--space-4) var(--space-12)` (4px vertical,
   12px horizontal unchanged) so the buttons get a bit thinner without changing width.
   Update the two `#240`-padding comments to reflect the new vertical value and that the
   two buttons stay size-matched.
5. [ ] Run `npm run build`, `npm run lint`, and `npm test`. Eyeball the composer and a
   card in edit mode: Save/Add card show a muted `⏎` beside the label, the buttons are
   slightly shorter, Add and Cancel remain the same height, and the width is unchanged.

**Acceptance criteria**

- [ ] The edit-mode **Save** button and the composer **"Add card"** submit button each
  display a muted monospace **⏎** indicator beside their label.
- [ ] The **Cancel** buttons and the per-column **"+ Add card" toggle** do **not** show the
  ⏎ chip.
- [ ] The composer/edit **submit, save, and cancel** buttons are visibly **shorter**
  (less top/bottom padding) while their **width is unchanged**; Add/Save and their Cancel
  partner remain the same height as each other.
- [ ] No behavior change: Enter still commits, Shift+Enter inserts a detail line, Escape
  cancels.
- [ ] `npm run build`, `npm run lint`, and `npm test` all pass; no unused-class lint
  issues.
- [ ] **Works on both macOS and Windows.** Pure frontend React/CSS; the `⏎` glyph is
  platform-neutral (no `kbdHint`/Cmd-vs-Ctrl branch needed), and there are no paths,
  shell-outs, or platform key handling — so it renders identically on both.

**Notes**

- Decisions made while refining (minor/presentational, established patterns — no user
  round-trip needed):
  - Reuse the app's existing `<kbd className={styles.btnKbd}>⏎</kbd>` chip pattern
    (NewSessionModal / Sidebar `.kbd`) rather than inventing a new style.
  - "A bit thinner" → vertical padding `--space-6` (6px) → `--space-4` (4px); the
    available token scale is 1/2/4/6/8/12/… (`tokens.css` ~L86–95), so `--space-4` is the
    natural next step down. Adjustable if it reads too tight in-app.
  - The Enter chip goes on the **submit** buttons (`composerAdd`: edit-Save and
    composer-Add card), not the `addCard` toggle (which merely opens the composer).
  - Cancel buttons get the thinner padding (to stay height-matched, per #240) but no kbd
    chip (card asked only for an Enter indicator).
- This card touches the same `cardEditActions` row as TASK-244 (which removes the
  edit-mode Delete button). Neither blocks the other; if both are open, expect a small
  merge in that region.
- Card was clear after grounding in the code; no user clarification was required.
