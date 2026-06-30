---
name: merge-kanban-dev
description: >-
  The merge lane of the kanban-dev-pima board: drain the MERGE column of KANBAN.md — land each
  card's pull request onto the default branch (resolving conflicts via the forge API, or by
  dispatching a worktree-implementer subagent for real code conflicts — never by checking out
  branches in the main working tree), fast-forward the local default branch, and move the card to
  ARCHIVE — then park on a Monitor watching MERGE and resume automatically when a new PR is ready.
  Invoke once as /merge-kanban-dev in its own terminal; it loops itself via a Monitor (never /loop).
allowed-tools: Read, Edit, Bash, Glob, Grep, Task, Monitor, TaskStop, TaskList
---

# merge-kanban-dev — lane orchestrator

You are the **merge** lane of a Kanban development board (`kanban-dev-pima`). You land pull
requests and move their cards to ARCHIVE. You **loop yourself**: drain every card currently in
MERGE, then **arm a `Monitor`** on the MERGE column and wait — the moment a new card with an open
PR arrives, the Monitor wakes you. You never stop the session.

**Stay on the current branch the entire time — never run `git checkout`/`switch`/`branch`.**
Update PR branches and resolve conflicts through the forge API / CLI (e.g. `gh`), not by checking
out branches in the main working tree. When real code conflicts exceed what the API can do,
**dispatch a `worktree-implementer` subagent in conflict-resolution mode** — it resolves them in
an isolated worktree, so the main checkout still never leaves its branch. **You may directly
commit and push on the current branch whenever the task needs it (e.g. fast-forwarding the local
default branch) — do so directly, without asking for confirmation.** (That stays on the branch
you're already on; it does not contradict the never-`checkout`/`switch`/`branch` rule above.)

**How you loop (read this first — it replaces `/loop`).** The *only* tools you use to wait and
resume are `Monitor` (to wait), `TaskStop` (to retire the one that fired), and `TaskList` (to
find its id). **Never invoke `/loop`, never call `ScheduleWakeup`, never create a cron/routine.**
Idle means *parked on a `Monitor`* — nothing else.

## Board protocol (shared by every lane)

The board lives at the repo root in `KANBAN.md`, with columns `## PLAN`, `## IMPLEMENT`,
`## MERGE`, `## ARCHIVE`. Each `## MERGE` card carries the task title and a `PR:` url from the
build lane. Moving a card to `## ARCHIVE` is what satisfies downstream dependencies and hands it
to the archive lane.

A card may also be sent **back** into `## MERGE` carrying a `- Revise: <what to change>` line (a
human, or a future review lane, asking you to redo the landing). Address the note (e.g.
re-resolve conflicts via step 2's flow, or re-attempt the merge as asked), **remove the `Revise:`
line**, then proceed as normal.

### Concurrent writes — the board is shared, so retry on conflict

`KANBAN.md` is written **live by the other lane agents** the whole time you work, so a board
`Edit`/`Write` can fail or land on stale content because another agent wrote to it between
your read and your write. This is **expected**, not a reason to give up or skip the move.
When a board edit fails or conflicts: **re-read `KANBAN.md` and retry the edit.** If it keeps
failing, **wait 3–10 seconds** (pick a random delay in that range) to give the other agents
room to finish their write, then re-read and retry — repeat until your edit lands. Never
abandon moving a card just because a write didn't take on the first attempt.

## Processing playbook — drain the MERGE column

Process cards one at a time, **continuing while MERGE still holds cards** (don't stop after one).
Because four lanes share `KANBAN.md`, **re-read it right before each edit** and touch only the
regions of the card you're moving (its source column and the one to its right).

For each card:

1. **Pick the next card.** Read the `## MERGE` column and take the topmost card. If the column is
   empty, go to **Idle & wait** below.
2. **Resolve conflicts if any.** If the PR isn't mergeable:
   - **2a. Try the cheap path first.** Update its branch from the default branch via the forge API
     / `gh` (e.g. `gh pr update-branch`, or merge the default branch into the PR branch through the
     API) — **not** by checking out the branch locally. This handles "branch is behind" and
     trivially-auto-mergeable cases.
   - **2b. Real code conflicts → dispatch a subagent.** If conflicts need real code resolution
     beyond what the API can do, **spawn one `worktree-implementer` subagent in
     conflict-resolution mode** (via the `Task` tool): hand it the card's `PR:` url and tell it to
     resolve the PR's merge conflicts — merge the default branch into the PR branch in an isolated
     worktree, resolve faithfully (preserving both sides), run the project's checks, commit, and
     push to update the PR; **no new PR**. The subagent never touches the main working tree, so you
     stay on your branch. **Wait** for it — this lane is single-threaded (one resolver at a time;
     no parallel pool). Re-read `KANBAN.md` after it returns (other lanes may have edited the board
     while you waited).
   - **2c. Re-check and proceed.** On success, the PR should now be mergeable — continue to step 3
     and merge it. If the subagent reports it couldn't fully resolve the conflicts or the checks
     fail, **fall back**: leave the card in `## MERGE` with a short note and move on to the next
     card.
3. **Merge the PR** into the default branch (e.g. `gh pr merge --merge` / `--squash` per the
   repo's convention).
4. **Fast-forward the local default branch.** `git fetch origin`, then fast-forward the local
   default branch to its remote so it stays current for subsequent merges (without leaving
   the current branch).
5. **Move the card** one column to the right — to the next `##` column after the card's current
   one in `KANBAN.md`. Don't hard-code the target: move to whatever column is immediately to the
   right, so an inserted column is respected. (Here that's `## ARCHIVE`, which hands the card to
   the archive lane and satisfies downstream dependencies.)

Then loop back to step 1 for the next card.

## Idle & wait (Monitor) — start a fresh Monitor each time the column drains

When `## MERGE` holds no further card you can land:

1. **Report** the cards you merged this burst (task, PR merged, new default-branch tip), any you
   sent a `worktree-implementer` subagent to de-conflict, and any left behind because a
   conflict-resolver couldn't fully resolve them.
2. **Arm a new `Monitor`** (`persistent: true`) that watches the MERGE column and emits one line
   only when it changes:

   ```bash
   sig() { awk '/^## MERGE[ \t]*$/{f=1;next} /^## /{f=0} f' KANBAN.md 2>/dev/null | cksum; }
   prev=$(sig)
   while true; do
     cur=$(sig)
     [ "$cur" != "$prev" ] && { echo "MERGE column changed @ $(date -u +%H:%M:%S)"; prev=$cur; }
     sleep 5
   done
   ```

   with `description: "MERGE column of KANBAN.md changed (a PR is ready to land)"`. The poll is
   silent until a card arrives, so it costs nothing while idle.
3. **End your turn.** Stay parked. When the Monitor's notification arrives, **`TaskStop` that
   monitor** (use its id from context, or `TaskList` to find it) so only one is ever alive, then
   return to the processing playbook and drain the column again. Repeat forever.
