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
    title_from_reader(BufReader::new(file))
}

/// Core of `read_session_title` over any line source (factored out so the unit
/// tests can feed it byte slices). One forward pass: keep the LAST `ai-title`
/// (it's appended as the title evolves) and the FIRST `last-prompt` (the
/// fallback). A cheap substring pre-filter avoids JSON-parsing the many lines
/// that are neither; an unreadable (non-UTF-8) line is skipped.
fn title_from_reader(reader: impl BufRead) -> Option<String> {
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
/// we never replicate claude's cwd→dir encoding (it maps `/` and `.` → `-`). When
/// several project dirs hold a copy, the **newest by mtime** wins (see
/// `locate_log_in`) — the same rule as `find_log`, so the fork guard (#134/#138)
/// and the title/cwd readers can never disagree about which log is live.
fn locate_log(id: &str) -> LogLocation {
    let Some(home) = crate::path_env::home_dir() else {
        return LogLocation::Unknown;
    };
    locate_log_in(&home.join(".claude").join("projects"), id)
}

/// Core of `locate_log` over an explicit projects root (factored out so the unit
/// tests can point it at a temp fixture): an unreadable root is `Unknown`, a
/// readable one with no `<id>.jsonl` anywhere is `Absent`, and — like `find_log` —
/// the **newest** copy by mtime wins when several project dirs hold one: entering
/// a worktree RELOCATES the transcript (Claude Code ≥ 2.1.198) and can leave a
/// stale, turn-less copy behind, and a first-match walk could pin the fork guard
/// to that stale file for good while the title/cwd readers follow the live one.
fn locate_log_in(projects: &Path, id: &str) -> LogLocation {
    if std::fs::read_dir(projects).is_err() {
        return LogLocation::Unknown;
    }
    match newest_log_in(projects, &format!("{id}.jsonl")) {
        Some(path) => LogLocation::Found(path),
        None => LogLocation::Absent,
    }
}

/// The session's log path, or `None` when it isn't there / can't be reached.
///
/// Picks the **newest** `<id>.jsonl` by mtime when several project dirs hold one:
/// entering a worktree RELOCATES the transcript to that directory's project
/// storage (Claude Code ≥ 2.1.198) and can leave a stale copy behind — the old
/// first-match walk could pin the title (and the `read_session_cwd` relocation
/// signal) to the stale file for good. With a single copy (the overwhelmingly
/// common case) this is the old behavior. Shares `locate_log`'s resolution, so
/// every log reader agrees on which copy is live.
fn find_log(id: &str) -> Option<PathBuf> {
    match locate_log(id) {
        LogLocation::Found(path) => Some(path),
        LogLocation::Absent | LogLocation::Unknown => None,
    }
}

/// The newest (by mtime) `<file_name>` across the project dirs under `projects`.
/// An unreadable mtime sorts as the epoch, so a readable duplicate still wins.
fn newest_log_in(projects: &Path, file_name: &str) -> Option<PathBuf> {
    let entries = std::fs::read_dir(projects).ok()?;
    let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
    for entry in entries.flatten() {
        let candidate = entry.path().join(file_name);
        let Ok(meta) = candidate.metadata() else {
            continue;
        };
        if !meta.is_file() {
            continue;
        }
        let mtime = meta.modified().unwrap_or(std::time::UNIX_EPOCH);
        if best.as_ref().map(|(t, _)| mtime > *t).unwrap_or(true) {
            best = Some((mtime, candidate));
        }
    }
    best.map(|(_, path)| path)
}

/// How much of the log tail `read_session_cwd` scans. Every transcript line
/// carries a `cwd`, but a single line (a large tool result) can exceed 64 KiB —
/// a 256 KiB window keeps the read bounded while making a truncated-tail miss
/// (fail-open: no relocation signal until the next burst re-read) rare.
const CWD_TAIL_BYTES: u64 = 256 * 1024;

/// The directory the session is currently working in, per claude's own log:
/// every JSONL line carries a `cwd` field, and `EnterWorktree` / `/cd` move it.
/// This is the agent-relocation signal — when it lands inside a detected
/// worktree, the sidebar re-parents the agent row there. Bounded (only the log
/// tail is read) and best-effort like the title read: `None` on any miss.
pub fn read_session_cwd(claude_session_id: &str) -> Option<String> {
    let path = find_log(claude_session_id)?;
    read_cwd_at(&path, CWD_TAIL_BYTES)
}

/// Core of `read_session_cwd` over an explicit log path, with the tail window as
/// a parameter (factored out so the unit tests can exercise the windowing on
/// small files; the wrapper passes `CWD_TAIL_BYTES`): read at most the last
/// `tail_bytes` of the file and take the last `cwd` in that tail.
fn read_cwd_at(path: &Path, tail_bytes: u64) -> Option<String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut file = std::fs::File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    let start = len.saturating_sub(tail_bytes);
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).ok()?;
    // A tail window can start mid-line and mid-UTF-8 — lossy-convert, and let
    // the parser drop the leading partial line.
    let tail = String::from_utf8_lossy(&buf);
    last_cwd_in_tail(&tail, start > 0)
}

