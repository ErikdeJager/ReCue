//! The shared **pre-GTK** settings reader (#357).
//!
//! Two boot-time decisions must read a persisted ReCue setting *before* `tauri::Builder`
//! exists: the WebKitGTK DMA-BUF renderer ([`crate::linux_webkit`], `linuxDmabufRenderer`)
//! and the GTK dialog theme ([`crate::linux_gtk`], `theme`). Both are env vars GTK/WebKit
//! read **once at init**, so they have to be exported before the app is built — but Tauri's
//! `Store` is only constructed inside `.setup()`, i.e. *after* GTK init. There is no seam
//! in between.
//!
//! So this module reads `sessions.json` out of the app-data dir **itself**: read-only, one
//! `fs::read` of a few kB, before any thread spawns. It re-derives Tauri's Linux
//! `app_data_dir()` rule by hand (`$XDG_DATA_HOME` when absolute, else
//! `$HOME/.local/share`, joined with the bundle identifier), which is guarded against
//! drift by the `include_str!("../tauri.conf.json")` test below.
//!
//! Everything is **fail-open**: a missing file, malformed JSON, a missing `settings`
//! object, or a missing/blank key all yield `None`, and every caller then falls back to
//! its default (auto detection / the dark theme) — i.e. exactly the behavior before the
//! setting existed. It is never a crash and never a write.
//!
//! The settings blob's keys are the **TS field names verbatim** (camelCase — the
//! `agents.rs::read_custom_command` precedent), so `settings_str(&s, "linuxDmabufRenderer")`
//! reads `Settings.linuxDmabufRenderer` from `src/types/index.ts`.
//!
//! Like `path_env` / `linux_webkit` / `linux_gtk`, the module compiles everywhere and the
//! real work is cfg-gated inside; the pure helpers are widened with `, test)` (the
//! `reveal_file_linux` precedent) so the macOS/Windows hosts still type-check and unit-test
//! them, while the impure Linux path resolution + file read stay Linux-only.

/// ReCue's app identifier — mirrors `tauri.conf.json`'s `identifier`, which Tauri joins
/// onto the XDG data dir to form `app_data_dir()`. Guarded by a drift test below.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) const APP_IDENTIFIER: &str = "com.recue.app";

/// The persisted store's filename — mirrors `lib.rs`'s `app_data_dir().join(...)`.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) const STORE_FILE: &str = "sessions.json";

/// Pull the opaque `settings` object out of the persisted store's bytes. Fail-open:
/// malformed JSON, a missing / `null` / non-object `settings` all yield `None`.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn settings_from_store_json(bytes: &[u8]) -> Option<serde_json::Value> {
    let value: serde_json::Value = serde_json::from_slice(bytes).ok()?;
    let settings = value.get("settings")?;
    settings.is_object().then(|| settings.clone())
}

/// Read one **string** key out of the settings blob, trimmed. `None` for a missing key, a
/// non-string value, or a blank string — so a caller can treat "absent" and "garbage"
/// identically (both fall back to its default).
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn settings_str(settings: &serde_json::Value, key: &str) -> Option<String> {
    let raw = settings.get(key)?.as_str()?.trim();
    (!raw.is_empty()).then(|| raw.to_string())
}

/// Where Tauri puts `sessions.json` on Linux: `dirs::data_dir()` joined with the app
/// identifier and the store filename.
///
/// `$XDG_DATA_HOME` is honored **only when absolute** (the XDG spec's rule, which the
/// `dirs` crate Tauri uses enforces); otherwise `$HOME/.local/share`. The absolute check is
/// a literal leading-`/` test rather than `Path::is_absolute` so this pure fn gives the
/// **Linux** answer even when compiled into a Windows test host (where `/xdg` has no drive
/// prefix and would read as relative).
///
/// Pass `home` from the shared [`crate::path_env::home_dir`] seam — never a raw `$HOME`.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn linux_store_path(
    xdg_data_home: Option<&str>,
    home: Option<&std::path::Path>,
) -> Option<std::path::PathBuf> {
    let data_dir = match xdg_data_home.filter(|dir| dir.starts_with('/')) {
        Some(dir) => std::path::PathBuf::from(dir),
        None => home?.join(".local/share"),
    };
    Some(data_dir.join(APP_IDENTIFIER).join(STORE_FILE))
}

/// The settings blob from a store file at `path`. Fail-open: a missing/unreadable file or
/// any JSON that doesn't carry a `settings` **object** yields `None`.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn read_settings_at(path: &std::path::Path) -> Option<serde_json::Value> {
    let bytes = std::fs::read(path).ok()?;
    settings_from_store_json(&bytes)
}

