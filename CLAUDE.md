# CLAUDE.md

Guidance for working in this repository. ReCue is a **macOS, Windows, and Linux** desktop
app (#139/#140/#143/#345) for running and managing many live `claude` CLI sessions at once.
Per-OS divergence is `#[cfg(...)]`-gated in Rust and a single store-cached `platform`
signal in the frontend; the macOS arm is always the original behavior, the Windows and
Linux arms are additive. Linux targets **Arch, Ubuntu, and Mint fully, best-effort for
other distros** (#345).

## ⚠️ Cross-platform is a hard requirement (read this first)

**ReCue ships on macOS, Windows, AND Linux. Every feature, fix, and refactor MUST
be functional on all three — no exceptions.** This is not aspirational; it is a
release constraint. macOS-only, Windows-only, and Linux-only are all bugs. Linux
support (#345) covers **Arch, Ubuntu, and Mint fully, best-effort for other distros**;
Linux inherits the `#[cfg(unix)]` code paths, so most divergence is shared with macOS,
with a distinct arm only where the unix behavior actually differs (`xdg-open` vs the
macOS `open`, Ctrl vs ⌘, the file-manager reveal).

When you implement *anything*, treat "does this work on the other OSes?" as part of the
definition of done — before you consider the task complete, walk the change against
Windows, macOS, **and Linux** in your head (and verify on a real box when the path can't
be unit-tested). Concretely:

- **Never assume one OS.** No hardcoded `/`-paths, POSIX-only shell-outs, `$HOME`,
  `open`/`explorer.exe`, `Cmd`-only key handling, or macOS-only system calls in a
  code path that runs on all. If a primitive differs by OS, it gets an abstraction.
  Watch for a **`not(windows)`/`cfg(unix)` arm that secretly assumes _macOS_** (the
  macOS `open` binary, `open -R`, ⌘ glyphs) — on Linux that is a bug; split it into a
  macOS arm and a Linux arm (#345 did exactly this for `os_open` / `reveal_file_in_finder`
  / `kbdHint` / `revealLabel`).
- **Gate genuine divergence explicitly** — `#[cfg(windows)]` / `#[cfg(unix)]` /
  `#[cfg(target_os = "macos")]` / `#[cfg(all(unix, not(target_os = "macos")))]` (Linux/BSD)
  in Rust (with **every** arm always provided, never left to fail to compile — and because
  the macOS host doesn't compile the Linux-only arm, widen a Linux-only helper's `cfg` with
  `, test)` so the host still type-checks it, mirroring `explorer_select_arg`'s
  `any(windows, test)`), and the store-cached **`platform`** signal + `src/platform.ts`
  helpers (`isWindows` / `isLinux`) in the frontend. The macOS arm always preserves the
  original behavior byte-for-byte; the Windows and Linux arms are additive.
- **Reuse the established cross-platform seams instead of re-deriving them** — Rust:
  `path_env::home_dir()` (`%USERPROFILE%` on Windows, `$HOME` on unix, never raw `$HOME`),
  `path_env::effective_path()` / `path_env::apply_path()` (the **PATH** seam, #360 — never
  `std::env::var("PATH")` on a spawn path: `effective_path` *blocks* (bounded) for the
  login-shell probe and backs binary lookup + child spawns, `apply_path` *never* blocks and
  backs the `hidden_command` helper processes that run on the main thread; both are the
  process PATH in dev / on Windows),
  `git::hidden_command()` (the `CREATE_NO_WINDOW` console-flash guard — **every**
  shelled-out `git`/CLI probe goes through it; a no-op on unix/Linux),
  `child_env::child_env_vars()` / `child_env::scrub_command()` / `child_env::command()` (the
  #350 AppImage env scrub — **every** spawned child, PTY or shell-out, gets its env through
  one of these; a no-op on macOS/Windows and outside an AppImage), `pty::resolve_command()` /
  `find_on_path` / `launch_target` (PATHEXT + `cmd.exe /C` for `.cmd` agents on Windows; the
  bare name on unix/Linux) / `default_shell` (`$SHELL` on Linux, `/bin/bash`→`/bin/sh`
  fallback), `os_open` (macOS `open` / Windows `explorer.exe` / **Linux `xdg-open`**),
  `commands.rs` path-segment guards (`windows_safe_seg` for reserved device names);
  Frontend: `joinPath` / `splitPath` (split on `/` **or** `\`; Linux gets `/`-paths),
  `kbdHint` / `revealLabel` (⌘↔Ctrl — **Ctrl on Windows AND Linux**; "Reveal in
  Finder"↔"…Explorer"↔"…File Manager"), `openUrl`→the http/https-only `open_url`
  (`xdg-open` on Linux), and `metaKey || ctrlKey` for **every** shortcut handler. For
  platform-conditional **CSS** the seam is the **`data-platform`** attribute on `<html>`
  (#363) — `main.tsx` writes it **synchronously** from the UA (`detectPlatform` /
  `applyPlatformAttribute` in `platform.ts`) *before* the first render, because the store's
  `platform` signal is an async IPC and static CSS tokens can't wait for it (the store then
  re-applies the authoritative backend value). (Superseded by UI v2 task 372 —
  JetBrains Mono is `--ui` on every OS; the #363 Linux-only Inter `--ui` override is
  retired, and `data-platform` remains as the platform-CSS seam, currently with no CSS
  consumer.)
- **CSS / WebView too:** WKWebView (macOS) and WebView2/Chromium (Windows) diverge — and
  **Linux is Chromium too (WebKitGTK/WebView)**, so the Chromium-friendly choices carry
  over: prefer `::-webkit-scrollbar` styling, ship plain-color fallbacks alongside
  `color-mix`, and avoid macOS-only `-webkit-`/vibrancy effects without a fallback.
- **Mirror docs across the OS divide.** User-facing copy that names a platform reads
  "macOS, Windows, and Linux" (or routes through `kbdHint`/`revealLabel`), never
  "macOS only."
- **When a path genuinely can't be unit-tested on CI** (GUI spawn, installer, ConPTY
  reflow, AppImage launch, D-Bus file-manager reveal), implement it for **all** OSes
  anyway and record what still needs a real-box check in **`TRAJECTORY_TO_WINDOWS.md`** /
  **`TRAJECTORY_TO_LINUX.md`** (the running logs of Windows / Linux parity work) — do not
  silently ship a single-OS path.

If a task as written would only work on one OS, that is a defect in the task: build
the cross-platform version (gating divergence as above), not the single-OS shortcut.
The detailed per-subsystem notes throughout this doc and
`TRAJECTORY_TO_WINDOWS.md` / `TRAJECTORY_TO_LINUX.md` show how each existing feature
already honors this.

## What this app is

An **Overview** "agent wall" of real terminals, a **Canvas** split-panel workspace
(with file, **git-diff**, and terminal viewers), and a repo-grouped **sidebar**. A
Canvas tab can **pop out into its own native window** for multi-monitor use (#84).
Each session is a **real PTY running `claude`** — ReCue provides the window
chrome, navigation, persistence, and git-reading; the terminals come from the
Claude Code CLI itself.

`claude` is assumed to be installed and authenticated on `PATH` (the app surfaces a
clear error if it is missing). Because a bundled `.app` launched from Finder/Dock
inherits launchd's minimal `PATH` (not the shell's — same for a Linux `.desktop`/AppImage
launch), `run()` calls `path_env::start_probe()` to resolve the **login-shell PATH**
(release builds only) — without it `claude` reads as "not found" in `tauri build` even
though it works in `tauri dev`. The probe used to run **synchronously**, so a heavy
oh-my-zsh/nvm rc delayed the window by up to 3s; since **#360** it runs **concurrently
with window creation** and publishes into an in-process `path_env` cell that the
binary-lookup / child-spawn seams read (`effective_path` / `apply_path`) — the process
env is **never** mutated (that would race a concurrent `getenv`), only spawn/resume ever
waits, and the result is cached across launches (keyed by `$SHELL` + rc-file mtimes) so a
steady-state boot pays **zero** probe cost.

## Stack

- **Tauri 2** desktop shell (macOS + Windows + Linux — see the cross-platform requirement above)
- **Frontend:** React + TypeScript + Vite, **Zustand** for state, plain CSS with
  CSS-variable design tokens (CSS Modules), **xterm.js** terminals (⌘-clickable
  `http`/`https` links via `@xterm/addon-web-links`, #109), **Lucide**
  icons, **JetBrains Mono** (bundled, offline — the terminal `--mono` face AND, since
  UI v2 task 372, the `--ui` face on every OS; the #363 bundled-Inter Linux-only UI
  face is superseded/retired), **react-markdown + remark-gfm**
  (GFM markdown, no raw HTML) + **Prism.js** (curated-language code highlighting —
  JS/TS/JSX, Rust, Python, JSON/YAML/TOML, CSS, markup, Bash, **Java**, **INI/.env/
  .properties** #150) — both in the universal **`FileViewer`** (#40/#44), whose **raw
  markdown / plain-text** view is an editable, auto-saving `<textarea>` (#148); the same
  markdown stack also renders the markdown **Kanban board** (#141–#151). **mermaid**
  (#254 — lazy-loaded, bundled/offline, never a CDN) renders ` ```mermaid ` fences as
  diagrams in the FileViewer's rendered markdown only. **dnd-kit**
  (`@dnd-kit/core` + `/sortable` — the app's one drag-and-drop system, #43; also Kanban
  card DnD #143), **react-resizable-panels** (Canvas split resizing, #46)
- **Backend (Rust, `src-tauri/`):** **`portable-pty`** for terminals, JSON
  persistence in the app-data dir, read-only git (shells out to `git`), and the
  Tauri **dialog** (folder picker) plugin
- Dark (default) and Light themes (#333) — a Catppuccin **Latte** token override
  selected in Settings → Appearance (the terminal stays dark in both)
- **Code-split bundle (#356).** The frontend is **not** one chunk: everything not needed to
  paint the sidebar + terminals is behind a dynamic `import()`. Lazy boundaries — the two
  **window routes** (`App.tsx` is a `Suspense` router over `src/MainApp.tsx` and
  `CanvasWindow`, so a detached window #84 never downloads the sidebar/Overview/modals); the
  four **content panels** in `ItemContent.tsx` (`FileViewer` / `KanbanPanel` /
  `DiffInspector` / `FileTree` — which is what carries the whole **react-markdown + Prism**
  stack out of the first-paint graph), each in its **own** per-branch `Suspense` (never one
  boundary around `ItemContent` — a suspending boundary `display:none`s its children, which
  would un-measure a pooled xterm, the #18 class of bug); the ten modals in
  `components/ModalHost.tsx` (Suspense fallback **`null`** — an empty modal shell would be a
  visible regression); the **`@xterm/addon-webgl`** addon in `terminalPool.createHost()`
  (xterm core / fit / web-links stay **static** — terminals *are* the first paint; the addon
  attaches a few ms later, and on a software rasterizer #346 its chunk is never fetched); and
  **mermaid** (#254); and the vendored **WaveEngine** (`src/vendor/waveEngineLoader.ts`, UI v2
  task 377 — loaded on `WaveBackground` mount). `src/prefetch.ts` warms the deferred chunks on idle
  (`requestIdleCallback`, feature-detected with a `setTimeout` fallback for older WKWebView).
  **Rule: only a dynamic `import()` removes work from the first-paint path** — a statically
  reachable module is parsed before first render whatever chunk it lands in, so
  `manualChunks` is deliberately **not** used; never static-import `react-markdown` /
  `prismjs` / `@xterm/addon-webgl` into the entry graph. Guarded by
  `node scripts/bundle-report.mjs --check` (per-route first-paint closure from Vite's
  `build.manifest`, with a budget): main window **854 kB raw / 246 kB gzip**, down from a
  single 1,351 kB / 391 kB chunk; the detached canvas window is lighter still (770 kB).

## Architecture (data flow)

- **Spawn:** `spawn_session(cwd, name)` → `SessionManager` (`pty.rs`) opens a PTY
  running `claude --session-id <uuid>`, registers it by id, and persists a record
  (`store.rs`). A per-session reader thread pushes output to a bounded scrollback
  buffer and an `mpsc` channel, and a per-session **exit-waiter thread** (#354) owns the
  `Child`, blocks in `wait()`, and is the **sole** emitter of `Exited` — see the Exit
  handling convention. A **fork** (#126, `fork_session`) is a spawn variant
  that branches a source agent's conversation into a new parallel session
  (`--session-id <new> --resume <source> --fork-session`) — see Conventions.
- **Output:** `lib.rs` forwards the channel to the `session://output` /
  `session://exited` / `session://state` Tauri events. The frontend `ipc.ts`
  subscription routes output **bytes** to `outputBus.ts` (a pub/sub the xterm
  `Terminal` consumes — deliberately *not* React state) and lifecycle +
  busy/idle to the Zustand `store.ts`. Each `session://output` event **and**
  `session_scrollback` carry an **absolute byte-offset** (a monotonic `total` on the
  backend `Scrollback`), so the terminal pool can **dedupe the scrollback-replay ↔
  live-stream overlap** (`replayDedupe.ts`): on a **fresh spawn**, claude paints its
  startup *before* its terminal mounts, so the same bytes land in both the fetched
  scrollback and the buffered live stream — writing both applies the cursor-positioned
  paint twice, which (because claude spaces with non-erasing cursor-forward `ESC[1C`
  moves) left a **stray `C`** in the input line on Windows/ConPTY. Dropping any live
  chunk already covered by the replayed scrollback fixes it; platform-neutral (the race
  existed on both OSes, it only *manifested* under ConPTY), a resumed session subscribes
  before any output so it never overlapped.
- **Busy indicator (#42/#55/#71/#88/#95/#112/#116/#315):** a backend monitor thread (`pty.rs`) derives each
  session's **busy/idle** from output activity (within a ~700ms window) and emits
  `session://state { id, busy }` on transitions only — but once the dot would otherwise
  *flicker* (a background process / subagent / paused turn repainting in bursts >700ms apart,
  so it went quiet then re-activated soon after), that session goes **sticky** and holds blue
  on a ~5s window until output is truly quiet, rather than oscillating blue↔yellow twice a
  second (#315 — a clean single turn still settles at ~700ms). So **keystroke echo doesn't
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
  target)` (the #81 two-dot branch compare) / `list_commits(cwd, limit)` + `commit_diff(cwd,
  sha)` (the #230 **Commits** source, via `git show`) shell out to `git`; the `DiffInspector`
  and sidebar render the structured result. `working_diff` also synthesizes entries for
  **untracked** files (#183). The `DiffInspector` shows the changed files in a
  **Focused** (one file + a ‹/› prev/next strip) or **Accordion** (single-open cards)
  mode (#231, persisted #237) across three **sources** — **Working tree** / **Compare**
  branches (#81) / **Commits** (#230, pick a commit → its diff) — with a per-file **sort** by
  occurrence (default) or A–Z (#258) and a per-file **Seen / Not-seen / Changed-since-seen**
  marker (#278, `diffSeen.ts`, persisted in a dedicated Rust `diff_seen` scalar; `s` toggles).
  It is **keyboard-navigable** (#255): the panel is
  focusable (`tabIndex`, token `:focus-visible`) and a **panel-scoped** `onKeyDown` steps
  between files with **←/→ in Focused** (Up/Down still scroll the body) and **↑/↓ in
  Accordion** (scrolling the open card into view) via the pure `diffNavDelta`
  (`DiffInspector/diffNav.ts`) + the existing wrapping `stepFile` — plain unmodified
  arrows (identical on macOS/Windows), ignored while an input/select/picker-listbox has
  focus or there are <2 files, so other diff panels / terminals are unaffected.
  `list_branches` returns both **local** (`all`)
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
- **File-tree git status (#252):** the **FileTree** (`components/FileTree`) tints each
  row by its working-tree state vs `HEAD` — file names/icons **green** for new
  (`A`/untracked), **yellow** for edited (`M`); folder names roll up to their
  highest-severity descendant (red > yellow > green) so a collapsed/vanished subtree
  still flags a change; a **deleted** file shows a red, struck-through, non-openable
  **ghost row** in its (still-rendered) parent plus the red ancestor roll-up. Backed by
  a **lightweight** `file_statuses(repo)` read — one `git -c core.quotepath=false status
  --porcelain=v1 -z --untracked-files=all` (no hunk parse, unlike `working_diff`; a
  rename surfaces as add(new)+del(old)), bounded + fail-open (non-git/clean → empty).
  The store's `fileStatuses` map (repoPath → { repo-relative POSIX path → `A`/`M`/`D` })
  is filled once-per-repo by `refreshFileStatuses` — on app load + repo-set change, on
  the same debounced **busy→idle** edge as the branch refresh (#212), after
  app-initiated checkout/branch-create writes, and from the FileTree's **Refresh**
  button / mount. Pure roll-up + deleted-children helpers in `FileTree/fileStatus.ts`.
  Coloring uses only the on-system `--status-done/-awaiting/-error` tokens, so it's
  identical on macOS and Windows (the only OS-sensitive primitive is the `git`
  shell-out, which goes through the shared `hidden_command` console-flash guard).
  **Gitignored** files/folders are dimmed (`--text-muted`) via an added `--ignored=matching`
  read + a `FileStatus::Ignored` (`"I"`) variant (#270 — below the tracked A/M/D tints, out of
  the folder severity roll-up). The FileTree also has an **in-panel search** (#202 — filename +
  `search_file_contents` content matches with `<mark>`-highlighted `path:line` snippets and
  Reveal-in-tree / Open) and a **right-click context menu** on folders/files: **New folder** /
  **Delete** / **Rename** (#267/#291) backed by the path-validated `create_dir` / `delete_path`
  / `rename_path` writes (the 3rd–5th deliberate `files.rs` writes; confirm-gated delete), plus
  Reveal in Finder/Explorer and Copy absolute·relative path.
- **OS files → file tree (#253):** dragging files/folders from Finder/Explorer onto a
  FileTree **folder row** (or the tree **root**) **moves** them into that directory.
  Tauri's webview drag-drop event is **window-global** (not DOM-bound), so `src/
  osFileDrop.ts` (`useOsFileDrop`, wired from both `App.tsx` and the detached
  `CanvasWindow` — each its own webview) listens via `getCurrentWebview().
  onDragDropEvent` and **hit-tests** the cursor: physical→CSS px via `devicePixelRatio`
  (Retina + Windows fractional scaling), `document.elementFromPoint` →
  `closest("[data-filetree-droptarget]")`/`[data-filetree-repo]` (pure
  `resolveDropTarget`) resolves the repo + dir (a folder row → its path, a file row →
  its parent dir, the root container → `""`). On `over` the store's transient
  `fileDropTarget` highlights the exact target (token-only `.dropTarget`); on `drop`
  `moveFilesIntoRepo` calls `move_into_repo` per path, bumps a per-repo `fileTreeRefresh`
  signal (each tree reloads its visible levels — no reset), and toasts the result. The
  in-app **dnd-kit** drags (pointer events) are a separate input stream that never
  clashes with the OS drag.
- **Views:** the store holds `sessions / selectedId / view / recents / branches /
  canvases / activeCanvasId / claudeMissing / toasts / schedules / settings /
  sidebarWidth / folderOrder`; the app mounts one of
  **Overview, Attention, or Canvas** (#46/#75 — the original Focus view was removed;
  **Attention** #398 is a FIFO triage queue of idle agents awaiting the user). The
  sidebar **`ViewSwitch`** presents **Overview + Attention** as the two equal-weight
  *main* views and **Canvas** as a smaller, de-emphasized *secondary* button (#406),
  with no queue-count badge (#405); in expanded mode Overview/Attention are text
  segments, and only the collapsed rail renders Attention as its `AlertTriangle` icon.
  Each session's xterm is owned
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
- **Configurable keybinds (keybind rework):** every non-contextual global shortcut is a
  rebindable action in the **`src/keybinds.ts`** registry. Defaults: **⌥1/⌥2/⌥3** switch
  Overview/Attention/Canvas, **⌘W** closes the focused panel (`store.closeFocusedPanel`:
  an open big-mode overlay first; else the active Canvas leaf exactly like its header ×,
  with focus advancing to a spatial neighbor so repeated ⌘W keeps closing; else the
  selected Overview panel's hover-× — never an agent/schedule/recurring, those are
  destructive), **⌘,** opens Settings, plus the carried-over ⌘E big mode (#284) / ⌘N /
  ⌘⇧N / ⌘K / ⌘F / ⌘B / ⌘D. **Removed:** ⌘T (new tab #206), ⌘1–9 (canvas jump #76 — the
  modal-internal new-session-recents #61/#66 and global-search folder-chip #397 digits
  are unaffected), ⌘\ (view toggle #77). Overrides persist as **`settings.keybinds`**
  (action id → serialized chord, `""` = unbound; only overrides stored, so new defaults
  reach old installs) and are edited in Settings → Shortcuts; `useKeyboardNav.ts`
  dispatches by serializing each keydown (`eventChord`, physical `e.code`, so ⌥-digit
  survives macOS glyph composition and letters survive non-QWERTY layouts) and looking
  it up. **`mod` is platform-resolved** — ⌘ on macOS, Ctrl on Windows AND Linux — so a
  bare macOS ⌃-chord (readline ⌃E/⌃N/⌃W…) now flows to the focused terminal instead of
  triggering the app (the old `metaKey || ctrlKey` matching swallowed it; on Windows/
  Linux Ctrl-chords are the app's `mod`, as before). Hint sites (Sidebar / EmptyState /
  ViewSwitch tooltips / GlobalSearch chip / big-mode titles / tips) render live labels
  via `useKeybindLabel`, so a rebind never leaves a stale hint. On macOS the default
  Tauri menu's **⌘W Close Window accelerator would preempt the webview**, so
  `src-tauri/src/menu.rs` rebuilds `Menu::default` at setup with the predefined items
  swapped for a custom **⇧⌘W** Close Window (Edit-menu clipboard items untouched —
  WKWebView needs them; Windows/Linux create no default menu, so nothing to do there).
- **Lazy terminal mount (#351):** a pooled xterm is created on **first visibility**, not
  on React mount — `Terminal.tsx` gates `mountTerminal` on a **latching**
  `IntersectionObserver` (`Terminal/useVisibleOnce.ts`), so booting into an Overview wall
  of N resumed agents no longer builds N xterms + N WebGL contexts + N 256 KB
  scrollback replays on the single WebView main thread (the dominant boot cost, worst on
  Linux/WebKitGTK). The observer's root comes from a `TerminalScrollRootContext` that
  **Overview** fills with its horizontally scrolling wall — IntersectionObserver clips a
  target against every intermediate scroll container *before* applying `rootMargin`, so a
  viewport-rooted observer could never pre-load a card scrolled out of the wall; everywhere
  else (Canvas panels, big mode #157, detached windows #84) the context is `null` ⇒ the
  viewport root. The replays that do happen are **serialized** through a bounded FIFO queue
  (`Terminal/replayQueue.ts`, `MAX_CONCURRENT_REPLAYS = 1`, a macrotask yield between jobs),
  and the pre-replay live buffer is byte-capped (`Terminal/pendingOutput.ts`) only until the
  fetch is dispatched. **Nothing is lost:** bytes emitted while a session has no terminal are
  simply not subscribed (`outputBus` already drops them — the normal state today for any
  session not rendered in the current view), the backend `Scrollback` retains them, and
  `replayDedupe.ts` drops the scrollback↔live overlap by absolute offset at creation. The
  gate defers **creation only** — a host is still never disposed or recycled on a scroll-out
  or view switch (the #18 invariant); it latches, and falls back to eager mounting where
  `IntersectionObserver` is absent. Pure WebView/TS, so identical on macOS, Windows, and
  Linux.
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
  order, merged with live items so spawn/exit don't scramble it). The wall scrolls
  horizontally, so only ~3 cards are on screen at a time — it is the
  `TerminalScrollRootContext` root for the #351 visibility gate, and an off-screen agent
  card costs **no** xterm at boot until it is scrolled to (or its column is scrolled into
  view by a sidebar click, #79).
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
  a **Checkout branch…** picker (#266 — local/remote branches + create-new inline,
  `checkoutFolderBranch` / `createFolderBranch` without spawning an agent),
  non-destructive **Reveal in Finder** / **Copy path**
  utilities (#130 — `reveal_path` → `os_open`: macOS `open` / Windows `explorer.exe` /
  Linux `xdg-open`, #345, no shell) + **Pull**
  (#181 — `git pull --ff-only` on the folder's current branch, toasted; shown only when a
  current branch is known; mirrored in the worktree header menu) + **Fetch** (#243 —
  `fetch_remotes`, also on the repo branch-line menu), repo
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
  Prism **code** view, and large files stay read-only (#148). In **rendered** markdown a
  ` ```mermaid ` fenced block renders as a **Mermaid SVG diagram** (#254): an **opt-in**
  react-markdown `code` override (`MermaidCode`, wired only at the FileViewer call site —
  so Kanban/PatchNotes/Settings markdown are unaffected) renders `MermaidBlock`, which
  **lazy-loads** mermaid (its own async chunk — diagram-free files never pull it) and
  one-time-initializes it (`theme:"dark"`, `securityLevel:"strict"` DOMPurify-sanitized,
  a system/sans `fontFamily` so nothing is fetched — **bundled/offline**). An invalid
  diagram falls back to the original code block + a muted error note, never crashing; the
  Raw view shows the fence as text. Pure helpers (`isMermaidClassName`/`renderMermaidSvg`)
  live in `components/FileViewer/mermaid.ts`. Pure WebView SVG, so identical on macOS and
  Windows (no native/path/shell code). A **markdown Kanban board**
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
  main tab strip marks detached tabs ("in window"), a detached-tab
  click **`focus_canvas_window`**s (raises) instead of switching (the #76 ⌘1–9
  canvas-jump chord was removed by the keybind rework), and **closing a
  detached window re-docks** its canvas (its `Destroyed` handler re-broadcasts the
  set; the main window reclaims the PTYs). Detached windows are **per-session** — not
  restored on relaunch (capability `canvas-*` in `capabilities/default.json`).
- **Scheduled sessions (#93/#94/#125):** an agent can be **scheduled to launch later**.
  The **"+ Schedule session"** sidebar button / **⌘⇧N** opens the new-session modal
  in **schedule mode** — folder → branch (incl. **"+ add branch"** to create a new
  branch *at fire time*, #125) → a final step for **launch time** (a **natural-language**
  field — `parseWhen` in `src/time.ts` accepts `1h` / `90 min` / `6pm` / `tomorrow` / explicit
  dates, with a live "Starts …" preview, #268; **⌘⏎** schedules it into an isolated
  **worktree**, #204), optional **prompt**, optional **name** — and calls `create_schedule`. Records persist in `store.rs` (`schedules: ScheduledSession[]`,
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
  **Canvas panel** — each with a **Start now** button (#269, `fire_schedule_now`). A schedule
  targeting a **worktree** creates the worktree + branch **eagerly at schedule time** (#259),
  and schedules are **window-global** — a Rust `broadcast_schedules` → `schedule://changed`
  keeps detached windows (#84) in sync, and on fire `rewriteScheduledLeaves` swaps the pending
  Canvas leaf to the live agent (#280). Time helpers live in `src/time.ts`. The schedule **prompt** field
  (in both the `NewSessionModal` schedule step and the `ScheduledPanel`) is a shared
  **`SkillAutocomplete`** component (#114): typing `/` in command position opens a
  dropdown of the slash-invokable **skills** `claude` would offer, read best-effort by
  the Rust **`skills.rs`** (`list_skills(cwd)`) from project (`<cwd>/.claude/skills/*/SKILL.md`
  + `.claude/commands/**/*.md`) and user (`~/.claude/…`) dirs, deduped (project shadows
  user); ↑/↓/Enter/Tab insert `/<skill-name> ` (with a container-key guard so Enter/Escape
  drive the menu, not the modal). Plugin/marketplace skills are out of scope.
- **Recurring sessions (#294/#300):** the sidebar's **⋯** (three-dots) menu next to *Schedule
  session* opens the new-session modal in **recurring mode** — the same folder → branch →
  first-run (natural-language time) flow plus an **interval** — and calls `create_recurring`. A
  `RecurringSession` record (`store.rs`, with its own `create/list/cancel/update/fire_due/
  fire_one_recurring` command surface sharing the #93 poll tick in `lib.rs`) owns **one rotating
  child agent**: each fire kills the previous child and spawns a fresh seeded UUID **in the same
  panel** (a `CanvasContent` **`kind: "recurring"`**), so the panel persists while the
  conversation rotates. Surfaces mirror scheduled sessions — a `RecurringPanel` (auto-saving
  editor + **Start now**), an Overview `RecurringCard`, and a draggable sidebar `RecurringRow`
  — with worktree support and pure `intervalToSeconds` / `formatNextRun` helpers. A
  `first_fire_at <= now` fires the first child immediately at create time (#300).
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
  focus-trapped **Settings modal** (`components/Settings`) — a **fixed 740×540** size
  (clamped to 92vw/88vh — #119's fixed-size precedent, resized by UI v2 task 373)
  so every section renders identically and a tall section
  scrolls inside the content pane (the nav + action row stay put) — with **eight** sections
  (**nine** on Linux, which additionally gets **Rendering**, #357) —
  **Terminal** (font size / line height via the custom **`Slider`** #122 + cursor
  blink → the live pooled xterms via `terminalPool.applyTerminalSettings`),
  **Sessions** (the #97 auto-name toggle + the #142 **Coding agent** selector →
  `defaultAgent`, now claude / codex / **opencode** with an inline "untested" caution
  for the non-claude picks, + the #296 auto-continue-after-limit toggle),
  **Appearance** (a **Dark/Light theme** toggle #333 + an accent swatch over the Catppuccin
  palette **with a "?" random-per-launch swatch** (task 373, `resolvedRandomAccent`) + a
  reduce-motion toggle + **Dense panels** (the ⌘D toggle's checkbox twin, task 373) +
  **Background animation** (the #377 wave on/off) + **Pause when covered by panels**
  (`pauseWaveWhenCovered`, task 384 — default off (opt-in, task 402), disabled while the wave is off; the wave
  stops rendering while the Overview wall has cards / a Canvas tab has panels and resumes
  live when the stage clears) + a display-size slider #366 +
  the Overview panel min-width #176 + the `capAgentWidth` cap-agent-card-width toggle,
  task 373 — consumed by the Overview wall's 900px `.cardCapped` on agent/recurring
  cards, task 379), **Rendering** (**Linux only** #357 — filtered out of
  the nav on macOS/Windows: a **DMA-BUF renderer** control (auto/on/off, applied at the
  **next launch** — GTK reads the env once at init, so the persisted mode is read straight
  off `sessions.json` **before** `tauri::Builder` via the shared Rust `early_settings`), a
  **Terminal renderer** control (auto/webgl/dom, applied **live** — the WebGL addon is
  loaded/disposed on the *running* xterm by `terminalPool.applyTerminalRenderer`, never a
  host dispose #18, and never a `clearTextureAtlas()` #221), and a copy-pasteable
  **Diagnostics** readout of the boot decision (`renderer_diagnostics` → the
  `linux_webkit::RendererReport` captured in a `OnceLock`; `null` off Linux)), **Behavior** (default launch view + confirm-destructive
  gating #103 + the Canvas tab-close default `canvasCloseBehavior`: Ask / Always kill / Never
  kill #137 + the diff display/line/sort defaults #237/#258), **Kanban** (per-column colors by
  name #239), **Updates** (check for updates / current version / "What's new" / update now
  #191), **Shortcuts** (#318/373, made **editable** by the keybind rework — the
  rebindable actions of the `src/keybinds.ts` registry render as click-to-record rows
  (press the new combo; Backspace unbinds, Esc cancels; reserved/conflicting chords
  are refused inline with per-row reset-to-default), staged in the draft like every
  section and persisted as `settings.keybinds` overrides; the fixed contextual chords
  (⌘S / ⌘⏎ / ⌘⌥1–6 / Shift+arrows / the diff keys, `shortcuts.ts`) stay a read-only
  reference below, every chord through `kbdHint`), and **Data & About** (open data
  folder, clear recents, app + agent versions). A
  modal-local **draft** applies only on **Save** via `applySettingsEffects` (the `theme`
  field #333 toggles `data-theme="light"` on `<html>` → the `:root[data-theme="light"]`
  Catppuccin-Latte token block in `tokens.css` reskins the whole UI, while the terminal
  stays dark via a dedicated `--terminal-fg`; the toggle sits on `<html>` — the same element
  the custom accent writes inline to — so an inline custom accent still wins in light mode;
  accent overrides `--accent` plus its companions `--accent-hover/-dim/-fg` through
  `accentCompanions` #107; reduce-motion toggles `body.reduce-motion`). Settings
  persist as an opaque `settings` blob (`get_settings` / `set_settings`) merged over
  TS-side `DEFAULT_SETTINGS`, so an older `sessions.json` upgrades cleanly (a blob lacking
  `theme` upgrades to `"dark"`).
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
- **Five-hour usage bar + auto-continue (#154/#296/#297/#305/#309):** a sidebar-footer
  **`UsageBar`** (`components/Usage`) shows Claude's rolling five-hour usage — the Rust
  `claude_session_usage` (`usage.rs`) reads the OAuth token (`~/.claude/.credentials.json` via
  the cross-platform `home_dir()`, with a macOS-Keychain fallback `#[cfg(target_os = "macos")]`
  -gated) and fetches a snapshot; the bar turns **red at ≥90%** (#272), is **fail-open** (any
  miss hides it), and is **Claude-only** (`isClaudeActive` hides it when any codex/opencode
  session is live). **Auto-continue after limit reset** (#296 — opt-in setting
  `autoContinueAfterLimit`, default off) arms when usage hits ~100%, waits for the reset
  (confirmed by **both** clock time **and** percent < 90), then nudges each running **Claude**
  agent (Enter→`continue`→Enter) — a pure reducer `evaluateAutoContinue` in `src/autoContinue.ts`
  (armed poll ~45s). It's surfaced in the ⋯ menu + Settings → Sessions, with a **per-agent
  opt-out** (`AutoContinueToggle`, persisted `auto_continue_disabled`, shown only at the limit
  #297/#305) and an **"Enable auto restart on limit reset"** prompt (`AutoContinuePrompt`) above
  the usage bar, shown only once the limit is reached (#309, shared `isLimitReached`).
- **Clone Repo (#295/#298/#299/#307/#308):** the sidebar **background** context menu's **Clone
  Repo…** (#303 — its single home) opens a `CloneRepoModal` (git URL + parent-dir picker) →
  Rust `git.rs` `clone_repo` (an **async** command running `git clone --filter=blob:none` #308
  in `spawn_blocking`; network guards `GIT_TERMINAL_PROMPT=0` / `GIT_SSH_COMMAND=…BatchMode`,
  refuses a non-empty dest — a new deliberate git write). The modal closes immediately and a
  transient **`PhantomRepo`** (a dimmed "Cloning…" row + a glowing indeterminate progress bar,
  #299/#307, rendered outside the dnd-kit `SortableContext`) renders from a store `cloningRepos`
  slice, resolving per-id to register the folder + auto-start a session (on git's real default
  branch, #298 `ensure_checked_out_branch`) or toast an error.
- **Big mode (#157/#284):** any Overview card / Canvas panel can **maximize** into a full-window
  modal (`BigModeModal`) via a header maximize icon or **⌘E / Ctrl+E** on the selected item
  (`toggleMaximizeSelected` + a transient `maximizedItem` store slice). A shared `ItemContent`
  renderer is the single live-render site (carrying the #84 ownership guard), so a pooled
  terminal / auto-save hook is never mounted twice.
- **Resizable sidebar (#108):** a thin right-edge drag handle sets the sidebar width,
  clamped to **[180, 560]** (default **248** since UI v2 task 374 — was 260) and
  **persisted** via a dedicated Rust
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
│   ├── App.tsx             # Root: a Suspense router over the two LAZY window routes —
│   │                       #   MainApp or the detached CanvasWindow (#84/#356)
│   ├── MainApp.tsx         # Main-window route chunk: sidebar + Overview/Canvas + ModalHost (#356)
│   ├── prefetch.ts         # Idle warm-up of the deferred chunks (rIC → setTimeout) (#356)
│   ├── store.ts            # Zustand store (state + cross-cutting actions)
│   ├── ipc.ts              # Typed Tauri command/event wrappers
│   ├── outputBus.ts        # Per-session output pub/sub (bytes kept out of store)
│   ├── paths.ts            # Shared path helpers (repoName, sessionLabel, effectiveRepo #96)
│   ├── time.ts             # Schedule time helpers (toLocalInput, formatFireTime) (#93/#94)
│   ├── windowContext.ts    # Window identity (#84): main vs canvas-<id>, ownership helpers
│   ├── ownership.ts        # useSessionOwners hook — which window renders each PTY (#84)
│   ├── keybinds.ts         # Configurable-keybind registry + pure chord logic (keybind rework)
│   ├── useKeybind.ts       # useKeybindLabel — live hint labels off settings.keybinds
│   ├── useKeyboardNav.ts   # Global keyboard dispatcher over the keybinds registry (#24/#76/#84)
│   ├── useAutoSaveFile.ts  # Read + hot-reload + debounced-write hook (FileViewer raw + Kanban) (#148)
│   ├── autoContinue.ts     # Pure auto-continue-after-limit reducer + isLimitReached (#296/#305)
│   ├── tips.ts / tips.json # Startup tips for the empty-state hero (UI v2 #379)
│   ├── updater.ts          # In-app auto-update: check / download+install / relaunch (#190)
│   ├── components/         # React components (CSS Module alongside each):
│   │                       #   Sidebar, Overview, Canvas (+ CanvasSurface),
│   │                       #   CanvasWindow (#84), CanvasCloseModal (#137), BigMode (#157/#284),
│   │                       #   Terminal, FileViewer (+ MermaidBlock #254), FileTree (#167/#252),
│   │                       #   FilePicker, FileSwitcher (#90), DiffInspector, DetachedNote (#84),
│   │                       #   Kanban (engine + KanbanPanel, #141–#151),
│   │                       #   ScheduledPanel (#94), RecurringPanel (#294), Settings (#100),
│   │                       #   BusyIndicator, Usage/UsageBar (#154),
│   │                       #   AutoContinuePrompt/AutoContinueToggle (#296/#309), CloneRepoModal (#295),
│   │                       #   TemplateEditor + TemplateManager (#117) + TemplateUseModal (#118),
│   │                       #   Checkbox, Slider (#122), SegmentedControl (UI v2 #372),
│   │                       #   SkillAutocomplete (#114), PatchNotes (#192),
│   │                       #   NewSessionModal, Onboarding (first-launch agent picker),
│   │                       #   UpdateIndicator/UpdateModal (#190), Toaster, ViewSwitch, ClaudeMissing, EmptyState,
│   │                       #   WaveBackground (UI v2 wave layer, task 377 — lazy src/vendor/WaveEngine.js;
│   │                       #     lazy waveHost runs it on the main thread OR from an OffscreenCanvas
│   │                       #     Web Worker + a governed/paused-when-covered loop, task 384)
│   │                       #   ModalHost.tsx — the ten lazily-mounted top-level modals (#356)
│   ├── styles/             # tokens.css (design tokens) + global.css (reset/base) +
│   │                       #   the UI v2 primitives: atoms.css (buttons/chips/kbd hints),
│   │                       #   menu.css (anchored menus/popovers), modal.css (centered
│   │                       #   modals) (#372/#375/#378)
│   ├── vendor/             # WaveEngine.js (sha-pinned vendored wave engine — never edit)
│   │                       #   + waveEngineLoader.ts (its lazy dynamic-import seam, #377)
│   └── types/              # Shared TS types (backend-mirrored models)
├── src-tauri/              # Rust backend (Tauri)
│   ├── src/lib.rs          # App builder, state wiring, event forwarding, schedule + recurring poll loop (#93/#294)
│   ├── src/main.rs         # Binary entry point
│   ├── src/pty.rs          # Session/PTY core (SessionManager, portable-pty)
│   ├── src/agents.rs       # Pluggable coding-agent specs (AgentSpec catalog): claude (#101) + codex (#141) + opencode (untested)
│   ├── src/path_env.rs     # Restore login-shell PATH at startup (Finder/.desktop-launch fix, macOS+Linux)
│   ├── src/child_env.rs    # AppImage env scrub for every child process (PTY + git/xdg-open shell-outs) (#350)
│   ├── src/path_env.rs     # Login-shell PATH: async probe + PathState cell + rc-mtime cache (#360; Finder/.desktop-launch fix, macOS+Linux)
│   ├── src/linux_desktop.rs # WM_CLASS/app_id pin for Linux desktop-entry matching (#362)
│   ├── src/early_settings.rs # Shared PRE-GTK settings reader: sessions.json off disk before tauri::Builder (#357)
│   ├── src/linux_webkit.rs # Linux DMA-BUF decision + Settings override + the boot RendererReport (#346/#347/#357)
│   ├── src/linux_gtk.rs    # Linux GTK dialog theme from ReCue's own theme, before GTK init (#349)
│   ├── src/title.rs        # Best-effort reader for claude's own ai-title (#97)
│   ├── src/commands.rs     # Tauri command surface + event payloads
│   ├── src/store.rs        # JSON persistence (sessions, recents, canvases, canvas templates, schedules, recurrings #294, settings, sidebar width, folder order, diff-seen, path cache #360)
│   ├── src/git.rs          # Git: branch + diff + compare (#81) + commits (#230) + per-file status (#252) + list (local+remote #180) + checkout + worktree (#74) + fetch (#180) + pull --ff-only (#181) + clone (#295/#308)
│   ├── src/files.rs        # Repo file access (lazy list_dir tree + search_files picker + search_file_contents in-tree content search #202, read/write_text_file #141, move_into_repo OS-drop #253, create_dir/delete_path/rename_path #267/#291, path-validated)
│   ├── src/usage.rs        # Best-effort read of Claude's five-hour usage snapshot for the usage bar (#154)
│   ├── src/skills.rs        # Read-only scan of .claude skills/commands for prompt autocomplete (#114)
│   ├── Info.plist          # Partial plist (mic + speech-recognition usage strings), merged into the bundle
│   ├── tauri.conf.json     # Window, bundle, build config
│   ├── capabilities/       # Tauri permission capabilities
│   └── Cargo.toml          # Crate `recue` / lib `recue_lib`
├── packaging/              # Distro packaging (#361)
│   └── aur/recue-bin/      #   AUR PKGBUILD + .SRCINFO — repacks the release .deb into a
│                           #   native Arch package (system webkit2gtk, no FUSE). Re-pinned
│                           #   by scripts/aur-bump.sh; published to the AUR manually.
├── docs/                   # macos-permissions.md (#292) + linux-packaging.md (#361 —
│                           #   the Linux install matrix, the updater/pacman rule, the
│                           #   AUR maintainer runbook)
├── eslint.config.js        # ESLint flat config (TS + React)
└── .prettierrc.json        # Prettier config
```

## Commands

```bash
npm install            # install frontend deps (also resolves the Rust crate on first build)
npm run tauri dev      # run the desktop app (Vite + Rust) with hot reload
npm run tauri build    # build an (unsigned) bundle for the host OS (macOS .app/.dmg,
                       #   Windows NSIS/MSI, Linux AppImage — add `-- --bundles appimage`
                       #   to match CI's AppImage-only Linux output, #345)

npm run build          # type-check + build the frontend only
npm run bundle:report  # per-route first-paint JS, raw + gzip (after a build) (#356)
                       #   add `-- --check` to fail over the first-paint budget
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

> **Cross-platform builds (#139/#140/#143/#345).** The project builds, tests, **and runs** on
> **Windows, macOS, and Linux**. **#139** got it compiling + green on both macOS/Windows
> (`#[cfg(...)]`-gated Rust,
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
> **Linux (#345 — Arch/Ubuntu/Mint fully, best-effort others).** Linux inherits the
> `#[cfg(unix)]` code paths, so the port was small and targeted. The fixes: `os_open`
> (`open_data_folder`/`reveal_path`) and `reveal_file_in_finder` no longer assume the macOS
> `open` binary — they split into a macOS arm and a **Linux `xdg-open`** arm (`open_url`
> already had one), and the file-reveal best-effort-selects via the FreeDesktop
> `org.freedesktop.FileManager1.ShowItems` D-Bus call with an `xdg-open`-parent-dir fallback
> (`reveal_file_linux`); `default_shell` uses `$SHELL` with a `/bin/bash`→`/bin/sh` fallback
> (not macOS's `/bin/zsh`); the login-shell PATH probe already runs (unix) so a
> `.desktop`/AppImage launch gets the user's real PATH. Frontend: `platform.ts` gained
> `isLinux`, so `kbdHint` shows **Ctrl** (not ⌘) and `revealLabel` shows **"Reveal in File
> Manager"** on Linux; all CSS already works (Linux WebView is Chromium). Because the macOS
> host can't compile a Linux-only arm, Linux-only helpers widen their `cfg` with `, test)`
> (mirroring `explorer_select_arg`) so the host still type-checks + unit-tests them. Build:
> the release pipeline's matrix gained an **ubuntu-22.04 AppImage** leg (`--bundles appimage`,
> broad glibc/webkit2gtk-4.1 floor), minisign-signed like the other legs, merging a
> `linux-x86_64` updater entry into `latest.json` so the **AppImage self-updates**. Items
> needing a real Linux box (AppImage launch on each distro, the D-Bus reveal per DE, native
> notifications, clipboard-image paste, the self-update) are logged in **`TRAJECTORY_TO_LINUX.md`**.
>
> **Linux desktop entry (#362).** The generated `.desktop` comes from
> `src-tauri/linux/recue.desktop` via `bundle.linux.deb.desktopTemplate` — which the **AppImage**
> bundler also uses (it packs its `.AppDir` from the deb data tree; there is no
> `appimage.desktopTemplate`) — and its `StartupWMClass` matches the prgname ReCue **pins** in
> `linux_desktop.rs` (`glib::set_prgname`, so the WM_CLASS/`app_id` is an owned `recue`, not an
> `argv[0]` accident). The app **never** installs a desktop file; AppImage users run
> `scripts/install-linux-desktop.sh` (consent-gated, XDG-only, reversible).
>
> **Linux performance (#346).** Four fixes for the "everything is slow on Arch" report:
> (1) **(#346/#347)** `linux_webkit.rs` sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` at boot only
> where DMA-BUF is genuinely bad — the pure, unit-tested `decide_dmabuf` over a **GPU-aware**
> probe (`/sys/class/drm/card*` driver names + PCI vendors → `Mesa`/`NvidiaBlob`/`Virtual`,
> the NVIDIA kernel-module flavor+version, `__GLX_VENDOR_LIBRARY_NAME`/`__NV_PRIME_RENDER_OFFLOAD`,
> a tightened VM detector): disable when the **NVIDIA blob is the only renderer**, when GL is
> **PRIME-routed** to it, or in a **VM with no native Mesa GPU** — otherwise keep DMA-BUF. #346
> disabled it on the mere *presence* of the NVIDIA kernel module, which on a **hybrid laptop**
> (Intel/AMD iGPU + NVIDIA dGPU, where the webview renders on the healthy Mesa iGPU) forced CPU
> webview rendering and **was itself** the reported slowness (#347 — it also fixes the coarse VM
> heuristic: a bare-metal Xen dom0 / a `"PowerEdge KVM 1000"` no longer read as VMs). The user's
> own env is never touched, `RECUE_DISABLE_DMABUF=1|0` force-overrides (a tri-state
> `RendererOverride`), and **one** boot line names the evidence for **both** outcomes. **#357**
> fills that tri-state seam with a **persisted setting** (`linuxDmabufRenderer`: auto/on/off,
> Settings → Rendering) — precedence `WEBKIT_DISABLE_DMABUF_RENDERER` > `RECUE_DISABLE_DMABUF` >
> Settings > auto. Mind the **polarity**: the *setting* names the renderer (`on` = DMA-BUF on =
> `ForceKeep`), the *env var* names the workaround (`=1` = disable = `ForceDisable`). Because GTK
> reads the env **once at init** and the Tauri `Store` only exists inside `.setup()` (i.e. after
> GTK init), the mode is read straight off `sessions.json` **before `tauri::Builder`** by the
> shared **`early_settings.rs`** (`$XDG_DATA_HOME`-or-`$HOME/.local/share` + the bundle
> identifier, `include_str!`-drift-guarded, fail-open → `auto`) — the **same** reader `linux_gtk`
> (#349) uses for `theme`. So it applies at the **next launch**, never live (`set_var` after
> threads exist is unsound), and there is deliberately no in-app "Restart now" (it would kill
> every agent's PTY);
> (2) the terminal pool probes the WebGL renderer string once (Linux only) and skips the
> xterm WebGL addon when it's software-rasterized (llvmpipe/SwiftShader → DOM renderer,
> `webglRenderer.ts`) — **#357** makes this user-overridable too (`linuxTerminalRenderer`:
> auto/webgl/dom), applied **live** by `terminalPool.applyTerminalRenderer()`, which
> loads/disposes the `WebglAddon` on the **running** xterm (the `onContextLoss` path) so no host
> is ever disposed (#18) and the **shared** glyph atlas is never cleared (#221); (3) `session_scrollback` ships **base64** (`ScrollbackReply.b64`,
> decoded by `decodeOutputB64`) instead of a ~1 MB JSON integer array per terminal mount;
> (4) the `lib.rs` event forwarder drains its queue after each blocking `recv` and merges
> consecutive contiguous same-session output chunks (`pty::coalesce_output_events`) into
> one emit — each emit is an evaluate-JS on the webview main thread, costliest on
> WebKitGTK. (3)+(4) are platform-neutral wins; (1)+(2) are unreachable on macOS/Windows.
>
> **WebGL context loss (#364).** The same DOM-renderer fallback also covers a *runtime* loss:
> when xterm's WebGL addon fires `onContextLoss` (an **unrecovered** loss — GPU OOM, driver
> reset, suspend; the addon handles a recoverable one itself within ~3s, so we never re-attach
> or retry), the pool clears its addon reference (so the #221 one-shot font-atlas rebuild can't
> call into a disposed renderer) and **disposes** the addon — xterm swaps its render service
> back to the DOM renderer and re-lays-out the **same** buffer, so the #18 pooled terminal is
> never remounted and no scrollback is replayed — then **latches** the window (the pure
> `Terminal/webglFallback.ts`): no terminal in it re-attaches WebGL for the rest of the run, since
> a driver that dropped one context drops the next one too. One `console.warn` per window; the
> latch is per-document, so a detached canvas window (#84) latches independently. Platform-neutral
> code that merely *fires* most often on WebKitGTK. The addon is loaded lazily (#356), so the
> handler is attached to the resolved addon instance and both the `disposed` flag and the latch
> are re-checked after the `import()` settles — a host torn down (or a window latched by another
> terminal's loss) mid-load never attaches WebGL. The latch also **outranks the #357 Settings
> override**: `terminalPool.webglPermitted()` is `webglFallback.allowsWebgl() &&
> rendererDecision().webgl` — latch first (so a fallen-back window never even builds the #346
> probe canvas), so a user who forces "WebGL" in Settings → Rendering on a window that already
> lost a context stays on the DOM renderer until relaunch, and the Settings diagnostics readout
> says so. Forcing "DOM" still unloads a live addon immediately.
>
> **AppImage child environment (#350).** Under the AppImage, every child ReCue spawned
> inherited the AppRun's environment — `APPDIR`/`APPIMAGE`/`OWD`/`ARGV0`, a forced
> `GTK_THEME=Adwaita:light` + `GDK_BACKEND=x11`, and `PATH`/`LD_LIBRARY_PATH`/`XDG_DATA_DIRS`/…
> segments under the transient `/tmp/.mount_…` FUSE mount — which is documented to break
> `xdg-open` and to degrade a system binary that then loads the AppImage's bundled libraries.
> **`src-tauri/src/child_env.rs`** (modeled on `linux_webkit.rs`) is the one scrub seam: a pure,
> unit-tested core (`is_appimage_segment` / `filter_segments` / `scrub_env` / `env_diff` — a
> **value-based** rule that strips any `$APPDIR`-owned `:`-segment from **any** var, drops the
> marker/forced vars, restores an `APPIMAGE_ORIGINAL_<VAR>` backup verbatim, and never empties
> `PATH`) plus three entry points every spawn goes through — `child_env_vars()` (the `pty.rs`
> PTY env copy), `scrub_command()` (inside `git::hidden_command`, so every `git`/CLI probe) and
> `command()` (the `os_open`/`open_url`/`reveal_file_in_finder`/`reveal_file_linux` openers +
> the `path_env` login-shell probe). It **arms only when `APPDIR`/`APPIMAGE` is set**, so macOS,
> Windows and a non-AppImage Linux build are byte-for-byte unchanged (no `env`/`env_remove` call
> is added at all); `WEBKIT_DISABLE_DMABUF_RENDERER` (#346, ReCue's own webview) is not stripped.
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
> reach the browser on Windows. `os_open` still backs the **folder** opens
> (`reveal_path`/`open_data_folder`) — macOS `open` / **Windows `explorer.exe`** / **Linux
> `xdg-open`** (#345). User-facing copy that names the platform (the #208
> first-release patch note) reads "macOS, Windows, and Linux".
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
  cleanly with an error toast. No confirm gate; still no commits / push. And (6) **`git
  clone`** (#295/#308, `git.rs clone_repo`) — the sidebar background menu's **Clone Repo…**
  clones a URL into a chosen parent dir (blobless `--filter=blob:none`, `GIT_TERMINAL_PROMPT=0`
  / `GIT_SSH_COMMAND=…BatchMode`, refuses a non-empty dest) and registers + starts a session on
  the cloned default branch (#298). Still no commits / push.
- **File access is read-mostly, with a small set of deliberate writes** — `files.rs` lists +
  reads repo text files for the viewer (#40/#44) and writes the repo: since **#141**
  `write_text_file` (the app's **first arbitrary file write**, backing the markdown
  **Kanban board** #141–#151 and the FileViewer's **editable raw markdown / plain-text**
  view #148/#149), since **#253** `move_into_repo` — which
  **moves a dragged OS file/directory into** a repo folder (drag-from-Finder/Explorer
  onto the file tree) — and since **#267/#291** `create_dir` / `delete_path` / `rename_path`
  (FileTree context-menu New folder / Delete / Rename, path-validated: refuse repo root /
  symlink / `..` / collision, `windows_safe_seg` guard). The move confines only the **destination** to the repo (the
  source is the user's dragged OS path — explicit consent, like the #163 native dialog),
  refuses a name collision (no overwrite), and is data-safe (same-volume `fs::rename`,
  else cross-volume recursive copy **then** remove — a failure never loses the source);
  no shell-out, so it behaves identically on macOS/Windows. **File listing scales to any repo, all
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
- No Archive (single **Remove = kill + forget**), no Skills manager, no auth.
  **Light mode now exists** (#333 — reverses the v1 "Dark theme only" / "no light mode"
  rules, like #84/#100/#126 reversed single-window/settings/fork): a Dark/Light toggle in
  Settings → Appearance swaps in a Catppuccin **Latte** token block (the terminal stays
  dark in both). **Fork now exists** (#126 — reverses the v1 "no Fork" rule): a "Fork
  conversation" button on every agent header branches the source agent into a new
  parallel session (see the Spawn note + Conventions).
- **Settings** now exists (#100/#102/#103 — reverses the v1 "no settings screen"
  rule, as #84 reversed single-window): a sidebar footer gear opens a modal with
  Terminal / Sessions / Appearance / Behavior / Data & About sections (see the
  architecture note). A **Dark/Light theme** toggle lives in the Appearance section
  (#333, default Dark); no per-session config beyond these.
- **Multi-window** is now supported for **Canvas tabs only** (#84 — reverses the v1
  single-window rule): a canvas can open in its own native window (pop-out button +
  drag tear-off) for multi-monitor use. Detached windows are **per-session** (not
  restored on relaunch); Overview and individual panels do **not** pop out, and a
  single PTY is never shown in two windows at once (see the architecture note).
- **macOS code signing + Hardened Runtime + entitlements now exist — for permissions**
  (#292 — narrows the earlier "no code signing / notarization" rule, the way #74/#124
  narrowed the git rule and #84/#100/#126 reversed single-window/settings/fork). The old
  rule was the direct cause of a bug: voice/mic and protected-folder (Downloads/Documents/
  Desktop) prompts asked ~5× and never worked, because macOS **TCC** pins a grant to the
  app's **code signature**, and an unsigned/ad-hoc app has no stable one (so every launch
  looks new), while the mic also needs the **`com.apple.security.device.audio-input`**
  entitlement present in the signature under the **Hardened Runtime** —
  `NSMicrophoneUsageDescription` alone is not enough. The machinery: a
  **`src-tauri/Entitlements.plist`** (audio-input + `cs.disable-library-validation`; **no App
  Sandbox**; kept **comment-free** so `codesign`'s AMFI parser accepts it #321) wired via
  `tauri.conf.json` `bundle.macOS.entitlements`, four protected-folder
  `NS*FolderUsageDescription` strings in `Info.plist`, and `scripts/sign-macos-local.sh` for
  a **local** stable self-signed re-sign (**#314**, `npm run build:mac` — no Apple account).
  **#314** found the real gap: the Tauri bundler only applies the entitlements + Hardened
  Runtime **when a signing identity is configured**, so a plain `tauri build` — and every CI
  release with no `APPLE_*` secrets — stayed **ad-hoc** (the shipped bug). **#321** closes it
  for the **shipped** app: `release.yml` now **signs CI releases** — sign-only with a stable
  **self-signed** cert (4 secrets, set by **`scripts/gen-macos-ci-cert.sh`**; grants persist,
  Gatekeeper warns) **or** Developer-ID **sign+notarize** (all 7 secrets; Gatekeeper-clean) —
  selected purely by which secret subset is present, with a robust split so an empty
  notarization var can't fail the build and **no secrets still falls back to ad-hoc** (build
  succeeds). #321 also adds the one **runtime** touch (macOS-only, `#[cfg]`-gated,
  Windows/Linux no-op): a **one-time `tccutil reset`** at boot (persisted
  `perm_reprompt_done` flag) so a user updating from an old ad-hoc build is **re-asked once**
  (and now Allow works), then never nagged again. Full walkthrough + recovery
  (`tccutil reset Microphone com.recue.app`) in **`docs/macos-permissions.md`**. Still no App
  Sandbox; notarization stays optional (needs an Apple account) — a self-signed build warns
  at Gatekeeper on first download but works and persists.

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
  **The `Exited` event is driven by the child, not the PTY (#354).** A per-session
  **exit-waiter thread** (`pty.rs exit_waiter`) owns the `Child`, blocks in `wait()`, and
  is the **sole** emitter of `SessionEvent::Exited` (the reader thread no longer sends it —
  exactly **one** `Exited` per PTY generation, which the consume-once `intentionalKills`
  bookkeeping relies on). Before, the exit was derived from the reader hitting **EOF** — but
  on unix a PTY master only EOFs once **every** holder of the slave fd is gone, and claude's
  subprocesses (MCP servers, tool children) inherit it, so an agent that had already exited
  kept its card alive for seconds ("instances exit slow"). The waiter still waits (bounded,
  `EXIT_DRAIN_MS`) on the reader's `reader_done` flag first, so trailing output still
  precedes `Exited`. On unix a kill signals the child's whole **process group**
  (`hangup_group`/`kill_group`: `killpg` SIGHUP → bounded grace → SIGKILL — portable-pty
  already `setsid()`s the child, so `pgid == pid` and the group holds nothing but its own
  descendants), so no MCP/tool child is orphaned (#31); `kill_session` is **non-blocking**
  (the escalation runs off-thread, instead of portable-pty's ~200ms in-command sleep); and
  `kill_all` (shutdown) pays **one** shared grace for all sessions and **silences** the exit
  events (an `ExitState.silent` flag set **before any signal**) — a prompt `Exited` could now
  reach the still-live webview, and an agent that exits 0 on SIGHUP would read as a *clean*
  exit, so `isCleanExit` would **delete the persisted record** and the session would not come
  back (#30/#63). A signal death maps to exit code **1** (portable-pty), never 0, so a killed
  agent can never be mistaken for a clean exit. **Windows is unchanged**: no job object — the
  kill is still `ChildKiller::kill()` → `TerminateProcess` on the direct child; it inherits
  only the platform-neutral child-wait-driven `Exited`.
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
  **Hidden until painted (#348)** — every window (main + detached canvas) is created
  **`visible: false`** with a **themed native `backgroundColor`** (`tauri.conf.json`
  `app.windows[0]` / `WebviewWindowBuilder::background_color`, from the pure
  `commands::background_for_theme`; `lib.rs` `setup` re-colors the main window from the
  **persisted** theme right after the `Store` is managed, so a light-theme user's window
  never flashes dark). `index.html` carries an **inline `<style>`** (the *only* styling
  that exists at first paint — every stylesheet is JS-imported via `main.tsx`) plus an
  inline boot script that reads the **`recue.theme` localStorage mirror** (written by
  `applySettingsEffects`, `src/theme.ts`) so the first frame is already the right theme.
  The frontend then shows the window from **`useRevealWindow`** → the Rust
  **`reveal_window`** command (JS can't call `window.show()` — `core:window:default` grants
  no `allow-show`, and widening it isn't needed since window ops are already Rust-owned),
  with `schedule_reveal_fallback` showing any still-hidden window after **2 s** so a dead
  bundle can't leave the app invisible; a runtime theme switch pushes the new native color
  via `set_theme_background`. Because `App()` is a **`Suspense` router over two lazy route
  chunks** (#356), the hook is called from a **`RevealOnPaint`** component rendered *inside*
  that boundary, as a sibling of the route — a pending boundary commits its **fallback**,
  not its children, so the reveal fires only once `MainApp` / `CanvasWindow` has actually
  mounted, never on the empty fallback frame (and a chunk that never loads can't deadlock
  the window shut: the 2 s Rust fallback still shows it).
  **Invariant:** the two pre-paint hexes (`#11111b` dark / `#dce0e8` light — the crust
  stage since UI v2 task 372) are duplicated in **five** places — `--bg-base` in
  `src/styles/tokens.css`, the inline style in `index.html`, `THEME_BG` in `src/theme.ts`,
  `background_for_theme` in `commands.rs`, and `"backgroundColor"` in
  `src-tauri/tauri.conf.json` — keep them in sync (the TS/HTML/CSS trio is guarded by
  `src/theme.test.ts`, the Rust mapping by its own unit test, tauri.conf.json by review). Platform-neutral: no `#[cfg]` arms (on macOS
  `set_background_color` is a no-op for the *webview* layer, but the document's inline
  `html` background paints over it before the window is ever revealed).
- **Builds & distribution:** `npm run tauri build` produces a local macOS `.app`/`.dmg`,
  Windows NSIS/MSI installers, or a Linux **AppImage** (#345, host-OS dependent); the
  **updater artifacts are minisign-signed** on all three. Release builds use a tuned
  **`[profile.release]`** (#358 — fat `lto`, `codegen-units = 1`, `strip = true`, size
  `opt-level = "s"`) so the binary — and with it every bundle, above all the AppImage, whose
  squashfs is paged in on **every** cold start — is materially smaller; it deliberately keeps
  **`panic = "unwind"`** (**never** set `panic = "abort"`, and the manifest says why) so a
  panic in a reader / monitor / title / forwarder / poll thread kills only that thread instead
  of the whole app and every live PTY session. The extra link time is paid only by
  `release.yml` (a version-bump push); the PR gate and `tauri dev` build with the dev/test
  profiles. macOS
  Windows NSIS/MSI installers, or — on Linux — an **AppImage** *and* a **`.deb`** (#345/#361,
  host-OS dependent); the **updater artifacts are minisign-signed** on all three. On Linux
  only the **AppImage** is an updater artifact (Tauri's Linux updater can only replace the
  file at `$APPIMAGE`), so `latest.json`'s `linux-x86_64` entry points at it and it
  **self-updates**; the `.deb` gets no `.sig` and exists to be **repacked by the in-repo AUR
  package** (`packaging/aur/recue-bin/` — `PKGBUILD` + `.SRCINFO`, re-pinned by
  `scripts/aur-bump.sh <version>` and published to the AUR **manually**, never from CI), which
  gives Arch users a native build against the **system** webkit2gtk/GTK (no bundled Ubuntu
  userland, no FUSE, no AppRun `GTK_THEME`/`GDK_BACKEND` forcing). Because the AUR package
  repacks the **same binary** the `.deb` carries, "is this a distro install?" **cannot** be a
  compile-time flag — it is a **runtime** probe: `commands::install_kind()` (pure
  `classify_install`) reports `"bundle"` (macOS/Windows/any debug build) / `"appimage"`
  (`$APPIMAGE` set) / `"system"` (a Linux release binary **without** it ⇒ pacman/apt owns it;
  `RECUE_INSTALL_KIND` force-overrides). The frontend's pure `selfUpdates()` (`platform.ts`)
  gates the whole update surface on it: a `"system"` install makes `checkForUpdate` a
  no-network no-op, hides the `UpdateIndicator`, refuses `installUpdate`, and swaps Settings →
  Updates' Check/Update-now buttons for a `pacman -Syu` note (current version + #192 patch
  notes still render). The pre-load default (`""`) reads as self-updating, so macOS, Windows,
  and the AppImage are unchanged. See `docs/linux-packaging.md`. macOS
  builds carry **Hardened Runtime + `Entitlements.plist`** (#292, `bundle.macOS.
  entitlements`) so mic/voice + protected-folder permissions work and persist — but **only
  once actually signed with an identity** (#314): a plain `tauri build` is ad-hoc (sign it
  with `npm run build:mac`), and **CI releases** sign self-signed (4 secrets via
  `scripts/gen-macos-ci-cert.sh`) or Developer-ID + notarized (all 7 `APPLE_*` secrets),
  falling back to ad-hoc when no secrets are set (#321 — see the macOS-permissions scope
  note above + `docs/macos-permissions.md`).
  The **in-app auto-update** (#190, **re-introducing** the #15 updater that **#62
  removed** and rebuilding it richer) is **live** (activated once a real minisign
  keypair + GitHub secrets were provided):
  - **Plugins:** `tauri-plugin-updater` + `tauri-plugin-process` (Rust + JS), inited
    in `lib.rs`; `capabilities/default.json` grants `updater:default` +
    `process:allow-restart`. `tauri.conf.json` carries a `plugins.updater` block with
    the GitHub-releases `latest.json` `endpoints` (the `ErikdeJager/ReCue` repo) and the
    **real `pubkey`** (key id `CE271BFBDBF2D714`, the verbatim contents of the root
    `.recue-updater.key.pub`), and **`createUpdaterArtifacts` is ON** so each build
    emits the `.sig` + `latest.json` updater set. The matching **private** key lives in
    the `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repo secrets.
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
  - **Patch notes (#192):** per-version notes for the **current** (installed) version are
    authored in-repo as `src/patchnotes/<version>.json` (`{version,date,changes:[{category,
    items[]}]}`), loaded + normalized by the pure `src/patchnotes.ts` (`import.meta.glob`
    eager, `patchnotesFor`/`latestPatchnotes`/`patchnotesToMarkdown`) and rendered by
    `components/PatchNotes` in the Updates pane. For a **not-yet-installed** update, the
    notes ride **inside the release**: the pipeline **constructs** the release body at
    release time (Claude summarizes every change since the last tag — see Pipeline),
    `tauri-action` writes it into `latest.json`'s `notes`, `check()` returns it as
    `update.body`, and the store keeps it as `update.notes` — rendered (markdown) in the
    Updates pane's "What's new" slot so an older client reads them before installing.
  - **Pipeline:** `.github/workflows/release.yml` on push to `main` gates on a
    version bump (config version > latest `v*` tag). When it holds, a `prepare` job asks
    Claude to **construct the release body** from every change since the last tag
    (`scripts/generate-release-body.mjs` — reads the current version, prints the body
    markdown to stdout; **writes/commits nothing**), a `create-release` job opens **one**
    draft GitHub release with that body, and a **3-OS matrix** (`max-parallel: 1`, #345) —
    **macOS** (`universal-apple-darwin`) + **Windows** (`x86_64-pc-windows-msvc`) + **Linux**
    (`ubuntu-22.04`, `--bundles appimage`, after an apt-installed webkit2gtk-4.1 toolchain) —
    builds **signed** bundles via `tauri-action` and uploads them **by `releaseId`** to that
    draft, merging one `latest.json` (`darwin-aarch64`, `darwin-x86_64`, `windows-x86_64`,
    `linux-x86_64`). Serialized so the `latest.json` read-modify-write merge is deterministic
    (Linux appends last).
  - **Releasing:** the pipeline leaves a **draft** — a maintainer **publishes** it (the
    `/releases/latest/download/latest.json` endpoint only resolves to a published,
    non-draft "latest" release). Each new release = bump `version` in `tauri.conf.json` +
    push to `main` + publish the draft (the release body is constructed automatically);
    optionally add `src/patchnotes/<version>.json` for the **in-app** current-version
    "What's new" once that build is installed. The
    interactive flow is also runtime-exercised by the dev mock (#193). _(This reverses the
    earlier #62 "no in-app auto-update / no release pipeline" rule; the update signatures
    are minisign-only. macOS **code signing** exists for permissions (#292/#314/#321 —
    Hardened Runtime + entitlements); `release.yml` signs CI releases self-signed (4 secrets)
    **or** Developer-ID + notarized (all 7 `APPLE_*` secrets), by which subset is set,
    falling back to ad-hoc with none — so Apple **notarization** is optional (needs an Apple
    account) rather than the only signed path.)_
  The bundle ships a partial `src-tauri/Info.plist` (auto-merged by the Tauri CLI in
  both `dev` and `build`) declaring `NSMicrophoneUsageDescription` /
  `NSSpeechRecognitionUsageDescription` so voice dictation works inside a session's PTY
  (macOS attributes a child process's mic request to the responsible app — ReCue).
- **Styling (UI v2, #372–#383):** CSS Modules (`*.module.css` next to each component)
  that consume the design tokens in `src/styles/tokens.css`. The reset, base styles,
  scrollbars, keyframes, and the `prefers-reduced-motion` killswitch live in
  `src/styles/global.css`; the shared **UI v2 primitives** sit beside them —
  `src/styles/atoms.css` (block buttons / chips / kbd hints), `menu.css` (the one
  anchored context-menu/popover look) and `modal.css` (the centered-modal scrim/pop
  chrome), plus the `SegmentedControl` / `Checkbox` / `Slider` atom components. All of
  it, with the bundled **JetBrains Mono** font (`@fontsource`, offline — never a CDN),
  is imported once in `src/main.tsx`. Stay on-system: use tokens, never off-system
  colors. The color tokens are a **Catppuccin Mocha** remap (#33) organized into the
  v2 **surface roles** (#372): `--surface-crust` (the content **stage** behind the
  Overview wall / Canvas splits, painted by the vendored `WaveBackground`, #377) /
  `--surface-mantle` (chrome: sidebar, rail, tab strip) / `--surface-base` (panels,
  cards, menus, modals) / `--surface-0`/`-1` (selection/hover fills) — the legacy
  aliases (`--content-bg` / `--bg-panel` / `--bg-elevated` / `--bg-hover` /
  `--bg-sidebar`) still resolve to them. The **corner language**: panels and everything
  inside them are square (`--radius-control`/`--radius-chip` 0); 5–7px rounding only on
  sidebar-chrome controls (`--radius-chrome`/`-chrome-sm`/`-btn`); 999px dots/pills;
  ~10–12px only on **floating chrome** (menus/modals/toasts — also the only shadowed
  surfaces: `--shadow-menu`/`-modal`/`-toast`). Stage geometry rides the
  `--stage-gap` / `--stage-pad-*` vars, zeroed by the `:root.dense` hook (**dense
  mode**, ⌘D, #373). Accent is **Peach**, with `--accent-fg` for readable text on the
  accent fill and `--scrim` for full-window dim overlays; the derived
  `--accent-tint-fill/-border/-hover` tokens `color-mix()` from the single
  `var(--accent)` — every color-mix-bearing fill/border declares a **plain token
  fallback first** (the cross-platform rule). A custom accent from Settings (#102)
  overrides `--accent` **and** its companions `--accent-hover` / `--accent-dim` /
  `--accent-fg` together (`accentCompanions`, #107), and the wave recolors live.
  **The accent never encodes status or selection**: statuses stay on the fixed
  `--status-*` / `--diff-*` / `--usage-critical` tokens, and selection/active fills are
  Surface0 (#375/#378). Design reference: `docs/ui-v2-handoff/DESIGN-SPEC.md` + the
  demo `ReCue-v2-demo.html` (untracked, local-only; demo wins over prose). The
  original near-black v1 palette lives in `TASK_ARCHIVE.md` (superseded).

## Tasks

Work is driven by the **`kanban-dev-pima`** pipeline (installed from cc-lib) — an
autonomous, four-lane board over `KANBAN.md` at the repo root. Cards flow strictly left to
right across four columns:

`## PLAN` → `## IMPLEMENT` → `## MERGE` → `## ARCHIVE` → recorded in `TASK_ARCHIVE.md`

Each lane is an independent **monitor-driven** skill (run one per terminal/session as
`/<name>`, **not** via `/loop`): it drains its input column, then arms a `Monitor` on that
column and waits, waking the instant a new card arrives. They coordinate only through the
repo-root board files:

- **The plan lane** ships as **two interchangeable variants** — run **one** at a time in
  the plan terminal; both explore the codebase, assign the next task number `N` (one greater
  than the highest used **anywhere** — board, `PLAN-*.md`, `TASK_ARCHIVE.md`; next is
  **#311**), write a self-contained `PLAN-<N>.md`, set the card's `Dependencies:`, and move it
  to `IMPLEMENT`, producing **identical board output**:
  - **`/plan-assume-kanban-dev`** (autonomous) — where a card is ambiguous it makes the most
    reasonable interpretation itself and **records each call** under a `## Task <N>` section in
    the tracked `ASSUMPTIONS.md`. No interruptions.
  - **`/plan-ask-kanban-dev`** — pauses to **ask clarifying questions** (via `AskUserQuestion`)
    before planning each card, then records your confirmed answers in `ASSUMPTIONS.md` (run it
    in an interactive terminal).
- **`/implement-kanban-dev`** — the one fan-out lane: dispatches up to **5**
  **`worktree-implementer`** subagents in parallel, each building one unblocked `IMPLEMENT`
  card in its own git worktree (`.worktree/<slug>`), running ReCue's checks, and opening a
  PR; the card moves to `MERGE` with its `PR:` url. A card is **unblocked** only when every
  `Dependencies:` task is in `## ARCHIVE` or already in `TASK_ARCHIVE.md`. (Watches `IMPLEMENT`
  + `ARCHIVE` — a landed dependency can unblock a waiting card.)
- **`/merge-kanban-dev`** — lands the topmost `MERGE` card's PR onto `main`, fast-forwards
  local `main`, and moves the card to `ARCHIVE`. Conflicts are resolved through the **forge
  API** (`gh`) — or, when real code conflicts exceed what the API can do, by **dispatching a
  `worktree-implementer`** to resolve them in an isolated worktree — **never** by checking a
  branch out in the main tree.
- **`/archive-kanban-dev`** — appends a `## Task <N>` entry to `TASK_ARCHIVE.md` (the
  permanent, tracked record), deletes the transient `PLAN-<N>.md`, removes the card, and
  commits & pushes.

Card shape (every lane reads/writes it):

```
- [ ] Task <N>: <title> — PLAN-<N>.md
    - Dependencies: <comma-separated task numbers, or "none">
    - PR: <url, once opened>
```

Each sub-line under a card (`Dependencies:`, `PR:`, `Revise:`, `Build-note:`) is indented
**4 spaces**, not 2 — `KANBAN.md` carries the `kanban-plugin: board` frontmatter so it renders
as a real Kanban board in ReCue's own in-app Kanban viewer (and any Obsidian-Kanban reader),
which treats a card's tab-/4-space-indented lines as its body but **drops** 2-space-indented
ones. The lanes read either indent (they parse the board as agents), so this is purely for
board-viewer rendering.

**Board files at the repo root.** `KANBAN.md` (the live board) and `PLAN-<N>.md` (per-task
plans) are **git-ignored / local-only**; `ASSUMPTIONS.md` (refinement decisions) and
`TASK_ARCHIVE.md` (permanent history — #1–#310 to date) are **tracked**. All feature work
happens in isolated worktrees — the **main checkout never leaves its branch**; the plan and
archive lanes commit only their own tracked file (`ASSUMPTIONS.md` / `TASK_ARCHIVE.md`) so the
concurrent lanes don't collide. Task numbers are **global and never reused**. The `(#N)`
provenance markers throughout this doc index back to `TASK_ARCHIVE.md` + git history.

Add work by writing one-line cards under `## PLAN` in `KANBAN.md`; the pipeline numbers,
plans, builds, merges, and archives them. **Never skip a card** — implement every unblocked
card (lowest number first); a card too large for one pass is **split into smaller dependent
cards** (as #93 → #93 + #94), never deferred.
