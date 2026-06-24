### 164. [x] Clickable worktree badge → worktree-scoped "open view" menu

**Status:** Done
**Depends on:** none
**Created:** 2026-06-24

**Description**

A worktree agent (#74) shows a small **"worktree"** text badge in its panel/card
header. The card: "An agent that runs inside a worktree has a badge. This badge should
be clickable. Clicking this badge will show a few options. Options to open a diff view,
or file inside this worktree. This opens a special panel in the left plane and inside
the overview mode that displays this newly opened file. Any option should be available."

**Goal / why:** turn the inert "worktree" badge into a quick menu for opening
worktree-scoped views — a diff of the worktree, a file inside it, a terminal, a kanban
board — registered so they appear as a left-panel row **and** an Overview column
associated with that worktree. This is the same addable-view set the repo **Views**
menu (#82) already offers, scoped to the worktree's folder.

**Grounding (concrete files / symbols):**

- The per-agent **"worktree" badge** renders in two headers:
  - `src/components/Canvas/CanvasSurface.tsx` ≈ 194-195:
    `content.kind === "agent" && session?.worktreeParent` →
    `<span className={styles.worktreeBadge}>worktree</span>`.
  - `src/components/Overview/Overview.tsx` (agent card title block) ≈ 176: the same
    `worktreeBadge` span.
  (The **sidebar worktree sub-group header** badge — `Sidebar.tsx` ≈ 752 — is a
  *different*, group-level badge with its own #133 menu; that's the sibling card
  "Worktree context menu", **out of scope** here.)
- **A worktree agent's `session.repoPath` IS the worktree folder** (#74; see
  `Sidebar.tsx` ≈ 888-893 "their repo_path is the worktree folder"). So
  worktree-scoped actions target `session.repoPath`.
- **Adding a view = `addOverviewPanel(repo, kind, file?)`** (store, ≈ `store.ts:538`)
  — the backing action of the #82 repo **Views** menu. It registers an
  `overviewPanels[repo]` entry (kinds `diff` / `terminal` / `kanban` / `markdown`+file),
  which renders as a **left-panel row (#59/#152) + an Overview column**. It accepts any
  path as `repo`, so passing the worktree path works directly.
- The **#82 Views action set** is currently inline in `Sidebar.tsx` (≈ 833-883 + the
  `FilePicker` file-pick flow ≈ 1330-1342): "File viewer" (FilePicker →
  `addOverviewPanel(repo,"markdown",f)`), "Diff" (`addOverviewPanel(repo,"diff")`),
  "Terminal" (`addOverviewPanel(repo,"terminal")`), "Kanban board" (`.md` FilePicker →
  `addOverviewPanel(repo,"kanban",f)`, #151).
- Popover/dismiss pattern to mirror: `FileSwitcher` (click-toggle popover, outside-
  click + Escape dismiss, `onPointerDown` stop-propagation so it never starts a drag).

**Scope:** make the per-agent worktree badge a clickable button opening a popover of
the addable-view actions scoped to `session.repoPath`, in both the Canvas panel header
and the Overview agent card header, reusing a single shared "add view" implementation.

**Explicitly out of scope:**

- The sidebar worktree **group-header** badge and its context menu (#133 + the sibling
  card "Worktree context menu") — that card will reuse the shared menu this task
  extracts.
- "Create agent in the worktree" (mentioned by the sibling card, not this one) — this
  task is about **opening views** (diff/file/terminal/kanban).
- Changing `addOverviewPanel`, the view kinds, or the worktree model.
- The non-worktree "fork" badge (#126) — leave it inert.

**Subtasks**

1. [ ] **Extract a reusable "add view" menu.** Pull the #82 Views action set out of
   `Sidebar.tsx` into a shared component, e.g. `components/ViewsMenu/ViewsMenu.tsx`
   (props: `repoPath`, an `onClose`), rendering the addable views (File viewer →
   `FilePicker`; Diff; Terminal; Kanban board → `.md` `FilePicker` create-or-open #151)
   and calling `addOverviewPanel(repoPath, kind, file?)`. Reuse it in the Sidebar repo
   menu (replace the inline section, no behavior change) **and** the new badge popover —
   one source of truth. (This also sets up reuse for the sibling "Worktree context menu"
   card.) If a full extraction is too invasive in one pass, at minimum share the action
   descriptors + the `addOverviewPanel` calls.
2. [ ] **Make the worktree badge a button.** In `CanvasSurface.tsx` (≈194) and the
   Overview agent card header (≈176), render the worktree badge as a `<button>` that
   toggles the `ViewsMenu` popover scoped to `session.repoPath`. Keep the "worktree"
   label; add a subtle interactive affordance (hover/focus cue, caret) and
   `aria-haspopup="menu"`/`aria-expanded`. `onPointerDown` stop-propagation so the click
   never starts a Canvas move-leaf drag / Overview card drag (mirror `FileSwitcher`).
3. [ ] **Popover behavior:** open on click, dismiss on outside-click + Escape,
   positioned near the badge; reuse the `FileSwitcher`/`RowContextMenu` popover styling.
   The menu lists every addable view ("any option should be available").
4. [ ] **Placement of the opened view (key correctness detail):** each action calls
   `addOverviewPanel(session.repoPath, …)`. Verify the resulting panel appears
   **associated with the worktree** — as a row under the worktree sub-group in the left
   panel and as a column near the worktree agent in Overview — not as a stray group.
   (Overview/sidebar group by `effectiveRepo`, which maps a worktree path → its parent
   cluster, #96; ensure `overviewPanels[worktreePath]` items render under the worktree
   sub-group / parent cluster correctly. Adjust the sidebar/Overview grouping if
   worktree-keyed panels don't already render there.)
5. [ ] **Selection/jump:** a created item, clicked in the left panel, selects/jumps to
   it in the current view (#79) — inherited if registered like any `overviewPanels`
   item; verify.
6. [ ] **Verify:** `npm run build`, `npm run lint`, `npm test`. Manual: for a worktree
   agent, click the badge in **both** the Canvas panel header and the Overview card
   header → the menu opens → Open diff / Open file (picker) / Open terminal / Open
   kanban each create the view scoped to the worktree, appearing in the left panel +
   Overview with the worktree; the repo Views menu (#82) still works unchanged
   (shared component).

**Acceptance criteria**

- [ ] The per-agent "worktree" badge (Canvas panel header **and** Overview agent card
      header) is a clickable button that opens a popover; clicking it never starts a
      drag.
- [ ] The popover offers the full addable-view set (open diff, open file via picker,
      open terminal, open kanban) scoped to the agent's worktree folder.
- [ ] Selecting an action opens that view against the worktree path and it appears as a
      left-panel row + an Overview column **associated with the worktree**.
- [ ] The #82 repo Views menu and the badge popover share one implementation (no
      duplicated action set).
- [ ] Popover dismisses on outside-click / Escape.
- [ ] `npm run build`, `npm run lint`, `npm test` pass.

**Notes**

- **Reuse, don't reinvent:** the badge menu is the #82 Views action set scoped to the
  worktree's path (`session.repoPath`). Extracting that set into a shared `ViewsMenu`
  is the core of the task and prevents the repo menu and the badge popover from
  diverging — and gives the sibling **"Worktree context menu"** card a ready component
  to reuse (so that card will likely `Depend on` this one).
- **Grouping caveat:** the only non-trivial wiring is making a worktree-path-keyed
  `overviewPanels` entry render under the worktree (subtask 4). Worktree agents already
  nest under their parent cluster via `effectiveRepo` (#96); the opened views must land
  in the same place rather than spawning a stray group.
- **Both surfaces:** the badge shows in Canvas panel headers and Overview card headers,
  so both must be clickable (the sidebar group-header badge is a separate, #133/sibling-
  card concern).
- **Task numbering:** highest existing is #163 (TASK-154…163.md; board #157–#163;
  `TASK_ARCHIVE.md` ≤ #153). Hence #164.
- **Dependencies:** none — builds on shipped infra: #74 (worktree agents / `repoPath` =
  worktree folder), #82 (`addOverviewPanel` + Views set), #59/#152 (overview panels =
  left panel + Overview), #56/#151 (`FilePicker`), and the `FileSwitcher` popover
  pattern.
- **References:** `CanvasSurface.tsx` (≈194 worktree badge, `panelActions`),
  `Overview.tsx` (≈176 worktree badge, agent actions), `Sidebar.tsx` (Views section
  ≈833-883, FilePicker flow ≈1330-1342, worktree grouping ≈888-896),
  `store.ts:538` (`addOverviewPanel`), `FileSwitcher/FileSwitcher.tsx` (popover pattern),
  `paths.ts` (`effectiveRepo`).

**Implementation note (done 2026-06-24)**

All subtasks shipped, in three parts:
- **Shared `ViewsMenu`** (`components/ViewsMenu/`): the #82 addable-view action set
  (File viewer / Kanban board → inline `FilePicker`; Diff; Terminal) extracted into
  one self-contained component (`{repoPath, onClose}`) calling `addOverviewPanel` /
  `createKanbanBoard`. The Sidebar repo menu now renders `<ViewsMenu>` in its Views
  section (its `menuMode:"files"` branch, `filePickKind`/`fileList` state, the
  files-loading effect, and the inline `viewTypes` were removed — one source of truth).
- **Clickable badge** (`components/WorktreeViewsBadge/`): the inert "worktree" badge
  is now a button + popover (`role="menu"`, `aria-haspopup`/`aria-expanded`,
  ChevronDown caret, hover/focus cue) hosting `<ViewsMenu repoPath={session.repoPath}>`
  (the worktree folder). Dismisses on outside-click + Escape; `onPointerDown`
  stop-propagation so opening it never starts a Canvas move-leaf / Overview card drag
  (mirrors `FileSwitcher`). Rendered in both `CanvasSurface` and the Overview
  `SessionCard`.
- **Worktree-keyed panel grouping** (subtask 4): a view opened from the badge is
  keyed by the worktree path. **Sidebar** — extracted `renderPanelRows(repoKey)` and
  call it inside each worktree sub-group, so worktree panels render under that
  worktree. **Overview** — map each panel key through `clusterRepoOf` (worktree path
  → parent via the sessions' `worktreeParent`) so worktree panels cluster under the
  **parent** repo (no stray group) while each `ExtraPanel` renders/removes against its
  own `repoKey`; the `ColumnItem` panel variant now carries `repoKey`.
- **Selection/jump** (subtask 5): inherited — the rows register like any
  `overviewPanels` item and `selectItem` carries the worktree `repoKey`.

**Deliberate behavior refinement (recorded):** the Sidebar repo menu's File/Kanban
picker now renders **inline within the Views section** (the surrounding New session /
Reveal / destructive items stay visible) rather than replacing the whole menu — a
consequence of making `ViewsMenu` self-contained for reuse. Functionally identical;
the action set is now shared (acceptance #4). The sibling **"Worktree context menu"**
(#166) can reuse `ViewsMenu`.

`npm run build`, `npm run lint`, `npm run format:check`, and `npm test` (212) all
pass. Subtask 6 manual walk-through is interactive; the grouping logic is verified by
build + reasoning (worktree path → parent cluster; rows render under the worktree).
