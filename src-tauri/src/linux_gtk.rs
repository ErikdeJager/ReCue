//! GTK theme selection for ReCue's native file dialogs on Linux (#349).
//!
//! **The bug.** In the shipped AppImage every native dialog (the folder picker, the
//! open-file dialog, the save dialog) rendered white/light Adwaita, no matter the
//! desktop's theme or ReCue's own Dark/Light setting. Three facts stack up:
//!
//! 1. Tauri's AppImage bundler injects the vendored `linuxdeploy-plugin-gtk.sh` AppRun
//!    hook, which bundles GTK and then **forces `GTK_THEME`** for the whole process. It
//!    picks the variant by grepping the *system theme name* for the substring `dark`, so
//!    a `catppuccin-mocha-…` (or any `color-scheme: prefer-dark` setup whose theme name
//!    has no "dark" in it) falls through to `GTK_THEME=Adwaita:light`. The hook honors a
//!    single user override: **`APPIMAGE_GTK_THEME`**, copied verbatim into `GTK_THEME`.
//! 2. `tauri-plugin-dialog` resolves to rfd's **in-process GTK3** backend on Linux (no
//!    `ashpd` / XDG-portal in the lockfile), so every dialog is a GTK3 widget created
//!    inside our process and themed by that polluted env.
//! 3. GTK3's `get_theme_name()` gives **`GTK_THEME` absolute precedence** — the
//!    `gtk-theme-name` / `gtk-application-prefer-dark-theme` GtkSettings properties are
//!    not even read when it is set. So tao's `Window::set_theme` cannot fix this; the env
//!    itself must be corrected, **before GTK initializes**.
//!
//! **The policy** (the pure [`gtk_theme_env`], unit-tested on every host):
//! 1. `RECUE_GTK_THEME=<literal GTK_THEME value>` forces the value, everywhere — the
//!    support escape hatch (and the way to smoke-test this without building an AppImage).
//! 2. Outside an AppImage (dev run, distro package) → leave `GTK_THEME` alone: the user's
//!    real system GTK theme already applies and Adwaita would be a downgrade.
//! 3. `APPIMAGE_GTK_THEME` set → leave it alone; the AppRun hook already copied the user's
//!    explicit choice into `GTK_THEME` and we never clobber it.
//! 4. Otherwise pick the **Adwaita** variant (the family the AppImage actually bundles)
//!    from ReCue's own `settings.theme`: `light` → `Adwaita:light`, everything else
//!    (including "no persisted settings yet") → `Adwaita:dark`, matching the app's
//!    `DEFAULT_SETTINGS.theme = "dark"`.
//!
//! ReCue's theme lives inside the opaque `settings` blob of `sessions.json` in the
//! app-data dir — and the `Store` is only constructed in `.setup()`, i.e. *after* GTK
//! init — so this module reads that one file itself, read-only and fail-open (any miss →
//! dark, which is the default theme anyway).
//!
//! Because `GTK_THEME` is read at GTK init, toggling the theme in Settings re-themes the
//! app instantly but the **dialogs pick up the new variant on the next launch** (env
//! mutation isn't thread-safe — `set_var` is `unsafe` in Rust 2024 for exactly that
//! reason — so this must run before `tauri::Builder` and before any thread spawns).
//!
//! Like `path_env` / `linux_webkit`, the module compiles everywhere and the real work is
//! cfg-gated inside; the pure decision helpers are widened with `, test)` (the
//! `reveal_file_linux` precedent) so the macOS/Windows hosts still type-check and
//! unit-test them.

/// ReCue's app identifier — mirrors `tauri.conf.json`'s `identifier`, which Tauri joins
/// onto the XDG data dir to form `app_data_dir()`. Guarded by a drift test below.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
const APP_IDENTIFIER: &str = "com.recue.app";

/// The persisted store's filename — mirrors `lib.rs`'s `app_data_dir().join(...)`.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
const STORE_FILE: &str = "sessions.json";

// Only the Linux arm reads these env-var names (the pure helpers take parsed values), so
// they stay Linux-gated — widening them with `, test)` would just be dead code on the
// macOS/Windows test builds.
#[cfg(all(unix, not(target_os = "macos")))]
const GTK_THEME_VAR: &str = "GTK_THEME";
#[cfg(all(unix, not(target_os = "macos")))]
const APPIMAGE_VAR: &str = "APPIMAGE";
#[cfg(all(unix, not(target_os = "macos")))]
const APPDIR_VAR: &str = "APPDIR";
#[cfg(all(unix, not(target_os = "macos")))]
const APPIMAGE_GTK_THEME_VAR: &str = "APPIMAGE_GTK_THEME";
#[cfg(all(unix, not(target_os = "macos")))]
const RECUE_GTK_THEME_VAR: &str = "RECUE_GTK_THEME";

