---

kanban-plugin: board

---

## Refine

- [ ] Paste (Ctrl+V) doesn't work in agent terminals on Windows. When running the app on Windows, agent terminals cannot receive pasted/copied content. This applies to both text and images. Fix so paste (text and images) works in terminals on Windows.

- [ ] Terminal font renders strangely on Windows. In terminal output some characters look weird/jiggly (the "C" character especially), though still readable. Likely the bundled font (JetBrains Mono) isn't installed/loading properly in the terminal on Windows. This issue is Windows-only — ensure the terminal font works correctly on Windows.

- [ ] Revert where a user creates a canvas from a template. The "new canvas tab" plus button should be a simple plus that just creates a new empty canvas, nothing else. Move all the create-from-template logic back into the Templates dropdown menu.

- [ ] Add an "evenly distribute" button inside the template editor. The canvas already has a button to evenly distribute its panels; add the same option in the template editor so all items in a template can be evenly distributed too.

- [ ] In Canvas templates, support full paths (folders + filename) for a file block, not just a bare filename, plus a choice between relative and absolute path. Relative resolves from the project root; absolute resolves from the filesystem root.

- [ ] Show a subtle, slightly grayed-out branch badge next to each folder name in the left panel, displaying that folder's current branch. It should stay in sync when the branch changes from any source (agent, user typing in a terminal, etc.), so it likely needs polling/checking to pick up checkouts.

## READY

- [ ] #218 — Nest scheduled worktree sessions under a worktree sub-group + Overview badge
	Plan: TASK-218.md
	Depends on: none

- [ ] #219 — Move the sidebar collapse button to the far right of the footer row
	Plan: TASK-219.md
	Depends on: none

## DONE

