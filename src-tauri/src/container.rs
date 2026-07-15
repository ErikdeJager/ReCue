//! Dev-container agent sessions: run `claude` inside a Docker container.
//!
//! Modeled on `child_env.rs` / `linux_webkit.rs`: a **pure, unit-tested core** (the
//! docker argv builder, the worktree-gitfile parser/generator, the label/kill/build
//! argv helpers, the settings reader) plus a **thin side-effect shell** (image
//! ensure/build, per-session home seeding, container kills) in the same file. All
//! composition — which paths to mount, reading credentials/identity, uid/gid — lives
//! in `commands.rs`; nothing here touches Tauri state.
//!
//! The contract (opt-in, per session):
//! - The agent's `(program, args)` are rewritten to `docker run … <image> claude …`
//!   **upstream of `pty.rs::spawn_with_id`**, so the PTY plumbing (reader, busy
//!   monitor, exit waiter, scrollback) is untouched — the PTY child is the docker CLI.
//! - The repo (or worktree) is bind-mounted at `/work`; a **per-session home** at
//!   `<data-dir>/container-homes/<id>` is mounted at `/home/agent` (claude stays
//!   signed in, its session log persists → `--resume` works across app restarts).
//! - Worktree sessions use the **single-file `.git` overlay**: the main repo's `.git`
//!   dir is mounted at `/repo/.git` and a generated one-line gitfile
//!   (`gitdir: /repo/.git/worktrees/<admin>`) is bind-mounted read-only OVER
//!   `/work/.git` — only inside the container; the host's own `.git` file (with host
//!   paths) is untouched, so host-side git reads on the same worktree keep working.
//! - **No git credentials are mounted**: the agent can branch + commit (identity is
//!   injected via `GIT_CONFIG_*` env), but push/pull to a remote fails by design.
//! - Kill is **via the docker CLI by label** (`recue.session=<id>`): a SIGHUP/killpg
//!   to the PTY child reaches only the docker *client* — in TTY mode the container
//!   survives it. On Windows the docker path is the ONLY effective kill
//!   (`hangup_group` is a no-op there). `--rm` makes killed containers self-remove.
//! - The sweep helpers kill EVERY `recue.session`-labeled container (app quit + boot
//!   reap after a crash). A second concurrently-running ReCue instance would be swept
//!   too — the same "one instance owns the app data" assumption `sessions.json`
//!   already makes.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Mutex};
use std::time::Duration;

// ---------------------------------------------------------------------------------
// Pure core
// ---------------------------------------------------------------------------------

/// The default local image tag. Built on first use from [`DOCKERFILE`] (never pulled
/// from a registry); a `containerImage` settings key overrides it and skips the build.
pub const DEFAULT_CONTAINER_IMAGE: &str = "recue-agent:latest";

/// The embedded Dockerfile for the default image. Built with an **empty context**
/// (the Dockerfile goes to `docker build -` on stdin), so nothing on the user's disk
/// is ever sent to the docker daemon. node 22 carries npm for the claude CLI; git +
/// ca-certificates cover the agent's in-repo git work (https remotes still need
/// credentials, which are deliberately NOT provided).
pub const DOCKERFILE: &str = "FROM node:22-bookworm-slim\n\
RUN apt-get update \\\n    && apt-get install -y --no-install-recommends git ca-certificates \\\n    && rm -rf /var/lib/apt/lists/*\n\
RUN npm install -g @anthropic-ai/claude-code\n";

/// Container-side mount targets — fixed, OS-independent (the container is Linux
/// whatever the host is).
pub const WORK_TARGET: &str = "/work";
pub const HOME_TARGET: &str = "/home/agent";
pub const REPO_GIT_TARGET: &str = "/repo/.git";

/// Fallback commit identity when the host has no `user.name`/`user.email` — injected
/// via env-config so an in-container `git commit` can never fail on identity.
pub const FALLBACK_GIT_NAME: &str = "ReCue Agent";
pub const FALLBACK_GIT_EMAIL: &str = "agent@recue.local";

/// Minimal `~/.claude.json` seed so the container's claude skips its first-run
/// onboarding wizard. NOTE (the CLAUDE.md verify-against-the-installed-CLI
/// discipline): the key is claude-internal — verify it against the real CLI when
/// bumping the bundled image; harmless if it drifts (claude just shows onboarding
/// in-terminal once per session).
pub const CLAUDE_JSON_SEED: &str = "{\"hasCompletedOnboarding\":true}\n";

/// How long the app-quit sweep may hold up exit while `docker ps`/`kill` run
/// (best-effort; the boot reap catches anything the bound cuts off).
pub const CONTAINER_SWEEP_BOUND_MS: u64 = 2_500;

/// Everything the pure argv builder needs — composed by the shell (`commands.rs`),
/// data-only so [`docker_invocation`] stays pure and golden-testable.
pub struct ContainerLaunch {
    /// The image to run (the default, or the `containerImage` settings override).
    pub image: String,
    /// The app-owned session UUID — the container label AND the per-session dir key,
    /// minted in `commands.rs` so label == record id == home-dir name.
    pub session_id: String,
    /// Host folder mounted at [`WORK_TARGET`] (the repo, or the worktree folder).
    pub workdir_host: PathBuf,
    /// Worktree sessions only: the single-file `.git` overlay (git approach 2).
    pub git_overlay: Option<GitOverlay>,
    /// Host dir mounted at [`HOME_TARGET`] (`<data-dir>/container-homes/<id>`).
    pub home_host: PathBuf,
    /// Extra `-e KEY=VALUE` pairs (the `GIT_CONFIG_*` set). `HOME`/`TERM` are added
    /// by the builder itself.
    pub env: Vec<(String, String)>,
    /// `Some((uid, gid))` ⇒ `--user uid:gid`. Only the **Linux** call site fills this
    /// (Docker Desktop on macOS/Windows maps file ownership itself; a `--user` there
    /// would only strip the container user's passwd entry for no gain).
    pub user: Option<(u32, u32)>,
}

