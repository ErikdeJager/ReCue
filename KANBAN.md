---

kanban-plugin: board

---

## Refine

- [ ] Terminal font renders strangely on Windows. In terminal output some characters look weird/jiggly (the "C" character especially), though still readable. Likely the bundled font (JetBrains Mono) isn't installed/loading properly in the terminal on Windows. This issue is Windows-only — ensure the terminal font works correctly on Windows.

- [ ] Revert where a user creates a canvas from a template. The "new canvas tab" plus button should be a simple plus that just creates a new empty canvas, nothing else. Move all the create-from-template logic back into the Templates dropdown menu.

- [ ] Add an "evenly distribute" button inside the template editor. The canvas already has a button to evenly distribute its panels; add the same option in the template editor so all items in a template can be evenly distributed too.

- [ ] In Canvas templates, support full paths (folders + filename) for a file block, not just a bare filename, plus a choice between relative and absolute path. Relative resolves from the project root; absolute resolves from the filesystem root.

- [ ] Show a subtle, slightly grayed-out branch badge next to each folder name in the left panel, displaying that folder's current branch. It should stay in sync when the branch changes from any source (agent, user typing in a terminal, etc.), so it likely needs polling/checking to pick up checkouts.

- [ ] Replace the worktree badge on agent headers with a folder + branch indicator. Like the Kanban board header shows its folder, every agent's header should show the folder and branch that specific agent is working on. Remove the separate worktree badge in favor of this.

- [ ] In the folder context menu, make the file tree the top option.

## READY

- [ ] #218 — Nest scheduled worktree sessions under a worktree sub-group + Overview badge
	Plan: TASK-218.md
	Depends on: none

- [ ] #219 — Move the sidebar collapse button to the far right of the footer row
	Plan: TASK-219.md
	Depends on: none

- [ ] #220 — Make Ctrl+V paste (text + images) work in terminals on Windows
	Plan: TASK-220.md
	Depends on: none

## DONE

