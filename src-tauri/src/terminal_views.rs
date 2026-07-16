//! Terminal-view attachment registry + smallest-wins PTY size arbitration
//! (multi-window card 1/16, task 426).
//!
//! The single authoritative answer to "who is viewing session X, how big must
//! its PTY grid be, and which windows must receive its output". A **view** is
//! one window's terminal host for a session, identified by
//! `(session id, window label)` and carrying a desired
//! `(cols, rows)`. The **effective grid** is the component-wise minimum over all
//! attached views — tmux's `window-size=smallest` policy — so every window always
//! sees the complete grid and larger views letterbox.
//!
//! **Targeted delivery rule (task 440):** the registry additionally tracks, per
//! session, the window labels holding a **live terminal host** (`output_subs`),
//! and the `lib.rs` forwarder `emit_filter`s `session://output` / `session://size`
//! to exactly that set — skipping the encode + emit entirely when it is empty.
//! Delivery keys on host *lifetime* (subscribe at host creation, unsubscribe at
//! host dispose / window purge), NOT on attached views — see the field doc.
//!
//! Structure follows the `linux_webkit.rs` pattern: all policy lives in the pure,
//! fully unit-tested [`ViewRegistry`] core (no Tauri, no locks), with the impure
//! glue kept thin in the [`TerminalViews`] managed wrapper (resize + broadcast).
//!
//! **Lock-order rule:** the registry mutex may be held while calling into
//! `SessionManager` (its sessions / master / events locks), but `pty.rs` must
//! never call into `terminal_views`, so no lock cycle is possible. Holding the
//! lock across the whole mutation + resize + broadcast is deliberate — the same
//! out-of-order-resize argument that keeps `resize_pty` synchronous (#353); these
//! are UI-cadence calls, so contention is negligible.
//!
//! **Transitional note (card 1/16):** the legacy `resize_pty` passthrough
//! (`terminalPool.ts` → the `resize_pty` command) bypasses this registry, so a
//! legacy call can move the real PTY size without `applied` knowing. Accepted for
//! this card — nothing attaches yet — and resolved when later epic cards migrate
//! the frontend onto attach/propose.

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use crate::pty::SessionManager;

/// Result of one registry mutation: the session's current effective grid and
/// whether it differs from the last size the arbiter applied to the PTY.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SizeUpdate {
    pub cols: u16,
    pub rows: u16,
    /// True when the effective grid changed vs the last applied size —
    /// i.e. the caller must `master.resize` (and record the new applied size).
    pub resized: bool,
}

/// Pure registry core: which windows view each session, each view's desired
/// grid, and the last effective grid the arbiter applied to each PTY.
#[derive(Default)]
pub struct ViewRegistry {
    /// session id → (window label → desired (cols, rows)).
    views: HashMap<String, HashMap<String, (u16, u16)>>,
    /// session id → last effective size the arbiter applied to the PTY.
    applied: HashMap<String, (u16, u16)>,
    /// session id → window labels holding a LIVE terminal host for it (task 440).
    /// Deliberately separate from `views`: a parked host detaches its sized view
    /// (task 427) so it never clamps the grid, but its xterm keeps consuming
    /// output — the pool never re-replays on re-mount (#18/#351), so output
    /// delivery must follow host lifetime, not view attachment.
    output_subs: HashMap<String, HashSet<String>>,
}

/// Clamp a desired dimension to at least 1 on the way in — a 0-dimension
/// `PtySize` is nonsense and would wedge the component-wise min at 0.
fn clamp_dim(dim: u16) -> u16 {
    dim.max(1)
}

impl ViewRegistry {
    /// The session's effective grid: component-wise min over its views.
    /// `None` when the session has no attached views.
    pub fn effective(&self, id: &str) -> Option<(u16, u16)> {
        self.views
            .get(id)?
            .values()
            .copied()
            .reduce(|(ac, ar), (bc, br)| (ac.min(bc), ar.min(br)))
    }

