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
latency by definition). _(Two further items were listed here and are **both now done**:
Overview terminal virtualization — picked up by #351 (lazy terminal mount) — and
`[profile.release]` tuning — picked up by #358; see the entries below.)_

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

> **Superseded by #347 for the DMA-BUF items above** — the workaround is no longer applied
> on the mere presence of the NVIDIA module, and it now logs one line for **both** outcomes.
> See the next section for the corrected checklist.

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

### DMA-BUF detection regression (Task #347)

Symptom (same hybrid Arch box, Hyprland/Wayland): ReCue was still slow *because of* #346's
own workaround. The boot log said it all —

```
[recue] WebKitGTK: set WEBKIT_DISABLE_DMABUF_RENDERER=1 (nvidia: true, vm: false)
/sys/class/drm/card0 -> driver=nvidia, vendor=0x10de   (RTX 4080 Max-Q, nvidia-open)
/sys/class/drm/card1 -> driver=i915,   vendor=0x8086   (Intel Iris Xe — renders the webview)
```

On a hybrid laptop the NVIDIA card *exists* but the webview renders on the Intel/AMD iGPU
through **Mesa**, where DMA-BUF is healthy. #346's `nvidia_driver_present()` tripped on the
mere presence of the kernel module (`/proc/driver/nvidia/version` / `/sys/module/nvidia`),
so ReCue forced the whole webview to CPU rendering — which then cascaded into software
WebGL (llvmpipe) and xterm's DOM renderer. The "fix" *was* the reported slowness. #346's
`vm_detected()` was equally coarse: the mere existence of `/sys/hypervisor/type` (true on a
bare-metal **Xen dom0**) and loose DMI **substring** matches (`"kvm"`, `"standard pc"` — so
a real `"PowerEdge KVM 1000"` read as a VM).

**The new policy** (`linux_webkit.rs`, the pure `decide_dmabuf` — every rule unit-tested on
every host):

| # | Condition | DMA-BUF | `reason` |
|---|-----------|---------|----------|
| 1 | `WEBKIT_DISABLE_DMABUF_RENDERER` already exported | untouched | `WEBKIT_DISABLE_DMABUF_RENDERER already set by the user` |
| 2 | `RECUE_DISABLE_DMABUF=1` / `=0` | disabled / left on | `RECUE_DISABLE_DMABUF forced on` / `… forced off` |
| 3 | NVIDIA blob loaded **and** GL routed to it (`__GLX_VENDOR_LIBRARY_NAME=nvidia` / `__NV_PRIME_RENDER_OFFLOAD=1`) | disabled | `NVIDIA GL selected via env (PRIME offload)` |
| 4 | NVIDIA blob loaded **and no Mesa card** (incl. an unreadable `/sys/class/drm`) | disabled | `NVIDIA blob driver is the only renderer` |
| 5 | VM **and no Mesa card** | disabled | `virtual machine without a native Mesa GPU` |
| 6 | otherwise (hybrid, nouveau, AMD/Intel, VM w/ passthrough GPU) | **left on** | `Mesa GPU present (healthy DMA-BUF)` / `no known-bad renderer detected` |

The inputs: a GPU inventory from `/sys/class/drm/card*` (DRM driver name → `Mesa` /
`NvidiaBlob` / `Virtual` / `Unknown`, PCI-vendor fallback), the NVIDIA kernel-module flavor
+ version (`nvidia-open` vs the proprietary blob — logged, but they gate identically: both
ship the same proprietary userspace EGL), and a **tightened** VM detector (a Xen **control
domain** is bare metal; DMI is matched **exactly**, not by substring; two independent
signals are required — the CPUID `hypervisor` flag alone or a DMI hit alone is never
enough). Both outcomes now print exactly **one** boot line naming the evidence, e.g.

```
[recue] WebKitGTK: DMA-BUF left on — Mesa GPU present (healthy DMA-BUF)
  (gpus: nvidia[blob],i915[mesa]; nvidia: open 610.43.03; vm: no; session: wayland)
  — override with RECUE_DISABLE_DMABUF=1|0
```

The `RECUE_DISABLE_DMABUF` override is now an explicit tri-state (`RendererOverride::Auto /
ForceDisable / ForceKeep`) so a future Settings → renderer-override card can feed a
persisted mode into the same seam (`resolve_override`) without touching the policy. The
frontend software-WebGL check (`webglRenderer.ts`) is unchanged: it is a **fail-safe** whose
main cause of firing was this very workaround, so on a correctly-detected box it now reads a
hardware renderer and WebGL is used again (`terminalPool` logs the renderer string once).

**Files**: `src-tauri/src/linux_webkit.rs` (detection rewrite + tests), `src-tauri/src/lib.rs`
(call-site comment), `src/components/Terminal/webglRenderer.ts` +
`src/components/Terminal/terminalPool.ts` (comment / one-time diagnostic log).

### Needs real-box verification (DMA-BUF detection, #347)

- [ ] **Hybrid Intel/AMD iGPU + NVIDIA dGPU** (the reporter's Arch box, Wayland): the boot
      line reads `DMA-BUF left on — Mesa GPU present (healthy DMA-BUF)` and names both cards;
      `WEBKIT_DISABLE_DMABUF_RENDERER` is **not** in the app's environment; no "skipping WebGL
      renderer (software rasterizer)" console warning (instead `[recue] terminals: WebGL
      renderer: Mesa Intel(R) Graphics …`); typing echo + paint are snappy.
- [ ] **NVIDIA blob as the only GPU** (desktop, no iGPU): the line reads `DMA-BUF disabled —
      NVIDIA blob driver is the only renderer`, and the app is usable (not blank/crawling).
- [ ] **PRIME offload** on the hybrid box (`__NV_PRIME_RENDER_OFFLOAD=1
      __GLX_VENDOR_LIBRARY_NAME=nvidia npm run tauri dev`): the line reads `DMA-BUF disabled —
      NVIDIA GL selected via env (PRIME offload)`.
- [ ] **AMD-only / Intel-only / nouveau**: `DMA-BUF left on`, no regression vs before.
- [ ] **A VM** (QEMU/KVM, VMware, VirtualBox, Hyper-V — virtio-gpu/vmwgfx display):
      `DMA-BUF disabled — virtual machine without a native Mesa GPU`. A **bare-metal Xen
      dom0** must NOT read as a VM.
- [ ] Overrides: `RECUE_DISABLE_DMABUF=1` / `=0` force the workaround on/off (the line names
      the force), and a user-exported `WEBKIT_DISABLE_DMABUF_RENDERER` is respected untouched
      (`DMA-BUF untouched — … already set by the user`).
- [ ] Ground truth to read the boot line against: `ls /sys/class/drm`,
      `readlink -f /sys/class/drm/card*/device/driver`, `cat /proc/driver/nvidia/version`,
      `cat /sys/class/dmi/id/{sys_vendor,product_name}`.

### AppImage child-process environment (Task #350)

Symptom (Linux **AppImage** only): every process ReCue spawns inherited the AppImage
runtime's environment. The runtime mounts the payload at a transient FUSE mountpoint
(`/tmp/.mount_ReCueXXXXXX`) and its `AppRun` (linuxdeploy + the tauri
`linuxdeploy-plugin-gtk` hook) exports `APPDIR` / `APPIMAGE` / `APPIMAGE_UUID` / `ARGV0` /
`OWD`, forces `GTK_THEME=Adwaita:light` + `GDK_BACKEND=x11`, and prefixes `PATH`,
`LD_LIBRARY_PATH`, `XDG_DATA_DIRS`, `GSETTINGS_SCHEMA_DIR`, `GIO_MODULE_DIR`,
`GDK_PIXBUF_MODULE_FILE`, `GI_TYPELIB_PATH`, … with the mountpoint. None of that is meant
for a child: it is documented to break `xdg-open` (tauri-apps/tauri#10617,
AppImage/AppImageKit#124) and to degrade or break a system binary that then loads the
AppImage's bundled libraries through `LD_LIBRARY_PATH` — i.e. every `claude`/codex agent
PTY, every shell terminal, every `git` shell-out, `xdg-open` and `dbus-send`.

Fix — one shared, pure, unit-tested scrub seam, `src-tauri/src/child_env.rs` (modeled on
`linux_webkit.rs`: compiles on every OS, the real work cfg-gated inside, the decision logic
pure and host-independent so macOS/Windows CI unit-tests it too):

- **Pure core.** `is_appimage_segment` / `filter_segments` / `scrub_env` / `env_diff`. The
  rule is **value-based**, not an exhaustive var list — any `:`-segment under `$APPDIR` (or
  under the `/tmp/.mount_` prefix, for `--appimage-extract-and-run` / an AppRun that only
  exports `APPIMAGE`) is stripped from **any** variable, so a future AppRun's new path vars
  are covered automatically. Marker vars and `APPIMAGE_ORIGINAL_*` bookkeeping are dropped;
  a forced scalar (`GTK_THEME`, `GDK_BACKEND`) is restored from its `APPIMAGE_ORIGINAL_<VAR>`
  backup when one exists, else dropped; a var whose segments were *all* AppImage-owned is
  removed entirely rather than emptied (an empty `LD_LIBRARY_PATH` segment means CWD to the
  loader) — except `PATH`, which is on a `NEVER_UNSET` list and keeps its original value.
- **Wiring.** `pty.rs::spawn_with_id` copies `child_env::child_env_vars()` into the
  `CommandBuilder` (still setting `TERM=xterm-256color` after) — agent PTYs *and* the #72
  shell terminals; `git::hidden_command` applies `child_env::scrub_command` (every `git`
  shell-out + every `<cli> --version` probe); `commands.rs`'s `os_open` / `open_url` /
  `reveal_file_in_finder` / `reveal_file_linux` (`dbus-send` + `xdg-open`) build their
  `Command` via `child_env::command`; and `path_env`'s login-shell PATH probe does the same.
- **Byte-for-byte no-op elsewhere.** The scrub arms **only** when `APPDIR` or `APPIMAGE` is
  set, so macOS, Windows and a non-AppImage Linux build (dev, `.deb`, pacman) are unchanged:
  `child_env_vars()` is exactly `std::env::vars_os()` there, and `scrub_command` makes
  **zero** `env`/`env_remove` calls when the diff is empty. `WEBKIT_DISABLE_DMABUF_RENDERER`
  (#346, ReCue's own webview) is deliberately **not** stripped.

**Files**: `src-tauri/src/child_env.rs` (new), `src-tauri/src/lib.rs` (module),
`src-tauri/src/pty.rs`, `src-tauri/src/git.rs`, `src-tauri/src/commands.rs`,
`src-tauri/src/path_env.rs`.

### Needs real-box verification (AppImage env scrub, #350)

- [ ] A ReCue shell terminal's `env` carries no `APPDIR`/`APPIMAGE`/`OWD`/`ARGV0`/
      `GTK_THEME`/`GDK_BACKEND` and no `/tmp/.mount_` segment in `PATH` / `XDG_DATA_DIRS` /
      `LD_LIBRARY_PATH`.
- [ ] `xdg-open` from inside a ReCue terminal, the Ctrl-click link open, "Reveal in File
      Manager", and Settings → Data → "Open data folder" all work under the AppImage.
- [ ] A `claude` agent spawns, runs its tools, and `git` works inside it (no dynamic-loader
      / symbol errors).
- [ ] GTK apps launched from a ReCue terminal use the user's own theme (no forced
      `Adwaita:light`).
- [ ] ReCue's own window/dialogs are visually unchanged (the app process env is untouched).

### Performance: lazy-mounted Overview terminals (Task #351)

Closes the "Overview terminal virtualization" future-work item left open by #346 — the
single biggest remaining WebKitGTK boot cost. Overview's wall used to mount **every**
session's terminal at boot even though only ~3 cards fit on screen: each `createHost`
constructs an XTerm, opens its own WebGL context, fetches up to 256 KB of scrollback over
a **sync** main-thread command, ANSI-parses it, awaits three font loads and does a resize
IPC. Ten resumed agents = ten eager hosts racing on the one WebView main thread, so nothing
painted until all ten finished. Two changes, both pure WebView/TS (no Rust, no OS
primitives, no `#[cfg]` arm — identical on macOS/Windows/Linux, biggest win on WebKitGTK):

- **Visibility-gated creation.** `Terminal.tsx` calls `mountTerminal` only once its wrapper
  first intersects — a **latching** IntersectionObserver (`useVisibleOnce.ts`; starts `true`
  when `IntersectionObserver` is undefined, so the fallback is never worse than before). The
  observer root comes from a `TerminalScrollRootContext` that **Overview** fills with its
  horizontally scrolling wall: IntersectionObserver clips a target against every intermediate
  scroll container *before* applying `rootMargin`, so a viewport-rooted observer could never
  pre-load a card scrolled out of `overflow-x: auto` — the 600px horizontal margin would be
  dead. Elsewhere the context is `null` ⇒ the viewport root (right for Canvas panels, big
  mode #157, detached windows #84). Only **creation** is deferred: a host is still never
  disposed or recycled on scroll-out / view switch (the #18 invariant — a re-replay at a
  different width garbles claude's cursor-positioned TUI). Nothing is lost, because
  `outputBus` already drops chunks for a session with no listener (the normal state today for
  any session not in the current view), the backend `Scrollback` retains them, and
  `replayDedupe.ts` drops the scrollback↔live overlap by absolute offset at creation.
- **Serialized scrollback replays.** The hydration (fetch + initial `term.write`, awaited via
  its write callback) runs through a bounded FIFO queue (`replayQueue.ts`,
  `MAX_CONCURRENT_REPLAYS = 1`) that yields a macrotask between jobs, so several cards
  becoming visible in one frame no longer stack N × (IPC + 256 KB ANSI parse) on the main
  thread — the first terminal paints as fast as a single replay and input echo stays
  responsive while the rest fill in. The pre-replay live buffer is byte-capped
  (`pendingOutput.ts`) only until the fetch is dispatched (those bytes are all ≤ the
  snapshot's `end`, so dropping them can never leave a hole); after dispatch every byte is
  kept for the dedupe. A short-lived pending-focus keeps ⌘/Ctrl+1–9 → type-immediately
  working when the gate creates the host a frame later.
  **Files**: `src/components/Terminal/{useVisibleOnce.ts,replayQueue.ts,pendingOutput.ts}`
  (new, the last two pure + unit-tested), `src/components/Terminal/terminalPool.ts`,
  `src/components/Terminal/Terminal.tsx`, `src/components/Overview/Overview.tsx`.

Rollback is two single-constant reverts: `useVisibleOnce` returning `true` immediately
restores eager mounting, `MAX_CONCURRENT_REPLAYS = Infinity` restores parallel replays.

### Needs real-box verification (performance, #351)

- [ ] Release AppImage on Linux/WebKitGTK with ~10 resumed agents, booting into **Overview**:
      `document.querySelectorAll(".xterm").length` ≈ the visible-card count (not 10), and the
      first visible terminals paint noticeably sooner than before.
- [ ] Scrolling the wall right fills each revealed card in **once** — history intact, no
      duplicated startup paint / stray glyph; scrolling back and forth never re-replays.
- [ ] Overview → Canvas → Overview reparents (no re-created terminal, no scrollback repaint).
- [ ] Typing into a busy agent stays responsive while another card hydrates (the queue's
      macrotask yield between replays).
- [ ] ⌘/Ctrl+E big mode on a never-mounted card paints its terminal; a Canvas tab switched to
      with Ctrl+1–9 takes keystrokes immediately (pending-focus).

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

**Interaction with the #356 code-split.** `App.tsx` is now a `Suspense` router over two
**lazy** route chunks (`MainApp` / `CanvasWindow`), so "React has committed its first
frame" is ambiguous: a still-pending boundary commits its *fallback*, not the route. The
reveal trigger therefore sits **inside** the boundary as a sibling of the route
(`RevealOnPaint` → `useRevealWindow`), so it fires only once the route chunk has actually
mounted — never on the empty fallback frame. It cannot deadlock the window shut: a chunk
that never loads simply never reveals, and the Rust 2 s fallback shows the window anyway
(and what it would then show is #356's themed `div.app` fallback, not a white canvas).

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
      With #356's lazy route chunk this also confirms the chunk fetch (a local `tauri://`
      asset read) is not adding a visible delay before the reveal.
- [ ] **Reveal fallback**: with the Vite dev server stopped (or a deliberately broken
      bundle), the window still appears within ~2 s instead of never showing.
- [ ] **Runtime theme switch**: switch Dark↔Light, Save, then resize the window quickly —
      any exposed native gutter is the **new** theme color.
- [ ] Confirmed on **Arch**, **Ubuntu**, and **Mint** (the fully-supported distros), on
      both Wayland and X11.

### Bounded-parallel boot resume (#355)

Boot resume now reconnects persisted sessions **4 at a time** (`src-tauri/src/boot.rs`,
`RESUME_CONCURRENCY`) over **one** shared snapshot of `~/.claude/projects`
(`title::ProjectLogIndex`) instead of one-at-a-time with a per-session directory rescan.
Pure `std::thread` + `std::fs` — no OS-specific code — so Linux inherits it unchanged; the
only Linux-flavored consideration is that 4 concurrent `fork`/`exec` + reader threads now
land while WebKitGTK is still doing its first paint (kept small for exactly that reason,
cf. #346). The resumed PTYs still spawn through `pty::spawn_with_id`, so they inherit the
#350 AppImage env scrub (`child_env::child_env_vars`) unchanged; the loop runs on its own
`std::thread` (not the async runtime), so it never blocks the #353 `spawn_blocking` command
path either.

### Needs real-box verification (boot resume, #355)

- [ ] On Arch/Ubuntu/Mint with ≥8 persisted agents: every terminal reconnects (visibly faster
      than before), each shows its own scrollback exactly once (no duplicate/missing output, no
      stray glyph), no wall of exit toasts, busy dots settle normally.
- [ ] Under the release **AppImage**, the 4 concurrently-resumed agents still get the scrubbed
      child env (#350) — no `/tmp/.mount_…` segments leak into an agent's `PATH`/`LD_LIBRARY_PATH`.
- [ ] The bounded-parallel resume does not delay the #348 window reveal (the window still
      appears promptly, not after the 2 s Rust fallback).

### `[profile.release]` tuned — smaller binary, faster AppImage cold start (Task #358)

The crate had **no `[profile.release]` section at all** (no workspace root manifest, no
`.cargo/config.toml`, no `RUSTFLAGS` in either workflow), so release builds ran on Cargo's
stock defaults: `opt-level = 3`, **no LTO** (16 codegen units), **unstripped** symbols. Every
bundle carried that bloat, and the **AppImage pays for it at every launch** — its squashfs
image is decompressed / paged in on cold start (a known Tauri+AppImage cost,
tauri-apps/tauri discussions #11157). `src-tauri/Cargo.toml` now carries a heavily-commented
profile:

```toml
[profile.release]
lto = true            # cross-crate LTO across tauri/wry/portable-pty/ureq/serde
codegen-units = 1     # no cross-unit duplication, best inlining
opt-level = "s"       # optimize for size (see the benchmark note below)
strip = true          # drop the symbol table (no symbolication pipeline depends on it)
# panic stays "unwind" — deliberately. See below.
```

- **`panic = "abort"` is deliberately rejected** (the one item of Tauri's stock size
  recommendation this skips), and the manifest says so in a block comment so nobody
  "completes the recommendation" later. ReCue supervises many long-lived PTY sessions from
  always-running threads — the per-session reader (`pty.rs reader_loop`), the busy/idle
  monitor, the title worker, the event forwarder, and the schedule/recurring poll loop
  (`lib.rs`). Under `panic = "unwind"` a panic in any of them (including one thrown from
  inside a dependency) kills **only that thread**; the process, every other live agent, and
  every detached canvas window survive — and the backend is written for exactly that (there
  is **not one** `lock().unwrap()` in the tree; every mutex take handles a poisoned lock).
  Under `panic = "abort"` the same panic takes the whole app down and every live session with
  it — traded for the *smallest* of the four size levers (unwind tables, typically ~5–10%).
- **Build-time cost is confined to `release.yml`.** The PR gate (`ci.yml`) runs clippy /
  `cargo test` / `llvm-cov` on the **dev/test** profiles and `npm run tauri dev` uses the dev
  profile, so neither is affected. `release.yml` (only on a version bump) pays fat-LTO link
  time for **four Rust binaries serially** (`max-parallel: 1` × macOS-universal = 2 targets,
  Windows, Linux), and the first post-merge release run rebuilds deps cold (the profile change
  busts `Swatinem/rust-cache`). Documented fallback if a leg OOMs or the pipeline gets
  painful: **`lto = "thin"`** — one word, keeps most of the win for ~a third of the link cost.
- **Rollback** is deleting the block; nothing else changed. The only source change is the
  test-only `pty::tests::bench_output_hot_path` (below).

**`opt-level = "s"` vs `3` — the benchmark.** `pty.rs`'s `#[cfg(test)] mod tests` gained an
`#[ignore]`d `bench_output_hot_path`, which measures the three CPU-bound stages of the PTY
output path (the only work between a PTY `read()` and the `session://output` emit):
`Scrollback::push` → `coalesce_output_events` (#346) → `commands::encode_output` (#261), over
64 MB of synthetic output in 8 KB chunks:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --release \
  -- --ignored --nocapture bench_output_hot_path      # run ~5x, take the median per stage
```

**Decision rule** (applied, not re-derived): ship `opt-level = "s"` unless it is **>15% slower
on the aggregate** *and* some stage drops below **~200 MB/s**. A busy `claude` TUI repaint
storm produces single-digit MB/s (and #261/#346 already moved the expensive part — the WebView
`JSON.parse` and the per-8 KB emit — off the critical path), so any stage at ≥200 MB/s is
nowhere near a bottleneck, and size is what this profile buys. **The implementer's box could
not run the benchmark** (see below), so the rule's documented fallback applies: **`"s"` ships.**

#### Measurement pending real-box verification (#358)

The implementing box has **no `webkit2gtk-4.1` / `javascriptcoregtk-4.1` system libraries**
(`cargo check` fails identically on untouched `main` — a pre-existing environment gap), so it
**cannot link** a Rust binary: no `cargo build --release`, no AppImage bundle, no `cargo test`,
and therefore **no size numbers and no benchmark numbers**. Nothing is estimated here on
purpose — the figures below are to be **filled in from a real run**, not guessed. (What *was*
verified: `cargo fmt --check` and `cargo clippy --all-targets -- -D warnings` are green, so the
manifest parses and the benchmark test compiles warning-free.)

- [ ] **Baseline (stash the `[profile.release]` block, or check out `main`), then tuned:**

      ```bash
      npm ci && npm run build                       # tauri-build embeds ../dist
      cargo clean --manifest-path src-tauri/Cargo.toml
      /usr/bin/time -v cargo build --release --manifest-path src-tauri/Cargo.toml 2>&1 \
        | grep -E 'Maximum resident|Elapsed'
      ls -l src-tauri/target/release/recue                       # binary bytes
      npm run tauri build -- --bundles appimage
      ls -l src-tauri/target/release/bundle/appimage/*.AppImage  # AppImage bytes
      ```

      Record: binary before/after + % delta (the acceptance target is **≥ 25% smaller**),
      AppImage before/after, clean-build wall time and peak RSS before/after.
- [ ] **`opt-level` benchmark table**: median MB/s per stage (`push` / `coalesce` / `encode`)
      for **both** `"s"` and `3`, 5 runs each. If `"s"` trips the decision rule above, flip the
      manifest to `opt-level = 3` and note it here — the `lto` + `codegen-units = 1` + `strip`
      size win still lands either way.
- [ ] **Functional smoke on the built AppImage** (LTO is precisely the setting that surfaces
      latent UB, so exercise the real PTY path, not just the file size): launch it, spawn a
      `claude` session, type (echo is immediate), watch the busy dot go blue → yellow, open a
      git-diff panel and a file, quit cleanly, relaunch → the session resumes. Note
      (subjectively) whether cold start is faster than the baseline AppImage — on Arch, Ubuntu
      and Mint.
- [ ] **macOS release leg** (`release.yml` only): the **universal** build does two sequential
      fat-LTO links on the arm64 runner (~7 GB RAM) — confirm it neither OOMs nor times out,
      and that the signed `.app` still passes the workflow's `codesign` assertions (strip runs
      at link, long before signing, so it *should* be a non-event — #292/#314/#321).
- [ ] **Windows release leg**: the MSVC build links under LTO and the NSIS/MSI installer still
      installs + runs (`strip` is near-free there — release emits no PDB).

**Files**: `src-tauri/Cargo.toml` (the profile), `src-tauri/src/pty.rs` (the `#[ignore]`d
benchmark test only — no production-code change), `TRAJECTORY_TO_WINDOWS.md`, `CLAUDE.md`.

### WebGL context loss (Task #364)

Platform-neutral code (pure WebView/xterm — no native, path, or shell call), but it **fires**
overwhelmingly on Linux/WebKitGTK, where a GPU under memory pressure, a driver reset, or a
suspend/resume can revoke a live WebGL context. The pool's `onContextLoss` handler now disposes
the addon (xterm falls back to its DOM renderer and re-lays-out the **same** buffer — the #18
pooled terminal is never remounted and no scrollback is replayed), clears its own addon
reference so the #221 font-atlas rebuild can't call into a disposed renderer, and **latches**
the window: no terminal in it re-attaches WebGL for the rest of the run (a sick driver that
dropped one context drops the next one too — retrying is a context storm). The latch lives in
the pure, unit-tested `src/components/Terminal/webglFallback.ts`.

This is the one path that **cannot be exercised on CI** — a context loss needs a real GPU +
WebView. Force one from the webview devtools console (`WEBGL_lose_context` is the standard
extension for exactly this; the #346 renderer probe already uses it):

```js
document.querySelectorAll("canvas").forEach((c) => {
  const gl = c.getContext("webgl2") || c.getContext("webgl");
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
});
```

#### Needs real-box verification (context loss, #364)

- [ ] **Loss recovery**: with 2+ agents open and painted, force the loss above and wait ~3s (the
      addon's restore window). Every terminal still shows its content — no clear, no scrollback
      replay, no garbled TUI — and typing still echoes into `claude`. The `<canvas>` elements are
      gone from `.xterm-screen` (the DOM renderer is in force).
- [ ] **Warned once**: exactly **one** `[recue] terminals: WebGL context lost and not restored …`
      line in the console, no matter how many terminals lost their context.
- [ ] **Latched**: a **newly spawned** agent (and a Restart-recreated one) gets **no** WebGL
      canvas and logs no further warning.
- [ ] **Still reflows**: switching Overview ↔ Canvas and resizing the window reflows the
      fallen-back terminals normally (no remount, no replay).
- [ ] Regression, on each OS: a main-window terminal still creates a WebGL canvas at startup on
      macOS/Windows and on a hardware-GL Linux box; a detached canvas window (#84/#105) and a
      software-rasterizer Linux box (#346) still have none.


### UI font: bundle Inter Variable (latin), applied Linux-only (#363)

**The bug.** `tokens.css`'s one UI stack is
`--ui: -apple-system, "SF Pro Text", ui-sans-serif, system-ui, sans-serif`. On macOS
`-apple-system` wins (San Francisco); on Windows `system-ui` wins (Segoe UI). On **Linux**
neither Apple entry resolves and `ui-sans-serif` is not a WebKit generic, so the UI lands on
whatever `system-ui` / `sans-serif` resolve to through **fontconfig** — a per-distro, per-box
lottery. Measured on the reporting Arch box: the only installed sans faces are **Adwaita
Sans**, **Adwaita Mono** and **FreeSans** (no Inter / Cantarell / Ubuntu / Noto Sans / DejaVu
Sans), `fc-match sans-serif` → **FreeSans**, and the GTK UI font
(`org.gnome.desktop.interface font-name`) is **`JetBrainsMono Nerd Font 12`** — i.e. if
WebKitGTK maps CSS `system-ui` to the GTK font setting, the entire UI was rendering in a
**monospace** face. That alone explains "reads noticeably worse than macOS/Windows".

**The fix.**

- **Bundled the face, offline** (never a CDN, like JetBrains Mono):
  `@fontsource-variable/inter` (OFL-1.1) with a **hand-written** `@font-face` in
  `src/styles/fonts.css` naming only the **latin** subset — one **48,256 B** woff2, versus the
  **218,512 B** all-seven-subsets that `import "@fontsource-variable/inter"` would emit. One
  variable file covers the 400/500/600 weights the UI actually uses with real (non-synthetic)
  weights. `format("woff2")` (not fontsource's `woff2-variations` hint) so an engine without
  variable-font support renders the default instance instead of skipping the `src`. The latin
  `unicode-range` is copied verbatim, so non-latin codepoints skip the face and fall through
  to system faces — no tofu.
- **Applied Linux-only** via a new `:root[data-platform="linux"]` `--ui` override. The shared
  `:root --ui` line is **not touched**: there is no single ordering that works for both OSes —
  prepending Linux faces before `system-ui` would silently steal **Windows** (a dev box with
  Inter installed would stop rendering Segoe UI), and appending them after it is a **no-op on
  Linux** (the generic always resolves to *something*). A platform-scoped override is the only
  correct shape. Listing system faces *without* bundling would also have been a no-op on the
  very box that reported the bug (none of Inter/Cantarell/Ubuntu/Noto Sans is installed there).
- **A new frontend seam: `data-platform` on `<html>`** (`detectPlatform` /
  `applyPlatformAttribute` in `src/platform.ts`, written from `main.tsx` **before**
  `createRoot().render()`). It must be **synchronous** — the store's `platform` signal is an
  async IPC and would flip the font mid-boot — so it is read from the WebView's own UA
  (Windows and macOS patterns checked *before* Linux so their strings can't be mistaken for
  it). Mirrors the `data-theme="light"` attribute (#333). The main window and a detached
  canvas window (#84) load the same entry, so both get it; `store.ts` re-applies the
  authoritative backend value when it lands (a no-op in practice).
- **Zero cost off Linux:** a `@font-face` file is fetched lazily, only when an element
  actually resolves to the family. macOS/Windows never name `Inter Variable`, so the woff2 is
  never fetched or decoded — it only occupies 47 KB inside the bundle. Verified: `npm run
  build` emits exactly one `inter-latin-wght-normal-*.woff2` at **48,256 B**, taking the total
  woff2 payload from 116,076 B to **164,332 B**.

A user-facing "use my desktop UI font" opt-out (Settings → Appearance) is a plausible
follow-up — deliberately out of scope here; today Linux gets ReCue's deterministic face.

### Needs real-box verification (UI font, #363)

- [ ] **Linux (Arch/Ubuntu/Mint, `npm run tauri dev` and the AppImage):** `<html>` carries
      `data-platform="linux"`; `body`'s computed `font-family` starts with `Inter Variable`;
      the Network tab shows one `inter-latin-wght-normal-*.woff2` from the app origin
      (`tauri://localhost`), **never** a CDN; the sidebar / Overview / Settings visibly render
      in Inter rather than FreeSans/DejaVu/the GTK mono face. Confirms WebKitGTK's variable-font
      support (worst case on an ancient engine: the 400 instance renders, bold is synthesized —
      still Inter).
- [ ] **Linux, non-latin text:** a CJK/Cyrillic filename in the file tree still renders (falls
      through the `--ui` tail) — no tofu boxes.
- [ ] **Linux, detached canvas window (#84):** it renders in Inter too (same entry point).
- [ ] **macOS / Windows (the "unchanged" claim):** `<html>` carries `data-platform="macos"` /
      `"windows"`, `body` computes to the unchanged `-apple-system …` stack (San Francisco /
      Segoe UI), and **no** `inter-*.woff2` request appears in the Network tab — including on a
      Windows box that has **Inter installed system-wide**.
