# TASK-239

### 239. [ ] Add a Settings section to configure Kanban column colors by name (with a hashed-name fallback)

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-28

**Description**

Kanban board columns are currently colored **by position**: `BoardColumn` derives
`accent = REPO_PALETTE[col % REPO_PALETTE.length]` (`KanbanPanel.tsx:338–341`) and feeds
it to `--col-accent`, which tints the column **top border** (`.column`,
`KanbanPanel.module.css:158`), the **header dot** (`.colDot:177`), and the **add-card
composer border** (`:656`). The markdown format has nowhere to store a color, so the
color is purely derived and the user can't control it.

This task lets the user **configure Kanban column colors by column name** via a new
**Settings section**, applied globally to every board.

**Model (per the user's decisions, step 5):**

- **By name, global:** Settings holds a list of **column-name → color** entries, applied
  to **all** boards (no per-board override — the markdown can't hold color).
- **Seed with the three defaults:** a new Kanban is created with columns **"To Do",
  "Doing", "Done"** (`kanbanOps.ts` `defaultBoard()`), so the Settings list is
  **pre-populated with those three names** (editable) out of the box.
- **User-extensible:** the user can **add new rows** — type any column name and assign it
  a color — and edit/remove existing rows.
- **Fallback for unlisted names = hashed name → Catppuccin swatch:** a board column whose
  name is **not** in the Settings list gets a **deterministic** color derived by
  **hashing the column name into `REPO_PALETTE`** — exactly like `repoColor()` hashes a
  path (`store.ts:492–500`). Stable per name across renders and reopens; nothing
  persisted for unlisted names. _(This supersedes the original "random each time" idea —
  the user chose a consistent hashed color instead, to avoid flicker.)_
- **Color picker = swatches + "+" free picker:** each row picks a color from the existing
  **Catppuccin `REPO_PALETTE` swatches** (the same picker used for Accent color /
  repo colors — `.swatches`/`.swatch`/`.swatchActive`, `Settings.tsx:245–263`), with a
  final **"+" swatch** that opens a **free color input** (`<input type="color">`) for an
  arbitrary color. _(The "+" free picker is an explicit, user-requested exception to the
  "stay on-system / palette-only" convention; the default swatches remain Catppuccin.)_

**Grounding — what exists and what to change:**

- `src/store.ts`: `REPO_PALETTE` (14 Catppuccin hexes, `:462–477`), `hashString`
  (`:479–485`), and `repoColor(path, colors)` (`:492–500`) are the exact pattern for the
  hashed-name fallback. Settings persist as one opaque blob
  (`saveSettings`/`ipc.setSettings`), merged over `DEFAULT_SETTINGS` — adding a field
  upgrades old `sessions.json` cleanly.
- `src/types/index.ts`: the `Settings` type (e.g. `diffDisplayMode` at `:251`). Add the
  new `kanbanColumnColors` field here.
- `src/components/Settings/Settings.tsx`: the `Section` union (`:37–42`), the
  `SETTINGS_SECTIONS` nav array (`:50–75`), per-section `{section === "..." && (...)}`
  blocks, the `update(key, value)` draft setter, and the **swatch picker** markup
  (`:245–263`). Add a `"kanban"` section here.
- `src/components/Kanban/KanbanPanel.tsx`: `BoardColumn` computes `accent` (`:338–341`)
  and applies `--col-accent` (`:369`). `props.name` is already the column name. Swap the
  index-based `accent` for a name-based lookup.

**Subtasks**

1. [ ] **Settings type + default** (`types/index.ts`, `store.ts`): add
   `kanbanColumnColors: { name: string; color: string }[]` to `Settings`; seed
   `DEFAULT_SETTINGS.kanbanColumnColors` with the three default columns
   `["To Do","Doing","Done"]`, each mapped to its **hashed-name color** (so the seeded
   entries match what an unconfigured board would show; conventional hand-picked defaults
   are an acceptable alternative).
2. [ ] **Pure color helper** (`store.ts`, beside `repoColor`): add + export
   `kanbanColumnColor(name: string, configured: {name;color}[]): string` — return the
   configured entry's color when `name` matches an entry (**case-insensitive + trimmed**),
   else hash `name` into `REPO_PALETTE` (reuse `hashString`). Keep it pure/testable.
3. [ ] **Apply in the board** (`KanbanPanel.tsx`): in `BoardColumn`, read
   `const columnColors = useStore((s) => s.settings.kanbanColumnColors)` and set
   `const accent = kanbanColumnColor(props.name, columnColors)`, replacing the
   `REPO_PALETTE[col % len]` derivation. `--col-accent` (border/dot/composer) then follows
   automatically — no CSS change needed.
4. [ ] **New "Kanban" Settings section** (`Settings.tsx`): add `"kanban"` to the `Section`
   union + a `SETTINGS_SECTIONS` entry (label "Kanban", a Lucide icon, e.g.
   `SquareKanban`), and a `{section === "kanban" && (...)}` block: a help line + an
   **editable list** of column-color rows. Each row = an editable **name** text input + a
   **color picker** (reuse `.swatches`/`.swatch` for the `REPO_PALETTE` swatches, marking
   the active one; a final **"+" swatch** opens a hidden `<input type="color">` whose
   `onChange` sets that row's color to the chosen hex) + a **remove** (×) button. An **Add
   column color** button appends a blank row. All mutations go through
   `update("kanbanColumnColors", nextArray)` so they apply on **Save** like every other
   setting. (Place it as a new nav section per "add a Settings section"; nesting it under
   Appearance instead is an acceptable alternative if a whole nav section feels heavy.)
5. [ ] **Tests + verify:** add a unit test for `kanbanColumnColor` (exact + case-insensitive
   match returns the configured color; an unlisted name returns a stable, deterministic
   `REPO_PALETTE` color; same name → same color across calls). Run `npm run build`,
   `npm run lint`, `npm test`. Manual: a board's "To Do"/"Doing"/"Done" lanes use the
   configured colors; renaming a lane to an unlisted name gives a stable hashed color;
   adding that name in Settings + Save recolors it; the "+" free picker applies an
   arbitrary color.

**Acceptance criteria**

- [ ] A new **"Kanban"** section in Settings lists column-color entries, **pre-populated
      with "To Do", "Doing", "Done"**, each editable.
- [ ] The user can **add** a new entry (type any column name + assign a color), **edit** a
      row's color, and **remove** a row. Changes apply on **Save** and **persist** across
      restart (via the existing settings blob).
- [ ] Each entry's color is chosen from the **Catppuccin `REPO_PALETTE` swatches**, with a
      final **"+"** that opens a **free color picker** for an arbitrary color.
- [ ] A board column whose name **matches** a configured entry (case-insensitive, trimmed)
      uses that entry's color for its top border, header dot, and composer border.
- [ ] A board column whose name is **not** configured gets a **deterministic** color
      hashed from its name into `REPO_PALETTE` — **stable** across renders and reopens
      (no flicker, nothing persisted).
- [ ] The configuration is **global** (applies to every board); no per-board override.
- [ ] `npm run build`, `npm run lint`, `npm test` pass (incl. the new `kanbanColumnColor`
      test). Pure frontend — identical on macOS and Windows.

**Notes**

- **User answers (step 5, incl. follow-ups):**
  - **By name, global** (not by position; no per-board override).
  - Pre-populate the **three default column names** ("To Do", "Doing", "Done") from
    `defaultBoard()`; user can add arbitrary name→color rows.
  - **Unlisted names → hashed-name Catppuccin color** (deterministic/consistent — the
    user explicitly preferred this over "random each time" to avoid flicker).
  - Picker = **Catppuccin swatches + a "+" free color picker** (the "+" is a deliberate
    exception to the palette-only convention).
- **Reuse references:** `repoColor`/`hashString`/`REPO_PALETTE` (`store.ts`) for the
  fallback; the Accent-color swatch picker (`Settings.tsx:245–263`, `.swatches`/`.swatch`)
  for the per-row picker; `SETTINGS_SECTIONS` + the `Section` union for the new section.
- **Data shape:** an **ordered array** `{name, color}[]` (not a `Record`) so the editable
  Settings list has stable row order and supports blank/duplicate-name rows mid-edit; the
  lookup helper resolves the first matching name.
- **Cross-platform:** pure frontend; settings persist via the existing cross-platform
  `set_settings` blob; `<input type="color">` works in both WKWebView and WebView2. No
  OS-specific code.
- **Dependencies:** none — builds on shipped Kanban (#143/#145/#151/#233) + the settings
  + swatch-picker infrastructure (#100/#102). Independent of the sibling Refine card
  ("bigger Add card/Cancel buttons"); both may touch `KanbanPanel`/its CSS but neither
  blocks the other.
