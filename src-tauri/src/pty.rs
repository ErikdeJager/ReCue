//! Session / PTY core.
//!
//! Spawns and manages one real PTY per session — each running `claude` in a
//! chosen working directory — streams its output over an `mpsc` channel, and
//! accepts input / resize / kill. Deliberately decoupled from Tauri: the channel
//! is drained by the command layer (`src/commands.rs`) for live runs and by the
//! unit tests below. No status detection or approval parsing in v1 — this is a
//! faithful terminal pipe.

use std::collections::{HashMap, HashSet, VecDeque};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use uuid::Uuid;

/// Server-side scrollback retained per session, for late subscribers (bytes).
const SCROLLBACK_CAP: usize = 256 * 1024;
/// Initial PTY size, before the frontend reports its real dimensions.
const DEFAULT_COLS: u16 = 80;
const DEFAULT_ROWS: u16 = 24;
/// Read chunk size for the per-session reader thread.
const READ_CHUNK: usize = 8 * 1024;
/// Busy heuristic (#42): a session reads as **busy** while output flowed within
/// this window, and **idle** once it's quiet for longer. The window also
/// debounces the busy→idle edge so brief gaps between TUI redraws don't flicker.
const BUSY_WINDOW_MS: u64 = 700;
/// How often the monitor thread re-evaluates each session's busy state (#42).
const MONITOR_TICK_MS: u64 = 200;
/// Output is treated as the terminal's **echo of typing** (not Claude working,
/// #55) unless it arrives at least this long after the last keystroke. Tuned so
/// keystroke echo never reads as busy, while sustained autonomous output does.
const INPUT_ECHO_MS: u64 = 300;
/// Title re-read schedule (#169): after each poke (a busy→idle edge or a session
/// spawn), the title worker re-reads claude's `ai-title` at these offsets (ms),
/// spanning ~30s. `claude` writes the LLM-generated title **asynchronously**, a
/// moment after the turn ends, so a single read at the busy→idle edge often misses
/// it — the burst picks it up within seconds with no user click. The per-session
/// dedup makes re-reading an unchanged title a cheap no-op; extending the last
/// value lengthens the window.
const TITLE_REREAD_OFFSETS_MS: &[u64] = &[0, 1_500, 4_000, 8_000, 15_000, 30_000];

/// Errors surfaced to the frontend. Serialized as `{ kind, message }` so the UI
/// can branch on `kind` (e.g. show the "claude not found" surface).
#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    #[error("`{0}` was not found on PATH")]
    BinaryNotFound(String),
    #[error("session `{0}` was not found")]
    SessionNotFound(String),
    #[error("failed to spawn process: {0}")]
    Spawn(String),
    #[error("pty error: {0}")]
    Io(String),
    #[error("{0}")]
    Git(String),
    /// The fork source has no materialized conversation to fork (#134) — refused
    /// before spawning a `claude` that would exit 1 ("No conversation found").
    #[error("Nothing to fork yet — send the agent a message first.")]
    NothingToFork,
    /// The agent doesn't support resuming/forking a session by id (#141) — e.g.
    /// Codex, whose session identity isn't app-ownable. Refused before spawning a
    /// CLI that would mis-handle our `--resume <id>`. `{0}` is the agent's id.
    #[error("the `{0}` agent can't resume or fork a session yet")]
    ResumeUnsupported(String),
}

impl SessionError {
    fn kind(&self) -> &'static str {
        match self {
            Self::BinaryNotFound(_) => "BinaryNotFound",
            Self::SessionNotFound(_) => "SessionNotFound",
            Self::Spawn(_) => "Spawn",
            Self::Io(_) => "Io",
            Self::Git(_) => "Git",
            Self::NothingToFork => "NothingToFork",
            Self::ResumeUnsupported(_) => "ResumeUnsupported",
        }
    }
}

impl Serialize for SessionError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("SessionError", 2)?;
        state.serialize_field("kind", self.kind())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

/// Metadata returned to the frontend when a session is created.
#[derive(Debug, Clone, Serialize)]
pub struct SessionInfo {
    pub id: String,
    pub name: Option<String>,
    pub cwd: String,
}

/// Output / lifecycle events produced by sessions, drained by the command layer.
#[derive(Debug, Clone)]
pub enum SessionEvent {
    Output {
        id: String,
        bytes: Vec<u8>,
    },
    Exited {
        id: String,
        code: Option<i32>,
    },
    /// Busy/idle transition from the output-activity heuristic (#42); emitted
    /// only on change (debounced) by the monitor thread.
    State {
        id: String,
        busy: bool,
    },
    /// claude's auto-generated session title changed (#97); emitted by the title
    /// worker after a busy→idle edge when the log's `ai-title` differs from what
    /// was last seen. The command layer persists it and notifies the UI.
    Name {
        id: String,
        name: String,
    },
    /// Whether the session has forkable conversation history (#138); emitted by the
    /// title worker on the same busy→idle cadence (#97) when it changes, so the Fork
    /// affordance can be gated up front. The command layer persists + forwards it.
    Forkable {
        id: String,
        forkable: bool,
    },
}

/// Per-session activity timestamps (millis-since-`base`, 0 = none) for the busy
/// heuristic. `last_output` is stamped by the reader thread (#42); `last_input`
/// by `write_stdin` (#55) so the monitor can tell the terminal's echo of typing
/// from genuine Claude output.
struct ActivityState {
    last_output: AtomicU64,
    last_input: AtomicU64,
    /// Whether the session booted with an initial prompt (#93/#116) — a scheduled /
    /// prompt-seeded agent works immediately with **no** `write_stdin`, so it has
    /// "work to do" from spawn even though `last_input` stays 0. An interactive
    /// session starts `false`, so its pre-input startup paint never reads as busy.
    seeded: AtomicBool,
    /// Whether this session reads claude's `ai-title` / conversation log (#141): true
    /// for the `claude` agent, false for an agent that doesn't write one (Codex) and
    /// for shell terminals. Set once at spawn; the monitor forwards it to the title
    /// worker so the #97 auto-name + #138 forkable globs never run for a non-claude
    /// session (which would be meaningless / could mis-report forkable).
    uses_claude_log: bool,
}

/// Per-session activity map shared between the reader threads, `write_stdin`, and
/// the monitor thread (which derives busy/idle), keyed by session id.
type Activity = Arc<Mutex<HashMap<String, Arc<ActivityState>>>>;

/// Bounded byte ring buffer used to replay recent output to late subscribers.
struct Scrollback {
    buf: VecDeque<u8>,
    cap: usize,
}

impl Scrollback {
    fn new(cap: usize) -> Self {
        Self {
            buf: VecDeque::new(),
            cap,
        }
    }

    fn push(&mut self, bytes: &[u8]) {
        self.buf.extend(bytes);
        if self.buf.len() > self.cap {
            let overflow = self.buf.len() - self.cap;
            self.buf.drain(0..overflow);
        }
    }

    fn snapshot(&self) -> Vec<u8> {
        self.buf.iter().copied().collect()
    }
}

/// A single live (or recently-exited) PTY session.
struct Session {
    // Retained for persistence / session listing in later tasks (#5, #7).
    #[allow(dead_code)]
    name: Option<String>,
    #[allow(dead_code)]
    cwd: PathBuf,
    // `master` and `writer` are wrapped in their own `Arc<Mutex<…>>` (mirroring
    // `child`/`scrollback`, #260) so a *blocking* PTY op — a `write_all` to a
    // backpressured stdin, or a `resize()` — runs under a **per-session** lock,
    // never the global `sessions` map lock. Otherwise one flooded/blocked session
    // would stall every other session's keystrokes, resizes, and scrollback reads.
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    scrollback: Arc<Mutex<Scrollback>>,
    // Reader thread; detached on drop (it finishes when the PTY closes).
    _reader: JoinHandle<()>,
}

