---

kanban-plugin: board

---

## Refine

- [ ] Define the missing `--space-10` spacing token (or replace its uses) — it's undefined in tokens.css, so `var(--space-10)` silently drops padding to 0 at ~8 sites (FileViewer, DiffInspector, Canvas, TemplateEditor, Kanban)

## READY

- [ ] #239 — Add a Settings section to configure Kanban column colors by name (with a hashed-name fallback)
	Plan: TASK-239.md
	Depends on: none
- [ ] #240 — Make the Kanban "Add card" / "Cancel" buttons roomier (fix their dropped padding from the undefined --space-10 token)
	Plan: TASK-240.md
	Depends on: none
- [ ] #241 — Add an attention-grabbing glowing tooltip beside the sidebar feedback (bug-report) button
	Plan: TASK-241.md
	Depends on: none

## DONE

