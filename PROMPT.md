# Development prompt

Do the following steps in order:

1. **Fetch latest changes.** Ensure local main is up to date with remote.
2. **Find ready task.** Read `TASKS.md`. Find ready tasks. Tasks that are marked as done (`[x]`) or blocked tasks (has unfinished dependencies) do not qualify. Prefer the earliest task available
3. **Understand the task.** Understand the task you chose. And plan your implementation carefully.
4. Implement the task.
5. Commit and push your changes directly to main.
6. You are now finished.


## Notes
- Dependencies come from each task's `Depends on:` line (see `TASKS-TEMPLATE.md`). Treat `none`/empty as independent.
- To stop: the completion line above is the signal — end the `/loop` (interrupt it). If left running after completion, each pass simply finds nothing to do and re-prints the banner harmlessly.
- Raise/lower the concurrency cap by editing step 3 if your machine can handle more.
- Workers and merges need git/gh permission; `.claude/settings.json` pre-approves them. Tasks that add a build or test command may need that command allow-listed too.
