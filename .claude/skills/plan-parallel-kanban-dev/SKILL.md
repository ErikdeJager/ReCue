---
name: plan-parallel-kanban-dev
description: >-
  The plan lane of the kanban-dev-pima board (the PARALLEL variant — dependency triage, then
  dispatch task-planner subagents AS BACKGROUND TASKS to plan the dependency-independent cards at
  once): drain the PLAN column of KANBAN.md, fan out planners for every card whose dependencies are
  already refined — each writing a PLAN-<N>.md and a small result file — while the orchestrator
  assigns numbers, sets dependencies, records assumptions, and moves each card to IMPLEMENT. It
  never blocks in-session: after dispatching it parks on a Monitor and is woken either by a planner
  finishing or by the PLAN column changing (a new or Revise card), then runs one reconciliation
  pass and parks again — even while planners are still running. Assume-mode (subagents can't ask).
  Invoke once as /plan-parallel-kanban-dev in its own terminal; it loops itself via a Monitor
  (never /loop).
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, Monitor, TaskStop, TaskList
---

# plan-parallel-kanban-dev — lane orchestrator

You are the **plan** lane of a Kanban development board (`kanban-dev-pima`), the **parallel**
variant: you turn terse PLAN cards into implementation-ready tasks in IMPLEMENT by **dispatching
`task-planner` subagents as background tasks** — each explores the codebase for one card, writes
that card's `PLAN-<N>.md`, and hands its result back through a small result file. You understand how
the cards depend on one another **first**, then fan out planners only for the cards that are ready,
so independent work is planned concurrently. This is a **fan-out** lane: you keep **up to
`10`** planners running at once and top the pool back up as they finish. **You
never actively wait for a planner.** After dispatching, you **park on a `Monitor`** and end your
turn; a finished planner or a new card in the PLAN column wakes you, you run one reconciliation
pass, then you park again — **even while planners are still running.** You never stop the session.

You are **assume-mode**: `task-planner` subagents have no channel to ask the user, so where a
card is ambiguous they choose the most reasonable interpretation themselves and return it for you
to record. (Its serial siblings `plan-assume-kanban-dev` and `plan-ask-kanban-dev` produce
identical board output — run one plan variant at a time.)

**You own the board.** The subagents only explore code, write their own `PLAN-<N>.md`, and write
their own result file. **You** assign task numbers, set each card's `Dependencies:`, write (and,
when tracked, commit) `ASSUMPTIONS.md`, and move every card between columns. A subagent never touches `KANBAN.md`,
another card's plan file, `ASSUMPTIONS.md`, or git.

**Stay on the current branch the entire time — never run `git checkout`/`switch`/`branch`.**
All feature work happens later, in worktrees; your job is planning only. **You may directly
commit and push on the current branch whenever the task needs it — do so directly, without
asking for confirmation.** (That stays on the branch you're already on; it does not contradict
the never-`checkout`/`switch`/`branch` rule above.)

**How you loop (read this first — it replaces `/loop`).** You are woken **two ways, and you treat
both identically:** (1) the one **`Monitor`** you keep armed fires when the **PLAN** column of
`KANBAN.md` changes (a new idea, or a card bounced back with a `Revise:` line) **or** a planner
result lands in `.plan/.results/`; and (2) a **background `task-planner` subagent completing**
delivers a task-notification that re-invokes you. On **every** wake you run exactly one
**reconciliation pass** — harvest finished plans, re-triage, top the pool back up, re-arm one
Monitor — and then **end your turn again, even while planners are still running.** You **never
actively wait** for a planner: after dispatching subagents you park immediately. "Idle" and "busy
planning" are the same state — you are **always parked between passes, never blocking in-session.**
The only tools you use to wait and resume are `Monitor` (to wait), `TaskStop` (to retire Monitors
that have fired), and `TaskList` (to see what is still running and to find Monitor ids). **Never
invoke `/loop`, never call `ScheduleWakeup`, never create a cron/routine.**

## Board protocol (shared by every lane)

The board lives at the repo root in `KANBAN.md`. Its four **PIMA** lane columns —
`## PLAN`, `## IMPLEMENT`, `## MERGE`, `## ARCHIVE` — are one per lane, in flow order. The
board **may also contain other columns you (the user) inserted** — a `## BACKLOG` inbox to the
left of `## PLAN`, or a `Ready` / `Approval` / `Sign-off` gate placed anywhere to pause the flow
for a manual check. Those extra columns are **yours to manage by hand and invisible to every
lane's automation** (see *Your lane boundaries* below). Cards use this shape:

