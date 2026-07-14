//! ReCue Tauri backend.
//!
//! Hosts the application window and the Tauri command/event surface the React
//! frontend talks to. The session/PTY core lives in `pty`, JSON persistence in
//! `store`; read-only git support is added by a later task.

mod agents;
mod child_env;
mod commands;
mod files;
mod git;
mod linux_gtk;
mod linux_webkit;
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

/// Upper bound on how many queued session events one forwarder pass drains before
/// emitting (#346) — keeps a single coalesce/emit pass bounded under a sustained
/// output storm so lifecycle events never wait behind an unbounded drain.
const MAX_EVENT_DRAIN: usize = 512;

/// Best-effort: reset ReCue's microphone / speech-recognition TCC grants so macOS re-asks
/// once after an update (#321). macOS pins a permission grant to the app's code signature;
/// when an old ad-hoc build is replaced by a properly-signed one the signature changes and a
/// stale/denied grant can otherwise suppress the fresh prompt. `tccutil` runs as the user
/// (no admin), and any failure is ignored — the signature change alone usually re-prompts.
/// Protected folders have no `tccutil` service name, so those rely on the signature change
/// (documented in docs/macos-permissions.md). macOS-only.
#[cfg(target_os = "macos")]
fn reprompt_macos_permissions() {
    for service in ["Microphone", "SpeechRecognition"] {
        let _ = std::process::Command::new("tccutil")
            .args(["reset", service, "com.recue.app"])
            .status();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // A bundled `.app` launched from Finder/Dock inherits launchd's minimal PATH, so
    // `claude` (Homebrew/npm/nvm/…) isn't found and every agent fails to start —
    // whereas `tauri dev`, launched from a terminal, inherits the full shell PATH.
    // Restore the login-shell PATH *before* any threads spawn (env mutation isn't
    // thread-safe). See `path_env`.
    path_env::restore_user_path();

    // Linux/WebKitGTK renderer workaround (#346): on NVIDIA's proprietary driver (and
    // in VMs) WebKitGTK's DMA-BUF renderer makes the whole webview crawl — laggy input
    // echo, slow paint. Export the documented kill-switch before GTK/WebKit initialize
    // (and, like the PATH restore above, before any threads — env mutation isn't
    // thread-safe). No-op on macOS/Windows and on healthy AMD/Intel Mesa stacks; the
    // user's own env and `RECUE_DISABLE_DMABUF` override it. See `linux_webkit`.
    linux_webkit::apply_webkit_env_workarounds();

    // Linux/GTK dialog theming (#349): the AppImage's bundled GTK hook forces
    // `GTK_THEME=Adwaita:light` unless the *system* theme's name literally contains
    // "dark", the dialog plugin's rfd backend builds its dialogs as in-process GTK3
    // widgets, and `GTK_THEME` outranks every GtkSettings property — so the folder/open/
    // save dialogs came up white in a dark app. Correct the variable here, from ReCue's
    // own theme, before GTK initializes (and, like the two calls above, before any thread
    // spawns). No-op on macOS/Windows and outside an AppImage; the user's own
    // `APPIMAGE_GTK_THEME` / `RECUE_GTK_THEME` override it. See `linux_gtk`.
    linux_gtk::apply_gtk_theme_env();

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
        // Native OS notifications (#336): backs per-agent "watch" — a native toast
        // when a watched agent finishes a turn / needs input. Cross-platform (macOS
        // + Windows), fired from the frontend.
        .plugin(tauri_plugin_notification::init())
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

            // One-time post-update permission re-prompt (macOS, #321). When a user updates
            // from an old ad-hoc build into a properly-signed one, the code signature
            // (Designated Requirement) changes so macOS should re-ask — but a stale/denied
            // TCC row from the broken build can suppress the fresh prompt. Best-effort reset
            // the mic grant once so the user is re-asked (and now "Allow" actually works);
            // the persisted flag then keeps it from nagging on later boots. macOS-only;
            // no-op elsewhere. Runs before any session (mic) work.
            #[cfg(target_os = "macos")]
            {
                let store = app.state::<Store>();
                if !store.perm_reprompt_done() {
                    reprompt_macos_permissions();
                    let _ = store.set_perm_reprompt_done();
                }
            }

            let handle = app.handle().clone();
            thread::spawn(move || {
                // Drain-then-coalesce (#346): block for the next event, then scoop up
                // whatever is already queued (`try_recv` never blocks, so a lone event
                // forwards with unchanged latency) and merge consecutive contiguous
                // same-session Output runs (`pty::coalesce_output_events`, order-
                // preserving). Each `emit` is an evaluate-JS on the webview main
                // thread — costliest on Linux/WebKitGTK — so under a TUI repaint storm
                // this collapses hundreds of per-8KB emits/sec into a few, keeping
                // keystroke echo responsive instead of queueing behind output events.
                while let Ok(first) = rx.recv() {
                    let mut batch = vec![first];
                    while batch.len() < MAX_EVENT_DRAIN {
                        match rx.try_recv() {
                            Ok(event) => batch.push(event),
                            Err(_) => break,
                        }
                    }
                    for event in pty::coalesce_output_events(batch) {
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
            // Recurring sessions (#294) share the same poll tick: fire any due
            // recurring records (rotate their child agent) alongside due schedules,
            // and catch up overdue ones on the first tick after boot.
            let scheduler = app.handle().clone();
            thread::spawn(move || loop {
                thread::sleep(std::time::Duration::from_secs(SCHEDULE_POLL_SECS));
                commands::fire_due_schedules(&scheduler);
                commands::fire_due_recurrings(&scheduler);
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
            commands::set_session_auto_continue,
            commands::set_session_watch,
            commands::session_scrollback,
            commands::search_session_output,
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
            commands::create_recurring,
            commands::list_recurrings,
            commands::cancel_recurring,
            commands::update_recurring,
            commands::list_dir,
            commands::search_files,
            commands::search_file_contents,
            commands::read_text_file,
            commands::write_text_file,
            commands::move_into_repo,
            commands::create_dir,
            commands::delete_path,
            commands::rename_path,
            commands::add_to_gitignore,
            commands::list_skills,
            commands::file_exists,
            commands::dir_exists,
            commands::is_git_repo,
            commands::current_branch,
            commands::current_branches,
            commands::github_web_urls,
            commands::diff_line_counts,
            commands::branch_ahead_behind,
            commands::working_diff,
            commands::file_statuses,
            commands::file_diff,
            commands::list_branches,
            commands::list_commits,
            commands::commit_diff,
            commands::fetch_remotes,
            commands::pull_branch,
            commands::checkout_branch,
            commands::create_branch,
            commands::clone_repo,
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
