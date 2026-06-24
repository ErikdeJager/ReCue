### 166. [x] Worktree context menu: new session, open views, and close worktree

**Status:** Done
**Depends on:** #164
**Created:** 2026-06-24

**Description**

The worktree sub-group header in the left panel (#74) has a right-click context menu
(#133) that today only offers **Reveal in Finder** and **Copy absolute path**. The
card: "The context menu of a worktree inside the left panel should also include options
to inspect a file, create agent, etc. currently only shows absolute path and reveal in
finder. But should include options to start anything within this worktree, from new
sessions, to files. Also option to close the worktree entirely, killing its contents."

**Goal / why:** make the worktree header a full action hub — start a new agent in the
worktree, open views (file/diff/terminal/kanban) scoped to it, and tear the whole
worktree down — instead of just the two non-destructive items it has now.

**Grounding (concrete files / symbols):**

- `src/components/Sidebar/Sidebar.tsx` — `WorktreeHeader({ path, branch })` (≈ 736-770)
  renders the header + a `RowContextMenu` (#132) with just Reveal/Copy. Its render site
  (≈ 1232) is inside the worktree group, where `wt` (worktree abs path), `wtBranch`, and
  `wtAgents` (the worktree's agents) are in scope. **All agents in a worktree share the
  same `worktreeParent`** (the parent repo) — available as `wtAgents[0]?.worktreeParent`.
- **Open views (reuse #164):** the `ViewsMenu` extracted in #164 — given a `repoPath`,
  lists the addable views (File viewer → `FilePicker`; Diff; Terminal; Kanban → `.md`
  `FilePicker`) and calls `addOverviewPanel(repoPath, kind, file?)` (`store.ts:538`). A
  worktree agent's `repoPath` is the worktree folder, so scoping the menu to the
  worktree `path` opens views inside it (left panel + Overview, #59/#152). **This is
  why the task depends on #164.**
- **New session in the worktree:** `spawnWorktreeSession(repo, branch)` (`store.ts:664`,
  impl ≈ 2307) **creates-or-reuses** the app-managed worktree for `(parentRepo,
  branch)` and spawns an agent there with `worktree_parent = parentRepo`. Calling it
  with the worktree's `(parent, branch)` **reuses** the existing worktree (ref-count++),
  nesting the new agent under the same header — no new backend needed.
- **Close worktree:** `killAllAgents(path)` (`store.ts:706`/≈733) kills every agent with
  `repoPath === path` (the worktree's own agents) and runs **ref-counted worktree
  cleanup** (`cleanupWorktreeIfEmpty` → `git worktree remove`, keeping a *dirty*
  worktree, #74); `closeAllItems(path)` (≈ 709/815) tears down the worktree's non-agent
  items. Scoped to the worktree `path`, together they "close the worktree entirely."
  Both are the same actions the repo menu's **Kill all agents** / **Close all items**
  (#91) use; gate behind `confirmDestructive` (#103) as those do.
- **Repo menu reference (#82/#130):** the repo's own context menu already shows the
  Views section + Reveal/Copy + Kill-all/Forget — mirror its structure for the worktree
  header (scoped to the worktree path instead of the repo).

**Scope:** expand the `WorktreeHeader` `RowContextMenu` with **New session**, the
**open-view** actions (reusing #164's `ViewsMenu`, scoped to the worktree path), the
existing Reveal/Copy, and a destructive **Close worktree** — all operating on the
worktree's own folder.

**Explicitly out of scope:**

- The per-agent worktree **badge** menu (that's #164; this reuses its `ViewsMenu`).
- Normal-repo / non-worktree menus (already covered by #82/#130).
- Changing worktree create/remove semantics (reuse #74 ref-counting + dirty-keep).
- Branch selection for "New session" — a worktree is tied to one branch, so New session
  adds another agent on that **same** worktree/branch (no branch step).

**Subtasks**

1. [ ] **Pass the parent repo to `WorktreeHeader`:** add a `parent` prop and pass
   `parent={wtAgents[0]?.worktreeParent ?? undefined}` at the render site (≈1232) so
   the menu can start a worktree session. (Guard: if no parent is resolvable, disable
   "New session".)
2. [ ] **Expand the `RowContextMenu` items** in `WorktreeHeader`:
   - **New session** → `spawnWorktreeSession(parent, branch)` (create-or-reuse → joins
     the existing worktree, ref-count++).
   - **Open views** — reuse #164's `ViewsMenu` scoped to `path`: Open file… / Open
     diff / Open terminal / Open Kanban board, each via `addOverviewPanel(path, …)`.
     Integrate it the way the repo menu (#82) does (a Views section + the `FilePicker`
     file-pick mode), reusing the shared component so the action set never diverges.
   - **Reveal in Finder** / **Copy absolute path** — keep as-is.
   - **Close worktree** (danger, confirm-gated per `confirmDestructive` #103) →
     `killAllAgents(path)` then `closeAllItems(path)` — kills the worktree's agents
     (triggering ref-counted `git worktree remove`, dirty kept) and closes its items.
3. [ ] **Opened-view placement:** reuse #164's handling so views registered under the
   worktree `path` render under the worktree sub-group (left panel) and near it in
   Overview — not as a stray group.
4. [ ] **Confirm-gating:** "Close worktree" honors the `confirmDestructive` setting
   (#103), matching the repo Kill-all/Forget flow (a confirm step, or immediate when the
   setting is off).
5. [ ] **Verify:** `npm run build`, `npm run lint`, `npm test`. Manual: right-click a
   worktree header → New session starts another agent nested under that worktree; Open
   diff/file/terminal/kanban open scoped to the worktree (left panel + Overview);
   Reveal/Copy still work; Close worktree (after confirm) kills its agents, removes the
   worktree (a clean one; a dirty one is kept), and closes its items.

**Acceptance criteria**

- [ ] The worktree header context menu includes: **New session**, open-view actions
      (file / diff / terminal / kanban scoped to the worktree), Reveal in Finder, Copy
      absolute path, and **Close worktree** (destructive).
- [ ] New session adds an agent to the **existing** worktree (nested under the same
      header, ref-counted) — it does not create a second worktree.
- [ ] Open-view actions create views scoped to the worktree, appearing in the left
      panel + Overview associated with that worktree.
- [ ] Close worktree kills the worktree's agents (ref-counted `git worktree remove`,
      dirty kept) and closes its items; it is confirm-gated per `confirmDestructive`.
- [ ] Reveal in Finder / Copy absolute path still work.
- [ ] `npm run build`, `npm run lint`, `npm test` pass.

**Notes**

- **Reuse over rebuild:** every action already exists — `spawnWorktreeSession`
  (create-or-reuse), `addOverviewPanel` via #164's `ViewsMenu`, and
  `killAllAgents`+`closeAllItems` (the #91 teardown with #74 ref-counted worktree
  cleanup). This task wires them into the worktree header menu; the only genuinely new
  bit is threading the `parent` repo into `WorktreeHeader`.
- **Depends on #164** for the shared `ViewsMenu` (open-views items) — without it this
  would duplicate the view-action set. The sibling cards #164/#165 form a family
  (worktree badge / normal-agent button / this worktree menu) all reusing that menu.
- **Close-worktree scope:** `killAllAgents(path)` matches `repoPath === path` (the
  worktree's agents) — a worktree has no nested worktrees, so it cleanly targets just
  this worktree. Ref-counted cleanup removes the worktree when its last agent goes (a
  dirty worktree is intentionally kept, #74).
- **Task numbering:** highest existing is #165 (TASK-154…165.md; board #158–#165;
  `TASK_ARCHIVE.md` ≤ #153). Hence #166.
- **References:** `Sidebar.tsx` (`WorktreeHeader` ≈736-770, render site ≈1225-1240,
  repo menu Views/Kill-all for structure), `store.ts` (`spawnWorktreeSession` ≈664/2307,
  `killAllAgents` ≈706/733, `closeAllItems` ≈709/815, `cleanupWorktreeIfEmpty` ≈680,
  `addOverviewPanel` ≈538), TASK-164 (`ViewsMenu`), `RowContextMenu` (#132, Sidebar ≈76).

**Implementation note (done 2026-06-24)**

`WorktreeHeader` (`Sidebar.tsx`) gained a full right-click menu (replacing its
2-item `RowContextMenu`) mirroring the repo menu structure, scoped to the worktree
`path`:
- **New session** → `spawnWorktreeSession(parent, branch)` (create-or-reuse → joins
  the existing worktree, ref-count++, nests under the same header). New props
  `parent` (= `wtAgents[0]?.worktreeParent`) and `agentCount` threaded from the
  render site; "New session" is `aria-disabled` when no parent is resolvable.
- **Views** → the shared #164 `ViewsMenu repoPath={path}` (file/diff/terminal/kanban),
  so the action set never diverges. Opened views register under `overviewPanels[path]`
  → they render under the worktree sub-group (left panel) + the parent cluster
  (Overview) via #164's grouping — placement inherited, no new wiring (subtask 3).
- **Reveal in Finder** / **Copy absolute path** — unchanged.
- **Close worktree** (danger) → `killAllAgents(path)` (ref-counted `git worktree
  remove`, dirty kept, #74) + `closeAllItems(path)`. **Confirm-gated** on
  `confirmDestructive` (#103) via a local `confirming` step ("Kill N agents & close
  worktree?" / "Close worktree & remove its items?"); immediate when the setting is off.
- Built on existing actions only; the menu reuses the Sidebar's `.menu`/`.menuItem`/
  `.menuSection`/`.menuItemDanger`/`.menuDanger` classes. `RowContextMenu` stays for
  the other rows.
- `npm run build`, `npm run lint`, `npm run format:check`, and `npm test` (212) all
  pass. Subtask 5 manual walk-through is interactive; every wired action is a shipped,
  tested store/ipc path.
