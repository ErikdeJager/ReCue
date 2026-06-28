# TASK-246

### 246. [ ] Make a Kanban card's description body part of the drag surface (no text-selection)

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-28

**Description**

A Kanban card whose markdown has more than one line renders the extra lines as a
grayed-out **description body** below the title (`cardBody`, `KanbanPanel.tsx` ~L282–292,
styled muted in `KanbanPanel.module.css` ~L550–560). The whole card `<article>` is the
drag grip (`useSortable` with a 4px `PointerSensor` activation distance — `KanbanPanel.tsx`
~L118–124 and the sensor at ~L640–641), so dragging the title or empty card area moves the
card.

**The bug:** the body is currently **excluded** from the drag surface. The card defines
`const noDrag = { onPointerDown: (e) => e.stopPropagation() }` (~L154–156) and spreads it
onto interactive regions; the **body wrapper** has `{...noDrag}` (~L283). That
`stopPropagation` on `pointerdown` prevents the body from ever reaching the drag listeners,
so pressing-and-dragging on the description doesn't move the card — instead the browser
does a native **text selection**. The user wants to **drag the card by its description**,
and to **not** have the mouse select the body text.

**Fix:** make the body a drag surface like the title — remove the body wrapper's `noDrag`
so a press-drag on it moves the card, and disable text selection on the card's view-mode
text so dragging never starts a selection. The body's **interactive children** (GFM
task-list checkboxes — `makeCheckboxComponents`, `markdownCheckboxes.tsx`, whose input
`onClick` does `stopPropagation` at ~L167 — and external links — the `a(...)` renderer's
`onClick={onLinkClick}`) must stay clickable; the 4px activation distance already lets a
plain click through without starting a drag (a drag only begins after 4px of movement), so
removing the wrapper `noDrag` does **not** break them.

**Accepted tradeoff (the user's explicit intent):** the body text becomes
**non-selectable** with the mouse — the user prefers dragging over selecting ("my mouse
selects the text instead of dragging the card around"). If a user needs to copy a long
description, it's still selectable in **edit mode** (the editor textarea, which keeps
normal text selection). No need to preserve mouse-selection of the rendered body.

**Out of scope:**
- The **edit-mode** textarea (`cardEditInput`) — it must keep normal text editing/selection
  (it's not rendered in view mode, so `.cardBody` changes don't touch it; just don't add
  `user-select: none` to the editor).
- Body **links** and **task-list checkboxes** must remain clickable — preserve, don't
  remove, their behavior.
- Any change to the title's appearance or the card layout.

**Subtasks**

1. [ ] In `src/components/Kanban/KanbanPanel.tsx`, **remove `{...noDrag}` from the
   `cardBody` wrapper `<div>`** (~L283) so a `pointerdown` on the body propagates to the
   card's drag listeners and a press-drag moves the card.
2. [ ] In `src/components/Kanban/KanbanPanel.module.css`, add to **`.cardBody`** (~L550)
   **both** selection-disabling properties for cross-platform coverage:
   `-webkit-user-select: none;` (macOS WKWebView) **and** `user-select: none;` (Windows
   WebView2 / Chromium). Apply the same pair to **`.cardTitle`** (~L422) too, since the
   title is also a drag surface — so the whole view-mode card is a clean grip. (Do **not**
   add it to `.cardEditInput` / the editor.)
3. [ ] Confirm the body's interactive children still work after removing the wrapper
   `noDrag`: a plain **click** on a body task-list checkbox still toggles it (commits via
   `onBodyToggle`), and a click on an external link still opens it (via `onLinkClick` →
   `openUrl`). The 4px `PointerSensor` activation distance is what protects these — verify
   in-app. **Fallback only if needed:** if any body checkbox/link click is swallowed by a
   drag, re-add a targeted `noDrag` (`onPointerDown` stopPropagation) to **those specific
   interactive elements only** (e.g. inside `makeCheckboxComponents` / the link renderer),
   never to the whole body wrapper — keep the body text itself a drag surface.
4. [ ] Run `npm run build`, `npm run lint`, `npm test`, and manually verify on a multi-line
   card: press-drag on the grayed description **moves the card** (and a sortable
   insertion indicator appears) with **no text getting selected**; clicking a body link
   opens it; toggling a body checkbox flips it.

**Acceptance criteria**

- [ ] Press-dragging a multi-line card **by its grayed description body** moves/reorders
  the card (same as dragging by the title).
- [ ] Dragging over the body **no longer selects** the description text.
- [ ] Body **links** still open and body **task-list checkboxes** still toggle on click.
- [ ] Edit mode is unaffected — the editor textarea still allows normal text
  editing/selection.
- [ ] `npm run build`, `npm run lint`, and `npm test` all pass.
- [ ] **Works on both macOS and Windows.** `.cardBody`/`.cardTitle` disable selection with
  **both** `-webkit-user-select: none` (WKWebView/macOS) and `user-select: none`
  (WebView2/Chromium/Windows) — not a macOS-only `-webkit-` property — and the drag uses
  the existing platform-neutral dnd-kit PointerSensor. No paths, shell-outs, or
  platform-specific key handling are involved.

**Notes**

- Root cause precisely: the `cardBody` wrapper's `{...noDrag}` (`onPointerDown`
  stopPropagation, KanbanPanel.tsx ~L154/L283) blocks the card drag and lets native text
  selection take over. Removing it (plus `user-select: none`) is the targeted fix.
- Why links/checkboxes survive: the sortable's 4px activation distance
  (`useSensor(PointerSensor, { activationConstraint: { distance: 4 } })`, ~L641) means a
  click without ≥4px movement never starts a drag, so child `onClick` handlers still fire.
  Their existing `onClick`-level `stopPropagation` (markdownCheckboxes.tsx ~L167) was an
  extra guard, not the thing that made them clickable.
- Cross-platform CSS reminder honored: macOS WKWebView needs `-webkit-user-select`, so the
  rule ships both the `-webkit-` and the standard property (per CLAUDE.md's WebView
  divergence guidance), not one or the other.
- Card was clear after grounding in the code; no user clarification was required. The
  selection-vs-drag tradeoff is exactly what the card requests, so it was decided rather
  than asked.
