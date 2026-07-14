//! Best-effort reader for claude's own per-session title (#97).
//!
//! Claude Code writes an `{"type":"ai-title","aiTitle":"…","sessionId":"…"}` entry
//! into its per-session log at `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`,
//! refreshing it as the conversation evolves (the latest entry wins). Because
//! ReCue owns each session's UUID (`claude --session-id <uuid>`, see `pty.rs`),
//! it can locate that log by UUID and reuse the title — no extra `claude` process,
//! no API cost. If there is no `ai-title` yet we fall back to the first prompt
//! (`{"type":"last-prompt","lastPrompt":"…"}`), trimmed to a short line.
//!
//! claude's log format is internal/undocumented (same fragility class as the
//! `--session-id`/`--resume` flags in CLAUDE.md). Verified against the logs under
//! `~/.claude/projects/` (claude 2.1.x). Everything here is best-effort: a missing
//! file, unparseable lines, or a format change degrade to `None` so the caller
//! falls back to the branch label.

use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

/// Longest auto-name we keep; longer titles/prompts are trimmed with an ellipsis.
const MAX_LEN: usize = 80;

/// Read claude's auto-title for a session, falling back to its first prompt.
/// Returns `None` when no log/title/prompt is available (the caller then keeps the
/// branch label). `claude_session_id` is the UUID in the log filename.
pub fn read_session_title(claude_session_id: &str) -> Option<String> {
    let path = find_log(claude_session_id)?;
    let file = std::fs::File::open(path).ok()?;
    let reader = BufReader::new(file);

    // One forward pass: keep the LAST `ai-title` (it's appended as the title
    // evolves) and the FIRST `last-prompt` (the fallback). A cheap substring
    // pre-filter avoids JSON-parsing the many lines that are neither.
    let mut ai_title: Option<String> = None;
    let mut first_prompt: Option<String> = None;
    for line in reader.lines() {
        let Ok(line) = line else { continue };
        if line.contains("\"ai-title\"") {
            if let Some(t) = field_of(&line, "ai-title", "aiTitle") {
                ai_title = trim_title(&t);
            }
        } else if first_prompt.is_none() && line.contains("\"last-prompt\"") {
            if let Some(p) = field_of(&line, "last-prompt", "lastPrompt") {
                first_prompt = trim_title(&p);
            }
        }
    }
    ai_title.or(first_prompt)
}

/// Parse one JSONL line and, if its `type` matches `kind`, return the string at
/// `field`. Tolerant: a non-object line / wrong type / missing field → `None`.
fn field_of(line: &str, kind: &str, field: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(line).ok()?;
    if value.get("type").and_then(|t| t.as_str()) != Some(kind) {
        return None;
    }
    value
        .get(field)
        .and_then(|v| v.as_str())
        .map(str::to_string)
}

/// Where a session's claude log is — distinguishing "couldn't check" from "checked,
/// genuinely absent" so the fork guard (#134) can fail open on the former without
/// blocking legitimate forks on the latter.
enum LogLocation {
    /// The `<id>.jsonl` file under some project dir.
    Found(PathBuf),
    /// The projects dir was readable but holds no `<id>.jsonl` — a never-prompted
    /// session (no log materialized yet).
    Absent,
    /// Couldn't even check (no `HOME` / unreadable projects dir).
    Unknown,
}

/// Locate `~/.claude/projects/*/<id>.jsonl` by the globally-unique session UUID, so
/// we never replicate claude's cwd→dir encoding (it maps `/` and `.` → `-`). The
/// UUID makes the filename unique, so the first project dir that has it wins.
fn locate_log(id: &str) -> LogLocation {
    let Some(home) = crate::path_env::home_dir() else {
        return LogLocation::Unknown;
    };
    let projects = home.join(".claude").join("projects");
    let file_name = format!("{id}.jsonl");
    let Ok(entries) = std::fs::read_dir(&projects) else {
        return LogLocation::Unknown;
    };
    for entry in entries.flatten() {
        let candidate = entry.path().join(&file_name);
        if candidate.is_file() {
            return LogLocation::Found(candidate);
        }
    }
    LogLocation::Absent
}

