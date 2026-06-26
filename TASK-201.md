# Task 201

### 201. [ ] Folder/worktree context menu: collapse the two "New session" items into one

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-26

**Description**

The sidebar **repo (folder) context menu** shows **two** "new session" actions, which reads
as redundant/confusing:

1. A **top-level "New session"** (`Sidebar.tsx` ~1722) → `startRepoSession(menu.repo)` (#127
   — opens the new-session flow at the branch step, "mirrors the inline + button").
2. **"New session here"** as the first item of the shared **`ViewsMenu`** (`ViewsMenu.tsx`
   ~113) → `spawnSession(repoPath)` (#177 — instant spawn on the current branch), rendered
   under the menu's **Views** section (`Sidebar.tsx` ~1739).

The same duplication exists in the **worktree header menu** (`WorktreeHeader`): a top-level
"New session" (~949, `spawnWorktreeSession`) **and** the embedded `ViewsMenu`'s "New session
here" (~956). Collapse each menu to a **single** "New session".

**Goal & why.** One unambiguous "New session" per folder/worktree menu — less clutter, no
"which one do I click?".

**Design.** Make `ViewsMenu`'s "New session here" **optional** and suppress it wherever the
host menu already renders its own top-level "New session":
- Add a prop **`includeNewSession?: boolean`** (default `true`) to `ViewsMenu`. When `false`,
  it renders only the view items (file/diff/terminal/kanban/filetree) — no "New session here"
  and no leading separator.
- The **repo context menu** and the **worktree header menu** (both already render a top-level
  "New session") pass `includeNewSession={false}`, keeping their existing top-level item.
- The standalone **`WorktreeViewsBadge` popover** (#164 — `ViewsMenu` rendered alone, no
  separate top-level "New session") keeps the default (`true`), so it still offers it.

**Which "New session" survives.** The **top-level** one in each menu — the repo menu's
`startRepoSession` (branch-aware, matches the inline `+`) and the worktree menu's
`spawnWorktreeSession` (reuses the worktree). The instant `spawnSession` "New session here"
is dropped **only** from menus that already have a top-level new-session action; it remains
in the badge popover.

**Scope.** A small prop on `ViewsMenu` + two call sites passing it. No behavior change to the
surviving "New session" actions or the view items.

**Out of scope.**
- Changing what the top-level "New session" does (branch picker for repos, reuse for
  worktrees) — unchanged.
- The worktree header redesign (#196) / its inline `+` (which already maps to the surviving
  "New session" action).
- Removing "New session here" from the badge popover (it's the only new-session affordance
  there).

**Concrete files/symbols.**
- `src/components/ViewsMenu/ViewsMenu.tsx` — add `includeNewSession?: boolean` (default true);
  gate the "New session here" button + its trailing separator on it.
- `src/components/Sidebar/Sidebar.tsx` — repo context menu (`<ViewsMenu repoPath={menu.repo}
  …>` ~1739) and `WorktreeHeader` (`<ViewsMenu repoPath={path} …>` ~956): pass
  `includeNewSession={false}`.

**Subtasks**

1. [ ] `ViewsMenu`: `includeNewSession` prop (default true) gating the "New session here"
   button + leading separator.
2. [ ] Pass `includeNewSession={false}` from the repo context menu and the worktree header
   menu; leave the `WorktreeViewsBadge` popover on the default.
3. [ ] **Verify** — `npm run build`, `npm run lint`, `npm test` green; Rust untouched.
   Manual (or note): the repo and worktree context menus each show exactly **one** "New
   session"; the worktree-badge popover still shows "New session here"; the view items are
   unchanged.

**Acceptance criteria**

- [ ] The repo (folder) context menu shows a **single** "New session"; ditto the worktree
      header menu.
- [ ] The `WorktreeViewsBadge` popover still offers "New session here".
- [ ] The view items (file/diff/terminal/kanban/filetree) and the surviving "New session"
      behaviors are unchanged.
- [ ] `npm run build`, `npm run lint`, `npm test` pass; no Rust changes.

**Notes**

- **Autonomous refine (2026-06-26):** decisions logged in `ASSUMPTIONS.md`.
  - **Keep the top-level "New session"** (repo: `startRepoSession` branch-aware, mirrors the
    inline `+`; worktree: `spawnWorktreeSession` reuse) and **suppress `ViewsMenu`'s "New
    session here"** in menus that already have a top-level one, via an `includeNewSession`
    prop. The standalone badge popover keeps it.
  - **Applied to the worktree header menu too** (same duplication), not just the repo menu, so
    the two stay consistent — though the card named only the "folder" menu.
- **Depends on: none** — a local `ViewsMenu` prop + two call sites.
- **References:** `ViewsMenu.tsx` "New session here" (~113–124), `Sidebar.tsx` repo menu
  top-level "New session" (~1722) + `ViewsMenu` (~1739), `WorktreeHeader` top-level "New
  session" (~949) + `ViewsMenu` (~956), `WorktreeViewsBadge` (#164). CLAUDE.md "Views" (#82/#164).
