### 234. [x] Kanban card hover-lift animation (drag affordance)

**Status:** Done
**Depends on:** #233
**Created:** 2026-06-28

**Description**

Make an in-app Kanban card **jump up slightly when hovered**, as a **smooth animation with
a little flair**, so the user understands the card is **draggable** (can be picked up and
moved). **Don't overdo it** — keep it subtle.

**Grounding:**

- Cards render as `<article className={styles.card}>` in
  `src/components/Kanban/KanbanPanel.tsx` (~lines 146-266); the card style is `.card` in
  `src/components/Kanban/KanbanPanel.module.css`. Cards are **dnd-kit draggable** (#143):
  during a drag, dnd-kit applies an **inline `transform`** (CSS.Translate) and a
  `.cardDragging`-style class.
- The app has design tokens for motion (`--dur-fast`, `--ease-out`) and a global
  **reduced-motion killswitch** (`body.reduce-motion` in `src/styles/global.css`, plus the
  Settings reduce-motion toggle) that disables transitions/animations.

**Decided approach (autonomous — see Notes/ASSUMPTIONS.md):**

- On **`.card:hover`**, apply a small lift: **`transform: translateY(-2px)`** (≈2–3px),
  a **subtle elevation `box-shadow`**, and **`cursor: grab`** to signal "pick me up." Add
  **`transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast)
  var(--ease-out)`** on `.card` so it's smooth both in and out. Keep it understated — no
  large scale, rotation, or big shadow ("don't overdo it").
- **Don't fight the drag:** the hover transform must not interfere with dnd-kit's inline
  drag transform. Inline styles win over stylesheet rules, so the drag transform already
  overrides the `:hover` transform during a drag; additionally **do not apply the lift
  while the card is dragging** (e.g. `.card:not(.cardDragging):hover`, matching the
  dragging class name in use). `cursor: grabbing` during the active drag.
- **Respect reduced motion:** under `body.reduce-motion`, drop the transition (and the
  lift) so the card doesn't animate — calm, no movement (extend the global killswitch or
  add a scoped `body.reduce-motion .card { transition: none; transform: none; }`).
- Pure CSS (no JS); this is **CSS-only on `.card`** plus possibly a `:hover` rule.

**Out of scope:**

- The broader Kanban **redesign** (#233) — this only adds the hover-lift to whatever card
  style #233 produces.
- Drag-and-drop mechanics (#143) — unchanged; this is purely a hover affordance.
- Lift on non-card elements (columns, composer).

**Cross-platform (hard requirement):** pure CSS; `translateY`/`box-shadow`/`transition`
render identically in WKWebView (macOS) and WebView2 (Windows); ship a plain-color shadow
(no macOS-only effects); no OS-specific code.

**Subtasks**

1. [ ] In `KanbanPanel.module.css`, add a `transition` on `.card` and a
   `.card:not(.cardDragging):hover` rule with `transform: translateY(-2px)`, a subtle
   `box-shadow`, and `cursor: grab` (`grabbing` while dragging).
2. [ ] Ensure reduced-motion disables the animation (global killswitch or a scoped rule).
3. [ ] Verify the lift is smooth, doesn't jitter, and doesn't interfere with picking up /
   dragging a card or with the hover-revealed actions (#195).
4. [ ] `npm run build`, `npm run lint`, `npm run format:check` pass.

**Acceptance criteria**

- [ ] Hovering a Kanban card smoothly lifts it slightly (≈2–3px) with a subtle shadow and
      a grab cursor, clearly signaling it's draggable — understated, not flashy.
- [ ] The animation eases in and out and does **not** interfere with dnd-kit dragging or
      the hover-revealed card actions.
- [ ] Under reduced motion, the card does not animate.
- [ ] Renders correctly on macOS and Windows; `npm run build`, `npm run lint`,
      `npm run format:check` pass.

**Notes**

- **Direct user request (2026-06-28):** "I want a Kanban card to jump up slightly when
  it's hovered. Make it a smooth animation with a little bit of flair so the user
  understands they can pick it up and drag it. But don't overdo it." → small `translateY`
  lift + subtle shadow + grab cursor, eased, reduced-motion-aware.
- **Autonomous decisions (logged in `ASSUMPTIONS.md`):** ~2–3px lift (subtle); scope the
  hover so it doesn't apply during an active drag; disable under reduced motion; CSS-only.
- **Depends on: #233** — both edit the `.card` style; #233 establishes the redesigned
  card's resting look, and the lift is layered on top of it (sequenced after to avoid
  conflicts / re-work).
- References: `KanbanPanel.tsx:146-266` (`.card`), `KanbanPanel.module.css` (`.card` /
  `.cardDragging`), `src/styles/tokens.css` (`--dur-fast`/`--ease-out`),
  `src/styles/global.css` (reduced-motion killswitch).
