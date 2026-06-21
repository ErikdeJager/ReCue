//! Tauri command surface — thin wrappers over `SessionManager` and `Store`,
//! plus the event payloads emitted to the frontend.

use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, Window};
use uuid::Uuid;

use crate::git::{self, BranchList, WorkingDiff};
use crate::pty::{SessionError, SessionManager};
use crate::store::{OverviewPanel, PersistedSession, ScheduledSession, Store};

/// Payload for the `session://output` event.
#[derive(Clone, Serialize)]
pub struct OutputPayload {
    pub id: String,
    pub bytes: Vec<u8>,
}

/// Payload for the `session://exited` event.
#[derive(Clone, Serialize)]
pub struct ExitPayload {
    pub id: String,
    pub code: Option<i32>,
}

/// Payload for the `session://state` event — busy/idle (#42).
#[derive(Clone, Serialize)]
pub struct StatePayload {
    pub id: String,
    pub busy: bool,
}

/// Payload for the `session://name` event (#97): claude's latest auto-title for a
/// session, applied as the display label when the user hasn't set a custom name.
#[derive(Clone, Serialize)]
pub struct NamePayload {
    pub id: String,
    pub name: String,
}

/// Payload for the `canvas://windows` event (#84): the canvas ids that currently
/// have a detached window open. Every window listens so the main tab strip can
/// mark detached tabs and each window can recompute terminal ownership.
#[derive(Clone, Serialize)]
pub struct CanvasWindowsPayload {
    pub detached: Vec<String>,
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

#[tauri::command]
pub fn spawn_session(
    manager: State<'_, SessionManager>,
    store: State<'_, Store>,
    cwd: String,
    name: Option<String>,
    agent: Option<String>,
) -> Result<PersistedSession, SessionError> {
    // The coding agent for this session (#101). Until the Settings selector (the
    // follow-up) the frontend omits it, so it defaults to Claude.
    let agent = agent.unwrap_or_else(|| crate::agents::DEFAULT_AGENT_ID.to_string());
    let info = manager.spawn_session(cwd.as_str(), name.clone(), &agent)?;
    let record = PersistedSession {
        id: info.id.clone(),
        claude_session_id: info.id,
        repo_path: cwd.clone(),
        name,
        created_at: now_secs(),
        worktree_parent: None,
        auto_name: None,
        agent,
    };
    store
        .add_session(record.clone())
        .map_err(|e| SessionError::Io(e.to_string()))?;
    store
        .touch_recent(&cwd)
        .map_err(|e| SessionError::Io(e.to_string()))?;
    Ok(record)
}

/// Spawn a plain shell **terminal item** (#72) in `cwd` under the caller-chosen
/// `id` (the Overview panel's id). Unlike `spawn_session` this is not a `claude`
/// agent and is **not** persisted in `sessions.json` — the item lives in
/// `overview_panels` (frontend) and a fresh shell is respawned on boot. Kill it
/// with `kill_session` (the PTY registry is shared).
#[tauri::command]
pub fn spawn_terminal(
    manager: State<'_, SessionManager>,
    cwd: String,
    id: String,
) -> Result<(), SessionError> {
    manager.spawn_terminal(id, cwd.as_str())?;
    Ok(())
}

/// Start an agent in an **isolated git worktree** for an existing `branch` of
/// `repo` (#74). Creates the app-managed worktree folder if absent, reuses it
/// otherwise (multiple agents per worktree), spawns `claude` there, and persists
/// the record with `worktree_parent = repo` (its `repo_path` is the worktree).
#[tauri::command]
pub fn spawn_worktree_agent(
    manager: State<'_, SessionManager>,
    store: State<'_, Store>,
    repo: String,
    branch: String,
    agent: Option<String>,
) -> Result<PersistedSession, SessionError> {
    let agent = agent.unwrap_or_else(|| crate::agents::DEFAULT_AGENT_ID.to_string());
    let dest = worktree_path(&store, &repo, &branch)?;
    // `git worktree add` fails if the folder already exists, so only add when it
    // isn't there yet — an existing folder means we reuse the worktree.
    if !dest.is_dir() {
        git::worktree_add(&repo, &branch, &dest).map_err(SessionError::Git)?;
    }
    let dest_str = dest.to_string_lossy().to_string();
    let info = manager.spawn_session(dest_str.as_str(), None, &agent)?;
    let record = PersistedSession {
        id: info.id.clone(),
        claude_session_id: info.id,
        repo_path: dest_str,
        name: None,
        created_at: now_secs(),
        worktree_parent: Some(repo),
        auto_name: None,
        agent,
    };
    store
        .add_session(record.clone())
        .map_err(|e| SessionError::Io(e.to_string()))?;
    Ok(record)
}

/// Remove the worktree at `dest` from its `parent` repo (#74). Called by the
/// frontend only after the worktree's last active agent is removed. `force` is
/// needed when the worktree has uncommitted changes; a non-forced call fails on
/// a dirty tree, which the UI uses as the confirm guard.
#[tauri::command]
pub fn remove_worktree(parent: String, dest: String, force: bool) -> Result<(), SessionError> {
    git::worktree_remove(&parent, &dest, force).map_err(SessionError::Git)
}

#[tauri::command]
pub fn write_stdin(
    manager: State<'_, SessionManager>,
    id: String,
    data: String,
) -> Result<(), SessionError> {
    manager.write_stdin(&id, &data)
}

#[tauri::command]
pub fn resize_pty(
    manager: State<'_, SessionManager>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), SessionError> {
    manager.resize_pty(&id, cols, rows)
}

#[tauri::command]
pub fn resume_session(
    manager: State<'_, SessionManager>,
    store: State<'_, Store>,
    id: String,
) -> Result<PersistedSession, SessionError> {
    let record = store
        .session(&id)
        .ok_or_else(|| SessionError::SessionNotFound(id.clone()))?;
    manager.resume_session(
        &record.claude_session_id,
        &record.repo_path,
        record.name.clone(),
        &record.agent,
    )?;
    Ok(record)
}

#[tauri::command]
pub fn kill_session(
    manager: State<'_, SessionManager>,
    store: State<'_, Store>,
    id: String,
) -> Result<(), SessionError> {
    // The session may not be live (e.g. it failed to resume on boot); forget it
    // from the store either way so Remove = kill + forget and it never reappears.
    let _ = manager.kill_session(&id);
    store
        .remove_session(&id)
        .map_err(|e| SessionError::Io(e.to_string()))
}

/// Set (or clear, when blank) a session's custom display name and persist (#57).
#[tauri::command]
pub fn rename_session(
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
        .map_err(|e| SessionError::Io(e.to_string()))
}

#[tauri::command]
pub fn session_scrollback(
    manager: State<'_, SessionManager>,
    id: String,
) -> Result<Vec<u8>, SessionError> {
    manager.scrollback(&id)
}

#[tauri::command]
pub fn list_sessions(store: State<'_, Store>) -> Vec<PersistedSession> {
    store.sessions()
}

#[tauri::command]
pub fn list_recents(store: State<'_, Store>) -> Vec<String> {
    store.recents()
}

/// Drop a folder from recents (the "Forget" action, #31) so it doesn't reappear.
#[tauri::command]
pub fn remove_recent(store: State<'_, Store>, path: String) -> Result<(), SessionError> {
    store
        .remove_recent(&path)
        .map_err(|e| SessionError::Io(e.to_string()))
}

#[tauri::command]
pub fn list_repo_colors(store: State<'_, Store>) -> std::collections::HashMap<String, String> {
    store.repo_colors()
}

/// Assign a repo's color identity (#35). The color is validated as a hex string
/// so an untrusted IPC value can't store arbitrary content.
#[tauri::command]
pub fn set_repo_color(
    store: State<'_, Store>,
    path: String,
    color: String,
) -> Result<(), SessionError> {
    if !is_hex_color(&color) {
        return Err(SessionError::Io(format!("invalid color `{color}`")));
    }
    store
        .set_repo_color(&path, &color)
        .map_err(|e| SessionError::Io(e.to_string()))
}

#[tauri::command]
pub fn list_files(repo: String) -> Vec<String> {
    crate::files::list_files(repo)
}

/// Read a repo-relative text file for the file viewer (#40/#44); the path is
/// validated to stay inside `repo` (rejects traversal).
#[tauri::command]
pub fn read_text_file(repo: String, file: String) -> Result<String, SessionError> {
    crate::files::read_text_file(&repo, &file).map_err(SessionError::Io)
}

#[tauri::command]
pub fn list_overview_panels(
    store: State<'_, Store>,
) -> std::collections::HashMap<String, Vec<OverviewPanel>> {
    store.overview_panels()
}

/// Replace a repo's Overview panel layout (#38) and persist.
#[tauri::command]
pub fn set_overview_panels(
    store: State<'_, Store>,
    path: String,
    panels: Vec<OverviewPanel>,
) -> Result<(), SessionError> {
    store
        .set_overview_panels(&path, panels)
        .map_err(|e| SessionError::Io(e.to_string()))
}

#[tauri::command]
pub fn list_overview_order(
    store: State<'_, Store>,
) -> std::collections::HashMap<String, Vec<String>> {
    store.overview_order()
}

/// Replace a repo's Overview drag-reorder order (#43) and persist.
#[tauri::command]
pub fn set_overview_order(
    store: State<'_, Store>,
    path: String,
    order: Vec<String>,
) -> Result<(), SessionError> {
    store
        .set_overview_order(&path, order)
        .map_err(|e| SessionError::Io(e.to_string()))
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

/// Replace the multi-canvas tab state (#58) and persist, then broadcast
/// `canvas://changed` so every window (main + detached canvas windows, #84) stays
/// in sync. The **main** window is authoritative for the active tab: a write from
/// a detached window (which edits only its own canvas's layout) keeps the persisted
/// `activeId` and replaces just the `canvases` array, so a detached layout edit
/// can't hijack which tab the main window shows.
#[tauri::command]
pub fn set_canvases(
    app: AppHandle,
    window: Window,
    store: State<'_, Store>,
    state: serde_json::Value,
) -> Result<(), SessionError> {
    let final_state = if window.label() == "main" {
        state
    } else {
        let mut current = store.canvases();
        match (current.as_object_mut(), state.get("canvases")) {
            (Some(obj), Some(list)) => {
                obj.insert("canvases".to_string(), list.clone());
                current
            }
            // No prior object (shouldn't happen — main migrates first): fall back.
            _ => state,
        }
    };
    store
        .set_canvases(final_state.clone())
        .map_err(|e| SessionError::Io(e.to_string()))?;
    let _ = app.emit("canvas://changed", final_state);
    Ok(())
}

/// The canvas ids that currently have a detached window (#84) — derived from the
/// live window labels (`canvas-<id>`), optionally excluding one label (used when a
/// window is closing and may still appear in the registry).
fn detached_canvas_ids(app: &AppHandle, exclude: Option<&str>) -> Vec<String> {
    app.webview_windows()
        .keys()
        .filter(|label| Some(label.as_str()) != exclude)
        .filter_map(|label| label.strip_prefix("canvas-").map(str::to_string))
        .collect()
}

/// Tell every window which canvases are detached (#84).
fn broadcast_canvas_windows(app: &AppHandle, exclude: Option<&str>) {
    let _ = app.emit(
        "canvas://windows",
        CanvasWindowsPayload {
            detached: detached_canvas_ids(app, exclude),
        },
    );
}

/// Open (or focus, if already open) a detached window showing one canvas (#84).
/// The window loads a canvas-only route (`index.html?canvas=<id>`) under the label
/// `canvas-<id>`; closing it re-docks the canvas by re-broadcasting the (now
/// smaller) detached set. Created from Rust, so no JS window-create permission is
/// needed — only the `canvas-*` capability that lets the new window talk back.
#[tauri::command]
pub fn open_canvas_window(app: AppHandle, id: String, title: String) -> Result<(), SessionError> {
    let label = format!("canvas-{id}");
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.set_focus();
        return Ok(());
    }
    let url = format!("index.html?canvas={id}");
    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title(title)
        .inner_size(1000.0, 760.0)
        .min_inner_size(640.0, 480.0)
        .build()
        .map_err(|e| SessionError::Io(e.to_string()))?;
    // Re-dock on close: when this window is destroyed, re-broadcast the detached
    // set (excluding this label) so the main window reclaims the canvas + terminals.
    let on_close = app.clone();
    let closing = label.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            broadcast_canvas_windows(&on_close, Some(&closing));
        }
    });
    broadcast_canvas_windows(&app, None);
    Ok(())
}

