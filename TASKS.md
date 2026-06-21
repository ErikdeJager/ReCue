# Tasks

This file tracks tasks. Each task is **numbered** (ordered) and has a top-level
**completion marker** — `[ ]` for open, `[x]` for done. Copy the template from
[TASKS-TEMPLATE.md](TASKS-TEMPLATE.md) for every new task and increment the number.

List cross-task ordering in each task's **Depends on** field (e.g. `#2, #3`); tasks
whose dependencies are all complete can run in parallel. The automation skills
(`/handoff`, `/isolate-agent`, `/develop-tasks`) read these fields.

---

## Project context

**ClaudeCue** — a **macOS** desktop app (**Rust + Tauri 2 + React/TypeScript**) for
running and managing many live `claude` CLI sessions at once: an **Overview** "agent
wall" of real terminals, a **Canvas** split-panel workspace (with file, **git-diff**,
and terminal viewers), and a repo-grouped **sidebar**. Each session is a **real PTY running
`claude`** — ClaudeCue provides the window chrome, navigation, persistence and
git-reading; the terminals come from the Claude Code CLI itself.

**Stack:** Tauri 2 · React + TypeScript + Vite · **Zustand** · plain CSS with
CSS-variable design tokens (CSS Modules) · **xterm.js** terminals · **`portable-pty`**
(Rust) · JSON persistence in the app-data dir · **Lucide** icons · **JetBrains Mono**
(bundled, offline).