/// Point ReCue's native GTK dialogs at the right Adwaita variant. Must run **before**
/// `tauri::Builder` (GTK reads `GTK_THEME` at init) and before any threads spawn (env
/// mutation isn't thread-safe). No-op on macOS and Windows — no env write, no file read.
pub fn apply_gtk_theme_env() {
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let probe = GtkThemeProbe {
            in_appimage: std::env::var_os(APPIMAGE_VAR).is_some()
                || std::env::var_os(APPDIR_VAR).is_some(),
            user_appimage_theme: std::env::var_os(APPIMAGE_GTK_THEME_VAR).is_some(),
            force: std::env::var(RECUE_GTK_THEME_VAR).ok(),
            app_theme: read_app_theme(),
        };
        let Some(value) = gtk_theme_env(&probe) else {
            return;
        };
        let current = std::env::var(GTK_THEME_VAR).ok();
        if current.as_deref() == Some(value.as_str()) {
            return;
        }
        std::env::set_var(GTK_THEME_VAR, &value);
        eprintln!(
            "[recue] GTK: set {GTK_THEME_VAR}={value} (was {}; recue theme: {}) — override with {APPIMAGE_GTK_THEME_VAR} / {RECUE_GTK_THEME_VAR}",
            current.as_deref().unwrap_or("unset"),
            probe.app_theme.as_deref().unwrap_or("unset"),
        );
    }
}

/// What the environment / persisted-settings probes saw — the input to the pure decision.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) struct GtkThemeProbe {
    /// Running from an AppImage (its AppRun hook forced `GTK_THEME`).
    pub in_appimage: bool,
    /// The user exported `APPIMAGE_GTK_THEME` themselves (the hook's own override).
    pub user_appimage_theme: bool,
    /// The `RECUE_GTK_THEME` escape hatch, if set.
    pub force: Option<String>,
    /// ReCue's own `settings.theme`, if a persisted store was readable.
    pub app_theme: Option<String>,
}

/// The `GTK_THEME` decision: the `RECUE_*` force wins everywhere, a non-AppImage run keeps
/// the desktop's theme, a user-set `APPIMAGE_GTK_THEME` is never clobbered, and otherwise
/// the Adwaita variant follows ReCue's own theme.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn gtk_theme_env(probe: &GtkThemeProbe) -> Option<String> {
    if let Some(force) = probe.force.as_deref() {
        let force = force.trim();
        if !force.is_empty() {
            return Some(force.to_string());
        }
    }
    if !probe.in_appimage {
        return None;
    }
    if probe.user_appimage_theme {
        return None;
    }
    Some(adwaita_variant(probe.app_theme.as_deref()).to_string())
}

/// Map ReCue's theme onto an Adwaita variant. Unknown / missing → **dark**, matching
/// `DEFAULT_SETTINGS.theme` (`src/store.ts`), so a fresh install that never opened Settings
/// gets the dark dialog its dark UI implies.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn adwaita_variant(app_theme: Option<&str>) -> &'static str {
    match app_theme.map(|t| t.trim().to_ascii_lowercase()).as_deref() {
        Some("light") => "Adwaita:light",
        _ => "Adwaita:dark",
    }
}

/// Pull `settings.theme` out of the persisted store's bytes. Fail-open: malformed JSON, a
/// missing/`null` `settings`, a missing or non-string `theme` all yield `None` (→ dark).
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn theme_from_store_json(bytes: &[u8]) -> Option<String> {
    let value: serde_json::Value = serde_json::from_slice(bytes).ok()?;
    value
        .get("settings")?
        .get("theme")?
        .as_str()
        .map(str::to_string)
}

/// Where Tauri puts `sessions.json` on Linux: `dirs::data_dir()` (`$XDG_DATA_HOME` when
/// absolute, else `$HOME/.local/share`) joined with the app identifier. Reuses the shared
/// `path_env::home_dir()` seam rather than reading `$HOME` directly.
#[cfg(all(unix, not(target_os = "macos")))]
fn store_path() -> Option<std::path::PathBuf> {
    let data_dir = match std::env::var_os("XDG_DATA_HOME").map(std::path::PathBuf::from) {
        Some(dir) if dir.is_absolute() => dir,
        _ => crate::path_env::home_dir()?.join(".local/share"),
    };
    Some(data_dir.join(APP_IDENTIFIER).join(STORE_FILE))
}

