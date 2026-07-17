# ReCue

**Mission control for AI coding agents.** ReCue is a **macOS, Windows, and Linux**
desktop app for running and managing many live coding-agent CLI sessions at once —
[Claude Code](https://docs.claude.com/en/docs/claude-code) by default, with
[Codex](https://github.com/openai/codex) and [OpenCode](https://opencode.ai) selectable
as alternatives.

Each session is a **real PTY** running the agent's own CLI — ReCue doesn't wrap,
re-implement, or proxy the agent. It provides everything around it: an **Overview**
"agent wall" of live terminals, an **Attention** inbox of agents waiting on your input,
a **Canvas** split-panel workspace (with file, git-diff, and terminal viewers), a
repo-grouped **sidebar**, scheduling, persistence, and read-mostly git integration —
across **any number of full app windows**. The terminals are the genuine agent TUIs, so
every prompt, permission dialog, and keybinding works exactly as it does in a plain
terminal.

Every feature works on all three platforms (OS-specific behavior is gated behind a
single platform abstraction; see [`CLAUDE.md`](CLAUDE.md)). Linux targets Arch, Ubuntu,
and Mint fully, best-effort for other distros.

## Why ReCue

Running one coding agent in a terminal is easy. Running **eight of them across four
repos** — knowing which ones are working, which are waiting on you, what they changed,
and picking up where each left off after a reboot — is what ReCue is for:

- **See everything at once** — a wall of live terminals grouped by repository, each with
  a status dot that shows *working* (shimmer), *waiting for you* (yellow), or *fresh*
  (gray).
- **Know who needs you** — an **Attention** inbox queues agents that finished and are
  waiting on your input, oldest first, so nothing sits forgotten.
- **Arrange your own workspace** — split-panel Canvas tabs mixing agent terminals, file
  viewers, git diffs, shell terminals, and Kanban boards; open as many full app windows
  as you have monitors, and render the same terminal in several of them at once.
- **Come back to where you were** — sessions, layouts, and settings survive restarts;
  agents that support it resume their conversation automatically on launch.
- **Run agents on your schedule** — queue a session to start later ("tomorrow", "6pm",
  "1h") with a pre-seeded prompt, or relaunch one on a recurring interval.
- **Keep agents out of each other's way** — start any agent on a branch of your choice or
  in an isolated **git worktree**, so parallel agents never fight over a working tree.

## Supported agents

ReCue speaks to agents through a pluggable spec catalog; pick your default in
**Settings → Sessions** (a first-launch picker offers the choice if more than one CLI is
installed). Any agent's CLI must be **installed and authenticated on your `PATH`** —
ReCue shows a clear install hint if it's missing.

| Capability                        | Claude Code | Codex | OpenCode |
| --------------------------------- | :---------: | :---: | :------: |
| Interactive sessions (real PTY)   | ✅          | ✅    | ✅       |
| Prompt-seeded / scheduled launch  | ✅          | ✅    | ✅       |
| Resume conversations across restarts | ✅       | —     | —        |
| Fork a conversation               | ✅          | —     | —        |
| Auto-named sessions (agent's own title) | ✅    | —     | —        |
| Five-hour usage bar + auto-continue | ✅        | —     | —        |

Claude Code is the primary, fully supported agent. Codex and OpenCode own their session
identity, so features built on resumable session ids (resume, fork, auto-naming) are
gracefully hidden for them rather than half-working; both are newer additions and less
battle-tested. New agent specs are additive — see `src-tauri/src/agents.rs`.

## Features

- **Overview wall** — active sessions as live terminal columns, **grouped by repo** with
  colored badges and a per-repo filter; columns are **drag-reorderable**, and a repo can
  add **diff**, **file-viewer**, **terminal**, and **Kanban-board** columns. **Fork** any
  agent's conversation from its header to branch it into a new parallel session (where
  the agent supports it).
- **Attention inbox** — a triage queue of idle agents awaiting your input, oldest first,
  with a confirmed-idle grace so a still-working agent never blinks in. Step through it
  from the keyboard, dismiss items, or narrow it to one repo / branch / worktree from
  the sidebar.
- **Multi-window** — open **any number of full app windows** (⌘⌥N / Ctrl+Alt+N,
  **File → New Window**, a repo's **Open in new window**, or tearing a Canvas tab off).
  Every window is a complete ReCue; the same terminal can render in several windows at
  once (mirrored, tmux-style smallest-fit), and the whole window set — bounds included —
  is restored on relaunch.
- **Canvas** — a split-panel workspace with **multiple named tabs**; drag any sidebar
  item (agent, file, diff, terminal, or Kanban board) in to tile it, split panels on
  their edges, drag a panel's header to reorder it, resize borders. A tab can **pop out
  into a new app window**, and closing a tab can optionally kill everything in it.
  Save reusable **Canvas templates** — a layout of action blocks (start session, open
  terminal, file, or diff) — and open a whole workspace from one in a single step.
- **Dev containers** — flip **Run in dev container** (⌘⇧C / Ctrl+Shift+C) on a new
  Claude session to spawn the agent **inside Docker**: the repo (or worktree) mounted at
  `/work`, a per-session home seeded with your sign-in, branching and commits working
  as normal — and pushes refused by design. The default image builds itself on first
  use; Settings can point at your own.
- **Files & Kanban boards** — open any repo text file in a viewer with markdown
  rendering (including **Mermaid** diagrams) and syntax highlighting; **edit** raw
  markdown / plain text inline with **auto-save**. Open or create a markdown **Kanban
  board** (Obsidian-Kanban format) and manage its cards and columns by drag-and-drop —
  every change is written back to the `.md`, so the board stays a plain file your agents
  can read and edit too.
- **Git, read-mostly** — working-tree and branch-compare diffs, a commit browser,
  per-file seen/changed markers, a file tree tinted by git status, branch checkout and
  creation from the UI, `--ff-only` pull, fetch, and **blobless clone** — but ReCue never
  commits or pushes; that stays between you and your agents.
- **Sidebar** — sessions and their file / diff / terminal / Kanban viewers grouped by
  repository, with isolated **worktree agents** nested under their parent repo.
  Right-click anything for its actions (rename, fork, copy session id, reveal in your
  file manager, kill/close/forget…). Drag a repo header to reorder folders; drag the
  sidebar's edge to resize it.
- **Schedule & recur** — **⌘⇧N** / **Ctrl+Shift+N** queues an agent to launch later at a
  **natural-language** time (`1h`, `6pm`, `tomorrow`), optionally pre-seeded with a
  prompt (with **slash-command autocomplete**) and a branch — including a new branch or
  an isolated worktree created when it fires. Missed schedules catch up on next launch;
  the **⋯** menu adds **recurring** sessions that relaunch a fresh agent on an interval.
- **Keyboard-first, rebindable** — ⌘N / Ctrl+N opens a fast two-step launcher (type-ahead
  recents → branch pick; **Enter** to start, **⌘⏎ / Ctrl+Enter** for an isolated worktree
  agent). ⌥1 / ⌥2 / ⌥3 switch Overview / Attention / Canvas, Shift+arrows move between
  agents or panels, ⌘E / Ctrl+E maximizes the selected item, ⌘W / Ctrl+W closes it — and
  every global shortcut is **rebindable** in Settings → Shortcuts. ⌘-click / Ctrl-click
  any `http(s)` link printed in a terminal to open it in your browser.
- **Persistence + resume** — sessions, layouts, settings, and recent folders survive
  restarts; resumable agents pick their conversation back up by id on launch. An agent
  you end cleanly just disappears; one that crashes keeps a **Restart** button.
- **Themes & settings** — **Dark and Light** themes (Catppuccin Mocha / Latte) with a
  custom accent color, terminal font/spacing/cursor controls, reduce-motion, per-column
  Kanban colors, confirm-gating for destructive actions, and (Linux) rendering
  overrides. Bundled fonts, fully offline — no CDNs.
- **Auto-update** — in-app update checks and one-click installs (minisign-signed), with
  per-version patch notes. Distro-managed installs (e.g. the AUR package) detect that
  and defer to your package manager instead.

## Getting started

1. **Install a coding agent CLI** and make sure it's authenticated and on your `PATH`:
   - [Claude Code](https://docs.claude.com/en/docs/claude-code) (recommended) — `claude`
   - [Codex](https://github.com/openai/codex) — `codex`
   - [OpenCode](https://opencode.ai) — `opencode`
2. **Install ReCue** from the
   [latest release](https://github.com/ErikdeJager/ReCue/releases/latest):
   - **macOS** — download the `.dmg`, drag ReCue to Applications.
   - **Windows** — run the NSIS setup `.exe` (or the `.msi`).
   - **Linux** — see [Install on Linux](#install-on-linux) below.
3. **Launch ReCue**, add a repository folder (⌘N / Ctrl+N or the **+** button), pick a
   branch, and start your first session.

## Install on Linux

Two official Linux builds, from the same release. **Only the AppImage self-updates
in-app** — a distro-packaged install is owned by your package manager, and ReCue detects
that at runtime and hides its update UI.

| Install                          | Self-updates?                     |
| -------------------------------- | --------------------------------- |
| **AppImage** (default download)  | **Yes** — the in-app updater      |
| **AUR `recue-bin`** / **`.deb`** | **No** — use your package manager |

**AppImage** (recommended default — runs on any distro):

```bash
chmod +x ReCue_<version>_amd64.AppImage
./ReCue_<version>_amd64.AppImage
```

It needs **FUSE 2** — Arch: `sudo pacman -S fuse2`; Ubuntu 24.04+: `sudo apt install
libfuse2t64`. FUSE-less fallback (note: an extracted run is **not** self-updating — there
is no `$APPIMAGE` for the updater to replace):

```bash
./ReCue_<version>_amd64.AppImage --appimage-extract && ./squashfs-root/AppRun
```

**Arch / AUR** — [`recue-bin`](https://aur.archlinux.org/packages/recue-bin) repacks the
official `.deb` into a native package: it links the **system** webkit2gtk/GTK (no bundled
Ubuntu userland, no FUSE, faster cold start). **Updated with pacman, not in-app.**

```bash
yay -S recue-bin      # or: paru -S recue-bin
```

Full details — the install matrix, the updater rule, and the maintainer AUR-publish
runbook — are in [`docs/linux-packaging.md`](docs/linux-packaging.md).

### Linux desktop integration

An AppImage is a single self-contained file with no installer, so its **desktop entry
and icon only reach your application menu if you install them**. ReCue itself **never**
writes to `~/.local/share/applications`; installing the entry is an explicit,
user-invoked step:

```bash
scripts/install-linux-desktop.sh ~/Applications/ReCue.AppImage   # asks before writing
scripts/install-linux-desktop.sh --uninstall                     # removes exactly what it wrote
```

The script copies the entry (including its `StartupWMClass=recue`) straight out of the
AppImage, rewrites only `Exec`/`TryExec` to the AppImage's real path, and installs its
icons. It writes only under `$XDG_DATA_HOME`, never uses `sudo`, and is safe to re-run.
A desktop integrator (Gear Lever, appimaged, AppImageLauncher) works too — see
[`docs/linux-desktop-integration.md`](docs/linux-desktop-integration.md).

If the window or its terminals render slowly, the rendering switches live in
**Settings → Rendering** (Linux only): the **DMA-BUF renderer** (auto / on / off —
applies at the next launch) and the **terminal renderer** (auto / WebGL / DOM — applies
immediately), plus a copy-pasteable readout of what ReCue detected at startup.
`RECUE_DISABLE_DMABUF=1|0` overrides the DMA-BUF choice for one run, and a
`WEBKIT_DISABLE_DMABUF_RENDERER` you export yourself is always respected untouched.

## Building from source

**Prerequisites:** [Node.js](https://nodejs.org/) + npm,
[Rust](https://www.rust-lang.org/tools/install) (stable) + Cargo, and — on Linux — the
Tauri toolchain (`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`,
`librsvg2-dev`, `patchelf`).

```bash
npm install
npm run tauri dev      # launch the app (Vite + Rust) with hot reload
npm run tauri build    # build a bundle for the host OS
```

Artifacts land in `src-tauri/target/release/bundle/`:

- **macOS** — `macos/ReCue.app` and `dmg/ReCue_<version>_<arch>.dmg`
- **Windows** — an **NSIS** installer (`nsis/…-setup.exe`) and an **MSI** (`msi/….msi`)
- **Linux** — an **AppImage** and a **`.deb`** (the artifact the AUR
  [`recue-bin`](packaging/aur/recue-bin) package repacks). Run
  `npm run tauri build -- --bundles appimage,deb` to match CI's Linux output.

Each `tauri build` produces the bundle for the OS it runs on — build on each platform
you target (CI's release workflow covers all three).

> A from-scratch local build is **unsigned** — first open warns (macOS Gatekeeper:
> right-click → **Open**; Windows SmartScreen: **More info → Run anyway**). On macOS,
> mic/voice and protected-folder permissions only work **and persist** once the app is
> signed with the Hardened Runtime + entitlements — sign a **local** build with
> `npm run build:mac` (stable self-signed, no Apple account needed). CI releases sign
> self-signed or Developer-ID + notarized depending on which secrets are configured. See
> [`docs/macos-permissions.md`](docs/macos-permissions.md).

### Development scripts

```bash
npm run build          # type-check + build the frontend only
npm run bundle:report  # per-route first-paint JS budget report (after a build)
npm run lint           # ESLint (frontend)
npm run format         # Prettier write (frontend)
npm run format:check   # Prettier check (frontend)
npm test               # Vitest (store / pure-logic unit tests)
npm run lint:rust      # cargo clippy (backend)
npm run format:rust    # cargo fmt (backend)
cargo test --manifest-path src-tauri/Cargo.toml   # Rust unit tests
```

See [`CLAUDE.md`](CLAUDE.md) for the architecture deep-dive and
[`TASK_ARCHIVE.md`](TASK_ARCHIVE.md) for the record of what's been built.
