# ClaudeCue

A **macOS** desktop app for running and managing many live `claude` CLI sessions at
once — an **Overview** "agent wall" of real terminals, a **Canvas** split-panel
workspace (with file and git-diff viewers), and a repo-grouped **sidebar**.

Each session is a real PTY running the Claude Code CLI. ClaudeCue provides the window
chrome, navigation, persistence, and read-only git reading; the terminals come from
`claude` itself.

## Features

- **Overview wall** — active sessions as equal-width live terminal columns, **grouped
  by repo** with colored badges and a per-repo filter; columns are
  **drag-reorderable**, and a repo can add **diff** and **file-viewer** columns.
- **Canvas** — a split-panel workspace with **multiple named tabs**; drag any sidebar
  item (agent, file, or diff) in to tile it, split panels on their edges, resize borders.
- **Sidebar** — sessions and their file/diff viewers grouped by repository (branch
  labels + optional custom names), from persisted recents so repos stay listed with no
  active session. Right-click a repo (new session, change color, open viewers, forget)
  or an agent (**rename**, remove).
- **Keyboard-first** — ⌘N opens a fast new-session launcher (type-ahead recents, ⌘1–9
  quick-select, branch pick, Enter to start); Shift+arrows move between agents and views.
- **Busy indicator** — a per-session pulsing ball shows when `claude` is genuinely
  working (and stays dim while you type).
- **Persistence + resume** — sessions, layouts, and recent folders survive restarts;
  sessions resume their `claude` conversation by id on launch. An agent you end
  cleanly just disappears; one that crashes keeps a **Restart** button.
- **Remove = kill + forget**, **Catppuccin Mocha** theme, bundled **JetBrains Mono**
  (offline), dark theme only.

## Prerequisites

- macOS
- [`claude`](https://docs.claude.com/en/docs/claude-code) (Claude Code CLI)
  **installed and authenticated** on your `PATH` — ClaudeCue runs `claude` for every
  session and shows a clear error if it is missing.
- For building from source: [Node.js](https://nodejs.org/) + npm and
  [Rust](https://www.rust-lang.org/tools/install) (stable) + Cargo.
- Optional: [Zed](https://zed.dev/) on your `PATH` for the "Open in Zed" action.

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
