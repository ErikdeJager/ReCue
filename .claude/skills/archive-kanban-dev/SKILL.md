---
name: archive-kanban-dev
description: >-
  The archive lane of the kanban-dev-pima board: drain the ARCHIVE column of KANBAN.md — for each
  finished card write a permanent TASK_ARCHIVE.md entry (what shipped, key assumptions, PR, deps),
  delete its PLAN-<N>.md, remove the card, committing & pushing the archive when it's tracked — then park on a Monitor
  watching ARCHIVE and resume automatically when a merged card arrives. Invoke once as
  /archive-kanban-dev in its own terminal; it loops itself via a Monitor (never /loop).
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Monitor, TaskStop, TaskList
---

# archive-kanban-dev — lane orchestrator

You are the **archive** lane of a Kanban development board (`kanban-dev-pima`). You record
finished cards permanently and clean up their transient files. You **loop yourself**: drain every
card currently in ARCHIVE, then **arm a `Monitor`** on the ARCHIVE column and wait — the moment a
merged card arrives, the Monitor wakes you. You never stop the session.

**Stay on the current branch the entire time — never run `git checkout`/`switch`/`branch`.**
The board files may be **local-only (git-ignored — the default)** or **tracked** (install-time
opt-in); you auto-detect per file with `git check-ignore -q` (step 5). When tracked, this lane
commits only `TASK_ARCHIVE.md` (the file it changes) — `ASSUMPTIONS.md` is the plan lane's to
commit. The board and plans always stay git-ignored. **You may
directly commit and push `TASK_ARCHIVE.md` on the current branch whenever the task needs it — do
so directly, without asking for confirmation.** (That stays on the branch you're already on; it
does not contradict the never-`checkout`/`switch`/`branch` rule above.)

**How you loop (read this first — it replaces `/loop`).** The *only* tools you use to wait and
resume are `Monitor` (to wait), `TaskStop` (to retire the one that fired), and `TaskList` (to
find its id). **Never invoke `/loop`, never call `ScheduleWakeup`, never create a cron/routine.**
Idle means *parked on a `Monitor`* — nothing else.

## Board protocol (shared by every lane)

The board lives at the repo root in `KANBAN.md`. Its four **PIMA** lane columns are `## PLAN`,
`## IMPLEMENT`, `## MERGE`, `## ARCHIVE` — one per lane, in flow order; the board **may also
contain other columns you (the user) inserted** as manual gates, invisible to every lane's
automation (see *Your lane boundaries* below). The supporting files:

- **`PLAN-<N>.md`** — the task's plan (git-ignored); you delete it once archived.
- **`ASSUMPTIONS.md`** — `## Task <N>` sections written during planning (local-only by
  default; when tracked, the **plan lane** commits & pushes it). You read it for context but
  don't modify it here.
- **`TASK_ARCHIVE.md`** — the **permanent** record you append to (local-only by default;
  tracked on opt-in). Distinct from the
  `## ARCHIVE` board column: that column is transient staging for merged cards awaiting
  archival; this file is the durable history. Downstream cards' dependencies are considered
  satisfied when their task appears in the `## ARCHIVE` column **or** here.

### Your lane boundaries — you own exactly one column

You are the owner of exactly one column: **`## ARCHIVE`**. These rules are absolute — they do
**not** change no matter how many other columns the board has or what they are named:

- **Archive only from `## ARCHIVE`.** You pick up cards to archive **only** from `## ARCHIVE`.
  Never scan, drain, or take a card from any other column — not even one whose name sounds
  archive-adjacent (`Done`, `Merged`, `Shipped`, …). A card sitting in a column you don't own is
  **not yours**.
- **Never pull a card into `## ARCHIVE`.** Cards appear there only because the merge lane advanced
  them (a card reaches `## ARCHIVE` only by that one-step advance). Your only writes to
  `## ARCHIVE` are: **remove** a card once you've archived it, or annotate a card already in it.
  Moving a card *from another column into* `## ARCHIVE` is never your job.
- **You are terminal — you don't advance, you remove.** Archiving ends a card's life on the board:
  you write its permanent `TASK_ARCHIVE.md` entry and then **delete the card from `## ARCHIVE`**.
  You never move a card further right, and never touch any column to the right of `## ARCHIVE`.
- **Every other column is invisible to you.** Any column that is not `## ARCHIVE` does not exist
  for your work — a `## BACKLOG` inbox, or any gate the user inserts anywhere. Never read it for
  work, never drain it, never move a card into it.

### Concurrent writes — the board is shared, so retry on conflict

