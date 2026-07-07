//! Restore the user's real `PATH` for GUI launches (macOS + Linux, #345).
//!
//! A bundled `.app` launched from Finder/Dock inherits **launchd's** minimal PATH
//! (`/usr/bin:/bin:/usr/sbin:/sbin`), *not* the PATH the user has in a terminal — so
//! `claude` (installed under Homebrew, an npm-global prefix, nvm, the native
//! `~/.local/bin` installer, …) isn't on PATH and **every** agent fails to start
//! with "claude not found". The same class of problem hits a **Linux**
//! `.desktop`/AppImage launch, which inherits the session/systemd environment rather
//! than the login-shell PATH — so this whole module is `#[cfg(unix)]` and its
//! login-shell probe restores the user's real PATH on Linux as well.
//! `tauri dev`, by contrast, is launched from a terminal
//! and inherits the full shell PATH, which is exactly why the bug only shows up in
//! `tauri build` (this is the classic macOS GUI-PATH problem; VS Code/Electron's
//! `fix-path` solve it the same way).
//!
//! [`restore_user_path`] resolves the **login shell's** PATH once at startup and
//! merges it into this process's environment. Because the child PTY inherits our env
//! (`pty.rs` copies `std::env::vars_os()`) and `git` shells out with the inherited
//! env too, fixing the process PATH centrally fixes binary lookup *and* lets `claude`
//! itself find `node` / `git` / `ripgrep`.

#[cfg(unix)]
use std::collections::HashSet;
use std::path::PathBuf;
#[cfg(unix)]
use std::time::Duration;

/// Marker bracketing the printed value so shell-rc noise (login banners, `oh-my-zsh`
/// update prompts, `direnv` chatter, …) can't corrupt the parsed PATH — we read only
/// what sits between the two markers.
#[cfg(unix)]
const MARKER: &str = "__RECUE_PATH__";

/// Hard cap on the login-shell probe so a pathological interactive rc file can never
/// hang app startup; on timeout we fall back to the well-known dirs below.
#[cfg(unix)]
const PROBE_TIMEOUT: Duration = Duration::from_secs(3);

/// Resolve the user's login-shell PATH and merge it into this process's PATH.
///
/// **Unix (macOS + Linux, #345).** A Finder/Dock-launched `.app` (or a Linux
/// `.desktop`/AppImage launch) inherits a minimal environment PATH; this probes the
/// login shell to restore it (best-effort — any failure leaves PATH intact, augmented
/// with well-known bin dirs; skipped in debug builds). On **Windows** this is a
/// **no-op**: GUI apps inherit the user/system PATH from the registry, so the problem
/// doesn't exist (#140).
///
/// Must run **before** any threads are spawned (env mutation isn't thread-safe);
/// call it at the very top of `run()`.
pub fn restore_user_path() {
    #[cfg(unix)]
    {
        if cfg!(debug_assertions) {
            return;
        }

        let current = std::env::var("PATH").unwrap_or_default();
        let discovered = login_shell_path();
        let merged = merge_paths(&current, discovered.as_deref(), &common_dirs());

        if merged != current {
            std::env::set_var("PATH", &merged);
        }
    }
}

/// The user's home directory, cross-platform: `HOME` on unix; `USERPROFILE` (then
/// `HOMEDRIVE`+`HOMEPATH`) on Windows. Used to locate `~/.claude/...` — claude's
/// session logs (#97/#134/#138) and user skills (#114) — on both OSes (#140).
pub fn home_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        if let Some(profile) = std::env::var_os("USERPROFILE").filter(|p| !p.is_empty()) {
            return Some(PathBuf::from(profile));
        }
        if let (Some(mut drive), Some(path)) =
            (std::env::var_os("HOMEDRIVE"), std::env::var_os("HOMEPATH"))
        {
            drive.push(path);
            return Some(PathBuf::from(drive));
        }
        None
    }
    #[cfg(unix)]
    {
        std::env::var_os("HOME").map(PathBuf::from)
    }
}

/// Ask the user's login shell for its PATH, bounded by [`PROBE_TIMEOUT`]. Returns
/// `None` if the shell can't be run, times out, or prints nothing parseable.
#[cfg(unix)]
fn login_shell_path() -> Option<String> {
    let (tx, rx) = std::sync::mpsc::channel();
    // Run the (potentially slow) shell probe off-thread so a hung rc file can't wedge
    // startup — we just stop waiting and proceed with the fallback dirs.
    std::thread::spawn(move || {
        let _ = tx.send(login_shell_path_blocking());
    });
    rx.recv_timeout(PROBE_TIMEOUT).ok().flatten()
}

/// The blocking probe: `$SHELL -ilc 'printf "<m>${PATH}<m>"'`.
///
/// `-l` sources login files (`.zprofile`/`.profile`), `-i` sources interactive files
/// (`.zshrc`/`.bashrc`) — users set PATH in either, so both are needed. stdin is
/// `/dev/null` so an interactive shell sees EOF and exits instead of blocking on
/// input; stderr is discarded so rc warnings don't matter.
#[cfg(unix)]
fn login_shell_path_blocking() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    // `${PATH}` (braced) so the trailing marker can't be read as part of the variable
    // name (`$PATH__RECUE_PATH__` would expand a *different* variable).
    let script = format!("printf '%s' \"{MARKER}${{PATH}}{MARKER}\"");

    let output = std::process::Command::new(shell)
        .args(["-ilc", &script])
        // Quiet oh-my-zsh's auto-update prompt, which would otherwise stall on input.
        .env("DISABLE_AUTO_UPDATE", "true")
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .output()
        .ok()?;

    // Parse stdout regardless of exit status: some rc files exit non-zero yet still
    // printed PATH before failing.
    let stdout = String::from_utf8_lossy(&output.stdout);
    extract_marked(&stdout, MARKER)
}