/// The session's log path, or `None` when it isn't there / can't be reached.
fn find_log(id: &str) -> Option<PathBuf> {
    match locate_log(id) {
        LogLocation::Found(path) => Some(path),
        _ => None,
    }
}

/// Whether a session's claude log holds at least one real **conversation turn** — the
/// precondition for `--resume` / `--fork-session` to find something to fork (#134).
///
/// Forking spawns `claude --session-id <new> --resume <source> --fork-session`, which
/// reads the source's on-disk log; with no materialized conversation `claude` exits 1
/// ("No conversation found"), leaving a dead "Process exited" panel (#63). This is the
/// up-front check that lets the command layer refuse instead. It must read the **log**,
/// not the busy / `has_been_active` flags — a fork inherits its parent's history yet
/// starts gray (#116), and a never-prompted session has no log at all.
///
/// **Best-effort, fail-open:** only a *positive* "no conversation" returns `false` — a
/// genuinely-absent log, or a log with zero `user`/`assistant` entries (only the
/// startup metadata: `mode` / `permission-mode` / `file-history-snapshot` /
/// `last-prompt`). Any uncertainty (no `HOME`, unreadable projects dir, unreadable
/// file) returns `true`, so a working fork is never wrongly blocked — at worst the
/// pre-#134 behavior (the #63 overlay) remains for that unreachable case.
pub fn has_conversation(claude_session_id: &str) -> bool {
    conversation_from(locate_log(claude_session_id))
}

/// The single `LogLocation` → forkability decision, shared by the per-lookup
/// `has_conversation` and the boot-time `ProjectLogIndex` (#355) so the two paths can
/// never drift: `Found` reads the log, a genuinely `Absent` log is not forkable, and
/// `Unknown` (couldn't check) **fails open** (see `has_conversation`).
fn conversation_from(location: LogLocation) -> bool {
    match location {
        LogLocation::Found(path) => log_has_turn(&path),
        LogLocation::Absent => false,
        LogLocation::Unknown => true,
    }
}

/// A one-shot snapshot of `~/.claude/projects/*/<uuid>.jsonl`, built **once per boot** (#355).
///
/// The boot resume loop asks `has_conversation` for every persisted session; done one-by-one
/// that is one `read_dir` of the projects dir plus a stat per project dir *per session*
/// (N × M syscalls — and a heavy claude user has hundreds of project dirs). This lists the
/// tree once (M `read_dir`s) and answers every lookup from memory, with semantics identical
/// to `locate_log` + `has_conversation` (same `Found`/`Absent`/`Unknown` trichotomy, same
/// fail-open, so no agent ever loses its Fork affordance).
///
/// Deliberately **not** a long-lived/global cache: it is created by the boot loop and dropped
/// when the loop ends, so there is nothing to invalidate — the live title worker (#97/#169)
/// keeps its per-call `locate_log` and therefore always sees a project dir created after boot.
pub struct ProjectLogIndex {
    /// Project dirs, in listing order. Empty when the projects root couldn't be read.
    dirs: Vec<PathBuf>,
    /// `"<uuid>.jsonl"` → index into `dirs`. `None` = the projects root itself couldn't be
    /// read (no home dir / unreadable), so every lookup is `Unknown` — mirroring `locate_log`.
    logs: Option<HashMap<String, usize>>,
    /// Project dirs whose listing failed (e.g. permissions). A lookup that misses the map
    /// falls back to the old `is_file` probe over just these, so the index can never report
    /// `Absent` where `locate_log` would report `Found`.
    unlisted: Vec<PathBuf>,
}

impl ProjectLogIndex {
    /// Snapshot `~/.claude/projects` (via the cross-platform `home_dir()` — never a raw
    /// `$HOME`; `%USERPROFILE%` on Windows). No home dir ⇒ the "unknown" index, so every
    /// lookup fails open exactly like `locate_log`.
    pub fn build() -> Self {
        let Some(home) = crate::path_env::home_dir() else {
            return Self::unknown();
        };
        Self::build_in(&home.join(".claude").join("projects"))
    }

