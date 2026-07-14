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

### Native GTK dialogs were always light (Task #349)

- **Bug**: In the shipped **AppImage** every native file dialog — the folder picker ("Choose
  a working directory"), the open-file dialog (FileSwitcher → Browse…) and the save dialog
  (template export) — rendered white/light Adwaita, no matter the desktop's theme or ReCue's
  own Dark/Light setting. A dark-desktop user in a dark app got a blinding white dialog.
  Three facts stack:
  1. Tauri's AppImage bundler injects the vendored `linuxdeploy-plugin-gtk.sh` AppRun hook,
     which bundles GTK and then **forces `GTK_THEME`** for the whole process, picking the
     variant by grepping the *system theme name* for the substring `dark`. So
     `catppuccin-mocha-yellow-standard+default` (and any `color-scheme: prefer-dark` setup
     whose theme name has no "dark" in it) falls through to `GTK_THEME=Adwaita:light`. The
     hook honors exactly one user override: **`APPIMAGE_GTK_THEME`**, copied verbatim.
  2. `tauri-plugin-dialog` (2.7.1) resolves to rfd's **in-process GTK3** backend on Linux
     (`Cargo.lock` has `rfd 0.16` + `gtk`/`gtk-sys 0.18` and **no `ashpd`**), so every dialog
     is a GTK3 widget created inside our process and themed by that polluted env.
  3. GTK3's `get_theme_name()` gives **`GTK_THEME` absolute precedence** — `gtk-theme-name` /
     `gtk-application-prefer-dark-theme` are not even read when it is set. That is why tao's
     `Window::set_theme` cannot fix it: the env itself must be corrected, and it must be
     corrected **before GTK initializes**.

  **Fix**: A new `linux_gtk` module, called from `run()` immediately after
  `linux_webkit::apply_webkit_env_workarounds()` and before `tauri::Builder` (i.e. before GTK
  init and before any thread spawns — env mutation isn't thread-safe). It reads ReCue's own
  `settings.theme` straight from the persisted `sessions.json` (read-only, fail-open — the
  `Store` only exists after `.setup()`, i.e. after GTK init) and exports `GTK_THEME`. Policy
  (the pure, unit-tested `gtk_theme_env`), in order:
  1. `RECUE_GTK_THEME=<literal GTK_THEME value>` forces the value **everywhere** — the support
     escape hatch, and the way to smoke-test this in `tauri dev` without building an AppImage.
  2. Not in an AppImage (`$APPIMAGE`/`$APPDIR` unset — dev run, `.deb`, distro package) →
     leave `GTK_THEME` untouched; the desktop's real GTK theme already applies and forcing
     Adwaita would be a downgrade.
  3. `APPIMAGE_GTK_THEME` set → leave it alone; the hook already applied the user's explicit
     choice and ReCue never clobbers it.
  4. Otherwise pick the **Adwaita** variant (the family the AppImage actually bundles, and the
     only one guaranteed to render against the bundled GTK) from ReCue's theme: `light` →
     `Adwaita:light`; everything else, incl. a fresh install with no persisted settings →
     `Adwaita:dark` (matching `DEFAULT_SETTINGS.theme`). One `[recue] GTK: set GTK_THEME=…`
     log line on the write.
  The app-data path re-derives Tauri's Linux `app_data_dir()` rule (`$XDG_DATA_HOME` when
  absolute, else `path_env::home_dir()/.local/share`, + the identifier) — a drift guard test
  parses `tauri.conf.json` via `include_str!` and asserts the identifier still matches. macOS
  and Windows are byte-for-byte unaffected (the whole body is
  `#[cfg(all(unix, not(target_os = "macos")))]`; the pure decision fns are `, test)`-widened
  so every host still type-checks + unit-tests them).
  **Files**: `src-tauri/src/linux_gtk.rs` (new), `src-tauri/src/lib.rs`,
  `src/components/Settings/Settings.tsx` (Linux-only "next launch" hint), `README.md`.

- **Known limitation**: `GTK_THEME` is read once at GTK init, so toggling Dark/Light in
  Settings re-themes the app instantly but the **native dialogs pick up the new variant on the
  next launch**. Mutating env after boot is not an option (threads are running by then; Rust
  2024 makes `set_var` `unsafe` for exactly this reason). Settings → Appearance says so, on
  Linux only.

- **Rejected alternatives** (recorded so the next attempt doesn't re-litigate them):
  - **`tauri-plugin-dialog`'s `xdg-portal` feature** — swaps rfd to the out-of-process XDG
    portal backend, which does follow the system theme and ignores our env. Rejected because
    it **hard-requires `xdg-desktop-portal` + a backend to be installed and running**: rfd has
    no GTK fallback when built with that feature, so on a minimal/wlroots/no-portal box the
    dialogs would stop working entirely — turning a cosmetic bug into "cannot open a folder"
    for the best-effort distros. It also follows the *system* theme, not ReCue's. **Kept as
    the documented fallback** if some distro's GTK dialogs turn out to be unfixable by env.
  - **Unsetting `GTK_THEME`** so GTK picks the user's real theme — inside the AppImage that
    theme may not exist under the AppImage's `XDG_DATA_DIRS` or may not render against the
    **bundled** GTK (precisely why the hook forces Adwaita). Trades a white dialog for a
    possibly broken one.
  - **Calling tao/GTK `set_theme` at runtime** — needs a direct `gtk` dep version-coupled to
    tao, and is a no-op while `GTK_THEME` is set (fact 3 above).

### Needs real-box verification (GTK dialog theme, #349)

- [ ] **AppImage, ReCue theme = Dark** (incl. a fresh install with no persisted settings): boot
      logs `[recue] GTK: set GTK_THEME=Adwaita:dark …`, and the folder picker, the
      FileSwitcher → Browse… open dialog, and the template-export save dialog all render
      **dark** — on Arch, Ubuntu and Mint, under GNOME / KDE / Cinnamon / Xfce, on both Wayland
      and X11.
- [ ] **AppImage, ReCue theme = Light**: after Settings → Appearance → Light → Save → quit →
      relaunch, `GTK_THEME=Adwaita:light` and the same three dialogs render light.
- [ ] **Overrides honored**: `APPIMAGE_GTK_THEME=Adwaita:dark ./ReCue*.AppImage` (no ReCue
      override line logged) and `RECUE_GTK_THEME=<theme>` win over the policy.
- [ ] **Non-AppImage run** (`npm run tauri dev`, a distro package): `GTK_THEME` is left
      untouched (no `[recue] GTK:` line) and dialogs follow the desktop theme;
      `RECUE_GTK_THEME=Adwaita:dark npm run tauri dev` makes them dark (the AppImage-free
      smoke test).

### Native Arch package + updater / pacman separation (Task #361)

- **Problem**: the AppImage was the *only* Linux artifact, and it is a poor fit for Arch. It
  bundles the whole Ubuntu 22.04 GTK/WebKit userland (~90 MB of `libwebkit2gtk-4.1` alone,
  ~165 shared libs) instead of Arch's current webkit2gtk-4.1 2.52 (Skia); its AppRun hook
  forces `GTK_THEME` **and `GDK_BACKEND=x11`** (so no native Wayland); cold start pays
  squashfs decompression; and it will not run at all without **FUSE 2** (`fuse2` on Arch).

- **Shipped**: a second official Linux artifact — a **`.deb`** (the Linux release leg is now
  `--bundles appimage,deb`) — and an in-repo AUR package, **`packaging/aur/recue-bin/`**
  (`PKGBUILD` + `.SRCINFO`), that **repacks that `.deb`** into a native pacman package
  linking the **system** webkit2gtk/GTK. `scripts/aur-bump.sh <version>` re-pins it to a
  published release (downloads the `.deb`, hashes it, rewrites `pkgver`/`pkgrel`/
  `sha256sums`, regenerates `.SRCINFO`) and prints the manual publish runbook. Publishing to
  the AUR stays **manual by design**: no AUR account / SSH-key secret exists for this repo,
  and auto-pushing a package on every release is a maintainer act, not a build side effect.

- **The key constraint — detection must be RUNTIME.** Tauri's Linux updater can only replace
  an **AppImage** (the file at `$APPIMAGE`). The AUR package repacks the **same binary** the
  `.deb` carries, so no compile-time flag/feature can tell "AppImage build" from "distro
  build" apart. The AppImage runtime exports **`$APPIMAGE`**; a `/usr/bin` install does not.
  That single env var is the whole discriminator. So `commands.rs` gained a pure
  `classify_install(os, appimage, override_kind, debug)` + an `install_kind()` command:
  `"bundle"` (macOS `.app` / Windows installer / **any debug build**) and `"appimage"` are
  self-updating; a **Linux release binary with no `$APPIMAGE`** is `"system"` — pacman/apt
  owns it. An **empty** `APPIMAGE` string counts as unset (`std::env::var` yields `Some("")`
  for a present-but-empty var). `RECUE_INSTALL_KIND=appimage|system|bundle` force-overrides
  it (mirroring #346's `RECUE_DISABLE_DMABUF`) so either state is exercisable on any box —
  every row is unit-tested, so macOS/Windows CI covers the Linux-only paths too.

- **The updater gate**: a pure `selfUpdates(installKind)` (`src/platform.ts`) is false **only**
  for `"system"`. On a package-managed install `store.checkForUpdate()` short-circuits to
  `idle` with **no network call at all**, the sidebar `UpdateIndicator` never renders,
  `installUpdate()` is a no-op that toasts, and Settings → Updates hides Check/Update-now and
  shows a `sudo pacman -Syu recue-bin` note (current version + the #192 patch notes still
  render). The **pre-load default `""` reads as self-updating**, so macOS/Windows/AppImage are
  byte-for-byte unchanged — `src/store.update.test.ts` asserts exactly that (mocked
  `./updater`: `"system"` never calls it; `"appimage"`/`"bundle"`/`""` still do).
  The boot **"Updated to v…"** toast is left alone — it's a pure version compare and fires
  correctly after a `pacman -Syu` upgrade too.

- **The `.deb` is NOT an updater artifact**: it gets no `.sig`, and `latest.json`'s
  `linux-x86_64` entry keeps pointing at the **`.AppImage`**. The AppImage remains the
  default, self-updating download.

- **Verified on a real Arch box** (this one — `webkit2gtk-4.1 2.52.5` installed):
  `npm run tauri build -- --bundles deb` produced `ReCue_1.2.1_amd64.deb`, and the PKGBUILD's
  `package()` body was run **verbatim** against it — the `bsdtar` `data.tar.*` repack yields
  `/usr/bin/recue` + `/usr/share/applications/ReCue.desktop` + the hicolor icons.
  `makepkg --printsrcinfo` parses the PKGBUILD and generated the committed `.SRCINFO`.
  - **`depends` was derived from the real binary, not guessed** (`objdump -p … | grep NEEDED`,
    each `.so` mapped via `pacman -Qo`): `webkit2gtk-4.1 gtk3 glib2 cairo gdk-pixbuf2 libsoup3
    dbus glibc gcc-libs`. Notably the binary does **not** link `libayatana-appindicator`
    (ReCue ships no tray) — it is deliberately **not** a dependency.
  - **Correction to an assumption**: Tauri's `.deb` installs the binary under its **cargo**
    name — already the lowercase **`/usr/bin/recue`**, not `/usr/bin/ReCue`. The PKGBUILD's
    lowercase-alias symlink is therefore a no-op today and kept only as a guard.

### Needs real-box verification (Arch package + updater gate, #361)

- [ ] A release run uploads **both** `ReCue_<v>_amd64.deb` and `ReCue_<v>_amd64.AppImage` to
      the draft, and the merged `latest.json`'s `linux-x86_64` entry still points at the
      **`.AppImage`** (the `.deb` must get no `.sig`). Check before publishing the draft.
- [ ] `scripts/aur-bump.sh <version>` against that **published** release rewrites `pkgver` +
      `sha256sums` and regenerates `.SRCINFO`; `makepkg -si` then installs cleanly and
      `namcap` is clean.
- [ ] The installed package launches from the app menu **and** as `recue` from a terminal;
      `ldd /usr/bin/recue` resolves to `/usr/lib` (system webkit2gtk 2.52), not a bundled
      userland; no `GTK_THEME`/`GDK_BACKEND` forcing; cold start visibly faster than the
      AppImage. Re-check that the CI (ubuntu-22.04-built) binary's `NEEDED` set still matches
      the `depends` above — it was derived from an Arch-built binary.
- [ ] On that pacman install: no update indicator, Settings → Updates shows the
      package-manager note, and **no update HTTP request** is made (watch the network).
- [ ] The AppImage still self-updates end-to-end (check → download → relaunch).
- [ ] A FUSE-less run (`--appimage-extract` + `squashfs-root/AppRun`) starts, and its update
      UI is hidden (no `$APPIMAGE` ⇒ classified `system`, which is correct — there is no
      AppImage file for the updater to replace).
- [ ] macOS + Windows: the update flow is unchanged (indicator → modal → Settings pane).
