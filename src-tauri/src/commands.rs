//! Tauri command surface — thin wrappers over `SessionManager` and `Store`,
//! plus the event payloads emitted to the frontend.

use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, Window};
use uuid::Uuid;

use crate::git::{self, BranchList, CommitInfo, FileStatusEntry, WorkingDiff};
use crate::pty::{SessionError, SessionManager};
use crate::store::{OverviewPanel, PersistedSession, ScheduledSession, Store};

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

/// Payload for the `session://forkable` event (#138): whether a session now has
/// forkable conversation history, so the UI can enable/disable Fork up front.
#[derive(Clone, Serialize)]
pub struct ForkablePayload {
    pub id: String,
    pub forkable: bool,
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
    prompt: Option<String>,
) -> Result<PersistedSession, SessionError> {
    // The coding agent for this session (#101). Until the Settings selector (the
    // follow-up) the frontend omits it, so it defaults to Claude.
    let agent = agent.unwrap_or_else(|| crate::agents::DEFAULT_AGENT_ID.to_string());
    // A non-blank initial prompt pre-seeds the session (#118 Canvas templates),
    // like a scheduled session (#93); omitted/blank → a plain new session.
    let prompt = prompt.filter(|p| !p.trim().is_empty());
    let info =
        manager.spawn_session_with_prompt(cwd.as_str(), name.clone(), prompt.as_deref(), &agent)?;
    let record = PersistedSession {
        id: info.id.clone(),
        claude_session_id: info.id,
        repo_path: cwd.clone(),
        name,
        created_at: now_secs(),
        worktree_parent: None,
        auto_name: None,
        has_been_active: false,
        agent,
        forked_from: None,
        // A freshly spawned session has no log yet → not forkable until its first
        // real turn materializes one (#138); the title worker flips it then.
        forkable: false,
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
        has_been_active: false,
        agent,
        forked_from: None,
        // A freshly spawned session has no log yet → not forkable until its first
        // real turn materializes one (#138); the title worker flips it then.
        forkable: false,
    };
    store
        .add_session(record.clone())
        .map_err(|e| SessionError::Io(e.to_string()))?;
    Ok(record)
}

