# Linux packaging & install (#361)

How ReCue is distributed on Linux, which install self-updates and which does not, and the
maintainer runbook for the AUR package.

---

## 1. Install options

| Install                              | What it is                                                                                     | Self-updates?                             | Needs FUSE? |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------- |
| **AppImage** (default download)      | One universal binary with the Ubuntu 22.04 GTK/WebKit userland **bundled**. Runs on any distro. | **Yes** — the in-app updater owns it.     | **Yes**     |
| **AUR `recue-bin`** (Arch/Manjaro/…) | The official `.deb`, **repacked** as a pacman package. Links the **system** webkit2gtk/GTK.     | **No** — `sudo pacman -Syu` owns it.      | No          |
| **`.deb`** (Debian/Ubuntu/Mint)      | The same package the AUR one repacks. Links the **system** webkit2gtk/GTK.                      | **No** — your package manager owns it.    | No          |
| AppImage, **extracted**              | `--appimage-extract` + `squashfs-root/AppRun` — the FUSE-less fallback.                        | **No** — there's no `$APPIMAGE` to swap.  | No          |

Both artifacts are built by the **same** `ubuntu-22.04` release leg
(`--bundles appimage,deb`) from the **same** binary. The AppImage is the **updater**
artifact (minisign-signed, merged into `latest.json` as `linux-x86_64`); the `.deb` gets no
`.sig` and is never referenced by `latest.json` — Tauri's Linux updater can only replace an
AppImage.

### Which should I use?

- **Arch / Manjaro / EndeavourOS** → the **AUR package**. It avoids everything below.
- **Ubuntu / Mint / Debian** → the **`.deb`** if you want a system install, the AppImage if
  you want the in-app updater.
- **Anything else / unsure** → the **AppImage**.

---

## 2. The AppImage, and FUSE

The AppImage is a squashfs image mounted at launch through **FUSE 2**. Without libfuse2 it
refuses to start:

```bash
# Arch
sudo pacman -S fuse2
# Ubuntu 24.04+ (22.04 already has it)
sudo apt install libfuse2t64
```

**FUSE-less fallback** — extract and run it directly:

```bash
./ReCue_<version>_amd64.AppImage --appimage-extract
./squashfs-root/AppRun
```

That works, but the extracted run is **not self-updating**: the AppImage runtime is what
exports `$APPIMAGE` (the path of the `.AppImage` file the updater would replace), and
`AppRun` does not. ReCue therefore classifies it as a **system** install and hides its
update UI (see §4). Re-download to update.

Other AppImage costs, and why the native package exists:

- It carries the whole Ubuntu 22.04 GTK/WebKit userland (~90 MB of `libwebkit2gtk-4.1`
  alone, ~165 shared libraries), instead of Arch's current webkit2gtk-4.1 2.52 (Skia).
- Its `AppRun` hook forces `GTK_THEME` and `GDK_BACKEND=x11` (so: no native Wayland).
- Cold start pays squashfs decompression on every launch.

---

## 3. The AUR package (`recue-bin`)

Lives in this repo at **`packaging/aur/recue-bin/`** (`PKGBUILD` + `.SRCINFO`) and is
published to the AUR **manually** (§5).

- **What it does:** downloads the release's `ReCue_<version>_amd64.deb` and unpacks its
  `data.tar.*` into `$pkgdir`. The Tauri `.deb` payload is exactly:

  ```
  /usr/bin/recue                          # the binary (Tauri names it after the CARGO bin)
  /usr/share/applications/ReCue.desktop   # the desktop entry
  /usr/share/icons/hicolor/…              # the icons
  ```

  The `.desktop` entry and the icons are taken from the `.deb` **untouched**, so any
  upstream fix to the desktop entry (e.g. `StartupWMClass`) flows into the AUR package for
  free. The binary is **already** the lowercase `recue`, so `recue` on the command line
  just works; `package()` keeps a defensive symlink step in case a future bundler installs
  `/usr/bin/ReCue` (the productName) instead.