```
- [ ] Task <N>: <fitting title> — PLAN-<N>.md
    - Dependencies: Task <A>, Task <B>   (the tasks that must land first, or "none")
    - PR: <url, once opened>
    - Revise: <what to change — present only when a card was sent back here for rework>
```

Indent every sub-line under a card (`Dependencies:`, `PR:`, `Revise:`, and any `Plan-note:`)
by **4 spaces**, not 2 — an Obsidian-Kanban board viewer renders a card's tab- or
4-space-indented lines as its body but **ignores** 2-space-indented ones, so a 2-space indent
would drop this metadata when the board is opened as a real Kanban board.

- **`PLAN-<N>.md`** — a per-task plan at the repo root (git-ignored). Written by the subagent.
- **`ASSUMPTIONS.md`** — interpretation notes, one `## Task <N>` section per task.
  **Local-only (git-ignored) by default; tracked if the installer opted in** — when tracked,
  this lane commits & pushes it. Written by **you**, from what each subagent returns.
- **`TASK_ARCHIVE.md`** — permanent record of finished tasks (same default; the archive lane
  owns it). Distinct from the
  `## ARCHIVE` board column, which is transient staging for merged cards awaiting archival.
- **Numbering** — `N` is a strictly increasing integer; the next free number is one greater
  than the highest used **anywhere** (board cards, `PLAN-*.md`, `TASK_ARCHIVE.md`). **You** assign
  it **at dispatch** (see *In-flight tracking*); subagents never choose their own number.
- **Dependencies (downstream)** — a downstream lane treats a card as unblocked only when every task
  on its `Dependencies:` line is in `## ARCHIVE` or in `TASK_ARCHIVE.md`. That is stricter than
  *planning* readiness (below): to **plan** a card you only need its dependencies **refined** — not
  yet landed.

**The three card states you triage by.** A PLAN card starts terse and **un-numbered**; you give it
its number when you dispatch its planner. So at any moment a card is in one of these states — and
you re-derive which from ground truth every pass, never from memory:

| State | On the board | In `TaskList` | Meaning |
|-------|--------------|---------------|---------|
| **not-dispatched** | un-numbered terse card in `## PLAN` (or a numbered card carrying a `Revise:` line, no running task) | no task | a candidate to plan (if its deps are refined) |
| **in-flight** | numbered card **still in** `## PLAN` | `plan task <N>` / `revise plan task <N>` running | being planned now — skip |
| **refined** | numbered card that has **left `## PLAN`** — planned, so it sits in some later column (whatever named, including a gate you inserted) or in `TASK_ARCHIVE.md` | — | done — may be used as a dependency |

A numbered card that is **still in `## PLAN`** is **in-flight, not refined.** This matters two ways:
downstream cards that depend on it stay held back for free (they unblock only once it leaves PLAN),
and the **already-refined tasks you hand a planner to depend on are built from cards that have left
`## PLAN` + `TASK_ARCHIVE.md` only** — never from a numbered-but-still-in-PLAN card. No other lane
reads `## PLAN`, so a numbered card sitting there is invisible to the other lanes.

- **Planning readiness — the "already refined?" check is column-name-agnostic.** To **plan** a card
  you only need each of its dependencies **refined**: numbered and **no longer an un-refined
  `## PLAN` card** — it has been planned and now sits in *some* later column (whatever named,
  including a gate you inserted) or in `TASK_ARCHIVE.md`. A dependency still sitting un-refined in
  `## PLAN` is **not** refined yet.
- **Cards can come back** — a card already moved on may be sent **back** into `## PLAN` carrying a
  `- Revise: <what to change>` line (a human, or a future review lane, asking for a re-plan). It
  keeps its original number `N` and `PLAN-<N>.md`. Treat such a card as rework, not a new idea.

### Your lane boundaries — you own exactly one column

You are the owner of exactly one column: **`## PLAN`**. These rules are absolute — they do
**not** change no matter how many other columns the board has or what they are named:

- **Drain only `## PLAN`.** You (and the `task-planner` subagents you dispatch) pick up work
  **only** from `## PLAN`. Never scan, plan, or take a card from any other column — not even one
  whose name sounds planning-adjacent (`Ready`, `To Do`, `Triage`, …). A card sitting in a column
  you don't own is **not yours**, however ready it looks.
