# ClaudeCue

A **macOS** desktop app for running and managing many live `claude` CLI sessions at
once — an **Overview** "agent wall" of real terminals, a **Focus** view for a single
session with a **git-diff inspector**, and a repo-grouped **sidebar**.

Each session is a real PTY running the Claude Code CLI. ClaudeCue provides the window
chrome, navigation, persistence, and read-only git reading; the terminals come from
`claude` itself.

> Early development — see [`TASKS.md`](TASKS.md) for the v1 plan and
> [`CLAUDE.md`](CLAUDE.md) for architecture. A full README lands with packaging
> (task #14).

## Stack

Tauri 2 · React + TypeScript + Vite · Zustand · xterm.js · `portable-pty` (Rust) ·
JetBrains Mono · Lucide. Dark theme only.

## Prerequisites

- macOS
- [Node.js](https://nodejs.org/) + npm
- [Rust](https://www.rust-lang.org/tools/install) (stable) + Cargo
- `claude` (Claude Code CLI) installed and authenticated on your `PATH`

## Develop

```bash
npm install
npm run tauri dev      # launch the app with hot reload
```

## Build

```bash
npm run tauri build    # produces an unsigned macOS .app / .dmg
```

No code signing or notarization in v1 — expect a Gatekeeper warning on first open.
