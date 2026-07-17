# Trajectory to Windows

A running log of Windows-specific bugs found and fixed while keeping macOS behavior
intact. Newest entries appended under a dated heading.

## 2026-06-24

### Audit summary (state at start of this pass)

The backend + frontend were already substantially ported across tasks #139–#143
(cfg-gated Rust, PowerShell/`claude.cmd` launch via `cmd.exe /C` + `PATHEXT`,
`USERPROFILE` home-dir, `explorer.exe` for open/reveal/url, `platform()` signal,
`kbdHint` display labels, `metaKey || ctrlKey` everywhere, `[\\/]` path splitting,
NSIS+MSI bundle with `icon.ico`). The audit confirmed those paths are sound. Remaining
issues found, ranked by severity:

1. **(Low / cosmetic) Scrollbar styling suppressed on WebView2** — `global.css` set the
   standard `scrollbar-width: thin` + `scrollbar-color` on `*` *alongside* the
   `::-webkit-scrollbar` rules. Chromium (WebView2) suppresses `::-webkit-scrollbar`
   custom styling when the standard properties are non-`auto`, so on Windows the themed
   10px thumb / hover color / inset border were dropped to a plain native thin bar.
   WKWebView honored the webkit rules. **Fixed below.**
2. **(Info, no change) `os_open` via `explorer.exe`** — `explorer.exe` returns a nonzero
   exit even on success, but `os_open` only `spawn()`s (never waits on status), so this
   is harmless. No change.
3. **(Info, no change) `csp: null`** — disables CSP on both platforms equally; not a
   Windows-specific issue.

No functional Windows defects were found in this pass — paths, shell/launch, home-dir,
keyboard, and bundle config are all correctly guarded.

### Fixes

- **Bug**: Themed scrollbars rendered as plain native thin bars on Windows (WebView2)
  because the standard `scrollbar-width`/`scrollbar-color` props suppressed the
  `::-webkit-scrollbar` styling in Chromium.
  **Fix**: Removed the standard `scrollbar-width`/`scrollbar-color` declarations from the
  global `*` rule, leaving only the `::-webkit-scrollbar` pseudo-element styling (honored
  by both WKWebView and Chromium/WebView2). Added an explanatory comment.
  **Files**: `src/styles/global.css`
  **macOS**: Preserved — macOS already rendered via `::-webkit-scrollbar`; the removed
  standard props were redundant (or, on Safari 18.2+ WKWebView, were themselves
  suppressing the webkit styling, so removal restores the intended look on both engines).

### Needs manual Windows verification

- Scrollbars in the sidebar, file viewer, and settings panes render as a 10px themed
  thumb with the hover color (not a plain native bar) on a real WebView2 build.
- `claude.cmd` (npm-installed) actually spawns through `cmd.exe /C` in a packaged build.
- NSIS + MSI installers build and install cleanly; `icon.ico` shows in Explorer/taskbar.
- `explorer.exe` open/reveal/url actions open the right default browser + file manager.

### Iteration 2

- **Bug**: Every shelled-out `git` command (`current_branch`, `working_diff`,
  `list_branches`, `checkout_branch`, `create_branch`, `worktree_add/remove`,
  `worktree_add_new_branch`, compare) and the `<cli> --version` presence/version probe
  used `std::process::Command` with no `CREATE_NO_WINDOW` flag. On Windows a GUI app has
  no attached console, so each call pops a transient black `conhost` window — and the
  branch/diff reads run on every refresh, so the flicker is near-constant and very
  visible. (HIGHEST-impact Windows UX bug found so far.)
  **Fix**: Added a shared `pub(crate) fn hidden_command(program)` in `git.rs` that sets
  `CREATE_NO_WINDOW` (0x0800_0000) on Windows via `CommandExt::creation_flags` and is a
  no-op on unix. Routed all 8 `git` invocations and `commands.rs::binary_version` through
  it. Verified: `cargo check` clean on Windows; 16 git tests pass.
  **Files**: `src-tauri/src/git.rs`, `src-tauri/src/commands.rs`
  **macOS**: Preserved — the `creation_flags` call is `#[cfg(windows)]`-gated; on unix
  `hidden_command` just returns `Command::new(program)` exactly as before. (PTY-spawned
  terminals are untouched — they run inside ConPTY and are *meant* to be visible.)

### Iteration 3

