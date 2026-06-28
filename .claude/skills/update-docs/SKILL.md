---
name: update-docs
description: Bring every project document back in sync with the codebase in one pass — CLAUDE.md, README.md, and any other documentation found in the repo — plus a special TASKS.md cleanup (summarize all completed tasks into a section at the top, delete their full entries from the body, and prune now-dangling dependency references from the remaining open tasks). PROMPT.md is NEVER modified. Use when the user runs /update-docs, or asks to "update the docs", "refresh/sync the documentation", "summarize completed tasks", or "clean up TASKS.md".
argument-hint: [optional: a doc or area to focus on, e.g. "README only" or "just TASKS.md"]
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, Agent, AskUserQuestion
---

# Update the project documentation

Bring **every important document in this repo back into agreement with the code as it
actually is now**, in a single pass. Two kinds of work happen here:

1. **Descriptive docs** (`CLAUDE.md`, `README.md`, and any other documentation) —
   re-verified against the real codebase and corrected where they drifted.
2. **`TASKS.md`** — a structural cleanup: **completed tasks are condensed into a
   summary at the top and their full entries deleted**, and the **open tasks have
   their dependency lists pruned** of references to those now-deleted tasks.

The skill is **autonomous** — it derives truth from the repository, not from the user.
Do not interrogate the user; investigate the code and the git history instead. Use
`AskUserQuestion` only if you hit a genuine fork you cannot resolve from the repo
(rare). Finish by **reporting** what changed; do **not** commit unless the user asks.

`$ARGUMENTS`, if present, narrows the scope (e.g. "README only", "just TASKS.md").
With no arguments, do the full sweep below.

---

## Golden rules — read before editing anything

- **NEVER touch `PROMPT.md`.** It is off-limits, full stop. Do not read-then-rewrite,
  reformat, or "fix" it. Leave it exactly as it is.
- **Docs describe the present.** Write what the app/codebase *is now*, in the present
  tense. Don't narrate history in CLAUDE.md/README.md (history lives in git and in the
  TASKS.md summary).
- **Edit surgically. Don't rewrite wholesale.** Change only what is stale, missing, or
  wrong. Preserve each file's existing structure, voice, and formatting. A good run
  produces a small, reviewable diff — not a rewrite.
- **Never invent.** Every claim you add or change must be backed by something you saw
  in the code, config, or git history. If you can't verify it, don't write it.
- **Truth comes from the repo, not from the old docs.** When a doc and the code
  disagree, the code wins — update the doc. (If the *code* looks wrong, that's a bug to
  flag in the report, not something to "fix" in the docs.)
- **One pass, then stop.** Don't loop or polish endlessly. Make the docs correct and
  current, then report.

## Document inventory — what to update vs. leave alone

Discover docs dynamically each run (don't hard-code this list — a `docs/` folder,
`CONTRIBUTING.md`, `ARCHITECTURE.md`, etc. may appear later):

```bash
# all markdown, excluding deps/build output and git internals
find . -name "*.md" -not -path "*/node_modules/*" -not -path "*/target/*" \
  -not -path "*/dist/*" -not -path "*/.git/*" | sort
```

Then bucket what you find:

- **Update to match reality:** `CLAUDE.md`, `README.md`, and any other genuine
  *project documentation* (a `docs/` tree, `CONTRIBUTING.md`, `ARCHITECTURE.md`, …).
- **Special handling:** `TASKS.md` — see step 3. This is the centerpiece.
- **Touch only if its subject actually changed:**
  - `TASKS-TEMPLATE.md` — the task-entry *format*. Edit only if the shape of a task
    entry has genuinely changed; otherwise leave it.
  - `.claude/skills/**/SKILL.md` — these are skill instructions, not project docs.
    **Leave them alone**, including this file, unless the user explicitly asks.
- **NEVER touch:** `PROMPT.md`. (Also out of scope: anything under `node_modules/`,
  `target/`, `dist/`, `.git/`.)

---

## 1. Orient

- If on `main` with a remote and the working tree is clean, `git pull --ff-only origin
  main` so you document the latest state. If the tree is dirty or you're on another
  branch, skip the pull and just work against the current checkout (note it in the
  report).