/// The worktree `.git` overlay (git approach 2). The host worktree's `.git` is a
/// one-line FILE pointing at `<repo>/.git/worktrees/<admin>` by **host** path — a
/// path that doesn't exist inside the container. Mounting the repo's `.git` dir at
/// a fixed target and shadowing `/work/.git` with a generated container-side gitfile
/// makes git work in BOTH universes at once (the host file is never modified).
pub struct GitOverlay {
    /// Host `<parent-repo>/.git` DIRECTORY → [`REPO_GIT_TARGET`]. Mounted
    /// read-write: commits write objects/refs there, and the per-worktree admin dir
    /// (`worktrees/<admin>/HEAD`, `index`) lives inside it.
    pub repo_git_dir_host: PathBuf,
    /// Host generated one-line gitfile → bind-mounted READ-ONLY over `/work/.git`.
    pub gitfile_host: PathBuf,
}

/// `("docker", argv)` for `spawn_with_id`. Deterministic order (golden-tested):
///
/// ```text
/// run --rm --init -i -t --label recue.session=<id>
///   [--user uid:gid]
///   --mount type=bind,source=<workdir>,target=/work
///   [--mount type=bind,source=<repo/.git>,target=/repo/.git]
///   [--mount type=bind,source=<gitfile>,target=/work/.git,readonly]
///   --mount type=bind,source=<home>,target=/home/agent
///   -w /work -e HOME=/home/agent -e TERM=xterm-256color -e K=V…
///   <image> <program> <args…>
/// ```
///
/// `--init` keeps a real PID 1 (tini) in front of claude so in-container signal /
/// orphan handling is sane and the container's exit code is claude's own — a clean
/// in-container exit 0 rides through `docker run` to the #63 clean-exit forget flow,
/// while a `docker kill` maps to 137 and can never read as clean. `--rm`
/// self-removes the container on exit, so the label never collides on a Restart.
pub fn docker_invocation(
    launch: &ContainerLaunch,
    program: &str,
    args: &[&str],
) -> (String, Vec<String>) {
    let mut argv: Vec<String> = vec![
        "run".into(),
        "--rm".into(),
        "--init".into(),
        "-i".into(),
        "-t".into(),
        "--label".into(),
        session_label(&launch.session_id),
    ];
    if let Some((uid, gid)) = launch.user {
        argv.push("--user".into());
        argv.push(format!("{uid}:{gid}"));
    }
    argv.push("--mount".into());
    argv.push(bind_mount(&launch.workdir_host, WORK_TARGET, false));
    if let Some(overlay) = &launch.git_overlay {
        argv.push("--mount".into());
        argv.push(bind_mount(
            &overlay.repo_git_dir_host,
            REPO_GIT_TARGET,
            false,
        ));
        argv.push("--mount".into());
        // Shadows the shared host `.git` file **only inside this container** — the
        // host keeps its own file (host paths) for ReCue's own git reads.
        argv.push(bind_mount(
            &overlay.gitfile_host,
            &format!("{WORK_TARGET}/.git"),
            true,
        ));
    }
    argv.push("--mount".into());
    argv.push(bind_mount(&launch.home_host, HOME_TARGET, false));
    argv.push("-w".into());
    argv.push(WORK_TARGET.into());
    argv.push("-e".into());
    argv.push(format!("HOME={HOME_TARGET}"));
    argv.push("-e".into());
    argv.push("TERM=xterm-256color".into());
    for (key, value) in &launch.env {
        argv.push("-e".into());
        argv.push(format!("{key}={value}"));
    }
    argv.push(launch.image.clone());
    argv.push(program.to_string());
    argv.extend(args.iter().map(|a| a.to_string()));
    ("docker".to_string(), argv)
}

/// One `--mount` spec: `type=bind,source=…,target=…[,readonly]`. Always `--mount`,
/// never `-v` — `-v` splits on `:`, which a Windows drive-letter source (`C:\…`)
/// breaks; `--mount` keys are `,`-separated so the drive colon rides through. The
/// flip side (a `,` in the source path) is refused up front by [`path_mountable`].
fn bind_mount(source: &Path, target: &str, readonly: bool) -> String {
    let mut spec = format!(
        "type=bind,source={},target={}",
        source.to_string_lossy(),
        target
    );
    if readonly {
        spec.push_str(",readonly");
    }
    spec
}

/// Whether a host path can be expressed in a `--mount` spec (docker's CSV syntax
/// cannot escape a `,`). Checked by the composer with a clear error, so the argv
/// builder itself stays infallible.
pub fn path_mountable(path: &Path) -> bool {
    !path.to_string_lossy().contains(',')
}

/// The one piece of container identity: `recue.session=<session-id>`. Deliberately
/// no `--name` (a lingering `--rm` teardown would collide a same-name Restart);
/// every lookup/kill filters on this label instead.
pub fn session_label(id: &str) -> String {
    format!("recue.session={id}")
}

