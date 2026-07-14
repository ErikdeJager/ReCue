//! Linux desktop identity (#362): the app's WM_CLASS / Wayland app_id.
//!
//! GTK derives the X11 `WM_CLASS` pair and the Wayland `app_id` from GLib's *program
//! name* (`argv[0]`'s basename): res_name/app_id = prgname (`recue`), res_class =
//! prgname with the first letter upper-cased (`Recue`). That made the identifier an
//! accident of how the process was launched — an AppImage `AppRun` may exec us with a
//! different `argv[0]` — and it is what the shipped `.desktop`'s `StartupWMClass` must
//! match for the dock/taskbar to group the window under its launcher icon. Pin it, so
//! ReCue *owns* the value and the generated desktop entry can state it as a fact.
//!
//! **Measured on the reporting box** (Arch/Hyprland, ReCue 1.2.1 AppImage, 2026-07-14):
//! `xprop` → `WM_CLASS(STRING) = "recue", "Recue"`, i.e. exactly prgname and
//! capitalize(prgname). Note the AppImage always runs as an **X11/XWayland** client —
//! Tauri's bundled `linuxdeploy-plugin-gtk.sh` AppRun hook exports `GDK_BACKEND=x11`
//! (tauri-apps/tauri#8541) — so a wlroots compositor reports the *res_class* half
//! (`Recue`) as the window's class, while GNOME (which matches res_name first), KDE
//! (case-insensitive) and every native-Wayland launch (dev run, distro package →
//! app_id = prgname) see the lowercase half. `recue` is therefore the one value that is
//! correct everywhere, and pinning prgname makes it deterministic. See
//! `TRAJECTORY_TO_LINUX.md` / `docs/linux-desktop-integration.md`.
//!
//! Called from `run()` before `tauri::Builder` (GTK reads prgname at init, and — like
//! the PATH/env work next to it — before any thread spawns). No-op off Linux.

/// The app's canonical WM_CLASS (X11 res_name) / Wayland app_id / desktop-entry id.
/// Kept in lock-step with `linux/recue.desktop`'s `StartupWMClass=` by the test below,
/// and with the bundler's `{{exec}}`/`{{icon}}` (the Cargo bin name, `recue`).
pub const APP_WM_CLASS: &str = "recue";

/// Pin GLib's program name so GTK derives a deterministic WM_CLASS / app_id.
pub fn pin_wm_class() {
    // `target_os = "linux"` (not `all(unix, not(macos))`) so it exactly matches the
    // Cargo target-gate on the `glib` dependency; a BSD build is a no-op.
    #[cfg(target_os = "linux")]
    glib::set_prgname(Some(APP_WM_CLASS));
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The template's path, relative to `src-tauri/` — the value `tauri.conf.json` points
    /// `bundle.linux.{deb,rpm}.desktopTemplate` at.
    const TEMPLATE_REL: &str = "linux/recue.desktop";

    fn template() -> String {
        include_str!("../linux/recue.desktop").to_string()
    }

    #[test]
    fn template_declares_the_pinned_wm_class() {
        // The whole point of the pin: the desktop entry states the identifier the running
        // window actually has. If one side moves, the other must move with it.
        let want = format!("StartupWMClass={APP_WM_CLASS}");
        assert!(
            template().lines().any(|line| line == want),
            "`{TEMPLATE_REL}` must contain a line exactly `{want}` (found:\n{})",
            template()
        );
    }

    #[test]
    fn template_keeps_the_bundler_placeholders_the_appimage_depends_on() {
        let tpl = template();
        let lines: Vec<&str> = tpl.lines().collect();

        // `Exec` MUST stay the bare `{{exec}}` placeholder: linuxdeploy's `AppRun` parses
        // the desktop entry's `Exec=` line to locate the binary inside the AppDir. An
        // absolute path or a `%U` field code there breaks AppImage launch.
        assert!(
            lines.contains(&"Exec={{exec}}"),
            "`{TEMPLATE_REL}`: Exec must stay exactly `{{{{exec}}}}` (AppRun parses it)"
        );
        for want in [
            "Icon={{icon}}",
            "Name={{name}}",
            "Type=Application",
            "Terminal=false",
        ] {
            assert!(
                lines.contains(&want),
                "`{TEMPLATE_REL}` must contain a line exactly `{want}`"
            );
        }
    }

    #[test]
    fn tauri_conf_points_at_the_desktop_template() {
        // The AppImage bundler packs its `.AppDir` from the *deb* data tree, so
        // `deb.desktopTemplate` is the seam that controls the AppImage's internal entry
        // (there is no `appimage.desktopTemplate`). `rpm` is set for parity.
        let cfg: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
            .expect("tauri.conf.json parses");
        assert_eq!(
            cfg["bundle"]["linux"]["deb"]["desktopTemplate"],
            TEMPLATE_REL
        );
        assert_eq!(
            cfg["bundle"]["linux"]["rpm"]["desktopTemplate"],
            TEMPLATE_REL
        );
    }

    #[test]
    fn install_script_never_hardcodes_the_wm_class() {
        // `scripts/install-linux-desktop.sh` must copy `StartupWMClass` verbatim from the
        // AppImage's own entry — a second, hand-maintained copy of the value is exactly
        // the drift this task exists to remove.
        let script = include_str!("../../scripts/install-linux-desktop.sh");
        assert!(
            !script.contains(&format!("StartupWMClass={APP_WM_CLASS}")),
            "the install script must read StartupWMClass from the AppImage, never hardcode it"
        );
    }
}
