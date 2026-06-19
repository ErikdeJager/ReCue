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
wall" of real terminals, a **Focus** view for one session with a **git-diff
inspector**, and a repo-grouped **sidebar**. Each session is a **real PTY running
`claude`** — ClaudeCue provides the window chrome, navigation, persistence and
git-reading; the terminals come from the Claude Code CLI itself.

**Stack:** Tauri 2 · React + TypeScript + Vite · **Zustand** · plain CSS with
CSS-variable design tokens (CSS Modules) · **xterm.js** terminals · **`portable-pty`**
(Rust) · JSON persistence in the app-data dir · **Lucide** icons · **JetBrains Mono**
(bundled, offline).

**v1 decisions / out of scope:** no status system (no pills/dots/awaiting-glow/
floating) · no app-rendered approval UI (users answer in the terminal) · no Archive
(single **Remove = kill + forget**) · no Skills manager · no Fork · no settings
screen · no light mode · no multi-window · no auth · no code signing/notarization ·
**git is read-only with one exception** — ClaudeCue reads git (current branch +
working-tree diff vs `HEAD`) and never commits or creates branches; the lone write is
`git checkout <existing branch>` from the new-session flow (#27). `claude` is assumed
on `PATH` (clear in-app error if missing).

> The original design spec and interactive prototype (`HANDOFF.md`,
> `Conductor.dc.html`) are preserved in git history (commit `b02efd8`
> "System referances") if exact prototype details are ever needed.

---

## Implemented (completed tasks)

> The full backlog has shipped. Completed tasks are condensed here — number, title, and
> one line on what each delivered — and their full entries removed from the list below;
> per-task detail (subtasks, notes, acceptance, implementation reports) lives in git
> history. This is the running record of what ClaudeCue has shipped.

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
terminal 12.5px/1.5 · diff 12px/1.45.
**Spacing** 4px base (4·6·8·12·16·20·24·32). **Radii** window/panels 10px,
buttons/inputs 7px, chips 5px, dots 999px. **Depth** hairline borders + bg layering;
one soft shadow for popovers/modals only (`0 8px 28px rgba(0,0,0,.45)`). **Motion**
120–180ms ease-out; respect `prefers-reduced-motion`. **Icons** Lucide line, 16px,
1.5 stroke.

---

## Tasks

Tasks #1–#63 are complete — see **Implemented (completed tasks)** above for the index,
and git history for full per-task detail. New work goes here as a fresh `### N.` entry
in [TASKS-TEMPLATE.md](TASKS-TEMPLATE.md) format (next number: **#65**), with its
`Depends on:` prerequisites.

---

### 64. [ ] File viewer — right-side margin so content isn't clipped at the right edge

**Status:** Not started · _(Not started | In progress | Blocked | Done)_
**Depends on:** none
**Created:** 2026-06-19

**Description**

In the universal file viewer (`FileViewer`, #44 — reused by the Focus inspector #40,
Overview markdown columns #41, and Canvas panels #47), content is **clipped on the right
edge**: the rightmost text sits flush against (or under) the right edge / vertical
scrollbar with no breathing room. Add a small right-side margin/padding so nothing is cut
off.

This affects **all three content modes** the viewer renders — rendered **markdown**
(`.markdown`), raw **text** (`.raw`), and highlighted **code** (`.code`/`.raw`) — and
should be fixed **everywhere the viewer mounts** (Focus inspector, Overview column,
Canvas panel). The fix is shared CSS in `FileViewer.module.css`, so one change covers all
contexts.

Likely cause (for the implementer): the scrolling surfaces use `overflow-y: auto` (which
also makes `overflow-x` compute to `auto`) together with the app's **10px classic,
space-consuming scrollbar** (`global.css` `*::-webkit-scrollbar`), so when content scrolls
the scrollbar eats into the right side and the last characters read as cut off.
`.markdown` currently has uniform 16px (`--space-16`) padding and `.raw` only 12px
(`--space-12`). Pick whatever actually clears it in WKWebView — a touch more right padding
and/or `scrollbar-gutter: stable` on the scrolling surfaces so the scrollbar reserves its
own track instead of overlapping content. Keep it "small" per the request; stay on the
spacing tokens.

Out of scope: redesigning the viewer, changing the global scrollbar style app-wide, or
touching unrelated panels.

**Subtasks**

1. [ ] Reproduce the right-edge clipping across markdown, raw, and code modes (content
   tall enough to show the vertical scrollbar).
2. [ ] Add right-side breathing room on the viewer's scrolling surfaces (`.markdown`,
   `.raw`) in `FileViewer.module.css` — small right-padding bump and/or
   `scrollbar-gutter: stable` — using `--space-*` tokens.
3. [ ] Verify content clears the right edge/scrollbar in the Focus inspector, an Overview
   markdown column, and a Canvas panel — both with and without a visible vertical
   scrollbar.

**Acceptance criteria**

- [ ] In the file viewer's markdown, raw-text, and code modes, the rightmost content is no
  longer clipped — there's a small, even gap between the content and the right edge /
  vertical scrollbar.
- [ ] Holds in all mount contexts: Focus inspector, Overview column, and Canvas panel.
- [ ] The gap is present whether or not a vertical scrollbar is showing (no layout jump
  when it appears, if `scrollbar-gutter` is used).
- [ ] Only `--space-*` design tokens are used; no off-token values introduced.

**Notes**

- Decisions (from the requester): applies to all viewer modes (markdown + raw + code) and
  everywhere the viewer mounts; the remedy is a *small* right margin (keep it subtle).
- Key code: `src/components/FileViewer/FileViewer.module.css` (`.markdown`, `.raw`,
  `.code`), `src/components/FileViewer/FileViewer.tsx` (which class wraps each mode),
  `src/styles/global.css` (the 10px `*::-webkit-scrollbar` that consumes right-edge space).
- Sanity-check edge cases: wide markdown tables and long inline code / URLs
  (`.markdown table` has no horizontal-scroll wrapper, and `overflow-y: auto` couples
  `overflow-x` to `auto`).
