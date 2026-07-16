//! Boot-time resume of persisted sessions (#355).
//!
//! On boot every persisted agent record is reconnected (`SessionManager::resume_session`)
//! and its forkability (#138) is seeded from claude's on-disk log. That used to run
//! **strictly one record at a time** on a single thread, and re-scanned
//! `~/.claude/projects` from scratch for *every* record — so N sessions cost N serial PTY
//! spawns plus N directory scans before the last terminal appeared.
//!
//! This module makes that loop **bounded-parallel** (a small worker pool, `RESUME_CONCURRENCY`)
//! and hands every worker **one shared snapshot** of the claude projects tree
//! (`title::ProjectLogIndex`) instead of re-listing it per record. Events, ordering per record,
//! error handling, and the capability gating are byte-for-byte what they were.
//!
//! **What is actually parallel** — `cwd.is_dir()`, `find_on_path` (+ the `PATHEXT` sweep on
//! Windows), `openpty`, the env copy, `spawn_command` (fork/exec on unix, `CreateProcessW` +
//! ConPTY on Windows), reader-thread creation, and the in-memory forkability lookup plus the
//! single `log_has_turn` read per claude record.
//!
//! **What stays serial, and is fine** — the brief `sessions`-map `insert`, the `activity`
//! insert, the `events` sender clone and the `title_tx` poke (all O(1) under microsecond-scale
//! locks, #260), and `Store::set_forkable` (its own mutex; it persists **only on change**, so a
//! normal boot writes nothing).
//!
//! Records are dispatched in their **persisted order**. The backend deliberately does not try to
//! resume "visible" sessions first: `selectedId` isn't persisted and `canvases`/`settings` are
//! intentionally opaque blobs the frontend owns (`store.rs`), so ranking here would mean parsing
//! a schema Rust must not know about — for a few hundred ms of reordering. (Frontend lazy-mount
//! is the right place for visibility to matter.)
//!
//! Since task 432 this module also owns the **boot respawn of persisted shell terminal items**
//! (#72) — [`respawn_shell_terminals`], one idempotent Rust-owned pass next to the agent resume
//! loop, so the frontend (any number of windows) only renders the panels.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::thread;

use tauri::{AppHandle, Emitter, Manager};

use crate::commands::ForkablePayload;
use crate::pty::SessionManager;
use crate::store::{OverviewPanel, PersistedSession, Store};
use crate::title::ProjectLogIndex;

/// How many persisted sessions are resumed at once. Each unit of work is a process spawn
/// (`fork`/`exec`, or `CreateProcessW` + ConPTY) plus a couple of file reads — kernel- and
/// I/O-bound, not CPU-bound — so a small pool captures nearly all of the win. Going wider mostly
/// piles more concurrent process creations onto the OS while the webview is still doing its first
/// paint (costliest on Linux/WebKitGTK, cf. #346); the registry insert at the end of each spawn is
/// serialized on the manager's map lock anyway (#260 keeps that window tiny).
pub const RESUME_CONCURRENCY: usize = 4;

/// Reconnect every persisted session, bounded-parallel, from one shared projects snapshot.
/// Runs on the background thread `lib.rs` spawns at `setup`, so the internal `join` never
/// blocks startup. Best-effort throughout — see `resume_one`.
pub fn resume_persisted_sessions(app: AppHandle) {
    let records = app.state::<Store>().sessions();
    if records.is_empty() {
        return;
    }
    // THE one directory scan of `~/.claude/projects` for the whole boot (#355). Dropped
    // when this function returns, so there is nothing to invalidate: every post-boot
    // lookup (title worker, fork guard) still uses the uncached `title::locate_log`.
    let index = Arc::new(ProjectLogIndex::build());
    let workers = resume_worker_count(records.len(), RESUME_CONCURRENCY);
    run_bounded(records, workers, move |record| {
        resume_one(&app, &index, &record);
    });
}