/// Focus an already-detached canvas window (#84) — used by ⌘-jump (#76) and a
/// click on a detached tab. Returns false if no such window exists.
#[tauri::command]
pub fn focus_canvas_window(app: AppHandle, id: String) -> bool {
    match app.get_webview_window(&format!("canvas-{id}")) {
        Some(window) => window.set_focus().is_ok(),
        None => false,
    }
}

/// Close a detached canvas window (#84) — used when its canvas tab is closed in
/// the main window, so the window self-closes (its `Destroyed` handler re-docks).
#[tauri::command]
pub fn close_canvas_window(app: AppHandle, id: String) {
    if let Some(window) = app.get_webview_window(&format!("canvas-{id}")) {
        let _ = window.close();
    }
}

/// The currently-detached canvas ids (#84). A window fetches this on startup since
/// it may have missed the `canvas://windows` broadcast that fired before it began
/// listening.
#[tauri::command]
pub fn list_canvas_windows(app: AppHandle) -> Vec<String> {
    detached_canvas_ids(&app, None)
}

/// Create a scheduled session (#93): persist a record that the poll loop fires at
/// `at` (unix secs). `branch` (a non-current branch to check out), `name`, and
/// `prompt` are optional; the backend owns the id + `created_at`.
#[tauri::command]
pub fn create_schedule(
    store: State<'_, Store>,
    cwd: String,
    branch: Option<String>,
    name: Option<String>,
    prompt: Option<String>,
    at: u64,
    agent: Option<String>,
) -> Result<ScheduledSession, SessionError> {
    let sched = ScheduledSession {
        id: Uuid::new_v4().to_string(),
        cwd,
        branch: branch.filter(|b| !b.is_empty()),
        name: name.filter(|n| !n.trim().is_empty()),
        prompt: prompt.filter(|p| !p.trim().is_empty()),
        fire_at: at,
        created_at: now_secs(),
        agent: agent.unwrap_or_else(|| crate::agents::DEFAULT_AGENT_ID.to_string()),
    };
    store
        .add_schedule(sched.clone())
        .map_err(|e| SessionError::Io(e.to_string()))?;
    Ok(sched)
}

