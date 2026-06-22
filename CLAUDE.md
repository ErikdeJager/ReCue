# CLAUDE.md

Guidance for working in this repository. ClaudeCue is a **macOS** desktop app for
running and managing many live `claude` CLI sessions at once.

## What this app is

An **Overview** "agent wall" of real terminals, a **Canvas** split-panel workspace
(with file, **git-diff**, and terminal viewers), and a repo-grouped **sidebar**. A
Canvas tab can **pop out into its own native window** for multi-monitor use (#84).
Each session is a **real PTY running `claude`** — ClaudeCue provides the window
chrome, navigation, persistence, and git-reading; the terminals come from the
Claude Code CLI itself.

`claude` is assumed to be installed and authenticated on `PATH` (the app surfaces a
clear error if it is missing). Because a bundled `.app` launched from Finder/Dock
inherits launchd's minimal `PATH` (not the shell's), `run()` first calls
`path_env::restore_user_path()` to adopt the **login-shell PATH** at startup
(release builds only) — without it `claude` reads as "not found" in `tauri build`
even though it works in `tauri dev`.

## Stack

- **Tauri 2** desktop shell (macOS only)
- **Frontend:** React + TypeScript + Vite, **Zustand** for state, plain CSS with
  CSS-variable design tokens (CSS Modules), **xterm.js** terminals (⌘-clickable
  `http`/`https` links via `@xterm/addon-web-links`, #109), **Lucide**
  icons, **JetBrains Mono** (bundled, offline), **react-markdown + remark-gfm**
  (GFM markdown, no raw HTML) + **Prism.js** (curated-language read-only code
  highlighting) — both in the universal **`FileViewer`** (#40/#44), **dnd-kit**
  (`@dnd-kit/core` + `/sortable` — the app's one drag-and-drop system, #43),
  **react-resizable-panels** (Canvas split resizing, #46)
- **Backend (Rust, `src-tauri/`):** **`portable-pty`** for terminals, JSON
  persistence in the app-data dir, read-only git (shells out to `git`), and the
  Tauri **dialog** (folder picker) plugin
- Dark theme only

## Architecture (data flow)

- **Spawn:** `spawn_session(cwd, name)` → `SessionManager` (`pty.rs`) opens a PTY
  running `claude --session-id <uuid>`, registers it by id, and persists a record
  (`store.rs`). A per-session reader thread pushes output to a bounded scrollback
  buffer and an `mpsc` channel.
- **Output:** `lib.rs` forwards the channel to the `session://output` /
  `session://exited` / `session://state` Tauri events. The frontend `ipc.ts`
  subscription routes output **bytes** to `outputBus.ts` (a pub/sub the xterm
  `Terminal` consumes — deliberately *not* React state) and lifecycle +
  busy/idle to the Zustand `store.ts`.
- **Busy indicator (#42/#55/#71/#88/#95/#112/#116):** a backend monitor thread (`pty.rs`) derives each
  session's **busy/idle** from output activity (within a ~700ms window) and emits
  `session://state { id, busy }` on transitions only. So **keystroke echo doesn't
  read as busy** (#55), `write_stdin` stamps a per-session `last_input` time and the
  monitor marks busy only when output arrived ≥300ms *after* the last keystroke.
  Busy also requires the session to have **work to do** (#116) — either the user has
  submitted input, or it booted **prompt-seeded** (#93, an `ActivityState.seeded`
  flag set by `spawn_session_with_prompt`) — so `claude`'s pre-input **startup paint
  never reads as busy** (it used to, latching the yellow "needs input" state before
  any prompt); a fresh interactive session stays gray until its first real turn,
  while a seeded/scheduled agent still goes blue→yellow. The
  store keeps `sessionBusy` plus a per-session **has-been-active** flag; the
  `BusyIndicator` (#88, supersedes #71's spinner arc) has **three states** (#112): a
  calm `--status-idle` (gray) dot when **fresh** (never active); while busy, a
  `--status-running` (Blue) **Claude-style shimmer** — a soft sheen **sweeping across
  it** (animated `background-position` on a `::after` sheen, the dot via `::before` —
  no extra DOM); and once it has worked and gone idle again, a **settled**
  `--status-awaiting` (yellow) dot with a soft glow and no animation ("finished —
  needs input"). It is **always rendered** as a ~10px dot in a fixed ~14px slot (#95)
  so the footprint never shifts, and placed **before the agent's name** — in the
  sidebar rows and Overview card headers. "Has been active" is **persisted**
  (`has_been_active` on the record, set once on the first busy edge in `lib.rs`,
  seeded into the store on load) so a previously-active agent shows yellow immediately
  on boot. Under reduced-motion the sweep is dropped, leaving a solid glowing blue dot
  (and a solid yellow settled dot) distinct from idle.
- **Input / resize:** the `Terminal` sends keystrokes to `write_stdin` and a
  `ResizeObserver` drives `resize_pty`.
- **Persistence / resume:** records + recents survive restarts; on boot the
  manager best-effort `resume_session`s each via `claude --resume <id>`.
- **Git:** `working_diff(cwd)` / `current_branch(cwd)` / `compare_branches(cwd, base,
  target)` (the #81 two-dot branch compare) shell out to `git`; the `DiffInspector` and
  sidebar render the structured result.
- **Views:** the store holds `sessions / selectedId / view / recents / branches /
  canvases / activeCanvasId / claudeMissing / toasts / schedules / settings /
  sidebarWidth`; the app mounts one of
  **Overview or Canvas** (#46/#75 — Focus was removed). Each session's xterm is owned
  by a **persistent terminal
  pool** (`Terminal/terminalPool.ts`), created once and **reparented** into the
  active view's slot (parked off-screen otherwise) — so a view switch never
  disposes/recreates the terminal or replays scrollback (which would garble
  `claude`'s width-specific TUI redraw). Scrollback replays once at creation;
  resizes are debounced + applied only while visible. The pool's `createHost`
  **linkifies `http`/`https` URLs** (a `WebLinksAddon`) so a **⌘-click** opens the
  default browser via the dependency-free Rust `open_url` (http/https only, shells out
  to macOS `open` without a shell) — for both agent and shell terminals (#109).
- **Overview customization:** columns are grouped by repo (#36) — by a session's
  pure **`effectiveRepo`** (`paths.ts`), so a worktree agent (#74) sits in its
  **parent repo's** cluster sharing its color, text-badged "worktree" rather than
  reading as a foreign-colored stray (#96). Per repo, a
  user-managed list of extra panels (diff #39 / markdown #41 / terminal #72) follows the agent
  terminals, and the whole cluster is **drag-reorderable within the repo** (#43,
  dnd-kit) — each column is a sortable keyed by session/panel id, so a reorder
  reparents DOM nodes and never remounts a terminal (pool intact). Persisted per
  repo: `overview_panels` (panel defs) + `overview_order` (the unified item
  order, merged with live items so spawn/exit don't scramble it).
- **Sidebar tree (#45/#59):** each repo lists its sessions **and** its non-agent
  items — the **same `overview_panels` Overview shows, 1:1**: file viewers, diff
  viewers, shell terminals (#72), and scheduled sessions (#94). #59 folded the old per-repo `open_files` into
  `overview_panels`, so an item opened anywhere (the searchable file picker #56, or the
  repo menu's **Views** section #82) appears in both places (that legacy fold-in is now
  **one-shot** — boot clears `open_files` instead of re-folding it, so a closed viewer
  never resurrects, #110). A tree row click
  **selects/jumps to the item in the current view** (#79 — never auto-switching
  Overview↔Canvas); the hover × removes the item (and its Overview column); every row
  (session / file / diff / terminal) is a dnd-kit **draggable source** that drops into
  the active Canvas (#47/#59 — agents → terminal, files → file viewer, diffs → diff
  panel; new item types are draggable by default via a `payloadToContent` case). The
  repo's context menu (#54) offers **New session**, a **Views** section to add
  file/diff/terminal panels (#82), repo color (#35), and destructive actions —
  **Kill all agents** / **Close all items** (#91) and **Forget folder** (#31), the
  latter two also tearing down the folder's non-agent items (killing their PTYs) and
  pending schedules (#106); each destructive step is confirm-gated unless turned off
  in Settings (#103). Each repo header carries a **static, non-interactive
  repo-colored cube** marker (the Lucide `Box` icon, tinted via `repoColor`) before
  the repo name, occupying the activity-dot slot (#95); the name still filters
  Overview (#34). _(#113 made folders collapsible with a repo-colored disclosure
  triangle + a persisted `collapsed_repos`; **#115 reverted that** at the user's
  request — folders are non-collapsible again, all child rows always render, and the
  triangle was replaced by the cube.)_ Every tree-row label renders at a uniform
  compact 10px (`--fs-meta-xs`, #111).
- **Canvas (#46/#47/#58):** a third view — **multiple named tabs** (#58), each its
  own recursive **BSP split-panel** layout (a binary tree `split{dir,a,b,sizes}` /
  `leaf{id,content}`; pure ops in `Canvas/canvasTree.ts`). The tabs (`canvases` =
  `{id,name,layout}[]` + `activeCanvasId`) persist as one opaque `canvases` JSON blob
  (migrated once from the old single `canvas_layout`); the `CanvasTabs` strip adds
  (+), closes (always keeps ≥1), inline-renames, and drag-reorders tabs via a nested
  dnd-kit context. Panels host **real content** (#47): agent terminals (#18 pool),
  file viewers (#44), diff viewers (#39), and shell terminals (#72) — a `content`
  descriptor `{kind, ...refs}`
  resolved at render. **Drag-in:** one **app-level dnd-kit context** (`App.tsx`)
  spans the sidebar (drag sources: sessions, files, diffs #59) and Canvas (center +
  edge drop zones); `Canvas/canvasDrop.ts` maps payloads → content and applies the
  split/append **to the active tab**. Dropping on an edge splits recursively, borders
  resize via **react-resizable-panels**, panels close. The Overview wall and the tab
  strip keep their own nested sortable contexts (#43/#58) — only one view mounts at a
  time, so targets never clash.
- **Canvas templates (#117/#118):** reusable saved Canvas layouts whose leaves hold
  inert action **blocks** (`new-agent` w/ optional prompt, `new-terminal`, `open-file`
  w/ a relative path, `open-diff`) instead of live content. A single **block registry**
  (`Canvas/templateBlocks.ts`, mirroring #82) drives the placeable set — a new content
  kind becomes a block with one entry. The `CanvasTabs` strip's **▾ Templates menu**
  opens a full-screen **`TemplateEditor`** (reuses the BSP surface + `canvasTree` ops:
  a block **palette** is the only drag source, drop into center/edges to split, resize,
  configure each block inline, name + save), a **`TemplateManager`** modal (edit /
  inline-rename / duplicate / delete, Delete confirm-gated #103), and (#118) **"New tab
  from template…"** → a **`TemplateUseModal`** (pick template → pick one folder, reusing
  the #66 folder UX). Templates persist in their **own** `canvas_templates` Rust blob
  (`get_canvas_templates`/`set_canvas_templates`, separate from `canvases`) → store
  `canvasTemplates` + `saveTemplate`/`renameTemplate`/`duplicateTemplate`/`deleteTemplate`.
  A `CanvasTemplate` reuses the `CanvasNode` tree with block-kind leaf `content`.
  **Instantiation (#118):** `useTemplate(id, cwd)` opens a **new tab** (pure
  `templateInstantiate.ts` maps the tree → leaves flagged `kind:"pending"` carrying the
  source `block` + chosen folder, fresh ids), then `resolveTemplateBlock` runs each
  block **independently, best-effort** against that folder — `new-agent` via the
  prompt-seeded spawn (`spawn_session` now takes an optional `prompt`, #93/#101),
  `new-terminal` a fresh shell, `open-file` gated by `file_exists`, `open-diff` by
  `is_git_repo`. A failed panel stays `pending` with an **inline error + Retry** (never
  a toast/silent skip), `open-file` also offering **Pick file** (`FilePicker` scoped to
  the folder); the panel **retains its block** so Retry re-runs it in place. No
  spawn-count guard ("just do it"). The reconcile (`App.tsx`) now also keeps PTYs
  referenced only by a Canvas layout (`sessionIdsInLayout`) so template terminals
  survive.
- **Detached canvas windows (#84):** a Canvas tab can open in its **own native
  window** for multi-monitor use, via a **pop-out button** on the tab or a **drag
  tear-off** (drag a tab out of the strip). The button/tear-off call Rust
  `open_canvas_window(id,title)`, which creates a `WebviewWindow` labelled
  `canvas-<id>` loading the **canvas-only route** `index.html?canvas=<id>`
  (`windowContext.ts` reads the param → `IS_MAIN_WINDOW` / `WINDOW_LABEL`;
  `CanvasWindow` renders the shared `Canvas/CanvasSurface` with no sidebar/Overview/
  tabs). Each window is its **own document** — its own store, `outputBus`, and #18
  terminal pool — and Tauri session events are **global**, so a detached window's
  pool renders the same backend PTYs. **One PTY renders in one window at a time**
  (the #18 width constraint): the pure `computeSessionOwners(canvases, detachedIds)`
  assigns each session to exactly one window (a detached canvas claims its sessions,
  else `"main"`); Overview cards + Canvas panels show a **`DetachedNote`** ("running
  in a separate window" + Focus) instead of a terminal when another window owns it,
  and each window's `reconcileTerminals` keeps only owned PTYs (dispose-in-one /
  create-in-the-other, reversed on re-dock). **Cross-window sync:** `set_canvases`
  persists then broadcasts `canvas://changed` (the **main** window is authoritative
  for `activeId`; a detached window's write merges only the `canvases` array);
  opening/closing a window broadcasts `canvas://windows` (the detached id set). The
  main tab strip marks detached tabs ("in window"), ⌘1–9 (#76) and a detached-tab
  click **`focus_canvas_window`** (raise) instead of switching, and **closing a
  detached window re-docks** its canvas (its `Destroyed` handler re-broadcasts the
  set; the main window reclaims the PTYs). Detached windows are **per-session** — not
  restored on relaunch (capability `canvas-*` in `capabilities/default.json`).
- **Scheduled sessions (#93/#94/#125):** an agent can be **scheduled to launch later**.
  The **"+ Schedule session"** sidebar button / **⌘⇧N** opens the new-session modal
  in **schedule mode** — folder → branch (incl. **"+ add branch"** to create a new
  branch *at fire time*, #125) → a final step for **launch time** (a
  `datetime-local`), optional **prompt**, optional **name** — and calls
  `create_schedule`. Records persist in `store.rs` (`schedules: ScheduledSession[]`,
  carrying a `create_branch` flag + `branch_base` for the new-branch intent, #125).
  A **poll loop** in `lib.rs` (every `SCHEDULE_POLL_SECS`) calls
  `commands::fire_due_schedules`, which atomically `take_due_schedules(now)`, then
  (best-effort) **creates** the new branch (`git checkout -b`, #124/#125) or checks
  out the existing one, spawns `claude` **pre-seeded with the prompt** (the
  positional invocation, see Conventions), converts the record into a live session,
  and emits **`schedule://fired`** (→ the main window moves it scheduled→live). On
  boot the first tick fires anything **missed while closed** (catch-up). One-shot
  only (local clock). **#94** makes a schedule a first-class **draggable item type**:
  a `CanvasContent` **`kind: "scheduled"`** (+ a `payloadToContent` case) renders the
  shared **`ScheduledPanel`** — an **auto-saving** (debounced → `update_schedule`)
  editor for the launch time / name / prompt + cancel — in the **sidebar** (a
  draggable row, click selects/jumps #79, × cancels), an **Overview card**, and a
  **Canvas panel**. Time helpers live in `src/time.ts`.
- **Auto-named agents (#97):** an agent with **no custom name** shows **claude's own
  session title** rather than the bare branch. A backend **title reader**
  (`src-tauri/src/title.rs`) globs the session's `~/.claude/projects/*/<uuid>.jsonl`
  log by UUID and takes the latest `ai-title` (fallback: the first `last-prompt`,
  else the branch); a dedicated **title-worker** thread re-reads it on each
  busy→idle edge (off the monitor's hot path), emitting `SessionEvent::Name` →
  `session://name`, which `lib.rs` persists (the `auto_name` field) and forwards.
  `sessionLabel` (`paths.ts`) resolves **`custom || auto || branch`**, so the title
  fills the single-line label (#95) everywhere — a user rename (#57) still wins.
  Best-effort: a missing / unreadable / format-changed log degrades to the branch,
  and the busy indicator is never stalled. The Settings auto-name toggle (#100) gates
  it.
- **Settings (#100/#102/#103/#107/#119):** a sidebar **footer gear** opens a centered,
  focus-trapped **Settings modal** (`components/Settings`) — a **fixed 720×600** size
  (clamped to 90vh, #119) so every section renders identically and a tall section
  scrolls inside the content pane (the nav + action row stay put) — with five sections —
  **Terminal** (font size / line height via the custom **`Slider`** #122 + cursor
  blink → the live pooled xterms via `terminalPool.applyTerminalSettings`),
  **Sessions** (the #97 auto-name toggle),
  **Appearance** (an accent swatch over the Catppuccin palette + a reduce-motion
  toggle), **Behavior** (default launch view + confirm-destructive gating #103), and
  **Data & About** (open data folder, clear recents, app + `claude` versions). A
  modal-local **draft** applies only on **Save** via `applySettingsEffects` (accent
  overrides `--accent` plus its companions `--accent-hover/-dim/-fg` through
  `accentCompanions` #107; reduce-motion toggles `body.reduce-motion`). Settings
  persist as an opaque `settings` blob (`get_settings` / `set_settings`) merged over
  TS-side `DEFAULT_SETTINGS`, so an older `sessions.json` upgrades cleanly.
- **Pluggable coding agent (#101):** an `AgentSpec` catalog
  (`src-tauri/src/agents.rs`) is the single source of truth for each agent's binary +
  how it spawns / resumes / seeds a session; the **`claude`** spec preserves today's
  exact flags. Each session and schedule **records its own `agent`** (serde-default
  `"claude"`), and `pty.rs` (`spawn_session` / `spawn_session_with_prompt` /
  `resume_session`) resolves the spec instead of hardcoding `"claude"`. **Claude is
  still the only agent** — the Codex spec + a Settings selector are a planned part 2.
- **Resizable sidebar (#108):** a thin right-edge drag handle sets the sidebar width,
  clamped to **[180, 560]** (default 260) and **persisted** via a dedicated Rust
  `sidebar_width` value (`get_sidebar_width` / `set_sidebar_width`), kept **separate**
  from the Settings blob so the modal draft can't clobber a drag. Main-window only.

## Layout

```
.
├── index.html              # Vite entry
├── src/                    # Frontend (React + TS)
│   ├── main.tsx            # React bootstrap (loads fonts + tokens + global CSS)
│   ├── App.tsx             # Root: main shell (sidebar + Overview/Canvas) OR a
│   │                       #   detached CanvasWindow, by window identity (#84)
│   ├── store.ts            # Zustand store (state + cross-cutting actions)
│   ├── ipc.ts              # Typed Tauri command/event wrappers
│   ├── outputBus.ts        # Per-session output pub/sub (bytes kept out of store)
│   ├── paths.ts            # Shared path helpers (repoName, sessionLabel, effectiveRepo #96)
│   ├── time.ts             # Schedule time helpers (toLocalInput, formatFireTime) (#93/#94)
│   ├── windowContext.ts    # Window identity (#84): main vs canvas-<id>, ownership helpers
│   ├── ownership.ts        # useSessionOwners hook — which window renders each PTY (#84)
│   ├── useKeyboardNav.ts   # Global keyboard shortcuts (#24/#76/#77/#84/#93)
│   ├── components/         # React components (CSS Module alongside each):
│   │                       #   Sidebar, Overview, Canvas (+ CanvasSurface),
│   │                       #   CanvasWindow (#84), Terminal, FileViewer, FilePicker,
│   │                       #   FileSwitcher (#90), DiffInspector, DetachedNote (#84),
│   │                       #   ScheduledPanel (#94), Settings (#100), BusyIndicator,
│   │                       #   TemplateEditor + TemplateManager (#117) + TemplateUseModal (#118),
│   │                       #   Checkbox, Slider (#122), NewSessionModal, Toaster, ViewSwitch,
│   │                       #   ClaudeMissing, EmptyState
│   ├── styles/             # tokens.css (design tokens) + global.css (reset/base)
│   └── types/              # Shared TS types (backend-mirrored models)
├── src-tauri/              # Rust backend (Tauri)
│   ├── src/lib.rs          # App builder, state wiring, event forwarding, schedule poll loop (#93)
│   ├── src/main.rs         # Binary entry point
│   ├── src/pty.rs          # Session/PTY core (SessionManager, portable-pty)
│   ├── src/agents.rs       # Pluggable coding-agent specs (AgentSpec catalog) (#101)
│   ├── src/path_env.rs     # Restore login-shell PATH at startup (Finder-launch fix)
│   ├── src/title.rs        # Best-effort reader for claude's own ai-title (#97)
│   ├── src/commands.rs     # Tauri command surface + event payloads
│   ├── src/store.rs        # JSON persistence (sessions, recents, canvases, canvas templates, schedules, settings, sidebar width)
│   ├── src/git.rs          # Git: branch + diff + compare (#81) + list + checkout + worktree (#74)
│   ├── src/files.rs        # Read-only file access (list text files/read, path-validated)
│   ├── Info.plist          # Partial plist (mic + speech-recognition usage strings), merged into the bundle
│   ├── tauri.conf.json     # Window, bundle, build config
│   ├── capabilities/       # Tauri permission capabilities
│   └── Cargo.toml          # Crate `claudecue` / lib `claudecue_lib`
├── eslint.config.js        # ESLint flat config (TS + React)
└── .prettierrc.json        # Prettier config
```

## Commands

```bash
npm install            # install frontend deps (also resolves the Rust crate on first build)
npm run tauri dev      # run the desktop app (Vite + Rust) with hot reload
npm run tauri build    # build an (unsigned) macOS .app / .dmg

npm run build          # type-check + build the frontend only
npm run lint           # ESLint (frontend)
npm run format         # Prettier write (frontend)
npm run format:check   # Prettier check (frontend)
npm test               # Vitest (store / pure-logic unit tests)
npm run lint:rust      # cargo clippy (backend)
npm run format:rust    # cargo fmt (backend)
cargo test --manifest-path src-tauri/Cargo.toml   # Rust unit tests
```

## v1 scope decisions / out of scope

- **Git is read-mostly, with a small set of deliberate writes** — ClaudeCue reads
  git (current branch + working-tree diff vs `HEAD`) and never commits. Its writes
  are: (1) **`git checkout <existing branch>`** from the new-session panel
  (#27/#53/#61) — picking a branch checks it out (in the chosen folder, only an
  existing local branch, validated backend-side) before the agent starts, warning
  before disrupting another agent already running in that folder; (2) **`git worktree
  add` / `git worktree remove`** for isolated worktree agents (#74) — **⌘⏎** in the
  branch step starts an agent in an app-managed worktree
  (`<app-data>/worktrees/<repo-id>/<branch>`), shown nested under its parent repo in
  the sidebar; the worktree is removed (ref-counted) only when its last agent goes,
  and a dirty worktree is kept rather than force-deleted; and (3) **branch creation**
  (#124, expanding the earlier "never creates branches" rule) — the branch step's
  **"+ add branch"** option creates + checks out a new branch (`git checkout -b
  <name> [<base>]`, base defaulting to the current branch/HEAD) and starts a normal
  agent, or with **⌘⏎** creates it as a worktree (`git worktree add -b`); the name is
  validated backend-side (a valid ref that must not already exist) with an inline
  error, and the destructive-checkout warning still applies to the in-folder path.
  No commits or other writes.
- No app-rendered approval UI — users answer prompts directly in the terminal.
  (The v1 "no status system" rule was deliberately narrowed by **#42** — a single
  **busy/idle** indicator — and by **#112**, which adds a third "finished / needs
  input" yellow state to that same dot. Still no approval pills or floating status.)
- No Archive (single **Remove = kill + forget**), no Skills manager, no Fork, no
  light mode, no auth.
- **Settings** now exists (#100/#102/#103 — reverses the v1 "no settings screen"
  rule, as #84 reversed single-window): a sidebar footer gear opens a modal with
  Terminal / Sessions / Appearance / Behavior / Data & About sections (see the
  architecture note). Still no light mode and no per-session config beyond these.
- **Multi-window** is now supported for **Canvas tabs only** (#84 — reverses the v1
  single-window rule): a canvas can open in its own native window (pop-out button +
  drag tear-off) for multi-monitor use. Detached windows are **per-session** (not
  restored on relaunch); Overview and individual panels do **not** pop out, and a
  single PTY is never shown in two windows at once (see the architecture note).
- No code signing / notarization (expect a Gatekeeper warning on first open).

> Status colors were *reserved* design tokens, unused in v1; **#42** put them to use —
> the busy/idle indicator uses `--status-running` (Blue) and `--status-idle` (#55/#71).
> The original design spec and prototype are preserved in git history (commit `b02efd8`).

## Conventions

- Keep the frontend/backend boundary clean: the backend exposes typed Tauri
  commands/events; the frontend wraps them in a typed IPC layer.
- Keep terminal byte streams out of React state — xterm.js consumes them directly
  to avoid re-render storms.
- **Sessions & resume:** each session is a `claude` PTY. New sessions are spawned
  as `claude --session-id <uuid>` (we own the id); on boot they resume via
  `claude --resume <uuid>`. **These flags are verified** against the real CLI
  (claude 2.1.x, #30): the id round-trips, and `--resume` of an unknown id exits 1
  ("No conversation found"). On boot, persisted sessions show a neutral
  **"reconnecting"** state (not an error) until their first output / a real exit;
  a failed resume shows that one terminal's exit overlay + Restart, not a toast
  wall. Session metadata + recent dirs persist to `sessions.json` in the app-data
  dir (`store.rs`). `Remove` = kill + delete the record. A **scheduled** session
  (#93) additionally boots with an **initial prompt** passed **positionally**:
  `claude --session-id <uuid> "<prompt>"` (`pty.rs spawn_session_with_prompt`). This
  is **verified** against the real CLI (claude 2.1.x): `claude --help` documents
  `claude [options] [command] [prompt]` — a positional prompt that starts the
  interactive session with it sent. If a future `claude` version changes these
  flags, update `pty.rs` (`spawn_session` / `spawn_session_with_prompt` /
  `resume_session`) and note it here. Since **#101** these spawn/resume paths resolve
  a pluggable **`AgentSpec`** (`agents.rs`) keyed by each record's stored `agent`
  (serde-default `"claude"`) rather than hardcoding the binary — claude remains the
  only agent and its flags are unchanged.
- **Exit handling (#63):** the discriminator is the exit code (`store.ts`
  `onExited` / the pure `isCleanExit`). A **clean exit — `claude` exits code 0
  while running** (the user ended the agent) is forgotten like _Remove_:
  `forgetExitedSession` drops it from the store (its pooled xterm is disposed by
  `reconcileTerminals`) **and** its persisted record (so it doesn't return on next
  boot), with a brief "Agent exited" toast — no overlay, no Restart. **Any other
  exit** (non-zero/crash, or a failed boot resume) keeps the session with its
  `exitedCode`, so `Terminal.tsx` shows the "Process exited (code N)" overlay +
  Restart. **Restart** (`restartSession` → `resume_session`) spawns a fresh PTY
  under the same id; on success the Terminal calls `terminalPool.resetTerminal`
  to dispose + recreate the pooled xterm so the relaunched TUI repaints cleanly
  instead of appending onto the dead session's screen. The boot window is guarded
  (`booting`): a code-0 exit there keeps the overlay rather than auto-forgetting,
  and **app shutdown keeps records** (`kill_all` doesn't delete them) so they
  auto-resume on next boot (#30) — the only path that "offers to restart."
- **Window chrome:** the **standard native macOS title bar** (#19) — native
  traffic lights, native title (`title: "ClaudeCue"`), native drag, no custom
  positioning. The window config carries no `titleBarStyle`/`hiddenTitle`/
  `trafficLightPosition`, and there is no custom `Titlebar` component or
  `data-tauri-drag-region` (the earlier overlay chrome from #3 was removed). The
  webview content area sits cleanly below the native bar, so the app shell starts
  at the top of the content area (no reserved top strip). **Detached canvas windows
  (#84)** use the same native chrome; they're created from Rust
  (`open_canvas_window`) with the label `canvas-<id>` and a `?canvas=<id>` route, so
  no JS window-create permission is needed — only the `canvas-*` capability so the
  new window can invoke commands + listen to events.
- **Builds & distribution:** `npm run tauri build` produces a local **unsigned**
  macOS `.app`/`.dmg` (Gatekeeper warns on first open — no code signing /
  notarization). There is **no in-app auto-update and no release pipeline**: the
  repo is private and the #15 updater (Tauri updater/process plugins, the baked-in
  minisign pubkey, and the release workflow) was removed in **#62**. The bundle ships
  a partial `src-tauri/Info.plist` (auto-merged by the Tauri CLI in both `dev` and
  `build`) declaring `NSMicrophoneUsageDescription` / `NSSpeechRecognitionUsageDescription`
  so voice dictation works inside a session's PTY (macOS attributes a child process's
  mic request to the responsible app — ClaudeCue).
- **Styling:** CSS Modules (`*.module.css` next to each component) that consume
  the design tokens in `src/styles/tokens.css`. The reset, base styles,
  scrollbars, keyframes, and the `prefers-reduced-motion` killswitch live in
  `src/styles/global.css`. Tokens, global CSS, and the bundled **JetBrains Mono**
  font (`@fontsource`, offline — never a CDN) are imported once in
  `src/main.tsx`. Stay on-system: use tokens, never off-system colors. The color
  tokens are a **Catppuccin Mocha** remap (#33) — accent is **Peach**, with
  `--accent-fg` for readable text on the (light) accent fill, `--scrim` for
  full-window dim overlays, and `--status-*` repointed to Catppuccin accents. A
  custom accent from Settings (#102) overrides `--accent` **and** its derived
  companions `--accent-hover` / `--accent-dim` / `--accent-fg` together
  (`accentCompanions`, #107). See the **Design reference** in `TASKS.md` (the
  original near-black v1 palette; superseded by the Mocha tokens).

## Tasks

Work is tracked in `TASKS.md`. **#1–#113 have shipped — the backlog is fully
implemented, with no open tasks.** Completed tasks are condensed into an **Implemented
(completed tasks)** summary at the top (one line each, grouped by theme), with full
per-task detail in git history; the `## Tasks` body holds any open tasks (currently
none). New tasks go there in `TASKS-TEMPLATE.md` format with `Depends on:`
prerequisites. The `(#N)` provenance markers throughout this doc index back to that
summary + git history.

**Never skip a task.** When implementing the backlog (`/develop-tasks`,
`/isolate-agent`, `/handoff`), implement **every** open task whose dependencies are
complete — lowest-numbered first — and **never skip one for being big, risky, or hard to
verify**. A task too large for a single pass is **split into smaller dependent sub-tasks**
(as #93 → #93 + #94) and then implemented; deferring it is not an option.
