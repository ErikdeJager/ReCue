# Task 201

### 201. [x] Folder/worktree context menu: collapse the two "New session" items into one

**Status:** Done
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

1. [x] `ViewsMenu`: added an `includeNewSession?: boolean` prop (default `true`) gating the
   "New session here" instant-spawn button **and** its trailing separator (wrapped together in
   a fragment so neither renders when `false`).
2. [x] Passed `includeNewSession={false}` from the **repo context menu** (`Sidebar.tsx` ~1790)
   and the **worktree header menu** (~1003), each of which already has its own top-level "New
   session". Left the shared `ViewsPopover` (→ `ViewsMenu`) on the default, so **both**
   standalone popovers that render `ViewsMenu` alone — `WorktreeViewsBadge` (#164) and
   `OpenViewButton` (#165/#177) — keep "New session here" (neither has a separate top-level
   new-session action).
3. [x] **Verify** — `npm run build` ✓, `npm run lint` ✓, `npm test` (288) ✓, prettier ✓; Rust
   untouched. Manual GUI check is runtime-unverified in this autonomous loop (no GUI) — see
   Notes; the change is a pure prop gate.

**Acceptance criteria**

- [x] The repo (folder) context menu shows a **single** "New session" (top-level
      `startRepoSession`); ditto the worktree header menu (top-level `spawnWorktreeSession`) —
      the `ViewsMenu`'s "New session here" is suppressed in both.
- [x] The `WorktreeViewsBadge` popover still offers "New session here" (default prop via the
      shared `ViewsPopover`); `OpenViewButton` does too.
- [x] The view items (file/diff/terminal/kanban/filetree) and the surviving "New session"
      behaviors are unchanged (only the leading button + separator are conditionally rendered).
- [x] `npm run build`, `npm run lint`, `npm test` pass; no Rust changes.

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

**Implementation notes (2026-06-26 — done)**

- **One prop, two call sites.** `ViewsMenu` gained `includeNewSession?: boolean` (default
  `true`); the "New session here" button + its separator are wrapped in a fragment gated on it.
  The repo context menu and the worktree header menu (both with their own top-level "New
  session") pass `includeNewSession={false}`.
- **Found a third `ViewsMenu` render** beyond the two the card named: the shared
  `ViewsPopover` (`ViewsMenu/ViewsPopover.tsx` ~59), used by **both** `WorktreeViewsBadge`
  (#164) **and** `OpenViewButton` (#165/#177). Both are standalone popovers rendering
  `ViewsMenu` alone with **no** separate top-level new-session action, so I deliberately left
  them on the default `true` — they remain the sole "New session here" affordance in those
  surfaces (matches the card's intent for the badge popover, and keeps `OpenViewButton`'s
  documented "plus an instant New session here" behavior). No change to `ViewsPopover`.
- **Runtime-unverified (autonomous loop, no GUI):** the visual "exactly one New session per
  context menu" check. It's a pure conditional-render prop gate; build/lint/tests/prettier all
  pass and no Rust changed. Recommend a quick `npm run tauri dev` glance at the repo +
  worktree context menus and the badge/open-view popovers.
