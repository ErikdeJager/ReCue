# Task 192

### 192. [ ] Patch notes: baked-in per-version JSON, release-carried notes, settings view

**Status:** Not started
**Depends on:** #190, #191
**Created:** 2026-06-26

**Description**

Add **patch notes** to the app: a small per-version JSON authored in-repo, a settings view
that shows them, and — the key "smart" requirement — a way for a user to read the notes of
an update **that isn't installed yet**, plus a CI guard that the notes were updated for each
version bump.

This sits on top of the auto-update group: **#190** (TASK-190) is the updater skeleton (the
`update` store slice, the gated release pipeline, the Tauri updater plugin) and **#191**
(TASK-191) is the Settings → "Updates" section with a labelled **"What's new" slot**. This
task fills that slot and wires the pipeline.

**The "read notes for a not-yet-installed update" problem + chosen solution.** The running
app is on version X; an update to Y is available. Y's baked-in JSON ships *inside Y*, so X
can't read it locally. The **smart solution** is to carry the new version's notes **in the
release itself**: the Tauri updater's `latest.json` has a **`notes`** field and `check()`
returns it as `update.body`. So:

- The release **pipeline generates the GitHub release body + `latest.json` notes FROM the
  new version's patch-notes JSON** (rendered to markdown). `tauri-action` puts that into
  `latest.json`.
- The running (older) app's `checkForUpdate` (#190) reads `update.body` and stores it
  (extend #190's `update` slice with a **`notes: string | null`** field).
- #191's **"What's new" slot renders `update.notes`** (markdown via the existing
  react-markdown stack) — so the user reads the **not-yet-installed** version's notes before
  installing.

Meanwhile the **baked-in JSON** is the *source* (authored in-repo, rendered into each
release) **and** powers an in-app changelog of the **current/past** versions.

**Patch-notes data.**
- **One JSON file per version**: `src/patchnotes/<version>.json`, shape:
  ```json
  {
    "version": "0.1.0",
    "date": "2026-06-26",
    "changes": [
      { "category": "feature", "items": ["Added X", "Added Y"] },
      { "category": "fix", "items": ["Fixed Z"] }
    ]
  }
  ```
  `category` is a small known set (`feature` / `fix` / `improvement` / `other`),
  case-insensitive, extensible; `items` are short bullet strings (may contain inline
  markdown). Separate file per update (per the card).
- **Loading**: a pure `src/patchnotes.ts` that loads all files via Vite
  `import.meta.glob("./patchnotes/*.json", { eager: true })`, validates/normalizes them
  (skip malformed, best-effort), and exposes `allPatchnotes` (semver-desc sorted) +
  `latestPatchnotes()` / `patchnotesFor(version)`. Plus a pure `patchnotesToMarkdown(notes)`
  used both in-app (fallback rendering) and by the release script.
- **Type** in `src/types`: `PatchNotes { version; date; changes: { category; items: string[] }[] }`.

