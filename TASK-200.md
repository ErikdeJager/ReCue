# Task 200

### 200. [ ] Worktree removal must not freeze the UI — run `git worktree remove` off the main thread

**Status:** Not started
**Depends on:** #199
**Created:** 2026-06-26

**Description**

When the last item in a worktree is closed, the worktree is deleted via the Rust
`remove_worktree` command (`src-tauri/src/commands.rs` ~217) → `git::worktree_remove`
(`git worktree remove`, which removes the worktree directory from the filesystem). Today
this is a **synchronous** `#[tauri::command]`:

```rust
#[tauri::command]
pub fn remove_worktree(parent: String, dest: String, force: bool) -> Result<(), SessionError> {
    git::worktree_remove(&parent, &dest, force).map_err(SessionError::Git)
}
```

In Tauri v2 a **non-`async`** command runs on the **main (webview) thread**, so deleting a
worktree dir — potentially thousands of files (`node_modules`, build output, etc.) — **blocks
the UI**: the whole app freezes and is unresponsive until the FS delete finishes. The user
wants this to happen **in the background** so they can keep using the app.

**Goal & why.** Make worktree deletion non-blocking. Closing the last worktree item should
return immediately and the app stay responsive while the directory is removed in the
background.

**Design.**
- **Run the git removal off the main thread.** Convert `remove_worktree` to an **`async`**
  command and execute the blocking git/FS work via **`tauri::async_runtime::spawn_blocking`**
  (a dedicated blocking pool), awaiting its result — so the main thread is never blocked by
  the FS delete. (An `async` command already runs off the main thread on the async runtime;
  `spawn_blocking` keeps the synchronous `git` shell-out from starving that runtime.)
- **Frontend stays responsive / fire-and-forget.** `cleanupWorktreeIfEmpty` (`store.ts`
  ~2734, broadened by #199) currently `await`s `removeWorktree`. Keep the await for the
  dirty-worktree toast, but ensure the close action that triggers it (`removeSession` /
  `removeOverviewPanel` / `cancelSchedule`) **doesn't block on it** — i.e. let cleanup run
  asynchronously after the item is already removed from the UI (the panel/agent disappears
  instantly; the worktree dir deletes in the background; the "kept — dirty" toast still fires
  on the non-forced-failure path). Don't `await` the cleanup inside the synchronous part of a
  close handler.
- **Surface completion lightly** (optional): a quiet toast when a large worktree finishes
  removing, or nothing — the key requirement is no freeze.

**Scope.** Threading of `remove_worktree` (backend) + making the frontend cleanup
non-blocking. No change to *when* a worktree is removed (that's #199's guard) or to the
dirty-kept rule.

**Out of scope.**
- The all-item-types removal guard — **#199**.
- Scheduling into worktrees — **#198**.
- Force-deleting dirty worktrees (still kept).
- A progress UI for the deletion (a freeze fix, not a progress feature).

**Concrete files/symbols.**
- `src-tauri/src/commands.rs` — `remove_worktree` → `async` + `spawn_blocking` around
  `git::worktree_remove`.
- `src-tauri/src/git.rs` — `worktree_remove` (~488) unchanged (still the blocking shell-out;
  just invoked off-thread).
- `src/store.ts` — `cleanupWorktreeIfEmpty` (~2734) + its callers (`removeSession` ~2969,
  and the #199-added `removeOverviewPanel` / `cancelSchedule` calls): run cleanup
  fire-and-forget so the UI removal isn't gated on the FS delete.
- `src/ipc.ts` — `removeWorktree` wrapper unchanged (the command is still awaited where its
  result matters, just no longer blocking the main thread).

**Subtasks**

1. [ ] Make `remove_worktree` an `async` command running `git::worktree_remove` via
   `tauri::async_runtime::spawn_blocking`; preserve the `force`/error semantics + the typed
   `SessionError::Git` mapping.
2. [ ] Frontend: detach the worktree cleanup from the synchronous close path (the item is
   removed from the UI immediately; cleanup runs async; the dirty-kept toast still fires).
3. [ ] **Verify** — `npm run build`, `npm run lint`, `npm test`, `cargo test`/`clippy` green.
   Manual (or note as runtime-unverified): close the last item of a worktree containing a
   large directory → the app stays responsive (no freeze) while the dir removes in the
   background; the worktree disappears from the sidebar when done; a dirty worktree still
   yields the "kept" toast.

**Acceptance criteria**

- [ ] Removing a worktree (incl. a large directory) **does not freeze the UI** — the app stays
      responsive while deletion runs in the background.
- [ ] `remove_worktree` runs its FS work **off the main thread** (`async` + `spawn_blocking`);
      the close action returns without blocking on the delete.
- [ ] The dirty-worktree-kept behavior + the removal trigger logic (#199) are unchanged.
- [ ] `npm run build`, `npm run lint`, `npm test`, and `cargo build`/`clippy` pass.

**Notes**

- **Autonomous refine (2026-06-26):** decisions logged in `ASSUMPTIONS.md`.
  - **Root cause:** `remove_worktree` is a **sync** Tauri command → runs on the main thread →
    the FS delete freezes the webview. Fix = `async` + `spawn_blocking`.
  - **Frontend cleanup made fire-and-forget** so the UI removes the item instantly and the dir
    deletes in the background; the dirty-kept toast still fires on the non-forced failure.
- **Depends on: #199** — both touch the worktree-cleanup path (`cleanupWorktreeIfEmpty` + its
  callers); sequenced after the corrected guard so the async/fire-and-forget change builds on
  the right trigger logic rather than being reworked.
- **References:** `commands.rs remove_worktree` (~217, sync today), `git.rs worktree_remove`
  (~488), `store.ts cleanupWorktreeIfEmpty` (~2734) + callers, Tauri v2 `async_runtime::
  spawn_blocking`. CLAUDE.md "Backend (Rust)" + worktree scope (#74).
