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
