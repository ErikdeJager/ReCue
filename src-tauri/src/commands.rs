//! Tauri command surface — thin wrappers over `SessionManager` and `Store`,
//! plus the event payloads emitted to the frontend.

use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::State;

use crate::git::{self, BranchList, WorkingDiff};
use crate::pty::{self, SessionError, SessionManager};
use crate::store::{PersistedSession, Store};

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

#[tauri::command]
pub fn spawn_session(
    manager: State<'_, SessionManager>,
    store: State<'_, Store>,
    cwd: String,
    name: Option<String>,
) -> Result<PersistedSession, SessionError> {
    let info = manager.spawn_session(cwd.as_str(), name.clone())?;
    let record = PersistedSession {
        id: info.id.clone(),
        claude_session_id: info.id,
        repo_path: cwd.clone(),
        name,
        created_at: now_secs(),
    };
    store
        .add_session(record.clone())
        .map_err(|e| SessionError::Io(e.to_string()))?;
    store
        .touch_recent(&cwd)
        .map_err(|e| SessionError::Io(e.to_string()))?;
    Ok(record)
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

#[tauri::command]
pub fn open_in_editor(cwd: String) -> Result<(), SessionError> {
    pty::open_in_editor(&cwd)
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

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0)
}
