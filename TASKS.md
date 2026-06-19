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

> Tasks #1–#87 have shipped; newer open tasks (#88+) are in **## Tasks** below.
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

Tasks #1–#87 are complete — see **Implemented (completed tasks)** above for the index,
and git history for full per-task detail. The open tasks (#88+) follow. New work goes
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

### 88. [ ] Replace the busy-indicator spinner with a Claude-style shimmer (dot-only)

**Status:** Not started · _(Not started | In progress | Blocked | Done)_
**Depends on:** none
**Created:** 2026-06-19

**Description**

The agent activity indicator (`BusyIndicator`, currently #71) animates its busy state as a
**rotating arc** — i.e. it reads as a generic loading spinner. Replace that with a **shimmer**: a
soft sheen/glint that **sweeps across the dot** while an agent is working, evoking Claude's own
"thinking" shimmer rather than a spinner. **Both states are redesigned to cohere** as one visual
language (idle = a calm dot; busy = that dot gaining a traveling sheen), staying within the
**existing tight ~12px slot** with **no layout shift** between states.

`BusyIndicator` is a single shared component rendered in **two places** — sidebar session rows
(`Sidebar.tsx`, `styles.rowBusy`) and **Overview** card headers (`Overview.tsx`, the `leading`
slot). Canvas panels don't show a busy state, so they're out of scope. The component's public API
(`{ busy, label }`, `role="status"`) stays the same — this is a CSS/visual redesign of one
component.

**Decisions (from the requester, after research):**
- Animation: **shimmer** (Claude-style), applied to the **indicator dot only** (not the agent name).
- Footprint: **keep the tight ~12px slot** — no header reflow in the sidebar or Overview.
- **Redesign both** idle and busy so they read as a single coherent design.
- Colors: keep the status tokens — **busy = `--status-running`** (blue), **idle = `--status-idle`**.

**Researched alternatives considered (for reference):** typing dots (SpinKit "Bounce Delay"/Flow),
equalizer bars (SpinKit "Wave"/Stretchdelay), breathing pulse + sonar ping (SpinKit "Scale Out").
Shimmer was chosen as the most on-brand for a Claude app.

**Out of scope:** shimmering the agent name text; widening the indicator slot; adding a settings
toggle between indicator styles (no settings screen in v1); the Canvas panel headers.

**Subtasks**

1. [ ] Rewrite `src/components/BusyIndicator/BusyIndicator.module.css`: remove the `busy-spin`
   rotation keyframes and arc; implement the **busy = shimmer** (a sheen sweeping across a
   `--status-running` dot via an animated gradient / pseudo-element, transform/opacity/
   background-position only — 60fps, no repaint), and **redesign the idle** `--status-idle` dot so
   the two states cohere. Keep a fixed ~12px `box-sizing: border-box` footprint so the slot never
   shifts between states.
2. [ ] Keep `BusyIndicator.tsx` API/markup essentially unchanged (`busy`/`label`, `role="status"`,
   `aria-label`/`title`); add a pseudo-element only if the shimmer needs one — prefer no new DOM.
3. [ ] **Reduced motion:** under the global `prefers-reduced-motion` killswitch (`global.css`),
   disable the sweep and show a **static busy state that's still clearly distinct from idle**
   (e.g. a solid/brighter blue dot).
4. [ ] Verify both call sites render correctly — sidebar rows and Overview card headers — with **no
   layout shift** toggling busy↔idle, and the dot still sits cleanly before the name.
5. [ ] Update docs to match: the `BusyIndicator` doc-comments (they describe the #71 spinner arc)
   and the busy-indicator description in **CLAUDE.md** (#42/#55/#71 — "small spinner arc"/"rotating
   spinner arc") → describe the shimmer.
6. [ ] `npm run build`, `npm run lint`, `npm test` all pass.

**Acceptance criteria**

- [ ] The busy state is a **shimmer sweeping across the dot** — **no rotation/spin** animation
  remains anywhere in the component.
- [ ] Idle and busy are a **coherent redesigned pair** (idle = calm dot; busy = shimmer), using
  **`--status-running`** (busy) and **`--status-idle`** (idle).
- [ ] The indicator stays within the **~12px slot** with **no layout shift** between states, in
  both the **sidebar** and **Overview** headers.
- [ ] Under **reduced motion**, the sweep is disabled and the busy state remains **visually
  distinct** from idle.
- [ ] `role="status"` + accessible label preserved; the app **builds, lints, and tests pass**;
  CLAUDE.md no longer describes the indicator as a spinner.

**Notes**

- Proposed best + sources (research): **shimmer** chosen as most on-brand — _"ChatGPT uses a
  pulsing effect, Claude uses a shimmer animation"_
  ([Claude UI research](https://hassantayyab.com/blogs/claude-better-ui-research-first),
  [Agentic Design patterns](https://agentic-design.ai/patterns/ui-ux-patterns)). CSS technique
  references: **SpinKit** (Tobias Ahlin, https://tobiasahlin.com/spinkit/,
  https://github.com/tobiasahlin/SpinKit) and **css-loaders.com** (Temani Afif,
  https://css-loaders.com/, 600+ single-element loaders).
- Lineage: this supersedes #71 (spinner arc), which superseded #55 (pulsing ball) / #42 (original
  busy indicator).
- Implementer latitude: exact sheen geometry/timing is yours to tune. If a literal sweep is too
  subtle at 12px, a soft **traveling glint/glow** is an acceptable realization — the bar is "not a
  spinner, reads as a shimmer, idle↔busy cohere, no layout shift."

---

### 89. [ ] New-session branch step: drop the acknowledgement checkbox + fix the clipped action buttons

**Status:** Not started · _(Not started | In progress | Blocked | Done)_
**Depends on:** none
**Created:** 2026-06-19

**Description**

Two fixes to the new-session panel's **branch step** (`NewSessionModal`, #66), seen when checking
out a **non-current branch while an agent is running in the folder** (the destructive-checkout
case, #27):

1. **Drop the acknowledgement checkbox.** Today the warning embeds a `Checkbox` (#52) that **gates**
   the primary button (`canCreate = … && (!isDestructive || acknowledged)`), so the user must tick
   it to proceed. Remove the checkbox **and the gate** — the **warning becomes informational only**
   (the warning-triangle icon + the same message text), still shown in the destructive case, and the
   primary button is always enabled (subject only to the usual `cwd` / `busy` checks).

2. **Fix the clipped action buttons.** The panel is a fixed **300px** (`.popover`); the branch-step
   action row has **three** buttons — `Cancel` / `Worktree` / primary — in a **non-wrapping** flex
   row, and the long **"Checkout & start"** label overflows the panel so the last button is clipped
   outside it. Fix by **(a)** renaming the branch-step primary button to just **"Start"** — always,
   even when a checkout will happen (the checkout still occurs; the warning covers the running-agents
   case) — and **(b)** hardening the `.actions` layout so it can **never** overflow regardless of
   label/locale (e.g. allow it to wrap to a second line and/or compact the buttons), keeping the
   right alignment.

**Scope:** the `NewSessionModal` component + its CSS only. The reusable **`Checkbox` component (#52)
is kept** — it just becomes unused (this modal is currently its only caller).

**Decisions (requester):**
- Primary button: **always "Start"** in the branch step.
- Layout: **rename + harden** the action row so it never clips.
- Checkbox: **remove the usage + the gate**, keep the warning text, **keep** the Checkbox component.

**Concrete changes (grounding):**
- `NewSessionModal.tsx`: remove the `acknowledged` state and all `setAcknowledged(...)` calls;
  `canCreate` → `!!cwd && !busy` (drop the `(!isDestructive || acknowledged)` gate); replace the
  `<Checkbox …>` inside the `.warning` block with a plain text span (icon + the existing message),
  and remove the `Checkbox` import; branch-step primary label → `"Start"` (was
  `willCheckout ? "Checkout & start" : "Start"`), keeping the `⏎` hint. `willCheckout` is still used
  to pass the branch to `spawnSession`, and `isDestructive` still decides whether the warning shows.
- `NewSessionModal.module.css`: make `.actions` robust (e.g. `flex-wrap: wrap` and/or compact
  padding) so three buttons never overflow 300px; remove the now-unused `.warnCheckbox` rule and
  update the `.warning` comment ("the checkbox gates Start" → informational).

**Out of scope:** widening the 300px panel as the primary fix (allowed only if the implementer
finds wrapping insufficient); changing the folder-step buttons; deleting the `Checkbox` component;
the worktree (⌘⏎) behaviour itself.

**Subtasks**

1. [ ] Remove the acknowledgement checkbox + gate: delete `acknowledged` state + `setAcknowledged`
   calls; `canCreate = !!cwd && !busy`; render the warning as icon + text (no `Checkbox`); drop the
   `Checkbox` import.
2. [ ] Branch-step primary button → always **"Start"** (keep the `⏎` hint); `willCheckout` still
   drives the actual checkout passed to `spawnSession`.
3. [ ] Harden `.actions` so `Cancel` / `Worktree` / `Start` never clip in the 300px panel (wrap
   and/or compact, right-aligned); remove the unused `.warnCheckbox` CSS and fix the `.warning`
   comment.
4. [ ] Keep the reusable `Checkbox` component (#52) in place (now unused).
5. [ ] `npm run build`, `npm run lint`, `npm test` pass; manually verify the destructive scenario
   (non-current branch + a running agent in the folder): warning shows with **no checkbox**, "Start"
   enabled, and **all buttons fully visible** (no clipping).

**Acceptance criteria**

- [ ] In the branch step, selecting a non-current branch with a running agent in the folder shows the
  warning as **informational text (no checkbox)**, and the primary button is **enabled without any
  acknowledgement**.
- [ ] The branch-step primary button always reads **"Start"** (with the `⏎` hint); choosing a
  non-current branch still checks it out before starting.
- [ ] All action buttons (`Cancel` / `Worktree` / `Start`) are **fully visible within the 300px
  panel** — nothing clipped — including when the row wraps.
- [ ] The reusable `Checkbox` component still exists; `npm run build`, `npm run lint`, and `npm test`
  all pass.

**Notes**

- Reported via screenshot: branch step for folder "standings", branch "temporary" (non-current) with
  1 running agent → a warning with a checkbox, and "Checkout & start" clipped outside the panel.
- Root cause of clipping: `.popover` `width: 300px` + a non-wrapping `.actions` row of three buttons;
  the long "Checkout & start" label overflows (renaming to "Start" helps but isn't guaranteed
  sufficient on its own — hence hardening the layout).
- Touches `NewSessionModal` only (#66/#27/#52/#74); independent of the open tasks (#84, #88).
- Trade-off accepted by the requester: "always Start" drops the explicit "a checkout will happen"
  cue in the **non-destructive** checkout case (non-current branch, no running agents → no warning).

---

### 90. [ ] File viewer: built-in searchable file selector in the header (click the filename → switch file)

**Status:** Not started · _(Not started | In progress | Blocked | Done)_
**Depends on:** none
**Created:** 2026-06-19

**Description**

Give the universal read-only **file viewer (#44)** a **built-in file selector**: clicking the
**filename in the viewer header** opens a **searchable picker** of the repo's files, and choosing
one **swaps the viewer to that file** in place. Today a file viewer is bound to whatever file it was
opened with — to look at a different file you must close it and open another from the repo menu
(#82) / file picker (#56). This lets the user search + select a different file directly in the
viewer.

**Important grounding:** the header in the screenshot (the color dot + filename + `repo · branch` +
×) is **not** rendered by `FileViewer` — it's drawn by the **parent**: the Overview `ExtraPanel`
(`PanelColumn` title, `Overview.tsx`) and the Canvas panel header (`Canvas.tsx`). So the selector
trigger lives in **those headers**, reusing the existing **`FilePicker` (#56)**; `FileViewer` itself
needs no change — it already reloads when its `file` prop changes (`load` deps `[repoPath, file]`,
and the raw toggle resets on `[file]`).

**Decisions (requester):**
- **Trigger:** the header **filename becomes a button** (with a small ▾ caret hint); clicking opens
  the searchable picker popover.
- **Surfaces:** **both** Overview file columns **and** Canvas file panels.
- **Repo scope:** **same repo only** — the picker lists `listFiles(repoPath)` (like the repo menu's
  "File viewer" add); the viewer stays bound to its repo.
- **Duplicate file:** **just switch it** — switching to a file already open as another panel is
  allowed (the in-place change is literal); the add-from-menu dedup in `addOverviewPanel` is left
  intact.

**Concrete changes (grounding):**
- **Store** — add `setOverviewPanelFile(repoPath, panelId, file)`, mirroring `setDiffCompare`
  (`store.ts`): `panels.map((p) => p.id === panelId ? { ...p, file } : p)`, set state, persist via
  `ipc.setOverviewPanels`. Do **not** dedup on change (allow an already-open file).
- **Canvas** — add a pure leaf-content update in `Canvas/canvasTree.ts` (e.g.
  `updateLeafContent(tree, leafId, partial)`) + a store action to set the **active** canvas leaf's
  `content.file`, persisting through the existing `setActiveCanvasLayout` (canvases blob).
- **Header trigger** — render the file-viewer header filename as a button (▾ caret) that opens a
  popover hosting `FilePicker` (#56); load `listFiles(repoPath)` on open; dismiss on pick /
  outside-click / Escape. Prefer extracting a **small shared component** so Overview and Canvas
  don't duplicate the popover logic.
- **Wire-up** — Overview `ExtraPanel` (file panels only, `kind: "markdown"`) → `setOverviewPanelFile`;
  Canvas file panels (`content.kind === "file"`) → the leaf-file action. Agent/diff/terminal headers
  are untouched.

**Out of scope:** switching the viewer to a **different repo's** file (same-repo only); adding the
selector to diff/terminal/agent panels; changing `FileViewer`'s content rendering or polling.

**Subtasks**

1. [ ] Store: `setOverviewPanelFile(repoPath, panelId, file)` (mirror `setDiffCompare`) — set the
   panel's `file` + persist; allow switching to an already-open file.
2. [ ] Canvas: pure `updateLeafContent` in `canvasTree.ts` + a store action to set the active
   canvas leaf's `content.file`, persisted via `setActiveCanvasLayout`.
3. [ ] Header trigger: filename → button (▾ caret) opening a `FilePicker` (#56) popover over
   `listFiles(repoPath)`; dismiss on pick / outside-click / Escape; prefer a small shared component
   reused by both surfaces.
4. [ ] Wire Overview `ExtraPanel` (file panels) and Canvas file panels to their respective update
   actions; leave agent/diff/terminal headers unchanged.
5. [ ] Confirm the swap works end-to-end (content reloads, markdown raw toggle resets) with **no**
   `FileViewer` change needed, and the swapped file **persists** across reload/restart.
6. [ ] `npm run build`, `npm run lint`, `npm test` pass.

**Acceptance criteria**

- [ ] Clicking the filename in a file viewer's header (Overview column **and** Canvas panel) opens a
  **searchable picker** of the repo's files (reusing `FilePicker` #56).
- [ ] Selecting a file **swaps that viewer** to it — content reloads, the markdown Rendered/Raw
  toggle resets — and the change **persists** across an app reload/restart.
- [ ] The picker lists files from the **viewer's own repo only**; choosing a file already open
  elsewhere just switches this viewer (no error, no forced dedup).
- [ ] Agent / diff / terminal headers are unchanged; the popover dismisses on pick, outside-click,
  and Escape.
- [ ] `npm run build`, `npm run lint`, and `npm test` all pass.

**Notes**

- Reported via screenshot: a file viewer header ("● .env.example  standings · main  ×") — the user
  wants to search + select a different file from within the viewer.
- Reuses `FilePicker` (#56) and the `listFiles` IPC (same as the repo menu's "File viewer" add,
  #82). State-update precedent: `setDiffCompare` (`store.ts`) updates a panel in place + persists.
  Builds on #44 (FileViewer), #59 (overviewPanels as the single item source), #46/#47 (Canvas).
- Independent of the open tasks (#84, #88, #89).

---

### 91. [ ] Folder context menu: "Kill all agents" + "Close all items"

**Status:** Not started · _(Not started | In progress | Blocked | Done)_
**Depends on:** none
**Created:** 2026-06-19

**Description**

Add two **bulk actions** to the sidebar repo (folder) context menu (#31/#54/#82, `Sidebar.tsx`):

1. **Kill all agents** — kill + forget **every running agent** in the folder (including its worktree
   agents, #74), leaving the folder and its **non-agent items** (file / diff / terminal panels) in
   place. (Per-session this is `removeSession` = kill + forget.)
2. **Close all items** — clear the **entire folder workspace**: kill + forget all agents **and**
   remove all non-agent items (file viewers, diff viewers, terminals — each terminal's shell PTY is
   killed), but **keep the folder in recents** so its (now empty) repo header stays, with its coral
   `+`. This differs from the existing **Forget folder** (#31), which *additionally* drops the folder
   from recents.

Both are destructive → red/danger styling (#54), placed in the destructive area of the menu (above
"Forget folder"). Confirm before killing when agents are running (reuse the menu's existing confirm
pattern, `menuMode`). Show each only when applicable: **Kill all agents** when ≥1 running agent;
**Close all items** when the folder has any agent or any panel. Use the bulk-toast pattern (#83): a
single summary toast and **no per-item spam** (the `forgetRepo` mechanics — `intentionalKills` +
suppressed per-exit/per-panel toasts).

**Concrete changes (grounding):**
- **store** — add `killAllAgents(repoPath)` (remove all sessions where `repoPath === repo` **or**
  `worktreeParent === repo` that are running; `intentionalKills.add` + `ipc.killSession`; keep
  `overviewPanels` and `recents`; one summary toast) and `closeAllItems(repoPath)` (do the
  kill-all, then remove every `overviewPanels[repo]` entry incl. terminal-PTY kills, persist via
  `ipc.setOverviewPanels(repoPath, [])`; keep the folder in `recents`; one summary toast). Mirror
  `forgetRepo` (`store.ts`) for the kill mechanics and selection/filter cleanup; reuse
  `removeOverviewPanel`'s terminal-kill handling.
- **Sidebar** (`Sidebar.tsx`) — add the two danger menu items; gate **Kill all agents** /
  **Close all items** behind the confirm step when `menuRunning > 0` (extend the existing
  `confirm` mode, or add parallel confirm modes).

**Out of scope:** changing **Forget folder** (#31) behaviour; a global "kill everything" across all
repos; killing agents without forgetting (we remove them, matching `removeSession`).

**Subtasks**

1. [ ] store: `killAllAgents(repoPath)` — remove all running agents (repo + its worktrees), one
   summary toast, no per-exit spam; keep panels + recents.
2. [ ] store: `closeAllItems(repoPath)` — kill all agents **and** remove all `overviewPanels[repo]`
   (terminal PTYs killed), persist the empty list, keep the folder in recents; one summary toast.
3. [ ] Sidebar repo menu: two danger items above "Forget folder", each shown only when applicable
   and confirmed when agents are running.
4. [ ] `npm run build`, `npm run lint`, `npm test` pass.

**Acceptance criteria**

- [ ] The repo context menu offers **Kill all agents** (shown only with ≥1 running agent) and
  **Close all items** (shown only when the folder has any agent or panel), styled as destructive.
- [ ] **Kill all agents** removes every running agent in the folder (and its worktrees) but leaves
  the folder listed and its file/diff/terminal panels intact.
- [ ] **Close all items** removes every agent **and** every panel (terminals' shells killed) while
  **keeping the folder in recents** (empty header with `+` remains).
- [ ] A single summary toast per action (no per-item spam); running-agent actions confirm first;
  `npm run build` / `lint` / `test` pass.

**Notes**

- Requester intent: a quick "kill all agents here" and a stronger "clear this folder's workspace"
  without forgetting the folder.
- Reference: `forgetRepo` (`store.ts`) — kill mechanics, `intentionalKills`, selection/filter
  cleanup, worktree handling (#74); `removeOverviewPanel` — terminal-PTY kill + persist.
- Independent of the other open tasks (#84, #88–#90).

---

### 92. [ ] Fix the unclickable "Restart" button on the exited-process overlay

**Status:** Not started · _(Not started | In progress | Blocked | Done)_
**Depends on:** none
**Created:** 2026-06-19

**Description**

The **Restart** button on the "Process exited (code N)" overlay (`Terminal.tsx` `.exitOverlay`) is
**visible but unclickable** — clicks never reach `handleRestart`, so an exited/crashed agent (#63) or
shell terminal (#72) can't be relaunched from the overlay.

**Root cause (confirmed).** In `Terminal.module.css`, `.wrapper` (`position: relative`), `.slot`
(the pooled-xterm reparent target, `position: absolute; inset: 0`), the pooled `.terminal` container
(`position: absolute; inset: 0`), and `.exitOverlay` (`position: absolute; inset: 0`) **all have
`z-index: auto`**, so **none establishes a stacking context**. xterm's own stylesheet
(`@xterm/xterm/css/xterm.css`) puts **positive z-indexes** on its internal layers (helpers/canvases/
decorations — up to ~11). Positive-z-index descendants paint in a higher stacking group than the
`z-index: auto` `.exitOverlay`, so xterm's layers (some transparent) sit **above** the overlay in
hit-testing: the button paints (it's a later sibling) but pointer events resolve to the xterm layer,
not the button.

**Fix.** Make the overlay reliably top-most **and** interactive:
- Give `.exitOverlay` an explicit `z-index` above xterm's layers (xterm tops out ~11 → e.g.
  `z-index: 20`), and/or **contain** xterm's stacking by isolating the wrapper
  (`.wrapper { isolation: isolate }` or `.slot { z-index: 0 }`), so xterm's internal z-indexes no
  longer escape above the overlay.
- Confirm the **"Reconnecting…"** overlay (same element) is unaffected/also correct.

**Subtasks**

1. [ ] `Terminal.module.css`: raise/contain stacking so `.exitOverlay` (and its button) sit above the
   pooled xterm layers and receive pointer events (explicit `z-index` and/or `isolation: isolate`).
2. [ ] Verify clicking **Restart** fires `handleRestart` → resume (agent, #63) / respawn (terminal
   item, #72) and `resetTerminal`, in **both** Overview and Canvas.
3. [ ] `npm run build`, `npm run lint` pass.

**Acceptance criteria**

- [ ] The **Restart** button on the exit overlay is clickable and actually relaunches the session
  (agent resume / terminal respawn), with the pooled terminal reset so it repaints cleanly (#63).
- [ ] Works wherever a terminal renders (Overview card, Canvas panel); the "Reconnecting…" overlay
  still behaves correctly.
- [ ] `npm run build` and `npm run lint` pass.

**Notes**

- Reported via screenshot: "Process exited (code 0)" with a **Restart** button that can't be clicked.
- The overlay is a later DOM sibling of `.slot`, so it *paints* on top — but xterm's positive
  z-indexes out-stack it for hit-testing because nothing between them isolates the stacking context.
- Touches `Terminal.module.css` (and possibly `Terminal.tsx`) only; independent of other open tasks.

---

### 93. [ ] Scheduled sessions (part 1 of 2): scheduling engine + launcher — schedules fire into live agents

**Status:** Not started · _(Not started | In progress | Blocked | Done)_
**Depends on:** none
**Created:** 2026-06-19

**Description**

**Part 1 of two** (#94 is part 2). Deliver **scheduled sessions end-to-end at the engine level**: the
user can schedule an agent to launch automatically at a chosen time (optionally pre-seeded with a
prompt so `claude` starts ready), it **persists**, and at the time it **fires into a normal live
agent**. This part owns the **backend engine + data model + the launcher (button/⌘⇧N + modal) + a
minimal pending list**; the **rich draggable item type and the editable auto-saving panel are #94**,
which builds on this part's records + commands.

> Split rationale: scheduling spans a Rust engine *and* a cross-surface React item type. Part 1 is
> the engine + create/fire loop (verifiable by `cargo test` + a 1-minute schedule); part 2 is pure
> frontend on top of this part's finished data/command surface. Part 1 exposes the full
> update-prompt/name/time command surface up front so part 2 needs **no** backend changes.

**Pieces (this part):**

- **"+ Schedule session" button** below the "New session" button in the sidebar (`Sidebar.tsx`),
  with a distinct-but-related keybind **⌘⇧N** (⌘N opens New session #26; ⌘⇧N schedules). Add it to
  `useKeyboardNav` — the existing ⌘N branch requires `!e.shiftKey`, so ⌘⇧N is free and "fitting".
- **Schedule modal** = the New-session flow (folder → branch, **reusing `NewSessionModal`**'s
  two-step #66 UI) **plus a final step**: pick a **launch time** (date + time), optionally enter a
  **prompt**, and optionally a **custom name** (re-added here — #66 dropped the inline name field, but
  #94's panel surfaces a name). The **prompt is optional** (it can be added/edited later in #94's
  panel).
- **Prompt → run command.** The prompt is passed **positionally** so `claude` boots with it ready:
  `claude --session-id <uuid> "<prompt>"` (combined with the existing optional `git checkout`).
  Backend: extend `pty.rs spawn_session` to accept an optional initial prompt appended after
  `--session-id <id>` (the args are currently a fixed slice; add the positional). **Verify against
  the real CLI** (as #30 did for `--session-id`/`--resume`) and record the finding.
- **Scheduling engine (backend).** Persist scheduled records — `{ id, cwd, branch (+ checkout?),
  worktree?, name?, prompt, fire_at, created_at }` — in the app-data dir (`store.rs`); arm a backend
  timer/scheduler (`lib.rs`/`pty.rs`); when `fire_at` is reached, spawn the agent (with checkout +
  prompt), **convert** the scheduled record into a live session, and emit an event so the frontend
  moves the item scheduled→live. On boot, reload schedules and re-arm; if `fire_at` **already passed**
  while the app was closed, **fire on boot (catch-up)**. Tauri commands: **create / list / cancel /
  update (prompt, name, time)** — expose the full update surface now so #94 is pure UI.
- **Frontend store/IPC.** Scheduled-sessions state + typed IPC + actions (schedule, cancel,
  updatePrompt/name/time, onFired→move into `sessions`); persistence wiring.
- **Minimal pending UI (so it's usable + verifiable).** A **basic pending-schedules list in the
  sidebar** under each repo — name/branch + fire time + a × to **cancel** — enough to create, see,
  cancel, and watch a schedule fire into a live agent. Non-draggable, no rich panel (that's #94).

**Decisions / out of scope (assumed — no requester Q&A):**
- Keybind **⌘⇧N**; prompt **optional**; **catch-up fire on boot** for schedules missed while closed;
  re-add an optional **custom name** in the schedule flow. Time zone = the local machine zone.
- **One-shot** schedules only — **recurring** schedules are out of scope.
- **Deferred to #94:** the draggable scheduled item type in Overview + Canvas (`payloadToContent`),
  and the scheduled-agent panel with the big **auto-saving** prompt editor / in-panel prompt editing.
  Part 1 only sets the prompt **at creation time** in the modal.

**Subtasks**

1. [ ] **Backend data + spawn:** persisted scheduled-session records (`store.rs`); Tauri commands to
   create / list / cancel / update (prompt, name, time) (`commands.rs`); extend `pty.rs spawn_session`
   to append an optional positional prompt — and **verify the `claude "<prompt>"` invocation** works
   (note it in CLAUDE.md like #30).
2. [ ] **Scheduling engine:** arm timers per schedule; on fire spawn (checkout + prompt) and convert
   to a live session; boot reload + **catch-up**; emit fired/updated events (`lib.rs`/`pty.rs`).
3. [ ] **Frontend store/IPC:** scheduled-sessions state + typed IPC + actions (schedule, cancel,
   updatePrompt/name/time, onFired→move into `sessions`); persistence wiring.
4. [ ] **Launcher:** "+ Schedule session" button under New session + **⌘⇧N** (`useKeyboardNav`);
   the schedule modal (reuse `NewSessionModal` folder→branch + a final time/prompt/name step).
5. [ ] **Minimal pending list:** basic sidebar rows per repo (name/branch + fire time + cancel),
   non-draggable.
6. [ ] **Docs + checks:** update CLAUDE.md (scheduled sessions, ⌘⇧N, the engine, the positional-prompt
   spawn); `npm run build`, `npm run lint`, `npm test`, `cargo test` pass.

**Acceptance criteria**

- [ ] A "+ Schedule session" button (and **⌘⇧N**) opens a modal that mirrors New session (folder →
  branch) and adds a final step to pick a **launch time** and optionally a **prompt** (+ name);
  scheduling with **no prompt** is allowed.
- [ ] At the scheduled time the agent launches automatically with the prompt pre-loaded
  (`claude --session-id <id> "<prompt>"`, plus checkout when a non-current branch was chosen), and
  the scheduled item becomes a normal live agent; a schedule **missed while the app was closed fires
  on next boot**.
- [ ] Pending schedules show in the **sidebar** (name/branch + fire time) and can be **canceled**;
  records **persist** across restart (timers re-armed on boot).
- [ ] `npm run build`, `npm run lint`, `npm test`, and `cargo test` pass; CLAUDE.md documents the
  feature and the **verified** positional-prompt invocation.

**Notes**

- **Part 1 of 2** — #94 adds the rich draggable item type + the auto-saving panel and **depends on
  this part's** data model + update commands (exposed here so #94 is pure UI, no Rust changes).
- Reuses `NewSessionModal` (#66), the spawn flow (`pty.rs`), and keyboard nav (#26). The positional
  `claude "<prompt>"` invocation must be CLI-verified before relying on it (mirror the #30 note in
  CLAUDE.md).
- Independent of the other open tasks (#88–#92).

---

### 94. [ ] Scheduled sessions (part 2 of 2): draggable item type (sidebar/Overview/Canvas) + auto-saving prompt panel

**Status:** Not started · _(Not started | In progress | Blocked | Done)_
**Depends on:** #93
**Created:** 2026-06-19

**Description**

**Part 2 of two** — builds on **#93** (the scheduling engine, the schedule modal, and the basic
pending list). Turn scheduled sessions into a **first-class, draggable item type** across every
surface and add the **editable scheduled-agent panel**. This part is **pure frontend** — it consumes
#93's persisted records + Tauri commands (including **update-prompt / name / time**); **no backend or
engine changes**.

**Pieces:**

- **Sidebar:** upgrade #93's basic pending row into the **standard draggable item** (like sessions /
  files / diffs, #45/#59) — a dnd-kit **draggable source** that drops into the active Canvas; a click
  **selects/jumps** to it in the current view (#79); the × **cancels** the schedule.
- **Overview:** a **scheduled card** in the repo cluster (#38), reusing the shared panel body.
- **Canvas:** a new `CanvasContent` kind **`"scheduled"`** + a **`payloadToContent`** case (new item
  types are draggable by default per that pattern, #47/#59), resolved at render to the shared panel.
- **Scheduled-agent panel** (shared body for the Overview card + Canvas panel): shows **branch,
  custom name, and fire time**, plus a **big prompt textarea** that **auto-saves** (debounced) to the
  record via #93's **update-prompt** command — the prompt is optional and editable any time before it
  fires; includes a **cancel** control. In-panel editing of **name / fire-time** too (uses #93's
  update-name/time commands) if straightforward.
- When the schedule **fires** (engine, #93), the item is consumed and becomes a normal live agent
  everywhere; this panel is the **pending (pre-fire)** representation.

**Out of scope:** any backend/engine change (all in #93); recurring schedules.

**Subtasks**

1. [ ] **Sidebar:** upgrade the pending row to a dnd-kit draggable item (drop into Canvas),
   click-to-select/jump (#79), × cancel.
2. [ ] **Overview:** a scheduled card using the shared panel body.
3. [ ] **Canvas:** `"scheduled"` content kind + `payloadToContent` + render the shared panel body.
4. [ ] **Scheduled-agent panel:** branch / name / fire-time details + a **big auto-saving prompt
   textarea** (debounced → #93 `update-prompt`) + cancel; optional in-panel name/time edit.
5. [ ] **Docs + checks:** update CLAUDE.md (the scheduled **item type** + the auto-saving panel +
   drag-into-canvas); `npm run build`, `npm run lint`, `npm test` pass.

**Acceptance criteria**

- [ ] Scheduled sessions appear in the **sidebar** (draggable + cancelable), in **Overview**, and can
  be **dragged into a Canvas**.
- [ ] The scheduled-agent panel shows **branch, custom name, and fire time**, and a **big prompt
  field that auto-saves** as you type (persisted via #93's command); a schedule created with **no
  prompt** can have one **added later** here.
- [ ] Canceling from any surface removes the schedule (and its timer, via #93).
- [ ] `npm run build`, `npm run lint`, and `npm test` pass; CLAUDE.md documents the item type + panel.

**Notes**

- **Part 2 of 2** — depends on **#93** for the records, store state, and update commands; this part is
  **pure frontend** (no Rust changes).
- Reuses item plumbing — sidebar drag (#45/#59), Overview cluster (#38), Canvas `payloadToContent`
  (#46/#47). Created via the schedule modal (#93), **not** the repo "Views" registry (#82), so #82 is
  unaffected.