/// Owns the registry of sessions and their PTYs.
pub struct SessionManager {
    sessions: Mutex<HashMap<String, Session>>,
    // `mpsc::Sender` is `!Sync`; the Mutex lets `SessionManager` be a Tauri state.
    events: Mutex<Sender<SessionEvent>>,
    // A clone of the title-worker poke channel (#169), so a spawn can kick off a
    // title re-read burst immediately (the monitor keeps its own clone for the
    // busy→idle edge). Mutex for the same `!Sync` reason as `events`.
    title_tx: Mutex<Sender<(String, bool)>>,
    // Busy-heuristic state (#42), shared with the reader + monitor threads.
    activity: Activity,
    // Monotonic base for the millis timestamps in `activity`.
    base: Instant,
}

impl SessionManager {
    pub fn new(events: Sender<SessionEvent>) -> Self {
        let activity: Activity = Arc::new(Mutex::new(HashMap::new()));
        let base = Instant::now();
        // The busy/idle monitor (#42) also pokes the title worker (#97) on each
        // busy→idle edge through this side channel, so reading claude's `ai-title`
        // (a file scan) never runs inline in the monitor's tick.
        // The poke carries the session id + whether it reads a claude log (#141), so
        // the worker skips the #97/#138 globs for a non-claude session (Codex).
        let (title_tx, title_rx) = std::sync::mpsc::channel::<(String, bool)>();
        // Keep a clone for spawn-time pokes (#169) before moving the original into
        // the monitor thread.
        let spawn_title_tx = title_tx.clone();
        // A single background thread derives busy/idle from output activity and
        // emits `State` transitions (#42). It holds a `Sender` clone, so — like
        // the long-lived manager — it keeps the event channel open for the app's
        // lifetime and ends when the receiver is dropped.
        std::thread::spawn({
            let activity = Arc::clone(&activity);
            let events = events.clone();
            move || monitor_loop(activity, events, title_tx, base)
        });
        // The title worker (#97) reads claude's auto-title off the hot path and
        // emits a `Name` event when it changes.
        std::thread::spawn({
            let events = events.clone();
            move || title_worker(title_rx, events)
        });
        Self {
            sessions: Mutex::new(HashMap::new()),
            events: Mutex::new(events),
            title_tx: Mutex::new(spawn_title_tx),
            activity,
            base,
        }
    }

    /// Spawn a new interactive `claude` session in `cwd`. We generate the
    /// session id and pass it via `claude --session-id <uuid>` so the same id
    /// can be resumed later (see `resume_session`).
    pub fn spawn_session(
        &self,
        cwd: impl AsRef<Path>,
        name: Option<String>,
        agent: &str,
    ) -> Result<SessionInfo, SessionError> {
        self.spawn_session_with_prompt(cwd, name, None, agent)
    }

    /// Spawn a new session for `agent` (#101), optionally pre-seeded with an initial
    /// `prompt` so it boots ready (#93 scheduled sessions). The agent's `AgentSpec`
    /// supplies the binary + the args; for Claude that's `claude --session-id <uuid>
    /// ["<prompt>"]` (the prompt passed positionally) — today's exact, CLI-verified
    /// (claude 2.1.x) behavior, since Claude is the only agent so far. A blank prompt
    /// is dropped (a plain new session).
    pub fn spawn_session_with_prompt(
        &self,
        cwd: impl AsRef<Path>,
        name: Option<String>,
        prompt: Option<&str>,
        agent: &str,
    ) -> Result<SessionInfo, SessionError> {
        let id = Uuid::new_v4().to_string();
        let spec = crate::agents::agent_spec(agent);
        let args = spec.spawn_args(&id, prompt);
        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        // A non-blank initial prompt means the agent starts working immediately with
        // no keystrokes (#93), so it counts as "has work" for the busy heuristic
        // (#116) — otherwise it would be stuck gray (never blue/yellow).
        let seeded = prompt.map(|p| !p.trim().is_empty()).unwrap_or(false);
        self.spawn_with_id(
            id.clone(),
            spec.binary_name,
            &arg_refs,
            cwd.as_ref(),
            name,
            seeded,
            spec.supports_auto_name,
        )
    }

    /// Resume a previously-persisted session by id (used on boot / Restart) using
    /// the **stored** `agent`'s spec (#101). For Claude that's `claude --resume
    /// <id>` — today's exact, CLI-verified (claude 2.1.x, #30) behavior: resuming an
    /// unknown id exits 1 ("No conversation found"), which the UI surfaces as a
    /// per-session Restart rather than a fatal error. (The follow-up gates this on
    /// the spec's `supports_resume`; Claude supports it.)
    pub fn resume_session(
        &self,
        claude_session_id: &str,
        cwd: impl AsRef<Path>,
        name: Option<String>,
        agent: &str,
    ) -> Result<SessionInfo, SessionError> {
        let spec = crate::agents::agent_spec(agent);
        let args = spec.resume_args(claude_session_id);
        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        // A resume just reopens the conversation; it doesn't re-run a prompt, so it
        // has no autonomous work to do (#116) — `seeded` is false. A previously-active
        // session still shows yellow on boot via its persisted `has_been_active`.
        self.spawn_with_id(
            claude_session_id.to_string(),
            spec.binary_name,
            &arg_refs,
            cwd.as_ref(),
            name,
            false,
            spec.supports_auto_name,
        )
    }

    /// Fork `source_session_id`'s conversation into a **new** parallel session (#126):
    /// generate a fresh app-owned UUID, build the fork args via the agent spec (Claude:
    /// `--session-id <new> --resume <source> --fork-session`), and spawn it. Like
    /// `resume_session` it's non-seeded (it reopens the source's persisted log; it
    /// doesn't re-run a prompt), so per #116 the fork stays gray until first input. The
    /// source session is left completely untouched (the fork carries its own id).
    /// Returns the new session's info (its `id` is the new UUID).
    pub fn fork_session(
        &self,
        source_session_id: &str,
        cwd: impl AsRef<Path>,
        name: Option<String>,
        agent: &str,
    ) -> Result<SessionInfo, SessionError> {
        let id = Uuid::new_v4().to_string();
        let spec = crate::agents::agent_spec(agent);
        let args = spec.fork_args(&id, source_session_id);
        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        self.spawn_with_id(
            id,
            spec.binary_name,
            &arg_refs,
            cwd.as_ref(),
            name,
            false,
            spec.supports_auto_name,
        )
    }

    /// Spawn the user's `$SHELL` (fallback `/bin/zsh`) in `cwd` under a
    /// caller-chosen id — a plain interactive **terminal item** (#72), not a
    /// `claude` agent. The PTY plumbing (reader thread, scrollback, events,
    /// write/resize/kill) is identical to a session; only the program differs and
    /// there is no `--session-id`/`--resume`. The id is the Overview panel's id,
    /// so the frontend renders it with the same `<Terminal>` pool and persists the
    /// item in `overview_panels` (a fresh shell is respawned on boot).
    pub fn spawn_terminal(
        &self,
        id: String,
        cwd: impl AsRef<Path>,
    ) -> Result<SessionInfo, SessionError> {
        let shell = default_shell();
        // A shell terminal has no claude conversation log (#141).
        self.spawn_with_id(id, shell.as_str(), &[], cwd.as_ref(), None, false, false)
    }

    /// Send keystrokes / paste to a session's stdin.
    pub fn write_stdin(&self, id: &str, data: &str) -> Result<(), SessionError> {
        // Stamp the keystroke time *before* writing, so the echo the terminal
        // sends back can never be mistaken for autonomous Claude output (#55).
        // Skip the stamp for *automatic* terminal reports (focus in/out + mouse,
        // #185): xterm forwards those like keystrokes, but they fire on click /
        // focus / blur, so stamping them would land an agent's in-flight output in
        // the echo window and blink the busy dot yellow while it's still working.
        // The bytes are still written below — Claude needs the mouse/focus events.
        if !is_noninput_report(data) {
            if let Ok(map) = self.activity.lock() {
                if let Some(state) = map.get(id) {
                    let now = self.base.elapsed().as_millis() as u64;
                    state.last_input.store(now.max(1), Ordering::Relaxed);
                }
            }
        }
        // Hold the global map lock only long enough to clone the per-session writer
        // handle, then drop it (#260). The blocking `write_all`/`flush` — which can
        // stall when the child isn't draining a full stdin buffer — runs under the
        // per-session writer lock, so a backpressured session never delays another
        // session's keystrokes.
        let writer = {
            let sessions = self.lock_sessions()?;
            let session = sessions
                .get(id)
                .ok_or_else(|| SessionError::SessionNotFound(id.to_string()))?;
            Arc::clone(&session.writer)
        };
        let mut writer = writer
            .lock()
            .map_err(|_| SessionError::Io("writer lock poisoned".to_string()))?;
        writer
            .write_all(data.as_bytes())
            .map_err(|e| SessionError::Io(e.to_string()))?;
        writer.flush().map_err(|e| SessionError::Io(e.to_string()))
    }

