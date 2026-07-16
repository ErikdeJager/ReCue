# Tasks

This is the **permanent archive** of completed tasks, maintained by the `kanban-dev-pima`
pipeline's **`/archive-tasks`** lane (it appends a `## Task <N>` entry as each `ARCHIVE` card is
finished). A task number counts as a satisfied dependency once it appears here (or in the
board's `## ARCHIVE` column). Numbers are **global and never reused** — the next number is one
greater than the highest used anywhere (board, `PLAN-*.md`, this file).

The **Implemented (completed tasks)** index below is a condensed, one-line-per-task record of
everything shipped so far. **Every completed task is condensed here except the 20 most
recently-archived** — those are written out in full at the end of this file (Description /
What shipped / Key files / Dependencies). As new tasks land, the oldest full entries are folded
up into this index (the same condensation #152–#310 already went through), so only ~20 full
entries are ever kept — each condensed task's full detail lives in git history and its PR.

---

## Project context

**ReCue** — a **macOS, Windows, and Linux** desktop app (**Rust + Tauri 2 + React/TypeScript**) for
running and managing many live coding-agent CLI sessions at once (Claude by default; Codex and
OpenCode are pluggable, #101/#141): an **Overview** "agent wall" of real terminals, a **Canvas**
split-panel workspace (with file, **git-diff**, and terminal viewers), and a repo-grouped
**sidebar**. Each session is a **real PTY running the agent CLI** — ReCue provides the window
chrome, navigation, persistence and git-reading; the terminals come from the CLI itself. See
`CLAUDE.md` for the authoritative, current architecture; this file is the shipped-task history.

**Stack:** Tauri 2 · React + TypeScript + Vite · **Zustand** · plain CSS with
CSS-variable design tokens (CSS Modules) · **xterm.js** terminals · **`portable-pty`**
(Rust) · JSON persistence in the app-data dir · **Lucide** icons · **JetBrains Mono**
(bundled, offline).

**Scope (v1 baseline + later reversals — see `CLAUDE.md` for the current authority):** no
status system beyond the busy/idle/awaiting indicator (#42/#55/#71/#88/#95/#112) · no
app-rendered approval UI (users answer in the terminal) · no Skills manager · no light mode ·
no auth. Several original v1 "out of scope" rules were **later reversed** by shipped tasks: a
**Settings** screen (#100/#102/#103), **multi-window** Canvas tabs (#84), **Fork** an agent's
conversation (#126), **Windows** support (#139/#140/#143), **in-app auto-update** + release
pipeline (#190), and **macOS code signing / Hardened Runtime + entitlements** for permissions
(#292). **Git is read-mostly** — ReCue reads git (branch + working-tree diff vs `HEAD`, branch
compare #81, per-file status #252) and never commits/pushes; its writes are `git checkout` (#27),
`git worktree add`/`remove` (#74), **branch creation** (#124), `git fetch` (#180), `git pull
--ff-only` (#181), and `git clone` (#295/#308). **Files are read-mostly too** — the viewer
lists/reads repo text files (#40/#44) plus path-validated writes: `write_text_file` (#141, the
Kanban board + editable raw view), `move_into_repo` (#253, OS file drop), and `create_dir` /
`delete_path` / `rename_path` (#267/#291). Agent CLIs are assumed on `PATH` (clear in-app error
if missing).

> The original design spec and interactive prototype (`HANDOFF.md`,
> `Conductor.dc.html`) are preserved in git history (commit `b02efd8`
> "System referances") if exact prototype details are ever needed.

---

## Implemented (completed tasks)

> Tasks #1–#153 have shipped — the backlog is fully implemented (no open tasks).
> Completed tasks are condensed here — number, title, and one line
> on what each delivered — and their full entries removed from the list below; per-task
> detail (subtasks, notes, acceptance, implementation reports) lives in git history.
> This is the running record of what ReCue has shipped.

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

**Auto-named agents from claude's own `ai-title` (#97).**

- #97 An agent with **no custom name** now shows **claude's own session title** rather than the bare branch. A new persisted `auto_name` field (Rust `PersistedSession` + `SessionView`) is filled by a backend **title reader** (`src-tauri/src/title.rs`) that globs the session's `~/.claude/projects/*/<uuid>.jsonl` log by UUID and takes the latest `ai-title` (fallback: the trimmed first `last-prompt`, else the branch). A dedicated **title-worker** thread re-reads it on each busy→idle edge **off the monitor's hot path** (the monitor only pokes it via a channel), emitting `SessionEvent::Name` → `session://name`; `lib.rs` persists + forwards it and the frontend updates `autoName`. `sessionLabel` now resolves **`custom || auto || branch`**, so the title fills the single-line label (#95) everywhere (sidebar / Overview / Canvas) — a user rename (#57) still wins, and it covers interactive, worktree (#74), and scheduled (#93) agents. Best-effort: a missing / unreadable / format-changed log degrades to the branch, and the busy indicator is never stalled.

**Fix: detached canvas window renders its panels (#98).**

- #98 Popping a canvas into its own window (#84) showed an **empty** "open in its own window" placeholder instead of the canvas's panels: `CanvasSurface` reused the main-window guard `detachedCanvasIds.includes(activeCanvasId)`, which is also true in the detached window (it forces `activeCanvasId` to its own detached id). Gated it on `IS_MAIN_WINDOW`, so only the **main** window shows the note while the detached window renders its layout — live agent terminals (it owns its sessions) plus file / diff / terminal panels. One-line frontend fix in `CanvasSurface.tsx`; a PTY is still never drawn in two windows.

**Tighter New ↔ Schedule button gap (#99).**

- #99 Tightened the vertical gap between the sidebar's **New session** and **Schedule session** (#93) buttons from 12px to 4px so they read as one compact cluster — reduced only `.newButton`'s bottom margin (`Sidebar.module.css`); the Schedule button (top margin 0) and the rest of the sidebar spacing are unchanged. Pure CSS.

**Settings screen — infra + Terminal / Sessions / Data sections (#100, part 1).**

- #100 Added an application **Settings** screen (reverses the v1 "no settings screen" rule, as #84 reversed multi-window). A new **thin footer row** pins to the bottom of the sidebar (hairline-topped, laid out for more quick actions) with a **⚙ gear** opening a centered **Settings modal** — scrim + focus-trap + Escape, a left section nav + content pane, a modal-local **draft** applied only on **Save** (Cancel / Escape / scrim discard; + "Reset to defaults"). Settings persist through the Rust store as an opaque `settings` blob (`get_settings` / `set_settings`), merged over **TS-side defaults** so an older `sessions.json` upgrades cleanly. Wired sections: **Terminal** (font size / line height / cursor blink → applied to the **live** pooled xterms + new ones via `terminalPool.applyTerminalSettings`), **Sessions** (auto-name toggle gating #97's `ai-title` label across sidebar / Overview / Canvas), and **Data & About** (open data folder, clear recents, app + `claude` versions — backend `open_data_folder` / `clear_recents` / `app_version` / `claude_version`). **Appearance** (accent + reduce-motion) → #102, **Behavior** (default view + confirm-destructive) → #103.

**Pluggable coding-agent CLI — abstraction + persistence (#101, part 1).**

- #101 Made the coding-agent CLI **pluggable** (part 1 of 2): a new `AgentSpec` abstraction (`src-tauri/src/agents.rs`) — a built-in catalog describing each agent's binary + how it spawns / resumes / seeds a session + capability flags (resume / auto-name / install-hint) — with the **`claude`** spec preserving today's exact flags (`--session-id <uuid>`, `--resume <uuid>`, positional prompt). Each session/schedule now **records its own `agent`** (`PersistedSession` / `ScheduledSession`, serde-default `"claude"`; TS `SessionRecord` / `SessionView` / `ScheduledSession` mirrors + record→view mapping). The spawn/resume **path is generalized off the `"claude"` literal**: `pty.rs` (`spawn_session` / `spawn_session_with_prompt` / `resume_session`) resolves the spec's `binary_name` + arg builders, and `commands.rs` (`spawn_session` / `spawn_worktree_agent` / `create_schedule` / `fire_due_schedules`) + the `lib.rs` boot-resume loop thread the agent (default Claude, stored on the record, resumed with the **stored** agent). **Claude is still the only agent and behaves identically** (verified). Codex spec + Settings "Agent" select + resume-capability gating + missing-binary / auto-name / UI-copy generalization remain for a future part 2.

**Settings — Appearance section (#102).**

- #102 Wired the **Appearance** section of the Settings modal (#100): an **accent color** swatch picker over the Catppuccin palette (`REPO_PALETTE`) — the chosen hex overrides the `--accent` token on `:root` (Peach is the default, stored as `""` so the token stands) — and a **Reduce motion** toggle that forces the motion killswitch on via a `body.reduce-motion` class (mirroring the `prefers-reduced-motion` block in `global.css`). Both apply on Save + boot through the store's `applySettingsEffects` (DOM-guarded for the test env); the `accentColor` / `reduceMotion` fields + persistence already existed (#100). Behavior section → #103.

**Settings — Behavior section (#103).**

- #103 Wired the **Behavior** section of the Settings modal (#100), completing its five sections: a **Default view on launch** segmented choice (Overview / Canvas) — applied once at boot in the store's `init` (main window only, so a mid-session view change is never overridden) — and a **Confirm destructive actions** toggle (default on) gating the Sidebar repo menu's three confirm steps (Forget folder / Kill all agents / Close all items — the `menuMode` state machine): off → the action runs immediately, on → the confirm sub-view shows (#91). Frontend-only; the `defaultView` / `confirmDestructive` fields + persistence already existed (#100).

**Detached canvas window — panel content scrolls (#104).**

- #104 Fixed overflowing panel content being **clipped with no scrollbar** in a detached canvas window (#84): the window wrapper `.body` (`CanvasWindow.module.css`) was a plain block, so the shared `CanvasSurface` `.area` (`flex: 1; min-height: 0; overflow: hidden`) had no bounded height — it grew to content height and each panel's internal scroller never engaged. Made `.body` a **flex column** (mirroring the main window's `.canvas` wrapper) so the height chain cascades and long FileViewer / diff / code content scrolls. CSS-only; the main-window Canvas was already correct.

**Detached canvas window — DOM renderer fixes garbled agent terminals (#105).**

- #105 Agent (`claude`) terminals rendered **garbled** — doubled/ghosted glyphs, misaligned box-drawing — in a detached canvas window (#84), a known **WebGL glyph-atlas / `devicePixelRatio`** artifact in a freshly-opened secondary native window. Fix: skip the `WebglAddon` in detached windows (`terminalPool.ts`, guarded by `!IS_MAIN_WINDOW`) so they use xterm's **DOM renderer** (visually equivalent, no artifact); the main window keeps WebGL, so its rendering is **provably unchanged** (the guard is true there). **Runtime-unverified** — xterm rendering isn't unit-testable and a window can't be popped out in the dev environment, so flagged for manual verification (per the #84 precedent); a residual stale-scrollback-replay contribution, if any, is a follow-up.

**Forget folder — complete teardown of items + schedules (#106).**

- #106 Made the repo menu's **Forget folder** (#31) a *complete* teardown: it killed the folder's agents but left its non-agent items (file/diff viewers, shell terminals #72 with PTYs still running) and pending schedules behind. Factored #91's item-teardown out of `closeAllItems` into a shared `closeRepoItems` helper (kills each terminal PTY as intentional, drops `overviewPanels[repoPath]`, prunes `terminalExits`, persists the cleared list) and called it from `forgetRepo` too; `forgetRepo` also **cancels the folder's pending scheduled sessions** (#93/#94, by `cwd`) and reports everything removed (agents + views + scheduled) in one summary toast. `closeAllItems` is unchanged (still keeps the folder in recents — the only difference between the two).

**Accent color updates hover / dim / on-accent tokens (#107).**

- #107 Fixed the Settings accent picker (#102) only overriding `--accent`, so button **hover stayed Peach** (and dim / on-accent surfaces too) because the **derived** tokens kept their defaults. Added a pure `accentCompanions(hex)` helper (a ~18%-lightened hover, the accent at `0.14` alpha for dim, a luminance-based fg) and made `applySettingsEffects` set `--accent-hover` / `--accent-dim` / `--accent-fg` alongside `--accent` for a custom accent — and `removeProperty` all four for the default (`""`) so the Catppuccin tokens stand. Hover / dim / selected-row / on-accent text now all track the chosen color; the derivation is unit-tested.

**Resizable sidebar (#108).**

- #108 Made the left sidebar **drag-resizable**: a thin right-edge handle (pointer-capture drag, `col-resize`, accent-dim on hover; double-click resets) sets its width, clamped to **[180, 560]** (default 260) and **persisted** across restarts — a dedicated Rust `sidebar_width` value with its own `get` / `set` commands (separate from the #100 Settings blob so the modal draft can't clobber a drag); the width restores + re-clamps on boot, with a debounced persist during the drag. Main-window only; the main content reflows via the existing flex layout.

**Clickable links in terminals (#109).**

- #109 Made `http`/`https` URLs printed in terminals **⌘-clickable** to open in the user's **default browser** — both agent `claude` PTYs **and** plain shell terminal panels (#72), since the single persistent terminal pool (`terminalPool.ts`) owns them all, so the change is one addition in `createHost()`. Loads a `WebLinksAddon` (`@xterm/addon-web-links`) whose custom `activate` handler opens **only on a ⌘-click** (`event.metaKey`) — a plain click is left to the terminal/TUI (drag-to-select, `claude`'s own mouse handling) — routing through a new **dependency-free** Rust `open_url(url)` command (registered in `lib.rs`, typed IPC `openUrl`) that **rejects any non-`http`/`https` scheme** and shells out to macOS `open <url>` **without a shell** (no injection), mirroring the `open_data_folder` precedent (no opener/shell plugin, no new capability). Only `http`/`https` is linkified (bare `host:port`, `file://`, `mailto:`, other schemes are out of scope); the scheme check (`is_http_url`) is unit-tested. Hover/⌘-click runtime behavior is best-effort (xterm rendering isn't unit-testable).

**Fix: a closed file viewer no longer resurrects on boot (#110).**

- #110 Made the #59 legacy `open_files` → `overview_panels` fold-in **one-shot and non-resurrecting**: boot no longer re-folds `open_files` (every real install migrated long ago) and instead **clears** the stale map (main-window only), so a closed/forgotten file viewer (e.g. a stuck `CLAUDE.md`) is gone on the next launch and never returns. Added the missing typed `setOpenFiles` IPC wrapper (the Rust `set_open_files` command already existed) to empty each repo's entry once. Closing a panel and Forget-folder now stick across restarts; `overview_panels` persistence is untouched.

**Compact sidebar — uniform 10px tree rows (#111).**

- #111 Dropped **every** sidebar tree-row label to a uniform **10px** via a new `--fs-meta-xs` token (`tokens.css`): the agent label `.rowPrimary` + rename editor, the repo header name `.repoName` + agent `.count`, and the file/diff/terminal/scheduled **item** row labels — so the left panel reads at one compact, consistent size. **Font-size only** (padding/heights/gaps and the busy-indicator slot #95 unchanged); non-row chrome (New/Schedule buttons, footer gear, context menus, section headers) untouched. Targeted class changes, not a blanket `--fs-meta-sm` swap. Pure CSS.

**Activity indicator — a third "finished / needs input" state (#112).**

- #112 Gave the `BusyIndicator` (#42/#55/#71/#88/#95) a **third state**: gray `--status-idle` (fresh / never-active) → blue shimmer (working) → solid **yellow** `--status-awaiting` dot with a soft glow and **no animation** ("finished — needs input") once an agent has been active and gone idle, leaving only when it goes busy again. Backed by a **persisted** `has_been_active` flag (`PersistedSession` + a persist-once `mark_session_active`, set on the first `busy==true` edge in `lib.rs`; threaded Rust → IPC → TS `hasBeenActive` and seeded into the store on load + set live in `setBusy`) so a previously-active agent shows yellow immediately on boot. Rendered in the sidebar rows + Overview cards in the same fixed 14px slot (no layout shift); reduce-motion → solid dots. Narrows the v1 "no awaiting-glow" rule the way #42 narrowed "no status system" (a third color on the dot, not an approval pill).

**Collapsible sidebar folders — a repo-color disclosure triangle (#113).**

- #113 Made sidebar **folders collapsible**, replacing the 8px repo-color circle (`.repoDot`, #35) with a **repo-colored disclosure triangle** (▶ collapsed / ▼ expanded, a `clip-path` shape so the inline `background: repoColor` still colors it, rotated via an `.expanded` modifier; sized to the `BusyIndicator` footprint #95). The header now carries **two independent controls** — its own toggle button collapses the folder (hiding **all** child rows: sessions, nested worktree agents #74, and file/diff/terminal/scheduled items, header + count kept) with `aria-expanded`, while the repo name **still filters Overview** (#34/#68, unchanged). Reverses the non-collapsible part of #34. State **persists** via a dedicated Rust `collapsed_repos` value (`get_collapsed_repos` / `set_collapsed_repos`, IPC + store `collapsedRepos` / `toggleRepoCollapsed`), separate from the Settings blob (mirroring #108). No change to Overview/Canvas or pooled terminals. **Reverted by #115** (the user did not want collapsible folders): the collapse behavior + its entire `collapsed_repos` persistence stack (TS + Rust) were removed and the disclosure triangle replaced by a **static, non-interactive repo-colored cube** (Lucide `Box`) in the same slot — folders are non-collapsible again (as in #34), all child rows always render.

**Scheduled-prompt skill autocomplete; sidebar cube revert (#114–#115).**

- #114 **Slash-command skill autocomplete** in the scheduled-session prompt field — a shared **`SkillAutocomplete`** component (used by both the `NewSessionModal` schedule step and the `ScheduledPanel`): typing `/` in command position opens a dropdown of the slash-invokable **skills** `claude` would offer, read best-effort by a new read-only Rust **`skills.rs`** (`list_skills(cwd)`) from project (`.claude/skills/*/SKILL.md` + `.claude/commands/**/*.md`) and user (`~/.claude/…`) dirs, deduped (project shadows user) and sorted; ↑/↓/Enter/Tab/click insert `/<skill-name> ` with a container-key guard so Enter/Escape drive the menu, not the surrounding modal. Plugin/marketplace skills out of scope.
- #115 **Reverted the collapsible sidebar folders (#113)** at the user's request — removed the collapse behavior and its entire `collapsed_repos` persistence stack (TS + Rust) and replaced the disclosure triangle with a **static, non-interactive repo-colored cube** (Lucide `Box`) in the same slot; folders are non-collapsible again (as in #34), all child rows always render.

**Activity-dot fix, Canvas Templates & Settings sizing (#116–#119).**

- #116 **Activity dot stays gray on a fresh session** until the agent does real work — the busy heuristic (`pty.rs`) no longer counts `claude`'s pre-input startup paint as busy, so a new interactive session stays gray (no startup blue/yellow flicker) until the first submitted prompt; a **seeded exception** keeps scheduled/prompt-seeded sessions (#93) going blue→yellow, and boot-resume is unchanged.
- #117 **Canvas Templates (part 1 of 2)** — reusable saved Canvas layouts whose leaves hold inert action **blocks** (`new-agent` w/ optional prompt, `new-terminal`, `open-file`, `open-diff`): the `CanvasTemplate` model, a **registry-driven** block set (`templateBlocks.ts`, mirroring #82), a full-screen **`TemplateEditor`** (reuses the BSP surface + a block palette), a **`TemplateManager`** (edit/rename/duplicate/delete), and a separate `canvas_templates` Rust persistence blob + store CRUD. Tab-strip ▾ **Templates** menu entry point.
- #118 **Canvas Templates (part 2 of 2)** — instantiation: **"New tab from template…"** → a **`TemplateUseModal`** picks one folder, opens a new tab, and `resolveTemplateBlock` runs each block **independently, best-effort** against that folder (agent via prompt-seeded spawn, terminal, file gated by `file_exists`, diff by `is_git_repo`). A failed panel stays pending with an **inline error + Retry** (and `open-file` a **Pick file** affordance), retaining its block so Retry re-runs it in place. No spawn-count guard.
- #119 **Settings modal — consistent larger fixed size** (720×600, height clamped to 90vh): replaced the content-driven `max-height` with a fixed `height` so every section renders at the same size; a tall section scrolls inside the content pane while the nav + action row stay put. CSS-only.

**Iteration passes 5–6 (#120–#121).**

- #120 **Iteration & self-improvement (code-quality) pass** — ran all gates on a clean tree, reviewed the #116–#125 cumulative diff in 3 independent fresh-context subagents, and applied only genuine correctness fixes (TemplateManager Escape-while-renaming discards; the #124 base-branch `<select>` added to the focus-trap; an orphaned `new-terminal` PTY is killed if its template panel closes mid-spawn); no behavior changes, no speculative perf edits; docs synced. Runs after all feature work.
- #121 **Iteration & UI/UX pass** — applied a **static-safe** a11y/consistency slice (DiffInspector toggle `aria-pressed`; Terminal status overlays `role="status"`/`role="alert"`); the screenshot-driven **visual feedback loop was deferred** (no GUI headless — flagged for interactive verification, per the #84/#105 precedent). The truly-last task in the chain.

**Custom slider, keyboard reach & branch creation (#122–#125).**

- #122 **Custom `Slider` component** — a reusable, on-token slider (a real `<input type="range">` styled via `appearance:none` + cross-browser pseudo-elements, value-driven accent fill, larger thumb, hover/active/focus states; full keyboard + ARIA parity) replacing the two native Settings range inputs (Font size, Line height). Landed before #121 so the UI pass polishes the custom slider.
- #123 **Arrow-key-reachable "Choose folder" picker** — the folder step of the New-session / Schedule-session modal now treats the picker as a virtual option after the recents: ArrowDown past the last recent highlights it (ArrowUp returns), Enter opens it, reachable even when the recents filter matches nothing. Both modes (same component).
- #124 **Create a new branch from the New-session modal** — a **"+ add branch"** option (arrow-key reachable) below the existing branches reveals a name input + base-branch dropdown (default current/HEAD); confirm `git checkout -b <name> [<base>]` + start, or **⌘⏎** `git worktree add -b` for an isolated worktree. Name validated backend-side (valid ref, must not exist). **New git write — branch creation** — expands the v1 "never creates branches" rule (CLAUDE.md updated).
- #125 **Create a new branch from the Scheduled-session modal** — the same "+ add branch" UI in schedule mode records a **new-branch intent** (name + base + create-new flag, serde-default) on the `ScheduledSession` and the poll loop **creates + checks it out at fire time** (best-effort, reusing #124's git write) before the pre-seeded launch.

**Fork & per-repo new-session shortcut (#126–#127).**

- #126 **Fork an agent's conversation into a new parallel session** — a `GitFork` button on every agent header (Overview cards + Canvas panels) branches the source via `claude --session-id <new> --resume <source> --fork-session` (CLI-verified; `AgentSpec::fork_args` / `pty.rs fork_session` / the `fork_session` command), leaving the source untouched. The fork is a normal tracked session with an app-owned UUID + serde-default `forked_from` (a "fork" badge), spawned non-seeded so it stays gray until first input (#116); on click it's selected and surfaced where the user is.
- #127 **Per-repo "New session" skips the folder step** — the sidebar right-click "New session" and the inline per-repo "+" now run `startRepoSession`: a git folder opens the modal straight at the branch step (branches preloaded, current selected, no folder flash), a non-git folder spawns immediately with **no modal**. The global "New session" / ⌘N keeps the folder step.

**Sidebar marker, Canvas-templates menu fix & row context menus (#128–#132).**

- #128 **Sidebar repo marker → folder icon** — swapped the #115 repo-colored cube (Lucide `Box`) for a closed **folder** (Lucide `Folder`), keeping the per-repo outline tint and the same static, non-interactive ~14px slot (`.repoCube` renamed `.repoFolder`); purely visual.
- #129 **Fix: the Canvas Templates ▾ dropdown couldn't open** — the tab strip's `overflow-x: auto` forces the computed `overflow-y` away from `visible`, so the menu dropping *below* the 34px strip was clipped to invisibility. The menu now renders **`position: fixed`** anchored to the button's `getBoundingClientRect()` (escaping the clip, mirroring the sidebar context menu), preserving toggle / outside-click / Escape / selection close and the strip's horizontal tab scroll.
- #130 **Repo context menu — Reveal in Finder / Copy path** — two non-destructive utilities on the repo-header menu: **Reveal in Finder** via a new Rust `reveal_path` (macOS `open <path>`, no shell — mirrors `open_data_folder` / `open_url`) + a `revealPath` IPC wrapper, and **Copy path** reusing the store's `copyToClipboard` (toasts "Copied path").
- #131 **Agent row context menu — Fork conversation / Copy session ID** — surfaced the shipped fork action (#126 `forkSession`) and a **Copy session ID** (`copyToClipboard(claudeSessionId)`) in the `SessionRow` right-click menu, so it reads **Rename · Fork conversation · Copy session ID · Remove**; no new backend.
- #132 **Non-agent row context menus** — `FileRow` / `DiffRow` / `TerminalRow` / `ScheduleRow` gained a deliberately minimal right-click menu via a shared `RowContextMenu`: a single **Remove** item (or **Cancel** for a schedule) reusing each row's existing `onClose` / `onCancel` (a terminal's Remove still kills its shell), ungated and red-danger styled. Pure frontend.

**Worktree header context menu (#133).**

- #133 Right-clicking a worktree's branch/badge header opens a two-item menu — **Reveal in Finder** / **Copy absolute path** (reusing #130's `reveal_path` + the clipboard helper); generalized the shared `RowContextMenu` (#132) from a single label to an `items[]` array.

**Fork robustness (#134, #138).** Forking a source with no conversation now fails gracefully and is shown unavailable up front.

- #134 Guard Fork against an empty / un-materialized conversation — a backend `title::has_conversation` check (reads the on-disk `~/.claude/projects/*/<uuid>.jsonl` log for ≥1 real turn, **fail-open**) returns a typed `SessionError::NothingToFork` instead of spawning a doomed code-1 panel; covers a never-prompted session and a just-created-never-used fork.
- #138 Show the Fork action as **unavailable** (dimmed + explanatory tooltip) when the source has no history — a persisted `forkable` flag emitted on the #97 title-worker busy→idle cadence (+ a boot/resume seed) gates the three Fork sites via `aria-disabled`; the #134 guard stays the safety net.

**Canvas panel move, header drag & title truncation (#135, #144, #146).**

- #135 Drag to reorder / reposition an existing Canvas panel — a pure `moveLeaf` (remove + re-split **reusing the source leaf's id + content**, so the pooled terminal reparents, computed atomically on drop) via a header grip, wired in both the main view and a detached window (#84).
- #144 The **whole Canvas panel header bar** is the drag handle (mirroring Overview #70) — the grip became a non-interactive hint; Fork / Copy-resume / Close and the `FileSwitcher` `stopPropagation` to stay clickable.
- #146 A long Canvas panel title **truncates** with an ellipsis (+ hover tooltip) so the header buttons stay visible — a `flex: 1` / `min-width: 0` fix to the #144 header (dropping the `flex-shrink: 0` that defeated the ellipsis).

**Canvas templates & tab-close behavior (#136, #137, #142).**

- #136 Optional **custom agent name** on Canvas-template `new-agent` blocks — a `content.name` (opaque-blob, no Rust change) passed to the prompt-seeded spawn; empty preserves the #97 auto-name.
- #137 Closing a Canvas tab **with contents** prompts **Kill / Keep / Cancel** (K / Enter / Esc) via a focus-trapped `CanvasCloseModal` that tears down the tab's leaves (kill agents + shell PTYs, remove file/diff/terminal/scheduled items, cancel schedules) — plus a Settings → Behavior default (`canvasCloseBehavior`: Ask / Always kill / Never kill). An empty tab still closes silently.
- #142 Opening a template into a **sole empty canvas** replaces it in place instead of leaving an empty tab behind (2+ canvases, or a canvas with panels, still append — unchanged).

**Markdown Kanban board (#141, #145, #143, #147, #149, #151).** An Obsidian-format `.md`-backed board, loaded like the file viewer and fully editable in-app.

- #141 Kanban **engine** — a pure Obsidian-format `parseBoard`/`serializeBoard` round-trip (frontmatter + `**Complete**` + `%% kanban:settings %%` preserved) plus the backend `write_text_file` (the app's **first arbitrary file write**, path-validated like reads) + its `writeTextFile` IPC.
- #145 Kanban **content type** — a `kanban` panel (reusing the `file` panel's refs + `overview_panels`), opened from the repo **Views** menu via the `.md`-scoped `FilePicker`, a draggable sidebar row, and a **read-only** `KanbanPanel` (columns/cards, markdown body via #44, horizontal scroll, hot-reload).
- #143 Kanban **editor** — full card & column editing with nested dnd-kit drag-and-drop (move a card between lanes = change status), debounced write-back (the #94 pattern), and a "New Kanban board" creation affordance (default To Do / Doing / Done).
- #147 Kanban panel **Board / Raw** toggle (mirroring the #73 FileViewer toggle) + auto-fallback to Raw for a structure-less `.md`.
- #149 **Editable**, auto-saving Kanban raw view — both views routed through #148's `useAutoSaveFile` (one buffer), the toggle round-tripping losslessly via #141's parse∘serialize.
- #151 Merged the two Kanban **Views** entries into one "Kanban board" item with an **in-picker create-or-open** flow (`FilePicker` gained `onCreate` / `createSuffix`; dropped the confusing `Plus` "New Kanban board" entry).

**Editable raw text & extended highlighting (#148, #150).**

- #148 Editable, auto-saving **raw text editor** — a shared `useAutoSaveFile(repoPath, file, active)` hook (read + hot-reload poll + debounced `writeTextFile` + dirty/focus reconcile + IME-safe + save status) backing an editable monospace `<textarea>` for markdown **Raw** + plain-text files in the FileViewer; rendered markdown, the Prism code view, and large files stay read-only.
- #150 File-viewer **syntax highlighting** — added **Java** + **INI / .env / .properties** (per-language Prism imports + `--syn-*` token rules; `.env` via a filename rule), and verified the existing languages still highlight.


> **#152–#310 condensed below.** These continue the index in the same one-line-per-task
> style; their full `### N. [x]` entries (Description / Subtasks / Acceptance / Implementation
> report) were removed to compact this file — per-task detail lives in git history and in each
> task's PR. _(Tasks #139–#140 were reserved on another branch; the Kanban content-type task was
> renumbered #142 → #145 to avoid colliding with the separately merged template task #142.)_

**Left-panel canonicity, Canvas/Kanban editing & the file-tree view (#152–#181).**

- #152 Left panel as single source of truth — template-opened non-agent items (`new-terminal`/`open-file`/`open-diff`) now register in `overviewPanels` so they show in the sidebar + Overview, and removing any left-panel item (via `removeOverviewPanel`/`dropSession`/`cancelSchedule` + new `pruneCanvasLeaves`) cascades to every Canvas tab and detached window.
- #153 Agent row "Open in canvas" context-menu item — new `openSessionInCanvas(sessionId)` reuses the agent's existing Canvas tab (or a detached window via `focusCanvasWindow`) if already open, else creates a new "Canvas N" tab, switches to Canvas view and focuses it (never duplicating the single PTY).
- #154 Kanban board block in the Canvas template editor — added an `open-kanban` block (`SquareKanban` icon, `config:"file"`, `liveKind:"kanban"`) to `templateBlocks.ts`, with `fileExists`-gated read-only resolution mirroring `open-file` and a `pickTemplateBlockFile` fix that preserves the block kind on Pick-file recovery.
- #155 Canvas panel drag: lift on drag-start, restore on cancel — a transient non-persisted `liftedLeaf` + `beginCanvasLift`/`commitCanvasLift`/`cancelCanvasLift` drive a derived `displayedLayout` so the panel is removed from view and others reflow during the drag; a `DragOverlay` ghost follows the cursor and the persisted `canvases` blob is written only on committed drop (retiring the atomic `moveCanvasLeaf`).
- #156 Kanban horizontal scroll in Overview mode — one-file CSS fix in `Overview.module.css` adding `min-width: 0` + a `.body > *` child-fill rule to the shared PanelColumn `.body` (mirroring Canvas's `.panelBody`) so the board's `overflow-x: auto` engages instead of being clipped.
- #157 "Big mode" maximize any item into a full-window modal — new transient `maximizedItem` state + `maximizeItem`/`closeMaximized`, a shared `ItemContent` renderer (single source of truth carrying the #84 ownership guard + a `MaximizedNote` placeholder), a `BigModeModal`, and a maximize icon on every Canvas/Overview header; the one-live-render-site rule keeps the pooled terminal/auto-save hook mounted in exactly one place.
- #158 FileViewer cutoff in Overview at narrow widths — CSS-only fix in `FileViewer.module.css` adding `min-width: 0` to `.viewer`, `overflow-wrap: anywhere` to `.markdown`, and a responsive toolbar (truncating `.status` + `flex-shrink: 0` on the Rendered/Raw `.segmented`) so text wraps and the toggle never clips.
- #159 Remove Kanban column move-left/right buttons — deleted the two `‹`/`›` chevron buttons and their `isFirst`/`isLast`/`onMove` props from `KanbanPanel.tsx`, steering column-to-column movement toward per-card drag (kept `moveColumn` in `kanbanOps.ts` for a future drag-reorder).
- #160 Kanban: commit card edits on confirm, not per keystroke — added local `editDraft`/`renameDraft` state in `KanbanPanel` so typing never calls `mutate`; edits write once through the #148 buffer on confirm (Done checkmark, Enter, or card blur via `relatedTarget` containment), with commit-on-switch and poll-pause guards; discrete actions (toggle/drag/add/delete) still save immediately.
- #161 Kanban board UI/UX polish pass — hover/focus-revealed card + column actions, border-state hierarchy, a `<DragOverlay>` `CardPreview` + dashed insertion placeholder for a clearer drop cue, empty-column hints, and the responsive toolbar fix deferred from #158; style-only, `.md` round-trip untouched.
- #162 Settings: auto-save vs manual save (⌘S) — new `autoSave` setting (default on); `useAutoSaveFile` gains manual mode (`dirty`/`manual`/`save`, no write on keystroke/blur but flush-on-unmount), a non-React `saverRegistry` singleton whose `saveFocused()` powers the ⌘S handler in `useKeyboardNav`, and FileViewer/Kanban toolbars swap the "Saving…" hint for a Save button — one chokepoint covers every file write.
- #163 File viewer "Browse…" — a native open-dialog (`pickFile` via `dialog:default`) opens any file on disk, represented as `{repoPath: parentDir, file: basename}` (new `splitPath` helper) so the existing `files.rs` dir-confined read/write validation passes with no backend change; wired via `setLeafFileAbsolute` (Canvas) / `moveOverviewPanelToFile` (Overview).
- #164 Clickable worktree badge → worktree-scoped Views menu — extracted a shared `ViewsMenu` component (the #82 addable-view set) reused by the repo menu and a new `WorktreeViewsBadge` popover on Canvas/Overview agent headers, with worktree-keyed panel grouping (`clusterRepoOf`/`renderPanelRows`) so opened views land under the worktree (sidebar) / parent cluster (Overview). _(The clickable badge was later replaced by #213.)_
- #165 "Open view" button on normal (non-worktree) agents — extracted a shared `ViewsPopover` (open/dismiss + drag-safety) and added an `OpenViewButton` (`PanelsTopLeft`) to normal-agent headers gated on `!worktreeParent`, opening the same `ViewsMenu` scoped to the agent's `repoPath`.
- #166 Worktree context menu: new session, open views, close worktree — expanded the `WorktreeHeader` right-click menu (threading in `parent` + `agentCount`) to New session (`spawnWorktreeSession` create-or-reuse), Views (shared `ViewsMenu`), Reveal/Copy path, and a confirm-gated Close worktree (`killAllAgents` + `closeAllItems`, ref-counted `git worktree remove`).
- #167 File tree viewer as a first-class view type — new repo-scoped `"filetree"` content kind rendered as sidebar row / Overview column / Canvas panel + an `open-filetree` template block, built client-side (folders-first) via a pure tested tree builder; folders expand/collapse, files open in the viewer, right-click offers Open/Kanban/Reveal/Copy. _(Later moved to the lazy per-level `list_dir` backend in #167's successor work; see #252/#264.)_
- #168 Collapsible left panel → icon rail — persisted `sidebar_collapsed` bool (plumbed end-to-end like #108's width, separate from the Settings blob), toggled by a footer chevron + ⌘B; the rail shows New/Schedule icons, a compact `ViewSwitch`, per-repo folder icons (left-click filters, right-click repo menu) with per-session `BusyIndicator` dots, and per-worktree branch glyphs, all context menus intact.
- #169 Refresh auto-generated session names promptly — backend-only cadence fix in `pty.rs`: each title-worker poke now schedules a bounded burst of re-reads (`TITLE_REREAD_OFFSETS_MS`, ~30s window) plus a spawn-time poke, so `claude`'s asynchronously-written `ai-title` surfaces within seconds without a click; `title_worker` rewritten to a `recv_timeout` schedule-aware loop.
- #170 Stop macOS auto-capitalizing/auto-correcting text inputs — new `src/inputProps.ts` exporting `noAutoCapitalize = {autoCapitalize:"none", autoCorrect:"off"}` spread into all text `<input>`/`<textarea>` fields across the app (spell-check left untouched) so identifiers/paths/`/`-prompts keep what was typed.
- #171 Copy path / Reveal in Finder on sidebar file & Kanban rows — enriched the `RowContextMenu` on file-viewer and Kanban rows with Reveal in Finder / Copy absolute path / Copy relative path (shared `filePathMenuItems` helper); added a separate `reveal_file_in_finder` backend command running `open -R` (select, not launch) distinct from folder-only `reveal_path`.
- #172 Empty-area (background) context menu for the sidebar — right-clicking empty sidebar space (or the rail) opens a non-repo menu: New folder… (native picker → new `add_recent` command / `addFolder` action, adds an existing folder to `recents` without spawning an agent), New session, Schedule session, Collapse/Expand, and Clear Overview filter.
- #173 Clickable task-list checkboxes in rendered markdown — for FileViewer rendered markdown + Kanban card bodies: a shared `markdownCheckboxes.tsx` with a `rehypeTaskListPositions` plugin (stamps each checkbox's nearest `li` source offsets), `toggleTaskMarker` (pure `- [ ]`⇄`- [x]` flip), and `makeCheckboxComponents`, persisting through each site's `useAutoSaveFile` buffer; added the `unist-util-visit-parents` dep.
- #174 Shift+arrow Overview navigation selects every panel kind — extracted the wall's grouping/ordering into pure shared `overviewClusters`/`overviewClusterKeys` (+ generic `adjacentId`) consumed by both `Overview.tsx` and `useKeyboardNav`, so Shift+←/→ reaches files/diffs/terminals/kanban/filetree/scheduled cards (not just agents), respecting the repo filter and wrapping; Shift+↑/↓ still passes to terminal scrollback.
- #175 File-tree click: jump to already-open file, open in current view — new `openFileFromTree(repoPath, file, kind)` makes clicks view-aware: Overview adds-or-selects the existing column; Canvas focuses an existing leaf across tabs (or raises a detached window) else appends to the active tab; always registers in `overviewPanels`. `addOverviewPanel` now returns the panel id so callers can select/focus.
- #176 Configurable Overview panel minimum width — new `overviewPanelMinWidth` setting (default 400px) driven through the Settings draft→Save→`applySettingsEffects` pipeline, which sets a `--overview-card-min` CSS var read by `.card { flex: 1 0 var(--overview-card-min, 400px) }`; a Slider (320–600/step 20) added to Settings → Appearance.
- #177 "Open view in this folder" on every panel + instant "New session" — put `OpenViewButton` on non-agent Overview/Canvas headers (using each panel's `repoPath`), and added a "New session here" item to the shared `ViewsMenu` that instantly `spawnSession(repoPath)` on the current branch with no modal (distinct from #127's modal-based flow).
- #178 Terminal panel vertical margin so the bottom row isn't cut off — one-line CSS bumping `.terminal` vertical padding 6px→12px; because it's the single pooled xterm node, this fixes Overview, Canvas, and shell terminals at once (FitAddon sees the smaller content box and claims one fewer row when the last would clip).
- #179 Show hidden dot-prefixed folders in the file tree and pickers — removed the blanket `name.starts_with('.')` directory skip in `files.rs`, keeping only the `SKIP_DIRS` heavy/vendored filter, so `.claude`/`.github` are listed across all surfaces. _(Later narrowed by the `.git`-into-`SKIP_DIRS` change so `.git` internals don't flood listings.)_
- #180 Show remote branches in the new-agent branch picker (auto-fetch + pull-on-select) — `list_branches` now also reads `refs/remotes` (excluding `*/HEAD`, deduped vs local into a new `remote` field) and a best-effort `fetch_remotes` (`git fetch --prune`, `GIT_TERMINAL_PROMPT=0` — the app's first git network read) runs on modal open; selecting a remote row reuses the #124 create-branch write (`git checkout -b <short> <remote-ref>` / worktree on ⌘⏎). New-session mode only.
- #181 "Pull" action in the repo + worktree context menus (ff-only) — new `pull_ff(cwd)` running `git -C <cwd> pull --ff-only` with `GIT_TERMINAL_PROMPT=0`, exposed via the `pull_branch` command + `ipc.pull` + a `pullFolder` action that toasts the result; a "Pull" item added to both the repo and worktree menus, gated on a known current branch, no confirm (ff-only can't lose work).

**Diff untracked/links, updater + patch-notes skeleton, worktree scheduling & Canvas tab reorg (#182–#205).**

- #182 Markdown links open in external browser — a `markdownLinkComponents` map (pure `isExternalHref`) makes every rendered-markdown `<a>` `preventDefault()` and route http(s) links to the Rust `open_url` (#109) — neutralizing non-web links so the webview can never be navigated away; covers FileViewer, Kanban card bodies, and `CardPreview`.
- #183 Diff view shows untracked files — backend-only `git.rs`: `working_diff` gains an untracked pass (`git ls-files --others --exclude-standard -z` + per-file `git diff --no-index` via a new `run_git_raw_allow_diff` accepting exit 0/1), appending synthesized `A` entries, `.gitignore`-respecting and bounded by `MAX_UNTRACKED_FILES` (2000).
- #184 File-tree menu: copy absolute + relative path — `FileTree.tsx` relabels "Copy path" to "Copy absolute path" and adds "Copy relative path", mirroring the #171 sidebar file-row convention; context-menu bottom clamp raised for the taller menu.
- #185 Activity dot yellow-blink fix — backend-only `pty.rs`: a pure `is_noninput_report` helper detects automatic terminal CSI reports (focus in/out 1004, X10/SGR mouse), so `write_stdin` no longer stamps `last_input` for them — stopping focus/click reports from tripping the #55 keystroke-echo guard and mis-flashing the busy dot to the #112 yellow state.
- #186 Distribute Canvas panels evenly — pure ops in `canvasTree.ts` (`leafCount`/`equalize`/`equalizeSplit`/`collectSplits`) rebalance a BSP layout to equal-area via leaf-count weighting; exposed as a `CanvasTabs` "Distribute evenly" button (whole canvas) + a border double-click (that subtree), applied remount-free via a `groupHandles` registry so pooled terminals keep scrollback.
- #187 Save current canvas as template — a pure inverse mapper `canvasToTemplate.ts` (registry reverse-lookup `blockForLiveKind`) turns a live canvas into template action-blocks (file/kanban carry the relative path, agent carries its custom name, repoPath dropped, scheduled/pending leaves collapsed); a new ▾ Templates menu item + `openTemplateEditorFromCanvas` seeds the `TemplateEditor` pre-populated.
- #188 Double-click header to rename agent — `CanvasSurface` (`LeafPanel`) and `Overview` (`SessionCard`) agent titles get an `onDoubleClick` inline-rename reusing the sidebar rename state machine + `renameSession` (#57); the 4px PointerSensor distance lets a stationary double-click coexist with the header drag handle; agents-only via a `canRename` gate.
- #189 Keyboard panel-creation modal (⌘K) — a two-step `CreatePanelModal` (type → target folder) opened by ⌘K, plus in-modal digits 1–6 and global ⌘⌥1–6 (matched on `e.code` to survive Option glyphs), driven by a shared unit-tested `panelTypes.ts` registry; all six creation paths reuse existing actions so panels land in sidebar/Overview.
- #190 Auto-update skeleton (keys deferred) — full-stack foundation reviving the #62-removed updater: gated `release.yml` (version-bump + signing-secret guards), tauri-plugin-updater/process wired, `src/updater.ts`, a store `update` slice, a sidebar-footer `UpdateIndicator` → `UpdateModal` → full-window freeze/progress overlay → relaunch, and a `last_version` Rust scalar driving a boot "Updated to v…" toast; `createUpdaterArtifacts` initially off. _(Activated once a real minisign keypair + GitHub secrets were provided.)_
- #191 Settings → Updates section — a new `"updates"` Settings pane: Check-for-updates button, current-vs-available version, a labelled "What's new" slot (`data-update-version` for #192), and Update-now-&-restart reusing #190's install flow; the sidebar indicator deep-links here via `setSettingsOpen(open, section?)` + a new `settingsSection` field.
- #192 Patch notes — per-version `src/patchnotes/<version>.json` loaded by pure `patchnotes.ts` (`import.meta.glob`, `patchnotesToMarkdown`) and rendered by `components/PatchNotes`; a not-yet-installed update's notes ride in the release (`latest.json` notes → `check()` `update.body` → store `update.notes` → the #191 slot); `release.yml` gains a notes-up-to-date guard + a body-generation script.
- #193 Dev-only mock update — a dev-gated mock engine in `updater.ts` (`setMockUpdate`/`isMockUpdate`) makes `checkForUpdate` return fake data and the install run a timer without relaunching; store `mockUpdate`/`clearUpdate` + a `window.__recue` global (`src/devMock.ts`, behind `import.meta.env.DEV`) and a DEV-only "Simulate update" button drive the whole UI; tree-shaken out of prod.
- #194 Kanban optional card checkbox — `kanban.ts` gains tri-state `Card.checked: boolean | null` and a `PLAIN_CARD_RE` so a plain `- bullet` (no `[ ]`) renders as a card and round-trips byte-stably as `- title` instead of being silently dropped; render omits the `<Checkbox>` when null and `toggleCard` guards null.
- #195 Clean up Kanban card UI — layout/CSS-only redesign moving `.cardActions` out of `.cardTop` to an absolutely-positioned top-right cluster revealed on `:hover`/`:focus-within` (with a card-colored gradient fade), freeing the title to span full width; all handlers and the #194 null-checkbox path intact.
- #196 Worktree header: icon-only marker + inline new-session — `WorktreeHeader` drops the literal "worktree" text badge (keeping the `GitBranch` icon as an accessible marker) and adds an inline `+` button → `spawnWorktreeSession(parent, branch)` (#166), mirroring the repo header's inline new-session `+`.
- #197 Click a worktree to filter Overview — broadens the Overview filter predicate (new `sessionInFilter` in `paths.ts`: `effectiveRepo === filter || repoPath === filter`) and restructures `overviewClusters` around a uniform `folderInFilter`, so a worktree folder (whose `effectiveRepo` is its parent, #96) can be a filter target; the `WorktreeHeader` name becomes a filter button.
- #198 Schedule a session into a worktree — full-stack: a serde-default `worktree: bool` on `ScheduledSession` threaded through `create_schedule`/IPC/store; `fire_due_schedules` gains `prepare_worktree_for_schedule` (creates the app-managed worktree at fire time and spawns the seeded agent there with `worktree_parent`); cancel cleanup reuses #199's guard. _(The modal's worktree checkbox was later replaced by #204's ⌘⏎ button.)_
- #199 Worktree auto-delete guard counts all item types — rewrites `cleanupWorktreeIfEmpty` around a pure unit-tested `worktreeHasItems(state, dest)` (agents + `overviewPanels` viewers + schedules, not just agents), runs it on `removeSession`/`removeOverviewPanel`/`cancelSchedule`, and adds an in-memory `worktreeParents` map so the parent needed by `git worktree remove` survives after the last agent is closed.
- #200 Worktree removal off the main thread — makes `remove_worktree` the codebase's first `async` Tauri command, running `git::worktree_remove` via `tauri::async_runtime::spawn_blocking` so a large-worktree FS delete no longer freezes the webview; the two bulk close paths in `store.ts` switch from `await` to fire-and-forget `void`.
- #201 Collapse duplicate "New session" menu items — `ViewsMenu` gains an `includeNewSession?` prop (default true); the repo context menu and worktree header menu (which already carry a top-level "New session") pass `false` to drop the redundant "New session here", while the standalone `ViewsPopover`/`OpenViewButton` keep it.
- #202 File-tree search (filename + content) — new Rust `search_file_contents(repo, query, limit)` in `files.rs` (deterministic sorted walk, 2 MB/file + 3-matches/file caps, `truncated` flag, char-safe `make_snippet`) plus an in-panel `FileTree` search UI running filename + content searches in parallel, `<mark>`-highlighted `path:line` snippets, and per-result **Reveal in tree** (lazy-expands ancestors) / **Open**.
- #203 Restyle sidebar-footer update indicator — pure CSS/markup restyle of the #190 `UpdateIndicator`: inset margins, hairline border + transparent fill (accent reserved to a 13px icon), single-line label with title truncation, de-emphasized `--bg-hover`, and a matching slim error variant; behavior unchanged.
- #204 Schedule modal ⌘⏎ worktree button — frontend refactor replacing #198's schedule-step worktree checkbox with the same "Worktree ⌘⏎" button + ⌘/Ctrl+Enter keybind the new-session branch step uses; `submitSchedule(asWorktree)` computes `useWorktree = asWorktree && folderIsGit`, feeding the unchanged backend path.
- #205 Canvas tab bar reorg — factors the Templates-menu mechanics into a reusable `useDropdownMenu()` hook, turns `+` into a "New tab" dropdown (New tab / New tab from template…), trims the ▾ Templates menu to template management, and moves the #186 distribute button to the far right. _(The `+` dropdown was reverted to a plain new-tab button by #222.)_

**Canvas tab UX, sidebar feedback/reorder, Windows parity & viewer highlighting (#206–#229).**

- #206 ⌘T new Canvas tab — bound ⌘T/Ctrl+T in `useKeyboardNav.ts` to switch to Canvas and `addCanvas()`, and surfaced the `⌘T` hint on the "New tab" affordance and trigger tooltip.
- #207 Sidebar click jumps to Overview — in `store.ts` `selectItem`, the "item not in active canvas tab" branch now switches to Overview and selects the item instead of a toast + deselect, generalized to all item kinds; reverses #79's no-auto-switch rule for the not-present case only.
- #208 Rewrite v0.0.1 patch notes — replaced `src/patchnotes/0.0.1.json`'s changelog entries with "welcome" + "highlights" intro categories framing ReCue as a first release (product pitch, not a task-by-task log); content-only.
- #209 Fix Settings → Updates spacing — added `gap: var(--space-8)` to `.fieldLabel` in `Settings.module.css` so "Current version 0.0.1" (and "Update available") no longer render label+value stuck together; CSS-only root-cause fix.
- #210 Sidebar feedback button — added a Lucide `Bug` footer button (between Settings gear and collapse chevron) opening a Google Form via `openUrl`→the http/https-only Rust `open_url` (#109); no new backend command.
- #211 Drag-reorder sidebar folders — the whole repo header is a dnd-kit `useSortable` grip (`repohead:` id) inside the app-level `DndContext`; order persists via a dedicated Rust `repo_order` value (`get/set_repo_order`, like `sidebar_width`), displayed as `mergeRepoOrder(folderOrder, repoOrder(...))`, with `App.tsx` `onDragEnd` calling `reorderRepos(arrayMove(...))`.
- #212 Sync worktree/branch label after in-terminal checkout — `store.ts` schedules a debounced (~600ms) `refreshBranches()` on each session's busy→idle edge (mirroring the #97 title-worker cadence), covering worktree labels and repo headers; frontend-only, no `git.rs` change.
- #213 Worktree agent header unify — worktree agents on Overview cards / Canvas panels now use the normal `OpenViewButton` and a static non-clickable "worktree" badge (styled like the "fork" badge); deleted the clickable `WorktreeViewsBadge` (#164).
- #214 Narrower collapsed rail — reduced `SIDEBAR_RAIL_WIDTH` from 56 to 44 (plus a `ViewSwitch.module.css` centering tweak) so the icon rail is only slightly wider than its ~36px buttons.
- #215 Update indicator margin + hover — in `Update.module.css` tightened `.indicator` margin (`--space-8`→`--space-4`) and added an accent-tinted hover light-up; introduced a new `--status-error-dim` token for the error-variant hover.
- #216 One-time update-indicator attention animation — a `@keyframes update-announce` (3× box-shadow/border pulse, no reflow) applied via a transient `.indicatorAnnounce` class, guarded by a module-level flag set on `animationend` so it plays once per session; disabled under reduced-motion. _(Superseded by the continuous glow in #287.)_
- #217 Cross-platform `open_url` (Windows feedback button) — rewrote `open_url` in `commands.rs` with a dependency-free platform-`cfg` `Command` (`open` on macOS, `cmd /C start "" <url>` on Windows, else `xdg-open`), keeping the http/https-only guard; fixes the #210 button + #109 ⌘-click opening a folder on Windows.
- #218 Nest scheduled worktree sessions — persisted a `worktree_path` on `ScheduledSession` (computed at create time, preferred at fire time) so pending worktree schedules nest under a `WorktreeHeader` sub-group (pure `scheduleNestsUnderWorktree`/`worktreeGroupPaths` helpers in `paths.ts`) and show the "worktree" badge on their Overview card.
- #219 Move collapse button to footer far-right — added `.footerCollapseToggle { margin-left: auto }` (neutralized in the collapsed rail), pushing the collapse toggle right of the flush-left Settings + Feedback buttons; CSS-layout only.
- #220 Ctrl+V paste on Windows — added the Tauri clipboard-manager plugin + a bounded `save_clipboard_image` (temp PNG) command; a Windows-gated `attachCustomKeyEventHandler` intercepts Ctrl+V/Ctrl+Shift+V, reads the clipboard (text, else image path), pastes via `term.paste()`, and suppresses the stray `^V`; macOS native ⌘V and Ctrl+C/SIGINT unchanged.
- #221 Fix "jiggly" Windows terminal font — in `terminalPool.ts` `createHost` explicitly `document.fonts.load()`s JetBrains Mono weights 400/500/700, then rebuilds the WebGL glyph atlas (`clearTextureAtlas()`, re-measure via transient `fontFamily` swap, `refresh` + `safeFit`); OS-neutral (WebGL retained on Windows), with a documented DOM-renderer fallback.
- #222 Revert Canvas "+" to plain new-tab — partial revert of #205: the "+" is again a plain one-click `addCanvas()` button and "New tab from template…" moved back into the "Templates ▾" menu; #206's ⌘T hint/keybind preserved.
- #223 Distribute-evenly button in Template Editor — added a `Grid2x2` toolbar button (disabled when `leafCount < 2`) reusing #186's pure `equalize` op; its handler bumps an `equalizeNonce` that keys/remounts the BSP surface so react-resizable-panels re-reads the equalized layout.
- #224 Template file block: full/absolute paths — added `filePathMode?: "relative"|"absolute"` to the open-file block and a pure `fileBlockTarget(block, cwd)` helper mapping relative→`{repoPath:cwd,file}` and absolute→`splitPath` parent-dir-as-root (#163), with a relative⇄absolute toggle + Browse in the Template Editor; no backend change.
- #225 Sidebar folder branch badge — added a subtle muted `.repoBranch` badge (from the existing `branches` map) next to each repo header, kept in sync via the #212 busy→idle edge plus new `focus`/`visibilitychange` listeners and a visible-only ~15s `BRANCH_POLL_MS` interval (paused when hidden). _(Moved to its own line under the header by #236.)_
- #226 Agent-header folder·branch indicator — replaced the standalone "worktree" badge (#213) on Overview `SessionCard` and Canvas `LeafPanel` with a `folder · branch` meta line for every agent (folder = `effectiveRepo`/`repoName`, branch = `branches[repoPath]`); fork badge kept.
- #227 More FileViewer languages — added Prism component imports (in dependency order, incl. `markup-templating` before `php`) and `LANG_BY_EXT` entries for C#, Go, Lua, SQL, Ruby, PHP, Gradle/Groovy, and Kotlin in `prism.ts`/`fileType.ts`; static (not lazy) imports for a no-async-flash UX.
- #228 Clickable collapsed-rail agents — extracted a shared `AgentContextMenu` used by both the expanded `SessionRow` and the rail; rail dots became `<button>`s with left-click select/jump (+ selected state) and right-click menu, plus a transient `pendingRenameSessionId` flag so Rename-from-rail expands the sidebar and auto-begins the inline rename.
- #229 Syntax-highlight the diff viewer — `DiffInspector.tsx` detects language once per file via `prismLang(file.path)` and renders lines through a shared `CodeContent` using `highlightToHtml` (reusing #227's set) in both unified and split rows, with matching `--syn-*` token CSS; per-line tokenization bounded by `MAX_DIFF_ROWS`.

**Diff viewer redesign, Kanban UI overhaul, file-tree git status/OS-drop, Mermaid & release v1.0.1 (#230–#256).**

- #230 Add a "Commits" source to the diff viewer — a third diff source (alongside Working/Compare #81) with read-only `list_commits(cwd, limit)` (bounded 100) and `commit_diff(cwd, sha)` (via `git show`, reusing `parse_unified_diff`); DiffInspector gains a Commits toggle + commit picker, and `commit_sha`/`diff_source:"commits"` persist per panel.
- #231 Redesign the diff viewer UI with selectable display modes — frontend-only redesign into two modes (default **Focused** single-file with a ‹prev/picker-pill/next› strip, and **Accordion** single-open cards), driven by a `diffDisplayMode` setting (Settings → Behavior) + an in-panel toggle; preserves Working/Compare/Commits sources, Unified/Split, and #229 highlighting.
- #232 Scheduled task time: show only time when date is today — `formatFireTime(fireAt, now)` in `src/time.ts` shows time-only when the fire time is the same local day, else month/day + time; injectable `now` param for testability. Applied in the shared helper so sidebar and Overview both benefit.
- #233 Redesign the in-app Kanban board UI — UI/CSS-only KanbanPanel overhaul (format unchanged): checkbox pinned top-left with full-width title, dimmed monospace detail/meta lines, an inline multi-line add-card composer (Enter submits, Shift+Enter adds detail lines), and redesigned per-column headers with a deterministic per-column accent from `REPO_PALETTE`.
- #234 Kanban card hover-lift animation — CSS-only `.card` hover lift (`translateY(-2px)` + soft shadow + `cursor: grab`) as a drag affordance, scoped `:not(.cardPlaceholder):not(.cardOverlay)` so it never fights dnd-kit's transform, with a reduced-motion override.
- #235 SkillAutocomplete: open dropdown above the textarea — pure-CSS anchor flip of the `.menu` rule from the textarea's bottom edge to its top edge (`bottom: calc(100% + …)`) so the `/`-command dropdown (#114) grows upward into empty space, fixing overlap in both the schedule step and ScheduledPanel.
- #236 Show the current branch on its own line under each sidebar folder header — moved #225's inline repo branch badge to a dedicated `.repoBranchLine` below the folder header (GitBranch icon + muted branch text), reusing the #225 branch data/sync unchanged; the line click still filters Overview.
- #237 Persist the diff viewer's display modes — added a `diffLineMode` setting beside `diffDisplayMode`; DiffInspector seeds both from settings and its in-panel focus/accordion + unified/split toggles now persist via `saveSettings`, so the last choice becomes the default for new viewers (open panels keep their mode). Source toggle deliberately not persisted.
- #238 Overhaul Kanban card interaction + unify create/edit into a single-field composer — made the whole card surface drag-only (title no longer click-to-edit; edit/delete via view-mode pencil/trash), replaced the edit title-input+body-textarea+overlay with one composer-style textarea + flow action row, and extracted a shared `splitCardText` so create/edit parsing can't diverge.
- #239 Settings section to configure Kanban column colors by name — new `kanbanColumnColors: {name,color}[]` setting (seeded with To Do/Doing/Done) + exported pure `kanbanColumnColor(name, configured)` (case-insensitive match, else hashed-name `REPO_PALETTE` fallback); a new "Kanban" Settings section edits rows with Catppuccin swatches + a free `<input type="color">`.
- #240 Make the Kanban "Add card"/"Cancel" buttons roomier — CSS fix for a real bug: `padding` used the undefined `--space-10` token (collapsing the shorthand to 0); replaced with `var(--space-6) var(--space-12)` (inherited by #238's edit Save/Cancel).
- #241 Attention-grabbing glowing tooltip beside the sidebar feedback button — a fixed-positioned (via `getBoundingClientRect`) glowing pill "Report bugs and request features" shown on launch for 10s beside the #210 Bug button, dismissed on hover/focus; reuses the #216 `update-announce` pulse with a reduced-motion static-glow fallback.
- #242 Fix the undefined `--space-10` token app-wide — swept every remaining `var(--space-10)` → `var(--space-12)` (Canvas, DiffInspector, FileViewer, KanbanPanel, TemplateEditor) to restore lost padding (same root cause as #240); the curated scale (which omits 10) left unchanged.
- #243 Give the repo's own branch line its own right-click context menu — extracted `RepoBranchLine` with an `onContextMenu` menu (New session, Views, Reveal, Copy path, **Copy branch name**, Pull, **Fetch**, Change color, Kill all agents/Close all items — no Forget/remove), plus a new `fetchFolder` action reusing the `fetch_remotes` command; left-click still filters Overview.
- #244 Remove the Delete button from Kanban card edit mode — dropped the edit-mode `cardEditDelete` (Trash2) button, leaving Save + Cancel only; deletion stays on the view-mode hover trash icon (same `onDelete`).
- #245 Kanban add/save buttons: Enter indicator + thinner vertical padding — added a `.btnKbd` `<kbd>⏎</kbd>` chip beside the two submit buttons (composer "Add card" + editor "Save"), gave them inline-flex layout, and thinned vertical padding `--space-6`→`--space-4` (horizontal unchanged so Cancel stays height-matched).
- #246 Make a Kanban card's description body part of the drag surface — removed the body wrapper's `noDrag` so a press-drag on the description moves the card, and added `user-select:none` to `.cardBody`+`.cardTitle` to stop native text selection; body links/checkboxes still clickable via the 4px PointerSensor activation distance.
- #247 Overview filter: clicking the repo's own branch line shows only that branch — replaced the bare `overviewRepoFilter: string` with `OverviewFilter = {path, mode:"all"|"own"}`; "own" (branch-line click) shows only the repo's non-worktree agents/panels/schedules (worktrees hidden) while "all" (folder click) keeps them; threaded through `paths.ts`, store clusters, Sidebar highlights, Overview label, and `useKeyboardNav`.
- #248 Don't strike through a completed Kanban card's text — one-line CSS removal of `text-decoration: line-through` from `.cardDone .cardTitle`, keeping the muted-gray dim so a checked card stays gently de-emphasized with just the checkmark.
- #249 Canvas tab-strip icon buttons: shrink the new-tab/Templates/Distribute cluster to match × — shrank `.tabAdd` from 24×24 to 20×20 (matching `.tabClose`) and added a `.tabMenuTrigger` modifier keeping 20px height but `width:auto` for the Templates ▾ button's two icons; purely visual.
- #250 Hide a repo folder's branch line when the folder has no own items — gated `RepoBranchLine` on a new reactive `hasOwnItems` flag (own sessions OR overviewPanels OR own-folder schedules; worktree sub-groups deliberately don't count), so a recent/empty git folder no longer shows a stray branch line while its header still renders.
- #251 Repo branch line: show active-filter selection like a worktree branch does — CSS-only: added `border-radius: --radius-chip` to `.repoBranchLine` and `background: --accent-dim` to `.repoBranchActive` (mirroring `.worktreeActive`), so the "own"-mode active branch line gets the same accent-dim selection box + accent text as a worktree branch.
- #252 Color file-tree rows by git status — new lightweight backend `file_statuses(repo)` (`git status --porcelain=v1 -z`, mapping `??`→A / D→D / else M, renames → del(old)+add(new)) feeding a store `fileStatuses` map refreshed on the #212 busy→idle edge; FileTree tints new=green/edited=yellow (name+icon), folders roll up highest-severity (red>yellow>green), deletions show red struck-through ghost rows. Pure helpers in `FileTree/fileStatus.ts`.
- #253 Drag OS files into the file tree to move them into the repo — second deliberate `files.rs` write `move_into_repo(repo, dest_subdir, source)` (destination-confined, refuses collisions, data-safe same-volume rename else cross-volume copy-then-remove); `src/osFileDrop.ts` subscribes each webview's window-global `onDragDropEvent`, converts physical→CSS px via `devicePixelRatio`, hit-tests `data-filetree-droptarget`, highlights the target, and `moveFilesIntoRepo` moves + bumps a per-repo `fileTreeRefresh`.
- #254 Render Mermaid diagrams in rendered markdown (file viewer) — added lazy-loaded, bundled/offline `mermaid` (own chunk) with pure helpers in `FileViewer/mermaid.ts` (`loadMermaid` one-time init: dark theme, `securityLevel:"strict"`, system font) and a `MermaidBlock`; wired via an **opt-in** `code` override (`MermaidCode`) only at the FileViewer call site so Kanban/PatchNotes/Settings are unaffected; invalid diagrams fall back to the raw block + a muted note.
- #255 Keyboard navigation between files in the diff viewer — made the DiffInspector panel focusable (`tabIndex={0}` + `:focus-visible`) with a panel-scoped `onKeyDown`: ←/→ step files in Focused mode, ↑/↓ step the open card in Accordion mode (scrolled into view), reusing the wrapping `stepFile`; a pure `diffNavDelta` decides the delta, ignored on <2 files, modifiers, or when an input/picker has focus.
- #256 Release v1.0.1 — version bump 1.0.0→1.0.1 in `tauri.conf.json`/`package.json`/`package-lock.json`, plus the first real in-app changelog `src/patchnotes/1.0.1.json` (features #252–#254, improvement #255) derived from `git log v1.0.0..HEAD`; pushed to `main` to trigger the release pipeline (produces a draft a maintainer must publish).

**Kanban/diff refinements, terminal performance, NL scheduling, file-tree ops & release v1.0.2 (#257–#282).**

- #257 Larger, vertically resizable Kanban card input fields — bumped both `KanbanPanel.tsx` textareas (add-card composer + inline editor) from `rows={3}` to `rows={5}` and added `min-height: 88px` / `max-height: 320px` over the existing `resize: vertical`.
- #258 Diff viewer sort by occurrence (default) or alphabetical, persisted — added `Settings.diffSortOrder` and a pure `DiffInspector/diffSort.ts` (`reconcileOccurrence`/`sortFiles`) + a segmented Recent/A–Z header toggle; occurrence order is a per-panel `path→seq` map (only the mode preference persists).
- #259 Eager worktree+branch creation when scheduling into a worktree — `create_schedule` now `git worktree_add[_new_branch]` up front (guarded by `!dest.is_dir()`), made `prepare_worktree_for_schedule` idempotent, and added ref-counted cleanup on cancel via `cleanupWorktreeIfEmpty` + the `worktreeUsesPath` guard; unblocks #279/#280.
- #260 Fix terminal input lag — don't hold the global session lock across blocking PTY writes — `Session.writer`/`master` became `Arc<Mutex<…>>` so `write_stdin`/`resize_pty`/`scrollback` clone the per-session Arc and drop the global map guard before the blocking `write_all`+`flush`/`resize`/`snapshot`, so one flooded terminal no longer stalls others.
- #261 Fix global UI lag — shrink output IPC payload and throttle terminal writes — changed `OutputPayload` from `Vec<u8>` to base64 `b64: String` (new `decodeOutput.ts`) and coalesced terminal writes to one `term.write` per `requestAnimationFrame` in `terminalPool.ts`, plus dropped a per-chunk linear scan in `store.ts onOutput`.
- #262 Terminal last line falls below visible area — guarantee bottom clearance — bumped `.terminal` bottom padding (~20px) and added a conservative row-fit guard in `terminalPool.ts` comparing `rows × actualCellHeight` to the content box, doing `term.resize(cols, rows-1)` before `resizePty` when the last row would overflow (sub-row FitAddon rounding fix).
- #263 Make New/Schedule Session modal open instantly (load branches async) — made `startRepoSession` synchronous (opens with `newSessionInitialBranches: null`, no pre-open `await ipc.listBranches`) so the modal renders immediately and the existing detection effect fills the list, with a `branchesLoading` cue gating branch-step actions.
- #264 File tree refreshes when files change on disk — added `bumpFileTreeRefresh(repo?)` driving the in-place, expansion-preserving re-list; triggered on the busy→idle edge, a 5s visibility-gated poll (debounced), and window-focus (polling chosen over an fs-watcher, no new native dep).
- #265 Fix scheduled-worktree card header (three lines / full-width badge) — wrapped `ScheduleCard`'s `.name` + conditional `.worktreeBadge` together in the existing `styles.agentTitle` row (mirroring `SessionCard`) so the header is two clean lines instead of three; no CSS change.
- #266 "Checkout branch…" in the repo context menu — added a `"checkout"` `menuMode` picker sub-panel (local/remote branches + create-new inline) plus store `checkoutFolderBranch`/`createFolderBranch` (checkout without spawning an agent, then refresh branches/file-statuses), reusing existing `checkout_branch`/`create_branch` commands (no backend change).
- #267 Context menu on file-tree folders & files (new folder, delete) — added path-validated `create_dir`/`delete_path` backend commands (files.rs, the 3rd/4th deliberate writes; refuse repo root/symlinks/`..`/collisions, `windows_safe_seg` guard) wired through `ipc.ts`/`store.ts` (`createFolder`/`deleteTreePath`) and the FileTree inline menu with confirm-gated deletes.
- #268 Natural-language launch-time input for scheduled sessions — replaced both `datetime-local` widgets with a free-text field parsed by a custom `parseWhen(input, now)` in `src/time.ts` (durations `1h`/`90 min`, clock `6pm`/`9:30am` rolled to tomorrow if past, `today`/`tomorrow`, explicit dates — no new date lib) with a live "Starts …" preview; empty/unparseable disables submit.
- #269 "Start now" button on scheduled sessions — extracted `fire_one_schedule(...)` from the poll loop and added a `fire_schedule_now(id)` command + `startScheduleNow` action reusing the `schedule://fired` → `onFired` path, with a Play button in the ScheduledPanel, Overview ScheduleCard, and sidebar row (fires a worktree schedule into its eager #259 worktree).
- #270 Gray out gitignored files/folders in the file tree — added `--ignored=matching` to the single `git status` read and a `FileStatus::Ignored` (`"I"`) variant (`parse_porcelain_z`); FileTree dims ignored rows with `--text-muted`, kept out of the folder severity roll-up (a folder grays only when its own path is ignored) and below tracked A/M/D tints.
- #271 Copy button on rendered markdown code blocks (FileViewer) — added a `pre` override (`CodeBlockWithCopy`) to FileViewer's `markdownComponents` rendering a hover-revealed Copy button that copies the block's raw text via `copyToClipboard`; FileViewer-scoped only (inline code and mermaid excluded).
- #272 Usage meter turns red at 90% (not 95%) — one-line threshold change `const critical = pct >= 90` in `UsageBar.tsx` (plus matching doc comments).
- #273 Make Canvas-tabs "+" icon same visual size as neighbors — bumped the Lucide `Plus` from `size={14} strokeWidth={1.5}` to `size={16} strokeWidth={2}` so its visual weight matches `LayoutTemplate`/`Grid2x2` (box stays 20px).
- #274 Fix Template Editor block-config layout — CSS fix in `TemplateEditor.module.css`: `.pathModeBtn` dropped `flex: 1` for `flex: 0 0 auto` + `min-width: 72px` (compact Relative/Absolute pair), and the `new-agent` prompt textarea flexes to fill height (`min-height: 140px`, `flex: 1` with `min-height: 0` on wrappers).
- #275 Export / import Canvas templates (JSON) — added store `exportTemplate` (native save dialog → pretty JSON via `write_text_file` reusing the #163 parent-dir-as-root consent trick) and `importTemplate` (`pickFile` → validated `parseTemplateJson` in new `templateIo.ts` → `saveTemplate` with a fresh id), with per-row Export / footer Import buttons in the Template Manager; no new backend command or capability.
- #276 Kanban — Enter creates a card and reopens a fresh composer — `BoardColumn` `submitComposer` success path now clears text + keeps the composer open + re-focuses via `composerRef` instead of `cancelComposer()`; an empty Enter or Escape still closes.
- #277 Kanban — transient "undo" button after deleting a card — capture `lastDeleted = {col,idx,card}` (panel-local) before delete and render an inline `UndoRow` at that index that restores via a new pure `insertCardAt(board,col,idx,card)` op (kanbanOps.ts); single-level, transient (cleared on file switch, never persisted).
- #278 Diff viewer — per-file "seen" marker (Seen / Not-seen / Changed-since-seen) — added client-side `diffSeen.ts` (`fileDigest`/`seenState` over the full parsed hunks) persisted in a dedicated Rust `diff_seen` scalar (out of the settings blob), with an icons-only toggle button + `s`/`S` keybind in both Focused and Accordion modes (a changed file flips its marker).
- #279 Scheduled worktree should not appear as a duplicate top-level folder when it starts — `store.ts onFired` now prepends `session.worktree_parent ?? session.repo_path` to recents (parent repo for a worktree), matching the backend's `sched.cwd` recent so no phantom empty top-level `RepoGroup` renders.
- #280 Fix Canvas "no longer pending" for scheduled agents (on fire + detached windows) — added pure `canvasSchedule.ts` `rewriteScheduledLeaves` so `onFired` swaps a `{kind:"scheduled"}` leaf to the live agent content (preserving leaf id for pool reparent + broadcasting `canvas://changed`), and made schedules window-global via a new Rust `broadcast_schedules` → `schedule://changed`/`schedule://fired` that detached windows subscribe to.
- #281 Release v1.0.2 — bumped version to `1.0.2` in `tauri.conf.json` + `package.json` and authored `src/patchnotes/1.0.2.json` (regenerated from `git log v1.0.1..HEAD`, grouped feature/improvement/fix); push to `main` triggers the draft-release pipeline.
- #282 Windows parity audit + remediation (pre-v1.0.2 release gate) — fix-mode sweep of all 13 landmine categories; fixed one confirmed defect — `store.ts copyToClipboard` now routes the write through `ipc.clipboardWriteText` (tauri-plugin-clipboard-manager) on Windows (WebView2 rejects `navigator.clipboard.writeText` from a context menu), keeping the macOS Web-API path byte-for-byte; the other 12 categories confirmed already-seamed, logged in `TRAJECTORY_TO_WINDOWS.md`.

**Kanban/big-mode chords, recurring sessions, Clone Repo & auto-continue-after-limit (#283–#310).**

- #283 Kanban "move all cards right" button — a per-column header button (Lucide `ChevronRight`, glyph set in #288) that moves every card into the adjacent right column in one click, via new pure op `moveAllCardsRight(board, fromCol)` (rightmost/empty columns show no button; cards keep `checked` state).
- #284 ⌘E / Ctrl+E toggle big mode — a global chord toggles the #157 `BigModeModal` for the selected item, via store `toggleMaximizeSelected()` + pure `contentForSelected(state)` and a capture-phase handler in `useKeyboardNav.ts` (works in both views/windows, safe inside a PTY; discoverability via `kbdHint` tooltips).
- #285 Place new panel next to its worktree/branch agent — a newly created non-agent panel lands immediately to the right of an agent running in its exact folder, via pure `placeAfterAnchor`/`anchorAgentForPanel`/`repositionPanelAfterAgent` in `store.ts` (persists through the existing `reorderOverview`→`set_overview_order` path; no-op when no agent shares the folder).
- #286 "Update now" above patch notes — pure JSX reorder in `Settings.tsx`'s Updates pane so the install button/progress bar renders directly under the version label and above the (arbitrarily tall) "What's new" notes, keeping the install action reachable.
- #287 Continuous glowing update indicator — replaced the #216 one-shot 3× blink on the sidebar `UpdateIndicator` with a continuous breathing accent glow (new `@keyframes update-glow` + `.indicatorGlow`; reduced-motion degrades to static), removing the `updateAnnounced` one-shot guard.
- #288 ">" chevron for Kanban move-all button — pure icon swap from `ArrowRightToLine` (→|) to Lucide `ChevronRight` (>), same size/handler/visibility.
- #289 Empty schedule prompt field — removed the misleading `placeholder="Initial prompt for claude…"` from the schedule-step `SkillAutocomplete` (value was already always empty; `ariaLabel` kept for accessibility).
- #290 esbuild dev-server advisory fix — bumped vite `^7.0.4`→`^7.3.6` and esbuild to 0.28.1 (regenerated lockfile) to clear GHSA-g7r4-m6w7-qqqr, bringing `npm audit` to 0 vulnerabilities; Rust `cargo audit` already clean.
- #291 FileTree folder context menu additions — folder rows gained Rename… (inline, new `"rename"` `MenuMode`), Reveal in Finder/Explorer, Copy absolute path, Copy relative path, backed by a new generic Rust `rename_path(repo,from,to)` command (path-validated via `validate_new_segment`/`windows_safe_seg`) + `renamePath` IPC + `renameTreePath` action.
- #292 macOS permissions fix (mic/voice + protected folders) — added `src-tauri/Entitlements.plist` (audio-input + `cs.disable-library-validation`, no App Sandbox) wired via `bundle.macOS.entitlements` under Hardened Runtime, four `NS*FolderUsageDescription` strings in `Info.plist`, a `scripts/sign-macos-local.sh` ad-hoc re-sign helper, a guarded Developer-ID sign+notarize in `release.yml` (dormant until `APPLE_*` secrets), and `docs/macos-permissions.md`; deliberately reverses the "no code signing" scope rule (fixes the TCC re-prompt-then-fail root cause).
- #293 Global Kill all agents / Close all items — app-wide teardown on the sidebar empty-area (#172) background menu via store `killAllAgentsGlobal`/`closeAllItemsGlobal` (iterate the parent-folder set through `killAgentsInRepo`/`closeRepoItems`, one summary toast), plus a backward-compatible inline `confirmLabel` two-step confirm on `RowContextMenu` honoring `confirmDestructive`.
- #294 Three-dots session-options menu + Recurring sessions — added a ⋯ overflow menu next to "Schedule session" and shipped a full **recurring session** subsystem: a persisted `RecurringSession` record (backend `create/list/cancel/update/fire_due/fire_one_recurring`, sharing the 5s poll tick) that owns a rotating child agent (each fire kills the old child + spawns a fresh seeded uuid in the same panel via content `kind:"recurring"`), with `RecurringPanel`/`RecurringCard`/`RecurringRow` surfaces, a NewSessionModal recurring mode, worktree support, and pure `intervalToSeconds`/`formatNextRun` helpers.
- #295 Clone Repo — added "Clone Repo…" (URL + parent-dir picker) backed by Rust `git.rs` `clone_repo`/`ensure_main` + pure `repo_dir_name(url)` (network guards `GIT_TERMINAL_PROMPT=0`/`GIT_SSH_COMMAND=ssh -oBatchMode=yes`, refuse non-empty dest), registers the folder and auto-starts a `claude` session; a new deliberate git write.
- #296 Auto-continue after limit reset — opt-in Claude-only behavior (setting `autoContinueAfterLimit`, default off) that arms when usage `usedPercent >= ~100`, waits for reset confirmed by BOTH time AND percent<90, then nudges each running Claude agent with Enter→`continue`→Enter; frontend/store-only via pure reducer `evaluateAutoContinue` in new `autoContinue.ts` (surfaced in the ⋯ menu + Settings → Sessions; armed poll cadence 45s).
- #297 Per-agent auto-continue opt-out — a persisted `auto_continue_disabled` bool on `PersistedSession` + `set_session_auto_continue` command, surfaced as a compact `AutoContinueToggle` on each Claude agent's Overview card / Canvas panel (shown only when the global setting is on); the #296 fire step filters disabled sessions out of `liveClaudeIds`.
- #298 Clone lands on real default branch — renamed `git.rs` `ensure_main`→`ensure_checked_out_branch` to leave git's cloned default branch (main/master/…) as-is and only fabricate `main` for a truly empty/unborn clone, and reworded the misleading `CloneRepoModal` "starts on main" copy.
- #299 Non-blocking background clone with phantom folder — made `clone_repo` an `async` command running the git shell-out in `spawn_blocking`; the modal closes immediately and a transient non-draggable `PhantomRepo` (dimmed "Cloning…" + indeterminate progress bar, rendered outside the dnd-kit `SortableContext`) appears via a store `cloningRepos` slice, resolving per-keyed-id to add recents/spawn/toast on success or error-toast on failure.
- #300 Recurring-session bug fixes — fixed "now" not firing immediately (backend `create_recurring` now fires the first child at create time when `first_fire_at <= now` by reusing `fire_one_recurring`) and the duplicate/ghost panels (idempotent optimistic adds deduping by id in `createRecurring`/`createSchedule`, plus a hardened `onFired` that stashes-and-adopts a child whose record hasn't landed).
- #301 Schedule-session button layout — CSS/JSX polish so the "Schedule session" label ellipsizes on one line (`.scheduleLabel` `flex:1;min-width:0`), the clock icon/hint never distort (`flex-shrink:0`), and the "…" button narrows (`width 30px→24px`) at any sidebar width.
- #302 Move auto-continue checkmark after label — in the shared `RowContextMenu` renderer, emit the label before the `.menuCheck` slot and swap its `margin-right`→`margin-left`, so the checkable "Auto continue after limit reset" row shows its checkmark trailing with no leading gap.
- #303 Trim sidebar background menu — removed New session, Recurring session…, and Auto continue from the empty-background `bgMenuItems` and moved Clone Repo… directly under New folder… (part one of the two-card reorg).
- #304 Remove Clone Repo from ⋯ menu — dropped the Clone Repo… entry from `dotsMenuItems` so Clone Repo has exactly one home (the background menu, per #303), leaving the ⋯ menu with Recurring session… + Auto continue.
- #305 Show per-agent auto-continue checkbox only at limit — gated the #297 `AutoContinueToggle` behind a new shared pure helper `isLimitReached(usage)` in `autoContinue.ts` (mirrors the reducer's arming predicate via `ARM_THRESHOLD_PCT` 99.5, fail-safe hide when usage unavailable) so the checkbox appears only once the 5-hour limit is reached.
- #306 Remove redundant in-panel Cancel — deleted the duplicate "Cancel schedule"/"Cancel" button (and dead `.cancel` CSS) from `ScheduledPanel` and `RecurringPanel`, since every pending record is still cancellable from its sidebar row and Overview card (Start now / Edit / fields retained).
- #307 Glowing indeterminate clone progress bar — CSS-only polish making the #299 phantom bar visibly alive: a bright accent comet-glint `.phantomBar` gradient sweeping across a breathing `@keyframes clone-glow` box-shadow on `.phantomTrack` plus a rail-icon drop-shadow glow (bar stays indeterminate; reduced-motion freezes to static, `color-mix` fallbacks throughout).
- #308 Blobless partial clone — added `--filter=blob:none` to the `git.rs` `clone_repo` shell-out for dramatically faster large-repo clones (full history + all refs, lazy blob fetch), deliberately not `--depth`/`--single-branch`; new test `clone_preserves_full_history_not_shallow` guards against a shallow regression.
- #309 "Enable auto restart on limit reset" prompt button — a new `AutoContinuePrompt` in the sidebar footer above the usage bar (shown only when the Claude limit is reached via shared `isLimitReached`, the setting is off, and a new suppression toggle `promptEnableAutoContinueAtLimit` default true) whose click flips on `autoContinueAfterLimit` (store `enableAutoContinueAfterLimit`) and self-hides.
- #310 Empty schedule "Launch time" field — changed the `NewSessionModal` on-open reset seed from `DEFAULT_WHEN = "in 5 min"` to `""` for the schedule step (recurring "First run" still seeds `"now"`), revealing the existing placeholder/hint; existing gating already handles the empty field.

**Post-groundwork fixes & features (#311–#344).** Template/Kanban polish, the macOS
permissions signing fix, the busy-dot flicker fix, usage-bar hardening, Light mode,
watch notifications & global search.

- #311 Custom tab name in the "New tab from template" modal — an optional "Tab name" field on the folder step; `instantiateTemplate` gained an optional `tabName` (`tabName.trim() || template.name`), so a blank value keeps the template-name fallback byte-for-byte.
- #312 "Add to .gitignore" in the file-tree row context menu — appends the row's repo-root-relative **anchored** pattern (`/src/foo.ts` for a file, `/build/` for a folder) to the repo-root `.gitignore`, creating it if absent and never duplicating a line already present.
- #313 Revert the glowing clone progress bar to a plain indeterminate loading bar — CSS-only revert of #307's glow/comet/drop-shadow treatment back to the #299 plain accent stripe on a flat track (still indeterminate, no `aria-valuenow`).
- #314 Make macOS mic/folder/system-settings permissions actually stick — finished #292: a plain `tauri build` is linker-signed **ad-hoc** (entitlements + Hardened Runtime only applied when a signing identity is set), so `scripts/sign-macos-local.sh` (`npm run build:mac`) does a stable self-signed re-sign so a TCC grant persists.
- #315 Keep the activity dot blue while a background process is still working — fixed the blue↔yellow flicker: once the busy dot would otherwise oscillate (output bursts spaced >700ms apart), the session goes **sticky** and holds blue on a ~5s window until output is truly quiet (`pty.rs` monitor).
- #316 Fix the 5-hour usage bar reading a stale/expired OAuth token — recent Claude Code keeps the refreshed token in the **macOS Keychain** but leaves a stale `~/.claude/.credentials.json`; `usage.rs` now falls through to the Keychain when the on-disk token is rejected.
- #317 Truncate the "New session" button label with an ellipsis on overflow — wrapped the bare label text node and added `min-width:0` to `.newButton`, so a narrow sidebar (#108) ellipsizes the label instead of wrapping or pushing the `+` icon / keyboard hint out.
- #318 Keyboard shortcuts reference section in Settings — a read-only "Shortcuts" section listing every app keybind, grouped and labelled (later made **editable** by the keybind rework / #373).
- #319 Confirm before clearing recent folders in Settings — gated Data & About → "Clear recents (N)" behind the app's inline two-click confirm, honoring the `confirmDestructive` setting (#103) like every sibling destructive action.
- #320 Stop a newly-created agent from scrambling other agents' terminals — the shared-WebGL-glyph-atlas bug: #221's per-creation `clearTextureAtlas()` wiped the atlas **all** pooled xterms share, garbling running agents until a reflow; the clear is now scoped so a new spawn no longer corrupts the others.
- #321 Sign CI release builds so macOS mic/folder permissions work + persist — `release.yml` now signs releases (self-signed with a stable cert via `scripts/gen-macos-ci-cert.sh`, or Developer-ID sign+notarize with all 7 `APPLE_*` secrets, else ad-hoc), fixing the ad-hoc-CI TCC bug, plus a one-time boot `tccutil reset` so an updater is re-asked once.
- #322 Remove the redundant header "+" add-card button from Kanban columns — dropped the column-header "+" (a duplicate of the in-column "+ Add card"), both of which called the same `openComposer`.
- #323 Remove the post-drag focus border on Kanban cards — dnd-kit's `RestoreFocus` re-focused the dropped card leaving a persistent accent outline; scoped the CSS so a just-dropped card no longer wears a focus ring.
- #324 Git-diff gutter in the file viewer — gave the FileViewer's curated Prism code view a left gutter coloring each line by its working-tree status vs `HEAD` — a green bar (added), a yellow bar (modified), a small red dot at a removal boundary.
- #325 Custom coding-agent command in Settings — added a fourth **"Custom"** agent to the pluggable system (#101/#141/#142): the user types a program + args in Settings → Sessions and ReCue runs it to start each session, treated like the other non-Claude agents (no resume/fork/auto-name).
- #326 Setting to disable session-usage display (and auth-token access) — a "Show session usage" toggle in Settings → Sessions (default ON) that, when off, hides the five-hour usage bar **and** stops ReCue ever reading the Claude OAuth token (a privacy option).
- #327 Open the repo's GitHub page from the sidebar folder menu — a "View on GitHub" item (shown only for a git repo with a GitHub remote) opening the repo page via `open_url`; the URL is resolved ahead of time on a refresh cadence and cached, so the menu still opens instantly.
- #328 Move the five-hour usage fetch off the main thread — converted the sync `claude_session_usage` command to `async` + `spawn_blocking` (the #316 pattern) so its blocking token read + up-to-8s HTTPS GET no longer freeze the webview main thread.
- #329 DiffInspector accordion cards — enforce a readable min-width and scroll on overflow — added a `min-width` + inner overflow scroll so a many-file diff in a narrow Canvas split / Overview column no longer crushes its cards unreadably (a flexbox `min-width:auto` fix).
- #330 Load diff-viewer and file-tree git reads off the webview thread — moved the DiffInspector's ~1.5s working-tree diff read + hunk parse (and the file-tree status read) to `async` + `spawn_blocking`, so a large working tree no longer stutters the UI on each refresh.
- #331 "New session here" on a worktree agent nests under the existing worktree — the worktree `OpenViewButton`'s "New session here" now adds the agent inside that worktree's existing nested sub-group (under the parent repo) instead of registering the app-managed worktree dir as a stray top-level folder.
- #332 Esc-to-cancel in session modals must not exit macOS fullscreen — the New/Schedule/Recurring and template modals now consume the Esc keydown so it cancels the modal only, instead of leaking up the responder chain and popping the window out of native fullscreen.
- #333 Light mode theme option in Settings (Catppuccin Latte) — a Dark/Light segmented control in Settings → Appearance reskins the UI with a Catppuccin **Latte** palette (default stays Dark/Mocha, byte-for-byte); persists across restart + detached canvas windows, terminal stays dark.
- #334 Clear the Overview folder filter when selecting an agent it would hide — clicking a sidebar agent row in a folder the active Overview filter would hide now auto-clears the filter, so the agent is actually shown/selected instead of silently disappearing.
- #335 Per-agent added/removed line counts in the sidebar — each agent row shows a compact green **+N** / red **−N** of lines changed vs `HEAD`, computed off-thread (batched `async` command, the #330 pattern) on the existing refresh cadence.
- #336 Per-agent "watch" notifications — a per-agent, opt-in **watch** flag (from the sidebar context menu + a header button) that fires a native OS notification the moment a watched agent's turn ends (busy→idle); off by default, with a global gate.
- #337 Global search modal (⌘F / Ctrl+F) — a `GlobalSearch` modal searching across every open folder: agents, terminals, file/diff/kanban panels, schedules/recurrings, files on disk (name + content), and best-effort live agent terminal output, ranked and grouped by relevance.
- #338 Branch ahead/behind indicator (↑/↓ vs upstream) in the sidebar — a compact `↑N ↓M` next to each folder's current-branch label (repo branch line + worktree headers) showing how far the checked-out branch has diverged from its upstream.
- #339 Enter key submits the "New tab from template" modal — plain Enter advances template→folder step and launches on the folder step, so template → folder → launch works keyboard-only.
- #340 Consolidate agent header actions into a "…" menu — folded Fork / Copy resume / Watch (#336) out of always-visible icon buttons into one shared `AgentHeaderMenu` (`MoreHorizontal`) dropdown on the Overview card / Canvas panel header.
- #341 Kanban card editor: auto-continue `-` bullet lists on Shift+Enter — Shift+Enter on a `-` (or `- [ ]`/`- [x]`) bullet inserts a fresh `- ` prefix; on an empty bullet it terminates the list.
- #342 Note that Dark mode is the recommended theme in Settings → Appearance — a muted helper line under the Dark/Light toggle (pure copy, no behavior; later restyled as a yellow caution by #396).
- #343 Fix and polish Light-mode theming — made the #333 Light theme actually usable (readable text, light content surfaces, a darker accent, a light busy sheen instead of a black band), token-first, with the Dark theme byte-for-byte unchanged.
- #344 Sidebar agent rows: overlap diff-line counts and the × in one hover-swapped trailing slot — the #335 +N/−N counts and the #57 × now share one trailing slot (counts at rest, × fading in over the same spot on hover) with zero layout shift.

**Linux support, performance & boot optimizations (#345–#365).** The Linux port,
the WebKitGTK/AppImage fixes, and a sweep of startup/boot performance work.

- #345 Linux support (Arch/Ubuntu/Mint fully, best-effort others) — ReCue now builds/tests/runs on Linux: split the macOS-assuming `cfg(unix)` arms into a Linux leg (`xdg-open` open/reveal + FreeDesktop D-Bus file reveal, `$SHELL` shell fallback, Ctrl-form kbd hints / "Reveal in File Manager"), plus a ubuntu-22.04 AppImage CI leg; macOS/Windows unchanged.
- #346 Linux performance pass — four compounding causes of "slow on Arch": the WebKitGTK **DMA-BUF** env workaround (`linux_webkit.rs`), a software-WebGL → **DOM-renderer** fallback for the terminal, **coalesced** output emits, and **base64** scrollback replay; Linux-gated ones cfg-gated, the neutral ones order/content-preserving.
- #347 Fix the DMA-BUF workaround misfiring on hybrid Intel+NVIDIA GPUs — #346 disabled DMA-BUF on the mere *presence* of the NVIDIA kernel module, forcing CPU rendering on a hybrid laptop that actually renders on the healthy Mesa iGPU; replaced with GPU-aware `decide_dmabuf` (disable only when the NVIDIA blob is the sole/PRIME renderer or a Mesa-less VM).
- #348 Eliminate the white startup flash — hidden-until-painted windows with a themed pre-paint background: `visible:false` + a themed native `backgroundColor`, an inline-styled `index.html` reading the `recue.theme` localStorage mirror, and a Rust `reveal_window` shown on first paint (with a 2s fallback).
- #349 Linux: native file dialogs follow ReCue's own theme — the AppImage's forced `GTK_THEME=Adwaita:light` made every native dialog blinding white; `linux_gtk.rs` now sets the GTK dialog theme from ReCue's own Dark/Light theme (read pre-GTK-init via `early_settings`).
- #350 Scrub the AppImage-injected environment from every child process — `child_env.rs`: a value-based scrub stripping `$APPDIR`-owned PATH/lib segments + the AppRun marker/forced vars (`APPDIR`, `GTK_THEME`, `GDK_BACKEND`, …) from every spawned child (PTY + git/xdg-open probes), armed only under an AppImage so macOS/Windows/non-AppImage Linux stay byte-for-byte unchanged.
- #351 Lazy-mount Overview terminals — a pooled xterm is created on **first visibility** (a latching `IntersectionObserver` rooted at the wall) rather than at boot, with a bounded FIFO scrollback-replay queue, so an Overview wall of N resumed agents no longer builds N xterms/WebGL contexts up front (the dominant boot cost, worst on WebKitGTK).
- #352 Batch the boot IPC waterfall — replaced `init()`'s 34-invoke / 22-sequential-wave waterfall with one aggregated `boot_state` command + parallel event-listener registration + a no-flash loading gate, cutting the evaluate-JS round-trips gating first render.
- #353 Move straggler sync Tauri commands off the webview main thread — converted the blocking PTY spawn/kill/scrollback family, agent `--version` probes, and git writes from `pub fn` to `async`, so the window no longer freezes while they run.
- #354 Fast, reliable session exit — kill the PTY **process group** (`killpg` SIGHUP → grace → SIGKILL) and derive `Exited` from a per-session child-**wait** thread, not the reader's EOF (a PTY master only EOFs once every inherited slave-fd holder is gone), so an exited agent's card no longer lingers for seconds; Windows unchanged.
- #355 Bounded-parallel boot resume + a one-shot claude project-log index — replaced strictly-serial boot resume (each session re-walking `~/.claude/projects` for forkability) with a 4-wide worker pool over one shared, one-time project-log index.
- #356 Code-split the frontend bundle — split the single 1,351 kB chunk with dynamic `import()` boundaries: the two window routes, the four content panels (carrying react-markdown + Prism out of first paint), eleven modals, the xterm WebGL addon, and mermaid — first paint down to 854 kB raw / 246 kB gzip, guarded by `bundle-report.mjs --check`.
- #357 Settings → Rendering (Linux-only) — DMA-BUF + terminal-renderer overrides (auto/on/off, auto/webgl/dom) with a boot-decision **Diagnostics** readout, filling #347's tri-state seam: DMA-BUF via a persisted setting read pre-`tauri::Builder` (`early_settings`, applied next launch), the terminal renderer applied **live** (`applyTerminalRenderer`).
- #358 Tune `[profile.release]` — added Tauri's size profile (fat `lto`, `codegen-units=1`, `strip=true`, `opt-level="s"`) so the binary/AppImage squashfs is materially smaller, deliberately keeping `panic="unwind"` so a panic in a worker thread kills only that thread, not the whole app.
- #359 Tame the boot git storm — tiered, scoped, and coalesced the sidebar's five-git-reads-per-repo boot volley (which re-fired **unscoped** on every busy→idle edge and read up to 2000 untracked files per repo just to count diff lines).
- #360 Take the login-shell PATH probe off the startup critical path — the `$SHELL -ilc` PATH probe (up to 3s) now resolves **concurrently** with window creation and publishes into a `path_env` cell the spawn seams read, with a fingerprinted rc-mtime cache so a steady-state boot pays zero probe cost; the process env is never mutated.
- #361 Ship a native Arch/AUR package (`recue-bin`) + Linux install docs — an in-repo AUR PKGBUILD that repacks the release `.deb` against the **system** webkit2gtk (no bundled userland, no FUSE, no AppRun forcing); a runtime `install_kind()` probe gates the in-app updater off for distro-managed (`"system"`) installs.
- #362 Fix the Linux `StartupWMClass` mismatch — pin the app's WM_CLASS/`app_id` to an owned `recue` (`linux_desktop.rs` `glib::set_prgname`) so icon/taskbar grouping works, plus a consented, reversible `install-linux-desktop.sh` (ReCue never installs a desktop file itself).
- #363 Give the UI font a Linux leg — bundle **Inter Variable** (latin) applied Linux-only, since the `--ui` system stack falls through to a worse distro default on Linux (superseded by UI v2 / #372, which uses JetBrains Mono as `--ui` on every OS).
- #364 Recover from an unrecovered xterm WebGL context loss — on an unrecovered `onContextLoss`, clear the pool's dangling addon reference + dispose the addon (xterm swaps to the DOM renderer, same buffer, no host remount/replay) and **latch** the window so no terminal re-attaches WebGL for the rest of the run.
- #365 Walk the Linux real-box verification checklist on Arch/Hyprland — an evidence-backed pass over every "needs real-box verification" box in `TRAJECTORY_TO_LINUX.md`, run on a hybrid Intel+NVIDIA Arch/Hyprland box; the deliverable is honest ticks + recorded findings (nothing fixed).

**Display scaling, focus-follows-mouse & usage viewer (#366–#371).**

- #366 Settings → Appearance: display-size slider (UI scaling) — a "Display size" slider scaling the whole UI up/down like browser-zoom, starting at 100% (normal).
- #367 Default terminal line height to 1.0 — changed the Settings → Terminal line-height default 1.2→1.0 with a **one-time migration** of the persisted old default (a stored value would otherwise win over the new default).
- #368 Focus-follows-mouse — an opt-in "focus follows mouse" (sloppy focus) mode: hovering a terminal panel focuses it so keystrokes land without a click; off by default.
- #369 Unique repo colors first — a newly-added folder now takes a palette color **not already used** by another folder (instead of a path-hash that frequently collided), repeating only once every color is in use; existing folders grandfathered.
- #370 Expandable "all usage" viewer in the sidebar — a collapsed-by-default disclosure below the 5-hour usage bar that expands to list **every** usage window the API reports (5-hour, weekly, …), each with its own percent / mini bar / countdown; adaptive to whatever buckets the API returns.
- #371 Focus-on-hover moves the selection border — extends #368: with it on, hovering any Overview card / Canvas panel moves the selection border there, and entering a no-input panel (diff/file/kanban/…) blurs the previously focused agent xterm.

**UI v2 reskin epic (#372–#383).** A 12-card reskin onto the v2 design language (spec
`docs/ui-v2-handoff/DESIGN-SPEC.md` + `ReCue-v2-demo.html` reference demo — demo wins;
ships as v2.0.0 after card 12, no per-card version bump / patch notes).

- #372 UI v2 (1/12): Design foundation — v2 tokens (crust stage, square corners, mono type scale), **JetBrains Mono as `--ui`** everywhere, the pre-paint background invariant, and the shared UI atoms (atoms/menu/modal CSS); every later card consumes this.
- #373 UI v2 (2/12): Settings rework — reskins the Settings modal onto the §10 look, completes an **editable** Shortcuts section (⌘F/⌘D), ships dense panels end-to-end (⌘D), and the new v2 settings.
- #374 UI v2 (4/12): Sidebar reskin — the top action cluster, §5 tree metrics, footer (update pill + usage meter), first-launch empty block, and §6 collapsed rail — a reskin with **zero functionality lost** (every dnd-kit listener / handler left byte-identical).
- #375 UI v2 (9/12): Floating chrome I — a shared **menu.css** primitive giving every context menu / popover (and the New-session popover) the one v2 menu look, zero functionality lost.
- #376 UI v2 (11/12): Toast rework — toasts move from the bottom-right stack (#32) to larger **bottom-center** blocks each led by a Lucide tone icon; store API / dismiss / stacking / reduced-motion preserved.
- #377 UI v2 (3/12): Wave background system — the vendored `WaveEngine.js` flow-field on one Canvas2D layer per window (behind Overview, Canvas, and detached canvas windows), lazy-loaded, random seed per launch, live accent recolor, per-surface presets without remount.
- #378 UI v2 (10/12): Floating chrome II — the modal fleet (15 surfaces) reskinned onto the §10 scrim/pop contract via a shared **modal.css** primitive, zero functionality lost.
- #379 UI v2 (5/12): Overview wall reskin — the agent wall on the crust stage over the wave: square Base cards with a 2px repo band, a fixed 36px header and a flush crust terminal, the chrome-free filter bar, wave-centered empty/first-launch states, the `capAgentWidth` cap, and startup tips.
- #380 UI v2 (6/12): Canvas reskin — the Canvas view on the one shared wave: a transparent tab strip, 30px panel chrome, hairline split dividers over transparent gaps, a wave empty state, and detached-window chrome.
- #381 UI v2 (7/12): Content viewers reskin — the FileViewer toolbar (Saved status + segmented Rendered|Raw) + markdown type ramp, and the DiffInspector meta/pager + tinted diff rows.
- #382 UI v2 (8/12): Boards & ops panels reskin — the Kanban board, FileTree, and Scheduled/Recurring panel bodies onto the v2 language, zero functionality lost.
- #383 UI v2 (12/12): parity & polish sweep — the §12 v1→v2 parity checklist, the accent/light/interaction/reduced-motion/dense/cross-platform audits, token-drift reconciliation, the first-paint bundle budget, and the CLAUDE.md styling docs; with this card the epic is complete.
- #384 Wave background optimization pass — the UI v2 wave (#377) moves rendering to a **Web Worker + OffscreenCanvas** where supported (the verbatim sha-pinned engine unmodified, today's main-thread loop as a byte-for-byte fallback), with governed frame cost: **paused entirely when panels tile over the stage** (the common working state → zero frames), fps-capped 48→24 while any agent is busy, and adaptively downscaled on sustained overruns; a new Appearance setting `pauseWaveWhenCovered` (default ON) exposes the covered-pause.

**Post-v2 polish (#385–#396).** _(#398+ are written out in full at the end of this file.)_

- #385 Restore the pre-UI-rework blue "shimmer" busy indicator — brought back the calm blue dot with a Claude-style sheen **sweeping across it** (replacing the v2 opacity-pulse "blink" + its tinted ring), keeping the three-state semantics + reduced-motion behavior + token system.
- #386 Agent/panel borders use the owning folder's color — the selection/focus highlight around each Overview card / Canvas panel now uses its folder's `repoColor` instead of the global `--accent`, per the v2 rule that the accent never encodes selection.
- #387 Usage popup — weekday reset labels & human-readable reset durations — the "all usage" popup shows a weekday abbreviation / short date (instead of a raw `122h`) for a far-future reset, keeping the compact countdown under 24h, plus a precise local time.
- #388 Add "New folder…" and "Clone Repo…" to the ⋯ session-options menu — the footer ⋯ menu (#294) now also offers the New folder… / Clone Repo… the background context menu (#172) carries, so adding/cloning a folder needs no empty-background right-click.
- #389 Remove "Schedule session" from the global sidebar background context menu — dropped the redundant item (scheduling is already the "+ Schedule session" footer button and ⌘⇧N).
- #390 Configurable terminal background lightness — a "Terminal background" slider in Settings → Appearance lightening the terminal from near-black (`#11111b`) toward gray (`#3a3a45`); applies **live** to every running terminal (no host dispose / scrollback replay), persists, defaults to 0 (today's look).
- #391 ⌘K launcher — filter-as-you-type type picker — the ⌘K "Create panel" launcher's type step gained an auto-focused search input filtering panel types as you type, with ↑/↓/Enter selection; the 1–6 number keys still index the filtered list.
- #392 Unify creatable item/panel ordering across every menu — every surface listing creatable item/panel types (⌘K launcher, repo/worktree Views menus, header "open a view" popover, Canvas template palette) now renders one canonical order (Session, Terminal, File Tree, File Viewer, Diff Viewer, Kanban board) from a single shared `itemTypeOrder.ts`; order-only, no entry gained or lost.
- #393 ⌘F search — surface active-agent repos first & cap each repo to 6 results — repos with a live agent list **first** (not strictly alphabetical) and each repo group caps at **6** results with a "…" overflow, so a live agent isn't buried and a many-hit repo can't flood the list.
- #394 Improve ⌘F search across live agent terminal output — verify + fidelity fix of the #337/#353 terminal-output search: the ANSI stripper (`pty.rs strip_ansi`, the search path's sole caller) now expands a non-erasing cursor-forward (CUF, `ESC[nC`) into spaces (clamped at 64) so a phrase the user saw spaced (`A B`) matches the searched text; the non-navigable `:line` badge is hidden for `output`-kind rows.
- #395 Sidebar repo header — active-agent count in the "+" slot — each repo header shows its count of active (running) agents at rest in the same slot the New-session **+** occupies, swapping to the clickable **+** on hover / keyboard-focus with zero layout shift; the always-on total-sessions chip is removed (empty/none-running cases keep today's behavior, no "0").
- #396 Style the "Dark mode is the recommended experience" Settings note as a yellow caution — restyled the #342 plain-grey note as an on-system **yellow caution** (matching the untested-agent caution elsewhere in the modal) so it reads as a deliberate warning.

**Continued polish (#397+).** _(#404+ are written out in full at the end of this file.)_

- #397 ⌘F search — per-folder filter chips (⌘-Number) with lifted per-repo cap — a row of muted folder chips under the search bar; **⌘-Number** (Ctrl+N on Windows/Linux) lights the Nth chip and narrows results to that folder (again / Escape / click clears), and while a folder filter is active #393's per-repo 6-item cap is **lifted** so all its matches show. Reuses #393's `rankAndGroup` with `perRepoCap: Infinity` — no `search.ts` logic change; the global ⌘1–9 Canvas-jump is inert while the modal owns ⌘-Number.
- #398 Attention view — a FIFO triage queue for idle agents needing input — a third top-level view that FIFO-queues agents gone idle (oldest-idle first) so the user triages them one at a time: the queue on the left, the selected agent's **real live terminal** on the right (via `ItemContent`, so a `DetachedNote` shows when another window owns the PTY), then dismiss (keep alive) or kill and advance. Pure derived state — no new Rust / git read / persistence; ⌘⏎ (Ctrl+Enter) dismisses, Shift+↑/↓ cycle the queue, and the ViewSwitch segment carries a live idle-count badge.
- #399 Let macOS Ctrl+⌘+F native fullscreen through — the ⌘F/Ctrl+F global-search chord no longer swallows macOS's native **Ctrl+⌘+F** fullscreen combo: a pure `isGlobalSearchChord` predicate (+ unit test) fires the handler only when **exactly one** of Cmd/Ctrl is held, so Cmd+Ctrl+F falls through to the OS while plain Ctrl+F still opens search on macOS. A no-op on Windows/Linux (Ctrl+F alone still matches).
- #400 Order folder pickers most-recently-used — count every panel open as a repo "use" — the folder/repo create-pickers (⌘K Create-panel, ⌘N/⌘⇧N New-session, "New tab from template…") already order by the persisted **`recents`** list, but it was bumped only on agent spawn; now `addOverviewPanel` (the single funnel for every non-agent panel) bumps the repo to the front of `recents` before its dedup early-return (resolving the worktree parent per #331), so opening a file/diff/terminal/kanban/file-tree panel counts as a repo use and every picker's ordering stays accurate — no picker UI changed.
- #401 Soften UI v2 element borders and focus rings — a token-only, theme-aware CSS tuning (no behavior change): lowered the neutral border-token alphas (`--border-hairline`/`--border-strong`) in both the dark and light `tokens.css` blocks (heaviness was color weight, not the 1px floor), and formalized the keyboard focus ring into new `--focus-ring` (accent @ ~70% via `color-mix`, custom-accent-live) + `--focus-ring-width` (2px→1.5px) tokens, consumed with the plain-`var(--accent)`-fallback-first pattern in `global.css` + eight component overrides.
- #402 Default the wave "Pause when covered by panels" setting to OFF (opt-in) — `pauseWaveWhenCovered` (#384) now defaults **off**, so a fresh install keeps the background wave animating even when the Overview wall has cards or a Canvas tab has panels; pausing-while-covered is now an explicit opt-in. A `DEFAULT_SETTINGS` value flip only — no migration (the `mergeSettings` back-fill handles the upgrade); a user who saved settings since #384 keeps their persisted `true`.
- #403 Robust activity indicator — stop the busy dot flickering when a panel is focused — a **backend-only** `pty.rs` fix (platform-neutral): focusing an agent (hover/click) made xterm emit a DECSET-1004 focus-in report, claude repainted, and the busy monitor mis-read that one-shot repaint as work — blinking the dot blue, churning the Attention queue and even resurrecting dismissed cards. Added `last_report` to `ActivityState` (stamped by `write_stdin` on a non-input report), a `report_repaint` signal in `monitor_loop`, and a `suppress_on` param to `decide_busy` that gates only the **idle→busy** edge — an already-busy session and a real keystroke-started turn are untouched (#185 preserved). Fixing the source fixes every consumer at once.
- #405 Remove the Attention queue-count badge from the ViewSwitch — Attention is an **optional** mode, so its ViewSwitch button no longer shows a live idle-count pill that made it read as required/urgent. Removed the `attentionCount` selector + the `.count` (expanded) and `.countCompact` (compact-rail) badges from both `ViewSwitch.tsx` renderings and their now-dead CSS; the button's icon, accessible name, and view-switch behavior — and the Attention view's own in-view "N idle" header — are untouched (kept minimal so #406 builds cleanly on top).
- #406 Make Overview + Attention the main view buttons; Canvas a smaller secondary button — the sidebar view switcher now reads as a prominence hierarchy: Overview + Attention are an equal-weight two-segment shared `SegmentedControl`, and Canvas is a visibly smaller, de-emphasized `<button>` appended after it (with `view === "canvas"` leaving neither segment active and lighting the Canvas button instead); the compact rail reorders to Overview, Attention, Canvas with a Canvas de-emphasis. Layout/visual only — the shared `SegmentedControl` atom, the store, and all shortcuts are unchanged. Depends on #405.
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

Open work no longer lives in this file — it flows through the `kanban-dev-pima` board
(`KANBAN.md`: `PLAN → IMPLEMENT → MERGE → ARCHIVE`) and per-task `PLAN-<N>.md` files. This
file is the **completed-task archive only**: the condensed **Implemented (completed tasks)**
index above covers every shipped task **except the 20 most recently-archived** (one line per
task; full per-task detail — Description, Subtasks, Acceptance criteria, Implementation report —
lives in git history and each task's PR). The 20 most recent tasks are written out **in full**
below.

> **Never skip a card.** The pipeline implements **every** unblocked card — one whose
> `deps:` are all in `## ARCHIVE` or already archived here — lowest task number first, and never
> skips one for being big, risky, or hard to verify. A card too large for one pass is
> **split into smaller dependent cards** (as #93 → #93 + #94), not deferred.

---

## Full-detail entries — the 20 most recently-archived tasks

> The tasks below are kept **written out in full** (Description / What shipped / Key files /
> Dependencies). They are the 20 most recently archived, so they appear in **archive order**,
> not strict numeric order: #404, #409, #411, #407, #410,
> #408, #412, #414, #415, #413, #417, #418, #420, #419, #416, #421, #422, #423, #424, #425. Every earlier task is condensed in the
> index above.

### 404. [x] Default focus-follows-mouse (auto-focus agents & panels on hover) ON + clarify the label

"Auto-focus on hover" (#368/#371) is now the **default** — agents and panels are focused/selected
when the mouse moves over them — instead of the prior opt-in/off default, and the Settings toggle is
reworded to say that **agents and panels** (not just "panels") are auto-focused. The hover-focus
**behavior** itself is unchanged; this is a default-value + copy change.

**What shipped** (branch `default-auto-focus-on-hover`, PR
[#162](https://github.com/ErikdeJager/ReCue/pull/162), merged 2026-07-15 into `iteration-1`) — 18
insertions / 13 deletions across four files:

- **`src/store.ts`** — `DEFAULT_SETTINGS.autoFocusOnHover` flipped `false → true`, with the comment
  updated to on-by-default (opt-out): because `mergeSettings` back-fills a **missing** key from the
  default, an existing install that never chose the setting gets hover-focus **on**, while a user who
  explicitly persisted `false` keeps it off.
- **`src/types/index.ts`** — the `autoFocusOnHover` doc comment changed from "Off by default (opt-in)"
  to "On by default (opt-out)".
- **`src/components/Settings/Settings.tsx`** — the Behavior `Checkbox` label reworded from "Focus
  panels on hover" to **"Auto-focus agents and panels on hover"**; the help text (blur/text-field
  behavior) kept accurate.
- **`src/store.test.ts`** — the default/back-fill test retitled `defaults autoFocusOnHover to true and
  back-fills it (#404)`: asserts `DEFAULT_SETTINGS.autoFocusOnHover === true`, a blob **missing** the
  key back-fills to `true`, an explicit `true` stays `true`, and an explicit `false` stays `false`
  (opt-out preserved).

**Key decisions** (from `ASSUMPTIONS.md` Task 404)

- "Default behaviour is hover focus turned on" = flip `DEFAULT_SETTINGS.autoFocusOnHover` false→true;
  the #368/#371 feature behavior is untouched.
- **No migration flag.** Relied on `mergeSettings` back-fill semantics (missing key → new default) so
  everyone who hasn't opted out gets hover-focus, while an explicitly-saved `false` is preserved —
  deliberately **not** migrating to protect a never-chosen off-state (contrast `terminalLineHeight`
  #367, which did migrate), because the card wants on-by-default for all non-opted-out users.
- "The default option should say that agents and panels are auto focussed on hover" = reword the
  Settings label to name agents **and** panels and update the type + `DEFAULT_SETTINGS` comments from
  "opt-in/off" to "on by default (opt-out)".

**Cross-platform:** pure store/TS default + copy change; no path/shell/native primitives — identical
on macOS, Windows, and Linux.

**Dependencies:** Task 403 (the robust-activity-indicator fix). Turning hover-focus on by default
amplifies the focus-report busy blink, so 403 landed first to keep the default-on experience
flicker-free.

### 409. [x] Softer Kanban board corners + restore card hover-lift

The markdown **Kanban board** (#141–#151) reads less blocky again: its **columns** and **cards**
get a modest, board-scoped corner radius (a tasteful middle between the UI v2 square look and the
old v1 radii), and the card **hover-lift** animation the v2 reskin (task 382) flattened is
restored — a hovered card smoothly rises ~2px with a soft drop shadow, signalling it's draggable —
without reverting the global v2 square-panel language anywhere else.

**What shipped** (branch `softer-kanban-corners-hover-lift`, PR
[#165](https://github.com/ErikdeJager/ReCue/pull/165), merged 2026-07-15 into `dev`) — a single
CSS-only file, 26 insertions / 6 deletions in
`src/components/Kanban/KanbanPanel.module.css`:

- **Column corners.** `.column` gains `border-radius: var(--radius-btn)` (6px). The rule already
  had `overflow: hidden`, so the header top corners and the card-area bottom corners clip cleanly
  to the rounded box. A comment marks it as Task 409's deliberate, board-scoped exception to the
  v2 square-panel language (not a full revert).
- **Card corners.** `.card`'s `border-radius: var(--radius-chip)` (0) → `var(--radius-micro)`
  (4px) — kept ≤ the column radius so cards read slightly tighter than columns, like the old UI.
  Because it's on the base `.card`, `.cardPlaceholder` and the in-tree `.cardOverlay` drag ghost
  inherit the same rounded shape.
- **Card transition.** The `.card` `transition` list is extended to also animate `transform` and
  `box-shadow` (alongside `border-color`/`background`), so the rise/settle is smooth.
- **Hover-lift.** The existing `.card:not(.cardPlaceholder):not(.cardOverlay):hover` rule (which
  already set `border-color: var(--border-strong); cursor: grab`) gains
  `transform: translateY(-2px)` + `box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28)` — the removed #234
  values verbatim. The origin placeholder and floating ghost are excluded (the ghost keeps its own
  `--shadow-menu`).
- **Reduced-motion override.** A new `:global(body.reduce-motion) .card…:hover` rule zeroes
  `transform`/`box-shadow`, because `global.css`'s killswitch only clamps transition *durations* —
  a static hover transform would otherwise still jump instantly. Under reduced motion only the calm
  border-strengthen + `grab` cursor cue remains.

No TSX/logic changes (the `.card`/`.column`/`.cardPlaceholder`/`.cardOverlay` class names already
existed and were applied where needed); no new tokens, no Rust, no test changes.

**Key decisions** (from `ASSUMPTIONS.md` Task 409)

- Chose modest radii as a tasteful middle — columns 6px (`--radius-btn`), cards 4px
  (`--radius-micro`), cards ≤ columns — not the old 7/5px and not v2's 0.
- **Reused existing on-system radius tokens directly** rather than adding new tokens to
  `tokens.css` or panel-local custom properties: keeps it token-driven, covers the in-tree drag
  ghost, and avoids touching the global square-panel tokens (`--radius-control`/`--radius-chip`
  stay 0, so panels/cards elsewhere stay square).
- Restored the hover-lift with the #234 values verbatim + the explicit reduced-motion `none`
  override (required because the global killswitch only clamps durations, not static hover
  transforms). Kept the literal `rgba` black shadow (no card-hover shadow token exists; the
  `--shadow-*` floating-chrome tokens are far too heavy for a 2px lift) — renders identically
  across WebViews.
- Scoped strictly to the outer column/card shapes + the card hover-lift; left all Kanban
  input/composer/checkbox/code-block styling square and untouched to avoid overlap with **Task
  407** (the new-card composer input border/focus, which owns `.composerInput`).

**Cross-platform:** CSS-only, on-system radius tokens + a literal `rgba` shadow; no path/shell/
native primitives — identical (and theme-correct in dark/light) on macOS, Windows, and Linux.

**Dependencies:** none.

### 411. [x] Clicking a sidebar item in Attention view switches to Overview

While the app is in the **Attention** triage view (#398 — the FIFO queue of idle agents awaiting
the user), clicking any left-sidebar item (agent / file / diff / filetree / terminal / kanban /
schedule / recurring, expanded row **or** collapsed-rail dot) now switches the app to **Overview**
and selects that item there — so the user lands on the thing they clicked instead of staying on the
Attention queue, which can only surface idle-agent members in its pane. Overview and Canvas sidebar
clicks keep today's behavior.

**What shipped** (branch `attention-sidebar-click-to-overview`, PR
[#166](https://github.com/ErikdeJager/ReCue/pull/166), merged 2026-07-15 into `dev`) — 62
insertions / 2 deletions across two files:

- **`src/store.ts`** — the one behavioral change, made in the shared **`selectItem(item)`** action
  (the #79 choke point every sidebar row routes through). Its non-canvas branch — which previously
  just did `set({ selectedId: item.id })` for both Overview and Attention — is now view-aware:
  when the captured `s.view === "attention"` it `set({ view: "overview", selectedId: item.id })`,
  else it selects in place. This mirrors the branch's existing Canvas "item not shown here → go to
  Overview" rule. `s` is captured once at the top, and the earlier #334 filter-clear `set` doesn't
  mutate `s.view`, so the `attention` read stays correct — meaning an Attention **agent** click
  still composes with #334 (switch to Overview **and** clear a mismatched `overviewRepoFilter` so
  the agent is visible on the wall).
- **`src/store.test.ts`** — four unit tests: Attention agent click → Overview + selected;
  Attention non-agent (file/diff) click → Overview + selected; Overview click keeps the view
  (regression guard for the unchanged branch); and the #334 + #411 composition (Attention agent
  click switches **and** clears the mismatched filter).

No Sidebar.tsx changes were needed — all rows already route through `selectItem`, and the
repo-header/branch-line/rail-folder clicks already `setView("overview")` themselves.

**Key decisions** (from `ASSUMPTIONS.md` Task 411)

- Centralized the switch in the single shared `selectItem` action rather than per-call-site — the
  cleanest on-pattern spot, mirroring the existing Canvas→Overview "not shown here → Overview" rule.
- The switch is **unconditional** for any sidebar item click while in Attention (all item kinds),
  matching the verbatim "clicking on an item" request, not only agents — and it also covers the
  collapsed-rail agent dots (they route through `selectItem` too).
- Repo-header title / branch-line / rail-folder clicks are **not** touched — they already call
  `setView("overview")` + set the Overview filter.
- Because the rule lives in shared `selectItem`, **global-search** item navigation performed while
  in Attention also lands in Overview — a consistent, intended side effect (Attention can only
  display idle queue members), not a regression.
- Overview and Canvas sidebar-click behavior is left exactly as today (the #79 no-auto-switch rule
  preserved for those views).

**Cross-platform:** pure frontend store state + tests; no IPC/native/path/shell code — identical on
macOS, Windows, and Linux.

**Dependencies:** none. (Concurrent Attention tasks 410 — queue membership — and 412 — agent × /
⌘W — were kept out of scope; any `Attention.tsx` file overlap was avoided since this task edits only
`store.ts`/`store.test.ts`.)

### 407. [x] Kanban new-card composer input drops the redundant focus ring

The Kanban board's **"+ Add card"** composer textarea no longer shows two concentric colored edges
at once. It already carries a per-column accent-colored border at rest (`--col-accent`, matching the
column's header dot), so the app's separate softened-Peach keyboard focus ring layered a redundant
second edge on top — this drops that ring on the composer input only, leaving the accent border as
the field's sole, always-present edge, matching how the card **edit** experience reads.

**What shipped** (branch `kanban-composer-focus-ring`, PR
[#167](https://github.com/ErikdeJager/ReCue/pull/167), merged 2026-07-15 into `dev`) — a single
CSS-only file, 9 insertions in `src/components/Kanban/KanbanPanel.module.css`:

- A dedicated rule beside the existing `.composerInput` styles:
  `.composerInput:focus, .composerInput:focus-visible { outline: none; }`. The qualified
  `:focus-visible` selector (specificity 0,2,0) reliably beats the global `global.css`
  `:focus-visible` ring (0,1,0) regardless of stylesheet import order — a bare `outline: none` on
  the base class would tie the global rule's specificity and be order-dependent — and the `:focus`
  selector also covers any UA default outline on every engine. The `--col-accent` border was left
  exactly as-is.

No global `:focus-visible` change, no token changes, no TS/Rust — the ring is untouched everywhere
else in the app.

**Key decisions** (from `ASSUMPTIONS.md` Task 407)

- Kept the composer input's existing per-column accent border (`--col-accent`, matching the column
  dot) rather than switching it to the global `--accent` (Peach) — the edge is already an accent
  color and the per-column tint is deliberate (#233/#239); the only real change is removing the
  redundant focus ring.
- Scoped strictly to the new-card composer input (`.composerInput`); the card-edit textarea
  (`.cardEditInput`, the user's reference) and the column-rename input (`.columnNameInput`) are
  left unchanged.
- Kept the composer border always accent-colored (no separate focused vs unfocused state) and
  removed the focus ring entirely, accepting the minor a11y trade-off since the composer
  auto-focuses and the accent border + caret still delineate the field — matching the explicit
  "no focus" request.
- Interpreted "text area input fields" (plural) as the single new-card creation textarea per the
  request body, not a board-wide focus-ring removal.

**Cross-platform:** pure token-driven CSS, no platform branch — renders identically on WKWebView
(macOS), WebView2/Chromium (Windows), and WebKitGTK (Linux).

**Dependencies:** none. (Task 409 also edited `KanbanPanel.module.css` — card/column corners +
hover-lift — but never touched `.composerInput`'s focus outline, so the two edits were disjoint
within the file.)

### 410. [x] Attention queue surfaces started agents until they start working

The **Attention** triage view (#398) is now a control surface for *all* agents that currently need
the user, not only agents that finished a turn. A freshly **started** agent (gray "never worked
yet") appears in the queue so the user can drive it, and it drops out the moment it is **actively
working** (blue/busy). When it finishes and needs input again it re-appears (yellow "awaiting"),
exactly as before.

**What shipped** (branch `task-410-attention-started-agents`, PR
[#168](https://github.com/ErikdeJager/ReCue/pull/168), merged 2026-07-15 into `dev`) — 97 insertions
/ 30 deletions across four files:

- **`src/components/Attention/attentionQueue.ts`** — the pure membership function's predicate is
  relaxed: the `if (!sessionActive[s.id]) return false` precondition is dropped, so an agent is a
  member iff it is **not** a recurring child, not exited, not `reconnecting`, **not busy**, and not
  dismissed — i.e. any non-busy agent, fresh **or** awaiting. `sessionActive` was removed from the
  destructure (to avoid `no-unused-vars`) but **kept in the `AttentionQueueInput` interface** so
  the four call sites + tests need no signature change; the `sortKey`
  (`idleSince[id] ?? createdAt * 1000`) is unchanged — a fresh agent with no idle edge correctly
  sorts by its spawn time.
- **`src/components/Attention/Attention.tsx`** — `QueueCard` gains a real `hasBeenActive` prop
  (passed `sessionActive[id] ?? false` at the `queue.map` call site) replacing the hardcoded
  always-yellow indicator: a fresh agent shows the gray `--status-idle` dot + a distinct **"NEW"**
  tag; a settled agent keeps the yellow dot + the **"IDLE"** tag. The header count wording changed
  from "N idle" to "N waiting" to cover both.
- **`src/components/Attention/Attention.module.css`** — a `.newTag` chip variant mirroring
  `.idleTag` but tinted with the gray `--status-idle` token, so the fresh chip reads distinct from
  the awaiting chip.
- **`src/components/Attention/attentionQueue.test.ts`** — the "excludes a never-active agent" test
  flipped to assert inclusion; added coverage for a fresh **busy** agent (excluded), a fresh
  **dismissed** agent (excluded), and mixed fresh/awaiting FIFO ordering (the `createdAt`
  seconds→ms fallback interleaves correctly).

No `store.ts` / `useKeyboardNav.ts` logic changes — they call `attentionQueue()` and inherit the
new membership automatically, so Shift+↑/↓ nav and dismiss / dismiss-all operate over the expanded
set for free. No backend/Rust change.

**Key decisions** (from `ASSUMPTIONS.md` Task 410)

- State→membership mapping: a queue member is any non-busy agent — both fresh gray (never active)
  and settled yellow (awaiting) — while busy blue (actively working) is excluded. Interpreted
  "started" = fresh gray and "actively doing something" = busy; removal-on-active is driven by the
  existing `sessionBusy` flag (no store/`setBusy` change needed).
- FIFO ordering unchanged: fresh agents (no `idleSince`) sort by `createdAt`, interleaved
  chronologically with awaiting agents' idle-edge times; a newly started agent goes to the back.
- Pass the real `hasBeenActive` to each `QueueCard` (gray idle dot + "NEW" vs yellow dot + "IDLE")
  so a fresh agent doesn't misread as "finished — needs input".
- Kept `sessionActive` in the `AttentionQueueInput` interface (no longer read for membership) to
  avoid churn at the 4 call sites + the test — only removed it from the function's destructure.
- Boot-persisted never-active idle sessions enter the queue after the reconnect window settles
  (desirable; the existing `reconnecting` exclusion prevents a boot flood). Seeded/scheduled agents
  surface only once finished (their startup paint reads busy); a possible sub-second fresh flicker
  before the first busy transition is acceptable and not special-cased.

**Cross-platform:** pure WebView/TS (queue predicate + presentational tweaks + tests); no
native/`#[cfg]`/path/shell code — identical on macOS, Windows, and Linux.

**Dependencies:** none. (Concurrent Attention tasks 411 — click-to-switch — and 412 — agent × /
⌘W — touch the same directory but are orthogonal and were kept out of scope here.)

### 408. [x] Branch picker type-to-filter with create-branch fallback

In every in-repo branch picker, the user can now just start typing to filter the branch list (the
best match auto-highlights, locals before remotes). When the typed text matches **no** existing
branch, the picker jumps straight to the create-branch option pre-filled with that text and focused,
so Enter creates a new branch (⌘/Ctrl+Enter as an isolated worktree) instead of forcing the user to
click "+ add branch" / "Create new branch" and retype the name.

**What shipped** (branch `branch-picker-type-to-filter-create`, PR
[#169](https://github.com/ErikdeJager/ReCue/pull/169), merged 2026-07-15 into `dev`) — 162
insertions / 9 deletions across four files:

- **`src/branchFilter.ts`** (new, 41 lines) — a pure helper `matchBranchFilter(query,
  filteredLocals, filteredRemotes)` returning a `BranchFilterMatch` discriminated union
  (`{kind:"local"|"remote", value}` / `{kind:"create", name}` / `{kind:"none"}`): the top matching
  local wins, else the top matching remote, else — when the trimmed query is non-empty — the
  create-branch fallback carrying the trimmed query as the new name; a blank/whitespace-only query
  with no matches is `"none"`. Sibling of `paths.ts`, mirroring the `folderNav.ts` precedent.
- **`src/branchFilter.test.ts`** (new, 53 lines) — vitest coverage: top-local wins, top-remote when
  no locals, create on non-empty no-match, `"none"` on blank query, whitespace-only → `"none"`, and
  the query trimmed into the create name.
- **`src/components/NewSessionModal/NewSessionModal.tsx`** — `onBranchQueryChange` now routes a
  no-match query through `matchBranchFilter`: on `create` it converts the filter to the create
  action (`setAddBranchActive(true)`, seeds `newBranchName` with the typed text case-preserved,
  clears `branchQuery`, clears both selections + the error). The existing focus effect moves the
  caret into the pre-filled name input, and the existing `onNewBranchKeyDown`/submit/worktree/
  defer-mode wiring handles Enter, ⌘⏎, and schedule/recurring advance for free — no new key
  handlers. Guarded by `!fetchingRemotes` so a query matching a still-fetching remote doesn't jump
  to create prematurely.
- **`src/components/Sidebar/Sidebar.tsx`** — the "Checkout branch…" picker's (#266) filter
  `onChange` gets the same behavior: a non-empty no-match query (and `!checkoutLoading`) opens the
  create input pre-filled + focused (its `autoFocus`) and clears the filter; its existing Enter
  handler creates + checks out off the folder's current branch. Otherwise `setCheckoutFilter(value)`
  as before.

Backend untouched — reuses `validate_new_branch`, `createBranchSession`/`createBranchWorktreeSession`,
`createFolderBranch`, `list_branches`. The DiffInspector compare-branches selector was left alone
(create semantics are meaningless there); the `>4`-branch filter-visibility thresholds are unchanged.

**Key decisions** (from `ASSUMPTIONS.md` Task 408)

- In-scope pickers: the NewSessionModal branch step (new-session + schedule/recurring +
  per-repo/worktree/remote) and the Sidebar "Checkout branch…" picker. Out of scope: the
  DiffInspector compare (base/target) selector.
- Matching stays case-insensitive substring, auto-highlighting the top match (locals before
  remotes) — not switched to prefix matching.
- No-match trigger fires the moment a trimmed non-empty query matches zero local **and** zero
  remote branches — no minimum query length. On jump-to-create: seed the create-name with the typed
  text (raw case), clear the filter, focus the create-name input; base defaults to the current
  branch. Enter creates (⌘/Ctrl+Enter = worktree in the modal); schedule/recurring records the
  new-branch intent; the checkout picker's Enter creates + checks out.
- Kept the existing `>4`-branch filter-visibility thresholds (did not make the filter always
  visible); the explicit "+ add branch" / "Create new branch" buttons remain for small repos.
- Suppress the auto-jump-to-create while remotes are still fetching (`fetchingRemotes`), so a query
  matching a not-yet-loaded remote doesn't prematurely convert.
- Extracted the tested pure helper `matchBranchFilter` (mirroring the `folderNav.ts` + test
  precedent), reused by both call sites.

**Cross-platform:** no path/shell/OS assumptions; the only platform-sensitive bit (⌘ vs Ctrl) is
already handled by the reused `metaKey || ctrlKey` handlers + `kbdHint` labels — identical on macOS,
Windows, and Linux.

**Dependencies:** none.

### 412. [x] Move the agent × out of the Attention queue into the agent header, and make ⌘W close the focused Attention agent

In the **Attention** view (#398), the per-card close (×) button is removed from each queue row and a
single × now lives in the **top-right of the focused agent's own header** (the right pane).
Additionally, the app-wide **⌘W / Ctrl+W "close the focused panel" keybind** now works in Attention
— it removes the focused agent, exactly like the header ×. The result: a calmer queue list (rows are
pure select targets), the destructive close lives on the agent it acts on, and the close shortcut
behaves sensibly in Attention instead of doing nothing.

**What shipped** (branch `move-attention-close-to-header`, PR
[#170](https://github.com/ErikdeJager/ReCue/pull/170), merged 2026-07-15 into `dev`) — 83 insertions
/ 115 deletions across five files:

- **`src/components/Attention/Attention.tsx`** — `QueueCard` loses its hover `.cardRemove` × and all
  its supporting state (the `armed` two-step confirm, the `timer` ref, `clearTimer`/`disarm`/
  `handleRemove`, the unmount cleanup, and the `onRemove`/`confirmDestructive` props) — it's now a
  pure presentational select target. A destructive × (`X` from lucide, `size={15}`) is added as the
  **rightmost** control in the agent-pane header's `.agentActions` group (after ⋯ and Maximize),
  calling `removeSession(activeSession.id)` **directly, no inline confirm arm** — matching the
  Overview agent-header × convention.
- **`src/components/Attention/Attention.module.css`** — the `.cardRemove*` rules (~43 lines) are
  deleted; an `.actionDanger:hover` rule (red `--status-error`) is added, mirroring
  `Overview.module.css`.
- **`src/store.ts`** — `closeFocusedPanel`'s trailing Attention **no-op** is replaced with a branch
  that, in the main window's Attention view, rebuilds the queue (same inputs as `dismissAttention`),
  resolves the effective active id (`selectedId` if a queue member, else `queue[0]`), and
  `void removeSession(activeId)` — a deliberate exception to the "never destructive" ⌘W rule,
  matching the header ×. Selection advances automatically as the queue recomputes; an empty queue is
  a safe no-op.
- **`src/useKeyboardNav.ts`** — docstring/comment only: the ⌘W line notes it now also removes the
  focused Attention agent. No dispatcher change — `close-panel` already routed to
  `closeFocusedPanel` in every view (and still stays inert while a modal owns the keyboard).
- **`src/store.test.ts`** — the old "no-ops in the Attention view" test is rewritten to assert
  `closeFocusedPanel()` removes the focused queued agent, plus a new empty-queue no-op case.

The non-destructive **dismiss** (⌘⏎ / `dismissAttention` / "Dismiss all") is untouched, as is queue
membership (Task 410's territory) and sidebar-click routing (Task 411's).

**Key decisions** (from `ASSUMPTIONS.md` Task 412)

- × semantics = the existing "kill + forget" (`store.removeSession`), unchanged from today's queue
  ×; **not** the non-destructive "remove from queue" (that stays ⌘⏎/`dismissAttention`). ⌘W does the
  same `removeSession`.
- The relocated header × fires `removeSession` directly with **no** inline two-step confirm arm —
  matching the Overview agent-header × convention (which ignores `settings.confirmDestructive`) — so
  ⌘W and the × do literally the same thing; this drops the queue card's old #103 inline confirm arm.
- "Focused agent" in Attention = the effective active queue selection (`selectedId` when a current
  queue member, else the top of the queue), mirroring how the pane already resolves `activeId`. ⌘W
  with an empty queue is a no-op.
- The × is the rightmost control in the agent-pane header `.agentActions` group (after ⋯ and
  Maximize) — the top-right corner of the individual agent.
- No dispatcher change for ⌘W: `close-panel` already routes to `closeFocusedPanel` in every view;
  only its Attention branch changed (was a deliberate no-op). ⌘⏎ dismiss is untouched.

**Cross-platform:** pure frontend TypeScript + CSS; the ⌘W chord already resolves to ⌘ on macOS and
**Ctrl on Windows AND Linux** via `eventChord`. No OS-gated code, no paths, no shell-outs —
identical on all three platforms.

**Dependencies:** none. (Overlapped the Attention directory with sibling tasks 410 — queue
membership — and 411 — sidebar-click routing; the merge lane resolved the mechanical overlap by
rebasing this PR onto `dev` after 410/411 landed.)

### 414. [x] Default the terminal background lightness to 25% (brighten terminals a bit by default)

Terminals now open a touch brighter out of the box: the existing "Terminal background" lightness
setting (Settings → Appearance, added in #390) defaults to **25%** instead of 0%, landing the
background at roughly `#1b1b26` — a subtle lift from near-black toward gray. Users who prefer the
old near-black look drag the slider back to 0%. A one-time migration carries the new default to
existing installs, not just fresh ones.

**What shipped** (branch `default-terminal-bg-lightness-25`, PR
[#173](https://github.com/ErikdeJager/ReCue/pull/173), merged 2026-07-15 into `dev`):

- **`DEFAULT_SETTINGS.terminalBackgroundLightness` 0 → 25** (`src/store.ts`) — fresh /
  never-saved installs get 25% straight from the default; a pre-#390 blob lacking the key
  back-fills to 25 via `mergeSettings`.
- **One-time migration mirroring the #367 line-height precedent** — a new
  `terminalBackgroundMigrated: boolean` flag on the `Settings` interface (`src/types/index.ts`,
  default `false`), and `migrateTerminalBackground(s)` (`src/store.ts`, guarded by
  `LEGACY_TERMINAL_BACKGROUND_LIGHTNESS = 0`): a no-op once the flag is set, otherwise it bumps an
  explicitly-stored legacy 0 → the new default 25 **once**, stamps the flag `true`, and reports
  `changed`. Referenced against `DEFAULT_SETTINGS.terminalBackgroundLightness` so the default and
  the migration target can't drift. This closes the gap where an install that saved settings after
  #390 shipped had an explicit `terminalBackgroundLightness: 0` that would otherwise win over the
  new default.
- **Boot wiring** — chained after `migrateTerminalLineHeight`, combining both migrations' `changed`
  flags into one one-off `ipc.setSettings(...)` persist (main window only), run before
  `applySettingsEffects` so terminals paint the migrated value from the first frame.
- **Reset to defaults preserves the flag** (`src/components/Settings/Settings.tsx`) — restores
  `terminalBackgroundLightness` to 25 while keeping `terminalBackgroundMigrated`, so the one-time
  migration never re-arms.
- **Module-level fallback bumped** — `currentTerminalSettings.background` 0 → 25 in
  `src/components/Terminal/terminalPool.ts` (tracks the new default, mirroring the `lineHeight`
  fallback comment) for any xterm created before `applyTerminalSettings` runs.
- Unit tests (`src/store.test.ts`): the new default is 25 + flag false; `mergeSettings` back-fill
  of the flag; `migrateTerminalBackground` bumps legacy 0 → 25 once, leaves a non-zero value, and
  no-ops when the flag is set.

**Key decisions** (from `ASSUMPTIONS.md` Task 414)

- "Terminal lighten" == the existing #390 `terminalBackgroundLightness` background slider, not a
  new foreground/ANSI-palette brightening feature — so this is a re-default (0 → 25), not a new
  control; the color math (`terminalBackground.ts`) and live-apply path (`applyTerminalSettings`,
  the #18 no-remount/no-scrollback-replay invariant) are untouched.
- The legacy default 0 is also the opt-out endpoint, so the one-time bump nudges a
  deliberately-chosen 0 back to 25 the first boot after shipping; the flag makes it a one-shot
  (re-set 0 and it sticks) — the same accepted tradeoff as the #367 line-height migration, and
  nearly all stored 0s are the untouched old default.
- Slider kept in the Appearance section where #390 placed it; no relocation, relabel, or help-text
  change.

**Cross-platform:** pure frontend / xterm / TS with zero OS branches — no `#[cfg]`, path, shell,
or CSS divergence; macOS, Windows, and Linux (incl. detached canvas windows #84) behave
identically.

**Dependencies:** none.

### 415. [x] Rank file-search dropdowns by relevance (filename matches above content/path-only matches)

File-search dropdowns now order results **best-match first**: a file whose **name** matches the
query (exact/prefix especially) sorts above files that match only in a directory segment or (in the
FileTree) in file *contents*, instead of the previous roughly-alphabetical backend walk order.
Non-matching-name results still appear, just lower — the same relevance model GlobalSearch (#337/#393)
already used, now brought to the `FilePicker`-based dropdowns and the FileTree in-panel search for
cross-surface consistency.

**What shipped** (branch `rank-file-search-relevance`, PR
[#174](https://github.com/ErikdeJager/ReCue/pull/174), merged 2026-07-15 into `dev`):

- **New pure module `src/fileRank.ts`** (+ `src/fileRank.test.ts`) — React/store/Tauri-free,
  mirroring `GlobalSearch/search.ts`'s style: `scoreFilePath(query, relPath)` scores a matched path
  by basename tier (exact 100 / prefix 80 / word-boundary 60 / mid-substring 40 / directory-only 20;
  empty query → 0), and `rankFileMatches(query, paths)` reorders by score desc, tie-broken by shorter
  full path → alphabetical → stable input order. An **empty query returns input order unchanged**
  (browse-all is not reordered); the transform never mutates its input.
- **`src/components/FilePicker/FilePicker.tsx`** — `filtered` is now
  `useMemo(rankFileMatches(query, matches ?? []))`, with the active-row reset effect keyed on
  `[matches, query]` so the highlight returns to the top as the ranked order changes. This single
  choke point covers the file-viewer switcher (#90), the Kanban/markdown open picker (#145/#151),
  `CreatePanelModal`, and `TemplatePendingPanel`.
- **`src/components/FileTree/FileTree.tsx`** — the **"Files"** group renders from a
  `useMemo(rankFileMatches(debounced, fileHits))`; the **"In files"** content group is left below,
  unchanged. `fileCount` / `fileCapped` and every result cap are untouched (ranking reorders, never
  drops).

**Key decisions** (from `ASSUMPTIONS.md` Task 415)

- Scoring is a **frontend** pure helper over the already-capped backend result set — **no** backend /
  IPC / cap change; `search_files` / `search_file_contents` stay exactly as they are.
- Per surface: FilePicker doesn't search content, so "name > contents" there means basename-match
  above directory-only-match; the FileTree already renders content matches in a separate group below
  filename matches, so this task only ranks within the filename group and leaves content hits
  untouched.
- Tiers deliberately mirror GlobalSearch's `scoreFilename`; GlobalSearch is the reference model and is
  left untouched (non-goal). Cap-boundary limitation accepted and documented (a pathological ultra-broad
  query that hits the cap ranks only the first-N-by-walk).

**Cross-platform:** pure string logic over POSIX (`/`) repo-relative paths — no separator, `$HOME`,
or OS branch; identical on macOS, Windows, and Linux.

**Dependencies:** none.

### 413. [x] Line-cap large files in the file viewer with a "show more" reveal

The universal FileViewer no longer janks (or freezes) opening a very large text/markdown file
(e.g. `TASK_ARCHIVE.md`, ~1,742 lines): it renders only the first N lines and offers an in-viewer
button to progressively reveal the rest, so the panel opens instantly and the whole file is still
readable on demand. The cap is by **line count**, orthogonal to the existing 256 KB byte threshold —
it fixes the rendered-markdown path (a large react-markdown AST + Prism highlighting) that the byte
cap didn't help.

**What shipped** (branch `line-cap-large-files`, PR
[#175](https://github.com/ErikdeJager/ReCue/pull/175), merged 2026-07-15 into `dev`):

- **New pure helper `src/components/FileViewer/lineCap.ts`** (+ `lineCap.test.ts`) —
  `LINE_CAP = 500` (initial), `LINE_CHUNK = 1000` (per "show more"), `nextVisible(current, total,
  chunk)` (clamps to total), and `lineTruncation(total, visible, chunk)` → `{ total, shown, remaining,
  truncated, nextChunk }` (the pure logic the footer renders).
- **`src/components/FileViewer/FileViewer.tsx`** — a `visibleLines` state (reset to `LINE_CAP` per
  file alongside the Raw-mode reset), a memoized line split, and `displayText` (the first
  `visibleLines` lines) fed to the three **read-only** sinks (rendered markdown / Prism `CodeBlock` /
  read-only `<pre>`, including the >256 KB `tooLarge` path). The **editable auto-saving `<textarea>`**
  stays on the **full** `text`, so a save (auto or ⌘S) always writes the complete file — never a
  truncated buffer. While rendered markdown is truncated, its interactive #173 task-list checkboxes
  render read-only (`interactive: !(renderMarkdown && truncated)`, `source: displayText`) so a toggle
  can't persist a partial buffer. A pinned footer bar shows "Showing N of M lines" (`aria-live`
  status) with native, keyboard-operable "Show K more lines" and "Show all" buttons; it disappears
  once every line is shown.
- **`src/components/FileViewer/FileViewer.module.css`** — `.moreBar` / `.moreCount` / `.moreBtn` /
  `.moreLink` (tokens only).

**Key decisions** (from `ASSUMPTIONS.md` Task 413)

- The editable textarea is **never** line-capped (it always holds the full file → saves write the
  complete file) — the deliberate "don't corrupt saves" choice; the cap applies only to read-only
  render paths and is additive with the 256 KB `LARGE_BYTES` threshold.
- Defaults `LINE_CAP = 500` / `LINE_CHUNK = 1000` plus a "Show all" (both chunked and all-at-once
  reveal) — tunable single-source constants; the reveal control is a pinned footer bar, not inside
  the scroll region.
- Mermaid needs no code change (capping the source omits later fences; a split fence degrades to its
  code block + error note until revealed). No backend change (`read_text_file` still reads the whole
  file, 5 MB cap); scope limited to the universal FileViewer (KanbanPanel / PatchNotes / Settings out
  of scope).

**Cross-platform:** pure frontend / TS / CSS with no OS-specific primitive — identical on macOS,
Windows, and Linux.

**Dependencies:** none.

### 417. [x] Keep homepage empty-state tips on a single line (never wrap)

The startup **tip** under the "New session" button on the empty-state hero now always sits on
exactly one line — never wrapping to a second. A tip too wide for the available space truncates
with an ellipsis (full text on hover) instead of wrapping or overflowing the layout.

**What shipped** (branch `task-417-single-line-tips`, PR
[#178](https://github.com/ErikdeJager/ReCue/pull/178), merged 2026-07-15 into `dev`):

- **`src/components/EmptyState/EmptyState.module.css`** — `.tipText` gains `white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;` (keeping `min-width: 0` so the flex item can shrink
  and the ellipsis triggers); `.tipRow`'s cap widens `max-width: 460px` → `min(92%, 700px)` so every
  curated ≤100-char tip fits on one line while still bounding to the container on a narrow window
  (where the ellipsis engages).
- **`src/components/EmptyState/EmptyState.tsx`** — computes `renderedTip` once and renders the tip
  span as `<span className={styles.tipText} title={renderedTip}>{renderedTip}</span>`, so a truncated
  tip is still fully readable via the native tooltip.

**Key decisions** (from `ASSUMPTIONS.md` Task 417)

- The single-line requirement takes precedence over showing full text: an over-long tip truncates
  with an ellipsis rather than wrapping/overflowing.
- The 700px cap relies on the existing `tips.test.ts` ≤100-char / no-newline guarantee (JetBrains
  Mono's uniform advance makes a fixed single-line width hold for all tips); a future over-long tip
  simply truncates, so the change is self-correcting.
- Interpreted "tips underneath the new session button" as the EmptyState hero tip fed by
  `src/tips.json` — the only such surface. Tip content, catalog, shuffle logic, and `renderTip` are
  untouched.

**Cross-platform:** pure CSS + one JSX `title` attribute — `white-space: nowrap` /
`text-overflow: ellipsis` are universal; no `#[cfg]` / `platform` branch — identical on macOS
(WKWebView) and Windows/Linux (Chromium).

**Dependencies:** none.

### 418. [x] Update the Canvas empty-state hint to say "Drag in a panel from the left"

An empty Canvas tab's hint now reads **"Drag in a panel from the left, or start with an empty tab"**
instead of "Open a view from a session, or start with an empty tab", so the copy accurately
describes how a user fills a Canvas tab (by dragging a sidebar row in from the left).

**What shipped** (branch `update-canvas-empty-state-hint`, PR
[#177](https://github.com/ErikdeJager/ReCue/pull/177), merged 2026-07-15 into `dev`):

- **`src/components/Canvas/CanvasSurface.tsx`** — the `centerHint` line in `CenterDrop()` changed its
  leading clause "Open a view from a session" → "Drag in a panel from the left", keeping the trailing
  ", or start with an empty tab" (which describes the "New tab" button below), the `centerTitle`
  heading, the icon, and the button unchanged. `CanvasSurface` is the shared surface for both the
  main Canvas view and detached canvas windows (#84), and the string appeared exactly once, so both
  places update from one edit.

**Key decisions** (from `ASSUMPTIONS.md` Task 418)

- The card's before/after `…` was truncation shorthand, not literal copy — only the leading clause is
  replaced, preserving the trailing "New tab" clause; final copy: "Drag in a panel from the left, or
  start with an empty tab".
- "From the left" is accurate on all platforms (the sidebar drag source is always left of the canvas;
  layout is not OS-conditional).

**Cross-platform:** a pure user-facing copy change, no branch/logic/CSS — identical on macOS,
Windows, and Linux.

**Dependencies:** none.

### 420. [x] Accent-color the "Cue" in the empty-state "ReCue" wordmark

The empty-state hero's "ReCue" wordmark is now subtly two-tone: **"Re"** keeps the default text
color and **"Cue"** is drawn in the app accent (`var(--accent)`, Peach by default). Purely visual
polish — no behavior change.

**What shipped** (branch `accent-cue-wordmark`, PR
[#179](https://github.com/ErikdeJager/ReCue/pull/179), merged 2026-07-15 into `dev`):

- **`src/components/EmptyState/EmptyState.tsx`** — the single `ReCue` text node in the `.wordmark`
  div split to `Re<span className={styles.accent}>Cue</span>` (adjacent, no whitespace, so it still
  reads/copies as "ReCue").
- **`src/components/EmptyState/EmptyState.module.css`** — a new `.accent { color: var(--accent); }`
  rule; everything else (size, weight 700, letter-spacing, `text-shadow` incl. its light-theme halo)
  is inherited from `.wordmark`, so only the "Cue" glyph color changes.

**Key decisions** (from `ASSUMPTIONS.md` Task 420)

- Split point is "Re" | "Cue" so exactly the "Cue" glyphs take `var(--accent)`; using the token (not
  a hex) means a custom accent from Settings → Appearance recolors it **live**, and no light-theme
  override is needed since `var(--accent)` is already theme-tuned (`#e05a0a` on Latte).
- No unit test — `EmptyState` is pure presentational JSX; verification is lint + build + manual smoke
  (accent-override live recolor, dark/light legibility). Only the hero wordmark is touched; other
  "ReCue" appearances (window title, About, patch notes, onboarding) are left as-is.

**Cross-platform:** pure frontend CSS + JSX, no platform branching — byte-identical on macOS,
Windows, and Linux.

**Dependencies:** none.

### 419. [x] Cap the width of every Overview panel, not just agent cards

With the "cap card width" setting on (default), the 900px maximum now applies to **every** Overview
column type — file, diff, terminal, kanban, filetree, and scheduled panels — not just agent and
recurring cards, giving the wall a consistent comfortable maximum instead of letting non-agent
panels stretch unbounded.

**What shipped** (branch `cap-overview-panel-width`, PR
[#180](https://github.com/ErikdeJager/ReCue/pull/180), merged 2026-07-15 into `dev`):

- **`src/components/Overview/Overview.tsx`** — `ExtraPanel` (file/diff/terminal/kanban/filetree) and
  `ScheduleCard` now read `capWidth = useStore((s) => s.settings.capAgentWidth)` and pass
  `capped={capWidth}` to their `PanelColumn`, reusing the existing `.card` → `.cardCapped`
  (`max-width: 900px`) mechanism that `SessionCard` / `RecurringCard` already used. Broadened the
  `PanelColumn.capped` prop doc + `SessionCard` inline comments.
- Copy broadened without touching the persisted key: the **`capAgentWidth`** settings key, its
  default `true`, and its `mergeSettings` back-fill are unchanged (so old blobs and the store tests
  stay green) — only its *meaning* widened. Settings → Appearance label "Cap agent card width" →
  **"Cap Overview panel width"**, help text → "Limit Overview panels to a comfortable maximum width.";
  the `types/index.ts` / `store.ts` / `.cardCapped` CSS comments broadened to match.

**Key decisions** (from `ASSUMPTIONS.md` Task 419)

- Reuse `capAgentWidth` as the single gate — no new key, no migration — for migration-safety and
  store-test stability; the cap stays **gated by the toggle for all panel types** (turning it off
  leaves every column uncapped).
- One shared 900px cap for every panel type (no per-type values); Overview-wall only — Big mode /
  Canvas / detached windows untouched. The #176 min-width floor and horizontal scroll are unchanged.

**Cross-platform:** pure frontend CSS-class application + a store read, no OS branch — identical on
macOS, Windows, and Linux.

**Dependencies:** none.

### 416. [x] Dev-container new-session modal — portal info popover, inline build feedback, kbd-hint layout

Three rough edges on the New Session modal's "Run in dev container" toggle row fixed in one cohesive
change: the info "i" popover now overlays the whole app (no longer clipped inside the 300px scrolling
modal), a first-run image build is surfaced as inline yellow warning text + spinner beside the Start
button (instead of a toast), and the row lays out justify-between (toggle left; kbd hint + "i" info
icon grouped right).

**What shipped** (branch `task-416-container-modal-popover`, PR
[#181](https://github.com/ErikdeJager/ReCue/pull/181), merged 2026-07-15 into `dev`):

- **`ContainerInfoPopover.tsx`** — the popover panel is now `createPortal`'d to `document.body` with
  `position: fixed`, anchored **above-and-to-the-left** of the "i" trigger from its
  `getBoundingClientRect()`, clamped ≥8px from every viewport edge (flips below if there's no room
  above). Outside-click checks **both** trigger and panel refs (the panel is no longer a descendant),
  the capture-phase Escape (closes only the popover) is unchanged, a modal **scroll closes** it, and
  a window **resize repositions** it. ARIA (`aria-expanded`/`aria-label`, panel `role="note"`) kept.
- **`NewSessionModal.tsx`** — the toggle row restructured to `justify-content: space-between`: the
  checkbox "Run in dev container" on the left, a new `.containerRowActions` group (kbd hint then the
  "i" icon) on the right, and the docker-stopped "start Docker" hint relocated to its own full-width
  line below. The kbd moved out of the checkbox label; the chord renders via
  `chordLabel(CONTAINER_TOGGLE_CHORD, platform)` (⌘⇧C / Ctrl+Shift+C). A modal-local
  `containerBuilding` state (reset on open) subscribes to `container://building` while open and is
  cleared when `ensureContainerImage()` settles; a yellow `.buildingHint` ("Building the dev container
  (first run)…") + lucide `<Loader>` spinner renders left of Start only during a genuine first-run
  build (an already-built image never flashes).
- **`store.ts`** — the `container://building` toast is gated on `!get().newSessionOpen`, so the modal's
  inline indicator owns the in-modal case while a build starting **after** the modal closes still
  toasts (feedback never lost).
- **`containerAvailability.ts` (+ test)** — a pure `showBuildIndicator(useContainer, building,
  blocked)` helper used at the render site, with unit cases.

**Key decisions** (from `ASSUMPTIONS.md` Task 416)

- The build indicator is **event-driven** (shown only while a real `docker build` is in flight), not
  optimistic on toggle-ON, so a built image never flashes; toast suppressed only while the modal is
  open.
- Build state kept **modal-local** (`useState` + a modal-scoped listener); the only store change is
  the one-line toast gate — keeps the change small and cohesive.
- Popover anchored above-left (per explicit user guidance), portaled with viewport clamping; the
  right group is kbd-then-"i" (info icon rightmost); yellow uses the existing `--status-awaiting`
  token; the spinner relies on the global reduced-motion killswitch.

**Cross-platform:** pure frontend / CSS; the only OS-sensitive bit (the chord glyphs) already routes
through `chordLabel` — identical on macOS, Windows, and Linux. No Rust / backend change.

**Dependencies:** none.

### 421. [x] Relocate the dev-container "Building…" indicator above the modal action buttons

In the New Session modal, the first-run "Building the dev container (first run)…" status line +
spinner is moved out from between the Cancel/Worktree/Start action buttons onto its own full-width
line **above** the button row — in the gap below the "Run in dev container" checkbox row — so the
build feedback reads as a clear status line instead of being wedged inline beside Start. Position
only; when it shows is unchanged.

**What shipped** (branch `task-421-container-building-indicator`, PR
[#183](https://github.com/ErikdeJager/ReCue/pull/183), merged 2026-07-16 into `iteration-2`):

- **`src/components/NewSessionModal/NewSessionModal.tsx`** — the `.buildingHint` JSX block (the
  `{!deferMode && showBuildIndicator(...) && (<span className={styles.buildingHint} role="status">…
  <Loader/>…</span>)}` expression) is cut out of `<div className={styles.actions}>` and re-inserted as
  a **sibling of `.actions`**, after the dev-container opt-in IIFE block and before the action row. As
  a `.popover` flex-column child it becomes its own row above the buttons; the guard, the
  `showBuildIndicator(...)` call, the spinner, the copy, and `role="status"` are byte-for-byte
  unchanged. The two now-stale "beside/left of Start" position comments were reworded.
- **`src/components/NewSessionModal/NewSessionModal.module.css`** — `.buildingHint` gains
  `margin-bottom: var(--space-12)` so it spaces evenly between the checkbox row (already
  `margin-bottom: var(--space-12)`) and the button row; its descriptive comment updated. As a
  flex-column child the `inline-flex` span blockifies full-width and left-aligns, matching the sibling
  `.containerHint` docker-stopped line.

**Key decisions** (from `ASSUMPTIONS.md` Task 421)

- Kept the existing inline `.buildingHint` span (#416) rather than reintroducing a toast — the card
  asks only to move the text; relocate it, don't re-implement it.
- Kept the wording "Building the dev container (first run)…" verbatim, and the spinner, `role="status"`,
  and `--status-awaiting` color unchanged — only position + one CSS margin changed.
- Placed the line as its own full-width, left-aligned row (matching `.containerHint`) with
  `margin-bottom: var(--space-12)`, mirroring the modal's existing rhythm.
- `showBuildIndicator`'s logic (and its unit tests, which assert the pure helper, not DOM order) are
  untouched, so the indicator still shows under exactly the same conditions.

**Cross-platform:** pure frontend TSX/CSS over existing tokens (`--space-12`, `--status-awaiting`); no
OS-conditional code — identical on macOS, Windows, and Linux (Chromium/WebKit WebView on all three).
The real first-run docker-build smoke was flagged for interactive verification in the PR.

**Dependencies:** none. (Builds on #416's inline build indicator.)

### 422. [x] Give the top Kanban card room to lift on hover (stop it clipping under the column header)

In the in-app Kanban board, the topmost card in each column was clipped by the column's top edge when
its hover-lift animation (Task 409's `translateY(-2px)` + soft shadow) raised it — because the
`.cards` list had `top` padding `0` and its `.column` ancestor has `overflow: hidden`. Fix: give the
card list symmetric top padding so the lifted top card (and its shadow) stays fully visible.

**What shipped** (branch `task-422-kanban-top-card-lift`, PR
[#182](https://github.com/ErikdeJager/ReCue/pull/182), merged 2026-07-16 into `iteration-2`):

- **`src/components/Kanban/KanbanPanel.module.css`** — the `.cards` rule's `padding` shorthand changed
  from `0 var(--space-8) var(--space-8)` to `var(--space-8)` (top `0`→`8px`; right/bottom/left were
  already 8px), with an explanatory Task 422 comment. The top card now rests 8px below the clip-region
  top, so a 2px lift stays comfortably inside — reaching parity with the already-accepted 8px bottom
  padding that absorbs the identical bottom-card lift.

**Key decisions** (from `ASSUMPTIONS.md` Task 422)

- Fix by adding top padding to `.cards` rather than shrinking the hover lift or altering `.column`'s
  `overflow: hidden`/rounded corners — keeps Task 409's lift + rounding intact and just makes room.
- 8px (`var(--space-8)`), making `.cards` padding symmetric — reads as even (not a lopsided gap) and
  matches the bottom padding by construction. `.column`'s `overflow`, `.cards`' `overflow-y: auto`
  scroll behavior, dragging, the DragOverlay preview, the placeholder, and the composer are all
  untouched; reduced-motion already suppresses the lift (no clip to fix there).

**Cross-platform:** a one-line CSS padding tweak over an existing token — no `#[cfg]`/platform CSS
branch; identical on macOS (WKWebView), Windows (WebView2), and Linux (WebKitGTK).

**Dependencies:** none. (Adjusts Task 409's Kanban hover-lift.)

### 423. [x] Round the Kanban board's controls and equalize the Add/Cancel buttons

Inside the in-app Kanban board only, the buttons and text inputs/areas now get the same slight corner
rounding the cards already have (so the composer/edit controls visually belong to the rounded cards),
and the add-card composer's "Add card" / "Cancel" buttons are made exactly the same size. The
app-wide square corner language is unchanged — a board-scoped exception, like Task 409's card/column
rounding.

**What shipped** (branch `task-423-kanban-control-rounding`, PR
[#184](https://github.com/ErikdeJager/ReCue/pull/184), merged 2026-07-16 into `iteration-2`) — a
CSS-only change to **`src/components/Kanban/KanbanPanel.module.css`** (57 lines):

- **Rounding:** every Kanban interactive control now references `--radius-micro` (4px, the existing
  card radius) instead of the zeroed `--radius-chip`/`--radius-control` — the composer input + Add/
  Cancel buttons, the card-edit input + Save/Cancel, the column-rename input + hover affordance, the
  `.colBtn`/`.cardBtn` icon buttons, the toolbar `.saveBtn`, `.undoRow`, `.addColumn`, and the
  `.rawEditor` (which had no radius). Rendered card-body markdown (inline code/pre, GFM task
  checkboxes) is left square — that's content, not composer chrome.
- **Equal size:** `.composerAdd` and `.composerCancel` gain `flex: 1` + `justify-content: center`, so
  they split their row 50/50 regardless of label text (a min-width couldn't guarantee equality); the
  reused card-edit Save/Cancel row is equalized by the same rule.

**Key decisions** (from `ASSUMPTIONS.md` Task 423)

- Reuse `--radius-micro` (4px) — "slightly rounded to match the cards" taken literally — referenced
  only from the Kanban module (no global token edit), matching Task 409's in-file pattern.
- Round all Kanban buttons + text inputs/areas (listed above); leave rendered-markdown code/pre and
  the task checkbox square.
- Equalize via `flex: 1` + centered content rather than a min-width, so the split is exact.
- Pure CSS, no `KanbanPanel.tsx` change; platform-neutral.

**Cross-platform:** CSS-token-only over an existing token — no `#[cfg]`/platform CSS branch; identical
on macOS, Windows, and Linux.

**Dependencies:** none. (A board-scoped rounding exception alongside Task 409; does not touch #422's
`.cards` padding.)

### 424. [x] Show a startup tip on the filtered-Overview empty state (drop the wave-companion copy)

When the Overview wall is filtered to a folder/branch that has no sessions yet, the empty state no
longer shows the "the wave keeps you company until then" line — it now shows a rotating **startup
tip**, exactly like the welcome hero's tip (same "tip" chip, rotating text from `tips.ts`, and
click-to-shuffle). The "No sessions in <repo> yet" title and the "New session" button above it stay.

**What shipped** (branch `task-424-filtered-empty-tip`, PR
[#185](https://github.com/ErikdeJager/ReCue/pull/185), merged 2026-07-16 into `iteration-2`):

- **New `src/components/TipRow/` (`TipRow.tsx` + `TipRow.module.css`)** — a shared tip component
  extracted from the welcome hero (the "tip" chip, rotating text via the existing `tips.ts` helpers,
  click-to-shuffle), so `EmptyState` and the Overview filtered branch reuse one implementation instead
  of duplicating it; the tip CSS moved into the new module.
- **`src/components/EmptyState/EmptyState.tsx` / `.module.css`** — now render `<TipRow />` and drop
  their inline tip markup + the moved CSS rules.
- **`src/components/Overview/Overview.tsx` / `.module.css`** — the filtered-empty branch renders
  `<TipRow />` in place of the removed "wave keeps you company" line.

**Key decisions** (from `ASSUMPTIONS.md` Task 424)

- Remove only the "the wave keeps you company until then" line; keep the "No sessions in <repo> yet"
  title and the "New session" button.
- The tip renders identically to the welcome hero (same chip, rotating text, click-to-shuffle) via the
  existing `tips.ts` helpers.
- **Reuse, not duplicate** — extract a shared `TipRow` used by both `EmptyState` and the Overview
  filtered branch, moving the tip CSS into it.
- Left the non-filtered `!filter` fallback string ("No agents yet.") unchanged — the card targets the
  filtered folder/branch case only.

**Cross-platform:** pure React/TS + CSS-token component extraction; no path/shell/native primitives —
identical on macOS, Windows, and Linux.

**Dependencies:** none.

### 425. [x] ⌘W removes the selected agent (and schedule/recurring) on the Overview wall

On the Overview wall, **⌘W / Ctrl+W** now removes the selected **agent** (previously it closed only
non-agent panels, so agents felt un-closeable by keyboard), and the fix is extended to also close a
selected **schedule** and **recurring** card — closing the whole "only non-agent panels are closed"
gap so ⌘W matches each card's own × exactly.

**What shipped** (branch `task-425-cmdw-remove-agent`, PR
[#186](https://github.com/ErikdeJager/ReCue/pull/186), merged 2026-07-16 into `iteration-2`):

- **`src/store.ts`** — `closeFocusedPanel`'s Overview branch now dispatches by the selected item's
  kind: an agent via `removeSession`, a schedule via `cancelSchedule`, a recurring via
  `cancelRecurring` (each the same un-gated action as that card's ×), in addition to the existing
  `removeOverviewPanel` for file/diff/terminal/kanban panels. Doc-comment updated.
- **`src/store.test.ts`** — new coverage for the agent / schedule / recurring ⌘W-close paths.

**Key decisions** (from `ASSUMPTIONS.md` Task 425)

- **Confirm gate:** ⌘W removes the agent via the **same un-gated path** as its ×/Remove — *not* routed
  through `confirmDestructive` (which gates only bulk teardown); every single-agent remove in the app
  is un-gated, and "easily" argues against friction. (The caller's suggestion to honor the gate was
  deliberately declined; trivial to add later.)
- **Canvas vs Overview:** Canvas / detached-window ⌘W on an agent leaf stays "close the panel only"
  (`removeLeaf`; the agent survives in the pool/Overview), matching the Canvas header ×. Only
  **Overview** ⌘W kills+forgets, matching Overview's × semantics.
- **Scope completion:** also closes a selected schedule (`cancelSchedule`) and recurring
  (`cancelRecurring`), not just agents — matching each card's × exactly.
- **Focus advance:** Overview ⌘W does **not** advance selection to a neighbor after removal (matching
  the existing non-agent Overview close); `selectedId` clears/goes stale, so a repeat ⌘W is a safe
  no-op. Neighbor-advance stays Canvas-only.

**Cross-platform:** pure store/TS logic; the shortcut already matches `metaKey || ctrlKey`, so ⌘W on
macOS and Ctrl+W on Windows/Linux both fire — identical on all three.

**Dependencies:** none.

### 426. [x] Multi-window 1/16 — Terminal-view attachment registry + smallest-wins PTY size arbitration

The backend foundation for the multi-window epic (cards 1–16): a single authoritative answer to
"who is viewing session X, and how big must its PTY grid be?". Per session it tracks which windows
view it and each view's desired `(cols, rows)`; the **effective grid** is the component-wise
minimum over all attached views (tmux `window-size=smallest` — every window always sees the complete
grid, larger views letterbox). This card lands as a **behavior-preserving no-op with ZERO frontend
changes**: the new commands/events exist and are unit-tested, but nothing calls them yet — later
cards (2/16 frontend mirror sizing, 3/16 change broadcasts, 9/16 full app windows, 15/16 targeted
output) consume it.

**What shipped** (branch `task-426-terminal-view-registry`, PR
[#188](https://github.com/ErikdeJager/ReCue/pull/188), merged 2026-07-16 into `backend-decouple`,
commit `f005576`; 4 files, +695/-16):

- **`src-tauri/src/terminal_views.rs`** — **new** (503 lines), all policy in one place (the
  `linux_webkit.rs` pattern: pure, unit-tested core + thin glue). A pure `ViewRegistry` (session id →
  window label → desired `(cols, rows)`, plus a per-session last-**applied** effective size) with a
  `SizeUpdate { cols, rows, resized }` result: `effective` (component-wise min, `None` when no
  views), `attach` (upsert), `detach` (drop the view; drop the session entry when it was the last
  one), `propose` (updates desired size **only if the view is already attached** — a never-attached
  or purged view is a no-op, so a late `ResizeObserver` racing a window close can't resurrect a
  zombie view that clamps the PTY forever), and `purge_window` (drop a label's views across every
  session, return the sessions whose effective grid changed). All dims clamped to `>=1`. A thin
  `TerminalViews` Tauri-managed wrapper (poison-recovering `Mutex`, `kill_all` precedent) holds the
  lock across mutate + best-effort `resize_pty` + `broadcast_size`. Full unit tests (pure registry
  bulk + glue tests driving a real sessionless `SessionManager` and asserting the `SessionEvent::Size`
  sequence).
- **`src-tauri/src/pty.rs`** — new `SessionEvent::Size { id, cols, rows }` variant (doc-commented as
  the authoritative multi-window grid, emitted only by the arbiter, never by reader/monitor threads)
  + a best-effort `SessionManager::broadcast_size`. Two tests added (`coalesce_output_events` passes
  `Size` through unmerged / splits an Output run; `broadcast_size` delivers exactly one event).
  `resize_pty` (command + manager method) **byte-for-byte untouched**.
- **`src-tauri/src/commands.rs`** — `SizePayload { id, cols, rows }` (for `session://size`) +
  `GridPayload { cols, rows }` (attach return) + three thin **synchronous, infallible** commands:
  `attach_terminal(id, window_label, cols, rows) -> GridPayload`, `detach_terminal`,
  `propose_terminal_size` (synchronous for the same #353 out-of-order-resize reason as `resize_pty`;
  `window_label` is an explicit param, not derived from the invoking `Window`, for later cross-window
  cards).
- **`src-tauri/src/lib.rs`** — `mod terminal_views;`; `app.manage(TerminalViews::default())`; the
  `session://size` forwarder arm; registered the three commands; restructured the `.run(...)` closure
  from `if let RunEvent::Exit` to a `match` with the **Exit body kept byte-identical** (the
  container sweep + `kill_all` ordering is load-bearing, #354) plus a **global**
  `WindowEvent::Destroyed` arm that purges ALL views of the closing window label (any window kind —
  `main`, `canvas-*`, future app windows) via `try_state` (never panics during teardown).

**Key assumptions carried over** (from `ASSUMPTIONS.md` Task 426)

- **One global Destroyed seam**, not a per-window `on_window_event` — fires for every window kind
  incl. future app windows; `try_state` guards teardown ordering. The `open_canvas_window` per-window
  re-dock handler stays as-is (additive, label-generic).
- **`propose` on a never-attached/purged view is a no-op, NOT an implicit attach** — prevents a late
  `ResizeObserver` racing a window close from resurrecting a zombie view.
- **`session://size` is emitted on every effective-grid change PLUS always on attach** (even
  unchanged, so a new host learns the grid); detach/propose/purge emit only on change.
- **"Resize only when changed" compares against the registry's last-APPLIED size, not the PTY's
  actual size** — so the legacy `resize_pty` passthrough can go stale vs the registry; accepted
  transitional state (documented in-module), resolved when later cards migrate the frontend onto
  attach/propose. Registry entries for killed/exited sessions are left inert (no `kill_session`
  cleanup — out of scope for card 1).
- **Lock-order rule:** the registry mutex may be held while calling into `SessionManager`, but
  `pty.rs` never calls into `terminal_views`, so no cycle is possible (documented in module docs).
- No `capabilities/default.json` change (Tauri 2 custom commands aren't ACL-gated); no version bump /
  patch notes (releases are batched by the maintainer).

**Cross-platform:** pure Rust over `HashMap`/`Mutex`/`mpsc` plus the already-abstracted
`SessionManager::resize_pty` (portable-pty's `TIOCSWINSZ`/`ResizePseudoConsole`), so no `#[cfg]` arms
are needed — identical on macOS, Windows, and Linux.

**Dependencies:** none.

### 427. [x] Multi-window 2/16 — Frontend mirror-capable terminal sizing: attach/propose views, broadcast-driven grid, letterboxed slots

Moves the frontend terminal pool off the "my window owns the PTY size" model onto the task-426
attach/propose/broadcast protocol: a terminal host **never resizes its own xterm grid** — it
*proposes* a size for its slot and renders whatever grid the backend's smallest-wins arbiter
broadcasts, centered/letterboxed in the slot. Every pooled terminal is now mirror-capable (tmux
`window-size=smallest`), the foundation the rest of the epic builds on. With one owner per session
today, behavior is **visually unchanged** (single view ⇒ the arbitrated grid *is* this window's
shaved proposal).

**What shipped** (branch `task-427-frontend-mirror-sizing`, PR
[#189](https://github.com/ErikdeJager/ReCue/pull/189), merged 2026-07-16 into `backend-decouple`,
commit `71bcdaf`; 8 frontend files, +417/-53, zero `src-tauri/` changes):

- **`src/components/Terminal/terminalPool.ts`** — the core rework. A per-host `attachView` measures a
  proposal (fit `proposeDimensions()` + the #262 bottom-clearance shave, falling back to current
  `term.cols/rows` when unmeasurable), calls `attach_terminal` and applies the **returned** effective
  grid via `term.resize` **before any scrollback byte is written** (a per-host **attach gate** the
  replay job awaits, with a 1s safety timeout so a slotless `resetTerminal` host can never wedge the
  `MAX_CONCURRENT_REPLAYS=1` replay queue). The debounced (still exactly `RESIZE_DEBOUNCE_MS=120`)
  `ResizeObserver` path now **proposes only** (`propose_terminal_size`), never `fit.fit()`/local
  `term.resize`; a resize tick while unattached re-attaches instead (self-heal, since the backend
  drops proposals for never-attached views). A lazy once-per-document pool-level `session://size`
  listener is **the only** code that resizes an xterm grid after attach. `unmountTerminal` + `dispose`
  send `detach_terminal` so an invisible terminal never holds the min down. `#351`
  `trimmable=false` moved to after the attach gate.
- **`src/components/Terminal/sizeProposal.ts` (+ `.test.ts`)** — **new** pure DOM-free helpers:
  `sanitizeProposal` (NaN/undefined/non-positive → null, else integers clamped ≥1) and
  `shaveProposalRows` (the #262 shave applied to the *proposed* row count; no shave for rows ≤ 1 or
  unreadable metrics).
- **`src/ipc.ts`** — removed the now-unused `resizePty` wrapper (single caller was the pool; the Rust
  `resize_pty` command stays untouched per 426); added `attachTerminal` → `GridPayload`,
  `detachTerminal`, `proposeTerminalSize`, and a standalone `subscribeSessionSize` helper (feeds the
  pool, not the store — the `outputBus` "geometry is terminal-plumbing, keep it out of React state"
  philosophy).
- **`src/types/index.ts`** — `SizePayload { id, cols, rows }` + `GridPayload { cols, rows }` mirrors.
- **`src/windowContext.ts` (+ `.test.ts`)** — new `IS_DETACHED_CANVAS_WINDOW` constant replaces
  `IS_MAIN_WINDOW` at the three #105 WebGL-gate sites, so the DOM-renderer fallback is scoped to
  detached **canvas** windows specifically and a future full app window (card 9/16) gets WebGL by
  default (byte-identical today — asserted equal to `!IS_MAIN_WINDOW`; the #364 per-window latch
  untouched).
- **`src/components/Terminal/Terminal.module.css`** — token-only letterbox: flex-centering on
  `.terminal` + `flex:0 0 auto` on `:global(.xterm)`; bands show the existing
  `--terminal-bg-user`/`--terminal-bg` wrapper token (no new colors). Grid == fit (today's single-view
  case) is pixel-equivalent.

**Key assumptions carried over** (from `ASSUMPTIONS.md` Task 427)

- **Attach on every `mountTerminal`** (backend upsert; a re-mount into a different slot re-measures);
  grid-before-replay enforced by the attach gate + 1s timeout (because `replayQueue` starts jobs
  synchronously on enqueue, before the slot is assigned, and a slotless `resetTerminal` host never
  attaches).
- The **returned** effective grid is applied via `term.resize` (not the broadcast) to guarantee
  ordering; the attach-triggered broadcast then arrives as a no-op resize.
- `session://size` consumed by a **lazy once-per-document pool-level listener** (registered from
  `ensureHost`, never unsubscribed — the `parkingLayer` precedent), never store state.
- Fire-and-forget attach/detach/propose ordering leans on Tauri's per-webview invoke FIFO + the
  synchronous (#353) backend commands + upsert/no-op semantics; the `!attached ⇒ attachView` self-heal
  recovers any dropped attach.
- The scrollbar-hugs-grid cosmetic nuance is a flagged smoke check with a `padding-right` fallback.

**Out of scope (deferred):** ownership/reconcile policy (`computeSessionOwners`, `ownedHere`,
`DetachedNote`, per-window `reconcileTerminals`) stays as-is — one window renders a session at a time,
so the mirror path is exercised but single-view until card 11/16. No `src-tauri/` change.

**Cross-platform:** WebView TS + CSS (identical WKWebView / WebView2 / WebKitGTK — flex centering and
token vars are universal); the one platform-sensitive primitive (PTY resize) lives behind the 426
backend seam.

**Dependencies:** Task 426.
