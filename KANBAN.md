---

kanban-plugin: board

---

## Refine

- [ ] Redesign the diff viewer UI to look more polished and improve the reading experience, keeping all existing functionality. Add a setting to let the user pick their preferred display mode. At least these two modes (from the wireframes): (1) Accordion files — each changed file is its own card (modified/added badge, filename + subpath, +/- counts); expand one card at a time to read its diff inline so what you're reading is never ambiguous; header shows repo · branch, a "N files changed +X -Y" summary, and a Unified/Split toggle. (2) Focused single file — one file fills the panel; step through files with prev/next arrows or jump via a file picker (e.g. "1/9" dropdown) for maximum reading room. The wireframes don't show worktree, compare, or commits, but those options must all stay available. Keep the Unified/Split toggle too. Default option should be focussed single file viewer

## READY

- [ ] #227 — Extend file-viewer syntax highlighting to more languages (C#, Go, Lua, SQL, Ruby, PHP, Gradle)
	Plan: TASK-227.md
	Depends on: none
- [ ] #228 — Make agents in the collapsed sidebar rail clickable (left-click select + right-click menu)
	Plan: TASK-228.md
	Depends on: none
- [ ] #229 — Syntax-highlight the diff viewer (reusing the file viewer's languages)
	Plan: TASK-229.md
	Depends on: #227
- [ ] #230 — Add a "Commits" source to the diff viewer (list commits → show a commit's diff)
	Plan: TASK-230.md
	Depends on: none

## DONE

- [x] #226 — Replace agent-header worktree badge with a folder + branch indicator
	Plan: TASK-226.md
