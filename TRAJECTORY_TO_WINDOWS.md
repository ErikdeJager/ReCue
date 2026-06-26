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
- **FLAGGED for manual Windows verification (not changed)**: the xterm.js (v6) terminal in
  `terminalPool.ts` sets no `windowsPty` option. ConPTY output can render with extra blank
  lines / wrong reflow on resize without it — but the *correct* setting depends on the
  ConPTY backend's build-number reflow support, and a wrong value makes rendering worse.
  **What to test on a real Windows box**: open a PowerShell shell terminal (#72) and an
  agent, type long lines, and resize the panel — watch for duplicated/blank lines or
  mis-wrapped text. If present, set `windowsPty: { backend: 'conpty', buildNumber }` (gated
  to Windows via the cached `platform` signal) and re-test; leave unset on macOS.

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
