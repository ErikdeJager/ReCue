# TASK-248

### 248. [x] Don't strike through a completed Kanban card's text (keep a subtle dim + the checkmark)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

When a Kanban card is **checked** (completed), its title is currently rendered with a
**strikethrough** (crossed out) and dimmed to muted gray. The user finds the strikethrough
unnecessary — the checkmark already signals "done" — and wants it **removed**, while
**keeping a subtle dim** so a completed card is still gently de-emphasized.

The styling lives in one rule: `src/components/Kanban/KanbanPanel.module.css` ~L440–443:

```css
.cardDone .cardTitle {
  text-decoration: line-through;   /* ← remove this */
  color: var(--text-muted);        /* ← keep this (the subtle dim) */
}
```

`.cardDone` is applied to a card when `card.checked` is true
(`KanbanPanel.tsx` L161 on the card `<article>`, and L306 on the plain-bullet card
variant). The **only** strikethrough in the Kanban styles is this `.cardTitle` rule (the
card **body** is not struck), so removing `text-decoration: line-through` here fully
addresses the complaint.

**The change:** delete the `text-decoration: line-through;` declaration from
`.cardDone .cardTitle`, keeping `color: var(--text-muted);`. A completed card then shows
the checkmark + a gently dimmed (not crossed-out) title.

**Out of scope:**
- Removing the dim — the user confirmed the muted-gray dim should **stay**; only the
  strikethrough goes (chosen via the refine question, see Notes).
- The card body, checkbox, or any other card styling.
- Behavior of checking/unchecking a card (unchanged).

**Subtasks**

1. [ ] In `src/components/Kanban/KanbanPanel.module.css`, in the `.cardDone .cardTitle`
   rule (~L440), **remove the `text-decoration: line-through;` line**, leaving `color:
   var(--text-muted);`. (Keep the rule itself for the dim.)
2. [ ] Sanity check there is no other `text-decoration: line-through` tied to a done/checked
   card elsewhere in the Kanban styles (there isn't, per grep — this is the only one).
3. [ ] Run `npm run build`, `npm run lint`, `npm test`, and eyeball a checked card: the
   title is dimmed gray but **not** struck through; the checkmark shows; an unchecked card
   is unchanged.

**Acceptance criteria**

- [ ] A checked (completed) Kanban card's title is **not** struck through.
- [ ] A checked card's title is still subtly **dimmed** (muted-gray), and the checkmark is
  shown.
- [ ] An unchecked card looks exactly as before.
- [ ] `npm run build`, `npm run lint`, and `npm test` all pass.
- [ ] **Works on both macOS and Windows.** This is a one-line CSS change (no paths,
  shell-outs, native open/reveal, or platform key handling), so it renders identically on
  both platforms.

**Notes**

- Refine question answered by the user (2026-06-28): "Keep a subtle dim, no strikethrough"
  — so the muted-gray `color` stays and only `text-decoration: line-through` is removed
  (rather than stripping all done-styling).
- Only the card **title** carries the strikethrough today; the body never did, so no body
  change is needed.
