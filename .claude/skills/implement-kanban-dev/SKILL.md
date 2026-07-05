---
name: implement-kanban-dev
description: >-
  The build lane of the kanban-dev-pima board: dispatch worktree-implementer subagents — as
  background tasks — to turn unblocked IMPLEMENT cards into open PRs, up to a configured number in
  parallel, moving each card to MERGE as its PR opens. It never blocks in-session: after dispatching
  builds it parks on a Monitor and is woken either by a subagent finishing or by IMPLEMENT/ARCHIVE
  changing, then runs one reconciliation pass (harvest finished builds, top the pool up, re-arm the
  Monitor) and parks again — even while builds are still running.
  Invoke once as /implement-kanban-dev in its own terminal; it loops itself via a Monitor (never /loop).
allowed-tools: Read, Edit, Bash, Glob, Grep, Task, Monitor, TaskStop, TaskList
---

# implement-kanban-dev — lane orchestrator

You are the **build** lane of a Kanban development board (`kanban-dev-pima`). You turn ready,
unblocked tasks into open PRs by **dispatching `worktree-implementer` subagents as background
tasks** — each builds one task in its own isolated git worktree and opens one PR. This is the one
**fan-out** lane: you keep **up to `5`** implementers running at once and top
the pool back up as they finish. **You never actively wait for a build.** After dispatching, you
**park on a `Monitor`** and end your turn; a finished subagent or a change to the IMPLEMENT/ARCHIVE
columns wakes you, you run one reconciliation pass, then you park again — **even while builds are
still running.** You never stop the session.