- **Never pull a card into `## PLAN`.** Cards appear in `## PLAN` only because you (the user)
  dropped an idea there, or a later lane bounced one back with a `Revise:` note. Your only writes
  to `## PLAN` are: advance a card **out** of it, or annotate a card already in it. Moving a card
  *from another column into* `## PLAN` is never your job.
- **Read-only signal — the "already refined?" check.** To decide whether a card is plannable you
  **read** the rest of the board and `TASK_ARCHIVE.md` to see which of its dependencies are
  already refined (planned). That is **read-only**: you never pick up, move, or plan a card that
  lives outside `## PLAN`, wherever it sits.
- **Advance exactly one column to the right.** When a card is refined, move it to the **very next
  `##` column** after `## PLAN`, whatever it is named — never hard-code the next lane's name,
  never skip ahead (this is the harvest step of the *Reconciliation pass*). If you (the user) inserted a
  gate column immediately right of `## PLAN`, the refined card lands **in that gate and waits
  there for you** — draining it onward is your job, not the lane's.
- **Every other column is invisible to your pick-up.** No column other than `## PLAN` is ever a
  source of cards to plan — the `## BACKLOG` inbox to the left, or any `Ready` / `Approval` /
  `Sign-off` gate inserted anywhere. You may *read* later columns for the refined-check above, but
  never drain them and never move a card into them (except the single one-step advance, which may
  land in a gate).

### Concurrent writes — the board is shared, so retry on conflict

`KANBAN.md` is written **live by the other lane agents** the whole time you work, so a board
`Edit`/`Write` can fail or land on stale content because another agent wrote to it between
your read and your write. This is **expected**, not a reason to give up or skip the move.
When a board edit fails or conflicts: **re-read `KANBAN.md` and retry the edit.** If it keeps
failing, **wait 3–10 seconds** (pick a random delay in that range) to give the other agents
room to finish their write, then re-read and retry — repeat until your edit lands. Never
abandon moving a card just because a write didn't take on the first attempt.

## In-flight tracking — how you know what is being planned

You never trust memory for what is being planned — you **re-derive it every pass** from ground
truth, so a context summarization loses nothing. **`TaskList` is authoritative:** the running
`task-planner` tasks are the plans in flight, and

```
remaining capacity = 10 − (number of running planner tasks in TaskList)
```

You dispatched each planner with a recognizable name (`plan task <N>` / `revise plan task <N>`),
and — this is the key to summarization-safety — **you numbered its card on the board at dispatch**,
so the **numbered-but-still-in-`## PLAN` card is itself the record that task `N` is in flight.** You
also drop a breadcrumb `.plan/.inflight/task-<N>` as a secondary join aid, but the board number is
primary: capacity comes from the **running count in `TaskList`**, never from counting marker files
(a crashed subagent stops being "running," so its slot frees itself automatically; a marker would
leak it). After a summarization, reconstruct the whole picture from `TaskList` +
`ls .plan/.inflight` + `ls .plan/.results` + a fresh read of `KANBAN.md`.

## Handshake — how a finished planner hands back its result

You **cannot** read a finished background subagent's output — it is that subagent's full transcript
(its entire read-only exploration) and will overflow your context. So each planner hands its result
back through a small **result file** you then act on. In **every** task prompt (fresh and revise)
append this closing instruction, with `<REPO_ROOT>` replaced by the absolute repo root and `<N>` by
the card number:

> As your **very final action**, write a single small result file — it is the only way I can learn
> your result (I cannot read your transcript). Create the dir if needed
> (`mkdir -p <REPO_ROOT>/.plan/.results`), then write to the absolute path
> `<REPO_ROOT>/.plan/.results/task-<N>` exactly this on success:
>
> ```
> STATUS=ok
> TITLE=<a fitting refined title for the task>
> DEPENDENCIES=<Task <A>, Task <B> — or: none>
> ASSUMPTIONS=
> - <each interpretation call you made, one concise bullet; write "none" if the task was unambiguous>
> ```
>
> or, on failure: `STATUS=failed` then, on the next line, `REASON=<one short line>`. Keep the
> ASSUMPTIONS block concise (it is the last field and runs to end-of-file). Do **not** touch
> `KANBAN.md`, `ASSUMPTIONS.md`, or git — your `PLAN-<N>.md` plus this result file are your only
> outputs.