    /// Resize a session's PTY to match the frontend terminal.
    pub fn resize_pty(&self, id: &str, cols: u16, rows: u16) -> Result<(), SessionError> {
        // Clone the per-session master under the brief global lock, then drop it
        // (#260) so a slow `resize()` can't stall other sessions' operations.
        let master = {
            let sessions = self.lock_sessions()?;
            let session = sessions
                .get(id)
                .ok_or_else(|| SessionError::SessionNotFound(id.to_string()))?;
            Arc::clone(&session.master)
        };
        let master = master
            .lock()
            .map_err(|_| SessionError::Io("master lock poisoned".to_string()))?;
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| SessionError::Io(e.to_string()))
    }

    /// Kill a session's child and forget it (frees the slot). The reader thread
    /// observes the closed PTY and emits the final `Exited` event.
    pub fn kill_session(&self, id: &str) -> Result<(), SessionError> {
        let session = {
            let mut sessions = self.lock_sessions()?;
            sessions
                .remove(id)
                .ok_or_else(|| SessionError::SessionNotFound(id.to_string()))?
        };
        if let Ok(mut map) = self.activity.lock() {
            map.remove(id);
        }
        if let Ok(mut child) = session.child.lock() {
            let _ = child.kill();
        }
        // `session` drops here, closing the master/writer.
        Ok(())
    }

    /// Kill every live child and clear the registry — used on app shutdown so no
    /// orphan `claude` processes survive (#31). Best-effort and infallible
    /// (recovers a poisoned lock); the dropped sessions close their PTYs too.
    pub fn kill_all(&self) {
        let mut sessions = self
            .sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        for (_, session) in sessions.drain() {
            if let Ok(mut child) = session.child.lock() {
                let _ = child.kill();
            }
        }
        if let Ok(mut map) = self.activity.lock() {
            map.clear();
        }
    }

    /// Snapshot a session's retained scrollback (for terminal replay on mount).
    pub fn scrollback(&self, id: &str) -> Result<Vec<u8>, SessionError> {
        // Clone the per-session scrollback Arc under the brief global lock, then drop
        // it (#260) so the full ring-buffer copy in `snapshot()` — run on every
        // terminal mount/replay — doesn't block other sessions' map operations.
        let scrollback = {
            let sessions = self.lock_sessions()?;
            let session = sessions
                .get(id)
                .ok_or_else(|| SessionError::SessionNotFound(id.to_string()))?;
            Arc::clone(&session.scrollback)
        };
        let scrollback = scrollback
            .lock()
            .map_err(|_| SessionError::Io("scrollback lock poisoned".to_string()))?;
        Ok(scrollback.snapshot())
    }

    /// Number of registered sessions. Currently used only by the (unix-only,
    /// PTY-spawning) tests.
    #[cfg(all(test, unix))]
    pub fn session_count(&self) -> usize {
        self.lock_sessions().map(|s| s.len()).unwrap_or(0)
    }

    /// Spawn an arbitrary program in a PTY with a generated id (test helper). Not
    /// prompt-seeded — mirrors a fresh interactive session (#116).
    #[cfg(test)]
    fn spawn_program(
        &self,
        program: &str,
        args: &[&str],
        cwd: &Path,
        name: Option<String>,
    ) -> Result<SessionInfo, SessionError> {
        self.spawn_with_id(
            Uuid::new_v4().to_string(),
            program,
            args,
            cwd,
            name,
            false,
            false,
        )
    }

    /// Like `spawn_program` but marks the session prompt-seeded (#116): its output
    /// reads as work with no `write_stdin`, mirroring a scheduled agent (#93). Only the
    /// unix PTY tests exercise this, so it's gated to keep the Windows build dead-code-clean.
    #[cfg(all(test, unix))]
    fn spawn_program_seeded(
        &self,
        program: &str,
        args: &[&str],
        cwd: &Path,
    ) -> Result<SessionInfo, SessionError> {
        self.spawn_with_id(
            Uuid::new_v4().to_string(),
            program,
            args,
            cwd,
            None,
            true,
            false,
        )
    }

    /// Spawn `program` in a PTY under a caller-chosen session id. Backs
    /// `spawn_session`, `resume_session`, and the tests. (Several orthogonal spawn
    /// inputs — id, program, args, cwd, name, seeded, the #141 claude-log flag — hence
    /// the arg count; an opts struct would only add indirection for this one caller.)
    #[allow(clippy::too_many_arguments)]
    fn spawn_with_id(
        &self,
        id: String,
        program: &str,
        args: &[&str],
        cwd: &Path,
        name: Option<String>,
        seeded: bool,
        uses_claude_log: bool,
    ) -> Result<SessionInfo, SessionError> {
        if !cwd.is_dir() {
            return Err(SessionError::Spawn(format!(
                "working directory does not exist: {}",
                cwd.display()
            )));
        }
        let resolved = match find_on_path(program) {
            Some(path) => path,
            None => return Err(SessionError::BinaryNotFound(program.to_string())),
        };
        // Unix runs the bare program name (today's behavior); Windows runs the
        // resolved path and routes a `.cmd`/`.bat` shim through `cmd.exe /C` (#140).
        let (exe, prefix_args) = launch_target(program, &resolved);

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: DEFAULT_ROWS,
                cols: DEFAULT_COLS,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| SessionError::Spawn(e.to_string()))?;

        let mut cmd = CommandBuilder::new(&exe);
        for arg in &prefix_args {
            cmd.arg(arg);
        }
        for arg in args {
            cmd.arg(arg);
        }
        cmd.cwd(cwd);
        // Inherit the parent environment so the child can resolve PATH etc.,
        // then make sure it has a sensible TERM for the TUI.
        for (key, value) in std::env::vars_os() {
            cmd.env(key, value);
        }
        cmd.env("TERM", "xterm-256color");

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| SessionError::Spawn(e.to_string()))?;
        drop(pair.slave);

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| SessionError::Io(e.to_string()))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| SessionError::Io(e.to_string()))?;

        let scrollback = Arc::new(Mutex::new(Scrollback::new(SCROLLBACK_CAP)));
        let child = Arc::new(Mutex::new(child));
        // Wrap the writer + master in per-session locks (#260) so blocking writes /
        // resizes never hold the global `sessions` map lock.
        let writer = Arc::new(Mutex::new(writer));
        let master = Arc::new(Mutex::new(pair.master));
        let events = self.event_sender()?;

        // Register this session's activity stamps for the busy heuristic (#42/#55);
        // a restart with the same id replaces the previous state here.
        let activity_state = Arc::new(ActivityState {
            last_output: AtomicU64::new(0),
            last_input: AtomicU64::new(0),
            seeded: AtomicBool::new(seeded),
            uses_claude_log,
        });
        if let Ok(mut map) = self.activity.lock() {
            map.insert(id.clone(), Arc::clone(&activity_state));
        }

        let reader_handle = std::thread::spawn({
            let id = id.clone();
            let child = Arc::clone(&child);
            let scrollback = Arc::clone(&scrollback);
            let activity = Arc::clone(&self.activity);
            let base = self.base;
            move || {
                reader_loop(
                    id,
                    reader,
                    &child,
                    &scrollback,
                    &events,
                    &activity_state,
                    base,
                    &activity,
                )
            }
        });

        let session = Session {
            name: name.clone(),
            cwd: cwd.to_path_buf(),
            master,
            writer,
            child,
            scrollback,
            _reader: reader_handle,
        };
        self.lock_sessions()?.insert(id.clone(), session);

        // Kick off a title re-read burst (#169) the moment the session is registered,
        // so a fresh agent's first `ai-title` — and a resumed/forked session's
        // already-written title on boot — surfaces within seconds instead of waiting
        // for the first incidental busy→idle edge. Best-effort: a dead worker (e.g. at
        // shutdown) must never fail a spawn. Harmless no-op until the log exists.
        if let Ok(tx) = self.title_tx.lock() {
            let _ = tx.send((id.clone(), uses_claude_log));
        }

        Ok(SessionInfo {
            id,
            name,
            cwd: cwd.display().to_string(),
        })
    }

    fn lock_sessions(
        &self,
    ) -> Result<std::sync::MutexGuard<'_, HashMap<String, Session>>, SessionError> {
        self.sessions
            .lock()
            .map_err(|_| SessionError::Io("session registry lock poisoned".to_string()))
    }

    fn event_sender(&self) -> Result<Sender<SessionEvent>, SessionError> {
        self.events
            .lock()
            .map(|guard| guard.clone())
            .map_err(|_| SessionError::Io("event sender lock poisoned".to_string()))
    }
}

