# Task 198

### 198. [x] Schedule a session into a worktree (create at fire time, clean up on cancel)

**Status:** Done
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

1. [x] `ScheduledSession.worktree` (serde-default bool, `store.rs`) threaded through
   `create_schedule` (+ `worktree: Option<bool>` param), the IPC (`createSchedule`), TS types,
   and `store.ts scheduleSession`. `update_schedule` mutates only prompt/name/at, so it
   **preserves** `worktree` (the panel edits don't drop it) — no change needed there.
2. [x] Schedule step: an explicit **"Start in an isolated worktree"** `Checkbox` (git folders
   only — a worktree needs a branch), composing with "+ add branch"; `submitSchedule` passes
   the chosen branch (even the current, since a worktree always needs one) + `worktree` into
   `scheduleSession`. _(Kept the explicit toggle; ⌘⏎ parity skipped — see Notes.)_
3. [x] `fire_due_schedules`: when `worktree`, `prepare_worktree_for_schedule` creates the
   app-managed worktree (`git::worktree_add` for an existing branch — reusing the folder if it
   exists — or `worktree_add_new_branch` for a new branch) and the seeded agent spawns **there**
   with `worktree_parent = repo`. A worktree-creation failure emits `schedule://error` (no
   in-folder fallback, since there's no worktree to spawn into).
4. [x] `cancelSchedule` already invokes the broadened `cleanupWorktreeIfEmpty` (#199's wiring,
   reused). For a worktree schedule the worktree doesn't exist until fire time and `cwd` is the
   **repo**, so cancelling a pending one is a clean no-op (nothing to orphan); a fired schedule
   is a live worktree agent cleaned by `removeSession`'s guard. So cancelling never orphans a
   worktree — see Notes.
5. [x] **Verify** — `npm run build`, `npm run lint`, `npm test` (288), `cargo test` (83),
   `cargo clippy`, `cargo fmt`, `prettier` all green. The live fire-time worktree creation is
   **runtime-unverified** in this loop (Tauri-poll path, no GUI) — see Notes; the `worktree`
   round-trip is unit-tested and the git worktree primitives have their own tests.

**Acceptance criteria**

- [x] The schedule flow offers a **worktree** option (the schedule-step checkbox); a fired
      worktree-schedule creates the isolated worktree (`worktree_add[_new_branch]`) and spawns
      the agent there with `worktree_parent = repo`, so it nests under its parent repo.
      _(Fire-time path runtime-unverified — see Notes.)_
- [x] Cancelling a worktree-schedule cleans up via #199's guard (`cleanupWorktreeIfEmpty`) and
      **never orphans** a worktree — a pending worktree schedule has no worktree yet (no-op),
      and a fired one is a session cleaned on its removal.
- [x] `npm run build`, `npm run lint`, `npm test`, `cargo test` pass.

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

**Implementation notes (2026-06-26 — done)**

- Backend: `store.rs` (`worktree` field + round-trip test), `commands.rs`
  (`create_schedule` param; `fire_due_schedules` worktree branch + the new
  `prepare_worktree_for_schedule` helper). Frontend: `types`, `ipc.ts`, `store.ts`
  (`scheduleSession`), `NewSessionModal` (toggle + `submitSchedule`), `ScheduledPanel`
  (read-only "worktree" badge) + CSS.
- **Worktree created at fire time** (like #125's deferred branch creation): the schedule keeps
  `cwd = repo` + a `worktree` flag; `prepare_worktree_for_schedule` resolves the app-managed
  path (`worktree_path`) and runs `worktree_add` (existing branch, reused if present) or
  `worktree_add_new_branch` (composing with `create_branch`). The agent then spawns in the
  worktree folder with `worktree_parent = repo`, and `touch_recent` records the **repo**.
- **Explicit toggle over ⌘⏎:** per the plan's Notes (a scheduled flow has no live keypress at
  fire time), the schedule step shows a plain **checkbox** rather than the immediate path's
  hidden ⌘⏎ chord. I **skipped the optional ⌘⏎ parity** to keep the branch-step keyboard nav
  untouched — the checkbox fully satisfies "the schedule flow offers a worktree option", and
  the Notes call the explicit toggle the clearer choice.
- **Cancel cleanup is a genuine no-op for worktree schedules** (already wired by #199): a
  pending worktree schedule's `cwd` is the **repo** and its worktree isn't created until fire
  time, so `worktreeParentOf(cwd)` → undefined → no removal (nothing to orphan). Once fired,
  it's a live worktree agent removed via `removeSession` → #199's guard. So "cancelling never
  orphans a worktree" holds by construction; no new `cancelSchedule` code was needed.
- **`update_schedule` untouched:** it edits only prompt/name/at and mutates the record in
  place, so `worktree`/`branch`/`create_branch` survive a panel edit. The worktree intent is
  a creation-time decision (read-only badge in `ScheduledPanel`).
- **Runtime-unverified (autonomous loop, no GUI):** the live fire-time worktree creation +
  the scheduled worktree agent nesting under its repo (the `fire_due_schedules` Tauri-poll
  path needs an `AppHandle`, not unit-testable; the in-folder path isn't unit-tested either).
  Mitigations: the `worktree` field round-trip is unit-tested, the `worktree_add[_new_branch]`
  git primitives have their own tests, and the wiring is straightforward + code-reviewed.
  Recommend a `npm run tauri dev` pass (schedule a worktree session a minute out; watch a
  nested worktree agent appear at fire time).
