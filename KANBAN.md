---

kanban-plugin: board

---

## Refine

- [ ] Mock update (dev testing)
	In dev runs, be able to insert a command to mock an available update. Mocking this will change the UI and show a fake update status, allowing testing of the UI.
- [ ] Optional card checkbox — render plain `- bullet` lines as cards
	A plain `- bullet` (no `[ ]`/`[x]`) is currently dropped by the parser, so the card disappears. Let a card optionally have no checkbox: a plain bullet shows as a card and round-trips back unchanged.
- [ ] Clean up Kanban card UI — reposition checkbox + action icons
	The edit (pen) and delete icons crowd the card title, and the overall card layout looks bad. Redesign for a cleaner look with the checkbox and action icons in better positions. Whoever refines this should search the internet for examples of good-looking Kanban cards first.

## READY

- [ ] #187 — "Save current canvas as template" (seed Template Editor from a live canvas)
	Plan: TASK-187.md
	Depends on: none
- [ ] #188 — Double-click a panel/card header to rename the agent inline
	Plan: TASK-188.md
	Depends on: none
- [ ] #189 — Keyboard-driven panel-creation modal (⌘K) + per-type shortcuts
	Plan: TASK-189.md
	Depends on: none
- [ ] #190 — Auto-update skeleton: gated release pipeline + in-app update UI (keys deferred)
	Plan: TASK-190.md
	Depends on: none
- [ ] #191 — Settings → "Updates" section: check for updates + review what will be installed
	Plan: TASK-191.md
	Depends on: #190
- [ ] #192 — Patch notes: baked-in per-version JSON, release-carried notes, settings view
	Plan: TASK-192.md
	Depends on: #190, #191

## DONE

- [ ] #186 — Distribute Canvas panels evenly (button + border double-click)
	Plan: TASK-186.md
	Depends on: none