/// True iff `data` consists **entirely** of one or more *automatic* terminal-protocol
/// reports — focus in/out (DECSET 1004) and mouse (1000/1002/1003 X10, 1006 SGR) — and
/// nothing else. xterm forwards these through `onData` exactly like keystrokes (Claude's
/// TUI requests them), but they are emitted automatically when the user clicks into /
/// focuses / leaves the terminal, not by typing. `write_stdin` uses this to **skip
/// stamping `last_input`** for such reports (#185): otherwise an agent's in-flight output
/// lands inside the #55 keystroke-echo window and is misread as echo, so the busy dot
/// wrongly blinks yellow ("needs input") for a tick while the agent is still working.
///
/// Conservative by design: if **any** byte falls outside a recognized report, return
/// `false` (treat as real input) so a genuine keystroke's echo guard (#55) is never
/// suppressed — wrongly suppressing it would resurrect the "typing reads as busy" bug.
fn is_noninput_report(data: &str) -> bool {
    let bytes = data.as_bytes();
    if bytes.is_empty() {
        return false;
    }
    let mut i = 0;
    while i < bytes.len() {
        match consume_report(&bytes[i..]) {
            Some(n) => i += n,
            None => return false,
        }
    }
    true
}

/// If `bytes` begins with one recognized automatic terminal report, return its byte
/// length; otherwise `None`. All such reports are CSI sequences (`ESC [ …`) — note SS3
/// keys (`ESC O …`, arrows / F-keys, no `[`) are deliberately *not* matched, so they
/// stay classified as real input distinct from focus-out (`ESC [ O`).
fn consume_report(bytes: &[u8]) -> Option<usize> {
    if bytes.len() < 3 || bytes[0] != 0x1b || bytes[1] != b'[' {
        return None;
    }
    match bytes[2] {
        // Focus in / out: ESC [ I  /  ESC [ O   (DECSET 1004).
        b'I' | b'O' => Some(3),
        // X10 / normal mouse: ESC [ M followed by exactly 3 payload bytes
        // (button, x, y) — DECSET 1000/1002/1003.
        b'M' => (bytes.len() >= 6).then_some(6),
        // SGR mouse: ESC [ < <digits/';'>… terminated by 'M' (press) or 'm' (release)
        // — DECSET 1006, the modern default.
        b'<' => {
            let mut j = 3;
            while j < bytes.len() && (bytes[j].is_ascii_digit() || bytes[j] == b';') {
                j += 1;
            }
            // Require at least one body byte and a terminating M/m.
            (j > 3 && j < bytes.len() && (bytes[j] == b'M' || bytes[j] == b'm')).then_some(j + 1)
        }
        _ => None,
    }
}

/// Reads a session's PTY until it closes, pushing bytes to scrollback and the
/// event channel, then emits the final exit code.
#[allow(clippy::too_many_arguments)]
fn reader_loop(
    id: String,
    mut reader: Box<dyn Read + Send>,
    child: &Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    scrollback: &Arc<Mutex<Scrollback>>,
    events: &Sender<SessionEvent>,
    state: &Arc<ActivityState>,
    base: Instant,
    activity: &Activity,
) {
    let mut buf = [0u8; READ_CHUNK];
    loop {
        match reader.read(&mut buf) {
            // EOF or read error (e.g. EIO once the slave closes): the PTY is done.
            Ok(0) | Err(_) => break,
            Ok(n) => {
                // Stamp the last-output time for the busy heuristic (#42); `.max(1)`
                // keeps 0 reserved as the "no output yet" sentinel.
                let now = base.elapsed().as_millis() as u64;
                state.last_output.store(now.max(1), Ordering::Relaxed);
                let chunk = buf[..n].to_vec();
                if let Ok(mut sb) = scrollback.lock() {
                    sb.push(&chunk);
                }
                if events
                    .send(SessionEvent::Output {
                        id: id.clone(),
                        bytes: chunk,
                    })
                    .is_err()
                {
                    return; // receiver dropped (app shutting down)
                }
            }
        }
    }

    // Stop tracking activity — but only if the map still points to *our* atomic
    // (a restart with the same id may have replaced it; don't drop the new one).
    if let Ok(mut map) = activity.lock() {
        if matches!(map.get(&id), Some(a) if Arc::ptr_eq(a, state)) {
            map.remove(&id);
        }
    }

    let code = child
        .lock()
        .ok()
        .and_then(|mut child| child.wait().ok())
        .map(|status| status.exit_code() as i32);
    let _ = events.send(SessionEvent::Exited { id, code });
}

/// Derives each session's busy/idle state from output activity (#42) and emits a
/// `State` event on every transition (debounced — never per tick). Runs until the
/// event receiver is dropped (app shutdown).
fn monitor_loop(
    activity: Activity,
    events: Sender<SessionEvent>,
    title_tx: Sender<(String, bool)>,
    base: Instant,
) {
    // Last state we emitted per session, so we only send on change.
    let mut emitted: HashMap<String, bool> = HashMap::new();
    loop {
        std::thread::sleep(Duration::from_millis(MONITOR_TICK_MS));
        let now = base.elapsed().as_millis() as u64;
        // Snapshot (id, busy) under the lock, then release it before sending.
        let snapshot: Vec<(String, bool, bool)> = {
            let map = match activity.lock() {
                Ok(map) => map,
                Err(poisoned) => poisoned.into_inner(),
            };
            map.iter()
                .map(|(id, state)| {
                    let out = state.last_output.load(Ordering::Relaxed);
                    let inp = state.last_input.load(Ordering::Relaxed);
                    let seeded = state.seeded.load(Ordering::Relaxed);
                    // Busy requires the session to actually *have work to do* (#116):
                    // either the user has submitted input (`inp != 0`) or it booted
                    // prompt-seeded (#93). So claude's pre-input startup paint on a
                    // fresh interactive session no longer reads as busy (which used
                    // to latch the #112 "needs input" yellow before any prompt).
                    let has_work = inp != 0 || seeded;
                    // Among that, busy = recent output that arrived meaningfully
                    // *after* the last keystroke, so the terminal's echo of typing
                    // doesn't read as Claude working (#55). With no keystrokes yet
                    // (inp == 0, a seeded session) any recent output counts.
                    let busy = has_work
                        && out != 0
                        && now.saturating_sub(out) < BUSY_WINDOW_MS
                        && (inp == 0 || out.saturating_sub(inp) >= INPUT_ECHO_MS);
                    (id.clone(), busy, state.uses_claude_log)
                })
                .collect()
        };
        // Forget sessions that are gone (killed/exited) so a reused id starts fresh.
        let live: HashSet<&str> = snapshot.iter().map(|(id, _, _)| id.as_str()).collect();
        emitted.retain(|id, _| live.contains(id.as_str()));
        for (id, busy, uses_claude_log) in &snapshot {
            if emitted.get(id) != Some(busy) {
                let was = emitted.insert(id.clone(), *busy);
                if events
                    .send(SessionEvent::State {
                        id: id.clone(),
                        busy: *busy,
                    })
                    .is_err()
                {
                    return; // receiver dropped (app shutting down)
                }
                // On a busy→idle edge (a turn just ended, when claude has just
                // (re)written its `ai-title`) poke the title worker to re-read it
                // off the hot path (#97). A best-effort send: a dead worker never
                // stalls the monitor tick.
                if !*busy && was == Some(true) {
                    let _ = title_tx.send((id.clone(), *uses_claude_log));
                }
            }
        }
    }
}

