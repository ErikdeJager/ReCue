---

kanban-plugin: board

---

## Refine

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
- [ ] #196 — Worktree header: icon-only marker + inline "new session" button
	Plan: TASK-196.md
	Depends on: none
- [ ] #197 — Click a worktree to filter Overview to just that worktree
	Plan: TASK-197.md
	Depends on: #196
- [ ] #198 — Schedule a session into a worktree (create at fire time, clean up on cancel)
	Plan: TASK-198.md
	Depends on: #199
- [ ] #199 — Worktree auto-delete guard: count all item types, run on every item close
	Plan: TASK-199.md
	Depends on: none
- [ ] #200 — Worktree removal must not freeze the UI (run git worktree remove off-thread)
	Plan: TASK-200.md
	Depends on: #199
- [ ] #201 — Folder/worktree context menu: collapse the two "New session" items into one
	Plan: TASK-201.md
	Depends on: none
- [ ] #202 — File-tree search: filename + content matches with inline snippet preview
	Plan: TASK-202.md
	Depends on: none

## DONE
