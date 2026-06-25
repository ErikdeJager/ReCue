# TASK-167

### 1. [x] File tree viewer — a collapsible repo file tree as a first-class view type

**Status:** Done · _(Not started | In progress | Done)_
**Depends on:** none
**Created:** 2026-06-25

**Description**

Add a **File tree viewer**: a component that shows a collapsible tree of a
repository's files, where the user can expand/collapse folders, click a file to open
it, and right-click a file for actions (open in file viewer, open as Kanban board,
reveal in Finder, copy path).

Per the user's decisions (see **Notes**), the file tree is a **new first-class view
type** — exactly like the existing Diff / Terminal / Kanban / File viewer panels. It is
**repo-scoped** (one tree per repo, like the diff panel), opened from the repo's
right-click **Views** menu, and rendered identically in all three surfaces the app
already supports for a view: a **sidebar row**, an **Overview column**, and a **Canvas
panel** (plus a Canvas-template block). It reuses the existing flat `list_files`
backend command and builds the tree **client-side** — **no backend change**.

This is the idiomatic way to add a view in this codebase: every view is a content
`kind` registered as an `OverviewPanel` (a sidebar row + Overview column, persisted in
`overview_panels`), draggable into Canvas, resolved by the shared `ItemContent`
renderer, added via the shared `ViewsMenu`, and exposed as a Canvas-template block via
the `templateBlocks` registry. The closest existing analog to copy is the **diff**
panel (`kind: "diff"`): repo-scoped, no `file`, deduped one-per-repo. Follow the diff
panel everywhere unless noted, with the **content** rendering coming from a new
`FileTree` component instead of `DiffInspector`.

**Background — the data source (decided: reuse flat `list_files`).** The backend
`list_files(repo)` Tauri command (`src-tauri/src/files.rs` → `commands.rs` →
`ipc.ts listFiles`) returns a **flat, sorted list of repo-relative paths** (e.g.
`["README.md", "src/store.ts", "src/components/Sidebar/Sidebar.tsx"]`). It already
excludes hidden dirs (`.git`/`.github`/`.claude`), heavy/vendored dirs
(`node_modules`/`target`/`dist`/…), and binary files, and is **capped at 500 files /
depth 8**. The tree is built by grouping these paths client-side. Consequences the
implementer must accept (they are **in scope as the chosen behavior**, not bugs): empty
folders, binary-only folders, hidden dirs, and anything past the 500/depth-8 cap won't
appear; this matches what the existing `FilePicker` shows.

**Scope (in scope):**

- A new content kind `"filetree"` threaded through the type unions, the
  panel↔content mapping, the sidebar, Overview, Canvas drop, and templates.
- A new `FileTree` component that loads `listFiles(repoPath)`, builds a nested tree,
  renders expand/collapse folders + file leaves, handles file **click → open in file
  viewer**, **folder click → expand/collapse**, and a **right-click file context
  menu** (Open in file viewer / Open as Kanban board (.md only) / Reveal in Finder /
  Copy path).
- A pure, unit-tested tree-building helper.
- A "File tree" entry in the repo **Views** menu and an "Open file tree" Canvas
  template block.

**Out of scope (explicit):**

- **No backend change.** Do **not** add a `list_dir` / lazy per-directory command; do
  **not** alter `files.rs`. Reuse `list_files` as-is.
- **No** showing of binary/hidden files or empty folders (a consequence of reusing the
  filtered flat list — accepted).
- **No folder context menu** and no folder-level actions — folders only
  expand/collapse on click.
- **No persistence of expansion state** — which folders are open lives in component
  local state and resets when the panel remounts.
- **No live hot-reload** of the file list as the working tree changes on disk — the
  tree loads on mount. (An optional manual "refresh" affordance is allowed but not
  required; see Subtasks.)
- **No per-file drag** out of the tree into Canvas. The **panel as a whole** is
  draggable (via its sidebar row, like every other view); dragging an individual file
  *node* from inside the tree is out of scope.
- **No** file create/rename/delete/move from the tree.

**Subtasks**

1. [ ] **Type unions.** Add `"filetree"` to:
   - `OverviewPanel["kind"]` in `src/types/index.ts` (currently
     `"diff" | "markdown" | "terminal" | "kanban"`).
   - `SidebarItem["kind"]` in `src/store.ts` (~line 343).
   - (`CanvasContent.kind` is already a plain `string` — no change, but the new live
     kind is `"filetree"` with a `repoPath` and no `file`.)
