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

/// serde default for a record's `agent` (#101): older records (written before the
/// field existed) load as Claude, preserving today's behavior. Matches
/// `agents::DEFAULT_AGENT_ID`.
fn default_agent() -> String {
    "claude".to_string()
}

/// Serde default for `forkable` (#138): older records (and uncertainty) are
/// **fail-open** — Fork stays available unless we positively know there's no
/// conversation. A freshly spawned session is explicitly set `false`.
fn default_true() -> bool {
    true
}

/// A persisted session record.
///
/// `id` is ReCue's own session id; `claude_session_id` is the id handed to
/// `claude --session-id` for resume (currently the same UUID). They are kept as
/// separate fields so the capture mechanism can change without a data migration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PersistedSession {
    pub id: String,
    pub claude_session_id: String,
    pub repo_path: String,
    pub name: Option<String>,
    pub created_at: u64,
    /// For a worktree agent (#74): the parent repo path; absent for a normal
    /// agent. The agent's `repo_path` is the isolated worktree folder. Defaulted
    /// so older records (without the field) still deserialize.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worktree_parent: Option<String>,
    /// claude's own auto-generated session title (#97), captured from the session
    /// log on busy→idle. Distinct from the user's custom `name` (#57), which still
    /// wins for display; this only fills in for an otherwise-unnamed agent.
    /// Defaulted so older records (without the field) still deserialize.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_name: Option<String>,
    /// Whether this session has ever been active (#112): set true on its first
    /// busy transition and persisted, so a previously-active agent shows the
    /// "finished / needs input" (yellow) activity indicator immediately on the next
    /// boot rather than the never-active gray. Defaulted false so older records
    /// (without the field) still deserialize.
    #[serde(default)]
    pub has_been_active: bool,
    /// The coding agent this session runs (#101): `"claude"` (the default for older
    /// records), `"codex"`, …. Each session keeps its own agent so it always
    /// resumes / behaves with the CLI it was started with.
    #[serde(default = "default_agent")]
    pub agent: String,
    /// The source session this was forked from (#126): a fork branches the source's
    /// conversation into a new parallel session, sharing its auto-title — this records
    /// the provenance and drives the "fork" badge. `default` (None) for non-fork /
    /// older records.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub forked_from: Option<String>,
    /// Whether this session has forkable conversation history (#138): true when its
    /// on-disk claude log has ≥1 real turn (#134 `title::has_conversation`), gating the
    /// Fork affordance up front. Updated on the #97 title-worker busy→idle cadence plus a
    /// one-shot boot read. Defaults **true** (fail-open) so an older record / uncertainty
    /// never wrongly disables Fork; a freshly spawned session (no log yet) is set `false`.
    #[serde(default = "default_true")]
    pub forkable: bool,
    /// Per-agent opt-out for auto-continue-after-limit (#297): when the global
    /// `autoContinueAfterLimit` setting (#296) is on, an agent participates unless
    /// this is `true`. Unchecking the per-agent box sets it `true` so that one agent
    /// is skipped by the fire step. Defaults `false` (inherit the global behavior) so
    /// older records (without the field) still deserialize and keep participating.
    #[serde(default)]
    pub auto_continue_disabled: bool,
}

/// A user-added Overview panel (a non-agent column), persisted per repo (#38).
/// Agent panels are derived from live sessions and are not stored here.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OverviewPanel {
    pub id: String,
    /// `"diff"` (#39), `"markdown"` (#41), or `"terminal"` (#72).
    pub kind: String,
    /// Panel parameter, e.g. the markdown file path; `None` for a diff panel.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    /// Diff panel branch-compare state (#81): `"working"` (vs HEAD) or
    /// `"compare"` (base → target), plus the two chosen branches. `None` on
    /// non-diff panels / older records.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diff_source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compare_base: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compare_target: Option<String>,
    /// Diff panel "Commits" source (#230): when `diff_source == "commits"`, the
    /// selected commit's sha whose diff is shown. `None` on other sources / older
    /// records.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub commit_sha: Option<String>,
}

