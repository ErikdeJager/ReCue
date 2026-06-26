# Task 199

### 199. [ ] Worktree auto-delete guard: count ALL item types, and run on every item close

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-26

**Description**

A worktree (#74) is app-managed and should be removed **the moment its last item is
closed**, but **never while any item still references it**. The current ref-counted cleanup
**only counts agents**: `cleanupWorktreeIfEmpty(parent, dest)` (`src/store.ts` ~2734) does

```ts
const stillActive = get().sessions.some(
  (s) => s.repoPath === dest && s.exitedCode === undefined,
);
if (stillActive) return;
await ipc.removeWorktree(parent, dest, false); // non-forced; dirty kept
```

**This is the confirmed gap** (the card asked to verify it): the guard ignores a worktree's
**non-agent items** — `overviewPanels[dest]` (file / diff / terminal / kanban / filetree
viewers keyed to the worktree folder, #164) and **scheduled sessions** targeting the
worktree (#198). So a worktree with a file viewer (or a pending schedule) but no live agent
can be deleted out from under those items when the last agent goes; and closing a non-agent
item never triggers cleanup at all (only agent removal does). Fix both halves.

**Goal & why.** Make the worktree lifecycle match the user's mental model: a worktree lives
exactly as long as **any** item (agent, scheduled session, or panel) for it is shown, and is
auto-deleted the instant the **last** one closes — regardless of which item type it was.

**Design.**
- **Broaden the "still in use" check** in `cleanupWorktreeIfEmpty(parent, dest)` to count
  every item type keyed to `dest`:
  - any **session** with `repoPath === dest` (an exited-but-still-shown agent still occupies
    the worktree — keep the worktree while its Restart overlay is visible; only a
    forgotten/removed agent stops counting). _(Decide exited handling: a non-clean exited
    agent still has a sidebar row + Restart, so it should count; a clean-exit agent is
    already forgotten. See Notes.)_
  - any **`overviewPanels[dest]`** entry (file/diff/terminal/kanban/filetree).
  - any **schedule** whose target folder is `dest`.
  Only when **none** remain does it `removeWorktree` (non-forced — a dirty worktree is still
  kept, #74).
- **Run the guard on every item-close path**, not just agent removal: `removeSession` already
  calls it (~2969); also call it after **`removeOverviewPanel`** (when the removed panel's
  `repoPath` is a worktree dest) and after **`cancelSchedule`** (when the schedule targeted a
  worktree). Derive the `parent` from a session's `worktreeParent` or the worktree path
  mapping (`wtParent`, store.ts ~281) so a panel/schedule close can resolve its parent repo.
- **Unit-test the pure predicate.** Extract the "is this worktree still referenced?" decision
  into a pure helper `worktreeHasItems(state, dest)` and test it across agent-only,
  panel-only, schedule-only, mixed, and empty cases.

**Scope.** The guard's coverage + its trigger points + a tested pure predicate. The actual
`git worktree remove` call is unchanged here (non-blocking removal is **#200**).

**Out of scope.**
- Making the removal non-blocking/background — **#200**.
- The schedule-into-worktree feature itself — **#198** (it *uses* this guard on cancel).
- Force-deleting dirty worktrees (still kept, #74).

**Concrete files/symbols.**
- `src/store.ts` — `cleanupWorktreeIfEmpty` (~2734): broaden the check (sessions +
  `overviewPanels[dest]` + `schedules` for `dest`); a pure `worktreeHasItems(...)` helper;
  call the guard from `removeOverviewPanel` + `cancelSchedule` (resolving `parent` via
  `worktreeParent` / the worktree→parent map ~281). `removeSession` already calls it (~2969).
- `src/store.test.ts` — tests for `worktreeHasItems` across all item-type combinations.
- (Schedule "target folder" field: confirm how a schedule records its folder so a worktree
  schedule can be matched to `dest` — align with #198.)

**Subtasks**

1. [ ] Pure `worktreeHasItems(state, dest)` — true if any session (`repoPath===dest`),
   overview panel (`overviewPanels[dest]`), or schedule (folder===dest) references it.
2. [ ] Rewrite `cleanupWorktreeIfEmpty` to use it; keep non-forced removal (dirty kept).
3. [ ] Trigger the guard from `removeOverviewPanel` and `cancelSchedule` (parent resolved
   from `worktreeParent` / worktree→parent map), in addition to `removeSession`.
4. [ ] Unit tests for `worktreeHasItems` (agent-only / panel-only / schedule-only / mixed /
   empty → removes only when empty).
5. [ ] **Verify** — `npm run build`, `npm run lint`, `npm test` green; Rust untouched.
   Manual (or note): open a worktree with an agent + a file panel; close the agent → worktree
   **kept** (panel remains); close the panel → worktree **removed**. Repeat with a schedule.

**Acceptance criteria**

- [ ] A worktree is **not** removed while **any** agent, scheduled session, or panel for it
      remains; it **is** removed the moment the **last** such item (of any type) is closed.
- [ ] Closing a **non-agent** item (panel) or **cancelling a schedule** can trigger the
      removal — not only agent removal.
- [ ] `worktreeHasItems` is pure + unit-tested across all item-type combinations.
- [ ] A dirty worktree is still kept (non-forced); `npm run build`/`lint`/`test` pass.

**Notes**

- **Autonomous refine (2026-06-26):** the card asked to confirm the existing guard covers all
  item types — it **does not** (agents only, `store.ts` ~2737), so this is authored as a
  **fix** (not removed). Decisions logged in `ASSUMPTIONS.md`.
  - **Count exited-but-shown agents** (a non-clean exit keeps a sidebar row + Restart → the
    worktree is still "in use"); clean-exit agents are already forgotten so they drop out
    naturally. (If runtime testing shows a stuck worktree from a crashed agent, revisit.)
  - **Trigger on every close path** (agent, panel, schedule), not just agent removal.
  - **Pure `worktreeHasItems` predicate** for testability.
- **Depends on: none** — foundational. **#198** (schedule→worktree cancel cleanup) and **#200**
  (non-blocking removal) build on it.
- **References:** `store.ts cleanupWorktreeIfEmpty` (~2734), `removeSession` worktree cleanup
  (~2969), worktree→parent map (~281), `removeOverviewPanel`/`cancelSchedule`,
  `overviewPanels`; `commands.rs remove_worktree` (~214). CLAUDE.md worktree scope (#74).
