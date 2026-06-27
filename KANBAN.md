---

kanban-plugin: board

---

## Refine

- [ ] When the left panel is collapsed, keep agents clickable with their usual left- and right-click behavior. Currently the collapsed rail shows them as status indicators only — they should still respond to clicks like they do when expanded.
- [ ] Extend the syntax highlighting (same languages as the file viewer task) to the diff viewer, so diffs are syntax-highlighted too.
- [ ] Add a "commits" option to the diff viewer that lists previous commits. Clicking any commit shows what changed in that commit in the diff viewer.
- [ ] Change the usage indicator's red threshold from 95% to 90%.

## READY

- [ ] #225 — Subtle current-branch badge next to each sidebar folder, synced from any source
	Plan: TASK-225.md
	Depends on: none
- [ ] #226 — Replace agent-header worktree badge with a folder + branch indicator
	Plan: TASK-226.md
	Depends on: none
- [ ] #227 — Extend file-viewer syntax highlighting to more languages (C#, Go, Lua, SQL, Ruby, PHP, Gradle)
	Plan: TASK-227.md
	Depends on: none

## DONE

- [x] #223 — Add a "distribute panels evenly" button to the Template Editor
	Plan: TASK-223.md
- [x] #224 — Canvas template file block: support full paths + relative/absolute path choice
	Plan: TASK-224.md
