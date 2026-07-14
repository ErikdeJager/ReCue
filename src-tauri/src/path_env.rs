//! Restore the user's real `PATH` for GUI launches (macOS + Linux, #345) — **off the
//! startup critical path** (#360).
//!
//! A bundled `.app` launched from Finder/Dock inherits **launchd's** minimal PATH
//! (`/usr/bin:/bin:/usr/sbin:/sbin`), *not* the PATH the user has in a terminal — so
//! `claude` (installed under Homebrew, an npm-global prefix, nvm, the native
//! `~/.local/bin` installer, …) isn't on PATH and **every** agent fails to start
//! with "claude not found". The same class of problem hits a **Linux**
//! `.desktop`/AppImage launch, which inherits the session/systemd environment rather
//! than the login-shell PATH — so the login-shell probe here is `#[cfg(unix)]` and
//! restores the user's real PATH on Linux as well. `tauri dev`, by contrast, is
//! launched from a terminal and inherits the full shell PATH, which is exactly why the
//! bug only shows up in `tauri build` (this is the classic macOS GUI-PATH problem;
//! VS Code/Electron's `fix-path` solve it the same way).
//!
//! # How it works (#360)
//!
//! The probe used to run **synchronously at the top of `run()`**, before the window
//! existed, waiting up to [`PROBE_TIMEOUT`] (3 s) on a `$SHELL -ilc` round-trip — so a
//! heavy `oh-my-zsh`/`nvm` rc delayed the window by that much. It now runs
//! **concurrently with window creation**:
//!
//! - [`start_probe`] (called once from `run()`, on the main thread) snapshots the env
//!   and spawns the probe on a background thread, returning immediately.
//! - The result is published into an in-process cell ([`PathState`]) — **the process
//!   env is never mutated**. `std::env::set_var` races against a concurrent `getenv`
//!   (glibc reallocs `environ`), so writing PATH from a background thread while the
//!   webview / tokio / PTY-reader threads run would be a genuine data race. The probe
//!   thread also works from the main-thread env **snapshot**, so it never even calls
//!   `getenv`.
//! - Every consumer reads the cell instead of the env: [`effective_path`] (binary
//!   lookup + child spawns — **blocks**, bounded, because finding `claude` outranks a
//!   wait) and [`apply_path`] (`git::hidden_command`'s helper processes — **never**
//!   blocks: those run inside synchronous Tauri commands, i.e. on the main thread).
//! - [`seed_from_cache`] republishes the previous launch's result immediately when the
//!   persisted `$SHELL` + rc-file fingerprint still match, so a steady-state boot pays
//!   **zero** probe cost; the probe still runs in the background and [`await_probe`]
//!   refreshes the persisted cache.
//!
//! Release + unix only: in `cfg!(debug_assertions)` and on **Windows** the probe never
//! arms, the state stays `Inherit`, and every lookup uses this process's own PATH —
//! Windows GUI apps inherit the user/system PATH from the registry, so the problem
//! doesn't exist there (#140).

#[cfg(any(unix, test))]
use std::collections::HashSet;
use std::ffi::OsString;
#[cfg(any(unix, test))]
use std::path::Path;
use std::path::PathBuf;
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

/// Marker bracketing the printed value so shell-rc noise (login banners, `oh-my-zsh`
/// update prompts, `direnv` chatter, …) can't corrupt the parsed PATH — we read only
/// what sits between the two markers.
#[cfg(any(unix, test))]
#[cfg_attr(test, allow(dead_code))]
const MARKER: &str = "__RECUE_PATH__";

/// Hard cap on the login-shell probe so a pathological interactive rc file can never
/// hang the probe thread; on timeout we fall back to the well-known dirs below.
#[cfg(unix)]
const PROBE_TIMEOUT: Duration = Duration::from_secs(3);

/// Upper bound on how long a *reader* ([`effective_path`] / [`await_probe`]) waits for
/// an in-flight probe: [`PROBE_TIMEOUT`] plus headroom. It is a liveness backstop, not
/// the expected path — the probe itself is already capped, so this only bites if the
/// probe thread never finishes at all, and [`PathState::wait_path`] then *downgrades*
/// to the process PATH so no later reader pays the cap again.
const WAIT_TIMEOUT: Duration = Duration::from_secs(5);