/// `docker ps -q` argv finding ReCue containers: `Some(id)` → that one session,
/// `None` → every recue-labeled container (the quit sweep + boot reap).
pub fn ps_filter_args(id: Option<&str>) -> Vec<String> {
    let filter = match id {
        Some(id) => format!("label={}", session_label(id)),
        None => "label=recue.session".to_string(),
    };
    vec!["ps".into(), "-q".into(), "--filter".into(), filter]
}

/// `docker kill` argv for the given container ids (callers skip the call when empty).
pub fn kill_args(container_ids: &[&str]) -> Vec<String> {
    let mut argv = vec!["kill".to_string()];
    argv.extend(container_ids.iter().map(|id| id.to_string()));
    argv
}

/// `docker image inspect <image>` argv — the cheap "is it built/pulled?" probe.
pub fn inspect_args(image: &str) -> Vec<String> {
    vec!["image".into(), "inspect".into(), image.into()]
}

/// `docker build -t recue-agent:latest -` argv (Dockerfile on stdin, empty context).
pub fn build_args() -> Vec<String> {
    vec![
        "build".into(),
        "-t".into(),
        DEFAULT_CONTAINER_IMAGE.into(),
        "-".into(),
    ]
}

/// The in-container git configuration, injected as env (`GIT_CONFIG_COUNT` +
/// `GIT_CONFIG_KEY_n`/`GIT_CONFIG_VALUE_n`, git ≥ 2.31) so no config file is ever
/// written into the shared repo:
/// - `safe.directory=*` — the bind-mounted repo is owned by a different uid than the
///   container user on some setups ("dubious ownership" refusals);
/// - `core.fsmonitor=false` — a repo-level fsmonitor daemon can't watch a bind mount
///   from inside the container (and must not be spawned there);
/// - `gc.auto=0` — the container must never repack/prune the SHARED object store
///   (an in-container auto-gc would also run `worktree prune` against host paths);
/// - `user.name` / `user.email` — the host identity (fallback [`FALLBACK_GIT_NAME`] /
///   [`FALLBACK_GIT_EMAIL`]) so `git commit` can never fail on identity.
pub fn git_env_config(user_name: &str, user_email: &str) -> Vec<(String, String)> {
    let name = user_name.trim();
    let name = if name.is_empty() {
        FALLBACK_GIT_NAME
    } else {
        name
    };
    let email = user_email.trim();
    let email = if email.is_empty() {
        FALLBACK_GIT_EMAIL
    } else {
        email
    };
    let pairs: [(&str, &str); 5] = [
        ("safe.directory", "*"),
        ("core.fsmonitor", "false"),
        ("gc.auto", "0"),
        ("user.name", name),
        ("user.email", email),
    ];
    let mut env: Vec<(String, String)> = vec![("GIT_CONFIG_COUNT".into(), pairs.len().to_string())];
    for (i, (key, value)) in pairs.iter().enumerate() {
        env.push((format!("GIT_CONFIG_KEY_{i}"), (*key).to_string()));
        env.push((format!("GIT_CONFIG_VALUE_{i}"), (*value).to_string()));
    }
    env
}

/// Parse a worktree `.git` FILE's contents — `gitdir: <path>` (git writes exactly
/// one line; tolerate CRLF and surrounding whitespace) → the gitdir path. `None`
/// for anything else (a directory listing, garbage, an empty file).
pub fn parse_gitfile_gitdir(contents: &str) -> Option<String> {
    let line = contents.lines().next()?.trim();
    let rest = line.strip_prefix("gitdir:")?.trim();
    if rest.is_empty() {
        None
    } else {
        Some(rest.to_string())
    }
}

/// The git worktree **admin name** out of a gitdir path: the segment after the last
/// `worktrees` component (`…/.git/worktrees/<admin>` — `/` or `\` separators).
/// `None` when the path has no `worktrees` component (not a linked worktree).
pub fn worktree_admin_name(gitdir: &str) -> Option<String> {
    let segments: Vec<&str> = gitdir
        .split(['/', '\\'])
        .filter(|s| !s.is_empty())
        .collect();
    let at = segments.iter().rposition(|s| *s == "worktrees")?;
    segments
        .get(at + 1)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

/// The container-side gitfile: exactly one POSIX line pointing into the mounted
/// [`REPO_GIT_TARGET`]. Bind-mounted read-only over `/work/.git`.
pub fn container_gitfile_contents(admin_name: &str) -> String {
    format!("gitdir: {REPO_GIT_TARGET}/worktrees/{admin_name}\n")
}

/// `<data-dir>/container-homes/<id>` — the per-session home mounted at
/// [`HOME_TARGET`]. Persists across app restarts (that's what makes `--resume`
/// work); deleted with the session record.
pub fn container_home_dir(data_dir: &Path, id: &str) -> PathBuf {
    data_dir.join("container-homes").join(id)
}

/// `<data-dir>/container-git/<id>` — where the generated worktree gitfile lives.
pub fn container_git_dir(data_dir: &Path, id: &str) -> PathBuf {
    data_dir.join("container-git").join(id)
}

/// The `containerImage` settings override (a clone of `agents.rs::read_custom_command`
/// — the settings blob is opaque JSON owned by the frontend, keys are the TS field
/// names verbatim). `None` when absent/blank/not-a-string ⇒ the built-in default.
pub fn read_container_image(settings: &serde_json::Value) -> Option<String> {
    settings
        .get("containerImage")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
}

/// The docker runtime states the New Session modal's toggle keys off: `"absent"`
/// (no docker CLI on PATH → the toggle is hidden entirely), `"stopped"` (CLI
/// installed but the daemon unreachable → the toggle shows, disabled, telling the
/// user to start Docker), `"running"` (usable). Pure classifier; the probing shell
/// is [`runtime_status`].
pub fn classify_docker(cli_found: bool, server_up: bool) -> &'static str {
    if !cli_found {
        "absent"
    } else if server_up {
        "running"
    } else {
        "stopped"
    }
}

