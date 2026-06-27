### 211. [ ] Reorder folders in the sidebar by dragging them up and down

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-27

**Description**

In the left sidebar, the repo "folders" (repo groups) are listed in a fixed
**alphabetical** order produced by the pure `repoOrder(recents, sessions)`
(`src/store.ts:225` — sorts by `repoName` then path). There is no way for the user
to choose the order. This task adds **drag-to-reorder**: the user grabs a folder
header and drags it up or down to reposition that folder in the list, and the chosen
order **persists** across restarts. There is **no separate drag handle** — the whole
repo header is the grip (a click on the title or the `+` still does its normal thing).

Grounding (read before implementing):

- `src/components/Sidebar/Sidebar.tsx` renders the folder list with
  `repos.map((repo) => …)` (expanded list ~line 1481; collapsed rail ~line 1350),
  where `repos = repoOrder([...recents, ...worktreeParents], sessions.filter(s => !s.worktreeParent))`
  (~line 1185).
- A folder's header is the `<div className={styles.repoHeader}>` (~line 1504),
  containing the repo-colored `Folder` icon, the `repoTitle` button (left-click =
  filter Overview; right-click = repo context menu), and the `+` button
  (`startRepoSession`). Inside the group come `SessionRow`s, panel rows, schedule
  rows, and nested worktree sub-groups.
- **Critical constraint:** the sidebar's draggable rows (`SessionRow`, `FileRow`,
  `DiffRow`, etc., all `useDraggable`) are bound to the **app-level** `DndContext`
  in `src/App.tsx` (~line 133) so they can be dragged **into Canvas**. Do **not**
  wrap the repo list in a *new* nested `DndContext` — that would rebind those rows to
  the inner context and break drag-into-Canvas. Add the sortable to the **existing**
  app-level context instead (a `SortableContext` can be a descendant of the app
  `DndContext` while other `useDraggable` items coexist).
- **Persistence pattern to mirror:** the per-repo cluster order (`overview_order`,
  a `HashMap<String, Vec<String>>` in `src-tauri/src/store.rs` with
  `list_overview_order` / `set_overview_order` ipc and the `reorderOverview` store
  action) and the pure helper `mergeRepoOrder(saved, present)` (`src/store.ts:261`)
  that keeps the saved order for items still present and appends new ones. Persist
  the new folder order as a **dedicated Rust value separate from the Settings blob**
  — mirror `sidebar_width` (#108, `get_sidebar_width`/`set_sidebar_width`) so a
  Settings draft can never clobber it.
- **dnd-kit sortable pattern to mirror:** `src/components/Overview/Overview.tsx`
  (`useSortable` ~line 89, `SortableContext` ~721, `arrayMove` ~690) — but vertical
  (`verticalListSortingStrategy`) and inside the app-level context, not a new one.

**Scope / out of scope**

- In scope: drag-reordering the **top-level folder list** in the **expanded**
  sidebar; persisting that order; the collapsed rail **reflecting** the persisted
  order (it renders the same `repos` array).
- Out of scope: drag-reordering **inside** the collapsed rail (icon-only, narrow —
  it just shows the saved order); reordering **within** a repo group (that is the
  shipped #43 Overview cluster order); reordering worktree **sub-groups** under a
  parent; moving a session from one folder to another.

**Subtasks**

1. [ ] Backend (`src-tauri/src/store.rs` + `lib.rs`): add a persisted
   `repo_order: Vec<String>` value with `get_repo_order` / `set_repo_order` commands,
   mirroring `sidebar_width` (a dedicated value, **not** part of the `settings` blob).
   Register the commands. Add a Rust unit test (round-trip persist/reload).
2. [ ] `src/ipc.ts`: add `getRepoOrder()` and `setRepoOrder(order: string[])`
   wrappers.
3. [ ] `src/store.ts`: add `folderOrder: string[]` state, load it on boot (alongside
   the sidebar-width / collapsed load), and a `reorderRepos(ordered: string[])`
   action (optimistic `set` + persist via `setRepoOrder`). Compute the **displayed**
   folder order as `mergeRepoOrder(folderOrder, repoOrder([...recents, ...worktreeParents], sessions…))`
   so spawning a repo appends it and forgetting one drops it without scrambling the
   rest. (Name the state `folderOrder` — do **not** shadow the pure `repoOrder`
   function.)
4. [ ] `src/components/Sidebar/Sidebar.tsx`: wrap the expanded repo list in a
   `SortableContext` (items = `repohead:<repoPath>` keys, `verticalListSortingStrategy`)
   that is a descendant of the app `DndContext`. Make each repo group a
   `useSortable({ id: 'repohead:'+repo })`; spread its `attributes` + `listeners` on
   the **whole `repoHeader`** so the entire header is the grip. Keep the inner
   title/`+`/right-click handlers working (the existing 4px `PointerSensor`
   activation distance already lets a click through without starting a drag).
5. [ ] `src/App.tsx`: in `onDragStart`/`onDragEnd`, detect a folder-sort drag by the
   `repohead:` id prefix and call `reorderRepos(arrayMove(...))`; make sure this drag
   does **not** fall through to the canvas-drop path. Leave all other drag kinds
   (session/file/diff → Canvas, move-leaf) untouched.
6. [ ] Provide drag feedback consistent with the rest of the app (transform via
   `CSS.Translate`/`useSortable`'s `transform`/`transition`; a `rowDragging`-style
   class is fine). No special `DragOverlay` required.
7. [ ] Tests: a `store.test.ts` test for `reorderRepos` (optimistic + persist, mirror
   the `reorderOverview` test) and for the displayed-order merge; update
   `src/store.refresh.test.ts` to mock `ipc.getRepoOrder` (like `getSidebarCollapsed`).
   Run `npm test` and `cargo test`.
8. [ ] Docs: update the Sidebar section of `CLAUDE.md` (folders are now
   drag-reorderable, order persisted via a dedicated `repo_order` value) and
   `README.md` if it lists sidebar capabilities.

**Acceptance criteria**

- [ ] Dragging a repo header up/down in the expanded sidebar reorders the folder
      list; the order **survives an app restart**.
- [ ] No separate drag handle — grabbing anywhere on the header drags it, while a
      plain click on the repo title (filter Overview) and the `+` (new session) and a
      right-click (repo menu) all still work.
- [ ] Sidebar rows (sessions / files / diffs / terminals) still drag **into Canvas**
      (app-level dnd unbroken); the right-edge resize handle still works.
- [ ] The collapsed rail renders folders in the same persisted order.
- [ ] A newly added repo appends at the end of the saved order; forgetting a repo
      drops it without scrambling the others.
- [ ] `npm run lint`, `npm run build` (typecheck), `npm test`, and
      `cargo test --manifest-path src-tauri/Cargo.toml` all pass.

**Notes**

- Decided autonomously (refine loop, user not answering — see `ASSUMPTIONS.md`).
- **Architectural key:** reuse the app-level `DndContext`; nesting a new context
  would break sidebar→Canvas row drags. The `SortableContext` lives in the sidebar
  but the `onDragEnd` handling lives in `App.tsx`, keyed by the `repohead:` id prefix.
- Persist as a dedicated `repo_order` Rust value (like `sidebar_width`), kept out of
  the Settings blob so a settings draft can't clobber it.
- Displayed order = `mergeRepoOrder(folderOrder, repoOrder(...))` so spawn/forget
  don't scramble the saved order — reuse the existing pure helper.
- Collapsed-rail drag reordering and worktree-subgroup reordering are out of scope;
  the rail still reflects the saved order.