/// All pending scheduled sessions (#93).
#[tauri::command]
pub fn list_schedules(store: State<'_, Store>) -> Vec<ScheduledSession> {
    store.schedules()
}

/// Cancel a pending scheduled session (#93).
#[tauri::command]
pub fn cancel_schedule(store: State<'_, Store>, id: String) -> Result<(), SessionError> {
    store
        .remove_schedule(&id)
        .map_err(|e| SessionError::Io(e.to_string()))
}

/// Update a schedule's prompt / name / fire time (#93) — the full surface #94's
/// panel edits (so #94 needs no Rust changes).
#[tauri::command]
pub fn update_schedule(
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
        .map_err(|e| SessionError::Io(e.to_string()))
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
        if let Some(branch) = &sched.branch {
            // Best-effort checkout; a failure still spawns in the folder.
            let _ = git::checkout_branch(&sched.cwd, branch);
        }
        match manager.spawn_session_with_prompt(
            &sched.cwd,
            sched.name.clone(),
            sched.prompt.as_deref(),
            &sched.agent,
        ) {
            Ok(info) => {
                let record = PersistedSession {
                    id: info.id.clone(),
                    claude_session_id: info.id,
                    repo_path: sched.cwd.clone(),
                    name: sched.name.clone(),
                    created_at: now_secs(),
                    worktree_parent: None,
                    auto_name: None,
                    agent: sched.agent.clone(),
                };
                let _ = store.add_session(record.clone());
                let _ = store.touch_recent(&sched.cwd);
                let _ = app.emit(
                    "schedule://fired",
                    ScheduleFiredPayload {
                        id: sched.id,
                        session: record,
                    },
                );
            }
            Err(error) => {
                let _ = app.emit(
                    "schedule://error",
                    ScheduleErrorPayload {
                        id: sched.id,
                        message: error.to_string(),
                    },
                );
            }
        }
    }
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

