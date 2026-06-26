---

kanban-plugin: board

---

## Refine

- [ ] Worktree header: icon indicator + the same new-item button repos have
	A worktree row shows the literal word "worktree" and its create flow looks different from a repo's. Drop the word in favor of a simple icon that marks it as a worktree, and give the worktree header the same new-panel/create button repos have — items created still go into that same worktree.
- [ ] Click a worktree to filter Overview to just that worktree
	Clicking a repo in the left panel filters Overview to it; a worktree isn't clickable that way. Make clicking a worktree filter Overview to show only the items running/shown inside that worktree, mirroring how folder filtering works.
- [ ] Schedule a session into a worktree
	The schedule modal has no worktree option, so you can't schedule an agent to launch inside a worktree — an important gap. Add it: the worktree can be created when the scheduled session is created. If the user cancels the schedule and no other agents, scheduled sessions, or items remain for that worktree, delete the worktree.
- [ ] Guard: auto-delete a worktree when its last item is closed
	A worktree must never be deleted while any item for it is still shown in the left panel (agent, scheduled session, file/diff/terminal/kanban panel). But the moment the last item in a worktree is closed/removed, the worktree itself should be deleted — the expected cleanup flow. The guard should run whenever an item inside a worktree is closed: check if any other item remains in that worktree; if none, delete the worktree. Refining this: confirm the existing ref-counted removal (#74 removes on last agent) actually covers all item types, not just agents, and test it. If there are any bugs or gaps, create a task to fix it. If it's already implemented correctly without bugs, remove this card from the board entirely.
- [ ] Folder context menu: one "New session", not two
	The left-panel folder context menu has both a top-level "New session" and a "New session here" under Views — redundant and confusing. Collapse them into a single "New session" option.
- [ ] File tree panel: search input with content matches + inline preview
	Add a nice search input to the file tree panel. As the user types, matching files show up — matched by filename and by file contents. For content hits, show inline the matching snippet in a small "mini file viewer." Each result has easy actions: reveal/open the file's location in the tree, or open it in a file viewer panel. No separate search panel — it lives inside the file tree.
- [ ] worktree deletion block
	When closing a final item inside a worktree; that job blocks the UI. Since files are being removed from the filesystem, the application freezes up and is unresponsive. I want this process to happen in the background so that the user can continue to use the app.

## READY

- [ ] #190 — Auto-update skeleton: gated release pipeline + in-app update UI (keys deferred)
	Plan: TASK-190.md
	Depends on: none
- [ ] #191 — Settings → "Updates" section: check for updates + review what will be installed
	Plan: TASK-191.md
	Depends on: #190
- [ ] #192 — Patch notes: baked-in per-version JSON, release-carried notes, settings view
	Plan: TASK-192.md
	Depends on: #190, #191
- [ ] #193 — Dev-only mock update — drive the update UI without a real release
	Plan: TASK-193.md
	Depends on: #190, #191, #192
- [ ] #194 — Kanban: optional card checkbox (render plain `- bullet` lines as cards)
	Plan: TASK-194.md
	Depends on: none
- [ ] #195 — Clean up Kanban card UI (hover-revealed actions, declutter title)
	Plan: TASK-195.md
	Depends on: #194

## DONE

- [ ] #189 — Keyboard-driven panel-creation modal (⌘K) + per-type shortcuts
	Plan: TASK-189.md
	Depends on: none