    /// Upsert a view (a re-attach replaces its desired size) and recompute.
    /// `resized` is true when the effective grid differs from the last applied
    /// size (a session with no `applied` entry counts as changed); when set,
    /// the new applied size is recorded.
    ///
    /// Also upserts the label as an output subscriber (task 440) — a self-heal:
    /// an attached view implies a live host, so even if a `subscribe_output`
    /// was lost, delivery recovers on the next mount. Harmless when already
    /// present. `detach` deliberately does NOT undo this (the park case — see
    /// `output_subs`).
    pub fn attach(&mut self, id: &str, label: &str, cols: u16, rows: u16) -> SizeUpdate {
        self.subscribe_output(id, label);
        self.views
            .entry(id.to_string())
            .or_default()
            .insert(label.to_string(), (clamp_dim(cols), clamp_dim(rows)));
        self.recompute(id)
            .expect("attach guarantees the session has at least one view")
    }

    /// Register `label` as holding a live terminal host for `id` (task 440):
    /// the forwarder delivers that session's `session://output` /
    /// `session://size` to exactly these windows. Idempotent upsert.
    pub fn subscribe_output(&mut self, id: &str, label: &str) {
        self.output_subs
            .entry(id.to_string())
            .or_default()
            .insert(label.to_string());
    }

    /// Remove `label` from `id`'s output subscribers (task 440 — the host was
    /// disposed), dropping the session's entry when emptied (the no-leak rule
    /// `detach` already follows). Unknown session/label is a no-op.
    pub fn unsubscribe_output(&mut self, id: &str, label: &str) {
        if let Some(labels) = self.output_subs.get_mut(id) {
            labels.remove(label);
            if labels.is_empty() {
                self.output_subs.remove(id);
            }
        }
    }

    /// The window labels holding a live terminal host for `id` (task 440) — a
    /// clone, so the forwarder can hold it past the registry lock. Empty for an
    /// unknown session (⇒ the forwarder skips the encode + emit entirely).
    pub fn output_targets(&self, id: &str) -> HashSet<String> {
        self.output_subs.get(id).cloned().unwrap_or_default()
    }

    /// Remove a view and recompute. `None` when the view was unknown (a no-op)
    /// or it was the session's last view — in which case both map entries are
    /// dropped (no leak; the PTY keeps its last size, nothing to resize or
    /// broadcast). Otherwise `Some(update)`, with `resized` as in [`Self::attach`]
    /// (false when the surviving views leave the effective grid unchanged).
    ///
    /// Deliberately does NOT touch `output_subs` (task 440): a detach is how a
    /// *parked* host stops clamping the grid (task 427), but its xterm keeps
    /// consuming live bytes — dropping delivery here would permanently starve
    /// the buffer, since the pool never re-replays on re-mount (#18/#351). The
    /// subscription ends only at host dispose (`unsubscribe_output`) or window
    /// close (`purge_window`).
    pub fn detach(&mut self, id: &str, label: &str) -> Option<SizeUpdate> {
        let views = self.views.get_mut(id)?;
        views.remove(label)?;
        if views.is_empty() {
            self.views.remove(id);
            self.applied.remove(id);
            return None;
        }
        self.recompute(id)
    }

    /// Update a view's desired size **only if that `(id, label)` view is already
    /// attached** — a proposal for a never-attached or already-purged view is a
    /// `None` no-op (this prevents a late `ResizeObserver` racing a window close
    /// from resurrecting a zombie view that would clamp the PTY forever).
    /// Otherwise `Some(update)`, with `resized` as in [`Self::attach`].
    pub fn propose(&mut self, id: &str, label: &str, cols: u16, rows: u16) -> Option<SizeUpdate> {
        let view = self.views.get_mut(id)?.get_mut(label)?;
        *view = (clamp_dim(cols), clamp_dim(rows));
        self.recompute(id)
    }

    /// Remove the window label's view from **every** session (a window closed —
    /// its desired size must never clamp a PTY it no longer renders), dropping
    /// emptied sessions entirely. Returns exactly the sessions that still have
    /// views **and** whose effective grid changed.
    ///
    /// Also sweeps `label` from every session's output subscribers (task 440,
    /// dropping emptied entries) — a closed window must never remain a delivery
    /// target; its hosts died with the webview without a chance to unsubscribe.
    pub fn purge_window(&mut self, label: &str) -> Vec<(String, SizeUpdate)> {
        self.output_subs.retain(|_, labels| {
            labels.remove(label);
            !labels.is_empty()
        });
        let ids: Vec<String> = self
            .views
            .iter()
            .filter(|(_, views)| views.contains_key(label))
            .map(|(id, _)| id.clone())
            .collect();
        let mut changed = Vec::new();
        for id in ids {
            if let Some(update) = self.detach(&id, label) {
                if update.resized {
                    changed.push((id, update));
                }
            }
        }
        changed
    }

