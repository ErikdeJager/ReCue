# Develop tasks — one orchestration pass

One idempotent pass that advances `TASKS.md` toward completion through isolated
agents. Run it repeatedly (e.g. scheduled on an interval) until everything is done:

```
/loop 5m Run one orchestration pass following the instructions in PROMPT.md
```

Run **unattended**: never ask the user a question (make the safe choice, skip blocked
work, report). All state lives in git (worktrees, branches, PRs) and `TASKS.md`, so
each pass is safe to repeat.

## Pass

1. **Sync.** `git fetch origin --prune`, then put the primary tree on an up-to-date main: `git checkout main && git pull --ff-only origin main`.
2. **Parse tasks.** Read `TASKS.md`. For each task capture: number, marker (`[ ]` / `[x]`), title, and the `Depends on` list (task numbers; `none`/empty = no dependencies).
3. **Pick what can run.** Classify each task:
   - **done** — `[x]`.
   - **ready** — open and *every* task it depends on is done.
   - **blocked** — open with an unfinished dependency → skip this pass.

   Maximize parallelism: all ready tasks may run at once, capped at **3 in-flight workers** (count active worktrees under `.worktree/` that have no merged PR). If at the cap, advance only in-progress tasks this pass.
4. **Advance.** For each ready or in-progress task, invoke the **isolate-agent** skill — `/isolate-agent <number>` (do **not** pass `--wait`, so workers run in the background, in parallel). isolate-agent decides per task whether to start, report, finalize, or skip from the current git state. Finalizing/merging happens there.
5. **Report.** Print a short table: each task → state (done / merging / running / blocked / started-this-pass).
6. **Completion check.** If **all** tasks are `[x]` **and** `git status` is clean **and** `git rev-parse HEAD` equals `git rev-parse origin/main`, print exactly:

   `✅ ALL TASKS COMPLETE — main is in sync. Stop the loop.`

   Otherwise print: `… work remaining; will continue next pass.`

## Notes
- Dependencies come from each task's `Depends on:` line (see `TASKS-TEMPLATE.md`). Treat `none`/empty as independent.
- To stop: the completion line above is the signal — end the `/loop` (interrupt it). If left running after completion, each pass simply finds nothing to do and re-prints the banner harmlessly.
- Raise/lower the concurrency cap by editing step 3 if your machine can handle more.
- Workers and merges need git/gh permission; `.claude/settings.json` pre-approves them. Tasks that add a build or test command may need that command allow-listed too.
