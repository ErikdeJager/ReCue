# Tasks

This is the **permanent archive** of completed tasks, maintained by the `kanban-dev-pima`
pipeline's **`/archive-tasks`** lane (it appends a `## Task <N>` entry as each `ARCHIVE` card is
finished). A task number counts as a satisfied dependency once it appears here (or in the
board's `## ARCHIVE` column). Numbers are **global and never reused** — the next number is one
greater than the highest used anywhere (board, `PLAN-*.md`, this file).

The entries below were carried over from the prior pipeline: an **Implemented (completed
tasks)** index for #1–#153, then full `### N. [x]` entries for #152–#256. New entries the
archiver appends use the `## Task <N>` heading — both styles coexist and are matched by
number.

---

## Project context

**ReCue** — a **macOS** desktop app (**Rust + Tauri 2 + React/TypeScript**) for
running and managing many live `claude` CLI sessions at once: an **Overview** "agent
wall" of real terminals, a **Canvas** split-panel workspace (with file, **git-diff**,
and terminal viewers), and a repo-grouped **sidebar**. Each session is a **real PTY running
`claude`** — ReCue provides the window chrome, navigation, persistence and
git-reading; the terminals come from the Claude Code CLI itself.

**Stack:** Tauri 2 · React + TypeScript + Vite · **Zustand** · plain CSS with
CSS-variable design tokens (CSS Modules) · **xterm.js** terminals · **`portable-pty`**
(Rust) · JSON persistence in the app-data dir · **Lucide** icons · **JetBrains Mono**
(bundled, offline).

**v1 decisions / out of scope:** no status system beyond the busy/idle indicator
(#42/#55/#71/#88/#95 — still no approval pills/awaiting-glow/floating) · no app-rendered
approval UI (users answer in the terminal) · no Archive (single **Remove = kill +
forget**) · no Skills manager · no Fork · no light mode · no auth · no code
signing/notarization · a **Settings** screen now exists (#100/#102/#103, reversing the
v1 "no settings screen" rule) and **Canvas tabs detach into their own native window**
(#84, reversing "no multi-window") · **git is read-mostly** —
ReCue reads git (current branch + working-tree diff vs `HEAD`, branch compare #81)
and never commits; its writes are `git checkout <existing branch>` from the new-session
flow (#27), `git worktree add`/`remove` for isolated worktree agents (#74), and
**branch creation** (`git checkout -b` / `git worktree add -b`) via the new-session
branch step's "+ add branch" (#124). **Files are read-mostly too** — the viewer
lists/reads repo text files (#40/#44) and, since **#141**, `write_text_file` writes
one (the app's **first arbitrary file write**, path-validated like reads), backing the
markdown **Kanban board** (#141–#143). `claude` is assumed on `PATH` (clear in-app
error if missing).

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
file is the completed-task archive only. The **Implemented (completed tasks)** index above
covers #1–#153; the full `### N. [x]` entries that follow cover #152–#256.
_(Tasks #139–#140 were reserved on another branch. The Kanban content-type task was
renumbered #142 → #145 to avoid colliding with the separately merged template task #142.)_

> **Never skip a card.** The pipeline implements **every** unblocked card — one whose
> `deps:` are all in `## DONE` or already archived here — lowest task number first, and never
> skips one for being big, risky, or hard to verify. A card too large for one pass is
> **split into smaller dependent cards** (as #93 → #93 + #94), not deferred.

---

### 152. [x] Left panel as the single source of truth — register Canvas-template-opened items in it, and cascade left-panel removal to Canvas + Overview

**Status:** Done
**Depends on:** none · _(builds on shipped #59 (sidebar tree = `overviewPanels`), #118 (Canvas
templates / `resolveTemplateBlock`), #84 (detached windows / `sessionIdsInLayout` reconcile),
#94 (scheduled items), and #79 (leaf↔sidebar-item matching). No open task gates it.)_
**Created:** 2026-06-24

**Description**

The sidebar **left panel** should be the **single source of truth for everything that is
open** — files, diffs, terminals, kanban boards, agents, and scheduled sessions. The user's
requirement: _"anything that is opened should show up in the left panel always. Left panel is
the source of truth of all that is opened. If I remove something from the left panel, it is
removed from a canvas. It is removed from overview."_ And: _"the overview panel also shows all
things — unless a specific filter for a folder is active — but it should show everything in the
left panel."_

**Today this invariant is broken in two places** (investigated; describing the data model):

- The app has **three independent stores**: `sessions` (agents — always in the sidebar),
  `overviewPanels` (the `overview_panels` blob — the non-agent file/diff/terminal/kanban rows
  that drive **both** the sidebar tree, #59, **and** the Overview wall 1:1), and **Canvas
  layout leaves**, which hold **standalone `CanvasContent` descriptors** (`{kind, repoPath,
  file, sessionId, …}`) that do **not** reference an `overviewPanels` entry.
- **Gap 1 — Canvas-template instantiation doesn't register opened items (#118).**
  `resolveTemplateBlock` places resolved content straight into a Canvas leaf. Only the
  **`new-agent`** block registers in a source-of-truth store (it calls `upsertSession`, so the
  agent shows in the sidebar). The **`new-terminal`**, **`open-file`**, and **`open-diff`**
  blocks do **not** call `addOverviewPanel`, so a template-opened terminal / file / diff lives
  **Canvas-only** — it never appears in the left panel or the Overview. (This is the user's
  reported bug: "a file opened through Canvas templates does not show up in the left panel.")
- **Gap 2 — removal from the left panel doesn't cascade to Canvas.** `removeOverviewPanel`
  drops the item from `overviewPanels` (so the sidebar row and the Overview column disappear —
  Overview already mirrors `overviewPanels`), but it does **not** scan Canvas layouts, so a
  Canvas panel showing that item **lingers**. The reverse direction already works (closing a
  Canvas tab with kill → `closeCanvasContents` removes matching `overviewPanels` entries); the
  **sidebar → Canvas** direction is missing. Agents/schedules removed from the sidebar likewise
  aren't pruned from Canvas.

**Goal:** make the left panel canonical. (1) Anything opened — including via Canvas templates —
**registers in the source of truth** (`overviewPanels` for non-agent items; `sessions` for
agents, already done) so it shows in the sidebar **and** Overview. (2) Removing an item from the
left panel **cascades**: it's removed from every Canvas tab that shows it **and** from Overview
(automatic, since Overview mirrors `overviewPanels`), and its PTY is killed as today.

Out of scope: adding new openable item types; the Overview **folder filter** (#34) behavior is
unchanged (a filter may still narrow Overview by folder — that's the user's stated exception);
the drag-into-Canvas path already registers because its drag source is an existing sidebar row.

**Recommended approach (implementer may revise):** keep the standalone-descriptor leaf model and
**register a matching `overviewPanels` entry** when a template block opens a non-agent item;
reuse the existing `matchesCanvasItem` / `leafItemId` matchers (`store.ts`) + the `removeLeaf`
pure op (`canvasTree.ts`) for the cascade. This is lighter than refactoring leaves to reference
panels by id (which would touch the persisted `canvases` blob and the detached-window sync more
invasively). Whichever path is taken, **the detached-window invariant (#84) and the persisted
`canvases` / `overview_panels` blobs must be preserved.**

**Subtasks**

1. [x] **Register template-opened non-agent items.** In `resolveTemplateBlock`, when a
   `new-terminal` / `open-file` / `open-diff` block resolves, also call
   `addOverviewPanel(cwd, kind, file?)` so it lands in the sidebar + Overview. For the PTY-backed
   `new-terminal`, register the panel under the **same id as the spawned PTY / Canvas leaf
   `sessionId`** so the existing matchers and the App.tsx reconcile line up (no duplicate /
   orphan). For `open-file` / `open-diff`, rely on `addOverviewPanel`'s existing dedup. Leave
   `new-agent` as-is (already registered via `upsertSession`).
2. [x] **Cascade left-panel removal to Canvas.** In `removeOverviewPanel`, after dropping the
   panel, scan every `canvases[].layout`, `removeLeaf` any leaf whose content matches the removed
   panel (via `matchesCanvasItem` / `leafItemId`), then persist with `setCanvases` and broadcast
   (`canvas://changed`). Overview needs no extra work (it mirrors `overviewPanels`).
3. [x] **Extend the cascade to agents + schedules.** When an agent is removed (Remove =
   kill + forget; the session-removal / `forgetExitedSession` path) prune Canvas leaves with
   `kind:"agent"` and that `sessionId`; when a schedule is cancelled, prune `kind:"scheduled"`
   leaves — so "remove from left panel ⇒ gone from Canvas" holds for **every** item type.
4. [x] **Reconcile/cleanup updates.** Now that template terminals are real `overviewPanels`
   items, update `closeCanvasContents` — its "a canvas-only template terminal isn't a sidebar
   item" branch — and confirm the App.tsx reconcile (`terminalIds` + `canvasPtyIds` via
   `sessionIdsInLayout`) still **dedups** so a PTY isn't double-disposed.
5. [x] **Confirm the Overview invariant.** With no folder filter active, every `overviewPanels`
   item renders as an Overview column 1:1 with the sidebar; the repo-name filter (#34) remains
   the only thing that narrows them. (Expected: no change needed — verify.)

**Acceptance criteria**

- [x] Opening a Canvas template whose blocks open a **file / diff / terminal** makes each appear
  as a **left-panel sidebar row** AND an **Overview column** (under the chosen folder), not only
  in the Canvas tab.
- [x] Template-spawned **agents** still appear in the sidebar (unchanged).
- [x] Removing **any** item from the left panel (row ×, context-menu Remove, or Cancel for a
  schedule) removes it from **every** Canvas tab showing it **and** from Overview; a removed
  terminal/agent PTY is killed as today.
- [x] No orphaned or empty Canvas panel is left behind referencing a removed item.
- [x] With no folder filter, Overview shows every left-panel item 1:1 (the folder filter still
  narrows by folder).
- [x] Detached Canvas windows (#84) stay in sync — a leaf pruned in one window disappears in the
  other — with no PTY double-render / double-dispose.
- [x] `npm run build`, `npm run lint`, `npm test`, and the Rust gates (`cargo clippy`, `cargo
  fmt --check`) pass.

**Implementation report**

Implemented per the recommended approach — keep standalone leaf descriptors, register a matching
`overviewPanels` entry on template open, and cascade removals with the existing matchers + the
`removeLeaf` pure op. All in `store.ts` (+ tests); no Rust / persisted-blob-shape change.

- **Two new module-level helpers** (`store.ts`): `registerOverviewPanel(repoPath, panel)` adds an
  `overviewPanels` entry **without** spawning a PTY or toasting (the template already did both),
  dedups like `addOverviewPanel` (diff: one per repo; markdown/kanban: by repo+file; terminal: by
  id), and persists. `pruneCanvasLeaves(match)` removes every matching leaf across **all** canvas
  tabs (`removeLeaf` collapses each emptied split), clears a now-dangling `activeLeafId`, and
  persists + broadcasts via `ipc.setCanvases` (→ `canvas://changed`) so detached windows (#84)
  stay in sync — routed through the same write path as every other canvas mutation, so the
  main-authoritative-`activeId` rule and the persisted blobs are preserved.
- **Subtask 1 — `resolveTemplateBlock`:** on success, `new-terminal` calls
  `registerOverviewPanel(cwd, { id: termId, kind: "terminal" })` under the **same id** as the
  spawned PTY / leaf `sessionId` (so the matchers + the App reconcile line up — one PTY, no
  orphan), registered **after** the existing `leafGone` kill-guard; `open-file` →
  `{ kind: "markdown", file }` and `open-diff` → `{ kind: "diff" }` (fresh ids, dedup by
  repo+file / repo). `new-agent` unchanged (`upsertSession`).
- **Subtask 2 — `removeOverviewPanel`:** after dropping the panel, builds a `SidebarItem` (mapping
  the panel's `markdown` kind → the item `file` kind) and `pruneCanvasLeaves((c) =>
  matchesCanvasItem(c, item))`, so a sidebar/Overview close also clears every Canvas panel showing
  it; the terminal PTY kill is unchanged.
- **Subtask 3 — agents + schedules:** `dropSession` (the shared chokepoint for Remove #57 **and**
  clean-exit forget #63) prunes `kind:"agent"` leaves for that id; `cancelSchedule` prunes
  `kind:"scheduled"` leaves for that id.
- **Subtask 4:** updated the stale `closeCanvasContents` comment — a template terminal is now a
  registered sidebar item, so the existing `overviewPanels.some(p => p.id === sessionId)` branch
  drops its panel too. Confirmed the App.tsx reconcile is unaffected: a template terminal's id now
  appears in **both** `terminalIds` and `canvasPtyIds`, but `active` is a keep-set (membership,
  not count), so no double-dispose; when both the panel and leaf are gone the id drops from both →
  disposed once.
- **Subtask 5:** verified — `Overview.tsx` already renders every `overviewPanels` item per repo,
  narrowed only by the `overviewRepoFilter` (#34). No change.

Added 4 store unit tests (`removeOverviewPanel` / `dropSession` / `cancelSchedule` cascades + an
unrelated-panel no-op). `npm run build`, `npm run lint`, `npm test` (185), `npm run format:check`,
`cargo fmt --check`, and `cargo clippy` all pass. Detached-window cross-sync is exercised through
the shared `setCanvases` path but isn't runtime-verified (no multi-window in the dev env, per the
#84/#105 precedent).

**Notes**

- Root cause: Canvas leaves hold **standalone** `CanvasContent` descriptors independent of
  `overviewPanels`; `resolveTemplateBlock` registers only `new-agent` (via `upsertSession`).
  Drag-into-Canvas items are already in the left panel because the drag source is a sidebar row,
  so no change is needed there.
- Existing infra to reuse: `addOverviewPanel`, `removeOverviewPanel`, `resolveTemplateBlock`,
  `closeCanvasContents`, `matchesCanvasItem`, `leafItemId` (all `store.ts`), `removeLeaf` and
  `sessionIdsInLayout` (`canvasTree.ts`).
- The user's folder-filter caveat: Overview may legitimately hide left-panel items **only** when
  a folder filter (#34) is active; otherwise it must show everything the left panel does.

---

### 153. [x] Agent row context menu — "Open in canvas" (reuse the agent's existing canvas tab, else create one)

**Status:** Done
**Depends on:** none · _(builds on shipped #57/#131 (agent row context menu), #58 (Canvas tabs /
`addCanvas`), #47/#126 (the "add an agent as a Canvas leaf" pattern via `appendLeaf`), and #84
(detached canvas windows). Consistent with the open #152 source-of-truth model — the agent is
already a sidebar/`sessions` item, so no extra registration is needed; no hard ordering required.)_
**Created:** 2026-06-24

**Description**

The agent row's right-click context menu in the sidebar (`SessionRow` in
`src/components/Sidebar/Sidebar.tsx`, the menu ~L347–410) currently offers **Rename / Fork
conversation / Copy session ID / Remove** (#57/#131). The user wants a new **"Open in canvas"**
item that puts that agent into the Canvas view as if it had been dragged in — without manually
switching to Canvas, making a tab, and dragging the agent row across.

**Behavior (decided with the user — this refines the original "always create a brand-new
canvas" wording):**

- **Reuse if already open.** If the agent already has a panel (`content.kind === "agent"` with
  this `sessionId`) in some existing Canvas tab, **focus that tab** (don't create a duplicate).
  Only if it isn't in any canvas do we **create a new tab** for it.
- **New tab uses the generic name.** When a new tab is created, reuse `addCanvas`'s incremental
  default ("Canvas N") — no agent-derived name.
- **Switch + focus.** Either way, switch the app to the **Canvas view**, make the target tab
  **active**, and focus the agent's panel so its terminal shows immediately.

This is essentially the existing fork-into-canvas move (`store.ts` ~L2223–2242 builds
`CanvasContent {kind:"agent", sessionId, repoPath}` and `appendLeaf`s it, or sets it as the sole
leaf of an empty layout), packaged as a one-click menu action that targets a **reused-or-new
tab** rather than the active one.

Out of scope: changing drag-into-Canvas behavior; non-agent rows (this is the agent menu only —
files/diffs/terminals/schedules already have their own rows and can be dragged in); renaming
tabs after the agent; multi-window placement choices beyond the detached-window reuse note below.

**Subtasks**

1. [x] Add a store action (e.g. `openSessionInCanvas(sessionId)`): search every `canvases[]`
   layout (via `collectLeaves`) for a leaf with `content.kind === "agent"` && matching
   `sessionId`.
   - **Found, in a main-window tab:** set `view: "canvas"`, `activeCanvasId` = that tab,
     `activeLeafId` = that leaf, `selectedId` = the session; persist the active id the same way
     the existing active-canvas switch does (`setCanvases` / the #84 main-window-authoritative
     path).
   - **Found, in a detached canvas (#84):** raise that window via `ipc.focusCanvasWindow(id)`
     instead of switching the main view (it can't render in the main window).
   - **Not found anywhere:** create a new "Canvas N" tab (mirror `addCanvas`) whose `layout` is
     a single leaf holding the agent content `{kind:"agent", sessionId, repoPath}`; set it active,
     switch to Canvas view, focus the leaf, and persist via `setCanvases`.
2. [x] Add an **"Open in canvas"** item to the `SessionRow` context menu (a `menuItem` /
   `menuItemView` button with a fitting Lucide icon — e.g. `PanelsTopLeft` / `Columns2` /
   `LayoutPanelLeft` — matching the icon+label style used by Fork). Wire it to
   `openSessionInCanvas(session.id)` + `setMenu(null)`. Place it logically (e.g. after "Copy
   session ID", before the Remove separator).
3. [x] Bump the context-menu vertical clamp (`Sidebar.tsx` ~L295–298, currently
   `window.innerHeight - 160`) to account for the extra item so the taller menu still doesn't
   overflow the viewport bottom.

**Acceptance criteria**

- [x] Right-clicking an agent row in the sidebar shows an **"Open in canvas"** item.
- [x] Choosing it when the agent is **not** in any canvas creates a new "Canvas N" tab containing
  that agent, switches to the Canvas view, and focuses it — the agent's terminal renders
  immediately.
- [x] Choosing it when the agent is **already** in a (main-window) Canvas tab focuses that tab
  instead of creating a duplicate.
- [x] When the agent's existing tab is a **detached window** (#84), that window is raised rather
  than the main view switching.
- [x] The reused/created tab and active state persist (survive a reload) and stay in sync with
  detached windows.
- [x] `npm run build`, `npm run lint`, and `npm test` pass.

**Implementation report**

Added `openSessionInCanvas(sessionId)` (`store.ts`) + an "Open in canvas" `SessionRow` menu item
(`Sidebar.tsx`); reuses the fork-into-canvas / `addCanvas` patterns, no backend change.

- **`openSessionInCanvas`** scans every `canvases[]` layout (`collectLeaves`) for an `agent` leaf
  with the matching `sessionId`. **Found in a main-window tab:** `set({ view: "canvas",
  activeCanvasId: tab, activeLeafId: leaf, selectedId })` + `setCanvases` (main-authoritative active
  id, #84). **Found in a detached tab** (`detachedCanvasIds.includes(tab)`): `focusCanvasWindow(id)`
  to raise that window and only set `selectedId` — the main view is left untouched (the PTY renders
  in the other window). **Not found:** build `{kind:"agent", sessionId, repoPath}` as a sole-leaf
  layout in a new "Canvas N" tab (mirroring `addCanvas`'s lowest-free-N naming), set it active +
  focused, switch to Canvas, and persist. No duplicate panel is ever created — matching #18/#84
  (one PTY renders in one slot) and the user's "reuse if already open" decision.
- **`SessionRow` menu:** a new `menuItem menuItemView` button (`PanelsTopLeft` icon, same icon+label
  layout as Fork) after "Copy session ID", before the Remove separator, wired to
  `openSessionInCanvas(session.id)` + `setMenu(null)`. The menu's vertical clamp went `innerHeight
  - 160` → `- 200` for the now-5-item menu.
- **#152 consistency:** the agent is already a `sessions`/left-panel item, so no `overviewPanels`
  registration is needed, and #152's removal cascade prunes this leaf when the agent is removed.

3 store unit tests (new-tab / reuse-existing / detached-raise). `npm run build`, `npm run lint`,
`npm test` (188), and `npm run format:check` pass. Detached-window raise/sync goes through the
existing `focusCanvasWindow` / `setCanvases` paths but isn't runtime-verified (no multi-window in
the dev env, per the #84 precedent).

**Notes**

- Reuses the fork-into-canvas pattern (`store.ts` ~L2223–2242) and `addCanvas` (`store.ts`
  ~L1863). The agent's draggable already carries `{kind:"session", sessionId, repoPath}`
  (`Sidebar.tsx` ~L228–236), so the menu action just performs the same placement programmatically.
- **Why reuse, not always-new:** a single PTY's xterm renders in one slot/window at a time
  (#18/#84). Creating a second leaf for an agent already shown elsewhere would make two panels
  fight over the one terminal — so "reuse if already open" both matches the user's choice and
  avoids that conflict.
- Consistent with #152: the agent is already a `sessions` / left-panel item, so no
  `overviewPanels` registration is needed, and #152's removal cascade will prune this leaf when
  the agent is removed.

---

### 154. [x] Kanban board block in the canvas template editor

**Status:** Done
**Depends on:** none · _(builds entirely on shipped code: the template block system (#117/#118),
the kanban content kind + Views entry (#145/#151), and the left-panel-as-source-of-truth Overview
registration (#152).)_
**Created:** 2026-06-24

**Description**

The Canvas **template editor** (#117/#118) lets you build a reusable Canvas layout out of inert
action **blocks** that instantiate into live panels when you "use" the template against a chosen
folder. The placeable block kinds were **Start session** (`new-agent`), **Open terminal**
(`new-terminal`), **Open file** (`open-file`), and **Open diff** (`open-diff`). The **Kanban
board** content kind (`kind:"kanban"`, shipped in #145/#151) is a first-class Canvas panel — it
can be dropped into a live Canvas, added from the repo **Views** menu, and shows as a sidebar row /
Overview column — **but it was missing from the template editor's palette**, so you could not save
a template that opens a Kanban board, even though the block registry was explicitly designed so "a
new content kind becomes a block with one entry" (`src/components/Canvas/templateBlocks.ts`).

**Goal / why:** make the Kanban board a placeable template block so a saved template can open a
repo's board (e.g. `TASKS.md` / `KANBAN.md`) in a panel, exactly the way **Open file** opens a
markdown/code file — closing the gap between the live content kinds and the template block set,
which is the registry's whole purpose.

**Subtasks**

1. [x] **Registry** (`templateBlocks.ts`): added `"open-kanban"` to the `BlockKind` union and a
   `BLOCK_REGISTRY` entry `{ kind: "open-kanban", label: "Open Kanban board", icon: SquareKanban,
   config: "file", liveKind: "kanban" }` (Lucide `SquareKanban`, reused for visual consistency with
   the sidebar/Views kanban icon). `blockPlaceholderLabel` (`config:"file"`) and `newBlockContent`
   handle it generically — no other edit needed.
2. [x] **Instantiation** (`templateInstantiate.ts`): added an explicit `case "kanban":` to
   `resolvedContent` returning `{ kind:"kanban", repoPath: cwd, file: block.file }` (the default
   branch dropped `file`, which `KanbanPanel`/`CanvasSurface` both require).
3. [x] **Resolution** (`store.ts` `resolveTemplateBlock`): added a gated `liveKind === "kanban"`
   branch mirroring the `"file"` branch — `await ipc.fileExists(cwd, block.file)`, throw
   `File not found` if absent (read-only, **no auto-create**), build live content via
   `resolvedContent`, and register a deduped `kind:"kanban"` left-panel/Overview row (#152).
4. [x] **Pick-file kind preservation** (`store.ts` `pickTemplateBlockFile`): stopped hardcoding
   `kind:"open-file"`; it now reads the leaf's existing `block.kind` (default `open-file`), so the
   error-panel **Pick file** recovery keeps a kanban block kanban rather than silently degrading it
   to a file viewer.
5. [x] **Editor copy:** left as-is per plan — the shared `config:"file"` input keeps its generic
   `e.g. README.md` placeholder for both `open-file` and `open-kanban`; no per-kind branching added.
6. [x] **Tests:** `templateBlocks.test.ts` (registry kinds + `open-kanban` descriptor),
   `templateInstantiate.test.ts` (`resolvedContent` → `{kind:"kanban", repoPath, file}`),
   `store.test.ts` (`pickTemplateBlockFile` preserves the `open-kanban` kind).
7. [x] **Verify:** `npm run build`, `npm run lint`, `npm test` (190) all pass.

**Acceptance criteria**

- [x] An **Open Kanban board** block (Lucide `SquareKanban`) appears in the template editor palette
      and can be placed/split/removed like every other block.
- [x] Selecting the block shows the relative-path config input; the inline placeholder label
      reflects the configured path.
- [x] A saved template containing a kanban block round-trips through the `canvas_templates` blob
      with its `open-kanban` kind + `file` intact.
- [x] Using such a template against a folder containing the board opens a live editable
      `KanbanPanel` bound to that folder + path, plus a deduped `kind:"kanban"` left-panel/Overview
      row (#152).
- [x] When the board file is absent, the panel shows the inline error + **Retry**; **Pick file**
      keeps the block a Kanban board (resolves into a `KanbanPanel`, not a `FileViewer`).
- [x] `npm run build`, `npm run lint`, and `npm test` pass.

**Implementation report** (commit `00451cc`, 2026-06-24)

Added an `open-kanban` block to the template block registry so a saved Canvas template can open a
repo's markdown Kanban board, mirroring `open-file`. The shared `config:"file"` editor UI and the
pending-panel **Pick file** / **Retry** error-recovery flow handle the new block generically — **no
new UI surfaces**. Resolution stays read-only and `fileExists`-gated (no silent file write into a
freshly-chosen folder), consistent with `open-file`/`open-diff`.

**Key files touched:** `src/components/Canvas/templateBlocks.ts` (registry entry + `BlockKind`),
`src/components/Canvas/templateInstantiate.ts` (explicit `kanban` case carrying `repoPath` **and**
`file`), `src/store.ts` (`resolveTemplateBlock` gated kanban branch + deduped Overview registration;
`pickTemplateBlockFile` block-kind preservation), `src/types/index.ts`; tests in
`templateBlocks.test.ts`, `templateInstantiate.test.ts`, `store.test.ts`.

**Notes**

- **Read-only, gated resolution (not create-or-open):** the live Views-menu kanban entry offers an
  in-picker create-or-open flow (#151), but template-block resolution is deliberately read-only and
  gated with a **Pick file** / **Retry** escape hatch; auto-creating a missing board at
  instantiation was left as a possible follow-up (out of scope).
- The `pickTemplateBlockFile` hardcoded-`open-file` fix was **required, not optional** — without it,
  Pick file on a kanban block would silently convert it to a file viewer.

---

### 155. [x] Canvas panel drag: lift on drag-start, restore on cancel

**Status:** Done
**Depends on:** none · _(builds on shipped systems: the #135 move-leaf grip + #144 whole-header
grip, the #18 persistent terminal pool, the #84 dual main+detached DndContext, and the pure
`canvasTree` ops. Independent of #154.)_
**Created:** 2026-06-24

**Description**

Inside a Canvas tab you can drag an **existing** panel by its header to reorder/reposition it (#135
`moveLeaf` / #144 whole-header grip), but the panel **stayed in the layout for the entire drag** —
its space remained occupied, so the user couldn't freely see or choose where to drop it (the move
was computed atomically on drop). This task makes the drag direct: at **drag start** the panel is
**lifted out** of the layout, the remaining panels immediately reflow to fill the gap (exposing drop
targets across the whole canvas), a drag **ghost** follows the cursor, and on **drop** the panel
lands in the chosen spot. Cancelling (Esc) or releasing outside any drop zone restores the panel to
its **exact** previous position — the literal complaint on the source card.

**Design decision (chosen approach): non-destructive lift.** The lift is kept **out of persisted
state** — a transient `liftedLeaf` ref drives a *derived* display layout (active layout minus the
lifted leaf), and the persisted `canvases` blob is written **only on a committed drop**. So a
cancel is an exact restore, and an interrupted drag (Esc, window close, crash) can never strand or
lose a panel. This deliberately supersedes #135's atomic-on-drop computation; `moveLeaf`'s
id-preservation guarantee is retained in the commit path so the #18 pooled terminal **reparents**
instead of being disposed/recreated.

**Subtasks**

1. [x] **Transient lift state** (`store.ts`): non-persisted `liftedLeaf: { canvasId, leafId } | null`
   + `beginCanvasLift` / `commitCanvasLift` / `cancelCanvasLift`; excluded from anything serializing
   `canvases`.
2. [x] **Derived display layout** (`canvasTree.ts`): pure `displayedLayout(layout, liftedLeafId)` —
   the layout with the lifted leaf removed (identity when none) — drives the reflow without touching
   persisted state.
3. [x] **Commit/cancel logic:** edge drop → `moveLeaf` (prune + re-split reusing original id +
   content); sole-panel center drop → already the whole tree, clear the lift; cancel / drop-on-nothing
   → clear the lift (no layout write = exact restore). Retired the atomic `moveCanvasLeaf` action +
   `applyCanvasMove` helper.
4. [x] **Main-window handlers** (`App.tsx`): `onDragStart` → `beginCanvasLift`, `onDragEnd` → shared
   `applyCanvasLiftEnd(over)` (commit or restore — no early `!over` return that would strand the
   panel), `onDragCancel` → `cancelCanvasLift`; sidebar-drop branch left intact.
5. [x] **Detached-window handlers** (`CanvasWindow.tsx`, #84): mirror the main window via the shared
   `canvasDrop.ts` helpers (no drift between windows).
6. [x] **DragOverlay ghost:** `<CanvasDragOverlay>` + `PanelDragGhost` (exported from
   `CanvasSurface`) render a header-like chip (grip + title via a new `leafTitleText` helper), needed
   because the lifted panel's DOM node leaves the tree.
7. [x] **CanvasSurface source:** lifted panel no longer rendered during its own drag; stale
   atomic-on-drop comment updated; edge zones cover the reflowed space.
8. [x] **Tests:** `displayedLayout` remove/identity (`canvasTree.test.ts`); lift
   begin/commit/center/cancel (`store.test.ts`).
9. [x] **Verify:** `npm run build`, `npm run lint`, `npm test` (196), `prettier --check` all pass.

**Acceptance criteria**

- [x] Starting to drag an existing panel's header immediately removes it from the visible layout;
      the remaining panels reflow and a drag ghost follows the cursor.
- [x] Drop zones cover the reflowed layout, so the panel can be dropped in regions the source
      previously occupied (the original complaint).
- [x] Dropping on a valid target places the panel there while preserving its content and its #18
      pooled terminal (no reload / dispose-recreate).
- [x] Cancelling (Esc) or releasing outside any drop zone restores the panel to its exact previous
      position.
- [x] Lifting the only panel exposes the empty-canvas center target; dropping re-places it and
      cancel restores it.
- [x] Behavior is identical in the main window and a detached canvas window (#84).
- [x] The persisted `canvases` layout is written only on a committed drop.
- [x] `npm run build`, `npm run lint`, `npm test` pass; pure-logic tests cover lift/commit/cancel.

**Implementation report** (commit `0bc2a8d`, 2026-06-24)

Implemented the lift/restore flow for existing-panel (`move-leaf`) drags in both the main and
detached Canvas windows, with a DragOverlay ghost and a derived reflow. The persisted `canvases`
blob is written only on a committed drop, so an interrupted drag can never strand a panel; the
terminal-reconcile effect keys on the *persisted* layout (unchanged during a lift) so a lifted
agent/terminal PTY is never disposed — its pooled xterm parks on unmount and reparents on
commit/cancel.

**Key files touched:** `src/store.ts` (transient lift state + actions; retired `moveCanvasLeaf`),
`src/components/Canvas/canvasTree.ts` (`displayedLayout`) + `.test.ts`,
`src/components/Canvas/CanvasSurface.tsx` (reflow source, `PanelDragGhost`, `leafTitleText`) +
`Canvas.module.css`, `src/components/Canvas/canvasDrop.ts` (shared `applyCanvasLiftEnd`),
`src/App.tsx` + `src/components/CanvasWindow/CanvasWindow.tsx` (both DndContexts), `src/store.test.ts`.

**Notes**

- **Non-destructive lift** (transient state, persist only on commit) was chosen over
  mutating-then-restoring so a cancel is an exact restore and an interrupted drag can never strand a
  panel; the `moveLeaf` id-preservation guarantee is retained in the commit path so pooled terminals
  reparent rather than being recreated.
- **DragOverlay is required** because the active draggable leaves the DOM during the lift — without
  it dnd-kit has nothing to render as the drag preview.
- **Out of scope, left untouched:** sidebar→Canvas new-content drops, cross-window drag, and the
  Overview/sidebar dnd contexts.

---

### 156. [x] Kanban board horizontal scroll in Overview mode

**Status:** Done
**Depends on:** none · _(self-contained CSS fix, independent of #154 (kanban template block) and
#155 (canvas drag).)_
**Created:** 2026-06-24

**Description**

A Kanban board panel (#145) with more columns than fit the visible width **could not be scrolled
horizontally when shown as an Overview column** — the extra columns were simply clipped. In
**Canvas** mode the same board scrolls fine. Goal: make the Overview kanban panel scroll
horizontally like the Canvas one, so all columns are reachable regardless of the Overview column
width.

**Root cause:** the kanban board strip is already correct (`KanbanPanel.module.css`: `.board {
overflow-x: auto }` + fixed-width `.column`s). `overflow-x: auto` only scrolls when `.board`'s width
is bounded by its container. Canvas's `.panelBody` includes `min-width: 0` **and** a `.panelBody >
* { flex: 1; min-width: 0; min-height: 0 }` child-fill rule, so the board is width-bounded and
scrolls. Overview's shared `PanelColumn` `.body` was only `{ display: flex; flex: 1; min-height: 0
}` — **missing `min-width: 0`** and the child-fill rule — so the board kept its intrinsic content
width (the classic flexbox `min-width: auto` gotcha) and was clipped by the Overview `.card`'s
`overflow: hidden`. A one-file CSS fix in `Overview.module.css`.

**Subtasks**

1. [x] Add `min-width: 0;` to the `.body` rule (the shared PanelColumn content area).
2. [x] Add `.body > * { flex: 1; min-width: 0; min-height: 0; }` mirroring Canvas's `.panelBody > *`
   so the single content child fills the column and can shrink below intrinsic width, engaging the
   board's `overflow-x: auto`.
3. [x] Confirm the `KanbanPanel` root fills via that rule; `KanbanPanel.module.css` left untouched.
4. [x] Manual verification (Overview board with enough columns scrolls) — interactive, not runnable
   headlessly; the fix replicates the proven Canvas pattern verbatim.
5. [x] Regression: Canvas kanban unchanged; other Overview panel types (terminal/diff/file/scheduled)
   render unchanged (they get the same flex sizing Canvas already applies).
6. [x] `npm run build`, `npm run lint`, `npm run format:check` (+ `npm test`, 196) pass.

**Acceptance criteria**

- [x] In Overview mode, a Kanban panel whose columns exceed the visible width scrolls horizontally
      and no columns are clipped.
- [x] Vertical card scrolling within a column still works in Overview.
- [x] Canvas-mode Kanban horizontal scrolling is unchanged.
- [x] Other Overview panel types render unchanged.
- [x] `npm run build`, `npm run lint`, `npm run format:check` pass.

**Implementation report** (commit `acaa0f5`, 2026-06-24)

One-file CSS fix in **`src/components/Overview/Overview.module.css`** exactly as diagnosed: added
`min-width: 0` to the shared PanelColumn `.body` and a `.body > * { flex: 1; min-width: 0;
min-height: 0; }` child-fill rule mirroring Canvas's `.panelBody > *`. This bounds the kanban
`.panel`/`.board` width so its existing `overflow-x: auto` engages instead of being clipped by
`.card`'s `overflow: hidden`. `KanbanPanel.module.css` and the Canvas path are untouched; `.body`
wraps a single content child per panel, so the child-fill rule is safe for every panel type.

**Key files touched:** `src/components/Overview/Overview.module.css` (only).

**Notes**

- The fix belongs in the shared Overview `PanelColumn` `.body` (mirroring Canvas), not in
  `KanbanPanel` — the kanban component is already context-agnostic and correct; the divergent
  wrapper is what differed between the two views.
- **Likely shared fix:** the separate **"markdown render cutoff"** Refine card (FileViewer text/
  toolbar cut off in Overview at small widths, later refined as #158) almost certainly stems from the
  same missing `min-width: 0`; this fix may partly resolve it, but #158 is tracked and verified
  independently and was deliberately not chased here.

---

### 157. [x] "Big mode" — maximize any item into a full-window modal overlay

**Status:** Done
**Depends on:** none · _(builds on shipped infra: the #18 terminal pool, the #84 ownership/
`DetachedNote` model, the app modal pattern (Settings/CanvasCloseModal), and the existing content
kinds. Independent of #155 (canvas drag) and #156 (kanban scroll), though it shares
`CanvasSurface` edits with #155.)_
**Created:** 2026-06-24

**Description**

Add a **maximize ("big mode")** affordance to every item's top bar (Canvas panel header + Overview
column header): a one-click icon that opens that single item — agent, terminal, file, kanban, diff,
or scheduled — in a near-fullscreen modal overlay over a dimmed scrim, then restores it on close. A
small terminal/file/diff/kanban column is often too cramped to read or work in; big mode gives a
full-size view without rearranging panels or popping out a native window (#84).

**Hard constraints respected:** (1) **One pooled terminal in one DOM slot at a time (#18/#84)** — a
`<Terminal>` is a reparented pool node, so the modal and the source panel can't both mount it; (2)
**single auto-save instance (#148)** — `FileViewer`(raw)/`KanbanPanel` use `useAutoSaveFile`, so two
mounts would double-poll and race writes. Both are solved by the **one-live-render-site rule**: while
an item is maximized, its source panel/column renders a `MaximizedNote` placeholder and the modal is
the sole live render (the same principle as #84 ownership). The pool reparents source→modal→source
reload-free.

**Subtasks** (all shipped as one cohesive feature)

1. [x] **Pure helpers** (`canvasDrop.ts`): `sameItem(a,b)` (agent/terminal→sessionId; file/kanban→
   repoPath+file; diff→repoPath; scheduled→scheduleId), `overviewPanelToContent`, `itemStillPresent`
   — unit-tested.
2. [x] **Store** (`store.ts`): transient, never-persisted `maximizedItem: CanvasContent | null` +
   `maximizeItem` / `closeMaximized`.
3. [x] **Shared renderer** `components/ItemContent/ItemContent.tsx`: the single source of truth for
   content-descriptor → live child, carrying the #84 ownership guard **and** the big-mode placeholder;
   it replaced the duplicated inline render logic in `CanvasSurface.renderContent` and Overview's
   three card bodies. Title helpers extracted to `itemTitle.ts` (no React) to avoid an import cycle.
4. [x] **Affordance:** a Lucide `Maximize2` button on the Canvas panel header (all kinds but
   `pending`) and on all three Overview card action groups.
5. [x] **Modal** `components/BigMode/BigModeModal.tsx`: near-fullscreen (`inset: var(--space-16)`)
   over `--scrim`, `role="dialog"` `aria-modal`, header (title + close), body = `<ItemContent inModal
   active>`. Closes on close-button, scrim mousedown, and Esc **gated to non-terminal focus** (skips
   when the target is inside `.xterm`). Mounted in `App.tsx` **and** `CanvasWindow.tsx` (per-window).
6. [x] **One live render site:** `ItemContent` renders `MaximizedNote` when this exact item is
   maximized and it's not the modal's `inModal` instance.
7. [x] **Lifecycle guard:** an `itemStillPresent` effect auto-closes the modal when the maximized
   item disappears (agent exits/removed, panel closed, schedule cancelled).
8. [x] **Detached windows (#84):** per-window modal; maximize icon shown even when `!ownedHere` (the
   modal then shows `DetachedNote`).
9. [x] **Styling:** `BigModeModal.module.css` + `MaximizedNote.module.css`, on-system tokens,
   reduced-motion honored.
10. [x] **Tests:** `sameItem` + store `maximizeItem`/`closeMaximized`.
11. [x] **Verify:** `npm run build`, `npm run lint`, `npm run format:check`, `npm test` (205) pass.

**Acceptance criteria**

- [x] Every item top bar (Canvas panel + Overview column) for agent/terminal/file/kanban/diff/
      scheduled shows a maximize icon (not on `pending` panels).
- [x] Clicking it opens that one item in a modal filling (nearly) all width and height over a scrim.
- [x] The modal renders the **live** item while the source shows a "shown in big mode" placeholder —
      the pooled terminal and any auto-save hook run in exactly one place.
- [x] Close (button / scrim / gated-Esc) restores the item with **no** terminal reload.
- [x] Works from both Overview and Canvas, main window and detached canvas window.
- [x] Removing/closing/exiting the underlying item while maximized auto-closes the modal.
- [x] `npm run build`, `npm run lint`, `npm test` pass; `sameItem` + store-action tests included.

**Implementation report** (commit `0e0e252`, 2026-06-24)

Shipped as one feature. The shared `ItemContent` renderer became the single source of truth (with
both the #84 ownership guard and the new big-mode placeholder), removing the prior Overview /
CanvasSurface render duplication; the #155 drag ghost now reuses the extracted `itemTitle`. Terminal
preservation: the leaf/panel stays in `canvases`/`overviewPanels` while maximized so the reconcile
keeps the PTY, and the pool's slot-equality guard makes the source→modal→source reparent reload-free.

**Key files touched:** `src/components/ItemContent/{ItemContent.tsx,itemTitle.ts,*.module.css}`
(new shared renderer + title helpers), `src/components/BigMode/{BigModeModal.tsx,*.module.css}` (new
modal), `src/components/MaximizedNote/*` (new placeholder), `src/components/Canvas/canvasDrop.ts`
(+`.test.ts`: `sameItem`/`overviewPanelToContent`/`itemStillPresent`), `src/store.ts` (+`.test.ts`:
`maximizedItem` + actions), `src/components/Canvas/CanvasSurface.tsx` + `src/components/Overview/
Overview.tsx` (use the shared renderer + maximize icon), `src/App.tsx` + `src/components/CanvasWindow/
CanvasWindow.tsx` (mount the modal per-window).

**Notes / deviations (recorded)**

- **"All width and height"** = a near-fullscreen modal (small inset + thin header), reusing the app
  modal pattern, rather than literally edge-to-edge — keeps the scrim/close affordance visible.
- **No rigid Tab focus-trap** in the modal: the body hosts interactive content (terminal/editor) that
  manages its own focus; a Tab-cycling trap would fight the terminal. Kept `aria-modal` + the three
  closers.
- **Esc-to-close is gated to non-terminal focus** because a focused terminal swallows keystrokes;
  the close button + scrim are the primary closers.
- **Subtask 11 (manual UI verification)** can't run headlessly; the behavior reuses proven infra (the
  #18 pool reparent, #84 ownership/`DetachedNote`, the app modal pattern).

---

### 158. [x] FileViewer cutoff in Overview at narrow widths (markdown text + Rendered/Raw toolbar)

**Status:** Done
**Depends on:** none · _(parallel to #156, which fixes the Overview `.body` wrapper; kept
independent — every change here is FileViewer-internal CSS and works with or without #156.)_
**Created:** 2026-06-24

**Description**

A markdown file shown as an **Overview column** was **cut off horizontally at small column widths**
(the same column works fine in Canvas). Two symptoms: (1) the rendered markdown text was clipped on
the right instead of wrapping to the column; (2) the **Rendered / Raw** toggle (+ "Saving…/Saved"
status) in the toolbar was pushed off / clipped, so you couldn't switch views.

**Root cause (FileViewer-internal CSS):** the FileViewer root `.viewer` is `{ display: flex; flex:
1; min-height: 0; flex-direction: column }` but had **no `min-width: 0`**. A flex item's default
`min-width: auto` keeps its content's intrinsic width, so when content is wider than the column
`.viewer` refuses to shrink and the Overview `.card { overflow: hidden }` clips it. In Canvas this
never happens because the panel body `.panelBody` already sets `min-width: 0` (+ a `> * { min-width:
0 }` rule). The toolbar separately clipped because `.toolbar`/`.status`/`.segmented` don't shrink.

**Subtasks**

1. [x] `.viewer { min-width: 0 }` so it shrinks to the Overview column width.
2. [x] Responsive toolbar: `.toolbar { min-width: 0; gap: var(--space-8) }`; `.status { min-width: 0;
   overflow: hidden; text-overflow: ellipsis; white-space: nowrap }` (truncates instead of pushing the
   toggle off); `.segmented { flex-shrink: 0 }` (the Rendered/Raw toggle never clips). The optional
   `flex-wrap` was **not** added — the truncating status + non-shrinking toggle keep it single-line at
   any realistic width (cards are `flex: 1 0 360px`).
3. [x] `.markdown { min-width: 0; overflow-wrap: anywhere }` (alongside existing `word-wrap:
   break-word`) so long unbreakable tokens (URLs, inline code) wrap; `.markdown pre` code blocks still
   scroll.
4. [x] Read-only raw/code surface now scrolls horizontally within the bounded `.viewer` instead of
   being clipped (a side benefit of the `.viewer` fix — no edit needed there).
5. [x] Manual narrow-column verification — interactive, can't run headlessly; the fix mirrors the
   proven Canvas pattern.
6. [x] `npm run build`, `npm run lint`, `npm run format:check` (+ `npm test`, 205) pass.

**Acceptance criteria**

- [x] In a narrow Overview column, rendered markdown wraps and is fully visible — no right-edge cutoff.
- [x] The Rendered/Raw toggle (+ status) remain visible/usable at narrow Overview widths; the toggle is
      never clipped.
- [x] The raw/code view scrolls horizontally within the column rather than being clipped.
- [x] Canvas FileViewer rendering is unchanged.
- [x] `npm run build`, `npm run lint`, `npm run format:check` pass.

**Implementation report** (commit `7f30582`, 2026-06-24)

CSS-only fix in **`src/components/FileViewer/FileViewer.module.css`** exactly as diagnosed — fixes the
FileViewer **directly** (robust in any flex context) and additionally fixes the toolbar, which #156's
Overview `.body` change does not cover. Canvas FileViewer is unchanged (Canvas already bounded it via
`.panelBody`, so the new `min-width: 0` is redundant + harmless there).

**Key files touched:** `src/components/FileViewer/FileViewer.module.css` (only).

**Notes**

- **Relationship to #156:** #156 fixes the Overview `.body` wrapper (kanban scroll); its `.body > * {
  min-width: 0 }` would also bound this `.viewer` (redundant + complementary). This task fixes the
  FileViewer directly and adds the toolbar fix #156 doesn't cover — kept independent (no ordering).
- **KanbanPanel** has an identical toolbar structure (`.toolbar`/`.status`/`.segmented`) and would
  benefit from the same toolbar fix — tracked under the Kanban UI cards, not chased here.

---

### 159. [x] Remove Kanban column move-left/right buttons (move per task, not whole columns)

**Status:** Done
**Depends on:** none · _(self-contained removal in `KanbanPanel.tsx`; independent of #156 (kanban
scroll) and #158 (FileViewer); related to the broader Kanban UI iteration card (#161) but not
blocked by it.)_
**Created:** 2026-06-24

**Description**

The Kanban column header had two chevron buttons — **Move column left** (`‹`) / **Move column
right** (`›`) — that shifted an entire column (with all its cards) one position over. The card: "The
Kanban UI should not have buttons to move the entire content from one column to the next. We want to
move things per task." Goal: declutter the column header and steer interaction toward per-card
drag-and-drop (the intended way to move a task between lanes), removing the coarse whole-column move
affordance. Cards already move per task via their `GripVertical` drag handle (dragging between lanes
= a status change), so per-task movement is fully preserved.

**Subtasks**

1. [x] Deleted the two `onMove(-1)` / `onMove(1)` chevron buttons from `BoardColumn`'s
   `styles.columnActions`, leaving Delete as the sole column action.
2. [x] Removed `onMove` / `isFirst` / `isLast` from `ColumnProps`.
3. [x] Removed the `isFirst` / `isLast` / `onMove` props from the `<BoardColumn>` call site.
4. [x] Removed the now-unused `ChevronLeft` / `ChevronRight` / `moveColumn` imports from
   `KanbanPanel.tsx`. **Kept** `moveColumn`'s export in `kanbanOps.ts` (still imported by
   `kanbanOps.test.ts`).
5–7. [x] `npm run build`, `npm run lint`, `npm run format:check`, `npm test` (205) pass; manual
   verification is interactive (build+lint confirm no dead refs remain).

**Acceptance criteria**

- [x] The Kanban column header no longer shows Move-left / Move-right buttons (Overview + Canvas).
- [x] Moving a card between columns (drag) and reordering within a column still work; column rename,
      delete, add-card, and add-column still work.
- [x] No dead/unused imports or props remain; `npm run build`, `npm run lint`, `npm test` pass.

**Implementation report** (commit `e47d7f8`, 2026-06-24)

Clean removal in `KanbanPanel.tsx` — deleted the two `‹`/`›` chevron buttons, dropped
`isFirst`/`isLast`/`onMove` from `ColumnProps` and the call site, and removed the now-unused
`ChevronLeft`/`ChevronRight`/`moveColumn` imports. The Delete (and rename) column actions and all
per-card behavior (drag between/within lanes, edit, delete, add) are untouched.

**Key files touched:** `src/components/Kanban/KanbanPanel.tsx` (only; `kanbanOps.ts` deliberately
unchanged).

**Notes**

- **Kept `moveColumn` + its test** in `kanbanOps.ts` (a small tested pure op): its export stays live
  (the test imports it, so no lint error), and the upcoming **Kanban UI iteration** card (#161) may
  re-introduce column reordering via drag, which would reuse it.
- **Consequence (flagged):** with the buttons gone, columns can no longer be reordered from the UI
  until drag-to-reorder is added — deliberately out of scope here ("move things per task"), tracked
  under the broader Kanban UI iteration card.

---

### 160. [x] Kanban: commit card edits on confirm, not on every keystroke

**Status:** Done
**Depends on:** none · _(kanban-specific edit-commit timing; orthogonal to and composes with the
global "Auto save settings" card (#162); independent of #159 (column buttons).)_
**Created:** 2026-06-24

**Description**

Editing a Kanban card wrote to disk on **every keystroke** — while typing a card's title/body the
board was re-serialized and (debounced) written over and over. The card: "I want, for the kanban
board specifically, it to only save once I click the little checkmark for an individual card.
Instead of the constant auto saving." Goal: hold the in-progress title/body in **local draft state**
and write through the save buffer **once** when the user confirms the card (the per-card Done-editing
checkmark, or blur / Enter). Discrete actions (toggle done, drag, add/delete) keep saving
immediately — they aren't "constant," and the complaint is specifically about typing.

**Subtasks**

1. [x] Added local draft state in `KanbanPanel`: `editDraft: {title, body} | null` + `renameDraft:
   string | null`, seeded from the card/column when edit mode starts.
2. [x] The editing card's title `<input>` / body `<textarea>` (and the column-rename input) bind to
   the **draft**; `onChange` updates the draft only — **never** `mutate` — so typing produces zero
   per-keystroke writes (the "Saving…" hint never churns). Non-editing cards render from `board`.
3. [x] **Commit on confirm:** `commitCardDraft`/`commitRenameDraft` write once via the existing
   `mutate`→`setText`→#148 debounced buffer, and only when the draft differs (no-op edits don't
   write). Triggers: the Done-editing `<Check>`, **Enter** in the title, and **blur-out of the whole
   card** (an `onBlur` on the `<article>` using `relatedTarget` containment so moving focus between
   the card's own controls doesn't prematurely commit). Column rename commits on blur/Enter.
4. [x] **Commit-on-switch:** `startCardEdit` / `startColumnRename` / add-card / add-column /
   drag-start all commit the in-flight draft first, so switching never loses edits.
5. [x] Same commit-on-confirm applied to column rename.
6. [x] **No mid-edit clobber:** a `useEffect` calls the #148 hook's `onFocus()` while an edit is open
   (pauses the hot-reload poll) and `onBlur()` on close (resume + flush), since the local draft
   doesn't mark the buffer dirty.
7. [x] Discrete mutations (toggle/drag/add/delete) keep calling `mutate` immediately — unchanged.
8. [x] **Verify:** `npm run build`, `npm run lint`, `npm run format:check`, `npm test` (205) pass.

**Acceptance criteria**

- [x] Typing in a card's title/body triggers **no** per-keystroke disk write (no "Saving…" churn).
- [x] The edit is written **once** on confirm (Done-editing checkmark, title blur / Enter) through the
      existing buffer.
- [x] Switching to edit another card or a column commits the in-flight draft (no lost edits).
- [x] Column rename writes on confirm (blur/Enter), not per keystroke.
- [x] Discrete actions still persist immediately.
- [x] A hot-reload during an open edit does not clobber the in-progress draft.
- [x] `npm run build`, `npm run lint`, `npm test` pass.

**Implementation report** (commit `89bc832`, 2026-06-24)

Commit-on-confirm model implemented entirely in `KanbanPanel.tsx` — no change to `kanbanOps.ts` or
`useAutoSaveFile.ts` (the task changed *when* the pure ops are applied, not what they do). The
keystroke-no-write guarantee is **structural** (draft state, no `mutate` on `onChange`); the `onBlur`
uses `relatedTarget` containment so intra-card focus moves (title ↔ body ↔ Done) don't prematurely
commit/exit.

**Key files touched:** `src/components/Kanban/KanbanPanel.tsx` (only).

**Notes**

- **Interpretation:** "the little checkmark for an individual card" = the Done-editing `<Check>`
  button; blur/Enter added as equivalent commit triggers for robustness.
- **Why not all mutations:** "constant auto saving" describes per-keystroke writes while typing;
  discrete one-shot actions aren't constant, so they stay immediate.
- **Out of scope (untouched):** the Raw-view textarea (#149) stays a normal auto-saving editor; the
  global "Auto save settings" card (#162) is independent and composes (a confirmed card edit feeds the
  buffer, which the global mode then writes per its policy).

---

### 161. [x] Kanban board UI/UX polish pass

**Status:** Done
**Depends on:** #159, #160 · _(the **last** kanban pass — iterates on the cleaned-up code: #159 left
the column header with Delete as its only action, #160 made card editing commit-on-confirm; this pass
polishes around those final shapes. #156 (Overview scroll) already done.)_
**Created:** 2026-06-24

**Description**

A visual + interaction **polish pass** over the existing Kanban board (no data-model or format
change). The user: "I don't like the UI of the kanban items. Iterate over the entire Kanban screen UI
and ensure it is optimized for UX." Goal: tidy visual hierarchy, uncluttered cards, clearer drag/drop
affordances, sensible empty states, and a toolbar that survives narrow widths — while keeping every
capability and the Obsidian-Kanban `.md` round-trip lossless.

**Subtasks**

1. [x] **Card clutter → hover/focus-revealed actions:** the card grip + Edit/Delete (and column
   Delete) are `opacity: 0` by default and reveal on `:hover` / `:focus-within`; editing keeps actions
   visible and the confirm-delete state stays shown. Title/checkbox/body stay always interactive.
2. [x] **Card visual hierarchy:** hover (`--border-strong`) / focus-within (`--accent`) border
   transition, title-first layout, done-state strike preserved.
3. [x] **Clearer drop affordance:** added a `<DragOverlay>` floating `CardPreview` (no action buttons,
   elevated shadow) under the cursor while the origin slot becomes a dashed `--accent` insertion
   placeholder (`.cardPlaceholder`) — replacing the old in-place `opacity: 0.4`. Cross-column drag
   still = status change (`moveCard` unchanged).
4. [x] **Column header polish:** rename button hover cue; Delete reveals on hover/focus.
5. [x] **Empty states:** an empty column shows a "No cards yet" hint above Add card.
6. [x] **Toolbar responsiveness (folded in from #158):** `.toolbar { min-width: 0 }` + gap, `.status`
   truncates (ellipsis), `.segmented { flex-shrink: 0 }` so the Board/Raw toggle never clips.
7. [x] **a11y/motion:** on-system tokens only; global `:focus-visible` ring + global
   `prefers-reduced-motion` killswitch cover the new transitions automatically.
8–9. [x] **No regressions / verify:** `npm run build`, `npm run lint`, `npm run format:check`,
   `npm test` (205, incl. unchanged `kanban.test`/`kanbanOps.test`) pass.

**Acceptance criteria**

- [x] Cards look less cluttered (Edit/Delete/grip on hover/focus); clear hover/active state and a
      legible title-first hierarchy.
- [x] Dragging a card shows a clear destination cue (insertion placeholder + drag-overlay ghost);
      cross-column drag still changes status.
- [x] The column header (rename, count, Delete) reads as intentional and uncluttered after #159.
- [x] Empty columns show a subtle hint rather than a bare gap.
- [x] The Board/Raw toggle stays visible/usable at narrow widths (kanban toolbar responsive,
      mirroring #158).
- [x] All on-system tokens, `:focus-visible` outlines, reduced-motion honored; `.md` round-trip
      lossless.
- [x] `npm run build`, `npm run lint`, `npm run format:check`, `npm test` pass.

**Implementation report** (commit `fb1e7d3`, 2026-06-24)

Style + an additive drag overlay over `KanbanPanel.tsx` + `KanbanPanel.module.css` — all behavior
preserved, `.md` round-trip untouched. New JS: `activeCardId` state + `DragOverlay` wiring
(`onDragStart`/`onDragEnd`/`onDragCancel`), a `CardPreview` component, and the empty-column hint.
This pass also **owned the kanban toolbar fix** that #158 explicitly deferred here (the kanban
`.toolbar` shares the FileViewer's structure).

**Key files touched:** `src/components/Kanban/KanbanPanel.tsx` + `src/components/Kanban/
KanbanPanel.module.css` (only).

**Notes**

- **Vague-request handling:** "optimize the UX" is subjective, so the pass fixed *concrete* current
  shortcomings (always-visible clutter, weak drop cue, no empty state, fragile toolbar, minimal
  hover/focus states) within the existing structure rather than an open-ended redesign — no new
  features (labels/dates/swimlanes/WIP limits were explicitly out of scope).
- `.columnActions:has(.colBtnDanger)` uses `:has()` (supported in the app's WKWebView) as progressive
  enhancement — if unsupported the rule is ignored and column hover still reveals the confirm-delete
  state.

---

### 162. [x] Settings: auto-save vs manual save (⌘S), with a Save button in manual mode

**Status:** Done
**Depends on:** none · _(all infra existed: Settings #100, `useAutoSaveFile` #148, `useKeyboardNav`.
Orthogonal to #160 (kanban edit→buffer timing) and #161 (kanban toolbar styling) — this governs
buffer→disk timing.)_
**Created:** 2026-06-24

**Description**

A global Settings choice between **auto-save** (today's behavior, default) and **manual save**. The
card: "the user should be able to choose between auto save and manual save options. Auto save is the
default… should the user choose to manually save, the cmd+s button saves files and the auto save
indicator changes to a save button instead. Ensure that the entire plan keeps in account for all the
different places that may save files." Goal: give users an explicit manual-save mode (⌘S / Save
button) while keeping auto-save the default.

**Key insight — one chokepoint covers every file save:** every editable **file** write routes through
the shared `src/useAutoSaveFile.ts` hook (#148); its only consumers are the FileViewer raw/plain-text
editor and the KanbanPanel Board + Raw editors. Implementing the mode there covers "all the different
places that may save files" in one place. (ScheduledPanel auto-saves a schedule *record* via
`update_schedule`, not a file — out of scope.)

**Subtasks**

1. [x] **Setting:** `autoSave: boolean` added to `Settings` + `DEFAULT_SETTINGS` (default **true**);
   an "Auto-save files" checkbox + mode-aware helper in Settings → Behavior, persisted via the
   existing draft/Save flow (merged over `DEFAULT_SETTINGS`, so old `sessions.json` upgrades cleanly).
2. [x] **`useAutoSaveFile` manual mode:** reads `settings.autoSave` (via a ref so stable callbacks
   aren't re-created). Auto = unchanged. Manual: `setText` marks the buffer dirty but does **not**
   schedule a write; `onBlur` does **not** flush; `save()` flushes on demand; a mode-switch effect
   reconciles (auto→manual cancels the debounce + keeps the dirty buffer, manual→auto schedules a
   write if dirty). **Unmount / file-switch still flushes dirty content in both modes** (data-loss
   safety). New `AutoSaveFile` fields: `dirty`, `manual`, `save`.
3. [x] **Saver registry** (`src/saverRegistry.ts`, a non-React singleton like `outputBus`/
   `terminalPool`): each mounted buffer registers `{isFocused, isDirty, save}`; `saveFocused()` saves
   the focused editor, or — if none focused — every dirty buffer (so ⌘S never no-ops while edits are
   pending). Unit-tested.
4. [x] **⌘S** in `useKeyboardNav` (capture phase): manual mode → `preventDefault` + `saveFocused()`;
   auto mode leaves the keystroke alone. Works in main + detached windows.
5. [x] **Save-button UI:** both the FileViewer and Kanban toolbars render an accent **Save** button
   (disabled muted "Saved" when clean) in place of the "Saving…/Saved" hint when `manual`; auto mode
   keeps the hint. Shared `.saveBtn` styling, toolbar layout intact.
6. [x] **Coverage:** the only non-hook `writeTextFile` caller is the #151 *create-board* one-shot file
   creation (not an editing save); ScheduledPanel saves a record, not a file.
7. [x] **Tests:** `saverRegistry.test.ts` (`saveFocused` selection); existing hook/kanban tests still
   pass in auto mode.
8. [x] **Verify:** `npm run build`, `npm run lint`, `npm run format:check`, `npm test` (209, +4) pass.

**Acceptance criteria**

- [x] Settings has an "Auto-save files" toggle (default **on**); the choice persists across restarts.
- [x] With auto-save **on**, behavior is unchanged (debounced writes + "Saving…/Saved" hint) for
      FileViewer and Kanban.
- [x] With auto-save **off**: edits are **not** written on keystroke/blur/debounce; the indicator
      becomes a **Save** button (enabled when dirty); **⌘S** saves the focused file. Both surfaces honor it.
- [x] No file-saving path bypasses the setting (all route through `useAutoSaveFile`).
- [x] Unsaved edits aren't silently lost when switching files or closing a panel in manual mode
      (flush-on-unmount safety).
- [x] `npm run build`, `npm run lint`, `npm test` pass.

**Implementation report** (commit `4bb69ae`, 2026-06-24)

The mode is implemented once in the hook + a tiny non-React saver registry + the two toolbars, so
"all the different places that may save files" are covered at the single chokepoint. ⌘S saves the
focused editor's file, or — when no editor is focused — all dirty buffers (so it never appears to do
nothing while edits are pending). Blur does **not** flush in manual mode, but unmount / file-switch
**does** (data-loss safety); a full "discard?" prompt was out of scope.

**Key files touched:** `src/useAutoSaveFile.ts` (manual mode + `dirty`/`manual`/`save`),
`src/saverRegistry.ts` (+`.test.ts`, new singleton), `src/useKeyboardNav.ts` (⌘S),
`src/types/index.ts` + `src/store.ts` (`autoSave` setting), `src/components/Settings/Settings.tsx`
(+`.module.css`, Behavior toggle), `src/components/FileViewer/FileViewer.tsx` +
`src/components/Kanban/KanbanPanel.tsx` (+ their `.module.css`, Save-button UI).

**Notes**

- **⌘S target:** focused editor, else all dirty buffers — conventional document behavior but robust to
  multiple open panels.
- **Interaction with #160/#161:** #160 governs edit→buffer timing, this governs buffer→disk timing
  (orthogonal, composing); #161 styles the kanban toolbar including this Save button. The FileViewer
  toolbar is the independent primary surface, so this task wasn't blocked by the kanban tasks.

---

### 163. [x] File viewer "Browse…": open any file from the filesystem via the native picker

**Status:** Done
**Depends on:** none · _(composes with #162 (manual save) — an out-of-repo file saves through the same
`useAutoSaveFile` path; coordinates with but isn't blocked by #157/#158 which touch nearby code.)_
**Created:** 2026-06-24

**Description**

The file-viewer's filename dropdown (`FileSwitcher`, #90) only listed files **inside the current
repo**. The card: "there should be the option to select other options… open a file picker (browse in
finder)… the file can be anywhere in the file system and it would still get picked up." Goal: add a
**Browse…** option that opens the native macOS open-file dialog so the user can open *any* file on
disk and have it render (and edit) in the viewer.

**Key design — reuse `(repoPath, relative file)`, no security change.** The viewer addresses a file as
`{ repoPath, file }` read/written through `files.rs` which validates that `repoPath.join(file)`
canonicalizes **inside** `repoPath`. An arbitrary absolute file `/a/b/c.md` is represented as
`{ repoPath: "/a/b", file: "c.md" }` — its own parent directory as the "root" — which trivially passes
that validation (a bare basename can't escape its parent), so **no backend confinement relaxation is
required**. The native open dialog is the user's explicit consent to open that specific file.

**Subtasks**

1. [x] **ipc** `pickFile()` wraps the native `open({directory:false, multiple:false})` dialog →
   absolute path or null (reuses the granted `dialog:default` capability).
2. [x] **`splitPath(abs)`** in `paths.ts` → `{dir, base}` (handles nested, fs-root `/c.md` →
   `{dir:"/", base}`, and bare-name cases); unit-tested.
3–4. [x] **FileSwitcher** gains an optional `onPickAbsolute(repoPath, file)` prop + a **Browse…**
   footer button (shown only when the prop is passed) that opens the dialog, splits the path, and
   calls it.
5. [x] **Host wiring — Canvas:** new `setLeafFileAbsolute(leafId, repoPath, file)` sets both refs on
   the leaf.
6. [x] **Host wiring — Overview:** new `moveOverviewPanelToFile(repoPath, panelId, newRepo, file)`
   **moves** the panel to the file's parent-dir repo key (dedup by repo+file; same-repo falls back to
   `setOverviewPanelFile`).
7. [x] **Read/edit path:** added a Rust test
   `reads_and_writes_an_out_of_repo_file_via_its_parent_dir` to `files.rs` confirming the
   `{parentDir, basename}` representation reads/writes with no confinement change.
8. [x] **Persistence:** opened absolute files (stored as `repoPath`+`file` in `canvases`/
   `overview_panels`) survive reload.
9. [x] **Docs:** updated the CLAUDE.md file-access scope note (Browse… / out-of-repo open, still
   dir-confined; Overview grouping consequence).
10. [x] **Verify:** `npm run build`, `npm run lint`, `npm test` (212, +3), `npm run format:check`,
   `cargo test`, `cargo clippy` all pass.

**Acceptance criteria**

- [x] The file-viewer filename dropdown has a **Browse…** option that opens the native macOS open-file
      dialog.
- [x] Selecting a file **anywhere** on disk opens it rendered by type and editable through the existing
      save path (auto-save / #162 manual mode).
- [x] The opened out-of-repo file persists and re-opens on restart.
- [x] `files.rs` repo-confinement logic is **unchanged**; each read/write remains confined to the
      chosen file's own directory.
- [x] `npm run build`, `npm run lint`, `npm test`, `cargo test` pass.

**Implementation report** (commit `4a73a91`, 2026-06-24)

Shipped exactly to the no-backend-change design: `/a/b/c.md` → `{repoPath:"/a/b", file:"c.md"}`, so the
existing repo-confined read/write validates against the file's own directory. The native dialog is the
user's explicit consent. Out-of-repo files persist via the standard `canvases`/`overview_panels` blobs.

**Key files touched:** `src/ipc.ts` (`pickFile`), `src/paths.ts` (+`.test.ts`, `splitPath`),
`src/components/FileSwitcher/FileSwitcher.tsx` (+`.module.css`, Browse… + `onPickAbsolute`),
`src/components/Canvas/CanvasSurface.tsx` + `src/components/Overview/Overview.tsx` (host wiring),
`src/store.ts` (`setLeafFileAbsolute` / `moveOverviewPanelToFile`), `src-tauri/src/files.rs` (test
only — logic unchanged), `CLAUDE.md` (scope note).

**Notes**

- **Core trick:** the `{parentDir, basename}` representation passes existing validation, so reads/
  writes stay confined and no backend change was needed.
- **Grouping consequence (documented):** an out-of-repo file opened as an Overview/sidebar item groups
  under a repo group named for its parent directory (grouping is by `effectiveRepo`); in a Canvas panel
  there's no grouping, so it's seamless there.
- **Out of scope (follow-up, per the card's "perhaps"):** Browse… in the repo-scoped Views/template/
  kanban pickers, where an out-of-repo path carries murkier repo semantics.

---

### 164. [x] Clickable worktree badge → worktree-scoped "open view" menu

**Status:** Done
**Depends on:** none · _(builds on shipped infra: #74 (worktree agents / `repoPath` = worktree
folder), #82 (`addOverviewPanel` + Views set), #59/#152 (overview panels = left panel + Overview),
#56/#151 (`FilePicker`), the `FileSwitcher` popover pattern. Extracts the shared `ViewsMenu` that
#165/#166 then reuse.)_
**Created:** 2026-06-24

**Description**

A worktree agent (#74) shows a small inert **"worktree"** text badge in its panel/card header. The
card: "This badge should be clickable. Clicking this badge will show a few options. Options to open a
diff view, or file inside this worktree. This opens a special panel in the left plane and inside the
overview mode… Any option should be available." Goal: turn the badge into a quick menu for opening
worktree-scoped views (diff / file / terminal / kanban) registered so they appear as a left-panel row
**and** an Overview column associated with that worktree — the same addable-view set the repo **Views**
menu (#82) offers, scoped to the worktree's folder (a worktree agent's `session.repoPath` **is** the
worktree folder).

**Subtasks**

1. [x] **Extracted a reusable `ViewsMenu`** (`components/ViewsMenu/`): the #82 addable-view action set
   (File viewer / Kanban board → inline `FilePicker`; Diff; Terminal) pulled into one self-contained
   component (`{repoPath, onClose}`) calling `addOverviewPanel` / `createKanbanBoard`. The Sidebar repo
   menu now renders `<ViewsMenu>` (its inline `menuMode:"files"` branch, `filePickKind`/`fileList`
   state, and `viewTypes` removed — one source of truth).
2. [x] **Clickable badge** (`components/WorktreeViewsBadge/`): the badge is now a button + popover
   (`role="menu"`, `aria-haspopup`/`aria-expanded`, ChevronDown caret, hover/focus cue) hosting
   `<ViewsMenu repoPath={session.repoPath}>`. `onPointerDown` stop-propagation so opening it never
   starts a Canvas move-leaf / Overview card drag (mirrors `FileSwitcher`). Rendered in both
   `CanvasSurface` and the Overview `SessionCard`.
3. [x] **Popover behavior:** dismisses on outside-click + Escape.
4. [x] **Worktree-keyed panel grouping:** Sidebar — extracted `renderPanelRows(repoKey)` called inside
   each worktree sub-group so worktree panels render under that worktree. Overview — map each panel key
   through `clusterRepoOf` (worktree path → parent via `worktreeParent`) so worktree panels cluster
   under the **parent** repo (no stray group) while each `ExtraPanel` renders/removes against its own
   `repoKey` (the `ColumnItem` panel variant now carries `repoKey`).
5. [x] **Selection/jump:** inherited — rows register like any `overviewPanels` item and `selectItem`
   carries the worktree `repoKey`.
6. [x] **Verify:** `npm run build`, `npm run lint`, `npm run format:check`, `npm test` (212) pass.

**Acceptance criteria**

- [x] The per-agent "worktree" badge (Canvas panel header **and** Overview agent card header) is a
      clickable button that opens a popover; clicking it never starts a drag.
- [x] The popover offers the full addable-view set (diff / file via picker / terminal / kanban) scoped
      to the agent's worktree folder.
- [x] Selecting an action opens that view against the worktree path; it appears as a left-panel row +
      an Overview column **associated with the worktree**.
- [x] The #82 repo Views menu and the badge popover share one implementation (no duplicated action set).
- [x] Popover dismisses on outside-click / Escape.
- [x] `npm run build`, `npm run lint`, `npm test` pass.

**Implementation report** (commit `ab285ee`, 2026-06-24)

Shipped in three parts: a shared `ViewsMenu` (now the single source of truth for the addable-view set,
reused by the Sidebar repo menu and the badge), the clickable `WorktreeViewsBadge` popover (both Canvas
+ Overview headers), and worktree-keyed panel grouping so opened views land under the worktree (sidebar
sub-group) / its parent cluster (Overview) rather than a stray group.

**Key files touched:** `src/components/ViewsMenu/*` (new shared menu), `src/components/
WorktreeViewsBadge/*` (new badge popover), `src/components/Canvas/CanvasSurface.tsx` +
`src/components/Overview/Overview.tsx` (render the badge + `clusterRepoOf` grouping),
`src/components/Sidebar/Sidebar.tsx` (use `ViewsMenu`, `renderPanelRows(repoKey)`).

**Notes**

- **Deliberate refinement (recorded):** the Sidebar repo menu's File/Kanban picker now renders **inline
  within the Views section** (surrounding New session / Reveal / destructive items stay visible) rather
  than replacing the whole menu — a consequence of making `ViewsMenu` self-contained for reuse.
  Functionally identical; the action set is now shared.
- The sibling **"Worktree context menu"** (#166) and the **"Open view" button on normal agents** (#165)
  reuse this `ViewsMenu` — hence both `Depend on: #164`.

---

### 165. [x] "Open view" button on normal (non-worktree) agents — scoped to the agent's folder

**Status:** Done
**Depends on:** #164 _(reuses the shared `ViewsMenu` + the agent-header views-affordance pattern that
#164 extracted)._
**Created:** 2026-06-24

**Description**

#164 made the **worktree** badge clickable → a menu that opens views (diff / file / terminal / kanban)
scoped to that worktree. This card adds the **same affordance to normal agents**: "normal agents
should have a similar button. A button to create any kind of panel inside their current directory… for
a 'normal' branch or folder/repo this option shows items to create for the folder. While the worktree
button shows items to create for that specific worktree." A worktree agent already gets this via its
clickable badge (#164); a normal agent has no badge, so it needs a dedicated header **button**. Both
open the *same* `ViewsMenu`; the only difference is the scope path — the agent's `repoPath` (its
repo/folder for a normal agent, the worktree for a worktree agent).

**Subtasks**

1. [x] Reused the shared `ViewsMenu` from #164 (no new action set); extracted a shared **`ViewsPopover`**
   so the open/dismiss + drag-safety wrapper is shared too.
2. [x] Added an **`OpenViewButton`** (Lucide `PanelsTopLeft`, `aria-haspopup="menu"`/`aria-expanded`,
   "Open a view in this folder") to the agent header action groups — `CanvasSurface` `panelActions` and
   Overview `SessionCard` `actions` — **gated on `content.kind === "agent" && !session.worktreeParent`**.
3. [x] Clicking toggles the `ViewsPopover` scoped to `session.repoPath`; dismiss on outside-click +
   Escape; `onPointerDown` stop-propagation so the click never starts a Canvas move-leaf / Overview card
   drag (doubly ensured — the action group + ViewsPopover both stop pointerdown).
4. [x] Each action calls `addOverviewPanel(session.repoPath, …)`; **no special grouping** (a normal
   agent's `repoPath` is its repo, so the view groups in that repo's cluster via existing
   `overviewPanels` rendering).
5. [x] **Verify:** `npm run build`, `npm run lint`, `npm run format:check`, `npm test` (212) pass.

**Acceptance criteria**

- [x] Normal (non-worktree) agents show an "open view" button in their Canvas panel header **and**
      Overview card header.
- [x] Clicking opens the shared `ViewsMenu` (same menu as #164's badge and the #82 repo menu) scoped to
      the agent's folder/repo.
- [x] Selecting an action opens that view in the agent's folder, appearing as a left-panel row +
      Overview column in the repo's cluster.
- [x] Worktree agents are unaffected — no duplicate button (they use the #164 badge).
- [x] The button click never starts a drag; the popover dismisses on outside-click / Escape.
- [x] `npm run build`, `npm run lint`, `npm test` pass.

**Implementation report** (commit `5316d91`, 2026-06-24)

Extracted a shared **`ViewsPopover`** (`components/ViewsMenu/ViewsPopover.tsx`) from #164's
`WorktreeViewsBadge` — the open/dismiss (outside-click + Escape) + `pointerdown` stop-propagation +
popover surface hosting `ViewsMenu`, with an `align` prop ("left" for the badge, "right" for a header
button) to keep it on-screen; `WorktreeViewsBadge` was refactored onto it (#164 behavior preserved).
The new **`OpenViewButton`** wraps `ViewsPopover` scoped to the agent's `repoPath`, wired into both
agent header action groups gated on `!session.worktreeParent`.

**Key files touched:** `src/components/ViewsMenu/ViewsPopover.tsx` (+`.module.css`, new shared
popover), `src/components/OpenViewButton/OpenViewButton.tsx` (new), `src/components/WorktreeViewsBadge/*`
(refactored onto `ViewsPopover`), `src/components/Canvas/CanvasSurface.tsx` + `src/components/Overview/
Overview.tsx` (render the button, gated).

**Notes**

- **Design split (deliberate):** worktree agents get the affordance via the clickable **badge** (#164),
  normal agents via a header **button** (this task) — both open the same `ViewsMenu` scoped to
  `repoPath`, so the only difference is the path (the "folder vs that specific worktree" distinction the
  card calls out). A uniform button on all agents was considered and rejected to avoid two affordances
  doing the same thing on worktree agents.

---

### 166. [x] Worktree context menu: new session, open views, and close worktree

**Status:** Done
**Depends on:** #164 _(reuses the shared `ViewsMenu` for the open-view items; built on existing store
actions otherwise)._
**Created:** 2026-06-24

**Description**

The worktree sub-group header in the left panel (#74) had a right-click context menu (#133) offering
only **Reveal in Finder** and **Copy absolute path**. The card: "should include options to start
anything within this worktree, from new sessions, to files. Also option to close the worktree
entirely, killing its contents." Goal: make the worktree header a full action hub — start a new agent
in the worktree, open views (file/diff/terminal/kanban) scoped to it, and tear the whole worktree
down — instead of just the two non-destructive items. Reuse-over-rebuild: every action already
existed (`spawnWorktreeSession` create-or-reuse, `addOverviewPanel` via #164's `ViewsMenu`,
`killAllAgents`+`closeAllItems` #91 teardown with #74 ref-counted worktree cleanup); the task wires
them into the header menu.

**Subtasks**

1. [x] **Threaded the parent repo into `WorktreeHeader`:** new props `parent`
   (= `wtAgents[0]?.worktreeParent`) and `agentCount` from the render site; "New session" is
   `aria-disabled` when no parent is resolvable.
2. [x] **Expanded the menu** (replacing the 2-item `RowContextMenu`, mirroring the repo menu, scoped to
   the worktree `path`): **New session** → `spawnWorktreeSession(parent, branch)` (create-or-reuse →
   joins the existing worktree, ref-count++, nests under the same header); **Views** → the shared #164
   `ViewsMenu repoPath={path}` (file/diff/terminal/kanban); **Reveal in Finder** / **Copy absolute
   path** unchanged; **Close worktree** (danger) → `killAllAgents(path)` + `closeAllItems(path)`.
3. [x] **Opened-view placement:** inherited from #164's grouping — views register under
   `overviewPanels[path]` and render under the worktree sub-group (left panel) + parent cluster
   (Overview), no new wiring.
4. [x] **Confirm-gating:** "Close worktree" honors `confirmDestructive` (#103) via a local `confirming`
   step ("Kill N agents & close worktree?" / "Close worktree & remove its items?"); immediate when off.
5. [x] **Verify:** `npm run build`, `npm run lint`, `npm run format:check`, `npm test` (212) pass.

**Acceptance criteria**

- [x] The worktree header menu includes New session, open-view actions (file/diff/terminal/kanban
      scoped to the worktree), Reveal in Finder, Copy absolute path, and Close worktree (destructive).
- [x] New session adds an agent to the **existing** worktree (nested, ref-counted) — not a second
      worktree.
- [x] Open-view actions create views scoped to the worktree, appearing in the left panel + Overview
      associated with it.
- [x] Close worktree kills the worktree's agents (ref-counted `git worktree remove`, dirty kept) and
      closes its items; confirm-gated per `confirmDestructive`.
- [x] Reveal in Finder / Copy absolute path still work.
- [x] `npm run build`, `npm run lint`, `npm test` pass.

**Implementation report** (commit `1e34889`, 2026-06-24)

Wired existing actions into a full `WorktreeHeader` right-click menu (`Sidebar.tsx`) mirroring the repo
menu structure, all scoped to the worktree `path`. The only genuinely new bit was threading the
`parent` repo (+ `agentCount`) into `WorktreeHeader`; Close worktree reuses the #91 teardown
(`killAllAgents` ref-counted `git worktree remove`, dirty kept #74) + `closeAllItems`, confirm-gated
like the repo Kill-all/Forget flow. The menu reuses the Sidebar's existing `.menu`/`.menuItem`/
`.menuSection`/`.menuItemDanger` classes; `RowContextMenu` stays for the other rows.

**Key files touched:** `src/components/Sidebar/Sidebar.tsx` (only) — `WorktreeHeader` menu + the
render-site prop threading.

**Notes**

- **Reuse over rebuild:** New session (`spawnWorktreeSession` create-or-reuse), Views (#164 `ViewsMenu`),
  and Close (`killAllAgents`+`closeAllItems`) are all shipped, tested store paths.
- **Close-worktree scope:** `killAllAgents(path)` matches `repoPath === path` (the worktree's own
  agents); a worktree has no nested worktrees, so it cleanly targets just this worktree, and ref-counted
  cleanup removes it when its last agent goes (a dirty worktree is intentionally kept, #74).
- **No branch step for New session:** a worktree is tied to one branch, so it adds another agent on that
  same worktree/branch.
- Completes the worktree-affordance family (#164 badge / #165 normal-agent button / #166 this menu), all
  reusing the shared `ViewsMenu`.

---

### 167. [x] File tree viewer — a collapsible repo file tree as a first-class view type

**Status:** Done
**Depends on:** none · _(reuses the already-shipped flat `list_files`; the only other open item at
authoring time was the "left panel collapse" Refine card, which produces nothing this needs.)_
**Created:** 2026-06-25

**Description**

Added a **File tree viewer**: a new first-class, **repo-scoped** content kind `"filetree"` that shows a
collapsible tree of a repo's files. Folders expand/collapse on click; clicking a file opens it in the
file viewer; right-clicking a file offers **Open in file viewer** / **Open as Kanban board** (`.md`
only) / **Reveal in Finder** / **Copy path** (folders have no menu). Like the **diff** panel it
mirrors, it is opened from the repo right-click **Views** menu (and the #164 worktree-badge popover),
deduped one-per-repo, and rendered identically in all three view surfaces — a **sidebar row**, an
**Overview column**, and a **Canvas panel** — plus a Canvas-template **"Open file tree"** block.

The tree is built **client-side** from the existing flat, sorted, filtered `list_files(repo)` (hidden/
heavy/binary excluded, capped 500 files / depth 8) — **no backend change**. The accepted consequence:
empty folders, binary-only folders, hidden dirs, and anything past the cap don't appear (matching the
existing `FilePicker`).

**What shipped** (commit `6a5d46d`, 2026-06-25)

- **New content kind `"filetree"`** threaded through `OverviewPanel["kind"]` (`src/types/index.ts`),
  `SidebarItem["kind"]` (`src/store.ts`), the panel↔content mapping (`canvasDrop.ts`), and the
  template-block registry.
- **Pure tree builder + tests:** `src/components/FileTree/buildFileTree.ts` (`buildFileTree(paths) →
  FileTreeNode[]`, folders-before-files, each alphabetical) with `buildFileTree.test.ts` (nesting,
  mixed levels, ordering, deep paths, empty list).
- **`FileTree` component** (`FileTree.tsx` + `.module.css`): loads `listFiles(repoPath)` on mount,
  Loading/empty states, recursive chevron+folder / file-leaf rendering with local expanded-set state,
  click-to-open via `addOverviewPanel`, an inline cursor-positioned right-click context menu, and an
  optional manual **refresh** button.
- **Wiring** mirroring the diff panel everywhere: `ItemContent` render branch, `canvasDrop`
  (`overviewPanelToContent` / `payloadToContent` / `sameItem` dedupe by `repoPath`) + tests, store
  (`panelLabel`, `addOverviewPanel` one-per-repo dedupe, `matchesCanvasItem`, `resolveTemplateBlock`),
  the `ViewsMenu` entry (`FolderTree` icon), a `FileTreeRow` draggable sidebar row + `renderPanelRows`
  branch, the Overview `panelLabel`, and the `templateBlocks` `"open-filetree"` block + test.

**Key files touched:** `src/components/FileTree/` (new: `FileTree.tsx`, `FileTree.module.css`,
`buildFileTree.ts`, `buildFileTree.test.ts`), `src/components/Canvas/canvasDrop.ts` (+`.test.ts`),
`src/components/Canvas/templateBlocks.ts` (+`.test.ts`), `src/components/ItemContent/ItemContent.tsx`,
`src/components/Overview/Overview.tsx`, `src/components/Sidebar/Sidebar.tsx`,
`src/components/ViewsMenu/ViewsMenu.tsx`, `src/store.ts`, `src/types/index.ts`. **No backend change.**

**Notes / deviations from the plan**

- The pure helper was named **`buildFileTree.ts`** (not the planned `fileTree.ts`) — `fileTree.ts` vs
  the component `FileTree.tsx` differ only in case and collide on macOS's case-insensitive filesystem
  (TS `TS1261`/`TS1192`). Export surface (`buildFileTree` + `FileTreeNode`) and behavior unchanged.
- The `FileTree` component **reimplements** the small cursor-positioned context menu inline (local
  `menu-in` keyframe, since CSS Modules scope `@keyframes`) rather than lifting `RowContextMenu` out of
  `Sidebar.tsx`.
- The plan's `canvasDrop.ts` "content→label helper" sub-bullet was a **no-op** — diff/filetree carry no
  `label` in the current file; filetree matches diff everywhere (dedupe by `repoPath`).
- All green: `npm run build`, `npm test` (220), `npm run lint`, `npm run format:check`, `cargo test`
  (72).

---

### 168. [x] Collapsible left panel — minimize the sidebar to an icon rail

**Status:** Done
**Depends on:** none · _(edits the existing `Sidebar` + adds a thin persisted flag; nothing it needs
is produced by another open task. The #113→#115 collapsible-repo-folders history is a different,
reverted feature and is unaffected.)_
**Created:** 2026-06-25

**Description**

Made the left **Sidebar** collapsible to a narrow (~56px) icon **rail**. A footer **chevron** button
and **⌘B** (main window only) toggle between the full panel and the rail, and the collapsed/expanded
state **persists across restarts**. Collapsed, the rail shows only icons — a New-session `+`, a
Schedule clock, a compact Overview/Canvas switch, then per repo a repo-colored **folder icon** with
that repo's **per-session activity dots** (`BusyIndicator`s, blue shimmer while busy / yellow when
settled / gray when fresh, each tooltipped with the session name) stacked beneath it, each worktree as
its own **branch glyph** (with its dots) under the parent, and a footer with the **Settings** gear plus
the expand chevron. No text labels, item/schedule/session rows, flyouts, or click-to-select on the dots
(the activity dots are indicators only — to reach an individual session/item the user **expands** the
sidebar, a deliberate "expand to navigate" choice). **Context menus keep working while collapsed:**
right-clicking a folder icon opens the repo menu, right-clicking a worktree icon the worktree menu;
left-clicking a folder icon filters Overview to that repo. While collapsed the #108 resize handle is
hidden and the width is fixed; expanding restores the previously-persisted width.

**What shipped** (commit `cd7b8c3`, 2026-06-25)

- **Persisted `sidebar_collapsed` bool**, plumbed end-to-end mirroring #108's `sidebar_width` and kept
  **separate from the Settings blob** (so a Settings-modal draft can never clobber the live toggle):
  `store.rs` field + `sidebar_collapsed()` / `set_sidebar_collapsed()`, `commands.rs`
  `get_sidebar_collapsed` / `set_sidebar_collapsed`, `lib.rs` `invoke_handler` registration, `ipc.ts`
  `getSidebarCollapsed` / `setSidebarCollapsed`, and `store.ts` state + `setSidebarCollapsed` /
  `toggleSidebarCollapsed` + boot `Promise.all` load (`Option` + serde-default so an older
  `sessions.json` upgrades cleanly as expanded).
- **`ViewSwitch` compact mode** — an optional `compact` prop renders the two options icon-only
  (`LayoutGrid` Overview / `PanelsTopLeft` Canvas) for the rail, default labelled rendering unchanged.
- **`WorktreeHeader` compact mode** — an optional `compact` prop renders just the `GitBranch` glyph
  (no name/badge), the entire right-click menu intact.
- **Collapsed rail rendering** in `Sidebar.tsx` + `Sidebar.module.css`: the New/Schedule/compact-
  ViewSwitch icons, per-repo folder-icon buttons (left-click filters Overview, right-click opens the
  repo menu) with per-session `BusyIndicator` dots, and per-worktree branch icons with their dots,
  reusing the existing `repos` / `repoSessions` / `worktreePaths` / `wtAgents` / `sessionBusy` /
  `sessionActive` data. The repo context-menu open handler was extracted to a shared
  `openRepoMenu(repo, event)` used by both the expanded header and the rail folder icon. A `.collapsed`
  modifier hides the resize handle, fixes width to `SIDEBAR_RAIL_WIDTH` (56px), centers the icon
  column, and vertically stacks the footer.
- **⌘B shortcut** in `useKeyboardNav.ts` (capture-phase, `IS_MAIN_WINDOW`-guarded — inert in a detached
  CanvasWindow, matching the ⌘N / ⌘⇧N pattern).
- **Tests:** a `store.test.ts` case for `toggleSidebarCollapsed` (default false → toggles → persists via
  `ipc.setSidebarCollapsed`) and primed `getSidebarCollapsed` in `store.refresh.test.ts`'s ipc mock.

**Key files touched:** `src-tauri/src/store.rs`, `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`,
`src/ipc.ts`, `src/store.ts`, `src/useKeyboardNav.ts`, `src/components/Sidebar/Sidebar.tsx`
(+`.module.css`), `src/components/ViewSwitch/ViewSwitch.tsx` (+`.module.css`), `src/store.test.ts`,
`src/store.refresh.test.ts`.

**Notes**

- The persistence deliberately mirrors #108 (`sidebar_width`) end-to-end, swapping `u32`→`bool` — no
  clamping or debounce (toggling is rare).
- All green: `npm run build`, `npm run lint`, `npm test` (221), `npm run format:check`, `cargo test`,
  `npm run lint:rust`, `cargo fmt --check`.

---

### 169. [x] Refresh auto-generated session names promptly — no click required

**Status:** Done
**Depends on:** none · _(fixes shipped #97 code; every symbol it touches already exists. The other open
cards at authoring time — #167 file tree, #168 collapsible sidebar — are unrelated.)_
**Created:** 2026-06-25

**Description**

Fixed a cadence bug in the #97 auto-naming pipeline: a new agent's `claude`-generated session title did
**not** appear in the sidebar (or Overview/Canvas) until the user **clicked** the session. Root cause —
`claude` writes its `ai-title` **asynchronously**, a moment *after* a turn finishes, so the single title
read fired at the busy→idle edge (the title worker's only trigger) usually ran before the title was
written and emitted nothing, with no further re-read until the next edge. Clicking only helped
incidentally (the repaint/resize produced output → a fresh busy→idle edge → a re-read that finally found
the title). The frontend render path was already correct (`setAutoName` swaps the store `sessions` array,
`SessionRow` isn't memoized), so this was purely a **backend cadence problem**.

**The fix** (backend-only, all in `src-tauri/src/pty.rs`): instead of one read per edge, each **poke**
now schedules a **bounded burst** of re-reads over a ~30s window, so a late-written title surfaces within
seconds with no interaction. A **spawn-time poke** was also added so a brand-new agent — and a
resumed/forked session on boot — kicks off the burst immediately rather than waiting for its first
incidental edge. No filesystem watcher and no always-on global poll (the lightweight delayed-re-read
approach the user chose); existing per-session dedup and `forkable` (#138) emission preserved.

**What shipped** (commit `8c1e115`, 2026-06-25)

- Tunable burst schedule constant `TITLE_REREAD_OFFSETS_MS = [0, 1_500, 4_000, 8_000, 15_000, 30_000]`
  (~30s window; extending the last value lengthens it).
- `SessionManager` gained a `title_tx: Mutex<Sender<String>>` field — a **clone** of the poke channel
  taken before the original moves into `monitor_loop` — and `spawn_with_id` now pokes the title worker
  right after registering a session (best-effort; covers new / resume / fork / boot).
- `title_worker` was rewritten from a blocking `recv()` into a `recv_timeout`-driven, **schedule-aware**
  loop holding a `pending: Vec<(Instant, String)>` of re-read deadlines: a poke **replaces** that
  session's still-pending burst and re-enqueues all offsets from now; each pass processes (and drops)
  every due deadline (deduping ids per pass); with nothing pending it blocks on `recv()` (no busy-wait);
  a dropped sender returns cleanly at shutdown.
- The read-and-emit body was extracted to `read_and_emit_title` (identical #97/#138 dedup), and a pure
  `next_due_wait` helper (unit-tested via `next_due_wait_picks_the_soonest_deadline`) was added.

**Key files touched:** `src-tauri/src/pty.rs` only — **no** frontend, `title.rs`, `lib.rs`, `ipc.ts`, or
`store.ts` changes (the `session://name` event shape, persistence, and routing are unchanged).

**Notes**

- Accepted tradeoff: up to ~6 log-file scans per turn per session (vs. 1 before), all off the monitor's
  hot path and bounded to the burst window.
- All green: `cargo test` (73), clippy, `cargo fmt`; `npm run build` / `npm run lint` / `npm test` (221)
  / `npm run format:check`. **Caveat:** the few-seconds live visual refresh (subtask 5) was **not**
  runtime-verified in the autonomous loop — the cadence logic is unit-tested and reviewed against the
  read/emit path, but not observed in a running `tauri dev` session.

---

### 170. [x] Stop macOS auto-capitalizing (and auto-correcting) every text input

**Status:** Done
**Depends on:** none · _(edits existing text fields; nothing it needs comes from another task. #167
adds no text input, #168 only icon buttons, #169 is backend-only — the Subtask-4 re-grep confirmed
none added a new field.)_
**Created:** 2026-06-25

**Description**

Stopped macOS from auto-capitalizing the first letter of (and auto-correcting) typed text across the
app's WKWebView text fields — the behavior that turned `fix-foo` into `Fix-foo` in the new-branch-name
box and mangled identifiers, file paths, and `/`-prefixed `claude` prompts. For a developer tool where
capitalization is rarely wanted, the fields should **keep whatever was typed**. The user's decision was
to apply this **app-wide to all text fields**, not just identifier/search inputs.

**The fix** (frontend-only): a new shared constant spread into every text `<input>`/`<textarea>`. On
macOS WebKit the dependable lever is `autoCorrect="off"` **together with** `autoCapitalize="none"` —
the first-letter capitalization rides the auto-correct/substitution layer — so both attributes are set.
**Spell-check is intentionally left untouched** (red squiggles don't alter typed text), so the two
existing `spellCheck={false}` fields keep it and no other field gains/loses spell-check. Non-text inputs
(color / checkbox / range / datetime-local) were excluded.

**What shipped** (commit `56592c2`, 2026-06-25)

- New module `src/inputProps.ts` exporting
  `noAutoCapitalize = { autoCapitalize: "none", autoCorrect: "off" } as const`.
- Spread into all **19** text fields across **10** components: Sidebar session rename; FileViewer
  editor textarea (kept `spellCheck={false}`); CanvasTabs tab rename; ScheduledPanel name;
  SkillAutocomplete prompt textarea (covers **both** prompt sites — ScheduledPanel + NewSessionModal);
  NewSessionModal folder search / branch filter / new-branch name / schedule name; KanbanPanel card
  title / card body / column name / raw markdown (kept `spellCheck={false}`); TemplateManager rename;
  FilePicker search; TemplateEditor agent name / initial prompt / file path / template name.
- A Subtask-4 re-grep confirmed #167/#168/#169 (which landed first) added no new text field.

**Key files touched:** `src/inputProps.ts` (new), and the spread + import in
`src/components/{Sidebar/Sidebar, FileViewer/FileViewer, Canvas/CanvasTabs, ScheduledPanel/ScheduledPanel,
SkillAutocomplete/SkillAutocomplete, NewSessionModal/NewSessionModal, Kanban/KanbanPanel,
TemplateManager/TemplateManager, FilePicker/FilePicker, TemplateEditor/TemplateEditor}.tsx`. No backend,
store, IPC, or CSS change.

**Notes**

- All green: `npm run build`, `npm run lint`, `npm test` (221), `npm run format:check` (no Rust change).
  **Caveat:** the macOS WKWebView first-letter behavior is a native text-substitution effect, so the
  live "lowercase stays lowercase" confirmation (Subtask 5 / first acceptance bullet) was **not**
  runtime-verified in a `tauri dev` macOS session in the autonomous loop — the paired attributes are
  the documented, dependable lever.

---

### 171. [x] Copy path / Reveal in Finder on sidebar file & Kanban rows

**Status:** Done
**Depends on:** none · _(edits existing sidebar rows + adds a self-contained backend command; nothing
it needs comes from another task. #167 builds its own file context menu, #168 only hides these rows in
the rail, #169/#170 are unrelated.)_
**Created:** 2026-06-25

**Description**

Enriched the right-click context menu on the left-panel **file-viewer** and **Kanban-board** rows,
which previously offered only a single red **Remove** (`RowContextMenu`, #132). They now also offer
**Reveal in Finder**, **Copy absolute path**, and **Copy relative path** — the same utilities the repo
menu (#130) and worktree header (#133) give folders. Only these two row types are real single files on
disk (`repoPath` root + repo-relative `file`); Diff / Terminal / Schedule rows were deliberately
excluded (not single files).

**Reveal differs from folders.** The existing `reveal_path` command runs plain `open <path>` (correct
for a folder, but for a file would launch it in its default app), so a **separate**
`reveal_file_in_finder` command runs `open -R <path>` to **select** the file in Finder — the user's
explicit choice. Absolute path = the root joined to the relative `file` (trailing slash trimmed → no
double slash); relative path = `file` verbatim (per #163, relative to a Browse'd file's own parent dir
for out-of-repo files — the intended meaning in both cases).

**What shipped** (commit `85293fe`, 2026-06-25)

- **Backend:** new `reveal_file_in_finder(path)` command (`Command::new("open").arg("-R").arg(path)`,
  no shell — mirroring the `reveal_path` / `open_url` safety precedent), registered in `lib.rs`'s
  `invoke_handler!` right after `reveal_path` (which stays `open`-only and untouched).
- **IPC:** `revealFileInFinder` wrapper in `ipc.ts`.
- **Frontend:** a shared `filePathMenuItems(repoPath, file, copyToClipboard, onRemove)` helper in
  `Sidebar.tsx` (plus a `rowAbsPath` that trims trailing slashes on the root) returning Reveal in
  Finder / Copy absolute path / Copy relative path / red Remove, wired into **both** `FileRow` and
  `KanbanRow` (each now pulls `copyToClipboard` from the store, reusing the existing "Copied path"
  toast). No capabilities edit needed.

**Key files touched:** `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`, `src/ipc.ts`,
`src/components/Sidebar/Sidebar.tsx`.

**Notes**

- All green: `npm run build`, `npm run lint`, `npm test` (221), `npm run format:check`; `cargo test`
  (73), clippy, `cargo fmt`. **Caveat:** the live `open -R` Finder-selection behavior was **not**
  runtime-verified in a `tauri dev` macOS session in the autonomous loop — the command mirrors the
  proven `reveal_path` pattern with the documented `-R` flag.

---

### 172. [x] Empty-area (background) context menu for the left sidebar — add folder without an agent

**Status:** Done
**Depends on:** #168 _(the menu must also open from the collapsed icon rail, so the #168 rail render had
to exist to wire the handler onto it)_
**Created:** 2026-06-25

**Description**

Added a **background context menu** to the left sidebar. Previously only items (agent/file/diff/
terminal/kanban/scheduled rows, worktree headers, repo headers) had right-click menus — right-clicking
the **empty space** below the repo list (or the whole panel when no repos exist) did nothing. The new
non-repo-scoped menu offers, in order: **New folder…**, **New session**, **Schedule session**,
**Collapse/Expand sidebar** (label reflects `sidebarCollapsed`), and **Clear Overview filter** (shown
only when `overviewRepoFilter` is active). The user explicitly excluded Settings / Open-data-folder
entries.

Its headline capability is **New folder…**: open the native directory picker and add the chosen
**existing** folder to the persisted `recents` — so it appears as a (greyed, agent-less, coral-`+`)
folder group immediately and survives restart, **without** spawning an agent, changing the selection,
or switching the view (a folder already listed just moves to the top; cancel is a no-op). This does
**not** create a directory on disk. Closing a backend gap: `Store::touch_recent` existed but had no
standalone Tauri command (only spawn/schedule called it internally), so an `add_recent` command was
added.

**What shipped** (commit `ebb6d68`, 2026-06-25)

- **Backend:** `add_recent(path)` command reusing `Store::touch_recent` (deduped/capped/persisted),
  registered in `lib.rs`'s `invoke_handler`.
- **IPC + store:** `addRecent` wrapper; an `addFolder()` store action — `pickDirectory()` → `addRecent`
  → move-to-top `recents` dedupe (no toast, no select, no view switch).
- **Sidebar:** a second `useRowMenu()` instance (`bgMenu`) rendered via the shared `RowContextMenu`,
  with a `bgMenuItems` array built conditionally. A guarded `openBgMenu`
  (`event.target === event.currentTarget`) is wired onto the expanded `.repos` container **and** the
  collapsed-rail `.rail`/`.railRepos` containers, plus a direct handler on the zero-repo `emptyHint` so
  a folder-less sidebar is still right-clickable. The self-guard means repo-header / item-row
  right-clicks still open only their own menus (bubbled events are rejected).

**Key files touched:** `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`, `src/ipc.ts`,
`src/store.ts`, `src/components/Sidebar/Sidebar.tsx`.

**Notes**

- "New folder…" keeps the user's wording but *adds an existing* folder (the native picker title
  "Choose a working directory" makes that clear) — it never creates a directory.
- All green: `npm run build`, `npm run lint`, `npm test` (221), `npm run format:check`; `cargo test`
  (73), clippy, `cargo fmt`. **Caveat:** the live picker/Finder flow was **not** runtime-verified in the
  autonomous loop — it reuses the proven `pickDirectory` + `touch_recent` paths.

---

### 173. [x] Clickable task-list checkboxes in rendered markdown (FileViewer + Kanban card bodies)

**Status:** Done
**Depends on:** none _(independent — builds only on already-shipped code)_
**Created:** 2026-06-25

**Description**

**Reverses the #52 "task-list checkboxes are never editable" rule** for two render sites: rendered
markdown in the universal **FileViewer** and **Kanban card bodies**. GFM task items (`- [ ]` / `- [x]`)
previously rendered as `disabled` read-only checkboxes; now clicking one flips the underlying source
marker `- [ ]` ⇄ `- [x]` and persists via each site's existing **`useAutoSaveFile`** buffer — so the
#162 **save mode** applies for free (auto: debounced write; manual: marks dirty, writes on ⌘S/Save,
flushed on close). Only the checkbox character is mutable; no other in-place editing of rendered
markdown. Large files (`tooLarge`) stay raw read-only, and the Kanban card's own header done-checkbox
(already interactive) is untouched.

**The mapping problem.** remark-gfm's synthesized checkbox `<input>` hast node has **no `position`**,
but its nearest ancestor **`li`** does. So a small rehype plugin stamps each checkbox input with its
nearest `li`'s source offsets; the `input` component override reads those offsets and a pure helper
flips the first marker inside that source slice. Offsets are relative to the exact string handed to each
`<ReactMarkdown>` (the whole `text` for FileViewer, the de-indented `card.body` for a Kanban card), so
the flip writes back directly. This is deliberately position-based, not a line-regex index, so a
`[ ]`-looking string inside a fenced code block (never a task item) is never treated as a checkbox.

**What shipped** (commit `a04448a`, 2026-06-26)

- **Shared module `src/components/markdownCheckboxes.tsx`:** `rehypeTaskListPositions` (stamps offsets
  via `visitParents`), `toggleTaskMarker(source, start, end)` (pure marker flip → new source or null),
  and `makeCheckboxComponents({ source, interactive, onToggle })` (the react-markdown `input` override —
  a native enabled checkbox when interactive + valid offsets, else the default disabled one).
- **FileViewer:** rendered markdown wired interactive (`onToggle: setText`); the toolbar save/status
  block is now gated by a new `writable = !tooLarge && (markdown || text)` so rendered markdown shows
  the Save button (manual) / Saving…/Saved (auto), consistent with the raw view.
- **KanbanPanel:** `SortableCard` body wired via a new `onBodyToggle`/`onCardBodyToggle` prop chain →
  `mutate(updateCard(board, col, idx, { body }))`; `CardPreview` (drag overlay) stays non-interactive
  (default disabled boxes by omission).
- Added **`unist-util-visit-parents@^6.0.2`** as a direct dependency (previously only transitive);
  pointer-cursor + app-`Checkbox`-matched styling for `.markdown` and `.cardBody` checkboxes.
- **Tests:** `markdownCheckboxes.test.ts` covers `toggleTaskMarker` (all listed cases: `[ ]`↔`[x]`,
  `[X]`, ordered-list markers, nested items, trailing links, non-task → null) and
  `rehypeTaskListPositions` against a hand-built hast tree.

**Key files touched:** `src/components/markdownCheckboxes.tsx` (+`.test.ts`, new),
`src/components/FileViewer/FileViewer.tsx` (+`.module.css`),
`src/components/Kanban/KanbanPanel.tsx` (+`.module.css`), `package.json`, `package-lock.json`.

**Notes**

- The checked marker char is lowercase `x` (matches existing serialization); no other source
  normalization.
- All green: `npm run build`, `npm run lint`, `npm test`. **Caveat:** no DOM/render test was added — the
  repo's Vitest env is node-only (no jsdom), so a render test would mean pulling in a DOM stack out of
  proportion to the task; the pure logic is unit-tested but the live click behavior was not
  automatically verified.

---

### 174. [x] Shift+arrow Overview navigation selects every panel kind, not just agents

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

Fixed Overview keyboard navigation so **Shift+←/→** reaches **every** column kind, not just agent
terminals. Previously the Overview branch of `useKeyboardNav.ts` called `adjacentSessionId`, which
iterates `state.sessions` only — so the cursor silently skipped file viewers, diff panels, shell
terminals, kanban boards, file-tree panels (#167), and pending scheduled-session cards. Each column kind
already supported being `selected` (highlight frame + scroll-into-view keyed off `selectedId`), so the
only missing piece was the keyboard nav reaching those ids.

This was a **refactor, not a one-liner**: the wall's left-to-right column order is computed inside
`Overview.tsx` (group by `effectiveRepo`, attribute worktree panels to the parent cluster, add pending
schedules, sort repos by `repoName`, order each repo by the persisted `overviewOrder` merged with the
live default, drop empty clusters). To keep nav and the rendered wall from drifting, that ordering was
extracted into one **pure, shared, unit-tested** function consumed by both the component and the key
handler. Per the user's decisions: **Overview only** (Canvas's `moveCanvasFocus` already reaches every
leaf kind) and **Left/Right only** (Shift+↑/↓ keep passing through to a focused terminal's scrollback).

**What shipped** (commit `40d6b85`, 2026-06-26)

- **`src/store.ts`:** new pure `overviewClusters(...)` (+ a flat `overviewClusterKeys(...)`) replicating
  the wall's exact grouping/ordering from a narrow serializable input
  (`sessions / overviewPanels / overviewOrder / schedules / filter`), plus a generic
  `adjacentId(ids, selectedId, delta)` flat-list adjacency helper (empty → null; unknown/null selection
  → first id; modulo wrap-around) mirroring `adjacentSessionId`'s semantics.
- **`src/components/Overview/Overview.tsx`:** the `clusters` computation now derives each cluster's keys
  from the shared helper (the component still builds its local `byKey`/`items` for rendering), so the
  rendered order and nav order cannot diverge.
- **`src/useKeyboardNav.ts`:** the Overview Shift+←/→ branch now computes the flat id list via
  `overviewClusterKeys({ …, filter: overviewRepoFilter })` and steps it with `adjacentId` → `select` —
  spanning every column kind, respecting the active repo filter, wrapping at both ends, selecting the
  first column when nothing is selected. Shift+↑/↓ and the Canvas branch are untouched.
- **Tests** (`src/store.test.ts`): `overviewClusters`/`overviewClusterKeys` ordering (two repos
  alphabetical, interleaved kinds per `overviewOrder`, worktree→parent attribution, filter narrowing,
  empty-cluster drop) and `adjacentId` (empty/unknown/wrap-around).

**Key files touched:** `src/store.ts`, `src/components/Overview/Overview.tsx`, `src/useKeyboardNav.ts`,
`src/store.test.ts`. Frontend-only (no Rust change).

**Notes**

- No new selection side effect — "select" keeps its meaning (frame highlight + scroll-into-view + synced
  `selectedId`).
- All green: `npm run build`, `npm run lint`, `npm test`, `npm run format:check`, `cargo test`,
  `npm run lint:rust`. The live `tauri dev` keyboard check relies on the new unit tests of the
  ordering/adjacency plus the already-shipping per-column selection rendering (which works for clicks).

---

### 175. [x] File-tree click: jump to an already-open file (don't double-open) and open in the current view

**Status:** Done
**Depends on:** none _(mirrors the already-shipped #153 `openSessionInCanvas` detached-aware pattern but
doesn't depend on it)_
**Created:** 2026-06-26

**Description**

Made file-tree (#167) clicks **view-aware** and **jump-to-existing** instead of a silent no-op or a
duplicate. Previously `openFile` always called `addOverviewPanel(repoPath, "markdown", file)`, which (a)
on a dedup hit only fired a dead-end "Already open" toast without taking you to the existing panel, and
(b) **always** targeted the Overview panel list even when the tree was rendered inside a **Canvas** panel
— so a click in Canvas appeared to do nothing (the column landed in the unmounted Overview). That
mismatch was the "open double" frustration.

**New behavior:** clicking a file follows the **current view** and jumps to it if already present.
In **Overview** — add a new file column and select it, or on a dedup hit select the existing column
(the `selectedId` → `data-item-id` scroll effect reveals it). In **Canvas** (including a detached window,
`!IS_MAIN_WINDOW`) — focus the file's existing leaf across **all** tabs (switching tab / raising the
detached window), else append it as a panel to the active tab. "Present" is judged **per view**: in
Canvas, an Overview-only file with no canvas leaf counts as not-present and gets appended. Either way the
file is registered in **`overviewPanels`** (the #152 source of truth), so a Canvas-opened file also
appears as a sidebar row + Overview column and its removal cascades.

**What shipped** (commit `0daab92`, 2026-06-26)

- **`addOverviewPanel` now returns an id** (`Promise<string | null>`): the new panel's id on add, the
  existing panel's id on a dedup hit, `null` only on real failure — so a caller can select/focus it.
  Existing `void`-ing callers are unaffected.
- **New store action `openFileFromTree(repoPath, file, kind)`** (`kind: "markdown" | "kanban"`):
  computes `inCanvas = !IS_MAIN_WINDOW || view === "canvas"`; Overview branch adds-or-jumps + selects;
  Canvas branch finds an existing leaf (`collectLeaves` + `matchesCanvasItem`) to focus
  (`focusCanvasWindow` if detached, else switch tab via `setCanvases`), else appends a leaf
  (`setActiveCanvasLayout(appendLeaf(...))`), always toast-lessly registering the source-of-truth panel.
- **`FileTree.tsx`** left-click, "Open in file viewer", and "Open as Kanban board" all route through the
  new action (kanban → `{kind:"kanban"}`, markdown → `{kind:"file"}` content).
- **Six new `store.test.ts` cases:** Overview add-and-select, Overview dedup-no-duplicate, Canvas
  append-and-register, Canvas focus-existing-leaf, Canvas detached-tab `focusCanvasWindow`, and the
  `addOverviewPanel` return-value contract.

**Key files touched:** `src/store.ts`, `src/components/FileTree/FileTree.tsx`, `src/store.test.ts`.
Frontend-only (no backend change — same `overviewPanels` / `canvases` data sources).

**Notes**

- Dedup stays **kind-specific** (a `.md` opened as a Kanban board is a distinct item from the same file
  as a plain viewer). The Overview branch keeps the harmless "Opened…/Already open" toast; the Canvas
  branch registers the panel without a misleading toast.
- All green: `npm run build`, `npm run lint`, `npm test`, `npm run format:check`, `cargo test`,
  `npm run lint:rust`.

---

### 176. [x] Configurable Overview panel minimum width (Settings → Appearance)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

Made the Overview "agent wall" column **minimum width** user-configurable, replacing the hard-coded
`360px` floor in `.card { flex: 1 0 360px }`. The original request ("increase the min width slightly")
was upgraded by the user into a **Settings** preference: the floor is now an adjustable value defaulting
to **400px** (so users who never open Settings still get the slight increase). Columns still
`flex-grow` to fill a wide wall — only the shrink floor / horizontal-scroll threshold is governed.

**Approach — a CSS variable driven by the setting.** The value flows through the existing Settings draft
→ Save → `applySettingsEffects` pipeline (#100/#102/#107): on Save, `applySettingsEffects` imperatively
sets `--overview-card-min` on `:root` (alongside the accent tokens / reduce-motion class), and `.card`
reads `flex: 1 0 var(--overview-card-min, 400px)` — so saving reflows the already-mounted wall live, and
the `400px` CSS fallback covers first paint before JS runs. No backend change: the `settings` blob stays
opaque, and `mergeSettings` back-fills the new key over `DEFAULT_SETTINGS` so an older `sessions.json`
upgrades cleanly to the 400 default.

**What shipped** (commit `edf3dda`, 2026-06-26)

- **Type + default:** `overviewPanelMinWidth: number` added to the `Settings` interface
  (`src/types/index.ts`) with a `400` default in `DEFAULT_SETTINGS` (`src/store.ts`).
- **Apply effect:** `applySettingsEffects` sets `root.style.setProperty("--overview-card-min",
  \`${s.overviewPanelMinWidth}px\`)` inside the DOM-guarded block.
- **CSS:** `Overview.module.css` `.card` now uses `flex: 1 0 var(--overview-card-min, 400px)`.
- **Settings UI:** a `Slider` (range **320–600px, step 20**, default 400) in the **Appearance** section,
  wired to the modal draft like the Terminal font-size/line-height sliders (applies on Save; Cancel /
  Escape / scrim discard).
- **Test:** a `store.test.ts` case confirming `mergeSettings` back-fills `overviewPanelMinWidth === 400`
  for a persisted blob lacking the key.

**Key files touched:** `src/types/index.ts`, `src/store.ts`, `src/components/Overview/Overview.module.css`,
`src/components/Settings/Settings.tsx`, `src/store.test.ts`. Frontend-only (no Rust change).

**Notes**

- Refine-agent defaults (user said "whatever you prefer"): default 400px, Appearance section, Slider
  range 320–600/step 20.
- All green: `npm run build`, `npm run lint`, `npm test`, `npm run format:check`, `cargo test`,
  `npm run lint:rust`.

---

### 177. [x] "Open view in this folder" on every panel + an instant "New session" option

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

Two related additions to the per-folder **"Open view in this folder"** affordance (the #165
`OpenViewButton` → `ViewsPopover`/`ViewsMenu`, scoped to a folder):

**(A) Put the button on non-agent panels.** Previously the button rendered **only on agent surfaces**
(Overview `SessionCard`, Canvas agent panel headers; worktree agents use `WorktreeViewsBadge`).
Non-agent panels (Overview `ExtraPanel`, non-agent Canvas headers) only had Maximize + Close despite
already carrying a `repoPath`. Now every **non-agent folder panel** — file viewer / kanban / diff /
file tree / terminal — shows the button in **both** the Overview column header and the Canvas panel
header, using each panel's own `repoPath`. Pending **scheduled** cards are excluded.

**(B) Add an instant "New session here" to the Views menu.** A new shared-menu item **immediately spawns
an agent on the panel's folder, on its current branch, with no modal** — `store.spawnSession(repoPath)`
(omitting the `branch` arg → current branch, no checkout; works for git and non-git folders; selects the
new agent and toasts "Started …"). This is deliberately distinct from the repo context-menu's modal-based
"New session" (`startRepoSession` #127). Living in the **shared** `ViewsMenu`, it appears **everywhere the
button does** — including agent cards/panels and the worktree badge (which already renders `ViewsMenu`,
so it inherits the item for free).

**What shipped** (commit `60a501f`, 2026-06-26)

- **`ViewsMenu.tsx` (+ `.module.css`):** a "New session here" item (instant `spawnSession(repoPath)` +
  `onClose()`), rendered above a thin separator to set it apart from the five add-view items.
- **`Overview.tsx`:** `ExtraPanel`'s actions gained `<OpenViewButton repoPath={…}>` as the first action
  (before Maximize).
- **`CanvasSurface.tsx`:** a branch renders `OpenViewButton` for non-agent folder content
  (`file | diff | kanban | filetree | terminal`; excluding `agent`/`scheduled`/`pending`) using the
  already-resolved `repoPath`.
- **`OpenViewButton.tsx`:** tooltip/aria broadened to "Open a view or start a session in this folder".

**Key files touched:** `src/components/ViewsMenu/ViewsMenu.tsx` (+`.module.css`),
`src/components/Overview/Overview.tsx`, `src/components/Canvas/CanvasSurface.tsx`,
`src/components/OpenViewButton/OpenViewButton.tsx`. Frontend-only (no Rust change).

**Notes**

- The instant session is unnamed (auto-named like any spawn), doesn't switch the main view (just selects
  the new agent), and needs no destructive-checkout warning (current branch only, no `git checkout`).
- This is the final card of the #168–#177 batch; with it archived the board's DONE column is empty.
- All green: `npm run build`, `npm run lint`, `npm test`, `npm run format:check`, `cargo test`,
  `npm run lint:rust`.

---

### 178. [x] Terminal panel: a little vertical margin so the bottom row isn't cut off

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

`claude`'s last terminal row — typically its prompt / input line — rendered flush against (and
partially clipped by) the panel's bottom edge, reading as half a row of missing text. The fix gives
the terminal balanced vertical breathing room so the final row is always fully visible with a small
margin, top and bottom.

**What shipped** (commit `3162010`, 2026-06-26)

- A **single one-line CSS change** in `src/components/Terminal/Terminal.module.css`: the shared
  `.terminal` rule's padding went from `var(--space-6) var(--space-8)` (6px vertical) to
  `var(--space-12) var(--space-8)` (12px vertical), with horizontal padding unchanged. No
  `--space-10` token exists, so `--space-12` is the nearest balanced choice. An explanatory comment
  was added inline.
- Because `.terminal` is the **one pooled xterm node** the terminal pool reparents between slots
  (`terminalPool.ts`), this single edit fixes **every** context at once — Overview cards (#11),
  Canvas panels (#47), and shell-terminal items (#72) — with no per-context differentiation.
- The fix is **both visual and structural**: FitAddon measures the element's content box, so the
  larger vertical padding reduces the height it sees and makes the terminal claim one fewer row
  whenever the last would otherwise clip — no FitAddon / xterm row-math change needed.

**Key files touched:** `src/components/Terminal/Terminal.module.css` (the only modified source file).
Frontend-only, no Rust change, no `terminalPool.ts` / FitAddon / PTY-sizing change.

**Notes**

- Refine Q&A decisions (2026-06-26): CSS-padding-only approach (explicitly **not** investigating the
  FitAddon row-rounding layer); balanced top + bottom at ~10–12px each.
- `npm run build`, `npm run lint`, and `npm test` (248 tests) pass. **Runtime caveat:** the GUI visual
  tuning steps (running `npm run tauri dev` and eyeballing bottom-row clearance / resize refit across
  the three contexts) were **not** runtime-verified — implemented headlessly with no display. The value
  follows the plan's endorsed default; if the row still clips or the gap looks unbalanced when run
  interactively, the vertical token is a one-line nudge (e.g. up to `--space-16` or down to `--space-8`).

---

### 179. [x] Show hidden (dot-prefixed) folders in the file tree and pickers

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

Folders whose name starts with `.` were invisible everywhere the app lists repo files — the
**File tree** panel (#167), the searchable **File picker** (#56), the **File switcher** (#90), the
repo **Views** menu's file listing, and the template `open-file` picker — so `.claude/` (skills,
commands, settings), `.github/`, `.vscode/`, etc. and everything inside them never appeared and
couldn't be browsed to or opened. The cause was a single backend filter.

**What shipped** (commit `d02b437`, 2026-06-26)

- **`src-tauri/src/files.rs` `collect()`:** dropped the blanket `name.starts_with('.')` directory
  skip, keeping only the `SKIP_DIRS.contains(...)` heavy/vendored filter
  (`node_modules`, `target`, `dist`, `build`, `vendor`, `out`, `.next`). Dot-folders — `.claude`,
  `.github`, and **`.git`** — are now traversed and listed by the single `list_files` command.
- **No frontend change:** every file-listing surface routes through `list_files`, and the pure
  `buildFileTree` (`src/components/FileTree/buildFileTree.ts`) does no dotfile filtering — so the
  one backend edit fixes all surfaces at once.
- Doc comments (module header / `list_files` / the inline `collect` comment) updated to stop
  claiming hidden dirs are excluded, and the `lists_text_files_excluding_heavy_dirs_and_binaries`
  test rewritten to assert `.git/config` and `.claude/skills/foo/SKILL.md` **are** listed while
  `node_modules/*` and `*.png` remain excluded.

**Key files touched:** `src-tauri/src/files.rs` only (the `collect()` guard, doc comments, and one
unit test). Backend-only, no frontend or other module change.

**Notes**

- Refine decision (2026-06-26): un-hide **all** dot-folders **including `.git`** — the user was shown
  and accepted the tradeoff that `.git`'s internals (objects/refs/hooks) get listed and may crowd the
  500-file `LIST_CAP`. So `.git` is intentionally **not** in `SKIP_DIRS`, and `LIST_CAP` (500) /
  `MAX_DEPTH` (8) were left unchanged; re-excluding only `.git/objects` or raising the cap is a
  potential follow-up, not part of this task.
- Dot-prefixed **files** at the repo root (`.gitignore`, `.env`, `.prettierrc.json`) were already
  listed (`is_listable()` filters only by extension), so this task was purely about dot-**directories**.
- `cargo test` (73 tests) and `npm run lint:rust` (clippy) pass. The in-app manual check (File tree
  showing/expanding `.claude`, opening a file under it) was **not** runtime-verified in the headless
  loop; the backend change alone is sufficient since all surfaces share `list_files`.

---

### 180. [x] Show remote branches in the new-agent branch picker (auto-fetch + pull-on-select)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

The new-session modal's branch step listed only **local** branches (`list_branches` read just
`refs/heads`), so a branch existing only on a remote — e.g. a teammate's `origin/feature-x` — was
invisible; the user had to drop to a terminal to fetch + check it out before starting an agent on
it. This task surfaces **remote branches** under a separate "Remote branches" header in the picker
and lets the user "pull" one into a local tracking branch and start an agent on it, with the same
two bindings the local list uses (**Enter** = in-folder checkout; **⌘⏎** = isolated worktree #74).

**What shipped** (commit `35cc5d3`, 2026-06-26)

- **Reuse insight (#124):** "pull a remote branch locally" is exactly "create a new local branch
  named `<short>` based on `<remote-ref>`" — `git checkout -b <name> <remote-ref>` (in-folder) and
  `git worktree add -b <name> <dest> <remote-ref>` (worktree) both create the branch **and** set
  upstream tracking by default. So no new pull/checkout command was added; the pull reuses the
  existing `create_branch` / `worktree_add_new_branch` writes.
- **Backend (`src-tauri/src/git.rs`):** `BranchList` gained a `remote: Vec<String>` field;
  `list_branches` now also reads `refs/remotes` via `for-each-ref` (no network), excludes the
  `*/HEAD` symbolic ref, and dedups remote refs against local branches by first-`/`-stripped short
  name (`split_once('/')`, so `origin/feature/foo` → name `feature/foo`). New best-effort
  `fetch_remotes(cwd)` runs `git fetch --prune` with `GIT_TERMINAL_PROMPT=0` (fail-fast on a private
  remote rather than hang on a credential prompt) — **the app's first git network read**.
  `validate_new_branch` was widened so the `base` may be a member of `all` **or** `remote`, letting
  a remote-tracking ref serve as the create-branch base while still blocking arbitrary refspecs.
- **IPC (`commands.rs` / `lib.rs` / `src/ipc.ts` / `src/types/index.ts`):** added the `fetch_remotes`
  command + `fetchRemotes(cwd)` wrapper and the `remote?` field on the TS `BranchList` (kept optional
  so non-git `{ all, current }` fallbacks and test mocks stay valid).
- **Frontend (`src/components/NewSessionModal/NewSessionModal.tsx` + `.module.css`):** the branch
  step auto-fetches on open (fire-and-forget, then re-`listBranches` to refresh `remote`), shows the
  locals immediately with a subtle "fetching…" hint in the remote section, and renders a
  "Remote branches" subheader with dedup'd `<remote>/<name>` rows (section omitted when empty).
  Keyboard nav traverses a combined local→remote→"+ add branch" list via a discriminated
  `selectedRemote` highlight (mutually exclusive with `selectedBranch`/`addBranchActive`); the filter
  input filters remote rows too. **Enter** on a remote row → `createBranchSession(cwd, shortName,
  remoteRef)` (in-folder checkout-and-start, with the existing destructive-confirm gate when another
  agent runs in that folder); **⌘⏎** → `createBranchWorktreeSession(repo, shortName, remoteRef)`.
- **Scope decision (autonomous):** remotes appear in **new-session (immediate) mode only** — the
  schedule step hides the section, skips the auto-fetch, and never offers remote rows, since
  scheduling a remote pull at fire time would need new schedule-firing semantics (out of scope).

**Key files touched:** `src-tauri/src/git.rs` (BranchList field, `list_branches` remote collection +
dedup, `fetch_remotes`, widened `validate_new_branch`, Rust tests), `src-tauri/src/commands.rs` +
`src/lib.rs` (`fetch_remotes` command + registration), `src/components/NewSessionModal/
NewSessionModal.tsx` + `.module.css` (remote section, nav, selection wiring), `src/ipc.ts`,
`src/types/index.ts`, and `CLAUDE.md` (git-scope note + architecture lines for the network read and
remote listing).

**Dependencies:** none (reuses the #124 create-branch path and #74 worktree path, both already shipped).

**Notes**

- User answers (refine Q&A, 2026-06-26): remote source = **auto-fetch on open** (best-effort, never
  blocking the modal); selection mirrors **both Enter and ⌘⏎**; display = a **separate
  "Remote branches" header with dedup vs local**.
- Rust tests cover remote listing, `origin/HEAD` exclusion, local/remote dedup, and remote-ref base
  acceptance. `cargo test` (75) + `cargo clippy` + `npm run build` / `npm test` (248) / `npm run lint`
  all green.
- Manual GUI verification of the live picker (showing/selecting a remote row, pull-&-start, worktree)
  was **not** runtime-tested in the headless loop; the logic is covered by the backend tests +
  type-check, and the render reuses the existing branch-row machinery.

---

### 181. [x] "Pull" action in the repo + worktree context menus (ff-only)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

There was no way to pull a folder's latest changes from inside ReCue — the user had to drop into
a terminal and run `git pull`. This task adds a **"Pull"** item to the sidebar **repo** context menu
and the **worktree header** context menu that fast-forwards the folder's currently-checked-out branch
to its upstream and reports the result as a toast. Since you can only pull into the branch checked out
in a given working tree, "pull" here means `git -C <path> pull --ff-only` on the current branch (the
repo path for a repo folder, the worktree path for a worktree).

**What shipped** (commit `ab15adc`, 2026-06-26)

- **Backend (`src-tauri/src/git.rs`):** new `pull_ff(cwd) -> Result<String, String>` runs
  `git -C <cwd> pull --ff-only` with `GIT_TERMINAL_PROMPT=0` in the child env (modeled on #180's
  `fetch_remotes`), returning git's trimmed **stdout** on success (e.g. `"Already up to date."` or the
  fast-forward summary) and trimmed **stderr** on a non-zero exit. `--ff-only` only ever
  fast-forwards — never a merge commit or a half-finished merge/conflict state in a folder an agent
  may be using — so a diverged or upstream-less branch fails cleanly with an error message, and a
  busy/dirty tree simply errors (nothing lost). It fetches-then-fast-forwards, so no separate fetch
  is needed.
- **IPC (`commands.rs` / `lib.rs` / `src/ipc.ts`):** new `pull_branch(cwd) -> Result<String,
  SessionError>` command (mapping the error to `SessionError::Git`), registered in the invoke handler,
  with an `ipc.pull(cwd)` wrapper resolving the summary / rejecting with the error.
- **Store (`src/store.ts`):** new `pullFolder(cwd)` action calls `ipc.pull` and toasts the outcome —
  a concise success summary or a `"Pull failed: <message>"` error toast — reusing the existing toast
  helper.
- **Sidebar (`src/components/Sidebar/Sidebar.tsx`):** a neutral **"Pull"** menu item (tooltip
  `git pull --ff-only`) added to **both** the repo context menu and the worktree header menu, placed in
  the non-destructive utilities cluster next to Reveal in Finder / Copy path. It is **gated on a known
  current branch** (`branches[path]` non-empty), so it's hidden for non-git folders; the repo item
  pulls `menu.repo`, the worktree item pulls the worktree's own `path`. **No confirm gate** (per the
  user — `--ff-only` can't lose work).

**Key files touched:** `src-tauri/src/git.rs` (`pull_ff` + three Rust tests), `src-tauri/src/commands.rs`
+ `src/lib.rs` (`pull_branch` command + registration), `src/ipc.ts` (`pull` wrapper), `src/store.ts`
(`pullFolder` action + toasts), `src/components/Sidebar/Sidebar.tsx` (Pull item in both menus), and
`CLAUDE.md` (git-scope note + sidebar context-menu line).

**Dependencies:** none (independent of #180, but follows #180's `fetch_remotes` as the model for the
network git write's `GIT_TERMINAL_PROMPT=0` env guard + best-effort error handling).

**Notes**

- User answers (refine Q&A, 2026-06-26): **fast-forward only** (`git pull --ff-only`); **no confirm —
  just toast the result** (success summary or git's error).
- Rust tests cover the three paths: fast-forward success (clone an origin, advance origin, `pull_ff`
  pulls the new file), divergence error (local + origin both commit → `pull_ff` errors, no merge), and
  no-upstream error (a remote-less repo). `cargo test` (78) + `cargo clippy` + `npm run build` /
  `npm test` (248) / `npm run lint` all green.
- Manual GUI verification of the live right-click menus (clicking Pull, seeing the toast) was **not**
  runtime-tested in the headless loop; the backend is covered by the three Rust tests, the wiring
  type-checks, and the menu reuses the existing `menuItem` machinery.

---

### 182. [x] Markdown links must open in the external browser, never inside the app window

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

Clicking a link inside **rendered markdown** navigated the Tauri **webview itself** — the React app
was replaced by the linked page, stranding the user on a web page inside ReCue with no back button
or chrome. The cause: the app renders markdown with react-markdown + remark-gfm and (since #173) a
custom `components` map (`makeCheckboxComponents`) that only overrode the `input` element, so links
fell through to react-markdown's default plain `<a href>` — which in a Tauri webview performs an
in-place SPA-destroying navigation. This task routes rendered-markdown links to the system browser
(reusing the #109 `openUrl` path) and neutralizes any non-web link so the app can never be navigated
away.

**What shipped** (commit `affaf6d`, 2026-06-26)

- **`src/components/markdownCheckboxes.tsx`:** added a pure, unit-testable
  `isExternalHref(href)` helper (true only for `http(s)://…`, `/^https?:\/\//i`), a reusable
  `markdownLinkComponents` map whose `a` override always `preventDefault()`s and — only for an
  external href — calls `void openUrl(href).catch(() => {})` (imported from `../ipc`, the same
  dependency-free Rust `open_url` the #109 terminal links use); non-http(s) schemes (relative paths,
  `mailto:`, `tel:`, `#anchor`) become no-ops. The `a` override is **merged into**
  `makeCheckboxComponents`'s returned map, so it coexists with the existing `input` checkbox override.
- **Coverage of all three render sites:** because both the **FileViewer** rendered-markdown view and
  the **Kanban card body** build their components map from `makeCheckboxComponents`, they pick up the
  link handling for free; the third site, **`CardPreview`** (KanbanPanel's drag overlay, which built
  no map before), gets `components={markdownLinkComponents}` passed explicitly.
- **No backend change:** `open_url` keeps its existing http(s)-only guard; `mailto:`/`tel:` are
  deliberately not routed to the system handler. No new IPC surface, dependency, or capability change.
- The react-markdown v9 `node` prop is **not** spread onto the DOM `<a>` (avoids the invalid-attribute
  warning), matching the existing `input` override.

**Key files touched:** `src/components/markdownCheckboxes.tsx` (`isExternalHref`,
`markdownLinkComponents`, merge into `makeCheckboxComponents`),
`src/components/markdownCheckboxes.test.ts` (new `isExternalHref` unit test),
`src/components/Kanban/KanbanPanel.tsx` (`CardPreview` link override). No backend / `CLAUDE.md` change.

**Dependencies:** none (reuses the #109 `openUrl` → Rust `open_url` primitive and the #173 shared
markdown-`components` factory, both already shipped).

**Notes**

- User decisions (refine Q&A, 2026-06-26): **all markdown sites** (FileViewer view + Kanban card bodies
  + `CardPreview`) via the shared factory; **neutralize non-http(s)** (no nav, no backend widening).
- `CardPreview` is a drag overlay (pointer events usually suppressed mid-drag), so its links are rarely
  clickable in practice; the override is added there for consistency / defense-in-depth.
- `npm run build`, `npm run lint`, and `npm test` (with the new `isExternalHref` test) pass. Manual
  in-app verification (clicking an http link in a rendered `.md` / Kanban card opening the system
  browser while the window stays on the app; a relative/`mailto` link doing nothing) was **not**
  runtime-tested in the headless loop; the classification is unit-tested and the click handling reuses
  the established #109 path.

---

### 183. [x] Diff view: show untracked (new) files in the working-tree diff

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

The diff view's **Working tree** source didn't show **untracked (new) files** — their changes were
invisible in the panel. Reported as "the diff panel doesn't show hidden folders' changed contents,"
the real defect was broader: `git::working_diff` ran only `git diff HEAD`, which reports **tracked**
modifications/deletions + staged additions and **excludes untracked files entirely**. A freshly
created folder (hidden or not — e.g. a new `.claude/`) has all-untracked files, so none appeared,
which is how the reporter hit it with a hidden config folder. Tracked changes inside hidden folders
already rendered correctly, so the framing was incidental.

**What shipped** (commit `57fb580`, 2026-06-26) — **backend-only** (`src-tauri/src/git.rs`):

- **`working_diff` untracked pass:** after parsing the tracked `git diff HEAD` output, it now lists
  untracked files via `git ls-files --others --exclude-standard -z` (`--exclude-standard` honors
  `.gitignore`/`.git/info/exclude`/global excludes so ignored build noise stays out; `-z` NUL-split
  for path robustness) and synthesizes a new-file diff for each with
  `git -c core.quotepath=false diff --no-index --no-color --no-ext-diff -- /dev/null <path>`, running
  the output through the existing `parse_unified_diff` (the `new file mode` block maps to
  `FileStatus::Added`; binary files get the `Binary files … differ` flag). The parsed `A` entries are
  appended to the tracked `files` list and the existing summary recompute covers the combined list.
- **`run_git_raw_allow_diff` helper:** `git diff --no-index` exits **1** when inputs differ (the normal
  case), which the strict `run_git_raw` (`.status.success()`) would discard — dropping every
  untracked diff. The new runner returns stdout when the exit code is `0` **or** `1` (None for ≥2 /
  spawn failure), used **only** for the `--no-index` calls; `run_git` / `run_git_raw` are unchanged.
- **Bounded:** a `MAX_UNTRACKED_FILES` cap (2000) guards against a pathological untracked set
  (added during implementation beyond the plan's optional-cap suggestion); a per-file `--no-index`
  call returning `None` is skipped best-effort.
- **No frontend change:** `DiffInspector` already renders a flat, unfiltered list of `diff.files`, so
  untracked rows appear as the existing green "A" (Added) glyph with no UI change; the poll loop's
  `JSON.stringify` signature naturally re-renders when untracked files appear/disappear.

**Key files touched:** `src-tauri/src/git.rs` only — `working_diff` (untracked pass + combined
summary), new `run_git_raw_allow_diff` + untracked-listing helper, `MAX_UNTRACKED_FILES`, and a new
unit test. No frontend, no other module, no `CLAUDE.md` change.

**Dependencies:** none. Out of scope: `compare_branches` (#81 branch-to-branch, where untracked files
don't apply) is unchanged; no `.gitignore`'d files, no index/working-tree mutation.

**Notes**

- User decisions (refine Q&A, 2026-06-26): **all untracked files** (the "hidden folders" framing was
  incidental); **respect `.gitignore`** via `--exclude-standard`.
- Verified against real `git` during refinement: `git diff HEAD` omits untracked files; `diff
  --no-index -- /dev/null <relpath>` emits a clean `new file mode` block (exit 1) with a `b/<relpath>`
  header (and a `Binary files … differ` line for binaries); `ls-files --others --exclude-standard -z`
  skips a `.gitignore`'d folder. The per-file `--no-index` spawn is acceptable because
  `--exclude-standard` keeps the set small — it's the faithful, read-only way to reuse
  `parse_unified_diff` (avoids the index-mutating `git add -N`).
- New Rust unit test asserts a tracked modification **and** untracked files in normal + hidden folders
  show as `A` while a `.gitignore`'d path is omitted. `cargo test` + `npm run lint:rust` (clippy) pass;
  no frontend code change required. The in-app manual check (new file in a hidden folder appearing in
  the Working-tree diff) was **not** runtime-verified in the headless loop; the backend change is
  covered by the unit test and the render reuses the existing `A`-row machinery.

---

### 184. [x] File tree context menu: offer both "Copy absolute path" and "Copy relative path"

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

In the repo **file tree** (#167), right-clicking a file showed a single ambiguous **"Copy path"**
item that copied the **absolute** path (`${repoPath}/${menu.file}`). The user wanted **both** a
"Copy absolute path" and a "Copy relative path" option — the established convention already present in
the sidebar **file-row** menu (#171 `filePathMenuItems`), which the FileTree's bespoke menu had never
picked up. This task brings the FileTree menu in line.

**What shipped** (commit `0d3dceb`, 2026-06-26) — **frontend-only**
(`src/components/FileTree/FileTree.tsx`):

- **Relabeled** the existing "Copy path" item to **"Copy absolute path"** (behavior unchanged — still
  copies `${repoPath}/${menu.file}` via `copyToClipboard(abs, "path")`).
- **Added** a **"Copy relative path"** item immediately after it, copying the repo-relative path
  (`menu.file`) via `copyToClipboard(menu.file, "path")` — same `role="menuitem"` markup as its
  siblings. Both route through the existing store action that toasts "Copied path"; the order/labels/
  semantics mirror #171's `filePathMenuItems` so the two menus read identically.
- **Raised the context-menu bottom-edge clamp** (`window.innerHeight - 160` → `- 200`) so the
  now-taller menu (up to 5 items for a `.md` file: Open / Open as Kanban / Reveal / Copy absolute /
  Copy relative) stays fully on-screen when opened near the viewport bottom.
- One component covers all surfaces it renders in (sidebar, Overview column, Canvas panel).

**Key files touched:** `src/components/FileTree/FileTree.tsx` only (menu item relabel + new item +
position clamp). No backend, no new clipboard plumbing, no `CLAUDE.md` change.

**Dependencies:** none (reuses the existing `copyToClipboard(text, "path")` action; mirrors the #171
sidebar file-row menu convention).

**Notes**

- User decision (refine Q&A, 2026-06-26): the two options are **absolute path + relative path** (the
  existing app convention); the card's "absolute path (not entire path)" wording resolved "not entire
  path" to the repo-relative path. Folders still have no context menu (left as-is); left-click (open)
  unchanged.
- `npm run build` / `npm run lint` / `npm test` pass. The in-app manual check (right-clicking a
  file-tree file, both copies working + the menu staying on-screen near the bottom edge) was **not**
  runtime-verified in the headless loop; the change is a small relabel + added item reusing the
  established `copyToClipboard` path.

---

### 185. [x] Activity dot blinks yellow when focusing / leaving a busy agent

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

A working agent's `BusyIndicator` dot should stay **blue** (the #42/#88 "working"
shimmer) while it works, but it **blinked yellow** — the #112 "finished — needs input"
settled state — for a tick, then returned to blue, in two situations: (1) **clicking /
focusing** an agent panel or card while it was working, and (2) **switching away** from a
currently-selected, working agent. Both wrongly signalled "needs your input" mid-turn and
were distracting.

**Root cause.** The blink was a real, transient backend state change, not a render glitch.
`sessionBusy` (which drives the dot) is written only by `setBusy` ← `onState` ←
`session://state`, and `BusyIndicator` faithfully renders `!busy && hasBeenActive` as
yellow. The backend `monitor_loop` busy heuristic carries the #55 **keystroke-echo guard**:
output arriving within `INPUT_ECHO_MS` (300ms) *after* the last input is assumed to be the
terminal echoing the user's typing, so it doesn't read as busy. `last_input` is stamped by
`write_stdin` for **every** byte written to the PTY. But xterm's `onData` forwards more than
keystrokes — it also sends automatic terminal-protocol **reports** that Claude's TUI
requests via DECSET: **focus in/out** (`\x1b[I` / `\x1b[O`, 1004) and **mouse** reports
(1000/1002/1003 X10, 1006 SGR). So focusing/clicking/leaving an agent wrote report bytes
that stamped `last_input` *as if the user had typed*, dropping the agent's in-flight output
into the 300ms echo window → misclassified as echo → `busy:false` for ~one monitor tick →
the dot rendered yellow until the next output flipped it back. The "switch away" symptom
specifically pinned **focus-out** reporting as a cause.

**What shipped** (commit `d63f2ce`, 2026-06-26) — **backend-only** (`src-tauri/src/pty.rs`):

- Added a pure `is_noninput_report(data: &str) -> bool` helper (with a `consume_report`
  sub-helper) that returns `true` **iff** `data` is non-empty and consists **entirely** of
  back-to-back recognized automatic CSI reports: focus in/out (`ESC [ I` / `ESC [ O`), X10
  mouse (`ESC [ M` + exactly 3 payload bytes), and SGR mouse (`ESC [ < <digits/';'>… M|m`).
  Conservative by design — if **any** byte falls outside a recognized report it returns
  `false` (treat as real input), so a genuine keystroke's echo guard is never suppressed.
  SS3 keys (`ESC O …`, no `[`) and CSI arrows/`~`-sequences are deliberately classified as
  input, distinct from focus-out (`ESC [ O`).
- In `write_stdin`, the bytes are still written to the PTY **unconditionally** (Claude needs
  the mouse + focus events), but `last_input` is stamped only when
  `!is_noninput_report(data)`.
- **No change** to `monitor_loop`, the `INPUT_ECHO_MS` / `BUSY_WINDOW_MS` constants, the
  store, or `BusyIndicator` — so the genuine end-of-turn busy→idle yellow transition's
  timing is unchanged (#112 preserved), and the #55 echo suppression for *actual typing* is
  fully preserved.
- Tests: a `is_noninput_report_matches_automatic_reports_only` unit test (positive: focus
  in/out, SGR press/release, X10 mouse, concatenated reports; negative: `"ls\n"`, `"\r"`,
  CSI arrow, SS3 key, lone `ESC`, empty, `"\x1b[Ix"`, `"\x1b[3~"`), plus integration tests
  `focus_report_does_not_blink_busy_to_idle` (a continuously-working seeded session sent a
  focus report stays busy — no idle edge) and `real_keystroke_still_suppresses_echo_after_fix`
  (a real `"x"` still produces the #55 echo-suppression idle edge).

**Key files touched:** `src-tauri/src/pty.rs` only (`write_stdin` guard + `is_noninput_report`
/ `consume_report` helpers + unit/integration tests). No frontend, store, or `CLAUDE.md`
change.

**Dependencies:** none. Prior art / context: #42 (busy indicator), #55 (echo-aware "typing
≠ busy"), #88 (shimmer), #112 (yellow "needs input" third state), #116 (`has_work` /
seeded).

**Notes**

- **User decisions (2026-06-26):** chose the **targeted** fix (ignore non-keystroke reports
  in the busy heuristic) over an idle-debounce/hysteresis or doing both — so the genuine
  yellow transition's timing stays as-is. A follow-up refinement ("it also happens when
  switching AWAY") pinned focus-out reporting; the fix covers focus in/out **and** mouse
  together.
- **Subtask 5 (runtime-verify the exact sequences Claude emits on click/focus-out) was NOT
  performed** in this autonomous loop — no interactive `tauri dev` / human session. Mitigated
  by the matcher covering the full DECSET report superset (1004 focus + 1000/1002/1003 X10 +
  1006 SGR), the plan's deliberately safe choice: worst case, an unmatched future report form
  degrades to today's behavior (counts as input, could blink) — never worse. No temporary
  logging was added.
- All gates green for the backend change (`cargo test` — 83 Rust tests pass — `npm run build`,
  `npm run lint`, `npm test`, `npm run lint:rust`, `npm run format:rust`). The one
  `npm run format:check` warning is on `src/components/markdownCheckboxes.tsx`, a
  **pre-existing** issue from #182 (`affaf6d`), untouched by this backend-only task.

---

### 186. [x] Distribute Canvas panels evenly (tab-strip button + border double-click)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

The Canvas (#46/#47) is a binary **BSP tree** (`canvasTree.ts`): every `split` node carries
`sizes: [a, b]` and `splitLeaf` always adds a new panel as `[50, 50]`. Because the tree is
binary, three panels in one row nest as `split(row, leaf1, split(row, leaf2, leaf3))` and end
up **50% / 25% / 25%** — visibly uneven. The user wanted a one-shot "distribute / equalize"
action (the design-tool operation) that rebalances an existing layout so **every panel is the
same size**, without changing the add-time halving behaviour.

**What shipped** (commit `662a6cc`, 2026-06-26) — **frontend-only** (no Rust):

- **Two affordances.** (1) A **"Distribute evenly" button** in the Canvas tab strip
  (`CanvasTabs.tsx`, Lucide `Grid2x2`, beside `+` / `▾ Templates`, reusing `styles.tabAdd`)
  that equalizes the **whole active canvas** — disabled when the layout is null or a single
  leaf (`<2` panels). (2) **Double-clicking the border** (the resize `Separator`) between two
  panels equalizes just the **subtree that border divides** (`equalizeCanvas(node.id)`) —
  two distinct, learnable tools rather than two triggers for the same action.
- **Semantics — equal area via leaf-count weighting.** Each split's `sizes` are set
  proportional to the leaf count of each child subtree: `[na/(na+nb)*100, nb/(na+nb)*100]`.
  By induction every leaf gets an equal `1/total` share regardless of nesting; a 3-panel row
  collapses to true thirds. (The naive "reset every split to `[50,50]`" alternative — which
  leaves a 3-panel row at 50/25/25 — was explicitly rejected.)
- **Pure ops** added to `canvasTree.ts`: `leafCount`, `equalize`, `equalizeSplit`,
  `collectSplits` — identity-preserving (unchanged subtrees keep object identity) and
  idempotent (re-equalizing an even tree returns the same ref), with **7 new unit tests** in
  `canvasTree.test.ts`.
- **Store action** `equalizeCanvas(splitId?)` (`store.ts`): reads the active layout, computes
  `equalize` (no id) or `equalizeSplit(id)`, no-ops when there's no layout / already even,
  else commits via the existing `setActiveCanvasLayout` (persist + `canvas://changed`
  broadcast, so detached #84 windows pick it up).
- **Remount-free imperative reconcile** (`CanvasSurface.tsx`): because a `Group`'s
  `defaultLayout` is initial-only, equalize is the first programmatic size-only change.
  A `groupHandles` registry (each `Group` gets a callback `groupRef`) plus a `[rawLayout]`
  effect walks `collectSplits` and calls `handle.setLayout(...)` only where live sizes differ
  from target by ≥0.5% — so it does real work right after an equalize but no-ops on user
  drag-resize/structural remounts (avoiding a feedback loop). **No React `key` bump**, so the
  #18 pooled terminals reparent and keep their scrollback. The `Separator` takes
  `disableDoubleClick` (the library's built-in only resets to `defaultSize`, which our
  `minSize="10%"`-only Panels don't set, so it was inert) + our own `onDoubleClick`.

**Key files touched:** `src/components/Canvas/canvasTree.ts` (+ `.test.ts`),
`src/store.ts` (`equalizeCanvas`), `src/components/Canvas/CanvasSurface.tsx` (groupRef
registry + reconcile effect + Separator double-click), `src/components/Canvas/CanvasTabs.tsx`
(button), `src/components/Canvas/Canvas.module.css` (`.tabAdd:disabled`). `splitLeaf`'s
add-time `[50,50]` and the agent header-bar drag/rename target are untouched.

**Dependencies:** none. Context: #46/#47/#58 (Canvas BSP + tabs), #84 (cross-window sync),
#18 (terminal pool).

**Notes**

- **User decisions (refine, 2026-06-26):** both affordances ("tab-strip button, but also by
  double-clicking the borders … see if this is possible and has good UX"); semantics =
  "equal size for every panel" (leaf-count weighting), not 50/50 reset. The refine agent,
  delegated the UX call, scoped the button to the whole canvas and the border double-click to
  the divided subtree — a later one-line change makes the border equalize the whole canvas
  if preferred.
- **Edge case:** `<Panel minSize="10%">` clamps each side to ≥10%, so perfect equal area
  isn't reachable past ~10 panels in one nesting chain; fine for typical 2–6-panel canvases.
- **Runtime-unverified** in this autonomous loop (no GUI session): the DOM gestures (button →
  equal thirds, border double-click scoping), persistence across reload, cross-window (#84)
  sync, and busy-terminal scrollback survival. The pure layout math is unit-tested and the
  imperative wiring uses the API verified against the installed `react-resizable-panels`
  `dist/*.d.ts` + the existing persist/broadcast path. `npm run build` / `npm run lint` /
  `npm test` (251) all green; no Rust changes.

---

### 187. [x] "Save current canvas as template" — seed the Template Editor from a live canvas

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

Canvas templates (#117/#118) are reusable saved layouts whose leaves hold inert **action
blocks** (`new-agent` / `new-terminal` / `open-file` / `open-diff` / `open-kanban` /
`open-filetree`). Until now a template could only be built **from scratch** in the
full-screen `TemplateEditor` by dragging blocks from a palette. This task adds the reverse
on-ramp: after assembling a canvas you like (real agents/files/diffs/kanban/terminals),
**turn that live canvas into a template** in one action — opening the Template Editor
**pre-populated** with equivalent blocks (file/kanban blocks already carrying the correct
relative path), so the user only names + tweaks + Saves.

**What shipped** (commit `4b1ddea`, 2026-06-26) — **frontend-only** (no Rust):

- **Menu entry.** A fourth item, **"Save current canvas as template…"**, in the Canvas
  **▾ Templates** menu (`CanvasTabs.tsx`), after "New template…", **disabled**
  (`canSaveAsTemplate`) when the active canvas has no panels.
- **Pure inverse mapper** — new `src/components/Canvas/canvasToTemplate.ts`:
  `canvasToTemplate(layout, resolveAgentName?)` → `CanvasNode | null`, the inverse of #118's
  instantiation. Each live leaf maps to its template block via a **registry reverse-lookup**
  (`blockForLiveKind`, added to `templateBlocks.ts`, matching `BLOCK_REGISTRY` entries by
  their `liveKind`) — so live→block shares the same single source of truth as block→live:
  `agent`→`new-agent`, `terminal`→`new-terminal`, `file`→`open-file`, `diff`→`open-diff`,
  `kanban`→`open-kanban`, `filetree`→`open-filetree`. `repoPath` is **dropped** (templates
  are folder-agnostic — the repo is chosen at use time); only the relative `file` travels.
  A `new-agent` block carries the agent's **custom name** only (via an injected
  `resolveAgentName(sessionId)` over `sessions` — not the auto-title #97, not the `prompt`,
  which is unrecoverable from a live conversation). `scheduled`/`pending` leaves are dropped
  and their split **collapses** (one survivor promoted, like `removeLeaf`); leaf/split ids
  and split `dir`/`sizes` are preserved (keeps the mapper pure/deterministic). An
  all-dropped/empty canvas → `null`.
- **Store seeding** (`store.ts`): new `templateEditorSeed` / `templateEditorSeedName` fields
  + `openTemplateEditorFromCanvas()` — maps the active layout with the name resolver; on
  `null` it **toasts** "This canvas has nothing to save as a template" and no-ops; else opens
  a **new-template** editor (`templateEditorId: null`) carrying the seed + the active tab's
  name as the default. The seed is cleared in **both** `closeTemplateEditor` and
  `openTemplateEditor` (so an edit/blank-template open never inherits a stale seed).
- **Editor** (`TemplateEditor.tsx`): its `useState` initializers fall back `name` →
  `seedName` and `layout` → a deep-clone of the seed when not editing an `existing` template,
  so editing never mutates the store seed or the live canvas. The draft stays **unsaved**
  until Save (`onSave` → `saveTemplate(name, layout, null)` creates only on Save).
- **6 unit tests** in `canvasToTemplate.test.ts` (each live kind → block kind + id reuse;
  file/kanban carry relative path & drop `repoPath`; agent carries resolver name / omits when
  absent; scheduled/pending dropped + collapse; empty → null; nested tree preserves
  `dir`/`sizes`/order).

**Key files touched:** new `src/components/Canvas/canvasToTemplate.ts` (+ `.test.ts`);
`src/components/Canvas/templateBlocks.ts` (`blockForLiveKind`); `src/store.ts` (seed state +
`openTemplateEditorFromCanvas` + seed clearing); `src/components/TemplateEditor/TemplateEditor.tsx`
(seed fallback); `src/components/Canvas/CanvasTabs.tsx` (menu item + `canSaveAsTemplate`).

**Dependencies:** none — the template system (#117/#118), block registry, `TemplateEditor`,
`templateInstantiate.ts`, and the `canvas_templates` blob were all already shipped. Independent
of #186.

**Notes**

- **Autonomous refine (2026-06-26):** the user had stopped responding, so the refine agent
  made the open decisions to best judgment (logged in `ASSUMPTIONS.md`): trigger = a Templates
  menu item (not a toolbar button); mapping reuses the registry `liveKind` + existing ids +
  split `dir`/`sizes`; agent blocks carry the custom name only; default name = the tab name;
  empty/all-dropped → toast + no-op.
- **Known limitation (per scope):** a branch-compare diff panel (#81) maps to a plain
  working-tree `open-diff` block (compare refs aren't preserved; `diff` blocks carry no
  config).
- **Runtime-unverified** in this autonomous loop (no GUI session): the end-to-end gesture
  (build a canvas → Save as template → editor opens pre-populated with correct
  blocks/names/paths/proportions → Save → reuse via "New tab from template…"). The pure
  mapping is unit-tested (6 cases) and the seeding + save/instantiate paths reuse shipped
  code. `npm run build` / `npm run lint` / `npm test` (257, +6) all green; no Rust changes.

---

### 188. [x] Double-click a panel / card header to rename the agent inline

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

An agent's **header bar** is the primary **drag handle** — in the Canvas the whole panel
`<header>` carries the dnd-kit move listeners (#144), and in the Overview the whole card
`<header>` is the sortable drag handle (#70). Renaming an agent was only reachable from the
**sidebar row context menu** (#57). This task adds **double-click the header bar → inline
rename** straight from the panel/card you're looking at, on both surfaces.

**What shipped** (commit `e5612f7`, 2026-06-26) — **frontend-only** (no Rust, no
`renameSession`/persistence change):

- **Canvas** (`CanvasSurface.tsx` `LeafPanel`) and **Overview** (`Overview.tsx`
  `SessionCard`) agent titles get an `onDoubleClick` that swaps the title span for an inline
  `<input>`, reusing the **proven sidebar rename state machine verbatim**
  (`editing`/`draft`/`committed` refs + `beginRename`/`finishRename`/`cancelRename`; Enter &
  blur commit, Escape cancels, a `committed` guard against Enter-then-blur double-commit).
- The input is **seeded with the current custom name** and shows the **derived label**
  (auto-title #97 / branch) as its placeholder; an **empty commit clears** the custom name
  (`renameSession` trims → `null`, reverting to the derived label) — identical semantics to
  the sidebar. Commit writes through the existing `renameSession(id, name)` (#57), read
  optimistically from `session.name` everywhere, so Canvas / Overview / sidebar update
  together.
- **Drag vs. double-click coexist** via the existing **4px `PointerSensor`** activation
  distance (a stationary double-click can't move 4px → never starts a drag), and the
  `<input>` stops `pointerdown` propagation (like the header's `panelActions` / `FileSwitcher`
  already do) so editing never grabs the header drag. Same pattern `CanvasTabs`' tab rename
  already relies on.
- **Agents only:** a `canRename` gate (`content.kind === "agent" && !!session`) means
  non-agent panels (file/diff/terminal/kanban/filetree) and scheduled cards (which have their
  own #94 name editor) get no rename gesture. Distinct DOM target from #186's `Separator`
  double-click ("distribute evenly") — no conflict.

**Key files touched:** `src/components/Canvas/CanvasSurface.tsx` (`LeafPanel` rename machine
+ input/double-click), `src/components/Canvas/Canvas.module.css` (`.renameInput`),
`src/components/Overview/Overview.tsx` (`SessionCard` rename machine + input/double-click),
`src/components/Overview/Overview.module.css` (`.renameInput`). `renameSession` (#57) reused
unchanged; no new pure functions (so no new unit tests, consistent with the untested
sidebar/tab rename machines).

**Dependencies:** none — `renameSession` (#57), the draggable headers (#70/#144), and the
inline-rename pattern (sidebar #57 / `CanvasTabs`) were all already shipped. Independent of
#186 and #187.

**Notes**

- **Autonomous refine (2026-06-26):** the user wasn't responding; decisions logged in
  `ASSUMPTIONS.md` — renamable = agents only; surfaces = Canvas + Overview header bars (the
  sidebar already renames via its #57 menu and its rows aren't header bars); input seeds the
  custom name with the derived label as placeholder; empty commit clears.
- **Runtime-unverified** in this autonomous loop (no GUI session): the live double-click →
  type → Enter/Escape/blur flow and its cross-surface propagation. The state machine and
  `renameSession` are shipped, exercised code; the wiring is type-checked + lint/format clean.
  `npm run build` / `npm run lint` / `npm test` (257) all green; no Rust changes.

---

### 189. [x] Keyboard-driven panel-creation modal (⌘K) + per-type quick shortcuts

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

Creating a panel took several clicks — an agent via ⌘N → `NewSessionModal`, a view via the
repo menu's Views section (#82/#164) or the file picker. This task adds a faster,
keyboard-first launcher: a single shortcut opens a **"Create panel" modal** to pick a
**type** and a **target folder (repo or repo-worktree)**, plus per-type quick shortcuts — an
explicit power-user "nice to have" that **reuses the existing creation actions** so it stays
in sync with the Views menu and ⌘N.

**What shipped** (commit `b3f8244`, 2026-06-26) — **frontend-only** (no Rust):

- **Opener ⌘K / Ctrl+K** (free; the command-palette convention) opens the modal at the type
  step. The user's literal "⌘1 = session" was impossible — **⌘1–9 is already canvas-jump
  (#76)** — and ⌘⇧+digit clashes with macOS screenshots, so the per-type keys became
  **in-modal digits 1–6** (primary, discoverable) plus **global ⌘⌥1–6** (the literal
  "individual panel keybind", with a free modifier) that open the modal straight to the
  target step for that type.
- **Two-step modal** (`CreatePanelModal.tsx` + `.module.css`, mirroring `NewSessionModal`'s
  centered, focus-trapped, Escape/outside-click chrome): (1) type step — the 6 types with
  icons + digit hints; (2) target step — open repos + their worktrees (from `recents` ∪ live
  `session.repoPath`s, worktree folders included #74, deduped) + search + **Browse…**, reusing
  the new-session folder UX.
- **Reuse-only creation** routed through the **same path as the Views menu**: Session →
  `startRepoSession(folder)` (#127, which itself opens the branch/worktree flow for a git
  folder); File/Kanban → the shared `FilePicker` (#56) → `addOverviewPanel(…, "markdown"|"kanban")`
  / `createKanbanBoard`; Diff/Terminal/File-tree → `addOverviewPanel` directly. New panels
  land in the **sidebar + Overview** (draggable into Canvas), never auto-inserted into the
  active Canvas BSP — exactly like every other "add a view" entry. No new view type, no
  re-implemented branch/worktree logic.
- **Shared 6-type registry** (`panelTypes.ts` + `panelTypes.test.ts`) — `1` Session · `2`
  File · `3` Diff · `4` Terminal · `5` Kanban · `6` File tree, with a unit-tested
  `panelTypeForDigit` — is the single source the modal, the in-modal digit map, and the
  keyboard handler all read, keeping it in sync with `ViewsMenu`/`templateBlocks`.
- **Keyboard wiring** (`useKeyboardNav.ts`): ⌘K → `openCreatePanel()`; ⌘⌥1–6 →
  `openCreatePanel(panelTypeForDigit(N))` **matched on `e.code` (`Digit1`–`Digit6`)** because
  macOS Option+digit composes a glyph in `e.key` (layout/glyph-proof). The **⌘1–9 canvas-jump
  is untouched** (canvas-jump requires `!altKey`, the new combo requires `altKey` — mutually
  exclusive). All shortcuts are **main-window-only**, capture-phase
  `preventDefault`+`stopPropagation` (never reach a focused PTY), and inert while
  `createPanelOpen || newSessionOpen`. Store gains `createPanelOpen`/`createPanelType` +
  `openCreatePanel(type?)`/`closeCreatePanel()`; `App.tsx` mounts the modal.

**Key files touched:** new `src/components/CreatePanelModal/{CreatePanelModal.tsx,.module.css,
panelTypes.ts,panelTypes.test.ts}`; `src/store.ts` (state + open/close actions);
`src/useKeyboardNav.ts` (⌘K + ⌘⌥1–6); `src/App.tsx` (mount).

**Dependencies:** none — `ViewsMenu`/`addOverviewPanel` (#82/#164), `startRepoSession` (#127),
`createKanbanBoard`, `FilePicker` (#56), and `useKeyboardNav` were all shipped. Independent of
#186–#188; adds no addable view type (so doesn't affect the #82 Views-menu dependency rule).

**Notes**

- **Autonomous refine (2026-06-26):** the user wasn't responding; decisions logged in
  `ASSUMPTIONS.md` — opener = ⌘K; per-type keys = in-modal digits 1–6 + global ⌘⌥1–6 (since
  ⌘1–9 is canvas-jump and ⌘⇧+digit clashes with screenshots); type order reuses the
  Views/block-registry set; target step lists open repos + worktrees + recents + Browse;
  modal orchestrates existing actions only; panels land in sidebar/Overview (not auto-inserted
  into Canvas).
- **Runtime-unverified** in this autonomous loop (no GUI session): the live ⌘K / ⌘⌥N gestures,
  the two-step flow, and that a created panel appears in the sidebar/Overview (incl.
  confirming ⌘1–9 still jumps canvases and the combos don't leak into a focused terminal). The
  digit→type map is unit-tested and every creation path reuses shipped, exercised actions.
  `npm run build` / `npm run lint` / `npm test` (259, +2) all green; no Rust changes.

---

### 190. [x] Auto-update skeleton: gated release pipeline + in-app update UI (keys deferred)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

Stand up the **foundation** for in-app auto-update so it's ready to switch on once a real
Tauri signing keypair is generated (a later task) — re-introducing the mechanism **#62
removed** (the #15 Tauri-updater), rebuilt **more completely** (gated pipeline + richer UI)
and **without committing a real key**. This **deliberately reverses** the v1 "no in-app
auto-update and no release pipeline" rule (#62); Apple code-signing/notarization stays out of
scope (the updater uses **minisign**, its own deferred keypair).

**What shipped** (commit `1cf9064`, 2026-06-26) — **full-stack** (frontend + Rust + CI + docs):

- **Release pipeline** (`.github/workflows/release.yml`): on push to `main`, a `check` job
  emits two outputs — a **version-bump** guard (config version > latest `v*` tag) and a
  **signing-secret-present** guard (`has_key` from `[ -n "$SIGNING_KEY" ]`, since Actions
  can't read `secrets.*` in a job-level `if:` and never echoes the secret). The `release` job
  runs only when **both** are true (builds a universal macOS bundle + a **draft** release with
  updater artifacts via `tauri-action`); otherwise it logs a `::notice::` and the run ends
  green. So with **no key configured today the pipeline no-ops**, and adding the secret later
  activates it with zero further code changes.
- **Updater + process plugins re-wired** — JS `@tauri-apps/plugin-updater` +
  `@tauri-apps/plugin-process`; Rust `tauri-plugin-updater` + `tauri-plugin-process` inited in
  `lib.rs`; `capabilities/default.json` grants `updater:default` + `process:allow-restart`;
  `tauri.conf.json` gets a `plugins.updater` block (GitHub `latest.json` endpoint + a
  **placeholder pubkey** = the #15 public key, a valid minisign format so `tauri-build`
  validates). **`createUpdaterArtifacts` stays OFF** so a local `tauri build` keeps producing
  an unsigned `.app`/`.dmg` with no key — a hard build-safety requirement.
- **`src/updater.ts`** wraps the plugin: `checkForUpdate()` (returns `{version}|null`, holds
  the non-serializable `Update` module-side like the outputBus pattern) and
  `downloadAndRelaunch(onProgress)` (forwards `Started`/`Progress`/`Finished` to a 0–100
  callback, then `relaunch()`).
- **Store `update` slice** (`status`/`version`/`progress`/`error`/`confirming`) +
  `checkForUpdate`/`openUpdateConfirm`/`cancelUpdate`/`installUpdate` + a `setUpdateState`
  escape hatch so the mock (#193) can drive every state without a real release. Boot calls
  `checkForUpdate` best-effort (null today).
- **UI:** `UpdateIndicator` in the sidebar footer **above the Settings gear** (hidden when
  idle, clickable when available, collapses to its icon in the #168 rail) → `UpdateModal`
  confirm dialog → OK → a **full-window input-blocking overlay** (`--scrim`, no dismiss) with
  a **progress bar** bound to `update.progress` → `relaunch()`.
- **Post-update toast:** a dedicated Rust scalar **`last_version`** (mirroring `sidebar_width`,
  so the Settings draft can't clobber it) compared to the running `app_version()` on boot via
  the pure unit-tested `versionIncreased()` (numeric semver; a downgrade/no-change doesn't
  toast); a new **`"success"` toast tone** (`--status-done` green) carries "Updated to v<new>".
- **Docs:** CLAUDE.md "Builds & distribution" + README updated to **reverse the #62 note** and
  describe the deferred-key skeleton.

**Key files touched:** new `.github/workflows/release.yml`, `src/updater.ts`,
`src/components/Update/{UpdateIndicator.tsx,UpdateModal.tsx,Update.module.css}`; `package.json`,
`src-tauri/Cargo.toml`, `src-tauri/src/{lib.rs,commands.rs,store.rs}`,
`src-tauri/capabilities/default.json`, `src-tauri/tauri.conf.json`; `src/store.ts` (+ slice,
`last_version`, boot toast) + `src/store.test.ts`, `src/ipc.ts`, `src/App.tsx`,
`src/components/Sidebar/Sidebar.tsx`, `src/components/Toaster/*`, `src/types/index.ts`;
`CLAUDE.md`, `README.md`.

**Dependencies:** none — this is the **foundation** of the auto-update group; #191 (settings
Updates section), #192 (patch notes), and #193 (dev mock) all depend on it. Reference: git
`24791c4` (#15 add) / `11559ec`,`0e828c2` (#62 removal).

**Notes**

- **Autonomous refine (2026-06-26):** the user wasn't responding; decisions logged in
  `ASSUMPTIONS.md` — reuse #15's removed impl as the base, rebuilt richer; keys deferred →
  placeholder pubkey + `createUpdaterArtifacts` off (local unsigned builds keep working); the
  pipeline guards on **both** a version bump and the signing secret; a later "provide signing
  key" task only needs to generate the keypair, bake the real pubkey, flip
  `createUpdaterArtifacts`, and add the `TAURI_SIGNING_PRIVATE_KEY[_PASSWORD]` secrets — no
  other code change.
- **Inert today, mock-drivable:** `checkForUpdate` returns null (placeholder pubkey, no signed
  release) so the indicator stays hidden; #193's mock uses `setUpdateState` to exercise
  indicator → confirm → install/progress → error.
- **Runtime-unverified** in this loop: a full `npm run tauri build` release bundle (heavy +
  headless — `cargo build` already parses/validates the updater config via `tauri-build`, and
  `createUpdaterArtifacts` is off so the unsigned build is safe), plus the live indicator/modal
  render + real download/relaunch (no signed release exists — that's #193 / a real release).
  `npm run build`, `npm run lint`, `npm test` (262), `cargo build`, `cargo test` (83), clippy,
  `cargo fmt`, prettier all green.

---

### 191. [x] Settings → "Updates" section: check for updates + review what will be installed

**Status:** Done
**Depends on:** #190
**Created:** 2026-06-26

**Description**

Add a dedicated **"Updates"** section to the Settings modal — the review-and-install surface
the user opens "when they want to update, to see what will be installed". It gives #190's
auto-update machinery (the `update` store slice, `checkForUpdate`/`installUpdate`, the
freeze/progress/restart flow) a **manual, detailed home**: a "Check for updates" button, the
current vs. available version, and a slot for what's in the update — beyond #190's minimal
auto-detected "update available → confirm" path.

**What shipped** (commit `f697f6c`, 2026-06-26) — **frontend-only** (no Rust, no new updater
logic):

- **New `"updates"` Settings section** (`Settings.tsx`, Lucide `RefreshCw`) added to the
  `Section` type + `SECTIONS`, with its own pane: the **current version** (reusing the About
  `appVersion()` fetch); a **"Check for updates"** button → `checkForUpdate()` (spinner +
  "Checking…", disabled while checking/downloading); status feedback — `idle` → "You're up to
  date", `error` → `update.error`, `available` → the new version + a **labelled "What's new"
  slot** (`whatsNewSlot`, carrying `data-update-version` for #192 to fill) + an **"Update now &
  restart"** button → `installUpdate()`; `downloading` → an inline progress bar bound to
  `update.progress` (the #190 full-window freeze overlay still covers the app). Update actions
  are **immediate** (not draft-staged), like Data & About's actions.
- **Deep-link** from the #190 sidebar `UpdateIndicator`: `setSettingsOpen(open, section?)`
  gained an optional initial section stored in a new `settingsSection` field (cleared on close
  and on a plain gear open, so the gear still lands on Terminal); the mounted-only-while-open
  Settings modal seeds its `section` `useState` from it. The indicator now opens
  `setSettingsOpen(true, "updates")` (the richer review surface) instead of #190's bare confirm
  modal.
- **#190 reconciled, not duplicated:** #190's `UpdateModal` **confirm dialog** is now dormant
  (nothing calls `openUpdateConfirm`), but its **install overlay** (`downloading`) is still the
  reused freeze/progress/restart surface; `openUpdateConfirm`/`cancelUpdate` stay in the store
  for the #193 mock. No second competing confirm surface was built.
- **Naming gotcha handled:** the slice is read as `updateState` in `Settings.tsx` (the
  component already has a local `update(key, value)` draft helper that would shadow a slice
  named `update`).

**Key files touched:** `src/components/Settings/Settings.tsx` (+ `.module.css` pane styles —
status/error lines, `.whatsNew*` slot, `.updateProgress` bar, `.updateNow` CTA, `.spin`
keyframe), `src/store.ts` (`settingsSection` + `setSettingsOpen(open, section?)`) +
`src/store.test.ts` (deep-link test), `src/components/Update/UpdateIndicator.tsx` (deep-link
onClick).

**Dependencies:** #190 (needs its `update` slice, `checkForUpdate`/`installUpdate`, the
indicator, and the install flow). #192 (patch notes) renders into the "What's new" slot this
provides; #193 (mock) is how these panes are exercised before a real signed release.

**Notes**

- **Autonomous refine (2026-06-26):** the user wasn't responding; decisions logged in
  `ASSUMPTIONS.md` — the "alternative settings screen for updating" = a new section in the
  existing Settings modal (not a separate window); reuses #190 entirely (UI + deep-link only);
  the indicator deep-links here, making this the primary "review then install" surface; "what
  will be installed" is a labelled slot (content is #192); update actions are immediate.
- **Runtime-unverified** in this autonomous loop (no GUI session + no signed release): the live
  pane render and the actual check/install. All states are reachable via #193's `setUpdateState`;
  the wiring is type-checked, lint/format clean, and the deep-link is unit-tested.
  `npm run build` / `npm run lint` / `npm test` (263, +1) all green; no Rust changes.

---

### 192. [x] Patch notes: baked-in per-version JSON, release-carried notes, settings view

**Status:** Done
**Depends on:** #190, #191
**Created:** 2026-06-26

**Description**

Add **patch notes** to the app: a small per-version JSON authored in-repo, a settings view
that shows them, the key "smart" requirement — a way to read the notes of an update **that
isn't installed yet** — and a CI guard that notes were authored for each version bump. Sits on
top of #190 (updater skeleton + gated pipeline) and #191 (Settings → Updates pane with a
labelled "What's new" slot); this task fills that slot and wires the pipeline.

**What shipped** (commit `40487f0`, 2026-06-26) — **frontend + CI** (no Rust):

- **The "read not-yet-installed notes" solution:** the running (older) app on version X can't
  read version Y's baked JSON, so Y's notes ride **in the release** — the pipeline renders
  Y's `src/patchnotes/Y.json` → the GitHub release body, `tauri-action` writes it into
  `latest.json`'s `notes`, `check()` surfaces it as `update.body`, the store keeps it as a new
  `update.notes` field (#190 slice extended), and #191's "What's new" slot renders it as
  markdown — so the user reads the upcoming version's notes **before installing**.
- **Patch-notes data + loader:** one JSON file per version under `src/patchnotes/<version>.json`
  (`{version,date,changes:[{category,items[]}]}`, categories `feature`/`fix`/`improvement`/
  `other`; seeded `0.0.1.json`). A pure `src/patchnotes.ts` eager-loads them via
  `import.meta.glob`, normalizes best-effort, and exposes `allPatchnotes` (semver-desc) +
  `patchnotesFor`/`latestPatchnotes` + `patchnotesToMarkdown` (+ 6 unit tests). A new
  `PatchNotes` type in `src/types`.
- **Render:** a `components/PatchNotes/PatchNotes.tsx` renders grouped category headings +
  bullet lists, item text via the existing react-markdown + remark-gfm stack with the shared
  #182 external-link components (a `p`-unwrap for inline bullets — no new markdown dep). In
  #191's pane: the **available update's** `update.notes` renders under "What's new in
  v<newVersion>", and the **current** version's baked-in `patchnotesFor(appVer)` renders under
  "What's new in this version".
- **Pipeline** (`.github/workflows/release.yml` from #190): a **notes-up-to-date guard** — a
  `has_notes` output asserting `src/patchnotes/<version>.json` exists **and** its `version`
  matches the bumped config version (the `release` job now gates on `should_release &&
  has_notes && has_key`, else ends green) — plus **release-body generation** via a new
  `scripts/patchnotes-to-md.mjs` (version → markdown, mirroring `patchnotesToMarkdown`; flowed
  through a `$GITHUB_OUTPUT` heredoc into `releaseBody`). ESLint now treats `scripts/**/*.mjs`
  as Node.

**Key files touched:** new `src/patchnotes/0.0.1.json`, `src/patchnotes.ts` (+ `.test.ts`),
`src/components/PatchNotes/{PatchNotes.tsx,.module.css}`, `scripts/patchnotes-to-md.mjs`;
`src/types/index.ts` (`PatchNotes`), `src/store.ts` + `src/updater.ts` (`update.notes`),
`src/components/Settings/Settings.tsx` (+ `.module.css`, the #191 pane), `.github/workflows/release.yml`,
`eslint.config.js`, `CLAUDE.md`.

**Dependencies:** #190 (updater `body`/`update` slice/pipeline) + #191 (Updates pane + "What's
new" slot). #193 (mock) can set `update.notes` to exercise the slot before a real release.

**Notes**

- **Autonomous refine (2026-06-26):** the user wasn't responding; decisions logged in
  `ASSUMPTIONS.md` — smart solution = carry notes in the release (`latest.json` notes /
  `update.body`); one JSON file per version, normalized best-effort; render with the existing
  react-markdown stack; pipeline guards that the notes file exists + matches and generates the
  body from it; extend #190's `update` slice with `notes`.
- **Dual rendering source** kept in sync by mirroring the same category-label + heading/bullet
  shape: `patchnotesToMarkdown` (TS, in-app) and `scripts/patchnotes-to-md.mjs` (Node, release
  body — can't import TS).
- **Runtime-unverified** in this autonomous loop (no GUI session + no signed release): the live
  Updates-pane render and a real release's `update.body`. The pure loader/markdown is
  unit-tested (6 cases), the script runs locally (`node scripts/patchnotes-to-md.mjs 0.0.1`),
  and the workflow YAML parses with the 3-guard `if:`. `npm run build` / `npm run lint` /
  `npm test` (269, +6) all green; no Rust changes.

---

### 193. [x] Dev-only mock update — drive the update UI without a real release

**Status:** Done
**Depends on:** #190, #191, #192
**Created:** 2026-06-26

**Description**

Until a real signing key + published release exist, the in-app update UI (#190 indicator +
confirm/freeze/progress flow, #191 Settings "Updates" pane, #192 "what's new" notes) can't be
exercised — `checkForUpdate()` always returns "no update". Add a **dev-only mock** so a
developer can fake an available update in a dev run and watch the whole UI react end-to-end:
indicator appears, pane shows version + patch notes, "Update now" runs a simulated download
(progress bar + freeze overlay), and the post-update toast fires.

**What shipped** (commit `1f81eeb`, 2026-06-26) — **frontend-only, dev-gated** (no Rust):

- **Mock engine in `updater.ts`** (the module that holds the real `Update`): a module-level
  flag (`setMockUpdate`/`isMockUpdate`) makes `checkForUpdate` return fake data and
  `downloadAndRelaunch` run a `setInterval` 0→100 loop with **no** real `relaunch()`. So the
  same `installUpdate` flow (#190) drives both real and mock — it just checks `isMockUpdate()`
  after the await to fire the post-update toast instead of relaunching.
- **Store actions** `mockUpdate({version?,notes?})` (defaults `9.9.9` + a `SAMPLE_UPDATE_NOTES`
  markdown changelog, so it also exercises the #192 render; `notes:null` omits) and
  `clearUpdate()` drive the `update` slice + arm `updater.setMockUpdate`; `mockProgress` /
  `mockError` reuse the existing `setUpdateState`.
- **"Insert a command" = a dev `window` global:** new `src/devMock.ts` registers
  `window.__recue = { mockUpdate, mockProgress, mockError, clearUpdate }` (with a
  `declare global` augmentation); `main.tsx` imports it behind `if (import.meta.env.DEV)`. A
  convenience **"Simulate update (dev)"** button (`FlaskConical`) appears in the #191 pane,
  also `DEV`-gated.
- **Dev-only footprint verified:** Vite replaces `import.meta.env.DEV` with `false` in
  production, dead-code-eliminating `devMock.ts` + the `window.__recue` registration + the
  button — confirmed **0** occurrences of `__recue`/`registerDevMock`/"Simulate update" in
  `dist/`. The `mockUpdate`/`setMockUpdate` code stays in the prod bundle but is **inert**
  (only the stripped helper/button call it); the lone artifact is the ~200-char
  `SAMPLE_UPDATE_NOTES` dead string.

**Key files touched:** new `src/devMock.ts`; `src/updater.ts` (mock engine), `src/store.ts`
(`mockUpdate`/`clearUpdate` + `installUpdate` mock completion + `SAMPLE_UPDATE_NOTES`) +
`src/store.test.ts` (+1), `src/main.tsx` (dev-guard import), `src/components/Settings/Settings.tsx`
(dev button).

**Dependencies:** #190 (`update` slice/`updater.ts`/`installUpdate`/indicator), #191 (Updates
pane), #192 (`update.notes` + patch-notes render) — the mock drives every field all three
read; this introduced the codebase's first `import.meta.env.DEV` dev-only path.

**Notes**

- **Autonomous refine (2026-06-26):** the user wasn't responding; decisions logged in
  `ASSUMPTIONS.md` — "insert a command" = a dev-gated `window.__recue` console helper
  (primary) + a convenience button; simulated install (timer progress + toast, no real
  relaunch) behind a mock flag in `updater.ts` so the same `installUpdate` serves both; the
  mock sets `update.notes` (hence depending on #192).
- **Runtime-unverified** in this autonomous loop (no GUI session): the live `tauri dev`
  walkthrough (console `mockUpdate()` → indicator + pane + notes → "Update now" → animated
  progress under the freeze overlay → "Updated to v9.9.9" toast). The store mock actions +
  updater arming are unit-tested and prod tree-shaking is verified. `npm run build` /
  `npm run lint` / `npm test` (270, +1) all green; no Rust changes.

---

### 194. [x] Kanban: optional card checkbox — render plain `- bullet` lines as cards

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

The Kanban engine (`kanban.ts`) only treated a list item as a **card** when it had a checkbox
(`CARD_RE = /^- \[([ xX])\] ?(.*)$/`). A **plain `- bullet`** (no `[ ]`/`[x]`) matched nothing
and hit the catch-all, so it was **silently dropped** — the card vanished and a
parse→serialize round-trip **lost** it. Hand-authored Obsidian/markdown boards often use plain
bullets, so this made the board lossy. The fix makes the checkbox **optional**: a plain bullet
renders as a card and round-trips back unchanged as `- title`.

**What shipped** (commit `d8fd83b`, 2026-06-26) — **frontend-only** (no Rust):

- **Tri-state `Card.checked: boolean | null`** (was `boolean`): `null` = no checkbox
  (`- title`), `false` = `- [ ]`, `true` = `- [x]` — the minimal lossless model (chosen over a
  separate `hasCheckbox` flag).
- **Parse** (`parseBoard`): a new `PLAIN_CARD_RE = /^- (.*)$/` branch tried **after** `CARD_RE`
  (so `- [ ]`/`- [x]` still win) starts a card with `checked: null`; a bare `- ` → empty-title
  card; body continuation attaches as for checkbox cards.
- **Serialize** (`serializeBoard`): `null` → `- ${title}` (no bracket), `false`/`true` →
  `- [ ] `/`- [x] ` — so `- title` ⇄ `{checked:null}` is byte-stable.
- **Render** (`KanbanPanel.tsx`): both card render sites omit the `<Checkbox>` (whose prop is
  strictly `boolean`) when `checked === null`; the `cardDone` class already no-ops on falsy
  `null`. The grip/drag, title edit, and delete chrome are untouched, so a plain card stays
  draggable/editable/deletable.
- **Ops** (`kanbanOps.ts`): UI-created cards still default to `checked: false` (plain bullets
  originate from the markdown, not the UI); `toggleCard` guards `null` (stays `null`, never
  `!null === true` — defensive, since a null card renders no checkbox to toggle);
  move/update/delete preserve `checked` as-is (the `**Complete**` lane marker is a column
  property, not per-card, so a move never rewrites it).
- **+7 unit tests** across `kanban.test.ts` (plain parse, bodied plain bullet, byte-stable
  mixed round-trip incl. a bare `- `, null-model deep-equal) and `kanbanOps.test.ts` (newCard
  default, toggle-null no-op, move preserves null).

**Key files touched:** `src/components/Kanban/kanban.ts` (+ `.test.ts`),
`src/components/Kanban/kanbanOps.ts` (+ `.test.ts`), `src/components/Kanban/KanbanPanel.tsx`.

**Dependencies:** none — a self-contained engine + minimal-render change. Independent of the
"Clean up Kanban card UI" card (#195), which should account for the optional checkbox.

**Notes**

- **Autonomous refine (2026-06-26):** the user wasn't responding; decisions logged in
  `ASSUMPTIONS.md` — tri-state `boolean | null` (not a `hasCheckbox` flag); only `- ` bullets
  (`*`/`+`/numbered lists stay out); UI-created cards still default to a checkbox; no new UI to
  toggle a card's checkbox on/off.
- **Runtime-unverified** in this autonomous loop (no GUI session): the live render of a
  plain-bullet card and its drag/edit/delete. The fix's core — the parse/serialize round-trip
  that stops the card being dropped — is unit-tested (7 new cases); the render change is a
  minimal type-checked checkbox omission. `npm run build` / `npm run lint` / `npm test`
  (277, +7) all green; no Rust changes.

---

### 195. [x] Clean up Kanban card UI — hover-revealed actions, declutter the title row

**Status:** Done
**Depends on:** #194
**Created:** 2026-06-26

**Description**

The Kanban card (`KanbanPanel.tsx`) packed grip → checkbox → title → edit/delete buttons into
one inline `.cardTop` row; the action icons crowded the title and the card read as cramped.
Per web research (Trello / Linear / shadcn-kanban converge on hover/focus-revealed action
clusters + full-width titles), redesign for a cleaner look by repositioning the checkbox and
action icons.

**What shipped** (commit `358bbd7`, 2026-06-26) — **frontend-only, layout/CSS** (no behavior
change, no Rust):

- **The real problem turned out to be flex space, not visibility:** a prior refinement (#161)
  had *already* made the grip + actions hover/focus-revealed, but the `.cardActions` cluster
  still sat **in the flex flow**, reserving ~50px even while invisible, so the title never got
  that width. The fix moves `.cardActions` **out** of `.cardTop` to be a direct child of the
  `.card` article (absolutely positioned top-right), so the title's row is just
  `[grip] [checkbox?] [title]` and spans the full width.
- **CSS** (`KanbanPanel.module.css`): `.card { position: relative }`; `.cardActions` absolute
  top-right, `opacity:0` + `pointer-events:none` at rest, revealed on `.card:hover, .card:focus-within`
  (keyboard-reachable; the global reduced-motion killswitch drops the transition); a
  left→right card-colored **gradient backdrop** so a long title fades cleanly under the buttons,
  plus a `padding-right` buffer on the title (larger on the editing input so typed text clears
  the Done button). `pointer-events:none` at rest lets clicks/hover pass through to the title.
- **#194 null-checkbox path preserved:** the conditional `<Checkbox>` (omitted when
  `checked === null`) is unchanged, so a no-checkbox card renders flush-left with no empty gap.
- **Behavior fully intact:** toggle, click-to-edit, edit Done, delete, drag/reorder (incl. the
  `CardPreview` overlay, which already omits actions and shares `.cardTop`/`.cardTitle`), and
  body task-list checkboxes (#173) keep their exact handlers/markup; the dnd grip still holds
  `{...attributes}{...listeners}` (left as-is to avoid a hover layout-shift / dnd
  re-architecture).

**Key files touched:** `src/components/Kanban/KanbanPanel.tsx` (move `.cardActions` out of
`.cardTop`), `src/components/Kanban/KanbanPanel.module.css` (absolute reveal cluster, gradient,
title width/padding).

**Dependencies:** #194 (the redesign must render its optional no-checkbox card; building this
first would have conflicted on `KanbanPanel`'s checkbox render).

**Notes**

- **Autonomous refine (2026-06-26):** the user wasn't responding; decisions logged in
  `ASSUMPTIONS.md` — adopt the researched hover/focus-revealed top-right cluster + full-width
  title + quiet checkbox/grip; keyboard/touch fallback via `:focus-within` + click-to-edit (no
  hover-only dependency); layout-only, no dnd re-architecture or new card content. Sources:
  shadcn-ui Kanban templates, card-UI design examples, Kanban board UI system design.
- **Runtime-unverified** in this autonomous loop (no GUI session): the live resting card +
  hover/focus reveal + gradient fade. The change is pure layout/CSS, type-checks, lints, and
  leaves every handler/markup intact (277 tests still pass). `npm run build` / `npm run lint` /
  `npm test` (277) all green; no Rust changes.

---

### 196. [x] Worktree header: icon-only marker + an inline "new session" button like repos

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

In the sidebar tree a **worktree** (#74) renders as a sub-group header (`WorktreeHeader` in
`Sidebar.tsx`) nested under its parent repo. It showed a `GitBranch` icon **plus the literal
word "worktree"** and — unlike a **repo** header — had **no inline "+" new-session button**
(the repo header carries an always-visible `+` → `startRepoSession`; a worktree's create flow
was buried in its right-click menu). This task drops the word in favor of the icon alone and
gives the worktree header the same inline new-session button repos have, with items still
landing in that worktree.

**What shipped** (commit `b536354`, 2026-06-26) — **frontend-only** (no Rust):

- **Dropped the "worktree" text badge** (the `worktreeBadge` span); the existing `GitBranch`
  icon remains the marker (distinct from a repo's `Folder` icon #128) and went from
  `aria-hidden` to `role="img" aria-label="worktree"` so the meaning survives the word's
  removal; the absolute-path `title` stays.
- **Added an inline `+` new-session button** (reusing the repo header's `.plus` styling) →
  `spawnWorktreeSession(parent, branch)` (#166, the same action the worktree menu's "New
  session" uses, so a new agent reuses the app-managed worktree, ref-count++); native
  `disabled={!parent}` (greyed via a new `.plus:disabled`, `title="Worktree parent unknown"`)
  with a belt-and-suspenders guard; `onClick` `stopPropagation` so the click never opens the
  row's context menu / selection (or a future #197 click-to-filter handler).
- **Layout:** `.worktreeName` gains `flex: 1` so the row is `icon + branch-name(grow) + "+"`
  with the name truncating, mirroring `.repoTitle`; the dead `.worktreeBadge` rule removed.
  Compact-rail mode (icon only) and the right-click menu (New session / Views / Reveal / Copy /
  Pull / Close worktree) are unchanged.

**Key files touched:** `src/components/Sidebar/Sidebar.tsx` (`WorktreeHeader` markup),
`src/components/Sidebar/Sidebar.module.css` (`.worktreeName` flex, `.plus:disabled`, dropped
`.worktreeBadge`).

**Dependencies:** none — reuses shipped `spawnWorktreeSession` (#166), `ViewsMenu` (#164), and
the repo `+` pattern. Sibling worktree cards (#197 filter-on-click, #198 schedule-into-worktree,
#199 auto-delete guard) touch the same component but aren't prerequisites.

**Notes**

- **Autonomous refine (2026-06-26):** the user wasn't responding; decisions logged in
  `ASSUMPTIONS.md` — keep `GitBranch` (already distinguishes a worktree; `FolderGit2` noted as
  an alternative) + an accessible "worktree" label; the inline `+` mirrors the repo `+`
  (starts a session, other panel types stay in the right-click `ViewsMenu`); disabled when the
  parent repo is unknown.
- **Runtime-unverified** in this autonomous loop (no GUI session): the rendered header (icon +
  name + `+`, no badge) and that `+` spawns an agent nested under the same worktree. The change
  is small, mirrors the verified repo `+`, and reuses shipped actions. `npm run build` /
  `npm run lint` / `npm test` (277) all green; no Rust changes.

---

### 197. [x] Click a worktree in the sidebar to filter Overview to just that worktree

**Status:** Done
**Depends on:** #196
**Created:** 2026-06-26

**Description**

Clicking a **repo** name filters the Overview wall to that repo (`overviewRepoFilter`, #34),
but a **worktree** sub-group header wasn't clickable that way. This makes a worktree header
click filter Overview to only the items running/shown inside that worktree, mirroring the repo
filter.

**The core wrinkle:** the Overview filter matched on `effectiveRepo(s) === filter`, but a
worktree agent's `effectiveRepo` is its **parent** repo (#96) — so a worktree folder couldn't
be a filter target. The fix broadens the predicate to also match the actual folder.

**What shipped** (commit `a9bd2dc`, 2026-06-26) — **frontend-only** (no Rust):

- **Broadened filter predicate:** a new shared `sessionInFilter(session, filter)` in `paths.ts`
  (`effectiveRepo === filter || repoPath === filter`, + tests). `store.ts`'s `overviewClusters`
  was restructured to build `wtParent`/`clusterRepoOf` first, then apply a single
  `folderInFilter(folder)` (`!filter || folder === filter || clusterRepoOf(folder) === filter`)
  uniformly to agents, panels (`panelsByCluster`, keyed by folder), and schedules — so a
  worktree-folder filter shows just that worktree's agents + panels (clustered under the parent
  header) and excludes the parent's own direct items; a **repo** filter is byte-identical to
  before. `Overview.tsx`'s `shown` predicate was broadened the same way.
- **Clickable worktree name:** the `WorktreeHeader` name became a `<button>` →
  `setOverviewRepoFilter(path)` (the existing store action already toggles off if it's the
  active filter) + `setView("overview")`; a `.worktreeActive` style (accent-dim box + accent
  name) + `aria-pressed` marks the active-filter row. The existing "Show all" control clears it.
- **+5 unit tests** (worktree-filter `overviewClusterKeys` returns exactly the worktree's
  items; `sessionInFilter` truth table; repo-filter behavior unchanged).

**Key files touched:** `src/paths.ts` (+ `.test.ts`), `src/store.ts` (`overviewClusters`
restructure) + `src/store.test.ts`, `src/components/Overview/Overview.tsx`,
`src/components/Sidebar/Sidebar.tsx` (+ `.module.css`).

**Dependencies:** #196 (both edit `WorktreeHeader`; sequenced after the header redesign to
avoid conflicting edits; functionally independent otherwise). Reuses the #34 `overviewRepoFilter`
mechanism.

**Notes**

- **Autonomous refine (2026-06-26):** decisions in `ASSUMPTIONS.md` — broaden the predicate to
  `effectiveRepo === filter || repoPath === filter`; grouping unchanged (worktree items still
  render under the parent cluster header, now showing only that worktree).
- **Documented deviation:** the plan said the worktree click should *not* switch views (citing
  #79), but the **repo** name click — the thing the plan says to mirror — *does* `setView("overview")`
  (#79 governs item-row clicks, not the filter-header gesture). So the implementation mirrors the
  repo header exactly (`setOverviewRepoFilter(path)` + `setView("overview")`); no acceptance
  criterion mentions view-switching, and it's a one-line change if the other choice is preferred.
- **Runtime-unverified** in this autonomous loop (no GUI session): the live click → narrowed
  wall + active-row highlight. The filter math is unit-tested. `npm run build` / `npm run lint` /
  `npm test` (282, +5) all green; no Rust changes.

---

### 199. [x] Worktree auto-delete guard: count ALL item types, and run on every item close

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

A worktree (#74) is app-managed and should be removed the moment its last item is closed, but
never while any item still references it. The existing ref-counted cleanup
(`cleanupWorktreeIfEmpty`) **only counted agents** (`repoPath === dest && exitedCode === undefined`)
— the confirmed gap the card asked to verify: it ignored a worktree's **non-agent items**
(`overviewPanels[dest]` file/diff/terminal/kanban/filetree viewers #164) and **scheduled
sessions** (#198), so a worktree with a panel/schedule but no live agent could be deleted out
from under those items, and closing a non-agent item never triggered cleanup at all. This fixes
both halves.

**What shipped** (commit `536081e`, 2026-06-26) — **frontend-only** (no Rust):

- **Pure `worktreeHasItems(state, dest)` predicate** — true if any session (`repoPath === dest`,
  including an exited-but-still-shown agent with a Restart overlay), any non-empty
  `overviewPanels[dest]`, or any schedule (`cwd === dest`) references the worktree. Unit-tested
  across 6 combinations (empty / agent / panel-non-empty & empty / schedule / other-folder /
  mixed).
- **`cleanupWorktreeIfEmpty` rewritten** to use it (replacing the agent-only check); removal
  stays **non-forced** so a dirty worktree is kept + toasted (#74).
- **Guard runs on every close path:** `removeSession` (existing), plus now `removeOverviewPanel`
  and `cancelSchedule` (both no-op for a regular repo folder).
- **Parent-resolution fix (the key design call):** `git worktree remove` needs the **parent**,
  but the plan's own scenario (close the agent first, then the panel) leaves no session to derive
  it from. Added a module-level `worktreeParents` map (mirroring `intentionalKills`) that records
  `dest → parent` every time the guard runs (captured while an agent still exists) and clears it
  on successful removal; `worktreeParentOf` falls back to it when no session remains. In-memory
  (persisting it would need Rust, out of scope).

**Key files touched:** `src/store.ts` (`worktreeHasItems`, `cleanupWorktreeIfEmpty`,
`worktreeParents`/`worktreeParentOf`, new guard calls), `src/store.test.ts` (+6).

**Dependencies:** none — foundational. #198 (schedule→worktree cancel cleanup) and #200
(non-blocking removal) build on it.

**Notes**

- **Autonomous refine (2026-06-26):** the card asked to confirm the guard covered all item types
  — it didn't (agents only), so this is authored as a **fix**. Decisions in `ASSUMPTIONS.md` —
  count exited-but-shown agents (a crashed agent's Restart row keeps the worktree); trigger on
  every close path; pure predicate for testability.
- **Two documented limitations, both fail-safe (worktree kept, never wrong-deleted):** (1) a
  clean-exit of a worktree agent (`forgetExitedSession`) still doesn't trigger cleanup (outside
  the plan's triggers, pre-existing); (2) an orphan worktree (panel but no agent) surviving an
  app **restart** can't auto-resolve its parent (the in-memory map is empty) and lingers until
  manually cleaned — persisting the map would need Rust.
- **Runtime-unverified** in this autonomous loop (no GUI session): the live close-order flows.
  The pure predicate is unit-tested across all item-type combinations and the agent-first parent
  resolution is traced in review. `npm run build` / `npm run lint` / `npm test` (288, +6) all
  green; no Rust changes.

---

### 198. [x] Schedule a session into a worktree (create at fire time, clean up on cancel)

**Status:** Done
**Depends on:** #199
**Created:** 2026-06-26

**Description**

A scheduled session (#93/#94/#125) launches an agent later from the `NewSessionModal` in
schedule mode, and the branch step already supports creating a new branch at fire time (#125),
but there was **no worktree option** in schedule mode — you couldn't schedule an agent to launch
inside an isolated worktree (#74). The immediate new-session path does this via ⌘⏎ in the branch
step, but that's explicitly new-session-only. This closes the gap: schedule **into a worktree**,
created when the schedule fires, cleaned up on cancel if nothing else remains.

**What shipped** (commit `718fdff`, 2026-06-26) — **full-stack** (Rust + frontend):

- **Record the intent:** a serde-default `worktree: bool` on `ScheduledSession` (`store.rs`),
  threaded through `create_schedule` (+ param), the IPC, TS types, and `store.ts scheduleSession`.
  `update_schedule` edits only prompt/name/at, so it preserves `worktree`/`branch`/`create_branch`
  (a panel edit doesn't drop the intent).
- **Modal UX:** an explicit **"Start in an isolated worktree"** `Checkbox` in the schedule
  branch step (git folders only — a worktree always needs a branch), composing with "+ add
  branch"; `submitSchedule` passes the chosen branch + `worktree`. (Chose the explicit toggle
  over ⌘⏎ parity, since a scheduled flow fires later with no live keypress — clearer than a
  hidden chord; ⌘⏎ parity skipped to keep branch-step nav untouched.)
- **Fire time:** `fire_due_schedules` gained `prepare_worktree_for_schedule` — when `worktree`
  is set it creates the app-managed worktree (`git::worktree_add` for an existing branch, reusing
  the folder if present, or `worktree_add_new_branch` composing with `create_branch`) and spawns
  the pre-seeded agent **there** with `worktree_parent = repo` (so it nests under the parent
  repo); `touch_recent` records the repo. A worktree-creation failure emits `schedule://error`
  (no in-folder fallback — there's no worktree to spawn into).
- **Cancel cleanup:** reuses #199's broadened `cleanupWorktreeIfEmpty` (already wired into
  `cancelSchedule`). A pending worktree schedule's `cwd` is the **repo** and the worktree doesn't
  exist until fire time, so cancelling it is a clean no-op (nothing to orphan); a fired one is a
  live worktree agent cleaned by `removeSession`'s guard — so cancelling never orphans a worktree
  by construction (no new `cancelSchedule` code needed). A read-only "worktree" badge surfaces
  the intent in `ScheduledPanel`.

**Key files touched:** `src-tauri/src/store.rs` (`worktree` field + round-trip test),
`src-tauri/src/commands.rs` (`create_schedule` param + `fire_due_schedules` +
`prepare_worktree_for_schedule`); `src/types/index.ts`, `src/ipc.ts`, `src/store.ts`,
`src/components/NewSessionModal/NewSessionModal.tsx` (+ `.module.css`),
`src/components/ScheduledPanel/ScheduledPanel.tsx` (+ `.module.css`).

**Dependencies:** #199 (the all-item-types worktree-empty guard for correct cancel-cleanup);
builds on shipped schedule (#93/#125) + worktree (#74/#124) machinery.

**Notes**

- **Autonomous refine (2026-06-26):** decisions in `ASSUMPTIONS.md` — explicit toggle (not the
  ⌘⏎ chord) since the flow fires later; worktree created at fire time (like #125's deferred
  branch creation); cancel cleanup reuses #199's guard.
- **Runtime-unverified** in this autonomous loop (no GUI session): the live fire-time worktree
  creation + the scheduled worktree agent nesting under its repo (the `fire_due_schedules`
  Tauri-poll path needs an `AppHandle`, not unit-testable). Mitigations: the `worktree` round-trip
  is unit-tested and the `worktree_add[_new_branch]` git primitives have their own tests.
  `npm run build` / `npm run lint` / `npm test` (288), `cargo test` (83), clippy, fmt, prettier
  all green.

---

### 200. [x] Worktree removal must not freeze the UI — run `git worktree remove` off the main thread

**Status:** Done
**Depends on:** #199
**Created:** 2026-06-26

**Description**

When the last item in a worktree closes, it's deleted via the Rust `remove_worktree` command →
`git::worktree_remove` (a filesystem delete of potentially thousands of files — `node_modules`,
build output). That command was a **synchronous** `#[tauri::command]`, which in Tauri v2 runs
on the **main (webview) thread** — so the FS delete **froze the whole UI** until it finished.
This makes worktree deletion non-blocking so the app stays responsive.

**What shipped** (commit `907afdf`, 2026-06-26) — **backend threading + frontend fire-and-forget**:

- **Root-cause fix (backend):** `remove_worktree` is now an **`async`** command (the codebase's
  first) that runs `git::worktree_remove` via **`tauri::async_runtime::spawn_blocking`** and
  awaits it — moving the command off the main thread (async runtime) and the blocking `git`
  shell-out onto a dedicated blocking pool so it can't starve the runtime. The `force`/dirty
  semantics + typed `SessionError::Git` mapping are unchanged (the join error maps to
  `SessionError::Io`); `git.rs worktree_remove` is untouched.
- **Frontend already non-blocking per-item (#199):** the three close handlers update store
  state first and fire `cleanupWorktreeIfEmpty` via `void`, so the item vanishes instantly — the
  freeze was never the `void`, it was the synchronous backend command, which is what the async
  change actually fixes. For consistency, the two **bulk** paths (`killAgentsInRepo`, the
  close-all/forget-folder loop) were also converted from `await` to fire-and-forget `void` so a
  bulk action over a huge worktree returns + toasts immediately.
- **Unchanged:** `cleanupWorktreeIfEmpty`'s non-forced removal (dirty-kept guard) + its "kept —
  dirty" toast, the #199 ref-counting/trigger logic, and the `ipc.removeWorktree` wrapper.

**Key files touched:** `src-tauri/src/commands.rs` (`remove_worktree` → async + `spawn_blocking`),
`src/store.ts` (two bulk awaits → `void`).

**Dependencies:** #199 (both touch the worktree-cleanup path; sequenced after the corrected
guard so this builds on the right trigger logic).

**Notes**

- **Autonomous refine (2026-06-26):** decisions in `ASSUMPTIONS.md` — root cause is the sync
  command on the main thread; fix = `async` + `spawn_blocking`; frontend cleanup fire-and-forget
  so the item removes instantly and the dir deletes in the background (dirty-kept toast still
  fires).
- **Runtime-unverified** in this autonomous loop (no GUI session): the live "delete a large
  worktree without freezing" behavior. The change is a textbook Tauri `async` + `spawn_blocking`
  move and the #199 trigger logic is untouched. `npm run build` / `npm run lint` / `npm test`
  (288), `cargo build`, `cargo test` (83), clippy, fmt, prettier all green.

---

### 201. [x] Folder/worktree context menu: collapse the two "New session" items into one

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

The sidebar **repo (folder) context menu** showed **two** new-session actions: a top-level
"New session" (`startRepoSession`, #127 — branch-aware, mirrors the inline `+`) and "New
session here" as the first item of the shared `ViewsMenu` (`spawnSession`, #177 — instant spawn
on the current branch). The same duplication existed in the **worktree header menu**
(`spawnWorktreeSession` top-level + `ViewsMenu`'s "New session here"). This collapses each menu
to a single, unambiguous "New session".

**What shipped** (commit `5868f2f`, 2026-06-26) — **frontend-only** (no Rust):

- **One prop, two call sites:** `ViewsMenu` gained `includeNewSession?: boolean` (default
  `true`); the "New session here" button + its trailing separator are wrapped in a fragment
  gated on it. The **repo context menu** and the **worktree header menu** — both already
  rendering their own top-level "New session" — pass `includeNewSession={false}`, so only the
  top-level item survives in each (repo: `startRepoSession`; worktree: `spawnWorktreeSession`).
- **Standalone popovers keep it:** the shared `ViewsPopover` (used by `WorktreeViewsBadge` #164
  **and** `OpenViewButton` #165/#177 — a third `ViewsMenu` render beyond the two the card named)
  stays on the default `true`, since neither has a separate top-level new-session action; "New
  session here" remains their sole new-session affordance.
- No behavior change to the surviving "New session" actions or the view items
  (file/diff/terminal/kanban/filetree) — only the leading button + separator are conditionally
  rendered.

**Key files touched:** `src/components/ViewsMenu/ViewsMenu.tsx` (the `includeNewSession` prop
gate), `src/components/Sidebar/Sidebar.tsx` (repo context menu + `WorktreeHeader` pass
`includeNewSession={false}`).

**Dependencies:** none — a local `ViewsMenu` prop + two call sites.

**Notes**

- **Autonomous refine (2026-06-26):** decisions in `ASSUMPTIONS.md` — keep the top-level "New
  session" and suppress `ViewsMenu`'s "New session here" only in menus that already have one;
  applied to the worktree header menu too (the card named only the "folder" menu) for
  consistency; the badge/open-view popovers keep theirs.
- **Runtime-unverified** in this autonomous loop (no GUI session): the visual "exactly one New
  session per context menu" check. It's a pure conditional-render prop gate. `npm run build` /
  `npm run lint` / `npm test` (288) all green; no Rust changes.

---

### 202. [x] File-tree search: filename + content matches with inline snippet preview, in-panel

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

The file-tree panel (the lazy `list_dir` tree #167) had **no search**. This adds a search input
**inside the panel** (no separate panel): as the user types, matching files appear — matched by
**filename** and by **file contents** — with content hits shown as an inline snippet "mini
viewer" and per-result **Reveal in tree** / **Open** actions. A lightweight in-app "find in
files."

**What shipped** (commit `bdfe42a`, 2026-06-26) — **full-stack** (Rust + frontend + a CLAUDE.md
line):

- **New backend content-search command** `search_file_contents(repo, query, limit)` (`files.rs`)
  + `ContentMatch { path, line, snippet }` / `ContentSearchResult { matches, truncated }`:
  mirrors `search_files`' sorted/deterministic walk (same `SKIP_DIRS` incl. `.git`, `SKIP_EXTS`,
  path-confinement) but reads contents, with content-specific bounds — a **2 MB per-file size
  cap** (`MAX_CONTENT_SEARCH_BYTES`, tighter than the viewer's 5 MB since search is hot), a
  **3-matches-per-file cap**, the total `limit`, and a `truncated` flag set when any cap is hit
  (no silent truncation, per #179). Non-UTF-8 files are skipped; `make_snippet` is char-based
  (panic-safe) and windows long lines (>200 chars) around the match with `…`. 4 Rust unit tests.
- **Command + IPC:** `search_file_contents` Tauri command (clamped limit) registered in
  `lib.rs`; `searchFileContents` wrapper + `ContentMatch`/`ContentSearchResult` types in
  `ipc.ts` (beside `DirEntry`).
- **In-panel search UI** (`FileTree.tsx` + `.module.css`): a debounced (200 ms) toolbar input;
  a non-empty query replaces the tree with a results view (latest-wins cancel guard). **Files**
  (filename, `searchFiles`) and **In files** (content) searches run **in parallel**, rendering
  as each resolves. Content hits show `path:line` + a mono snippet with the match
  `<mark>`-highlighted (case-insensitive re-find), a result count, per-group "more not shown"
  cap notes, and "No matches."/"Searching…" states.
- **Per-result actions:** **Reveal in tree** (`revealInTree` — lazy-`listDir`s every ancestor
  level so the row mounts, expands them, exits results, scrolls the row in + flashes a highlight
  — a new in-panel expand-to-path, distinct from the OS `revealPath` #130) and **Open**
  (row-click → `openFileFromTree`, the same path a tree file-click uses).

**Key files touched:** `src-tauri/src/files.rs` (+ `search_file_contents`, structs, 4 tests),
`src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`; `src/ipc.ts`,
`src/components/FileTree/FileTree.tsx` (+ `.module.css`); `CLAUDE.md`.

**Dependencies:** none — reuses the `files.rs` walk patterns, the lazy tree (#167), and existing
file-open actions.

**Notes**

- **Autonomous refine (2026-06-26):** decisions in `ASSUMPTIONS.md` — a new `search_file_contents`
  command (content search was absent); plain case-insensitive substring (no regex, parity with
  `search_files`); in-panel tree↔results toggle; Open reuses the existing file-open action;
  Reveal is a new in-tree expand-to-path. Documented sub-decisions: no ±1 context lines (cleaner
  highlight, smaller payload); content "Open" can't jump to the matched line (the viewer has no
  line-jump API — the `:line` is shown for reference); filename results display-capped at 100.
- **Runtime-unverified** in this autonomous loop (no GUI session): the live typing →
  dual-results → reveal/open flow. The backend walk + snippet windowing are unit-tested (87 Rust
  tests, +4) and the UI reuses the established lazy-tree + file-open machinery. `npm run build` /
  `npm run lint` / `npm test` (288), `cargo test` (87), clippy, fmt, prettier all green.

---

### 203. [x] Restyle the sidebar-footer update indicator: inset, slimmer, less prominent

**Status:** Done
**Depends on:** none
**Created:** 2026-06-27

**Description**

The in-app **update indicator** chip in the sidebar footer (#190) read as a primary
call-to-action — a full-width box with a solid accent border, an accent-tinted fill, a 15px
icon, and a stacked two-line label, flooding to a solid accent fill on hover. For something
that is *available-but-optional* (and inert until a signed release exists) that over-emphasized.
This is a **pure visual restyle** of one shipped component — no behavior, store, or IPC changes
— making it **inset, smaller, thinner, slicker, and less prominent**: a quiet, tasteful hint
rather than a banner.

**What shipped** (commit `be68068`, 2026-06-27) — frontend-only, two files:

- **`Update.module.css` `.indicator`:** dropped `width: 100%` (the sidebar is a column flex, so
  it no longer stretches edge-to-edge); added `margin: 0 var(--space-8) var(--space-8)` so it is
  **inset** from the sidebar's left/right borders, aligned with the footer's `0 var(--space-8)`
  content inset directly below it; reduced padding to `var(--space-4) var(--space-8)` and `gap`
  to `var(--space-6)`; swapped `border: 1px solid var(--accent)` → `1px solid
  var(--border-hairline)`; removed the `background: var(--accent-dim)` fill (now transparent).
- **Hover de-emphasized:** `.indicator:hover` → subtle `var(--bg-hover)` + `var(--text-primary)`
  (no accent flood). The `.indicator:hover .indicatorIcon { color: inherit }` and version
  `color: inherit` rules were removed so the **accent stays on the icon** through hover — the
  icon is the only accent touch.
- **Single-line label** (the main "thinner" move): `.indicatorText` is now a baseline-aligned
  **row** (`gap: var(--space-4)`); the title keeps `--fs-meta-sm` + ellipsis truncation, the
  version is mono `--fs-meta-xs` `--text-secondary` with `flex-shrink: 0` so the title truncates
  first.
- **Smaller icon:** the `Download` icon shrank to `size={13}` in `UpdateIndicator.tsx`.
- **Collapsed rail:** a new `.indicatorCollapsed { justify-content: center }` applied via the
  existing `collapsed` flag so the icon-only rail state stays centered and tidy with the new
  margins; text stays hidden as before.
- **Error variant restyled to match** for consistency: same slim/inset/single-line shape;
  `.indicatorError` keeps `border-color: var(--status-error)` (a thin on-system red hairline —
  there is no error-dim token and CLAUDE.md forbids off-system colors), transparent bg, subtle
  hover.

Behavior is unchanged: same `onClick` (open Settings → Updates), `title`/`aria-label`, and
visibility conditions (hidden when idle/checking/downloading; shown on `available`/`error`).

**Key files touched:** `src/components/Update/Update.module.css`,
`src/components/Update/UpdateIndicator.tsx`.

**Dependencies:** none — a pure restyle of the shipped #190 component.

**Notes**

- **Autonomous refine (2026-06-27):** per the standing `ASSUMPTIONS.md` directive (2026-06-26)
  the design decisions were made autonomously (logged in `ASSUMPTIONS.md` under TASK-203): 8px
  side/bottom margin tying the chip to the footer below it; single-line label as the primary
  "thinner" move; hairline border + transparent fill with accent reserved to the icon as the
  "less-prominent/slicker" treatment; error variant restyled to match. The error-border kept
  `var(--status-error)` rather than a bespoke error-dim rgba (no such token; on-system only).
- **Runtime-unverified** in this autonomous loop: the dev-mock (#193, `setUpdateState`) eyeball
  of the `available`/`error` states in the expanded sidebar and collapsed rail can't run
  headless. The change is a pure CSS/markup restyle fully covered by `npm run build`, `npm run
  lint`, and `prettier --check` on both touched files (all green; the pre-existing
  `markdownCheckboxes.tsx` Prettier warning is unrelated).

---

### 204. [x] Schedule modal: replace the worktree checkbox with the ⌘⏎ button/keybind pattern

**Status:** Done
**Depends on:** none
**Created:** 2026-06-27

**Description**

The new-session and schedule-session flows are the **same component**
(`NewSessionModal.tsx`, toggled by `scheduleMode`) but expressed the "start in an isolated git
**worktree**" choice two different ways: new-session mode used a secondary **"Worktree ⌘⏎"**
button + ⌘⏎/Ctrl+⏎ keybind on the branch step (#74/#124/#180), while schedule mode (#198) used a
lone **"Start in an isolated worktree" checkbox** on the schedule step — an inconsistent UX
asking for the same thing two ways. This task makes the schedule flow use the **same ⌘⏎ keybind
+ button pattern**, replacing the checkbox so both modes share one learnable affordance.
**Frontend-only** — the backend `scheduleSession(..., useWorktree)` path (#198) already accepts
the flag; only how the flag is collected in the modal changed.

**What shipped** (commit `6ceb924`, 2026-06-27) — one component + its CSS module:

- **Removed the checkbox + its state:** deleted the schedule-step `Checkbox` block and its
  `.scheduleWorktree` wrapper, the `worktree`/`setWorktree` `useState` + its reset in the
  modal-reset effect, the now-dead `.scheduleWorktree` class in `NewSessionModal.module.css`,
  and the now-unused `Checkbox` import (sole use).
- **`submitSchedule()` → `submitSchedule(asWorktree: boolean)`** computing
  `useWorktree = asWorktree && folderIsGit` — mirroring the branch step's `create()` vs
  `createWorktree()` split and avoiding a setState-before-submit race. All branch-arg logic is
  preserved, so `scheduleSession`'s args are identical to what the checkbox produced.
- **Worktree affordance placed on the schedule step (the final action step), next to
  "Schedule"** — not the schedule flow's branch step — because the pattern copied is "the
  worktree variant of the *primary action* button," and the schedule flow's primary action is
  Schedule. The action row now mirrors the branch step: Cancel → (git folders only) **"Worktree
  ⌘⏎"** (`styles.cancel`, `onClick → submitSchedule(true)`, disabled on `!cwd || busy ||
  !fireAt`, title "Schedule into an isolated git worktree") → primary **"Schedule ⏎"**
  (`type="submit"` → form onSubmit → `submitSchedule(false)`).
- **⌘⏎ / Ctrl+⏎ keybind** added at the **form level** in `onTrapKeyDown` (gated on
  `step === "schedule"`): preventDefault + `submitSchedule(true)`, catching the combo from any
  schedule-step field via bubbling. Plain ⏎ still schedules normally, plain Enter still inserts
  a newline in the `SkillAutocomplete` prompt textarea, and an open skill menu still intercepts
  Enter/Escape to drive itself (#114) so the keybind only fires with the menu closed.
- **Non-git folders:** `folderIsGit` false → no worktree button, and a ⌘⏎ there resolves
  `useWorktree` to false → schedules normally.

Backend, `scheduleSession` / `create_schedule` / `ScheduledSession`, and `ScheduledPanel` (its
read-only "worktree" badge reads `schedule.worktree`) are untouched.

**Key files touched:** `src/components/NewSessionModal/NewSessionModal.tsx`,
`src/components/NewSessionModal/NewSessionModal.module.css`.

**Dependencies:** none — pure frontend refactor over the existing #74 worktree button and #198
schedule-worktree path.

**Notes**

- **Autonomous refine (2026-06-27):** decisions logged in `ASSUMPTIONS.md` under TASK-204 —
  worktree button on the schedule step (final action) rather than the branch step; ⌘⏎ active on
  the whole schedule step with plain ⏎ preserved for normal-schedule and newline-in-prompt; the
  `submitSchedule(asWorktree)` param chosen over a button-toggled `worktree` state to mirror the
  branch step's `create()`/`createWorktree()` split.
- **Runtime-unverified** in this headless loop: the interactive "manually exercise both buttons
  + the keybind and confirm the ScheduledPanel worktree badge" clause. The worktree-flag wiring
  is covered by the type-check and matches the pre-existing #198 `scheduleSession(...,
  useWorktree)` path. `npm run build`, `npm run lint`, `prettier --check` (touched files), and
  `npm test` (288 passing) all green.

---

### 205. [x] Canvas tab bar: turn + into a "New tab" dropdown; move the distribute control to the right

**Status:** Done
**Depends on:** none
**Created:** 2026-06-27

**Description**

The Canvas tab strip (`CanvasTabs.tsx`) crowded several icon-buttons together at the left right
after the tabs: a `+` (add empty tab), a distribute-evenly button (#186), and a Templates ▾
dropdown (#117). This task **declutters and reorganizes** that toolbar — turning the `+` into a
small dropdown offering the two ways to create a tab, and moving the distribute control to the
right side of the bar so the left stays focused on tabs + creation. **Frontend-only** UI reorg
of one component (+ its CSS); no store/backend change and no change to what the underlying
actions *do* — only *where* and *how* they're triggered.

**What shipped** (commit `54d1083`, 2026-06-27):

- **Factored the #117 Templates-menu mechanics** (open/anchor/outside-click/Escape) into a
  reusable `useDropdownMenu()` hook returning `{open, menuPos, wrapRef, btnRef, toggle, close}`,
  and gave the strip **two independent instances** — `addMenu` and `templatesMenu` — so they
  don't fight over open state.
- **`+` is now a dropdown** (Plus + ChevronDown trigger, `aria-haspopup="menu"`) with **New
  tab** (`addCanvas`) and **New tab from template…** (`openTemplateUse`, disabled when
  `!hasTemplates`). The template item **moved out of** the Templates ▾ menu so it lives in
  exactly one place (no duplication).
- **Templates ▾ trimmed to template management:** New template… / Save current canvas as
  template… (disabled when `!canSaveAsTemplate`) / Manage templates…
- **Distribute (`Grid2x2`) moved to the far right:** rendered as the **last** child of
  `.tabStrip` with a new `.tabDistribute` class adding `margin-left: auto`. Its
  `equalizeCanvas()` action, `disabled={!canEqualize}` gating (`<2` panels), tooltip, and
  aria-label are unchanged.
- **CSS:** renamed the shared dropdown classes `.templatesWrap/.templatesMenu/.templatesItem` →
  neutral `.menuWrap/.menu/.menuItem` (now used by both dropdowns), preserving their
  `position: fixed` so they escape the strip's `overflow-x` clip (#129), and added
  `.tabDistribute`.

The `Tab` component + its DnD/tear-off and all store actions are untouched.

**Key files touched:** `src/components/Canvas/CanvasTabs.tsx`,
`src/components/Canvas/Canvas.module.css`.

**Dependencies:** none — pure UI reorg over shipped code (#58 tabs, #117/#118 templates, #186
distribute). Forward ref: the "New tab" dropdown item is the natural place for TASK-206's ⌘T
hint (which depends on this).

**Notes**

- **Autonomous refine (2026-06-27):** decisions logged in `ASSUMPTIONS.md` under TASK-205 — the
  `+` dropdown holds the two tab-creation items only; the Templates ▾ menu is kept for template
  management (rejected folding everything into `+` — "Manage templates…" under an add affordance
  is semantically off and exceeds the card's ask); "New tab from template…" relocates into the
  `+` dropdown (single home); distribute moves right via `margin-left: auto`.
- **Runtime-unverified** in this headless loop: the interactive eyeball (both dropdowns open
  below their trigger without clipping, close on outside-click/Escape, the right-aligned
  distribute survives many-tab horizontal scroll). The reorg is pure markup/CSS over unchanged
  store actions. `npm run build`, `npm run lint`, `prettier --check` (touched files), and
  `npm test` (288 passing) all green.

---

### 206. [x] Add a ⌘T keybind to create a new Canvas tab, and surface it in the UI

**Status:** Done
**Depends on:** #205
**Created:** 2026-06-27

**Description**

There was no keyboard shortcut to create a new Canvas tab — only clicking the `+` in the tab
strip. This binds **⌘T / Ctrl+T** to "new Canvas tab" and surfaces the `⌘T` hint where the user
creates tabs (the `+` dropdown's "New tab" item from #205), so the shortcut is discoverable.
The app's global shortcuts live in `useKeyboardNav.ts` (a single capture-phase `keydown`
listener on `window`, so ⌘-combos are intercepted before xterm forwards them to a focused PTY);
⌘T was unused.

**What shipped** (commit `ed1d95c`, 2026-06-27):

- **`useKeyboardNav.ts`:** added a `(metaKey||ctrlKey) && !shift && !alt && key==="t"` handler
  (after the ⌘K block) that `preventDefault()` + `stopPropagation()`s and — **main window**,
  with neither `createPanelOpen` nor `newSessionOpen` — calls `setView("canvas")` then
  `addCanvas()`. ⌘T is a **create** action available from anywhere in the main window (like
  ⌘N/⌘K), switching to Canvas so the new tab is actually seen (rather than a Canvas-view-only
  scoping like ⌘1–9, which would dead-end from Overview); inert while the new-session/
  create-panel modals are open; swallowed (no webview/PTY side effect) when a terminal is
  focused. The top-of-file shortcut legend gained the ⌘T line; ⌘T confirmed unclaimed.
- **`CanvasTabs.tsx`:** added a right-aligned `<kbd className={styles.menuKbd}>⌘T</kbd>` to the
  `+` dropdown's **New tab** item, and updated the `+` trigger `title`/`aria-label` to "New tab
  (⌘T)".
- **`Canvas.module.css`:** made `.menuItem` a `space-between` flex row (so a trailing kbd aligns
  right; label-only items unaffected) and added a muted-mono `.menuKbd`.

**Key files touched:** `src/useKeyboardNav.ts`, `src/components/Canvas/CanvasTabs.tsx`,
`src/components/Canvas/Canvas.module.css`.

**Dependencies:** **#205** — the `+` dropdown's "New tab" item (introduced by #205) is the home
for the ⌘T hint. *Builds on* #205's reworked dropdown (per the iteration-task-dependency rule —
not a cycle).

**Notes**

- **Autonomous refine (2026-06-27):** decisions logged in `ASSUMPTIONS.md` under TASK-206 — ⌘T
  (conventional "new tab", unused here) as a global create action that switches to Canvas;
  surfaced on the `+` dropdown's "New tab" item → depends on #205.
- **Runtime-unverified** in this headless loop: the interactive eyeball (⌘T from Overview/Canvas
  opens an active tab, inert under modals, never reaches a focused terminal, hint visible). The
  handler mirrors the existing ⌘K guard and the swallow (preventDefault + capture-phase
  stopPropagation) is identical to the other ⌘-combos. `npm run build`, `npm run lint`,
  `prettier --check` (touched files), and `npm test` (288 passing) all pass.

---

### 207. [x] Sidebar click in Canvas mode: jump to Overview when the item isn't in the canvas

**Status:** Done
**Depends on:** none
**Created:** 2026-06-27

**Description**

Clicking a sidebar row routes through the store action `selectItem` (#79 "select/jump in the
current view"). In Canvas view it looked for the item as a leaf in the **active** canvas tab and
jumped to that panel if found; **if not found it was a dead end** — `set({ selectedId: null })`
+ a *"Item not present in canvas — drag to add"* toast. Since Overview renders **every** sidebar
item as a column (agents and non-agent panels and pending schedules, #174), this changes the
not-present case to **switch to Overview and select/jump to that item there** — the user is
taken to the thing they clicked instead of a toast.

**What shipped** (commit `af627f7`, 2026-06-27) — a one-line branch swap in a pure store action:

- **`src/store.ts` `selectItem`:** the not-present branch now does `set({ view: "overview",
  selectedId: item.id })` instead of `set({ selectedId: null })` + the *"not present in canvas"*
  `pushToast`. The present-in-active-tab jump (`set({ selectedId, activeLeafId })`) and the
  non-canvas (Overview) branch are unchanged; the inline comment was updated to describe the new
  Canvas behavior.
- **Generalized to all item kinds** (the action is generic over `SidebarItem`), so it covers
  agents and non-agent items (files/diffs/terminals/kanban/schedules) alike — Overview has a
  column for each (#174). This **intentionally reverses #79's "never auto-switch
  Overview↔Canvas" rule for the not-present case only** (the present case still never switches).
- `openSessionInCanvas` (#153, the agent-row context-menu cross-tab "Open in canvas" path) is
  untouched and remains the way to bring an agent into a canvas across tabs. No test asserted the
  old toast/deselect, so none needed updating.

**Key files touched:** `src/store.ts` (`selectItem`).

**Dependencies:** none — independent of #205/#206; a self-contained change to one store branch.

**Notes**

- **Autonomous refine (2026-06-27):** decisions logged in `ASSUMPTIONS.md` under TASK-207 —
  generalized from "agent" to all item kinds (Overview has a column for each, #174); "present in
  canvas" = the **active** tab (selectItem's existing scope; cross-tab jumps stay with
  `openSessionInCanvas` #153); no toast on the switch; reverses #79's no-auto-switch rule for the
  not-present case only.
- **Runtime-unverified** in this headless loop: the interactive eyeball (Canvas click on a
  present item still jumps to its panel; a not-present item switches to Overview and scrolls its
  column in; the Overview click path unchanged). The change is a one-line branch swap in a pure
  store action. `npm run build`, `npm run lint`, `prettier --check src/store.ts`, and `npm test`
  (288 passing) all pass.

---

### 208. [x] Rewrite the v0.0.1 patch notes to introduce the app as the first release

**Status:** Done
**Depends on:** none
**Created:** 2026-06-27

**Description**

The patch notes for the current version live at `src/patchnotes/0.0.1.json` (the #192 patch-notes
system, rendered in **Settings → Updates → "What's new"** and used to generate the GitHub release
body). They read like an **internal changelog** — enumerating recently implemented features. For
a **0.0.1 first release** a brand-new user has no prior version to diff against, so the notes
should **introduce what ReCue is** and frame this as the initial release, presenting the core
capabilities as a product pitch rather than a task-by-task changelog. **Content-only** edit of
one JSON file — no code/pipeline change.

**What shipped** (commit `b5a1ef7`, 2026-06-27):

- Replaced `src/patchnotes/0.0.1.json`'s changelog-style entries with two intro categories
  (keeping `version: "0.0.1"`, `date: "2026-06-26"`, and the `{version, date, changes:[{category,
  items[]}]}` schema):
  - **"welcome"** — what ReCue is (a macOS app for running/managing many live `claude`
    coding sessions side by side; each session a real terminal running the Claude Code CLI
    wrapped with navigation/persistence/git-reading) + an explicit "This is the first release."
  - **"highlights"** — the headline surfaces at a welcoming level: Overview (the agent wall,
    grouped by repo, busy/idle status), Canvas (split-panel workspace mixing terminals with
    file/git-diff/terminal/Kanban viewers, poppable tabs), and the repo-grouped sidebar
    (searchable file tree, scheduled sessions, Canvas templates, worktree-isolated agents).
- The schema has no free-text intro field, so the introduction is expressed through these two
  arbitrary categories, which Title-Case cleanly via `categoryLabel` ("Welcome"/"Highlights")
  and render as `<h4>` headers over bulleted lists. No change to `patchnotes.ts`,
  `PatchNotes.tsx`, the Settings pane, or `scripts/patchnotes-to-md.mjs`.

**Key files touched:** `src/patchnotes/0.0.1.json` (the only edit).

**Dependencies:** none — content-only, independent of any task.

**Notes**

- **Autonomous refine (2026-06-27):** decisions logged in `ASSUMPTIONS.md` under TASK-208 — two
  categories ("welcome" + "highlights") since the schema has no free-text intro field; `version`/
  `date` kept unchanged.
- **Runtime-unverified** in this headless loop: the Settings → Updates "What's new" eyeball. Vite
  eagerly globs + parses the JSON (a malformed file would be dropped), so a clean `npm run build`
  confirms it loads; `prettier --check` and `npm test` (288 passing, incl. patchnotes
  normalization tests) all pass.

---

### 209. [x] Fix the missing space between "Current version" and the version number in Settings → Updates

**Status:** Done
**Depends on:** none
**Created:** 2026-06-27

**Description**

In **Settings → Updates**, the line above the "Check for updates" button rendered as
**"Current version0.0.1"** — label and version number stuck together with no space. **Root
cause:** `.fieldLabel` (`Settings.module.css`) is `display: flex; align-items: baseline;
justify-content: space-between;` (intended to push the label left, the value right), but its
wrapping `.updates` container is `align-items: flex-start`, so `.field`/`.fieldLabel`
**shrink-wrap to content instead of stretching**. With no extra width, `space-between` has
nothing to distribute and the text node `"Current version"` sits directly adjacent to the
`.fieldValue` span. The same class backs the "Update available" field (identical latent
`Update availablev1.2.3` bug). **CSS-only** fix.

**What shipped** (commit `9444554`, 2026-06-27):

- **`Settings.module.css` `.fieldLabel`:** added `gap: var(--space-8)` (with an explanatory
  comment). The gap separates the label text node from the `.fieldValue` span whether the row is
  shrink-wrapped (the actual case → a fixed gap) or stretched (space-between still spreads them,
  gap as the minimum) — fixing both "Current version 0.0.1" and the "Update available" field with
  one line and **no markup change** (no `{" "}` hack, no colon). No change to `.field`,
  `.fieldValue`, `.updates`, or the version string shown.

**Key files touched:** `src/components/Settings/Settings.module.css` (`.fieldLabel`).

**Dependencies:** none — a one-line CSS fix, independent of any task.

**Notes**

- **Autonomous refine (2026-06-27):** decision logged in `ASSUMPTIONS.md` under TASK-209 — the
  `gap`-on-`.fieldLabel` root-cause fix chosen over a per-instance `{" "}` JSX space, since it's
  general and also corrects the "Update available" field.
- **Runtime-unverified** in this headless loop: the Settings → Updates eyeball (and the
  "Update available" state via the #193 dev mock). CSS-only, no test impact; `prettier --check`,
  `npm run build`, and `npm run lint` all pass.

---

### 210. [x] Add a feedback button (bug icon) in the sidebar footer that opens the feedback Google Form

**Status:** Done
**Depends on:** none
**Created:** 2026-06-27

**Description**

Add a **feedback / bug-report button** to the sidebar footer, next to the Settings gear in the
bottom-left, that opens the bug-report / feature-request **Google Form** in the user's default
browser. Reuses the existing external-URL path (`openUrl` → the dependency-free Rust `open_url`,
http/https only via macOS `open`, #109) — no new backend command.

**What shipped** (commit `f835b4b`, 2026-06-27) — frontend-only, one component:

- **`Sidebar.tsx`:** imported `Bug` (lucide-react) + `openUrl` (ipc), added a module-level
  `FEEDBACK_FORM_URL` constant (the user-supplied Google Form URL verbatim, incl. its
  `?usp=publish-editor` param), and inserted a third footer button (`styles.footerButton`, `Bug
  size={16} strokeWidth={1.5}`, `title`/`aria-label` "Send feedback") **between** the Settings
  gear and the collapse chevron, wired to `onClick={() => void openUrl(FEEDBACK_FORM_URL)}`. No
  confirm gate (opening a URL is non-destructive).
- **No CSS change:** `.footerCollapsed` already stacks footer children, so the button lays out
  correctly in both the expanded footer and the collapsed rail. No in-app form/modal, no
  telemetry/prefill, no settings entry or shortcut — it deliberately opens the external form.

**Key files touched:** `src/components/Sidebar/Sidebar.tsx` (reuses `openUrl` in `src/ipc.ts`
and the existing `open_url` Rust command).

**Dependencies:** none — reuses `open_url` (#109) and the existing footer-button styling.

**Notes**

- **Autonomous refine (2026-06-27):** decisions logged in `ASSUMPTIONS.md` under TASK-210 —
  placement after the Settings gear; Lucide `Bug` icon; `openUrl` (no new command); no confirm
  gate. **URL caveat:** `?usp=publish-editor` looks like a Google Forms *publish-editor preview*
  param rather than the public response link — used verbatim per the user and **flagged** for a
  swap to the public `…/viewform` share URL if the button opens the editor/preview instead of the
  live form.
- **Runtime-unverified** in this headless loop: the interactive eyeball (the bug button appears
  next to Settings in both expanded + collapsed states and opens the form in the default
  browser). `npm run build`, `npm run lint`, `prettier --check`, and `npm test` (288 passing) all
  pass.

---

### 211. [x] Reorder folders in the sidebar by dragging them up and down

**Status:** Done
**Depends on:** none
**Created:** 2026-06-27

**Description**

The left sidebar's repo "folders" (repo groups) were listed in a fixed **alphabetical** order
produced by the pure `repoOrder(recents, sessions)` (sorts by `repoName` then path), with no way
for the user to choose the order. This task adds **drag-to-reorder**: the user grabs a folder
header and drags it up or down to reposition that folder, and the chosen order **persists** across
restarts. There is **no separate drag handle** — the whole repo header is the grip (a plain click
on the title or the `+` still does its normal thing).

**What shipped** (commit `ccedfd9`, 2026-06-27):

- **Backend (`src-tauri/src/store.rs` + `lib.rs` + `commands.rs`):** a dedicated persisted
  `repo_order: Vec<String>` value with `get_repo_order` / `set_repo_order` commands, mirroring
  `sidebar_width` (#108) — kept **out of the `settings` blob** so a Settings draft can't clobber a
  drag. Commands registered in `lib.rs`; a Rust round-trip persist/reload unit test added.
- **Frontend IPC (`src/ipc.ts`):** `getRepoOrder()` / `setRepoOrder(order)` wrappers.
- **Store (`src/store.ts`):** new `folderOrder: string[]` state, loaded on boot alongside
  sidebar-width/collapsed, plus a `reorderRepos(ordered)` action (optimistic `set` + persist via
  `setRepoOrder`). The displayed folder order is computed as `mergeRepoOrder(folderOrder,
  repoOrder(...))` (reusing the existing pure helper) so spawning a repo appends it and forgetting
  one drops it **without scrambling** the rest. State named `folderOrder` to avoid shadowing the
  pure `repoOrder` function.
- **Sidebar (`src/components/Sidebar/Sidebar.tsx` + `.module.css`):** the folder group is
  extracted into a `RepoGroup` sortable (`useSortable({ id: 'repohead:'+repo })`) wrapped in a
  `SortableContext` (`verticalListSortingStrategy`) that lives **inside the existing app-level
  `DndContext`** — critically **not** a new nested context, which would rebind the sidebar's
  draggable rows and break drag-into-Canvas. The `attributes`/`listeners` spread over the **whole
  `repoHeader`** so the entire header is the grip; the existing 4px `PointerSensor` activation
  distance lets a plain click/`+`/right-click through without starting a drag. The collapsed rail
  renders the same `repos` array, so it reflects the persisted order.
- **App (`src/App.tsx`):** `onDragStart`/`onDragEnd` detect a folder-sort drag by the `repohead:`
  id prefix and call `reorderRepos(arrayMove(...))`, short-circuiting before the canvas-drop path
  so other drag kinds (session/file/diff → Canvas, move-leaf) are untouched.
- **Tests:** `store.test.ts` covers `reorderRepos` (optimistic + persist) and the displayed-order
  merge; `store.refresh.test.ts` mocks `ipc.getRepoOrder`. `npm test` + `cargo test` pass.
- **Docs:** the Sidebar section of `CLAUDE.md` and `README.md` updated to note folders are
  drag-reorderable with the order persisted via the dedicated `repo_order` value.

**Key files touched:** `src-tauri/src/store.rs`, `src-tauri/src/lib.rs`,
`src-tauri/src/commands.rs`, `src/ipc.ts`, `src/store.ts`,
`src/components/Sidebar/Sidebar.tsx` (+ `Sidebar.module.css`), `src/App.tsx`,
`src/store.test.ts`, `src/store.refresh.test.ts`, plus `CLAUDE.md` / `README.md`.

**Dependencies:** none. Reuses the app-level `DndContext` (#43/#47), the `mergeRepoOrder` helper
(#43 Overview cluster order), and the dedicated-Rust-value persistence pattern of `sidebar_width`
(#108).

**Notes**

- **Architectural key:** reuse the app-level `DndContext` — nesting a new context would break
  sidebar→Canvas row drags. The `SortableContext` lives in the sidebar but the `onDragEnd`
  handling lives in `App.tsx`, keyed by the `repohead:` id prefix.
- **Out of scope (shipped as such):** drag-reordering inside the collapsed rail (it just reflects
  the saved order), reordering within a repo group (#43), reordering worktree sub-groups, and
  moving a session between folders.
- **Autonomous refine (2026-06-27):** task decided in the refine loop with the user not answering
  — see `ASSUMPTIONS.md`. Drag-into-Canvas non-regression and the persisted-order restart were
  unit-tested but the interactive drag eyeball is **runtime-unverified** in this headless loop.

---

### 212. [x] Keep the worktree branch label in the sidebar in sync after an in-terminal checkout

**Status:** Done
**Depends on:** none
**Created:** 2026-06-27

**Description**

When an agent ran `git checkout <other-branch>` **inside its worktree** (directly in the PTY
terminal), the sidebar's worktree branch label kept showing the **old** branch until the app was
restarted. The same staleness affected normal repo headers for an in-terminal checkout. The root
cause was purely **when** `refreshBranches` ran: only on the top-level repo set changing and after
app-initiated spawns/checkouts — never after a checkout the agent performed itself in the
terminal. The backend `git::current_branches` already resolves worktree HEADs and was already
invoked with worktree paths (a worktree agent's `repoPath` **is** the worktree folder), so **no
backend change was needed** — only an additional trigger to re-read.

**What shipped** (commit `8ff49c8`, 2026-06-27) — frontend-only:

- **Store (`src/store.ts`):** the **busy→idle edge** (previous `sessionBusy` `true` → now
  `false`), detected in `setBusy` (the sole caller of the `session://state` handler), schedules a
  **debounced (~600ms), coalesced** `refreshBranches()` via a module-level timer — mirroring the
  #97 title-worker cadence (chosen over a periodic poll as less chatty and less laggy). Multiple
  sessions settling together collapse into a single batched `current_branches` call. Because
  `refreshBranches` already passes worktree paths (via `repoOrder(recents, sessions)`), this
  naturally covers **both** worktree labels and normal repo headers in one call.
- **Tests:** `store.test.ts` + `store.refresh.test.ts` drive a session busy→idle, assert
  `refreshBranches` runs after the debounce, and that a changed branch from the mocked
  `ipc.currentBranches` updates `branches[worktreePath]` (and a repo path).
- **Docs:** a one-line note added to the Git/branch section of `CLAUDE.md` that branch labels
  refresh on the busy→idle edge (like the title reader), so an in-terminal `git checkout` is
  reflected.

**Key files touched:** `src/store.ts`, `src/store.test.ts`, `src/store.refresh.test.ts`, plus
`CLAUDE.md`. No backend / `git.rs` change.

**Dependencies:** none. Reuses the existing `refreshBranches` → `ipc.currentBranches` →
`git::current_branches` path and the busy/idle edge already emitted by the #42/#112 monitor;
cadence mirrors the #97 title reader.

**Notes**

- **Trigger = busy→idle edge, debounced**, mirroring the #97 title-worker cadence, chosen over a
  periodic poll timer (chattier + laggier). A small lag (label updates at the next idle settle,
  not the instant of checkout) is expected and accepted as in scope.
- **Why both labels:** scoping to worktrees only would leave the identical repo-header staleness
  unfixed for no benefit; one batched call covers both.
- **Autonomous refine (2026-06-27):** decided in the refine loop with the user not answering — see
  `ASSUMPTIONS.md`. Behaviour is unit-tested; the interactive eyeball (label updating after a real
  in-terminal checkout) is **runtime-unverified** in this headless loop.

---

### 213. [x] Worktree agent header — use the normal "open view" button + a static "worktree" badge

**Status:** Done
**Depends on:** none
**Created:** 2026-06-27

**Description**

On **Overview agent cards** and **Canvas agent panel headers**, a worktree agent was treated
differently from a normal agent: instead of the normal `OpenViewButton` (the icon that opens the
Views / "New session here" popover), it showed a **clickable** "worktree" text button
(`WorktreeViewsBadge`) — which wrapped the **same** `ViewsPopover`, so the two triggers were
functionally identical, only the affordance differed. This task unifies them: a worktree agent now
shows the **same** `OpenViewButton` as a normal agent, and "worktree" becomes a **non-clickable
static badge** (an indicator only, styled like the existing "fork" badge).

**What shipped** (commit `31f77e7`, 2026-06-27) — frontend-only:

- **`Overview.tsx`:** removed the `!session.worktreeParent` gate so `OpenViewButton` renders for
  worktree agents too (scoped to `session.repoPath`, which **is** the worktree folder — so views
  still open in the worktree), and replaced `<WorktreeViewsBadge>` with a static
  `<span className={styles.worktreeBadge}>worktree</span>`.
- **`CanvasSurface.tsx`:** the same two changes for the Canvas agent panel header.
- **Component removal:** `WorktreeViewsBadge` became unused and was deleted (component +
  `WorktreeViewsBadge.module.css`); a stray reference in `ViewsMenu.tsx` was cleaned up.
- **Static badge:** reuses the existing `worktreeBadge` CSS class (same as "fork"), so a worktree
  badge and a fork badge read cleanly together.
- **Docs:** `CLAUDE.md` updated — worktree agents now use the standard `OpenViewButton`, and
  "worktree" on the Overview/Canvas headers is a static badge.

**Key files touched:** `src/components/Overview/Overview.tsx`,
`src/components/Canvas/CanvasSurface.tsx`, `src/components/ViewsMenu/ViewsMenu.tsx`, deleted
`src/components/WorktreeViewsBadge/{WorktreeViewsBadge.tsx,WorktreeViewsBadge.module.css}`, plus
`CLAUDE.md`. Normal agents and the sidebar are unchanged.

**Dependencies:** none. Builds on the existing `OpenViewButton` / `ViewsPopover` (#82 Views menu)
and the worktree agent model (#74/#96); the static badge reuses the "fork" badge styling (#126).

**Notes**

- "the same context-menu button as a normal agent" referred to the **`OpenViewButton`** (views
  popover trigger on the Overview/Canvas headers) — the affordance that actually differed.
  Worktree agents already shared the sidebar `SessionRow` context menu, so the sidebar needed no
  change.
- The worktree `OpenViewButton`'s `repoPath` is `session.repoPath` (the worktree folder),
  preserving "open a view in this worktree."
- **Autonomous refine (2026-06-27):** decided in the refine loop with the user not answering — see
  `ASSUMPTIONS.md`. The interactive eyeball (icon button + static badge on real worktree
  Overview/Canvas headers) is **runtime-unverified** in this headless loop; lint/build/test pass.

---

### 214. [x] Make the collapsed sidebar rail much narrower

**Status:** Done
**Depends on:** none
**Created:** 2026-06-27

**Description**

When the sidebar is collapsed to its icon rail (#168), the rail was **56px** wide — noticeably
wider than the ~36px buttons it contains, leaving a large empty gutter (~10px) on each side. This
task makes the collapsed rail **much narrower** — only slightly wider than its icons/buttons.

**What shipped** (commit `ce0e1b1`, 2026-06-27) — a pure constant + small CSS change:

- **`Sidebar.tsx`:** `SIDEBAR_RAIL_WIDTH` reduced from `56` to `44`, so the collapsed icon rail
  is only slightly wider than its ~36px buttons (a ~4px gutter each side) instead of a wide empty
  gutter.
- **`ViewSwitch.module.css`:** a small companion tweak so the view-switch control still centers/
  fits at the narrower width.
- Rail contents (New / Schedule / view-switch buttons, repo folder icons, per-session activity
  dots, worktree glyphs, the collapsed footer gear/feedback/chevron, and the collapsed
  `UpdateIndicator` icon) all still center and fit; `overflow: hidden` keeps anything from
  spilling. No new state, no persistence change; the **expanded** sidebar width (#108) is
  unaffected.

**Key files touched:** `src/components/Sidebar/Sidebar.tsx`,
`src/components/ViewSwitch/ViewSwitch.module.css`.

**Dependencies:** none. Tweaks the collapsed-rail constant introduced with the sidebar collapse
feature (#168); independent of the expanded-width `sidebar_width` value (#108).

**Notes**

- Target **44px** (36px button + ~4px gutter each side) chosen as "only slightly wider"; tunable.
- **Out of scope (as shipped):** the expanded sidebar width, what the rail displays, and the
  collapse/expand toggle behaviour.
- **Autonomous refine (2026-06-27):** decided in the refine loop with the user not answering — see
  `ASSUMPTIONS.md`. The visual eyeball (rail centering at 44px) is **runtime-unverified** in this
  headless loop; lint/build/test pass.

---

### 215. [x] Tighten the update indicator's margin + add a hover light-up

**Status:** Done
**Depends on:** none
**Created:** 2026-06-27

**Description**

The sidebar-footer **update indicator** chip (`UpdateIndicator`, #190, restyled #203) sat with a
fairly generous inset and a very quiet hover. This task makes two small visual tweaks the user
asked for: **reduce its margin** (keeping a little inset) and add a **hover "light-up"** so it
reads as clearly interactive on hover — staying on-token (the #203 "quiet at rest, clear on
hover" treatment, not a loud button).

**What shipped** (commit `fe00005`, 2026-06-27) — a token-only restyle:

- **`Update.module.css`:** the `.indicator` outer margin reduced from `var(--space-8)` to
  `var(--space-4)` (sides + bottom, keeping a small inset). A clear **hover light-up** added to
  `.indicator:hover` — an accent-tinted border (`--accent`) + a faint `--accent-dim` fill that
  eases in/out, with `border-color` added to the `transition`. The error variant
  (`.indicatorError:hover`) lights up in its own error color.
- **`tokens.css`:** a new on-token `--status-error-dim` (Red at 0.14 alpha, mirroring
  `--accent-dim`) introduced so the error-variant light-up uses a design token rather than an
  off-system color.
- Collapsed-rail centering (`indicatorCollapsed`) is unchanged.

**Key files touched:** `src/components/Update/Update.module.css`, `src/styles/tokens.css`.

**Dependencies:** none. Restyles the update chip from #190/#203; the new `--status-error-dim`
token mirrors the existing `--accent-dim` pattern. **#216 builds on this** (the first-appearance
animation touches the same `.indicator` element and was sequenced after #215 to avoid edit
conflicts).

**Notes**

- **Out of scope (as shipped):** the chip's layout/content, the install overlay/dialog styles,
  and the first-appearance attention animation (that is #216).
- **Autonomous refine (2026-06-27):** decided in the refine loop with the user not answering — see
  `ASSUMPTIONS.md`. Exercised via the #193 dev mock for the available + error states; the visual
  eyeball is **runtime-unverified** in this headless loop. `npm run lint` + `npm run build` pass.

---

### 216. [x] One-time attention animation on the update indicator when it first appears

**Status:** Done
**Depends on:** #215
**Created:** 2026-06-27

**Description**

When the update indicator first appears on app open (the first time it becomes visible in a
session because an update is available), play a **one-time attention-grabbing animation** — a
ping / glow / border pulse — to draw the eye, then let it settle to its **normal** #215 resting
look. The animation must **not** loop or replay on every re-render; it plays once per app session.

**What shipped** (commit `53820ac`, 2026-06-27) — frontend-only:

- **`Update.module.css`:** a new `@keyframes update-announce` — an accent ring + glow that pulses
  **3×** (animating `box-shadow` + `border` only, so there is **no layout shift / reflow** in the
  sidebar column) and settles to the #215 resting look — applied via a transient
  `.indicatorAnnounce` class (mirroring the #202 `reveal-flash` one-shot pattern).
- **`UpdateIndicator.tsx`:** the announce class is applied on the chip's **first *available*
  appearance per session**, guarded by a **module-level flag set on `animationend`** (robust to
  React StrictMode's dev double-mount) so it never replays on re-render, collapse toggle, or a
  status flip away-and-back.
- **Reduced motion:** auto-disabled via the global `body.reduce-motion *` killswitch — no
  per-rule guard needed. It composes with #215's hover light-up (announce runs once on mount;
  hover takes over after). The "announced" state is intentionally **not persisted** — it plays
  once per app open.

**Key files touched:** `src/components/Update/Update.module.css`,
`src/components/Update/UpdateIndicator.tsx`.

**Dependencies:** **#215** — both edit the same `.indicator` element + `Update.module.css`, so
#216 was sequenced after #215 (it builds on #215's resting style; not a cycle). Reduced-motion
killswitch (#102) and the #202 `reveal-flash` one-shot precedent; driven/tested via the #193 dev
mock.

**Notes**

- **Per-session one-shot, not persisted:** a module-level flag (set on `animationend`) prevents
  replays; the animation plays once per app open.
- **Glow/border pulse over a scale "ping"** chosen to avoid sidebar reflow.
- **Out of scope (as shipped):** the margin/hover restyle (#215) and persisting "announced"
  across restarts.
- **Autonomous refine (2026-06-27):** decided in the refine loop with the user not answering — see
  `ASSUMPTIONS.md`. Exercised via the #193 dev mock (`clearUpdate()` then `mockUpdate(...)`, plus
  a collapse toggle to confirm no replay); the visual eyeball is **runtime-unverified** in this
  headless loop. `npm run lint` + `npm run build` pass.

---

### 217. [x] Fix the feedback (bug) button opening the documents folder instead of the browser on Windows

**Status:** Done
**Depends on:** none
**Created:** 2026-06-27

**Description**

The sidebar-footer **feedback (bug) button** (#210) is meant to open the feedback Google Form in
the user's default browser, but on **Windows** it instead opened the **documents folder**. Root
cause: the `open_url` Rust command (`open_url` → ipc → the #210 button, also the #109 ⌘-click
link path) was hardcoded to run `std::process::Command::new("open")`, which is the **macOS** open
command; on Windows there is no standard `open` URL-opener, so Windows resolved it to opening a
folder. The fix makes `open_url` open the URL in the **OS default browser cross-platform**.

**What shipped** (commit `68a4cf0`, 2026-06-27) — backend-only, one command:

- **`src-tauri/src/commands.rs`:** `open_url` rewritten with a **platform-`cfg` `Command`** branch
  (dependency-free): `open <url>` on macOS, `cmd /C start "" <url>` on Windows (the empty `""` is
  `start`'s title arg so a quoted URL isn't mistaken for the title), `xdg-open <url>` elsewhere.
  The `is_http_url` **http/https-only guard is preserved**, keeping the no-shell-injection
  property, and the error still maps to `SessionError::Io`. This fixes both the #210 feedback
  button and the #109 ⌘-click link-open path on Windows.
- **`CLAUDE.md`:** noted that `open_url` is now cross-platform (and that the #109 ⌘-click link
  path benefits too).

**Key files touched:** `src-tauri/src/commands.rs` (the `open_url` command), `CLAUDE.md`.

**Dependencies:** none. Fixes the URL-open path behind the #210 feedback button and the #109
⌘-click web-links opener.

**Notes**

- **Approach chosen:** the **dependency-free platform-`cfg` `Command`** fallback rather than the
  plan's recommended `open` crate, because the `open` crate is not in `Cargo.lock` and adding it
  would need a network fetch unavailable in the build sandbox. The `is_http_url` guard (well
  unit-tested) is retained.
- **Scope tension flagged:** `CLAUDE.md` documents ReCue as **macOS-only**, yet this is a
  Windows bug report. This task fixes only the reported `open_url` path; broader Windows support
  (the macOS-specific `open`-based `reveal_*` / `open_data_folder` commands, `path_env`
  login-shell PATH, bundle config) is a larger, separate decision left to the user. The fix is
  harmless on macOS regardless.
- **Out of scope (as shipped):** the other `open`-based commands (`reveal_path`,
  `reveal_file_in_finder`, `open_data_folder`) were intentionally left unchanged.
- **Autonomous refine (2026-06-27):** decided in the refine loop with the user not answering — see
  `ASSUMPTIONS.md`. `cargo build` / `clippy` / `fmt` pass on macOS; the **Windows runtime**
  behaviour (button opens the browser, not a folder) follows from the `cmd /C start` branch but
  was **not runtime-verified** (macOS-only dev host).

---

### 218. [x] Nest scheduled worktree sessions under a worktree sub-group (sidebar) + worktree badge on Overview

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

A session **scheduled for a worktree** (#198 — via the worktree button or **Ctrl/⌘+Enter** in the
schedule step of the new-session modal) showed its pending item under the **parent repo's
in-folder location** in the sidebar, instead of nested under a **worktree** sub-group the way a
**live** worktree agent (#74) does — and its Overview card was missing the "worktree" badge. Root
cause: a `ScheduledSession` stores only `cwd = <parent repo>` plus a `worktree` flag and the
`branch` intent — **no worktree path** (the worktree folder is created only at fire time by
`prepare_worktree_for_schedule`), and the sidebar groups schedule rows by parent repo while the
worktree sub-group rendering iterated **live agents only**. This task nests a pending worktree
schedule under the proper worktree sub-group and badges it as a worktree everywhere a live
worktree agent is.

**What shipped** (commit `c6e572d`, 2026-06-28) — the fix hinges on the worktree destination being
**deterministic and fully computable at schedule time** (`worktree_path(store, cwd, branch)`
depends only on the data dir + parent repo + branch, all known at create time, incl. a
`create_branch` new branch), so it's persisted on the schedule and reused byte-for-byte at fire
time:

- **Backend — persist the worktree path (`src-tauri/src/store.rs`, `src-tauri/src/commands.rs`):**
  added `worktree_path: Option<String>` to `ScheduledSession` (`#[serde(default,
  skip_serializing_if = "Option::is_none")]` so older `sessions.json` records load as `None`).
  `create_schedule` now computes `worktree_path(&store, &cwd, branch)` (→ `to_string_lossy`) when
  `worktree == true` with a non-empty branch, else `None`. `prepare_worktree_for_schedule`
  **prefers the stored `sched.worktree_path`** (recompute fallback for pre-#218 records), so the
  fired live session's `repo_path` is **byte-identical** to the schedule's stored path and the
  sub-group merges cleanly on fire (no duplicate sub-group, no orphaned row).
- **TS type mirror (`src/types/index.ts`):** added `worktree_path?: string | null` to
  `ScheduledSession` (snake_case, matching the other serde-as-is fields).
- **Pure grouping helpers (`src/paths.ts` + `src/paths.test.ts`):** extracted
  `scheduleNestsUnderWorktree(schedule)` (true only for a worktree schedule with a computed
  `worktree_path`) and `worktreeGroupPaths(worktreeAgents, worktreeSchedules)` (ordered, deduped
  union of live worktree-agent folders and schedules' `worktree_path` — live paths first), with
  Vitest coverage: a live agent + a schedule on the same path collapse to one sub-group, a
  schedule-only path still produces a sub-group, non-worktree schedules stay at the parent level.
- **Sidebar nesting (`src/components/Sidebar/Sidebar.tsx`):** the repo group now builds
  `worktreePaths` from the union helper, **excludes** worktree schedules (with a `worktree_path`)
  from the parent-repo schedule filter, and renders each worktree path's pending `ScheduleRow`s
  under the **full existing `WorktreeHeader`** (branch label + worktree cue + open-view `+` +
  context menu), preferring the live `branches[wt]` else the schedule's `branch` for the label.
- **Overview badge (`src/components/Overview/Overview.tsx`):** the `ScheduleCard` header now
  renders the static `styles.worktreeBadge` "worktree" span when `schedule.worktree`, mirroring a
  live worktree agent's card; `ScheduledPanel` already badged (confirmed, no change).

**Key files touched:** `src-tauri/src/store.rs` (struct field + serde round-trip test),
`src-tauri/src/commands.rs` (`create_schedule` compute, `prepare_worktree_for_schedule` prefer
stored path), `src/types/index.ts` (TS mirror), `src/paths.ts` + `src/paths.test.ts` (pure
grouping helpers + tests), `src/components/Sidebar/Sidebar.tsx` (worktree sub-group nesting),
`src/components/Overview/Overview.tsx` (schedule-card worktree badge).

**Dependencies:** none. Builds on #198 (schedule-into-worktree), #74 (worktree agents + sidebar
sub-group / `WorktreeHeader`), #93/#94 (scheduled sessions + `ScheduledPanel`), #125
(create-branch-at-fire-time intent on the schedule), and the cross-platform `worktree_path` /
`repoName` path helpers (#143).

**Notes**

- **Cross-platform:** no new OS-specific code — the worktree path is computed entirely by the
  existing `worktree_path` helper (OS-native separators, `sanitize_seg` / `windows_safe_seg`),
  grouping is string/path-key equality, and labels split on `/` or `\` via `repoName`, so the fix
  walks identically on macOS and Windows (the fired live session's `repo_path` matches the stored
  key because both flow through `worktree_path`).
- **Back-compat:** worktree schedules created **before** #218 have `worktree_path = None`, so they
  keep grouping at the parent level until re-created — and still fire correctly via the recompute
  fallback. The `ScheduledPanel` edit flow (#94) only edits time/name/prompt, so the stored path
  can't go stale after creation.
- **Out of scope:** unchanged *when* the worktree folder is physically created (still fire time);
  non-worktree schedules still group by `cwd`; the `ScheduleRow` itself gains no separate badge
  (the surrounding `WorktreeHeader` supplies the worktree cue).

---

### 219. [x] Move the sidebar collapse button to the far right of the footer button row

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

In the left panel (sidebar) **footer button row**, the three icon buttons — Settings, Feedback
(#210), and the collapse/expand toggle (#168) — were all bunched at the left. This task moves the
**collapse/expand** button to the **far right** edge of the expanded footer row while Settings and
Feedback stay grouped flush left, without disturbing the collapsed icon rail's vertical stack.

**What shipped** (commit `c6c4291`, 2026-06-28) — a minimal pure-CSS-layout change, no behavior
changes:

- **`src/components/Sidebar/Sidebar.module.css`:** added a `.footerCollapseToggle { margin-left:
  auto; }` modifier that pushes the collapse button to the far right of the expanded `.footer`
  flex row (keeping Settings + Feedback grouped left — chosen over `justify-content:
  space-between`, which would have spread all three apart). Neutralized it under the collapsed
  rail with `.footerCollapsed .footerCollapseToggle { margin-left: 0; }`, so the icon stays
  centered/last in the vertical stack exactly as before.
- **`src/components/Sidebar/Sidebar.tsx`:** applied the modifier class to the collapse `<button>`
  (`${styles.footerButton} ${styles.footerCollapseToggle}`), leaving Settings and Feedback, all
  icons/handlers/tooltips, and the ⌘B / Ctrl+B shortcut untouched.

**Key files touched:** `src/components/Sidebar/Sidebar.module.css` (the two flex rules),
`src/components/Sidebar/Sidebar.tsx` (modifier class on the collapse button).

**Dependencies:** none. Builds on #168 (the collapse/expand toggle) and #210 (the feedback
button) — the two footer buttons it sits beside.

**Notes**

- **Cross-platform:** a standard flex `margin-left:auto`, no engine-specific hacks, so it renders
  identically on macOS (WKWebView) and Windows (WebView2/Chromium); the ⌘↔Ctrl tooltip already
  routes through `kbdHint` and was untouched.
- **Out of scope (as shipped):** the collapsed icon rail's vertical stack is unchanged ("far
  right" is horizontal-only); no change to button order, icons, handlers, tooltips, or
  `toggleSidebarCollapsed` behavior.

---

### 220. [x] Make Ctrl+V paste (text + images) work in terminals on Windows

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

On **Windows**, **Ctrl+V** in an agent (or shell) terminal did not paste — by terminal convention
xterm.js forwards Ctrl+V as the literal control byte **`^V` (0x16)** to the PTY rather than reading
the clipboard, so neither text nor images reached `claude`. (macOS ⌘V works because WebKit raises a
native `paste` event xterm handles.) This task intercepts the Windows paste chord, reads the OS
clipboard, and injects its contents — text and best-effort images — into the terminal, matching the
macOS paste experience, while leaving macOS behavior byte-for-byte unchanged.

**What shipped** (commit `ee868c7`, 2026-06-28):

- **Clipboard plugin (`package.json`, `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`,
  `src-tauri/capabilities/default.json`):** added `@tauri-apps/plugin-clipboard-manager` (JS) +
  `tauri-plugin-clipboard-manager` (Rust), inited the plugin, and granted the read-text /
  read-image capabilities (the `navigator.clipboard.readText()` path is unreliable under WebView2,
  so the plugin is the robust cross-platform read).
- **Rust image command (`src-tauri/src/commands.rs`, `src/ipc.ts`):** new bounded
  `save_clipboard_image()` reads the clipboard image and writes it to a temp **PNG** (via the
  `png` crate), returning the absolute temp-file path; typed IPC wrappers added for clipboard
  read-text and the image save.
- **Windows-gated key handler (`src/components/Terminal/terminalPool.ts`):** `createHost` now
  registers `term.attachCustomKeyEventHandler` that — only when `isWindows(useStore.getState().
  platform)` — matches the Ctrl+V / Ctrl+Shift+V chord (`ctrlKey && !altKey && !metaKey && key in
  {v,V}`), reads the clipboard (text first; else an image saved to a temp PNG whose **path** is
  pasted so claude attaches it), pastes via **`term.paste(...)`** (bracketed-paste-aware, so
  multi-line text is preserved), and **returns `false`** to suppress the stray `^V`. All other
  keys (including **Ctrl+C / SIGINT**) pass through untouched. Shared by both agent and shell
  terminals via `createHost`.

**Key files touched:** `src/components/Terminal/terminalPool.ts` (the custom key handler),
`src-tauri/src/commands.rs` + `src/ipc.ts` (clipboard read-text + `save_clipboard_image`),
`src-tauri/src/lib.rs` + `Cargo.toml` + `capabilities/default.json` + `package.json` (plugin +
permissions), `TRAJECTORY_TO_WINDOWS.md` (real-box verification log).

**Dependencies:** none — a self-contained terminal fix that adds its own clipboard dependency.

**Notes**

- **Cross-platform:** the handler only acts on Windows (gated via the store-cached `platform`
  signal / `isWindows`); macOS keeps its **native ⌘V**, Ctrl+V stays `^V`, and Ctrl+C stays SIGINT
  on both. The clipboard plugin and temp-file path (OS temp dir, no hardcoded paths) are
  cross-platform.
- **Autonomous decisions (user not answering; logged in `ASSUMPTIONS.md`):** Tauri
  clipboard-manager plugin over `navigator.clipboard`; `term.paste()` over raw `writeStdin`;
  intercept Ctrl+V **and** Ctrl+Shift+V on Windows; images saved as a temp PNG with the **path**
  pasted (claude accepts image paths, independent of its internal clipboard mechanism). Copy
  (Ctrl+C / copy-on-selection) and a right-click menu were out of scope (paste-only).
- **Not runtime-verified:** text + **image** paste on a real Windows box (live clipboard + GUI +
  the `claude` CLI) cannot be unit-tested on CI; flagged for real-box verification in
  `TRAJECTORY_TO_WINDOWS.md`. The text-paste fix stands regardless; if claude needs a different
  image signal than a pasted file path, only that branch would need adjusting.

---

### 221. [x] Fix the terminal font rendering "jiggly" on Windows (JetBrains Mono not loaded into the WebGL atlas)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

On **Windows**, terminal output rendered with subtly malformed / "jiggly" glyphs (the letter "C"
especially) — the bundled **JetBrains Mono** wasn't being applied in the terminal. Root cause: the
main-window terminal uses xterm's **WebGL** renderer, which draws glyphs into a GL texture rather
than laying out DOM text, so the bundled `@fontsource` webfont was never fetched on xterm's behalf
and `document.fonts.ready` could resolve **before** JetBrains Mono loaded — leaving the WebGL glyph
atlas built once with **fallback-font metrics** (the wobble). macOS (WKWebView) was less affected
because a DOM element using `--mono` triggered the load earlier. This task makes the font load
explicitly and rebuilds the atlas so Windows terminals render crisply.

**What shipped** (commit `30ab1e0`, 2026-06-28) — the **primary** OS-neutral fix (WebGL kept on
Windows), in `src/components/Terminal/terminalPool.ts` `createHost`:

- Replaced the bare `void document.fonts?.ready.then(safeFit)` with an async sequence that
  **explicitly `document.fonts.load(`${weight} ${size}px "JetBrains Mono"`)`** for weights
  **400/500/700** at the configured font size (forcing the bundled face to fetch even though only
  the canvas/GL renderer uses it), awaits `document.fonts.ready`, and then — **guarded against a
  host disposed mid-load** (`if (disposed) return`) — rebuilds: `webgl?.clearTextureAtlas()`,
  forces xterm to **re-measure the character cell** by reassigning `term.options.fontFamily`
  (transient `"monospace"` → original, both synchronous in-frame), `term.refresh(0, term.rows -
  1)`, then `safeFit()` to recompute cols/rows for the corrected cell size. Both `load()` and
  `ready` are wrapped so a missing/unsupported face falls through to a best-effort refit.

**Key files touched:** `src/components/Terminal/terminalPool.ts` (the explicit font-load + atlas
rebuild), `TRAJECTORY_TO_WINDOWS.md` (real-box verification log + the documented fallback).

**Dependencies:** none — a self-contained terminal-rendering fix on shipped code.

**Notes**

- **Cross-platform:** the primary fix is OS-neutral (no `platform` branch) and a no-op on macOS
  (already crisp; re-measuring after the real font loads stays correct there); WebGL is retained on
  Windows. A **documented fallback** — drop to the DOM renderer on Windows by generalizing the
  WebGL gate to `IS_MAIN_WINDOW && !isWindows(platform)` (mirroring the existing detached-window
  precedent) — is recorded for use only if a real-box check shows the jiggle persists as a deeper
  GL atlas / devicePixelRatio artifact.
- **Not runtime-verified:** a Windows-only GUI rendering path (no Windows box / live WebView2 on
  CI); flagged for real-box verification in `TRAJECTORY_TO_WINDOWS.md` per the CLAUDE.md
  untestable-path rule — confirm "C" and box-drawing render crisp and survive resize/reparent.
- **Out of scope:** changing the font / weights / non-terminal UI font, macOS rendering (must stay
  crisp), and OS-installing JetBrains Mono (it ships as a webfont; the fix is about applying it in
  xterm).

---

### 222. [x] Revert the Canvas "+" to a plain new-tab button; move "from template" back into the Templates menu

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

A partial **revert of #205**: that task had turned the Canvas tab strip's **"+"** into a dropdown
("New tab" / "New tab from template…"). This restores the "+" to a **plain one-click button that
creates a new empty canvas tab** and moves **"New tab from template…"** back into the **"Templates
▾"** dropdown (where it lived before #205, originally #118), while preserving the #206 ⌘T/Ctrl+T
keybind.

**What shipped** (commit `9e0bf6c`, 2026-06-28) — a focused frontend change in
`src/components/Canvas/CanvasTabs.tsx`:

- **"+" → plain button:** replaced the `addMenu` dropdown trigger (with its `Plus` + `ChevronDown`,
  `aria-haspopup`/`aria-expanded`, and the whole two-item menu) with a plain `<button
  onClick={() => addCanvas()}>` rendering just `Plus`. Kept the "New tab (⌘T/Ctrl+T)"
  `title`/`aria-label` so #206's hint stays on the button. Removed the now-unused `addMenu =
  useDropdownMenu()` instance (kept `useDropdownMenu`, `ChevronDown`, `openTemplateUse`,
  `hasTemplates` — all still used by the Templates menu).
- **"New tab from template…" → Templates ▾:** added the `openTemplateUse()` item (gated
  `disabled={!hasTemplates}`) at the **top** of the `templatesMenu`, above the management items
  (New template… / Save current canvas as template… / Manage templates…).

**Key files touched:** `src/components/Canvas/CanvasTabs.tsx` (the "+" button + Templates menu).

**Dependencies:** none — refines shipped code (#205 dropdown, #206 ⌘T, #117/#118 templates).

**Notes**

- **Cross-platform:** pure UI change, no OS-specific code; the ⌘↔Ctrl hint already routes through
  `kbdHint`/`isWindows` and the ⌘T/Ctrl+T handler uses `metaKey || ctrlKey`, so it renders and
  fires identically on macOS (WKWebView) and Windows (WebView2).
- **Out of scope (as shipped):** the #205 distribute-evenly button position (left at the right edge
  — the card didn't mention it); the `openTemplateUse` store action + `TemplateUseModal` flow (only
  the trigger location moved); the Templates management items themselves.
- **#206 preserved:** ⌘T/Ctrl+T still creates a tab and its hint shows on the "+" tooltip + the
  keyboard legend; only the in-"+"-menu `<kbd>` hint was dropped with the menu.

---

### 223. [x] Add a "distribute panels evenly" button to the Template Editor

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

The live Canvas has a **"Distribute panels evenly"** button (#186) that rebalances its split layout
to equal area, but the **Template Editor** (the BSP surface for authoring Canvas templates, #117)
had no such affordance. This adds the same button to the Template Editor toolbar so a template's
blocks can be evenly distributed too, reusing the shipped pure `equalize` op.

**What shipped** (commit `eec0ab0`, 2026-06-28) — frontend-only, reusing #186's equal-area logic:

- **`src/components/Canvas/canvasTree.ts`:** exported the `leafCount` helper (used to gate the
  button), alongside the existing pure `equalize(node)` op.
- **`src/components/TemplateEditor/TemplateEditor.tsx`:** imported `equalize` + `leafCount` and
  `Grid2x2`; added a toolbar `<button>` ("Distribute panels evenly", same `Grid2x2` icon/label as
  the live Canvas), **disabled when `leafCount(layout) < 2`** (mirrors the live `canEqualize`
  gate). Its `distribute()` handler runs `setLayout((l) => equalize(l))` **and bumps a one-shot
  `equalizeNonce`**; the BSP surface region (`renderNode(layout)`) is **keyed on that nonce** so it
  remounts and each react-resizable-panels `Group` re-reads its **initial-only** `defaultLayout`
  from the now-equalized `node.sizes`. A normal drag-resize never bumps the nonce, so interactive
  resizing is undisturbed. Equalized sizes persist on Save like any other edit (no store/blob
  change).
- **`TemplateEditor.module.css`:** a `distributeBtn` style for the new toolbar button.

**Key files touched:** `src/components/TemplateEditor/TemplateEditor.tsx` (button + nonce-remount),
`src/components/Canvas/canvasTree.ts` (export `leafCount`), `TemplateEditor.module.css`.

**Dependencies:** none — builds on shipped #186 (the pure `equalize` op + live-canvas button) and
#117 (the Template Editor).

**Notes**

- **Why a nonce remount (not the live canvas's imperative Group-ref `setLayout`):** the Template
  Editor's blocks are **inert** (no terminal pool to preserve), so remounting the surface is the
  simplest reliable way to re-read the initial-only `defaultLayout` after equalize. The live canvas
  needs the imperative path only to avoid disposing pooled terminals.
- **Cross-platform:** pure frontend, no OS-specific code, button-only (no keyboard handler) —
  renders identically on macOS and Windows.
- **Out of scope:** the live Canvas button (unchanged), a border double-click equalize gesture (the
  card asked only for the button), and `equalize`'s equal-area semantics (unchanged from #186).

---

### 224. [x] Canvas template file block: support full paths + a relative/absolute path choice

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

A Canvas template's **"open-file" block** (#117/#118) previously took only a **bare relative
filename** resolved inside the folder chosen at template-use time. This extends it to accept a
**full relative path** (folders + filename, resolved from the chosen project root) or an **absolute
path** (from the filesystem root), via an explicit **relative ⇄ absolute** choice in the block
config — with **no backend change** (relative subpaths already validate via `repo.join`; absolute
resolves through the shipped #163 parent-dir-as-root pattern).

**What shipped** (commit `2659b12`, 2026-06-28) — frontend-only:

- **`src/types/index.ts`:** added `filePathMode?: "relative" | "absolute"` to the open-file block
  content (optional; **absent / undefined → relative**, so existing templates are unchanged).
- **Pure `fileBlockTarget(block, cwd)` helper (`src/components/Canvas/templateInstantiate.ts`):**
  maps **relative** → `{ repoPath: cwd, file }` (subpaths allowed; backend joins, `/`-separated so
  it's cross-platform) and **absolute** → `splitPath(file)` → `{ repoPath: dir, file: base }` (the
  file's own parent dir as the root — the #163 trick — so the containment check passes). Used by
  **both** `resolvedContent` (instantiation mapping) and `store.ts resolveTemplateBlock` for the
  `fileExists` check, the live content, and `registerOverviewPanel`.
- **Template Editor UI (`TemplateEditor.tsx` + `TemplateEditor.module.css`):** a relative ⇄
  absolute segmented control bound to `filePathMode`; relative mode keeps the text input with an
  updated label/placeholder/helper making clear subfolders are allowed; absolute mode adds a
  text input + **"Browse…"** button (reusing `pickFile()`, mirroring #163) and a portability-caveat
  helper.
- **Tests (`templateInstantiate.test.ts`):** +6 covering bare relative (no `filePathMode`),
  explicit relative subpath, POSIX absolute, Windows-backslash absolute, and the unset-file
  fallback.

**Key files touched:** `src/components/Canvas/templateInstantiate.ts` (the `fileBlockTarget` helper
+ mapping), `src/store.ts` (`resolveTemplateBlock` uses the helper), `src/components/TemplateEditor/
TemplateEditor.tsx` + `.module.css` (mode toggle + Browse), `src/types/index.ts` (the
`filePathMode` field), `src/components/Canvas/templateInstantiate.test.ts` (tests).

**Dependencies:** none — builds on shipped templates (#117/#118), the #163 absolute-file
parent-dir-as-root pattern, and the cross-platform `splitPath` / `pickFile` helpers.

**Notes**

- **No backend change:** relative subpaths already validate via `repo.join` (treats `/` as a
  separator on both OSes); absolute reuses the #163 parent-dir-as-root containment trick — so
  `files.rs` was untouched.
- **Cross-platform:** relative paths stored `/`-separated → portable across macOS and Windows;
  absolute paths are inherently machine/OS-specific (`splitPath` handles `/` and `\`, `pickFile`
  returns an OS-native path), with the portability caveat documented in the editor helper text. A
  missing absolute file fails gracefully (the panel stays `pending` with inline error + Retry,
  #118).
- **Autonomous decision (logged in `ASSUMPTIONS.md`):** an explicit `filePathMode` field
  (default relative) over inferring absolute-ness from the path string — matches the card's
  "choice", clearer on re-edit, back-compatible.
- **Out of scope:** the other block kinds (new-agent / new-terminal / open-diff), and making
  absolute-path templates portable across machines (machine-specific by design).

---

### 225. [x] Show a subtle current-branch badge next to each sidebar folder, kept in sync from any source

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

In the left sidebar, show a **subtle, grayed-out branch badge next to each top-level folder (repo)
name** displaying that folder's current git branch, kept **in sync when the branch changes from any
source** — an app agent, an in-terminal `git checkout`, or an external tool. The existing #212
busy→idle edge refresh covered in-app changes but missed **external** checkouts and **idle repos
with no busy session**, so this adds focus/visibility + interval polling on top.

**What shipped** (commit `d9f7606`, 2026-06-28) — frontend-only, reusing the shipped `branches`
map (no backend change):

- **Badge UI (`src/components/Sidebar/Sidebar.tsx` + `Sidebar.module.css`):** the repo header now
  renders `<span className={styles.repoBranch} title={branches[repo]}>{branches[repo]}</span>`
  next to the folder name, shown only when `branches[repo]` is non-empty (non-git/unknown folders
  show nothing). The `.repoBranch` style is muted/small and truncates with ellipsis so it doesn't
  crowd the name/count/`+`. Expanded sidebar only (the collapsed icon rail is unchanged).
- **Sync from any source (a main-window-only `useEffect`):** keeps the #212 edge refresh and adds
  (a) a `focus` + `visibilitychange` listener that calls `refreshBranches()` when the window
  becomes focused/visible (catches "changed it elsewhere, came back"), and (b) a **~15s interval
  poll** (`BRANCH_POLL_MS`) that runs only while the window is visible and is **paused when
  `document.hidden`**. `refreshBranches` already batches all repos into one `currentBranches` IPC
  call, so each tick is a single call; listeners + interval are cleaned up on unmount.

**Key files touched:** `src/components/Sidebar/Sidebar.tsx` (repo-header badge + focus/visibility/
poll effect), `src/components/Sidebar/Sidebar.module.css` (`.repoBranch`).

**Dependencies:** none — builds on the shipped `branches` map + `refreshBranches` (#212) and the
repo header.

**Notes**

- **Cross-platform:** pure frontend; the branch reads go through the existing cross-platform
  `current_branches` git shell-out, and the focus/visibility/interval APIs are standard DOM working
  in both WKWebView and WebView2. Plain-CSS badge renders identically on macOS and Windows.
- **Deliberately augments #212:** #212 chose no poll timer; this task's broader "any source"
  requirement adds one (visible-only, paused when hidden, all-repos-batched) so external/idle-repo
  changes are caught.
- **Out of scope:** the collapsed icon rail (no room for a text badge), worktree sub-headers
  (already show their branch), the session-row label behavior, and any backend change.

---

### 226. [x] Replace the agent-header "worktree" badge with a folder + branch indicator (every agent)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

On an agent's header (Overview card + Canvas panel), the standalone **"worktree" badge** (#213) is
removed in favor of a **`folder · branch` indicator shown for every agent** — mirroring how the
Kanban / file panel headers show `folder · branch`. So a normal agent reads e.g. `myrepo · main`
and a worktree agent reads `myrepo · feature-x` (parent repo + its isolated branch) rather than a
separate "worktree" tag.

**What shipped** (commit `b781d0e`, 2026-06-28) — frontend-only:

- **Overview `SessionCard` (`src/components/Overview/Overview.tsx`):** removed the
  `worktreeParent`-gated `worktreeBadge`; added a `.meta`/`.metaText` indicator after the name
  rendering `repoName(effectiveRepo(session))` + (when known) ` · ${branch}`, shown for every
  agent. The fork badge is kept.
- **Canvas `LeafPanel` (`src/components/Canvas/CanvasSurface.tsx`):** stopped nulling `metaText`
  for agents — it now computes `metaRepo = content.kind === "agent" && session ?
  effectiveRepo(session) : repoPath` and `metaText = repoName(metaRepo) + (branch ? · branch :
  "")`, so the existing `{metaText && …}` render shows `folder · branch`; removed the
  `worktreeParent`-gated badge (fork badge kept).
- **Folder = `effectiveRepo` (parent repo)** so a worktree agent reads the meaningful "myrepo",
  not the sanitized worktree-folder basename; **branch = `branches[repoPath]`** (the worktree's own
  branch), already kept fresh by #212. The `worktreeBadge` CSS class is retained (still used by the
  fork badge + the #218 ScheduleCard).

**Key files touched:** `src/components/Overview/Overview.tsx` (SessionCard header),
`src/components/Canvas/CanvasSurface.tsx` (LeafPanel `metaText` for agents). No CSS class removed.

**Dependencies:** none — builds on shipped #213 (the badge it replaces), #96 (`effectiveRepo`), and
#212 (`branches`). Independent of #225 (which badges **sidebar folder** headers — a different
component).

**Notes**

- **Cross-platform:** pure frontend; `repoName`/`effectiveRepo` already split on `/` or `\` (#143);
  renders identically on macOS and Windows.
- **Out of scope (deliberate boundaries):** the #218 ScheduleCard "worktree" badge is left as-is
  (this card is about **agent** headers; a scheduled card already shows `repoName(cwd) · branch`),
  the fork badge is kept (distinct provenance marker), and the sidebar's own worktree sub-grouping
  is unrelated/unchanged. Minor redundancy when an auto-named agent's name is already its branch is
  accepted (matches how non-agent panels always show the context line).

---

### 227. [x] Extend file-viewer syntax highlighting to more languages (C#, Go, Lua, SQL, Ruby, PHP, Gradle…)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

The universal **FileViewer** already syntax-highlights a curated set of languages via Prism.js
(#44/#150). This extends the curated set to cover the rest of the user's list — the missing ones
being **C#, Go, Lua, SQL, Ruby, PHP, and Gradle** (Java/Rust/JS/TS/HTML/CSS/JSON/YAML/Python and
Maven `pom.xml`→XML were already covered) — keeping it fast and non-blocking.

**What shipped** (commit `61226a7`, 2026-06-28) — frontend-only, **static imports** (deliberately
not lazy-loaded):

- **`src/components/FileViewer/prism.ts`:** added the missing Prism component imports **in
  dependency order** — `prism-csharp` / `prism-kotlin` / `prism-groovy` (extend clike, after core),
  `prism-go`, `prism-lua`, `prism-sql`, `prism-ruby`, and **`prism-markup-templating` before
  `prism-php`** (php extends it; a wrong order silently disables the grammar).
- **`src/components/FileViewer/fileType.ts`:** added to `LANG_BY_EXT`: `cs: "csharp"`, `go: "go"`,
  `lua: "lua"`, `sql: "sql"`, `rb: "ruby"`, `php: "php"`, `phtml: "php"`, `gradle: "groovy"` (Groovy
  DSL), `kts: "kotlin"` + `kt: "kotlin"` (Kotlin DSL). POM needed no entry (`pom.xml`→`markup`
  already).
- **Tests (`fileType.test.ts` + a new Prism grammar-resolution test):** assert the new ext→lang
  mappings and that each grammar actually resolves (guarding the import dependency order).

**Key files touched:** `src/components/FileViewer/prism.ts` (component imports),
`src/components/FileViewer/fileType.ts` (`LANG_BY_EXT`), `fileType.test.ts` + the new Prism test.

**Dependencies:** none — extends the shipped FileViewer (#44/#150). Note: **#229 (diff-viewer
syntax highlighting) depends on this task**, reusing the unchanged pure `prismLang` /
`highlightToHtml` surface.

**Notes**

- **Static, not lazy (deliberate):** per the card's own "lazy only if a naive approach is slow or
  hard to maintain" criterion — this is a desktop app loading its bundle from local disk, the
  components are tiny (~KB), and static preserves the **deterministic no-async-flash** UX (lazy
  would show unhighlighted code then re-highlight). Documented so the choice reads as intentional.
- **Cross-platform:** pure frontend; language detection is by file extension on repo-relative
  `/`-separated paths; no OS-specific code; identical on macOS and Windows.
- **Out of scope:** lazy loading (evaluated + rejected), the diff viewer (the separate #229),
  markdown render mode + the editable raw textarea (#148), and languages beyond the card's list.

---

### 228. [x] Make agents in the collapsed sidebar rail clickable (left-click select + right-click menu)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

When the sidebar is **collapsed** to the icon rail (#168/#214), agents rendered as **status dots
only** with no interactivity. This makes each rail agent dot respond to **left-click** (select /
jump to the agent, with a selected state) and **right-click** (the full agent context menu) —
matching the expanded sidebar rows — for both normal-repo and worktree agents.

**What shipped** (commit `c10233e`, 2026-06-28) — frontend-only, taking the recommended
(not-fallback) approach:

- **Shared `AgentContextMenu` (`src/components/Sidebar/Sidebar.tsx`):** extracted the agent
  right-click menu (Rename / Fork conversation / Copy session ID / Open in canvas / Remove, with
  the same `canFork`/`forkReason` + `canResume` gating + position clamping) into one component used
  by **both** the expanded `SessionRow` and the collapsed rail, so they never diverge.
- **Clickable rail dots:** the `dot()` helper now wraps each `BusyIndicator` in a `<button
  className={railDot / railDotSelected}>` — `onClick` → `selectItem({ kind:"agent", id, repoPath })`,
  `onContextMenu` → `preventDefault` + **`stopPropagation`** (so it opens the agent menu, not the
  rail's background/repo menu) + the shared menu, with `title`/`aria-label` = the agent label and a
  **selected** state when `s.id === selectedId`. Applied to repo-session and worktree-agent dots.
- **Rename-from-rail:** since the narrow rail has no room for the inline editor, a new transient
  store flag **`pendingRenameSessionId`** (`setPendingRenameSession`, `src/store.ts`) is set; the
  rail's Rename expands the sidebar and the now-visible `SessionRow` consumes the flag on
  mount/update to auto-begin the inline rename, then clears it.
- **`Sidebar.module.css`:** added `.railDot` (button reset + hover) and `.railDotSelected` styles
  (mirroring the expanded `.rowSelected` accent), preserving the dot's footprint/alignment.

**Key files touched:** `src/components/Sidebar/Sidebar.tsx` (shared `AgentContextMenu` + clickable
`dot()` + rename plumbing), `src/store.ts` (`pendingRenameSessionId` flag),
`src/components/Sidebar/Sidebar.module.css` (`.railDot`/`.railDotSelected`).

**Dependencies:** none — builds on the shipped collapsed rail (#168/#214) and the `SessionRow`
agent menu (#57/#131/#132/#142/#153).

**Notes**

- **Cross-platform:** pure frontend; `onContextMenu` + `clientX/clientY` positioning are standard
  and identical on macOS and Windows; the shared menu inherits its clamping/dismiss behavior.
- **Out of scope:** drag-into-Canvas from the rail dots (the card was click-only; drag stays on the
  expanded rows), the rail's repo-folder button + worktree header (already interactive), and
  non-agent items (they don't appear as rail dots).

---

### 229. [x] Syntax-highlight the diff viewer (reusing the file viewer's languages)

**Status:** Done
**Depends on:** #227
**Created:** 2026-06-28

**Description**

The **DiffInspector** rendered diff lines as plain, unhighlighted text. This applies the same
Prism syntax highlighting the FileViewer uses — reusing the curated language set extended by #227
(C#/Go/Lua/SQL/Ruby/PHP/Gradle + the existing Java/Rust/JS-TS/HTML/CSS/JSON/YAML/Python) — so diff
code is highlighted in both the unified and split views.

**What shipped** (commit `295ff6c`, 2026-06-28) — render-side only, reusing #227's pure surface (no
backend/`git.rs` change):

- **`src/components/DiffInspector/DiffInspector.tsx`:** imported `prismLang` (`../FileViewer/
  fileType`) + `highlightToHtml` (`../FileViewer/prism`). `DiffFile` detects the language **once
  per file** from its `path` (`const lang = prismLang(file.path)`; `undefined` → plain text). A
  shared **`CodeContent`** component renders each line's code via `dangerouslySetInnerHTML={{
  __html: highlightToHtml(text, lang) }}` when `lang` is known (else plain text), and replaces the
  plain-text `content` spans in **both** `UnifiedRow` and `SplitRow`. The `+`/`−`/` ` markers and
  add/del/context row background classes are unchanged. Per-line tokenization (lightweight; accepts
  imperfect cross-line constructs), bounded by the existing `MAX_DIFF_ROWS` cap.
- **`DiffInspector.module.css`:** Prism token styling for the diff's `.content` spans mirroring the
  FileViewer's `--syn-*` palette (shared source of truth), so the two viewers match and colors read
  well on the add/del row backgrounds.

**Key files touched:** `src/components/DiffInspector/DiffInspector.tsx` (language detect + shared
`CodeContent` in both row types), `src/components/DiffInspector/DiffInspector.module.css` (diff
token CSS).

**Dependencies:** **#227** — which provides the extended language set and the
`prismLang`/`highlightToHtml` surface this task consumes (both touch the shared highlight infra).

**Notes**

- **Safety:** `highlightToHtml` HTML-escapes its input (Prism + the `escapeHtml` fallback), so the
  injected markup carries no raw file HTML — `dangerouslySetInnerHTML` has no injection vector; an
  uncurated file type falls back to escaped plain text.
- **Cross-platform:** pure frontend; language detection is by file extension on repo-relative
  `/`-separated diff paths; no OS-specific code; identical on macOS and Windows.
- **Out of scope:** context-aware multi-line tokenization (per-line is sufficient/lightweight),
  intra-line word-level diff highlighting, adding languages (that was #227), and the diff
  data/backend (unchanged).

---

### 230. [x] Add a "Commits" source to the diff viewer (list commits → show a commit's diff)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

Adds a third **"Commits"** source to the diff viewer alongside the existing **Working** (working
tree vs HEAD) and **Compare** (two-branch, #81) sources. In Commits mode the viewer lists recent
commits, and selecting one shows that commit's diff in the same diff body — a read-only feature
consistent with the read-mostly git rule (#27/#81).

**What shipped** (commit `085b355`, 2026-06-28):

- **Backend — two new read-only git commands (`src-tauri/src/git.rs`, `commands.rs`, `lib.rs`):**
  - **`list_commits(cwd, limit)`** → `Vec<CommitInfo>` (`{ sha, short_sha, author, date, subject }`)
    via a NUL-delimited `git log` (`--pretty=format:%H%x00…%x00%s --date=short`), **bounded to
    100** with the cap surfaced; empty/non-git/no-commits → empty list (no error wall).
  - **`commit_diff(cwd, sha)`** → the same `WorkingDiff`/`FileDiff` shape via `git show
    --format= <sha>` parsed by the existing shared **`parse_unified_diff`**, handling both normal
    and **root** commits. Both go through the cross-platform `run_git`/hidden-command helper;
    unit-tested against a temp repo (normal + root commit, and the non-git empty case).
- **Persistence (`src-tauri/src/store.rs` + `src/store.ts` + `src/types/index.ts`):** the repo's
  diff panel gains `commit_sha: Option<String>` and `diff_source: "commits"`, so a configured
  Commits view (source + selected sha) survives view switches / restart — mirroring how compare
  base/target persist.
- **Frontend (`src/components/DiffInspector/DiffInspector.tsx` + `.module.css`, `src/ipc.ts`):**
  added `"commits"` to `DiffSource` + a **Commits** toggle entry, a **commit picker** (short sha +
  subject + author · date), and selected-commit diff rendering reusing the existing
  `DiffFile`/file-list/body. The Unified/Split toggle works unchanged, and #229's syntax
  highlighting applies to commit diffs for free. Typed `commitList`/`commitDiff` IPC wrappers +
  `CommitInfo` type added.

**Key files touched:** `src-tauri/src/git.rs` (`list_commits` + `commit_diff` + tests),
`src-tauri/src/commands.rs` + `lib.rs` (command registration), `src-tauri/src/store.rs` +
`src/store.ts` + `src/types/index.ts` (`commit_sha` persistence + `CommitInfo`), `src/ipc.ts` (IPC
wrappers), `src/components/DiffInspector/DiffInspector.tsx` + `.module.css` (Commits toggle +
picker + rendering).

**Dependencies:** none — a new read-only feature on the shipped `DiffInspector` (#39/#81), reusing
`parse_unified_diff`. Note: #229's diff highlighting applies to commit diffs automatically, and the
later **diff-viewer redesign (#231)** depends on this task to keep "commits" available.

**Notes**

- **Cross-platform:** all git access uses the existing `run_git`/hidden-command helper (the
  `CREATE_NO_WINDOW` console-flash guard on Windows); the parser + UI are platform-neutral.
- **Out of scope (as shipped):** the broader diff-viewer UI redesign (#231), pagination / "load
  more" beyond the bounded 100 (cap surfaced), and combined/merge-commit multi-parent diffs beyond
  git's default `show` behavior. Read-only — no checkout-to-commit or any git write.

---

### 231. [x] Redesign the diff viewer UI with selectable display modes (Accordion + Focused single-file)

**Status:** Done
**Depends on:** #229, #230
**Created:** 2026-06-28

**Description**

Redesign the `DiffInspector` to be more polished and improve the reading experience, with a
**setting** to pick the display mode and two modes (default **Focused single-file**), while keeping
**all existing functionality** (Working / Compare #81 / Commits #230 sources, worktree diffs, the
Unified/Split toggle, working-tree polling, and #229 syntax highlighting). Implemented to match two
user-provided wireframes (Accordion 01 + Focused 03, transcribed in the plan).

**What shipped** (commit `610e2f6`, 2026-06-28) — frontend-only, **no backend/type change** (the
`FileDiff`/`WorkingDiff` data already carried status, +/− counts, and the summary):

- **Setting (`src/types/index.ts`, `src/store.ts`, `src/components/Settings/Settings.tsx`):** added
  `diffDisplayMode: "focused" | "accordion"` to `Settings` + `DEFAULT_SETTINGS` (**default
  `"focused"`**), surfaced as a segmented control in Settings → **Behavior** (mirroring
  `canvasCloseBehavior`), persisted via the existing `settings` blob.
- **DiffInspector (`DiffInspector.tsx` + `.module.css`):** a local `displayMode` state seeded once
  from `settings.diffDisplayMode`, plus an **in-panel Focused/Accordion toggle** for quick
  per-panel switching (the Settings value stays the persistent default). The source
  (Working/Compare/Commits) + branch pickers + Unified/Split toggle stay above the file display in
  both modes.
  - **Focused mode (default):** one file fills the body with a nav strip — **‹ prev**, a center
    **picker pill** (status badge + filename + `i/N` index + ▾ caret → a jump popover listing
    files), **› next** (cycles, wraps) — and a file sub-header (path + counts).
  - **Accordion mode:** single-open file **cards** (status badge + filename with the muted subpath
    on a second line + `+N −M` counts); expanding one collapses the previously open one and reads
    its diff inline; the header shows `repo · branch` + "N files changed +X −Y" + Unified/Split.
- Both modes render the file diff via the existing `DiffFile` → `UnifiedRow`/`SplitRow`, so #229
  per-line highlighting and the Unified/Split toggle are inherited unchanged.

**Key files touched:** `src/components/DiffInspector/DiffInspector.tsx` + `.module.css` (the two
modes + in-panel toggle), `src/components/Settings/Settings.tsx` (the Behavior segmented control),
`src/store.ts` (`DEFAULT_SETTINGS`), `src/types/index.ts` (`Settings.diffDisplayMode`).

**Dependencies:** **#229, #230** — the redesign must preserve **Commits (#230)** and inherit
**highlighting (#229)**, and all three edit `DiffInspector`, so it landed after them. Also builds
on #81 (Compare source) and the Settings infrastructure.

**Notes**

- **Cross-platform:** pure frontend; `repo · branch` uses `repoName` (`/` or `\` split, #143); no
  OS-specific code, no new git/backend calls; renders identically on macOS and Windows.
- **Out of scope:** new diff data (everything needed already existed), a third display mode, a
  persisted **per-panel** mode override (a global default + in-panel session toggle is enough —
  per-panel persistence deferred), and changing the diff sources themselves.

---

### 232. [x] Scheduled task time: show only the time when the date is today

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

A scheduled session in the left panel showed its full date and time (e.g. "Jun 21, 3:45 PM"). When
the scheduled date is **today**, it now shows **only the time** (e.g. "3:45 PM") to keep the UI
cleaner; a schedule on any other day keeps the full date + time.

**What shipped** (commit `0d7b6f0`, 2026-06-28) — a small, self-contained tweak to the shared time
helper:

- **`src/time.ts`:** `formatFireTime(fireAt, now = new Date())` now branches on whether the fire
  time falls on the **same local calendar day** as `now` — time-only (`{ hour:"numeric",
  minute:"2-digit" }`) when today, else the existing month/day + time. An **injectable `now`
  parameter** makes the "today" check unit-testable with a fixed clock (callers still pass only
  `fireAt`). Applied in the **shared** helper, so both the sidebar `ScheduleRow` label and the
  Overview `ScheduleCard` get the cleaner display consistently; the sidebar row's full-date hover
  tooltip is unchanged.
- **`src/time.test.ts`:** +1 case (today → time-only, other day → date + time) with a fixed `now`;
  existing tests made clock-independent.

**Key files touched:** `src/time.ts` (`formatFireTime`), `src/time.test.ts` (tests).

**Dependencies:** none — builds on the shipped schedule time helper (#93/#94).

**Notes**

- **Cross-platform:** pure frontend; `toLocaleString` locale formatting is identical on macOS and
  Windows; no OS-specific code.
- **Out of scope:** the `datetime-local` editor (`toLocalInput`) + schedule data (unchanged),
  "tomorrow"/relative wording (only today → time-only; other days keep the absolute date).

---

### 233. [x] Redesign the in-app Kanban board UI (cards, columns, inline composer, per-column accents)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

Reinvent the in-app **KanbanPanel** UI (#141–#151) to be cleaner and use space more efficiently:
checkbox pinned top-left with card text using the full width, dimmed monospace detail/meta lines,
an inline add-card composer, and redesigned per-column headers each with their own accent color —
all without changing the markdown Kanban format.

**What shipped** (commit `0ecc5e5`, 2026-06-28) — UI/CSS only, **engine/markdown format
unchanged** (the `kanban.ts` model already round-trips per-card detail lines):

- **Card layout (`KanbanPanel.tsx` + `KanbanPanel.module.css`):** restructured so the optional
  #194 **checkbox sits top-left** with the **title flowing full-width** to its right and tight
  padding. The **whole card is the drag grip** (via the 4px pointer activation-distance guard, like
  the sidebar rows / Canvas headers — no separate grip column); interactive controls
  `stopPropagation` so click-to-edit / checkbox toggle still work.
- **Detail/meta lines:** restyled `.cardBody` to **dimmed monospace** secondary lines (`--mono`,
  muted color, small size) beneath the main text — keeping **ReactMarkdown** so links + interactive
  task checkboxes (#194) still work; only the styling changed (matching READY-card `Plan:` /
  `Depends on:` styling).
- **Inline add-card composer:** replaced the immediate-edit flow with a multi-line `<textarea>`
  (placeholder "Write a card… Shift+Enter for detail lines") + **Add card** / **Cancel** buttons —
  **Enter submits**, **Shift+Enter** inserts a detail line, **first line → title, rest → body** →
  `addCard(...)`. Opened by the column-header **"+"** and the bottom **dashed "+ Add card"**.
- **Column header + accents:** redesigned to an **accent dot + UPPERCASE letter-spaced name + count
  pill + "+" button** (delete kept, hover-revealed #195). Each column gets a **deterministic accent
  color** derived from `REPO_PALETTE` by column index (no persistence — the markdown format has
  nowhere to store color), applied to the dot + a subtle column accent.

**Key files touched:** `src/components/Kanban/KanbanPanel.tsx` (card restructure + composer + column
header + accent), `src/components/Kanban/KanbanPanel.module.css` (the new card/composer/header
styles). No `kanban.ts` engine change.

**Dependencies:** none — builds on the shipped KanbanPanel (#141–#151), #194 (optional checkbox),
#195 (hover actions), and the `repoColor`/`REPO_PALETTE` palette.

**Notes**

- **Cross-platform:** pure frontend; monospace detail lines use the bundled offline `--mono`
  (JetBrains Mono); column accents derive from the existing palette; plain-color fallbacks ship
  alongside any `color-mix`; renders identically on macOS (WKWebView) and Windows (WebView2).
- **Round-trip preserved:** `parseBoard`/`serializeBoard` are untouched, so cards with detail
  lines, the optional checkbox, the `**Complete**`/`%% kanban:settings %%` blocks, and the
  Board/Raw toggle (#147/#149) all behave as before.
- **Out of scope:** the Kanban engine/markdown format, persisting column colors/order in the `.md`,
  DnD mechanics (#143 — only the grip affordance changed), and new card fields beyond markdown body
  lines.

---

### 234. [x] Kanban card hover-lift animation (drag affordance)

**Status:** Done
**Depends on:** #233
**Created:** 2026-06-28

**Description**

Make an in-app Kanban card lift slightly on hover — a smooth, subtle animation with a little flair
— so the user understands the card is draggable. Direct user request (2026-06-28): "jump up
slightly when hovered… smooth animation with a little bit of flair… but don't overdo it."

**What shipped** (commit `d9137e6`, 2026-06-28) — **CSS-only** in
`src/components/Kanban/KanbanPanel.module.css`:

- Added a `transition` on `.card` for `transform` + `box-shadow` (`var(--dur-fast)
  var(--ease-out)`), and a hover rule **`transform: translateY(-2px)` + a soft
  `box-shadow: 0 4px 12px rgba(0,0,0,0.28)` + `cursor: grab`** (with `cursor: grabbing` on
  `:active`) — a ~2px rise that eases in and out, understated.
- **Scoped so it never fights dnd-kit's inline drag transform:** the hover rule is gated
  `:not(.cardPlaceholder):not(.cardOverlay)` (the drag-state classes in use), so the lift doesn't
  apply to the placeholder or the drag overlay.
- **Reduced-motion aware:** since the global `body.reduce-motion` killswitch only zeroes the
  transition *duration*, a scoped `body.reduce-motion .card:…:hover` rule neutralizes the lift
  itself (`transform`/`box-shadow: none`), leaving just the calm border/cursor cue.

**Key files touched:** `src/components/Kanban/KanbanPanel.module.css` (the `.card` transition +
scoped `:hover` lift + reduced-motion override).

**Dependencies:** **#233** — both edit the `.card` style; #233 established the redesigned card's
resting look and this lift is layered on top (sequenced after to avoid conflicts).

**Notes**

- **Cross-platform:** pure CSS; `translateY`/`box-shadow`/`transition` render identically in
  WKWebView (macOS) and WebView2 (Windows); plain-color shadow, no macOS-only effects.
- **Out of scope:** the broader Kanban redesign (#233), DnD mechanics (#143), and lift on non-card
  elements (columns/composer).

---

### 235. [x] SkillAutocomplete: open the slash-command dropdown above the textarea

**Status:** Done
**Depends on:** none _(independent — touches only the shipped #114 SkillAutocomplete component)_
**Created:** 2026-06-28

**Description**

The `/`-triggered slash-command autocomplete (#114) — the shared `SkillAutocomplete` component used
by the **NewSessionModal schedule step** and the **ScheduledPanel** prompt editors — rendered its
dropdown menu **below** the prompt textarea, where it overlapped the UI directly beneath it (the
"Name (optional)" field + actions row in the schedule step; the actions row in the ScheduledPanel),
reading as poorly positioned. User request (the "Skill detection for schedule" card, 2026-06-28):
show the dropdown **above** the textarea, in the empty space.

**What shipped** (commit `8454ed9`, 2026-06-28) — a **pure-CSS, reposition-only** change in
`src/components/SkillAutocomplete/SkillAutocomplete.module.css`:

- Flipped the `.menu` rule's vertical anchor from the textarea's **bottom** edge
  (`top: calc(100% + var(--space-2))`) to its **top** edge
  (`bottom: calc(100% + var(--space-2))`), so the menu grows **upward**. A comment documents why
  (both call sites have UI directly below the prompt).
- Everything else in the rule is unchanged — `position: absolute`, `z-index`, `right`/`left`,
  `max-height: 220px`, `overflow-y: auto`, padding, border, background, and `box-shadow` — so the
  popover's appearance, the 220px cap, and internal scroll for long lists all stay identical; only
  the side it anchors to moved. The `max-height` now caps upward growth.
- **No TSX change.** The menu is absolutely positioned, so DOM order doesn't affect where it paints;
  the menu element carries `.wrap` (`position: relative`) alongside `.wrapFill`, so it still anchors
  correctly in the ScheduledPanel's `fill` mode without a `.wrapFill` edit. Trigger logic, keyboard
  handling (↑/↓/Enter/Tab/Escape), filtering, insertion, and the container-key guard are untouched.

**Key files touched:** `src/components/SkillAutocomplete/SkillAutocomplete.module.css` (the `.menu`
anchor flip + explanatory comment).

**Dependencies:** none — independent; only adjusts the shipped #114 `SkillAutocomplete` styling, so
the single CSS change fixes both schedule-prompt surfaces at once.

**Notes**

- **Cross-platform:** styling-only with no OS-specific code path; renders identically in WKWebView
  (macOS) and WebView2 (Windows) — no `platform`/`#[cfg]` gating needed.
- **Reduced-motion:** the dropdown has no animation, so flipping the anchor has no motion
  implications.
- **Out of scope:** which skills are detected/offered, the trigger/keyboard logic, broader visual
  restyling, and smart/auto-flip positioning (explicitly declined — the menu always renders above).

---

### 236. [x] Show the current branch on its own line under each sidebar folder header (reuse the worktree branch indicator)

**Status:** Done
**Depends on:** none _(builds on already-shipped code: the #225 inline branch badge + sync, the #212 `branches` map / `refreshBranches`, the #197 worktree Overview filter, and the worktree branch indicator)_
**Created:** 2026-06-28

**Description**

#225 had shipped each top-level sidebar repo/folder header's current git branch as an
**inline, truncating badge next to the repo name**, sharing the single header row with the
name, the session count, and the `+` button. A long branch name truncated early and crowded
or broke that header layout. This task **moved the branch to its own dedicated line directly
below the repo header** (above the session rows), restyled to echo the existing **worktree
branch indicator** (`GitBranch` icon + muted branch text), so a long branch name occupies a
full line and never competes for header space. The #225 branch **data and sync** were reused
unchanged — only the rendering location and style changed.

**What shipped** (commit `e0fec7b`, 2026-06-28) — a **pure-frontend** change in
`src/components/Sidebar/Sidebar.tsx` + `Sidebar.module.css`:

- **Removed** the inline `branches[repo] && <span className={styles.repoBranch}>…</span>`
  badge from inside the `.repoTitle` button in `RepoGroup`, and **deleted** the now-unused
  `.repoBranch` CSS rule.
- **Added** a new branch line directly below the `.repoHeader` `<div>` (still inside `.group`,
  before `repoSessions.map(...)`), rendered only when `branches[repo]` is truthy. It is a
  `<button type="button">` containing a `GitBranch` icon (`size={12}`, `strokeWidth={1.5}`,
  `aria-hidden`) plus a `<span>` with the branch text (`title={branches[repo]}`). Its `onClick`
  runs `setOverviewRepoFilter(repo); setView("overview")` (same toggle as clicking the repo
  name, #34), with `aria-pressed={isFiltered}` and a `Filter Overview to <repo>` title.
- **CSS:** a `.repoBranchLine` rule (flex row, `align-items: center`, `gap: --space-6`, full
  width, `height: 22px`, `padding: 0 --space-8 0 --space-16` so the `GitBranch` icon lands in
  the same 16px icon column as the repo's Folder marker #128 / the agent rows' activity dots
  #95 — putting the branch text directly under the repo name; transparent button reset like
  `.repoTitle`/`.worktreeName`); a `.repoBranchText` (mono, `--text-muted`, `--fs-meta-xs`,
  ellipsis-truncate with `min-width: 0` safety net); `:hover` → `--text-secondary`; and a
  `.repoBranchActive` → `--accent` when the repo's Overview filter is active (mirroring
  `.worktreeActive .worktreeName`). No worktree sub-group left-border framing.
- **Restored** `.repoName` to `flex: 1` (reverting the #225 `flex: 0 1 auto`) so the name
  reclaims the header width now that no inline badge shares the row; `.count` stays
  right-aligned via `margin-left: auto` and the `+` is unaffected.

**Key files touched:** `src/components/Sidebar/Sidebar.tsx` (RepoGroup — remove inline badge,
add the below-header branch button) and `src/components/Sidebar/Sidebar.module.css`
(`.repoBranchLine`/`.repoBranchText`/`.repoBranchActive`/`.repoBranchIcon` added, `.repoBranch`
removed, `.repoName` reverted to `flex: 1`).

**Dependencies:** none — pure rendering change layered on already-shipped, archived work.

**Notes**

- **Out of scope (kept unchanged):** the #225 sync logic (the `branches` map,
  `refreshBranches`, the #212 busy→idle edge refresh, and the focus/visibility/~15s-poll
  effect); the collapsed icon rail (no room for a text branch line); worktree sub-group
  headers (`WorktreeHeader` already shows their own branch); the Overview/Canvas agent-header
  folder+branch indicator (#226); and all backend code (none needed).
- **Cross-platform:** pure frontend. Branch reads go through the existing cross-platform
  `current_branches` git shell-out (no change); plain CSS renders identically in WKWebView
  (macOS) and WebView2 (Windows) — no `platform`/`#[cfg]` gating needed.

---

### 237. [x] Persist the diff viewer's display modes (focus/accordion + unified/split) so the last choice becomes the default for new viewers

**Status:** Done
**Depends on:** none _(builds on shipped code: #231 display mode + the `diffDisplayMode` setting, #230 commits, #81 branch compare)_
**Created:** 2026-06-28

**Description**

The diff viewer (`DiffInspector`) has an in-panel **focus/accordion** display toggle (#231)
and a **unified/split** line toggle. Previously, changing either only updated that panel's
local React state — the choice was **not remembered**, so the next diff viewer opened reverted
to the global default. This task made the **last-chosen display mode the default for
newly-opened diff viewers** by persisting both display-style toggles to settings, while keeping
each open panel's mode independent (only *new* viewers inherit a change). The **source** toggle
(working / compare / commits) was deliberately left non-persisted.

**What shipped** (commit `483a14e`, 2026-06-28) — a **pure-frontend** change:

- **New setting:** added `diffLineMode: "unified" | "split"` to the `Settings` type
  (`src/types/index.ts`, beside `diffDisplayMode`) and `diffLineMode: "unified"` to
  `DEFAULT_SETTINGS` (`src/store.ts`). Older `settings.json` blobs upgrade cleanly via the
  existing `DEFAULT_SETTINGS` merge — no backend change (settings persist as one opaque blob).
- **Seed line mode from settings:** in `DiffInspector.tsx`, changed the `mode`
  (`DiffMode = "unified" | "split"`) state from a hardcoded `useState<DiffMode>("unified")` to
  `useState<DiffMode>(() => useStore.getState().settings.diffLineMode)` — mirroring how
  `displayMode` already seeds from `diffDisplayMode`. Seed-once + local-state structure
  preserved, so already-open panels keep their mode (decision (2)).
- **Persist on toggle:** added `chooseDisplayMode(next)` and `chooseLineMode(next)` wrappers
  that set local state **and** call `saveSettings({ ...useStore.getState().settings,
  diffDisplayMode/diffLineMode: next })` (reading settings at call time so a concurrent change
  to another field isn't clobbered). The focus/accordion buttons wire to `chooseDisplayMode`,
  the unified/split buttons to `chooseLineMode`. The `source` toggle was untouched.
- **Settings control:** added a sibling "Diff line mode" segmented control (Unified / Split,
  `update("diffLineMode", v)` / `draft.diffLineMode`) beside the existing "Diff display mode"
  control in `Settings.tsx`, keeping the two display-style toggles symmetric and the
  single-source-of-truth invariant (Settings reflects the last in-panel choice).

**Key files touched:** `src/types/index.ts` (new `diffLineMode` type field), `src/store.ts`
(`DEFAULT_SETTINGS` default), `src/components/DiffInspector/DiffInspector.tsx` (seed `mode` from
settings + `chooseDisplayMode`/`chooseLineMode` persisting wrappers), and
`src/components/Settings/Settings.tsx` (new "Diff line mode" segmented control).

**Dependencies:** none — pure rendering/settings change layered on shipped, archived work.

**Notes**

- **Single source of truth:** the in-panel toggle writes to the **same** persisted settings
  value the Settings control drives — no separate "last used" field; `diffDisplayMode` reused,
  `diffLineMode` added.
- **Only new viewers:** seed-once + per-panel local state means persisting to settings does not
  re-read into mounted panels, so open panels keep their mode while newly-mounted panels seed
  from the updated setting (decision (2) — `displayMode`/`mode` deliberately NOT read live).
- **Out of scope (unchanged):** the source toggle (working/compare/commits); the selected
  commit / branch-compare persistence (already handled, #81/#230); any backend change;
  live-syncing already-open panels.
- **Cross-platform:** pure frontend; settings persist via the existing cross-platform
  `set_settings` blob. No OS-specific code — identical on macOS and Windows.

---

### 238. [x] Overhaul Kanban card interaction + unify the create/edit UI into a single-field composer (drag-only card surface, non-overlaying buttons)

**Status:** Done
**Depends on:** none _(builds entirely on shipped Kanban code: #143 DnD, #160 commit-on-confirm, #161, #173 task-list checkboxes, #194, #233 card redesign)_
**Created:** 2026-06-28

**Description**

The Kanban board's card create and edit UIs had diverged. **Create** already used a clean
single-textarea composer (first line → title, rest → body; Enter submits, Shift+Enter adds a
line; an action row in normal flow). **Edit** used two separate fields (a title `<input>` +
body `<textarea>`) plus an **absolutely-positioned action overlay** (Done/Trash) that sat *on
top of* the text, and the card **title was a click-to-edit button**, mixing the click-to-edit
and click-to-drag gestures. This task **made the whole card surface drag-only** and **unified
create + edit into one single-field composer-style UI**, with edit-mode buttons in normal flow
(no overlay).

**What shipped** (commit `16dc17e`, 2026-06-28) — a **pure-frontend** change in
`src/components/Kanban/KanbanPanel.tsx` + `KanbanPanel.module.css`:

- **Drag-only card surface:** the view-mode title became non-interactive display text (part of
  the drag grip, keeping the `.untitled` fallback + `.cardDone` strikethrough) — its
  click-to-edit `onClick` removed. Editing is now reachable only via the **pencil** button and
  deleting only via the **trash** button. The hover/focus `.cardActions` overlay (pencil +
  trash) renders **only in view mode**.
- **Single-field edit:** replaced the title input + body textarea + overlay with one
  composer-style `<textarea>` (Enter → commit, Shift+Enter → newline, Escape → cancel;
  `autoFocus`, `noDrag`) followed by a **flow action row** — **Save** + **Cancel** grouped
  left, **Delete** pushed right (`.cardEditActions` / `.cardEditDelete`, mirroring
  `.composer*`). The checkbox/title row is hidden while editing.
- **Shared parse helper:** extracted module-level `splitCardText(text): { title, body }`
  (first line → title, rest → body, trimmed) and used it in **both** `submitComposer` and the
  edit commit, so create/edit parsing can't diverge. The edit draft changed from a
  `{ title, body }` object to a single `editText: string` seeded as
  `card.title + (card.body ? "\n" + card.body : "")`; `CardProps`/`BoardColumn`/`KanbanPanel`
  wiring updated (`editText` + `onEditTextChange` + `onCancelEdit` replacing `draft`/
  `onDraftChange`; added a `cancelCardEdit` discard path alongside the commit `stopCardEdit`).
- **Commit-on-blur preserved:** click-away still commits (Save/Cancel/Delete are inside the
  card so they don't trigger a premature blur-commit); Cancel/Escape discard.
- **CSS:** added the edit textarea + action-row styles (mirroring `.composerInput` /
  `.composerActions`, right-aligned subtle-danger Delete); removed the now-unused
  `.cardTitleInput` + `.cardBodyInput`; dropped `cursor: text` from `.cardTitle`. View-mode
  `.cardActions`/`.cardBtn` kept.

**Key files touched:** `src/components/Kanban/KanbanPanel.tsx` (drag-only title, view-only
overlay, single-textarea edit + `splitCardText` shared by create/edit, `editText` state +
`cancelCardEdit`) and `src/components/Kanban/KanbanPanel.module.css` (edit textarea/action-row
styles added, `.cardTitleInput`/`.cardBodyInput` removed, `.cardTitle` `cursor` dropped).

**Dependencies:** none — pure-frontend interaction/UI change on shipped, archived Kanban code.

**Notes**

- **User decisions:** edit action row = **Save + Cancel + Delete** (Delete right-aligned);
  click-away **commits** (Cancel is the discard path); body **task-list checkboxes + links**
  and the card's **done-checkbox** stay clickable in view mode (only the surface/title drags).
- **Out of scope (unchanged):** the create composer's existing behavior (only class reuse),
  `CardPreview`/DragOverlay, the DnD wiring + 4px activation, the Board/Raw toggle, column
  rename/add/delete, the `kanbanOps`/`kanban.ts` markdown engine (title + body serialize
  identically), and the autosave/commit-on-confirm plumbing (#160). The sibling Kanban Refine
  cards (column colors, bigger Add/Cancel buttons) are independent.
- **Cross-platform:** pure frontend; no OS-specific paths or shell-outs — renders identically
  in WKWebView (macOS) and WebView2 (Windows).

---

### 239. [x] Add a Settings section to configure Kanban column colors by name (with a hashed-name fallback)

**Status:** Done
**Depends on:** none _(builds on shipped Kanban #143/#145/#151/#233 + the settings + swatch-picker infrastructure #100/#102)_
**Created:** 2026-06-28

**Description**

Kanban board columns were previously colored **by position** (`accent = REPO_PALETTE[col %
len]`), with no way for the user to control the color and nowhere in the markdown format to
store it. This task lets the user **configure Kanban column colors by column name** via a new
**Settings section**, applied **globally** to every board, with a deterministic hashed-name
fallback for any column not explicitly configured.

**What shipped** (commit `6e8917c`, 2026-06-28) — a **pure-frontend** change:

- **New setting:** added `kanbanColumnColors: { name: string; color: string }[]` to the
  `Settings` type (`src/types/index.ts`), seeded in `DEFAULT_SETTINGS` (`src/store.ts`) with
  the three default column names **"To Do" / "Doing" / "Done"** (each mapped to its hashed-name
  color so the seed matches an unconfigured board). Persists via the existing opaque settings
  blob — old `sessions.json` upgrades cleanly via the `DEFAULT_SETTINGS` merge.
- **Pure color helper:** added + exported `kanbanColumnColor(name, configured)` in `store.ts`
  (beside `repoColor`) — returns the configured entry's color on a **case-insensitive, trimmed**
  name match, else hashes the name into `REPO_PALETTE` via the existing `hashString` (stable per
  name, nothing persisted for unlisted names). Covered by new unit tests in `store.test.ts`
  (exact + case-insensitive match, deterministic fallback, same-name stability).
- **Applied in the board:** `BoardColumn` (`KanbanPanel.tsx`) now reads
  `s.settings.kanbanColumnColors` and computes `accent = kanbanColumnColor(props.name, …)`,
  replacing the index-based derivation — `--col-accent` (top border, header dot, composer
  border) follows automatically, no CSS change to the board.
- **New "Kanban" Settings section:** added to the `Section` union + `SETTINGS_SECTIONS` nav
  (Lucide icon) with an editable list of column-color rows — each row an editable **name**
  input + a **color picker** reusing the Accent/repo `.swatches`/`.swatch` Catppuccin swatches
  **plus a "+" swatch** opening a free `<input type="color">` (a deliberate, user-requested
  exception to the palette-only convention) + a **remove** (×) button, and an **Add column
  color** button. All mutations route through `update("kanbanColumnColors", …)` so they apply on
  **Save** (`Settings.tsx` + `Settings.module.css`).

**Key files touched:** `src/types/index.ts` (new field), `src/store.ts` (default + exported
`kanbanColumnColor` helper), `src/store.test.ts` (helper tests), `src/components/Kanban/
KanbanPanel.tsx` (name-based accent lookup), and `src/components/Settings/Settings.tsx` +
`Settings.module.css` (new "Kanban" section + per-row swatch/free-picker UI).

**Dependencies:** none — independent of the sibling "bigger Add card/Cancel buttons" card
(#240); both touch Kanban/Settings but neither blocks the other.

**Notes**

- **User decisions:** by **name, global** (not by position, no per-board override — the markdown
  can't hold color); pre-populate the three `defaultBoard()` column names; **unlisted names →
  deterministic hashed-name Catppuccin color** (explicitly chosen over "random each time" to
  avoid flicker); picker = Catppuccin swatches + a "+" free color picker.
- **Data shape:** an ordered `{name,color}[]` array (not a `Record`) so the Settings list has
  stable row order and supports blank/duplicate-name rows mid-edit; the lookup resolves the
  first matching name.
- **Cross-platform:** pure frontend; settings persist via the existing cross-platform
  `set_settings` blob; `<input type="color">` works in both WKWebView (macOS) and WebView2
  (Windows). No OS-specific code.

---

### 240. [x] Make the Kanban "Add card" / "Cancel" buttons roomier (fix their dropped padding from the undefined `--space-10` token)

**Status:** Done
**Depends on:** none _(builds on shipped Kanban CSS #233/#238; independent of #239 though both touch `KanbanPanel.module.css` in different rules)_
**Created:** 2026-06-28

**Description**

The Kanban add-card composer's **"Add card"** and **"Cancel"** buttons looked cramped (text
flush to the edges). The root cause was a **bug**, not just styling: both declared
`padding: var(--space-2) var(--space-10)`, but **`--space-10` is undefined** in `tokens.css`
(the scale is `--space-1/2/4/6/8/12/16/20/24/32`). A `var()` to an undefined property with no
fallback makes the whole `padding` shorthand invalid-at-computed-value, collapsing it to `0`.
This task gave the two buttons comfortable padding by replacing the broken token with defined
spacing tokens.

**What shipped** (commit `2d21f9b`, 2026-06-28) — a **pure-CSS** change in
`src/components/Kanban/KanbanPanel.module.css`:

- Changed `.composerAdd` padding from `var(--space-2) var(--space-10)` to
  `var(--space-6) var(--space-12)` (6px vertical, 12px horizontal), with an explanatory comment
  on the undefined-token bug.
- Matched `.composerCancel` to the same `var(--space-6) var(--space-12)` so the two buttons stay
  the same height/size.
- Font size unchanged (`--fs-meta-sm` = 11px); only padding changed. Because **#238** made the
  inline-edit **Save**/**Cancel** buttons reuse these same two classes, they inherit the roomier
  padding too (intended/consistent).

**Key files touched:** `src/components/Kanban/KanbanPanel.module.css` (`.composerAdd` +
`.composerCancel` padding).

**Dependencies:** none.

**Notes**

- **User decisions:** scope = **just the two Kanban composer buttons** (which also cover #238's
  edit Save/Cancel via shared classes); **more padding only**, keep 11px text; target
  ≈`var(--space-6) var(--space-12)`.
- **Out of scope (flagged for a separate card):** the same undefined-`--space-10` bug at ~6
  other sites (FileViewer, DiffInspector, Canvas, TemplateEditor) and two other `--space-10`
  uses elsewhere in `KanbanPanel.module.css` — a companion Refine card tracks fixing it
  app-wide (became #242). This task did not depend on it.
- **Cross-platform:** pure CSS, no OS-specific anything — renders identically in WKWebView
  (macOS) and WebView2 (Windows).

---

### 241. [x] Add an attention-grabbing glowing tooltip beside the sidebar feedback (bug-report) button

**Status:** Done
**Depends on:** none _(independent frontend feature on shipped code: #210 feedback button, #216/#217 glow pattern + `openUrl`)_
**Created:** 2026-06-28

**Description**

The sidebar footer's **feedback / bug-report button** (#210, a `Bug` icon at the bottom-left)
was easy to miss. This task added an **attention-grabbing, glowing tooltip** to the right of it
reading **"Report bugs and request features"**, shown automatically on every app launch to draw
the eye, then auto-hiding.

**What shipped** (commit `7d9c82d`, 2026-06-28) — a **pure-frontend** change in
`src/components/Sidebar/Sidebar.tsx` + `Sidebar.module.css`:

- **State + timer:** `Sidebar()` got a `feedbackNudgeDismissed` state (starts `false`); the
  nudge shows when `!feedbackNudgeDismissed && !sidebarCollapsed`. A `useEffect` keyed on that
  visible condition starts a **10s** `setTimeout` to dismiss (cleared on unmount/dismiss), so it
  appears on **every** launch with no persisted "seen" flag (no backend change).
- **Dismiss on interaction:** the feedback button got `onMouseEnter` + `onFocus` handlers that
  dismiss the nudge immediately (clicking implies hover, covering the open-form path); its
  existing `title`/`aria-label` are unchanged.
- **Tooltip render (no clipping):** rather than an absolutely-positioned sibling that a footer
  `overflow` could clip, the pill is rendered at a **fixed position** computed from the button's
  `getBoundingClientRect()` (`feedbackNudgePos = { top: r.top + r.height/2, left: r.right + 8 }`),
  so the full text shows at any sidebar width. It is `pointer-events: none` + `aria-hidden="true"`
  (the button is already labeled). Not rendered in the collapsed icon rail.
- **Glow styling:** `.feedbackNudge` is a small rounded pill (`--bg-elevated` bg, `--accent`
  border, accent glow `box-shadow`) with a gentle pulsing animation echoing the #216
  `update-announce` keyframe (box-shadow/border only → no layout shift). Under reduced motion
  the pulse drops to a static accent glow (the keyframe resolves to the resting style so a
  clamped run settles).

**Key files touched:** `src/components/Sidebar/Sidebar.tsx` (nudge state/timer, fixed-position
pill, button hover/focus dismiss) and `src/components/Sidebar/Sidebar.module.css`
(`.feedbackNudge` pill + glow/pulse + reduced-motion handling).

**Dependencies:** none.

**Notes**

- **User decisions:** **every launch** (no persistence); **expanded sidebar only** (skip the
  collapsed rail); text exactly "Report bugs and request features".
- **Reuse references:** the #216 `update-announce` glow keyframe as the pulse template
  (reduced-motion safe); `FEEDBACK_FORM_URL` + `openUrl` (#210/#217) unchanged.
- **Cross-platform:** pure React + CSS; no OS-specific code. The Sidebar mounts only in the
  main window — renders identically in WKWebView (macOS) and WebView2 (Windows).

---

### 242. [x] Fix the undefined `--space-10` token app-wide (replace every use with `--space-12`)

**Status:** Done
**Depends on:** none _(independent of #240, which fixed the two Kanban composer buttons specifically — this swept up every other site)_
**Created:** 2026-06-28

**Description**

`var(--space-10)` was used as horizontal padding at several sites, but **`--space-10` is never
defined** — the spacing scale in `tokens.css` is deliberately `--space-1/2/4/6/8/12/16/20/24/32`
(it skips 10). A `var()` to an undefined custom property with no fallback is
invalid-at-computed-value, so the entire `padding` shorthand at each site computed to **`0`** and
the controls silently lost their horizontal padding (same root cause as #240, fixed here
everywhere else). This task **replaced every remaining `var(--space-10)` with `var(--space-12)`**
(the nearest defined token, 12px) — keeping the curated scale intact (not re-adding a `--space-10`
step) and restoring comfortable padding, matching #240's precedent.

**What shipped** (commit `cb89343`, 2026-06-28) — a **pure-CSS** change replacing the
horizontal `var(--space-10)` with `var(--space-12)` (vertical `--space-2`/`--space-4` left
unchanged) across all remaining sites:

- `src/components/Canvas/Canvas.module.css`
- `src/components/DiffInspector/DiffInspector.module.css`
- `src/components/FileViewer/FileViewer.module.css`
- `src/components/Kanban/KanbanPanel.module.css` (the two non-composer sites + remaining uses)
- `src/components/TemplateEditor/TemplateEditor.module.css`

No `--space-10` token was added to `tokens.css` (scale unchanged); no `var(--space-10)` reference
remains in `src/`.

**Key files touched:** `Canvas.module.css`, `DiffInspector.module.css`, `FileViewer.module.css`,
`KanbanPanel.module.css`, `TemplateEditor.module.css` (each `var(--space-10)` →
`var(--space-12)`).

**Dependencies:** none.

**Notes**

- **Why replace, not define:** the scale curates its steps and intentionally omits 10; re-adding
  it to satisfy stray references would degrade the design system. Replacing with the nearest
  defined step (`--space-12`) removes the broken references and restores comfortable padding
  consistently — standardizing the horizontal step on `--space-12` (matching #240).
- **Optional hardening (mentioned, out of scope):** a future stylelint rule / CI grep could fail
  the build on any `var(--space-N)` that isn't a defined token, preventing this class of silent
  bug from recurring.
- **Cross-platform:** pure CSS — renders identically in WKWebView (macOS) and WebView2 (Windows).

---

### 243. [x] Give the repo's own branch line (#236) its own right-click context menu

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

Each top-level repo "folder" group renders, on its own line below the folder header, the
repo's **current branch** (the `GitBranch` icon + branch name added by #236). That branch
line was a left-click-only `<button>` (filter Overview to the repo) with **no
`onContextMenu`** — asymmetric with a **worktree's** branch header, which already had a
rich right-click menu. This task gave the **regular branch** (the repo's own checked-out
directory, not a worktree) an equivalent right-click menu — but, because it's the real
repo directory rather than an app-managed worktree, it offers **no** "Forget folder" /
"remove" / "close-the-tree" action; its only destructive items operate on the folder's
*contents* (Kill all agents / Close all items). The repo **header** menu (`openRepoMenu`)
and the **worktree** menu were left byte-for-byte unchanged — this is a new, separate,
deliberately-overlapping menu on the branch line only.

**What shipped** (commit `d637446`, 2026-06-28):

- **New `fetchFolder` store action** (`src/store.ts`) mirroring `pullFolder`: calls the
  existing `ipc.fetchRemotes(cwd)` (`git fetch --prune` via the already-registered
  `fetch_remotes` backend command — no new Rust, no new capability), toasts
  "Fetched <repo name>" on success (or git's stderr on error), then calls
  `refreshBranches()` so any branch movement is reflected.
- **`RepoBranchLine` component** (`src/components/Sidebar/Sidebar.tsx`), extracted from the
  inline branch-line button and mirroring the `WorktreeHeader` pattern (own `useRowMenu()`
  + local mode state + an inline `styles.menu` overlay). The existing filter `onClick`,
  `aria-pressed`, and titles were preserved verbatim; an `onContextMenu={openMenu}` was
  added. `RepoGroup` renders it in place of the old inline button under the same
  `branches[repo] &&` guard.
- **Branch-line menu** (in order): New session → Views (file / diff / terminal / kanban via
  the shared `ViewsMenu`) → Reveal in Finder/Explorer → Copy path → **Copy branch name**
  (new) → Pull → **Fetch** (new) → Change color… (the same swatch palette + custom-color
  picker as the header menu) → Kill all agents (shown only when agents run) → Close all
  items (shown when agents/panels exist). Destructive-action gating, counts
  (`runningAll` / `agentCount` / `panelCount`, including worktree agents), and the
  `confirmDestructive` confirm steps mirror the header menu's logic exactly. **No** Forget
  folder and **no** worktree-style remove.
- Left-click still filters Overview; the new `onContextMenu` sits on a sibling of
  `repoHeader` (which carries the dnd-kit drag listeners), so folder drag-reorder (#211)
  is unaffected. Reused existing menu CSS — no new styles. `build` / `lint` / `test` pass.

**Key files touched:** `src/components/Sidebar/Sidebar.tsx` (new `RepoBranchLine`
component + menu, ~+330 lines), `src/store.ts` (new `fetchFolder` action). No backend
changes (reused `fetch_remotes`).

**Dependencies:** none (builds on #236's branch line and #181's `pullFolder`, both already
shipped).

**Notes**

- **User-confirmed scope (step-5 Q&A, 2026-06-28):** the branch line gets its own slim,
  separate menu; the header menu stays unchanged. Destructive actions = Kill all agents +
  Close all items only (Forget folder / worktree-remove dropped). Extra non-destructive
  items beyond the header set: **Copy branch name** and **Fetch**.
- The branch line only renders for a git folder with a known current branch
  (`branches[repo]`), so Pull / Fetch / Copy-branch-name always have a real branch to act
  on; the menu naturally never appears for a non-git folder.
- **Cross-platform:** all actions reuse existing seams — `revealLabel`/`revealPath`,
  `copyToClipboard`, `pullFolder`, the new `fetchFolder` (its `git fetch` goes through the
  Rust `hidden_command` `CREATE_NO_WINDOW` guard, so no console flash on Windows),
  `ViewsMenu`, `REPO_PALETTE`/`setRepoColor`. No OS-divergent code added.

---

### 244. [x] Remove the Delete button from Kanban card edit mode (Save + Cancel only)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

A Kanban card in **edit mode** previously showed three inline action buttons — Save,
Cancel, and Delete (the trash button pushed to the right per #238). The user wanted the
editor's action row to offer **only Save and Cancel**; deleting a card should happen
**outside** editing, via the card's existing **view-mode** hover/focus-revealed trash icon
(which already calls the same `onDelete`). This was a small, focused presentational change:
drop the edit-mode Delete button and clean up its now-unused styling/comments, leaving the
editor with a clean Save / Cancel pair.

**What shipped** (commit `45adff6`, 2026-06-28):

- `src/components/Kanban/KanbanPanel.tsx` — removed the `cardEditDelete` button (the
  `Trash2` + "Delete" block) from the `editing ?` branch's `cardEditActions` row, leaving
  only Save and Cancel. The stale "Save/Cancel/Delete" wrapper comment was updated to
  reference only Save/Cancel. The `onDelete` prop and the `Trash2` import were **kept** —
  both are still used by the view-mode trash button, so no unused-import/variable lint
  errors. Save / Cancel / Enter / Escape commit/discard behavior, the `onEditBlur`
  commit-on-blur logic, and the `onMouseDown` focus guard are all unchanged.
- `src/components/Kanban/KanbanPanel.module.css` — removed the now-unused
  `.cardEditDelete` rule; `cardActions` / `cardBtn` (view-mode buttons) untouched.

**Key files touched:** `src/components/Kanban/KanbanPanel.tsx` (edit-mode action row),
`src/components/Kanban/KanbanPanel.module.css` (dropped `.cardEditDelete`).

**Dependencies:** none. (Touches the same `cardEditActions` region as #245, but neither
blocked the other.)

**Notes**

- The view-mode delete affordance (the hover trash icon) is the intended deletion path and
  was left exactly as is; both edit- and view-mode buttons called the same `onDelete`, so
  removing the edit-mode one changed nothing about how deletion works.
- No keyboard Delete-key shortcut was added — out of scope; "the delete button" in the card
  text referred to the existing view-mode trash icon.
- **Cross-platform:** pure frontend React/CSS change with no OS-divergent code — identical
  on macOS and Windows. `build` / `lint` / `test` pass.

---

### 245. [x] Kanban add/save buttons: Enter shortcut indicator + thinner vertical padding

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

Two small presentational tweaks to the Kanban card **action buttons** that submit text:
(1) the card composer's **"Add card"** submit button and the inline editor's **"Save"**
button both commit on **Enter**, so they should show a keyboard indicator for it — an
inline muted `<kbd>⏎</kbd>` chip, matching the app-wide pattern (e.g. NewSessionModal's
"Schedule ⏎"); and (2) the buttons read too tall — reduce their **vertical** padding only,
keeping width (horizontal padding) unchanged.

**What shipped** (commit `158df57`, 2026-06-28):

- `src/components/Kanban/KanbanPanel.module.css` — added a `.btnKbd` chip style mirroring
  the app convention (muted monospace: `var(--mono)`, `--fs-meta-sm`, `opacity: 0.7`); gave
  `.composerAdd` and `.composerCancel` `display: inline-flex; align-items: center; gap:
  var(--space-6)` so the label + chip sit inline; and thinned the buttons' vertical padding
  from `var(--space-6)` (6px) to `var(--space-4)` (4px), leaving horizontal `var(--space-12)`
  unchanged so width is identical and Add/Save stay height-matched with their Cancel partner.
- `src/components/Kanban/KanbanPanel.tsx` — rendered a literal `⏎` (U+23CE) chip beside the
  two **submit** labels: edit-mode **Save** and composer **Add card**. The per-column
  "+ Add card" toggle and the **Cancel** buttons get **no** chip (Cancel still gets the
  thinner padding to stay size-matched). No behavior change: Enter commits, Shift+Enter
  inserts a detail line, Escape cancels.

**Key files touched:** `src/components/Kanban/KanbanPanel.tsx` (chip on the two submit
buttons), `src/components/Kanban/KanbanPanel.module.css` (new `.btnKbd`, inline-flex layout,
thinner vertical padding).

**Dependencies:** none. (Touches the same `cardEditActions` region as #244, but neither
blocked the other.)

**Notes**

- Reused the app's existing `<kbd className={styles.btnKbd}>⏎</kbd>` chip pattern rather
  than inventing a new style. The `⏎` glyph is platform-neutral, so **no** `kbdHint` /
  Cmd-vs-Ctrl branch was used (that helper is only for ⌘↔Ctrl divergence).
- "A bit thinner" → vertical padding 6px → 4px, the natural next step down on the curated
  `1/2/4/6/8/12/…` scale; adjustable if it reads too tight in-app.
- **Cross-platform:** pure frontend React/CSS with a platform-neutral glyph — renders
  identically on macOS and Windows. `build` / `lint` / `test` pass.

---

### 246. [x] Make a Kanban card's description body part of the drag surface (no text-selection)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

A Kanban card whose markdown has more than one line renders the extra lines as a grayed-out
**description body** below the title. The whole card `<article>` is the dnd-kit drag grip,
but the body was **excluded** from the drag surface: the `cardBody` wrapper carried a
`noDrag` (`onPointerDown` → `stopPropagation`) that prevented a press-drag on the body from
reaching the drag listeners — so dragging the description started a native **text
selection** instead of moving the card. The user wanted to drag the card by its description
and to stop the mouse selecting the body text.

**What shipped** (commit `fe997e1`, 2026-06-28):

- `src/components/Kanban/KanbanPanel.tsx` — removed `{...noDrag}` from the view-mode
  `cardBody` wrapper, so a `pointerdown` on the body propagates to the card's sortable drag
  listeners and a press-drag moves/reorders the card like the title.
- `src/components/Kanban/KanbanPanel.module.css` — added **both** `-webkit-user-select:
  none` (WKWebView/macOS) and `user-select: none` (WebView2/Chromium/Windows) to
  `.cardBody` **and** `.cardTitle` (both are drag surfaces), so dragging never starts a
  native selection. The editor textarea (`.cardEditInput`) was left untouched, keeping
  normal text editing/selection in edit mode.
- Body **links** and **task-list checkboxes** stay clickable: the existing 4px
  `PointerSensor` activation distance means a click without ≥4px movement never starts a
  drag, so their `onClick` handlers still fire — no targeted re-add of `noDrag` was needed.

**Key files touched:** `src/components/Kanban/KanbanPanel.tsx` (dropped the body
`noDrag`), `src/components/Kanban/KanbanPanel.module.css` (`user-select: none` on
`.cardBody` + `.cardTitle`).

**Dependencies:** none.

**Notes**

- **Accepted tradeoff (the user's explicit intent):** the rendered body text becomes
  non-selectable with the mouse — dragging is preferred over selecting; a long description
  is still selectable in **edit mode** (the editor textarea).
- **Cross-platform:** ships both the `-webkit-` and the standard `user-select` property
  (per the WebView-divergence guidance), and the drag uses the platform-neutral dnd-kit
  PointerSensor — identical on macOS and Windows. `build` / `lint` / `test` pass.

---

### 247. [x] Overview filter: clicking the repo's own branch line shows only that branch (hide worktrees)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

The sidebar has three click-to-filter affordances for the **Overview** wall, and the user
wanted them to mean three different things: (1) click a **repo folder header** → show
**everything** for that folder (own agents + all worktree agents) — unchanged; (2) click a
**worktree branch** → show **only that worktree** — unchanged; (3) click the repo's **own
branch line** (#236, the GitBranch + branch name under the folder header) → show **only
that branch**, i.e. the repo's own non-worktree directory agents, with **all of its
worktrees hidden** — the new behavior. Previously #1 and #3 were identical: both called
`setOverviewRepoFilter(repo)` with the same path, and a bare path couldn't carry the "own
vs all" intent — so a filter **mode** was needed alongside the path.

**What shipped** (commit `72a467d`, 2026-06-28):

- **New filter model** — `OverviewFilter = { path: string; mode: "all" | "own" } | null`
  replacing the bare `overviewRepoFilter: string | null` (transient, so no migration).
  `setOverviewRepoFilter(path, mode?="all")` toggles on **path AND mode** (clicking the
  branch line while the folder "all" filter is active switches to "own"; clicking the active
  affordance again clears).
- **`src/paths.ts`** — `sessionInFilter` made mode-aware: `"own"` →
  `session.repoPath === filter.path && !session.worktreeParent`; `"all"` → the prior logic
  (own + worktree agents via `effectiveRepo`).
- **`src/store.ts`** — `overviewClusters` threads `OverviewFilter`; `folderInFilter` + a
  worktree-schedule-aware schedule predicate exclude worktree-path panels and worktree
  schedules under `"own"` while `"all"` keeps them; `forgetRepo` compares
  `overviewRepoFilter?.path`.
- **`src/components/Sidebar/Sidebar.tsx`** — folder click → `"all"`, branch-line click →
  `"own"`, worktree click → `"all"`; the single `isFiltered` highlight was split into
  `folderActive` (header, `"all"`) and `branchActive` (branch line, `"own"`), including the
  collapsed rail.
- **`src/components/Overview/Overview.tsx`** — filter-bar label distinguishes the modes
  ("Showing <repo>" vs "Showing <repo> · this branch").
- **`src/useKeyboardNav.ts`** — updated to the new shape so the wall and Shift+←/→ nav stay
  in sync. Tests updated/added in `src/paths.test.ts` and `src/store.test.ts` proving
  `"own"` excludes worktree agents/panels/schedules and `"all"` keeps them.

**Key files touched:** `src/paths.ts`, `src/store.ts`, `src/components/Sidebar/Sidebar.tsx`,
`src/components/Overview/Overview.tsx`, `src/useKeyboardNav.ts`, plus `src/paths.test.ts` /
`src/store.test.ts`.

**Dependencies:** none. (Shares the `repoBranchLine` element with #243's right-click menu
but via a different handler — `onClick` filter here vs `onContextMenu` menu there.)

**Notes**

- **"own" hides** worktree agents + worktree-path panels + worktree schedules; **keeps** the
  repo's own agents/panels/schedules — the natural reading of "shows ONLY that branch,
  worktrees hidden". The filter only affects the Overview wall (+ its keyboard nav); the
  sidebar tree itself stays unfiltered.
- `overviewRepoFilter` is transient (not persisted), so changing its type needed no
  migration.
- **Cross-platform:** pure frontend filter/state logic + CSS-class toggling — no paths,
  shell-outs, native open/reveal, or platform key handling. `build` / `lint` / `test` pass.

---

### 248. [x] Don't strike through a completed Kanban card's text (keep a subtle dim + the checkmark)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

A **checked** (completed) Kanban card rendered its title with a **strikethrough** plus a
muted-gray dim. The user found the strikethrough unnecessary — the checkmark already signals
"done" — and wanted it removed while **keeping** the subtle dim so a completed card stays
gently de-emphasized.

**What shipped** (commit `824b790`, 2026-06-28):

- `src/components/Kanban/KanbanPanel.module.css` — removed `text-decoration: line-through`
  from the `.cardDone .cardTitle` rule, keeping `color: var(--text-muted)`. A completed card
  now shows the checkmark + a gently dimmed (not crossed-out) title. This was the only
  done/checked strikethrough in the Kanban styles (the card body never carried one), so the
  one-line change fully addressed the request. Checking/unchecking behavior and unchecked
  cards are unchanged.

**Key files touched:** `src/components/Kanban/KanbanPanel.module.css` (one-line removal in
`.cardDone .cardTitle`).

**Dependencies:** none.

**Notes**

- Refine decision (2026-06-28): keep the muted-gray dim, remove only the strikethrough
  (rather than stripping all done-styling).
- **Cross-platform:** a one-line CSS change with no OS-divergent code — renders identically
  on macOS and Windows. `build` / `lint` / `test` pass.

---

### 249. [x] Canvas tab-strip icon buttons: shrink the new-tab/Templates/Distribute cluster to match the × close button

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

In the Canvas view the tab strip rendered icon buttons at inconsistent sizes: each
per-tab **`×` close** button (`.tabClose`) was a **20×20px** box, while the **`+`
new-tab**, **`Templates ▾`**, and **Distribute-evenly** buttons all shared the
`.tabAdd` class at **24×24px** — so the right-side cluster read visibly bigger than the
`×`. The user wanted the new-tab button (and, per the confirmed refine decision, the
whole right-side cluster) to match the `×` button's size, with the `×` itself as the
unchanged reference.

**What shipped** (commit `3d82b18`, 2026-06-28):

- `src/components/Canvas/Canvas.module.css` — shrank `.tabAdd` from `24×24px` to
  **`20×20px`**, so the `+` and Distribute buttons (both single-icon, shared via
  `.tabAdd` / `.tabDistribute`) became 20px squares matching the `×`. Added a new
  **`.tabMenuTrigger`** modifier for the `Templates ▾` trigger that keeps the 20px
  height but overrides `width: auto` (`min-width: 20px`, `gap: var(--space-1)`,
  `padding: 0 var(--space-2)`) so its two icons (`LayoutTemplate` 14px + `ChevronDown`
  11px) aren't clipped by a 20px square. Also reworded the now-stale `.tabClose`
  comment that referenced the old "24px add (+) button" to note 20px is the strip's
  reference icon-button size.
- `src/components/Canvas/CanvasTabs.tsx` — added `${styles.tabMenuTrigger}` alongside
  `styles.tabAdd` on the Templates button only; the `+` and Distribute buttons inherit
  the new 20px `.tabAdd` size with no markup change.

Icon sizes were already all 14px, so only box dimensions changed — purely visual, no
behavioral change to the dropdowns, drag-reorder, or the Distribute disabled state.

**Key files touched:** `src/components/Canvas/Canvas.module.css` (`.tabAdd` resize +
new `.tabMenuTrigger` + `.tabClose` comment), `src/components/Canvas/CanvasTabs.tsx`
(Templates button class).

**Dependencies:** none.

**Notes**

- Refine decision (2026-06-28): match the **whole right-side cluster** to the `×` size
  (not only the `+`). `Templates ▾` matches height only, keeping auto width for its two
  icons; the `×` close button is the reference and stays 20×20.
- **Cross-platform:** a pure CSS Module change using `width`/`height`/`padding`/flex
  with no `-webkit-`-only properties, vibrancy, or `color-mix` — renders identically on
  WKWebView (macOS) and WebView2/Chromium (Windows); no `#[cfg]` gating or platform
  signal involved. `build` / `lint` pass.

---

### 250. [x] Hide a repo folder's branch line when the folder has no own items

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

In the left sidebar, each repo "folder" showed its current branch on a line beneath the
folder header (the `RepoBranchLine` component, #236), rendered whenever the repo's
current branch was **known** (`branches[repo]` truthy) — regardless of whether the
folder actually contained any opened items. Because a folder appears from
persisted recents ∪ active-session repos, a *recent* git folder with **zero**
sessions/items still showed a branch line. The goal: only render the repo's own branch
line when the folder has at least one of its **own** items opened; hide it otherwise
(the folder header itself still renders for recent/empty folders — only the branch line
is gated).

**What shipped** (commit `eddc5b5`, 2026-06-28):

- `src/components/Sidebar/Sidebar.tsx` — in the `RepoGroup` component, destructured
  `overviewPanels` from the store and computed a new **`hasOwnItems`** flag:
  `repoSessions.length > 0 || (overviewPanels[repo]?.length ?? 0) > 0 ||
  hasOwnSchedules`, where `hasOwnSchedules` reuses the existing
  `scheduleNestsUnderWorktree` predicate (`schedules.some((s) => s.cwd === repo &&
  !scheduleNestsUnderWorktree(s))`). The branch-line render gate changed from
  `{branches[repo] && (` to `{branches[repo] && hasOwnItems && (`. The flag is reactive
  (sessions / overviewPanels / schedules are store-subscribed), so opening the first own
  item makes the line appear and removing the last hides it.

Per the confirmed refine decision, **worktree sub-groups do NOT count** as "own items":
a folder whose only content is a nested worktree sub-group hides the repo's own branch
line, while the worktree sub-group keeps its own `WorktreeHeader` branch indicator.
`hasOwnItems` is intentionally separate from the existing `isEmpty` (which counts only
sessions and drives the greyed header / coral `+`), so header styling is untouched.

**Key files touched:** `src/components/Sidebar/Sidebar.tsx` (`RepoGroup`: new
`overviewPanels` subscription + `hasOwnItems` flag + branch-line render gate).

**Dependencies:** none. (Builds on #236's `RepoBranchLine` and #247's split
folder/branch active-highlight, both already shipped.)

**Notes**

- Refine decision (2026-06-28): "Own-directory items only" — worktree sub-groups do not
  keep the parent's branch line visible; only the repo's own sessions/panels/own-folder
  schedules do.
- **Cross-platform:** pure frontend React/TS logic in `Sidebar.tsx` — no paths,
  shell-outs, keyboard handling, or platform-divergent CSS/WebView behavior; behaves
  identically on macOS and Windows, no `#[cfg]` gating or `platform` signal involved.
  `build` / `lint` pass.

---

### 251. [x] Repo branch line: show the active-filter selection the same way a worktree branch does

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

In the left sidebar, clicking a branch filters the Overview to that branch's changes.
A **worktree** branch, when the active filter, showed a prominent selection box
(`.worktreeActive { background: var(--accent-dim); }` + accent branch text on a
`--radius-chip`-rounded `.worktreeHeader`). The repo's **own (primary) branch line**
(`RepoBranchLine`, #236), however, only changed its text color when active
(`.repoBranchActive { color: var(--accent); }`) — because it filters the #247 "own"
mode, which sets `branchActive` (not `folderActive`), so the repo header does **not**
light and no selection box appeared. The two affordances therefore looked and felt
different — the reported bug. Goal: give the repo's own branch line the same accent-dim
selection box + accent text as a worktree branch (CSS-only).

**What shipped** (commit `cdd4b0f`, 2026-06-28):

- `src/components/Sidebar/Sidebar.module.css` — added `border-radius:
  var(--radius-chip);` to `.repoBranchLine` (so the active fill has rounded corners
  matching `.worktreeHeader`; invisible while the background is transparent), and added
  `background: var(--accent-dim);` to `.repoBranchActive` (keeping its existing
  `color: var(--accent);`), mirroring `.worktreeActive`. Also reworded the now-stale
  comment that claimed the header carries the selection box, to note the branch line
  now carries its own accent-dim box because the "own" filter doesn't light the header.

No TSX/logic change — the `isFiltered={branchActive}` wiring already existed. The
worktree selection, the repo header's "all"-filter selection (`.repoActive`), the
"worktree" badge (#240), and the branch line's row height / icon alignment / font size
are all intentionally unchanged — only the selection treatment was unified.

**Key files touched:** `src/components/Sidebar/Sidebar.module.css` (`.repoBranchLine`
border-radius + `.repoBranchActive` background + comment).

**Dependencies:** none. (Relates to #236's `RepoBranchLine` and #247's "own" filter
mode, and is independent of #250 which gated the same line in `Sidebar.tsx` — no file
overlap.)

**Notes**

- Interpretation (no user question needed): "look and feel the same" was scoped to the
  **selection** treatment (the specific complaint), reusing the same tokens
  `.worktreeActive`/`.worktreeHeader` use (`--accent-dim`, `--accent`, `--radius-chip`)
  for an exact match — not row height / font size / the deliberately-different
  "worktree" badge, which stay per #236/#240.
- **Cross-platform:** pure CSS using existing design tokens with no `-webkit-`-only
  properties, vibrancy, or newly-introduced `color-mix` — renders identically on
  WKWebView (macOS) and WebView2/Chromium (Windows); no `#[cfg]` gating or `platform`
  signal involved. `build` / `lint` pass.

---

### 252. [x] Color file-tree rows by git status (new = green, edited = yellow, deleted = red)

**Status:** Done
**Depends on:** none _(builds on shipped #167 lazy FileTree, #183 untracked-as-Added,
#212 busy→idle refresh cadence; no open task gated it)_
**Created:** 2026-06-29

**Description**

The repo **file tree** (`FileTree.tsx`, #167 — the single component rendered in the
sidebar, an Overview column, a Canvas panel, and a Canvas-template block) rendered every
row in neutral `--text-primary`/`--text-muted` regardless of git state. This task makes
the tree **git-aware**: each row is tinted to reflect its working-tree status vs `HEAD`
so a glance shows what an agent (or the user) has changed — new/untracked files green,
modified files yellow, deletions red — reusing the existing on-system status tokens
(`--status-done`/`-awaiting`/`-error`) with no off-system colors.

**What shipped** (commit `c30a8ca`, 2026-06-29):

- **Backend — lightweight `file_statuses(repo)` git read** (`src-tauri/src/git.rs`,
  +186 lines incl. tests): one `git -c core.quotepath=false status --porcelain=v1 -z
  --untracked-files=all` via the cross-platform `hidden_command`/`run_git` seam (no
  console flash, never a bare `Command`). A pure `-z` porcelain parser maps `??`→`Added`,
  index/worktree `D`→`Deleted`, added→`Added`, else→`Modified`; **renames** (`R`/`C`,
  carrying a second NUL `old` field) emit `Deleted` for the old path **and** `Added` for
  the new (mirroring the diff rename convention). Bounded + fail-open (non-git dir / no
  commits → empty `Vec`). Unit-tested as a pure `&str → Vec<FileStatusEntry>` against
  added/modified/deleted/untracked/rename fixtures.
- **IPC + types** — `file_statuses` registered in `commands.rs` + `lib.rs`; `fileStatuses(repo)`
  wrapper in `src/ipc.ts`; `FileChangeStatus` (`"A"|"M"|"D"`) + `FileStatusEntry` in
  `src/types/index.ts` (serde-mirrored).
- **Store** (`src/store.ts`, +62) — `fileStatuses: Record<repoPath, Record<path, FileChangeStatus>>`
  (mirroring `branches`) + `refreshFileStatuses()` over the same repo set as `refreshBranches`
  via `Promise.allSettled` (fail-open per repo). Triggered on app load, on each session
  **busy→idle** edge (reusing #212's 600 ms debounced `scheduleBranchRefresh`), after
  app-initiated checkout/branch writes, and from the tree's Refresh/mount.
- **FileTree rendering** (`FileTree.tsx` +72, `FileTree.module.css` +43, pure helpers in
  new `FileTree/fileStatus.ts` +85 with `fileStatus.test.ts` +109): file rows tint
  name+icon (`.statusAdded`/`.statusModified`); folders **roll up** to the
  highest-severity descendant (red > yellow > green) via a precomputed prefix index;
  **deleted "ghost" rows** render as red, struck-through (`line-through; opacity:.7`),
  non-openable rows in their still-rendered parent level, with the red ancestor roll-up
  covering collapsed/missing parents. Applies to all FileTree surfaces automatically.

**Key files/areas touched:** `src-tauri/src/git.rs` (new `file_statuses` + porcelain
parser + tests), `commands.rs`, `lib.rs`; `src/ipc.ts`, `src/types/index.ts`,
`src/store.ts` (`fileStatuses` map + `refreshFileStatuses`), `src/store.refresh.test.ts`;
`src/components/FileTree/{FileTree.tsx,FileTree.module.css,fileStatus.ts,fileStatus.test.ts}`,
`src/components/Sidebar/Sidebar.tsx`; docs in `CLAUDE.md`.

**Dependencies:** none. Read-only git addition consistent with the "git is read-mostly"
rule (no new write).

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): deletions
  surface as a red ghost row **plus** a red ancestor roll-up (not folder-red only);
  folders roll up new/edited too (IDE convention, not just deletions per the literal
  card); coloring = tint name+icon (color-only, no status letter badge); data source is
  the new lightweight `file_statuses` rather than the heavyweight `working_diff` to keep
  the busy→idle refresh cheap and leave the diff viewer untouched; status state lives in
  the store for once-per-repo fetching.
- **Cross-platform:** the only OS-sensitive primitive is the git shell-out, which reuses
  `run_git`/`hidden_command`; both porcelain `-z` and `list_dir` paths are repo-relative
  POSIX so the status lookup is identical on macOS and Windows; colors are CSS tokens
  only (no platform-divergent CSS), so no `#[cfg]` gating needed. `npm run build` / `lint`
  / `test` and `cargo test` all green.

---

### 253. [x] Drag OS files into the file tree to move them into the repo (drop on folders/root, with drop-target feedback)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-29

**Description**

Let the user **drag files (or folders) from the operating system** (Finder / Explorer,
the desktop, a download) **into ReCue's file tree** and drop them onto a **folder row**
or the tree **root** to **move** them into that repo location, with **live visual
feedback** showing exactly where the file will land while dragging. Works across every
FileTree surface — sidebar, Overview column, Canvas panel, detached canvas window — and
on both macOS and Windows. This adds the **second** deliberate `files.rs` write
(`move_into_repo`, after #141's `write_text_file`), narrowing the "file access is
read-mostly" rule.

**What shipped** (commit `abcc09f`, 2026-06-29):

- **Backend — `move_into_repo(repo, dest_subdir, source)`** (`src-tauri/src/files.rs`,
  +166 incl. tests): confines **only the destination** to the repo via the existing
  `confine` (the source is the user's dragged OS path = explicit consent, like #163's
  native dialog); derives the basename from the source `Path::file_name()` (separator
  handling stays in Rust); **refuses name collisions** (no overwrite); data-safe move —
  same-volume `std::fs::rename`, else cross-volume recursive copy **then** remove (keyed
  on `EXDEV` / `ERROR_NOT_SAME_DEVICE`), so a mid-op failure never loses the original; no
  shell-out. Returns the new repo-relative path. Exposed as a Tauri command in
  `commands.rs` + `lib.rs` + `ipc.moveIntoRepo`.
- **Frontend OS-drop wiring** — new `src/osFileDrop.ts` (+88, with `osFileDrop.test.ts`
  +69) subscribes each window's webview to Tauri's window-global `onDragDropEvent` (wired
  from `App.tsx` **and** the detached `CanvasWindow` — each is its own document/webview);
  on `over`/`drop` it converts `payload.position` physical→CSS px via `devicePixelRatio`
  (correct under macOS Retina and Windows fractional scaling) and hit-tests with
  `elementFromPoint` → `closest("[data-filetree-droptarget]")` (pure `resolveDropTarget`)
  to resolve repo + dir.
- **Store** (`src/store.ts`, +82, `store.test.ts` +29) — transient
  `fileDropTarget {repo,dir}` highlight + `moveFilesIntoRepo(repo, destSubdir, sources)`
  which moves each path via `Promise.allSettled` (fail-open per file), bumps a per-repo
  `fileTreeRefresh` signal, and `pushToast`s a concise result (`moveResultMessage`).
- **FileTree** (`FileTree.tsx` +49, `FileTree.module.css` +10) — root container +
  folder/file/ghost rows carry `data-filetree-repo` / `data-filetree-droptarget` (a file
  row resolves to its parent dir); the hovered target gets a token-only `.dropTarget`
  highlight (accent outline + `--accent-dim`); a successful drop reloads just the affected
  levels via the refresh signal (no full tree reset). dnd-kit (pointer events) is a
  separate input stream and is untouched.

**Key files/areas touched:** `src-tauri/src/files.rs` (new `move_into_repo` + tests),
`commands.rs`, `lib.rs`; `src/osFileDrop.ts` (+test), `src/store.ts` (+test), `src/ipc.ts`;
`src/components/FileTree/{FileTree.tsx,FileTree.module.css}`, `src/App.tsx`,
`src/components/CanvasWindow/CanvasWindow.tsx`; docs `CLAUDE.md` + `TRAJECTORY_TO_WINDOWS.md`.

**Dependencies:** none.

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): **move, not
  copy** (card says "moved"; implemented data-safe); scope = **external OS files →
  tree folders/root only** (intra-tree reorg left as a future card); **collisions
  refuse** rather than overwrite; **no confirm gate** (a drag is intentional + the move
  is data-safe); directories moved recursively.
- **Cross-platform:** `onDragDropEvent` fires on WKWebView (macOS) and WebView2
  (Windows); source paths pass to Rust untouched (no `splitPath`); the move uses
  `std::fs` (cross-device copy+remove fallback on both); highlight is token-only CSS.
  This is a GUI drag gesture CI can't exercise — the real-box checks (WebView2 drop,
  fractional-DPR hit-test, macOS Retina hit-test, cross-volume move) are logged in
  `TRAJECTORY_TO_WINDOWS.md`. `npm run build` / `lint` / `test` (397) + `cargo test`
  (119) + clippy + fmt all green.

---

### 254. [x] Render Mermaid diagrams in rendered markdown (file viewer)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-29

**Description**

When a markdown file contains a Mermaid diagram (a fenced ` ```mermaid ` block), the
FileViewer's **Rendered** view now displays it as a proper SVG chart instead of a raw
code block (the editable Raw view still shows the fence as text). Per the card:
"Markdown mermaid integration … generate mermaid diagrams in markdown render view if a
mermaid diagram is detected." Detection is the standard ` ```mermaid ` language fence
only (the GitHub/Obsidian convention) — not heuristic sniffing of untagged blocks.

**What shipped** (commit `087f2ce`, 2026-06-29):

- **Dependency** — `mermaid` (^11.16) added to `package.json`, **lazy-loaded** via dynamic
  `import()` so a diagram-free file never pulls it (the build emits a separate
  ~621 KB `mermaid.core` chunk; the entry grows only ~2.5 KB). Bundled/offline, no CDN.
- **Pure helpers** — `src/components/FileViewer/mermaid.ts` (+59, with `mermaid.test.ts`
  +46): `loadMermaid` (one-time `initialize`: `theme:"dark"`, `securityLevel:"strict"`
  DOMPurify-sanitized, a system/sans `fontFamily` so nothing is fetched),
  `renderMermaidSvg` (returns the SVG or `null` on any failure), and `isMermaidClassName`.
- **`MermaidBlock.tsx`** (+74) — renders the SVG with a stable `useId`-derived DOM id, a
  latest-wins async guard, and a "Rendering diagram…" placeholder; an invalid diagram
  falls back to the original code block + a muted `--status-error` note and never crashes
  the viewer.
- **Opt-in `code` override** — `MermaidCode` is wired only at the FileViewer call site
  (`FileViewer.tsx` +10), so Kanban / PatchNotes / Settings markdown are unaffected and
  every non-mermaid fence renders unchanged.
- **Styling** — token-only `.mermaid` wrapper in `FileViewer.module.css` (+35): centered,
  panel-width-constrained, horizontal scroll for wide diagrams; no platform-divergent CSS.

**Key files/areas touched:** `src/components/FileViewer/{mermaid.ts,mermaid.test.ts,
MermaidBlock.tsx,FileViewer.tsx,FileViewer.module.css}`, `package.json` /
`package-lock.json`; docs in `CLAUDE.md`.

**Dependencies:** none.

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): library =
  `mermaid` (de-facto standard), lazy-loaded + bundled offline; detection = the
  ` ```mermaid ` fence only; scope = the FileViewer's rendered markdown only via an
  opt-in flag (Kanban/PatchNotes/Settings stay unchanged — Kanban mermaid a possible
  future card); invalid diagrams fall back to the raw block + a subtle error (never
  crash); dark theme + `securityLevel:"strict"` + offline font.
- **Cross-platform:** pure WebView SVG — no native/path/shell code, no platform
  branching — identical on WKWebView (macOS) and WebView2 (Windows); fully dev-testable
  on both, so nothing was added to `TRAJECTORY_TO_WINDOWS.md`. `npm run build` (mermaid
  in its own chunk) / `lint` (0 warnings) / `test` (402) + `cargo test` (119) all green.

---

### 255. [x] Keyboard navigation between files in the diff viewer (focused + accordion modes)

**Status:** Done
**Depends on:** none _(builds on shipped #231 display modes + #237 mode persistence)_
**Created:** 2026-06-29

**Description**

The diff viewer (`DiffInspector.tsx`) is now arrow-key navigable between changed files,
answering the card ("use the arrow keys … to jump between files when in focused mode.
Also look at accordion mode for a way to jump between items"). In **Focused** mode ←/→
step prev/next file (↑/↓ stay free for the diff body's vertical scroll); in **Accordion**
mode ↑/↓ step the open card. The handler is **panel-scoped** so multiple diff panels
(Overview columns, Canvas panels, detached windows) never move each other.

**What shipped** (commit `767471c`, 2026-06-29):

- **Focusable panel + panel-local key handler** — the panel root gets `tabIndex={0}` and
  a token `:focus-visible` outline, plus an `onKeyDown` that reuses the existing wrapping
  `stepFile(±1)`. Focused mode binds ←/→; Accordion binds ↑/↓ and scrolls the open card
  into view (`block:"nearest"`, a no-op when already visible so a mouse click never
  jolts). It bails on <2 files, on any modifier, and while an
  input/select/contenteditable/listbox/combobox (text fields, branch/commit pickers, the
  file-picker listbox) has focus.
- **Pure key→delta decision** extracted to new `DiffInspector/diffNav.ts` (`diffNavDelta`
  + the `DisplayMode` type), unit-tested in `diffNav.test.ts`.
- **Discoverability** — `aria-keyshortcuts` + arrow hints on the ‹/› buttons and accordion
  card headers; a token-driven `:focus-visible` affordance in `DiffInspector.module.css`.

**Key files/areas touched:** `src/components/DiffInspector/{DiffInspector.tsx,
DiffInspector.module.css,diffNav.ts,diffNav.test.ts}`; docs in `CLAUDE.md`.

**Dependencies:** none (builds on shipped #231 + #237).

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): plain arrows
  matched to layout (Focused = horizontal ‹/› → ←/→; Accordion = vertical list → ↑/↓);
  **panel-scoped `onKeyDown` + `tabIndex={0}`** rather than the global `useKeyboardNav`
  (multiple panels/detached windows can mount, so a global listener couldn't know which
  to move); reuse the wrapping `stepFile`; scroll the active accordion card into view
  after a keyboard step. A modifier variant (Alt+Arrow) is the noted fallback.
- **Cross-platform:** plain **unmodified** arrows only — identical on WKWebView (macOS)
  and WebView2 (Windows), no `platform` branching and no `metaKey||ctrlKey` needed; any
  *future* modifier shortcut here must route through `metaKey||ctrlKey`. Frontend-only;
  Rust unaffected. `npm run build` / `lint` (0 warnings) / `test` (405) + `cargo test`
  (119) all green.

---

### 256. [x] Release v1.0.1 — version bump, patch notes, green test/lint suite, push to main

**Status:** Done
**Depends on:** none _(cuts the release containing #252–#255)_
**Created:** 2026-06-29

**Description**

Cut **v1.0.1**, the first incremental release after the v1.0.0 launch — an
**intentional, user-requested version bump** (explicitly overriding the standing
never-bump guard for this one release task; the implementing agent performs the bump,
the archiver/refine agents never do). Bump the version in both version files, author the
first real in-app changelog, run the full green suite, and push directly to `main` to
trigger the release pipeline.

**What shipped** (commit `c258ba5`, 2026-06-29):

- **Version bump 1.0.0 → 1.0.1** in `src-tauri/tauri.conf.json` (the release pipeline's
  version gate), `package.json`, and the `package-lock.json` root fields (kept in sync).
- **`src/patchnotes/1.0.1.json`** — the first real changelog (the in-app Settings →
  Updates "What's new"), summarizing the changes since v1.0.0 in user-facing prose, in
  the `{version,date,changes:[{category,items}]}` schema validated by
  `normalizePatchNotes`: file-tree git-status coloring (#252), drag OS files into the
  file tree (#253), Mermaid diagrams in the rendered markdown viewer (#254 — all
  `feature`), and diff-viewer keyboard navigation (#255 — `improvement`).
- **Prettier-only reformat** of `src/components/Kanban/KanbanPanel.tsx` (no logic change)
  so `npm run format:check` is clean for the release.

The change list was derived authoritatively from `git log v1.0.0..HEAD` (the four
`Implement task #252–#255` commits). Pushing to `main` triggers the release workflow
(gate sees `1.0.1 > v1.0.0`), which produces a **draft** GitHub release + signed
macOS/Windows bundles + merged `latest.json` that **a maintainer must publish** for the
updater to serve it; the pipeline tags the commit `v1.0.1`.

**Key files/areas touched:** `src-tauri/tauri.conf.json`, `package.json`,
`package-lock.json`, `src/patchnotes/1.0.1.json` (new), `src/components/Kanban/KanbanPanel.tsx`
(format-only).

**Dependencies:** none (it packages the already-shipped #252–#255).

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): bump **both**
  version files (gate reads `tauri.conf.json`, but a stale `package.json` would be
  inconsistent); patch-notes categories `feature`/`improvement` (not the launch `welcome`
  group), items written as user-facing prose; change list regenerated from
  `git log v1.0.0..HEAD`; **push directly to `main`, no branch/PR** (required to trigger
  the on-push release pipeline). The version bump is the user-requested exception to the
  never-bump rule.
- **No feature/behavior code changed** beyond the version + patch notes + a format-only
  fix. Cross-platform integrity preserved (version + JSON + format change, no
  platform-specific code); the shared CI suite stays green and the pipeline builds both OS
  bundles. Full suite green: `npm run build` / `lint` / `format:check` / `test` (405) +
  clippy (`-D warnings`) + `cargo test` (119) + `cargo fmt`. **Maintainer must publish the
  resulting draft release** for it to go live.

---

### 257. [x] Larger, vertically resizable Kanban card input fields

**Status:** Done
**Depends on:** none _(the foundational Kanban-input task; later cards build on the same KanbanPanel files)_
**Created:** 2026-06-30

**Description**

The two card-editing textareas in the in-app Kanban board panel — the **add-card
composer** and the **inline card editor** — were too thin (started at `rows={3}` with no
`min-height`), so the existing `resize: vertical` drag handle was barely usable. This is a
pure sizing/affordance change: make both textareas comfortably taller by default and
genuinely vertically resizable by dragging, with no behavioral change to add/edit/save.

**What shipped** (commit `da0e56d`, PR
[#8](https://github.com/ErikdeJager/ReCue/pull/8), merged `15c270f`, 2026-06-30):

- **Taller default** — `rows={3}` → `rows={5}` on both `KanbanPanel.tsx` textareas (the
  `SortableCard` inline editor and the `BoardColumn` add-card composer).
- **Floored + capped drag range** — `KanbanPanel.module.css` adds `min-height: 88px`
  (~5 lines, so a drag can't shrink it below a usable size) and `max-height: 320px` (so a
  very tall drag never blows out the board layout — the textarea scrolls internally past
  that) to both `.cardEditInput` and `.composerInput`. `resize: vertical` was already
  present (the drag handle); no JS added.
- The Raw-view editor (`.rawEditor`, `resize: none`) was intentionally left untouched.

**Key files/areas touched:** `src/components/Kanban/KanbanPanel.tsx` (two `rows`),
`src/components/Kanban/KanbanPanel.module.css` (`.cardEditInput` / `.composerInput`
min/max-height).

**Dependencies:** none.

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): `rows={5}` as the
  taller default; `min-height: 88px` / `max-height: 320px` as the floor/cap; reuse the
  already-present `resize: vertical` rather than any JS drag handle; leave width, padding,
  and font tokens unchanged (stay on-system).
- **Cross-platform:** pure CSS + `rows` props rendered in the WebView — identical on
  WKWebView (macOS) and WebView2 (Windows); `resize: vertical` and the `::-webkit-resizer`
  handle render on both, so no platform branch. Frontend-only; Rust unaffected.
- **Foundational** for the later Kanban-input cards (Enter-creates-and-reopens-composer,
  undo-on-delete) that build on the same `KanbanPanel` files.

---

### 258. [x] Diff viewer — sort changes by occurrence (default) or alphabetical, persisted

**Status:** Done
**Depends on:** none _(builds on shipped #231 display modes + #237 mode persistence)_
**Created:** 2026-06-30

**Description**

The `DiffInspector` previously rendered changed files in git's emission order with no
client-side sort. This adds two user-chosen, **persisted** file-ordering modes: **By
occurrence** (the new default) places a file at the **bottom** of the list the first time
it appears as changed and never reorders it on a re-change (a file that leaves the diff and
reappears is treated as new → bottom) — so an agent's edits read top-to-bottom in the order
they happened; and **Alphabetical** (case-insensitive A→Z). Both Focused and Accordion
modes, the `i/N` counter, prev/next, and keyboard nav step through the displayed order.

**What shipped** (commit `33cc843`, PR
[#9](https://github.com/ErikdeJager/ReCue/pull/9), merged `8c3e7b9`, 2026-06-30):

- **Persisted preference** — `Settings.diffSortOrder: "occurrence" | "alphabetical"` added
  to `src/types/index.ts`, default `"occurrence"` in `DEFAULT_SETTINGS` (`store.ts`). Lives
  in the frontend-owned settings blob (opaque `serde_json::Value` on the Rust side), so
  **no Rust change** and old blobs upgrade via `mergeSettings`.
- **Pure ordering helper** — new `DiffInspector/diffSort.ts` exports `DiffSortOrder`,
  `reconcileOccurrence(prev, paths, counter)` (assigns the next counter to any newly-seen
  path, keeps existing positions, drops vanished paths) and `sortFiles(files, mode, seq)`.
  Unit-tested in `diffSort.test.ts` (append order, re-seen keeps position, vanish→reappear
  at bottom, case-insensitive stable alphabetical).
- **Wired into `DiffInspector.tsx`** — `sortOrder` seeded once from the global setting at
  mount; a `seq` map reconciled on each poll of `diff`; `orderedFiles = sortFiles(...)`
  feeds the Focused picker, the `i/N` index, `stepFile` wraparound, and the Accordion
  cards. A segmented **Recent / A–Z** toggle in the header (next to the display/line-mode
  toggles, reusing their `.mode`/`.modeActive` styling) writes back via
  `saveSettings({ ...settings, diffSortOrder: next })`.

**Key files/areas touched:** `src/components/DiffInspector/{DiffInspector.tsx,
DiffInspector.module.css,diffSort.ts,diffSort.test.ts}`, `src/types/index.ts`,
`src/store.ts`.

**Dependencies:** none.

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): "by occurrence"
  has **no backend metadata**, so it's derived client-side from a per-panel `path→seq` map;
  the **occurrence sequence is per-panel-session, NOT persisted** — only the sort-mode
  *preference* persists (mirroring `diffDisplayMode`). On a fresh mount the list seeds from
  git's order, then tracks occurrence going forward. Default = occurrence (per the card).
- **Cross-platform:** pure TS/CSS in the WebView — no platform branch; Rust unaffected.
  `npm test` (new `diffSort.test.ts`) / `build` / `lint` green.
- **Foundational** for the planned "seen / not-seen / changed-since-seen" diff marker
  (#278), which interacts with occurrence ordering and edits the same `DiffInspector.tsx` +
  `Settings` surface — they must be serialized.

---

### 260. [x] Fix terminal input lag — don't hold the global session lock across blocking PTY writes

**Status:** Done
**Depends on:** none _(parallel with #261, the output-path half of the same "input lag" PLAN card)_
**Created:** 2026-06-30

**Description**

Typing in one terminal stalled (~0.5s) whenever another terminal was busy/backpressured.
Root cause: `SessionManager` held its **single global `Mutex<HashMap<String, Session>>`**
across **blocking** PTY work — `write_stdin` did `writer.write_all()` + `flush()` while
holding the global guard, so when a busy agent stopped draining its stdin and the PTY input
buffer filled, `write_all` blocked and **every other session's keystroke** (plus every
`resize_pty` and `scrollback` snapshot) queued behind it. `resize_pty` (across
`master.resize()`) and `scrollback` (across a 256 KB ring copy) had the same flaw. This
moves the blocking per-session work off the global lock so a flooding/blocked terminal can
no longer delay other sessions. Behavior is otherwise unchanged. (This is the **input/write
path**; the dominant global-lag fix on the **output delivery path** is the parallel #261.)

**What shipped** (commit `871cde2`, PR
[#10](https://github.com/ErikdeJager/ReCue/pull/10), merged `feba4f6`, 2026-06-30):

- **Per-session `writer` + `master` locks** — `Session.writer` and `Session.master` became
  `Arc<Mutex<Box<…>>>` (mirroring the already-wrapped `child`/`scrollback`), wrapped at the
  spawn site.
- **Blocking ops off the global lock** — `write_stdin`, `resize_pty`, and `scrollback` now
  lock the global map **only** to `get(id)` and **clone the relevant `Arc<Mutex<…>>`**, drop
  the global guard, then do the blocking `write_all`+`flush` / `resize()` / `snapshot()`
  under the per-session lock. Map mutations (`spawn`/`kill_session`/`kill_all`) stay under
  the global lock as fast ops.
- **`TRAJECTORY_TO_WINDOWS.md` note** — records that the keystroke-under-load behavior
  (PTY backpressure) should be spot-checked on a real box, incl. Windows ConPTY.

**Key files/areas touched:** `src-tauri/src/pty.rs` (`Session` struct, `spawn_with_id`,
`write_stdin`, `resize_pty`, `scrollback`); `TRAJECTORY_TO_WINDOWS.md`.

**Dependencies:** none.

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): chose the
  **per-session-lock approach over a per-session writer thread** (lower risk and sufficient;
  the thread variant is reserved only if this proves insufficient). The `activity` stamp
  keeps using its own brief mutex.
- **Cross-platform:** `portable-pty`'s writer/master are the same abstraction on macOS and
  Windows (ConPTY); wrapping them in `Arc<Mutex>` is platform-neutral, no `#[cfg]`. Flagged
  in `TRAJECTORY_TO_WINDOWS.md` for a real-box ConPTY check. `cargo test` green.

---

### 261. [x] Fix global UI lag — shrink the output IPC payload and throttle terminal writes

**Status:** Done
**Depends on:** none _(parallel with #260, the stdin-path half of the same "input lag" PLAN card)_
**Created:** 2026-06-30

**Description**

Heavy terminal output caused ~0.5s lag **everywhere** — including non-terminal React inputs
(the Kanban textarea, file viewers). Root cause: PTY output bytes were emitted to the
WebView as a **JSON integer array** (`Vec<u8>` → `[27,91,49,…]`, ~4 chars/byte, one event
per 8 KB `read()`), so the single WebView main thread had to `JSON.parse` a multi-KB array
of numbers and `Uint8Array.from(...)` it before every `term.write` — saturating the one JS
thread so React keystroke handling queued behind it. (Bytes were already correctly kept out
of Zustand via `outputBus`/`terminalPool`, so the fix is payload size + write scheduling,
not store churn.) This is the **output-delivery** half of the "input lag" card; the parallel
#260 fixed the **stdin write-path** lock contention.

**What shipped** (commit `1b1384b`, PR
[#11](https://github.com/ErikdeJager/ReCue/pull/11), merged `afaf849`, 2026-06-30):

- **(A) Base64 payload** — `OutputPayload` changed from `bytes: Vec<u8>` to `b64: String`
  (TS `OutputPayload { id, b64 }`), encoded in the emit/forwarder path via the `base64 =
  "0.22"` crate. Replaces a multi-KB `JSON.parse` + number-array alloc with a compact string
  + a tight decode loop. New `src/decodeOutput.ts` (`decodeOutputB64` — `atob` → `Uint8Array`
  byte loop, works in both WKWebView and WebView2) with `decodeOutput.test.ts`; a Rust
  round-trip unit test (`output_base64_round_trips`).
- **(B) rAF-coalesced writes** — `terminalPool.ts` now buffers incoming chunks per host and
  flushes them in **one `term.write` per `requestAnimationFrame`** (FIFO order preserved; a
  steady stream still flushes ~60×/s; a pending flush is forced on host teardown so no tail
  bytes are lost).
- **(C) Hot-path cleanup** — dropped the per-chunk `sessions.find(...).reconnecting` linear
  scan in `store.ts onOutput`.
- **`TRAJECTORY_TO_WINDOWS.md` note** — heavy-output render should be spot-checked on
  Windows WebView2.

**Key files/areas touched:** `src-tauri/src/{commands.rs,lib.rs}`, `src-tauri/Cargo.toml`,
`src/types/index.ts`, `src/store.ts`, `src/components/Terminal/terminalPool.ts`,
`src/decodeOutput.ts` + `decodeOutput.test.ts`; `TRAJECTORY_TO_WINDOWS.md`.

**Dependencies:** none.

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): chose **base64**
  as the portable, low-risk baseline over a Tauri v2 binary `Channel` (pick one, not both).
  **Out of scope** (deliberately): changing the reader's 8 KB chunk size or adding backend
  time-window batching — kept latency predictable and the diff reviewable. A→C above are
  sufficient.
- **Cross-platform:** base64 encode/decode + rAF flushing are platform-neutral (pure Rust +
  WebView JS); `atob` exists in both WKWebView and WebView2, no `#[cfg]`. `cargo test` /
  `npm test` (new decode test) / `build` / `lint` green.

---

### 262. [x] Terminal's last line falls below the visible area — guarantee bottom clearance

**Status:** Done
**Depends on:** none
**Created:** 2026-06-30

**Description**

A terminal's lowest row sometimes rendered **below the panel fold**, so the input/prompt
line was clipped out of view and only clearing the terminal fixed it. #178 had already added
vertical `.terminal` padding, but the bug persisted intermittently. Root cause: **sub-row
fit rounding** — the user-configurable line-height makes the *rendered* cell height slightly
larger than `FitAddon` assumes, so `floor(contentHeight / cellHeight)` can yield one row too
many; the real painted height (`rows × actualCellHeight`) then exceeds the content box and
the last row is clipped. It depended on font-size/line-height/panel-height, hence
intermittent.

**What shipped** (commit `0a3347c`, PR
[#13](https://github.com/ErikdeJager/ReCue/pull/13), merged `324c445`, 2026-06-30):

- **More bottom clearance** — `.terminal` padding switched to explicit sides
  `var(--space-12) var(--space-8) var(--space-20) var(--space-8)` (≈20px bottom, larger than
  the top) so a one-row rounding error is absorbed visually. Tokens only; horizontal/top
  unchanged.
- **Conservative fit guard** — in `terminalPool.ts` after `fit.fit()`, the rendered pixel
  height (`term.rows × actualCellHeight` from xterm's measured cell metrics) is compared to
  the host's content-box height; if the last row would overflow, `term.resize(term.cols,
  term.rows - 1)` runs before `resizePty`, so the PTY is always told a row count that fully
  fits. Best-effort via xterm metrics and guarded (never throws — falls back to padding-only
  behavior). Runs on every fit path (reparent, window resize, Settings font-size refit).
- **`TRAJECTORY_TO_WINDOWS.md` note** — last-row clearance should be spot-checked on a
  Windows box at a couple of font sizes (ConPTY + WebView2 font metrics can differ).

**Key files/areas touched:** `src/components/Terminal/Terminal.module.css` (`.terminal`
padding), `src/components/Terminal/terminalPool.ts` (row-fit guard); `TRAJECTORY_TO_WINDOWS.md`.

**Dependencies:** none.

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): do **both** the
  padding bump (the guaranteed-visible part the card asks for) and the fit guard (robust
  across font sizes); read the actual cell height from xterm's metrics with a try/catch
  fallback rather than relying on internals.
- **Cross-platform:** pure CSS + WebView measurement, no OS branch; the cell-height read is
  identical under WKWebView and WebView2. Flagged in `TRAJECTORY_TO_WINDOWS.md` for a
  real-box check. `npm run build` / `lint` green.

---

### 265. [x] Fix the scheduled-worktree card header (three lines / full-width worktree badge)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-30

**Description**

A scheduled session **in a worktree** rendered an ugly three-line Overview card header with
the "worktree" badge stretched full-width. Cause: `ScheduleCard` (Overview.tsx) dropped its
`.name`, the conditional `.worktreeBadge`, and `.meta` as **three direct children** of
`.titleBlock` (a `flex-direction: column` with default `align-items: stretch`), so each
became its own full-width row. The working `SessionCard` avoids this by wrapping name + badge
in a `.agentTitle` row.

**What shipped** (commit `73d814f`, PR
[#12](https://github.com/ErikdeJager/ReCue/pull/12), merged `8b8afcf`, 2026-06-30):

- **Two-line header** — `ScheduleCard`'s title now wraps the `.name` span **and** the
  conditional `.worktreeBadge` together inside the existing `styles.agentTitle` row
  (mirroring `SessionCard`), leaving `.meta` as the second child of `.titleBlock`. Result:
  a clean title-row (name + compact, content-hugging "worktree" badge) above the meta line —
  two lines, not three; the badge no longer stretches (the row's `align-items: center` +
  the badge's existing `flex-shrink: 0`). The header's right-side `.actions` stay aligned
  via the unchanged `PanelColumn` `.header` justify-between.

**Key files/areas touched:** `src/components/Overview/Overview.tsx` (`ScheduleCard` title
wrap). No CSS change needed (reused `.agentTitle`).

**Dependencies:** none.

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): reuse the existing
  `.agentTitle` row class rather than adding new CSS; a non-worktree scheduled card is
  unchanged (name + meta, no badge).
- **Cross-platform:** pure CSS/markup, identical on both platforms. `npm run build` / `lint`
  green.

---

### 259. [x] Create the worktree + branch eagerly when a session is scheduled into a worktree

**Status:** Done
**Depends on:** none _(unblocks the dependent #279 + #280 scheduled-worktree-lifecycle cards)_
**Created:** 2026-06-30

**Description**

When a session was scheduled with the **worktree** option, the worktree folder and its
branch didn't exist yet — so creating any other item inside that worktree before it fired
failed with "branch doesn't exist" (especially for a new branch created in the schedule
modal). Decision (option 1, recorded in `ASSUMPTIONS.md`): **create the worktree directory +
branch eagerly at schedule-creation time** rather than lazily on first item-creation —
far cleaner support, since once the folder and branch exist *every* "create item in this
worktree" path just works with no special-casing. Cost: a worktree lives for the pending
schedule's lifetime, cleaned up (ref-counted) on cancel. (The card's second observation —
a started scheduled worktree showing up as a duplicate top-level folder — is split into the
dependent #279.)

**What shipped** (commit `99e2ea7`, PR
[#14](https://github.com/ErikdeJager/ReCue/pull/14), merged `4e8ee3a`, 2026-06-30):

- **Eager creation at `create_schedule` (commands.rs)** — when `worktree == true`, after
  computing the deterministic `worktree_path`, it `git::worktree_add_new_branch(...)` (new
  branch) or `git::worktree_add(...)` (existing branch), guarded by `!dest.is_dir()`. On
  error the schedule is **not persisted** and the error propagates so the New-Session modal
  surfaces it inline (same UX as the immediate-worktree validation path).
- **Idempotent fire** — `prepare_worktree_for_schedule` now wraps **both** arms
  (create-branch and existing-branch) in a single `!dest.is_dir()` guard, so a fire on an
  already-created worktree just spawns the agent in it (handles pre-#259 schedules / any
  skipped eager-create too). New Rust unit tests:
  `prepare_worktree_for_schedule_is_idempotent_when_dest_exists`, plus a `git.rs`
  worktree add/guard/remove round-trip test.
- **Ref-counted cleanup on cancel (frontend `store.ts`)** — cancelling a pending worktree
  schedule frees its folder via the existing async `remove_worktree` path through a new
  `cleanupWorktreeIfEmpty`, and the worktree **auto-delete guard** (`worktreeUsesPath`) now
  also treats a worktree schedule **targeting** a path (`worktree_path === dest`, its `cwd`
  being the parent repo) — alongside a schedule created *inside* a worktree (`cwd === dest`)
  — as a user of the worktree, so a dirty/in-use worktree is kept and never force-deleted
  (the #74 policy). `createSchedule` propagates the backend error string for inline modal
  display (mirroring `createBranchSession`). Covered by new `store.test.ts` cases.
- **`TRAJECTORY_TO_WINDOWS.md` note** — worktree create/remove on schedule should be
  spot-checked on Windows.

**Key files/areas touched:** `src-tauri/src/commands.rs` (`create_schedule`,
`prepare_worktree_for_schedule`), `src-tauri/src/git.rs` (tests), `src/store.ts`
(`createSchedule` error propagation, `cancelSchedule` cleanup, `worktreeUsesPath` guard),
`src/store.test.ts`, `src/components/NewSessionModal/NewSessionModal.tsx` (inline error);
`TRAJECTORY_TO_WINDOWS.md`.

**Dependencies:** none.

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): chose **eager
  creation at schedule time (option 1)** over lazy creation; a worktree-creation failure at
  schedule time is **surfaced inline and the schedule is not created**; fire made idempotent
  for both branch cases. The ref-counted cleanup landed in the **frontend store** (reusing
  the existing `remove_worktree` + worktree-in-use guard) rather than the backend
  `cancel_schedule`, achieving the same dirty-safe, ref-counted removal.
- **Cross-platform:** all git work goes through the existing `git.rs` helpers
  (`hidden_command()` console-flash guard, cfg-correct); `worktree_path` uses the app-data
  dir, no raw `$HOME`. Flagged in `TRAJECTORY_TO_WINDOWS.md` for a real-box check.
  `cargo test` / `npm test` / `build` / `lint` green.
- **Unblocks** the dependent #279 (duplicate top-level folder when a scheduled worktree
  starts) and #280 (canvas "no longer pending" bug), which build on the corrected
  scheduled-worktree lifecycle.

---

### 264. [x] File tree should refresh when files change on disk (poll + busy→idle re-list)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-30

**Description**

The FileTree didn't reflect files created/deleted on disk (by agents or externally) until a
manual Refresh — new files never appeared. The existing `refreshFileStatuses` only **re-tints
existing rows** (and synthesizes deleted-file ghosts); rows themselves come only from
`list_dir` results, so a newly *created* file needs a re-list. Decision (recorded in
`ASSUMPTIONS.md`): use **polling + event-driven re-list**, not a native fs-watcher — no
`notify`/fs-watch crate is in `Cargo.toml`, a watcher adds a cross-platform native dependency
+ per-repo event plumbing, and the card explicitly sanctions polling. Reuse the existing
per-repo `fileTreeRefresh` signal, which re-lists every currently-loaded level **in place,
preserving expansion**.

**What shipped** (commit `e522237`, PR
[#15](https://github.com/ErikdeJager/ReCue/pull/15), merged `4bed471`, 2026-06-30):

- **`bumpFileTreeRefresh(repo?)` store action** — factored out of the inline bump in
  `moveFilesIntoRepo`; incrementing `fileTreeRefresh[repo]` triggers the existing in-place
  re-list effect in `FileTree.tsx` (expansion preserved).
- **Busy→idle re-list** — at the busy→idle edge (where the branch + file-status refreshes
  already debounce), it now also `bumpFileTreeRefresh()` so new files appear right after an
  agent settles, in addition to the existing re-tint.
- **Gentle visibility-gated poll** — a `FILE_TREE_POLL_MS = 5000` `setInterval` that runs
  only while `!document.hidden`, bumping the re-list + `refreshFileStatuses`; re-lists touch
  only already-loaded levels so cost stays bounded on huge repos. A `400ms` debounce keeps
  focus + poll from double-firing.
- **Window-focus refresh** — catches changes made while the app was backgrounded.
- Manual **Refresh** button (full reset) kept as-is. New `store.test.ts` cases cover the
  bump action and gating.

**Key files/areas touched:** `src/store.ts` (`bumpFileTreeRefresh`, busy→idle bump,
visibility/focus poll + debounce), `src/components/FileTree/FileTree.tsx`,
`src/store.test.ts`.

**Dependencies:** none.

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): **polling over
  fs-watch** (card-sanctioned, no new native dep); ~5s interval + busy→idle re-list + focus
  refresh as the trigger set; reuse the existing `fileTreeRefresh` re-list path (preserves
  expansion) rather than a tree reset; poll paused while the document is hidden.
- **Cross-platform:** pure frontend timers over the existing `list_dir`/`file_statuses`
  reads (already cfg-correct via `hidden_command`) — no OS-specific code, identical on both
  platforms. `npm run build` / `lint` / `test` green.

---

### 263. [x] Make the New/Schedule Session modal open instantly (load branches async)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-30

**Description**

Opening the New/Schedule Session modal was slow. The card guessed the remote `git fetch`
was blocking — but investigation **corrected** that: the fetch is already non-blocking and
off the open path (the modal's auto-fetch effect runs `void fetchRemotes(...)`
fire-and-forget once at the branch step). The real cause was a **pre-open `await
ipc.listBranches(repo)`** in `startRepoSession` (the per-repo "+" / context-menu "New
session" path), which gated `newSessionOpen: true` behind a Tauri round-trip + git shell-out,
so the modal didn't render until branches returned. (The global ⌘N folder-step path already
opened instantly with `newSessionInitialBranches: null`.)

**What shipped** (commit `f324ba3`, PR
[#16](https://github.com/ErikdeJager/ReCue/pull/16), merged `bbed1e1`, 2026-06-30):

- **`startRepoSession` opens immediately** — changed from `async … => Promise<void>` to a
  synchronous `(repo) => void` that sets `newSessionOpen: true` with
  `newSessionInitialBranches: null` (no pre-open `await`). The modal's existing
  branch-detection effect (deps `[open, cwd]`) then fills the list asynchronously inside the
  already-visible modal — local branches first, remotes streaming in after the background
  fetch.
- **Loading affordance** — a `branchesLoading = step === "branch" && branches === null`
  state shows a "loading…" cue (vs the empty/"no branches" state) and gates the branch-step
  actions until the list resolves, so a too-early Enter/create is a no-op. The remote
  "fetching…" hint is unchanged.
- Test updates in `store.refresh.test.ts` for the now-synchronous `startRepoSession`.

**Key files/areas touched:** `src/store.ts` (`startRepoSession` — drop pre-open await),
`src/components/NewSessionModal/NewSessionModal.tsx` (null-list detection + loading state),
`src/store.refresh.test.ts`.

**Dependencies:** none.

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): **corrected the
  card's "remote fetch blocks" guess** (already async) and fixed the actual gating await;
  open at the branch step with `initialBranches: null` and let the existing detection effect
  load the list rather than adding new async plumbing.
- **Cross-platform:** pure frontend control-flow change, no OS-specific code — identical on
  both platforms. `npm run build` / `lint` green.

---

### 266. [x] "Checkout branch…" in the repo (primary folder) context menu

**Status:** Done
**Depends on:** none _(no backend change — reuses existing checkout/create-branch commands)_
**Created:** 2026-06-30

**Description**

Added a **Checkout branch…** item to the sidebar repo context menu so a user can switch a
folder to a different branch — pick an existing branch (local or cached remote) or create a
new one — checked out **in that folder without starting an agent**. The sidebar branch label
and file-tree status update after the checkout.

**What shipped** (commit `79c0987`, PR
[#17](https://github.com/ErikdeJager/ReCue/pull/17), merged `f3c2924`, 2026-06-30):

- **New `"checkout"` `menuMode`** in `Sidebar.tsx` (alongside `menu`/`confirm`/`color`/…),
  with a **picker sub-panel** mirroring the existing `"color"` sub-mode: a filter input, a
  scrollable branch list sorted via the reused `sortBranches` (local under a header, cached
  remotes under a "Remote branches" header, the current branch marked), and a **"+ Create
  new branch"** inline form with inline validation. The branch list is fetched
  (`listBranches`) when the sub-mode opens. A **Checkout branch…** menu item (near Pull,
  gated on a known current branch) opens it.
- **Two store actions** (modeled on `pullFolder`, **no agent spawned** — distinct from
  `spawnSession`'s checkout): `checkoutFolderBranch(repo, branch)` → `ipc.checkoutBranch`
  then `refreshBranches()` + `refreshFileStatuses(repo)` + a success/error toast; and
  `createFolderBranch(repo, name, base)` → `ipc.createBranch` + the same refreshes,
  returning the error string for inline display. Selecting a **remote** branch creates a
  local tracking branch via `createFolderBranch(repo, short, remoteRef)` (the #180/#124
  pattern).
- **Destructive advisory** — a running-agents warning line appears inside the picker
  (sessions with `repoPath === repo`, not exited) before checkout, mirroring the
  NewSessionModal advisory; non-blocking but visible.
- Picker sub-panel CSS reuses the color-picker patterns.

**Key files/areas touched:** `src/components/Sidebar/Sidebar.tsx` (`"checkout"` menuMode +
picker + running-agents advisory), `src/store.ts` (`checkoutFolderBranch`,
`createFolderBranch`), `src/components/Sidebar/Sidebar.module.css`.

**Dependencies:** none.

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): a bespoke
  `"checkout"` sub-mode in the existing repo-menu state machine (not the generic
  `RowContextMenu`); **no agent spawned** on checkout (distinct from the new-session checkout
  path); reuse the existing `checkout_branch`/`create_branch` commands so **no backend
  change**; rely on cached remotes in the picker (no forced fetch).
- **Cross-platform:** pure frontend menu UI over existing cfg-correct git commands; menu copy
  is OS-neutral ("Checkout branch…"). `npm run build` / `lint` green.

---

### 267. [x] Context menu on file-tree folders & files (new folder, delete)

**Status:** Done
**Depends on:** none _(plays well with #264's `fileTreeRefresh` bump)_
**Created:** 2026-06-30

**Description**

Right-clicking a **folder** row in the FileTree now opens a menu with **New folder…** and
**Delete folder**; **file** rows gain a **Delete** item on their existing menu. Deletes are
confirm-gated (respecting the Settings confirm-destructive toggle, #103) and the tree
re-lists in place (expansion preserved) after any change. This adds the **3rd and 4th
deliberate `files.rs` writes** (after `write_text_file` #141 and `move_into_repo` #253),
strictly path-confined.

**What shipped** (commit `fe17c23`, PR
[#18](https://github.com/ErikdeJager/ReCue/pull/18), merged `10213c9`, 2026-06-30):

- **Two new path-validated backend commands** (`files.rs`): **`create_dir(repo, path)`**
  (canonicalize the parent, confine to the repo, refuse a collision — no clobber —
  `fs::create_dir`) and **`delete_path(repo, path)`** (`confine` the existing target; hard
  safety rails: **refuses the canonicalized repo root**, rejects symlinks, doesn't follow
  them; `remove_dir_all` for a dir / `remove_file` for a file). Both reject `..`/symlink
  escape and out-of-repo targets, documented in the file header per the deliberate-write
  convention; a new folder name goes through the reserved-name guard (`windows_safe_seg`, so
  CON/NUL/… can't be created). New Rust confinement tests (collision/out-of-repo/missing
  parent for create; repo-root/traversal/missing-target/symlink for delete).
- **Frontend** — `ipc.ts` `createDir`/`deletePath`; `store.ts` `createFolder` /
  `deleteTreePath` (call ipc → `bumpFileTreeRefresh(repo)` + `refreshFileStatuses(repo)` +
  toast); `FileTree.tsx` extends its inline `FileMenu` with `isDir`, adds `onContextMenu` to
  the folder button, a folder menu (New folder… inline name input that expands the created
  folder; Delete folder, danger + confirm-gated) and a Delete item on the file menu; danger
  styling in `FileTree.module.css`.

**Key files/areas touched:** `src-tauri/src/files.rs` (`create_dir`, `delete_path` + tests +
header note), `src-tauri/src/commands.rs` (wrappers + reserved-name guard),
`src-tauri/src/lib.rs` (register), `src/ipc.ts`, `src/store.ts`,
`src/components/FileTree/{FileTree.tsx,FileTree.module.css}`.

**Dependencies:** none.

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): the two writes are
  the **3rd/4th deliberate `files.rs` writes**, strictly confined (canonicalize, `starts_with`
  repo, **refuse repo root**, reject symlinks/`..`, no clobber) with a reserved-name guard;
  deletes confirm-gated via the existing Settings flow; refresh via the existing
  `fileTreeRefresh` bump (inline if #264 hadn't landed). FileTree uses its own inline menu
  (not the shared `RowContextMenu`), matching the existing file-row menu.
- **Cross-platform:** `fs::create_dir`/`remove_dir_all`/`remove_file` + canonicalize-confine
  are platform-neutral (no shell-out); paths stay repo-relative POSIX over IPC, reassembled
  backend-side. Identical on macOS and Windows. `cargo test` (new confinement tests) /
  `npm run build` / `lint` green.

---

### 268. [x] Natural-language launch-time input for scheduled sessions

**Status:** Done
**Depends on:** none
**Created:** 2026-06-30

**Description**

Replaced the two `datetime-local` launch-time widgets (the New Session modal schedule step
and the ScheduledPanel) with a single free-text field that parses natural-language
time/duration — `1h`, `1 hour`, `30m`, `15:00`, `6pm`/`6 PM`/`6 pm`, `9:30am`, `tomorrow
9am`, explicit dates — with a persistent helper hint and a **live "Starts <date/time>"
preview** as the user types. Unparseable/empty input disables submit/save and shows a gentle
message.

**What shipped** (commit `686f7f7`, PR
[#19](https://github.com/ErikdeJager/ReCue/pull/19), merged `3f7476e`, 2026-06-30):

- **Custom parser in `src/time.ts`** — `parseWhen(input, now)` returning `{ at, label } |
  null`: relative durations (incl. compound "1h 30m" / "90 min"), clock times
  (`15:00`/`6pm`/`9:30am`) rolled to tomorrow if already past `now`, `today`/`tomorrow`
  prefixes, and an explicit-date `new Date(...)` fallback (future-only). **No new date
  dependency** (ReCue's offline/bundled ethos). Covered by `time.test.ts` (every card
  example + past-rolls-to-tomorrow + invalid→null).
- **Both surfaces swapped** — `NewSessionModal.tsx` (schedule step) and `ScheduledPanel.tsx`
  now use a text input + static hint + live preview; `submitSchedule` / the debounced
  `queueSave` derive `fire_at` from `parseWhen(...).at` and block submit/save when the parse
  is null. `formatFireTime` still renders the preview/cards.

**Key files/areas touched:** `src/time.ts` (+ `time.test.ts`),
`src/components/NewSessionModal/{NewSessionModal.tsx,NewSessionModal.module.css}`,
`src/components/ScheduledPanel/{ScheduledPanel.tsx,ScheduledPanel.module.css}`.

**Dependencies:** none.

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): a **custom parser,
  no new date lib** (offline ethos); **a bare time already past today rolls to tomorrow**
  (relative durations always future, explicit dates as-is); free-text field + static hint +
  live preview replacing both `datetime-local` widgets; invalid input disables submit.
- **Cross-platform:** pure TS in the WebView, no OS branch; the free-text field also
  sidesteps `datetime-local`'s inconsistent native picker across WKWebView/WebView2.
  `npm test` (parser) / `build` / `lint` green.

---

### 272. [x] Usage meter turns red starting at 90% (not 95%)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-30

**Description**

The five-hour usage bar now enters its critical (red `--usage-critical`) state at **≥90%**
usage instead of ≥95%. Trivial, self-contained threshold change.

**What shipped** (commit `3c81051`, PR
[#20](https://github.com/ErikdeJager/ReCue/pull/20), merged `a0be2b6`, 2026-06-30):

- `UsageBar.tsx` — `const critical = pct >= 90;` (was `>= 95`); the `.fillCritical` red is
  applied above that. Surrounding "95%" doc comments in `UsageBar.tsx` and `Usage.module.css`
  updated to "90%". No other usage-bar behavior (visibility gating, collapsed-rail variant,
  reduced-motion) changed.

**Key files/areas touched:** `src/components/Usage/UsageBar.tsx`,
`src/components/Usage/Usage.module.css` (comments).

**Dependencies:** none.

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): one-line threshold
  change + matching comment updates; nothing else touched.
- **Cross-platform:** pure threshold/CSS-comment change, identical on both platforms.
  `npm run build` / `lint` green.

---

### 269. [x] "Start now" button on scheduled sessions

**Status:** Done
**Depends on:** 259
**Created:** 2026-06-30

**Description**

A pending scheduled session now has a **Start now** control (in the ScheduledPanel, the
Overview ScheduleCard, and the sidebar schedule row) that fires the schedule **immediately**
— spawning its agent now instead of waiting for the launch time / the 5s poll. A worktree
schedule fires into its (eagerly-created, per #259) worktree without duplicate creation.

**What shipped** (commit `a544883`, PR
[#22](https://github.com/ErikdeJager/ReCue/pull/22), merged `8d1f70d`, 2026-06-30):

- **Backend refactor + new command** — extracted the per-schedule firing body from
  `fire_due_schedules`'s loop into a shared `fire_one_schedule(...)` helper (worktree prep →
  spawn-with-prompt → persist → emit `schedule://fired`/`schedule://error`); both the poll
  loop and the new **`fire_schedule_now(id)`** command call it. `fire_schedule_now` takes the
  schedule out of the store by id (errors if not found / already fired) then fires it,
  reusing #259's idempotent `prepare_worktree_for_schedule`.
- **Frontend** — `ipc.fireScheduleNow(id)`; store `startScheduleNow(id)` → the resulting
  `schedule://fired` event drives the existing `onFired` scheduled→live transition (no extra
  store work; toast on error); a **Start now** button (Play icon, disabled while in flight)
  in the ScheduledPanel, Overview ScheduleCard, and sidebar ScheduleRow.

**Key files/areas touched:** `src-tauri/src/commands.rs` (`fire_one_schedule` extraction,
`fire_schedule_now`), `src-tauri/src/lib.rs` (register), `src/ipc.ts`, `src/store.ts`,
`src/components/{ScheduledPanel/ScheduledPanel.tsx,Overview/Overview.tsx,Sidebar/Sidebar.tsx}`.

**Dependencies:** 259 (eager-worktree creation).

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): a shared
  `fire_one_schedule` helper factored out of `fire_due_schedules` rather than duplicating the
  fire body; reuse the existing `schedule://fired` → `onFired` path so "start now" needs no
  new transition logic.
- **Serialized after #259** (`deps: 259`): both restructure the schedule firing path, so
  building "start now" on the corrected, idempotent fire path avoids a risky merge in
  worktree/spawn code and guarantees fire-now reuses an eagerly-created worktree.
- **Cross-platform:** reuses existing cfg-correct spawn/worktree paths; pure command + button
  wiring, no OS branch. `cargo test` / `npm run build` / `lint` green.

---

### 270. [x] Gray out gitignored files and folders in the file tree

**Status:** Done
**Depends on:** none
**Created:** 2026-06-30

**Description**

Files and folders that git ignores now render **dimmed/grayed** in the FileTree, distinct
from the tracked-status (add/edit/delete) tints. The `file_statuses` read previously dropped
ignored entries entirely.

**What shipped** (commit `1003da5`, PR
[#23](https://github.com/ErikdeJager/ReCue/pull/23), merged `2593492`, 2026-06-30):

- **Backend** — added **`--ignored=matching`** to the single `git status` read so ignored
  paths are emitted per-file; a new `FileStatus::Ignored` variant (serde `"I"`);
  `parse_porcelain_z` now emits `Ignored` for `!` entries instead of `continue`-ing past
  them (still capped by `MAX_STATUS_FILES`). Parser tests extended for the `!`→Ignored case.
- **Frontend** — `FileStatusCode = "M"|"A"|"D"|"I"`; `FileTree.tsx` `statusClass()` maps
  `"I"` → `styles.statusIgnored`; **ignored is kept OUT of the folder severity roll-up** (an
  ignored child must not gray a tracked parent) — a folder grays only when the directory's
  **own** path is ignored, via an `isIgnored` helper. `.statusIgnored` dims the name/icons
  with `--text-muted`; tracked A/M/D tints take priority.

**Key files/areas touched:** `src-tauri/src/git.rs` (`--ignored=matching`,
`FileStatus::Ignored`, parser + tests), `src/types/index.ts`,
`src/components/FileTree/{fileStatus.ts,FileTree.tsx,FileTree.module.css}`.

**Dependencies:** none.

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): `--ignored=matching`
  (per-file, not the dir-collapsing default) so paths key exactly; **ignored excluded from
  the roll-up severity** (folder grays only when itself ignored); ignored tint lower priority
  than tracked status. Additive — existing `"M"/"A"/"D"` codes unchanged (also used by
  #252/#264).
- **Cross-platform:** the only OS-sensitive primitive is the `git` shell-out (already via
  `hidden_command`); tints use on-system tokens (`--text-muted`), no `#[cfg]`. `cargo test` /
  `npm test` / `build` / `lint` green.

---

### 271. [x] Copy button on rendered markdown code blocks (FileViewer)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-30

**Description**

Each fenced code block in **rendered markdown inside the FileViewer** now shows a small
hover-revealed **Copy** button that copies the snippet's raw text to the clipboard with the
existing "Copied" toast. Scoped to the FileViewer only (the Mermaid precedent), so
Kanban/PatchNotes/Settings markdown are unaffected; inline code and mermaid diagrams are
excluded.

**What shipped** (commit `0e5df54`, PR
[#24](https://github.com/ErikdeJager/ReCue/pull/24), merged `4de2e10`, 2026-06-30):

- **`pre` override** added to FileViewer's `markdownComponents` (a `CodeBlockWithCopy`
  component, alongside the existing `code: MermaidCode`) — it renders the default `<pre>`
  content plus an absolutely-positioned Copy button (Lucide `Copy`), revealed on
  `:hover`/`:focus-within`. The snippet text is extracted from the child `code` element
  (`String(...)`, trailing newline stripped) and copied via the store's
  `copyToClipboard(snippet, "code")`. Inline code (no fenced block) and mermaid fences get
  no button (mermaid short-circuits through the `code` override).
- CSS additions in `FileViewer.module.css` (relative wrapper, absolute top-right hidden-until-
  hover button, accessible focus).

**Key files/areas touched:** `src/components/FileViewer/FileViewer.tsx`
(`CodeBlockWithCopy` + `pre` override), `src/components/FileViewer/FileViewer.module.css`.

**Dependencies:** none.

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): a `pre` override
  (not a `code`-only one) so the button positions over the whole block; **FileViewer-scoped**
  (Mermaid precedent); the in-app web clipboard **write** via `copyToClipboard` (distinct
  from the Tauri terminal-paste read path).
- **Cross-platform:** `navigator.clipboard.writeText` works in both WKWebView and WebView2;
  pure WebView UI, no OS branch. `npm run build` / `lint` green.

---

### 273. [x] Make the Canvas-tabs "+" icon the same visual size as its neighbors

**Status:** Done
**Depends on:** none
**Created:** 2026-06-30

**Description**

The "+" add-tab glyph in the Canvas tab strip read as smaller than its neighbors (Templates
▾, Distribute). The button boxes were already 20px-equal — the thin Lucide `Plus` cross just
*looked* lighter than the stroke-heavier `LayoutTemplate`/`Grid2x2`. Trivial icon-weight fix.

**What shipped** (commit `b9474bc`, PR
[#21](https://github.com/ErikdeJager/ReCue/pull/21), merged `4eaab7c`, 2026-06-30):

- `CanvasTabs.tsx` — bumped `<Plus size={14} strokeWidth={1.5} />` to
  `<Plus size={16} strokeWidth={2} />` so the glyph occupies a footprint comparable to its
  neighbors. The button box stays 20px; hit-area, hover, and disabled styling unchanged.

**Key files/areas touched:** `src/components/Canvas/CanvasTabs.tsx` (the `Plus` icon
size/strokeWidth).

**Dependencies:** none.

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): grow the glyph (not
  the box) to match the visual weight of `LayoutTemplate`/`Grid2x2`.
- **Cross-platform:** pure icon-size prop, identical on both platforms. `npm run build` /
  `lint` green.

---

### 274. [x] Fix Template Editor block-config layout (path-mode buttons + prompt height)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-30

**Description**

Two layout bugs in the Canvas `TemplateEditor`'s block-config panel (the card's "Kanban
template editor"): the `open-file` block's **Relative / Absolute** path-mode buttons
stretched to full width, and the `new-agent` ("start session") block's **prompt textarea**
only filled about half the available height. Pure CSS fix.

**What shipped** (commit `a8ce2f1`, PR
[#25](https://github.com/ErikdeJager/ReCue/pull/25), merged `a7deba5`, 2026-06-30):

- **Path-mode buttons** — `.pathModeBtn` dropped `flex: 1` for `flex: 0 0 auto` + a
  `min-width: 72px`, so the Relative/Absolute pair renders as a compact, tidy segmented pair
  instead of stretched full-width bars.
- **Prompt textarea** — `.configInput`/`.configField` flex to fill the block body (raised
  `min-height` to `140px`, kept `flex: 1` with `min-height: 0` on the wrapping label/column),
  so the prompt fills the available height and stays scrollable for long prompts.

**Key files/areas touched:** `src/components/TemplateEditor/TemplateEditor.module.css`
(`.pathModeBtn`, `.pathModeRow`, `.configInput`, `.configField`).

**Dependencies:** none.

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): the card's "Kanban
  template editor" = the Canvas `TemplateEditor` (the only template-editing surface);
  compact path-mode pair via `flex: 0 0 auto` + `min-width`; raise the prompt textarea's
  `min-height` and let it flex rather than restructuring the markup.
- **Cross-platform:** pure CSS, identical on both platforms. `npm run build` / `lint` green.

---

### 276. [x] Kanban — pressing Enter creates a card and reopens a fresh composer

**Status:** Done
**Depends on:** 257
**Created:** 2026-06-30

**Description**

In the Kanban add-card composer, pressing **Enter** now creates the card **and keeps the
composer open with an empty, focused input**, so the user can type the next card without
re-clicking "+ Add card". An empty Enter (or Escape) still closes the composer. Built on the
resized composer from #257.

**What shipped** (commit `9aa03eb`, PR
[#26](https://github.com/ErikdeJager/ReCue/pull/26), merged `baa2ca6`, 2026-06-30):

- `KanbanPanel.tsx` `BoardColumn` — `submitComposer`'s **success path** no longer calls
  `cancelComposer()`; instead it clears the text (`setComposerText("")`), keeps `composing =
  true`, and re-focuses the textarea via a new `composerRef`. The **empty** submit path still
  calls `cancelComposer()` (closes), so an empty Enter exits the add flow. Escape/blur
  unchanged; the IME guard (don't submit mid-composition) and card-text parsing (first line
  title / rest body) are preserved.

**Key files/areas touched:** `src/components/Kanban/KanbanPanel.tsx` (`submitComposer`,
`composerRef` + re-focus).

**Dependencies:** 257 (built on the resized Kanban composer; same file/region).

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): keep the composer
  mounted and just clear + re-focus on a successful Enter; empty Enter / Escape still close.
- **Cross-platform:** pure React state/focus logic, Enter-only (no `metaKey || ctrlKey`),
  identical on both platforms. `npm run build` / `lint` green.

---

### 279. [x] Scheduled worktree should not appear as a duplicate top-level folder when it starts

**Status:** Done
**Depends on:** 259
**Created:** 2026-06-30

**Description**

When a scheduled **worktree** session fired, its worktree folder appeared **both** as a
worktree sub-group under its parent repo **and** as a phantom empty top-level primary folder
in the sidebar. Root cause: the frontend `onFired` handler prepended the fired session's
`repo_path` (the **worktree folder** for a worktree schedule) to `recents`, so that folder
entered `repoOrder(...)` and rendered its own top-level `RepoGroup` (empty, since the live
agent has `worktreeParent` set and is filtered into the sub-group). A **live-only frontend
artifact** — the backend `fire_due_schedules` adds the **parent** `sched.cwd` to recents, so
it vanished on restart; the interactive `spawn_worktree_agent` path never touches recents,
which is why interactive worktree agents didn't duplicate. (Second half of the
scheduled-worktree card; the first half — eager creation — is #259, which this builds on.)

**What shipped** (commit `0ebef4f`, PR
[#27](https://github.com/ErikdeJager/ReCue/pull/27), merged `c90507e`, 2026-06-30):

- `store.ts` `onFired` — the recents prepend now uses `const recentPath =
  session.worktree_parent ?? session.repo_path;`, so a worktree session adds its **parent
  repo** to recents (matching the backend's `sched.cwd` recent and a restart) instead of the
  worktree folder; non-worktree fired sessions still prepend `repo_path`. The dedup filter
  uses the same `recentPath`. No top-level duplicate is introduced; the live and persisted
  sidebar views agree.

**Key files/areas touched:** `src/store.ts` (`onFired` recents handling for worktree
sessions).

**Dependencies:** 259 (builds on the eager-worktree lifecycle; both touch the
scheduled-worktree sidebar/`onFired` path).

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): add the **parent**
  repo to recents (not the worktree folder, and not nothing) so the live view matches both
  the backend recent and a restart, mirroring the interactive worktree path.
- **Cross-platform:** pure frontend store logic, identical on both platforms. `npm run build`
  / `lint` / `test` green.

---

### 275. [x] Export / import Canvas templates (JSON) for sharing

**Status:** Done
**Depends on:** none
**Created:** 2026-06-30

**Description**

From the Template Manager, a user can now **Export** a template to a `.json` file and
**Import** a template from a `.json` file — enabling sharing between machines/developers.
(The card's "Kanban template" = the app's **Canvas Template** system, the only template
feature; #274's "Kanban template editor" is the same `TemplateEditor`.) Import was included
alongside export so the round-trip — the point of "share with other developers" — is
complete.

**What shipped** (commit `65d8519`, PR
[#28](https://github.com/ErikdeJager/ReCue/pull/28), merged `c1e3ad2`, 2026-06-30):

- **Export** — a per-template store `exportTemplate(id)` opens a native save dialog
  (`ipc.saveFileDialog(`${name}.json`)`) and writes pretty-printed JSON via
  `write_text_file(parentDir, base)` — reusing the **#163 parent-dir-as-root consent trick**
  (the absolute path `/a/b/c.json` addressed as `{ repoPath: "/a/b", file: "c.json" }`), so
  **no new backend write command**. A per-row Export button in the manager.
- **Import** — `importTemplate()` uses `pickFile` (json) → `read_text_file` → the validated
  `parseTemplateJson` → `saveTemplate({ name, layout })` (mints a fresh id), toasting the
  result. A footer Import button.
- **Validation** — new pure `templateIo.ts` `parseTemplateJson(text)` guards the foreign
  blob's shape (a `name` string + a `layout` that is a `CanvasNode | null`) before it ever
  reaches the templates blob; a malformed/foreign import is rejected with a toast, leaving
  existing templates intact. Covered by `templateIo.test.ts`.
- The existing `dialog:default` capability already covers the save dialog, so **no
  capability change** was needed. `TRAJECTORY_TO_WINDOWS.md` notes the save-dialog + write
  path should be spot-checked on Windows.

**Key files/areas touched:** `src/components/TemplateManager/{TemplateManager.tsx,
TemplateManager.module.css,templateIo.ts,templateIo.test.ts}`, `src/store.ts`
(`exportTemplate`/`importTemplate`), `src/ipc.ts` (`saveFileDialog`); `TRAJECTORY_TO_WINDOWS.md`.

**Dependencies:** none.

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): the "Kanban
  template" is the Canvas Template system; **import included** (complete round-trip); reuse
  the #163 parent-dir-as-root consent trick + `write_text_file`/`read_text_file` rather than
  a new backend command; import re-mints a fresh id (so two machines can't collide); a
  validated `parseTemplateJson` guards the blob; `dialog:default` already covered `save()`
  so no extra capability grant.
- **Cross-platform:** native save/open dialogs + `read_text_file`/`write_text_file` are
  platform-neutral (backend reassembles paths; `splitPath` handles `/` or `\`), no OS branch;
  flagged in `TRAJECTORY_TO_WINDOWS.md` for a real-box check. `npm test` (parser) / `build` /
  `lint` green.

---

### 277. [x] Kanban — transient "undo" button after deleting a card

**Status:** Done
**Depends on:** 276
**Created:** 2026-06-30

**Description**

Deleting a Kanban card now shows a small **Undo** affordance at the deleted card's former
position; clicking it restores the card with its content at the same spot. Only the **most
recent** deletion is undoable — a new delete moves the affordance to the new spot and
discards the previous one. Transient: component state only, never persisted (gone on file
switch / reopen / restart).

**What shipped** (commit `353e36f`, PR
[#29](https://github.com/ErikdeJager/ReCue/pull/29), merged `6b0d84f`, 2026-06-30):

- **Capture-before-delete** — the inline `onCardDelete` handler reads the card and sets a new
  panel-local `lastDeleted = { col, idx, card }` before `mutate(deleteCard(...))`; each delete
  overwrites it (so the affordance moves to the newest deletion and the previous one vanishes
  — the spec's behavior for free).
- **Pure insert op** — new `insertCardAt(board, col, idx, card)` in `kanbanOps.ts` (splice
  back at `idx`, clamped) + unit test.
- **Undo affordance** — a slim `UndoRow` (`Undo2` icon + "Undo") rendered at the deleted
  index in `BoardColumn`; clicking it `mutate(insertCardAt(...))` and clears `lastDeleted`.
- **Transience** — `lastDeleted` is plain component state (never routed through
  `mutate`/`serializeBoard`) and is cleared in the per-file reset effect, so it never
  persists. Auto-save reflects the final board after delete and after undo.

**Key files/areas touched:** `src/components/Kanban/KanbanPanel.tsx` (`lastDeleted`,
`UndoRow`, capture + reset), `src/components/Kanban/kanbanOps.ts` (`insertCardAt` + test),
`src/components/Kanban/KanbanPanel.module.css`.

**Dependencies:** 276 (serialize the kanban-UI cluster 257 → 276 → 277, all editing
`KanbanPanel.tsx`/`BoardColumn`).

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): single-level undo
  via panel-local `lastDeleted` overwritten by the next delete; a pure `insertCardAt` op (no
  insert-at-index existed); kept until the next delete or a file switch (no timeout).
- **Cross-platform:** pure React/TS, identical on both platforms. `npm test` (`insertCardAt`)
  / `build` / `lint` green.

---

### 278. [x] Diff viewer — per-file "seen" marker (Seen / Not-seen / Changed-since-seen)

**Status:** Done
**Depends on:** 258
**Created:** 2026-06-30

**Description**

Each changed file in the DiffInspector now carries a **three-state review marker** shown with
icons (not text): **NotSeen** (never marked), **Seen** (marked reviewed, diff unchanged
since), and **ChangedSinceSeen** (was Seen, but its diff content changed afterward — flips
automatically). Toggle via a per-file icon button **or** the **`s` keybind**; works in both
Focused and Accordion modes; keybind hints are visible; state persists across restarts.
Built on #258's ordering (a changed file moves to the bottom **and** its marker flips).

**What shipped** (commit `038a70c`, PR
[#30](https://github.com/ErikdeJager/ReCue/pull/30), merged `58a4690`, 2026-06-30):

- **Client-side content digest** — new `diffSeen.ts` `fileDigest(file)` (a stable hash of
  `status|add|del|JSON.stringify(hunks)` — the full parsed hunks, accurate even though
  rendering truncates) and `seenState(file, storedDigest)` returning
  `notSeen|seen|changed`. No backend metadata. Unit-tested in `diffSeen.test.ts`.
- **Persisted in a dedicated Rust `diff_seen` scalar** (`store.rs` `serde_json::Value` +
  `diff_seen()`/`set_diff_seen()` commands, registered in `lib.rs`, Rust test), shaped
  `{ [repoPath]: { [filePath]: digest } }` — **kept out of the settings blob** so the
  Settings draft can't clobber it (modeled on `sidebar_width`/`repo_order`). Frontend:
  `ipc.getDiffSeen`/`setDiffSeen`; store `diffSeen` slice loaded on boot + `markDiffSeen`/
  clear with a debounced persist.
- **Component** — per-file `seenState` from `diffSeen[repoPath]?.[path]`; an icon toggle
  button in the Focused sub-header and each Accordion card header (Eye/Check/AlertCircle
  style via `--status-*` tokens, **icons only** with `title`/`aria-label`); the `s`/`S`
  keybind in `onPanelKeyDown` toggles the active file (works with a single file, after the
  modifier + typing-context guards), with `aria-keyshortcuts="s"` and a visible hint.

**Key files/areas touched:** `src-tauri/src/{store.rs,commands.rs,lib.rs}` (`diff_seen`),
`src/ipc.ts`, `src/store.ts`, `src/types/index.ts`,
`src/components/DiffInspector/{diffSeen.ts,diffSeen.test.ts,DiffInspector.tsx,DiffInspector.module.css}`.

**Dependencies:** 258 (shared `DiffInspector.tsx`; seen state interacts with occurrence
ordering).

**Notes**

- **Autonomous decisions** (per the standing `ASSUMPTIONS.md` deferral): change detection via
  a **client-side content digest** (no backend metadata); persisted in a **dedicated
  `diff_seen` Rust scalar** kept out of the settings blob; **icons-only** markers with the
  plain `s` keybind (works with a single file); both Focused + Accordion; visible hints.
- **Cross-platform:** plain unmodified `s` key (no `metaKey`), pure WebView UI + a cfg-neutral
  persisted scalar — identical on macOS/Windows, no OS branch. `npm test` (digest/state) /
  `cargo test` / `build` / `lint` green.

---

### 280. [x] Fix Canvas "no longer pending" for scheduled agents (on fire + detached windows)

**Status:** Done
**Depends on:** 279
**Created:** 2026-06-30

**Description**

Two bugs where a Canvas panel holding a **scheduled agent** wrongly showed
`ScheduledPanel`'s "This schedule is no longer pending." message:

1. **On fire (main window):** when a schedule fired, the panel showed "no longer pending"
   instead of the newly-started **live agent terminal**.
2. **Detached window:** popping that Canvas into its own window (#84) showed "no longer
   pending" **immediately**, even while the schedule was still pending.

Root causes: (1) `onFired` upserted a new live `PersistedSession` (new id) and removed the
schedule but **never rewrote the Canvas leaf**, which stayed `{ kind:"scheduled", scheduleId }`
→ `ScheduledPanel` couldn't find the removed schedule → "no longer pending". (2) Schedules
were **main-window-only** (`listSchedules`/`subscribeScheduleEvents` gated on `IS_MAIN_WINDOW`),
so a detached `CanvasWindow` had an empty `schedules` array and hit the `!schedule` gone-state.

**What shipped** (commit `a08a85b`, PR
[#31](https://github.com/ErikdeJager/ReCue/pull/31), merged `e3e0a94`, 2026-06-30):

- **Part 1 — rewrite scheduled leaves on fire.** New pure `canvasSchedule.ts`
  `rewriteScheduledLeaves(canvases, scheduleId, newContent)` walks every Canvas tab's BSP
  layout and replaces any leaf whose content is `{ kind:"scheduled", scheduleId }` with the
  live agent content — **preserving the leaf id** so the #18 pooled terminal reparents into the
  same slot (mirrors `moveLeaf`/`pruneCanvasLeaves`); returns the **same array reference** when
  nothing matched (caller skips a redundant persist). Unchanged subtrees keep object identity.
  `onFired` (`store.ts`) calls it after upserting the live session and persists via the existing
  `setCanvases` → `set_canvases` path, which **broadcasts `canvas://changed`** so both the main
  window and any detached window holding that leaf flip to the live terminal. Unit-tested in
  `canvasSchedule.test.ts`.
- **Part 2 — make detached windows schedule-aware (option (a), the broadcast).**
  `listSchedules()` now runs on boot in **every** window (no longer `IS_MAIN_WINDOW`-gated) so a
  pending scheduled leaf has its data to render the editable `ScheduledPanel`. A new Rust
  `broadcast_schedules` helper emits **`schedule://changed`** (the full `schedules` array) after
  every schedule mutation — `create_schedule` / `update_schedule` / `cancel_schedule` /
  `fire_due_schedules` / `fire_schedule_now` — mirroring `canvas://changed`; detached windows
  listen and replace their `schedules` slice (live edits to a pending schedule's time/prompt
  show in the detached window too). Detached windows also subscribe to **`schedule://fired`** to
  upsert the fired session locally, so the rewritten agent leaf (synced via `canvas://changed`)
  can render its terminal. The `!schedule` "no longer pending" message now only shows on a
  genuine cancel.

**Key files/areas touched:** `src/components/Canvas/{canvasSchedule.ts,canvasSchedule.test.ts}`
(pure rewrite helper + test), `src/store.ts` (`onFired` leaf rewrite + persist; ungated
detached schedule load; `schedule://changed`/`schedule://fired` subscriptions),
`src-tauri/src/commands.rs` (`broadcast_schedules` + emit after every schedule mutation),
`src/ipc.ts` (`schedule://changed` subscription wiring), `TRAJECTORY_TO_WINDOWS.md` (notes the
detached-window real-box check per the #84 precedent).

**Dependencies:** 279 (both edit `onFired`; serialized after the corrected
scheduled-worktree lifecycle so the `onFired` changes stay coherent).

**Notes**

- **Decision:** chose **option (a)** from the plan — a dedicated `schedule://changed` broadcast
  — over the minimal re-`listSchedules`-on-events fallback, for correctness (live updates to a
  pending schedule propagate to detached windows). Documented in `ASSUMPTIONS.md` §Task 280.
- **Cross-platform:** pure cross-window event/state logic; Tauri events are global on both
  platforms, so identical on macOS/Windows (no path/shell/OS branch). The detached-window
  fire/sync path is flagged in `TRAJECTORY_TO_WINDOWS.md` for a real-box check (GUI multi-window,
  not CI-unit-testable). `npm test` (`rewriteScheduledLeaves`) / `build` / `lint` /
  `lint:rust` green.

---

### 282. [x] Windows parity audit + remediation (pre-v1.0.2 release gate)

**Status:** Done
**Depends on:** 280
**Created:** 2026-06-30

**Description**

A **fix-mode** Windows-parity audit run as the **pre-release gate for v1.0.2** (Task 281):
a grep-driven, single-agent sweep of **all 13 landmine categories**
(`.claude/skills/windows-parity-audit/windows-landmines.md`) across `src/`, `src-tauri/src/`,
the CSS, and the build/bundle/CI config — every grep seed run and **every hit confirmed by
reading the cited code** against ReCue's established cross-platform seams. Findings fixed
through the named seam with the divergence gated, the **macOS arm byte-for-byte**, the Windows
arm additive. The audit (scope · findings · fixes · pending real-box checks) was recorded in
the tracked `TRAJECTORY_TO_WINDOWS.md` so the deliverable is durable and the PR diff non-empty
even given the port's maturity.

**What shipped** (commit `3bae702`, PR
[#32](https://github.com/ErikdeJager/ReCue/pull/32), merged `d4acfdd`, 2026-06-30):

- **One confirmed defect fixed (Medium — clipboard write).** `store.ts` `copyToClipboard`
  (every "Copy session ID / path / branch name", the FileViewer code-block **Copy** button,
  the file-tree Copy-path) wrote via **`navigator.clipboard.writeText`**, which **WebView2**
  rejects with *"Document is not focused"* for a copy fired from a context menu / hover button
  (WebView2 is stricter than WKWebView about document focus) — so a copy that succeeds on
  macOS could toast **"Copy failed"** on Windows. This is the **write-side twin of the #220
  read defect** (which had already moved the clipboard *read* to the
  `tauri-plugin-clipboard-manager` but left the *write* on the Web API). **Fix through the
  same #220 seam:** new `ipc.clipboardWriteText` (the plugin's `writeText`), and
  `copyToClipboard` now **routes the write through the plugin on Windows** (gated by
  `isWindows(get().platform)` — the native OS clipboard needs no document focus), keeping
  **`navigator.clipboard.writeText` on macOS byte-for-byte** in the `else` branch. Granted the
  additive `clipboard-manager:allow-write-text` capability.
- **All 12 other categories swept clean / already-seamed** (confirmed by reading, not
  re-flagged): POSIX paths (`Path::join` / `\`→`/` normalization / `joinPath`/`splitPath`),
  home dir (`path_env::home_dir()`), shell-outs (`git::hidden_command`), CLI resolution
  (`resolve_command`/`find_on_path`/`launch_target`), URLs vs reveal (`open_url` / `os_open` /
  `explorer /select`), keyboard (`metaKey || ctrlKey`), platform copy (`kbdHint`/`revealLabel`),
  `cfg`-gating (every arm paired), reserved names (`windows_safe_seg`/`validate_new_segment`),
  CSS/WebView (`-webkit-` paired with standard; `color-mix()` evergreen-only; `::-webkit-scrollbar`),
  build/CI (NSIS+MSI + 2-OS matrix), and line endings (`.gitattributes` `eol=lf`).
- **Newest code re-verified** (#202/#252/#253/#254/#255/#275/#277/#278/#267/#154 + Task 280's
  cross-window schedule events) — all confirmed cross-platform-correct.

**Key files/areas touched:** `src/ipc.ts` (`clipboardWriteText` plugin write seam),
`src/store.ts` (`copyToClipboard` Windows-gated route via `isWindows`),
`src-tauri/capabilities/default.json` (`clipboard-manager:allow-write-text`),
`TRAJECTORY_TO_WINDOWS.md` (Iteration 9 audit entry — scope · the one finding · the 12
clean/already-seamed categories · pending real-box checks). No `CLAUDE.md` change (no new seam
— reused the #220 clipboard-manager seam).

**Dependencies:** 280 (the audit had to cover the **final** shipping feature set, so it gated
on the last in-flight feature fix; order is **280 → 282 → 281**; 257–279 already archived).

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 282): run the audit in **fix mode** (audit →
  confirm → apply), not report-only; **always append a dated `TRAJECTORY_TO_WINDOWS.md` entry**
  for a guaranteed non-empty deliverable; the implementer ran the **grep seeds itself**
  (single-agent — `worktree-implementer` has no `Agent` fan-out) rather than the skill's Explore
  fan-out.
- **Cross-platform:** the single fix is `isWindows`-gated with the macOS `else` branch
  unchanged; the Windows clipboard-write path (and the carried xterm/installer/GUI items) are
  logged in `TRAJECTORY_TO_WINDOWS.md` for a real-box check (WebView2 copy-from-context-menu is
  not CI-testable). Full green suite: `npm run build` / `lint` / `format:check` / `test` /
  `lint:rust` + `cargo test`.

---

### 281. [x] Release v1.0.2 (version bump + patch notes)

**Status:** Done
**Depends on:** 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272,
273, 274, 275, 276, 277, 278, 279, 280, 282

**Created:** 2026-06-30

**Description**

Cut **v1.0.2**: bump the app version everywhere it's declared and author the in-app
current-version patch notes summarizing everything since v1.0.1, then push to `main` so the
release pipeline produces a draft release (a maintainer publishes it). The **final task of the
batch** — gated on every task refined alongside it (257–280) **plus** the pre-release
Windows-parity audit (282), so the shipping code is complete and Windows-clean before the
version is cut. Order: **280 → 282 → 281**. Mirrors the v1.0.1 release task (#256).

**What shipped** (commit `cacb1a4`, PR
[#33](https://github.com/ErikdeJager/ReCue/pull/33), merged `3b4ff68`, 2026-06-30):

- **Version bumped to `1.0.2`** in both `src-tauri/tauri.conf.json` (the pipeline's version
  gate, `1.0.2 > v1.0.1` → triggers `release.yml`) and `package.json` (kept in sync). The
  **implementing** agent performs the bump (the refine lane never bumps version — that guard
  only blocks *accidental* bumps).
- **New `src/patchnotes/1.0.2.json`** — the in-app "What's new" for Settings → Updates (loaded
  by `src/patchnotes.ts`, rendered by `components/PatchNotes`), with user-facing prose
  **regenerated at implementation time from `git log v1.0.1..HEAD` + the new `TASK_ARCHIVE.md`
  entries**, grouped into **feature / improvement / fix**:
  - **feature:** natural-language schedule launch time (`1h`/`6pm`/`tomorrow 9am`) w/ live
    preview, **Start now** for a scheduled session, diff-viewer **Seen/Not-seen/Changed-since-seen**
    review markers (`s` key, persisted), file-tree **new-folder / delete** right-click actions,
    repo **Checkout branch…** (switch/create a branch without starting an agent), **export/import
    Canvas templates** (JSON), **Copy** button on rendered markdown code blocks, and Kanban
    **Undo** for an accidental card delete.
  - **improvement:** snappier typing under heavy terminal output, instant-opening New/Schedule
    Session modals (branch list loads in background), diff-file ordering (by-change vs
    alphabetical, persisted), self-refreshing file tree, dimmed **gitignored** rows, larger
    resizable Kanban card inputs, Enter-adds-and-keeps-composer-open, usage bar red at 90%.
  - **fix:** terminal last-line no longer slips below view, scheduled-worktree tidy-up
    (up-front worktree/branch, no duplicate top-level folder, clean header), Canvas scheduled
    panel shows the live terminal on fire (incl. detached window) instead of "no longer
    pending", Template Editor block-config layout, Canvas tabs **+** sizing, and reliable
    **Copy** on macOS **and** Windows.
- **Push to `main`** triggers the on-push `release.yml` version gate → a **draft** GitHub
  release (Claude-constructed body from the tag range) + a 2-OS matrix of signed macOS/Windows
  bundles + merged `latest.json`. A **maintainer publishes** the draft (the "latest" endpoint
  only resolves to a published release).

**Key files/areas touched:** `src-tauri/tauri.conf.json` + `package.json` (version → `1.0.2`),
`src/patchnotes/1.0.2.json` (new). No runtime code — version strings + a JSON notes file.

**Dependencies:** all of 257–280 **plus 282** — the release gates on every refined task being
implemented and on the pre-release Windows-parity audit landing first. Must run last.

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 281): the *implementing* agent performs the bump;
  patch-notes item list **regenerated from the actual merged set** at implementation time (not
  the plan's illustrative examples); out of scope = building / signing / tagging / **publishing**
  the release (the pipeline + a maintainer do those).
- **Cross-platform:** version strings + a JSON patch-notes file + docs; no OS branch. The
  pipeline builds **both** macOS and Windows; patch-notes copy that names a platform reads
  "macOS and Windows" (the Copy-reliability note). Full green suite: `npm run build` / `lint` /
  `format:check` / `test` / `lint:rust` + `cargo test`.

---

### 283. [x] "Move all cards to next column" button on each Kanban column

**Status:** Done
**Depends on:** none
**Created:** 2026-06-30

**Description**

Each non-rightmost, non-empty column of ReCue's in-app **markdown Kanban board**
(`KanbanPanel`) now shows a header **"move all cards right"** button that, in one click, moves
**every** card in that column into the immediately adjacent column to the right (appended after
that column's existing cards). There is **no** left-move counterpart, and the **rightmost
column** (nothing to its right) and **empty columns** (nothing to move) show no button. The
move round-trips through the existing Obsidian-Kanban markdown format and the auto-save buffer
exactly like every other Kanban mutation.

**What shipped** (commit `466df21`, PR
[#34](https://github.com/ErikdeJager/ReCue/pull/34), merged `f1340dc`, 2026-06-30):

- **New pure op** `moveAllCardsRight(board, fromCol)` in
  `src/components/Kanban/kanbanOps.ts` (in the column-mutations section): returns a new `Board`
  with `fromCol` emptied and its cards **appended** into `fromCol + 1` (matching
  `moveCard`/`addCard`, which append). Immutable and **no-op-safe** — returns the board
  unchanged when `fromCol` is the rightmost column, out of range (negative / beyond length), or
  already empty. Moved cards **keep their `checked` state** (no auto-"complete" even into the
  `**Complete**` lane), consistent with drag-moves.
- **Column-header button** in `src/components/Kanban/KanbanPanel.tsx`: a lucide
  `ArrowRightToLine` (`size={13}`) button reusing the existing `styles.colBtn` class (no new
  CSS), rendered in the hover/focus-revealed `.columnActions` span **before** the Delete
  button, only when `props.canMoveRight && props.cards.length > 0`. New `ColumnProps` fields
  `onMoveAllRight: () => void` + `canMoveRight: boolean`; wired in the `board.columns.map(...)`
  render as `onMoveAllRight={() => mutate(moveAllCardsRight(board, col))}` and
  `canMoveRight={col < board.columns.length - 1}`, so it persists/hot-reloads via the same
  `mutate` → `serializeBoard` → `setText` → debounced `write_text_file` path as every other edit.
- **Unit tests** in `src/components/Kanban/kanbanOps.test.ts` (`describe("kanbanOps
  moveAllCardsRight (#283)")`): append-into-next + source-emptied + columns≥2 untouched +
  `checked` preserved + relative order kept, and no-ops on the rightmost / empty / out-of-range
  source, plus an immutability assertion.

**Key files/areas touched:** `src/components/Kanban/kanbanOps.ts` (new op),
`src/components/Kanban/KanbanPanel.tsx` (icon import, `ColumnProps`, header button, column-map
wire-up), `src/components/Kanban/kanbanOps.test.ts` (tests). No CSS, no backend, no native code.

**Dependencies:** none.

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 283): "next column" = the immediately adjacent
  column to the **right** in document/array order (`columns[fromCol + 1]`); the **rightmost
  column gets no button** and **no left variant** was requested; an **empty column shows no
  button**; cards **append** into the target; moved cards **keep `checked`** (no auto-complete);
  **no confirm gate** (non-destructive, trivially reversible — one markdown write, target cards
  untouched), consistent with the ungated drag card-moves; a single right-arrow lucide icon in
  the existing hover-revealed `.columnActions` span reusing `styles.colBtn` (no new CSS).
- **Cross-platform:** pure React/TS + Obsidian-Kanban markdown round-trip — identical on
  macOS/Windows; no path, shell, native, or `#[cfg]` concerns. Project checks green:
  `npm run build` / `lint` / `format:check` / `test` (incl. the new `kanbanOps` tests).

---

### 285. [x] Place a new item next to the agent running in its worktree/branch

**Status:** Done
**Depends on:** none
**Created:** 2026-06-30

**Description**

When a user creates a new **non-agent panel** (file viewer, diff, shell terminal, kanban,
filetree) scoped to a folder that already has a **running agent** — most notably a **worktree
folder** — the new Overview column now appears **immediately to the right of that agent**,
instead of being appended at the far end of the parent repo's cluster. So a panel opened from a
worktree agent's card header (or the sidebar worktree header) lands right next to the worktree
agent it belongs with, ready to use instantly. This is a **placement/ordering** change only — all
the worktree-scoping plumbing already existed; when **no** agent runs in the panel's folder the
long-standing append-at-end behavior is preserved unchanged.

**What shipped** (commit `de69f81`, PR
[#35](https://github.com/ErikdeJager/ReCue/pull/35), merged `c519292`, 2026-06-30):

- **Two pure helpers + one action helper** in `src/store.ts`:
  - `placeAfterAnchor(orderedKeys, id, anchorId)` — removes any prior occurrence of `id` and
    re-inserts it immediately **after** `anchorId`; returns the input unchanged when `anchorId`
    is absent or equals `id` (idempotent — an `id` already directly after `anchorId` round-trips).
  - `anchorAgentForPanel({ ... })` — resolves the anchor: an agent running in the panel's
    **exact** folder (`session.repoPath === repoPath`), scanning the cluster's current render
    order so the **last** such agent (the worktree's agent block) is chosen; returns `null` when
    no agent shares the folder.
  - `repositionPanelAfterAgent` — computes the parent cluster's order via the same
    `overviewClusters` / `mergeRepoOrder` the UI renders from, splices the new panel after the
    anchor, and persists through the existing **`reorderOverview` → `set_overview_order`** drag
    path; a **no-op when no anchor agent exists**.
- **`addOverviewPanel` augmented** to run the reposition after the new panel is added to state,
  so **every** creation path benefits from one source of truth — the worktree/agent card-header
  `OpenViewButton`, the sidebar `WorktreeHeader` `ViewsMenu`, the ExtraPanel header,
  `CreatePanelModal`, the sidebar-tree click (`openFileFromTree`), and kanban-board creation.
  **Dedup early-returns and the terminal-spawn-failure (`return null`) path never reposition.**
- **Unit tests** in `src/store.test.ts`: cover `placeAfterAnchor` (insert-after, absent-anchor
  no-op, idempotent, preserves other keys' order) and the store-level anchor resolution
  (worktree panel lands after the worktree agent; normal-repo panel lands after its agent;
  no-agent folder leaves `overviewOrder` unwritten; a dedup hit does not reposition).

**Key files/areas touched:** `src/store.ts` (`placeAfterAnchor`, `anchorAgentForPanel`,
`repositionPanelAfterAgent`, augmented `addOverviewPanel`), `src/store.test.ts` (tests). **No
Rust change** (`set_overview_order` already existed); **no UI change** (entry points already
pass the worktree folder as `repoPath`).

**Dependencies:** none.

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 285): "near the agent on that branch/worktree" =
  insert immediately **after the agent that shares the new panel's folder** (`session.repoPath
  === repoPath`), preferring the **selected** agent on a tie. A "specific branch" is identified
  by its **folder**, not a new branch field — a worktree is the concrete per-branch folder and
  every entry point already carries it. **Reposition only when an agent shares the folder**;
  otherwise the established append-at-end behavior is left untouched (this is an additive nicety
  for the active-agent/worktree case, not a global panel-reorder). **Overview-only** — the
  sidebar already nests a worktree's agents and panels together under its `WorktreeHeader`, so
  adjacency there is inherent. Persistence reuses the manual-drag path, so a later manual drag
  still wins and persists via `mergeRepoOrder`.
- **Cross-platform:** pure store/React/TS ordering logic over the already-cross-platform
  `set_overview_order` command — **identical on macOS and Windows**; folder paths are used only
  as opaque map keys (compared, never parsed/joined), so no path/shell/`#[cfg]` surface. Project
  checks green: `npm run build` / `lint` / `test` / `format:check`.

---

### 284. [x] Keyboard shortcut (⌘E / Ctrl+E) to toggle big mode for the selected item

**Status:** Done
**Depends on:** none
**Created:** 2026-06-30

**Description**

A single global keyboard shortcut — **⌘E on macOS / Ctrl+E on Windows** — now **toggles big
mode** (#157, the near-fullscreen `BigModeModal` overlay) for the **currently selected item**:
pressing it when big mode is **closed** opens the selected item maximized; pressing it again
(while open) closes it. This completes the intended UX flow — step selection with **Shift+←/→**,
then press the chord to maximize the focused item and the same chord to return. Works in both
views (Overview **and** Canvas) and in a **detached canvas window**, and is safe inside a focused
`claude` PTY (the capture-phase handler `stopPropagation`s it so it never echoes into the
terminal). Pressing it with **nothing selected** is a safe no-op (no empty modal).

**Keybind rationale:** **E** = **E**nlarge/**E**xpand (matches the `Maximize2` icon). It is a
simpler two-key chord, chosen after the planner's first pick `⌘⇧M` was returned by the user as
"a bad keybind — think of something simpler." It deliberately avoids `⌘M`/`Ctrl+M` because
**`Ctrl+M` is carriage-return (Enter)** in a terminal (a direct in-Claude conflict) and `⌘M` is
the macOS *minimize* shortcut; it also avoids the bound app letters (S/N/B/K/T), `⌘⇧N`
(schedule), and the worktree-create `⌘⏎`. On macOS ⌘-combos never reach the terminal; on Windows
the capture-phase handler shadows `Ctrl+E` (readline end-of-line) inside terminals — an accepted
tradeoff consistent with the app already shadowing `Ctrl+B/K/N/T/S`, and Claude Code's TUI does
not rely on `Ctrl+E`.

**What shipped** (commit `16267d6`, PR
[#36](https://github.com/ErikdeJager/ReCue/pull/36), merged `91b4383`, 2026-06-30):

- **Store action `toggleMaximizeSelected()`** + a pure exported **`contentForSelected(state)`**
  helper in `src/store.ts`. The action: `if (maximizedItem) closeMaximized()` else resolve the
  selection to a `CanvasContent` and `maximizeItem(content)` (no-op when `null`).
  `contentForSelected` resolves `selectedId` the same way the click-to-maximize buttons do —
  preferring the active Canvas leaf's `content`, else mapping a session id →
  `{ kind:"agent", ... }`, a schedule id → `{ kind:"scheduled", ... }`, or an Overview panel id
  via the existing `overviewPanelToContent` (worktree-keyed `repoPath` preserved).
- **Chord handler in `src/useKeyboardNav.ts`:** detection `(e.metaKey || e.ctrlKey) &&
  !e.shiftKey && !e.altKey && e.code === "KeyE"` (the `metaKey || ctrlKey` convention + physical
  `e.code`, so the same handling fires ⌘E on macOS / Ctrl+E on Windows), with
  `preventDefault()` + `stopPropagation()` in capture phase. **Not gated on `IS_MAIN_WINDOW`** —
  big mode works in the detached canvas window too. Top-of-file shortcut summary updated.
- **Discoverability:** the platform-correct chord appended to the existing `Maximize2` button
  tooltips via `kbdHint` — three in `src/components/Overview/Overview.tsx`, one in
  `src/components/Canvas/CanvasSurface.tsx` — reading `⌘E` on macOS / `Ctrl+E` on Windows (never
  a hardcoded `⌘`).
- **Unit tests** in `src/store.test.ts` covering `contentForSelected` (session / schedule /
  Overview-panel / Canvas-leaf resolution; `null` for unknown/none) and the toggle semantics
  (close-when-open regardless of selection; no-op when nothing maximizable is selected).
- **`TRAJECTORY_TO_WINDOWS.md`** entry recording the Windows-keyboard real-box check still owed
  (confirm Ctrl+E toggles big mode, doesn't collide with a WebView2 default, and the tooltips
  read "Ctrl+E").

**Key files/areas touched:** `src/store.ts` (`toggleMaximizeSelected` + `contentForSelected`),
`src/useKeyboardNav.ts` (chord handler + summary), `src/components/Overview/Overview.tsx` &
`src/components/Canvas/CanvasSurface.tsx` (tooltip hints), `src/store.test.ts` (tests),
`TRAJECTORY_TO_WINDOWS.md` (Windows real-box note). No backend/Rust/native code.

**Dependencies:** none.

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 284): chord **⌘E / Ctrl+E** (revised down from the
  user-rejected `⌘⇧M`); **toggle semantics** (one chord opens-when-closed / closes-when-open);
  **nothing-selected = safe no-op**; "selected item" = `selectedId` resolved to a `CanvasContent`
  exactly like the existing click-to-maximize buttons; **works in both windows and both views**
  (not `IS_MAIN_WINDOW`-gated); discoverability via the `Maximize2` tooltips through `kbdHint`.
  Rejected alternatives (`⌘⇧M`, `⌘M`/`Ctrl+M`, `⌘⏎`, the bound letters) recorded so they aren't
  re-litigated.
- **Cross-platform:** detection uses `metaKey || ctrlKey` + `e.code` and tooltips route through
  `kbdHint`/the cached `platform` signal, so the same code is ⌘E on macOS and Ctrl+E on Windows
  with no native/path/shell surface; the only OS-sensitive bit (modifier label) is already
  abstracted, and the Windows real-box keyboard check is logged in `TRAJECTORY_TO_WINDOWS.md`.
  Project checks green: `npm run build` / `lint` / `test` / `format:check`.

---

### 286. [x] Move "Update now" button above patch notes in Settings → Updates

**Status:** Done
**Depends on:** none
**Created:** 2026-06-30

**Description**

In the **Settings → Updates** pane, when an update is available, the **"Update now & restart"**
install button (and, while installing, the progress bar) now renders **directly under the
"Update available · v<version>" label**, **above** the release-carried **"What's new"** notes —
so a long set of release notes can no longer grow the block and push the install button below
the scrollable fold where the user can't reach it. Pure presentational reorder: the
(potentially arbitrarily tall) `updateState.notes` markdown block now comes **last** in the
available/downloading `.field`, and the install action sits at the top.

**What shipped** (commit `3bf202a`, PR
[#37](https://github.com/ErikdeJager/ReCue/pull/37), merged `928226e`, 2026-06-30):

- **JSX reorder in `src/components/Settings/Settings.tsx`** (the `updateState.status ===
  "available" || "downloading"` `.field` block): the `downloading ? <.updateProgress> :
  <"Update now & restart" button>` ternary was moved to sit **immediately after** the
  `fieldLabel`, and the `.whatsNew` "What's new in v<version>" notes block moved to **last** in
  the field. Every prop, handler (`installUpdate`), className, icon (`Download`), and the
  downloading/available ternary kept **byte-for-byte** — only the source order of the two
  siblings changed (27 insertions / 23 deletions, one file).
- **No CSS change** needed — `.field` / `.updates` already lay out with `gap`, so spacing stayed
  correct after the reorder.

**Key files/areas touched:** `src/components/Settings/Settings.tsx` (the only file changed). No
CSS, no store/updater logic, no backend/Rust/native code, no IPC or persistence.

**Dependencies:** none.

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 286): "the update modal (inside settings)" = the
  **Settings → Updates pane**, not the separate sidebar-indicator `UpdateModal` confirm dialog
  (which has no patch notes); "above the patchnotes" = above the **not-yet-installed update's
  "What's new"** block (the release-carried `updateState.notes`), with the running-version
  `PatchNotes` ("What's new in this version") section left untouched; and the fix is a **pure
  render-order change with no scroll cap added** — ordering the button first solves the
  off-screen concern, so a `max-height`/scroll on the notes slot was deliberately out of scope.
- **Cross-platform:** purely a JSX/CSS-layout reorder with no OS-specific code (no native, path,
  or shell surface), so it behaves identically on macOS and Windows. No change to the
  running-version patch notes, the "Check for updates" button, status/error text, the
  `UpdateModal`, the sidebar `UpdateIndicator`, or any non-updates Settings section.

---

### 287. [x] Replace update-available indicator's blinking pulse with a continuous glowing border

**Status:** Done
**Depends on:** none
**Created:** 2026-06-30

**Description**

The sidebar-footer **"Update available"** chip (the `UpdateIndicator`, bottom-left above the
Settings gear) no longer plays the **#216 one-shot blink** — a `update-announce` ring that
pulsed transparent→bright→transparent **3×** on first appearance and then went quiet. It now
carries a **subtle, continuous glowing accent border** that gently breathes color + intensity on
a slow ease-in-out loop and **persists the whole time the update is available** — calm but easy
to spot, and never flashing fully off (the transparent frame was what read as a "blink"). Under
**reduced motion** (OS setting or Settings → Appearance "Reduce motion") it reduces to a
**static** accent glow, still clearly distinguished from the quiet resting chip. The **error**
variant ("Update failed") is unchanged (no glow), and click behavior (opens Settings → Updates),
the collapsed-rail layout, and all updater store logic are untouched.

**What shipped** (commit `5463de5`, PR
[#39](https://github.com/ErikdeJager/ReCue/pull/39), merged `0ff0bb8`, 2026-06-30):

- **`src/components/Update/Update.module.css`** — removed `@keyframes update-announce` +
  `.indicatorAnnounce` (the 3× pulse). Added `@keyframes update-glow` (accent ↔ accent-hover
  border, soft accent box-shadow that never goes transparent) + `.indicatorGlow`, which sets a
  **static resting glow first** (border-color + box-shadow matching the 0%/100% keyframe) and
  then `animation: update-glow 2.6s ease-in-out infinite` over it. Box-shadow + border only → no
  layout shift; because the 0%/100% frame equals the static glow, the `global.css` reduced-motion
  killswitch (which only zeroes animation timing) holds a visible static accent glow.
- **`src/components/Update/UpdateIndicator.tsx`** — deleted the module-level `updateAnnounced`
  one-shot guard, the `announce` computation, and the `onAnimationEnd` handler (no "play once" to
  track now). The available (non-error) state applies `styles.indicatorGlow`, the error state
  keeps `styles.indicatorError` — `${isError ? indicatorError : indicatorGlow}`. Comments
  refreshed to describe the continuous glow.

**Key files/areas touched:** `src/components/Update/Update.module.css` (keyframe + class swap),
`src/components/Update/UpdateIndicator.tsx` (drop one-shot guard, apply glow class). No
store/updater logic, IPC, persistence, or backend/Rust/native code.

**Dependencies:** none.

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 287): "the install available popup in the bottom
  left" = the sidebar-footer `UpdateIndicator` chip (the only bottom-left update element with the
  disliked blink); the new effect is **continuous/infinite**, deliberately **superseding #216's
  one-shot `updateAnnounced` guard** (removed) so it's easy to spot at any time, not just for ~2s
  on first appearance; "glowing border with a transition in color" = a soft accent box-shadow +
  border easing **within the accent family** (accent ↔ accent-hover), never fully transparent;
  **reduced motion = static glow** (the killswitch only zeroes timing, so the static resting
  box-shadow/border survives); scope is the **available state only** (error variant unchanged).
- **Cross-platform:** pure WebView CSS + a className swap, no native/path/shell surface, so it
  behaves identically on macOS and Windows. `--accent`/`--accent-hover`/`--accent-dim` already
  move together with a custom accent (`accentCompanions`, #107), so a user accent recolors the
  glow for free. Project checks green: `npm run build` / `lint` / `test`.

---

### 288. [x] Use a simple ">" chevron for the Kanban "move all cards right" button

**Status:** Done
**Depends on:** none
**Created:** 2026-06-30

**Description**

The per-column **"Move all cards right"** button on the in-app **Kanban board** (the #283
move-all button in `KanbanPanel.tsx`) now renders a plain **`>` chevron** (Lucide
`ChevronRight`) instead of the `ArrowRightToLine` (→|) icon — it reads more simply as "move to
the next column." Pure icon-glyph swap: the same size (`13`), stroke width (`1.5`), placement,
`title` ("Move all cards right"), `aria-label`, visibility condition (only when there's a column
to the right and the column has cards), and `moveAllCardsRight` click handler are all preserved.
This is the **app's** Kanban UI, not the development pipeline's `KANBAN.md` board files.

**What shipped** (commit `aae6e8c`, PR
[#38](https://github.com/ErikdeJager/ReCue/pull/38), merged `301e31a`, 2026-06-30):

- **`src/components/Kanban/KanbanPanel.tsx`** — replaced the `lucide-react` import
  `ArrowRightToLine` → `ChevronRight` (kept alphabetized, sorts before `Code2`) and the single
  JSX usage in the move-all button (`<ChevronRight size={13} strokeWidth={1.5} />`).
  `ArrowRightToLine` had no other usage, so the import swap is clean (2 insertions / 2 deletions,
  one file).

**Key files/areas touched:** `src/components/Kanban/KanbanPanel.tsx` (import + one JSX usage).
No behavior, styling, visibility logic, IPC, persistence, or backend/Rust/native code.

**Dependencies:** none.

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 288): "a simple '>' arrow" = Lucide `ChevronRight`
  (the closest single-glyph `>` chevron in the project's lucide-react set); **glyph only** —
  size/stroke/title/aria-label/visibility/handler all preserved; this targets the **app's**
  Kanban board UI (the #283 button), not the dev pipeline `KANBAN.md` files.
- **Cross-platform:** a pure icon swap (no native/path/shell surface), identical on macOS and
  Windows. Project checks green: `npm run build` / `lint` / `test`.

---

### 289. [x] Leave the schedule-session modal's prompt field empty (remove its placeholder)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-30

**Description**

In the **Schedule session** modal's schedule step, the **"Prompt (optional)"** field now appears
genuinely empty — the lingering placeholder text `"Initial prompt for claude…"`, which the user
read as a **pre-filled prompt for the agent**, was removed. The field's *value* was already
always empty (traced end to end: the modal's `prompt` state is `useState("")` reset to `""` on
open, `openSchedule` seeds nothing, and the backend `create_schedule` drops a blank prompt with
no default injected at fire time), so the only thing that read as "prefilled" was the
placeholder. The field stays fully functional — typing sets the prompt, the `/`-skill
autocomplete still works, and a typed prompt is still saved — and the "Prompt (optional)" label
already names the field, so no placeholder is needed.

**What shipped** (commit `28a52d7`, PR
[#40](https://github.com/ErikdeJager/ReCue/pull/40), merged `c068013`, 2026-06-30):

- **`src/components/NewSessionModal/NewSessionModal.tsx`** — removed the
  `placeholder="Initial prompt for claude…"` prop from the schedule-step `SkillAutocomplete`
  (one-line deletion). `value` / `onChange` / `skills` / `rows` / `ariaLabel="Initial prompt"`
  all unchanged — `ariaLabel` keeps the field an accessible name without a visible placeholder.

**Key files/areas touched:** `src/components/NewSessionModal/NewSessionModal.tsx` (one prop
removed). No store/backend changes, no change to how a typed prompt is handled, no IPC,
persistence, or native/Rust code.

**Dependencies:** none.

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 289): "prefilled prompt" = the **placeholder text,
  not an actual value** (every path verified to leave the value empty), so "just leave it empty"
  = remove the placeholder; scope is the **NewSessionModal schedule step only** — the separate
  `ScheduledPanel` (editing an existing schedule, where a saved prompt is a real value) is left
  as-is, and the immediate (non-schedule) new-session flow has no prompt field; `ariaLabel` kept
  for accessibility.
- **Cross-platform:** a pure frontend prop removal (no native/path/shell surface), identical on
  macOS and Windows. Project checks green: `npm run build` / `lint` / `test`.

---

### 290. [x] Resolve dependency vulnerabilities (esbuild dev-server advisory)

**Status:** Done
**Depends on:** none
**Created:** 2026-07-01

> **Number note:** originally planned as **257**, this card was renumbered to **290** (its
> collision-free next number — the archive already ran to #289; the unrelated `### 257.` above
> is *"Larger, vertically resizable Kanban card input fields"*). The **git branch/commit still
> carry the old naming** — branch `task-257-esbuild-advisory`, commit `b2eaabc` ("Task 257:
> …") — so match this entry to **PR #41** rather than to the commit subject.

**Description**

Brought ReCue's dependency tree to a clean security-audit state by fixing the one **actionable**
finding from `npm audit`: a **low-severity esbuild dev-server advisory**
(**GHSA-g7r4-m6w7-qqqr** / "esbuild allows arbitrary file read when running the development
server on Windows", CVSS 2.5; vulnerable range `>=0.27.3 <0.28.1`). esbuild was pulled in only
**transitively and dev-only** — the single chain `recue → vite@7.3.5 → esbuild@0.27.7` — and is
never shipped in the built app; the advisory affects only the Vite **dev server** (specifically on
Windows). `npm audit fix` couldn't move it because vite@7.3.5 declared `esbuild "^0.27.0"`
(`>=0.27.0 <0.28.0` in npm's 0.x semantics), pinning esbuild below the fix.

The clean fix was to bump **vite to 7.3.6** (a patch within the existing `^7.0.4` range, which
declares `esbuild "^0.27.0 || ^0.28.0"`) and move **esbuild to 0.28.1** — clearing the advisory.
After this, `npm audit` reports **0 vulnerabilities**. The Rust side (`cargo audit` over
`src-tauri/Cargo.lock`) already had **0 vulnerabilities** and was left unchanged: its 18 warnings
(16 `unmaintained` + 2 `unsound`) are all transitive and mostly Linux-only (Tauri's Linux
webkit2gtk / gtk-rs GTK3 stack, not compiled on macOS/Windows), plus `proc-macro-error`,
`unic-*`, and `anyhow` — transitive with no available fix — and are reviewed-and-accepted, not
patched.

**What shipped** (commit
[`b2eaabc`](https://github.com/ErikdeJager/ReCue/commit/b2eaabc), PR
[#41](https://github.com/ErikdeJager/ReCue/pull/41), merged `a20b8d6`, 2026-07-01):

- **`package.json`** — bumped the `vite` devDependency from `^7.0.4` to `^7.3.6` (so esbuild
  0.28.x is permitted). No `overrides` block was needed.
- **`package-lock.json`** — regenerated: **`vite` → 7.3.6**, **`esbuild` → 0.28.1** (single
  chain, no lingering 0.27.x copy), so a fresh `npm ci` keeps esbuild ≥ 0.28.1 — the fix is
  durable. (Verified in the committed lockfile: `node_modules/esbuild` = 0.28.1,
  `node_modules/vite` = 7.3.6.)

**Key files/areas touched:** `package.json` (one-line vite bump) + `package-lock.json`
(regenerated). **No** source-code, Rust, CSS, IPC, persistence, or native changes — this is a
build-tooling-only change. The Rust `cargo audit` step was verification-only; its outcome is
recorded here, not in a code change.

**Dependencies:** none.

**Notes**

- **Scope decisions** (per PLAN-257.md): fix the single genuine (low, dev-only) fixable
  vulnerability by keeping vite on the **7.x** line (no vite 8.x major bump) and moving esbuild
  to the first fixed patch (0.28.1); the transitive Rust advisory-DB **warnings** are documented
  as accepted rather than force-overridden (patching Tauri's dependency tree is out of scope and
  risky). No CI `npm audit` / `cargo audit` gate was added (not requested). (Note: the
  `ASSUMPTIONS.md` §Task 257 section belongs to the *other* task 257 above, not this one.)
- **Cross-platform:** build-tooling-only, so macOS **and** Windows app behavior is byte-for-byte
  unchanged — and it specifically **removes a Windows-dev-server advisory**, benefiting Windows
  contributors. Acceptance checks green: `npm audit` → 0 vulnerabilities, `npm run build` /
  `npm test` / `npm run lint` pass, `cargo audit` → 0 vulnerabilities (warnings only).

---

### 291. [x] FileTree folder context menu — Copy absolute path, Copy relative path, Reveal, Rename

**Status:** Done
**Depends on:** none
**Created:** 2026-07-01

**Description**

The FileTree's right-click menu on a **folder** row previously offered only *New folder…* and
*Delete folder*. It now gives folders the same locate/copy affordances a **file** row already
has, **plus in-place renaming**. Right-clicking a folder shows, in order: **New folder…** →
**Rename…** → **Reveal in Finder** (→ "Reveal in Explorer" on Windows via `revealLabel(platform)`)
→ **Copy absolute path** → **Copy relative path** → **Delete folder** (danger, last).

- **Copy absolute path** copies the folder's OS-native absolute path
  (`joinPath(platform, repoPath, folderRelPath)`, backslashes on Windows) and toasts "Copied
  path"; **Copy relative path** copies the repo-relative POSIX path.
- **Reveal** opens the folder in the OS file manager (`revealPath`/`reveal_path` → `open` on
  macOS, `explorer.exe` on Windows) — the established ReCue precedent for revealing *folders*
  (open the folder, not select-in-parent), reusing the file-menu code verbatim.
- **Rename…** opens an inline text input seeded with the current folder name (reusing the
  New-folder inline-form pattern, a new `"rename"` menu mode): Enter (or the confirm button)
  renames on disk and the tree updates in place with unaffected siblings' expansion preserved;
  Escape cancels; a blank or unchanged name is a no-op; an invalid/reserved name or an existing
  target toasts an error and leaves the folder untouched. Not confirm-gated (a rename is
  reversible, matching the ungated *New folder…*).

The generic new `rename_path` backend command was scoped to the folder menu only; the file menu,
*New folder…*, and *Delete folder* are unchanged.

**What shipped** (commit
[`bcc647a`](https://github.com/ErikdeJager/ReCue/commit/bcc647a), PR
[#42](https://github.com/ErikdeJager/ReCue/pull/42), merged `2129117`, 2026-07-01):

- **`src-tauri/src/files.rs`** — new `rename_path(repo, from, to)`: `confine`s the source
  (must exist, in-repo; refuses the repo root), resolves the destination's parent without
  requiring the target to exist (canonicalize parent + `starts_with(canon_repo)`), refuses to
  overwrite an existing target (no-clobber), then `fs::rename` (same-volume within one repo);
  returns the destination repo-relative POSIX path. Two `#[cfg(test)]` unit tests cover happy
  path (file + folder + nested), no-clobber, root-refusal, empty/nonexistent source, and
  path-escape (`../…`, absolute) rejection.
- **`src-tauri/src/commands.rs`** — `#[tauri::command] rename_path` wrapper validating the new
  leaf via `validate_new_segment` (rejects separators/`.`/`..`/empty + Windows-reserved device
  names through `windows_safe_seg`); I/O errors mapped via `SessionError::Io`.
- **`src-tauri/src/lib.rs`** — registered `commands::rename_path` in the `invoke_handler`.
- **`src/ipc.ts`** — `renamePath(repo, from, to)` wrapper.
- **`src/store.ts`** — `renameTreePath(repo, from, to)` action mirroring `createFolder`/
  `deleteTreePath` (IPC → error toast+return → bump `fileTreeRefresh[repo]` →
  `refreshFileStatuses(repo)` → "Renamed" success toast), plus its store-type declaration.
- **`src/components/FileTree/FileTree.tsx`** — extended `MenuMode` with `"rename"`, added
  `renameName` state + a focus-and-select effect + `submitRename` (`splitPath` to keep the
  folder's parent dir, unchanged-name no-op, reload the parent level after), the rename inline
  form, and the four new folder-branch menu items.

**Key files/areas touched:** `src-tauri/src/files.rs` (+ tests), `commands.rs`, `lib.rs`,
`src/ipc.ts`, `src/store.ts`, `src/components/FileTree/FileTree.tsx`. No CSS change (the rename
form reuses the existing `menuForm`/`menuInput` styles). Purely additive — a new command + new
menu items.

**Dependencies:** none.

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 291): scope is the **folder** branch only —
  **not** adding Rename to the file menu (the `rename_path` command is generic, so a follow-up
  could add file Rename cheaply); reveal semantics for a folder = **open** it
  (`revealPath`/`os_open`), not select-in-parent (`revealFileInFinder`/`open -R` /
  `explorer /select`), for consistency with ReCue's repo-menu reveal; Rename is inline,
  Enter-to-commit / Escape-cancel, blank/unchanged = no-op, **not** confirm-gated. Item order
  keeps the destructive *Delete folder* last. ("relateive" in the card read as "relative".)
- **Cross-platform:** every primitive is a shared seam — `rename_path` uses
  `validate_new_segment`/`windows_safe_seg` (Windows-reserved names) + `fs::rename` (both OSes),
  reveal via `revealPath`/`revealLabel`, copy via `joinPath(platform, …)` + `copyToClipboard`
  (Windows WebView2 clipboard workaround). No hardcoded `/`, `$HOME`, or Cmd-only handling
  introduced; macOS behavior unchanged, Windows additive. Project checks green: `npm run build`
  / `lint` / `test`, `cargo test` (incl. the new `rename_path` tests) / `clippy` / `fmt`. The
  Explorer reveal / on-disk rename GUI paths are flagged for a real-box Windows check.

---

### 292. [x] Fix macOS permissions — mic/voice & folder access prompt repeatedly and never work

**Status:** Done
**Depends on:** none

**Description**

Using an agent's **voice input** inside a ReCue session triggered the macOS microphone prompt
repeatedly (~5×) and, even after pressing **Allow** every time, the mic never worked; the same
prompt-repeatedly-then-fail happened for protected-folder access (e.g. Downloads). Diagnosed as a
**macOS TCC (Transparency, Consent & Control) + code-signing** problem with **one shared root
cause** (mic *and* folders), **not** app logic — ReCue has no mic/audio/folder code; the request
comes from the child `claude` process, attributed to ReCue as the responsible process. Confirmed
against Apple's TCC model and `anthropics/claude-code#33023`:

1. The mic entitlement **`com.apple.security.device.audio-input`** was **absent from ReCue's code
   signature** — `NSMicrophoneUsageDescription` in Info.plist alone is **not sufficient**, and
   entitlements are only honored under the **Hardened Runtime**. So the prompt appeared (usage
   string) but access was silently denied after "Allow".
2. TCC only **persists** a grant for an app with a **stable code signature**; ReCue was unsigned/
   ad-hoc (no entitlements file, no Hardened Runtime, no Apple identity — the pipeline's "signed"
   meant only the **minisign updater** artifacts), so macOS treated each launch as new and
   re-prompted → "asks 5×, still fails."

This **deliberately reverses** the project's long-standing *"no code signing / notarization"*
scope decision (the direct cause of the bug), mirroring prior reversals (Settings #100,
multi-window #84, Fork #126). The fix introduces macOS code signing + Hardened Runtime +
entitlements — **macOS-bundle-only**; no runtime Rust/TS/CSS touched, Windows and Linux unchanged.

**What shipped** (commit
[`a62c37c`](https://github.com/ErikdeJager/ReCue/commit/a62c37c), PR
[#43](https://github.com/ErikdeJager/ReCue/pull/43), merged `0e8e1c1`, 2026-07-01):

- **`src-tauri/Entitlements.plist`** (new) — the code-signature entitlements:
  `com.apple.security.device.audio-input` (the missing mic piece) +
  `com.apple.security.cs.disable-library-validation` (so a Hardened-Runtime app with a non-Apple/
  ad-hoc signature still launches). **App Sandbox deliberately NOT enabled** (ReCue must spawn
  PTYs + read the user's repos; folder access is TCC-governed, not sandbox-governed).
- **`src-tauri/tauri.conf.json`** — `bundle.macOS.entitlements: "Entitlements.plist"` so the Tauri
  v2 macOS bundler signs the app **with** those entitlements under the Hardened Runtime
  (`--options runtime`). The `dmg` block and `identifier` (`com.recue.app`) are untouched.
- **`src-tauri/Info.plist`** — added the protected-folder usage strings
  `NSDownloadsFolderUsageDescription`, `NSDocumentsFolderUsageDescription`,
  `NSDesktopFolderUsageDescription`, `NSRemovableVolumesUsageDescription` (so folder prompts show
  a real, ReCue-attributed reason). The existing mic/speech strings are unchanged.
- **`scripts/sign-macos-local.sh`** (new, executable) — a local re-sign helper
  (`codesign --force --deep --options runtime --entitlements … --sign "${SIGN_IDENTITY:--}"`) so a
  user **with no Apple Developer account** can produce a working, entitlement-bearing,
  Hardened-Runtime build (self-signed cert for a stable signature, or ad-hoc per-build), with
  verification + `tccutil reset` recovery lines.
- **`.github/workflows/release.yml`** — the macOS leg gains **guarded** Developer-ID signing +
  notarization env (`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
  `KEYCHAIN_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`) passed to `tauri-action`,
  gated on `matrix.platform == 'macos-latest'` and `secrets.*` — **absent secrets → empty → today's
  ad-hoc behavior, build never breaks**. The Windows leg never sees Apple env; the minisign updater
  env is unchanged.
- **`docs/macos-permissions.md`** (new) — explains the entitlement/Hardened-Runtime/signing fix,
  the local self-signed build steps, the CI secrets needed for notarized releases, and the
  one-time recovery for users on the old broken build (`tccutil reset Microphone com.recue.app`).
- **`CLAUDE.md`** — amended the "no code signing / notarization" scope note to record this
  reversal (macOS signing/entitlements now exist *for permissions*; still no App Sandbox, and no
  notarization until the maintainer adds the secrets).

**Key files/areas touched:** `src-tauri/Entitlements.plist` (new), `src-tauri/tauri.conf.json`,
`src-tauri/Info.plist`, `scripts/sign-macos-local.sh` (new), `.github/workflows/release.yml`,
`docs/macos-permissions.md` (new), `CLAUDE.md`. **No** runtime Rust/TS/CSS.

**Dependencies:** none (code-wise).

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 292): one shared root cause for mic + Downloads; kept
  it **one card** (not split local-fix vs CI-notarization) delivering both the always-free
  entitlements/Info.plist/Hardened-Runtime config + local signing script **and** the guarded
  Developer-ID+notarize CI wiring; entitlements kept **minimal** (audio-input +
  disable-library-validation, no App Sandbox, no JIT entitlements unless a launch failure proves
  them needed); folder symptom fixed by the same signing-persistence fix + the four usage strings.
- **External provisioning:** fully persistent, Gatekeeper-clean **notarized** distribution still
  requires the maintainer to add an **Apple Developer ID** cert + the CI secrets — a paid-account
  decision. The task ships the config, script, and guarded CI **now**; adding the secrets later
  flips on notarized signing with no further code change. A user's own machine is fixed today via
  the local self-signed/ad-hoc script.
- **Cross-platform:** every change is macOS-bundle-scoped (Info.plist / Entitlements.plist /
  `bundle.macOS` / the macOS matrix leg). Windows and Linux legs + all runtime code are
  byte-for-byte unchanged. Automated checks are regression guards only (no runtime code changed):
  `npm run build` / `lint` / `test`, `cargo test` / `clippy` / `fmt`. **Verification is largely
  manual on a real Mac** (a GUI/TCC/signing path that can't be CI-tested, like the #84/#105
  precedent): mic prompt appears **once** → Allow → voice works → ReCue listed under Privacy &
  Security → Microphone → relaunch does **not** re-prompt; same one-prompt-then-persist for
  Downloads. Also to confirm on a real box: that the mic request is attributed to **ReCue** (not
  the system Dictation service) — the entitlement fix only helps if ReCue is the responsible
  process (which the "ReCue wants mic" prompt strongly implies).

---

### 293. [x] Global "Kill all agents" / "Close all items" on the sidebar's empty-area menu

**Status:** Done
**Depends on:** none

**Description**

Right-clicking the **empty base area of the left Sidebar** (the repo-list background — not a repo
header, agent, or item row) now offers two **app-wide** teardown actions that complement the
existing per-repo (#91) versions:

- **Kill all agents** — kills + forgets **every running agent across all folders** (including
  worktree agents, with the existing #74 ref-counted worktree cleanup), leaving non-agent items
  intact; one summary toast ("Killed N agent(s)").
- **Close all items** — kills all agents **and** removes all non-agent items (file/diff viewers +
  shell terminals, killing their PTYs) across all folders, while **keeping folders in `recents`
  and leaving schedules alone** (mirroring per-repo *Close all items*, not the more destructive
  Forget-folder path); one summary toast.

Both are appended to the **existing** target-guarded background menu (#172) — no new trigger was
built, so the collapsed rail's empty area and the "No repositories yet." hint are covered for
free. The items are **conditionally shown** (Kill all agents only when ≥1 agent runs app-wide;
Close all items only when ≥1 agent runs **or** ≥1 non-agent item exists), so the menu never offers
a no-op destructive item. The **`confirmDestructive`** setting (#103) is honored via a small
backward-compatible inline-confirm on the flat menu.

**What shipped** (commit
[`bc39c44`](https://github.com/ErikdeJager/ReCue/commit/bc39c44), PR
[#44](https://github.com/ErikdeJager/ReCue/pull/44), merged `077a89f`, 2026-07-01):

- **`src/store.ts`** — two new actions `killAllAgentsGlobal` / `closeAllItemsGlobal` (+ type
  decls) that compute the authoritative parent-folder set once
  (`worktreeParent ?? repoPath` ∪ `recents` ∪ `overviewPanels` keys) and iterate the existing
  **module-level helpers** `killAgentsInRepo` / `closeRepoItems` (not the per-repo public actions,
  to avoid per-folder toast spam), so worktree agents are killed via their parent with correct
  ref-counted cleanup and exactly one summary toast (matching the per-repo toast wording,
  incl. "Nothing to close" when empty).
- **`src/components/Sidebar/Sidebar.tsx`** — extended `RowMenuItem` with an optional
  `confirmLabel` and `RowContextMenu` with a backward-compatible **inline two-step confirm**
  (first click on a `confirmLabel` row swaps it into a danger confirm button showing the label;
  the menu stays open until confirmed — every existing caller omits `confirmLabel` and is
  unaffected). Appended the two danger items to `bgMenuItems` with the count-gating + confirm
  labels (Close all items only requires confirmation when it would actually kill agents, mirroring
  per-repo).
- **`src/store.test.ts`** — three tests: `killAllAgentsGlobal` kills every agent across folders
  while leaving items; `closeAllItemsGlobal` kills agents **and** clears every folder's items; and
  the empty-workspace "Nothing to close" toast path.

**Key files/areas touched:** `src/store.ts`, `src/components/Sidebar/Sidebar.tsx`,
`src/store.test.ts`. No CSS change (reused `menuItemDanger`/`menuDanger`). No backend/Rust/IPC
changes.

**Dependencies:** none.

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 293): append to the **existing** #172 background menu
  rather than building a new trigger; global *Close all items* mirrors per-repo #91 semantics
  (keep folders in recents, do **not** cancel schedules / forget folders); items shown
  conditionally; honor `confirmDestructive` via the small `confirmLabel` `RowContextMenu`
  extension (not a modal), confirming *Close all items* only when it would kill agents; reuse
  `killAgentsInRepo`/`closeRepoItems` over the parent-folder set so no agent is missed or
  double-killed and #74 worktree cleanup stays correct.
- **Cross-platform:** pure frontend/store using the existing `ipc.killSession` + `overviewPanels`
  persistence — no paths, shell-outs, or OS-specific code — so macOS and Windows behave
  identically. Per-repo Kill/Close menu items and their actions are unchanged. Project checks
  green: `npm run build` / `lint` / `test` (incl. the three new store tests).

---

### 294. [x] Three-dots session-options menu + Recurring sessions

**Status:** Done
**Depends on:** none

**Description**

Added a small **⋯ (three-dots) overflow button** immediately right of the sidebar's **"Schedule
session"** button (the two wrapped in a `.scheduleRow` flex container). Clicking it opens a
dropdown (reusing the existing `RowContextMenu` primitive) whose first — and, for this card, only —
item is **"Recurring session…"**. The same item is added to the sidebar background (empty-area)
context menu. This establishes the reusable ⋯ menu that later cards (Clone Repo #295, Auto-continue
#296) hang their own entries off of.

Its first entry ships a full new subsystem: a **Recurring session** — a persistent, repeating
agent. The user gives it a repeat interval (amount + **Minutes / Hours / Days**, min 1 minute) and
an optional first-run time (default "now"), prompt (with `/` skill autocomplete), and name. It
lives in the sidebar as long as it is active, and **each time the interval fires the previous child
`claude` process is killed and a fresh one is spawned in its stead — in the same place** (no new
sidebar row / Overview column / Canvas panel is created each cycle).

The model, closely paralleling the Scheduled-session subsystem (#93/#94) but **persistent +
self-re-arming**, is a first-class persisted `RecurringSession` record that **owns a rotating child
agent session**. The sidebar row / Overview card / Canvas panel all key on the stable **recurring
id** (new content `kind: "recurring"`) and render the *current* child session's pooled terminal, so
a fire only swaps the hosted child terminal — the "same panel" invariant. The owned child agent is
**excluded** from the normal sidebar/Overview/rail session lists (cross-referenced against the
recurrings' `current_session_id` set) and kept alive in `App.tsx`'s reconcile `active` set.

**What shipped** (commit
[`e6ac248`](https://github.com/ErikdeJager/ReCue/commit/e6ac248), PR
[#46](https://github.com/ErikdeJager/ReCue/pull/46), merged `bb8dc95`, 2026-07-01):

- **Backend** (`src-tauri/src/store.rs`, `commands.rs`, `lib.rs`): a `RecurringSession` struct +
  `recurrings: Vec<RecurringSession>` in `PersistedState` (serde-default empty, so old
  `sessions.json` upgrades cleanly); store methods `recurrings()` / `add_recurring` /
  `remove_recurring` / `update_recurring` / `take_due_recurrings(now)` (atomic clone of due records —
  **does not remove**, so recurring records persist) / `mark_recurring_fired(id, new_session_id,
  next_fire_at)`; commands `create_recurring` / `list_recurrings` / `cancel_recurring` /
  `update_recurring` / `fire_due_recurrings` / `fire_one_recurring` / `broadcast_recurrings`. On
  each fire the child is **rotated** (kill + forget the old, spawn a **fresh** uuid seeded with the
  prompt — **not** `--resume`) and `next_fire_at` re-armed. `fire_due_recurrings` shares the existing
  **5s schedule poll tick** in `lib.rs` (catch-up on boot runs anything overdue once), and — unlike a
  one-shot schedule — a recurring record is **KEPT on spawn failure** with `next_fire_at` still
  advanced, so a failing folder can't hot-loop.
- **Frontend** (`src/store.ts`, `ipc.ts`, `types/index.ts`): a `recurrings` store slice + IPC
  wrappers + `subscribeRecurringEvents` (`recurring://fired` / `error` / `changed`); a
  `RecurringSession` TS type + fired/error payloads + `CanvasContent.recurringId`; a
  `payloadToContent` **`recurring`** Canvas kind; `createRecurring` / `cancelRecurring` /
  `updateRecurring` / `applyRecurringSync` actions; owned child ids added to the `App.tsx` reconcile
  `active` set.
- **UI surfaces:** `RecurringPanel` (auto-saving editor for interval / next-run / name / prompt +
  Cancel, hosting the current child's `<Terminal>` or a "next run in …" placeholder), `RecurringCard`
  (Overview), `RecurringRow` (draggable sidebar row with a "recurring" badge + relative next-run
  time), and an `ItemContent` render case. A **recurring mode** in `NewSessionModal` (folder →
  branch-if-git → a recurring options step with interval + first-run + prompt + name).
- **Worktree recurrings** (⌘⏎ in the branch step): create/reuse an app-managed worktree, cleaned up
  **ref-counted** on cancel (per the #74 pattern); **Forget folder** tears down its recurrings too.
- **Pure helpers, unit-tested:** `intervalToSeconds` / `secondsToInterval` / `formatInterval` /
  `formatNextRun` (`src/time.ts` + `time.test.ts`, `paths.ts`), plus Rust `take_due_recurrings`
  partition + `mark_recurring_fired` next-fire advancement (`store.rs` `#[cfg(test)]`) and store-slice
  tests (`store.test.ts`).

**Key files/areas touched:** `src-tauri/src/store.rs`, `commands.rs`, `lib.rs`;
`src/store.ts`, `ipc.ts`, `paths.ts`, `time.ts`, `useKeyboardNav.ts`, `types/index.ts`;
`src/components/RecurringPanel/` (new), `Sidebar/`, `Overview/`, `NewSessionModal/`,
`Canvas/canvasDrop.ts`, `ItemContent/`, `BigMode/`; tests in `store.test.ts`, `time.test.ts`;
`TRAJECTORY_TO_WINDOWS.md`. (+2515 / −108 across 22 files.)

**Dependencies:** none.

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 294): kept as **one card** because splitting the menu
  from its only item, or the recurring backend from its UI, yields untestable/non-shippable halves.
  The recurring session is modeled as a first-class persisted record that **owns a rotating child**
  (not a bare session, not a one-shot `ScheduledSession`) — the model that cleanly satisfies every
  clause (scheduled OR immediate first run; stays in the sidebar; same panel). "Same panel" =
  surfaces key on the stable recurring id and render the *current* child's pooled terminal. Each
  cycle is a **fresh** conversation (new uuid, no `--resume`) — the read of "spawned in its stead",
  which also sidesteps `--session-id <existing>` reuse ambiguity. "Repeats" = amount + unit dropdown
  (Minutes/Hours/Days, min 1 minute), no cron/weekday scheduling (out of scope). The collapsed icon
  rail dropdown was left unchanged (out of scope).
- **Same-panel invariant:** the owned child is **not** independently listed (excluded from the
  normal session row/card/rail lists via the recurrings' `current_session_id` set) and its PTY is
  kept alive by the `App.tsx` reconcile `active` set — so a fire swaps only the hosted terminal,
  never creating a stray row/column/panel. The `onFired` store update inserts the new child +
  updates `current_session_id` in one `set` before the old child is dropped, so reconcile never
  transiently loses the survivor.
- **Cross-platform:** no new shell-outs beyond the reused git seams (worktree/branch writes go
  through the established #74/#124 paths); the ⋯ button/menu/CSS use design tokens + existing
  primitives (`RowContextMenu`, `metaKey || ctrlKey` for ⌘⏎) → identical on macOS and Windows. A
  `TRAJECTORY_TO_WINDOWS.md` note records the deferred real-box smoke of the fire-cycle terminal
  rotation. Project checks green: `npm run build` / `lint` / `test` (incl. new `time`/`store` tests),
  `npm run format:check`, `npm run lint:rust`, `cargo test`, `cargo fmt --check`.

---

### 296. [x] Auto-continue Claude agents after the usage limit resets

**Status:** Done
**Depends on:** Task 294

**Description**

Added an opt-in **"Auto continue after limit reset"** behavior for Claude Code sessions. When the
five-hour usage limit is hit, ReCue notes the reset time, waits for the window to reset — watching
**both** the known reset time **and** the usage percentage dropping (per the card's "do not poll
alone") — then automatically nudges the Claude agents that were running by sending **Enter →
`continue` → Enter** to each, so every agent picks its work back up.

The option is surfaced two ways, kept in sync by a single boolean setting `autoContinueAfterLimit`
(default off): a **checkable item in the ⋯ session-options menu** (built by #294; leading checkmark
when on) and a **toggle in Settings → Sessions**. It is **Claude-only** — the ⋯-menu item is shown
only when `defaultAgent === "claude"`, and the Settings toggle is always visible but disabled/greyed
and treated as off (with a "requires Claude as default agent" hint) when the default agent isn't
Claude, re-applying the stored value when switched back.

Entirely **frontend/store-only** — every backend primitive already existed (`usage.rs` returns
`usedPercent` + `resetsAt` since #154; `write_stdin` accepts arbitrary bytes). The arm/wait/fire
state machine lives in the store, main-window-only, driven by the existing usage poll; its runtime
arm-state is transient (only the boolean setting persists). **Fail-open:** if usage data is
unavailable the feature is inert (no false nudges).

**What shipped** (commit
[`ee1767d`](https://github.com/ErikdeJager/ReCue/commit/ee1767d), PR
[#47](https://github.com/ErikdeJager/ReCue/pull/47), merged `9495762`, 2026-07-01):

- **Setting** (`src/types/index.ts`, `store.ts`): `autoContinueAfterLimit: boolean` added to the
  Sessions group of `Settings` + `DEFAULT_SETTINGS` (default `false`); `mergeSettings` auto-merges it
  so existing `sessions.json` upgrades cleanly (no Rust/migration change).
- **Settings UI** (`Settings.tsx`): a gated `<Checkbox>` in Settings → Sessions bound to the setting,
  **disabled and shown off with a hint** when `defaultAgent !== "claude"`, enabled when Claude is the
  default.
- **Checkable menu item** (`Sidebar.tsx` + `.module.css`): `RowMenuItem` extended with an optional
  `checked?: boolean` (backward-compatible, like the #293 `confirmLabel` extension) rendering a
  leading checkmark (or an equal-width spacer when false, so alignment is stable); the item is wired
  into both the #294 ⋯ dropdown and the sidebar background menu, **only when Claude is default**.
- **State machine** (`src/autoContinue.ts` new + `store.ts`): a pure exported reducer
  `evaluateAutoContinue(prev, snapshot, now, settings, liveClaudeIds) -> { next, fireIds }` with
  constants `LIMIT_REACHED_PCT = 100` (tolerance 99.5) / `RESET_CONFIRM_PCT = 90` — arms at
  `usedPercent >= 100` capturing the live-Claude session set, stays armed until reset is confirmed by
  **both** `now >= resetsAtMs` **and** `usedPercent < 90` (falls back to the percentage alone if the
  API omitted `resetsAt`), then fires on `prev.sessionIds ∩ liveClaudeIds` and disarms (so a reset
  fires exactly once). Hooked into `refreshUsage`; a tighter **armed poll cadence** (`ARMED_POLL_MS =
  45_000`) runs while armed (main-window-only, idempotent) and reverts to the 180s base when disarmed.
  `sendContinue(id)` sends `"\r"` → `"continue"` → `"\r"` with tiny inter-send delays (isolated so the
  exact sequence is a one-line change).
- **Tests:** `src/autoContinue.test.ts` (261 lines — table-driven across arm/wait/fire/no-reset-time
  fallback/off/non-Claude) + `src/store.autoContinue.test.ts` (a store-wiring integration test
  asserting the injected sequence per fired session).

**Key files/areas touched:** `src/types/index.ts`, `src/store.ts`, `src/autoContinue.ts` (new),
`src/components/Settings/Settings.tsx`, `src/components/Sidebar/Sidebar.tsx` (+ `.module.css`);
tests `src/autoContinue.test.ts`, `src/store.autoContinue.test.ts`. **No backend/Rust/IPC change**
(+690 / −1 across 8 files).

**Dependencies:** Task 294 (the ⋯ menu + `RowContextMenu` this checkable item lives in).

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 296): a single boolean backs both surfaces; Claude-only
  gating (menu hidden / toggle disabled off-Claude). **Limit-reached signal = the usage snapshot**
  (`usedPercent >= ~100`), **not** terminal-output scraping (fragile, out of scope). **Reset uses both
  signals** (time AND percent), falling back to percent alone when `resetsAt` is null. Nudge target =
  live Claude sessions captured when the limit was detected, intersected with those still alive + still
  Claude at reset — exited / freshly-spawned unrelated sessions are skipped; non-Claude agents are never
  nudged. The Enter/continue/Enter sequence follows the card literally and is **flagged for a real-CLI
  sanity check** (fallback `"continue\r"` if the leading Enter proves unhelpful).
- **Follow-up:** **Task 297** (per-agent opt-out — a per-session `auto_continue_disabled` flag that
  excludes one agent from the #296 fire step) depends on this card.
- **Cross-platform:** frontend/store-only; `writeStdin` is platform-neutral → identical on macOS and
  Windows. Rollback = the setting defaults off and the reducer is inert, so shipping it disabled is a
  no-op. Project checks green: `npm run build` / `lint` / `test` (incl. the two new test files),
  `npm run format:check`, `npm run lint:rust`, `cargo test`.

---

### 295. [x] Clone Repo — clone a git repo and start a session on main

**Status:** Done
**Depends on:** Task 294

**Description**

Added a **"Clone Repo…"** entry to the three-dots (⋯) session-options menu (built by #294) next to
the sidebar's "Schedule session" button, and the same entry to the sidebar background context menu.
It opens a dedicated **`CloneRepoModal`** with a **git URL** field and a **destination parent-dir**
picker (native folder dialog). Clicking **Clone** shows a "Cloning…" busy state, runs `git clone`
into `<parent>/<repo-name>` (name derived from the URL basename), ensures **`main`** is checked out
(created from the cloned HEAD if the repo has none), registers the folder as a known repo (recents),
and **auto-starts a `claude` session** inside the freshly-cloned repo on `main`.

Clone is added as another **deliberate git write** (alongside checkout / worktree / branch-create /
fetch / pull), following the exact same `hidden_command` shell-out pattern with the network guards
(`GIT_TERMINAL_PROMPT=0` + `GIT_SSH_COMMAND="ssh -oBatchMode=yes"`) so an authed/private remote
**fails fast** instead of hanging the GUI process on a credential prompt. A non-empty existing
destination is refused (no overwrite — data safety), and a failure (bad URL, auth, network, existing
dest) shows git's stderr inline in the modal without starting a session or adding a recent.

**What shipped** (merged
[`8b4fd4e`](https://github.com/ErikdeJager/ReCue/commit/8b4fd4e), PR
[#48](https://github.com/ErikdeJager/ReCue/pull/48), 2026-07-01):

- **Backend** (`src-tauri/src/git.rs`): a **pure** `repo_dir_name(url)` helper (trims trailing `/`,
  takes the segment after the last `/` or `:` — handling `https://…/owner/repo.git` and
  `git@host:owner/repo.git` — strips a trailing `.git`, falls back to `"repo"`; unit-tested);
  `clone_repo(url, dest)` (modeled on `fetch_remotes` — `git clone <url> <dest>` with the two network
  guard env vars, returns trimmed stderr on failure); and `ensure_main(cwd)` (checks out `main` if it
  exists in `list_branches`, else `create_branch(cwd, "main", "")` to create + check out `main` from
  HEAD, covering a `master`-default or unborn/empty clone).
- **Command** (`commands.rs`, registered in `lib.rs`): `clone_repo(store, url, parent) ->
  Result<String, String>` — validates the URL, computes `dest = PathBuf::join(parent, repo_dir_name)`,
  refuses a non-empty existing dest, `git::clone_repo` → `git::ensure_main` → `store.touch_recent`,
  returns the dest path string.
- **Frontend** (`src/ipc.ts`, `store.ts`, `App.tsx`, `Sidebar.tsx`): a `cloneRepo` IPC wrapper;
  store `cloneRepoOpen` + `openCloneRepo`/`closeCloneRepo` and a `cloneRepo(url, parent)` action
  (calls IPC, prepends `dest` to recents locally, `spawnSession(dest)` to start the agent on the
  already-checked-out `main`, toasts, returns `true` or the error string); the "Clone Repo…" item
  added to the ⋯ dropdown + `bgMenuItems`; `<CloneRepoModal>` mounted once in `App.tsx`.
- **`CloneRepoModal`** (new `src/components/CloneRepoModal/` — `.tsx` + `.module.css`): store-driven,
  focus-trapped; a URL input (auto-focused) + a destination row with a "Choose…" button
  (`ipc.pickDirectory()`) + Clone (disabled until URL + parent set, and while busy) / Cancel; local
  busy + inline-error state; Enter submits, Escape closes.
- **Tests:** Rust `#[cfg(test)]` for `repo_dir_name` (`.git` suffix, trailing slash, `https://` and
  `git@…:…` forms) + `src/store.test.ts` cases for the `cloneRepo` action (mocked IPC).

**Key files/areas touched:** `src-tauri/src/git.rs`, `commands.rs`, `lib.rs`; `src/ipc.ts`,
`src/store.ts`, `src/App.tsx`, `src/components/Sidebar/Sidebar.tsx`,
`src/components/CloneRepoModal/` (new); tests in `src/store.test.ts`; `TRAJECTORY_TO_WINDOWS.md`
(+766 / −2 across 11 files).

**Dependencies:** Task 294 (the ⋯ three-dots menu the "Clone Repo…" entry lives in).

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 295): destination = a user-picked **parent** dir, clone
  into `<parent>/<repo-name>` (URL-basename), refuse a non-empty existing folder. "Checks out main /
  creates main if missing" = checkout existing `main`, else `git checkout -b main` from HEAD (covers
  `master`-default and unborn/empty clones); the card's "default branch" is read as this `main`.
  Auto-start a normal interactive agent (no seeded prompt) on success, reusing `spawnSession` — no
  extra new-session modal step. **Synchronous** clone with a busy state (large clones block the modal —
  accepted for v1, flagged in TRAJECTORY). Fail-fast on auth via the reused `fetch_remotes`/`pull_ff`
  network guards.
- **Cross-platform:** git shell-out via `hidden_command` (the `CREATE_NO_WINDOW` console-flash guard);
  dest path via `PathBuf::join` (never string concat); the frontend passes whole paths (backend
  computes/returns the dest) — identical on macOS and Windows. The write is additive (a fresh clone,
  no mutation of existing repos), so rollback is trivial. Project checks green: `npm run build` /
  `lint` / `test`, `npm run format:check`, `npm run lint:rust`, `cargo test`, `cargo fmt --check`.

---

### 297. [x] Per-agent opt-out for auto-continue-after-limit

**Status:** Done
**Depends on:** Task 296

**Description**

Refined the auto-continue feature (#296) with **fine-grained per-agent control**. When the global
"Auto continue after limit reset" option is on, each **Claude** agent's **Overview card** and
**Canvas panel** now show a small **"Auto continue after limit reset"** checkbox (checked = active
for that agent). **Unchecking it disables auto-continue for that one agent only** — the others and
the global setting are untouched — giving the user full control over which agents get the
Enter/`continue`/Enter nudge when the usage window resets.

The opt-out is **persisted on the session record** (`auto_continue_disabled: bool`), so a disabled
long-running/resumed agent stays disabled across app restarts. The control is shown **only for
Claude agents AND only when the global `autoContinueAfterLimit` (#296) is enabled** — when the global
option is off or the agent isn't Claude there is nothing to opt out of, so it's hidden.

**What shipped** (commit
[`fa14d1a`](https://github.com/ErikdeJager/ReCue/commit/fa14d1a), PR
[#49](https://github.com/ErikdeJager/ReCue/pull/49), merged `87f707e`, 2026-07-01):

- **Backend** (`src-tauri/src/store.rs`, `commands.rs`, `lib.rs`): a `#[serde(default)]
  auto_continue_disabled: bool` field added to `PersistedSession` (default `false` = active, so old
  `sessions.json` upgrades cleanly, mirroring the `has_been_active`/`agent`/`forked_from` pattern); a
  `set_session_auto_continue(id, disabled)` store method (finds + mutates + persists the record) + the
  matching `set_session_auto_continue` command (registered in `lib.rs`).
- **Frontend plumbing** (`src/types/index.ts`, `ipc.ts`, `store.ts`): `autoContinueDisabled?: boolean`
  added to the session types; `toSessionView` maps `record.autoContinueDisabled ?? false`; a
  `setSessionAutoContinue` IPC wrapper; a `setAutoContinueDisabled(id, disabled)` store action
  (optimistic session update → `ipc.setSessionAutoContinue`, so both surfaces stay in sync).
- **Fire-step exclusion** (`store.ts` + `src/store.autoContinue.test.ts`): the #296 fire step now
  **filters out** sessions with `autoContinueDisabled === true` — done by excluding them from the
  `liveClaudeIds` fed into the pure `evaluateAutoContinue` reducer at the call site (keeping the
  reducer agnostic), so both the captured arm-set and the fire-set omit disabled agents. A unit test
  asserts that with two live Claude sessions (one disabled), only the enabled one is nudged on reset.
- **UI** (`src/components/AutoContinueToggle/` new — `.tsx` + `.module.css`; `Overview.tsx`,
  `Canvas/CanvasSurface.tsx`): a small reusable `<AutoContinueToggle session={...} />` built on the
  shared `Checkbox` — renders **nothing** unless `settings.autoContinueAfterLimit === true` AND the
  agent is Claude; `checked={!session.autoContinueDisabled}`, compact styling. Placed on the
  `AgentCard` (Overview) and the Canvas agent panel, where the click **stops propagation** so it never
  starts the #144 panel-header drag.

**Key files/areas touched:** `src-tauri/src/store.rs`, `commands.rs`, `lib.rs`;
`src/types/index.ts`, `src/ipc.ts`, `src/store.ts`; `src/components/AutoContinueToggle/` (new),
`Overview/Overview.tsx`, `Canvas/CanvasSurface.tsx`; test `src/store.autoContinue.test.ts`;
`TRAJECTORY_TO_WINDOWS.md` (+310 / −2 across 12 files).

**Dependencies:** Task 296 (the global auto-continue feature this refines; its fire step is where the
per-agent exclusion is applied) — which in turn depends on #294.

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 297): the opt-out is **persisted** on the record (not a
  transient map) so it survives restarts — true "full control" — and is auto-cleaned when the session
  is removed. **Default = inherit the global setting** (a new agent is not disabled; unchecking only
  ever *disables* within an already-enabled global feature — there is deliberately no per-agent
  *enable* when the global option is off). Placed on the two agent surfaces with room for chrome; the
  cramped 10px sidebar row is left unchanged (out of scope).
- **Cross-platform:** a `#[serde(default)]` record field + a tiny command + frontend UI, no
  OS-specific code → identical on macOS and Windows. The `#[serde(default)]` field means an older
  binary simply ignores it (clean rollback). Project checks green: `npm run build` / `lint` / `test`
  (incl. the extended fire-step exclusion test), `npm run format:check`, `npm run lint:rust`,
  `cargo test`, `cargo fmt --check`.
- **Note:** during this card's landing, its in-progress implementation briefly appeared as
  uncommitted changes in the **main** working tree (the `AutoContinueToggle` files); it committed
  cleanly to `fa14d1a`. The archive of the concurrent Task 295 was pushed via a temporary worktree to
  avoid disturbing it — no data was lost.

---

### 298. [x] Clone lands on the repo's default branch (not a forced `main`) + fix misleading modal hint

**Status:** Done
**Depends on:** none

**Description**

Fixed the **Clone Repo** (#295) flow so a cloned repository ends up on the **remote's actual default
branch** (`main` / `master` / `develop` / …) rather than a fabricated `main`, and corrected the
modal copy that falsely claimed the clone "starts on `main`". `git clone` already leaves HEAD on the
remote's default branch for any non-empty repo, so the old post-clone `git::ensure_main` step —
which created a **new** `main` from HEAD and checked it out for any repo lacking a local `main` — was
actively wrong for a `master`-default (or any non-`main`-default) repo, landing the user on a
fabricated `main` instead of the real default. The corrected step leaves the cloned default branch
exactly as-is and only fabricates `main` for a truly **empty / branch-less (unborn HEAD)** clone, so
the subsequent `claude` session still has a valid branch.

**What shipped** (commit
[`f94bae4`](https://github.com/ErikdeJager/ReCue/commit/f94bae4), PR
[#53](https://github.com/ErikdeJager/ReCue/pull/53), merged `0f4078d`, 2026-07-01):

- **Backend — `src-tauri/src/git.rs`:** renamed `ensure_main` → **`ensure_checked_out_branch`** with
  a contract-changing body: `if list_branches(cwd).all.is_empty()` (an unborn / empty clone has zero
  local branches) → `create_branch(cwd, "main", "")` to fabricate a checked-out `main`; otherwise
  **do nothing** — leave the default branch git already checked out exactly as cloned. Stays
  fail-open with the same `Result<(), String>` signature (a real git error surfaces as the clone
  error string, as before).
- **Backend — `src-tauri/src/commands.rs`:** the `clone_repo` command's call site now invokes
  `git::ensure_checked_out_branch(&dest)` instead of `ensure_main`; the rest of `clone_repo` (URL
  parsing, dest-collision rejection, `touch_recent`, returned dest path) is unchanged and still
  synchronous/blocking (the async/phantom-folder refactor is deliberately left to Task 299).
- **Backend — tests (`src-tauri/src/git.rs`):** the `ensure_*` unit tests were updated to assert the
  new behavior — a `master`-default local repo stays on `master` (no fabricated `main`), a
  `main`-default repo stays on `main`, and a new
  `ensure_checked_out_branch_creates_main_for_branchless_repo` case asserts a branch-less repo gets a
  created `main`. Reuses the existing local-git test scaffolding, so they run on both OSes via the
  shared git shell-out.
- **Frontend — `src/components/CloneRepoModal/CloneRepoModal.tsx`:** the hint paragraph now reads
  "The repo clones into a new folder here (named for the URL) and opens on its default branch"
  (dropping the `<code>main</code>` reference), and the file doc-comment was reworded to match the
  new default-branch behavior. The now-dead `.code` style was removed from
  `CloneRepoModal.module.css`.

**Key files/areas touched:** `src-tauri/src/git.rs` (+105/−… incl. tests), `src-tauri/src/commands.rs`,
`src/components/CloneRepoModal/CloneRepoModal.tsx`, `src/components/CloneRepoModal/CloneRepoModal.module.css`
(4 files, +94 / −57).

**Dependencies:** none. **Enables:** Task 299 (non-blocking background clone + phantom folder +
progress bar) builds on this corrected branch behavior.

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 298): the primary intent was read as **correctness of the
  flow**, not merely the copy — so the flow was fixed to land on the real default branch rather than
  just deleting the misleading comment (both were card-permitted). "IF NO BRANCH EXISTS → create
  main" was interpreted as the **empty/unborn clone** only. The modal copy was **reworded, not
  deleted** (a short accurate hint is better UX). The clone command was kept **sync-shaped** here —
  the non-blocking/phantom-folder work is split into the dependent Task 299 so 298 stays a small, safe
  correctness fix.
- **Cross-platform:** the only OS-sensitive primitive is the `git` shell-out, which already goes
  through the shared `hidden_command` console-flash guard, so the behavior is identical on macOS and
  Windows; the frontend change is pure copy/CSS. Existing already-cloned repos are unaffected (this
  only changes what happens during a *new* clone), and reverting `git.rs`/`commands.rs` restores the
  old forced-`main` behavior (clean rollback).

---

### 300. [x] Fix recurring-session bugs — immediate "now" spawn + duplicate/ghost panels

**Status:** Done
**Depends on:** none

**Description**

Fixed two original bugs in **recurring sessions** (#294): (A) a recurring created with the **"now"**
first-fire option didn't spawn its first agent until after the first interval elapsed, and (B)
creating a recurring produced **two panels** with identical parameters — only one showing the running
agent, the other blank. Both are now correct: "now" spawns immediately, and exactly **one** card
appears, showing the live agent's terminal, with the child agent never surfacing as its own
standalone column.

**Root causes** (per `ASSUMPTIONS.md` §Task 300):
- **Two panels:** the store's `createRecurring` optimistic add (`recurrings: [record, ...s.recurrings]`)
  was **not idempotent** — no dedupe by id — so it raced the backend's `recurring://changed`
  broadcast (and, for a "now" recurring, the immediate poll-fire broadcast), producing two records
  with the same id → two identical cards. A pooled xterm (#18) attaches to only one DOM node, so one
  card showed the terminal and the other was blank.
- **"now" not immediate:** the create path already sent `first_fire_at = now`, but the 5s poll loop
  **sleeps 5s before** its first fire and only ticks every 5s, so the first run was never truly
  instant; meanwhile the visible card immediately read "next run in {interval}", reinforcing the
  perception of a delayed first run.

**What shipped** (commit
[`0e259ee`](https://github.com/ErikdeJager/ReCue/commit/0e259ee), PR
[#54](https://github.com/ErikdeJager/ReCue/pull/54), merged `c80a3c6`, 2026-07-01):

- **Immediate first fire (backend — `src-tauri/src/commands.rs`):** `create_recurring` now takes
  `app: AppHandle` + `manager: State<SessionManager>` (mirroring `fire_due_recurrings`) and, after
  `store.add_recurring(rec)` returns (store lock released, so no deadlock/re-entrancy), fires the
  first child **at create time** when `first_fire_at <= now` by reusing `fire_one_recurring` —
  rotating `current_session_id` + advancing `next_fire_at` **before** the returned record and the
  `recurring://changed` broadcast reach the frontend. This makes "now" instant AND closes the
  create↔poll race that drove the duplicate/blank card. It's **best-effort** (mirroring the poll
  path): a failure keeps the record, advances its time, and emits `recurring://error` rather than
  failing the whole create. A **future** `first_fire_at` is left for the poll loop (≤5s granularity,
  no regression). The post-fire record is returned so the frontend add already owns the child. After
  the immediate fire, `next_fire_at = now + interval`, so `take_due_recurrings` won't re-fire it
  (no double spawn).
- **Idempotent optimistic adds (frontend — `src/store.ts`):** `createRecurring` now dedupes by id
  (`recurrings: [record, ...s.recurrings.filter((x) => x.id !== record.id)]`), and the **same fix**
  was applied to the sibling `createSchedule` (`schedules: [record, ...s.schedules.filter((x) =>
  x.id !== record.id)]`) — the identical latent pattern, low-risk hardening against the same class
  of duplicate for one-shot schedules.
- **Hardened `onFired` (frontend — `src/store.ts`):** a fired child whose recurring record hasn't
  landed yet (the fired event beating the create's optimistic add) is now **stashed and adopted**
  once the record is present, so a recurring child is **never** rendered as its own standalone
  column even transiently. The `set` still updates `current_session_id` + `next_fire_at` for the
  matching record when present.
- **Tests (`src/store.test.ts`, +118):** cover the idempotent adds (a raced `changed` broadcast
  can't duplicate a recurring/schedule) and the `onFired` ownership (a child stays owned / never
  standalone). Backend covers the `first_fire_at <= now` immediate-fire decision.

**Key files/areas touched:** `src-tauri/src/commands.rs` (+33), `src/store.ts` (+128/−23),
`src/store.test.ts` (+118) — 3 files, +256 / −23.

**Dependencies:** none.

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 300): no data-model or poll-cadence redesign, no "run
  now" button for existing recurrings — only the create-time "now" and the duplicate/ghost bugs were
  in scope. The three edits (immediate-fire branch, idempotent adds, `onFired` guard) are separable
  for independent rollback.
- **Cross-platform:** all changes are OS-neutral Rust command wiring + frontend store logic (no
  paths, shell-outs, or platform APIs), so behavior is identical on macOS and Windows. The worktree
  branch/folder prep in `create_recurring` already goes through the shared git helpers. Project
  checks green: `npm run build` / `lint` / `test`, `npm run format:check`, `cargo test`, clippy, fmt.

---

### 301. [x] Schedule-session button layout — ellipsis label, fixed-size clock icon, narrower "…" button

**Status:** Done
**Depends on:** none

**Description**

Made the sidebar's **"Schedule session"** action row keep a stable, single-line appearance at any
sidebar width (the sidebar is resizable, #108, [180, 560]): the button label now truncates with an
ellipsis instead of wrapping to a second line, the clock icon never grows or shrinks, and the
adjacent **"…"** (more-options) button takes less horizontal space while keeping the exact same
height. From the user's perspective the two buttons always share one height and the text never
wraps.

**What shipped** (commit
[`5b28593`](https://github.com/ErikdeJager/ReCue/commit/5b28593), PR
[#51](https://github.com/ErikdeJager/ReCue/pull/51), merged `65e14a4`, 2026-07-01):

- **`src/components/Sidebar/Sidebar.tsx`:** the bare `Schedule session` text node is wrapped in a
  `<span className={styles.scheduleLabel}>` and the `<Clock size={15}>` gets a `scheduleIcon` class
  (the `kbdHint(platform, "⌘⇧N", "Ctrl+Shift+N")` hint is untouched — still `Ctrl+Shift+N` on
  Windows).
- **`src/components/Sidebar/Sidebar.module.css`:** `.scheduleLabel` gets `flex:1; min-width:0;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:left` so **only the label
  absorbs the squeeze** and ellipsizes on one line; `.scheduleIcon` (and the `.kbd` hint) get
  `flex-shrink:0` so neither icon nor hint distorts. `.dotsButton` width drops `30px → 24px`
  (padding was already `0`); no fixed height is added, so the row's `align-items:stretch` keeps it
  exactly equal to the schedule button's height.

**Key files/areas touched:** `src/components/Sidebar/Sidebar.tsx` (+8/−2),
`src/components/Sidebar/Sidebar.module.css` (+22/−1).

**Dependencies:** none.

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 301): the ellipsis is achieved via a **wrapping span**
  (a bare text node can't ellipsize). "Decrease the padding of the '…' button on the horizontal
  axis" was interpreted as **make the button narrower** (`width: 30px → 24px`) since its padding was
  already `0` and its footprint is the fixed width; height is untouched. Scope was limited to the
  expanded-sidebar schedule action row — the collapsed-rail icon button and the New-session button
  were left as-is.
- **Cross-platform:** pure CSS + one JSX wrapper span, no OS-specific code → identical on macOS and
  Windows; uses design tokens throughout. Checks green: `npm run build` / `lint` / `format:check`.

---

### 302. [x] Move the "Auto continue after limit reset" checkmark to after the label text

**Status:** Done
**Depends on:** none

**Description**

In the sidebar context menus, the checkable **"Auto continue after limit reset"** row now shows its
checkmark **after** (to the right of / behind) the label text rather than in front of it. When the
toggle is off, no checkmark shows and there's no leading empty gap before the label.

**What shipped** (commit
[`a32dd08`](https://github.com/ErikdeJager/ReCue/commit/a32dd08), PR
[#52](https://github.com/ErikdeJager/ReCue/pull/52), merged `bd6dffe`, 2026-07-01):

- **`src/components/Sidebar/Sidebar.tsx`:** the shared `RowContextMenu` renderer now emits the label
  first, then the `.menuCheck` checkmark slot (the `Check` icon + accent color unchanged).
- **`src/components/Sidebar/Sidebar.module.css`:** `.menuCheck` swaps `margin-right: var(--space-6)`
  → `margin-left: var(--space-6)` so the gap sits between the label and the trailing checkmark.

**Key files/areas touched:** `src/components/Sidebar/Sidebar.tsx` (+4/−4),
`src/components/Sidebar/Sidebar.module.css` (+4/−4).

**Dependencies:** none.

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 302): the **minimal inline** reorder was chosen (label
  then checkmark, `margin-left` gap) rather than the optional right-alignment (`margin-left:auto`),
  since inline placement already satisfies "after/behind the text" without disturbing the
  danger/confirm menu variants. Editing the **shared** `RowContextMenu` renderer is safe because
  "Auto continue after limit reset" is the only checkable item (any non-checkable item has
  `checked == null` and renders no slot), so the reorder affects only that toggle in practice. The
  separate `Checkbox`-based per-agent `AutoContinueToggle` strip (#297) was intentionally **not**
  touched — a different component, not what the card meant.
- **Cross-platform:** pure DOM-order + margin change, no OS-specific code → identical on macOS and
  Windows. Checks green: `npm run build` / `lint` / `format:check` / `test`.

---

### 303. [x] Trim the sidebar background context menu + move "Clone Repo" under "New folder"

**Status:** Done
**Depends on:** none

**Description**

The right-click context menu on the **empty sidebar background** (the "plane", not any folder/repo)
no longer offers **New session**, **Recurring session…**, or **Auto continue after limit reset**,
and **Clone Repo…** now sits **directly under "New folder…"** at the top of that menu. This is part
of a two-card reorganization (with the dependent Task 304): the **background menu** owns
folder/clone/schedule + view/bulk actions, while the **"…" dots menu** owns the session-creation
extras.

**What shipped** (commit
[`3a02a58`](https://github.com/ErikdeJager/ReCue/commit/3a02a58), PR
[#50](https://github.com/ErikdeJager/ReCue/pull/50), merged `2a47e21`… on `main`, 2026-07-01):

- **`src/components/Sidebar/Sidebar.tsx`:** the `bgMenuItems` array (rendered by the shared
  `RowContextMenu` for `openBgMenu`) drops the `New session`, `Recurring session…`, and
  `...(autoContinueItem ? … : [])` entries, and moves `Clone Repo…` to immediately after
  `New folder…`. Order is now: **New folder… → Clone Repo… → Schedule session →** Expand/Collapse
  sidebar → (Clear Overview filter / Kill all agents / Close all items, under their existing
  conditions). `autoContinueItem`, `openNewSession`, and `openRecurring` remain **defined** (still
  used by the New-session button / the dots menu), so no unused-symbol lint errors.

**Key files/areas touched:** `src/components/Sidebar/Sidebar.tsx` (+1/−4).

**Dependencies:** none. **Enables:** Task 304 (removes Clone Repo from the "…" dots menu so Clone
Repo has one home — the background menu).

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 303): only the `bgMenuItems` array was edited — exactly
  the three named items removed and Clone Repo… reordered under New folder…. **"Schedule session"
  stays** in the background menu (the card didn't ask to remove it). The per-folder / per-repo
  context menus are unaffected.
- **Cross-platform:** a pure menu-array edit, no OS-specific code → identical on macOS and Windows.
  Checks green: `npm run build` / `lint` / `format:check`.

---

### 304. [x] Remove "Clone Repo" from the "…" session-options menu

**Status:** Done
**Depends on:** Task 303

**Description**

Completed the menu reorganization begun in Task 303: the **"…"** (more session options) dropdown
next to the "Schedule session" button no longer contains a **Clone Repo…** entry. The dots menu is
now just the session-creation extras — **Recurring session…** and (Claude-only) **Auto continue
after limit reset** — while Clone Repo lives solely in the sidebar **background** context menu
(under "New folder…", per Task 303), giving Clone Repo exactly one home.

**What shipped** (commit
[`646cac0`](https://github.com/ErikdeJager/ReCue/commit/646cac0), PR
[#55](https://github.com/ErikdeJager/ReCue/pull/55), merged `0d306cd`, 2026-07-01):

- **`src/components/Sidebar/Sidebar.tsx`:** the `dotsMenuItems` array (rendered by the shared
  `RowContextMenu` from the `.dotsButton`) drops its `{ label: "Clone Repo…", onActivate: () =>
  openCloneRepo() }` entry, leaving `Recurring session…` + the conditional `autoContinueItem`.
  `openCloneRepo` stays referenced by `bgMenuItems` (Task 303), so no unused-symbol lint error.

**Key files/areas touched:** `src/components/Sidebar/Sidebar.tsx` (single-line array edit).

**Dependencies:** Task 303 (which established Clone Repo's home in the background menu; sequencing
after 303 kept the two adjacent menu-array edits on the same `Sidebar.tsx` region from conflicting
and preserved the "Clone Repo has exactly one home" invariant).

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 304): only the `dotsMenuItems` Clone Repo entry was
  removed — the Clone Repo feature and its modal are untouched, and the affordance is not lost from
  the app (it remains in the background menu).
- **Cross-platform:** a pure menu-array edit, no OS-specific code → identical on macOS and Windows.
  Checks green: `npm run build` / `lint` / `format:check`.

---

### 299. [x] Non-blocking background clone with a "phantom folder" + progress bar in the sidebar

**Status:** Done
**Depends on:** Task 298

**Description**

Made **Clone Repo** (#295) non-blocking. Submitting the modal now **closes it immediately** and a
transient **"phantom folder"** appears at the top of the sidebar repo list — labeled for the repo
being cloned, dimmed with a "Cloning…" hint and an **indeterminate progress bar underneath** — while
the clone runs in the background off the main thread. On success the phantom is removed, the real
repo is added to `recents`, a `claude` session starts in it, and a `Cloned <name>` toast shows; on
failure the phantom is removed and the git error is toasted (the modal is already closed, so the
toast is the error surface). The rest of the UI stays fully responsive throughout, and concurrent
clones each get their own independently-resolving phantom.

**What shipped** (commit
[`ad6465e`](https://github.com/ErikdeJager/ReCue/commit/ad6465e), PR
[#56](https://github.com/ErikdeJager/ReCue/pull/56), merged `5e03cdd`, 2026-07-01):

- **Backend — non-blocking (`src-tauri/src/commands.rs`):** `clone_repo` became an **`async`** Tauri
  command that runs the synchronous `git` shell-out (`git::clone_repo` + the Task 298
  `ensure_checked_out_branch` step + `touch_recent`) inside `tauri::async_runtime::spawn_blocking`
  on a dedicated blocking thread, so it no longer occupies the main thread / async runtime. The IPC
  name/shape is unchanged (`clone_repo` → dest path string / git error), keeping the dest-collision
  precheck and fail-fast env behavior.
- **Store — model in-flight clones (`src/store.ts`, `src/types/index.ts`):** a new transient
  `cloningRepos: CloningRepo[]` (`{ id, name, parent, url }`, `id` locally unique, `name` via the
  new `cloneRepoName(url)` helper); `cloneRepo(url, parent)` now **enqueues a phantom, fires
  `ipc.cloneRepo` in the background** (not awaited by the modal), and on resolve/reject removes
  **that keyed phantom** (by `id`, so concurrent clones don't remove the wrong entry) and
  prepends/`spawnSession`/toasts on success or error-toasts on failure — resolving quickly so the
  modal can close at once.
- **Display-name helper (`src/paths.ts` + `src/paths.test.ts`):** `cloneRepoName(url)` derives the
  repo name from the URL (mirroring the backend's dir naming), unit-tested.
- **Modal — close immediately (`src/components/CloneRepoModal/CloneRepoModal.tsx`):** `submit`
  validates inputs, calls `cloneRepo`, and closes the modal right away (the `busy`/`Cloning…`
  await and inline-error surface are dropped in favor of the store's background flow + toasts).
- **Sidebar — phantom + progress bar (`src/components/Sidebar/Sidebar.tsx`,
  `Sidebar.module.css`, `src/styles/global.css`):** a new inert `PhantomRepo` subcomponent (folder
  icon + name + "Cloning…" hint + an indeterminate `.phantomTrack`/`.phantomBar`) renders **outside**
  the dnd-kit `SortableContext` at the top of `styles.repos`, so it's **not draggable** and can't
  corrupt `folderOrder`/`repoOrder`, and has no repo context menu / new-session affordances. The
  **collapsed rail** shows a minimal pulsing dimmed folder icon per phantom. The `clone-progress`
  (swept stripe) and `clone-pulse` (rail breathe) **keyframes live in `global.css`**, so the
  `prefers-reduced-motion` killswitch there disables the animation, leaving a still-visible static
  bar/icon.
- **Tests (`src/store.test.ts` +73, `src/paths.test.ts` +25):** the `cloneRepo` flow (enqueue →
  phantom present → on resolve phantom removed + `recents` updated; on reject phantom removed + error
  toast) and `cloneRepoName`.

**Key files/areas touched:** `src-tauri/src/commands.rs`; `src/store.ts`, `src/types/index.ts`,
`src/paths.ts`, `src/ipc.ts`; `src/components/CloneRepoModal/CloneRepoModal.tsx`;
`src/components/Sidebar/Sidebar.tsx` + `Sidebar.module.css`; `src/styles/global.css`; tests
`src/store.test.ts`, `src/paths.test.ts` (11 files).

**Dependencies:** Task 298 (the corrected default-branch behavior + fixed modal copy this background
flow builds on).

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 299): the progress bar is **indeterminate/animated**,
  not a real percentage — parsing `git clone --progress` stderr for byte percentages is explicitly a
  future enhancement, out of scope. The modal **closes immediately** and errors surface via **toast**
  (not the closed modal). The phantom is a **transient, in-memory, non-draggable** placeholder (not
  persisted across restarts); concurrent clones each get their own keyed phantom. The backend goes
  **async off the main thread** while keeping the same IPC name/shape. Collapsed-rail phantoms are a
  minimal pulsing indicator. No cancel button (out of scope).
- **Cross-platform:** the clone still shells out through the shared `git::hidden_command`
  (`CREATE_NO_WINDOW` guard) and builds paths with `PathBuf`, so it behaves identically on macOS and
  Windows; `spawn_blocking` is OS-neutral. The new CSS uses only design tokens + plain colors (no
  macOS-only `-webkit-` vibrancy), and the keyframes route through the reduced-motion killswitch, so
  it renders correctly in both WKWebView and WebView2. Every error path toasts (no stuck-phantom bug),
  and reverting the store/command restores today's blocking behavior. Checks green: `npm run build` /
  `lint` / `test` / `format:check`, `cargo test`, clippy, fmt.

---

### 305. [x] Show the per-agent "Auto continue after limit reset" checkbox only once the usage limit is reached

**Status:** Done
**Depends on:** none

**Description**

Gated the compact **"Auto continue after limit reset"** checkbox (the per-agent opt-out from #297,
rendered on each Claude agent's Overview card subheader and Canvas panel header) so it appears
**only when the 5-hour Claude usage limit has actually been reached**, instead of on every Claude
agent all the time. The control is meaningless until the limit is hit, so hiding it until then keeps
agent chrome clean. Visibility now requires: the global `autoContinueAfterLimit` setting ON **and**
the session is a Claude agent **and** the usage window is exhausted — with a fail-safe hide whenever
usage data is unavailable/unknown (no token, fetch failed, a non-Claude session active, or
`usedPercent == null`). The auto-continue **behavior** (arming, firing, the `autoContinueDisabled`
flag, `evaluateAutoContinue`, `applyAutoContinue`) is entirely unchanged — this is purely about
**when the checkbox is shown**.

**What shipped** (commit
[`5e51a04`](https://github.com/ErikdeJager/ReCue/commit/5e51a04), PR
[#57](https://github.com/ErikdeJager/ReCue/pull/57), merged `08a802a`, 2026-07-02):

- **Shared predicate (`src/autoContinue.ts`):** a new exported pure helper
  `isLimitReached(usage: AutoContinueUsage): boolean` returns `true` iff
  `usage.available && usage.usedPercent != null && usage.usedPercent >= ARM_THRESHOLD_PCT` (99.5).
  It mirrors `evaluateAutoContinue`'s arming predicate **byte-for-byte** (sharing the existing
  `ARM_THRESHOLD_PCT` constant) so the checkbox appears precisely when the machine would arm. The
  reducer is left intact (additive helper only, no refactor of the well-covered #296 logic); the
  helper is designed to be shared with Task 309's limit-reached promo so the threshold isn't
  open-coded twice.
- **Gate the checkbox (`src/components/AutoContinueToggle/AutoContinueToggle.tsx`):** reads the
  store's `usage` slice and extends the early return to
  `if (!enabled || !isClaude || !isLimitReached(usage)) return null;`. The JSDoc was updated to
  describe the new visibility rule (note that `usage.available` already encodes the Claude-active
  gate, so no separate `isClaudeActive` call is needed in the component). Both render sites
  (`Overview.tsx`, `CanvasSurface.tsx`) are unchanged — the component decides visibility.
- **Tests (`src/autoContinue.test.ts` +23):** a new `describe("isLimitReached")` block covering the
  boundary cases — `>= 99.5` → true, `100` → true, `99.4` → false, `usedPercent == null` → false,
  `available === false` → false.

**Key files/areas touched:** `src/autoContinue.ts`,
`src/components/AutoContinueToggle/AutoContinueToggle.tsx`, `src/autoContinue.test.ts` (3 files,
+47/−4).

**Dependencies:** none.

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 305): "limit reached" **reuses the auto-continue
  machine's own arming predicate exactly** (99.5% via `ARM_THRESHOLD_PCT`) rather than inventing a
  new threshold; usage-unavailable/unknown → **hide** (fail-safe); **no separate `isClaudeActive`
  gate** in the component since `usage.available` already forces `false` when a non-Claude session is
  active; a **single shared `isLimitReached` helper** co-located with the threshold constant, left
  additive (the reducer untouched).
- **Timing:** the `usage` slice refreshes on the existing 180s poll (45s while armed), so the
  checkbox can lag the true limit state by up to one poll interval — consistent with the usage bar /
  auto-continue arming behavior.
- **Testing note:** Vitest runs in the `node` env (no jsdom / testing-library), so verification is
  via the pure `isLimitReached` unit tests plus type-check/lint/build — no React component render
  test.
- **Cross-platform:** frontend-only and platform-neutral (no OS-specific code), so it behaves
  identically on macOS and Windows.

---

### 306. [x] Remove the redundant in-panel Cancel button from scheduled & recurring session panels

**Status:** Done
**Depends on:** none

**Description**

Removed the redundant **"Cancel schedule"** / **"Cancel"** button from inside the pending
**scheduled-session** panel (#94) and the parallel **recurring-session** panel (#294). Every pending
schedule/recurring is always reachable as a **sidebar row** (hover-× + right-click "Cancel") and an
**Overview card** (header ×), both already wired to the same `cancelSchedule` / `cancelRecurring`
store actions — so the in-panel button was a duplicate control. The panels keep their **"Start now"**
button, the Edit toggle, and all editing fields (launch time / interval / next-run / name / prompt,
still auto-saving); only the duplicate cancel affordance is gone.

**What shipped** (commit
[`92a7857`](https://github.com/ErikdeJager/ReCue/commit/92a7857), PR
[#58](https://github.com/ErikdeJager/ReCue/pull/58), merged `de0217a`, 2026-07-02):

- **`src/components/ScheduledPanel/ScheduledPanel.tsx`:** deleted the `.cancel` "Cancel schedule"
  button from the `.actions` footer (the "Start now" button stays right-aligned) and removed the now
  unused `cancelSchedule` store selector.
- **`src/components/ScheduledPanel/ScheduledPanel.module.css`:** removed the `.cancel` /
  `.cancel:hover` rules (no dead CSS); `.actions` + `.startNow` kept.
- **`src/components/RecurringPanel/RecurringPanel.tsx`:** deleted the `.cancel` "Cancel" button from
  the `.meta` header row (Edit-toggle Pencil + all controls kept) and removed the now-unused
  `cancelRecurring` selector.
- **`src/components/RecurringPanel/RecurringPanel.module.css`:** removed the `.cancel` /
  `.cancel:hover` rules.

**Key files/areas touched:** `src/components/ScheduledPanel/ScheduledPanel.tsx` +
`ScheduledPanel.module.css`, `src/components/RecurringPanel/RecurringPanel.tsx` +
`RecurringPanel.module.css` (4 files, +8/−63).

**Dependencies:** none.

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 306): the card said "Reoccuring sessions," but the
  codebase has **both** a one-shot `ScheduledPanel` and a genuine `RecurringPanel` carrying the
  identical redundant button, so it was removed from **both** to keep the sibling components
  consistent. The store actions `cancelSchedule` / `cancelRecurring` are **untouched** (still used by
  the sidebar rows and Overview cards) — only the per-panel selectors and `.cancel` CSS were removed.
- **Canvas caveat (accepted):** a Canvas panel header × only removes the leaf (it does **not** cancel
  the record), so a schedule/recurring viewed *only* inside a Canvas (or a detached Canvas window with
  no sidebar/Overview) loses its in-panel cancel shortcut. No **global** capability is lost — every
  pending record is still cancellable from the sidebar and the Overview card × in the main window; a
  Canvas-specific in-panel cancel would be a follow-up, out of scope here.
- **Cross-platform:** pure deletion of JSX + CSS + an unused selector, frontend-only and
  platform-neutral — identical on macOS and Windows. No test asserted either panel's Cancel button
  (the existing store-level `cancelSchedule` test exercises the action, not the button), so no test
  changes were needed. Checks green: `npm run build` / `lint` / `test`.

---

### 307. [x] Glowing, alive indeterminate progress bar for an in-progress git clone

**Status:** Done
**Depends on:** none

**Description**

Made the sidebar's background-clone (#299) **"phantom" progress bar** visibly *alive* so a user
trusts a clone is still working, not stuck. The expanded phantom folder's indeterminate bar now
shows a bright accent **comet glint sweeping** across a softly **breathing accent glow**, and the
collapsed-rail clone folder icon gains a subtle accent glow alongside its existing pulse. Purely
presentational polish of the existing indeterminate affordance — the bar stays **indeterminate** (no
fake percentage; a real % is Task 308's separate backend concern), and no clone behavior, data, or
timing changes.

**What shipped** (commit
[`eaa7575`](https://github.com/ErikdeJager/ReCue/commit/eaa7575), PR
[#59](https://github.com/ErikdeJager/ReCue/pull/59), merged `18a0d38`, 2026-07-02):

- **New breathing-glow keyframe (`src/styles/global.css`):** added `@keyframes clone-glow` (modeled
  on the updater's `update-glow`) whose `0%/100%` frame **equals** the static resting glow set on the
  track's base rule — so the reduced-motion killswitch freezes it to a visible static glow. Animates
  `box-shadow` only (no layout shift). The existing `clone-progress` transform range is unchanged;
  its easing is switched to plain `ease-in-out` at the call site so the glint doesn't decelerate
  mid-track (which could read as a stall).
- **Glowing/comet bar (`src/components/Sidebar/Sidebar.module.css`):** `.phantomTrack` gained a
  static resting accent `box-shadow` glow (the reduced-motion fallback) plus the `clone-glow` breathe;
  `.phantomBar` became a horizontal **comet-core gradient** (dim → bright `--accent-hover` center →
  dim) instead of a flat rectangle, with the `ease-in-out` sweep; `.railPhantom` gained a subtle
  static accent `filter: drop-shadow` glow (keeping its `clone-pulse` opacity breathe; the static
  glow survives reduced motion). Every `color-mix(...)` is preceded by a plain-color fallback.

**Key files/areas touched:** `src/styles/global.css`, `src/components/Sidebar/Sidebar.module.css`
(2 files, +69/−19).

**Dependencies:** none.

**Notes**

- **Decisions** (per `ASSUMPTIONS.md` §Task 307): the "glowing indicator" is a moving accent comet
  glint + a breathing `box-shadow` glow on the track; the bar **stays indeterminate** —
  `role="progressbar"` keeps **no `aria-valuenow`** and its accessible name stays `Cloning <name>`
  (a real % is Task 308's concern, out of scope). Scope covers **both** the expanded phantom bar and
  the collapsed-rail folder icon. It's **CSS-only** — the existing `.phantomTrack > .phantomBar`
  markup is reused verbatim, no TSX/logic/Rust/IPC/store change.
- **Reduced motion:** all sweep/breathe motion stops under OS `prefers-reduced-motion` **or**
  Settings → Appearance → Reduce motion (`body.reduce-motion`), leaving a **static** accent glow so
  the bar still reads "working," not a bare gray bar. The track's outset `box-shadow` correctly
  escapes its `overflow: hidden` (overflow clips children, not the element's own shadow).
- **Cross-platform:** only `color-mix` (each with a plain-color fallback per repo convention),
  `linear-gradient`, `box-shadow`, `filter: drop-shadow`, and `transform` — all supported on both
  WKWebView and WebView2/Chromium, no macOS-only `-webkit-`/vibrancy effect — so it renders
  identically on macOS and Windows. No runtime logic change, so no new unit tests; checks green:
  `npm run build` / `lint` / `format:check`.

---

