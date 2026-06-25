# TASK-171

### 1. [x] Copy path / Reveal in Finder on sidebar file & Kanban rows

**Status:** Done · _(Not started | In progress | Done)_
**Depends on:** none
**Created:** 2026-06-25

**Description**

**Goal.** Give the left-panel (sidebar) **file** rows a richer right-click context
menu. Today a file-viewer row's context menu has only a single red **Remove** item
(`RowContextMenu`, #132). The user wants to also be able to **copy the file's absolute
path**, **copy its relative path**, and **reveal the file in Finder** — the same kind of
utilities the repo menu (#130) and worktree header (#133) already offer for folders.

**Where.** Two sidebar row types are real files on disk and get the new items (per the
user's decision, see Notes):

- **`FileRow`** (`src/components/Sidebar/Sidebar.tsx` ~line 464) — a file-viewer panel
  item. Props: `repoPath` (the folder root) + `file` (the **repo-relative** path).
- **`KanbanRow`** (`Sidebar.tsx` ~line 533) — a `.md` Kanban-board panel item, same
  `repoPath` + `file` shape.

Both build their menu through the shared **`RowContextMenu`** (`Sidebar.tsx` ~line 76),
which already renders an array of `RowMenuItem` (`{ label, onActivate, danger? }`) and
supports a mix of neutral + danger items (the worktree header uses it that way, ~line 720).

**Path semantics.** For a row, the **absolute path** is `repoPath` joined with `file`
(strip any trailing slash on `repoPath`, then `"/" + file`); the **relative path** is
`file` verbatim. Note the #163 nuance: an out-of-repo file opened via *Browse…* is stored
as `{ repoPath: "<its parent dir>", file: "<name>" }`, so "relative path" is relative to
that parent dir — which is the correct, well-defined meaning in both cases.

**Reveal in Finder (files differ from folders).** The existing `reveal_path` command
(`src-tauri/src/commands.rs` ~line 986) runs `open <path>`, which is right for a **folder**
but for a **file** would launch it in its default app — not reveal it. Per the user's
decision, file reveal must **select the file in Finder** via `open -R <abspath>`. Since
`reveal_path` is deliberately `open`-only (its doc-comment notes "not `open -R`", #129),
add a **separate** small command `reveal_file_in_finder(path)` that runs `open -R <path>`
(same no-shell safety: `Command::new("open").arg("-R").arg(&path)`).

This is a small frontend change (three menu items on two rows, ideally via one shared
helper) plus one thin backend command + its IPC wrapper.

**Scope (in scope):**

- A new Rust command `reveal_file_in_finder(path: String) -> Result<(), SessionError>`
  (`open -R`), registered in `lib.rs`'s `invoke_handler!` next to `reveal_path`, and an
  `ipc.ts` wrapper `revealFileInFinder`.
- Three new **neutral** menu items — **Reveal in Finder**, **Copy absolute path**,
  **Copy relative path** — added (before the existing red **Remove**) to **`FileRow`** and
  **`KanbanRow`**, ideally via a shared `RowMenuItem[]`-building helper to avoid
  duplication.
- Reuse the store's existing `copyToClipboard(text, "path")` (`store.ts` ~line 2751) for
  the two copy actions (it already shows the standard "Copied path" toast).

**Out of scope (explicit):**

- **No** change to `reveal_path` itself or to the **repo menu** (#130) / **worktree
  header** (#133) reveal/copy items (folders keep `open <path>`).
- **No** new menu items on **DiffRow** (a diff is not a single file path) or
  **ShellTerminalRow** / **ScheduleRow** (not files) — they keep their existing single
  item.
- **No** Canvas/Overview panel-header menu changes — the card is about the **left panel**
  only.
- **No** path validation/security change: the paths come from the app's own panel data
  (not free-text) and `open`/`open -R` run **without a shell**, matching the `reveal_path`
  / `open_url` precedent. (The #167 file-tree viewer builds its own separate file context
  menu — not this task; see Notes.)
- **No** capabilities change — app commands aren't individually listed in
  `capabilities/default.json` (only `core:default` / `dialog:default`), so registering in
  `invoke_handler!` is sufficient (same as `reveal_path`).

**Subtasks**

1. [ ] **Backend command** (`src-tauri/src/commands.rs`): add `reveal_file_in_finder`
   mirroring `reveal_path` (~line 986) but with `.arg("-R")` before the path; doc-comment
   it as the file-reveal counterpart (#171). Register `commands::reveal_file_in_finder` in
   `src-tauri/src/lib.rs`'s `invoke_handler!` list right after `commands::reveal_path`
   (~line 200).
2. [ ] **IPC wrapper** (`src/ipc.ts`): next to `revealPath` (~line 306) add
   `export const revealFileInFinder = (path: string) => invoke<void>("reveal_file_in_finder", { path });`
   with a short doc comment.
3. [ ] **Shared menu-items helper** (in `Sidebar.tsx`, near `RowContextMenu`): add a small
   function, e.g.
   `function filePathMenuItems(repoPath: string, file: string, copyToClipboard, onRemove): RowMenuItem[]`
   returning, in order:
   - `{ label: "Reveal in Finder", onActivate: () => void revealFileInFinder(absOf(repoPath, file)) }`
   - `{ label: "Copy absolute path", onActivate: () => void copyToClipboard(absOf(repoPath, file), "path") }`
   - `{ label: "Copy relative path", onActivate: () => void copyToClipboard(file, "path") }`
   - `{ label: "Remove", onActivate: onRemove, danger: true }`
   …where `absOf(repoPath, file) = `${repoPath.replace(/\/+$/, "")}/${file}``. (Importing
   `revealFileInFinder` from `../../ipc`, alongside the existing `revealPath` import at
   ~line 25.)
4. [ ] **Wire `FileRow`** (~line 507): replace its single-item `items={[{ label: "Remove",
   … }]}` with `items={filePathMenuItems(repoPath, file, copyToClipboard, onClose)}`. Pull
   `copyToClipboard` from the store inside `FileRow` (`const copyToClipboard =
   useStore((s) => s.copyToClipboard);`, like `SessionRow`/`WorktreeHeader` do).
5. [ ] **Wire `KanbanRow`** (~line 582): same change, passing its `repoPath`/`file`/`onClose`.
6. [ ] **Verify.** Run the check suite (see Acceptance criteria), then in `npm run tauri
   dev`: open a repo file panel and a Kanban board panel, right-click each row →
   confirm the four items; "Copy absolute path" puts `<repo>/<file>` on the clipboard,
   "Copy relative path" puts `<file>`, both show the "Copied path" toast; "Reveal in
   Finder" opens Finder with the file **selected**; "Remove" still removes the panel.

**Acceptance criteria**

- [ ] Right-clicking a **file-viewer row** and a **Kanban-board row** in the sidebar shows
  **Reveal in Finder**, **Copy absolute path**, **Copy relative path**, and **Remove**
  (Remove still red/last).
- [ ] **Copy absolute path** copies `repoPath/file` (no double slash); **Copy relative
  path** copies `file`; both trigger the existing copy toast.
- [ ] **Reveal in Finder** opens Finder with the file **highlighted/selected** (`open -R`),
  not the file launched in its default app, and not just the bare folder.
- [ ] **DiffRow**, **ShellTerminalRow**, and **ScheduleRow** menus are **unchanged**; the
  repo menu (#130) and worktree header (#133) reveal/copy items are **unchanged**.
- [ ] The new behavior needs **no** capabilities edit; `reveal_path` is untouched.
- [ ] All green: `npm run build`, `npm run lint`, `npm test`, `npm run format:check`,
  `cargo test --manifest-path src-tauri/Cargo.toml`, `npm run lint:rust`,
  `npm run format:rust`.

**Notes**

- **User decisions (refine Q&A, 2026-06-25):**
  1. **Reveal in Finder for a file → `open -R <abspath>`** (reveal/select the file in its
     folder), chosen over opening the containing folder or launching the file in its app.
     This intentionally differs from the folder reveal (#129/#133, plain `open`), hence the
     **new** `reveal_file_in_finder` command rather than reusing `reveal_path`.
  2. **Scope → both `FileRow` and `KanbanRow`** (both are real files with `repoPath` +
     relative `file`). Diff/terminal/schedule rows are excluded (not single files).
- **Relative path is `file` verbatim** — repo-relative for normal repo files, and (per
  #163) relative to the Browse'd file's own parent dir for out-of-repo files; both are the
  intended meaning.
- **Reference symbols / precedents to mirror:**
  - `Sidebar.tsx` — `RowContextMenu` (~76) + `RowMenuItem` type (~69); the **worktree
    header** Reveal/Copy block (`revealPath(path)` ~842, `copyToClipboard(path, "path")`
    ~853) and the **repo menu** Reveal/Copy (~1435/1446) are the patterns to mirror for the
    new items; `FileRow` (~464) and `KanbanRow` (~533) are the edit sites; the existing
    `revealPath` import is at ~line 25.
  - `src/ipc.ts` — `revealPath` (~306) is the wrapper to clone.
  - `src/store.ts` — `copyToClipboard(text, label?)` (~2751), already used at ~line 405
    ("Copy session ID") and by the worktree/repo menus.
  - `src-tauri/src/commands.rs` — `reveal_path` (~986) to clone (+ `-R`);
    `src-tauri/src/lib.rs` `invoke_handler!` (~200) for registration.
- **Why `Depends on: none`:** this edits **existing** sidebar rows + adds a self-contained
  backend command; nothing it needs is produced by an open task. **#167** (file-tree
  viewer) is a *different* surface that builds its **own** file context menu (its plan
  already includes "Copy path" / "Reveal in Finder"); it neither blocks nor is blocked by
  this — though if #167 lands after this, it can reuse `reveal_file_in_finder`. **#168**
  (collapsible sidebar) only hides these rows in the rail; expanded mode is unaffected.
  **#170** (no-auto-capitalize) and **#169** (auto-name) are unrelated.

- **Implementation notes (2026-06-25):** Implemented exactly as planned. Added the Rust
  command `reveal_file_in_finder(path)` (`open -R <path>`, the file counterpart of
  `reveal_path` which stays `open`-only) + its `lib.rs` `invoke_handler!` registration and
  the `ipc.ts` `revealFileInFinder` wrapper. In `Sidebar.tsx`, added a shared
  `filePathMenuItems(repoPath, file, copyToClipboard, onRemove)` helper (+ a `rowAbsPath`
  that trims trailing slashes on the root → no double slash) returning Reveal in Finder /
  Copy absolute path / Copy relative path / red Remove, and wired it into **both** `FileRow`
  and `KanbanRow` (each now pulls `copyToClipboard` from the store). DiffRow / TerminalRow /
  ScheduleRow and the repo/worktree menus are untouched; `reveal_path` unchanged; no
  capabilities edit. All green: npm build / lint / test (221) / format:check; cargo test
  (73) / clippy / fmt. The live Finder-selection behavior (`open -R`) wasn't runtime-verified
  in a `tauri dev` macOS session in this autonomous loop, but the command mirrors the proven
  `reveal_path` pattern with the documented `-R` flag.
