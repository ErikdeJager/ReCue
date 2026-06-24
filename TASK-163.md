### 163. [x] File viewer "Browse…": open any file from the filesystem via the native picker

**Status:** Done
**Depends on:** none
**Created:** 2026-06-24

**Description**

The file-viewer's filename dropdown (the `FileSwitcher`, #90) only lists files **inside
the current repo**. The card: "For the file viewer (and perhaps other file drop down
menus) there should be the option to select other options. This would open a file
picker (browse in finder) to find a file. Meaning that the file can be anywhere in the
file system and it would still get picked up."

**Goal / why:** add a **"Browse…"** option to the file-viewer dropdown that opens the
**native macOS open-file dialog**, so the user can open *any* file on disk — not just
repo files — and have it render (and edit) in the viewer.

**Key design — reuse the `(repoPath, relative file)` model, no security change.** The
viewer addresses a file as `{ repoPath, file }` and reads/writes it through
`files.rs::read_text_file` / `write_text_file`, which validate that
`repoPath.join(file).canonicalize()` stays **inside** `repoPath` (rejecting `..` /
symlink / out-of-repo escapes). An arbitrary absolute file `/a/b/c.md` can therefore be
represented as **`{ repoPath: "/a/b", file: "c.md" }`** — its own parent directory as
the "root." That trivially passes the existing validation (a bare basename can't escape
its parent), so **no backend confinement relaxation is required**; the existing
read/write/`file_exists` and the `useAutoSaveFile` editing path all work unchanged. The
**native open dialog is the user's explicit consent** to open that specific file.

**Grounding (concrete files / symbols):**

- `src/components/FileSwitcher/FileSwitcher.tsx` — the dropdown: a trigger
  (basename + caret) → a popover containing `<FilePicker files={listFiles(repoPath)}
  onPick={…} />`. `onPick(file)` hands back a **repo-relative** path; the host keeps the
  same `repoPath`. (Used by the Canvas file-panel header and the Overview file-column
  header.)
- `src/ipc.ts` — already imports `open` from `@tauri-apps/plugin-dialog` and calls
  `open({ directory: true })` for the folder picker (`pickFolder`, ≈ line 31). File
  mode is `open({ directory: false, multiple: false })`. The `dialog:default`
  capability is already granted (`src-tauri/capabilities/default.json`).
- `src-tauri/src/files.rs` — `read_text_file`/`write_text_file`/`file_exists` validate
  containment via `canonicalize().starts_with(canon_repo)` (≈ lines 84-160). **No change
  needed** — `{ parentDir, basename }` passes.
- `src/useAutoSaveFile.ts` + `FileViewer` — read/render/edit via `(repoPath, file)`;
  mode (markdown/code/text) is keyed off the file's extension (basename), so an absolute
  file renders the same. Kanban (`KanbanPanel`) likewise.
- Host content update: `CanvasSurface` file header calls `setLeafFile(leaf.id, f)`
  (keeps repoPath); the Overview file column updates its panel's `file`. To open an
  out-of-repo file, the host must also set the content's **`repoPath`** to the file's
  parent dir.

**Scope:** a "Browse…" entry in the file-viewer `FileSwitcher` that opens the native
file dialog and opens the chosen absolute file in the viewer (Canvas file panel +
Overview file column), reusing the existing read/write/edit path via the
`{ parentDir, basename }` representation.

**Explicitly out of scope:**

- Relaxing `files.rs` repo confinement (unnecessary — see design).
- Adding "Browse…" to the **other** repo-scoped pickers (the repo **Views** menu's
  add-file/kanban, the template **pick-file**, the kanban create-or-open) — those carry
  repo semantics; the card says "perhaps," so leave them for a follow-up.
- A custom in-app filesystem browser (use the native dialog).
- Binary / oversized files — the existing read cap (5 MB) + text-only handling +
  "large file" notice apply as-is.

**Subtasks**

1. [ ] **ipc:** add `pickFile(): Promise<string | null>` wrapping
   `open({ directory: false, multiple: false, title: "Open file" })` (mirroring
   `pickFolder`), returning the absolute path or null. (Reuses the already-granted
   `dialog:default` capability.)
2. [ ] **Path util:** a small pure helper to split an absolute path into
   `{ dir, base }` (e.g. in `paths.ts`), unit-tested (handle nested paths and a file at
   filesystem root).
3. [ ] **FileSwitcher "Browse…":** add a distinct **Browse…** affordance in the popover
   (e.g. a footer button beneath the `FilePicker` list). On click: close the popover,
   `await pickFile()`; if a path returns, split it and call a new prop
   `onPickAbsolute(repoPath /* = dir */, file /* = base */)`.
4. [ ] **FileSwitcher props:** add `onPickAbsolute?: (repoPath: string, file: string)
   => void` alongside the existing repo-relative `onPick`.
5. [ ] **Host wiring — Canvas:** in `CanvasSurface`, pass `onPickAbsolute` that updates
   the file leaf's content `repoPath` **and** `file` (add a store action, e.g.
   `setLeafFileAbsolute(leafId, repoPath, file)`, or extend `setLeafFile` to take an
   optional repoPath). The pooled/rendered FileViewer then reads the new path.
6. [ ] **Host wiring — Overview:** in `Overview`, pass `onPickAbsolute` that updates the
   file column's panel `repoPath` + `file` (via the overview-panel update path). Accept
   that the column then groups under a repo group named for the file's directory
   (documented consequence — see Notes); dedupe by repo+file as today.
7. [ ] **Verify the read/edit path** works for an out-of-repo file: `read_text_file`,
   `write_text_file`, and `file_exists` succeed for `{ parentDir, basename }` (add a Rust
   unit test reading a file via its own parent dir as `repo`). No `files.rs` logic
   change.