/// Pull the substring between the first two `marker`s out of `s` (trimmed, non-empty).
#[cfg(unix)]
fn extract_marked(s: &str, marker: &str) -> Option<String> {
    let start = s.find(marker)? + marker.len();
    let rest = &s[start..];
    let end = rest.find(marker)?;
    let value = rest[..end].trim();
    (!value.is_empty()).then(|| value.to_string())
}

/// Build a merged PATH: the discovered login-shell PATH first (the user's intended
/// dirs and order, matching what a terminal would give), then well-known fallback
/// dirs (so a failed/empty probe still finds Homebrew/npm), then the existing
/// (launchd/dev) PATH so nothing is ever dropped. Order-preserving, deduplicated.
#[cfg(unix)]
fn merge_paths(current: &str, discovered: Option<&str>, extra: &[String]) -> String {
    let mut seen: HashSet<&str> = HashSet::new();
    let mut out: Vec<&str> = Vec::new();

    let sources = discovered
        .into_iter()
        .flat_map(|d| d.split(':'))
        .chain(extra.iter().map(String::as_str))
        .chain(current.split(':'));

    for entry in sources {
        let entry = entry.trim();
        if !entry.is_empty() && seen.insert(entry) {
            out.push(entry);
        }
    }
    out.join(":")
}

/// Well-known macOS bin dirs where `claude` (and its toolchain) commonly live, used
/// when the login-shell probe yields nothing. The probe is the real fix for
/// version-pinned managers (nvm/asdf/fnm/volta) whose dirs can't be hardcoded; these
/// cover the common Homebrew / npm-global / native-installer cases.
#[cfg(unix)]
fn common_dirs() -> Vec<String> {
    let mut dirs = vec![
        "/opt/homebrew/bin".to_string(),
        "/opt/homebrew/sbin".to_string(),
        "/usr/local/bin".to_string(),
        "/usr/local/sbin".to_string(),
    ];
    if let Some(home) = home_dir() {
        for sub in [
            ".local/bin",      // Claude Code's native installer + pipx, etc.
            ".npm-global/bin", // a common `npm config set prefix` target
            ".bun/bin",
            ".deno/bin",
            ".volta/bin",
            ".cargo/bin",
        ] {
            dirs.push(home.join(sub).to_string_lossy().into_owned());
        }
    }
    dirs
}

// These exercise the unix login-shell PATH probe helpers, which only exist on unix.
#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn extract_marked_pulls_value_between_markers_ignoring_noise() {
        let s = format!("oh-my-zsh banner\n{MARKER}/opt/homebrew/bin:/usr/bin{MARKER}");
        assert_eq!(
            extract_marked(&s, MARKER).as_deref(),
            Some("/opt/homebrew/bin:/usr/bin")
        );
    }

    #[test]
    fn extract_marked_is_none_without_a_full_pair() {
        assert_eq!(extract_marked("no markers here", MARKER), None);
        assert_eq!(extract_marked(&format!("{MARKER}only one"), MARKER), None);
        // An empty value (markers back-to-back) is treated as nothing found.
        assert_eq!(extract_marked(&format!("{MARKER}{MARKER}"), MARKER), None);
    }

    #[test]
    fn merge_prioritizes_discovered_then_extra_then_current_and_dedupes() {
        let current = "/usr/bin:/bin";
        let discovered = Some("/opt/homebrew/bin:/usr/bin");
        let extra = vec![
            "/usr/local/bin".to_string(),
            "/opt/homebrew/bin".to_string(),
        ];
        let merged = merge_paths(current, discovered, &extra);
        // Discovered order first, /usr/bin not duplicated, extra's new dir appended,
        // launchd's /bin preserved at the end.
        assert_eq!(merged, "/opt/homebrew/bin:/usr/bin:/usr/local/bin:/bin");
    }

    #[test]
    fn merge_without_discovery_still_injects_fallback_dirs() {
        // The Finder-launch case: launchd's minimal PATH + no shell probe result.
        let current = "/usr/bin:/bin:/usr/sbin:/sbin";
        let extra = vec!["/opt/homebrew/bin".to_string()];
        let merged = merge_paths(current, None, &extra);
        assert!(merged.starts_with("/opt/homebrew/bin:"));
        assert!(merged.contains("/usr/bin"));
    }

    #[test]
    fn merge_skips_blank_entries() {
        // Trailing colon / stray spaces shouldn't produce empty PATH segments.
        let merged = merge_paths("/usr/bin: :", Some(""), &[]);
        assert_eq!(merged, "/usr/bin");
    }

    #[test]
    fn common_dirs_includes_homebrew_and_a_home_relative_dir() {
        let dirs = common_dirs();
        assert!(dirs.iter().any(|d| d == "/opt/homebrew/bin"));
        // The home-relative dirs are joined with the platform path separator, so the
        // `/`-style ending only holds on unix (this whole module is a macOS GUI-PATH
        // fix; #140 no-ops it on Windows). Gate the separator-sensitive check to unix
        // so the Windows test run — where Git Bash still sets HOME — stays green.
        #[cfg(unix)]
        if std::env::var_os("HOME").is_some() {
            assert!(dirs.iter().any(|d| d.ends_with("/.local/bin")));
        }
    }
}

// `home_dir` is cross-platform (HOME on unix, USERPROFILE on Windows), so its test
// runs on both — unlike the unix-only PATH-probe tests above.
#[cfg(test)]
mod home_tests {
    use super::*;

    #[test]
    fn home_dir_resolves_to_an_absolute_path() {
        // CI/dev always has a home dir; the helper must surface it as an absolute path.
        let home = home_dir().expect("a home directory (HOME / USERPROFILE)");
        assert!(home.is_absolute());
    }
}
