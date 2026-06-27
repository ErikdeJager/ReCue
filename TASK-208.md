### 208. [x] Rewrite the v0.0.1 patch notes to introduce the app as the first release

**Status:** Done
**Depends on:** none
**Created:** 2026-06-27

**Description**

The patch notes for the current version live at `src/patchnotes/0.0.1.json` (the #192 patch
-notes system: `{version, date, changes: [{category, items[]}]}`, loaded by
`src/patchnotes.ts`, rendered in **Settings → Updates → "What's new"** by
`src/components/PatchNotes/PatchNotes.tsx`, and also used to generate the GitHub release
body). Today that file reads like an **internal changelog** — it enumerates recently
implemented features/improvements (Overview wall, Canvas, sidebar, ⌘K launcher, auto-update
skeleton, busy indicator, rename, distribute panels).

For a **0.0.1 first release**, that framing is wrong: a brand-new user reading the very
first release's notes has no prior version to diff against. The notes should **introduce
what ClaudeCue is** and **frame this as the initial release**, presenting the core
capabilities as a product pitch rather than a task-by-task changelog.

**Goal:** rewrite `src/patchnotes/0.0.1.json` so it (a) says what the app is in a sentence
or two, (b) makes clear this is the first/initial release, and (c) highlights the headline
capabilities at a welcoming, high level — not as a list of "recently shipped" items.

**Grounding facts:**

- The app (from `CLAUDE.md`): ClaudeCue is a **macOS desktop app for running and managing
  many live `claude` CLI sessions at once**. Each session is a real PTY running the Claude
  Code CLI; ClaudeCue provides the window chrome, navigation, persistence, and git-reading.
  Core surfaces: the **Overview** agent wall, the **Canvas** split-panel workspace (file /
  git-diff / terminal / Kanban viewers, tabs poppable into their own window), and a
  **repo-grouped sidebar**.
- The schema accepts **any** `category` string (`patchnotes.ts` `categoryLabel` Title-Cases
  unknown ones — e.g. `"welcome"` → "Welcome", `"highlights"` → "Highlights"); each category
  renders as an `<h4>` over a bulleted list. There is **no** free-text/intro field, so the
  introduction is expressed through category items.
- Keep `"version": "0.0.1"`. Keep the existing `"date": "2026-06-26"` (the authored release
  date) unless there's a reason to change it.

**Recommended new content** (wording may be polished; keep it concise and welcoming):

```json
{
  "version": "0.0.1",
  "date": "2026-06-26",
  "changes": [
    {
      "category": "welcome",
      "items": [
        "Welcome to ClaudeCue — a macOS app for running and managing many live `claude` coding sessions side by side. This is the first release.",
        "Every session is a real terminal running the Claude Code CLI; ClaudeCue wraps them with navigation, persistence, git-reading, and a workspace built for juggling several agents at once."
      ]
    },
    {
      "category": "highlights",
      "items": [
        "Overview — an 'agent wall' of all your live sessions, grouped by repository, with an at-a-glance busy/idle status on each.",
        "Canvas — a split-panel workspace mixing agent terminals with file, git-diff, terminal, and Kanban viewers; tabs can pop out into their own window.",
        "A repo-grouped sidebar with a searchable file tree, scheduled sessions, reusable Canvas templates, and worktree-isolated agents."
      ]
    }
  ]
}
```

**Scope**

1. Replace the contents of `src/patchnotes/0.0.1.json` with the introduction-style notes
   (above, or equivalent), keeping the `{version, date, changes:[{category, items[]}]}`
   shape and valid JSON.
2. Keep `version`/`date` as noted; do not add fields the schema/normalizer don't read.

**Out of scope**

- No code changes to `patchnotes.ts`, `PatchNotes.tsx`, the Settings pane, or the release
  pipeline — this is a **content-only** edit of one JSON file.
- No new patch-notes file / no version bump.
- No change to the markdown-generation script (`scripts/patchnotes-to-md.mjs`) — it consumes
  whatever categories/items are present.

**Subtasks**

1. [x] Rewrite `src/patchnotes/0.0.1.json` with intro + highlights framing (valid JSON,
   same schema).
2. [x] `npm run build` + `npm test` pass (the patchnotes are eagerly globbed + normalized;
   a malformed file would be dropped — confirm it still loads).
3. [x] Eyeball Settings → Updates "What's new" (dev mock if needed) to confirm the new
   categories render as headers with their bullet lists.

**Acceptance criteria**

- [x] `src/patchnotes/0.0.1.json` introduces what ClaudeCue is and frames v0.0.1 as the
  first/initial release, rather than listing recently implemented tasks.
- [x] It remains valid against the schema (`{version:"0.0.1", date, changes:[{category,
  items[]}]}`) and renders in the Updates pane (categories as headers, items as bullets).
- [x] `npm run build` and `npm test` pass.

**Notes**

- **Autonomous refine (2026-06-27).** Per the `ASSUMPTIONS.md` standing directive
  (2026-06-26); decisions logged under TASK-208:
  - Used two categories — **"welcome"** (what the app is + "first release") and
    **"highlights"** (headline capabilities) — because the schema has no free-text intro
    field; arbitrary categories Title-Case cleanly.
  - Kept `version`/`date` unchanged.
- Key files: `src/patchnotes/0.0.1.json` (the only edit), `src/patchnotes.ts` (loader /
  `categoryLabel`), `src/components/PatchNotes/PatchNotes.tsx` (renderer) — last two for
  reference only.
- Independent of any open task.

**Implementation (done 2026-06-27)**

- Replaced `src/patchnotes/0.0.1.json` with the recommended intro framing: a **"welcome"**
  category (what ClaudeCue is + "This is the first release.") and a **"highlights"** category
  (Overview / Canvas / sidebar). Kept `version: "0.0.1"` and `date: "2026-06-26"`; same
  `{version, date, changes:[{category, items[]}]}` schema; no code/pipeline changes.
- Verified: `prettier --check`, `npm run build` (Vite eagerly globs + parses the JSON — a
  malformed file would be dropped, so a clean build confirms it loads), and `npm test`
  (288 passing, incl. the patchnotes normalization tests) all pass. The "welcome"/
  "highlights" categories Title-Case via `categoryLabel`, rendering as headers over bullets
  in Settings → Updates "What's new".
