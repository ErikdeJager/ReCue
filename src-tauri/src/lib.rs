//! ClaudeCue Tauri backend.
//!
//! Hosts the application window and the Tauri command/event surface the React
//! frontend talks to. The session/PTY core lives in `pty`, JSON persistence in
//! `store`; read-only git support is added by a later task.

mod commands;
mod files;
mod git;
mod pty;
mod store;

use std::path::PathBuf;
use std::sync::mpsc;
use std::thread;

use tauri::{Emitter, Manager};

use pty::{SessionEvent, SessionManager};
use store::Store;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // The session manager emits to a channel; a dedicated thread forwards
            // those events to the frontend as Tauri events.
            let (tx, rx) = mpsc::channel::<SessionEvent>();
            app.manage(SessionManager::new(tx));

            // Load persisted sessions + recents from the app-data dir.
            let store_path = app
                .path()
                .app_data_dir()
                .map(|dir| dir.join("sessions.json"))
                .unwrap_or_else(|_| PathBuf::from("claudecue-sessions.json"));
            app.manage(Store::load(&store_path));

            let handle = app.handle().clone();
            thread::spawn(move || {
                for event in rx {
                    let _ = match event {
                        SessionEvent::Output { id, bytes } => {
                            handle.emit("session://output", commands::OutputPayload { id, bytes })
                        }
                        SessionEvent::Exited { id, code } => {
                            handle.emit("session://exited", commands::ExitPayload { id, code })
                        }
                        SessionEvent::State { id, busy } => {
                            handle.emit("session://state", commands::StatePayload { id, busy })
                        }
                    };
                }
            });

            // Resume persisted sessions OFF the startup critical path so the
            // window appears immediately; each one reconnects as its PTY comes
            // up. Best-effort: failures (e.g. claude missing) leave the record
            // in place for the UI to show.
            let resume = app.handle().clone();
            thread::spawn(move || {
                let manager = resume.state::<SessionManager>();
                let store = resume.state::<Store>();
                for record in store.sessions() {
                    let _ = manager.resume_session(
                        &record.claude_session_id,
                        &record.repo_path,
                        record.name.clone(),
                    );
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::spawn_session,
            commands::resume_session,
            commands::write_stdin,
            commands::resize_pty,
            commands::kill_session,
            commands::session_scrollback,
            commands::list_sessions,
            commands::list_recents,
            commands::remove_recent,
            commands::list_repo_colors,
            commands::set_repo_color,
            commands::list_overview_panels,
            commands::set_overview_panels,
            commands::list_overview_order,
            commands::set_overview_order,
            commands::list_open_files,
            commands::set_open_files,
            commands::get_canvas_layout,
            commands::set_canvas_layout,
            commands::get_inspector_width,
            commands::set_inspector_width,
            commands::list_files,
            commands::read_text_file,
            commands::open_in_editor,
            commands::current_branch,
            commands::current_branches,
            commands::working_diff,
            commands::list_branches,
            commands::checkout_branch,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|handle, event| {
            // Clean shutdown (#31): kill every child PTY when the app exits so no
            // orphan `claude` processes are left behind.
            if let tauri::RunEvent::Exit = event {
                handle.state::<SessionManager>().kill_all();
            }
        });
}