**Stay on the current branch the entire time — never run `git checkout`/`switch`/`branch`.**
Each subagent creates and tears down its own worktree; the main checkout never moves. **You may
directly commit and push on the current branch whenever the task needs it (e.g. fast-forwarding
the local default branch) — do so directly, without asking for confirmation.** (That stays on the
branch you're already on; it does not contradict the never-`checkout`/`switch`/`branch` rule.)

**How you loop (read this first — it replaces `/loop`).** You are woken **two ways, and you treat
both identically:** (1) the one **`Monitor`** you keep armed fires when the **IMPLEMENT** or
**ARCHIVE** column of `KANBAN.md` changes (a new card, or a dependency landing) **or** a build
result lands in `.worktree/.results/`; and (2) a **background `worktree-implementer` subagent
completing** delivers a task-notification that re-invokes you. On **every** wake you run exactly one
**reconciliation pass** — harvest finished builds, top the pool back up, re-arm one Monitor — and
then **end your turn again, even while builds are still running.** You **never actively wait** for a
build: after dispatching subagents you park immediately. "Idle" and "busy building" are the same
state — you are **always parked between passes, never blocking in-session.** The only tools you use
to wait and resume are `Monitor` (to wait), `TaskStop` (to retire Monitors that have fired), and
`TaskList` (to see what is still running and to find Monitor ids). **Never invoke `/loop`, never
call `ScheduleWakeup`, never create a cron/routine.**

## Board protocol (shared by every lane)

The board lives at the repo root in `KANBAN.md`, with columns `## PLAN`, `## IMPLEMENT`,
`## MERGE`, `## ARCHIVE`. Cards use this shape:

```
- [ ] Task <N>: <title> — PLAN-<N>.md
    - Dependencies: Task <A>, Task <B>   (the tasks that must land first, or "none")
    - PR: <url, once opened>
    - Revise: <what to change — present only when a card was sent back here for rework>
```

Indent every sub-line under a card (`Dependencies:`, `PR:`, `Revise:`, `Build-note:`) by
**4 spaces**, not 2 — an Obsidian-Kanban board viewer renders a card's tab- or 4-space-indented
lines as its body but **ignores** 2-space-indented ones, so a 2-space indent would drop this
metadata (incl. the `PR:` url you set) when the board is opened as a real Kanban board.

An IMPLEMENT card is **unblocked** when **every** task on its `Dependencies:` line is in the
`## ARCHIVE` column **or** recorded in `TASK_ARCHIVE.md`. A blocked card waits — skip it until a
dependency lands.
Note that a dep reaches `## ARCHIVE` only via the **merge** lane (MERGE→ARCHIVE), never from your
own work — finishing a build moves a card forward to the next column, which does **not** satisfy
any dependency. That is why your Monitor also watches ARCHIVE (below): a landed dependency there
may unblock a waiting IMPLEMENT card.

A card may also be sent **back** into `## IMPLEMENT` carrying a `- Revise: <what to change>`
line (e.g. bounced from a later column for changes). If it already has a `PR:` url, that's a
**revision of an existing PR** — dispatch it in revision mode (see step 4 below), not as a fresh
build.

### Concurrent writes — the board is shared, so retry on conflict

`KANBAN.md` is written **live by the other lane agents** the whole time you work, so a board
`Edit`/`Write` can fail or land on stale content because another agent wrote to it between
your read and your write. This is **expected**, not a reason to give up or skip the move.
When a board edit fails or conflicts: **re-read `KANBAN.md` and retry the edit.** If it keeps
failing, **wait 3–10 seconds** (pick a random delay in that range) to give the other agents
room to finish their write, then re-read and retry — repeat until your edit lands. Never
abandon moving a card just because a write didn't take on the first attempt.

## In-flight tracking — how you know what is building

You never trust memory for what is building — you **re-derive it every pass** from ground truth, so
a context summarization loses nothing. **`TaskList` is authoritative:** the running implementer
tasks are the builds in flight, and

```
remaining capacity = 5 − (number of running implementer tasks in TaskList)
```

You dispatched each build with a recognizable name (`build task <N>` / `revise task <N>`) and
dropped a breadcrumb file `.worktree/.inflight/task-<N>`, so you can match a running task back to
its card number `N`. The breadcrumbs are only a join/reconstruction aid — **capacity comes from the
running count, never from counting marker files** (a crashed subagent stops being "running," so its
slot frees itself automatically; a marker would leak it). **Never record in-flight state on
`KANBAN.md`.** After a summarization, reconstruct the whole picture from `TaskList` +
`ls .worktree/.inflight` + `ls .worktree/.results` + a fresh read of `KANBAN.md`.

## Handshake — how a finished build hands back its PR url

You **cannot** read a finished background subagent's output — it is that subagent's full transcript
and will overflow your context. So each build hands its PR url back through a one-line **result
file**. In **every** task prompt (build and revise) append this closing instruction, with
`<REPO_ROOT>` replaced by the absolute repo root and `<N>` by the card number:

> As your **very final action**, after you have removed your worktree, write a single-line result
> file — it is the only way I can learn your PR url (I cannot read your transcript). Create the dir
> if needed (`mkdir -p <REPO_ROOT>/.worktree/.results`), then write to the absolute path
> `<REPO_ROOT>/.worktree/.results/task-<N>` exactly one of:
> `STATUS=ok PR=<pr-url>` on success, or `STATUS=failed REASON=<one short line>` on failure.
> Do **not** touch `KANBAN.md` or any card — the result file is your only handback channel besides
> your report.

The result file lives in `.worktree/.results/`, a **sibling** of the subagent's own
`.worktree/<slug>/`, so it survives the subagent's mandatory worktree cleanup.

## Reconciliation pass — run on EVERY wake, then park

This replaces any notion of "fill the pool, then wait." Because four lanes share `KANBAN.md`,
**re-read it right before each edit** and touch only the card you're moving (its source column and
the one to its right). Run these steps top to bottom, then park — **even if builds are still
running.**

1. **Prepare.** `mkdir -p .worktree/.results .worktree/.inflight`. Bring the default branch up to
   date without leaving the current branch: `git fetch origin`, detect the default branch
   (`git symbolic-ref --short refs/remotes/origin/HEAD` — don't assume it's `main`), and
   fast-forward the local default ref so each new worktree branches from the latest code.
