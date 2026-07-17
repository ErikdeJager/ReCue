//! Transient same-file soft-claim registry (Multi-window task 435).
//!
//! One window at a time is the authoritative editor of an auto-saved file
//! (`useAutoSaveFile` — the FileViewer raw/plain editor #148 and the Kanban board
//! #141–#151); every other window renders that file read-only with a "Take over"
//! affordance. **Advisory only** — never an on-disk lock: the backend never refuses
//! a `write_text_file`, claims live in memory and die with the process, and a
//! stale/raced claim degrades to last-writer-wins, exactly the pre-435 behavior.
//!
//! Structure mirrors `terminal_views.rs` (task 426): all policy lives in the pure,
//! fully unit-tested [`ClaimRegistry`] core (no Tauri, no locks) inside the thin
//! managed [`FileClaims`] wrapper (poison-recovering mutex + the task-428 broadcast
//! glue), with a `purge_window(label)` called from the `RunEvent::WindowEvent {
//! Destroyed }` arm in `lib.rs` so a closed/crashed editor window can never leave a
//! file stuck read-only elsewhere.
//!
//! Platform-neutral by construction: claim keys are opaque strings (a Windows
//! `C:\…` repo path is never parsed), events are global Tauri emits, no `#[cfg]`
//! arms.

use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

/// One claim, as broadcast/snapshotted to the frontend (the task-428 full-value
/// shape: every `file_claims://changed` emit carries the complete sorted list).
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct FileClaim {
    pub repo_path: String,
    pub file: String,
    /// The claiming window's Tauri label — generic (any future window kind),
    /// never parsed; matched against `WINDOW_LABEL` frontend-side.
    pub window: String,
}

/// Pure core: `(repo_path, file)` → holding window label. Keys are exact strings
/// (no normalization/canonicalization) — panels replicate across windows from the
/// shared persisted blobs, so the spellings are identical by construction.
#[derive(Default)]
pub struct ClaimRegistry {
    claims: HashMap<(String, String), String>,
}

impl ClaimRegistry {
    /// Set the claim (last claim wins — the take-over path is this same call).
    /// Returns true when the map changed (a same-label re-claim is a no-op, so
    /// the wrapper never re-broadcasts an unchanged snapshot).
    pub fn claim(&mut self, repo_path: &str, file: &str, label: &str) -> bool {
        let key = (repo_path.to_string(), file.to_string());
        if self.claims.get(&key).is_some_and(|holder| holder == label) {
            return false;
        }
        self.claims.insert(key, label.to_string());
        true
    }

    /// Release only if `label` still holds it — a stale release from a window
    /// that lost a take-over race must not clear the new holder. Returns changed.
    pub fn release(&mut self, repo_path: &str, file: &str, label: &str) -> bool {
        let key = (repo_path.to_string(), file.to_string());
        if self.claims.get(&key).is_some_and(|holder| holder == label) {
            self.claims.remove(&key);
            return true;
        }
        false
    }

    /// Drop every claim held by a closing window (and only those). Returns
    /// changed (any dropped); idempotent — a second purge finds nothing.
    pub fn purge_window(&mut self, label: &str) -> bool {
        let before = self.claims.len();
        self.claims.retain(|_, holder| holder != label);
        self.claims.len() != before
    }

    /// The full claim list, sorted by `(repo_path, file)` so snapshots and
    /// broadcasts are deterministic (stable JSON for the frontend's
    /// equality-guarded apply).
    pub fn snapshot(&self) -> Vec<FileClaim> {
        let mut list: Vec<FileClaim> = self
            .claims
            .iter()
            .map(|((repo_path, file), window)| FileClaim {
                repo_path: repo_path.clone(),
                file: file.clone(),
                window: window.clone(),
            })
            .collect();
        list.sort_by(|a, b| {
            (a.repo_path.as_str(), a.file.as_str()).cmp(&(b.repo_path.as_str(), b.file.as_str()))
        });
        list
    }
}

