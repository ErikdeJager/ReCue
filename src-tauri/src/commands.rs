//! Tauri command surface — thin wrappers over `SessionManager` and `Store`,
//! plus the event payloads emitted to the frontend.

use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::window::Color;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, Window};
use uuid::Uuid;

use crate::git::{self, BranchList, CommitInfo, FileDiff, FileStatusEntry, WorkingDiff};
use crate::pty::{SessionError, SessionManager};
use crate::store::{OverviewPanel, PersistedSession, RecurringSession, ScheduledSession, Store};

/// Payload for the `session://output` event.
///
/// PTY output is carried as a **base64 string**, not a `Vec<u8>` (#261): serde
/// serializes a byte vector as a JSON integer array (`[27,91,49,...]`, ~4 chars per
/// byte), so an 8 KB read ballooned to ~25–40 KB of JSON that the single WebView main
/// thread had to `JSON.parse` + `Uint8Array.from(number[])` before writing to xterm.
/// Under heavy output that saturated the main thread and stalled React keystroke
/// handling everywhere (the Kanban textarea, other terminals). base64 is ~1.33 chars
/// per byte and decodes with a tight `atob` byte loop. The encode happens in the event
/// forwarder (`lib.rs`); the field is named `b64` so the wire shape is unambiguous.
/// Platform-neutral — `atob` exists in both WKWebView (macOS) and WebView2 (Windows).
#[derive(Clone, Serialize)]
pub struct OutputPayload {
    pub id: String,
    pub b64: String,
    /// Absolute end-offset of this chunk (see `SessionEvent::Output`), so the frontend
    /// can dedupe the scrollback-replay ↔ live-stream overlap on a fresh spawn.
    pub offset: u64,
}

/// Encode a chunk of PTY output as base64 for the `session://output` event (#261).
/// Pure Rust, identical on macOS and Windows; the WebView decodes it with `atob`.
pub fn encode_output(bytes: &[u8]) -> String {
    use base64::Engine as _;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

/// Payload for the `session://exited` event.
#[derive(Clone, Serialize)]
pub struct ExitPayload {
    pub id: String,
    pub code: Option<i32>,
}

/// Payload for `session://forgotten` (task 431): a clean #63 exit Rust already
/// forgot — every window drops local state; only `toast_window` toasts.
#[derive(Clone, Serialize)]
pub struct ForgottenPayload {
    pub id: String,
    pub toast_window: String,
}

/// Payload for `worktree://kept` (task 431): the exit-driven cleanup found a
/// dirty worktree and kept it (#74) — only `toast_window` warns.
#[derive(Clone, Serialize)]
pub struct WorktreeKeptPayload {
    pub dest: String,
    pub toast_window: String,
}

/// Payload for the `session://state` event — busy/idle (#42).
#[derive(Clone, Serialize)]
pub struct StatePayload {
    pub id: String,
    pub busy: bool,
}

/// Payload for `session://size` (task 426): the authoritative PTY grid after
/// multi-window smallest-wins arbitration. Broadcast on change and on attach.
#[derive(Clone, Serialize)]
pub struct SizePayload {
    pub id: String,
    pub cols: u16,
    pub rows: u16,
}

/// Return of `attach_terminal` (task 426): the effective grid the attaching
/// host must render.
#[derive(Clone, Serialize)]
pub struct GridPayload {
    pub cols: u16,
    pub rows: u16,
}

/// Payload for the `session://name` event (#97): claude's latest auto-title for a
/// session, applied as the display label when the user hasn't set a custom name.
#[derive(Clone, Serialize)]
pub struct NamePayload {
    pub id: String,
    pub name: String,
}

/// Payload for the `session://forkable` event (#138): whether a session now has
/// forkable conversation history, so the UI can enable/disable Fork up front.
#[derive(Clone, Serialize)]
pub struct ForkablePayload {
    pub id: String,
    pub forkable: bool,
}

/// Payload for `schedule://fired` (#93): a schedule launched into a live session.
#[derive(Clone, Serialize)]
pub struct ScheduleFiredPayload {
    pub id: String,
    pub session: PersistedSession,
}

/// Payload for `schedule://error` (#93): a schedule's spawn failed (e.g. claude
/// missing); it is dropped rather than retried forever.
#[derive(Clone, Serialize)]
pub struct ScheduleErrorPayload {
    pub id: String,
    pub message: String,
}

/// Payload for `recurring://fired` (#294): a recurring session rotated its child —
/// `session` is the freshly-spawned child agent, `next_fire_at` the advanced time.
#[derive(Clone, Serialize)]
pub struct RecurringFiredPayload {
    pub id: String,
    pub session: PersistedSession,
    pub next_fire_at: u64,
}

/// Payload for `recurring://error` (#294): a recurring session's spawn failed. Unlike
/// a schedule, the record is **kept** (and `next_fire_at` still advanced), so one
/// failure can't wedge or hot-loop the poll.
#[derive(Clone, Serialize)]
pub struct RecurringErrorPayload {
    pub id: String,
    pub message: String,
}

/// Payload for `container://building`: the default dev-container image is being built
/// (first run — one-time, minutes). The frontend toasts it so a container spawn that
/// sits behind the build reads as progress, not a hang. Mirrors the
/// `recurring://error` message shape.
#[derive(Clone, Serialize)]
pub struct ContainerBuildingPayload {
    pub message: String,
}

/// The launch command for a **custom** coding agent (#325). The custom agent's real
/// program + args aren't in a static `AgentSpec` — they come from the user's
/// `customAgentCommand` in the (opaque) settings blob, read here at spawn time. Returns
/// `None` for every built-in agent (which use their spec's binary) and when a custom
/// command isn't set (the spawn path then surfaces a clear "command is not set" error).
fn custom_command_for(store: &Store, agent: &str) -> Option<String> {
    if agent == "custom" {
        crate::agents::read_custom_command(&store.settings())
    } else {
        None
    }
}

/// The parent repo of an app-managed worktree folder `cwd` (#331), if an agent already
/// runs there — i.e. a persisted session whose `repo_path == cwd` carries a
/// `worktree_parent`. Returns `None` for a plain folder (no worktree agent there), so a
/// normal spawn is unaffected. Matches `cwd` against the exact persisted `repo_path`
/// string (an opaque identifier), so it is separator-agnostic and identical on macOS and
/// Windows — no path parsing/normalization. Mirrors the frontend `worktreeParentOf`.
///
/// This makes an interactive "New session here" spawn from a worktree agent's
/// `OpenViewButton` (#213) nest under the existing worktree sub-group rather than
/// registering the worktree folder as a stray top-level sidebar folder, matching the
/// schedule/recurring/fork paths which already carry `worktree_parent`.
fn worktree_parent_for_cwd(sessions: &[PersistedSession], cwd: &str) -> Option<String> {
    sessions
        .iter()
        .find(|s| s.repo_path == cwd && s.worktree_parent.is_some())
        .and_then(|s| s.worktree_parent.clone())
}

/// Pre-flight for a dev-container spawn: resolve the image and gate the request.
/// Claude-only (the embedded image ships only the claude CLI — a codex/opencode/custom
/// container would fail confusingly inside the terminal); docker must be on PATH
/// (**deliberately a `Spawn` error, not `BinaryNotFound`** — the frontend maps that
/// kind to the full-screen ClaudeMissing surface, which would be wrong here); a
/// `containerImage` settings override is trusted as-is, else the default image is
/// built on demand (deduped — see `container::ensure_image`), emitting
/// `container://building` when a build actually starts.
fn prepare_container_spawn(app: &AppHandle, agent: &str) -> Result<String, SessionError> {
    if agent != crate::agents::DEFAULT_AGENT_ID {
        return Err(SessionError::Spawn(
            "Dev-container sessions currently support the Claude Code agent only".into(),
        ));
    }
    if crate::pty::find_on_path("docker").is_none() {
        return Err(SessionError::Spawn(
            "Docker is required for dev-container sessions — install and start Docker Desktop (or the docker CLI) and try again".into(),
        ));
    }
    let store = app.state::<Store>();
    if let Some(custom) = crate::container::read_container_image(&store.settings()) {
        return Ok(custom);
    }
    let emitter = app.clone();
    crate::container::ensure_image(crate::container::DEFAULT_CONTAINER_IMAGE, &move || {
        let _ = emitter.emit(
            "container://building",
            ContainerBuildingPayload {
                message: "Building the dev-container image (first run, a few minutes)…".into(),
            },
        );
    })
    .map_err(|e| SessionError::Spawn(format!("container image build failed: {e}")))?;
    Ok(crate::container::DEFAULT_CONTAINER_IMAGE.to_string())
}

/// Compose the data-only `ContainerLaunch` for a session — spawn AND resume share it.
/// All the side effects live here (the shell): ensure + seed the per-session home,
/// generate the worktree `.git` overlay, read the host git identity, fill the Linux
/// uid/gid arm; `container.rs` stays pure. `worktree_parent` decides the git shape:
/// `Some` ⇒ the single-file overlay (mount the parent's `.git` + shadow `/work/.git`),
/// `None` ⇒ the repo root rides in with its own `.git` directory, no overlay.
fn container_launch_for(
    store: &Store,
    session_id: &str,
    cwd: &str,
    worktree_parent: Option<&str>,
    image: String,
) -> Result<crate::container::ContainerLaunch, SessionError> {
    let data_dir = store
        .data_dir()
        .ok_or_else(|| SessionError::Io("no app data directory".to_string()))?
        .to_path_buf();
    let home = crate::container::container_home_dir(&data_dir, session_id);
    crate::container::seed_home(&home, crate::usage::read_raw_credentials().as_deref())
        .map_err(|e| SessionError::Spawn(format!("could not prepare the container home: {e}")))?;
    let git_overlay = match worktree_parent {
        Some(parent) => {
            // The worktree's admin name comes from its own `.git` pointer file — never
            // guessed from the folder name (git may have suffixed it on collision).
            let admin = crate::container::host_worktree_admin_name(Path::new(cwd))
                .ok_or_else(|| SessionError::Spawn(
                    "could not prepare the container git overlay for this worktree — its .git file was not readable".into(),
                ))?;
            let gitfile = crate::container::prepare_gitfile(
                &crate::container::container_git_dir(&data_dir, session_id),
                &admin,
            )
            .map_err(|e| {
                SessionError::Spawn(format!("could not write the container gitfile: {e}"))
            })?;
            Some(crate::container::GitOverlay {
                repo_git_dir_host: Path::new(parent).join(".git"),
                gitfile_host: gitfile,
            })
        }
        None => None,
    };
    // docker's `--mount` CSV syntax can't escape a comma; refuse up front with a
    // clear error instead of a garbled docker parse failure in the terminal.
    let mut sources: Vec<&Path> = vec![Path::new(cwd), &home];
    if let Some(overlay) = &git_overlay {
        sources.push(&overlay.repo_git_dir_host);
        sources.push(&overlay.gitfile_host);
    }
    if let Some(bad) = sources
        .into_iter()
        .find(|p| !crate::container::path_mountable(p))
    {
        return Err(SessionError::Spawn(format!(
            "this folder's path contains a `,`, which docker --mount cannot express: {}",
            bad.display()
        )));
    }
    let (user_name, user_email) = crate::container::host_git_identity(Path::new(cwd));
    // `--user` only on Linux: native docker would otherwise create root-owned files
    // in the mounted worktree (breaking host-side edits + worktree removal). Docker
    // Desktop on macOS/Windows maps ownership itself, so those arms pass None.
    #[cfg(all(unix, not(target_os = "macos")))]
    let user = crate::container::current_uid_gid();
    #[cfg(not(all(unix, not(target_os = "macos"))))]
    let user = None;
    crate::container::mark_active();
    Ok(crate::container::ContainerLaunch {
        image,
        session_id: session_id.to_string(),
        workdir_host: PathBuf::from(cwd),
        git_overlay,
        home_host: home,
        env: crate::container::git_env_config(&user_name, &user_email),
        user,
    })
}

/// Boot-resume variant (called from `boot.rs`, best-effort): `Ok(None)` for a plain
/// host record, `Ok(Some(launch))` for a container record whose home/overlay composed,
/// `Err(())` when it couldn't — a container record must then **skip** the resume
/// entirely (never fall back to a host PTY: the credentials/home/git universe would
/// be wrong), keeping the normal failed-resume surface (#30/#63). The deduped
/// `ensure_image` means N container records at boot pay for at most one build.
pub(crate) fn boot_container_launch(
    app: &AppHandle,
    record: &PersistedSession,
) -> Result<Option<crate::container::ContainerLaunch>, ()> {
    let Some(image) = record.container_image.clone() else {
        return Ok(None);
    };
    if crate::pty::find_on_path("docker").is_none() {
        return Err(());
    }
    if image == crate::container::DEFAULT_CONTAINER_IMAGE {
        let emitter = app.clone();
        if crate::container::ensure_image(&image, &move || {
            let _ = emitter.emit(
                "container://building",
                ContainerBuildingPayload {
                    message: "Building the dev-container image (first run, a few minutes)…".into(),
                },
            );
        })
        .is_err()
        {
            return Err(());
        }
    }
    let store = app.state::<Store>();
    container_launch_for(
        &store,
        &record.id,
        &record.repo_path,
        record.worktree_parent.as_deref(),
        image,
    )
    .map(Some)
    .map_err(|_| ())
}

/// The docker runtime state driving the New Session modal's container toggle:
/// `"absent"` (no docker CLI — the toggle is hidden), `"stopped"` (installed but
/// the daemon is unreachable — the toggle shows disabled with a "start Docker"
/// hint), `"running"`. Async + `spawn_blocking`: the probe spawns the docker CLI,
/// which waits on a daemon connect when stopped.
#[tauri::command]
pub async fn container_runtime_status() -> Result<String, SessionError> {
    tauri::async_runtime::spawn_blocking(|| crate::container::runtime_status().to_string())
        .await
        .map_err(|e| SessionError::Io(e.to_string()))
}

/// Background prefetch fired when the user switches the modal's "Run in dev
/// container" toggle ON, so the one-time image build overlaps the user finishing the
/// modal instead of stalling the spawn. Best-effort by design: docker missing or a
/// custom `containerImage` override → quiet no-op (the spawn path is the
/// authoritative error surface). Async + `spawn_blocking` — a first build takes minutes.
#[tauri::command]
pub async fn ensure_container_image(app: AppHandle) -> Result<(), SessionError> {
    tauri::async_runtime::spawn_blocking(move || {
        if crate::pty::find_on_path("docker").is_none() {
            return;
        }
        let store = app.state::<Store>();
        if crate::container::read_container_image(&store.settings()).is_some() {
            return;
        }
        let emitter = app.clone();
        let _ =
            crate::container::ensure_image(crate::container::DEFAULT_CONTAINER_IMAGE, &move || {
                let _ = emitter.emit(
                    "container://building",
                    ContainerBuildingPayload {
                        message: "Building the dev-container image (first run, a few minutes)…"
                            .into(),
                    },
                );
            });
    })
    .await
    .map_err(|e| SessionError::Io(e.to_string()))
}

/// Spawn a new agent session in `cwd`.
///
/// **Async + off the main thread (#353):** a `pub fn` Tauri command runs on the webview
/// (main) thread, and this one ends in `SessionManager::spawn_session_with_prompt` →
/// `spawn_with_id`, which does a `cwd` stat, a **full `$PATH` scan** (`find_on_path`),
/// an `openpty()`, a copy of the **whole process environment**, and a `fork`/`exec` of
/// the agent binary — so starting an agent froze the window. `spawn_blocking` moves all
/// of that onto the blocking pool. The state is reached through an owned `AppHandle`
/// rather than `State<'_, _>` (a borrow is not `'static`, so it can never be captured by
/// the closure); that changes nothing on the wire — Tauri injects those args, `invoke`
/// never sends them. Spawning a PTY off the main thread is already what the boot-resume
/// thread does on every launch, on all three OSes, so no `#[cfg]` arm is involved.
#[tauri::command]
pub async fn spawn_session(
    app: AppHandle,
    cwd: String,
    name: Option<String>,
    agent: Option<String>,
    prompt: Option<String>,
    container: Option<bool>,
) -> Result<PersistedSession, SessionError> {
    tauri::async_runtime::spawn_blocking(move || {
        spawn_session_blocking(&app, cwd, name, agent, prompt, container)
    })
    .await
    .map_err(|e| SessionError::Io(e.to_string()))?
}

fn spawn_session_blocking(
    app: &AppHandle,
    cwd: String,
    name: Option<String>,
    agent: Option<String>,
    prompt: Option<String>,
    container: Option<bool>,
) -> Result<PersistedSession, SessionError> {
    let manager = app.state::<SessionManager>();
    let store = app.state::<Store>();
    // The coding agent for this session (#101). Until the Settings selector (the
    // follow-up) the frontend omits it, so it defaults to Claude.
    let agent = agent.unwrap_or_else(|| crate::agents::DEFAULT_AGENT_ID.to_string());
    // A non-blank initial prompt pre-seeds the session (#118 Canvas templates),
    // like a scheduled session (#93); omitted/blank → a plain new session.
    let prompt = prompt.filter(|p| !p.trim().is_empty());
    // The custom agent's launch command lives in the (opaque) settings blob (#325);
    // resolve it only for `agent == "custom"`, else pass `None`.
    let custom = custom_command_for(&store, &agent);
    // When `cwd` is an existing app-managed worktree (an agent already runs there with a
    // recorded `worktree_parent`), nest the new session under that parent instead of
    // registering the worktree folder as a stray top-level sidebar folder (#331). A plain
    // folder resolves to `None`, so a normal spawn is unchanged. Covers every frontend
    // entry point routing through `spawn_session` (OpenViewButton "New session here",
    // NewSessionModal, CreatePanelModal, Canvas template `new-agent`, `createBranchSession`).
    let worktree_parent = worktree_parent_for_cwd(&store.sessions(), &cwd);
    // Dev-container session (opt-in): mint the session UUID HERE so the container
    // label == the record id == the per-session home-dir key, then compose the docker
    // launch. When `cwd` is itself a worktree, lock it (best-effort) against an
    // in-container `git worktree prune` before the container gets the `.git` mount.
    let launch = match container {
        Some(true) => {
            let image = prepare_container_spawn(app, &agent)?;
            let session_id = Uuid::new_v4().to_string();
            if let Some(parent) = &worktree_parent {
                let _ = git::worktree_lock(parent, &cwd, "ReCue dev-container session");
            }
            Some(container_launch_for(
                &store,
                &session_id,
                &cwd,
                worktree_parent.as_deref(),
                image,
            )?)
        }
        _ => None,
    };
    let info = manager.spawn_session_with_prompt(
        cwd.as_str(),
        name.clone(),
        prompt.as_deref(),
        &agent,
        custom.as_deref(),
        launch.as_ref(),
    )?;
    let record = PersistedSession {
        id: info.id.clone(),
        claude_session_id: info.id,
        repo_path: cwd.clone(),
        name,
        created_at: now_secs(),
        worktree_parent: worktree_parent.clone(),
        auto_name: None,
        has_been_active: false,
        agent,
        forked_from: None,
        // A freshly spawned session has no log yet → not forkable until its first
        // real turn materializes one (#138); the title worker flips it then. A
        // dev-container session stays unforkable for good (its log lives in the
        // container home, so the title worker never runs for it).
        forkable: false,
        // Per-agent auto-continue opt-out (#297) — inherit the global behavior.
        auto_continue_disabled: false,
        // Per-agent watch (#336) — off (opt-in); the global switch can force it on.
        watch: false,
        container_image: launch.as_ref().map(|l| l.image.clone()),
    };
    store
        .add_session(record.clone())
        .map_err(|e| SessionError::Io(e.to_string()))?;
    // Touch the parent repo for a worktree spawn (mirroring the schedule/fire path), the
    // folder itself otherwise — so the worktree dir never appears as a new recent (#331).
    store
        .touch_recent(worktree_parent.as_deref().unwrap_or(&cwd))
        .map_err(|e| SessionError::Io(e.to_string()))?;
    // Cross-window sync (task 428): the roster + recents both changed.
    broadcast_sessions(app, &store);
    broadcast_recents(app, &store);
    Ok(record)
}

/// Spawn a plain shell **terminal item** (#72) in `cwd` under the caller-chosen
/// `id` (the Overview panel's id). Unlike `spawn_session` this is not a `claude`
/// agent and is **not** persisted in `sessions.json` — the item lives in
/// `overview_panels` (frontend) and a fresh shell is respawned **by the Rust boot
/// sequence** (`boot::respawn_shell_terminals`, task 432); this command remains
/// the runtime create/Restart path. Kill it with `kill_session` (the PTY registry
/// is shared).
///
/// Async + off the main thread (#353) — same `spawn_with_id` cost as `spawn_session`.
#[tauri::command]
pub async fn spawn_terminal(app: AppHandle, cwd: String, id: String) -> Result<(), SessionError> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<SessionManager>()
            .spawn_terminal(id, cwd.as_str())
            .map(|_| ())
    })
    .await
    .map_err(|e| SessionError::Io(e.to_string()))?
}

/// Start an agent in an **isolated git worktree** for an existing `branch` of
/// `repo` (#74). Creates the app-managed worktree folder if absent, reuses it
/// otherwise (multiple agents per worktree), spawns `claude` there, and persists
/// the record with `worktree_parent = repo` (its `repo_path` is the worktree).
///
/// Async + off the main thread (#353) — this is the heaviest spawn path: `git worktree
/// add` checks out a **whole tree** before the PTY spawn's `$PATH` scan + fork/exec. See
/// the `spawn_session` note.
#[tauri::command]
pub async fn spawn_worktree_agent(
    app: AppHandle,
    repo: String,
    branch: String,
    agent: Option<String>,
    container: Option<bool>,
) -> Result<PersistedSession, SessionError> {
    tauri::async_runtime::spawn_blocking(move || {
        spawn_worktree_agent_blocking(&app, repo, branch, agent, container)
    })
    .await
    .map_err(|e| SessionError::Io(e.to_string()))?
}

fn spawn_worktree_agent_blocking(
    app: &AppHandle,
    repo: String,
    branch: String,
    agent: Option<String>,
    container: Option<bool>,
) -> Result<PersistedSession, SessionError> {
    let manager = app.state::<SessionManager>();
    let store = app.state::<Store>();
    let agent = agent.unwrap_or_else(|| crate::agents::DEFAULT_AGENT_ID.to_string());
    let dest = worktree_path(&store, &repo, &branch)?;
    // `git worktree add` fails if the folder already exists, so only add when it
    // isn't there yet — an existing folder means we reuse the worktree.
    if !dest.is_dir() {
        git::worktree_add(&repo, &branch, &dest).map_err(SessionError::Git)?;
    }
    let dest_str = dest.to_string_lossy().to_string();
    let custom = custom_command_for(&store, &agent);
    // Dev-container variant: lock the worktree (best-effort, prune guard) and compose
    // the docker launch — the worktree mounts at /work with the `.git` overlay.
    let launch = match container {
        Some(true) => {
            let image = prepare_container_spawn(app, &agent)?;
            let session_id = Uuid::new_v4().to_string();
            let _ = git::worktree_lock(&repo, &dest, "ReCue dev-container session");
            Some(container_launch_for(
                &store,
                &session_id,
                &dest_str,
                Some(&repo),
                image,
            )?)
        }
        _ => None,
    };
    let info = manager.spawn_session(
        dest_str.as_str(),
        None,
        &agent,
        custom.as_deref(),
        launch.as_ref(),
    )?;
    let record = PersistedSession {
        id: info.id.clone(),
        claude_session_id: info.id,
        repo_path: dest_str,
        name: None,
        created_at: now_secs(),
        worktree_parent: Some(repo),
        auto_name: None,
        has_been_active: false,
        agent,
        forked_from: None,
        // A freshly spawned session has no log yet → not forkable until its first
        // real turn materializes one (#138); the title worker flips it then.
        forkable: false,
        // Per-agent auto-continue opt-out (#297) — inherit the global behavior.
        auto_continue_disabled: false,
        // Per-agent watch (#336) — off (opt-in); the global switch can force it on.
        watch: false,
        container_image: launch.as_ref().map(|l| l.image.clone()),
    };
    store
        .add_session(record.clone())
        .map_err(|e| SessionError::Io(e.to_string()))?;
    // Cross-window sync (task 428): the roster changed.
    broadcast_sessions(app, &store);
    Ok(record)
}

