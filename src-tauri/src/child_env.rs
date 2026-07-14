//! Scrub the AppImage-injected environment out of every child process (#350).
//!
//! A Linux **AppImage** mounts its payload read-only at a transient FUSE mountpoint
//! (`/tmp/.mount_ReCueXXXXXX`) and execs an `AppRun` script. That runtime — plus the
//! `linuxdeploy-plugin-gtk` hook Tauri bundles with — exports a pile of variables meant
//! for **ReCue's own webview**, never for a child process:
//!
//! - bookkeeping: `APPDIR`, `APPIMAGE`, `APPIMAGE_UUID`, `ARGV0`, `OWD`,
//! - forced scalars: `GTK_THEME=Adwaita:light`, `GDK_BACKEND=x11`,
//! - `$APPDIR`-prefixed path vars: `PATH`, `LD_LIBRARY_PATH`, `XDG_DATA_DIRS`,
//!   `GSETTINGS_SCHEMA_DIR`, `GIO_MODULE_DIR`, `GDK_PIXBUF_MODULE_FILE`,
//!   `GI_TYPELIB_PATH`, `PYTHONPATH`, `PERLLIB`, `QT_PLUGIN_PATH`, …
//!
//! Inherited by a child, that env is documented to break `xdg-open` and to degrade or
//! outright break system binaries (a `git` / `claude` / shell picking up the AppImage's
//! bundled libraries through `LD_LIBRARY_PATH`). See tauri-apps/tauri#10617 and
//! AppImage/AppImageKit#124.
//!
//! This module is the single seam every spawn goes through:
//! [`child_env_vars`] (the PTY env snapshot for `portable_pty::CommandBuilder`),
//! [`scrub_command`] (mutate an already-built `std::process::Command`) and
//! [`command`] (construct one). `git::hidden_command` is the console-flash-guarded
//! sibling for `git` / `<cli> --version` probes and applies the same scrub.
//!
//! The rule is **value-based**, not an exhaustive var list: any `:`-separated segment
//! that lives under `$APPDIR` (or under the `/tmp/.mount_` prefix) is stripped from
//! **any** variable, so a future AppRun's new path vars are covered automatically.
//!
//! It arms **only** when `APPDIR` or `APPIMAGE` is set, so it is a byte-for-byte no-op
//! on macOS, on Windows, and on a non-AppImage Linux build (dev, `.deb`, pacman) — the
//! first unit test pins that identity property. Like `linux_webkit` / `path_env`, the
//! module compiles on every OS with the real work cfg-gated **inside** (so callers stay
//! arm-free), and the pure decision helpers widen their cfg with `, test)` (the
//! `explorer_select_arg` / `reveal_file_linux` precedent) so the macOS/Windows hosts
//! still type-check and unit-test them.
//!
//! `WEBKIT_DISABLE_DMABUF_RENDERER` is deliberately **not** stripped: #346/#347 set it for
//! ReCue's own webview (and since #347 only where DMA-BUF is genuinely bad — a hybrid
//! iGPU+dGPU box never exports it at all), it is not AppImage-injected, and it is inert for
//! CLI children.

/// AppImage runtime / `AppRun` bookkeeping — never meaningful to a child.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
const MARKER_VARS: &[&str] = &["APPDIR", "APPIMAGE", "APPIMAGE_UUID", "ARGV0", "OWD"];

/// Scalars the tauri `linuxdeploy-plugin-gtk` AppRun hook forces for the *webview*.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
const FORCED_VARS: &[&str] = &["GTK_THEME", "GDK_BACKEND"];

/// Where the AppImage runtime mounts the payload (used when `APPDIR` is absent/odd —
/// e.g. `--appimage-extract-and-run`, or an AppRun that only exports `APPIMAGE`).
#[cfg(any(all(unix, not(target_os = "macos")), test))]
const MOUNT_PREFIX: &str = "/tmp/.mount_";

/// Some AppRun variants stash the pre-AppImage value of a var they overwrite here.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
const ORIGINAL_PREFIX: &str = "APPIMAGE_ORIGINAL_";

/// Vars that must never end up unset/empty in a child, whatever the filter says — an
/// agent/shell with no `PATH` at all is worse than one with a stale segment.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
const NEVER_UNSET: &[&str] = &["PATH"];

