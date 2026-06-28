# ReCue

A **macOS and Windows** desktop app for running and managing many live `claude` CLI
sessions at once — an **Overview** "agent wall" of real terminals, a **Canvas**
split-panel workspace (with file, git-diff, and terminal viewers), and a repo-grouped
**sidebar**. Every feature works on both platforms (OS-specific behavior is gated
behind a single platform abstraction; see [`CLAUDE.md`](CLAUDE.md)).

Each session is a real PTY running the Claude Code CLI. ReCue provides the window
chrome, navigation, persistence, and read-only git reading; the terminals come from
`claude` itself.

## Features

- **Overview wall** — active sessions as equal-width live terminal columns, **grouped
  by repo** with colored badges and a per-repo filter; columns are
  **drag-reorderable**, and a repo can add **diff**, **file-viewer**, **terminal**, and
  **Kanban-board** columns. **Fork** any agent's conversation from its header to branch
  it into a new parallel session.
- **Canvas** — a split-panel workspace with **multiple named tabs**; drag any sidebar
  item (agent, file, diff, terminal, or Kanban board) in to tile it, split panels on
  their edges, drag a panel's header to reorder it, resize borders. A tab can **pop out
  into its own native window** for multi-monitor use, and closing a tab can optionally
  kill everything in it. Save reusable **Canvas templates** — a layout of action blocks
  (start session, open terminal, file, or diff) — and open a whole workspace from one in
  a single step (each panel resolves on its own, with an inline retry if something can't
  start).
- **Files & Kanban boards** — open any repo text file in a viewer with markdown
  rendering and syntax highlighting (incl. Java + config formats); **edit** raw markdown
  / plain-text inline with **auto-save** (no save button). Open or create a markdown
  **Kanban board** (Obsidian format) and manage its cards and columns by drag-and-drop —
  every change is written back to the `.md`.
- **Sidebar** — sessions and their file / diff / terminal / Kanban viewers grouped by repository
  (labelled by your custom name, else `claude`'s own session title, else the branch),
  from persisted recents so repos stay listed with no active session; isolated
  **worktree agents** nest under their parent repo, and each repo is marked by a small
  repo-colored folder. Right-click a repo (new session, a **Views** section to add
  viewers, **reveal in Finder** / **copy path**, change color, **kill all agents** /
  **close all items**, forget), an agent (**rename**, **fork**, **copy session ID**,
  remove), or any file / diff / terminal / schedule row (**remove**). **Drag a repo
  header up or down to reorder the folders** (no separate handle — the whole header is
  the grip; the order persists). Drag the sidebar's right edge to resize it.
- **Schedule sessions** — **⌘⇧N** (or the sidebar's **Schedule session** button) queues
  an agent to launch later at a set time, optionally pre-seeded with a prompt (which has
  **slash-command autocomplete**) and a branch — including a **new branch** created when
  the schedule fires; it fires on schedule, catching up anything missed while the app
  was closed.
- **Settings** — a gear in the sidebar footer opens **Settings**: terminal font /
  spacing / cursor, auto-naming, accent color, reduce-motion, default launch view, and
  confirm-destructive toggles, plus data tools (open data folder, clear recents,
  versions).
- **Keyboard-first** — ⌘N opens a fast two-step new-session launcher (type-ahead recents
  → branch pick, or **+ add branch** to create one; **Enter** to start, **⌘⏎** for an
  isolated worktree agent), **⌘⇧N** schedules one for later. In the app, Shift+arrows
  move between agents (Overview) or panels (Canvas), ⌘1–9 jump between canvases, and
  ⌘\\ toggles Overview ↔ Canvas.
- **Busy indicator** — a per-session dot marks when `claude` is genuinely working (a
  **shimmer**), turns **yellow** when a turn finishes and it's waiting on you, and
  stays a calm gray when fresh (typing alone doesn't read as busy). **⌘-click** any
  `http`/`https` link printed in a terminal to open it in your browser.
- **Persistence + resume** — sessions, layouts, settings, and recent folders survive
  restarts; sessions resume their `claude` conversation by id on launch. An agent you
  end cleanly just disappears; one that crashes keeps a **Restart** button.
- **Remove = kill + forget**, **Catppuccin Mocha** theme, bundled **JetBrains Mono**
  (offline), dark theme only.

## Prerequisites

- macOS or Windows
- [`claude`](https://docs.claude.com/en/docs/claude-code) (Claude Code CLI)
  **installed and authenticated** on your `PATH` — ReCue runs `claude` for every
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
npm run tauri build    # builds for the host OS (run it on each platform you target)
```

Artifacts land in `src-tauri/target/release/bundle/`:

- **macOS** — `macos/ReCue.app` and `dmg/ReCue_<version>_<arch>.dmg`
- **Windows** — an **NSIS** installer (`nsis/ReCue_<version>_<arch>-setup.exe`) and
  an **MSI** (`msi/ReCue_<version>_<arch>_<lang>.msi`)

Each `tauri build` produces the bundle for the OS it runs on; build on a macOS host for
the macOS artifacts and on a Windows host for the Windows installers.

> No code signing or notarization — first open warns (macOS Gatekeeper: right-click →
> **Open**, or allow it under **System Settings → Privacy & Security**; Windows
> SmartScreen: **More info → Run anyway**). The build is a **local, unsigned** artifact.
>
> **In-app auto-update is live** (#190): the Tauri updater/process plugins, a sidebar
> update indicator → confirm/install-with-progress modal → relaunch, and a post-update
> toast. Updates are **minisign-signed** — `createUpdaterArtifacts` is on and the real
> `pubkey` is baked into `tauri.conf.json`. `.github/workflows/release.yml` runs on every
> push to `main` and, **when the app version is bumped past the latest tag and a matching
> `src/patchnotes/<version>.json` exists**, builds **signed** bundles for **macOS
> (universal) and Windows (x86_64)**, uploads them to one **draft** GitHub release with a
> merged `latest.json`, and waits for a maintainer to **publish** the draft (the updater's
> `/releases/latest/download/latest.json` endpoint only resolves to a published release).
> The signing private key lives in the `TAURI_SIGNING_PRIVATE_KEY` /
> `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repo secrets. OS code signing / Apple notarization
> remain out of scope (the update signatures are minisign-only).

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