2. **Take stock (re-derive, don't remember).** Read `KANBAN.md`; run `TaskList` for the running
   implementer tasks (the in-flight set + count); `ls .worktree/.results` (results to harvest);
   `ls .worktree/.inflight` (breadcrumbs).
3. **Harvest finished builds (idempotent).** For each result file `task-<N>`:
   - Re-read `KANBAN.md` and find card `N`. **If it is still in `## IMPLEMENT`:** on `STATUS=ok`,
     if the card carries a `- Revise:` line remove that line and keep/refresh its `PR:` url,
     otherwise set its `PR:` line from the result; then move the card **one column to the right** —
     to the next `##` column after `## IMPLEMENT` (never hard-code `## MERGE`, so an inserted column
     like a review lane is respected), retrying on conflict. On `STATUS=failed`, leave the card in
     `## IMPLEMENT` and add a short `- Build-note: <reason>`.
   - If card `N` is **already past `## IMPLEMENT`**, do nothing (a prior pass moved it).
   - **Always** delete the result file `task-<N>` and the inflight marker `task-<N>` afterward.

   Then reconcile **vanished** builds: for each inflight marker `task-<N>` whose task is **not**
   running in `TaskList` **and** has **no** result file, the build died — add a short
   `- Build-note:` to card `N` and remove the stale marker (its slot is already free, since it's no
   longer running).
4. **Top up the pool.** Compute `capacity = 5 − (running implementer tasks in
   TaskList)`. While `capacity > 0` and an **eligible** card waits in `## IMPLEMENT`, dispatch one
   and decrement `capacity`. A card is **eligible** when it is unblocked (every dep in `## ARCHIVE`
   or `TASK_ARCHIVE.md`), **not** already in the in-flight set, and carries **no** unresolved
   `- Build-note:`. To dispatch:
   - **Fresh build:** read its `PLAN-<N>.md` and pass its goal, acceptance criteria, and approach as
     the task description (plus the task number and title). The subagent creates its own worktree +
     branch, implements, runs the project's own checks, commits, pushes, opens a **new** PR, and
     removes its worktree.
   - **Revision** (card has **both** a `- Revise:` line **and** a `PR:` url): hand it the card's
     `PR:` url plus the `Revise:` note and tell it to **revise that existing PR** — check the PR's
     existing branch out in a worktree (**no new branch**), apply the changes, and push to that
     **same branch** (which updates the open PR); it must **not** open a new PR. (A `Revise:` card
     with **no** `PR:` yet was never built — treat it as a fresh build.)
   - Append the **handshake instruction** (above). **Dispatch it as a background task** (so it runs
     detached and you can end your turn while it builds), named `build task <N>` (or
     `revise task <N>`). Then `touch .worktree/.inflight/task-<N>`.
5. **Rescan guard — don't park with work pending.** Re-read `## IMPLEMENT` + `## ARCHIVE` and
   re-list `.worktree/.results`. If a new result file appeared, or a card became eligible while
   `capacity` remains, loop back to step 3 (bound this to a few iterations).
6. **Re-arm exactly one Monitor** (next section).
7. **Report and park.** Report cards you moved forward (with PR urls), cards dispatched this pass,
   cards still building, and any left behind (`Build-note:` failures, or still blocked and on which
   deps). Then **end your turn — park even if builds are in flight.**

## Idle & wait (Monitor) — reconcile to exactly one Monitor each pass

On every pass, converge to a single armed Monitor. From `TaskList`, **`TaskStop` every Monitor this
lane owns** (identify it by the `description` below; **never** stop a running implementer task),
then arm **one** fresh `Monitor` (`persistent: true`) that fires when IMPLEMENT or ARCHIVE changes
**or** a build result lands. (Stopping *all* of this lane's Monitors and arming exactly one keeps a
single Monitor alive even if a duplicate wake — Monitor plus a completion notification — arrived.)

The Monitor watches only **externally-written** state — the IMPLEMENT + ARCHIVE columns (written by
the other lanes) and `.worktree/.results/` (written by your subagents). It deliberately does **not**
watch `.worktree/.inflight/`, which you write yourself. Because you arm a fresh Monitor *after*
harvest, your own result-file deletions never self-fire it.

```bash
sig() {
  { awk '/^## IMPLEMENT[ \t]*$/{f=1;next} /^## /{f=0} f' KANBAN.md
    awk '/^## ARCHIVE[ \t]*$/{f=1;next}   /^## /{f=0} f' KANBAN.md
    ls -1 .worktree/.results 2>/dev/null | sort; } 2>/dev/null | cksum
}
prev=$(sig)
while true; do
  cur=$(sig)
  [ "$cur" != "$prev" ] && { echo "IMPLEMENT/ARCHIVE or a build result changed @ $(date -u +%H:%M:%S)"; prev=$cur; }
  sleep 5
done
```

with `description: "IMPLEMENT or ARCHIVE column of KANBAN.md changed, or a build result landed in .worktree/.results (new card, landed dependency, or finished build)"`.
The poll is silent until something changes, so it costs nothing while parked.

**End your turn.** Stay parked. When you wake — from this Monitor **or** from a background subagent
completing — run the reconciliation pass again (a changed ARCHIVE column may have unblocked a card
that was waiting). Repeat forever.

## Configuration

Set when the loop is installed (the installer replaces the token in the installed copy; the
source keeps the placeholder):

- `5` — maximum number of `worktree-implementer` subagents building at
  once. Default: `5`. Lower it on a constrained machine; raise it for more parallelism.
