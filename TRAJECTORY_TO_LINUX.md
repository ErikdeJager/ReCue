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
      _(partial — see the #365 walk: **Arch ✓**, proven with the **published CI** AppImage, so the
      ubuntu-22.04 → current-Arch floor holds; `libfuse2` was **not** needed (libfuse3 runtime).
      Ubuntu/Mint still to walk.)_
- [ ] A `claude` session **spawns** (PTY inherits the session `$SHELL`; `claude` on PATH via
      the login-shell probe from a `.desktop`/AppImage launch).
      _(partial — see the #365 walk: the login-shell probe was caught running **inside the
      AppImage** and resolved a clean PATH containing `claude`; the agent-PTY half needs the GUI
      → maintainer checklist M1.)_
- [ ] **`xdg-open`** opens the browser on a ⌘/Ctrl-click URL and opens folders for
      "Reveal in File Manager" (repo) and Settings → Data "Open data folder".
      _(partial — see the #365 walk: both `xdg-open` invocations verified live on Arch (Brave +
      Thunar); driving them from the app needs the GUI → M2.)_
- [ ] **`reveal_file_in_finder`** highlights the file via `FileManager1.ShowItems` on each DE
      (GNOME/Nautilus, KDE/Dolphin, Cinnamon/Nemo → Mint, Xfce/Thunar), else opens the parent
      folder.
      _(partial — see the #365 walk: **Xfce/Thunar verified** (method reply, file selected);
      GNOME/Nautilus, KDE/Dolphin, Cinnamon/Nemo untested — no such DE on the tested box.)_
- [ ] Keyboard hints render **Ctrl+…** (not ⌘) and "Reveal in File Manager".
      _(partial — see the #365 walk: the pure logic is proven by `src/platform.test.ts`; the
      on-screen rendering needs the GUI → M3.)_