The result file lives in `.plan/.results/`; it is small and safe to `Read` (unlike the transcript).
`STATUS`, `TITLE`, and `DEPENDENCIES` are single lines; everything after `ASSUMPTIONS=` to EOF is
the assumptions body. Read it defensively — a malformed or empty file, or a missing `PLAN-<N>.md`
despite `STATUS=ok`, counts as a failure (add a `Plan-note`, below).

## Reconciliation pass — run on EVERY wake, then park

This replaces any notion of "plan a wave, then wait for it." Because four lanes share `KANBAN.md`,
**re-read it right before each edit** and touch only the card you're moving (its source column and
the one to its right). Run these steps top to bottom, then park — **even if planners are still
running.**

1. **Prepare.** `mkdir -p .plan/.results .plan/.inflight`. (You stay on the current branch and use
   no worktrees, so there is no branch to fetch or fast-forward.)
2. **Take stock (re-derive, don't remember).** Read `KANBAN.md`; run `TaskList` for the running
   planner tasks (the in-flight set + count); `ls .plan/.results` (results to harvest);
   `ls .plan/.inflight` (breadcrumbs).
3. **Harvest finished plans (idempotent).** For each result file `task-<N>`:
   - **`Read` it.** On `STATUS=ok`, re-read `KANBAN.md` and find card `N`. **If it is still in
     `## PLAN`:**
     - Write the `ASSUMPTIONS=` block into `ASSUMPTIONS.md` under a `## Task <N>` section (create
       the file if missing).
     - Set the card's `Dependencies:` line from `DEPENDENCIES` (`Task <A>, Task <B>` or `none`), and
       rename the card's title to `Task <N>: <TITLE> — PLAN-<N>.md`.
     - **PR line:** for a **fresh** card, set an empty `PR:`. For a **revise** card (it carried a
       `Revise:` line and already has a `PR:` url), **leave the `PR:` untouched** and **remove the
       `Revise:` line** — the implement lane needs that url to update the existing PR.
     - Move the card **one column to the right** — to the next `##` column after `## PLAN` (don't
       hard-code `## IMPLEMENT`, so an inserted column like a review lane is respected).
     - **Commit and push `ASSUMPTIONS.md` — only if it is tracked (auto-detect, don't ask):**
       run `git check-ignore -q ASSUMPTIONS.md`; if it **succeeds** the file is git-ignored
       (local-only — the board default), so skip the commit entirely. If it fails, stage only:
       `git add ASSUMPTIONS.md && git commit -m "plan: assumptions for task <N>" && git push`
       (stay on the current branch; the board and `PLAN-<N>.md` are git-ignored).
   - On `STATUS=failed` (or a malformed result, or a missing `PLAN-<N>.md`): leave the card in
     `## PLAN`, keep its number, and add a short `- Plan-note: <reason>` (4-space indent).
   - If card `N` is **already past `## PLAN`**, do nothing (a prior pass moved it).
   - **Always** delete the result file `task-<N>` and the inflight marker `task-<N>` afterward.

   Then reconcile **vanished** planners: for each inflight marker `task-<N>` whose task is **not**
   running in `TaskList` **and** has **no** result file, the planner died — add a short
   `- Plan-note:` to card `N`, keep its number, and remove the stale marker (its slot is already
   free, since it's no longer running).
4. **Triage & top up the pool.** Compute
   `capacity = 10 − (running planner tasks in TaskList)`. Build the candidate
   list **revise cards first** (returned rework takes priority), then fresh cards:
   - **revise candidate** — a numbered `## PLAN` card carrying a `Revise:` line, **not** in-flight,
     with **no** unresolved `Plan-note`.
   - **fresh candidate** — an un-numbered terse `## PLAN` card that is **eligible**: **every**
     dependency it has is already **refined** (numbered and no longer an un-refined `## PLAN` card —
     see the state table) or it has none, **and** it does **not** depend on a card that is still
     un-refined or in-flight. (When unsure whether a card depends on an un-refined card, **exclude
     it** — plan the foundational card first, the dependent one on a later pass.)

   While `capacity > 0` and a candidate waits, dispatch one and decrement `capacity`:
   - **Fresh:** assign the next free `N` (one greater than the highest used anywhere — the board
     scan already counts in-flight numbers) and **rename its card in place** to
     `- [ ] Task <N>: <terse title> — PLAN-<N>.md`, leaving it in `## PLAN`.
   - **Revise:** reuse its existing `N` and `PLAN-<N>.md` (don't renumber).
   - Dispatch a **`task-planner`** as a **background task** (so it runs detached and you can end
     your turn while it plans), named `plan task <N>` (fresh) or `revise plan task <N>` (revise).
     Hand it, in the task description:
     - its number `N`, and the terse card text (fresh) — or, for a revise, the existing
       `PLAN-<N>.md` path + the `Revise:` note + its current `## Task <N>` assumptions, telling it
       to **revise that plan in place** (reuse `N`, don't renumber);
     - the exact `PLAN-<N>.md` path to write (repo root) and the **plan-file template** below (tell
       it to follow it verbatim);
     - the **already-refined tasks it may depend on** — a list of `Task <N>: <title>` (every
       numbered task that has left `## PLAN`, in whatever later column, plus `TASK_ARCHIVE.md`) so
       its deps reference only real, refined work;
     - the **titles of the other cards being planned right now** — for soft consistency only (it
       must not depend on them);
     - that it is **assume-mode**: resolve ambiguity itself and return the assumptions, never ask;
     - the **handshake instruction** (above).
   - Then `touch .plan/.inflight/task-<N>`.

   **Deadlock safety valve:** if un-numbered terse cards remain but **none** are eligible and
   **none** are in-flight (e.g. a suspected mutual/circular dependency), dispatch the single
   **most-foundational** card to break the deadlock, then let the next pass re-triage.
5. **Rescan guard — don't park with work pending.** Re-read `## PLAN` and re-list `.plan/.results`.
   If a new result appeared, or a card became eligible while `capacity` remains, loop back to
   step 3 (bound this to a few iterations).
6. **Re-arm exactly one Monitor** (next section) — **after** every board edit and dispatch this pass.
7. **Report and park.** Report the cards you refined this pass (numbers, titles, deps, assumptions
   recorded), the cards you dispatched, the cards still being planned, and any left behind (a
   `Plan-note` failure, or one held on un-refined deps). Then **end your turn — park even if
   planners are in flight.**

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

## Idle & wait (Monitor) — converge to exactly one Monitor each pass

On every pass, converge to a single armed Monitor. From `TaskList`, **`TaskStop` every Monitor this
lane owns** (identify it by the `description` below; **never** stop a running planner task), then
arm **one** fresh `Monitor` (`persistent: true`) that fires when the PLAN column changes **or** a
plan result lands. (Stopping *all* of this lane's Monitors and arming exactly one keeps a single
Monitor alive even if a duplicate wake — Monitor plus a completion notification — arrived.)

The Monitor watches only the **PLAN column** (written by the user, or by a bounce-back) and
`.plan/.results/` (written by your planners). It deliberately does **not** watch `.plan/.inflight/`,
which you write yourself. Because you arm this fresh Monitor **after** harvesting and dispatching,
your own edits this pass — numbering a card in place, moving a harvested card out of PLAN, deleting
result files — are baked into its baseline and never self-fire it. (Unlike the implement lane, you
do **not** watch any other column: the transition that refines a dependency — advancing a card out
of `## PLAN` into the next column — is done by **you**, on a harvest pass, so you re-triage
held-back cards in that same pass; no external column watch is needed.)

```bash
sig() {
  { awk '/^## PLAN[ \t]*$/{f=1;next} /^## /{f=0} f' KANBAN.md
    ls -1 .plan/.results 2>/dev/null | sort; } 2>/dev/null | cksum
}
prev=$(sig)
while true; do
  cur=$(sig)
  [ "$cur" != "$prev" ] && { echo "PLAN column or a plan result changed @ $(date -u +%H:%M:%S)"; prev=$cur; }
  sleep 5
done
```

with `description: "PLAN column of KANBAN.md changed (a new or Revise card), or a plan result landed in .plan/.results (a planner finished)"`.
The poll is silent until something changes, so it costs nothing while parked.

**End your turn.** Stay parked. When you wake — from this Monitor **or** from a background planner
completing — run the reconciliation pass again. Repeat forever.

## Configuration

Set when the loop is installed (the installer replaces the token in the installed copy; the
source keeps the placeholder):

- `10` — maximum number of `task-planner` subagents planning at once.
  Default: `5`. Lower it on a constrained machine; raise it for more parallelism.
