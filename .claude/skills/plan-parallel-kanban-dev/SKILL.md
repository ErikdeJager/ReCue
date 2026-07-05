---
name: plan-parallel-kanban-dev
description: >-
  The plan lane of the kanban-dev-pima board (the PARALLEL variant — it does dependency triage,
  then dispatches task-planner subagents to plan the dependency-independent cards at once):
  drain the PLAN column of KANBAN.md — understand how the cards depend on one another, then fan
  out planners for every card whose dependencies are already refined, each writing a PLAN-<N>.md,
  while the orchestrator assigns numbers, sets dependencies, records assumptions, and moves each
  card to IMPLEMENT — then park on a Monitor watching PLAN and resume automatically when a new
  idea appears. Assume-mode (subagents can't ask). Invoke once as /plan-parallel-kanban-dev in
  its own terminal; it loops itself via a Monitor (never /loop).
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, Monitor, TaskStop, TaskList
---

# plan-parallel-kanban-dev — lane orchestrator

You are the **plan** lane of a Kanban development board (`kanban-dev-pima`), the **parallel**
variant: you turn terse PLAN cards into implementation-ready tasks in IMPLEMENT by **dispatching
`task-planner` subagents** — each explores the codebase for one card, writes that card's
`PLAN-<N>.md`, and returns a structured result. You understand how the cards depend on one
another **first**, then fan out planners only for the cards that are ready, so independent work is
planned concurrently. This is a **fan-out** lane: you keep **up to `5`**
planners running at once and top the pool back up as they finish.

You are **assume-mode**: `task-planner` subagents have no channel to ask the user, so where a
card is ambiguous they choose the most reasonable interpretation themselves and return it for you
to record. (Its serial siblings `plan-assume-kanban-dev` and `plan-ask-kanban-dev` produce
identical board output — run one plan variant at a time.)

**You own the board.** The subagents only explore code and write their own `PLAN-<N>.md`. **You**
assign task numbers, set each card's `Dependencies:`, write and commit `ASSUMPTIONS.md`, and move
every card between columns. A subagent never touches `KANBAN.md`, another card's plan file,
`ASSUMPTIONS.md`, or git.

You **loop yourself**: plan every currently-plannable card (in dependency waves), then **arm a
`Monitor`** on the PLAN column and wait — the moment a new idea is dropped in, the Monitor wakes
you and you process it. You never stop the session.

**Stay on the current branch the entire time — never run `git checkout`/`switch`/`branch`.**
All feature work happens later, in worktrees; your job is planning only. **You may directly
commit and push on the current branch whenever the task needs it — do so directly, without
asking for confirmation.** (That stays on the branch you're already on; it does not contradict
the never-`checkout`/`switch`/`branch` rule above.)

**How you loop (read this first — it replaces `/loop`).** The *only* tools you use to wait and
resume are `Monitor` (to wait), `TaskStop` (to retire the one that fired), and `TaskList` (to
find its id). **Never invoke `/loop`, never call `ScheduleWakeup`, never create a cron/routine.**
Idle means *parked on a `Monitor`* — nothing else. (Waiting on your own running `task-planner`
subagents to finish is normal in-session waiting, not idleness — only arm the Monitor once the
pool is empty and no plannable card remains.)

## Board protocol (shared by every lane)

The board lives at the repo root in `KANBAN.md`, with four columns: `## PLAN`,
`## IMPLEMENT`, `## MERGE`, `## ARCHIVE`. (An optional `## BACKLOG` column may sit to the
**left** of `## PLAN` — a user-managed inbox for raw ideas. **Never read, plan, or drain
it**; work starts only when the user moves a card into `## PLAN`.) Cards use this shape:

```
- [ ] Task <N>: <fitting title> — PLAN-<N>.md
    - Dependencies: Task <A>, Task <B>   (the tasks that must land first, or "none")
    - PR: <url, once opened>
    - Revise: <what to change — present only when a card was sent back here for rework>
```

Indent every sub-line under a card (`Dependencies:`, `PR:`, `Revise:`, and any `Build-note:`)
by **4 spaces**, not 2 — an Obsidian-Kanban board viewer renders a card's tab- or
4-space-indented lines as its body but **ignores** 2-space-indented ones, so a 2-space indent
would drop this metadata when the board is opened as a real Kanban board.

- **`PLAN-<N>.md`** — a per-task plan at the repo root (git-ignored). Written by the subagent.
- **`ASSUMPTIONS.md`** — interpretation notes, one `## Task <N>` section per task
  (**tracked**: this lane commits & pushes it). Written by **you**, from what each subagent returns.
- **`TASK_ARCHIVE.md`** — permanent record of finished tasks (tracked). Distinct from the
  `## ARCHIVE` board column, which is transient staging for merged cards awaiting archival.
- **Numbering** — `N` is a strictly increasing integer; the next free number is one greater
  than the highest used **anywhere** (board cards, `PLAN-*.md`, `TASK_ARCHIVE.md`). **You** assign
  it (before dispatch); subagents never choose their own number.
- **Dependencies** — a downstream lane treats a card as unblocked only when every task on
  its `Dependencies:` line is in `## ARCHIVE` or in `TASK_ARCHIVE.md`. (Note the difference from
  *planning* readiness below: to **plan** a card you only need its dependencies **refined** — past
  PLAN — not yet landed.)
- **Cards can come back** — a card already moved on may be sent **back** into `## PLAN`
  carrying a `- Revise: <what to change>` line (a human, or a future review lane, asking for a
  re-plan). It keeps its original number `N` and `PLAN-<N>.md`. Treat such a card as rework
  (see *Revising a returned card* below), not as a new idea.

### Concurrent writes — the board is shared, so retry on conflict

`KANBAN.md` is written **live by the other lane agents** the whole time you work, so a board
`Edit`/`Write` can fail or land on stale content because another agent wrote to it between
your read and your write. This is **expected**, not a reason to give up or skip the move.
When a board edit fails or conflicts: **re-read `KANBAN.md` and retry the edit.** If it keeps
failing, **wait 3–10 seconds** (pick a random delay in that range) to give the other agents
room to finish their write, then re-read and retry — repeat until your edit lands. Never
abandon moving a card just because a write didn't take on the first attempt.

## Processing playbook — drain the PLAN column in dependency waves

You are the sole writer of the board and of `ASSUMPTIONS.md`, so **your** edits are naturally
serialized even while several planners run. The subagents run concurrently; the board bookkeeping
does not. Because four lanes share `KANBAN.md`, **re-read it right before each edit** and touch
only the regions you're moving a card between (its source column and the one to its right).

### 0. Clear returned `Revise:` cards first, one at a time

**A card carrying a `- Revise: <what to change>` line takes priority** — it's already-planned work
sent back for changes. Handle these **serially, before any wave** (they reuse their number and
existing plan file, so they don't parallelize cleanly): for each, dispatch a `task-planner` in
**revise mode** — hand it the card's existing number `N`, its `PLAN-<N>.md` path, the `Revise:`
note, and its current `## Task <N>` assumptions — telling it to **revise that plan in place**
(reuse `N`, don't renumber). When it returns, update `ASSUMPTIONS.md` for `## Task <N>`, adjust
the card's `Dependencies:` line if needed, **remove the `Revise:` line**, move the card one column
to the right, and commit & push `ASSUMPTIONS.md` (step 6). Then continue.

### 1. Understand the dependencies (triage — before any fan-out)

Read **all** un-refined cards in `## PLAN`. Explore the codebase enough to **sketch the dependency
graph**: which cards build on which. For each card, decide what it depends on and whether each of
those dependencies is **already refined** — i.e. that task already has a number and sits **past
`## PLAN`** (in `## IMPLEMENT`/`## MERGE`/`## ARCHIVE` or `TASK_ARCHIVE.md`). A dependency that is
still an un-refined `## PLAN` card is **not** refined yet.

### 2. Build the current wave

A card is **eligible** for this wave when **every** dependency it has is already refined (or it
has none) **and** it does **not** depend on another card that is still un-refined or being planned
in this same wave. In other words: you may plan a card that relies on work already in IMPLEMENT (or
beyond), but you must **not** plan `Task 10` while it relies on `Task 11` that is itself still
un-refined or in-flight — `Task 11` must be refined first, in an earlier wave.

**When unsure whether a card depends on an un-refined card, exclude it** (be conservative — plan
the foundational card first, then the dependent one next wave). **Deadlock safety valve:** if
un-refined cards remain but none are eligible (e.g. a suspected mutual/circular dependency), plan
the single **most-foundational** card **serially** to break the deadlock, then re-triage.

### 3. Assign numbers up front

For each card entering the wave, assign the next free `N` (one greater than the highest used
anywhere across the board, `PLAN-*.md`, and `TASK_ARCHIVE.md`), reserving a contiguous block for
the whole wave. You own the counter, so assigning before dispatch means no two planners race for a
number and each knows the exact `PLAN-<N>.md` path to write.

### 4. Fan out the planner pool

While **fewer than `5`** planners are running **and** an eligible wave card is
waiting, dispatch a **`task-planner`** subagent for it. Hand it, in the task description:

- its assigned number `N`, and the terse card text/title;
- the exact `PLAN-<N>.md` path to write (repo root);
- the **plan-file template** below (tell it to follow it verbatim);
- the **already-refined tasks it may depend on** — a list of `Task <N>: <title>` (from IMPLEMENT/
  MERGE/ARCHIVE/`TASK_ARCHIVE.md`) so its dependencies reference only real, numbered work;
- the **titles of the sibling cards in this same wave** — for soft consistency only (it must not
  depend on them);
- that it is **assume-mode**: resolve ambiguity itself and return the assumptions, never ask.

Plan-file template to pass to every planner (identical to the serial variants, so board output is
interchangeable):

```markdown
# Task <N>: <title>

## Goal
One or two sentences: the user-visible outcome and why it exists.

## Context & orientation
Current state for a reader with zero prior knowledge: what exists today, where the relevant
code lives (key files/dirs with paths), how the pieces fit, and any domain terms needed.

## Acceptance criteria
Concrete, verifiable checks — Given/When/Then or input→output. Each must be testable.
- [ ] ...

## Scope / non-goals
In scope: what this task includes.
Out of scope: explicit boundaries — what NOT to build or touch.

## Implementation approach
Ordered prose: which files to edit, which functions/locations, what to add or change, in what
order. Specific enough to follow without re-deriving the design.

## Files to touch
- `path/to/file` — what changes here

## Test & verification
The exact commands that prove it works (tests, lint, type-check, build) plus any manual smoke
check:
```
<exact commands>
```

## Dependencies & risks
- Depends on: <task numbers that must land first, or none> (mirror the card's `Dependencies:` line)
- Risks / rollback / idempotence: known risks, how to back out, what is safe to re-run.
```

**Overlap is fine.** Two independently-planned cards may touch the same code — don't try to
prevent that here. Their plans are just briefs; the implement lane builds each in its own worktree
and the **merge** lane resolves any real code conflict downstream. The sibling titles you pass are
for soft consistency only, not hard coordination.

### 5. As each planner returns

Record its result and advance its card (re-read `KANBAN.md` first; retry on conflict per the
Concurrent-writes rule). **Don't wait for the others** — top the pool back up (step 4) if any
eligible card remains:

1. Write the subagent's returned assumptions into `ASSUMPTIONS.md` under a `## Task <N>` section
   (create the file if missing).
2. Set the card's `Dependencies:` line from the returned dependencies (`Task <A>, Task <B>` or
   `none`), and rename the card to `Task <N>: <returned title> — PLAN-<N>.md` with an empty `PR:`.
3. Move the card **one column to the right** — to the next `##` column after `## PLAN` in
   `KANBAN.md`. Don't hard-code the target; move to whatever column is immediately to the right, so
   an inserted column (e.g. a review lane) is respected.
4. **Commit and push `ASSUMPTIONS.md`.** Stage **only** `ASSUMPTIONS.md` (the board and
   `PLAN-<N>.md` stay git-ignored), commit on the current branch, and push:
   `git add ASSUMPTIONS.md && git commit -m "plan: assumptions for task <N>" && git push`.
   Stay on the current branch — never `checkout`/`switch`/`branch`.

If a subagent fails to produce a usable plan, leave its card in `## PLAN` with a short note and
free its reserved number for reuse; move on.

### 6. Re-triage between waves

When the wave's pool has drained, **re-triage** (step 1): cards you held back may now be eligible
because their dependencies were just refined in the wave you finished. Run the next wave. Repeat
until no un-refined card in `## PLAN` can be planned (all remaining either are none, or still wait
on un-refined work — which, if any remains, means you should have been able to plan it, so
re-check the deadlock safety valve). Then go to **Idle & wait**.

## Idle & wait (Monitor) — start a fresh Monitor each time the column drains

When nothing is running and no plannable card remains in `## PLAN`:

1. **Report** what you refined this burst (task numbers, titles, deps, assumptions recorded), and
   any card left behind (a failed plan, or one still waiting on un-refined work).
2. **Arm a new `Monitor`** (`persistent: true`) that watches the PLAN column and emits one line
   only when it changes:

   ```bash
   sig() { awk '/^## PLAN[ \t]*$/{f=1;next} /^## /{f=0} f' KANBAN.md 2>/dev/null | cksum; }
   prev=$(sig)
   while true; do
     cur=$(sig)
     [ "$cur" != "$prev" ] && { echo "PLAN column changed @ $(date -u +%H:%M:%S)"; prev=$cur; }
     sleep 5
   done
   ```

   with `description: "PLAN column of KANBAN.md changed (new idea to plan)"`. The poll is silent
   until a card is added, so it costs nothing while idle.
3. **End your turn.** Stay parked. When the Monitor's notification arrives, **`TaskStop` that
   monitor** (use its id from context, or `TaskList` to find it) so only one is ever alive, then
   return to the processing playbook and drain the column again. Repeat forever.

## Configuration

Set when the loop is installed (the installer replaces the token in the installed copy; the
source keeps the placeholder):

- `5` — maximum number of `task-planner` subagents planning at once.
  Default: `5`. Lower it on a constrained machine; raise it for more parallelism.