/// The Tauri-managed claim state: the pure [`ClaimRegistry`] behind a mutex, plus
/// the task-428 broadcast glue. INVARIANT: the state is mutated and the snapshot
/// taken BEFORE the emit (with the guard dropped first), so the `file_claims`
/// snapshot command can never lag an event a subscriber already saw
/// (subscribe-then-fetch never regresses).
#[derive(Default)]
pub struct FileClaims {
    inner: Mutex<ClaimRegistry>,
}

impl FileClaims {
    /// Poison-recovering lock (the `terminal_views` / `kill_all` precedent): a
    /// panicked holder leaves plain data behind, and every caller stays infallible.
    fn lock(&self) -> MutexGuard<'_, ClaimRegistry> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Broadcast the full snapshot (task-428 full-value shape). Best-effort — a
    /// teardown emit into dying webviews is a no-op.
    fn emit<R: Runtime>(app: &AppHandle<R>, snapshot: Vec<FileClaim>) {
        let _ = app.emit("file_claims://changed", snapshot);
    }

    /// Claim (or take over) a file for `label`; broadcast only on change.
    pub fn claim<R: Runtime>(&self, app: &AppHandle<R>, repo_path: &str, file: &str, label: &str) {
        let mut registry = self.lock();
        if !registry.claim(repo_path, file, label) {
            return;
        }
        let snapshot = registry.snapshot();
        drop(registry);
        Self::emit(app, snapshot);
    }

