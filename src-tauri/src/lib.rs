//! ReCue Tauri backend.
//!
//! Hosts the application window and the Tauri command/event surface the React
//! frontend talks to. The session/PTY core lives in `pty`, JSON persistence in
//! `store`; read-only git support is added by a later task.

mod agents;
mod autocontinue;
mod boot;
mod child_env;
mod commands;
mod container;
mod early_settings;
mod editors;
mod file_claims;
mod files;
mod git;
mod linux_desktop;
mod linux_gtk;
mod linux_webkit;
// Compiled on every OS so all hosts type-check + unit-test it (the tauri menu API
// is portable); only macOS *calls* it — Windows/Linux have no default menu.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
mod menu;
mod path_env;
mod primary;
mod pty;
mod skills;
mod store;
mod terminal_views;
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
    // Linux/WebKitGTK renderer workaround (#346, GPU-aware since #347): where the NVIDIA
    // blob actually renders the webview, WebKitGTK's DMA-BUF renderer makes the whole
    // thing crawl — laggy input echo, slow paint. Export the documented kill-switch before
    // GTK/WebKit initialize (and, like the PATH restore above, before any threads — env
    // mutation isn't thread-safe), but *only* where DMA-BUF is genuinely bad: the blob is
    // the sole renderer, GL is PRIME-routed to it, or we're in a VM with no native GPU. A
    // hybrid iGPU+dGPU laptop, nouveau, and any Mesa stack keep DMA-BUF (disabling it there
    // forces CPU rendering — it *was* the reported slowness). No-op on macOS/Windows; the
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

    // Linux desktop identity (#362): GTK derives the X11 WM_CLASS pair and the Wayland
    // app_id from GLib's program name (`argv[0]`'s basename) — which an AppImage's AppRun
    // is free to rewrite. Pin it to the constant the shipped `.desktop`'s StartupWMClass
    // states, so the window reliably groups under its launcher icon instead of showing up
    // as a second, iconless tile. Must run before `tauri::Builder` (GTK reads prgname at
    // init) and, like the three calls above, before any thread spawns. See `linux_desktop`.
    linux_desktop::pin_wm_class();

    // Login-shell PATH probe (#345/#360). A bundled `.app` launched from Finder/Dock
    // inherits launchd's minimal PATH (a Linux `.desktop`/AppImage launch, the session
    // env), so `claude` (Homebrew/npm/nvm/…) isn't found and every agent fails to start
    // — whereas `tauri dev`, launched from a terminal, inherits the full shell PATH.
    //
    // This **used to run synchronously here**, blocking the main thread for up to 3 s on
    // a `$SHELL -ilc` round-trip — so a heavy oh-my-zsh/nvm rc delayed the *window* by
    // that much. It now arms the probe and returns immediately: it resolves concurrently
    // with window creation and publishes into `path_env`'s in-process cell, which the
    // binary-lookup + child-spawn seams read (`effective_path` / `apply_path`). The
    // process env is never mutated — that would race a concurrent `getenv` — so only
    // spawn/resume ever waits, never the window.
    //
    // Must come **after** the two `set_var` calls above (it is the first thing in the
    // process to spawn a thread, and env mutation isn't thread-safe). Release + unix
    // only; a no-op in debug builds and on Windows (#140).
    path_env::start_probe();

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
            // Terminal-view registry (task 426): the multi-window smallest-wins PTY
            // size arbiter. Starts empty and stays empty until a frontend caller
            // attaches views (later epic cards), so it is inert on a normal run.
            app.manage(terminal_views::TerminalViews::default());
            // Same-file soft-claim registry (task 435): one window at a time is the
            // authoritative auto-save editor of a file; others render read-only.
            // Transient (never persisted), advisory only — starts and can stay empty.
            app.manage(file_claims::FileClaims::default());

            // Load persisted sessions + recents from the app-data dir.
            let store_path = app
                .path()
                .app_data_dir()
                .map(|dir| dir.join("sessions.json"))
                .unwrap_or_else(|_| PathBuf::from("recue-sessions.json"));
            app.manage(Store::load(&store_path));

            // Primary-window election (task 433): register the config-created window(s) —
            // today just "main". Windows created later register at their creation sites
            // (open_canvas_window; the 9/16 full-window command must follow the pattern).
            // The emit fires before any webview listens — harmless; the frontend's
            // `primary_window` snapshot fetch covers boot.
            app.manage(primary::Primary::default());
            {
                let mut labels: Vec<String> = app.webview_windows().keys().cloned().collect();
                labels.sort(); // HashMap order; deterministic for the single config window
                let handle = app.handle().clone();
                for label in &labels {
                    primary::register_window(&handle, label);
                }
            }

            // Rust-owned clean-exit forget + worktree cleanup (task 431). The
            // worktree-cleanup mutex serializes every ref-count-check → git-remove
            // pair (N windows and/or the exit path can never double-run
            // `git worktree remove`); the boot window mirrors the frontend's
            // `booting` flag — open only when persisted records exist (matching
            // `booting = boot.sessions.length > 0`), closed 4 s after the boot
            // resume pass returns (below), so a failed boot resume's code-0 exit
            // keeps its record + overlay instead of being auto-forgotten (#30/#63).
            app.manage(commands::WorktreeCleanupLock::default());
            app.manage(commands::BootWindow(std::sync::atomic::AtomicBool::new(
                !app.state::<Store>().sessions().is_empty(),
            )));

            // Startup flash (#348): the main window is created hidden (`visible: false`)
            // with a dark native background (tauri.conf.json). Re-color it to the persisted
            // theme *before* it is ever shown — so a light-theme user's window never flashes
            // dark — then let the frontend reveal it once React has painted (`reveal_window`),
            // with a Rust fallback in case the bundle never boots. Needs the Store, so it runs
            // right after it is managed. Platform-neutral (macOS/Windows/Linux).
            if let Some(window) = app.get_webview_window("main") {
                let color = commands::window_background(&app.state::<Store>());
                let _ = window.set_background_color(Some(color));
            }
            commands::schedule_reveal_fallback(app.handle(), "main");

            // Login-shell PATH cache (#360). Publish the previous launch's probe result
            // immediately when it still applies (same `$SHELL`, same rc-file mtime
            // fingerprint) so a steady-state boot never waits on the probe at all — then
            // persist the fresh result from a background thread once it lands. Runs
            // **before** the resume thread below, so a cache hit is already published by
            // the time the first `resume_session` asks for the PATH. The cache holds only
            // the raw *discovered* PATH; the merge against this launch's own PATH is
            // redone every boot. No-op in debug builds and on Windows (no probe armed).
            {
                let cached = app.state::<Store>().path_cache();
                path_env::seed_from_cache(cached.clone());

                let handle = app.handle().clone();
                thread::spawn(move || {
                    // Blocks until the probe lands (bounded); `None` when none ran or it
                    // failed — in which case the existing cache is deliberately kept.
                    if let Some(fresh) = path_env::await_probe() {
                        if cached.as_ref() != Some(&fresh) {
                            let _ = handle.state::<Store>().set_path_cache(fresh);
                        }
                    }
                });
            }

            // macOS app menu (keybind rework): swap the default menu's ⌘W Close
            // Window accelerator for ⇧⌘W so the webview receives plain ⌘W (the
            // rebindable close-panel keybind). Best-effort — on failure the
            // default menu stands (⌘W then closes the window, never a crash).
            // Windows/Linux create no default menu, so there is nothing to do.
            #[cfg(target_os = "macos")]
            if let Err(e) = menu::install(app) {
                eprintln!("[recue] menu setup failed (default menu kept): {e}");
            }

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
                            SessionEvent::Exited {
                                id,
                                code,
                                intentional,
                            } => {
                                // #63 clean-exit ownership (task 431): decided ONCE, here
                                // in Rust — a clean exit is consumed (record forgotten +
                                // `session://forgotten`), everything else emits
                                // `session://exited` exactly as before.
                                if commands::handle_session_exit(&handle, &id, code, intentional) {
                                    Ok(())
                                } else {
                                    handle.emit(
                                        "session://exited",
                                        commands::ExitPayload { id, code },
                                    )
                                }
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
                            SessionEvent::Size { id, cols, rows } => {
                                // The authoritative multi-window PTY grid (task 426),
                                // emitted only by the terminal-view arbiter. No frontend
                                // listener yet (later epic cards).
                                handle.emit(
                                    "session://size",
                                    commands::SizePayload { id, cols, rows },
                                )
                            }
                        };
                    }
                }
            });

            // Resume persisted sessions OFF the startup critical path so the
            // window appears immediately; each one reconnects as its PTY comes
            // up. Bounded-parallel (4 at a time) over one shared snapshot of the
            // claude projects dir (#355 — see `boot`). Best-effort: failures (e.g.
            // claude missing) leave the record in place for the UI to show (#30/#63).
            let resume = app.handle().clone();
            thread::spawn(move || {
                // Boot reap for dev-container sessions: kill containers a crashed
                // previous run left behind — strictly BEFORE boot resume spawns
                // replacements under the same `recue.session` labels. Gated on a
                // container record actually existing, so an install that never
                // containerized (or whose docker daemon is stopped) never pays a
                // `docker ps` on boot.
                if resume
                    .state::<Store>()
                    .sessions()
                    .iter()
                    .any(|s| s.container_image.is_some())
                {
                    container::kill_all_recue_containers();
                }
                // Persisted shell terminals (#72) can't resume — respawn them ONCE per app, in
                // Rust (task 432): the frontend no longer does this at boot, so N windows can
                // never double-spawn (= kill+replace) the same panel ids. Before the agent
                // resume pass: shell spawns are cheap, and shells were previously available the
                // moment the main window booted. Idempotent — already-registered ids are skipped.
                boot::respawn_shell_terminals(&resume);
                boot::resume_persisted_sessions(resume.clone());
                // Close the Rust #63 boot window (task 431) a fixed backstop after the
                // resume pass returns — mirroring the frontend's `RECONNECT_BACKSTOP_MS`
                // cap — so a failed boot resume's code-0 exit is never auto-forgotten.
                // Also runs when there were no records (clearing an already-false flag
                // is a no-op). `try_state`: never panic on teardown ordering.
                thread::sleep(std::time::Duration::from_millis(
                    commands::RECONNECT_BACKSTOP_MS,
                ));
                if let Some(boot_window) = resume.try_state::<commands::BootWindow>() {
                    boot_window
                        .0
                        .store(false, std::sync::atomic::Ordering::SeqCst);
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

            // Auto-continue engine (task 430): the ONE usage poller + arm/nudge
            // executor per app — Rust-owned so the epic's N windows can never
            // double-nudge or double-poll (the usage endpoint 429s below ~180s).
            // The `Shared` cache backs the `auto_continue_snapshot` boot fetch;
            // the `Poke` channel lets `set_settings` wake it so a
            // `showSessionUsage` / `autoContinueAfterLimit` change reacts within
            // one wake instead of the next 180s fetch.
            let (poke_tx, poke_rx) = mpsc::channel::<()>();
            app.manage(autocontinue::Poke(std::sync::Mutex::new(poke_tx)));
            app.manage(autocontinue::Shared::default());
            let engine = app.handle().clone();
            thread::spawn(move || autocontinue::run(engine, poke_rx));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::spawn_session,
            commands::spawn_terminal,
            commands::spawn_worktree_agent,
            commands::remove_worktree,
            commands::cleanup_worktree_if_empty,
            commands::resume_session,
            commands::fork_session,
            commands::write_stdin,
            commands::resize_pty,
            commands::attach_terminal,
            commands::detach_terminal,
            commands::propose_terminal_size,
            commands::claim_file,
            commands::release_file_claim,
            commands::file_claims,
            commands::kill_session,
            commands::rename_session,
            commands::set_session_auto_continue,
            commands::set_session_watch,
            commands::session_scrollback,
            commands::search_session_output,
            // The one batched boot read (#352) — additive; every command it batches
            // stays registered below for its other call sites.
            commands::boot_state,
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
            commands::reveal_window,
            commands::set_theme_background,
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
            commands::container_runtime_status,
            commands::ensure_container_image,
            commands::detect_editors,
            commands::open_in_editor,
            commands::platform,
            commands::install_kind,
            commands::windows_build,
            commands::renderer_diagnostics,
            autocontinue::auto_continue_snapshot,
            primary::primary_window,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|handle, event| {
            match event {
                // Clean shutdown (#31): kill every child PTY when the app exits so no
                // orphan `claude` processes are left behind.
                tauri::RunEvent::Exit => {
                    // Dev-container sweep: a PTY kill only reaches the docker *client*,
                    // so the containers themselves are killed via the docker CLI (by
                    // label), in parallel with kill_all — started FIRST so its
                    // `docker ps` round-trip overlaps kill_all's unix grace sleep. Safe
                    // w.r.t. the `silent` semantics: kill_all sets every session's
                    // silent flag in its first loop (microseconds) before any docker
                    // kill can land an exit. Bounded wait; resolves instantly when no
                    // container session ever ran (and the boot reap catches stragglers).
                    let sweep = container::spawn_kill_all_sweep();
                    handle.state::<SessionManager>().kill_all();
                    let _ = sweep.recv_timeout(std::time::Duration::from_millis(
                        container::CONTAINER_SWEEP_BOUND_MS,
                    ));
                }
                // Multi-window (task 426): a closing window (any kind — main,
                // canvas-*, future app windows) drops ALL of its terminal views so
                // its desired size can never clamp a PTY it no longer renders.
                // `try_state`: never panic during teardown ordering. (The per-window
                // `on_window_event` in `open_canvas_window` keeps its #84 re-dock
                // broadcast; this global hook is additive and label-generic.)
                tauri::RunEvent::WindowEvent {
                    label,
                    event: tauri::WindowEvent::Destroyed,
                    ..
                } => {
                    if let (Some(views), Some(manager)) = (
                        handle.try_state::<terminal_views::TerminalViews>(),
                        handle.try_state::<SessionManager>(),
                    ) {
                        views.purge_window(&manager, &label);
                    }
                    // Same-file edit guard (task 435): a closing window's soft claims
                    // are dropped so its files never stay read-only in other windows.
                    // try_state: teardown-safe, like the view purge above.
                    if let Some(claims) = handle.try_state::<file_claims::FileClaims>() {
                        claims.purge_window(handle, &label);
                    }
                    // Primary re-election (task 433): if the primary closed, the oldest
                    // surviving full window is promoted and broadcast — the new primary's
                    // frontend re-arms the once-per-app effects live (armPrimaryEffects).
                    // try_state inside; a shutdown-teardown emit into dying webviews is a
                    // `let _ =` no-op.
                    primary::unregister_window(handle, &label);
                }
                _ => {}
            }
        });
}
