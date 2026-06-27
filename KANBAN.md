---

kanban-plugin: board

---

## Refine

- [ ] Reinvent the Kanban board UI (the in-app KanbanPanel) to be cleaner and use space more efficiently, per the wireframe. Card design: a checkbox pinned to the top-left corner of every card, with the card text flowing to its right and using the full card width; tight padding / minimal margins. Because each card is just a markdown line, there's no separate title vs description — the card body renders uniformly — but additional detail/meta lines must still be supported (rendered as dimmed, monospace-style secondary lines beneath the main text, e.g. "blocked on: …"), the same way Ready-column cards carry extra fields like "Plan:" / "Depends on:" today. Inline add-card composer with placeholder "Write a card… Shift+Enter for detail lines", a primary "Add card" button and a "Cancel" button — Shift+Enter adds the detail lines. Per-column header: a small status-colored dot, the column name in uppercase letter-spaced caps, a count pill, and a "+" add button on the right; each column has its own accent color. A dashed/ghost "+ Add card" affordance at the bottom of each column. Keep it all functional with the markdown Kanban format.

## READY

- [ ] #228 — Make agents in the collapsed sidebar rail clickable (left-click select + right-click menu)
	Plan: TASK-228.md
	Depends on: none
- [ ] #229 — Syntax-highlight the diff viewer (reusing the file viewer's languages)
	Plan: TASK-229.md
	Depends on: #227
- [ ] #230 — Add a "Commits" source to the diff viewer (list commits → show a commit's diff)
	Plan: TASK-230.md
	Depends on: none
- [ ] #231 — Redesign the diff viewer UI with selectable display modes (Accordion + Focused single-file)
	Plan: TASK-231.md
	Depends on: #229, #230
- [ ] #232 — Scheduled task time: show only the time when the date is today
	Plan: TASK-232.md
	Depends on: none

## DONE
- [ ] 
