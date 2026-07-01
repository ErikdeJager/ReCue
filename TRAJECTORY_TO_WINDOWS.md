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
