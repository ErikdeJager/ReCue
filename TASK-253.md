### 253. [ ] Drag OS files into the file tree to move them into the repo (drop on folders/root, with drop-target feedback)

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-29

**Description**

Let the user **drag files from the operating system** (Finder / Explorer, the desktop,
a download, etc.) **into ReCue's file tree** and drop them onto a **folder** or the
tree **root** to **move** them into that repo location, with **visual feedback** that
shows exactly where the file will land while dragging.

Per the card: "Allow for files to be dragged into ReCue, especially the file tree.
Items should be moved to this location once they are dropped in. User can also drag and
drop into folders or the root of the file tree. There is visual UI feedback for the
user to know where they are about to drop a file."

**Current state / grounding:**

- The `FileTree` (`src/components/FileTree/FileTree.tsx`, #167) renders repo files via
  `list_dir` (repo-relative POSIX paths); it has **no** drop handling.
- The app's only drag-and-drop today is **dnd-kit** (`App.tsx` `DndContext`, a
  `PointerSensor` with a 4px activation distance) for in-app drags (sidebar rows →
  Canvas). dnd-kit uses **pointer events**, so it does **not** conflict with an OS
  file drop, which arrives via **Tauri's webview drag-drop event** (a different input
  path entirely). The two coexist.
- There is **no** OS file-drop wiring yet (no `onDragDropEvent` listener; no
  `dragDrop` key in `tauri.conf.json`, so Tauri 2's default **webview drag-drop is
  enabled** — the OS drop is captured by Tauri and surfaced as an event rather than a
  DOM `ondrop`).
