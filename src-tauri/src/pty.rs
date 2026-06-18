//! Session / PTY core.
//!
//! Spawns and manages one real PTY per session — each running `claude` in a
//! chosen working directory — streams its output over an `mpsc` channel, and
//! accepts input / resize / kill. Deliberately decoupled from Tauri: the channel
//! is drained by the command layer (`src/commands.rs`) for live runs and by the
//! unit tests below. No status detection or approval parsing in v1 — this is a
//! faithful terminal pipe.

use std::collections::{HashMap, VecDeque};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

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
}

impl SessionError {
    fn kind(&self) -> &'static str {
        match self {
            Self::BinaryNotFound(_) => "BinaryNotFound",
            Self::SessionNotFound(_) => "SessionNotFound",
            Self::Spawn(_) => "Spawn",
            Self::Io(_) => "Io",
            Self::Git(_) => "Git",
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
    Output { id: String, bytes: Vec<u8> },
    Exited { id: String, code: Option<i32> },
}

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
}

impl SessionManager {
    pub fn new(events: Sender<SessionEvent>) -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            events: Mutex::new(events),
        }
    }

    /// Spawn a new interactive `claude` session in `cwd`. We generate the
    /// session id and pass it via `claude --session-id <uuid>` so the same id
    /// can be resumed later (see `resume_session`).
    pub fn spawn_session(
        &self,
        cwd: impl AsRef<Path>,
        name: Option<String>,
    ) -> Result<SessionInfo, SessionError> {
        let id = Uuid::new_v4().to_string();
        let args = ["--session-id", id.as_str()];
        self.spawn_with_id(id.clone(), "claude", &args, cwd.as_ref(), name)
    }

    /// Resume a previously-persisted `claude` session by id (used on boot) via
    /// `claude --resume <claude_session_id>`. Verified against the real CLI
    /// (claude 2.1.x, #30): `--session-id` / `--resume` round-trip; resuming an
    /// unknown id exits 1 ("No conversation found"), which the UI surfaces as a
    /// per-session Restart rather than a fatal error.
    pub fn resume_session(
        &self,
        claude_session_id: &str,
        cwd: impl AsRef<Path>,
        name: Option<String>,
    ) -> Result<SessionInfo, SessionError> {
        let args = ["--resume", claude_session_id];
        self.spawn_with_id(
            claude_session_id.to_string(),
            "claude",
            &args,
            cwd.as_ref(),
            name,
        )
    }

    /// Send keystrokes / paste to a session's stdin.
    pub fn write_stdin(&self, id: &str, data: &str) -> Result<(), SessionError> {
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

    /// Spawn an arbitrary program in a PTY with a generated id (test helper).
    #[cfg(test)]
    fn spawn_program(
        &self,
        program: &str,
        args: &[&str],
        cwd: &Path,
        name: Option<String>,
    ) -> Result<SessionInfo, SessionError> {
        self.spawn_with_id(Uuid::new_v4().to_string(), program, args, cwd, name)
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

        let reader_handle = std::thread::spawn({
            let id = id.clone();
            let child = Arc::clone(&child);
            let scrollback = Arc::clone(&scrollback);
            move || reader_loop(id, reader, &child, &scrollback, &events)
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
fn reader_loop(
    id: String,
    mut reader: Box<dyn Read + Send>,
    child: &Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    scrollback: &Arc<Mutex<Scrollback>>,
    events: &Sender<SessionEvent>,
) {
    let mut buf = [0u8; READ_CHUNK];
    loop {
        match reader.read(&mut buf) {
            // EOF or read error (e.g. EIO once the slave closes): the PTY is done.
            Ok(0) | Err(_) => break,
            Ok(n) => {
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

    let code = child
        .lock()
        .ok()
        .and_then(|mut child| child.wait().ok())
        .map(|status| status.exit_code() as i32);
    let _ = events.send(SessionEvent::Exited { id, code });
}

/// Shell out to the Zed editor to open `cwd` (best-effort, detached).
pub fn open_in_editor(cwd: &str) -> Result<(), SessionError> {
    const EDITOR: &str = "zed";
    if find_on_path(EDITOR).is_none() {
        return Err(SessionError::BinaryNotFound(EDITOR.to_string()));
    }
    std::process::Command::new(EDITOR)
        .arg(cwd)
        .spawn()
        .map_err(|e| SessionError::Spawn(e.to_string()))?;
    Ok(())
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
}