2. [ ] **Pure tree builder.** Create `src/components/FileTree/fileTree.ts` exporting a
   pure `buildFileTree(paths: string[]): FileTreeNode[]` that turns the flat
   repo-relative path list into a nested structure of folder nodes (with `children`)
   and file leaf nodes. Sort folders-before-files, each alphabetically. Add
   `src/components/FileTree/fileTree.test.ts` (Vitest) covering: nesting, mixed
   files/folders at a level, folder-before-file ordering, deep paths, and an empty
   list. (The repo's `npm test` runs pure-logic unit tests — keep all logic here pure
   and tested.)
3. [ ] **`FileTree` component.** Create `src/components/FileTree/FileTree.tsx` (+
   `FileTree.module.css`) with props `{ repoPath: string }`:
   - On mount, `void listFiles(repoPath)` (from `../../ipc`) → `buildFileTree(...)`;
     show a "Loading…" state while null and an empty state ("No files in this repo.")
     when empty. (Optional: a small refresh button that re-calls `listFiles`.)
   - Render the tree recursively. **Folders:** a Lucide chevron (`ChevronRight` when
     collapsed / `ChevronDown` when expanded) + a `Folder`/`FolderOpen` icon + name;
     clicking the row toggles its expanded state (kept in component local state, e.g.
     a `Set<string>` of expanded folder paths). **Files:** a `FileText` icon + name;
     clicking the row opens it in the file viewer via
     `addOverviewPanel(repoPath, "markdown", relPath)` (from the store).
   - **Right-click a file** opens a cursor-positioned context menu (reuse the
     `RowContextMenu` pattern from `Sidebar.tsx:76` — either lift/share it or
     re-implement the same small overlay+menu) with these items, all closing the menu
     on activate:
     - **Open in file viewer** → `addOverviewPanel(repoPath, "markdown", relPath)`.
     - **Open as Kanban board** → `addOverviewPanel(repoPath, "kanban", relPath)`;
       **only render this item when `relPath` ends with `.md`** (Kanban is `.md`-scoped,
       matching #142/#151).
     - **Reveal in Finder** → `revealPath(absPath)` where
       `absPath = `${repoPath}/${relPath}`` (from `../../ipc`, like the worktree
       header at `Sidebar.tsx:842`).
     - **Copy path** → `copyToClipboard(absPath, "path")` (store action, like
       `Sidebar.tsx:853`/`1446` — copy the **absolute** path, matching the worktree
       "Copy absolute path" precedent).
   - Folders get **no** context menu.
   - Use on-system design tokens + Lucide icons only (match `FilePicker`/`Sidebar`
     styling: compact rows, mono where appropriate, hover states).
4. [ ] **Render in `ItemContent`.** In
   `src/components/ItemContent/ItemContent.tsx`, add a branch:
   `if (content.kind === "filetree" && content.repoPath) return <FileTree repoPath={content.repoPath} />;`
   (No ownership/PTY guard needed — it's stateless repo data, like diff.)
5. [ ] **Panel ↔ content mapping (`canvasDrop.ts`).** In
   `src/components/Canvas/canvasDrop.ts`:
   - `overviewPanelToContent` (line 42): map `panel.kind === "filetree"` →
     `{ kind: "filetree", repoPath: repo }`.
   - `payloadToContent` (line 99): map `data.kind === "filetree"` →
     `{ kind: "filetree", repoPath }`.
   - `sameItem` dedupe (lines ~132–161): add a `filetree` case matching by
     `repoPath` (one filetree per tab, like diff).
   - the content→label helper near lines 24–51: add a `filetree` label ("File tree").
   - Extend `src/components/Canvas/canvasDrop.test.ts` with filetree cases for
     `overviewPanelToContent` and `payloadToContent` (mirror the existing diff tests).
6. [ ] **Store wiring (`store.ts`).**
   - `panelLabel` (`store.ts:85`): add `kind === "filetree"` → `"File tree"`.
   - `addOverviewPanel` dedupe (`store.ts:1562`): treat `"filetree"` like `"diff"` —
     one per repo (`current.some((p) => p.kind === "filetree")`).
   - `matchesCanvasItem` (`store.ts:350`): add a `filetree` case matching
     `content.kind === "filetree" && content.repoPath === item.repoPath` (like diff).
   - `resolveTemplateBlock` (`store.ts:1971`): add a `liveKind === "filetree"` branch
     that resolves the pending leaf to `{ kind: "filetree", repoPath: cwd }`
     immediately (no spawn/file — copy the `diff` branch). Confirm
     `src/components/Canvas/templateInstantiate.ts` (line ~73–88) already produces
     `{ kind: liveKind, repoPath: cwd }` for this kind, or add a case.
7. [ ] **Views menu entry.** In `src/components/ViewsMenu/ViewsMenu.tsx`, add a
   `"File tree"` item (Lucide `FolderTree` icon) to the `items` array whose `run` calls
   `void addOverviewPanel(repoPath, "filetree"); onClose();` — mirror the existing
   `diff`/`terminal` items (immediate, no FilePicker step). This makes it appear in
   **both** the repo context menu and the worktree-badge popover (#164 — they share
   `ViewsMenu`).
8. [ ] **Sidebar row.** In `src/components/Sidebar/Sidebar.tsx`:
   - Add a `FileTreeRow` component mirroring `DiffRow` (`Sidebar.tsx:598`): a dnd-kit
     `useDraggable` with id `filetree:${repoPath}` and data
     `{ kind: "filetree", repoPath }`, a `FolderTree` (Lucide) icon + "File tree"
     label, click → its `onOpen`, × → its `onClose`, right-click → a single danger
     **Remove** `RowContextMenu` item.
   - In `renderPanelRows` (`Sidebar.tsx:1014`), add a `panel.kind === "filetree"`
     branch rendering `FileTreeRow` with `onOpen` →
     `selectItem({ kind: "filetree", id: panel.id, repoPath: repoKey })` and `onClose`
     → `removeOverviewPanel(repoKey, panel.id)` (copy the diff branch at 1016–1026).
   - Import `FolderTree` from `lucide-react`.
9. [ ] **Overview label.** In `src/components/Overview/Overview.tsx`, add
   `if (panel.kind === "filetree") return "File tree";` to its local `panelLabel`
   (line 269). The column **body** already renders through
   `overviewPanelToContent` + `ItemContent`, so it works once steps 4–5 land; verify
   the header shows "File tree" and the close/maximize actions behave like the diff
   column.
10. [ ] **Canvas template block.** In `src/components/Canvas/templateBlocks.ts`, add a
    registry entry: `{ kind: "open-filetree", label: "Open file tree", icon: FolderTree, config: "none", liveKind: "filetree" }`, and add `"open-filetree"` to the
    `BlockKind` union. Import `FolderTree`. This makes it a palette chip in the
    Template editor and instantiable via step 6's `resolveTemplateBlock` branch.
11. [ ] **Verify & polish.** Run the full check suite (see Acceptance criteria) and
    manually exercise the flows in `npm run tauri dev`.

**Acceptance criteria**

- [ ] The repo right-click **Views** menu (and the worktree-badge popover) shows a
  **"File tree"** entry. Choosing it adds a file-tree view: a sidebar row appears under
  the repo and an Overview column appears, with toast "Opened File tree". Choosing it
  again toasts "Already open" (one per repo).
- [ ] The file-tree panel renders a **collapsible tree** built from `list_files`:
  folders expand/collapse on click (chevron + folder icon flip), file leaves render
  with a file icon. Nesting is correct and folders sort before files.
- [ ] **Clicking a file** opens it in the file viewer (a new markdown panel / sidebar
  row appears for that file).
- [ ] **Right-clicking a file** opens a menu with **Open in file viewer**, **Open as
  Kanban board** (shown **only** for `.md` files), **Reveal in Finder**, **Copy path** —
  each performing its action. Folders show **no** context menu.
- [ ] The file-tree **sidebar row** is draggable into a **Canvas** panel and renders
  the same tree; it is deduped one-per-tab; clicking the row selects/jumps to it (#79)
  without switching the main view.
- [ ] A Canvas **template** "Open file tree" block can be placed in the Template editor
  and, when the template is instantiated against a folder, produces a working file-tree
  panel.
- [ ] `buildFileTree` is covered by passing Vitest unit tests; `canvasDrop.test.ts` is
  extended for the filetree mapping.
- [ ] All green: `npm run build`, `npm run lint`, `npm test`,
  `npm run format:check`, and `cargo test --manifest-path src-tauri/Cargo.toml`
  (no backend change, but it must still pass).

**Notes**

- **User decisions (refine Q&A, 2026-06-25):**
  1. **Surface →** a **new "File tree" view type** (content kind), opened from the repo
     **Views** menu, rendered as a sidebar row + Overview column + Canvas panel (+
     template block) — consistent with Diff/Terminal/Kanban and independent of the
     separate "left panel collapse" Refine card.
  2. **Data source →** **reuse the flat `list_files`** and build the tree client-side
     (no backend change). The implementer accepts its filtering as the behavior:
     excludes hidden dirs (`.git`/`.github`/`.claude`), heavy dirs
     (`node_modules`/`target`/`dist`), and binary files; capped at 500 files / depth 8;
     empty or binary-only folders won't appear.
  3. **Actions →** **full set + click-to-open**: single-click a file opens it in the
     file viewer; folder click toggles expand/collapse; right-click a file →
     Open in file viewer / Open as Kanban board (.md only) / Reveal in Finder /
     Copy path; folders have no menu. All opens use the existing `addOverviewPanel`
     flow (no main-view switch, #79).
- **Reference symbols** (closest analog is the **diff** panel — copy it, swapping the
  rendered content for `<FileTree>`):
  - `src/components/Canvas/canvasDrop.ts` — `overviewPanelToContent` (42),
    `payloadToContent` (99), `sameItem` (132+); `canvasDrop.test.ts`.
  - `src/components/ItemContent/ItemContent.tsx` — content-kind render switch.
  - `src/components/ViewsMenu/ViewsMenu.tsx` — addable view set (#82/#164).
  - `src/components/Sidebar/Sidebar.tsx` — `DiffRow` (598), `renderPanelRows` (1014),
    `RowContextMenu` (76), `revealPath`/`copyToClipboard` usage (842/853).
  - `src/components/Overview/Overview.tsx` — `panelLabel` (269), `ExtraPanel` (286).
  - `src/store.ts` — `panelLabel` (85), `addOverviewPanel` (1558), `SidebarItem`
    (341), `matchesCanvasItem` (350), `resolveTemplateBlock` (1971),
    `copyToClipboard` (2751).
  - `src/components/Canvas/templateBlocks.ts` — `BLOCK_REGISTRY` (#117).
  - `src/components/FilePicker/FilePicker.tsx` — styling/keyboard reference for the new
    tree component.
- **Lucide icons** to import: `FolderTree` (the view's marker), `Folder`/`FolderOpen`,
  `ChevronRight`/`ChevronDown`, `FileText`. All already used elsewhere in the app.
- **Why no separate prerequisite task:** the only other open item is the "left panel
  collapse" Refine card, which produces nothing this needs; the data source is the
  already-shipped `list_files`. Hence `Depends on: none`.

- **Implementation notes (2026-06-25):** All subtasks shipped. One filename deviation
  from the plan: the pure helper was created as `buildFileTree.ts` (not `fileTree.ts`)
  because `fileTree.ts` and the component `FileTree.tsx` differ only in case, which
  collides on macOS's case-insensitive filesystem (TS `TS1261`/`TS1192`). The export
  surface (`buildFileTree` + `FileTreeNode`) and behavior are unchanged; the test is
  `buildFileTree.test.ts`. The `FileTree` component reimplements the small
  cursor-positioned context menu inline (with a local `menu-in` keyframe, since CSS
  Modules scope `@keyframes`) rather than lifting `RowContextMenu` out of `Sidebar.tsx`.
  An optional manual **refresh** button is included (re-calls `list_files`). The
  `canvasDrop.ts` "content→label helper" referenced in the plan doesn't exist in the
  current file (diff/filetree carry no `label`), so that sub-bullet was a no-op — the
  filetree mapping matches diff everywhere (no label), and big-mode/dedupe match by
  `repoPath`. All checks green: `npm run build` / `npm test` (220) / `npm run lint` /
  `npm run format:check` / `cargo test` (72).