- `git log --oneline -30` and `git status` to see what shipped recently and what's
  in flight. Recent commit subjects are a strong hint at what the docs may now be
  missing (e.g. a "Custom Checkbox component" commit means CLAUDE.md's component list
  should mention it).

## 2. Establish ground truth from the code

Before editing a single doc, build an accurate mental model of what the app *is now*.
Read the sources the docs make claims about — at least:

- **Project shape & commands:** `package.json` (scripts + deps), `src-tauri/Cargo.toml`,
  `src-tauri/tauri.conf.json`. The command lists and stack/dependency claims in
  CLAUDE.md and README.md must match these exactly.
- **Frontend architecture:** the `src/` tree (especially `store.ts`, `ipc.ts`,
  `App.tsx`, `outputBus.ts`) and the `src/components/` directory listing — the set of
  components and the state/data-flow described in CLAUDE.md must match what exists.
- **Backend architecture:** the `src-tauri/src/` files (`lib.rs`, `pty.rs`,
  `commands.rs`, `store.rs`, `git.rs`, `files.rs`) — the data-flow and module
  descriptions must match.

For a broad, fast verification sweep you may spawn a **read-only `Explore` subagent**
(`subagent_type: Explore`) to map a subsystem and report back which doc claims hold and
which have drifted — then do the edits yourself. Don't delegate the editing.

Carry a short list of concrete drifts ("CLAUDE.md lists components A,B but `Checkbox`
also exists"; "README scripts omit `npm run format:check`") into the edit steps.

## 3. TASKS.md — summarize completed work, prune the body, repair dependencies

This is the most important and most mechanical part. Do it precisely.

### 3a. Classify every task

Find every task heading and its completion marker:

```bash
grep -nE '^### [0-9]+\. \[[ x]\]' TASKS.md
```

- **Completed** = heading marker `[x]` (and/or `**Status:** Done`).
- **Open** = `[ ]` (any non-Done status).

Record each task's number, title, and `Depends on:` line. Also note the file's
non-task sections (intro, `## Project context`, `## Design reference`) — those stay.

### 3b. Build or extend the summary section at the top

Maintain a single top-of-file section that records what has been implemented. Use a
**stable heading so you can find and extend it on later runs** — e.g.
`## Implemented (completed tasks)`. Place it near the top: recommended **right after
`## Project context`**, before `## Design reference` / `## Tasks`.

- **If the section does not exist yet:** create it.
- **If it already exists:** append the newly-completed tasks to it (and tidy/merge
  wording if needed). Do **not** duplicate entries already summarized in a previous run.

Content — make it a genuinely useful record, not a wall of titles. For *each* completed
task preserve its **number, title, and one line on what it delivered**, and group them
by theme/batch so a reader gets "context of what was implemented." Suggested shape:

```markdown
## Implemented (completed tasks)

> Completed tasks are condensed here and their full entries removed from the list
> below; full per-task detail (subtasks, notes, acceptance criteria) remains in git
> history. This is the running record of what ReCue has shipped.

**Foundation (#1–#14).** <one or two sentences on the v1 core that these built.>
- #1 Project scaffolding — Tauri 2 + React/TS/Vite skeleton.
- #2 Design tokens, fonts & global styles — …
- … (one line per completed task in this group)

**Polish & UX passes (#15–#…).** <theme sentence>
- #16 Smoothness/perf pass 1 — …
- …

**<next theme> (#…).** …
```

Keep it tight — one line per task, grouped. The detail you're deleting is recoverable
from git; the summary's job is a readable, traceable index of what got built.

### 3c. Delete the full completed-task entries from the body

Once a completed task is captured in the summary, **remove its full `### N.` block**
(heading through the trailing `---` ruler before the next task) from the `## Tasks`
section. After this, the `## Tasks` section contains **only the open (`[ ]`) tasks**.
This is the cleanup that shrinks the file — the summary replaces the verbose entries.

### 3d. Repair dependencies in the surviving open tasks

This implements the user's rule: *removing a now-completed dependency from an open task
is safe, because the dependency is already done.*

Precise algorithm (robust across first run **and** later runs):

1. After 3c, collect the set **S = the task numbers that still have a `### N.` heading**
   (i.e. the open tasks that survived).
2. For **each** surviving open task's `**Depends on:**` line, keep only the referenced
   numbers that are in **S**; **delete every other number** (they point at a completed,
   now-deleted task — or at nothing).
3. If nothing remains, write `**Depends on:** none`.
4. If the line had an inline prose annotation (e.g. `_(all current open tasks …)_`),
   **update or drop it** so it still matches the pruned list — don't leave a comment
   that contradicts the numbers.

> The invariant to enforce: **a `Depends on` number is valid only if a task with that
> `### N.` heading still exists.** Anything else gets removed.

**Worked example — the current state of this repo.** Open tasks are #48, #49, #54;
everything else is completed and will be deleted. So S = {48, 49, 54}, and:

| Task | Before | After |
|------|--------|-------|
| #48 | `Depends on: #23, #24, … #47, #50, #51, #52, #53, #54` _(all current open tasks…)_ | `Depends on: #54` — and rewrite the annotation (it's no longer "all current open tasks") |
| #49 | `Depends on: #48` | `Depends on: #48` (48 survives — unchanged) |
| #54 | `Depends on: none` | `Depends on: none` (unchanged) |

### 3e. Keep the rest of TASKS.md honest

- Update the file's intro / `## Project context` only if they've gone stale.
- If a placeholder like `<!-- Add real tasks… -->` is now irrelevant, you may remove it.
- Don't renumber tasks, don't reword open tasks' substance, and don't change a task's
  completion marker — you only summarize/delete the *done* ones and prune *open* deps.

## 4. CLAUDE.md

Reconcile it against the ground truth from step 2. Focus on the sections most prone to
drift: **Stack**, **Architecture (data flow)**, **Layout** (the file tree), **Commands**
(must match `package.json` scripts), **Conventions**, and the **v1 scope / out-of-scope**
notes. Add features that now exist but aren't documented; remove descriptions of things
that no longer exist; fix anything the code contradicts. Update the trailing `## Tasks`
section to reflect how TASKS.md now works (completed tasks summarized at top, body holds
open tasks). **Preserve the inline `(#N)` provenance markers** — they stay valid via git
history and the new summary index; do not strip them.

## 5. README.md

Reconcile the user-facing description: **Features**, **Prerequisites**, **Develop /
Build / scripts** (match `package.json`), and the **Releases & auto-update** flow (match
`.github/workflows/` + `tauri.conf.json`). Keep it user-facing and concise — README is
for people running/building the app, CLAUDE.md is for people working in the code.
**Don't bump version numbers** — versioning is a release action, not a docs update.

## 6. Other discovered docs

For each remaining project doc found in step's inventory (a `docs/` tree, CONTRIBUTING,
etc.), apply the same principle: verify against reality, correct surgically, leave
intentional content intact. Skip the "touch only if its subject changed" and "never
touch" buckets.

