# Linux desktop integration (AppImage)

**TL;DR — ReCue never installs anything behind your back.** An AppImage is one
self-contained file, so your desktop only learns ReCue's name, icon, and window-matching
identity if *you* install a desktop entry for it. Do that with:

```bash
scripts/install-linux-desktop.sh ~/Applications/ReCue.AppImage   # asks before writing anything
scripts/install-linux-desktop.sh --uninstall                     # removes exactly what it wrote
```

It writes only under `$XDG_DATA_HOME` (default `~/.local/share`), never uses `sudo`, and is
safe to re-run. Prefer a desktop integrator (Gear Lever, appimaged, AppImageLauncher)? Use
it instead — see [Three ways to install](#three-ways-to-install-the-entry).

---

## Why an AppImage needs this at all

A `.deb`/`.rpm`/AUR package drops a `.desktop` file into `/usr/share/applications` as part
of installing. An AppImage has no installer: nothing ever tells your desktop that this file
is an application. Without an entry you get:

- no ReCue in the application menu / launcher search,
- no icon on the running window (an anonymous "unknown app" tile in the dock/taskbar/alt-tab),
- the running window **not grouped** under its launcher, so pinning it does nothing.

The last two are all about one key: **`StartupWMClass`**.

## WM_CLASS, app_id, and `StartupWMClass`

Your desktop shell matches a *running window* back to the *desktop entry* that describes it
by comparing the window's own identifier against the entry's `StartupWMClass=` line.

That identifier comes from GTK, which derives it from GLib's **program name**
(`g_get_prgname()` — by default just `argv[0]`'s basename):

| what the compositor sees | derived from | ReCue's value |
| --- | --- | --- |
| X11 `WM_CLASS` **res_name** (instance) | prgname | `recue` |
| X11 `WM_CLASS` **res_class** | prgname, first letter upper-cased (GDK's rule) | `Recue` |
| Wayland **`app_id`** (there is no WM_CLASS under Wayland) | prgname | `recue` |

X11's `WM_CLASS` is a **pair**, and a desktop entry may carry only **one**
`StartupWMClass=` line — so the two halves cannot both be spelled out. ReCue uses the
lowercase **`recue`**: it is the res_name, it is the Wayland `app_id`, GNOME Shell matches
res_name → `StartupWMClass` *first*, and KDE matches case-insensitively.

**ReCue owns this value rather than inheriting it.** `src-tauri/src/linux_desktop.rs` pins
GLib's program name at startup (`glib::set_prgname("recue")`, before GTK initializes), so
the identifier is a constant — not an accident of how the process was launched. That matters
for an AppImage in particular: its `AppRun` is free to exec the binary with a different
`argv[0]`. The same constant (`linux_desktop::APP_WM_CLASS`) is what the bundled desktop
entry's `StartupWMClass` states, and a Rust unit test fails the build if the two ever drift
apart.

### The bug this fixed (#362)

Two desktop files on the same machine disagreed:

| file | `StartupWMClass` | written by |
| --- | --- | --- |
| inside the AppImage: `usr/share/applications/recue.desktop` | `recue` | the Tauri bundler |
| installed: `~/.local/share/applications/recue.desktop` | `Recue` | copied out of the AppImage **by hand** and edited |

Neither was "wrong" — they were the two halves of the same pair (see the table above). The
installed copy was byte-identical to the AppImage's entry apart from that one capital letter
(same key order, no `X-AppImage-*` / `X-Gearlever-*` keys — so no integrator wrote it; it was
a manual copy). Nobody *owned* the string, so the two copies drifted. Now the app pins it,
the bundler's entry states it, the install script copies it verbatim, and CI hard-fails the
release if the shipped AppImage's entry ever says anything else.

### One caveat on wlroots compositors (Hyprland, sway)

The AppImage always runs as an **X11/XWayland** client, even in a Wayland session: Tauri's
bundled `linuxdeploy-plugin-gtk.sh` AppRun hook exports `GDK_BACKEND=x11` (a deliberate
upstream workaround — WebKitGTK crashed on the Wayland backend, tauri-apps/tauri#8541). Under
XWayland there is no `app_id`, so wlroots-based compositors report the **res_class** half of
`WM_CLASS` as the window's class:

```console
$ hyprctl clients -j | jq -r '.[] | select(.title|test("ReCue";"i")) | {class, xwayland}'
{ "class": "Recue", "xwayland": true }

$ xprop -name ReCue WM_CLASS
WM_CLASS(STRING) = "recue", "Recue"
```

GNOME (res_name first), KDE (case-insensitive), and every **native**-Wayland launch of ReCue
(a dev run, a distro package → `app_id` = prgname = `recue`) all match `StartupWMClass=recue`
exactly. On Hyprland/sway the taskbar still resolves ReCue's entry (a case-folded name search
finds it), but if you write **window rules** by hand, match the class you actually see:

```ini
# Hyprland — the AppImage is an XWayland client, so its class is the res_class half:
windowrulev2 = workspace 3, class:^(Recue)$
```

## Three ways to install the entry

### 1. ReCue's script (recommended)

```bash
scripts/install-linux-desktop.sh ~/Applications/ReCue.AppImage
```

It prints every path it is about to write and asks for confirmation (`--yes` skips the
prompt). It:

- copies the desktop entry **out of the AppImage itself**, rewriting only `Exec=` (the
  AppImage's absolute path, double-quoted so spaces work) and `TryExec=` (so the entry hides
  itself if you move or delete the AppImage) — **`StartupWMClass`, `Icon`, `Name`,
  `Categories`, `Keywords` are copied verbatim**, because the AppImage is the single source
  of truth for them;
- installs the AppImage's hicolor PNGs to `~/.local/share/icons/hicolor/<size>/apps/recue.png`;
- refreshes the desktop/icon caches (best-effort) and validates the entry with
  `desktop-file-validate` if it is installed.

Undo with `scripts/install-linux-desktop.sh --uninstall` — it removes exactly the files it
wrote (the shared `mimeinfo.cache` / `icon-theme.cache` are *refreshed*, never deleted; they
belong to every app on the system).

### 2. A desktop integrator

[Gear Lever](https://github.com/mijorus/gearlever), `appimaged`, or AppImageLauncher will
extract the same entry and manage updates/versions for you. They read the AppImage's own
`.desktop`, so they pick up the correct `StartupWMClass` automatically. If your integrator
writes a *different* value, that is the thing to fix — not the app.

### 3. By hand

```bash
cat > ~/.local/share/applications/recue.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=ReCue
Comment=Run and manage many live claude CLI sessions.
Exec="/home/you/Applications/ReCue.AppImage"
TryExec=/home/you/Applications/ReCue.AppImage
Icon=recue
Terminal=false
Categories=Development;
StartupNotify=true
StartupWMClass=recue
EOF
update-desktop-database ~/.local/share/applications
```

For the icon, extract it from the AppImage:

```bash
cd "$(mktemp -d)"
~/Applications/ReCue.AppImage --appimage-extract 'usr/share/icons/*'
for png in squashfs-root/usr/share/icons/hicolor/*/apps/recue.png; do
  size="$(basename "$(dirname "$(dirname "$png")")")"
  install -Dm644 "$png" ~/.local/share/icons/hicolor/"$size"/apps/recue.png
done
gtk-update-icon-cache -f -t ~/.local/share/icons/hicolor
```

## Consent

**ReCue never writes to `~/.local/share/applications` (or anywhere else outside its own
app-data dir).** It does not install a desktop entry on first launch, does not run the
install script for you, and does not "helpfully" integrate itself. Running the script — or
using an integrator — *is* the consent. There is no tray icon and no autostart entry either.

## Troubleshooting

**The window shows a generic/blank icon, or a second tile appears next to the launcher.**
The window's identifier and the entry's `StartupWMClass` disagree. Check both:

```bash
grep StartupWMClass ~/.local/share/applications/recue.desktop   # expect: StartupWMClass=recue
xprop -name ReCue WM_CLASS                                      # expect: "recue", "Recue"
hyprctl clients -j | jq -r '.[] | select(.class|test("recue";"i")) | .class'   # wlroots
```

If the installed entry says anything other than `recue`, re-run
`scripts/install-linux-desktop.sh` (it re-copies the value from the AppImage). If an
integrator wrote it, reinstall through that integrator after updating ReCue.

**The icon is missing entirely.** The `Icon=recue` line is a *themed icon name*, so a
`recue.png` must exist under `~/.local/share/icons/hicolor/<size>/apps/`. Verify with
`ls ~/.local/share/icons/hicolor/*/apps/recue.png`, then
`gtk-update-icon-cache -f -t ~/.local/share/icons/hicolor`. (The script installs these; a
hand-written entry needs the snippet above.)

**Nothing appears in the menu.** Run `update-desktop-database ~/.local/share/applications`,
then `desktop-file-validate ~/.local/share/applications/recue.desktop`. Some desktops
(notably GNOME) only rescan on login.

**The entry vanished.** `TryExec=` points at the AppImage's path — moving or deleting the
AppImage hides the entry by design. Re-run the script with the new path.