    /// Release `label`'s claim on a file; a stale release (another window took
    /// over) is a silent no-op — nothing changes, nothing is broadcast.
    pub fn release<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        repo_path: &str,
        file: &str,
        label: &str,
    ) {
        let mut registry = self.lock();
        if !registry.release(repo_path, file, label) {
            return;
        }
        let snapshot = registry.snapshot();
        drop(registry);
        Self::emit(app, snapshot);
    }

    /// Drop ALL of a closing window's claims (any window kind), broadcasting once
    /// if anything changed — the `Destroyed`-arm escape hatch (`lib.rs`).
    pub fn purge_window<R: Runtime>(&self, app: &AppHandle<R>, label: &str) {
        let mut registry = self.lock();
        if !registry.purge_window(label) {
            return;
        }
        let snapshot = registry.snapshot();
        drop(registry);
        Self::emit(app, snapshot);
    }

    /// The full current claim list — the late-subscriber snapshot command.
    pub fn snapshot(&self) -> Vec<FileClaim> {
        self.lock().snapshot()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn claim(repo: &str, file: &str, window: &str) -> FileClaim {
        FileClaim {
            repo_path: repo.to_string(),
            file: file.to_string(),
            window: window.to_string(),
        }
    }

    #[test]
    fn claim_on_a_free_key_changes_and_registers_the_holder() {
        let mut reg = ClaimRegistry::default();
        assert!(reg.claim("/repo", "notes.md", "main"));
        assert_eq!(reg.snapshot(), vec![claim("/repo", "notes.md", "main")]);
    }

    #[test]
    fn reclaim_by_the_same_label_is_not_a_change() {
        let mut reg = ClaimRegistry::default();
        reg.claim("/repo", "notes.md", "main");
        // No re-broadcast for the holder refreshing its own claim.
        assert!(!reg.claim("/repo", "notes.md", "main"));
        assert_eq!(reg.snapshot(), vec![claim("/repo", "notes.md", "main")]);
    }

    #[test]
    fn claim_by_a_different_label_transfers_the_holder() {
        let mut reg = ClaimRegistry::default();
        reg.claim("/repo", "notes.md", "main");
        // The take-over path: last claim wins.
        assert!(reg.claim("/repo", "notes.md", "canvas-1"));
        assert_eq!(reg.snapshot(), vec![claim("/repo", "notes.md", "canvas-1")]);
    }

    #[test]
    fn release_by_the_holder_changes_and_removes_the_claim() {
        let mut reg = ClaimRegistry::default();
        reg.claim("/repo", "notes.md", "main");
        assert!(reg.release("/repo", "notes.md", "main"));
        assert_eq!(reg.snapshot(), vec![]);
    }

    #[test]
    fn stale_release_by_a_non_holder_is_a_noop_keeping_the_holder() {
        let mut reg = ClaimRegistry::default();
        reg.claim("/repo", "notes.md", "canvas-1");
        // "main" lost a take-over race; its late release must not clear canvas-1.
        assert!(!reg.release("/repo", "notes.md", "main"));
        assert_eq!(reg.snapshot(), vec![claim("/repo", "notes.md", "canvas-1")]);
        // Releasing a never-claimed key is a no-op too.
        assert!(!reg.release("/repo", "other.md", "main"));
    }

    #[test]
    fn purge_window_drops_only_that_labels_claims_and_is_idempotent() {
        let mut reg = ClaimRegistry::default();
        reg.claim("/repo", "a.md", "main");
        reg.claim("/repo", "b.md", "canvas-1");
        reg.claim("/other", "c.md", "canvas-1");
        assert!(reg.purge_window("canvas-1"));
        // Only canvas-1's claims dropped; main's survives.
        assert_eq!(reg.snapshot(), vec![claim("/repo", "a.md", "main")]);
        // Idempotent: a second purge finds nothing and reports no change.
        assert!(!reg.purge_window("canvas-1"));
        // Purging a label with no claims is a clean no-op.
        assert!(!reg.purge_window("never-seen"));
        assert_eq!(reg.snapshot(), vec![claim("/repo", "a.md", "main")]);
    }

    #[test]
    fn snapshot_is_deterministically_sorted_by_repo_then_file() {
        let mut reg = ClaimRegistry::default();
        reg.claim("/z", "a.md", "main");
        reg.claim("/a", "z.md", "canvas-1");
        reg.claim("/a", "a.md", "canvas-2");
        assert_eq!(
            reg.snapshot(),
            vec![
                claim("/a", "a.md", "canvas-2"),
                claim("/a", "z.md", "canvas-1"),
                claim("/z", "a.md", "main"),
            ]
        );
    }

    #[test]
    fn windows_style_paths_are_opaque_keys() {
        // A `C:\…` repo path is never parsed — distinct spellings are distinct keys.
        let mut reg = ClaimRegistry::default();
        assert!(reg.claim("C:\\repo", "notes.md", "main"));
        assert!(reg.claim("C:/repo", "notes.md", "canvas-1"));
        assert_eq!(reg.snapshot().len(), 2);
    }

    #[test]
    fn same_repo_different_files_are_independent_claims() {
        let mut reg = ClaimRegistry::default();
        reg.claim("/repo", "a.md", "main");
        reg.claim("/repo", "b.md", "canvas-1");
        assert!(reg.release("/repo", "a.md", "main"));
        assert_eq!(reg.snapshot(), vec![claim("/repo", "b.md", "canvas-1")]);
    }

    #[test]
    fn wrapper_claim_release_purge_route_through_the_registry() {
        let app = tauri::test::mock_app();
        let handle = app.handle();
        let claims = FileClaims::default();

        claims.claim(handle, "/repo", "notes.md", "main");
        assert_eq!(claims.snapshot(), vec![claim("/repo", "notes.md", "main")]);
        claims.claim(handle, "/repo", "notes.md", "main"); // same holder → unchanged
        claims.claim(handle, "/repo", "notes.md", "app-2"); // take-over
        assert_eq!(claims.snapshot(), vec![claim("/repo", "notes.md", "app-2")]);

        claims.release(handle, "/repo", "notes.md", "main"); // stale → silent no-op
        assert_eq!(claims.snapshot(), vec![claim("/repo", "notes.md", "app-2")]);
        claims.release(handle, "/repo", "notes.md", "app-2"); // holder → removed
        assert_eq!(claims.snapshot(), vec![]);

        claims.claim(handle, "/repo", "a.md", "app-2");
        claims.claim(handle, "/repo", "b.md", "app-2");
        claims.claim(handle, "/repo", "c.md", "main");
        claims.purge_window(handle, "app-2"); // drops exactly that window's claims
        assert_eq!(claims.snapshot(), vec![claim("/repo", "c.md", "main")]);
        claims.purge_window(handle, "app-2"); // idempotent second purge → no-op
        assert_eq!(claims.snapshot(), vec![claim("/repo", "c.md", "main")]);
    }
}
