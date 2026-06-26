# TASK-183

### 183. [x] Diff view: show untracked (new) files in the working-tree diff

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

The diff view's **Working tree** source doesn't show **untracked (new) files** —
their changes are invisible in the panel. The bug was reported as "the diff panel
doesn't show hidden folders or their contents that have changed," but investigation
shows it is **not specific to hidden folders**: it's that `git diff HEAD` never
includes untracked files at all. A freshly-created folder (hidden or not) has all
its files untracked, so none of them appear — which is how the reporter hit it with
a hidden config folder (e.g. a newly-created `.claude/`).

**Root cause.** `git::working_diff` (`src-tauri/src/git.rs`, ~line 125) runs only
`git -c core.quotepath=false diff HEAD --no-color --no-ext-diff` and parses it.
`git diff HEAD` reports **tracked** modifications/deletions and staged additions
**only** — it excludes untracked files entirely (verified). Note that **tracked**
changes inside hidden folders already show correctly (confirmed: a modified
`.hidden/tracked.txt` appears), so the existing path needs no fix there. The
frontend `DiffInspector` (`src/components/DiffInspector/DiffInspector.tsx`) renders
a **flat list** of `diff.files` with **no filtering whatsoever** — so once the
backend returns untracked files, they render with no frontend change.

**Fix (backend only).** Extend `working_diff` so the working-tree diff **also
includes every untracked file**, each rendered as a **status `A` (Added)** entry
with its content shown as additions — exactly like a newly-added staged file. This
is read-only (no index mutation), consistent with the app's "git is read-mostly"
stance.

**Approach (verified against the real `git`):**

1. List untracked files (respecting `.gitignore`) with
   `git -C <cwd> ls-files --others --exclude-standard -z`. `--exclude-standard`
   honors `.gitignore` / `.git/info/exclude` / global excludes, so ignored noise
   (`node_modules`, `dist/`, build output) stays out (user decision). `-z` gives
   NUL-separated raw paths (robust to spaces/newlines) — split on `\0`, drop the
   trailing empty.
2. For each untracked path, synthesize a new-file diff with
   `git -C <cwd> -c core.quotepath=false diff --no-index --no-color --no-ext-diff -- /dev/null <path>`
   and run its output through the existing `parse_unified_diff`. The output is a
   standard `diff --git a/<path> b/<path>` block with `new file mode` (→
   `parse_unified_diff` already maps this to `FileStatus::Added`) and, for binary
   files, a `Binary files /dev/null and b/<path> differ` line (→ already flagged
   `binary`, empty hunks). The `b/<path>` header yields the correct relative path.
   **Append** the parsed `FileDiff`(s) to the tracked `files` list.
3. Recompute `summary.adds` / `summary.dels` / `files_changed` over the combined
   list (the existing `.iter().map(...).sum()` lines already do this — just run them
   after appending untracked).

**Critical implementation detail — exit codes.** `git diff --no-index` exits **1**
when the two inputs differ (the normal case here), and `0` only when identical;
`run_git_raw` (git.rs ~line 656) returns `None` on **any** non-zero exit
(`.status.success()`), so it would **discard** every untracked-file diff. Add a
small raw runner variant that returns stdout when the exit code is **0 or 1** (and
`None` for ≥2 / spawn failure), and use it **only** for the `--no-index` calls.
Leave `run_git` / `run_git_raw` unchanged for everything else.

**Scope**

- `src-tauri/src/git.rs` only: `working_diff` gains the untracked-file pass; add the
  exit-code-tolerant raw runner helper for `--no-index`.
- No frontend change — `DiffInspector` already renders untracked rows once they're
  in `diff.files` (status `A` → existing green "Added" glyph via `glyphClass`).

**Out of scope**