/// Reads claude's auto-title for a session off the monitor's hot path (#97/#169).
/// A poke (a busy→idle edge from the monitor, or a session spawn) arrives on
/// `title_rx` carrying the session id + whether it reads a claude log (#141);
/// because `claude` writes its `ai-title` **asynchronously** — a moment after the
/// turn ends — a single read at that instant frequently misses it. So each poke
/// schedules a **burst** of re-reads over ~30s (`TITLE_REREAD_OFFSETS_MS`), and the
/// late-written title surfaces within seconds with no user click. A new poke for the
/// same session restarts its window. Each due re-read runs the same
/// read-and-emit-on-change logic (the per-session `last` dedup keeps repeated reads
/// of an unchanged title/flag silent), and skips the #97/#138 globs entirely for a
/// non-claude session (Codex, #141). Runs until the channel closes (app shutdown);
/// an idle worker with nothing pending blocks on `recv()` rather than spinning.
fn title_worker(title_rx: Receiver<(String, bool)>, events: Sender<SessionEvent>) {
    let mut last: HashMap<String, String> = HashMap::new();
    let mut last_forkable: HashMap<String, bool> = HashMap::new();
    // Pending re-read deadlines (#169): one `(Instant, id, uses_claude_log)` per burst
    // offset. Drained as they fall due, so the set stays bounded to roughly one
    // window's worth.
    let mut pending: Vec<(Instant, String, bool)> = Vec::new();
    loop {
        // Wait for the next poke, but never past the soonest pending deadline so a
        // scheduled re-read fires on time. With nothing pending, block until a poke
        // (no busy-wait). A dropped sender (app shutdown) ends the worker.
        let poke = match next_due_wait(&pending, Instant::now()) {
            Some(wait) => title_rx.recv_timeout(wait),
            None => title_rx.recv().map_err(|_| RecvTimeoutError::Disconnected),
        };
        match poke {
            Ok((id, uses_claude_log)) => {
                // A fresh poke restarts this session's window: drop its still-pending
                // burst and re-enqueue the full schedule from now.
                pending.retain(|(_, pid, _)| pid != &id);
                let now = Instant::now();
                for off in TITLE_REREAD_OFFSETS_MS {
                    pending.push((
                        now + Duration::from_millis(*off),
                        id.clone(),
                        uses_claude_log,
                    ));
                }
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return,
        }
        // Process (and drop) every deadline now due. Dedup ids in case several of a
        // session's offsets came due together (e.g. after a long read), so we scan
        // its log once per pass (a session's `uses_claude_log` is constant, so the
        // tuple dedup collapses repeats cleanly).
        let now = Instant::now();
        let mut due: Vec<(String, bool)> = Vec::new();
        pending.retain(|(at, id, uses_claude_log)| {
            if *at <= now {
                due.push((id.clone(), *uses_claude_log));
                false
            } else {
                true
            }
        });
        due.sort();
        due.dedup();
        for (id, uses_claude_log) in due {
            if read_and_emit_title(&id, uses_claude_log, &events, &mut last, &mut last_forkable)
                .is_err()
            {
                return; // receiver dropped (app shutting down)
            }
        }
    }
}

/// The wait until the soonest pending re-read deadline (#169), or `None` when none
/// is pending (the worker then blocks until the next poke). `Duration::ZERO` when a
/// deadline is already due. Pure — unit-tested.
fn next_due_wait(pending: &[(Instant, String, bool)], now: Instant) -> Option<Duration> {
    pending
        .iter()
        .map(|(at, _, _)| at.saturating_duration_since(now))
        .min()
}

/// Read a session's forkability (#138) + `ai-title` (#97) and emit the matching
/// events only when either changed since last time — the shared body of every
/// re-read in the #169 burst. `uses_claude_log` is false for a non-claude agent
/// (Codex, #141): such a session has no app-globbable conversation, so it's never
/// forkable and never auto-named, and **both** globs are skipped. `Err(())` signals
/// the event receiver was dropped (app shutdown), so the worker returns.
fn read_and_emit_title(
    id: &str,
    uses_claude_log: bool,
    events: &Sender<SessionEvent>,
    last: &mut HashMap<String, String>,
    last_forkable: &mut HashMap<String, bool>,
) -> Result<(), ()> {
    // Forkability (#138): for a claude session, computed every poke (independent of the
    // title, which may be absent) and emitted only when it flips — false→true the moment
    // the log first materializes a real turn. A non-claude session reports false without
    // a glob (which could otherwise fail-open to true on an unreadable dir).
    let forkable = uses_claude_log && crate::title::has_conversation(id);
    if last_forkable.get(id) != Some(&forkable) {
        last_forkable.insert(id.to_string(), forkable);
        if events
            .send(SessionEvent::Forkable {
                id: id.to_string(),
                forkable,
            })
            .is_err()
        {
            return Err(());
        }
    }
    // Auto-name (#97) reads claude's `ai-title` log; skip it entirely for an agent
    // that doesn't write one (Codex keeps the branch / first-prompt label).
    if !uses_claude_log {
        return Ok(());
    }
    let Some(title) = crate::title::read_session_title(id) else {
        return Ok(()); // no log / no title yet (e.g. a shell terminal item) — skip
    };
    if last.get(id) == Some(&title) {
        return Ok(()); // unchanged since we last emitted — nothing to do
    }
    last.insert(id.to_string(), title.clone());
    if events
        .send(SessionEvent::Name {
            id: id.to_string(),
            name: title,
        })
        .is_err()
    {
        return Err(());
    }
    Ok(())
}

/// The default plain-terminal shell (#72) for the current OS: the user's `$SHELL`
/// (fallback `/bin/zsh`) on unix; PowerShell — `pwsh.exe`, else `powershell.exe`,
/// else `%COMSPEC%`/`cmd.exe` — on Windows.
fn default_shell() -> String {
    #[cfg(unix)]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
    }
    #[cfg(windows)]
    {
        for candidate in ["pwsh.exe", "powershell.exe"] {
            if find_on_path(candidate).is_some() {
                return candidate.to_string();
            }
        }
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
    }
}

/// Resolve `program` to an executable path via `PATH` (or a direct path). Unix:
/// the historic behavior (a `/` means a direct path; otherwise scan `PATH`).
#[cfg(unix)]
fn find_on_path(program: &str) -> Option<PathBuf> {
    if program.contains('/') {
        let direct = PathBuf::from(program);
        return is_executable(&direct).then_some(direct);
    }
    let paths = std::env::var_os("PATH")?;
    std::env::split_paths(&paths).find_map(|dir| {
        let candidate = dir.join(program);
        is_executable(&candidate).then_some(candidate)
    })
}

/// Resolve `program` on Windows. An absolute/relative path with a separator is a
/// direct path; a bare name is scanned over `PATH`. Either way, a name with no
/// extension is also tried against `PATHEXT` — critically, an npm-installed
/// `claude` is usually **`claude.cmd`** (#140).
#[cfg(windows)]
fn find_on_path(program: &str) -> Option<PathBuf> {
    let resolve = |base: PathBuf| -> Option<PathBuf> {
        if is_executable(&base) {
            return Some(base);
        }
        if base.extension().is_none() {
            return pathext().into_iter().find_map(|ext| {
                let cand = base.with_extension(ext.trim_start_matches('.'));
                is_executable(&cand).then_some(cand)
            });
        }
        None
    };
    if Path::new(program).is_absolute() || program.contains(['/', '\\']) {
        return resolve(PathBuf::from(program));
    }
    let paths = std::env::var_os("PATH")?;
    std::env::split_paths(&paths).find_map(|dir| resolve(dir.join(program)))
}

/// The `PATHEXT` extensions (`.COM;.EXE;.BAT;.CMD;…`) tried when resolving a bare
/// program name on Windows, with the documented default if it's unset.
#[cfg(windows)]
fn pathext() -> Vec<String> {
    std::env::var("PATHEXT")
        .unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string())
        .split(';')
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

