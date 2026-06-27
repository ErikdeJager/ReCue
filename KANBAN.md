---

kanban-plugin: board

---

## Refine

- [ ] Replace the worktree badge on agent headers with a folder + branch indicator. Like the Kanban board header shows its folder, every agent's header should show the folder and branch that specific agent is working on. Remove the separate worktree badge in favor of this.
- [ ] Add lightweight syntax highlighting in the file viewer for common languages: Java, Rust, JavaScript, HTML, CSS, C#, JSON, YAML, POM, Gradle, Go, Lua, SQL, Python, Ruby, PHP. Keep it fast and non-blocking — consider lazy loading languages on demand if a naive approach is slow or hard to maintain. Pick the best approach.
- [ ] When the left panel is collapsed, keep agents clickable with their usual left- and right-click behavior. Currently the collapsed rail shows them as status indicators only — they should still respond to clicks like they do when expanded.
- [ ] Extend the syntax highlighting (same languages as the file viewer task) to the diff viewer, so diffs are syntax-highlighted too.
- [ ] Add a "commits" option to the diff viewer that lists previous commits. Clicking any commit shows what changed in that commit in the diff viewer.

## READY

- [ ] #222 — Revert Canvas "+" to a plain new-tab button; move "from template" into Templates menu
	Plan: TASK-222.md
	Depends on: none
- [ ] #223 — Add a "distribute panels evenly" button to the Template Editor
	Plan: TASK-223.md
	Depends on: none
- [ ] #224 — Canvas template file block: support full paths + relative/absolute path choice
	Plan: TASK-224.md
	Depends on: none
- [ ] #225 — Subtle current-branch badge next to each sidebar folder, synced from any source
	Plan: TASK-225.md
	Depends on: none

## DONE

- [x] #221 — Fix the terminal font rendering "jiggly" on Windows (JetBrains Mono / WebGL atlas)
	Plan: TASK-221.md