/// ReCue's persisted settings blob, read directly off disk before the app exists
/// (Linux only — the two callers are both Linux boot-env workarounds). Any miss → `None`.
#[cfg(all(unix, not(target_os = "macos")))]
pub(crate) fn read_settings() -> Option<serde_json::Value> {
    let xdg = std::env::var("XDG_DATA_HOME").ok();
    let home = crate::path_env::home_dir();
    let path = linux_store_path(xdg.as_deref(), home.as_deref())?;
    read_settings_at(&path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};

    /// A realistic `sessions.json` head: the settings blob is one key among many, and its
    /// keys are the TS field names verbatim.
    const STORE_JSON: &[u8] = br#"{
        "sessions": [],
        "recents": ["/home/u/code"],
        "settings": {
            "theme": "light",
            "linuxDmabufRenderer": "off",
            "linuxTerminalRenderer": " DOM ",
            "terminalFontSize": 12.5,
            "blank": "   "
        }
    }"#;

    // --- settings_from_store_json ----------------------------------------------------

    #[test]
    fn settings_from_store_json_returns_the_blob() {
        let settings = settings_from_store_json(STORE_JSON).expect("a settings object");
        assert!(settings.is_object());
        assert_eq!(settings["theme"], "light");
        assert_eq!(settings["linuxDmabufRenderer"], "off");
    }

    #[test]
    fn settings_from_store_json_fails_open() {
        for bad in [
            &b"not json at all"[..],
            b"",
            b"{}",
            br#"{"settings":null}"#,
            br#"{"settings":"dark"}"#, // present but not an object
            br#"{"settings":[]}"#,
            br#"{"settings":42}"#,
            br#"[]"#,
            br#"{"sessions":[]}"#,
        ] {
            assert_eq!(
                settings_from_store_json(bad),
                None,
                "{:?}",
                String::from_utf8_lossy(bad)
            );
        }
        // An *empty* settings object is still a valid object — the per-key read below is
        // what fails open for a missing key.
        assert_eq!(
            settings_from_store_json(br#"{"settings":{}}"#),
            Some(serde_json::json!({}))
        );
    }

    // --- settings_str ----------------------------------------------------------------

    #[test]
    fn settings_str_reads_and_trims_a_string_key() {
        let settings = settings_from_store_json(STORE_JSON).unwrap();
        assert_eq!(
            settings_str(&settings, "linuxDmabufRenderer").as_deref(),
            Some("off")
        );
        assert_eq!(settings_str(&settings, "theme").as_deref(), Some("light"));
        // Trimmed (the value is stored as " DOM ").
        assert_eq!(
            settings_str(&settings, "linuxTerminalRenderer").as_deref(),
            Some("DOM")
        );
    }

    #[test]
    fn settings_str_fails_open_for_missing_non_string_and_blank() {
        let settings = settings_from_store_json(STORE_JSON).unwrap();
        assert_eq!(settings_str(&settings, "nopeNotAKey"), None);
        assert_eq!(settings_str(&settings, "terminalFontSize"), None); // a number
        assert_eq!(settings_str(&settings, "blank"), None); // whitespace only
    }

    // --- linux_store_path -------------------------------------------------------------

    #[test]
    fn linux_store_path_prefers_an_absolute_xdg_data_home() {
        assert_eq!(
            linux_store_path(Some("/xdg"), Some(Path::new("/home/u"))),
            Some(PathBuf::from("/xdg").join(APP_IDENTIFIER).join(STORE_FILE))
        );
        // No home needed when XDG_DATA_HOME resolves.
        assert_eq!(
            linux_store_path(Some("/xdg"), None),
            Some(PathBuf::from("/xdg").join(APP_IDENTIFIER).join(STORE_FILE))
        );
    }

    #[test]
    fn linux_store_path_falls_back_to_home_local_share() {
        let expected = Some(
            PathBuf::from("/home/u")
                .join(".local/share")
                .join(APP_IDENTIFIER)
                .join(STORE_FILE),
        );
        assert_eq!(linux_store_path(None, Some(Path::new("/home/u"))), expected);
        // A *relative* (or empty) XDG_DATA_HOME is ignored, mirroring the `dirs` crate.
        assert_eq!(
            linux_store_path(Some("relative/share"), Some(Path::new("/home/u"))),
            expected
        );
        assert_eq!(
            linux_store_path(Some(""), Some(Path::new("/home/u"))),
            expected
        );
    }

    #[test]
    fn linux_store_path_needs_something_to_go_on() {
        assert_eq!(linux_store_path(None, None), None);
        assert_eq!(linux_store_path(Some("relative/share"), None), None);
    }

    // --- read_settings_at --------------------------------------------------------------

    #[test]
    fn read_settings_at_round_trips_a_real_file() {
        // The `store.rs` / `files.rs` test precedent: a temp file, no new dependency.
        let path = std::env::temp_dir().join(format!(
            "recue-early-settings-{}-{:?}.json",
            std::process::id(),
            std::thread::current().id()
        ));
        std::fs::write(&path, STORE_JSON).expect("write the temp store");
        let settings = read_settings_at(&path).expect("the settings blob");
        assert_eq!(
            settings_str(&settings, "linuxDmabufRenderer").as_deref(),
            Some("off")
        );
        let _ = std::fs::remove_file(&path);

        // Gone again → fail-open.
        assert_eq!(read_settings_at(&path), None);
    }

    #[test]
    fn read_settings_at_fails_open_for_a_missing_or_garbage_file() {
        assert_eq!(read_settings_at(Path::new("/definitely/not/a/file")), None);

        let path = std::env::temp_dir().join(format!(
            "recue-early-settings-garbage-{}-{:?}.json",
            std::process::id(),
            std::thread::current().id()
        ));
        std::fs::write(&path, b"{ not json").expect("write the temp store");
        assert_eq!(read_settings_at(&path), None);
        let _ = std::fs::remove_file(&path);
    }

    // --- the drift guard -----------------------------------------------------------------

    #[test]
    fn app_identifier_matches_tauri_conf() {
        // `linux_store_path` re-derives Tauri's `app_data_dir()` by hand, so the identifier
        // must stay in lockstep with the bundle config — otherwise the read silently misses
        // and both callers quietly fall back to their defaults.
        let cfg: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
            .expect("tauri.conf.json parses");
        assert_eq!(cfg["identifier"], APP_IDENTIFIER);
    }
}
