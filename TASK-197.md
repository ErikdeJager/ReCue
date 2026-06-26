# Task 197

### 197. [ ] Click a worktree in the sidebar to filter Overview to just that worktree

**Status:** Not started
**Depends on:** #196
**Created:** 2026-06-26

**Description**

Clicking a **repo** name in the sidebar filters the Overview wall to that repo
(`overviewRepoFilter`, #34). A **worktree** sub-group header (`WorktreeHeader`,
`src/components/Sidebar/Sidebar.tsx`) isn't clickable that way, so there's no way to narrow
Overview to a single worktree. Make a worktree header click filter Overview to **only the
items running/shown inside that worktree**, mirroring the repo filter.

**The core wrinkle.** The Overview filter matches on **`effectiveRepo(s) === filter`**
(`paths.ts`; used in `store.ts overviewClusters` ~261 and `Overview.tsx` ~597), but a
worktree agent's **`effectiveRepo` is its parent repo** (#96) — so a worktree folder can't
be a filter target as-is. Broaden the filter predicate to also match the **actual folder**:
a session is in-filter when `effectiveRepo(s) === filter || s.repoPath === filter`. With
`filter` = a worktree dest, only that worktree's sessions (whose `repoPath` is the worktree
folder) match; with `filter` = a repo, behavior is unchanged (a worktree's `repoPath` never
equals the parent repo). Non-agent panels/schedules keyed to the worktree folder should
likewise show under that filter (they're keyed by `repoPath`).

**Goal & why.** Let the user focus Overview on one worktree the same way they focus on a
repo — useful when several worktrees of one repo each run their own agents.

**Behavior.**
- The worktree header's **name** becomes a click target → `setOverviewRepoFilter(dest)`
  (the worktree's folder `path`), toggling off if it's already the active filter (mirroring
  the repo name, `store.ts` `setOverviewRepoFilter` ~1312 already toggles). Like a repo
  click, it does **not** force a view switch (#79) — it just sets the filter.
- The filter predicate (everywhere it's `effectiveRepo(s) === filter`) becomes
  `effectiveRepo(s) === filter || s.repoPath === filter`, so a worktree-folder filter shows
  only that worktree's items; the "clear filter" affordance (`Overview.tsx` ~701) clears it.
- The active-filter highlight should mark the **worktree** row (not just repo rows) when its
  dest is the filter.

**Scope.** The clickable worktree name + the broadened filter predicate (store +
Overview). Reuses the existing `overviewRepoFilter` mechanism.

**Out of scope.**
- Changing how worktree items **cluster** under the parent repo (#96) — filtering narrows
  *which* items show; grouping is unchanged (the filtered worktree's items still render under
  the parent cluster header, now showing only that worktree).
- The worktree header's icon/`+` button (#196) and the other worktree cards.
- Any new filter UI beyond making the worktree name clickable like a repo name.

**Concrete files/symbols.**
- `src/components/Sidebar/Sidebar.tsx` — `WorktreeHeader` (~846): make the `worktreeName`
  span a click target → `setOverviewRepoFilter(path)`; active highlight when
  `overviewRepoFilter === path`.
- `src/store.ts` — `overviewClusters` filter (~261) + `setOverviewRepoFilter` (already
  toggles): broaden the predicate to `effectiveRepo(s) === filter || s.repoPath === filter`.
- `src/components/Overview/Overview.tsx` — the matching filter predicate (~597, ~650) +
  cluster rendering: same broadening; ensure a worktree-folder filter renders its items.
- `src/paths.ts` — possibly a small helper `sessionInFilter(session, filter)` shared by both
  call sites so the predicate has one definition.

**Subtasks**

1. [ ] Add a shared filter predicate (`effectiveRepo === filter || repoPath === filter`),
   used by `store.ts overviewClusters` and `Overview.tsx`.
2. [ ] Make the worktree header name clickable → `setOverviewRepoFilter(path)` (toggle),
   with an active-filter highlight on the worktree row.
3. [ ] Verify non-agent worktree panels + schedules keyed to the worktree folder appear under
   the worktree filter; the clear-filter control resets it.
4. [ ] **Verify** — `npm run build`, `npm run lint`, `npm test` green; Rust untouched.
   Manual (or note as runtime-unverified): clicking a worktree narrows Overview to that
   worktree's items; clicking again clears; clicking the parent repo still shows the whole
   repo incl. its worktrees.

**Acceptance criteria**

- [ ] Clicking a worktree header filters Overview to **only that worktree's items**; clicking
      it again clears the filter; repo filtering is unchanged.
- [ ] The active worktree filter is visually indicated on its sidebar row.
- [ ] `npm run build`, `npm run lint`, `npm test` pass; no Rust changes.

**Notes**

- **Autonomous refine (2026-06-26):** decisions logged in `ASSUMPTIONS.md`.
  - **Filter predicate broadened to `effectiveRepo === filter || repoPath === filter`** — a
    worktree's `effectiveRepo` is the parent (#96), so the folder must match directly.
  - **No view switch / no grouping change** — only narrows which items show (mirrors the repo
    filter #34/#79).
- **Depends on: #196** — both edit `WorktreeHeader`; sequenced after the #196 header redesign
  (icon + `+` button) to avoid conflicting edits. Functionally independent otherwise.
- **References:** `Sidebar.tsx WorktreeHeader` (~846), `store.ts overviewClusters` (~261) /
  `setOverviewRepoFilter` (~1312), `Overview.tsx` filter (~597/650/701), `paths.ts
  effectiveRepo`. CLAUDE.md "Overview customization" + "#34 repo filter".
