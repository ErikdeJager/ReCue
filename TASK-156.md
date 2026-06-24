### 156. [ ] Kanban board horizontal scroll in Overview mode

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-24

**Description**

A Kanban board panel (#145) with more columns than fit the visible width **cannot
be scrolled horizontally when shown as an Overview column** — the extra columns are
simply clipped/cut off. In **Canvas** mode the same board scrolls left/right fine.
The card: "The Kanban is not scrollable on the X axis in overview mode. In canvas
mode this works fine."

**Goal / why:** make the Overview kanban panel scroll horizontally like the Canvas
one, so all columns are reachable regardless of the Overview column width.

**Root cause (grounded in the CSS):** the board strip itself is already correct —
`src/components/Kanban/KanbanPanel.module.css` has `.board { flex: 1; min-height: 0;
display: flex; overflow-x: auto; overflow-y: hidden; }` with fixed-width columns
`.column { flex: 0 0 auto; width: 248px; }`. `overflow-x: auto` scrolls **only when
`.board`'s width is bounded** by its container. The difference is the wrapper each
view puts around the panel:

- **Canvas (works):** `CanvasSurface.tsx` renders the panel into `.panelBody`
  (`src/components/Canvas/Canvas.module.css:360`), which is
  `{ display: flex; flex: 1; min-height: 0; min-width: 0; overflow: hidden; }` **plus**
  a child-fill rule `.panelBody > * { flex: 1; min-width: 0; min-height: 0; }`. The
  `min-width: 0` lets the flex item shrink below its content width, so the kanban
  `.board` is width-bounded and its `overflow-x: auto` engages → it scrolls.
- **Overview (broken):** `Overview.tsx`'s `PanelColumn` renders content into `.body`
  (`src/components/Overview/Overview.module.css:255`), which is only
  `{ display: flex; flex: 1; min-height: 0; }` — **missing `min-width: 0`** and with
  **no `.body > *` child-fill rule**. So the kanban `.panel`/`.board` keeps its
  intrinsic content width (the classic flexbox `min-width: auto` gotcha) and is then
  **clipped** by the Overview column `.card { flex: 1 0 360px; … overflow: hidden; }`
  — no scrollbar appears.

So this is a one-file CSS fix in `Overview.module.css`: give the shared PanelColumn
body the same width-constraint the Canvas panel body already has.

**Scope:** fix the Overview PanelColumn body (`.body`) so its content child is
width-bounded and the kanban board scrolls horizontally within the column, mirroring
the proven Canvas `.panelBody` pattern.

**Explicitly out of scope:**

- Changing `KanbanPanel` / `KanbanPanel.module.css` — the board's `overflow-x: auto`
  + fixed-width columns are already correct; the bug is the Overview wrapper.
- The Canvas path — already works; must stay unchanged.
- Vertical card scrolling — already works (`.cards { overflow-y: auto }`).
- The separate **"markdown render cutoff"** Refine card (FileViewer content clipped
  in Overview at small widths). It is very likely the **same root cause** and this
  fix may resolve it too, but it is tracked as its **own card** and must be
  refined/verified independently (see Notes) — do not expand this task to chase it.

**Subtasks**

1. [ ] In `src/components/Overview/Overview.module.css`, add `min-width: 0;` to the
   `.body` rule (the PanelColumn content area, ≈ line 255).
2. [ ] Add a child-fill rule mirroring Canvas's `.panelBody > *`:
   `.body > * { flex: 1; min-width: 0; min-height: 0; }` so the single content child
   fills the column and can shrink below its intrinsic width, engaging the kanban
   `.board`'s `overflow-x: auto`.
3. [ ] Confirm the `KanbanPanel` root (`.panel`) then fills correctly via that rule
   (no explicit width needed on `.panel`); leave `KanbanPanel.module.css` untouched.
4. [ ] **Manual verification (Overview):** open a board with enough columns to exceed
   the visible Overview column width (e.g. a `.md` with 5–6 `##` columns) → the board
   now shows a horizontal scrollbar and scrolls; columns are no longer clipped.
5. [ ] **Regression check:** Canvas-mode kanban still scrolls (unchanged); the other
   Overview panel types — agent terminal, shell terminal (#72), diff inspector, file
   viewer, scheduled — still render correctly (they receive the same
   `flex:1; min-width:0; min-height:0` that Canvas already applies to them).
6. [ ] Run `npm run build`, `npm run lint`, and `npm run format:check`; fix any CSS
   formatting. (CSS-only change — no unit test; rely on the manual checks above.)

**Acceptance criteria**

- [ ] In Overview mode, a Kanban panel whose columns exceed the visible width scrolls
      horizontally (scrollbar on `.board`) and no columns are clipped.
- [ ] Vertical scrolling of cards within a column still works in Overview.
- [ ] Canvas-mode Kanban horizontal scrolling is unchanged.
- [ ] Other Overview panel types (terminal / diff / file / scheduled) render
      unchanged.
- [ ] `npm run build`, `npm run lint`, `npm run format:check` pass.

**Notes**

- **Assumption — fix location:** the change belongs in the shared Overview
  `PanelColumn` `.body` (mirroring Canvas `.panelBody` + `.panelBody > *`), not in
  `KanbanPanel`. The kanban component is already context-agnostic and correct; the
  divergent wrapper is what differs between the two views, so fixing `.body` matches
  Canvas and avoids special-casing kanban.
- **Likely shared fix:** the **"markdown render cutoff"** Refine card (FileViewer
  text/toolbar cut off in Overview at small widths) almost certainly stems from the
  **same missing `min-width: 0`** on `.body`. This fix may resolve it as a
  side-effect; verify that card separately when it's refined and cross-reference —
  but keep this task scoped to the kanban scroll so the acceptance criteria stay
  testable.
- **Task numbering:** highest existing is #155 (TASK-154.md, TASK-155.md;
  `TASK_ARCHIVE.md` ≤ #153). Hence #156.
- **Dependencies:** none — a self-contained CSS fix independent of the open #155
  (canvas drag) and the implemented #154 (kanban template block).
- **References:** `KanbanPanel.module.css` (`.board`, `.column`),
  `Overview.module.css` (`.card`, `.body`), `Canvas.module.css:360-373`
  (`.panelBody`, `.panelBody > *`), `Overview.tsx` (`PanelColumn` → `.body` wraps
  children, kanban render ≈ line 330), `CanvasSurface.tsx:311` (`.panelBody` wraps
  `renderContent()`).
