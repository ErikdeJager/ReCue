# Plan

---

### 173. [ ] Clickable task-list checkboxes in rendered markdown (FileViewer + Kanban card bodies)

**Status:** Not started · _(Not started | In progress | Done)_
**Depends on:** none · _(independent — builds only on already-shipped code)_
**Created:** 2026-06-25

**Description**

When markdown is shown **rendered** (not raw), GFM task-list items (`- [ ]` / `- [x]`)
render as checkboxes — but today they are **disabled / read-only** (an explicit #52
decision; see the comment at `src/components/FileViewer/FileViewer.module.css:376`,
"react-markdown renders them `disabled`, restyled … never editable"). The user wants to
**click those checkboxes to toggle them**, flipping the underlying source marker
`- [ ]` ⇄ `- [x]` and persisting it to the file. No other in-place editing of rendered
markdown is wanted — **only** the checkboxes.

Concretely, this reverses the #52 "never editable" rule for two render sites:

1. **`FileViewer`** (`src/components/FileViewer/FileViewer.tsx`) — the universal file
   viewer's **rendered markdown** view (`renderMarkdown`, line ~148:
   `<ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>`). Used in Overview
   columns, Canvas panels, and files opened from anywhere.
2. **`KanbanPanel`** card **bodies** (`src/components/Kanban/KanbanPanel.tsx`) — the
   read-only markdown body rendered for a card in **view mode** (`SortableCard`, line ~227,
   and the drag preview `CardPreview`, line ~265:
   `<ReactMarkdown remarkPlugins={[remarkGfm]}>{card.body}</ReactMarkdown>`). A card body
   can contain nested task items; those checkboxes should be clickable too. _(This is the
   card **body** content, distinct from the card's own done-checkbox in the header, which
   is already interactive via `toggleCard`.)_

Both sites already own a write path that this reuses — **no new persistence machinery**:

- `FileViewer` holds the file in the shared **`useAutoSaveFile`** buffer
  (`src/useAutoSaveFile.ts`) and writes via `setText(next)`.
- `KanbanPanel` derives `board = parseBoard(text)` from the same buffer and writes via
  `mutate(next) = setText(serializeBoard(next))`; a card-body edit goes through
  `updateCard(board, col, idx, { body })` (`src/components/Kanban/kanbanOps.ts`).