- **Audited, no change needed**: `files.rs` path validation is Windows-correct (repo-rel
  display paths normalize `\`→`/`; both repo + target are `canonicalize()`d so the
  Windows `\\?\` extended-length prefix matches in the `starts_with` containment check;
  `PathBuf::join` accepts the frontend's `/`-separated relative paths on Windows).
  `capabilities/default.json` is minimal + platform-agnostic (`core:default`,
  `dialog:default`). Tauri default `webviewInstallMode` (downloadBootstrapper) handles a
  missing WebView2 runtime — no config change needed.
- **Bug**: `Store::persist` does an atomic write via temp-file + `fs::rename`. The rename
  is correct on Windows (MOVEFILE_REPLACE_EXISTING), but on Windows it can transiently
  fail with "Access Denied" (os error 5) when antivirus / the Search indexer / a backup
  agent briefly holds a handle on `sessions.json` or the temp file — a failure mode POSIX
  `rename(2)` doesn't have. Because the app persists frequently (every busy→idle edge,
  rename, recent-touch), a transient lock meant a lost write plus a leftover `sessions.tmp`.
  **Fix**: Wrapped the rename in a short bounded retry (5 attempts, 20ms·n backoff); on
  final failure it removes the temp file so no litter is left. Verified: 19 store tests
  pass on Windows.
  **Files**: `src-tauri/src/store.rs`
  **macOS**: Preserved — not platform-gated, but macOS `rename(2)` succeeds on the first
  attempt, so the retry/sleep path is never entered; behavior is byte-for-byte unchanged.

### Iteration 4

- **Audited, no change needed**: `home_dir` (USERPROFILE→HOMEDRIVE+HOMEPATH fallback),
  `sanitize_seg`, and `title.rs::locate_log` (globs by UUID, never replicates claude's
  cwd→dir encoding) are all Windows-correct. `path_env`'s login-shell PATH probe is
  `#[cfg(unix)]`-only (correct — no Windows equivalent needed; PATH is inherited there).
- **Bug**: `worktree_path` built an app-managed worktree folder from the branch name via
  `sanitize_seg` only. A branch named after a Windows **reserved device name** (`con`,
  `prn`, `aux`, `nul`, `com1`–`com9`, `lpt1`–`lpt9` — all valid git branch names) yields a
  folder Windows refuses to create, so the worktree agent fails to launch. Trailing
  dots/spaces are also silently stripped by Windows, desyncing the recorded path from the
  one created. (macOS allows all of these, so it was never hit there.)
  **Fix**: Added `windows_safe_seg` — suffixes `_` to a reserved-name stem and trims
  trailing dots/spaces — applied to the branch segment in `worktree_path`. Added unit
  tests for both the Windows behavior and the unix identity. Verified: full Rust suite (65)
  + new tests pass on Windows.
  **Files**: `src-tauri/src/commands.rs`
  **macOS**: Preserved — `windows_safe_seg` is `#[cfg(windows)]`; the `#[cfg(unix)]` arm is
  the identity function, and a unix test asserts segments are returned verbatim.
- **RESOLVED (stray-`C`-on-spawn fix)**: the xterm.js (v6) terminal in `terminalPool.ts`
  now sets `windowsPty: { backend: 'conpty', buildNumber }` on Windows (via the pure
  `windowsPtyOption`, gated on the cached `platform` signal — absent on macOS, so the
  constructor is unchanged there). The real build number comes from a new Rust
  `windows_build()` command (`cmd /C ver` via `hidden_command`, parsed by the pure
  `parse_windows_build`; `0` on non-Windows), read once at boot into the store beside
  `platform`. This gives ConPTY-correct reflow (enabled at buildNumber ≥ 21376). Note:
  this was **not** the cause of the reported stray-`C` — that was a scrollback-replay ↔
  live-output **double-write** on a fresh spawn (fixed platform-neutrally with a
  byte-offset dedup, `replayDedupe.ts`; see the Output note in `CLAUDE.md`). Still worth a
  real-box check that long-line wrapping / resize reflow looks right with `windowsPty` on.

### Iteration 5

- **Areas newly audited (no change needed)**: `pty.rs` spawn/resolution (already
  Windows-correct via #140 `find_on_path` + `launch_target` + ConPTY), `agents.rs`
  (platform-agnostic; binary names resolve through `find_on_path`/PATHEXT), `skills.rs`
  (normalizes `\`→`/` in command names, uses `path_env::home_dir`), `lib.rs` (pure Tauri
  abstractions — `app_data_dir`, event forwarding, schedule poll), `tauri.conf.json`
  (native decorations, no vibrancy/transparency; `targets: "all"` → NSIS+MSI on Windows),
  the `Slider` range-input CSS (the `-5px` thumb `margin-top` is the standard hack honored
  by **both** Chromium/WebView2 and WebKit), and the frontend `/`-path splits in
  `FilePicker`/`FileSwitcher`/`CanvasSurface`/`fileType` (all operate on **repo-relative**
  paths that `files.rs` already normalizes to `/`, so they're correct on Windows).
  Keyboard handling is uniformly `metaKey || ctrlKey`.
- **Bug**: The `<binary> --version` presence/version probe (`commands::binary_version`,
  behind `claude_version` for Settings → About and `agent_info().version` for the #142
  agent selector) ran `Command::new(binary)` directly. On Windows `std::process::Command`
  uses `CreateProcess`, which appends `.exe` but **never consults `PATHEXT`** and **cannot
  execute a batch file** — so an npm-installed `claude` (which is `claude.cmd`) was reported
  as *not found / no version* even though it was installed and **sessions spawned fine**
  (the PTY path resolves it correctly via #140's `find_on_path` + `cmd.exe /C`). Symptom:
  Settings → About silently omitted the Claude version on a normal Windows install, and the
  selector misreported an installed agent. (`claudeMissing` itself is driven by real spawn
  `BinaryNotFound` errors, so it was unaffected — this was a probe/launch *inconsistency*.)
  **Fix**: Added `pub(crate) fn pty::resolve_command(program)` that shares the PTY spawn's
  resolution (`find_on_path` + `launch_target`), returning the `(exe, prefix_args)` the OS
  actually needs (on Windows, `cmd.exe /C <…\claude.cmd>`; on unix, the bare program name).
  `binary_version` now resolves through it before probing `--version`, so the probe matches
  what launches. Added 3 tests (missing-binary → None; Windows `.cmd`→`cmd.exe /C` routing;
  unix bare-name identity). Verified: 69 Rust tests pass + clippy clean on Windows.
  **Files**: `src-tauri/src/pty.rs`, `src-tauri/src/commands.rs`
  **macOS**: Preserved — on unix `find_on_path` resolves via `PATH` and `launch_target`
  returns the bare program name with no prefix args, so `binary_version` runs the *identical*
  command it always did. A unix test asserts the bare-name identity; the Windows-specific
  routing lives entirely inside the `#[cfg(windows)]` arms of `find_on_path`/`launch_target`.

### Needs manual Windows verification (Iteration 5)

- On a Windows box with `claude` installed via npm (so it's `claude.cmd`), open
  Settings → About and confirm the **Claude version line now appears** (it was blank before
  this fix), and that the #142 agent selector shows Claude as installed.

### Iteration 6 (audit pass — no code changes; remaining areas confirmed clean)

- **Git diff parsing (`git.rs::parse_unified_diff`, `run_git`/`run_git_raw`) — clean**:
  splits via `str::lines()`, which treats `\r\n` as one terminator and strips the trailing
  `\r`, so CRLF-file diffs render without stray carriage returns on Windows; output is read
  as UTF-8-lossy. `git` is a real `.exe`, so `Command::new("git")` resolves it via PATH+
  `.exe` (the PATHEXT/`.cmd` problem fixed in Iter 5 doesn't apply). All `git` calls already
  route through `hidden_command` (Iter 2). Diff output is byte-identical across OSes — no
  platform divergence.
- **Frontend file rendering — clean**: `read_text_file` returns content verbatim (CRLF
  preserved), but `FileViewer` renders through react-markdown / Prism (CRLF-safe) and does
  **no** manual `\n`-splitting for line numbers; the only frontend `\n`/`\r` handling is in
  a test. No stray-`\r` rendering under WebView2.
- **WebView2-divergent CSS — clean**: `color-mix(in srgb, …)` (used widely) is supported in
  WebView2/Edge ≥111 (evergreen) and the code already ships plain-color fallbacks
  (`Overview.module.css`); `inset: 0`, `aspect-ratio`, and `<input type="datetime-local">`
  all work in both WKWebView and Chromium (the date-picker chrome differs cosmetically only).
  No `backdrop-filter`/vibrancy/`-webkit-`-only declarations without fallbacks (the lone
  `-webkit-font-smoothing` is a harmless macOS-only no-op on Windows).
- **`worktree_path` (`commands.rs`) — clean**: extracts the repo basename via
  `Path::new(repo).file_name()` (correct on a `C:\foo\bar` path) and builds the dest with
  `PathBuf::join` + the Iter-4 `sanitize_seg`/`windows_safe_seg` guards.
- **Drag-and-drop — clean**: no OS-level file-drop (`onDragDrop`/Tauri `dragDrop`) is wired,
  so no native Windows paths are ingested; the app's only DnD is dnd-kit's internal
  reordering, which is path-agnostic.
- **xterm WebGL renderer — clean**: `WebglAddon` load is wrapped in try/catch with an
  `onContextLoss` dispose and a DOM-renderer fallback, so a WebView2 GPU/context failure
  degrades gracefully rather than breaking the terminal.
- **Flagged, not fixed (low risk, both platforms behave; would risk a macOS regression to
  change)**: repo grouping / worktree `repo_id` key off the **exact** `repoPath` string, so
  on Windows's case-insensitive filesystem the *same* folder added with different casing
  would group/hash as two repos. In practice the OS folder picker returns consistent casing
  and recents dedup by exact string, so this isn't hit; normalizing case here would be wrong
  on case-sensitive macOS volumes. Left as-is.
- **Still open (carried from Iter 4)**: the xterm `windowsPty` option remains unset — needs
  a real Windows box to choose the correct `{ backend, buildNumber }` (a wrong value worsens
  ConPTY reflow). Not changed without runtime testing.

No new functional Windows defects found this pass.

## 2026-06-26

### Rebase onto `main` (#179–#191) — re-audit of newly-merged features

Rebased `windows_port` onto `origin/main`, pulling in tasks #179–#191. The two Windows
commits replayed cleanly except one semantic conflict in `FileTree.tsx` (main's #167/#118
**lazy** file tree — `listDir`/`DirEntry` — superseded the old `listFiles`/`buildFileTree`
version the Windows commit had patched). Resolved by re-applying the Windows abstractions
(`platform` signal + `joinPath`/`revealLabel` in the right-click menu) onto main's lazy
model; the #184 "Copy relative path" item auto-merged correctly (relative paths stay `/`).

Re-audited every new feature against the port abstractions. The frontend was already clean —
all new `⌘` display literals route through `kbdHint`, all shortcut handlers use `metaKey ||
ctrlKey`, #182 markdown links open via `openUrl`→`os_open`→`explorer.exe`, and #184
copy-absolute-path / reveal use `joinPath`/`revealLabel` in both `FileTree` and `Sidebar`.
Tasks #186–#191 are Refine-only (task-doc commits, no source). One backend defect class:

- **Bug**: three **new** git invocations from main used a bare `Command::new("git")` instead
  of `git::hidden_command("git")`, so on Windows they pop a transient `conhost` window (the
  Iteration-2 console-flash class). All three run on hot paths: `fetch_remotes` (#180, `git
  fetch --prune` on the new-session branch picker), `pull_ff` (#181, `git pull --ff-only`
  from the repo/worktree context menus), and `run_git_raw_allow_diff` (#183, `git diff
  --no-index` for untracked files on every diff refresh). They compile and pass tests, so the
  rebase couldn't surface them — found by the standing "re-audit each new main feature" pass.
  **Fix**: routed all three through `hidden_command("git")`. Verified: 95 Rust tests pass,
  clippy + `cargo fmt --check` clean.
  **Files**: `src-tauri/src/git.rs`
  **macOS**: Preserved — `hidden_command` is the identity (`Command::new`) on unix; the
  `CREATE_NO_WINDOW` flag is `#[cfg(windows)]`-only, so macOS runs the identical command.

### Still needs manual Windows verification (carried + new)

- (Carried) xterm `windowsPty` backend/buildNumber; `claude.cmd` packaged spawn; NSIS+MSI
  install; `explorer.exe` open/reveal/url; themed scrollbars on WebView2.
- (New) The #180 remote-branch fetch, #181 Pull, and #183 untracked-diff actions run without
  a `conhost` flash on a real Windows build.

### Iteration 7 — exhaustive full-codebase audit

Whole-repo sweep (every Rust module, every frontend `.ts(x)`, all CSS, the build/bundle
config) via parallel read-only Explore agents, then each finding hand-verified. The code is
already well-hardened (Iters 1–6), so the net is one real bug + two flagged-for-Windows items;
several plausible-looking findings were verified to be NON-bugs and are recorded here so a
future pass doesn't "fix" them into regressions.

- **Bug (#194)**: `reveal_file_in_finder` built the explorer token with
  `Command::arg(format!("/select,{win_path}"))`. Rust's arg-quoting wraps an arg containing a
  space in quotes — producing `explorer.exe "/select,C:\Users\First Last\file.txt"` — and
  explorer's nonstandard parser, seeing the quote *before* `/select,`, opens the folder
  **without highlighting the file**. Windows paths very commonly contain spaces
  (`C:\Users\First Last\…`, `Program Files`), so "Reveal in Explorer" silently failed to
  select for many users.
  **Fix**: added `explorer_select_arg(path)` returning `/select,"<path>"` (backslashes,
  path quoted *inside* the token) and passed it via `CommandExt::raw_arg` so Rust doesn't
  re-quote. A `"` is illegal in a Windows filename, so the path can't break out. Added a
  cross-platform unit test (the helper is `#[cfg(any(windows, test))]`, so the macOS CI still
  exercises the quoting that the Windows-only spawn arm can't). Verified: 96 Rust tests pass,
  clippy + `cargo fmt --check` clean.
  **Files**: `src-tauri/src/commands.rs`
  **macOS**: Preserved — the `#[cfg(not(windows))]` arm (`open -R`) is untouched; the helper
  and `raw_arg` call are `#[cfg(windows)]` only.

- **Verified NOT a bug (left as-is)**: `git.rs::working_diff` passes `/dev/null` to `git diff
  --no-index` (#183). Confirmed empirically that git special-cases the **literal string**
  `/dev/null` in `diff-no-index`'s `get_mode()` (a `strcmp`, not a device access) on every
  platform incl. Git-for-Windows — `git diff --no-index -- NUL <file>` instead errors
  `Could not access 'NUL'`. So `/dev/null` is the correct, portable token; switching to `NUL`
  would **break** untracked-file diffs on Windows.
- **Verified NOT worth changing**: `files.rs` `SKIP_DIRS.contains(name)` is case-sensitive.
  Making it case-insensitive would, on a case-*sensitive* macOS/Linux volume, start hiding a
  user's real `Build`/`Target`/`Dist` *source* dir (distinct from the lowercase generated one),
  a macOS behavior change — and on Windows the file tree works fully either way (a `Build`
  output dir merely shows when lowercase `build` would be hidden). Heuristic, not a defect.
- **Verified already-deferred (Iter 6)**: repo paths used as map keys aren't case-normalized,
  so the same folder added with different casing dedups as two on Windows. Canonicalizing would
  be wrong on case-sensitive macOS volumes; the OS folder picker returns consistent casing, so
  it isn't hit. Left as-is.

### Still needs manual Windows verification (Iteration 7)

- **xterm `windowsPty` (carried, unchanged)**: still unset. The correct value depends on the
  ConPTY reflow build number and a wrong value *worsens* rendering, so it's not guessed without
  a real box. On a Windows build, open a shell + an agent terminal, type long lines and resize
  the panel; if lines duplicate/blank, set `windowsPty: { backend: 'conpty', buildNumber }`
  (gated via the cached `platform` signal) and re-test.
- **cmd.exe metacharacters in a seeded/scheduled prompt (new, flagged not fixed)**: a
  prompt-seeded session (#93) whose agent is an npm `claude.cmd` launches via `cmd.exe /C
  claude.cmd "<prompt>"`. portable-pty quotes the prompt arg, so `& | < > ( )` are literal, but
  cmd.exe still expands `%VAR%` *inside* double quotes, so a prompt containing `%…%` would be
  altered before the agent sees it. There is no robust `cmd /C` escape for `%`, and this only
  affects seeded/scheduled launches of a `.cmd` agent (interactive prompts typed into the TUI
  are unaffected). On a Windows box, schedule an agent with a prompt containing `50%` /
  `%USERPROFILE%` and confirm whether the text arrives verbatim; fix only if it manifests.

## 2026-06-28

### Terminal paste on Windows (#220)

Implemented Ctrl+V paste in agent + shell terminals on Windows (the macOS ⌘V already
works via xterm's native paste). xterm forwards **Ctrl+V** as the literal control byte
`^V` (0x16) by terminal convention rather than pasting, so a Windows-gated
`attachCustomKeyEventHandler` (`terminalPool.ts`) intercepts **Ctrl+V / Ctrl+Shift+V**,
reads the OS clipboard via the new `tauri-plugin-clipboard-manager`, and pastes via
`term.paste()` (bracketed-paste-aware), returning `false` so no stray `^V` reaches the
PTY. Text is read in JS (`readText`, capability-gated); an image is read Rust-side
(`save_clipboard_image` → temp PNG via the `png` crate), its path pasted so `claude`
attaches it. macOS is fully gated out (only acts when `isWindows(platform)`), so ⌘V is
native and Ctrl+V stays `^V`; **Ctrl+C is never touched** (still SIGINT). Cross-platform
primitives only (`std::env::temp_dir()`, the clipboard plugin) — no OS-specific code in
shared paths beyond the `isWindows` gate.

#### Still needs manual Windows verification (#220)

- **Text paste (high confidence, still real-box-pending)**: on a Windows build, copy
  multi-line text, focus an agent terminal, press **Ctrl+V** → the text must arrive
  intact (multi-line preserved by bracketed paste) with **no stray `^V`/0x16**; repeat
  with **Ctrl+Shift+V**. Confirm a shell terminal pastes too (shared `createHost`).
  Confirm macOS ⌘V still pastes and Ctrl+V still emits `^V` (gated off on macOS).
- **Image paste (best-effort, assumption-dependent)**: copy an image (e.g. a screenshot),
  press **Ctrl+V** in an agent terminal with no text on the clipboard → expect the image
  written to a temp PNG (`%TEMP%\recue-paste-*.png`) and its path pasted, with
  `claude` attaching it. **Assumption to confirm:** the Windows `claude` CLI attaches an
  image when given its file path in the prompt. If real-box testing shows it needs a
  different signal (e.g. it reads the OS clipboard on a specific keystroke), adjust the
  image branch to forward whatever `claude` consumes — the **text** paste stands
  regardless. Verify the temp PNG is created and (after an hour) opportunistically swept
  by `cleanup_stale_paste_images`.

### Terminal font "jiggly" on Windows (#221)

Implemented the **primary** fix: explicit webfont load + WebGL glyph-atlas rebuild in
`terminalPool.ts` `createHost`. A canvas/WebGL renderer draws glyphs into a texture
rather than laying out DOM text, so bundled **JetBrains Mono** was never fetched on
xterm's behalf and `document.fonts.ready` could resolve before/without it — leaving the
GL atlas built with fallback-font metrics (the subtly malformed glyphs, "C" especially).
Now `createHost` explicitly `document.fonts.load(...)`s the 400/500/700 faces at the
configured size, then (guarded against a disposed host) `webgl?.clearTextureAtlas()`,
re-applies `fontFamily` (via a transient that never paints) to force xterm's char-size
service to re-measure the cell, `term.refresh(0, rows-1)`, and refits. OS-neutral and a
no-op on macOS (already crisp). WebGL is **kept** on Windows by this path.

#### Still needs manual Windows verification (#221)

- On a Windows build, open an agent + a shell terminal and confirm glyphs render crisp
  in JetBrains Mono (notably "C"), box-drawing aligns, and **resize / view re-tile /
  reparent** keeps it crisp (no regression to a fallback after a reflow). Confirm macOS
  is visually identical before/after.
- **Documented fallback if the jiggle persists** (i.e. it's a deeper WebGL atlas /
  devicePixelRatio artifact, the same class already worked around for detached windows):
  generalize the main-window WebGL gate `if (IS_MAIN_WINDOW)` to `if (IS_MAIN_WINDOW &&
  !isWindows(useStore.getState().platform))` so the main window also uses the **DOM
  renderer on Windows** — it lays out real text (loads the webfont, no GL atlas),
  visually equivalent at the cost of GPU acceleration on Windows. `isWindows` is already
  imported (from the #220 paste handler). Apply only if the primary fix doesn't fully
  resolve it on a real box; record which path won here.

### Iteration 8 — parity audit of newly-merged features (#222–#234)

Re-audited every feature merged since Iteration 7 (tasks #222–#234: Canvas "+"/Templates
menu rework, distribute-panels button, **#224 template file block full paths +
relative/absolute choice**, sidebar/agent-header branch badges, **#227/#229 extended +
diff syntax highlighting**, **#230 a Commits source for the diff viewer**, **#231 diff
viewer redesign**, **#232 scheduled-time "today" formatting**, **#233/#234 Kanban
redesign + hover-lift**) via parallel read-only Explore agents, then hand-verified each
finding by reading the cited code. The highest-risk recurring class — **new `git`
invocations** — was clean this time: #230's `git.rs::list_commits` / `commit_diff` both
run through `run_git_raw` → `git::hidden_command` (the `CREATE_NO_WINDOW` console-flash
guard), and the only bare `Command::new("git")` is in `#[cfg(test)]` code. Keyboard
handling (all `metaKey || ctrlKey`), URL/reveal (`openUrl`/`revealLabel`), and #232 time
formatting (`time.ts` `toLocaleString` with explicit options — locale-driven, not
platform-driven) were all already correct. Net: one real cross-OS gap in #224's new path
handling, plus a consistency hardening of basename extraction.

- **Bug (#224)**: `fileBlockTarget` (`templateInstantiate.ts`) returned a template's
  **relative** `open-file`/`open-kanban` path verbatim. A template authored on Windows
  may store native separators (`src\components\App.tsx`); the backend reports/accepts
  repo-relative paths `/`-separated on every OS, and `PathBuf::join` treats a backslash
  as a **literal filename char** on macOS/Linux — so a `\`-typed template would resolve
  only on Windows (and mis-title via `split("/")`), breaking cross-OS template
  portability. (Absolute blocks are machine-specific by design and already split via
  `splitPath`, which handles `\` — so they were already correct.)
  **Fix**: normalize the relative segment to `/` in `fileBlockTarget`'s relative branch
  (`file.replace(/\\/g, "/")`), matching the backend's `/`-separated convention. Added a
  unit test (`src\components\App.tsx` → `src/components/App.tsx`).
  **Files**: `src/components/Canvas/templateInstantiate.ts`,
  `src/components/Canvas/templateInstantiate.test.ts`
  **macOS**: Preserved — a `/`-only relative path (the common case) is byte-for-byte
  unchanged by the replace; only a backslash-bearing path (never produced on macOS) is
  affected.

- **Consistency hardening**: three display-basename extractions still split on `/` only
  while `Overview.tsx` already used the cross-platform `split(/[\\/]/)` seam. A file ref
  reaching them can carry native separators (a Windows-authored template relative path),
  so they were aligned to `split(/[\\/]/)` (`itemTitle.ts` panel titles ×2,
  `fileType.ts` `fileExt`/`langByFilename`, `Sidebar.tsx` Kanban-row name). On a `/`-only
  path the output is identical, so macOS is unchanged. `DiffInspector.tsx`/`FileTree.tsx`
  split on `/` too but operate strictly on backend-reported diff/tree paths (always `/`),
  so they were left as verified-safe.
  **Files**: `src/components/ItemContent/itemTitle.ts`,
  `src/components/FileViewer/fileType.ts`, `src/components/Sidebar/Sidebar.tsx`

- **Verified NOT a bug (left as-is)**: the `color-mix(in srgb, …)` declarations without a
  preceding plain-color fallback in `Sidebar`/`BusyIndicator`/`CanvasCloseModal` CSS
  (danger-button tints, dot glows). `color-mix` is supported in evergreen WebView2/Edge
  ≥111, which Tauri's `downloadBootstrapper` install mode guarantees — confirmed
  acceptable in Iteration 6. These are pre-existing (not #222–#234) and render correctly
  on a real Windows box; not churning previously-audited working CSS. (The #231 diff
  viewer + #233 Kanban redesign CSS introduced **no** `color-mix`/`backdrop-filter`/
  vibrancy without a fallback.)
- **Verified clean**: #230 Commits source (backend git all via `hidden_command`; frontend
  renders only — no shell-out/URL), #232 time formatting, #233/#234 Kanban
  (`transform: translateY` hover-lift, reduced-motion-gated), #228 collapsed-rail click
  handlers, #225/#226 branch badges.

Verification: `npm run lint`, `npm run build`, `npm test` (357 tests, incl. the new
`fileBlockTarget` case) all green. No backend changes, so the Rust suite is unaffected.

#### Still needs manual Windows verification (Iteration 8)

- On a Windows box, build a Canvas template whose **relative** file block path is typed
  with backslashes (`src\foo\bar.md`), then use that template on **macOS** and confirm the
  panel opens the file and its title shows `bar.md` (the normalization makes it portable).

## 2026-06-29

### Drag OS files into the file tree (#253)

A new feature: dragging files/folders from the OS (Finder/Explorer) onto a FileTree
folder/root **moves** them into the repo. Built cross-platform from the start —

- **OS-native input path, not the DOM:** uses Tauri's `getCurrentWebview().
  onDragDropEvent` (works on WKWebView **and** WebView2), wired per-window from `App.tsx`
  and the detached `CanvasWindow`. The dragged `paths` are OS-native (backslashes on
  Windows) and pass straight through to Rust untouched — no `splitPath`/`joinPath`.
- **Position math is DPR-aware:** the event's `position` is in **physical** pixels; the
  hit-test divides by `window.devicePixelRatio` before `document.elementFromPoint`, so it
  is correct under macOS Retina **and** Windows fractional scaling.
- **The move is `std::fs` only (no shell-out):** same-volume `fs::rename`, else (a
  cross-device error — `EXDEV` on unix, `ERROR_NOT_SAME_DEVICE`/17 on Windows, matched by
  `raw_os_error`) a recursive copy **then** remove. So a cross-drive move works on both
  OSes and a failure never loses the source. The destination is repo-confined; the source
  is the user's dragged path (explicit consent).
- **Highlight is token-only CSS** (`.dropTarget` = accent outline + `--accent-dim`), no
  platform-divergent styling. The capability already lists `core:default` for windows
  `["main","canvas-*"]`, which covers the webview drag-drop events — no capability change.

#### Still needs manual Windows verification (#253)

- **WebView2 drop fires + delivers paths**: on a Windows build, drag one or more files
  from Explorer onto a folder row and the tree root, and confirm `onDragDropEvent` fires
  with the absolute `paths` and the files move in (toast confirms). CI can't drive a GUI
  drag.
- **Fractional-DPR hit-test**: on a Windows box at 125%/150% display scaling, confirm the
  highlighted/landed folder matches the cursor exactly (the `devicePixelRatio` conversion).
  Also re-confirm on a macOS Retina display.
- **Cross-volume move**: drag a file from a different drive/volume into the repo (Windows:
  another drive letter; macOS: another mounted volume) and confirm the copy-then-remove
  fallback moves it intact and removes the source. The same-volume rename + collision +
  validation paths are covered by the Rust unit tests.

## 2026-06-30

### Per-session PTY locks — terminal input lag fix (#260)

`SessionManager` previously held the **global** `Mutex<HashMap<String, Session>>` across the
**blocking** PTY work: `write_stdin` did `write_all`/`flush` under that lock, `resize_pty`
did `master.resize()`, and `scrollback` did the 256 KB ring copy. A busy agent that wasn't
draining its stdin would block `write_all`, and because the global lock was held, *every
other* session's keystrokes / resizes / scrollback snapshots queued behind it (cross-terminal
input stall). The `Session.writer` and `Session.master` are now `Arc<Mutex<…>>` (mirroring
`child`/`scrollback`); each method clones the per-session `Arc` under a brief global lock,
**drops the global guard**, then does the blocking op under the per-session lock — so a
backpressured/flooding session can no longer stall another's input.

- **Platform-neutral.** `portable-pty`'s `MasterPty`/writer are the same trait objects on
  macOS and Windows (ConPTY); wrapping them in `Arc<Mutex>` needs **no `#[cfg]`** and the
  lock-hold change is identical on both OSes. All 119 Rust tests stay green.

#### Still needs manual verification (both OSes, #260)

- **Keystroke-under-load**: run an agent that floods output (a long build) in one terminal,
  type rapidly in a second terminal, and confirm keystrokes appear without the multi-hundred-ms
  lag — and that resizing/mounting a terminal while another floods doesn't stall. CI can't
  exercise PTY backpressure.
- **Windows ConPTY backpressure**: re-confirm the same on a Windows box — ConPTY's stdin
  buffering/backpressure differs from a unix PTY, so the "full stdin buffer blocks `write_all`"
  path should be spot-checked there specifically.

### Shrink the output IPC payload + throttle terminal writes (#261)

Heavy terminal output (a long build/log) was stalling React inputs everywhere (the Kanban
textarea, a second terminal) because each ~8 KB PTY read was emitted as a serde JSON
**integer array** (`[27,91,49,...]`, ~4 chars/byte) the single WebView main thread had to
`JSON.parse` + `Uint8Array.from(number[])`. The fix is platform-neutral, with **no
`#[cfg]` branch**:

- **Backend** base64-encodes the chunk in the `lib.rs` event forwarder
  (`commands::encode_output`, the `base64` crate — already in the dep tree); the
  `session://output` payload field is now `b64: String` instead of `bytes: Vec<u8>`. Pure
  Rust, byte-identical on macOS and Windows (Rust unit test `output_base64_round_trips`).
- **Frontend** decodes with `decodeOutputB64` (`atob` + a tight byte loop — `atob` exists
  in both WKWebView and WebView2) and `terminalPool.ts` coalesces the frame's chunks into
  **one `term.write` per `requestAnimationFrame`** (both available in both WebViews). No
  OS-sensitive primitive anywhere.

#### Still needs manual Windows verification (#261)

- **Heavy-output render is byte-identical on WebView2**: on a Windows build, run a flooding
  command (e.g. a long `cargo build` / a large log `type`) in one terminal and confirm the
  TUI renders correctly (no dropped/reordered bytes, `claude`'s width-specific redraw
  intact) — the base64 round-trip + rAF coalescing must not garble output on WebView2 as it
  doesn't on WKWebView. CI can't drive a live terminal flood.
- **Responsiveness under flood**: with that flood running, confirm typing in a Kanban card
  textarea and in a second terminal stays responsive on Windows (the whole point of the
  task). Re-confirm on macOS.
- **Detached canvas window**: confirm a detached window still renders its owned PTYs
  correctly under heavy output (the encode happens once in the forwarder; `emit` still
  broadcasts to every window).

### Terminal last-row bottom clearance (#262)

The terminal's last row (claude's prompt / input line) could fall below the visible
panel at certain font-size / line-height combos, fixable only by clearing. The fix is
pure CSS + a WebView measurement — no OS branch:

- **Extra bottom padding** on `.terminal` (`20px` bottom vs `12px` top) so a one-row
  sub-pixel rounding error is absorbed visually. Token-only, identical on both OSes.
- **Conservative fit guard** in `terminalPool.ts` `applyResize`: after `fit.fit()`, if
  the painted height (`term.rows × cellHeight`) would overflow the padded content box,
  the PTY is told one fewer row. The cell height is read from xterm's render metrics
  (internal, guarded with try/catch + a `undefined` fallback so it never throws) — the
  same metric under WKWebView and WebView2.

#### Still needs manual Windows verification (#262)

- **Last-row clearance on WebView2 / ConPTY**: on a Windows build, run a full-screen
  TUI (claude) and spot-check that the bottom input line stays fully visible — at the
  default font size and at the **smallest and largest** Settings font sizes — while
  shrinking the panel/window to awkward heights and after switching views (reparent).
  ConPTY + WebView2 font metrics can round differently than WKWebView, so confirm the
  guard + padding hold there too. CI can't drive the GUI render.

### Eager worktree creation for scheduled sessions (#259)

A worktree schedule now creates its worktree folder **and** branch **eagerly at schedule
time** (`create_schedule`), instead of lazily at fire time — so the user can open/create
items inside the worktree before it fires. Fire (`prepare_worktree_for_schedule`) is now
**idempotent** (the `!dest.is_dir()` guard wraps both the existing-branch and create-branch
arms), and cancelling a pending worktree schedule frees the worktree **ref-counted** via the
existing async `remove_worktree`. Platform-neutral by construction —

- **All worktree writes go through the existing `git.rs` helpers** (`worktree_add`,
  `worktree_add_new_branch`, `worktree_remove`), which already shell out via
  `hidden_command()` (the `CREATE_NO_WINDOW` console-flash guard) and are cfg-correct; no
  new OS-specific code. The worktree path is built by the existing `worktree_path()` helper
  (app-data dir via `data_dir()`, never a raw `$HOME`) with the `windows_safe_seg`
  reserved-device-name/trailing-dot guard already applied (#74/#140).
- **Removal reuses the already-async `remove_worktree` command** (`async` + `spawn_blocking`,
  #200) driven from the frontend `cleanupWorktreeIfEmpty`, so a large worktree delete never
  freezes either webview — identical on macOS and Windows.
- **No new path/string handling on the frontend** — the cancel ref-count keys off the
  schedule's `worktree_path` string as-is (no `splitPath`/`joinPath`).

#### Still needs manual Windows verification (#259)

- **`git worktree add` at schedule time + `git worktree remove` on cancel** on a Windows
  build: schedule a worktree session (existing branch and a new branch), confirm the
  worktree folder + branch appear immediately under the parent repo, open a terminal inside
  it before it fires, let it fire (agent launches in the same folder), and cancel a separate
  pending worktree schedule to confirm the folder is removed (a dirty/in-use worktree is
  kept, never force-deleted). The git-shell-out + path logic is the same on both OSes (and
  the `prepare_worktree_for_schedule` idempotency + `worktree_add` guard are covered by Rust
  unit tests), but the end-to-end schedule→fire flow needs the GUI, which CI can't drive.

## 2026-06-30

### Export / import Canvas templates as JSON (#275)

The Template Manager gains per-row **Export** (write a template to a user-chosen `.json`)
and a footer **Import** (read + validate a `.json`, add with a fresh id). Platform-neutral
by construction — no OS branch:

- **Export** uses the Tauri dialog plugin's `save()` (the new `ipc.saveFileDialog`) to get a
  user-chosen absolute path, then writes via the existing `write_text_file` confined to that
  file's own directory (the #163/#253 pattern): the path is split with **`splitPath`** (which
  already handles `/` **or** `\`, #163) into `{ dir, base }`, so a Windows
  `C:\Users\me\layout.json` reassembles correctly. `dialog:default` already grants
  `allow-save` (verified in the dialog plugin's `default.toml`), so **no capability change**
  was needed.
- **Import** uses the existing `open()` picker (`ipc.pickFile`, now accepting an optional
  `extensions` filter `["json"]`) → `read_text_file` (same `splitPath` confinement) →
  pure `parseTemplateJson` validation → add with a fresh `crypto.randomUUID()` id. A
  malformed/foreign file is rejected with an error toast, leaving existing templates intact.
- The validation + serialization (`src/components/TemplateManager/templateIo.ts`) is pure
  string/JSON work with a unit test — identical on both OSes.

#### Still needs manual Windows verification (#275)

- **The native save dialog + write path on Windows**: in a Windows build, open Manage
  templates, Export a template (confirm the save dialog defaults to `<name>.json` and the
  written file is readable JSON at the chosen location), then Import it back (confirm the
  `.json` filter, that it appears in the list, and instantiates as a new tab). CI can't drive
  the GUI/native dialog; the path split (`splitPath`) + file IO are the same shared
  cross-platform seams the FileSwitcher Browse… (#163) already uses on Windows.

### Canvas "no longer pending" for scheduled agents — on fire + detached windows (#280)

Two fixes for a scheduled agent dragged into a Canvas panel:

1. **On fire**, the scheduled leaf is rewritten in place into the live agent
   (`rewriteScheduledLeaves`, pure + unit-tested, preserves the leaf id so the #18
   pooled terminal reparents) and the canvases are persisted via the existing
   `setCanvases` → `canvas://changed` path, so the panel shows the live terminal
   instead of "This schedule is no longer pending."
2. **Detached windows** now load schedules (`listSchedules` is no longer
   main-window-gated) and stay in sync via a new **`schedule://changed`** broadcast
   (Rust `broadcast_schedules`, emitted after every create/update/cancel/fire),
   mirroring `canvas://changed`. Detached windows also subscribe to
   `schedule://fired` to upsert the fired session locally so the rewritten agent leaf
   renders its terminal (not "Session closed.").

Platform-neutral by construction: this is pure frontend cross-window event/state logic
plus a Tauri event emit. **Tauri events are global on macOS and Windows alike**, and
there is no OS-specific path/shell/key code in any of the touched files
(`src/components/Canvas/canvasSchedule.ts`, `src/store.ts`, `src/ipc.ts`,
`src-tauri/src/commands.rs`).

#### Still needs manual Windows verification (#280)

- **Detached-window spawn can't be driven on CI** (the #84/#105 precedent). On a Windows
  build: (a) drag a scheduled agent into a Canvas panel and let it fire — confirm the panel
  becomes the live agent terminal, not "no longer pending"; (b) with the schedule still
  pending, pop the canvas out into a detached window — confirm it shows the **editable**
  pending panel (and that a time/prompt edit in the main window reflects there); (c) let it
  fire while detached — confirm the detached panel becomes the live agent terminal too; and
  (d) cancel a schedule — confirm its panel/leaf is removed and the gone state shows only
  when truly cancelled.

### Iteration 9 — full Windows-parity audit (pre-v1.0.2 release gate, #282)

A grep-driven, single-agent sweep of **all 13 landmine categories**
(`.claude/skills/windows-parity-audit/windows-landmines.md`) across `src/`,
`src-tauri/src/`, the CSS, and the build/bundle/CI config — the pre-release gate for the
v1.0.2 cut (#281). Each grep seed was run and **every hit confirmed by reading the cited
code** against the established seams. The core has been hardened over Iterations 1–8, so
the highest-yield target was the newest code (#252–#280); each was re-verified. Net: **one
confirmed defect fixed** (clipboard write), every other category **clean / already-seamed**.

#### Confirmed finding + fix

- **Bug (Medium — degraded UX, #282)**: `store.ts` `copyToClipboard` (every "Copy session
  ID / path / branch name", the FileViewer code-block **Copy** button, file-tree Copy-path)
  wrote the clipboard via **`navigator.clipboard.writeText`**. WebView2's async Clipboard
  API is **stricter than WKWebView about document focus** and rejects `writeText` with
  *"Document is not focused"* for a copy fired from a context menu / hover button (focus is
  on a non-document element) — so a copy that succeeds on macOS could toast **"Copy failed"**
  on Windows. This is the **write-side twin** of the #220 read defect: #220 already moved the
  clipboard **read** to the `tauri-plugin-clipboard-manager` (`clipboardReadText`, "reliable
  under WebView2, unlike `navigator.clipboard`") but left the **write** on the Web API.
  **Fix (through the established #220 clipboard-manager seam)**: added
  `ipc.clipboardWriteText` (the plugin's `writeText`, the write counterpart of
  `clipboardReadText`), and `copyToClipboard` now **routes the write through the plugin on
  Windows** (gated by `isWindows(get().platform)` — the native OS clipboard needs no document
  focus), keeping **`navigator.clipboard.writeText` on macOS byte-for-byte**. Granted
  `clipboard-manager:allow-write-text` in `capabilities/default.json` (additive; read-text /
  read-image were already granted).
  **Files**: `src/ipc.ts`, `src/store.ts`, `src-tauri/capabilities/default.json`
  **macOS**: Preserved — the `isWindows` gate's `else` branch is the unchanged
  `navigator.clipboard.writeText` call; macOS never enters the plugin path.

#### Swept clean / already-seamed (confirmed by reading, not re-flagged)

1. **POSIX paths & separators** — clean. Rust path building uses `Path/PathBuf::join`;
   `files.rs` content-search/list (#202/#167) normalizes repo-rel paths with
   `to_string_lossy().replace('\\', "/")` (lines 229/312); `move_into_repo` (#253) /
   `create_dir` (#267) build repo-rel POSIX results. Frontend `split("/")` /
   `` `${a}/${b}` `` joins (FileTree #252/#267, fileStatus, DiffInspector #231/#278,
   FilePicker, FileSwitcher) all operate on **backend `/`-separated repo-relative** paths;
   absolute paths route through `joinPath`/`splitPath` (`[\\/]`). No `/`-rooted assumptions.
2. **Home dir / `$HOME`** — clean. Every `~/.claude` read (`skills.rs`, `usage.rs` #154,
   `title.rs`) goes through `path_env::home_dir()` (`%USERPROFILE%` on Windows). No raw
   `env::var("HOME")` outside the unix-gated login-shell probe.
3. **Shelling out (console-flash)** — clean. All `git` + the `<cli> --version` probe route
   through `git::hidden_command` (`CREATE_NO_WINDOW`). Remaining `Command::new` sites are the
   `hidden_command` seam itself, `os_open`/`open_url`/`reveal_file_in_finder` (all
   `#[cfg]`-gated), the macOS-gated Keychain `security` (with a non-macOS `None` stub), the
   unix-gated login-shell probe, and `#[cfg(test)]` helpers.
4. **Process / CLI resolution** — clean. `pty::resolve_command`/`find_on_path`/`launch_target`
   (PATHEXT + `cmd.exe /C` for `.cmd`) and `default_shell` (PowerShell/`COMSPEC` on Windows)
   carry both arms with the unix arm unchanged; `agents.rs` resolves `binary_name` through them.
5. **URLs vs reveal** — clean. URLs → `open_url` (macOS `open` / Windows `cmd /C start "" <url>`
   / `xdg-open`, #217); folder open → `os_open` (`explorer.exe`); file reveal →
   `explorer.exe /select,"<path>"` via `explorer_select_arg` + `raw_arg` (#194). Frontend
   `openUrl`/`revealPath`/`revealFileInFinder` map 1:1.
6. **Keyboard ⌘ vs Ctrl** — clean. Every shortcut handler is `metaKey || ctrlKey`
   (`useKeyboardNav`, terminal link-open). The two non-paired hits are correct: the
   Windows-gated Ctrl+V paste intercept (`!event.metaKey`) and the DiffInspector arrow/`s`
   nav (#255/#278) that deliberately **rejects all modifiers** (plain unmodified keys).
7. **Platform copy** — clean. The two UI literals (`"⌘B"`, `"⌘S"`) route through
   `kbdHint(platform, mac, win)`; reveal labels through `revealLabel`. All other `⌘` are comments.
8. **`cfg`-gating gaps** — clean. Every `#[cfg(unix)]`/`#[cfg(target_os="macos")]` has its
   Windows counterpart (`is_cross_device` #253 has unix/windows/other; `usage.rs` Keychain has
   the `None` stub; `path_env` unix-only is the documented no-op-on-Windows PATH probe).
9. **Reserved names / FS rules** — clean. `windows_safe_seg` guards the worktree branch
   segment (`worktree_path`) and `validate_new_segment` guards new folder/file names (#267),
   both rejecting `CON`/`NUL`/… + trailing dots/spaces + separators.
10. **CSS / WebView** — clean. No `backdrop-filter`/vibrancy; `-webkit-` is paired with the
    standard prop (Slider ships `-webkit-`+`-moz-`+standard; Kanban ships `-webkit-user-select`
    +`user-select`); `-webkit-font-smoothing` is a harmless macOS no-op. `color-mix()` stays in
    the 5 previously-verified files (evergreen WebView2 ≥111); the new DiffInspector #278 /
    Kanban #277 CSS introduces none. Scrollbars are `::-webkit-scrollbar`-only (Iter 1).
11. **Build / bundle / CI** — clean. `tauri.conf.json` `targets:"all"` → NSIS+MSI alongside
    dmg/app; `icon.ico` **and** `icon.icns` listed. `release.yml` builds the 2-OS matrix
    (macOS universal + Windows MSVC). `cfg(unix)` tests are the POSIX-shell/EXDEV suites with
    cross-platform pure-logic tests running on both.
12. **Line endings** — clean. `.gitattributes` pins `* text=auto eol=lf` (+ binary assets), so
    `cargo fmt`/`prettier` pass on a Windows checkout.
13. **macOS-only integration** — clean. The `usage.rs` Keychain (`security`) is
    `#[cfg(target_os="macos")]` with a Windows/Linux `None` stub; `Info.plist` is a macOS-only
    bundle merge (no Windows effect); `temp_dir()` is cross-platform; `save_clipboard_image`
    (#220) uses the cross-platform clipboard plugin + `temp_dir()`. All fail-open.

**Newest-code re-verification (#252–#280)**: file-tree git status (#252, token-only colors +
`hidden_command` git), OS-file drop / `move_into_repo` (#253, DPR hit-test + std-fs move, no
shell), in-tree content search (#202, `\`→`/` normalized), Mermaid (#254, bundled `import()`,
no CDN/fetch/native), diff seen-marker (#278, pure digest, `/`-keyed persistence blob), diff
keyboard nav (#255, plain arrows), Kanban undo (#277, pure ops), export/import templates (#275,
`splitPath` + `write_text_file`), folder create/rename/delete (#267, `validate_new_segment`),
usage bar (#154, `home_dir()` + macOS-gated Keychain), and the Task-280 scheduled-canvas event
logic (pure cross-window events, global on both OSes) — **all confirmed cross-platform-correct.**

#### Still needs manual Windows verification (Iteration 9)

- **Clipboard copy on WebView2 (#282)**: on a Windows build, exercise **Copy session ID**,
  **Copy absolute path** / **Copy relative path** (sidebar + file tree), **Copy branch name**,
  and the FileViewer code-block **Copy** button — each must land the text on the OS clipboard
  with a "Copied …" toast and **no "Copy failed"**, including when triggered from a right-click
  context menu (the document-not-focused case). Re-confirm macOS still copies via
  `navigator.clipboard.writeText` (the gated `else` branch — unchanged).
- **(Carried, unchanged)** the xterm `windowsPty` backend/buildNumber (Iter 4/6/7), and the
  GUI/installer items from prior iterations (`claude.cmd` packaged spawn, NSIS+MSI install,
  `explorer.exe` open/reveal/url, themed scrollbars, the #253 drag-drop + DPR hit-test, the
  #275 export/import dialog, the #259/#280 worktree/detached-window flows) — none re-opened by
  this pass; they remain real-box spot-checks for a maintainer.

### Keyboard shortcut ⌘E / Ctrl+E to toggle big mode for the selected item (#284)

A single global shortcut toggles big mode (#157) for the currently selected item: closed →
maximize the selected item, open → close (same chord). Wired in the shared global handler
`src/useKeyboardNav.ts` (capture phase, mounted in both the main and detached canvas windows)
via the established `(e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.code === "KeyE"`
detection — so the **same key handling fires ⌘E on macOS and Ctrl+E on Windows with no extra
code** (the `metaKey || ctrlKey` convention), and `e.code` (physical key) keeps it
layout-robust like the existing digit shortcuts. The store action `toggleMaximizeSelected`
(+ the pure, unit-tested `contentForSelected`) and the Maximize2 button tooltips route the
displayed chord through `kbdHint(platform, "⌘E", "Ctrl+E")` (Overview.tsx ×3,
CanvasSurface.tsx) — never a hardcoded glyph. No native/path/shell code touched.

#### Still needs manual Windows verification (#284)

- **Keyboard real-box check (GUI path, can't be unit-tested).** On a Windows build: with an
  item selected in **Overview**, in **Canvas**, and in a **detached canvas window**, press
  **Ctrl+E** — confirm it opens that item in big mode, and a second **Ctrl+E** closes it; that
  it never reaches a focused `claude`/terminal PTY (capture-phase `stopPropagation`), doesn't
  collide with any browser/WebView2 default, and that the Maximize2 tooltips read **"Ctrl+E"**.
  Re-confirm macOS still toggles on **⌘E** with the **⌘E** tooltip.

### #294 — Three-dots session-options menu + Recurring sessions

Adds a **⋯ overflow button** next to the sidebar "Schedule session" button opening a dropdown
(reusing the shared `RowContextMenu`) whose first item is **"Recurring session…"**, plus a new
**recurring** mode in the New Session modal and a persistent `RecurringSession` backend model.
A recurring session owns a **rotating child agent**: each interval the poll loop (shared with
the #93 schedule poll, same 5s tick) kills the previous child and spawns a fresh seeded one
**in place** — the sidebar row / Overview card / Canvas panel key on the recurring id, so only
the hosted child terminal swaps. All of it is path-key / token / reused-git-seam based:

- **No new shell-outs** — worktree recurrings reuse the same `git worktree add [-b]` /
  `checkout_branch` / `create_branch` calls (already `hidden_command`-guarded) as worktree
  schedules; the deterministic `worktree_path` helper is shared. `path_env::home_dir()` is
  untouched (no raw `$HOME`), and the child spawn goes through the existing
  `spawn_session_with_prompt` → `AgentSpec` path (PATHEXT / `cmd.exe /C` resolution intact).
- **Frontend parity** — the ⋯ button + dropdown + `RecurringPanel` / `RecurringCard` /
  `RecurringRow` use only design tokens + existing CSS patterns (`::-webkit-scrollbar`-safe,
  no macOS-only effects); the "next run in …" label + interval helpers (`intervalToSeconds` /
  `secondsToInterval` / `formatInterval` / `formatNextRun`) are pure + unit-tested; the modal's
  ⌘⏎ "Worktree" keybind routes through `kbdHint` and `metaKey || ctrlKey` like #204.
- **Cross-platform-neutral rotation** — the fresh-child spawn reuses the #261 replay-dedupe
  path (which already fixed the ConPTY stray-`C`), so a rotated child repaints cleanly on both
  OSes. Tauri `recurring://*` events are global, identical on macOS and Windows.

#### Still needs manual Windows verification (#294)

- **Child rotation on ConPTY (GUI/PTY path, can't be unit-tested).** On a Windows build: create
  a recurring session (e.g. every 1 minute, prompt "say hi", first run now) → confirm a child
  agent spawns within ~5s and its terminal shows in the Overview card / a Canvas panel; wait one
  interval and confirm the child is **replaced in the same card/panel** (no new sidebar row /
  column / panel appears) and the relaunched `claude.cmd` TUI **repaints cleanly** (no stray
  `C`, no doubled paint) under ConPTY. Confirm cancelling kills the child and removes the
  surfaces, and that a worktree recurring's folder is cleaned up (ref-counted). Re-confirm the
  same on macOS.

### #297 — Per-agent opt-out for auto-continue-after-limit

Refines #296 with a persisted per-session `auto_continue_disabled` flag: when the global
"Auto continue after limit reset" option is on, each **Claude** agent's Overview card and
Canvas panel show a compact **"Auto continue after limit reset"** checkbox (checked =
participating). Unchecking sets the flag so that one agent is excluded from the #296 fire
step, without touching the global setting or any other agent. Entirely platform-neutral:

- **Backend** — a `#[serde(default)] auto_continue_disabled: bool` on `PersistedSession`
  (mirrors `has_been_active`/`forkable`; old `sessions.json` upgrades cleanly) + a
  `set_session_auto_continue` store method/command. Pure data layer, no shell-out, no `cfg`.
- **Frontend** — the reused `AutoContinueToggle` (the shared #52 `Checkbox`) is gated to
  Claude + global-on, uses only design tokens (`--fs-meta-xs`, `::-webkit-scrollbar`-safe,
  no macOS-only effects), and `stopPropagation`s so it never starts the #144 Canvas header
  drag. The fire-step exclusion is a `!s.autoContinueDisabled` filter on `liveClaudeIds` in
  `applyAutoContinue` — the same code path on both OSes, unit-tested in
  `store.autoContinue.test.ts`.

#### Still needs manual Windows verification (#297)

- **Checkbox render/toggle/persist (GUI path, can't be unit-tested).** On a Windows build:
  with Claude default + global auto-continue ON, confirm each Claude agent card/panel shows
  the checkbox (checked); switch the global option OFF and confirm it disappears; spawn a
  codex/opencode agent and confirm it never shows the checkbox. Uncheck one agent, restart the
  app, and confirm it stays unchecked and both surfaces (Overview + Canvas) agree. Confirm a
  click on the Canvas panel's checkbox toggles it **without** starting a panel drag. (A real
  usage-limit reset is hard to trigger offline — the exclusion is asserted by the unit test.)
  Re-confirm the same on macOS.

### #295 — Clone Repo (clone a git repo + start a session on main)

Adds a **"Clone Repo…"** entry to the ⋯ session-options menu (#294) + the sidebar background
context menu, opening a `CloneRepoModal` (git URL + native folder-picker destination). Clone →
ensure `main` → register the folder → start a session, all through existing cross-platform seams:

- **Git shell-outs via `hidden_command`** — `git::clone_repo` (the new `git clone <url> <dest>`
  network write) and `git::ensure_main` (reusing `checkout_branch` / `create_branch`) both build
  their `Command` through the shared `CREATE_NO_WINDOW` console-flash guard, so no `conhost`
  window flashes on Windows. The clone copies `fetch_remotes`' two fail-fast env vars
  (`GIT_TERMINAL_PROMPT=0` + `GIT_SSH_COMMAND=ssh -oBatchMode=yes`) so an authed/private remote
  fails fast instead of hanging the GUI process on a credential prompt.
- **Path building is backend-only + `PathBuf::join`** — `commands::clone_repo` derives the folder
  name with the pure `git::repo_dir_name` (unit-tested) and builds `dest = PathBuf::from(parent)
  .join(dir)` (never string concat), then returns the absolute path as a `String`; the frontend
  never joins/derives paths (it passes whole paths across IPC), so there are no `/`-vs-`\`
  assumptions. No raw `$HOME`.
- **Frontend parity** — the modal uses only design tokens + existing modal patterns
  (`::-webkit-scrollbar`-safe, `color-mix` with a solid fallback border, no macOS-only effects),
  the native folder dialog via the already-granted `dialog:default` capability, Escape /
  outside-click close, and a focus trap. No new keyboard shortcuts.

#### Still needs manual Windows verification (#295)

- **Clone + folder-picker + session spawn (GUI/PTY path, can't be unit-tested).** On a Windows
  build: ⋯ menu → "Clone Repo…" → paste a public repo URL, **Choose…** a destination folder,
  click **Clone** → confirm "Cloning…" then the modal closes, the repo appears as a sidebar group
  on **`main`** (label + file-status colors populated), and a `claude.cmd` session starts in the
  cloned folder and **repaints cleanly** under ConPTY. Confirm a bad URL and a private/authed URL
  each **fail fast** (no hang) with git's stderr shown **inline** in the modal (no session/recent
  added), and that cloning where the derived folder already exists non-empty shows the
  "Destination already exists" inline error. Verify the dest path is spelled with **backslashes**
  natively (built by `PathBuf::join`). Re-confirm the whole flow on macOS.

### #323 — Remove the post-drag focus border on Kanban cards

Suppresses the persistent accent border a just-dropped Kanban card wore (dnd-kit's
`RestoreFocus` re-focuses the dragged `<article>`, which `.card:focus-within` + the app-wide
`:focus-visible` outline then painted). Pure CSS: a single `.card:focus { border-color:
var(--border-hairline); outline: none; }` rule added **after** `.card:focus-within` in
`KanbanPanel.module.css` — standard selectors/properties (`:focus`, `outline: none`, a
`border-color` revert) with **no** OS-specific assumption, so it renders identically on WKWebView
(macOS) and WebView2/Chromium (Windows). The edit-mode accent border (driven by `:focus-within`
when the descendant `<textarea>` holds focus) and the inner control `:focus-visible` rings are
untouched.

#### Still needs manual Windows verification (#323)

- **Post-drag focus paint (GUI-observable, can't be unit-tested).** On a Windows build (WebView2):
  open a Kanban board, **drag a card and release** → confirm the dropped card shows **no** accent
  border and **no** focus outline/ring (identical to a resting card). Then confirm the preserved
  cues still fire: **hover** a card still lifts (raised border + shadow + grab cursor); clicking
  the **pencil** to edit still lights the card's accent border via the edit `<textarea>`; and
  **Tab** to the inner pencil/trash/checkbox still shows their own `:focus-visible` ring.
  Re-confirm the same on macOS (WKWebView).

### #336 — Per-agent "watch" notifications (native popup on finish / needs input)

Adds an opt-in per-agent "watch" flag (persisted on the session record) that pops a **native
OS notification** the moment a watched agent reaches its busy→idle edge (finished a turn /
awaiting input), plus a global "Watch all agents" setting (default off). Delivery goes through
the **cross-platform** Tauri notification plugin (`tauri-plugin-notification` + the JS
`@tauri-apps/plugin-notification`), added alongside the other v2 plugins with a
`notification:default` capability — **native on both macOS and Windows**, so there is **no**
`#[cfg]` in ReCue code for this feature. The trigger is the existing `store.setBusy` busy→idle
transition (the same edge that flips the three-state `BusyIndicator` to yellow), guarded with
`IS_MAIN_WINDOW` + the `booting` flag so a detached canvas window (session events are
window-global, #84) and the boot-resume replay never double-fire. Permission is ensured lazily
(`ensureNotificationPermission`) at opt-in time and again before each send; a denied grant just
silently no-ops (no in-app fallback). Everything else — the flag command/IPC, the store
`toggleWatch`/`setWatch` actions, the sidebar context-menu item, the reusable `WatchButton`
header button, and the Settings checkbox — is frontend/pure-Rust and platform-neutral (design
tokens + on-system icons only; `metaKey || ctrlKey` unaffected — no new shortcuts).

#### Still needs manual Windows verification (#336)

- **Native notification delivery (GUI/OS path, can't be unit-tested).** On a Windows build:
  turn on **Watch** for an agent (sidebar right-click menu **or** the Overview card / Canvas
  panel Eye button), grant the permission prompt when asked, then let that agent finish a turn
  → confirm a **Windows toast** appears with the agent's label as the title and "Finished or
  awaiting your input" as the body, and that an **unwatched** agent produces no toast. Confirm
  turning on **Settings → Sessions → "Watch all agents"** makes every agent notify. Important
  Windows caveat to check: **a dev build may not surface toasts until the app is installed and
  Start-Menu / AppUserModelID-registered** — so verify against an **installed** (NSIS/MSI)
  build, not just `tauri dev`. With a detached canvas window open, confirm a watched agent
  fires **exactly one** notification (not one per window). Re-confirm the whole flow on macOS
  (Notification Center), where an unsigned/ad-hoc build may need the notification permission
  allowed for "ReCue" in System Settings.

## 2026-07-14

### Ctrl+V pasted twice on Windows (#220 follow-up fix)

User-reported: pressing **Ctrl+V** in a ReCue terminal on Windows pasted the clipboard
contents **twice**. Root cause: the #220 handler's `return false` from
`attachCustomKeyEventHandler` only stops xterm's *keydown→data* path (the stray `^V`) —
in xterm 6, `_keyDown` **early-returns on a custom-handler `false` without ever calling
`preventDefault()`**, so the browser still performed its default Ctrl+V action, firing a
native `paste` event on xterm's hidden textarea, which xterm's own paste listener fed to
the PTY a second time. Paste #1 was the manual `term.paste(clipboard)`; paste #2 was the
native path #220 believed was suppressed. macOS never doubled (the handler is
`isWindows`-gated, and ⌘V only ever takes the single native path); Linux likewise
untouched.

Fix: `event.preventDefault()` on the intercepted Ctrl+V / Ctrl+Shift+V keydown before
returning `false`, cancelling the browser's default paste so exactly one paste (the
manual one, which also covers the #220 image fallback) survives. The handler is
extracted to the pure `Terminal/pasteHandler.ts` (`makePasteKeyHandler`, injected
platform/clipboard/paste deps) with unit tests covering the single-paste + preventDefault
regression, the Ctrl+Shift+V chord, the image fallback, clipboard failure, the
non-Windows no-op, and non-paste chords (Ctrl+C stays SIGINT). Logic is otherwise
byte-for-byte #220's; macOS/Linux behavior is provably unchanged (the non-Windows branch
returns `true` before touching the event).

#### Still needs manual Windows verification (#220 follow-up)

- On a Windows build: copy multi-line text, focus an agent terminal, press **Ctrl+V** →
  the text must arrive **exactly once** (this box previously reproduced the double),
  multi-line intact, no stray `^V`; repeat with **Ctrl+Shift+V** and in a shell terminal.
- Image fallback intact: with an image (no text) on the clipboard, Ctrl+V still pastes
  the temp-PNG path exactly once.
- Re-confirm macOS ⌘V pastes once and Ctrl+V still emits `^V` (gated off), and Linux
  Ctrl+Shift+V native paste is unaffected.

## 2026-07-14

### White startup flash (#348)

Platform-neutral fix (no `#[cfg]` arms) — windows are created **hidden**
(`visible: false`) with a **themed native background** (`tauri.conf.json` /
`WebviewWindowBuilder::background_color`, from `commands::background_for_theme`; `lib.rs`
`setup` re-colors the main window from the persisted theme before it is ever shown),
`index.html` gained an **inline pre-paint `<style>`** + a synchronous **`recue.theme`
localStorage mirror** read (every stylesheet is JS-imported, so the document had *zero*
styles — a white canvas — until the ~1.35 MB bundle parsed), and the frontend reveals the
window from `useRevealWindow` → the Rust `reveal_window` command once React has committed
its first frame, with `schedule_reveal_fallback` (2 s) as a safety net. The paint race is
a GUI behavior and cannot be unit-tested, so it needs a real-box check per OS.

Windows-specific notes: WebView2 honors the window-layer `backgroundColor` (unlike macOS,
where `set_background_color` is a webview-layer no-op — harmless there, since the
document's inline `html` background paints over it before the window is revealed), and the
config's alpha channel is ignored for the window layer, which is fine (we ship opaque
`#1e1e2e` / `#eff1f5`). Watch for WebView2 suspending `requestAnimationFrame` while the
window is unmapped — the reveal therefore fires from **both** an rAF and a 0 ms timer.

### Needs real-box verification (startup flash, #348)

- [ ] **Dark (default) launch** (`npm run tauri dev` **and** an installed NSIS/MSI build):
      no white rectangle at any point — the window first appears already dark.
- [ ] **Light theme** (Settings → Appearance → Light → Save, quit, relaunch): the window
      appears **light** — no white flash and no dark→light flip.
- [ ] **Detached canvas window**: pop a Canvas tab out (button **and** drag tear-off) in
      both themes — no white flash; closing it re-docks as before.
- [ ] **Reveal timing**: the window appears promptly (frontend reveal), not after a ~2 s
      pause (which would mean only the Rust fallback fired).
- [ ] **Reveal fallback**: with the Vite dev server stopped (or a broken bundle), the
      window still appears within ~2 s instead of never showing.
- [ ] **Runtime theme switch**: switch Dark↔Light, Save, then resize the window quickly —
      any exposed native gutter is the **new** theme color.

### Bounded-parallel boot resume (#355)

Boot resume now reconnects persisted sessions **4 at a time** (`src-tauri/src/boot.rs`,
`RESUME_CONCURRENCY`) over **one** shared snapshot of `~/.claude/projects`
(`title::ProjectLogIndex`, read through the cross-platform `home_dir()` — `%USERPROFILE%` on
Windows). Pure `std::thread` + `std::fs`, no OS-specific code; concurrent spawns are safe on
Windows because `portable-pty` passes `bInheritHandles = FALSE` to `CreateProcessW` (the
ConPTY is handed over via `PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE`), and `SessionManager` holds
its map lock only for the O(1) insert (#260). A unix-gated concurrent-spawn test
(`pty::tests::concurrent_spawns_register_every_session`) is the standing regression guard.
The loop runs on its own `std::thread` (not the async runtime), so it is independent of the
#353 `spawn_blocking` command path, and each resumed PTY still goes through
`pty::spawn_with_id` — so the `PATHEXT` / `cmd.exe /C` agent resolution (#140) is unchanged.

#### Still needs manual Windows verification (#355)

- [ ] With ≥8 persisted agents, relaunch: 4 **concurrent ConPTY creations** are the
      Windows-specific thing to eyeball — every terminal must reconnect with its own scrollback
      exactly once (no cross-wired/garbled output, no stray glyph, no wall of exit toasts).
- [ ] The bounded-parallel resume does not delay the #348 window reveal (the window still
      appears promptly, not after the 2 s Rust fallback).

### `[profile.release]` tuned — the Windows leg too (Task #358)

`src-tauri/Cargo.toml` gained a real `[profile.release]` (`lto = true`, `codegen-units = 1`,
`opt-level = "s"`, `strip = true`) to shrink the shipped binary; the substance and the
benchmark live in `TRAJECTORY_TO_LINUX.md` (the AppImage pays for binary size at every cold
start), but the profile is a **single Cargo setting applied to all three targets** — no
`#[cfg]`, no platform code. For Windows specifically:

- `strip = true` is near-free and safe on MSVC — debug info lives in a PDB that the release
  profile never emits, so there is nothing extra to strip and nothing to lose.
- `lto` / `codegen-units` / `opt-level` are platform-neutral codegen settings; LTO on
  `crate-type = ["staticlib", "cdylib", "rlib"]` is the stock Tauri template configuration.
- `panic` deliberately stays `"unwind"` (**do not** set `panic = "abort"`): a panic in a
  reader / monitor / title / forwarder / poll thread must kill only that thread, not every
  live PTY session. The manifest comment says so.
- Build cost lands only on `release.yml` (a version-bump push). The PR gate builds with the
  dev/test profiles and is unaffected.

**Needs real-box verification (Windows, #358)**: the MSVC leg only builds in `release.yml`, so
its first exercise of the new profile is the next release run — confirm it links under LTO and
that the resulting **NSIS/MSI installer installs and runs**, then note the binary/installer
size delta.

### Fast, reliable session exit — the `Exited` event now comes from the child (#354)

Two backend bugs made agents exit slowly and leave orphans on **unix** (macOS + Linux): the
`Exited` event was derived from the PTY reader hitting **EOF** (which on unix only happens once
*every* holder of the slave fd is gone — and claude's MCP servers / tool children inherit it), and
the kill signalled only the **direct pid**, blocking ~200 ms inside the Tauri command. The fix is a
per-session **exit-waiter thread** that owns the `Child`, blocks in `wait()`, and is the **sole**
emitter of `Exited`, plus a unix **process-group** kill (`killpg` SIGHUP → bounded grace →
SIGKILL, off-thread).

**Windows is deliberately untouched.** No job object / `TerminateJobObject`, and **no `libc` is
compiled on Windows** (the new dep is `[target.'cfg(unix)'.dependencies]`-only). The Windows kill
path is still `ChildKiller::kill()` → `TerminateProcess` — verified byte-for-byte equivalent:
portable-pty's `WinChild::kill()` and the `clone_killer()`-derived `WinChildKiller::kill()` both
call `TerminateProcess(handle, 1)`, so swapping the owned `Child` for a cloned killer changes
nothing (including the exit code 1, which can never be misread as a clean code-0 exit). The
`hangup_group` / `kill_group` helpers have explicit **no-op Windows arms**, so every call site
stays `#[cfg]`-free.

What Windows **does** inherit is the platform-neutral half: `Exited` now fires when the child is
reaped rather than when the ConPTY reader EOFs, `kill_session` no longer blocks its command, and
`kill_all` flags each generation `silent` before signalling — so a shutdown emits **no** `Exited`
and the persisted records still survive to auto-resume on the next launch (#30/#63).

Not compilable on this Linux box (no `rustup` / MSVC target), so the Windows arms are guarded by
inspection + attributes rather than a cross-compile: `pid` / `KILL_GRACE_MS` / `SHUTDOWN_GRACE_MS`
carry `#[cfg_attr(windows, allow(dead_code))]` so a Windows `clippy --all-targets -- -D warnings`
stays clean, and all three new tests are `#[cfg(unix)]`.

#### Still needs manual Windows verification (#354)

- Remove an agent that has MCP servers / a tool child running → the card vanishes at once, and
  Task Manager shows no orphaned `claude.cmd` / `node` children of it.
- Let an agent exit on its own (`/exit`) → the "Agent exited" toast + auto-forget (#63) fires
  promptly, not after seconds.
- Quit the app with 3+ live agents, then relaunch → no orphan processes, and **every** session
  comes back (the shutdown-silence rule — this is the key record-loss regression check).
- `kill -9`-equivalent (End task) an agent's process → the "Process exited (code N)" overlay +
  Restart appears promptly, and Restart works (the same-id respawn silences the stale generation).
- `cargo clippy --all-targets -- -D warnings` and `cargo test` are clean on a Windows checkout.
## 2026-07-14 — Login-shell PATH probe off the startup critical path (#360)

Windows has **no** login-shell PATH problem — a GUI app inherits the user/system PATH from the
registry (#140) — so `path_env`'s probe has always been a no-op there, and #360 keeps it that way.
The change is deliberately **byte-for-byte inert on Windows**:

- `path_env::start_probe()` has an empty (non-unix) body: the probe never arms, so the `PathState`
  cell stays `Inherit` forever.
- `effective_path()` therefore returns `std::env::var_os("PATH")` — this process's own PATH — so
  `pty::find_on_path` (the Windows arm, incl. `PATHEXT` resolution of `claude.cmd`) and
  `spawn_with_id`'s child env resolve **exactly** as before, with **no** wait: `wait_path` returns
  immediately on `Inherit`, it never blocks.
- `apply_path()` adds **no** `env` call at all while the state is `Inherit`, so every
  `git::hidden_command` `Command` (each `git` shell-out, each `<cli> --version` probe) is
  byte-for-byte today's — the `CREATE_NO_WINDOW` console-flash guard is untouched (the `#[cfg(windows)]`
  arm was only restructured so `let mut cmd` is declared once for both arms).
- `seed_from_cache()` / `await_probe()` are no-ops (`None`), so nothing is ever written to the new
  backend-internal `path_cache` scalar on Windows.
- The pure helpers (`rc_candidates` / `fingerprint_from` / `cache_applies` / `probe_publication` /
  `merge_paths` / `common_dirs` / `extract_marked`) are gated `#[cfg(any(unix, test))]` +
  `#[cfg_attr(test, allow(dead_code))]` — the `explorer_select_arg` precedent — so a **Windows host
  still type-checks and unit-tests them** even though only unix runs the probe. The `PathState`
  machine itself is cfg-free (its impl carries `#[cfg_attr(not(unix), allow(dead_code))]` for the
  probe-only methods) and is unit-tested on every host.

### Needs manual Windows verification (#360)

- [ ] **Nothing should change at all.** On a Windows build: the window appears as before; agents
      spawn (`claude.cmd` still resolves via `PATHEXT` → `cmd.exe /C`), shell terminals open,
      git panels populate, and `claude --version` (the `ClaudeMissing` / Settings → Data & About
      probe) still reports a version — with **no** console-window flash.
- [ ] **`sessions.json` gains no `path_cache` key** after a Windows run (the probe never arms).

## 2026-07-14

### Settings → Appearance: display-size slider / UI scaling (#366)

Pure TS/WebView: a **Display size** `Slider` (80–150%, default 100) persists `displaySize` in the
opaque settings blob (no Rust change), and `applySettingsEffects` applies it as CSS `zoom` on
`<html>` (`displayZoom()` — cleared at exactly 100 so a default install is byte-for-byte
unchanged). No `#[cfg]` arms; `zoom` is supported by WebView2/Chromium on Windows.

### Needs real-box verification (display size, #366)

- [ ] **The whole UI scales at a non-100% size.** Settings → Appearance → Display size → 125% →
      Save: the entire interface (sidebar, Overview cards, panels, text) renders ~25% larger with
      no clipping / scrollbar glitches under **WebView2**; back to 100% removes the property and it
      renders exactly as today.
- [ ] **Terminal crispness at a fractional zoom.** At 125% the pooled xterm text stays legible and
      the terminal still fits its container (cols/rows unchanged — the FitAddon ratio cancels).
- [ ] **OS-file-drop hit-testing at a non-100% size** (`src/osFileDrop.ts` `targetAt`): dragging a
      file from Explorer onto a FileTree folder still hits the correct row while zoomed (the
      physical→CSS px math combines `devicePixelRatio` with the new `zoom`). Left unchanged pending
      this check.

## 2026-07-15

### UI v2 reskin sweep (#372–#383)

The twelve-card "UI v2" epic is a pure WebView CSS/TS reskin — no new native code, no new
`#[cfg]` arms, no shell-outs. Everything platform-sensitive rides the established seams:
JetBrains Mono is now the `--ui` face on every OS (#372 — Segoe UI no longer renders the
chrome), every shortcut hint routes through `kbdHint` (⌘→**Ctrl** on Windows; incl. the
new ⌘D dense toggle, ⌘K/⌘F modals, the Shortcuts pane, and the tips.json chords via
`renderTip`), all keyboard handling stays `metaKey || ctrlKey`, `color-mix()` fills carry
plain token fallbacks (WebView2/Chromium supports color-mix, so the fallbacks are
belt-and-braces), scrollbars stay on the global `::-webkit-scrollbar` styling, and there
is no backdrop-filter/vibrancy anywhere. The wave background (#377) is a vendored canvas
engine behind the stage (one per window, lazy chunk); the terminal cursor blink is now
gated off under reduced motion in the pool (#383, an xterm options mutation — no host
dispose). Nothing here can be exercised by unit tests beyond the token/pure-helper guards
already in CI.

### Needs real-box verification (UI v2, #372–#383)

- [ ] **Wave-canvas performance on the wall (WebView2).** Boot into an Overview wall of
      ~6 agents with Background animation ON: the wave animates smoothly behind the cards
      with no visible input latency in a focused terminal; toggling it OFF in Settings →
      Appearance unmounts the canvas.
- [ ] **Wave worker-mode smoke (task 384, WebView2/Chromium).** WebView2 supports
      OffscreenCanvas, so the wave should render in **worker mode** off the main thread
      (`localStorage["recue.waveStats"]="1"` → `[wave] mode=worker …` / `window.__waveStats`);
      `localStorage["recue.waveMode"]="main"` must downgrade to the main-thread loop with
      no visual change. Confirm the new **"Pause when covered by panels"** setting (default
      on) pauses the wave when panels cover the stage and resumes when it clears, that a
      recolor/theme flip still recolors both modes, and that a busy agent halves the fps.
- [ ] **Dense-mode divider drag at gap 0.** ⌘D → Ctrl+D: Overview cards + Canvas splits
      tile edge-to-edge; every Canvas divider (both orientations) still drags via the
      invisible ±4px hit area; the confirm toast fires.
- [ ] **JetBrains Mono UI legibility at 125%/150% fractional scaling.** The mono UI face
      (11–12px chrome type) stays crisp/legible under Windows fractional DPI — sidebar
      rows, menu items, Settings nav, kbd chips.
- [ ] **Kbd hints read `Ctrl+…` everywhere.** New session / Schedule buttons, the ⌘K/⌘F
      modal hints, Canvas "New tab", big-mode tooltips, the Settings → Shortcuts pane,
      and the empty-state tips all show `Ctrl+…` (no ⌘ glyph reaches Windows).
- [ ] **Scrollbar styling on the new v2 surfaces.** The wall, Canvas panes, menu/modal
      bodies, kanban columns, and the Settings content pane all show the themed
      `::-webkit-scrollbar` bars (never a native gray bar).
- [ ] **Reduced motion on Windows** (OS setting *and* the app toggle): the wave settles
      then freezes, dot pulse/menu/modal/toast entrances drop, and the terminal cursor
      stops blinking (#383) while the terminal itself keeps rendering.

## 2026-07-15 — Dev-container agent sessions (docker-wrapped claude)

Opt-in per-session docker containers (the New Session modal's "Run in dev container"
toggle) landed cross-platform by design: the docker CLI is the PTY child (ConPTY drives
it like any console app), every one-shot docker call (`version`/`image inspect`/`build`/
`ps`/`kill`) goes through `git::hidden_command` (CREATE_NO_WINDOW — no console flash),
mounts use `--mount type=bind,…` (CSV keys, so a `C:\…` drive-colon source parses; `-v`'s
`:`-split would break), and the worktree `.git` overlay never relies on host paths being
valid inside the (Linux) container. Windows-specific notes + real-box checks:

- **The docker-label kill is the ONLY effective kill on Windows.** `hangup_group` is a
  no-op there and `ChildKiller::kill` terminates just the docker *client*; the container
  is killed via `docker kill` on the `recue.session=<id>` label (Remove/quit sweep/boot
  reap). Verify on a real box: Remove a container session → `docker ps -a --filter
  label=recue.session` is empty; quit ReCue → containers gone ≤ ~2.5 s.
- **Real-box checks:** Docker Desktop (WSL2) bind-mount of `C:\Users\…` sources incl. the
  app-data `worktrees`/`container-homes` dirs; ConPTY resize → docker CLI → in-container
  TTY reflow of claude's TUI; `docker.exe` resolution via `find_on_path` (a plain .exe —
  no PATHEXT/cmd shim needed); the daemon-stopped probe (`docker version --format`)
  returning promptly (the toggle's "stopped" state) rather than hanging on the named pipe;
  credentials seeding from `%USERPROFILE%\.claude\.credentials.json` (no Keychain on
  Windows — the file is canonical, #140).
- **No 0600 on Windows:** the per-session credentials seed relies on the app-data dir's
  ACL (unix gets `OpenOptionsExt::mode(0o600)`).
### Needs real-box verification (Open in editor)

- [ ] **`code` on PATH launches without a console flash.** With VS Code's installer
      "Add to PATH" set, ⌘O→Ctrl+O / a menu "Open in editor" resolves `code` (PATHEXT →
      `code.cmd`) and launches through `cmd /C` under `CREATE_NO_WINDOW` — VS Code opens
      the folder, no transient conhost window.
- [ ] **`%LOCALAPPDATA%` / `%ProgramFiles%` probes hit.** With nothing on PATH, the
      picker still detects a user-install VS Code (`%LOCALAPPDATA%\Programs\Microsoft VS
      Code\Code.exe`), Cursor, and Notepad++ (`%ProgramFiles%\Notepad++`), and launching
      opens the right app (via "Program Files").
- [ ] **Notepad++ opens the folder as a workspace.** The `-openFoldersAsWorkspace` flag
      lands the folder in the Folder-as-Workspace panel instead of trying to open its
      files.
- [ ] **JetBrains Toolbox `.cmd` scripts.** With a Toolbox-installed IDE and scripts
      enabled, detection reports "Toolbox" (`%LOCALAPPDATA%\JetBrains\Toolbox\scripts\
      idea.cmd`) and launch opens the IDE at the folder (again no console flash).
- [ ] **Standalone JetBrains versioned dir.** A non-Toolbox install under
      `%ProgramFiles%\JetBrains\IntelliJ IDEA <ver>\bin\idea64.exe` detects and launches;
      with two versions installed the newest dir wins.
- [ ] **Custom command with a quoted path.** `"C:\Program Files\X\x.exe" {path}` in
      Settings → Editor tokenizes (quoted program survives) and receives the folder.

## 2026-07-16 — Full app-window shell (multi-window 9/16, task 434)

`open_app_window(init)` creates additional FULL app windows (label `app-<uuid>`, route
`index.html?win=<uuid>[&repo=..][&canvas=..]`). The new Rust is pure string/window
plumbing (no paths, shells, or `#[cfg]`); the #348 hidden-until-painted background +
reveal fallback are the existing platform-neutral machinery. `encode_query_value` exists
precisely so Windows paths survive the URL: every byte outside `[A-Za-z0-9-_.~]` is
`%XX`-encoded (space → `%20`, never `+`), and the frontend's `URLSearchParams` decode
(`parseWindowIdentity`) restores `C:\Users\a b` byte-exact — unit-tested on both sides.

### Needs real-box verification (app windows, task 434)

- [ ] **`?repo=` encoding round-trip with a real Windows path.** Open an app window
      via `openAppWindow({ repo: "C:\\Users\\<user>\\repos\\x y" })` (temporary dev
      wiring — no UI entry point until card 10/16): the new window boots with its
      Overview filtered to that repo (drive colon, backslashes, and spaces intact).
- [ ] **Second full window under ConPTY.** The same agent terminal renders live in
      both windows (letterboxed to the smallest attached view); closing the second
      window leaves the PTY running and rendered in the first.

## 2026-07-16 — New Window entry points (multi-window 10/16, task 436)

The single-instance plugin makes a second `ReCue` launch poke the running instance —
a **named mutex + hidden message window** on Windows — to open a new full app window
(task 434) and exit, closing the old two-processes-fight-over-`sessions.json`
corruption. The `new-window` keybind is the platform-resolved `mod+alt+n`
(**Ctrl+Alt+N** on Windows); Windows creates no app menu, so the keybind is the only
chord entry point there (the File → New Window item is macOS-only).

### Needs real-box verification (new-window entry points, task 436)

- [ ] **Second launch pokes the first instance (installer).** With ReCue running
      (NSIS/MSI install), launching it again from the Start menu exits the second
      process and opens exactly one new `app-*` window in the first instance.
- [ ] **Second launch pokes the first instance (portable exe).** The same behavior
      from a directly-run `recue.exe` — the named mutex is keyed by the bundle
      identity, not the binary's path.
- [ ] **Named mutex across two Windows sessions.** With two users logged in (fast
      user switching / RDP), each session runs its own instance — user B's launch
      must not poke user A's instance.
- [ ] **Ctrl+Alt+N vs AltGr layouts.** On an AltGr layout where Ctrl+Alt+N types a
      glyph (e.g. Polish ń), confirm the documented accepted caveat: the chord opens
      a window (swallowing the glyph), and rebinding/unbinding it in Settings →
      Shortcuts restores glyph typing.

## 2026-07-16 — Canvas pop-out opens a full ReCue window; #84 ownership layer deleted (multi-window 11/16, task 437)

The Canvas tab pop-out button and the drag tear-off now call `open_app_window({ canvas: id })`
(task 434) — a full ReCue window (sidebar + views) booted into Canvas on that tab — and the
whole #84 detached-canvas / single-owner era is deleted (ownership map, `DetachedNote`, the
`CanvasWindow` route, the `canvas://windows` event, the four canvas-window Rust commands, the
`canvas-*` capability). Any window now views any canvas: two windows on the same canvas mirror
(426/427, smallest-wins grid, letterboxed), and **typing into one agent from two windows
interleaves at the PTY like two tmux clients — expected, not a bug**. Pure deletion of
platform-neutral TS/Rust; the one behavioral addition rides 434's already-cross-platform
window plumbing.

### Needs real-box verification (pop-out = full window, task 437)

- [ ] **Pop-out button / tear-off on Windows.** Both open a second full window on that
      canvas; the first window keeps the tab (no "in window" marker) and both render its
      terminal live.
- [ ] **Two windows, one agent, under ConPTY.** Typing from both windows interleaves
      (expected); the grid tracks the smallest attached view; no crash, no stray repaints
      beyond the interleaving.
- [ ] **WebGL in the popped-out window.** The #105 canvas-window DOM-renderer rule is gone —
      the second window's terminals attach the WebGL addon; watch for the old #105
      doubled/ghosted-glyph artifact (if it reproduces there, it reproduces in the main
      window too — same code path, separate bug).
- [ ] **`?canvas=` compat URL.** A legacy `index.html?canvas=<id>` load renders the full
      shell booted into Canvas on that tab (one-release compat; nothing creates such
      windows anymore).
- [ ] **Close the popped-out window.** The first window keeps rendering everything (the 426
      view purge unclamps the grid); closing a canvas viewed by another window re-homes
      that window to another tab (no self-close, no ghost).

## 2026-07-16 — Restore the open-window set on relaunch (multi-window 13/16, task 439)

Relaunching ReCue now restores the same set of full app windows (`main` + `app-*`), each at
its saved outer-position/inner-size (physical px — the exact pair tao's `Moved`/`Resized`
report and `set_position`/`set_size` accept) and with its creation-time repo/canvas preset,
clamped to the current monitor layout and capped at 8 extras. Rust-only: a dedicated
`window_state` store key, a pure `WindowSet` state machine fed from the global
`WindowEvent` arm (debounced 500 ms saves), an `ExitRequested` flush for the ⌘Q path and a
would-empty rule for the last-window-close path. The Windows minimize sentinels (`Moved`
−32000/−32000, `Resized` 0×0) are ignored in the pure core (unit-tested on every host).

### Needs real-box verification (window restore, task 439)

- [ ] **Restore across two Windows sessions.** Open 2–3 windows, move/resize, quit (Alt+F4
      the last window AND the app-exit path), relaunch: each window returns at its saved
      bounds — positions in physical px under fractional scaling (125%/150%) must not
      drift or accrete the title-bar height across repeated cycles.
- [ ] **Minimize sentinels never persist.** Quit while a window is minimized: it restores
      at its last real bounds, never at −32000/−32000 or 0×0.
- [ ] **Unplugged second monitor.** Save bounds on a second monitor, unplug it, relaunch:
      the window is re-placed fully inside the surviving monitor (≥ the 64 px visibility
      floor), not lost off-screen.

## 2026-07-16 — Targeted PTY output delivery: session://output + session://size emit only to subscriber windows (multi-window 15/16, task 440)

`session://output` and `session://size` are now `emit_filter`ed to exactly the windows
holding a **live terminal host** for the session (the task-426 registry gains an
`output_subs` dimension: subscribe at host creation, unsubscribe at host dispose, swept
by the window-close purge — parking never touches it, so a parked host's buffer stays
byte-complete). A session with no live host anywhere skips the base64 encode AND the
emit entirely; a window that starts viewing later back-fills via `session_scrollback` +
the offset dedupe. Lifecycle events (state/exited/name/forkable, the roster) stay
app-global. Pure Rust event plumbing + TS IPC — platform-neutral; the two frontend
listens are label-scoped (a default-target listener would bypass the filter).

### Needs real-box verification (targeted delivery, task 440)

- [ ] **Two windows, agent visible in only one.** Output + typing render in the viewing
      window; the other window's busy dot, Attention queue, auto-name, and exit handling
      stay live (lifecycle is still global).
- [ ] **Late attach back-fills.** Scroll the agent into view in the second window later —
      the complete retained history back-fills (scrollback) then streams live, with no
      gap and no doubled startup paint (offset dedupe), incl. under ConPTY (the
      replayDedupe stray-`C` class of bug).
- [ ] **Park keeps the stream.** In the only viewing window, switch views (park the
      terminal) while the agent produces output, then switch back — the buffer is
      complete, no re-replay.
- [ ] **Close a window mid-storm.** Close the second window during heavy output — no
      stall, the first window is unaffected (the Destroyed purge sweeps the label).
- [ ] **Single-window regression smoke.** Spawn, type, switch Overview↔Canvas during
      output, Restart (resetTerminal), scroll a never-viewed boot-resumed card into
      view — everything byte-identical to before.

## 2026-07-16 — Multi-window epic wrap-up (tasks 426–440): the consolidated real-box matrix

### Multi-window epic (tasks 426–440) — N full app windows

The epic replaced the #84 one-main-window-plus-detached-canvas model with **N full app
windows**: `open_app_window` / label `app-<uuid>` / route `?win=<uuid>` (434), every window
the complete shell with window-local view state, shared state converging through the Rust
`*://changed` broadcasts (428) and server-side patch merges (429), terminals **mirroring**
in any number of windows under the smallest-wins grid arbiter (426/427), output emitted only
to subscriber windows (440), a Rust-elected **primary** window gating the once-per-app
effects (433), the app singletons moved into Rust (auto-continue + the one usage poll 430,
the clean-exit forget 431, the boot shell respawn 432), a same-file edit guard (435), the
single-instance / Dock-Reopen / Ctrl+Alt+N / File → New Window entry points (436),
pop-out-as-full-window with the #84 machinery deleted (437), the repo-menu entry point
(438), and window restore on relaunch (439). The Windows-sensitive seams: the
single-instance **named mutex**, window placement under **fractional / per-monitor DPI**
(and the −32000 / 0×0 minimize sentinels), **ConPTY** resize (`ResizePseudoConsole`) under
the smallest-wins arbitration, and per-window **WebView2** cost. macOS-only items (Dock
Reopen, File → New Window, ⌘Q `ExitRequested` ordering) remain PR-flagged per the #84/#105
precedent — no macOS trajectory file exists.

### Needs real-box verification (multi-window, tasks 426–440)

The per-card checklists appended above already cover most of the matrix — cross-referenced
here, not duplicated: **single-instance named-mutex** behavior (installed exe / portable
copy / two logged-in Windows sessions) and **Ctrl+Alt+N vs AltGr layouts** are in the
task-436 entry; **multi-monitor restore under fractional DPI**, the **minimize sentinels**,
and the **unplugged-monitor re-place** are in the task-439 entry; the **targeted-delivery
smoke** (late-attach back-fill, park, close-mid-storm, single-window regression) is in the
task-440 entry; the dev-wired **`?repo=` encoding round-trip** and the first two-window
ConPTY smoke are in the task-434 entry; **pop-out / tear-off**, mirroring + the tmux-style
input interleaving, per-window WebGL, and the **`?canvas=` compat route** are in the
task-437 entry. Still missing — new items:

- [ ] **ConPTY reflow under live min-size arbitration (426/427/440).** One agent visible in
      two windows with different slot sizes: the PTY grid is the component-wise minimum
      (`ResizePseudoConsole`), claude's TUI reflows cleanly in both, the larger window
      letterboxes; live-resizing the smaller window reflows both; closing it un-clamps and
      reflows the survivor up; switching views (parking) in one window does NOT resize the
      grid (the sized view detaches; the output subscription stays).
- [ ] **`?repo=` round-trip through the real UI entry point (438).** "Open in new window"
      on a repo at `C:\Users\a b\repo` → the new window's Overview filter shows exactly
      that repo (drive colon, backslashes, and the space intact — the 434 encode path,
      now through the shipped menu item instead of dev wiring).
- [ ] **Per-window WebView2 memory (434).** Note the working-set growth per additional app
      window (Task Manager, 2–4 windows); closing a window releases its share.
- [ ] **Same-file edit guard smoke (435).** The same `.md` (FileViewer raw view) and the
      same Kanban board open in two windows: editing in one claims it; the other renders
      read-only with the "Being edited in another window — Take over" banner and
      live-follows saves via the hot-reload poll; Take over flips the claim (the loser
      flushes its buffer once in auto mode, then locks); closing the claiming window purges
      the claim and the survivor unlocks.
- [ ] **Primary takeover (433).** Close the primary (oldest) window while another full
      window is open: the survivor re-arms the once-per-app effects live — exactly one
      update check, no re-onboarding, the `schedule://fired` transition still lands; with
      N restored windows (439) exactly ONE "Updated to vX" toast / onboarding modal fires
      across the whole app.

## 2026-07-16 — Agent-created worktree detection (sidebar worktrees + relocation)

- [ ] **Detected-worktree path identity on a real Windows box.** The agent-created
      worktree detection compares paths case-insensitively on Windows (`norm_path_key`
      in Rust, `normPathKey` in TS) and classifies "managed" by canonicalized prefix
      under `%APPDATA%\..\<data-dir>\worktrees`. Sanity-check with a `C:\`-drive repo:
      a Claude `EnterWorktree` worktree appears under its repo, `remove_worktree`
      refuses it, and a mixed-case duplicate path never renders a second row.

## 2026-07-16 — Attention-queue blink fix (resize-repaint suppression + eviction debounce)

The fix is platform-neutral by construction — the backend suppression is pure timestamp
logic (`last_resize` + `RESIZE_REPAINT_MS`, no `#[cfg]`), the store's eviction debounce is
plain TS timers, and the same-size PTY-resize dedupe lives in the task-426/427 Rust
arbiter (`terminal_views` only resizes + broadcasts when the smallest-wins effective grid
actually changed — superseding the branch's original frontend `lastPtySize` skip) — but
two legs are ConPTY-flavored and want a real-box look:

- [ ] **ConPTY resize-repaint suppression.** On Windows a `resize_pty` makes ConPTY
      itself repaint the screen (no SIGWINCH, but the same output burst). Verify: an
      idle agent that becomes the Attention queue head (its terminal mounts in the
      agent pane at a new size) does **not** blink out of the queue, and its dot stays
      yellow through the mount.
- [ ] **Same-size resize dedupe.** A view switch that reparents a terminal into an
      identically-sized slot re-proposes the same grid, and the arbiter skips the PTY
      resize (unchanged effective grid) — on ConPTY (which can repaint on *any* resize
      call, even same-size) confirm no spurious busy dot on Overview↔Attention↔Canvas
      switches with unchanged panel sizes.

## 2026-07-16 — Maximized-by-default + persisted window size (task 443)

Backend-only, platform-neutral by construction — the flag lives in the pure `WindowSet`
state machine (`set_maximized` / `merge_action`, unit-tested) and the persisted
`PersistedWindow { maximized }`; only the boot `maximize()` call and the live
`is_maximized()` query at the `Moved`/`Resized` site are impure. On Windows `maximize()`
is a **true** maximize (fills the work area, excludes the taskbar). It is applied while
the window is still hidden (#348), so no flash. Real-box checks:

- [ ] **Fresh-install default maximize.** With no persisted `window_state` (or one with no
      `main` entry), the main window opens **maximized** filling the desktop, no flash, no
      1280×832 frame flicker before it.
- [ ] **Maximized round-trips a quit.** Leave the window maximized, quit (⌘/Alt+F4 or last-
      window close), relaunch → it reopens maximized.
- [ ] **A user-chosen non-maximized size restores.** Un-maximize, resize/move to a custom
      frame, quit, relaunch → it restores at that exact frame (existing #439 behavior), and
      the stored `x/y/width/height` while maximized stayed the last non-maximized geometry
      (the un-maximize target snaps back to it, not to a first-ever 1280×832).
- [ ] **Extra app windows are NOT maximized by default** (⌘⌥N / File → New Window / repo
      "Open in new window") — they open at 1280×832 — but a previously-maximized `app-*`
      window re-maximizes on restore.

## 2026-07-16 — Themed window title bar (task 444)

macOS gets an integrated `--surface-mantle` `Titlebar` strip under the Overlay title bar
(the native traffic lights float over it); Windows keeps native decorations, so the strip
is `display:none` (revealed only via `data-platform="macos"`) and there is deliberately no
custom caption. The one Windows-facing change is the **native theme sync**: the persisted
ReCue light/dark theme is pushed to the window via `commands::theme_to_window_theme` →
`window.set_theme(...)` (in `lib.rs` setup + `create_app_window` before reveal, and in
`set_theme_background` on a runtime switch). Real-box checks:

- [ ] **DWM caption follows the theme.** On Windows 10/11 confirm the native title-bar /
      caption buttons render dark in ReCue's dark theme and light in light theme, on boot
      (no flash — set before the hidden-until-painted reveal, #348) and on a live
      Settings → Appearance theme toggle (via `set_theme_background`), for both the main
      window and a second `app-*` window. Full caption **color** parity (beyond dark/light)
      needs custom decorations — out of scope, future work.
- [ ] **No empty strip / layout shift.** The `Titlebar` strip renders nothing on Windows
      (no 30px band); `.app-body` fills the window exactly as before.
