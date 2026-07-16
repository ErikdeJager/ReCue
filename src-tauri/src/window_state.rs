//! Restore windows on relaunch (Multi-window task 439).
//!
//! Rust tracks every live **full app window** (label `main` or `app-*`) with its
//! bounds + creation presets, saves the set debounced on open/close/move/resize
//! into the dedicated `window_state` store key (backend-internal — no Tauri
//! command, the `path_cache` precedent), and recreates the saved set at boot —
//! clamped to the current monitor layout, capped defensively, each window
//! hidden-until-painted (#348). This deliberately reverses the #84 "detached
//! windows are per-session" rule: full app windows now survive relaunch.
//!
//! Platform notes (all documented degrades, never breaks):
//! - **Windows** minimize reports sentinel events — a `Moved` to −32000/−32000 and
//!   a `Resized` to 0×0 — which the pure state machine ignores, so a window quit
//!   while minimized restores at its last real bounds.
//! - **Wayland** compositors own placement: `set_position` is refused and `Moved`
//!   may never be delivered, so restore degrades to size-only with default
//!   placement there. Not worked around.
//! - **Maximized/fullscreen state is not persisted** — a window quit while
//!   maximized restores as a normal frame at the maximized geometry (a later card
//!   can add an `is_maximized` flag if wanted).

use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager};

use crate::store::{PersistedWindow, Store};

/// One `sessions.json` write at most this long after the last move/resize event —
/// never per-event during a drag.
pub const WINDOW_SAVE_DEBOUNCE_MS: u64 = 500;
/// Defensive cap on restored `app-*` windows (a corrupt/oversized persisted set
/// can never spawn an unbounded number of webviews at boot).
pub const MAX_RESTORED_EXTRAS: usize = 8;
/// A restored window must overlap some monitor by at least this much in BOTH axes
/// to keep its saved position; otherwise it is re-placed fully on-screen.
const MIN_VISIBLE_PX: i32 = 64;
/// A saved size below this floor is treated as corrupt (e.g. the 0s stored when a
/// bounds query failed) — the window falls back to default placement.
const MIN_RESTORE_PX: u32 = 200;

/// Eligible for tracking/restore: the full app windows (task 434/437). After 437
/// no other window kind can exist; unknown labels are ignored defensively.
fn is_restorable_label(label: &str) -> bool {
    label == "main" || label.starts_with("app-")
}

/// What the caller must do after a [`WindowSet`] mutation.
#[derive(Debug, PartialEq, Eq)]
pub enum SaveAction {
    /// Nothing changed (or the app is exiting) — don't touch the store.
    None,
    /// A move/resize landed — poke the debounced saver (coalesces a drag's storm
    /// of events into one write).
    Debounce,
    /// A singular event (open / close / quit) — persist the snapshot promptly, so
    /// a quit inside the debounce window can never lose it.
    FlushNow,
}

/// Pure live-set state machine (the `primary::Election` precedent): every rule
/// about what is tracked, when the set is pruned, and how quit is told apart from
/// close lives here, unit-testable without Tauri.
#[derive(Default, Debug)]
pub struct WindowSet {
    windows: Vec<PersistedWindow>,
    /// Set on `ExitRequested` (the ⌘Q/`app.exit` path) or when the LAST window is
    /// destroyed (the last-window-close exit path). Once exiting, the at-quit
    /// snapshot is authoritative: later prunes and debounced saves are suppressed
    /// so teardown's per-window `Destroyed` storm can't empty the persisted set.
    exiting: bool,
}

impl WindowSet {
    /// Track a newly created window. Ineligible labels, duplicates, and an
    /// exiting app are ignored; a fresh entry flushes promptly (open is a
    /// singular event).
    pub fn register(&mut self, entry: PersistedWindow) -> SaveAction {
        if self.exiting
            || !is_restorable_label(&entry.label)
            || self.windows.iter().any(|w| w.label == entry.label)
        {
            return SaveAction::None;
        }
        self.windows.push(entry);
        SaveAction::FlushNow
    }