/// A cached login-shell PATH probe result (#360), persisted in `sessions.json` as the
/// backend-internal `path_cache` scalar (no Tauri command, no frontend shape).
///
/// `path` is the **discovered** login-shell PATH (the probe's raw output), *not* the
/// merged one — the merge against this process's own PATH is redone at every boot, so
/// nothing launch-specific (an AppImage `/tmp/.mount_…/usr/bin` segment, a dev-shell
/// PATH) is ever persisted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PathCache {
    /// The `$SHELL` the probe ran under (a different shell invalidates the entry).
    pub shell: String,
    /// `$SHELL` + the mtimes of every rc file that can set PATH — see `fingerprint_from`.
    pub fingerprint: String,
    /// The discovered login-shell PATH (raw probe output — never the merged PATH).
    pub path: String,
}

// ---------------------------------------------------------------------------
// The state machine
// ---------------------------------------------------------------------------

/// What the PATH consumers should use.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Resolved {
    /// No probe ever armed (debug builds, Windows) — consumers read the process PATH.
    Inherit,
    /// A probe is in flight and nothing has been published yet — a consumer that needs
    /// the *correct* PATH (binary lookup / child spawn) waits here.
    Pending,
    /// The PATH to use: the discovered login-shell PATH merged over this process's own.
    Ready(OsString),
}

/// The probe's own lifecycle (tracked separately from [`Resolved`] because a cache
/// **seed** can make the PATH `Ready` while the probe is still `Running`).
#[derive(Debug, Clone, PartialEq, Eq)]
enum ProbeStatus {
    NotStarted,
    Running,
    /// Finished: `Some(cache)` on success (persist it), `None` on failure/timeout.
    Done(Option<PathCache>),
}

struct Inner {
    resolved: Resolved,
    probe: ProbeStatus,
}

/// The in-process cell every PATH consumer reads (#360). An **instance** rather than a
/// pile of statics so the whole machine is unit-testable without touching globals; the
/// app uses the single [`shared`] one.
pub(crate) struct PathState {
    inner: Mutex<Inner>,
    cv: Condvar,
}

