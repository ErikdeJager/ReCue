# Windows landmines catalog

The cross-platform pitfalls that recur in a macOS-first Tauri app, and the **established
ReCue seam** each one must be fixed through. For every category: the *smell*, a
copy-pasteable *grep seed*, why it *breaks on Windows*, and the *fix seam*. The macOS arm
always keeps its current behavior; the Windows arm is additive and `#[cfg]`/`platform`-gated.

## Contents

1. Hardcoded POSIX paths & separators
2. Home directory & environment (`$HOME`)
3. Shelling out — the console-flash guard
4. Process/CLI resolution (PATHEXT, `.cmd`, shells)
5. Opening URLs vs revealing files
6. Keyboard handling (⌘ vs Ctrl)
7. User-facing platform copy (labels & hints)
8. `cfg`-gating gaps (the missing other arm)
9. Reserved names & filesystem rules
10. CSS / WebView divergence (WKWebView vs WebView2)
11. Build, bundle, capabilities & CI
12. Line endings & formatter parity
13. macOS-only system integration (Keychain, plist, vibrancy)

---

## 1. Hardcoded POSIX paths & separators

**Smell:** string-built paths with `/`, `format!("{}/{}", a, b)`, `.split('/')`, a literal
`"/"` root, or assuming an absolute path starts with `/`.
**Grep:** `grep -rn '"/' src-tauri/src src` · `grep -rn "split('/')\|split(\"/\")" src` · `grep -rn 'format!("{}/' src-tauri/src`
**Breaks on Windows:** the separator is `\`, drive-letter roots (`C:\`), and a `/`-only split
mis-parses a Windows absolute path.
**Fix seam:** **Frontend** — `joinPath(platform, root, rel)` and `splitPath` (splits on `/`
**or** `\`) in `src/platform.ts`; `repoName`/`lastSegment` in `src/paths.ts` use `[\\/]`.
The backend reports relative paths `/`-separated on every OS; reassemble with the platform
join only at the edge. **Rust** — build paths with `Path`/`PathBuf::join`, never string
concat; `commands.rs` already has path-segment guards.

## 2. Home directory & environment (`$HOME`)

**Smell:** `env::var("HOME")`, `std::env::var_os("HOME")`, `~` expansion, or reading
`~/.claude/...` via a raw `$HOME`.
**Grep:** `grep -rn 'HOME' src-tauri/src` · `grep -rn 'dirs::home_dir\|env::var("HOME")' src-tauri/src`
**Breaks on Windows:** there is no `$HOME`; the home dir is `%USERPROFILE%`.
**Fix seam:** **`path_env::home_dir()`** (`%USERPROFILE%` on Windows, `$HOME` elsewhere). All
of `usage.rs`, `title.rs`, `skills.rs` resolve `~/.claude/...` through it — never a raw env read.

## 3. Shelling out — the console-flash guard

**Smell:** `Command::new("git")` / any CLI probe spawned directly.
**Grep:** `grep -rn 'Command::new' src-tauri/src` then check each is wrapped.
**Breaks on Windows:** a bare `Command` pops a visible console window (flash) for each probe.
**Fix seam:** **`git::hidden_command(...)`** — applies the `CREATE_NO_WINDOW` flag on Windows
(no-op on macOS). **Every** shelled-out `git`/CLI probe goes through it. macOS behavior is
identical (the flag is Windows-only).

## 4. Process/CLI resolution (PATHEXT, `.cmd`, shells)

**Smell:** spawning `claude` / a shell by bare name, assuming `/bin/sh`, `bash`, or a POSIX
login shell; assuming the agent binary has no extension.
**Grep:** `grep -rn '"claude"\|/bin/\|"sh"\|"bash"\|"zsh"' src-tauri/src` · inspect `pty.rs`, `agents.rs`
**Breaks on Windows:** executables are `claude.cmd`/`.exe` resolved via **PATHEXT**, the shell
is PowerShell/`cmd.exe`, and a `.cmd` must launch through `cmd.exe /C`.
**Fix seam:** **`pty::resolve_command`** / `find_on_path` / `launch_target` (PATHEXT +
`cmd.exe /C` for `.cmd` agents); the Windows terminal is PowerShell. `path_env::restore_user_path`
adopts the login-shell PATH on macOS (no-op probe on Windows). Keep the macOS spawn flags exact.

## 5. Opening URLs vs revealing files

**Smell:** `explorer.exe <url>`, `open <url>`, or one helper used for both a URL and a folder.
**Grep:** `grep -rn 'explorer\|xdg-open\|"open"\|open_url\|os_open\|reveal' src-tauri/src` · `grep -rn 'openUrl\|open_url' src`
**Breaks on Windows:** `explorer.exe <url>` opens a **File Explorer window**, not the browser;
reveal needs `explorer.exe /select,<path>` with `\` separators.
**Fix seam:** **URLs** → the http/https-only **`open_url`** (`#[cfg]`: macOS `open`, Windows
`cmd /C start "" <url>`, else `xdg-open`); frontend `openUrl` in `platform.ts`. **Reveal a
file** → `open -R` (macOS) vs `explorer.exe /select,<path>` (Windows, separators normalized to
`\`). **Open a folder** → `os_open` / `reveal_path` (`explorer.exe`). Don't cross the wires.

## 6. Keyboard handling (⌘ vs Ctrl)

**Smell:** `e.metaKey` checked alone; `key === 'Meta'`; Cmd-only shortcut handlers.
**Grep:** `grep -rn 'metaKey' src` — each hit must also accept `ctrlKey`.
**Breaks on Windows:** there is no ⌘; the modifier is Ctrl, so a `metaKey`-only shortcut never fires.
**Fix seam:** **`metaKey || ctrlKey` for every shortcut handler** (`useKeyboardNav.ts` and every
component, incl. ⌘/Ctrl-click link opening). A Ctrl shortcut then fires on Windows for free;
macOS ⌘ is unaffected.

## 7. User-facing platform copy (labels & hints)

**Smell:** literal "⌘", "Cmd", "Reveal in Finder", "macOS only" in UI strings or docs.
**Grep:** `grep -rn '⌘\|Cmd\|Finder\|macOS only' src *.md`
**Breaks on Windows:** the copy lies — it says Finder/⌘ on a machine with Explorer/Ctrl.
**Fix seam:** route shortcut hints through **`kbdHint`** (⌘↔Ctrl) and reveal labels through
**`revealLabel`** ("Reveal in Finder"↔"Reveal in Explorer") in `platform.ts`. Docs/patch-note
copy that names a platform reads **"macOS and Windows"**, never "macOS only".

## 8. `cfg`-gating gaps (the missing other arm)

**Smell:** a `#[cfg(target_os = "macos")]` / `#[cfg(unix)]` block with **no** counterpart for
the other OS, so Windows (or macOS) fails to compile or silently no-ops wrongly.
**Grep:** `grep -rn '#\[cfg(' src-tauri/src` — for each, confirm the other arm exists.
**Breaks on Windows:** missing arm → compile error or an unhandled runtime branch.
**Fix seam:** always provide **both** arms — `#[cfg(windows)]` next to `#[cfg(unix)]`/
`#[cfg(target_os = "macos")]`, with a sensible Windows implementation or an explicit `None`/no-op
stub (e.g. the Keychain fallback in `usage.rs` is macOS-gated with a non-macOS `None`). The
macOS arm stays exactly as it was.

## 9. Reserved names & filesystem rules

**Smell:** writing/creating a path from user or branch input without rejecting Windows-reserved
device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`..`LPT9`), trailing dots/spaces, or `:<>"|?*`.
**Grep:** inspect `commands.rs`, `files.rs`, worktree/branch path building.
**Breaks on Windows:** such a filename is illegal or maps to a device; the write fails or misbehaves.
**Fix seam:** **`commands.rs` `windows_safe_seg`** path-segment guard. Apply it to any new path
segment derived from user input (branch names, file names, worktree dirs). No-op-equivalent on macOS.

## 10. CSS / WebView divergence (WKWebView vs WebView2)

**Smell:** `-webkit-`-only effects, `backdrop-filter`/vibrancy, `color-mix()` with no fallback,
scrollbar styling that assumes WebKit, macOS-only font smoothing.
**Grep:** `grep -rn 'backdrop-filter\|color-mix(\|-webkit-\|vibrancy' src`
**Breaks on Windows:** WebView2/Chromium renders differently from WKWebView — an effect may be
missing or look wrong with no fallback.
**Fix seam:** ship a **plain-color fallback alongside `color-mix()`**, prefer `::-webkit-scrollbar`
styling (works in both engines), and avoid macOS-only `-webkit-`/vibrancy without a fallback. The
macOS rendering is preserved; the fallback only fills in where WebView2 lacks the effect.

## 11. Build, bundle, capabilities & CI

**Smell:** macOS-only bundle config presented as the only target; `cfg(unix)`-only tests; a
capability or signing step with no Windows equivalent.
**Grep:** inspect `src-tauri/tauri.conf.json` (bundle targets NSIS+MSI **and** dmg/app),
`capabilities/*.json`, `.github/workflows/*.yml`, `grep -rn 'cfg(unix)' src-tauri`.
**Breaks on Windows:** a Windows build/test isn't produced or green; a `cfg(unix)` POSIX-shell
test has no Windows arm.
**Fix seam:** keep platform-neutral bundle metadata (NSIS+MSI alongside dmg/app), give
POSIX-shell tests a Windows counterpart or gate them `cfg(unix)` with a Windows path tested
separately, and ensure both `cargo`/`npm` and the coverage steps run on both OSes.

## 12. Line endings & formatter parity

**Smell:** files that would land CRLF on a Windows checkout and fail `cargo fmt`/`prettier`.
**Grep:** read `.gitattributes`; confirm `* text=auto eol=lf` (or per-type LF) covers Rust/TS/MD/JSON.
**Breaks on Windows:** a Windows checkout introduces CRLF, so `cargo fmt --check` / `prettier
--check` fail in CI even with no real code change.
**Fix seam:** **`.gitattributes` LF normalization** so `cargo fmt` and `prettier` pass on a
Windows checkout. No source change; macOS is unaffected.

## 13. macOS-only system integration (Keychain, plist, vibrancy)

**Smell:** the `security` CLI / Keychain read, `Info.plist`-only config, NSWindow vibrancy, or a
macOS-only system call in a shared path.
**Grep:** `grep -rn 'security\|Keychain\|Info.plist\|NSWindow' src-tauri/src`
**Breaks on Windows:** no Keychain, no plist — the call fails or is meaningless.
**Fix seam:** gate the macOS integration `#[cfg(target_os = "macos")]` and provide a Windows
path (e.g. the OAuth token in `usage.rs` comes from `~/.claude/.credentials.json` via
`home_dir()` on Windows, with the `security`/Keychain fallback macOS-gated). Keep the feature
**fail-open** so a miss hides the feature rather than crashing. macOS keeps its Keychain path.

---

## How to use this catalog

- **Phase 1 (orient):** skim every category so you recognize the seams and the already-handled set.
- **Phase 2 (Explore agents):** hand each agent this file; the grep seeds + seam names tell them
  exactly what to hunt and what "already gated" looks like (so they don't false-positive).
- **Phase 4 (remediation):** name the seam from here in each fix, and prove the macOS arm is
  byte-for-byte unchanged.

Treat the seam list as authoritative but not closed — if a genuinely new kind of divergence
appears, add a new `#[cfg]`/`platform`-gated abstraction (don't inline one-off `if windows`
checks), and note the new seam back in `CLAUDE.md` and `TRAJECTORY_TO_WINDOWS.md`.
