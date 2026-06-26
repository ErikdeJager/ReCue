---

kanban-plugin: board

---

## Refine

- [ ] Keybinds for panel creation
	There should be a keybind that opens a modal for panel creation. User can select panel and repo. There are also keybinds for individual panels. Cmd+1 = session, Cmd+2 = file view, etc. The next step in the modal is repo or repo-worktree selection. This feature is meant as a nice to have for users to quickly load new panels.
- [ ] Updating setup (skeleton for future auto-update)
	Set up the update feature in its first setup for later. We'll need tauri keys for this, but that's deferred and generated later. For now set up everything for future deployment: a GitHub pipeline that makes a draft release per version of the app, but it checks if the secret key is present in GitHub secrets — if not present the workflow ends early. The UI has an update indicator in the left panel, in a little box at the bottom (box above the settings). A modal appears asking if the user is sure; clicking OK freezes the app (block user input) and shows a progress bar for downloads etc. App restarts updated and shows a toast with the new version. This skeleton needs to be ready to go once a full tauri signing key is provided in a later task.

## READY

- [ ] #186 — Distribute Canvas panels evenly (button + border double-click)
	Plan: TASK-186.md
	Depends on: none
- [ ] #187 — "Save current canvas as template" (seed Template Editor from a live canvas)
	Plan: TASK-187.md
	Depends on: none
- [ ] #188 — Double-click a panel/card header to rename the agent inline
	Plan: TASK-188.md
	Depends on: none

## DONE