/// Start an agent in an isolated worktree on a **new** branch `name` (from `base`,
/// empty = HEAD) of `repo` (#124, extends #74). Creates the branch + its worktree
/// folder via `git worktree add -b`, spawns `claude` there, and persists the record
/// with `worktree_parent = repo`. Branch-name validation surfaces as `SessionError::Git`.
///
/// Async + off the main thread (#353) — `git worktree add -b` + a PTY spawn; see the
/// `spawn_worktree_agent` note.
#[tauri::command]
pub async fn spawn_worktree_agent_new_branch(
    app: AppHandle,
    repo: String,
    name: String,
    base: String,
    agent: Option<String>,
    container: Option<bool>,
) -> Result<PersistedSession, SessionError> {
    tauri::async_runtime::spawn_blocking(move || {
        spawn_worktree_agent_new_branch_blocking(&app, repo, name, base, agent, container)
    })
    .await
    .map_err(|e| SessionError::Io(e.to_string()))?
}

fn spawn_worktree_agent_new_branch_blocking(
    app: &AppHandle,
    repo: String,
    name: String,
    base: String,
    agent: Option<String>,
    container: Option<bool>,
) -> Result<PersistedSession, SessionError> {
    let manager = app.state::<SessionManager>();
    let store = app.state::<Store>();
    let agent = agent.unwrap_or_else(|| crate::agents::DEFAULT_AGENT_ID.to_string());
    let dest = worktree_path(&store, &repo, &name)?;
    git::worktree_add_new_branch(&repo, &name, &base, &dest).map_err(SessionError::Git)?;
    let dest_str = dest.to_string_lossy().to_string();
    let custom = custom_command_for(&store, &agent);
    // Dev-container variant — same shape as `spawn_worktree_agent_blocking`.
    let launch = match container {
        Some(true) => {
            let image = prepare_container_spawn(app, &agent)?;
            let session_id = Uuid::new_v4().to_string();
            let _ = git::worktree_lock(&repo, &dest, "ReCue dev-container session");
            Some(container_launch_for(
                &store,
                &session_id,
                &dest_str,
                Some(&repo),
                image,
            )?)
        }
        _ => None,
    };
    let info = manager.spawn_session(
        dest_str.as_str(),
        None,
        &agent,
        custom.as_deref(),
        launch.as_ref(),
    )?;
    let record = PersistedSession {
        id: info.id.clone(),
        claude_session_id: info.id,
        repo_path: dest_str,
        name: None,
        created_at: now_secs(),
        worktree_parent: Some(repo),
        auto_name: None,
        has_been_active: false,
        agent,
        forked_from: None,
        // A freshly spawned session has no log yet → not forkable until its first
        // real turn materializes one (#138); the title worker flips it then.
        forkable: false,
        // Per-agent auto-continue opt-out (#297) — inherit the global behavior.
        auto_continue_disabled: false,
        // Per-agent watch (#336) — off (opt-in); the global switch can force it on.
        watch: false,
        container_image: launch.as_ref().map(|l| l.image.clone()),
    };
    store
        .add_session(record.clone())
        .map_err(|e| SessionError::Io(e.to_string()))?;
    // Cross-window sync (task 428): the roster changed.
    broadcast_sessions(app, &store);
    Ok(record)
}

/// Remove the worktree at `dest` from its `parent` repo (#74). Called by the
/// frontend only after the worktree's last active agent is removed. `force` is
/// needed when the worktree has uncommitted changes; a non-forced call fails on
/// a dirty tree, which the UI uses as the confirm guard.
///
/// **Async + off the main thread (#200):** `git worktree remove` deletes the
/// worktree directory from disk — potentially thousands of files
/// (`node_modules`, build output, …). A non-`async` Tauri command runs on the
/// main (webview) thread, so that FS delete would **freeze the UI** until it
/// finishes. Marking the command `async` moves it onto the async runtime, and
/// `spawn_blocking` runs the synchronous `git` shell-out on a dedicated blocking
/// pool so it can't starve that runtime's workers either. The `force`/dirty-tree
/// error semantics and the typed `SessionError::Git` mapping are unchanged.
#[tauri::command]
pub async fn remove_worktree(
    parent: String,
    dest: String,
    force: bool,
) -> Result<(), SessionError> {
    tauri::async_runtime::spawn_blocking(move || {
        // A dev-container session locked the worktree at spawn (the in-container
        // `git worktree prune` guard) and git refuses to remove a locked worktree —
        // unlock first, best-effort (a never-locked worktree fails harmlessly).
        let _ = git::worktree_unlock(&parent, &dest);
        git::worktree_remove(&parent, &dest, force).map_err(SessionError::Git)
    })
    .await
    .map_err(|e| SessionError::Io(e.to_string()))?
}

/// Write keystrokes to a session's PTY.
///
/// **Stays synchronous on purpose (#353)** — while its siblings moved off the webview
/// thread, this one must not. It is the **per-keystroke** hot path, and the work is a
/// `memcpy` plus one `write`/`flush` to the PTY master (microseconds); an async hop would
/// cost a task spawn + a thread hand-off per character. Decisively, it would also
/// **destroy write ordering**: `terminalPool.ts` fires `void writeStdin(...)` from xterm's
/// `onData` **without awaiting**, so two quick keystrokes would become two independent
/// blocking tasks racing for the per-session writer lock and could reach the PTY out of
/// order — a corrupted prompt. Making this non-blocking *without* losing FIFO order needs
/// a per-session writer thread + an `mpsc` queue in `pty.rs`; that is a separate,
/// deliberately deferred change, not a `spawn_blocking` wrapper.
#[tauri::command]
pub fn write_stdin(
    manager: State<'_, SessionManager>,
    id: String,
    data: String,
) -> Result<(), SessionError> {
    manager.write_stdin(&id, &data)
}

/// Resize a session's PTY to `cols` × `rows`.
///
/// **Stays synchronous on purpose (#353)** — a cheap ioctl (`TIOCSWINSZ` on unix,
/// `ResizePseudoConsole` on Windows), and like `write_stdin` it is fired-and-forgotten
/// (from a `ResizeObserver` in `terminalPool.ts`). Racing async resizes could land **out
/// of order**, leaving the PTY on a stale size while xterm believes otherwise (a garbled
/// TUI until the next resize) — a real regression for no measurable win.
#[tauri::command]
pub fn resize_pty(
    manager: State<'_, SessionManager>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), SessionError> {
    manager.resize_pty(&id, cols, rows)
}

/// Attach a window's terminal view to a session (multi-window card 1/16, task
/// 426) and return the effective grid the attaching host must render — the
/// smallest-wins arbitration over every attached view (`terminal_views`). No
/// frontend caller yet; later epic cards migrate the terminal pool onto it.
///
/// **Stays synchronous on purpose (#353)** — like `resize_pty`, racing async
/// ops could apply sizes out of order, leaving the PTY on a stale grid.
/// Infallible: the registry lock recovers from poisoning (the `kill_all`
/// precedent) and a missing/exited session's resize is best-effort.
/// `window_label` is an explicit parameter (not derived from the invoking
/// `Window`) because later epic cards (15/16 targeted delivery) address views
/// cross-window.
#[tauri::command]
pub fn attach_terminal(
    manager: State<'_, SessionManager>,
    views: State<'_, crate::terminal_views::TerminalViews>,
    id: String,
    window_label: String,
    cols: u16,
    rows: u16,
) -> GridPayload {
    let (cols, rows) = views.attach(&manager, &id, &window_label, cols, rows);
    GridPayload { cols, rows }
}

/// Detach a window's terminal view from a session (multi-window card 1/16,
/// task 426): its desired size stops clamping the PTY, which grows back to the
/// remaining views' minimum. No frontend caller yet.
///
/// **Stays synchronous on purpose (#353)** and infallible — see
/// `attach_terminal`; `window_label` is explicit for the same reason.
#[tauri::command]
pub fn detach_terminal(
    manager: State<'_, SessionManager>,
    views: State<'_, crate::terminal_views::TerminalViews>,
    id: String,
    window_label: String,
) {
    views.detach(&manager, &id, &window_label);
}

/// Update an **already-attached** view's desired grid (multi-window card 1/16,
/// task 426) — the multi-window analogue of `resize_pty`'s ResizeObserver
/// cadence. A proposal for a never-attached (or already-purged) view is a
/// no-op, so a late resize racing a window close can't resurrect a zombie view
/// that would clamp the PTY forever. No frontend caller yet.
///
/// **Stays synchronous on purpose (#353)** and infallible — see
/// `attach_terminal`; `window_label` is explicit for the same reason.
#[tauri::command]
pub fn propose_terminal_size(
    manager: State<'_, SessionManager>,
    views: State<'_, crate::terminal_views::TerminalViews>,
    id: String,
    window_label: String,
    cols: u16,
    rows: u16,
) {
    views.propose(&manager, &id, &window_label, cols, rows);
}

/// Soft-claim `{repo_path, file}` for `window_label`'s auto-save editor (task 435):
/// that window becomes the file's authoritative editor and every other window's
/// editor renders read-only. Last claim wins — the "Take over" affordance is this
/// same call. Advisory only: never an on-disk lock, `write_text_file` is untouched,
/// and a stale/raced claim degrades to last-writer-wins. Emits
/// `file_claims://changed` (the full sorted snapshot, task-428 shape) only when the
/// registry actually changed (a same-label re-claim is silent).
///
/// **Stays synchronous on purpose** — cheap map ops (#353) and infallible (the
/// registry lock recovers from poisoning). `window_label` is an explicit parameter
/// (the `attach_terminal` precedent), never derived from the invoking `Window`.
#[tauri::command]
pub fn claim_file(
    app: AppHandle,
    claims: State<'_, crate::file_claims::FileClaims>,
    repo_path: String,
    file: String,
    window_label: String,
) {
    claims.claim(&app, &repo_path, &file, &window_label);
}

/// Release `window_label`'s soft claim on `{repo_path, file}` (task 435) — the
/// editor settled clean (blurred + saved) or unmounted. A stale release (another
/// window already took the claim over) is a silent no-op that never clears the new
/// holder. Sync + infallible like `claim_file`; emits `file_claims://changed` only
/// on change.
#[tauri::command]
pub fn release_file_claim(
    app: AppHandle,
    claims: State<'_, crate::file_claims::FileClaims>,
    repo_path: String,
    file: String,
    window_label: String,
) {
    claims.release(&app, &repo_path, &file, &window_label);
}

/// The full current soft-claim list (task 435) — the late-subscriber snapshot:
/// call AFTER subscribing to `file_claims://changed` (the task-428/430
/// subscribe-then-fetch discipline; the registry is updated before each emit, so
/// this can never lag an event a subscriber already saw).
#[tauri::command]
pub fn file_claims(
    claims: State<'_, crate::file_claims::FileClaims>,
) -> Vec<crate::file_claims::FileClaim> {
    claims.snapshot()
}

/// Restart a persisted session under the same id (#63) — the exit overlay's Restart.
///
/// Async + off the main thread (#353) — the same `spawn_with_id` cost as `spawn_session`
/// (stat + `$PATH` scan + `openpty` + env copy + fork/exec). See that note.
#[tauri::command]
pub async fn resume_session(app: AppHandle, id: String) -> Result<PersistedSession, SessionError> {
    tauri::async_runtime::spawn_blocking(move || resume_session_blocking(&app, id))
        .await
        .map_err(|e| SessionError::Io(e.to_string()))?
}

fn resume_session_blocking(app: &AppHandle, id: String) -> Result<PersistedSession, SessionError> {
    let manager = app.state::<SessionManager>();
    let store = app.state::<Store>();
    let record = store
        .session(&id)
        .ok_or_else(|| SessionError::SessionNotFound(id.clone()))?;
    // Gate on the agent's resume capability (#141): a Codex session can't be resumed
    // by id (no app-ownable identity), so Restart refuses cleanly rather than spawning
    // a CLI that would mis-handle `--resume`. Claude resumes exactly as before.
    if !crate::agents::agent_spec(&record.agent).supports_resume {
        return Err(SessionError::ResumeUnsupported(record.agent));
    }
    // Dev-container session: rebuild the docker launch from the PERSISTED record
    // (never the settings — a later image change must not break an old session's
    // resume). The image is ensured only for the app-built default (a custom
    // override is trusted as-is); `seed_home` is idempotent, and the persisted
    // per-session home is exactly what makes `claude --resume <id>` find its log.
    // Any still-labeled container from a previous generation is killed first so
    // the label can never match two containers at once.
    let launch = match record.container_image.clone() {
        Some(image) => {
            if crate::pty::find_on_path("docker").is_none() {
                return Err(SessionError::Spawn(
                    "Docker is required to restart this dev-container session — install and start Docker Desktop (or the docker CLI) and try again".into(),
                ));
            }
            if image == crate::container::DEFAULT_CONTAINER_IMAGE {
                let emitter = app.clone();
                crate::container::ensure_image(&image, &move || {
                    let _ = emitter.emit(
                        "container://building",
                        ContainerBuildingPayload {
                            message: "Building the dev-container image (first run, a few minutes)…"
                                .into(),
                        },
                    );
                })
                .map_err(|e| SessionError::Spawn(format!("container image build failed: {e}")))?;
            }
            crate::container::kill_session_containers(&record.id);
            Some(container_launch_for(
                &store,
                &record.id,
                &record.repo_path,
                record.worktree_parent.as_deref(),
                image,
            )?)
        }
        None => None,
    };
    manager.resume_session(
        &record.claude_session_id,
        &record.repo_path,
        record.name.clone(),
        &record.agent,
        launch.as_ref(),
    )?;
    Ok(record)
}

/// Fork a source agent's conversation into a **new parallel session** (#126). Looks
/// up the source's persisted record for its folder / agent / worktree, spawns the
/// fork (`claude --session-id <new> --resume <source> --fork-session`), and persists a
/// new `PersistedSession` carrying an app-owned id + `forked_from = <source>`. The
/// source session is left untouched (the fork has its own id). The fork inherits the
/// source's `repo_path` + `worktree_parent` (same cwd / worktree). A source with no
/// materialized conversation is refused up front (#134, see below) rather than spawned
/// into a `claude` that would exit 1 and leave a dead "Process exited" panel (#63).
///
/// Async + off the main thread (#353) — the `~/.claude/projects/*/<uuid>.jsonl` glob
/// (`title::has_conversation`) plus the full `spawn_with_id` cost. See `spawn_session`.
#[tauri::command]
pub async fn fork_session(
    app: AppHandle,
    source_id: String,
) -> Result<PersistedSession, SessionError> {
    tauri::async_runtime::spawn_blocking(move || fork_session_blocking(&app, source_id))
        .await
        .map_err(|e| SessionError::Io(e.to_string()))?
}

fn fork_session_blocking(
    app: &AppHandle,
    source_id: String,
) -> Result<PersistedSession, SessionError> {
    let manager = app.state::<SessionManager>();
    let store = app.state::<Store>();
    let source = store
        .session(&source_id)
        .ok_or_else(|| SessionError::SessionNotFound(source_id.clone()))?;
    // Gate on the agent's resume/fork capability (#141): Codex can't fork (no
    // app-ownable session id), so refuse up front (the #142 UI also hides the button).
    if !crate::agents::agent_spec(&source.agent).supports_resume {
        return Err(SessionError::ResumeUnsupported(source.agent));
    }
    // A dev-container source can't be forked: its conversation log lives in the
    // per-session container home, so a fork's `--resume <source>` in a FRESH home
    // would find nothing. Belt-and-braces — the UI already shows Fork unavailable
    // (a container session's `forkable` never flips true).
    if source.container_image.is_some() {
        return Err(SessionError::ContainerUnsupported);
    }
    // Guard (#134): forking needs the source's on-disk conversation log to exist with
    // ≥1 real turn. A brand-new / never-interacted source — including a just-created
    // fork whose log isn't materialized yet (#116 keeps it gray) — would otherwise
    // spawn a `claude` that exits 1 ("No conversation found"), surfacing as a crashed
    // panel. Check the log (not busy / `has_been_active`) and refuse before spawning.
    if !crate::title::has_conversation(&source.claude_session_id) {
        return Err(SessionError::NothingToFork);
    }
    let info = manager.fork_session(
        &source.claude_session_id,
        &source.repo_path,
        None,
        &source.agent,
    )?;
    let record = PersistedSession {
        id: info.id.clone(),
        claude_session_id: info.id,
        repo_path: source.repo_path.clone(),
        name: None,
        created_at: now_secs(),
        worktree_parent: source.worktree_parent.clone(),
        auto_name: None,
        has_been_active: false,
        agent: source.agent.clone(),
        forked_from: Some(source_id),
        // A fresh fork's own log isn't materialized until first interaction (#134),
        // so it isn't forkable yet — the title worker flips it on the first turn (#138).
        forkable: false,
        // Per-agent auto-continue opt-out (#297) — inherit the global behavior.
        auto_continue_disabled: false,
        // Per-agent watch (#336) — off (opt-in); the global switch can force it on.
        watch: false,
        // A dev-container source is refused above, so a fork is always a host PTY.
        container_image: None,
    };
    store
        .add_session(record.clone())
        .map_err(|e| SessionError::Io(e.to_string()))?;
    store
        .touch_recent(&source.repo_path)
        .map_err(|e| SessionError::Io(e.to_string()))?;
    // Cross-window sync (task 428): the roster + recents both changed.
    broadcast_sessions(app, &store);
    broadcast_recents(app, &store);
    Ok(record)
}

/// Remove an agent (#63): kill its child process and forget its persisted record.
///
/// Async + off the main thread (#353) — a child kill plus a full `sessions.json` rewrite;
/// not latency-critical, and each call targets a distinct id, so out-of-order completion
/// is harmless.
#[tauri::command]
pub async fn kill_session(app: AppHandle, id: String) -> Result<(), SessionError> {
    tauri::async_runtime::spawn_blocking(move || kill_session_blocking(&app, id))
        .await
        .map_err(|e| SessionError::Io(e.to_string()))?
}

fn kill_session_blocking(app: &AppHandle, id: String) -> Result<(), SessionError> {
    let manager = app.state::<SessionManager>();
    let store = app.state::<Store>();
    // Capture the record BEFORE removal — the container teardown below needs its
    // `container_image` + the per-session dir paths.
    let record = store.session(&id);
    // The session may not be live (e.g. it failed to resume on boot); forget it
    // from the store either way so Remove = kill + forget and it never reappears.
    let _ = manager.kill_session(&id);
    // Dev-container session: the PTY-side hangup above reached only the docker
    // *client* — kill the container itself (by label, detached — mirroring
    // `kill_now`'s non-blocking shape) and then delete the per-session home +
    // gitfile dirs. This one path serves Remove AND the clean-exit forget (both
    // arrive via this command), so the dirs never outlive the record.
    if record.as_ref().is_some_and(|r| r.container_image.is_some()) {
        let dirs = store.data_dir().map(|data| {
            (
                crate::container::container_home_dir(data, &id),
                crate::container::container_git_dir(data, &id),
            )
        });
        let (home, gitdir) = match dirs {
            Some((home, gitdir)) => (Some(home), Some(gitdir)),
            None => (None, None),
        };
        crate::container::kill_session_container_detached(id.clone(), home, gitdir);
    }
    store
        .remove_session(&id)
        .map_err(|e| SessionError::Io(e.to_string()))?;
    // Cross-window sync (task 428): broadcast the roster only when a persisted record
    // actually existed — a shell-terminal item kill (#72) has no record, so emitting
    // there would be a gratuitous unchanged-roster echo.
    if record.is_some() {
        broadcast_sessions(app, &store);
    }
    Ok(())
}

// --- Rust-owned clean-exit forget + ref-counted worktree cleanup (task 431) ---
//
// The #63 clean-exit decision (code 0 while running → kill + delete record + one
// "Agent exited" toast) and the #74/#199 ref-counted worktree removal used to live in
// each window's `session://exited` handler — with the epic's N full windows they would
// all run it, double-deleting records, double-toasting, and racing `git worktree
// remove`. They now run exactly ONCE per app, here: the event forwarder consumes a
// clean exit (`handle_session_exit`), the forget task reuses `kill_session_blocking`
// (container teardown + record removal + roster broadcast) and emits
// `session://forgotten` + (for a kept-dirty worktree) `worktree://kept`, each carrying
// the one window that should toast (`toast_target`). Non-clean exits still emit
// `session://exited` byte-identically.

/// Pure #63 discriminator (ported from store.ts `isCleanExit`, task 431). A **clean**
/// exit — the agent exits **code 0** while the app is running and the kill was not
/// app-initiated (Remove/forget/rotation/cancel) — means the user ended the agent: it
/// is forgotten everywhere (kill + forget), never showing a "Process exited" overlay.
/// Anything else — a non-zero/unknown code (crash), the boot resume window (#30, where
/// a failed resume exits and is offered a Restart), or an intentional kill (which
/// toasts on its own) — is **not** clean and keeps the existing path.
pub fn is_clean_exit(code: Option<i32>, boot_window: bool, intentional: bool) -> bool {
    code == Some(0) && !boot_window && !intentional
}

/// What the event forwarder does with a session's exit (task 431).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExitAction {
    /// Emit `session://exited` exactly as before — the frontend keeps the overlay /
    /// Restart / toast-suppression logic (shell terminals, crashes, boot failures,
    /// recurring children, intentional kills).
    EmitExited,
    /// Consume the exit: Rust forgets the record + emits `session://forgotten`.
    ForgetClean,
}

/// Pure exit classifier for the forwarder (task 431): the Rust forget path runs only
/// for a **tracked agent record** (`has_record` — a shell terminal #72 has none) that
/// is **not** a recurring's rotating child (#294 — its exit drives the rotation UX,
/// never a forget) and whose exit `is_clean_exit`. Every guard failure degrades to
/// today's `session://exited` emit — the worst outcome is the old behavior.
pub fn classify_exit(
    has_record: bool,
    recurring_owned: bool,
    code: Option<i32>,
    boot_window: bool,
    intentional: bool,
) -> ExitAction {
    if has_record && !recurring_owned && is_clean_exit(code, boot_window, intentional) {
        ExitAction::ForgetClean
    } else {
        ExitAction::EmitExited
    }
}

/// The #63 boot-resume window, Rust-side (task 431; mirrors store.ts `booting`):
/// true from setup (when persisted records exist) until [`RECONNECT_BACKSTOP_MS`]
/// after the boot resume pass returns. A code-0 exit inside it keeps the record +
/// overlay (a failed boot resume is offered Restart, never auto-forgotten, #30).
pub struct BootWindow(pub std::sync::atomic::AtomicBool);

/// How long after the boot resume pass returns the boot window stays open (task 431)
/// — the mirror of store.ts `RECONNECT_BACKSTOP_MS` (~102), a fixed unconditional cap.
pub const RECONNECT_BACKSTOP_MS: u64 = 4_000;

/// The one window that should show a courtesy toast for an app-level event (task
/// 431): the focused window's label, else `"main"` when present, else the
/// lexicographically first label, else `"main"`. Labels are scanned in sorted order so
/// the pick is deterministic. Thin/untested (the `broadcast_*` precedent) — delivery
/// is best-effort; state convergence never depends on the toast.
pub fn toast_target(app: &AppHandle) -> String {
    let windows = app.webview_windows();
    let mut labels: Vec<&String> = windows.keys().collect();
    labels.sort();
    for label in &labels {
        if let Some(window) = windows.get(*label) {
            if window.is_focused().unwrap_or(false) {
                return (*label).clone();
            }
        }
    }
    if windows.contains_key("main") {
        return "main".to_string();
    }
    labels
        .first()
        .map(|l| (*l).clone())
        .unwrap_or_else(|| "main".to_string())
}

/// #74/#199 ref-count, ported from store.ts `worktreeHasItems` (task 431): keep the
/// worktree while ANY item — a session record (incl. exited-but-kept), an overview
/// panel of the worktree folder, or a schedule/recurring created inside it (`cwd`) or
/// targeting it (`worktree_path`, #259 — its `cwd` is the parent repo, but its
/// eagerly-created worktree folder is `worktree_path`) — still points at `dest`.
pub fn worktree_has_items(
    sessions: &[PersistedSession],
    panels: &HashMap<String, Vec<OverviewPanel>>,
    schedules: &[ScheduledSession],
    recurrings: &[RecurringSession],
    dest: &str,
) -> bool {
    sessions.iter().any(|s| s.repo_path == dest)
        || panels.get(dest).is_some_and(|p| !p.is_empty())
        || schedules
            .iter()
            .any(|sc| sc.cwd == dest || sc.worktree_path.as_deref() == Some(dest))
        || recurrings
            .iter()
            .any(|r| r.cwd == dest || r.worktree_path.as_deref() == Some(dest))
}

/// Serializes every ref-count-check → git-remove pair (task 431): two windows (or a
/// window and the Rust exit path) can no longer both see "empty" and double-run
/// `git worktree remove` (check/check/remove/remove-fails → a spurious "kept dirty").
#[derive(Default)]
pub struct WorktreeCleanupLock(pub std::sync::Mutex<()>);

