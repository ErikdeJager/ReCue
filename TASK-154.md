### 154. [ ] Kanban board block in the canvas template editor

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-24

**Description**

The Canvas **template editor** (#117/#118) lets you build a reusable Canvas layout
out of inert action **blocks** that instantiate into live panels when you "use" the
template against a chosen folder. Today the placeable block kinds are **Start
session** (`new-agent`), **Open terminal** (`new-terminal`), **Open file**
(`open-file`), and **Open diff** (`open-diff`). The **Kanban board** content kind
(`kind:"kanban"`, shipped in #145/#151) is a first-class Canvas panel — it can be
dropped into a live Canvas, added from the repo **Views** menu, and shows as a
sidebar row / Overview column — **but it is missing from the template editor's
palette**. So you cannot save a template that opens a Kanban board, even though the
block registry was explicitly designed so "a new content kind becomes a block with
one entry" (`src/components/Canvas/templateBlocks.ts`).

**Goal / why:** make the Kanban board a placeable template block so a saved template
can open a repo's board (e.g. `TASKS.md` / `KANBAN.md`) in a panel, exactly the way
**Open file** opens a markdown/code file. This closes the gap between the live
content kinds and the template block set, which is the registry's whole purpose.

**Grounding (concrete files / symbols):**

- `src/components/Canvas/templateBlocks.ts` — the single-source-of-truth
  `BLOCK_REGISTRY` + `BlockKind` union + `BlockConfig` (`"prompt" | "file" |
  "none"`). `blockPlaceholderLabel` and `newBlockContent` are already generic over
  any registry entry. The `open-file` entry uses `config:"file"` /
  `liveKind:"file"`.
- `src/components/Canvas/templateInstantiate.ts` — `resolvedContent(block, cwd,
  resolved)` maps a block to its live `CanvasContent`. It has explicit cases for
  `agent`/`terminal`/`file`/`diff` and a **default** of `{ kind: liveKind, repoPath:
  cwd }` that **drops `file`** — so kanban (which needs `repoPath` **and** `file`)
  must get its own case.
- `src/store.ts` — `resolveTemplateBlock(canvasId, leafId)` (≈ line 1852) executes a
  pending block: the `liveKind === "file"` branch gates on `ipc.fileExists(cwd,
  block.file)`, builds the live content via `resolvedContent`, and calls
  `registerOverviewPanel(cwd, { id, kind:"markdown", file })` so the opened item
  shows in the left panel + Overview (#152). The trailing `else` throws "Unknown
  block". Also `pickTemplateBlockFile(canvasId, leafId, file)` (≈ line 1948)
  **hardcodes** `block: { kind: "open-file", file }` when the user picks a file via
  the error-panel "Pick file" affordance.
- `src/components/TemplateEditor/TemplateEditor.tsx` — config-driven editor: the
  palette renders `BLOCK_REGISTRY`; the per-block config UI renders a relative-path
  `<input>` when `desc?.config === "file"` (≈ line 169). No per-kind branching is
  needed for a new `config:"file"` block to appear and be configurable.
- `src/components/Canvas/TemplatePendingPanel.tsx` — the pending/error panel renders
  the **Pick file** button + `FilePicker` when `desc?.config === "file"` (≈ line 99),
  and a **Retry** button. Pick file calls `pickTemplateBlockFile`.
- `src/components/Canvas/CanvasSurface.tsx` — already renders `kind:"kanban"` panels
  (`<KanbanPanel repoPath file active />`, requires both `repoPath` **and** `file`;
  ≈ lines 63, 175). No change needed once instantiation produces correct content.
- `src/types/index.ts` — `OverviewPanel.kind` already includes `"kanban"` (line 64),
  so registering a kanban Overview panel needs no type change.
- Icon: the app already uses Lucide **`SquareKanban`** for the kanban board
  (`src/components/Sidebar/Sidebar.tsx:565,858`); reuse it for the block for visual
  consistency.

**Scope:** add an `open-kanban` block to the registry, instantiate it into a live
`kanban` panel bound to the chosen folder + relative `.md` path, surface it in the
left panel/Overview on resolution (#152), and make the existing **Pick file** /
**Retry** error-recovery flow preserve the kanban block kind. Reuse the existing
`config:"file"` editor UI and pending-panel UI — no new UI surfaces.

**Explicitly out of scope:**

- **Auto-creating a missing board `.md` at instantiation.** Like `open-file`,
  resolution stays read-only and **gated on `fileExists`**: if the board file is
  absent in the chosen folder, show the inline error + **Pick file** / **Retry**
  (never a silent write). The live Views-menu create-or-open flow (#151) is a
  separate path and is **not** added here. (Rationale in Notes.)
- `.md`-scoping the pending-panel `FilePicker` for kanban (optional polish, not
  required for this task).
- Any change to the live `kanban` content kind, the Kanban engine
  (`components/Kanban/*`), or the Views-menu kanban entry.

**Subtasks**

1. [ ] **Registry** (`templateBlocks.ts`): add `"open-kanban"` to the `BlockKind`
   union and append a `BLOCK_REGISTRY` entry `{ kind: "open-kanban", label: "Open
   Kanban board", icon: SquareKanban, config: "file", liveKind: "kanban" }` (import
   `SquareKanban` from `lucide-react`). `blockPlaceholderLabel` (`config:"file"`
   branch) and `newBlockContent` already handle it generically — confirm no other
   edit is needed there.
2. [ ] **Instantiation** (`templateInstantiate.ts`): add an explicit `case
   "kanban":` to `resolvedContent` returning `{ kind: "kanban", repoPath: cwd, file:
   block.file }` (mirrors the `file` case so the panel gets both refs the
   `KanbanPanel`/`CanvasSurface` require). Do **not** rely on the default branch (it
   drops `file`).
3. [ ] **Resolution** (`store.ts` `resolveTemplateBlock`): add a `liveKind ===
   "kanban"` branch mirroring the `"file"` branch — `await ipc.fileExists(cwd,
   block.file ?? "")`, throw `File not found: …` if absent, build `live =
   resolvedContent(block, cwd, {})`, and if `block.file` register the left-panel /
   Overview row: `registerOverviewPanel(cwd, { id: crypto.randomUUID(), kind:
   "kanban", file: block.file })` (dedups per repo+file, #152).
4. [ ] **Pick-file kind preservation** (`store.ts` `pickTemplateBlockFile`): stop
   hardcoding `kind: "open-file"`. Look up the leaf's current block kind (e.g. from
   the leaf's `content.block?.kind`, defaulting to `"open-file"`) and reuse it, so
   picking a file for a kanban block keeps it `open-kanban` (and resolves back into a
   kanban panel) rather than silently degrading to a file viewer.
5. [ ] **Editor copy (optional polish):** the shared `config:"file"` input shows
   placeholder `e.g. README.md` and a README-centric helper. Either leave as-is
   (acceptable) or make the placeholder/helper block-aware so a kanban block reads
   `e.g. TASKS.md`. Keep minimal; do not branch the whole config block per kind.
6. [ ] **Tests:**
   - `src/components/Canvas/templateBlocks.test.ts` — update the `BLOCK_REGISTRY`
     kinds `toEqual([...])` assertion to include `"open-kanban"`, and assert
     `blockDescriptor("open-kanban")?.liveKind === "kanban"` and `config === "file"`.
   - `src/components/Canvas/templateInstantiate.test.ts` — assert
     `resolvedContent({ kind:"open-kanban", file:"TASKS.md" }, cwd, {})` →
     `{ kind:"kanban", repoPath: cwd, file:"TASKS.md" }`.
   - Add/extend a store test for `pickTemplateBlockFile` preserving an `open-kanban`
     block kind, if the existing store test harness covers template resolution.
7. [ ] **Verify:** `npm run build`, `npm run lint`, `npm test` all pass. Manually
   (or via reasoning) confirm: the **Open Kanban board** chip appears in the template
   editor palette, drops into the BSP surface, takes a relative `.md` path, saves
   into the `canvas_templates` blob, and on "use" against a folder containing that
   board resolves into a live editable `KanbanPanel` + a sidebar/Overview kanban row;
   a missing path shows the inline error with working **Pick file** / **Retry**.

**Acceptance criteria**

- [ ] An **Open Kanban board** block (Lucide `SquareKanban`) appears in the template
      editor palette and can be placed/split/removed like every other block.
- [ ] Selecting the block shows the relative-path config input; the block's inline
      placeholder label reflects the configured path (e.g. "Open Kanban board:
      TASKS.md").
- [ ] A saved template containing a kanban block round-trips through the
      `canvas_templates` blob (survives reload) with its `open-kanban` kind + `file`
      intact.
- [ ] Using such a template against a folder that contains the board opens a live
      `KanbanPanel` bound to that folder + path; the board renders and is editable,
      and a deduped `kind:"kanban"` row appears in the left panel + Overview (#152).
- [ ] When the board file is absent, the panel shows the inline error + **Retry**;
      **Pick file** lets the user choose a file and the block **stays a Kanban
      board** (resolves into a `KanbanPanel`, not a `FileViewer`).
- [ ] `npm run build`, `npm run lint`, and `npm test` pass; `templateBlocks.test.ts`
      asserts the new `open-kanban` entry.

**Notes**

- **Assumption — block kind name:** `open-kanban`, mirroring `open-file`'s
  `open-*` naming and reusing `config:"file"`.
- **Assumption — read-only, gated resolution (not create-or-open):** the live
  Views-menu kanban entry offers an in-picker create-or-open flow (#151), but
  template-block resolution for `open-file`/`open-diff` is deliberately read-only and
  gated (`fileExists` / `isGitRepo`) with a **Pick file** / **Retry** escape hatch
  and **no silent file writes** at instantiation. To stay consistent and avoid an
  unexpected write into a freshly-chosen folder, the kanban block follows the same
  read-only/gated pattern; auto-creating a missing board is left as a possible
  follow-up.
- **`pickTemplateBlockFile` bug:** it currently hardcodes the block kind to
  `open-file`. Without subtask 4 the **Pick file** recovery on a kanban block would
  silently convert it to a file viewer — so this fix is required, not optional, for
  the Pick-file acceptance criterion.
- **Task numbering:** highest existing task number is **#153** (from
  `TASK_ARCHIVE.md`; the board's READY/DONE are empty and there are no `TASK-*.md`
  plan files yet). The `#111113` / `#141416` tokens in `TASK_ARCHIVE.md` are hex
  colors in the design reference, not task numbers. Hence **#154**.
- **Dependencies:** none — this builds entirely on already-shipped code: the template
  block system (#117/#118), the kanban content kind + Views entry (#145/#151), and
  the left-panel-as-source-of-truth Overview registration (#152).
- **References:** `CLAUDE.md` (Canvas templates #117/#118; File editing & Kanban
  board #141–#151; left panel #152), the files listed under Grounding above.
