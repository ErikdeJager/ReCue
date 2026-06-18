//! ClaudeCue Tauri backend.
//!
//! Hosts the application window and the Tauri command/event surface the React
//! frontend talks to. The session/PTY core, JSON persistence, and read-only git
//! support are added by later tasks; this is the runnable empty shell.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Commands (spawn_session, write_stdin, current_branch, ...) are
        // registered here by later tasks via `.invoke_handler(...)`.
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
