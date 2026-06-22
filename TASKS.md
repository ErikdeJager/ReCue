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
and never commits or creates branches; its writes are `git checkout <existing branch>`
from the new-session flow (#27) and `git worktree add`/`remove` for isolated worktree
agents (#74). `claude` is assumed on `PATH` (clear in-app error if missing).

> The original design spec and interactive prototype (`HANDOFF.md`,
> `Conductor.dc.html`) are preserved in git history (commit `b02efd8`
> "System referances") if exact prototype details are ever needed.

---

## Implemented (completed tasks)

> The backlog has fully shipped (#1–#113).
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

Tasks #1–#115 are complete — see **Implemented (completed tasks)** above for the index,
and git history for full per-task detail. **Open tasks: #116–#119.** New work
goes here as a fresh `### N.` entry in [TASKS-TEMPLATE.md](TASKS-TEMPLATE.md) format, with
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

### 114. [x] Slash-command skill autocomplete in the scheduled-session prompt field

**Status:** Complete
**Owner:** _(unassigned)_
**Depends on:** none · _(builds on shipped scheduled sessions #93/#94 and the read-only file/picker patterns #44/#56 — all complete)_
**Created:** 2026-06-22

**Description**

The scheduled-session **prompt** field should help the user write a prompt that
starts with a slash command, the way typing into a real `claude` session does.
When the user types **`/`** at the start of the prompt (or at the start of a new
word), a **small dropdown** should appear listing the **skills** available to
`claude`, filtering as the user keeps typing, so they can pick one and have
`/<skill-name>` inserted — instead of guessing the exact name.

This matters because a scheduled session boots `claude` **pre-seeded with this
prompt** (the positional `claude --session-id <id> "<prompt>"` invocation, #93),
so a prompt like `/deep-research ...` will actually run that skill on launch — but
today the user has to type the skill name blind, with no discovery and no
guard against typos.

**Where the field lives.** A scheduled session's prompt is editable in **two**
places, both of which must get the autocomplete (they edit the same field):

1. **`NewSessionModal`** schedule step — the `promptInput` textarea
   (`src/components/NewSessionModal/NewSessionModal.tsx`, ~lines 698–706) where a
   schedule is created.
2. **`ScheduledPanel`** — the auto-saving `prompt` textarea
   (`src/components/ScheduledPanel/ScheduledPanel.tsx`, ~lines 124–136) shown as a
   sidebar row / Overview card / Canvas panel (#94) where a pending schedule is
   edited. Auto-save (debounced `update_schedule`) must keep working when the
   component inserts text programmatically (fire the same change path the textarea
   `onChange` does).

Build this as **one reusable component** (e.g. `SkillAutocomplete`, a textarea +
dropdown with its own CSS Module consuming `tokens.css`) used by both call sites,
rather than duplicating the logic.

**What "skills" means / where they come from.** Enumerate the slash-invokable
items `claude` would offer, read from the standard on-disk directories — the same
files `claude` itself reads:

- **Project-scoped** (the schedule's `cwd`): `<cwd>/.claude/skills/*/SKILL.md`
  (take `name` + `description` from the YAML frontmatter) and
  `<cwd>/.claude/commands/**/*.md` (name from the file path; optional
  `description` from frontmatter).
- **User-scoped:** `~/.claude/skills/*/SKILL.md` and `~/.claude/commands/**/*.md`.

Dedupe by name (project shadows user) and sort. Plugin / marketplace skills
(under `~/.claude/plugins/…`, e.g. `qskill:*`, `supabase:*`, with enabled-state
and namespacing complexity) are **out of scope for v1** — note them as a possible
follow-up. This list is **best-effort**: a missing or unreadable directory simply
yields fewer entries; the prompt field must never break or block when no skills
are found (the dropdown just doesn't appear).

**Trigger & interaction.**

- The dropdown opens when a `/` is typed in **command position** — at the very
  start of the textarea, or immediately preceded by whitespace/newline — so a `/`
  inside a path or URL (`src/foo`, `https://…`) does **not** trigger it.
- As the user types after the `/`, filter the list case-insensitively
  (substring on the skill name; description may also match). Closes when the
  token ends (a space typed after it), on selection, on Escape, on blur, or when
  there are no matches.
- Keyboard: **↑/↓** move the highlight, **Enter** or **Tab** accept the
  highlighted skill (replace the partial `/typed` token at the cursor with
  `/<skill-name> ` and close), **Escape** dismisses without inserting. Clicking an
  item accepts it.
- **Container-key guard (important):** while the dropdown is open, Enter must
  **not** submit the `NewSessionModal` form (it currently submits → creates the
  schedule, see the form `onSubmit`), and Escape must **not** close the modal
  (the modal binds Escape to close). The component must `preventDefault` /
  `stopPropagation` for Enter/Escape/Tab/↑/↓ while the menu is open so those keys
  drive the menu, not the surrounding modal/canvas.

**Styling.** Match the app's design system — `tokens.css` colors only (no
off-system colors), the popover shadow used elsewhere, no layout shift, and the
`prefers-reduced-motion` / `body.reduce-motion` killswitch respected. Follow the
existing `FilePicker` (#56) popover/list patterns for look and keyboard feel.

**Subtasks**

1. [x] **Backend skill enumeration.** Add `src-tauri/src/skills.rs` (mirroring
   `files.rs`): scan the project + user `.claude/skills/*/SKILL.md` and
   `.claude/commands/**/*.md`, parse frontmatter `name`/`description`, dedupe
   (project over user), sort → `Vec<SkillInfo { name, description, source }>`. Add
   a `list_skills(cwd)` Tauri command in `commands.rs`, register it in `lib.rs`
   (`mod skills;` + the `invoke_handler` list), with Rust unit tests over a temp
   dir.
2. [x] **IPC + types.** Add a typed `listSkills(cwd)` wrapper in `src/ipc.ts` and
   a `SkillInfo` type in `src/types/`.
3. [x] **Reusable `SkillAutocomplete` component** (`src/components/…` + CSS
   Module): textarea + dropdown implementing the `/`-trigger, filter, keyboard
   nav, token insertion, and dismissal described above. Factor the pure logic
   (detect the active `/token` + cursor, filter, compute the post-insert string +
   caret) into testable helpers.
4. [x] **Wire into `NewSessionModal`** schedule step — replace the `promptInput`
   textarea; load skills for the chosen `cwd`; implement the container-key guard
   so the menu intercepts Enter/Escape.
5. [x] **Wire into `ScheduledPanel`** — replace the `prompt` textarea; preserve
   the debounced auto-save on both typing and programmatic insert.
6. [x] **Tests** — Vitest over the pure filter/insert/trigger-detection helpers;
   Rust unit tests over the skills scan.

**Acceptance criteria**

- [x] Typing `/` in command position in the schedule prompt (both in
  `NewSessionModal`'s schedule step **and** `ScheduledPanel`) opens a small
  dropdown listing the available skills.
- [x] Continuing to type filters the list; ↑/↓ move the highlight; Enter, Tab, or
  a click inserts `/<skill-name> `; Escape dismisses the menu.
- [x] A `/` in the middle of a word/path/URL does **not** open the dropdown.
- [x] While the menu is open, Enter does **not** submit the new-schedule form and
  Escape does **not** close the modal; with the menu closed they behave as today.
- [x] Skills are read from project `.claude/skills` (+ `.claude/commands`) and
  user `~/.claude/…`, deduped (project shadows user) and sorted; a missing/empty
  directory degrades gracefully (no dropdown, no error).
- [x] `ScheduledPanel`'s debounced auto-save still persists the prompt after an
  autocomplete insertion.
- [x] No layout shift, no off-system colors, reduced-motion respected.
- [x] `npm run build`, `npm run lint`, `npm test`, `cargo test`, and
  `npm run lint:rust` all pass.

**Notes**

- **Assumptions made (autonomous authoring — no clarifying questions asked):**
  (a) both prompt-edit surfaces (#93 create + #94 edit) get the autocomplete via
  one shared component; (b) the skill source is the on-disk
  `.claude/skills` + `.claude/commands` dirs at **project** (`cwd`) and **user**
  (`~`) scope — the files `claude` itself reads — with project shadowing user;
  (c) `.claude/commands/*.md` are included alongside `SKILL.md` skills since both
  are `/`-invokable in a real session; (d) **plugin/marketplace** skills
  (`~/.claude/plugins/…`) are out of scope for v1 (follow-up); (e) the trigger is
  command-position `/` only, with the standard mention-style keyboard model.
  Adjust if any of these is wrong.
- The scheduled prompt is sent to `claude` positionally on launch (#93), so an
  inserted `/<skill>` runs that skill when the session boots — this is the point
  of the feature.
- Follow the `FilePicker` (#56) / `FileSwitcher` (#90) popover + keyboard patterns
  for consistency; the backend follows the `files.rs` → `commands.rs` → `lib.rs`
  → `ipc.ts` pattern (read-only, path-validated).

---

### 115. [x] Revert collapsible sidebar folders (#113); replace the disclosure triangle with a static repo-colored cube

**Status:** Complete
**Owner:** _(unassigned)_
**Depends on:** none · _(reverts the already-shipped #113; no open task feeds it)_
**Created:** 2026-06-22

**Description**

**Revert the collapsible-folders feature (#113)** — the user does not want sidebar
repo folders to collapse/expand, and does not want the **disclosure triangle**.
Remove the collapse behavior **entirely** (toggle, persistence, child-row hiding),
and **replace the triangle with a static repo-colored cube** as the folder's
identity marker (the user's preference — "perhaps a cube looks better"). The cube
takes the place the triangle/dot occupied: a small, **non-interactive** repo-color
marker before the repo name, restoring the pre-#113 static-marker role that the
#35 color dot used to play — but rendered as a **cube**, not a circle or triangle.

**Background — exactly what #113 added (all to be removed):**

- **Frontend `Sidebar.tsx`** (~lines 713, 750–765, 794–796): the `isCollapsed`
  computation, the separate **`repoToggle` button** wrapping the
  `repoTriangle`/`repoTriangleExpanded` span, the `onClick={toggleRepoCollapsed}`
  + `aria-expanded`, and the `{!isCollapsed && (…)}` gate that hides a folder's
  child rows.
- **`Sidebar.module.css`** (~lines 199–231): `.repoToggle`, `.repoTriangle`,
  `.repoTriangleExpanded`.
- **`store.ts`**: the `collapsedRepos` state field (~line 430, default ~690),
  the `toggleRepoCollapsed` action (~466, ~707–713), and the `init` seeding —
  `getCollapsedRepos()` in the boot `Promise.all` (~1012), the `rawCollapsedRepos`
  destructure (~1002), and `collapsedRepos: rawCollapsedRepos ?? []` (~1079).
- **`ipc.ts`** (~216–220): `getCollapsedRepos` / `setCollapsedRepos` wrappers.
- **Rust backend:** `commands.rs` `get_collapsed_repos` / `set_collapsed_repos`
  (~743–751); `lib.rs` their `invoke_handler` registration (~164–165);
  `store.rs` the `collapsed_repos` field (~158), `collapsed_repos()` /
  `set_collapsed_repos()` accessors (~395–401), and the
  `collapsed_repos_set_and_persist` test (~772–784).
- **Tests:** `store.test.ts` (the `toggleRepoCollapsed` test + `collapsedRepos`
  assertions, ~69/139–146), `store.refresh.test.ts` (the `getCollapsedRepos` /
  `setCollapsedRepos` mocks + the "seeds collapsedRepos" test, ~21–22/53–54/153–162).

**What stays unchanged:** the repo name still **filters Overview** on click
(#34/#68) and right-click still opens the context menu (#31/#54). All child rows
(sessions, worktree agents #74, file/diff/terminal/scheduled items) **always
render** — there is no longer any hidden state. The activity-dot slot/alignment
(#95) and the compact 10px labels (#111) are untouched.

**The cube marker.** A static, repo-colored cube glyph occupying the same ~14px
slot / ~10px footprint the triangle used, so row alignment with the agent
activity dots is preserved. It is **non-interactive** (no button, no toggle,
`aria-hidden`) — a plain identity marker like the #35 dot. Tinted to the repo
color via the existing `repoColor(repo, repoColors)`. **Recommended rendering:**
the **Lucide `Box`** icon (a 3D cube outline, on-system with the rest of the icon
set) colored to the repo color; an acceptable alternative is a CSS `clip-path`
isometric-cube silhouette filled with the repo color (mirroring how the triangle
was a clip-path shape). Implementer's choice between those two; recommend `Box`.

**Subtasks**

1. [x] **Frontend revert** — in `Sidebar.tsx` remove the `repoToggle` button, the
   triangle span, `isCollapsed`, and the `{!isCollapsed && …}` gate (child rows
   render unconditionally); drop the `collapsedRepos` / `toggleRepoCollapsed`
   store reads.
2. [x] **Cube marker** — render a static repo-colored cube before the repo name
   (Lucide `Box`, recommended), sized to keep the existing row alignment; remove
   the triangle CSS and add the cube's styling.
3. [x] **Store + IPC** — remove `collapsedRepos`, `toggleRepoCollapsed`, the
   `getCollapsedRepos` boot seeding from `store.ts`, and the
   `getCollapsedRepos` / `setCollapsedRepos` wrappers from `ipc.ts`.
4. [x] **Rust** — remove the `collapsed_repos` field + accessors (`store.rs`), the
   `get_collapsed_repos` / `set_collapsed_repos` commands (`commands.rs`), and
   their `lib.rs` registration. An older `sessions.json` that still contains a
   `collapsed_repos` key must deserialize cleanly (serde ignores unknown fields by
   default — verify no `deny_unknown_fields`).
5. [x] **Tests** — delete the now-obsolete collapse tests in `store.test.ts`,
   `store.refresh.test.ts`, and `store.rs`; adjust any remaining assertions that
   referenced `collapsedRepos`.
6. [x] **Docs** — update the #113 line in `TASKS.md`'s Implemented summary with the
   reversal note (done here, mirroring how #15→#62 reversals are recorded). The
   CLAUDE.md #113 prose is left to the in-progress docs-sync that already has
   CLAUDE.md checked out (avoids entangling those uncommitted external edits).

**Acceptance criteria**

- [x] Sidebar repo folders **cannot** be collapsed — there is no toggle, and all
  child rows are always visible.
- [x] The disclosure **triangle is gone**, replaced by a static repo-colored
  **cube** before the repo name, aligned with the agent activity dots and tinted
  to the repo color; it is not clickable.
- [x] Clicking the repo name still filters Overview; right-click still opens the
  repo context menu (both unchanged).
- [x] No `collapsedRepos` / `collapsed_repos` code, IPC, commands, or persisted
  value remains; an existing `sessions.json` with the old key loads without error.
- [x] No off-system colors, no layout shift in the repo header, reduced-motion
  respected.
- [x] `npm run build`, `npm run lint`, `npm test`, `cargo test`, and
  `npm run lint:rust` all pass with the obsolete tests removed.

**Notes**

- **Assumptions made (autonomous authoring — no clarifying questions asked):**
  (a) a **full** revert of #113 — the collapse behavior and its entire
  persistence stack (TS + Rust `collapsed_repos`) are removed, not just hidden;
  (b) the triangle is replaced by a **static, non-interactive** repo-colored
  **cube** (not by restoring the #35 circular dot) in the same slot;
  (c) cube rendering is the **Lucide `Box`** icon by default, with a clip-path
  cube silhouette as an acceptable alternative — final visual is open to the
  user's tweak at implementation. Adjust if any of these is wrong.
- This **reverses #113** (which itself reversed the non-collapsible part of #34);
  after this task, sidebar repo folders are non-collapsible again, as in #34.

---

### 116. [ ] Activity indicator goes yellow on a brand-new session before any prompt — should stay gray until first real work

**Status:** Not started
**Owner:** _(unassigned)_
**Depends on:** none · _(fixes shipped #112 / #42 / #55 behavior)_
**Created:** 2026-06-22

**Description**

When you **start a new session**, the activity indicator (#112) **immediately
turns yellow** ("finished — needs input") and sits there, even though you haven't
sent the agent anything yet. It should instead stay **gray** (the fresh /
never-active state) right after start, and only become yellow once the agent has
actually **done some work and gone idle** — i.e., after you've sent your first
prompt and `claude` has worked on it.

**Root cause (traced).** The yellow "settled" state is `!busy && hasBeenActive`
(`BusyIndicator.tsx:34`). `hasBeenActive` is latched on the **first `busy`
edge** — persisted via `mark_session_active` (`lib.rs:70–72`) and flipped in the
store's `setBusy` → `sessionActive` (`store.ts:759–762`). But the busy heuristic
counts `claude`'s **startup TUI paint** as busy: in `pty.rs` (lines 604–606) a
session with no keystrokes yet (`last_input == 0`) treats **any** recent output as
busy. So spawning `claude` paints its welcome screen → `busy=true` → latches
`has_been_active` → the paint settles → `!busy && hasBeenActive` → **yellow**, all
before the user typed a prompt.

**Desired behavior.**

- A freshly started **interactive** session reads **gray** from spawn, through the
  user reading the welcome screen and typing their first prompt.
- It turns **blue** (shimmer) while `claude` is actually working on a submitted
  prompt.
- It turns **yellow** ("needs input") only **after** `claude` has done work and
  gone idle (the existing #112 settled state), and stays yellow until it works
  again.

**Recommended direction.** Stop `claude`'s pre-input startup paint from counting
as activity. The cleanest single lever is the **busy heuristic** itself: a session
should only read as busy once it has work to do — i.e., output that arrives **after
the user has submitted input** (reuse the existing #55 `last_input` stamp:
`last_input != 0`), rather than the current `inp == 0 → any output is busy` branch.
With no busy until first input, neither `sessionActive` (frontend) nor
`mark_session_active` (backend) latches, so the dot stays gray until the first real
turn — which also removes the brief startup **blue** flicker, matching "gray right
after start". (If the implementer prefers, gate only the `has_been_active` latch on
"has received input" and leave the startup blue as-is — but the unified
busy-heuristic fix is preferred.)

**Critical edge case — scheduled sessions (#93/#94).** A scheduled agent boots
**pre-seeded with a prompt positionally** (`claude --session-id <id> "<prompt>"`,
via `spawn_session_with_prompt`) and starts working immediately with **no
`write_stdin`**, so `last_input` stays `0`. A naive "busy requires `last_input !=
0`" rule would leave scheduled sessions **stuck gray** — never blue while working,
never yellow when done. The fix **must** treat a prompt-seeded session as already
having work (e.g. a per-session "started-with-prompt" flag in the activity state,
or stamping a synthetic initial input), so seeded sessions still go blue→yellow
correctly.

**Out of scope.** No change to the visual design of the three states (#112) or the
busy-window / echo timings (#42/#55) beyond the gating described. Boot-resume must
not regress: a previously-active resumed session still shows yellow immediately
(its persisted `has_been_active`), and a never-active resumed session stays gray
despite the resume repaint.

**Subtasks**

1. [ ] Reproduce: start a new interactive session → confirm it goes yellow before
   any prompt; identify the startup-paint busy edge.
2. [ ] Adjust the busy heuristic (`pty.rs` monitor, ~604–606) so `claude`'s
   pre-input startup output does **not** read as busy for an interactive session
   (reuse `last_input`), while preserving the #55 echo-aware behavior after input.
3. [ ] Add the **seeded-session exception** so scheduled/prompt-seeded sessions
   (#93, `spawn_session_with_prompt`) still go blue while working and yellow when
   idle (per-session "started-with-prompt" flag or equivalent).
4. [ ] Verify the downstream latches (`sessionActive` in `store.ts`,
   `mark_session_active` in `lib.rs`) now only fire on genuine work; adjust if any
   independent path can still latch from the startup paint.
5. [ ] Add/extend tests: a pure/unit test that startup output with no prior input
   does **not** mark a session busy/active, and that post-input output (and a
   seeded session) does.

**Acceptance criteria**

- [ ] A newly started interactive session shows the **gray** dot right after start
  and stays gray until the user sends their first prompt.
- [ ] After the first prompt, the dot goes **blue** while `claude` works and
  **yellow** ("needs input") once it finishes and is idle.
- [ ] **Scheduled / prompt-seeded** sessions (#93/#94) still go blue while working
  their seeded prompt and yellow when done — they are **not** stuck gray.
- [ ] Boot-resume is unchanged: a previously-active session shows yellow on boot;
  a never-active one stays gray despite the resume repaint.
- [ ] `npm run build`, `npm run lint`, `npm test`, `cargo test`, and
  `npm run lint:rust` all pass.

**Notes**

- **Assumptions made (autonomous authoring — no clarifying questions asked):**
  (a) the leaving-gray trigger is "the user has submitted input" (interactive),
  reusing the #55 `last_input` stamp; (b) the fix should produce "gray right after
  start" with **no** startup blue flicker either (the unified busy-heuristic
  approach), not just suppress the yellow; (c) scheduled/seeded sessions must keep
  their blue→yellow behavior via a seeded exception. Adjust if any is wrong.
- Files in play: `src-tauri/src/pty.rs` (busy monitor + `Activity`/`last_input`,
  `spawn_session_with_prompt`), `src-tauri/src/lib.rs` (`mark_session_active`),
  `src/store.ts` (`setBusy` → `sessionActive`), `src/components/BusyIndicator`.

---

### 117. [ ] Canvas Templates (part 1 of 2): data model, persistence, block registry, editor & CRUD

**Status:** Not started
**Owner:** _(unassigned)_
**Depends on:** none · _(builds on the shipped Canvas subsystem #46/#47/#58/#94)_
**Created:** 2026-06-22

**Description**

Add **Canvas Templates** — reusable, saved Canvas layouts whose panels hold
**action "blocks"** (e.g. "Start session", "Open terminal", "Open file", "Open
diff") instead of live content. A user can author a template in a dedicated editor,
save it, and later **instantiate** it to spin up a whole workspace at once (part 2,
#118). This **part 1** delivers everything *except* the runtime instantiation: the
template **data model**, **persistence**, a **block-type registry**, the
**editor** (reusing the Canvas split UI), and template **CRUD** + the tab-strip
entry point. After #117, a user can create/edit/name/duplicate/delete templates
(the blocks render as inert, labelled placeholders in the editor); **#118** makes
"use template" actually execute the blocks.

**Why split:** the full feature (model + persistence + editor + a block registry +
an async instantiation engine + per-panel error/retry fallbacks + folder-pick-on-use)
is too large for one pass, so per this repo's split rule it is two dependent
tasks (mirroring #93 → #93/#94). Part 2 is **#118** and depends on this.

**Background (grounded in the code).** A Canvas tab is `CanvasTab { id, name,
layout }` where `layout` is a BSP tree (`CanvasNode` = `CanvasSplit` | `CanvasLeaf`,
pure ops in `src/components/Canvas/canvasTree.ts`); each `CanvasLeaf` holds a
`CanvasContent { kind, label?, repoPath?, file?, sessionId?, scheduleId? }` resolved
at render in `CanvasSurface.tsx` (`renderContent`). Content kinds today: `agent`,
`terminal`, `file`, `diff`, `scheduled`. Canvas tabs persist as the opaque
`canvases` blob (`get_canvases`/`set_canvases`, store `setCanvases`). Templates
should reuse this tree machinery wholesale — a template is essentially a `CanvasTab`
whose leaves carry **block** descriptors.

**Data model.** A new `CanvasTemplate { id, name, layout }` where `layout` is a
`CanvasNode` tree whose leaves hold a **block** descriptor. Define block kinds
distinct from live content kinds, e.g. `new-agent` (optional `prompt`),
`new-terminal`, `open-file` (a **relative** `file` path), `open-diff`. Persist as a
**new, separate** Rust store value `canvas_templates` (a JSON blob, mirroring
`canvases`/`settings`/`collapsed_repos`): `get_canvas_templates` /
`set_canvas_templates` commands (`commands.rs`) + `lib.rs` registration +
`store.rs` field/accessors + typed `ipc.ts` wrappers + store state/actions
(`canvasTemplates`, create/update/rename/duplicate/delete). Kept separate from the
`canvases` blob so a Settings/draft write can't clobber it.

**Block-type registry (the user's "future blocks auto-included" requirement).**
The set of placeable block kinds must be driven by a **single registry**, mirroring
#82's "one registry drives every addable view type", so that when a **new Canvas
content kind** is added later it becomes available as a template block **without
editing the template code in N places**. Centralize a content-kind ⇄ block-kind
registry (label, icon, how the block is configured in the editor, and — in #118 —
how it instantiates). v1 block kinds: `new-agent`, `new-terminal`, `open-file`,
`open-diff`.

**Editor ("separate screen", reusing the Canvas split UI).** A dedicated
**edit-template surface** that reuses the Canvas BSP surface/`canvasTree` so
building a template feels exactly like building a canvas: a **block palette** to
drag blocks from (there are no live sidebar items to drag in template mode), drop
into the center or onto panel edges to split, resize borders, and close panels.
Each block is **configurable** inline:
- `new-agent`: an optional **initial prompt** (textarea; pre-sent on launch in #118,
  like scheduled sessions #93).
- `open-file`: a **relative file path** chosen via a picker (reuse `FilePicker`
  #56 against a folder the user browses *only for reference*) **or typed
  free-text**, storing just the relative path. Show **helper text** making the
  resolution explicit, e.g. *"Resolved inside the folder you pick when you use this
  template — e.g. type `README.md` to open that folder's README."*
- `new-terminal`, `open-diff`: no config (act on the chosen folder in #118).
In the editor each block renders as an inert, labelled placeholder (icon + "Start
session" / "Open file: README.md" etc.) — no live PTY/file in edit mode.

**Entry point + CRUD.** Add a **Templates menu to the Canvas tab strip**
(`CanvasTabs.tsx`) — a ▾ control near the **+**: "New template…" (opens the editor
empty) and "Manage templates…". A **Manage** view lists saved templates with
**Edit** (reopen in editor), **Rename**, **Duplicate**, and **Delete**. ("New tab
from template…" — the *use* action — is added in **#118**.)

**Out of scope for this part:** the instantiation engine, block execution, folder-
pick-on-use, and the error/retry fallbacks (all **#118**). Also out of scope for
v1 entirely: **"Save current canvas as a template"** (the user chose build-from-
scratch only — note as a follow-up), per-block branch/worktree, absolute file
paths, and detached-window (#84) interaction.

**Subtasks**

1. [ ] **Types + registry** — `CanvasTemplate` + block-kind descriptors in
   `src/types`; a centralized content-kind/block-kind **registry** (extensible so a
   future content kind auto-yields a block).
2. [ ] **Persistence** — Rust `canvas_templates` store value + `get`/`set`
   commands + `lib.rs` registration + `store.rs` field/accessors/tests; typed
   `ipc.ts` wrappers; store state + `create/update/rename/duplicate/delete`
   actions (persisting the blob).
3. [ ] **Editor surface** — reuse the Canvas BSP surface/`canvasTree` in an
   edit-template mode: block **palette** (drag source), drop/split/resize/close,
   per-block config (agent prompt; file relative-path picker + helper text),
   name + save.
4. [ ] **Tab-strip Templates menu** — ▾ near **+** in `CanvasTabs.tsx`: "New
   template…", "Manage templates…".
5. [ ] **Manage view** — list templates with Edit / Rename / Duplicate / Delete
   (confirm-gated per #103 for Delete).
6. [ ] **Tests** — Vitest over the template store actions + any pure tree/block
   helpers; Rust tests over `canvas_templates` persistence.

**Acceptance criteria**

- [ ] A user can open a template editor (from the Canvas tab-strip ▾), drag the
  v1 blocks (start session / terminal / file / diff) into a split layout, configure
  them (agent prompt; file relative path with clear helper text), name and **save**
  the template.
- [ ] Saved templates **persist** across restarts (separate `canvas_templates`
  blob) and can be **edited, renamed, duplicated, and deleted**.
- [ ] The placeable block set is driven by a **registry** such that adding a new
  Canvas content kind later surfaces a new block with minimal, localized changes.
- [ ] No live PTY/file is created in the editor (blocks are inert placeholders);
  the `canvases` blob and existing Canvas behavior are untouched.
- [ ] `npm run build`, `npm run lint`, `npm test`, `cargo test`, and
  `npm run lint:rust` all pass.

**Notes**

- Decisions captured from the user (interactive refinement): editor **reuses the
  Canvas split UI**; templates are authored **from scratch** (save-current-as-
  template deferred); access via the **Canvas tab-strip menu**; management =
  edit/rename/duplicate/delete; the block set must be **registry-driven so future
  block types are auto-included**.
- This is **part 1 of 2**; **#118** (instantiation + block actions + fallbacks)
  depends on it. Keep the block descriptors rich enough that #118 can execute them
  (e.g. the agent block's `prompt`, the file block's relative `path`).

---

### 118. [ ] Canvas Templates (part 2 of 2): instantiation engine, block actions & per-panel fallbacks

**Status:** Not started
**Owner:** _(unassigned)_
**Depends on:** #117 · _(uses the template model, persistence, blocks & editor from part 1)_
**Created:** 2026-06-22

**Description**

Make Canvas Templates (#117) **actually usable**: a "**New tab from template**"
flow that, on use, **picks one folder**, opens a **new Canvas tab**, and
**executes every block** to set up the workspace — starting agent sessions, opening
terminals, opening files, and opening diffs — with robust **per-panel fallbacks**
when a block can't be fulfilled. This is the payoff: "pick up a template seamlessly
in the Canvas UI to set up your workspace every time."

**Use flow ("pick folder on use" → new tab → execute blocks).**

1. From the Canvas tab-strip ▾ (#117), **"New tab from template…"** → choose a
   saved template.
2. **Pick the target folder once** (reuse the new-session folder step UX / recents
   + folder picker, #66) — **all** blocks in the template apply to this one folder;
   `open-file` paths resolve **relative** to it.
3. Create a **new `CanvasTab`** named after the template (its `layout` is the
   template's tree) and open it as the active canvas.
4. **Execute each block** (leaf) into live `CanvasContent`, **best-effort and
   independent** — the tab opens immediately and each panel resolves on its own:
   - `new-agent` → spawn a **new** `claude` session in the chosen folder (current
     branch, no checkout) **pre-seeded with the block's optional prompt** (reuse the
     prompt-seeded spawn path used by schedules, `spawn_session_with_prompt` /
     #93/#101) → panel becomes `{kind:"agent", sessionId, repoPath}`.
   - `new-terminal` → spawn a shell terminal (#72) in the chosen folder → `{kind:
     "terminal", sessionId, repoPath}`.
   - `open-file` → resolve the relative path under the chosen folder; if it exists →
     `{kind:"file", repoPath, file}`.
   - `open-diff` → `{kind:"diff", repoPath}` for the chosen folder.
5. **"Just do it"** — no spawn-count confirmation even when many agents start at
   once (the user's explicit choice).

**Fallbacks (the user emphasized — "think carefully").** The tab **always opens**;
each panel that fails shows an **inline error with a Retry button** (not a toast,
not a silent skip). Specifically:
- `open-file` **file not found** (relative path doesn't exist in the chosen folder)
  → panel shows "File not found: `<relative path>`" + **Pick file** (open
  `FilePicker` #56 scoped to the chosen folder to choose a replacement) + **Retry**.
- `new-agent` / `new-terminal` **spawn failure** (e.g. `claude` missing — reuse the
  existing `claudeMissing` signal — or PTY error) → "Couldn't start…" + **Retry**.
- `open-diff` when the **chosen folder isn't a git repo** → "Not a git repository"
  + **Retry**.
- A failed panel **retains its source block** so **Retry** re-runs that block in
  place; on success the panel becomes normal live content. Successful sibling panels
  are unaffected.

**Implementation notes.** Instantiation is **async** (spawns return ids over IPC);
a panel should show a brief loading state, then live content or the error state.
Each instantiated leaf must keep a reference to its originating block (a `pending` /
`block` field on the leaf's content, cleared once resolved) so the panel can render
loading/error/Retry and re-execute. Reuse the existing missing-reference rendering
pattern in `CanvasSurface.tsx` (e.g. the "Session closed." placeholder) for the
error states. The new tab persists into the `canvases` blob like any other (a
panel left in an error state persists as its pending block so Retry survives a
restart — or document if an unresolved panel is dropped on reload).

**Out of scope.** Per-block branch/worktree, absolute paths, save-current-as-
template, detached-window (#84) instantiation (templates open in the main window),
and any spawn-count guard.

**Subtasks**

1. [ ] **"New tab from template" entry** in the tab-strip ▾ (#117) → template
   chooser.
2. [ ] **Folder-pick-on-use** step (reuse #66 folder UX); carry the chosen folder
   to all blocks.
3. [ ] **Instantiation engine** — pure mapping of a template tree → a new
   `CanvasTab`, with each block flagged pending; async executor that resolves each
   block to live content (agent via prompt-seeded spawn, terminal, file, diff).
4. [ ] **Per-panel loading / error / Retry** rendering in `CanvasSurface.tsx`,
   including `open-file`'s **Pick file** affordance and the retain-source-block
   logic.
5. [ ] **Fallback coverage** — file-not-found, spawn failure (claude missing),
   non-git diff; verify partial success (some panels live, some error).
6. [ ] **Tests** — Vitest over the pure template→tab instantiation mapping and the
   block→content resolution (incl. error states); cover the retry path.

**Acceptance criteria**

- [ ] "New tab from template" → pick a folder → a **new Canvas tab** opens with the
  template's layout, and each block executes against the chosen folder.
- [ ] `new-agent` blocks start real sessions (with their optional prompt pre-sent);
  `new-terminal`, `open-file` (relative to the folder), and `open-diff` blocks open
  their content.
- [ ] A missing file shows an **inline error + Pick file + Retry** in that panel;
  the rest of the tab still loads. Spawn failures and non-git diffs likewise show
  **error + Retry**. Nothing is silently skipped.
- [ ] **Retry** re-runs the failed block in place and, on success, replaces the
  error with live content.
- [ ] Many `new-agent` blocks instantiate without any confirmation ("just do it").
- [ ] `npm run build`, `npm run lint`, `npm test`, `cargo test`, and
  `npm run lint:rust` all pass.

**Notes**

- Decisions captured from the user (interactive refinement): **pick one folder on
  use**; **open a new tab**; **error + Retry** per failed panel (file → Pick file);
  agent blocks carry an **optional prompt**; **no spawn guard** ("just do it");
  `open-file` accepts a plain relative name like `README.md` resolved in the chosen
  folder.
- Depends on **#117** for the template model, persisted store, block registry, and
  editor. Together #117 + #118 are the complete Canvas Templates feature.

---

### 119. [ ] Settings modal: consistent, larger fixed size with vertical scroll on overflow

**Status:** Not started
**Owner:** _(unassigned)_
**Depends on:** none · _(self-contained CSS change to the #100 Settings modal)_
**Created:** 2026-06-22

**Description**

The Settings modal (#100) **changes size depending on the selected section** — it
shrinks for a short section (e.g. Sessions, one toggle) and grows for a tall one
(Terminal / Appearance), which is visually jarring. Make the modal a **consistent,
larger fixed size** regardless of section, and when a section's content exceeds the
fixed height, **scroll vertically inside the modal** (the section nav and the
Cancel/Save action row stay put; only the content area scrolls).

**Root cause (traced).** In `src/components/Settings/Settings.module.css`, the
`.dialog` rule (lines ~14–23) sets `width: min(640px, 100%)` and only a
**`max-height: min(520px, 90vh)`** — there is **no fixed `height`**, so the dialog
is content-driven and resizes per section. The scroll machinery already exists
(`.content` has `overflow-y: auto; flex: 1; min-height: 0`, lines ~86–94) but never
engages until content exceeds the cap, because the dialog just grows to fit.

**Fix.** Give `.dialog` a **fixed height** (and a slightly larger width) instead of
a content-driven `max-height`:
- `width: min(720px, 100%)` (was 640px).
- `height: min(600px, 90vh)` replacing `max-height: min(520px, 90vh)` — a fixed,
  viewport-clamped height so every section renders at the same size and short
  screens never overflow the viewport.
- Keep `.dialog { overflow: hidden }` and `.content { overflow-y: auto }` so a tall
  section scrolls within the content pane; the left `.sections` nav and the bottom
  action row (`flex-shrink: 0`) stay fixed.

**Scope.** CSS-only, `Settings.module.css` only. No change to the section nav,
field markup, the draft/Save behavior, or any other modal. Numbers are the
user-confirmed **720 × 600** (height clamped to 90vh).

**Acceptance criteria**

- [ ] The Settings modal is the **same size for every section** — switching Terminal
  / Sessions / Appearance / Behavior / Data & About never changes its width or
  height.
- [ ] The modal is **larger** than today (≈720 × 600), and its height is clamped to
  the viewport (≤ ~90vh) so it never exceeds a short screen.
- [ ] A section taller than the modal **scrolls vertically inside the content area**;
  the section nav and the Cancel/Save action row remain visible (don't scroll away).
- [ ] `npm run build`, `npm run lint`, and `npm run format:check` pass.

**Notes**

- User-confirmed target size: **720 × 600** (the "Recommended" option;
  `height: min(600px, 90vh)`, `width: min(720px, 100%)`).

---

### 120. [ ] Iteration & self-improvement pass — review, refine, and optimize all shipped work

**Status:** Not started
**Owner:** _(unassigned)_
**Depends on:** #116, #117, #118, #119 · _(all tasks open at authoring time — this runs LAST, only once everything else is Done)_
**Created:** 2026-06-22

**Description**

A final **iteration / self-improvement pass** that runs **only after every
currently-open task is complete** (#116–#119). Its job is to take the code those
tasks shipped — and the surrounding subsystems they touched (the busy-indicator /
`pty.rs`, the Sidebar/store cube revert, the Canvas Templates engine + editor, the
Settings modal) — and **improve its quality, performance, and consistency**,
following the documented **best-practice conventions for prompting Claude Code to
refine and optimize code** (researched below). It is **not** a feature task: it
must **not change intended behavior or add functionality** — it hardens what's
already there.

**Method — the best-practice conventions to follow** (from the research below; this
is the *how*, and is the point of this task):

1. **Explore → plan → implement → verify.** Separate research/planning from edits
   (plan mode) so the pass refines the *right* code, not a guessed-at problem.
2. **Give every change a verifiable check and show evidence.** For each refinement,
   run a real check (tests / build / lint / a benchmark) and record its **output** —
   never assert "done" without proof. This verification loop is the single biggest
   quality lever.
3. **Address root causes, not symptoms** — no error suppression, no papering over.
4. **Profile before optimizing.** For performance work: profile the hot path first,
   propose **2–3 optimizations ranked by impact and risk**, apply them, and
   **benchmark before/after**, keeping behavior identical (regression tests green).
5. **Small, single-goal commits.** Write characterization/regression tests *first*
   when touching behavior-sensitive code, then refactor.
6. **Independent, adversarial review in a fresh context.** Use a fresh-context
   reviewer (a subagent or the bundled `/code-review`) so the author isn't grading
   itself — but **only act on findings that affect correctness or the stated quality
   goals**; do **not** chase every reviewer nit into over-engineering (extra
   abstraction, defensive code, tests for impossible cases).
7. **Follow existing patterns & `CLAUDE.md`** — repo conventions, the
   frontend/backend boundary, "terminal bytes stay out of React state", design
   tokens (no off-system colors), a11y patterns.
8. **Don't over-reach.** Improvements stay within the touched code; no unrelated
   rewrites, no dependency bumps or build-system changes unless fixing a real defect.

**Scope — in:** readability/naming, dead-code & duplication removal, pattern &
token/a11y consistency, type-safety and error handling, **performance** of hot paths
(e.g. output routing/`outputBus`, store updates, Canvas tree ops & re-render
hotspots), **test** strengthening (regression/characterization) for the refined
areas, and a **docs sync** (CLAUDE.md/README reflect the final shipped state).
**Out:** new features, behavior/UI changes beyond what #116–#119 defined, scope
creep / over-engineering, dependency upgrades, and build-system changes.

**Subtasks**

1. [ ] **Baseline** — on a clean tree, run all gates (`npm run build`, `npm run
   lint`, `npm test`, `npm run format:check`; `cargo test`, `npm run lint:rust`
   (clippy), `cargo fmt --check`) and record the current state + any slow/flaky
   spots.
2. [ ] **Per-feature refinement** — for each of #116–#119, review its diff in a
   **fresh context** (independent review), fix correctness/quality gaps, and add
   regression tests; show the passing evidence.
3. [ ] **Cross-cutting quality sweep** — naming, dead code, duplication, pattern &
   token & a11y consistency, error handling across the touched subsystems
   (`store.ts`, Canvas, Sidebar, Settings, `pty.rs`/indicator).
4. [ ] **Performance pass** — profile the hot paths, apply ranked,
   behavior-preserving optimizations, and record before/after measurements.
5. [ ] **Tests & docs** — strengthen tests for refined areas; sync CLAUDE.md &
   README to the final state.
6. [ ] **Final verification** — all gates green; an independent adversarial review
   of the **cumulative** diff finds no correctness/requirement gaps; evidence
   recorded.

**Acceptance criteria**

- [ ] This task is completed **last** — only after #116, #117, #118, and #119 are
  all Done.
- [ ] **No intended behavior change and no new features** — the behavior/UI of
  #116–#119 is preserved (verified).
- [ ] Each refinement is backed by **evidence** (passing test/build/lint output);
  every performance change is backed by **before/after measurements** with
  correctness preserved.
- [ ] An **independent, fresh-context review** of the cumulative diff reports no
  correctness or requirement gaps (style-only nits may be left).
- [ ] All gates pass: `npm run build`, `npm run lint`, `npm test`, `npm run
  format:check`, `cargo test`, `npm run lint:rust`, `cargo fmt --check`.
- [ ] CLAUDE.md and README reflect the final shipped state.

**Notes**

- **Best-practice conventions sourced from web research** (the user's explicit
  requirement):
  - Anthropic — *Best practices for Claude Code* (https://code.claude.com/docs/en/best-practices):
    explore→plan→implement→verify; **give Claude a verifiable check and have it show
    evidence, not assert success**; **adversarial review in a fresh subagent context**
    so the author doesn't grade itself; and the warning that a gap-hunting reviewer
    over-reports — fix only correctness/requirement gaps, avoid over-engineering.
  - Anthropic / Claude — *Optimize code performance quickly*
    (https://claude.com/blog/optimize-code-performance-quickly): **profile to locate
    bottlenecks first**, rank optimizations by impact, **benchmark before/after**, and
    prevent regressions with tests.
  - General convention (community + docs): **don't make "improvements" beyond what's
    asked** — scope tightly and address root causes.
- **Dependency snapshot:** `Depends on` lists the tasks open when this was authored
  (#116–#119). If later tasks are added that should also gate this final pass,
  **update this task's `Depends on`** to include them (this task is meant to run
  after *everything*).
- **Assumptions (autonomous authoring):** scope is quality / performance /
  consistency / tests / docs with **no behavior changes or new features**, and the
  pass uses **independent review + verification** rather than self-grading. Adjust if
  you want behavior changes included or a different dependency set.