    /// A `Moved` event: update the entry's outer position. Ignored for untracked
    /// labels, while exiting, for the Windows minimize sentinel (−32000/−32000),
    /// and when nothing changed.
    pub fn moved(&mut self, label: &str, x: i32, y: i32) -> SaveAction {
        if self.exiting || (x == -32000 && y == -32000) {
            return SaveAction::None;
        }
        let Some(entry) = self.windows.iter_mut().find(|w| w.label == label) else {
            return SaveAction::None;
        };
        if entry.x == x && entry.y == y {
            return SaveAction::None;
        }
        entry.x = x;
        entry.y = y;
        SaveAction::Debounce
    }

    /// A `Resized` event: update the entry's inner size. Ignored for untracked
    /// labels, while exiting, for the Windows minimize sentinel (a 0 dimension),
    /// and when nothing changed.
    pub fn resized(&mut self, label: &str, width: u32, height: u32) -> SaveAction {
        if self.exiting || width == 0 || height == 0 {
            return SaveAction::None;
        }
        let Some(entry) = self.windows.iter_mut().find(|w| w.label == label) else {
            return SaveAction::None;
        };
        if entry.width == width && entry.height == height {
            return SaveAction::None;
        }
        entry.width = width;
        entry.height = height;
        SaveAction::Debounce
    }

    /// A `Destroyed` event. Untracked / already exiting → no-op. Pruning that
    /// would EMPTY the set does NOT prune: the last window closing IS the exit on
    /// the last-window-close path (`ExitRequested` fires only after teardown
    /// there), so mark exiting and flush the final window — its latest bounds are
    /// already in the entry — so it is restored next launch. Otherwise prune and
    /// flush promptly (close is singular; a prompt persist can't be lost to a
    /// quit inside the debounce window).
    pub fn destroyed(&mut self, label: &str) -> SaveAction {
        if self.exiting {
            return SaveAction::None;
        }
        let Some(pos) = self.windows.iter().position(|w| w.label == label) else {
            return SaveAction::None;
        };
        if self.windows.len() == 1 {
            self.exiting = true;
            return SaveAction::FlushNow;
        }
        self.windows.remove(pos);
        SaveAction::FlushNow
    }

    /// `RunEvent::ExitRequested` (the ⌘Q/`app.exit` path — fires BEFORE window
    /// teardown, so the snapshot is the full at-quit set): first call marks
    /// exiting and flushes synchronously; repeats are no-ops.
    pub fn exit_requested(&mut self) -> SaveAction {
        if self.exiting {
            return SaveAction::None;
        }
        self.exiting = true;
        SaveAction::FlushNow
    }

    /// The current tracked set (what a flush persists).
    pub fn snapshot(&self) -> Vec<PersistedWindow> {
        self.windows.clone()
    }

    /// Whether the app is exiting (debounced saves are suppressed then — the exit
    /// flush is authoritative and must never race teardown).
    pub fn is_exiting(&self) -> bool {
        self.exiting
    }
}

// ---------------------------------------------------------------------------
// Pure restore helpers
// ---------------------------------------------------------------------------

/// A monitor's physical-px rectangle (from tauri's `Monitor` position/size).
#[derive(Clone, Copy, Debug)]
pub struct MonitorRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Signed overlap of the span `[pos, pos+len)` with `[m_pos, m_pos+m_len)` on one
/// axis (negative = disjoint). i64 so extreme saved coordinates can't overflow.
fn overlap_axis(pos: i32, len: u32, m_pos: i32, m_len: u32) -> i64 {
    let end = pos as i64 + len as i64;
    let m_end = m_pos as i64 + m_len as i64;
    end.min(m_end) - (pos as i64).max(m_pos as i64)
}