// ---------------------------------------------------------------------------------
// Thin shell (side effects). Every one-shot docker CLI call goes through
// `git::hidden_command` — the restored login PATH (a Finder-launched .app), the
// AppImage env scrub, and the Windows CREATE_NO_WINDOW console-flash guard.
// ---------------------------------------------------------------------------------

/// Read the host's commit identity in `cwd` (`git config --get`, so repo-local
/// config wins over global), falling back to the ReCue Agent identity. Never fails.
pub fn host_git_identity(cwd: &Path) -> (String, String) {
    let read = |key: &str| -> Option<String> {
        let out = crate::git::hidden_command("git")
            .arg("-C")
            .arg(cwd)
            .args(["config", "--get", key])
            .output()
            .ok()?;
        if !out.status.success() {
            return None;
        }
        let value = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if value.is_empty() {
            None
        } else {
            Some(value)
        }
    };
    (
        read("user.name").unwrap_or_else(|| FALLBACK_GIT_NAME.to_string()),
        read("user.email").unwrap_or_else(|| FALLBACK_GIT_EMAIL.to_string()),
    )
}

/// Read + parse the host worktree's `.git` pointer FILE → the admin name. `None`
/// when the path isn't a linked worktree (a repo root has a `.git` *directory*,
/// which `read_to_string` refuses) or the file is unreadable/garbled.
pub fn host_worktree_admin_name(worktree: &Path) -> Option<String> {
    let contents = std::fs::read_to_string(worktree.join(".git")).ok()?;
    worktree_admin_name(&parse_gitfile_gitdir(&contents)?)
}

/// Prepare the per-session home: create it, seed `.claude/.credentials.json`
/// (0600 on unix) from the RAW host blob and a minimal `.claude.json` — each **only
/// if absent**, so a token the container's claude has refreshed is never clobbered.
/// Idempotent; runs on every container spawn AND resume.
pub fn seed_home(home: &Path, raw_credentials: Option<&str>) -> std::io::Result<()> {
    let claude_dir = home.join(".claude");
    std::fs::create_dir_all(&claude_dir)?;
    if let Some(raw) = raw_credentials {
        write_once_private(&claude_dir.join(".credentials.json"), raw)?;
    }
    write_once(&home.join(".claude.json"), CLAUDE_JSON_SEED)?;
    Ok(())
}

/// Create-new write — an existing file is left untouched (`AlreadyExists` ⇒ Ok).
fn write_once(path: &Path, contents: &str) -> std::io::Result<()> {
    use std::io::Write;
    match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
    {
        Ok(mut file) => file.write_all(contents.as_bytes()),
        Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => Ok(()),
        Err(err) => Err(err),
    }
}

/// [`write_once`] with owner-only permissions (0600) on unix — the credentials blob.
/// Windows has no unix mode bits; the app-data dir's ACL is the boundary there.
fn write_once_private(path: &Path, contents: &str) -> std::io::Result<()> {
    use std::io::Write;
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    match options.open(path) {
        Ok(mut file) => file.write_all(contents.as_bytes()),
        Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => Ok(()),
        Err(err) => Err(err),
    }
}

/// Write the generated container-side gitfile at `<dir>/gitfile` (parents created;
/// overwriting is fine — the contents are a pure function of the admin name) and
/// return its path.
pub fn prepare_gitfile(dir: &Path, admin_name: &str) -> std::io::Result<PathBuf> {
    std::fs::create_dir_all(dir)?;
    let path = dir.join("gitfile");
    std::fs::write(&path, container_gitfile_contents(admin_name))?;
    Ok(path)
}

/// Serializes default-image builds: concurrent spawns share ONE `docker build`.
static IMAGE_BUILD: Mutex<()> = Mutex::new(());

/// Marks that a container session ran this process lifetime — the quit sweep's
/// fast-path gate (an app that never containerized pays zero docker calls on exit).
static CONTAINER_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Flip the "a container session ran" gate (see [`spawn_kill_all_sweep`]).
pub fn mark_active() {
    CONTAINER_ACTIVE.store(true, Ordering::SeqCst);
}

fn any_active() -> bool {
    CONTAINER_ACTIVE.load(Ordering::SeqCst)
}

/// Make sure `image` exists locally, building the default from [`DOCKERFILE`] when
/// missing. Deduped behind [`IMAGE_BUILD`] with a double-checked inspect, so N
/// concurrent spawns (e.g. a boot with several container records) pay for ONE build.
/// `on_build_start` fires only when a build actually begins (the
/// `container://building` toast hook). `Err` carries the tail of docker's stderr.
/// Blocking (a first build takes minutes) — call only from `spawn_blocking` /
/// background threads.
pub fn ensure_image(image: &str, on_build_start: &dyn Fn()) -> Result<(), String> {
    if image_present(image) {
        return Ok(());
    }
    let _guard = IMAGE_BUILD
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if image_present(image) {
        return Ok(());
    }
    on_build_start();
    build_default_image()
}