## 7. Verify

- Re-read your diffs. Confirm: `PROMPT.md` untouched; TASKS.md `## Tasks` now holds only
  open tasks; every surviving `Depends on` references a task that still exists; the
  summary covers every completed task exactly once.
- Sanity-check the dependency invariant programmatically, e.g. list remaining headings
  vs. remaining `Depends on` numbers and confirm no dependency points outside the set:
  ```bash
  grep -nE '^### [0-9]+\.' TASKS.md          # surviving (open) task numbers
  grep -nE '^\*\*Depends on:' TASKS.md       # remaining dependency lines to eyeball
  ```
- No broken intra-repo links (e.g. CLAUDE.md/README links to files that still exist).

## 8. Report (and commit only if asked)

Summarize for the user:
- Which docs changed and the gist of each change.
- TASKS.md: how many completed tasks were summarized + removed, the new file size /
  shrinkage, and every dependency edit (e.g. "#48: pruned 28 completed deps → `#54`").
- Anything you deliberately left alone (PROMPT.md, skill files, unchanged docs) and any
  drift you found that looks like a **code** bug rather than a docs bug.

**Do not commit by default.** The working tree may already hold unrelated changes, and
docs deserve a human glance. If the user asks you to commit, stage **only the doc files
you actually modified** (never `git add -A`), commit with a clear message
(`docs: sync docs with code + condense completed tasks in TASKS.md`), and — only if they
asked — push. Never stage or commit `PROMPT.md` or unrelated working-tree changes.
