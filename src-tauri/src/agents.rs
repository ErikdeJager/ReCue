//! Pluggable coding-agent specs (#101).
//!
//! Every agent PTY used to hardcode the `claude` CLI. This module makes the coding
//! agent **pluggable**: a built-in catalog of `AgentSpec`s is the single source of
//! truth for everything that differs per agent (its binary, how it spawns/resumes a
//! session, and a few capability flags), so the spawn / resume / boot call sites
//! resolve a spec instead of writing `"claude"` literals — and adding an agent later
//! is one catalog entry rather than scattered edits.
//!
//! **#101 (part 1)** added the abstraction + the `claude` spec (preserving today's
//! exact behavior: `--session-id <uuid>`, `--resume <uuid>`, a positional prompt).
//! **#141 (part 2a)** adds the **`codex`** spec and wires its capability gating on the
//! backend: Codex owns its own session identity (`codex [PROMPT]`, **no** `--session-id`)
//! and this first iteration does **not** resume/fork by id or read an auto-name log
//! (`supports_resume` / `supports_auto_name` are `false`, gating those paths off). The
//! Settings **selector** + the frontend capability gating (hide Fork/copy-resume, the
//! missing-binary wording) land in **#142**. Claude's behavior is byte-for-byte
//! unchanged. **Verify the `codex` invocation against the installed CLI** (same
//! discipline as the claude-flag note in CLAUDE.md Conventions) if flags change.
//!
//! Later: the **`opencode`** spec joins as a third (untested) agent. Like Codex it owns
//! its own session identity (no app `--session-id`), so resume/fork/auto-name are gated
//! off. OpenCode's bare positional is a **project directory**, not a prompt, so a seeded
//! launch passes the prompt via `opencode --prompt "<text>"` (best-effort — **verify
//! against the installed `opencode` CLI**); an interactive session is the bare TUI.

/// The agent id stored on records written before #101 (and the only agent until the
/// Codex follow-up): Claude Code. Used as the serde / read-time default everywhere.
pub const DEFAULT_AGENT_ID: &str = "claude";

/// What differs per coding agent. ReCue's own session/PTY id (a UUID) is
/// unchanged; the spec decides whether/how that id reaches the CLI (e.g. claude's
/// `--session-id`).
// Every field is now consumed (#141): `binary_name` + arg builders by the spawn/
// resume path; `supports_resume` gates boot-resume/Restart/Fork; `supports_auto_name`
// gates the #97 claude-log title/forkable globs; `id`/`display_name`/`install_hint`
// by the `agent_info` command (the #142 selector + missing-binary screen).
#[derive(Debug, Clone, Copy)]
pub struct AgentSpec {
    /// Stable id stored on each session (`"claude"`, `"codex"`, …).
    pub id: &'static str,
    /// Human label for the UI (selector, missing-binary screen, prompts).
    pub display_name: &'static str,
    /// Binary looked up on PATH to run the agent.
    pub binary_name: &'static str,
    /// Whether the CLI can resume a prior session by id. Gates boot-restore /
    /// Restart / the copy-resume command (wired in the follow-up).
    pub supports_resume: bool,
    /// Whether the CLI writes an `ai-title` log ReCue can read for auto-naming
    /// (#97) — claude does; others fall back to the branch / first prompt.
    pub supports_auto_name: bool,
    /// Shown on the missing-binary screen when this CLI isn't on PATH.
    pub install_hint: &'static str,
}

