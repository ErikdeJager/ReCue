# CLAUDE.md

Guidance for working in this repository. ReCue is a **macOS and Windows** desktop
app (#139/#140/#143) for running and managing many live `claude` CLI sessions at once.
Per-OS divergence is `#[cfg(...)]`-gated in Rust and a single store-cached `platform`
signal in the frontend; the macOS arm is always the original behavior.

## ⚠️ Cross-platform is a hard requirement (read this first)

**ReCue ships on BOTH macOS and Windows. Every feature, fix, and refactor MUST
be functional on both platforms — no exceptions.** This is not aspirational; it is a
release constraint. macOS-only and Windows-only are both bugs.

When you implement *anything*, treat "does this work on the other OS?" as part of the
definition of done — before you consider the task complete, walk the change against
Windows **and** macOS in your head (and verify on a real box when the path can't be
unit-tested). Concretely:

- **Never assume one OS.** No hardcoded `/`-paths, POSIX-only shell-outs, `$HOME`,
  `open`/`explorer.exe`, `Cmd`-only key handling, or macOS-only system calls in a
  code path that runs on both. If a primitive differs by OS, it gets an abstraction.
- **Gate genuine divergence explicitly** — `#[cfg(windows)]` / `#[cfg(unix)]` /
  `#[cfg(target_os = "macos")]` in Rust (with the *other* arm always provided, never
  left to fail to compile), and the store-cached **`platform`** signal +
  `src/platform.ts` helpers in the frontend. The macOS arm always preserves the
  original behavior byte-for-byte; the Windows arm is additive.
- **Reuse the established cross-platform seams instead of re-deriving them** — Rust:
  `path_env::home_dir()` (`%USERPROFILE%` on Windows, never raw `$HOME`),
  `git::hidden_command()` (the `CREATE_NO_WINDOW` console-flash guard — **every**
  shelled-out `git`/CLI probe goes through it), `pty::resolve_command()` /
  `find_on_path` / `launch_target` (PATHEXT + `cmd.exe /C` for `.cmd` agents),
  `commands.rs` path-segment guards (`windows_safe_seg` for reserved device names);
  Frontend: `joinPath` / `splitPath` (split on `/` **or** `\`), `kbdHint` /
  `revealLabel` (⌘↔Ctrl, "Reveal in Finder"↔"Reveal in Explorer"), `openUrl`→the
  http/https-only `open_url`, and `metaKey || ctrlKey` for **every** shortcut handler.
- **CSS / WebView too:** WKWebView (macOS) and WebView2/Chromium (Windows) diverge —
  prefer `::-webkit-scrollbar` styling, ship plain-color fallbacks alongside
  `color-mix`, and avoid macOS-only `-webkit-`/vibrancy effects without a fallback.
- **Mirror docs across the OS divide.** User-facing copy that names a platform reads
  "macOS and Windows" (or routes through `kbdHint`/`revealLabel`), never "macOS only."
- **When a path genuinely can't be unit-tested on CI** (GUI spawn, installer, ConPTY
  reflow), implement it for both OSes anyway and record what still needs a real-box
  check in **`TRAJECTORY_TO_WINDOWS.md`** (the running log of Windows parity work) —
  do not silently ship a macOS-only path.

If a task as written would only work on one OS, that is a defect in the task: build
the cross-platform version (gating divergence as above), not the single-OS shortcut.
The detailed per-subsystem notes throughout this doc and `TRAJECTORY_TO_WINDOWS.md`
show how each existing feature already honors this.

## What this app is

An **Overview** "agent wall" of real terminals, a **Canvas** split-panel workspace
(with file, **git-diff**, and terminal viewers), and a repo-grouped **sidebar**. A
Canvas tab can **pop out into its own native window** for multi-monitor use (#84).
Each session is a **real PTY running `claude`** — ReCue provides the window
chrome, navigation, persistence, and git-reading; the terminals come from the
Claude Code CLI itself.

`claude` is assumed to be installed and authenticated on `PATH` (the app surfaces a
clear error if it is missing). Because a bundled `.app` launched from Finder/Dock
inherits launchd's minimal `PATH` (not the shell's), `run()` first calls
`path_env::restore_user_path()` to adopt the **login-shell PATH** at startup
(release builds only) — without it `claude` reads as "not found" in `tauri build`
even though it works in `tauri dev`.

## Stack

- **Tauri 2** desktop shell (macOS + Windows — see the cross-platform requirement above)
- **Frontend:** React + TypeScript + Vite, **Zustand** for state, plain CSS with
  CSS-variable design tokens (CSS Modules), **xterm.js** terminals (⌘-clickable
  `http`/`https` links via `@xterm/addon-web-links`, #109), **Lucide**
  icons, **JetBrains Mono** (bundled, offline), **react-markdown + remark-gfm**
  (GFM markdown, no raw HTML) + **Prism.js** (curated-language code highlighting —
  JS/TS/JSX, Rust, Python, JSON/YAML/TOML, CSS, markup, Bash, **Java**, **INI/.env/
  .properties** #150) — both in the universal **`FileViewer`** (#40/#44), whose **raw
  markdown / plain-text** view is an editable, auto-saving `<textarea>` (#148); the same
  markdown stack also renders the markdown **Kanban board** (#141–#151). **dnd-kit**
  (`@dnd-kit/core` + `/sortable` — the app's one drag-and-drop system, #43; also Kanban
  card DnD #143), **react-resizable-panels** (Canvas split resizing, #46)
- **Backend (Rust, `src-tauri/`):** **`portable-pty`** for terminals, JSON
  persistence in the app-data dir, read-only git (shells out to `git`), and the
  Tauri **dialog** (folder picker) plugin
- Dark theme only

## Architecture (data flow)

- **Spawn:** `spawn_session(cwd, name)` → `SessionManager` (`pty.rs`) opens a PTY
  running `claude --session-id <uuid>`, registers it by id, and persists a record
  (`store.rs`). A per-session reader thread pushes output to a bounded scrollback
  buffer and an `mpsc` channel. A **fork** (#126, `fork_session`) is a spawn variant
  that branches a source agent's conversation into a new parallel session
  (`--session-id <new> --resume <source> --fork-session`) — see Conventions.
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
  sidebar render the structured result. `list_branches` returns both **local** (`all`)
  and **remote-tracking** (`remote`, qualified `<remote>/<name>`, deduped vs local,
  `*/HEAD` excluded) branches (#180); `fetch_remotes(cwd)` runs a best-effort `git
  fetch --prune` (the app's first git **network** read, `GIT_TERMINAL_PROMPT=0` so a
  private remote fails fast) to refresh them before the new-session branch picker lists
  them. The store's `branches` map (path → current branch) is re-read by
  `refreshBranches` → `current_branches` not only on the top-level repo set changing and
  after app-initiated checkouts, but also on each session's **busy→idle edge**
  (debounced ~600ms, #212 — mirroring the #97 title reader's cadence), so an
  **in-terminal `git checkout`** (incl. inside a worktree) updates the sidebar's
  branch/worktree label by the next idle settle without an app restart.
- **Views:** the store holds `sessions / selectedId / view / recents / branches /
  canvases / activeCanvasId / claudeMissing / toasts / schedules / settings /
  sidebarWidth / folderOrder`; the app mounts one of
  **Overview or Canvas** (#46/#75 — Focus was removed). Each session's xterm is owned
  by a **persistent terminal
  pool** (`Terminal/terminalPool.ts`), created once and **reparented** into the
  active view's slot (parked off-screen otherwise) — so a view switch never
  disposes/recreates the terminal or replays scrollback (which would garble
  `claude`'s width-specific TUI redraw). Scrollback replays once at creation;
  resizes are debounced + applied only while visible. The pool's `createHost`
  **linkifies `http`/`https` URLs** (a `WebLinksAddon`) so a **⌘-click** opens the
  default browser via the dependency-free Rust `open_url` (http/https only, so no
  shell-injection vector even where the opener is `cmd`) — for both agent and shell
  terminals (#109). `open_url` is **cross-platform** (#217): macOS `open`, Windows
  `cmd /C start "" <url>`, else `xdg-open` — so the same path (and the #210 feedback
  button) opens the browser on Windows too, not a File Explorer folder.
- **Overview customization:** columns are grouped by repo (#36) — by a session's
  pure **`effectiveRepo`** (`paths.ts`), so a worktree agent (#74) sits in its
  **parent repo's** cluster sharing its color, text-badged "worktree" rather than
  reading as a foreign-colored stray (#96). On an Overview card / Canvas panel
  **header**, a worktree agent uses the **same** `OpenViewButton` (the views /
  new-session popover, scoped to its worktree folder) as a normal agent, and
  "worktree" is a **static, non-clickable badge** styled like the "fork" badge (#213
  — superseding the earlier clickable `WorktreeViewsBadge`, now removed). Per repo, a
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
  (session / file / diff / terminal / kanban) is a dnd-kit **draggable source** that drops
  into the active Canvas (#47/#59 — agents → terminal, files → file viewer, diffs → diff
  panel; new item types are draggable by default via a `payloadToContent` case). Every
  row also has a **right-click context menu**: the agent row offers **Rename** /
  **Fork conversation** (dimmed + tooltip when the source has no history, #138) / **Copy
  session ID** / **Remove** (#57/#131); a **worktree header** offers **Reveal in Finder**
  / **Copy absolute path** (#133); and the file/diff/terminal/scheduled rows a single
  **Remove** (or **Cancel** for a schedule) item — all via a shared `RowContextMenu`
  (#132). The
  repo's context menu (#54) offers **New session** (which — like the inline per-repo
  **+** — runs `startRepoSession` (#127), **skipping the folder step**: a git folder
  opens the modal straight at the branch step, a non-git folder spawns with no modal;
  the global ⌘N / button keeps the folder step), a **Views** section to add
  file/diff/terminal/**kanban-board** panels (#82/#145; the single "Kanban board" entry
  opens a `.md`-scoped `FilePicker` with an in-picker create-or-open flow #151),
  non-destructive **Reveal in Finder** / **Copy path**
  utilities (#130 — `reveal_path` shells out to macOS `open`, no shell) + a **Pull**
  item (#181 — `git pull --ff-only` on the folder's current branch, toasted; shown
  only when a current branch is known; mirrored in the worktree header menu), repo
  color (#35), and destructive actions —
  **Kill all agents** / **Close all items** (#91) and **Forget folder** (#31), the
  latter two also tearing down the folder's non-agent items (killing their PTYs) and
  pending schedules (#106); each destructive step is confirm-gated unless turned off
  in Settings (#103). Each repo header carries a **static, non-interactive
  repo-colored folder** marker (the Lucide `Folder` icon, tinted via `repoColor`, #128)
  before the repo name, occupying the activity-dot slot (#95); the name still filters
  Overview (#34). _(#113 made folders collapsible with a repo-colored disclosure
  triangle + a persisted `collapsed_repos`; **#115 reverted that** at the user's
  request — folders are non-collapsible again, all child rows always render, and the
  triangle became a cube, which **#128** then swapped for the folder icon.)_ Every
  tree-row label renders at a uniform compact 10px (`--fs-meta-xs`, #111).
- **Canvas (#46/#47/#58):** a third view — **multiple named tabs** (#58), each its
  own recursive **BSP split-panel** layout (a binary tree `split{dir,a,b,sizes}` /
  `leaf{id,content}`; pure ops in `Canvas/canvasTree.ts`). The tabs (`canvases` =
  `{id,name,layout}[]` + `activeCanvasId`) persist as one opaque `canvases` JSON blob
  (migrated once from the old single `canvas_layout`); the `CanvasTabs` strip adds
  (+), closes (always keeps ≥1), inline-renames, and drag-reorders tabs via a nested
  dnd-kit context. Panels host **real content** (#47): agent terminals (#18 pool),
  file viewers (#44), diff viewers (#39), shell terminals (#72), and **kanban boards**
  (#145) — a `content` descriptor `{kind, ...refs}`
  resolved at render. **Drag-in:** one **app-level dnd-kit context** (`App.tsx`)
  spans the sidebar (drag sources: sessions, files, diffs #59) and Canvas (center +
  edge drop zones); `Canvas/canvasDrop.ts` maps payloads → content and applies the
  split/append **to the active tab**. Dropping on an edge splits recursively, borders
  resize via **react-resizable-panels**, panels close. An **existing** panel can also be
  **moved/reordered** by dragging its header onto another panel's edge (#135 `moveLeaf` —
  remove + re-split **reusing the leaf's id + content**, so the pooled terminal reparents,
  applied atomically on drop; the **whole header bar** is the grip #144, and a long title
  truncates with an ellipsis #146). Closing a tab that **has contents** prompts **Kill /
  Keep / Cancel** via the `CanvasCloseModal` (#137 — Kill tears down the tab's leaves;
  default configurable in Settings → Behavior). The Overview wall and the tab
  strip keep their own nested sortable contexts (#43/#58) — only one view mounts at a
  time, so targets never clash.
- **Canvas templates (#117/#118):** reusable saved Canvas layouts whose leaves hold
  inert action **blocks** (`new-agent` w/ optional prompt + optional custom **name** #136,
  `new-terminal`, `open-file` w/ a relative path, `open-diff`) instead of live content. A
  single **block registry**
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
  survive. Instantiating a template into a **sole empty canvas** replaces that tab in
  place rather than leaving an empty tab behind (#142); 2+ tabs, or a tab with panels,
  still append.
- **File editing & Kanban board (#141/#143/#145/#147/#148/#149/#150/#151):** the
  universal `FileViewer` (#40/#44) renders markdown and highlights code (Prism); its
  **raw markdown / plain-text** view is **editable + auto-saving** via the shared
  `useAutoSaveFile(repoPath, file, active)` hook (`src/useAutoSaveFile.ts` — read +
  hot-reload poll + debounced `writeTextFile` + a dirty/focus reconcile that pauses the
  poll while editing + IME-safe + a "Saving…/Saved" status), while rendered markdown, the
  Prism **code** view, and large files stay read-only (#148). A **markdown Kanban board**
  is a first-class content kind (`kind:"kanban"`, reusing the `file` panel's refs +
  `overview_panels`, no new blob): the pure `parseBoard`/`serializeBoard` engine
  (`components/Kanban/kanban.ts`, **Obsidian-Kanban** format — `## column` + `- [ ] card`,
  frontmatter + `**Complete**` + `%% kanban:settings %%` preserved verbatim) round-trips
  the `.md`, and the `KanbanPanel` renders columns + cards (markdown bodies, horizontal
  scroll, hot-reload) **fully editable** — add/edit/delete/reorder cards (nested dnd-kit;
  dragging a card between lanes = status change), column ops, and a **Board/Raw** toggle
  (#147, Raw editable #149) — every mutation and the Raw textarea routed through the **same**
  `useAutoSaveFile` buffer and written back via `write_text_file` (#141, the app's first
  arbitrary file write). Opened from the repo **Views** menu's single "Kanban board" entry
  with an in-picker **create-or-open** flow (#151), a draggable sidebar row, an Overview
  column, and a Canvas panel.
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
  **Canvas panel**. Time helpers live in `src/time.ts`. The schedule **prompt** field
  (in both the `NewSessionModal` schedule step and the `ScheduledPanel`) is a shared
  **`SkillAutocomplete`** component (#114): typing `/` in command position opens a
  dropdown of the slash-invokable **skills** `claude` would offer, read best-effort by
  the Rust **`skills.rs`** (`list_skills(cwd)`) from project (`<cwd>/.claude/skills/*/SKILL.md`
  + `.claude/commands/**/*.md`) and user (`~/.claude/…`) dirs, deduped (project shadows
  user); ↑/↓/Enter/Tab insert `/<skill-name> ` (with a container-key guard so Enter/Escape
  drive the menu, not the modal). Plugin/marketplace skills are out of scope.
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
  **Sessions** (the #97 auto-name toggle + the #142 **Coding agent** selector →
  `defaultAgent`, now claude / codex / **opencode** with an inline "untested" caution
  for the non-claude picks),
  **Appearance** (an accent swatch over the Catppuccin palette + a reduce-motion
  toggle), **Behavior** (default launch view + confirm-destructive gating #103 + the
  Canvas tab-close default `canvasCloseBehavior`: Ask / Always kill / Never kill #137),
  and **Data & About** (open data folder, clear recents, app + `claude` versions). A
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
  `resume_session`) resolves the spec instead of hardcoding `"claude"`. **#141** adds the
  **`codex`** spec + its backend capability gating: Codex owns its own session identity
  (`codex [PROMPT]`, **no** `--session-id`), and `supports_resume` / `supports_auto_name`
  are `false`, so the boot-resume loop / Restart / Fork (typed `ResumeUnsupported`) and the
  #97/#138 title+forkable globs are all gated off for Codex (a per-session `uses_claude_log`
  flag, carried in the monitor's title-worker poke, skips the glob — Codex reports
  `forkable: false`, falls back to the branch label). An `agent_info(agent)` command exposes
  each spec's binary / install-hint / capabilities + a live `--version` presence check.
  **Claude behaves byte-for-byte as before.** **#142** surfaces the choice: a **Coding
  agent** selector in Settings → Sessions persists a `defaultAgent` that every new-session
  spawn path threads through (global / per-repo #127 / worktree #74 / scheduled #93 /
  template `new-agent` #118; a Fork inherits the *source's* agent). A TS capability mirror
  (`src/agents.ts`) gates the UI: Fork is disabled with a Codex-specific tooltip
  (`forkUnavailableReason`, `paths.ts`), copy-resume / Copy-session-ID are hidden for a
  non-resumable agent, and `ClaudeMissing` reads the selected agent's `agent_info` to name
  the right CLI + install hint. Selecting Claude leaves everything exactly as before.
  A later task adds the **`opencode`** spec — a third, **untested** agent. Like Codex it
  owns its own session identity (no app `--session-id`), so resume/fork/auto-name are
  gated off (`uses_claude_log=false`, `forkable:false`). OpenCode's bare positional is a
  **project directory**, not a prompt, so a seeded launch passes the prompt via
  `opencode --prompt "<text>"` (best-effort — **verify against the installed `opencode`
  CLI**); an interactive session is the bare TUI in cwd. The **five-hour usage bar**
  (#154) is Claude-only: `isClaudeActive` now hides it whenever **any** non-claude
  (codex *or* opencode) session is active.
- **First-launch agent picker:** on boot (main window only) `maybeOnboardAgent` runs once
  — gated by a new `onboarded` flag in the settings blob (defaults `false`, so an existing
  install also runs the one-time check on its next launch; preserved across "Reset to
  defaults"). It presence-checks each `SELECTABLE_AGENTS` CLI via `agent_info`
  (`version === null` ⇒ missing): **0 installed** → no-op (re-checks next launch; the
  `ClaudeMissing` screen guides install); **exactly 1** → silently set it as
  `defaultAgent` (+ an "untested" toast if it's codex/opencode); **2+** → open the
  `OnboardingModal` (`components/Onboarding`) to pick — Claude badged "Recommended",
  codex/opencode "Untested", Escape/scrim keeps the current default. Picking / dismissing
  sets `onboarded` so it never re-prompts.
- **Resizable sidebar (#108):** a thin right-edge drag handle sets the sidebar width,
  clamped to **[180, 560]** (default 260) and **persisted** via a dedicated Rust
  `sidebar_width` value (`get_sidebar_width` / `set_sidebar_width`), kept **separate**
  from the Settings blob so the modal draft can't clobber a drag. Main-window only.
- **Reorderable folders (#211):** the top-level repo "folders" are **drag-reorderable**
  — there's **no separate handle**; the whole repo header is the grip (a `useSortable`
  whose `attributes`/`listeners` sit on the `repoHeader`), while the 4px pointer
  activation distance lets a plain click on the title (filter Overview) / `+` (new
  session) / right-click (repo menu) still work. The group is extracted into a
  **`RepoGroup`** component and the list wrapped in a `SortableContext`
  (`verticalListSortingStrategy`) that is a **descendant of the app-level `DndContext`**
  (App.tsx) — never a nested one, which would rebind the sidebar's row drag sources and
  break drag-into-Canvas; App.tsx's `onDragEnd` detects the `repohead:` drag id and
  calls `reorderRepos(arrayMove(...))`. The order **persists** via a dedicated Rust
  `repo_order: Vec<String>` value (`get_repo_order` / `set_repo_order`), kept separate
  from the Settings blob like `sidebar_width`; the displayed order is `mergeRepoOrder(
  folderOrder, repoOrder(...))` so a spawned/added repo appends and a forgotten one
  drops without scrambling the rest. The collapsed rail renders the same persisted
  order (no drag there — out of scope). Main-window only.

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
│   ├── useAutoSaveFile.ts  # Read + hot-reload + debounced-write hook (FileViewer raw + Kanban) (#148)
│   ├── components/         # React components (CSS Module alongside each):
│   │                       #   Sidebar, Overview, Canvas (+ CanvasSurface),
│   │                       #   CanvasWindow (#84), CanvasCloseModal (#137),
│   │                       #   Terminal, FileViewer, FilePicker,
│   │                       #   FileSwitcher (#90), DiffInspector, DetachedNote (#84),
│   │                       #   Kanban (engine + KanbanPanel, #141–#151),
│   │                       #   ScheduledPanel (#94), Settings (#100), BusyIndicator,
│   │                       #   TemplateEditor + TemplateManager (#117) + TemplateUseModal (#118),
│   │                       #   Checkbox, Slider (#122), SkillAutocomplete (#114),
│   │                       #   NewSessionModal, Onboarding (first-launch agent picker),
│   │                       #   Toaster, ViewSwitch, ClaudeMissing, EmptyState
│   ├── styles/             # tokens.css (design tokens) + global.css (reset/base)
│   └── types/              # Shared TS types (backend-mirrored models)
├── src-tauri/              # Rust backend (Tauri)
│   ├── src/lib.rs          # App builder, state wiring, event forwarding, schedule poll loop (#93)
│   ├── src/main.rs         # Binary entry point
│   ├── src/pty.rs          # Session/PTY core (SessionManager, portable-pty)
│   ├── src/agents.rs       # Pluggable coding-agent specs (AgentSpec catalog): claude (#101) + codex (#141) + opencode (untested)
│   ├── src/path_env.rs     # Restore login-shell PATH at startup (Finder-launch fix)
│   ├── src/title.rs        # Best-effort reader for claude's own ai-title (#97)
│   ├── src/commands.rs     # Tauri command surface + event payloads
│   ├── src/store.rs        # JSON persistence (sessions, recents, canvases, canvas templates, schedules, settings, sidebar width, folder order)
│   ├── src/git.rs          # Git: branch + diff + compare (#81) + list (local+remote #180) + checkout + worktree (#74) + fetch (#180) + pull --ff-only (#181)
│   ├── src/files.rs        # Repo file access (lazy list_dir tree + search_files picker + search_file_contents in-tree content search #202, read/write_text_file #141, path-validated)
│   ├── src/skills.rs        # Read-only scan of .claude skills/commands for prompt autocomplete (#114)
│   ├── Info.plist          # Partial plist (mic + speech-recognition usage strings), merged into the bundle
│   ├── tauri.conf.json     # Window, bundle, build config
│   ├── capabilities/       # Tauri permission capabilities
│   └── Cargo.toml          # Crate `recue` / lib `recue_lib`
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
npm run test:coverage  # Vitest with v8 coverage (text + html report in ./coverage)
npm run lint:rust      # cargo clippy (backend)
npm run format:rust    # cargo fmt (backend)
cargo test --manifest-path src-tauri/Cargo.toml   # Rust unit tests

# Rust coverage (Windows + macOS) — install once: cargo install cargo-llvm-cov
cargo llvm-cov --manifest-path src-tauri/Cargo.toml          # text summary
cargo llvm-cov --manifest-path src-tauri/Cargo.toml --html   # html report
```

> **Cross-platform builds (#139/#140/#143).** The project builds, tests, **and runs** on
> **Windows and macOS**. **#139** got it compiling + green on both (`#[cfg(...)]`-gated Rust,
> `cfg(unix)` POSIX-shell tests, `.gitattributes` LF normalization so `cargo fmt`/`prettier`
> pass on a Windows checkout, + a coverage push). **#140** made it *function* on Windows:
> PowerShell terminals, `explorer.exe` for open/reveal (and, until #217, URLs), a no-op login-shell PATH probe, a
> cross-platform `home_dir()` (`USERPROFILE`), and `claude.cmd` resolution via `PATHEXT` +
> launch through `cmd.exe /C`. **#143** finished it: a platform-neutral bundle description
> (NSIS+MSI), a backend `platform()` signal cached once in the store, OS-appropriate display
> labels (Finder↔Explorer, ⌘↔Ctrl via `src/platform.ts`), `metaKey || ctrlKey` link-open,
> and `[\\/]` path splitting (`repoName`/`lastSegment`). The macOS arm is always the prior
> code. Runtime items needing a GUI/installer (the `claude.cmd` spawn, the Windows installer,
> e2e smoke) are flagged for interactive verification (the #84/#105 precedent).
>
> **Keeping the port current with `main`.** When `main`'s later features (#144+) merge into the
> Windows branch, each new feature is re-audited against the same abstractions so Windows
> users get it too: **OS-native path joins** (`joinPath(platform, root, rel)` in `platform.ts`
> — the backend reports relative paths as `/`-separated on every OS, so an absolute path is
> reassembled with backslashes on Windows for `explorer /select` + native copy/paste);
> **`splitPath`** splits on `/` **or** `\` (#163); **reveal-a-file** uses `open -R` on macOS
> and `explorer.exe /select,<path>` (separators normalized to `\`) on Windows (#171); and any
> new shortcut hint / "Reveal in Finder" label routes through `kbdHint` / `revealLabel` so it
> reads `Ctrl+…` / "Reveal in Explorer" on Windows (e.g. #162 ⌘S, #168 ⌘B, #172 ⌘N, the #204
> schedule-step **Worktree ⌘⏎** button, and the #206 **New tab ⌘T** add-button hint + menu kbd).
> New keyboard *handling* stays `metaKey || ctrlKey`, so a Ctrl shortcut fires on Windows for
> free. **Opening a URL** uses the http/https-only `open_url`, which since **#217** is
> platform-cfg — macOS `open`, **Windows `cmd /C start "" <url>`**, else `xdg-open` — *not*
> `os_open`/`explorer.exe`: `explorer.exe <url>` opened a File Explorer window instead of the
> browser, so the #210 sidebar **feedback button** (and the #109 ⌘/Ctrl-click link path) now
> reach the browser on Windows. `os_open` (`explorer.exe`) still backs the **folder** opens
> (`reveal_path`/`open_data_folder`). User-facing copy that names the platform (the #208
> first-release patch note) reads "macOS and Windows".
>
> **Rebased `main` features #211–#217 + the usage bar (#154).** #211 (drag-reorder sidebar
> folders), #212 (resync a worktree/branch label after an in-terminal `git checkout`, on the
> busy→idle edge), #213 (worktree header uses the normal open-view button + a static badge),
> #214 (narrower collapsed rail), and #215/#216 (update-indicator margin/hover/attention
> animation) are all path-key-/git-/CSS-based and platform-neutral, so they carry over unchanged.
> The **#154 five-hour usage bar** needed Windows work: `usage.rs` reads the OAuth token from
> `~/.claude/.credentials.json` via the cross-platform **`home_dir()`** (`%USERPROFILE%` on
> Windows, #140) instead of a raw `$HOME`, and the macOS-Keychain fallback (the `security` CLI)
> is `#[cfg(target_os = "macos")]`-gated with a non-macOS `None` stub — so on Windows the
> credentials file is the sole token source (canonical there, as Windows has no Keychain). The
> bar stays fail-open everywhere (any miss → it hides). #217's cross-platform `open_url` (above)
> was authored on `main`; the rebase keeps it and drops the port's earlier `os_open` URL route.

## v1 scope decisions / out of scope

- **Git is read-mostly, with a small set of deliberate writes** — ReCue reads
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
  The reads now also include one **network** read — (4) **`git fetch --prune`**
  (#180): opening the new-session branch step auto-fetches (best-effort,
  `GIT_TERMINAL_PROMPT=0` so a private remote can't hang the modal) so the picker can
  list **remote branches** under a "Remote branches" header (deduped vs local,
  `*/HEAD` excluded). Selecting a remote branch **pulls it locally** by **reusing the
  #124 create-branch write** — a new local tracking branch named `<short>` based on
  `<remote-ref>` (`git checkout -b` in-folder, or `git worktree add -b` on **⌘⏎**),
  with `validate_new_branch` widened to accept a remote-tracking ref as the base. No
  new pull/checkout command, and no commits. Finally, (5) **`git pull --ff-only`**
  (#181, `pull_branch`/`git::pull_ff`) — a **Pull** item in the sidebar **repo** and
  **worktree** context menus fast-forwards that folder's current branch to its
  upstream (same `GIT_TERMINAL_PROMPT=0` network guard), toasting git's summary or its
  error. `--ff-only` only ever fast-forwards (never a merge commit / partial-merge
  state in a folder an agent may be using); a diverged or upstream-less branch fails
  cleanly with an error toast. No confirm gate; still no commits / push.
- **File access is read-mostly, with one deliberate write** — `files.rs` lists +
  reads repo text files for the viewer (#40/#44) and, since **#141**, writes a repo
  text file (`write_text_file`) — the app's **first arbitrary file write**, backing
  the markdown **Kanban board** (#141–#151) and the FileViewer's **editable raw
  markdown / plain-text** view (#148/#149). **File listing scales to any repo, all
  files:** the old recursive `list_files` (a flat list **capped at 500 / depth 8**,
  walked in unsorted filesystem order — so a large repo's files, incl. user-created
  ones like a Kanban `.md`, were silently truncated, and *which* ones differed per
  machine) is replaced by two bounded commands. The **lazy file tree** (#167) calls
  **`list_dir(repo, subdir)`** for one directory level at a time (folders first then
  viewable files), fetched on each folder's first expand — **no count or depth cap**
  (deep trees are reached by expanding), so it works for huge repos. The **file
  picker** (#56) calls **`search_files(repo, query, ext?, limit)`** — a
  **deterministic** (sorted-walk, machine-independent) case-insensitive substring
  search over repo-relative paths, optional extension filter (`.md` for Kanban), with
  a **result** cap (`SEARCH_RESULT_CAP`, 500) the user narrows by typing, so the IPC
  payload + render stay bounded on arbitrarily large repos. Both still skip heavy/dep
  dirs **and now `.git`** (`SKIP_DIRS` — narrowing #179's all-dot-folders listing, so
  `.git` internals no longer flood / crowd out real files; `.claude`/`.github`/… stay
  listed) and binary extensions (`SKIP_EXTS`). The write is path-validated
  exactly like `read_text_file` (canonicalize, confine to the repo, reject
  `..`/symlink/out-of-repo targets; a new file's parent dir must exist + be inside
  the repo), narrowing the earlier "no arbitrary file writes" rule the way #74/#124
  narrowed the git rule. The viewer can also **open any file on disk** (#163) via the
  file-switcher's **Browse…** (the native open dialog → `pickFile`): an absolute
  `/a/b/c.md` is addressed as `{ repoPath: "/a/b", file: "c.md" }` (its own parent
  dir as the root), so every read/write stays **confined to that file's directory**
  with **no `files.rs` change** — the native dialog is the user's explicit consent.
  An out-of-repo file opened as an **Overview** item groups under a repo named for
  its parent dir (grouping is by `effectiveRepo`); in a **Canvas** panel there's no
  grouping.
- No app-rendered approval UI — users answer prompts directly in the terminal.
  (The v1 "no status system" rule was deliberately narrowed by **#42** — a single
  **busy/idle** indicator — and by **#112**, which adds a third "finished / needs
  input" yellow state to that same dot. Still no approval pills or floating status.)
- No Archive (single **Remove = kill + forget**), no Skills manager, no light mode,
  no auth. **Fork now exists** (#126 — reverses the v1 "no Fork" rule): a "Fork
  conversation" button on every agent header branches the source agent into a new
  parallel session (see the Spawn note + Conventions).
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
  `resume_session` / `fork_session`) and note it here. Since **#101** these
  spawn/resume paths resolve a pluggable **`AgentSpec`** (`agents.rs`) keyed by each
  record's stored `agent` (serde-default `"claude"`) rather than hardcoding the binary.
  The catalog also holds **`codex`** (#141) and **`opencode`** — both **untested**; the
  same **verify-against-the-installed-CLI** discipline applies to each spec's flags as to
  claude's. OpenCode owns its own session identity (no `--session-id`) and a bare
  positional is a project directory, so its `spawn_args` seeds a prompt via
  `opencode --prompt "<text>"` (best-effort, flagged in-code for real-CLI verification),
  else the bare `opencode` TUI; resume/fork/auto-name are gated off like Codex. A **fork** (#126)
  branches a source agent's conversation into a **new parallel session**:
  `claude --session-id <new> --resume <source> --fork-session` (`AgentSpec::fork_args`
  / `pty.rs fork_session` / the `fork_session` command), **verified** against claude
  2.1.176 (all three flags parse together; the source's on-disk log is read at spawn
  time, leaving the source untouched). The fork is a normal tracked session with its
  own app-owned UUID + a serde-default `forked_from` (provenance + the "fork" badge),
  spawned non-seeded like a resume (so it stays gray until first input, #116). A
  **guard refuses to fork a source with no on-disk conversation log** (#134 — `title::
  has_conversation` checks `~/.claude/projects/*/<uuid>.jsonl` for ≥1 real turn, fail-open;
  returns a typed `NothingToFork` error instead of spawning a doomed code-1 panel), and a
  persisted `forkable` flag (emitted on the #97 title-worker cadence) renders the Fork
  affordance **unavailable up front** at all three sites (#138).
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
  traffic lights, native title (`title: "ReCue"`), native drag, no custom
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
  notarization). An **in-app auto-update skeleton** (#190, **re-introducing** the #15
  updater that **#62 removed** and rebuilding it richer) is **wired but inert until a
  real minisign signing keypair is generated** (deferred to a later task):
  - **Plugins:** `tauri-plugin-updater` + `tauri-plugin-process` (Rust + JS), inited
    in `lib.rs`; `capabilities/default.json` grants `updater:default` +
    `process:allow-restart`. `tauri.conf.json` carries a `plugins.updater` block with
    the GitHub-releases `latest.json` `endpoints` and a **placeholder `pubkey`** (the
    old #15 public key — valid format, but its private key is deferred), and
    **`createUpdaterArtifacts` is intentionally OFF** so a local `npm run tauri build`
    keeps emitting an unsigned `.app`/`.dmg` **with no key**.
  - **Frontend:** `src/updater.ts` wraps `check()` / `downloadAndInstall` (progress) /
    `relaunch()`; the store `update` slice (`status`/`version`/`progress`/`error`/
    `confirming`, driven by `checkForUpdate`/`openUpdateConfirm`/`cancelUpdate`/
    `installUpdate`, plus `setUpdateState` for the #193 mock) powers a **sidebar-footer
    `UpdateIndicator`** (above the Settings gear, hidden when idle) → a confirm
    `UpdateModal` → a **full-window input-blocking install overlay with a progress
    bar** → relaunch. A persisted **`last_version`** (Rust scalar, like `sidebar_width`)
    is compared to `app_version()` on boot to show a one-time **"Updated to v…" toast**
    (#190 — the post-update step; also the mock's hook). The Settings → **Updates**
    pane (#191) is the manual review-then-install surface (Check for updates / current
    version / status / Update now); the sidebar indicator deep-links to it.
  - **Patch notes (#192):** per-version notes are authored in-repo as
    `src/patchnotes/<version>.json` (`{version,date,changes:[{category,items[]}]}`),
    loaded + normalized by the pure `src/patchnotes.ts` (`import.meta.glob` eager,
    `patchnotesFor`/`latestPatchnotes`/`patchnotesToMarkdown`) and rendered by
    `components/PatchNotes` in the Updates pane for the **current** version. For a
    **not-yet-installed** update, the notes ride **inside the release**: the pipeline
    generates the release body from the new version's JSON (`scripts/patchnotes-to-md.mjs`),
    `tauri-action` writes it into `latest.json`'s `notes`, `check()` returns it as
    `update.body`, and the store keeps it as `update.notes` — rendered (markdown) in the
    Updates pane's "What's new" slot so an older client reads them before installing.
  - **Pipeline:** `.github/workflows/release.yml` on push to `main` gates on a
    version bump (config version > latest `v*` tag), a **matching `src/patchnotes/
    <version>.json`** (#192 — else end early), **and** the `TAURI_SIGNING_PRIVATE_KEY`
    secret being present; any missing → the build job is skipped and the run ends green
    with a notice. When all hold it builds a universal macOS bundle + a **draft** GitHub
    release via `tauri-action`, its body generated from the version's patch notes.
  - **Today it no-ops:** no signed release exists and the pubkey is a placeholder, so
    `checkForUpdate` returns null and the indicator stays hidden. **Activation** later
    needs only the deferred "provide signing key" task: generate the minisign keypair,
    bake the real `pubkey` + flip `createUpdaterArtifacts` on, and add the
    `TAURI_SIGNING_PRIVATE_KEY[_PASSWORD]` GitHub secrets — no other code change. The
    interactive flow is runtime-exercised by the dev mock (#193). _(This reverses the
    earlier #62 "no in-app auto-update / no release pipeline" rule; Apple
    notarization stays out of scope — the updater is minisign-only.)_
  The bundle ships a partial `src-tauri/Info.plist` (auto-merged by the Tauri CLI in
  both `dev` and `build`) declaring `NSMicrophoneUsageDescription` /
  `NSSpeechRecognitionUsageDescription` so voice dictation works inside a session's PTY
  (macOS attributes a child process's mic request to the responsible app — ReCue).
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

Work is tracked in `TASKS.md`. **#1–#151 have shipped; #152–#153 are open.** Completed
tasks are condensed into an **Implemented (completed tasks)** summary at the top (one
line each, grouped by theme), with full per-task detail in git history; the `## Tasks`
body holds the open tasks (currently #152 — make the left panel the single source of
truth and cascade its removals to Canvas/Overview — and #153 — an agent-row "Open in
canvas" context-menu item). New tasks go there in `TASKS-TEMPLATE.md` format with
`Depends on:` prerequisites. The `(#N)` provenance markers throughout this doc index back
to that summary + git history.

**Never skip a task.** When implementing the backlog (`/develop-tasks`,
`/isolate-agent`, `/handoff`), implement **every** open task whose dependencies are
complete — lowest-numbered first — and **never skip one for being big, risky, or hard to
verify**. A task too large for a single pass is **split into smaller dependent sub-tasks**
(as #93 → #93 + #94) and then implemented; deferring it is not an option.
