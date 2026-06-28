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
    match locate_log(claude_session_id) {
        LogLocation::Found(path) => log_has_turn(&path),
        LogLocation::Absent => false,
        LogLocation::Unknown => true,
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
}