/// How to actually launch a resolved program — the executable to run plus any
/// prefix args before the program's own. Unix runs the bare program name (PATH is
/// resolved by `exec`, preserving today's macOS behavior). Windows runs the
/// **resolved** path, and routes a `.cmd`/`.bat` shim through `cmd.exe /C` because
/// `CreateProcess` (under `portable-pty`'s ConPTY) can't execute a batch file
/// directly — this is what lets `claude.cmd` (the npm install on Windows) launch.
#[cfg(unix)]
fn launch_target(program: &str, _resolved: &Path) -> (String, Vec<String>) {
    (program.to_string(), Vec::new())
}

#[cfg(windows)]
fn launch_target(_program: &str, resolved: &Path) -> (String, Vec<String>) {
    let is_batch = resolved
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("cmd") || e.eq_ignore_ascii_case("bat"))
        .unwrap_or(false);
    if is_batch {
        let comspec = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string());
        (
            comspec,
            vec!["/C".to_string(), resolved.to_string_lossy().into_owned()],
        )
    } else {
        (resolved.to_string_lossy().into_owned(), Vec::new())
    }
}

/// Resolve `program` to the `(executable, prefix_args)` the OS needs to launch it,
/// or `None` if it isn't found on `PATH`. Shares the PTY spawn's resolution (#140)
/// — `find_on_path` + `launch_target` — so a version/presence probe
/// (`commands::binary_version`) agrees with what actually spawns. Critically, an
/// npm-installed `claude` on Windows is `claude.cmd`, which `Command::new("claude")`
/// can neither find (CreateProcess appends `.exe`, never consults `PATHEXT`) nor
/// execute directly (a batch file needs `cmd.exe /C`). Unix returns the bare program
/// name, so a probe runs the identical command it always did (macOS unchanged).
pub(crate) fn resolve_command(program: &str) -> Option<(String, Vec<String>)> {
    let resolved = find_on_path(program)?;
    Some(launch_target(program, &resolved))
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path)
        .map(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(windows)]