/// Outcome of a ref-counted worktree cleanup (task 431).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum WorktreeCleanup {
    /// The worktree was removed (or was already gone — idempotent).
    Removed,
    /// Some item (session/panel/schedule/recurring) still references it — kept.
    InUse,
    /// git refused the non-forced remove (uncommitted changes) — kept, warn (#74).
    KeptDirty,
}

/// The shared blocking core behind [`cleanup_worktree_if_empty`] and the clean-exit
/// forget path (task 431). Under the one [`WorktreeCleanupLock`]: snapshot the
/// persisted Store state, keep the worktree while [`worktree_has_items`] holds
/// (`InUse`); report an already-missing dest as `Removed` (idempotent — a concurrent
/// earlier cleanup already won); else unlock (best-effort, the dev-container lock) and
/// run the **non-forced** `git worktree remove` — git refusing a dirty tree IS the
/// dirty guard (#74, never force) → `KeptDirty`.
pub fn cleanup_worktree_blocking(app: &AppHandle, parent: &str, dest: &str) -> WorktreeCleanup {
    let lock = app.state::<WorktreeCleanupLock>();
    let _guard = lock
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let store = app.state::<Store>();
    if worktree_has_items(
        &store.sessions(),
        &store.overview_panels(),
        &store.schedules(),
        &store.recurrings(),
        dest,
    ) {
        return WorktreeCleanup::InUse;
    }
    if !Path::new(dest).is_dir() {
        return WorktreeCleanup::Removed;
    }
    // A dev-container session locked the worktree at spawn (the in-container `git
    // worktree prune` guard); unlock best-effort like `remove_worktree`.
    let _ = git::worktree_unlock(parent, dest);
    match git::worktree_remove(parent, dest, false) {
        Ok(()) => WorktreeCleanup::Removed,
        Err(_) => WorktreeCleanup::KeptDirty,
    }
}

/// Ref-counted worktree auto-delete (task 431, replacing the frontend-side #74/#199
/// check): remove the worktree at `dest` from `parent` only when no persisted item
/// references it, serialized so N windows' concurrent calls can't double-run the git
/// remove. The forced path (`remove_worktree`, forgetRepo) is untouched.
///
/// Async + off the main thread — the FS delete must never run on the webview thread
/// (the #200 `remove_worktree` pattern).
#[tauri::command]
pub async fn cleanup_worktree_if_empty(
    app: AppHandle,
    parent: String,
    dest: String,
) -> Result<WorktreeCleanup, SessionError> {
    tauri::async_runtime::spawn_blocking(move || cleanup_worktree_blocking(&app, &parent, &dest))
        .await
        .map_err(|e| SessionError::Io(e.to_string()))
}

/// The forwarder-side exit gate (task 431): returns `true` when the exit was
/// **consumed** (a clean #63 exit — Rust forgets the record and emits
/// `session://forgotten` instead of `session://exited`). Fail-open: any missing state
/// (teardown ordering) degrades to `false` — today's emit — and never panics the
/// forwarder thread. The forget task runs on a detached thread (the kill-escalation
/// precedent): the forwarder must never block on file IO or git.
pub fn handle_session_exit(
    app: &AppHandle,
    id: &str,
    code: Option<i32>,
    intentional: bool,
) -> bool {
    let Some(store) = app.try_state::<Store>() else {
        return false;
    };
    let record = store.session(id);
    let recurring_owned = store
        .recurrings()
        .iter()
        .any(|r| r.current_session_id.as_deref() == Some(id));
    let boot_window = app
        .try_state::<BootWindow>()
        .map(|b| b.0.load(std::sync::atomic::Ordering::SeqCst))
        .unwrap_or(false);
    match classify_exit(
        record.is_some(),
        recurring_owned,
        code,
        boot_window,
        intentional,
    ) {
        ExitAction::EmitExited => false,
        ExitAction::ForgetClean => {
            // `classify_exit` returns ForgetClean only when `record.is_some()`.
            let Some(record) = record else { return false };
            let app = app.clone();
            std::thread::spawn(move || forget_cleanly_exited(app, record));
            true
        }
    }
}

/// The Rust-owned #63 clean-exit forget (task 431), run at most once per exit (the
/// exit waiter emits exactly one `Exited` per PTY generation, #354, and the forwarder
/// consumes it once).
fn forget_cleanly_exited(app: AppHandle, record: PersistedSession) {
    // 1. Deliberate reuse of `kill_session_blocking` — exactly what the frontend's
    //    `forgetExitedSession → ipc.killSession` did: frees the (already-dead) PTY
    //    slot, runs the dev-container teardown, removes the persisted record, and
    //    broadcasts `sessions://changed` so every window's roster converges (428).
    //    Idempotent on a dead child (`kill_session` on a gone id is a no-op error).
    let _ = kill_session_blocking(&app, record.id.clone());
    // 2. Tell every window the exit was consumed — each drops local state
    //    (idempotent with the roster drop above); only `toast_window` toasts, so N
    //    windows show ONE "Agent exited".
    let target = toast_target(&app);
    let _ = app.emit(
        "session://forgotten",
        ForgottenPayload {
            id: record.id.clone(),
            toast_window: target.clone(),
        },
    );
    // 3. A worktree agent's clean exit also cleans its worktree (ref-counted; a dirty
    //    tree is kept + warned, #74). Ordered after the forgotten emit so every
    //    window's UI drops instantly while the git delete continues behind.
    if let Some(parent) = record.worktree_parent.as_deref() {
        if cleanup_worktree_blocking(&app, parent, &record.repo_path) == WorktreeCleanup::KeptDirty
        {
            let _ = app.emit(
                "worktree://kept",
                WorktreeKeptPayload {
                    dest: record.repo_path.clone(),
                    toast_window: target,
                },
            );
        }
    }
}

/// Set (or clear, when blank) a session's custom display name and persist (#57).
/// Broadcasts `sessions://changed` so every window converges — task 428.
#[tauri::command]
pub fn rename_session(
    app: AppHandle,
    store: State<'_, Store>,
    id: String,
    name: String,
) -> Result<(), SessionError> {
    let trimmed = name.trim();
    let name = if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    };
    store
        .rename_session(&id, name)
        .map_err(|e| SessionError::Io(e.to_string()))?;
    broadcast_sessions(&app, &store);
    Ok(())
}

/// Set a session's per-agent auto-continue opt-out (#297) and persist. `disabled ==
/// true` excludes that one Claude agent from the #296 auto-continue fire step without
/// touching the global setting or any other agent.
#[tauri::command]
pub fn set_session_auto_continue(
    store: State<'_, Store>,
    id: String,
    disabled: bool,
) -> Result<(), SessionError> {
    store
        .set_session_auto_continue(&id, disabled)
        .map_err(|e| SessionError::Io(e.to_string()))
}

/// Set a session's per-agent "watch" flag (#336) and persist. When `watch == true`
/// the frontend pops a native OS notification each time this agent finishes a turn /
/// needs input (its busy→idle edge).
#[tauri::command]
pub fn set_session_watch(
    store: State<'_, Store>,
    id: String,
    watch: bool,
) -> Result<(), SessionError> {
    store
        .set_session_watch(&id, watch)
        .map_err(|e| SessionError::Io(e.to_string()))
}

/// A session's retained scrollback plus its absolute end-offset, so the frontend's
/// terminal replay can dedupe against the live output stream (the fresh-spawn
/// double-paint / stray-glyph fix). Like live output (#261), the bytes travel as a
/// **base64 string** (#346): serde serializes a `Vec<u8>` as a JSON integer array,
/// which turned the 256 KB scrollback into ~1 MB+ of JSON the webview main thread
/// had to parse on EVERY terminal mount — an agent wall of N terminals paid N of
/// those at boot (costliest on Linux/WebKitGTK). base64 is ~⅓ the size and decodes
/// with the same tight `atob` loop as live output (`decodeOutputB64`).
#[derive(Clone, Serialize)]
pub struct ScrollbackReply {
    pub b64: String,
    pub end: u64,
}

/// Async + off the main thread (#353) — copying up to `SCROLLBACK_CAP` (256 KB) out of a
/// session's ring buffer and base64-encoding it is paid **once per terminal mount**, so an
/// agent wall of N terminals paid N of them on the webview thread at boot (worst on
/// Linux/WebKitGTK, cf. #346). Reordering is safe: the reply carries the absolute `end`
/// offset and `replayDedupe.ts` drops any live chunk already covered by it, so a snapshot
/// that lands later is still correct. State is reached through an owned `AppHandle` (a
/// borrowed `State` is not `'static` and could never be captured by the closure).
#[tauri::command]
pub async fn session_scrollback(
    app: AppHandle,
    id: String,
) -> Result<ScrollbackReply, SessionError> {
    tauri::async_runtime::spawn_blocking(move || session_scrollback_blocking(&app, id))
        .await
        .map_err(|e| SessionError::Io(e.to_string()))?
}

fn session_scrollback_blocking(
    app: &AppHandle,
    id: String,
) -> Result<ScrollbackReply, SessionError> {
    let manager = app.state::<SessionManager>();
    let (bytes, end) = manager.scrollback(&id)?;
    Ok(ScrollbackReply {
        b64: encode_output(&bytes),
        end,
    })
}

/// One live-terminal-output search hit (#337): a session id, the 1-based line number of
/// the match in its (ANSI-stripped) scrollback, and the clamped snippet.
#[derive(Clone, Serialize)]
pub struct SessionOutputMatch {
    pub id: String,
    pub line: u32,
    pub snippet: String,
}

/// Search every live session's retained scrollback for `query` (#337) — the global
/// search modal's terminal-output source. Best-effort: bounded per-session (a few lines
/// each) and in total (`limit`, default 50), ANSI-stripped server-side, and it never
/// fails (a blank query / no matches → an empty vec). The scrollback is only the
/// in-memory tail, so a match older than that window simply isn't surfaced.
///
/// Async + off the main thread (#353) — this is N × (a 256 KB scrollback copy + a UTF-8
/// decode + an ANSI strip + a scan), and it runs on **every keystroke** in the global
/// search modal; on the webview thread that made typing in it stutter. A join error
/// flattens to an empty vec — the same fail-open value a no-match search returns — so the
/// bare (non-`Result`) return type the frontend expects is preserved.
#[tauri::command]
pub async fn search_session_output(
    app: AppHandle,
    query: String,
    limit: Option<usize>,
) -> Vec<SessionOutputMatch> {
    tauri::async_runtime::spawn_blocking(move || search_session_output_blocking(&app, query, limit))
        .await
        .unwrap_or_default()
}

fn search_session_output_blocking(
    app: &AppHandle,
    query: String,
    limit: Option<usize>,
) -> Vec<SessionOutputMatch> {
    const PER_SESSION: usize = 5;
    let manager = app.state::<SessionManager>();
    let total = limit.unwrap_or(50).clamp(1, 500);
    manager
        .search_output(&query, PER_SESSION, total)
        .into_iter()
        .map(|(id, line, snippet)| SessionOutputMatch { id, line, snippet })
        .collect()
}

/// Every persisted session record (#30), read once at boot.
///
/// **Stays synchronous on purpose (#353)** — a pure in-memory `Vec` clone under a
/// `Mutex` (microseconds, no I/O). Moving it to the blocking pool would buy nothing and
/// only add a thread hop.
#[tauri::command]
pub fn list_sessions(store: State<'_, Store>) -> Vec<PersistedSession> {
    store.sessions()
}

#[tauri::command]
pub fn list_recents(store: State<'_, Store>) -> Vec<String> {
    store.recents()
}

/// Drop a folder from recents (the "Forget" action, #31) so it doesn't reappear.
/// Broadcasts `recents://changed` so every window converges — task 428.
#[tauri::command]
pub fn remove_recent(
    app: AppHandle,
    store: State<'_, Store>,
    path: String,
) -> Result<(), SessionError> {
    store
        .remove_recent(&path)
        .map_err(|e| SessionError::Io(e.to_string()))?;
    broadcast_recents(&app, &store);
    Ok(())
}

/// Add a folder to recents without spawning an agent (#172 sidebar background menu →
/// "New folder…"). Reuses `touch_recent` (deduped, capped, persisted) so the folder
/// shows as an empty repo group immediately and survives restart.
/// Broadcasts `recents://changed` so every window converges — task 428.
#[tauri::command]
pub fn add_recent(
    app: AppHandle,
    store: State<'_, Store>,
    path: String,
) -> Result<(), SessionError> {
    store
        .touch_recent(&path)
        .map_err(|e| SessionError::Io(e.to_string()))?;
    broadcast_recents(&app, &store);
    Ok(())
}

/// Clone the git repo at `url` into `<parent>/<repo-name>` (#295), ensure it has a
/// branch checked out — `git clone` already leaves HEAD on the remote's **default
/// branch** (`main`/`master`/…), so this only fabricates a `main` for a truly empty /
/// branch-less clone (#298) — register the folder in recents, and return the absolute
/// destination path — the frontend then starts a session there. The dest is built with
/// `PathBuf::join` (never string concat) and is refused if it already exists non-empty
/// (no overwrite — data safety). Clone errors (bad URL, auth required, network, existing
/// dest) surface as a typed `SessionError::Git` carrying git's stderr; the frontend now
/// surfaces them as an error **toast** (the modal closes immediately, #299) rather than
/// inline. `GIT_TERMINAL_PROMPT=0` makes an authed/private remote fail fast.
///
/// **Non-blocking (#299):** a plain `pub fn` Tauri command runs on the main (webview)
/// thread, so the whole network clone would **freeze the UI**. Marking it `async` moves
/// it onto the async runtime, and `spawn_blocking` runs the synchronous `git` shell-out
/// on a dedicated blocking pool so it can't starve that runtime's workers either — the
/// sidebar "phantom folder" + progress bar (#299) and the rest of the app stay
/// responsive while the clone runs. The git work needs no `Store`, so it moves cleanly
/// onto the blocking pool; `touch_recent` (a quick in-memory update + one file write)
/// runs after it resolves. Cross-platform (git via `hidden_command`; no raw `$HOME`).
#[tauri::command]
pub async fn clone_repo(
    app: AppHandle,
    store: State<'_, Store>,
    url: String,
    parent: String,
) -> Result<String, SessionError> {
    let url = url.trim().to_string();
    if url.is_empty() {
        return Err(SessionError::Git("a git URL is required".to_string()));
    }
    if parent.trim().is_empty() {
        return Err(SessionError::Git(
            "a destination folder is required".to_string(),
        ));
    }
    let dest_str = tauri::async_runtime::spawn_blocking(move || -> Result<String, SessionError> {
        let dir = git::repo_dir_name(&url);
        let dest = PathBuf::from(&parent).join(&dir);
        // Refuse to clone into an existing non-empty folder (no overwrite). An empty
        // pre-existing dir is fine — git will populate it — but git itself also refuses a
        // non-empty one; we check first for a clearer message.
        if dest.is_dir()
            && std::fs::read_dir(&dest)
                .map(|mut entries| entries.next().is_some())
                .unwrap_or(false)
        {
            return Err(SessionError::Git(format!(
                "Destination already exists: {}",
                dest.display()
            )));
        }
        git::clone_repo(&url, &dest).map_err(SessionError::Git)?;
        git::ensure_checked_out_branch(&dest).map_err(SessionError::Git)?;
        Ok(dest.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| SessionError::Io(e.to_string()))??;
    store
        .touch_recent(&dest_str)
        .map_err(|e| SessionError::Io(e.to_string()))?;
    // Cross-window sync (task 428): the cloned folder is a new recent.
    broadcast_recents(&app, &store);
    Ok(dest_str)
}

#[tauri::command]
pub fn list_repo_colors(store: State<'_, Store>) -> std::collections::HashMap<String, String> {
    store.repo_colors()
}

/// Assign a repo's color identity (#35). The color is validated as a hex string
/// so an untrusted IPC value can't store arbitrary content.
/// Broadcasts `repo_colors://changed` so every window converges — task 428.
#[tauri::command]
pub fn set_repo_color(
    app: AppHandle,
    store: State<'_, Store>,
    path: String,
    color: String,
) -> Result<(), SessionError> {
    if !is_hex_color(&color) {
        return Err(SessionError::Io(format!("invalid color `{color}`")));
    }
    store
        .set_repo_color(&path, &color)
        .map_err(|e| SessionError::Io(e.to_string()))?;
    broadcast_repo_colors(&app, &store);
    Ok(())
}

/// Immediate children of one directory (`subdir`, repo-relative; empty = repo root)
/// for the **lazy** file tree (#167) — folders first, then viewable files, no count
/// or depth cap (depth is reached by expanding one level at a time). Path-validated.
#[tauri::command]
pub fn list_dir(
    repo: String,
    subdir: String,
) -> Result<Vec<crate::files::DirEntryInfo>, SessionError> {
    crate::files::list_dir(&repo, &subdir).map_err(SessionError::Io)
}

/// Search a repo's viewable files for the file picker (#56) — substring match over
/// repo-relative paths, optionally restricted to an extension (e.g. `.md` for the
/// Kanban picker), result-capped so it scales to very large repos. Deterministic
/// across machines.
#[tauri::command]
pub fn search_files(
    repo: String,
    query: String,
    ext: Option<String>,
    limit: Option<usize>,
) -> Vec<String> {
    let limit = limit
        .unwrap_or(crate::files::SEARCH_RESULT_CAP)
        .clamp(1, crate::files::SEARCH_RESULT_CAP * 8);
    crate::files::search_files(&repo, &query, ext.as_deref(), limit)
}

/// Search a repo's viewable files **by content** for the in-tree search (#202) —
/// case-insensitive substring over file lines, returning `{ path, line, snippet }`
/// matches plus a `truncated` flag. Bounded server-side (size cap per file, per-file
/// match cap, total result cap) so it scales to large repos; deterministic order.
#[tauri::command]
pub fn search_file_contents(
    repo: String,
    query: String,
    limit: Option<usize>,
) -> crate::files::ContentSearchResult {
    let limit = limit
        .unwrap_or(crate::files::SEARCH_RESULT_CAP)
        .clamp(1, crate::files::SEARCH_RESULT_CAP * 8);
    crate::files::search_file_contents(&repo, &query, limit)
}

/// Read a repo-relative text file for the file viewer (#40/#44); the path is
/// validated to stay inside `repo` (rejects traversal).
#[tauri::command]
pub fn read_text_file(repo: String, file: String) -> Result<String, SessionError> {
    crate::files::read_text_file(&repo, &file).map_err(SessionError::Io)
}

/// Write a repo-relative text file (#141 — the app's first arbitrary file write,
/// backing the Kanban editor); the path is validated to stay inside `repo`
/// (rejects traversal / symlink escape / out-of-repo targets).
#[tauri::command]
pub fn write_text_file(repo: String, file: String, contents: String) -> Result<(), SessionError> {
    crate::files::write_text_file(&repo, &file, &contents).map_err(SessionError::Io)
}

/// Move an external OS file/directory (`source`) into the repo dir `dest_subdir`
/// (#253 — drag-from-OS-into-the-file-tree). The destination is confined to the repo;
/// the source is the user's dragged path (explicit consent, not confined). Returns the
/// new repo-relative path on success; a collision / out-of-repo destination / missing
/// source surfaces as a typed `SessionError::Io { message }` for an error toast.
#[tauri::command]
pub fn move_into_repo(
    repo: String,
    dest_subdir: String,
    source: String,
) -> Result<String, SessionError> {
    crate::files::move_into_repo(&repo, &dest_subdir, &source).map_err(SessionError::Io)
}

/// Reject a new file-tree folder name (#267) that isn't a single, safe path segment:
/// empty, `.`/`..`, or one containing a path separator are rejected on every OS; on
/// **Windows** a reserved device name (`CON`, `NUL`, …) or a trailing dot/space is
/// also rejected (reusing `windows_safe_seg`, which only diverges from identity
/// there — so a name whose recorded form would desync from what the OS actually
/// writes is refused). Refusing up front gives a clear error instead of an obscure
/// mid-create failure.
fn validate_new_segment(name: &str) -> Result<(), SessionError> {
    let trimmed = name.trim();
    if trimmed.is_empty()
        || trimmed == "."
        || trimmed == ".."
        || trimmed.contains('/')
        || trimmed.contains('\\')
    {
        return Err(SessionError::Io(format!(
            "`{name}` is not a valid folder name"
        )));
    }
    if windows_safe_seg(trimmed.to_string()) != trimmed {
        return Err(SessionError::Io(format!(
            "`{name}` is not a valid folder name on this system"
        )));
    }
    Ok(())
}

/// Create one new (empty) directory at repo-relative `path` (#267 — the third
/// deliberate file write). The new leaf's name is guarded
/// (`validate_new_segment` — no separators / `.`/`..` / Windows reserved device
/// names), then `files::create_dir` validates the parent is inside the repo and
/// refuses to clobber an existing item.
#[tauri::command]
pub fn create_dir(repo: String, path: String) -> Result<(), SessionError> {
    let trimmed = path.trim().trim_end_matches(['/', '\\']);
    let name = trimmed.rsplit(['/', '\\']).next().unwrap_or("");
    validate_new_segment(name)?;
    crate::files::create_dir(&repo, trimmed).map_err(SessionError::Io)
}

/// Delete the repo-relative file or directory at `path` (#267 — the fourth, and
/// genuinely destructive, file write; a directory is removed recursively). The path
/// is validated to stay strictly inside the repo, refuses the repo root, and never
/// follows a symlink (see `files::delete_path`).
#[tauri::command]
pub fn delete_path(repo: String, path: String) -> Result<(), SessionError> {
    crate::files::delete_path(&repo, &path).map_err(SessionError::Io)
}

/// Rename (or move within the repo) the repo-relative file/directory `from` to `to`
/// (#291 — the fifth deliberate file write, backing the file-tree folder/file
/// **Rename**). The destination's new leaf name is guarded (`validate_new_segment` —
/// no separators / `.`/`..` / Windows reserved device names), then
/// `files::rename_path` confines both endpoints to the repo (source inside + not the
/// root; destination's parent inside) and refuses to clobber an existing item. Returns
/// the destination repo-relative POSIX path for the in-place tree refresh.
#[tauri::command]
pub fn rename_path(repo: String, from: String, to: String) -> Result<String, SessionError> {
    let trimmed = to.trim().trim_end_matches(['/', '\\']);
    let name = trimmed.rsplit(['/', '\\']).next().unwrap_or("");
    validate_new_segment(name)?;
    crate::files::rename_path(&repo, &from, trimmed).map_err(SessionError::Io)
}

/// Append the repo-relative file/folder `path` to the repo-root `.gitignore` (#312 —
/// the **sixth** deliberate file write, backing the file-tree context menu's **Add to
/// .gitignore**). `files::add_to_gitignore` confines the item to the repo, anchors the
/// pattern (`/path` for a file, `/path/` for a directory), creates `.gitignore` if
/// absent, and skips a line already present. Returns `true` when a line was appended,
/// `false` when it was already ignored (no write).
#[tauri::command]
pub fn add_to_gitignore(repo: String, path: String) -> Result<bool, SessionError> {
    crate::files::add_to_gitignore(&repo, &path).map_err(SessionError::Io)
}

/// Best-effort slash-invokable skills/commands for a folder (#114) — the
/// scheduled-prompt autocomplete. Reads project `<cwd>/.claude` + user `~/.claude`
/// (project shadows user); a missing/unreadable dir simply yields fewer entries.
#[tauri::command]
pub fn list_skills(cwd: String) -> Vec<crate::skills::SkillInfo> {
    crate::skills::list_skills(cwd)
}

/// Whether a repo-relative `file` exists inside `repo` (#118) — resolves a Canvas
/// template's `open-file` block; path-validated (rejects traversal).
#[tauri::command]
pub fn file_exists(repo: String, file: String) -> bool {
    crate::files::file_exists(&repo, &file)
}

/// Whether `path` names an existing directory — used at startup to detect sidebar
/// folders deleted off-disk (absolute-path oriented, unlike repo-relative `file_exists`).
#[tauri::command]
pub fn dir_exists(path: String) -> bool {
    crate::files::dir_exists(&path)
}

/// Whether `cwd` is a git work tree (#118) — gates a template's `open-diff` block.
#[tauri::command]
pub fn is_git_repo(cwd: String) -> bool {
    crate::git::is_git_repo(cwd)
}

#[tauri::command]
pub fn list_overview_panels(
    store: State<'_, Store>,
) -> std::collections::HashMap<String, Vec<OverviewPanel>> {
    store.overview_panels()
}

/// Replace a repo's Overview panel layout (#38) and persist.
/// Broadcasts `overview_panels://changed` so every window converges — task 428.
#[tauri::command]
pub fn set_overview_panels(
    app: AppHandle,
    store: State<'_, Store>,
    path: String,
    panels: Vec<OverviewPanel>,
) -> Result<(), SessionError> {
    store
        .set_overview_panels(&path, panels)
        .map_err(|e| SessionError::Io(e.to_string()))?;
    broadcast_overview_panels(&app, &store);
    Ok(())
}

#[tauri::command]
pub fn list_overview_order(
    store: State<'_, Store>,
) -> std::collections::HashMap<String, Vec<String>> {
    store.overview_order()
}

/// Replace a repo's Overview drag-reorder order (#43) and persist.
/// Broadcasts `overview_order://changed` so every window converges — task 428.
#[tauri::command]
pub fn set_overview_order(
    app: AppHandle,
    store: State<'_, Store>,
    path: String,
    order: Vec<String>,
) -> Result<(), SessionError> {
    store
        .set_overview_order(&path, order)
        .map_err(|e| SessionError::Io(e.to_string()))?;
    broadcast_overview_order(&app, &store);
    Ok(())
}

#[tauri::command]
pub fn list_open_files(store: State<'_, Store>) -> std::collections::HashMap<String, Vec<String>> {
    store.open_files()
}

/// Replace a repo's opened-file list (#45) and persist.
#[tauri::command]
pub fn set_open_files(
    store: State<'_, Store>,
    path: String,
    files: Vec<String>,
) -> Result<(), SessionError> {
    store
        .set_open_files(&path, files)
        .map_err(|e| SessionError::Io(e.to_string()))
}

#[tauri::command]
pub fn get_canvas_layout(store: State<'_, Store>) -> serde_json::Value {
    store.canvas_layout()
}

/// Replace the Canvas layout tree (#46) and persist.
#[tauri::command]
pub fn set_canvas_layout(
    store: State<'_, Store>,
    layout: serde_json::Value,
) -> Result<(), SessionError> {
    store
        .set_canvas_layout(layout)
        .map_err(|e| SessionError::Io(e.to_string()))
}

#[tauri::command]
pub fn get_canvases(store: State<'_, Store>) -> serde_json::Value {
    store.canvases()
}

/// Merge a canvases patch (#58) over the persisted blob under the Store mutex
/// (task 429), then broadcast `canvas://changed` with the **merged** blob so every
/// window (main + detached canvas windows, #84) stays in sync. The `state` payload
/// is field-wise: `canvases` (the whole tab array) and/or `activeId` (the boot
/// hint) — each replaces the stored value only when present, so a tab switch in one
/// window and a layout edit in another can no longer clobber each other. The merge
/// is correct for ANY window — the old main-vs-detached label branch is gone: each
/// window keeps its own active tab locally (`applyCanvasSync`), the persisted
/// `activeId` is only a boot hint written by the sites that actually change the
/// active tab, and a detached window's layout edits are canvases-only patches.
#[tauri::command]
pub fn set_canvases(
    app: AppHandle,
    store: State<'_, Store>,
    state: serde_json::Value,
) -> Result<(), SessionError> {
    let merged = store
        .merge_canvases(state)
        .map_err(|e| SessionError::Io(e.to_string()))?;
    let _ = app.emit("canvas://changed", merged);
    Ok(())
}

/// Saved Canvas templates (#117) — opaque JSON; `null` until first written.
#[tauri::command]
pub fn get_canvas_templates(store: State<'_, Store>) -> serde_json::Value {
    store.canvas_templates()
}

/// Replace the saved Canvas templates and persist (#117). Kept separate from the
/// `canvases` blob so a canvas write never clobbers templates.
/// Broadcasts `canvas_templates://changed` so every window converges — task 428.
#[tauri::command]
pub fn set_canvas_templates(
    app: AppHandle,
    store: State<'_, Store>,
    templates: serde_json::Value,
) -> Result<(), SessionError> {
    store
        .set_canvas_templates(templates)
        .map_err(|e| SessionError::Io(e.to_string()))?;
    broadcast_canvas_templates(&app, &store);
    Ok(())
}

/// Pre-paint window background per theme (#348) — the OS paints this native color while
/// the WebView boots. MUST equal `--bg-base` in `src/styles/tokens.css` (and `THEME_BG` in
/// `src/theme.ts` / the inline `<style>` in `index.html` / `"backgroundColor"` in
/// `src-tauri/tauri.conf.json`): Catppuccin Mocha Crust for dark, Latte Crust for light
/// (UI v2 task 372 — the stage is crust). Pure — an unknown/absent theme means the dark
/// default. Platform-neutral: the same color is applied on macOS, Windows and Linux.
pub fn background_for_theme(theme: Option<&str>) -> Color {
    match theme {
        Some("light") => Color(0xdc, 0xe0, 0xe8, 0xff),
        _ => Color(0x11, 0x11, 0x1b, 0xff),
    }
}

/// The persisted theme's background color (#348). The settings blob is opaque JSON owned
/// by the frontend (#100); we read only `theme`, best-effort.
pub fn window_background(store: &Store) -> Color {
    let settings = store.settings();
    background_for_theme(settings.get("theme").and_then(|v| v.as_str()))
}

/// How long Rust waits before showing a window the frontend never revealed (#348).
const REVEAL_FALLBACK_MS: u64 = 2000;

/// Show + focus the calling window (#348). Windows are created hidden (`visible: false`)
/// with a themed native background so the OS never paints a white rectangle; the frontend
/// calls this from `useRevealWindow` once React has committed its first frame. Idempotent.
#[tauri::command]
pub fn reveal_window(window: Window) {
    let _ = window.show();
    let _ = window.set_focus();
}

/// Safety net for the hidden-until-painted startup (#348): if the frontend never calls
/// `reveal_window` (a crashed bundle, a dead dev server), show the window anyway after a
/// short delay so the app can never end up running-but-invisible. A window that is already
/// visible is left alone.
pub fn schedule_reveal_fallback(app: &AppHandle, label: &str) {
    let app = app.clone();
    let label = label.to_string();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(REVEAL_FALLBACK_MS));
        if let Some(window) = app.get_webview_window(&label) {
            if !matches!(window.is_visible(), Ok(true)) {
                let _ = window.show();
            }
        }
    });
}

