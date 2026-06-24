### 158. [ ] FileViewer cutoff in Overview at narrow widths (markdown text + Rendered/Raw toolbar)

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-24

**Description**

A markdown file shown as an **Overview column** gets **cut off horizontally at small
column widths** — and the same column works fine in Canvas. The card: "Markdown files
displayed in overview mode (in canvas works fine) get cut off if the width is too
small. Even the buttons for render/raw view are not visible or cut off depending on
the width. The text of the markdown file is not entirely visible and is also cut off."

So there are **two** symptoms in a narrow Overview column:
1. The rendered **markdown text** is clipped on the right (not wrapped to the column).
2. The **Rendered / Raw** toggle (and the "Saving…/Saved" status) in the toolbar is
   pushed off / clipped, so you can't switch views.

**Root cause (grounded, FileViewer-internal CSS):** the FileViewer root
`src/components/FileViewer/FileViewer.module.css` `.viewer` is
`{ display: flex; flex: 1; min-height: 0; flex-direction: column; }` — it has
`flex: 1` (so it grows to fill its column) **but no `min-width: 0`**. A flex item's
default `min-width` is `auto` (its content's intrinsic width), so when the rendered
content is wider than the column the `.viewer` refuses to shrink and keeps its
content width. The Overview column then **clips** it because the column card is
`overflow: hidden` (`Overview.module.css` `.card { flex: 1 0 360px; … overflow:
hidden; }`). In **Canvas** this doesn't happen because the Canvas panel body
`.panelBody` already sets `min-width: 0` + a `.panelBody > * { min-width: 0 }` child
rule (`Canvas.module.css:360-373`), so the FileViewer there is bounded and its
inner surfaces wrap/scroll.

Two FileViewer-internal fixes follow:
- **Content cutoff:** giving `.viewer` `min-width: 0` lets it shrink to the column
  width; then the rendered `.markdown` (which already has `word-wrap: break-word`)
  wraps, and the read-only `.raw`/`.code` surface (`overflow: auto; white-space:
  pre`) gains a horizontal scrollbar instead of being clipped.
- **Toolbar cutoff:** `.toolbar` is a non-wrapping flex row with `.status`
  (`margin-right: auto`) + the `.segmented` Rendered/Raw toggle (`justify-content:
  flex-end`). Neither child shrinks, so at narrow widths their combined width
  overflows and the right-aligned toggle is clipped. The toolbar must stay usable:
  the status text should shrink/truncate while the toggle stays fully visible.

This is parallel to **#156** (kanban horizontal scroll), which fixes the **Overview
`.body`** wrapper. That `.body` fix (its planned `.body > * { min-width: 0 }` rule)
would *also* bound this `.viewer` — so #156 may incidentally fix symptom (1). This
task fixes the FileViewer **directly** (so it's robust in any flex context) **and**
fixes the toolbar (symptom 2), which #156 does not touch. Kept independent because
every change here lives in FileViewer's own CSS and works with or without #156.

**Scope:** FileViewer CSS only — make `.viewer` shrink to its container, keep the
Rendered/Raw toolbar usable at narrow widths, and ensure rendered markdown wraps.

**Explicitly out of scope:**

- The Overview `.body` structural change — that's **#156**; do not edit
  `Overview.module.css` here (avoid a conflicting edit).
- `KanbanPanel`'s toolbar, which has an **identical** `.toolbar`/`.status`/
  `.segmented` structure and the same potential clip — cross-referenced to the Kanban
  UI cards; not fixed here to keep scope on markdown/FileViewer.
- Any change to markdown rendering features/content (react-markdown + remark-gfm
  stay as-is).
- Canvas FileViewer behavior (already correct — must remain unchanged).

**Subtasks**

1. [ ] In `FileViewer.module.css`, add `min-width: 0;` to `.viewer` so it shrinks to
   the Overview column width (it is a `flex: 1` child of the column body but its
   default `min-width: auto` currently prevents shrinking).
2. [ ] Make the **toolbar** responsive so the Rendered/Raw toggle is never clipped:
   - `.toolbar { min-width: 0; }` (and consider `gap` so children don't collide).
   - `.status { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space:
     nowrap; }` so the "Saving…/Saved" hint truncates instead of pushing the toggle
     out.
   - `.segmented { flex-shrink: 0; }` so the toggle keeps its full size and stays
     visible.
   - Optional: `.toolbar { flex-wrap: wrap; row-gap: var(--space-4); }` so at extreme
     narrowness the toggle wraps to a second line rather than clipping.
3. [ ] Ensure rendered markdown wraps fully: confirm `.markdown` has `min-width: 0`
   in effect and add `overflow-wrap: anywhere;` (alongside the existing `word-wrap:
   break-word`) so long unbreakable tokens (URLs, inline code) wrap instead of forcing
   horizontal overflow. Leave `.markdown pre { overflow-x: auto }` (code blocks scroll)
   as-is.
4. [ ] Confirm the read-only raw/code view (`.raw`, `white-space: pre; overflow:
   auto`) now shows a horizontal scrollbar within a narrow Overview column instead of
   being clipped (a side benefit of bounding `.viewer`).
5. [ ] **Manual verification:** open a markdown file as an Overview column and narrow
   the column (drag the sidebar wide / shrink the window): rendered text wraps and is
   fully visible; the Rendered/Raw toggle stays visible and clickable; switch to Raw —
   long lines scroll horizontally, not clipped. Widen again → normal. Open the same
   file in a Canvas panel → unchanged.
6. [ ] Run `npm run build`, `npm run lint`, `npm run format:check`; fix any CSS
   formatting. (CSS-only — no unit test; rely on the manual checks.)

**Acceptance criteria**

- [ ] In a narrow Overview column, rendered markdown text wraps and is fully visible —
      no right-edge cutoff.
- [ ] The Rendered/Raw toggle (and Saving/Saved status) remain visible and usable at
      narrow Overview widths; the toggle buttons are never clipped.
- [ ] The raw/code view scrolls horizontally within the column rather than being
      clipped.
- [ ] Canvas FileViewer rendering is unchanged.
- [ ] `npm run build`, `npm run lint`, `npm run format:check` pass.

**Notes**

- **Root cause** is FileViewer-internal: `.viewer` is `flex: 1` but lacks
  `min-width: 0`, so it keeps its intrinsic content width and is clipped by the
  Overview column's `.card { overflow: hidden }`; the `.toolbar` can't shrink so the
  right-aligned toggle clips. Both fixes are pure `FileViewer.module.css`.
- **Relationship to #156:** #156 fixes the Overview `.body` wrapper (for kanban
  scroll); its `.body > * { min-width: 0 }` rule would also bound this `.viewer`
  (redundant + complementary). This task fixes the FileViewer directly and adds the
  toolbar fix #156 doesn't cover. **Kept independent** (no ordering dependency) since
  all edits are in FileViewer's own CSS. If both land, the redundant `min-width: 0` is
  harmless.
- **KanbanPanel** has an identical toolbar structure (`.toolbar`/`.status`/
  `.segmented`) and would benefit from the same toolbar fix — tracked under the Kanban
  UI cards, cross-reference when implementing those.
- **Task numbering:** highest existing is #157 (TASK-154…157.md; board #155/#156/#157;
  `TASK_ARCHIVE.md` ≤ #153). Hence #158.
- **Dependencies:** none.
- **References:** `FileViewer/FileViewer.module.css` (`.viewer`, `.toolbar`,
  `.status`, `.segmented`, `.raw`, `.markdown`), `FileViewer/FileViewer.tsx`
  (toolbar JSX ≈ lines 83-126, content ≈ 128-150), `Overview/Overview.module.css`
  (`.card`, `.body`), `Overview/Overview.tsx` (FileViewer render ≈ line 334),
  `Canvas/Canvas.module.css:360-373` (`.panelBody` min-width:0 — why Canvas works).