- **`provides=('recue')` / `conflicts=('recue')`** reserve the plain `recue` name for a
  possible future **source-built** package. There is no source-built package today: it
  would need the whole Rust + Node toolchain in `makedepends` and would fetch npm/cargo
  dependencies at build time (against makepkg's declared-sources model), and it would
  produce the very binary the `.deb` already carries.
- **`options=('!strip' '!debug')`** — the shipped binary is already stripped by the Tauri
  bundler; re-stripping a prebuilt package buys nothing.
- **Runtime dependencies** (`depends`) — see below.

### `depends`

Derived from the **real binary's direct shared-library links** — not guessed. Reproduce it
on an Arch box with the Tauri Linux toolchain installed:

```bash
npm run tauri build -- --bundles deb
objdump -p src-tauri/target/release/recue | grep NEEDED   # the DIRECT links
ldd src-tauri/target/release/recue                        # + the transitive closure
pacman -Qo <resolved .so path>                            # map each .so to its package
```

The 14 direct `NEEDED` entries map to nine Arch packages, which are exactly the `depends`:

| Direct `NEEDED` link                                    | Arch package     |
| ------------------------------------------------------- | ---------------- |
| `libwebkit2gtk-4.1.so.0`, `libjavascriptcoregtk-4.1.so.0` | `webkit2gtk-4.1` |
| `libgtk-3.so.0`, `libgdk-3.so.0`                        | `gtk3`           |
| `libglib-2.0.so.0`, `libgio-2.0.so.0`, `libgobject-2.0.so.0` | `glib2`      |
| `libcairo.so.2`                                          | `cairo`          |
| `libgdk_pixbuf-2.0.so.0`                                 | `gdk-pixbuf2`    |
| `libsoup-3.0.so.0`                                       | `libsoup3`       |
| `libdbus-1.so.3`                                         | `dbus`           |
| `libc.so.6`, `libm.so.6`                                 | `glibc`          |
| `libgcc_s.so.1`                                          | `gcc-libs`       |

Most of these are pulled in transitively by `webkit2gtk-4.1` anyway, but they are **direct**
links of the ReCue binary, so listing them is what `namcap` expects. (`libgcc_s.so.1` is
owned by the newer split `libgcc` package on current Arch; `gcc-libs` depends on it and
exists on every Arch install, so it is the safer name to depend on.)

**No `libayatana-appindicator`.** ReCue ships **no tray icon**, and the built binary does
**not** link it — verified: `objdump -p … | grep -i appindicator` is empty. The Ubuntu CI
leg installs `libayatana-appindicator3-dev` only to satisfy Tauri's Linux build feature set.
Do not add it as a runtime dependency.

### The Ubuntu-built-binary assumption

The `.deb` is built on **ubuntu-22.04** and run on Arch. That relies on forward-compatible
glibc (Arch's is newer than the build host's floor) and on the stable
`libwebkit2gtk-4.1.so.0` / `libgtk-3.so.0` sonames — exactly the assumption every `-bin`
AUR package that repacks a `.deb` makes. If a symbol mismatch ever surfaces, the fallback
is a source-built `recue` PKGBUILD (the name is already reserved via `provides`).

---

## 4. Updating: who owns the binary

ReCue decides **at runtime** whether the in-app updater owns the install, because the AUR
package and the AppImage carry the **same binary** — a compile-time flag could not tell
them apart. The discriminator is the **`$APPIMAGE`** environment variable, which the
AppImage runtime exports and a `/usr/bin` install does not.

The Rust `install_kind()` command (`src-tauri/src/commands.rs`, pure `classify_install`)
reports one of:

| Kind         | When                                                    | In-app updater |
| ------------ | ------------------------------------------------------- | -------------- |
| `"bundle"`   | macOS `.app`, Windows installer, **any dev/debug build** | **On**         |
| `"appimage"` | Linux, release build, `$APPIMAGE` set (non-empty)        | **On**         |
| `"system"`   | Linux, release build, no `$APPIMAGE`                     | **Off**        |

On a `"system"` install the frontend's pure `selfUpdates()` (`src/platform.ts`) is false, so:

- `store.checkForUpdate()` short-circuits to `idle` — **no network check is ever made**;
- the sidebar update indicator never renders;
- Settings → **Updates** hides "Check for updates" / "Update now & restart" and shows a
  note pointing at the package manager (`sudo pacman -Syu recue-bin` on Linux). The current
  version and the in-app patch notes still render.
- `store.installUpdate()` is a no-op that toasts, so even the dev mock can't overwrite a
  pacman-owned binary.

The one-time **"Updated to v…"** toast on boot is a pure version compare, so it still fires
correctly after a `pacman -Syu` upgrade.

**Forcing a state for testing** (any OS, no rebuild):

```bash
RECUE_INSTALL_KIND=system   npm run tauri dev   # → the package-manager note, no update UI
RECUE_INSTALL_KIND=appimage npm run tauri dev   # → today's full update flow
RECUE_INSTALL_KIND=bundle   npm run tauri dev   # → same
```

(Anything else is ignored, and the real probe applies. Mirrors #346's
`RECUE_DISABLE_DMABUF`.)

---

## 5. Maintainer runbook: publishing / bumping the AUR package

**Prerequisite (one-time):** an [AUR account](https://aur.archlinux.org/) with your SSH
public key registered, and the `recue-bin` package name claimed.

**⚠️ LICENSE caveat — read before the first publish.** This repository currently ships **no
`LICENSE` file**, which is why the PKGBUILD says `license=('custom')`. An AUR package that
**redistributes a binary** really wants an explicit license (and `makepkg`/`namcap` will
nag about a missing `/usr/share/licenses/recue-bin/LICENSE`). Adding one is a legal
decision for the maintainer — do it **before** publishing to the AUR, then drop the license
file into `package()`.

Per release:

1. Let the release pipeline finish and **publish the draft release** (the updater endpoint
   only resolves to a published release, and `aur-bump.sh` downloads a published asset).
   The Linux job summary prints the `.deb` name + sha256.
2. Re-pin the package:

   ```bash
   scripts/aur-bump.sh 1.3.0
   ```

   It downloads `ReCue_1.3.0_amd64.deb`, computes its sha256, rewrites `pkgver` /
   `pkgrel` / `sha256sums` in the PKGBUILD, regenerates `.SRCINFO` (when `makepkg` is on
   PATH), and prints the publish steps. It **refuses** to proceed while `sha256sums` is
   still the committed `SKIP` placeholder, so a placeholder can never reach the AUR. It
   never pushes anything.

3. Review the diff and commit the bumped files in **this** repo.
4. Push to the AUR:

   ```bash
   git clone ssh://aur@aur.archlinux.org/recue-bin.git /tmp/recue-bin-aur
   cp packaging/aur/recue-bin/PKGBUILD packaging/aur/recue-bin/.SRCINFO /tmp/recue-bin-aur/
   cd /tmp/recue-bin-aur
   makepkg -si      # optional: build + install locally to smoke-test
   namcap PKGBUILD  # optional: lint
   git add PKGBUILD .SRCINFO && git commit -m "recue-bin 1.3.0" && git push
   ```

**Why this is not automated in CI:** no AUR account or SSH-key secret exists for this
repository, and auto-pushing a package to the AUR on every release is a deliberate
maintainer act, not a side effect of a build. Publishing stays manual by design.

**Why `sha256sums=('SKIP')` is committed:** no release carries a `.deb` yet (the artifact
lands with the first release built after #361), so a real hash cannot exist until then.
`aur-bump.sh` fills it, and hard-errors while it is still `SKIP`.

---

## 6. Needs a real Linux box

Tracked in [`TRAJECTORY_TO_LINUX.md`](../TRAJECTORY_TO_LINUX.md); the packaging-specific
items:

- A release run uploads **both** the `.AppImage` and the `.deb`, and `latest.json`'s
  `linux-x86_64` entry still points at the **`.AppImage`**.
- `scripts/aur-bump.sh <version>` against that published release; then `makepkg -si`
  installs cleanly and the app launches from the app menu **and** as `recue` in a terminal.
- `ldd /usr/bin/recue` resolves to `/usr/lib` (system webkit2gtk 2.52), not a bundled
  userland; no `GTK_THEME` / `GDK_BACKEND` forcing; cold start is visibly faster than the
  AppImage.
- The `depends` list above still matches the **released** (ubuntu-22.04-built) binary's
  `NEEDED` links — it was derived from a locally built Arch binary, and a CI-built one
  could in principle link a slightly different set.
- On that pacman install: no update indicator, the package-manager note in Settings →
  Updates, and no update HTTP request.
- The AppImage still self-updates end-to-end.