/// Best-effort, read-only: ReCue's own theme from the persisted store (the `Store` itself
/// only exists after GTK init, so we read the file directly). Any miss → `None`.
#[cfg(all(unix, not(target_os = "macos")))]
fn read_app_theme() -> Option<String> {
    let bytes = std::fs::read(store_path()?).ok()?;
    theme_from_store_json(&bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn probe(
        in_appimage: bool,
        user_appimage_theme: bool,
        force: Option<&str>,
        app_theme: Option<&str>,
    ) -> GtkThemeProbe {
        GtkThemeProbe {
            in_appimage,
            user_appimage_theme,
            force: force.map(str::to_string),
            app_theme: app_theme.map(str::to_string),
        }
    }

    #[test]
    fn outside_an_appimage_the_env_is_left_alone() {
        // Dev run / .deb / distro package: the desktop's own GTK theme already applies —
        // forcing Adwaita there would be a downgrade.
        assert_eq!(
            gtk_theme_env(&probe(false, false, None, Some("dark"))),
            None
        );
        assert_eq!(
            gtk_theme_env(&probe(false, false, None, Some("light"))),
            None
        );
        assert_eq!(gtk_theme_env(&probe(false, false, None, None)), None);
    }

    #[test]
    fn appimage_defaults_to_dark_for_dark_missing_or_unknown_themes() {
        for theme in [Some("dark"), None, Some("solarized"), Some("")] {
            assert_eq!(
                gtk_theme_env(&probe(true, false, None, theme)).as_deref(),
                Some("Adwaita:dark"),
                "{theme:?}"
            );
        }
    }

    #[test]
    fn appimage_follows_a_light_recue_theme() {
        for theme in ["light", "LIGHT", " Light "] {
            assert_eq!(
                gtk_theme_env(&probe(true, false, None, Some(theme))).as_deref(),
                Some("Adwaita:light"),
                "{theme:?}"
            );
        }
    }

    #[test]
    fn user_set_appimage_gtk_theme_is_never_clobbered() {
        // The AppRun hook already copied APPIMAGE_GTK_THEME verbatim into GTK_THEME.
        assert_eq!(gtk_theme_env(&probe(true, true, None, Some("dark"))), None);
        assert_eq!(gtk_theme_env(&probe(true, true, None, Some("light"))), None);
    }

    #[test]
    fn recue_gtk_theme_force_wins_everywhere() {
        // Even outside an AppImage (the dev smoke test) …
        assert_eq!(
            gtk_theme_env(&probe(false, false, Some("Adwaita:dark"), Some("light"))).as_deref(),
            Some("Adwaita:dark")
        );
        // … and even against a user-set APPIMAGE_GTK_THEME.
        assert_eq!(
            gtk_theme_env(&probe(true, true, Some("Yaru-dark"), None)).as_deref(),
            Some("Yaru-dark")
        );
        // Whitespace around the value is trimmed.
        assert_eq!(
            gtk_theme_env(&probe(true, false, Some(" Adwaita:light "), Some("dark"))).as_deref(),
            Some("Adwaita:light")
        );
    }

    #[test]
    fn blank_force_value_is_treated_as_unset() {
        assert_eq!(gtk_theme_env(&probe(false, false, Some("  "), None)), None);
        assert_eq!(
            gtk_theme_env(&probe(true, false, Some(""), Some("light"))).as_deref(),
            Some("Adwaita:light")
        );
    }

    #[test]
    fn adwaita_variant_defaults_to_dark() {
        assert_eq!(adwaita_variant(Some("light")), "Adwaita:light");
        assert_eq!(adwaita_variant(Some("  LiGhT ")), "Adwaita:light");
        assert_eq!(adwaita_variant(Some("dark")), "Adwaita:dark");
        assert_eq!(adwaita_variant(Some("nonsense")), "Adwaita:dark");
        assert_eq!(adwaita_variant(None), "Adwaita:dark");
    }

    #[test]
    fn theme_from_store_json_reads_the_settings_blob() {
        let json = br#"{"sessions":[],"settings":{"theme":"light","accent":""}}"#;
        assert_eq!(theme_from_store_json(json).as_deref(), Some("light"));

        let json = br#"{"settings":{"theme":"dark"}}"#;
        assert_eq!(theme_from_store_json(json).as_deref(), Some("dark"));
    }

    #[test]
    fn theme_from_store_json_fails_open() {
        for bad in [
            &b"not json at all"[..],
            b"",
            b"{}",
            br#"{"settings":null}"#,
            br#"{"settings":{}}"#,
            br#"{"settings":{"theme":42}}"#,
            br#"{"settings":"dark"}"#,
            br#"[]"#,
        ] {
            assert_eq!(
                theme_from_store_json(bad),
                None,
                "{:?}",
                String::from_utf8_lossy(bad)
            );
        }
    }

    #[test]
    fn app_identifier_matches_tauri_conf() {
        // Drift guard: `store_path()` re-derives Tauri's `app_data_dir()` by hand, so the
        // identifier must stay in lockstep with the bundle config.
        let cfg: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
            .expect("tauri.conf.json parses");
        assert_eq!(cfg["identifier"], APP_IDENTIFIER);
    }
}