- `compare_branches` (#81, the **Compare** source) — a commit-to-commit diff where
  untracked files don't apply. Unchanged.
- Showing `.gitignore`'d files (explicitly excluded — user decision).
- Any frontend/tree/grouping change; any change to how **tracked** changes render.
- Staging, committing, or any index/working-tree mutation.

**Subtasks**

1. [ ] In `src-tauri/src/git.rs`, add a raw runner that tolerates `git`'s
   "differences found" exit code, e.g.
   `fn run_git_raw_allow_diff(cwd: &Path, args: &[&str]) -> Option<String>` returning
   `String::from_utf8_lossy(&output.stdout).into_owned()` when
   `output.status.code()` is `Some(0) | Some(1)`, else `None`. (Mirror `run_git_raw`.)
2. [ ] Add an untracked-file helper, e.g.
   `fn untracked_files(cwd: &Path) -> Vec<String>` that runs
   `ls-files --others --exclude-standard -z`, splits stdout on `\0`, and drops empties.
3. [ ] In `working_diff`, after parsing the tracked `git diff HEAD` output, iterate
   `untracked_files(cwd)`; for each, call the new runner with
   `["-c","core.quotepath=false","diff","--no-index","--no-color","--no-ext-diff","--","/dev/null",&path]`,
   `parse_unified_diff` the result, and append the entries to `files`.
4. [ ] Compute `adds`/`dels`/`files_changed` over the **combined** `files` (the
   existing summary code already does — confirm it runs after the append).
5. [ ] Keep it bounded/robust: skip an untracked entry whose `--no-index` call
   returns `None` (best-effort); the `--exclude-standard` filter keeps the count
   small in practice, and the frontend already caps rendered rows per file
   (`MAX_DIFF_ROWS = 600`). (Optional: a defensive cap on the number of untracked
   files processed for content if the list is pathologically large.)
6. [ ] Add a Rust unit test (under `git.rs`'s `tests` module) that creates a temp
   git repo with a commit, then a modified tracked file, an untracked file in a
   normal folder, and an untracked file in a hidden (dot) folder, and a `.gitignore`
   entry — asserting `working_diff` returns the tracked modification **and** both
   untracked files as status `A`, and **omits** the ignored path. (Existing tests
   like `parses_a_modification_with_counts_and_line_numbers` show the patterns; the
   tests module already imports `std::fs` / `PathBuf` and can shell out to `git`.)
7. [ ] Verify: `cargo test --manifest-path src-tauri/Cargo.toml` passes;
   `npm run lint:rust` (clippy) and `npm run format:rust` clean. Manually, in
   `npm run tauri dev`: create a new file in a normal folder and one in a new hidden
   folder in a repo, open that repo's diff panel (Working tree) — both appear as
   green "A" rows with their content; a `.gitignore`'d file does **not** appear; a
   modified tracked file still appears as before.

**Acceptance criteria**

- [ ] The **Working tree** diff lists **untracked (new) files** as status `A`
      (Added), with their content shown as additions, for files in **any** folder
      (normal or hidden/dot).
- [ ] Untracked files that match `.gitignore` (or other standard excludes) are
      **not** listed.
- [ ] Binary untracked files appear as an `A` row flagged binary (no text preview),
      not as garbage.
- [ ] Tracked modifications/deletions (including those inside hidden folders) still
      render exactly as before; summary counts (`files changed`, `+adds`, `−dels`)
      include the untracked additions.
- [ ] The **Compare** (branch-to-branch) source is unchanged.
- [ ] `cargo test` (with the new test), `npm run lint:rust`, and the frontend build
      all pass; no frontend code change was required.

**Notes**

- **User decisions (refine Q&A, 2026-06-26):**
  - *Scope* → **All untracked files** (not just those in hidden folders): the card's
    "hidden folders" framing is incidental — the real defect is that `git diff HEAD`
    excludes untracked files entirely. New files in hidden folders are just a subset
    that this fix makes work.
  - *Ignored files* → **Respect `.gitignore`** via `--exclude-standard` (don't flood
    the diff with build artifacts / dependencies).
- **Verified against the real `git`** during refinement: `git diff HEAD` shows a
  modified `.hidden/tracked.txt` but omits untracked `.newhidden/file.txt`,
  `newvisible/file.txt`, `.hidden/untracked.txt`; `git -C <repo> diff --no-index
  --no-color --no-ext-diff -- /dev/null <relpath>` emits a clean `new file mode`
  block with a `b/<relpath>` header (exit **1**), and a `Binary files … differ` line
  for binary content; `ls-files --others --exclude-standard -z` returns NUL-separated
  relative paths and correctly skips a `.gitignore`'d folder.
- This is a **backend-only** fix: `DiffInspector` renders a flat, unfiltered list of
  `diff.files`, so untracked rows appear with no UI change. The poll loop's
  signature check (`JSON.stringify(next)`) naturally re-renders when untracked files
  appear/disappear.
- The per-untracked-file `--no-index` spawn is acceptable because `--exclude-standard`
  keeps the untracked set small; it's the faithful, read-only way to reuse
  `parse_unified_diff` (avoids the index-mutating `git add -N` trick).