/// Does this `:`-separated segment belong to the AppImage mount? True when it *is*
/// `$APPDIR`, sits under `$APPDIR/`, or starts with the `/tmp/.mount_` prefix. An
/// empty segment is never "AppImage-owned" (it is dropped separately).
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn is_appimage_segment(seg: &str, appdir: Option<&str>) -> bool {
    if seg.is_empty() {
        return false;
    }
    if let Some(dir) = appdir.filter(|d| !d.is_empty()) {
        if seg
            .strip_prefix(dir)
            .is_some_and(|rest| rest.is_empty() || rest.starts_with('/'))
        {
            return true;
        }
    }
    seg.starts_with(MOUNT_PREFIX)
}

/// Strip the AppImage-owned segments from a `:`-separated value.
///
/// `None` means **no change** — not one segment was AppImage-owned, so the value is
/// passed through byte-for-byte (never normalized). Otherwise the remaining **non-empty**
/// segments, rejoined with `:` (possibly `""`, which the caller turns into a drop). An
/// empty segment is never emitted: to the dynamic loader an empty `LD_LIBRARY_PATH`
/// segment means the current working directory.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn filter_segments(value: &str, appdir: Option<&str>) -> Option<String> {
    if !value.split(':').any(|seg| is_appimage_segment(seg, appdir)) {
        return None;
    }
    let kept: Vec<&str> = value
        .split(':')
        .filter(|seg| !seg.is_empty() && !is_appimage_segment(seg, appdir))
        .collect();
    Some(kept.join(":"))
}

/// The whole rule, as a pure map → map (order-preserving).
///
/// `appdir` / `appimage` are read **from `vars` itself**, so the function is pure and
/// host-independent. With **neither** present the input is returned unchanged — the
/// dev / `.deb` / pacman / macOS / Windows no-op.
///
/// Per key: `APPIMAGE_ORIGINAL_*` bookkeeping and the marker vars are dropped; a forced
/// scalar (`GTK_THEME` / `GDK_BACKEND`) is restored from its `APPIMAGE_ORIGINAL_<VAR>`
/// backup if one exists, else dropped; any var with a backup is restored verbatim;
/// otherwise the AppImage-owned segments are stripped, and a var whose segments were
/// *all* AppImage-owned is removed entirely — except a [`NEVER_UNSET`] var, which keeps
/// its original value.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn scrub_env(vars: &[(String, String)]) -> Vec<(String, String)> {
    let appdir_raw = vars
        .iter()
        .find(|(key, _)| key == "APPDIR")
        .map(|(_, value)| value.as_str());
    let in_appimage = appdir_raw.is_some() || vars.iter().any(|(key, _)| key == "APPIMAGE");
    if !in_appimage {
        return vars.to_vec();
    }

    // Trim a trailing `/` so `$APPDIR` compares cleanly against a path segment.
    let appdir = appdir_raw
        .map(|dir| dir.trim_end_matches('/'))
        .filter(|dir| !dir.is_empty());

    let originals: std::collections::HashMap<&str, &str> = vars
        .iter()
        .filter_map(|(key, value)| {
            key.strip_prefix(ORIGINAL_PREFIX)
                .filter(|name| !name.is_empty())
                .map(|name| (name, value.as_str()))
        })
        .collect();

    let mut out: Vec<(String, String)> = Vec::with_capacity(vars.len());
    for (key, value) in vars {
        let name = key.as_str();
        if name.starts_with(ORIGINAL_PREFIX) || MARKER_VARS.contains(&name) {
            continue;
        }
        if FORCED_VARS.contains(&name) {
            if let Some(original) = originals.get(name) {
                out.push((key.clone(), (*original).to_string()));
            }
            continue;
        }
        if let Some(original) = originals.get(name) {
            out.push((key.clone(), (*original).to_string()));
            continue;
        }
        match filter_segments(value, appdir) {
            None => out.push((key.clone(), value.clone())),
            Some(filtered) if !filtered.is_empty() => out.push((key.clone(), filtered)),
            // Every segment was AppImage-owned: drop the var (a consumer then falls back
            // to its FreeDesktop default, which is the pre-AppImage state) — unless it is
            // one we must never unset.
            Some(_) if NEVER_UNSET.contains(&name) => out.push((key.clone(), value.clone())),
            Some(_) => {}
        }
    }
    out
}

