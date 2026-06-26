# Task 202

### 202. [x] File-tree search: filename + content matches with inline snippet preview, in-panel

**Status:** Done
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

1. [x] Backend `search_file_contents` (`files.rs`) + `ContentMatch`/`ContentSearchResult`
   structs: a sorted, deterministic walk reusing `SKIP_DIRS` (incl. `.git`) + `SKIP_EXTS`,
   skipping files > `MAX_CONTENT_SEARCH_BYTES` (2 MB) and non-UTF-8 reads, capping at
   `MAX_MATCHES_PER_FILE` (3) per file + a total `limit`, with a `truncated` flag set on either
   cap (no silent truncation). `make_snippet` trims + windows long lines around the match
   (char-safe). 4 Rust unit tests (match/case/skip, per-file + total caps + truncation,
   oversized-skip, snippet windowing).
2. [x] Tauri command `search_file_contents` (`commands.rs`, clamped limit) + `lib.rs`
   registration; IPC `searchFileContents` + `ContentMatch`/`ContentSearchResult` types in
   `ipc.ts` (alongside `DirEntry` — same module the lazy-tree types live in).
3. [x] `FileTree` search input (debounced 200 ms) in the toolbar; non-empty (debounced) query
   replaces the tree with a results view; filename (`searchFiles`) + content
   (`searchFileContents`) searches run **in parallel** (latest-wins via a `cancelled` guard),
   rendering as each resolves.
4. [x] Results UI: **Files** + **In files** groups; each content hit shows `path:line` + a mono
   **snippet "mini viewer"** with the match `<mark>`-highlighted (case-insensitive re-find);
   a result count header, per-group "more matches not shown" cap notes (filename-limit hit /
   backend `truncated`), and a "No matches." empty state + "Searching…".
5. [x] Per-result actions: a **Reveal in tree** icon button (`revealInTree` — lazy-loads every
   ancestor level via `listDir`, expands them, exits the results view, then scrolls the row
   into view + briefly highlights it) and **Open** (row-click → `openFileFromTree`, the same
   path a tree file-click uses).
6. [x] **Verify** — `npm run build` ✓, `npm run lint` ✓, `npm test` (288) ✓, `cargo test` (87,
   +4) ✓, `cargo clippy` ✓, `cargo fmt` ✓, prettier ✓. The live in-panel UX (typing →
   results → reveal/open) is **runtime-unverified** in this autonomous loop (no GUI) — see
   Notes; the backend walk is unit-tested and the UI reuses established tree/open machinery.

**Acceptance criteria**

- [x] A search input inside the file-tree panel returns **both filename and content** matches
      as the user types (debounced), without a separate panel (tree ↔ results toggle in place).
- [x] Content matches show the matching **snippet inline** (mono mini viewer, match
      `<mark>`-highlighted; long lines windowed around the hit).
- [x] Each result can **reveal** the file in the tree (ancestors lazy-expanded + scrolled to +
      highlighted) and **open** it in a file viewer (row-click).
- [x] Backend search is bounded (2 MB per-file size cap, 3-per-file cap, result cap), skips
      `.git`/heavy/binary, is path-confined + deterministic (sorted walk), and surfaces
      truncation via the `truncated` flag (no silent cap).
- [x] `npm run build`, `npm run lint`, `npm test`, and `cargo test` pass.

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

**Implementation notes (2026-06-26 — done)**

- **Backend** mirrors `search_files` exactly (sorted/deterministic walk, same
  `SKIP_DIRS`/`SKIP_EXTS`/path-confinement) but reads file contents. Two content-specific
  bounds beyond the result cap: a **2 MB per-file size cap** (`MAX_CONTENT_SEARCH_BYTES`,
  smaller than the viewer's 5 MB read cap because search is a hot path) and a **3-matches-
  per-file cap** (`MAX_MATCHES_PER_FILE`). Either the global `limit` or a per-file cap being
  hit sets `ContentSearchResult.truncated`, so the UI can say "more not shown" — honouring the
  #179 no-silent-truncation rule. Non-UTF-8 files fail `read_to_string` and are skipped
  (a cheap binary filter on top of `SKIP_EXTS`).
- **Snippet** = the trimmed matching line; if still > 200 chars it's windowed around the first
  match with `…` markers. `make_snippet` is fully char-based (it never byte-slices a `str`), so
  it's panic-safe on any UTF-8; the frontend re-finds the (case-insensitive) match to highlight
  it, so the backend needn't return a match column.
- **Types in `ipc.ts`** (not a new `src/types` file): `ContentMatch`/`ContentSearchResult` sit
  next to `DirEntry`, the established home for the lazy-tree/file-access IPC types. Minor
  deviation from the card's "+ src/types" wording, chosen for consistency.
- **Reveal-in-tree** is a new in-panel expand-to-path (distinct from the OS `revealPath` #130):
  it `listDir`s each ancestor level (so the row mounts), expands them, leaves the results view,
  then a `revealTarget` + ref + effect scrolls the row into view and flashes an accent
  highlight (`reveal-flash`, dropped under reduced-motion via the global killswitch). **Open**
  reuses `openFileFromTree(repoPath, file, "markdown")` — the exact tree-click path; row-click
  defaults to Open.
- **Decisions:** no ±1 **context lines** in the snippet (the plan made them optional) — a
  single matched line keeps highlighting clean and the payload small. Content "Open" can't jump
  to the matched **line** (the file viewer has no line-jump API; out of scope) — the `:line` is
  shown for reference. Filename results are display-capped at 100 (`FILE_RESULT_LIMIT`) with
  their own "more not shown" note.
- **Runtime-unverified (autonomous loop, no GUI):** the live typing → dual-results → reveal/open
  flow. The backend walk + snippet windowing are unit-tested (87 Rust tests, +4) and the UI
  reuses the established lazy-tree + file-open machinery; all automated gates pass. Recommend a
  `npm run tauri dev` pass on a file-tree panel (type a name fragment → Files group; type a
  code string → In files group with highlighted snippets; Reveal expands+scrolls; Open opens).
