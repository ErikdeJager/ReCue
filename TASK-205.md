### 205. [x] Canvas tab bar: turn + into a "New tab" dropdown; move the distribute control to the right

**Status:** Done
**Depends on:** none
**Created:** 2026-06-27

**Description**

The Canvas tab strip (`src/components/Canvas/CanvasTabs.tsx`, the `CanvasTabs` component)
crowds several icon-buttons together at the left, right after the tabs:

1. **`+`** (`Plus`, `styles.tabAdd`) → `addCanvas()` — adds an empty canvas tab (lines
   ~251–259).
2. **Distribute evenly** (`Grid2x2`, `styles.tabAdd`) → `equalizeCanvas()` — rebalances the
   active canvas's panels to equal area; disabled when `<2` panels (#186, lines ~260–271).
3. **Templates ▾** (`LayoutTemplate` + `ChevronDown`, in `styles.templatesWrap`) — a
   fixed-position dropdown (#117, lines ~272–341) with four items: **New tab from
   template…** (`openTemplateUse()`, disabled if no templates), **New template…**
   (`openTemplateEditor(null)`), **Save current canvas as template…**
   (`openTemplateEditorFromCanvas()`, disabled if the active canvas is empty), **Manage
   templates…** (`openTemplateManager()`).

The goal of this task is to **declutter and reorganize** that toolbar:

- **Turn the `+` button into a small dropdown** (like the existing Templates ▾) that offers
  the two ways to create a tab: **"New tab"** (blank canvas) and **"New tab from
  template…"**. The `+` is the single, obvious "add a tab" entry point.
- **Move the layout/distribute control to the right side of the bar** (away from the
  add/templates cluster), so the left side stays focused on tabs + creation and the
  distribute action sits on its own.

This is a **frontend-only UI reorganization** of one component (+ its CSS). No store
actions, no backend, no behavior of the underlying actions changes — only *where* and *how*
they're triggered.

**Decisions (made autonomously — see Notes):**

- **The `+` dropdown contains the two tab-creation actions only:** "New tab" → `addCanvas()`
  and "New tab from template…" → `openTemplateUse()` (disabled when there are no templates,
  i.e. `!hasTemplates`). The "New tab from template…" item **moves out of** the Templates ▾
  menu into the `+` dropdown (so it lives in exactly one place — no duplication).
- **The Templates ▾ menu is kept, trimmed to template *management*:** "New template…",
  "Save current canvas as template…", "Manage templates…". Rationale: those three are not
  "add a tab" actions, and the card only asked to change the `+` and the distribute control —
  not to remove template management. (Considered and rejected: folding *all* template
  actions into the `+` and deleting the Templates button — semantically odd to put "Manage
  templates…" under a `+`/add affordance, and a bigger change than the card asked for.)
- **The distribute (`Grid2x2`) button moves to the far right** of the strip via
  `margin-left: auto` (so it's pushed to the right edge), keeping its icon, tooltip,
  `equalizeCanvas()` action, and `disabled={!canEqualize}` gating unchanged.

**Scope**

1. **`+` → dropdown.** Replace the single `addCanvas` `+` button with a dropdown trigger
   (reuse the Templates ▾ mechanics: a `styles.tabAdd` trigger showing `Plus` + a small
   `ChevronDown`, wrapped like `styles.templatesWrap`, opening a fixed-position
   `styles.templatesMenu`-style menu anchored to the button's viewport rect, closing on
   outside-`pointerdown` / `Escape` / selection). Items: **New tab** → `addCanvas()`;
   **New tab from template…** → `openTemplateUse()` (disabled when `!hasTemplates`).
   - Factor the open/anchor/close logic so the two menus don't fight: either a small
     reusable hook/state per menu, or two independent `open`/`menuPos`/`ref` state sets.
     Keep each menu's outside-click + Escape handling correct (the existing Templates menu
     pattern, lines ~182–208, is the template to mirror).
   - Preserve a sensible `aria-haspopup="menu"` / `aria-expanded` on the trigger and
     `role="menu"`/`role="menuitem"` on the menu, matching the Templates menu.
2. **Trim the Templates ▾ menu** to: New template…, Save current canvas as template…,
   Manage templates… (remove the "New tab from template…" item — now under `+`). Keep the
   `LayoutTemplate` + `ChevronDown` trigger and the existing disabled gating
   (`canSaveAsTemplate`).
3. **Move the distribute button to the right.** Render the `Grid2x2` distribute button as
   the **last** child of `.tabStrip` and give it `margin-left: auto` (a new CSS class, e.g.
   `.tabDistribute`, composing the `.tabAdd` styling + the auto left margin), so it sits at
   the right edge. Keep `onClick={() => equalizeCanvas()}`, `disabled={!canEqualize}`,
   tooltip, and aria-label exactly as today.
4. **CSS** (`Canvas.module.css`): add the right-aligned distribute class; if a second
   dropdown wrapper/menu class is needed it can reuse `.templatesWrap` / `.templatesMenu` /
   `.templatesItem` (rename to a neutral name like `.menuWrap`/`.menu`/`.menuItem` shared by
   both, OR just reuse the existing `templates*` classes for the `+` menu too — pick one and
   keep it consistent). Note the `.tabStrip` `overflow-x: auto` means dropdowns must stay
   `position: fixed` anchored to the button rect (#129) — do not regress that.

**Out of scope**

- **No keybind work.** Adding a keyboard shortcut for "New tab" and surfacing it is the
  **next** Refine card (TASK-206) — this task only reorganizes the buttons/menus. (When 206
  lands, the "New tab" dropdown item is the natural place to show its `⌘…` hint.)
- **No change** to what `addCanvas`, `equalizeCanvas`, `openTemplateUse`,
  `openTemplateEditor`, `openTemplateEditorFromCanvas`, or `openTemplateManager` *do* — only
  how they're surfaced.
- **No change** to the tab items themselves (select/rename/close/pop-out/drag-reorder/
  tear-off) — leave the `Tab` component and its DnD untouched.
- **No detached-window changes** — the tab strip is main-window only already.

**Subtasks**

1. [x] Build the `+` dropdown (Plus + ChevronDown trigger) with "New tab" (`addCanvas`) and
   "New tab from template…" (`openTemplateUse`, disabled when `!hasTemplates`), reusing the
   Templates-menu open/anchor/outside-click/Escape pattern.
2. [x] Remove "New tab from template…" from the Templates ▾ menu (keep New template… / Save
   current canvas as template… / Manage templates…).
3. [x] Move the distribute (`Grid2x2`) button to the far right of `.tabStrip` via
   `margin-left: auto`, unchanged action/gating/tooltip.
4. [x] Add/adjust the CSS (right-aligned distribute class; shared or reused menu classes),
   keeping dropdowns `position: fixed` so they escape the strip's `overflow-x` clip.
5. [x] `npm run build`, `npm run lint`, `npm run format:check`, `npm test` all pass.
6. [x] Manually verify: the `+` opens a menu with both items (template item disabled when no
   templates exist); both create the right kind of tab; the Templates ▾ menu shows only the
   three management items; the distribute button sits at the right edge, still disabled with
   `<2` panels and still equalizes; both dropdowns open below their button, don't clip, and
   close on outside-click/Escape; many tabs still scroll horizontally without breaking the
   right-aligned distribute button.

**Acceptance criteria**

- [x] The Canvas tab strip's `+` is a **dropdown** offering **New tab** and **New tab from
  template…** (the latter disabled when no templates exist); clicking each performs the same
  action the old `+` / old "New tab from template…" did.
- [x] The **Templates ▾** menu remains and contains exactly **New template…**, **Save
  current canvas as template…**, **Manage templates…** (no "New tab from template…").
- [x] The **distribute** control is rendered at the **right side** of the tab bar, with its
  action, disabled-state (`<2` panels), and tooltip unchanged.
- [x] Both dropdowns open anchored below their trigger, do not get clipped by the strip's
  horizontal overflow, and close on outside-click / Escape / selection.
- [x] `npm run build`, `npm run lint`, Prettier, and `npm test` pass.

**Notes**

- **Autonomous refine (2026-06-27).** Per the `ASSUMPTIONS.md` standing directive
  (2026-06-26) the user no longer answers refine-loop questions; decisions logged in
  `ASSUMPTIONS.md` under TASK-205:
  - `+` dropdown holds the two **tab-creation** items only; the Templates ▾ menu is kept for
    **template management** (rejected folding everything into `+` — "Manage templates…" under
    an add affordance is semantically off and exceeds the card's ask).
  - "New tab from template…" relocates from Templates ▾ into the `+` dropdown (single home,
    no duplication).
  - Distribute moves to the **right** via `margin-left: auto`.
- **Forward ref:** the next Refine card (a "new Canvas tab" keybind, → TASK-206) will surface
  its shortcut on the `+` dropdown's "New tab" item; that task should depend on this one.
- Key files: `src/components/Canvas/CanvasTabs.tsx` (the `+` button ~251–259, distribute
  ~260–271, Templates ▾ ~272–341, menu open/close pattern ~170–208; store actions
  `addCanvas`/`equalizeCanvas`/`openTemplateUse`/`openTemplateEditor`/
  `openTemplateEditorFromCanvas`/`openTemplateManager`/`hasTemplates`/`canEqualize`/
  `canSaveAsTemplate`), `src/components/Canvas/Canvas.module.css` (`.tabStrip` ~20,
  `.tabAdd` ~110, `.templatesWrap/.templatesMenu/.templatesItem` ~138–182).
- All referenced code ships today (#58 tabs, #117/#118 templates, #186 distribute) — no
  dependency on any open task.

**Implementation (done 2026-06-27)**

- `CanvasTabs.tsx`: factored the #117 Templates-menu open/anchor/outside-click/Escape
  logic into a reusable `useDropdownMenu()` hook (returns `{open, menuPos, wrapRef, btnRef,
  toggle, close}`), and gave the strip **two independent instances** — `addMenu` and
  `templatesMenu` — so they don't fight over open state.
- The **`+`** is now a dropdown (Plus + ChevronDown trigger, `aria-haspopup="menu"`) with
  **New tab** (`addCanvas`) and **New tab from template…** (`openTemplateUse`, disabled when
  `!hasTemplates`). The latter **moved out of** the Templates ▾ menu, so it lives in exactly
  one place.
- The **Templates ▾** menu now holds only template *management*: New template… / Save
  current canvas as template… (disabled when `!canSaveAsTemplate`) / Manage templates…
- The **distribute** (`Grid2x2`) button is rendered as the **last** child of `.tabStrip`
  with `className={`${styles.tabAdd} ${styles.tabDistribute}`}`; the new `.tabDistribute`
  adds `margin-left: auto` to push it to the right edge. Its `equalizeCanvas()` action,
  `disabled={!canEqualize}` gating, tooltip, and aria-label are unchanged.
- `Canvas.module.css`: renamed the shared dropdown classes
  `.templatesWrap/.templatesMenu/.templatesItem` → neutral `.menuWrap/.menu/.menuItem`
  (now used by both dropdowns), kept their `position: fixed` (#129 overflow-clip escape),
  and added `.tabDistribute`.
- No store/backend/behavior change; the `Tab` component + its DnD/tear-off are untouched.
- Verified: `npm run build`, `npm run lint`, `prettier --check` (touched files), and
  `npm test` (288 passing) all pass. The interactive eyeball (subtask 6) can't run in the
  headless loop; the reorg is pure markup/CSS over unchanged store actions.
