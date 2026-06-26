# Task 202

### 202. [ ] File-tree search: filename + content matches with inline snippet preview, in-panel

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-26

**Description**

The file-tree panel (`src/components/FileTree/FileTree.tsx`, the lazy `list_dir` tree #167)
has **no search**. Add a search input **inside the file-tree panel** (no separate panel): as
the user types, matching files appear — matched by **filename** and by **file contents**. For
content hits, show the matching **snippet inline in a small "mini file viewer."** Each result
has quick actions: **reveal** the file in the tree, or **open** it in a file-viewer panel.

**Goal & why.** Make the file tree a fast way to find code/text by name *or* content without
leaving the panel — a lightweight in-app "find in files."

**Backend — a new content-search command (the missing piece).** `files.rs` has
`search_files` (filename substring, returns `Vec<String>`) but **no content search**. Add
`search_file_contents(repo, query, limit)`:
- Walk the repo reusing the `search_collect` skeleton (skip `SKIP_DIRS` incl. `.git` + heavy
  dirs, skip `SKIP_EXTS`/binary, path-validated, bounded by a result cap like
  `SEARCH_RESULT_CAP`); also **skip files over a size cap** (e.g. > ~1–2 MB) to stay fast.
- Case-insensitive substring match per line. Return a bounded `Vec<ContentMatch>` where
  `ContentMatch { path: String (repo-relative), line: usize (1-based), snippet: String }` —
  `snippet` = the matching line (trimmed/clamped to a max width), optionally with ±1 context
  line so the "mini viewer" has a little context. Cap matches **per file** (e.g. first 3) so
  one file can't flood results, and log/flag truncation (no silent cap — mirror the #167/#179
  "no silent truncation" rule).
- Deterministic, machine-independent ordering (sorted walk, like `search_files`).

**Frontend — search UI inside the tree.**
- A **search input** at the top of the `FileTree` panel. Debounced (~200 ms). Empty query →
  the normal lazy tree (unchanged). Non-empty → a **results view** replaces (or overlays) the
  tree until cleared.
- **Two result groups**: **Files** (from `search_files` — filename hits) and **In files**
  (from `search_file_contents` — content hits). Run both in parallel; render as they return.
- A **content result** shows the filename + the matching **snippet in a compact mono "mini
  viewer"** (the matched substring highlighted; context line(s) dimmed). A **filename result**
  shows just the path.
- **Per-result actions** (icons/buttons): **Reveal in tree** (expand all ancestor folders of
  the path — lazy-loading them — scroll the row into view + highlight) and **Open** (open the
  file in a viewer — reuse the panel's existing file-open path: e.g. the same action a tree
  file-click uses; for a Canvas file panel `setLeafFile`, else `addOverviewPanel(repoPath,
  "markdown", path)` / `selectItem`). Clicking the result row defaults to **Open**.
- Bounded + responsive: show a result count, a "more matches not shown" note when capped, and
  a quiet "no matches" empty state.

**Scope.** The new `search_file_contents` command + the in-panel search input, dual-source
results, snippet mini-viewer, and reveal/open actions.

**Out of scope.**
- A regex/advanced query language (plain case-insensitive substring, like `search_files`).
- A global/cross-repo search or a standalone search panel (it lives **inside** the file
  tree, per the card).
- Editing from the snippet preview (read-only).
- Indexing/caching (a bounded live walk per query is enough for v1; note the size/result caps).

**Concrete files/symbols.**
- `src-tauri/src/files.rs` — `search_file_contents` (new) + `ContentMatch` struct, reusing
  the `search_collect` walk + `SKIP_DIRS`/`SKIP_EXTS`/path-validation; size cap + per-file cap
  + `SEARCH_RESULT_CAP`.
- `src-tauri/src/commands.rs` — a `search_file_contents` Tauri command; register in `lib.rs`;
  capability if needed.
- `src/ipc.ts` + `src/types` — `searchFileContents(repo, query, limit)` wrapper + the
  `ContentMatch` type.
- `src/components/FileTree/FileTree.tsx` (+ `.module.css`) — the search input, debounced dual
  search, results view (Files / In files groups), the snippet mini-viewer, and the
  reveal/open actions; an "expand-to-path" helper to lazy-load + reveal a result in the tree.
- Reuse: the panel's existing file-open action; `revealPath` is OS-level (#130) — the
  in-tree reveal is a new expand-to-path, distinct from Finder reveal.

**Subtasks**

1. [ ] Backend `search_file_contents` + `ContentMatch` (bounded walk, size/per-file/result
   caps, deterministic order, `.git`/binary skipped) + Rust unit tests.
2. [ ] Tauri command + IPC wrapper + TS type.
3. [ ] FileTree search input (debounced) toggling tree ↔ results; run filename + content
   searches in parallel.
4. [ ] Results UI: Files / In files groups; content snippet "mini viewer" with the match
   highlighted; result count + capped-results note + empty state.
5. [ ] Per-result actions: **Reveal in tree** (expand-to-path + scroll + highlight) and
   **Open** in a file viewer (reuse the existing open path); row-click = Open.
6. [ ] **Verify** — `npm run build`, `npm run lint`, `npm test`, `cargo test` green. Manual
   (or note as runtime-unverified): typing a filename fragment lists files; typing a string in
   some file lists content hits with snippets; Reveal expands the tree to the file; Open opens
   it in a viewer; large/binary/`.git` files are excluded; results stay bounded on a big repo.

**Acceptance criteria**

- [ ] A search input inside the file-tree panel returns **both filename and content** matches
      as the user types (debounced), without a separate panel.
- [ ] Content matches show the matching **snippet inline** (mini viewer, match highlighted).
- [ ] Each result can **reveal** the file in the tree (ancestors lazy-expanded + scrolled to)
      and **open** it in a file viewer.
- [ ] Backend search is bounded (size/per-file/result caps), skips `.git`/heavy/binary, and is
      path-validated + deterministic; truncation is surfaced, not silent.
- [ ] `npm run build`, `npm run lint`, `npm test`, and `cargo test` pass.

**Notes**

- **Autonomous refine (2026-06-26):** decisions logged in `ASSUMPTIONS.md`.
  - **New `search_file_contents` command** (content search is absent today); reuses the
    `search_collect` walk + skip/validation rules; **size cap + per-file cap + result cap**,
    deterministic order, truncation surfaced (no silent cap, per #167/#179).
  - **Plain case-insensitive substring** (no regex) for parity with `search_files`.
  - **In-panel** (tree ↔ results toggle on a non-empty query); **Open** reuses the panel's
    existing file-open action; **Reveal** is a new in-tree expand-to-path (distinct from the
    OS `revealPath` #130).
  - **Sizable task** — could be split (backend command vs frontend UI) if needed, but kept as
    one to match the single card; it adds no new view *type*.
- **Depends on: none** — reuses `files.rs` walk patterns, `read_text_file`, the lazy tree
  (#167), and existing file-open actions. Independent of the worktree cards.
- **References:** `files.rs` `search_files`/`search_collect` (~136), `SKIP_DIRS`/`SKIP_EXTS`/
  `SEARCH_RESULT_CAP`/`MAX_SEARCH_DEPTH` (~38–46), `FileTree.tsx` (`listDir`, ~283 lines),
  `ipc.ts`. CLAUDE.md "File access is read-mostly" + lazy tree/picker (#56/#167/#179).