**v1 decisions / out of scope:** no status system beyond the busy/idle indicator
(#42/#55/#71 — still no approval pills/awaiting-glow/floating) · no app-rendered
approval UI (users answer in the terminal) · no Archive (single **Remove = kill +
forget**) · no Skills manager · no Fork · no settings screen · no light mode · no
multi-window · no auth · no code signing/notarization · **git is read-mostly** —
ClaudeCue reads git (current branch + working-tree diff vs `HEAD`, branch compare #81)
and never commits or creates branches; its writes are `git checkout <existing branch>`
from the new-session flow (#27) and `git worktree add`/`remove` for isolated worktree
agents (#74). `claude` is assumed on `PATH` (clear in-app error if missing).

> The original design spec and interactive prototype (`HANDOFF.md`,
> `Conductor.dc.html`) are preserved in git history (commit `b02efd8`
> "System referances") if exact prototype details are ever needed.

---

## Implemented (completed tasks)

> The backlog has fully shipped (#1–#96).
> Completed tasks are condensed here — number, title, and one line
> on what each delivered — and their full entries removed from the list below; per-task
> detail (subtasks, notes, acceptance, implementation reports) lives in git history.
> This is the running record of what ClaudeCue has shipped.

**v1 foundation (#1–#14).** The core: a Tauri 2 shell hosting real `claude` PTYs across
an Overview wall, a Focus view with a git-diff inspector, and a repo-grouped sidebar.

- #1 Project scaffolding — macOS Tauri 2 + React/TS/Vite skeleton + lint/format/test tooling.
- #2 Design tokens, fonts & global styles — CSS-variable tokens + bundled JetBrains Mono.
- #3 Custom window chrome (titlebar) — later replaced by the native title bar (#19).
- #4 Rust session/PTY core — `SessionManager` over `portable-pty`, scrollback + event channel.
- #5 Rust persistence + resume — `sessions.json`; spawn via `claude --session-id`, resume `--resume`.
- #6 Rust git reading — current branch + working-tree diff vs `HEAD`, parsed to a structured shape.
- #7 Frontend app shell + Zustand store + typed IPC + cross-cutting actions.
- #8 xterm.js terminal component — live PTY I/O, fit/resize, exit overlay.
- #9 Sidebar — repo groups + session rows from persisted recents.
- #10 New session modal — folder picker + recents + optional name.
- #11 Overview wall — equal-width live terminal columns.
- #12 Focus view + toolbar — large terminal + collapsible inspector tab strip.
- #13 Git Diff inspector — summary + file list + unified/split hunks.
- #14 Packaging + docs — branded icon, unsigned `.app`/`.dmg`, README/CLAUDE.

**Release/update (#15) — later removed.**

- #15 Release CI + in-app auto-update (Tauri updater). _Reversed by #62 (repo went private)._

**Polish passes 1–2 (#16–#17).**

- #16 App-wide smoothness / performance / UX polish pass 1.
- #17 Polish pass 2 — re-profile and refine.

**UX-feedback batch (#18–#32).** Native chrome, keyboard nav, the new-session/branch flow.

- #18 Fix garbled terminal rendering on view switch/resize/new agents — persistent terminal pool.
- #19 Native macOS title bar (replaces the #3 custom chrome).
- #20 Stable, alphabetical sidebar repo list (no reorder on new agent).
- #21 Sidebar agent labels = branch name, with an optional custom name sub-line.
- #22 Clicking a sidebar agent navigates in Overview (doesn't force Focus).
- #23 Selected-agent border/highlight in Overview.
- #24 Keyboard nav — Shift+arrows between agents and views.
- #25 Overview/Focus toggle moved into the sidebar (always visible).
- #26 Slimmer New session button + ⌘N shortcut.
- #27 New session popover with branch auto-detect + `git checkout` (the one git write).
- #28 Session chip copies a `claude --resume` command, not the bare id.
- #29 Auto-refresh the git diff inspector (no manual refresh).
- #30 Restore sessions live on startup — "reconnecting", not an error wall.
- #31 Right-click a repo → Forget (kill its agents, drop from recents).
- #32 One toast on close; all toasts bottom-right.

**Theming, repo identity & customizable workspace (#33–#47).**

- #33 Catppuccin Mocha recolor (less black; status tokens now in use).
- #34 Non-collapsible sidebar repo titles + click-to-filter Overview.
- #35 Per-repo color identity (assign / persist / change).
- #36 Overview grouped by repo with colored badges + repo filter.
- #37 Repo color + badge in Focus.
- #38 Customizable Overview — mixed panels (agent / diff / markdown columns).
- #39 Diff-viewer column in Overview (from the repo menu).
- #40 Markdown viewer in the Focus inspector (pick a file, render, hot-reload).
- #41 Markdown-viewer column in Overview.
- #42 Busy indicator — show when a `claude` session is working.
- #43 Overview drag-to-reorder agents/panels within a repo cluster (dnd-kit).
- #44 Universal read-only file viewer (markdown rendered/raw + light code highlighting).
- #45 Sidebar tree — opened files under their repo (draggable + clickable).
- #46 Canvas mode — recursive split-panel (BSP) layout engine.
- #47 Canvas content + drag-and-drop from the sidebar (agents, files, diffs).

**Iteration passes 3–4 (#48–#49).**

- #48 UI visual polish & design-system consistency (full color + spacing tokenization, focus a11y).
- #49 UX, interaction flows & accessibility (modal focus-trap, tablist keyboard nav, a11y labels).

**Refinements (#50–#54).**

- #50 Overview selected-agent border — repo color, thinner & subtler.
- #51 Resizable Focus inspector (drag to expand/minimize) + responsive content.
- #52 Custom checkbox component (replaces native checkboxes app-wide).
- #53 Redefine the start-a-new-agent model — a panel that expands from the button, recents-first.
- #54 Repo context menu — "New session" first + red/danger styling for destructive actions.

**Final feature batch + cleanup (#55–#62).**

- #55 Busy indicator — single pulsing ball (dim when idle) + echo-aware detection (typing ≠ busy).
- #56 Searchable file-picker for the repo "Open file viewer" menu.
- #57 Rename an agent from the sidebar (right-click) — propagates everywhere.
- #58 Canvas tabs — multiple named canvases (add/close/rename/reorder), each its own layout.
- #59 Folders as the source of truth — unified sidebar items (file + diff) all draggable into Canvas.
- #60 Final docs pass — sync CLAUDE.md/README.md to the code + condense this list (this task).
- #61 New-session keyboard-speed pass — command-palette launcher (type-ahead recents, ⌘1–9, quick-repeat).
- #62 Remove the in-app auto-update mechanism + the baked-in updater secret (repo now private).

**Post-v1 fixes (#63).**

- #63 Clean agent exit (code 0) disappears (kill + forget, no overlay); non-zero/crash & failed boot-resume keep the "Process exited" overlay + Restart — and Restart now resets the pooled terminal so the relaunched agent repaints cleanly instead of appending onto the dead screen.

**New-session & worktree flow (#65–#67, #74).** The two-step launcher and folder-per-branch isolation.

- #65 New session panel fully covers its button (no corner peek).
- #66 Two-step folder→branch keyboard new-session flow — branch filter + main/master/dev priority sort, in-button ⏎/esc hints, Name field removed, action reads "Start" / "Checkout & start".
- #67 Unified session-label rule — branch is the primary title; a custom name (from rename #57) overrides it and the branch becomes the subtitle.
- #74 Isolated worktree agents — ⌘⏎ starts an agent in an app-managed `git worktree` on an existing branch, nested under its parent repo; ref-counted removal keeps a dirty worktree. New git writes (`worktree add`/`remove`).

**Views = Overview + Canvas; keyboard navigation (#75–#79).** Focus retired; the two surviving views gain keyboard parity.

- #75 Removed Focus mode entirely — the app is now just Overview + Canvas (no "Expand to Focus", no Focus keybind/inspector/state).
- #76 Canvas keyboard navigation — Shift+arrows move spatially between panels (active-leaf focus), ⌘1–9 jump to canvas N.
- #77 ⌘\ toggles the main view (Overview ↔ Canvas).
- #78 Tighter terminal line height (xterm `lineHeight` 1.5 → 1.2).
- #79 Unified, view-aware sidebar item click — select/jump to any item without ever switching views.

**New view types, diff modes & the repo "Views" menu (#72, #80–#82).** More addable panels and richer diffs.

- #72 Plain terminal item — a real `$SHELL` PTY that behaves like the file/diff viewers (repo menu → Overview column + sidebar row + draggable into Canvas; persisted, fresh shell on boot).
- #80 Diff viewer soft-wraps long lines (`pre-wrap` + `overflow-wrap`) — no horizontal scroll, in unified and split.
- #81 Diff viewer branch-compare mode — a Working-tree ↔ Compare toggle running two-dot `git diff base target` (branches validated; mode + branches persisted on the panel).
- #82 Repo context-menu "Views" section — a single registry drives every addable view type (file / diff / terminal), so a new kind is a one-line addition.

**Viewer, sidebar & indicator polish (#64, #68–#71, #73).** Smaller targeted refinements.

- #64 File viewer right-side margin so content isn't clipped at the right edge.
- #68 Repo filter selector visually encloses its "+" (new-session) button as one control.
- #69 File picker — removed the global focus-ring border on the search input (scoped override).
- #70 Overview — the whole column title bar is the drag handle (not just the corner grip); header buttons still click.
- #71 Activity indicator — moved before the title on every surface and reinvented as a rotating spinner arc (busy) / calm static dot (idle).
- #73 Markdown viewer — a clear two-way Rendered/Raw toggle (replaces the ambiguous single icon).

**Canvas & agent-header refinements (#83, #85–#87).** Final touch-ups after Focus removal.

- #83 Low-key confirmation toasts for closing views and for canvas add/close/rename (info tone; no per-item spam on bulk forget).
- #85 Canvas tab — slightly bigger × close button (easier hit target).
- #86 Re-homed the "copy resume command" button (#28) onto every agent header in Overview & Canvas, after Focus removal (#75) took its old home.
- #87 Removed the "Open in Zed" button and all its logic — UI, store action, IPC wrapper, Tauri command, and the `pty.rs` spawn (shared binary-lookup helpers kept for `claude`).

**Multi-window canvases (#84).** Canvas tabs detach into their own native window.

- #84 Open a canvas in its own window (multi-monitor) — pop-out button on the tab + drag tear-off; a canvas-only `?canvas=<id>` window (`CanvasWindow` over the shared `CanvasSurface`) with its own terminal pool over the shared backend PTYs; pure `computeSessionOwners` keeps one PTY in one window (the other shows a `DetachedNote`); cross-window sync via `canvas://changed` / `canvas://windows`; ⌘1–9 + a detached-tab click raise the window (`focus_canvas_window`); re-dock on close; per-session (not restored on relaunch). Reverses the v1 single-window rule.

**Busy-indicator shimmer (#88).** The agent activity dot reads as a shimmer, not a spinner.

- #88 Replaced the #71 spinner arc with a Claude-style **shimmer** — a calm `--status-idle` dot that, while busy, turns `--status-running` with a soft sheen sweeping across it (animated `background-position` on a `::after`; the dot via `::before`, no extra DOM); fixed ~12px slot (no layout shift); reduced-motion → a solid glowing blue dot.

**New-session branch step (#89).** Informational warning + a never-clipping action row.

- #89 New-session branch step: dropped the acknowledgement checkbox **and** its gate (the destructive-checkout warning is now informational — the alert icon + the same text); the branch-step primary button always reads **Start** (the checkout still happens), and the `.actions` row wraps instead of overflowing the fixed 300px panel. The reusable `Checkbox` (#52) is kept (now unused).

**File-viewer file switcher (#90).** Pick another file from the viewer header.

- #90 File viewer: the header filename is now a **switcher** — clicking it opens a searchable `FilePicker` (#56) popover of the repo's files (shared `FileSwitcher` component) and picking one swaps the viewer **in place**, in both Overview file columns and Canvas file panels; persisted (store `setOverviewPanelFile` / `setLeafFile` via the pure `updateLeafContent`). Same-repo only; `FileViewer` itself unchanged.

**Folder bulk actions (#91).** Kill all agents / close all items, from the repo menu.

- #91 Sidebar repo menu: two destructive bulk actions above "Forget folder" — **Kill all agents** (kill + forget every running agent in the folder, incl. its worktree agents #74; shown only with ≥1 running) and **Close all items** (also removes every non-agent view — each terminal's shell killed — while keeping the folder in recents). Both confirm first when agents are running and emit a single summary toast (store `killAllAgents` / `closeAllItems`, mirroring `forgetRepo`).

**Restart-button stacking fix (#92).** The exit-overlay button is clickable again.

- #92 Fixed the unclickable **Restart** button on the exited-process overlay: the pooled xterm's internal positive-z-index layers were out-stacking the overlay for hit-testing. `.slot` now forms its own stacking context (`z-index: 0`) so those layers stay contained, and `.exitOverlay` sits explicitly above (`z-index: 1`) — so Restart (and the "Reconnecting…" overlay) receive pointer events again.

**Scheduled sessions — engine + launcher (#93, part 1 of 2).**

- #93 Scheduled sessions (part 1): an agent can be **scheduled to launch later**. A "+ Schedule session" sidebar button / **⌘⇧N** opens the new-session modal in **schedule mode** (folder → branch → launch time + optional prompt + name → `create_schedule`); records persist (`store.rs` `schedules`), and a `lib.rs` poll loop fires due ones — checkout + spawn `claude` **pre-seeded with the prompt** (positional `claude --session-id <id> "<prompt>"`, CLI-verified) → a live session, emitting `schedule://fired`; **boot catch-up** for schedules missed while closed; one-shot; pending schedules listed in the sidebar with cancel. The full create/list/cancel/update command surface is exposed for #94.

- #94 Scheduled sessions (part 2): a schedule is now a first-class **draggable item type** — a `CanvasContent` `kind: "scheduled"` (+ a `payloadToContent` case) rendering the shared **`ScheduledPanel`** (an auto-saving launch-time / name / **prompt** editor, debounced → `update_schedule`, + cancel) in the **sidebar** (a draggable row; click selects/jumps #79; × cancels), an **Overview card**, and a **Canvas panel**. Pure frontend on #93's command surface; time helpers in `src/time.ts`.

**Agent items: single-line label + larger activity dot (#95).**

- #95 Slimmed agent items to a single thin line and enlarged the activity dot. The shared `BusyIndicator` (#88) is now a ~10px dot in a ~14px slot (still a fixed slot — no idle↔busy layout shift) everywhere it appears: Overview agent cards + sidebar rows. Agent labels render **only the primary** — the custom name if set, else the branch, with no subtitle line — on all three surfaces (sidebar `SessionRow`, Overview `SessionCard`, Canvas agent panels). The colored repo dot was removed from **every** Overview card (the `.metaDot` on agent / diff / file / scheduled cards) and from Canvas **agent** panels; repo color still reads from each card's colored top band. Canvas non-agent panels keep their dot + meta. Purely visual.

**Worktree agents grouped & badged in Overview/Canvas (#96).**

- #96 A worktree agent (#74) now reads as part of its **parent repo** instead of a foreign-colored stray. A pure `effectiveRepo(session)` (`worktreeParent ?? repoPath`, in `src/paths.ts`) drives Overview grouping / sort / filter, so a worktree agent's card sits **inside the parent's cluster** sharing the parent's color (top band + selection frame) while still labelled with **its own branch** (#95). "This is a worktree" is now a small **"worktree" text badge** (mirroring the sidebar's #74 chip) on the Overview `SessionCard` and the Canvas agent-panel header — never a color difference. Sidebar + `repoColor` unchanged (the fix is *which* repo we color by). Purely visual.

---

## Design reference (dark theme only)

> **Historical (v1 spec).** The live design tokens are in `src/styles/tokens.css`,
> remapped to **Catppuccin Mocha** (#33) — the near-black palette below is the original
> v1 reference, superseded by those tokens. Kept for provenance.

Define as CSS variables; do not introduce off-system colors.

- **Surfaces:** `--bg-base #0B0B0C` · `--bg-sidebar #111113` · `--bg-panel #141416` ·
  `--bg-elevated #1A1A1D` · `--bg-hover #1E1E22` · `--terminal-bg #0E0E10`
- **Borders:** `--border-hairline rgba(255,255,255,.07)` ·
  `--border-strong rgba(255,255,255,.12)`
- **Text:** `--text-primary #EDEDEF` · `--text-secondary #9A9AA0` · `--text-muted #5E5E66`
- **Accent** (brand only — New session button + selected row; **never** a status):
  `--accent #D97757` · `--accent-hover #E08A6D` · `--accent-dim rgba(217,119,87,.14)`
- **Diff:** add `#4BB58A` on `rgba(75,181,138,.12)` · del `#E5534B` on
  `rgba(229,83,75,.12)` · gutter `#5E5E66`
- *Reserved for later (unused in v1, no status UI):* running `#5B8DEF`,
  awaiting `#E0A33E`, done `#4BB58A`, error `#E5534B`, idle `#6B6B73`.

**Type:** UI/chrome → system stack (`-apple-system, "SF Pro Text", ui-sans-serif,
system-ui`); terminal + diff → `JetBrains Mono`, fallback `ui-monospace, "SF Mono",
monospace`. Scale: eyebrow 11px/600/uppercase · UI default 13px · meta 11–12px ·
terminal 12.5px/1.2 · diff 12px/1.45.
**Spacing** 4px base (4·6·8·12·16·20·24·32). **Radii** window/panels 10px,
buttons/inputs 7px, chips 5px, dots 999px. **Depth** hairline borders + bg layering;
one soft shadow for popovers/modals only (`0 8px 28px rgba(0,0,0,.45)`). **Motion**
120–180ms ease-out; respect `prefers-reduced-motion`. **Icons** Lucide line, 16px,
1.5 stroke.

---

## Tasks

Tasks #1–#96 are complete — see **Implemented (completed tasks)** above for the index,
and git history for full per-task detail. Open tasks are listed below. New work goes
here as a fresh `### N.` entry in [TASKS-TEMPLATE.md](TASKS-TEMPLATE.md) format, with
its `Depends on:` prerequisites.

> **Implementing tasks — never skip one.** The agent implementing this backlog
> (`/develop-tasks`, `/isolate-agent`, `/handoff`) MUST implement **every** open task
> whose dependencies are all complete — take the lowest-numbered such `### N.` first —
> and must **never skip a task because it looks big, risky, or hard to verify**. Size is
> not a reason to defer: a task that is genuinely too large for one pass must be **split
> into smaller dependent sub-tasks** first (as #93 was split into #93 + #94), and then
> one of those is implemented — skipping is never the answer. Every task is carried to a
> finished, building, lint-clean state.

---

### 97. [ ] Auto-name unnamed agent sessions from claude's own `ai-title`

**Status:** Not started
**Depends on:** #95, #96
**Created:** 2026-06-21

**Description**

When a session has **no user-set custom name**, give it a meaningful auto-generated
title instead of falling back to the bare branch name. The title source is **claude's
own session title**: Claude Code writes an `{"type":"ai-title","aiTitle":"…"}` entry into
its per-session log at `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`. Because
ClaudeCue owns each session's UUID (`claude --session-id <uuid>`, see `pty.rs`
`spawn_session` / `spawn_session_with_prompt`), it can locate that file and reuse the
title — no extra `claude` process, no API cost. claude generates these titles early
(right after the first user→assistant exchange) and they read well (real examples from
this repo's logs: "Refactor busy icon, file picker, and canvas interface", "Implement
task 84", "Evaluate splitting task #93 into subtasks").

The auto-name **must never override a custom name** the user set via rename (#57). To
keep the two cleanly separate, store the title in a **new `auto_name` field** distinct
from `name`, and extend the display rule so the agent label resolves to
**`custom || auto || branch`**.

Decisions (from authoring):

- **Refresh — keep it current.** Re-read the title when the agent transitions
  busy→idle (end of a turn, when claude has just (re)written it) and update `auto_name`
  when it changes, so the label tracks what the agent is currently doing. (The latest
  `ai-title` in the log wins — entries are appended as the title evolves.)
- **Appearance — identical to a custom name.** With #95 the agent label is a single line
  rendering only `sessionLabel().primary`; an auto-name simply fills that line. No
  italic / marker / subtitle — visually indistinguishable from a typed name.
- **Scope — all agent sessions** with no custom name: interactive, isolated worktree
  agents (#74), and fired scheduled sessions (#93). The reader must key off each
  session's **actual cwd** (the worktree path for #74 agents), not just `repo_path`.
- **Fallback — truncated first prompt.** If no `ai-title` exists yet (best-effort: not
  every log has one), fall back to the session's first user prompt from the same log
  (`last-prompt` / first `user` entry), trimmed to a short single line; if neither is
  available, the existing branch fallback stands. For a fired schedule, ClaudeCue
  already has the seeding prompt (#93) and may use it directly as the fallback without
  reading the file.

Out of scope: changing #57 rename (it keeps owning `name`); any visual distinction for
auto-names; non-agent items (file / diff / terminal / scheduled panels — they have no
agent title). Purely additive to the single-line label model #95 leaves in place.

**Subtasks**

1. [ ] **Storage.** Add `auto_name: Option<String>` to `PersistedSession` (`store.rs`,
   `#[serde(default, skip_serializing_if = "Option::is_none")]`); mirror as
   `auto_name: string | null` on `SessionRecord` / `SessionView` (`types/index.ts`) and
   in the record→view mapping (`store.ts`). Persist it so a captured title shows
   instantly on next boot before the first refresh.
2. [ ] **Persist helper + command.** Add a `set_auto_name(id, name)` store method
   (mirroring `rename_session` in `store.rs` — `update(|state| …)` atomic write) and a
   `set_auto_name` Tauri command (`commands.rs`); wrap it in `ipc.ts`. It sets only
   `auto_name`, never `name`.
3. [ ] **Title reader (Rust).** Add a helper that, given a session id + cwd, locates the
   claude log — glob `~/.claude/projects/*/<id>.jsonl` (UUID is globally unique → no
   dependency on claude's path-encoding; encoded-cwd path only as an optional fast path)
   — scans it **from the end** for the last `{"type":"ai-title","aiTitle":…}` and returns
   it; if absent, returns the first user prompt / `last-prompt` trimmed to a short line.
   Tolerant: missing file / unparseable lines / format drift → `None` (branch fallback).
4. [ ] **Trigger (keep-current).** On a session's busy→idle transition (the monitor in
   `pty.rs` `monitor_loop` / `Activity`), read the title **off the hot path** (a small
   dedicated poll/worker, not inline in the 200ms tick); if it differs from the stored
   `auto_name`, persist via `set_auto_name` and emit a new `SessionEvent::Name`. Wire it
   through `lib.rs` to a `session://name` Tauri event with a payload struct
   (`commands.rs`), following the existing `session://state` / `StatePayload` pattern.
5. [ ] **Frontend event.** Add an `onName` handler to `subscribeSessionEvents` (`ipc.ts`)
   and a store reducer (`store.ts`) that updates the session's `auto_name` (same shape as
   `renameSession`'s optimistic update).
6. [ ] **Display.** Extend `sessionLabel` (`paths.ts`) so `primary` resolves to
   `custom || auto || branchOrFolder`. With #95 the agent surfaces already render only
   `primary`, so the auto-name appears automatically — confirm the sidebar `SessionRow`,
   Overview `SessionCard`, and Canvas agent panels each pass `auto_name` into
   `sessionLabel`.
7. [ ] **Verify** `npm run build`, `npm run lint`, `npm test`, and `cargo test` /
   `npm run lint:rust` are clean.

**Acceptance criteria**

- [ ] An **unnamed** agent whose claude session has produced an `ai-title` shows that
  title as its single-line label (per #95) in the sidebar, Overview, and Canvas — not the
  bare branch.
- [ ] A custom name (rename #57) always wins over the auto-name; **clearing** the custom
  name reveals the current auto-name (or the branch if none).
- [ ] The auto-name updates to reflect claude's latest `ai-title` as the session
  progresses (keep-current), never overwriting a custom name.
- [ ] An unnamed agent with **no** `ai-title` yet shows the trimmed first prompt, or the
  branch if neither is available — never an error or empty label.
- [ ] Works for interactive, worktree (#74), and fired scheduled (#93) sessions (reader
  keys off the session's real cwd).
- [ ] A missing / unreadable / format-changed claude log degrades gracefully to the
  branch fallback, and the busy/idle indicator is unaffected (no hot-path I/O stalls).
- [ ] `npm run build`, `npm run lint`, `npm test`, and the Rust checks pass.

**Notes**

- **Depends on #95 and #96** — both reshape the very surfaces this task edits. #95 makes
  the agent label a single line rendering only `sessionLabel().primary` (no subtitle/dot);
  #97 widens `primary` to include `auto_name`. #96 restructures the same Overview
  `SessionCard` / Canvas agent header (parent-repo grouping + "worktree" badge) and
  assumes an unnamed agent's label is its branch — **#97 supersedes that**: an unnamed
  agent (worktree included) shows its `ai-title`, not the branch. Sequencing #97 after
  both means it edits the settled header and there are no parallel edits to
  `sessionLabel` / the agent surfaces.
- **claude's log format is internal / undocumented** — same fragility class as the
  `--session-id` / `--resume` flags noted in CLAUDE.md Conventions. Verified against the
  logs under `~/.claude/projects/` (claude 2.1.x): `ai-title` / `last-prompt` entries
  keyed by `sessionId`, file named `<session-id>.jsonl`. Treat as best-effort, degrade to
  the branch fallback, and if a future claude version changes it, update the reader and
  note it in CLAUDE.md.
- The latest `ai-title` in the log is current (entries are appended as it updates) — scan
  from EOF. Reading by UUID glob avoids replicating claude's cwd→dir encoding (it maps
  `/` and `.` → `-`).
- A later docs pass should record the new `auto_name` field + the auto-naming flow in
  CLAUDE.md (architecture / data-flow + Conventions) and the README.

---

### 98. [ ] Fix: a detached canvas window shows an empty "open in its own window" placeholder instead of its panels

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-21

**Description**

Popping a canvas into its own window (#84) shows an **empty** window: the body renders the
"This canvas is open in its own window. / Focus window" placeholder (`DetachedCanvasNote`)
instead of the canvas's panels (image #2). A canvas that already has components should keep
showing them in the detached window.

**Root cause.** `CanvasSurface` is shared by the main window's Canvas view **and** the
detached `CanvasWindow`. It picks the placeholder vs. the layout with:

```
const activeDetached = detachedCanvasIds.includes(activeCanvasId);
… activeDetached ? <DetachedCanvasNote …/> : renderNode(layout)
```

That guard is meant only for the **main** window (so a detached canvas's PTYs aren't drawn
in two windows). But the detached window forces `activeCanvasId = DETACHED_CANVAS_ID` on
init (`store.ts` ~806–807), and that id **is** in `detachedCanvasIds`, so `activeDetached`
is `true` there too — the detached window shows the placeholder instead of its own content.

**Fix.** Gate the placeholder on window identity so only the main window shows it:

```
const activeDetached = IS_MAIN_WINDOW && detachedCanvasIds.includes(activeCanvasId);
```

(import `IS_MAIN_WINDOW` from `../../windowContext`). In the detached window
(`IS_MAIN_WINDOW === false`) this is always `false`, so it renders `renderNode(layout)` for
its canvas. The detached window already owns its canvas's sessions
(`computeSessionOwners` → `reconcileTerminals`), so each agent panel's `ownedHere` is `true`
and the pooled terminals render; file / diff / terminal panels render regardless. The main
window still shows the note for a detached active tab (unchanged), so a PTY is never drawn
in two windows.

Scope: the single `activeDetached` guard in `CanvasSurface.tsx`. No backend, ownership, or
cross-window-sync changes.

**Subtasks**

1. [ ] `CanvasSurface.tsx`: import `IS_MAIN_WINDOW` and gate `activeDetached` with it.
2. [ ] Verify the detached window renders the canvas's panels with **live** content (agent
   terminals included), and the main window still shows the "open in its own window" note
   when its active tab is the detached canvas.
3. [ ] `npm run build` + `npm run lint` clean.

**Acceptance criteria**

- [ ] Opening a non-empty canvas in its own window shows its **panels** (live terminals /
  file / diff content), not the "open in its own window" placeholder.
- [ ] The main window still shows the "This canvas is open in its own window / Focus window"
  note when its active tab is a popped-out canvas (no PTY rendered in two windows).
- [ ] `npm run build` and `npm run lint` pass.

**Notes**

- Regression from #84 (multi-window canvases), built but never runtime-verified for
  interactive multi-monitor behavior.
- Touches `CanvasSurface.tsx`, the same file as #95 / #96 / #97 (which edit the agent panel
  *header* / label — a different region). No functional dependency; sequencing after them
  just avoids edit churn.

---

### 99. [ ] Tighten the gap between the "New session" and "Schedule session" sidebar buttons

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-21

**Description**

The two stacked sidebar action buttons — the accent **New session** button and the ghost
**Schedule session** button (#93) — sit **12px** apart, which reads as too loose (image
#3). Tighten that gap to **4px** so they read as one compact cluster.

The gap is entirely the New session button's bottom margin: in `Sidebar.module.css`,
`.newButton` has `margin: var(--space-12)` (12px on all sides) and `.scheduleButton` has
`margin: 0 var(--space-12) var(--space-12)` (top 0). Reduce only `.newButton`'s **bottom**
margin from 12px to 4px (`var(--space-4)`) — e.g.
`margin: var(--space-12) var(--space-12) var(--space-4)`. Leave the top/side margins and
the Schedule button untouched, so only the inter-button gap tightens.

Scope: just the New ↔ Schedule gap in `Sidebar.module.css`. The Schedule → ViewSwitch gap
and the rest of the sidebar spacing stay as they are.

**Acceptance criteria**

- [ ] The vertical gap between the New session and Schedule session buttons is ~4px (down
  from 12px); their outer/side margins and the rest of the sidebar layout are unchanged.
- [ ] `npm run build` and `npm run lint` pass.

---

### 100. [ ] Settings screen — sidebar footer gear + a robust application Settings modal

**Status:** Not started
**Depends on:** #97
**Created:** 2026-06-21

**Description**

Add an application **Settings** screen, opened from a new **thin footer row at the bottom of
the sidebar** holding a **⚙ gear** button (built deliberately roomy so more quick actions can
join the row later). This **reverses the v1 "no settings screen" out-of-scope rule** (as #84
reversed "no multi-window") — record it in CLAUDE.md / README at the next docs pass.

**Entry point.** A new persistent thin bar pinned to the bottom of the `Sidebar` (below the
scrolling repo list), separated by a hairline. For now it holds a single `Settings` (Lucide,
16px) icon button → opens the Settings modal. Lay it out so more icon buttons can be added
without a layout change.

**Settings UI.** A **centered modal overlay** over a dimmed scrim, reusing the
`NewSessionModal` scrim + focus-trap (#49) + Escape-to-close pattern (and the `Checkbox`
#52 / `ViewSwitch` building blocks). A left-hand **section list** (Terminal / Appearance /
Behavior / Sessions / Data & About) with the active section's controls on the right.
**Explicit Save / Cancel:** edits are staged in modal-local **draft** state and applied +
persisted only on **Save**; **Cancel** (and Escape / scrim click) discards the draft. (A
"Reset to defaults" is a nice-to-have.)

**Persistence.** A new `settings` blob persisted through the existing Rust store
(`store.rs` `PersistedState` + a `set_settings` command + an `ipc.ts` wrapper), loaded on
boot into the Zustand store with serde-/TS-side **defaults** so an older `sessions.json`
upgrades cleanly. Mirrors the proven `setRepoColor` persist pattern (no localStorage).

**Settings (this first robust set):**

- **Terminal** — Font size (10–16px, default 12.5) · Line height (1.0–1.8, default 1.2) ·
  Cursor blink (on/off, default on). Applied to **live** pooled terminals on Save
  (`terminalPool` updates each xterm's `options.fontSize` / `lineHeight` / `cursorBlink`
  and refits) and used for newly created ones.
- **Appearance** — Accent color: pick from the 14-color Catppuccin palette (`REPO_PALETTE`),
  default Peach, applied by overriding the `--accent` CSS var on `:root` · Reduce motion:
  force-on beyond the OS `prefers-reduced-motion` (a `body.reduce-motion` class zeroing the
  motion tokens, mirroring the global killswitch).
- **Behavior** — Default view on launch (Overview / Canvas; read by the store at boot) ·
  Confirm destructive actions (on/off, default on): when off, the Sidebar
  Remove / Kill-all / Close-all (#91) skip their confirm step.
- **Sessions** — Auto-name from claude's title (on/off, default on): gates the #97
  auto-naming so `sessionLabel` falls back to the branch when off. **(This is why the task
  `Depends on: #97`.)**
- **Data & About** — Open data folder (reveal the app-data dir / `sessions.json` in Finder —
  a small Tauri `opener`/shell command) · Clear recents (store action + persist) · App
  version (from Tauri); `claude` version optional (a tiny `claude --version` command).

**In scope:** the footer row + gear, the modal, the settings state + persistence, and wiring
each setting above to its effect. **Out of scope (deferred):** advanced backend thresholds
(scrollback size / busy-detection window / schedule poll — would need Rust changes in the
`pty.rs` / `lib.rs` hot loops), light theme (full palette swap), custom `claude` binary
path, sidebar-width drag, keyboard-shortcut rebinding.

**Subtasks**

1. [ ] **Settings state + persistence.** Define a `Settings` type (TS) with defaults; add a
   `settings` field to `store.rs` `PersistedState` (serde default) + a `set_settings`
   command + `ipc.ts` wrapper; load into the Zustand store on boot; add a `saveSettings`
   action (optimistic update + persist, like `setRepoColor`).
2. [ ] **Sidebar footer row + gear.** Add a thin bottom bar to `Sidebar` (hairline-topped,
   pinned below `.repos`) with a `Settings` icon button that opens the modal; lay it out to
   accept more buttons later.
3. [ ] **Settings modal scaffold.** New `Settings/Settings.tsx` (+ CSS module) — centered
   modal (reuse NewSessionModal scrim / focus-trap / Escape), section list + content pane,
   draft state, Save / Cancel.
4. [ ] **Terminal section** + apply font size / line height / cursor blink to live + new
   pooled terminals (`terminalPool`).
5. [ ] **Appearance section** — accent picker (→ `--accent` override) + reduce-motion toggle
   (→ `body.reduce-motion`).
6. [ ] **Behavior section** — default view (boot) + confirm-destructive toggle (Sidebar menu
   handlers honor it).
7. [ ] **Sessions section** — auto-name toggle gating #97's label fallback.
8. [ ] **Data & About section** — open data folder, clear recents, app (+ optional claude)
   version.
9. [ ] **Verify** `npm run build`, `npm run lint`, `npm test`, and the Rust checks
   (`cargo test` / `npm run lint:rust`) are clean.

**Acceptance criteria**

- [ ] A thin row sits at the bottom of the sidebar with a gear button that opens a centered
  Settings modal; the row visibly has room for future actions.
- [ ] The modal has Terminal / Appearance / Behavior / Sessions / Data & About sections;
  changes apply only on **Save** and persist across an app restart; **Cancel** / Escape
  discards.
- [ ] Each setting takes effect: terminal font size / line height / cursor blink change live
  terminals; accent color recolors accent UI; reduce-motion stops animations; default view
  is honored on next launch; confirm-destructive off skips the Sidebar confirms; auto-name
  off shows the branch.
- [ ] Defaults apply cleanly to an existing `sessions.json` with no `settings` (no crash,
  sane values).
- [ ] `npm run build`, `npm run lint`, `npm test`, and the Rust checks pass.

**Notes**

- **Reverses the v1 "no settings screen" rule** — note it in CLAUDE.md / README at the next
  docs pass (architecture + the out-of-scope list).
- **Depends on #97** for the auto-name toggle (it gates #97's `ai-title` naming).
- Grounded by a repo settings audit: most items are frontend-only; the only backend work is
  the `settings` persistence command + the small Data & About helpers (open-folder,
  versions). Advanced thresholds were explicitly deferred.
- If too large for one pass, split per the backlog rule (e.g. infra + footer + modal shell
  first, then the section wirings) — but ship the whole set.

---

### 101. [ ] Pluggable coding-agent CLI — select Claude Code or Codex (extensible)

**Status:** Not started
**Depends on:** #100
**Created:** 2026-06-21

**Description**

Today every agent PTY hardcodes the `claude` CLI. Make the coding agent **pluggable** so a
user can choose, in Settings, which CLI new agents run — **Claude Code** or **Codex** for
now, with the design open to **more agents later**. Every entry point that currently assumes
`claude` becomes agent-driven.

**The abstraction (`AgentSpec` + a built-in catalog).** Introduce a per-agent spec — a new
Rust module `src-tauri/src/agents.rs` and a mirrored TS catalog (`src/agents.ts`) —
describing everything that differs per agent:
- `id` (`"claude"`, `"codex"`), `display_name`, `binary_name` (looked up on PATH);
- `spawn_args(session_id, prompt?) -> Vec<String>` — how to start a session + seed an
  optional prompt;
- `supports_resume` + `resume_args(session_id) -> Vec<String>`;
- `supports_auto_name` (claude reads its `ai-title` log #97; codex can't);
- `install_hint` (for the missing-binary screen).

A built-in catalog (`claude`, `codex`) is the single source of truth — adding an agent later
is a new catalog entry, not scattered edits. **Claude's spec preserves today's exact
behavior** (`--session-id <uuid>`, `--resume <uuid>`, positional prompt). **Codex's spec
must be verified against the real `codex` CLI at implementation** — its command, whether it
accepts an app-chosen session id, whether/how it resumes, positional-prompt support — and
its capability flags set accordingly (same CLI-verification discipline as the claude flags,
per CLAUDE.md Conventions).

**The setting (global default, in #100's Settings screen).** Add an **"Agent"** select
(Claude Code / Codex) to the #100 Settings modal → a persisted `selectedAgent` (default
`claude`). **Global default only:** it sets which agent **new** sessions use; each session
**permanently records its own agent**, so it always resumes/behaves with the CLI it was
started with — switching the setting never affects already-running sessions.

**Per-session agent (persistence).** Add an `agent` field to `PersistedSession` and
`ScheduledSession` (Rust, `#[serde(default)]` → `"claude"` for back-compat) and the TS
mirrors (`SessionRecord` / `SessionView` / `ScheduledSession`, default `"claude"` on read) +
the record→view mapping. New sessions/schedules store `selectedAgent`; resume + auto-name
read the **stored** agent. (ClaudeCue's internal session/PTY id is unchanged — the spec's
`spawn_args` decides whether that id is passed to the CLI, e.g. claude's `--session-id`.)

**Resume = capability-gated; drop non-resumable on relaunch.** For an agent whose
`supports_resume` is false:
- the **copy-resume** button (#28/#86, Overview + Canvas headers) is **hidden** (for
  resumable agents it builds `<binary> --resume <id>` from the spec, not a `claude` literal);
- **Restart** (#63) spawns a **fresh** session instead of `--resume`;
- on **app relaunch** those sessions are **not restored** (they can't be) — only
  resume-capable (Claude) sessions boot-resume, exactly as today.

**Generalize the claude-specific surfaces:**
- Spawn/resume call sites switch from the `"claude"` literal to the resolved spec: `pty.rs`
  (`spawn_session` / `spawn_session_with_prompt` / `resume_session` / the shared
  `spawn_with_id`), `commands.rs` (`spawn_session` / `spawn_worktree_agent` /
  `create_schedule` / `fire_due_schedules`), `lib.rs` boot-resume loop.
- **Missing-binary UI:** generalize `ClaudeMissing` → an agent-aware screen showing the
  spec's `display_name` + `install_hint`; the store flag becomes `agentMissing` (+ which
  agent). The Rust side is already generic (`find_on_path(binary)` → `BinaryNotFound`).
- **Auto-name (#97):** gate the `ai-title` reader on `supports_auto_name` — run it only for
  agents that have it (Claude); others fall back to branch/first-prompt. (#100, which this
  depends on, already depends on #97, so the reader exists by the time this runs.)
- **UI copy:** agent-aware placeholders/labels — NewSessionModal ("Initial prompt for
  <agent>…"), EmptyState ("Start a <agent> session"), ScheduledPanel — from the selected
  agent's `display_name`.

**Unchanged (confirmed agent-agnostic):** the busy/idle monitor (pure output-activity
heuristic), the PTY mechanics (portable-pty, reader, scrollback), and the plain shell
**Terminal item** (#72, runs `$SHELL`). **No per-session agent indicator** in the UI for now
(kept implicit — the global selector is enough).

**Subtasks**

1. [ ] **`AgentSpec` + catalog.** New `src-tauri/src/agents.rs` (spec + `claude` / `codex`
   entries + `agent_spec(id)` lookup) and a mirrored TS catalog (`src/agents.ts`). Claude =
   today's exact flags; Codex = verified against the real CLI, capabilities set accordingly.
2. [ ] **Persistence.** Add `agent` to `PersistedSession` + `ScheduledSession` (serde
   default `"claude"`) and the TS `SessionRecord` / `SessionView` / `ScheduledSession`
   mirrors + the record→view mapping.
3. [ ] **Settings "Agent" select.** Extend #100's Settings modal with an Agent section
   (Claude Code / Codex) → persisted `selectedAgent` (default `claude`).
4. [ ] **Spawn.** Thread the chosen agent through `commands.rs` (`spawn_session` /
   `spawn_worktree_agent` / `create_schedule` / `fire_due_schedules`) and the `pty.rs` spawn
   methods — resolve the spec, use `binary_name` + `spawn_args`, store the agent on the
   record/schedule; new-session flows pass `selectedAgent`.
5. [ ] **Resume (capability-gated).** `pty.rs` `resume_session` + `commands.rs` + the
   `lib.rs` boot loop use the **stored** agent's spec; only resume-capable sessions
   boot-restore (non-resumable dropped); Restart spawns fresh for non-resumable agents.
6. [ ] **Copy-resume UI.** Overview + Canvas headers: hide for non-resumable agents; else
   build the command from the spec.
7. [ ] **Missing-binary UI.** Generalize `ClaudeMissing` → agent-aware (`display_name` +
   `install_hint`); store `agentMissing` (+ agent id).
8. [ ] **Auto-name gating (#97).** Run the `ai-title` reader only for `supports_auto_name`
   agents; others fall back to branch/first-prompt.
9. [ ] **UI copy.** Agent-aware placeholders/labels (NewSessionModal / EmptyState /
   ScheduledPanel).
10. [ ] **Verify** `npm run build`, `npm run lint`, `npm test`, `cargo test`,
    `npm run lint:rust` clean; the Claude path behaves exactly as before; Codex selectable
    and starts (note any capability that couldn't be runtime-verified).

**Acceptance criteria**

- [ ] Settings has an **Agent** select (Claude Code / Codex); the choice persists and sets
  the agent for **new** sessions only.
- [ ] A **Claude** session behaves exactly as today (spawn `--session-id`, boot-resume
  `--resume`, Restart, copy-resume command, auto-name #97).
- [ ] A **Codex** session spawns via the `codex` CLI (real flags, verified at impl); its
  resume-only features are **gated** — copy-resume hidden, Restart starts fresh, and on
  relaunch a non-resumable Codex session is **not** restored — without breaking Claude's
  resume/restore.
- [ ] Each session **remembers its own agent**: changing the setting doesn't change running
  sessions; an existing `sessions.json` with no `agent` loads with sane defaults (`claude`),
  no crash.
- [ ] The missing-binary screen names the **selected agent** and its install hint when that
  CLI isn't on PATH.
- [ ] Adding a third agent later is a **single catalog entry** — no functional `claude`
  literals remain at the spawn/resume/UI call sites.
- [ ] All builds/lints/tests (frontend + Rust) pass.

**Notes**

- **Depends on #100** (the Agent select lives in its Settings screen); #100 already depends
  on #97, so #97's auto-name reader exists to be gated here.
- **Codex CLI flags are unverified** in this plan — the implementer must check the real
  `codex` CLI (command, session-id / resume / positional-prompt support) and set the spec's
  capabilities; if `codex` isn't available to verify, implement per its docs and flag it as
  needing runtime verification (as #84 was). Same fragility class as the claude-flags note
  in CLAUDE.md Conventions.
- **Big task — may be split** along the subtask seams if it can't land in one pass (per the
  backlog rule): e.g. (a) `AgentSpec` + persistence + spawn/resume generalization, Claude
  still the only agent; then (b) the Codex spec + Settings select + UI generalization. Ship
  the whole capability.
- A later docs pass must update CLAUDE.md / README (the "always `claude`" framing, the
  Conventions spawn/resume note, and the new agent abstraction).
