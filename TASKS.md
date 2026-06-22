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
branch step's "+ add branch" (#124). `claude` is assumed on `PATH` (clear in-app error
if missing).

> The original design spec and interactive prototype (`HANDOFF.md`,
> `Conductor.dc.html`) are preserved in git history (commit `b02efd8`
> "System referances") if exact prototype details are ever needed.

---

## Implemented (completed tasks)

> The backlog has fully shipped (#1–#127).
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

Tasks **#1–#127 are all complete** — the backlog is fully implemented, with no open
tasks. See **Implemented (completed tasks)** above for the index and git history for
per-task detail. New work goes here as a fresh `### N.` entry in
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

### 128. [x] Replace the sidebar repo folder cube icon with a folder icon

**Status:** Done
**Owner:** _(unassigned)_
**Depends on:** none · _(a cosmetic swap on the already-shipped #115 cube marker; #120/#121 — the refining passes it builds on — are complete, so nothing open gates it)_
**Created:** 2026-06-22

**Description**

Each sidebar **repo header** currently shows a small repo-colored **cube** as its
identity marker — the Lucide **`Box`** icon added in **#115** (which replaced #113's
disclosure triangle). The user wants that **cube replaced with a folder icon**, since
the marker stands for a folder/repo. Swap the glyph from the cube to a **closed folder
(Lucide `Folder`)**, **keeping the existing per-repo color tint** (outline tinted to
the repo color, exactly as the cube is today) and everything else about the marker
unchanged.

This is a **purely visual** change — the marker stays a **static, non-interactive**
identity glyph (`aria-hidden`, no button/toggle), in the **same ~14px slot / ~12px
icon footprint** so row alignment with the agent activity dots (#95) and the compact
10px labels (#111) is preserved. The repo name still **filters Overview** on click
(#34/#68) and right-click still opens the context menu (#31/#54) — both untouched.

**Grounded in the code.** The marker is rendered in
`src/components/Sidebar/Sidebar.tsx` (~lines 751–757): a `<span className={styles.repoCube}>`
with `style={{ color: repoColor(repo, repoColors) }}` and `aria-hidden`, wrapping
`<Box size={12} strokeWidth={2} />`; `Box` is imported from `lucide-react` (~line 10).
The slot styling is `.repoCube` in `src/components/Sidebar/Sidebar.module.css` (~lines
205–213; a 14×14 flex box). The repo-color tint comes from `repoColor(repo, repoColors)`.

**Decisions captured from the user (interactive refinement):**
- **Icon:** the **closed folder** — Lucide **`Folder`** (not `FolderOpen` / `FolderGit`,
  not a CSS cube silhouette).
- **Tint:** **keep the per-repo color tint** — an **outline** folder drawn in the repo's
  assigned color (the current `color: repoColor(...)` approach), **not** a solid/filled
  fill and **not** a neutral untinted folder.

**Scope — in:** the single sidebar repo-header marker — swap `Box` → `Folder` (import +
JSX), keep the `repoColor` tint, and rename the now-misnamed `repoCube` class/comment to a
folder name (e.g. `repoFolder`) for clarity (CSS rule unchanged otherwise). **Out:**
Overview/Canvas (repo clusters read their color from a colored top band, not a cube — no
cube there to change), the activity-dot slot/alignment (#95), the compact-label sizing
(#111), repo color assignment (#35), and the context menu (#31/#54) — all untouched. No
backend, IPC, store, or persistence changes.

**Subtasks**

1. [x] In `Sidebar.tsx`, import `Folder` from `lucide-react` (replace the `Box`
   import) and render `<Folder size={12} strokeWidth={2} />` in place of `<Box .../>`,
   keeping the `style={{ color: repoColor(repo, repoColors) }}` tint and `aria-hidden`.
2. [x] Rename the `repoCube` class (TS + `Sidebar.module.css`) to a folder-appropriate
   name (e.g. `repoFolder`) and update the explanatory comment (it references the #115
   cube); the slot dimensions/alignment stay identical.
3. [x] Verify alignment with the agent activity dots and that the repo name still filters
   Overview / right-click still opens the menu (no behavior change).

**Acceptance criteria**

- [x] Every sidebar repo header shows a **closed folder (Lucide `Folder`)** instead of
  the cube, **tinted to the repo's color** (outline, not filled, not neutral).
- [x] The marker stays **static / non-interactive** (`aria-hidden`), in the **same slot**
  with **no layout shift** or alignment change versus the cube; no off-system colors;
  reduced-motion unaffected (no animation involved).
- [x] Clicking the repo name still filters Overview; right-click still opens the repo
  context menu — both unchanged.
- [x] No `Box`/cube reference remains for this marker (import, JSX, class name, comment).
- [x] `npm run build`, `npm run lint`, `npm test`, and `npm run format:check` pass (no
  Rust changes expected).

**Notes**

- This **supersedes the #115 cube** (which itself replaced the #113 triangle) as the
  repo-header identity marker; update the #115 line context if/when docs are next synced.
- Lucide also offers `FolderOpen` and `FolderGit`; the user explicitly chose the plain
  **closed `Folder`**. Filled/neutral variants were offered and **declined** — keep the
  repo-color **outline** tint.
- Files in play: `src/components/Sidebar/Sidebar.tsx` (~10 import, ~751–757 marker),
  `src/components/Sidebar/Sidebar.module.css` (`.repoCube` ~205–213).

---

### 129. [x] Fix: the Canvas Templates ▾ dropdown menu can't open (clipped by the tab strip's overflow)

**Status:** Done
**Owner:** _(unassigned)_
**Depends on:** none · _(a self-contained bug fix in the shipped Canvas Templates tab-strip menu #117/#118)_
**Created:** 2026-06-22

**Description**

The **Templates ▾ menu** in the Canvas tab strip (the `LayoutTemplate` + `ChevronDown`
button next to the tab **+**, from #117/#118) **does not open** — clicking it shows
**nothing at all**. Confirmed by the user (main app window; "nothing appears at all").
Without this menu the user can't reach **"New tab from template…"**, **"New template…"**,
or **"Manage templates…"**, so the entire Canvas Templates feature is unreachable from the
UI.

**Root cause (traced).** The toggle state logic is correct — clicking the button flips
`templatesOpen` and the `.templatesMenu` is rendered. The problem is **CSS clipping**:

- The dropdown `.templatesMenu` (`src/components/Canvas/Canvas.module.css` ~139–152) is
  `position: absolute; top: calc(100% + var(--space-4)); right: 0;` — it drops **below**
  the button.
- Its scroll/clip ancestor `.tabStrip` (`Canvas.module.css` ~20–30) is a fixed
  **`height: 34px`** row with **`overflow-x: auto`** (for horizontal scrolling of many
  tabs). Per the CSS Overflow spec, when `overflow-x` is set to a non-`visible` value the
  computed **`overflow-y` can no longer be `visible` — it becomes `auto`** too. So the tab
  strip **clips everything beyond its 34px height**, and the menu (which sits *below* the
  strip) is clipped away — it opens but is invisible/unreachable.

So this is a layout/overflow bug, not an event bug. (The open/close logic in
`CanvasTabs.tsx` ~157–175 — toggle, outside-`pointerdown`, Escape — is fine and must be
preserved.)

**Recommended fix.** Make the dropdown **escape the tab strip's overflow** rather than
weakening the strip's needed horizontal scroll. Two viable directions (implementer's
choice):

1. **(Recommended) Render the menu with fixed positioning** anchored to the button's
   `getBoundingClientRect()` (optionally via a portal to `document.body`), mirroring the
   **sidebar repo context menu** which already escapes clipping this way
   (`Sidebar.tsx:259` `style={{ left: menu.x, top: menu.y }}` + `position: fixed` in
   `Sidebar.module.css:537`). Fixed/portaled elements aren't clipped by an ancestor's
   `overflow`. Keep the existing outside-click/Escape/selection close behavior.
2. **Restructure the strip so it doesn't clip** — move the `overflow-x: auto` horizontal
   scroll onto an **inner tabs-only container** and let the outer `.tabStrip` (which holds
   the **+** and the Templates wrapper) be `overflow: visible`, so the absolutely-positioned
   menu is no longer inside a clipping box.

Either way: the menu must open **fully visible**, all three items must work, and
**horizontal scrolling of many tabs must still work**.

**Scope — in:** the Canvas tab-strip Templates menu visibility/positioning
(`CanvasTabs.tsx` + `Canvas.module.css`). **Out:** the menu's *contents* / the
template editor / manager / use flows (they work once the menu opens — #117/#118), tab
behavior, and detached canvas windows (#84 `CanvasWindow` renders no tab strip, so the
menu doesn't exist there).

**Subtasks**

1. [x] Reproduce and confirm the clip: the menu renders but is hidden by `.tabStrip`'s
   computed `overflow-y: auto`.
2. [x] Make the dropdown escape the clip (recommended: fixed/portaled positioning anchored
   to the button, per the sidebar context-menu precedent), **without** removing the tab
   strip's horizontal scroll.
3. [x] Preserve the existing open/close behavior: toggle on the button, close on
   outside-click (`pointerdown`), Escape, and item selection; keep `aria-haspopup` /
   `aria-expanded` / `role="menu"` / `role="menuitem"`.
4. [x] Verify all three items work (**New tab from template…** is still `disabled` when
   there are no templates), and that the menu is positioned sensibly relative to the button
   (right-aligned as today, on-screen).
5. [x] Verify horizontal tab scrolling still works with enough tabs to overflow the strip.

**Acceptance criteria**

- [x] Clicking the Templates **▾** button opens the menu **fully visible** in the main
  window (no longer clipped/hidden).
- [x] **New tab from template…**, **New template…**, and **Manage templates…** are all
  reachable and work; the menu closes on outside-click, Escape, and selection.
- [x] **Horizontal scrolling of many canvas tabs still works** (the fix didn't remove the
  strip's scroll).
- [x] No off-system colors, no layout shift in the tab strip, reduced-motion unaffected.
- [x] `npm run build`, `npm run lint`, `npm test`, and `npm run format:check` pass (no Rust
  changes expected).

**Notes**

- **Confirmed symptom (user):** clicking the ▾ shows **nothing at all**, in the **main app
  window** — consistent with the overflow-clip root cause (not an event/race bug).
- **CSS gotcha at the heart of this:** `overflow-x: auto` forces the computed `overflow-y`
  away from `visible` (to `auto`), so a single-axis scroll container still clips the other
  axis — which is why a dropdown that overflows *below* a horizontally-scrolling strip
  disappears.
- **Fix precedent in-repo:** the sidebar repo context menu (#31/#54) renders
  `position: fixed` at cursor coords and is never clipped — the same escape applies here.
- Files in play: `src/components/Canvas/CanvasTabs.tsx` (~150–175 menu state/handlers,
  ~227–279 button + `.templatesMenu` render), `src/components/Canvas/Canvas.module.css`
  (`.tabStrip` ~20–30, `.templatesWrap` ~133–137, `.templatesMenu` ~139–152).

---

### 129. [ ] Add "Reveal in Finder" and "Copy path" to the repo (folder) context menu

**Status:** Not started
**Owner:** _(unassigned)_
**Depends on:** none · _(builds on the shipped #54 repo context menu and the `open`-shell-out precedent #100/#109; the #120/#121 refining passes are complete, so nothing open gates it)_
**Created:** 2026-06-22

**Description**

The sidebar **repo-header** right-click context menu (#54) currently offers **New
session**, a **Views** section, **Change color…**, and the destructive **Kill all agents
/ Close all items / Forget folder**. Add two **non-destructive utility** items: **Reveal
in Finder** (opens the repo's folder in Finder) and **Copy path** (copies the folder's
absolute path to the clipboard with a confirming toast).

**Grounded in the code.** The repo menu is rendered in
`src/components/Sidebar/Sidebar.tsx` — the `menu`/`menuMode` block (~lines 952–1170); the
default-mode branch begins at the "New session" item (~line 1054). The repo's absolute
path is `menu.repo`. **Copy path** reuses the existing store action
**`copyToClipboard(text, label)`** (`src/store.ts` ~line 2166, which toasts "Copied …").
**Reveal in Finder** needs a **new Rust command** because the existing `open_url` only
accepts `http(s)` — add one mirroring `open_data_folder` (`src-tauri/src/commands.rs`
~line 906: `std::process::Command::new("open").arg(path).spawn()`, no shell → no injection
vector), register it in `src-tauri/src/lib.rs`'s `invoke_handler`, and wrap it in
`src/ipc.ts` (like `openUrl`, `ipc.ts:286`).

**Decision (from the user):** "Reveal in Finder" **opens the folder** — `open <path>` —
not `open -R` (reveal-selected-in-parent).

**Scope — in:** the single repo-header context menu; the two new items + the one new
backend command/IPC wrapper. **Out:** the agent row menu (#130), the
file/diff/terminal/schedule rows (suggested separately but not authored), and any change
to the existing menu items.

**Subtasks**

1. [ ] Backend: add `reveal_path(path: String)` to `commands.rs` (macOS `open <path>`, no
   shell; mirror `open_data_folder`), and register it in `lib.rs`'s `invoke_handler`.
2. [ ] IPC: wrap it as `revealPath(path)` in `ipc.ts`.
3. [ ] Sidebar repo menu: in the default-mode branch, add **Reveal in Finder** (→
   `revealPath(menu.repo)`) and **Copy path** (→ `copyToClipboard(menu.repo, "path")`),
   grouped in their own separator section (e.g. between the Views section and Change
   color…); `closeMenu()` after each.
4. [ ] Verify `npm run build`, `npm run lint`, `npm test`, `npm run format:check`, `cargo
   clippy`, `cargo fmt`.

**Acceptance criteria**

- [ ] Right-clicking a repo header shows **Reveal in Finder** and **Copy path** alongside
  the existing items.
- [ ] **Reveal in Finder** opens the repo's folder in a Finder window (`open <path>`).
- [ ] **Copy path** copies the folder's absolute path and shows a "Copied path" toast.
- [ ] The new Rust command runs `open` **without a shell**; the menu closes after either
  action; existing items are unchanged.
- [ ] All build/lint/test/format + clippy/fmt checks pass.

**Notes**

- Reuses `copyToClipboard` (`store.ts`) — no new clipboard plumbing — and follows the
  `open`-shell-out precedent (`open_url` #109, `open_data_folder` #100).
- The same **Reveal in Finder / Copy path** vocabulary was proposed for the
  file/diff/terminal sidebar rows (which have **no** context menu today); those rows are
  **out of scope** here.

---

### 130. [ ] Add "Copy session ID" and "Fork conversation" to the agent (session) context menu

**Status:** Not started
**Owner:** _(unassigned)_
**Depends on:** none · _(reuses the shipped fork action #126 and the existing SessionRow menu; the #120/#121 refining passes are complete, so nothing open gates it)_
**Created:** 2026-06-22

**Description**

The sidebar **agent row** (`SessionRow`) right-click context menu currently offers only
**Rename** and **Remove** (`src/components/Sidebar/Sidebar.tsx` ~lines 248–285). Add two
items: **Fork conversation** (branches the agent's conversation into a new parallel
session) and **Copy session ID** (copies the agent's `claude` session UUID — the
`--session-id` / `claude --resume` id).

**Grounded in the code.** **Fork already ships (#126)** as a header button in
`src/components/Overview/Overview.tsx` (~line 183) and
`src/components/Canvas/CanvasSurface.tsx` (~line 213), both calling the existing store
action **`forkSession(sourceId)`** (`src/store.ts:1935` → `ipc.forkSession` →
`fork_session`). **This task only surfaces that same action in the row menu — it does not
reimplement fork.** **Copy session ID** reuses **`copyToClipboard(text, label)`**
(`store.ts` ~2166) on **`session.claudeSessionId`** — the UUID (set as
`claude_session_id: info.id` in `commands.rs`, so it equals the app session id and is
valid for `claude --resume`). `SessionRow` already consumes the full `session` object; it
would also read `forkSession` / `copyToClipboard` via `useStore`.

**Scope — in:** the `SessionRow` context menu — add the two items. **Out:** the repo menu
(#129) and the file/diff/terminal/schedule rows; no backend/fork-logic changes.

**Subtasks**

1. [ ] In `SessionRow`, pull `forkSession` and `copyToClipboard` from the store
   (`useStore`).
2. [ ] Add menu items so the order is **Rename · Fork conversation · Copy session ID ·
   (separator) · Remove**: Fork → `forkSession(session.id)`; Copy session ID →
   `copyToClipboard(session.claudeSessionId, "session ID")`; `setMenu(null)` after each.
   Use the `GitFork` Lucide icon to match the existing fork buttons.
3. [ ] Verify `npm run build`, `npm run lint`, `npm test`, `npm run format:check`, `cargo
   clippy`, `cargo fmt`.

**Acceptance criteria**

- [ ] Right-clicking an agent row shows **Rename**, **Fork conversation**, **Copy session
  ID**, and **Remove**.
- [ ] **Fork conversation** creates a new parallel forked session — identical behavior to
  the existing Overview/Canvas fork buttons (reuses `forkSession`, no new backend).
- [ ] **Copy session ID** copies the agent's `claude` session UUID and shows a "Copied
  session ID" toast.
- [ ] The menu closes after each action; Rename/Remove are unchanged.
- [ ] All build/lint/test/format + clippy/fmt checks pass.

**Notes**

- **Do not reimplement fork** — #126 already provides `forkSession`; this is purely a new
  menu entry.
- Session ID = the `claude` UUID (`claudeSessionId`), usable with `claude --resume`;
  equals the app session id (`claude_session_id: info.id`).
- Reuses `copyToClipboard` (`store.ts`).

---

### 131. [ ] Add simple right-click context menus to the non-agent left-panel rows (file / diff / terminal / schedule)

**Status:** Not started
**Owner:** _(unassigned)_
**Depends on:** none · _(pure-frontend; builds on the shipped sidebar rows #45/#59/#72/#94 and mirrors the `SessionRow` menu pattern; the #120/#121 refining passes are complete, so nothing open gates it)_
**Created:** 2026-06-22

**Description**

The sidebar's **non-agent** item rows have **no right-click context menu** today —
`FileRow`, `DiffRow`, `TerminalRow`, and `ScheduleRow`
(`src/components/Sidebar/Sidebar.tsx`) offer only click-to-open, a hover-× close button,
and drag-into-Canvas. By contrast the agent `SessionRow` and the repo header both have
context menus. Add a **deliberately simple** right-click menu to each of these four rows
with a **single item** — **Remove** for the file/diff/terminal rows and **Cancel** for the
schedule row — so every left-panel row gains a menu now, with room to grow later.

**Grounded in the code.** `ScheduleRow` (~line 40), `FileRow` (~line 307), `DiffRow`
(~line 359), and `TerminalRow` (~line 420) currently have no `onContextMenu`. The pattern
to mirror is **`SessionRow`** (~line 118): local `menu` state `{x,y}`, an `onContextMenu`
that `preventDefault()`/`stopPropagation()` and sets a viewport-clamped position, then a
`.menuOverlay` + `.menu` (`role="menu"`) block with `.menuItem` / `.menuItemDanger`
buttons (overlay click closes). Each row **already receives the exact handler the menu
needs**: `FileRow`/`DiffRow`/`TerminalRow` get `onClose` (the parent wires
`onClose={() => void removeOverviewPanel(repo, panel.id)}`, ~lines 829/844/860 — and a
terminal's close also kills its shell, #72); `ScheduleRow` gets `onCancel` (cancels the
schedule). Reuse the existing `.menuOverlay` / `.menu` / `.menuItemDanger` classes in
`Sidebar.module.css`.

**Decisions (from the user / for consistency):**
- **One item per menu:** **Remove** (file/diff/terminal) and **Cancel** (schedule) — no
  other items in this pass ("for now they can just have the remove option").
- **Behavior = the existing ×** (same `onClose`/`onCancel` handler) — for a terminal,
  Remove kills its shell, exactly as the × does today. **No** new store/IPC/backend.
- **No confirm gate** — mirrors the `SessionRow` Remove (ungated, calls the handler
  directly); the repo-level #103 confirm gating is not applied here.
- **Styling:** the red `menuItemDanger` style for all four (both Remove and Cancel are
  removal-type actions), matching the agent Remove.

**Scope — in:** the four non-agent sidebar rows; add an `onContextMenu` + a single-item
menu to each. **Out:** the agent `SessionRow` menu (#130), the repo menu (#129), any new
menu items beyond Remove/Cancel, and any backend change.

**Subtasks**

1. [ ] Add the menu to each row by mirroring `SessionRow`'s local `menu` state +
   `onContextMenu` + `.menuOverlay`/`.menu` render. To avoid four near-identical copies,
   optionally factor a tiny shared `RowContextMenu` (single-item) component — but a direct
   mirror is acceptable for this minimal pass.
2. [ ] `FileRow` / `DiffRow` / `TerminalRow`: single **Remove** item (`menuItemDanger`) →
   calls the existing `onClose`; close the menu after.
3. [ ] `ScheduleRow`: single **Cancel** item (`menuItemDanger`) → calls the existing
   `onCancel`; close the menu after.
4. [ ] Verify `npm run build`, `npm run lint`, `npm test`, `npm run format:check` (no Rust
   changes expected).

**Acceptance criteria**

- [ ] Right-clicking a **file**, **diff**, or **terminal** row opens a menu with a single
  **Remove** item that removes the row (and, for a terminal, kills its shell) — identical
  to the × button.
- [ ] Right-clicking a **scheduled-session** row opens a menu with a single **Cancel**
  item that cancels the schedule — identical to the × button.
- [ ] The menu mirrors the `SessionRow` menu (cursor-positioned/clamped, overlay-click
  closes, red danger styling) with **no** confirm prompt.
- [ ] Existing click-to-open, ×, and drag-into-Canvas behaviors are unchanged on all four
  rows.
- [ ] All build/lint/test/format checks pass.

**Notes**

- Pure frontend — reuses each row's existing `onClose` / `onCancel`; no backend/IPC/store
  changes.
- Deliberately minimal ("just Remove/Cancel for now"); future items (Open in Canvas,
  Reveal in Finder, Copy path, Refresh diff, etc. — the earlier suggestion table) can
  extend these same menus.
- Sibling tasks **#129** (repo menu) and **#130** (agent `SessionRow` menu) edit the same
  file (`Sidebar.tsx`) but different components — no logical dependency, just adjacent
  edits if developed close together.