// On Windows the probe never arms, so only `wait_path` / `override_path` are reachable
// from non-test code; the rest of the machine still compiles + is unit-tested there.
#[cfg_attr(not(unix), allow(dead_code))]
impl PathState {
    fn new() -> Self {
        Self {
            inner: Mutex::new(Inner {
                resolved: Resolved::Inherit,
                probe: ProbeStatus::NotStarted,
            }),
            cv: Condvar::new(),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        // A panicking probe thread must not wedge every reader: take the value anyway.
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// A real probe is about to run: readers now **wait** rather than read the
    /// un-restored process PATH.
    fn begin(&self) {
        let mut inner = self.lock();
        inner.resolved = Resolved::Pending;
        inner.probe = ProbeStatus::Running;
    }

    /// Publish a **cached** result (a fingerprint hit). Only fills a `Pending` slot — if
    /// the probe already landed (`Ready`), ground truth wins and this is a no-op.
    fn seed(&self, merged: OsString) {
        let mut inner = self.lock();
        if matches!(inner.resolved, Resolved::Pending) {
            inner.resolved = Resolved::Ready(merged);
            self.cv.notify_all();
        }
    }

    /// Publish the **probe's** result. The probe is ground truth, so it overrides a seed.
    fn publish(&self, merged: OsString, cache: PathCache) {
        let mut inner = self.lock();
        inner.resolved = Resolved::Ready(merged);
        inner.probe = ProbeStatus::Done(Some(cache));
        self.cv.notify_all();
    }

    /// The probe failed or timed out. Publish today's fallback (`merge_paths(current,
    /// None, common_dirs())`) **only if nothing is `Ready` yet** — a valid seed must
    /// never be downgraded by a failed probe. The persisted cache is left untouched
    /// (`Done(None)`).
    fn publish_fallback(&self, merged: OsString) {
        let mut inner = self.lock();
        if !matches!(inner.resolved, Resolved::Ready(_)) {
            inner.resolved = Resolved::Ready(merged);
        }
        inner.probe = ProbeStatus::Done(None);
        self.cv.notify_all();
    }

    /// The PATH to use, **blocking** (up to `cap`) while a probe is in flight.
    /// `Inherit` ⇒ `None` (the caller reads the process PATH).
    ///
    /// On timeout it **downgrades** to the process PATH and records that as `Ready`, so
    /// a wedged probe thread can never make every later reader pay `cap` again. A late
    /// `publish` still overrides it.
    fn wait_path(&self, cap: Duration) -> Option<OsString> {
        let mut inner = self.lock();
        let deadline = Instant::now() + cap;
        loop {
            match &inner.resolved {
                Resolved::Inherit => return None,
                Resolved::Ready(path) => return Some(path.clone()),
                Resolved::Pending => {}
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                let fallback = std::env::var_os("PATH").unwrap_or_default();
                inner.resolved = Resolved::Ready(fallback.clone());
                return Some(fallback);
            }
            let (guard, _) = self
                .cv
                .wait_timeout(inner, remaining)
                .unwrap_or_else(|e| e.into_inner());
            inner = guard;
        }
    }

    /// Block (up to `cap`) until the probe finishes and return its cache record.
    /// `None` when no probe ran (debug / Windows) or it failed/timed out.
    fn wait_probe(&self, cap: Duration) -> Option<PathCache> {
        let mut inner = self.lock();
        let deadline = Instant::now() + cap;
        loop {
            match &inner.probe {
                ProbeStatus::NotStarted => return None,
                ProbeStatus::Done(cache) => return cache.clone(),
                ProbeStatus::Running => {}
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return None;
            }
            let (guard, _) = self
                .cv
                .wait_timeout(inner, remaining)
                .unwrap_or_else(|e| e.into_inner());
            inner = guard;
        }
    }

    /// The resolved PATH **only when it differs** from this process's own — and
    /// **never blocking**. `None` while `Inherit`/`Pending`, so a helper `Command` that
    /// can't afford to wait (see [`apply_path`]) gets *no* `env` call at all and stays
    /// byte-for-byte what it is today.
    fn override_path(&self) -> Option<OsString> {
        let inner = self.lock();
        match &inner.resolved {
            Resolved::Ready(path) if Some(path) != std::env::var_os("PATH").as_ref() => {
                Some(path.clone())
            }
            _ => None,
        }
    }
}

/// The process-wide cell (the app's single [`PathState`]).
fn shared() -> &'static PathState {
    static SHARED: OnceLock<PathState> = OnceLock::new();
    SHARED.get_or_init(PathState::new)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Start the login-shell PATH probe **concurrently with window creation** (#360).
///
/// Call once from `run()`, on the main thread, *after* every `set_var` (the
/// `linux_webkit` / `linux_gtk` env workarounds — env mutation isn't thread-safe, so
/// nothing may be running concurrently when they write) and before the Tauri builder.
/// Returns immediately.
///
/// Unix + **release** only: a no-op in debug builds and on Windows, where the state
/// stays `Inherit` and every lookup uses this process's own PATH (#140).
pub fn start_probe() {
    #[cfg(unix)]
    {
        if cfg!(debug_assertions) {
            return;
        }
        // Snapshot the env here, on the (still single) main thread, so the probe thread
        // never calls `getenv` — nothing races the boot-time `set_var`s.
        if PROBE_INPUTS.set(ProbeInputs::capture()).is_err() {
            return; // already armed — one-shot per process
        }
        let Some(inputs) = PROBE_INPUTS.get().cloned() else {
            return;
        };

        shared().begin();
        std::thread::spawn(move || {
            match login_shell_path(&inputs.shell) {
                Some(discovered) => {
                    let (merged, cache) = probe_publication(
                        &inputs.current_path,
                        &inputs.common,
                        &inputs.shell,
                        &fingerprint(&inputs),
                        &discovered,
                    );
                    shared().publish(OsString::from(merged), cache);
                }
                None => {
                    // Today's fallback, unchanged: the launchd/session PATH + the
                    // well-known dirs. Never downgrades an already-published seed.
                    let merged = merge_paths(&inputs.current_path, None, &inputs.common);
                    shared().publish_fallback(OsString::from(merged));
                }
            }
        });
    }
}

/// Publish a cached probe result immediately when it still applies (#360): the persisted
/// `$SHELL` **and** the rc-file fingerprint must match what we see now.
///
/// Call once from `setup()`, right after `Store::load` and **before** the boot-resume
/// thread, so a cache hit is already published when the first `resume_session` asks and
/// no spawn ever waits. The probe still runs in the background and refreshes the cache
/// (see [`await_probe`]). No-op in debug builds and on Windows (no probe armed).
pub fn seed_from_cache(cached: Option<PathCache>) {
    #[cfg(unix)]
    {
        let (Some(cached), Some(inputs)) = (cached, PROBE_INPUTS.get()) else {
            return;
        };
        if cache_applies(&cached, &inputs.shell, &fingerprint(inputs)) {
            // Re-merge against *this* launch's PATH — the cache holds only the raw
            // discovered PATH, so nothing launch-specific is ever carried over.
            let merged = merge_paths(&inputs.current_path, Some(&cached.path), &inputs.common);
            shared().seed(OsString::from(merged));
        }
    }
    #[cfg(not(unix))]
    {
        let _ = cached;
    }
}

/// Block (bounded by [`WAIT_TIMEOUT`]) until the probe lands and return its fresh cache
/// record, or `None` when no probe ran (debug / Windows) or it failed (#360). Called
/// from a **background** thread in `setup()` to persist the refreshed cache — never
/// call it from the main thread.
pub fn await_probe() -> Option<PathCache> {
    shared().wait_probe(WAIT_TIMEOUT)
}

/// The PATH to use for **binary resolution and child processes** (#360).
///
/// **Blocks** (bounded by [`WAIT_TIMEOUT`]) while a probe is in flight: correctness —
/// finding `claude` — outranks a wait here, and the wait only ever happens on a
/// cache-miss boot, off the window's critical path (the boot resume runs on a
/// background thread, and by the time a user can click "New session" the probe has long
/// landed). Falls back to this process's PATH when no probe ran, so debug builds and
/// Windows behave exactly as before.
pub(crate) fn effective_path() -> Option<OsString> {
    shared()
        .wait_path(WAIT_TIMEOUT)
        .or_else(|| std::env::var_os("PATH"))
}

/// Put the resolved PATH on a helper `Command` **without ever blocking** (#360) — used
/// by `git::hidden_command` (every `git` shell-out and every `<cli> --version` probe),
/// which runs inside **synchronous** Tauri commands, i.e. on the main thread: it must
/// never stall the webview waiting for the probe (and `git` itself lives in a system dir
/// that is on the minimal GUI PATH anyway).
///
/// Adds **nothing at all** when the probe hasn't landed or never ran (debug builds,
/// Windows), so those `Command`s stay byte-for-byte what they are today.
pub(crate) fn apply_path(cmd: &mut std::process::Command) {
    if let Some(path) = shared().override_path() {
        cmd.env("PATH", path);
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

// ---------------------------------------------------------------------------
// The probe
// ---------------------------------------------------------------------------

/// The env snapshot the probe works from, taken on the main thread in [`start_probe`]
/// so the probe thread never calls `getenv` (#360).
#[cfg(unix)]
#[derive(Debug, Clone)]
struct ProbeInputs {
    /// `$SHELL` (defaulting to `/bin/zsh`, exactly as the probe always has).
    shell: String,
    /// This process's own PATH (launchd / session / dev) — the merge's tail.
    current_path: String,
    /// [`common_dirs`], resolved on the main thread (it reads `$HOME`).
    common: Vec<String>,
    home: Option<PathBuf>,
    zdotdir: Option<PathBuf>,
}

#[cfg(unix)]
impl ProbeInputs {
    fn capture() -> Self {
        Self {
            shell: std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string()),
            current_path: std::env::var("PATH").unwrap_or_default(),
            common: common_dirs(),
            home: home_dir(),
            zdotdir: std::env::var_os("ZDOTDIR")
                .filter(|v| !v.is_empty())
                .map(PathBuf::from),
        }
    }
}

/// The snapshot [`start_probe`] took, shared with [`seed_from_cache`] so both see the
/// same env. `None` until the probe arms (so a debug build seeds nothing).
#[cfg(unix)]
static PROBE_INPUTS: OnceLock<ProbeInputs> = OnceLock::new();

/// Ask the user's login shell for its PATH, bounded by [`PROBE_TIMEOUT`]. Returns
/// `None` if the shell can't be run, times out, or prints nothing parseable.
#[cfg(unix)]
fn login_shell_path(shell: &str) -> Option<String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let shell = shell.to_string();
    // Run the (potentially slow) shell probe off-thread so a hung rc file can't wedge
    // the probe — we just stop waiting and proceed with the fallback dirs.
    std::thread::spawn(move || {
        let _ = tx.send(login_shell_path_blocking(&shell));
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
fn login_shell_path_blocking(shell: &str) -> Option<String> {
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
#[cfg(any(unix, test))]
#[cfg_attr(test, allow(dead_code))]
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
#[cfg(any(unix, test))]
#[cfg_attr(test, allow(dead_code))]
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

/// What a **successful** probe publishes: the merged PATH for this process's consumers,
/// and the cache record to persist.
///
/// The cache stores the **discovered** PATH, never `merged` — so no per-launch segment
/// (an AppImage `/tmp/.mount_…/usr/bin`, a dev-shell PATH, `common_dirs()`) is ever
/// written to disk, and the merge against the *current* process PATH is redone at every
/// boot. Pure, so the rule is unit-tested directly.
#[cfg(any(unix, test))]
#[cfg_attr(test, allow(dead_code))]
fn probe_publication(
    current: &str,
    common: &[String],
    shell: &str,
    fingerprint: &str,
    discovered: &str,
) -> (String, PathCache) {
    let merged = merge_paths(current, Some(discovered), common);
    (
        merged,
        PathCache {
            shell: shell.to_string(),
            fingerprint: fingerprint.to_string(),
            path: discovered.to_string(),
        },
    )
}

/// Well-known macOS bin dirs where `claude` (and its toolchain) commonly live, used
/// when the login-shell probe yields nothing. The probe is the real fix for
/// version-pinned managers (nvm/asdf/fnm/volta) whose dirs can't be hardcoded; these
/// cover the common Homebrew / npm-global / native-installer cases.
#[cfg(any(unix, test))]
#[cfg_attr(test, allow(dead_code))]
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

// ---------------------------------------------------------------------------
// The cache fingerprint
// ---------------------------------------------------------------------------

/// Whether a persisted [`PathCache`] still applies to this launch: same `$SHELL`, same
/// rc-file fingerprint, and a non-empty cached PATH. Pure, so the rule is unit-tested
/// directly.
#[cfg(any(unix, test))]
#[cfg_attr(test, allow(dead_code))]
fn cache_applies(cache: &PathCache, shell: &str, fingerprint: &str) -> bool {
    cache.shell == shell && cache.fingerprint == fingerprint && !cache.path.trim().is_empty()
}

#[cfg(any(unix, test))]
fn push_unique(out: &mut Vec<PathBuf>, path: PathBuf) {
    if !out.contains(&path) {
        out.push(path);
    }
}

/// Every rc file that can set PATH for `shell`, in a deterministic, stable order — the
/// fingerprint's inputs.
///
/// Always included: `/etc/profile`, `/etc/paths`, **`/etc/paths.d`** (a *directory*: its
/// mtime changes when macOS `path_helper` fragments are added/removed) and `~/.profile`.
/// Then the shell's own family (zsh / bash / fish); an unrecognized shell takes the
/// union of all three — a couple of dozen `stat`s is still microseconds.
#[cfg(any(unix, test))]
#[cfg_attr(test, allow(dead_code))]
fn rc_candidates(shell: &str, home: Option<&Path>, zdotdir: Option<&Path>) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();

    for global in ["/etc/profile", "/etc/paths", "/etc/paths.d"] {
        push_unique(&mut out, PathBuf::from(global));
    }
    if let Some(home) = home {
        push_unique(&mut out, home.join(".profile"));
    }

    let name = Path::new(shell)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let (zsh, bash, fish) = (
        name.contains("zsh"),
        name.contains("bash"),
        name.contains("fish"),
    );
    let unknown = !zsh && !bash && !fish;

    if zsh || unknown {
        for global in ["/etc/zshenv", "/etc/zprofile", "/etc/zshrc", "/etc/zlogin"] {
            push_unique(&mut out, PathBuf::from(global));
        }
        // ZDOTDIR relocates the *user* zsh files (the /etc ones above are unaffected).
        if let Some(base) = zdotdir.or(home) {
            for rc in [".zshenv", ".zprofile", ".zshrc", ".zlogin"] {
                push_unique(&mut out, base.join(rc));
            }
        }
    }
    if bash || unknown {
        for global in ["/etc/bash.bashrc", "/etc/bashrc"] {
            push_unique(&mut out, PathBuf::from(global));
        }
        if let Some(home) = home {
            for rc in [".bash_profile", ".bash_login", ".bashrc"] {
                push_unique(&mut out, home.join(rc));
            }
        }
    }
    if fish || unknown {
        if let Some(home) = home {
            push_unique(&mut out, home.join(".config/fish/config.fish"));
            // A directory — its mtime changes when a conf.d snippet is added/removed.
            push_unique(&mut out, home.join(".config/fish/conf.d"));
        }
    }

    out
}

/// The cache key: `$SHELL` plus the mtime (or `-` when **absent**, so a file *appearing*
/// or *disappearing* invalidates too) of each candidate, in the given order. Pure.
#[cfg(any(unix, test))]
#[cfg_attr(test, allow(dead_code))]
fn fingerprint_from(shell: &str, entries: &[(PathBuf, Option<u64>)]) -> String {
    let mut out = format!("v1|shell={shell}");
    for (path, mtime) in entries {
        out.push('|');
        out.push_str(&path.to_string_lossy());
        out.push('=');
        match mtime {
            Some(secs) => out.push_str(&secs.to_string()),
            None => out.push('-'),
        }
    }
    out
}

/// `fingerprint_from` over the live filesystem: `stat` each [`rc_candidates`] entry.
#[cfg(unix)]
fn fingerprint(inputs: &ProbeInputs) -> String {
    let entries: Vec<(PathBuf, Option<u64>)> = rc_candidates(
        &inputs.shell,
        inputs.home.as_deref(),
        inputs.zdotdir.as_deref(),
    )
    .into_iter()
    .map(|path| {
        let mtime = std::fs::metadata(&path)
            .and_then(|meta| meta.modified())
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|since| since.as_secs());
        (path, mtime)
    })
    .collect();
    fingerprint_from(&inputs.shell, &entries)
}

// The pure PATH-probe helpers are compiled on every host (`any(unix, test)`), mirroring
// `explorer_select_arg`'s `any(windows, test)` — so a Windows host still type-checks and
// unit-tests them even though only unix ever runs the probe.
#[cfg(test)]
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
        // `/`-style ending only holds on unix (this whole probe is a macOS/Linux
        // GUI-PATH fix; #140 no-ops it on Windows). Gate the separator-sensitive check
        // to unix so the Windows test run — where Git Bash still sets HOME — stays green.
        #[cfg(unix)]
        if std::env::var_os("HOME").is_some() {
            assert!(dirs.iter().any(|d| d.ends_with("/.local/bin")));
        }
    }

    // --- The state machine (#360) -------------------------------------------------

    use std::ffi::OsStr;
    use std::sync::Arc;

    fn cache(path: &str) -> PathCache {
        PathCache {
            shell: "/bin/zsh".to_string(),
            fingerprint: "fp1".to_string(),
            path: path.to_string(),
        }
    }

    fn process_path() -> OsString {
        std::env::var_os("PATH").unwrap_or_default()
    }

    #[test]
    fn inherit_reads_the_process_path() {
        // No probe armed (debug build / Windows): the consumer is told to use the env.
        let state = PathState::new();
        assert_eq!(state.wait_path(Duration::from_secs(5)), None);
        assert_eq!(state.override_path(), None);
    }

    #[test]
    fn pending_reader_blocks_until_publish() {
        let state = Arc::new(PathState::new());
        state.begin();

        let writer = Arc::clone(&state);
        let handle = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(60));
            writer.publish(OsString::from("/probe/bin"), cache("/probe/bin"));
        });

        let started = Instant::now();
        let got = state.wait_path(Duration::from_secs(5));
        let waited = started.elapsed();
        handle.join().unwrap();

        assert_eq!(got.as_deref(), Some(OsStr::new("/probe/bin")));
        // It really waited for the probe rather than reading the un-restored PATH.
        assert!(waited >= Duration::from_millis(40), "waited {waited:?}");
    }