    /// Recompute the session's effective grid vs the last applied size,
    /// recording the new applied size on change. `None` when no views remain.
    fn recompute(&mut self, id: &str) -> Option<SizeUpdate> {
        let (cols, rows) = self.effective(id)?;
        let resized = self.applied.get(id) != Some(&(cols, rows));
        if resized {
            self.applied.insert(id.to_string(), (cols, rows));
        }
        Some(SizeUpdate {
            cols,
            rows,
            resized,
        })
    }
}

/// The Tauri-managed arbiter state: the pure [`ViewRegistry`] behind a mutex,
/// plus the resize + broadcast glue. Deliberately Tauri-free (like
/// `SessionManager`) so it is testable against a bare manager.
#[derive(Default)]
pub struct TerminalViews {
    inner: Mutex<ViewRegistry>,
}

impl TerminalViews {
    /// Poison-recovering lock (the `kill_all` precedent): a panicked holder
    /// leaves plain data behind, and every caller must stay infallible.
    fn lock(&self) -> std::sync::MutexGuard<'_, ViewRegistry> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Attach a view; resize the PTY when the effective grid changed
    /// (best-effort — the session may not exist / have exited), and **always**
    /// broadcast the grid so the new host learns it even when unchanged.
    /// Returns the effective grid the attaching host must render.
    pub fn attach(
        &self,
        manager: &SessionManager,
        id: &str,
        label: &str,
        cols: u16,
        rows: u16,
    ) -> (u16, u16) {
        let mut registry = self.lock();
        let update = registry.attach(id, label, cols, rows);
        if update.resized {
            let _ = manager.resize_pty(id, update.cols, update.rows);
        }
        manager.broadcast_size(id, update.cols, update.rows);
        (update.cols, update.rows)
    }

    /// Detach a view; on an effective-grid change, best-effort resize + broadcast.
    pub fn detach(&self, manager: &SessionManager, id: &str, label: &str) {
        let mut registry = self.lock();
        if let Some(update) = registry.detach(id, label) {
            if update.resized {
                let _ = manager.resize_pty(id, update.cols, update.rows);
                manager.broadcast_size(id, update.cols, update.rows);
            }
        }
    }

    /// Update an attached view's desired size; on an effective-grid change,
    /// best-effort resize + broadcast. A never-attached view is a no-op.
    pub fn propose(&self, manager: &SessionManager, id: &str, label: &str, cols: u16, rows: u16) {
        let mut registry = self.lock();
        if let Some(update) = registry.propose(id, label, cols, rows) {
            if update.resized {
                let _ = manager.resize_pty(id, update.cols, update.rows);
                manager.broadcast_size(id, update.cols, update.rows);
            }
        }
    }

    /// Drop ALL of a closing window's views (any window kind), best-effort
    /// resizing + broadcasting each session whose effective grid changed.
    /// Also sweeps the label from every session's output subscribers (task 440).
    pub fn purge_window(&self, manager: &SessionManager, label: &str) {
        let mut registry = self.lock();
        for (id, update) in registry.purge_window(label) {
            let _ = manager.resize_pty(&id, update.cols, update.rows);
            manager.broadcast_size(&id, update.cols, update.rows);
        }
    }

    /// Register `label` as an output subscriber for `id` (task 440). No
    /// `SessionManager` needed — nothing to resize or broadcast.
    pub fn subscribe_output(&self, id: &str, label: &str) {
        self.lock().subscribe_output(id, label);
    }

    /// Remove `label` from `id`'s output subscribers (task 440).
    pub fn unsubscribe_output(&self, id: &str, label: &str) {
        self.lock().unsubscribe_output(id, label);
    }

