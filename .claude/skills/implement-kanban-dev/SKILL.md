---
name: implement-kanban-dev
description: >-
  The build lane of the kanban-dev-pima board: dispatch worktree-implementer subagents to turn
  unblocked IMPLEMENT cards into open PRs — up to a configured number in parallel — moving each
  card to MERGE as its PR opens. When nothing is left to build, park on a Monitor watching
  IMPLEMENT and ARCHIVE and resume automatically when a new card arrives or a dependency lands.
  Invoke once as /implement-kanban-dev in its own terminal; it loops itself via a Monitor (never /loop).
allowed-tools: Read, Edit, Bash, Glob, Grep, Task, Monitor, TaskStop, TaskList
---

# implement-kanban-dev — lane orchestrator

You are the **build** lane of a Kanban development board (`kanban-dev-pima`). You turn ready,
unblocked tasks into open PRs by **dispatching `worktree-implementer` subagents** — each builds
one task in its own isolated git worktree and opens one PR. This is the one **fan-out** lane: you
keep **up to `5`** implementers running at once and top the pool back up as
they finish. You **loop yourself**: when no unblocked card remains and the pool has drained, you
**arm a `Monitor`** on the IMPLEMENT and ARCHIVE columns and wait — a new card or a freshly-landed
dependency wakes you. You never stop the session.

