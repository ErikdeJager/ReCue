//! JSON persistence for sessions + recent working directories.
//!
//! Stores session metadata and the recents list in a single JSON file in the
//! Tauri app-data dir, written atomically (temp file + rename). This is a pure
//! data layer — no Tauri and no process spawning — so it is unit-tested directly
//! below.

use std::collections::HashMap;
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

/// A user-added Overview panel (a non-agent column), persisted per repo (#38).
/// Agent panels are derived from live sessions and are not stored here.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OverviewPanel {
    pub id: String,
    /// `"diff"` (#39) or `"markdown"` (#41).
    pub kind: String,
    /// Panel parameter, e.g. the markdown file path; `None` for a diff panel.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
}

/// The on-disk shape of the persistence file.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PersistedState {
    #[serde(default)]
    pub sessions: Vec<PersistedSession>,
    #[serde(default)]
    pub recents: Vec<String>,
    /// Per-repo color identity, keyed by repo path → hex (#35). `default` keeps
    /// older files (without this field) loading cleanly.
    #[serde(default)]
    pub repo_colors: HashMap<String, String>,
    /// Per-repo ordered list of extra Overview panels (#38).
    #[serde(default)]
    pub overview_panels: HashMap<String, Vec<OverviewPanel>>,
    /// Per-repo drag-reorder order (#43): an ordered list of item keys (agent
    /// session ids + panel ids) for a repo's Overview cluster. Keys not present
    /// are filtered, and present items missing here append in their default order,
    /// so spawn/exit merges in without scrambling. `default` keeps old files loading.
    #[serde(default)]
    pub overview_order: HashMap<String, Vec<String>>,
    /// Per-repo list of opened files (#45): repo-relative paths the user has opened
    /// in a file viewer, shown in the sidebar tree. `default` keeps old files loading.
    #[serde(default)]
    pub open_files: HashMap<String, Vec<String>>,
    /// The Canvas split-panel layout tree (#46), stored opaquely as JSON (the
    /// frontend owns the recursive shape). `null` = empty canvas. `default` keeps
    /// old files loading.
    #[serde(default)]
    pub canvas_layout: serde_json::Value,
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

    /// All assigned per-repo colors (path → hex). Unassigned repos derive a
    /// default color frontend-side (#35).
    pub fn repo_colors(&self) -> HashMap<String, String> {
        self.with(|state| state.repo_colors.clone())
    }

    /// Assign a repo's color and persist (#35).
    pub fn set_repo_color(&self, path: &str, color: &str) -> io::Result<()> {
        self.update(|state| {
            state
                .repo_colors
                .insert(path.to_string(), color.to_string());
        })
    }

    /// All per-repo Overview panel layouts (#38).
    pub fn overview_panels(&self) -> HashMap<String, Vec<OverviewPanel>> {
        self.with(|state| state.overview_panels.clone())
    }

    /// Replace a repo's Overview panel list and persist (#38); an empty list
    /// drops the entry so the map stays tidy.
    pub fn set_overview_panels(&self, path: &str, panels: Vec<OverviewPanel>) -> io::Result<()> {
        self.update(|state| {
            if panels.is_empty() {
                state.overview_panels.remove(path);
            } else {
                state.overview_panels.insert(path.to_string(), panels);
            }
        })
    }

    /// All per-repo Overview drag-reorder orders (#43).
    pub fn overview_order(&self) -> HashMap<String, Vec<String>> {
        self.with(|state| state.overview_order.clone())
    }

    /// Replace a repo's Overview item order and persist (#43); an empty list
    /// drops the entry so the map stays tidy.
    pub fn set_overview_order(&self, path: &str, order: Vec<String>) -> io::Result<()> {
        self.update(|state| {
            if order.is_empty() {
                state.overview_order.remove(path);
            } else {
                state.overview_order.insert(path.to_string(), order);
            }
        })
    }

    /// All per-repo opened-file lists (#45).
    pub fn open_files(&self) -> HashMap<String, Vec<String>> {
        self.with(|state| state.open_files.clone())
    }

    /// Replace a repo's opened-file list and persist (#45); an empty list drops
    /// the entry so the map stays tidy.
    pub fn set_open_files(&self, path: &str, files: Vec<String>) -> io::Result<()> {
        self.update(|state| {
            if files.is_empty() {
                state.open_files.remove(path);
            } else {
                state.open_files.insert(path.to_string(), files);
            }
        })
    }

    /// The Canvas layout tree (#46) — opaque JSON; `null` when the canvas is empty.
    pub fn canvas_layout(&self) -> serde_json::Value {
        self.with(|state| state.canvas_layout.clone())
    }

    /// Replace the Canvas layout tree and persist (#46).
    pub fn set_canvas_layout(&self, layout: serde_json::Value) -> io::Result<()> {
        self.update(|state| state.canvas_layout = layout)
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
    fn repo_colors_set_and_persist() {
        let path = temp_path("repocolors");
        let store = Store::load(&path);
        store.set_repo_color("/repo/a", "#cba6f7").unwrap();
        store.set_repo_color("/repo/a", "#a6e3a1").unwrap(); // overwrite
        store.set_repo_color("/repo/b", "#fab387").unwrap();

        let reloaded = Store::load(&path);
        let colors = reloaded.repo_colors();
        assert_eq!(colors.get("/repo/a").map(String::as_str), Some("#a6e3a1"));
        assert_eq!(colors.get("/repo/b").map(String::as_str), Some("#fab387"));
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn overview_panels_set_and_persist() {
        let path = temp_path("panels");
        let store = Store::load(&path);
        let panels = vec![
            OverviewPanel {
                id: "p1".into(),
                kind: "diff".into(),
                file: None,
            },
            OverviewPanel {
                id: "p2".into(),
                kind: "markdown".into(),
                file: Some("README.md".into()),
            },
        ];
        store
            .set_overview_panels("/repo/a", panels.clone())
            .unwrap();

        let reloaded = Store::load(&path);
        assert_eq!(reloaded.overview_panels().get("/repo/a"), Some(&panels));

        // An empty list drops the repo's entry.
        store.set_overview_panels("/repo/a", vec![]).unwrap();
        assert!(!Store::load(&path).overview_panels().contains_key("/repo/a"));
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn overview_order_set_and_persist() {
        let path = temp_path("order");
        let store = Store::load(&path);
        let order = vec!["sess-1".to_string(), "panel-1".to_string()];
        store.set_overview_order("/repo/a", order.clone()).unwrap();

        let reloaded = Store::load(&path);
        assert_eq!(reloaded.overview_order().get("/repo/a"), Some(&order));

        // An empty order drops the repo's entry.
        store.set_overview_order("/repo/a", vec![]).unwrap();
        assert!(!Store::load(&path).overview_order().contains_key("/repo/a"));
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn open_files_set_and_persist() {
        let path = temp_path("openfiles");
        let store = Store::load(&path);
        let files = vec!["README.md".to_string(), "src/main.rs".to_string()];
        store.set_open_files("/repo/a", files.clone()).unwrap();

        let reloaded = Store::load(&path);
        assert_eq!(reloaded.open_files().get("/repo/a"), Some(&files));

        // An empty list drops the repo's entry.
        store.set_open_files("/repo/a", vec![]).unwrap();
        assert!(!Store::load(&path).open_files().contains_key("/repo/a"));
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn canvas_layout_set_and_persist() {
        let path = temp_path("canvas");
        let store = Store::load(&path);
        // Defaults to null (empty canvas).
        assert!(store.canvas_layout().is_null());

        let tree = serde_json::json!({
            "type": "leaf",
            "id": "p1",
            "content": { "kind": "placeholder" }
        });
        store.set_canvas_layout(tree.clone()).unwrap();
        assert_eq!(Store::load(&path).canvas_layout(), tree);

        // Clearing back to null persists too.
        store.set_canvas_layout(serde_json::Value::Null).unwrap();
        assert!(Store::load(&path).canvas_layout().is_null());
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
