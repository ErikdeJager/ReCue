# CLAUDE.md

Guidance for working in this repository. ClaudeCue is a **macOS** desktop app for
running and managing many live `claude` CLI sessions at once.

## What this app is

An **Overview** "agent wall" of real terminals, a **Focus** view for one session
with a **git-diff inspector**, and a repo-grouped **sidebar**. Each session is a
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
  (`@dnd-kit/core` + `/sortable` — the app's one drag-and-drop system, #43)
- **Backend (Rust, `src-tauri/`):** **`portable-pty`** for terminals, JSON
  persistence in the app-data dir, read-only git (shells out to `git`), and the
  Tauri **dialog** (folder picker), **opener**, **updater**, and **process** plugins
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
- **Busy indicator (#42):** a backend monitor thread (`pty.rs`) derives each
  session's **busy/idle** from output activity (busy while bytes flowed within a
  ~700ms window) and emits `session://state { id, busy }` on transitions only.
  The store keeps `sessionBusy`; the `BusyIndicator` (animated dots, static under
  reduced-motion) shows in the sidebar, Overview cards, and Focus toolbar.
- **Input / resize:** the `Terminal` sends keystrokes to `write_stdin` and a
  `ResizeObserver` drives `resize_pty`.
- **Persistence / resume:** records + recents survive restarts; on boot the
  manager best-effort `resume_session`s each via `claude --resume <id>`.
- **Git:** `working_diff(cwd)` / `current_branch(cwd)` shell out to `git`; the
  `DiffInspector` and sidebar render the structured result.
- **Views:** the store holds `sessions / selectedId / view / inspectorOpen /
  recents / branches / claudeMissing / toasts`; the app mounts **Overview or
  Focus** (not both). Each session's xterm is owned by a **persistent terminal
  pool** (`Terminal/terminalPool.ts`), created once and **reparented** into the
  active view's slot (parked off-screen otherwise) — so a view switch never
  disposes/recreates the terminal or replays scrollback (which would garble
  `claude`'s width-specific TUI redraw). Scrollback replays once at creation;
  resizes are debounced + applied only while visible.
- **Overview customization:** columns are grouped by repo (#36). Per repo, a
  user-managed list of extra panels (diff #39 / markdown #41) follows the agent
  terminals, and the whole cluster is **drag-reorderable within the repo** (#43,
  dnd-kit) — each column is a sortable keyed by session/panel id, so a reorder
  reparents DOM nodes and never remounts a terminal (pool intact). Persisted per
  repo: `overview_panels` (panel defs) + `overview_order` (the unified item
  order, merged with live items so spawn/exit don't scramble it).
- **Sidebar tree (#45):** each repo lists its sessions **and** its opened files
  (`open_files`, persisted per repo). Opening a file in a viewer registers it
  (Focus Files-tab pick or an Overview file column); the tree row re-opens it as
  an Overview column on click and forgets it on the hover ×. File rows are
  dnd-kit **draggable sources** (drop targets land in Canvas, #47).

## Layout

```
.
├── index.html              # Vite entry
├── src/                    # Frontend (React + TS)
│   ├── main.tsx            # React bootstrap (loads fonts + tokens + global CSS)
│   ├── App.tsx             # App shell: sidebar + Overview/Focus (native title bar)
│   ├── store.ts            # Zustand store (state + cross-cutting actions)
│   ├── ipc.ts              # Typed Tauri command/event wrappers
│   ├── outputBus.ts        # Per-session output pub/sub (bytes kept out of store)
│   ├── paths.ts            # Shared path helpers (repoName)
│   ├── updater.ts          # In-app auto-update (Tauri updater/process plugins)
│   ├── components/         # React components (CSS Module alongside each):
│   │                       #   Sidebar, Overview, Focus, Terminal, FileViewer,
│   │                       #   DiffInspector, BusyIndicator, NewSessionModal,
│   │                       #   Toaster, ViewSwitch, ClaudeMissing, EmptyState,
│   │                       #   UpdatePopup
│   ├── styles/             # tokens.css (design tokens) + global.css (reset/base)
│   └── types/              # Shared TS types (backend-mirrored models)
├── src-tauri/              # Rust backend (Tauri)
│   ├── src/lib.rs          # App builder, state wiring, event forwarding
│   ├── src/main.rs         # Binary entry point
│   ├── src/pty.rs          # Session/PTY core (SessionManager, portable-pty)
│   ├── src/commands.rs     # Tauri command surface + event payloads
│   ├── src/store.rs        # JSON persistence (sessions + recents)
│   ├── src/git.rs          # Read-only git: branch + diff + branch list/checkout
│   ├── src/files.rs        # Read-only file access (list text files/read, path-validated)
│   ├── tauri.conf.json     # Window, bundle, build config
│   ├── capabilities/       # Tauri permission capabilities
│   └── Cargo.toml          # Crate `claudecue` / lib `claudecue_lib`
├── .github/workflows/      # release.yml (CI: version-bump guard → draft release)
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

- **Git is read-only, with one deliberate exception** — ClaudeCue reads git
  (current branch + working-tree diff vs `HEAD`) and never creates branches or
  commits. The lone write is **`git checkout <existing branch>`** from the
  new-session popover (#27): picking a branch checks it out (in the chosen folder)
  before the agent starts. It only switches to a branch that already exists
  locally (validated backend-side) and warns before disrupting another agent
  already running in that folder. No branch creation, commits, or other writes.
- No app-rendered approval UI — users answer prompts directly in the terminal.
  (The v1 "no status system" rule was deliberately narrowed by **#42**: a single
  **busy/idle** indicator now exists. Still no approval pills/awaiting-glow/
  floating.)
- No Archive (single **Remove = kill + forget**), no Skills manager, no Fork, no
  settings screen, no light mode, no multi-window, no auth.
- No code signing / notarization (expect a Gatekeeper warning on first open).

> Status colors were *reserved* design tokens, unused in v1; **#42** starts using
> `--status-awaiting` (Yellow) for the busy indicator. The original design spec
> and prototype are preserved in git history (commit `b02efd8`).

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
- **Window chrome:** the **standard native macOS title bar** (#19) — native
  traffic lights, native title (`title: "ClaudeCue"`), native drag, no custom
  positioning. The window config carries no `titleBarStyle`/`hiddenTitle`/
  `trafficLightPosition`, and there is no custom `Titlebar` component or
  `data-tauri-drag-region` (the earlier overlay chrome from #3 was removed). The
  webview content area sits cleanly below the native bar, so the app shell starts
  at the top of the content area (no reserved top strip).
- **Releases & auto-update:** CI (`.github/workflows/release.yml`) drafts a
  **universal** macOS release when the version in `tauri.conf.json` is bumped past
  the latest `v*` tag; publish the draft for clients to see it. The app
  self-updates from published releases via the Tauri updater plugin (`updater.ts`
  + the `UpdatePopup` component, checked once on boot). Bump the version in
  `tauri.conf.json` + `package.json` + `Cargo.toml` together. The minisign
  **private** key lives only in GitHub secrets (`TAURI_SIGNING_PRIVATE_KEY` /
  `…_PASSWORD`) — never commit it; the public key is in `tauri.conf.json`. Apple
  code-signing/notarization remains out of scope. See `README.md` for the flow.
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

Work is tracked in `TASKS.md` (numbered, dependency-ordered). Each task lists its
`Depends on:` prerequisites and an implementation-notes block. **The v1 plan
(#1–#14) is complete**; `TASKS.md` remains the reference for what was built and why.