impl AgentSpec {
    /// CLI args to start a **new** session under `session_id`, optionally seeding an
    /// initial `prompt` (blank prompts are dropped). Today only Claude exists; the
    /// Codex follow-up branches here on `self.id`.
    pub fn spawn_args(&self, session_id: &str, prompt: Option<&str>) -> Vec<String> {
        let trimmed = prompt.map(str::trim).filter(|p| !p.is_empty());
        match self.id {
            // Codex owns its own session identity — there is **no** `--session-id`
            // flag (#141). A new session is just `codex [PROMPT]` (the prompt is a
            // positional, optional; verified against the Codex CLI reference). The
            // app session id we mint is ignored for Codex (resume/fork are gated off
            // this iteration since Codex's id isn't app-ownable).
            "codex" => trimmed.map(|p| vec![p.to_string()]).unwrap_or_default(),
            // OpenCode owns its own session identity (no app `--session-id`); a bare
            // positional is a **project directory**, so a seeded prompt goes through
            // `--prompt` (best-effort — **VERIFY against the installed opencode CLI**).
            // No prompt → the bare TUI in cwd.
            "opencode" => trimmed
                .map(|p| vec!["--prompt".to_string(), p.to_string()])
                .unwrap_or_default(),
            // Claude: `claude --session-id <uuid> ["<prompt>"]` (verified, #30/#93).
            _ => {
                let mut args = vec!["--session-id".to_string(), session_id.to_string()];
                if let Some(p) = trimmed {
                    args.push(p.to_string());
                }
                args
            }
        }
    }

    /// CLI args to **resume** `session_id` — only meaningful when `supports_resume`.
    /// Claude: `claude --resume <uuid>` (verified, #30).
    pub fn resume_args(&self, session_id: &str) -> Vec<String> {
        vec!["--resume".to_string(), session_id.to_string()]
    }

    /// CLI args to **fork** `source_id`'s conversation into a brand-new session under
    /// `new_id` (#126) — a resume variant, so only meaningful when `supports_resume`.
    /// Claude: `claude --session-id <new> --resume <source> --fork-session` (verified
    /// against claude 2.1.176 — all three flags parse together; the source's on-disk
    /// log is read at spawn time, leaving the source session untouched).
    pub fn fork_args(&self, new_id: &str, source_id: &str) -> Vec<String> {
        vec![
            "--session-id".to_string(),
            new_id.to_string(),
            "--resume".to_string(),
            source_id.to_string(),
            "--fork-session".to_string(),
        ]
    }
}

/// The Claude Code spec — today's exact behavior.
const CLAUDE: AgentSpec = AgentSpec {
    id: "claude",
    display_name: "Claude Code",
    binary_name: "claude",
    supports_resume: true,
    supports_auto_name: true,
    install_hint: "Install Claude Code and make sure `claude` is on your PATH.",
};

/// The OpenAI Codex CLI spec (#141). Codex owns its own session identity (no
/// app-passed `--session-id`), so this first iteration deliberately **does not**
/// resume/fork by id or read a claude-style auto-name log — both capability flags
/// are `false`, which gates those paths off for every Codex session (boot-resume,
/// Restart, Fork, the #97/#138 title/forkable globs). New interactive sessions
/// (`codex [PROMPT]`) work; resume is a future follow-up once an id-capture
/// strategy exists. **Verify the exact `codex` invocation against the installed CLI.**
const CODEX: AgentSpec = AgentSpec {
    id: "codex",
    display_name: "Codex",
    binary_name: "codex",
    supports_resume: false,
    supports_auto_name: false,
    install_hint: "Install the Codex CLI and make sure `codex` is on your PATH.",
};

/// The OpenCode CLI spec — a third, **untested** agent. Like Codex it owns its own
/// session identity (no app-passed `--session-id`), so resume/fork by id and the
/// claude-style auto-name log are gated off (both flags `false`). A bare positional
/// is a project directory, so a seeded session passes the prompt via `--prompt`
/// (best-effort, see `spawn_args`). New interactive sessions (the bare `opencode`
/// TUI) work. **Verify the exact `opencode` invocation against the installed CLI.**
const OPENCODE: AgentSpec = AgentSpec {
    id: "opencode",
    display_name: "OpenCode",
    binary_name: "opencode",
    supports_resume: false,
    supports_auto_name: false,
    install_hint: "Install OpenCode and make sure `opencode` is on your PATH.",
};