8. [ ] **Persistence:** confirm an opened absolute file (stored as `repoPath` +
   `file` in `canvases` / `overview_panels`) survives reload and re-opens by absolute
   path.
9. [ ] **Docs:** update `CLAUDE.md` (the file-access scope note) — file access is now
   "any file the user explicitly picks via the native dialog," still path-confined per
   read/write to the file's own directory (consistent with how #74/#124/#141 narrowed
   earlier 'never' rules).
10. [ ] **Verify:** `npm run build`, `npm run lint`, `npm test`, `cargo test`. Manual:
    open the file-viewer dropdown → **Browse…** → pick a file **outside** the repo → it
    renders by type (markdown/code/text) and is editable (raw / kanban) via the normal
    save path; reload → it re-opens.

**Acceptance criteria**

- [ ] The file-viewer filename dropdown has a **Browse…** option that opens the native
      macOS open-file dialog.
- [ ] Selecting a file **anywhere** on disk opens it in the viewer, rendered by type
      and editable through the existing save path (auto-save / and the #162 manual mode
      if present).
- [ ] The opened out-of-repo file persists and re-opens on restart.
- [ ] `files.rs` repo-confinement logic is **unchanged**; each read/write remains
      confined to the chosen file's own directory.
- [ ] `npm run build`, `npm run lint`, `npm test`, `cargo test` pass.

**Notes**

- **Core trick:** represent `/a/b/c.md` as `{ repoPath: "/a/b", file: "c.md" }`. The
  existing validation (`repoPath.join(file)` must canonicalize inside `repoPath`) passes
  for a bare basename, so reads/writes stay confined and **no backend change is needed**.
  The native dialog is the user's explicit consent to open that file.
- **Grouping consequence:** an out-of-repo file opened as an **Overview/sidebar** item
  groups under a repo group named for its parent directory (grouping is by
  `effectiveRepo(repoPath)`, #36/#96). In a **Canvas** panel there's no grouping, so it's
  seamless there. Acceptable and expected; documented so it isn't a surprise.
- **"Other dropdowns":** the card hedges ("perhaps"). The Browse affordance lives in the
  file-viewer `FileSwitcher`; extending it to the repo-scoped pickers is a follow-up
  (those add files *to a repo's* panel list, where an out-of-repo path is murkier).
- **Coordination (not dependencies):** #157 (Big mode — extracts a shared `ItemContent`
  / edits `CanvasSurface`) and #158 (FileViewer toolbar) touch nearby code; rebase
  carefully but there's no ordering dependency. #162 (manual save) composes — an
  out-of-repo file saves through the same `useAutoSaveFile` path and honors the mode.
- **Task numbering:** highest existing is #162 (TASK-154…162.md; board #156–#162;
  `TASK_ARCHIVE.md` ≤ #153). Hence #163.
- **Dependencies:** none.
- **References:** `FileSwitcher/FileSwitcher.tsx`, `ipc.ts` (`pickFolder` ≈ 31, dialog
  `open`), `files.rs` (`read_text_file`/`write_text_file`/`file_exists` ≈ 84-160),
  `useAutoSaveFile.ts`, `FileViewer/FileViewer.tsx`, `CanvasSurface.tsx`
  (`setLeafFile`), `Overview/Overview.tsx` (file column), `paths.ts` (`effectiveRepo`),
  `capabilities/default.json` (`dialog:default`).

**Implementation note (done 2026-06-24)**

Shipped exactly to the no-backend-change design:
- **ipc** `pickFile()` wraps the native `open({directory:false})` dialog → absolute
  path or null (reuses the granted `dialog:default` capability).
- **`splitPath(abs)`** in `paths.ts` → `{dir, base}` (handles nested, fs-root
  `/c.md` → `{dir:"/",base}`, and bare-name cases); unit-tested (`paths.test.ts`).
- **FileSwitcher** gains an optional `onPickAbsolute(repoPath, file)` prop and a
  **Browse…** footer button (shown only when the prop is passed) that opens the
  dialog, splits the path, and calls it. `/a/b/c.md` → `{repoPath:"/a/b",
  file:"c.md"}`, so the existing repo-confined read/write validates against the
  file's own directory — no `files.rs` change.
- **Host wiring:** Canvas → new `setLeafFileAbsolute(leafId, repoPath, file)` (sets
  both refs on the leaf); Overview → new `moveOverviewPanelToFile(repoPath, panelId,
  newRepo, file)` which **moves** the panel to the file's parent-dir repo key
  (dedup by repo+file; same-repo falls back to `setOverviewPanelFile`). Both persist
  via the standard `canvases` / `overview_panels` blobs → survive reload.
- **Rust:** added `reads_and_writes_an_out_of_repo_file_via_its_parent_dir` to
  `files.rs` tests confirming the `{parentDir, basename}` representation reads/writes
  with no confinement change. Repo-confinement logic untouched.
- **Docs:** updated the CLAUDE.md file-access scope note (Browse… / out-of-repo
  open, still dir-confined; Overview grouping consequence).
- Out of scope (left for follow-up, per the card's "perhaps"): Browse… in the
  repo-scoped Views/template/kanban pickers. Composes with #162 (manual save) — an
  out-of-repo file saves through the same `useAutoSaveFile` path.
- `npm run build`, `npm run lint`, `npm test` (212, +3), `npm run format:check`,
  `cargo test`, and `cargo clippy` all pass. Subtask 10 manual walk-through is
  interactive; the read/write path is covered by the Rust test + the design.