/// Start an agent in an isolated worktree on a **new** branch `name` (from `base`,
/// empty = HEAD) of `repo` (#124, extends #74). Creates the branch + its worktree
/// folder via `git worktree add -b`, spawns `claude` there, and persists the record
/// with `worktree_parent = repo`. Branch-name validation surfaces as `SessionError::Git`.
#[tauri::command]
pub fn spawn_worktree_agent_new_branch(
    manager: State<'_, SessionManager>,
    store: State<'_, Store>,
    repo: String,
    name: String,
    base: String,
    agent: Option<String>,
) -> Result<PersistedSession, SessionError> {
    let agent = agent.unwrap_or_else(|| crate::agents::DEFAULT_AGENT_ID.to_string());
    let dest = worktree_path(&store, &repo, &name)?;
    git::worktree_add_new_branch(&repo, &name, &base, &dest).map_err(SessionError::Git)?;
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
        has_been_active: false,
        agent,
        forked_from: None,
        // A freshly spawned session has no log yet → not forkable until its first
        // real turn materializes one (#138); the title worker flips it then.
        forkable: false,
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
        git::worktree_remove(&parent, &dest, force).map_err(SessionError::Git)
    })
    .await
    .map_err(|e| SessionError::Io(e.to_string()))?
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
    // Gate on the agent's resume capability (#141): a Codex session can't be resumed
    // by id (no app-ownable identity), so Restart refuses cleanly rather than spawning
    // a CLI that would mis-handle `--resume`. Claude resumes exactly as before.
    if !crate::agents::agent_spec(&record.agent).supports_resume {
        return Err(SessionError::ResumeUnsupported(record.agent));
    }
    manager.resume_session(
        &record.claude_session_id,
        &record.repo_path,
        record.name.clone(),
        &record.agent,
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
#[tauri::command]
pub fn fork_session(
    manager: State<'_, SessionManager>,
    store: State<'_, Store>,
    source_id: String,
) -> Result<PersistedSession, SessionError> {
    let source = store
        .session(&source_id)
        .ok_or_else(|| SessionError::SessionNotFound(source_id.clone()))?;
    // Gate on the agent's resume/fork capability (#141): Codex can't fork (no
    // app-ownable session id), so refuse up front (the #142 UI also hides the button).
    if !crate::agents::agent_spec(&source.agent).supports_resume {
        return Err(SessionError::ResumeUnsupported(source.agent));
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
    };
    store
        .add_session(record.clone())
        .map_err(|e| SessionError::Io(e.to_string()))?;
    store
        .touch_recent(&source.repo_path)
        .map_err(|e| SessionError::Io(e.to_string()))?;
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

/// Add a folder to recents without spawning an agent (#172 sidebar background menu →
/// "New folder…"). Reuses `touch_recent` (deduped, capped, persisted) so the folder
/// shows as an empty repo group immediately and survives restart.
#[tauri::command]
pub fn add_recent(store: State<'_, Store>, path: String) -> Result<(), SessionError> {
    store
        .touch_recent(&path)
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

/// Saved Canvas templates (#117) — opaque JSON; `null` until first written.
#[tauri::command]
pub fn get_canvas_templates(store: State<'_, Store>) -> serde_json::Value {
    store.canvas_templates()
}

/// Replace the saved Canvas templates and persist (#117). Kept separate from the
/// `canvases` blob so a canvas write never clobbers templates.
#[tauri::command]
pub fn set_canvas_templates(
    store: State<'_, Store>,
    templates: serde_json::Value,
) -> Result<(), SessionError> {
    store
        .set_canvas_templates(templates)
        .map_err(|e| SessionError::Io(e.to_string()))
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
#[allow(clippy::too_many_arguments)] // a flat Tauri command surface (cwd + branch/new-branch + name/prompt/at/agent)
pub fn create_schedule(
    store: State<'_, Store>,
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
        // Worktree schedule (#198): create the isolated worktree at fire time and spawn
        // the seeded agent there (`worktree_parent = repo`, so it nests like any worktree
        // agent #74). A worktree-creation failure emits `schedule://error` and skips —
        // there's no folder to fall back into. The in-folder path (#93/#125) keeps its
        // best-effort branch checkout/create and spawns in `cwd`.
        let (spawn_cwd, worktree_parent) = if sched.worktree {
            match prepare_worktree_for_schedule(&store, &sched) {
                Ok(dest) => (dest, Some(sched.cwd.clone())),
                Err(message) => {
                    let _ = app.emit(
                        "schedule://error",
                        ScheduleErrorPayload {
                            id: sched.id,
                            message,
                        },
                    );
                    continue;
                }
            }
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
        match manager.spawn_session_with_prompt(
            &spawn_cwd,
            sched.name.clone(),
            sched.prompt.as_deref(),
            &sched.agent,
        ) {
            Ok(info) => {
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
                };
                let _ = store.add_session(record.clone());
                // Touch the repo (not the worktree folder) as the recent.
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
    if sched.create_branch {
        git::worktree_add_new_branch(
            &sched.cwd,
            branch,
            sched.branch_base.as_deref().unwrap_or(""),
            &dest,
        )?;
    } else if !dest.is_dir() {
        git::worktree_add(&sched.cwd, branch, &dest)?;
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

/// Lightweight per-file git status for the FileTree coloring (#252) — one
/// `git status --porcelain` per repo (no hunk parse, no per-untracked spawn, unlike
/// `working_diff`). A non-git / clean folder returns an empty list (fail-open, like
/// `working_diff`); the result is bounded server-side.
#[tauri::command]
pub fn file_statuses(repo: String) -> Vec<FileStatusEntry> {
    git::file_statuses(repo)
}

#[tauri::command]
pub fn list_branches(cwd: String) -> BranchList {
    git::list_branches(cwd)
}

/// The latest commits on `cwd`'s HEAD (#230) for the diff viewer's Commits source.
/// `limit` is clamped to `MAX_COMMITS` so the payload stays bounded on large histories
/// (the UI surfaces the cap). Non-git / no-commits → empty list (no error).
#[tauri::command]
pub fn list_commits(cwd: String, limit: Option<u32>) -> Vec<CommitInfo> {
    const MAX_COMMITS: u32 = 100;
    let limit = limit.unwrap_or(MAX_COMMITS).clamp(1, MAX_COMMITS);
    git::list_commits(cwd, limit)
}

/// The diff a single commit introduced (#230) — `git show <sha>` parsed into the same
/// `WorkingDiff` the body renders. An empty sha / git failure surfaces as a typed
/// `SessionError::Git`.
#[tauri::command]
pub fn commit_diff(cwd: String, sha: String) -> Result<WorkingDiff, SessionError> {
    git::commit_diff(&cwd, &sha).map_err(SessionError::Git)
}

/// Best-effort `git fetch --prune` for the new-session branch picker (#180) — a new
/// git network read that refreshes remote-tracking refs so `list_branches` can show
/// remote branches. Failure (offline / auth / no remote) surfaces as a typed
/// `SessionError::Git` the UI swallows (cached refs are shown instead).
#[tauri::command]
pub fn fetch_remotes(cwd: String) -> Result<(), SessionError> {
    git::fetch_remotes(&cwd).map_err(SessionError::Git)
}

/// Fast-forward the current branch of `cwd` to its upstream — `git pull --ff-only`
/// (#181), the sidebar repo / worktree "Pull" item. On success returns git's stdout
/// summary for the toast; a diverged / upstream-less / non-repo folder surfaces as a
/// typed `SessionError::Git { message }` shown as an error toast (no merge happens).
#[tauri::command]
pub fn pull_branch(cwd: String) -> Result<String, SessionError> {
    git::pull_ff(&cwd).map_err(SessionError::Git)
}

/// Check out a branch in `cwd` (the first git write — see #27). Errors surface as
/// a typed `SessionError::Git { message }` carrying git's explanation.
#[tauri::command]
pub fn checkout_branch(cwd: String, branch: String) -> Result<(), SessionError> {
    git::checkout_branch(&cwd, &branch).map_err(SessionError::Git)
}

/// Create + check out a new branch `name` from `base` (empty = HEAD) in `cwd` — the
/// branch-creation git write (#124). Validation (invalid / already-existing name,
/// unknown base) surfaces as `SessionError::Git { message }` for inline display.
#[tauri::command]
pub fn create_branch(cwd: String, name: String, base: String) -> Result<(), SessionError> {
    git::create_branch(&cwd, &name, &base).map_err(SessionError::Git)
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

/// Whether the sidebar is collapsed to the icon rail (#168); `None` until first set.
#[tauri::command]
pub fn get_sidebar_collapsed(store: State<'_, Store>) -> Option<bool> {
    store.sidebar_collapsed()
}

/// Persist the sidebar collapsed flag (#168).
#[tauri::command]
pub fn set_sidebar_collapsed(store: State<'_, Store>, collapsed: bool) -> Result<(), SessionError> {
    store
        .set_sidebar_collapsed(collapsed)
        .map_err(|e| SessionError::Io(e.to_string()))
}

/// The persisted top-level sidebar folder order (#211); empty until first set.
#[tauri::command]
pub fn get_repo_order(store: State<'_, Store>) -> Vec<String> {
    store.repo_order()
}

/// Persist the sidebar folder order (#211) — the user's drag-reordered repo paths.
#[tauri::command]
pub fn set_repo_order(store: State<'_, Store>, order: Vec<String>) -> Result<(), SessionError> {
    store
        .set_repo_order(order)
        .map_err(|e| SessionError::Io(e.to_string()))
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

/// Clear the recents list (#100 Settings → Data) and persist. Running sessions are
/// untouched — only the recently-used folder list is emptied.
#[tauri::command]
pub fn clear_recents(store: State<'_, Store>) -> Result<(), SessionError> {
    store
        .clear_recents()
        .map_err(|e| SessionError::Io(e.to_string()))
}

/// Open a folder or `http(s)` URL with the OS's default handler, **without a shell**
/// (so there is no injection vector) — macOS `open`, Windows `explorer.exe`. Both
/// respect the user's default browser for a URL and default file manager for a
/// folder. The single OS-open helper behind `open_data_folder` / `open_url` /
/// `reveal_path` (#100/#109/#129/#140).
fn os_open(target: impl AsRef<std::ffi::OsStr>) -> Result<(), SessionError> {
    #[cfg(not(windows))]
    let mut cmd = std::process::Command::new("open");
    #[cfg(windows)]
    let mut cmd = std::process::Command::new("explorer.exe");
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
#[tauri::command]
pub fn open_url(url: String) -> Result<(), SessionError> {
    if !is_http_url(&url) {
        return Err(SessionError::Io(format!(
            "refusing to open non-http(s) URL `{url}`"
        )));
    }
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut c = std::process::Command::new("open");
        c.arg(&url);
        c
    };
    #[cfg(target_os = "windows")]
    let mut command = {
        // `cmd /C start "" <url>` — `start`'s first quoted argument is the window
        // title, so the empty "" stops a quoted URL from being taken as the title.
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "start", "", url.as_str()]);
        c
    };
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let mut command = {
        let mut c = std::process::Command::new("xdg-open");
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
/// in Finder"/"…Explorer"), **selecting** the file in its containing folder rather
/// than launching it in its default app. The file counterpart of `reveal_path`:
/// macOS `open -R <path>`, Windows `explorer.exe /select,<path>`. Same no-shell
/// safety as `reveal_path` / `open_url` — spawned without a shell, and the path is
/// the app's own tracked panel data.
#[tauri::command]
pub fn reveal_file_in_finder(path: String) -> Result<(), SessionError> {
    #[cfg(not(windows))]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| SessionError::Io(e.to_string()))?;
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
        std::process::Command::new("explorer.exe")
            .raw_arg(explorer_select_arg(&path))
            .spawn()
            .map_err(|e| SessionError::Io(e.to_string()))?;
    }
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
#[tauri::command]
pub fn claude_version() -> Option<String> {
    binary_version("claude")
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
#[tauri::command]
pub fn agent_info(agent: String) -> AgentInfo {
    let spec = crate::agents::agent_spec(&agent);
    AgentInfo {
        id: spec.id.to_string(),
        display_name: spec.display_name.to_string(),
        binary_name: spec.binary_name.to_string(),
        install_hint: spec.install_hint.to_string(),
        supports_resume: spec.supports_resume,
        supports_auto_name: spec.supports_auto_name,
        version: binary_version(spec.binary_name),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