    /// The index that knows nothing — every lookup is `Unknown` (fail-open).
    fn unknown() -> Self {
        Self {
            dirs: Vec::new(),
            logs: None,
            unlisted: Vec::new(),
        }
    }

    /// List `projects` one level deep, mapping every `<uuid>.jsonl` to its project dir.
    /// A project dir we can't list is remembered in `unlisted` for the per-lookup stat
    /// fallback; an unreadable projects root yields the "unknown" (fail-open) index.
    /// `pub(crate)` so the unit tests can build one over a temp-dir fixture.
    pub(crate) fn build_in(projects: &Path) -> Self {
        let Ok(entries) = std::fs::read_dir(projects) else {
            return Self::unknown();
        };
        let mut dirs: Vec<PathBuf> = Vec::new();
        let mut logs: HashMap<String, usize> = HashMap::new();
        let mut unlisted: Vec<PathBuf> = Vec::new();
        for entry in entries.flatten() {
            let dir = entry.path();
            if !dir.is_dir() {
                continue;
            }
            let Ok(files) = std::fs::read_dir(&dir) else {
                unlisted.push(dir);
                continue;
            };
            let dir_ix = dirs.len();
            dirs.push(dir);
            for file in files.flatten() {
                let name = file.file_name();
                let Some(name) = name.to_str() else { continue };
                if name.ends_with(".jsonl") {
                    // First writer wins — the UUID makes the filename globally unique,
                    // exactly the assumption `locate_log` already documents.
                    logs.entry(name.to_string()).or_insert(dir_ix);
                }
            }
        }
        Self {
            dirs,
            logs: Some(logs),
            unlisted,
        }
    }

    /// Where this session's log is, per the snapshot — the same trichotomy `locate_log`
    /// returns (and never `Absent` where `locate_log` would say `Found`: an unlistable
    /// project dir is still probed with a stat).
    fn locate(&self, id: &str) -> LogLocation {
        let Some(logs) = self.logs.as_ref() else {
            return LogLocation::Unknown;
        };
        let file_name = format!("{id}.jsonl");
        if let Some(dir) = logs.get(&file_name).and_then(|ix| self.dirs.get(*ix)) {
            return LogLocation::Found(dir.join(&file_name));
        }
        for dir in &self.unlisted {
            let candidate = dir.join(&file_name);
            if candidate.is_file() {
                return LogLocation::Found(candidate);
            }
        }
        LogLocation::Absent
    }

    /// Whether the session has ≥1 real conversation turn — identical semantics to
    /// `title::has_conversation` (same `conversation_from` decision, same `log_has_turn`
    /// read), answered from the snapshot instead of re-scanning the projects dir.
    pub fn has_conversation(&self, claude_session_id: &str) -> bool {
        conversation_from(self.locate(claude_session_id))
    }
}

/// Whether the JSONL at `path` contains ≥1 line whose `type` is `user` or `assistant`
/// (a real conversation turn, vs. the startup-only metadata entries). A cheap substring
/// pre-filter skips JSON-parsing the many lines that are neither (mirrors
/// `read_session_title`); the first match short-circuits. An unreadable file returns
/// `true` (fail-open, per `has_conversation`).
fn log_has_turn(path: &Path) -> bool {
    let Ok(file) = std::fs::File::open(path) else {
        return true;
    };
    let reader = BufReader::new(file);
    for line in reader.lines() {
        let Ok(line) = line else { continue };
        if !line.contains("\"user\"") && !line.contains("\"assistant\"") {
            continue;
        }
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) {
            if matches!(
                value.get("type").and_then(|t| t.as_str()),
                Some("user") | Some("assistant")
            ) {
                return true;
            }
        }
    }
    false
}