/// Reconnect one record: resume its PTY (when the agent supports it), seed its forkability,
/// persist it, and notify the UI — in exactly that order, exactly as the pre-#355 serial loop did.
///
/// Every step is best-effort (`let _ = …`): a failed resume (e.g. `claude` missing) leaves the
/// record in place for the UI to show, and the failing child's own exit stays the single existing
/// signal the frontend already handles (#30/#63 — its "reconnecting" boot window suppresses the
/// exit toast and keeps the per-terminal overlay + Restart). No new events, no error toasts.
fn resume_one(app: &AppHandle, index: &ProjectLogIndex, record: &PersistedSession) {
    let plan = plan_for(&record.agent);
    // Only resume agents that support id-based resume (#141). A Codex record has no
    // app-ownable session id, so resuming by id would fail/garble — leave it dormant (the
    // record persists; the user can relaunch it as a fresh session). Claude resumes exactly
    // as before.
    if plan.resume {
        // A dev-container record resumes inside a fresh container over its persisted
        // per-session home (`Ok(Some(launch))`); a plain record resumes as a host PTY
        // (`Ok(None)`). When the docker launch can't be composed (docker missing, an
        // unreadable worktree gitfile) — `Err(())` — the resume is SKIPPED entirely: a
        // container record must never fall back to a host PTY (wrong credentials/home/
        // git universe); the record stays with the normal failed-resume surface (#30/#63).
        if let Ok(launch) = crate::commands::boot_container_launch(app, record) {
            let _ = app.state::<SessionManager>().resume_session(
                &record.claude_session_id,
                &record.repo_path,
                record.name.clone(),
                &record.agent,
                launch.as_ref(),
            );
        }
    }
    // Seed forkability once at boot (#138): read the on-disk log so a resumed session
    // **with** history shows Fork available immediately, rather than waiting for its first
    // busy→idle edge. A non-claude-log agent (Codex, #141) is never forkable — and the `&&`
    // short-circuits, so it never even touches the index. Persist-on-change, then notify the
    // UI (the persisted value also covers a missed emit).
    let forkable = plan.reads_claude_log && index.has_conversation(&record.claude_session_id);
    let _ = app.state::<Store>().set_forkable(&record.id, forkable);
    let _ = app.emit(
        "session://forkable",
        ForkablePayload {
            id: record.id.clone(),
            forkable,
        },
    );
}

/// What the boot loop must do for one record, decided purely from its agent's spec
/// (#101/#141) — extracted so the capability gating is unit-testable without a Tauri app.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct RecordPlan {
    /// Resume the PTY by id — only claude owns an app-passed `--session-id`.
    resume: bool,
    /// Consult the projects index for forkability. `false` ⇒ `forkable: false` with **no**
    /// lookup (codex / opencode / custom write no claude log).
    reads_claude_log: bool,
}

fn plan_for(agent: &str) -> RecordPlan {
    let spec = crate::agents::agent_spec(agent);
    RecordPlan {
        resume: spec.supports_resume,
        reads_claude_log: spec.supports_auto_name,
    }
}

/// The persisted shell-terminal panels to respawn, as sorted `(repo, panel id)` pairs.
///
/// Rust DELIBERATELY reads the frontend-owned `overview_panels` map here (task 432) —
/// everywhere else the backend only round-trips it for the frontend (get/set/broadcast,
/// `store.rs`). This is the minimum possible surface: the `kind == "terminal"` literal
/// (#72), the panel `id`, and the repo-path map key. If the frontend ever renames the
/// terminal kind (`addOverviewPanel` / the template `new-terminal` block in
/// `src/store.ts`), update this filter in lockstep. Sorted so the spawn order — and the
/// tests — are deterministic (HashMap iteration is not).
pub(crate) fn terminal_panel_ids(
    panels: &HashMap<String, Vec<OverviewPanel>>,
) -> Vec<(String, String)> {
    let mut ids: Vec<(String, String)> = panels
        .iter()
        .flat_map(|(repo, list)| {
            list.iter()
                .filter(|p| p.kind == "terminal")
                .map(move |p| (repo.clone(), p.id.clone()))
        })
        .collect();
    ids.sort();
    ids
}

/// Respawn every persisted terminal panel that does NOT already have a registered PTY
/// (task 432). Idempotent: an id the manager already knows — live, or exited and kept
/// for Restart — is skipped, never killed+replaced (`spawn_with_id`'s same-id
/// semantics), so re-running this pass (or racing a just-created panel) is harmless.
/// Best-effort per panel (`resume_one` discipline): a missing repo dir / failed spawn
/// skips that panel silently — the panel renders dead in the UI exactly as a failed
/// frontend spawn did (#72). Returns the ids actually spawned (for tests).
pub(crate) fn respawn_missing_terminals(
    manager: &SessionManager,
    panels: &HashMap<String, Vec<OverviewPanel>>,
) -> Vec<String> {
    let mut spawned = Vec::new();
    for (repo, id) in terminal_panel_ids(panels) {
        if manager.has_session(&id) {
            continue;
        }
        if manager.spawn_terminal(id.clone(), &repo).is_ok() {
            spawned.push(id);
        }
    }
    spawned
}

/// Boot entry point: shells can't resume (#72), so respawn one fresh `$SHELL` PTY per
/// persisted terminal panel — ONCE per app, here in Rust, next to the agent resume
/// pass. The frontend's `applyBootState` no longer does this (task 432): with N full
/// windows all running the same boot code, a frontend respawn would double-spawn (and
/// thereby kill) the same panel ids. Runs even when no agent records exist
/// (`resume_persisted_sessions` early-returns; this must not).
pub fn respawn_shell_terminals(app: &AppHandle) {
    let panels = app.state::<Store>().overview_panels();
    respawn_missing_terminals(&app.state::<SessionManager>(), &panels);
}