/// Re-apply the themed native background to every open window after a runtime theme switch
/// (#348), so a resize/repaint gap never exposes the previous theme's color. Best-effort.
#[tauri::command]
pub fn set_theme_background(app: AppHandle, theme: String) {
    let color = background_for_theme(Some(theme.as_str()));
    for window in app.webview_windows().into_values() {
        let _ = window.set_background_color(Some(color));
    }
}

/// Init presets for a full app window (task 434): passed as URL params so the new
/// window's OWN store presets its local state at boot — `repo` filters its Overview
/// to that repo; `canvas` boots it into the Canvas view on that tab (when the tab
/// exists). Local UI only: nothing is persisted, no other window is touched. Grows
/// in card 13/16 (window restore).
#[derive(Debug, Default, serde::Deserialize)]
pub struct AppWindowInit {
    pub repo: Option<String>,
    pub canvas: Option<String>,
}

/// Percent-encode a query VALUE so the frontend's `URLSearchParams` decodes it
/// byte-exact: every byte outside the RFC 3986 unreserved set `[A-Za-z0-9-_.~]` is
/// `%XX`-encoded — in particular space → `%20` (never `+`, which `URLSearchParams`
/// would decode to a space) and `+` → `%2B`. Windows paths (`C:\Users\a b`) and
/// unix paths with spaces round-trip exactly. Multi-byte UTF-8 encodes per byte.
/// Pure.
fn encode_query_value(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char);
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

/// The app-window route (task 434): `index.html?win=<id>[&repo=..][&canvas=..]`.
/// The frontend's `parseWindowIdentity` reads `win` as the window identity and
/// `repo`/`canvas` as its init presets (`?win=` beats `?canvas=`, so the canvas
/// param here is a preset, never the legacy #84 compat route). Pure.
pub fn app_window_url(id: &str, init: &AppWindowInit) -> String {
    let mut url = format!("index.html?win={}", encode_query_value(id));
    if let Some(repo) = init.repo.as_deref() {
        url.push_str("&repo=");
        url.push_str(&encode_query_value(repo));
    }
    if let Some(canvas) = init.canvas.as_deref() {
        url.push_str("&canvas=");
        url.push_str(&encode_query_value(canvas));
    }
    url
}

/// Open an additional FULL app window (task 434) — label `app-<uuid>`, rendering
/// the complete shell (sidebar + Overview/Attention/Canvas + modals) with its own
/// window-local view/selection/tab/filter state. Hidden until painted (#348) with
/// the themed background + the 2 s reveal fallback; registered for primary
/// election (task 433 — an `app-*` label is eligible). Returns the new window's
/// id (the card-10/16+ entry points focus/open by it). Since task 437 this is
/// also the Canvas pop-out target (`init.canvas`); canvas-only windows no longer
/// exist.
///
/// Deliberately NO per-window `on_window_event` handler and no new broadcast: the
/// global `Destroyed` arm in `lib.rs` already covers an app window's close (task
/// 426's terminal-view purge + task 433's primary re-election), and no PTY is
/// killed on close (sessions keep running, mirrored in surviving windows).
#[tauri::command]
pub fn open_app_window(app: AppHandle, init: AppWindowInit) -> Result<String, SessionError> {
    let id = uuid::Uuid::new_v4().to_string();
    let label = format!("app-{id}");
    let url = app_window_url(&id, &init);
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title("ReCue")
        // The tauri.conf.json main-window geometry — an app window IS a full shell.
        .inner_size(1280.0, 832.0)
        .min_inner_size(880.0, 600.0)
        // Hidden until the frontend paints its first themed frame (#348) — the native
        // background is the current theme's --bg-base, so it never flashes white.
        .visible(false)
        .background_color(window_background(&app.state::<Store>()))
        .build()
        .map_err(|e| SessionError::Io(e.to_string()))?;
    // Never leave the window invisible if its frontend fails to boot (#348).
    schedule_reveal_fallback(&app, &label);
    // Task 433: every window-creation site routes through registration. An app
    // window is primary-eligible — if the original primary later closes, the
    // oldest surviving full window (possibly this one) takes over live.
    crate::primary::register_window(&app, &label);
    Ok(id)
}

/// Focus an existing full app window (task 434) by id.
/// Returns false if no such window exists.
#[tauri::command]
pub fn focus_app_window(app: AppHandle, id: String) -> bool {
    match app.get_webview_window(&format!("app-{id}")) {
        Some(window) => {
            let _ = window.show(); // it may still be hidden pre-reveal (#348)
            window.set_focus().is_ok()
        }
        None => false,
    }
}

/// Broadcast the full pending-schedule list (#280) so **every** window — any of
/// them can hold a scheduled panel without owning schedule mutations — stays in
/// sync after any create / update / cancel / fire. Mirrors `canvas://changed`.
/// Tauri events are global, so this is identical on macOS and Windows (no
/// OS-specific path/shell/key code).
fn broadcast_schedules(app: &AppHandle, store: &Store) {
    let _ = app.emit("schedule://changed", store.schedules());
}

// --- Cross-window state sync (task 428) ---
//
// Multi-window, task 428: Rust owns the persisted slices; every window subscribes.
// Each helper mirrors `broadcast_schedules` — it emits the slice's **full new value**
// (exactly what the slice's getter command returns, so the frontend reuses its
// existing types) and is called only AFTER a successful persist, never on an `Err`.
// The frontend applies (`apply*Sync` in `src/store.ts`) are JSON-equality-guarded and
// never re-persist, so the sender's own echo is a no-op and no loop can form. Tauri
// events are global to all windows on macOS, Windows, and Linux alike — no `#[cfg]`
// arm is involved.

/// Broadcast the settings blob (`settings://changed`) — see the task 428 block note.
fn broadcast_settings(app: &AppHandle, store: &Store) {
    let _ = app.emit("settings://changed", store.settings());
}

/// Broadcast the recents list (`recents://changed`) — see the task 428 block note.
fn broadcast_recents(app: &AppHandle, store: &Store) {
    let _ = app.emit("recents://changed", store.recents());
}

/// Broadcast the diff-seen markers (`diff_seen://changed`) — see the task 428 block note.
fn broadcast_diff_seen(app: &AppHandle, store: &Store) {
    let _ = app.emit("diff_seen://changed", store.diff_seen());
}

/// Broadcast the sidebar folder order (`repo_order://changed`) — see the task 428
/// block note.
fn broadcast_repo_order(app: &AppHandle, store: &Store) {
    let _ = app.emit("repo_order://changed", store.repo_order());
}

/// Broadcast the full repo-color map (`repo_colors://changed`) — see the task 428
/// block note.
fn broadcast_repo_colors(app: &AppHandle, store: &Store) {
    let _ = app.emit("repo_colors://changed", store.repo_colors());
}

/// Broadcast the full Overview panel map (`overview_panels://changed`) — see the
/// task 428 block note.
fn broadcast_overview_panels(app: &AppHandle, store: &Store) {
    let _ = app.emit("overview_panels://changed", store.overview_panels());
}

/// Broadcast the full Overview order map (`overview_order://changed`) — see the
/// task 428 block note.
fn broadcast_overview_order(app: &AppHandle, store: &Store) {
    let _ = app.emit("overview_order://changed", store.overview_order());
}

/// Broadcast the sidebar width (`sidebar_width://changed`; `Option<u32>` serializes
/// as `number | null`) — see the task 428 block note.
fn broadcast_sidebar_width(app: &AppHandle, store: &Store) {
    let _ = app.emit("sidebar_width://changed", store.sidebar_width());
}

/// Broadcast the sidebar collapsed flag (`sidebar_collapsed://changed`; `Option<bool>`
/// serializes as `boolean | null`) — see the task 428 block note.
fn broadcast_sidebar_collapsed(app: &AppHandle, store: &Store) {
    let _ = app.emit("sidebar_collapsed://changed", store.sidebar_collapsed());
}

/// Broadcast the saved Canvas templates (`canvas_templates://changed`) — see the
/// task 428 block note.
fn broadcast_canvas_templates(app: &AppHandle, store: &Store) {
    let _ = app.emit("canvas_templates://changed", store.canvas_templates());
}

/// Broadcast the full persisted session roster (`sessions://changed`) after an
/// add / remove / rename — see the task 428 block note. The schedule/recurring
/// **fire** paths deliberately do NOT call this: their dedicated `schedule://fired`
/// / `recurring://fired` events already carry the new record, and a roster emit
/// there would race the recurring `current_session_id` rotation (#300
/// unowned-child flash) — see the in-place notes at those sites.
pub(crate) fn broadcast_sessions(app: &AppHandle, store: &Store) {
    let _ = app.emit("sessions://changed", store.sessions());
}

/// Create a scheduled session (#93): persist a record that the poll loop fires at
/// `at` (unix secs). `branch` (a non-current branch to check out), `name`, and
/// `prompt` are optional; the backend owns the id + `created_at`.
///
/// Async + off the main thread (#353) — a **worktree** schedule runs `git worktree add`
/// **eagerly, at schedule time** (#259), i.e. a whole-tree checkout while the New Session
/// modal is open. `broadcast_schedules`' `app.emit` is thread-safe (`lib.rs` already emits
/// from its poll thread), so the body runs unchanged, just on the blocking pool.
#[tauri::command]
#[allow(clippy::too_many_arguments)] // a flat Tauri command surface (cwd + branch/new-branch + name/prompt/at/agent)
pub async fn create_schedule(
    app: AppHandle,
    cwd: String,
    branch: Option<String>,
    name: Option<String>,
    prompt: Option<String>,
    at: u64,
    agent: Option<String>,
    create_branch: Option<bool>,
    base: Option<String>,
    worktree: Option<bool>,
) -> Result<ScheduledSession, SessionError> {
    tauri::async_runtime::spawn_blocking(move || {
        create_schedule_blocking(
            &app,
            cwd,
            branch,
            name,
            prompt,
            at,
            agent,
            create_branch,
            base,
            worktree,
        )
    })
    .await
    .map_err(|e| SessionError::Io(e.to_string()))?
}

#[allow(clippy::too_many_arguments)] // mirrors the flat command surface above
fn create_schedule_blocking(
    app: &AppHandle,
    cwd: String,
    branch: Option<String>,
    name: Option<String>,
    prompt: Option<String>,
    at: u64,
    agent: Option<String>,
    create_branch: Option<bool>,
    base: Option<String>,
    worktree: Option<bool>,
) -> Result<ScheduledSession, SessionError> {
    let store = app.state::<Store>();
    // New-branch intent (#125): when create_branch is set, `branch` is the new branch
    // name (created at fire time) and `base` its base (empty/None = HEAD).
    let create_branch = create_branch.unwrap_or(false);
    let worktree = worktree.unwrap_or(false);
    let branch = branch.filter(|b| !b.is_empty());
    // Worktree schedule (#218): compute + persist the deterministic worktree folder
    // now (it depends only on the data dir + parent repo + branch, all known here, incl.
    // for a create_branch new branch). The sidebar then nests the pending schedule under
    // the same sub-group key the live session uses after firing, and fire time reuses
    // the byte-identical path. `None` (no branch / not a worktree) keeps the old behavior.
    let worktree_path = if worktree {
        branch
            .as_deref()
            .and_then(|b| worktree_path(&store, &cwd, b).ok())
            .map(|p| p.to_string_lossy().to_string())
    } else {
        None
    };
    // Worktree schedule (#259): create the worktree folder + (for a create_branch
    // schedule) its branch **eagerly, at schedule time** — not lazily at fire time —
    // so the user can open/create items inside the worktree before it fires. Once the
    // folder and branch exist, every "create item in this worktree" path (new agent,
    // terminal, file/diff/kanban viewer, nested schedule) just works with no
    // special-casing (the previous create-at-fire-time design surfaced "branch doesn't
    // exist" when the user tried to add such an item first). A creation failure is
    // returned to the caller so the New-Session modal surfaces it inline and the
    // schedule is **not** persisted; fire time reuses this folder (idempotent — see
    // `prepare_worktree_for_schedule`). Cancel removes it (ref-counted, frontend-side).
    if worktree {
        if let (Some(branch), Some(dest)) = (branch.as_deref(), worktree_path.as_deref()) {
            let dest = Path::new(dest);
            // `git worktree add` fails if the folder already exists; reuse it when it
            // does (e.g. a second worktree schedule on the same existing branch), like
            // `spawn_worktree_agent`.
            if !dest.is_dir() {
                if create_branch {
                    git::worktree_add_new_branch(&cwd, branch, base.as_deref().unwrap_or(""), dest)
                        .map_err(SessionError::Git)?;
                } else {
                    git::worktree_add(&cwd, branch, dest).map_err(SessionError::Git)?;
                }
            }
        }
    }
    let sched = ScheduledSession {
        id: Uuid::new_v4().to_string(),
        cwd,
        branch,
        create_branch,
        branch_base: if create_branch {
            base.filter(|b| !b.is_empty())
        } else {
            None
        },
        // Launch into an isolated worktree (#198): created at fire time on `branch`
        // (existing or, with create_branch, new).
        worktree,
        worktree_path,
        name: name.filter(|n| !n.trim().is_empty()),
        prompt: prompt.filter(|p| !p.trim().is_empty()),
        fire_at: at,
        created_at: now_secs(),
        agent: agent.unwrap_or_else(|| crate::agents::DEFAULT_AGENT_ID.to_string()),
    };
    store
        .add_schedule(sched.clone())
        .map_err(|e| SessionError::Io(e.to_string()))?;
    // Keep every window's pending-schedule list in sync (#280).
    broadcast_schedules(app, &store);
    Ok(sched)
}

/// All pending scheduled sessions (#93).
#[tauri::command]
pub fn list_schedules(store: State<'_, Store>) -> Vec<ScheduledSession> {
    store.schedules()
}

/// Cancel a pending scheduled session (#93).
#[tauri::command]
pub fn cancel_schedule(
    app: AppHandle,
    store: State<'_, Store>,
    id: String,
) -> Result<(), SessionError> {
    store
        .remove_schedule(&id)
        .map_err(|e| SessionError::Io(e.to_string()))?;
    // Keep every window's pending-schedule list in sync (#280).
    broadcast_schedules(&app, &store);
    Ok(())
}

/// Update a schedule's prompt / name / fire time (#93) — the full surface #94's
/// panel edits (so #94 needs no Rust changes).
#[tauri::command]
pub fn update_schedule(
    app: AppHandle,
    store: State<'_, Store>,
    id: String,
    prompt: Option<String>,
    name: Option<String>,
    at: u64,
) -> Result<(), SessionError> {
    store
        .update_schedule(
            &id,
            prompt.filter(|p| !p.trim().is_empty()),
            name.filter(|n| !n.trim().is_empty()),
            at,
        )
        .map_err(|e| SessionError::Io(e.to_string()))?;
    // Keep every window's pending-schedule list in sync (#280) — esp. a detached
    // canvas window, where a live edit to a pending schedule must reach its panel.
    broadcast_schedules(&app, &store);
    Ok(())
}

/// Fire any due schedules (#93): for each, optionally check out its branch, spawn
/// `claude` (pre-seeded with the prompt), persist the new live session + recent,
/// and emit `schedule://fired` so the frontend moves it scheduled→live. A failed
/// spawn drops the schedule (no infinite retry) and emits `schedule://error`.
/// Called by the `lib.rs` poll loop; boot catch-up happens on the first tick.
pub fn fire_due_schedules(app: &AppHandle) {
    let store = app.state::<Store>();
    let due = store.take_due_schedules(now_secs());
    if due.is_empty() {
        return;
    }
    let manager = app.state::<SessionManager>();
    for sched in due {
        // The poll loop **drops** a schedule whose spawn failed (no infinite retry),
        // surfacing it as `schedule://error`. "Start now" (#269) keeps it instead.
        if let Err(message) = fire_one_schedule(&store, &manager, app, &sched) {
            let _ = app.emit(
                "schedule://error",
                ScheduleErrorPayload {
                    id: sched.id,
                    message,
                },
            );
        }
    }
    // The due schedules were taken atomically up front, so the pending list shrank
    // regardless of per-schedule outcome — sync every window (#280).
    broadcast_schedules(app, &store);
}

/// Fire a **single** schedule immediately (#269) — the "Start now" button. Takes the
/// schedule out of the store by id (atomic, like `take_due_schedules` but for one id,
/// so the poll loop can't also fire it), then runs the shared firing path. On success
/// the schedule is gone and `schedule://fired` moves it to a live agent — byte-identical
/// to a natural fire (same seeded prompt, folder/worktree, persisted record). On failure
/// the schedule is **re-added** (kept intact so the user can retry) and the error is
/// returned for the UI to toast. An unknown / already-fired id is a no-op success (the
/// frontend already removed it, or the poll loop just fired it).
///
/// Async + off the main thread (#353) — "Start now" prepares the worktree / checks out or
/// creates the branch **and** spawns the seeded PTY, all on a button click. The body is
/// unchanged (it already reached its state through the `AppHandle`); only the thread it
/// runs on differs — and the poll loop already runs the identical path off-thread.
#[tauri::command]
pub async fn fire_schedule_now(app: AppHandle, id: String) -> Result<(), SessionError> {
    tauri::async_runtime::spawn_blocking(move || fire_schedule_now_blocking(&app, id))
        .await
        .map_err(|e| SessionError::Io(e.to_string()))?
}

fn fire_schedule_now_blocking(app: &AppHandle, id: String) -> Result<(), SessionError> {
    let store = app.state::<Store>();
    let Some(sched) = store.take_schedule(&id) else {
        return Ok(());
    };
    let manager = app.state::<SessionManager>();
    if let Err(message) = fire_one_schedule(&store, &manager, app, &sched) {
        // Keep the schedule intact so the user can fix the cause and try again.
        let _ = store.add_schedule(sched);
        // Re-add restores the pending list — sync every window (#280).
        broadcast_schedules(app, &store);
        return Err(SessionError::Spawn(message));
    }
    // Fired & removed (`take_schedule`) — sync every window (#280).
    broadcast_schedules(app, &store);
    Ok(())
}