- [ ] **Native notifications** (libnotify / D-Bus) fire on the #336 watch feature.
      _(partial — see the #365 walk: the D-Bus service is activatable and `notify-send` delivers a
      visible toast on Arch/Hyprland; the app's watch → toast path needs the GUI → M4.)_
- [ ] **Clipboard image paste** (`save_clipboard_image`) works under X11 and Wayland.
      _(partial — see the #365 walk: both backends are compiled in and the **Wayland** clipboard
      round-trips an image byte-exact; the Ctrl+V path needs the GUI → M5. **X11 untested — no X11
      session on the tested box.**)_
- [ ] The **in-app updater** recognizes the AppImage (`linux-x86_64` in `latest.json`) and
      relaunches after applying.
      _(partial — see the #365 walk: `latest.json` carries a signed `linux-x86_64` AppImage entry,
      and `$APPIMAGE` survives in the app's own env (the #350 regression check); the actual
      self-update needs a published N+1 → M10.)_

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
      _(N/A — **superseded by #347**: that log line no longer exists, and the tested box is hybrid,
      not NVIDIA-only. Walk the #347 checklist's D1/D2 instead.)_
- [ ] **AMD + Wayland** and **Intel + Wayland**: DMA-BUF is left **on** (~~no log line~~ — post-#347
      there is **always** exactly one boot line, for both outcomes), no regression vs before.
      _(partial — see the #365 walk: the **Intel** half is verified as the Mesa GPU of a hybrid
      Intel+NVIDIA box (DMA-BUF left on). **AMD untested — no AMD GPU on the tested box.**)_
- [x] `RECUE_DISABLE_DMABUF=1` / `=0` force the workaround on/off; a user-exported
      `WEBKIT_DISABLE_DMABUF_RENDERER` is respected untouched.
      — verified on Arch/Hyprland (Wayland), hybrid Intel+NVIDIA, 2026-07-14 (#365); all three
      boot lines quoted verbatim in the walk. Environment-independent (same code path on any box).
- [ ] On a box where WebGL is software (llvmpipe — e.g. NVIDIA without working GL in the
      webview): the console logs the "skipping WebGL renderer" warning, terminals use the
      DOM renderer, and input echo is responsive.
      _(blocked — see the #365 walk, finding **F4**: WebKitGTK does **not** forward the webview
      console to stderr, so this warning is unreadable from a terminal. Needs the WebKit
      inspector → M8.)_
- [ ] Release AppImage under a busy `claude` TUI (many parallel agents): display updates
      stay smooth and typing stays responsive (coalescing + b64 scrollback in effect);
      scrollback replays correctly after a view switch and after a session Restart.
      _(blocked — GUI + subjective. Protocol written out as maintainer step M9 in the #365 walk.)_

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
      _(partial — see the #365 walk: the **boot line is verified** on Arch/Hyprland, both for a
      fresh install (`recue theme: unset`) and a persisted `theme:"dark"` — and it confirms the
      AppRun really does force `Adwaita:light` first. The **dialogs rendering dark** needs the GUI
      → M7; Ubuntu/Mint and GNOME/KDE/Cinnamon/X11 untested — not this box.)_
- [ ] **AppImage, ReCue theme = Light**: after Settings → Appearance → Light → Save → quit →
      relaunch, `GTK_THEME=Adwaita:light` and the same three dialogs render light.
      _(partial — see the #365 walk: with a persisted `theme:"light"` the **effective**
      `GTK_THEME` is `Adwaita:light`. Note there is correctly **no** `[recue] GTK:` line in this
      case: the AppRun's forced value already equals the target and the policy only logs when it
      changes the value. Dialogs need the GUI → M7.)_
- [x] **Overrides honored**: `APPIMAGE_GTK_THEME=Adwaita:dark ./ReCue*.AppImage` (no ReCue
      override line logged) and `RECUE_GTK_THEME=<theme>` win over the policy.
      — verified on Arch/Hyprland (Wayland), 2026-07-14 (#365), with values chosen so they cannot
      coincide with the default: `RECUE_GTK_THEME=HighContrast` → forced verbatim;
      `APPIMAGE_GTK_THEME=Adwaita:light` → **no** ReCue line and **not** clobbered to dark.
      Environment-independent (pure env policy).
- [ ] **Non-AppImage run** (`npm run tauri dev`, a distro package): `GTK_THEME` is left
      untouched (no `[recue] GTK:` line) and dialogs follow the desktop theme;
      `RECUE_GTK_THEME=Adwaita:dark npm run tauri dev` makes them dark (the AppImage-free
      smoke test).
      _(partial — see the #365 walk: the **env half is verified** against the raw (non-AppImage)
      release binary — no `[recue] GTK:` line and `GTK_THEME` unset; with `RECUE_GTK_THEME=Adwaita:dark`
      it is forced. "Dialogs follow the desktop theme" needs the GUI → M7.)_

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
      _(partial — see the #365 walk. **The first two clauses PASS on exactly this box** (Arch/
      Hyprland, Intel i915 + NVIDIA-open 610.43.03): the boot line reads `DMA-BUF left on — Mesa
      GPU present (healthy DMA-BUF) (gpus: nvidia[blob],i915[mesa]; nvidia: open 610.43.03; vm: no;
      session: wayland)`, every field matching `/sys` ground truth, and `WEBKIT_DISABLE_DMABUF_RENDERER`
      is absent from the app's env — **#347 is confirmed fixed**. The WebGL-console clause is
      **unreadable from a terminal** (finding **F4**) and "snappy" is subjective → both go to the
      GUI checklist (M8, M9).)_
- [ ] **NVIDIA blob as the only GPU** (desktop, no iGPU): the line reads `DMA-BUF disabled —
      NVIDIA blob driver is the only renderer`, and the app is usable (not blank/crawling).
      _(N/A — not this box: the tested machine is a hybrid laptop; it has no NVIDIA-only
      configuration. Still to walk on a desktop with a single NVIDIA card.)_
- [x] **PRIME offload** on the hybrid box (`__NV_PRIME_RENDER_OFFLOAD=1
      __GLX_VENDOR_LIBRARY_NAME=nvidia npm run tauri dev`): the line reads `DMA-BUF disabled —
      NVIDIA GL selected via env (PRIME offload)`.
      — verified on Arch/Hyprland (Wayland), the real hybrid Intel+NVIDIA box, 2026-07-14 (#365):
      the line reads exactly `DMA-BUF disabled — NVIDIA GL selected via env (PRIME offload)
      (… nvidia: open 610.43.03, GL routed to nvidia; …)` — for both vars together **and for each
      one alone**.
- [ ] **AMD-only / Intel-only / nouveau**: `DMA-BUF left on`, no regression vs before.
      _(N/A — not this box: no AMD GPU, no nouveau, and the Intel iGPU is only present as half of a
      hybrid pair. The hybrid case is covered above.)_
- [ ] **A VM** (QEMU/KVM, VMware, VirtualBox, Hyper-V — virtio-gpu/vmwgfx display):
      `DMA-BUF disabled — virtual machine without a native Mesa GPU`. A **bare-metal Xen
      dom0** must NOT read as a VM.
      _(N/A — not this box: bare metal, zero VM signals (no `/sys/hypervisor/type`, no CPUID
      hypervisor flag, DMI = ASUSTeK ROG). The detector correctly reports `vm: no`.)_
- [x] Overrides: `RECUE_DISABLE_DMABUF=1` / `=0` force the workaround on/off (the line names
      the force), and a user-exported `WEBKIT_DISABLE_DMABUF_RENDERER` is respected untouched
      (`DMA-BUF untouched — … already set by the user`).
      — verified on Arch/Hyprland (Wayland), 2026-07-14 (#365); all three boot lines quoted
      verbatim in the walk. Environment-independent (pure env policy).
      **Instrument caveat (finding F3):** do **not** try to confirm the resulting
      `WEBKIT_DISABLE_DMABUF_RENDERER=1` in `/proc/<pid>/environ` — that file is the *exec-time*
      snapshot and never shows a variable the process `setenv()`s itself. Read `env` in a ReCue
      shell terminal instead. `/proc/<pid>/environ` **is** valid for the *negative* (the var absent
      at exec, which is what the hybrid box above asserts).
- [x] Ground truth to read the boot line against: `ls /sys/class/drm`,
      `readlink -f /sys/class/drm/card*/device/driver`, `cat /proc/driver/nvidia/version`,
      `cat /sys/class/dmi/id/{sys_vendor,product_name}`.
      — collected on Arch/Hyprland, 2026-07-14 (#365) and reproduced in the walk's Box-under-test
      block. `scripts/linux-verify.sh`'s `B-gpu` check now prints this ground truth **and** predicts
      `decide_dmabuf`'s outcome on any box, so the boot line can be diffed against it directly.

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
      _(partial — see the #365 walk: **two of the three scrub seams are proven live under the
      AppImage** by snapshotting the app's real children — `child_env::command()` (the login-shell
      PATH probe) and `scrub_command()` (`claude --version` / `opencode --version`) both ran with
      none of those vars, no `LD_LIBRARY_PATH`, `XDG_DATA_DIRS=/usr/share`, and a `PATH` free of
      `/tmp/.mount_`. The **PTY seam** (`child_env_vars()` → an actual shell terminal) is the one
      this box literally names and needs one GUI panel → M6, where `npm run verify:linux`'s
      `env-appimage` check asserts exactly this.)_
- [ ] `xdg-open` from inside a ReCue terminal, the Ctrl-click link open, "Reveal in File
      Manager", and Settings → Data → "Open data folder" all work under the AppImage.
      _(blocked — needs the GUI → M2. The standalone `xdg-open` / `dbus-send` calls do work on this
      box with a clean env (see checklist A's A3/A4 notes).)_
- [ ] A `claude` agent spawns, runs its tools, and `git` works inside it (no dynamic-loader
      / symbol errors).
      _(partial — see the #365 walk: the app spawned `claude --version` under the AppImage with a
      **fully scrubbed** env (no `LD_LIBRARY_PATH` — exactly the dynamic-loader failure class this
      box guards). A full agent + its tools + `git` needs the GUI → M6.)_
- [ ] GTK apps launched from a ReCue terminal use the user's own theme (no forced
      `Adwaita:light`).
      _(partial — see the #365 walk: the scrubbed children carry **no `GTK_THEME` at all** (dropped,
      as no `APPIMAGE_ORIGINAL_GTK_THEME` backup existed), so a GTK app falls back to the user's own
      theme. Actually launching one needs the GUI → M6.)_
- [x] ReCue's own window/dialogs are visually unchanged (the app process env is untouched).
      — verified on Arch/Hyprland (Wayland), locally built AppImage, 2026-07-14 (#365): the app's own
      `/proc/<pid>/environ` still carries `APPDIR` / `APPIMAGE` / `GTK_THEME` / `GDK_BACKEND` / the
      `/tmp/.mount_…` `LD_LIBRARY_PATH`, and WebKit's helper processes (`WebKitNetworkProcess`,
      `WebKitWebProcess`) inherit the **full** AppImage env — so the webview still loads its bundled
      libraries, and the window renders. Scope: the mechanism (#350 scrubs *children only*, never the
      app itself) is proven end-to-end; a pixel-level dialog inspection is on the maintainer list (M7).

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

> **All five boxes below are `BLOCKED — needs maintainer at the GUI`** (the #365 walk): each needs
> ~10 resumed agents, on-screen scrolling, and a devtools console. None is reachable from a
> terminal — the webview console does not reach stderr (finding **F4**). They are written out as a
> single scripted protocol, **maintainer step M9**, whose verdict is pinned to the build it refers
> to (Tasks #351/#353/#355/#356 all move these numbers).

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

### Boot IPC batching (Task #352)

Boot used to be **~22 sequential IPC waves (34 invokes)** — 13 event-listener `listen`
registrations awaited one at a time, then `platform`, then `windows_build`, then two
`Promise.all` batches, then five more serial singles — and **16 of those waves gated the
first meaningful paint**, so the window sat on "No active sessions" / "No repositories yet."
while they drained. Each round-trip is an **evaluate-JS hop on the webview main thread**
(the same cost model as #346's coalesced emits), which is **costliest on WebKitGTK**, so a
Linux boot paid the waterfall hardest.

- **One aggregated `boot_state` command** (`commands.rs`: `BootState` + the pure
  `boot_state_from`, registered in `lib.rs`) returns every slice the boot needs — sessions,
  recents, repo colors, Overview panels/order, legacy open files, canvas layout/tabs/
  templates, settings, sidebar width/collapsed, folder order, diff-seen, schedules,
  recurrings, last + running version, platform, Windows build, detached canvas ids. Every
  `Store` getter is an in-memory clone under one mutex (no disk I/O); the only real work is
  the Windows `cmd /C ver` probe, which runs on the blocking pool and is awaited **before**
  any store lock (so no `MutexGuard` is ever held across an `await`). Purely additive: all
  21 individual commands stay registered for their other call sites, and a Rust unit test
  asserts each `boot_state_from` field equals what its individual getter returns.
- **The 13 `listen` registrations now go out as one parallel wave** (`Promise.all` inside
  each `subscribe*Events` helper + across the four helpers in `store.init()`), racing the
  single `boot_state` fetch. The **apply** is still strictly sequenced after the
  subscription await — a live `session://output` / `session://exited` must never land before
  its handler exists — so the window in which an event can arrive un-handled *shrinks* from
  ~16 round-trips to ~1.
- **One `set()`** (`store.applyBootState`) turns the payload into state, so `platform` /
  `windowsBuild` land in the **same** store update as `sessions` — the terminal pool reads
  them at host-creation time (`webglAllowed()` (#346) / `windowsPtyOption()`), and rendering
  `sessions` is what leads to those hosts (since #351, on first *visibility* — which only
  widens the margin). It also re-applies the `data-platform` attribute (#363) from the
  authoritative backend value, the step `init` used to do after its own `platform()` call.
- **No empty-state flash:** a `booted` flag gates the Overview `EmptyState`, the Sidebar's
  "No repositories yet." hint, and the empty-canvas center hint (the droppable stays
  mounted). Deliberately **no spinner/skeleton** — the gap is now ~1 round-trip, so
  rendering nothing composes with the pre-paint window gate rather than trading one flash
  for another. `boot_state` failing (outside Tauri) still flips `booted`, so the UI can
  never strand on a blank.

**How the gate composes with the hidden-until-painted window (#348) and the lazy route
chunks (#356).** They are three independent layers, and deliberately stay that way:

1. The window is created **hidden** with a themed native background (#348); the frontend
   reveals it from `RevealOnPaint` — a sibling of the lazy route *inside* `App`'s `Suspense`
   boundary (#356) — so the reveal fires on the first frame that `MainApp`/`CanvasWindow`
   actually commits, never on the empty fallback.
2. `booted` is **not** a fourth gate on that reveal. It gates only three *text* nodes, never
   a `Suspense` fallback, never a `null` route, and never `RevealOnPaint`. So it cannot delay
   or suppress the reveal, and it cannot fight the Suspense fallback: the window still shows
   the instant the route chunk paints the real shell (sidebar chrome, wall, tab strip).
3. What it removes is precisely the content flash *inside* that first real frame: the shell
   used to paint "No active sessions" / "No repositories yet." for the ~16 round-trips the
   old waterfall took, then swap to the persisted content. Now the shell paints without those
   hints and the content lands ~1 round-trip later.

A route chunk that never loads still cannot leave the app invisible — Rust's 2 s
`schedule_reveal_fallback` (#348) is untouched — and a `boot_state` that never resolves still
flips `booted` on rejection, so neither layer can strand the other.

Platform-neutral (pure TS/React + existing `#[cfg]`-correct Rust helpers — nothing
OS-specific was added), so macOS and Windows get the same win; WebKitGTK gets the biggest one.

### Needs real-box verification (boot batching, #352)

- [ ] Boot the AppImage on Linux with several persisted agents, a couple of repos, canvas
      tabs, a schedule and a recurring: everything appears **in one go**, not in stages,
      and noticeably faster than before.
- [ ] **No flash**: "No active sessions" / "No repositories yet." never appear before the
      content.
- [ ] Terminals still resume + repaint correctly, and the Linux software-WebGL probe (#346)
      still decides correctly — i.e. `platform` is loaded before the first terminal host is
      created.
- [ ] A popped-out canvas window (#84) boots through its own `boot_state`, renders its
      canvas, claims its PTYs, and re-docks on close.
- [ ] **Composes with #348/#356**: the window still appears (never stays hidden), appears
      only once the real shell has painted (no empty-fallback frame), and is not visibly
      *later* than before this change — the `booted` gate must not have become a fourth
      reveal gate. Kill the dev server mid-boot: the 2 s Rust reveal fallback still shows
      the window.

### Fast, reliable session exit — kill the process group, derive `Exited` from the child (#354)

Reported as "instances exit slow", plus orphaned agent children. Two backend bugs, both on the
shared `#[cfg(unix)]` path (so macOS and Linux had them equally):

- **`Exited` was EOF-driven.** `reader_loop` emitted it only after the PTY **master** hit EOF —
  but on unix the master only EOFs once **every** holder of the **slave** fd is gone, and claude's
  subprocesses (MCP servers, tool children) inherit it. An agent that had already exited therefore
  kept its card alive for seconds. Verified on Linux with a PTY probe: a backgrounded descendant
  that **ignores SIGHUP** keeps the master from EOFing **indefinitely** (the reader was still
  blocked after 8 s), so the exit event never came at all.
- **The kill hit only the direct pid, and it blocked.** portable-pty's unix `Child::kill()` sends
  SIGHUP to the direct pid, then sleeps ~200 ms before escalating — inside the Tauri command, and
  serially per session in `kill_all` (10 agents ⇒ a ~2 s shutdown stall). Descendants survived as
  orphans (#31) and kept the slave open, so the exit stayed EOF-blocked anyway.

**Fix.** A per-session **exit-waiter thread** owns the `Child`, blocks in `wait()` (which returns
the moment the direct child dies, regardless of descendants), and is the **sole** emitter of
`Exited`; the reader's send is deleted, not merely guarded, so there is still exactly **one**
`Exited` per PTY generation (the frontend consumes its `intentionalKills` flag once). The waiter
first waits — bounded, `EXIT_DRAIN_MS` — on the reader's `reader_done` flag, so trailing output
still precedes the exit; if the reader hasn't EOF'd, descendants are still holding the slave, so it
hangs up the whole **process group** and escalates to SIGKILL. `kill_session` / `kill_all` signal
the group too (`killpg`), non-blocking, with `kill_all` paying **one** shared grace for all
sessions.

No `pre_exec` / `setsid` of our own is needed: portable-pty's unix spawn already `setsid()`s the
child (crate `src/unix.rs`), so `pgid == pid` and the group is a fresh session containing nothing
but the agent's own descendants — `killpg` can never reach anything else of ours. The one new dep
is `libc`, `[target.'cfg(unix)'.dependencies]`-gated (already in the tree via portable-pty).

**Linux-specific nuance worth knowing.** When a session leader holding a controlling terminal dies,
the **kernel** SIGHUPs its foreground process group — so on Linux a *well-behaved* background child
is killed for us and the master EOFs anyway. The bug only bites with a descendant that ignores or
escapes the hangup (exactly what a long-lived MCP server does) — which is why the new unit tests
deliberately use a `(trap "" HUP; sleep 30) &` descendant. With a plain `sleep` they passed even
against the pre-fix code; with the stubborn one all three fail pre-fix and pass after (verified).

**Records still survive a quit (#30/#63).** Making the exit *prompt* means a shutdown kill could
now deliver `Exited` to a still-live webview — and an agent that exits 0 on SIGHUP would read as a
**clean** exit, so `isCleanExit` would **delete the persisted record** and the session would not
come back on the next launch. `kill_all` therefore flags every generation `silent` **before any
signal** and emits nothing; a dedicated test asserts no `Exited` arrives. (A signal death also maps
to exit code 1, never 0, so a killed agent can't be mistaken for a clean exit either.)

**Files**: `src-tauri/src/pty.rs`, `src-tauri/Cargo.toml`. No frontend change.

### Needs real-box verification (#354)

- [ ] Run a real `claude` agent **with MCP servers** configured, then **Remove** it → the card
      vanishes at once (no multi-second hang), and `pgrep -fa claude` / `pgrep -fa mcp` show none
      of its children left.
- [ ] Let an agent exit on its own (`/exit`, or Ctrl-C twice) while an MCP server is running → the
      "Agent exited" toast / auto-forget (#63) fires within ~1 s, not after seconds.
- [ ] Quit the app with 3+ live agents → `pgrep -fa claude` is empty right after (no orphans, #31),
      and on relaunch **every** session is back (records survived — the key regression check for
      the shutdown-silence rule).
- [ ] `kill -9` an agent's `claude` process from a shell → the "Process exited (code N)" overlay +
      Restart appears promptly, and Restart works.
- [ ] Sanity-check on a desktop where an MCP server double-forks / `setsid`s itself: the agent's
      exit is still immediate (only the reader thread lingers — documented, best-effort).

### Boot git storm — tiered, scoped, coalesced sidebar refresh (Task #359)

Platform-neutral, but the win is largest on Linux (the report's origin): a spawned `git`
process on top of a resuming PTY storm is exactly what made "everything is slow on Arch"
worse at start-up.

- **What it cost before.** On boot — and on **every** agent's busy→idle settle — the Sidebar
  fired a five-action volley over **every** folder: `current_branches` (1 spawn/folder),
  `file_statuses` (1, and the heaviest — it walks the whole worktree), `github_web_urls` (2),
  `diff_line_counts` (3, **plus up to 2000 untracked whole-file reads**) and
  `branch_ahead_behind` (1) ⇒ **~7–8 `git` spawns + up to 2000 file reads per folder**, all
  racing the boot resume of every persisted PTY.
- **What it costs now.** The boot critical path is **one** `git` spawn per folder (the branch
  label — the sidebar's primary text). Everything else is **tier 2**: it runs after the first
  paint (double `requestAnimationFrame`, with a `setTimeout` fallback — never
  `requestIdleCallback`, whose WebKitGTK support isn't worth relying on) **and** after the
  boot-resume window settles (the existing 4 s `RECONNECT_BACKSTOP_MS`, a hard cap, so a slow
  or failed `--resume` can never defer it forever).
- **Scoped.** The busy→idle volley now targets **only the settling session's folder** (the #212
  contract is about exactly that folder); an unknown session id falls back to unscoped.
  `file_statuses` is issued **only** for repos with a **mounted FileTree** — its sole consumer
  — so the heaviest git command leaves the boot path entirely.
- **Coalesced.** One in-flight guard + a merged trailing rerun (`src/gitRefresh.ts` +
  `refreshRepoGit` in `src/store.ts`), so volleys can never stack on a big repo. The focus /
  visibility backstop still re-reads **everything** (at most once per 30 s) so an externally
  edited folder's badges stay correct.
- **Cheaper git.** `diff_line_counts` drops the redundant `has_head` pre-check (3 spawns → 2 —
  `git diff --numstat HEAD` already fails exactly where `has_head` was false; pinned by a new
  unborn-repo test), bounds the untracked pass with a **total-byte budget** on top of the
  file/size caps, and **streams** line counts instead of `fs::read`-ing whole files.
  `github_web_url_for` is 2 spawns → 1 (`git config --local --get-regexp` + a pure
  `pick_remote_url`). **Files**: `src-tauri/src/git.rs`, `src/gitRefresh.ts`, `src/store.ts`,
  `src/components/Sidebar/Sidebar.tsx`.

Deliberately **not** done: viewport-gating the sidebar (a short, non-virtualized list; it would
make map contents depend on scroll history) and defaulting `showDiffLineCounts` off on Linux
(silently removing a feature on one OS — against CLAUDE.md's cross-platform rule).

### Needs real-box verification (boot git storm, #359)

- [ ] **Arch, several persisted agents + 3 or more folders**: on launch the sidebar's branch
      labels appear with the **first paint** and the app is interactive **before** the
      badge/tint volley runs; a `ps`/`strace` sample during the resume window shows **no**
      burst of `git` processes (one `git rev-parse` per folder, then quiet until ~4 s in).
- [ ] **Scoped settle**: `git checkout -b tmp-359` inside one agent's terminal updates **that**
      folder's sidebar label within ~1 s of it settling, and spawns **no** `git` for the other
      folders.
- [ ] **Open-tree gating**: with a FileTree panel open the tree tints immediately; after
      closing it, subsequent busy→idle settles run **no** `git status` for that repo.
- [ ] **Focus backstop**: alt-tab away and back → the `+A/−D` badge picks up a file edited in an
      external editor (full volley, at most once per 30 s).

### Renderer overrides in Settings (Task #357)

ReCue makes **two** rendering decisions on Linux, and until now a user could only influence
either through **environment variables** — which a `.desktop` / AppImage launch from a desktop
menu never sees. Tauri's own [Linux-graphics guidance](https://v2.tauri.app/develop/debug/linux-graphics/)
explicitly recommends shipping user-facing rendering-mode settings, precisely because
WebKitGTK masks the WebGL renderer string and auto-detection is unreliable. #357 adds the UI,
plus a plain-text readout of what auto-detection actually decided at boot.

**Settings → Rendering** (Linux only — the nav entry and the pane are filtered out on
macOS/Windows, and `renderer_diagnostics` returns `null` there):

| Control | Values | Scope |
|---|---|---|
| **DMA-BUF renderer** | Auto (default) / On / Off | **next launch** |
| **Terminal renderer** | Auto (default) / WebGL / DOM | **live, on Save** |
| **Diagnostics** | the boot line + evidence + what decided it + the probed WebGL renderer | read-only, **Copy** button |

Both default to `auto`, so every existing install and both other OSes behave byte-for-byte as
they did (`mergeSettings` fills the missing keys with `auto`).

**Precedence (unchanged rules 1–2 of #347, with the setting slotted underneath):**

```
user-exported WEBKIT_DISABLE_DMABUF_RENDERER  >  RECUE_DISABLE_DMABUF  >  Settings  >  auto
```

When an env var wins, the Settings pane **says so** ("Overridden this run by …") rather than
letting the saved setting look silently broken.

**The polarity is the sharp edge.** The *setting* names the **renderer** (`on` = DMA-BUF on =
`RendererOverride::ForceKeep`); the *env var* names the **workaround** (`RECUE_DISABLE_DMABUF=1`
= disable it = `ForceDisable`). `resolve_dmabuf_override(env, mode)` is the one place both meet,
and its unit tests assert the matrix in both directions.

**Why the DMA-BUF setting can only apply at the next launch.** GTK/WebKit read
`WEBKIT_DISABLE_DMABUF_RENDERER` **once, at init** — and Tauri's `Store` is only constructed
inside `.setup()`, i.e. *after* GTK init. There is no seam in between, so the persisted mode has
to be read **straight off disk before `tauri::Builder`**. That is what the new shared
**`src-tauri/src/early_settings.rs`** does: it re-derives Tauri's Linux `app_data_dir()` rule
(`$XDG_DATA_HOME` when absolute, else `$HOME/.local/share`, joined with the bundle identifier —
guarded by an `include_str!("../tauri.conf.json")` drift test), reads `sessions.json`, and hands
back the opaque settings blob. Fail-open at every step: a missing file / bad JSON / missing key →
`None` → `auto` → exactly #347's behavior. **`linux_gtk.rs` (#349) now uses the same reader**
(its duplicate `store_path` / `theme_from_store_json` / consts are gone). There is deliberately
**no in-app "Restart now" button** — a relaunch would kill every running agent's PTY.

**The live terminal-renderer swap never disposes a host.** That is the #18 invariant: disposing a
pooled xterm replays scrollback whose absolute cursor moves were encoded for a different width,
garbling `claude`'s TUI. Instead the WebGL addon is **loaded/disposed on the running xterm** (the
same path `onContextLoss` already takes — disposing it reverts xterm to its DOM renderer), then
`refresh()` + `scheduleResize()`. It deliberately does **not** call `clearTextureAtlas()`: the
glyph atlas is **shared** across the pool, and clearing it from under the other terminals is the
#221 "font jumble" bug (and the font has long since loaded by then anyway).

**The #364 context-loss latch outranks this setting.** The single gate is
`terminalPool.webglPermitted()` = `webglFallback.allowsWebgl() && rendererDecision().webgl` —
**latch first**, so a window that already fell back never even constructs #346's probe canvas.
Consequence: forcing **DOM** always takes effect (a live addon is unloaded immediately), but
forcing **WebGL** on a window that has suffered an *unrecovered* WebGL context loss does **not**
re-attach the addon — that is precisely the context storm on a sick driver the latch exists to
prevent, and re-arming it is a relaunch. `host.loadWebgl()` re-checks both `disposed` **and** the
latch *after* its lazy `import("@xterm/addon-webgl")` (#356) resolves, and attaches #364's full
`onContextLoss` handler to the instance the chunk yields; the Settings diagnostics readout
reports `active: "dom"` with a "WebGL context lost and not restored" reason in that state, so the
UI never claims a renderer the window isn't on.

**Files**: `src-tauri/src/early_settings.rs` (**new** — shared pre-GTK reader + tests),
`src-tauri/src/linux_webkit.rs` (`DmabufMode` / `OverrideSource` / `normalize_dmabuf_mode` /
`resolve_dmabuf_override` / `decision_reason` + the `RendererReport` `OnceLock`),
`src-tauri/src/linux_gtk.rs` (converged onto `early_settings`), `src-tauri/src/commands.rs`
(`renderer_diagnostics`), `src-tauri/src/lib.rs`, `src/components/Terminal/webglRenderer.ts`
(pure `decideTerminalRenderer`), `src/components/Terminal/terminalPool.ts`
(`applyTerminalRenderer` / `terminalRendererReport` / `host.webgl`),
`src/components/Settings/Settings.tsx` + `.module.css`, `src/store.ts`, `src/ipc.ts`,
`src/types/index.ts`.

#### Verified on a real box (Arch, Hyprland/Wayland, hybrid Intel i915 + NVIDIA-open 610.43.03)

Run against an **isolated `XDG_DATA_HOME`** so the developer's real `sessions.json` was never
touched. The boot line's evidence matches the independently-read ground truth exactly
(`/sys/class/drm/card0 → nvidia (0x10de)`, `card1 → i915 (0x8086)`,
`/proc/driver/nvidia/version → Open Kernel Module 610.43.03`, DMI `ASUSTeK … ROG Zephyrus M16`,
`XDG_SESSION_TYPE=wayland`):

- [x] **No key persisted** (fresh install) → `DMA-BUF left on — Mesa GPU present (healthy DMA-BUF)`
      — #347's detection, unchanged.
- [x] **`linuxDmabufRenderer: "off"`** → `DMA-BUF disabled — forced off in Settings (linuxDmabufRenderer=off)`.
- [x] **`linuxDmabufRenderer: "on"`** → `DMA-BUF left on — forced on in Settings (linuxDmabufRenderer=on)`.
- [x] **`RECUE_DISABLE_DMABUF=1` + setting `on`** → `DMA-BUF disabled — RECUE_DISABLE_DMABUF forced on`
      (the env beats the setting).
- [x] **`WEBKIT_DISABLE_DMABUF_RENDERER=1` + setting `off`** → `DMA-BUF untouched — … already set
      by the user` (the user's own env beats everything; we never write the variable).

#### Needs real-box verification (renderer overrides, #357)

The GUI paths below could not be exercised headlessly (they need a human at the window):

- [ ] Settings → **Rendering** appears (Linux) with both controls + the diagnostics block; the
      readout's DMA-BUF half matches the `[recue] WebKitGTK: …` line printed on stderr, and its
      terminal half names the probed WebGL renderer (expected here: `Mesa Intel(R) Graphics …`).
- [ ] **Copy diagnostics** puts the whole block on the clipboard ("Diagnostics copied" toast).
- [ ] The **"Restart ReCue to apply this"** note appears only when the DMA-BUF draft differs from
      the mode that was in effect at boot — and is **absent** on a fresh install left at Auto.
- [ ] **Terminal renderer = DOM → Save** with 2+ agents open: every terminal keeps its contents
      (no clear, no scrollback replay, no TUI garble), and the WebGL addon is gone. Switch back to
      **WebGL → Save**: same, no font jumble in the *other* already-running terminals (#221).
- [ ] **Terminal renderer = WebGL** on a box whose probe says llvmpipe: the addon loads anyway and
      no "skipping WebGL renderer" warning is logged.
- [ ] A **detached canvas window** (#105) keeps the DOM renderer whatever the setting says.
- [ ] **#364 latch beats a forced WebGL.** Force a context loss in one terminal (devtools:
      `getContext("webgl2").getExtension("WEBGL_lose_context").loseContext()`, no restore) → the
      window latches to DOM. Then set **Terminal renderer = WebGL → Save**: the addon is **not**
      re-attached in any terminal, and the diagnostics readout says `dom` /
      "WebGL context lost and not restored". Relaunching re-arms it.
- [ ] The shipped **AppImage** (no env vars set at all) can reach both switches and the readout —
      the whole reason this task exists.
- [ ] **macOS / Windows regression:** no Rendering entry in the Settings nav, and terminals render
      exactly as before.


## 2026-07-14 — Login-shell PATH probe off the startup critical path (#360)

The `.desktop`/AppImage launch inherits the session environment, not the login-shell PATH,
so `path_env`'s `$SHELL -ilc` probe is what makes `claude` findable on Linux (#345). It used
to run **synchronously at the top of `run()`**, before the window existed — so a heavy
`.bashrc`/`.zshrc` (oh-my-zsh, nvm, conda) delayed the *window* by up to the 3 s
`PROBE_TIMEOUT`.

It now runs **concurrently with window creation**: `path_env::start_probe()` snapshots the env
on the main thread and returns immediately; the probe thread publishes into a `Mutex`+`Condvar`
cell (`PathState`). **The process env is never mutated** — `std::env::set_var` races a
concurrent `getenv` (glibc reallocs `environ`), which would be a real data race against the
WebKitGTK/tokio/PTY-reader threads. Consequences for Linux specifically:

- `linux_webkit::apply_webkit_env_workarounds()` (#346) and `linux_gtk::apply_gtk_theme_env()`
  (#349) **still run first**, before `start_probe()` — they are now the *only* `set_var`s in the
  process, and they must complete while the process is still single-threaded. `start_probe()` is
  the first thing that spawns a thread, so its position after them is **load-bearing**.
- Only the spawn/lookup seam waits for the probe (`pty::find_on_path` / `spawn_with_id` via
  `effective_path()`); the git/CLI helper seam (`git::hidden_command` via `apply_path()`) never
  blocks, because sync Tauri commands run on the webview main thread.
- The result is cached in `sessions.json` (`path_cache`: `$SHELL` + rc-file mtime fingerprint +
  the raw **discovered** PATH), so a steady-state boot pays zero probe cost. Only the *discovered*
  PATH is persisted — never the merged one — so an AppImage's per-launch `/tmp/.mount_…/usr/bin`
  segment can never be baked into the cache; the merge against the current PATH is redone each boot.

### Needs real-box verification (async PATH probe, #360)

- [ ] **The actual win.** Put `sleep 3` as the **first line** of `~/.bashrc` (or your `$SHELL`'s rc),
      remove `"path_cache"` from `~/.local/share/com.recue.app/sessions.json`, build
      (`npm run tauri build -- --bundles appimage`) and launch from the **AppImage / `.desktop`
      entry** (not a terminal — a terminal launch already has the full PATH and hides the whole
      problem): the window must appear **promptly**, roughly as fast as with a fast rc (today it is
      ~3 s late).
- [ ] **The spawn gate still holds** on that same cold boot: persisted agents reconnect and a **new**
      agent spawns fine (`claude` is found) — proving the spawn waited for the probe even though the
      window did not.
- [ ] **Cache hit.** Quit and relaunch: window appears promptly **and** the first spawn no longer
      waits at all. `sessions.json` carries `"path_cache": { shell, fingerprint, path }`, and `path`
      is the raw login-shell PATH with **no `/tmp/.mount_…` segment**.
- [ ] **Cache invalidation.** `touch ~/.bashrc` → relaunch → the fingerprint mismatches, the probe
      re-runs, the cache is rewritten. Then remove the `sleep 3`.
- [ ] **GTK/WebKit env workarounds unaffected** (#346/#349): the DMA-BUF kill-switch and the
      `GTK_THEME` correction still apply (they run before the probe arms), dialogs still theme
      correctly, and the webview is not slower.
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
---

## 2026-07-14

### Desktop integration: the window never matched its launcher (Task #362)

**Symptom (reported from an Arch/Hyprland box).** Two desktop entries disagreed about
ReCue's `StartupWMClass` — the AppImage's internal `usr/share/applications/recue.desktop`
said `recue`, the installed `~/.local/share/applications/recue.desktop` said `Recue` — so the
running window did not reliably group under its launcher icon.

**Root cause.** Neither value was "wrong": they are the two halves of X11's `WM_CLASS` *pair*,
both derived by GTK from GLib's program name (`argv[0]`'s basename) — res_name/`app_id` =
prgname (`recue`), res_class = prgname with the first letter upper-cased (`Recue`). A desktop
entry may carry only **one** `StartupWMClass=` line, and **nobody owned the string**: it was an
accident of how the process happened to be launched (an AppImage's `AppRun` may exec the binary
with any `argv[0]`) plus GDK's capitalization rule.

**Measured on the reporting box** (Arch, Hyprland 0.5x, Wayland session, ReCue 1.2.1 AppImage,
2026-07-14 — these are real readings, not assumptions):

```console
$ xprop -name ReCue WM_CLASS
WM_CLASS(STRING) = "recue", "Recue"          # res_name, res_class — exactly as derived above

$ hyprctl clients -j | jq -r '.[] | select(.title|test("ReCue";"i")) | {class, initialClass, xwayland}'
{ "class": "Recue", "initialClass": "Recue", "xwayland": true }

$ tr '\0' '\n' < /proc/$(pgrep -x recue)/environ | grep -E 'GDK_BACKEND|WAYLAND_DISPLAY'
WAYLAND_DISPLAY=wayland-1
GDK_BACKEND=x11                               # ← not set by the user, and not by ReCue
```

**The finding that the plan did not anticipate:** the AppImage **always runs as an X11/XWayland
client**, even in a Wayland session. Tauri's bundled `linuxdeploy-plugin-gtk.sh` AppRun hook
hard-exports `GDK_BACKEND=x11` (`# Crash with Wayland backend on Wayland`, tauri-apps/tauri#8541).
So there is no Wayland `app_id` to read for the AppImage, and a wlroots compositor reports the
**res_class** half (`Recue`) as the window's class — which is why someone had hand-edited the
installed entry to `Recue` (it was otherwise a byte-identical copy of the AppImage's: same key
order, no `X-AppImage-*`/`X-Gearlever-*` keys, and no integrator installed on the box).

**The value chosen: `recue`** (`linux_desktop::APP_WM_CLASS`). It is the one spelling that is
correct everywhere: it is the X11 **res_name** (which GNOME Shell matches against
`StartupWMClass` *first*, before res_class), it is the Wayland **`app_id`** for every
**native**-Wayland launch (dev run, distro package, a future AUR package — none of which get the
AppRun's `GDK_BACKEND=x11`), and KDE matches case-insensitively so it is fine there too. The
capitalized `Recue` would be exactly wrong on GNOME-Wayland and on any native-Wayland package.

**Fixes**

- **`src-tauri/src/linux_desktop.rs`** (new, mirroring `linux_webkit.rs`/`linux_gtk.rs`):
  `APP_WM_CLASS = "recue"` + `pin_wm_class()` → `glib::set_prgname()`, called from `run()` after
  `linux_gtk::apply_gtk_theme_env()` and before `tauri::Builder` (GTK reads prgname at init).
  ReCue now **owns** the identifier instead of inheriting `argv[0]`. `glib = "0.18"` is
  target-gated to Linux and was already in the lockfile via tao/gtk — `cargo tree -d` shows no
  duplicate and the build compiles no new crate.
- **`src-tauri/linux/recue.desktop`** (new): a custom Handlebars desktop-entry template wired
  via `bundle.linux.deb.desktopTemplate` (+ `rpm` for parity). The **deb** seam is the one that
  matters — the AppImage bundler packs its `.AppDir` from the deb data tree, and there is no
  `appimage.desktopTemplate`. `Exec` stays the bare `{{exec}}` placeholder (linuxdeploy's
  `AppRun` parses that line to find the binary); `StartupWMClass` is the literal `recue`; adds
  `StartupNotify=true` + `Keywords=`.
- **Anti-drift tests** (`linux_desktop.rs`, run on every OS): the template's `StartupWMClass=`
  must equal `APP_WM_CLASS`, `Exec`/`Icon`/`Name`/`Type`/`Terminal` must keep their placeholders,
  `tauri.conf.json` must still point at the template, and the install script must **not**
  hardcode the WM class.
- **`.github/workflows/release.yml`**: the Linux leg now extracts the freshly built AppImage's
  desktop entry and hard-fails the release if `StartupWMClass`/`Icon`/`Exec` are not `recue`
  (extraction *tooling* trouble only warns).
- **`scripts/install-linux-desktop.sh`** (new): consent-gated (`[y/N]` unless `--yes`), XDG-only
  (never `sudo`, nothing outside `$XDG_DATA_HOME`), idempotent, `--uninstall`. It copies
  `StartupWMClass` **verbatim from the AppImage's own entry** and never hardcodes it — a second
  hand-maintained copy of that value is precisely the bug being fixed. **The app itself still
  never writes a desktop file** (no auto-integration; running the script is the consent).
- **Linux icon quality** (`bundle.icon` reordered/extended): `tauri-codegen` embeds the **first**
  `.png` as the default window icon on non-Windows, which was `32x32.png` — now `128x128@2x.png`
  (256×256), and the installed hicolor set gains 64×64 + 512×512. macOS/Windows still take
  `icon.icns`/`icon.ico`.

### Needs real-box verification (desktop integration, #362)

- [x] **Measured** the identifier on Arch/Hyprland (above): X11 `WM_CLASS = "recue", "Recue"`;
      the AppImage is an XWayland client (`GDK_BACKEND=x11` from Tauri's AppRun hook).
- [x] **Built the AppImage** from this branch and extracted its internal entry — the custom
      template took effect (`StartupWMClass=recue`, `Exec=recue`, `Icon=recue`, `StartupNotify`,
      `Keywords`).
- [x] **Ran the install script** against a real AppImage (into a sandboxed `XDG_DATA_HOME`):
      correct entry + icons, `desktop-file-validate` clean, idempotent on re-run, `--uninstall`
      leaves nothing behind, and a non-TTY without `--yes` aborts.
- [ ] **Entry appears in the app menu** on GNOME / KDE / Cinnamon / Xfce / Hyprland after
      running the script (some desktops only rescan on login).
- [ ] **The running window groups under that launcher** — correct icon, no second "unknown app"
      tile — on **X11** and on **Wayland**, on Arch, Ubuntu and Mint.
- [ ] **A native-Wayland launch** (`npm run tauri dev`, or a distro package — no AppRun hook, so
      no `GDK_BACKEND=x11`) reports Wayland `app_id` = `recue`, matching the entry exactly. Only
      the AppImage's XWayland path was measurable here.
- [ ] **Gear Lever / appimaged / AppImageLauncher** integration of the new AppImage produces the
      same `StartupWMClass=recue` (they copy the AppImage's own entry, so it should).
- [ ] **wlroots follow-up (open question, deliberately out of scope for #362).** Because the
      AppImage is XWayland-only, Hyprland/sway see the res_class half (`Recue`), not `recue`.
      Taskbars still resolve the entry via a case-folded name search, but the *exact* match
      fails. Two candidate fixes, both bigger than this card: (a) also pin the X11 program class
      (`gdk_set_program_class("recue")` — must run **after** GTK init, since `gdk_pre_parse()`
      unconditionally re-derives it from prgname, so it needs a safe hook point in the Tauri
      startup sequence); or (b) stop forcing `GDK_BACKEND=x11` in the AppImage once
      tauri-apps/tauri#8541 is fixed upstream, making ReCue a native Wayland client whose
      `app_id` is already `recue`. Until then, hand-written Hyprland window rules should match
      `class:^(Recue)$` (documented in `docs/linux-desktop-integration.md`).
### Real-box verification walk — Arch/Hyprland (Task #365)

The first end-to-end walk of every `- [ ]` box above on a real Linux box. The deliverable is
**evidence, not a pass rate**: a recorded FAIL is a successful outcome, a tick without
evidence is a failed one. **Nothing here changed any Rust or TS source** — this task added
`scripts/linux-verify.sh` (a read-only evidence collector, `npm run verify:linux`), one
`package.json` script, and this section.

**Box under test**

```
distro          Arch Linux, kernel 7.1.3-arch1-2 x86_64
session         XDG_SESSION_TYPE=wayland, XDG_CURRENT_DESKTOP=Hyprland (v0.55.4)
GPUs            card0 -> driver=nvidia vendor=0x10de   (RTX 4080 Max-Q)
                card1 -> driver=i915   vendor=0x8086   (Intel Iris Xe — renders the webview)
nvidia kernel   NVIDIA UNIX Open Kernel Module 610.43.03  ("nvidia-open")
VM              none — bare metal (no /sys/hypervisor/type, no CPUID hypervisor flag;
                DMI = ASUSTeK / ROG Zephyrus M16 GU604VZ)
file manager    thunar.desktop        (Xfce/Thunar — the ONLY file manager installed)
browser         brave-browser.desktop
D-Bus (session) org.freedesktop.FileManager1 + org.freedesktop.Notifications, both activatable
notifications   a daemon owns org.freedesktop.Notifications (name owner :1.5)
clipboard       wl-paste / wl-copy present; xclip ABSENT
FUSE            libfuse3.so.4 only — libfuse.so.2 is NOT installed
shell           $SHELL=/bin/bash;  claude at /home/erik/.local/bin/claude
artifacts       (a) locally built AppImage  ReCue_1.2.1_amd64.AppImage  — the main subject
                (b) the PUBLISHED v1.2.1 release AppImage (~/Applications/ReCue.AppImage),
                    built by CI on ubuntu-22.04 — used for A1 and as a pre-#347 control
app version     1.2.1
commit SHA      5192ad1c867ca57b5e4e8582b83b405f0ef09e06  (contains #347 and #350)
date            2026-07-14
```

**Two scope limits, stated up front**

1. **The locally built AppImage does NOT prove CI's distro floor.** It links this host's Arch
   glibc/webkit, not ubuntu-22.04's. It proves the **code**, not the floor. The floor is proved
   only by the *published* CI artifact — which is why A1 was **also** walked against
   `~/Applications/ReCue.AppImage` (the real shipped v1.2.1). That one launches fine here, so
   the ubuntu-22.04 → current-Arch floor **holds** — but it predates #347/#350, so it cannot
   verify any box about them.
2. **The performance verdicts are a snapshot of commit `5192ad1`.** Tasks #351/#353/#355/#356
   (lazy Overview terminals, main-thread offload, code-split) all landed just before this walk
   and move exactly the numbers B5 and L1–L5 ask about.

**Method** — every launch used an **isolated data dir** (`XDG_DATA_HOME=$(mktemp -d)`; Tauri's
Linux `app_data_dir()` is `$XDG_DATA_HOME/com.recue.app`) so the maintainer's live sessions
were never resumed or rewritten, and every launch was bounded with `timeout`. Boot-line
evidence is the app's own `eprintln!` on stderr. `scripts/linux-verify.sh` reproduces every
headless check; `--open` adds the three that pop windows.

**Scope of the walk — which boxes are covered.** At this branch's base commit (`5192ad1`) the file
held **34** unchecked boxes across six checklists (#345 ×8, #346 ×5, #349 ×4, #347 ×7, #350 ×5,
#351 ×5) — not the 15 the card guessed, and not the 13 the plan counted: #347/#349/#350/#351 have
each appended a checklist of their own since #346. **All 34 are walked below.**

While this walk was running, Tasks **#348** (white startup flash, 7 boxes) and **#355**
(bounded-parallel boot resume, 3 boxes) merged to `main` and appended **10 further boxes** — the two
checklists immediately above this section. They are **deliberately left untouched and unverified**:
the artifact walked here was built from `5192ad1`, which **does not contain their code**, so any
verdict on them would be fabricated. They need their own pass (and #355's third box explicitly
depends on #348's reveal behavior). This is the same staleness trap #365 was created to avoid.

**Results** — the 34 boxes as of `5192ad1`: **6 PASS · 0 FAIL · 16 PARTIAL · 8 BLOCKED · 4 N/A.**

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| **A1** | AppImage launches (Arch / Ubuntu / Mint) | PARTIAL | **Arch ✓ with the *published CI* AppImage** *and* a local build: `hyprctl clients` → `class=Recue title=ReCue xwayland=true`; no loader/GTK fatal. **No `libfuse2` needed** — the runtime uses libfuse3 (`APPDIR=/tmp/.mount_ReCue_…`). Ubuntu/Mint: no such box. |
| **A2** | `claude` spawns (PTY `$SHELL`; PATH via the login-shell probe) | PARTIAL | Caught the probe **live inside the AppImage**: child `/bin/bash -ilc printf '%s' "__RECUE_PATH__${PATH}__RECUE_PATH__"` → PATH clean of `/tmp/.mount_` and containing `/home/erik/.local/bin/claude`. The app then spawned `claude --version` successfully. A real agent PTY needs the GUI. |
| **A3** | `xdg-open` → browser + folders | PARTIAL | `xdg-open https://example.com` → rc=0 (Brave); `xdg-open <dir>` → rc=0 (Thunar) — the exact processes `open_url` / `os_open` spawn. In-app Ctrl-click / Reveal / Open-data-folder need the GUI. |
| **A4** | `reveal_file_in_finder` via `FileManager1.ShowItems` | PARTIAL | The verbatim `dbus-send … ShowItems array:string:file://…/README.md string:""` → `method return … reply_serial=2`, no error; Thunar selected the file. **Xfce/Thunar only** — GNOME/Nautilus, KDE/Dolphin, Cinnamon/Nemo are not installable on this box. |
| **A5** | Ctrl hints + "Reveal in File Manager" | PARTIAL | Pure logic proven (`src/platform.test.ts`, 4 Linux cases, in the 686 green tests). On-screen rendering needs the GUI. |
| **A6** | Native notifications (#336 watch) | PARTIAL | `org.freedesktop.Notifications` activatable (owner `:1.5`); `notify-send` delivered a **visible toast**. The app's watch → toast path needs the GUI. |
| **A7** | Clipboard image paste (X11 **and** Wayland) | PARTIAL | Both backends compiled in (`Cargo.lock`: `wl-clipboard-rs` + `x11rb`). Wayland plumbing round-trips **byte-exact**: `wl-copy -t image/png < icon.png` → `wl-paste --list-types` = `image/png`, 28270/28270 B. Ctrl+V→`save_clipboard_image` needs the GUI. **X11 half: N/A — no X11 session on this box.** |
| **A8** | Updater sees the AppImage + relaunches | PARTIAL | Manifest ✓: `latest.json` v1.2.1 carries signed `linux-x86_64` **and** `linux-x86_64-appimage` → `…/ReCue_1.2.1_amd64.AppImage`. Precondition ✓ (**#350 regression check**): the app's own env still has `APPIMAGE=…`, which `install_appimage` rewrites in place. End-to-end self-update needs a published N+1 → BLOCKED. |
| **B1** | NVIDIA + Wayland logs `set WEBKIT_DISABLE_DMABUF_RENDERER=1` | N/A | **Superseded by #347** (that line no longer exists) **and** not this box (hybrid, not NVIDIA-only). See D1/D2. |
| **B2** | AMD + Wayland / Intel + Wayland: DMA-BUF left **on** | PARTIAL | Intel (as the Mesa half of this hybrid) ✓ — DMA-BUF **is** left on (see D1). AMD: no such box. *Premise corrected in place:* post-#347 there is **always** exactly one boot line, so "no log line" is stale. |
| **B3** | `RECUE_DISABLE_DMABUF=1` / `=0`; user var respected | **PASS** ✓ | All three boot lines verbatim — see D6. Environment-independent. |
| **B4** | Software WebGL → "skipping WebGL renderer" console warning | BLOCKED | **WebKitGTK does not forward the webview console to stderr** — only the two Rust `eprintln!` lines appear in a bounded launch. Reading it needs the WebKit inspector. See finding **F4**. |
| **B5** | Release AppImage under a busy `claude` TUI: smooth | BLOCKED | GUI + subjective. Protocol on the maintainer checklist. |
| **G1** | AppImage, theme=Dark → `GTK_THEME=Adwaita:dark` + dark dialogs | PARTIAL | Boot line ✓ on a **fresh install** (`[recue] GTK: set GTK_THEME=Adwaita:dark (was Adwaita:light; recue theme: unset)`) *and* with a persisted `theme:"dark"` (`… recue theme: dark`). Note this also **confirms fact 1 of #349**: the AppRun really does force `Adwaita:light`. Dialogs rendering dark needs the GUI; other distros/DEs are N/A. |
| **G2** | AppImage, theme=Light → `GTK_THEME=Adwaita:light` + light dialogs | PARTIAL | Seeded an isolated `sessions.json` with `settings.theme="light"` → effective `GTK_THEME=Adwaita:light`. **No boot line, correctly**: the AppRun's forced value already equals the target, and the policy only logs when it *changes* the value (proven by the `HighContrast` case below). Dialogs need the GUI. |
| **G3** | Overrides honored (`APPIMAGE_GTK_THEME`, `RECUE_GTK_THEME`) | **PASS** ✓ | Unambiguously (values chosen so they can't coincide with the default): `RECUE_GTK_THEME=HighContrast` → `[recue] GTK: set GTK_THEME=HighContrast (was Adwaita:light)`. `APPIMAGE_GTK_THEME=Adwaita:light` → **no ReCue line**, not clobbered to dark. |
| **G4** | Non-AppImage run: `GTK_THEME` untouched | PARTIAL | Raw release binary (no `$APPIMAGE`) → **no `[recue] GTK:` line**, `GTK_THEME` unset. `RECUE_GTK_THEME=Adwaita:dark` → `set GTK_THEME=Adwaita:dark (was unset)`. "Dialogs follow the desktop theme" needs the GUI. |
| **D1** | **Hybrid iGPU + NVIDIA dGPU → DMA-BUF left on** | PARTIAL | **The headline result — #347 is correct on the exact box it was written for.** Boot line, verbatim:<br>`[recue] WebKitGTK: DMA-BUF left on — Mesa GPU present (healthy DMA-BUF) (gpus: nvidia[blob],i915[mesa]; nvidia: open 610.43.03; vm: no; session: wayland)`<br>Every evidence field matches `/sys` ground truth, and `WEBKIT_DISABLE_DMABUF_RENDERER` is **absent** from the app's env. The remaining two clauses (the WebGL console line; "typing echo + paint are snappy") are BLOCKED — see F4 and B5. |
| **D2** | NVIDIA blob as the only GPU | N/A | No NVIDIA-only machine here (this box is hybrid). |
| **D3** | **PRIME offload → DMA-BUF disabled** | **PASS** ✓ | On this real hybrid box, all three variants give exactly the specified line:<br>`DMA-BUF disabled — NVIDIA GL selected via env (PRIME offload) (… nvidia: open 610.43.03, GL routed to nvidia; …)`<br>for `__NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia`, and for **each var alone**. |
| **D4** | AMD-only / Intel-only / nouveau | N/A | No such GPU on this box. |
| **D5** | A VM (and a bare-metal Xen dom0 must not read as one) | N/A | Bare metal — zero VM signals. Not testable here. |
| **D6** | Overrides force the workaround on/off | **PASS** ✓ | Three launches, boot lines verbatim:<br>`RECUE_DISABLE_DMABUF=1` → `DMA-BUF disabled — RECUE_DISABLE_DMABUF forced on`<br>`RECUE_DISABLE_DMABUF=0` → `DMA-BUF left on — RECUE_DISABLE_DMABUF forced off`<br>`WEBKIT_DISABLE_DMABUF_RENDERER=1` preset → `DMA-BUF untouched — … already set by the user`<br>*Instrument note (**F3**): the "var is now set in the env" half **cannot** be read from `/proc/<pid>/environ` — see below.* |
| **D7** | Ground truth to read the boot line against | **PASS** ✓ | Collected and reproduced in the Box-under-test block; `scripts/linux-verify.sh`'s `B-gpu` check prints it (and predicts `decide_dmabuf`'s outcome) on any box. |
| **E1** | A ReCue shell terminal's env is scrubbed | PARTIAL | **Two of the three #350 seams proven live under the AppImage** by snapshotting the app's real children: the `child_env::command()` seam (the login-shell probe) and the `scrub_command()` seam (`claude --version`, `opencode --version`) both ran with **no** `APPDIR`/`APPIMAGE`/`OWD`/`ARGV0`/`GTK_THEME`/`GDK_BACKEND`, **no** `LD_LIBRARY_PATH`, `XDG_DATA_DIRS=/usr/share`, and a `PATH` free of `/tmp/.mount_`. The **PTY seam** (`child_env_vars()` → a shell terminal) needs one GUI panel: run `npm run verify:linux` inside it (its `env-appimage` check *is* this box). |
| **E2** | `xdg-open` / Reveal / Open-data-folder from inside the AppImage | BLOCKED | The standalone calls work with a clean env (A3/A4); driving them from the app needs the GUI. |
| **E3** | A `claude` agent spawns; `git` works inside it | PARTIAL | The app spawned `claude --version` under the AppImage with a **fully scrubbed** env (no `LD_LIBRARY_PATH` → exactly the dynamic-loader failure class this box is about). A full agent + its tools + `git` needs the GUI. |
| **E4** | GTK apps from a ReCue terminal use the user's own theme | PARTIAL | The scrubbed children carry **no `GTK_THEME` at all** (dropped — no `APPIMAGE_ORIGINAL_GTK_THEME` backup existed), so a GTK app launched from one falls back to the user's own theme. Launching one needs the GUI. |
| **E5** | ReCue's own window/dialogs unchanged (app env untouched) | **PASS** ✓ | The app's own `/proc/<pid>/environ` still carries `APPDIR` / `APPIMAGE` / `GTK_THEME` / `GDK_BACKEND` / the `/tmp/.mount_…` `LD_LIBRARY_PATH`, and WebKit's helper processes (`WebKitNetworkProcess`, `WebKitWebProcess`) inherit the **full** AppImage env — so the webview still loads its bundled libs. The window renders (`hyprctl clients`). Scope: the *mechanism* (#350 scrubs children only, never the app) is proven; a pixel-level dialog inspection is on the maintainer list. |
| **L1–L5** | #351 lazy-mounted Overview terminals (5 boxes) | BLOCKED | All five need ~10 resumed agents, on-screen scrolling, and a devtools console (`document.querySelectorAll(".xterm").length`). None is reachable from a terminal. |

**A note on what the AppImage actually is on Wayland.** `hyprctl clients` reports the ReCue
AppImage window as **`xwayland: true`** and its env carries `GDK_BACKEND=x11` — the AppRun's
`linuxdeploy-plugin-gtk.sh` hook hard-exports it (Task #362). Meanwhile the DMA-BUF boot line
prints `session: wayland`, because `linux_webkit` reads `XDG_SESSION_TYPE` (the *login session*)
and not the *toolkit backend*. Both statements are true and neither is a bug; they are just
answering different questions. A `tauri dev` run is a native Wayland client, the AppImage is not.

**Findings**

- **F1 — the AppImage cannot be built on Arch (two independent blockers).** Neither affects CI
  (ubuntu-22.04), but it means nobody can build or test the Linux artifact on the one distro
  ReCue's Linux work is actually being done on.
  1. `linuxdeploy`'s bundled `strip` (old binutils) cannot parse Arch's modern relocation
     sections: `ERROR: Strip call failed: … unknown type [0x13] section '.relr.dyn'` for ~30
     system libs, then it aborts. Worked around with `NO_STRIP=1`.
  2. With that fixed, the GTK plugin dies: `[gtk/stderr] cp: cannot stat
     '/usr/lib/gdk-pixbuf-2.0/2.10.0': No such file or directory` → `ERROR: Failed to run
     plugin: gtk (exit code: 1)`. Root cause: `linuxdeploy-plugin-gtk.sh` does
     `copy_tree "$(pkg-config --variable=gdk_pixbuf_binarydir gdk-pixbuf-2.0)"`, and Arch's
     `gdk-pixbuf2 2.44.7-1` **still advertises** `/usr/lib/gdk-pixbuf-2.0/2.10.0` in its `.pc`
     while **no longer shipping that directory** (loaders are built into the library).
     Worked around here with a `$TMPDIR`-only `PKG_CONFIG_PATH` shim.
  *Caveat this creates:* the locally built AppImage therefore carries a shimmed
  `GDK_PIXBUF_MODULE_FILE` path. It launched and rendered correctly, and no box ticked above
  depends on pixbuf loaders — but it is one more reason the local artifact is not the shipped one.
  **Proposed card:** *Make the AppImage buildable on Arch* — set `NO_STRIP=1` and shim the
  gdk-pixbuf loaders dir in a documented `npm run build:appimage`, or document the two blockers
  in `TRAJECTORY_TO_LINUX.md` as a known local-build limitation.

- **F2 — the shipped v1.2.1 AppImage still has the #347 DMA-BUF bug.** Launching the *published*
  release on this box logs the **pre-#347** line:
  `[recue] WebKitGTK: set WEBKIT_DISABLE_DMABUF_RENDERER=1 (nvidia: true, vm: false, forced: false)`
  — i.e. every Linux user on the current release is still getting the forced-CPU webview that
  #347 diagnosed as *itself* the reported slowness. #346–#351 are all on `main` and **unreleased**.
  **Proposed card:** *Cut a release containing #346–#351* so Linux users actually receive the
  DMA-BUF fix, the env scrub and the terminal-boot work.

- **F3 — `/proc/<pid>/environ` cannot verify a variable the app sets itself.** The #347 checklist
  (and #365's own plan) say to confirm `WEBKIT_DISABLE_DMABUF_RENDERER=1` in `/proc/<pid>/environ`
  after `RECUE_DISABLE_DMABUF=1`. It structurally cannot appear there: `/proc/<pid>/environ` is the
  **exec-time** stack snapshot, and a runtime `setenv()` — which is exactly what `linux_webkit` and
  `linux_gtk` do — never rewrites it. Observed: with `RECUE_DISABLE_DMABUF=1` the boot line reads
  `DMA-BUF disabled — … forced on` while `/proc/<pid>/environ` shows **no**
  `WEBKIT_DISABLE_DMABUF_RENDERER`. The instrument is valid only for the **negative** (absent at
  exec — which is what D1 needs, and it holds) and for user-preset values. The value ReCue sets *is*
  visible in a **child** process's env (`std::env::vars_os()` reflects `setenv`), so a ReCue shell
  terminal is the right instrument.
  **Proposed card:** *Fix the DMA-BUF checklist's verification instrument* — replace the
  `/proc/<pid>/environ` instruction with "read `env` in a ReCue shell terminal", and note the
  exec-time-snapshot caveat.

- **F4 — the webview console never reaches stderr under WebKitGTK.** A bounded AppImage launch
  emits exactly the two Rust `eprintln!` lines and nothing else; `[recue] terminals: WebGL
  renderer: …` / `skipping WebGL renderer (software rasterizer…)` are invisible. So B4 — and D1's
  third clause — cannot be verified from a terminal at all, only through the WebKit inspector.
  **Proposed card:** *Surface the terminal-pool WebGL diagnostic on stderr* — have
  `terminalPool` report the renderer string through a tiny Rust `log_diagnostic` command so the
  WebGL decision is greppable from a normal launch on every OS.

- **F5 — stale premise in the #346 checklist (prose only; corrected in this commit).** B2 asserted
  DMA-BUF is left on "(no log line)". Post-#347 there is **always** exactly one boot line, for both
  outcomes. Corrected in place; no card needed.

**Maintainer checklist (GUI — not reachable from a terminal)**

Roughly 15 minutes. **Always launch with an isolated data dir** so your live sessions are not
resumed or rewritten:

```bash
APP=~/Applications/ReCue.AppImage          # or a locally built one
XDG_DATA_HOME=$(mktemp -d) "$APP"
```

- [ ] **M1 (A2) — agent spawn from a real launcher.** Launch ReCue from the **desktop launcher /
      `.desktop` entry** (not a terminal — the login-shell PATH probe only matters there, and it is
      release-only). Add a folder → start an agent. **Pass when** `claude` boots in the terminal
      (no "not found"). Result: \_\_\_\_
- [ ] **M2 (A3, E2) — the three `xdg-open` paths, under the AppImage.** Ctrl-click an `http` link
      inside an agent terminal; repo context menu → **Reveal in File Manager**; Settings → Data →
      **Open data folder**. **Pass when** Brave opens for the link and Thunar opens (file selected,
      for the reveal) for the other two. Result: \_\_\_\_
- [ ] **M3 (A5) — Linux copy.** Open any context menu with a shortcut hint and the repo menu.
      **Pass when** hints read **Ctrl+…** (never ⌘) and the item reads **"Reveal in File Manager"**.
      Result: \_\_\_\_
- [ ] **M4 (A6) — native notification.** Agent header ⋯ → **Watch**, then drive that agent to a
      busy→idle edge. **Pass when** a native desktop toast appears (accept the one-time permission
      prompt). Result: \_\_\_\_
- [ ] **M5 (A7) — clipboard image paste.** Copy a screenshot, then Ctrl+V into an agent terminal.
      **Pass when** the image is saved and its path is inserted. Result: \_\_\_\_
- [ ] **M6 (E1, E3, E4) — the #350 scrub, from inside a ReCue shell terminal (AppImage only).**
      Open a **shell terminal** panel and run:
      ```bash
      npm run verify:linux            # its env-appimage check is exactly this box
      env | grep -E 'APPDIR|APPIMAGE|OWD|ARGV0|GTK_THEME|GDK_BACKEND|/tmp/.mount_'
      git status && claude --version  # and launch any GTK app, e.g. `thunar .`
      ```
      **Pass when** `verify:linux` prints `PASS env-appimage`, the `grep` finds **nothing**, `git`
      and `claude` run without dynamic-loader/symbol errors, and the GTK app uses **your** theme
      (not Adwaita:light). Result: \_\_\_\_
- [ ] **M7 (G1, G2, G4) — GTK dialog theme.** With ReCue's theme = **Dark**, open the folder picker,
      FileSwitcher → **Browse…**, and a template **export** dialog. Then Settings → Appearance →
      **Light** → Save → **quit and relaunch** → open the same three. **Pass when** all three are
      **dark** in the first pass and **light** in the second. Result: \_\_\_\_
- [ ] **M8 (B4, D1) — the WebGL renderer.** Open the WebKit inspector (`RECUE_DEVTOOLS=1` /
      right-click → Inspect) → Console. **Pass when** a normal launch logs
      `[recue] terminals: WebGL renderer: Mesa Intel(R) …` (hardware) and **no** "skipping WebGL
      renderer (software rasterizer…)". Then relaunch with `RECUE_DISABLE_DMABUF=1` — **pass when**
      the warning *does* appear (the fallback works). Result: \_\_\_\_
- [ ] **M9 (B5, L1–L5) — performance under a busy wall** (this is a snapshot of commit `5192ad1`).
      Boot into **Overview** with ~10 resumed agents. **Pass when**: (a) only the visible cards have
      a terminal (`document.querySelectorAll(".xterm").length` ≈ visible-card count, not 10) and the
      first cards paint promptly; (b) scrolling the wall right fills each revealed card **once** —
      history intact, no duplicated startup paint or stray glyph, and scrolling back never
      re-replays; (c) Overview → Canvas → Overview does not repaint scrollback; (d) typing into a
      busy agent stays responsive while another card hydrates; (e) Ctrl+E big-mode on a
      never-mounted card paints it, and a Ctrl+1–9 Canvas tab takes keystrokes immediately;
      (f) a session **Restart** replays scrollback cleanly. Result: \_\_\_\_
- [ ] **M10 (A8) — the self-update, at the next published release.** With an installed AppImage of
      version *N* and *N+1* published: Settings → Updates → Check → Update now. **Pass when** it
      downloads, replaces the file at `$APPIMAGE` in place, and relaunches into *N+1*.
      Result: \_\_\_\_