/// Clamp saved bounds to the CURRENT monitor layout. `None` = don't position/size
/// (default placement): no monitors known (fail-open) or a corrupt/degenerate
/// saved size (below [`MIN_RESTORE_PX`]). Otherwise: shrink to the largest
/// monitor, and if the rect no longer overlaps any monitor by ≥ [`MIN_VISIBLE_PX`]
/// in BOTH axes (monitor unplugged / resolution change), translate it fully
/// inside the most-overlapping (else first) monitor. Deterministic + pure — the
/// whole "monitor-safe" guarantee lives here.
pub fn clamp_bounds(
    saved: &PersistedWindow,
    monitors: &[MonitorRect],
) -> Option<(i32, i32, u32, u32)> {
    if monitors.is_empty() || saved.width < MIN_RESTORE_PX || saved.height < MIN_RESTORE_PX {
        return None;
    }
    let largest = monitors
        .iter()
        .max_by_key(|m| m.width as u64 * m.height as u64)?;
    let mut width = saved.width.min(largest.width);
    let mut height = saved.height.min(largest.height);
    let mut x = saved.x;
    let mut y = saved.y;

    let visible = monitors.iter().any(|m| {
        overlap_axis(x, width, m.x, m.width) >= MIN_VISIBLE_PX as i64
            && overlap_axis(y, height, m.y, m.height) >= MIN_VISIBLE_PX as i64
    });
    if !visible {
        // Best-overlapping monitor, ties/none → the FIRST (strict `>` keeps the
        // first on equal overlap, deterministically).
        let mut target = &monitors[0];
        let mut best = overlap_axis(x, width, target.x, target.width).max(0)
            * overlap_axis(y, height, target.y, target.height).max(0);
        for m in &monitors[1..] {
            let area = overlap_axis(x, width, m.x, m.width).max(0)
                * overlap_axis(y, height, m.y, m.height).max(0);
            if area > best {
                best = area;
                target = m;
            }
        }
        // The target may be smaller than the largest monitor — shrink again so
        // "fully inside" is always satisfiable, then translate in.
        width = width.min(target.width);
        height = height.min(target.height);
        let max_x = target.x as i64 + (target.width - width) as i64;
        let max_y = target.y as i64 + (target.height - height) as i64;
        x = (x as i64).clamp(target.x as i64, max_x) as i32;
        y = (y as i64).clamp(target.y as i64, max_y) as i32;
    }
    Some((x, y, width, height))
}

/// Split + sanitize the persisted set for restore: the `main` entry (first match)
/// vs the `app-*` extras — unknown labels and duplicate labels dropped, extras
/// capped at [`MAX_RESTORED_EXTRAS`] (defensive against a corrupt/oversized
/// file). Pure.
pub fn restorable(
    entries: Vec<PersistedWindow>,
) -> (Option<PersistedWindow>, Vec<PersistedWindow>) {
    let mut main = None;
    let mut extras: Vec<PersistedWindow> = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    for entry in entries {
        if !is_restorable_label(&entry.label) || seen.contains(&entry.label) {
            continue;
        }
        seen.push(entry.label.clone());
        if entry.label == "main" {
            main = Some(entry);
        } else if extras.len() < MAX_RESTORED_EXTRAS {
            extras.push(entry);
        }
    }
    (main, extras)
}

// ---------------------------------------------------------------------------
// The managed registry + debounced saver (thin impure shell)
// ---------------------------------------------------------------------------

/// Managed state: the mutex-guarded live [`WindowSet`] plus the debounce poke
/// channel (the `Sender` is `!Sync`, hence its own mutex).
pub struct Registry {
    pub set: Mutex<WindowSet>,
    poke: Mutex<mpsc::Sender<()>>,
}

/// Build the registry and start its saver thread: each poke arms a debounce —
/// the thread drains further pokes until [`WINDOW_SAVE_DEBOUNCE_MS`] passes with
/// none, then flushes once. Suppressed while exiting (the synchronous exit flush
/// is authoritative; a debounced write must never race teardown). The caller
/// `app.manage()`s the returned value before any window event can fire.
pub fn init(app: &AppHandle) -> Registry {
    let (tx, rx) = mpsc::channel::<()>();
    let handle = app.clone();
    std::thread::spawn(move || {
        while rx.recv().is_ok() {
            while rx
                .recv_timeout(Duration::from_millis(WINDOW_SAVE_DEBOUNCE_MS))
                .is_ok()
            {}
            let exiting = handle
                .try_state::<Registry>()
                .is_some_and(|r| lock_set(&r).is_exiting());
            if exiting {
                continue;
            }
            flush(&handle);
        }
    });
    Registry {
        set: Mutex::new(WindowSet::default()),
        poke: Mutex::new(tx),
    }
}