/// Fire one schedule (#93/#269): prepare its worktree (or check out / create its
/// in-folder branch), spawn the seeded agent, persist the new live session + recent,
/// and emit `schedule://fired` so the frontend moves it scheduled→live. Returns the
/// error message on failure — the **caller** decides whether to drop the schedule
/// (the poll loop → `schedule://error`) or keep it (`fire_schedule_now`); this helper
/// never emits `schedule://error` itself. Shared by the poll loop and "Start now".
fn fire_one_schedule(
    store: &Store,
    manager: &SessionManager,
    app: &AppHandle,
    sched: &ScheduledSession,
) -> Result<(), String> {
    // Worktree schedule (#198/#259): reuse the isolated worktree created eagerly at
    // schedule time (`prepare_worktree_for_schedule` is idempotent — it only creates
    // when the folder is missing, e.g. a pre-#259 record), and spawn the seeded agent
    // there (`worktree_parent = repo`, so it nests like any worktree agent #74). A
    // worktree-prep failure aborts — there's no folder to fall back into. The in-folder
    // path (#93/#125) keeps its best-effort branch checkout/create and spawns in `cwd`.
    let (spawn_cwd, worktree_parent) = if sched.worktree {
        let dest = prepare_worktree_for_schedule(store, sched)?;
        (dest, Some(sched.cwd.clone()))
    } else {
        if let Some(branch) = &sched.branch {
            // Best-effort; a failure still spawns in the folder. New-branch schedules
            // (#125) create + check out the branch at fire time (reusing #124's write);
            // existing-branch schedules check out as before (#93).
            let _ = if sched.create_branch {
                git::create_branch(
                    &sched.cwd,
                    branch,
                    sched.branch_base.as_deref().unwrap_or(""),
                )
            } else {
                git::checkout_branch(&sched.cwd, branch)
            };
        }
        (sched.cwd.clone(), None)
    };
    let custom = custom_command_for(store, &sched.agent);
    let info = manager
        .spawn_session_with_prompt(
            &spawn_cwd,
            sched.name.clone(),
            sched.prompt.as_deref(),
            &sched.agent,
            custom.as_deref(),
            // Schedules don't carry a dev-container flag (v1 scope) — host PTY.
            None,
        )
        .map_err(|e| e.to_string())?;
    let record = PersistedSession {
        id: info.id.clone(),
        claude_session_id: info.id,
        repo_path: spawn_cwd,
        name: sched.name.clone(),
        created_at: now_secs(),
        worktree_parent,
        auto_name: None,
        has_been_active: false,
        agent: sched.agent.clone(),
        forked_from: None,
        // Prompt-seeded, but its log materializes only once it runs (#138).
        forkable: false,
        // Per-agent auto-continue opt-out (#297) — inherit the global behavior.
        auto_continue_disabled: false,
        // Per-agent watch (#336) — off (opt-in); the global switch can force it on.
        watch: false,
        container_image: None,
    };
    let _ = store.add_session(record.clone());
    // Touch the repo (not the worktree folder) as the recent.
    let _ = store.touch_recent(&sched.cwd);
    // Cross-window sync (task 428): recents only. Deliberately NO `broadcast_sessions`
    // here — `schedule://fired` below already carries the new record to every window,
    // and a roster emit would race the recurring `current_session_id` rotation
    // (#300 unowned-child flash) on the sibling fire path.
    broadcast_recents(app, store);
    let _ = app.emit(
        "schedule://fired",
        ScheduleFiredPayload {
            id: sched.id.clone(),
            session: record,
        },
    );
    Ok(())
}

/// Create (or reuse) the isolated worktree for a worktree schedule (#198) at fire time
/// and return its folder path. With `create_branch`, `git worktree add -b <branch>`
/// for the new branch; otherwise `git worktree add <branch>` (reusing the folder if it
/// already exists, like `spawn_worktree_agent`). A missing branch or git failure is
/// returned as an error string for the caller to surface (`schedule://error`).
fn prepare_worktree_for_schedule(
    store: &Store,
    sched: &ScheduledSession,
) -> Result<String, String> {
    let branch = sched
        .branch
        .as_deref()
        .filter(|b| !b.is_empty())
        .ok_or_else(|| "worktree schedule has no branch".to_string())?;
    // Prefer the path persisted at create time (#218) so the fired live session's
    // `repo_path` is byte-identical to the schedule's sidebar sub-group key; fall back
    // to recomputing for records created before #218 (no stored path).
    let dest = match sched.worktree_path.as_deref() {
        Some(p) => PathBuf::from(p),
        None => worktree_path(store, &sched.cwd, branch).map_err(|e| e.to_string())?,
    };
    // Idempotent (#259): the worktree (and its branch, for a create_branch schedule)
    // is now created **eagerly at schedule time** (`create_schedule`), so by fire time
    // `dest` already exists — skip creation and just spawn the agent into it. Only a
    // pre-#259 schedule (or one whose eager creation was somehow skipped) still creates
    // here. The `!dest.is_dir()` guard now wraps **both** arms (the existing-branch arm
    // already had it; the create_branch arm would otherwise fail re-creating an
    // existing branch/folder).
    if !dest.is_dir() {
        if sched.create_branch {
            git::worktree_add_new_branch(
                &sched.cwd,
                branch,
                sched.branch_base.as_deref().unwrap_or(""),
                &dest,
            )?;
        } else {
            git::worktree_add(&sched.cwd, branch, &dest)?;
        }
    }
    Ok(dest.to_string_lossy().to_string())
}

// --- Recurring sessions (#294) ---

/// Broadcast the full recurring-session list (#294) so every window — incl. a detached
/// canvas window (#84) holding a recurring panel — stays in sync after any create /
/// update / cancel / fire. Mirrors `broadcast_schedules`; Tauri events are global, so
/// identical on macOS and Windows.
fn broadcast_recurrings(app: &AppHandle, store: &Store) {
    let _ = app.emit("recurring://changed", store.recurrings());
}

/// Create a recurring session (#294): a persistent repeating agent. Mirrors
/// `create_schedule` — for a worktree recurring the worktree folder + (for a new
/// branch) its branch are created **eagerly** now so items can be opened inside it
/// before the first fire (idempotent at fire time). `first_fire_at` seeds
/// `next_fire_at` (immediate = now); `interval_secs` is the repeat cadence.
///
/// Async + off the main thread (#353) — like `create_schedule` this can run an eager
/// `git worktree add`, and (#300) an immediate `first_fire_at` even spawns its first child
/// PTY inline. The whole body still runs **sequentially** on one blocking thread, so the
/// #300 ordering (immediate fire → broadcast → return the post-fire record) is preserved
/// exactly.
#[tauri::command]
#[allow(clippy::too_many_arguments)] // flat Tauri command surface, like create_schedule
pub async fn create_recurring(
    app: AppHandle,
    cwd: String,
    branch: Option<String>,
    name: Option<String>,
    prompt: Option<String>,
    interval_secs: u64,
    first_fire_at: u64,
    agent: Option<String>,
    create_branch: Option<bool>,
    base: Option<String>,
    worktree: Option<bool>,
) -> Result<RecurringSession, SessionError> {
    tauri::async_runtime::spawn_blocking(move || {
        create_recurring_blocking(
            &app,
            cwd,
            branch,
            name,
            prompt,
            interval_secs,
            first_fire_at,
            agent,
            create_branch,
            base,
            worktree,
        )
    })
    .await
    .map_err(|e| SessionError::Io(e.to_string()))?
}

#[allow(clippy::too_many_arguments)] // mirrors the flat command surface above
fn create_recurring_blocking(
    app: &AppHandle,
    cwd: String,
    branch: Option<String>,
    name: Option<String>,
    prompt: Option<String>,
    interval_secs: u64,
    first_fire_at: u64,
    agent: Option<String>,
    create_branch: Option<bool>,
    base: Option<String>,
    worktree: Option<bool>,
) -> Result<RecurringSession, SessionError> {
    let store = app.state::<Store>();
    let manager = app.state::<SessionManager>();
    let create_branch = create_branch.unwrap_or(false);
    let worktree = worktree.unwrap_or(false);
    let branch = branch.filter(|b| !b.is_empty());
    // Enforce a floor of 60s (the frontend also clamps) so a bad interval can't
    // hot-loop the poll.
    let interval_secs = interval_secs.max(60);
    // Deterministic worktree folder (mirrors create_schedule): depends only on the
    // data dir + parent repo + branch, all known here.
    let worktree_path = if worktree {
        branch
            .as_deref()
            .and_then(|b| worktree_path(&store, &cwd, b).ok())
            .map(|p| p.to_string_lossy().to_string())
    } else {
        None
    };
    // Create the worktree folder + branch eagerly at create time (like #259), so a
    // creation failure is surfaced inline and the record is not persisted; fire time
    // reuses this folder (idempotent — see `prepare_worktree_for_recurring`).
    if worktree {
        if let (Some(branch), Some(dest)) = (branch.as_deref(), worktree_path.as_deref()) {
            let dest = Path::new(dest);
            if !dest.is_dir() {
                if create_branch {
                    git::worktree_add_new_branch(&cwd, branch, base.as_deref().unwrap_or(""), dest)
                        .map_err(SessionError::Git)?;
                } else {
                    git::worktree_add(&cwd, branch, dest).map_err(SessionError::Git)?;
                }
            }
        }
    }
    let rec = RecurringSession {
        id: Uuid::new_v4().to_string(),
        cwd,
        branch,
        create_branch,
        branch_base: if create_branch {
            base.filter(|b| !b.is_empty())
        } else {
            None
        },
        worktree,
        worktree_path,
        name: name.filter(|n| !n.trim().is_empty()),
        prompt: prompt.filter(|p| !p.trim().is_empty()),
        interval_secs,
        next_fire_at: first_fire_at,
        current_session_id: None,
        created_at: now_secs(),
        agent: agent.unwrap_or_else(|| crate::agents::DEFAULT_AGENT_ID.to_string()),
    };
    store
        .add_recurring(rec.clone())
        .map_err(|e| SessionError::Io(e.to_string()))?;
    // Immediate first fire (#300): a "now" recurring (`first_fire_at <= now`) must spawn
    // its first child **at create time**, not wait up to a full poll tick (5s) for
    // `fire_due_recurrings`. Firing here — rotating `current_session_id` + advancing
    // `next_fire_at` BEFORE the returned record and the `recurring://changed` broadcast
    // reach the frontend — also closes the create↔poll race that could otherwise surface
    // a duplicate/blank card. The store lock taken by `add_recurring` is already released
    // (each store op re-acquires it), so `fire_one_recurring` can't deadlock/re-enter it.
    // Best-effort, mirroring `fire_due_recurrings`: on failure keep the record, advance
    // its time, and emit `recurring://error` rather than failing the whole create. A
    // future `first_fire_at` is left for the poll loop to fire when it comes due.
    if rec.next_fire_at <= now_secs() {
        if let Err(message) = fire_one_recurring(&store, &manager, app, &rec) {
            let _ = store.mark_recurring_fired(
                &rec.id,
                rec.current_session_id.clone(),
                now_secs() + rec.interval_secs,
            );
            let _ = app.emit(
                "recurring://error",
                RecurringErrorPayload {
                    id: rec.id.clone(),
                    message,
                },
            );
        }
    }
    // Broadcast AFTER the (possible) immediate fire so `recurring://changed` carries the
    // rotated `current_session_id` — the frontend's child-exclusion depends on it.
    broadcast_recurrings(app, &store);
    // Return the post-fire record (rotated `current_session_id` + advanced `next_fire_at`)
    // so the frontend's optimistic add already owns the child — no blank duplicate card.
    Ok(store.recurring(&rec.id).unwrap_or(rec))
}

/// All active recurring sessions (#294).
#[tauri::command]
pub fn list_recurrings(store: State<'_, Store>) -> Vec<RecurringSession> {
    store.recurrings()
}

/// Cancel a recurring session (#294): kill its current child (if any) + forget both
/// the child record and the recurring record, then broadcast. The worktree cleanup
/// (ref-counted) is done frontend-side, mirroring `cancelSchedule`.
#[tauri::command]
pub fn cancel_recurring(
    app: AppHandle,
    manager: State<'_, SessionManager>,
    store: State<'_, Store>,
    id: String,
) -> Result<(), SessionError> {
    if let Some(rec) = store.recurring(&id) {
        if let Some(child) = rec.current_session_id.as_deref() {
            let _ = manager.kill_session(child);
            let _ = store.remove_session(child);
            // Cross-window sync (task 428): the child's record left the roster.
            // Removal-only, so no #300 ownership race is possible here.
            broadcast_sessions(&app, &store);
        }
    }
    store
        .remove_recurring(&id)
        .map_err(|e| SessionError::Io(e.to_string()))?;
    broadcast_recurrings(&app, &store);
    Ok(())
}

/// Update a recurring session's prompt / name / interval / next fire time (#294) — the
/// editor panel's edits. `interval_secs` is floored at 60.
#[tauri::command]
pub fn update_recurring(
    app: AppHandle,
    store: State<'_, Store>,
    id: String,
    prompt: Option<String>,
    name: Option<String>,
    interval_secs: u64,
    next_fire_at: u64,
) -> Result<(), SessionError> {
    store
        .update_recurring(
            &id,
            prompt.filter(|p| !p.trim().is_empty()),
            name.filter(|n| !n.trim().is_empty()),
            interval_secs.max(60),
            next_fire_at,
        )
        .map_err(|e| SessionError::Io(e.to_string()))?;
    broadcast_recurrings(&app, &store);
    Ok(())
}

/// Fire any due recurring sessions (#294): the poll-loop entry. For each due record,
/// rotate its child (kill the old, spawn a fresh seeded one). On error emit
/// `recurring://error` but KEEP the record and still advance `next_fire_at` so one
/// failure can't wedge or hot-loop the poll. Called on the same tick as
/// `fire_due_schedules`; boot catch-up runs on the first tick.
pub fn fire_due_recurrings(app: &AppHandle) {
    let store = app.state::<Store>();
    let due = store.take_due_recurrings(now_secs());
    if due.is_empty() {
        return;
    }
    let manager = app.state::<SessionManager>();
    for rec in due {
        if let Err(message) = fire_one_recurring(&store, &manager, app, &rec) {
            // Keep the record but advance its time so a persistently-failing folder
            // can't hot-loop (unlike a schedule, which is dropped).
            let _ = store.mark_recurring_fired(
                &rec.id,
                rec.current_session_id.clone(),
                now_secs() + rec.interval_secs,
            );
            let _ = app.emit(
                "recurring://error",
                RecurringErrorPayload {
                    id: rec.id.clone(),
                    message,
                },
            );
        }
    }
    broadcast_recurrings(app, &store);
}

/// Fire one recurring session (#294): (a) kill + forget the current child (if any),
/// (b) prepare the worktree / check out the branch (idempotent, like a schedule), (c)
/// spawn a **fresh** seeded child, (d) persist it as a normal tracked session, (e)
/// `mark_recurring_fired` (rotate `current_session_id` + advance `next_fire_at`), and
/// (f) emit `recurring://fired`. Returns the error string on failure — the caller keeps
/// the record + advances time.
fn fire_one_recurring(
    store: &Store,
    manager: &SessionManager,
    app: &AppHandle,
    rec: &RecurringSession,
) -> Result<(), String> {
    // Rotate: kill + forget the previous child so it leaves no lingering "exited"
    // overlay. Best-effort — an already-dead child just isn't found.
    if let Some(prev) = rec.current_session_id.as_deref() {
        let _ = manager.kill_session(prev);
        let _ = store.remove_session(prev);
    }
    // Resolve the spawn folder exactly like a schedule (idempotent worktree prep;
    // best-effort in-folder branch checkout/create).
    let (spawn_cwd, worktree_parent) = if rec.worktree {
        let dest = prepare_worktree_for_recurring(store, rec)?;
        (dest, Some(rec.cwd.clone()))
    } else {
        if let Some(branch) = &rec.branch {
            let _ = if rec.create_branch {
                git::create_branch(&rec.cwd, branch, rec.branch_base.as_deref().unwrap_or(""))
            } else {
                git::checkout_branch(&rec.cwd, branch)
            };
        }
        (rec.cwd.clone(), None)
    };
    let custom = custom_command_for(store, &rec.agent);
    let info = manager
        .spawn_session_with_prompt(
            &spawn_cwd,
            rec.name.clone(),
            rec.prompt.as_deref(),
            &rec.agent,
            custom.as_deref(),
            // Recurrings don't carry a dev-container flag (v1 scope) — host PTY.
            None,
        )
        .map_err(|e| e.to_string())?;
    let record = PersistedSession {
        id: info.id.clone(),
        claude_session_id: info.id,
        repo_path: spawn_cwd,
        name: rec.name.clone(),
        created_at: now_secs(),
        worktree_parent,
        auto_name: None,
        has_been_active: false,
        agent: rec.agent.clone(),
        forked_from: None,
        forkable: false,
        // Per-agent auto-continue opt-out (#297) — inherit the global behavior.
        auto_continue_disabled: false,
        // Per-agent watch (#336) — off (opt-in); the global switch can force it on.
        watch: false,
        container_image: None,
    };
    let _ = store.add_session(record.clone());
    let _ = store.touch_recent(&rec.cwd);
    // Cross-window sync (task 428): recents only. Deliberately NO `broadcast_sessions`
    // here — `recurring://fired` below already carries the new record, and a roster
    // emit would race the `current_session_id` rotation: a window could see the child
    // in the roster before `mark_recurring_fired`'s ownership lands, flashing it as an
    // unowned standalone card (#300).
    broadcast_recents(app, store);
    let next_fire_at = now_secs() + rec.interval_secs;
    let _ = store.mark_recurring_fired(&rec.id, Some(record.id.clone()), next_fire_at);
    let _ = app.emit(
        "recurring://fired",
        RecurringFiredPayload {
            id: rec.id.clone(),
            session: record,
            next_fire_at,
        },
    );
    Ok(())
}

/// Create (or reuse) the isolated worktree for a worktree recurring (#294) and return
/// its folder path. Idempotent: the worktree is created eagerly at create time, so this
/// only creates when the folder is missing. Mirrors `prepare_worktree_for_schedule`.
fn prepare_worktree_for_recurring(store: &Store, rec: &RecurringSession) -> Result<String, String> {
    let branch = rec
        .branch
        .as_deref()
        .filter(|b| !b.is_empty())
        .ok_or_else(|| "worktree recurring has no branch".to_string())?;
    let dest = match rec.worktree_path.as_deref() {
        Some(p) => PathBuf::from(p),
        None => worktree_path(store, &rec.cwd, branch).map_err(|e| e.to_string())?,
    };
    if !dest.is_dir() {
        if rec.create_branch {
            git::worktree_add_new_branch(
                &rec.cwd,
                branch,
                rec.branch_base.as_deref().unwrap_or(""),
                &dest,
            )?;
        } else {
            git::worktree_add(&rec.cwd, branch, &dest)?;
        }
    }
    Ok(dest.to_string_lossy().to_string())
}

/// `#` followed by 3/4/6/8 hex digits.
fn is_hex_color(value: &str) -> bool {
    match value.strip_prefix('#') {
        Some(hex) => {
            matches!(hex.len(), 3 | 4 | 6 | 8) && hex.bytes().all(|b| b.is_ascii_hexdigit())
        }
        None => false,
    }
}

/// True for an `http`/`https` URL containing no control/whitespace characters
/// (#109). The scheme check stops an escape-crafted terminal link from opening an
/// arbitrary scheme (`file:`, `javascript:`, …) or local file; rejecting
/// control/whitespace is defense in depth on top of `open` already receiving the
/// URL as a single non-shell argument. The scheme is matched case-insensitively
/// per RFC 3986.
fn is_http_url(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    let has_scheme = lower.starts_with("http://") || lower.starts_with("https://");
    has_scheme && !value.chars().any(|c| c.is_control() || c.is_whitespace())
}

// Async + off the main thread (#316): a non-`async` Tauri command runs on the
// main (webview) thread, so these `git` shell-outs freeze the UI until they
// return — for `fetch_remotes` that's a 2-3s `git fetch --prune` network stall
// on the new-session branch step. `spawn_blocking` moves the synchronous git
// call onto the blocking pool (the #200 `remove_worktree` pattern), keeping the
// window responsive. Return types are unchanged, so the frontend IPC contract
// (`src/ipc.ts`) is untouched; a join error (task panic) degrades to the same
// empty/fail-open value these git helpers already return for a non-git dir.
#[tauri::command]
pub async fn current_branch(cwd: String) -> String {
    tauri::async_runtime::spawn_blocking(move || git::current_branch(cwd))
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub async fn current_branches(paths: Vec<String>) -> std::collections::HashMap<String, String> {
    tauri::async_runtime::spawn_blocking(move || git::current_branches(&paths))
        .await
        .unwrap_or_default()
}

/// Summed added/removed line counts vs `HEAD` for many working trees in one round-trip
/// (#335) — the sidebar's per-agent `+A`/`−D` badge source. Mirrors `current_branches`:
/// a **batch** async command whose synchronous git work runs on `spawn_blocking` (#330)
/// so the whole sidebar refresh is one off-thread IPC round-trip and never freezes the
/// webview. Only paths with non-zero counts matter to the UI, but all are returned;
/// each entry is fail-open (non-git / no-HEAD / git error → `{ 0, 0 }`). A join error
/// (task panic) degrades to an empty map (no badges), matching the fail-open contract.
#[tauri::command]
pub async fn diff_line_counts(
    paths: Vec<String>,
) -> std::collections::HashMap<String, git::DiffLineCounts> {
    tauri::async_runtime::spawn_blocking(move || {
        paths
            .into_iter()
            .map(|p| {
                let counts = git::diff_line_counts(&p);
                (p, counts)
            })
            .collect()
    })
    .await
    .unwrap_or_default()
}

/// Ahead/behind commit counts vs each folder's upstream for many folders in one
/// round-trip (#338) — the sidebar's `↑A ↓B` branch indicator source. Mirrors
/// `diff_line_counts`: a **batch** async command whose synchronous git work runs on
/// `spawn_blocking` (#330) so the sidebar refresh never freezes the webview. Each folder
/// is a single `git rev-list --left-right --count HEAD...@{upstream}` computed **locally**
/// against the already-fetched remote-tracking ref (no network `git fetch`). Fail-open:
/// only folders with an upstream are present in the map — no upstream / detached HEAD /
/// non-git → omitted; a join error (task panic) degrades to an empty map (no indicators).
#[tauri::command]
pub async fn branch_ahead_behind(
    paths: Vec<String>,
) -> std::collections::HashMap<String, git::AheadBehind> {
    tauri::async_runtime::spawn_blocking(move || git::ahead_behind_many(&paths))
        .await
        .unwrap_or_default()
}

/// GitHub web URL per path, resolved in one call (#327) — mirrors `current_branches`.
/// Only paths whose remote resolves to a `github.com` repo are present in the map, so
/// the sidebar reads presence as "show the View-on-GitHub item". Runs the two cheap
/// local git reads off the main thread; a join error degrades to an empty map.
#[tauri::command]
pub async fn github_web_urls(paths: Vec<String>) -> std::collections::HashMap<String, String> {
    tauri::async_runtime::spawn_blocking(move || git::github_web_urls(&paths))
        .await
        .unwrap_or_default()
}

// Async + off the main thread (#330): the diff-viewer poll (`DiffInspector`, every
// ~1.5s) and the FileTree status coloring re-run these `git` shell-outs + hunk parses
// constantly. A non-`async` Tauri command runs on the main (webview) thread, so on a
// large working tree (or several open diff panels) each read froze input/rendering
// until it returned. `spawn_blocking` moves the synchronous git work onto the blocking
// pool (the #316 branch-read / #200 `remove_worktree` pattern), keeping the window
// responsive while the diff still refreshes to the latest state after an agent's turn.
// Return types are unchanged, so the frontend IPC contract (`src/ipc.ts`) is untouched;
// a join error (task panic) degrades to the same empty/`None`/fail-open value these git
// helpers already return for a non-git dir. Cross-platform: identical git work, only the
// thread it runs on changes (still through `git::hidden_command`).
#[tauri::command]
pub async fn working_diff(cwd: String) -> WorkingDiff {
    tauri::async_runtime::spawn_blocking(move || git::working_diff(cwd))
        .await
        .unwrap_or_default()
}

/// Lightweight per-file git status for the FileTree coloring (#252) — one
/// `git status --porcelain` per repo (no hunk parse, no per-untracked spawn, unlike
/// `working_diff`). A non-git / clean folder returns an empty list (fail-open, like
/// `working_diff`); the result is bounded server-side.
// Async + off the main thread (#330) — see the `working_diff` note above.
#[tauri::command]
pub async fn file_statuses(repo: String) -> Vec<FileStatusEntry> {
    tauri::async_runtime::spawn_blocking(move || git::file_statuses(repo))
        .await
        .unwrap_or_default()
}

/// Uncommitted working-tree diff for a **single file** vs `HEAD` (#324) — the source
/// for the FileViewer code view's per-line git-diff gutter. A thin, path-scoped
/// `git diff HEAD -- <file>` (untracked files fall back to `--no-index`). Fail-open:
/// a clean / non-git / no-HEAD file returns `null` (no gutter), never an error.
// Async + off the main thread (#330) — see the `working_diff` note above; a join error
// flattens to `None` (no gutter), matching the fail-open contract.
#[tauri::command]
pub async fn file_diff(repo: String, file: String) -> Option<FileDiff> {
    tauri::async_runtime::spawn_blocking(move || git::file_diff(repo, &file))
        .await
        .ok()
        .flatten()
}

// Async + off the main thread (#316) — see the `current_branch` note above.
#[tauri::command]
pub async fn list_branches(cwd: String) -> BranchList {
    tauri::async_runtime::spawn_blocking(move || git::list_branches(cwd))
        .await
        .unwrap_or_default()
}

/// The latest commits on `cwd`'s HEAD (#230) for the diff viewer's Commits source.
/// `limit` is clamped to `MAX_COMMITS` so the payload stays bounded on large histories
/// (the UI surfaces the cap). Non-git / no-commits → empty list (no error).
// Async + off the main thread (#330) — see the `working_diff` note above; the clamp
// runs first, then the git read moves onto the blocking pool.
#[tauri::command]
pub async fn list_commits(cwd: String, limit: Option<u32>) -> Vec<CommitInfo> {
    const MAX_COMMITS: u32 = 100;
    let limit = limit.unwrap_or(MAX_COMMITS).clamp(1, MAX_COMMITS);
    tauri::async_runtime::spawn_blocking(move || git::list_commits(cwd, limit))
        .await
        .unwrap_or_default()
}

/// The diff a single commit introduced (#230) — `git show <sha>` parsed into the same
/// `WorkingDiff` the body renders. An empty sha / git failure surfaces as a typed
/// `SessionError::Git`.
// Async + off the main thread (#330) — see the `working_diff` note above; a join error
// maps to `SessionError::Io`, mirroring `fetch_remotes`.
#[tauri::command]
pub async fn commit_diff(cwd: String, sha: String) -> Result<WorkingDiff, SessionError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::commit_diff(&cwd, &sha).map_err(SessionError::Git)
    })
    .await
    .map_err(|e| SessionError::Io(e.to_string()))?
}

