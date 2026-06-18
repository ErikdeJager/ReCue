---
name: task
description: Interactively author one well-formed task and add it to TASKS.md. Interrogates the user to remove every assumption, investigates the repo (adaptively) to ground the task in what exists now and what future tasks will build, infers and wires dependencies, then writes the task in TASKS-TEMPLATE.md format and commits + pushes it to main so the automation pipeline can pick it up. Use when the user runs /task, or asks to "add a task", "create a task", "track this", "add a TODO/to-do", or "make a task to fix/build X".
argument-hint: [what you want done]
allowed-tools: AskUserQuestion, Read, Grep, Glob, Edit, Write, Bash(git:*), Task, Agent
---

# Add a task to TASKS.md

Turn a rough request into one **complete, assumption-free** task entry in `TASKS.md`,
matching `TASKS-TEMPLATE.md` exactly. This skill is **interactive** — its whole job is to
interrogate the user and the repo until nothing is left to guess, then write and commit the
task so the automation skills (`/handoff`, `/isolate-agent`, `/develop-tasks`) can act on it.

Run **in the foreground** — you must be able to ask the user questions, so never fork this
skill's own context. You may spawn read-only subagents to investigate; they return findings
and you keep asking.

Guiding rule: **make no assumptions.** Anything you don't get explicitly, infer only from the
repo or the existing task list — and when you infer, say so and let the user correct it.

## 1. Capture the intent
The request is `$ARGUMENTS` if given, otherwise whatever the user just asked for. Restate it
to yourself in one line. If it's empty, ask what the task is before doing anything else.
(If the user describes several distinct tasks, handle them one at a time, repeating this flow.)

## 2. Orient on the current task list
If on `main` with a remote, `git pull --ff-only origin main` first so numbering and
dependencies reflect the latest. Read `TASKS.md` and capture every existing task: number,
marker (`[ ]` / `[x]`), title, status, and `Depends on`. The new task's number = highest
existing number + 1 — **append only; never renumber existing tasks** (the other skills locate
tasks by their `### N.` heading and reference them by number in `Depends on`).

## 3. Investigate the repo — adaptively
Ground the task before you ask about it. Light by default; dig only as far as the request needs:
- **Bug / change to existing behavior:** grep/glob the nouns from the request to find the code
  in play, read it, and work out *what is actually happening* so the task describes a real
  defect, not a vague complaint. If the code can't be found, that itself is a finding (below).
- **New feature:** check what already exists vs. what's missing; read `referances/` and any
  design docs that bear on it (e.g. `HANDOFF.md`).
- **Big dig:** if grounding needs broad searching, spawn a background **Explore** subagent
  (`subagent_type: Explore`) to map the relevant code and report back, then continue here.
- **Future code:** if the task targets code that **doesn't exist yet**, that's not an error —
  it's normal in this repo. It means the task depends on whatever will build that code (step 5).

Carry concrete findings (file paths, what you saw) into the questions so the user confirms
reality rather than guessing in the abstract.

## 4. Interrogate the user — exhaustively
Drive out every ambiguity with `AskUserQuestion`, in as many rounds as it takes (batch up to
~4 related questions per round; always offer a sensible proposed default so the user can
one-click, and they can pick "Other" to free-type). Plain-text questions are fine when options
don't fit. Cover, at minimum:
- **Goal & why** — the outcome and the reason, if not already crystal clear.
- **Scope** — explicitly what's in and what's out.
- **Concrete behavior** — expected result, edge cases, and anything your investigation flagged
  ("I found both `support.js` and `Conductor.dc.html` — which is in play?").
- **Subtasks** — propose an ordered breakdown for anything non-trivial; confirm or adjust.
- **Acceptance criteria** — propose measurable / verifiable conditions; confirm.
- **Dependencies** — confirm the ones you inferred; resolve missing ones (step 5).
- **Optional fields** — Owner, Due date, priority / where it sits in the order. Ask; don't assume.

Keep going until there are no material open questions, then **stop** — don't pad with trivia.
If the user says "that's enough / just fill it in," accept what you have and make the remaining
choices explicit in the draft so they can see what you settled on.

## 5. Resolve dependencies — flag & offer
From the investigation and the task list, determine what this task truly waits on:
- An existing open task will produce the code/feature it needs → set `Depends on: #X` (confirm).
- **Nothing** in `TASKS.md` will produce it → tell the user the prerequisite is missing and
  **offer to create it as its own task first**. If they accept, author that task too (same flow)
  and depend on it; if they decline, record the gap in this task's **Notes**.
- Genuinely independent → `Depends on: none`.

## 6. Draft and preview
Fill `TASKS-TEMPLATE.md` with the answers. Set **Created** to today's date. Omit optional
sections that are truly empty (a small task can be just title + description). Show the user the
**complete rendered task block** and get an explicit go-ahead before writing anything.

## 7. Write
Append the task under `## Tasks` in `TASKS.md` with its number, separated from any previous
task by a `---` ruler (drop the placeholder `<!-- Add real tasks… -->` comment once a real task
exists). Don't touch any other task. If you also authored a prerequisite in step 5, write it
first (lower number) so this task can reference it.

## 8. Commit & push to main
Tasks must reach `main` for `/develop-tasks` and `/isolate-agent` to see them.
- **On `main`:** stage only the task file — `git add TASKS.md` — commit
  `git commit -m "Add task #<n>: <title>"`, then `git push origin main`. If the push is
  rejected as out of date, `git pull --ff-only origin main` and retry.
- **Not on `main`:** don't hijack the user's branch — tell them you're on `<branch>` and ask
  whether to commit there or switch to main first. Do nothing git-side until they choose.

Report the new task number, its dependencies, and the commit/push result.