/// A scheduled session (#93): an agent to launch automatically at `fire_at`
/// (unix secs, local clock). One-shot — removed from the store when it fires (or
/// is canceled). `branch` (when set) is checked out before spawning; `prompt`
/// (when set) is passed positionally to `claude` so it boots ready.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScheduledSession {
    pub id: String,
    pub cwd: String,
    /// Branch to use before spawning. When `create_branch` is false this is an
    /// existing branch to check out (only set for a non-current one); when true it's
    /// the **new** branch name to create at fire time (#125).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    /// When true, `branch` is created + checked out at fire time (#125) from
    /// `branch_base` (or HEAD), instead of checking out an existing branch. `default`
    /// (false) keeps existing records as checkout-existing.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub create_branch: bool,
    /// Base for the new branch when `create_branch` (None/empty = HEAD) (#125).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branch_base: Option<String>,
    /// Launch into an isolated git worktree (#198/#74): the worktree (on the existing
    /// `branch`, or a new branch when `create_branch`) is created at **fire time**.
    /// `default` (false) keeps existing records as in-folder schedules.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub worktree: bool,
    /// The app-managed worktree folder for a worktree schedule (#218), computed at
    /// **create time** via the deterministic `worktree_path(cwd, branch)` helper.
    /// Persisted so the sidebar nests the pending schedule under the **same**
    /// worktree sub-group key the live session will use after firing, and so fire
    /// time reuses the byte-identical path. `None` for non-worktree schedules and for
    /// worktree schedules created before #218 (they recompute at fire time and group
    /// at the parent level until re-created). `default` keeps old records loading.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worktree_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    pub fire_at: u64,
    pub created_at: u64,
    /// The coding agent to launch (#101); defaults to `"claude"` for older records.
    #[serde(default = "default_agent")]
    pub agent: String,
}