#[tauri::command]
pub fn current_branch(cwd: String) -> String {
    git::current_branch(cwd)
}

#[tauri::command]
pub fn current_branches(paths: Vec<String>) -> std::collections::HashMap<String, String> {
    git::current_branches(&paths)
}

#[tauri::command]
pub fn working_diff(cwd: String) -> WorkingDiff {
    git::working_diff(cwd)
}

#[tauri::command]
pub fn list_branches(cwd: String) -> BranchList {
    git::list_branches(cwd)
}

/// Check out a branch in `cwd` (the first git write — see #27). Errors surface as
/// a typed `SessionError::Git { message }` carrying git's explanation.
#[tauri::command]
pub fn checkout_branch(cwd: String, branch: String) -> Result<(), SessionError> {
    git::checkout_branch(&cwd, &branch).map_err(SessionError::Git)
}

/// Two-dot branch comparison for the diff viewer (#81) — `git diff base target`,
/// rendered in the same diff body as `working_diff`.
#[tauri::command]
pub fn compare_branches(
    cwd: String,
    base: String,
    target: String,
) -> Result<WorkingDiff, SessionError> {
    git::compare_branches(&cwd, &base, &target).map_err(SessionError::Git)
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
        .join(sanitize_seg(branch)))
}

// --- Application settings (#100) ---