/// How many workers to start: never more than there is work, never more than the cap.
fn resume_worker_count(records: usize, cap: usize) -> usize {
    records.min(cap)
}

/// Pop the next item off the shared queue. A poisoned lock is recovered (like `store.rs`)
/// rather than panicking a worker — the queue is a plain `VecDeque`, so a panicking work
/// closure can't have left it in a torn state.
fn next_record<T>(queue: &Mutex<VecDeque<T>>) -> Option<T> {
    let mut queue = queue
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    queue.pop_front()
}

/// Run `work` over `items` on at most `workers` threads: a shared queue each worker drains
/// until it's empty, then `join`. Every item is handed to **exactly one** worker, and at no
/// point are more than `workers` items in flight. Returns once all work is done.
pub(crate) fn run_bounded<T, F>(items: Vec<T>, workers: usize, work: F)
where
    T: Send + 'static,
    F: Fn(T) + Send + Sync + 'static,
{
    if items.is_empty() || workers == 0 {
        return;
    }
    let queue = Arc::new(Mutex::new(VecDeque::from(items)));
    let work = Arc::new(work);
    let mut handles = Vec::with_capacity(workers);
    for _ in 0..workers {
        let queue = Arc::clone(&queue);
        let work = Arc::clone(&work);
        handles.push(thread::spawn(move || {
            while let Some(item) = next_record(&queue) {
                work(item);
            }
        }));
    }
    for handle in handles {
        // A panicking worker must not take the boot loop (or the app) down with it — the
        // remaining records are still drained by the other workers.
        let _ = handle.join();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;

    #[test]
    fn resume_worker_count_is_clamped() {
        assert_eq!(resume_worker_count(0, RESUME_CONCURRENCY), 0);
        assert_eq!(resume_worker_count(1, RESUME_CONCURRENCY), 1);
        assert_eq!(resume_worker_count(3, RESUME_CONCURRENCY), 3);
        assert_eq!(resume_worker_count(50, RESUME_CONCURRENCY), 4);
    }

    /// The pool's contract: every item runs exactly once, and never more than `workers`
    /// at a time (an in-flight counter whose peak is recorded with `fetch_max`).
    #[test]
    fn run_bounded_processes_every_item_once_within_the_cap() {
        let items: Vec<usize> = (0..50).collect();
        let in_flight = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));
        let seen: Arc<Mutex<Vec<usize>>> = Arc::new(Mutex::new(Vec::new()));

        {
            let in_flight = Arc::clone(&in_flight);
            let peak = Arc::clone(&peak);
            let seen = Arc::clone(&seen);
            run_bounded(items, 4, move |item| {
                let now = in_flight.fetch_add(1, Ordering::SeqCst) + 1;
                peak.fetch_max(now, Ordering::SeqCst);
                // Hold the slot long enough that a broken pool would visibly overlap.
                thread::sleep(Duration::from_millis(1));
                seen.lock().unwrap().push(item);
                in_flight.fetch_sub(1, Ordering::SeqCst);
            });
        }

        let mut seen = seen.lock().unwrap().clone();
        seen.sort_unstable();
        assert_eq!(
            seen,
            (0..50).collect::<Vec<usize>>(),
            "each item exactly once"
        );
        assert_eq!(
            in_flight.load(Ordering::SeqCst),
            0,
            "no worker left in flight"
        );
        let peak = peak.load(Ordering::SeqCst);
        assert!(peak <= 4, "peak concurrency {peak} exceeded the cap of 4");
        assert!(
            peak >= 2,
            "the pool should actually overlap work, peak was {peak}"
        );
    }

    #[test]
    fn run_bounded_with_one_worker_is_sequential() {
        let in_flight = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));
        {
            let in_flight = Arc::clone(&in_flight);
            let peak = Arc::clone(&peak);
            run_bounded((0..8).collect::<Vec<usize>>(), 1, move |_| {
                let now = in_flight.fetch_add(1, Ordering::SeqCst) + 1;
                peak.fetch_max(now, Ordering::SeqCst);
                thread::sleep(Duration::from_millis(1));
                in_flight.fetch_sub(1, Ordering::SeqCst);
            });
        }
        assert_eq!(peak.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn run_bounded_is_a_no_op_without_items_or_workers() {
        let ran = Arc::new(AtomicUsize::new(0));
        {
            let ran = Arc::clone(&ran);
            run_bounded(Vec::<usize>::new(), 4, move |_| {
                ran.fetch_add(1, Ordering::SeqCst);
            });
        }
        {
            let ran = Arc::clone(&ran);
            run_bounded((0..3).collect::<Vec<usize>>(), 0, move |_| {
                ran.fetch_add(1, Ordering::SeqCst);
            });
        }
        assert_eq!(ran.load(Ordering::SeqCst), 0);
    }

    // --- Boot respawn of shell terminal items (#72, task 432) ---

    /// `OverviewPanel` fixture (the `store.rs` test-literal shape): only `id` + `kind`
    /// matter to the respawn filter, everything else `None`.
    fn panel(id: &str, kind: &str) -> OverviewPanel {
        OverviewPanel {
            id: id.into(),
            kind: kind.into(),
            file: None,
            diff_source: None,
            compare_base: None,
            compare_target: None,
            commit_sha: None,
        }
    }

    #[test]
    fn terminal_panel_ids_filters_terminal_kinds_and_sorts() {
        let mut panels: HashMap<String, Vec<OverviewPanel>> = HashMap::new();
        panels.insert(
            "/repo/b".into(),
            vec![panel("t2", "terminal"), panel("k1", "kanban")],
        );
        panels.insert(
            "/repo/a".into(),
            vec![
                panel("d1", "diff"),
                panel("t9", "terminal"),
                panel("m1", "markdown"),
                panel("t1", "terminal"),
            ],
        );

        assert_eq!(
            terminal_panel_ids(&panels),
            vec![
                ("/repo/a".to_string(), "t1".to_string()),
                ("/repo/a".to_string(), "t9".to_string()),
                ("/repo/b".to_string(), "t2".to_string()),
            ],
            "only terminal kinds, deterministic (repo, id) order"
        );

        // Empty map / a map with no terminal panels → nothing to respawn.
        assert!(terminal_panel_ids(&HashMap::new()).is_empty());
        let mut none: HashMap<String, Vec<OverviewPanel>> = HashMap::new();
        none.insert(
            "/repo/a".into(),
            vec![panel("d1", "diff"), panel("m1", "markdown")],
        );
        assert!(terminal_panel_ids(&none).is_empty());
    }

    /// The pty.rs `manager()` helper pattern, replicated locally (it's `mod tests`-private
    /// there). The receiver is kept alive so PTY event sends never error.
    #[cfg(unix)]
    fn manager() -> (
        SessionManager,
        std::sync::mpsc::Receiver<crate::pty::SessionEvent>,
    ) {
        let (tx, rx) = std::sync::mpsc::channel();
        (SessionManager::new(tx), rx)
    }

    /// The idempotence contract (task 432): a pre-registered id is skipped — its PTY
    /// generation (pid) untouched — only the missing terminal id is spawned, non-terminal
    /// kinds spawn nothing, and an immediate re-run is a no-op.
    #[cfg(unix)]
    #[test]
    fn respawn_skips_registered_ids_and_spawns_missing() {
        let (mgr, _rx) = manager();
        let dir = std::env::temp_dir();

        mgr.spawn_terminal("kept".to_string(), &dir)
            .expect("spawn kept");
        let kept_pid = mgr.session_pid("kept").expect("kept pid");

        let mut panels: HashMap<String, Vec<OverviewPanel>> = HashMap::new();
        panels.insert(
            dir.display().to_string(),
            vec![
                panel("kept", "terminal"),
                panel("fresh", "terminal"),
                panel("d1", "diff"),
            ],
        );

        assert_eq!(
            respawn_missing_terminals(&mgr, &panels),
            vec!["fresh".to_string()],
            "only the missing terminal id is spawned"
        );
        assert_eq!(
            mgr.session_pid("kept"),
            Some(kept_pid),
            "the pre-registered generation is never killed/replaced"
        );
        assert!(mgr.has_session("fresh"));

        // Re-running the pass immediately is a no-op (idempotent).
        assert_eq!(
            respawn_missing_terminals(&mgr, &panels),
            Vec::<String>::new()
        );

        mgr.kill_session("kept").expect("kill kept");
        mgr.kill_session("fresh").expect("kill fresh");
    }

    /// Capability gating (#101/#141) survives the rewrite: only claude is resumed by id and
    /// only claude consults the projects index (so a codex/opencode/custom record reports
    /// `forkable: false` without a single filesystem lookup).
    #[test]
    fn only_claude_records_resume_and_consult_the_log_index() {
        let claude = plan_for("claude");
        assert!(claude.resume);
        assert!(claude.reads_claude_log);

        for agent in ["codex", "opencode", "custom"] {
            let plan = plan_for(agent);
            assert!(!plan.resume, "{agent} must not resume by id");
            assert!(
                !plan.reads_claude_log,
                "{agent} must not touch the projects index"
            );
        }

        // An unknown / legacy-defaulted agent id resolves to claude (agents::agent_spec).
        assert_eq!(plan_for("some-future-agent"), claude);
    }
}