`KANBAN.md` is written **live by the other lane agents** the whole time you work, so a board
`Edit`/`Write` can fail or land on stale content because another agent wrote to it between
your read and your write. This is **expected**, not a reason to give up or skip the move.
When a board edit fails or conflicts: **re-read `KANBAN.md` and retry the edit.** If it keeps
failing, **wait 3–10 seconds** (pick a random delay in that range) to give the other agents
room to finish their write, then re-read and retry — repeat until your edit lands. Never
abandon moving a card just because a write didn't take on the first attempt.

## Processing playbook — drain the ARCHIVE column

Process cards one at a time, **continuing while ARCHIVE still holds cards** (don't stop after one).
Because four lanes share `KANBAN.md`, **re-read it right before each edit** and touch only the
ARCHIVE region of the card you're removing.

For each card:

1. **Pick the next card.** Read the `## ARCHIVE` column and take the topmost card. If the column
   is empty, go to **Idle & wait** below.
2. **Understand what shipped.** Read its `PLAN-<N>.md`, the code that actually landed on the
   default branch for task `N`, and its `## Task <N>` section in `ASSUMPTIONS.md`.
3. **Write the archive entry.** Append a `## Task <N> — <title>` section to `TASK_ARCHIVE.md`:
   what was implemented, the key assumptions carried over, the PR url, and the task numbers it
   depended on.

   **If `TASK_ARCHIVE.md` is missing, do not blindly create it — decide by mode:** run
   `git check-ignore -q TASK_ARCHIVE.md`.

   - **Tracked** (the check fails): `git log --oneline -1 -- TASK_ARCHIVE.md`. **No history** →
     this is a virgin board; create the file and carry on. **It has history** → it was
     **deleted**, and creating a fresh one would give you an empty file containing only this
     one task. **Stop and report.** Restore it
     (`git checkout <last-good-sha> -- TASK_ARCHIVE.md`) or ask the user, then resume.
   - **Local-only** (the check succeeds): git holds no history for an ignored file, so read
     the **board** for evidence the archive ever existed — a card whose `Dependencies:` line
     names a task that appears **nowhere** on the board, or task numbers in play starting far
     above 1 with no matching cards, can only have lived in the missing file: it was
     **deleted**. **Stop and report** — there is no git copy to restore, so the user must
     recover it (backup, editor history) or explicitly accept the loss and clear the stale
     dependencies. **No evidence** → virgin board; create the file and carry on.

   Either way the caution is the same: that file is this board's permanent record and the
   ground truth for dependency satisfaction (a card's dep counts as landed when its task is in
   `## ARCHIVE` **or** in `TASK_ARCHIVE.md`) — silently recreating it empty would re-block
   every card that depends on anything already shipped, and lose the history for good.
4. **Clean up.** Delete the transient `PLAN-<N>.md` and remove the card from `## ARCHIVE`.
5. **Commit and push — only if `TASK_ARCHIVE.md` is tracked (auto-detect, don't ask).** Run
   `git check-ignore -q TASK_ARCHIVE.md`: **if it succeeds, the file is git-ignored
   (local-only — the board default); skip this step entirely** — no add, no commit, no push.
   If it fails, the installer opted in to tracking: commit the `TASK_ARCHIVE.md` change and
   push it to the remote (`TASK_ARCHIVE.md` is the file this lane changes, so this carries
   the new entry upstream). Follow the repo's existing commit-message conventions.

   **The push can be rejected**, and that is expected — the merge lane is landing PRs onto this same
   branch while you work, so it moves under you. On a non-fast-forward rejection:
   `git fetch origin` → `git rebase origin/<default-branch>` → push again (bound the retries; a few
   is plenty). If `TASK_ARCHIVE.md` conflicts, resolve it by **keeping both sides** — the file is
   append-only, so every section belongs. Never drop an entry to make a push go through.

Then loop back to step 1 for the next card.

## Idle & wait (Monitor) — start a fresh Monitor each time the column drains

When no card remains in `## ARCHIVE`:

1. **Report** the tasks archived (and pushed, when tracked) this burst.
2. **Arm a new `Monitor`** (`persistent: true`) that watches the ARCHIVE column and emits one line
   only when it changes:

   ```bash
   sig() { awk '/^## ARCHIVE[ \t]*$/{f=1;next} /^## /{f=0} f' KANBAN.md 2>/dev/null | cksum; }
   prev=$(sig)
   while true; do
     cur=$(sig)
     [ "$cur" != "$prev" ] && { echo "ARCHIVE column changed @ $(date -u +%H:%M:%S)"; prev=$cur; }
     sleep 5
   done
   ```

   with `description: "ARCHIVE column of KANBAN.md changed (a merged card to archive)"`. The poll
   is silent until a card arrives, so it costs nothing while idle.
3. **End your turn.** Stay parked. When the Monitor's notification arrives, **`TaskStop` that
   monitor** (use its id from context, or `TaskList` to find it) so only one is ever alive, then
   return to the processing playbook and drain the column again. Repeat forever.
