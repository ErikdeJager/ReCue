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
terminal 12.5px/1.2 · diff 12px/1.45.
**Spacing** 4px base (4·6·8·12·16·20·24·32). **Radii** window/panels 10px,
buttons/inputs 7px, chips 5px, dots 999px. **Depth** hairline borders + bg layering;
one soft shadow for popovers/modals only (`0 8px 28px rgba(0,0,0,.45)`). **Motion**
120–180ms ease-out; respect `prefers-reduced-motion`. **Icons** Lucide line, 16px,
1.5 stroke.

---

## Tasks

Tasks #1–#63 are complete — see **Implemented (completed tasks)** above for the index,
and git history for full per-task detail. New work goes here as a fresh `### N.` entry
in [TASKS-TEMPLATE.md](TASKS-TEMPLATE.md) format (next number: **#87**), with its
`Depends on:` prerequisites.

---

### 64. [x] File viewer — right-side margin so content isn't clipped at the right edge

**Status:** Done · _(Not started | In progress | Blocked | Done)_
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

1. [x] Reproduce the right-edge clipping across markdown, raw, and code modes (content
   tall enough to show the vertical scrollbar). _(By analysis: the 10px classic
   `::-webkit-scrollbar` overlaps the inline-end padding box, leaving ~2px in `.raw`.)_
2. [x] Add right-side breathing room on the viewer's scrolling surfaces (`.markdown`,
   `.raw`) in `FileViewer.module.css` — small right-padding bump and/or
   `scrollbar-gutter: stable` — using `--space-*` tokens.
3. [x] Verify content clears the right edge/scrollbar in the Focus inspector, an Overview
   markdown column, and a Canvas panel — both with and without a visible vertical
   scrollbar. _(Shared CSS on the one `FileViewer` covers all three contexts; verified
   via type-check/build + lint, not a live GUI run.)_

**Acceptance criteria**

- [x] In the file viewer's markdown, raw-text, and code modes, the rightmost content is no
  longer clipped — there's a small, even gap between the content and the right edge /
  vertical scrollbar.
- [x] Holds in all mount contexts: Focus inspector, Overview column, and Canvas panel.
- [x] The gap is present whether or not a vertical scrollbar is showing (no layout jump
  when it appears, if `scrollbar-gutter` is used).
- [x] Only `--space-*` design tokens are used; no off-token values introduced.

**Notes**

- Decisions (from the requester): applies to all viewer modes (markdown + raw + code) and
  everywhere the viewer mounts; the remedy is a *small* right margin (keep it subtle).
- Key code: `src/components/FileViewer/FileViewer.module.css` (`.markdown`, `.raw`,
  `.code`), `src/components/FileViewer/FileViewer.tsx` (which class wraps each mode),
  `src/styles/global.css` (the 10px `*::-webkit-scrollbar` that consumes right-edge space).
- Sanity-check edge cases: wide markdown tables and long inline code / URLs
  (`.markdown table` has no horizontal-scroll wrapper, and `overflow-y: auto` couples
  `overflow-x` to `auto`).

---

### 65. [x] New session panel should fully cover the New session button (no corner peeking out)

**Status:** Done · _(Not started | In progress | Blocked | Done)_
**Depends on:** none
**Created:** 2026-06-19

**Description**