/// Poison-recovering lock on the window set (the 426/433 pattern — a panicked
/// holder must never wedge saves for the rest of the run).
fn lock_set<'a>(registry: &'a Registry) -> std::sync::MutexGuard<'a, WindowSet> {
    registry.set.lock().unwrap_or_else(|p| p.into_inner())
}

/// Persist the current snapshot — persist-on-change (an identical set skips the
/// write), fail-open on io (`let _ =`), `try_state` so a teardown-ordering call
/// can never panic.
fn flush(app: &AppHandle) {
    let (Some(registry), Some(store)) = (app.try_state::<Registry>(), app.try_state::<Store>())
    else {
        return;
    };
    let snapshot = lock_set(&registry).snapshot();
    if store.window_state() != snapshot {
        let _ = store.set_window_state(snapshot);
    }
}

/// Act on a pure mutation's verdict: poke the debouncer or flush synchronously
/// (a small JSON write on the main thread — the same class as the store writes
/// existing commands already do).
fn apply(app: &AppHandle, registry: &Registry, action: SaveAction) {
    match action {
        SaveAction::None => {}
        SaveAction::Debounce => {
            let _ = registry
                .poke
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .send(());
        }
        SaveAction::FlushNow => flush(app),
    }
}

/// Track a newly created full window with its creation presets (task 434's
/// `AppWindowInit`). `bounds` = the clamped bounds the caller just applied; when
/// `None` the live window is queried best-effort (`outer_position` /
/// `inner_size`, both main-thread-safe proxies) — on error 0s are stored, which
/// [`clamp_bounds`]' [`MIN_RESTORE_PX`] floor turns into default placement next
/// launch.
pub fn register(
    app: &AppHandle,
    label: &str,
    repo: Option<String>,
    canvas: Option<String>,
    bounds: Option<(i32, i32, u32, u32)>,
) {
    let Some(registry) = app.try_state::<Registry>() else {
        return;
    };
    let (x, y, width, height) = bounds.unwrap_or_else(|| {
        app.get_webview_window(label)
            .map(|window| {
                let (x, y) = window
                    .outer_position()
                    .map(|p| (p.x, p.y))
                    .unwrap_or((0, 0));
                let (w, h) = window
                    .inner_size()
                    .map(|s| (s.width, s.height))
                    .unwrap_or((0, 0));
                (x, y, w, h)
            })
            .unwrap_or((0, 0, 0, 0))
    });
    let entry = PersistedWindow {
        label: label.to_string(),
        x,
        y,
        width,
        height,
        repo,
        canvas,
    };
    let action = lock_set(&registry).register(entry);
    apply(app, &registry, action);
}

/// Global `WindowEvent::Moved` entry point (lib.rs).
pub fn note_moved(app: &AppHandle, label: &str, x: i32, y: i32) {
    let Some(registry) = app.try_state::<Registry>() else {
        return;
    };
    let action = lock_set(&registry).moved(label, x, y);
    apply(app, &registry, action);
}

/// Global `WindowEvent::Resized` entry point (lib.rs).
pub fn note_resized(app: &AppHandle, label: &str, width: u32, height: u32) {
    let Some(registry) = app.try_state::<Registry>() else {
        return;
    };
    let action = lock_set(&registry).resized(label, width, height);
    apply(app, &registry, action);
}

/// Global `WindowEvent::Destroyed` entry point (lib.rs) — prunes a closed window
/// unless the app is exiting (the pure would-empty rule catches the
/// last-window-close exit, where `ExitRequested` only fires after teardown).
pub fn note_destroyed(app: &AppHandle, label: &str) {
    let Some(registry) = app.try_state::<Registry>() else {
        return;
    };
    let action = lock_set(&registry).destroyed(label);
    apply(app, &registry, action);
}

