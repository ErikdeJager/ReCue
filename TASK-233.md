### 233. [x] Redesign the in-app Kanban board UI (cards, columns, inline composer, per-column accents)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

Reinvent the in-app **KanbanPanel** UI (#141–#151) to be cleaner and use space more
efficiently, keeping it fully functional with the markdown Kanban format. Per the brief:

- **Card design:** a **checkbox pinned to the top-left corner** of every card, with the
  card text **flowing to its right using the full card width**; **tight padding / minimal
  margins**. Because each card is just a markdown line, there's **no separate
  title vs description** — the body renders uniformly — **but per-card detail/meta lines
  must still be supported**, rendered as **dimmed, monospace-style secondary lines beneath
  the main text** (e.g. "blocked on: …"), the same way READY cards carry `Plan:` /
  `Depends on:` lines.
- **Inline add-card composer:** placeholder **"Write a card… Shift+Enter for detail
  lines"**, a primary **"Add card"** button and a **"Cancel"** button; **Shift+Enter adds
  detail lines**. A **dashed/ghost "+ Add card"** affordance at the bottom of each column
  opens it.
- **Per-column header:** a small **status-colored dot**, the **column name in UPPERCASE
  letter-spaced caps**, a **count pill**, and a **"+" add button on the right**; **each
  column has its own accent color**.

**Grounding (key facts):**

- **The engine already supports per-card detail lines** — no engine change needed.
  `Card = { title, body, checked }` (`src/components/Kanban/kanban.ts:19-27`); `parseBoard`
  preserves tab-indented continuation lines verbatim into `body`
  (`kanban.ts:~114-122`), and `serializeBoard` re-emits them tab-indented
  (`:161-182`). Round-trip is lossless (frontmatter / `**Complete**` / `%% kanban:settings
  %%` preserved). So "detail/meta lines" already round-trip; the work is **rendering** them
  as dimmed monospace.
- **`KanbanPanel.tsx`** current structure:
  - **Column header** (`:344-387`): a click-to-rename name + a count pill + a
    hover-revealed delete `×`. **No color/accent concept exists.**
  - **Card** (`:146-266`): a top row of grip (`GripVertical`, #144) + optional `Checkbox`
    (when `checked !== null`, #194) + title (flex:1, `.cardTitle`); hover/focus-revealed
    actions cluster (Edit/Delete, #195); and a body rendered via **ReactMarkdown** (GFM +
    interactive task checkboxes #194) only when `card.body.trim()` (`.cardBody`,
    `KanbanPanel.module.css:464-473` — indented, `--fs-meta-sm`, `--text-secondary`).
  - **Add card** (`:413-419`): a dashed `.addCard` button → `addCardAndEdit` immediately
    creates `{ title:"", body:"", checked:false }` and enters edit mode (no composer).
  - **Board/Raw toggle** (`:656-700`) — lossless shared buffer (#147/#149); unchanged.
- **No wireframe file exists** — only the inline brief (the card says "per the wireframe"
  but none is committed). Implement to the brief; if the user supplies a wireframe later,
  match it (as was done for the diff-viewer #231).
- **Color precedent to reuse:** repo colors derive a stable Catppuccin swatch from a
  string/index (`repoColor`/`REPO_PALETTE`, used in the sidebar/status dots). The markdown
  format has **nowhere to store a column color**, so derive it deterministically.

**Decided approach (autonomous — see Notes/ASSUMPTIONS.md):**

1. **Card layout:** restructure `.card` so the **checkbox sits at the top-left** and the
   **card text uses the full width** to its right (and wraps full-width below) with **tight
   padding**. Keep the card a **drag source** (#144) — make the card itself the drag grip
   with the existing pointer activation-distance guard so click-to-edit still works (like
   the sidebar rows / Canvas headers), instead of a separate visible grip column. Keep the
   #194 optional checkbox (omit it when `checked === null`).
2. **Detail/meta lines:** render the card `body` as **dimmed, monospace secondary lines**
   — restyle `.cardBody` to `--mono`, a muted color (`--text-muted`/`--text-faint`), and a
   small size (`--fs-meta-xs/sm`), beneath the main text. **Keep ReactMarkdown rendering**
   so existing body features (links, interactive task checkboxes #194) still work — only
   the *style* changes to "secondary meta." (Matches "blocked on: …" / READY-card
   `Plan:`/`Depends on:` styling.)
3. **Inline add-card composer:** replace the immediate-edit `.addCard` flow with an
   **inline composer** opened by the **dashed/ghost "+ Add card"** at the column bottom
   (and the column-header **"+"**): a multi-line `<textarea>` (placeholder **"Write a
   card… Shift+Enter for detail lines"**), a primary **"Add card"** button, and a
   **"Cancel"** button. **Enter submits**, **Shift+Enter inserts a newline** (a detail
   line); the **first line → `title`, remaining lines → `body`**; submit calls the existing
   `addCard(board, col, { title, body, checked:false })`; Cancel/Escape closes. (IME-safe,
   like the existing inputs.)
4. **Column header:** redesign to show, left→right: a **status-colored dot** (the column's
   accent), the **column name in UPPERCASE, letter-spaced caps** (still click-to-rename), a
   **count pill**, and a **"+" add button** on the right (opens the composer). Keep the
   delete affordance (hover-revealed, #195).
5. **Per-column accent color:** derive a **deterministic accent per column** from a
   Catppuccin palette by **column index** (cycling) — reusing the `REPO_PALETTE`/`repoColor`
   approach (no persistence; the markdown format is unchanged). Use it for the header dot
   and a subtle column accent (e.g. a top border / header tint). Document that colors are
   derived (not stored in the `.md`).
6. **Engine/format unchanged** — `parseBoard`/`serializeBoard` already handle everything
   (detail lines, checkboxes, settings block); this is **UI/CSS + the composer** only.

**Out of scope:**

- The Kanban **engine / markdown format** (`kanban.ts`) — unchanged (detail lines already
  round-trip). The Board/**Raw** toggle (#147/#149) — unchanged.
- **Persisting** column colors or order in the `.md` (derive colors; column order is
  already the markdown heading order).
- Drag-and-drop **mechanics** (#143 dnd-kit) — preserved, only the grip affordance changes.
- New card *fields* beyond what markdown body lines already express.

**Cross-platform (hard requirement):** pure frontend; the monospace detail lines use the
bundled `--mono` (JetBrains Mono, offline); column accents derive from the existing palette;
no OS-specific code; renders identically on macOS and Windows (WKWebView + WebView2 — ship
plain-color fallbacks alongside any `color-mix`).

**Subtasks**

1. [ ] Restyle/restructure the **card** (`KanbanPanel.tsx` + `.module.css`): checkbox
   top-left, full-width text, tight padding; card-as-drag-grip with activation guard;
   keep the #194 optional checkbox + #195 hover actions.
2. [ ] Restyle **`.cardBody`** to dimmed monospace secondary lines (keep ReactMarkdown).
3. [ ] Build the **inline add-card composer** (textarea + "Add card"/"Cancel", Enter
   submit / Shift+Enter detail line, first line→title rest→body) opened by the column
   "+" and the bottom dashed "+ Add card"; wire to `addCard`.
4. [ ] Redesign the **column header**: accent dot + UPPERCASE letter-spaced name +
   count pill + "+" button (+ keep delete).
5. [ ] Add a **per-column accent** derived from the palette by column index (reuse
   `repoColor`/`REPO_PALETTE`); apply to the dot + a subtle column accent.
6. [ ] Verify round-trip is unchanged (cards with detail lines parse/serialize
   identically), DnD still works, Board/Raw toggle intact.
7. [ ] `npm run build`, `npm run lint`, `npm test`, `npm run format:check` pass.

**Acceptance criteria**

- [ ] Cards show a checkbox pinned top-left with the text using the full card width and
      tight padding; **detail/meta lines render as dimmed monospace secondary lines**
      beneath the main text (e.g. "blocked on: …"), round-tripping through the markdown
      unchanged.
- [ ] The add-card flow is an **inline composer** ("Write a card… Shift+Enter for detail
      lines" + "Add card"/"Cancel"; Enter submits, Shift+Enter adds a detail line), opened
      from the column "+" and the bottom dashed "+ Add card".
- [ ] Each **column header** shows an accent dot + UPPERCASE letter-spaced name + count
      pill + "+" button, and **each column has its own accent color**.
- [ ] All existing Kanban functionality works: checkbox toggle (#194), body markdown +
      interactive task checkboxes, edit/delete, drag between/within columns (#143),
      Board/Raw toggle (#147/#149), lossless markdown round-trip.
- [ ] Renders cleanly on macOS and Windows; `npm run build`, `npm run lint`, `npm test`,
      `npm run format:check` pass.

**Notes**

- **Autonomous decisions (user not answering; logged in `ASSUMPTIONS.md`):**
  - *No engine change* — detail lines already round-trip via `Card.body`; the work is
    rendering them dimmed/monospace.
  - *Per-column accent derived from the palette by column index* (no markdown change; the
    format has nowhere to store color), reusing the `repoColor`/`REPO_PALETTE` approach.
  - *Composer:* Enter submits, Shift+Enter = detail line; first line→title, rest→body;
    opened by the column "+" and the bottom dashed affordance.
  - *Card stays a drag source* via the whole-card grip + activation-distance guard (no
    separate grip column), to honor "checkbox top-left + full-width text."
  - *No wireframe file exists* — built from the inline brief; **if the user sends a Kanban
    wireframe, match it** (as for #231).
  - *Large but cohesive*; if a single pass is too big, an acceptable split is
    **card+detail-line restyle** first, then **column header + composer + colors** as a
    dependent sub-task — authored as one task here.
- **Depends on: none** — builds on the shipped KanbanPanel (#141–#151), #194 (optional
  checkbox), #195 (hover actions), and the `repoColor` palette.
- References: `kanban.ts:19-27`/`:114-122`/`:161-182` (model + parse/serialize, unchanged),
  `KanbanPanel.tsx:146-266` (card), `:344-387` (column header), `:413-419` (add card),
  `:656-700` (Board/Raw), `KanbanPanel.module.css:326-473` (card/checkbox/title/body CSS),
  `repoColor`/`REPO_PALETTE` (`src/store.ts`).