When the New session panel opens (it "grows from" the New session button, #53), a **sliver
of the button's top-left corner stays visible** around the panel. The panel should
completely cover the button.

Cause: both the button (`.newButton`, `Sidebar.module.css`) and the panel (`.popover`,
`NewSessionModal.module.css`) anchor at 12px from the top-left, but the panel's corner uses
`--radius-window` (10px) while the button uses the smaller `--radius-control` (~7px) — the
button's sharper corner protrudes past the panel's rounder one. Fix so the panel fully
occludes the button (match the panel's top-left radius to the button's or sharper, and/or
nudge the panel's origin a hair up/left). Keep the "grows from the button" scale-in; stay
on tokens.

Out of scope: the panel's internal flow/keybindings (#66).

**Acceptance criteria**

- [x] With the panel open, no part of the New session button is visible around it (top-left
  corner included).
- [x] The open animation still reads as growing from the button; tokens only.

**Notes**

- Shares the New session component with #66; coordinate/rebase to avoid CSS conflicts.
- Key code: `src/components/NewSessionModal/NewSessionModal.module.css` (`.popover`,
  `.overlay`), `src/components/Sidebar/Sidebar.module.css` (`.newButton`, `.sidebar`).

---

### 66. [x] Rework the new-session flow — two-step folder→branch keyboard flow, branch filter, in-button hints, remove Name, "Start"

**Status:** Done · _(Not started | In progress | Blocked | Done)_
**Depends on:** none
**Created:** 2026-06-19

**Description**

Rework the new-session panel (`NewSessionModal.tsx`, #53/#61) into a clean two-step,
keyboard-driven flow.

**Step 1 — Folder.** Recents search auto-focused on open (already). Type to filter; ↑/↓
moves the highlight (= target folder). **Enter no longer starts the agent** — it
**advances to the Branch step** for a git repo.

**Step 2 — Branch.** Only for a git repo — **skip entirely for a non-git folder** (no
branches, so Enter in step 1 starts the agent directly). On entry, focus lands on the
branch picker; ↑/↓ moves; **Enter starts the agent** (`git checkout` first for a
non-current branch, existing destructive-confirm gate preserved).

**Branch filter + priority sort.** Show a **branch filter** input above the list **when
there are more than 4 branches** (auto-focused on entering the step; type to filter, ↑/↓ to
move, Enter to start). Pin **well-known branches to the top in priority order** — `main`,
then `master`, then `dev`/`develop` — then the rest (current branch highlighted as the
default selection); matching priority branches sort to the top of filtered results too.

**In-button key hints.** Remove the standalone hint row (`.hints`); move affordances **into
the buttons** — ⏎ in **Start**, esc in **Cancel**. **Drop the other hint visuals**
(per-recent ⌘1–9 badges, ↑/↓ hints). Navigation stays type-to-filter + ↑/↓; the
now-unhinted ⌘1–9 quick-jump may stay working silently or be removed.

**Remove the Name field** from creation **for now**, and **stop defaulting the session name
to the folder name** — a session created here has **no custom name** (name = empty/null).
(Custom names are still settable via sidebar rename #57; their display is #67.)

**Rename the action button** "Create" → **"Start"**, shown as **"Start"** normally and
**"Checkout & start"** when a non-current branch is selected.

Preserve: a11y focus-trap / focus-restore / outside-click + Escape close (#49), the ⌘N
launcher entry, the destructive-checkout acknowledgement (#27).

**Subtasks**

1. [x] Folder step: keep search auto-focus + type/↑↓ filter; change Enter to **advance**
   (focus Branch step for git; start immediately for non-git / 0 branches).
2. [x] Branch step: auto-focus on entry; ↑↓ roving; Enter starts (checkout for non-current,
   destructive-confirm intact).
3. [x] Branch filter input above the list, shown when **>4 branches**; type filters, ↑↓
   moves, Enter starts.
4. [x] Sort branches: pin `main` > `master` > `dev`/`develop` to the top, current
   highlighted/default, rest after; priority branches sort to top of filtered results.
5. [x] Remove `.hints` row; ⏎ in Start, esc in Cancel; remove ⌘1–9 badges and ↑↓ hints.
6. [x] Remove the Name input; stop defaulting name to repoName — new sessions have no custom
   name.
7. [x] Rename action button to "Start" / "Checkout & start". _(Branch-step start button =
   "Start" / "Checkout & start"; the folder-step advance button reads "Continue" for a git
   folder and "Start" for a non-git folder, since it advances vs. starts. A "‹ change folder"
   back affordance returns from the branch step to the folder step.)_

**Acceptance criteria**

- [x] Opening focuses the recents search; typing/↑↓ filters & highlights a folder.
- [x] Enter on a **git** folder advances to the Branch step (no start); Enter on a
  **non-git** folder starts immediately.
- [x] In the Branch step, ↑↓ moves and Enter starts (checkout for a non-current branch;
  destructive-confirm still gates it).
- [x] Branch filter appears when >4 branches, auto-focused, filters as you type;
  `main`/`master`/`dev` pinned to the top in that order (and atop matching results).
- [x] No standalone hint row; Start shows ⏎, Cancel shows esc; no ⌘1–9 / ↑↓ hint badges
  remain.
- [x] No Name field; a session created here has no custom name.
- [x] Action button reads "Start" (or "Checkout & start" when switching branches).

**Notes**

- Decisions (from the requester): drop all list-nav hint visuals (keep only ⏎/esc in
  buttons); "Start" / "Checkout & start"; branch filter when >4 branches with
  main/master/dev priority-pinned; remove Name; display handled in #67.
- #67 **depends on this task** removing the default custom-name behavior.
- Shares the New session component with #65; coordinate/rebase.
- Key code: `NewSessionModal.tsx` (`onSearchKeyDown`, `onBranchKeyDown`, `create`,
  `.hints`, Name input, button labels), `NewSessionModal.module.css`, `src/store.ts`
  (`spawnSession`), `git.rs` / `list_branches` (branch data).

---

### 67. [x] Session label: branch is the primary title; a custom name overrides it (branch becomes the subtitle)

**Status:** Done · _(Not started | In progress | Blocked | Done)_
**Depends on:** #66
**Created:** 2026-06-19

**Description**

Unify how an agent session is labeled everywhere:

- **No custom name → primary = the branch** (folder name for a non-git folder); no subtitle.
- **Custom name set → primary = the custom name, branch becomes the subtitle** (folder name
  for non-git).

Today surfaces are inconsistent and a "custom name" effectively always exists (creation
forces `name = custom || repoName`), so this only behaves right once **#66** removes the
default-name behavior (custom names then come only from rename #57).

Current rendering to unify:
- **Sidebar** (`Sidebar.tsx`): primary = branch (`label`), secondary = `session.name`.
- **Overview** (`Overview.tsx`): primary = `name ?? repoName`, secondary = `repoName · branch`.
- **Focus** (`Focus.tsx`): `name · branch · …`.
- **Canvas** (`Canvas.tsx`): title = `name ?? repoName`, subtitle = `repoName · branch`.

Desired: every surface uses primary = `name || branch || folderName`; subtitle =
branch/folderName **only when a custom name is set**. Keep each surface's existing **repo
color badge / grouping** (#35–#37) for "which repo"; drop now-redundant repo/branch text the
new rule would duplicate.

**Subtasks**

1. [x] Define the rule once (shared helper): primary = `name || branch || folderName`;
   subtitle = `name ? (branch || folderName) : null`. _(`sessionLabel` in `src/paths.ts`.)_
2. [x] Apply to Sidebar rows, Overview cards, Focus toolbar, Canvas panel titles.
3. [x] Preserve repo color/badge; remove redundant repo/branch text left by the change.

**Acceptance criteria**

- [x] A session with no custom name shows the **branch** as its primary label on all
  surfaces (folder name when non-git), no subtitle.
- [x] After renaming (#57), the **custom name** is primary and the **branch** is the
  subtitle on all surfaces.
- [x] Sidebar, Overview, Focus, Canvas all follow the same rule; repo color/badge retained.

**Notes**

- Decision (from the requester): applies to all surfaces.
- Depends on #66 (stops defaulting the name, so "has a custom name" is meaningful).
- Branch comes from the live `branches` map in the store (by repo); non-git → primary falls
  back to folder name.
- Key code: `Sidebar.tsx` (`SessionRow`), `Overview.tsx`, `Focus.tsx`, `Canvas.tsx`,
  `src/paths.ts`.

---

### 68. [x] Repo filter selector should visually include its "+" (new-session) button

**Status:** Done · _(Not started | In progress | Blocked | Done)_
**Depends on:** none
**Created:** 2026-06-19

**Description**

In the sidebar, each repo/folder group has a header (`Sidebar.tsx` `.repoHeader`) with two
side-by-side buttons: the **repo title** (`.repoTitle`) — a click-to-filter-Overview
selector (#34) showing the repo color dot (#35) + name + session count — and a separate
**"+"** button (`.plus`, "New session in this repo", #54). The active-filter highlight
(`.repoActive` → `--accent-dim` rounded box) is applied to the **title only**, so the "+"
sits *outside* the highlighted box and looks detached/odd (see screenshot).

Make the filter selector **visually include the "+"**: the selector's box — its hover and
active-filter highlight — should enclose **both** the repo title and the "+" as one cohesive
control, instead of highlighting just the title and leaving the "+" floating beside it. Keep
them as **two separate click targets** (title = filter Overview; "+" = new session in repo)
and preserve the empty-repo accent "+" treatment (`.plusCoral`) and a11y labels.

Likely approach: move the rounded background / hover / active highlight from `.repoTitle` to
the `.repoHeader` container (title and "+" transparent inside it), so the whole row reads as
one selector. Stay on tokens.

Out of scope: changing what the title or "+" *do*; the session-row labels (#67).

**Acceptance criteria**

- [x] The repo header's hover and active-filter highlight enclose both the repo title and
  the "+" as a single rounded selector — the "+" no longer sits outside the highlighted box.
- [x] Clicking the title still filters Overview; clicking the "+" still opens New session in
  that repo; empty-repo accent "+" and a11y labels preserved.
- [x] Tokens only; no off-system values.

**Notes**

- From the screenshot: the active repo filter shows the accent-dim box around "● ClaudeCue"
  with the "+" detached to its right.
- Shares `Sidebar.tsx` / `Sidebar.module.css` with #67 but touches different elements (repo
  header vs `SessionRow`); independent.
- Key code: `src/components/Sidebar/Sidebar.tsx` (`.repoHeader`, `.repoTitle`/`.repoActive`,
  `.plus`/`.plusCoral`), `src/components/Sidebar/Sidebar.module.css` (lines ~63–158).

---

### 69. [x] File picker — remove the focus-ring border around the search input

**Status:** Done · _(Not started | In progress | Blocked | Done)_
**Depends on:** none
**Created:** 2026-06-19

**Description**

In the searchable file picker (`FilePicker`, #56 — the "Search files…" popover), a thick
accent (Peach) border wraps the search input and looks ugly (see screenshot). It is **not**
an input border — `.search` already has `border: 0` — it's the **global `:focus-visible`
ring** (`global.css`: `outline: 2px solid var(--accent); outline-offset: 2px`), which shows
because the picker **auto-focuses** the search field on open.

Remove that ring **for this input only**: scope an override to the picker's search field
(e.g. `.search:focus-visible { outline: none; }` in `FilePicker.module.css`). Do **not**
touch the global focus ring — every other control keeps it.

a11y note: acceptable here because the field is the sole, auto-focused input of a dedicated
search popover (the magnifier icon + `.searchRow` bottom border already mark it as the
active field), so dropping the ring on this one input doesn't hurt discoverability.

Out of scope: the global `:focus-visible` style and any other input's focus ring.

**Acceptance criteria**

- [x] The "Search files…" input no longer shows the accent outline/border when focused
  (including on open, when it auto-focuses).
- [x] The global focus-visible ring is unchanged for every other focusable control (other
  inputs, buttons, list rows).
- [x] The change is scoped to `FilePicker`'s search input only.

**Notes**

- Key code: `src/components/FilePicker/FilePicker.module.css` (`.search`, `.searchRow`),
  `src/styles/global.css` (lines ~60–62, the global `:focus-visible` outline — leave as is).
- The picker is reused wherever the "Open file viewer" file search appears (#56); scoping to
  `.search` covers all of them (the intent of "only this input field").

---

### 70. [x] Overview: make the whole column title bar a drag handle (not just the corner grip)

**Status:** Done · _(Not started | In progress | Blocked | Done)_
**Depends on:** none
**Created:** 2026-06-19

**Description**

In Overview mode, every column — agent terminals **and** the file / diff / markdown viewer
panels — can be drag-reordered within its repo cluster (#43, dnd-kit). Today the **only**
drag affordance is the small grip in the top-left corner (`.dragHandle`); the rest of the
title bar (`.titleBlock`: name + "repo · branch") isn't draggable. Make the **whole title
bar** the drag handle: click-and-drag from anywhere on the header reorders the column.

Both column types share one wrapper — `PanelColumn` in `Overview.tsx` (used by `SessionCard`
for agents and `ExtraPanel` for file/diff/markdown) — so the change lands in one place and
covers all of them.

Keep the action buttons fully clickable and **not** drag triggers: the **×** still closes
(kill + forget the agent / close the panel), and an agent card's **Expand to Focus** and
**Open in Zed** buttons still fire. (dnd-kit's pointer sensor has an activation distance, but
a press on a button inside the draggable header can still begin a drag — guard the buttons,
e.g. `onPointerDown` stopPropagation, so their clicks always win.)

Move the dnd-kit `listeners` onto the header/title region instead of only the grip; give the
bar a `grab` / `grabbing` cursor so the whole strip reads as draggable. Preserve keyboard +
screen-reader drag (dnd-kit `attributes` need a focusable element — keep a focusable handle,
or set them on the header). The corner grip icon may stay as a visual hint or be dropped.

Out of scope: Canvas panels (different drag model); the terminal/body content; changing what
any button does.

**Subtasks**

1. [x] In `PanelColumn` (`Overview.tsx`), attach the sortable `listeners` to the whole
   header (title bar) rather than only the grip; keep `attributes` / keyboard drag working.
   _(Both `attributes` + `listeners` moved to `<header>`; grip is now a visual-hint span.)_
2. [x] Guard the `.actions` buttons (×, Expand, Zed) so pressing them doesn't start a drag
   and their onClick still fires. _(One `onPointerDown` stopPropagation on the `.actions` div.)_
3. [x] Add `cursor: grab` / `:active` `grabbing` to the header in `Overview.module.css`;
   keep or remove the grip as a visual hint. _(Grip kept; brightens on header hover.)_

**Acceptance criteria**

- [x] In Overview, pressing and dragging anywhere on a column's title bar (over the
  name/subtitle, not just the corner grip) reorders the column — for agent terminals and for
  file/diff/markdown panels.
- [x] The × still closes the agent/panel; Expand to Focus and Open in Zed still work; none of
  them start a drag.
- [x] The title bar shows a grab/grabbing cursor; keyboard reorder + screen-reader drag still
  work.
- [x] No regression to selecting a card or to the terminal/body interactions.

**Notes**

- Decision (from the requester): the whole title bar drags; the × (and the other header
  buttons) stay as click targets.
- Shares `Overview.tsx` (`SessionCard`/`ExtraPanel` title area) with #67 (label rule) —
  different concern (drag wiring vs title text); coordinate/rebase.
- Key code: `src/components/Overview/Overview.tsx` (`PanelColumn` header: `.dragHandle`,
  `.titleBlock`, `.actions`; `useSortable`), `src/components/Overview/Overview.module.css`
  (`.header` ~112, `.dragHandle` ~125).

---

### 71. [x] Activity indicator — move it before the agent title (all surfaces) + reinvent it as a spinner arc

**Status:** Done · _(Not started | In progress | Blocked | Done)_
**Depends on:** none
**Created:** 2026-06-19

**Description**

Two changes to the agent **busy/activity indicator** (`BusyIndicator`, #42 → #55):

**1. Reposition — before the title, everywhere.** Today the indicator sits on the **right**
of the title bar / row: in the Overview card header it's inside the actions group
(`.headerBusy`, left of Expand/Zed/×), in the sidebar row it's after the label (`.rowBusy`,
before ×), and the Focus toolbar shows it after the title text. Move it to the **far left —
before the agent's name/title** — on **all** surfaces: Overview card header, Focus toolbar,
and sidebar rows. It should read consistently as "● name", left of the name.

**2. Reinvent the look — a spinner arc.** The user dislikes the current single pulsing ball
(`busy-pulse`: scale + opacity). Replace it with a **small rotating arc / ring (spinner)**
that circles continuously while the session is **working** (in `--status-running`). Keep the
**idle** state a **calm static dot** (`--status-idle`, no motion) so the slot stays stable,
and keep the **reduced-motion** fallback static (a static ring/dot, no rotation — global
killswitch in `global.css`). Keep it compact so it fits all three placements, and keep the
`role="status"` + aria-label/tooltip (Working…/Idle).

The redesign lives in the shared `BusyIndicator` component, so the new spinner applies
everywhere it renders at once; only the *position* changes per surface.

Out of scope: the busy/idle detection (#55 backend heuristic stays); non-agent panels
(file/diff) don't show the indicator.

**Subtasks**

1. [x] Redesign `BusyIndicator` (`.tsx` + `.module.css`): busy = rotating spinner arc
   (`--status-running`); idle = static dot (`--status-idle`); reduced-motion = static. Keep
   compact + `role="status"` label. _(Fixed 12px footprint: a reserved transparent ring
   border + a centered `::before` dot; busy colors `border-top` and spins; reduced-motion
   shows a full static ring.)_
2. [x] Sidebar `SessionRow`: move `<BusyIndicator>` to before the label (`.rowMain`) instead
   of after it.
3. [x] Overview `SessionCard`: move the indicator out of `actions` (`.headerBusy`) to the
   start of the header, before the title (`.titleBlock`). _(New `leading` slot on
   `PanelColumn`, after the drag grip; `.headerBusy` removed.)_
4. [x] Focus toolbar: move the indicator before the title text.

**Acceptance criteria**

- [x] On all three surfaces (sidebar rows, Overview card header, Focus toolbar) the activity
  indicator sits to the **left of the agent's name/title**, not on the right.
- [x] While an agent is working it's a rotating spinner arc; when idle it's a calm static
  dot; under reduced-motion it's static (no rotation).
- [x] The indicator stays compact and aligned in every placement; `role="status"` +
  Working…/Idle label preserved.
- [x] No change to when busy/idle is detected.

**Notes**

- Decisions (from the requester): reposition on all surfaces incl. sidebar; animation =
  spinner arc (rotating); idle stays a static dot.
- The redesign is in the shared `BusyIndicator` (conflict-free); the per-surface reposition
  touches the same header/row regions as #67 (agent label rule) and #70 (Overview title-bar
  drag) — coordinate/rebase if those land first, and place the indicator relative to the
  final Overview title-bar structure from #70.
- Key code: `src/components/BusyIndicator/BusyIndicator.tsx` + `BusyIndicator.module.css`
  (`.ball`/`.busy`/`busy-pulse`), `src/components/Sidebar/Sidebar.tsx` (`.rowBusy`,
  `SessionRow`), `src/components/Overview/Overview.tsx` (`.headerBusy`, `SessionCard`),
  `src/components/Focus/Focus.tsx` (toolbar, ~204).

---

### 72. [x] Plain terminal item — a shell PTY that works like the file/diff viewers

**Status:** Done · _(Not started | In progress | Blocked | Done)_
**Depends on:** none
**Created:** 2026-06-19

**Description**

Add a new openable **item type: a plain terminal** — a real PTY running the user's shell
where they can type — that behaves like the existing non-agent items (file viewer #44, diff
viewer #39): opened from the repo menu, shown as an Overview column and a sidebar row, and
draggable into a Canvas panel. It is **not** a `claude` agent (no busy indicator, no branch
label, no claude-resume) — it's an *item*.

**Shell & cwd:** run the user's `$SHELL` (fallback `/bin/zsh`) with the working directory set
to the item's repo/folder.

**Reuse what's already generic.** The PTY layer and the `Terminal` pool are not
claude-specific — `SessionManager` (`pty.rs`) drives any PTY by id (reader thread, bounded
scrollback, `session://output`/`session://exited`, `write_stdin`, `resize_pty`,
`kill_session`, `session_scrollback`), and the `Terminal` pool component renders any PTY by
id. Only `spawn_session` hardcodes `claude`. So a terminal item is a new PTY spawned by a new
`spawn_terminal(cwd)` command (running `$SHELL`, no `--session-id`/`--resume`), rendered by
the same `<Terminal>` — its **panel id = its PTY id**.

**Model.** Add a new item kind `"terminal"`:
- `OverviewPanel.kind` gains `"terminal"` (`types/index.ts`; `store.rs` `OverviewPanel.kind`
  is already a free `String`; the `file` field is unused for terminals).
- `CanvasContent.kind` gains `"terminal"` (with `repoPath` + the PTY/panel id).

**Surfaces (parity with file/diff items):**
- **Repo context menu** (Sidebar): add **"Open terminal"** next to "Open diff viewer" /
  "Open file viewer…" → creates a terminal panel in that repo + spawns the shell.
- **Overview:** render it as a column via the shared `ExtraPanel`/`PanelColumn` — title
  "Terminal" + repo·branch subtitle; × closes (kills the shell + removes the panel).
- **Sidebar:** a tree row under the repo (a `TerminalRow`, like `FileRow`/`DiffRow`) — click
  opens Overview, hover-× removes, draggable into Canvas.
- **Canvas:** `payloadToContent` maps a terminal drag payload → `{ kind: "terminal",
  repoPath, … }`; Canvas renders `<Terminal>`; dedupe by id like agent/diff.

**Persistence (decision): persist the item, fresh shell on boot.** Terminal panels persist in
`overview_panels`, so the item reappears after an app restart — but a plain shell can't
resume, so on boot respawn a **fresh** `$SHELL` for each terminal panel using its persisted
id (previous output/history is gone). Removing the item (×) kills the shell and drops the
persisted panel. (Agents stay in `sessions.json` + claude-resume; terminals live in
`overview_panels` + shell-respawn — clean separation.)

**Integration gotchas to handle:**
- `reconcileTerminals(active)` (`App.tsx`) disposes pooled terminals whose id isn't in
  `active` (today the agent session ids) — include terminal-item PTY ids so they aren't
  disposed.
- The `Terminal` component reads agent `sessions` for its exit/reconnecting overlay; a
  terminal-item PTY isn't in `sessions`, so make the exit state work for non-agent PTYs (e.g.
  on shell exit show a simple exited state + Restart that respawns the shell). Item
  semantics: × always closes+removes, independent of the agent-exit rework (#63).

Out of scope: a non-repo/global terminal, a Canvas-native "new terminal" button (open via the
repo menu then drag), tabs/splits inside one terminal item, and shell-history restore.

**Subtasks**

1. [x] Backend: add `spawn_terminal(cwd)` (+ a with-id variant for boot) in
   `pty.rs`/`commands.rs` running `$SHELL` (fallback `/bin/zsh`) via `spawn_with_id`; reuse
   the existing write/resize/kill/scrollback/event paths. Clear error if the shell is missing.
   _(`spawn_terminal(id, cwd)` — the frontend owns the id, so one path serves create + boot.)_
2. [x] Model: add `"terminal"` to `OverviewPanel.kind` (`types/index.ts`) and
   `CanvasContent.kind`; add a typed IPC wrapper for `spawn_terminal`.
   _(`CanvasContent.kind` is already a free `string`; the terminal's PTY id rides on
   `sessionId`.)_
3. [x] Repo menu: add **"Open terminal"** → `addOverviewPanel(repo, "terminal")` + spawn the
   shell with that panel's id.
4. [x] Overview: render the terminal panel as a column (`ExtraPanel`/`PanelColumn`, title
   "Terminal", × kills+removes).
5. [x] Sidebar: add a `TerminalRow` under the repo (click→Overview, ×→remove, draggable into
   Canvas).
6. [x] Canvas: extend `payloadToContent` + the render switch + dedupe for `kind: "terminal"`
   → `<Terminal>`.
7. [x] Pool: include terminal-item ids in `reconcileTerminals`; make the `Terminal` exit
   overlay work for non-agent PTYs (shell exit → restart affordance). _(New `terminalExits`
   store map + `restartTerminal`; `Terminal` takes an optional `repoPath` prop.)_
8. [x] Persistence/boot: respawn a fresh `$SHELL` for each persisted terminal panel on
   startup using its id; removing the item kills the shell + drops the panel.

**Acceptance criteria**

- [x] A repo's context menu has "Open terminal"; choosing it opens a usable shell (typing
  works) in the repo folder, as an Overview column.
- [x] The terminal item also shows as a sidebar row under the repo and can be dragged into a
  Canvas panel — the same item rendering everywhere (pool intact, no remount).
- [x] The terminal is not treated as an agent: no busy indicator, no branch label, not in the
  agent/session list; its × kills the shell and removes the item.
- [x] After an app restart, the terminal item reappears (persisted) with a fresh shell in the
  repo folder.
- [x] Multiple terminal items per repo work; each is an independent shell.

**Notes**

- Decisions (from the requester): plain `$SHELL` (fallback `/bin/zsh`) in the repo folder;
  persist the item + fresh shell on boot (no history resume); behaves like file/diff items
  (repo menu → Overview + sidebar + Canvas).
- Reuses the generic PTY/`SessionManager` registry + the `Terminal` pool (both already
  id-keyed, not claude-specific); only `spawn_session` is claude-specific.
- Shares the Overview panel rendering with #70 (title-bar drag) and the panel pipeline
  broadly — coordinate/rebase.
- Key code: `src-tauri/src/pty.rs` (`spawn_with_id`, add `spawn_terminal`),
  `src-tauri/src/commands.rs`, `src-tauri/src/store.rs` (`OverviewPanel`),
  `src/types/index.ts` (`OverviewPanel`, `CanvasContent`), `src/store.ts`
  (`addOverviewPanel`, boot respawn), `src/ipc.ts`, `src/components/Sidebar/Sidebar.tsx`
  (repo menu + `FileRow`/`DiffRow` → add `TerminalRow`), `src/components/Overview/Overview.tsx`
  (`ExtraPanel`), `src/components/Canvas/canvasDrop.ts` + `Canvas.tsx` (content kind),
  `src/components/Terminal/{Terminal.tsx,terminalPool.ts}` + `src/App.tsx`
  (`reconcileTerminals`).

---

### 73. [x] Markdown viewer — make switching back from raw to rendered obvious (two-way toggle)

**Status:** Done · _(Not started | In progress | Blocked | Done)_
**Depends on:** none
**Created:** 2026-06-19

**Description**

In the file viewer's markdown mode (`FileViewer`, #40/#44), clicking the code/raw toggle
shows the raw source, but users can't tell how to get **back** to the rendered view — it
feels one-way.

In the code the toggle *is* bidirectional: a single small, dim (`--text-muted`) icon button
in the top-right of the viewer toolbar flips `showRaw` both ways — `Code2` (`</>`) when
rendered, switching to an `Eye` icon (title "Show rendered") when raw. So the likely problem
is **discoverability**: the lone, subtle corner icon doesn't read as the way back, and the
icon swap is easy to miss.

Make returning to the rendered view obvious: replace the single ambiguous icon with a
**clear two-way toggle** — e.g. a two-segment "Rendered / Raw" control (labels or two icons)
with the active state highlighted — so it's always apparent which mode you're in and how to
switch. Keep it markdown-only, compact, on tokens, and a11y-labeled. Also **verify the switch
actually works at runtime** in every context (Focus inspector, Overview column, Canvas
panel); if a real bug prevents the back-toggle, fix it.

Out of scope: code/raw-only files (they have no rendered mode); the viewer's content
rendering itself.

**Acceptance criteria**

- [x] From the raw view of a markdown file there is an obvious, labeled control to return to
  the rendered view, and it works.
- [x] The control clearly shows the current mode (rendered vs raw) — not a single ambiguous
  icon.
- [x] Works in the Focus inspector, an Overview markdown column, and a Canvas panel;
  markdown-only; tokens + a11y labels preserved.

**Notes**

- The toggle currently lives in `FileViewer.tsx` (`showRaw`, the `.toolbar` button swapping
  `Code2`/`Eye`) and `FileViewer.module.css` (`.toolbar`, `.toggle`); the code flips both
  ways, so this is primarily a clarity/discoverability fix (confirm there's no runtime bug).
- Key code: `src/components/FileViewer/FileViewer.tsx` (`showRaw`, toolbar toggle),
  `src/components/FileViewer/FileViewer.module.css` (`.toolbar`, `.toggle`).

---

### 74. [x] Isolated worktree agents — ⌘⏎ in the new-session modal; nested under the parent repo

**Status:** Done · _(Not started | In progress | Blocked | Done)_
**Depends on:** #65, #66, #67
**Created:** 2026-06-19

**Description**

Add a **git worktree** workflow to the new-session modal: from the branch step, **⌘⏎ starts
an agent in an isolated worktree** — its own folder containing a separate checkout of the repo
on a chosen branch — instead of running in the repo's main folder. Worktree agents appear in
the sidebar **indented under their parent repository**, with slightly different titling so
it's clear they're isolated instances.

This is the "folder-per-branch" worktree feature on the roadmap. It introduces **new git
writes** (`git worktree add`/`remove`/`list`), expanding the current "git is read-only except
`checkout_branch`" rule (#27) — update CLAUDE.md accordingly.

**Creating a worktree (⌘⏎).** In the #66 branch step, **Enter** starts normally (in the repo
folder); **⌘⏎** starts in an **isolated worktree** for the selected branch. For now the branch
must be an **existing** local branch (branch *creation* options come as a later task). The
worktree folder is **app-managed** — created under an app-data location, e.g.
`…/worktrees/<repo-id>/<branch>/` (stable repo-id from the repo path + sanitized branch) — so
the user's repo dir stays clean. Backend: `git -C <repo> worktree add <app-path> <branch>`
(validate the branch exists, mirroring `checkout_branch`'s validation; surface git's error if
the branch is already checked out in the main repo or another worktree).

**Multiple agents per worktree.** A worktree is a shared isolated folder: **support more than
one agent in the same worktree**. ⌘⏎ for a (repo, branch) whose worktree already exists
**reuses** that folder (spawns another agent there) rather than failing. Track agents per
worktree (an agent's `repo_path`/cwd = the worktree path; the parent repo is resolvable via
`git -C <wt> rev-parse --git-common-dir` or `git worktree list`).

**Sidebar — nested under the parent repo.** A worktree (and its agents) shows **indented as a
child** of the original repository's group, not as a separate top-level repo. Render each
worktree as an **indented sub-group** under its parent repo (label = the worktree's branch +
an "isolated"/worktree marker — icon/badge/wording, building on the #67 label rule), with that
worktree's agent(s) nested under it. Multiple worktrees per repo and multiple agents per
worktree both render cleanly.

**Removal & cleanup (ref-counted).** Removing a worktree agent kills + forgets that agent.
**Only when the last active agent in a worktree is removed** does the app delete the worktree
(`git worktree remove`, with a **guard/confirm if it has uncommitted changes** → needs
`--force`); **never delete a worktree while one or more agents are still active in it**.
Forgetting a repo (#31) should also clean up its now-empty worktrees.

**Persistence / boot.** Worktree agents persist like normal sessions (record `repo_path` = the
worktree path, which survives on disk) and resume via `claude --resume` on boot; the
parent-repo nesting is re-derived from git. (Optionally store the parent-repo/worktree link on
the record for robustness.)

Out of scope (later tasks): creating a *new* branch for a worktree, choosing a custom worktree
location, and any worktree management UI beyond create/remove.

**Subtasks**

1. [x] Backend `git.rs`: add `worktree_add(repo, branch, dest)`, `worktree_remove(repo, dest,
   force)`, `worktree_list(repo)` (+ resolve a worktree's parent repo); validate the branch
   exists; return git's stderr on failure. New writes — note the rule change. _(Added
   `worktree_add` + `worktree_remove`; `worktree_list`/git parent-resolution omitted — the
   parent repo is stored on the session record instead, see subtask 6.)_
2. [x] App-managed location + IPC: compute the worktree path (`…/worktrees/<repo-id>/<branch>`);
   a command to create-or-reuse a worktree and spawn an agent in it (existing-branch only).
   _(`spawn_worktree_agent(repo, branch)`; path `<data-dir>/worktrees/<basename>-<hash>/<branch>`.)_
3. [x] Modal (#66): add **⌘⏎** in the branch step = start in an isolated worktree for the
   selected branch (Enter = normal start, unchanged); reuse an existing worktree for that
   (repo, branch). _(⌘⏎ in the branch list/filter + a "Worktree ⌘⏎" button.)_
4. [x] Sidebar: nest worktrees as indented sub-groups under the parent repo, each with isolated
   titling and its agent(s); support multiple worktrees/repo and multiple agents/worktree.
5. [x] Removal: ref-count active agents per worktree — remove the agent always; `git worktree
   remove` only when its last active agent goes (guard/confirm if dirty); extend Forget-repo
   (#31) to clean up its worktrees. _(Dirty guard = non-forced remove fails → worktree kept +
   warned, rather than a native confirm; Forget-repo force-removes its worktrees.)_
6. [x] Persistence/boot: worktree agents persist + resume in their worktree path; re-derive the
   parent-repo nesting on boot. _(Parent link stored on the record as `worktree_parent`, so
   nesting needs no git call on boot; resume uses the worktree `repo_path`.)_
7. [x] Docs: update CLAUDE.md (git is no longer read-only-except-checkout — worktree
   add/remove are new writes).

**Acceptance criteria**

- [x] In the modal's branch step, ⌘⏎ starts an agent in an isolated worktree on the selected
  existing branch (its own folder, separate checkout); plain Enter still starts in the repo
  folder.
- [x] The worktree agent appears indented under its parent repo in the sidebar, titled as an
  isolated instance (not as a separate top-level repo).
- [x] Starting a second agent on the same (repo, branch) reuses the same worktree folder;
  multiple agents can run in one worktree.
- [x] Removing an agent never deletes a worktree that still has another active agent; the
  worktree folder is removed only when its last active agent is removed (guard/confirm if it
  has uncommitted changes).
- [x] Worktree agents survive an app restart (resume in their worktree folder) and re-nest
  under the parent repo.

**Notes**

- **Dependency rule (from the requester):** this task depends on **all** tasks about the
  starting-session modal **and** worktrees. Currently: #65 (panel overlay), #66 (modal flow —
  hosts the ⌘⏎ keybind), #67 (session label rule — the worktree titling builds on it). **When
  any future task touches the starting-session modal or worktrees, add it to this task's
  `Depends on`.**
- Decisions (from the requester): app-managed worktree location; existing-branch-only for now
  (branch creation is a later task); ⌘⏎ trigger; remove the worktree on last-agent removal but
  never while agents are active; multiple agents per worktree fully supported.
- Coordinates with #68 (repo header) and #70 (Overview rendering) — not hard deps.
- Key code: `src-tauri/src/git.rs` (worktree ops next to `checkout_branch`),
  `src-tauri/src/commands.rs` + `pty.rs`/`store.rs` (create-worktree + spawn-in-worktree;
  ref-counted removal), `src/components/NewSessionModal/NewSessionModal.tsx` (⌘⏎ in the branch
  step), `src/components/Sidebar/Sidebar.tsx` (nested worktree sub-groups), `src/store.ts`
  (worktree-aware spawn + removal), `src/types/index.ts`, `CLAUDE.md` (git-writes rule).

---

### 75. [x] Remove Focus mode entirely (views become Overview + Canvas)

**Status:** Done · _(Not started | In progress | Blocked | Done)_
**Depends on:** none
**Created:** 2026-06-19

**Description**

Remove the **Focus view** and everything that navigates to it. Canvas mode supersedes it — a
single-agent Canvas is the same thing from the user's perspective — so Focus is obsolete. Do a
**clean removal: no dangling references** anywhere (code, state, persistence, keybinds, docs).
After this, the app has **two views: Overview and Canvas.**

Per the requester: **no replacement affordances** — the Overview card's "Expand to Focus"
button is removed (not repurposed), and the Focus keybind is removed with no Canvas
substitute. To focus one agent the user builds a Canvas (drag the agent in); Canvas is
reachable via the sidebar Overview/Canvas toggle.

**Keep `DiffInspector`** — it's shared by the diff-viewer panels in Overview (#39) and Canvas
(#47); only the Focus *inspector* (the resizable Diff/Files tab strip) is removed. Likewise
`FileViewer` stays (used by file panels everywhere); only the Focus "Files" tab entry point
goes (the searchable file picker #56 + sidebar remain the ways to open a file viewer).

**Removal checklist (touch points found):**
- **Component:** delete `src/components/Focus/` (Focus.tsx + Focus.module.css).
- **View type:** `View = "overview" | "focus" | "canvas"` → `"overview" | "canvas"`
  (`types/index.ts`).
- **App shell:** `App.tsx` — drop the `Focus` import + the `view === "canvas" ? <Canvas> :
  <Focus>` branch (render Overview or Canvas); fix comments (#12, "Overview↔Focus↔Canvas").
- **Store (`store.ts`):** remove `showFocus`, `toggleInspector`, `setInspectorOpen`,
  `inspectorOpen`, `setInspectorWidth`, `persistInspectorWidth`, `inspectorWidth`,
  `INSPECTOR_DEFAULT_WIDTH` + bounds, the `view: "focus"` set, and the boot load of
  `inspectorWidth`. Keep `selectedId`/`setView`/`view` (now only overview/canvas) and Overview
  selection.
- **ViewSwitch:** remove the "focus" option + `showFocus` call → a two-option Overview/Canvas
  toggle (`ViewSwitch.tsx`).
- **Overview:** remove the "Expand to Focus" button (`Maximize2`, `onExpand` →
  `setView("focus")`) and its prop/wiring (`Overview.tsx`).
- **Keybinds:** in `useKeyboardNav.ts` remove the Focus nav keybinds (Shift+↓ "focus selected
  agent" → `showFocus`, and the Shift+↑ "back to Overview" that only existed to return from
  Focus); keep agent navigation. Update the header comment.
- **IPC + backend:** remove `getInspectorWidth`/`setInspectorWidth` (`ipc.ts`), the matching
  Tauri commands (`commands.rs`, registration in `lib.rs`), and the `inspector_width` field +
  `inspector_width()`/`set_inspector_width()` + its test in `store.rs`. Old persisted
  `inspector_width` keys are ignored (serde default) — no migration needed.
- **Tests:** update `store.test.ts` (it sets `view: "focus"` / calls `showFocus`) and the
  `store.rs` inspector test.
- **Docs:** scrub Focus from `CLAUDE.md` and `README.md` (architecture, the three-views
  description, inspector, keybinds, layout/components list). The TASKS.md *Implemented* entries
  (#12/#37/#40/#51) are historical provenance — leave them (they point to git history), but
  remove any *live* "current behavior" Focus references.

Final sweep: grep for `focus`/`Focus`/`inspector`/`showFocus` (excluding DOM focus /
focus-visible / focusable / `.focus()`) and confirm nothing live remains.

Out of scope: changing Canvas; adding any new "open in Canvas" button or keybind (explicitly
not wanted).

**Acceptance criteria**

- [x] There is no Focus view: the app renders only Overview or Canvas; the sidebar toggle
  offers just those two.
- [x] The Overview "Expand to Focus" button is gone (cards keep select + Open-in-Zed + ×); no
  keybind navigates to Focus.
- [x] No `Focus` component, `"focus"` view value, `showFocus`/inspector state, or
  `inspector_width` command/persistence remains; `npm run build`, `npm run lint`, `npm test`,
  and `cargo test` pass.
- [x] `DiffInspector` and `FileViewer` still work in Overview and Canvas (diff/file panels
  unaffected).
- [x] CLAUDE.md and README no longer describe Focus as a current view; a `focus`/`inspector`
  grep finds no live references (only DOM-focus a11y usages).

**Notes**

- Decisions (from the requester): complete removal, no replacement — remove the Expand button
  (don't repurpose) and the Focus keybind (no Canvas substitute).
- `DiffInspector`/`FileViewer` are shared — do NOT delete them; only remove the Focus inspector
  that hosted them.
- Coordinates with open tasks that also touch Focus, which this deletes: **#67** (session label
  rule includes the Focus toolbar) and **#71** (activity indicator is repositioned in the Focus
  toolbar) — their Focus-specific parts become moot once this lands; **#70** edits the Overview
  card actions where the Expand button lives. Sequence/rebase to avoid wasted work (ideally land
  this before the Focus-touching parts of #67/#71).
- Key code: `src/components/Focus/*` (delete), `src/types/index.ts`, `src/App.tsx`,
  `src/store.ts`, `src/components/ViewSwitch/ViewSwitch.tsx`, `src/components/Overview/Overview.tsx`,
  `src/useKeyboardNav.ts`, `src/ipc.ts`, `src/store.test.ts`,
  `src-tauri/src/{store.rs,commands.rs,lib.rs}`, `CLAUDE.md`, `README.md`.

---

### 76. [x] Canvas keyboard navigation — Shift+arrows between panels, ⌘1–9 to jump canvases

**Status:** Done · _(Not started | In progress | Blocked | Done)_
**Depends on:** #75
**Created:** 2026-06-19

**Description**

Add keyboard navigation inside Canvas mode (#46/#58):
- **Shift+Arrow** moves the focused panel **spatially between the panels** in the current
  canvas (the BSP leaves) — Shift+→ goes to the panel on the right, etc.
- **⌘1–9** jumps directly to **canvas N** (the Nth tab). No prev/next chord (per the
  requester) and **only while the Canvas view is active**.

**Keybind research (why these are conflict-safe).** The hard constraint is that a panel often
hosts a focused `claude` TUI or shell with its own keybinds. On macOS, **Cmd (⌘) combos never
reach the terminal/PTY** — they're handled at the app layer — and the Claude Code TUI uses
**no ⌘+number / ⌘+arrow / ⌘+bracket** bindings (it leans on Ctrl-keys, Shift+Tab, Esc). So
**⌘1–9 is guaranteed safe** even over a focused claude session. The app's global key handler
already runs in the **capture phase with `stopPropagation`** (`useKeyboardNav.ts`), intercepting
before xterm forwards to the PTY — it already does this for Shift+Arrow (#24), so claiming
Shift+Arrow for panel nav in Canvas is consistent and safe (claude doesn't critically use
Shift+Arrow — it uses Shift+Tab/Shift+Enter). Sources: Claude Code keybind reference (via the
claude-code-guide) + macOS tab-switch conventions (Apple, Chrome/Safari).

**Context-sensitive Shift+Arrow.** Today Shift+←/→ = prev/next agent in Overview (#24), and
#75 removes the Shift+↑/↓→Focus bindings. Branch on the active view: in **Overview**, Shift+
arrows keep navigating agents; in **Canvas**, Shift+arrows navigate panels.

**Implementation notes.**
- **Focused-panel concept:** Canvas has no "active leaf" today. Add one (store state or
  per-canvas `activeLeafId`), highlight the focused panel (subtle border à la #50, on tokens),
  and on navigation **focus the panel's content** (e.g. call the xterm's focus) so keystrokes
  go there.
- **Spatial BSP navigation:** add a pure helper in `canvasTree.ts` that computes each leaf's
  rectangle from the tree + `sizes`, then picks the nearest leaf in the arrow direction
  (overlapping on the perpendicular axis). Wrap-around optional.
- **⌘1–9:** `selectCanvas(canvases[N-1])` when `view === "canvas"`; no-op if N exceeds the tab
  count.
- **Guards:** all of this lives in `useKeyboardNav.ts` (capture phase). Gate on
  `!newSessionOpen` so the new-session modal's own ⌘1–9 recents (#61/#66) and inputs aren't
  hijacked — coordinate with #66 (which is changing the modal's ⌘1–9 usage).

Out of scope: a prev/next canvas chord (chosen: jump-only); making canvas-switch global
(chosen: Canvas-view-only); reordering panels via keyboard.

**Subtasks**

1. [x] Add a focused/active Canvas leaf concept + a subtle highlight on the active panel; focus
   its content (xterm/etc.) when it becomes active. _(Store `activeLeafId` + `setActiveLeaf`;
   `.panelActive` accent frame; `focusTerminal` in the pool, called on activate + click.)_
2. [x] `canvasTree.ts`: pure helper to compute leaf rects from the tree+sizes and find the
   spatial neighbor in a given direction. _(`leafRects` + `spatialNeighbor`, unit-tested.)_
3. [x] `useKeyboardNav.ts`: in Canvas view, Shift+arrows = move focused panel spatially
   (Overview keeps agent nav); ⌘1–9 = jump to canvas N; capture-phase + `!newSessionOpen` guard.
4. [x] Verify no conflict with a focused claude/terminal (⌘1–9 never reaches the PTY;
   Shift+arrows intercepted before xterm). _(Capture-phase handler + stopPropagation, as #24.)_

**Acceptance criteria**

- [x] In Canvas, Shift+←/→/↑/↓ move the focused panel to the spatially adjacent panel; the
  active panel is highlighted and receives subsequent keystrokes.
- [x] In Canvas, ⌘1 … ⌘9 jump to the 1st … 9th canvas tab (no-op past the tab count); active
  only in Canvas view.
- [x] With a `claude` session focused in a panel, ⌘1–9 still switches canvases (doesn't reach
  claude) and Shift+arrows still move panels (don't reach claude).
- [x] In Overview, Shift+←/→ still navigate agents (unchanged); the new-session modal's keys
  aren't hijacked.

**Notes**

- Decisions (from the requester, after research): panel nav = Shift+Arrow; canvas switch =
  ⌘1–9 jump only (no prev/next chord); active only in Canvas view.
- Depends on #75 (Focus removal) — it edits the same `useKeyboardNav.ts` and frees Shift+↑/↓;
  build the Canvas branch on the cleaned-up handler.
- Coordinate with #66 (new-session modal ⌘1–9 recents) — the `!newSessionOpen` guard keeps
  them separate.
- Key code: `src/useKeyboardNav.ts` (view-branched Shift+arrows + ⌘1–9),
  `src/components/Canvas/Canvas.tsx` (active-leaf highlight + content focus),
  `src/components/Canvas/canvasTree.ts` (spatial neighbor helper), `src/store.ts`
  (`selectCanvas`, `canvases`/`activeCanvasId`, active-leaf state).

---

### 77. [x] Keybind to toggle between Overview and Canvas (⌘\)

**Status:** Done · _(Not started | In progress | Blocked | Done)_
**Depends on:** #75
**Created:** 2026-06-19

**Description**

Add a keyboard shortcut — **⌘\ (Cmd+Backslash)** — that toggles the main view between
**Overview** and **Canvas**. After #75 removes Focus, those are the only two views, so one key
flipping between them is the natural keyboard equivalent of the sidebar Overview/Canvas toggle
(`ViewSwitch`, #25).

Implement in the global handler (`useKeyboardNav.ts`, capture phase): on ⌘\,
`setView(view === "overview" ? "canvas" : "overview")`. It's ⌘-based, so it never reaches a
focused `claude`/terminal (and the capture-phase `stopPropagation` keeps it off xterm), and it
doesn't collide with the existing ⌘N (#26) or the Canvas ⌘1–9 / Shift+arrows (#76). Don't fire
while the new-session modal is open (`!newSessionOpen` guard), matching the other shortcuts.

Out of scope: any third view (Focus is gone); changing the sidebar ViewSwitch itself (this is
just its keyboard equivalent).

**Acceptance criteria**

- [x] Pressing ⌘\ from Overview switches to Canvas, and from Canvas switches to Overview.
- [x] It works with a `claude` session focused in a terminal (the chord is intercepted before
  xterm; claude never sees it).
- [x] No conflict with ⌘N or the Canvas ⌘1–9 / Shift+arrow bindings; it's inert while the
  new-session modal is open.

**Notes**

- Decision (from the requester, after keybind research): ⌘\ as a single toggle between the two
  views.
- Depends on #75 (Focus removal) — only then is the app a clean two-view (Overview/Canvas)
  toggle; #75 also edits the same `useKeyboardNav.ts`.
- Coordinate with #76 (Canvas ⌘1–9 + Shift+arrows in the same handler) — ⌘\ is chosen to avoid
  those.
- Key code: `src/useKeyboardNav.ts` (add the ⌘\ branch), `src/store.ts` (`setView`, `view`),
  `src/components/ViewSwitch/ViewSwitch.tsx` (mouse equivalent, for parity).

---

### 78. [x] Reduce terminal line height (xterm `lineHeight` 1.5 → ~1.2)

**Status:** Done · _(Not started | In progress | Blocked | Done)_
**Depends on:** none
**Created:** 2026-06-19

**Description**

The terminals (the xterm.js panes running `claude`) have too much vertical space between
lines. The terminal pool sets `lineHeight: 1.5` in the xterm config (`terminalPool.ts`,
`createHost`, alongside `fontSize: 12.5`), which reads as too tall. Reduce it to a tighter,
still-readable value — **~1.2** (tune to taste, e.g. 1.2–1.3) — so each line takes less
vertical room.

This is the single shared xterm config, so it applies to **all** pooled terminals (every agent
terminal, and the shell terminal #72 when it lands). Keep the font size (12.5px) unchanged —
only the line height changes. Update the design-reference note in TASKS.md ("terminal
12.5px/1.5") to the new value.

After the change, sanity-check that `claude`'s TUI still renders cleanly (cursor alignment,
box-drawing, no clipped glyphs or overlap) at the tighter line height.

**Acceptance criteria**

- [x] Terminal lines are visibly tighter than before (xterm `lineHeight` reduced from 1.5 to
  ~1.2), across Overview and Canvas terminals.
- [x] Text stays readable and `claude`'s TUI renders correctly (cursor, box-drawing, no
  overlap/clipping).
- [x] Font size unchanged; the design-reference line-height note is updated to match.

**Notes**

- Key code: `src/components/Terminal/terminalPool.ts` (`createHost` — `lineHeight: 1.5` at
  ~line 93), and the "terminal 12.5px/1.5" note in `TASKS.md` (design reference).

---

### 79. [x] Unified, view-aware sidebar item click — select/jump without switching views

**Status:** Done · _(Not started | In progress | Blocked | Done)_
**Depends on:** #76
**Created:** 2026-06-19

**Description**

Make clicking **any** sidebar item behave consistently and **respect the current view** —
never auto-switching between Overview and Canvas. Today agent rows just `select(id)` (no view
change), but file/diff rows force `setView("overview")` on click (`Sidebar.tsx` FileRow/DiffRow
`onOpen`), and only agents have a selection concept. Unify all item kinds (agents, file
viewers, diff viewers — and terminals #72 when present) under one "select/jump to this item"
behavior that depends on the active view:

- **No auto-switch.** Clicking a sidebar item must **not** change the current view. Remove the
  `setView("overview")` from the file/diff (and future terminal) row handlers. Switching
  Overview↔Canvas stays the user's choice (sidebar toggle / ⌘\ #77).
- **In Overview:** clicking an item **selects it and scrolls its Overview column into view**
  (highlighted). Generalize the agent selection highlight (#23/#50) to **all** item types
  (file/diff/terminal columns get the same selected treatment).
- **In Canvas:** clicking an item →
  - if that item is present in the **currently-shown canvas tab** → **jump to it**: focus/select
    the panel showing it (the active-leaf from #76) and reflect it as the sidebar selection.
  - if it's **not** present in the current canvas → show a brief toast **"Item not present in
    canvas — drag to add"** and **deselect** the sidebar selection (don't switch views, don't
    switch tabs).

So the sidebar's selected highlight tracks: in Overview, the item you jumped to; in Canvas, the
item focused in the current canvas (or nothing, if you clicked a non-present item).

**Model.** Generalize `selectedId` (currently a session id) to a **selected sidebar item** that
can be any item id (session id or panel id). Overview's `selected={id === selectedId}` and the
sidebar row highlight extend to every item kind. Presence-in-canvas = the item appears in the
**active** canvas tab's layout only (a match in another tab counts as "not present," per
"currently shown" + no auto-switch).

**Subtasks**

1. [x] Generalize selection: a `selectedItemId` covering agents + panels (file/diff/terminal);
   sidebar highlights the selected row for every item kind. _(Broadened `selectedId` to any
   item id; `.fileRowSelected` for file/diff/terminal rows; ExtraPanel gets `selected`.)_
2. [x] Remove `setView("overview")` from the file/diff (and future terminal) sidebar click
   handlers — clicking never changes the view.
3. [x] Overview: clicking an item selects it + scrolls its column into view; extend the
   selected-column highlight to file/diff/terminal columns. _(`data-item-id` + a
   scroll-into-view effect on `selectedId`.)_
4. [x] Canvas: clicking an item focuses its panel if present in the active canvas (via #76's
   active-leaf); else toast "Item not present in canvas — drag to add" and clear selection.
   Never switch view or tab. _(`selectItem` + `matchesCanvasItem`.)_
5. [x] Keep the sidebar selection in sync with the canvas's focused panel (and clear it
   appropriately). _(`moveCanvasFocus`/`setActiveLeaf` set `selectedId` via `leafItemId`.)_

**Acceptance criteria**

- [x] Clicking any sidebar item (agent, file, diff, terminal) selects/jumps to it without ever
  changing the current view.
- [x] In Overview, the clicked item's column is highlighted and scrolled into view, for every
  item kind (not just agents).
- [x] In Canvas, clicking an item that's in the current canvas focuses its panel; clicking one
  that isn't shows the "Item not present in canvas — drag to add" toast and deselects — with no
  view/tab switch.
- [x] Overview↔Canvas switching only happens via the user (sidebar toggle / ⌘\), never as a
  side effect of clicking a sidebar item.

**Notes**

- Decisions (from the requester): standard behavior for every item kind; view-aware; never
  auto-switch views; Canvas → jump-if-present else toast "Item not present in canvas — drag to
  add" + deselect.
- Depends on **#76** for the Canvas focused-panel (active-leaf) concept used by "jump to the
  item inside the canvas." Generic across item kinds, so #72 terminals get it for free (not a
  hard dep). Builds on #59 (unified sidebar items) and #47 (Canvas content) — both shipped.
- Key code: `src/components/Sidebar/Sidebar.tsx` (`SessionRow` onSelect, `FileRow`/`DiffRow`
  onOpen — drop `setView`; unify selection), `src/store.ts` (`select`/`selectedId` →
  generalized selected item; toast), `src/components/Overview/Overview.tsx` (selected highlight
  + scroll-into-view for all columns), `src/components/Canvas/Canvas.tsx` + `canvasTree.ts`
  (find the leaf for an item id; focus it via #76's active-leaf).

---

### 80. [x] Diff viewer — wrap long lines to fit width (no horizontal scroll)

**Status:** Done · _(Not started | In progress | Blocked | Done)_
**Depends on:** none
**Created:** 2026-06-19

**Description**

In the diff viewer (`DiffInspector`, #13/#39/#47), long lines currently render with
`white-space: pre` and overflow horizontally, forcing the user to scroll right to read them.
Instead, **soft-wrap** overflowing lines to the next visual line so the content fits the
available width — keeping the **single line number** in the gutter (the wrapped continuation
has no extra number).

Apply to **both** the **unified** and **split** views (`UnifiedRow` / `SplitRow`). It's a CSS
change in `DiffInspector.module.css`:
- The line **content** (`.content` / `.code`, currently `white-space: pre`) →
  **`white-space: pre-wrap`** (preserves code indentation + spaces while wrapping at the edge)
  plus **`overflow-wrap: anywhere`** (so very long unbroken tokens — minified lines, long URLs
  — also wrap).
- The diff **rows** (`.line`, `.splitLine` / `.splitCell`, currently `align-items: center`) →
  **`align-items: flex-start`** so the gutter line number sits at the **top** of a wrapped (now
  taller) line, not vertically centered.
- The diff **body** (`.body`, currently `overflow: auto`) → drop the horizontal scroll
  (`overflow-x: hidden`, keep `overflow-y: auto`) now that lines wrap.
- In **split** view, each side's content wraps within its half-width; the paired old/new cells
  of a row top-align (flex-start) so they stay readable.

Keep tab rendering and the add/del/context coloring unchanged; only the wrapping/alignment
changes.

Out of scope: a wrap/no-wrap toggle (always wrap, per the request); the file viewer's code/raw
rendering (#64 covers that surface separately).

**Acceptance criteria**

- [x] In the diff viewer, a line longer than the panel width wraps to the next visual line and
  fits within the width — no horizontal scrollbar / no scrolling right to read it.
- [x] The wrapped line keeps its single gutter line number, top-aligned to the first visual
  row; continuation rows have no extra number.
- [x] Works in both unified and split views; code indentation/whitespace is preserved
  (pre-wrap) and very long tokens still wrap (overflow-wrap).
- [x] Add/del/context colors, gutter, and tab rendering are otherwise unchanged; the viewer
  behaves the same in Overview diff columns and Canvas diff panels.

**Notes**

- `DiffInspector` is shared by Overview diff columns (#39) and Canvas diff panels (#47) — one
  CSS change covers both. (#75 removes the Focus inspector that also hosted it, but
  DiffInspector itself is unaffected.)
- Key code: `src/components/DiffInspector/DiffInspector.module.css` (`.content`/`.code`
  `white-space`, `.line`/`.splitLine`/`.splitCell` `align-items`, `.body` overflow),
  `src/components/DiffInspector/DiffInspector.tsx` (`UnifiedRow`/`SplitRow` — gutter + content
  spans).

---

### 81. [x] Diff viewer — branch-compare mode (two-dot `git diff base target`)

**Status:** Done · _(Not started | In progress | Blocked | Done)_
**Depends on:** none
**Created:** 2026-06-19

**Description**

Add a **branch-compare mode** to the existing diff viewer (`DiffInspector`, #13/#39/#47).
Today it always shows the **working tree vs HEAD** (`working_diff`). Add a **source toggle** so
the same viewer can instead **compare two branches head-to-head**, rendering the result in the
identical diff body (file list + unified/split + #80 wrapping). Only the source of the diff
changes; the look is the same.

- **Source toggle:** "Working tree" (current, vs HEAD, with the #29 auto-refresh) ↔
  **"Compare"** (branch base vs target).
- **Compare-mode UI:** two branch selectors — **base** and **target** — populated from
  `list_branches(repoPath)` (the existing `listBranches` IPC; reuse the #66 picker patterns /
  priority sort if handy). Picking branches loads the comparison.
- **Comparison:** **two-dot `git diff <base> <target>`** (per the requester — the full
  head-to-head difference between the two branch tips). Oriented base → target (what target has
  relative to base).
- **Backend:** add `compare_branches(cwd, base, target)` in `git.rs` — **validate both branches
  exist** (via `list_branches`, mirroring `checkout_branch`, so the IPC boundary can't pass
  arbitrary refspecs), run `git -C cwd diff <base> <target> --no-color --no-ext-diff -c
  core.quotepath=false`, **reuse `parse_unified_diff`**, return the same `WorkingDiff` shape
  (summary labeled "base → target", counts like `working_diff`). New Tauri command +
  `compareBranches` IPC wrapper.
- **Refresh:** compare mode reloads on branch-selection change and via the existing Refresh
  button; the working-tree poll (#29) stays for working-tree mode (compare needn't poll
  aggressively — branches change only on new commits).
- **Persistence:** persist the source mode + chosen base/target on the diff panel (extend the
  `diff` `OverviewPanel` with optional compare fields) so a configured compare view survives
  view switches / restart, rather than resetting like the ephemeral unified/split toggle.

**Defaults:** Compare mode defaults base = the repo's current branch, target = its default
branch (`main`/`master`) if present, else target unset until picked.

Reuses the whole diff rendering pipeline — file list, unified/split, gutters, colors, and the
#80 line-wrapping — so a branch compare looks identical to the working-tree diff.

Out of scope: three-dot/merge-base comparison (chosen: two-dot); comparing arbitrary
commits/tags/remotes (local branches only for now); a separate compare *item* (chosen: a toggle
in the existing diff viewer).

**Subtasks**

1. [x] Backend: `compare_branches(cwd, base, target)` in `git.rs` (validate both branches;
   `git diff base target`; reuse `parse_unified_diff`; `WorkingDiff` out) + Tauri command +
   `compareBranches` IPC wrapper.
2. [x] DiffInspector: add a Working-tree↔Compare source toggle; in Compare mode show base/target
   branch selectors (from `listBranches`) and fetch `compareBranches` via the generalized
   `load`.
3. [x] Reuse the existing body (file list, unified/split, #80 wrapping); summary shows
   "base → target" + counts.
4. [x] Refresh on branch change + manual Refresh; keep #29 polling for working-tree mode only.
5. [x] Persist source mode + base/target on the diff panel (extend the `diff` OverviewPanel;
   `types/index.ts` + `store.rs`).

**Acceptance criteria**

- [x] The diff viewer has a Working-tree / Compare source toggle; Compare mode shows base +
  target branch pickers from the repo's local branches.
- [x] Selecting two branches loads `git diff base target` (two-dot) and renders it in the same
  diff body (file list + unified/split + wrapped lines), with the summary showing base → target
  + counts.
- [x] Working-tree mode is unchanged (vs HEAD, auto-refreshing #29); switching back and forth
  works.
- [x] The chosen compare mode + branches persist across view switches and an app restart.
- [x] Unknown branches are rejected backend-side; a clear empty/error state shows if the
  compare can't be produced.

**Notes**

- Decisions (from the requester): toggle inside the existing diff viewer (not a new item);
  two-dot `git diff base target` (head vs head).
- Reuses `working_diff`'s parser + `list_branches` + the DiffInspector body — all shipped;
  shares `DiffInspector` with #80 (line wrapping) — coordinate/rebase.
- Key code: `src-tauri/src/git.rs` (`compare_branches` next to `working_diff`/`checkout_branch`;
  `parse_unified_diff` is reusable), `src-tauri/src/commands.rs` + `lib.rs` (command),
  `src/ipc.ts` (`compareBranches`), `src/components/DiffInspector/DiffInspector.tsx` (source
  toggle + branch pickers + generalized `load`), `src/types/index.ts` + `src-tauri/src/store.rs`
  (persist compare fields on the `diff` panel).

---

### 82. [x] Repo context menu — a dedicated "Views" section listing every addable view

**Status:** Done · _(Not started | In progress | Blocked | Done)_
**Depends on:** #72
**Created:** 2026-06-19

**Description**

In the **folder/repo context menu** (sidebar, `Sidebar.tsx`), group the "add a viewer to this
repo" actions into one clearly-labeled **"Views" section** so the user can see every available
view type at a glance and click to add it. Today these actions are flat and mixed in (the
default menu is: New session · Open diff viewer · Open file viewer… · Change color… · Forget).

Restructure the default menu into clear sections:
- **New session** stays its own prominent first item (#54) — agents are separate, not part of
  Views (per the requester).
- **Views** (labeled section header) — one button per **addable, non-agent view type**, each
  adding that view to the repo (it then shows as an Overview column, a sidebar row, and is
  draggable into a Canvas, #59):
  - **File viewer** → the searchable file picker (#56) → file column (#44)
  - **Diff viewer** → the repo diff column (#39)
  - **Terminal** → a shell terminal item (#72)
  - …and any future addable view type joins this section.
- **Change color…** and **Forget** (danger) stay as the existing trailing/destructive actions.

Each Views button should be clearly labeled (a Lucide icon + name) so the available views are
obvious. The section should be **driven by a single list of view types** (a small
registry/array — kind + label + icon + add-action) so adding a new view kind in future is a
one-line addition here, not a scattered edit.

Coordinate with #79 ("swapping views is up to the user"): **adding a view from this menu should
not force a main-view switch** — it creates the item (visible in the sidebar/Overview,
draggable to Canvas); the user switches views themselves. (Today the diff/file actions call
`setView("overview")`; align them with #79's no-auto-switch rule.)

Out of scope: agents/New session (kept separate); the compare *mode* (#81 — a toggle inside the
diff viewer, not an addable view); a Canvas-native "add view" menu.

**Subtasks**

1. [x] Add a "Views" section header in the default repo menu (`Sidebar.tsx` menu render) above
   the view-adding buttons; keep New session first and color/Forget trailing.
2. [x] Drive the Views buttons from a single list/registry of addable view types (kind + label
   + icon + add-action), so File/Diff/Terminal (and future kinds) render uniformly.
3. [x] Wire each: File viewer → file picker (`menuMode "files"`), Diff viewer →
   `addOverviewPanel(repo, "diff")`, Terminal → add terminal item (#72).
4. [x] Don't force a view switch on add (drop the `setView("overview")`), aligning with #79.

**Acceptance criteria**

- [x] The repo context menu has a clearly-labeled "Views" section listing every addable view
  type (File viewer, Diff viewer, Terminal) as one-click buttons with icons.
- [x] Clicking a view button adds that view to the repo (appears in the sidebar + Overview,
  draggable to Canvas) without forcing a main-view switch.
- [x] New session stays a separate first item; Change color / Forget stay as the
  trailing/destructive actions.
- [x] Adding a new addable view kind in future is a single-entry addition to the Views registry
  (no scattered menu edits).

**Notes**

- **Dependency rule (from the requester):** this task depends on **all tasks that create a new
  addable view type** (shown in Overview / draggable into Canvas). Currently: **#72** (terminal).
  **When any future task adds a new view kind, add it to this task's `Depends on`** (and to the
  Views registry). The compare mode #81 is not a new view (it's a toggle in the diff viewer), so
  it's not a dependency.
- Decision (from the requester): New session stays separate (not in Views).
- Coordinate with #79 (no auto view-switch on click) — apply the same to adding from this menu.
- Key code: `src/components/Sidebar/Sidebar.tsx` (repo context menu, the `menuMode "menu"`
  branch + `addOverviewPanel`; add a Views registry/section), `src/components/Sidebar/Sidebar.module.css`
  (section-header style; reuse `menuSeparator`), `src/components/FilePicker/FilePicker.tsx` (file
  viewer path), and the terminal-add action from #72.

---

### 83. [x] More subtle toasts — confirm closing views and canvas add/close/rename

**Status:** Done · _(Not started | In progress | Blocked | Done)_
**Depends on:** none
**Created:** 2026-06-19

**Description**

Several everyday actions currently happen silently; add a **small, low-key confirmation toast**
to each, reusing the existing toast system (`pushToast`, `info` tone, bottom-right #32 — **no
new visual variant** per the requester; the existing info toast is the "easy on the eyes"
baseline). Cover the actions the requester named plus their obvious siblings:

- **Close a view** (`removeOverviewPanel`) — file viewer, diff viewer, **and** terminal (#72)
  — e.g. "Closed <filename>" / "Closed diff viewer" / "Closed terminal". (Today only agents
  toast on close via "Session removed"; this extends a close-toast to **all** view kinds.)
- **Add a view** (`addOverviewPanel`) — e.g. "Opened <filename>" / "Opened diff viewer" /
  "Opened terminal".
- **Create a canvas** (`addCanvas`) — e.g. "Canvas created".
- **Close a canvas** (`closeCanvas`) — e.g. "Canvas closed".
- **Rename a canvas** (`renameCanvas`) — e.g. "Canvas renamed".

Skip noisy/continuous actions (drag-reorder of panels or canvas tabs, view switching, repo
color change). Keep messages short and consistent.

**Avoid toast spam on compound actions:** bulk operations that already toast once must not also
fire a per-item toast — e.g. **Forget repo** (#31) removes a repo's agents + panels and toasts
once; the new panel-close toast must fire only on a user's **direct** single close (the × on a
row/column), not during forget. Reuse the existing one-toast-per-action discipline (the
`intentionalKills` / #32 suppression pattern). For a deduped add (#59 — the file/diff already
open), don't double-toast (skip or a gentle "already open").

Out of scope: a new toast tone/visual (reuse info per the requester); toasting every action
(chosen: the named set + siblings); changing the toast position/TTL system.

**Subtasks**

1. [x] `removeOverviewPanel` → toast a kind-aware "Closed …" on a direct user close; suppress
   during bulk forget (#31).
2. [x] `addOverviewPanel` → toast "Opened …" on an actual add (not on a deduped no-op).
3. [x] `addCanvas` / `closeCanvas` / `renameCanvas` → toast "Canvas created / closed / renamed".
4. [x] Keep messages short + consistent; reuse the `info` tone (no new variant).

**Acceptance criteria**

- [x] Closing any view (file / diff / terminal) shows a brief toast; closing is no longer
  silent for non-agent views.
- [x] Adding a view, and creating / closing / renaming a canvas each show a brief toast.
- [x] Bulk Forget-repo still shows a single toast (no per-panel spam); a deduped re-add doesn't
  double-toast.
- [x] Toasts use the existing info style + bottom-right placement; noisy actions (reorder, view
  switch, color) don't toast.

**Notes**

- Decisions (from the requester): cover close-view + add-view + canvas add/close/rename (named
  examples + siblings); reuse the existing info toast style (no new tone).
- Generic across view kinds, so #72 terminals and the #82 "Views" add-actions get these toasts
  for free (not hard deps).
- Key code: `src/store.ts` (`removeOverviewPanel`, `addOverviewPanel`, `addCanvas`,
  `closeCanvas`, `renameCanvas`, `pushToast`, the `intentionalKills` / #32 suppression),
  `src/components/Toaster/*` (existing styling — unchanged).

---

### 84. [ ] Open a canvas in its own window (multi-monitor) — pop-out button + drag tear-off

**Status:** Not started · _(Not started | In progress | Blocked | Done)_
**Depends on:** #76
**Created:** 2026-06-19

**Description**

Let the user **open a Canvas tab (#58) in its own native window**, so they can put a different
canvas on each monitor. Triggered two ways (per the requester): a **pop-out button/menu** on the
tab (reliable) **and** a **drag-the-tab-out tear-off** gesture (browser-style). The
canvas-jump keybind (⌘1–9, #76) should **focus the detached window** if that canvas has been
popped out. Detached windows are **per-session** (not remembered across restarts).

**This reverses the v1 "no multi-window" decision** (CLAUDE.md) — update the docs.

**Research conclusions (Tauri 2):**
- Multi-window is natively supported — `WebviewWindow` (JS) / `WebviewWindowBuilder` (Rust),
  `set_focus()` to raise a window (use it for the ⌘-jump-to-detached-canvas), and positioning
  for multi-monitor placement. Requires the `core:webview:allow-create-webview-window`
  capability. (Sources: Tauri WebviewWindow API; "Creating Windows in Tauri".)
- **Tab tear-off (drag a tab out to spawn a window) is NOT native** to Tauri — HTML drag-drop
  doesn't cross window bounds; it's a known feature request. So implement the **button first**
  (reliable), then the tear-off as a **custom** gesture (track the pointer past the window edge
  via Tauri window/cursor position; on release outside, create the window there and remove the
  tab from the main strip). Flag tear-off as the fragile/higher-effort part. (Sources:
  tauri#3906, wry#648.)
- **Terminals can't move across windows** — xterm instances are per-document (the #18 pool
  lives in one window's DOM). A detached canvas must render its agents in the **new window's own
  terminal pool**, connected to the **same backend PTYs** (`SessionManager` is shared) via Tauri
  events. A single `claude` PTY should render in **one window at a time** (the #18 width/TUI
  constraint): popping out = dispose those terminals in the main window and create + replay
  scrollback in the new window (and the reverse on re-dock); `resize_pty` is driven by whichever
  window currently shows the terminal.

**Pieces:**
- **Secondary window** = a **canvas-only** view (the BSP layout + tab name, minimal chrome — no
  sidebar/Overview), reusing the Canvas renderer; loaded via a param/route (e.g.
  `?canvas=<id>`) with a unique window label (`canvas-<id>`).
- **Cross-window state sync:** the canvas layout + session list must stay consistent across
  windows — route mutations through the backend and broadcast change events (Tauri events) so
  every window updates (or each window re-reads on the relevant event). (Largest architectural
  lift.)
- **Window↔canvas registry (backend):** track which canvas lives in which window so ⌘-jump can
  `set_focus()` the right window, and the main tab strip can mark a canvas as "detached."
- **⌘-jump (#76) integration:** ⌘N where canvas N is detached → `set_focus()` its window instead
  of switching the main view.
- **Main tab strip:** a detached canvas's tab shows it's in a window (grayed / "in window"
  marker); **closing the detached window re-docks** the canvas back into the main strip.
- **No persistence:** detached windows close on quit; relaunch starts single-window (all
  canvases in the main window).

Out of scope: persisting detached windows across restarts (per-session, chosen); popping out
Overview or individual panels (canvases only); showing the same PTY in two windows at once.

**Subtasks**

1. [ ] Capability + window creation: add `core:webview:allow-create-webview-window`; create a
   `WebviewWindow` rendering a **canvas-only** route for a given canvas id (unique label);
   focus it if it already exists.
2. [ ] Pop-out **button** (+ context-menu item) on the Canvas tab (`CanvasTabs`, #58) → open /
   focus that canvas's window.
3. [ ] Per-window terminals: the detached window has its own terminal pool subscribing to the
   shared PTYs' events; the main window stops rendering those agents (one PTY → one window;
   dispose+replay on move/re-dock); `resize_pty` from the showing window.
4. [ ] Cross-window state sync (mutations via backend + broadcast events) + a window↔canvas
   registry; mark detached canvases in the main tab strip; re-dock on window close.
5. [ ] ⌘-jump (#76): focus the detached window when its canvas is targeted.
6. [ ] Drag **tear-off**: dragging a tab out of the window spawns its window at the drop
   location (custom; build after the button works). Flag as fragile per the research.
7. [ ] Docs: update CLAUDE.md (no longer single-window-only).

**Acceptance criteria**

- [ ] A canvas tab can be opened in its own window via a pop-out button (and via dragging the
  tab out); it renders that canvas (BSP layout + live agents) in the new window.
- [ ] Two canvases can be shown on two monitors simultaneously, each interactive; an agent's
  terminal works in the detached window (typing/output) and is not double-rendered in the main
  window.
- [ ] ⌘N for a detached canvas focuses its window (raises it) rather than switching the main
  view; the main tab strip marks the canvas as detached.
- [ ] Closing a detached window re-docks its canvas into the main window; state stays consistent
  across windows (closing a panel in one reflects everywhere).
- [ ] Detached windows are not restored on relaunch (per-session); the app still builds/lints
  and CLAUDE.md no longer says single-window-only.

**Notes**

- Decisions (from the requester, after research): both a pop-out button and drag tear-off;
  per-session (no persistence); ⌘-jump focuses a detached canvas's window.
- Depends on **#76** (the ⌘1–9 canvas-jump this extends to `set_focus` a detached window).
  Coordinate with #77 (⌘\ view toggle — inert in a canvas-only secondary window) and #79
  (sidebar click → canvas focus should focus the detached window when its canvas is popped out).
- Big architectural change (multi-window + per-window terminal pools + cross-window state) and a
  reversal of the v1 single-window rule — likely the largest task in the backlog; consider
  phasing (button + core multi-window first; tear-off second).
- Key code: `src-tauri/tauri.conf.json` + `capabilities/` (window-create permission),
  `src-tauri/src/lib.rs` (window management, event targeting), `src/components/Canvas/*`
  (canvas-only window view, `CanvasTabs` pop-out + tear-off), `src/components/Terminal/terminalPool.ts`
  (per-window pool), `src/ipc.ts` / `src/outputBus.ts` (per-window event routing), `src/store.ts`
  (cross-window sync, window↔canvas registry), `src/useKeyboardNav.ts` (⌘-jump → focus window),
  `CLAUDE.md` (multi-window).

---

### 85. [ ] Canvas tab — make the × close button slightly bigger

**Status:** Not started · _(Not started | In progress | Blocked | Done)_
**Depends on:** none
**Created:** 2026-06-19

**Description**

The × close button on a Canvas tab (#58) is a little small / hard to hit. Make it **slightly
bigger**. It's `.tabClose` in `Canvas.module.css` (currently `width`/`height: 16px`) holding a
`<X size={12}>` icon (`CanvasTabs.tsx`). Bump both modestly — e.g. the hit area to ~18–20px and
the icon to ~14px (tune to taste; keep it *slightly* bigger, not dominating — the tab's add (+)
button is 24px for reference). Keep the existing hover treatment, tokens, and alignment within
the tab.

Out of scope: other × buttons (sidebar row remove, panel close, Overview card ×) — only the
Canvas tab close.

**Acceptance criteria**

- [ ] The Canvas tab's × close button is visibly a bit larger and easier to click (bigger hit
  area + icon) than before, without overwhelming the tab.
- [ ] Only the Canvas tab close changes; hover / alignment / tokens preserved.

**Notes**

- Key code: `src/components/Canvas/Canvas.module.css` (`.tabClose`, ~line 86 — `width`/`height:
  16px`), `src/components/Canvas/CanvasTabs.tsx` (the `<X size={12}>` icon, ~line 100).

---

### 86. [ ] Keep the "copy resume command" button on agents in Overview & Canvas (post-Focus)

**Status:** Not started · _(Not started | In progress | Blocked | Done)_
**Depends on:** #75
**Created:** 2026-06-19

**Description**

#28 added a button that copies a `claude --resume <session-id>` command, and it lived in the
**Focus toolbar** — which **#75 removes**. Re-home that button so it stays available on **every
agent (claude session)** in **Overview** (the agent card header) and **Canvas** (the agent
panel header).

The copy logic itself **survives #75**: the store action `copyToClipboard(text, label)`
(`store.ts`) and `resumeSession` remain — only the Focus *button* is gone. So this task just
adds the button to the agent headers, calling the same action with `claude --resume
${session.id}` (label "resume command"), the `<Copy>` Lucide icon, the title "Copy resume
command (claude --resume <id>)", and the existing "Copied resume command" toast.

Add it to:
- **Overview** `SessionCard` actions (next to Open in Zed / Remove; the Expand-to-Focus button
  there is removed by #75).
- **Canvas** agent panel header.

Only **agent** terminals get it (a claude session with a resumable id) — not file/diff/terminal
viewer items (no session id to resume).

Out of scope: changing what's copied (#28's `claude --resume <id>` format stays); non-agent
items; the copy action implementation (reuse as-is).

**Acceptance criteria**

- [ ] Every agent in Overview (card header) and Canvas (panel header) has a copy button that
  copies `claude --resume <that session's id>` and toasts "Copied resume command".
- [ ] Non-agent items (file/diff/terminal viewers) do not show it.
- [ ] Reuses the existing `copyToClipboard` store action (no duplicate copy logic); icon/title
  match #28.

**Notes**

- Depends on #75 (which removes the Focus toolbar that hosted this button); the
  `copyToClipboard` / `resumeSession` store actions survive #75 — this task only re-adds the
  button to the agent headers.
- Coordinate with #70 (Overview header drag), #71 (busy-indicator placement), #67 (agent
  labels) — all touch the same agent-card header/actions; and with the Canvas agent panel header.
- Key code: `src/components/Overview/Overview.tsx` (`SessionCard` `actions`),
  `src/components/Canvas/Canvas.tsx` (agent panel header actions), `src/store.ts`
  (`copyToClipboard` — reuse); reference the removed `Focus.tsx` (lines ~190–202) for the exact
  button (Copy icon, `claude --resume ${id}`, "resume command").

---

### 87. [ ] Remove the "Open in Zed" button + its logic entirely (UI + IPC + backend)

**Status:** Not started · _(Not started | In progress | Blocked | Done)_
**Depends on:** none
**Created:** 2026-06-19

**Description**

ClaudeCue has an **"Open in Zed"** button (an `ExternalLink` icon) that shells out to the
Zed editor to open a session's repo folder. It's unused and unwanted — **remove it
completely**: the button from the UI **and** all of its supporting logic, front to back, so
nothing dangling remains. This is a pure deletion (no replacement editor, no relocation).

The feature spans the **full stack** and all of it goes:
- **UI buttons (2 surfaces):** the **Overview** agent-card action button (`SessionCard`) and
  the **Focus** toolbar button — both call into the store's `openInZed`.
- **Frontend logic:** the store action `openInZed` (interface + impl, including the "Could not
  open Zed" error toast) and the typed IPC wrapper `openInEditor`.
- **Backend logic:** the Tauri command `open_in_editor` (its `#[tauri::command]` + the
  registration in `lib.rs`'s `invoke_handler`) and the `pty::open_in_editor` function that
  spawns `zed`.
- **Orphaned imports:** the `ExternalLink` Lucide import in both `Overview.tsx` and `Focus.tsx`
  (used **only** by these buttons — remove them so no unused import remains).

**Keep (shared — do NOT remove):** the Rust helpers `find_on_path` and `is_executable` and the
`SessionError::BinaryNotFound` variant. They look like they belong to this feature but are
**also used to locate the `claude` binary** (`pty.rs` ~355–356, plus a `BinaryNotFound` test
~634), so removing them would break unrelated code. Only the Zed-specific `open_in_editor`
function is removed; the generic binary-lookup plumbing stays.

Out of scope: any other action button (Expand to Focus, Remove, copy-resume, inspector
toggle); replacing Zed with another editor; the shared binary-lookup helpers above.

**Subtasks**

1. [ ] **Overview** (`Overview.tsx`): remove the "Open in Zed" `<button>` from `SessionCard`
   `actions`, the `onOpenInZed` prop (in `SessionCardProps` + the destructure), the
   `onOpenInZed={() => void openInZed(...)}` wiring on the rendered card, the `openInZed`
   store selector, and the now-unused `ExternalLink` import.
2. [ ] **Focus** (`Focus.tsx`): remove the "Open in Zed" toolbar `<button>`, the `openInZed`
   store selector, the now-unused `ExternalLink` import, and the "Open in Zed" mention in the
   toolbar's header comment.
3. [ ] **Store** (`store.ts`): remove `openInZed` from the store interface and its
   implementation (the `ipc.openInEditor` call + "Could not open Zed" error toast).
4. [ ] **IPC** (`ipc.ts`): remove the `openInEditor` wrapper.
5. [ ] **Backend command** (`commands.rs` + `lib.rs`): remove the `open_in_editor`
   `#[tauri::command]` and its entry in the `invoke_handler!` list in `lib.rs`.
6. [ ] **Backend PTY** (`pty.rs`): remove the `open_in_editor` function (and its doc comment).
   Leave `find_on_path` / `is_executable` / `BinaryNotFound` intact (claude lookup).
7. [ ] Verify nothing dangles: `npm run build` (type-check) + `npm run lint` +
   `npm run lint:rust` (clippy) + `cargo test --manifest-path src-tauri/Cargo.toml` all pass
   with no unused-import/unused-variant or unknown-symbol warnings; grep the repo for `zed`,
   `openInZed`, `openInEditor`, `open_in_editor` and confirm only unrelated false matches
   remain (e.g. "resized"/"sized").

**Acceptance criteria**

- [ ] The "Open in Zed" button is gone from **both** the Overview agent card and the Focus
  toolbar; no other action buttons are affected.
- [ ] No `openInZed` / `openInEditor` / `open_in_editor` symbols remain in the frontend or
  backend (store action, IPC wrapper, Tauri command + its registration, and the `pty.rs`
  function are all removed).
- [ ] The `ExternalLink` import is removed from `Overview.tsx` and `Focus.tsx` (no unused
  imports); the build and lint pass clean.
- [ ] `find_on_path` / `is_executable` / `BinaryNotFound` are retained and the `claude`
  missing-binary path still works (clippy + Rust tests pass).
- [ ] App builds and runs with no broken IPC reference (no missing `open_in_editor` command).

**Notes**

- Decision (from the requester): remove it **completely** — UI **and** logic, full stack; not
  a replacement or relocation.
- **Keep the shared helpers** `find_on_path` / `is_executable` / `SessionError::BinaryNotFound`
  — they're reused to locate the `claude` binary (`pty.rs` ~355–356 + test ~634); only
  Zed-specific code is removed.
- **Coordinate/rebase (no hard dependency)** — several open tasks touch the same agent-card
  actions / Focus toolbar and reference this button; whichever lands first, rebase the others:
  - **#70** (Overview title-bar drag) — its subtask/criteria guard the "Open in Zed" button;
    once removed, that guard is moot.
  - **#71** (busy-indicator reposition) — describes the actions group as "Expand/Zed/×".
  - **#75** (remove Focus mode) — deletes `Focus.tsx` wholesale (so removing the Zed button
    there becomes moot) but explicitly *keeps* Open-in-Zed on Overview cards; this task removes
    the Overview one too.
  - **#86** (copy-resume button) — places its new button "next to Open in Zed / Remove"; after
    this it's simply next to Remove.
- Key code:
  - Frontend: `src/components/Overview/Overview.tsx` (`ExternalLink` import line 2;
    `onOpenInZed` in `SessionCardProps` ~117 + destructure ~130; the button ~164–172;
    `openInZed` selector ~288; wiring ~454), `src/components/Focus/Focus.tsx`
    (`ExternalLink` import line 2; toolbar comment ~85; `openInZed` selector ~95; the button
    ~210–218), `src/store.ts` (`openInZed` interface ~314 + impl ~882–891), `src/ipc.ts`
    (`openInEditor` ~116–117).
  - Backend: `src-tauri/src/lib.rs` (`commands::open_in_editor,` ~103),
    `src-tauri/src/commands.rs` (`open_in_editor` command ~292–295),
    `src-tauri/src/pty.rs` (`open_in_editor` fn ~570–581; **keep** `find_on_path` ~584 /
    `is_executable` ~596 / `BinaryNotFound`).