/// Probe the docker runtime for the modal's toggle (see [`classify_docker`]).
/// The daemon check is `docker version --format {{.Server.Os}}` — it exits non-zero
/// (quickly) when the daemon is unreachable and 0 when it answered. Blocking (a
/// process spawn, plus the CLI's own daemon-connect wait) — call from
/// `spawn_blocking`, never the main thread.
pub fn runtime_status() -> &'static str {
    if crate::pty::find_on_path("docker").is_none() {
        return classify_docker(false, false);
    }
    let server_up = crate::git::hidden_command("docker")
        .args(["version", "--format", "{{.Server.Os}}"])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false);
    classify_docker(true, server_up)
}

/// `docker image inspect` — success ⇒ the image exists locally.
fn image_present(image: &str) -> bool {
    crate::git::hidden_command("docker")
        .args(inspect_args(image))
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

/// `docker build -t recue-agent:latest -` with [`DOCKERFILE`] on stdin.
fn build_default_image() -> Result<(), String> {
    use std::io::Write;
    let mut child = crate::git::hidden_command("docker")
        .args(build_args())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("could not run docker: {e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(DOCKERFILE.as_bytes());
        // stdin drops here → EOF ends the build context.
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(stderr_tail(&output.stderr))
    }
}

/// The last ~800 chars of a stderr stream — enough to name the failing build step
/// without dumping the whole log into a toast.
fn stderr_tail(stderr: &[u8]) -> String {
    let text = String::from_utf8_lossy(stderr);
    let text = text.trim();
    if text.is_empty() {
        return "docker failed with no error output".to_string();
    }
    let tail_at = text.len().saturating_sub(800);
    // Don't split a UTF-8 char at the cut.
    let mut at = tail_at;
    while at < text.len() && !text.is_char_boundary(at) {
        at += 1;
    }
    text[at..].to_string()
}

/// The live container ids for `id` (or for every ReCue container when `None`).
fn session_containers(id: Option<&str>) -> Vec<String> {
    let output = crate::git::hidden_command("docker")
        .args(ps_filter_args(id))
        .output();
    match output {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout)
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(String::from)
            .collect(),
        _ => Vec::new(),
    }
}

fn kill_containers(ids: &[String]) {
    if ids.is_empty() {
        return;
    }
    let refs: Vec<&str> = ids.iter().map(String::as_str).collect();
    let _ = crate::git::hidden_command("docker")
        .args(kill_args(&refs))
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status();
}

/// Kill the container(s) labeled with `id`, synchronously. The PTY-side hangup only
/// reaches the docker client; THIS is what actually stops the agent. `--rm` then
/// self-removes the container. Fast no-op when docker isn't on PATH.
pub fn kill_session_containers(id: &str) {
    if crate::pty::find_on_path("docker").is_none() {
        return;
    }
    kill_containers(&session_containers(Some(id)));
}

/// Non-blocking Remove path (mirrors `pty::kill_now`'s detached escalation): kill the
/// session's container on a detached thread, then best-effort delete its per-session
/// home + gitfile dirs — strictly AFTER the kill, never under a live mount (one
/// short retry covers the `--rm` unmount lag).
pub fn kill_session_container_detached(id: String, home: Option<PathBuf>, gitdir: Option<PathBuf>) {
    std::thread::spawn(move || {
        kill_session_containers(&id);
        for dir in [home, gitdir].into_iter().flatten() {
            if std::fs::remove_dir_all(&dir).is_err() && dir.exists() {
                std::thread::sleep(Duration::from_millis(500));
                let _ = std::fs::remove_dir_all(&dir);
            }
        }
    });
}

/// Kill EVERY `recue.session`-labeled container, synchronously — the boot reap
/// (strays from a crashed previous run, killed BEFORE boot resume spawns
/// replacements under the same labels). Fast no-op when docker isn't on PATH.
pub fn kill_all_recue_containers() {
    if crate::pty::find_on_path("docker").is_none() {
        return;
    }
    kill_containers(&session_containers(None));
}

/// The app-quit sweep: run [`kill_all_recue_containers`] on a thread and hand back a
/// receiver the exit handler bounds with `recv_timeout(CONTAINER_SWEEP_BOUND_MS)`.
/// Resolves instantly when no container session ever ran this process lifetime.
pub fn spawn_kill_all_sweep() -> mpsc::Receiver<()> {
    let (tx, rx) = mpsc::channel();
    if !any_active() {
        let _ = tx.send(());
        return rx;
    }
    std::thread::spawn(move || {
        kill_all_recue_containers();
        let _ = tx.send(());
    });
    rx
}

