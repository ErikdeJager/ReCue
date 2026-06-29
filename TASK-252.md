### 252. [ ] Color file-tree rows by git status (new = green, edited = yellow, deleted = red)

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-29

**Description**

The repo **file tree** (`src/components/FileTree/FileTree.tsx`, #167 — the single
component rendered in the sidebar, an Overview column, a Canvas panel, and a
Canvas-template block) currently renders every file/folder row in a neutral
`--text-primary`/`--text-muted` regardless of git state. This task makes the tree
**git-aware**: each row is tinted to reflect its working-tree status vs `HEAD`, so a
glance at the tree shows what an agent (or the user) has changed.

Per the card:

- **New (untracked / added) files → green.**
- **Edited (modified) files → yellow.**
- **Deleted files → red**, and because a deleted file no longer exists on disk it
  cannot appear as a normal `list_dir` row, "something was deleted out of a folder"
  must still be visible (see Subtasks 4c).

Everything needed already exists and just needs wiring:

- **Status colors are already design tokens** (`src/styles/tokens.css`):
  `--status-done: #a6e3a1` (Green), `--status-awaiting: #f9e2af` (Yellow),
  `--status-error: #f38ba8` (Red). Reuse these — do **not** introduce off-system
  colors. (`--status-done`/`-awaiting`/`-error` already drive the busy indicator and
  usage bar, so they're the established green/yellow/red.)
- **Git status data is readable today.** `git.rs working_diff(cwd)` already returns
  `files: [{ path, status: "M" | "A" | "D", … }]` with repo-relative POSIX (`/`)
  paths, including untracked-as-`Added` (#183) and deletions-as-`Deleted`. But
  `working_diff` is heavyweight (parses full hunks **and** spawns one `git` per
  untracked file, up to 2000). For just per-file status, add a **lightweight**
  `file_statuses(repo)` command backed by a single `git status --porcelain`
  invocation (Subtask 1).
- **A refresh cadence already exists.** `scheduleBranchRefresh()` (store.ts:138,
  #212) re-reads branch labels on every session **busy→idle** edge (debounced
  600 ms) so an in-terminal `git checkout` is reflected without a restart. The
  identical signal is exactly when an agent's edits land, so reuse it to refresh git
  statuses (Subtask 3).

`list_dir` returns `DirEntryInfo { name, path, is_dir }` where `path` is
repo-relative POSIX (`/`-separated) — and `git status --porcelain` paths (with
`core.quotepath=false`) are **also** repo-relative POSIX — so status lookup is a
direct string-keyed `Map` hit on **both macOS and Windows**, with no path-join or
separator handling needed in the lookup path.

**Scope**

- Tint **file rows** in the tree: green = `A` (new/untracked), yellow = `M`
  (modified). Tint the file **name text** + file icon.
- **Folder roll-up:** a folder whose subtree contains any change gets its **name
  tinted** in the highest-severity descendant color — **red** if any descendant is
  deleted, else **yellow** if any is modified, else **green** if any is added. This
  is what makes "something deleted out of a folder → that folder marked red" work
  even when the folder is collapsed or not yet lazy-loaded (the status map covers the
  whole repo, independent of which levels are expanded).
- **Deleted files:** in addition to the red folder roll-up, inject a **red "ghost"
  row** for each deleted file into its parent directory's level **when that parent
  level is currently rendered** — a non-openable, dimmed, strikethrough row labeled
  with the deleted filename so the user sees *what* was removed in place. If the
  deleted file's parent directory itself no longer exists (so no level renders it),
  the red ancestor roll-up is the sole indicator — acceptable.
- Apply to **all** FileTree instances automatically (one component) — sidebar,
  Overview column, Canvas panel, Canvas-template block.
- Hold the per-repo status map in the **store** (`fileStatuses`, mirroring
  `branches`) so the fetch happens once per repo regardless of how many FileTree
  instances render it; refresh it on app load, on each session **busy→idle** edge
  (reuse #212's debounced scheduler), and from the FileTree's existing manual
  **Refresh** button.

**Out of scope**

- The **#202 in-panel search results** view (the `Files` / `In files` lists) — leave
  those rows uncolored; the card is about the *tree*.
- Any **staged-vs-unstaged** distinction or a per-status letter badge (A/M/D). Color
  is the only signal (matches the card); a letter badge may be added later.
- A **diff-on-click** for a deleted ghost row (open its removal in a diff viewer) —
  the ghost row is informational only this pass.
- Coloring **non-git folders** — `file_statuses` returns an empty, non-erroring
  result for a non-git dir (like `working_diff`), so an out-of-repo file opened via
  Browse… (#163, parent-dir-as-root) simply shows no coloring. Fail-open.
- Any change to the diff viewer, `working_diff`, or the existing color tokens.

**Subtasks**

1. [ ] **Backend: a lightweight `file_statuses` reader** (`src-tauri/src/files.rs`
   or `git.rs` — put it with the other git reads in `git.rs`).
   - [ ] Add `pub fn file_statuses(cwd) -> Vec<FileStatusEntry>` returning
     `{ path: String, status: FileStatus }` where `FileStatus` is the **existing**
     enum (`git.rs`, serde `"M"`/`"A"`/`"D"`). Run **one** git call via the existing
     cross-platform `run_git` / `hidden_command` seam (the `CREATE_NO_WINDOW` guard —
     **never** a bare `Command`): `git -c core.quotepath=false status --porcelain=v1
     -z --untracked-files=all`.
   - [ ] Parse the `-z` (NUL-separated) porcelain: each entry is `XY<space>path`.
     Map to status: `??` → `Added`; index/worktree `D` → `Deleted`; `A`/added → 
     `Added`; otherwise (`M`, `MM`, type-change, etc.) → `Modified`. **Renames**
     (`R`/`C`, which under `-z` carry a second NUL-separated `old` field) → emit
     `Deleted` for the old path **and** `Added` for the new path (mirrors the
     `parse_unified_diff` rename-as-add+del convention, git.rs:14). Skip the
     symbolic/empty entries safely.
   - [ ] Non-git dir / repo with no commits → return `Vec::new()` (non-erroring),
     matching `working_diff`'s fail-open behavior. Bound the result with a cap
     constant (e.g. reuse the spirit of `MAX_UNTRACKED_FILES`) so a pathological
     working tree can't produce an unbounded IPC payload.
   - [ ] Unit-test the porcelain parser as a pure `&str -> Vec<FileStatusEntry>`
     function against fixtures (added / modified / deleted / untracked / rename),
     plus a temp-repo integration test gated like the existing `git.rs` ones (skip
     when `git` is unavailable / on the `cfg(unix)`-only shell paths as the file
     already does).

2. [ ] **Expose the command + types.**
   - [ ] Register the `#[tauri::command] file_statuses` in `commands.rs` + `lib.rs`
     invoke handler (follow `working_diff`/`list_dir`).
   - [ ] Add the `fileStatuses(repo)` wrapper to `src/ipc.ts` and a `FileChangeStatus`
     (`"A" | "M" | "D"`) + `FileStatusEntry` type to `src/types/` (mirror the backend
     serde names exactly).

3. [ ] **Store: hold + refresh the status map** (`src/store.ts`).
   - [ ] Add `fileStatuses: Record<string, Record<string, FileChangeStatus>>`
     (repoPath → { repo-relative path → status }), initialized `{}`, mirroring
     `branches`.
   - [ ] Add `refreshFileStatuses()` that, for the same repo set as `refreshBranches`
     (`repoOrder(get().recents, get().sessions)`), calls `ipc.fileStatuses(repo)` per
     repo via `Promise.allSettled`, builds each `{ path → status }` map, and `set`s
     `fileStatuses`. Fail-open per repo (leave a repo's prior map on error).
   - [ ] Trigger it: (a) wherever the initial `refreshBranches()` runs on app load;
     (b) on the **busy→idle** edge — extend `scheduleBranchRefresh()` (store.ts:138)
     to also `void useStore.getState().refreshFileStatuses()` (or add a sibling
     debounced scheduler on the same 600 ms cadence) so it coalesces a burst of
     sessions settling together; (c) after app-initiated git writes that already call
     `refreshBranches()` (checkout / pull / branch create) for immediacy.

4. [ ] **FileTree rendering** (`FileTree.tsx` + `FileTree.module.css`).
   - [ ] Read `const fileStatuses = useStore((s) => s.fileStatuses[repoPath])` (an
     empty/undefined map = no coloring). Trigger a `refreshFileStatuses()` on mount
     for `repoPath` (so opening the tree shows current state immediately, even with
     no session active) and from the existing **Refresh** button
     (`setNonce` handler — also call the store refresh for this repo).
   - [ ] **(a) File rows:** look up `fileStatuses[node.path]`; apply a status class
     (`statusAdded` / `statusModified`) tinting the name text + file icon. No entry =
     unchanged (current styling).
   - [ ] **(b) Folder roll-up:** compute, per rendered folder, the highest-severity
     status among descendants by scanning the status map for keys under `node.path +
     "/"` (red > yellow > green). Tint the folder name in that color. To stay cheap,
     precompute once per render a structure (e.g. a `Set`/`Map` of folder-prefix →
     rolled-up status) from the status map rather than re-scanning per folder.
   - [ ] **(c) Deleted ghost rows:** for the directory level being rendered (`path`),
     find every `D` entry whose parent directory equals `path` and that is **not**
     already a real entry, and render a synthetic red, dimmed, `line-through`,
     non-`onClick` row (a `<div>`/disabled `<button>`) with the deleted file's name +
     a `title="deleted"`. Keep them visually distinct from a live red (none exists —
     only deletions are red on files). Order them after the real entries at that level
     (or interleave alphabetically — implementer's choice; document it).
   - [ ] Add the new CSS classes to `FileTree.module.css` using the tokens:
     `.statusAdded { color: var(--status-done); }`,
     `.statusModified { color: var(--status-awaiting); }`,
     `.statusDeleted { color: var(--status-error); }` (+ `text-decoration:
     line-through; opacity: .7` for the ghost row). Ensure the tint applies to both
     the `.name` and the relevant icon; verify contrast on the dark theme (the tokens
     are designed for it). No animation; no `prefers-reduced-motion` concern.

5. [ ] **Tests.**
   - [ ] Rust: the porcelain-parser unit tests from Subtask 1.
   - [ ] Frontend (Vitest): a pure helper for the **folder roll-up** severity
     (`rollUpStatus(statusMap, folderPath)` or the prefix-index builder) and for the
     **deleted-children-at-level** computation, tested independently of React.
   - [ ] `npm run build` (type-check) + `npm run lint` + `npm test` +
     `cargo test --manifest-path src-tauri/Cargo.toml` all green.

6. [ ] **Docs.** Update `CLAUDE.md` (the FileTree #167 bullet + the `files.rs`/`git.rs`
   layout lines) to note the git-status coloring + the new `file_statuses` read; this
   is a read-only git addition, consistent with the "git is read-mostly" rule (no new
   write). Note the new tokens-driven coloring in the styling section if warranted.

**Acceptance criteria**

- [ ] In the file tree, a **new/untracked** file's row name reads **green**
  (`--status-done`), a **modified** file's **yellow** (`--status-awaiting`), with no
  coloring on unchanged files.
- [ ] A **deleted** file is visible as a **red** (`--status-error`) row in its parent
  folder (strikethrough, non-openable) when that folder level is rendered, **and** its
  ancestor folders' names are tinted **red** so the deletion is discoverable while
  those folders are collapsed.
- [ ] A folder containing only added (or only modified) descendants has its name
  tinted green (resp. yellow); a folder mixing changes uses the highest-severity color
  (red > yellow > green).
- [ ] The coloring updates without an app restart after an agent edits files —
  specifically on the session **busy→idle** edge (reusing #212's cadence) and via the
  FileTree **Refresh** button; it appears on first open of the tree.
- [ ] The same coloring shows in **every** FileTree surface (sidebar / Overview /
  Canvas / template block).
- [ ] A **non-git** folder (or out-of-repo file opened via Browse…) shows no coloring
  and no error (fail-open).
- [ ] **Works on both macOS and Windows:** the git call goes through
  `run_git`/`hidden_command` (no console flash, no bare `Command`), porcelain `-z`
  paths and `list_dir` paths are both repo-relative POSIX so the status lookup matches
  on both OSes, and only CSS tokens (no platform-divergent CSS) drive the colors.
- [ ] `npm run build`, `npm run lint`, `npm test`, and the Rust test suite pass.

**Notes**

- **Asking the user — deferred per the standing directive.** `ASSUMPTIONS.md`
  (2026-06-26) records that the user will no longer respond in the refine/loop chat
  and that open points are to be decided autonomously and logged; every task #186–#234
  followed this. That blanket deferral satisfies the refine workflow's "explicitly
  deferred" path, so the genuinely ambiguous points were resolved here rather than
  stalling the loop with a question. The decisions:
  - **Deletions surface as a red ghost row in the parent folder + a red ancestor
    roll-up**, rather than *only* marking the folder red. The card says "if something
    was deleted out of a folder, it should be marked in red"; showing the actual
    deleted filename (where its folder still renders) is strictly more useful and the
    roll-up still satisfies the literal "folder marked red" for collapsed/missing
    parents. If the ghost-row injection proves too fiddly with the lazy tree, the
    fallback that still meets the card is the red ancestor roll-up alone.
  - **Folders roll up new/edited too, not just deletions.** The card names folders
    only for deletions, but tinting a folder for any contained change (IDE
    convention) is the consistent, more useful behavior and reuses the same roll-up
    machinery the deletion rule needs. Easy to restrict to red-only later.
  - **Coloring = tint the name text + icon** (green/yellow/red), reading the card's
    "Green for new and yellow for edited files" as coloring the file label. A status
    dot/letter badge was considered and left out (color-only, per the card).
  - **Data source = a new lightweight `file_statuses` (`git status --porcelain`)**
    rather than reusing the heavyweight `working_diff`, to keep the busy→idle refresh
    cheap and leave the diff viewer untouched. Reusing `working_diff` is the fallback
    if a new command is judged unnecessary.
  - **Status state lives in the store** (`fileStatuses`, mirroring `branches`) so the
    fetch is once-per-repo and reuses #212's busy→idle scheduler, not per FileTree
    instance.
- **Cross-platform:** no new keybinding, native open/reveal, or path-join is
  introduced; the only OS-sensitive primitive is the git shell-out, which reuses the
  established `run_git`/`hidden_command` seam. Both the porcelain output and
  `list_dir` are POSIX-`/` repo-relative, so the lookup is identical on macOS and
  Windows. (`#[cfg]` gating is not required here.)
- **Key references:** `FileTree.tsx` (renderLevel, the Refresh `nonce` button);
  `git.rs` (`FileStatus` enum, `working_diff`, `run_git`/`hidden_command`, the
  `core.quotepath=false` + `MAX_UNTRACKED_FILES` precedents); `files.rs`
  (`DirEntryInfo`, `list_dir`); `store.ts:138` (`scheduleBranchRefresh`, #212) +
  `store.ts:2255` (`refreshBranches`); `tokens.css:44-47` (`--status-*`).
- **Performance:** `--untracked-files=all` enumerates every untracked file (same data
  `working_diff` already gathers); it is one git call per repo per refresh, the same
  order as the existing branch refresh. The result cap + the debounced busy→idle
  cadence keep it bounded.
