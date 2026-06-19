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
in [TASKS-TEMPLATE.md](TASKS-TEMPLATE.md) format (next number: **#72**), with its
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

---

### 65. [ ] New session panel should fully cover the New session button (no corner peeking out)

**Status:** Not started · _(Not started | In progress | Blocked | Done)_
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

- [ ] With the panel open, no part of the New session button is visible around it (top-left
  corner included).
- [ ] The open animation still reads as growing from the button; tokens only.

**Notes**

- Shares the New session component with #66; coordinate/rebase to avoid CSS conflicts.
- Key code: `src/components/NewSessionModal/NewSessionModal.module.css` (`.popover`,
  `.overlay`), `src/components/Sidebar/Sidebar.module.css` (`.newButton`, `.sidebar`).

---

### 66. [ ] Rework the new-session flow — two-step folder→branch keyboard flow, branch filter, in-button hints, remove Name, "Start"

**Status:** Not started · _(Not started | In progress | Blocked | Done)_
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

1. [ ] Folder step: keep search auto-focus + type/↑↓ filter; change Enter to **advance**
   (focus Branch step for git; start immediately for non-git / 0 branches).
2. [ ] Branch step: auto-focus on entry; ↑↓ roving; Enter starts (checkout for non-current,
   destructive-confirm intact).
3. [ ] Branch filter input above the list, shown when **>4 branches**; type filters, ↑↓
   moves, Enter starts.
4. [ ] Sort branches: pin `main` > `master` > `dev`/`develop` to the top, current
   highlighted/default, rest after; priority branches sort to top of filtered results.
5. [ ] Remove `.hints` row; ⏎ in Start, esc in Cancel; remove ⌘1–9 badges and ↑↓ hints.
6. [ ] Remove the Name input; stop defaulting name to repoName — new sessions have no custom
   name.
7. [ ] Rename action button to "Start" / "Checkout & start".

**Acceptance criteria**

- [ ] Opening focuses the recents search; typing/↑↓ filters & highlights a folder.
- [ ] Enter on a **git** folder advances to the Branch step (no start); Enter on a
  **non-git** folder starts immediately.
- [ ] In the Branch step, ↑↓ moves and Enter starts (checkout for a non-current branch;
  destructive-confirm still gates it).
- [ ] Branch filter appears when >4 branches, auto-focused, filters as you type;
  `main`/`master`/`dev` pinned to the top in that order (and atop matching results).
- [ ] No standalone hint row; Start shows ⏎, Cancel shows esc; no ⌘1–9 / ↑↓ hint badges
  remain.
- [ ] No Name field; a session created here has no custom name.
- [ ] Action button reads "Start" (or "Checkout & start" when switching branches).

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

### 67. [ ] Session label: branch is the primary title; a custom name overrides it (branch becomes the subtitle)

**Status:** Not started · _(Not started | In progress | Blocked | Done)_
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

1. [ ] Define the rule once (shared helper): primary = `name || branch || folderName`;
   subtitle = `name ? (branch || folderName) : null`.
2. [ ] Apply to Sidebar rows, Overview cards, Focus toolbar, Canvas panel titles.
3. [ ] Preserve repo color/badge; remove redundant repo/branch text left by the change.

**Acceptance criteria**

- [ ] A session with no custom name shows the **branch** as its primary label on all
  surfaces (folder name when non-git), no subtitle.
- [ ] After renaming (#57), the **custom name** is primary and the **branch** is the
  subtitle on all surfaces.
- [ ] Sidebar, Overview, Focus, Canvas all follow the same rule; repo color/badge retained.

**Notes**

- Decision (from the requester): applies to all surfaces.
- Depends on #66 (stops defaulting the name, so "has a custom name" is meaningful).
- Branch comes from the live `branches` map in the store (by repo); non-git → primary falls
  back to folder name.
- Key code: `Sidebar.tsx` (`SessionRow`), `Overview.tsx`, `Focus.tsx`, `Canvas.tsx`,
  `src/paths.ts`.

---

### 68. [ ] Repo filter selector should visually include its "+" (new-session) button

**Status:** Not started · _(Not started | In progress | Blocked | Done)_
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

- [ ] The repo header's hover and active-filter highlight enclose both the repo title and
  the "+" as a single rounded selector — the "+" no longer sits outside the highlighted box.
- [ ] Clicking the title still filters Overview; clicking the "+" still opens New session in
  that repo; empty-repo accent "+" and a11y labels preserved.
- [ ] Tokens only; no off-system values.

**Notes**

- From the screenshot: the active repo filter shows the accent-dim box around "● ClaudeCue"
  with the "+" detached to its right.
- Shares `Sidebar.tsx` / `Sidebar.module.css` with #67 but touches different elements (repo
  header vs `SessionRow`); independent.
- Key code: `src/components/Sidebar/Sidebar.tsx` (`.repoHeader`, `.repoTitle`/`.repoActive`,
  `.plus`/`.plusCoral`), `src/components/Sidebar/Sidebar.module.css` (lines ~63–158).

---

### 69. [ ] File picker — remove the focus-ring border around the search input

**Status:** Not started · _(Not started | In progress | Blocked | Done)_
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

- [ ] The "Search files…" input no longer shows the accent outline/border when focused
  (including on open, when it auto-focuses).
- [ ] The global focus-visible ring is unchanged for every other focusable control (other
  inputs, buttons, list rows).
- [ ] The change is scoped to `FilePicker`'s search input only.

**Notes**

- Key code: `src/components/FilePicker/FilePicker.module.css` (`.search`, `.searchRow`),
  `src/styles/global.css` (lines ~60–62, the global `:focus-visible` outline — leave as is).
- The picker is reused wherever the "Open file viewer" file search appears (#56); scoping to
  `.search` covers all of them (the intent of "only this input field").

---

### 70. [ ] Overview: make the whole column title bar a drag handle (not just the corner grip)

**Status:** Not started · _(Not started | In progress | Blocked | Done)_
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

1. [ ] In `PanelColumn` (`Overview.tsx`), attach the sortable `listeners` to the whole
   header (title bar) rather than only the grip; keep `attributes` / keyboard drag working.
2. [ ] Guard the `.actions` buttons (×, Expand, Zed) so pressing them doesn't start a drag
   and their onClick still fires.
3. [ ] Add `cursor: grab` / `:active` `grabbing` to the header in `Overview.module.css`;
   keep or remove the grip as a visual hint.

**Acceptance criteria**

- [ ] In Overview, pressing and dragging anywhere on a column's title bar (over the
  name/subtitle, not just the corner grip) reorders the column — for agent terminals and for
  file/diff/markdown panels.
- [ ] The × still closes the agent/panel; Expand to Focus and Open in Zed still work; none of
  them start a drag.
- [ ] The title bar shows a grab/grabbing cursor; keyboard reorder + screen-reader drag still
  work.
- [ ] No regression to selecting a card or to the terminal/body interactions.

**Notes**

- Decision (from the requester): the whole title bar drags; the × (and the other header
  buttons) stay as click targets.
- Shares `Overview.tsx` (`SessionCard`/`ExtraPanel` title area) with #67 (label rule) —
  different concern (drag wiring vs title text); coordinate/rebase.
- Key code: `src/components/Overview/Overview.tsx` (`PanelColumn` header: `.dragHandle`,
  `.titleBlock`, `.actions`; `useSortable`), `src/components/Overview/Overview.module.css`
  (`.header` ~112, `.dragHandle` ~125).

---

### 71. [ ] Activity indicator — move it before the agent title (all surfaces) + reinvent it as a spinner arc

**Status:** Not started · _(Not started | In progress | Blocked | Done)_
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

1. [ ] Redesign `BusyIndicator` (`.tsx` + `.module.css`): busy = rotating spinner arc
   (`--status-running`); idle = static dot (`--status-idle`); reduced-motion = static. Keep
   compact + `role="status"` label.
2. [ ] Sidebar `SessionRow`: move `<BusyIndicator>` to before the label (`.rowMain`) instead
   of after it.
3. [ ] Overview `SessionCard`: move the indicator out of `actions` (`.headerBusy`) to the
   start of the header, before the title (`.titleBlock`).
4. [ ] Focus toolbar: move the indicator before the title text.

**Acceptance criteria**

- [ ] On all three surfaces (sidebar rows, Overview card header, Focus toolbar) the activity
  indicator sits to the **left of the agent's name/title**, not on the right.
- [ ] While an agent is working it's a rotating spinner arc; when idle it's a calm static
  dot; under reduced-motion it's static (no rotation).
- [ ] The indicator stays compact and aligned in every placement; `role="status"` +
  Working…/Idle label preserved.
- [ ] No change to when busy/idle is detected.

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
