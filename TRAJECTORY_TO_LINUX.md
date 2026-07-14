# Trajectory to Linux

A running log of Linux-specific work and bugs found + fixed while keeping macOS and
Windows behavior intact (#345). Linux targets **Arch, Ubuntu, and Mint fully, best-effort
for other distros**. Newest entries appended under a dated heading. Mirrors
`TRAJECTORY_TO_WINDOWS.md`.

## 2026-07-07

### Audit summary (state at start of the Linux port, #345)

The backend and frontend were already substantially Linux-ready because most per-OS
divergence uses `#[cfg(unix)]` / `#[cfg(not(windows))]` arms that Linux inherits, the
frontend keyboard handling is `metaKey || ctrlKey` (platform-agnostic), and the Linux
WebView is Chromium (WebKitGTK) — so every `-webkit-scrollbar` / `color-mix` CSS choice
already carries over unchanged. A full read of the Rust backend + React frontend confirmed
these already-correct-on-Linux paths:

- `git::hidden_command` — the `CREATE_NO_WINDOW` console-flash guard is `#[cfg(windows)]`,
  a no-op on unix/Linux; every `git` shell-out is fine.
- `usage.rs` — the Keychain read is `#[cfg(target_os = "macos")]` with a `not(macos)` stub
  returning `None`, so on Linux the `~/.claude/.credentials.json` file is the sole token
  source (canonical there anyway).
- `lib.rs` `tccutil` / permission-reprompt — `#[cfg(target_os = "macos")]`, skipped on Linux.
- `path_env::home_dir()` — `$HOME` on unix.
- `pty.rs` `find_on_path` / `launch_target` / `resolve_command` — unix arms return the bare
  program name (exec resolves via PATH); `files.rs is_cross_device` handles unix `EXDEV`.
- `commands::platform()` already returns `"linux"` via `std::env::consts::OS`.
- `open_url` already had a `#[cfg(not(any(macos, windows)))]` → `xdg-open` arm.

Defects found (a `not(windows)`/`cfg(unix)` arm that secretly assumed **macOS**):

1. **`os_open` used the macOS `open` binary on all non-Windows.** It backs
   `open_data_folder` (Settings → Data) and `reveal_path` (repo/worktree "Reveal in…"). On
   Linux `open` is not the file opener → both silently failed. **Fixed below.**
2. **`reveal_file_in_finder` used `open -R` on all non-Windows.** No such command on Linux.
   **Fixed below.**
3. **Frontend `kbdHint` / `revealLabel` folded Linux into the macOS branch.** Linux users
   would see ⌘ glyphs and "Reveal in Finder". **Fixed below.**
4. **`default_shell` unix fallback was `/bin/zsh`** — not a safe Linux default (often not
   installed). `$SHELL` is essentially always set in a desktop session, but the fallback
   was hardened. **Fixed below.**

### Fixes

- **Bug**: `os_open` shelled out to the macOS `open` binary on Linux (folder reveal / open
  data folder did nothing).
  **Fix**: Split the non-Windows arm into a macOS `open` arm and a `#[cfg(not(any(macos,
  windows)))]` → **`xdg-open`** arm (mirroring `open_url`).
  **Files**: `src-tauri/src/commands.rs` (`os_open`).

- **Bug**: `reveal_file_in_finder` used `open -R` on Linux (nonexistent command).
  **Fix**: Added an `#[cfg(all(unix, not(target_os = "macos")))]` arm → `reveal_file_linux`,
  which best-effort **selects** the file via the FreeDesktop
  `org.freedesktop.FileManager1.ShowItems` D-Bus method (`dbus-send`; Nautilus / Nemo /
  Dolphin / Thunar / Caja implement it), falling back to `xdg-open` on the file's parent
  directory when there is no FileManager1 provider. Because the macOS host can't compile a
  Linux-only fn, the helper's `cfg` is widened with `, test)` (+ `allow(dead_code)` under
  `test`) so `cargo clippy`/`cargo test` still type-check it, mirroring `explorer_select_arg`.
  **Files**: `src-tauri/src/commands.rs` (`reveal_file_in_finder`, `reveal_file_linux`).

