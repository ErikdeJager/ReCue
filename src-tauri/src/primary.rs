//! Primary-window election (Multi-window task 433).
//!
//! Rust tracks every **full app window** (today only `main`; the 9/16 full windows
//! later) and designates the **oldest surviving** one primary. The frontend gates
//! its once-per-app effects on it and re-arms them live when the broadcast promotes
//! a new window. Detached canvas windows (#84) are pure renderers and never primary.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

/// Eligible for primary: any window that is NOT a detached canvas renderer (#84).
/// Today that is only the `main` window; card 9/16's full app windows (whatever
/// their labels) are eligible by construction of this predicate.
pub fn is_full_window(label: &str) -> bool {
    !label.starts_with("canvas-")
}

/// Pure election state: eligible labels in creation order. Primary = `order[0]`
/// (the oldest surviving full window). A surviving window is never demoted —
/// only the death of an older window promotes — so takeover is monotonic.
#[derive(Default, Debug)]
pub struct Election {
    order: Vec<String>,
}

impl Election {
    /// Track a window. Ineligible labels and duplicates are ignored.
    /// Returns true when the primary changed (this became the first eligible window).
    pub fn register(&mut self, label: &str) -> bool {
        if !is_full_window(label) || self.order.iter().any(|l| l == label) {
            return false;
        }
        self.order.push(label.to_string());
        self.order.len() == 1
    }

    /// Forget a window. Returns true when the primary changed (the primary closed:
    /// the next-oldest survivor is promoted, or `None` remains).
    pub fn unregister(&mut self, label: &str) -> bool {
        match self.order.iter().position(|l| l == label) {
            Some(pos) => {
                self.order.remove(pos);
                pos == 0
            }
            None => false,
        }
    }

    /// The current primary label: the oldest surviving full window, if any.
    pub fn primary(&self) -> Option<&str> {
        self.order.first().map(String::as_str)
    }
}

/// Tauri-managed election. INVARIANT (task 430's rule): the mutex state is updated
/// BEFORE `window://primary` is emitted, so the `primary_window` snapshot is always
/// >= any event a subscriber saw — subscribe-then-fetch can never regress.
#[derive(Default)]
pub struct Primary(pub Mutex<Election>);

/// `window://primary` payload — the full current value (task 428 conventions):
/// emitted only on change; frontend applies are equality-guarded and never persist.
#[derive(Clone, Serialize)]
pub struct PrimaryPayload {
    pub primary: Option<String>,
}

/// Register a window at its creation site. Every window-creation site routes
/// through here (setup for the config-created window(s), and `open_app_window`,
/// the task-434 full-window creator) — ineligible labels are filtered inside.
/// Emits `window://primary` only when the primary changed, AFTER updating the
/// state.
pub fn register_window(app: &AppHandle, label: &str) {
    // `try_state`: never panic on teardown/setup ordering — no state, no election.
    let Some(state) = app.try_state::<Primary>() else {
        return;
    };
    let mut election = state.0.lock().unwrap_or_else(|p| p.into_inner());
    if !election.register(label) {
        return;
    }
    let primary = election.primary().map(String::from);
    drop(election); // never emit while holding the guard
    let _ = app.emit("window://primary", PrimaryPayload { primary });
}

/// Unregister a destroyed window. If the primary closed, the oldest surviving
/// full window is promoted and broadcast — the new primary's frontend re-arms the
/// once-per-app effects live (`armPrimaryEffects`). A shutdown-teardown emit into
/// dying webviews is a `let _ =` no-op.
pub fn unregister_window(app: &AppHandle, label: &str) {
    let Some(state) = app.try_state::<Primary>() else {
        return;
    };
    let mut election = state.0.lock().unwrap_or_else(|p| p.into_inner());
    if !election.unregister(label) {
        return;
    }
    let primary = election.primary().map(String::from);
    drop(election); // never emit while holding the guard
    let _ = app.emit("window://primary", PrimaryPayload { primary });
}

/// The current primary full-window label, or `None` when no full window survives.
/// The late-subscriber snapshot: call AFTER subscribing to `window://primary`
/// (task 430 discipline) — the state is written before each emit, so this can
/// never lag an event a subscriber saw. A cheap mutex read (fine on the main
/// thread).
#[tauri::command]
pub fn primary_window(state: State<'_, Primary>) -> Option<String> {
    state
        .0
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .primary()
        .map(String::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_full_window_accepts_main_and_future_app_labels() {
        assert!(is_full_window("main"));
        assert!(is_full_window("app-2")); // a hypothetical 9/16 full window
        assert!(!is_full_window("canvas-abc"));
    }

    #[test]
    fn empty_election_has_no_primary() {
        let election = Election::default();
        assert_eq!(election.primary(), None);
    }

    #[test]
    fn first_eligible_register_becomes_primary_and_reports_change() {
        let mut election = Election::default();
        assert!(election.register("main"));
        assert_eq!(election.primary(), Some("main"));
    }

    #[test]
    fn canvas_windows_are_ignored() {
        let mut election = Election::default();
        assert!(!election.register("canvas-abc"));
        assert_eq!(election.primary(), None);
        // …and an ignored canvas register never displaces a real primary.
        assert!(election.register("main"));
        assert!(!election.register("canvas-xyz"));
        assert_eq!(election.primary(), Some("main"));
    }

    #[test]
    fn duplicate_register_is_a_no_op() {
        let mut election = Election::default();
        assert!(election.register("main"));
        assert!(!election.register("main"));
        assert_eq!(election.primary(), Some("main"));
        // The duplicate did not double-track: one unregister empties it.
        assert!(election.unregister("main"));
        assert_eq!(election.primary(), None);
    }

    #[test]
    fn second_eligible_register_leaves_primary_unchanged() {
        let mut election = Election::default();
        assert!(election.register("main"));
        assert!(!election.register("app-2"));
        assert_eq!(election.primary(), Some("main"));
    }

    #[test]
    fn unregister_non_primary_leaves_primary_unchanged() {
        let mut election = Election::default();
        election.register("main");
        election.register("app-2");
        assert!(!election.unregister("app-2"));
        assert_eq!(election.primary(), Some("main"));
    }

    #[test]
    fn unregister_primary_promotes_next_oldest() {
        let mut election = Election::default();
        election.register("main");
        election.register("app-2");
        election.register("app-3");
        assert!(election.unregister("main"));
        // Oldest-surviving wins — not the newest.
        assert_eq!(election.primary(), Some("app-2"));
    }

    #[test]
    fn unregister_last_window_leaves_none() {
        let mut election = Election::default();
        election.register("main");
        assert!(election.unregister("main"));
        assert_eq!(election.primary(), None);
    }

    #[test]
    fn unregister_unknown_is_a_no_op() {
        let mut election = Election::default();
        election.register("main");
        assert!(!election.unregister("ghost"));
        assert!(!election.unregister("canvas-abc"));
        assert_eq!(election.primary(), Some("main"));
    }
}