/// The host uid/gid for the Linux `--user` arm. cfg-widened with `, test)` (the
/// `explorer_select_arg` precedent) so the macOS/Windows hosts still type-check and
/// unit-test it; the non-test build compiles it only on non-macOS unix, and the one
/// non-test call site (`commands.rs`) is cfg'd to exactly that.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
pub fn current_uid_gid() -> Option<(u32, u32)> {
    #[cfg(unix)]
    {
        // SAFETY: getuid/getgid are always-successful, side-effect-free syscalls.
        Some(unsafe { (libc::getuid(), libc::getgid()) })
    }
    #[cfg(not(unix))]
    {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn launch(overlay: Option<GitOverlay>, user: Option<(u32, u32)>) -> ContainerLaunch {
        ContainerLaunch {
            image: DEFAULT_CONTAINER_IMAGE.to_string(),
            session_id: "abc-123".to_string(),
            workdir_host: PathBuf::from("/Users/e/repo"),
            git_overlay: overlay,
            home_host: PathBuf::from("/data/container-homes/abc-123"),
            env: git_env_config("Jane", "jane@example.com"),
            user,
        }
    }

    /// The full plain-repo argv, golden: order and content are the contract the
    /// manual verification steps (and any future refactor) hold on to.
    #[test]
    fn docker_args_plain_repo_full_argv_golden() {
        let (program, argv) =
            docker_invocation(&launch(None, None), "claude", &["--session-id", "abc-123"]);
        assert_eq!(program, "docker");
        let expected: Vec<String> = [
            "run",
            "--rm",
            "--init",
            "-i",
            "-t",
            "--label",
            "recue.session=abc-123",
            "--mount",
            "type=bind,source=/Users/e/repo,target=/work",
            "--mount",
            "type=bind,source=/data/container-homes/abc-123,target=/home/agent",
            "-w",
            "/work",
            "-e",
            "HOME=/home/agent",
            "-e",
            "TERM=xterm-256color",
            "-e",
            "GIT_CONFIG_COUNT=5",
            "-e",
            "GIT_CONFIG_KEY_0=safe.directory",
            "-e",
            "GIT_CONFIG_VALUE_0=*",
            "-e",
            "GIT_CONFIG_KEY_1=core.fsmonitor",
            "-e",
            "GIT_CONFIG_VALUE_1=false",
            "-e",
            "GIT_CONFIG_KEY_2=gc.auto",
            "-e",
            "GIT_CONFIG_VALUE_2=0",
            "-e",
            "GIT_CONFIG_KEY_3=user.name",
            "-e",
            "GIT_CONFIG_VALUE_3=Jane",
            "-e",
            "GIT_CONFIG_KEY_4=user.email",
            "-e",
            "GIT_CONFIG_VALUE_4=jane@example.com",
            "recue-agent:latest",
            "claude",
            "--session-id",
            "abc-123",
        ]
        .into_iter()
        .map(String::from)
        .collect();
        assert_eq!(argv, expected);
        // The no-creds / no-user contracts, stated explicitly:
        assert!(!argv.iter().any(|a| a == "--user"));
        assert!(!argv.iter().any(|a| a.contains("GIT_TERMINAL_PROMPT")));
        assert!(!argv.iter().any(|a| a.contains("ssh")));
    }

    #[test]
    fn docker_args_worktree_adds_repo_git_and_readonly_gitfile_overlay() {
        let overlay = GitOverlay {
            repo_git_dir_host: PathBuf::from("/Users/e/repo/.git"),
            gitfile_host: PathBuf::from("/data/container-git/abc-123/gitfile"),
        };
        let (_, argv) = docker_invocation(&launch(Some(overlay), None), "claude", &[]);
        let mounts: Vec<&String> = argv.iter().filter(|a| a.starts_with("type=bind")).collect();
        assert_eq!(mounts.len(), 4, "work + repo/.git + gitfile + home");
        assert_eq!(
            mounts[1], "type=bind,source=/Users/e/repo/.git,target=/repo/.git",
            "the repo git dir mounts read-write (commits write objects/refs)"
        );
        assert_eq!(
            mounts[2],
            "type=bind,source=/data/container-git/abc-123/gitfile,target=/work/.git,readonly",
            "the generated gitfile shadows /work/.git read-only"
        );
        // Order: the overlay pieces sit between the work mount and the home mount.
        assert!(mounts[0].ends_with("target=/work"));
        assert!(mounts[3].ends_with("target=/home/agent"));
    }

    #[test]
    fn docker_args_user_flag_only_with_uid_gid() {
        let (_, with_user) = docker_invocation(&launch(None, Some((1000, 1001))), "claude", &[]);
        let at = with_user.iter().position(|a| a == "--user").unwrap();
        assert_eq!(with_user[at + 1], "1000:1001");
        let (_, without) = docker_invocation(&launch(None, None), "claude", &[]);
        assert!(!without.iter().any(|a| a == "--user"));
    }

    #[test]
    fn docker_args_seeded_prompt_rides_after_session_id() {
        let (_, argv) = docker_invocation(
            &launch(None, None),
            "claude",
            &["--session-id", "abc-123", "do the thing"],
        );
        let tail: Vec<&String> = argv.iter().rev().take(4).collect();
        assert_eq!(
            tail.into_iter().rev().collect::<Vec<_>>(),
            ["claude", "--session-id", "abc-123", "do the thing"]
        );
    }

    /// The reason `--mount` (CSV keys) was chosen over `-v` (`:`-split): a Windows
    /// drive-letter source keeps its colon intact.
    #[test]
    fn bind_mount_handles_windows_drive_letter_source() {
        assert_eq!(
            bind_mount(Path::new("C:\\Users\\e\\repo"), WORK_TARGET, false),
            "type=bind,source=C:\\Users\\e\\repo,target=/work"
        );
        assert_eq!(
            bind_mount(Path::new("/a b/repo"), WORK_TARGET, true),
            "type=bind,source=/a b/repo,target=/work,readonly"
        );
    }

    #[test]
    fn path_mountable_refuses_commas() {
        assert!(path_mountable(Path::new("/Users/e/repo")));
        assert!(path_mountable(Path::new("C:\\Users\\e\\repo")));
        assert!(!path_mountable(Path::new("/Users/e/od,repo")));
    }

    #[test]
    fn parse_gitfile_gitdir_accepts_newline_and_crlf() {
        assert_eq!(
            parse_gitfile_gitdir("gitdir: /a/b/.git/worktrees/foo\n").as_deref(),
            Some("/a/b/.git/worktrees/foo")
        );
        assert_eq!(
            parse_gitfile_gitdir("gitdir: C:/Users/e/repo/.git/worktrees/foo\r\n").as_deref(),
            Some("C:/Users/e/repo/.git/worktrees/foo")
        );
        // No space after the colon is still valid gitfile syntax.
        assert_eq!(
            parse_gitfile_gitdir("gitdir:/a/.git/worktrees/x").as_deref(),
            Some("/a/.git/worktrees/x")
        );
    }

    #[test]
    fn parse_gitfile_gitdir_rejects_non_gitfile_content() {
        assert_eq!(parse_gitfile_gitdir(""), None);
        assert_eq!(parse_gitfile_gitdir("gitdir: "), None);
        assert_eq!(parse_gitfile_gitdir("ref: refs/heads/main\n"), None);
        assert_eq!(parse_gitfile_gitdir("HEAD\nconfig\nobjects\n"), None);
    }

    #[test]
    fn worktree_admin_name_from_posix_and_windows_gitdirs() {
        assert_eq!(
            worktree_admin_name("/repo/.git/worktrees/dev-x").as_deref(),
            Some("dev-x")
        );
        assert_eq!(
            worktree_admin_name("C:\\Users\\e\\repo\\.git\\worktrees\\dev-x").as_deref(),
            Some("dev-x")
        );
        // The LAST `worktrees` component wins (a repo literally named "worktrees").
        assert_eq!(
            worktree_admin_name("/home/worktrees/repo/.git/worktrees/feat").as_deref(),
            Some("feat")
        );
        assert_eq!(worktree_admin_name("/repo/.git"), None);
        assert_eq!(worktree_admin_name("/repo/.git/worktrees/"), None);
    }

    #[test]
    fn container_gitfile_contents_is_exactly_one_posix_line() {
        assert_eq!(
            container_gitfile_contents("dev-x"),
            "gitdir: /repo/.git/worktrees/dev-x\n"
        );
    }

    #[test]
    fn git_env_config_is_counted_and_indexed() {
        let env = git_env_config("Jane", "jane@example.com");
        assert_eq!(env[0], ("GIT_CONFIG_COUNT".into(), "5".into()));
        assert_eq!(env.len(), 11, "count + 5 key/value pairs");
        let get = |k: &str| {
            env.iter()
                .find(|(key, _)| key == k)
                .map(|(_, v)| v.as_str())
        };
        assert_eq!(get("GIT_CONFIG_KEY_0"), Some("safe.directory"));
        assert_eq!(get("GIT_CONFIG_VALUE_0"), Some("*"));
        assert_eq!(get("GIT_CONFIG_KEY_1"), Some("core.fsmonitor"));
        assert_eq!(get("GIT_CONFIG_VALUE_1"), Some("false"));
        assert_eq!(get("GIT_CONFIG_KEY_2"), Some("gc.auto"));
        assert_eq!(get("GIT_CONFIG_VALUE_2"), Some("0"));
        assert_eq!(get("GIT_CONFIG_KEY_3"), Some("user.name"));
        assert_eq!(get("GIT_CONFIG_VALUE_3"), Some("Jane"));
        assert_eq!(get("GIT_CONFIG_KEY_4"), Some("user.email"));
        assert_eq!(get("GIT_CONFIG_VALUE_4"), Some("jane@example.com"));
    }

    #[test]
    fn git_env_config_falls_back_to_recue_agent_identity() {
        let env = git_env_config("  ", "");
        let get = |k: &str| {
            env.iter()
                .find(|(key, _)| key == k)
                .map(|(_, v)| v.as_str())
        };
        assert_eq!(get("GIT_CONFIG_VALUE_3"), Some(FALLBACK_GIT_NAME));
        assert_eq!(get("GIT_CONFIG_VALUE_4"), Some(FALLBACK_GIT_EMAIL));
    }

    #[test]
    fn session_label_and_ps_filter_args() {
        assert_eq!(session_label("abc"), "recue.session=abc");
        assert_eq!(
            ps_filter_args(Some("abc")),
            vec!["ps", "-q", "--filter", "label=recue.session=abc"]
        );
        assert_eq!(
            ps_filter_args(None),
            vec!["ps", "-q", "--filter", "label=recue.session"]
        );
    }

    #[test]
    fn inspect_build_and_kill_args_golden() {
        assert_eq!(
            inspect_args("recue-agent:latest"),
            vec!["image", "inspect", "recue-agent:latest"]
        );
        assert_eq!(build_args(), vec!["build", "-t", "recue-agent:latest", "-"]);
        assert_eq!(kill_args(&["a", "b"]), vec!["kill", "a", "b"]);
    }

    /// The three toggle-driving runtime states: no CLI → hidden ("absent"), CLI
    /// without a reachable daemon → "stopped" (the "start Docker" affordance),
    /// both → "running".
    #[test]
    fn classify_docker_maps_the_three_toggle_states() {
        assert_eq!(classify_docker(false, false), "absent");
        // A daemon can't be up without a CLI probe — found=false always wins.
        assert_eq!(classify_docker(false, true), "absent");
        assert_eq!(classify_docker(true, false), "stopped");
        assert_eq!(classify_docker(true, true), "running");
    }

    #[test]
    fn read_container_image_trims_and_rejects_blank_or_missing() {
        let v = serde_json::json!({ "containerImage": "  ghcr.io/me/agent:1  " });
        assert_eq!(
            read_container_image(&v).as_deref(),
            Some("ghcr.io/me/agent:1")
        );
        assert_eq!(read_container_image(&serde_json::json!({})), None);
        assert_eq!(
            read_container_image(&serde_json::json!({ "containerImage": "   " })),
            None
        );
        assert_eq!(
            read_container_image(&serde_json::json!({ "containerImage": 3 })),
            None
        );
        assert_eq!(read_container_image(&serde_json::Value::Null), None);
    }

    #[test]
    fn container_dirs_are_per_session_under_data_dir() {
        let data = Path::new("/data");
        assert_eq!(
            container_home_dir(data, "abc"),
            PathBuf::from("/data/container-homes/abc")
        );
        assert_eq!(
            container_git_dir(data, "abc"),
            PathBuf::from("/data/container-git/abc")
        );
    }

    /// Drift guard on the embedded image: node 22 + the claude CLI + git must stay.
    #[test]
    fn dockerfile_pins_node22_and_claude_cli() {
        assert!(DOCKERFILE.starts_with("FROM node:22-bookworm-slim\n"));
        assert!(DOCKERFILE.contains("@anthropic-ai/claude-code"));
        assert!(DOCKERFILE.contains(" git "));
        assert!(DOCKERFILE.contains("ca-certificates"));
    }

    fn temp_home(tag: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!("recue-container-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&path);
        path
    }

    #[test]
    fn seed_home_writes_credentials_0600_and_never_overwrites() {
        let home = temp_home("seed");
        seed_home(&home, Some("{\"a\":1}")).unwrap();
        let creds = home.join(".claude").join(".credentials.json");
        assert_eq!(std::fs::read_to_string(&creds).unwrap(), "{\"a\":1}");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&creds).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o600, "credentials must be owner-only");
        }
        // A second seed (spawn → resume) must NOT clobber the container's own
        // (possibly refreshed) copy — and a creds-less seed must not delete it.
        seed_home(&home, Some("{\"a\":2}")).unwrap();
        assert_eq!(std::fs::read_to_string(&creds).unwrap(), "{\"a\":1}");
        seed_home(&home, None).unwrap();
        assert!(creds.exists());
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn seed_home_writes_claude_json_seed_once() {
        let home = temp_home("claude-json");
        seed_home(&home, None).unwrap();
        let claude_json = home.join(".claude.json");
        assert_eq!(
            std::fs::read_to_string(&claude_json).unwrap(),
            CLAUDE_JSON_SEED
        );
        std::fs::write(&claude_json, "{\"user\":\"edited\"}").unwrap();
        seed_home(&home, None).unwrap();
        assert_eq!(
            std::fs::read_to_string(&claude_json).unwrap(),
            "{\"user\":\"edited\"}"
        );
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn prepare_gitfile_creates_parents_and_returns_path() {
        let dir = temp_home("gitfile").join("nested");
        let path = prepare_gitfile(&dir, "dev-x").unwrap();
        assert_eq!(path, dir.join("gitfile"));
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            container_gitfile_contents("dev-x")
        );
        let _ = std::fs::remove_dir_all(dir.parent().unwrap());
    }

    /// Format drift guard against REAL git: `git worktree add` writes the `.git`
    /// pointer file our parser reads, and the admin name it embeds round-trips into
    /// the generated container gitfile. Skips silently when `git` isn't installed
    /// (mirroring git.rs's temp-repo tests).
    #[test]
    fn host_worktree_admin_name_reads_a_real_worktree() {
        let git = |cwd: &Path, args: &[&str]| -> bool {
            std::process::Command::new("git")
                .arg("-C")
                .arg(cwd)
                .args(args)
                .output()
                .map(|out| out.status.success())
                .unwrap_or(false)
        };
        let base = temp_home("wt-admin");
        let repo = base.join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        if !git(&repo, &["init", "-q"]) {
            return; // no git on this host — skip
        }
        std::fs::write(repo.join("a.txt"), "x\n").unwrap();
        assert!(git(&repo, &["add", "."]));
        assert!(git(
            &repo,
            &[
                "-c",
                "user.name=t",
                "-c",
                "user.email=t@t",
                "commit",
                "-q",
                "-m",
                "init"
            ]
        ));
        assert!(git(&repo, &["branch", "feat"]));
        let dest = base.join("wt");
        assert!(git(
            &repo,
            &["worktree", "add", dest.to_str().unwrap(), "feat"]
        ));

        let admin = host_worktree_admin_name(&dest).expect("a real worktree must parse");
        assert!(!admin.is_empty());
        assert_eq!(
            container_gitfile_contents(&admin),
            format!("gitdir: /repo/.git/worktrees/{admin}\n")
        );
        // A repo ROOT has a `.git` DIRECTORY — not a linked worktree, must be None.
        assert_eq!(host_worktree_admin_name(&repo), None);
        let _ = std::fs::remove_dir_all(&base);
    }

    /// Compiled on every host via the `, test)` widening; real ids on unix, the
    /// `None` stub elsewhere (the non-test build only compiles it on Linux).
    #[test]
    fn current_uid_gid_is_present_on_unix() {
        let ids = current_uid_gid();
        #[cfg(unix)]
        assert!(ids.is_some());
        #[cfg(not(unix))]
        assert!(ids.is_none());
    }

    #[test]
    fn stderr_tail_keeps_the_end_and_never_splits_utf8() {
        assert_eq!(stderr_tail(b""), "docker failed with no error output");
        assert_eq!(stderr_tail(b"  short  "), "short");
        let long = "é".repeat(1000);
        let tail = stderr_tail(long.as_bytes());
        assert!(tail.len() <= 800);
        assert!(tail.chars().all(|c| c == 'é'));
    }
}