- **Bug**: `kbdHint` showed ⌘ glyphs and `revealLabel` showed "Reveal in Finder" on Linux.
  **Fix**: Added `isLinux(platform)`; `kbdHint` now returns the Ctrl-form on Windows **and**
  Linux, ⌘ only on macOS; `revealLabel` returns "Reveal in File Manager" on Linux. One file,
  fixes all ~50 `kbdHint` + all 9 `revealLabel` call sites (they pass the `platform` signal).
  Added Linux cases to `src/platform.test.ts`.
  **Files**: `src/platform.ts`, `src/platform.test.ts`.

- **Bug**: `default_shell` fell back to `/bin/zsh` on Linux.
  **Fix**: macOS keeps `$SHELL` else `/bin/zsh` byte-for-byte; a new `non_macos_unix_shell`
  helper (`test`-widened) uses `$SHELL` else the first existing of `/bin/bash`, `/bin/sh`.
  Added `non_macos_unix_shell_is_never_empty` unit test.
  **Files**: `src-tauri/src/pty.rs` (`default_shell`, `non_macos_unix_shell`).

- **Doc**: `path_env` — the login-shell PATH probe is `#[cfg(unix)]` and already runs on
  Linux (a `.desktop`/AppImage launch inherits a minimal session environment, same class of
  problem as a Finder-launched `.app`); clarified the module + `restore_user_path` comments.
  **Files**: `src-tauri/src/path_env.rs`.

- **Build / CI**: added an `ubuntu-22.04` **AppImage-only** leg (`--bundles appimage`) to
  `.github/workflows/release.yml`'s release matrix, with an apt step for the Tauri 2 /
  AppImage toolchain (webkit2gtk-4.1, gtk-3, ayatana-appindicator3, librsvg2, patchelf, …).
  ubuntu-22.04 gives the broadest glibc/webkit floor (runs on Ubuntu 22.04+, Mint 21 **and**
  22, current Arch). The AppImage is minisign-signed like the other legs and merges a
  `linux-x86_64` entry into `latest.json`, so the **AppImage self-updates** in-app. The leg
  runs last (serialized `max-parallel: 1`) so the `latest.json` merge appends after
  darwin + windows.
  **Files**: `.github/workflows/release.yml`.

### Needs real-box verification (cannot be exercised on macOS/CI unit tests)

Recorded here per the CLAUDE.md convention — implemented for Linux, still to be walked on a
real box across Arch, Ubuntu, and Mint:

- [ ] The **AppImage launches** on Arch, Ubuntu (22.04+), and Mint (21 + 22) — glibc /
      webkit2gtk-4.1 floor holds; newer distros may need `libfuse2` for the AppImage runtime.
- [ ] A `claude` session **spawns** (PTY inherits the session `$SHELL`; `claude` on PATH via
      the login-shell probe from a `.desktop`/AppImage launch).
- [ ] **`xdg-open`** opens the browser on a ⌘/Ctrl-click URL and opens folders for
      "Reveal in File Manager" (repo) and Settings → Data "Open data folder".
- [ ] **`reveal_file_in_finder`** highlights the file via `FileManager1.ShowItems` on each DE
      (GNOME/Nautilus, KDE/Dolphin, Cinnamon/Nemo → Mint, Xfce/Thunar), else opens the parent
      folder.
- [ ] Keyboard hints render **Ctrl+…** (not ⌘) and "Reveal in File Manager".
- [ ] **Native notifications** (libnotify / D-Bus) fire on the #336 watch feature.
- [ ] **Clipboard image paste** (`save_clipboard_image`) works under X11 and Wayland.
- [ ] The **in-app updater** recognizes the AppImage (`linux-x86_64` in `latest.json`) and
      relaunches after applying.

## 2026-07-08

### Performance (Task #346)

