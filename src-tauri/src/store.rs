//! JSON persistence for sessions + recent working directories.
//!
//! Stores session metadata and the recents list in a single JSON file in the
//! Tauri app-data dir, written atomically (temp file + rename). This is a pure
//! data layer — no Tauri and no process spawning — so it is unit-tested directly
//! below.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

/// Maximum number of recent working directories retained.
const RECENTS_CAP: usize = 12;

/// A persisted session record.
///
/// `id` is ClaudeCue's own session id; `claude_session_id` is the id handed to
/// `claude --session-id` for resume (currently the same UUID). They are kept as
/// separate fields so the capture mechanism can change without a data migration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PersistedSession {
    pub id: String,
    pub claude_session_id: String,
    pub repo_path: String,
    pub name: Option<String>,
    pub created_at: u64,
}

/// The on-disk shape of the persistence file.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PersistedState {
    #[serde(default)]
    pub sessions: Vec<PersistedSession>,
    #[serde(default)]
    pub recents: Vec<String>,
}

/// Thread-safe persistent store backed by a JSON file.
pub struct Store {
    path: PathBuf,
    inner: Mutex<PersistedState>,
}

impl Store {
    /// Load from `path`, falling back to an empty state if the file is missing
    /// or unreadable/corrupt (the file is left untouched until the next write).
    pub fn load(path: impl AsRef<Path>) -> Self {
        let path = path.as_ref().to_path_buf();
        let inner = fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<PersistedState>(&bytes).ok())
            .unwrap_or_default();
        Self {
            path,
            inner: Mutex::new(inner),
        }
    }

    /// All persisted sessions, in insertion order.
    pub fn sessions(&self) -> Vec<PersistedSession> {
        self.with(|state| state.sessions.clone())
    }

    /// Recent working directories, most-recently-used first.
    pub fn recents(&self) -> Vec<String> {
        self.with(|state| state.recents.clone())
    }

    /// A single persisted session by id, if present.
    pub fn session(&self, id: &str) -> Option<PersistedSession> {
        self.with(|state| state.sessions.iter().find(|s| s.id == id).cloned())
    }

    /// Add a session record (replacing any existing one with the same id) and
    /// persist.
    pub fn add_session(&self, session: PersistedSession) -> io::Result<()> {
        self.update(|state| {
            state.sessions.retain(|existing| existing.id != session.id);
            state.sessions.push(session);
        })
    }

    /// Remove a session record by id and persist, so it does not reappear after
    /// a restart.
    pub fn remove_session(&self, id: &str) -> io::Result<()> {
        self.update(|state| state.sessions.retain(|existing| existing.id != id))
    }

    /// Record a working directory as most-recently-used (de-duplicated, capped)
    /// and persist.
    pub fn touch_recent(&self, path: &str) -> io::Result<()> {
        self.update(|state| {
            state.recents.retain(|existing| existing != path);
            state.recents.insert(0, path.to_string());
            state.recents.truncate(RECENTS_CAP);
        })
    }

    /// Drop a working directory from recents and persist, so a "forgotten" folder
    /// (#31) does not reappear after a restart.
    pub fn remove_recent(&self, path: &str) -> io::Result<()> {
        self.update(|state| state.recents.retain(|existing| existing != path))
    }

    fn with<R>(&self, read: impl FnOnce(&PersistedState) -> R) -> R {
        let guard = self
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        read(&guard)
    }

    fn update(&self, mutate: impl FnOnce(&mut PersistedState)) -> io::Result<()> {
        let mut guard = self
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        mutate(&mut guard);
        self.persist(&guard)
    }

    fn persist(&self, state: &PersistedState) -> io::Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_vec_pretty(state)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        // Atomic write: temp file in the same dir, then rename over the target.
        let tmp = self.path.with_extension("tmp");
        fs::write(&tmp, &json)?;
        fs::rename(&tmp, &self.path)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(id: &str, path: &str) -> PersistedSession {
        PersistedSession {
            id: id.to_string(),
            claude_session_id: id.to_string(),
            repo_path: path.to_string(),
            name: None,
            created_at: 0,
        }
    }

    fn temp_path(tag: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!("claudecue-store-{tag}-{}.json", std::process::id()));
        let _ = fs::remove_file(&path);
        path
    }

    #[test]
    fn missing_file_loads_empty() {
        let store = Store::load(temp_path("missing"));
        assert!(store.sessions().is_empty());
        assert!(store.recents().is_empty());
    }

    #[test]
    fn round_trips_through_disk() {
        let path = temp_path("roundtrip");
        let store = Store::load(&path);
        store.add_session(record("a", "/repo/a")).unwrap();
        store.touch_recent("/repo/a").unwrap();

        let reloaded = Store::load(&path);
        assert_eq!(reloaded.sessions(), store.sessions());
        assert_eq!(reloaded.recents(), vec!["/repo/a".to_string()]);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn remove_recent_drops_the_dir_and_persists() {
        let path = temp_path("removerecent");
        let store = Store::load(&path);
        store.touch_recent("/repo/a").unwrap();
        store.touch_recent("/repo/b").unwrap();
        store.remove_recent("/repo/a").unwrap();
        assert_eq!(store.recents(), vec!["/repo/b".to_string()]);

        // The removal survives a reload (the folder won't reappear after restart).
        let reloaded = Store::load(&path);
        assert_eq!(reloaded.recents(), vec!["/repo/b".to_string()]);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn recents_dedup_and_order_most_recent_first() {
        let path = temp_path("recents");
        let store = Store::load(&path);
        store.touch_recent("/a").unwrap();
        store.touch_recent("/b").unwrap();
        store.touch_recent("/a").unwrap();
        assert_eq!(store.recents(), vec!["/a".to_string(), "/b".to_string()]);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn recents_are_capped() {
        let path = temp_path("cap");
        let store = Store::load(&path);
        for i in 0..(RECENTS_CAP + 5) {
            store.touch_recent(&format!("/repo/{i}")).unwrap();
        }
        assert_eq!(store.recents().len(), RECENTS_CAP);
        assert_eq!(store.recents()[0], format!("/repo/{}", RECENTS_CAP + 4));
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn session_lookup_by_id() {
        let path = temp_path("lookup");
        let store = Store::load(&path);
        store.add_session(record("s1", "/repo/x")).unwrap();
        assert_eq!(store.session("s1").unwrap().repo_path, "/repo/x");
        assert!(store.session("missing").is_none());
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn add_replaces_by_id_and_remove_prevents_reappearing() {
        let path = temp_path("addremove");
        let store = Store::load(&path);
        store.add_session(record("s1", "/repo/x")).unwrap();
        store.add_session(record("s1", "/repo/y")).unwrap(); // same id -> replace
        assert_eq!(store.sessions().len(), 1);
        assert_eq!(store.sessions()[0].repo_path, "/repo/y");

        store.add_session(record("s2", "/repo/z")).unwrap();
        store.remove_session("s1").unwrap();

        let reloaded = Store::load(&path);
        let ids: Vec<_> = reloaded.sessions().iter().map(|s| s.id.clone()).collect();
        assert_eq!(ids, vec!["s2".to_string()]);
        let _ = fs::remove_file(&path);
    }
}