/// Diff two env maps into the overrides a `std::process::Command` needs:
/// `(keys_to_remove, pairs_to_set)`. Both are empty when the maps are equal — which is
/// how `scrub_command` makes **zero** `env`/`env_remove` calls outside an AppImage.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn env_diff(
    before: &[(String, String)],
    after: &[(String, String)],
) -> (Vec<String>, Vec<(String, String)>) {
    let before_map: std::collections::HashMap<&str, &str> = before
        .iter()
        .map(|(key, value)| (key.as_str(), value.as_str()))
        .collect();
    let after_map: std::collections::HashMap<&str, &str> = after
        .iter()
        .map(|(key, value)| (key.as_str(), value.as_str()))
        .collect();

    let removed: Vec<String> = before
        .iter()
        .filter(|(key, _)| !after_map.contains_key(key.as_str()))
        .map(|(key, _)| key.clone())
        .collect();
    let set: Vec<(String, String)> = after
        .iter()
        .filter(|(key, value)| before_map.get(key.as_str()) != Some(&value.as_str()))
        .cloned()
        .collect();
    (removed, set)
}

/// This process's environment as UTF-8 pairs (the only ones an AppImage can have set).
#[cfg(all(unix, not(target_os = "macos")))]
fn process_env_utf8() -> Vec<(String, String)> {
    std::env::vars_os()
        .filter_map(
            |(key, value)| match (key.into_string(), value.into_string()) {
                (Ok(key), Ok(value)) => Some((key, value)),
                _ => None,
            },
        )
        .collect()
}

/// Scrub an `OsString` env snapshot: the UTF-8 pairs go through [`scrub_env`], the
/// (impossible-to-be-AppImage) non-UTF-8 pairs are passed through verbatim. A child's
/// env is a map, so the ordering between the two groups is not meaningful.
#[cfg(all(unix, not(target_os = "macos")))]
fn scrub_os_vars(
    vars: Vec<(std::ffi::OsString, std::ffi::OsString)>,
) -> Vec<(std::ffi::OsString, std::ffi::OsString)> {
    let mut utf8: Vec<(String, String)> = Vec::with_capacity(vars.len());
    let mut other: Vec<(std::ffi::OsString, std::ffi::OsString)> = Vec::new();
    for (key, value) in vars {
        match (key.into_string(), value.into_string()) {
            (Ok(key), Ok(value)) => utf8.push((key, value)),
            (Ok(key), Err(value)) => other.push((std::ffi::OsString::from(key), value)),
            (Err(key), Ok(value)) => other.push((key, std::ffi::OsString::from(value))),
            (Err(key), Err(value)) => other.push((key, value)),
        }
    }
    let mut out: Vec<(std::ffi::OsString, std::ffi::OsString)> = scrub_env(&utf8)
        .into_iter()
        .map(|(key, value)| {
            (
                std::ffi::OsString::from(key),
                std::ffi::OsString::from(value),
            )
        })
        .collect();
    out.extend(other);
    out
}

/// The environment a PTY child should get: this process's env, AppImage-scrubbed on
/// Linux (#350) — and byte-for-byte `std::env::vars_os()` on macOS/Windows and outside
/// an AppImage. `portable_pty::CommandBuilder` starts from an **empty** env set, so a
/// var omitted here is genuinely absent from the child.
pub(crate) fn child_env_vars() -> Vec<(std::ffi::OsString, std::ffi::OsString)> {
    let vars: Vec<(std::ffi::OsString, std::ffi::OsString)> = std::env::vars_os().collect();
    #[cfg(all(unix, not(target_os = "macos")))]
    let vars = scrub_os_vars(vars);
    vars
}

/// Apply the AppImage scrub to an already-built `std::process::Command` (#350).
///
/// On macOS/Windows this is a **no-op** — not one `env`/`env_remove` call is added, so
/// those `Command`s are byte-for-byte what they were before. On Linux outside an
/// AppImage the diff is empty, so likewise nothing is touched.
pub(crate) fn scrub_command(cmd: &mut std::process::Command) {
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let before = process_env_utf8();
        let after = scrub_env(&before);
        let (removed, set) = env_diff(&before, &after);
        for key in removed {
            cmd.env_remove(key);
        }
        for (key, value) in set {
            cmd.env(key, value);
        }
    }
    #[cfg(not(all(unix, not(target_os = "macos"))))]
    {
        let _ = cmd;
    }
}