Symptom (reported from a real Arch box, release AppImage, Wayland, across NVIDIA/AMD/Intel
machines): agents inside ReCue are very slow — laggy terminal input echo, slow display
updates, slow agent boot/spawn — while macOS and Windows are fine. Investigation traced it
to four compounding causes; all four are fixed, the Linux-specific ones cfg-/platform-gated
and the platform-neutral ones provably order/content-preserving:

- **No WebKitGTK DMA-BUF workaround.** On NVIDIA's proprietary driver (and in VMs),
  WebKitGTK's DMA-BUF renderer is the classic "Tauri app is unusably slow / blank on
  Linux" failure — it drags the whole webview down (input, paint, boot). wry 0.55 does not
  set the documented kill-switch, so ReCue now does: `linux_webkit::
  apply_webkit_env_workarounds()` runs at the top of `run()` (before GTK/WebKit init,
  before any threads) and sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` **only** when the NVIDIA
  proprietary driver (`/proc/driver/nvidia/version` or `/sys/module/nvidia`) or a VM
  (`/sys/hypervisor/type`, DMI product/vendor strings) is detected. Policy: a user-set
  `WEBKIT_DISABLE_DMABUF_RENDERER` is always respected; `RECUE_DISABLE_DMABUF=1|0` force-
  overrides both ways; healthy AMD/Intel Mesa stacks are left on the (faster) DMA-BUF
  path. `WEBKIT_DISABLE_COMPOSITING_MODE` is never set automatically —
  `RECUE_DISABLE_COMPOSITING=1` is an opt-in escape hatch for real-box debugging.
  **Files**: `src-tauri/src/linux_webkit.rs` (new), `src-tauri/src/lib.rs`.
- **xterm's WebGL renderer silently software-rasterized.** WebKitGTK can hand the
  `@xterm/addon-webgl` a context that "works" but is llvmpipe/SwiftShader — every terminal
  frame CPU-rendered. The pool now probes the WebGL renderer string **once per app** (Linux
  only — macOS/Windows short-circuit and never construct the probe canvas) and skips the
  WebGL addon when it names a software rasterizer, falling back to xterm's DOM renderer
  (the #105 detached-window fallback, faster than software GL). The store's `init` now
  loads the `platform` signal **before** the first `refresh()` so the probe (and Windows'
  `windowsPtyOption`) always see a real value at host-creation time.
  **Files**: `src/components/Terminal/webglRenderer.ts` (new, pure + tested),
  `src/components/Terminal/terminalPool.ts`, `src/store.ts`.
- **Scrollback replay shipped as a JSON integer array.** Live output went base64 in #261,
  but `session_scrollback` still returned `Vec<u8>` — serde serializes that as
  `[27,91,...]`, turning the 256 KB scrollback into ~1 MB+ of JSON parsed on **every**
  terminal mount (an agent wall of N terminals pays N of those at boot; costliest on
  WebKitGTK). `ScrollbackReply` now carries `b64` (the #261 `encode_output` encoding) and
  the pool decodes with the existing `decodeOutputB64`. Platform-neutral — helps all OSes.
  **Files**: `src-tauri/src/commands.rs`, `src/types/index.ts`,
  `src/components/Terminal/terminalPool.ts`.
- **One Tauri emit per 8 KB PTY read.** Each `emit` is an evaluate-JS on the webview main
  thread — costliest on Linux/WebKitGTK — so claude's TUI repaint storms became hundreds of
  events/sec that keystroke echo queued behind. The forwarder thread now drains whatever is
  already queued after each blocking `recv` (`try_recv`, zero added latency for a lone
  event) and merges **consecutive contiguous same-session** Output runs via the pure
  `pty::coalesce_output_events` (capped at 256 KB per merged emit). The contiguity guard
  (next chunk's start == run's end) keeps the frontend's `start = offset - bytes.length`
  dedupe math exact and splits across a Restart (whose fresh Scrollback resets the running
  total); non-Output events are never reordered. Platform-neutral — the frontend already
  rAF-coalesces its xterm writes, so the merged payload decodes to the identical byte
  stream. **Files**: `src-tauri/src/pty.rs`, `src-tauri/src/lib.rs`.

Deliberately untouched (documented future work): the login-shell PATH probe's boot cost
(≤3 s worst case, `path_env.rs`), per-keystroke `write_stdin` invokes (batching would add
latency by definition), Overview terminal virtualization, `[profile.release]` tuning.

### Needs real-box verification (performance, #346)

- [ ] **NVIDIA + Wayland**: boot logs `[recue] WebKitGTK: set WEBKIT_DISABLE_DMABUF_RENDERER=1`,
      and terminals are responsive (echo, paint, spawn).
- [ ] **AMD + Wayland** and **Intel + Wayland**: DMA-BUF is left **on** (no log line), no
      regression vs before.
- [ ] `RECUE_DISABLE_DMABUF=1` / `=0` force the workaround on/off; a user-exported
      `WEBKIT_DISABLE_DMABUF_RENDERER` is respected untouched.
- [ ] On a box where WebGL is software (llvmpipe — e.g. NVIDIA without working GL in the
      webview): the console logs the "skipping WebGL renderer" warning, terminals use the
      DOM renderer, and input echo is responsive.
- [ ] Release AppImage under a busy `claude` TUI (many parallel agents): display updates
      stay smooth and typing stays responsive (coalescing + b64 scrollback in effect);
      scrollback replays correctly after a view switch and after a session Restart.

## 2026-07-14

### White startup flash (#348)

Platform-neutral fix (no `#[cfg]` arms), but the paint race it removes is a **GUI**
behavior, so it cannot be unit-tested — it needs a real box per OS. What changed:
windows are created **hidden** (`visible: false`) with a **themed native background**
(`tauri.conf.json` / `WebviewWindowBuilder::background_color`, from
`commands::background_for_theme`; `lib.rs` `setup` re-colors the main window from the
persisted theme before it is ever shown), `index.html` gained an **inline pre-paint
`<style>`** + a synchronous **`recue.theme` localStorage mirror** read (every stylesheet
is JS-imported, so the document had *zero* styles — and thus a white canvas — until the
bundle parsed), and the frontend reveals the window from `useRevealWindow` →
`reveal_window` once React has committed its first frame, with a Rust
`schedule_reveal_fallback` (2 s) so a bundle that never boots can't leave the app
running-but-invisible.

