# CLAUDE.md

Guidance for working in this repository. ClaudeCue is a **macOS** desktop app for
running and managing many live `claude` CLI sessions at once.

## What this app is

An **Overview** "agent wall" of real terminals, a **Canvas** split-panel workspace
(with file, **git-diff**, and terminal viewers), and a repo-grouped **sidebar**. Each session is a
**real PTY running `claude`** — ClaudeCue provides the window chrome, navigation,
persistence, and git-reading; the terminals come from the Claude Code CLI itself.

`claude` is assumed to be installed and authenticated on `PATH` (the app surfaces a
clear error if it is missing).

## Stack

- **Tauri 2** desktop shell (macOS only)
- **Frontend:** React + TypeScript + Vite, **Zustand** for state, plain CSS with
  CSS-variable design tokens (CSS Modules), **xterm.js** terminals, **Lucide**
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
- **Busy indicator (#42/#55/#71):** a backend monitor thread (`pty.rs`) derives each
  session's **busy/idle** from output activity (within a ~700ms window) and emits
  `session://state { id, busy }` on transitions only. So **keystroke echo doesn't
  read as busy** (#55), `write_stdin` stamps a per-session `last_input` time and the
  monitor marks busy only when output arrived ≥300ms *after* the last keystroke. The
  store keeps `sessionBusy`; the `BusyIndicator` is a **small spinner arc** (#71) — a
  Blue (`--status-running`) ring whose top edge rotates while busy, settling into a calm
  static dot (`--status-idle`) when idle, **always rendered** (a full static ring under
  reduced-motion) and placed **before the agent's name** — in the sidebar rows and
  Overview card headers.
- **Input / resize:** the `Terminal` sends keystrokes to `write_stdin` and a
  `ResizeObserver` drives `resize_pty`.
- **Persistence / resume:** records + recents survive restarts; on boot the
  manager best-effort `resume_session`s each via `claude --resume <id>`.
- **Git:** `working_diff(cwd)` / `current_branch(cwd)` / `compare_branches(cwd, base,
  target)` (the #81 two-dot branch compare) shell out to `git`; the `DiffInspector` and
  sidebar render the structured result.
- **Views:** the store holds `sessions / selectedId / view / recents / branches /
  canvases / activeCanvasId / claudeMissing / toasts`; the app mounts one of
  **Overview or Canvas** (#46/#75 — Focus was removed). Each session's xterm is owned
  by a **persistent terminal
  pool** (`Terminal/terminalPool.ts`), created once and **reparented** into the
  active view's slot (parked off-screen otherwise) — so a view switch never
  disposes/recreates the terminal or replays scrollback (which would garble
  `claude`'s width-specific TUI redraw). Scrollback replays once at creation;
  resizes are debounced + applied only while visible.
- **Overview customization:** columns are grouped by repo (#36). Per repo, a
  user-managed list of extra panels (diff #39 / markdown #41 / terminal #72) follows the agent
  terminals, and the whole cluster is **drag-reorderable within the repo** (#43,
  dnd-kit) — each column is a sortable keyed by session/panel id, so a reorder
  reparents DOM nodes and never remounts a terminal (pool intact). Persisted per
  repo: `overview_panels` (panel defs) + `overview_order` (the unified item
  order, merged with live items so spawn/exit don't scramble it).
- **Sidebar tree (#45/#59):** each repo lists its sessions **and** its non-agent
  items — the **same `overview_panels` Overview shows, 1:1**: file viewers, diff
  viewers, and shell terminals (#72). #59 folded the old per-repo `open_files` into
  `overview_panels`, so an item opened anywhere (the searchable file picker #56, or the
  repo menu's **Views** section #82) appears in both places. A tree row click
  **selects/jumps to the item in the current view** (#79 — never auto-switching
  Overview↔Canvas); the hover × removes the item (and its Overview column); every row
  (session / file / diff / terminal) is a dnd-kit **draggable source** that drops into
  the active Canvas (#47/#59 — agents → terminal, files → file viewer, diffs → diff
  panel; new item types are draggable by default via a `payloadToContent` case).
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

## Layout

```
.
├── index.html              # Vite entry
├── src/                    # Frontend (React + TS)
│   ├── main.tsx            # React bootstrap (loads fonts + tokens + global CSS)
│   ├── App.tsx             # App shell: sidebar + Overview/Canvas (native title bar)
│   ├── store.ts            # Zustand store (state + cross-cutting actions)
│   ├── ipc.ts              # Typed Tauri command/event wrappers
│   ├── outputBus.ts        # Per-session output pub/sub (bytes kept out of store)
│   ├── paths.ts            # Shared path helpers (repoName, sessionLabel)
│   ├── useKeyboardNav.ts   # Global keyboard shortcuts (#24/#76/#77)
│   ├── components/         # React components (CSS Module alongside each):
│   │                       #   Sidebar, Overview, Canvas, Terminal,
│   │                       #   FileViewer, FilePicker, DiffInspector,
│   │                       #   BusyIndicator, Checkbox, NewSessionModal, Toaster,
│   │                       #   ViewSwitch, ClaudeMissing, EmptyState
│   ├── styles/             # tokens.css (design tokens) + global.css (reset/base)
│   └── types/              # Shared TS types (backend-mirrored models)
├── src-tauri/              # Rust backend (Tauri)
│   ├── src/lib.rs          # App builder, state wiring, event forwarding
│   ├── src/main.rs         # Binary entry point
│   ├── src/pty.rs          # Session/PTY core (SessionManager, portable-pty)
│   ├── src/commands.rs     # Tauri command surface + event payloads
│   ├── src/store.rs        # JSON persistence (sessions + recents)
│   ├── src/git.rs          # Git: branch + diff + compare (#81) + list + checkout + worktree (#74)
│   ├── src/files.rs        # Read-only file access (list text files/read, path-validated)
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
  git (current branch + working-tree diff vs `HEAD`) and never creates branches or
  commits. Its writes are: (1) **`git checkout <existing branch>`** from the
  new-session panel (#27/#53/#61) — picking a branch checks it out (in the chosen
  folder, only an existing local branch, validated backend-side) before the agent
  starts, warning before disrupting another agent already running in that folder;
  and (2) **`git worktree add` / `git worktree remove`** for isolated worktree
  agents (#74) — **⌘⏎** in the branch step starts an agent in an app-managed
  worktree (`<app-data>/worktrees/<repo-id>/<branch>`) on an existing branch, shown
  nested under its parent repo in the sidebar; the worktree is removed (ref-counted)
  only when its last agent goes, and a dirty worktree is kept rather than
  force-deleted. No branch creation, commits, or other writes.
- No app-rendered approval UI — users answer prompts directly in the terminal.
  (The v1 "no status system" rule was deliberately narrowed by **#42**: a single
  **busy/idle** indicator now exists. Still no approval pills/awaiting-glow/
  floating.)
- No Archive (single **Remove = kill + forget**), no Skills manager, no Fork, no
  settings screen, no light mode, no multi-window, no auth.
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
  dir (`store.rs`). `Remove` = kill + delete the record. If a future `claude`
  version changes these flags, update `pty.rs` (`spawn_session` /
  `resume_session`) and note it here.
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
  at the top of the content area (no reserved top strip).
- **Builds & distribution:** `npm run tauri build` produces a local **unsigned**
  macOS `.app`/`.dmg` (Gatekeeper warns on first open — no code signing /
  notarization). There is **no in-app auto-update and no release pipeline**: the
  repo is private and the #15 updater (Tauri updater/process plugins, the baked-in
  minisign pubkey, and the release workflow) was removed in **#62**.
- **Styling:** CSS Modules (`*.module.css` next to each component) that consume
  the design tokens in `src/styles/tokens.css`. The reset, base styles,
  scrollbars, keyframes, and the `prefers-reduced-motion` killswitch live in
  `src/styles/global.css`. Tokens, global CSS, and the bundled **JetBrains Mono**
  font (`@fontsource`, offline — never a CDN) are imported once in
  `src/main.tsx`. Stay on-system: use tokens, never off-system colors. The color
  tokens are a **Catppuccin Mocha** remap (#33) — accent is **Peach**, with
  `--accent-fg` for readable text on the (light) accent fill, `--scrim` for
  full-window dim overlays, and `--status-*` repointed to Catppuccin accents. See
  the **Design reference** in `TASKS.md` (the original near-black v1 palette;
  superseded by the Mocha tokens).

## Tasks

Work is tracked in `TASKS.md`. **Nearly the whole backlog has shipped** (#1–#83 and
#85–#87; only **#84** is still open) — completed tasks are condensed into an
**Implemented (completed tasks)** summary at the top (one line each, grouped by theme),
and the `## Tasks` body holds only the open task(s); per-task detail for completed work
lives in git history. New tasks, when added, go in the `## Tasks` section in
`TASKS-TEMPLATE.md` format with `Depends on:` prerequisites. The `(#N)` provenance
markers throughout this doc index back to that summary + git history.