**Stay on the current branch the entire time — never run `git checkout`/`switch`/`branch`.**
Each subagent creates and tears down its own worktree; the main checkout never moves. **You may
directly commit and push on the current branch whenever the task needs it (e.g. fast-forwarding
the local default branch) — do so directly, without asking for confirmation.** (That stays on the
branch you're already on; it does not contradict the never-`checkout`/`switch`/`branch` rule.)

**How you loop (read this first — it replaces `/loop`).** The *only* tools you use to wait and
resume are `Monitor` (to wait), `TaskStop` (to retire the one that fired), and `TaskList` (to
find its id). **Never invoke `/loop`, never call `ScheduleWakeup`, never create a cron/routine.**
Idle means *parked on a `Monitor`* — nothing else. (Waiting on your own running subagents to
finish is normal in-session waiting, not idleness — only arm the Monitor once the pool is empty.)

## Board protocol (shared by every lane)

The board lives at the repo root in `KANBAN.md`, with columns `## PLAN`, `## IMPLEMENT`,
`## MERGE`, `## ARCHIVE`. Cards use this shape:

```
- [ ] Task <N>: <title> — PLAN-<N>.md
  - Dependencies: Task <A>, Task <B>   (the tasks that must land first, or "none")
  - PR: <url, once opened>
  - Revise: <what to change — present only when a card was sent back here for rework>
```

An IMPLEMENT card is **unblocked** when **every** task on its `Dependencies:` line is in the
`## ARCHIVE` column **or** recorded in `TASK_ARCHIVE.md`. A blocked card waits — skip it until a
dependency lands.
Note that a dep reaches `## ARCHIVE` only via the **merge** lane (MERGE→ARCHIVE), never from your
own work — finishing a build moves a card forward to the next column, which does **not** satisfy
any dependency. That is why you also watch ARCHIVE while idle (below).

A card may also be sent **back** into `## IMPLEMENT` carrying a `- Revise: <what to change>`
line (e.g. bounced from a later column for changes). If it already has a `PR:` url, that's a
**revision of an existing PR** — handle it per *Revising an existing PR* below, not as a fresh
build.

### Concurrent writes — the board is shared, so retry on conflict

`KANBAN.md` is written **live by the other lane agents** the whole time you work, so a board
`Edit`/`Write` can fail or land on stale content because another agent wrote to it between
your read and your write. This is **expected**, not a reason to give up or skip the move.
When a board edit fails or conflicts: **re-read `KANBAN.md` and retry the edit.** If it keeps
failing, **wait 3–10 seconds** (pick a random delay in that range) to give the other agents
room to finish their write, then re-read and retry — repeat until your edit lands. Never
abandon moving a card just because a write didn't take on the first attempt.

## Processing playbook — keep the build pool full

Because four lanes share `KANBAN.md`, **re-read it right before each edit** and touch only the
regions of the card you're moving (its source column and the one to its right).

1. **Bring the default branch up to date** (without leaving the current branch):
   `git fetch origin`, then fast-forward the local default branch to its remote so each
   worktree branches from the latest code. Don't assume the branch is named `main` — detect
   it (`git symbolic-ref --short refs/remotes/origin/HEAD`).
2. **Fill the pool.** While **fewer than `5`** implementers are running
   **and** an unblocked card is waiting in `## IMPLEMENT`, dispatch one: spawn a
   **`worktree-implementer`** subagent and hand it that card's task — read `PLAN-<N>.md` and
   pass its goal, acceptance criteria, and approach as the task description (plus the task
   number and title). It creates its own worktree + branch, implements, runs the project's
   own checks, commits, pushes, opens a PR, and removes its worktree.
3. **As each subagent finishes**, record its PR url on the card's `PR:` line and move the
   card **one column to the right** — to the next `##` column after `## IMPLEMENT` in
   `KANBAN.md`. Don't hard-code `## MERGE`: move to whatever column is immediately to the right,
   so an inserted column (e.g. a review lane) is respected. **Don't wait for the others** — go
   back to step 2 and top the pool back up if any unblocked card remains. If a subagent failed
   to produce a PR, leave its card in `## IMPLEMENT` with a short note and move on.
4. **When no unblocked card is waiting**, just wait for the running subagents to finish, moving
   each card to the next column to its right as it completes, then top up the pool from step 2 if
   completing a build left other unblocked cards waiting.
5. **When nothing is running and no unblocked card remains**, go to **Idle & wait** below.

### Revising an existing PR

When a card in `## IMPLEMENT` carries a `- Revise: <what to change>` line **and already has a
`PR:` url**, it isn't a fresh build — its branch and PR already exist. Dispatch a
`worktree-implementer` in **revision mode**: hand it the card's `PR:` url plus the `Revise:`
note, and tell it to **revise that existing PR** — check the PR's existing branch out in a
worktree (**no new branch**), apply the requested changes, and push to that **same branch**,
which updates the open PR. It must **not** open a new PR. Count a running revision against
`5` just like a build. When it finishes, **remove the `Revise:` line**,
leave the existing `PR:` url in place, and move the card to the next column to its right (it's
ready to re-merge). (A `Revise:` card with **no** `PR:` yet was never built — treat it as a
normal fresh build in step 2.)

## Idle & wait (Monitor) — start a fresh Monitor each time the pool drains

When nothing is running and no unblocked card remains in `## IMPLEMENT` (the column is empty, or
every remaining card is blocked on a dependency):

1. **Report** which cards you moved forward (with PR urls), and any that stayed behind (failed,
   or still blocked and on which deps).
2. **Arm a new `Monitor`** (`persistent: true`) that watches **both** the IMPLEMENT column (a new
   card from the plan lane) and the ARCHIVE column (a dependency landing unblocks a waiting card),
   emitting one line only when either changes:

   ```bash
   sig() { { awk '/^## IMPLEMENT[ \t]*$/{f=1;next} /^## /{f=0} f' KANBAN.md
             awk '/^## ARCHIVE[ \t]*$/{f=1;next}   /^## /{f=0} f' KANBAN.md; } 2>/dev/null | cksum; }
   prev=$(sig)
   while true; do
     cur=$(sig)
     [ "$cur" != "$prev" ] && { echo "IMPLEMENT/ARCHIVE changed @ $(date -u +%H:%M:%S)"; prev=$cur; }
     sleep 5
   done
   ```

   with `description: "IMPLEMENT or ARCHIVE column of KANBAN.md changed (new card or a dependency landed)"`.
   The poll is silent until a change, so it costs nothing while idle.
3. **End your turn.** Stay parked. When the Monitor's notification arrives, **`TaskStop` that
   monitor** (use its id from context, or `TaskList` to find it) so only one is ever alive, then
   return to the processing playbook — a changed ARCHIVE column may have unblocked a card that was
   waiting. Repeat forever.

## Configuration

Set when the loop is installed (the installer replaces the token in the installed copy; the
source keeps the placeholder):

- `5` — maximum number of `worktree-implementer` subagents building at
  once. Default: `5`. Lower it on a constrained machine; raise it for more parallelism.
