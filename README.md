# ClaudeCue

A **macOS** desktop app for running and managing many live `claude` CLI sessions at
once — an **Overview** "agent wall" of real terminals, a **Focus** view for a single
session with a **git-diff inspector**, and a repo-grouped **sidebar**.

Each session is a real PTY running the Claude Code CLI. ClaudeCue provides the window
chrome, navigation, persistence, and read-only git reading; the terminals come from
`claude` itself.

## Features

- **Overview wall** — every active session as an equal-width live terminal column,
  scrolling horizontally past capacity.
- **Focus view** — one large terminal plus a toolbar (view switch, copy-able
  `repo · branch · id` chip, Open in Zed) and a collapsible **Diff inspector**
  showing the working-tree diff vs `HEAD` (unified or split).
- **Sidebar** — sessions grouped by repository (with branch labels), sourced from
  persisted recents so repos stay listed even with no active session.
- **Persistence + resume** — sessions and recent folders survive restarts; sessions
  resume their `claude` conversation by id on launch.
- **Remove = kill + forget**, bundled **JetBrains Mono** (offline), dark theme only.

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

> No code signing or notarization in v1 — Gatekeeper will warn on first open
> (right-click → **Open**, or allow it under **System Settings → Privacy & Security**).

## Develop scripts

```bash
npm run build          # type-check + build the frontend only
npm run lint           # ESLint (frontend)
npm run format         # Prettier write (frontend)
npm test               # Vitest (store / pure-logic unit tests)
npm run lint:rust      # cargo clippy (backend)
npm run format:rust    # cargo fmt (backend)
cargo test --manifest-path src-tauri/Cargo.toml   # Rust unit tests
```

See [`CLAUDE.md`](CLAUDE.md) for architecture and [`TASKS.md`](TASKS.md) for the v1
plan and per-task implementation notes.