/// Resolve an agent id to its spec (#141). An unknown id — including a legacy
/// record's defaulted `"claude"` or any unrecognized value — falls back to Claude,
/// so nothing ever fails to resolve.
pub fn agent_spec(id: &str) -> AgentSpec {
    match id {
        "codex" => CODEX,
        "opencode" => OPENCODE,
        _ => CLAUDE,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_spawn_and_resume_args_match_todays_flags() {
        let spec = agent_spec("claude");
        assert_eq!(spec.binary_name, "claude");
        assert_eq!(spec.spawn_args("abc", None), vec!["--session-id", "abc"]);
        assert_eq!(
            spec.spawn_args("abc", Some("  hi  ")),
            vec!["--session-id", "abc", "hi"]
        );
        // A blank prompt is dropped (a plain new session).
        assert_eq!(
            spec.spawn_args("abc", Some("   ")),
            vec!["--session-id", "abc"]
        );
        assert_eq!(spec.resume_args("abc"), vec!["--resume", "abc"]);
        // Fork (#126): a new session id resuming the source with --fork-session.
        assert_eq!(
            spec.fork_args("new-id", "src-id"),
            vec![
                "--session-id",
                "new-id",
                "--resume",
                "src-id",
                "--fork-session"
            ]
        );
    }

    #[test]
    fn unknown_id_falls_back_to_claude() {
        assert_eq!(agent_spec("nope").id, "claude");
        assert_eq!(agent_spec("").id, "claude");
    }

    #[test]
    fn codex_spec_has_no_resume_or_auto_name() {
        let spec = agent_spec("codex");
        assert_eq!(spec.id, "codex");
        assert_eq!(spec.binary_name, "codex");
        assert!(
            !spec.supports_resume,
            "Codex resume/fork is gated off (#141)"
        );
        assert!(
            !spec.supports_auto_name,
            "Codex has no claude-style ai-title log"
        );
    }

    #[test]
    fn codex_spawn_args_are_positional_with_no_session_id() {
        let spec = agent_spec("codex");
        // No `--session-id` — Codex owns its own identity; a plain new session is `codex`.
        assert!(spec.spawn_args("ignored-uuid", None).is_empty());
        // A seeded session passes only the positional prompt (trimmed).
        assert_eq!(spec.spawn_args("ignored-uuid", Some("  hi  ")), vec!["hi"]);
        // A blank prompt is dropped → a plain new session.
        assert!(spec.spawn_args("ignored-uuid", Some("   ")).is_empty());
    }

    #[test]
    fn opencode_spec_has_no_resume_or_auto_name() {
        let spec = agent_spec("opencode");
        assert_eq!(spec.id, "opencode");
        assert_eq!(spec.binary_name, "opencode");
        assert!(
            !spec.supports_resume,
            "OpenCode resume/fork is gated off (owns its own session id)"
        );
        assert!(
            !spec.supports_auto_name,
            "OpenCode has no claude-style ai-title log"
        );
    }

    #[test]
    fn opencode_spawn_args_use_prompt_flag_not_positional() {
        let spec = agent_spec("opencode");
        // No `--session-id` and no bare positional (that would be a project DIR) —
        // a plain new session is just `opencode`.
        assert!(spec.spawn_args("ignored-uuid", None).is_empty());
        // A seeded session passes the prompt through `--prompt` (trimmed).
        assert_eq!(
            spec.spawn_args("ignored-uuid", Some("  hi  ")),
            vec!["--prompt", "hi"]
        );
        // A blank prompt is dropped → a plain new session.
        assert!(spec.spawn_args("ignored-uuid", Some("   ")).is_empty());
    }

    #[test]
    fn claude_spawn_args_unchanged_by_codex_addition() {
        // The Codex `match` arm must not alter Claude's args (byte-for-byte, #141).
        let spec = agent_spec("claude");
        assert_eq!(spec.spawn_args("abc", None), vec!["--session-id", "abc"]);
        assert_eq!(
            spec.spawn_args("abc", Some("hi")),
            vec!["--session-id", "abc", "hi"]
        );
    }
}