/// `RunEvent::ExitRequested` entry point (lib.rs) — the ⌘Q/`app.exit` path:
/// flush the full at-quit set synchronously and suppress the per-window prunes
/// that follow during teardown.
pub fn note_exit_requested(app: &AppHandle) {
    let Some(registry) = app.try_state::<Registry>() else {
        return;
    };
    let action = lock_set(&registry).exit_requested();
    apply(app, &registry, action);
}

/// Boot restore (task 439): apply the saved `main` entry's clamped bounds to the
/// still-hidden main window (BEFORE any reveal — no flash, #348), then recreate
/// each saved `app-*` entry as a new full app window via the shared creation
/// path (`commands::create_app_window` — fresh `app-<uuid>` label, URL carrying
/// the saved repo/canvas presets, hidden-until-painted + per-window reveal
/// fallback, primary + registry registration), each best-effort (`let _ =` — one
/// failed recreate never aborts the rest).
///
/// INVARIANT (primary safety): this MUST run AFTER task 433's `.setup()`
/// registration of the config-created `main` window, so `main` is the oldest
/// surviving full window → primary, and a restored window never runs the
/// once-per-app boot effects. `main` is registered here whether or not a saved
/// entry existed, so a fresh install starts tracking immediately.
pub fn restore_windows(app: &AppHandle) {
    let Some(store) = app.try_state::<Store>() else {
        return;
    };
    let (main_entry, extras) = restorable(store.window_state());
    // Error / unknown → empty vec → clamp_bounds fails open (default placement).
    let monitors: Vec<MonitorRect> = app
        .available_monitors()
        .map(|monitors| {
            monitors
                .iter()
                .map(|m| MonitorRect {
                    x: m.position().x,
                    y: m.position().y,
                    width: m.size().width,
                    height: m.size().height,
                })
                .collect()
        })
        .unwrap_or_default();

    // (a) The main window: apply clamped bounds while it is still hidden.
    // On Wayland set_position is compositor-refused — size-only there.
    let mut applied: Option<(i32, i32, u32, u32)> = None;
    if let Some(entry) = &main_entry {
        if let Some((x, y, width, height)) = clamp_bounds(entry, &monitors) {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
                let _ = window.set_size(tauri::PhysicalSize::new(width, height));
                applied = Some((x, y, width, height));
            }
        }
    }
    register(app, "main", None, None, applied);

    // (b) The extras: fresh app-<uuid> windows with the saved presets + bounds.
    for entry in extras {
        let bounds = clamp_bounds(&entry, &monitors);
        let init = crate::commands::AppWindowInit {
            repo: entry.repo,
            canvas: entry.canvas,
        };
        if let Err(e) = crate::commands::create_app_window(app, init, bounds) {
            eprintln!(
                "[recue] window restore: recreating {} failed: {e}",
                entry.label
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn win(label: &str, x: i32, y: i32, width: u32, height: u32) -> PersistedWindow {
        PersistedWindow {
            label: label.to_string(),
            x,
            y,
            width,
            height,
            repo: None,
            canvas: None,
        }
    }

    fn labels(set: &WindowSet) -> Vec<String> {
        set.snapshot().into_iter().map(|w| w.label).collect()
    }

    // -- is_restorable_label ------------------------------------------------

    #[test]
    fn restorable_labels_are_main_and_app() {
        assert!(is_restorable_label("main"));
        assert!(is_restorable_label("app-x"));
        assert!(!is_restorable_label("canvas-x"));
        assert!(!is_restorable_label("other"));
    }

    // -- WindowSet: register ------------------------------------------------

    #[test]
    fn register_tracks_and_flushes() {
        let mut set = WindowSet::default();
        assert_eq!(
            set.register(win("main", 0, 0, 1280, 832)),
            SaveAction::FlushNow
        );
        assert_eq!(labels(&set), vec!["main"]);
    }

    #[test]
    fn register_ignores_ineligible_and_duplicate_labels() {
        let mut set = WindowSet::default();
        assert_eq!(
            set.register(win("canvas-x", 0, 0, 800, 600)),
            SaveAction::None
        );
        assert_eq!(set.register(win("other", 0, 0, 800, 600)), SaveAction::None);
        set.register(win("main", 0, 0, 1280, 832));
        assert_eq!(set.register(win("main", 9, 9, 999, 999)), SaveAction::None);
        assert_eq!(labels(&set), vec!["main"]);
        // The duplicate did not overwrite the original bounds.
        assert_eq!(set.snapshot()[0].x, 0);
    }

    // -- WindowSet: moved / resized ------------------------------------------

    #[test]
    fn moved_updates_and_debounces() {
        let mut set = WindowSet::default();
        set.register(win("main", 0, 0, 1280, 832));
        assert_eq!(set.moved("main", 40, 60), SaveAction::Debounce);
        let snap = set.snapshot();
        assert_eq!((snap[0].x, snap[0].y), (40, 60));
    }

    #[test]
    fn moved_ignores_untracked_unchanged_and_sentinel() {
        let mut set = WindowSet::default();
        set.register(win("main", 40, 60, 1280, 832));
        assert_eq!(set.moved("ghost", 1, 2), SaveAction::None);
        assert_eq!(set.moved("main", 40, 60), SaveAction::None); // unchanged
                                                                 // The Windows minimize sentinel never persists.
        assert_eq!(set.moved("main", -32000, -32000), SaveAction::None);
        assert_eq!((set.snapshot()[0].x, set.snapshot()[0].y), (40, 60));
    }

    #[test]
    fn resized_updates_and_debounces() {
        let mut set = WindowSet::default();
        set.register(win("main", 0, 0, 1280, 832));
        assert_eq!(set.resized("main", 1000, 700), SaveAction::Debounce);
        let snap = set.snapshot();
        assert_eq!((snap[0].width, snap[0].height), (1000, 700));
    }

    #[test]
    fn resized_ignores_untracked_unchanged_and_sentinel() {
        let mut set = WindowSet::default();
        set.register(win("main", 0, 0, 1280, 832));
        assert_eq!(set.resized("ghost", 1, 1), SaveAction::None);
        assert_eq!(set.resized("main", 1280, 832), SaveAction::None); // unchanged
                                                                      // The Windows minimize sentinel (a 0 dimension) never persists.
        assert_eq!(set.resized("main", 0, 0), SaveAction::None);
        assert_eq!(set.resized("main", 0, 500), SaveAction::None);
        assert_eq!(set.resized("main", 500, 0), SaveAction::None);
        let snap = set.snapshot();
        assert_eq!((snap[0].width, snap[0].height), (1280, 832));
    }

    // -- WindowSet: destroyed / exit ------------------------------------------

    #[test]
    fn destroyed_prunes_and_flushes() {
        let mut set = WindowSet::default();
        set.register(win("main", 0, 0, 1280, 832));
        set.register(win("app-a", 0, 0, 900, 700));
        assert_eq!(set.destroyed("app-a"), SaveAction::FlushNow);
        assert_eq!(labels(&set), vec!["main"]);
        assert!(!set.is_exiting());
    }

    #[test]
    fn destroyed_ignores_untracked() {
        let mut set = WindowSet::default();
        set.register(win("main", 0, 0, 1280, 832));
        assert_eq!(set.destroyed("ghost"), SaveAction::None);
        assert_eq!(set.destroyed("canvas-x"), SaveAction::None);
        assert_eq!(labels(&set), vec!["main"]);
    }

    #[test]
    fn destroying_the_last_window_keeps_it_and_marks_exiting() {
        // The last-window-close exit path: ExitRequested fires only AFTER
        // teardown there, so the final Destroyed IS the exit signal.
        let mut set = WindowSet::default();
        set.register(win("main", 40, 60, 1280, 832));
        assert_eq!(set.destroyed("main"), SaveAction::FlushNow);
        assert!(set.is_exiting());
        assert_eq!(labels(&set), vec!["main"]); // not pruned — restored next launch
                                                // Nothing mutates after exiting.
        assert_eq!(set.register(win("app-b", 0, 0, 800, 600)), SaveAction::None);
        assert_eq!(set.moved("main", 1, 1), SaveAction::None);
        assert_eq!(set.resized("main", 900, 700), SaveAction::None);
        assert_eq!(set.destroyed("main"), SaveAction::None);
    }

    #[test]
    fn close_all_in_sequence_persists_exactly_the_last_window() {
        // Close app-a, then close main (the last window): the persisted set is
        // exactly {main} with its final bounds.
        let mut set = WindowSet::default();
        set.register(win("main", 40, 60, 1280, 832));
        set.register(win("app-a", 0, 0, 900, 700));
        assert_eq!(set.destroyed("app-a"), SaveAction::FlushNow);
        assert_eq!(set.destroyed("main"), SaveAction::FlushNow);
        assert!(set.is_exiting());
        assert_eq!(labels(&set), vec!["main"]);
    }

    #[test]
    fn exit_requested_flushes_once_and_suppresses_teardown_prunes() {
        // The ⌘Q sequence: ExitRequested fires BEFORE teardown, then every
        // window's Destroyed follows — the at-quit set survives all of them.
        let mut set = WindowSet::default();
        set.register(win("main", 40, 60, 1280, 832));
        set.register(win("app-a", 0, 0, 900, 700));
        set.register(win("app-b", 10, 10, 800, 600));
        assert_eq!(set.exit_requested(), SaveAction::FlushNow);
        assert_eq!(set.exit_requested(), SaveAction::None); // repeat is a no-op
        assert_eq!(set.destroyed("app-b"), SaveAction::None);
        assert_eq!(set.destroyed("app-a"), SaveAction::None);
        assert_eq!(set.destroyed("main"), SaveAction::None);
        assert_eq!(labels(&set), vec!["main", "app-a", "app-b"]);
    }

    // -- clamp_bounds ---------------------------------------------------------

    const PRIMARY: MonitorRect = MonitorRect {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
    };
    const LEFT_OF_PRIMARY: MonitorRect = MonitorRect {
        x: -1920,
        y: 0,
        width: 1920,
        height: 1080,
    };

    #[test]
    fn clamp_keeps_a_window_that_fits() {
        let saved = win("main", 100, 100, 1280, 832);
        assert_eq!(
            clamp_bounds(&saved, &[PRIMARY]),
            Some((100, 100, 1280, 832))
        );
    }

    #[test]
    fn clamp_shrinks_an_oversized_window_to_the_largest_monitor() {
        let saved = win("main", 0, 0, 5000, 4000);
        assert_eq!(clamp_bounds(&saved, &[PRIMARY]), Some((0, 0, 1920, 1080)));
    }

    #[test]
    fn clamp_keeps_a_window_on_a_negative_origin_monitor() {
        // A second monitor left of the primary: x = −1920 is a legal, on-screen
        // position and must NOT be "corrected".
        let saved = win("main", -1900, 100, 1280, 832);
        assert_eq!(
            clamp_bounds(&saved, &[PRIMARY, LEFT_OF_PRIMARY]),
            Some((-1900, 100, 1280, 832))
        );
    }

    #[test]
    fn clamp_replaces_a_window_on_an_unplugged_monitor() {
        // Saved on the (now unplugged) left monitor; only the primary remains.
        let saved = win("main", -1900, 100, 1280, 832);
        let (x, y, width, height) = clamp_bounds(&saved, &[PRIMARY]).expect("re-placed");
        assert_eq!((width, height), (1280, 832));
        // Fully inside the primary.
        assert!(x >= 0 && (x as i64 + width as i64) <= 1920);
        assert!(y >= 0 && (y as i64 + height as i64) <= 1080);
    }

    #[test]
    fn clamp_replaces_a_window_with_too_little_overlap() {
        // Only 63px of the window remains on-screen horizontally — below
        // MIN_VISIBLE_PX, so it is pulled fully inside.
        let saved = win("main", 1920 - 63, 100, 1280, 832);
        let (x, y, width, height) = clamp_bounds(&saved, &[PRIMARY]).expect("re-placed");
        assert_eq!((width, height), (1280, 832));
        assert_eq!(x, 1920 - 1280); // clamped to the right edge
        assert_eq!(y, 100);
        // Exactly MIN_VISIBLE_PX of overlap in both axes keeps the position.
        let ok = win("main", 1920 - 64, 100, 1280, 832);
        assert_eq!(
            clamp_bounds(&ok, &[PRIMARY]),
            Some((1920 - 64, 100, 1280, 832))
        );
    }

    #[test]
    fn clamp_replaces_into_the_best_overlapping_monitor() {
        // Mostly-off-screen at the bottom of the LEFT monitor: it should be
        // pulled inside the left monitor (the best overlap), not the primary.
        let saved = win("main", -1000, 1080 - 10, 800, 600);
        let (x, y, ..) = clamp_bounds(&saved, &[PRIMARY, LEFT_OF_PRIMARY]).expect("re-placed");
        assert_eq!(x, -1000); // x already inside the left monitor
        assert_eq!(y, 1080 - 600); // pulled up to fit
    }

    #[test]
    fn clamp_rejects_degenerate_sizes_and_empty_monitors() {
        // Below the MIN_RESTORE_PX floor (e.g. the 0s stored on a query error).
        assert_eq!(clamp_bounds(&win("main", 0, 0, 0, 0), &[PRIMARY]), None);
        assert_eq!(clamp_bounds(&win("main", 0, 0, 199, 832), &[PRIMARY]), None);
        assert_eq!(
            clamp_bounds(&win("main", 0, 0, 1280, 199), &[PRIMARY]),
            None
        );
        // No monitors known → fail open to default placement.
        assert_eq!(clamp_bounds(&win("main", 0, 0, 1280, 832), &[]), None);
    }

    #[test]
    fn clamp_shrinks_to_fit_a_smaller_replacement_monitor() {
        // Saved 1800px tall on a monitor that no longer exists; the survivor is
        // shorter — the window shrinks to fit while being re-placed.
        let small = MonitorRect {
            x: 0,
            y: 0,
            width: 1280,
            height: 800,
        };
        let saved = win("main", 5000, 5000, 1600, 1800);
        assert_eq!(clamp_bounds(&saved, &[small]), Some((0, 0, 1280, 800)));
    }

    // -- restorable -----------------------------------------------------------

    #[test]
    fn restorable_splits_main_from_extras() {
        let (main, extras) = restorable(vec![
            win("app-a", 0, 0, 900, 700),
            win("main", 40, 60, 1280, 832),
            win("app-b", 10, 10, 800, 600),
        ]);
        assert_eq!(main.map(|w| w.label), Some("main".to_string()));
        let labels: Vec<String> = extras.into_iter().map(|w| w.label).collect();
        assert_eq!(labels, vec!["app-a", "app-b"]);
    }

    #[test]
    fn restorable_drops_unknown_and_duplicate_labels() {
        let (main, extras) = restorable(vec![
            win("canvas-x", 0, 0, 900, 700), // unknown kind (pre-437 leftover)
            win("main", 1, 1, 1280, 832),
            win("main", 2, 2, 1280, 832), // duplicate — first wins
            win("app-a", 0, 0, 900, 700),
            win("app-a", 9, 9, 900, 700), // duplicate — dropped
        ]);
        assert_eq!(main.as_ref().map(|w| w.x), Some(1));
        assert_eq!(extras.len(), 1);
    }

    #[test]
    fn restorable_caps_a_corrupt_oversized_set() {
        let mut entries: Vec<PersistedWindow> = (0..50)
            .map(|i| win(&format!("app-{i}"), 0, 0, 900, 700))
            .collect();
        entries.push(win("main", 0, 0, 1280, 832));
        let (main, extras) = restorable(entries);
        assert!(main.is_some());
        assert_eq!(extras.len(), MAX_RESTORED_EXTRAS);
    }
}