/// Collapse a (possibly long, multi-line) title/prompt to a short single line.
/// `None` for an empty string so the caller falls through to the next source.
fn trim_title(s: &str) -> Option<String> {
    let line = s.lines().next().unwrap_or(s).trim();
    if line.is_empty() {
        return None;
    }
    if line.chars().count() > MAX_LEN {
        let head: String = line.chars().take(MAX_LEN).collect();
        Some(format!("{}…", head.trim_end()))
    } else {
        Some(line.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_ai_title_field() {
        let line = r#"{"type":"ai-title","aiTitle":"Implement task 84","sessionId":"x"}"#;
        assert_eq!(
            field_of(line, "ai-title", "aiTitle"),
            Some("Implement task 84".to_string())
        );
    }

    #[test]
    fn ignores_wrong_type_or_garbage() {
        let line = r#"{"type":"last-prompt","lastPrompt":"hi"}"#;
        assert_eq!(field_of(line, "ai-title", "aiTitle"), None);
        assert_eq!(field_of("not json", "ai-title", "aiTitle"), None);
    }

    #[test]
    fn log_has_turn_detects_conversation() {
        use std::io::Write;
        let dir = std::env::temp_dir().join(format!("cc-fork-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();

        // Only startup metadata (no user/assistant turn) → not forkable.
        let meta = dir.join("meta.jsonl");
        let mut f = std::fs::File::create(&meta).unwrap();
        writeln!(f, r#"{{"type":"mode","mode":"default"}}"#).unwrap();
        writeln!(f, r#"{{"type":"file-history-snapshot"}}"#).unwrap();
        writeln!(f, r#"{{"type":"last-prompt","lastPrompt":"hi"}}"#).unwrap();
        assert!(!log_has_turn(&meta));

        // A real user turn after the metadata → forkable.
        let convo = dir.join("convo.jsonl");
        let mut f = std::fs::File::create(&convo).unwrap();
        writeln!(f, r#"{{"type":"mode","mode":"default"}}"#).unwrap();
        writeln!(f, r#"{{"type":"user","message":{{"role":"user"}}}}"#).unwrap();
        assert!(log_has_turn(&convo));

        // An empty file → not forkable.
        let empty = dir.join("empty.jsonl");
        std::fs::File::create(&empty).unwrap();
        assert!(!log_has_turn(&empty));

        // An unreadable / missing path → fail open (true).
        assert!(log_has_turn(&dir.join("does-not-exist.jsonl")));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn trims_blank_and_long() {
        assert_eq!(trim_title("  "), None);
        assert_eq!(trim_title("hello"), Some("hello".to_string()));
        let long = "a".repeat(200);
        let out = trim_title(&long).unwrap();
        assert!(out.chars().count() <= MAX_LEN + 1); // +1 for the ellipsis
        assert!(out.ends_with('…'));
        // Multi-line collapses to the first line.
        assert_eq!(trim_title("first\nsecond"), Some("first".to_string()));
    }

    // --- The one-shot boot-time projects snapshot (#355) ---

    /// A fresh, uniquely-named temp fixture root (per test, per process) that stands in
    /// for `~/.claude/projects`. Removed by each test at the end.
    fn projects_fixture(tag: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("recue-log-index-{}-{tag}", std::process::id()));
        std::fs::remove_dir_all(&root).ok();
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    /// Write `<projects>/<project>/<id>.jsonl` with either a real conversation turn or
    /// startup metadata only (the two cases the fork guard discriminates).
    fn write_log(projects: &Path, project: &str, id: &str, with_turn: bool) {
        use std::io::Write;
        let dir = projects.join(project);
        std::fs::create_dir_all(&dir).unwrap();
        let mut f = std::fs::File::create(dir.join(format!("{id}.jsonl"))).unwrap();
        writeln!(f, r#"{{"type":"mode","mode":"default"}}"#).unwrap();
        writeln!(f, r#"{{"type":"last-prompt","lastPrompt":"hi"}}"#).unwrap();
        if with_turn {
            writeln!(f, r#"{{"type":"user","message":{{"role":"user"}}}}"#).unwrap();
        }
    }

    #[test]
    fn project_log_index_finds_logs_in_any_project_dir() {
        let projects = projects_fixture("any-dir");
        // The log lives in the *second* project dir — the index must find it wherever it is.
        std::fs::create_dir_all(projects.join("-Users-me-repo-a")).unwrap();
        write_log(&projects, "-Users-me-repo-b", "aaaa-1111", true);
        write_log(&projects, "-Users-me-repo-b", "bbbb-2222", false);

        let index = ProjectLogIndex::build_in(&projects);
        assert!(index.has_conversation("aaaa-1111"), "log with a user turn");
        assert!(!index.has_conversation("bbbb-2222"), "metadata-only log");
        assert!(!index.has_conversation("cccc-3333"), "no log anywhere");

        std::fs::remove_dir_all(&projects).ok();
    }

    #[test]
    fn project_log_index_is_a_snapshot() {
        let projects = projects_fixture("snapshot");
        write_log(&projects, "-repo-a", "aaaa-1111", true);

        let index = ProjectLogIndex::build_in(&projects);
        // Created AFTER the snapshot: a per-call `read_dir` would see it; the index must not.
        write_log(&projects, "-repo-late", "late-9999", true);
        assert!(index.has_conversation("aaaa-1111"));
        assert!(
            !index.has_conversation("late-9999"),
            "the index must be a snapshot, not a per-lookup rescan"
        );

        std::fs::remove_dir_all(&projects).ok();
    }

    #[test]
    fn project_log_index_fails_open_when_projects_dir_is_missing() {
        let missing = std::env::temp_dir().join(format!(
            "recue-log-index-{}-does-not-exist",
            std::process::id()
        ));
        std::fs::remove_dir_all(&missing).ok();
        let index = ProjectLogIndex::build_in(&missing);
        // Couldn't check ⇒ `Unknown` ⇒ fail open, so a working Fork is never wrongly blocked.
        assert!(index.has_conversation("aaaa-1111"));
    }

    #[test]
    fn project_log_index_matches_locate_semantics() {
        let projects = projects_fixture("semantics");
        write_log(&projects, "-repo-a", "aaaa-1111", true);
        write_log(&projects, "-repo-a", "bbbb-2222", false);

        let index = ProjectLogIndex::build_in(&projects);
        // Each answer equals the single-lookup path's decision over the same location.
        let found_turn = projects.join("-repo-a").join("aaaa-1111.jsonl");
        let found_meta = projects.join("-repo-a").join("bbbb-2222.jsonl");
        assert_eq!(
            index.has_conversation("aaaa-1111"),
            conversation_from(LogLocation::Found(found_turn))
        );
        assert_eq!(
            index.has_conversation("bbbb-2222"),
            conversation_from(LogLocation::Found(found_meta))
        );
        assert_eq!(
            index.has_conversation("cccc-3333"),
            conversation_from(LogLocation::Absent)
        );
        assert_eq!(
            ProjectLogIndex::build_in(&projects.join("nope")).has_conversation("aaaa-1111"),
            conversation_from(LogLocation::Unknown)
        );

        std::fs::remove_dir_all(&projects).ok();
    }

    /// A project dir the index can't list must still resolve its `<uuid>.jsonl` through the
    /// per-dir stat fallback — the index may never report `Absent` where `locate_log` (which
    /// only ever stats) would report `Found`. unix-gated: `chmod 0o111` (search, no read) is
    /// exactly that case — `read_dir` fails, a `stat` of a known name inside still succeeds —
    /// and root bypasses the mode bits entirely, so the assertions are skipped there.
    #[cfg(unix)]
    #[test]
    fn project_log_index_falls_back_for_unlistable_dir() {
        use std::os::unix::fs::PermissionsExt;

        let projects = projects_fixture("unlistable");
        write_log(&projects, "-repo-locked", "aaaa-1111", true);
        let locked = projects.join("-repo-locked");
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o111)).unwrap();

        // Root bypasses the mode bits — the fixture wouldn't be unlistable, so skip.
        let readable_anyway = std::fs::read_dir(&locked).is_ok();
        if !readable_anyway {
            let index = ProjectLogIndex::build_in(&projects);
            assert!(
                index.has_conversation("aaaa-1111"),
                "an unlistable project dir must still resolve its log via the stat fallback"
            );
            assert!(
                !index.has_conversation("cccc-3333"),
                "still genuinely absent"
            );
        }

        // Restore permissions so the temp dir can be removed.
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o755)).ok();
        std::fs::remove_dir_all(&projects).ok();
    }
}
