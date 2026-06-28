# TASK-250

### 250. [ ] Hide a repo folder's branch line when the folder has no own items

**Status:** Done · _(Not started | In progress | Done)_
**Depends on:** none
**Created:** 2026-06-28

**Description**

In the left sidebar, each repo "folder" shows its current branch on a line
directly beneath the folder header — the **`RepoBranchLine`** component (#236),
rendered from `RepoGroup` in `src/components/Sidebar/Sidebar.tsx` at the gate:

```tsx
{branches[repo] && (
  <RepoBranchLine repo={repo} branch={branches[repo]} isFiltered={branchActive} />
)}
```

(`Sidebar.tsx:1624-1630`). The branch line shows whenever the repo's current
branch is **known** (`branches[repo]` truthy) — **regardless of whether the
folder actually contains any opened items**.

A repo folder appears in the sidebar from **persisted recents ∪ active-session
repos** (`Sidebar.tsx:1750-1751`), so a *recent* git folder is listed (greyed
header + coral `+`) even with **zero** sessions/items — and because its branch is
read into the `branches` map, its branch line still shows. That is the reported
problem: an empty folder shouldn't show a branch line.

**Goal:** only render the repo's branch line when the folder has at least one of
its **own** items opened. When the folder is empty (nothing opened in the repo's
own directory), hide the branch line. The folder header itself still shows (the
recents affordance is unchanged) — only the branch line is gated.

**What counts as an "own item" (confirmed with the user):** the rows rendered
directly under the repo header for the repo's **own** directory —

1. **Own agent sessions** — `repoSessions` (`Sidebar.tsx:1535-1537`:
   `sessions.filter((s) => s.repoPath === repo && !s.worktreeParent)`).
2. **Own non-agent panels** — files / diffs / terminals / kanban, i.e.
   `overviewPanels[repo]` (the same list `renderPanelRows(repo)` renders at
   `Sidebar.tsx:1659`).
3. **Own-folder schedules** — pending schedules that render at the parent level,
   i.e. `schedules.filter((s) => s.cwd === repo && !scheduleNestsUnderWorktree(s))`
   (the exact predicate already used at `Sidebar.tsx:1665-1666`).

**Worktree sub-groups do NOT count** (the user's explicit decision — "Own-directory
items only"). A folder whose *only* content is a nested worktree sub-group
(`worktreeAgents` / `worktreeSchedules`, rendered at `Sidebar.tsx:1682-1743`)
**hides** the repo's own branch line; the worktree sub-group keeps its own branch
indicator (`WorktreeHeader`), so no branch context is lost.

**Scope**

- Add a `hasOwnItems` check in `RepoGroup` (the component starting near
  `Sidebar.tsx:1499`) and gate the `RepoBranchLine` render on it
  (`Sidebar.tsx:1624`).
- Frontend-only, in `src/components/Sidebar/Sidebar.tsx`.

**Out of scope**

- The **folder header** itself — it still renders for recent/empty folders
  (greyed via `styles.repoEmpty`, coral `+`); do **not** hide the header or change
  the `isEmpty` styling (`Sidebar.tsx:1538`, `1572`, `1601`, `1607`). `isEmpty`
  (no sessions) is a separate concept from `hasOwnItems` (no own items at all) —
  keep both; a folder with panels but no sessions is still `isEmpty` (greyed
  header) yet now shows its branch line because it has items.
- **Worktree sub-groups** and their own `WorktreeHeader` branch indicators —
  unchanged. (Per the user's decision, they do not keep the parent's own branch
  line visible.)
- The **collapsed rail** — it renders icon-only repo markers + agent dots with no
  branch *text*, so it is unaffected; no change needed there.
- The `RepoBranchLine` component's internals (its menu, filter-on-click, etc.) —
  unchanged; we only change *whether* it is rendered.

**Subtasks**

1. [ ] In `RepoGroup`, read `overviewPanels` from the store (it isn't currently
   destructured there — add `const overviewPanels = useStore((s) => s.overviewPanels);`
   alongside the existing hooks near `Sidebar.tsx:1503-1517`). `schedules`,
   `sessions`, and `scheduleNestsUnderWorktree` are already in scope (used at
   `Sidebar.tsx:1556-1557`, `1665-1666`), and `repoSessions` is already computed
   (`Sidebar.tsx:1535-1537`).
2. [ ] Compute the own-items flag in `RepoGroup` (place it near the existing
   `isEmpty` / `worktreePaths` computations, ~`Sidebar.tsx:1538-1559`):
   ```ts
   const hasOwnSchedules = schedules.some(
     (s) => s.cwd === repo && !scheduleNestsUnderWorktree(s),
   );
   const hasOwnItems =
     repoSessions.length > 0 ||
     (overviewPanels[repo]?.length ?? 0) > 0 ||
     hasOwnSchedules;
   ```
3. [ ] Gate the branch line on it — change `Sidebar.tsx:1624` from
   `{branches[repo] && (` to `{branches[repo] && hasOwnItems && (`. Leave the
   `RepoBranchLine` props and body unchanged.
4. [ ] Sanity-check that opening the **first** item in an empty folder (spawn an
   agent, open a file/diff, or add a schedule) makes the branch line appear, and
   removing the **last** item hides it again (the gate is reactive — `sessions` /
   `overviewPanels` / `schedules` are all store-subscribed in `RepoGroup`).

**Acceptance criteria**

- [ ] A recent/empty repo folder (no own agents, no own panels, no own-folder
  schedules) shows **no** branch line — just the (greyed) header with its coral
  `+`.
- [ ] Opening any own item in that folder (an agent, a file/diff/terminal/kanban
  panel, or an in-folder schedule) makes the repo's branch line appear; removing
  the last own item hides it again.
- [ ] A folder whose **only** content is a worktree sub-group shows **no** repo
  branch line (the worktree sub-group still shows its own branch via
  `WorktreeHeader`).
- [ ] The folder **header** still renders for empty recent folders (greyed + coral
  `+`) — only the branch line is gated; no regression to the `isEmpty` styling,
  the count badge, the `+` new-session button, drag-to-reorder, or the branch
  line's own click-to-filter / right-click menu when it *is* shown.
- [ ] `npm run build` (type-check) and `npm run lint` pass.
- [ ] **Works on both macOS and Windows** — this is pure frontend React/TS logic
  in `Sidebar.tsx` with no paths, shell-outs, keyboard handling, or
  platform-divergent CSS/WebView behavior, so it behaves identically on both; no
  `#[cfg]` gating or `platform` signal is involved.

**Notes**

- **User decision (step 5 question):** asked whether a folder whose only content
  is a worktree sub-group should still show the repo's own branch line. User chose
  **"Own-directory items only"** — so worktree sub-groups do **not** keep the
  parent's branch line visible; only the repo's own sessions/panels/own-folder
  schedules do. (The literal-reading alternative — "any child, including a
  worktree, counts" — was rejected.)
- Why `hasOwnItems` is broader than the existing `isEmpty`: `isEmpty` only counts
  own *sessions* (it drives the greyed header + coral `+` affordance, #236). The
  branch-line gate must also count panels and own-folder schedules, so it needs a
  separate flag. Keep `isEmpty` exactly as-is to avoid changing header styling.
- The `scheduleNestsUnderWorktree` predicate and the `worktreeSchedules` filter
  already encode the "this schedule belongs to a worktree, not the parent folder"
  rule (`Sidebar.tsx:1556-1557`, `1665-1666`); reuse the same predicate so the
  branch-line gate and the schedule-row rendering stay consistent.
- No pure-function unit test is added (the gate is inline JSX, matching the
  surrounding `isEmpty` / `branchActive` inline computations); verification is by
  build/lint + manual check in the running app. If a test is desired later, the
  `hasOwnItems` expression could be extracted into a tiny pure helper in
  `paths.ts` and unit-tested, but that is not required by this task.
