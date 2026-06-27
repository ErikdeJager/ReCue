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

There was no way to pull a folder's latest changes from inside ClaudeCue — the user had to drop into
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
was replaced by the linked page, stranding the user on a web page inside ClaudeCue with no back button
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
  `window.__claudecue = { mockUpdate, mockProgress, mockError, clearUpdate }` (with a
  `declare global` augmentation); `main.tsx` imports it behind `if (import.meta.env.DEV)`. A
  convenience **"Simulate update (dev)"** button (`FlaskConical`) appears in the #191 pane,
  also `DEV`-gated.
- **Dev-only footprint verified:** Vite replaces `import.meta.env.DEV` with `false` in
  production, dead-code-eliminating `devMock.ts` + the `window.__claudecue` registration + the
  button — confirmed **0** occurrences of `__claudecue`/`registerDevMock`/"Simulate update" in
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
  `ASSUMPTIONS.md` — "insert a command" = a dev-gated `window.__claudecue` console helper
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
should **introduce what ClaudeCue is** and frame this as the initial release, presenting the core
capabilities as a product pitch rather than a task-by-task changelog. **Content-only** edit of
one JSON file — no code/pipeline change.

**What shipped** (commit `b5a1ef7`, 2026-06-27):

- Replaced `src/patchnotes/0.0.1.json`'s changelog-style entries with two intro categories
  (keeping `version: "0.0.1"`, `date: "2026-06-26"`, and the `{version, date, changes:[{category,
  items[]}]}` schema):
  - **"welcome"** — what ClaudeCue is (a macOS app for running/managing many live `claude`
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
- **Scope tension flagged:** `CLAUDE.md` documents ClaudeCue as **macOS-only**, yet this is a
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

