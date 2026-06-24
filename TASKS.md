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

> The backlog has fully shipped (#1–#132).
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

Tasks **#1–#148 are complete** — see **Implemented (completed tasks)** above for the
index and git history for per-task detail. The Kanban board feature (#141–#143, #145,
#147), the Canvas panel header-drag affordance (#144), the Canvas panel title truncation
(#146), and the shared editable auto-saving raw text editor (#148) all shipped. **Open
now:** #149 (editable Kanban raw view — now unblocked, reuses #148's hook) and #150
(file-viewer syntax highlighting — Java + INI/.env/.properties). _(Tasks #139–#140 are
reserved on another branch. The Kanban content-type task was renumbered #142 → #145 to
avoid colliding with the separately merged template task #142.)_ The full entries for the
recently completed #133–#148 remain below until the next `/update-docs` condenses them into
the summary. New work goes here as a fresh `### N.` entry in
[TASKS-TEMPLATE.md](TASKS-TEMPLATE.md) format, with its `Depends on:` prerequisites.

> **Implementing tasks — never skip one.** The agent implementing this backlog
> (`/develop-tasks`, `/isolate-agent`, `/handoff`) MUST implement **every** open task
> whose dependencies are all complete — take the lowest-numbered such `### N.` first —
> and must **never skip a task because it looks big, risky, or hard to verify**. Size is
> not a reason to defer: a task that is genuinely too large for one pass must be **split
> into smaller dependent sub-tasks** first (as #93 was split into #93 + #94), and then
> one of those is implemented — skipping is never the answer. Every task is carried to a
> finished, building, lint-clean state.

---

### 133. [x] Worktree header context menu — Reveal in Finder / Copy absolute path

**Status:** Done
**Depends on:** none · _(builds on #74 worktree agents, #130 Reveal/Copy + `reveal_path`, #132 row menus — all shipped)_
**Created:** 2026-06-22

**Description**

In the sidebar, each isolated worktree (#74) renders as a sub-group under its parent
repo: a `worktreeHeader` row (`GitBranch` icon + branch name + "worktree" badge, with
the worktree's absolute path already in its `title` tooltip) followed by the worktree
agent's `SessionRow`(s). Unlike the repo header (which has the #130 menu) and every row
type (#131/#132), the **worktree header has no right-click menu at all**.

Add a right-click context menu to the **`worktreeHeader`** row (`Sidebar.tsx`) with
exactly two non-destructive items, mirroring the repo menu (#130):

- **Reveal in Finder** → `revealPath(wt)` (the existing `reveal_path` backend, macOS
  `open <path>`, no shell)
- **Copy absolute path** → `copyToClipboard(wt, "path")` (the store clipboard helper)

where `wt` is the worktree folder's own absolute path (the worktree agent's `repoPath`,
i.e. `<app-data>/worktrees/<repo>-<hash>/<branch>`) — the path the header already shows
on hover.

Scope: **worktree header only**. The worktree agent's `SessionRow` keeps its existing
#131 menu unchanged; regular (non-worktree) agent rows are untouched. No new backend, no
destructive actions, no confirm gate.

**Subtasks**

1. [x] Give the `worktreeHeader` a cursor-positioned context menu — reuse the existing
   `useRowMenu()` hook (the `{x,y}` + Escape/overlay-dismiss pattern used by
   `RowContextMenu`).
2. [x] Render the two items ("Reveal in Finder" / "Copy absolute path") wired to
   `revealPath(wt)` and `copyToClipboard(wt, "path")`, reusing the `.menu` /
   `.menuOverlay` / `.menuItem` styles. Generalize `RowContextMenu` to accept multiple
   items, or add a small dedicated menu — implementer's choice.
3. [x] Verify the menu closes on select / Escape / outside-click and clamps to the
   viewport like the other row menus.

**Acceptance criteria**

- [x] Right-clicking a worktree's branch/badge header opens a two-item menu.
- [x] "Reveal in Finder" opens the worktree folder in Finder; "Copy absolute path" puts
  that absolute path on the clipboard (toast "Copied path").
- [x] The worktree **agent** row's menu (#131) and regular agent rows are unchanged.
- [x] `npm run build`, `npm run lint`, and `npm test` pass.

**Implementation report**

Extracted the inline `worktreeHeader` JSX in `Sidebar.tsx` into a `WorktreeHeader`
component (so it can call the `useRowMenu()` hook at component top level), wired to a
two-item right-click menu: **Reveal in Finder** → `revealPath(wt)` and **Copy absolute
path** → `copyToClipboard(wt, "path")` (toast "Copied path"), where `wt` is the
worktree's own absolute folder path (already the header tooltip). Generalized the shared
`RowContextMenu` (#132) from a single `label`/`onActivate` to an `items: RowMenuItem[]`
array (`{label, onActivate, danger?}`) — `danger` paints `menuItemDanger`, else the
neutral `menuItem` — and updated the four existing single-item call sites
(ScheduleRow/FileRow/DiffRow/TerminalRow) to pass a one-element `items` array.
`useRowMenu`'s existing Escape/overlay-dismiss + viewport clamp cover subtask 3. Scope
held to the worktree header; agent rows (#131) untouched. No backend change.
`npm run build`, `npm run lint`, `npm test` (140) all pass.

**Notes**

- Label wording uses "Copy absolute path" (per the request) vs. the repo menu's "Copy
  path" (#130) — the worktree path is an out-of-repo absolute location, so the
  distinction is meaningful. Easy to align to "Copy path" if consistency is preferred.

---

### 134. [x] Guard Fork against an empty / un-materialized conversation

**Status:** Done
**Depends on:** none · _(builds on #126 fork + #97 `title.rs` log-globbing — both shipped)_
**Created:** 2026-06-22

**Description**

Fork (#126, surfaced on the Overview/Canvas agent headers and the #131 sidebar row menu)
spawns `claude --session-id <new> --resume <source> --fork-session`. This requires the
**source's on-disk conversation log** (`~/.claude/projects/*/<source-uuid>.jsonl`) to
exist with at least one conversation entry. When it doesn't, `claude` exits **code 1**
("No conversation found"), and — per the #63 exit handling — the new forked session is
left as a **dead panel showing the "Process exited (code 1)" overlay + Restart**, which
reads to the user as a crash.

Two real cases hit this, sharing one root cause (the source has no materialized
conversation log):

1. Forking a brand-new interactive session the user has **never sent anything to** — no
   log written yet.
2. Forking a **fork that was just created and never interacted with** — a fresh fork's
   log isn't materialized until first interaction, so its `--resume` finds nothing. This
   is why "type a prompt → fork → fork the fork" crashes on the second fork.

Fix it once at that root: refuse to fork a source whose conversation log doesn't exist /
is empty, gracefully, **without creating a doomed session/panel**.

**Important:** the detector must check the **actual on-disk log**, not the
`hasBeenActive` / busy flags — a fork inherits its parent's history yet starts gray
(#116), so those flags would wrongly judge it empty; conversely a never-prompted session
has no log. Reuse `title.rs`'s `~/.claude/projects/*/<uuid>.jsonl` glob.

**Recommended approach (backend guard):** in `fork_session` (commands.rs → `pty.rs`
`fork_session`), before spawning, verify the source's claude log exists and is non-empty;
if not, return a typed `SessionError` with a friendly message (e.g. "Nothing to fork yet
— send the agent a message first"). The frontend `forkSession` (store.ts) already toasts
`err.message` on failure, so this surfaces as a clean error toast and **no broken/exited
panel is created**.

Out of scope: changing fork's flags or behavior for sessions that **do** have history.

**Subtasks**

1. [x] Factor a small read-only helper that locates a session's claude JSONL log (reuse
   `title.rs`'s `~/.claude/projects/*/<uuid>.jsonl` glob) and reports whether it exists
   with ≥1 conversation entry.
2. [x] In `fork_session` (commands.rs / `pty.rs`), call it for the source before
   spawning; on "no history" return a typed `SessionError` with a clear message instead
   of spawning a doomed PTY.
3. [x] Confirm the frontend `forkSession` surfaces that message as an error toast and
   creates no session/panel on this path (it already toasts `err.message`).
4. [ ] _(Optional, skipped)_ Disable/hide the Fork buttons + the #131 menu item when the
   source has no history — no *reliable* signal is cheaply available client-side (the
   on-disk log is the only trustworthy one, and per-render IPC log reads aren't "cheap");
   the backend guard + error toast is the robust fix.

**Acceptance criteria**

- [x] Forking a brand-new session the user never prompted does **not** create a dead
  "Process exited" panel; the user is told to send a message first.
- [x] "Type a prompt → fork → fork the fork" no longer crashes the second fork — an
  un-materialized fork is handled gracefully (no dead panel).
- [x] Forking a session that **does** have conversation history is unchanged (works as
  in #126).
- [x] `npm run build`, `npm run lint`, `npm test`, and `cargo test` pass.

**Notes**

- The "crash" is a non-zero `claude` exit (code 1, "No conversation found") leaving the
  #63 exit overlay on the new fork; the fix prevents creating that session at all.
- Detection is against the on-disk log, not `hasBeenActive` / busy (a fork inherits
  history yet starts gray #116).

**Implementation report**

Backend guard at the root, as recommended. Factored `title.rs`'s log glob into a
3-state `locate_log` → `Found` / `Absent` (projects dir readable, no `<id>.jsonl`) /
`Unknown` (no `HOME` / unreadable dir); `find_log` (used by `read_session_title`) now
wraps it, behavior unchanged. Added `pub fn has_conversation(claude_session_id)` +
`log_has_turn(path)`: a session is forkable iff its log holds ≥1 line with
`type":"user"`/`"assistant"` (a real turn, vs. the startup-only `mode` /
`permission-mode` / `file-history-snapshot` / `last-prompt` metadata; format verified
against `~/.claude/projects/*.jsonl`, claude 2.1.x). **Fail-open:** only a *positive*
"no conversation" (Absent, or a file with zero turns) returns `false`; any uncertainty
(Unknown, unreadable file) returns `true` so a working fork is never wrongly blocked —
worst case the pre-#134 behavior remains for that unreachable path. Added a typed
`SessionError::NothingToFork` (`#[error("Nothing to fork yet — send the agent a message
first.")]`, `kind()` → `"NothingToFork"`, mirrored in the TS `SessionError` union) and
`commands.rs::fork_session` returns it before `manager.fork_session` when
`has_conversation` is false — so no PTY/record is created. The frontend `forkSession`
(store.ts) already toasts `err.message` and, throwing before `upsertSession`, creates no
session/panel — confirmed, no change needed (subtask 3). Subtask 4 skipped (optional; no
cheap reliable client signal). Unit test `log_has_turn_detects_conversation` covers
metadata-only / real-turn / empty-file / missing-file (fail-open). All gates pass:
`cargo test` (68), `cargo clippy -D warnings`, `npm run build`, `npm run lint`,
`npm test` (140).

---

### 135. [x] Drag to reorder / reposition existing Canvas panels

**Status:** Done
**Depends on:** none · _(builds on the #46/#47/#58 Canvas BSP + edge-drop machinery, the #18 terminal pool, and #84 detached canvas windows — all shipped)_
**Created:** 2026-06-22

**Description**

In a Canvas tab, panels can be **added** by dragging items in from the sidebar (#47), but
an existing panel **can't be moved**: there is no drag source on a panel, and the drop
path (`canvasDrop.ts applyCanvasDrop` → `canvasTree.ts splitLeaf`) only ever mints a
**new** leaf + content. Let the user **drag an existing panel to reorder or reposition it**
within the active tab's BSP layout, reusing the per-panel edge drop-zones that drag-in
already renders (`panel:<leafId>:<edge>`, shown while `dragActive`).

**Behavior — atomic "move leaf" computed on drop (decided):** the layout stays exactly
as-is during the drag (panels don't move, no terminal churn); the existing edge zones
light up; and on a successful drop the whole reposition is applied as **one atomic tree
update**. Conceptually this is "remove the dragged panel, its sibling reflows to fill the
gap, then re-split the drop target with it" — but it happens **once, on drop**, not on
drag-start, so:

- A **canvas-only shell terminal** (#72/#118, tracked only by its leaf) is **never
  disposed mid-drag** — `reconcileTerminals` only ever sees the final tree, which still
  contains the moved panel. The moved panel keeps its identity, so the #18 pool just
  **reparents** its xterm (agent or shell) rather than recreating it.
- There is **no double reflow / flicker** (the panel-absent intermediate tree never
  reaches the store), and a **cancelled / Escape drag is a no-op for free** (nothing
  changed). _(This was chosen over the alternative "remove on drag-start, re-insert on
  drop", which would dispose canvas-only terminals the instant you grab them and require
  restoring the tree on cancel.)_

One mechanism covers **both reorder and reposition**: dropping panel A on B's left edge
moves A to B's left; dropping A on a sibling's far edge swaps their order. No separate
"swap" operation is needed.

This must work in **both** the main Canvas view **and** a detached canvas window (#84) —
reordering is the only drag interaction a detached window has (it has no sidebar).

**Recommended approach**

1. **Pure op** `moveLeaf(tree, sourceId, targetId, edge, newSplitId)` in `canvasTree.ts`:
   no-op if `sourceId === targetId` or the source isn't found; capture the source leaf
   node (its **id + content**), `removeLeaf(tree, sourceId)`, then `splitLeaf(removed,
   targetId, edge, sourceContent, sourceId, newSplitId)` — **reusing the source leaf's
   original id + content** (not minting new ones) so identity is preserved and the pooled
   terminal reparents. If `removeLeaf` returns `null` (the source was the whole canvas)
   or the target no longer exists, return the tree unchanged. Add unit tests in
   `canvasTree.test.ts` (reorder siblings, reposition across branches, self-drop no-op,
   single-leaf no-op, identity/content preserved).
2. **Drag source:** a small **grip handle** in `LeafPanel`'s header (`CanvasSurface.tsx`)
   via `useDraggable({ id: "move:" + leaf.id, data: { kind: "move-leaf", leafId } })`.
   Attach the drag listeners to the **grip only** — not the whole header — so the filename
   `FileSwitcher` (#90) and the fork / copy / close buttons keep working. The PointerSensor's
   existing 4px `activationConstraint` already keeps a click (select/focus) from starting a
   drag.
3. **Drop handling:** in the app-level `DndContext.onDragEnd` (`App.tsx`), branch on
   `active.data.current?.kind === "move-leaf"`: parse `over.id` as `panel:<target>:<edge>`
   (ignore `canvas-center`), and when `target !== source` call a new store action
   `moveCanvasLeaf(sourceLeafId, targetId, edge)` that applies `moveLeaf` to the active
   tab's layout via the existing `setActiveCanvasLayout` (which already persists + syncs).
   The existing `payloadToContent` / `applyCanvasDrop` add-content path is unchanged.
4. **Detached window:** wire the same drag-active state + `onDragStart`/`onDragEnd` (the
   `move-leaf` branch only) into `CanvasWindow`'s `DndContext`, and pass real `dragActive`
   to its `CanvasSurface` so the edge zones appear. `moveCanvasLeaf` already targets the
   active canvas, which a detached window forces to its own id (#84/#98), and a detached
   window's `set_canvases` write merges only the `canvases` array — so the reorder persists
   + broadcasts correctly.
5. _(Optional, nice-to-have)_ a lightweight `DragOverlay` ghost showing the panel **title**
   following the cursor. **Do not** clone the live terminal into the overlay.

Out of scope: cross-**tab** moves (dragging a panel onto another Canvas tab), and a
per-panel center "swap" zone (edge-drop reorder already covers swapping).

**Subtasks**

1. [x] Add the pure `moveLeaf` op + unit tests in `canvasTree.ts` / `canvasTree.test.ts`.
2. [x] Add a grip-handle drag source to `LeafPanel`'s header (listeners on the grip only).
3. [x] Add the `moveCanvasLeaf` store action (applies `moveLeaf` to the active tab via
   `setActiveCanvasLayout`).
4. [x] Branch the main `onDragEnd` (`App.tsx`) on `move-leaf` → `moveCanvasLeaf`, ignoring
   self-target and `canvas-center`; leave the add-content path intact.
5. [x] Wire `dragActive` + the `move-leaf` `onDragStart`/`onDragEnd` into `CanvasWindow` so
   reordering works in a detached window too.
6. [ ] _(Optional, skipped)_ a title-only `DragOverlay` ghost — deliberately left out (the
   spec's "layout stays put during the drag" is met by *not* applying any transform; the
   lit edge zones are the drop feedback). Easy to add later if desired.

**Acceptance criteria**

- [x] An existing panel can be dragged by a header grip and dropped on another panel's edge
  to reorder / reposition it within the active Canvas tab.
- [x] Moving an **agent or shell-terminal** panel never disposes its xterm — the terminal
  keeps its scrollback and just reparents (the #18 pool invariant holds). _(`moveLeaf`
  reuses the source leaf's **id + content**, so its React key + pool mapping are stable
  and `reconcileTerminals` only ever sees a tree that still contains it — unit-tested.)_
- [x] During the drag the layout doesn't move; the relayout happens once on drop; a
  cancelled / Escape drag leaves the layout unchanged; dropping a panel on its **own** edge
  is a no-op. _(No transform is applied during drag; the move is one atomic tree update on
  `onDragEnd`; self-drop is a no-op in both `applyCanvasMove` and `moveLeaf`.)_
- [x] Reordering works in both the main Canvas view and a **detached** canvas window (#84),
  and the change persists + syncs across windows. _(Both `DndContext`s share
  `applyCanvasMove` → `moveCanvasLeaf` → `setActiveCanvasLayout`, which persists + the #84
  cross-window broadcast carries it. **Runtime-unverified in a real detached window** —
  no GUI/multi-monitor in this environment, per the #84/#105 precedent.)_
- [x] `npm run build`, `npm run lint`, `npm test`, and `cargo test` pass.

**Notes**

- The visual "snap back" the feature evokes is just `removeLeaf` collapsing the source's
  parent into its sibling — applied atomically with the re-split on drop, never on
  drag-start.
- Reusing the source leaf's **id + content** in the re-split (vs. `splitLeaf`'s usual fresh
  ids) is what keeps the moved panel's React key + pool mapping stable.

**Implementation report**

Implemented exactly the recommended approach. **Pure op** `moveLeaf(tree, sourceId,
targetId, edge, newSplitId)` in `canvasTree.ts`: captures the source leaf via
`collectLeaves`, `removeLeaf`s it, then `splitLeaf`s the target **reusing the source's
original id + content** — so identity (React key + #18 pool mapping) is preserved and
the terminal reparents. No-op on self-drop / missing source / source-is-whole-canvas /
missing-target-after-prune (the last returns the *original* tree so a stale drop never
loses the panel). Five unit tests (reorder, cross-branch reposition, self-drop,
single-leaf, missing source/target, id+content preserved). **Drag source:** a
`GripVertical` button in `LeafPanel`'s header (`CanvasSurface.tsx`) via
`useDraggable({ id: "move:"+leaf.id, data: { kind:"move-leaf", leafId } })` — listeners
on the grip only (FileSwitcher / fork / copy / close untouched), **no transform applied**
so the layout stays put during the drag; `.panelGrip` CSS with grab/grabbing cursors.
**Store:** `moveCanvasLeaf(sourceLeafId, targetId, edge)` applies `moveLeaf` to the active
tab via `setActiveCanvasLayout` (one atomic update; the panel-absent intermediate never
reaches the store, so a canvas-only terminal isn't disposed mid-move). **Drop:** a shared
`applyCanvasMove(sourceLeafId, overId)` in `canvasDrop.ts` (parses `panel:<target>:<edge>`,
ignores `canvas-center` + self-target) called from a new `move-leaf` branch in both
`App.tsx` `onDragEnd` (add-content path intact) and `CanvasWindow.tsx` (now a full
`DndContext` with `pointerWithin` + `dragActive` state + onDragStart/End/Cancel, passing
real `dragActive` to its `CanvasSurface`) — so reorder works in a detached window too and
persists/broadcasts via the existing #84 sync. DragOverlay ghost skipped (optional). All
gates pass: `npm run build`, `npm run lint`, `npm test` (143), `cargo test` (68),
`prettier --check`. The detached-window path is **runtime-unverified** (no GUI here, per
#84/#105). _(This commit also normalizes a one-object Prettier wrap in `Sidebar.tsx` from
#133 — eslint hadn't flagged it.)_

---

### 136. [x] Optional custom agent name on Canvas-template `new-agent` blocks

**Status:** Done
**Depends on:** none · _(builds on the #117 template block registry + #118 instantiation, the #93/#101 prompt-seeded spawn, and #97 auto-naming — all shipped)_
**Created:** 2026-06-22

**Description**

A Canvas-template `new-agent` block (#117) can carry an optional **initial prompt** but
**not a name** — when a template is instantiated (#118), each agent spawns nameless
(`resolveTemplateBlock` calls `ipc.spawnSession(cwd, undefined, block.prompt)`), so it
always shows Claude's auto-title (#97) or the branch. Let the template author optionally
set a **custom agent name** on a `new-agent` block — i.e. **name an agent before it
exists** — and have that name applied to the spawned session. Leaving the field **empty
preserves today's behavior**: the agent is auto-named from Claude's `ai-title` (#97),
falling back to the branch.

This is almost entirely a **frontend / template-data** change: `spawnSession(cwd, name?,
prompt?)` and Rust `spawn_session(name: Option<String>)` already support a custom name
end-to-end (#93/#101), `sessionLabel` already resolves **custom || auto || branch** (#97),
and the `canvas_templates` store is an **opaque `serde_json::Value`** (the frontend owns
the shape) — so a new block field round-trips with **no Rust change**.

**Scope:** `new-agent` blocks only. Terminal / file / diff blocks keep their derived
titles (filename / "Diff" / "Terminal") — a generic per-panel title override for those is
**out of scope** for this task.

**Recommended approach**

1. Store the desired name on the block's content. Add an optional `name?: string` to
   `CanvasContent` (in `src/types`) — used only on `new-agent` template blocks. Prefer a
   dedicated `name` field over the existing generic `label` (which is a panel-title
   fallback) for clarity. No Rust/struct change (opaque blob).
2. **TemplateEditor:** for the `new-agent` block, render an optional **"Agent name
   (optional)"** text input (alongside the existing prompt textarea) with helper text like
   _"Leave empty to use Claude's auto-generated title."_, wired through the same
   `onConfig` patch path the prompt uses. (The block now has two config inputs — render the
   name input whenever the block's `liveKind === "agent"`, independent of the single-value
   `BlockConfig`.)
3. **`blockPlaceholderLabel`** (`templateBlocks.ts`): when a name is set, reflect it in the
   editor block placeholder (e.g. prefer the name, or `Start session: <name>`), so the
   editor surface shows the chosen name. Keep the prompt-snippet fallback when no name.
4. **`resolveTemplateBlock`** (store): pass `block.name?.trim() || undefined` as the spawn
   name → `ipc.spawnSession(cwd, block.name?.trim() || undefined, block.prompt)`. An
   empty/whitespace name → `undefined` → auto-name path preserved. The live resolved
   content (`resolvedContent`) is **unchanged** — the name is consumed at spawn (it becomes
   the session record's `name`), not stored on live agent content.
5. Tests: extend `templateBlocks.test.ts` (placeholder label reflects a set name) and, if
   useful, `templateInstantiate.test.ts` (the block's `name` survives instantiation onto the
   pending leaf so Retry re-spawns with it).

**Subtasks**

1. [x] Add `name?: string` to `CanvasContent` (types) — used on `new-agent` blocks only.
2. [x] Add the optional "Agent name" input to the `new-agent` block in `TemplateEditor`,
   wired via `onConfig`.
3. [x] Surface a set name in `blockPlaceholderLabel`.
4. [x] In `resolveTemplateBlock`, pass `block.name?.trim() || undefined` as the spawn name.
5. [x] Extend the template unit tests for the name field.

**Acceptance criteria**

- [x] A `new-agent` block in the template editor has an optional name field whose value
  **persists** in the saved template. _(Stored as `content.name` via the existing
  `onConfig` patch path → the opaque `canvas_templates` blob, no Rust change.)_
- [x] Instantiating a template whose `new-agent` block has a name spawns the agent **with
  that custom name**, shown as the panel title and the sidebar label. _(`resolveTemplateBlock`
  passes it to `spawnSession`; `sessionLabel` resolves custom || auto || branch, #97.)_
- [x] Leaving the name **empty** preserves current behavior (Claude's auto-title, else the
  branch). _(`block.name?.trim() || undefined` → the #97 auto-name path.)_
- [x] Terminal / file / diff blocks are unchanged (no name field). _(The input is gated on
  `desc?.liveKind === "agent"`.)_
- [x] `npm run build`, `npm run lint`, `npm test`, and `cargo test` pass.

**Implementation report**

Frontend/template-data only, exactly as recommended — no Rust change (`spawn_session`
already takes `name: Option<String>`; `canvas_templates` is an opaque JSON blob). Added
`name?: string` to `CanvasContent` (types). `TemplateEditor`'s `BlockPanel` renders an
optional **"Agent name (optional)"** text input gated on `desc?.liveKind === "agent"`
(independent of the single-value `BlockConfig`, so it sits alongside the prompt textarea),
helper text _"Leave empty to use Claude's auto-generated title."_, wired through the same
`onConfig` patch path as the prompt — reusing the existing `configField`/`configLabel`/
`configLine`/`helper` styles (no new CSS). `blockPlaceholderLabel` now prefers a set name
(`Start session: <name>`) over the prompt snippet, falling back to the prompt when the
name is blank. `resolveTemplateBlock` passes `block.name?.trim() || undefined` to
`ipc.spawnSession` so an empty name keeps the #97 auto-name path; `resolvedContent` is
unchanged (the name is consumed at spawn, becoming the session record's `name`). The
block's `name` survives instantiation onto the pending leaf (deep-copied by
`pendingContent`), so Retry re-spawns with it. Tests: `templateBlocks.test.ts` (name wins
over prompt; blank name falls back) + `templateInstantiate.test.ts` (name preserved on the
pending block). All gates pass: `npm run build`, `npm run lint`, `npm test` (145),
`cargo test` (68), `prettier --check`.

**Notes**

- No backend change: `spawn_session` already takes `name: Option<String>` (#93/#101);
  `canvas_templates` persists as an opaque JSON blob; `sessionLabel` resolves
  custom || auto || branch (#97). A user rename after spawn (#57) still wins, as always.

---

### 137. [x] Closing a Canvas tab — prompt to kill/keep its contents (+ default-behavior setting)

**Status:** Done
**Depends on:** none · _(builds on the #58 Canvas tabs, the #91/#106 kill/close-all mechanics, the #100/#103 Settings + Behavior section, the #84 detached windows, and the #18 terminal pool — all shipped)_
**Created:** 2026-06-22

**Description**

Today, closing a Canvas tab via its **×** (`CanvasTabs.tsx` → `store.closeCanvas`) just
drops the tab from `canvases`; the agents and items it contained **survive** — they live
in `sessions` / `overviewPanels` and stay in the sidebar ("left panel") + Overview
regardless of tabs. The user wants closing a tab to optionally **tear down its contents**.

**Behavior:** clicking **×** on a Canvas tab that **contains panels** pops a small
**modal** asking what to do with the tab's contents:

- **Kill & close** — kill the tab's agents, kill its shell-terminal PTYs, and remove its
  file / diff / terminal / scheduled items — i.e. **remove them from the left panel /
  Overview entirely** — then close the tab. (This is a **global** removal: the sidebar
  lists each agent/item once, independent of tabs, so "remove from the left panel" means
  remove everywhere — an item that also appeared in another tab is gone there too. This is
  the intended behavior, matching "remove it all from the left panel"; protecting items
  still referenced by another open tab is **out of scope**.)
- **Keep & close** — today's behavior: just close the tab; its agents/items remain in the
  sidebar + Overview ("still there in overview mode").
- **Cancel** — abort; don't close the tab.

**Keybinds (required):** each option must be a single quick keypress so the user can "get a
move on" without the mouse. Recommended: **`K`** → Kill & close, **`Enter`** → Keep &
close (the safe default), **`Esc`** → Cancel. The exact letters can be finalized in
implementation, but **both** kill and keep must have a keybind and the modal must be
focus-trapped (mirror the Settings / TemplateManager / TemplateUseModal modal pattern).
Showing a short summary of what will be removed (e.g. "Kill 2 agents + 1 terminal and
close 1 file?") is encouraged.

**Default-behavior setting (required):** add a **Settings → Behavior** control to configure
the default for this action with **three** values:

- **Ask every time** (default) — show the modal on every tab close that has contents.
- **Always kill** — skip the modal; kill + remove contents and close the tab directly.
- **Never kill (keep)** — skip the modal; close the tab only (today's behavior).

This setting is **self-contained** — when it's "Ask", the modal always shows, independent
of the existing #103 "Confirm destructive actions" toggle (which gates the sidebar's
inline confirms, not this). An **empty tab** (no panels) always closes silently with no
modal, in every mode.

**Recommended approach**

1. **Setting:** add `canvasCloseBehavior: "ask" | "kill" | "keep"` to the `Settings` type
   (`src/types`) + `DEFAULT_SETTINGS` (`"ask"`, store.ts) — persists in the opaque
   `settings` blob, upgrades cleanly. Wire a 3-segment control in the Settings **Behavior**
   section (`components/Settings`), reusing the existing `styles.segmented` pattern used by
   "Default view on launch".
2. **Per-tab teardown helper:** a new store helper `closeCanvasContents(layout)` (or
   inline) that walks `collectLeaves(layout)` and, per leaf kind, reuses existing
   primitives: `agent` → kill + drop the session (with #74 worktree cleanup, like
   `removeSession`); `terminal` → kill its shell PTY (intentional, no Restart overlay) and
   `removeOverviewPanel` if it's a sidebar item (a canvas-only template terminal #118 isn't,
   so just kill the PTY); `file`/`diff` → `removeOverviewPanel(repoPath, id)` when present;
   `scheduled` → `cancelSchedule`. Mark kills `intentional` (#32) and emit **one** summary
   toast (#83), not per-item spam.
3. **Close flow:** the tab × calls a new action `requestCloseCanvas(id)` that branches on
   `settings.canvasCloseBehavior` and whether the tab has contents: empty → `closeCanvas(id)`
   directly; `"kill"` → teardown + `closeCanvas`; `"keep"` → `closeCanvas`; `"ask"` → set a
   store field (e.g. `canvasClosePromptId`) to open the modal. Keep the existing
   `closeCanvas(id)` as the pure tab-drop step (still used by "keep" and post-kill).
4. **Modal:** a focus-trapped `CanvasCloseModal` rendered at the App top level (like
   `Settings` / `TemplateManager`), shown when `canvasClosePromptId` is set. Buttons +
   keybinds (K / Enter / Esc) call `confirmCloseCanvas(id, kill)` which runs the chosen
   path and clears the prompt. Show the contents summary.
5. **Detached tabs (#84):** clicking × on a detached canvas's tab still prompts; the kill
   path tears down its sessions (kill is global over IPC) and `closeCanvas` already closes
   the detached window. Confirm the flow works for a detached tab too.

Out of scope: changing the **+** / template-instantiation flows, the tear-off gesture, or
protecting contents shared with another open tab (kill is global, as above).

**Subtasks**

1. [x] Add `canvasCloseBehavior` to `Settings` + `DEFAULT_SETTINGS` and a 3-segment control
   in the Settings Behavior section.
2. [x] Add the per-tab `closeCanvasContents(layout)` teardown helper (reusing kill /
   removeOverviewPanel / cancelSchedule / worktree-cleanup primitives) with one summary toast.
3. [x] Add `requestCloseCanvas(id)` + `confirmCloseCanvas(id, kill)` + `canvasClosePromptId`
   state; point the tab × at `requestCloseCanvas`.
4. [x] Build the focus-trapped `CanvasCloseModal` with K / Enter / Esc keybinds and a
   contents summary; render it at the App top level.
5. [x] Verify empty tabs close with no modal; the setting's kill/keep modes skip the modal;
   detached tabs work. _(Empty/keep/kill branching unit-tested; detached path is the same
   action — runtime-unverified, see report.)_

**Acceptance criteria**

- [x] Clicking × on a Canvas tab **with contents** (in "Ask" mode) opens a modal with
  **Kill & close**, **Keep & close**, and **Cancel**, each operable by a single keybind
  (K / Enter / Esc).
- [x] **Kill & close** kills the tab's agents + shell-terminal PTYs and removes its
  file/diff/terminal/scheduled items from the sidebar + Overview, then closes the tab.
- [x] **Keep & close** closes the tab while leaving its agents/items in the sidebar +
  Overview; **Cancel** leaves the tab open and untouched.
- [x] The Settings → Behavior control switches the default among **Ask every time** /
  **Always kill** / **Never kill**, persists across restarts (opaque `settings` blob), and
  the non-Ask modes skip the modal.
- [x] An empty tab closes with no modal in every mode; the always-≥1-tab invariant (#58)
  still holds (`closeCanvas` is reused for the drop).
- [x] `npm run build`, `npm run lint`, `npm test`, and `cargo test` pass.

**Implementation report**

Implemented the recommended approach. **Setting:** added `canvasCloseBehavior:
"ask"|"kill"|"keep"` to `Settings` + `DEFAULT_SETTINGS` (`"ask"`; opaque blob, upgrades
cleanly) and a 3-segment control (Ask every time / Always kill / Never kill) in the
Settings → Behavior section, reusing the `segmented` pattern. **Teardown:** a module-level
`closeCanvasContents(layout)` walks `collectLeaves`, classifies each leaf, then in one
batched state update kills agents (+ ref-counted #74 worktree cleanup) and shell-terminal
PTYs (marked `intentional` #32), removes file/diff/terminal sidebar items
(`overviewPanels`, matched via the existing `leafItemId`; a canvas-only #118 terminal is
killed but has no sidebar entry), cancels schedules, clears a now-dangling selection, and
persists each affected repo — emitting **one** summary toast (#83). **Flow:** the tab ×
now calls `requestCloseCanvas(id)` — empty tab → `closeCanvas` directly; `kill`/`keep` →
`confirmCloseCanvas(id, bool)`; `ask` → sets `canvasClosePromptId`. `confirmCloseCanvas`
runs the teardown (kill path) then the reused `closeCanvas`. **Modal:** a new
`CanvasCloseModal` (rendered at the App top level when `canvasClosePromptId` is set) —
scrim + `role="dialog"`/`aria-modal`, the safe **Keep** button autofocused (native Enter),
window keybinds **K** → kill / **Esc** → cancel, a Tab focus-trap over its buttons, and a
contents summary ("This tab contains 2 agents, 1 terminal…"). 4 unit tests cover the
empty/ask+cancel/keep/kill-drops-agent branches. **Detached tabs (#84):** unchanged path —
the × still calls `requestCloseCanvas`, the kill is global over IPC, and `closeCanvas`
already closes the detached window; **runtime-unverified** in a real detached window (no
GUI/multi-monitor here, per the #84/#105 precedent). All gates pass: `npm run build`,
`npm run lint`, `npm test` (149), `cargo test` (68), `prettier --check`.

**Notes**

- "Remove it all from the left panel" = a **global** removal; the sidebar shows each
  agent/item once, so killing removes it from any other tab too — a deliberate, documented
  consequence (protecting cross-tab items is a possible follow-up, not this task).
- The new setting governs tab-close on its own (its "Ask" value replaces a confirm gate);
  it does **not** read the #103 `confirmDestructive` toggle.
- Per-tab teardown reuses the #91/#106 mechanics (`intentionalKills` #32, summary toast
  #83, worktree ref-counting #74) but keyed off the **closed tab's leaves**, not a repo.

---

### 138. [x] Show the Fork action as unavailable (with an explanatory tooltip) when the source has no history

**Status:** Done
**Depends on:** none · _(builds on #134 `has_conversation` + the `NothingToFork` guard, the #97 title-worker cadence, and #126 fork + #131 sidebar fork menu item — all shipped)_
**Created:** 2026-06-22

**Description**

#134 made forking a source with **no conversation log** fail gracefully — a friendly error
toast (`SessionError::NothingToFork`, "Nothing to fork yet — send the agent a message
first.") instead of creating a doomed dead panel. But its **optional subtask 4 was
deliberately skipped**: there was no cheap, reliable client-side signal to know *up front*
whether a session is forkable, so the Fork affordances stay fully enabled and the user only
learns "nothing to fork yet" **after** clicking. This task adds that signal and uses it to
render the Fork action as **visually unavailable** with a hover tooltip that **clearly
states why**, at all three fork sites.

The signal problem #134 named: the only trustworthy source of "has forkable history" is the
**on-disk claude log** (the #97/#134 `title::has_conversation` / `log_has_turn` glob over
`~/.claude/projects/*/<uuid>.jsonl`), and a per-render IPC read is too expensive. The fix
is to **reuse the #97 title-worker cadence** to push a cheap, cached per-session `forkable`
boolean — no new polling, no per-render IPC.

**Approach (backend signal → frontend gating)**

1. **Backend signal.** Emit a per-session forkability boolean from `has_conversation` on the
   **same edges the title is read** (the #97 monitor's busy→idle poke → `title_worker`):
   - Persist a `forkable` field on the session record (serde-default), like `auto_name` /
     `has_been_active` (`store.rs`).
   - In `pty.rs::title_worker`, on each busy→idle poke also compute
     `title::has_conversation(&id)` and, when it changes, emit it — either extend
     `SessionEvent::Name` with a `forkable` field or add `SessionEvent::Forkable { id,
     forkable }` + a `session://forkable` event (mirroring `session://name`). `lib.rs`
     persists it (a `set_forkable`) and forwards to the UI.
   - **Seed it:** a freshly spawned session has no log → `forkable = false` (Fork disabled
     until its first real turn materializes the log). On boot, the resume path reads
     `has_conversation` once per resumed session (or pokes the title worker) so a resumed
     session **with** history shows Fork available immediately; the persisted `forkable`
     covers the pre-first-refresh window.
   - **Fail-open, consistent with #134:** `has_conversation` returns `true` on uncertainty
     (unreadable / unknown), so `forkable` is `true` when unsure — the unavailable state
     appears **only when we're confident there's no history**, never wrongly blocking a
     forkable session. The #134 backend guard + toast stays as the real safety net.
2. **Frontend gating.** The store caches the flag (a `sessionForkable[id]` map or a
   `forkable` field on the session view, seeded from the record + updated by the new event,
   mirroring `setAutoName` / `onName`). The **three Fork sites** read it:
   - Overview card header (`Overview.tsx`), Canvas `LeafPanel` header
     (`CanvasSurface.tsx`), and the #131 sidebar `SessionRow` menu item (`Sidebar.tsx`).
   - When `forkable === false`: render the Fork icon / menu item **dimmed / unavailable**
     (on-token disabled styling), make it a **no-op** (don't fork, don't even toast), and
     show a hover **tooltip stating why** — reuse the #134 message ("Nothing to fork yet —
     send the agent a message first.") for consistency.
   - **Implementation note:** a native `disabled` button suppresses hover / `title`, so the
     tooltip wouldn't show. Use `aria-disabled` + a guarded click handler (or a wrapping
     element carrying the `title`) so the explanatory tooltip still appears on hover. The
     sidebar menu item can show the reason inline (sub-text) or via `title`.

Out of scope: changing fork's flags / behavior for sources that **do** have history (#126),
and the backend guard itself (#134 — kept unchanged as the safety net).

**Subtasks**

1. [x] Backend: persist a `forkable` field + emit it from `has_conversation` on the
   title-worker cadence (added a `Forkable` event + `session://forkable`); `lib.rs`
   persists (`set_forkable`, persist-on-change) + forwards.
2. [x] Seed forkability at spawn (`false`) and at boot/resume (read `has_conversation`
   once per record) so resumed sessions with history show available immediately.
3. [x] Frontend store: cache + update the per-session `forkable` flag from the record
   (`toSessionView`, fail-open default) + the `session://forkable` event (`setForkable`).
4. [x] Gate the three Fork sites (Overview header, Canvas `LeafPanel` header, sidebar #131
   menu item): dimmed / unavailable + no-op + explanatory hover tooltip when not forkable.
5. [x] Tooltip shows on the unavailable control via `aria-disabled` + a click guard (not
   the native `disabled` attribute, which would suppress the `title` hover).

**Acceptance criteria**

- [x] On a brand-new session the user has never prompted, the Fork affordance (all three
  sites) is shown **unavailable**, and hovering it explains why.
- [x] After the agent's first real turn (log materialized), the Fork affordance becomes
  available automatically (on the next busy→idle edge → `session://forkable`).
- [x] A resumed session with existing history shows Fork available immediately on boot
  (the boot read seeds `forkable` from the on-disk log).
- [x] Clicking / activating the unavailable Fork affordance does **nothing** — the click
  handlers early-return when not forkable (no spawn, no toast).
- [x] When forkability is **uncertain** (unreadable log), Fork stays available (fail-open:
  `has_conversation` → true, serde default true, UI treats undefined/true as available)
  and the #134 guard still protects the actual fork.
- [x] `npm run build`, `npm run lint`, `npm test`, and `cargo test` pass.

**Implementation report**

Backend signal → frontend gating, as specified. **Backend:** persisted a `forkable: bool`
on `PersistedSession` (`#[serde(default = "default_true")]` — fail-open for older records),
explicitly `false` in all five new-session constructors (spawn / worktree ×2 / fork /
scheduled — no log yet). Added `Store::set_forkable` (persist-on-change, like
`mark_session_active`). `pty.rs::title_worker` now computes `title::has_conversation(&id)`
on every busy→idle poke (the #97 cadence, independent of the title) and emits a new
`SessionEvent::Forkable { id, forkable }` when it flips; `lib.rs` persists + forwards it as
`session://forkable` (+ `commands::ForkablePayload`), and the boot/resume loop reads
`has_conversation` once per record and seeds+emits so a resumed session **with** history
shows Fork available immediately. **Frontend:** `SessionRecord`/`SessionView` gained
`forkable`; `toSessionView` seeds it fail-open (`?? true`); a `setForkable` store action
(no-op for unknown ids — e.g. a shell terminal also poked) updates it from the
`onForkable` subscription. The **three Fork sites** (Overview `SessionCard`, Canvas
`LeafPanel`, sidebar #131 `SessionRow` menu item) read `session.forkable !== false` and,
when unavailable, render dimmed via `aria-disabled` (**not** native `disabled`, so the
`title` tooltip still shows on hover — CSS `[aria-disabled="true"]` dims + suppresses
hover), no-op the click, and show the shared `FORK_UNAVAILABLE_REASON` (`paths.ts`, mirrors
the #134 message). Fail-open throughout; the #134 `NothingToFork` backend guard is
unchanged as the real safety net. Tests: Rust `set_forkable_updates_and_persists_on_change`
(+ legacy-record fail-open) and frontend `setForkable` (flip + unknown-id no-op). All
gates pass: `npm run build`, `npm run lint`, `npm test` (150), `cargo test` (69),
`cargo clippy -D warnings`, `prettier --check`. The runtime hover/dim across the three
sites isn't unit-testable, but the logic + the fail-open contract are covered.

**Notes**

- Reuses the #97 title-worker busy→idle cadence — forkability changes exactly when the log
  first materializes, so that cadence already captures every transition; no new polling.
- Fail-open mirrors #134: unavailable only on a confident "no history"; the backend
  `NothingToFork` guard is unchanged.
- This surfaces, **up front**, the two un-materialized cases #134 documented: a
  never-prompted session, and a just-created-never-used fork.

---

### 141. [x] Markdown Kanban engine — Obsidian-format parser/serializer + a file-write backend

**Status:** Done
**Depends on:** none · _(builds on the read-only `files.rs` `read_text_file` (#44) + the
`store.rs` JSON-persistence pattern — both shipped; foundation for #145, #143)_
**Created:** 2026-06-24

**Description**

First task of the **Kanban board** feature: a markdown-backed Kanban board the user can
load from a repo (like the file viewer) and edit without ever touching the markdown. This
task builds the **engine only** — the file format, a pure parse/serialize round-trip, and
the backend **write** path the editor (#143) will use. No UI yet.

**Format — Obsidian-Kanban compatible (the researched de-facto standard).** A board is a
normal `.md` file living in a repo:

- YAML frontmatter `kanban-plugin: board` marks the file as a board.
- Each `## Heading` is a **column** (status lane), in document order.
- Each `- [ ] Card title` / `- [x] Card title` checklist item under a column is a **card**
  (checked = done); indented continuation lines under a card are its **markdown body**.
- A column may carry the Obsidian `**Complete**` marker (the "done" lane) — **preserve** it.
- A trailing `%% kanban:settings … %%` block (board options) is **preserved verbatim**.
- **Non-strict:** a card is minimally just a title; everything else (body text, `#tags`, a
  `@{date}`, `[[links]]`, any markdown) is **optional freeform content the user writes**.
  The engine does **not** model dates/tags as structured fields — it preserves the card's
  title + raw markdown body untouched.

**Card model (deliberately minimal):** `{ title: string; body: string; checked: boolean }`
— `body` is the raw markdown under the card. No `dueDate` / `tags` fields (the user
reframed cards as freeform markdown; display is #145).

**This adds the app's first arbitrary file-write command** — expanding the documented
"git/files are read-mostly; no arbitrary file writes" rule the way #74/#124 expanded the
git rule. The write is path-validated identically to `read_text_file` (canonicalize,
reject `..`/symlink escape, confine to the repo).

Scope: the pure TS model + `parse`/`serialize` and the Rust write command + its IPC
wrapper. **No** rendering, content kind, or editor (those are #145/#143).

**Subtasks**

1. [x] Define the board model in TS (e.g. `src/components/Kanban/kanban.ts`):
   `Board { frontmatter; columns: Column[]; settingsBlock? }`,
   `Column { name; complete: boolean; cards: Card[] }`, `Card { title; body; checked }`.
2. [x] Pure `parseBoard(md): Board` and `serializeBoard(board): string`, lenient/non-strict
   and **round-trip stable** — frontmatter, the `**Complete**` marker, and the
   `%% kanban:settings %%` block are preserved verbatim; multi-line card bodies and
   arbitrary inline markdown (tags/dates/links) survive untouched.
3. [x] Unit tests (`kanban.test.ts`): empty board, columns with no cards, multi-line card
   body, checked vs unchecked, frontmatter + settings block preserved, `parse∘serialize`
   idempotence on a realistic board.
4. [x] Backend `write_text_file(repo, file, contents)` in `src-tauri/src/files.rs` — same
   path validation as `read_text_file` (canonicalize, confine to repo, reject escapes;
   reasonable size cap), creating/overwriting the file; register the Tauri command
   (`commands.rs` + `lib.rs`) and add the typed `writeTextFile` IPC wrapper (`ipc.ts`).
   A Rust unit test for the path validation (rejects `..` / outside-repo).
5. [x] Note the new write capability in CLAUDE.md (the "read-mostly" sections) and the
   TASKS.md project-context.

**Acceptance criteria**

- [x] `parseBoard`/`serializeBoard` round-trip a realistic Obsidian-format board with no
  data loss (frontmatter, columns incl. `**Complete**`, multi-line bodies, settings block)
  — unit-tested.
- [x] A card with only a title parses/serializes cleanly; arbitrary markdown in a card body
  (tags, a date, links) is preserved verbatim (no structured-field parsing).
- [x] `write_text_file` writes a repo file, **rejects** paths that escape the repo
  (canonicalized), and is exposed as a typed IPC wrapper.
- [x] CLAUDE.md / TASKS.md note the app's first arbitrary file write.
- [x] `npm run build`, `npm run lint`, `npm test`, and `cargo test` pass.

**Notes**

- Format research: the Obsidian Kanban plugin is the established markdown-board standard —
  `## column` + `- [ ] card` + `kanban-plugin` frontmatter + a `%% kanban:settings %%`
  block. Chosen for interoperability and because plain markdown is trivially
  AI-readable/-writable (the feature's stated long-term goal).
- AI integration is **out of scope** here — the format only enables it later.
- Independent of the unmerged #139–#140 (another branch); this chain starts at #141.

**Implementation report**

Engine + write backend only (no UI), exactly the recommended scope. **TS model +
parse/serialize** (`src/components/Kanban/kanban.ts`): `Board { frontmatter: string|null;
columns: Column[]; settingsBlock: string|null }`, `Column { name; complete; cards }`,
`Card { title; body; checked }`. `parseBoard` normalizes CRLF→LF, then peels three regions —
a leading `---…---` frontmatter block (captured verbatim), the trailing
`%% kanban:settings … %%` block (from the marker to EOF, verbatim), and the middle, which it
walks line-by-line: `## H` → a column, `**Complete**` (exact, unindented) → the done-lane
flag, `- [ ]`/`- [x]` → a card, and tab- (or 4-space-) indented continuation lines → the
card's `body` (dedented one level; the body check runs **before** the blank/`**Complete**`
tests so a tab-only blank body line survives). `serializeBoard` is its deterministic inverse:
frontmatter, then per column `## name` + optional `**Complete**` + each card
(`- [ ]`/`- [x] title` with tab-indented body lines), then the settings block, sections
joined by a blank line. Content before the first heading is ignored (lenient); a structure-less
`.md` yields zero columns. **11 unit tests** (`kanban.test.ts`): empty board, no-card column,
multi-line body w/ blank lines + tags/links, checked vs unchecked, frontmatter + settings
preserved, lenient pre-heading content, CRLF, `serialize(parse(x))===x` idempotence on a
realistic board, and `parse(serialize(board))` deep-equals (incl. an empty-title card). **Write
backend** (`files.rs::write_text_file`): the app's **first arbitrary file write**, path-validated
like `read_text_file` — an existing target is canonicalized whole (rejecting symlink escapes),
a new target's parent dir is canonicalized + confined to the repo (so `..`/absolute/out-of-repo
and a missing parent are rejected), capped at the same 5 MB; exposed as the `write_text_file`
Tauri command (`commands.rs` + registered in `lib.rs`) + the typed `writeTextFile` IPC wrapper
(`ipc.ts`). 2 Rust tests (writes new + overwrites in-repo; rejects traversal/absolute/missing-parent).
Docs: `files.rs` module doc, CLAUDE.md (a new "File access is read-mostly, with one deliberate
write" scope bullet + the `files.rs` layout line) and the TASKS.md project-context note the new
write. All gates pass: `npm test` (163), `npm run build`, `npm run lint`, `cargo test` (71),
`cargo clippy -D warnings`, `prettier --check`, `cargo fmt --check`. #145 (content kind +
read-only render) and #143 (editor + write-back) build on this.

---

### 145. [x] Kanban board content type — load like the file viewer + read-only board rendering

**Status:** Done
**Depends on:** #141 · _(builds on the content-kind system + the #82 repo "Views"
registry, the #56/#90 `FilePicker`, the #44 FileViewer markdown stack, and
`overview_panels` persistence — all shipped)_
**Created:** 2026-06-24

**Description**

Second task of the **Kanban board** feature: make a board a first-class **content kind**
(like `file` / `diff` / `terminal`), **loaded from a repo through the same file-picker flow
as the file viewer**, and **rendered read-only** as columns + cards. Editing is #143.

**Loading (the same method as the file viewer).** The repo context-menu **Views** section
(#82) gains a **"Kanban board"** entry that opens the searchable `FilePicker` (#56) —
exactly the "Open file viewer" path (`menuMode("files")`) but scoped to `.md` files — and
the chosen file becomes a `kanban` panel `{ kind:"kanban", repoPath, file }` (the **same
refs as a `file` panel**), persisted in `overview_panels` like every other view. The board
is also a draggable **sidebar row** (`KanbanRow`, mirroring `FileRow`) that drops into
Canvas, an **Overview column**, and a **Canvas panel** — the full standard-content-kind
treatment.

**Rendering (read-only, text-formatting-focused).** A `KanbanPanel` reads the `.md` via
`readTextFile`, parses it with #141's `parseBoard`, and lays out the columns left-to-right,
each with its cards. **A card shows its title and renders its markdown body** via the
FileViewer markdown stack (react-markdown + remark-gfm, #44) — display **focuses on text
formatting**, so a card with no extra metadata shows nothing extra (no empty "due date"
chrome). The columns strip **scrolls horizontally** when there are many columns / the panel
is narrow (the user explicitly wants x-axis scroll on small panels). Hot-reload from disk
by polling like the FileViewer (bail-if-unchanged), so an external edit (the user, or later
an AI/claude editing the same file) updates the board. A `.md` with no kanban structure
renders as an empty board (no columns) — authoring it is #143.

Scope: wiring the content kind end-to-end + read-only rendering + horizontal scroll +
hot-reload. **No** add/edit/move/delete and **no** writes (all #143).

**Subtasks**

1. [x] Add `"kanban"` to the `CanvasContent` kind union (`src/types/index.ts`), carrying
   `repoPath` + `file`.
2. [x] `payloadToContent` + `isDuplicate` cases (`Canvas/canvasDrop.ts`) for `kind:"kanban"`
   (dedupe by `repoPath`+`file`, like `file`).
3. [x] Repo Views registry entry "Kanban board" (`Sidebar.tsx` `viewTypes`) → the
   `.md`-scoped `FilePicker` flow (the file-viewer method) → add a `kanban` panel to
   `overview_panels`.
4. [x] `KanbanRow` sidebar row (mirror `FileRow`: dnd-kit draggable
   `data:{kind:"kanban",repoPath,file}`, click selects/jumps #79, `RowContextMenu` Remove
   #132).
5. [x] `KanbanPanel` component: `readTextFile` → `parseBoard` → columns/cards; card title +
   markdown body via the #44 markdown renderer; horizontal-scroll column strip;
   FileViewer-style polling hot-reload.
6. [x] `CanvasSurface` `renderContent` case + the Overview column case → mount `KanbanPanel`.

**Acceptance criteria**

- [x] A `.md` board can be opened from the repo **Views** menu via the same searchable
  picker as the file viewer, and appears as a sidebar row, an Overview column, and a Canvas
  panel (draggable into Canvas), persisted across restarts.
- [x] The board renders its columns and cards read-only; a card renders its markdown body
  (text formatting), with nothing extra shown for unused metadata.
- [x] Many columns / a narrow panel scroll **horizontally** without breaking the layout.
- [x] Editing the `.md` on disk updates the board (hot-reload), without flicker when
  unchanged.
- [x] `npm run build`, `npm run lint`, and `npm test` pass.

**Notes**

- A `kanban` panel reuses the `file` panel's refs (`repoPath`+`file`) and persistence
  (`overview_panels`) — no new store blob.
- Read-only here keeps the milestone shippable/verifiable; all mutation + file writes are
  #143.

**Implementation report**

Frontend-only, exactly the recommended approach — `kanban` is a first-class content kind
reusing the `file` panel's refs (`repoPath`+`file`) and `overview_panels` persistence (no
new store blob; the Rust `OverviewPanel.kind` is a `String`, so `"kanban"` round-trips with
no backend change). **Wiring:** added `"kanban"` to `OverviewPanel.kind` (types) and the
`SidebarItem` kind union; `payloadToContent` + `isDuplicate` (`canvasDrop.ts`) map/dedupe a
`kind:"kanban"` payload (by repo+file); `addOverviewPanel` dedups kanban by file (like
markdown) + `panelLabel`/`leafItemId`/`matchesCanvasItem` gained kanban cases (so #79
select/jump + #137 tab-close teardown + the `CanvasCloseModal` summary all count it).
**Loading:** the repo **Views** menu gained a "Kanban board" entry (`SquareKanban` icon)
that reuses the searchable `FilePicker` (#56) **scoped to `.md`** via a new `filePickKind`
state — picking a file adds a `kanban` panel (the file-viewer method, no forced view switch
#79/#82). **Sidebar:** a `KanbanRow` mirrors `FileRow` (dnd-kit draggable
`{kind:"kanban",…}`, click selects/jumps, `RowContextMenu` Remove). **Rendering:** a new
read-only `KanbanPanel` (`readTextFile` → #141 `parseBoard` → columns left-to-right, each
with its cards; card title + markdown **body** via react-markdown + remark-gfm #44, no raw
HTML; the column strip **scrolls horizontally**; FileViewer-style polling hot-reload that
bails when the raw text is unchanged). Mounted in both `CanvasSurface.renderContent` +
`panelTitle` and the Overview `ExtraPanel` body. **Tests:** `addOverviewPanel` kanban dedup
(store.test) + `payloadToContent` kanban mapping (new `canvasDrop.test.ts`). All gates pass:
`npm test` (167), `npm run build`, `npm run lint`, `prettier --check`. Editing / DnD /
write-back is #143. _(Runtime board rendering isn't unit-testable here; the wiring + parse
are covered.)_

---

### 143. [x] Kanban editor — full card & column editing with drag-and-drop, written back to the .md

**Status:** Done
**Depends on:** #145 · _(needs #141's `serializeBoard` + `writeTextFile` and #145's
`KanbanPanel`; uses dnd-kit #43/#47 and the #94 debounced-auto-save pattern — all
shipped/prior in this chain)_
**Created:** 2026-06-24

**Description**

Final task of the **Kanban board** feature: make the board fully **editable in-app so the
user never touches the markdown**, persisting every change back to the `.md` via #141's
`writeTextFile`.

**Card editing (freeform, not field-locked).** Per the user, a card is a **title + an
optional markdown body** — no structured field UI. Add a card (a per-column "+ Add card"),
edit a card's **title and body** (the body is a plain markdown textarea — the user types
whatever tags / date / links / formatting they want, and #145 renders it), delete a card,
reorder cards within a column, and **drag a card between columns** (dnd-kit) = change its
status. (Optionally toggle a card's checked state.)

**Column editing.** Add a column, rename a column, reorder columns, delete a column (with
its cards) — confirm-gated per the #103 setting where destructive.

**Write-back.** Every mutation updates the in-memory `Board` and writes
`serializeBoard(board)` to the file via `writeTextFile`, **debounced** (the #94
`ScheduledPanel` auto-save pattern). Reconcile with #145's hot-reload poll so the panel's
own writes don't fight the reader (compare against the last content we wrote; reload only
when the on-disk content diverges — a genuine external edit), preserving the frontmatter +
`%% kanban:settings %%` block #141 round-trips. Card dragging runs in a **nested** dnd-kit
sortable context within the panel, coexisting with the app-level Canvas DnD (the
#43/#47/#58 nested-context precedent — only one view mounts at a time). Works in both the
main Canvas view and a detached canvas window (#84).

**Authoring a new board.** Since editing implies creation, include a lightweight **"New
Kanban board"** affordance — create `<name>.md` with the `kanban-plugin` frontmatter +
default columns (e.g. **To Do / Doing / Done**) via `writeTextFile`, then open it as a
`kanban` panel — so a user can start a board from nothing rather than only opening an
externally-created file. _(A plain `.md` opened in #145 also becomes a board on its first
edit — the first write adds the structure.)_

Out of scope: cross-tab / cross-panel card moves; any AI tie-in (the markdown file already
makes that possible externally).

**Subtasks**

1. [x] Card mutations on the parsed `Board`: add / edit title+body / delete / reorder within
   a column / toggle checked, then re-`serializeBoard` and `writeTextFile` (debounced).
2. [x] Card drag-and-drop **between** columns (nested dnd-kit sortable context) = move
   status; reorder within a column by drag too.
3. [x] Column mutations: add / rename / reorder / delete (delete confirm-gated per #103).
4. [x] Debounced write-back (the #94 pattern) + reconcile with the #145 hot-reload poll
   (don't reload our own write; do reload genuine external edits); preserve frontmatter +
   settings block.
5. [x] Card body editor = a markdown textarea (no structured field controls); the live
   render (#145) shows the formatting.
6. [x] "New Kanban board" creation affordance (frontmatter + default To Do/Doing/Done)
   writing a fresh `.md` and opening it.
7. [x] Verify editing + DnD in the main Canvas view and a detached canvas window (#84).
   _(Shared code path; detached-window runtime is best-effort per #84/#105 — see report.)_

**Acceptance criteria**

- [x] The user can add/edit/delete/reorder cards and add/rename/reorder/delete columns
  entirely in the UI, and can drag a card between columns to change its status — never
  editing markdown by hand.
- [x] A card's content is edited as freeform markdown (title + body); there are **no**
  structured field controls (no due-date picker).
- [x] Every change is written back to the `.md` (debounced) preserving the frontmatter +
  `%% kanban:settings %%` block; an external edit to the file still hot-reloads, and the
  panel's own writes don't cause a flicker / echo-reload.
- [x] A new board can be created from nothing (default columns) and immediately edited.
- [x] Editing + drag-and-drop work in the main Canvas view and a detached canvas window
  (#84). _(Detached-window runtime behavior is best-effort per the #84/#105 precedent — no
  GUI in the dev env.)_
- [x] `npm run build`, `npm run lint`, `npm test`, and `cargo test` pass.

**Notes**

- Card DnD is a nested dnd-kit context inside the panel (the #43/#47/#58 nested-context
  precedent); only one view mounts at a time, so it won't clash with the app-level Canvas
  drag.
- The write loop reuses #141's `writeTextFile`; the only new persistence is the `.md`
  itself (the panel ref lives in `overview_panels` from #145).

**Implementation report**

Frontend-only (the #141 `writeTextFile` backend already shipped). **Pure ops**
(`kanbanOps.ts`): immutable `addCard` / `updateCard` / `deleteCard` / `toggleCard` /
`moveCard` (one op for reorder-within + move-between, arrayMove semantics, out-of-range →
no-op) + `addColumn` / `renameColumn` / `deleteColumn` / `moveColumn` + `defaultBoard()`
(To Do/Doing/Done) + `newCard()` — 17 unit tests (`kanbanOps.test.ts`). **Editor**
(rewrote `KanbanPanel.tsx`): the read-only #145 board became editable — each card has a
checkbox (toggle done), an inline title input + a markdown-textarea body editor (freeform,
**no** structured fields; the live #145 react-markdown render shows formatting in view
mode), and edit/delete buttons; a per-column "+ Add card"; column headers rename inline,
reorder via ◀/▶ buttons, and delete (× → confirm-gated per the #103 `confirmDestructive`
setting when the lane has cards); a trailing "+ Add column". **Card DnD** is a **nested**
dnd-kit `DndContext` (PointerSensor 4px, `closestCorners`) — each card a `useSortable`
(dragged by a grip handle only, so the textarea/buttons stay usable), each column a
`useDroppable`; `onDragEnd` parses `card:col:idx` / `column:col` and calls `moveCard`
(reorder within or move between lanes = status change). **Write-back**: every mutation
updates the in-memory `Board` and debounces (`SAVE_DEBOUNCE_MS` 600, the #94 pattern) a
`serializeBoard` → `writeTextFile`, preserving frontmatter + the settings block (#141). The
#145 hot-reload poll is reconciled via a `dirty` ref (skip reload while there are unsaved
edits) + a `lastSynced` raw-string compare (our own write updates `lastSynced`, so it never
echo-reloads; a genuine external change differs → reload), with a flush-on-unmount/
file-change. **New board**: a store `createKanbanBoard(repo, name)` writes `<name>.md` with
`defaultBoard()` then opens it as a `kanban` panel; surfaced as a "New Kanban board" repo
**Views** menu entry with an inline name input. **Detached window (#84):** `KanbanPanel`
renders through the shared `CanvasSurface` and uses global read/write IPC, so editing works
in both windows (they reconcile via disk + the poll) — **runtime-unverified** in a real
detached window (no GUI here, per the #84/#105 precedent). All gates pass: `npm test`
(179), `npm run build`, `npm run lint`, `prettier --check`, `cargo test` (71, unchanged).
Completes the Kanban board feature (#141–#143). _(Runtime DnD/board rendering isn't
unit-testable; the pure ops + parse/serialize + wiring are covered.)_

---

### 144. [x] Canvas panel — make the whole header bar a drag handle (not just the grip)

**Status:** Done
**Depends on:** none · _(adjusts the #135 Canvas panel-move drag source; mirrors the #70
Overview whole-titlebar pattern; the #90 `FileSwitcher` + the #126/#86 header buttons are
the click-not-drag exceptions — all shipped)_
**Created:** 2026-06-24

**Description**

In **Overview**, a panel's **entire title bar** is the drag handle (#70) — you can grab
anywhere on the header to reorder, and only the action buttons are excepted (their
`.actions` group stops `pointerdown`). In **Canvas**, by contrast, #135 made *only* the
small `GripVertical` button draggable (the `useDraggable` listeners live on the grip
alone), so the user has to precisely grab the little dots to move a panel.

Make the **whole Canvas panel header bar draggable**, mirroring #70, so grabbing any
non-interactive part of the bar starts a panel move (reorder/reposition via the existing
`move-leaf` flow).

**Exact change (in `CanvasSurface.tsx` `LeafPanel`):**

- Move the move-drag wiring (`setDragRef` ref + `{...dragAttributes}` `{...dragListeners}`,
  id `move:<leaf.id>`, data `{kind:"move-leaf"}`) from the grip `<button>` onto the whole
  `<header className={styles.panelHeader}>` — exactly as Overview attaches
  `{...attributes} {...listeners}` to its `<header>`.
- **Keep the `GripVertical` icon as a non-interactive visual hint** (per the user): demote
  the grip from a `<button>`/drag-source to an `aria-hidden` span (like Overview's
  `.dragHandle`) — purely a "this bar is draggable" cue; the whole bar drags regardless.
- **Exceptions (stay clickable, never start a drag) — all interactive controls:** wrap the
  right-side `panelActions` group (Fork #126, Copy-resume #86, Close) with
  `onPointerDown={(e) => e.stopPropagation()}`, **and** do the same for the mid-bar
  **`FileSwitcher`** filename (#90, file panels) so clicking it still opens the file picker
  rather than dragging. (Mirrors Overview's `.actions` `stopPropagation`.)
- Show a grab/move cursor over the draggable header area (default cursor on the excepted
  controls).

The drag mechanics are unchanged: the existing 4px `PointerSensor` activation constraint
keeps a plain click (which selects the panel via the panel's `onPointerDown` →
`setActiveLeaf`) from starting a drag; the move is still computed atomically on drop
(`onDragEnd` → `moveCanvasLeaf`, #135), so no terminal churn. It applies to **both** the
main Canvas view **and** a **detached canvas window** (#84) automatically — same
`LeafPanel`/`CanvasSurface` component, and the #135 drop handling is already wired in both.

Scope: the Canvas `LeafPanel` header drag affordance only. No change to the move/drop logic
(#135), the edge drop-zones, or Overview.

**Subtasks**

1. [x] Move the `useDraggable` ref + attributes + listeners from the grip button onto the
   `panelHeader` `<header>`; demote the `GripVertical` grip to an `aria-hidden` visual-hint
   span.
2. [x] Add `onPointerDown` `stopPropagation` to the `panelActions` group and to the
   `FileSwitcher` so fork / copy-resume / close / filename-switch all stay clickable.
3. [x] Add a grab/move cursor on the draggable header area (default on the excepted
   controls) in `Canvas.module.css`.
4. [x] Confirm a plain header click still just selects the panel (4px constraint) and
   dropping on another panel's edge still moves it (#135 unchanged).

**Acceptance criteria**

- [x] In Canvas, grabbing **anywhere on a panel's header bar** (not just the grip dots) and
  dragging starts a panel move/reorder, in both the main view and a detached canvas window
  (#84). _(Detached-window runtime behavior best-effort per the #84/#105 precedent.)_
- [x] The Fork (#126), Copy-resume (#86), and Close buttons, and the file-panel filename
  switcher (#90), all still respond to clicks and never start a drag.
- [x] The grip icon remains as a non-interactive visual hint; a plain header click still
  selects the panel; the #135 move-on-drop behavior (no terminal churn) is unchanged.
- [x] `npm run build`, `npm run lint`, and `npm test` pass.

**Notes**

- Direct port of the Overview #70 pattern (`<header>` carries the drag listeners; `.actions`
  `stopPropagation`; grip is a visual hint) to the Canvas `LeafPanel` header — bringing the
  two views to drag parity.
- Independent of the unmerged #139–#140 and of the Kanban chain (#141–#143).

**Implementation report**

Direct port of the Overview #70 whole-header-drag pattern to the Canvas `LeafPanel`
(`CanvasSurface.tsx`), as specified. The existing #135 `useDraggable` (`move:<leaf.id>`,
`{kind:"move-leaf"}`) wiring (`setDragRef` ref + `dragAttributes`/`dragListeners`) moved
**from the grip `<button>` onto the `<header className={styles.panelHeader}>`** — so
grabbing anywhere on the bar starts the move. The grip became a **non-interactive**
`aria-hidden` `<span>` (the `GripVertical` icon kept purely as a "draggable" hint; no longer
a button/drag-source). The exceptions stay clickable + never drag: the right-side
`panelActions` group (Fork #126 / Copy-resume #86 / Close) and the mid-bar `FileSwitcher`
(#90, wrapped in a `panelSwitcher` span) both get `onPointerDown={(e) =>
e.stopPropagation()}`. CSS (`Canvas.module.css`): `.panelHeader` gains `cursor: grab` +
`touch-action: none` (+ `:active` → grabbing) and brightens the grip on hover
(`.panelHeader:hover .panelGrip`); the grip lost its own button/cursor styling; the
excepted `.panelActions` + new `.panelSwitcher` carry `cursor: default`. The move/drop
mechanics are unchanged (#135): the 4px `PointerSensor` keeps a plain click selecting the
panel (root `onPointerDown` → `setActiveLeaf`), and the move is still computed atomically on
drop (`onDragEnd` → `moveCanvasLeaf`), so no terminal churn. Applies to the main Canvas view
**and** a detached window (#84) automatically — same `LeafPanel`; **runtime-unverified** in
a real detached window (no GUI here, per #84/#105). Scope held to the header affordance — no
change to #135 move/drop logic, the edge drop-zones, or Overview. All gates pass: `npm run
build`, `npm run lint`, `npm test` (179). _(Runtime drag/hit-testing isn't unit-testable;
the wiring mirrors the proven Overview #70 pattern.)_

---

### 142. [x] Opening a Canvas template into a sole empty canvas replaces it instead of leaving an empty tab behind

**Status:** Done
**Depends on:** none · _(builds on #117 templates + #118 `useTemplate`/`instantiateTemplate` — both shipped)_
**Created:** 2026-06-24

**Description**

Creating a new Canvas tab **from a template** (#118, the **▾ Templates → "New tab from template…"** flow → `TemplateUseModal` → store `useTemplate`) currently **always appends** a tab: `const next = [...get().canvases, tab]` in `src/store.ts` (`useTemplate`, ~`store.ts:1690`). On a fresh app the default state is a single empty `Canvas 1` (`layout: null`), so opening a template leaves that **untouched empty tab dangling** beside the new one — clutter the user never created anything in.

Fix: when there is **exactly one canvas and it is empty**, the template **replaces it in place** (the sole empty tab becomes the template tab) rather than appending. In every other case — **2+ canvases**, or the single canvas **has panels** — keep today's append behavior and **remove nothing**.

Definitions / decisions (confirmed with the user):

- **"Empty"** = no panels, matching the existing `requestCloseCanvas` test (#137): `collectLeaves(canvas.layout).length === 0` (in practice `layout === null`). Reuse that exact notion — don't invent a second one.
- **Trigger is the sole-canvas case only:** replace **only** when `canvases.length === 1` **and** that one canvas is empty. With 2+ tabs, always append (even if the active tab happens to be empty). This is the literal "there is only an empty canvas at the moment" reading.
- **Name:** the replacing tab takes the **template's name** (as the appended tab does today); the old "Canvas 1" name is discarded.
- Everything else about `useTemplate` is unchanged: it switches to `view: "canvas"`, sets `activeCanvasId` to the new tab, pushes the `recents` entry + the "Opened template" toast, persists via `ipc.setCanvases`, and kicks off the same best-effort async `resolveTemplateBlock` for each pending leaf.

**Subtasks**

1. [x] In `store.ts` `useTemplate`, compute whether the sole canvas is empty (`canvases.length === 1 && collectLeaves(canvases[0].layout).length === 0`) and build `next` as `[tab]` (replace) in that case, else `[...canvases, tab]` (append). Keep the existing `activeCanvasId`/`view`/persist/toast/recents/resolve logic intact.
2. [x] Update the existing `useTemplate` unit test (`store.test.ts:596`) — its `beforeEach` starts with a single empty `canvas-1`, so it now expects a **replacement** (`canvases.length === 1`, the lone tab named after the template), not `before + 1`.
3. [x] Add unit tests for the append-unchanged cases: (a) 2+ canvases present → template appends, nothing removed; (b) one canvas that **has** panels → template appends, the existing tab survives.

**Acceptance criteria**

- [x] Fresh app (one empty `Canvas 1`): opening a template shows exactly **one** tab, named after the template, active, in Canvas view — no leftover empty tab.
- [x] With 2+ canvases (even when the active one is empty), opening a template **adds** a tab and removes none.
- [x] With a single canvas that has panels, opening a template **adds** a tab and the existing one survives.
- [x] The replacing tab carries the **template's** name; pending blocks still resolve exactly as before.
- [x] `npm test`, `npm run build` (type-check), and `npm run lint` pass.

**Notes**

- Scope is **template instantiation only** (`useTemplate`); the plain "+" new-blank-canvas button (`addCanvas`) is untouched — it intentionally creates an empty tab.
- Detached-window edge (#84): a sole empty canvas being detached is implausible (you'd have torn off a blank canvas as your only tab); not specially handled — just follow the existing `setCanvases` persist/broadcast path.

**Implementation report**

Frontend-only, exactly the recommended approach. In `store.ts` `useTemplate`, after
instantiating the tab, compute `soleEmpty = canvases.length === 1 &&
collectLeaves(canvases[0]?.layout ?? null).length === 0` (reusing the existing
`collectLeaves` import + the #137 "empty = zero leaves" notion; `collectLeaves(null)`
returns `[]`, so a fresh app's default `layout: null` "Canvas 1" reads as empty) and build
`next = soleEmpty ? [tab] : [...canvases, tab]`. The `?.layout ?? null` guards
`noUncheckedIndexedAccess` (TS doesn't narrow `canvases[0]` from the length check). Every
other branch of `useTemplate` is untouched — it still sets `activeCanvasId` to the new tab,
`view: "canvas"`, persists via `ipc.setCanvases`, pushes the recents entry + "Opened
template" toast, and kicks off `resolveTemplateBlock` for each pending leaf. Tests
(`store.test.ts`): rewrote the existing case to expect a **replacement** (1 canvas, named
after the template, active — the `beforeEach` seeds a sole empty `canvas-1`) and added two
append-unchanged cases — (a) 2+ canvases (both empty) → 3 tabs, `c1`/`c2` survive; (b) a
sole canvas **with** panels (a `pendingTab` layout) → 2 tabs, `c1` survives. All gates
pass: `npm test` (152), `npm run build` (type-check), `npm run lint`, `prettier --check`.
No backend change (the `+`/`addCanvas` path is untouched; detached-window edge unhandled
per the task's note).

---

### 146. [x] Canvas panel — truncate an overflowing title so the header buttons stay visible

**Status:** Done
**Depends on:** #144 · _(builds on the #144-restructured Canvas `LeafPanel` header — both
touch `CanvasSurface.tsx` + `Canvas.module.css`; #144 is shipped, so this is immediately
runnable)_
**Created:** 2026-06-24

**Description**

In **Canvas** mode, a long agent/panel title (e.g. an auto-name like `/loop 5 minutes Do
the following steps in order: 1. **Fetch latest chan…`) **overflows its title area and
renders behind the header action buttons** (Fork #126 / Copy-resume #86 / Close), so the
user can't see or read the buttons (per the user's screenshot).

**Root cause (in `Canvas.module.css`):** the header (`.panelHeader`) is a `space-between`
flex of `.panelTitleBlock` ⟷ `.panelActions`, but —

- `.panelTitle` has `flex-shrink: 0`, so despite its already-declared
  `text-overflow: ellipsis; white-space: nowrap; overflow: hidden`, the span never shrinks
  below its full text width and the **ellipsis never triggers**;
- `.panelTitleBlock` has `min-width: 0` but **no `flex: 1` and no `overflow: hidden`**, so
  the un-shrunk title spills rightward over the actions.

`.panelActions` is already `flex-shrink: 0`, so the buttons hold the right edge — the title
text just renders *under* them.

**Fix (truncate with ellipsis + tooltip — chosen for UX: buttons always fully visible, the
title degrades gracefully):**

- `.panelTitleBlock`: add `flex: 1; overflow: hidden;` (keep `min-width: 0`) so it takes the
  free space and clips rather than pushing the actions.
- `.panelTitle`: **drop `flex-shrink: 0`** (allow the default shrink) and add `min-width: 0`
  so the ellipsis engages.
- Keep `.panelActions` `flex-shrink: 0` (already) so the buttons never shrink/clip.
- Add a hover **tooltip** (`title={titleText}`) on the title span in `CanvasSurface.tsx` so
  the full title is still readable when truncated, and ensure the file-panel `FileSwitcher`
  (#90) name (which uses `nameClassName={styles.panelTitle}`) truncates too — not just plain
  agent titles.

This brings the Canvas header to parity with how the sidebar (#111) and Overview titles
already truncate. It applies to **all** panel kinds (agent / file / diff / terminal) and to
both the main Canvas view and a detached canvas window (#84) — same component.

Note: #144 already made the **whole header bar** a drag handle, so the same `<header>` now
carries both the dnd listeners and these flex/overflow rules — confirm the truncation
doesn't shrink the drag hit-area (it shouldn't; it only governs the title child's width).

Scope: the Canvas `LeafPanel` header title truncation + tooltip only. No change to the
buttons' behavior, the drag affordance (#135/#144), or other views.

**Subtasks**

1. [x] `Canvas.module.css`: `.panelTitleBlock` → add `flex: 1; overflow: hidden;`;
   `.panelTitle` → remove `flex-shrink: 0`, add `min-width: 0`.
2. [x] `CanvasSurface.tsx`: add `title={titleText}` to the `.panelTitle` span (hover tooltip
   for the full title); confirm the file-panel `FileSwitcher` name truncates (its
   `nameClassName` is `.panelTitle`).
3. [x] Verify a very long agent auto-name truncates with `…` before the buttons, the
   Fork/Copy/Close buttons are fully visible + clickable, and the meta/badges
   (worktree/fork) still render.

**Acceptance criteria**

- [x] A long Canvas panel title truncates with an ellipsis and never renders behind the
  header buttons; the Fork (#126), Copy-resume (#86), and Close buttons are always fully
  visible and clickable.
- [x] Hovering the truncated title shows the full title (tooltip).
- [x] Truncation applies across agent / file / diff / terminal panels and in a detached
  canvas window (#84). _(Runtime detached-window check best-effort per the #84/#105
  precedent.)_
- [x] `npm run build`, `npm run lint`, and `npm test` pass.

**Notes**

- The `flex-shrink: 0` on `.panelTitle` is the literal bug — it defeats the ellipsis already
  declared on the same rule.
- Builds directly on the #144 header restructure (whole-bar drag); independent of the Kanban
  work (#141 / #143 / #145) and the unmerged #139–#140.

**Implementation report**

Exactly the recommended fix (CSS + a tooltip, no logic change). `Canvas.module.css`:
`.panelTitleBlock` gained `flex: 1` + `overflow: hidden` (keeping `min-width: 0`) so it
takes the free space and clips instead of pushing the actions; `.panelTitle` **dropped
`flex-shrink: 0`** and gained `min-width: 0` so the already-declared
`overflow/text-overflow:ellipsis/white-space:nowrap` finally engages. `.panelActions` keeps
`flex-shrink: 0` (unchanged), so the Fork/Copy-resume/Close buttons are always fully
visible. `CanvasSurface.tsx`: the plain `.panelTitle` span gained `title={titleText}` (hover
tooltip for the full title). The file-panel **FileSwitcher** name truncates too **with no
FileSwitcher change** — its `nameClassName` is `.panelTitle` and its `.root`/`.trigger`
already carry `min-width: 0`, so the new `.panelTitle min-width:0` lets the name ellipsis
(its trigger already has a `title` tooltip). Applies to all panel kinds and to a detached
window (#84, same component) — **runtime-unverified** in a real detached window (no GUI, per
#84/#105); the #144 whole-bar drag hit-area is unaffected (the rules only govern the title
child's width). All gates pass: `npm run build`, `npm run lint`, `npm test` (179),
`prettier --check`. _(Visual truncation isn't unit-testable; the fix is the proven sidebar
#111 / Overview ellipsis pattern.)_

---

### 147. [x] Kanban panel — Board/Raw toggle + auto-fallback to raw markdown

**Status:** Done
**Depends on:** #145 · _(extends the `KanbanPanel` from #145/#143; mirrors the #73 FileViewer
Rendered/Raw toggle and reuses its read-only raw `<pre>` style #44 — all shipped, so
immediately runnable)_
**Created:** 2026-06-24

**Description**

The Kanban panel (`KanbanPanel.tsx` — the #145 content type + #143 editor) **always** renders
the parsed board and only shows an error on a **read** failure; it has **no raw view**. Give
it a **Board ⟷ Raw** view toggle, mirroring the FileViewer's #73 Rendered/Raw control, so the
user can see the underlying markdown — and **auto-fall-back to Raw when the file has no board
structure**.

Two behaviors (per the user):

1. **Manual toggle (mirror #73).** Add a thin toolbar to the panel (it has no header today)
   with a two-segment **Board / Raw** control — the #73 pattern: a
   `segmented`/`segment`/`segmentActive` group, `Eye` (Board) / `Code2` (Raw) icons,
   `aria-pressed`, a local `showRaw` state **reset per file** (`useEffect(() => …, [file])`).
   **Board** = today's editable board (#143). **Raw** = the file's raw markdown shown
   **read-only** as monospace text, reusing the FileViewer raw style
   (`<pre className={styles.raw}>{raw}</pre>`) — _"clicking Raw just displays the file for
   now"_, so **no editing in Raw**.

2. **Auto-fallback to Raw.** `parseBoard` is lenient — arbitrary markdown with no `## headings`
   parses to a **zero-column** board. When the loaded file has **no columns** (nothing
   board-like to render), the panel **opens in Raw** instead of an empty board. The manual
   toggle still works (the user can switch to Board to start adding columns). Apply this
   default **once per file on first load** (from column presence) — a later hot-reload poll
   must **not** override the user's current toggle choice.

Implementation notes:

- Keep the raw file text in render state (a `raw` state set in `load`) so Raw mode can display
  it; the existing `lastSynced`/poll already track the latest content, so Raw stays current on
  hot-reload (read-only → no dirty conflict).
- Raw is read-only, so none of the #143 edit/write machinery runs in Raw mode; switching back
  to Board resumes editing.
- The toggle is **not persisted** (component-local, like #73): default Board for a real board,
  Raw for a non-board file, reset per file.
- Add a `.raw` style to `KanbanPanel.module.css` mirroring the FileViewer's (monospace, scroll,
  wrap), or share the token-based styling.

Applies to every surface that mounts `KanbanPanel` (Canvas panel, Overview column) and a
detached canvas window (#84) — same component. No backend change.

Scope: the in-panel Board/Raw toggle + auto-fallback + read-only raw display. Out of scope:
editing in Raw mode (the _"for now"_), persisting the toggle choice, and any new file
read/write.

**Subtasks**

1. [x] Add a thin toolbar to `KanbanPanel` with the #73 two-segment **Board / Raw** toggle
   (`Eye`/`Code2`, `aria-pressed`), `showRaw` local state reset per file.
2. [x] Keep the raw file text in state (set in `load`); render Raw as a read-only
   `<pre className={styles.raw}>{raw}</pre>` (FileViewer raw style); add the `.raw` style to
   `KanbanPanel.module.css`.
3. [x] Auto-default to Raw on first load of a file with **no columns** (zero `## headings`);
   don't override the user's toggle on subsequent hot-reload polls.
4. [x] Verify Board mode still edits/saves (#143) and Raw mode is read-only; the toggle +
   auto-fallback work in Canvas + Overview (+ a detached window #84).

**Acceptance criteria**

- [x] The Kanban panel has a **Board / Raw** toggle (mirroring #73); Board shows the editable
  board, Raw shows the file's raw markdown read-only.
- [x] A markdown file **with** board structure opens in Board; a file **without** any columns
  auto-opens in Raw; the user can still toggle either way.
- [x] Switching to Raw doesn't edit/write the file; switching back to Board resumes #143
  editing; an external edit still hot-reloads in both modes.
- [x] Works across Canvas + Overview panels and a detached window (#84). _(Detached-window
  runtime check best-effort per #84/#105.)_
- [x] `npm run build`, `npm run lint`, and `npm test` pass.

**Notes**

- Direct mirror of the #73 FileViewer Rendered/Raw toggle, applied to the Kanban board; Raw
  reuses the file viewer's read-only raw display.
- Independent of #146 (Canvas header truncation — different file) and the unmerged #139–#140.

**Implementation report**

Frontend-only, extending `KanbanPanel.tsx` (no backend change). Added a thin **toolbar** with
the #73 two-segment **Board / Raw** toggle (`Eye`/`Code2`, `aria-pressed`, the
`segmented`/`segment`/`segmentActive` pattern) — wrapped the panel in a `.panel` flex column
(toolbar + content). A new `raw` state holds the last-read file text (set in `load`, so it
stays current on hot-reload), and a local `showRaw` state (reset per file in the
file-change effect) drives the view: **Board** = the #143 editable board (the existing
`DndContext`), **Raw** = a read-only `<pre className={styles.raw}>{raw}</pre>` reusing the
FileViewer raw style (monospace, scroll, `pre-wrap`). **Auto-fallback (#147):** a `didInitView`
ref applies the per-file default exactly once on first load — `setShowRaw(parsed.columns.length
=== 0)`, so a structure-less `.md` opens in Raw and a real board opens in Board; subsequent
hot-reload polls never override the user's toggle. Raw is read-only — none of the #143
edit/write machinery runs there (no `dirty`/write on raw); switching back to Board resumes
editing, and an external edit still hot-reloads in both modes (the poll updates `raw` + the
board). `.board` changed from `height:100%` to `flex:1; min-height:0` to fill the flex column
under the toolbar. CSS: `.panel`/`.toolbar`/`.segmented`/`.segment`/`.segmentActive`/`.raw`
added to `KanbanPanel.module.css`. Applies to Canvas + Overview + a detached window (#84, same
component) — **runtime-unverified** in a real detached window (no GUI, per #84/#105). All gates
pass: `npm run build`, `npm run lint`, `npm test` (179), `prettier --check`. _(The toggle is
component-local + not persisted, like #73; visual rendering isn't unit-testable.)_

---

### 148. [x] Editable, auto-saving raw text editor (FileViewer raw + plain-text files)

**Status:** Done
**Depends on:** none · _(builds on the #141 `write_text_file`/`writeTextFile`, the #73/#44
FileViewer raw view, and the #143 KanbanPanel debounced-write + dirty-reconcile pattern — all
shipped)_
**Created:** 2026-06-24

**Description**

Let the user **edit files directly in the raw text view** — type into the raw markdown / plain
text and **auto-save with no save button** (a debounced write a short time after they stop
typing). This task delivers the **shared editor + the FileViewer raw view**; the Kanban raw
editor is #149.

Today the FileViewer raw branch is read-only — `<pre className={styles.raw}>{content}</pre>`
(covers the markdown **Raw** toggle #73, plain-text files, and the large-file fallback).
Replace it with an editable monospace **`<textarea>`** for editable text, wired to a debounced
auto-save.

**Editor (per the user): a plain `<textarea>`** — monospace (JetBrains Mono), full panel
height, soft-wrap matching the raw view, spellcheck off; no new dependency, no syntax
highlighting while editing.

**Shared `useAutoSaveFile(repoPath, file, active)` hook** — extract the file-I/O + autosave +
reconcile machinery the KanbanPanel (#143) already has into a reusable hook so #149 (and future
formats) reuse it. It:

- reads via `readTextFile`, hot-reload **polls** while visible (the #44/#143 pattern);
- holds an editable **buffer** (the source of truth while editing) + a `setText`;
- **debounced write-back** via `writeTextFile` (~600ms, the app's #94/#143 convention) — **no
  save button**;
- **reconciles edits vs the poll** (the researched pitfall): while the buffer is **dirty / the
  textarea is focused**, the poll must **not** overwrite it (or keystrokes typed after the last
  save are lost) — pause hot-reload while dirty, don't echo-reload the panel's own writes
  (compare against last-synced), and **flush the pending write on blur + on unmount / file
  change** (mirrors #143);
- **last-write-wins** while editing (consistent with the #143 Kanban editor; a concurrent
  external edit during an edit session is overwritten — noted as a tradeoff);
- handles **IME composition** (`compositionstart`/`compositionend`) so a debounced save doesn't
  fire mid-composition (CJK input);
- exposes a **save status** (`"idle" | "saving" | "saved" | "error"`).

**Subtle inline save status (per the user):** a quiet "Saving… / Saved" hint in the FileViewer
toolbar (no toast, no button).

**Editable when:** the file is shown as raw text, is an editable text type, and is not too
large — i.e. markdown in **Raw** mode (`mode === "markdown" && showRaw`) or a plain-text file
(`mode === "other"`), and `!tooLarge`. **Out of scope:** the rendered markdown view, the
**code** view (Prism-highlighted — stays read-only for now), **large** files (kept read-only
for perf), the Kanban raw editor (#149), undo/redo beyond the native textarea, and syntax
highlighting.

**Subtasks**

1. [x] Add a shared `useAutoSaveFile(repoPath, file, active)` hook (extract/generalize the #143
   KanbanPanel read+poll+debounced-write+dirty-reconcile): editable buffer, debounced
   `writeTextFile`, pause-poll-while-dirty, flush-on-blur/unmount, IME-safe, save-status.
2. [x] In FileViewer, replace the read-only raw `<pre>` with an editable monospace `<textarea>`
   bound to the hook — only for `(markdown && showRaw) || other`, and `!tooLarge`; keep
   rendered markdown, the Prism code view, and large files read-only.
3. [x] Add the subtle "Saving… / Saved" status to the FileViewer toolbar (next to the #73
   toggle).
4. [x] Style the editor (`FileViewer.module.css`): monospace, full height, soft-wrap, scroll,
   on-token colors.

**Acceptance criteria**

- [x] In a FileViewer showing markdown **Raw** or a plain-text file, the user can type directly
  and it **auto-saves** to disk (debounced, no save button); the file on disk reflects the
  edits.
- [x] Typing continuously doesn't lose keystrokes to the hot-reload poll (the buffer wins while
  dirty/focused); an external edit while **not** editing still hot-reloads.
- [x] A subtle "Saving… / Saved" status shows; the rendered markdown view, the code (Prism)
  view, and large files remain read-only.
- [x] Pending edits flush on blur and on unmount / switching files; `npm run build`,
  `npm run lint`, and `npm test` pass.

**Notes**

- Best-practice basis: debounce ~600ms (app convention), flush on blur/unmount, **pause
  hot-reload while dirty** to avoid the re-render-clobbers-keystrokes pitfall, IME-composition
  guard, last-write-wins (mirrors #143). Plain `<textarea>` over CodeMirror per the user
  (minimal deps).
- The hook is the reuse point for #149 (Kanban raw) and any future editable format.
- Independent of #146/#147 (different file) and the unmerged #139–#140.

**Implementation report**

Built the shared **`useAutoSaveFile(repoPath, file, active)`** hook (`src/useAutoSaveFile.ts`,
a top-level hook like `useKeyboardNav`) generalizing the #143 KanbanPanel machinery: reads via
`readTextFile`, hot-reload-**polls** while visible, holds an editable **buffer** (`text` +
`setText`), **debounced** (`SAVE_DEBOUNCE_MS` 600) `writeTextFile` (no save button), and
**reconciles** edits vs the poll — `load` early-returns while `dirty` **or** `focused` so a poll
never clobbers in-progress typing, never echo-reloads our own write (`lastSynced` compare),
**flushes** the pending write on **blur** (`onBlur`) and on **unmount / file change** (the reset
effect's cleanup), is **IME-safe** (a `composing` ref gates the debounced save; `onCompositionEnd`
re-arms it), is **last-write-wins** (mirrors #143), and exposes a **`status`**
(`idle|saving|saved|error`). **FileViewer** now reads through the hook (replacing its own
content/load/poll) and, for the **editable** cases — markdown in **Raw** mode (`mode==="markdown"
&& showRaw`) **or** a plain-text file (`mode==="text"`), and `!tooLarge` — renders an editable
monospace **`<textarea>`** (`.editor`: full height, `pre-wrap` soft-wrap #80, JetBrains Mono,
spellcheck off) wired to `setText`/focus/blur/composition; rendered markdown, the Prism **code**
view, and **large** files stay read-only (the `.raw` `<pre>` / `CodeBlock`). A subtle
**"Saving… / Saved"** status (`.status`, `role="status"`, `margin-right:auto` so the #73 toggle
stays right) shows in the toolbar (now also shown for editable plain-text files). All gates pass:
`npm run build`, `npm run lint`, `npm test` (179), `prettier --check`. The hook is the reuse point
for #149. _(The timer/poll/IME reconcile is runtime-only — not unit-tested, consistent with the
#143 panel I/O precedent; it mirrors the shipped #143 logic.)_

---

### 149. [ ] Editable, auto-saving Kanban raw view

**Status:** Not started
**Depends on:** #147, #148 · _(#147 adds the Kanban Board/Raw toggle + read-only raw `<pre>`;
#148 provides the `useAutoSaveFile` hook + textarea editor — both prerequisites)_
**Created:** 2026-06-24

**Description**

#147 gives the Kanban panel a **Board / Raw** toggle whose Raw view is a **read-only** `<pre>`
of the board's markdown. Make that **raw view editable**, reusing #148's `useAutoSaveFile` hook
+ `<textarea>` editor: type directly in the raw board markdown and it **auto-saves** (debounced,
no save button, subtle status) — the "raw editor for Kanban" the user asked for.

The wrinkle vs a plain file: the KanbanPanel edits the **same file** two ways — the Board view
via the #143 board ops, the Raw view via direct text. Both must stay consistent and share **one**
autosave path so they don't fight:

- **Unify the buffer.** The raw textarea and the parsed board both derive from one underlying
  file buffer + one dirty/last-synced state (don't add a second, competing write loop). The
  simplest design: route both through #148's `useAutoSaveFile` — Board mode renders the parsed
  board and writes `serializeBoard(...)` into the buffer on each mutation; Raw mode binds the
  textarea to the buffer directly.
- **Mode switches round-trip.** Raw→Board re-parses the current buffer (`parseBoard`);
  Board→Raw shows the serialized buffer — no edit is lost crossing the toggle.
- Raw editing otherwise keeps #147's behavior (read-only becomes editable; the
  auto-fallback-to-raw for a non-board file now lets the user **author** that file as raw text —
  a natural way to start a board by hand).

**Subtasks**

1. [ ] Replace #147's read-only Kanban raw `<pre>` with #148's editable `<textarea>` bound to
   the shared autosave buffer.
2. [ ] Unify the panel's board-edit write path (#143) and the raw-edit path onto one buffer /
   dirty / last-synced state via `useAutoSaveFile` so they don't double-write or clobber.
3. [ ] Round-trip the toggle: Raw→Board re-parses the buffer, Board→Raw shows the serialized
   text; no edits lost.
4. [ ] Show the same subtle "Saving… / Saved" status; verify in Canvas + Overview + a detached
   window (#84).

**Acceptance criteria**

- [ ] In the Kanban panel's **Raw** view, the user can type directly in the board's markdown and
  it **auto-saves** (debounced, no save button, subtle status).
- [ ] Edits made in Raw appear in Board after switching (re-parsed), and vice-versa; no edit is
  lost across the toggle, and the Board #143 editing still works.
- [ ] Raw and Board edits share one write path — no double-write / echo-reload / clobber;
  external edits hot-reload when not editing.
- [ ] Works in Canvas + Overview (+ a detached window #84, best-effort per #84/#105);
  `npm run build`, `npm run lint`, and `npm test` pass.

**Notes**

- Builds on #147 (raw view) + #148 (shared editor/hook). The main work is **unifying** the
  Board (#143) and Raw write paths onto one buffer so the same file isn't edited by two
  competing loops.
- Independent of the unmerged #139–#140.

---

### 150. [ ] File viewer syntax highlighting — add Java + config formats (INI / .env / .properties), verify existing

**Status:** Not started
**Depends on:** none · _(extends the shipped #44 Prism setup — `prism.ts` / `fileType.ts` / the
#33 `--syn-*` token theme; touches different files than the open #148/#149 FileViewer-editor
tasks, so no conflict)_
**Created:** 2026-06-24

**Description**

The file viewer **already** has Prism syntax highlighting (#44): `src/components/FileViewer/prism.ts`
imports per-language grammars and `fileType.ts`'s `LANG_BY_EXT` maps extensions to Prism
languages, themed by the Catppuccin `--syn-*` tokens (#33) in `FileViewer.module.css`. **Already
highlighted today:** JSON/JSONC, YAML/YML, TOML, JavaScript, TypeScript, JSX/TSX, Rust, Python,
CSS/SCSS, XML/HTML/SVG/Vue (markup), Bash/sh/zsh. So the user's core ask (JSON, YAML, JS, config)
is mostly **present** — this task **fills the gaps** and **verifies** the existing highlighting
renders.

Keep it **minimal-package** (per the user): Prism is already a dependency; grammars are
**per-language imports** (~1–5 KB each), so we add only the few that are missing — **no new
library**, no autoloader, no bundling all of Prism.

**Add (per the user's selection — Java + config formats; JavaScript is already covered):**

1. **Java** — `import "prismjs/components/prism-java"` + `java: "java"` (`.java`) in `LANG_BY_EXT`.
2. **Config formats:**
   - **INI** — `prism-ini` + `ini` / `cfg` / `conf` → `"ini"`.
   - **.properties** — `prism-properties` + `properties` → `"properties"`.
   - **.env (dotenv)** — `.env` / `.env.*` are **dotfiles** (no extension — `fileExt` returns
     `""`), so add a small **filename** rule in `fileType.ts` mapping them to a `KEY=value`
     grammar (`"ini"` or `"properties"`) and routing to `"code"` mode.
3. **JavaScript** — already supported (`.js` → `javascript`, Prism core); **verify** it renders
   (the user wasn't sure highlighting works) — no new grammar.

**Theme the new token types.** The `.code` CSS covers a broad token set, but the added grammars
introduce token classes that may currently be **uncolored** (so highlighting would look flat):
INI/properties `.token.key` / `.token.section` / `.token.value`, and Java `.token.annotation`.
Add rules mapping those to the existing `--syn-*` palette so the new languages are **visibly**
highlighted (reuse `--syn-keyword` / `--syn-property` / `--syn-string` / etc. — no new colors).

**Verify existing (the user "hasn't checked").** Confirm the shipped highlighting actually
renders for representative files — open a `.json`, `.yaml`, and `.js` in the FileViewer code
view and check tokens are colored. **If** it's genuinely broken (not just missing languages),
fix that as part of this task; otherwise leave the existing path unchanged.

Out of scope: extension-less config files beyond `.env` (Dockerfile / Makefile / `.gitignore` —
the user declined), more code languages (Go / SQL / C/C++ / C# — declined), editing highlighted
code (the code view stays read-only, per #148), a new highlighting library, and the markdown /
raw render paths.

**Subtasks**

1. [ ] Verify the existing Prism highlighting renders (JSON / YAML / JS); only fix if genuinely
   broken.
2. [ ] Add `prism-java`, `prism-ini`, `prism-properties` imports to `prism.ts` (mind Prism
   grammar dependency order).
3. [ ] Extend `LANG_BY_EXT` in `fileType.ts`: `java→java`; `ini`/`cfg`/`conf→ini`;
   `properties→properties`. Add a filename rule so `.env` / `.env.*` map to a KEY=value grammar
   and route to `"code"`.
4. [ ] Add `.code` token-color rules for the new token types (INI/properties `key` / `section` /
   `value`, Java `annotation`) using the existing `--syn-*` tokens.
5. [ ] Update `fileType.test.ts`: `detectMode` / `prismLang` for `.java`, `.ini`, `.cfg`,
   `.properties`, `.env`.

**Acceptance criteria**

- [ ] `.java`, `.ini` / `.cfg` / `.conf`, `.properties`, and `.env` / `.env.*` files render with
  visible syntax highlighting in the FileViewer code view.
- [ ] The already-supported languages (JSON, YAML, JS, TS, Rust, Python, CSS, XML, TOML, Bash)
  still highlight (verified, unbroken).
- [ ] The new grammars are added as individual Prism imports only (no new dependency, no
  autoloader); the bundle stays minimal.
- [ ] `npm run build`, `npm run lint`, and `npm test` (incl. the `fileType.test.ts` additions)
  pass.

**Notes**

- The app already ships Prism (`prismjs ^1.30.0`) with a curated per-language import set and a
  Catppuccin `--syn-*` token theme — this task **extends** that set, it does not introduce a
  highlighter.
- `.env` needs **filename** detection (dotfiles have no extension in `fileExt`); mapped to an
  INI/properties KEY=value grammar.
- Contained to `prism.ts` / `fileType.ts` / `FileViewer.module.css` / `fileType.test.ts` — does
  **not** touch `FileViewer.tsx`, so no conflict with the open #148/#149 FileViewer-editor tasks.
- Independent of the unmerged #139–#140.

---

