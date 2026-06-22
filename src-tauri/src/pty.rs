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
use std::sync::mpsc::{Receiver, Sender};
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
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
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
        let (title_tx, title_rx) = std::sync::mpsc::channel::<String>();
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
        self.spawn_with_id(id, spec.binary_name, &arg_refs, cwd.as_ref(), name, false)
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
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        self.spawn_with_id(id, shell.as_str(), &[], cwd.as_ref(), None, false)
    }

    /// Send keystrokes / paste to a session's stdin.
    pub fn write_stdin(&self, id: &str, data: &str) -> Result<(), SessionError> {
        // Stamp the keystroke time *before* writing, so the echo the terminal
        // sends back can never be mistaken for autonomous Claude output (#55).
        if let Ok(map) = self.activity.lock() {
            if let Some(state) = map.get(id) {
                let now = self.base.elapsed().as_millis() as u64;
                state.last_input.store(now.max(1), Ordering::Relaxed);
            }
        }
        let mut sessions = self.lock_sessions()?;
        let session = sessions
            .get_mut(id)
            .ok_or_else(|| SessionError::SessionNotFound(id.to_string()))?;
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| SessionError::Io(e.to_string()))?;
        session
            .writer
            .flush()
            .map_err(|e| SessionError::Io(e.to_string()))
    }

    /// Resize a session's PTY to match the frontend terminal.
    pub fn resize_pty(&self, id: &str, cols: u16, rows: u16) -> Result<(), SessionError> {
        let sessions = self.lock_sessions()?;
        let session = sessions
            .get(id)
            .ok_or_else(|| SessionError::SessionNotFound(id.to_string()))?;
        session
            .master
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
        let sessions = self.lock_sessions()?;
        let session = sessions
            .get(id)
            .ok_or_else(|| SessionError::SessionNotFound(id.to_string()))?;
        let scrollback = session
            .scrollback
            .lock()
            .map_err(|_| SessionError::Io("scrollback lock poisoned".to_string()))?;
        Ok(scrollback.snapshot())
    }

    /// Number of registered sessions. Currently used only by tests.
    #[cfg(test)]
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
        self.spawn_with_id(Uuid::new_v4().to_string(), program, args, cwd, name, false)
    }

    /// Like `spawn_program` but marks the session prompt-seeded (#116): its output
    /// reads as work with no `write_stdin`, mirroring a scheduled agent (#93).
    #[cfg(test)]
    fn spawn_program_seeded(
        &self,
        program: &str,
        args: &[&str],
        cwd: &Path,
    ) -> Result<SessionInfo, SessionError> {
        self.spawn_with_id(Uuid::new_v4().to_string(), program, args, cwd, None, true)
    }

    /// Spawn `program` in a PTY under a caller-chosen session id. Backs
    /// `spawn_session`, `resume_session`, and the tests.
    fn spawn_with_id(
        &self,
        id: String,
        program: &str,
        args: &[&str],
        cwd: &Path,
        name: Option<String>,
        seeded: bool,
    ) -> Result<SessionInfo, SessionError> {
        if !cwd.is_dir() {
            return Err(SessionError::Spawn(format!(
                "working directory does not exist: {}",
                cwd.display()
            )));
        }
        if find_on_path(program).is_none() {
            return Err(SessionError::BinaryNotFound(program.to_string()));
        }

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: DEFAULT_ROWS,
                cols: DEFAULT_COLS,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| SessionError::Spawn(e.to_string()))?;

        let mut cmd = CommandBuilder::new(program);
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
        let events = self.event_sender()?;

        // Register this session's activity stamps for the busy heuristic (#42/#55);
        // a restart with the same id replaces the previous state here.
        let activity_state = Arc::new(ActivityState {
            last_output: AtomicU64::new(0),
            last_input: AtomicU64::new(0),
            seeded: AtomicBool::new(seeded),
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
            master: pair.master,
            writer,
            child,
            scrollback,
            _reader: reader_handle,
        };
        self.lock_sessions()?.insert(id.clone(), session);

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
    title_tx: Sender<String>,
    base: Instant,
) {
    // Last state we emitted per session, so we only send on change.
    let mut emitted: HashMap<String, bool> = HashMap::new();
    loop {
        std::thread::sleep(Duration::from_millis(MONITOR_TICK_MS));
        let now = base.elapsed().as_millis() as u64;
        // Snapshot (id, busy) under the lock, then release it before sending.
        let snapshot: Vec<(String, bool)> = {
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
                    (id.clone(), busy)
                })
                .collect()
        };
        // Forget sessions that are gone (killed/exited) so a reused id starts fresh.
        let live: HashSet<&str> = snapshot.iter().map(|(id, _)| id.as_str()).collect();
        emitted.retain(|id, _| live.contains(id.as_str()));
        for (id, busy) in &snapshot {
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
                    let _ = title_tx.send(id.clone());
                }
            }
        }
    }
}

/// Reads claude's auto-title for a session off the monitor's hot path (#97). The
/// monitor sends a session id on each busy→idle edge; this worker reads the title
/// (a file scan) and, only when it differs from the last title it emitted for that
/// session, sends a `Name` event for the command layer to persist + forward. Runs
/// until the channel closes (app shutdown).
fn title_worker(title_rx: Receiver<String>, events: Sender<SessionEvent>) {
    let mut last: HashMap<String, String> = HashMap::new();
    let mut last_forkable: HashMap<String, bool> = HashMap::new();
    while let Ok(id) = title_rx.recv() {
        // Forkability (#138): computed every poke (independent of the title, which may
        // be absent) and emitted only when it flips — false→true the moment the log
        // first materializes a real turn. Same file-scan class as the title read.
        let forkable = crate::title::has_conversation(&id);
        if last_forkable.get(&id) != Some(&forkable) {
            last_forkable.insert(id.clone(), forkable);
            if events
                .send(SessionEvent::Forkable {
                    id: id.clone(),
                    forkable,
                })
                .is_err()
            {
                return; // receiver dropped (app shutting down)
            }
        }
        let Some(title) = crate::title::read_session_title(&id) else {
            continue; // no log / no title yet (e.g. a shell terminal item) — skip
        };
        if last.get(&id) == Some(&title) {
            continue; // unchanged since we last emitted — nothing to do
        }
        last.insert(id.clone(), title.clone());
        if events.send(SessionEvent::Name { id, name: title }).is_err() {
            return; // receiver dropped (app shutting down)
        }
    }
}

/// Resolve `program` to an executable path via `PATH` (or a direct path).
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

fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path)
        .map(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::{Duration, Instant};

    fn manager() -> (SessionManager, mpsc::Receiver<SessionEvent>) {
        let (tx, rx) = mpsc::channel();
        (SessionManager::new(tx), rx)
    }

    fn tmp() -> PathBuf {
        std::env::temp_dir()
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
            .spawn_program("claudecue-does-not-exist-xyz", &[], &tmp(), None)
            .unwrap_err();
        assert!(matches!(err, SessionError::BinaryNotFound(_)));
    }

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
}