    #[test]
    fn seed_publishes_immediately() {
        let state = PathState::new();
        state.begin();
        state.seed(OsString::from("/cached/bin"));

        let started = Instant::now();
        let got = state.wait_path(Duration::from_secs(5));
        assert_eq!(got.as_deref(), Some(OsStr::new("/cached/bin")));
        // A cache hit costs no wait at all.
        assert!(started.elapsed() < Duration::from_millis(200));
        // The probe is still running — the seed didn't finish it.
        assert_eq!(state.wait_probe(Duration::from_millis(20)), None);
    }

    #[test]
    fn probe_overrides_a_seed() {
        let state = PathState::new();
        state.begin();
        state.seed(OsString::from("/cached/bin"));
        state.publish(OsString::from("/fresh/bin"), cache("/fresh/bin"));

        assert_eq!(
            state.wait_path(Duration::from_secs(5)).as_deref(),
            Some(OsStr::new("/fresh/bin"))
        );
        assert_eq!(
            state.wait_probe(Duration::from_secs(5)),
            Some(cache("/fresh/bin"))
        );
    }

    #[test]
    fn a_seed_never_overwrites_a_landed_probe() {
        // The probe can beat a slow `Store::load` — ground truth must stay.
        let state = PathState::new();
        state.begin();
        state.publish(OsString::from("/fresh/bin"), cache("/fresh/bin"));
        state.seed(OsString::from("/cached/bin"));

        assert_eq!(
            state.wait_path(Duration::from_secs(5)).as_deref(),
            Some(OsStr::new("/fresh/bin"))
        );
    }

