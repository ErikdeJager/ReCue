### 222. [x] Revert the Canvas "+" to a plain new-tab button; move "from template" back into the Templates menu

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

Partially **revert task #205**. The Canvas tab strip's **"+"** button is currently a
**dropdown** ("New tab" / "New tab from template…", added by #205). Restore it to a
**plain "+" button that immediately creates a new empty canvas tab** — nothing else —
and **move the "New tab from template…" action back into the "Templates ▾" dropdown**
(where it lived before #205, originally added by #118).

**Grounding (current state, post-#205/#206):**

- `src/components/Canvas/CanvasTabs.tsx`:
  - The **"+"** is a dropdown trigger (`addMenu.toggle`) rendering a `Plus` + a
    `ChevronDown` (`CanvasTabs.tsx:267-280`); its menu (`CanvasTabs.tsx:281-314`) has
    two items: **"New tab"** (`addCanvas()`, with a ⌘T `<kbd>` from #206) and **"New tab
    from template…"** (`openTemplateUse()`, `disabled={!hasTemplates}`).
  - The **"Templates ▾"** menu (`CanvasTabs.tsx:318-377`) currently holds **management
    only**: "New template…" (`openTemplateEditor(null)`), "Save current canvas as
    template…" (`openTemplateEditorFromCanvas()`, #187), "Manage templates…"
    (`openTemplateManager()`).
  - Two independent fixed-position dropdowns are created via `useDropdownMenu()`:
    `addMenu` and `templatesMenu` (`CanvasTabs.tsx:221-222`).
  - The **⌘T / Ctrl+T** keybind (#206) creates a new tab from anywhere; its hint shows
    on the "+" tooltip (`title={`New tab (${kbdHint(platform, "⌘T", "Ctrl+T")})`}`,
    line 273) and on the "New tab" menu item's `<kbd>` (lines 297-299).
- `openTemplateUse` is a store action (still used); `hasTemplates =
  canvasTemplates.length > 0` gates the template item.
- A **faithful revert reference** for the exact pre-#205 menu structure:
  `git show 54d1083^:src/components/Canvas/CanvasTabs.tsx` (`54d1083` = "Implement task
  #205"; its parent is the pre-#205 layout where "New tab from template…" lived in the
  Templates menu and "+" was a plain button).

**Goal:** "+" becomes a one-click "new empty canvas" button (no chevron, no menu); the
"from template" entry point lives under "Templates ▾".

**Decided approach (autonomous — see Notes/ASSUMPTIONS.md):**

1. **"+" → plain button.** Replace the `addMenu` dropdown trigger with a plain `<button>`
   whose `onClick` calls `addCanvas()` directly. Remove the `ChevronDown`, the
   `aria-haspopup`/`aria-expanded`, and the entire `addMenu` menu JSX
   (`CanvasTabs.tsx:281-314`). Remove the now-unused `const addMenu = useDropdownMenu()`
   (keep `useDropdownMenu` itself — `templatesMenu` still uses it). Keep the **"New tab
   (⌘T)"** `title`/`aria-label` so #206's hint stays on the button.
2. **Move "New tab from template…" into "Templates ▾".** Add the `openTemplateUse()` item
   (gated `disabled={!hasTemplates}`) to the `templatesMenu`. Place it at the **top** of
   that menu (the primary "use a template" action, above the management items "New
   template…" / "Save current canvas as template…" / "Manage templates…"), or match the
   exact pre-#205 placement from the revert reference above — implementer's choice, top
   recommended.
3. **Preserve #206.** ⌘T / Ctrl+T must still create a new tab (the keybind handler is
   unchanged); its visual hint remains on the "+" tooltip and the `useKeyboardNav`
   legend. The `<kbd>` that was inside the removed "+" menu item simply goes away.

**Out of scope:**

- The **"Distribute panels evenly"** button position. #205 also moved it to the right
  edge of the strip (`tabDistribute` `margin-left:auto`, `CanvasTabs.tsx:378-389`); the
  card does **not** mention it, so leave it where it is.
- The Templates management items themselves (New/Save/Manage) — unchanged except for
  gaining the "New tab from template…" entry.
- The `openTemplateUse` store action and the `TemplateUseModal` flow — unchanged; only
  its **trigger location** moves.
- `useDropdownMenu` and the `templatesMenu` dropdown mechanics — unchanged.

**Cross-platform (hard requirement):** pure frontend UI change, no OS-specific code; the
⌘↔Ctrl hint already routes through `kbdHint`/`isWindows`. Renders identically on macOS
(WKWebView) and Windows (WebView2). The ⌘T/Ctrl+T handler uses `metaKey || ctrlKey`
(unchanged), so it keeps firing on both.

**Subtasks**

1. [ ] In `src/components/Canvas/CanvasTabs.tsx`, convert the "+" from a dropdown trigger
   to a plain button: `onClick={() => addCanvas()}`, remove the `ChevronDown` glyph,
   `aria-haspopup`/`aria-expanded`, and the `addMenu` menu block. Keep the "New tab
   (⌘T)" tooltip/aria-label.
2. [ ] Remove the unused `addMenu = useDropdownMenu()` instance and its `wrapRef`/`btnRef`
   wiring; verify no now-dangling refs/imports remain (keep `ChevronDown` — the Templates
   ▾ trigger still uses it; keep `useDropdownMenu`, `openTemplateUse`, `hasTemplates`).
3. [ ] Add the "New tab from template…" item (`openTemplateUse()`, `disabled={!hasTemplates}`)
   to the `templatesMenu` menu, at the top (or per the pre-#205 reference).
4. [ ] Confirm ⌘T/Ctrl+T still creates a new tab and the "+" creates an empty tab in one
   click; build/lint/format pass: `npm run build`, `npm run lint`, `npm run format:check`.

**Acceptance criteria**

- [ ] The Canvas tab-strip **"+"** is a plain button (no chevron, no dropdown); clicking
      it creates a **new empty canvas tab** immediately.
- [ ] **"New tab from template…"** appears in the **"Templates ▾"** menu (disabled when
      no templates exist), and **not** under "+".
- [ ] **⌘T / Ctrl+T** still creates a new tab; its hint shows on the "+" tooltip and the
      keyboard legend (no regression to #206).
- [ ] The Templates ▾ management items (New template… / Save current canvas as template…
      / Manage templates…) remain present and functional; the distribute-evenly button is
      unchanged.
- [ ] `npm run build`, `npm run lint`, `npm run format:check` pass.

**Notes**

- **Autonomous decisions (user not answering; logged in `ASSUMPTIONS.md`):**
  - *Revert scope* = only the "+" dropdown + template-entry relocation (exactly what the
    card asks). The other #205 change (distribute moved right) is left intact since the
    card doesn't mention it.
  - *Template item placement* = **top of the Templates ▾ menu**; the implementer may
    instead match the exact pre-#205 order via `git show
    54d1083^:src/components/Canvas/CanvasTabs.tsx`.
  - *#206 preserved* — ⌘T keeps working; only the in-"+"-menu `<kbd>` hint is dropped
    (the tooltip + legend keep the hint).
- **Depends on: none** — this refines shipped code (#205 dropdown, #206 ⌘T, #117/#118
  templates); no open task is a prerequisite.
- References: `src/components/Canvas/CanvasTabs.tsx:221-222` (`addMenu`/`templatesMenu`),
  `:267-314` ("+" dropdown to revert), `:318-377` (Templates ▾ menu to receive the
  item), `:378-389` (distribute, leave as-is), `:148-184` (`useDropdownMenu`), the store
  `openTemplateUse` / `addCanvas` actions, `useKeyboardNav` (⌘T handler + legend).