/// The persisted application settings blob (#100) — opaque JSON; `null` until the
/// frontend first saves (which writes its TS-side defaults).
#[tauri::command]
pub fn get_settings(store: State<'_, Store>) -> serde_json::Value {
    store.settings()
}

/// Replace the application settings (#100) and persist.
#[tauri::command]
pub fn set_settings(
    store: State<'_, Store>,
    settings: serde_json::Value,
) -> Result<(), SessionError> {
    store
        .set_settings(settings)
        .map_err(|e| SessionError::Io(e.to_string()))
}

/// The persisted sidebar width in px (#108); `None` until first set.
#[tauri::command]
pub fn get_sidebar_width(store: State<'_, Store>) -> Option<u32> {
    store.sidebar_width()
}

/// Persist the sidebar width (#108) — stored as-is; the frontend clamps.
#[tauri::command]
pub fn set_sidebar_width(store: State<'_, Store>, width: u32) -> Result<(), SessionError> {
    store
        .set_sidebar_width(width)
        .map_err(|e| SessionError::Io(e.to_string()))
}

/// Clear the recents list (#100 Settings → Data) and persist. Running sessions are
/// untouched — only the recently-used folder list is emptied.
#[tauri::command]
pub fn clear_recents(store: State<'_, Store>) -> Result<(), SessionError> {
    store
        .clear_recents()
        .map_err(|e| SessionError::Io(e.to_string()))
}

/// Reveal the app-data directory (where `sessions.json` lives) in Finder (#100
/// Settings → Data). macOS `open`; creates the dir first so it always succeeds.
#[tauri::command]
pub fn open_data_folder(store: State<'_, Store>) -> Result<(), SessionError> {
    let dir = store
        .data_dir()
        .ok_or_else(|| SessionError::Io("no app data directory".to_string()))?;
    let _ = std::fs::create_dir_all(dir);
    std::process::Command::new("open")
        .arg(dir)
        .spawn()
        .map_err(|e| SessionError::Io(e.to_string()))?;
    Ok(())
}

/// The ClaudeCue app version (#100 Settings → About), from the crate version.
#[tauri::command]
pub fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// `claude --version` (#100 Settings → About). Best-effort: `None` if the CLI is
/// missing or errors, so the UI just omits the line.
#[tauri::command]
pub fn claude_version() -> Option<String> {
    let output = std::process::Command::new("claude")
        .arg("--version")
        .output()
        .ok()?;
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