    #[test]
    fn failed_probe_keeps_a_seeded_value() {
        let state = PathState::new();
        state.begin();
        state.seed(OsString::from("/cached/bin"));
        state.publish_fallback(OsString::from("/fallback/bin"));

        // The good seed survives a failed/timed-out probe…
        assert_eq!(
            state.wait_path(Duration::from_secs(5)).as_deref(),
            Some(OsStr::new("/cached/bin"))
        );
        // …and there is nothing to persist, so the cached record is left untouched.
        assert_eq!(state.wait_probe(Duration::from_secs(5)), None);
    }

    #[test]
    fn failed_probe_without_a_seed_publishes_the_fallback() {
        let state = PathState::new();
        state.begin();
        state.publish_fallback(OsString::from("/fallback/bin"));

        assert_eq!(
            state.wait_path(Duration::from_secs(5)).as_deref(),
            Some(OsStr::new("/fallback/bin"))
        );
        assert_eq!(state.wait_probe(Duration::from_secs(5)), None);
    }

    #[test]
    fn wait_path_times_out_to_the_process_path() {
        // A wedged probe thread must not make every later reader pay the cap.
        let state = PathState::new();
        state.begin();

        let got = state.wait_path(Duration::from_millis(30));
        assert_eq!(got.as_deref(), Some(process_path().as_os_str()));

        let started = Instant::now();
        let again = state.wait_path(Duration::from_secs(5));
        assert_eq!(again.as_deref(), Some(process_path().as_os_str()));
        assert!(started.elapsed() < Duration::from_millis(200));
    }