Linux-specific risk to watch: **WebKitGTK may throttle/suspend `requestAnimationFrame`
for an unmapped window**, which is exactly why the reveal fires from *both* an rAF and a
0 ms timer, with the Rust 2 s fallback underneath. If the window on Linux consistently
appears only after ~2 s, the rAF+timer path is not running while hidden — shorten the
fallback or reveal from Rust's `on_page_load` instead (`visible: false` is one line to
revert).

### Needs real-box verification (startup flash, #348)

- [ ] **Dark (default) launch** (`npm run tauri dev` **and** a release AppImage): no white
      rectangle at any point — the window first appears already showing the dark shell.
- [ ] **Light theme** (Settings → Appearance → Light → Save, quit, relaunch): the window
      appears **light** — no white flash and no dark→light flip.
- [ ] **Detached canvas window**: pop a Canvas tab out (button **and** drag tear-off) in
      both themes — the new window appears already themed, no white flash; closing it
      re-docks as before.
- [ ] **Reveal timing**: the window appears promptly (frontend reveal), not after a ~2 s
      pause (which would mean only the Rust fallback fired — see the WebKitGTK rAF note).
- [ ] **Reveal fallback**: with the Vite dev server stopped (or a deliberately broken
      bundle), the window still appears within ~2 s instead of never showing.
- [ ] **Runtime theme switch**: switch Dark↔Light, Save, then resize the window quickly —
      any exposed native gutter is the **new** theme color.
- [ ] Confirmed on **Arch**, **Ubuntu**, and **Mint** (the fully-supported distros), on
      both Wayland and X11.