**UI (in #191's Updates pane).**
- **Available update** → render `update.notes` (the release-carried markdown) under a
  "What's new in v<newVersion>" heading in #191's slot. If `update.notes` is empty, fall
  back to nothing (the version line still shows).
- **Current version** → a "What's new in this version" block rendering the **baked-in**
  `patchnotesFor(currentVersion)` as grouped categories (feature/fix/…) with bullet lists
  (a small `PatchNotes` render component; item text via react-markdown for inline links).
- Optional: a compact full changelog (all baked-in versions) — keep minimal; the current
  version + the available-update notes are the must-haves.

**Pipeline (extend #190's `.github/workflows/release.yml`).**
1. **Notes-up-to-date guard**: a step asserting `src/patchnotes/<version>.json` exists for
   the bumped `tauri.conf.json` version **and** its `"version"` matches; if missing/mismatched
   the workflow **ends early** (per the card: "the pipeline should check if the version is
   still up to date — if not, end early"). Forces notes to be authored on every version bump.
2. **Release-body generation**: a small `scripts/patchnotes-to-md.mjs` renders
   `src/patchnotes/<version>.json` → markdown, passed to `tauri-action`'s `releaseBody`
   (which flows into `latest.json` `notes` → `update.body`).

**Scope.** Patch-notes data + loader + render + the two pipeline steps + extending #190's
`update` slice with `notes`, rendered in #191's slot. Reuses #190 (updater/body, pipeline)
and #191 (Updates pane/slot).

**Out of scope.**
- The updater plugin / install flow / indicator (#190) and the Updates pane shell (#191).
- The dev mock (#193) — but the mock should be able to set `update.notes` so this view is
  testable without a release.
- Auto-generating patch notes from git history (authored by hand per version).
- A standalone changelog window (the Settings pane is the home).

**Concrete files/symbols.**
- **New** `src/patchnotes/<version>.json` (seed at least the current `0.0.1`, e.g.
  `src/patchnotes/0.0.1.json`).
- **New** `src/patchnotes.ts` (glob load + normalize + `patchnotesToMarkdown` +
  `patchnotesFor`/`latestPatchnotes`) and `src/patchnotes.test.ts`.
- **New** `src/components/PatchNotes/PatchNotes.tsx` (+ CSS) — render a `PatchNotes` object
  (grouped categories + bullets, react-markdown for item text).
- **New** `scripts/patchnotes-to-md.mjs` — version → release-body markdown (shares the
  rendering logic conceptually with `patchnotesToMarkdown`).
- `.github/workflows/release.yml` (from #190) — add the notes guard + the `releaseBody` step.
- `src/store.ts` (`update` slice from #190) — add `notes: string | null`; set it in
  `checkForUpdate` from `update.body`.
- `src/components/Settings/Settings.tsx` (#191 Updates pane) — render `update.notes` in the
  "What's new" slot + the current version's baked-in notes.
- `src/types` — the `PatchNotes` type.

**Subtasks**

1. [ ] `PatchNotes` type + `src/patchnotes/0.0.1.json` (seed) + `src/patchnotes.ts`
   (glob-load, normalize, `patchnotesFor`/`latestPatchnotes`/`patchnotesToMarkdown`) +
   `patchnotes.test.ts`.
2. [ ] `PatchNotes` render component (grouped categories + bullets).
3. [ ] Extend #190's `update` slice with `notes`; populate from `update.body` in
   `checkForUpdate`.
4. [ ] In #191's Updates pane: render `update.notes` (available update) in the "What's new"
   slot + the current version's baked-in notes.
5. [ ] `scripts/patchnotes-to-md.mjs`; wire `release.yml` to (a) **guard** the version has a
   matching patch-notes file (else end early) and (b) set `releaseBody` from it.
6. [ ] **Verify** — `npm run build`, `npm run lint`, `npm test` (incl. `patchnotes.test.ts`)
   green; Rust untouched; review the `release.yml` guard logic. Manual (or via #193 mock):
   Settings → Updates shows the current version's notes; with a mocked available update +
   `notes`, the "What's new" slot renders them.

**Acceptance criteria**

- [ ] Per-version patch-notes JSON lives under `src/patchnotes/` and is loaded + rendered
      (grouped feature/fix/… bullets) for the **current** version in the Settings Updates
      pane.
- [ ] An **available update's** notes (carried in the release via `latest.json`/`update.body`)
      render in #191's "What's new" slot — so a **not-yet-installed** update's notes are
      readable before installing.
- [ ] The release pipeline **ends early if the bumped version has no matching patch-notes
      file**, and otherwise sets the release body from that file.
- [ ] `npm run build`, `npm run lint`, `npm test` pass; no Rust changes.

**Notes**

- **Autonomous refine (2026-06-26):** user not responding; decisions logged in
  `ASSUMPTIONS.md`.
  - **Smart solution for "read not-yet-installed notes" = carry them in the release** via the
    Tauri updater `latest.json` `notes` / `update.body`, generated from the new version's
    patch-notes JSON; the app renders `update.notes`. Baked-in JSON is the authored source +
    current/past changelog.
  - **One JSON file per version** under `src/patchnotes/`, `{version,date,changes:[{category,
    items[]}]}`; categories `feature`/`fix`/`improvement`/`other`. Loaded via
    `import.meta.glob` (eager), normalized best-effort.
  - **Render with the existing react-markdown stack** (item text) — no new markdown dep.
  - **Pipeline guard** = `src/patchnotes/<version>.json` must exist & match the bumped
    version, else end early; **release body** generated from it (`scripts/patchnotes-to-md.mjs`).
  - **Extends #190's `update` slice with `notes`** (small, scoped change in this task).
- **Depends on: #190, #191** — needs #190's updater/`update.body`/pipeline and #191's Updates
  pane + "What's new" slot. The **#193 mock** should set `update.notes` so this view is
  testable before a real signed release exists.
- **Working-tree note:** an implementing agent is concurrently editing Canvas/store files for
  #186 — this refine only stages `TASK-192.md` / `KANBAN.md` / `ASSUMPTIONS.md` (never `-A`),
  per the active-task-automation-pipeline convention.
- **References:** TASK-190.md (`update` slice, `release.yml`, updater `body`), TASK-191.md
  (Updates pane + "What's new" slot); `FileViewer.tsx` / `KanbanPanel.tsx` (react-markdown
  usage). CLAUDE.md "react-markdown + remark-gfm" + "Builds & distribution".