/// Best-effort `git fetch --prune` for the new-session branch picker (#180) — a new
/// git network read that refreshes remote-tracking refs so `list_branches` can show
/// remote branches. Failure (offline / auth / no remote) surfaces as a typed
/// `SessionError::Git` the UI swallows (cached refs are shown instead).
// Async + off the main thread (#316) — this is the 2-3s new-session freeze: a
// synchronous `git fetch --prune` network call ran on the webview thread. See
// the `current_branch` note above.
#[tauri::command]
pub async fn fetch_remotes(cwd: String) -> Result<(), SessionError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::fetch_remotes(&cwd).map_err(SessionError::Git)
    })
    .await
    .map_err(|e| SessionError::Io(e.to_string()))?
}

/// Fast-forward the current branch of `cwd` to its upstream — `git pull --ff-only`
/// (#181), the sidebar repo / worktree "Pull" item. On success returns git's stdout
/// summary for the toast; a diverged / upstream-less / non-repo folder surfaces as a
/// typed `SessionError::Git { message }` shown as an error toast (no merge happens).
// Async + off the main thread (#353) — this is a **network** `git pull` (deferred by
// #330 as a "user-initiated one-shot"): on a slow/unreachable remote it froze the whole
// window until git gave up. Same `spawn_blocking` shape as `fetch_remotes`; a join error
// maps to `SessionError::Io`, and git's own error/summary strings are unchanged.
#[tauri::command]
pub async fn pull_branch(cwd: String) -> Result<String, SessionError> {
    tauri::async_runtime::spawn_blocking(move || git::pull_ff(&cwd).map_err(SessionError::Git))
        .await
        .map_err(|e| SessionError::Io(e.to_string()))?
}

/// Check out a branch in `cwd` (the first git write — see #27). Errors surface as
/// a typed `SessionError::Git { message }` carrying git's explanation.
// Async + off the main thread (#353) — a checkout on a large repo rewrites the whole
// working tree; on the webview thread that stalled the UI. See the `pull_branch` note.
#[tauri::command]
pub async fn checkout_branch(cwd: String, branch: String) -> Result<(), SessionError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::checkout_branch(&cwd, &branch).map_err(SessionError::Git)
    })
    .await
    .map_err(|e| SessionError::Io(e.to_string()))?
}

/// Create + check out a new branch `name` from `base` (empty = HEAD) in `cwd` — the
/// branch-creation git write (#124). Validation (invalid / already-existing name,
/// unknown base) surfaces as `SessionError::Git { message }` for inline display.
// Async + off the main thread (#353) — same `git checkout` cost as `checkout_branch`.
#[tauri::command]
pub async fn create_branch(cwd: String, name: String, base: String) -> Result<(), SessionError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::create_branch(&cwd, &name, &base).map_err(SessionError::Git)
    })
    .await
    .map_err(|e| SessionError::Io(e.to_string()))?
}

/// Two-dot branch comparison for the diff viewer (#81) — `git diff base target`,
/// rendered in the same diff body as `working_diff`.
// Async + off the main thread (#330) — see the `working_diff` note above; a join error
// maps to `SessionError::Io`, mirroring `fetch_remotes`.
#[tauri::command]
pub async fn compare_branches(
    cwd: String,
    base: String,
    target: String,
) -> Result<WorkingDiff, SessionError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::compare_branches(&cwd, &base, &target).map_err(SessionError::Git)
    })
    .await
    .map_err(|e| SessionError::Io(e.to_string()))?
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0)
}

/// A path-segment-safe slug: keep alphanumerics and `-_.`, replace the rest with
/// `-` (so a branch like `feat/x` becomes `feat-x`). Used for worktree paths (#74).
fn sanitize_seg(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.') {
                c
            } else {
                '-'
            }
        })
        .collect()
}

/// Make a (already `sanitize_seg`'d) path segment safe as a **Windows** file name:
/// (1) Windows silently strips trailing dots/spaces, which would desync the path we
/// record from the one it actually creates, so trim them; (2) Windows refuses to
/// create a file/dir whose stem is a reserved device name (`CON`, `PRN`, `AUX`,
/// `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`, case-insensitive) — all of which are *valid
/// git branch names* — so suffix `_` to dodge the collision. **No-op on unix** (these
/// names are ordinary there), so macOS worktree paths are byte-for-byte unchanged.
#[cfg(windows)]
fn windows_safe_seg(seg: String) -> String {
    const RESERVED: &[&str] = &[
        "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
        "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
    ];
    let trimmed = seg.trim_end_matches([' ', '.']);
    let base = if trimmed.is_empty() {
        "branch"
    } else {
        trimmed
    };
    let stem = base.split('.').next().unwrap_or(base);
    if RESERVED.iter().any(|r| r.eq_ignore_ascii_case(stem)) {
        format!("{base}_")
    } else {
        base.to_string()
    }
}

#[cfg(unix)]
fn windows_safe_seg(seg: String) -> String {
    seg
}

/// A stable (deterministic) hash of a string — `DefaultHasher` uses fixed keys,
/// so the same repo path always maps to the same worktree-id across runs (#74).
fn stable_hash(s: &str) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    s.hash(&mut hasher);
    hasher.finish()
}

/// The app-managed worktree folder for a (repo, branch) (#74):
/// `<data-dir>/worktrees/<repo-basename>-<repo-hash>/<branch>`. Stable per repo
/// path, so a second agent on the same (repo, branch) reuses the same folder.
fn worktree_path(store: &Store, repo: &str, branch: &str) -> Result<PathBuf, SessionError> {
    let base = store
        .data_dir()
        .ok_or_else(|| SessionError::Io("no app data directory".to_string()))?;
    let basename = Path::new(repo)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "repo".to_string());
    let repo_id = format!("{}-{:x}", sanitize_seg(&basename), stable_hash(repo));
    Ok(base
        .join("worktrees")
        .join(repo_id)
        .join(windows_safe_seg(sanitize_seg(branch))))
}

// --- Application settings (#100) ---

/// The persisted application settings blob (#100) — opaque JSON; `null` until the
/// frontend first saves (which writes its TS-side defaults).
#[tauri::command]
pub fn get_settings(store: State<'_, Store>) -> serde_json::Value {
    store.settings()
}

/// Merge a settings patch (#100) over the persisted blob under the Store mutex
/// (task 429) — the frontend sends only the changed fields, so a window holding a
/// stale copy can't revert another window's save. An explicit `null` value is
/// stored verbatim (never a delete); nested objects (`keybinds`) replace whole.
/// Broadcasts `settings://changed` (the merged blob) so every window converges —
/// task 428.
#[tauri::command]
pub fn set_settings(
    app: AppHandle,
    store: State<'_, Store>,
    settings: serde_json::Value,
) -> Result<(), SessionError> {
    store
        .merge_settings(settings)
        .map_err(|e| SessionError::Io(e.to_string()))?;
    broadcast_settings(&app, &store);
    // Wake the auto-continue engine so a `showSessionUsage` /
    // `autoContinueAfterLimit` change reacts now, not at the next 180s fetch —
    // task 430. Best-effort (fail-soft when unmanaged, e.g. tests).
    crate::autocontinue::poke(&app);
    Ok(())
}

/// The persisted sidebar width in px (#108); `None` until first set.
#[tauri::command]
pub fn get_sidebar_width(store: State<'_, Store>) -> Option<u32> {
    store.sidebar_width()
}

/// Persist the sidebar width (#108) — stored as-is; the frontend clamps.
/// Broadcasts `sidebar_width://changed` so every window converges — task 428.
#[tauri::command]
pub fn set_sidebar_width(
    app: AppHandle,
    store: State<'_, Store>,
    width: u32,
) -> Result<(), SessionError> {
    store
        .set_sidebar_width(width)
        .map_err(|e| SessionError::Io(e.to_string()))?;
    broadcast_sidebar_width(&app, &store);
    Ok(())
}

/// Whether the sidebar is collapsed to the icon rail (#168); `None` until first set.
#[tauri::command]
pub fn get_sidebar_collapsed(store: State<'_, Store>) -> Option<bool> {
    store.sidebar_collapsed()
}

/// Persist the sidebar collapsed flag (#168).
/// Broadcasts `sidebar_collapsed://changed` so every window converges — task 428.
#[tauri::command]
pub fn set_sidebar_collapsed(
    app: AppHandle,
    store: State<'_, Store>,
    collapsed: bool,
) -> Result<(), SessionError> {
    store
        .set_sidebar_collapsed(collapsed)
        .map_err(|e| SessionError::Io(e.to_string()))?;
    broadcast_sidebar_collapsed(&app, &store);
    Ok(())
}

/// The persisted top-level sidebar folder order (#211); empty until first set.
#[tauri::command]
pub fn get_repo_order(store: State<'_, Store>) -> Vec<String> {
    store.repo_order()
}

/// Persist the sidebar folder order (#211) — the user's drag-reordered repo paths.
/// Broadcasts `repo_order://changed` so every window converges — task 428.
#[tauri::command]
pub fn set_repo_order(
    app: AppHandle,
    store: State<'_, Store>,
    order: Vec<String>,
) -> Result<(), SessionError> {
    store
        .set_repo_order(order)
        .map_err(|e| SessionError::Io(e.to_string()))?;
    broadcast_repo_order(&app, &store);
    Ok(())
}

/// The per-repo diff "seen" review markers (#278); `null` until first written.
#[tauri::command]
pub fn get_diff_seen(store: State<'_, Store>) -> serde_json::Value {
    store.diff_seen()
}

/// Merge a diff-seen patch (#278) over the persisted map under the Store mutex
/// (task 429). The `seen` payload carries per-repo, per-file deltas with `null`
/// tombstones — `{repo: {file: "digest"}}` sets an entry, `{repo: {file: null}}`
/// deletes it, `{repo: null}` deletes the repo key (a repo emptied by tombstones is
/// pruned) — so a stale window's debounced write can no longer drop another
/// window's concurrent marks. Kept separate from the Settings blob so a Settings
/// draft can't clobber it. Broadcasts `diff_seen://changed` (the merged map) so
/// every window converges — task 428.
#[tauri::command]
pub fn set_diff_seen(
    app: AppHandle,
    store: State<'_, Store>,
    seen: serde_json::Value,
) -> Result<(), SessionError> {
    store
        .merge_diff_seen(seen)
        .map_err(|e| SessionError::Io(e.to_string()))?;
    broadcast_diff_seen(&app, &store);
    Ok(())
}

/// The app version observed on the previous run (#190); `None` on first launch.
#[tauri::command]
pub fn get_last_version(store: State<'_, Store>) -> Option<String> {
    store.last_version()
}

/// Persist the app version seen this run (#190), so the next boot can detect an
/// update and show a one-time "Updated to v…" toast.
#[tauri::command]
pub fn set_last_version(store: State<'_, Store>, version: String) -> Result<(), SessionError> {
    store
        .set_last_version(version)
        .map_err(|e| SessionError::Io(e.to_string()))
}

// --- Boot (#352) ---

/// Everything the frontend needs at boot, in ONE IPC round-trip (#352).
///
/// The boot used to be ~22 **sequential** round-trips (13 event-listener registrations,
/// `platform`, `windows_build`, two `Promise.all` batches, then five more serial singles);
/// 16 of them gated the first meaningful render, and every round-trip is an evaluate-JS hop
/// on the webview main thread (costliest on Linux/WebKitGTK, #346). Each field below is
/// **exactly** what its individual command returns — every one of those commands stays
/// registered for its other call sites; this is a batching read, not a replacement.
///
/// Cheap: every `Store` getter is an in-memory clone under one mutex (no disk I/O). The
/// only real work is the Windows `cmd /C ver` probe, which runs on the blocking pool.
#[derive(Serialize)]
pub struct BootState {
    /// `list_sessions`
    pub sessions: Vec<PersistedSession>,
    /// `list_recents`
    pub recents: Vec<String>,
    /// `list_repo_colors`
    pub repo_colors: std::collections::HashMap<String, String>,
    /// `list_overview_panels`
    pub overview_panels: std::collections::HashMap<String, Vec<OverviewPanel>>,
    /// `list_overview_order`
    pub overview_order: std::collections::HashMap<String, Vec<String>>,
    /// `list_open_files` (legacy, read once on boot only to clear it, #110)
    pub open_files: std::collections::HashMap<String, Vec<String>>,
    /// `get_canvas_layout` (legacy single layout, migrated once into `canvases`, #46→#58)
    pub canvas_layout: serde_json::Value,
    /// `get_canvases`
    pub canvases: serde_json::Value,
    /// `get_canvas_templates`
    pub canvas_templates: serde_json::Value,
    /// `get_settings`
    pub settings: serde_json::Value,
    /// `get_sidebar_width`
    pub sidebar_width: Option<u32>,
    /// `get_sidebar_collapsed`
    pub sidebar_collapsed: Option<bool>,
    /// `get_repo_order`
    pub repo_order: Vec<String>,
    /// `get_diff_seen`
    pub diff_seen: serde_json::Value,
    /// `list_schedules`
    pub schedules: Vec<ScheduledSession>,
    /// `list_recurrings`
    pub recurrings: Vec<RecurringSession>,
    /// `get_last_version`
    pub last_version: Option<String>,
    /// `app_version`
    pub app_version: String,
    /// `platform`
    pub platform: String,
    /// `windows_build` (`0` on non-Windows)
    pub windows_build: u32,
}

/// Assemble the boot payload from the persisted store — the **pure** half of `boot_state`
/// (no `AppHandle`, no OS probe), so it is unit-testable against a temp-file `Store`.
pub fn boot_state_from(
    store: &Store,
    platform: String,
    windows_build: u32,
    app_version: String,
) -> BootState {
    BootState {
        sessions: store.sessions(),
        recents: store.recents(),
        repo_colors: store.repo_colors(),
        overview_panels: store.overview_panels(),
        overview_order: store.overview_order(),
        open_files: store.open_files(),
        canvas_layout: store.canvas_layout(),
        canvases: store.canvases(),
        canvas_templates: store.canvas_templates(),
        settings: store.settings(),
        sidebar_width: store.sidebar_width(),
        sidebar_collapsed: store.sidebar_collapsed(),
        repo_order: store.repo_order(),
        diff_seen: store.diff_seen(),
        schedules: store.schedules(),
        recurrings: store.recurrings(),
        last_version: store.last_version(),
        app_version,
        platform,
        windows_build,
    }
}

/// The one boot read (#352): everything the frontend needs, in a single round-trip.
/// Purely additive — every individual command it batches stays registered and works.
#[tauri::command]
pub async fn boot_state(store: State<'_, Store>) -> Result<BootState, SessionError> {
    // The one non-trivial read: the Windows `cmd /C ver` probe (#143 `windows_build`).
    // Run it on the blocking pool (the #330 `current_branches` pattern) so it can't stall
    // an async worker — and await it FIRST, so no store lock is ever live across an await.
    // A no-op `0` on macOS/Linux; a join error degrades to 0 (xterm reflow simply stays
    // off, today's fallback).
    let win_build = tauri::async_runtime::spawn_blocking(windows_build)
        .await
        .unwrap_or(0);
    // Infallible in practice (in-memory reads only) — async + a borrowed `State` just
    // requires a `Result` return (the `clone_repo` precedent).
    Ok(boot_state_from(
        &store,
        platform(),
        win_build,
        app_version(),
    ))
}

/// Clear the recents list (#100 Settings → Data) and persist. Running sessions are
/// untouched — only the recently-used folder list is emptied.
/// Broadcasts `recents://changed` so every window converges — task 428.
#[tauri::command]
pub fn clear_recents(app: AppHandle, store: State<'_, Store>) -> Result<(), SessionError> {
    store
        .clear_recents()
        .map_err(|e| SessionError::Io(e.to_string()))?;
    broadcast_recents(&app, &store);
    Ok(())
}

/// Open a folder with the OS's default file manager, **without a shell** (so there is no
/// injection vector) — macOS `open`, Windows `explorer.exe`, Linux `xdg-open` (#345).
/// Each respects the user's default file manager. The single OS-open helper behind
/// `open_data_folder` / `reveal_path` (#100/#109/#129/#140/#345). (`open_url` opens a
/// *browser* and has its own opener — see below.)
///
/// Built through `child_env::command` (#350): under a Linux AppImage the inherited
/// `LD_LIBRARY_PATH`/`XDG_DATA_DIRS` are documented to break `xdg-open`, so the child
/// gets the user's real environment. A no-op on macOS/Windows (deliberately *not*
/// `git::hidden_command`, so those `Command`s stay exactly as they are today).
fn os_open(target: impl AsRef<std::ffi::OsStr>) -> Result<(), SessionError> {
    #[cfg(target_os = "macos")]
    let mut cmd = crate::child_env::command("open");
    #[cfg(target_os = "windows")]
    let mut cmd = crate::child_env::command("explorer.exe");
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let mut cmd = crate::child_env::command("xdg-open");
    cmd.arg(target.as_ref())
        .spawn()
        .map_err(|e| SessionError::Io(e.to_string()))?;
    Ok(())
}

/// Reveal the app-data directory (where `sessions.json` lives) in the OS file
/// manager (#100 Settings → Data). Creates the dir first so it always succeeds.
#[tauri::command]
pub fn open_data_folder(store: State<'_, Store>) -> Result<(), SessionError> {
    let dir = store
        .data_dir()
        .ok_or_else(|| SessionError::Io("no app data directory".to_string()))?;
    let _ = std::fs::create_dir_all(dir);
    os_open(dir)
}

/// Open an `http`/`https` URL in the user's default browser (#109) — a ⌘/Ctrl-click
/// on a linkified terminal URL routes here. Only `http`/`https` is accepted (so an
/// escape-crafted terminal link can't open another scheme or a local file), and the
/// opener runs **without a shell**, so there is no injection vector.
///
/// Unlike `reveal_path`/`open_data_folder` (which open a *folder* and route through
/// `os_open` → `explorer.exe` on Windows), this opens a *browser*, so on Windows it
/// uses `cmd /C start` rather than `explorer.exe <url>` — the latter opened a File
/// Explorer window instead of the browser (#217). The http/https-only guard keeps it
/// shell-injection-safe: the URL is always a separate, validated argument, never
/// interpolated into a shell string.
///
/// Built through `child_env::command` (#350) so the Linux `xdg-open` runs with the
/// user's real environment rather than the AppImage's (which is documented to break it).
#[tauri::command]
pub fn open_url(url: String) -> Result<(), SessionError> {
    if !is_http_url(&url) {
        return Err(SessionError::Io(format!(
            "refusing to open non-http(s) URL `{url}`"
        )));
    }
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut c = crate::child_env::command("open");
        c.arg(&url);
        c
    };
    #[cfg(target_os = "windows")]
    let mut command = {
        // `cmd /C start "" <url>` — `start`'s first quoted argument is the window
        // title, so the empty "" stops a quoted URL from being taken as the title.
        let mut c = crate::child_env::command("cmd");
        c.args(["/C", "start", "", url.as_str()]);
        c
    };
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let mut command = {
        let mut c = crate::child_env::command("xdg-open");
        c.arg(&url);
        c
    };
    command
        .spawn()
        .map_err(|e| SessionError::Io(e.to_string()))?;
    Ok(())
}

/// Save the OS clipboard image (#220) to a temp PNG and return its absolute path, so
/// the terminal paste handler can paste that path into `claude` (which attaches the
/// referenced image). Errors when the clipboard holds no image — the frontend maps
/// that to "no image" and falls back to text. Cross-platform: the clipboard plugin and
/// `std::env::temp_dir()` both work on macOS and Windows. The image is read Rust-side
/// (no IPC capability needed for a backend `ClipboardExt` call).
#[tauri::command]
pub fn save_clipboard_image(app: AppHandle) -> Result<String, SessionError> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let image = app
        .clipboard()
        .read_image()
        .map_err(|e| SessionError::Io(format!("no clipboard image: {e}")))?;
    let (width, height) = (image.width(), image.height());
    let rgba = image.rgba();
    if width == 0 || height == 0 || rgba.is_empty() {
        return Err(SessionError::Io("clipboard image is empty".to_string()));
    }
    let dir = std::env::temp_dir();
    cleanup_stale_paste_images(&dir);
    let path = dir.join(format!("recue-paste-{}.png", Uuid::new_v4()));
    let file = std::fs::File::create(&path).map_err(|e| SessionError::Io(e.to_string()))?;
    let mut encoder = png::Encoder::new(std::io::BufWriter::new(file), width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder
        .write_header()
        .map_err(|e| SessionError::Io(e.to_string()))?;
    writer
        .write_image_data(rgba)
        .map_err(|e| SessionError::Io(e.to_string()))?;
    writer
        .finish()
        .map_err(|e| SessionError::Io(e.to_string()))?;
    Ok(path.to_string_lossy().to_string())
}

