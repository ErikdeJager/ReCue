# TASK-179

### 179. [ ] Show hidden (dot-prefixed) folders in the file tree and pickers

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-26

**Description**

Folders whose name starts with a `.` are currently invisible everywhere the app
lists repo files: the **File tree** panel (#167), the searchable **File picker**
(#56), the **File switcher** (#90), the repo **Views** menu's file listing, and the
template `open-file` picker. So `.claude/` (skills, commands, settings),
`.github/`, `.vscode/`, etc. and everything inside them never appear — the user
can't browse to or open any file under a dot-folder.

The cause is a single backend filter. `src-tauri/src/files.rs` `collect()` (the
recursive directory walker behind the `list_files` Tauri command) skips a directory
when its name **starts with `.`**:

```rust
// files.rs:59-63
if path.is_dir() {
    // Skip hidden (.git, .github, …) and heavy build/dep dirs.
    if name.starts_with('.') || SKIP_DIRS.contains(&name.as_ref()) {
        continue;
    }
    collect(root, &path, out, depth + 1);
}
```

Every file-listing surface consumes this one command, so removing the blanket
`name.starts_with('.')` skip fixes all of them at once. **No frontend change is
needed:** the pure `buildFileTree` (`src/components/FileTree/buildFileTree.ts`)
groups whatever repo-relative paths it receives by `/` with no dotfile filtering,
and `FilePicker` / `FileSwitcher` / `ViewsMenu` render the flat list as-is. Once the
backend includes dot-folder paths, every surface shows them automatically.

**Decision (per the user):** un-hide **all** dot-prefixed folders, **including
`.git`**. The user was explicitly shown — and accepted — the tradeoff that `.git`
contains many internal files (objects/refs/hooks) that will be listed too and may
consume the 500-file listing cap. We therefore do **not** add `.git` to the skip
list; we simply drop the blanket dot-directory rule and keep only the existing
`SKIP_DIRS` content filter.

Note that dot-prefixed **files at the repo root** (e.g. `.gitignore`, `.env`,
`.prettierrc.json`) are already listed today — `is_listable()` filters only by binary
extension, never by a leading dot — so this task is purely about dot-**directories**.

**Scope**

- Remove the `name.starts_with('.')` directory-skip in `files.rs` `collect()`,
  keeping the `SKIP_DIRS.contains(...)` check so heavy/vendored dirs
  (`node_modules`, `target`, `dist`, `build`, `vendor`, `out`, `.next`) stay
  excluded. (`.next` is in `SKIP_DIRS`, so it remains skipped via the content list,
  not the dot rule — no regression.)
- Update the now-stale doc comments in `files.rs` that say listing excludes
  "hidden" dirs (the module/`list_files`/`collect` comments).
- Update the affected Rust unit test
  (`lists_text_files_excluding_heavy_dirs_and_binaries`) to reflect that dot-folders
  — including `.git` — are now **included**.

**Out of scope**

- **No change to `LIST_CAP` (500), `MAX_DEPTH` (8), or `SKIP_DIRS`.** Including
  `.git` may crowd the cap with git internals on a large repo; this is the
  user-accepted tradeoff. If it proves disruptive in practice, raising the cap or
  re-excluding only `.git/objects` is a **follow-up task**, not this one.
- No frontend changes (`buildFileTree`, `FileTree`, `FilePicker`, `FileSwitcher`,
  `ViewsMenu`, the template picker all work unchanged).
- No change to `read_text_file` / `write_text_file` / `file_exists` path validation —
  a dot-folder file is read/written through the same canonical-path containment
  checks as any other repo file. (Attempting to view a binary git object as text
  will fail `read_to_string` and surface the viewer's normal read-error state; this
  is acceptable and not changed here.)
- The `.claude/skills` scan in `skills.rs` is unrelated and untouched.

**Subtasks**

1. [ ] In `src-tauri/src/files.rs` `collect()`, change the directory guard from
   `if name.starts_with('.') || SKIP_DIRS.contains(&name.as_ref())` to
   `if SKIP_DIRS.contains(&name.as_ref())` so only the heavy/vendored content list
   is skipped; dot-folders (incl. `.git`) are now traversed.
2. [ ] Update the doc comments to match: the module header / `list_files` doc
   (line ~35, "excluding hidden + heavy dirs") and the inline `// Skip hidden
   (.git, .github, …) and heavy build/dep dirs.` comment — they should no longer
   claim hidden dirs are excluded.
3. [ ] Update the `lists_text_files_excluding_heavy_dirs_and_binaries` test:
   - Replace the `assert!(!files.iter().any(|f| f.contains(".git")));` exclusion
     assertion with one asserting a `.git` file **is** listed (e.g. the
     `.git/config` it already creates: `assert!(files.contains(&".git/config".to_string()))`).
   - Add a dot-folder fixture and assert it appears, e.g. create
     `.claude/skills/foo/SKILL.md` and assert
     `files.contains(&".claude/skills/foo/SKILL.md".to_string())`.
   - Keep the existing `node_modules` and `.png` exclusion assertions intact (those
     still must be filtered).
4. [ ] Run the Rust tests and clippy; confirm green.

**Acceptance criteria**

- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` passes, with the updated
  test proving `.git/config` and a `.claude/...` file are now returned by
  `list_files`, while `node_modules/*` and `*.png` remain excluded.
- [ ] `npm run lint:rust` (clippy) is clean for `files.rs`.
- [ ] Manual: in the running app, a repo's **File tree** panel shows a `.claude`
  folder that expands to its files; the **File picker** / **File switcher** can find
  and open a file under `.claude` (e.g. `.claude/skills/<x>/SKILL.md`); `.git`
  entries also appear (accepted). `node_modules`/`target`/`.next` still do not.
- [ ] No frontend files were modified.

**Notes**

- User decision (refine Q, 2026-06-26): "Which hidden folders should become
  visible?" → **All dot-folders including `.git`.** The option text explicitly
  warned that `.git`'s internal objects/refs/hooks would be listed and could flood
  the 500-file cap; the user accepted that tradeoff. Hence `.git` is intentionally
  **not** added to `SKIP_DIRS`, and `LIST_CAP`/`MAX_DEPTH` are intentionally left
  unchanged in this task.
- Grounding: the bug is one line — `files.rs:61`. Verified that all file-listing
  surfaces (`FileTree` #167, `FilePicker` #56, `FileSwitcher` #90, `ViewsMenu`,
  `TemplatePendingPanel`) route through the single `list_files` command
  (`src/ipc.ts:185`), and that `buildFileTree` (`src/components/FileTree/buildFileTree.ts`)
  performs no dotfile filtering — so the backend change alone is sufficient.
- Assumption (trivial): use `.claude/skills/foo/SKILL.md` as the test fixture for a
  visible dot-folder file since it's the canonical `.claude` content; any
  dot-folder file would satisfy the criterion.
- Sibling Refine card "Remote branches not visible" is independent and will be
  refined separately; it does not gate this task.