/// Construct a `std::process::Command` for an OS helper (`xdg-open` / `dbus-send` /
/// macOS `open` / `explorer.exe` / `cmd` / the login `$SHELL`) with the AppImage scrub
/// applied (#350). `git::hidden_command` is the console-flash-guarded sibling used for
/// `git` and `<cli> --version` probes; the OS openers deliberately use *this* one so
/// the macOS/Windows `Command` stays exactly as it is today (no `CREATE_NO_WINDOW` on
/// `explorer.exe` / `cmd /C start`).
pub(crate) fn command(program: impl AsRef<std::ffi::OsStr>) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    scrub_command(&mut cmd);
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pairs(vars: &[(&str, &str)]) -> Vec<(String, String)> {
        vars.iter()
            .map(|(key, value)| ((*key).to_string(), (*value).to_string()))
            .collect()
    }

    fn get<'a>(vars: &'a [(String, String)], key: &str) -> Option<&'a str> {
        vars.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str())
    }

    /// The AppImage env as the tauri/linuxdeploy AppRun leaves it.
    fn appimage_env() -> Vec<(String, String)> {
        pairs(&[
            ("APPDIR", "/tmp/.mount_ReCueAb12"),
            ("APPIMAGE", "/home/u/Apps/ReCue.AppImage"),
            ("APPIMAGE_UUID", "abc123"),
            ("ARGV0", "./ReCue.AppImage"),
            ("OWD", "/home/u"),
            ("GTK_THEME", "Adwaita:light"),
            ("GDK_BACKEND", "x11"),
            (
                "PATH",
                "/tmp/.mount_ReCueAb12/usr/bin:/home/u/.local/bin:/usr/bin",
            ),
            ("LD_LIBRARY_PATH", "/tmp/.mount_ReCueAb12/usr/lib"),
            (
                "XDG_DATA_DIRS",
                "/tmp/.mount_ReCueAb12/usr/share:/usr/local/share:/usr/share",
            ),
            (
                "GSETTINGS_SCHEMA_DIR",
                "/tmp/.mount_ReCueAb12/usr/share/glib-2.0/schemas",
            ),
            (
                "GIO_MODULE_DIR",
                "/tmp/.mount_ReCueAb12/usr/lib/gio/modules",
            ),
            (
                "GDK_PIXBUF_MODULE_FILE",
                "/tmp/.mount_ReCueAb12/usr/lib/gdk-pixbuf/loaders.cache",
            ),
            ("HOME", "/home/u"),
            ("SHELL", "/bin/zsh"),
            ("TERM", "xterm-256color"),
            ("LANG", "en_US.UTF-8"),
            ("ANTHROPIC_API_KEY", "sk-secret"),
        ])
    }

    #[test]
    fn scrub_env_is_identity_without_appdir_or_appimage() {
        // The dev / .deb / pacman / macOS / Windows no-op: same pairs, same order, same
        // values — even though the AppImage-ish var *names* are all present.
        let env = pairs(&[
            ("PATH", "/usr/local/bin:/usr/bin"),
            ("GTK_THEME", "Adwaita:dark"),
            ("GDK_BACKEND", "wayland"),
            ("LD_LIBRARY_PATH", "/opt/cuda/lib64"),
            ("XDG_DATA_DIRS", "/usr/local/share:/usr/share"),
            ("HOME", "/home/u"),
        ]);
        assert_eq!(scrub_env(&env), env);
    }

    #[test]
    fn scrub_env_drops_marker_and_forced_vars() {
        let out = scrub_env(&appimage_env());
        for key in [
            "APPDIR",
            "APPIMAGE",
            "APPIMAGE_UUID",
            "ARGV0",
            "OWD",
            "GTK_THEME",
            "GDK_BACKEND",
        ] {
            assert_eq!(get(&out, key), None, "{key} should be scrubbed");
        }
    }

    #[test]
    fn scrub_env_strips_appimage_path_segments() {
        let out = scrub_env(&appimage_env());
        assert_eq!(
            get(&out, "XDG_DATA_DIRS"),
            Some("/usr/local/share:/usr/share")
        );
        assert_eq!(get(&out, "PATH"), Some("/home/u/.local/bin:/usr/bin"));
    }

    #[test]
    fn scrub_env_removes_vars_that_were_all_appimage() {
        let out = scrub_env(&appimage_env());
        // Not set to "" — an empty LD_LIBRARY_PATH segment means CWD to the loader.
        for key in [
            "LD_LIBRARY_PATH",
            "GSETTINGS_SCHEMA_DIR",
            "GIO_MODULE_DIR",
            "GDK_PIXBUF_MODULE_FILE",
        ] {
            assert_eq!(get(&out, key), None, "{key} should be removed entirely");
        }
    }

    #[test]
    fn scrub_env_keeps_user_vars_verbatim_and_emits_no_empty_segment() {
        let out = scrub_env(&appimage_env());
        assert_eq!(get(&out, "HOME"), Some("/home/u"));
        assert_eq!(get(&out, "SHELL"), Some("/bin/zsh"));
        assert_eq!(get(&out, "TERM"), Some("xterm-256color"));
        assert_eq!(get(&out, "LANG"), Some("en_US.UTF-8"));
        assert_eq!(get(&out, "ANTHROPIC_API_KEY"), Some("sk-secret"));
        for (key, value) in &out {
            assert!(
                !value.split(':').any(|seg| seg.is_empty()),
                "{key}={value:?} carries an empty segment"
            );
        }
    }

    #[test]
    fn scrub_env_never_unsets_path() {
        // Even when every PATH segment is AppImage-owned, PATH keeps its original value
        // (a child with no PATH at all is worse than one with a stale segment).
        let env = pairs(&[
            ("APPDIR", "/tmp/.mount_ReCueAb12"),
            (
                "PATH",
                "/tmp/.mount_ReCueAb12/usr/bin:/tmp/.mount_ReCueAb12/usr/sbin",
            ),
            ("LD_LIBRARY_PATH", "/tmp/.mount_ReCueAb12/usr/lib"),
        ]);
        let out = scrub_env(&env);
        assert_eq!(
            get(&out, "PATH"),
            Some("/tmp/.mount_ReCueAb12/usr/bin:/tmp/.mount_ReCueAb12/usr/sbin")
        );
        assert_eq!(get(&out, "LD_LIBRARY_PATH"), None);
    }

    #[test]
    fn scrub_env_restores_appimage_original_backups() {
        let env = pairs(&[
            ("APPDIR", "/tmp/.mount_ReCueAb12"),
            ("APPIMAGE_ORIGINAL_XDG_DATA_DIRS", "/usr/share"),
            ("APPIMAGE_ORIGINAL_GTK_THEME", "Adwaita:dark"),
            (
                "XDG_DATA_DIRS",
                "/tmp/.mount_ReCueAb12/usr/share:/usr/local/share:/usr/share",
            ),
            ("GTK_THEME", "Adwaita:light"),
        ]);
        let out = scrub_env(&env);
        // The backup wins verbatim…
        assert_eq!(get(&out, "XDG_DATA_DIRS"), Some("/usr/share"));
        assert_eq!(get(&out, "GTK_THEME"), Some("Adwaita:dark"));
        // …and the bookkeeping keys themselves never reach the child.
        assert_eq!(get(&out, "APPIMAGE_ORIGINAL_XDG_DATA_DIRS"), None);
        assert_eq!(get(&out, "APPIMAGE_ORIGINAL_GTK_THEME"), None);
    }

    #[test]
    fn scrub_env_arms_on_appimage_alone_via_mount_prefix() {
        // `--appimage-extract-and-run` / an odd AppRun: APPIMAGE is set but APPDIR is
        // not, so the mount prefix is the only handle on the injected segments.
        let env = pairs(&[
            ("APPIMAGE", "/home/u/Apps/ReCue.AppImage"),
            (
                "PATH",
                "/tmp/.mount_ReCueXy99/usr/bin:/usr/bin:/tmp/.mount_ReCueXy99/bin",
            ),
            ("LD_LIBRARY_PATH", "/tmp/.mount_ReCueXy99/usr/lib:/opt/lib"),
            ("HOME", "/home/u"),
        ]);
        let out = scrub_env(&env);
        assert_eq!(get(&out, "APPIMAGE"), None);
        assert_eq!(get(&out, "PATH"), Some("/usr/bin"));
        assert_eq!(get(&out, "LD_LIBRARY_PATH"), Some("/opt/lib"));
        assert_eq!(get(&out, "HOME"), Some("/home/u"));
    }

    #[test]
    fn scrub_env_is_idempotent() {
        let once = scrub_env(&appimage_env());
        assert_eq!(scrub_env(&once), once);
    }

    #[test]
    fn is_appimage_segment_matches_appdir_and_mount_prefix() {
        let appdir = Some("/tmp/.mount_ReCueAb12");
        assert!(is_appimage_segment("/tmp/.mount_ReCueAb12", appdir));
        assert!(is_appimage_segment("/tmp/.mount_ReCueAb12/usr/bin", appdir));
        // Another AppImage's mount is caught by the prefix, with or without an APPDIR.
        assert!(is_appimage_segment("/tmp/.mount_Other99/usr/bin", appdir));
        assert!(is_appimage_segment("/tmp/.mount_Other99/usr/bin", None));
        assert!(!is_appimage_segment("/usr/bin", appdir));
        assert!(!is_appimage_segment("", appdir));
        // A path that merely *starts with the same characters* as APPDIR is not under it
        // (an extracted AppDir — `--appimage-extract-and-run` — lives outside /tmp/.mount_).
        let extracted = Some("/home/u/squashfs-root");
        assert!(is_appimage_segment("/home/u/squashfs-root", extracted));
        assert!(is_appimage_segment(
            "/home/u/squashfs-root/usr/bin",
            extracted
        ));
        assert!(!is_appimage_segment(
            "/home/u/squashfs-root2/bin",
            extracted
        ));
        assert!(!is_appimage_segment("/tmp/.mountain/bin", None));
    }

    #[test]
    fn filter_segments_passes_untouched_values_through_as_none() {
        // No AppImage segment → None (no change at all; the value is never normalized,
        // so a legitimately empty segment in a user's PATH survives verbatim).
        assert_eq!(
            filter_segments("/usr/bin::/bin", Some("/tmp/.mount_ReCueAb12")),
            None
        );
        assert_eq!(
            filter_segments(
                "/tmp/.mount_ReCueAb12/usr/bin::/bin",
                Some("/tmp/.mount_ReCueAb12")
            ),
            Some("/bin".to_string())
        );
        assert_eq!(
            filter_segments(
                "/tmp/.mount_ReCueAb12/usr/lib",
                Some("/tmp/.mount_ReCueAb12")
            ),
            Some(String::new())
        );
    }

    #[test]
    fn env_diff_reports_removals_and_changes() {
        let before = pairs(&[
            ("APPDIR", "/tmp/.mount_ReCueAb12"),
            ("PATH", "/tmp/.mount_ReCueAb12/usr/bin:/usr/bin"),
            ("HOME", "/home/u"),
        ]);
        let after = scrub_env(&before);
        let (removed, set) = env_diff(&before, &after);
        assert_eq!(removed, vec!["APPDIR".to_string()]);
        assert_eq!(set, vec![("PATH".to_string(), "/usr/bin".to_string())]);
    }

    #[test]
    fn env_diff_of_equal_maps_is_empty() {
        let env = pairs(&[("PATH", "/usr/bin"), ("HOME", "/home/u")]);
        let (removed, set) = env_diff(&env, &env);
        assert!(removed.is_empty());
        assert!(set.is_empty());
    }

    #[test]
    fn child_env_vars_snapshots_the_process_env() {
        let vars = child_env_vars();
        assert!(!vars.is_empty());
        // Whatever the host, PATH survives the snapshot (NEVER_UNSET guarantees it even
        // under an AppImage).
        if std::env::var_os("PATH").is_some() {
            assert!(vars.iter().any(|(key, _)| key == "PATH"));
        }
        // The scrub is idempotent, so nothing AppImage-ish can survive it on Linux.
        if cfg!(all(unix, not(target_os = "macos"))) {
            assert!(!vars.iter().any(|(key, _)| key == "APPDIR"));
        }
    }

    #[test]
    fn command_builds_the_program_and_adds_no_env_overrides_outside_an_appimage() {
        let cmd = command("echo");
        assert_eq!(cmd.get_program(), std::ffi::OsStr::new("echo"));
        // The test runner is never an AppImage, so the diff is empty and **no** env /
        // env_remove call was made — the macOS/Windows/dev Command is byte-for-byte the
        // one we would have built by hand.
        if std::env::var_os("APPDIR").is_none() && std::env::var_os("APPIMAGE").is_none() {
            assert_eq!(cmd.get_envs().count(), 0);
        }
    }

    #[test]
    fn scrub_command_leaves_an_existing_command_intact() {
        let mut cmd = std::process::Command::new("git");
        cmd.arg("status");
        scrub_command(&mut cmd);
        assert_eq!(cmd.get_program(), std::ffi::OsStr::new("git"));
        assert_eq!(
            cmd.get_args().collect::<Vec<_>>(),
            vec![std::ffi::OsStr::new("status")]
        );
    }
}
