# ClaudeCue

A **macOS** desktop app for running and managing many live `claude` CLI sessions at
once — an **Overview** "agent wall" of real terminals, a **Canvas** split-panel
workspace (with file, git-diff, and terminal viewers), and a repo-grouped **sidebar**.

Each session is a real PTY running the Claude Code CLI. ClaudeCue provides the window
chrome, navigation, persistence, and read-only git reading; the terminals come from
`claude` itself.

## Features

- **Overview wall** — active sessions as equal-width live terminal columns, **grouped
  by repo** with colored badges and a per-repo filter; columns are
  **drag-reorderable**, and a repo can add **diff**, **file-viewer**, and **terminal**
  columns.
- **Canvas** — a split-panel workspace with **multiple named tabs**; drag any sidebar
  item (agent, file, diff, or terminal) in to tile it, split panels on their edges,
  resize borders. A tab can **pop out into its own native window** for multi-monitor use.
- **Sidebar** — sessions and their file / diff / terminal viewers grouped by repository
  (labelled by your custom name, else `claude`'s own session title, else the branch),
  from persisted recents so repos stay listed with no active session; isolated
  **worktree agents** nest under their parent repo. Right-click a repo (new session, a
  **Views** section to add viewers, change color, **kill all agents** / **close all
  items**, forget) or an agent (**rename**, remove). Drag the sidebar's right edge to
  resize it.
- **Schedule sessions** — **⌘⇧N** (or the sidebar's **Schedule session** button) queues
  an agent to launch later at a set time, optionally pre-seeded with a prompt; it fires
  on schedule, catching up anything missed while the app was closed.
- **Settings** — a gear in the sidebar footer opens **Settings**: terminal font /
  spacing / cursor, auto-naming, accent color, reduce-motion, default launch view, and
  confirm-destructive toggles, plus data tools (open data folder, clear recents,
  versions).
- **Keyboard-first** — ⌘N opens a fast two-step new-session launcher (type-ahead recents
  → branch pick; **Enter** to start, **⌘⏎** for an isolated worktree agent), **⌘⇧N**
  schedules one for later. In the app, Shift+arrows move between agents (Overview) or
  panels (Canvas), ⌘1–9 jump between canvases, and ⌘\\ toggles Overview ↔ Canvas.
- **Busy indicator** — a per-session **shimmer** marks when `claude` is genuinely
  working, settling into a calm dot when idle (typing alone doesn't read as busy).
- **Persistence + resume** — sessions, layouts, settings, and recent folders survive
  restarts; sessions resume their `claude` conversation by id on launch. An agent you
  end cleanly just disappears; one that crashes keeps a **Restart** button.
- **Remove = kill + forget**, **Catppuccin Mocha** theme, bundled **JetBrains Mono**
  (offline), dark theme only.

## Prerequisites

- macOS
- [`claude`](https://docs.claude.com/en/docs/claude-code) (Claude Code CLI)
  **installed and authenticated** on your `PATH` — ClaudeCue runs `claude` for every
  session and shows a clear error if it is missing.
- For building from source: [Node.js](https://nodejs.org/) + npm and
  [Rust](https://www.rust-lang.org/tools/install) (stable) + Cargo.

## Develop

```bash
npm install
npm run tauri dev      # launch the app (Vite + Rust) with hot reload
```

## Build

```bash
npm run tauri build    # produces an unsigned macOS .app and .dmg
```

Artifacts land in `src-tauri/target/release/bundle/` (`macos/ClaudeCue.app` and
`dmg/ClaudeCue_<version>_<arch>.dmg`).

> No code signing or notarization — Gatekeeper warns on first open (right-click →
> **Open**, or allow it under **System Settings → Privacy & Security**). The build is a
> **local, unsigned** artifact: there is no in-app auto-update and no release pipeline.

## Develop scripts

```bash
npm run build          # type-check + build the frontend only
npm run lint           # ESLint (frontend)
npm run format         # Prettier write (frontend)
npm run format:check   # Prettier check (frontend)
npm test               # Vitest (store / pure-logic unit tests)
npm run lint:rust      # cargo clippy (backend)
npm run format:rust    # cargo fmt (backend)
cargo test --manifest-path src-tauri/Cargo.toml   # Rust unit tests
```

See [`CLAUDE.md`](CLAUDE.md) for architecture and [`TASKS.md`](TASKS.md) for the
record of what's been built.