fn is_executable(path: &Path) -> bool {
    // Windows has no Unix permission bits: an executable is a regular file whose
    // extension is in the well-known set (a subset of PATHEXT). Resolving a *bare*
    // program name against PATHEXT is the functional Windows port (#140) — here we
    // only answer "is this concrete path a runnable file?", which is what
    // `find_on_path` and the test suite need and keeps the crate compiling on Windows.
    const EXEC_EXTS: [&str; 5] = ["exe", "cmd", "bat", "com", "ps1"];
    std::fs::metadata(path)
        .map(|m| m.is_file())
        .unwrap_or(false)
        && path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| {
                EXEC_EXTS
                    .iter()
                    .any(|known| known.eq_ignore_ascii_case(ext))
            })
            .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    // Timing helpers are only used by the POSIX-shell integration tests below, which
    // are `#[cfg(unix)]` (they spawn `sh`/`cat`); gate the import to match so a Windows
    // build (where only the pure-logic tests run) stays warning-clean under `-D warnings`.
    #[cfg(unix)]
    use std::time::{Duration, Instant};

    fn manager() -> (SessionManager, mpsc::Receiver<SessionEvent>) {
        let (tx, rx) = mpsc::channel();
        (SessionManager::new(tx), rx)
    }

    fn tmp() -> PathBuf {
        std::env::temp_dir()
    }

    #[test]
    fn next_due_wait_picks_the_soonest_deadline() {
        let now = Instant::now();
        // Nothing pending → None (the worker blocks on recv, no busy-wait).
        assert_eq!(next_due_wait(&[], now), None);
        // Future deadlines → the wait to the soonest, regardless of vec order.
        // The trailing bool is each session's `uses_claude_log` flag (#141).
        let pending = vec![
            (now + Duration::from_millis(8_000), "b".to_string(), true),
            (now + Duration::from_millis(1_500), "a".to_string(), false),
        ];
        let wait = next_due_wait(&pending, now).expect("a pending deadline");
        assert!(wait <= Duration::from_millis(1_500));
        assert!(wait > Duration::from_millis(1_000));
        // An already-due deadline → zero, so the worker processes it immediately.
        let past = vec![(now - Duration::from_millis(10), "x".to_string(), true)];
        assert_eq!(next_due_wait(&past, now), Some(Duration::ZERO));
    }

    #[test]
    fn scrollback_is_bounded_and_keeps_the_tail() {
        let mut sb = Scrollback::new(8);
        sb.push(b"abcdef");
        sb.push(b"ghij");
        let snapshot = sb.snapshot();
        assert_eq!(snapshot.len(), 8);
        assert_eq!(&snapshot, b"cdefghij");
    }

    #[test]
    fn missing_binary_is_a_typed_error() {
        let (mgr, _rx) = manager();
        let err = mgr
            .spawn_program("recue-does-not-exist-xyz", &[], &tmp(), None)
            .unwrap_err();
        assert!(matches!(err, SessionError::BinaryNotFound(_)));
    }

    #[test]
    fn is_executable_rejects_missing_paths_and_directories() {
        // A path that doesn't exist is never executable (both platforms).
        assert!(!is_executable(Path::new(
            "recue-nonexistent-binary-xyz-12345"
        )));
        // A directory is not an executable *file* (`is_file()` is false everywhere).
        assert!(!is_executable(&tmp()));
    }

    #[test]
    fn title_worker_gates_non_claude_sessions_without_a_glob() {
        // A non-claude-log session (Codex, #141: uses_claude_log=false) must report
        // `forkable: false` and emit **no** Name event — the #97/#138 globs are skipped.
        let (title_tx, title_rx) = std::sync::mpsc::channel::<(String, bool)>();
        let (ev_tx, ev_rx) = std::sync::mpsc::channel::<SessionEvent>();
        let worker = std::thread::spawn(move || title_worker(title_rx, ev_tx));
        title_tx.send(("codex-session".to_string(), false)).unwrap();
        match ev_rx.recv_timeout(std::time::Duration::from_secs(2)) {
            Ok(SessionEvent::Forkable { id, forkable }) => {
                assert_eq!(id, "codex-session");
                assert!(!forkable, "a non-claude-log session is never forkable");
            }
            other => panic!("expected Forkable{{false}}, got {other:?}"),
        }
        // No Name event follows — auto-name is skipped for a non-claude-log agent.
        assert!(ev_rx
            .recv_timeout(std::time::Duration::from_millis(200))
            .is_err());
        drop(title_tx); // close the channel so the worker thread exits
        let _ = worker.join();
    }

    #[cfg(windows)]
    #[test]
    fn is_executable_honors_extension_on_windows() {
        let dir = std::env::temp_dir();
        let stamp = Uuid::new_v4();
        let exe = dir.join(format!("recue-test-{stamp}.cmd"));
        std::fs::write(&exe, b"@echo off\n").expect("write .cmd");
        assert!(is_executable(&exe), "a .cmd file should read as runnable");
        let data = dir.join(format!("recue-test-{stamp}.txt"));
        std::fs::write(&data, b"hi").expect("write .txt");
        assert!(
            !is_executable(&data),
            "a .txt file should not read as runnable"
        );
        let _ = std::fs::remove_file(&exe);
        let _ = std::fs::remove_file(&data);
    }

    #[cfg(unix)]
    #[test]
    fn is_executable_honors_mode_bits_on_unix() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir();
        let path = dir.join(format!("recue-test-{}", Uuid::new_v4()));
        std::fs::write(&path, b"#!/bin/sh\n").expect("write");
        let set_mode = |mode: u32| {
            let mut perms = std::fs::metadata(&path).unwrap().permissions();
            perms.set_mode(mode);
            std::fs::set_permissions(&path, perms).unwrap();
        };
        set_mode(0o644);
        assert!(!is_executable(&path), "no exec bit → not runnable");
        set_mode(0o755);
        assert!(is_executable(&path), "exec bit set → runnable");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn resolve_command_is_none_for_a_missing_binary() {
        // The version/presence probe relies on this returning None when the CLI
        // isn't on PATH (both platforms) — that's how `binary_version` reports a
        // missing agent without spawning anything.
        assert!(resolve_command("recue-does-not-exist-xyz-98765").is_none());
    }

    #[cfg(windows)]
    #[test]
    fn resolve_command_routes_a_cmd_shim_through_cmd_exe() {
        // The npm-installed `claude.cmd` case (#140): resolving an extensionless path
        // that has a `.cmd` sibling must yield `cmd.exe /C <path.cmd>`, so the
        // `--version` probe matches what the PTY actually spawns.
        let dir = std::env::temp_dir().join(format!("ccue-resolve-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("ccueprobe.cmd"), b"@echo off\n").unwrap();
        let bare = dir.join("ccueprobe"); // absolute, no extension
        let resolved = resolve_command(&bare.to_string_lossy());
        let _ = std::fs::remove_dir_all(&dir);
        let (exe, args) = resolved.expect("a .cmd sibling should resolve");
        assert!(exe.to_ascii_lowercase().contains("cmd"));
        assert_eq!(args.len(), 2);
        assert_eq!(args[0], "/C");
        assert!(args[1].to_ascii_lowercase().ends_with(".cmd"));
    }

    #[cfg(unix)]
    #[test]
    fn resolve_command_returns_the_bare_name_on_unix() {
        // macOS preservation: a resolvable program yields its bare name + no prefix
        // args, so `binary_version` runs the identical command it always did.
        let (exe, args) = resolve_command("sh").expect("sh is on PATH");
        assert_eq!(exe, "sh");
        assert!(args.is_empty());
    }

    #[test]
    fn default_shell_is_nonempty() {
        // $SHELL/zsh on unix, PowerShell/cmd on Windows — never empty (#140).
        assert!(!default_shell().is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn launch_target_runs_the_bare_program_on_unix() {
        // macOS behavior is unchanged: launch by the bare name, no prefix args.
        let (exe, args) = launch_target("claude", Path::new("/usr/local/bin/claude"));
        assert_eq!(exe, "claude");
        assert!(args.is_empty());
    }

    #[cfg(windows)]
    #[test]
    fn launch_target_routes_batch_through_cmd_on_windows() {
        // A `.cmd`/`.bat` shim (the npm-installed `claude` on Windows) must run via
        // `cmd.exe /C`; a real `.exe` runs directly (#140).
        let (exe, args) = launch_target("claude", Path::new("C:\\bin\\claude.cmd"));
        assert!(exe.to_ascii_lowercase().contains("cmd"));
        assert_eq!(
            args,
            vec!["/C".to_string(), "C:\\bin\\claude.cmd".to_string()]
        );
        let (exe2, args2) = launch_target("claude", Path::new("C:\\bin\\claude.exe"));
        assert_eq!(exe2, "C:\\bin\\claude.exe");
        assert!(args2.is_empty());
    }

    #[cfg(windows)]
    #[test]
    fn pathext_includes_exe_and_cmd() {
        let exts = pathext();
        assert!(exts
            .iter()
            .any(|e| e.eq_ignore_ascii_case(".exe") || e.eq_ignore_ascii_case(".cmd")));
    }

    #[cfg(windows)]
    #[test]
    fn find_on_path_resolves_an_extensionless_path_via_pathext() {
        // An explicit, extensionless path resolves to its `.cmd` sibling — the
        // claude.cmd case (#140). Uses an explicit path (not PATH) so the test never
        // mutates the global PATH env (which would race other parallel tests).
        let dir = std::env::temp_dir().join(format!("ccue-pathext-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("ccueprog.cmd"), b"@echo off\n").unwrap();
        let bare = dir.join("ccueprog"); // absolute, no extension
        let found = find_on_path(&bare.to_string_lossy());
        let _ = std::fs::remove_dir_all(&dir);
        let found = found.expect("extensionless path should resolve via PATHEXT");
        // The resolved extension carries PATHEXT's case (e.g. ".CMD"); compare loosely.
        let ext = found.extension().and_then(|e| e.to_str()).unwrap_or("");
        assert!(
            ext.eq_ignore_ascii_case("cmd"),
            "resolved to a .cmd shim, got {ext}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn spawns_streams_output_and_reports_exit() {
        let (mgr, rx) = manager();
        mgr.spawn_program("sh", &["-c", "printf 'hello-from-pty'"], &tmp(), None)
            .expect("spawn sh");

        let mut output = Vec::new();
        let exit = loop {
            match rx.recv_timeout(Duration::from_secs(5)) {
                Ok(SessionEvent::Output { bytes, .. }) => output.extend(bytes),
                Ok(SessionEvent::Exited { code, .. }) => break code,
                Ok(SessionEvent::State { .. }) => {}
                Ok(SessionEvent::Name { .. }) => {}
                Ok(SessionEvent::Forkable { .. }) => {}
                Err(_) => panic!("timed out waiting for session events"),
            }
        };
        assert!(String::from_utf8_lossy(&output).contains("hello-from-pty"));
        assert_eq!(exit, Some(0));
    }

    #[cfg(unix)]
    #[test]
    fn stdin_is_echoed_back() {
        let (mgr, rx) = manager();
        let info = mgr
            .spawn_program("cat", &[], &tmp(), None)
            .expect("spawn cat");
        mgr.write_stdin(&info.id, "roundtrip\n")
            .expect("write stdin");

        let mut output = Vec::new();
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if let Ok(SessionEvent::Output { bytes, .. }) =
                rx.recv_timeout(Duration::from_millis(250))
            {
                output.extend(bytes);
                if String::from_utf8_lossy(&output).contains("roundtrip") {
                    break;
                }
            }
        }
        assert!(String::from_utf8_lossy(&output).contains("roundtrip"));
        mgr.kill_session(&info.id).expect("kill");
    }

    #[cfg(unix)]
    #[test]
    fn resize_succeeds_for_live_session_and_errors_for_unknown() {
        let (mgr, _rx) = manager();
        let info = mgr
            .spawn_program("cat", &[], &tmp(), None)
            .expect("spawn cat");
        assert!(mgr.resize_pty(&info.id, 120, 40).is_ok());
        assert!(matches!(
            mgr.resize_pty("no-such-id", 80, 24),
            Err(SessionError::SessionNotFound(_))
        ));
        mgr.kill_session(&info.id).expect("kill");
    }

    #[cfg(unix)]
    #[test]
    fn kill_terminates_child_and_frees_slot() {
        let (mgr, _rx) = manager();
        let info = mgr
            .spawn_program("cat", &[], &tmp(), None)
            .expect("spawn cat");
        assert_eq!(mgr.session_count(), 1);
        mgr.kill_session(&info.id).expect("kill");
        assert_eq!(mgr.session_count(), 0);
        assert!(matches!(
            mgr.kill_session(&info.id),
            Err(SessionError::SessionNotFound(_))
        ));
    }

    #[cfg(unix)]
    #[test]
    fn busy_state_tracks_output_then_goes_idle() {
        let (mgr, rx) = manager();
        // A seeded session (#93/#116) has work from spawn, so its output reads as
        // busy with no keystrokes. Emit once, then stay alive but quiet well past
        // BUSY_WINDOW_MS, so the monitor must report busy → idle while still running.
        mgr.spawn_program_seeded("sh", &["-c", "printf 'tick'; sleep 1.2"], &tmp())
            .expect("spawn sh");

        let mut saw_busy = false;
        let mut saw_idle_after_busy = false;
        let deadline = Instant::now() + Duration::from_secs(4);
        while Instant::now() < deadline && !saw_idle_after_busy {
            match rx.recv_timeout(Duration::from_millis(250)) {
                Ok(SessionEvent::State { busy: true, .. }) => saw_busy = true,
                Ok(SessionEvent::State { busy: false, .. }) if saw_busy => {
                    saw_idle_after_busy = true;
                }
                _ => {}
            }
        }
        assert!(saw_busy, "expected a busy state once output flowed");
        assert!(
            saw_idle_after_busy,
            "expected an idle state once output went quiet"
        );
    }

    #[cfg(unix)]
    #[test]
    fn startup_output_without_input_is_not_busy() {
        // A fresh interactive session's startup paint — output with no keystrokes
        // and no seeded prompt — must NOT read as busy (#116), or it would latch the
        // #112 "needs input" yellow before the user has typed anything.
        let (mgr, rx) = manager();
        let info = mgr
            .spawn_program("sh", &["-c", "printf 'welcome'; sleep 1"], &tmp(), None)
            .expect("spawn sh");

        let mut saw_busy = false;
        let deadline = Instant::now() + Duration::from_millis(1200);
        while Instant::now() < deadline {
            if let Ok(SessionEvent::State { busy: true, .. }) =
                rx.recv_timeout(Duration::from_millis(100))
            {
                saw_busy = true;
                break;
            }
        }
        let _ = mgr.kill_session(&info.id);
        assert!(
            !saw_busy,
            "startup output with no input or seed must not read as busy (#116)"
        );
    }

    #[cfg(unix)]
    #[test]
    fn output_after_input_reads_as_busy() {
        // Once the user has submitted input (#55/#116), autonomous output arriving
        // well after the keystroke counts as the agent working. The shell reads a
        // line, waits ~400ms (past INPUT_ECHO_MS), then emits output.
        let (mgr, rx) = manager();
        let info = mgr
            .spawn_program(
                "sh",
                &["-c", "read x; sleep 0.4; printf done; sleep 1"],
                &tmp(),
                None,
            )
            .expect("spawn sh");
        mgr.write_stdin(&info.id, "go\n").expect("write");

        let mut saw_busy = false;
        let deadline = Instant::now() + Duration::from_secs(2);
        while Instant::now() < deadline && !saw_busy {
            if let Ok(SessionEvent::State { busy: true, .. }) =
                rx.recv_timeout(Duration::from_millis(150))
            {
                saw_busy = true;
            }
        }
        let _ = mgr.kill_session(&info.id);
        assert!(
            saw_busy,
            "output ~400ms after input must read as busy (#55/#116)"
        );
    }

    #[cfg(unix)]
    #[test]
    fn scrollback_replays_recent_output() {
        let (mgr, _rx) = manager();
        let info = mgr
            .spawn_program(
                "sh",
                &["-c", "printf 'scrollback-marker'; sleep 0.3"],
                &tmp(),
                None,
            )
            .expect("spawn sh");
        std::thread::sleep(Duration::from_millis(500));
        let snapshot = mgr.scrollback(&info.id).expect("scrollback");
        assert!(String::from_utf8_lossy(&snapshot).contains("scrollback-marker"));
        let _ = mgr.kill_session(&info.id);
    }

    #[cfg(unix)]
    #[test]
    fn typing_echo_does_not_read_as_busy() {
        // The PTY echoes keystrokes back as output; that echo must NOT be reported
        // as Claude working (#55) — only sustained autonomous output should.
        let (mgr, rx) = manager();
        let info = mgr
            .spawn_program("cat", &[], &tmp(), None)
            .expect("spawn cat");

        let mut saw_busy = false;
        let deadline = Instant::now() + Duration::from_millis(1500);
        while Instant::now() < deadline {
            // Simulate the user typing a character (no newline → pure TTY echo).
            let _ = mgr.write_stdin(&info.id, "x");
            if let Ok(SessionEvent::State { busy: true, .. }) =
                rx.recv_timeout(Duration::from_millis(80))
            {
                saw_busy = true;
                break;
            }
        }
        let _ = mgr.kill_session(&info.id);
        assert!(
            !saw_busy,
            "keystroke echo must not mark the session busy (#55)"
        );
    }

    #[test]
    fn is_noninput_report_matches_automatic_reports_only() {
        // Positive: focus in/out, SGR mouse press/release, X10 mouse, two reports
        // concatenated — these are emitted on click/focus, not by typing (#185).
        assert!(is_noninput_report("\x1b[I")); // focus in
        assert!(is_noninput_report("\x1b[O")); // focus out
        assert!(is_noninput_report("\x1b[<0;12;5M")); // SGR press
        assert!(is_noninput_report("\x1b[<0;12;5m")); // SGR release
        assert!(is_noninput_report("\x1b[M\x20\x21\x21")); // X10 mouse (CSI M + 3 bytes)
        assert!(is_noninput_report("\x1b[I\x1b[<0;1;1M")); // focus-in + mouse back-to-back

        // Negative: real keystrokes / text must stamp last_input, so they read as
        // input (the #55 echo guard must keep working).
        assert!(!is_noninput_report("ls\n"));
        assert!(!is_noninput_report("\r"));
        assert!(!is_noninput_report("\x1b[A")); // CSI arrow up
        assert!(!is_noninput_report("\x1bOA")); // SS3 key (no '[', distinct from focus-out)
        assert!(!is_noninput_report("\x1b")); // lone Escape
        assert!(!is_noninput_report("")); // empty
        assert!(!is_noninput_report("\x1b[Ix")); // report immediately followed by a real char
        assert!(!is_noninput_report("\x1b[3~")); // function/Home/End style CSI ~ sequence
    }

    #[test]
    fn focus_report_does_not_blink_busy_to_idle() {
        // #185: a focus/mouse report (xterm forwards these like keystrokes) must NOT
        // stamp last_input. A continuously-working agent should therefore stay busy
        // when the user clicks into / focuses / leaves it — no spurious idle edge.
        let (mgr, rx) = manager();
        let info = mgr
            .spawn_program_seeded(
                "sh",
                &[
                    "-c",
                    "i=0; while [ $i -lt 80 ]; do printf .; sleep 0.05; i=$((i+1)); done",
                ],
                &tmp(),
            )
            .expect("spawn sh");

        // Wait until it reads busy.
        let mut saw_busy = false;
        let deadline = Instant::now() + Duration::from_secs(2);
        while Instant::now() < deadline && !saw_busy {
            if let Ok(SessionEvent::State { busy: true, .. }) =
                rx.recv_timeout(Duration::from_millis(100))
            {
                saw_busy = true;
            }
        }
        assert!(saw_busy, "seeded continuous output should read as busy");

        // A focus-in report mid-work must be ignored by the busy heuristic.
        mgr.write_stdin(&info.id, "\x1b[I")
            .expect("write focus report");

        let mut saw_idle = false;
        let watch = Instant::now() + Duration::from_millis(600);
        while Instant::now() < watch {
            if let Ok(SessionEvent::State { busy: false, .. }) =
                rx.recv_timeout(Duration::from_millis(100))
            {
                saw_idle = true;
                break;
            }
        }
        let _ = mgr.kill_session(&info.id);
        assert!(
            !saw_idle,
            "a focus/mouse report must not flip a working agent to idle (#185)"
        );
    }

    #[test]
    fn real_keystroke_still_suppresses_echo_after_fix() {
        // Contrast to #185: a *real* keystroke still stamps last_input, so the echo
        // of typing right after it is suppressed (#55) — the working agent briefly
        // reads idle on the next tick. Proves the fix narrows only automatic reports.
        let (mgr, rx) = manager();
        let info = mgr
            .spawn_program_seeded(
                "sh",
                &[
                    "-c",
                    "i=0; while [ $i -lt 80 ]; do printf .; sleep 0.05; i=$((i+1)); done",
                ],
                &tmp(),
            )
            .expect("spawn sh");

        let mut saw_busy = false;
        let deadline = Instant::now() + Duration::from_secs(2);
        while Instant::now() < deadline && !saw_busy {
            if let Ok(SessionEvent::State { busy: true, .. }) =
                rx.recv_timeout(Duration::from_millis(100))
            {
                saw_busy = true;
            }
        }
        assert!(saw_busy, "seeded continuous output should read as busy");

        // A real keystroke stamps last_input → the next-tick output reads as echo.
        mgr.write_stdin(&info.id, "x").expect("write keystroke");

        let mut saw_idle = false;
        let watch = Instant::now() + Duration::from_millis(700);
        while Instant::now() < watch {
            if let Ok(SessionEvent::State { busy: false, .. }) =
                rx.recv_timeout(Duration::from_millis(100))
            {
                saw_idle = true;
                break;
            }
        }
        let _ = mgr.kill_session(&info.id);
        assert!(
            saw_idle,
            "a real keystroke must still suppress the echo as busy (#55 preserved)"
        );
    }
}