- `files.rs` writes are path-validated by `confine(repo, rel)` (canonicalize +
  `starts_with(canon_repo)`, rejecting `..`/symlink/out-of-repo) — the pattern the new
  move command must reuse. The only existing write is `write_text_file` (#141); this
  task adds a second deliberate write (a file **move/copy into** the repo), narrowing
  the "file access is read-mostly" rule the way #141 already did.
- The store has `pushToast(message, tone)` for result reporting and a
  `confirmDestructive` setting (not used here — see Notes).

**How OS file drop works in Tauri 2 (the mechanism this builds on):**

`getCurrentWebview().onDragDropEvent(cb)` fires `cb({ payload })` where `payload.type`
is `"enter" | "over" | "drop" | "leave"`; `enter`/`drop` carry `paths: string[]`
(absolute OS-native source paths) and every event carries `position: { x, y }` in
**physical** pixels relative to the window. Because the event is **window-global**
(not bound to a DOM element), the frontend must **hit-test** the cursor position
against the rendered tree to decide which folder/root is the target — convert physical
→ CSS pixels via `window.devicePixelRatio`, then `document.elementFromPoint(cssX,
cssY)` and walk up to the nearest element carrying a drop-target marker (Subtask 3).

**Scope**

- **External OS files** dragged onto a FileTree **folder row** or the FileTree **root
  area** are **moved** into that directory (see "move semantics" below).
- **Visual feedback**: while dragging over a valid target, highlight the precise folder
  row (or the root container) the file would drop into; clear it on leave/drop.
- Works on **every** FileTree surface — the sidebar tree, an Overview column, a Canvas
  panel, and a **detached canvas window** (#84) — and on **both macOS and Windows**.
- A new **backend move command** with path validation (confine the *target* to the
  repo; the *source* is an arbitrary OS path, allowed by the user's explicit drag, like
  the #163 native-dialog consent).
- The affected FileTree level **refreshes** after a successful drop so the moved file
  appears immediately; a **toast** reports success/failure.

**Move semantics (decided — see Notes):**

- **Move, not copy** (the card says "moved"). Implement **safely**: same-volume → a
  fast `std::fs::rename`; cross-volume (rename fails with a cross-device error) →
  **copy then remove the source**, so a mid-operation failure leaves the original
  intact. A dropped **directory** is moved recursively (rename, or recursive copy +
  remove across volumes).
- **Name collision** in the target dir → **refuse** and toast (do not overwrite). (Auto
  `name (1).ext` suffixing is a noted alternative, not this pass.)
- No confirm dialog — the drag is an explicit, intentional gesture (the move is
  safe-ordered so it can't lose data on failure).

**Out of scope**

- **Intra-tree reorganization** (dragging an *existing* tree file onto another tree
  folder to move it within the repo) — the card's "drag and drop into folders or the
  root" describes where *incoming* OS files land; internal reorg is a separate,
  dnd-kit-based interaction and a possible future card. Not built here.
- Dropping onto **non-FileTree** surfaces (a terminal, a diff panel, the Canvas
  background) — ignored; only FileTree drop targets act.
- **Copy-on-drop** / a modifier-key copy-vs-move toggle (noted as a follow-up).
- Importing into a **non-git or out-of-repo** folder tree opened via Browse… is allowed
  (the target is just a directory), but no special handling beyond the standard confine.
- Any change to the in-app dnd-kit drag system.

**Subtasks**

1. [ ] **Backend: a path-validated move command** (`src-tauri/src/files.rs` +
   `commands.rs` + `lib.rs`).
   - [ ] `pub fn move_into_repo(repo, dest_subdir: &str, source: &str) -> Result<String,
     String>`: validate `dest_subdir` with the existing `confine(repo, dest_subdir)`
     (must resolve to an existing directory inside the repo); derive the destination
     filename from the **source**'s `Path::file_name()` (so the frontend never computes
     basenames — keeps OS-separator handling in Rust); reject if the destination path
     already exists (collision → `Err`). Move: try `std::fs::rename(source, dest)`;
     on a cross-device error, `std::fs::copy` (file) or a recursive directory copy,
     then remove the source only after the copy fully succeeds. Return the new
     repo-relative path of the moved item (for the refresh + toast).
   - [ ] Reject a `source` that does not exist / is not readable with a clear error.
     The `source` is intentionally **not** confined to the repo (it's the user's
     dragged OS path); only the **destination** is confined.
   - [ ] Register `#[tauri::command] move_into_repo` in `commands.rs` + the `lib.rs`
     invoke handler; add the `moveIntoRepo(repo, destSubdir, source)` wrapper to
     `src/ipc.ts`.
   - [ ] Unit/integration test (temp dir, gated like existing `files.rs`/`git.rs`
     tests): same-dir move, move into a subdir, collision rejection, out-of-repo
     destination rejection (`..`), and a missing-source error. Cross-volume copy+remove
     can't be unit-tested portably — cover the same-volume rename path and the
     collision/validation logic; note the cross-device branch for manual check.

2. [ ] **Capability check.** Confirm the webview **drag-drop events** are permitted for
   `["main", "canvas-*"]` in `src-tauri/capabilities/default.json` (core drag-drop
   events are covered by `core:default`; add an explicit permission only if a built
   check shows it's needed). No `dragDrop` config change is required (default enabled);
   do **not** set `dragDropEnabled: false`.

3. [ ] **App-level OS-drop listener + hit-test + dispatch** (a small reusable module,
   e.g. `src/osFileDrop.ts`, wired from `App.tsx` **and** `CanvasWindow`).
   - [ ] In the main shell **and** the detached `CanvasWindow` (each is its own
     window/document/webview, #84), subscribe once to
     `getCurrentWebview().onDragDropEvent`. (`getCurrentWebview()` is per-window, so
     each window handles drops landing in it — cross-window correct.)
   - [ ] Convert `payload.position` physical → CSS pixels with
     `window.devicePixelRatio` (matters on Windows fractional scaling **and** macOS
     Retina — verify on both), then `document.elementFromPoint` → `closest(
     "[data-filetree-droptarget]")` to resolve the target directory + its
     `data-filetree-repo`. No match → not a FileTree target → ignore (and emit no
     highlight).
   - [ ] On `"over"`: set the current highlight (repoPath + dir) in a lightweight
     store/state the FileTree reads. On `"leave"`: clear it. On `"drop"`: clear the
     highlight and, for each path in `payload.paths`, call the store move action
     (Subtask 5) targeting the resolved repo+dir; ignore the drop if it didn't resolve
     to a FileTree target.

4. [ ] **FileTree: drop-target markers, highlight, and post-drop refresh**
   (`FileTree.tsx` + `FileTree.module.css`).
   - [ ] Give the tree **root container** `data-filetree-repo={repoPath}` and
     `data-filetree-droptarget=""` (empty = repo root). Give each **folder row**
     `data-filetree-droptarget={node.path}`. Give each **file row**
     `data-filetree-droptarget={parentDir(node.path)}` so a drop onto a file lands in
     its containing directory. (So `closest("[data-filetree-droptarget]")` always
     yields the directory a drop would enter.)
   - [ ] Read the current drag highlight from the store; when it matches this tree's
     repo + a folder path (or `""` for root), apply a `.dropTarget` class
     (accent outline + `--accent-dim` fill, using existing tokens — no off-system
     color, no platform-divergent CSS). Highlight the root container when the target
     is `""`.
   - [ ] After a successful move into `destSubdir`, **reload that directory level**:
     subscribe to a store refresh signal (Subtask 5) keyed by repoPath (+ optionally
     the dir) and re-run `load(destSubdir)` (and `load("")` if root) so the moved item
     shows without a full tree reset. (Reuse/extend the existing `load`/`nonce`
     machinery.)

5. [ ] **Store: drag-highlight state, the move action, refresh signal, toast**
   (`src/store.ts`).
   - [ ] Add transient `fileDropTarget: { repo: string; dir: string } | null` (the
     hovered target) with setters used by the Subtask-3 listener.
   - [ ] Add `moveFilesIntoRepo(repo, destSubdir, sources: string[])`: call
     `ipc.moveIntoRepo` per source via `Promise.allSettled`; on success bump a
     per-repo **refresh signal** (e.g. `fileTreeRefresh: Record<string, number>`
     incremented for `repo`) that the FileTree's load effect depends on, and
     `pushToast` a concise result (e.g. "Moved 2 files into src/utils" or the error).
     Fail-open per file.

6. [ ] **Cross-platform handling (call out explicitly).**
   - [ ] `onDragDropEvent` works on WKWebView (macOS) and WebView2 (Windows) — verify
     the drop fires + the paths arrive on **both**; the source paths are OS-native
     (backslashes on Windows) and pass through to Rust untouched (no `splitPath`).
   - [ ] The move uses `std::fs::rename`/`copy` — **no shell-out**, so no
     `hidden_command` needed; works identically on both OSes (`fs::rename` returns a
     cross-device error on Windows across drives and on macOS across volumes → the same
     copy+remove fallback covers both).
   - [ ] The drop-target highlight is token-driven CSS only.
   - [ ] This is a **GUI drag gesture that CI can't exercise**: implement for both OSes,
     and record the real-box check (Windows WebView2 drop + fractional-DPR hit-test;
     macOS Retina hit-test; cross-volume move) in **`TRAJECTORY_TO_WINDOWS.md`** per the
     CLAUDE.md untestable-path rule.

7. [ ] **Tests + docs.**
   - [ ] Rust: the `move_into_repo` tests (Subtask 1).
   - [ ] Frontend (Vitest): a pure hit-test/target-resolution helper if extracted
     (e.g. `resolveDropTarget(element)` → `{repo, dir} | null`) and the move action's
     result-message formatting.
   - [ ] `npm run build` + `npm run lint` + `npm test` + `cargo test` green.
   - [ ] Update `CLAUDE.md` (the FileTree #167 bullet + the `files.rs` "file access is
     read-mostly, with … writes" note → now two writes: `write_text_file` and
     `move_into_repo`) and `TRAJECTORY_TO_WINDOWS.md`.

**Acceptance criteria**

- [ ] Dragging one or more files from the OS onto a **folder row** in the file tree
  **moves** them into that folder on disk; the moved files appear in the tree without an
  app restart, and a toast confirms the result.
- [ ] Dragging onto the **root area** of the tree (or onto a file row) moves the file
  into the **repo root** (resp. the file's containing directory).
- [ ] While dragging over the tree, the **exact folder/root** that would receive the
  drop is **visually highlighted**, and the highlight clears on leave/drop.
- [ ] A name collision in the target directory is **refused** (no overwrite) with an
  explanatory toast; a move that fails partway leaves the **source intact** (copy-then-
  remove ordering).
- [ ] Dropping a file outside any FileTree (terminal, Canvas background, etc.) does
  nothing and shows no highlight.
- [ ] The feature works in the sidebar tree, an Overview column, a Canvas panel, and a
  **detached canvas window**.
- [ ] **Works on both macOS and Windows:** the drop event + paths arrive on both
  WebViews, the physical→CSS position conversion uses `devicePixelRatio` (correct under
  Retina and Windows fractional scaling), the move uses `std::fs` (no shell, cross-
  volume copy+remove fallback on both), and the highlight is token-only CSS. The
  untestable real-box checks are logged in `TRAJECTORY_TO_WINDOWS.md`.
- [ ] The existing in-app dnd-kit drags (sidebar → Canvas, tab reorder, etc.) are
  unaffected.
- [ ] `npm run build`, `npm run lint`, `npm test`, and the Rust suite pass.

**Notes**

- **Asking the user — deferred per the standing directive.** Per `ASSUMPTIONS.md`
  (2026-06-26, honored by every task since #186), open points were decided autonomously
  rather than stalling the loop. Decisions:
  - **Move, not copy.** The card twice says "moved" / "Items should be moved to this
    location," so the default is a move (which deletes the external source). This is the
    faithful reading; it is implemented **safely** (same-volume rename; cross-volume
    copy-then-remove, so a failure never loses data). The tension (drag-from-Finder
    often *copies*) is flagged: copy, or a modifier-key copy/move toggle, is a one-line
    follow-up if the user prefers it.
  - **Scope = external OS files → tree folders/root only.** "Drag and drop into folders
    or the root" reads as *where incoming files land*, not intra-tree reorg (a separate
    dnd-kit interaction), which is left as a future card. Keeps the dependency graph
    clean (`Depends on: none`).
  - **Collisions refuse rather than overwrite** (consistent with ReCue's careful write
    rules); auto-suffix is the noted alternative.
  - **No confirm gate** — a drag is intentional and the move is data-safe; gating every
    drop would be friction. (The `confirmDestructive` setting is therefore not wired in.)
  - **Drops resolve via a window-global Tauri event + DOM hit-test**, because Tauri's
    drag-drop event is not bound to a DOM element. Hence the `data-filetree-droptarget`
    /`data-filetree-repo` markers + `elementFromPoint` + `devicePixelRatio` conversion.
  - **Directories are moved recursively** (OS drops commonly include folders), via
    rename or recursive copy+remove.
- **Why dnd-kit and OS drop don't clash:** dnd-kit is on a `PointerSensor` (pointer
  events); the OS file drag fires Tauri's webview drag-drop event. They are distinct
  input streams and never both handle the same gesture.
- **Key references:** `FileTree.tsx` (`renderLevel`, `load`, the `nonce` refresh);
  `files.rs` (`confine`, `write_text_file` write-validation pattern); `App.tsx`
  (`DndContext` / `PointerSensor` — leave intact, add the OS-drop listener alongside);
  `CanvasWindow` (#84 — the detached-window document needs its own listener);
  `capabilities/default.json` (`core:default`, windows `["main","canvas-*"]`);
  `store.ts` (`pushToast`). Tauri API: `getCurrentWebview().onDragDropEvent` from
  `@tauri-apps/api/webview`.
- **Read-mostly rule:** this adds the **second** deliberate `files.rs` write
  (`move_into_repo`) after `write_text_file` (#141); update the v1-scope wording in
  `CLAUDE.md` accordingly (no commits, still confine-validated).
