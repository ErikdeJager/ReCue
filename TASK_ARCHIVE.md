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
(#42/#55/#71/#88/#95 — still no approval pills/awaiting-glow/floating) · no app-rendered
approval UI (users answer in the terminal) · no Archive (single **Remove = kill +
forget**) · no Skills manager · no Fork · no light mode · no auth · no code
signing/notarization · a **Settings** screen now exists (#100/#102/#103, reversing the
v1 "no settings screen" rule) and **Canvas tabs detach into their own native window**
(#84, reversing "no multi-window") · **git is read-mostly** —
ClaudeCue reads git (current branch + working-tree diff vs `HEAD`, branch compare #81)
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

Tasks **#1–#153 are complete** — see **Implemented (completed tasks)** above for the
index and git history for per-task detail. **There are no open tasks right now.**
_(Tasks #139–#140 are reserved on another branch. The Kanban content-type task was
renumbered #142 → #145 to avoid colliding with the separately merged template task #142.)_
New work goes here as a fresh `### N.` entry in [TASKS-TEMPLATE.md](TASKS-TEMPLATE.md)
format, with its `Depends on:` prerequisites.

> **Implementing tasks — never skip one.** The agent implementing this backlog
> (`/develop-tasks`, `/isolate-agent`, `/handoff`) MUST implement **every** open task
> whose dependencies are all complete — take the lowest-numbered such `### N.` first —
> and must **never skip a task because it looks big, risky, or hard to verify**. Size is
> not a reason to defer: a task that is genuinely too large for one pass must be **split
> into smaller dependent sub-tasks** first (as #93 was split into #93 + #94), and then
> one of those is implemented — skipping is never the answer. Every task is carried to a
> finished, building, lint-clean state.

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

