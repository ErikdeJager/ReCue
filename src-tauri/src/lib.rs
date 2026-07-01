//! ReCue Tauri backend.
//!
//! Hosts the application window and the Tauri command/event surface the React
//! frontend talks to. The session/PTY core lives in `pty`, JSON persistence in
//! `store`; read-only git support is added by a later task.

mod agents;
mod commands;
mod files;
mod git;
mod path_env;
mod pty;
mod skills;
mod store;
mod title;
mod usage;

use std::path::PathBuf;
use std::sync::mpsc;
use std::thread;

use tauri::{Emitter, Manager};

use pty::{SessionEvent, SessionManager};
use store::Store;

/// How often the #93 scheduler polls for due schedules. A few seconds is plenty
/// for a one-shot launcher and keeps boot catch-up prompt without busy-spinning.
const SCHEDULE_POLL_SECS: u64 = 5;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // A bundled `.app` launched from Finder/Dock inherits launchd's minimal PATH, so
    // `claude` (Homebrew/npm/nvm/…) isn't found and every agent fails to start —
    // whereas `tauri dev`, launched from a terminal, inherits the full shell PATH.
    // Restore the login-shell PATH *before* any threads spawn (env mutation isn't
    // thread-safe). See `path_env`.
    path_env::restore_user_path();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // In-app auto-update skeleton (#190): the updater + process (relaunch)
        // plugins. Inert today — `tauri.conf.json` carries a placeholder pubkey and
        // `createUpdaterArtifacts` is off, so `check()` finds no signed release until
        // a real signing keypair is generated (deferred).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // OS clipboard (#220): backs terminal paste on Windows — JS reads text
        // (capability-gated), `save_clipboard_image` reads the image Rust-side.
        .plugin(tauri_plugin_clipboard_manager::init())
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
                .unwrap_or_else(|_| PathBuf::from("recue-sessions.json"));
            app.manage(Store::load(&store_path));

            let handle = app.handle().clone();
            thread::spawn(move || {
                for event in rx {
                    let _ = match event {
                        SessionEvent::Output { id, bytes, offset } => {
                            // base64-encode here (off the per-session reader thread) so the
                            // `session://output` payload is a compact string, not a multi-KB
                            // JSON integer array the WebView main thread must JSON.parse (#261).
                            handle.emit(
                                "session://output",
                                commands::OutputPayload {
                                    id,
                                    b64: commands::encode_output(&bytes),
                                    offset,
                                },
                            )
                        }
                        SessionEvent::Exited { id, code } => {
                            handle.emit("session://exited", commands::ExitPayload { id, code })
                        }
                        SessionEvent::State { id, busy } => {
                            // Record the first activity (#112): on the first busy=true
                            // we persist `has_been_active` so a previously-active agent
                            // shows the "finished / needs input" (yellow) indicator
                            // immediately on next boot. Persists only on the false→true
                            // transition (a no-op afterward), off the emit hot path.
                            if busy {
                                let _ = handle.state::<Store>().mark_session_active(&id);
                            }
                            handle.emit("session://state", commands::StatePayload { id, busy })
                        }
                        SessionEvent::Name { id, name } => {
                            // Persist claude's auto-title (#97) so it shows on next
                            // boot before the first refresh, then notify the UI. The
                            // user's custom name (#57) is a separate field and wins.
                            let _ = handle
                                .state::<Store>()
                                .set_auto_name(&id, Some(name.clone()));
                            handle.emit("session://name", commands::NamePayload { id, name })
                        }
                        SessionEvent::Forkable { id, forkable } => {
                            // Persist forkability (#138) — persist-on-change inside
                            // set_forkable — then notify the UI so the Fork affordance
                            // enables/disables up front, on the #97 title cadence.
                            let _ = handle.state::<Store>().set_forkable(&id, forkable);
                            handle.emit(
                                "session://forkable",
                                commands::ForkablePayload { id, forkable },
                            )
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
                    let spec = crate::agents::agent_spec(&record.agent);
                    // Only resume agents that support id-based resume (#141). A Codex
                    // record has no app-ownable session id, so resuming by id would
                    // fail/garble — leave it dormant (the record persists; the user can
                    // relaunch it as a fresh session). Claude resumes exactly as before.
                    if spec.supports_resume {
                        let _ = manager.resume_session(
                            &record.claude_session_id,
                            &record.repo_path,
                            record.name.clone(),
                            &record.agent,
                        );
                    }
                    // Seed forkability once at boot (#138): read the on-disk log so a
                    // resumed session **with** history shows Fork available immediately,
                    // rather than waiting for its first busy→idle edge. A non-claude-log
                    // agent (Codex, #141) is never forkable — no glob. Persist-on-change,
                    // then notify the UI (the persisted value also covers a missed emit).
                    let forkable = spec.supports_auto_name
                        && crate::title::has_conversation(&record.claude_session_id);
                    let _ = store.set_forkable(&record.id, forkable);
                    let _ = resume.emit(
                        "session://forkable",
                        commands::ForkablePayload {
                            id: record.id.clone(),
                            forkable,
                        },
                    );
                }
            });

            // Scheduled sessions (#93): a poll loop fires due schedules into live
            // agents. Polling (vs per-schedule timers) handles create/update/cancel
            // uniformly and catches up on boot — any schedule whose time passed
            // while the app was closed fires on the first tick.
            let scheduler = app.handle().clone();
            thread::spawn(move || loop {
                thread::sleep(std::time::Duration::from_secs(SCHEDULE_POLL_SECS));
                commands::fire_due_schedules(&scheduler);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::spawn_session,
            commands::spawn_terminal,
            commands::spawn_worktree_agent,
            commands::remove_worktree,
            commands::resume_session,
            commands::fork_session,
            commands::write_stdin,
            commands::resize_pty,
            commands::kill_session,
            commands::rename_session,
            commands::session_scrollback,
            commands::list_sessions,
            commands::list_recents,
            commands::remove_recent,
            commands::add_recent,
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
            commands::get_canvases,
            commands::set_canvases,
            commands::get_canvas_templates,
            commands::set_canvas_templates,
            commands::open_canvas_window,
            commands::focus_canvas_window,
            commands::close_canvas_window,
            commands::list_canvas_windows,
            commands::create_schedule,
            commands::list_schedules,
            commands::cancel_schedule,
            commands::update_schedule,
            commands::fire_schedule_now,
            commands::list_dir,
            commands::search_files,
            commands::search_file_contents,
            commands::read_text_file,
            commands::write_text_file,
            commands::move_into_repo,
            commands::create_dir,
            commands::delete_path,
            commands::rename_path,
            commands::list_skills,
            commands::file_exists,
            commands::is_git_repo,
            commands::current_branch,
            commands::current_branches,
            commands::working_diff,
            commands::file_statuses,
            commands::list_branches,
            commands::list_commits,
            commands::commit_diff,
            commands::fetch_remotes,
            commands::pull_branch,
            commands::checkout_branch,
            commands::create_branch,
            commands::spawn_worktree_agent_new_branch,
            commands::compare_branches,
            commands::get_settings,
            commands::set_settings,
            commands::get_sidebar_width,
            commands::set_sidebar_width,
            commands::get_sidebar_collapsed,
            commands::set_sidebar_collapsed,
            commands::get_repo_order,
            commands::set_repo_order,
            commands::get_diff_seen,
            commands::set_diff_seen,
            commands::get_last_version,
            commands::set_last_version,
            commands::clear_recents,
            commands::open_data_folder,
            commands::open_url,
            commands::save_clipboard_image,
            commands::reveal_path,
            commands::reveal_file_in_finder,
            commands::app_version,
            commands::claude_version,
            commands::agent_info,
            commands::platform,
            commands::windows_build,
            usage::claude_session_usage,
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
