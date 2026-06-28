# TASK-235

### 235. [x] SkillAutocomplete: open the slash-command dropdown *above* the textarea

**Status:** Done · _(Not started | In progress | Done)_
**Depends on:** none · _(independent — touches only the shipped #114 SkillAutocomplete component)_
**Created:** 2026-06-28

**Description**

The `/`-triggered slash-command autocomplete (#114) — the `SkillAutocomplete`
component shared by the **NewSessionModal schedule step** and the **ScheduledPanel**
prompt editors — currently renders its dropdown menu **below** the prompt textarea.
Because the prompt field in both call sites has UI directly beneath it (in the
schedule step: the "Name (optional)" field and the actions row; in the ScheduledPanel:
the actions row), the menu visually **overlaps** those elements and reads as poorly
positioned. The user wants the dropdown to instead appear **above** the textarea ("on
top of the text area, much like a dropdown"), where there is empty space.

This is a **reposition-only** change. The dropdown's existing styling (border, soft
popover shadow, option layout, hover/active states, max-height + internal scroll) is
kept exactly as-is — only its anchor side flips from the textarea's bottom edge to its
top edge, growing **upward**. The menu should **always** render above (a pure-CSS
anchor flip — no JS viewport measurement / auto-flip-to-below fallback).

**Relevant code (grounding):**

- `src/components/SkillAutocomplete/SkillAutocomplete.module.css` — the `.menu` rule
  (currently `position: absolute; z-index: 30; top: calc(100% + var(--space-2));
  right: 0; left: 0; …`). The `top` declaration anchors the menu below the textarea.
  The fix is to anchor it to the top edge instead, i.e. replace `top: calc(100% +
  var(--space-2));` with `bottom: calc(100% + var(--space-2));` (everything else in the
  rule — `right`, `left`, `max-height: 220px`, overflow, padding, border, shadow —
  stays unchanged). With `bottom` anchoring, the menu's `max-height` already caps its
  upward growth, and internal `overflow-y: auto` keeps long lists scrollable.
- `src/components/SkillAutocomplete/SkillAutocomplete.tsx` — the menu is rendered as a
  sibling **after** the `<textarea>` inside the relatively-positioned `.wrap` (and the
  `.wrapFill` flex variant). No TSX change is required: the menu is absolutely
  positioned, so DOM order does not affect where it paints. Confirm both the default
  (`.wrap`, fixed `rows` — the modal) and the `fill` (`.wrapFill`, flex-column — the
  ScheduledPanel) wrappers position the menu correctly above the textarea after the CSS
  flip. `.wrapFill` is `display: flex; flex-direction: column` but `.menu` is
  `position: absolute`, so it is taken out of flow and anchors to the nearest
  positioned ancestor (`.wrap`/`.wrapFill`, both effectively `position: relative` —
  note `.wrapFill` will need `position: relative` if it is not already establishing a
  containing block; verify and add it if the menu mis-anchors in the ScheduledPanel).

**Out of scope**

- Any change to *which* skills are detected/offered, the trigger logic
  (`slashCommands.ts` `detectTrigger` / `filterSkills` / `applyInsertion`), keyboard
  handling, or the container-key guard.
- Broader visual restyling of the dropdown (spacing, item layout, colors, hover
  states) — the user asked for reposition **only**.
- Smart / auto-flip positioning (measuring viewport space and falling back to below) —
  explicitly declined; the menu always renders above.
- Any change to the two call sites' surrounding layout (`NewSessionModal`,
  `ScheduledPanel`) beyond what's needed for the menu to anchor above.

**Subtasks**

1. [ ] In `src/components/SkillAutocomplete/SkillAutocomplete.module.css`, change the
   `.menu` rule's vertical anchor from `top: calc(100% + var(--space-2));` to
   `bottom: calc(100% + var(--space-2));` so the menu grows upward from the textarea's
   top edge. Leave `position`, `z-index`, `right`, `left`, `max-height`, `overflow-y`,
   padding, border, background, and `box-shadow` unchanged.
2. [ ] Verify the `.wrapFill` (ScheduledPanel `fill` mode) variant still establishes a
   positioning context for the absolutely-positioned menu; if the menu mis-anchors
   there, add `position: relative;` to `.wrapFill` (the base `.wrap` already has
   `position: relative`).
3. [ ] Manually sanity-check both call sites (or reason through the layout) that the
   dropdown now opens **above** the prompt and no longer overlaps the field/actions
   below it:
   - `NewSessionModal` schedule step (prompt with `rows={3}`, "Name" field + actions
     below it).
   - `ScheduledPanel` (`fill` prompt editor, actions row below it).
4. [ ] Run `npm run build`, `npm run lint`, and `npm run format:check` to confirm the
   change is clean. (No unit test targets this pure-CSS change; the existing
   `slashCommands` tests must still pass — `npm test`.)

**Acceptance criteria**

- [ ] When the `/`-command dropdown opens in the NewSessionModal schedule step, it
      appears **above** the prompt textarea (anchored to its top edge), not below, and
      does not overlap the "Name (optional)" field or the actions row.
- [ ] When the dropdown opens in the ScheduledPanel, it appears **above** the prompt
      editor and does not overlap the actions row.
- [ ] The dropdown's appearance (border, shadow, option rows, hover/active highlight,
      220px max-height with internal scroll for long lists) is unchanged from before —
      only its position moved.
- [ ] Keyboard navigation (↑/↓/Enter/Tab/Escape), filtering, insertion, caret
      restoration, and the container-key guard all behave exactly as before.
- [ ] `npm run build`, `npm run lint`, `npm run format:check`, and `npm test` all pass.

**Notes**

- User decisions (refine Q&A, 2026-06-28):
  - **Scope:** _Reposition only_ — flip the dropdown above the textarea; keep the
    existing popover styling. No broader visual polish.
  - **Positioning:** _Always above_ — a pure-CSS anchor flip (`top` → `bottom`); no JS
    measurement / auto-flip-to-below fallback.
- The component is shared by both schedule prompt editors, so the single CSS change
  fixes both surfaces at once. The card is titled "Skill detection for schedule"; both
  affected call sites are schedule-related, which matches the intent.
- Cross-platform: this is a styling-only change with no OS-specific code path; it
  applies identically on macOS and Windows (no `platform`/`#[cfg]` gating needed).
- Reduced-motion: the dropdown has no animation (per the CSS file header), so flipping
  the anchor side has no motion implications.