/// Best-effort removal of leftover `recue-paste-*.png` temp files older than an
/// hour (#220), so repeated image pastes don't accumulate. A just-written file (the
/// one about to be pasted) is far younger than the cutoff, so it's never swept. All
/// errors are ignored — cleanup must never block a paste.
fn cleanup_stale_paste_images(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let now = std::time::SystemTime::now();
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if !(name.starts_with("recue-paste-") && name.ends_with(".png")) {
            continue;
        }
        let stale = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| now.duration_since(t).ok())
            .is_some_and(|age| age.as_secs() > 3600);
        if stale {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

/// Reveal a folder in the OS file manager (#129 repo context menu → "Reveal in
/// Finder"/"…Explorer"). Opens the folder itself (not a select-in-parent). Runs
/// **without a shell** (`os_open`), so there is no injection vector; the path is a
/// tracked repo dir.
#[tauri::command]
pub fn reveal_path(path: String) -> Result<(), SessionError> {
    os_open(path)
}

/// Reveal a **file** in the OS file manager (#171 sidebar file/Kanban row → "Reveal
/// in Finder"/"…Explorer"/"…File Manager"), **selecting** the file in its containing
/// folder rather than launching it in its default app. The file counterpart of
/// `reveal_path`: macOS `open -R <path>`, Windows `explorer.exe /select,<path>`, Linux
/// a best-effort FileManager1 select with a folder-open fallback (#345,
/// `reveal_file_linux`). Same no-shell safety as `reveal_path` / `open_url` — spawned
/// without a shell, and the path is the app's own tracked panel data. Every arm builds
/// its `Command` through `child_env::command` (#350), so the Linux reveal runs with the
/// user's real environment (a no-op on macOS/Windows).
#[tauri::command]
pub fn reveal_file_in_finder(path: String) -> Result<(), SessionError> {
    #[cfg(target_os = "macos")]
    {
        crate::child_env::command("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| SessionError::Io(e.to_string()))?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        reveal_file_linux(&path)?;
    }
    #[cfg(windows)]
    {
        // `explorer.exe /select,<path>` opens the containing folder with the file
        // highlighted. explorer is a GUI process (no console window flashes) and
        // quirkily returns a non-zero exit even on success — harmless here since we
        // only `spawn()`, never `wait()`. The token is built by `explorer_select_arg`
        // and passed via **`raw_arg`** (not `arg`): Rust's default arg-quoting would
        // wrap the whole `/select,<path>` token when the path has a space (a leading
        // quote *before* `/select,`), which explorer's nonstandard parser mishandles —
        // so a file under e.g. `C:\Users\First Last\…` wouldn't highlight (#194). The
        // helper instead quotes the path *inside* the token (`/select,"<path>"`).
        use std::os::windows::process::CommandExt;
        crate::child_env::command("explorer.exe")
            .raw_arg(explorer_select_arg(&path))
            .spawn()
            .map_err(|e| SessionError::Io(e.to_string()))?;
    }
    Ok(())
}

/// Linux best-effort "reveal a file in the file manager" (#345). There is no universal
/// "select this file" command, so first try the FreeDesktop
/// `org.freedesktop.FileManager1.ShowItems` D-Bus method (Nautilus / Nemo / Dolphin /
/// Thunar / Caja implement it and highlight the file, and the session bus auto-activates
/// the DE's file manager). If `dbus-send` is missing or the call fails (no FileManager1
/// provider), fall back to `xdg-open` on the file's **parent directory** (opens the
/// folder, no highlight). Spawned without a shell, like `reveal_path` / `open_url`, and
/// through `child_env::command` so neither `dbus-send` nor `xdg-open` inherits the
/// AppImage's environment (#350 — the documented `xdg-open` breakage).
/// Needs real-box verification per DE — see `TRAJECTORY_TO_LINUX.md`. Gated
/// `any(<linux/bsd>, test)` (with `dead_code` allowed under `test`) so the macOS host
/// type-checks it even though the real build arm isn't compiled there.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
#[cfg_attr(test, allow(dead_code))]
fn reveal_file_linux(path: &str) -> Result<(), SessionError> {
    // The `as` array of `ShowItems(uris, startup_id)` — bound before the arg array so
    // every element is a `&str` (a `&format!(…)` would be a `&String`, breaking the
    // homogeneous array type).
    let uris_arg = format!("array:string:file://{path}");
    // Wait on dbus-send (it's fast: a fire-and-forget method call) so a missing provider
    // falls through to the folder-open fallback rather than silently doing nothing.
    let shown = crate::child_env::command("dbus-send")
        .args([
            "--session",
            "--dest=org.freedesktop.FileManager1",
            "--type=method_call",
            "/org/freedesktop/FileManager1",
            "org.freedesktop.FileManager1.ShowItems",
            uris_arg.as_str(),
            "string:",
        ])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if shown {
        return Ok(());
    }
    let parent = std::path::Path::new(path)
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    crate::child_env::command("xdg-open")
        .arg(parent)
        .spawn()
        .map_err(|e| SessionError::Io(e.to_string()))?;
    Ok(())
}

/// Build the verbatim `explorer.exe` argument that selects `path` in its containing
/// folder: `/select,"<path>"` with all-backslash separators and the path quoted.
/// explorer needs backslashes (the frontend sends native paths via #143 `joinPath`;
/// this normalizes defensively for any other caller) and breaks on a path with spaces
/// unless the path itself is quoted — many real Windows paths contain spaces
/// (`C:\Users\First Last\…`, `Program Files`). The result is passed through `raw_arg`,
/// so the quoting lives *inside* the `/select,` token rather than around it (#194). A
/// `"` can't appear in a Windows filename, so the path can't break out of the quotes.
/// Gated to `any(windows, test)` so it's exercised by the cross-platform unit test
/// without becoming dead code in a non-Windows release build.
#[cfg(any(windows, test))]
fn explorer_select_arg(path: &str) -> String {
    let win_path = path.replace('/', "\\");
    format!("/select,\"{win_path}\"")
}

/// The ReCue app version (#100 Settings → About), from the crate version.
#[tauri::command]
pub fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// The host OS family (#143) — `std::env::consts::OS` (`"windows"` / `"macos"` /
/// `"linux"`). Read once at boot and cached in the store so the frontend shows
/// OS-appropriate **display** labels (Finder vs Explorer, ⌘ vs Ctrl). Keyboard
/// *handling* stays platform-agnostic (`metaKey || ctrlKey`).
#[tauri::command]
pub fn platform() -> String {
    std::env::consts::OS.to_string()
}

/// How this ReCue process was **installed** (#361) — the runtime signal that decides
/// whether the **in-app updater** owns this install:
///
/// * `"bundle"` — a macOS `.app` / a Windows installer / any dev (debug) build. Today's
///   behavior: the updater owns it.
/// * `"appimage"` — a Linux **AppImage** launch. The AppImage runtime exports `$APPIMAGE`
///   (the path of the `.AppImage` file) into the process environment, and Tauri's Linux
///   updater replaces exactly that file — so the updater owns it.
/// * `"system"` — a Linux **release** binary with **no** `$APPIMAGE`: installed by a
///   package manager (pacman / the AUR `recue-bin`, the `.deb`, a manual copy) or
///   extracted out of an AppImage. The updater must **not** touch it — pacman/apt owns
///   the binary, and Tauri's Linux updater couldn't replace it anyway.
///
/// A compile-time flag can't tell "AppImage build" from "distro build" — the AUR package
/// repacks the **same binary** the `.deb` carries — so the detection has to be runtime,
/// and `$APPIMAGE` is the one discriminator.
///
/// Pure so every row is unit-tested on every host. `RECUE_INSTALL_KIND` force-overrides
/// (mirroring #346's `RECUE_DISABLE_DMABUF`) so either state is exercisable on any box;
/// anything but the three known values is ignored.
fn classify_install(
    os: &str,
    appimage: Option<&str>,
    override_kind: Option<&str>,
    debug: bool,
) -> &'static str {
    match override_kind {
        Some("appimage") => return "appimage",
        Some("system") => return "system",
        Some("bundle") => return "bundle",
        // Garbage / unset → fall through to the real probe.
        _ => {}
    }
    if os != "linux" {
        return "bundle";
    }
    // A `tauri dev` binary is neither an AppImage nor a package — keep today's dev UX
    // (and the #193 update mock) working on Linux.
    if debug {
        return "bundle";
    }
    // An *empty* APPIMAGE reads as unset (`Some("")` is not an AppImage launch).
    match appimage {
        Some(path) if !path.is_empty() => "appimage",
        _ => "system",
    }
}

/// The install kind of this process (#361) — `"bundle"` / `"appimage"` / `"system"`.
/// Read once at boot and cached in the store; the frontend's `selfUpdates()` turns it
/// into "does the in-app updater own this install". See `classify_install`.
#[tauri::command]
pub fn install_kind() -> String {
    let appimage = std::env::var("APPIMAGE").ok();
    let override_kind = std::env::var("RECUE_INSTALL_KIND").ok();
    classify_install(
        std::env::consts::OS,
        appimage.as_deref(),
        override_kind.as_deref(),
        cfg!(debug_assertions),
    )
    .to_string()
}

/// The Windows build number (e.g. `19045`, `22631`, `26100`), read once at boot and
/// cached in the store to configure xterm.js's ConPTY handling
/// (`windowsPty.buildNumber`, which gates reflow at ≥ 21376). On **non-Windows** this
/// returns `0` — the frontend only consumes it under an `isWindows` guard, so macOS is
/// untouched and never even runs the probe. On Windows it shells out to `cmd /C ver`
/// via `hidden_command` (same `CREATE_NO_WINDOW` path as the `--version` probe, so no
/// console flash) and parses the bracketed version. Best-effort: any failure ⇒ `0`,
/// which simply leaves xterm's reflow disabled (today's behavior).
#[tauri::command]
pub fn windows_build() -> u32 {
    #[cfg(windows)]
    {
        let out = crate::git::hidden_command("cmd")
            .args(["/C", "ver"])
            .output()
            .ok();
        out.and_then(|o| {
            let text = String::from_utf8_lossy(&o.stdout);
            parse_windows_build(&text)
        })
        .unwrap_or(0)
    }
    #[cfg(not(windows))]
    {
        0
    }
}

/// What ReCue decided about the WebKitGTK DMA-BUF renderer at boot (#357), for
/// **Settings → Rendering**: the exact boot line, its reason + evidence, what decided it
/// (auto-detection / the persisted setting / `RECUE_DISABLE_DMABUF` / the user's own
/// `WEBKIT_DISABLE_DMABUF_RENDERER`), and the persisted mode that was in effect.
///
/// `None` on macOS and Windows — nothing is decided there ([`linux_webkit`] is a no-op), so
/// the frontend hides the whole Rendering section. Read-only; no state, no env, no I/O (the
/// report was captured once at boot into a `OnceLock`).
#[tauri::command]
pub fn renderer_diagnostics() -> Option<crate::linux_webkit::RendererReport> {
    crate::linux_webkit::boot_report()
}

/// Parse the Windows build number out of `cmd /C ver` output, e.g.
/// `"Microsoft Windows [Version 10.0.19045.4046]"` → `Some(19045)` — the **third**
/// dotted component of the bracketed version. Tolerant of `ver`'s leading blank line
/// and CRLF line endings. Returns `None` if no `[Version …]` token with at least three
/// numeric components is found. Pure and gated `any(windows, test)` so the
/// cross-platform unit test exercises it without dead code in a non-Windows build
/// (mirrors `explorer_select_arg`).
#[cfg(any(windows, test))]
fn parse_windows_build(ver_output: &str) -> Option<u32> {
    // Find the `[Version <a>.<b>.<c>...]` token and take the third dotted field.
    let start = ver_output.find("[Version")?;
    let rest = &ver_output[start..];
    let close = rest.find(']')?;
    let inner = &rest[..close]; // "[Version 10.0.19045.4046"
    let version = inner.rsplit(' ').next()?; // "10.0.19045.4046"
    version.split('.').nth(2)?.parse::<u32>().ok()
}

/// `<binary> --version`. Best-effort: `None` if the CLI is missing or errors. This
/// doubles as the **presence check** — `None` means the binary isn't runnable.
fn binary_version(binary: &str) -> Option<String> {
    // Resolve the binary exactly as the PTY spawn does (#140) so this presence/
    // version probe agrees with what actually launches: on Windows an npm-installed
    // `claude` is `claude.cmd`, which `Command::new("claude")` can neither find
    // (CreateProcess appends `.exe`, never consults PATHEXT) nor execute (a batch
    // file needs `cmd.exe /C`) — so the probe used to report claude as missing even
    // when it was installed and sessions spawned fine. On unix this resolves to the
    // bare program name, so macOS runs the identical command as before.
    let (program, prefix_args) = crate::pty::resolve_command(binary)?;
    // `crate::git::hidden_command` keeps this `--version` probe from flashing a
    // console window on Windows (no-op on macOS); it can run on the agent selector.
    let mut cmd = crate::git::hidden_command(&program);
    for arg in &prefix_args {
        cmd.arg(arg);
    }
    let output = cmd.arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

/// `claude --version` (#100 Settings → About). Best-effort: `None` if the CLI is
/// missing or errors, so the UI just omits the line. (Behavior unchanged by #141.)
// Async + off the main thread (#353) — `binary_version` **spawns `claude --version` and
// waits** for it (~1s on a cold node start), which on the webview thread froze the whole
// window. A join error (a panicked blocking task) flattens to `None`, the same fail-open
// value a missing/erroring CLI already produces.
#[tauri::command]
pub async fn claude_version() -> Option<String> {
    tauri::async_runtime::spawn_blocking(|| binary_version("claude"))
        .await
        .ok()
        .flatten()
}

/// Metadata about a coding agent (#141), for the #142 Settings selector + the
/// generalized missing-binary screen: the spec's labels/capabilities plus a live
/// `version` (the binary's `--version`, `None` ⇒ **not found / not runnable**).
#[derive(serde::Serialize)]
pub struct AgentInfo {
    pub id: String,
    pub display_name: String,
    pub binary_name: String,
    pub install_hint: String,
    pub supports_resume: bool,
    pub supports_auto_name: bool,
    /// `<binary> --version`, or `None` when the agent's CLI isn't installed.
    pub version: Option<String>,
}

/// Report the selected agent's binary, install hint, capabilities, and whether its
/// CLI is present (#141) — the backend foundation the #142 missing-binary screen +
/// agent selector consume. An unknown id resolves to Claude (per `agent_spec`).
// Async + off the main thread (#353) — the probe (`binary_version`) **spawns
// `<binary> --version` and waits**. The first-launch agent picker fires one `agent_info`
// per selectable agent via `Promise.all`, but as a sync command they executed **serially
// on the webview thread**, freezing the window for ~1-2s × N. The settings blob (needed
// only to resolve a **custom** agent's real program, #325) is read up front — a cheap
// in-memory clone, in a statement whose `State` temporary is dropped before the `.await`
// — and only the probe crosses onto the blocking pool, so the N probes now genuinely run
// concurrently. Taking an owned `AppHandle` (never a borrowed `State`) is also what lets
// this async command keep its bare, non-`Result` return type. Semantics are unchanged,
// including the unset-custom case (no command set ⇒ never probed ⇒ `version: None`); a
// join error flattens to `None`, the same fail-open value a missing CLI produces.
#[tauri::command]
pub async fn agent_info(app: AppHandle, agent: String) -> AgentInfo {
    let spec = crate::agents::agent_spec(&agent);
    // The custom agent (#325) has no fixed binary — its real program comes from the
    // user's `customAgentCommand` in Settings. Resolve it so the presence/version probe
    // and the ClaudeMissing banner name the **actual** program (falling back to the
    // "custom" placeholder when unset). Built-in agents keep their spec's binary.
    let program = if spec.id == "custom" {
        let settings = app.state::<Store>().settings();
        crate::agents::read_custom_command(&settings)
            .and_then(|cmd| crate::agents::parse_custom_command(&cmd))
            .map(|(program, _args)| program)
    } else {
        Some(spec.binary_name.to_string())
    };
    let binary_name = program
        .clone()
        .unwrap_or_else(|| spec.binary_name.to_string());
    let version = match program {
        Some(program) => tauri::async_runtime::spawn_blocking(move || binary_version(&program))
            .await
            .ok()
            .flatten(),
        None => None,
    };
    AgentInfo {
        id: spec.id.to_string(),
        display_name: spec.display_name.to_string(),
        binary_name,
        install_hint: spec.install_hint.to_string(),
        supports_resume: spec.supports_resume,
        supports_auto_name: spec.supports_auto_name,
        version,
    }
}

/// Detect which catalog editors are installed ("Open in editor") — powers the
/// first-use picker + the Settings → Editor "detected" annotations. Existence-based
/// only (a stat / PATH resolution, never `--version` — JetBrains launchers boot a
/// JVM), but the PATH arm still **blocks** on the login-shell probe the first time
/// (`effective_path`, bounded ~5s), so like `claude_version` (#353) the whole sweep
/// runs on the blocking pool; a join error flattens to the empty list (fail-open —
/// the picker then offers the custom command).
#[tauri::command]
pub async fn detect_editors() -> Vec<crate::editors::EditorInfo> {
    tauri::async_runtime::spawn_blocking(crate::editors::detect_all)
        .await
        .unwrap_or_default()
}

/// Open the folder `path` in `editor` (a catalog id, or `"custom"` → the user's
/// `customEditorCommand`), detached. The settings blob is read up front — a cheap
/// in-memory clone, in its own statement so the `State` temporary drops before the
/// `.await` (the `agent_info` pattern) — and only the resolve+spawn crosses onto the
/// blocking pool (the PATH arm can wait on the login-shell probe, #360). Errors are
/// typed `SessionError`s: `BinaryNotFound` tells the frontend to reopen the picker.
#[tauri::command]
pub async fn open_in_editor(
    app: AppHandle,
    path: String,
    editor: String,
) -> Result<(), SessionError> {
    let custom = if editor == "custom" {
        let settings = app.state::<Store>().settings();
        crate::editors::read_custom_editor_command(&settings)
    } else {
        None
    };
    tauri::async_runtime::spawn_blocking(move || {
        crate::editors::open_in_editor(&path, &editor, custom.as_deref())
    })
    .await
    .map_err(|e| SessionError::Io(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The pre-paint background must match `--bg-base` (Catppuccin Mocha Crust, UI v2 task
    /// 372) for dark and every non-light / unknown / absent value (#348) — a fresh install
    /// has no `theme` key.
    #[test]
    fn background_for_theme_defaults_to_the_dark_base() {
        let dark = Color(0x11, 0x11, 0x1b, 0xff);
        assert_eq!(background_for_theme(None), dark);
        assert_eq!(background_for_theme(Some("dark")), dark);
        assert_eq!(background_for_theme(Some("bogus")), dark);
        assert_eq!(background_for_theme(Some("")), dark);
    }

    /// Light (#333) maps to the Catppuccin Latte Crust (UI v2 task 372) — the same
    /// `--bg-base` the light token block, `THEME_BG` in `src/theme.ts` and the
    /// `index.html` inline style carry.
    #[test]
    fn background_for_theme_maps_light_to_the_latte_base() {
        assert_eq!(
            background_for_theme(Some("light")),
            Color(0xdc, 0xe0, 0xe8, 0xff)
        );
    }

    /// Unreserved bytes (RFC 3986: alnum + `-_.~`) pass through untouched (task 434).
    #[test]
    fn encode_query_value_passes_unreserved_through() {
        assert_eq!(encode_query_value("abc-XYZ_0.9~"), "abc-XYZ_0.9~");
        assert_eq!(encode_query_value(""), "");
    }

    /// Space encodes as `%20` — never `+`, which `URLSearchParams` would decode to a
    /// space — and a literal `+` encodes so it survives the same decode (task 434).
    #[test]
    fn encode_query_value_escapes_space_and_plus() {
        assert_eq!(encode_query_value("a b"), "a%20b");
        assert_eq!(encode_query_value("a+b"), "a%2Bb");
    }

    /// The URL metacharacters that would split/terminate the query (`&`, `=`, `#`)
    /// and the escape char itself (`%`) all encode (task 434).
    #[test]
    fn encode_query_value_escapes_url_metacharacters() {
        assert_eq!(encode_query_value("a&b=c#d"), "a%26b%3Dc%23d");
        assert_eq!(encode_query_value("100%"), "100%25");
    }

    /// A Windows repo path — drive colon, backslashes, a space — round-trips
    /// byte-exact through `URLSearchParams` decoding (task 434; the frontend test
    /// mirror decodes this exact string back to `C:\Users\a b`).
    #[test]
    fn encode_query_value_handles_a_windows_path() {
        assert_eq!(encode_query_value("C:\\Users\\a b"), "C%3A%5CUsers%5Ca%20b");
    }

    /// Multi-byte UTF-8 encodes per byte (task 434) — e.g. `é` (U+00E9) is `%C3%A9`.
    #[test]
    fn encode_query_value_encodes_utf8_per_byte() {
        assert_eq!(encode_query_value("é"), "%C3%A9");
        assert_eq!(encode_query_value("日"), "%E6%97%A5");
    }

    /// The app-window route (task 434): bare, repo-only, and both-preset forms, with
    /// the encoding applied to every value.
    #[test]
    fn app_window_url_composes_the_route() {
        let none = AppWindowInit::default();
        assert_eq!(app_window_url("u1", &none), "index.html?win=u1");

        let repo = AppWindowInit {
            repo: Some("/a/b c".into()),
            canvas: None,
        };
        assert_eq!(
            app_window_url("u1", &repo),
            "index.html?win=u1&repo=%2Fa%2Fb%20c"
        );

        let both = AppWindowInit {
            repo: Some("C:\\Users\\a b".into()),
            canvas: Some("c2".into()),
        };
        assert_eq!(
            app_window_url("u1", &both),
            "index.html?win=u1&repo=C%3A%5CUsers%5Ca%20b&canvas=c2"
        );
    }

    /// Build a minimal `PersistedSession` for the `worktree_parent_for_cwd` tests (#331) —
    /// only `repo_path` + `worktree_parent` matter to the resolver.
    fn mk_session(repo_path: &str, worktree_parent: Option<&str>) -> PersistedSession {
        PersistedSession {
            id: "id".into(),
            claude_session_id: "id".into(),
            repo_path: repo_path.into(),
            name: None,
            created_at: 0,
            worktree_parent: worktree_parent.map(|s| s.to_string()),
            auto_name: None,
            has_been_active: false,
            agent: "claude".into(),
            forked_from: None,
            forkable: false,
            auto_continue_disabled: false,
            watch: false,
            container_image: None,
        }
    }

    /// A temp-file `Store` path, mirroring `store.rs`'s test helper.
    fn temp_store_path(tag: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!("recue-commands-{tag}-{}.json", std::process::id()));
        let _ = std::fs::remove_file(&path);
        path
    }

    /// #352: the batched `boot_state` must return **exactly** what the individual
    /// commands/getters it replaces return — this is the regression guard for "one
    /// round-trip carries the same data as the N it batches". Every field is asserted
    /// against the very getter its own command calls, plus the four passed-through
    /// scalars (platform / windows build / app version / detached canvas ids).
    #[test]
    fn boot_state_from_matches_the_individual_getters() {
        let path = temp_store_path("bootstate");
        let store = Store::load(&path);

        // Populate a representative slice of every persisted shape the boot reads.
        store.add_session(mk_session("/repo/a", None)).unwrap();
        store.touch_recent("/repo/a").unwrap();
        store.set_repo_color("/repo/a", "#fab387").unwrap();
        store
            .set_overview_panels(
                "/repo/a",
                vec![OverviewPanel {
                    id: "p1".into(),
                    kind: "diff".into(),
                    file: None,
                    diff_source: None,
                    compare_base: None,
                    compare_target: None,
                    commit_sha: None,
                }],
            )
            .unwrap();
        store
            .set_overview_order("/repo/a", vec!["p1".into()])
            .unwrap();
        store
            .set_open_files("/repo/a", vec!["CLAUDE.md".into()])
            .unwrap();
        store
            .set_canvas_layout(serde_json::json!({ "kind": "leaf", "id": "l1" }))
            .unwrap();
        store
            .set_canvases(serde_json::json!({ "canvases": [], "activeId": "c1" }))
            .unwrap();
        store
            .set_canvas_templates(serde_json::json!([{ "id": "t1", "name": "T" }]))
            .unwrap();
        store
            .set_settings(serde_json::json!({ "theme": "dark" }))
            .unwrap();
        store.set_sidebar_width(320).unwrap();
        store.set_sidebar_collapsed(true).unwrap();
        store.set_repo_order(vec!["/repo/a".into()]).unwrap();
        store
            .set_diff_seen(serde_json::json!({ "/repo/a": { "src/x.rs": "d1" } }))
            .unwrap();
        store.set_last_version("1.2.0".into()).unwrap();
        store
            .add_schedule(ScheduledSession {
                id: "s1".into(),
                cwd: "/repo/a".into(),
                branch: None,
                create_branch: false,
                branch_base: None,
                worktree: false,
                worktree_path: None,
                name: None,
                prompt: None,
                fire_at: 42,
                created_at: 0,
                agent: "claude".into(),
            })
            .unwrap();
        store
            .add_recurring(RecurringSession {
                id: "r1".into(),
                cwd: "/repo/a".into(),
                branch: None,
                create_branch: false,
                branch_base: None,
                worktree: false,
                worktree_path: None,
                name: None,
                prompt: None,
                interval_secs: 3600,
                next_fire_at: 99,
                current_session_id: None,
                created_at: 0,
                agent: "claude".into(),
            })
            .unwrap();

        let boot = boot_state_from(&store, "linux".to_string(), 0, "1.2.3".to_string());

        // Every store-backed field equals what its individual command would return.
        assert_eq!(boot.sessions, store.sessions());
        assert_eq!(boot.recents, store.recents());
        assert_eq!(boot.repo_colors, store.repo_colors());
        assert_eq!(boot.overview_panels, store.overview_panels());
        assert_eq!(boot.overview_order, store.overview_order());
        assert_eq!(boot.open_files, store.open_files());
        assert_eq!(boot.canvas_layout, store.canvas_layout());
        assert_eq!(boot.canvases, store.canvases());
        assert_eq!(boot.canvas_templates, store.canvas_templates());
        assert_eq!(boot.settings, store.settings());
        assert_eq!(boot.sidebar_width, store.sidebar_width());
        assert_eq!(boot.sidebar_collapsed, store.sidebar_collapsed());
        assert_eq!(boot.repo_order, store.repo_order());
        assert_eq!(boot.diff_seen, store.diff_seen());
        assert_eq!(boot.schedules, store.schedules());
        assert_eq!(boot.recurrings, store.recurrings());
        assert_eq!(boot.last_version, store.last_version());
        // …and the three scalars are passed through untouched.
        assert_eq!(boot.platform, "linux");
        assert_eq!(boot.windows_build, 0);
        assert_eq!(boot.app_version, "1.2.3");

        // Nothing was invented: the payload is a plain JSON object of the 20 fields.
        let value = serde_json::to_value(&boot).expect("serialize");
        assert!(value.get("sessions").is_some());
        assert_eq!(value.as_object().map(|o| o.len()), Some(20));

        let _ = std::fs::remove_file(&path);
    }

    // --- Rust-owned clean-exit decision (task 431, ported from store.ts isCleanExit) ---

    #[test]
    fn is_clean_exit_treats_code_0_while_running_not_intentional_as_clean() {
        assert!(is_clean_exit(Some(0), false, false));
    }

    #[test]
    fn is_clean_exit_keeps_nonzero_and_unknown_exits_recoverable() {
        // A crash / failed resume keeps the record + overlay + Restart, never a forget.
        assert!(!is_clean_exit(Some(1), false, false));
        assert!(!is_clean_exit(Some(137), false, false));
        assert!(!is_clean_exit(None, false, false));
    }

    #[test]
    fn is_clean_exit_never_forgets_during_the_boot_window() {
        // A code-0 exit while booting keeps the overlay + Restart instead of vanishing (#30).
        assert!(!is_clean_exit(Some(0), true, false));
    }

    #[test]
    fn is_clean_exit_never_forgets_an_intentional_kill() {
        // Remove/forget/rotation/cancel toast on their own — even a child that traps
        // SIGHUP and exits 0 under the kill must not read as clean.
        assert!(!is_clean_exit(Some(0), false, true));
    }

    #[test]
    fn classify_exit_forgets_only_a_tracked_clean_exit() {
        // The one ForgetClean cell: a tracked, non-recurring-owned, clean exit.
        assert_eq!(
            classify_exit(true, false, Some(0), false, false),
            ExitAction::ForgetClean
        );
    }

    #[test]
    fn classify_exit_emits_for_every_guard_failure() {
        // No record (a shell terminal #72) — even a clean code 0 emits.
        assert_eq!(
            classify_exit(false, false, Some(0), false, false),
            ExitAction::EmitExited
        );
        // A recurring's rotating child (#294) — its exit drives the rotation UX.
        assert_eq!(
            classify_exit(true, true, Some(0), false, false),
            ExitAction::EmitExited
        );
        // The boot resume window (#30).
        assert_eq!(
            classify_exit(true, false, Some(0), true, false),
            ExitAction::EmitExited
        );
        // An app-initiated kill (Remove/forget/rotation/cancel).
        assert_eq!(
            classify_exit(true, false, Some(0), false, true),
            ExitAction::EmitExited
        );
        // Non-zero / unknown codes (crash, failed resume) — overlay + Restart.
        assert_eq!(
            classify_exit(true, false, Some(1), false, false),
            ExitAction::EmitExited
        );
        assert_eq!(
            classify_exit(true, false, Some(137), false, false),
            ExitAction::EmitExited
        );
        assert_eq!(
            classify_exit(true, false, None, false, false),
            ExitAction::EmitExited
        );
        // Stacked guards still emit (no record + booting + intentional).
        assert_eq!(
            classify_exit(false, true, Some(0), true, true),
            ExitAction::EmitExited
        );
    }

    // --- worktree_has_items (task 431, ported from the #199 store.test.ts battery) ---

    /// Minimal schedule fixture — only `cwd` / `worktree_path` matter to the ref-count.
    fn mk_schedule(cwd: &str, worktree_path: Option<&str>) -> ScheduledSession {
        ScheduledSession {
            id: "s".into(),
            cwd: cwd.into(),
            branch: None,
            create_branch: false,
            branch_base: None,
            worktree: worktree_path.is_some(),
            worktree_path: worktree_path.map(|s| s.to_string()),
            name: None,
            prompt: None,
            fire_at: 0,
            created_at: 0,
            agent: "claude".into(),
        }
    }

    /// Minimal recurring fixture — only `cwd` / `worktree_path` matter to the ref-count.
    fn mk_recurring(cwd: &str, worktree_path: Option<&str>) -> RecurringSession {
        RecurringSession {
            id: "r".into(),
            cwd: cwd.into(),
            branch: None,
            create_branch: false,
            branch_base: None,
            worktree: worktree_path.is_some(),
            worktree_path: worktree_path.map(|s| s.to_string()),
            name: None,
            prompt: None,
            interval_secs: 3600,
            next_fire_at: 0,
            current_session_id: None,
            created_at: 0,
            agent: "claude".into(),
        }
    }

    /// Minimal overview-panel fixture.
    fn mk_panel(id: &str) -> OverviewPanel {
        OverviewPanel {
            id: id.into(),
            kind: "diff".into(),
            file: None,
            diff_source: None,
            compare_base: None,
            compare_target: None,
            commit_sha: None,
        }
    }

    const WT_DEST: &str = "/data/worktrees/repo-id/feat";

    #[test]
    fn worktree_has_items_is_false_for_a_worktree_with_no_items() {
        assert!(!worktree_has_items(&[], &HashMap::new(), &[], &[], WT_DEST));
    }

    #[test]
    fn worktree_has_items_counts_an_agent_at_the_worktree_incl_exited_but_kept() {
        // The guard counts ANY session record at this folder — including an exited
        // agent still shown with a Restart overlay (the record survives a crash).
        assert!(worktree_has_items(
            &[mk_session(WT_DEST, Some("/repo"))],
            &HashMap::new(),
            &[],
            &[],
            WT_DEST
        ));
    }

    #[test]
    fn worktree_has_items_counts_a_panel_but_not_an_empty_panel_list() {
        let mut panels = HashMap::new();
        panels.insert(WT_DEST.to_string(), vec![mk_panel("p1")]);
        assert!(worktree_has_items(&[], &panels, &[], &[], WT_DEST));
        // An empty panel list does not count.
        let mut empty = HashMap::new();
        empty.insert(WT_DEST.to_string(), Vec::new());
        assert!(!worktree_has_items(&[], &empty, &[], &[], WT_DEST));
    }

    #[test]
    fn worktree_has_items_counts_a_schedule_created_inside_the_worktree() {
        assert!(worktree_has_items(
            &[],
            &HashMap::new(),
            &[mk_schedule(WT_DEST, None)],
            &[],
            WT_DEST
        ));
    }

    #[test]
    fn worktree_has_items_counts_a_worktree_schedule_by_its_worktree_path() {
        // A worktree schedule's `cwd` is the PARENT repo, not the worktree folder; its
        // eagerly-created worktree (#259) lives at `worktree_path`. Matching only `cwd`
        // would miss it and wrongly free a worktree a pending schedule still uses.
        assert!(worktree_has_items(
            &[],
            &HashMap::new(),
            &[mk_schedule("/work/parent-repo", Some(WT_DEST))],
            &[],
            WT_DEST
        ));
        // A worktree schedule for a DIFFERENT folder does not count.
        assert!(!worktree_has_items(
            &[],
            &HashMap::new(),
            &[mk_schedule("/work/parent-repo", Some("/data/other"))],
            &[],
            WT_DEST
        ));
    }

    #[test]
    fn worktree_has_items_counts_a_recurring_in_both_forms() {
        // A recurring created inside the worktree (`cwd == dest`) …
        assert!(worktree_has_items(
            &[],
            &HashMap::new(),
            &[],
            &[mk_recurring(WT_DEST, None)],
            WT_DEST
        ));
        // … or a worktree recurring whose eager worktree is `worktree_path`.
        assert!(worktree_has_items(
            &[],
            &HashMap::new(),
            &[],
            &[mk_recurring("/work/parent-repo", Some(WT_DEST))],
            WT_DEST
        ));
        // A recurring for a different folder does not count.
        assert!(!worktree_has_items(
            &[],
            &HashMap::new(),
            &[],
            &[mk_recurring("/work/other", None)],
            WT_DEST
        ));
    }

    #[test]
    fn worktree_has_items_ignores_items_of_other_folders() {
        let mut panels = HashMap::new();
        panels.insert("/work/other".to_string(), vec![mk_panel("p")]);
        assert!(!worktree_has_items(
            &[mk_session("/work/other", None)],
            &panels,
            &[mk_schedule("/work/other", None)],
            &[mk_recurring("/work/other", None)],
            WT_DEST
        ));
    }

    #[test]
    fn worktree_has_items_mixed_items_all_count_until_true_emptiness() {
        let sessions = vec![mk_session(WT_DEST, Some("/repo"))];
        let mut panels = HashMap::new();
        panels.insert(WT_DEST.to_string(), vec![mk_panel("p")]);
        let schedules = vec![mk_schedule(WT_DEST, None)];
        let recurrings = vec![mk_recurring(WT_DEST, None)];
        assert!(worktree_has_items(
            &sessions,
            &panels,
            &schedules,
            &recurrings,
            WT_DEST
        ));
        // Drop the agent → still has a panel + schedule + recurring.
        assert!(worktree_has_items(
            &[],
            &panels,
            &schedules,
            &recurrings,
            WT_DEST
        ));
        // Drop the panel too → still has the schedule + recurring.
        assert!(worktree_has_items(
            &[],
            &HashMap::new(),
            &schedules,
            &recurrings,
            WT_DEST
        ));
        // Everything gone → empty → removable.
        assert!(!worktree_has_items(&[], &HashMap::new(), &[], &[], WT_DEST));
    }

    /// The wire shape the frontend maps outcomes on (task 431): camelCase strings.
    #[test]
    fn worktree_cleanup_serializes_camel_case() {
        assert_eq!(
            serde_json::to_value(WorktreeCleanup::Removed).unwrap(),
            serde_json::json!("removed")
        );
        assert_eq!(
            serde_json::to_value(WorktreeCleanup::InUse).unwrap(),
            serde_json::json!("inUse")
        );
        assert_eq!(
            serde_json::to_value(WorktreeCleanup::KeptDirty).unwrap(),
            serde_json::json!("keptDirty")
        );
    }

    #[test]
    fn worktree_parent_for_cwd_resolves_the_existing_worktree_parent() {
        // A worktree agent at /wt/feat nesting under /repo, plus a normal agent at /repo.
        let sessions = vec![
            mk_session("/wt/feat", Some("/repo")),
            mk_session("/repo", None),
        ];
        // The worktree folder resolves to its parent → a "New session here" spawn nests.
        assert_eq!(
            worktree_parent_for_cwd(&sessions, "/wt/feat"),
            Some("/repo".to_string())
        );
        // A plain repo folder (only a non-worktree agent) → None, so a normal spawn is
        // unaffected and still registers its own top-level folder.
        assert_eq!(worktree_parent_for_cwd(&sessions, "/repo"), None);
        // An unknown folder (no session there) → None.
        assert_eq!(worktree_parent_for_cwd(&sessions, "/other"), None);
        // No sessions at all → None.
        assert_eq!(worktree_parent_for_cwd(&[], "/wt/feat"), None);
    }

    #[test]
    fn output_base64_round_trips() {
        use base64::Engine as _;
        let cases: &[&[u8]] = &[
            b"",
            b"hello",
            // ESC [ 0 m and a smattering of high bytes / nulls (a TUI control burst).
            &[0x1b, b'[', b'0', b'm'],
            &[0u8, 27, 91, 49, 255, 254, 0, 128, 10, 13],
        ];
        for case in cases {
            let encoded = encode_output(case);
            let decoded = base64::engine::general_purpose::STANDARD
                .decode(&encoded)
                .expect("valid base64");
            assert_eq!(&decoded, case, "round-trip must be byte-exact");
        }
    }

    #[test]
    fn scrollback_reply_serializes_b64_string() {
        // #346: the scrollback replay must ship as a base64 STRING like live output —
        // a `Vec<u8>` field would serde-serialize to a JSON integer array (~4 chars
        // per byte), turning the 256 KB scrollback into a megabyte-plus parse on
        // every terminal mount.
        use base64::Engine as _;
        let raw: &[u8] = &[0x1b, b'[', b'2', b'J', 0, 255, b'h', b'i'];
        let reply = ScrollbackReply {
            b64: encode_output(raw),
            end: raw.len() as u64,
        };
        let value = serde_json::to_value(&reply).expect("serialize");
        let b64 = value
            .get("b64")
            .and_then(|v| v.as_str())
            .expect("`b64` must be a JSON string");
        assert_eq!(value.get("end").and_then(|v| v.as_u64()), Some(8));
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(b64)
            .expect("valid base64");
        assert_eq!(decoded, raw, "replay must round-trip byte-exact");
    }

    #[test]
    fn http_url_accepts_http_and_https() {
        assert!(is_http_url("http://localhost:5173"));
        assert!(is_http_url("https://example.com/path?q=1#frag"));
        // Scheme is case-insensitive (RFC 3986).
        assert!(is_http_url("HTTPS://Example.com"));
    }

    #[test]
    fn http_url_rejects_other_schemes_and_malformed() {
        assert!(!is_http_url("file:///etc/passwd"));
        assert!(!is_http_url("mailto:a@b.com"));
        assert!(!is_http_url("javascript:alert(1)"));
        // Bare host:port (no scheme) is out of scope (#109).
        assert!(!is_http_url("localhost:3000"));
        assert!(!is_http_url(""));
        // Defense in depth: no control/whitespace characters.
        assert!(!is_http_url("https://example.com/a b"));
        assert!(!is_http_url("https://example.com/\nmalicious"));
    }

    // `windows_safe_seg` only diverges from identity on Windows; gate the assertions
    // so the unix run (where it's a no-op) doesn't make false claims.
    #[cfg(windows)]
    #[test]
    fn windows_safe_seg_dodges_reserved_names_and_trailing_dots() {
        // Reserved device names (any case, with or without an extension) get `_`.
        assert_eq!(windows_safe_seg("con".to_string()), "con_");
        assert_eq!(windows_safe_seg("NUL".to_string()), "NUL_");
        assert_eq!(windows_safe_seg("com1".to_string()), "com1_");
        assert_eq!(windows_safe_seg("lpt9".to_string()), "lpt9_");
        assert_eq!(windows_safe_seg("aux.txt".to_string()), "aux.txt_");
        // Trailing dots/spaces (silently stripped by Windows) are trimmed.
        assert_eq!(windows_safe_seg("feature.".to_string()), "feature");
        assert_eq!(windows_safe_seg("v1 ".to_string()), "v1");
        // An ordinary branch is untouched; an all-dots stem falls back.
        assert_eq!(windows_safe_seg("feature-x".to_string()), "feature-x");
        assert_eq!(windows_safe_seg("...".to_string()), "branch");
    }

    #[cfg(unix)]
    #[test]
    fn windows_safe_seg_is_identity_on_unix() {
        // macOS preservation: the guard must not alter any segment off-Windows.
        assert_eq!(windows_safe_seg("con".to_string()), "con");
        assert_eq!(windows_safe_seg("feature.".to_string()), "feature.");
    }

    #[test]
    fn validate_new_segment_rejects_unsafe_names_on_every_os() {
        // Cross-platform rejections: empty, `.`/`..`, and embedded separators.
        assert!(validate_new_segment("").is_err());
        assert!(validate_new_segment("   ").is_err());
        assert!(validate_new_segment(".").is_err());
        assert!(validate_new_segment("..").is_err());
        assert!(validate_new_segment("a/b").is_err());
        assert!(validate_new_segment("a\\b").is_err());
        // Ordinary folder names are accepted everywhere.
        assert!(validate_new_segment("docs").is_ok());
        assert!(validate_new_segment("my-folder_2").is_ok());
    }

    // On Windows the reserved-device guard also rejects names that `windows_safe_seg`
    // would alter; on unix those are ordinary names and stay valid.
    #[cfg(windows)]
    #[test]
    fn validate_new_segment_rejects_windows_reserved_names() {
        assert!(validate_new_segment("con").is_err());
        assert!(validate_new_segment("NUL").is_err());
        assert!(validate_new_segment("lpt1").is_err());
        assert!(validate_new_segment("trailing.").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn validate_new_segment_allows_reserved_names_on_unix() {
        assert!(validate_new_segment("con").is_ok());
        assert!(validate_new_segment("nul").is_ok());
    }

    // The explorer `/select,` token is pure string logic — verify it on every OS so the
    // Windows-only `reveal_file_in_finder` arm (which can't run in the macOS CI) is still
    // covered. The bug it guards (#194): a path with a space wouldn't highlight when the
    // quote wraps the whole `/select,<path>` token instead of just the path.
    #[test]
    fn explorer_select_arg_quotes_path_and_normalizes_separators() {
        // Forward slashes (any caller) → backslashes; the path is quoted *inside* the
        // token so a path with spaces still highlights.
        assert_eq!(
            explorer_select_arg("C:/Users/First Last/file.txt"),
            "/select,\"C:\\Users\\First Last\\file.txt\""
        );
        // Already-native (backslash) paths from the frontend are preserved.
        assert_eq!(
            explorer_select_arg("C:\\repo\\sub dir\\a.md"),
            "/select,\"C:\\repo\\sub dir\\a.md\""
        );
    }

    // --- ConPTY: parse the Windows build number from `cmd /C ver` output ---
    #[test]
    fn parse_windows_build_reads_third_dotted_field() {
        // Win10 22H2, Win11 23H2, Win11 24H2 — always the third `.`-field.
        assert_eq!(
            parse_windows_build("Microsoft Windows [Version 10.0.19045.4046]"),
            Some(19045)
        );
        assert_eq!(
            parse_windows_build("Microsoft Windows [Version 10.0.22631.3155]"),
            Some(22631)
        );
        assert_eq!(
            parse_windows_build("Microsoft Windows [Version 10.0.26100.1234]"),
            Some(26100)
        );
        // `ver` emits a leading blank line + CRLF endings — must still parse.
        assert_eq!(
            parse_windows_build("\r\nMicrosoft Windows [Version 10.0.26200.5001]\r\n"),
            Some(26200)
        );
        // Garbage / missing token / too-few fields → None (caller falls back to 0).
        assert_eq!(parse_windows_build(""), None);
        assert_eq!(parse_windows_build("not a version string"), None);
        assert_eq!(parse_windows_build("[Version 10.0]"), None);
    }

    // --- #259: worktree schedules create their worktree eagerly + fire idempotently ---

    fn git_in(dir: &Path, args: &[&str]) -> bool {
        git::hidden_command("git")
            .arg("-C")
            .arg(dir)
            .args(args)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    /// A fresh temp git repo with one commit, or `None` if git is unavailable (the
    /// test then skips, like the `git.rs` integration tests).
    fn schedule_test_repo(tag: &str) -> Option<PathBuf> {
        let mut dir = std::env::temp_dir();
        dir.push(format!("recue-cmd-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).ok()?;
        if !git_in(&dir, &["init", "-q"]) {
            let _ = std::fs::remove_dir_all(&dir);
            return None;
        }
        git_in(&dir, &["config", "user.email", "t@test.dev"]);
        git_in(&dir, &["config", "user.name", "Test"]);
        git_in(&dir, &["config", "commit.gpgsign", "false"]);
        std::fs::write(dir.join("a.txt"), "x\n").ok()?;
        if !(git_in(&dir, &["add", "-A"])
            && git_in(&dir, &["commit", "-q", "--no-verify", "-m", "init"]))
        {
            let _ = std::fs::remove_dir_all(&dir);
            return None;
        }
        Some(dir)
    }

    #[test]
    fn prepare_worktree_for_schedule_is_idempotent_when_dest_exists() {
        let Some(repo) = schedule_test_repo("prep-wt") else {
            return;
        };
        // A Store whose data dir is a sibling temp dir, so `worktree_path` resolves a
        // real folder under it (the worktree lives at <data>/worktrees/<repo-id>/<branch>).
        let mut data = std::env::temp_dir();
        data.push(format!("recue-cmd-prep-data-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&data);
        std::fs::create_dir_all(&data).unwrap();
        let store = Store::load(data.join("sessions.json"));

        let repo_str = repo.to_string_lossy().to_string();
        let dest = worktree_path(&store, &repo_str, "feat-x").unwrap();
        // git `worktree add` creates the leaf, but make the intermediate dirs exist so
        // the test doesn't depend on that detail.
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        let sched = ScheduledSession {
            id: "s1".to_string(),
            cwd: repo_str.clone(),
            branch: Some("feat-x".to_string()),
            create_branch: true,
            branch_base: None,
            worktree: true,
            worktree_path: Some(dest.to_string_lossy().to_string()),
            name: None,
            prompt: None,
            fire_at: 0,
            created_at: 0,
            agent: "claude".to_string(),
        };

        // First call creates the worktree + its new branch (the eager-create at
        // schedule time, exercised here directly).
        let p1 = prepare_worktree_for_schedule(&store, &sched).expect("first prepare");
        assert!(Path::new(&p1).is_dir());
        assert!(git::list_branches(&repo).all.iter().any(|b| b == "feat-x"));

        // Second call (the fire path) is a no-op because `dest` already exists: it must
        // NOT try to recreate the branch (which would now error "already exists") and
        // returns the same folder. This is the #259 create-eagerly-then-fire flow.
        let p2 =
            prepare_worktree_for_schedule(&store, &sched).expect("second prepare is idempotent");
        assert_eq!(p1, p2);

        let _ = git::worktree_remove(&repo, Path::new(&p1), true);
        let _ = std::fs::remove_dir_all(&repo);
        let _ = std::fs::remove_dir_all(&data);
    }

    // ---- classify_install (#361) --------------------------------------------------
    // The runtime "how was this installed" probe behind the updater gate. Pure, so every
    // row is exercised on every host (macOS/Windows CI never sees a real AppImage).

    #[test]
    fn classify_install_is_bundle_on_macos_and_windows() {
        // Non-Linux never has an AppImage / package-manager binary — today's behavior
        // (the updater owns the .app / the installer) must be preserved byte-for-byte.
        for os in ["macos", "windows"] {
            assert_eq!(classify_install(os, None, None, false), "bundle");
            assert_eq!(classify_install(os, None, None, true), "bundle");
            // Even a stray APPIMAGE var can't flip a non-Linux host.
            assert_eq!(
                classify_install(os, Some("/tmp/ReCue.AppImage"), None, false),
                "bundle"
            );
        }
    }

    #[test]
    fn classify_install_detects_a_linux_appimage_by_the_appimage_var() {
        // The AppImage runtime exports $APPIMAGE — the file Tauri's Linux updater replaces.
        assert_eq!(
            classify_install(
                "linux",
                Some("/home/u/Apps/ReCue_1.2.1_amd64.AppImage"),
                None,
                false
            ),
            "appimage"
        );
    }

    #[test]
    fn classify_install_treats_a_linux_release_without_appimage_as_system() {
        // pacman/AUR/.deb/manual copy — the package manager owns the binary.
        assert_eq!(classify_install("linux", None, None, false), "system");
    }

    #[test]
    fn classify_install_treats_an_empty_appimage_var_as_unset() {
        // `std::env::var` yields Some("") for a present-but-empty var — that is NOT an
        // AppImage launch, so it must classify as a system install.
        assert_eq!(classify_install("linux", Some(""), None, false), "system");
    }

    #[test]
    fn classify_install_is_bundle_for_a_linux_debug_build() {
        // `npm run tauri dev` on Linux: neither an AppImage nor a package. Keep the dev
        // UX (and the #193 update mock) exactly as it is.
        assert_eq!(classify_install("linux", None, None, true), "bundle");
        assert_eq!(
            classify_install("linux", Some("/tmp/x.AppImage"), None, true),
            "bundle"
        );
    }

    #[test]
    fn classify_install_override_wins_over_everything() {
        // RECUE_INSTALL_KIND forces either state on any box (testing seam, #346 precedent).
        assert_eq!(
            classify_install("linux", None, Some("appimage"), false),
            "appimage"
        );
        assert_eq!(
            classify_install("macos", None, Some("system"), false),
            "system"
        );
        assert_eq!(
            classify_install("linux", Some("/tmp/x.AppImage"), Some("system"), false),
            "system"
        );
        assert_eq!(
            classify_install("linux", None, Some("bundle"), false),
            "bundle"
        );
        // A debug build can still be forced into either release state.
        assert_eq!(
            classify_install("linux", None, Some("system"), true),
            "system"
        );
    }

    #[test]
    fn classify_install_ignores_a_garbage_override() {
        // Anything but the three known values falls through to the real probe.
        assert_eq!(
            classify_install("linux", None, Some("nonsense"), false),
            "system"
        );
        assert_eq!(classify_install("linux", None, Some(""), false), "system");
        assert_eq!(
            classify_install("linux", Some("/tmp/x.AppImage"), Some("SYSTEM"), false),
            "appimage"
        );
        assert_eq!(
            classify_install("macos", None, Some("nonsense"), false),
            "bundle"
        );
    }
}
