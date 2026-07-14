# Tasks

This is the **permanent archive** of completed tasks, maintained by the `kanban-dev-pima`
pipeline's **`/archive-tasks`** lane (it appends a `## Task <N>` entry as each `ARCHIVE` card is
finished). A task number counts as a satisfied dependency once it appears here (or in the
board's `## ARCHIVE` column). Numbers are **global and never reused** — the next number is one
greater than the highest used anywhere (board, `PLAN-*.md`, this file).

The **Implemented (completed tasks)** index below is a condensed, one-line-per-task record of
everything shipped so far — **#1–#310**. Earlier tasks were carried over from the prior pipeline;
tasks #152–#310 (originally written out as full `### N. [x]` entries) were **condensed into the
same index style** to keep this file small — their full detail (Description / Subtasks /
Acceptance / Implementation report) lives in git history and each task's PR. New archived tasks
are appended (as `## Task <N>` or `### N. [x]` entries) after the index.

---

## Project context

**ReCue** — a **macOS and Windows** desktop app (**Rust + Tauri 2 + React/TypeScript**) for
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
index above covers **#1–#310** (one line per task; full per-task detail — Description, Subtasks,
Acceptance criteria, Implementation report — lives in git history and each task's PR). New
archived tasks are appended below.

> **Never skip a card.** The pipeline implements **every** unblocked card — one whose
> `deps:` are all in `## ARCHIVE` or already archived here — lowest task number first, and never
> skips one for being big, risky, or hard to verify. A card too large for one pass is
> **split into smaller dependent cards** (as #93 → #93 + #94), not deferred.

---

### 311. [x] Custom tab name in the "New tab from template" modal

**Status:** Done
**Depends on:** none

**Description**

The **"New tab from template…"** flow (#118) now lets the user optionally type a **custom name
for the new Canvas tab** on the modal's folder step. The freshly instantiated tab takes that
name; leaving the field blank (or whitespace-only) keeps today's behavior byte-for-byte — the
tab is named after the template. The name applies to the **Canvas tab** itself, not to any
agent/panel inside it (the #136 per-block `new-agent` name is untouched).

**What shipped** (commit [`d316f3e`](https://github.com/ErikdeJager/ReCue/commit/d316f3e), PR
[#63](https://github.com/ErikdeJager/ReCue/pull/63), merged `3788fd8`, 2026-07-02):

- **`src/components/Canvas/templateInstantiate.ts`:** `instantiateTemplate(template, cwd, genId,
  tabName?)` gained an optional trailing `tabName`; the returned `CanvasTab.name` is
  `tabName?.trim() || template.name`, so an omitted/blank/whitespace value preserves the
  template-name fallback exactly.
- **`src/store.ts`:** the `useTemplate` action + its `AppState` interface widened to
  `useTemplate(templateId, cwd, tabName?)`, threading `tabName` into `instantiateTemplate`; the
  sole-empty-vs-append logic (#142), active-tab set, `ipc.setCanvases` persist, toast, and async
  block resolution are unchanged (the toast still references `template.name`).
- **`src/components/TemplateUseModal/TemplateUseModal.tsx`:** a local `tabName` state + an optional
  "Tab name" `<input>` on the folder step (after the folder picker, before the actions row),
  labeled `Tab name (optional)`, placeholder = the chosen template's name (`chosen?.name`, fallback
  `"Custom name…"`), `aria-label="Tab name"`, spreading `noAutoCapitalize`; `open()` now calls
  `runTemplate(templateId, cwd, tabName)`. No explicit reset — the modal unmounts on close.
- **`src/components/TemplateUseModal/TemplateUseModal.module.css`:** a `.nameInput` class styled
  like NewSessionModal's `.search` (full-width, token padding/border/radius, `--bg-base` fill,
  `--text-primary` text, muted placeholder, `--accent` focus border) — design tokens only.
- **Tests:** `templateInstantiate.test.ts` covers trimmed-name-wins and blank/omitted → template
  name; `store.test.ts` covers `useTemplate` naming the tab from a provided name and falling back
  when blank.

**Key files/areas touched:** `src/components/Canvas/templateInstantiate.ts` (+ `.test.ts`),
`src/store.ts` (+ `store.test.ts`), `src/components/TemplateUseModal/TemplateUseModal.tsx` +
`.module.css` (6 files, +95/−7).

**Dependencies:** none.

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 311): the field lives on **step 2 (folder step)**, not
  the template-list step; **label** `Tab name (optional)` (worded "Tab" to make clear it names the
  Canvas tab, not an agent); **placeholder = the chosen template's name** so the user sees the
  default the tab will take; **blank ⇒ template name** (`tabName.trim() || template.name`, entered
  value trimmed); the name is threaded as an **additive optional trailing parameter**
  (`useTemplate` → `instantiateTemplate`), so every existing call site and test stays green; the
  **toast copy is unchanged** (references the template, not the new tab name); no explicit state
  reset (the modal is conditionally mounted, so `tabName` resets on each open).
- **Cross-platform:** pure frontend — a React state string + one optional pure-function parameter —
  with no OS-specific primitives, IPC, or persistence-shape change, so it renders and behaves
  identically on macOS and Windows. Checks green: `npm run build` / `lint` / `test`.

---

### 313. [x] Revert the glowing clone progress bar to a plain indeterminate loading bar

**Status:** Done
**Depends on:** none

**Description**

The transient "Cloning…" loading bar in the sidebar (shown while a repo clones, #295/#299) had
picked up a glow/shimmer treatment in #307 — a breathing accent halo, a comet-gradient stripe,
and a drop-shadow-lit collapsed-rail icon — which looked bad. This is a faithful **CSS-only
revert of #307** (commit `eaa7575`), restoring the pre-#307 (#299) **plain** indeterminate bar:
a solid accent stripe sliding across a flat token track, no glow. The bar stays indeterminate (a
`git clone` gives no reliable percent) — `role="progressbar"` with no `aria-valuenow`, the
`clone-progress` sweep, and the resolve-to-real-repo behavior are all unchanged.

**What shipped** (commit [`bf5de45`](https://github.com/ErikdeJager/ReCue/commit/bf5de45), PR
[#64](https://github.com/ErikdeJager/ReCue/pull/64), merged `7518840`, 2026-07-02):

- **`src/components/Sidebar/Sidebar.module.css`:**
  - `.phantomTrack` — removed the two `box-shadow` lines (`--accent-dim` fallback + the
    `color-mix(--accent 35%)` breathing glow) and the `animation: clone-glow 1.9s …`, and restored
    `height: 4px` → `3px`, leaving a plain `--bg-hover` track.
  - `.phantomBar` — replaced the comet `linear-gradient` (dim → `--accent-hover` → dim) with a
    single solid `background: var(--accent)`, restored `width: 45%` → `40%`, and re-timed
    `clone-progress 1.15s ease-in-out` → `1.2s var(--ease-out)`.
  - `.railPhantom` (collapsed rail) — removed the two `filter: drop-shadow(...)` glow lines,
    keeping its `clone-pulse` opacity breathe + `opacity: 0.75`.
  - The three affected doc comments were rewritten to drop all glow/comet/`color-mix` language.
- **`src/styles/global.css`:** deleted the entire `@keyframes clone-glow` block (now unreferenced —
  it was used only by `.phantomTrack`) and reverted the `@keyframes clone-progress` doc comment to
  the plain #299 wording; the `clone-progress` and `clone-pulse` keyframe bodies (both predate #307)
  are untouched.

**Key files/areas touched:** `src/components/Sidebar/Sidebar.module.css`, `src/styles/global.css`
(2 files, +22/−69). No TS/Rust/markup change.

**Dependencies:** none.

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 313): the card's "revert task that made this glow" maps
  **unambiguously to #307**, so this is a straight CSS-only revert of `eaa7575` (not a remodel after
  another bar). The bar **stays indeterminate** (no percent). The revert is **faithful and complete**
  — it includes the collapsed-rail `.railPhantom` drop-shadow (the only "beyond the literal bar" item,
  deliberately included since #307 glowed both surfaces) and restores all bundled #307 tweaks (track
  `4px→3px`, bar `45%→40%`, timing `1.15s ease-in-out → 1.2s var(--ease-out)`). The "Cloning…" row
  layout, dim, label, folder marker, and resolve-to-real-repo/session-start behavior are all preserved
  (no `Sidebar.tsx` markup change, no `store.ts` change).
- **Cross-platform:** removing `box-shadow`/`color-mix`/`drop-shadow` only *reduces* WKWebView↔WebView2
  divergence risk — the plain token-background + transform-only bar renders identically on macOS and
  Windows, and the global `body.reduce-motion` killswitch still freezes it to a static solid stripe.
  Checks green: `npm run build` / `lint` / `format:check` / `test`; `grep -rn "clone-glow" src` returns
  nothing.

---

### 312. [x] Add "Add to .gitignore" to the file-tree row context menu

**Status:** Done
**Depends on:** none

**Description**

The **FileTree** right-click context menu (on both file and folder rows) gained an **"Add to
.gitignore"** item, placed between "Copy relative path" and Delete. Clicking it appends that item's
repo-root-relative **anchored** pattern to the repo-root `.gitignore` — `/src/foo.ts` for a file,
`/build/` for a folder — creating `.gitignore` if absent, never duplicating a line already present,
and fixing a missing trailing newline before appending. On success the tree re-lists and re-reads
git status, so a now-ignored (untracked) row dims automatically via the existing #270 ignore
coloring. This saves hand-editing `.gitignore` for the common "stop tracking this" action.

**What shipped** (commit [`c704f40`](https://github.com/ErikdeJager/ReCue/commit/c704f40), PR
[#65](https://github.com/ErikdeJager/ReCue/pull/65), merged `9801fb4`, 2026-07-02):

- **`src-tauri/src/files.rs`:** `add_to_gitignore(repo, rel) -> Result<bool, String>` — the **sixth**
  deliberate, path-validated `files.rs` write. Reuses the shared `confine(repo, rel)` guard (rejects
  `..`/symlink/absolute escapes; the item must exist inside the repo) and **derives dir-ness
  server-side** from the confined path's `is_dir()` (so the command signature is just `(repo, path)`,
  no trusted flag). Normalizes the POSIX `rel` (`\`→`/`, trim slashes), refuses the empty/repo-root
  pattern, builds `/{norm}` (file) or `/{norm}/` (dir), reads the current `.gitignore` (treating
  `NotFound` as empty, surfacing other read errors), returns `Ok(false)` on an exact-line match
  (`line.trim() == pattern`), else appends the pattern on its own line (prepending `\n` when the
  file doesn't end in one) via `fs::write` and returns `Ok(true)`. Unit tests cover: fresh-repo
  file create → `/src/foo.ts`, folder → `/build/`, idempotent second call (`false`, byte-identical),
  trailing-newline insertion, and a traversal path erroring + writing nothing.
- **`src-tauri/src/commands.rs` / `src-tauri/src/lib.rs`:** the `add_to_gitignore(repo, path) ->
  Result<bool, SessionError>` `#[tauri::command]` + its registration in the `generate_handler!` list.
- **`src/ipc.ts`:** `addToGitignore(repo, path) → invoke<boolean>("add_to_gitignore", …)` wrapper.
- **`src/store.ts`:** an `addToGitignore` action mirroring the other tree writes — on error toasts
  `isSessionError(err) ? err.message : "Could not update .gitignore"`; on success bumps
  `fileTreeRefresh[repo]`, calls `refreshFileStatuses(repo)`, and toasts the returned boolean
  ("Added to .gitignore" success vs "Already in .gitignore" info).
- **`src/components/FileTree/FileTree.tsx`:** the non-danger "Add to .gitignore" `menuItem` in **both**
  the folder and file menu branches (between "Copy relative path" and Delete), calling
  `addToGitignore(repoPath, menu.path)` then `closeMenu()`.

**Key files/areas touched:** `src-tauri/src/files.rs` (+ tests), `src-tauri/src/commands.rs`,
`src-tauri/src/lib.rs`, `src/ipc.ts`, `src/store.ts`, `src/components/FileTree/FileTree.tsx`
(6 files, +203/−6).

**Dependencies:** none.

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 312): patterns are **repo-root-anchored** — a **leading
  slash** (matches only that exact path from the root, and guarantees the line never starts with
  `#`/`!`), plus a **trailing slash for folders** (restricts to a directory); **dir-vs-file derived
  server-side**, not from a frontend flag. **Idempotence = exact-line match** (does not detect an
  equivalent-but-differently-written existing entry, e.g. an unanchored `src/foo.ts`). **Glob
  metacharacters are NOT escaped** — the literal path is written as-is (real source paths almost never
  contain them). **Not confirm-gated** (non-destructive, one click writes). **Only the FileTree's
  `repoPath`-root `.gitignore`** is touched (no nested per-directory files), and the item is **always
  shown** for both files and folders regardless of git status (writing into a non-git folder is
  harmless). **Documented caveat:** git does not ignore already-tracked paths, so an already-tracked
  file/folder won't visually dim after adding it — correct git behavior, not a bug.
- **Cross-platform:** `files.rs` uses only `std::fs` (no shell-out) and writes `/`-separated patterns,
  so it behaves identically on macOS and Windows; the menu label ("Add to .gitignore") is OS-neutral.
  Checks green: `cargo test` / `npm run lint:rust` / `npm run build` / `lint` / `test`.

---

### 314. [x] Make macOS mic / folder / system-settings permissions actually stick (embed entitlements + a stable local signature)

**Status:** Done
**Depends on:** none

**Description**

Finishes the macOS permissions fix that #292 set up but that a plain build silently bypasses. On
macOS, an agent needing a permission (mic/voice, protected folders, system settings) was prompted
repeatedly ("6×") and Allow never took effect. **Empirically-confirmed root cause** (planner
inspected the actual built `ReCue.app` on macOS 26.5.1 with `codesign`/`spctl`): a plain
`npm run tauri build` produces a **linker-signed ad-hoc** app — `flags=0x20002(adhoc,linker-signed)`,
**Hardened Runtime OFF**, **zero entitlements** (no `audio-input`), a **malformed** signature
(`Info.plist=not bound`, `Sealed Resources=none`), signing `Identifier=recue-…` (not
`com.recue.app`), and a per-build `cdhash` Designated Requirement. The Tauri macOS bundler only
applies `bundle.macOS.entitlements` + Hardened Runtime **when a signing identity is configured**,
so #292's machinery never runs on the default build. Both symptoms follow: the `audio-input`
entitlement being absent under no-Hardened-Runtime means macOS can't grant even after Allow, and
the per-build `cdhash` DR + malformed signature mean TCC can't record/match a durable grant, so
every fresh access attempt re-prompts. This is a **macOS bundle/script/docs-only** fix — **no
runtime Rust/TS/CSS**; Windows/Linux untouched.

**What shipped** (commit [`74cc892`](https://github.com/ErikdeJager/ReCue/commit/74cc892), PR
[#66](https://github.com/ErikdeJager/ReCue/pull/66), merged `16a9069`, 2026-07-02):

- **`scripts/sign-macos-local.sh`** (hardened, +405/−… rewrite): resolves a **stable** identity by
  default — `$SIGN_IDENTITY` if set, else an auto-detected/created self-signed **"ReCue Local
  Signing"** cert — and **refuses to silently ad-hoc-sign** (ad-hoc is now opt-in via
  `RECUE_ALLOW_ADHOC=1`, never the silent default that reproduced the broken state). Always signs
  with `--options runtime` (Hardened Runtime ON) + `-i com.recue.app` (fixes the wrong Identifier /
  `Info.plist=not bound`), signs **nested code first** (dropping the deprecated `--deep`), and feeds
  `codesign` a **comment-free copy** of the entitlements (AMFI rejects the tracked file's XML
  comments). **Fail-closed verification** exits non-zero unless all hold: `runtime` flag present,
  `Identifier=com.recue.app`, **both** entitlements listed (`audio-input` +
  `cs.disable-library-validation`), `codesign --verify --strict` passes, and the DR is
  **not** a `cdhash`. Prints recovery hints.
- **Non-interactive self-signed identity creation** (opt-in `RECUE_CREATE_IDENTITY=1`, idempotent):
  generates a `codeSigning` cert + key as an **OpenSSL-3 `-legacy` p12** (so macOS can import the
  key) into the login keychain with untrusted-cert detection (`codesign` signs fine untrusted);
  falls back to the ad-hoc-with-warning path on failure rather than aborting a build.
- **`package.json`:** two **macOS-only** convenience scripts — `sign:mac` (thin passthrough) and
  `build:mac` (`npm run tauri build` then `RECUE_CREATE_IDENTITY=1` sign, resolving the
  universal-apple-darwin path with a single-arch fallback via an inline `node -e`). The
  cross-platform `tauri`/`build` scripts are unchanged, so Windows/Linux `tauri build` is untouched.
- **`docs/macos-permissions.md`** (rewritten, +313/−…): the confirmed root cause (plain `tauri build`
  embeds no entitlements + no Hardened Runtime + a `cdhash`-pinned, malformed signature), the working
  recipe (`npm run build:mac` or `tauri build` + the signer), verification commands + what "good"
  looks like, and full recovery (`tccutil reset Microphone com.recue.app`, remove stale
  Privacy & Security rows, move to `/Applications` to defeat **App Translocation**,
  `xattr -dr com.apple.quarantine`), plus the honest local-vs-Apple-account split.

**Key files/areas touched:** `scripts/sign-macos-local.sh`, `package.json`, `docs/macos-permissions.md`
(3 files, +550/−172). No runtime Rust/TS/CSS; no change to `Entitlements.plist`/`Info.plist`/
`tauri.conf.json`/`release.yml`.

**Dependencies:** none.

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 314): **process-attribution is NOT broken** — portable-pty
  spawns the child without disclaiming responsibility, so macOS already attributes the TCC request to
  ReCue; a runtime `responsibility_spawnattrs_setdisclaim` change was **evaluated and rejected** (would
  make it worse). **JIT/unsigned-memory is a non-issue** — `node` execs as its own separately-signed
  binary and WKWebView JIT runs in Apple-signed helpers, so no `cs.allow-jit`/`allow-unsigned-executable-memory`
  entitlement is needed; `Entitlements.plist` stays as-is. **Local vs Apple-account split (recorded
  honestly):** a **local** build is fully fixable **without an Apple account** via a stable self-signed
  cert (entitlement present ⇒ Allow works; cert-based DR ⇒ grants persist across rebuilds); a
  **downloaded release** that "just works" for arbitrary users needs the **Developer-ID + notarization**
  path (Apple account + the dormant `APPLE_*` CI secrets, the only thing that also clears Gatekeeper).
  An optional middle path (sign CI releases with a fixed self-signed cert in a secret) is **documented as
  future work, not wired**. The optional one-clause `CLAUDE.md` note was **not** applied (kept the primary
  doc surface in `docs/macos-permissions.md`).
- **Verification:** CI can't exercise a GUI TCC prompt, so the automated criteria assert **signature
  correctness** (the necessary+sufficient precondition) via `codesign`/`spctl`, with a documented
  real-Mac smoke (prompt once → Allow sticks → survives relaunch + a same-cert rebuild). Regression guards
  (no runtime code disturbed) green: `npm run lint` / `test` / `build` / `lint:rust` / `cargo test`.
- **Cross-platform:** entirely macOS-scoped — the signer and npm conveniences are macOS-only and the
  cross-platform build scripts are unchanged, so Windows/Linux build + runtime behavior is byte-for-byte
  unchanged (no TCC there).

---

### 315. [x] Keep the activity dot blue while a background process is still working (fix blue↔yellow flicker)

**Status:** Done
**Depends on:** none

**Description**

When an agent ran a background process (a background `Bash` task, a subagent, a long tool call),
the activity dot flickered rapidly between **blue** (busy) and **yellow** (idle/"needs input")
~twice a second. Root cause (backend timing, `pty.rs monitor_loop`): busy was `true` only while
output flowed within a **700ms window** (`BUSY_WINDOW_MS`), but a background process repaints
Claude's TUI only intermittently — output arrives in bursts spaced >700ms apart, so each burst
flipped busy→true and each 700ms gap flipped it→false. The fix is **smart flicker suppression**:
once a session's dot starts oscillating (output resumes shortly after it went quiet), that session
enters a **sticky** mode and holds **solid blue** on a longer ~5s window until output is truly
quiet, then settles to yellow once. A clean single finished turn still settles at ~700ms,
unchanged. Agent-agnostic (pure output timing, no TUI parsing) and backend-only.

**What shipped** (commit [`d7752ff`](https://github.com/ErikdeJager/ReCue/commit/d7752ff), PR
[#67](https://github.com/ErikdeJager/ReCue/pull/67), merged `4e7fca3`, 2026-07-02):

- **`src-tauri/src/pty.rs`:**
  - Added `const BACKGROUND_HOLD_MS: u64 = 5_000` — the sticky-hold duration **and** the "re-arm"
    window for flicker detection (a re-activation within this long of a settle counts as flicker).
    `BUSY_WINDOW_MS = 700` is kept for busy-**on** and the normal (non-sticky) settle.
  - A per-session `BusyDecision { emitted, sticky, settled_at }` struct (owned solely by the monitor
    thread), replacing the bare `emitted: HashMap<String, bool>` dedup map.
  - A **pure** `decide_busy(st, now, active_fast, active_hold) -> bool` hysteresis helper: normal
    mode becomes busy on fresh `active_fast` and settles as soon as `active_fast` drops (snappy clean
    turn); an idle→busy edge within `BACKGROUND_HOLD_MS` of the last settle flips the session
    **sticky**; sticky mode stays busy while `active_hold` (bridging burst gaps) and only settles
    after ~5s fully quiet, clearing `sticky` on the settle. (`active_fast` ⊂ `active_hold` since
    700ms ⊂ 5000ms.)
  - `monitor_loop` rewired: the snapshot computes the two guarded signals `active_fast = recent &&
    now - out < BUSY_WINDOW_MS` and `active_hold = recent && now - out < BACKGROUND_HOLD_MS` (same
    `has_work`/echo guards as before), the `retain` cleanup keys on `decisions` (a reused id starts
    fresh), and the emit loop runs each through `decide_busy`, still emitting `SessionEvent::State`
    only on change. The busy→idle **title-worker poke** (#97/#212/#252 branch + file-status refresh)
    now fires **once at the true settle** instead of on every flicker cycle.
  - Four pure unit tests: clean-turn fast settle, background-burst blue hold, first-activation never
    sticky, and fresh-turn-after-long-idle not sticky. Busy-related doc comments updated.
- **`CLAUDE.md`:** a one-clause addition to the busy-indicator note documenting the ~5s sticky-hold
  anti-flicker behavior (#315).

**Key files/areas touched:** `src-tauri/src/pty.rs` (+ tests), `CLAUDE.md` (2 files, +187/−26).

**Dependencies:** none.

**Notes**

- **Decisions** (ask-variant — user-confirmed via clarifying questions, per `ASSUMPTIONS.md`
  §Task 315): **fix approach = "smart flicker suppression"** (chosen over a blanket-longer window
  and over parsing Claude's on-screen background-task indicator) — a normal single turn stays snappy
  (~700ms), only an oscillating dot goes sticky; **hold duration = ~5s** (`BACKGROUND_HOLD_MS`),
  reused as the flicker re-arm window. **Accepted trade-off:** a genuinely-finished background task,
  or a turn with internal >700ms pauses, now takes up to ~5s to show the yellow "needs input" dot.
  **Deliberately out of scope:** a genuine >5s-quiet gap (e.g. a long single tool call with no
  output) still legitimately settles to yellow — that's correct, not the reported flicker (noted in
  a code comment).
- **Cross-platform:** pure Rust output-timing hysteresis with no `#[cfg]`/OS-specific code and no
  frontend/CSS change (the store `setBusy` dedup + `BusyIndicator` already paint whatever the backend
  sends), so it behaves identically on macOS and Windows; the new tests are pure-logic and run on
  both. No IPC-shape/persistence/command change (`SessionEvent::State` unchanged; strictly fewer
  events flow). Checks green: `cargo test` / `npm run lint:rust` / `format:rust` / `npm run build` /
  `test`.

---

### 320. [x] Stop a newly-created agent from scrambling the other agents' terminals (shared WebGL glyph atlas)

**Status:** Done
**Depends on:** none

**Description**

Often, right after creating a new agent, the on-screen output of the **other**, already-running
agents scrambled into garbled/jumbled glyphs (misplaced characters, doubled box-drawing). The
victims healed the instant `claude` re-rendered its TUI (any width change / reflow), then could
re-garble on the next spawn. Reported on **macOS**, tied to "right before the Windows release."

Root cause — a **shared WebGL glyph atlas**. Every pooled xterm terminal is constructed with
**identical** options in `createHost` (same `--mono` family, size, line-height, theme), so
`@xterm/addon-webgl` hands them all **one shared `TextureAtlas`** (it caches one atlas per
identical config). Task **#221** (2026-06-28, "Fix the terminal font rendering 'jiggly' on
Windows") added an async font-load block that calls `webgl.clearTextureAtlas()` on **every**
terminal creation — needed because the atlas could be built with fallback-font metrics before
*JetBrains Mono* finished loading. But clearing the **shared** atlas wipes the glyph cache for
**all** terminals while only the *new* one repaints, so the already-running agents keep pointing
at glyph slots that no longer exist → jumble, until a reflow (SIGWINCH → `claude` full repaint +
atlas re-warm) re-rasterizes every glyph. That is exactly why "a width change fixes it," and why
the *other* agents (not the new one) are the victims.

The fix clears the shared atlas **only once** — the first time the real font has loaded — so a
later spawn never disturbs the running agents.

**What shipped** (commit [`bc9553f`](https://github.com/ErikdeJager/ReCue/commit/bc9553f), PR
[#70](https://github.com/ErikdeJager/ReCue/pull/70), branch `fix/font-jumble`, 2026-07-05):

- **`src/components/Terminal/terminalPool.ts`:**
  - Added a module-level `let fontAtlasRebuilt = false` guard.
  - In `createHost`'s async font-load block, wrapped the `webgl.clearTextureAtlas()` call
    (previously unconditional, run on every terminal creation) in `if (webgl && !fontAtlasRebuilt)
    { fontAtlasRebuilt = true; … }`, so the SHARED atlas is cleared exactly once — by the first
    terminal to see the loaded font. Everything else in the block is unchanged: the per-terminal
    `fontFamily` re-measure swap, `term.refresh(0, rows-1)`, and `safeFit()`.

**Key files/areas touched:** `src/components/Terminal/terminalPool.ts` (1 file, guard + one
conditional).

**Dependencies:** none.

**Notes**

- **Why the guard is the fix (validated against xterm internals):** after boot `fontAtlasRebuilt`
  is already `true`, so a newly-spawned agent **skips** the shared-atlas clear — it never disturbs
  the atlas the running agents are drawing from. The per-terminal `fontFamily` swap (kept
  unchanged) is the *real* per-terminal repair: it fires xterm's options-change
  (`OptionsService.onMultipleOptionChange(['fontFamily',…])` → `RenderService.clear()` →
  `_clearModel(true)`), a full model clear that re-acquires that terminal's glyphs at the correct
  metrics. A `refresh()`-all-siblings loop was **deliberately not** added — `Terminal.refresh()`
  skips unchanged cells in the WebGL `_updateModel`, so it doesn't re-rasterize a sibling's glyphs
  and can even re-trigger the garble; only a model clear (resize or its own `fontFamily` swap)
  repairs a sibling, and with the guard there is nothing to repair.
- **#221's Windows fix preserved:** the *first* terminal still clears + rebuilds the shared atlas
  with the loaded font, and every terminal still runs the `fontFamily` re-measure, so glyphs stay
  crisp (no "jiggly"/malformed `C`) on the first and all subsequent spawns. `applyTerminalSettings`
  (font-size change) is unaffected — a new size is a new atlas config, so xterm derives a fresh
  correct-metric atlas on its own; the one-time guard never needs resetting.
- **Not the dedup change:** the other suspect — the `replayDedupe.ts` / byte-offset dedup
  (`fix/windows-stray-c-on-spawn`) — was ruled out: it is strictly per-session, byte-correct, and
  byte-identical on macOS (the `windowsPty` option is Windows-only), so it cannot scramble *other*
  sessions.
- **Out of scope (follow-up):** with very many terminals, macOS WKWebView can hit its
  concurrent-WebGL-context cap and fire `webglcontextlost` on an older terminal
  (`onContextLoss(() => addon.dispose())` drops it to the DOM renderer) — a distinct, rarer vector,
  not this jumble.
- **Cross-platform:** platform-neutral — no `#[cfg]`/`isWindows` branch, no CSS/backend change; a
  no-op under the DOM renderer (detached windows #105, which has no shared GL atlas). macOS bug
  fixed, Windows unchanged. Windows real-box check (glyphs still crisp, spawns don't scramble
  siblings) to be recorded in `TRAJECTORY_TO_WINDOWS.md` per the Windows-parity convention
  (GUI/WebGL paths can't be unit-tested on CI). Checks green: `npm run build` / `npm run lint` /
  `npm test` (599 tests).

---

### 321. [x] Sign CI release builds so macOS mic/folder permissions actually work + persist (+ one-time re-ask after update)

**Status:** Done
**Depends on:** none

**Description**

Follow-up to #292/#314 that fixes the bug **in the app users actually run**. On macOS, speaking
to a `claude` agent with voice made macOS ask for the microphone ~5× and clicking **Allow** never
worked or stuck; the same repeated-prompt-then-fail hit protected folders (Downloads/Documents/
Desktop). **Root cause:** ReCue spawns `claude` as a child PTY, so macOS TCC attributes the child's
mic/folder request to the *responsible* app (ReCue) — but the **downloaded release was linker-signed
ad-hoc**: Hardened Runtime **OFF**, the `com.apple.security.device.audio-input` entitlement
**absent** (so "Allow" can't grant), and a per-build **`cdhash` Designated Requirement** (so TCC
can't persist a grant). #292 added the entitlements + usage strings and #314 made a *local*
`npm run build:mac` self-sign, but the Tauri **bundler only applies the entitlements + Hardened
Runtime when a signing identity is configured**, and CI had none — so **every CI release stayed
ad-hoc** (the shipped bug), and #314 was never verified on a real Mac. This task brings a stable,
entitled, Hardened-Runtime signature to CI releases with a **free self-signed certificate** (no
Apple account), and guarantees macOS **re-asks** the permission after the fix update.

**What shipped** (commit `ec7396d`, PR #69 — https://github.com/ErikdeJager/ReCue/pull/69, branch
`fix/permissions`, 2026-07-05):

- **`.github/workflows/release.yml`** — the macOS leg now **signs releases** in one of two modes,
  selected purely by which secrets are set: **sign-only** with a stable self-signed cert (4 signing
  secrets, no Apple account) or **Developer-ID + notarize** (all 7). The "Configure Apple signing"
  step (`id: applesign`) **splits signing from notarization**: it exports the 4 signing vars when
  cert+identity are present, and the 3 notarization vars **only when all three are non-empty** —
  fixing the `std::env::var_os` `Some("")` trap where an empty `APPLE_ID`/`APPLE_PASSWORD`/
  `APPLE_TEAM_ID` made the bundler try to notarize with empty creds and **fail the build**. With
  **no** signing secrets it prints "ad-hoc fallback" and `exit 0`s (build still succeeds — signing
  is opt-in). It emits a `signing=enabled|disabled` output that gates a new **`codesign`-assert
  step** (Hardened Runtime + `audio-input` + non-`cdhash` DR; skipped on the ad-hoc fallback,
  `spctl` not asserted since a self-signed build is expectedly Gatekeeper-"rejected").
- **`src-tauri/Entitlements.plist`** — removed the XML comment block; the bundler passes the file
  **verbatim** to `codesign`, whose AMFI parser can reject an XML comment (`AMFIUnserializeXML:
  syntax error`). Rationale moved to `docs/macos-permissions.md`.
- **`scripts/gen-macos-ci-cert.sh`** (new, macOS/`gh`) — one command to generate a fixed self-signed
  `codeSigning` `.p12` (RSA-2048, 10-yr, **`-legacy`** so macOS `security import` keeps the private
  key), back it up to `~/.recue-signing/`, and set the 4 signing secrets via `gh` (prints them if
  `gh` is absent). **Reuses** the backup cert on re-run so the Designated Requirement — and users'
  granted permissions — stay stable across releases (`RECUE_FORCE_NEW_CERT=1` to rotate).
  bash-3.2-safe (macOS ships bash 3.2).
- **`src-tauri/src/store.rs` + `src-tauri/src/lib.rs`** — a persisted one-shot `perm_reprompt_done`
  scalar drives a **one-time, macOS-only** best-effort `tccutil reset Microphone/SpeechRecognition
  com.recue.app` at boot: when a user updates from an old ad-hoc build into the signed one the
  signature (DR) changes so macOS should re-ask, but a stale/denied TCC row can suppress it — the
  reset clears that so the user is **re-asked once** (and now Allow works), then never nagged again.
  `#[cfg(target_os = "macos")]`-gated with no non-macOS code path.
- **Docs** — `docs/macos-permissions.md` (title #321; two live CI modes with secret tables; the
  `var_os` split; comment-free entitlements; the `gen-macos-ci-cert.sh` recipe; a new "Updating from
  an older build" section — in-place update = no Gatekeeper warning + the one-time re-ask; summary
  table row for CI self-signed), `README.md` (stale "ad-hoc"/"dormant" wording fixed), `CLAUDE.md`
  (three #292/#314 scope notes updated to #292/#314/#321).

**Key files/areas touched:** `.github/workflows/release.yml`, `src-tauri/Entitlements.plist`,
`scripts/gen-macos-ci-cert.sh` (new), `src-tauri/src/store.rs`, `src-tauri/src/lib.rs`,
`docs/macos-permissions.md`, `README.md`, `CLAUDE.md` (8 files). **No** version bump / patch notes
(batched release owns the bump); `tauri.conf.json` untouched.

**Dependencies:** none.

**Notes**

- **Decisions** (user-confirmed): sign **releases** with a **free self-signed cert** (not Developer
  ID — no Apple account); the bug is hit on a **downloaded release**; distribution is **just me / a
  few Macs**, so the one-time Gatekeeper warning on a fresh download is acceptable; **guarantee a
  re-ask after this update** (→ the one-time `tccutil reset`); and **maximize automation** — the
  cert was generated and the 4 signing secrets (`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
  `APPLE_SIGNING_IDENTITY`=`ReCue Self Signed`, `KEYCHAIN_PASSWORD`) set on the repo as part of this
  work, so the next release from `main` self-signs. The `responsibility_spawnattrs_setdisclaim`
  disclaim stays **rejected** (we *want* ReCue to remain the responsible process); no App Sandbox;
  no new entitlements.
- **Verification:** the full self-signed chain was proven **on a real Mac** (the check #314
  skipped): the `-legacy` p12 imports with its private key and `codesign --options runtime
  --entitlements <comment-free plist> -i com.recue.app` yields `Identifier=com.recue.app`,
  `flags=0x10000(runtime)`, the `audio-input` entitlement, and a **cert-based DR** (`identifier
  "com.recue.app" and certificate leaf = H"…"`, not `cdhash`). `cargo fmt`/`clippy`/`cargo test`
  (154) / `eslint` / `vitest` (599) / `vite build` / `prettier` all green. The GUI mic-prompt
  Allow-and-confirm is the one **manual** step (can't script a TCC dialog / speech), to be done on
  the next signed release; the CI `codesign`-assert step guards the signature shape automatically.
- **Cross-platform:** entirely macOS-scoped — the signer/helper and the `tccutil` re-ask are
  `#[cfg(target_os = "macos")]`/macOS-tool-only, and the `release.yml` Windows leg never sees the
  Apple env, so Windows/Linux build + runtime behavior is byte-for-byte unchanged (no TCC there).
- **Operational:** the fix only takes effect once a release is built **with** the signing secrets
  (now set) and **published** (a maintainer publishes the draft; the updater endpoint only resolves
  a published "latest"). Existing installs get it via the in-app updater — an in-place swap, so **no
  Gatekeeper warning on update** — then one permission prompt (from the DR change + the one-time
  reset), Allow, and it persists. Keep `~/.recue-signing/ReCue-CI.p12` and reuse it every release,
  or grants re-prompt after each update.

---

### 317. [x] Truncate the "New session" button label with an ellipsis on overflow

**Status:** Done
**Depends on:** none

**Description**

The sidebar's primary **"New session"** button (⌘N / Ctrl+N) did not truncate its label when the
sidebar was dragged narrow (toward its 180px minimum, #108) — the "New session" text was a bare
text node (an anonymous flex item CSS can't target) and `.newButton` lacked `min-width: 0`, so the
label wrapped to a second line / overflowed and pushed the `+` icon or keyboard hint out of the
button. The secondary **"Schedule session"** button directly below it already truncated correctly
(its label lives in a `<span className={styles.scheduleLabel}>` with `overflow:hidden;
text-overflow:ellipsis; white-space:nowrap`, and the button carries `flex:1; min-width:0`, added by
#301). The fix mirrors that exact pattern onto the New session button so both behave identically.

**What shipped** (commit [`9435370`](https://github.com/ErikdeJager/ReCue/commit/9435370), PR
[#71](https://github.com/ErikdeJager/ReCue/pull/71), branch `truncate-new-session-label`,
2026-07-05):

- **`src/components/Sidebar/Sidebar.tsx`** (expanded "New session" button, ~line 2695): added
  `className={styles.newIcon}` to the `<Plus size={16} strokeWidth={1.5} />` icon and replaced the
  bare `New session` text node with `<span className={styles.newLabel}>New session</span>`. The
  `<kbd>` keyboard hint is untouched.
- **`src/components/Sidebar/Sidebar.module.css`:** added `min-width: 0` to the existing `.newButton`
  rule (so the flex button's content can shrink below its intrinsic width — required for the child
  ellipsis to engage), and two new rules right after `.newButton:hover`: `.newIcon { flex-shrink: 0 }`
  (so the `+` icon keeps its intrinsic 16px) and `.newLabel { flex: 1; min-width: 0; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; text-align: left }` (the ellipsis rule, mirroring
  `.scheduleLabel`).

**Key files/areas touched:** `src/components/Sidebar/Sidebar.tsx` (one-line JSX wrap + icon class),
`src/components/Sidebar/Sidebar.module.css` (`min-width:0` on `.newButton` + new `.newIcon` /
`.newLabel` rules). 2 files.

**Dependencies:** none.

**Notes**

- **Why new, uniquely-named classes (`.newIcon`, `.newLabel`) rather than reusing
  `.scheduleIcon`/`.scheduleLabel`:** the module has a pre-existing duplicate `.scheduleIcon` rule
  whose second definition (~line 679) also sets `color: var(--status-running)`; reusing it on the `+`
  icon would leak that status color, so parallel classes copy only the truncation behavior.
- **No native `title` tooltip added:** the reference Schedule button has none, and the card asked for
  the "same behaviour," so the fix omits a hover tooltip to keep the two buttons identical (trivial to
  add later).
- **Scope:** limited to the **expanded** top-of-sidebar primary button. The collapsed rail's
  icon-only button (no label), the other New-session entry points (repo header `+`, worktree `+`,
  repo context menu), and the Schedule button / `⋯` overflow (#294) are untouched. No change to
  `openNewSession()`.
- **Cross-platform:** pure presentational CSS (`text-overflow:ellipsis`, `min-width:0`,
  `flex-shrink`) with no `-webkit-`-only effects, so it renders identically in WKWebView (macOS) and
  WebView2/Chromium (Windows) — and the truncation matters on Windows too (the "Ctrl+N" hint is
  longer). Checks green: `npm run build` / `npm run lint` / `npm run format:check`. No unit test
  applies (presentational CSS; the Sidebar has no test file).

---

### 318. [x] Keyboard shortcuts reference section in Settings

**Status:** Done
**Depends on:** none

**Description**

Added an eighth, **read-only "Shortcuts"** section to the Settings modal
(`src/components/Settings/Settings.tsx`, #100/#119 — a fixed 720×600 dialog with a left nav + right
content pane) that lists all of the app's keyboard shortcuts, grouped and labelled, so a user can
discover the keybinds without digging through code or docs. Purely a reference display — no
rebinding, no persistence, no change to any keyboard *handler* (`useKeyboardNav.ts` and all
component handlers untouched).

**What shipped** (commit [`756ed9f`](https://github.com/ErikdeJager/ReCue/commit/756ed9f), PR
[#72](https://github.com/ErikdeJager/ReCue/pull/72), branch `shortcuts-reference-settings`,
2026-07-05):

- **`src/components/Settings/shortcuts.ts`** (new, 104 lines): a typed, static `SHORTCUT_GROUPS`
  list (`Shortcut { mac, win, description }` / `ShortcutGroup { title, shortcuts }`) with four
  groups — **Sessions**, **Panels & Canvas**, **Navigation**, **Files & Diff** — populated only
  from the code-verified inventory (global shortcuts from `useKeyboardNav.ts` plus the
  widely-relevant contextual ones that already carry user-facing hints: `⌘S` save; DiffInspector
  `←/→`, `↑/↓`, `S`). Each entry stores explicit `mac`/`win` strings; platform-identical chords use
  the same string for both.
- **`src/components/Settings/Settings.tsx`:** added `"shortcuts"` to the `Section` union, a
  `SECTIONS` entry (Lucide `Keyboard` icon, label "Shortcuts") placed just before "Data & About",
  and a `{section === "shortcuts" && …}` render block mapping `SHORTCUT_GROUPS` → titled groups of
  `<kbd>` chip + description rows, each chip rendered cross-platform via the already-imported
  `kbdHint(platform, s.mac, s.win)`.
- **`src/components/Settings/Settings.module.css`:** new `.shortcutsSection` / `.shortcutGroup` /
  `.shortcutList` / `.shortcutRow` / `.shortcutKey` / `.shortcutDesc` styles — the `<kbd>` chip
  modeled on `CanvasCloseModal.module.css`'s `.kbd` (bordered mono chip), using only existing
  design tokens.
- **`src/components/Settings/shortcuts.test.ts`** (new): a Vitest data-shape check — `SHORTCUT_GROUPS`
  non-empty, every group has ≥1 shortcut, every shortcut has non-empty `mac`/`win`/`description`.

**Key files/areas touched:** `src/components/Settings/shortcuts.ts` (new), `Settings.tsx`,
`Settings.module.css`, `shortcuts.test.ts` (new). 4 files.

**Dependencies:** none (Settings modal #100, fixed size #119, `kbdHint`/`platform` #143, and the
shortcuts themselves were already shipped).

**Notes**

- **Read-only by design:** the pane contains no inputs/checkboxes/sliders/buttons that mutate
  `draft` or call `saveSettings` — opening it and clicking around leaves settings unchanged.
- **Deliberately excluded transient in-dialog accelerators** (CanvasCloseModal K/↵/Esc,
  CreatePanelModal 1–6/Esc, NewSessionModal `⌘⏎`/in-modal `⌘1–9` recents, generic Esc/Enter) —
  they're surfaced inline in their own dialogs and would bloat/duplicate a global reference. No
  shortcuts were invented; every row mirrors a real handler.
- **The list is a static mirror** of `useKeyboardNav.ts` (not derived from the handlers), so the
  one maintenance risk is drift if shortcuts change later — accepted as the read-only-reference
  design.
- **Cross-platform:** each chip renders `⌘…` on macOS and `Ctrl+…` on Windows via `kbdHint` (whose
  behavior is already unit-tested by `platform.test.ts`); pure tokens/CSS, identical on
  WKWebView/WebView2. Checks green: `npm run build` / `npm run lint` / `npm test` / `npm run
  format:check`.

---

### 319. [x] Confirm before clearing recent folders in Settings

**Status:** Done
**Depends on:** none

**Description**

The Settings → **Data & About** → "Clear recents (N)" button cleared the recent-folders list
immediately, so a single misclick silently discarded all remembered folders (no in-app undo). Gated
it behind the app's established **inline two-click confirm**, honoring the existing
`confirmDestructive` setting (#103) exactly like every sibling destructive action (TemplateManager
delete, FileTree delete, Kanban column delete, Sidebar "Forget folder" / "Kill all agents").

**What shipped** (commit [`d0ba229`](https://github.com/ErikdeJager/ReCue/commit/d0ba229), PR
[#73](https://github.com/ErikdeJager/ReCue/pull/73), branch `confirm-clear-recents`, 2026-07-05):

- **`src/components/Settings/Settings.tsx`:** read `confirmDestructive` from the store; added a
  local `confirmingClear` `useState`; gated the `clearRecents` handler so that when
  `confirmDestructive` is on and not yet armed it `setConfirmingClear(true); return;` (arms without
  clearing), and otherwise runs the existing three lines (`ipc.clearRecents()`, `setRecents([])`,
  `pushToast("Recent folders cleared")`) and resets the flag. The button relabels to "Clear all
  recent folders?" while armed (`Trash2` icon kept), gains a `.dataButtonArmed` danger class, a
  "Click again to clear all recent folders" `title`, and an `onMouseLeave` that cancels the arm.
  The `disabled={recentsCount === 0}` prop is unchanged.
- **`src/components/Settings/Settings.module.css`:** added a `.dataButtonArmed` rule mirroring
  TemplateManager's `.dangerArmed` (red `--status-error` fill + `--accent-fg` text), scoped so its
  `:hover` keeps the danger fill.

**Key files/areas touched:** `src/components/Settings/Settings.tsx`, `Settings.module.css`. 2 files.

**Dependencies:** none (Settings modal #100 and confirm-destructive gating #103 already shipped).

**Notes**

- **Honors the global toggle, not always-on:** with `confirmDestructive` **off**, the first click
  clears immediately (current behavior preserved) — matching every sibling action rather than
  diverging with an always-on confirm.
- **No backend/IPC/store changes:** the Rust `clear_recents` command, the `setRecents`/`recents`
  slice, and the IPC layer are untouched; the whole guard is a local state flag + one CSS class.
- **No armed-state leak:** the Settings modal remounts fresh each open (`Settings()` gates
  `<SettingsModal/>` on the open flag), and the `onMouseLeave` cancels on pointer-out, so no
  reset-on-section-change logic was needed.
- **Cross-platform:** pure React state + CSS tokens (no native dialog / `window.confirm` / path /
  shell), identical on macOS (WKWebView) and Windows (WebView2). Checks green: `npm run build` /
  `npm run lint` / `npm run format:check` (the Settings modal is presentational — no unit test).

---

### 322. [x] Remove the redundant header "+" add-card button from Kanban columns

**Status:** Done
**Depends on:** none

**Description**

Each Kanban column header carried a small "+" button that opened the add-card composer — the exact
same action as the "+ Add card" button inside the column body. Two controls doing the identical
thing is redundant clutter, so the header "+" was removed; the in-column "+ Add card" button (the
primary, discoverable one) stays. Both had called the same `openComposer` handler, so removing the
header one orphaned nothing.

**What shipped** (commit [`27230b9`](https://github.com/ErikdeJager/ReCue/commit/27230b9), PR
[#74](https://github.com/ErikdeJager/ReCue/pull/74), branch `remove-kanban-header-add-button`,
2026-07-05):

- **`src/components/Kanban/KanbanPanel.tsx`:** deleted the header `styles.colAdd` `<button>`
  (a bare `<Plus size={14}/>`, `aria-label="Add card"`) from `BoardColumn`'s `<header>`, and
  updated the stale `BoardColumn` JSDoc that described the header as containing a "+". Kept
  `openComposer` (still invoked by the in-column "+ Add card" button) and the Lucide `Plus` import
  (still used by "+ Add card" and "Add column").
- **`src/components/Kanban/KanbanPanel.module.css`:** removed the now-dead `.colAdd` / `.colAdd:hover`
  rules (and their `#233` comment), and updated the `.composer` comment to say the composer is
  opened only by the bottom "+ Add card" affordance.

**Key files/areas touched:** `src/components/Kanban/KanbanPanel.tsx`, `KanbanPanel.module.css`.
2 files.

**Dependencies:** none (the Kanban board #141–#151 already landed; this is a self-contained UI tweak).

**Notes**

- **Nothing orphaned:** verified via grep that no keyboard shortcut or test referenced
  `colAdd`/the header add button, and that `openComposer` + the `Plus` import remain in use — the
  build/lint would fail loudly otherwise.
- **In-column add-card unchanged:** the composer, `openComposer`/`submitComposer`/`addComposedCard`,
  the Raw view, drag-and-drop, and the markdown parse/serialize engine are all untouched.
- **Cross-platform:** pure React/CSS with on-system design tokens — no OS-specific paths,
  shell-outs, or key handling, so identical on macOS and Windows. No Rust. Checks green:
  `npm run build` / `npm run lint` / `npm test` / `npm run format:check`.

---

### 316. [x] Fix the 5-hour usage bar reading a stale/expired OAuth token (Keychain fall-through)

**Status:** Done
**Depends on:** none

**Description**

The sidebar-footer **5-hour Claude usage bar** (#154) stopped showing any data after a recent
Claude Code update. Root cause (established empirically on a real machine, claude 2.1.193 — **not**
an endpoint/schema change): recent Claude Code keeps the canonical, refreshed OAuth token in the
**macOS Keychain** but leaves a **stale `~/.claude/.credentials.json`** on disk. ReCue's
`read_oauth_token()` read the **file first** (`read_token_from_file().or_else(read_token_from_keychain)`)
and — because the file existed and yielded a token — never fell through to the fresh Keychain one,
so the usage GET 401'd and the bar hid. Verified directly: the expired file token → HTTP 401, the
fresh Keychain token → HTTP 200 with exactly the shape `parse_snapshot` already handles
(`five_hour.utilization`, `five_hour.resets_at`). The endpoint URL, `oauth-2025-04-20` beta header,
and response fields are all unchanged. Fix: make token *selection* expiry-aware (prefer a
non-expired token, file → Keychain).

**What shipped** (commit [`9c41e1b`](https://github.com/ErikdeJager/ReCue/commit/9c41e1b), PR
[#75](https://github.com/ErikdeJager/ReCue/pull/75), branch `fix-usage-bar-stale-token`,
2026-07-05) — backend-only, all in **`src-tauri/src/usage.rs`**:

- Introduced a private `OauthToken { access_token, expires_at: Option<i64> }` (epoch **ms**) with
  `is_expired(now_ms)` whose `map_or(false, …)` makes **unknown expiry ⇒ usable** (schema-drift
  guard).
- Extended `token_from_json` → `Option<OauthToken>`: extracts the access token exactly as before
  (`claudeAiOauth.accessToken` else top-level `access_token`) and additionally reads `expiresAt`
  (else top-level `expires_at`) tolerantly — a JSON number **or** numeric string; missing/garbage ⇒
  `None`.
- `read_token_from_file` / (macOS-gated) `read_token_from_keychain` now return `OauthToken`; the
  non-macOS keychain stub still returns `None`.
- Rewrote `read_oauth_token` around a **pure, unit-tested** `select_token(file, keychain, now_ms)`:
  use the **file** token if present and not expired (the common Windows/Linux + fresh-macOS path —
  Keychain **not** read, so no gratuitous permission prompt); otherwise the **Keychain** token if
  fresh (the confirmed-broken macOS case); otherwise fall back to whichever is present (file
  preferred), preserving today's fail-open-at-HTTP behavior.
- Hardening: bumped the stale `CLAUDE_CODE_UA` (`claude-code/2.1.0` → current) and added
  **token-free** fail-open diagnostics categorizing the miss. Added unit tests for expiry-aware
  selection and the extended parse.

**Key files/areas touched:** `src-tauri/src/usage.rs` (1 file — token type, expiry-aware selection,
UA bump, diagnostics, tests). No frontend change (the `UsageSnapshot` shape is unchanged; the bar
only hid because the backend returned `None`).

**Dependencies:** none.

**Notes**

- **No gratuitous Keychain prompt:** when the file token is still fresh the Keychain is never read
  (short-circuit), so Windows/Linux behavior is byte-for-byte unchanged and macOS doesn't prompt in
  the common case.
- **Deliberately not done:** OAuth token *refresh* (would race Claude and needs the client-id/token
  endpoint — Claude already keeps a fresh Keychain token), a local usage-file reader (verified none
  exists under `~/.claude`; the OAuth API is the sole source), and any endpoint/beta-header/
  `parse_snapshot` change (a live 200 confirmed they're still correct). If **all** sources are
  expired/absent, the command returns `None` (bar hides) — same fail-open as today, no panic.
- **Cross-platform:** the Keychain path stays `#[cfg(target_os = "macos")]`-gated; Windows/Linux
  (no Keychain, canonical fresh file token) take the file token unchanged. `home_dir()` untouched.
  Checks green: `cargo test` (new token-selection + parse tests) / `npm run lint:rust` /
  `npm run format:rust` / `npm run build` / `npm test`. The real-machine Keychain smoke (expired
  file + fresh Keychain → bar populates; no prompt when file is fresh) is the one manual step CI
  can't exercise.

---

### 323. [x] Remove the post-drag focus border on Kanban cards

**Status:** Done
**Depends on:** none

**Description**

After dragging a card in the in-app Kanban board, the just-dropped card wore a persistent
accent-colored focus border/outline until the user clicked elsewhere. Two things combined:
**dnd-kit** makes the card `<article>` focusable (`role="button"` / `tabIndex=0` via its spread
`attributes`) and **restores focus to it after a drag** (`RestoreFocus`, default on), and two CSS
rules then painted that focused article — `.card:focus-within { border-color: var(--accent) }`
(`:focus-within` also matches when the article *itself* holds focus) plus the app-wide
`:focus-visible { outline: 2px solid var(--accent) }` in `global.css`. The fix suppresses that
indicator on the card article itself while keeping the hover lift, the **edit-mode** accent border
(driven by the same `:focus-within` when the edit `<textarea>` descendant is focused), and the
inner pencil/trash/checkbox focus rings.

**What shipped** (commit [`df6812c`](https://github.com/ErikdeJager/ReCue/commit/df6812c), PR
[#76](https://github.com/ErikdeJager/ReCue/pull/76), branch `remove-kanban-card-focus-border`,
2026-07-05) — CSS-only:

- **`src/components/Kanban/KanbanPanel.module.css`:** added a `.card:focus { border-color:
  var(--border-hairline); outline: none; }` rule **immediately after** the existing
  `.card:focus-within` rule (source order matters). Same specificity `(0,2,0)` as `:focus-within`,
  so the later rule wins for the article-focused (post-drag/tab) case and reverts to the resting
  hairline border; `outline: none` beats the global `:focus-visible` `(0,1,0)` ring. During **edit
  mode** the article is not `:focus` (only `:focus-within`), so the accent border is preserved; the
  hover rule `(0,4,0)` still wins when hovered.
- **`TRAJECTORY_TO_WINDOWS.md`:** recorded the Windows real-box verification note (WebView2 drag
  → no border), per the Windows-parity convention for GUI paths CI can't exercise.

**Key files/areas touched:** `src/components/Kanban/KanbanPanel.module.css` (one additive rule),
`TRAJECTORY_TO_WINDOWS.md` (verification note). No `.tsx` / Rust change.

**Dependencies:** none.

**Notes**

- **dnd-kit focus restoration left on:** deliberately did **not** set
  `accessibility={{ restoreFocus: false }}` — that would harm keyboard drag continuity and wouldn't
  cover a card focused by plain Tab. The CSS approach hides the indicator without changing focus
  behavior.
- **Accessibility trade-off (recorded):** suppressing the card article's own ring also removes the
  visible ring when a keyboard user Tabs to a card — an intentional consequence of the "should not
  appear at all" requirement; inner controls, editing, hover, and focus *restoration* are untouched.
  A narrower mouse-only fallback (`.card:focus:not(:focus-visible)`) is noted for later if keyboard
  discoverability is reprioritized.
- **Cross-platform:** plain `outline: none` + a `border-color` revert (no `-webkit-`/macOS-only
  assumption), scoped to a CSS-Module hashed class so it can't leak — identical on WKWebView (macOS)
  and WebView2/Chromium (Windows). Checks green: `npm run build` / `npm run lint` /
  `npm run format:check` / `npm test` (Kanban tests are logic-only; the drop-border check is manual).

---

### 326. [x] Setting to disable session-usage display (and auth-token access)

**Status:** Done
**Depends on:** none

**Description**

Added a user-facing **"Show session usage"** toggle in Settings → Sessions (default **ON** —
today's behavior) that, when turned off, completely hides the five-hour Claude usage bar (#154)
**and** completely prevents ReCue from ever reading the Claude OAuth auth token — a privacy option
for users who don't want the app touching their credentials. The gate lives at the sole frontend
caller of the usage IPC: `claude_session_usage` (`usage.rs`, `lib.rs:302`) is the **only** code path
that reads the token (grep-verified), and it is invoked only via `ipc.claudeSessionUsage()` inside
the store's `refreshUsage`, so guarding that caller fully satisfies "never accesses the token" — no
Rust change needed.

**What shipped** (commit [`e112f6a`](https://github.com/ErikdeJager/ReCue/commit/e112f6a), PR
[#77](https://github.com/ErikdeJager/ReCue/pull/77), branch `disable-session-usage-display`,
2026-07-05):

- **`src/types/index.ts`:** added `showSessionUsage: boolean` to the `Settings` interface (Sessions
  block).
- **`src/store.ts`:** `DEFAULT_SETTINGS.showSessionUsage: true`; `refreshUsage` early-returns
  (before the `isClaudeActive` check) when the setting is off — clearing the `usage` slice to
  unavailable (guarded to avoid a redundant re-render) and still running `applyAutoContinue()` so
  the #296 machine disarms; `startUsagePolling` returns early when off (no poll, no token access at
  boot — `settings` are loaded before it runs); `saveSettings` reacts to a runtime toggle by
  starting the poll on enable, or stopping it + clearing `usage` + disarming auto-continue on
  disable.
- **`src/components/Usage/UsageBar.tsx`:** folds `showSessionUsage` into `showUsage`, so with the
  setting off (or during the brief window before the store clears `usage`) the bar renders as the
  ordinary plain hairline separator — not `null` — preserving footer structure while removing all
  usage data.
- **`src/components/Settings/Settings.tsx`:** the new "Show session usage" checkbox + help copy
  ("When off, ReCue never reads your Claude auth token."), placed before the auto-continue rows; and
  those rows tightened so the "Auto continue after limit reset" checkbox is `disabled` (with a
  "Requires session usage to be enabled." note) when usage is off — a user can't arm a feature that
  can't fire.
- **`src/store.usage.test.ts`** (new): asserts `refreshUsage` leaves `claudeSessionUsage` uncalled
  (and `usage.available === false`) when `showSessionUsage` is off, and calls it once when on with a
  Claude session active.

**Key files/areas touched:** `src/types/index.ts`, `src/store.ts`, `src/components/Usage/UsageBar.tsx`,
`src/components/Settings/Settings.tsx`, `src/store.usage.test.ts` (new). 5 files, frontend-only.

**Dependencies:** none (usage bar #154, auto-continue #296/#309, Settings blob #100/#102 all landed).

**Notes**

- **No Rust changes:** guarding the single frontend choke point is sufficient and cleanest; `usage.rs`
  / `claude_session_usage` are untouched.
- **Auto-continue gated for free:** with usage off, `usage.available` is false, so the #296 reducer
  disarms and the #309 `AutoContinuePrompt` already returns `null` (`isLimitReached` false) — no
  component-internal change; only the Settings checkbox enablement is additionally tightened.
- **Older blobs default ON:** `mergeSettings` fills the missing key with `true`, so existing installs
  see no behavior change.
- **Independent of sibling #325** (custom-agent, which hides the bar via `isClaudeActive`): both
  lightly touch `UsageBar`'s render guard — additive, resolved by the merge lane.
- **Cross-platform:** no OS-specific code added; the only OS-sensitive path (`usage.rs` token read,
  `home_dir()`/Keychain) is simply not invoked when off — inherently identical on macOS and Windows.
  Checks green: `npm run build` / `npm run lint` / `npm test`.

---

### 325. [x] Custom coding-agent command in Settings

**Status:** Done
**Depends on:** none

**Description**

Added a fourth **"Custom"** coding agent to ReCue's pluggable agent system (#101/#141/#142): a user
picks Custom in Settings → Sessions and types their own launch command (a program + args, e.g.
`my-agent --foo`) that ReCue runs to start each new session — so any CLI-based agent works, not only
the three built-ins. A custom agent is treated like the other non-Claude agents: no
resume/fork/auto-name, marked "untested", and the five-hour usage meter is hidden while a custom
session is live.

**What shipped** (commit [`f9113bb`](https://github.com/ErikdeJager/ReCue/commit/f9113bb), PR
[#78](https://github.com/ErikdeJager/ReCue/pull/78), branch `custom-coding-agent-command`,
2026-07-05):

- **`src-tauri/src/agents.rs`:** a `CUSTOM` `AgentSpec` (`id="custom"`, all caps false, placeholder
  `binary_name="custom"`) + `"custom" => CUSTOM` in `agent_spec`; two pure, unit-tested helpers —
  `parse_custom_command(command) -> Option<(program, args)>` (a minimal argv tokenizer: split on
  whitespace, honoring `"double"`/`'single'` quotes, `None` on empty) and `read_custom_command(
  settings) -> Option<String>` (reads the opaque `customAgentCommand` key, trimmed/non-empty).
- **`src-tauri/src/pty.rs`:** threaded a `custom_command: Option<&str>` param through
  `spawn_session` / `spawn_session_with_prompt`; for `agent == "custom"` it parses the command and,
  for a seeded launch, appends the prompt as a trailing positional arg (best-effort), then spawns
  via the existing cross-platform `spawn_with_id` (`uses_claude_log=false`). Non-custom paths
  unchanged.
- **`src-tauri/src/commands.rs`:** each spawn site (`spawn_session`, `spawn_worktree_agent`,
  `spawn_worktree_agent_new_branch`, `fire_due_schedules`, `fire_one_recurring`) resolves the custom
  command from `store.settings()` and passes it through; `agent_info` gained `store` and, for
  custom, probes the **configured program**'s `--version` (so `ClaudeMissing` names the user's
  program) with a `"custom"` fallback.
- **Frontend:** `src/agents.ts` — `CUSTOM_CAPS` in `CATALOG` + a new `SETTINGS_AGENTS` list
  (`SELECTABLE_AGENTS` stays `[claude, codex, opencode]` so onboarding never offers the
  undetectable custom); `src/types/index.ts` + `src/store.ts` — `customAgentCommand: string`
  (default `""`, back-filled by `mergeSettings`); `src/components/Settings/Settings.tsx`
  (+`.module.css`) — the Coding-agent control maps over `SETTINGS_AGENTS` (Custom is a 4th segment)
  and, when Custom is selected, shows a command `<input>` with placeholder + help; the existing
  "untested" caution and the auto-continue disable (`defaultAgent !== "claude"`) apply for free.
- **Tests:** `src/agents.test.ts` (`agentCaps("custom")` caps false, `agentIsUntested` true) and
  `src/store.test.ts` (a `agent: "custom"` session makes `isClaudeActive` false → usage bar hidden),
  plus the Rust tokenizer/spec unit tests.

**Key files/areas touched:** `agents.rs`, `commands.rs`, `pty.rs` (Rust) + `agents.ts`,
`agents.test.ts`, `types/index.ts`, `store.ts`, `store.test.ts`, `Settings.tsx`, `Settings.module.css`.
10 files.

**Dependencies:** none (AgentSpec #101, codex gating #141, selector #142, usage bar/`isClaudeActive`
#154, Settings blob #100/#102 all landed).

**Notes**

- **Argv, not a shell line:** the custom command is a program + args (quotes group tokens); no
  pipes/redirection/`&&`/`$VAR`/globbing — a user needing that wraps it themselves (`bash -lc "…"` /
  `cmd /C "…"`). Documented in code + Settings help.
- **Seeding is best-effort:** appending the prompt as a trailing positional works for CLIs that
  accept a positional prompt (Claude/Codex-like) but not arbitrary tools; the interactive
  (non-seeded) launch always works.
- **Capabilities gated off** exactly like Codex/OpenCode (owns its own session identity): boot
  resume skips a custom record (`supports_resume=false`), Restart returns `ResumeUnsupported`, Fork
  is unavailable, and the label falls back to the branch (no `ai-title` glob). `isClaudeActive`
  needed **no logic change** — it already treats any non-`"claude"` id (incl. `"custom"`) as
  non-Claude; a regression test was added instead. Task #326's separate manual "disable usage"
  setting was left independent.
- **Clear failure modes:** an empty command fails with a toast (no phantom `"custom"` spawn); a
  program not on PATH surfaces the `ClaudeMissing` banner naming the parsed program.
- **Cross-platform:** the parsed program resolves through the shared `find_on_path`/`launch_target`
  seam (PATHEXT + `cmd.exe /C` for `.cmd`/`.bat`), and the `--version` probe stays behind
  `hidden_command` (no console flash) — a Windows custom command works exactly like a built-in
  agent; no hardcoded POSIX invocation. Claude spawn/resume/fork args are byte-for-byte unchanged
  (guarded by the `agent == "custom"` branch). Checks green: `npm run build` / `npm run lint` /
  `npm test` / `npm run format:check` / `cargo test` / `npm run lint:rust` / `npm run format:rust`.

---

### 327. [x] Open the repo's GitHub page from the sidebar folder menu

**Status:** Done
**Depends on:** none

**Description**

Added a **"View on GitHub"** item to the left-panel sidebar's repo/folder context menus that opens
the folder's GitHub repository page in the default browser — shown **only** when the folder is a git
repo whose remote points at GitHub, hidden otherwise. The menu still opens **instantly**: the
decision (and the URL) is resolved ahead of time on a fixed refresh cadence and cached in the store,
never computed synchronously on right-click.

**What shipped** (commit [`b7de41e`](https://github.com/ErikdeJager/ReCue/commit/b7de41e), PR
[#79](https://github.com/ErikdeJager/ReCue/pull/79), branch `view-on-github-menu`, 2026-07-05):

- **`src-tauri/src/git.rs`:** a pure, unit-tested `github_web_url(remote)` normalizer (HTTPS/`http`/
  SCP-SSH `git@github.com:owner/repo.git`/`ssh://`/`git://` → `https://github.com/<owner>/<repo>`,
  stripping `.git`/trailing slash/userinfo/port, `http`→`https`, host must be exactly `github.com`
  case-insensitive, `None` for GitLab/Bitbucket/GHE/single-segment/garbage), plus
  `github_web_url_for(cwd)` (prefers `origin`, else the first `git remote`; `run_git` →
  `hidden_command`, local no-network) and the batched `github_web_urls(paths)` (mirrors
  `current_branches`, only GitHub-resolving paths present).
- **`src-tauri/src/commands.rs` + `lib.rs`:** a new async `github_web_urls` command
  (`spawn_blocking`, keeps the webview thread free), registered in `invoke_handler!`.
- **`src/ipc.ts`:** a `githubWebUrls(paths)` wrapper.
- **`src/store.ts`:** a `githubUrls: Record<string,string>` map + init, a `refreshGithubUrls` action
  (full-replace with a `urlMapsEqual` shallow-equality guard so an idle settle that didn't touch
  remotes doesn't re-render), wired into the **same cadence** as `branches`/`fileStatuses` — load +
  repo-set change and the debounced busy→idle edge (#212/#252) — so an in-terminal `git remote
  add`/`set-url` is picked up.
- **`src/components/Sidebar/Sidebar.tsx`:** reads the cached `githubUrls`; the "View on GitHub" item
  (text-only, no icon, placed right after **Pull** in the non-destructive utility group) is rendered
  in all three repo menus — the **repo header menu**, the **`RepoBranchLine`** menu, and the
  **`WorktreeHeader`** menu (a worktree uses its **parent** repo's cached URL) — each opening the URL
  via the already-imported cross-platform http/https-only `openUrl` (#217).

**Key files/areas touched:** `src-tauri/src/git.rs` (normalizer + git read + tests), `commands.rs`,
`lib.rs`, `src/ipc.ts`, `src/store.ts`, `src/components/Sidebar/Sidebar.tsx`. 6 files.

**Dependencies:** none.

**Notes**

- **Menu opens instantly (the performance constraint):** the item's visibility and URL come only
  from the cached `githubUrls` map — **zero git work at menu-open time**. The only git work is two
  cheap local `git remote` / `git remote get-url` calls per repo, run off the main thread
  (`spawn_blocking`) on the debounced branch/file-status cadence.
- **Assumptions:** prefer `origin` else the first remote (hide if none); host must be exactly
  `github.com` (GitHub Enterprise hidden — not reliably detectable; a follow-up could add a
  configurable host list); always the repo root page (no branch/PR/commit/file deep-link); no
  settings toggle.
- **Cross-platform:** the only OS-sensitive primitives — the `git` shell-out (guarded by
  `hidden_command`, no Windows console flash) and the browser open (`open_url` — macOS `open` /
  Windows `cmd /C start` / `xdg-open`) — are already cross-platform, so behavior is identical on
  macOS and Windows; no POSIX-only assumptions. Fail-open: non-GitHub/remote-less/non-git folders
  resolve to `None` and hide the item. Checks green: `npm run build` / `npm run lint` / `npm test` /
  `cargo test` / `npm run lint:rust`.

---

### 324. [x] Git-diff gutter in the file viewer (uncommitted change markers)

**Status:** Done
**Depends on:** none

**Description**

Gave the universal `FileViewer`'s **curated code view** (the Prism `CodeBlock`) a left **git-diff
gutter** that colors each line by its uncommitted working-tree status vs `HEAD` — a **green** bar
for an added line, a **yellow** bar for a modified line, and a small **red dot** at the boundary
where content was removed — so a developer sees at a glance what they've changed since the last
commit. The markers **auto-refresh on a ~2 s poll** (paused when hidden), so they disappear within
one interval when the change is committed in a terminal (the gutter re-checks whether the diff is
still present).

**What shipped** (commit [`a0b2b67`](https://github.com/ErikdeJager/ReCue/commit/a0b2b67), PR
[#80](https://github.com/ErikdeJager/ReCue/pull/80), branch `git-diff-gutter`, 2026-07-05):

- **`src-tauri/src/git.rs`:** a scoped `file_diff(cwd, path) -> Option<FileDiff>` (a thin
  `git diff HEAD --no-color --no-ext-diff -- <path>` + the existing pure `parse_unified_diff`, with
  an `is_tracked` check + the #183 `git diff --no-index -- /dev/null <path>` fallback so a brand-new
  untracked file reads as all-Added; `has_head` guard for an unborn repo). Modeled on
  `commit_diff`/`compare_branches`, far lighter than whole-repo `working_diff`, fail-open (clean /
  non-git → `None`). Rust temp-repo unit tests added.
- **`src-tauri/src/commands.rs` + `lib.rs`:** the `file_diff(repo, file)` `#[tauri::command]`
  (returning the shared `FileDiff`), registered in `generate_handler!`.
- **`src/ipc.ts`:** a `fileDiff(repo, file)` wrapper.
- **`src/components/FileViewer/gutter.ts` (+ `gutter.test.ts`):** a pure, unit-tested
  `gutterMarkers(hunks)` classifier — walks the hunks grouping each maximal run of `add`/`del` rows
  into a change block, marks the first `min(d,a)` adds **modified** (yellow) and any insertion tail
  **added** (green), and records a red-dot **deletion** at the line following a delete-heavy/pure
  deletion block (an `EOF_DELETION` sentinel for a trailing deletion).
- **`src/components/FileViewer/useFileDiffGutter.ts`:** a small fetch/poll hook (mirrors
  `useAutoSaveFile`'s visibility gating) — fetches on mount/active-change, every ~2 s while visible,
  and on `text` change; enabled only for the code view; fully fail-open.
- **`src/components/FileViewer/FileViewer.tsx` (+ `FileViewer.module.css`):** wired the hook
  (`gutterEnabled = lang !== undefined`), extended `CodeBlock` with a `LineGutter` column inside a
  flex-row **shared vertical scroller** (`.codeGutterWrap` owns vertical scroll so gutter cell _n_
  lines up with code line _n_ — no JS scroll-sync; the code `<pre>` owns only horizontal scroll so
  the gutter stays pinned). Marker styles use only `--status-done`/`-awaiting`/`-error` tokens.

**Key files/areas touched:** `src-tauri/src/git.rs`, `commands.rs`, `lib.rs`; `src/ipc.ts`; new
`FileViewer/gutter.ts` + `gutter.test.ts` + `useFileDiffGutter.ts`; `FileViewer.tsx` +
`FileViewer.module.css`. 9 files.

**Dependencies:** none (builds on landed infra: `parse_unified_diff`/`working_diff` #39/#183, the
`FileDiff`/`HunkLine` types, `useAutoSaveFile`'s poll pattern #148, the status tokens).

**Notes**

- **Scope — code view only:** the gutter is deliberately limited to the read-only Prism code view.
  Rendered markdown has no source lines; the editable `<textarea>` views (markdown Raw / plain-text)
  have no per-line DOM and their unsaved buffer would diverge from the on-disk diff; large (>256 KB)
  files degrade to a plain read-only view for perf. So markers only appear where the rendered `text`
  mirrors disk and each line is addressable.
- **Marker semantics** follow the VS Code dirty-diff convention (green added / yellow modified / red
  dot for a removal — the dot only *marks* the removal, it doesn't reveal the removed text). No git
  write, no staging/revert affordance — read-only (`git diff HEAD` + `git diff --no-index`).
- **Clears within ~2 s of a commit:** a self-contained poll (not the #212 busy→idle
  `fileStatuses` signal) guarantees the gutter re-checks and clears regardless of trees/agents.
- **Cross-platform:** the only OS-sensitive primitive is the `git` shell-out, which reuses the
  `hidden_command` (CREATE_NO_WINDOW) path; the `/dev/null` untracked arg is already proven on
  Windows by #183; all colors are `--status-*` tokens and the markers are static (nothing to guard
  for reduced-motion) — so the gutter renders identically on WKWebView (macOS) and WebView2
  (Windows). Checks green: `npm run build` / `npm test` / `npm run lint` / `npm run format:check` /
  `cargo test` / `npm run lint:rust`.

### 328. [x] Move the five-hour usage fetch off the main thread (async, non-blocking)

Stopped the whole app UI from freezing every time the sidebar-footer **five-hour usage bar** (#154)
refreshed. The `claude_session_usage` Tauri command was a **synchronous `#[tauri::command] pub fn`**,
and in Tauri 2 a sync command runs on the **main (webview) event-loop thread** — so its blocking
credentials read, its up-to-8 s `ureq` HTTPS GET (`HTTP_TIMEOUT`), and the macOS `security`
subprocess spawn all executed on the thread that drives WKWebView/WebView2, locking rendering **and**
input until the request returned. This was the exact bug class #316 had already fixed for the git
commands; the usage command was simply missed by that sweep. After this change the fetch runs on the
blocking pool and the window stays fully responsive during a refresh (scroll, tab switch, typing in a
terminal — no freeze).

**What shipped** (commit [`bdcb8d7`](https://github.com/ErikdeJager/ReCue/commit/bdcb8d7), PR
[#82](https://github.com/ErikdeJager/ReCue/pull/82), branch `usage-async-offload`, 2026-07-06):

- **`src-tauri/src/usage.rs` (only file touched, +21/−4):** the current command body (token read →
  `fetch_usage` → `parse_snapshot`, with its `usage_diag` breadcrumbs) was extracted **verbatim**
  into a private, non-command `fn usage_snapshot_blocking() -> Option<UsageSnapshot>`; a new
  `#[tauri::command] pub async fn claude_session_usage()` wraps it as
  `tauri::async_runtime::spawn_blocking(usage_snapshot_blocking).await.ok().flatten()`, mirroring the
  #316 `git::current_branch`/`fetch_remotes` conversion. The stale/incorrect doc comment ("Sync →
  Tauri runs it off the main thread…") was corrected to describe the async/`spawn_blocking` behavior.

**Key assumptions carried over** (from `ASSUMPTIONS.md` Task 328 — assume variant):

- **Root cause is the sync Rust command, not the frontend.** `refreshUsage` already `await`s off a
  `setInterval` (not on any React render path), so no frontend change was needed. "Make it Async
  (multi thread)" was read as: make the Rust command async and offload its blocking work where the
  freeze actually lives.
- **Minimal, precedented fix — `spawn_blocking`, not a new async HTTP client.** Reused the existing
  blocking `ureq` client rather than pulling in `reqwest`; zero new dependencies, smallest surface.
- **Return type unchanged** (`Option<UsageSnapshot>`), so the `src/ipc.ts` `invoke<UsageSnapshot |
  null>` contract and `src/store.ts` `refreshUsage` needed **no changes**; poll cadence
  (`USAGE_POLL_MS = 180_000` / `ARMED_POLL_MS = 45_000`) left as-is (the card is about lag, not
  staleness; the endpoint 429s below 180 s).
- **Fail-open preserved, including a join error.** A token miss / HTTP error / parse mismatch — and a
  `spawn_blocking` task panic — all collapse to `None` (the bar hides) via `.ok().flatten()`.
- **Cross-platform parity is inherent.** `spawn_blocking` is OS-agnostic; the macOS Keychain fallback
  (`#[cfg(target_os = "macos")]`) stays gated inside the moved body, so behavior is byte-for-byte
  identical on macOS and Windows — only the thread the work runs on changes. The GUI + network
  responsiveness check needs a real box (not CI-unit-testable) and was flagged for macOS/Windows
  smoke verification per the CLAUDE.md untestable-path rule.

**Key files/areas touched:** `src-tauri/src/usage.rs`. 1 file.

**Dependencies:** none (all prior usage-bar work — #154, #272, #296, #297, #305, #309, #316, #326 —
already landed; the change is self-contained and mirrors the #316 spawn_blocking pattern).

### 329. [x] DiffInspector accordion cards — enforce a readable min-width and scroll on overflow

Fixed the diff viewer's **Accordion** display mode (#231/#237) so a large diff (many changed files)
stays usable in narrow Canvas splits and Overview columns. Previously the accordion crushed its file
cards so small their contents couldn't be read. **Root cause:** `.accordion` is a `flex-direction:
column` container and each `.card` has `overflow:hidden` — per the CSS Flexbox spec, a flex item
whose main-axis `overflow` isn't `visible` gets an automatic minimum size of **0**, so with many
cards the flex algorithm shrank every card toward 0 height and `overflow:hidden` clipped their
contents instead of the accordion's `overflow-y:auto` scrolling. On the x-axis, `align-items:stretch`
gave each card exactly the accordion's content width with no floor, so a narrow panel dropped it
below what's needed to read the header or code body. After this change collapsed cards keep their
natural height and the list scrolls vertically; cards have a readable minimum width and the accordion
scrolls horizontally when the panel is narrower than that minimum.

**What shipped** (commit [`89837bf`](https://github.com/ErikdeJager/ReCue/commit/89837bf), PR
[#81](https://github.com/ErikdeJager/ReCue/pull/81), branch `task-329-diff-accordion-min-width`,
2026-07-06):

- **`src/components/DiffInspector/DiffInspector.module.css` (only file touched, +19/−1):** three
  scoped edits, each with an explanatory comment — (1) `.card { flex-shrink: 0 }` so cards keep their
  natural (content) height and the accordion's existing scroll engages instead of crushing them
  (cards still don't grow — default `flex-grow:0` — so a short list is unchanged); (2) `.card {
  min-width: 320px }` so a card's used width is `max(accordion content width, 320px)`, covering both
  collapsed and expanded cards with one rule; (3) `.accordion` `overflow-y:auto` → `overflow:auto`
  (both axes) so a card floored at 320px can be scrolled into view horizontally when the panel is
  narrower, with no horizontal scrollbar when the panel is wide enough. `.card`'s `overflow:hidden`
  (needed to clip `.cardBody`'s top border to the rounded corners) and `.cardBody`'s
  `max-height:420px; overflow:auto` cap were kept as-is.

**Key assumptions carried over** (from `ASSUMPTIONS.md` Task 329):

- **Minimum-width value = 320px (a judgment call).** Readable for the 12px-mono diff body + line-
  number gutters + the header (badge/filename/± counts), and deliberately **below** the Overview
  column min (`--overview-card-min` default 400px, #176) so the common Overview case never triggers
  horizontal scroll — the floor only bites in genuinely narrow Canvas splits.
- **Fixed px, not the `--overview-card-min` variable** — keeps the diff-card floor local and
  predictable across Overview/Canvas/BigMode, since that variable means "Overview column width," not
  "diff card width."
- **Narrow-panel behavior = horizontal scroll**, mirroring the Overview wall's "overflow horizontally
  instead of squeezing" precedent, rather than letting the panel dictate a sub-minimum width.
- **Scope = Accordion only; Focused mode untouched** (separate classes; verified non-regressed). No
  `DiffInspector.tsx`/logic changes — a pure layout fix.

**Key files/areas touched:** `src/components/DiffInspector/DiffInspector.module.css`. 1 file.

**Dependencies:** none (the DiffInspector and its Accordion mode already exist and are landed —
#231/#237/#278).

**Notes**

- **Cross-platform:** pure WebView CSS (flexbox `flex-shrink`/`min-width` + `overflow`) with no
  native/path/shell code and no OS-conditional styling; flexbox + overflow scrolling behave
  identically under WKWebView (macOS) and WebView2/Chromium (Windows), and scrollbars are already
  themed globally via `::-webkit-scrollbar` (honored by both engines) — so it renders the same on
  both OSes. The GUI layout result needs a real-box visual check that CI can't assert. Checks green:
  `npm run build` / `npm run lint` / `npm run format:check`.

### 330. [x] Load diff-viewer and file-tree git reads off the webview thread (async)

Stopped the diff viewer (and the file-tree status coloring) from freezing the UI. The **DiffInspector**
re-reads the working-tree diff every ~1.5 s (`POLL_MS = 1500`), and each read ran a synchronous `git`
shell-out **plus a full hunk parse on the webview/main thread** — so on a repo with a large working
tree (or several diff panels open at once) the app stuttered on every refresh. **Root cause:** the
diff / file-status git commands were plain synchronous `#[tauri::command] pub fn`, and in Tauri a sync
command runs on the webview thread, so its git call + parse blocked input/rendering until it returned
— the exact bug already fixed for the branch reads (`current_branch`/`current_branches`/`list_branches`/
`fetch_remotes`, #316) and for `remove_worktree` (#200) / `clone_repo` (#299), which were converted to
`spawn_blocking`. The diff and file-status reads were simply never converted. After this change the git
work runs on Tauri's blocking thread pool: the UI stays responsive while the diff still refreshes to
the latest working-tree state within ~1.5 s after an agent's turn (no staleness).

**What shipped** (commit [`210d41c`](https://github.com/ErikdeJager/ReCue/commit/210d41c), PR
[#83](https://github.com/ErikdeJager/ReCue/pull/83), branch `async-diff-git-reads-330`, 2026-07-06;
2 files, +52/−15):

- **`src-tauri/src/commands.rs`:** converted six git-read commands from synchronous `fn` to `async fn`
  running their git call via `tauri::async_runtime::spawn_blocking`, mirroring the existing
  `current_branches` / `fetch_remotes` pattern, with names/args/return types unchanged and doc-comments
  refreshed —
  - `working_diff(cwd) -> WorkingDiff` (the heaviest read; `.unwrap_or_default()` fail-open on a join
    error),
  - `file_statuses(repo) -> Vec<FileStatusEntry>` (the FileTree row-coloring read — the "other panel"
    the card named),
  - `file_diff(repo, file) -> Option<FileDiff>` (the FileViewer gutter; `.ok().flatten()`),
  - `list_commits(cwd, limit) -> Vec<CommitInfo>` (clamp kept, then off-thread),
  - `commit_diff(cwd, sha) -> Result<WorkingDiff, SessionError>` and
  - `compare_branches(cwd, base, target) -> Result<WorkingDiff, SessionError>` (join error → `SessionError::Io`).
- **`src-tauri/src/git.rs`:** added `Default` to the `DiffSummary` and `WorkingDiff` derive lists so
  `working_diff`'s async wrapper can `.unwrap_or_default()` on the (near-unreachable) blocking-task
  join error. The other return types (`Vec<…>`, `Option<…>`) already have `Default`.
- **No frontend change:** `src/ipc.ts` wraps each command with `invoke<T>()` (Promise-returning) and
  `lib.rs` registers them by bare name, so the sync→async conversion is transparent to the IPC contract
  and registration. `DiffInspector.tsx`'s poll cadence, `inFlightRef`/`sigRef`, and `JSON.stringify(next)`
  change-detection were left untouched.

**Key assumptions carried over** (from `ASSUMPTIONS.md` Task 330):

- **Root cause = blocking Rust I/O on the webview thread, not too-frequent re-fetch or off-screen
  polling.** Fix = `spawn_blocking`, the established #200/#299/`fetch_remotes` pattern; matches the
  card's ask ("use multi threading/Async to load the diffs in the background").
- **"Other panels" scope = include the FileTree's `file_statuses`, exclude the rest.** `file_diff` and
  the diff viewer's compare/commit sources were converted in the same sweep for consistency (same
  trivial pattern); **excluded** `pull_branch`/`checkout_branch`/`create_branch` — user-initiated
  one-shots, not polled, so not a source of "constant" lag (noted as deferred).
- **Rejected the frontend `JSON.stringify`→lighter-fingerprint optimization** to avoid a correctness
  regression: a summary/counts-only signature could miss a same-count content edit and show a **stale**
  diff (the card requires the diff still reflect the latest state). Once the git work is off-thread the
  residual stringify is a minor JS cost, not a freeze — so no new frontend helper/test was added.

**Key files/areas touched:** `src-tauri/src/commands.rs`, `src-tauri/src/git.rs`. 2 files.

**Dependencies:** none (all the diff / file-tree / git plumbing already existed and had landed; this
only changed the thread the reads run on — orthogonal to the sibling #329 accordion-CSS card).

**Notes**

- **Cross-platform:** `tauri::async_runtime::spawn_blocking` is OS-neutral and the moved git calls
  still go through `git::hidden_command()` (the Windows `CREATE_NO_WINDOW` console-flash guard)
  unchanged; **no** new `#[cfg(...)]` divergence — only the thread the identical git work runs on
  changes, so both OS arms stay byte-for-byte equivalent. The UI-smoothness result needs a real-box
  visual check on both macOS and Windows (not unit-testable). Checks green: `cargo test` /
  `npm run lint:rust` / `npm run format:rust` / `npm run build` / `npm run lint` / `npm test`.

### 331. [x] "New session here" on a worktree agent nests under the existing worktree instead of registering a stray sidebar folder

Starting a new agent from a **worktree** agent's (or worktree panel's) "Open a view or start a session
in this folder" button (`OpenViewButton` → "New session here", #213/#177) now adds the new agent
**inside that worktree's existing nested sub-group** (under the parent repo), instead of registering the
app-managed worktree directory (`<app-data>/worktrees/<repo-id>/<branch>`) as its own brand-new
top-level sidebar folder. **Root cause:** the interactive Rust `spawn_session` command always persisted
the new record with `worktree_parent: None` and called `store.touch_recent(&cwd)` with the **worktree
folder** path — so the new session was treated as a normal session whose `repoPath` was the worktree
folder (included in `sessions.filter(s => !s.worktreeParent)` and unioned into the top-level
`repoOrder`), and the worktree folder landed in `recents` (both the optimistic frontend update and the
durable backend `touch_recent`) → it surfaced as a stray top-level folder. The schedule/recurring
**fire** path and **fork** (#126) already set `worktree_parent` and touch the parent, so they nested
correctly; this made the interactive spawn behave the same way.

**What shipped** (commit [`6dd3fb1`](https://github.com/ErikdeJager/ReCue/commit/6dd3fb1), PR
[#84](https://github.com/ErikdeJager/ReCue/pull/84), branch `worktree-new-session-nesting`, 2026-07-06;
4 files, +152/−4):

- **`src-tauri/src/commands.rs`:** added a pure `worktree_parent_for_cwd(sessions, cwd) -> Option<String>`
  resolver — the parent repo of an app-managed worktree folder `cwd` if an agent already runs there (a
  persisted session whose `repo_path == cwd` carries a `worktree_parent`), else `None` (so a normal spawn
  is unaffected). It matches `cwd` against the **exact persisted `repo_path` string** (an opaque
  identifier), so it's separator-agnostic and identical on macOS/Windows with no path parsing. In
  `spawn_session`, computed `worktree_parent = worktree_parent_for_cwd(&store.sessions(), &cwd)`, set the
  record's `worktree_parent` from it (replacing the hardcoded `None`), and replaced `touch_recent(&cwd)`
  with `touch_recent(worktree_parent.as_deref().unwrap_or(&cwd))` — touching the parent for a worktree
  spawn, the folder itself otherwise. Added a Rust unit test (`mk_session` helper) asserting the resolver
  returns the parent for a worktree-agent cwd and `None` for a plain/normal-only cwd.
- **`src/store.ts`:** aligned the optimistic recents update in the `spawnSession` and
  `createBranchSession` actions to `record.worktree_parent ?? cwd`, so no stray worktree folder flashes
  before the next refresh. The existing `upsertSession(toSessionView(record))` already picks up the
  corrected `worktreeParent` from the backend record, so nesting is automatic.
- **`src/store.test.ts` + `src/paths.test.ts`:** frontend test that spawning into a worktree cwd yields a
  session whose `worktreeParent`/`effectiveRepo` is the parent and unshifts the **parent** (not the
  worktree folder) into `recents`; plus a `paths.test.ts` assertion reinforcing the grouping invariant
  (a `{repoPath:"/wt/feat", worktreeParent:"/repo"}` session has `effectiveRepo === "/repo"` and is
  excluded from the top-level filter).

**Key assumptions carried over** (from `ASSUMPTIONS.md` Task 331):

- **"Reuse the existing worktree" = the new agent JOINS the existing worktree's nested sub-group** (same
  worktree folder `repoPath` → same sub-group; #74 already supports multiple agents per worktree), not a
  second/separate worktree.
- **Fix spans backend + frontend, not frontend-only** — the durable backend record (`worktree_parent:
  None` + `touch_recent(worktreeFolder)`) would re-introduce the stray folder on the next refresh/reboot
  even if the frontend patched its optimistic state, so the backend is the real fix; the frontend change
  only keeps the optimistic UI consistent.
- **Detection = reuse the recorded `worktree_parent` of an existing session at the same `repo_path`**
  (mirrors the frontend `worktreeParentOf`), not a git worktree probe — reliable, consistent with how
  the app tracks worktree membership, and an opaque-string match (no path parsing).
- **Centralized in the backend `spawn_session` command** so every entry point routing through
  `ipc.spawnSession` (OpenViewButton "New session here", `NewSessionModal` instant/branch spawn,
  `CreatePanelModal`, Canvas template `new-agent`, `createBranchSession`) nests correctly at once. The
  worktree "New session here" UX stays an instant, no-modal spawn on the worktree's current branch — only
  grouping/recents change.
- **Accepted edge case (out of scope):** a worktree that currently has only a non-agent panel and zero
  session records can't have its parent resolved from the session store, so its panel's "New session
  here" would still register a top-level folder — rare, not the reported bug (a worktree *agent*'s button
  always has a live session); noted as a known limitation for a follow-up.

**Key files/areas touched:** `src-tauri/src/commands.rs`, `src/store.ts`, `src/store.test.ts`,
`src/paths.test.ts`. 4 files.

**Dependencies:** none (#74 worktrees, #96 `effectiveRepo`, #127 `startRepoSession`, #177 instant "New
session here", #199 worktree-parent tracking, #213 worktree `OpenViewButton` all landed).

**Notes**

- **Cross-platform:** the fix matches `cwd` against the exact persisted `repo_path` string (the same
  string the backend produced and the frontend passed back), never parsing/splitting a path — so it
  behaves byte-for-byte identically with Windows `%USERPROFILE%`/backslash worktree paths and macOS
  `/`-paths; no new path handling, no `platform`/`joinPath`/`splitPath` needed. The backend change is
  guarded by `worktree_parent.is_some()`, so an ordinary folder never matches (no regression). The GUI/PTY
  spawn + restart-persistence check needs a real box (not unit-testable) and was flagged for macOS/Windows
  smoke verification. Checks green: `npm run build` / `npm run lint` / `npm test` / `cargo test` /
  `npm run lint:rust` / `npm run format:rust`.

### 332. [x] Esc-to-cancel in session modals must not exit macOS fullscreen

Pressing **Esc** to cancel a session modal while the ReCue window is in **native macOS fullscreen** no
longer pops the window out of fullscreen — it now cancels the modal only. **Root cause:** on macOS, an
Esc keydown that the web content leaves *unhandled* leaks up the responder chain and the OS treats it as
"exit fullscreen". The `NewSessionModal` (New / Schedule / Recurring session) and `TemplateUseModal`
(new Canvas tab from template) both closed on Esc via a **window-level** keydown listener that called
`close()` **without** `event.preventDefault()`, so the keydown read as unhandled and still triggered the
native fullscreen exit even though the modal also closed. Calling `event.preventDefault()` marks the
event handled by the web content, suppressing the native default — Esc now stays scoped to cancelling
the modal. The fix is applied **universally** (no platform gate): `preventDefault()` on Esc is harmless
on Windows and outside fullscreen (Esc has no destructive default there), and is more robust than
detecting fullscreen state.

**What shipped** (commit [`401929c`](https://github.com/ErikdeJager/ReCue/commit/401929c), PR
[#85](https://github.com/ErikdeJager/ReCue/pull/85), branch `esc-cancel-session-modals-fullscreen`,
2026-07-06; 2 files, +11/−2):

- **`src/components/NewSessionModal/NewSessionModal.tsx`:** in the window-level "Escape closes the
  popover" keydown listener, added `event.preventDefault()` before `close()`, with a `(#332)`
  provenance comment noting the macOS-fullscreen reason. Listener registration/cleanup and the
  `[open, close]` deps left unchanged.
- **`src/components/TemplateUseModal/TemplateUseModal.tsx`:** the identical one-line
  `event.preventDefault()` (+ `(#332)` comment) in its window-level Esc keydown listener.

**Key assumptions carried over** (from `ASSUMPTIONS.md` Task 332):

- **"Session modals" = the create/schedule/manage-session family** — `NewSessionModal`,
  `TemplateUseModal`, `CloneRepoModal`, `CanvasCloseModal`, `CreatePanelModal`, `OnboardingModal`.
  **Excluded** the `Settings` modal (not session-specific) and sidebar context-menus/rename inputs
  (popovers, not modals).
- **Actual code change is only two files.** An audit of all seven Esc-cancel modals found 5 already
  call `event.preventDefault()` on Esc; only `NewSessionModal` and `TemplateUseModal` (both
  `window`-listener wired) omitted it — those are the real fix. The rest were confirmed compliant,
  no edits.
- **Universal `preventDefault()`, no platform gate / fullscreen detection** — applied unconditionally
  rather than only-when-macOS-fullscreen, matching CLAUDE.md's "macOS behavior fixed, Windows
  unaffected" seam.
- **No shared `useModalEscape` hook / refactor** — kept the minimal per-modal one-line change since
  most modals already comply; the smallest correct change wins.
- **Skill-menu case is unaffected:** `SkillAutocomplete`'s open `/`-menu already `preventDefault()`s
  **and** `stopPropagation()`s Esc (the React synthetic `stopPropagation` also stops the native
  event), so the window Esc listener does not fire while the menu is open — Esc still closes just the
  menu, not the whole modal.

**Key files/areas touched:** `src/components/NewSessionModal/NewSessionModal.tsx`,
`src/components/TemplateUseModal/TemplateUseModal.tsx`. 2 files. Frontend-only; no Rust.

**Dependencies:** none.

**Notes**

- **Cross-platform:** `event.preventDefault()` on the Esc keydown is OS-neutral and applied without any
  `#[cfg]`/`platform` gate — harmless on Windows and when not fullscreen (Esc has no destructive
  default there), so both OS arms behave equivalently and Windows Esc-cancel is unchanged. The native
  macOS fullscreen-exit suppression is WKWebView-only and can't be exercised in jsdom/CI, so it was
  flagged for a manual macOS-fullscreen smoke check per the repo's GUI-path convention; the automated
  checks confirm the event is `preventDefault`ed. Checks green: `npm run build` / `npm run lint` /
  `npm test`.

### 334. [x] Clear the Overview folder filter when selecting an agent it would hide

When the Overview wall is filtered to one folder and the user clicks a sidebar **agent row** belonging
to a **different** folder — one the active filter would hide — the filter now **clears automatically**,
so the clicked agent is actually shown and selected in the wall instead of silently disappearing behind
a mismatched folder filter. **Before:** the Overview folder filter (`overviewRepoFilter`, #34/#197/#247)
narrows the wall to one repo cluster, but `selectItem` (#79, the sidebar-row select action) only set
`selectedId` and never touched the filter — so selecting an agent the filter hid pointed `selectedId` at
a column that wasn't rendered, and nothing appeared to happen (the visible no-op the card reported). The
fix adds a small early-out guard at the top of `selectItem` that, for an **agent** the current filter
would hide, clears the filter first — judged by `sessionInFilter`, the exact predicate the wall itself
uses to render.

**What shipped** (commit [`d7a0b35`](https://github.com/ErikdeJager/ReCue/commit/d7a0b35), PR
[#86](https://github.com/ErikdeJager/ReCue/pull/86), branch `clear-overview-filter-on-agent-select`,
2026-07-06; 2 files, +95):

- **`src/store.ts`:** added a `#334` guard at the top of the `selectItem` action (before its
  `view !== "canvas"` branch) — when `item.kind === "agent"` and a filter is active, it looks the full
  session up in `s.sessions` (a `SidebarItem` carries only `{ id, kind, repoPath }`, but
  `sessionInFilter` needs the session's `worktreeParent` to judge `"own"`/worktree cases) and, if
  `!sessionInFilter(sess, s.overviewRepoFilter)`, sets `overviewRepoFilter: null`. No new import
  (`sessionInFilter` was already imported). Fail-safe: a not-found session keeps the filter.
- **`src/store.test.ts`:** 5 new `#334` unit tests beside the existing `setOverviewRepoFilter` tests —
  mismatched agent clears the filter, same-folder agent keeps it, `"all"`-filter worktree agent of the
  filtered repo keeps it (visible via `effectiveRepo`, #96), `"own"`-filter worktree agent it hides
  clears it, and a null filter / a non-agent item both leave the filter untouched.

**Key assumptions carried over** (from `ASSUMPTIONS.md` Task 334):

- **"Deselect" = clear the filter entirely** (`overviewRepoFilter → null`), not switch it to the clicked
  agent's folder — the card says "the filter should deselect".
- **Scoped to agent rows only.** `selectItem` is shared by all sidebar item kinds (files, diffs,
  terminals, kanban, filetree, scheduled, recurring); the guard fires only for `item.kind === "agent"`,
  leaving every other kind's filter intact.
- **Only a mismatch clears it** — selecting an agent already visible under the filter leaves the filter
  as is; judged by the wall's own `sessionInFilter` (so an `"all"` filter keeps a same-repo worktree
  agent, an `"own"` filter clears for one it hides).
- **Runs regardless of view.** The guard is before `selectItem`'s view branching; clearing the filter
  while in Canvas is harmless (the filter only narrows the Overview wall) and keeps the sidebar's
  filtered-header highlight consistent on return to Overview.
- Keyboard navigation (`useKeyboardNav.ts`) steps only through the already-filtered column set, so it
  can never land on a hidden agent — no change needed, out of scope.

**Key files/areas touched:** `src/store.ts`, `src/store.test.ts`. 2 files. Frontend-only; no Rust.

**Dependencies:** none.

**Notes**

- **Cross-platform:** a single additive early-out in one store action reusing the wall's
  `sessionInFilter` predicate — pure frontend/store logic with no data-model, IPC, Rust, or OS-specific
  code, so it behaves identically on macOS and Windows (no `platform`/`#[cfg]` gate needed). Idempotent
  (re-selecting the same agent is a no-op once the filter is null). Checks green: `npm run build` /
  `npm run lint` / `npm test`.

### 333. [x] Light mode theme option in Settings (Catppuccin Latte)

Added a **Light** theme, selectable in **Settings → Appearance** (a Dark/Light segmented control),
that reskins the whole UI with a **Catppuccin Latte** palette while keeping the same design language
(borders, spacing, radii, accent usage). The default stays **Dark** (Mocha, byte-for-byte the prior
appearance); the choice persists across restarts and applies to detached canvas windows too. This
card **reverses** CLAUDE.md's documented "Dark theme only" (stack) and "no light mode" (out-of-scope)
rules — like #84 (single-window), #100 (settings), and #126 (fork) reversed earlier v1 rules.
Because the app is fully **design-token driven** (every color is a `var(--token)` from
`src/styles/tokens.css`, with no hardcoded color literals in component CSS), the theme is achieved
almost entirely by **redefining the color tokens under a selector** — components need no per-component
work. The **terminal area stays dark in both themes** (claude's TUI is dark-designed).

**What shipped** (commit [`0de534d`](https://github.com/ErikdeJager/ReCue/commit/0de534d), PR
[#87](https://github.com/ErikdeJager/ReCue/pull/87), branch `light-mode-theme-333`, 2026-07-06;
7 files, +128/−10):

- **`src/types/index.ts`:** added `theme: "dark" | "light"` to the `Settings` interface.
- **`src/store.ts`:** `theme: "dark"` in `DEFAULT_SETTINGS` (so an older `sessions.json` lacking
  `theme` upgrades to `"dark"` via the existing `mergeSettings` spread); in `applySettingsEffects`,
  a `data-theme` toggle on `<html>` — `root.setAttribute("data-theme", "light")` for light, removed
  for dark. Runs on boot (`init`) and on `saveSettings`, and — since `CanvasWindow` also calls
  `init()` — in detached windows too.
- **`src/styles/tokens.css`:** a `:root[data-theme="light"] { … }` block overriding **only** the
  color tokens that must flip (surfaces, borders, text, accent = Latte Peach `#fe640b`, diff, status,
  syntax, a softer popover shadow) with the Catppuccin **Latte** palette; plus a new stable
  `--terminal-fg` token in `:root` (value `#cdd6f4` = the current foreground). `--terminal-bg` /
  `--terminal-fg` / `--terminal-selection` / `--usage-critical` are **deliberately not** overridden,
  so the terminal stays dark. Spacing/radii/type/motion/fonts inherit from `:root`.
- **`src/components/Terminal/terminalPool.ts`:** the xterm `foreground` now reads `--terminal-fg`
  (not the flipping `--text-primary`), keeping terminal text light in both themes.
- **`src/components/Settings/Settings.tsx`:** a Dark/Light segmented control in the Appearance
  section (above Accent color), reusing the existing `styles.segmented` pattern; applied on Save.
- **`src/store.test.ts`:** `theme` default/merge assertions (`DEFAULT_SETTINGS.theme === "dark"`, an
  old blob missing `theme` upgrades to `"dark"`, `mergeSettings({ theme: "light" }).theme === "light"`).
- **`CLAUDE.md`:** the documentation reversal — "Dark theme only" → "Dark (default) and Light themes
  (#333)", the out-of-scope "no light mode" reversed with a #333 note, the Settings architecture
  paragraph updated to mention the `theme` field, the `data-theme="light"` toggle on `<html>`, and
  that the terminal stays dark.

**Key assumptions carried over** (from `ASSUMPTIONS.md` Task 333):

- **Light palette = Catppuccin Latte**, the natural light sibling of the #33 Mocha remap (proper
  contrast on light surfaces; the pale Mocha pastels would wash out).
- **Mechanism = `data-theme="light"` on `<html>` + a `:root[data-theme="light"]` override block**,
  *not* a `body.light` class — **load-bearing**: the custom accent (#102/#107) is written **inline on
  `<html>`**, so putting the theme selector on the same element lets the inline custom accent
  correctly win; a `body.light` rule on the child would override the inherited inline accent and
  silently break a custom accent in light mode.
- **Terminal stays dark in both themes** via the un-overridden `--terminal-bg`/`--terminal-selection`
  + the new stable `--terminal-fg`; terminals aren't re-themed on a runtime switch (both themes render
  them dark, so no live re-theme needed).
- **No "System/Auto" (prefers-color-scheme) option** — explicit Dark/Light only for v1.
- **`REPO_PALETTE` and the Settings accent-swatch palette are NOT re-themed** — persisted
  brand/identity colors; re-theming would break stored repo colors.
- **Accepted minor caveats:** the Appearance "default" accent swatch chip (`#fab387` Mocha Peach)
  won't exactly match the applied Latte Peach (`#fe640b`) in light mode; and a brief dark first-paint
  flash on boot (theme applies async in `init()`, identical timing to the existing accent/reduce-motion
  effects) — neither addressed.

**Key files/areas touched:** `src/types/index.ts`, `src/store.ts`, `src/styles/tokens.css`,
`src/components/Terminal/terminalPool.ts`, `src/components/Settings/Settings.tsx`, `src/store.test.ts`,
`CLAUDE.md`. 7 files. Frontend/docs only; no Rust/backend (rides the existing opaque `settings` blob).

**Dependencies:** none (self-contained; uses only the existing settings blob and token layer).

**Notes**

- **Cross-platform:** pure CSS/JS with no OS-specific code — scrollbars already use
  `::-webkit-scrollbar` (WKWebView + WebView2), `color-mix` tints already ship plain-color fallbacks,
  and no macOS-only vibrancy is introduced, so the light theme behaves identically on macOS and
  Windows. Fully reversible (set the theme back to Dark) and idempotent (`applySettingsEffects` sets/
  removes the `data-theme` attribute deterministically each call). Checks green: `npm run build` /
  `npm run lint` / `npm run format:check` / `npm test`.

### 335. [x] Per-agent added/removed line counts in the sidebar

Each **sidebar agent (session) row** now shows a compact green **+N** / red **−N** count of lines
added / removed in that agent's working tree vs `HEAD`, so a user sees at a glance how much each agent
has changed. The count is computed **off the webview thread** (batched `async` Tauri command on
`spawn_blocking`, the #330 pattern) on the existing refresh cadence, a long agent **name ellipsizes**
so the badge stays visible, and a Settings → Appearance toggle (`showDiffLineCounts`, default **on**)
turns the whole feature off — removing the badge **and** skipping the git reads entirely.

**What shipped** (commit [`6095d97`](https://github.com/ErikdeJager/ReCue/commit/6095d97), PR
[#88](https://github.com/ErikdeJager/ReCue/pull/88), branch `task-335-diff-line-counts`, 2026-07-06;
11 files, +397/−6):

- **`src-tauri/src/git.rs`:** a `DiffLineCounts { added, removed }` struct (`Serialize`, `Default`);
  a pure `sum_numstat(out)` helper parsing `git diff --numstat` (`<added>\t<removed>\t<path>`, a
  binary `-\t-\t…` row contributes 0); a bounded `count_new_file_lines(cwd, rel)` (size-capped +
  binary-skipping newline count, +1 for a final unterminated line); and `diff_line_counts(cwd)` — one
  `git diff --numstat HEAD` for tracked changes plus untracked additions via the existing
  `untracked_files` (bounded by `MAX_UNTRACKED_FILES`), entirely fail-open. Every git call routes
  through `hidden_command()` (the Windows console-flash guard). Unit tests: `sum_numstat_sums_added_and_removed`
  (fixture asserts `(13,6)`), `diff_line_counts_tracked_edits_and_untracked_additions`, and
  `diff_line_counts_clean_and_non_git_are_zero`.
- **`src-tauri/src/commands.rs` + `lib.rs`:** an `async fn diff_line_counts(paths: Vec<String>) ->
  HashMap<String, DiffLineCounts>` command running the git work on `spawn_blocking` (batched — the
  whole sidebar refresh is one IPC round-trip), registered in `generate_handler!`.
- **`src/types/index.ts` + `src/ipc.ts`:** a `DiffLineCounts` type, `showDiffLineCounts: boolean` on
  `Settings`, and a `diffLineCounts(paths)` IPC wrapper.
- **`src/store.ts`:** a `diffLineCounts: Record<string, DiffLineCounts>` map (keyed by
  `session.repoPath`), a `refreshDiffLineCounts` action that **self-guards on the setting** (off ⇒ no
  git read) and skips a no-op re-render via a shallow `diffCountsMapsEqual`, `DEFAULT_SETTINGS.
  showDiffLineCounts = true`, and wiring into the debounced busy→idle edge (`scheduleBranchRefresh`)
  and the spawn/checkout refresh sites.
- **`src/components/Sidebar/diffCounts.ts` (+ `.test.ts`):** a pure `diffCountBadge(counts, enabled)`
  returning `null` when disabled / no counts / `{0,0}`, else the counts — Vitest covers off / clean /
  adds-only / dels-only / both / undefined.
- **`src/components/Sidebar/Sidebar.tsx` + `.module.css`:** the badge rendered in `SessionRow` as a
  `flex-shrink:0` slot between the label and the × (so the name truncates first), `+N` in
  `--status-done` green and `−N` (Unicode minus U+2212) in `--status-error` red, mono at
  `--fs-meta-xs` with tabular numerals, hidden during inline rename; plus a load-effect refresh keyed
  on the repo set **and** `showDiffLineCounts` so an off→on toggle populates immediately.
- **`src/components/Settings/Settings.tsx`:** an Appearance `Checkbox` ("Show added/removed line
  counts on agent rows").

**Key assumptions carried over** (from `ASSUMPTIONS.md` Task 335):

- **Scope = sidebar only** ("left panel") — Overview card / Canvas panel headers are out of scope
  (noted as a possible future extension).
- **Untracked (non-ignored) files are included in +N** via a bounded, binary-skipping, size-capped
  newline read — because `git diff --numstat HEAD` alone omits a fresh agent's newly created files
  and would show a misleading +0. Removed lines come only from tracked numstat.
- **Map key = the agent's own working-tree path (`session.repoPath`)** so worktree agents key by
  their own cwd; agents sharing a folder show the same totals (expected).
- **Setting `showDiffLineCounts` (default on) lives in Appearance**; when off, no badge **and** zero
  git reads (self-guarded action).
- **Colors = `--status-done`/`--status-error` tokens** (matching the FileTree #252 tinting), never
  hardcoded; a clean tree hides the badge (no `+0 −0`).
- **"Multi-threaded / async / non-blocking" = batched `async` command on `spawn_blocking`** (#330),
  fetched on the debounced busy→idle / load / checkout cadence — never on the render path. Bounded
  (`MAX_UNTRACKED_FILES` + per-file byte cap) so it can't storm; the untracked pass can be dropped
  later with no frontend change if it proves heavy.

**Key files/areas touched:** `src-tauri/src/git.rs`, `commands.rs`, `lib.rs`; `src/types/index.ts`,
`src/ipc.ts`, `src/store.ts`; `src/components/Sidebar/Sidebar.tsx` + `Sidebar.module.css` + new
`diffCounts.ts`/`diffCounts.test.ts`; `src/components/Settings/Settings.tsx`. 11 files.

**Dependencies:** none (self-contained; reuses `hidden_command`, `untracked_files`, the refresh
cadence, and `--status-*` tokens).

**Notes**

- **Cross-platform:** the only OS-sensitive primitive is the `git` shell-out, which uses
  `hidden_command` (no console flash on Windows, no-op on macOS); the file reads use `cwd.join(rel)`
  (`PathBuf`), never string path concat, and the CSS ellipsis + `--status-*` tokens are OS-neutral —
  so the badge behaves identically on macOS and Windows. Fail-open (any git miss / non-git folder /
  join error → zero, badge hidden, no toast) and idempotent (the store skips a no-op update via
  `diffCountsMapsEqual`). Checks green: `cargo test` / `npm run lint:rust` / `npm run format:rust` /
  `npm run build` / `npm run lint` / `npm test`.

### 339. [x] Enter key submits the "New tab from template" modal

The **`TemplateUseModal`** ("New tab from template", #118) now responds to a plain **Enter**: on the
**template** step Enter advances to the folder step (like clicking **Continue**), and on the **folder**
step Enter launches the template into a new Canvas tab (like clicking **Open template**) — so a user can
go template → folder → launch with the keyboard alone instead of being forced to reach for the mouse.
Each step's Enter is gated by exactly the condition that enables that step's primary button (a template
selected / `cwd && templateId`), so a disabled primary stays inert.

**What shipped** (commit [`cbca63e`](https://github.com/ErikdeJager/ReCue/commit/cbca63e), PR
[#89](https://github.com/ErikdeJager/ReCue/pull/89), branch `task-339-enter-submits-template-modal`,
2026-07-06; 1 file, +40/−7):

- **`src/components/TemplateUseModal/TemplateUseModal.tsx` (single-file change):**
  - The dialog wrapper is swapped from a `<div>` to a **`<form onSubmit={onSubmit}>`** (same
    class/role/aria/`stopPropagation`; `.dialog` is selected by class and stays `display:flex`, so the
    render is byte-identical — no CSS change), mirroring `NewSessionModal`'s form-level submit pattern.
  - A step-aware **`submitStep()`** helper: on the template step `if (templateId) setStep("folder")`; on
    the folder step `open()` — and `open()` already no-ops when `!templateId || !cwd` and closes the
    modal on success (via `useTemplate`), so no extra guard/`close()` is needed and there's no
    double-launch. `onSubmit` `preventDefault()`s then calls `submitStep()`.
  - Both `role="listbox"` containers (Templates, Recent folders) get an **`onKeyDown={onListKeyDown}`**
    that runs `submitStep()` on Enter — needed because the rows are `type="button"`, so Enter on a
    focused row wouldn't otherwise submit the form (same reason `NewSessionModal` adds a list `onKeyDown`).
  - The two primary buttons — **Continue** and **Open template** — become `type="submit"` (dropping their
    `onClick`), keeping their `disabled` guards; **Cancel**, **back**, **Choose folder…**, and the
    zero-templates **New template…** stay `type="button"` so Enter on them fires their own action.
  - A `nameRef` on the optional tab-name `<input>` plus a `useEffect` that **focuses it when the folder
    step opens**, so Enter is immediately live (the folder defaults to the most-recent recent, so launch
    is usually valid on arrival). The existing Escape `keydown` `useEffect` (#332) is untouched.

**Key assumptions carried over** (from `ASSUMPTIONS.md` Task 339):

- **Enter semantics per step:** template step advances (= Continue, only with a template selected); folder
  step launches (= Open template, only when `cwd && templateId`). "Complete the launch once all info is
  ready" = Enter both advances between steps and fires the final launch, each gated by its primary's
  enable condition.
- **Plain Enter only (no modifiers):** the handler ignores `metaKey`/`ctrlKey`/`altKey`, so no ⌘/Ctrl
  chord is ever hijacked; no ⌘⏎ "worktree" variant (that's a `NewSessionModal` concept, out of scope).
- **Initial-focus nudge = the tab-name input**, not the launch button — lets the user optionally name the
  tab while Enter still submits via implicit form submission.
- **List Enter acts on the current selection, not a Tab-focused row:** the modal has no arrow-key roving,
  so `onListKeyDown` runs the step action on the currently *selected* row; keyboard users change selection
  with **Space** first. No auto-select of the first row, no new focus-trap/Tab-cycling.
- **No component test added:** Vitest runs the `node` env (no jsdom) with no component-render tests, so
  verification is `npm run build` + `npm run lint` + `npm test` (all pass) + a manual smoke check.

**Key files/areas touched:** `src/components/TemplateUseModal/TemplateUseModal.tsx` only. No store,
`useTemplate`, CSS, or Rust changes.

**Dependencies:** none.

**Notes**

- **Cross-platform:** Enter is the same key on macOS and Windows and no modifier is involved, so nothing
  OS-specific is needed; the plain-Enter guard keeps it clear of any future ⌘/Ctrl chord. Escape-to-close
  (#332) is preserved.

### 338. [x] Branch ahead/behind indicator (↑/↓ vs upstream) in the sidebar

Each git folder shown in the sidebar now displays a compact **`↑N ↓M`** indicator next to its
**current-branch label** — on the repo's own branch line (`RepoBranchLine`) and on each worktree
sub-group header (`WorktreeHeader`) — so a user sees at a glance how far their checked-out branch has
diverged from its upstream remote-tracking branch, without opening a terminal. `↑N` = local commits not
yet on the upstream (green `--status-done`); `↓M` = upstream commits not yet local (yellow
`--status-awaiting`); each side shows **only when its count > 0**, and an in-sync branch (`0/0`), a
branch with **no upstream**, or a non-git folder renders **nothing**. Counts are read **purely locally**
against the already-fetched remote-tracking ref — no network on any refresh tick — so they're "as of the
last `git fetch`". End-to-end this mirrors the #335 diff-line-count badge.

**What shipped** (commit [`6baa3e1`](https://github.com/ErikdeJager/ReCue/commit/6baa3e1), PR
[#90](https://github.com/ErikdeJager/ReCue/pull/90), branch `task-338-branch-ahead-behind`, 2026-07-06;
10 files, +317/−4):

- **`src-tauri/src/git.rs`:** an `AheadBehind { ahead, behind }` struct (`Serialize`, `Copy`, `Default`);
  a **pure, unit-tested** `parse_ahead_behind(&str) -> Option<AheadBehind>` (parses a single
  `<ahead>\t<behind>` line, tolerant of tab or space separators; malformed/empty → `None`); a fail-open
  `ahead_behind(cwd)` running `git rev-list --left-right --count HEAD...@{upstream}` (left = ahead, right =
  behind) — `@{upstream}` exits non-zero without an upstream, so `run_git` → `None` automatically — and a
  batch `ahead_behind_many(paths)` that **omits** no-upstream/non-git folders from the map (mirroring
  `github_web_urls`). Every git call routes through `hidden_command` (the Windows console-flash guard).
  Unit tests cover `"2\t1"`/`"0\t0"`/`"3 5"`(space)/`""`/`"garbage"`.
- **`src-tauri/src/commands.rs` + `lib.rs`:** an `async fn branch_ahead_behind(paths) ->
  HashMap<String, git::AheadBehind>` batch command running the git reads on `spawn_blocking` (#330 — off
  the webview thread, one IPC round-trip), registered in `generate_handler!`.
- **`src/types/index.ts` + `src/ipc.ts`:** an `AheadBehind` type and a `branchAheadBehind(paths)` IPC
  wrapper.
- **`src/store.ts`:** a `branchAheadBehind: Record<string, AheadBehind>` map (keyed by repo/worktree
  folder path), a `refreshBranchAheadBehind` action (full-replace so a folder that lost its upstream drops
  out, guarded by a referential-stability `aheadBehindMapsEqual`, fail-open on IPC error), and wiring
  **alongside every `refreshBranches()`** — the debounced busy→idle edge (`scheduleBranchRefresh`), the
  spawn/checkout/branch-create actions, and after `fetchFolder`/`pullFolder` (a pull also re-reads the
  branch label so ahead→0 stays honest).
- **`src/components/Sidebar/branchStatus.ts` (+ `.test.ts`):** a pure `aheadBehindBadge(counts)` returning
  `null` for undefined / in-sync `{0,0}`, else the counts — Vitest covers undefined / `{0,0}` / ahead-only
  / behind-only / both.
- **`src/components/Sidebar/Sidebar.tsx` + `.module.css`:** the `↑N ↓M` indicator rendered after the
  branch name in `RepoBranchLine` (keyed by repo) and in `WorktreeHeader` (keyed by the worktree path,
  `!compact`-gated like the `worktree` badge); a `.aheadBehind` slot (`flex-shrink:0`, muted mono, tabular
  figures) with `.ahead`/`.behind` token colors, so a long branch name ellipsizes first; plus
  `refreshBranchAheadBehind` wired into the sidebar's `reposKey` and focus/visibility refresh effects.

**Key assumptions carried over** (from `ASSUMPTIONS.md` Task 338):

- **Scope = the current/checked-out branch of each sidebar folder** (repo branch line + worktree header);
  the branch *picker* lists are **not** annotated, and a worktree with only a pending schedule (absent
  from the `branches` map) gets no badge.
- **No network fetch / staleness is deliberate:** reads only the already-fetched remote-tracking ref;
  never triggers `git fetch` on a refresh tick (a network call on every idle edge could hang/rate-limit a
  private remote in a GUI-launched process). `↓N` appears only after an app Fetch/Pull or an in-terminal
  fetch observes remote commits — counts are "as of the last fetch".
- **No Settings toggle** — ships always-on: a cheap purely-local read with no privacy surface (unlike
  #335's per-file diff read, which is gated). A reviewer could add a toggle later.
- **Map absence = "no indicator":** the batch command omits no-upstream/non-git folders; a present `{0,0}`
  is also hidden by the pure badge helper.
- **Format:** `↑`(U+2191)/`↓`(U+2193), each side only when >0; ahead green (`--status-done`), behind
  yellow (`--status-awaiting`), muted mono — on-system tokens only.

**Key files/areas touched:** `src-tauri/src/git.rs`, `commands.rs`, `lib.rs`; `src/types/index.ts`,
`src/ipc.ts`, `src/store.ts`; `src/components/Sidebar/Sidebar.tsx` + `Sidebar.module.css` + new
`branchStatus.ts`/`branchStatus.test.ts`. 10 files.

**Dependencies:** none (self-contained; reuses `run_git`/`hidden_command`, the branch-refresh cadence, and
`--status-*` tokens; end-to-end mirrors the #335 diff-line-count badge).

**Notes**

- **Cross-platform:** the only OS-sensitive primitive is the `git` shell-out, which routes through
  `hidden_command` (no console flash on Windows, no-op on macOS); rendering uses on-system CSS tokens +
  standard `↑`/`↓` glyphs, identical on macOS (WKWebView) and Windows (WebView2). Fail-open everywhere (no
  upstream / detached HEAD / non-git / any git error → no map entry, no badge, no toast) and idempotent
  (the store skips a no-op update via `aheadBehindMapsEqual`). Checks green: `cargo test` / `npm run
  lint:rust` / `npm run build` / `npm run lint` / `npm test`.

### 336. [x] Per-agent "watch" notifications — native popup when a watched agent finishes or needs input

A user can now turn on **watch** for a specific agent, and a **native OS notification** pops up the
moment that agent's turn ends (busy→idle — i.e. it finished, or is waiting for input). Notifications are
**off by default and opt-in**: watch is a **per-agent** flag toggled from two entry points (the sidebar
agent context menu and a header button on the Overview card / Canvas panel), with a global
**"Watch all agents"** setting (also default off) that notifies for every agent regardless of the
per-agent flag while retaining the per-agent values. A watched agent notifies on **every** busy→idle edge
(each finished turn), fired only from the main window so a detached canvas window never double-fires. The
per-agent flag persists across restart via `sessions.json`. This end-to-end mirrors the #297
auto-continue global+per-agent pattern and reuses the busy→idle edge that flips the `BusyIndicator` yellow.

**What shipped** (commit [`2b45a7f`](https://github.com/ErikdeJager/ReCue/commit/2b45a7f), PR
[#91](https://github.com/ErikdeJager/ReCue/pull/91), branch `task-336-watch-notifications`, 2026-07-06;
19 files (incl. lockfiles), +908/−4):

- **Notification plugin (Rust + JS + capability):** `tauri-plugin-notification = "2"` added to
  `src-tauri/Cargo.toml`, inited in `lib.rs` (`.plugin(tauri_plugin_notification::init())`),
  `"notification:default"` granted in `capabilities/default.json`, and
  `@tauri-apps/plugin-notification` added to `package.json`. Cross-platform native toasts (macOS +
  Windows) — no `#[cfg]` in ReCue code.
- **Per-session `watch` flag (Rust):** `#[serde(default)] pub watch: bool` added to `SessionRecord`
  (`store.rs`) and to every `SessionRecord { … }` struct literal across `commands.rs`/`store.rs`; a
  `Store::set_session_watch(id, watch)` persisting only on change (mirroring `set_session_auto_continue`);
  a `set_session_watch` Tauri command (`commands.rs`) registered in `lib.rs`'s `invoke_handler!`.
- **Types + IPC + store (TS):** `watch?: boolean` on `SessionRecord`/`SessionView` and `watchAllAgents:
  boolean` on `Settings` (`types/index.ts`); a `setSessionWatch(id, watch)` IPC wrapper (`ipc.ts`);
  `toSessionView` maps `record.watch ?? false`, `DEFAULT_SETTINGS.watchAllAgents = false`, and
  `setWatch(id, watch)` (optimistic local update + `void ipc.setSessionWatch`) + `toggleWatch(id)` store
  actions (`store.ts`).
- **`src/notify.ts` (new):** `notifyAgentReady(title, body)` — ensure-permission (granted → request → bail
  silently if denied) then `sendNotification`, wrapped best-effort (never throws) — and
  `ensureNotificationPermission()` used to prompt at opt-in time.
- **Fire on the busy→idle edge (`store.ts` `setBusy`):** in the existing `wasBusy && !busy` branch, when
  `IS_MAIN_WINDOW && !booting`, resolve the session, skip recurring-owned children
  (`ownedChildSessionIds`), compute `effectiveWatch = settings.watchAllAgents || session.watch`, and
  fire-and-forget `notifyAgentReady(label, "Finished or awaiting your input")`.
- **Entry points:** a Watch item (lucide `Eye`/`EyeOff`, "Watch" ↔ "Stop watching") in the sidebar
  `AgentContextMenu`; a new **reusable `WatchButton`** component (`src/components/WatchButton/`) with
  `aria-pressed` + a `pointerDown` stop-propagation guard (so it never starts the header drag, like
  `AutoContinueToggle`), inserted into the Overview `SessionCard` header actions and the Canvas agent
  panel header — both driven by the same store flag, so all three stay in sync. Toggling on also calls
  `ensureNotificationPermission()`.
- **Settings → Sessions:** a "Watch all agents" `Checkbox` bound to `watchAllAgents` (default off) with
  helper copy, requesting permission when switched on.
- **`TRAJECTORY_TO_WINDOWS.md`:** records that native notification delivery (permission prompt + toast
  rendering) needs a Windows real-box smoke check (dev builds may not surface Windows toasts until the app
  is installed / Start-Menu-registered).

**Key assumptions carried over** (from `ASSUMPTIONS.md` Task 336):

- **Mechanism = native OS notification via the Tauri `notification` plugin**, not an in-app toast (the
  value of watch is being alerted while the app is unfocused); the plugin abstracts macOS vs Windows.
- **Trigger = the existing busy→idle transition** — "finished" and "has a question" are indistinguishable
  at the monitor level, so one generic body ("Finished or awaiting your input") covers both.
- **Fires on every busy→idle transition** for an effectively-watched agent (not just the first); no
  focus-based suppression (a future refinement).
- **Effective watch = `settings.watchAllAgents || session.watch`** (both default off); the two toggle
  entry points control only the per-agent flag, and "watch all" retains per-agent values for when it's
  turned back off.
- **Permission requested at opt-in time** and re-checked before each send (silently skipped if
  denied/unavailable) — ReCue never prompts on launch, and a denied prompt never breaks the busy→idle
  path.
- **Fired only from the main window** (`IS_MAIN_WINDOW`, session events are window-global) and suppressed
  during boot-resume, so a detached canvas window / boot replay never double-fires.
- **Recurring-owned child sessions are excluded** (no watch UI, render only in the recurring surface), so
  "watch all" doesn't spam on each rotation. Clicking the notification does nothing beyond the OS default
  (no deep link — out of scope for cross-platform simplicity).
- **Reusable action shape for Task 340:** the shared `WatchButton` + `toggleWatch(id)` are the clean
  action Task 340's "…" dropdown consolidation folds in.

**Key files/areas touched:** `src-tauri/Cargo.toml`, `capabilities/default.json`, `src-tauri/src/store.rs`,
`commands.rs`, `lib.rs`; `package.json`; `src/types/index.ts`, `src/ipc.ts`, `src/store.ts`, new
`src/notify.ts`, new `src/components/WatchButton/`; `src/components/Sidebar/Sidebar.tsx`,
`Overview/Overview.tsx`, `Canvas/CanvasSurface.tsx`, `Settings/Settings.tsx`; `TRAJECTORY_TO_WINDOWS.md`.
19 files (incl. lockfiles).

**Dependencies:** none. (**Unblocks Task 340** — the "…" header-action consolidation folds in the
`WatchButton`/`toggleWatch` action.)

**Notes**

- **Cross-platform:** the only OS-divergent primitive is the notification plugin, which abstracts native
  delivery on macOS (WKWebView) and Windows (WebView2) — no new `#[cfg]` in ReCue code. Windows dev builds
  may not render toasts until the app is installed (an OS/dev limitation, flagged in
  `TRAJECTORY_TO_WINDOWS.md` for real-box verification). Additive & backward-compatible: `watch` is
  `#[serde(default)]` and `watchAllAgents` merges over `DEFAULT_SETTINGS`, so an older `sessions.json`
  upgrades cleanly. Best-effort/fail-open (permission denied/unavailable → silent no-op). Checks green:
  `cargo test` / `npm run lint:rust` / `npm run build` / `npm run lint` / `npm test`.

### 337. [x] Global search modal (⌘F / Ctrl+F) across agents, terminals & files

One keystroke — **⌘F on macOS / Ctrl+F on Windows** — now opens a **`GlobalSearch`** modal that searches
**everything** across every open folder: agents, shell terminals, file/diff/kanban viewer panels,
scheduled/recurring sessions, **files on disk** (filename **and** content across every sidebar repo), and
— best-effort — **live agent terminal output**. Results are ranked by relevance and laid out **grouped by
repo, then by item type**, with a highlighted `path:line` snippet for content/output hits. ↑/↓ move a
highlighted row and Enter (or click) activates it — jumping to an open item via the existing `selectItem`
(#79), opening a file viewer for a not-yet-open file, or selecting the agent for a terminal-output hit —
then closing the modal. The combo is swallowed even while a terminal is focused (the terminal never sees
the `f`), is main-window-only (inert in a detached canvas window), and Escape / scrim click closes.

**What shipped** (commit [`38e015a`](https://github.com/ErikdeJager/ReCue/commit/38e015a), PR
[#92](https://github.com/ErikdeJager/ReCue/pull/92), branch `global-search-modal`, 2026-07-06; 11 files,
+1454/−1):

- **`src-tauri/src/pty.rs`:** a **pure** `strip_ansi(&str) -> String` (drops CSI/OSC/lone-`ESC` escapes,
  keeps printable text + `\n`/`\t`); a **pure** `match_output_lines(text, needle_lower, per_session,
  clamp)` returning `(1-based line, ~200-char snippet)` per matching line (mirroring `files.rs`'s clamp);
  and `SessionManager::search_output(needle, per_session, total)` that snapshots each live session's
  bounded scrollback (`SCROLLBACK_CAP` ~256 KB), lossy-UTF8 + `strip_ansi` + `match_output_lines`, tagging
  hits with the session id and stopping at `total` — so scrollback bytes never reach React (per
  convention). Blank needle → empty. Unit tests cover `strip_ansi` and `match_output_lines`.
- **`src-tauri/src/commands.rs` + `lib.rs`:** a `SessionOutputMatch { id, line, snippet }` struct + a
  `search_session_output(query, limit?) -> Vec<SessionOutputMatch>` command (per-session cap 5, total
  `limit.unwrap_or(50)`) that **cannot fail** (empty vec on no-match/blank), registered in
  `invoke_handler!`.
- **`src/ipc.ts`:** a `SessionOutputMatch` interface + `searchSessionOutput(query, limit?)` wrapper (plus
  reuse of the existing `searchFiles`/`searchFileContents`).
- **`src/store.ts`:** `globalSearchOpen: boolean` state + `openGlobalSearch`/`closeGlobalSearch` actions.
- **`src/useKeyboardNav.ts`:** a ⌘F/Ctrl+F handler block (`metaKey || ctrlKey`, `!shift`, `!alt`,
  `key==="f"`) with `preventDefault` + `stopPropagation`, main-window-gated, toggling the modal and not
  stacking over `newSessionOpen`/`createPanelOpen` (mirrors the ⌘K guard).
- **`src/components/GlobalSearch/search.ts` (+ `search.test.ts`):** the pure result model
  (`SearchResult`, `ResultKind`) + `scoreTitle` (exact > prefix > word-boundary > substring, minus match
  index, short-title bonus), `scoreFilename`/content/output bases (title > filename > content > output),
  `rankAndGroup` (sort within `(repo, kind)` by score then title; repos ordered like the sidebar; kinds by
  a fixed `KIND_ORDER`), `splitHighlight` (pure version of FileTree's `renderSnippet`), and `flatOrder`
  for ↑/↓ nav. Vitest covers ranking order, grouping stability, and highlight segmentation.
- **`src/components/GlobalSearch/GlobalSearch.tsx` + `.module.css`:** the focus-trapped modal (modeled on
  `CreatePanelModal`) — autofocused input, ~180ms debounce, a monotonic `requestSeq` ref dropping stale
  async responses, a `length >= 2` gate for content/output search, per-repo/kind caps, `<mark>`-highlighted
  snippets, and activation via `selectItem` / `addOverviewPanel`→`selectItem` / agent-select; the
  ⌘F/Ctrl+F hint routes through `kbdHint`. Tokens-only styling.
- **`src/App.tsx`:** mounts `{globalSearchOpen && <GlobalSearch />}`.

**Key assumptions carried over** (from `ASSUMPTIONS.md` Task 337):

- **Terminal-output search IS included, best-effort** — server-side ANSI-strip + substring over each live
  session's retained in-memory scrollback tail (`SCROLLBACK_CAP` ~256 KB), keeping bytes off the React
  thread; **not** persisted `~/.claude/projects/*.jsonl` history; any failure degrades silently (the rest
  of search still works).
- **"Files" = both open file/diff/kanban viewer panels AND files on disk** across every sidebar repo
  (filename via `search_files` + content via `search_file_contents`), not just open viewers.
- **Searchable kinds:** agents, shell terminals, file/diff/kanban panels, scheduled + recurring sessions,
  and terminal output — matched by title/label; recurring-owned children excluded (matching Overview).
- **Main-window only** (`IS_MAIN_WINDOW`, like ⌘N/⌘K/⌘T) since results navigate the sidebar/Overview; a
  detached canvas window's ⌘F is inert.
- **Debounce ~180ms + query length ≥ 2 for content/output** (filename/title match at ≥ 1); results capped
  per repo/kind. **Ranking is a client-side heuristic** (not a fuzzy lib), grouped by repo then item type.
- **Activation reuses existing actions** — open item → `selectItem` (view-aware jump #79); not-yet-open
  file → `addOverviewPanel(repo, "markdown", file)` then `selectItem`; terminal-output hit → selects its
  agent; no new Overview↔Canvas switching beyond `selectItem`'s own.

**Key files/areas touched:** `src-tauri/src/pty.rs`, `commands.rs`, `lib.rs`; `src/ipc.ts`, `src/store.ts`,
`src/useKeyboardNav.ts`, `src/App.tsx`; new `src/components/GlobalSearch/` (component + CSS module + pure
`search.ts`/`search.test.ts`). 11 files.

**Dependencies:** none (fully additive; reuses `searchFiles`/`searchFileContents`, `selectItem`,
`addOverviewPanel`, `repoOrder`, `ownedChildSessionIds`, `kbdHint`).

**Notes**

- **Cross-platform:** all new logic is `metaKey || ctrlKey` + pure byte/string handling (no path or
  shell-outs), identical on macOS (WKWebView) and Windows (WebView2); the visible keyboard hint routes
  through `kbdHint` so it reads "Ctrl+F" on Windows. Fully additive and safe to re-run — `search_session_output`
  returns an empty vec on any no-match/blank input and never errors, so removing the ⌘F handler + modal
  mount disables the feature with no other behavioral change. Heaviest path (all-repo content search per
  keystroke) is bounded by the debounce, `length >= 2` gate, per-repo caps, and the already-bounded backend
  commands. Checks green: `cargo test` / `npm run lint:rust` / `npm run build` / `npm run lint` / `npm test`.

### 340. [x] Consolidate agent header actions (Fork / Copy resume / Watch) into a "…" menu

The three secondary agent-panel header actions — **Fork conversation**, **Copy resume command**, and the
#336 **Watch** toggle — are folded out of separate always-visible icon buttons into a single **"…"
(`MoreHorizontal`) dropdown menu**, so an agent's Overview card / Canvas panel header stays uncluttered
while all three stay one click away. The menu is a **shared `AgentHeaderMenu` component** rendered
identically at every agent-header site, and — as a net-new additive extension — it's also added to the
**Big-mode** header (agent items only), which previously had only a title + Close. `OpenViewButton`,
**Maximize** (⌘E/Ctrl+E), and **Remove/Close** stay as direct icon buttons. All the original gating is
preserved inside the menu: **Fork** is dimmed (`aria-disabled`, no-op click, `forkUnavailableReason`
tooltip) for a source with no on-disk conversation yet (#138) or a non-forkable agent (Codex/OpenCode/
Custom, #142), and **Copy resume command** is shown only when `agentSupportsResume(session.agent)`.

**What shipped** (commit [`0598c80`](https://github.com/ErikdeJager/ReCue/commit/0598c80), PR
[#93](https://github.com/ErikdeJager/ReCue/pull/93), branch `consolidate-agent-header-actions`,
2026-07-06; 6 files, +296/−122):

- **`src/components/AgentHeaderMenu/AgentHeaderMenu.tsx` + `.module.css` (new):** a self-contained "…"
  popover modeled on `ViewsPopover`/`ViewsMenu` — a `MoreHorizontal` trigger (`aria-haspopup="menu"`,
  `aria-expanded`), a `role="menu"` popover positioned per an `align` prop, outside-`mousedown` + `Escape`
  dismissal, and a root `onPointerDown` `stopPropagation` so opening it never starts the header drag.
  Three `role="menuitem"` rows: **Fork conversation** (`GitFork`, `aria-disabled={!canFork}` with the
  `forkUnavailableReason` tooltip, no-op when disabled), **Copy resume command** (`Copy`, rendered only
  when `agentSupportsResume`, copies `claude --resume <id>` with the existing toast), and **Watch / Stop
  watching** (`Eye`/`EyeOff` reflecting `session.watch`, calls `toggleWatch(session.id)` +
  `ensureNotificationPermission()`). Props: `{ session, className?, iconSize?, align? }`. Design-token CSS
  only (incl. an `.item[aria-disabled="true"]` dimmed/`not-allowed` rule).
- **`src/components/Overview/Overview.tsx`:** replaced the inline Fork + Copy-resume buttons and the #336
  standalone `WatchButton` in `SessionCard` actions with `<AgentHeaderMenu … className={styles.action}
  iconSize={15}/>` (order: OpenView, "…", Maximize, Remove); dropped the `onFork`/`onCopyResume` props +
  call-site wiring and the now-orphaned `forkSession`/`copyToClipboard` selectors and unused imports.
- **`src/components/Canvas/CanvasSurface.tsx`:** replaced the agent Fork + Copy-resume buttons and the
  standalone `WatchButton` in `.panelActions` with `<AgentHeaderMenu … className={styles.panelClose}
  iconSize={14}/>` (agent leaves only, order: OpenView, "…", Maximize, Close); removed the now-unused
  `copyToClipboard`/`forkSession` selectors + imports.
- **`src/components/BigMode/BigModeModal.tsx` + `.module.css`:** for an agent `maximizedItem`, resolves the
  session and renders `<AgentHeaderMenu … className={styles.close} iconSize={16} align="right"/>` before
  the Close button (title + Close otherwise unchanged).

**Key assumptions carried over** (from `ASSUMPTIONS.md` Task 340):

- **Exactly the three named actions move into the "…" menu** — Fork / Copy resume / Watch;
  `OpenViewButton`, Maximize (⌘E/Ctrl+E), and Remove/Close **stay direct** (primary affordances / a
  keyboard-shortcut action); the `AutoContinueToggle` strip is untouched.
- **Menu primitive reused, not new:** a shared `AgentHeaderMenu` modeled on `ViewsPopover`/`ViewsMenu`
  (render-prop-style popover host, outside-click + Escape dismissal, pointerdown-stopped), `MoreHorizontal`
  trigger — no refactor of `ViewsPopover`.
- **Big mode included as a net-new additive extension** (agent items only) for cross-site consistency;
  flagged droppable. Minor accepted wrinkle: Escape while the popover is open also closes Big mode (both
  window-level listeners).
- **Watch is folded in as a menu row, superseding #336's standalone `WatchButton` in the headers** (reusing
  336's `toggleWatch` + `ensureNotificationPermission`); the `WatchButton` component file is left in place
  as harmless dead code (deletion out of scope).
- **Sidebar `AgentContextMenu` explicitly left unchanged** (already a right-click dropdown, not a header).
- **Per-site trigger styling via a `className` prop** (Overview `styles.action`/15, Canvas
  `styles.panelClose`/14, Big mode `styles.close`/16); behavior/items identical.

**Key files/areas touched:** new `src/components/AgentHeaderMenu/` (`.tsx` + `.module.css`);
`src/components/Overview/Overview.tsx`, `src/components/Canvas/CanvasSurface.tsx`,
`src/components/BigMode/BigModeModal.tsx` (+ `.module.css`). 6 files. Frontend-only — no Rust/IPC/
persistence changes, no new keyboard shortcuts.

**Dependencies:** Task 336 (consumes its `session.watch`, `toggleWatch(id)`, and
`src/notify.ts` `ensureNotificationPermission`, and supersedes its header `WatchButton`).

**Notes**

- **Cross-platform:** identical on macOS and Windows — the resume command is the literal
  `claude --resume <id>` on both, the menu adds no keyboard shortcuts (so no `kbdHint`/`revealLabel`
  routing needed; the untouched Maximize button keeps its `kbdHint` tooltip), Escape uses
  `event.key === "Escape"`, and styling is design-tokens only. No Rust / `#[cfg]` changes. Purely additive
  and reversible. Checks green: `npm run build` / `npm run lint` / `npm test`.

### 342. [x] Note that Dark mode is the recommended theme in Settings → Appearance

A small, muted helper line — **"Dark mode is the recommended experience."** — now sits directly under
the Dark/Light theme toggle in **Settings → Appearance**, gently steering users toward the more polished
Dark theme (Light being the newer, less-refined option). Pure copy/UX hint: **no behavior change**, no
new setting, no persistence — the line is **always visible** regardless of which theme is currently
selected.

**What shipped** (commit [`c36ac3c`](https://github.com/ErikdeJager/ReCue/commit/c36ac3c), PR
[#94](https://github.com/ErikdeJager/ReCue/pull/94), branch `note-dark-mode-recommended-theme`,
2026-07-06; 1 file, +3):

- **`src/components/Settings/Settings.tsx`:** inside the Appearance section's existing Theme `.field`
  wrapper, immediately after the `.segmented` Dark/Light toggle group and before the `.field`'s closing
  tag, added `<p className={styles.helpText}>Dark mode is the recommended experience.</p>`. The `.field`
  wrapper is `flex-direction:column`, so the line stacks under the toggle with the wrapper's consistent
  gap.

**Key assumptions carried over** (from `ASSUMPTIONS.md` Task 342):

- **Exact wording** chosen as **"Dark mode is the recommended experience."** — short, neutral, names no
  platform and carries no keyboard shortcut (so no `kbdHint`/`revealLabel` routing; pure WebView copy,
  identical on macOS and Windows).
- **Always visible** (static hint), not conditional on the current selection — simplest, and communicates
  the recommendation regardless of which theme is active.
- **Reused the established `.helpText` class** (`color: var(--text-muted); font-size: var(--fs-meta-sm);
  line-height:1.4`, from #162) already used for muted description lines elsewhere in the same modal — **no
  new CSS class**. Because `--text-muted` is theme-aware in `tokens.css` (Overlay0 in dark, Overlay1 in
  light), the hint reads correctly and legibly in both themes.
- **No test file** — copy-only change with no pure logic to unit-test; verification is `npm run build` /
  `npm run lint` / `npm run format:check` plus a `tauri dev` smoke check.

**Dependencies:** none. (Kept scoped to the single Theme `.field` so the concurrent light-mode theming
overhaul card — Task 343 — merges trivially; this card does not depend on it.)

**Notes**

- **Cross-platform:** identical on macOS and Windows — a single static `<p>` reusing an existing class and
  a theme-aware token, no OS-specific primitive, no Rust/IPC/persistence changes. Extremely low risk;
  rollback is deleting the one line.

### 341. [x] Kanban card editor: auto-continue `-` bullet lists on Shift+Enter

Editing or composing a Kanban card now does **smart list continuation**: pressing **Shift+Enter** while
the current line is a `-` bullet auto-inserts a fresh `- ` prefix so the list keeps going, and pressing
Shift+Enter on an **empty** bullet terminates the list instead (the blank `- ` is removed, caret lands on
the now-plain line). It handles `-` **task-list** items (`- [ ] `/`- [x] `, continuing as a fresh
**unchecked** box), **preserves leading indentation**, **splits** mid-line text (the part right of the
caret becomes the new bullet's content), and **replaces** a non-collapsed selection before continuing. In
this editor plain **Enter still commits/adds the card** and **Escape still cancels** — only Shift+Enter
gained the behavior, and a non-bullet Shift+Enter still inserts a plain newline unchanged.

**What shipped** (commit [`291aa52`](https://github.com/ErikdeJager/ReCue/commit/291aa52), PR
[#95](https://github.com/ErikdeJager/ReCue/pull/95), branch `kanban-smart-list-continuation`,
2026-07-06; 3 files, +139/−3):

- **`src/components/Kanban/smartList.ts` (new):** a pure, DOM-free, dependency-free
  `applySmartNewline(value, selStart, selEnd) → { value, caret } | null`. Finds the current line via
  `lastIndexOf("\n", start-1)+1` / `indexOf("\n", start)`, matches the bullet with
  `/^([ \t]*)- (\[[ xX]\] )?/`; returns `null` for a non-bullet line (so the caller lets the native
  newline happen), drops the line for an empty bullet (terminate), else splices in
  `"\n" + indent + "- " + (task ? "[ ] " : "")` and reports the new caret. LF-only (the editor state is
  already normalized).
- **`src/components/Kanban/smartList.test.ts` (new):** Vitest coverage for every acceptance case —
  continue, empty-terminate, indent preserved, task-list continue (incl. checked→unchecked), mid-line
  split, selection-replace, non-bullet → `null`, bare `-` → `null`.
- **`src/components/Kanban/KanbanPanel.tsx`:** imports `flushSync` (react-dom) + `applySmartNewline`, adds
  a module-level `handleSmartBulletKey(e, setValue)` that (on Shift+Enter over a bullet) `preventDefault`s,
  computes `{value, caret}`, pushes it through the existing setter with **`flushSync`**, then restores the
  caret via `setSelectionRange` on the captured element — and calls it first in the two card-composition
  textareas' `onKeyDown` (edit-existing-card → `onEditTextChange`, add-card composer → `setComposerText`).

**Key assumptions carried over** (from `ASSUMPTIONS.md` Task 341):

- **Fires on Shift+Enter only** — in the Kanban card editor plain **Enter commits** the card (never a
  newline) and **Shift+Enter is the newline key**, matching the card's "shift+enter" wording; plain
  Enter/Escape are untouched.
- **Both card-composition textareas in scope** — editing an existing card **and** the Add-card composer
  (both compose a card's title+body identically). The board **Raw**-view textarea and the FileViewer
  raw-markdown textarea are **out of scope** (separate whole-file markdown surfaces).
- **`-` marker only** (dash), matching the card and the Kanban convention; `*`/`+`/ordered lists are out
  of scope, but the marker regex is centralized in the pure helper so a follow-up can extend it in one
  place. **Task-list items are in scope** and continue as a fresh **unchecked** `- [ ] `.
- **Empty bullet terminates** (no second empty bullet), **indentation preserved**, caret-based **mid-line
  split** and **selection-replace**. The title line isn't special-cased (line-based helper; harmless).
- **Controlled-textarea technique:** `flushSync` commits the new controlled value to the DOM node before
  `setSelectionRange` restores the caret (no flicker); guarded by `isComposing` for IME safety.

**Dependencies:** none (self-contained UI work on the existing Kanban card editor; no engine/CSS/backend
change).

**Notes**

- **Cross-platform:** pure WebView string logic on **Shift+Enter** — no `Cmd`/`Ctrl` chord and no
  native/path/shell code, so it is byte-for-byte identical on macOS (WKWebView) and Windows (WebView2).
  The board `.md` still round-trips through the unchanged `parseBoard`/`serializeBoard`. Checks green:
  `npm test` / `npm run build` / `npm run lint`.

### 344. [x] Sidebar agent rows: overlap diff-line counts and the × in one hover-swapped trailing slot

Each sidebar **agent row** now renders the #335 green/red added/removed line counts and the #57 ×
(remove) button in **one shared trailing slot**, layered instead of side-by-side. At rest the `+N` / `−N`
counts show; on row hover they go `visibility:hidden` (keeping their box, so the slot width is preserved)
and the absolutely-positioned × fades in **over the exact same spot** — a true swap with **zero layout
shift**, reclaiming the ~24px the always-reserved empty × slot used to take from the agent name at rest.
A clean/no-diff row (or the setting off) is unchanged — the slot's `min-width:24px` still reserves the ×
(nothing at rest, × on hover).

**What shipped** (commit [`c1a69d3`](https://github.com/ErikdeJager/ReCue/commit/c1a69d3), PR
[#96](https://github.com/ErikdeJager/ReCue/pull/96), branch `overlap-diff-counts-remove-slot`,
2026-07-06; 2 files, +62/−35):

- **`src/components/Sidebar/Sidebar.tsx` (`SessionRow`):** wrapped the existing diff-count badge span
  (unchanged conditional `{!editing && badge && …}`, `aria-label`, `diffAdd`/`diffDel` spans) and the ×
  button (unchanged `onClick={onRemove}`, `title`, `aria-label`, Lucide `<X size={14}>`) in a single new
  `<span className={styles.trailing}>`. No logic/state change; the `AgentContextMenu` block stays a direct
  child of `.row` after the wrapper.
- **`src/components/Sidebar/Sidebar.module.css`:** new `.trailing` slot
  (`position:relative; flex-shrink:0; min-width:24px; margin-right:var(--space-4)`) — the counts are its
  only in-flow child (they define the slot width, clamped to the ×'s 24px); `.remove` became
  `position:absolute; right:0; top:50%; translateY(-50%)` (out of flow, contributes no width) with
  `pointer-events:none` at rest → `pointer-events:auto` on `.row:hover` so the invisible × can't intercept
  a click over the counts; `.diffCounts` dropped its own `flex-shrink`/`padding-right` (the wrapper owns
  spacing); and `.row:hover .diffCounts` switched from `display:none` to `visibility:hidden` to keep the
  slot width stable on hover. `.diffAdd`/`.diffDel` colors (`--status-done`/`--status-error`) unchanged.

**Key assumptions carried over** (from `ASSUMPTIONS.md` Task 344):

- **No-diff / clean rows match today exactly** — nothing at rest, × on hover; `.trailing`'s
  `min-width:24px` keeps the ×'s slot reserved.
- **Agent-rows-only scope** — `.row`/`.remove`/`.diffCounts`/`.diffAdd`/`.diffDel` are used **only** by
  `SessionRow`; non-agent rows (file/diff/terminal/scheduled/recurring, using `.fileClose`/
  `.scheduleCancel`) and the collapsed rail (`.railDot*`) are untouched.
- **Pure-CSS swap, no hover React state** — the counts keep their conditional render; the swap is the
  `display:none → visibility:hidden` change plus the absolute-overlay ×. Because the counts stay
  `visibility:hidden` (box preserved) on hover, the slot — and the agent name width — never reflows.
- **`pointer-events` guard** — the overlapping invisible × can't fire a click over the counts at rest;
  the `<button>`'s keyboard focusability is unchanged. Counts stay non-interactive (they simply yield the
  slot to the × on hover).

**Dependencies:** none (builds on the already-shipped #335 sidebar diff counts + the #57 row × button;
independent of the concurrent Task 343 light-mode work — reuses existing tokens, introduces no new color).

**Notes**

- **Cross-platform:** pure CSS/DOM hover swap using existing tokens (`--status-done`, `--status-error`,
  `--text-muted`, `--radius-chip`, `--space-*`, `--dur-fast`, `--ease-out`) — no `color-mix`, no
  `-webkit`-only effect, no native/path/shell/Rust code. `position:absolute` + `opacity`/`visibility`/
  `pointer-events` render identically on WKWebView (macOS) and WebView2/Chromium (Windows). Presentational
  and reversible (revert the two files to restore the side-by-side slots). Checks green: `npm run build` /
  `npm run lint` / `npm run format:check` / `npm test`.

### 343. [x] Fix and polish Light-mode theming (readable text, light surfaces, darker accent, light busy sheen; Dark unchanged)

The Light theme (Catppuccin Latte, #333) was largely unusable — dark-on-dark text, black content
surfaces (Kanban board, rendered markdown, code/diff views, Canvas panels), a too-bright accent, and a
busy dot whose sweep flashed a **dark ("black") band**. This task made Light actually usable while leaving
the **Dark theme byte-for-byte unchanged**. The whole fix is token-first: the four root causes were
(a) 9 non-terminal surfaces reused the intentionally-dark `--terminal-bg`, (b) the busy sheen swept
`--text-primary` (which is *dark* in Latte), (c) low-contrast Latte `--text-muted`/`--text-secondary`, and
(d) a too-bright default accent. Fixed by two new **theme-flip alias tokens** whose base value equals the
token they replace (so Dark is provably identical), Latte-block value edits, and **one** Light-only
per-component override for the Overview inter-agent separator.

**What shipped** (commit [`843652f`](https://github.com/ErikdeJager/ReCue/commit/843652f), PR
[#97](https://github.com/ErikdeJager/ReCue/pull/97), branch `fix-light-mode-theming`, 2026-07-06;
6 files, +42/−18):

- **`src/styles/tokens.css`:** added two alias tokens to the base `:root` (Dark) block —
  `--content-bg: var(--terminal-bg)` (== #11111b in Dark) and `--busy-sheen: var(--text-primary)`
  (== #cdd6f4 in Dark) — **no existing base value touched**. In the Latte `:root[data-theme="light"]`
  block: flipped `--content-bg: #dce0e8` (light sunken well, ~4.6:1 for #5c5f77 text) and
  `--busy-sheen: #eff1f5` (near-white glint); darkened text `--text-secondary #6c6f85→#5c5f77` (~5:1) and
  `--text-muted #8c8fa1→#6c6f85` (~4:1, keeping the primary>secondary>muted hierarchy); and darkened the
  **default** accent `--accent #fe640b→#e05a0a`, `--accent-hover #ff7a30→#f56b17`, `--accent-dim` alpha
  updated (`--accent-fg` kept `#ffffff`).
- **Swapped 9 non-terminal surfaces `--terminal-bg → --content-bg`** (each resolves to the same dark
  color, so Dark is identical): `FileViewer.module.css` `.message`/`.raw`/`.editor`/`.markdown`/
  `.codeGutterWrap`/`.diffGutter`, `Canvas.module.css` `.panel`, `Overview.module.css` `.placeholder`,
  `KanbanPanel.module.css` `.rawEditor`. The **real terminal** (`Terminal.module.css .wrapper`) keeps
  `--terminal-bg` and stays dark.
- **`BusyIndicator.module.css`:** the `.busy::after` sheen `color-mix` input `--text-primary → --busy-sheen`
  (no new `color-mix` introduced), so the glint stays light in Latte.
- **`Overview.module.css`:** the one per-component override —
  `:global([data-theme="light"]) .card { border-right-color: #acb0be }` + `.cardGroupStart`
  `border-left-color` (Latte Surface2) — giving adjacent agent columns an opaque light-slate separator
  (a translucent hairline vanishes against abutting dark terminal bodies).

**Key assumptions carried over** (from `ASSUMPTIONS.md` Task 343):

- **"Kanban background is black" → the Canvas panel backdrop / Raw editor**, not the board itself (the
  Board view has no bg of its own; Overview-mounted boards already inherit a light bg). Fixed via
  `.panel` + `.rawEditor` `--content-bg`.
- **"Borders between agents are black" → dark panel boxes**, primarily fixed by the `--content-bg` flip;
  the light-slate Overview separator is the only additional per-component override.
- **Clean-CSS convention:** token-layer first; the two new tokens are **aliases** (base == replaced token
  → Dark unchanged); the sole per-component override is `:global([data-theme="light"]) .localClass`,
  mirroring the existing `:global(body.reduce-motion)` pattern.
- **Contrast targets:** muted deliberately lands ~4:1 (not full 4.5:1) to preserve the
  primary>secondary>muted hierarchy; `--text-primary` unchanged (~6:1).
- **"Slightly darker" accent quantified** as ~11% darker peach; flagged as tunable. **Custom accent still
  wins** — it writes `--accent`/`-hover`/`-dim`/`-fg` **inline on `<html>`** (higher specificity than
  `:root[data-theme="light"]`), so editing the Latte default accent doesn't override it.
- **Dark-unchanged guarantee** enforced via the `git diff tokens.css` audit (base block gains only two
  alias lines; every component swap resolves to the same dark color; the terminal + xterm theme +
  `--terminal-*` Latte non-override untouched). No unit-test changes (`accentCompanions` untouched).

**Dependencies:** none. (Concurrent with Task 344, which deliberately reused existing tokens to avoid
colliding with this light-mode work.)

**Notes**

- **Cross-platform:** all edits are plain hex/`var()` values or a swap of an **already-shipping**
  `color-mix` input — **no new `color-mix()`** and no `-webkit`-only effect, so no new plain-color
  fallback is needed and rendering is identical on WKWebView (macOS) and WebView2/Chromium (Windows).
  CSS-token work only — no TS/Rust, fully idempotent and reversible. Checks green: `npm run build` /
  `npm run lint` / `npm run format:check` / `npm test`.

### 345. [x] Linux support (Arch/Ubuntu/Mint fully, best-effort others) — `xdg-open`/file-manager reveal, Ctrl-form kbd hints, `$SHELL` fallback, ubuntu-22.04 AppImage CI leg

ReCue now builds, tests, **and runs** on **Linux** alongside macOS and Windows — targeting **Arch,
Ubuntu, and Mint fully, best-effort for other distros** (#345). The codebase was already ~90%
Linux-ready: most per-OS divergence uses `#[cfg(unix)]` / `#[cfg(not(windows))]` arms Linux inherits,
the frontend keyboard handling is `metaKey || ctrlKey`, and the Linux WebView is Chromium (WebKitGTK)
so every `-webkit-scrollbar` / `color-mix` CSS choice carries over unchanged. The port was a small set
of **targeted fixes** where a "not-Windows"/`cfg(unix)` arm secretly assumed *macOS* (the macOS `open`
binary, `open -R`, ⌘ glyphs), plus the CI/bundle and docs. **macOS and Windows behavior is unchanged.**

**What shipped** (branch `feat/linux`, PR [#98](https://github.com/ErikdeJager/ReCue/pull/98),
2026-07-07):

- **`src-tauri/src/commands.rs`** — `os_open` (backs `open_data_folder` + `reveal_path`) split its
  non-Windows arm into a macOS `open` arm and a `#[cfg(not(any(macos, windows)))]` → **`xdg-open`** arm.
  `reveal_file_in_finder` gained an `#[cfg(all(unix, not(target_os = "macos")))]` arm →
  **`reveal_file_linux`**, a best-effort file-manager **select** via the FreeDesktop
  `org.freedesktop.FileManager1.ShowItems` D-Bus method (`dbus-send`), falling back to `xdg-open` on the
  file's parent directory when there is no FileManager1 provider. `reveal_file_linux`'s `cfg` is widened
  with `, test)` (+ `allow(dead_code)` under `test`) so the macOS host still type-checks it (mirroring
  the existing `explorer_select_arg` `any(windows, test)` pattern).
- **`src-tauri/src/pty.rs`** — `default_shell` now keeps macOS's `$SHELL` else `/bin/zsh` byte-for-byte
  and delegates Linux/BSD to a new `test`-widened `non_macos_unix_shell` (`$SHELL` else first existing
  of `/bin/bash`, `/bin/sh` — `/bin/zsh` is not a safe Linux default). New unit test
  `non_macos_unix_shell_is_never_empty`.
- **`src-tauri/src/path_env.rs`** — no code change (the login-shell PATH probe is `#[cfg(unix)]` and
  already runs on Linux, restoring the user's real PATH for a `.desktop`/AppImage launch); clarified the
  module + `restore_user_path` doc comments (were "macOS").
- **`src/platform.ts`** + **`src/platform.test.ts`** — added `isLinux(platform)`; `kbdHint` now returns
  the **Ctrl**-form on Windows **and Linux** (⌘ only on macOS) and `revealLabel` returns **"Reveal in
  File Manager"** on Linux. One-file change fixes all ~50 `kbdHint` and 9 `revealLabel` call sites (they
  thread the `platform` signal). Added Linux test cases.
- **`.github/workflows/release.yml`** — added a third release-matrix leg **`ubuntu-22.04`** with
  `args: --bundles appimage` and an apt step installing the Tauri 2 / AppImage toolchain
  (`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`,
  `build-essential`, `curl wget file`, `libssl-dev`, `patchelf`). The macOS-only signing/DMG steps are
  already `matrix.platform == 'macos-latest'`-guarded, so they skip on Linux. tauri-action minisign-signs
  the AppImage like the other legs and merges a `linux-x86_64` entry into `latest.json` → the **AppImage
  self-updates**; the leg runs last (serialized `max-parallel: 1`) so the merge appends after darwin +
  windows.
- **Docs** — `CLAUDE.md` (the "⚠️ Cross-platform is a hard requirement" section + stack/seams/build
  notes now say **macOS, Windows, and Linux** and document the Linux arms), `README.md` (prerequisites,
  Linux AppImage artifact, 3-OS pipeline), and a new **`TRAJECTORY_TO_LINUX.md`** (the running log of
  Linux parity work + a "needs real-box verification" checklist).

**Key decisions** (confirmed with the maintainer):

- **AppImage only** — one universal binary runs on Arch/Ubuntu/Mint & others; no `.deb`/`.rpm`, no AUR
  PKGBUILD. CI builds AppImage-only via `--bundles appimage` (leaving `tauri.conf.json`
  `bundle.targets: "all"` so macOS/Windows are undisturbed and a local `tauri build` still emits all
  Linux formats for dev).
- **ubuntu-22.04** CI base — broadest glibc/webkit2gtk-4.1 floor (runs on Ubuntu 22.04+, Mint 21 **and**
  22, current Arch).
- **AppImage self-updates** through the existing minisign updater (`linux-x86_64` in `latest.json`);
  no version bump / no patch-notes file in this PR (releases are batched by the maintainer).

**Dependencies:** none (additive Linux arms + a CI leg + docs; no change to macOS or Windows behavior).

**Notes**

- **Cross-platform:** every genuine divergence stays `#[cfg]`-gated (Rust) or branched on the `platform`
  signal (frontend), with all arms provided; the macOS arm is byte-for-byte unchanged and the Windows
  arm untouched, the Linux arm is additive. Because the macOS build host can't compile a Linux-only arm,
  Linux-only helpers (`reveal_file_linux`, `non_macos_unix_shell`) widen their `cfg` with `, test)` so
  `cargo clippy --all-targets -- -D warnings` and `cargo test` type-check + exercise them on the host.
  Checks green on macOS: `npm run build` / `npm run lint` / `npm test` (platform Linux cases) /
  `cargo test` (180 pass, incl. the new shell test) / `cargo clippy --all-targets -- -D warnings` /
  `cargo fmt --check` (touched files clean). GUI/AppImage/D-Bus paths that can't be unit-tested are
  logged for real-box verification in **`TRAJECTORY_TO_LINUX.md`**.

### 346. [x] Linux performance — WebKitGTK DMABUF env workaround, software-WebGL → DOM-renderer fallback, coalesced output emits, base64 scrollback replay

ReCue on Arch Linux (release AppImage, Wayland, across NVIDIA/AMD/Intel machines) was extremely slow —
laggy terminal input echo, slow display updates, slow agent boot/spawn — while macOS and Windows were
fine (#346). Investigation across the backend PTY pipeline, the frontend rendering path, and the
Linux/WebKitGTK configuration found four compounding causes; all four are fixed — the Linux-specific
ones cfg-/platform-gated, the platform-neutral ones provably order/content-preserving. **macOS and
Windows behavior is unchanged.**

**What shipped** (branch `fiz/linux-oprimization`, PR [#99](https://github.com/ErikdeJager/ReCue/pull/99),
2026-07-08):

- **`src-tauri/src/linux_webkit.rs`** (new) + **`src-tauri/src/lib.rs`** — the WebKitGTK DMA-BUF
  workaround: `apply_webkit_env_workarounds()` runs at the top of `run()` (before `tauri::Builder`/GTK
  init and before any threads, next to `path_env::restore_user_path()`) and sets
  `WEBKIT_DISABLE_DMABUF_RENDERER=1` **only** when the NVIDIA proprietary driver
  (`/proc/driver/nvidia/version` / `/sys/module/nvidia`) or a VM (`/sys/hypervisor/type`, DMI
  product/vendor strings) is detected — on NVIDIA/VMs WebKitGTK's DMA-BUF renderer is the classic
  "Tauri app is unusably slow on Linux" failure, dragging the whole webview down. A user-set
  `WEBKIT_DISABLE_DMABUF_RENDERER` is always respected; `RECUE_DISABLE_DMABUF=1|0` force-overrides both
  ways; healthy AMD/Intel Mesa stacks keep the (faster) DMA-BUF path. `WEBKIT_DISABLE_COMPOSITING_MODE`
  is never auto-set (`RECUE_DISABLE_COMPOSITING=1` is a debug opt-in). The pure decision core
  (`should_disable_dmabuf` / `parse_force_flag` / `is_vm_product_name`) is cfg-widened with `, test)`
  (the `reveal_file_linux` precedent) and fully unit-tested on every host; only the thin fs-probe +
  `set_var` shell is Linux-only (edition-2021 `set_var` is safe; the 2024 caveat is flagged in-code).
- **`src/components/Terminal/webglRenderer.ts`** (new, pure + vitest suite) +
  **`src/components/Terminal/terminalPool.ts`** — the software-WebGL fallback: WebKitGTK can hand
  xterm's WebGL addon a context that "works" but is software-rasterized (llvmpipe/SwiftShader), so
  every terminal frame rendered on the CPU. The pool now probes the WebGL renderer string **once per
  app** (memoized; Linux only — macOS/Windows short-circuit to `true` and never construct the probe
  canvas) and skips the `WebglAddon` when `isSoftwareWebGLRenderer` matches, so xterm uses its DOM
  renderer (the #105 detached-window fallback — faster than software GL). Unknown/empty renderer
  strings keep WebGL (only skip when we *know* it's software).
- **`src/store.ts`** — `init()` now loads the `platform` (+ `windowsBuild`) signal **before** the first
  `refresh()`, so the platform is always known before any terminal host is created — closing the latent
  race for the new Linux probe **and** for Windows' `windowsPtyOption` (both read it at host-creation
  time). Platform-neutral: same reads, earlier.
- **`src-tauri/src/commands.rs`** + **`src/types/index.ts`** + **`terminalPool.ts`** — base64 scrollback
  replay: `ScrollbackReply` now carries `b64: String` (via the #261 `encode_output`) instead of
  `bytes: Vec<u8>`, which serde serialized as a JSON integer array — ~1 MB+ of JSON parsed on **every**
  terminal mount (an agent wall of N terminals paid N of those at boot). The pool decodes with the
  existing `decodeOutputB64`. New serde round-trip test. Platform-neutral win for all three OSes.
- **`src-tauri/src/pty.rs`** + **`src-tauri/src/lib.rs`** — coalesced output emits: the event-forwarder
  thread now drains whatever is queued after each blocking `recv` (`try_recv`, zero added latency for a
  lone event; `MAX_EVENT_DRAIN` 512 bounds a pass) and merges **consecutive contiguous same-session**
  `Output` runs via the new pure `pty::coalesce_output_events` (cap `COALESCE_MAX_BYTES` = 256 KB =
  `SCROLLBACK_CAP`), collapsing claude's TUI repaint storms from hundreds of per-8 KB emits/sec — each
  an evaluate-JS on the webview main thread, costliest on Linux/WebKitGTK — into a few. The
  **contiguity guard** (next chunk's start == run's end) keeps the frontend's
  `start = offset - bytes.length` dedupe math exact and splits across a Restart (a respawn under the
  same id resets the fresh `Scrollback` total to 0 — a naive merge would corrupt the replay dedupe);
  non-Output events are never reordered (a session's `Exited` still emits strictly after its final
  `Output`). 8 new unit tests incl. the Restart hazard, ordering across `Exited`, and the size cap.
- **Docs** — `TRAJECTORY_TO_LINUX.md` gained a "Performance (Task #346)" section (symptoms, fixes,
  env-var policy) + a "Needs real-box verification (performance)" checklist (per-GPU DMABUF behavior,
  llvmpipe fallback, AppImage under load); `CLAUDE.md` documents the four fixes in the Linux build note.

**Key decisions**

- **Detection-based, not unconditional**: the user's fleet spans NVIDIA/AMD/Intel, so
  `WEBKIT_DISABLE_DMABUF_RENDERER=1` is set only on the known-bad stacks (NVIDIA proprietary / VM) —
  blanket-disabling would cost performance on healthy Mesa. User env always wins; `RECUE_*` overrides
  exist for support.
- **Deliberately untouched** (future work, logged in the trajectory): the login-shell PATH probe's boot
  cost (≤3 s worst case), per-keystroke `write_stdin` invokes (batching adds latency by definition),
  Overview terminal virtualization, `[profile.release]` tuning.
- No version bump / patch-notes file (releases are batched by the maintainer).

**Dependencies:** 345 (the Linux port this optimizes).

**Notes**

- Checks green on macOS: `cargo test` (196 pass, incl. the new coalescer / env-policy / scrollback
  tests), `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`, `cargo llvm-cov` logic
  surface 87.6% lines (`linux_webkit.rs` 97.9%), `npm test` (664 pass / 46 files), frontend coverage
  90.5% lines, `npm run build` / `lint` / `format:check`.
- The per-GPU runtime behavior (DMABUF auto-set on NVIDIA, left alone on AMD/Intel, llvmpipe → DOM
  renderer, AppImage under a busy TUI) can't be exercised on CI — walked via the
  `TRAJECTORY_TO_LINUX.md` checklist on real boxes.

### 349. [x] Linux: native file dialogs follow ReCue's own theme (fix the always-white Adwaita dialogs in the AppImage)

In the shipped **AppImage** every native dialog — the folder picker ("Choose a working directory"), the
open-file dialog (FileSwitcher → Browse…) and the save dialog (template export) — rendered white/light
Adwaita no matter the desktop's theme or ReCue's own Dark/Light setting (#333), so a dark-desktop user in
a dark app got a blinding white dialog. Three facts stack up: (1) Tauri's AppImage bundler injects the
vendored `linuxdeploy-plugin-gtk.sh` AppRun hook, which bundles GTK and then **forces `GTK_THEME`** for
the whole process, picking the variant by grepping the *system theme name* for the substring `dark` — so
`catppuccin-mocha-yellow-standard+default` (and any `color-scheme: prefer-dark` setup whose theme name
lacks "dark") falls through to `GTK_THEME=Adwaita:light`; (2) `tauri-plugin-dialog` (2.7.1) resolves to
rfd's **in-process GTK3** backend on Linux (`Cargo.lock`: `rfd 0.16` + `gtk-sys 0.18`, **no `ashpd`**), so
every dialog is a GTK3 widget created inside our process and themed by that polluted env; (3) GTK3's
`get_theme_name()` gives **`GTK_THEME` absolute precedence** — `gtk-theme-name` /
`gtk-application-prefer-dark-theme` are not even read when it is set, which is why tao's
`Window::set_theme` cannot fix it. The env itself must be corrected, **before GTK initializes**.
**macOS and Windows are byte-for-byte unchanged** (no env write, no file read).

**What shipped** (branch `linux-gtk-dialog-theme`, PR [#101](https://github.com/ErikdeJager/ReCue/pull/101),
2026-07-14):

- **`src-tauri/src/linux_gtk.rs`** (new, mirroring `linux_webkit.rs`'s shape) — `apply_gtk_theme_env()`
  builds a `GtkThemeProbe` from the environment + the persisted store and exports `GTK_THEME`. The pure,
  unit-tested `gtk_theme_env` policy, in order: **(1)** `RECUE_GTK_THEME=<literal GTK_THEME value>` forces
  the value **everywhere** (the support escape hatch — and the way to smoke-test this in `tauri dev`
  without building an AppImage; a blank/whitespace value is treated as unset); **(2)** not in an AppImage
  (`$APPIMAGE`/`$APPDIR` unset — a dev run, `.deb`, or distro package) → leave `GTK_THEME` untouched, since
  the desktop's real GTK theme already applies and forcing Adwaita would be a downgrade; **(3)**
  `APPIMAGE_GTK_THEME` set → leave it alone (the hook already copied the user's explicit choice verbatim —
  ReCue never clobbers it); **(4)** otherwise pick the **Adwaita** variant — the family the AppImage
  actually bundles and the only one guaranteed to render against the bundled GTK — from ReCue's own
  `settings.theme`: `light` (case-insensitive, trimmed) → `Adwaita:light`, everything else including a
  fresh install with no persisted settings → `Adwaita:dark` (matching `DEFAULT_SETTINGS.theme = "dark"`).
  One `[recue] GTK: set GTK_THEME=… (was …; recue theme: …)` log line on the write.
- **Reading the theme before Tauri exists** — the `Store` is only constructed in `.setup()`, i.e. *after*
  GTK init, so the module reads `settings.theme` straight out of `sessions.json` itself: read-only and
  **fail-open** (`theme_from_store_json` returns `None` for malformed JSON, a missing/`null` `settings`, a
  missing or non-string `theme` → dark, which is the default theme anyway). `store_path()` re-derives
  Tauri's Linux `app_data_dir()` rule (`$XDG_DATA_HOME` when absolute, else `path_env::home_dir()` +
  `.local/share`, joined with the identifier), reusing the shared `home_dir()` seam rather than reading
  `$HOME`. A **drift-guard test** parses `tauri.conf.json` via `include_str!` and asserts its `identifier`
  still equals the hardcoded `com.recue.app`, so the hand-derived path can't silently rot.
- **`src-tauri/src/lib.rs`** — `mod linux_gtk;` + one call in `run()`, immediately after
  `linux_webkit::apply_webkit_env_workarounds()` and before `tauri::Builder` — i.e. before GTK init **and**
  before any thread spawns (env mutation isn't thread-safe; `set_var` is `unsafe` in Rust 2024 for exactly
  that reason), joining the existing pre-GTK env writes.
- **`src/components/Settings/Settings.tsx`** — a Linux-only (`isLinux(platform)`) sentence appended to the
  existing Theme help text: native file dialogs adopt the theme the next time ReCue starts. Absent on
  macOS/Windows; no new CSS, store state, or component.
- **Docs** — `TRAJECTORY_TO_LINUX.md` gained a dated `### Native GTK dialogs were always light (Task #349)`
  entry (bug / fix / rejected options / real-box checklist); `README.md`'s Linux build section gained a
  one-line override note (`APPIMAGE_GTK_THEME=Adwaita:dark`, or `RECUE_GTK_THEME=<gtk theme>`).

**Key decisions**

- **Fix the env, don't swap the backend.** The **`xdg-portal`** feature of `tauri-plugin-dialog` was
  rejected and kept only as the *documented fallback*: it hard-requires a running `xdg-desktop-portal` +
  backend, and rfd has no GTK fallback when built with it — on a minimal/wlroots box the dialogs would stop
  working **entirely**, turning a cosmetic bug into "cannot open a folder" (unacceptable for the
  best-effort-other-distros promise). It also follows the *system* theme, so a light-desktop + dark-ReCue
  user would still mismatch. Also rejected: **unsetting `GTK_THEME`** (the user's real theme may not exist
  under the AppImage's `XDG_DATA_DIRS` or render against the *bundled* GTK — precisely why the hook forces
  Adwaita; it would trade a white dialog for a possibly-broken one) and **runtime tao `set_theme`** (needs a
  direct `gtk` dep and is a no-op while `GTK_THEME` is set — fact 3).
- **The variant follows ReCue's own theme, not the system color-scheme** — the dialog belongs to the app,
  and this is deterministic + unit-testable on any host. Only the Adwaita **variant** is chosen, never a
  different theme *name*.
- **Scoped to the AppImage-polluted env only.** A dev / distro-package run is left alone; making
  non-AppImage dialogs follow ReCue's theme rather than the desktop's is an explicit non-goal.
- **Accepted limitation:** `GTK_THEME` is read at GTK init, so toggling the theme in Settings re-themes the
  app instantly but the **native dialogs pick up the new variant on the next launch** — surfaced as the
  muted Linux-only Settings hint above.
- **A separate module, not an extension of `linux_webkit.rs`** — Task 347 is editing that file; the only
  shared touchpoint is the append-only call list in `run()`. Complementary to Task 350 (which scrubs
  AppImage-polluted env from *child* processes — a different process's env; `GTK_THEME` landing on its
  strip-list for children is fine and expected).
- No dependency / `Cargo.toml` / `Cargo.lock` / `tauri.conf.json` / capability / dialog-call-site
  (`src/ipc.ts`) change. No version bump or patch-notes file (releases are batched by the maintainer).

**Dependencies:** none. (Builds on landed work only: #333 the `settings.theme` field, #345 the Linux port +
AppImage leg, #346 `linux_webkit.rs`'s pre-GTK env pattern.)

**Notes**

- The pure decision core (`gtk_theme_env` / `adwaita_variant` / `theme_from_store_json`) is `, test)`-widened
  (the `reveal_file_linux` / `explorer_select_arg` precedent) so the macOS and Windows hosts still type-check
  **and** unit-test it; only the thin env-probe + `set_var` + file-read shell is Linux-only.
- The GUI/AppImage surface (a dark folder picker in the real AppImage, the light variant after a toggle +
  relaunch, both escape hatches honored, a non-AppImage run leaving `GTK_THEME` untouched) can't be
  exercised on CI — logged in `TRAJECTORY_TO_LINUX.md`'s real-box checklist (Arch/Ubuntu/Mint ×
  GNOME/KDE/Cinnamon/Xfce, Wayland + X11).
- Benign side effect: a dark `GTK_THEME` also darkens the GTK window background and WebKitGTK's
  `prefers-color-scheme`. ReCue's CSS keys off `data-theme`, not `prefers-color-scheme`, so nothing in the UI
  changes — and a dark native background *helps* (does not fight) Task 348's white-startup-flash work.

### 350. [x] Scrub the AppImage-injected environment from every child process ReCue spawns

Under the Linux **AppImage**, every process ReCue spawned — each `claude`/codex agent PTY, every #72 shell
terminal, every `git` shell-out and `<cli> --version` probe, `xdg-open`, `dbus-send`, the login-shell PATH
probe — inherited the AppImage runtime's polluted environment: the bookkeeping vars (`APPDIR`, `APPIMAGE`,
`APPIMAGE_UUID`, `ARGV0`, `OWD`), the scalars the vendored `linuxdeploy-plugin-gtk` AppRun hook forces for
the *webview* (`GTK_THEME=Adwaita:light`, `GDK_BACKEND=x11`), and `$APPDIR`-prefixed values for `PATH`,
`LD_LIBRARY_PATH`, `XDG_DATA_DIRS`, `GSETTINGS_SCHEMA_DIR`, `GIO_MODULE_DIR`, `GDK_PIXBUF_MODULE_FILE`,
`GI_TYPELIB_PATH`, `PYTHONPATH`, `PERLLIB`, `QT_PLUGIN_PATH`, `GST_*`, … — all pointing into the transient
`/tmp/.mount_…` FUSE mount. That is documented to break `xdg-open` and to degrade or outright break a system
binary that ends up loading the AppImage's bundled libraries (tauri-apps/tauri#10617,
AppImage/AppImageKit#124). One shared, pure, unit-tested scrub seam now gives children the user's real
environment. **A byte-for-byte no-op on macOS, on Windows, and on any non-AppImage Linux build** (dev,
`.deb`, pacman).

**What shipped** (branch `scrub-appimage-child-env`, PR [#102](https://github.com/ErikdeJager/ReCue/pull/102),
2026-07-14):

- **`src-tauri/src/child_env.rs`** (new, modeled on `linux_webkit.rs`) — the pure core plus three
  process-level entry points. The rule is **value-based, not an exhaustive var list**: any `:`-separated
  segment living under `$APPDIR` (or under the `/tmp/.mount_` prefix) is stripped from **any** variable, so a
  future AppRun's newly injected path vars are covered automatically — only a new *scalar* forcing would need
  a `FORCED_VARS` entry. Per key: `APPIMAGE_ORIGINAL_*` bookkeeping and the marker vars are dropped; a forced
  scalar is restored from its `APPIMAGE_ORIGINAL_<VAR>` backup if one exists, else dropped; any var with a
  backup is restored **verbatim**; otherwise the AppImage-owned segments are stripped. A var whose segments
  were *all* AppImage-owned is **removed entirely, never set to `""`** — an empty `LD_LIBRARY_PATH` segment
  means "current working directory" to the dynamic loader (a consumer then falls back to its FreeDesktop
  default, which is exactly the pre-AppImage state, since AppRun only ever *prepends*). `PATH` is on a
  `NEVER_UNSET` list, so an all-AppImage `PATH` is left untouched rather than emptied.
- **Entry points** — `child_env_vars()` (the PTY env snapshot for `portable_pty::CommandBuilder`, which
  starts from an *empty* env set, so a var omitted here is genuinely absent from the child; non-UTF-8 pairs
  pass through verbatim — they cannot be AppImage vars), `scrub_command(&mut Command)` (snapshot → `scrub_env`
  → `env_diff` → `env_remove`/`env` overrides), and `command(program)` (construct + scrub). Outside an
  AppImage the diff is empty, so **zero** `env`/`env_remove` calls are made and the `Command` is byte-for-byte
  what it was before.
- **Five spawn seams wired** — `pty.rs::spawn_with_id` (the single spawn behind `spawn_session` /
  `spawn_session_with_prompt` / `resume_session` / `fork_session` / `spawn_terminal`) copies the scrubbed env
  instead of raw `std::env::vars_os()`, still setting `TERM=xterm-256color` after; `git::hidden_command`
  applies the scrub, covering every `git` shell-out and `<cli> --version` probe (its doc comment now names it
  the shared "shell out to a helper process" seam — console-flash guard **and** AppImage scrub); `commands.rs`'s
  `os_open` / `open_url` / `reveal_file_in_finder` / `reveal_file_linux` (`dbus-send` + the `xdg-open`
  parent-dir fallback) build through `child_env::command`; and `path_env::login_shell_path_blocking` runs the
  `$SHELL -ilc` probe through it too.
- **Docs** — `CLAUDE.md` gained `child_env.rs` in the `src-tauri/` layout tree, `child_env_vars()` /
  `scrub_command()` in the "reuse the established cross-platform seams" Rust list (next to
  `git::hidden_command()`), and a sentence in the Linux block; `TRAJECTORY_TO_LINUX.md` gained a dated
  `### AppImage child-process environment (Task #350)` entry + its real-box checklist.

**Key decisions**

- **One shared seam, not a `pty.rs`-only patch.** The card only named the PTY spawn, but `git`, `xdg-open`,
  `dbus-send` and the login-shell probe inherit the same pollution — so all five go through one module.
- **Gated `#[cfg(all(unix, not(target_os = "macos")))]`**, not the card's `#[cfg(unix)]`, so macOS stays
  byte-for-byte (it shares the unix arm but never sees an AppImage). The pure helpers are `, test)`-widened +
  `cfg_attr(test, allow(dead_code))` — the `explorer_select_arg` / `reveal_file_linux` / `should_disable_dmabuf`
  precedent — so the macOS/Windows hosts still type-check **and** unit-test them without tripping clippy's
  `--all-targets -D warnings` dead-code check.
- **The scrub arms only when `APPDIR` or `APPIMAGE` is present in the env map**, making every other run a
  provable identity transform — pinned by the first unit test and by `scrub_command`'s empty-diff path.
- **Binary resolution is untouched:** `find_on_path` / `resolve_command` still use ReCue's *own* process
  `PATH` (already repaired by #345's login-shell probe). The scrub changes what the child *inherits*, never
  which binary is found.
- **`WEBKIT_DISABLE_DMABUF_RENDERER` is deliberately not stripped** — #346 sets it for ReCue's own webview,
  it isn't AppImage-injected, and it's inert for CLI children. The macOS-only spawns (`usage.rs`'s `security`,
  `lib.rs`'s `tccutil`) are likewise left alone; no AppImage exists there.
- **Complementary with Task #349, not overlapping:** #349 *sets* `GTK_THEME` for ReCue's **own** process (so
  the native dialogs are dark); this task *strips* it from **children** under the AppImage (so a GTK app
  launched from a ReCue terminal uses the user's own theme). No frontend, store, IPC, or bundling-config
  change.

**Dependencies:** none.

**Notes**

- The pure core (`is_appimage_segment` / `filter_segments` / `scrub_env` / `env_diff`) is unit-tested on every
  host: the no-AppImage identity case, the full AppImage map (markers, forced scalars, `PATH`,
  `LD_LIBRARY_PATH`, `XDG_DATA_DIRS`, the GTK module vars, untouched user vars, no emitted empty segment), the
  never-empty `PATH` guard, the `APPIMAGE_ORIGINAL_*` restore + backup-key removal, the `APPDIR`-absent /
  `/tmp/.mount_`-only (`--appimage-extract-and-run`) case, idempotence, and `env_diff` both ways. A prefix
  false-positive guard is included: `/home/u/squashfs-root2/bin` is **not** under `/home/u/squashfs-root`.
- The AppImage surface can't be exercised on CI — logged in `TRAJECTORY_TO_LINUX.md`'s real-box checklist: a
  ReCue shell terminal's `env` carries no `APPDIR`/`APPIMAGE`/`OWD`/`ARGV0`/`GTK_THEME`/`GDK_BACKEND` and no
  `/tmp/.mount_` segment in `PATH`/`XDG_DATA_DIRS`/`LD_LIBRARY_PATH`; `xdg-open`, the Ctrl-click link open,
  "Reveal in File Manager", "Open data folder", `git`, and a spawned `claude` agent all work under the
  AppImage; and ReCue's own window/dialogs are visually unchanged (the app's *own* process env is untouched).

### 353. [x] Move the straggler sync Tauri commands (PTY spawn/kill/scrollback, agent probes, git writes) off the webview main thread

In Tauri 2 a command declared `pub fn` runs **on the webview/main thread**; only `pub async fn` is dispatched
to the async runtime. A set of commands that do genuinely blocking work were still synchronous, so the window
froze while they ran: the whole **PTY spawn family** (a `cwd` stat + a full `$PATH` scan + `openpty()` + a copy
of the entire process env + `fork`/`exec`, inline — plus `git worktree add` for the worktree variants and a
`~/.claude/projects` glob for a fork), the **agent probes** (`agent_info` / `claude_version` spawn
`<binary> --version` **and wait** — and because the command was sync, `maybeOnboardAgent`'s `Promise.all` over
`SELECTABLE_AGENTS` executed them *serially on the main thread*, freezing a not-yet-onboarded install for
~1–2 s × N), **`session_scrollback`** (a 256 KB copy + base64 per terminal mount, N of them at boot),
**`search_session_output`** (that copy plus a UTF-8 decode + ANSI strip + scan for **every live session**, on
every keystroke in the global search modal), **`kill_session`**, the **git writes** `pull_branch` (a *network*
`git pull` on the main thread) / `checkout_branch` / `create_branch` (the trio #330 explicitly deferred), and
the schedule/recurring creators + manual fire (an eager `git worktree add`, and a possible inline first spawn).
All 17 now run `async fn` + `tauri::async_runtime::spawn_blocking`, the pattern from #200/#299/#316/#328/#330.
The win is largest on Linux/WebKitGTK, where main-thread work is the known bottleneck (#346), but it is
platform-neutral — no `#[cfg]` arm is introduced or changed.

**What shipped** (branch `sync-commands-off-main-thread`, PR
[#107](https://github.com/ErikdeJager/ReCue/pull/107), 2026-07-14) — **`src-tauri/src/commands.rs` only**:

- **17 commands converted** to `pub async fn` + `spawn_blocking`: `spawn_session`, `spawn_terminal`,
  `spawn_worktree_agent`, `spawn_worktree_agent_new_branch`, `resume_session`, `fork_session`, `kill_session`,
  `session_scrollback`, `search_session_output`, `agent_info`, `claude_version`, `pull_branch`,
  `checkout_branch`, `create_branch`, `create_schedule`, `create_recurring`, `fire_schedule_now`.
- **The state-plumbing crux.** `State<'_, T>` is a **borrow** — not `'static`, so it can never be captured by a
  `spawn_blocking` closure (`F: FnOnce() -> R + Send + 'static`). Every converted command therefore drops its
  `State` args, takes an owned **`app: AppHandle`** (`Clone + Send + Sync + 'static`), and resolves
  `app.state::<SessionManager>()` / `app.state::<Store>()` **inside** the closure — the same route the
  boot-resume thread, the event forwarder, and `fire_schedule_now` already used. Bodies moved **verbatim** into
  private `*_blocking` helpers; the commands are thin wrappers. Because a `State` arg is what forces an async
  command to return `Result`, dropping it also let the two non-`Result` commands (`agent_info`,
  `search_session_output`) keep their bare return types — **so `src/ipc.ts`, the store, and every TS type are
  untouched** (an `AppHandle` param is injected by Tauri, never sent by `invoke`).
- **Three commands deliberately stay sync, each with the rationale recorded in-code**: **`write_stdin`** —
  per-keystroke, the work is a `memcpy` + one `write`/`flush` (microseconds), and async would **destroy write
  ordering**, since `terminalPool.ts` fires it un-awaited from xterm's `onData`, so two quick keystrokes would
  become two racing tasks that could reach the PTY out of order (a corrupted prompt); **`resize_pty`** — a
  cheap ioctl, fired-and-forgotten from a `ResizeObserver`, where racing async resizes could land out of order
  and leave the PTY on a stale size (a garbled TUI) for zero win; **`list_sessions`** — an in-memory `Vec`
  clone, called about once at boot.

**Key decisions**

- **No `pty.rs` / `store.rs` changes at all.** Their `std::sync::Mutex`es stay as-is — **no `tokio::sync`, no
  `Arc<SessionManager>` managed-state swap**. No guard can cross an `.await`, because every lock is taken
  inside a synchronous method called from *inside* the blocking closure, and the `Send` bound on Tauri's
  spawned command future makes the alternative a compile error (`std::sync::MutexGuard` is `!Send`). This also
  kept the diff clear of the concurrent Tasks #350/#354, which edit `pty.rs` internals.
- **`async fn` + `spawn_blocking`, never `#[tauri::command(async)]`** — the latter runs the blocking body on a
  *tokio worker* thread rather than the blocking pool, which can starve the runtime.
- **Scope rule: convert every sync command that spawns a process or shells out to git.** That is 6 more than
  the card listed (the two worktree spawns, `search_session_output`, and the deferred `pull`/`checkout`/`create`
  branch trio) plus the three schedule/recurring commands. Deliberately **not** converted, and recorded rather
  than silently skipped: the `files.rs` family, `list_skills`, `save_clipboard_image`, the openers, and the
  in-memory store getters/setters — a different (mostly sub-millisecond FS/opener) family;
  `search_file_contents` is flagged as the one plausible remaining straggler for a follow-up card.
- **Ordering is the one real semantic change** — async commands are no longer FIFO with each other. Safe here
  because every converted command targets a distinct id or is an idempotent user-initiated one-shot, and
  `session_scrollback` is explicitly safe out of order: its reply carries the absolute `end` offset that
  `replayDedupe.ts` dedupes the live stream against (#261/#346).
- **The blocking-`write_all` problem for `write_stdin` is a non-goal, not an oversight.** Making it
  non-blocking *without* losing FIFO order needs a per-session writer thread + an `mpsc` queue in `pty.rs` —
  a separate, larger change, recorded as a follow-up rather than bodged in with `spawn_blocking`.

**Dependencies:** none. (Builds on the landed `spawn_blocking` + `AppHandle`-state pattern: #200/#299/#316/#328/#330.)

**Notes**

- No automated command-level test was added — the repo has no `tauri::test` mock-app harness and the change is
  structural. Acceptance rests on the compile-time `Send` guarantee, clippy `-D warnings`, the unchanged
  existing suites, and enumerated manual smoke checks (GUI responsiveness is not CI-assertable): spawning an
  agent while others print no longer stalls the window and the new terminal still paints claude's startup
  exactly once; Settings → Sessions stays interactive while the `--version` probes run (they now genuinely run
  **concurrently** on the blocking pool); fast typing stays byte-for-byte in order; and Remove / Fork / Restart
  / Start-now / Pull / Checkout / Create-branch / worktree spawn all keep their existing toasts.
- Known, pre-existing hazard noted rather than fixed: a concurrent same-id spawn (double-clicking Restart) is
  now genuinely parallel rather than serialized on the main thread. The race already existed (the boot-resume
  thread races main-thread commands) and the frontend guards the affordances — out of scope, but worth
  remembering if a stray process is ever observed.

### 356. [x] Code-split the frontend bundle — lazy routes, panels, modals, markdown/Prism, and the xterm WebGL addon

The whole frontend was **one 1,351.5 kB (391.1 kB gzip) chunk** parsed before first paint — `vite.config.ts`
had no `build` section at all, and mermaid (#254) was the app's only dynamic import. Everything else came
along eagerly: the react-markdown + remark-gfm + micromark/mdast/hast stack (151 kB), Prism plus its ~24
statically-imported language grammars (70.6 kB), the xterm WebGL addon (107.4 kB — even on a machine that
would never use it), every modal, every panel, and *both* window routes, so a **detached canvas window** (#84)
parsed the sidebar, Overview, and eleven modals it can never show. Deferring all of that cuts first-paint JS to
**854.3 kB / 245.5 kB gzip** for the main window and **769.6 kB / 221.3 kB** for a detached canvas window — a
startup win on every OS and a large one on Linux/WebKitGTK, where JS parse is the slowest (#346).

**What shipped** (branch `code-split-frontend-356`, PR [#111](https://github.com/ErikdeJager/ReCue/pull/111),
2026-07-14) — frontend only, no Rust change:

- **Route split** — `src/App.tsx` is now a `Suspense` router over a lazy `MainApp` (extracted verbatim into
  the new `src/MainApp.tsx`) and a lazy `CanvasWindow`. Window identity is fixed for a window's lifetime
  (URL-derived, #84), so exactly one route chunk is ever fetched. The fallback is a bare `div.app` — it paints
  the app background and nothing else, deliberately, so it stays complementary with Task #348's
  `visible:false` → `show()` window gate (which needs a background-painted first commit, never white).
- **Lazy panels** — `ItemContent.tsx` (the single live-render site for panel content, #157) `React.lazy`s
  `FileViewer` / `KanbanPanel` / `DiffInspector` / `FileTree`. Since those four are the *only* importers of the
  markdown and Prism stacks, this is what carries all ~221 kB of them out of the first-paint graph — **without
  touching `prism.ts`, `mermaid.ts`, `markdownCheckboxes.tsx`, or any unit-tested pure module**. Each lazy
  branch gets its **own** `Suspense` boundary, reusing the existing `.placeholder` "Loading…" style.
- **Lazy modals** — a new `src/components/ModalHost.tsx` holds ten gates (Settings, NewSession, CloneRepo,
  CreatePanel, GlobalSearch, CanvasClose, TemplateUse / Manager / Editor, Onboarding), each subscribing to its
  own store flag — so `MainApp` no longer re-renders when a modal opens (a small bonus win). The Suspense
  fallback is **`null`** on purpose: an empty modal shell would be a visible regression, whereas `null` means
  the modal simply appears once its chunk lands. `Toaster`, `BigModeModal`, `UpdateModal`, and `ClaudeMissing`
  stay static (first-paint or safety-critical — the update install overlay must never be a chunk away).
- **Lazy xterm WebGL addon** — `terminalPool.createHost()` now `import()`s `@xterm/addon-webgl` on demand,
  while xterm core / `addon-fit` / `addon-web-links` / the xterm CSS stay eager (terminals *are* the first
  paint). `disposed` is hoisted above the WebGL block to guard a late attach into a torn-down host, a `.catch()`
  keeps the DOM renderer if the chunk or the constructor fails, and the #221 font-atlas rebuild `await`s
  `webglReady` so it still runs exactly once.
- **Idle prefetch** — a new `src/prefetch.ts` warms the deferred chunks after first paint via
  `requestIdleCallback` (feature-detected, with a `setTimeout` fallback for older WKWebView/Safari), so the
  first Settings / ⌘N / file-panel open is instant. A detached window skips the modal warm-up.
- **Regression guard** — `build: { manifest: true }` plus a new dependency-free `scripts/bundle-report.mjs`
  (Node builtins only) computes each route's first-paint closure — the entry chunk plus its **static** import
  closure plus the route chunk and its static closure, deliberately *not* following `dynamicImports` — reports
  raw + gzip, and with `--check` fails the build over budget (900 kB raw / 260 kB gzip). `npm run bundle:report`
  added to `package.json`.

**Key decisions**

- **No `manualChunks`, and the reason is recorded in `CLAUDE.md`.** Rollup chunking only decides *which file* a
  module lands in — a statically reachable module is still fetched, parsed, and executed before first render
  whatever chunk it sits in. **Only a dynamic `import()` removes work from the first-paint path.** The CLAUDE.md
  bullet spells out the durable rule: never static-import react-markdown / prismjs / `@xterm/addon-webgl` back
  into the entry graph — and the `--check` budget is what enforces it mechanically.
- **Lazy the four *consumers*, not the markdown/Prism internals.** Refactoring `FileViewer` into an async
  markdown/prism loader would have won the same bytes while churning unit-tested pure modules; lazying the four
  components that exclusively import them wins it for free.
- **Never wrap `ItemContent` (or a `Terminal` branch) in one shared Suspense boundary.** A suspending boundary
  hides its already-rendered children with `display:none`, which would leave a pooled xterm un-measurable and
  misfit — the #18 class of bug. Per-branch boundaries mean a terminal is never inside one.
- **xterm core and `terminalPool` stay eager and synchronous.** The pool's sync API is consumed from React
  effects and from `store.ts`; making it async would churn the app's most delicate subsystem (#18 pool, #221
  font atlas, #261 write coalescing, #346) to defer code needed milliseconds later. Only the *addon* is deferred.
- **Accepted trade-off (the plan's top risk):** a main-window terminal now paints its first frames on xterm's
  DOM renderer and swaps to WebGL a few ms later when the chunk resolves. xterm supports `loadAddon` after
  `open()` — that was already the code's order, just synchronous — and both renderers are known-good in
  production (#105/#346). Rollback is a one-line restore of the static import. On Linux with a software
  rasterizer the chunk is **never fetched at all** — a pure win.
- **Three modals move from "always mounted, self-gated" to "mounted only while open."** `NewSessionModal`'s
  focus restore was moved into its effect cleanup so it still fires now that close means unmount.

**Dependencies:** none.

**Notes**

- Verified deferred into their own async chunks, absent from both routes' first-paint closure: react-markdown /
  remark-gfm / micromark / hast, prismjs, `@xterm/addon-webgl`, all ten modals, FileViewer, KanbanPanel,
  DiffInspector, FileTree. **Mermaid remains a further lazy chunk *inside* FileViewer**, so a markdown file with
  no ` ```mermaid ` fence still never fetches it.
- Checks green: `npm run lint`, `npm run format:check`, `npm run build`, `npm test` (671 tests / 47 files), and
  `node scripts/bundle-report.mjs --check`.
- Code-splitting is only observable in a **production** build (`vite dev` serves unbundled ESM), so the
  async-chunk-under-`tauri://`-offline check and the WebGL late-attach on WKWebView / WebView2 are real-box
  items rather than CI-assertable ones.

### 351. [x] Lazy-mount Overview terminals — visibility-gated xterm creation + a bounded scrollback-replay queue

Overview's wall is a **horizontally scrolling** row of cards, of which roughly three are visible at a time —
but every card's terminal was **fully mounted at boot**. So N resumed agents meant N eager `createHost` calls,
each constructing an XTerm, opening its **own WebGL context**, fetching up to 256 KB of scrollback, ANSI-parsing
it on the webview main thread, awaiting three `document.fonts.load` calls and firing a resize IPC — ten agents
≈ 2.5 MB parsed and 10 GL contexts in the first seconds, the dominant boot cost and worst on Linux/WebKitGTK
(where `TRAJECTORY_TO_LINUX.md` already listed "Overview terminal virtualization" as future work — this task
closes it). Terminals are now created **only when their card first scrolls into view**, and the replays that do
happen are **serialized** rather than racing each other on the single main thread.

**What shipped** (branch `lazy-mount-overview-terminals`, PR
[#103](https://github.com/ErikdeJager/ReCue/pull/103), 2026-07-14) — frontend only, no Rust change:

- **`useVisibleOnce.ts`** (new) + **`Terminal.tsx`** — a **latching** `IntersectionObserver` gates
  `mountTerminal`: once a slot has been visible, it stays mounted forever. The gate lives in `Terminal.tsx`,
  **not** in Overview, so it covers every terminal surface (Overview cards, Canvas panels, big mode #157,
  detached windows #84) through the one component instead of adding an Overview-only path.
- **`TerminalScrollRootContext`** — filled by `Overview.tsx` with its scrolling wall element. This matters:
  `IntersectionObserver` clips against an intermediate scroll container **before** applying `rootMargin`, so a
  viewport-rooted observer could never pre-load an off-screen wall card. With the wall as the root, the 600px
  horizontal pre-load margin (≥1.5 cards at the 400px default column min-width) is real. Everywhere else the
  root stays the viewport.
- **`replayQueue.ts`** (new, pure + unit-tested) + **`terminalPool.ts`** — scrollback replays run through a
  bounded FIFO queue (`MAX_CONCURRENT_REPLAYS = 1`, a macrotask yield between jobs), each awaiting its
  `term.write` callback (resolve-once, with a 2 s safety timeout), so one ANSI parse can never stack on
  another. A queued-but-unstarted hydration is **cancelled** on host dispose.
- **`pendingOutput.ts`** (new, pure + unit-tested) — the pre-replay live buffer is capped at 2 MB (oldest
  dropped) **only while the scrollback fetch has not yet been dispatched**. That window is provably gap-free:
  the backend pushes to its `Scrollback` before emitting, so every pre-dispatch chunk is already ≤ the
  snapshot's `end` offset. After dispatch the buffer is uncapped, so every byte above `end` survives
  `dedupeAgainstScrollback`.
- **Pending focus** — `focusTerminal` gained a short-lived (3 s) pending focus, so ⌘/Ctrl+1–9 onto a
  not-yet-created host still lands and the user can type immediately. Without it the CanvasSurface's
  active-leaf effect would silently no-op against a host that doesn't exist yet.

**Key decisions**

- **"Virtualize" means deferred creation only — never recycling.** Once a terminal is created it is never
  disposed or parked on scroll-out. Disposing on scroll-out would re-enter the **#18 invariant**: replayed
  scrollback carries cursor-positioned escape sequences computed for a specific PTY width, so a re-replay at a
  different size garbles claude's TUI. Zero boot benefit, guaranteed corruption.
- **No output is lost, and no new mechanism was invented.** `outputBus` already drops chunks for a
  listener-less session, and that is *already* today's behavior for any session not rendered in the current
  view (booting straight into Canvas, or spawning an agent while on Canvas). The backend's 256 KB `Scrollback`
  retains the bytes and `replayDedupe` drops the overlap at creation — so deferring host creation **re-uses an
  already-exercised path**. History older than the 256 KB window is not recoverable; accepted, and unchanged
  from today.
- **Everything else about an unmounted agent keeps working** — the busy/idle dot, notifications, global search
  (Rust-side scrollback search, #337) and auto-continue (#296) are all backend-driven and never touch the pool.
- **Rejected the card's third fix direction** ("replay a smaller initial tail, the rest on idle"): it needs a
  new backend `session_scrollback` parameter and trades away user-visible history for a win the visibility gate
  already delivers.
- **Non-terminal Overview panels (FileViewer / DiffInspector / Kanban / FileTree / Scheduled / Recurring) are
  not gated** in this task — their mount cost is far smaller. Noted as a follow-up that can reuse the same hook.
- No backend change and no new user setting; rollback is two constants.

**Dependencies:** none.

**Notes**

- New unit tests cover the pure parts per repo convention (the pool itself is coverage-excluded DOM/xterm glue):
  the bounded-concurrency FIFO (limit, ordering, `cancel`, a rejecting/throwing job, the yield) and the
  pending-output cap (drops oldest, preserves order, `Infinity` keeps all). Checks green: `npm run lint`,
  `npm run format:check`, `npm test` (686 passing), `npm run test:coverage` (90.93% lines, gate 75%),
  `npm run build`.
- Pure WebView/TS — `IntersectionObserver` is supported by WKWebView, WebView2/Chromium **and** WebKitGTK, so
  there is no `#[cfg]` divergence and no OS primitive involved; identical on all three, with the biggest win on
  Linux.

### 347. [x] Fix the Linux DMA-BUF workaround misfiring on hybrid Intel+NVIDIA GPUs (GPU-aware detection)

**#346's own workaround had become the "slow on Arch" bug.** Its `nvidia_driver_present()` returned true on the
mere *presence* of the kernel module (`/proc/driver/nvidia/version` or `/sys/module/nvidia`) — but on a **hybrid
laptop** the NVIDIA card exists while the webview actually renders on the Intel/AMD **iGPU via Mesa**, where
DMA-BUF is healthy and fast. So ReCue forced `WEBKIT_DISABLE_DMABUF_RENDERER=1` on a machine that didn't need
it, pushing the bundled Skia WebKit into CPU rendering, which then cascaded into software WebGL → xterm's DOM
renderer. Verified on the reporter's Arch/Hyprland box (`card0` = nvidia blob RTX 4080 Max-Q on nvidia-open
610.43.03, `card1` = `i915` Intel Iris Xe rendering the webview; boot log
`set WEBKIT_DISABLE_DMABUF_RENDERER=1 (nvidia: true, vm: false)`). `vm_detected()` was equally coarse: it
tripped on the mere existence of `/sys/hypervisor/type` (which also exists on a **bare-metal Xen dom0**) and on
loose DMI *substring* matches including `"standard pc"` and `"kvm"`, which appear in real hardware product
strings.

**What shipped** (branch `linux-dmabuf-hybrid-gpu`, PR [#104](https://github.com/ErikdeJager/ReCue/pull/104),
2026-07-14):

- **`src-tauri/src/linux_webkit.rs` rewritten** around pure, unit-tested types and functions
  (`RendererOverride` / `NvidiaKernel` / `GpuClass` / `DmabufProbe` / `DmabufDecision` / `VmSignals`;
  `decide_dmabuf`, `nvidia_kernel_flavor`, `nvidia_driver_version`, `classify_gpu`, `is_hypervisor_dmi`,
  `vm_detected`, `cpuinfo_has_hypervisor_flag`, `only_virtual_gpus`, `describe_probe`, plus the kept
  `parse_force_flag`), over thin Linux-only `/sys` + `/proc` probes.
- **The new policy** (ordered, in `decide_dmabuf`): a user-exported `WEBKIT_DISABLE_DMABUF_RENDERER` always
  wins and is never touched → `RECUE_DISABLE_DMABUF` force-overrides both ways → **disable** only when GL is
  explicitly PRIME-routed to the blob (`__GLX_VENDOR_LIBRARY_NAME=nvidia` / `__NV_PRIME_RENDER_OFFLOAD=1` — the
  hybrid exemption cannot apply, since the webview's GL *is* NVIDIA's), or when the **NVIDIA blob is the sole
  renderer** (no Mesa-driven DRM card), or in a **VM with no native Mesa GPU** → otherwise **keep** it. So a
  hybrid iGPU+dGPU laptop, nouveau, an AMD/Intel-only box, and a passthrough VM all keep the faster DMA-BUF
  path. An unreadable `/sys/class/drm` leaves the GPU list empty and lands on "disable" — conservative, exactly
  as #346 was.
- **GPU inventory** from `/sys/class/drm/card*` (DRM driver-name → Mesa / NvidiaBlob / Virtual / Unknown, with a
  PCI vendor-id fallback) rather than counting render nodes — the same signal, more precise, and trivially
  pure-testable.
- **VM detection tightened** to require **two independent signals** (the CPUID `hypervisor` flag plus
  DMI/hypervisor-node/virtual-GPU corroboration, or an exact DMI hit with only-virtual GPUs), with **exact —
  not substring — DMI matching** and an explicit **bare-metal Xen dom0 exclusion** (`/proc/xen/capabilities`
  containing `control_d`). `"PowerEdge KVM 1000"` and a real "Standard PC Server Board" no longer read as VMs.
- **One boot diagnostic line for *both* outcomes**, naming the evidence — e.g. `[recue] WebKitGTK: DMA-BUF left
  on — Mesa GPU present (healthy DMA-BUF) (gpus: nvidia[blob],i915[mesa]; nvidia: open 610.43.03; vm: no;
  session: wayland) — override with RECUE_DISABLE_DMABUF=1|0`. **#346 logged only the disable case, which is
  exactly why the misfire was invisible.**
- **Frontend (comment/log only, zero logic change)** — `webglRenderer.ts`'s header is reframed as what it is (a
  consequence-level fail-safe, not a detector), and `terminalPool.ts::webglAllowed()` now logs the WebGL
  renderer string once on Linux for support diagnostics. Once DMA-BUF is correctly left on, that probe reads a
  hardware renderer (`Mesa Intel(R) Graphics …`) and xterm's WebGL addon is used again — no change needed there.

**Key decisions**

- **nvidia-open gates *identically* to the proprietary blob**, and is only *logged* separately. The card grouped
  it with nouveau; that was deliberately not done, because it ships the same proprietary userspace EGL the
  workaround targets — and an nvidia-open-**only** desktop still needs the workaround. What actually fixes the
  reported box is the Mesa-present/hybrid rule, not a driver-flavor exemption.
- **No NVIDIA driver-version gate.** The version is parsed for the diagnostic log only; a wrong threshold would
  risk a blank or garbled webview, which is worse than slow.
- **The `RendererOverride` tri-state (Auto / ForceDisable / ForceKeep) is the seam** a future Settings
  renderer-override card plugs into — resolved today from `RECUE_DISABLE_DMABUF` alone, with an in-code note
  that a *persisted* setting must be read **before `tauri::Builder`** (GTK reads the env at init). No Tauri
  command, IPC, or settings field was added here.
- Escape hatches unchanged: a user-exported `WEBKIT_DISABLE_DMABUF_RENDERER` is never touched, and the
  `RECUE_DISABLE_COMPOSITING` debug opt-in is untouched.

**Dependencies:** none. (Corrects #346, which introduced the detection.)

**Notes**

- 23 unit tests, including the named **`hybrid_intel_nvidia_open_keeps_dmabuf`** regression guard built from the
  reporter's verbatim `/sys` strings, plus a Linux-only no-panic/consistency smoke test over the impure probes.
  Every pure fn is `, test)`-widened so the macOS and Windows hosts still type-check and run them;
  **macOS/Windows behavior is byte-for-byte unchanged** (the arm is unreachable there).
- Per-GPU runtime behavior can't be exercised on CI — a dated `### DMA-BUF detection regression (Task #347)`
  section + real-box checklist went into `TRAJECTORY_TO_LINUX.md`, and `CLAUDE.md`'s Linux-performance item (1)
  was restated under the new policy (`#346/#347`).

### 348. [x] Eliminate the white startup flash — hidden-until-painted windows + a themed pre-paint background

Every launch (and every Canvas pop-out, #84) flashed a white rectangle before the UI appeared. **Four
independent gaps compounded:** (1) `tauri.conf.json`'s window declared no `backgroundColor` and no
`visible: false`, so the OS mapped the window and painted its **default white surface** as soon as it was
created — long before the webview had anything to show; (2) `index.html` was 13 completely **unstyled** lines —
every stylesheet reaches the page through JS (`main.tsx` imports the fonts, `tokens.css` and `global.css`; each
component imports its own CSS Module), so from document-parse until the ~1.35 MB bundle had been fetched,
parsed and executed the document had **zero** styles and the WebView painted white (`body { background:
var(--bg-base) }` lives in `global.css` — far too late to help); (3) `open_canvas_window` built its
`canvas-<id>` window with no background color, visible immediately; and (4) the **theme** (#333) lives in the
opaque Rust `settings` blob and only reaches the frontend *asynchronously*, so a Light-theme user got
white → dark → light. Any pre-paint color therefore has to know the theme **before the JS bundle runs**, in
both the native window (created by Rust before the webview exists) and the raw HTML document.

**What shipped** (branch `white-startup-flash-348`, PR [#105](https://github.com/ErikdeJager/ReCue/pull/105),
2026-07-14):

- **`tauri.conf.json`** — the main window is created with `backgroundColor: "#1e1e2e"` **and**
  `visible: false`, so there is no white OS surface at creation.
- **`index.html`** — an inline pre-paint `<style>` (dark, plus an `html[data-theme="light"]` rule) and a
  **synchronous** boot script that reads the `recue.theme` localStorage mirror before first paint.
- **`src/theme.ts`** (new) — the never-throwing theme mirror: `THEME_STORAGE_KEY`, `THEME_BG`,
  `themeFromStored`, `readStoredTheme`, `storeTheme`. `store.ts`'s `applySettingsEffects` writes the mirror on
  every settings apply; the **Rust settings blob stays the source of truth**, and the mirror is only a
  best-effort pre-paint hint.
- **`src/useRevealWindow.ts`** (new) — an idempotent post-commit reveal fired from `App()` (the shared root of
  *both* the main and the detached-canvas routes), on **rAF and a 0 ms timer, whichever lands first** — a hidden
  WebView may not tick rAF at all.
- **`commands.rs`** — the pure `background_for_theme` / `window_background` mapping (unit-tested), the new
  `reveal_window` and `set_theme_background` commands, and **`schedule_reveal_fallback`**: any still-hidden
  window is shown after 2 s regardless, so a crashed bundle or a dead dev server can never leave the app
  running-but-invisible. `open_canvas_window` now builds hidden + themed, and `focus_canvas_window` (plus the
  already-open branch) `show()`s before `set_focus()`.
- **`lib.rs`** — re-colors the main window from the **persisted** theme in `setup` (after the `Store` is
  managed, but before the window is ever shown) and schedules its reveal fallback.
- **`store.ts`** — `saveSettings` pushes the new native background to every window on a theme change, so an
  already-open window has no stale-color gutter on resize.

**Key decisions**

- **Pre-paint color is the theme's `--bg-base`** (`#1e1e2e` Mocha / `#eff1f5` Latte) — not `--bg-sidebar` or
  `--terminal-bg`. That hex is necessarily duplicated in four places (`index.html`, `theme.ts`, `commands.rs`,
  `tokens.css`), so **`src/theme.test.ts` carries an anti-drift guard** asserting all four agree for both
  themes.
- **A localStorage mirror, not a Rust-built window with an `initialization_script`.** All windows share one
  origin, so the mirror is readable pre-paint by both routes. A missing or stale mirror degrades to *today's*
  behavior (one dark→light flip) and self-heals that same launch — **no white flash either way**. The
  alternative was a bigger, riskier change to how the main window is created.
- **Reveal via an app-owned Rust `reveal_window` command, not `getCurrentWindow().show()`** — this avoids
  widening `capabilities/default.json` with `core:window:allow-show`, and matches the existing Rust-owned
  window commands (`open_canvas_window` / `focus_canvas_window` / `close_canvas_window`).
- **Reveal fires on React's first commit, not on the settings/session IPC** — so backend latency can never
  delay the window appearing.
- **Added beyond the card's literal text:** `set_theme_background` (so an open window's *native* background
  follows a theme change), the same hidden+themed treatment for detached canvas windows, and the 2 s Rust-side
  reveal fallback.
- **No `color-scheme` declaration was added** — an explicit background suffices, and `color-scheme` would drag
  UA form-control and scrollbar restyling along with it.

**Dependencies:** none. (Complementary with #356, whose route-level Suspense fallback is a bare
background-painting `div.app` precisely so the first commit paints the app background, never white.)

**Notes**

- Platform-neutral: **no `#[cfg]` divergence at all** — macOS, Windows and Linux alike. `backgroundColor` +
  `visible:false` works on WebKitGTK since Tauri 2.1.0 (ReCue is on 2.11.3).
- The startup surface can't be asserted on CI, so "Needs real-box verification (startup flash, #348)" checklists
  went into **both** `TRAJECTORY_TO_LINUX.md` and `TRAJECTORY_TO_WINDOWS.md`; `CLAUDE.md`'s "Window chrome"
  convention now records the hidden-until-painted rule and the four-place pre-paint hex invariant.

### 355. [x] Bounded-parallel boot resume + a one-shot claude project-log index

On boot, persisted sessions were reconnected **strictly one at a time** on a single thread, and every one of
them re-scanned `~/.claude/projects` from scratch (a `read_dir` plus a stat per project dir) to decide
forkability. So N sessions cost N serial spawns **and** N directory walks before the last terminal appeared —
seconds of staggered reconnect on a busy install. The resume loop is now a **4-wide worker pool** over one
**snapshot** of the claude projects tree, with byte-identical events, error handling, and UI behavior.

**What shipped** (branch `bounded-parallel-boot-resume`, PR
[#106](https://github.com/ErikdeJager/ReCue/pull/106), 2026-07-14):

- **`src-tauri/src/boot.rs`** (new) — `resume_persisted_sessions(app)` runs a bounded worker pool
  (`RESUME_CONCURRENCY = 4`, clamped to the record count) over the persisted records, with the pure,
  unit-testable helpers `run_bounded` / `resume_worker_count` / `next_record` / `plan_for`. `lib.rs`'s setup
  block collapses to a single `thread::spawn(move || boot::resume_persisted_sessions(resume))`.
- **`title::ProjectLogIndex`** (new) — one directory scan per boot. It snapshots
  `~/.claude/projects/*/<uuid>.jsonl` **listing each project dir's `.jsonl` filenames** (name → dir), so a
  lookup is O(1) and the whole cost is O(M) rather than N × M stats. Its semantics match `title::has_conversation`
  **exactly**: a shared `conversation_from(LogLocation)` helper, the fail-open `Unknown ⇒ true`, and a per-dir
  stat fallback so a project dir whose listing fails never reports `Absent` where `locate_log` would have
  reported `Found` (which would have wrongly disabled the Fork affordance).
- **Per-record behavior is unchanged** — same order (resume → forkable → `set_forkable` →
  `session://forkable`), same best-effort `let _ =` handling, no new events or payload fields, and the
  #101/#141 capability gating preserved (a codex / opencode / custom record is not resumed and reports
  `forkable: false` without touching the index at all).

**Key decisions**

- **A boot-scoped snapshot, not a global or TTL cache.** The index is built once and dropped when the loop
  ends; the live title worker keeps its per-call `locate_log`. So a project dir created *after* boot is always
  seen, and there is **nothing to invalidate** — the classic staleness bug is designed out rather than managed.
- **Fixed pool width of 4, not `available_parallelism`.** The work is process-creation/IO-bound, and a wider
  pool would just pile concurrent spawns onto the OS during first paint.
- **Dropped "resume visible/selected sessions first" from the card's scope**, deliberately: `selectedId` is not
  persisted at all, and `canvases`/`settings` are opaque frontend-owned JSON blobs the Rust store must not
  parse. With a 4-wide pool the reordering win is a few hundred ms. Records are dispatched in persisted order;
  visibility is Task #351's concern.
- **`pty.rs` production code is untouched** — `SessionManager` was already concurrency-safe (#260), and
  portable-pty 0.9.0 cloexecs the pty fds and closes fds ≥ 3 in the child on unix (and passes
  `bInheritHandles=FALSE` on Windows). Only a unix-gated concurrent-spawn **regression test** was added there.
- **No frontend change** (`git diff --stat -- src/` is empty): `booting` / `RECONNECT_BACKSTOP_MS` / the #30
  reconnecting flow all stay as-is — a faster resume simply means more resumes land inside that window.
- No batching of `Store::set_forkable` and no new events or error toasts: it already persists only on change
  (≈zero writes on a normal boot), and a failed resume stays best-effort, so the child's own exit remains the
  single existing signal.

**Dependencies:** none.

**Notes**

- Tests: a **peak-concurrency probe** (50 items / 4 workers, `AtomicUsize` + `fetch_max` — each item runs
  exactly once and `peak <= 4`), the single-worker sequential case, a **snapshot proof** (a project dir created
  after `build_in` is invisible to the index), the fail-open + unlistable-dir fallback (unix-gated), capability
  gating, and a unix-gated `concurrent_spawns_register_every_session` regression guard in `pty.rs`.
- Real-box-check entries went into `TRAJECTORY_TO_LINUX.md` and `TRAJECTORY_TO_WINDOWS.md` — **four concurrent
  ConPTY creations are worth eyeballing on Windows**, since that is the one path CI cannot exercise.

### 358. [x] Tune `[profile.release]` (LTO, one CGU, strip, size opt-level) — deliberately keeping `panic = "unwind"`

`src-tauri/Cargo.toml` had **no `[profile.release]` at all**, so release builds ran on Cargo's stock defaults:
no LTO, 16 codegen units, unstripped symbols. The resulting binary is decompressed and paged in from the
AppImage's squashfs at **every** launch, so its size is a direct cold-start cost (an acknowledged upstream
AppImage issue). This adds Tauri's standard size profile — **minus** the one lever that would have been actively
harmful. It also closes the "deliberately untouched" `[profile.release]` item that #346 logged in
`TRAJECTORY_TO_LINUX.md`.

**What shipped** (branch `release-profile-tuning`, PR [#108](https://github.com/ErikdeJager/ReCue/pull/108),
2026-07-14):

- **`src-tauri/Cargo.toml`** — a heavily-commented `[profile.release]`: `lto = true` (fat), `codegen-units = 1`,
  `strip = true`, `opt-level = "s"`.
- **`src-tauri/src/pty.rs`** — an `#[ignore]`d `bench_output_hot_path` test (test-only; **no production-code
  change**) timing the three CPU-bound stages of the PTY output path — `Scrollback::push` at 8 KB chunks against
  the 256 KB cap, `coalesce_output_events`, and `commands::encode_output` — with `std::time::Instant` and **no
  new dependency** (no criterion). Shipped rather than thrown away so the `opt-level` choice stays reproducible,
  including for Task #361's AUR package.
- **Docs** — a dated `TRAJECTORY_TO_LINUX.md` entry (profile, the panic rationale, CI build-time cost, the
  `lto = "thin"` fallback), a short mirrored `TRAJECTORY_TO_WINDOWS.md` note (on MSVC `strip` is near-free and
  release carries no PDB), and one sentence in `CLAUDE.md`'s **Builds & distribution** bullet.

**Key decisions**

- **`panic = "abort"` was rejected, and the reasoning is recorded *in the manifest* so nobody "completes" the
  profile later.** Technically nothing needs unwinding — the backend has no `catch_unwind`, no `#[should_panic]`,
  and no production `unwrap`/`expect` outside one startup `.expect`. But ReCue **supervises long-lived PTY
  sessions from always-running threads** (the per-session reader loop, the busy/idle monitor, the title worker,
  the `lib.rs` event forwarder, the schedule/recurring poll, the `path_env` probe), and every mutex take already
  handles a poisoned lock — there is not one `lock().unwrap()` in the tree. Under unwinding, a panic in any of
  those threads kills **only that thread** while every other live agent and detached window survives.
  `panic = "abort"` would trade that live property away — the whole app dies, every agent lost — for the
  **smallest** of the four size levers (~5–10% of unwind tables).
- **Fat `lto = true`, not `"thin"`.** The extra link time is paid only by `release.yml` (version-bump pushes,
  four serialized Rust binaries — the macOS universal target counts twice) and produces a draft release a human
  publishes later; it is **never** paid by the PR gate, since `ci.yml` uses the dev/test profiles. `lto = "thin"`
  is documented as the one-word fallback if a leg OOMs (the arm64 macOS runner has ~7 GB, and universal means
  two LTO links).
- **`opt-level = "s"` by the plan's own decision rule.** `3` was to be shipped only if `"s"` proved >15% slower
  on the aggregate hot path *and* a stage dropped below ~200 MB/s — and a claude repaint storm is single-digit
  MB/s, with #261/#346 having already moved the costly work off the critical path.
- **The card's "23.6 MB / 86 MB" figures were treated as unverified** — acceptance was gated on a *relative*
  delta (binary ≥25% smaller) rather than absolute numbers.
- **No release build was added to the PR gate** (`ci.yml` explicitly refuses per-PR `tauri build` cost). Accepted
  consequence: a broken release link would surface only on the next version-bump push; rollback is a one-line
  revert of the profile block.

**Dependencies:** none.

**Notes**

- **No size or benchmark numbers are claimed, and this is the honest gap in the task.** The implementing box has
  no `webkit2gtk-4.1` / `javascriptcoregtk-4.1` system libraries — `cargo check` fails identically on untouched
  `main` — so it could not **link** a binary: no `cargo build --release`, no AppImage, no `cargo test` run, and
  no benchmark. Per the plan's own decision rule, an unrunnable benchmark defaults to `opt-level = "s"`. The
  measurements are logged as **pending real-box verification** in `TRAJECTORY_TO_LINUX.md`, with the exact
  commands to obtain them.
- Green in CI: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` (so the manifest parses and the
  new test compiles warning-free), `npm run lint`, `npm run format:check`, `npm run build`, `npm test` (671
  tests). `cargo test` compiles the test target but fails at **link** on those missing system libs — a
  pre-existing environment gap, not a defect of this change.
- Untouched: no `[profile.dev|test|bench]`, no `.cargo/config.toml`, no `RUSTFLAGS`, no new dependency.

### 364. [x] Recover from an unrecovered xterm WebGL context loss (dispose the addon → DOM renderer, latched)

**The card's premise was partly wrong, and the task was rescoped honestly rather than built to the letter.** It
said the WebGL addon was attached "without a context-loss handler" — but `terminalPool.ts` has had a minimal
`addon.onContextLoss(() => addon.dispose())` since #18. What was *actually* missing is what happens around that
dispose: the pool kept a **dangling reference** to the disposed addon, so the async #221 font-atlas rebuild
could still call `clearTextureAtlas()` on it — and, worse, **burn the one-shot module-global `fontAtlasRebuilt`
flag that every other live terminal still needs**. There was also no anti-retry latch (a sick GPU could be
hammered with a context-loss storm as each new terminal attached a fresh addon), no warning, and no observable
state. WebGL contexts drop on OOM/suspend, likelier on WebKitGTK.

**What shipped** (branch `xterm-webgl-context-loss`, PR
[#109](https://github.com/ErikdeJager/ReCue/pull/109), 2026-07-14) — frontend only:

- **`src/components/Terminal/webglFallback.ts`** (new, pure and dependency-free) — the per-document WebGL
  fallback latch plus a per-session renderer record: `allowsWebgl` / `noteRenderer` / `noteContextLoss` /
  `rendererOf` / `hasLostContext` / `forget` / `reset`, exposed through a `webglFallback` singleton so the main
  window and each detached canvas window (#84) latch **independently**.
- **`terminalPool.ts`** — on an **unrecovered** context loss, `createHost` now clears its addon reference,
  latches + warns once, disposes the addon (xterm swaps back to its DOM renderer and re-lays-out the **same**
  buffer), and forces a belt-and-braces `term.refresh(0, term.rows - 1)`. The window is then latched to the DOM
  renderer for the rest of the run, so a newly created terminal (spawn / Restart / template) attaches no
  `WebglAddon` at all. `webglFallback.allowsWebgl()` is checked **before** `webglAllowed()`, so a fallen-back
  window never even constructs the #346 probe canvas.
- `host.dispose` forgets the session's renderer record (keeping the map bounded) but **deliberately does not
  clear the latch** — disposing the terminal that lost its context must not re-arm WebGL. The latch likewise
  survives `resetTerminal` (session Restart) and `forget()`.

**Key decisions**

- **The latch is window-wide (a module singleton per document), not per-session.** A real GL loss is
  driver/process-level, so a terminal spawned after the loss would immediately lose its context too. Rollback to
  a per-session key is noted in the plan.
- **No re-attach, and no `webglcontextrestored` handling.** Verified against `@xterm/addon-webgl@0.19.0`: the
  addon itself waits ~3 s for a restore and only fires `onContextLoss` when the context is **unrecoverable** —
  so a retry path would be redundant at best and a context storm at worst.
- **A new module rather than extending `webglRenderer.ts`** — that keeps `webglRenderer.ts` a pure classifier
  and kept this diff conflict-free with the concurrent Task #357, which extends that same file.
- **No user-facing surface** (no toast, badge, or setting) — a single `console.warn` in #346's style. The
  user-visible outcome is simply that the terminal keeps working. `webglFallback.allowsWebgl()` / `reset()` are
  documented as the seam for Task #357's Settings renderer override (an explicit "force WebGL" must clear the
  latch).
- **The #18 pool invariant holds**: no host / xterm / container / PTY dispose, no scrollback replay, no remount —
  the renderer swaps underneath the same live buffer.

**Dependencies:** none.

**Notes**

- Unit tests cover the pure module at 100% lines/branches/functions. The one path CI cannot exercise — the
  actual `WEBGL_lose_context` smoke test — is recorded as a real-box verification step in
  `TRAJECTORY_TO_LINUX.md`, with one clause added to `CLAUDE.md`.
- Unchanged elsewhere: detached windows (#105) and Linux software-WebGL boxes (#346) still never construct the
  addon at all; macOS/Windows main-window terminals still do.

### 363. [x] Give the UI font a Linux leg — bundle Inter Variable (latin), applied Linux-only

`tokens.css`'s `--ui` stack (`-apple-system, "SF Pro Text", ui-sans-serif, system-ui, sans-serif`) resolves to
San Francisco on macOS and Segoe UI on Windows, but on Linux it falls through to whatever the distro's default
sans happens to be — which reads noticeably worse than the other two targets. The card suggested simply adding
Linux-common faces (Inter, Cantarell, Ubuntu, Noto Sans) ahead of the generic. **That was measured on the
reporting Arch box and rejected**: `fc-list` showed that **none** of those faces are installed (only Adwaita
Sans/Mono + FreeSans, with `fc-match sans-serif` → FreeSans), so a fallback-only list would have been a **no-op
on the very machine that reported the bug**, and non-deterministic everywhere else. So the face is **bundled**
instead.

**What shipped** (branch `linux-ui-font`, PR [#110](https://github.com/ErikdeJager/ReCue/pull/110),
2026-07-14) — frontend only, no Rust change:

- **Inter Variable bundled offline** (`@fontsource-variable/inter`, OFL-1.1 — never a CDN, like the existing
  JetBrains Mono) via a **hand-written `@font-face`** in the new `src/styles/fonts.css` naming only the **latin**
  subset: one **48,256 B** woff2 ships, instead of the **218,512 B** that `import "@fontsource-variable/inter"`
  would have emitted across all seven subsets. Variable rather than static because the UI uses weights
  400/500/600 — one file, real weights.
- **Applied Linux-only** through a new `:root[data-platform="linux"]` `--ui` override. The shared `:root --ui`
  line is **not touched**, so macOS and Windows render byte-for-byte as before — and never fetch the woff2 at
  all, since a `@font-face` file loads only when an element actually matches the family. A short system-face
  tail is kept in the Linux stack for non-latin glyph coverage.
- **A new seam for platform-conditional CSS** — `data-platform` on `<html>`, written **synchronously** from the
  WebView user-agent (`detectPlatform` / `applyPlatformAttribute` in `src/platform.ts`) from `main.tsx`
  **before the first render**. The store's `platform` signal is an async IPC and would have flipped the font
  mid-boot. `store.ts` re-applies the attribute from the authoritative backend `platform()` when it lands (a
  no-op in practice, and a self-heal if the UA sniff were ever wrong).

**Key decisions**

- **The ordering hazard was verified, not assumed.** Prepending `"Inter"` into the *shared* stack is **not**
  platform-neutral: macOS is safe (`-apple-system` wins first), but **Windows is not** — neither
  `-apple-system` nor `"SF Pro Text"` resolve there, so a user who happened to have Inter installed would get
  it *instead of* Segoe UI. Appending after `system-ui` is safe on macOS/Windows but a no-op on Linux (the
  generic always resolves; fontconfig even defines a `system-ui` generic). Hence a **platform-scoped override**,
  never a re-ordering of the shared list.
- **`format("woff2")`, not fontsource's `format("woff2-variations")`** — an engine that doesn't know the newer
  keyword degrades to the default instance rather than skipping the `src` entirely (which would mean no font at
  all). The verbatim latin `unicode-range` lets non-latin codepoints fall through to system faces, so no tofu.
- **Consistent with Task #356's bundle budget:** a woff2 is not JS, is never parsed by the engine, and is
  fetched only on Linux — +47 KB on disk (~0.9% of `dist/`), with **zero** JS-parse cost.
- **`index.html` was deliberately not touched** (Task #348 owns it), so the two land independently.
- Out of scope and recorded rather than built: the `--mono`/terminal font, mermaid's `fontFamily`, and a
  user-facing "UI font" setting or opt-out for Linux users who prefer their desktop font.

**Dependencies:** none.

**Notes**

- **Measured, not assumed** (`npm run build`): exactly **one** `dist/assets/inter-latin-wght-normal-*.woff2` at
  48,256 B; total woff2 payload 164,332 B (up from 116,076 B) — both matching the plan exactly. The
  bare-package `url()` resolution in plain CSS was empirically verified against this repo's own Vite 7.3.6.
- Tests: `detectPlatform` over the real WKWebView / WebView2 / WebKitGTK user-agent strings plus the unknown
  case, and a **mechanical regression guard** that reads `tokens.css` + `fonts.css` off disk and asserts the
  `:root --ui` stack still equals the original **exactly**, that the Linux block leads with `"Inter Variable"`
  and ends in a generic, and that the named family is genuinely bundled locally.
- Checks green: `npm run lint`, `npm run format:check`, `npm run build`, `npm test` (681 passed). The GUI check
  (does it actually *look* right on each distro) is recorded in `TRAJECTORY_TO_LINUX.md`.

### 352. [x] Batch the boot IPC waterfall — one aggregated `boot_state` command + parallel event listeners + a no-flash loading gate

`init()` was a waterfall: it awaited **13 event-listen registrations one at a time**, then `platform`, then
`windowsBuild`, then refresh batch A, then batch B, then serial `listSchedules` / `listRecurrings` /
`appVersion` / `getLastVersion` / `listCanvasWindows` — **34 invokes across 22 sequential waves**, 16 of them
gating the first meaningful render. Every one of those round-trips is an evaluate-JS hop on the webview main
thread, which is costliest on WebKitGTK. Boot is now **14 invokes in 2 concurrent waves**.

**What shipped** (branch `batch-boot-ipc-waterfall`, PR
[#112](https://github.com/ErikdeJager/ReCue/pull/112), 2026-07-14):

- **One aggregated Rust `boot_state` command** (`BootState` struct + a pure, unit-testable `boot_state_from`)
  returning **all 21 boot reads** in a single round-trip: sessions, recents, repo colors, Overview
  panels/order, the legacy `open_files`, canvas layout/tabs/templates, settings, sidebar width/collapsed, folder
  order, diff-seen, schedules, recurrings, last + running version, platform, Windows build, and the detached
  canvas ids. It is `async` + `spawn_blocking` (the Windows `cmd /C ver` probe stays off the webview main
  thread, matching #308/#330/#353), and the probe is awaited **before** any store lock, so no mutex guard
  crosses an `await`.
- **The 13 `listen` registrations batched** into one parallel wave (`Promise.all` inside each `subscribe*Events`
  helper, and across the four helpers).
- **Boot restructured into two concurrent waves**: the `boot_state` fetch **races** the listener wave, but the
  payload is applied only **after** the listeners resolve — preserving today's invariant that a live
  `session://output` / `session://exited` can never land un-handled.
- **`store.applyBootState`** — the single place the payload becomes state, in **one `set()`**. `refresh()` is
  now a thin fetch + apply (keeping its name, so `store.refresh.test.ts` keeps its entry point).
- **A `booted` flag** gating three empty-state affordances (the Overview `EmptyState`, the Sidebar "No
  repositories yet." hint, and the empty-canvas center hint) so none of them can flash before content arrives.
  Deliberately **no spinner or skeleton** — it is complementary to Task #348's pre-paint window-show gate.

**Key decisions**

- **`platform` + `windowsBuild` must land in the *same* `set()` as `sessions`** — the #346 invariant, since
  `terminalPool` reads them at host-creation time. This was made an explicit acceptance criterion **and** a
  test, not just a code comment.
- **Every existing command and `ipc.ts` wrapper is kept and still registered.** This is a batching *read*, not a
  replacement — some become boot-unused but remain the API surface for Settings/About and other call sites. **No
  command was deleted.**
- **A single point of failure was consciously accepted**: one command now replaces three independent try/catch
  groups. `boot_state` is infallible server-side (in-memory store reads), and the only realistic failure ("not
  running inside Tauri") already sank all three groups before. `booted` flips true **even when `boot_state`
  fails**, so the UI never strands on a blank screen.
- **Only one new pure module was extracted** (`src/boot.ts` → `resolveCanvases`: persisted tabs, stale
  `activeId` fallback, the legacy `canvas_layout` migration, and the detached-window override), keeping the rest
  of the derivation inside the store action to avoid an import cycle with `store.ts`.
- **The detached canvas window (#84) boots identically** — every `IS_MAIN_WINDOW`-only side effect (the legacy
  `open_files` clear, terminal respawn, canvas-migration persist, the update toast + `setLastVersion`, the usage
  poll) is preserved verbatim.
- Out of scope, and left to their owners: the sidebar's post-boot git refreshes (Task #359),
  `maybeOnboardAgent`'s three `agent_info` probes, `pruneMissingFolders`' `dir_exists` calls (all already
  void-ed off the critical path), and the boot resume loop (Task #355).

**Dependencies:** none.

**Notes**

- A Rust unit test proves **each `boot_state_from` field equals what its individual getter/command returns** —
  so the aggregate can't silently drift from the surface it replaced. `store.refresh.test.ts` was re-pointed at
  a `makeBootState()` fixture with every prior assertion kept, plus new coverage: boot issues only `bootState` +
  the four subscribes; `platform` and `sessions` land together; `booted` flips even on failure.
- Platform-neutral win, largest on WebKitGTK; real-box checks recorded in `TRAJECTORY_TO_LINUX.md`.

### 354. [x] Fast, reliable session exit — kill the PTY process group and derive `Exited` from the child, not the reader's EOF

`kill_session` / `kill_all` only killed the **direct** child pid, and the `Exited` event was **EOF-driven** — but
on unix a PTY master only EOFs once **every** holder of the slave fd is gone, and claude's subprocesses (MCP
servers, tool children) inherit it. So an already-exited agent's card stayed alive for seconds (the reported
"instances exit slow"), and with a descendant that ignores SIGHUP the master **never EOFs at all** — verified
with a PTY probe where the reader was still blocked after 8 s.

**What shipped** (branch `fast-session-exit`, PR [#113](https://github.com/ErikdeJager/ReCue/pull/113),
2026-07-14):

- **`Exited` is now driven by the child, not the reader.** A per-session **exit-waiter thread**
  (`pty.rs exit_waiter`) owns the `Child`, blocks in `wait()`, and is the **sole** emitter of
  `SessionEvent::Exited`. The reader's send is **deleted**, not merely guarded, so there is still exactly **one**
  `Exited` per PTY generation — the frontend's consume-once `intentionalKills` contract is untouched.
- **Trailing output still precedes `Exited`** — the waiter waits, bounded (`EXIT_DRAIN_MS`, 150 ms), on a
  `reader_done` flag the reader sets after its last `Output`, then hangs up lingering descendants and escalates
  to SIGKILL after a further 250 ms. Worst-case added exit latency ~400 ms; normally a few ms.
- **Unix process-group kill (no orphans)** — `hangup_group` / `kill_group` (`killpg` SIGHUP → bounded grace →
  SIGKILL) back `kill_session`, `kill_all`, and the waiter's cleanup of descendants still holding the slave.
- **`kill_session` is non-blocking**: the SIGHUP goes out immediately and the SIGKILL escalation runs off-thread,
  replacing portable-pty's ~200 ms sleep *inside* the Tauri command. **`kill_all` is bounded**: one shared 200 ms
  grace for all sessions rather than ~200 ms × N serially, run inline rather than on detached threads (which may
  not survive process exit → orphans).
- **Same-id respawn (Restart) hardening** — a superseded generation is silenced and killed, so a stale waiter's
  late exit can never be attributed to the fresh session.

**Key decisions**

- **No `pre_exec`/`setsid` of our own, and no `nix` dependency.** The root cause was confirmed *in the vendored
  crate*: portable-pty 0.9.0's unix spawn **already** calls `setsid()` in `pre_exec` (`src/unix.rs:257`), so the
  child is a session/process-group leader (`pgid == pid`) and `killpg(child_pid)` is already correct — it can
  only ever reach the agent's **own** descendants. The only new dep is `libc`, gated
  `[target.'cfg(unix)'.dependencies]` and already in the lock file via portable-pty.
- **The subtlest bug this task had to avoid: `kill_all` must be *silent*.** An `ExitState::silent` flag is set
  **before any signal** on shutdown, so a shutdown kill emits **no** `Exited` at all. Without it, a claude that
  traps SIGHUP and exits **0** would reach the still-live webview, `isCleanExit` would read it as a *clean* exit,
  and `forgetExitedSession` would **delete the persisted record** — silently breaking #30's "quitting keeps your
  sessions" guarantee. `kill_session`, by contrast, still emits exactly one `Exited`, so `intentionalKills`
  bookkeeping is unchanged.
- **Exit-code semantics are preserved by construction, not by a new flag.** portable-pty maps a signal death to
  exit code **1** (never 0), so a killed agent can never be misread as a clean code-0 exit and get its record
  forgotten (#63). Documented and **asserted in a test** rather than adding a "killed" field to the event payload.
- **SIGHUP first, not SIGTERM** (matching portable-pty's and a terminal's own semantics), escalating to SIGKILL.
- **Deliberately did *not* killpg the tty's foreground process group** (`MasterPty::process_group_leader`): the
  setsid'd child's own group already covers claude's non-detached descendants. A descendant that `setsid`s
  *itself* is recorded as a known, best-effort limitation.
- **Windows is byte-for-byte untouched** — no job object (an explicit non-goal), no `libc` compiled there, and
  the kill path stays `ChildKiller::kill()` → `TerminateProcess` (verified in the crate: both `WinChild::kill`
  and the cloned `WinChildKiller::kill` call `TerminateProcess(handle, 1)`). Windows still *inherits* the
  platform-neutral child-wait-driven `Exited`, which is a cfg-free improvement. `pid` and the two grace
  constants carry `#[cfg_attr(windows, allow(dead_code))]` so a Windows `clippy --all-targets -- -D warnings`
  stays clean.
- **No frontend change at all** — `isCleanExit`, `forgetExitedSession`, `intentionalKills`, the Restart overlay
  and "shutdown keeps records" are exactly as they were.

**Dependencies:** none.

**Notes**

- Three new `#[cfg(unix)]` tests (plus a `session_pid` accessor and a `group_gone` helper): a prompt exit despite
  a lingering descendant; a prompt whole-group kill (asserting **exactly one** `Exited`, **never code 0**); and a
  **silent** `kill_all` leaving no process group behind. **Each was verified to fail against a pre-#354
  simulation** and pass after — the tests genuinely pin the bug, rather than merely describing the new code.
- Docs: the `CLAUDE.md` "Exit handling (#63)" convention + Spawn bullet, and dated entries with real-box
  checklists in `TRAJECTORY_TO_LINUX.md` / `TRAJECTORY_TO_WINDOWS.md` (the Windows `TerminateProcess` path and a
  real MCP-server-holding-the-slave scenario are the items CI cannot exercise).

### 359. [x] Tame the boot git storm — tier, scope, and coalesce the sidebar git refresh volley

Right after boot's batch A, the Sidebar effect fired **five** git reads per repo — `refreshBranches` +
`refreshFileStatuses` + `refreshGithubUrls` + `refreshDiffLineCounts` + `refreshBranchAheadBehind` — roughly six
`git` process spawns per repo, and `diff_line_counts` additionally **read up to 2000 untracked files per repo**
to count their lines. The same volley re-fired **unscoped** on every session's busy→idle edge (debounced 600 ms)
— so during boot resume of many sessions it stormed repeatedly at exactly the moment the app was trying to become
interactive, plus a 15 s poll on top.

**What shipped** (branch `tame-boot-git-storm`, PR [#114](https://github.com/ErikdeJager/ReCue/pull/114),
2026-07-14):

- **Tiered the boot volley.** `refreshBranches` (one `git rev-parse` per folder) **stays** on the critical
  path — it is the sidebar's primary label source via `sessionLabel`. The **decorations** (GitHub URLs #327,
  ahead/behind #338, per-agent line counts #335, FileTree tints #252) now run **after first paint** *and* **after
  the boot-resume window settles**.
- **`resumeSettled`** — a new store flag, true immediately when zero session records were persisted, else flipped
  by the **existing** 4 s `RECONNECT_BACKSTOP_MS`. That's a **hard cap**: a slow or failed `claude --resume` can
  never defer the decorations forever. Deliberately *not* keyed on "every session emitted output", which a
  never-resuming session would hang on.
- **Scoped the busy→idle volley** to the settling session's **own folder** (exactly the #212 contract). The
  600 ms debounce accumulates a `Set` of folders; an unknown session id falls back to an unscoped volley
  (fail-safe).
- **`file_statuses` is read only for repos with a mounted FileTree** — its sole consumer — removing the heaviest
  `git` command (a full working-tree walk) from the boot path entirely. A boot with no tree open now does **zero**
  `git status` reads.
- **Coalesced all five reads** behind one `refreshRepoGit({ repos?, kinds?, whenSettled?, throttleFull? })`
  action with an in-flight guard + a merged trailing rerun, replacing ~8 copy-pasted five-call blocks. The
  focus/visibility backstop still runs a **full, unscoped** volley (throttled to ≤1 per 30 s), so a folder edited
  in an external editor still updates its badges.
- **Cheaper git (`git.rs`)** — `diff_line_counts` drops a redundant `has_head` spawn (3 → **2**; `git diff
  --numstat HEAD` already fails exactly where `has_head` was false, pinned by a new unborn-repo test), gains a
  **total-byte budget** (16 MB/repo) on top of the existing file/size caps, and **streams** line counts instead
  of `fs::read`-ing whole files. `github_web_url_for` goes 2 spawns → **1** (a single
  `git config --local --get-regexp` + the pure `pick_remote_url`).

**Key decisions**

- **The card's "or default `showDiffLineCounts` off on Linux" option was explicitly rejected** — that would be a
  silent per-OS feature removal. The badge keeps working on all three OSes; it is simply made cheaper, deferred,
  and per-repo scoped.
- **"After first paint" = a double `requestAnimationFrame`** (with a `setTimeout` fallback), **not**
  `requestIdleCallback` — its support on WKWebView/WebKitGTK isn't worth relying on. Complementary to Task
  #348's pre-paint window-show gate.
- **Viewport-based skipping was rejected** (as the card permitted): the sidebar is short and non-virtualized, and
  scroll-dependent data would pop in and interact badly with worktree nesting, the collapsed rail, and detached
  windows.
- **The "any settle refreshes every repo" safety net is preserved** for externally edited folders — that's what
  the throttled focus/visibility full volley is for; the 15 s interval poll keeps the cheap branches +
  ahead/behind pair.
- Untracked line counting keeps its bounded-fidelity tradeoff: pathological untracked trees may undercount, as
  they already do today under the existing caps.

**Dependencies:** none.

**Notes**

- New pure `src/gitRefresh.ts` (`normalizeRequest` / `mergeRequests` / `mergeScoped` — which deletes a scoped key
  the read no longer returns, and is referentially stable — plus `afterPaint` / `focusRefreshKinds`) with unit
  tests, and new store-level tests for tiering / deferral / scoping / coalescing / open-tree gating.
- Checks green: `npm test` (703 passed), `npm run build`, `npm run lint`, `npm run format:check`,
  `npm run lint:rust`, `npm run format:rust`, `cargo test` (210 passed).
- Platform-neutral: no `#[cfg]` divergence, no new shell-out primitive, no OS-specific frontend API.

### 360. [x] Take the login-shell PATH probe off the startup critical path (async probe + fingerprinted cache)

`restore_user_path()` ran **synchronously at the top of `run()`, before the window existed**, waiting up to 3 s
on `$SHELL -ilc` (release builds only) — so a heavy interactive rc (oh-my-zsh, nvm) delayed the window by
exactly that much. The probe now resolves **concurrently with window creation**, and a fingerprinted cache means
a steady-state boot pays **zero** probe cost.

**What shipped** (branch `async-path-probe`, PR [#115](https://github.com/ErikdeJager/ReCue/pull/115),
2026-07-14):

- **`path_env::start_probe()`** — snapshots the env and returns immediately; the probe runs on its own thread
  while the window is being created.
- **The result lands in an in-process `Mutex` + `Condvar` cell** (`PathState`: `Inherit` / `Pending` / `Ready`).
- **Two readers, deliberately different.** `effective_path()` **blocks** (bounded by a 5 s `WAIT_TIMEOUT`, with a
  timeout-downgrade so a wedged probe can't make every later reader pay the cap) and backs `pty::find_on_path`
  (both cfg arms) + `spawn_with_id`'s child env — this is the **correctness gate**, since a spawn must not
  resolve `claude` against a minimal GUI PATH. `apply_path()` **never blocks** and backs `git::hidden_command`,
  which runs inside *synchronous* Tauri commands on the main thread — a blocking git call there would stall the
  webview, which is the exact failure this task exists to remove.
- **A cross-launch cache** — a backend-internal `path_cache` scalar in `store.rs` (getter + setter, **no Tauri
  command, no frontend change**), keyed by `$SHELL` plus the mtime/presence of every rc file that can set PATH
  (`/etc/profile`, `/etc/paths` and `/etc/paths.d` as a directory, `~/.profile`, the zsh/bash/fish rc sets,
  ZDOTDIR-aware). A hit **seeds** the PATH at boot with no subprocess at all; the probe still re-runs in the
  background and refreshes the cache, republishing in-memory if it differs so later spawns get the fresh value.

**Key decisions**

- **The process env is never mutated for PATH — no `set_var` at all.** This is the safest design rather than the
  fastest: `set_var` races a concurrent `getenv`, which is precisely the data race the card flagged. The probe
  thread also works from a **main-thread env snapshot** (SHELL/PATH/HOME/ZDOTDIR), so it never calls `getenv`
  concurrently with anything either.
- **`linux_webkit` / `linux_gtk` must still run *first*.** They are the last `set_var`s in the process, and
  `start_probe()` is the first thing to spawn a thread — so that ordering in `run()` is **load-bearing**, and is
  documented as such.
- **The cache stores the raw *discovered* login-shell PATH, never the merged one** — so no per-launch segment (an
  AppImage `/tmp/.mount_…/usr/bin`, a dev-shell PATH) is ever persisted. The merge against the current process
  PATH is redone every boot.
- **A stale-fingerprint cache is not optimistically used** — readers wait for the probe instead. And a
  failed/timed-out probe **never downgrades a good seed** (`publish_fallback` only fills a non-`Ready` slot);
  with no seed it publishes today's fallback unchanged.
- **Scope call:** `commands.rs`'s `os_open` / `open_url` / `reveal_file_in_finder` / `reveal_file_linux` (and
  `usage.rs`'s `security`, `lib.rs`'s `tccutil`) are left alone — they launch system binaries always present in
  the minimal GUI PATH, and skipping them kept the diff off Task #350's seams.
- **Dev builds and Windows are byte-for-byte unchanged**: the probe never arms, `effective_path()` returns the
  process PATH, and `apply_path()` adds no `env` call to any `Command`.

**Dependencies:** none.

**Notes**

- 17 new Rust unit tests (223 total, up from 206): the `PathState` machine (a `Pending` reader blocks until
  `publish`; a seed publishes immediately; the probe overrides a seed; a failed probe keeps a seeded value; a
  timeout downgrades to the process PATH; `override_path` is `None` unless ready **and** different), the
  fingerprint (mtime / shell change / file-appears / file-disappears), the cache rules, and `path_cache`
  persistence + legacy-file upgrade. Pure helpers gate `#[cfg(any(unix, test))]` (the `explorer_select_arg`
  precedent) so a Windows host still type-checks and runs them.
- The actual win (a GUI launch not stalling on a heavy rc) can't be unit-tested — real-box checklists went into
  `TRAJECTORY_TO_LINUX.md` and `TRAJECTORY_TO_WINDOWS.md`; `CLAUDE.md` records the new PATH seam.

### 361. [x] Ship a native Arch/AUR package (`recue-bin`) + Linux install docs, and gate the in-app updater off for distro-managed installs

The AppImage bundles the Ubuntu 22.04 GTK/WebKit userland (90 MB `libwebkit2gtk-4.1`, 165 libs), its AppRun hook
forces `GTK_THEME` + `GDK_BACKEND=x11`, cold start pays squashfs/FUSE decompression, and Arch needs `fuse2`
installed to run it at all — so it is the root of a whole class of Linux issues (the ones #349 and #350 had to
patch around). A native package sidesteps every one of them: system webkit2gtk, no env pollution, no FUSE, faster
start. **But a pacman-managed install must not offer to update itself**, since Tauri's Linux updater can only
replace an `$APPIMAGE`.

**What shipped** (branch `linux-aur-package`, PR [#116](https://github.com/ErikdeJager/ReCue/pull/116),
2026-07-14):

- **Rust `install_kind()`** — a pure `classify_install(os, appimage, override_kind, debug)` plus a thin command:
  **`"bundle"`** (macOS `.app` / Windows installer / any debug build), **`"appimage"`** (`$APPIMAGE` set), or
  **`"system"`** (a Linux **release** binary *without* it ⇒ pacman/apt owns it). An **empty** `APPIMAGE` counts as
  unset, and `RECUE_INSTALL_KIND` force-overrides (mirroring #346's `RECUE_DISABLE_DMABUF`).
- **The updater gate (frontend)** — `ipc.installKind()`, a pure `selfUpdates()` in `platform.ts` (false **only**
  for `"system"`), an `installKind` store field loaded at boot, and guards in `store.checkForUpdate` (short-circuits
  to `idle` with **no network call**) and `store.installUpdate` (no-op + toast). `UpdateIndicator` is hidden on a
  package-managed install, and Settings → Updates hides Check / Update-now, showing a `sudo pacman -Syu recue-bin`
  note instead — while "Current version" and the #192 patch notes still render.
- **CI** — the Linux leg now builds `--bundles appimage,deb`, plus a Linux-only `continue-on-error` job-summary
  step printing the `.deb` name + sha256. **The updater artifact stays the AppImage**: `latest.json`'s
  `linux-x86_64` entry is unchanged and the `.deb` gets no `.sig`.
- **Packaging** — `packaging/aur/recue-bin/{PKGBUILD,.SRCINFO}` repacking the released `.deb`, and an executable
  `scripts/aur-bump.sh <version>` that re-pins `pkgver`/`sha256sums`/`.SRCINFO` and **hard-errors while
  `sha256sums` is still the `SKIP` placeholder** (so a half-configured PKGBUILD can't be published).
- **Docs** — a README **Install (Linux)** section (which build self-updates), a new `docs/linux-packaging.md`
  (install matrix, updater rule, maintainer runbook, LICENSE caveat), a `TRAJECTORY_TO_LINUX.md` entry, and the
  `CLAUDE.md` distribution note + layout tree.

**Key decisions**

- **Detection must be *runtime*, not compile-time** — the AUR package repacks the **same binary** the `.deb`
  carries, so a cargo feature or build-time env could not possibly distinguish them.
- **A debug build reports `"bundle"`**, so `npm run tauri dev` on Linux keeps today's update UI and the #193 dev
  mock stays exercisable.
- **A Linux release binary run outside an AppImage reports `"system"` and hides the update UI** — deliberately,
  including a `target/release` run or an `--appimage-extract` run. Tauri's Linux updater can only replace an
  `$APPIMAGE`, so an offer there would *always* fail; better to hide it than to offer a broken button.
- **One AUR package (`recue-bin`), not two.** A source-built `recue` was rejected: npm/cargo network fetches at
  build time conflict with makepkg's declared-sources model, it needs heavy makedepends, and it yields the same
  binary anyway. The name is reserved via `provides=('recue')` / `conflicts=('recue')`.
- **Publishing to the AUR stays a documented *manual* maintainer step.** No AUR account or SSH-key secret exists,
  and auto-publishing on every release is not something to enable silently.
- **The PKGBUILD does not hand-edit the `.desktop` entry** — it inherits whatever Tauri generates, so Task #362's
  `StartupWMClass` fix flows into the AUR package for free.
- **The boot post-update "Updated to v…" toast is left enabled** for package installs — it is a pure version
  compare, so it correctly fires after a `pacman -Syu` too.
- `license=('custom')` — the repo has **no LICENSE file**, and adding one is a legal decision, not an engineering
  one. Flagged in `docs/linux-packaging.md` as a **prerequisite for a real AUR submission** that redistributes the
  binary.

**Dependencies:** none.

**Notes**

- **Verified on a real Arch box** (webkit2gtk-4.1 2.52.5): `npm run tauri build -- --bundles deb` produced
  `ReCue_1.2.1_amd64.deb`; the PKGBUILD's `package()` body was run **verbatim** against it (yielding
  `/usr/bin/recue` + the untouched `.desktop` + icons); `makepkg --printsrcinfo` generated the committed
  `.SRCINFO`; and `depends` was derived from the binary's **actual** `NEEDED` links — confirming **no
  `libayatana-appindicator`** is needed (ReCue ships no tray).
- macOS, Windows and the Linux AppImage are **byte-for-byte unchanged** — `src/store.update.test.ts` (with a
  mocked `./updater`) proves `"system"` never calls the updater while `"appimage"` / `"bundle"` / the unloaded
  `""` default still do.
- Checks green: `npm run build`, `lint`, `test` (680 passed), `format:check`, `cargo test` (213 passed), clippy
  `-D warnings`, `cargo fmt --check`, `bash -n scripts/aur-bump.sh`, `makepkg --printsrcinfo`.

### 362. [x] Fix the Linux `StartupWMClass` mismatch — own the app's WM_CLASS and ship a consented desktop-integration path

The AppImage's internal desktop entry said `StartupWMClass=recue` while the user-installed one said `Recue` — and
a wrong WM_CLASS breaks icon/taskbar grouping (the window doesn't associate with its launcher entry). The root
cause is that ReCue never *owned* its window identity: it inherited it from `argv[0]` (which an AppImage's
`AppRun` may rewrite) plus GDK's capitalization rule, which derives an X11 `res_class` by capitalizing the
program name. The fix pins it at the source rather than patching the generated entry.

**What shipped** (branch `linux-wmclass`, PR [#117](https://github.com/ErikdeJager/ReCue/pull/117),
2026-07-14):

- **`src-tauri/src/linux_desktop.rs`** (new, mirroring `linux_webkit.rs` / `linux_gtk.rs`) — `APP_WM_CLASS =
  "recue"` + `pin_wm_class()` → `glib::set_prgname()`, called from `run()` **before `tauri::Builder`**. ReCue now
  owns its WM_CLASS / Wayland `app_id` outright. `glib = "0.18"` is target-gated to Linux and was **already in the
  lockfile** via tao/gtk, so `cargo tree -d` shows no duplicate and no new crate compiles.
- **A custom desktop-entry template** (`src-tauri/linux/recue.desktop`) wired via `bundle.linux.deb.desktopTemplate`
  (+ `rpm` for parity). The **deb** seam is what controls the **AppImage**'s internal entry — its `.AppDir` is packed
  from the deb data tree, and there is no `appimage.desktopTemplate` (verified in the bundler source). `Exec` stays
  the bare `{{exec}}` placeholder (linuxdeploy's `AppRun` parses that line), and the entry gains `StartupNotify=true`
  + `Keywords=`.
- **Anti-drift Rust tests** (running on **every** OS): the template's `StartupWMClass=` must equal `APP_WM_CLASS`,
  the bundler placeholders must survive, `tauri.conf.json` must still point at the template, and the install script
  must never hardcode the value.
- **A release-workflow assertion** — the Linux leg extracts the freshly built AppImage's desktop entry and
  **hard-fails** on a wrong `StartupWMClass` / `Icon` / `Exec` (extraction *tooling* trouble only warns).
- **`scripts/install-linux-desktop.sh`** — consent-gated (`[y/N]` unless `--yes`), XDG-only (**never `sudo`**,
  nothing outside `$XDG_DATA_HOME`), idempotent, with `--uninstall`. It copies `StartupWMClass` **verbatim from the
  AppImage's own entry** rather than hardcoding it. **The app itself still never writes a desktop file** — no
  silent auto-integration.
- **Linux icon quality** — `bundle.icon` reordered/extended so the embedded window icon is **256×256** (it was
  32×32, since tauri-codegen picks the first PNG) and the installed hicolor set gains 64×64 + 512×512.
  macOS/Windows still take `icon.icns` / `icon.ico`.

**Key decisions**

- **Lowercase `recue` is the single canonical identifier** — it is the Wayland `app_id` (the reporting box runs
  Hyprland, where `res_class` does not exist at all), the X11 `res_name`, and the desktop-entry basename. GNOME
  matches `res_name` → `StartupWMClass` first, and KDE matches case-insensitively.
- **Rejected `app.enableGTKAppId`** (it would introduce a *third* identifier, `com.recue.app`) and
  **`mainBinaryName`** (it would touch macOS/Windows bundle internals and the code-signing surface for a
  Linux-only concern). Also rejected a `gdk_set_program_class` FFI pin: the safe binding panics pre-`gtk_init`,
  and it only affects X11 `res_class`, which no shell needs once `res_name`/`app_id` match.
- **Fixed at the source, not post-processed in CI** — the card allowed patching the artifact; wiring the template
  through the bundler means the AUR package (#361) inherits the correct entry for free.
- No tray work (excluded by the card), no MIME/file associations, and no deb/rpm/AUR packaging (that is #361,
  which reuses these canonical identifiers).

**Dependencies:** none.

**Notes**

- **Measured on a real Arch/Hyprland box, not assumed** — and the hostile-input case was actually tested:

  | run | result |
  | --- | --- |
  | shipped 1.2.1 AppImage | `xprop` → `WM_CLASS = "recue", "Recue"`; Hyprland `class: Recue`, `xwayland: true` |
  | this build, native launch | Wayland `app_id` = **`recue`**, `xwayland: false` — matches the shipped entry exactly |
  | this build, **hostile `argv[0]`** (`exec -a HostileRunName`) | still **`recue`** — the pin genuinely owns the value |
  | this build, `GDK_BACKEND=x11` + hostile `argv[0]` | `WM_CLASS = "recue", "Recue"` — `res_name` pinned; `res_class` is GDK's capitalization |

- The AppImage was built from the branch and its generated `.AppDir` entry extracted, confirming the template took
  effect (`StartupWMClass=recue`, `Exec=recue`, `Icon=recue`, `StartupNotify`, `Keywords`, plus the new
  64×64/512×512 icons).
- Docs: new `docs/linux-desktop-integration.md`, a README "Linux desktop integration" section (documenting
  download-then-run, plus Gear Lever/appimaged as the zero-effort alternative), a dated `TRAJECTORY_TO_LINUX.md`
  entry with the real measurements, and two `CLAUDE.md` additions.

### 365. [x] Walk the Linux real-box verification checklist on Arch/Hyprland — evidence, honest ticks, and recorded findings

An evidence-backed pass over every "Needs real-box verification" box in `TRAJECTORY_TO_LINUX.md`, run on a real
hybrid Intel+NVIDIA Arch/Hyprland box. **The deliverable is evidence and an honest checklist, not a pass rate** —
nothing found was fixed; failures were recorded as findings for the maintainer to file.

**What shipped** (branch `linux-verify-walk`, PR [#119](https://github.com/ErikdeJager/ReCue/pull/119),
2026-07-14) — **no behavior change to any Rust or TS source**; the diff touches exactly three files:
`TRAJECTORY_TO_LINUX.md` (a dated section: box fingerprint, results table, findings, maintainer checklist), the
new read-only evidence collector `scripts/linux-verify.sh`, and one `verify:linux` script in `package.json`.

**Verdict: 34 boxes** as of the walked commit `5192ad1` — not the 15 the card guessed, nor the 13 the plan counted
(#347/#349/#350/#351 had each appended a checklist of their own since #346). **6 PASS · 0 FAIL · 16 PARTIAL ·
8 BLOCKED · 4 N/A.** Only **6** boxes are ticked, every one environment-independent, and **each tick names the
environment it was proved on**. A partially covered box stays `- [ ]` with an inline note recording what *was*
seen — a box is never ticked unless it was actually exercised.

**Box under test:** Arch 7.1.3 · Wayland · Hyprland v0.55.4 · `card0` nvidia (RTX 4080 Max-Q, nvidia-open
610.43.03) + `card1` i915 (Intel Iris Xe) · bare metal (0 VM signals) · Thunar + Brave · libfuse3 only · commit
`5192ad1` (contains #347 and #350). Every launch used an **isolated data dir** (`XDG_DATA_HOME=$(mktemp -d)`) and
a `timeout`, so the maintainer's live `claude` sessions were never resumed or rewritten.

**The headline: Task #347 is confirmed fixed on the exact box it was written for.** The boot line reads
`[recue] WebKitGTK: DMA-BUF left on — Mesa GPU present (healthy DMA-BUF) (gpus: nvidia[blob],i915[mesa]; nvidia:
open 610.43.03; vm: no; session: wayland)`, every evidence field matches `/sys` ground truth, and
`WEBKIT_DISABLE_DMABUF_RENDERER` is **absent** from the app's environment. PRIME offload and all three override
forms produce exactly their specified lines. **Task #350** is confirmed on two of its three scrub seams, caught
live under the AppImage: the login-shell PATH probe and the `claude --version` / `opencode --version` probes all
run with no `APPDIR`/`APPIMAGE`/`GTK_THEME`/`GDK_BACKEND`, no `LD_LIBRARY_PATH`, and a `PATH` free of
`/tmp/.mount_` — while WebKit's own helper processes correctly keep the full AppImage env.

**Findings (recorded, not fixed — the maintainer files these as cards)**

- **F1 — the AppImage cannot currently be built on Arch**, for two independent reasons: linuxdeploy's bundled
  `strip` can't parse Arch's `.relr.dyn` sections (`unknown type [0x13]`) and aborts (needs `NO_STRIP=1`); then
  `linuxdeploy-plugin-gtk.sh` dies on `cp: cannot stat '/usr/lib/gdk-pixbuf-2.0/2.10.0'`, because Arch's
  `gdk-pixbuf2 2.44.7-1` still advertises that dir in its `.pc` but no longer ships it. **CI (ubuntu-22.04) is
  unaffected** — but nobody can build or test the Linux artifact on the distro the Linux work is actually being
  done on.
- **F2 — cut a release containing #346–#351.** The **shipped v1.2.1 AppImage still has the #347 bug**: launching
  the published release on this box logs the pre-#347 line `set WEBKIT_DISABLE_DMABUF_RENDERER=1 (nvidia: true,
  vm: false, forced: false)`. **Every Linux user on the current release is still getting the forced-CPU webview
  that #347 diagnosed as itself the cause of the reported slowness.** All of #346–#351 are on `main` and
  unreleased.
- **F3 — the DMA-BUF checklist's verification instrument was structurally wrong.** The #347 checklist (and #365's
  own plan) said to confirm `WEBKIT_DISABLE_DMABUF_RENDERER=1` in `/proc/<pid>/environ`. That **cannot work**:
  `/proc/<pid>/environ` is the **exec-time snapshot** and never reflects a runtime `setenv()` — which is exactly
  what `linux_webkit`/`linux_gtk` do. Verified: with `RECUE_DISABLE_DMABUF=1` the boot line says "disabled" while
  `/proc/environ` shows no such var. Corrected inline in the doc ("read `env` in a ReCue shell terminal").
- **F4 — the terminal-pool WebGL diagnostic is unreadable from a terminal.** WebKitGTK does **not** forward the
  webview console to stderr, so `[recue] terminals: WebGL renderer: …` is only reachable through the WebKit
  inspector — making one whole box (#346's B4) and a clause of #347's D1 unverifiable headlessly **on every OS**.
  Proposed fix: report the renderer string through a small Rust `log_diagnostic` command.
- **F5 — a stale premise in the #346 checklist** (prose only, corrected in this PR): it asserted DMA-BUF is left
  on "(no log line)". Post-#347 there is **always** exactly one boot line, for both outcomes.

**Key decisions**

- **Depended on Tasks #347 and #350 and walked the *fixed* build** — the key judgment call. #347 rewrites the
  DMA-BUF decision *and* the #346 checklist itself (today's boot line being, per #347, the bug on this exact
  hybrid box), and #350 scrubs the AppImage env from the very `xdg-open`/`dbus-send`/`git`/`claude` child spawns
  that several boxes test. **Verifying earlier would have enshrined ticks that were stale on arrival.**
- **Nothing from the earlier research session was ticked on trust** — its AppImage-launch / DMA-BUF-log
  observations were pre-#347 and pre-#350, so they were re-verified against the branch build.
- **Tasks #348 (7 boxes) and #355 (3 boxes) merged to `main` *while this walk was running* and were deliberately
  left unwalked and unverified** — the artifact was built from `5192ad1`, which does not contain their code, so
  any verdict on them would have been **fabricated**. They need their own pass. This is precisely the staleness
  trap #365 exists to avoid.
- **Boxes covering absent environments stay unticked** with an explicit `N/A — not this box` scope note (no
  AMD/NVIDIA-only GPU, no GNOME/KDE/Cinnamon, no X11 session, no libfuse2).
- **Agent-vs-human split**: every headless check was performed by the implementer (PATH probe, `xdg-open`
  handlers, a verbatim `dbus-send` FileManager1.ShowItems, notification-daemon activatability, the `latest.json`
  `linux-x86_64` entry, GPU/`/sys` ground truth, the whole DMA-BUF override matrix). Every GUI-only step was
  handed to the maintainer as a **written checklist (M1–M10) with blank verdict slots**.

**Dependencies:** 347, 350.

**Notes**

- Two scope limits are stated in the doc: the **locally built AppImage does not prove CI's ubuntu-22.04 glibc
  floor** (it links Arch's — so the launch box was *also* walked against the real published artifact, which runs
  fine here), and the **performance verdicts are a snapshot of `5192ad1`** (#351/#353/#355/#356 move exactly those
  numbers).
- `scripts/linux-verify.sh` is read-only and reusable, so Ubuntu and Mint can be walked later unchanged.
- The updater end-to-end (download → replace → relaunch) is **blocked** until a newer release is published; only
  the signed `linux-x86_64` manifest entry and the app's own `APPIMAGE` env (a #350 regression check) were
  verifiable.

### 357. [x] Settings → Rendering (Linux-only): DMA-BUF + terminal-renderer overrides with a boot-decision readout

Tauri's own Linux graphics guidance explicitly recommends user-facing rendering-mode settings, because WebKitGTK
masks WebGL renderer strings and auto-detection is unreliable. Until now ReCue's only overrides were env vars
(`RECUE_DISABLE_DMABUF`, `WEBKIT_DISABLE_DMABUF_RENDERER`) — which a `.desktop` or AppImage launch never sees. This
fills the `RendererOverride` tri-state seam that #347 deliberately left open, and surfaces **what the auto-detection
actually decided at boot** so a user can diagnose rather than guess.

**What shipped** (branch `settings-rendering-linux`, PR
[#118](https://github.com/ErikdeJager/ReCue/pull/118), 2026-07-14):

- **A Linux-only Settings → Rendering section** — a dedicated pane (icon `MonitorCog`, after Appearance), filtered
  out of the nav on macOS/Windows by construction (`renderer_diagnostics` returns `null` there). A stale
  `"rendering"` deep-link clamps to the default pane.
- **DMA-BUF renderer control** (Auto / On / Off) — persisted as `linuxDmabufRenderer`, feeding #347's
  `RendererOverride`. Applies at the **next launch** (GTK reads the env once at init), with an inline "Restart
  ReCue to apply this" note shown **only** when the draft differs from the mode that was in effect at boot — so a
  fresh install never sees a spurious note.
- **Terminal renderer control** (Auto / WebGL / DOM) — persisted as `linuxTerminalRenderer`, applied **live** on
  Save: the `WebglAddon` is loaded/disposed on the *running* xterm, so **no pooled host is ever disposed** (the #18
  no-replay invariant) and the **shared glyph atlas is never cleared** (the #221 font-jumble bug).
- **A diagnostics readout + Copy button** — the exact boot line, its reason, the evidence the probes saw, what
  decided it, and the probed WebGL renderer string. Works with **zero terminals open** (the probe runs on demand).
  Backed by a read-only `renderer_diagnostics` command over a `OnceLock` captured at boot.
- **New shared `src-tauri/src/early_settings.rs`** — reads the settings blob straight off `sessions.json`
  **before `tauri::Builder`** (the Tauri `Store` only exists inside `.setup()`, i.e. *after* GTK init). Fail-open at
  every step, with an `include_str!("../tauri.conf.json")` identifier drift guard. **`linux_gtk.rs` (#349)
  converges onto it** — its duplicate `store_path` / `theme_from_store_json` / consts are deleted, retiring the
  duplication #349 had to introduce.

**Key decisions**

- **Precedence, and never a silently-broken setting**: a user-exported `WEBKIT_DISABLE_DMABUF_RENDERER` >
  `RECUE_DISABLE_DMABUF` > the persisted Setting > auto-detection. #347's rules 1–2 are untouched, and the setting
  is only consulted when no env override exists. Crucially, **when an env var wins, the pane says so** rather than
  letting the saved setting look mysteriously ineffective.
- **The polarity is the sharp edge here, and it is asserted in both directions.** The *setting* names the
  **renderer** (`on` = DMA-BUF on = `ForceKeep`); the *env var* names the **workaround** (`=1` = disable =
  `ForceDisable`). Getting this backwards would invert the user's intent, so `resolve_dmabuf_override`'s tests pin
  both directions.
- **A dedicated section, not rows inside Appearance** — these are engine/diagnostic switches plus a log readout, and
  a filtered `SECTIONS` array makes the whole thing vanish on macOS/Windows, leaving Appearance byte-identical there.
- **No in-app "Restart now" button** — a relaunch would kill every running agent's PTY. A Copy-diagnostics button
  (for bug reports) is offered instead.
- **No change to #347's detection logic**, to `isSoftwareWebGLRenderer`, or to any macOS/Windows behavior. Both
  settings default to `"auto"`, so existing installs are unchanged. No new dependency, no capability change.

**Dependencies:** 347 (whose `RendererOverride` seam this fills).

**Notes**

- **Verified on the real Arch/Hyprland box the original bug came from** (hybrid Intel i915 + NVIDIA-open
  610.43.03), against an isolated `XDG_DATA_HOME` so the developer's real `sessions.json` was never touched: **all
  five DMA-BUF scenarios** produce the correct boot line — no key → auto ("left on"); `off` → "forced off in
  Settings"; `on` → "forced on in Settings"; `RECUE_DISABLE_DMABUF=1` beats the setting; and a user-exported
  `WEBKIT_DISABLE_DMABUF_RENDERER` beats everything and is left untouched. The readout's evidence matches `/sys`
  ground truth exactly.
- Checks green: `cargo fmt --check`, `cargo clippy --all-targets -D warnings`, `cargo test` (252 pass),
  `npm run build`, `npm run lint`, `npm run format:check`, `npm test` (691 pass) — and the first-paint bundle is
  still within the #356 budget.

### 367. [x] Default terminal line height to 1.0 (one-time migrate the old 1.2 default)

The Settings → Terminal line-height default had been **1.2** since settings first shipped (#100). New installs and
users who never re-picked it wanted the tighter **1.0**. But because the settings blob persists opaquely and a
stored value wins over the default (`mergeSettings` is `{ ...DEFAULT_SETTINGS, ...raw }`), merely changing the
default fixes only *new* / never-saved installs — every install that ever saved settings has `terminalLineHeight:
1.2` persisted explicitly and would keep it. So the change also carries a **one-time migration** that bumps an
install still sitting on the old 1.2 default down to 1.0, while leaving any other deliberately-chosen value — and
any 1.2 a user re-picks *after* the migration — untouched.

**What shipped** (branch `task-367-terminal-line-height-1-0`, PR
[#120](https://github.com/ErikdeJager/ReCue/pull/120), merged 2026-07-14):

- **New default 1.0** — `DEFAULT_SETTINGS.terminalLineHeight` is now `1.0` (`store.ts`), and the pooled-terminal
  fallback `currentTerminalSettings.lineHeight` in `terminalPool.ts` tracks it (`1.0`), so an xterm created before
  `applyTerminalSettings` runs matches the new default.
- **A persisted one-time migration flag** — a new `terminalLineHeightMigrated: boolean` on the `Settings` interface
  (`types/index.ts`), defaulting **false** in `DEFAULT_SETTINGS` so an older blob lacking the key is back-filled
  `false` and thus eligible for the one-time bump — mirroring the `onboarded` precedent.
- **A pure, exported `migrateTerminalLineHeight(s)`** (`store.ts`) — returns `{ settings, changed }`: if already
  flagged, no-op; else bump *exactly* ~1.2 (`Math.abs(v - LEGACY_LINE_HEIGHT) < 1e-6`, `LEGACY_LINE_HEIGHT = 1.2`)
  to 1.0, always stamp the flag `true`, and report `changed` only when a value was actually bumped.
- **Wired into `applyBootState`** (the sole settings-load path) — computes the migration after `mergeSettings`,
  lands the migrated settings in the boot `set(...)` and live terminals, and — in the existing **main-window-only**
  side-effects block, beside the #58 canvas `migrated` persist — persists the blob **once** via `ipc.setSettings`
  only when a value was actually bumped (best-effort `.catch`). Detached windows show the migrated value but never
  persist (the main window owns settings persistence).
- **"Reset to defaults" preserves the flag** — the Settings handler now seeds the draft from `DEFAULT_SETTINGS`
  while preserving both `onboarded` **and** `terminalLineHeightMigrated`, so a reset-then-re-pick-1.2 can't re-arm
  the migration and clobber the deliberate value.

**Key decisions** (from `ASSUMPTIONS.md` Task 367)

- **One-time-flag over a schema/version system** — a single persisted boolean mirroring `onboarded` suffices; no
  settings-version machinery was introduced.
- **Exact-1.2 match with a defensive epsilon** — `1e-6` is far tighter than the 0.1 slider step (1.1/1.3 are 0.1
  away, so they never collide) yet robust to any FP drift; the slider emits `Number("1.2") === 1.2` exactly, so
  strict equality would also have matched.
- **Persist only when it actually bumped** — `changed = wasLegacy` minimizes writes; the flag is always `true`
  in-memory after boot, and the only way to change line height is `saveSettings` (which spreads in-memory settings),
  so a re-picked 1.2 always carries `flag: true` and can never be re-bumped — the one hole ("Reset to defaults")
  is closed by preserving the flag there.
- **Frontend-only** — the settings blob is opaque on the Rust side, so no backend change and no per-OS gating;
  identical on macOS, Windows, and Linux.

**Dependencies:** none. (Self-contained; independent of the concurrently-planned Tasks 366/368/369.)

**Notes**

- New unit tests cover the default value (`terminalLineHeight === 1.0`, `terminalLineHeightMigrated === false`), the
  migration (bump 1.2→1.0 with `changed: true`; leave 1.0/1.1/1.3/1.5/1.8 unchanged with `changed: false` while
  still stamping the flag; already-migrated 1.2 stays 1.2 — the re-picked-1.2 guarantee), and the `mergeSettings`
  back-fill of the new flag.

### 368. [x] Focus-follows-mouse — opt-in auto-focus of a hovered terminal panel

Until now a terminal (agent PTY or #72 shell) captured the keyboard only after a **click**. This adds an opt-in
"focus follows mouse" (sloppy focus) mode: when enabled, moving the pointer over a terminal panel focuses it
immediately, so keystrokes land without a click. Off by default, so today's click-to-focus stays the norm.

**What shipped** (branch `focus-follows-mouse`, PR
[#121](https://github.com/ErikdeJager/ReCue/pull/121), merged 2026-07-14):

- **A new opt-in boolean setting `autoFocusOnHover`** (`false` by default) on the `Settings` interface
  (`types/index.ts`) + `DEFAULT_SETTINGS` (`store.ts`) — added to the opaque settings blob, so **no Rust change** and
  **no `applySettingsEffects` wiring** (it's read **live** per-hover via `useStore((s) => s.settings.autoFocusOnHover)`).
  `mergeSettings` back-fills `false` for an older blob and preserves a persisted `true`.
- **A Settings → Behavior "Focus panels on hover" checkbox** + help line (`Settings.tsx`), using the existing
  `Checkbox`/`field`/`helpText` patterns; toggling + Save persists it and takes effect without a restart.
- **A pure `shouldHoverFocus(enabled, activeElement)` helper** (new `Terminal/hoverFocus.ts`) — the focus-steal
  guard: returns `false` when disabled; when enabled, skips stealing focus from a real editable field
  (`INPUT`/`TEXTAREA`/`SELECT`/`contenteditable`) so a FileViewer/Kanban raw `<textarea>`, a rename input, or a modal
  field is never interrupted — but treats xterm's own helper `<textarea>` (inside `.xterm`) as OK to leave, so
  moving **between** terminals does move focus. Unit-tested (`hoverFocus.test.ts`).
- **A single `onMouseEnter` handler on the terminal body wrapper** in `Terminal.tsx` that calls
  `terminalPool.focusTerminal(sessionId)` behind the guard. Because `Terminal.tsx` is the sole render site for both
  the `agent` and `terminal` kinds (via `ItemContent`), this one change covers **every** view — Overview, Canvas,
  big mode — and both window types (main + detached).

**Key decisions** (from `ASSUMPTIONS.md` Task 368)

- **Only the two xterm-backed panel kinds are hover-focus targets** — non-xterm panels (FileViewer, DiffInspector,
  Kanban, FileTree, Scheduled, Recurring, pending template) have no single keyboard-capture element and would fight
  their own inputs, so they are deliberately left alone.
- **`onMouseEnter` on the body wrapper, not the header** — hover intent that fires once per pointer entry (no focus
  spam), ignores touch taps, and keeps the header's drag handle / action buttons usable.
- **Hover moves keyboard focus only** — it does **not** move the Canvas "active leaf" highlight (that stays
  `pointerDown`-driven), so the visual selection doesn't jump with the mouse.
- **Detached windows** pick up the setting on their own `init()` load; a live toggle reaches a detached window on its
  next load — consistent with how the settings blob propagates today.
- **Cross-platform:** pure WebView/DOM event handling, no OS-specific key handling — identical on macOS, Windows,
  and Linux.

**Dependencies:** none. (Self-contained; inert unless the user opts in.)

### 369. [x] Unique repo colors first — prefer an unused palette color for a new folder

A new top-level folder's default repo color (#35) was a hash of its path into the 14-entry `REPO_PALETTE`, so
distinct folders frequently collided on the same color. This makes each **newly-added** folder visually distinct:
it now takes a palette color **not already used** by another folder, only repeating once every palette color is in
use. Existing folders are grandfathered (never recolored).

**What shipped** (branch `task-369-unique-repo-colors`, PR
[#122](https://github.com/ErikdeJager/ReCue/pull/122), merged 2026-07-14):

- **A pure `sidebarRepos(recents, sessions, recurrings)` helper** (`store.ts`) — the canonical top-level-folder set
  (`repoOrder(recents ∪ worktreeParents ∪ recurringCwds, non-worktree sessions)`), mirroring `pruneMissingFolders`,
  so worktree **child** dirs (nested, sharing the parent's color) are never assigned a stray color.
- **A pure, unit-tested `pickRepoColor(path, colors, existingRepos)` helper** (`store.ts`, after `repoColor`) —
  returns the **first unused** `REPO_PALETTE` color (in palette order), where "used" is each *other* current
  folder's **effective** color (`repoColor(r, colors)` — user override / prior assignment, else hashed default);
  falls back to the stable hashed default (`repoColor(path, {})`) once all 14 are in use. Deterministic; a
  user-override color outside the palette consumes no slot; ignores `path`'s own color.
- **A main-window-only `useStore.subscribe` block in `init()`** (guarded by a module-level `folderColorSubStarted`
  flag against StrictMode double-invoke) — seeds `knownRepos` from the **post-boot** folder set (so boot-present
  folders are grandfathered), then on any change to `recents`/`sessions`/`recurrings` (cheap reference-equality
  gate) assigns + **persists** (`setRepoColor` → existing `set_repo_color` / `repo_colors` storage) a distinct color
  to each folder that appears afterwards and has none, threading an accumulating colors map so a batch of new
  folders each avoid the others' just-picked colors.

**Key decisions** (from `ASSUMPTIONS.md` Task 369)

- **First-unused-in-palette-order**, not random-among-unused — deterministic, stable, testable.
- **Fallback once all 14 are used** is the existing stable hash default (matches today's pick), not round-robin.
- **Auto-assigned colors persist** via the same `repo_colors` map as user overrides, so a folder keeps its color
  permanently; a user override or prior assignment always wins and is never overwritten. **No Rust change** — reuses
  the #35 storage.
- **Grandfather boot-present folders** — `knownRepos` is seeded from the post-`applyBootState` set, so the feature
  only affects folders added afterwards.
- **Main window only** — it owns the `set_repo_color` write and the window-global recents/sessions/recurrings, so a
  detached window can't double-assign. **Known limitation (recorded):** a detached canvas window open when a folder
  is added shows the new color only on its next boot (repo colors have no live cross-window broadcast today).
- **Cross-platform:** pure TS/WebView, no OS-specific paths — identical on macOS, Windows, and Linux.

**Dependencies:** none. (Self-contained; reuses the #35 `set_repo_color` / `repo_colors` storage.)

### 366. [x] Settings → Appearance: display-size slider (UI scaling)

A **Display size** slider was added to Settings → Appearance that scales the whole app UI up and down like
browser-zoom, starting at **100%** (normal). A user can enlarge the entire interface (text, controls, spacing,
panels) for readability or shrink it to fit more on screen — one uniform control.

**What shipped** (branch `settings-appearance-display-size`, PR
[#123](https://github.com/ErikdeJager/ReCue/pull/123), merged 2026-07-14):

- **A new `displaySize` setting** (integer percent, default **100**) on the `Settings` interface (`types/index.ts`)
  + `DEFAULT_SETTINGS` (`store.ts`) — in the opaque settings blob, so **no Rust change**; `mergeSettings` back-fills
  `100` for an older blob.
- **A pure, unit-tested `displayZoom(percent)` helper** (`store.ts`, beside `accentCompanions`, with exported
  `MIN_DISPLAY_SIZE = 80` / `MAX_DISPLAY_SIZE = 150`) — clamps to [80, 150], returns `null` at exactly 100 (so the
  caller *clears* the property and a default install is byte-for-byte unchanged) and `null` for a non-finite input,
  else the multiplier string (e.g. `125 → "1.25"`).
- **Applied as CSS `zoom` on `<html>`** in `applySettingsEffects` — `removeProperty("zoom")` at 100, else
  `setProperty("zoom", zoom)`. Runs on **both** boot (`applyBootState`) and Save, in **every** window with a store
  (including a detached canvas window on its own boot). The visible terminals refit automatically via their
  `ResizeObserver` (the zoom is a layout change); no extra pool call.
- **A "Display size" `Slider`** (80–150%, step 5%) + help line in the Appearance section (`Settings.tsx`), reusing
  the shared `Slider` (#122); staged in the modal draft and applied on Save.

**Key decisions** (from `ASSUMPTIONS.md` Task 366)

- **CSS `zoom` on `<html>`, not root font-size** — the type/spacing tokens are **px-based** (and many CSS Modules use
  raw px), so a root font-size change wouldn't propagate; `zoom` is the only uniform whole-app scale and is supported
  on all three WebViews (WKWebView / WebView2 / WebKitGTK). Native `Webview::set_zoom` was kept only as a documented
  fallback, not implemented.
- **Terminals scale with the display zoom** (they reparent into `#root`) — accepted as the correct "display size"
  behavior; the terminal font-size/line-height settings stay **independent** as the base size (effective size =
  terminalFontSize × displayScale), and cols/rows are scale-invariant (FitAddon measures container and cell in the
  same zoomed space). No per-terminal counter-zoom.
- **Default 100% clears the property entirely** (a no-op), so a default install is unchanged; range 80–150%, step 5%
  chosen for safe layout + accessibility.
- **No pre-paint mirror** (no `index.html` boot-script / #348 `--bg-base` change) — display size settles post-boot
  like accent / Overview-min-width, accepting a one-frame settle; only theme is pre-painted.
- **Pure frontend** — opaque settings blob, so no Rust/capability change. A live change reaches an already-open
  detached window only on that window's next boot (same as live theme changes today).
- **OS file-drop hit-testing** (`osFileDrop.ts` `targetAt`) flagged for real-box verification at non-100% zoom;
  adjust by the scale only if a drop lands wrong (conditional, not touched pre-emptively).

**Dependencies:** none. (Self-contained; independent of the sibling Tasks 367/368/369.)

### 370. [x] Expandable "all usage" viewer in the sidebar (adaptive, collapsed by default)

The sidebar-footer Claude usage bar (#154) only ever showed the **5-hour** window. This adds a collapsed-by-default
disclosure — a small up-chevron left of the reset countdown — that expands a box listing **every** usage window
Anthropic's API reports (5-hour, weekly, …), each with its own percentage, mini bar, and reset countdown. The list
is **adaptive**: it renders whatever buckets the API returns, so a new metric Anthropic adds appears automatically
with no code change.

**What shipped** (branch `task-370-all-usage-viewer`, PR
[#124](https://github.com/ErikdeJager/ReCue/pull/124), merged 2026-07-14):

- **Backend (`usage.rs`)** — a new serializable `UsageBucket { key, usedPercent (clamped 0–100), resetsAt }` and a
  pure `parse_buckets(v)` that iterates the response object and pushes one bucket per top-level object carrying a
  **finite** `utilization`/`used_percentage` number (non-objects / metadata without a percentage are skipped — the
  adaptivity guard), reusing `value_to_string` for `resets_at`. `UsageSnapshot` gains `buckets: Vec<UsageBucket>`;
  `parse_snapshot` keeps the existing `five_hour` extraction **byte-for-byte** (a missing `five_hour` still returns
  `None` and hides the bar) and sets `buckets: parse_buckets(v)`. New tests cover multi-bucket, an **unknown** key,
  a skipped non-numeric bucket, and clamping.
- **IPC + store** — `UsageBucket` mirrored in `ipc.ts` (`buckets` on `UsageSnapshot`); the store `usage` slice gains
  `buckets: { key, usedPercent, resetsAtMs }[]`, mapped in `refreshUsage` (bucket `resetsAt` → `resetsAtMs` via
  `parseResetsAt`), with `buckets: []` added to every unavailable/reset literal (the required field made `tsc`
  enumerate each site).
- **Pure helper (`usageBuckets.ts`)** — `humanizeUsageLabel(key)` (known-key map + a generic fallback:
  underscores→spaces, capitalized, so a brand-new key renders sensibly), `orderUsageBuckets` (five_hour first,
  seven_day next, unknown keys last, alphabetical tie-break), and `prepareUsageBuckets` attaching labels in order.
  Unit-tested (`usageBuckets.test.ts`).
- **UI (`UsageBar.tsx` + `Usage.module.css`)** — a transient `expanded` state (default collapsed), a chevron
  disclosure button in the meta row, and an expandable `.box` (rendered as the first child so it grows upward from
  the sidebar bottom) mapping `prepareUsageBuckets` to rows (label · mini bar · percent · own countdown), reusing the
  `now` tick and the per-bucket `critical` (≥90%) fill classes/tokens. Hidden in the collapsed rail and the empty
  hairline state.

**Key decisions** (from `ASSUMPTIONS.md` Task 370)

- **Expanded/collapsed state is transient** (local component state, collapsed each launch) — not persisted.
- **`five_hour` stays the "primary"** — the bar fill, countdown, and auto-continue arming are byte-for-byte
  unchanged, and a missing `five_hour` still hides the whole bar; the expanded box lists all buckets including the
  5-hour one for a complete picture.
- **Adaptivity by surfacing all buckets generically** — any top-level object with a numeric utilization becomes a
  bucket; the frontend iterates and humanizes unknown keys, so new Anthropic metrics auto-appear.
- **Fail-open + Claude-only preserved** — an unexpected shape yields an empty `buckets` list (box shows just the
  primary) or `None` (bar hides), never a crash; the `showSessionUsage` / `isClaudeActive` gates are untouched. No
  new Tauri command, no polling-cadence change, no token-read/Keychain change.
- **Tokens only + reduced-motion** — the box uses design tokens (Dark/Light/custom-accent) and any transition is
  dropped under the global reduced-motion killswitch; pure WebView, identical on macOS/Windows/Linux.

**Dependencies:** none. (Extends the already-landed usage bar #154; self-contained.)

### 371. [x] Focus-on-hover moves the selection border to the hovered panel and unfocuses the agent on entering another panel

Extends the opt-in "Focus panels on hover" setting (#368, `autoFocusOnHover`, default off): with it on, moving the
mouse into **any** Overview card or Canvas panel now also moves the visible selection/highlight border there — and
entering a panel with no terminal input (diff, file, kanban, filetree, scheduled, recurring, pending, or an agent
panel owned by another window per #84) **blurs** the previously focused agent xterm, so the user can never see the
border on one panel while keystrokes silently keep flowing to another. This deliberately **reverses #368's recorded
decision** ("hover moves keyboard focus only, never the highlight") — exactly what the card asked for. With the
setting off, behavior is byte-for-byte unchanged.

**What shipped** (branch `task-371-hover-select`, PR
[#126](https://github.com/ErikdeJager/ReCue/pull/126), merged 2026-07-14 into `ui-rework`):

- **Pure helpers (`Terminal/hoverFocus.ts`)** — `shouldHoverSelect(enabled, buttons, activeElement)` wraps the #368
  `shouldHoverFocus` guard with a `buttons === 0` check so a dnd-kit drag / any held pointer button never sprays
  hover-selects; `focusedTerminalElement(activeElement)` returns the focused element iff it lives inside `.xterm`
  (the pooled xterm helper `<textarea>`), else `null`. Both unit-tested in `hoverFocus.test.ts` (node-env fakes).
- **Pool blur API (`Terminal/terminalPool.ts`)** — new `blurTerminals()`: clears the pool's `pendingFocus` request
  (so a queued #351 focus can't land after the pointer moved on) and blurs the focused xterm element via
  `focusedTerminalElement`. Plain DOM `blur()` — never disposes a host (#18).
- **Canvas (`CanvasSurface.tsx` `LeafPanel`)** — an `onMouseEnter` handler on the panel root: skip while
  `dragActive`; guard via `shouldHoverSelect`; derive the locally-rendered PTY id (agent/terminal content that is
  `ownedHere` per #84's `useSessionOwners`) → `focusTerminal(ptyId)` else `blurTerminals()`; then
  `setActiveLeaf(leaf.id)` if not already active (which syncs `selectedId`/sidebar via the existing #79 path).
  Works identically in detached canvas windows (own store/pool/document).
- **Overview (`Overview.tsx`)** — `PanelColumn` gains an optional `ptyFocusId` prop + the same guarded hover
  handler (focus-or-blur, then the card's select action when not already selected); `SessionCard` passes the
  session id when `ownedHere`, `ExtraPanel` passes the panel id only for shell-terminal panels (a terminal panel's
  PTY id **is** the panel id); file/diff/kanban/filetree and Schedule/Recurring cards pass nothing ⇒ blur. A
  module-scoped `hoverSelecting` flag, raised just before a hover select and consumed by the `[selectedId]`
  scroll effect, keeps a hover-driven select from `scrollIntoView`-ing the wall (scrolling would drag cards under
  the stationary cursor and cascade selections); explicit selects still scroll.
- **Copy/docs** — Settings → Behavior help text and the `autoFocusOnHover` doc comment (`types/index.ts`) now
  describe the border-follow + unfocus extension.

**Key decisions** (from `ASSUMPTIONS.md` Task 371)

- **Unfocus fires on ENTERING another panel** (the moment the border jumps), not on leaving into dead space,
  the sidebar, or the tab strip — mousing to the sidebar to click something never interrupts typing.
- **The #368 text-field guard covers the whole behavior** — while an INPUT/TEXTAREA/SELECT/contenteditable outside
  `.xterm` has focus (rename field, FileViewer/Kanban textarea, modal field), hover changes nothing, not even the
  border (otherwise the Canvas active-leaf focus effect would steal focus from the field).
- **Existing selection affordances reused as-is** — Overview's `cardSelected` ring via the card's select action
  and Canvas's `panelActive` ring via `setActiveLeaf`; no new CSS, no new setting, no persistence changes.
- **Big mode and sidebar rows are out of scope** (no panel-border semantics); `Terminal.tsx`'s #368 body-level
  handler stays unchanged (it also covers big mode, and a recurring card's embedded child terminal).
- Pure WebView/DOM (React `onMouseEnter`, `document.activeElement`, `blur()`, `MouseEvent.buttons`) — identical on
  macOS, Windows, and Linux; no Rust, no platform seams; rollback = revert (additive, fully behind the opt-in).

**Dependencies:** none.

### 372. [x] UI v2 (1/12): Design foundation — v2 tokens (crust stage, square corners, mono scale), JetBrains Mono as --ui everywhere, pre-paint invariant, shared UI atoms

The foundation card of the **"UI v2" reskin epic** (12 cards, spec `docs/ui-v2-handoff/DESIGN-SPEC.md` + the
`ReCue-v2-demo.html` reference demo — **where prose and demo disagree, the demo wins**; hard constraints: no
glass/blur, OS titlebar untouched, zero functionality lost, no accent colors added or changed, the epic ships as
v2.0.0 only after card 12/12 — no version bump / patch notes here). Every later "UI v2" card consumes what this
one lands.

**What shipped** (branch `task-372-ui-v2-foundation`, PR
[#127](https://github.com/ErikdeJager/ReCue/pull/127), merged 2026-07-14 into `ui-rework`):

- **`tokens.css` rework (§2)** — canonical surface roles `--surface-crust #11111b` (content stage/wells) /
  `--surface-mantle #181825` (chrome) / `--surface-base #1e1e2e` (panels) / `--surface-0 #313244` /
  `--surface-1 #45475a`, with the legacy tokens repointed as aliases (`--bg-sidebar`→mantle, `--bg-panel`→base,
  `--bg-elevated`→surface0, `--bg-hover`→surface1, `--content-bg`→crust) and `--bg-base` now the **literal crust**
  `#11111b` (the window/stage). Square-by-default geometry: `--radius-control`/`--radius-chip` → **0**, new
  `--radius-chrome 7` / `--radius-chrome-sm 5` / `--radius-btn 6` / `--radius-micro 4` for sidebar-chrome exemptions
  (`--radius-window 10` / `--radius-dot 999` kept). Mono type scale (`--fs-ui 12` · new `--fs-row 11.5` ·
  `--fs-meta 11` · `--fs-meta-sm 10.5` · `--fs-meta-xs 10` · new `--fs-micro 9.5` · terminal/diff 10.5 w/ lh
  1.55/1.65 — cosmetic, xterm size stays a user setting). Floating-chrome shadow tokens `--shadow-menu` /
  `--shadow-modal` / `--shadow-toast` (§2.5) with `--shadow-popover` kept as a legacy alias for the 27 existing
  consumers. Stage vars `--stage-gap 8px` / `--stage-pad-overview 12px` / `--stage-pad-canvas 10px` + the
  `:root.dense` zero-override hook (card 2 wires ⌘D/setting; cards 5/6 consume). Accent tint derivation §2.2:
  `--accent-tint-fill/-border/-hover` = `color-mix(in srgb, var(--accent) 10%/35%/18%, transparent)` on `:root` so
  every existing swatch AND an inline custom accent track live (`accentCompanions` untouched). `--status-idle` →
  `#45475a` (Surface1, §2.1); `--busy-sheen` deleted with the sheen.
- **JetBrains Mono everywhere (§2.3)** — `--ui` is now the same literal mono stack as `--mono` on ALL OSes; the
  Linux-only Inter seam (#363) is retired: the `:root[data-platform="linux"]` block and `src/styles/fonts.css` are
  deleted, `@fontsource-variable/inter` is uninstalled, and `@fontsource/jetbrains-mono/600.css` is added (v2 leans
  on weight 600). The `data-platform` attribute machinery **stays** as the platform-CSS seam — only its one CSS
  consumer retired. `platform.test.ts`'s #363 font block replaced by a v2 guard (single `--ui` declaration leading
  with "JetBrains Mono", ending in `monospace`, no `data-platform` selector in tokens.css).
- **Pre-paint invariant moved Base→Crust (#348)** — dark `#11111b` / light `#dce0e8` across ALL five synced sites:
  tokens.css `--bg-base` (both theme blocks), `index.html`'s inline style, `THEME_BG` in `src/theme.ts`,
  `background_for_theme()` in `commands.rs` (+ its two unit tests), and `tauri.conf.json` `backgroundColor` (the
  fifth site, newly called out). `global.css` `.main` now paints `var(--bg-base)` so the first frame matches the
  native pre-paint color. `theme.test.ts` gains a "v2 foundation tokens" guard (stage vars + dense hook +
  accent tints).
- **Light theme remapped, not regressed (#333)** — the Latte block redefines the five surfaces (crust `#dce0e8`,
  mantle `#e6e9ef`, base `#eff1f5`, surface0 `#ccd0da`, surface1 `#bcc0cc`); `--terminal-bg/-fg/-selection` stay
  **independent literals** so the terminal remains dark in light mode; soft light shadow variants added. Polish
  deferred per §13 — functional only.
- **Shared atoms** — new `src/styles/atoms.css` (imported in `main.tsx`): `.btn` block buttons (26px;
  `.btn-accent` 10% tint fill / 35% border / 18% hover with plain `--accent-dim` fallbacks before each color-mix,
  `.btn-neutral`, `.btn-primary`, `.btn-ghost`, `.btn-icon[-sm/-lg]`), `.chip-count` (Surface0 pill — demo wins
  over the spec's "crust pill" prose), `.kbd-hint` / `.kbd-hint-onfill` / `.kbd-chip`. New
  **`SegmentedControl`** primitive (generic options/value/onChange, ARIA tablist + roving tabindex ported from
  ViewSwitch; square panel look default, rounded `chrome` variant well-7/thumb-5/20px) — ViewSwitch's **expanded**
  mode now renders through it (compact rail mode untouched, card 4 owns the rail). **Checkbox** → 15×15px,
  `--radius-micro`, crust off-well, accent fill + `--accent-fg` check. **BusyIndicator** → 7px dot + 2.5px
  color-mix-tinted ring in the same fixed 14px slot (#95), running = blue + 1.6s opacity pulse 1→.4 (sheen/
  `busy-shimmer` removed; reduced motion freezes the pulse solid), settled = steady yellow + ring, fresh = gray
  Surface1 dot, no ring — visual only, the 3-state + sticky semantics (#315) untouched.
- **CLAUDE.md minimal touch** — pre-paint hex parentheticals + the #363 font-seam notes corrected (the full doc
  sweep is card 12).

**Key decisions** (from `ASSUMPTIONS.md` Task 372)

- **Transitional visuals are accepted** — flipping the radius tokens to 0 squares sidebar/modal inner controls
  until cards 4/9/10 re-round them via the new chrome radii; functional parity is unaffected.
- **tauri.conf.json `backgroundColor` is a fifth synced pre-paint site** (covered by review only — the tests guard
  the other four); light pre-paint = Latte crust `#dce0e8`.
- **Terminal-stays-dark invariant kept** by keeping the terminal tokens literals, never `var(--surface-crust)`.
- **No italic mono faces bundled** — `em` text renders synthetic-oblique (the demo ships none either).
- Bundled-font + token CSS only — identical on macOS, Windows, and Linux; retiring the Inter seam *removes*
  Linux-only divergence. Rollback = revert the PR (no persisted-data/IPC/settings-shape changes).

**Dependencies:** none. (Foundation for UI v2 cards 2–12.)

### 376. [x] UI v2 (11/12): Toast rework — bottom-center blocks with Lucide tone icons

Card 11 of the UI v2 reskin epic (spec §10 + the reference demo; **no version bump / patch notes** — the epic ships
as v2.0.0 after card 12). Toasts move from the small bottom-right stack (#32) to larger **bottom-center** blocks,
each led by a Lucide icon that encodes its tone — with the store API, click-to-dismiss, auto-dismiss, stacking, and
reduced-motion behavior preserved exactly.

**What shipped** (branch `task-376-toast-rework`, PR
[#128](https://github.com/ErikdeJager/ReCue/pull/128), merged 2026-07-14 into `ui-rework`; entirely inside
`src/components/Toaster/`):

- **`Toaster.module.css`** — the container is now fixed bottom-center (`left: 50%` + `translateX(-50%)`,
  `bottom: 22px` demo-exact, column stack with 8px gaps, `z-index: 70` kept). Each toast: `min-height: 34px`,
  `max-width: min(520px, calc(100vw - 32px))`, `padding 14px` horizontal, Base `var(--bg-panel)` background,
  uniform `var(--border-strong)` hairline, `var(--radius-window)` (floating chrome ~10), `var(--shadow-toast)`,
  `var(--fs-row)` 11.5px primary text (the shadow/type/surface tokens from Task 372), `overflow-wrap: anywhere`
  on the message. The 180ms `toast-in` rise stays a plain CSS animation on `var(--dur-slow) var(--ease-out)`
  animating `translateY` on the child only (the container owns the centering transform — no transform clash), so
  the global reduced-motion killswitch drops it for free.
- **`Toaster.tsx`** — a `toneIcon(tone)` helper renders a leading 13px `aria-hidden` icon span: success →
  `Check` (strokeWidth 2.5, demo-exact) in `--status-done`, error → `CircleAlert` in `--status-error`, info →
  `Info` in `--accent`. The old tone **border** overrides are gone — tone is encoded solely by the icon color.
  Component shape untouched: one `<button>` per toast, `role="status" aria-live="polite"`, `title="Dismiss"` +
  aria-label, click → dismiss. Both mounts (MainApp + detached CanvasWindow, each its own store/document) work
  unchanged.
- **`toaster.test.ts`** (new) — a node-env file-content guard (platform.test.ts idiom) pinning bottom-center
  positioning (no `right:` anchor), the v2 tokens (`--shadow-toast`/`--radius-window`/`--bg-panel`/
  `--border-strong`), the `--dur-slow`/`--ease-out` rise, and the tone-icon mapping (TSX names + status colors).

**Key decisions** (from `ASSUMPTIONS.md` Task 376)

- **Toasts are floating chrome (rounded), not square** — `--radius-window` (10px) over the demo's literal 9px,
  keeping the shared token per spec §10's "radius ~10".
- **TTL stays 3500ms and the store is untouched** (`pushToast`/`dismissToast`/`ToastTone`/`TOAST_TTL_MS`
  zero-diff) — spec prose suggested ~2.2s, but real app messages are longer than the demo's mocks, and 3500 keeps
  `store.test.ts`'s fake-timer test byte-for-byte green.
- **`z-index: 70` kept** (the app's own stacking scale, under the update overlay 200 / BigMode 220) — the demo's
  90 belongs to the demo's scale.
- **The demo's `white-space: nowrap` deliberately dropped** — real messages (multi-item tab-close summaries,
  pathy errors) wrap inside the max-width; short toasts still render the demo's 34px single line.
- **Stacking kept from v1** (the demo shows only one toast): centered column, newest nearest the bottom edge.
- Pure CSS transforms/flex + two newly tree-shaken Lucide icons — no color-mix, no platform code; identical on
  WKWebView/WebView2/WebKitGTK. Rollback = revert the PR (component-local; no store/IPC/persistence surface).

**Dependencies:** Task 372.

### 373. [x] UI v2 (2/12): Settings rework — §10 modal reskin, complete Shortcuts section (⌘F/⌘D), dense panels end-to-end (⌘D), and the new v2 settings

Card 2 of the UI v2 reskin epic (spec §10 + demo; **no version bump / patch notes**). Reskins the Settings modal
onto the v2 design, completes the Shortcuts reference, and ships the new v2 settings — dense panels fully
functional, plus two persisted-but-visually-inert flags whose consumers land in cards 3/5, and a random-accent
sentinel.

**What shipped** (branch `task-373-settings-rework`, PR
[#129](https://github.com/ErikdeJager/ReCue/pull/129), merged 2026-07-14 into `ui-rework`):

- **Schema (`types/index.ts` + `DEFAULT_SETTINGS`)** — three new `Settings` fields:
  `backgroundAnimation: true` (consumer = card 3's wave), `densePanels: false`, `capAgentWidth: true`
  (consumer = card 5's Overview). Zero Rust changes (the blob is opaque); `mergeSettings` back-fills legacy blobs
  (unit-tested). `accentColor` gains the `"random"` sentinel in its contract.
- **Dense panels end-to-end (§9)** — `applySettingsEffects` toggles a **`dense` class on `<html>`** (the Task-372
  `:root.dense` hook zeroes `--stage-gap`/`--stage-pad-overview`/`--stage-pad-canvas`); a `toggleDensePanels`
  store action persists via `saveSettings` and toasts the demo's exact "Dense panels on/off"; **⌘D / Ctrl+D** in
  `useKeyboardNav.ts` (capture phase, `e.code === "KeyD"`, works over a focused terminal) — main-window-only
  (swallowed-but-inert in detached windows, like ⌘N/⌘B/⌘K/⌘T) and inert while the Settings modal is open so a
  stale draft can't clobber the toggle on Save; an Appearance "Dense panels" checkbox (with a kbdHint help line)
  rides the normal draft/Save path silently. Visible tiling waits on cards 5/6 consuming the stage vars.
- **Random accent** — a **"?" swatch** after the 14 palette swatches persists `accentColor: "random"`; pure
  `randomPaletteAccent(rand?)` + per-launch-memoized `resolvedRandomAccent()` resolve it to a `REPO_PALETTE`
  member once per window document per run (re-saves never re-roll; each launch rolls fresh), applied exactly like
  any accent (inline `--accent` + `accentCompanions()`; the 372 tint tokens track it). No palette values added or
  changed; `""`/hex behavior byte-for-byte as before.
- **Shortcuts complete** — `shortcuts.ts` gains **⌘F "Global search"** and **⌘D "Toggle dense panels"**; every
  existing entry kept (the #318 grouped superset, not the demo's 5 rows); rows restyled label-left /
  `.kbd-chip`-right (the 372 atom); a completeness test pins the full card map ⌘N ⌘⇧N ⌘B ⌘K ⌘F ⌘T ⌘E ⌘\ ⌘1–9 ⌘D.
- **Modal reskin (`Settings.module.css`)** — dialog `min(740px, 92vw) × min(540px, 88vh)` (supersedes #119's
  720×600; CLAUDE.md line updated), 190px mantle nav with 30px items (active Surface0 + 600), content 18/20px,
  footer Reset · Cancel / accent Save (28px, `--radius-chrome`); segmented rows restyled to 26px crust-well /
  Surface0-active (the accent no longer encodes selection state); 24px round swatches with the own-color ring
  (`currentColor`); inputs/buttons swept off the now-zero `--radius-control` onto the chrome radii. All
  token-driven; light theme stays functional. **Slider restyle** (deferred here by PLAN-372): 4px crust track,
  12px round accent thumb.
- **Tests** — defaults/legacy-merge, `randomPaletteAccent` determinism + palette membership,
  `resolvedRandomAccent` memoization, `toggleDensePanels` flip + toast strings, shortcut-map completeness.

**Key decisions** (from `ASSUMPTIONS.md` Task 373)

- The card's "new Shortcuts section" = **completing** the existing #318 section (⌘F/⌘D added), not recreating it.
- **Segmented rows stay plain-button markup** restyled to the demo's values rather than adopting the 372
  `SegmentedControl` atom (whose looks are 20/22px) — smaller diff, demo-exact, zero behavior risk.
- The toast fires on the **⌘D path only**; the checkbox path saves silently like every other setting.
- All 14 palette swatches and the fully functional Light theme kept (demo showed 10 / mocked light) — the parity
  constraints win over the demo. Dialog radius = the shared `--radius-window` token, not the demo's literal.
- Settings stay main-authoritative with no cross-window broadcast — a detached window adopts dense/random-accent
  at its next boot (same staleness as theme/accent today); a detached window rolls its random accent
  independently.
- Rollback = revert the PR; a downgrade reading `"random"` as a hex fails gracefully (cosmetic only).

**Dependencies:** Task 372.

### 374. [x] UI v2 (4/12): Sidebar reskin — top action cluster, §5 tree metrics, footer (update pill + usage meter), first-launch empty block, §6 collapsed rail

Card 4 of the UI v2 reskin epic (spec §5–6 + demo; **no version bump / patch notes**). Reskins the whole sidebar —
expanded tree, collapsed rail, and footer — onto the v2 language with **zero functionality lost** (a reskin, not a
rearchitecture: every dnd-kit listener, context-menu handler, and onClick chain left byte-identical).

**What shipped** (branch `task-374-sidebar-reskin`, PR
[#131](https://github.com/ErikdeJager/ReCue/pull/131), merged 2026-07-14 into `ui-rework`):

- **Top cluster** — New session is a 26px full-width accent block via the 372 atoms
  (`.btn .btn-accent .btn-chrome`, 12px Plus, right-aligned ⌘N `.kbd-hint-onfill` via `kbdHint`); Schedule session
  is the same 26px format in neutral (clock icon, ⌘⇧N) beside a 26×26 neutral `⋯` block (existing dots menu
  untouched); label truncation (#301/#317) preserved.
- **Tree metrics (§5)** — repo header 24px (12px repo-colored folder icon, name 600 `--fs-row`, count →
  `.chip-count` Surface0 pill, **hover-revealed in-flow `+`** — space reserved, `:focus-visible` also reveals;
  empty repo keeps the always-visible accent `+` + dimmed name); branch label 17px; agent rows 26px indented 12px
  under the branch label with **Surface0 selection fill** (replacing the accent-dim + border-left), secondary→
  primary title, `--fs-micro` diff counts, red `--status-error` hover ✕ (the #344 zero-shift trailing slot kept);
  item rows 22px; worktree header 20px with children indented 24px; 8px between repo groups; 1px row gap from the
  container; row hover wash = `color-mix(text-primary 4%)` with a plain token fallback first.
- **Footer** — update pill = 28px transparent hairline block (`--radius-chrome`, accent 12px download icon, 11px
  title / 10px muted version; #287 glow + error + collapsed variants kept; still deep-links Settings→Updates);
  usage meter = 10px meta row over a **4px inset crust track** with rounded accent fill (`.meter` class added
  beside `.track`; the empty state keeps today's full-bleed hairline separator; ≥90% critical red + the **#370
  expandable all-usage box kept**, box radius → `--radius-chrome-sm`); icon row = 26×26 ghost buttons, feedback
  button (+ #241 nudge) expanded-only.
- **First-launch empty block** — when `booted && repos.length === 0 && cloningRepos.length === 0`, the tree area
  shows a centered block (FolderOpen icon, "No folders yet", two-line explainer, neutral **Open a folder…** →
  `addFolder()` and **Clone a repo…** → `openCloneRepo()`); the same flag hides the update pill, auto-continue
  prompt, and usage meter; the background context menu still opens on the empty area.
- **Collapsed rail (§6)** — 44px: 28×28 accent-tinted `+` (tooltip w/ ⌘N hint), hairline dividers, Overview/Canvas
  as 28×28 ghost icon buttons with Surface0 active (ViewSwitch `compact` de-welled, icons 16→14, tablist/arrow-key
  nav intact), per-repo 28×26 folder icons (tooltip "repo — N sessions") over 7px activity-dot buttons whose
  tooltips gain the state suffix via the new pure `railDotState(busy, hasBeenActive)` helper (+ unit test),
  worktree glyph + phantom clone rows kept. The rail's Schedule and bug-report buttons are **removed** (both stay
  one interaction away: ⌘⇧N / background menu / expanded footer).
- **Default width** — `SIDEBAR_WIDTH_DEFAULT` 260 → 248 (exported; double-click reset uses it); the [180, 560]
  clamp and persisted widths untouched.

**Key decisions** (from `ASSUMPTIONS.md` Task 374)

- All demo hexes mapped to existing tokens, never literals — light theme keeps working.
- Filter-active fills (repo "all" / branch "own" / worktree / rail folder) keep today's accent-dim treatment —
  spec silent, and it keeps "filtered" visually distinct from the new Surface0 "selected".
- The rail keeps the worktree glyph + its own dot stack (the demo flattens them into the repo stack, but that
  would silently lose the worktree right-click menu — the §12 parity constraint outranks the demo).
- Collapsed update icon + usage track still render in the rail (§6 silent; hiding them would lose the update
  affordance while collapsed). Pill radius = `--radius-chrome` (7px) over the demo's 8px literal.
- Context menus / checkout picker / color picker styles kept byte-identical — Task 375 owns floating chrome.
- Pure CSS/TSX; kbd hints via `kbdHint` (Ctrl on Windows/Linux); identical on macOS/Windows/Linux. Rollback =
  revert the PR (no persisted-data/IPC/schema changes; the 248px default only affects fresh installs/reset).

**Dependencies:** Task 372.

### 375. [x] UI v2 (9/12): Floating chrome I — shared menu primitive (menu.css), all context menus/popovers, New-session popover reskin

Card 9 of the UI v2 reskin epic (spec §10 "Floating chrome" + demo; **no version bump / patch notes**). Every
anchored floating surface — all right-click context menus, the header/tab dropdown popovers, and the (already
anchored) New-session popover — gets the one v2 menu look: Base bg, strong hairline, ~10px radius, deep
`--shadow-menu`, a 130ms .97→1 scale-in, 28px/11.5px items with 13px muted icons and Surface0 hover — with zero
functionality lost.

**What shipped** (branch `task-375-menu-primitive`, PR
[#130](https://github.com/ErikdeJager/ReCue/pull/130), merged 2026-07-14 into `ui-rework`):

- **`src/styles/menu.css`** (new, imported once in `main.tsx`) — a **global-class stylesheet primitive** (the 372
  atoms.css pattern, deliberately *not* a wrapper component): container (min-width 200px, 4px padding, Base bg,
  `--border-strong`, radius 10, `--shadow-menu`, 130ms .97→1 pop), 28px items (radius 6, `--fs-row`, Surface0
  hover), 9.5px uppercase letterspaced section labels, hairline separators, danger items (red text, 12% red-tint
  hover), right-aligned kbd hints and checkable-row check glyphs. Each menu keeps its own positioning/dismissal
  logic and z-index — only the look classes are shared. A new `src/menu.test.ts` file-content guard pins the
  contract.
- **Applied to every owned menu surface** — Sidebar's shared menu CSS (~120 lines of duplicated look deleted):
  `RowContextMenu` (schedule/recurring/file/kanban/diff/filetree/terminal rows, the ⋯ scheduling menu, the
  background menu), `AgentContextMenu`, the worktree-header / repo branch-line / repo context menus (whose
  `files`/`colors`/`checkout` sub-panels inherit the new container); `AgentHeaderMenu` (now animated like the
  rest); `ViewsMenu`/`ViewsPopover` (their duplicate item/sep CSS deleted); the CanvasTabs **templates menu**; and
  the **FileTree context menu** (the third duplicated copy of the old look — its form/input sub-styles stay
  local). In-menu icons resized 14→13 + muted per §10; viewport-clamp margins bumped for the wider 200px
  min-width.
- **New-session popover reskin** — keeps its anchored fixed 12px/12px, 300px form; uniform 12px radius (drops the
  #65 mixed-corner trick — the demo shows uniform), `--shadow-modal`, a **progress-dot row** (6px dots, current
  step accent, others Surface1; 2 dots for the normal flow, 3 for schedule/recurring; aria-hidden decoration; a
  #127/#263 skip-folder open shows dot 2 active); crust 28px inputs; recents/branch rows at 30–32px with
  **Surface0 pre-selection fills** (moving off `--accent-dim` — the accent never encodes selection); the demo's
  action-row skin (neutral bordered Cancel/Worktree ⌘⏎ left, accent Continue/Start ⏎ right, kbd hints); "+ add
  branch" goes muted-with-hover. The branch-filter >4 threshold, remote-branches subheader (#180), inline
  add-branch form (#124), and the branch-step Cancel are all kept (parity over the demo's omissions); the
  schedule + recurring steps inherit the same skin.

**Key decisions** (from `ASSUMPTIONS.md` Task 375)

- **Global-class stylesheet over a wrapper component** — positioning/dismissal stay site-local; smallest diff.
- **Every existing menu item and order kept** beyond the demo's illustrative sets (Open in canvas, Watch, Pull,
  View on GitHub, Copy relative path, …); no icons added or removed.
- ViewsPopover follows the demo layout ("Open a view" label + view items first, "New session here" last after a
  separator) with deliberately **no ⌘N hint** (⌘N opens the modal; the item instant-spawns — a hint would
  mislabel).
- `--shadow-popover` alias kept for the ~20 consumers this card doesn't own (FileSwitcher/GlobalSearch/Settings/
  modals — cards 10–12); only owned surfaces migrate to `--shadow-menu`/`--shadow-modal`.
- Menu animation = a 130ms literal (spec band 130–160; `--dur-fast` is 120); reduced-motion rides the existing
  global killswitch. SkillAutocomplete/FilePicker/FileSwitcher/GlobalSearch internals untouched.
- Pure CSS/TSX, token-driven — identical on macOS/Windows/Linux. Rollback = revert the PR.

**Dependencies:** Task 372.

### 377. [x] UI v2 (3/12): Wave background system — vendor WaveEngine.js verbatim + a lazy React WaveBackground host behind Overview, Canvas, and detached canvas windows

Card 3 of the UI v2 reskin epic (spec §3 + the fx.js reference host; **no version bump / patch notes**). Ships the
"signature" v2 wave: the vendored `WaveEngine.js` flow-field animation on one Canvas2D layer per window — behind
the Overview stage, the Canvas view (ONE canvas spanning tab strip AND panes), and each detached canvas window —
random seed every launch, live accent recolor, per-surface presets switched without remount, honoring the
`backgroundAnimation` setting (OFF ⇒ no canvas at all) and reduced motion (settle ~5s then freeze).

**What shipped** (branch `task-377-wave-background`, PR
[#132](https://github.com/ErikdeJager/ReCue/pull/132), merged 2026-07-14 into `ui-rework`):

- **Vendored verbatim** — `src/vendor/WaveEngine.js` (397 lines, plain script, no exports) copied byte-for-byte
  from the local-only handoff bundle; a sha256-pinning unit test (`waveEngine.test.ts`, `10ae1e3e…c12a` /
  17,450 bytes) makes any future edit fail CI; ESLint ignores + `.prettierignore` entries keep lint/format green
  without touching it. Consumed via a `?raw` import + `new Function` wrapper (`waveEngineLoader.ts` — legal under
  the app's `csp: null`), which also unit-tests the `{frame,resize,reseed,setConfig}` shape and seed determinism.
- **Lazy chunk (#356)** — the engine (raw source + wrapper) is reachable only via dynamic `import()` from the
  host; `bundle:report -- --check` stays green with the wave out of both routes' first-paint closures.
- **`WaveBackground` host** (`components/WaveBackground/`) — replicates the fx.js contract: CSS-pixel buffer (no
  devicePixelRatio scaling — softer + cheaper on Retina/WebKitGTK), `{alpha:false}` 2d context, rAF loop with
  ~48fps cap + dt clamp [0.001, 0.05] + `document.hidden` skip-and-reset-timebase, ResizeObserver-driven
  `eng.resize` (sizes < 4 ignored). Pure tick/gate logic extracted into `waveTick.ts` (+ tests); presets in
  `wavePresets.ts` (+ tests): Overview 420/0.85/0.04/3.4 · Canvas 420/0.8/0.035/3.4 · first-launch hero
  950/1.05/0.07/3.4 — **live `setConfig` swaps on the same instance, never a remount/reseed**.
- **Mounted per window document** — inside `.main` behind `.main-content` (main window) and inside `.window`
  (detached, canvas preset always), `aria-hidden` + `pointer-events: none`, z-order via `z-index: -1` +
  `isolation: isolate` on the container (no other z-index changes). Seed rolled once per window document per
  launch (an OFF→ON re-toggle reuses it; a detached window rolls its own).
- **Live recolor** — a MutationObserver on `<html>` style/`data-theme` reads the **computed** `--accent`
  (covering swatches, custom, 373's "random", and theme flips); `bgColor` follows computed `--bg-base` (light
  crust in light theme; a flip fades over a few frames since the engine has no hard-clear).
- **Settings + reduced motion** — `backgroundAnimation` OFF unmounts the canvas entirely (live on Save; the host
  waits for `booted` so a persisted OFF never flashes). Reduced motion (OS media query OR `body.reduce-motion`)
  settles 240 frames then freezes, keeping a no-op rAF alive so un-toggling resumes and an accent change while
  frozen re-arms one settle window.
- **Minimal transparency CSS** (no reskin) — `.wall`/`.filterEmpty`/`.canvas`/`.area` go transparent, Overview
  `.card` gains an explicit opaque bg, empty-state copy gets a text-shadow; the tab strip + detached header stay
  opaque (card 6 owns the transparent strip). No pooled xterm touched.

**Key decisions** (from `ASSUMPTIONS.md` Task 377)

- `?raw` + `new Function` is the only consumption path that never edits the vendored file; the hash test enforces
  the "vendor verbatim" rule. The handoff dir is untracked, so the plan pointed at the main checkout's absolute
  path (worktrees don't have it).
- ONE engine per window spanning the whole stage makes the "one canvas behind strip and panes" rule fall out of
  placement; the hero preset wires to the first-launch EmptyState via a shared pure `overviewIsEmpty` helper
  (adopted by Overview.tsx so the two can't drift); the repo-filter empty state keeps the overview preset.
- Deviation from fx.js: the frozen loop keeps a no-op rAF alive instead of cancelling (resume + refreeze
  behavior). Detached windows adopt setting/accent changes at their next boot (settings aren't broadcast).
- Pure Canvas2D — renderer-agnostic (unaffected by the #346/#357 Linux WebGL decisions and the #364 latch);
  identical on macOS/Windows/Linux. Rollback = revert the PR.

**Dependencies:** Tasks 372, 373.

### 378. [x] UI v2 (10/12): Floating chrome II — modal fleet reskin onto the §10 scrim/pop contract (shared modal.css primitive, 15 surfaces)

Card 10 of the UI v2 reskin epic (spec §10/§2.5 + demo; **no version bump / patch notes**). Every centered modal
and named auxiliary surface gets the one v2 floating-chrome look — `var(--scrim)` with a 150ms fade, a Base-bg
dialog with a strong hairline, **12px radius**, deep `--shadow-modal`, a 160ms .97→1 pop, and the demo's 28px
action-button row (neutral / red-tinted danger / accent primary) — with zero functionality lost: every focus
trap, keyboard path (Esc/⏎/K/digits), confirm gate (#103), and lazy-load boundary (#356) stays byte-for-byte
(`ModalHost.tsx` untouched).

**What shipped** (branch `task-378-modal-fleet`, PR
[#133](https://github.com/ErikdeJager/ReCue/pull/133), merged 2026-07-14 into `ui-rework`):

- **`src/styles/modal.css`** (new, imported once in `main.tsx`) — the centered-modal sibling of 375's `menu.css`:
  scrim fade, dialog chrome (Base bg, `--border-strong`, 12px, `--shadow-modal`, 160ms pop), and the three
  28px/radius-7 action-button classes with borderless kbd hints. A new `src/modal.test.ts` file-content guard
  pins the contract.
- **The fleet migrated** (Surface0 dialogs → Base, `--shadow-popover` → `--shadow-modal`, square buttons → the
  28px row, bordered kbd chips → borderless `--fs-micro` hints): **CanvasCloseModal** demo-exact (440px, yellow
  alert icon + 13.5px/700 title, Cancel Esc · Kill & close K danger · Keep & close ⏎ accent);
  **Onboarding** demo-exact (470px, crust choice cards, Claude first with an accent-tint border + accent
  `Recommended` chip, others hairline + neutral `Untested` chip — replacing the green/yellow chips — and a
  "Decide later" ghost); **CreatePanelModal (⌘K)** and **GlobalSearch (⌘F)** keeping their top-anchored launcher
  positions with active rows moved accent-dim → Surface0; **TemplateManager / TemplateUseModal / TemplateEditor**
  (the editor stays a full-screen surface — only toolbar/inputs/hovers adopt the idiom); **CloneRepoModal** (the
  phantom row's progress track alone moves to the crust inset — its metrics are 374's); **FilePicker /
  FileSwitcher** (the switcher's anchored popover gets the §10 anchored look via its own rules rather than
  composing `.menu-pop`, whose min-width/padding would disturb the embedded picker); **UpdateModal + the
  no-dismiss install overlay** (crust rounded progress track); **BigModeModal** (local reduce-motion opt-out
  removed — the global killswitch covers it); **ClaudeMissing** (stays a top banner; button/typography aligned);
  **PatchNotes** (micro-eyebrow categories only); **AutoContinuePrompt** (adopts the same 28px `--radius-chrome`
  pill geometry 374 gives the UpdateIndicator so the footer reads coherently whichever lands first).

**Key decisions** (from `ASSUMPTIONS.md` Task 378)

- **Demo wins on radius**: centered modals use the demo's 12px as a documented literal in modal.css (tokens.css
  not edited); the demo's .12 border maps to `--border-strong` — no new tokens.
- **⌘K/⌘F stay top-anchored** (Spotlight convention; the demo shows no launcher to override) — only the chrome
  changes. Launcher type icons stay accent (they encode panel type; §10's muted-icon rule is for menu lists).
- **Selection fills move accent-dim → Surface0** across ⌘K/⌘F/TemplateUse/FilePicker (accent never encodes
  selection — mirroring 375's call).
- Per-modal z-index layering (100/200/210/220) kept site-local (the demo's uniform z-70 is a single-page
  artifact). Shared-file overlap with 374 minimized (Update.module.css: modal rules only, never `.indicator*`).
- Pure CSS/TSX, token-driven; identical on macOS/Windows/Linux. Rollback = revert the PR.

**Dependencies:** Tasks 372, 375.

### 379. [x] UI v2 (5/12): Overview wall reskin — crust stage, flush terminal cards, filter/empty/first-launch states, agent max-width, startup tips

Card 5 of the UI v2 reskin epic (spec §7 + demo; **no version bump / patch notes**). The Overview "agent wall"
moves onto the crust stage over the wave — 12px stage padding, 8px gaps (0 in dense via the 372 stage vars), each
card a square Base block with a 2px repo band, a fixed 36px header, and a flush crust terminal — plus the
chrome-free filter bar, wave-centered empty states, the `capAgentWidth` consumer, a token-fed xterm ANSI palette,
and a new random-tip system. Zero functionality lost.

**What shipped** (branch `task-379-overview-reskin`, PR
[#134](https://github.com/ErikdeJager/ReCue/pull/134), merged 2026-07-15 into `ui-rework`):

- **Stage + cards (`Overview.module.css`/`.tsx`)** — the wall consumes `--stage-pad-overview`/`--stage-gap`;
  cards are square Base blocks with a hairline border and a full-width 2px solid repo-color top band; the
  repo-group divider borders (`.cardGroupStart` + its #343 light override) are **removed** — grouping now reads
  via band + gaps (the light opaque-border override stays on `.card`). **Selection = the demo's plain 1px inset
  accent ring** (click-through overlay), replacing the #50 repo-colored frame + header tint; sidebar sync rides
  the existing shared `selectedId`. Fixed 36px header (13px grip, BusyIndicator slot — non-agent cards get the
  demo's 8px repo-colored leading square, scheduled/recurring keep their Clock/RefreshCw icons; 12px/600
  ellipsizing title + 9px fork badge over a 10px "repo · branch" meta) with 24×24 ghost actions (14px icons,
  Surface0 hover; remove ✕ hovers red). The #70 whole-header drag grip, #188 inline rename, #297 subheader, #84
  DetachedNote guard, and #351 lazy-mount root are all untouched. Terminal body flush: crust bg, only a hairline
  header/body divider (kept as the header's border-bottom — renders identically to the demo's body border-top).
- **capAgentWidth consumer** — agent-conversation cards only (SessionCard + RecurringCard) cap at `max-width:
  900px` (safely above the #176 min-width slider's 600px max); other kinds uncapped; active in dense too; the
  uncapped leftover stage shows the wave (cards left-aligned).
- **Filter bar** — renders only when filtered, now an unchromed row: "Showing **repo**" + a plain accent
  text-link "Show all" (the #247 "· this branch" suffix kept).
- **Empty states** — filtered-empty: wave-centered "No sessions in **repo** yet" + an accent New session button
  that calls `startRepoSession(filter.path)` (#127 — skips the folder step), plus the spec's faint "the wave keeps
  you company" line; it keeps the calm overview wave preset (377's `selectWavePreset` not re-mapped — the demo's
  hero boost fires only on whole-app empty). First-launch hero (`EmptyState`): boosted wave + a text-shadowed
  20px/700 "ReCue" wordmark + ONE compact accent "New session ⌘N" button + a **random tip** underneath.
- **Tips system** — `src/tips.json` (an array of short useful tips) + pure `src/tips.ts` (`renderTip` converts
  mac-style chords per-OS: ⌘→Ctrl+, ⇧→Shift+, ⌥→Alt+, ⏎→Enter — kbdHint semantics; a shuffle picks a
  guaranteed-different tip) + `tips.test.ts`; shown only on the first-launch EmptyState with a small ghost
  "tip" chip (Lightbulb) that shuffles.
- **Token-fed ANSI palette (`terminalPool.ts` + `tokens.css`)** — 16 new literal `--terminal-ansi-*` tokens
  (Catppuccin Mocha terminal scheme, NOT overridden in light — the terminal stays dark) read at terminal
  creation; bg/fg/cursor/selection were already token-fed; font-size/line-height stay user settings; no live
  re-theme on accent change (parity with today's creation-time cursor color).

**Key decisions** (from `ASSUMPTIONS.md` Task 379)

- The "no taglines" rule applies to the first-launch hero only; the empty-repo state carries the spec's faint
  wave line. Tips appear only when the whole app is empty, not on the filtered empty state.
- Added `--text-faint` (dark `#45475a` / light `#9ca0b0`) since spec §2.1 lists "faint" but 372 didn't land it —
  flagged as possibly duplicated by sibling Task 380 (keep one definition at merge).
- Diff-card inner content (summary row + diff lines) is DiffInspector's turf (cards 7/8) — this card delivers
  only the card chrome around it.
- Pure CSS/TSX + one JSON asset; identical on macOS/Windows/Linux. Rollback = revert the PR.

**Dependencies:** Tasks 372, 373, 377.

### 380. [x] UI v2 (6/12): Canvas reskin — transparent tab strip over the shared wave, 30px panel chrome, hairline split dividers, wave empty state, detached-window chrome

Card 6 of the UI v2 reskin epic (spec §8/§9 + demo; **no version bump / patch notes**). The Canvas view moves
onto the ONE shared wave (377): the tab strip becomes transparent chrome on top of it, panels get the v2 chrome
(Base bg, hairline border, square, FIXED 30px headers), splits open into transparent `--stage-gap` gaps with
hairline dividers (0 in dense), the empty canvas becomes the centered on-the-wave state, and detached canvas
windows get the same chrome. Zero functionality lost; markup/CSS only (no new unit tests — the suite stays
green).

**What shipped** (branch `task-380-canvas-reskin`, PR
[#135](https://github.com/ErikdeJager/ReCue/pull/135), merged 2026-07-15 into `ui-rework`):

- **Tab strip** — transparent (no bg/border/fixed height), 6px/10px padding directly on the wave; 24px square tab
  blocks (active = Base fill + hairline + 600/11px primary; inactive = ghost muted), each with label · pop-out ·
  ✕ (hit areas kept at today's ~18–20px, hover color-only with the ✕ turning red); aux 22px ghost buttons — `+`
  new tab (⌘T hint), the Templates ▾ trigger (dropdown surface left byte-identical — 375 owns the menu
  primitive), and **Distribute panels evenly** (#186) restyled + moved inline after Templates (removing #205's
  far-right push), disabled-when-<2-panels kept.
- **Panels** — `.panel` background crust→Base with hairline border, square; FIXED 30px headers (demo-exact:
  padding 0 10px, gap 8, 12px/600 ellipsizing title, 10px meta, 13px icons, 22px actions with Surface0 hover).
  **Agent panel headers regain a status dot** (the 372 BusyIndicator — deliberately reversing #95's "agent panels
  drop the dot" for Canvas headers only); non-agent panels keep the repo dot, now an 8px rounded square. The #144
  whole-header grip, #90 FileSwitcher, #188 rename, #297 AutoContinueToggle, #76 active ring, and edge drop zones
  all untouched.
- **Split dividers** — the react-resizable-panels `Separator` becomes the transparent `--stage-gap` gap (wave
  peeks through) with a centered 1px hairline drawn via `::before` (accent on hover/active), oriented off the
  library's `aria-orientation`; an invisible ±4px `::after` hit-area extension keeps resizing workable in dense
  (gap 0). Double-click equalize (#186) kept.
- **Empty canvas** — the always-visible dashed box is replaced by a wave-centered stack (panels icon, "No panels
  yet", "Open a view from a session, or start with an empty tab", ghost **New tab ⌘T** → `addCanvas()`); the
  accent dashed border + tint now appear only while a drag hovers the center droppable (droppability unchanged,
  `canvas-center` id kept; text-shadow reuses 377's constant).
- **Detached windows + notes** — the detached header becomes the same transparent 6px/10px strip with the tab
  name styled as an active tab block; DetachedNote / MaximizedNote / DetachedCanvasNote swap their bespoke
  buttons for the 372 `btn btn-neutral` atoms (no text-shadow — they sit on opaque panels).

**Key decisions** (from `ASSUMPTIONS.md` Task 380)

- Demo border alphas (.10/.12) mapped to `--border-hairline` — token discipline, no new literals.
- The empty state's "New tab ⌘T" opens a fresh tab verbatim per the spec copy even though the state means "active
  tab is empty". Empty-state subtitle uses `--text-muted` (not the demo's Surface1) for light-theme legibility.
- Panel INNER content backgrounds are cards 7/8's turf — the transitional look is accepted (xterm paints its own
  bg, terminals unaffected).
- Templates dropdown JSX/rules untouched to avoid colliding with 375. No CLAUDE.md edit (card 12 owns the sweep).
- Pure CSS/markup; identical on macOS/Windows/Linux. Rollback = revert the PR.

**Dependencies:** Tasks 372, 377.