Because both routes funnel through `useAutoSaveFile.setText`, the existing **save-mode**
behavior (#162) applies for free and must be honored (see UX decisions in Notes):

- **Auto save** (`settings.autoSave` true, default): a toggle marks the buffer dirty and
  the debounced write fires (~600ms) — same as typing in the raw editor.
- **Manual save** (`settings.autoSave` false): a toggle marks the buffer **dirty** but does
  **not** write until ⌘S / the Save button — exactly like editing the raw textarea. The
  unmount/file-switch flush still prevents data loss. _(KanbanPanel already shows a Save
  button + status in its toolbar; the FileViewer must show the same affordance in
  **rendered** mode now that rendered markdown became writable — see Subtask 4.)_

**The mapping problem (rendered checkbox → source marker).** remark-gfm turns a task list
item into a `listItem` carrying `checked`, which `mdast-util-to-hast` renders as a
**synthesized** `<input type="checkbox" disabled>`. The synthesized `input` hast node has
**no `position`**, but its nearest ancestor **`li`** element node **does** (the original
source offsets). The robust approach is therefore: a tiny **rehype plugin** stamps each
task-checkbox `input` hast node with its nearest `li`'s source `start`/`end` **offsets**;
the `input` **component override** reads those offsets off `node.properties`, and on toggle
a pure helper finds the first `[ ]`/`[x]`/`[X]` marker inside that source slice and flips
the single character. Offsets are relative to **the exact string passed to that
`<ReactMarkdown>`** — the whole `text` for `FileViewer`, the de-indented `card.body` for a
Kanban card — so the flip applies to that same string with no extra bookkeeping. This is
robust against `[ ]`-looking text inside code fences (the parser never makes those into
task items, so they never get stamped) — unlike a naive line-regex index approach, which
must NOT be used.

`unist-util-visit-parents` (v6.0.2) is already resolved under `node_modules` (transitive
via the remark/rehype stack); add it as a **direct** dependency in `package.json` since this
task imports it directly. react-markdown is **v10** and remark-gfm **v4** — v10 passes the
hast `node` to every component override, so reading `node.properties` works.

**Scope**

- Make GFM task-list checkboxes **clickable** in the **rendered** markdown of the
  `FileViewer` and in **Kanban card bodies** (view-mode render + the drag-overlay preview).
- A click toggles the **first** task marker of that list item between `[ ]` and `[x]` in the
  source and persists via the existing buffer (`setText` / `updateCard`), honoring the
  global save mode (#162).
- Add the FileViewer **save status / Save button** to its **rendered** markdown toolbar
  (previously shown only for the raw/text editor), since rendered markdown is now writable.
- Interactive visual affordance: `cursor: pointer` and a clear checked/unchecked state for
  the now-clickable checkboxes (the existing `.markdown input[type="checkbox"]` styling is
  reused; add the interactive cursor and add equivalent styling for `.cardBody`).
- A small shared module so both call sites use the **same** plugin + override + toggle
  helper (single source of truth, easy to unit-test).

**Out of scope**

- Any other in-place editing of rendered markdown (text, links, headings, list reordering).
  Only the checkbox character is mutable.
- **Large files** (`tooLarge`, > `LARGE_BYTES` in `FileViewer`): they stay raw read-only —
  no interactive checkboxes.
- The Prism **code** view, the **raw** markdown/text textarea (already editable), and any
  read-only contexts (e.g. an explicitly read-only preview) are unchanged.
- The Kanban card's **own** done-checkbox in the card header (already interactive via the
  app `Checkbox` + `toggleCard`); this task only adds **body** checkboxes.
- Choosing/normalizing the checked char beyond `x` (use lowercase `x`, matching the
  existing `- [x]` serialization and the Kanban/Obsidian convention) and any whitespace
  reflow of the source.

**Subtasks**

1. [ ] **Shared module** — create `src/components/markdownCheckboxes.tsx` (colocated, since
   it returns a react-markdown `components` map) exporting:
   - `rehypeTaskListPositions` — a rehype plugin `() => (tree) => …` that uses
     `visitParents` from `unist-util-visit-parents` to find every `element` with
     `tagName === "input"` and `properties.type === "checkbox"`, walk up its ancestor chain
     to the **nearest `li`** element that has a `position`, and stamp the input node's
     `properties` with that li's source offsets, e.g.
     `node.properties.dataSrcStart = li.position.start.offset` and `dataSrcEnd = …end.offset`.
     (Stamp on the **input** node so the override can read it; we never spread these to the
     DOM, so no invalid-attribute warnings.)
   - `toggleTaskMarker(source: string, start: number, end: number): string | null` — a pure
     helper: take `slice = source.slice(start, end)`, match the leading marker with
     `/^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/`; if no match return `null`; otherwise compute
     the absolute marker-char offset `start + m[1].length + 1`, flip it (`" "` → `"x"`;
     `"x"`/`"X"` → `" "`), and return the new full `source`. Keep it pure + exported for unit
     tests.
   - `makeCheckboxComponents(opts: { source: string; interactive: boolean; onToggle:
     (nextSource: string) => void }): Components` — returns a react-markdown `components`
     object whose **`input`** override: if it is a checkbox **and** `interactive` **and** the
     node carries valid `dataSrcStart`/`dataSrcEnd`, renders a **native enabled**
     `<input type="checkbox">` reflecting `node.properties.checked`, with `onChange`/`onClick`
     that computes `toggleTaskMarker(source, start, end)` and (if non-null) calls
     `onToggle(next)`; `onClick` should `stopPropagation()` so a click can't bubble into card
     edit/drag. Otherwise it renders the **default disabled** checkbox (preserve today's
     read-only look). Read offsets via `node?.properties` with a small typed cast
     (`Record<string, unknown>`); handle missing/`NaN` defensively (→ non-interactive).
   - Note: keep the `<ReactMarkdown>` `remarkPlugins={[remarkGfm]}` and add
     `rehypePlugins={[rehypeTaskListPositions]}` + `components={…}` at each call site.

2. [ ] **Add the direct dependency** — add `"unist-util-visit-parents": "^6.0.2"` to
   `package.json` `dependencies` (it already resolves transitively; declare it because we now
   import it). Run `npm install` so the lockfile records it.

3. [ ] **Wire up `FileViewer`** (`src/components/FileViewer/FileViewer.tsx`):
   - Compute `interactiveMarkdown = mode === "markdown" && !showRaw && !tooLarge`.
   - In the `renderMarkdown` branch, pass `rehypePlugins={[rehypeTaskListPositions]}` and
     `components={makeCheckboxComponents({ source: text, interactive: true, onToggle: setText })}`
     to `<ReactMarkdown>`. (`setText` already routes through `useAutoSaveFile`, honoring save
     mode.)
   - Memoize the `components` map (`useMemo` on `[text]`) so it isn't rebuilt every render.

4. [ ] **FileViewer toolbar in rendered mode** — rendered markdown is now writable, so its
   toolbar must surface save state. Extend the toolbar gating so the **Save button (manual)
   / "Saving…/Saved" status (auto)** block also shows for `interactiveMarkdown`, not just the
   raw/text `editable` case. Concretely: define `writable = !tooLarge && (mode === "markdown"
   || mode === "text")`; show the status/save UI when `writable` (keep the textarea gated by
   the existing `editable`). Verify the existing `showToolbar` already covers markdown
   (`(mode === "markdown" && !tooLarge) || editable`) so the Rendered/Raw segmented toggle is
   unaffected. ⌘S already works via the saver registry.

5. [ ] **Wire up `KanbanPanel`** (`src/components/Kanban/KanbanPanel.tsx`):
   - In `SortableCard`'s view-mode body render, pass
     `rehypePlugins={[rehypeTaskListPositions]}` and
     `components={makeCheckboxComponents({ source: card.body, interactive: true, onToggle:
     (body) => onBodyToggle(body) })}`. Add an `onBodyToggle: (nextBody: string) => void` prop
     to `CardProps`/`SortableCard`, wired from `BoardColumn` → `KanbanPanel` to
     `mutate(updateCard(board, col, idx, { body: nextBody }))` (mirroring `onCardToggle`).
   - `CardPreview` (the drag overlay) renders a static, non-interactive snapshot — pass
     `interactive: false` (or omit the override) so its checkboxes stay read-only.
   - No edit-mode change: in edit mode the body is a textarea, so there are no rendered
     checkboxes to click. The manual-save Save button + status already exist in the Kanban
     toolbar, so manual mode is covered.

6. [ ] **Styling** — interactive affordance:
   - `FileViewer.module.css`: in `.markdown input[type="checkbox"]`, the rule currently sets
     `cursor: default`; switch to `cursor: pointer` (checkboxes are interactive now — they
     remain disabled-styled only in non-interactive contexts, which here are limited to large
     files shown as raw, where no markdown checkbox renders). Keep the existing accent
     fill / checkmark styling.
   - `KanbanPanel.module.css`: add `.cardBody input[type="checkbox"]` styling mirroring the
     FileViewer markdown checkbox (size, accent fill, `::after` checkmark, `cursor: pointer`,
     vertical alignment) so card-body checkboxes match the app look instead of the raw browser
     default.

7. [ ] **Unit tests** — add `src/components/markdownCheckboxes.test.ts` (Vitest, pure logic)
   covering `toggleTaskMarker`: `[ ]`→`[x]`, `[x]`→`[ ]`, `[X]`→`[ ]`, ordered-list markers
   (`1. [ ]`), indented/nested items, a slice with a trailing `[link](url)` after the marker
   (flip the marker, not the link), and a non-task slice (returns `null`). If practical, a
   small DOM/render test that a rendered FileViewer markdown checkbox is **not** `disabled`
   and that clicking it calls `onToggle` with the flipped source.

8. [ ] **Verify build & checks** — `npm run build`, `npm run lint`, `npm test` all pass.

**Acceptance criteria**

- [ ] In the `FileViewer` **rendered** markdown view, task-list checkboxes are **clickable**
  (not disabled); clicking one flips `- [ ]` ⇄ `- [x]` for that item in the underlying file.
- [ ] The toggle persists: in **auto-save** mode the change is written (debounced) and
  survives reload; in **manual-save** mode the buffer goes **dirty** and the change is written
  on ⌘S / the Save button (and is flushed on close), matching raw-editor behavior (#162).
- [ ] The FileViewer **rendered** markdown toolbar shows the **Save button (manual)** or
  **Saving…/Saved status (auto)**, consistent with the raw view.
- [ ] In a **Kanban card body**, task-list checkboxes are clickable; toggling one updates that
  card's body in the `.md` (via `updateCard` → `serializeBoard`) and persists per the save
  mode. The drag-overlay preview's checkboxes are non-interactive.
- [ ] The correct checkbox toggles even with multiple/nested task items and items containing
  links or inline code; a `[ ]`-looking string inside a fenced code block is **not** treated
  as a checkbox.
- [ ] Large files (`tooLarge`) remain raw and read-only; the Prism code view and other
  read-only contexts are unchanged; no other rendered-markdown content becomes editable.
- [ ] Clickable checkboxes have a pointer cursor and a clear checked/unchecked appearance in
  both the FileViewer markdown and Kanban card bodies.
- [ ] `npm run build`, `npm run lint`, and `npm test` pass; new `toggleTaskMarker` unit tests
  pass.

**Notes**

- **User decisions (2026-06-25, refine Q&A):**
  - _Manual-save behavior:_ a rendered-markdown checkbox toggle **follows the global save
    mode** — in manual mode it marks the buffer dirty and waits for ⌘S/Save (like the raw
    editor), rather than writing immediately. (User picked "Follow save mode".)
  - _Scope:_ apply to **both** the `FileViewer` rendered markdown **and** Kanban card-body
    markdown. (User picked "FileViewer + Kanban bodies".)
- This task **reverses the #52 "task-list checkboxes are never editable" decision** for these
  two render sites; update the FileViewer CSS comment (line ~376) accordingly when
  implementing, and mention the reversal in the implementing commit / docs.
- **Approach rationale:** position-based mapping via a rehype plugin + nearest-`li` offsets is
  used deliberately over a line-index regex, because the latter mis-aligns when `[ ]`-looking
  text appears inside fenced code blocks (the parser excludes those from task items, so the
  plugin never stamps them). Offsets are relative to the exact string handed to each
  `<ReactMarkdown>` (`text` for FileViewer; the de-indented `card.body` for Kanban), so the
  flipped string can be written back directly.
- **Grounding references:** `FileViewer.tsx` (`renderMarkdown`, `editable`, `tooLarge`,
  `showToolbar`, toolbar status/save block); `useAutoSaveFile.ts` (`setText`, `dirty`,
  `manual`, `save`, save-mode #162); `KanbanPanel.tsx` (`SortableCard` body render line ~227,
  `CardPreview` line ~265, `mutate`, `updateCard`, `onCardToggle`); `kanbanOps.ts`
  (`updateCard`); `kanban.ts` (`Card = { title, body, checked }`, de-indented `body`).
  react-markdown **v10**, remark-gfm **v4**, `unist-util-visit-parents` **6.0.2** present.
- **Assumption:** the checked marker char is lowercase `x` (matches existing serialization).
  No other source normalization is performed by the toggle.

---