/// Pure core of `read_session_cwd`: the LAST line in `tail` that parses as a
/// JSON object carrying a non-empty string `cwd`. `truncated` drops the first
/// line (a tail window that didn't start at byte 0 may open mid-record). A
/// substring pre-filter gates the serde parse, the `read_session_title` pattern.
fn last_cwd_in_tail(tail: &str, truncated: bool) -> Option<String> {
    let mut lines = tail.lines();
    if truncated {
        let _ = lines.next();
    }
    let mut found: Option<String> = None;
    for line in lines {
        if !line.contains("\"cwd\"") {
            continue;
        }
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        if let Some(cwd) = value.get("cwd").and_then(|v| v.as_str()) {
            if !cwd.is_empty() {
                found = Some(cwd.to_string());
            }
        }
    }
    found
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
        let mut newest: HashMap<String, (std::time::SystemTime, usize)> = HashMap::new();
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
                    // Newest copy wins — the same mtime rule `locate_log`/`find_log`
                    // apply to a relocated transcript's stale duplicate (an
                    // unreadable mtime sorts as the epoch; ties keep the first).
                    let mtime = file
                        .metadata()
                        .and_then(|m| m.modified())
                        .unwrap_or(std::time::UNIX_EPOCH);
                    match newest.get(name) {
                        Some((seen, _)) if *seen >= mtime => {}
                        _ => {
                            newest.insert(name.to_string(), (mtime, dir_ix));
                        }
                    }
                }
            }
        }
        Self {
            dirs,
            logs: Some(
                newest
                    .into_iter()
                    .map(|(name, (_, dir_ix))| (name, dir_ix))
                    .collect(),
            ),
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
    fn title_from_reader_prefers_the_last_ai_title() {
        // The title is appended as the conversation evolves — the LAST one wins,
        // over any prompt and over junk lines that don't parse.
        let log = concat!(
            "{\"type\":\"last-prompt\",\"lastPrompt\":\"first prompt\"}\n",
            "{\"type\":\"ai-title\",\"aiTitle\":\"Early title\"}\n",
            "junk that is not json\n",
            "{\"type\":\"ai-title\",\"aiTitle\":\"Final title\"}\n",
        );
        assert_eq!(
            title_from_reader(log.as_bytes()),
            Some("Final title".to_string())
        );
    }

    #[test]
    fn title_from_reader_falls_back_to_the_first_prompt() {
        // No ai-title anywhere: the FIRST last-prompt is the fallback (later
        // prompts never replace it).
        let log = concat!(
            "{\"type\":\"mode\",\"mode\":\"default\"}\n",
            "{\"type\":\"last-prompt\",\"lastPrompt\":\"first prompt\"}\n",
            "{\"type\":\"last-prompt\",\"lastPrompt\":\"second prompt\"}\n",
        );
        assert_eq!(
            title_from_reader(log.as_bytes()),
            Some("first prompt".to_string())
        );
        // No title or prompt at all → None (the caller keeps the branch label).
        assert_eq!(title_from_reader(&b"{\"type\":\"mode\"}\n"[..]), None);
        assert_eq!(title_from_reader(&b""[..]), None);
    }

    #[test]
    fn title_from_reader_skips_unreadable_and_lookalike_lines() {
        // An invalid-UTF-8 line makes `lines()` yield Err — skipped, not fatal.
        let mut bytes = b"\xff\xfe not utf-8\n".to_vec();
        bytes.extend_from_slice(b"{\"type\":\"ai-title\",\"aiTitle\":\"Survives\"}\n");
        // A line carrying an "ai-title" KEY under the wrong `type` passes the
        // substring pre-filter but not `field_of` — it must not clobber the title.
        bytes.extend_from_slice(b"{\"type\":\"noise\",\"ai-title\":\"clobber\"}\n");
        assert_eq!(title_from_reader(&bytes[..]), Some("Survives".to_string()));
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
    fn log_has_turn_ignores_lookalike_lines() {
        use std::io::Write;
        let dir = projects_fixture("lookalike");
        let log = dir.join("lookalike.jsonl");
        let mut f = std::fs::File::create(&log).unwrap();
        // Parses, but the type is NOT user/assistant — only mentions "user".
        writeln!(f, r#"{{"type":"file-history-snapshot","note":"user"}}"#).unwrap();
        // Mentions "assistant" but isn't JSON at all.
        writeln!(f, "not json but \"assistant\" appears").unwrap();
        assert!(
            !log_has_turn(&log),
            "lines that merely mention user/assistant are not turns"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    /// Differential over the REAL home (read-only): the per-lookup
    /// `has_conversation` and the boot-time snapshot must agree — the #355
    /// "identical semantics" invariant. The fabricated UUID exists on no machine,
    /// so both resolve the same `Absent` (readable projects dir) or `Unknown`
    /// (no `~/.claude/projects`) location, whichever this machine has.
    #[test]
    fn has_conversation_matches_the_boot_index() {
        let id = format!("recue-title-cov-{}-2222-none", std::process::id());
        assert_eq!(
            has_conversation(&id),
            ProjectLogIndex::build().has_conversation(&id)
        );
    }

    #[test]
    fn last_cwd_in_tail_takes_the_last_parseable_cwd() {
        let tail = concat!(
            "{\"type\":\"user\",\"cwd\":\"/repo\"}\n",
            "not json with \"cwd\" in it\n",
            "{\"type\":\"assistant\",\"cwd\":\"/repo/.claude/worktrees/feat-x\"}\n",
            "{\"type\":\"file-history-snapshot\"}\n",
        );
        assert_eq!(
            last_cwd_in_tail(tail, false),
            Some("/repo/.claude/worktrees/feat-x".to_string())
        );
        // Truncated tail: the (possibly partial) first line is dropped — here it
        // would otherwise win as the only cwd.
        let only_first = "{\"cwd\":\"/partial\"}\n{\"type\":\"x\"}\n";
        assert_eq!(last_cwd_in_tail(only_first, true), None);
        // No cwd anywhere / empty cwd → None (fail-open).
        assert_eq!(last_cwd_in_tail("{\"type\":\"x\"}\n", false), None);
        assert_eq!(last_cwd_in_tail("{\"cwd\":\"\"}\n", false), None);
        assert_eq!(last_cwd_in_tail("", false), None);
        // A parseable line whose `cwd` isn't a string leaves the prior find intact.
        assert_eq!(
            last_cwd_in_tail("{\"cwd\":\"/keep\"}\n{\"cwd\":123}\n", false),
            Some("/keep".to_string())
        );
    }

    #[test]
    fn read_cwd_at_reads_a_small_file_in_full() {
        let dir = projects_fixture("cwd-small");
        let log = dir.join("cwd.jsonl");
        // Fits the window (start == 0): nothing is dropped, so a cwd on the very
        // first line is visible and the LAST one still wins.
        std::fs::write(&log, "{\"cwd\":\"/head\"}\n").unwrap();
        assert_eq!(read_cwd_at(&log, 1024), Some("/head".to_string()));
        std::fs::write(&log, "{\"cwd\":\"/repo\"}\n{\"cwd\":\"/repo/wt\"}\n").unwrap();
        assert_eq!(read_cwd_at(&log, 1024), Some("/repo/wt".to_string()));
        // A missing file → None (fail-open).
        assert_eq!(read_cwd_at(&dir.join("missing.jsonl"), 1024), None);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn read_cwd_at_scans_only_the_tail_window() {
        let dir = projects_fixture("cwd-tail");
        let log = dir.join("cwd.jsonl");
        let line1 = "{\"cwd\":\"/only-in-head\"}\n";
        let line2 = "{\"type\":\"noise-noise-noise\"}\n";
        let line3 = "{\"cwd\":\"/in-tail\"}\n";
        std::fs::write(&log, format!("{line1}{line2}{line3}")).unwrap();
        // Window covers line3 plus a partial line2: the partial first line is
        // dropped, the tail cwd is found.
        let window = (line3.len() + 5) as u64;
        assert_eq!(read_cwd_at(&log, window), Some("/in-tail".to_string()));
        // Window entirely inside line3 (partial only): dropped → None, even
        // though earlier lines carry a cwd — the read really is bounded.
        assert_eq!(read_cwd_at(&log, 5), None);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn newest_log_in_skips_a_directory_named_like_the_log() {
        let projects = projects_fixture("dir-candidate");
        // A DIRECTORY named `<uuid>.jsonl` must never be picked up as a log…
        std::fs::create_dir_all(projects.join("-repo-a").join("uuid.jsonl")).unwrap();
        assert_eq!(newest_log_in(&projects, "uuid.jsonl"), None);
        // …while a real file in a sibling project dir still is.
        let real = projects.join("-repo-b").join("uuid.jsonl");
        std::fs::create_dir_all(projects.join("-repo-b")).unwrap();
        std::fs::write(&real, "{}").unwrap();
        assert_eq!(newest_log_in(&projects, "uuid.jsonl"), Some(real));
        std::fs::remove_dir_all(&projects).ok();
    }

    #[test]
    fn locate_log_in_distinguishes_found_absent_unknown() {
        let projects = projects_fixture("locate");
        write_log(&projects, "-repo-a", "aaaa-1111", true);
        match locate_log_in(&projects, "aaaa-1111") {
            LogLocation::Found(p) => {
                assert_eq!(p, projects.join("-repo-a").join("aaaa-1111.jsonl"));
            }
            _ => panic!("expected Found"),
        }
        // Readable root, no such log anywhere → genuinely Absent (not forkable).
        assert!(matches!(
            locate_log_in(&projects, "zzzz-0000"),
            LogLocation::Absent
        ));
        // Unreadable/missing root → Unknown (fail open, per #134).
        assert!(matches!(
            locate_log_in(&projects.join("nope"), "aaaa-1111"),
            LogLocation::Unknown
        ));
        std::fs::remove_dir_all(&projects).ok();
    }

    /// Pin a file's mtime explicitly (no sleeps — the `newest_log_in` test's pattern).
    fn set_mtime(path: &Path, at: std::time::SystemTime) {
        std::fs::File::options()
            .append(true)
            .open(path)
            .unwrap()
            .set_modified(at)
            .unwrap();
    }

    #[test]
    fn locate_log_in_prefers_the_newest_duplicate() {
        let projects = projects_fixture("locate-newest");
        // The worktree-relocation layout: the old project dir keeps a stale copy,
        // the worktree's project dir holds the live one.
        write_log(&projects, "-repo", "dddd-4444", false);
        write_log(&projects, "-repo--claude-worktrees-x", "dddd-4444", true);
        let stale = projects.join("-repo").join("dddd-4444.jsonl");
        let fresh = projects
            .join("-repo--claude-worktrees-x")
            .join("dddd-4444.jsonl");
        let base =
            std::time::SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1_700_000_000);
        set_mtime(&stale, base);
        set_mtime(&fresh, base + std::time::Duration::from_secs(60));
        match locate_log_in(&projects, "dddd-4444") {
            LogLocation::Found(p) => assert_eq!(p, fresh),
            _ => panic!("expected Found"),
        }
        std::fs::remove_dir_all(&projects).ok();
    }

    #[test]
    fn project_log_index_prefers_the_newest_duplicate() {
        let projects = projects_fixture("index-newest");
        // Stale copy: startup metadata only (not forkable); relocated live copy: a
        // real turn. Under the old first-listed rule the answer depended on
        // read_dir order; newest-by-mtime pins it to the live log, matching
        // locate_log/find_log so Fork can never stick to the stale duplicate.
        write_log(&projects, "-repo", "eeee-5555", false);
        write_log(&projects, "-repo--claude-worktrees-x", "eeee-5555", true);
        let stale = projects.join("-repo").join("eeee-5555.jsonl");
        let fresh = projects
            .join("-repo--claude-worktrees-x")
            .join("eeee-5555.jsonl");
        let base =
            std::time::SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1_700_000_000);
        set_mtime(&stale, base + std::time::Duration::from_secs(60));
        set_mtime(&fresh, base + std::time::Duration::from_secs(120));
        assert!(ProjectLogIndex::build_in(&projects).has_conversation("eeee-5555"));

        // Reverse orientation: when the NEWEST copy has no turn, not forkable.
        set_mtime(&stale, base + std::time::Duration::from_secs(200));
        assert!(!ProjectLogIndex::build_in(&projects).has_conversation("eeee-5555"));
        std::fs::remove_dir_all(&projects).ok();
    }

    /// Differential over the REAL home (read-only — nothing is ever written under
    /// `~`): `find_log` must be exactly `newest_log_in` over `~/.claude/projects`,
    /// and the public readers must fail open to `None` for a session that has no
    /// log anywhere (the fabricated UUID exists on no machine).
    #[test]
    fn find_log_and_the_public_readers_fail_open_without_a_log() {
        let id = format!("recue-title-cov-{}-1111-none", std::process::id());
        let expected = crate::path_env::home_dir().and_then(|h| {
            newest_log_in(&h.join(".claude").join("projects"), &format!("{id}.jsonl"))
        });
        assert_eq!(find_log(&id), expected);
        assert_eq!(find_log(&id), None, "a fabricated UUID can have no log");
        assert_eq!(read_session_title(&id), None);
        assert_eq!(read_session_cwd(&id), None);
    }

    #[test]
    fn newest_log_in_prefers_the_freshest_duplicate() {
        use std::fs::{self, File};
        use std::time::{Duration, SystemTime};
        let projects =
            std::env::temp_dir().join(format!("cc-projects-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&projects);
        // Two project dirs both holding uuid.jsonl — the worktree-relocation
        // layout: `-repo` keeps a stale copy, `-repo--claude-worktrees-x` the
        // live one. Explicit mtimes (no sleeps) make "newest" deterministic.
        let stale_dir = projects.join("-repo");
        let fresh_dir = projects.join("-repo--claude-worktrees-x");
        fs::create_dir_all(&stale_dir).unwrap();
        fs::create_dir_all(&fresh_dir).unwrap();
        let stale = stale_dir.join("uuid.jsonl");
        let fresh = fresh_dir.join("uuid.jsonl");
        fs::write(&stale, "{}").unwrap();
        fs::write(&fresh, "{}").unwrap();
        let base = SystemTime::UNIX_EPOCH + Duration::from_secs(1_700_000_000);
        File::options()
            .append(true)
            .open(&stale)
            .unwrap()
            .set_modified(base)
            .unwrap();
        File::options()
            .append(true)
            .open(&fresh)
            .unwrap()
            .set_modified(base + Duration::from_secs(60))
            .unwrap();

        assert_eq!(newest_log_in(&projects, "uuid.jsonl"), Some(fresh.clone()));
        // Flip the freshness — the OTHER copy wins (it really is mtime, not order).
        File::options()
            .append(true)
            .open(&stale)
            .unwrap()
            .set_modified(base + Duration::from_secs(120))
            .unwrap();
        assert_eq!(newest_log_in(&projects, "uuid.jsonl"), Some(stale));
        // Missing everywhere → None.
        assert_eq!(newest_log_in(&projects, "other.jsonl"), None);
        let _ = fs::remove_dir_all(&projects);
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
        // A stray FILE in the projects root is not a project dir — skipped.
        std::fs::write(projects.join("stray.txt"), "not a dir").unwrap();

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