    /// The window labels the forwarder must deliver `id`'s output/size events
    /// to (task 440) — a clone held past the lock; empty when unknown.
    pub fn output_targets(&self, id: &str) -> HashSet<String> {
        self.lock().output_targets(id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pty::SessionEvent;
    use std::sync::mpsc;
    use std::time::Duration;

    // --- pure ViewRegistry core ---

    #[test]
    fn single_attach_effective_is_that_views_size() {
        let mut reg = ViewRegistry::default();
        let update = reg.attach("s", "main", 120, 40);
        assert_eq!(
            update,
            SizeUpdate {
                cols: 120,
                rows: 40,
                resized: true,
            }
        );
        assert_eq!(reg.effective("s"), Some((120, 40)));
    }

    #[test]
    fn two_views_effective_is_component_wise_min() {
        let mut reg = ViewRegistry::default();
        reg.attach("s", "main", 100, 20);
        let update = reg.attach("s", "canvas-1", 80, 40);
        // (100, 20) + (80, 40) → (80, 20): min per component, not per view.
        assert_eq!(
            update,
            SizeUpdate {
                cols: 80,
                rows: 20,
                resized: true,
            }
        );
        assert_eq!(reg.effective("s"), Some((80, 20)));
    }

    #[test]
    fn reattach_same_view_upserts_desired_size() {
        let mut reg = ViewRegistry::default();
        reg.attach("s", "main", 100, 30);
        let update = reg.attach("s", "main", 90, 25);
        // The old (100, 30) desire is replaced, not min-ed with.
        assert_eq!(reg.effective("s"), Some((90, 25)));
        assert!(update.resized);
        // Re-attach with the identical size: still one view, nothing resized.
        let update = reg.attach("s", "main", 90, 25);
        assert_eq!(
            update,
            SizeUpdate {
                cols: 90,
                rows: 25,
                resized: false,
            }
        );
    }

    #[test]
    fn detach_recomputes_and_grid_grows_back() {
        let mut reg = ViewRegistry::default();
        reg.attach("s", "main", 100, 20);
        reg.attach("s", "canvas-1", 80, 40);
        assert_eq!(reg.effective("s"), Some((80, 20)));
        let update = reg.detach("s", "canvas-1");
        // The clamping view left → the grid grows back to the survivor's desire.
        assert_eq!(
            update,
            Some(SizeUpdate {
                cols: 100,
                rows: 20,
                resized: true,
            })
        );
        assert_eq!(reg.effective("s"), Some((100, 20)));
    }

    #[test]
    fn detach_that_leaves_grid_unchanged_reports_not_resized() {
        let mut reg = ViewRegistry::default();
        reg.attach("s", "small", 80, 20);
        reg.attach("s", "large", 200, 60);
        // Dropping the non-clamping view changes nothing.
        let update = reg.detach("s", "large");
        assert_eq!(
            update,
            Some(SizeUpdate {
                cols: 80,
                rows: 20,
                resized: false,
            })
        );
    }

    #[test]
    fn detaching_last_view_drops_both_map_entries() {
        let mut reg = ViewRegistry::default();
        reg.attach("s", "main", 100, 30);
        assert_eq!(reg.detach("s", "main"), None);
        // No leak: both internal maps drop the session's key entirely.
        assert!(!reg.views.contains_key("s"));
        assert!(!reg.applied.contains_key("s"));
        assert_eq!(reg.effective("s"), None);
    }

    #[test]
    fn detach_of_unknown_view_is_a_none_noop() {
        let mut reg = ViewRegistry::default();
        assert_eq!(reg.detach("nope", "main"), None);
        reg.attach("s", "main", 100, 30);
        assert_eq!(reg.detach("s", "other-window"), None);
        // The real view is untouched.
        assert_eq!(reg.effective("s"), Some((100, 30)));
    }

    #[test]
    fn propose_reports_resized_only_when_effective_grid_changed() {
        let mut reg = ViewRegistry::default();
        reg.attach("s", "small", 80, 20);
        reg.attach("s", "large", 200, 60);
        // Shrinking the non-clamping view above the min: desired changes,
        // effective doesn't.
        let update = reg.propose("s", "large", 150, 50);
        assert_eq!(
            update,
            Some(SizeUpdate {
                cols: 80,
                rows: 20,
                resized: false,
            })
        );
        // Shrinking it below the min: the effective grid follows.
        let update = reg.propose("s", "large", 60, 50);
        assert_eq!(
            update,
            Some(SizeUpdate {
                cols: 60,
                rows: 20,
                resized: true,
            })
        );
    }

    #[test]
    fn propose_for_never_attached_view_is_a_none_noop() {
        let mut reg = ViewRegistry::default();
        assert_eq!(reg.propose("s", "main", 100, 30), None);
        // Nothing was resurrected — the zombie-view guard.
        assert_eq!(reg.effective("s"), None);
        assert!(!reg.views.contains_key("s"));
        // Same for a session that exists but a label that doesn't.
        reg.attach("s", "main", 100, 30);
        assert_eq!(reg.propose("s", "closed-window", 10, 10), None);
        assert_eq!(reg.effective("s"), Some((100, 30)));
    }

    #[test]
    fn purge_window_drops_all_of_a_labels_views_and_reports_changed_sessions() {
        let mut reg = ViewRegistry::default();
        // s1: the purged window clamps → its grid changes on purge.
        reg.attach("s1", "main", 120, 40);
        reg.attach("s1", "canvas-1", 80, 20);
        // s2: the purged window does NOT clamp → unchanged, not reported.
        reg.attach("s2", "main", 90, 25);
        reg.attach("s2", "canvas-1", 200, 60);
        // s3: only the purged window views it → emptied, not reported.
        reg.attach("s3", "canvas-1", 100, 30);
        // s4: never viewed by the purged window → untouched.
        reg.attach("s4", "main", 50, 15);

        let changed = reg.purge_window("canvas-1");
        assert_eq!(
            changed,
            vec![(
                "s1".to_string(),
                SizeUpdate {
                    cols: 120,
                    rows: 40,
                    resized: true,
                }
            )]
        );
        // The label's views are gone everywhere; survivors keep theirs.
        assert_eq!(reg.effective("s1"), Some((120, 40)));
        assert_eq!(reg.effective("s2"), Some((90, 25)));
        assert_eq!(reg.effective("s3"), None);
        assert!(!reg.views.contains_key("s3"));
        assert!(!reg.applied.contains_key("s3"));
        assert_eq!(reg.effective("s4"), Some((50, 15)));
        // A second purge finds nothing — idempotent.
        assert_eq!(reg.purge_window("canvas-1"), vec![]);
    }

    #[test]
    fn zero_dimensions_clamp_to_one() {
        let mut reg = ViewRegistry::default();
        let update = reg.attach("s", "main", 0, 0);
        assert_eq!((update.cols, update.rows), (1, 1));
        assert_eq!(reg.effective("s"), Some((1, 1)));
        // propose clamps too.
        reg.attach("s", "main", 100, 30);
        let update = reg.propose("s", "main", 0, 24).unwrap();
        assert_eq!((update.cols, update.rows), (1, 24));
    }

    #[test]
    fn effective_of_unknown_session_is_none() {
        let reg = ViewRegistry::default();
        assert_eq!(reg.effective("never-seen"), None);
    }

    // --- output-subscriber dimension (task 440) ---

    #[test]
    fn subscribe_output_makes_the_label_a_target() {
        let mut reg = ViewRegistry::default();
        reg.subscribe_output("s", "main");
        reg.subscribe_output("s", "app-1");
        let targets = reg.output_targets("s");
        assert!(targets.contains("main"));
        assert!(targets.contains("app-1"));
        assert_eq!(targets.len(), 2);
        // Idempotent upsert.
        reg.subscribe_output("s", "main");
        assert_eq!(reg.output_targets("s").len(), 2);
    }

    #[test]
    fn unsubscribe_output_drops_the_label_and_empties_the_map_entry() {
        let mut reg = ViewRegistry::default();
        reg.subscribe_output("s", "main");
        reg.subscribe_output("s", "app-1");
        reg.unsubscribe_output("s", "app-1");
        assert_eq!(reg.output_targets("s").len(), 1);
        reg.unsubscribe_output("s", "main");
        // No leak: the emptied session entry is dropped entirely.
        assert!(!reg.output_subs.contains_key("s"));
        assert!(reg.output_targets("s").is_empty());
        // Unknown session/label: a no-op, never a panic.
        reg.unsubscribe_output("nope", "main");
    }

    #[test]
    fn attach_alone_implies_subscribed() {
        let mut reg = ViewRegistry::default();
        reg.attach("s", "main", 100, 30);
        // The self-heal upsert: an attached view implies a live host.
        assert!(reg.output_targets("s").contains("main"));
    }

    #[test]
    fn attach_then_detach_keeps_the_subscription_the_park_case() {
        let mut reg = ViewRegistry::default();
        reg.attach("s", "main", 100, 30);
        reg.detach("s", "main");
        // The park case (task 427/440): a parked host detaches its sized view
        // but its xterm keeps consuming output — the pool never re-replays on
        // re-mount, so delivery must survive the detach.
        assert!(reg.output_targets("s").contains("main"));
    }

    #[test]
    fn purge_window_clears_the_label_from_every_sessions_subscribers() {
        let mut reg = ViewRegistry::default();
        reg.subscribe_output("s1", "main");
        reg.subscribe_output("s1", "app-1");
        reg.subscribe_output("s2", "app-1");
        reg.purge_window("app-1");
        // The purged label is gone everywhere; other labels survive.
        assert_eq!(
            reg.output_targets("s1"),
            HashSet::from(["main".to_string()])
        );
        assert!(reg.output_targets("s2").is_empty());
        // s2's emptied entry is dropped entirely (no leak).
        assert!(!reg.output_subs.contains_key("s2"));
    }

    #[test]
    fn output_targets_of_unknown_session_is_empty() {
        let reg = ViewRegistry::default();
        assert!(reg.output_targets("never-seen").is_empty());
    }

    // --- TerminalViews glue against a real (sessionless) SessionManager ---
    //
    // `SessionManager::new` with no sessions spawned is platform-neutral (no PTY):
    // the best-effort `resize_pty` fails silently (`SessionNotFound`), and the
    // test channel observes exactly the `SessionEvent::Size` broadcasts.

    fn glue() -> (TerminalViews, SessionManager, mpsc::Receiver<SessionEvent>) {
        let (tx, rx) = mpsc::channel();
        (TerminalViews::default(), SessionManager::new(tx), rx)
    }

    fn recv_size(rx: &mpsc::Receiver<SessionEvent>) -> (String, u16, u16) {
        match rx.recv_timeout(Duration::from_secs(1)) {
            Ok(SessionEvent::Size { id, cols, rows }) => (id, cols, rows),
            other => panic!("expected a Size event, got {other:?}"),
        }
    }

    #[test]
    fn glue_attach_always_broadcasts_even_when_unchanged() {
        let (views, manager, rx) = glue();
        assert_eq!(views.attach(&manager, "s", "main", 100, 30), (100, 30));
        assert_eq!(recv_size(&rx), ("s".to_string(), 100, 30));
        // An identical second attach doesn't resize, but the new-host emit
        // still fires so the attaching host learns the grid.
        assert_eq!(views.attach(&manager, "s", "main", 100, 30), (100, 30));
        assert_eq!(recv_size(&rx), ("s".to_string(), 100, 30));
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn glue_detach_broadcasts_only_on_grid_change() {
        let (views, manager, rx) = glue();
        views.attach(&manager, "s", "main", 100, 20);
        views.attach(&manager, "s", "canvas-1", 80, 40);
        // Drain the two attach emits.
        recv_size(&rx);
        assert_eq!(recv_size(&rx), ("s".to_string(), 80, 20));
        // Detaching the clamping view changes the min → one broadcast.
        views.detach(&manager, "s", "canvas-1");
        assert_eq!(recv_size(&rx), ("s".to_string(), 100, 20));
        // Detaching the last view: nothing to resize or broadcast.
        views.detach(&manager, "s", "main");
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn glue_purge_broadcasts_per_changed_session() {
        let (views, manager, rx) = glue();
        views.attach(&manager, "s1", "main", 120, 40);
        views.attach(&manager, "s1", "canvas-1", 80, 20);
        views.attach(&manager, "s2", "main", 90, 25);
        views.attach(&manager, "s2", "canvas-1", 200, 60);
        for _ in 0..4 {
            recv_size(&rx);
        }
        // Only s1's grid changes (s2's purged view never clamped it).
        views.purge_window(&manager, "canvas-1");
        assert_eq!(recv_size(&rx), ("s1".to_string(), 120, 40));
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn glue_propose_on_unattached_view_emits_nothing() {
        let (views, manager, rx) = glue();
        views.propose(&manager, "s", "never-attached", 80, 24);
        assert!(rx.try_recv().is_err());
    }
}
