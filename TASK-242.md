# TASK-242

### 242. [ ] Fix the undefined `--space-10` token app-wide (replace every use with `--space-12`)

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-28

**Description**

`var(--space-10)` is used as horizontal padding at several sites, but **`--space-10` is
never defined** — the spacing scale in `src/styles/tokens.css` is deliberately
`--space-1/2/4/6/8/12/16/20/24/32` (it **skips 10**). A `var()` referencing an undefined
custom property with **no fallback** is *invalid at computed-value time*, so the entire
`padding` shorthand at each site computes to **`0`** — the controls silently lose their
intended horizontal padding and read as cramped. (This is the same root cause diagnosed
for the Kanban "Add card"/"Cancel" buttons in #240; this task fixes the bug everywhere
else it occurs.)

**Decision (refine agent's call — the user said "do what you think is best"):** **replace
every `var(--space-10)` with `var(--space-12)`** (12px), the nearest defined token. This:

- **Keeps the curated scale intact** — it does *not* re-introduce a `--space-10` step the
  scale intentionally omits (the alternative "define `--space-10: 10px`" would pollute the
  scale).
- **Restores comfortable padding** (12px ≥ the intended 10px) rather than the current 0.
- **Matches precedent:** #240 already set the Kanban composer buttons to
  `var(--space-6) var(--space-12)` — standardizing the horizontal step on `--space-12`.

Only the **horizontal** value (`--space-10`) changes; the vertical values
(`--space-2` / `--space-4`) at each site are left as-is.

**Grounding — current `var(--space-10)` sites** (re-grep at implementation time, as #240
may have already removed the two Kanban composer-button uses):

- `src/components/FileViewer/FileViewer.module.css:49` — `padding: var(--space-2) var(--space-10)`
- `src/components/DiffInspector/DiffInspector.module.css:538` — `padding: var(--space-4) var(--space-10)`
- `src/components/Canvas/Canvas.module.css:663` — `padding: var(--space-4) var(--space-10)`
- `src/components/Kanban/KanbanPanel.module.css:52` — `padding: var(--space-2) var(--space-10)`
- `src/components/Kanban/KanbanPanel.module.css:534` — `padding: var(--space-2) var(--space-10)`
- `src/components/Kanban/KanbanPanel.module.css:700` — `.composerAdd` *(likely already fixed by #240 → `--space-6`/`--space-12`)*
- `src/components/Kanban/KanbanPanel.module.css:714` — `.composerCancel` *(likely already fixed by #240)*
- `src/components/TemplateEditor/TemplateEditor.module.css:325` — `padding: var(--space-4) var(--space-10)`

`src/styles/tokens.css:86–95` holds the scale (`--space-8: 8px;` then `--space-12: 12px;`
— no `--space-10`). **Do not** add a `--space-10` token.

**Subtasks**

1. [ ] Re-grep `grep -rn -- 'var(--space-10)' src/` to get the **current** full list (the
   set may have shrunk since #240 landed).
2. [ ] In **each** matching file, replace `var(--space-10)` with `var(--space-12)`,
   leaving the vertical padding value (`--space-2` / `--space-4`) unchanged. (A
   replace-all of the exact substring `var(--space-10)` → `var(--space-12)` across
   `src/**/*.css` is safe — it only ever appears as the horizontal padding value.)
3. [ ] Confirm **no** `var(--space-10)` remains: `grep -rn -- 'var(--space-10)' src/`
   returns nothing.
4. [ ] **Do not** define a `--space-10` token; the scale stays
   `1/2/4/6/8/12/16/20/24/32`.
5. [ ] Verify: `npm run build`, `npm run lint`, `npm test` pass. Spot-check the affected
   controls (FileViewer toolbar, DiffInspector, Canvas, Kanban, TemplateEditor) now have
   comfortable horizontal padding instead of text flush to the edges.

**Acceptance criteria**

- [ ] **No** `var(--space-10)` reference remains anywhere in `src/`.
- [ ] **No** `--space-10` token is added to `tokens.css` (the scale is unchanged).
- [ ] Every previously-affected control now has real (12px) horizontal padding — its text
      no longer sits flush to the edges (the padding is no longer silently dropped to 0).
- [ ] Vertical padding at each site is unchanged (still `--space-2` / `--space-4`).
- [ ] `npm run build`, `npm run lint`, `npm test` pass. Pure CSS — identical on macOS and
      Windows.

**Notes**

- **Why replace (not define):** the scale curates its steps and intentionally omits 10;
  re-adding it to satisfy stray references would degrade the design system. Replacing with
  the nearest defined step (`--space-12`) removes the broken references and restores
  comfortable padding consistently.
- **Relationship to #240:** #240 fixed the two Kanban composer/edit buttons specifically
  (also via `--space-12`). This task sweeps up every **other** `--space-10` site. They're
  independent — order doesn't matter; #242 just fixes whatever still references the
  undefined token. **Depends on: none.**
- **Optional hardening (out of scope, mention only):** a future guard (stylelint rule or a
  CI grep) could fail the build on any `var(--space-N)` that isn't a defined token, to
  prevent this class of silent bug recurring.
- **Cross-platform:** pure CSS; renders identically in WKWebView (macOS) and WebView2
  (Windows).