    #[test]
    fn override_path_is_none_unless_ready_and_different() {
        let state = PathState::new();
        // Inherit → nothing to add.
        assert_eq!(state.override_path(), None);
        // Pending → still nothing (this seam must never block or guess).
        state.begin();
        assert_eq!(state.override_path(), None);
        // Ready but identical to the process PATH → no `env` call is added at all.
        state.publish(process_path(), cache("/x"));
        assert_eq!(state.override_path(), None);
        // Ready and different → the helper Command gets the restored PATH.
        state.publish(OsString::from("/restored/bin"), cache("/restored/bin"));
        assert_eq!(
            state.override_path().as_deref(),
            Some(OsStr::new("/restored/bin"))
        );
    }

    #[test]
    fn wait_probe_is_none_when_no_probe_ran() {
        // Debug builds / Windows: `await_probe` returns immediately, persisting nothing.
        let state = PathState::new();
        let started = Instant::now();
        assert_eq!(state.wait_probe(Duration::from_secs(5)), None);
        assert!(started.elapsed() < Duration::from_millis(200));
    }

    #[test]
    fn wait_probe_blocks_until_the_probe_is_done() {
        let state = Arc::new(PathState::new());
        state.begin();

        let writer = Arc::clone(&state);
        let handle = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(60));
            writer.publish(OsString::from("/fresh/bin"), cache("/fresh/bin"));
        });

        assert_eq!(
            state.wait_probe(Duration::from_secs(5)),
            Some(cache("/fresh/bin"))
        );
        handle.join().unwrap();
    }

    // --- The cache + fingerprint (#360) -------------------------------------------

    #[test]
    fn cache_stores_the_discovered_path_not_the_merged_one() {
        // An AppImage launch injects `/tmp/.mount_…` into the *current* PATH; the probe
        // discovers the user's real one. Only the discovered PATH may be persisted.
        let (merged, record) = probe_publication(
            "/tmp/.mount_ReCue12/usr/bin:/usr/bin:/bin",
            &["/opt/homebrew/bin".to_string()],
            "/bin/zsh",
            "fp1",
            "/home/u/.local/bin:/usr/bin",
        );

        assert_eq!(record.path, "/home/u/.local/bin:/usr/bin");
        assert!(!record.path.contains("/tmp/.mount_"));
        assert!(!record.path.contains("/opt/homebrew/bin"));
        assert_eq!(record.shell, "/bin/zsh");
        assert_eq!(record.fingerprint, "fp1");

        // The *merged* value (this process's own) still leads with the discovered dirs,
        // then the common dirs, and drops nothing from the current PATH.
        assert!(merged.starts_with("/home/u/.local/bin:/usr/bin:/opt/homebrew/bin:"));
        assert!(merged.contains("/tmp/.mount_ReCue12/usr/bin"));
    }

    #[test]
    fn cache_hit_requires_shell_and_fingerprint() {
        let record = cache("/home/u/.local/bin:/usr/bin");
        assert!(cache_applies(&record, "/bin/zsh", "fp1"));
        // A different login shell invalidates it.
        assert!(!cache_applies(&record, "/bin/bash", "fp1"));
        // A touched rc file (new fingerprint) invalidates it.
        assert!(!cache_applies(&record, "/bin/zsh", "fp2"));
        // An empty cached PATH is never worth seeding.
        assert!(!cache_applies(&cache("   "), "/bin/zsh", "fp1"));
    }

    #[test]
    fn fingerprint_changes_with_mtime_shell_and_presence() {
        let base = vec![
            (PathBuf::from("/etc/profile"), Some(100_u64)),
            (PathBuf::from("/home/u/.zshrc"), Some(200)),
            (PathBuf::from("/home/u/.zlogin"), None),
        ];
        let fp = fingerprint_from("/bin/zsh", &base);

        // Deterministic for identical inputs.
        assert_eq!(fp, fingerprint_from("/bin/zsh", &base));

        // An edited rc file (mtime bump) invalidates.
        let mut touched = base.clone();
        touched[1].1 = Some(201);
        assert_ne!(fp, fingerprint_from("/bin/zsh", &touched));

        // A newly *created* rc file invalidates (absent `-` → an mtime).
        let mut appeared = base.clone();
        appeared[2].1 = Some(5);
        assert_ne!(fp, fingerprint_from("/bin/zsh", &appeared));

        // A *deleted* rc file invalidates (an mtime → absent `-`).
        let mut vanished = base.clone();
        vanished[1].1 = None;
        assert_ne!(fp, fingerprint_from("/bin/zsh", &vanished));

        // A different `$SHELL` invalidates.
        assert_ne!(fp, fingerprint_from("/bin/bash", &base));
    }

    #[test]
    fn rc_candidates_covers_the_shell_family() {
        let home = PathBuf::from("/home/u");

        // Every shell fingerprints the global PATH sources + ~/.profile. `/etc/paths.d`
        // is a *directory* — its mtime moves when a path_helper fragment is added.
        for shell in ["/bin/zsh", "/bin/bash", "/usr/bin/fish", "/usr/bin/nu"] {
            let files = rc_candidates(shell, Some(&home), None);
            for global in ["/etc/profile", "/etc/paths", "/etc/paths.d"] {
                assert!(files.contains(&PathBuf::from(global)), "{shell} / {global}");
            }
            assert!(files.contains(&home.join(".profile")), "{shell}");
            // Deterministic and duplicate-free (the fingerprint depends on the order).
            let mut deduped = files.clone();
            deduped.dedup();
            assert_eq!(deduped, files);
            assert_eq!(files, rc_candidates(shell, Some(&home), None));
        }

        let zsh = rc_candidates("/bin/zsh", Some(&home), None);
        assert!(zsh.contains(&PathBuf::from("/etc/zshenv")));
        assert!(zsh.contains(&home.join(".zshrc")));
        assert!(zsh.contains(&home.join(".zprofile")));
        assert!(!zsh.contains(&home.join(".bashrc")));

        let bash = rc_candidates("/usr/local/bin/bash", Some(&home), None);
        assert!(bash.contains(&PathBuf::from("/etc/bash.bashrc")));
        assert!(bash.contains(&home.join(".bashrc")));
        assert!(bash.contains(&home.join(".bash_profile")));
        assert!(!bash.contains(&home.join(".zshrc")));

        let fish = rc_candidates("/usr/bin/fish", Some(&home), None);
        assert!(fish.contains(&home.join(".config/fish/config.fish")));
        assert!(fish.contains(&home.join(".config/fish/conf.d")));
        assert!(!fish.contains(&home.join(".zshrc")));

        // An unrecognized shell takes the union — better a few extra `stat`s than a
        // cache that never notices an edit.
        let other = rc_candidates("/usr/bin/nu", Some(&home), None);
        assert!(other.contains(&home.join(".zshrc")));
        assert!(other.contains(&home.join(".bashrc")));
        assert!(other.contains(&home.join(".config/fish/config.fish")));

        // ZDOTDIR relocates zsh's *user* files but not the /etc ones.
        let zdotdir = PathBuf::from("/home/u/.config/zsh");
        let relocated = rc_candidates("/bin/zsh", Some(&home), Some(&zdotdir));
        assert!(relocated.contains(&zdotdir.join(".zshrc")));
        assert!(!relocated.contains(&home.join(".zshrc")));
        assert!(relocated.contains(&PathBuf::from("/etc/zshenv")));
        assert!(relocated.contains(&home.join(".profile")));
    }
}

// `home_dir` is cross-platform (HOME on unix, USERPROFILE on Windows), so its test
// runs on both — like the pure probe helpers above.
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