/// A recurring session (#294): a persistent, repeating agent. Unlike a one-shot
/// `ScheduledSession`, a recurring record **stays** in the store as long as it is
/// active and re-arms itself. Each time `next_fire_at` passes, the poll loop kills
/// the current child agent (if any) and spawns a **fresh** `claude` seeded with
/// `prompt`, rotating `current_session_id` in place (its sidebar row / Overview card
/// / Canvas panel key on the recurring `id`, so no new surface is ever created).
/// The branch / worktree fields mirror `ScheduledSession` (created eagerly at create
/// time, reused every cycle). Times are unix secs on the local clock.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecurringSession {
    pub id: String,
    pub cwd: String,
    /// Branch to use before spawning. When `create_branch` is false this is an
    /// existing branch to check out (only set for a non-current one); when true it's
    /// the **new** branch name created at create time (mirrors `ScheduledSession`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    /// When true, `branch` was created + checked out (from `branch_base` / HEAD)
    /// rather than checking out an existing branch.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub create_branch: bool,
    /// Base for the new branch when `create_branch` (None/empty = HEAD).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branch_base: Option<String>,
    /// Launch each child into an isolated git worktree (#74), created eagerly at
    /// create time on `branch`.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub worktree: bool,
    /// The app-managed worktree folder for a worktree recurring, computed at create
    /// time via the deterministic `worktree_path(cwd, branch)` helper; reused every
    /// cycle. `None` for non-worktree recurrings.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worktree_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    /// The repeat interval in seconds (minimum 60 — enforced frontend-side). Each
    /// fire advances `next_fire_at` by this amount.
    pub interval_secs: u64,
    /// The next time (unix secs) a fresh child should be spawned.
    pub next_fire_at: u64,
    /// The live child agent this recurring currently owns (rotated each cycle), or
    /// `None` before the first fire. A child is a normal tracked `PersistedSession`
    /// but is rendered only inside the recurring surfaces (never its own row/column).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_session_id: Option<String>,
    pub created_at: u64,
    /// The coding agent to launch (#101); defaults to `"claude"` for older records.
    #[serde(default = "default_agent")]
    pub agent: String,
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
    /// Multiple named Canvas tabs (#58), stored opaquely as JSON
    /// `{ canvases: [{ id, name, layout }], activeId }` — the frontend owns the
    /// shape and migrates the single `canvas_layout` into it once. `null` until
    /// first written; `default` keeps old files loading.
    #[serde(default)]
    pub canvases: serde_json::Value,
    /// Pending scheduled sessions (#93): agents to launch automatically at their
    /// `fire_at`. `default` keeps old files loading.
    #[serde(default)]
    pub schedules: Vec<ScheduledSession>,
    /// Active recurring sessions (#294): persistent repeating agents that re-arm
    /// themselves. `default` (empty) keeps old files loading.
    #[serde(default)]
    pub recurrings: Vec<RecurringSession>,
    /// Application settings (#100), stored opaquely as JSON — the frontend owns the
    /// shape and supplies defaults, so an older file without it upgrades cleanly.
    #[serde(default)]
    pub settings: serde_json::Value,
    /// Saved Canvas templates (#117), stored opaquely as JSON `[{ id, name, layout }]`
    /// — the frontend owns the shape. Kept separate from the `canvases` blob so a
    /// canvas write can't clobber templates. `null` until first written; `default`
    /// keeps old files loading.
    #[serde(default)]
    pub canvas_templates: serde_json::Value,
    /// Sidebar width in px (#108), drag-resized by the user. `None` until first set
    /// (the frontend defaults + clamps); `default` keeps old files loading.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sidebar_width: Option<u32>,
    /// Whether the sidebar is collapsed to the icon rail (#168). `None` until first
    /// set (the frontend defaults to expanded); kept separate from the Settings blob
    /// so the Settings draft can't clobber this live UI toggle. `default` keeps old
    /// files loading.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sidebar_collapsed: Option<bool>,
    /// The app version observed on the last run (#190): compared to the running
    /// `app_version()` on boot to show a one-time "Updated to v…" toast after a
    /// self-update. `None` until first written; `default` keeps old files loading.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_version: Option<String>,
    /// The user's chosen top-level sidebar folder order (#211): repo paths in
    /// drag-reordered order. Kept as a dedicated value (like `sidebar_width`),
    /// separate from the Settings blob so a Settings draft can't clobber it. Empty
    /// until first set — the frontend merges it with the live repo set, so a
    /// missing/partial order just appends new repos. `default` keeps old files
    /// loading; empty isn't serialized.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub repo_order: Vec<String>,
    /// Per-repo diff "seen" review markers (#278): a content digest per reviewed
    /// changed file, keyed `{ repoPath: { filePath: digest } }`, stored opaquely as
    /// JSON (the frontend owns the shape + digest). Kept as a dedicated value (like
    /// `repo_order` / `sidebar_width`), separate from the Settings blob so a Settings
    /// draft can't clobber it. `null` until first written; `default` keeps old files
    /// loading.
    #[serde(default)]
    pub diff_seen: serde_json::Value,
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

    /// The directory holding the persisted state (sessions.json) — used to place
    /// app-managed git worktrees alongside it (#74).
    pub fn data_dir(&self) -> Option<&Path> {
        self.path.parent()
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

    /// Update a persisted session's display name (`None` clears it back to no
    /// custom name) and persist (#57); a no-op if the id is unknown.
    pub fn rename_session(&self, id: &str, name: Option<String>) -> io::Result<()> {
        self.update(|state| {
            if let Some(session) = state.sessions.iter_mut().find(|s| s.id == id) {
                session.name = name;
            }
        })
    }

    /// Set (or clear with `None`) a session's auto-generated title (#97) — claude's
    /// own session title, kept separate from the user's custom `name` (#57) so the
    /// auto-name never clobbers a typed name. Persists; a no-op for an unknown id.
    pub fn set_auto_name(&self, id: &str, auto_name: Option<String>) -> io::Result<()> {
        self.update(|state| {
            if let Some(session) = state.sessions.iter_mut().find(|s| s.id == id) {
                session.auto_name = auto_name;
            }
        })
    }

    /// Mark a session as having been active at least once (#112): flip
    /// `has_been_active` false→true and persist. Persists **only** on that
    /// transition (a no-op once set), so the busy→idle hot path doesn't rewrite the
    /// file on every turn. A no-op for an unknown id.
    pub fn mark_session_active(&self, id: &str) -> io::Result<()> {
        let mut guard = self
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let changed = match guard.sessions.iter_mut().find(|s| s.id == id) {
            Some(session) if !session.has_been_active => {
                session.has_been_active = true;
                true
            }
            _ => false,
        };
        if changed {
            self.persist(&guard)
        } else {
            Ok(())
        }
    }

    /// Set a session's forkability (#138) and persist **only on change** — the #97
    /// title-worker pokes this on every busy→idle edge, so this avoids rewriting the
    /// file each turn. A no-op for an unknown id.
    pub fn set_forkable(&self, id: &str, forkable: bool) -> io::Result<()> {
        let mut guard = self
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let changed = match guard.sessions.iter_mut().find(|s| s.id == id) {
            Some(session) if session.forkable != forkable => {
                session.forkable = forkable;
                true
            }
            _ => false,
        };
        if changed {
            self.persist(&guard)
        } else {
            Ok(())
        }
    }

    /// Set a session's per-agent auto-continue opt-out (#297) and persist **only on
    /// change**. `disabled == true` excludes that one Claude agent from the #296
    /// auto-continue fire step without touching the global setting or any other agent.
    /// A no-op for an unknown id.
    pub fn set_session_auto_continue(&self, id: &str, disabled: bool) -> io::Result<()> {
        let mut guard = self
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let changed = match guard.sessions.iter_mut().find(|s| s.id == id) {
            Some(session) if session.auto_continue_disabled != disabled => {
                session.auto_continue_disabled = disabled;
                true
            }
            _ => false,
        };
        if changed {
            self.persist(&guard)
        } else {
            Ok(())
        }
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

    /// Clear the recents list and persist (#100 Settings → Data). Sessions are
    /// untouched; only the recently-used folder list is emptied.
    pub fn clear_recents(&self) -> io::Result<()> {
        self.update(|state| state.recents.clear())
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

    /// The multi-canvas tab state (#58) — opaque JSON; `null` until first written
    /// (the frontend then migrates from `canvas_layout`).
    pub fn canvases(&self) -> serde_json::Value {
        self.with(|state| state.canvases.clone())
    }

    /// Replace the multi-canvas tab state and persist (#58).
    pub fn set_canvases(&self, canvases: serde_json::Value) -> io::Result<()> {
        self.update(|state| state.canvases = canvases)
    }

    /// Saved Canvas templates (#117) — opaque JSON; `null` until first written.
    pub fn canvas_templates(&self) -> serde_json::Value {
        self.with(|state| state.canvas_templates.clone())
    }

    /// Replace the saved Canvas templates and persist (#117).
    pub fn set_canvas_templates(&self, templates: serde_json::Value) -> io::Result<()> {
        self.update(|state| state.canvas_templates = templates)
    }

    /// Application settings (#100) — opaque JSON; `null` until first written, the
    /// frontend supplies defaults.
    pub fn settings(&self) -> serde_json::Value {
        self.with(|state| state.settings.clone())
    }

    /// Replace the application settings and persist (#100).
    pub fn set_settings(&self, settings: serde_json::Value) -> io::Result<()> {
        self.update(|state| state.settings = settings)
    }

    /// The persisted sidebar width in px (#108); `None` until first set (the
    /// frontend defaults + clamps).
    pub fn sidebar_width(&self) -> Option<u32> {
        self.with(|state| state.sidebar_width)
    }

    /// Persist the sidebar width (#108).
    pub fn set_sidebar_width(&self, width: u32) -> io::Result<()> {
        self.update(|state| state.sidebar_width = Some(width))
    }

    /// Whether the sidebar is collapsed to the icon rail (#168); `None` until first
    /// set (the frontend defaults to expanded).
    pub fn sidebar_collapsed(&self) -> Option<bool> {
        self.with(|state| state.sidebar_collapsed)
    }

    /// Persist the sidebar collapsed flag (#168).
    pub fn set_sidebar_collapsed(&self, collapsed: bool) -> io::Result<()> {
        self.update(|state| state.sidebar_collapsed = Some(collapsed))
    }

    /// The app version seen on the previous run (#190); `None` on first launch.
    pub fn last_version(&self) -> Option<String> {
        self.with(|state| state.last_version.clone())
    }

    /// Persist the app version observed this run (#190).
    pub fn set_last_version(&self, version: String) -> io::Result<()> {
        self.update(|state| state.last_version = Some(version))
    }

    /// The persisted top-level sidebar folder order (#211); empty until first set
    /// (the frontend merges it with the live repo set).
    pub fn repo_order(&self) -> Vec<String> {
        self.with(|state| state.repo_order.clone())
    }

    /// Persist the sidebar folder order (#211).
    pub fn set_repo_order(&self, order: Vec<String>) -> io::Result<()> {
        self.update(|state| state.repo_order = order)
    }

    /// The per-repo diff "seen" markers (#278) — opaque JSON; `null` until first
    /// written (the frontend owns the `{ repoPath: { filePath: digest } }` shape).
    pub fn diff_seen(&self) -> serde_json::Value {
        self.with(|state| state.diff_seen.clone())
    }

    /// Replace the per-repo diff "seen" markers and persist (#278).
    pub fn set_diff_seen(&self, diff_seen: serde_json::Value) -> io::Result<()> {
        self.update(|state| state.diff_seen = diff_seen)
    }

    /// All pending scheduled sessions (#93).
    pub fn schedules(&self) -> Vec<ScheduledSession> {
        self.with(|state| state.schedules.clone())
    }

    /// Add a scheduled session (replacing any with the same id) and persist (#93).
    pub fn add_schedule(&self, sched: ScheduledSession) -> io::Result<()> {
        self.update(|state| {
            state.schedules.retain(|x| x.id != sched.id);
            state.schedules.push(sched);
        })
    }

    /// Cancel (remove) a scheduled session by id and persist (#93).
    pub fn remove_schedule(&self, id: &str) -> io::Result<()> {
        self.update(|state| state.schedules.retain(|x| x.id != id))
    }

    /// Update a schedule's mutable fields (prompt / name / fire time) and persist
    /// (#93) — the full update surface #94's panel edits; a no-op for an unknown id.
    pub fn update_schedule(
        &self,
        id: &str,
        prompt: Option<String>,
        name: Option<String>,
        fire_at: u64,
    ) -> io::Result<()> {
        self.update(|state| {
            if let Some(s) = state.schedules.iter_mut().find(|s| s.id == id) {
                s.prompt = prompt;
                s.name = name;
                s.fire_at = fire_at;
            }
        })
    }

    /// Atomically remove and return every schedule due at/before `now` (#93).
    /// Removing under the same lock stops the poll loop from firing one twice; the
    /// remaining set is persisted. On boot this fires anything missed while closed
    /// (catch-up). Persist errors are swallowed (best-effort, like the rest).
    pub fn take_due_schedules(&self, now: u64) -> Vec<ScheduledSession> {
        let mut due = Vec::new();
        let _ = self.update(|state| {
            let (ready, pending): (Vec<_>, Vec<_>) =
                state.schedules.drain(..).partition(|s| s.fire_at <= now);
            state.schedules = pending;
            due = ready;
        });
        due
    }

    /// Atomically remove and return the schedule with `id`, if any (#269). Like
    /// `take_due_schedules` but for a single id — the "Start now" button takes the
    /// schedule out under the lock (so the poll loop can't also fire it) before
    /// spawning. `None` means it was unknown or already fired. On a spawn failure the
    /// caller re-`add_schedule`s it so the schedule is kept intact.
    pub fn take_schedule(&self, id: &str) -> Option<ScheduledSession> {
        let mut taken = None;
        let _ = self.update(|state| {
            if let Some(pos) = state.schedules.iter().position(|s| s.id == id) {
                taken = Some(state.schedules.remove(pos));
            }
        });
        taken
    }

    // --- Recurring sessions (#294) ---

    /// All active recurring sessions (#294).
    pub fn recurrings(&self) -> Vec<RecurringSession> {
        self.with(|state| state.recurrings.clone())
    }

    /// A single recurring session by id, if present (#294).
    pub fn recurring(&self, id: &str) -> Option<RecurringSession> {
        self.with(|state| state.recurrings.iter().find(|r| r.id == id).cloned())
    }

    /// Add a recurring session (replacing any with the same id) and persist (#294).
    pub fn add_recurring(&self, rec: RecurringSession) -> io::Result<()> {
        self.update(|state| {
            state.recurrings.retain(|x| x.id != rec.id);
            state.recurrings.push(rec);
        })
    }

    /// Cancel (remove) a recurring session by id and persist (#294).
    pub fn remove_recurring(&self, id: &str) -> io::Result<()> {
        self.update(|state| state.recurrings.retain(|x| x.id != id))
    }

    /// Update a recurring session's mutable fields (prompt / name / interval / next
    /// fire time) and persist (#294) — the editor panel's edits; a no-op for an
    /// unknown id.
    pub fn update_recurring(
        &self,
        id: &str,
        prompt: Option<String>,
        name: Option<String>,
        interval_secs: u64,
        next_fire_at: u64,
    ) -> io::Result<()> {
        self.update(|state| {
            if let Some(r) = state.recurrings.iter_mut().find(|r| r.id == id) {
                r.prompt = prompt;
                r.name = name;
                r.interval_secs = interval_secs;
                r.next_fire_at = next_fire_at;
            }
        })
    }

    /// Atomically **clone** (do NOT remove) every recurring due at/before `now`
    /// (#294). Unlike `take_due_schedules`, recurring records persist and re-arm, so
    /// this returns copies; the caller marks each fired (rotating the child + advancing
    /// `next_fire_at`) via `mark_recurring_fired`. On boot this reports anything overdue
    /// while closed (one catch-up run).
    pub fn take_due_recurrings(&self, now: u64) -> Vec<RecurringSession> {
        self.with(|state| {
            state
                .recurrings
                .iter()
                .filter(|r| r.next_fire_at <= now)
                .cloned()
                .collect()
        })
    }

    /// Mark a recurring session fired (#294): set its live `current_session_id` to the
    /// freshly-spawned child and advance `next_fire_at`, atomically, then persist. A
    /// no-op for an unknown id (it was cancelled while firing).
    pub fn mark_recurring_fired(
        &self,
        id: &str,
        new_session_id: Option<String>,
        next_fire_at: u64,
    ) -> io::Result<()> {
        self.update(|state| {
            if let Some(r) = state.recurrings.iter_mut().find(|r| r.id == id) {
                r.current_session_id = new_session_id;
                r.next_fire_at = next_fire_at;
            }
        })
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
        // `fs::rename` over an existing file is atomic on both platforms (Windows
        // uses MOVEFILE_REPLACE_EXISTING). On Windows, though, the rename can
        // transiently fail with "Access Denied" when antivirus / the Search indexer
        // / a backup agent momentarily holds a handle on the target or temp file —
        // a class of failure POSIX `rename(2)` never has. Since we persist often,
        // retry a few times with a short backoff before giving up. macOS succeeds on
        // the first attempt, so this never sleeps there — behavior is unchanged.
        let mut attempt = 0;
        loop {
            match fs::rename(&tmp, &self.path) {
                Ok(()) => return Ok(()),
                Err(e) => {
                    attempt += 1;
                    if attempt >= 5 {
                        // Clean up the temp file so a failed write leaves no litter.
                        let _ = fs::remove_file(&tmp);
                        return Err(e);
                    }
                    std::thread::sleep(std::time::Duration::from_millis(20 * attempt));
                }
            }
        }
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
            worktree_parent: None,
            auto_name: None,
            has_been_active: false,
            agent: default_agent(),
            forked_from: None,
            forkable: true,
            auto_continue_disabled: false,
        }
    }

    fn temp_path(tag: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!("recue-store-{tag}-{}.json", std::process::id()));
        let _ = fs::remove_file(&path);
        path
    }

    fn sched(id: &str, fire_at: u64) -> ScheduledSession {
        ScheduledSession {
            id: id.to_string(),
            cwd: "/repo/x".to_string(),
            branch: None,
            create_branch: false,
            branch_base: None,
            worktree: false,
            worktree_path: None,
            name: None,
            prompt: None,
            fire_at,
            created_at: 0,
            agent: default_agent(),
        }
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
                diff_source: None,
                compare_base: None,
                compare_target: None,
                commit_sha: None,
            },
            OverviewPanel {
                id: "p2".into(),
                kind: "markdown".into(),
                file: Some("README.md".into()),
                diff_source: None,
                compare_base: None,
                compare_target: None,
                commit_sha: None,
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
    fn repo_order_set_and_persist() {
        let path = temp_path("repoorder");
        let store = Store::load(&path);
        // Unset → empty (the frontend then uses the default alphabetical order).
        assert!(store.repo_order().is_empty());

        let order = vec!["/repo/b".to_string(), "/repo/a".to_string()];
        store.set_repo_order(order.clone()).unwrap();

        let reloaded = Store::load(&path);
        assert_eq!(reloaded.repo_order(), order);

        // An empty order persists as empty (not serialized) and reloads empty.
        store.set_repo_order(vec![]).unwrap();
        assert!(Store::load(&path).repo_order().is_empty());
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn diff_seen_set_and_persist() {
        let path = temp_path("diffseen");
        let store = Store::load(&path);
        // Defaults to null (nothing marked seen yet).
        assert!(store.diff_seen().is_null());

        let map = serde_json::json!({
            "/repo/a": { "src/main.rs": "abc123", "README.md": "def456" }
        });
        store.set_diff_seen(map.clone()).unwrap();
        assert_eq!(Store::load(&path).diff_seen(), map);

        // Clearing back to null persists too.
        store.set_diff_seen(serde_json::Value::Null).unwrap();
        assert!(Store::load(&path).diff_seen().is_null());
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
    fn canvases_set_and_persist() {
        let path = temp_path("canvases");
        let store = Store::load(&path);
        assert!(store.canvases().is_null()); // default (pre-migration)

        let tabs = serde_json::json!({
            "canvases": [{ "id": "c1", "name": "Canvas 1", "layout": null }],
            "activeId": "c1"
        });
        store.set_canvases(tabs.clone()).unwrap();
        assert_eq!(Store::load(&path).canvases(), tabs);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn canvas_templates_set_and_persist() {
        let path = temp_path("templates");
        let store = Store::load(&path);
        assert!(store.canvas_templates().is_null()); // default (none saved yet)

        let templates = serde_json::json!([
            { "id": "t1", "name": "Dev workspace", "layout": null }
        ]);
        store.set_canvas_templates(templates.clone()).unwrap();
        assert_eq!(Store::load(&path).canvas_templates(), templates);
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
    fn rename_session_sets_and_clears_name() {
        let path = temp_path("rename");
        let store = Store::load(&path);
        store.add_session(record("s1", "/repo/x")).unwrap();

        store
            .rename_session("s1", Some("My Agent".to_string()))
            .unwrap();
        assert_eq!(
            Store::load(&path).session("s1").unwrap().name,
            Some("My Agent".to_string())
        );

        // Clearing reverts to no custom name, and survives a reload.
        store.rename_session("s1", None).unwrap();
        assert_eq!(Store::load(&path).session("s1").unwrap().name, None);

        // An unknown id is a no-op (no panic).
        store.rename_session("missing", Some("x".into())).unwrap();
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn schedules_add_take_due_update_cancel_and_persist() {
        let path = temp_path("schedules");
        let store = Store::load(&path);
        store.add_schedule(sched("s1", 100)).unwrap(); // due
        store.add_schedule(sched("s2", 5000)).unwrap(); // future

        // take_due at now=1000 → only s1; s2 remains and is persisted.
        let due = store.take_due_schedules(1000);
        assert_eq!(
            due.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(),
            ["s1"]
        );
        let reloaded = Store::load(&path);
        assert_eq!(
            reloaded
                .schedules()
                .iter()
                .map(|s| s.id.clone())
                .collect::<Vec<_>>(),
            vec!["s2".to_string()]
        );

        // update the remaining schedule's prompt/name/time, then cancel it.
        store
            .update_schedule("s2", Some("go".into()), Some("nightly".into()), 6000)
            .unwrap();
        let after = Store::load(&path);
        let s2 = &after.schedules()[0];
        assert_eq!(s2.fire_at, 6000);
        assert_eq!(s2.prompt.as_deref(), Some("go"));
        assert_eq!(s2.name.as_deref(), Some("nightly"));

        store.remove_schedule("s2").unwrap();
        assert!(Store::load(&path).schedules().is_empty());
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn take_schedule_removes_one_by_id_and_persists() {
        let path = temp_path("take-schedule");
        let store = Store::load(&path);
        store.add_schedule(sched("s1", 5000)).unwrap();
        store.add_schedule(sched("s2", 6000)).unwrap();

        // An unknown id takes nothing and leaves both schedules intact.
        assert!(store.take_schedule("missing").is_none());
        assert_eq!(store.schedules().len(), 2);

        // Taking s1 returns it and removes it from the persisted set; s2 remains.
        let taken = store.take_schedule("s1").expect("s1 taken");
        assert_eq!(taken.id, "s1");
        let reloaded = Store::load(&path);
        assert_eq!(
            reloaded
                .schedules()
                .iter()
                .map(|s| s.id.clone())
                .collect::<Vec<_>>(),
            vec!["s2".to_string()]
        );

        // Taking the same id again is a no-op (already gone).
        assert!(store.take_schedule("s1").is_none());
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn schedule_new_branch_intent_round_trips_and_old_records_default() {
        let path = temp_path("sched-new-branch");
        let store = Store::load(&path);
        let mut s = sched("nb", 100);
        s.branch = Some("feature/x".to_string());
        s.create_branch = true;
        s.branch_base = Some("main".to_string());
        s.worktree = true;
        s.worktree_path = Some("/data/worktrees/x-1/feature-x".to_string());
        store.add_schedule(s).unwrap();

        let loaded = &Store::load(&path).schedules()[0];
        assert_eq!(loaded.branch.as_deref(), Some("feature/x"));
        assert!(loaded.create_branch);
        assert_eq!(loaded.branch_base.as_deref(), Some("main"));
        assert!(loaded.worktree);
        // The worktree path (#218) round-trips so the sidebar sub-group key + fire-time
        // path stay identical.
        assert_eq!(
            loaded.worktree_path.as_deref(),
            Some("/data/worktrees/x-1/feature-x")
        );

        // An older record without the new-branch / worktree fields loads with defaults
        // (create_branch = false → checkout-existing semantics; worktree = false, #125
        // / #198 back-compat; worktree_path = None, #218).
        let legacy =
            r#"{"schedules":[{"id":"old","cwd":"/r","branch":"dev","fire_at":1,"created_at":0}]}"#;
        let legacy_path = temp_path("sched-legacy");
        fs::write(&legacy_path, legacy).unwrap();
        let old = &Store::load(&legacy_path).schedules()[0];
        assert_eq!(old.branch.as_deref(), Some("dev"));
        assert!(!old.create_branch);
        assert_eq!(old.branch_base, None);
        assert!(!old.worktree);
        assert_eq!(old.worktree_path, None);

        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(&legacy_path);
    }

    fn recur(id: &str, interval_secs: u64, next_fire_at: u64) -> RecurringSession {
        RecurringSession {
            id: id.to_string(),
            cwd: "/repo/x".to_string(),
            branch: None,
            create_branch: false,
            branch_base: None,
            worktree: false,
            worktree_path: None,
            name: None,
            prompt: None,
            interval_secs,
            next_fire_at,
            current_session_id: None,
            created_at: 0,
            agent: default_agent(),
        }
    }

    #[test]
    fn recurrings_add_take_due_mark_fired_update_cancel_and_persist() {
        let path = temp_path("recurrings");
        let store = Store::load(&path);
        store.add_recurring(recur("r1", 3600, 100)).unwrap(); // due
        store.add_recurring(recur("r2", 3600, 5000)).unwrap(); // future

        // Only r1 is due at t=1000; it is CLONED (not removed) — both persist.
        let due = store.take_due_recurrings(1000);
        assert_eq!(
            due.iter().map(|r| r.id.clone()).collect::<Vec<_>>(),
            vec!["r1".to_string()]
        );
        assert_eq!(
            store.recurrings().len(),
            2,
            "recurrings persist after firing"
        );

        // Marking r1 fired rotates its child + advances next_fire_at atomically.
        store
            .mark_recurring_fired("r1", Some("child-1".to_string()), 1000 + 3600)
            .unwrap();
        let after = Store::load(&path);
        let r1 = after.recurring("r1").expect("r1 present");
        assert_eq!(r1.current_session_id.as_deref(), Some("child-1"));
        assert_eq!(r1.next_fire_at, 4600);
        // r1 is no longer due at the same `now` (its time advanced past it).
        assert!(store.take_due_recurrings(1000).is_empty());

        // Update r1's editable fields, then cancel it.
        store
            .update_recurring("r1", Some("go".into()), Some("nightly".into()), 7200, 9000)
            .unwrap();
        let r1 = Store::load(&path).recurring("r1").expect("r1 present");
        assert_eq!(r1.prompt.as_deref(), Some("go"));
        assert_eq!(r1.name.as_deref(), Some("nightly"));
        assert_eq!(r1.interval_secs, 7200);
        assert_eq!(r1.next_fire_at, 9000);

        store.remove_recurring("r1").unwrap();
        let ids = Store::load(&path)
            .recurrings()
            .iter()
            .map(|r| r.id.clone())
            .collect::<Vec<_>>();
        assert_eq!(ids, vec!["r2".to_string()]);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn recurring_worktree_intent_round_trips_and_old_files_default() {
        let path = temp_path("recur-wt");
        let store = Store::load(&path);
        let mut r = recur("rw", 86400, 100);
        r.branch = Some("feature/x".to_string());
        r.create_branch = true;
        r.branch_base = Some("main".to_string());
        r.worktree = true;
        r.worktree_path = Some("/data/worktrees/x-1/feature-x".to_string());
        r.current_session_id = Some("child".to_string());
        store.add_recurring(r).unwrap();

        let loaded = Store::load(&path).recurring("rw").expect("rw present");
        assert_eq!(loaded.branch.as_deref(), Some("feature/x"));
        assert!(loaded.create_branch);
        assert!(loaded.worktree);
        assert_eq!(
            loaded.worktree_path.as_deref(),
            Some("/data/worktrees/x-1/feature-x")
        );
        assert_eq!(loaded.current_session_id.as_deref(), Some("child"));
        assert_eq!(loaded.agent, "claude");

        // An old sessions.json (no `recurrings` field) loads with an empty list.
        let legacy_path = temp_path("recur-legacy");
        fs::write(&legacy_path, r#"{"sessions":[]}"#).unwrap();
        assert!(Store::load(&legacy_path).recurrings().is_empty());

        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(&legacy_path);
    }

    #[test]
    fn mark_session_active_sets_once_and_persists() {
        let path = temp_path("active");
        let store = Store::load(&path);
        store.add_session(record("s1", "/repo/x")).unwrap();
        // Defaults false.
        assert!(!store.session("s1").unwrap().has_been_active);

        // The first mark flips it true and persists (survives a reload).
        store.mark_session_active("s1").unwrap();
        assert!(Store::load(&path).session("s1").unwrap().has_been_active);

        // Idempotent — a second call is a no-op (still true).
        store.mark_session_active("s1").unwrap();
        assert!(store.session("s1").unwrap().has_been_active);

        // An unknown id is a no-op (no panic).
        store.mark_session_active("missing").unwrap();
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn set_forkable_updates_and_persists_on_change() {
        let path = temp_path("forkable");
        let store = Store::load(&path);
        store.add_session(record("s1", "/repo/x")).unwrap();
        // The fixture defaults true; flip it false and confirm it survives a reload.
        store.set_forkable("s1", false).unwrap();
        assert!(!store.session("s1").unwrap().forkable);
        assert!(!Store::load(&path).session("s1").unwrap().forkable);
        // Back to true, and an unknown id is a no-op (no panic).
        store.set_forkable("s1", true).unwrap();
        assert!(store.session("s1").unwrap().forkable);
        store.set_forkable("missing", true).unwrap();

        // A legacy record without the field loads fail-open (forkable = true).
        let legacy = r#"{"sessions":[{"id":"old","claude_session_id":"old","repo_path":"/r","name":null,"created_at":0}]}"#;
        let legacy_path = temp_path("forkable-legacy");
        fs::write(&legacy_path, legacy).unwrap();
        assert!(Store::load(&legacy_path).session("old").unwrap().forkable);

        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(&legacy_path);
    }

    #[test]
    fn set_session_auto_continue_updates_and_persists_on_change() {
        let path = temp_path("auto-continue");
        let store = Store::load(&path);
        store.add_session(record("s1", "/repo/x")).unwrap();
        // The fixture defaults false (inherit the global behavior); opt this agent out
        // and confirm the disabled flag survives a reload (#297).
        store.set_session_auto_continue("s1", true).unwrap();
        assert!(store.session("s1").unwrap().auto_continue_disabled);
        assert!(
            Store::load(&path)
                .session("s1")
                .unwrap()
                .auto_continue_disabled
        );
        // Back on, and an unknown id is a no-op (no panic).
        store.set_session_auto_continue("s1", false).unwrap();
        assert!(!store.session("s1").unwrap().auto_continue_disabled);
        store.set_session_auto_continue("missing", true).unwrap();

        // A legacy record without the field loads as participating (disabled = false).
        let legacy = r#"{"sessions":[{"id":"old","claude_session_id":"old","repo_path":"/r","name":null,"created_at":0}]}"#;
        let legacy_path = temp_path("auto-continue-legacy");
        fs::write(&legacy_path, legacy).unwrap();
        assert!(
            !Store::load(&legacy_path)
                .session("old")
                .unwrap()
                .auto_continue_disabled
        );

        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(&legacy_path);
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
