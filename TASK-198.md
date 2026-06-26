# Task 198

### 198. [ ] Schedule a session into a worktree (create at fire time, clean up on cancel)

**Status:** Not started
**Depends on:** #199
**Created:** 2026-06-26

**Description**

A **scheduled session** (#93/#94/#125) launches an agent later from the `NewSessionModal` in
schedule mode (folder → branch → launch-time/prompt/name → `create_schedule`). The branch
step already supports creating a new branch at fire time (`ScheduledSession.create_branch`
+ `branch_base`, #125), but there is **no worktree option** in schedule mode — you can't
schedule an agent to launch **inside an isolated worktree** (#74). The immediate new-session
path already does this via **⌘⏎** in the branch step (`NewSessionModal` ~465/495/535), but
that's explicitly "new-session path only — schedule mode is #125" (comment ~114). Close the
gap: allow scheduling **into a worktree**, created when the scheduled session fires, with
cleanup if the schedule is cancelled and nothing else remains.

**Goal & why.** Worktrees are how you run parallel isolated agents (#74); scheduling is how
you launch agents later (#93). A user should be able to combine them — "at 9am, spin up an
isolated worktree on branch X and start an agent there" — instead of only scheduling
in-folder agents.

**Design.**
- **Record a worktree intent on the schedule.** Add a serde-default **`worktree: bool`** to
  `ScheduledSession` (`store.rs`, alongside `create_branch`/`branch_base` ~109–124). When
  set, the schedule targets an isolated worktree (created at fire time), composing with the
  existing `create_branch` flag (worktree on an existing branch **or** a new branch).
- **Modal UX.** In schedule mode's branch step, enable the same **⌘⏎ = worktree** affordance
  the immediate path uses (and/or an explicit "Start in a worktree" toggle, since a scheduled
  flow has no live keyboard at fire time — an explicit checkbox is clearer than a hidden
  chord; see Notes). The chosen branch + worktree flag flow into `create_schedule`.
- **Fire time.** `fire_due_schedules` (`commands.rs`/`lib.rs`, the #93 poll loop) already
  creates a branch (`git checkout -b`) or checks one out before spawning; extend it so, when
  `worktree` is set, it instead **creates the worktree** — `git worktree add [-b]`
  (`git::worktree_add` / `worktree_add_new_branch`, #74/#124) at the app-managed worktree
  path (`<app-data>/worktrees/<repo-id>/<branch>`) — and spawns the pre-seeded agent **there**
  with `worktree_parent = <repo>` (so it nests in the sidebar like any worktree agent).
- **Cancel cleanup.** When a worktree-targeted schedule is **cancelled** (`cancelSchedule`),
  run the worktree cleanup: if **no other agents, scheduled sessions, or items** remain for
  that worktree, remove it — i.e. call the **broadened `cleanupWorktreeIfEmpty`** delivered
  by #199 (which counts all item types, not just agents). Before fire time the worktree
  doesn't exist yet, so cleanup is a no-op then; it matters once the worktree was created (a
  fired-then-cancelled lineage) or when a not-yet-fired schedule is the *only* thing that
  would have created it (nothing to remove). The key requirement: cancelling must not orphan
  a worktree.

**Scope.** The `worktree` flag end-to-end (record + modal schedule step + fire-time creation
+ cancel cleanup via #199's guard).

**Out of scope.**
- The broadened all-item cleanup guard itself — that's **#199** (this reuses it).
- Non-blocking worktree removal — that's **#200**.
- Pre-creating the worktree before fire time (it's created at launch, matching how branch
  creation is deferred to fire time, #125).

**Concrete files/symbols.**
- `src-tauri/src/store.rs` — `ScheduledSession` (+ serde-default `worktree: bool`, ~109).
- `src-tauri/src/commands.rs` / `src/lib.rs` — `create_schedule` + `fire_due_schedules`:
  carry `worktree`; at fire time use `git::worktree_add`/`worktree_add_new_branch` +
  `spawn_session_with_prompt` with `worktree_parent`.
- `src/components/NewSessionModal/NewSessionModal.tsx` — schedule branch step: a worktree
  toggle / ⌘⏎ (reuse ~465/495/535 logic) → pass `worktree` into `create_schedule`.
- `src/components/ScheduledPanel/ScheduledPanel.tsx` — surface the worktree intent (read-only
  badge) if it edits schedule fields.
- `src/store.ts` — `createSchedule`/`cancelSchedule`: pass `worktree`; on cancel call the
  #199 `cleanupWorktreeIfEmpty(parent, dest)`.
- `src/ipc.ts` + `src/types` — thread the `worktree` field.

**Subtasks**

1. [ ] `ScheduledSession.worktree` (serde-default) + thread through `create_schedule` /
   `update_schedule` / the IPC + TS types.
2. [ ] Schedule branch step: an explicit "Start in a worktree" toggle (+ keep ⌘⏎ parity),
   composing with "+ add branch"; pass `worktree` to `create_schedule`.
3. [ ] `fire_due_schedules`: when `worktree`, create the app-managed worktree
   (`worktree_add[_new_branch]`) and spawn the seeded agent there with `worktree_parent`.
4. [ ] `cancelSchedule`: invoke the broadened `cleanupWorktreeIfEmpty` (#199) so cancelling
   never orphans a worktree.
5. [ ] **Verify** — `npm run build`, `npm run lint`, `npm test`, `cargo test` green. Manual
   (or note): schedule a worktree session → at fire time an isolated worktree agent appears
   nested under the repo; cancelling before/after removes the worktree iff nothing else uses it.

**Acceptance criteria**

- [ ] The schedule flow offers a **worktree** option; a fired worktree-schedule launches the
      agent inside a freshly-created isolated worktree (nested under its parent repo).
- [ ] Cancelling a worktree-schedule cleans up the worktree **iff** no other agents/scheduled
      sessions/items remain for it (via #199's guard); otherwise the worktree is kept.
- [ ] `npm run build`, `npm run lint`, `npm test`, `cargo test` pass.

**Notes**

- **Autonomous refine (2026-06-26):** decisions logged in `ASSUMPTIONS.md`.
  - **Explicit "Start in a worktree" toggle in the schedule step** (plus ⌘⏎ parity) — a
    scheduled flow is configured now but fires later with no live keypress, so a visible
    toggle is clearer than a hidden chord.
  - **Worktree created at fire time** (like #125's deferred branch creation), via the existing
    `worktree_add[_new_branch]`; record a serde-default `worktree` flag.
  - **Cancel cleanup reuses #199's broadened `cleanupWorktreeIfEmpty`** (all item types), so a
    cancelled schedule never orphans a worktree.
- **Depends on: #199** — needs the all-item-types worktree-empty guard for correct
  cancel-cleanup. Builds on shipped schedule (#93/#125) + worktree (#74/#124) machinery.
- **References:** `store.rs ScheduledSession` (~109), `commands.rs`/`lib.rs` schedule poll +
  `fire_due_schedules`, `git.rs worktree_add[_new_branch]` (~362/451), `NewSessionModal`
  worktree ⌘⏎ (~465/495/535), `store.ts cleanupWorktreeIfEmpty` (~2734, broadened by #199).
  CLAUDE.md "Scheduled sessions (#93/#94/#125)" + worktree scope (#74/#124).
