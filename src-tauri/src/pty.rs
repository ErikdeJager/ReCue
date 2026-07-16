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

use portable_pty::{native_pty_system, Child, ChildKiller, CommandBuilder, MasterPty, PtySize};
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
/// This is the **fast** settle used for a clean single turn — a normal finished
/// turn settles to yellow ~700ms after its last output. Once a session's dot
/// starts *oscillating* (a background process / subagent / paused turn repainting
/// in bursts >700ms apart) it switches to the longer `BACKGROUND_HOLD_MS` hold so
/// it holds solid blue instead of flickering blue↔yellow (#315).
const BUSY_WINDOW_MS: u64 = 700;
/// Once a session's activity dot starts *oscillating* (output resumes shortly after it went
/// quiet — a background process / subagent / paused turn repainting in bursts, #315), it enters
/// a **sticky** busy state and stays blue until output has been quiet for this long, instead of
/// flickering blue↔yellow every burst. The same window is the "re-arm" threshold: a re-activation
/// within this long of a busy→idle settle is treated as flicker. A plain single turn (no
/// re-activation) still settles at `BUSY_WINDOW_MS` and never pays this hold.
const BACKGROUND_HOLD_MS: u64 = 5_000;
/// How often the monitor thread re-evaluates each session's busy state (#42).
const MONITOR_TICK_MS: u64 = 200;
/// Output is treated as the terminal's **echo of typing** (not Claude working,
/// #55) unless it arrives at least this long after the last keystroke. Tuned so
/// keystroke echo never reads as busy, while sustained autonomous output does.
const INPUT_ECHO_MS: u64 = 300;
/// A repaint that lands within this long of an automatic focus/mouse report is treated
/// as *caused by* that report, not by real work (#403), so it must not flip an idle
/// session's dot to busy. Focusing/hovering a terminal makes claude repaint once; that
/// one-shot paint clears well within this window, while a genuine turn keeps producing
/// output past it and legitimately goes busy. Kept ≤ `BUSY_WINDOW_MS` so a real turn's
/// sustained output (which outlasts this window) is never suppressed.
const REPORT_REPAINT_MS: u64 = 300;
/// A repaint that lands within this long of a `resize_pty` is treated as *caused by*
/// that resize, not by real work, so it must not flip an idle session's dot to busy.
/// Reparenting a pooled terminal into a differently-sized slot (entering the Attention
/// view's agent pane, a window drag, an Overview lazy-mount) delivers SIGWINCH and makes
/// claude repaint its whole TUI — without this stamp that repaint read as fresh work and
/// blinked a confirmed-idle agent out of the Attention queue the instant it surfaced.
/// Wider than `REPORT_REPAINT_MS` because a full-size reflow repaint straggles across
/// chunks (each chunk re-stamps `last_output`, so the check is last-chunk-vs-resize),
/// but kept < `BUSY_WINDOW_MS` so a real turn's sustained output (which outlasts this
/// window) is never suppressed.
const RESIZE_REPAINT_MS: u64 = 500;
/// Title re-read schedule (#169): after each poke (a busy→idle edge or a session
/// spawn), the title worker re-reads claude's `ai-title` at these offsets (ms),
/// spanning ~30s. `claude` writes the LLM-generated title **asynchronously**, a
/// moment after the turn ends, so a single read at the busy→idle edge often misses
/// it — the burst picks it up within seconds with no user click. The per-session
/// dedup makes re-reading an unchanged title a cheap no-op; extending the last
/// value lengthens the window.
const TITLE_REREAD_OFFSETS_MS: &[u64] = &[0, 1_500, 4_000, 8_000, 15_000, 30_000];
/// After the agent's process is reaped, how long the exit waiter waits for the reader thread
/// to drain the PTY to EOF before it concludes that **descendants** are still holding the
/// slave open (#354). Keeps trailing output ordered before `Exited` in the normal case (the
/// reader EOFs within milliseconds once the last holder of the slave is gone).
const EXIT_DRAIN_MS: u64 = 150;
/// After hanging up those lingering descendants, a second bounded wait for the reader's EOF
/// before escalating to SIGKILL (#354). Worst-case added exit latency: `EXIT_DRAIN_MS` +
/// `EXIT_HUP_GRACE_MS`.
const EXIT_HUP_GRACE_MS: u64 = 250;
/// Poll granularity while waiting on the reader-done / reaped flags (#354).
const EXIT_POLL_MS: u64 = 10;
/// `kill_session`: grace between the group SIGHUP and the escalation SIGKILL (#354). It runs
/// off-thread, so the caller never blocks. Mirrors portable-pty's own ~200ms grace, with
/// headroom for `claude` to flush its conversation log before it is forced. (Unix only — the
/// Windows kill path stays `TerminateProcess`, which needs no escalation.)
#[cfg_attr(windows, allow(dead_code))]
const KILL_GRACE_MS: u64 = 500;
/// `kill_all` (app shutdown): the **one** shared grace between the SIGHUP sweep and the
/// SIGKILL sweep (#354) — paid once, not once per session (portable-pty's `Child::kill()`
/// sleeps ~200ms *per child*, so 10 agents stalled the quit for ~2s). Unix only, as above.
#[cfg_attr(windows, allow(dead_code))]
const SHUTDOWN_GRACE_MS: u64 = 200;

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
    /// A dev-container session can't be forked: its claude log lives in the
    /// per-session container home, not the host's `~/.claude/projects`, so a fork's
    /// `--resume <source>` in a FRESH container home would find nothing. Refused up
    /// front (the UI already shows Fork unavailable — `forkable` never flips true).
    #[error("a dev-container session can't be forked")]
    ContainerUnsupported,
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
            Self::ContainerUnsupported => "ContainerUnsupported",
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
#[cfg_attr(test, derive(PartialEq))]
pub enum SessionEvent {
    Output {
        id: String,
        bytes: Vec<u8>,
        /// Absolute end-offset of this chunk (running total of bytes ever produced by
        /// the session). Lets the frontend dedupe the scrollback-replay ↔ live overlap.
        offset: u64,
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
    /// The directory the session is currently working in, per claude's own log
    /// (`EnterWorktree` / `/cd` move it) — the agent-relocation signal for the
    /// sidebar's worktree grouping. Emitted by the title worker on its burst
    /// cadence when the log tail's `cwd` changes; claude-only (`uses_claude_log`).
    /// The command layer persists + forwards it.
    Cwd {
        id: String,
        cwd: String,
    },
}

/// Cap on a single coalesced `Output` payload (#346): a run at/over this size is
/// flushed so one emit's base64 payload stays bounded. Matches `SCROLLBACK_CAP`,
/// so a merged emit is never larger than a scrollback replay already is.
const COALESCE_MAX_BYTES: usize = SCROLLBACK_CAP;

/// Merge consecutive runs of contiguous same-session `Output` events into one event
/// (#346), leaving every other event — and overall order — untouched.
///
/// The event forwarder (`lib.rs`) drains whatever is queued after each blocking
/// `recv` and passes the batch through here, so a TUI repaint storm becomes a few
/// large `session://output` emits instead of hundreds of per-8KB ones — each emit is
/// an evaluate-JS on the webview main thread, costliest on Linux/WebKitGTK. The
/// frontend already rAF-coalesces its xterm writes, so a merged chunk decodes to the
/// identical byte stream.
///
/// A chunk joins the open run only when it **continues it exactly**: same session,
/// contiguous bytes (its end-offset == the run's end-offset + its length), and the
/// run still under [`COALESCE_MAX_BYTES`]. The contiguity guard is load-bearing: it
/// keeps the frontend's `start = offset - bytes.length` dedupe math exact, and it
/// splits across a Restart — a respawn under the same id creates a fresh
/// `Scrollback` whose running total resets to 0, so a stale reader's final chunk
/// must never merge with the new reader's first. Any non-Output event (or another
/// session's Output) simply starts a new run, so e.g. a session's `Exited` still
/// emits strictly after its final `Output`.
pub fn coalesce_output_events(events: Vec<SessionEvent>) -> Vec<SessionEvent> {
    let mut out: Vec<SessionEvent> = Vec::with_capacity(events.len());
    for event in events {
        match event {
            SessionEvent::Output { id, bytes, offset } => {
                if let Some(SessionEvent::Output {
                    id: run_id,
                    bytes: run_bytes,
                    offset: run_offset,
                }) = out.last_mut()
                {
                    let contiguous = offset == run_offset.saturating_add(bytes.len() as u64);
                    if *run_id == id && contiguous && run_bytes.len() < COALESCE_MAX_BYTES {
                        run_bytes.extend_from_slice(&bytes);
                        *run_offset = offset;
                        continue;
                    }
                }
                out.push(SessionEvent::Output { id, bytes, offset });
            }
            other => out.push(other),
        }
    }
    out
}

/// Per-session activity timestamps (millis-since-`base`, 0 = none) for the busy
/// heuristic. `last_output` is stamped by the reader thread (#42); `last_input`
/// by `write_stdin` (#55) so the monitor can tell the terminal's echo of typing
/// from genuine Claude output.
struct ActivityState {
    last_output: AtomicU64,
    last_input: AtomicU64,
    /// ms timestamp of the last automatic terminal report (focus/mouse) written via
    /// `write_stdin`; used by the monitor to suppress the spurious idle→busy edge from a
    /// focus-triggered repaint (#403). A focus/mouse report is *not* a keystroke (it does
    /// not stamp `last_input`, #185), yet it can make claude repaint — which the reader
    /// stamps into `last_output`. Without this stamp that lone repaint would read as fresh
    /// work and blink the dot blue for a tick when a panel is merely focused/hovered.
    last_report: AtomicU64,
    /// ms timestamp of the last `resize_pty` for this session; used by the monitor to
    /// suppress the spurious idle→busy edge from a resize-triggered repaint (the
    /// SIGWINCH sibling of `last_report`'s #403). A resize is not input, yet it makes
    /// claude repaint its whole TUI — which the reader stamps into `last_output`.
    /// Without this stamp that repaint read as fresh work and blinked a confirmed-idle
    /// agent out of the Attention queue whenever its terminal was reparented into a
    /// differently-sized slot (the Attention agent pane, a window drag).
    last_resize: AtomicU64,
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

/// Per-**spawn** (per PTY generation) exit bookkeeping (#354), shared by the reader thread,
/// the exit waiter, and the kill paths. A Restart under the same session id creates a fresh
/// one, so a stale generation's flags can never be confused with the live one's.
#[derive(Default)]
struct ExitState {
    /// The reader loop has hit EOF **and already sent its last `Output`** — so `Exited` can
    /// be emitted without racing ahead of trailing output.
    reader_done: AtomicBool,
    /// The exit waiter has reaped the child (its `wait()` returned) — lets a kill escalation
    /// stop early instead of SIGKILLing a process that already died on the SIGHUP.
    reaped: AtomicBool,
    /// Suppress this generation's `Exited` event entirely. Set by (a) `kill_all` at app
    /// shutdown — now that the exit fires promptly it could reach a still-live webview, and
    /// an agent that exits 0 on SIGHUP would read as a **clean exit**, so `isCleanExit` would
    /// **delete the persisted record**, breaking the #30/#63 rule that a quit keeps sessions
    /// for the next boot; and (b) a same-id respawn (Restart), so a stale generation's late
    /// exit can never be attributed to the fresh session.
    silent: AtomicBool,
}

/// Per-session hysteresis state for the busy/idle decision (#315), owned solely by the
/// monitor thread. `emitted` is the last busy value we sent (dedup); `sticky` means we've
/// detected flicker/background activity and are holding blue on the longer `BACKGROUND_HOLD_MS`
/// window; `settled_at` is the ms-timestamp of the last busy→idle emit (0 = none), used to
/// spot a quick re-activation.
#[derive(Default)]
struct BusyDecision {
    emitted: bool,
    sticky: bool,
    settled_at: u64,
}

/// Bounded byte ring buffer used to replay recent output to late subscribers.
struct Scrollback {
    buf: VecDeque<u8>,
    cap: usize,
    /// Monotonic count of **all** bytes ever pushed (never decremented on eviction).
    /// This is the absolute end-offset of the most recent byte, shared with the live
    /// output stream (each `Output` event carries the same running offset) so the
    /// frontend can deduplicate the scrollback-replay ↔ live-stream overlap that
    /// otherwise double-paints a freshly-spawned session's startup (the stray-glyph
    /// bug): a live chunk whose end-offset is ≤ the replayed scrollback's end is
    /// already on screen and is skipped.
    total: u64,
}

impl Scrollback {
    fn new(cap: usize) -> Self {
        Self {
            buf: VecDeque::new(),
            cap,
            total: 0,
        }
    }

    fn push(&mut self, bytes: &[u8]) {
        self.buf.extend(bytes);
        self.total = self.total.saturating_add(bytes.len() as u64);
        if self.buf.len() > self.cap {
            let overflow = self.buf.len() - self.cap;
            self.buf.drain(0..overflow);
        }
    }

    /// The snapshot plus its absolute end-offset (`total`): the scrollback covers
    /// absolute bytes `[total - snapshot.len(), total)`.
    fn snapshot(&self) -> (Vec<u8>, u64) {
        (self.buf.iter().copied().collect(), self.total)
    }
}

/// A terminal-output match snippet is clamped to this many characters, mirroring
/// `files.rs`'s content-search `SNIPPET_MAX_CHARS`; a longer matching line is windowed
/// around the match (with `…` markers) so the hit stays visible (#337).
const OUTPUT_SNIPPET_MAX_CHARS: usize = 200;
/// Characters of leading context kept before the match when a long line is windowed.
const OUTPUT_SNIPPET_CONTEXT_CHARS: usize = 40;
/// Upper bound on the spaces a single cursor-forward (CUF, `ESC[<n>C`) run emits when
/// `strip_ansi` approximates the visible layout (#337): `claude` spaces columns with
/// non-erasing CUF moves, so search-fidelity needs them rendered as spaces — but a
/// pathological `ESC[999999C` must not balloon the stripped string.
const CURSOR_FORWARD_SPACE_CAP: usize = 64;

/// Strip ANSI / terminal control sequences from `s`, best-effort, leaving readable text
/// (#337). Terminal scrollback is full of CSI color/cursor codes, OSC title sets, and
/// lone escapes; searching them raw would both miss matches split by escapes and surface
/// garbage snippets. Handles:
///   - **CSI** — `ESC [` … a final byte in `@`..=`~` (colors, cursor moves). A
///     **cursor-forward** move (CUF, final byte `C`) is the one exception that emits
///     text: `claude` spaces columns with non-erasing `ESC[<n>C` moves, so `A\u{1b}[3CB`
///     is visually `A   B`; dropping the sequence wholesale would collapse it to `AB` and
///     a user searching the phrase they *see* (`A B`) would miss it. So a CUF becomes
///     `n` spaces (default `1` when the parameter is empty/unparseable), clamped to
///     [`CURSOR_FORWARD_SPACE_CAP`]. This is a **search-only, best-effort approximation of
///     the visible layout** — every other CSI final byte still emits nothing.
///   - **OSC** — `ESC ]` … terminated by `BEL` (0x07) or `ST` (`ESC \`).
///   - **Other** `ESC`-prefixed escapes — the `ESC` plus its single following byte.
///
/// Printable text plus `\n` and `\t` is kept; other C0 control chars are dropped. Pure +
/// char-safe (operates on the already-decoded string), so it's identical on macOS/Windows.
pub fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            // ESC — consume the escape sequence rather than emit it.
            match chars.peek() {
                Some('[') => {
                    // CSI: parameter/intermediate bytes until a final byte @..=~.
                    chars.next();
                    let mut params = String::new();
                    while let Some(&p) = chars.peek() {
                        chars.next();
                        if ('@'..='~').contains(&p) {
                            // A cursor-forward (CUF) move approximates visible spacing: emit
                            // its parameter count of spaces, clamped. Every other final byte
                            // still emits nothing.
                            if p == 'C' {
                                let n = params
                                    .parse::<usize>()
                                    .unwrap_or(1)
                                    .clamp(1, CURSOR_FORWARD_SPACE_CAP);
                                for _ in 0..n {
                                    out.push(' ');
                                }
                            }
                            break;
                        }
                        params.push(p);
                    }
                }
                Some(']') => {
                    // OSC: text until BEL, or ST (ESC \).
                    chars.next();
                    while let Some(&p) = chars.peek() {
                        if p == '\u{07}' {
                            chars.next();
                            break;
                        }
                        if p == '\u{1b}' {
                            chars.next(); // ESC of the ST
                            if chars.peek() == Some(&'\\') {
                                chars.next();
                            }
                            break;
                        }
                        chars.next();
                    }
                }
                Some(_) => {
                    // Other escape (e.g. `ESC =`) — drop ESC + its single following byte.
                    chars.next();
                }
                None => {}
            }
            continue;
        }
        // Keep printable text + newline/tab; drop other C0 control chars.
        if c == '\n' || c == '\t' || !c.is_control() {
            out.push(c);
        }
    }
    out
}

/// Build a clamped display snippet from a matching terminal-output `line` (#337): trim
/// surrounding whitespace, and if still longer than `clamp` chars, window it around the
/// first `needle_lower` occurrence with `…` markers. Char-based throughout (never slices a
/// `str` at a non-boundary), mirroring `files.rs`'s `make_snippet`.
fn clamp_output_snippet(line: &str, needle_lower: &str, clamp: usize) -> String {
    let trimmed = line.trim();
    let chars: Vec<char> = trimmed.chars().collect();
    if chars.len() <= clamp {
        return trimmed.to_string();
    }
    let lowered = trimmed.to_lowercase();
    let match_char = lowered
        .find(needle_lower)
        .map(|b| lowered[..b].chars().count())
        .unwrap_or(0)
        .min(chars.len());
    let start = match_char.saturating_sub(OUTPUT_SNIPPET_CONTEXT_CHARS);
    let end = (start + clamp).min(chars.len());
    let start = end.saturating_sub(clamp);
    let mut out = String::new();
    if start > 0 {
        out.push('…');
    }
    out.extend(&chars[start..end]);
    if end < chars.len() {
        out.push('…');
    }
    out
}

/// Find lines in `text` containing `needle_lower` (already lowercased), returning up to
/// `per_session` `(1-based line number, clamped snippet)` pairs (#337). Case-insensitive
/// via a per-line lowercase; each snippet is trimmed + windowed to `clamp` chars around
/// the match. A blank needle → empty. Pure.
pub fn match_output_lines(
    text: &str,
    needle_lower: &str,
    per_session: usize,
    clamp: usize,
) -> Vec<(u32, String)> {
    let mut out = Vec::new();
    if needle_lower.is_empty() || per_session == 0 {
        return out;
    }
    for (i, line) in text.lines().enumerate() {
        if out.len() >= per_session {
            break;
        }
        if line.to_lowercase().contains(needle_lower) {
            let snippet = clamp_output_snippet(line, needle_lower, clamp);
            if !snippet.is_empty() {
                out.push((i as u32 + 1, snippet));
            }
        }
    }
    out
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
    /// Signals the child **without owning it** (portable-pty's `clone_killer`, #354) — the
    /// exit waiter owns the `Child` and blocks in `wait()`, so no kill path can ever be stuck
    /// behind a blocking wait (before #354, `kill_session` and `reader_loop` contended on the
    /// same `child` mutex). Unix: SIGHUP to the direct pid — used only as a fallback when the
    /// pid is unknown, since the normal path signals the whole process group. Windows:
    /// `TerminateProcess`, i.e. exactly the pre-#354 Windows kill.
    killer: Arc<Mutex<Box<dyn ChildKiller + Send + Sync>>>,
    /// The direct child's pid — on unix **also its process-group id**, because portable-pty's
    /// unix spawn `setsid()`s the child (so `pgid == pid`, a fresh session holding nothing but
    /// its own descendants). Read only by the unix group-kill paths; Windows keeps signalling
    /// the direct child through `killer` (#354).
    #[cfg_attr(windows, allow(dead_code))]
    pid: Option<u32>,
    /// Exit bookkeeping for THIS spawn (see `ExitState`, #354).
    exit: Arc<ExitState>,
    scrollback: Arc<Mutex<Scrollback>>,
    // Reader thread; detached on drop (it finishes when the PTY closes).
    _reader: JoinHandle<()>,
    // Exit-waiter thread (#354); detached on drop (it finishes when the child is reaped).
    _waiter: JoinHandle<()>,
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
        custom_command: Option<&str>,
        container: Option<&crate::container::ContainerLaunch>,
    ) -> Result<SessionInfo, SessionError> {
        self.spawn_session_with_prompt(cwd, name, None, agent, custom_command, container)
    }

    /// Spawn a new session for `agent` (#101), optionally pre-seeded with an initial
    /// `prompt` so it boots ready (#93 scheduled sessions). The agent's `AgentSpec`
    /// supplies the binary + the args; for Claude that's `claude --session-id <uuid>
    /// ["<prompt>"]` (the prompt passed positionally) — today's exact, CLI-verified
    /// (claude 2.1.x) behavior. A blank prompt is dropped (a plain new session).
    ///
    /// For the **custom** agent (#325) the program + args aren't from a static spec —
    /// they come from `custom_command` (the user's `customAgentCommand` Settings string),
    /// parsed as an argv (NOT a shell line) by `parse_custom_command`. A non-blank prompt
    /// is appended as a trailing positional arg (best-effort seed); an unset / empty
    /// command is a clear `Spawn` error rather than a phantom `"custom"` binary spawn.
    ///
    /// A **dev-container session** passes `container` (composed in `commands.rs`): the
    /// resolved `(program, args)` are rewritten to `docker run … <image> <program>
    /// <args…>` right here — upstream of `spawn_with_id`, which stays generic (the PTY
    /// child is the docker CLI, resolved on PATH like any binary). The session id is
    /// then the launch's pre-minted UUID, so the container label == the record id ==
    /// the per-session home-dir key. The `None` arm is byte-for-byte today's behavior.
    pub fn spawn_session_with_prompt(
        &self,
        cwd: impl AsRef<Path>,
        name: Option<String>,
        prompt: Option<&str>,
        agent: &str,
        custom_command: Option<&str>,
        container: Option<&crate::container::ContainerLaunch>,
    ) -> Result<SessionInfo, SessionError> {
        let id = match container {
            Some(launch) => launch.session_id.clone(),
            None => Uuid::new_v4().to_string(),
        };
        let spec = crate::agents::agent_spec(agent);
        // A non-blank initial prompt means the agent starts working immediately with
        // no keystrokes (#93), so it counts as "has work" for the busy heuristic
        // (#116) — otherwise it would be stuck gray (never blue/yellow).
        let trimmed_prompt = prompt.map(str::trim).filter(|p| !p.is_empty());
        let seeded = trimmed_prompt.is_some();
        let (program, args, uses_claude_log) = if spec.id == "custom" {
            // Resolve the user's command → (program, args). Missing/blank → clear error.
            let command = custom_command
                .ok_or_else(|| SessionError::Spawn("Custom agent command is not set".into()))?;
            let (program, mut args) = crate::agents::parse_custom_command(command)
                .ok_or_else(|| SessionError::Spawn("Custom agent command is empty".into()))?;
            // Best-effort prompt seed: append it as a trailing positional (#325). A
            // blank/absent prompt launches the bare parsed command.
            if let Some(p) = trimmed_prompt {
                args.push(p.to_string());
            }
            // Custom agents can't auto-name (no claude-style ai-title log, #325).
            (program, args, false)
        } else {
            (
                spec.binary_name.to_string(),
                spec.spawn_args(&id, prompt),
                spec.supports_auto_name,
            )
        };
        let (program, args) = match container {
            Some(launch) => {
                let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
                crate::container::docker_invocation(launch, &program, &arg_refs)
            }
            None => (program, args),
        };
        // A container session's claude log lives in its per-session container home,
        // not the host's `~/.claude/projects` — the #97 title worker would glob
        // nothing, so gate it off (the label falls back to the branch name).
        let uses_claude_log = uses_claude_log && container.is_none();
        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        self.spawn_with_id(
            id,
            &program,
            &arg_refs,
            cwd.as_ref(),
            name,
            seeded,
            uses_claude_log,
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
        container: Option<&crate::container::ContainerLaunch>,
    ) -> Result<SessionInfo, SessionError> {
        let spec = crate::agents::agent_spec(agent);
        let args = spec.resume_args(claude_session_id);
        // A dev-container session resumes inside a fresh container with the SAME
        // per-session home mounted, so `claude --resume <id>` finds its own log there
        // (`commands.rs` composes the launch from the persisted record). Same wrap
        // point as `spawn_session_with_prompt`; `None` is byte-for-byte unchanged.
        let (program, args) = match container {
            Some(launch) => {
                let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
                crate::container::docker_invocation(launch, spec.binary_name, &arg_refs)
            }
            None => (spec.binary_name.to_string(), args),
        };
        let uses_claude_log = spec.supports_auto_name && container.is_none();
        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        // A resume just reopens the conversation; it doesn't re-run a prompt, so it
        // has no autonomous work to do (#116) — `seeded` is false. A previously-active
        // session still shows yellow on boot via its persisted `has_been_active`.
        self.spawn_with_id(
            claude_session_id.to_string(),
            &program,
            &arg_refs,
            cwd.as_ref(),
            name,
            false,
            uses_claude_log,
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
        } else {
            // An automatic focus/mouse report (not a keystroke, #185). Record *when* it was
            // sent so the monitor can tell a focus-triggered repaint from real work and not
            // flip the idle→busy edge just because a panel was focused/hovered (#403). We
            // still don't stamp `last_input` — the bytes are written to the PTY unchanged.
            if let Ok(map) = self.activity.lock() {
                if let Some(state) = map.get(id) {
                    let now = self.base.elapsed().as_millis() as u64;
                    state.last_report.store(now.max(1), Ordering::Relaxed);
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
        // Stamp the resize time *before* the resize goes out (mirroring `write_stdin`'s
        // stamp-before-write ordering), so the SIGWINCH-triggered repaint can never be
        // read by the monitor ahead of its own attribution stamp. The repaint must not
        // flip an idle session's dot to busy — the resize sibling of #403.
        if let Ok(map) = self.activity.lock() {
            if let Some(state) = map.get(id) {
                let now = self.base.elapsed().as_millis() as u64;
                state.last_resize.store(now.max(1), Ordering::Relaxed);
            }
        }
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

    /// Kill a session's child and forget it (frees the slot). **Non-blocking** (#354): the
    /// SIGHUP goes out immediately (on unix to the child's whole process group, so claude's
    /// MCP servers / tool children die with it — #31) and the SIGKILL escalation runs on a
    /// short-lived detached thread, instead of sleeping ~200ms inside the Tauri command.
    /// The session's **exit waiter** still emits exactly one final `Exited` event once the
    /// child actually terminates — the frontend's `intentionalKills` bookkeeping is unchanged.
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
        kill_now(&session);
        // `session` drops here, closing the master/writer.
        Ok(())
    }

    /// Kill every live child and clear the registry — used on app shutdown so no
    /// orphan `claude` processes survive (#31). Best-effort and infallible
    /// (recovers a poisoned lock); the dropped sessions close their PTYs too.
    ///
    /// **Silent** (#354): every generation it kills is flagged `silent` **before any signal**,
    /// so no `Exited` event is emitted at all. Now that the exit fires promptly (off the
    /// child's `wait()`, not the reader's EOF) such an event could reach the still-live
    /// webview, and an agent that exits 0 on SIGHUP would look like a **clean exit** —
    /// `isCleanExit` would then delete its persisted record and the session would NOT come
    /// back on the next launch. A quit keeps sessions (#30/#63).
    ///
    /// **Bounded** (#354): two sweeps with **one** shared grace, rather than portable-pty's
    /// ~200ms-per-child serial kill (10 agents ⇒ a ~2s shutdown stall). Deliberately does not
    /// reuse `kill_now`, whose escalation thread might not survive process exit — that would
    /// leave orphans.
    pub fn kill_all(&self) {
        let sessions: Vec<Session> = {
            let mut map = self
                .sessions
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            map.drain().map(|(_, session)| session).collect()
        };
        for session in &sessions {
            session.exit.silent.store(true, Ordering::SeqCst);
        }
        // Sweep 1: hang up everything (unix: each child's whole process group; Windows:
        // `TerminateProcess` on the direct child, exactly as before).
        for session in &sessions {
            #[cfg(unix)]
            hangup_group(session.pid);
            #[cfg(windows)]
            if let Ok(mut killer) = session.killer.lock() {
                let _ = killer.kill();
            }
        }
        // Sweep 2 (unix): ONE shared grace, then SIGKILL any survivor, so no `claude` / MCP
        // child is orphaned (#31).
        #[cfg(unix)]
        {
            std::thread::sleep(Duration::from_millis(SHUTDOWN_GRACE_MS));
            for session in &sessions {
                kill_group(session.pid);
            }
        }
        if let Ok(mut map) = self.activity.lock() {
            map.clear();
        }
    }

    /// Snapshot a session's retained scrollback (for terminal replay on mount), plus
    /// its absolute end-offset so the frontend can dedupe the replay ↔ live overlap.
    pub fn scrollback(&self, id: &str) -> Result<(Vec<u8>, u64), SessionError> {
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

    /// Search every live session's retained scrollback for `needle` (#337) — the global
    /// search modal's terminal-output source. For each session: snapshot the scrollback
    /// bytes (briefly holding only the per-session lock, like `scrollback`), decode
    /// lossily, strip ANSI, and collect up to `per_session` matching `(id, line, snippet)`
    /// tuples; stop once `total` matches are gathered. A blank/whitespace needle → empty.
    /// Best-effort: the scrollback is only the in-memory tail, so this never fails (a
    /// poisoned lock is skipped rather than propagated).
    pub fn search_output(
        &self,
        needle: &str,
        per_session: usize,
        total: usize,
    ) -> Vec<(String, u32, String)> {
        let needle_lower = needle.trim().to_lowercase();
        if needle_lower.is_empty() || total == 0 {
            return Vec::new();
        }
        // Clone the per-session scrollback Arcs under the brief global lock (mirroring
        // `scrollback`), then drop it before the (potentially large) copies + scans so a
        // search never blocks other sessions' map operations.
        let entries: Vec<(String, Arc<Mutex<Scrollback>>)> = match self.lock_sessions() {
            Ok(sessions) => sessions
                .iter()
                .map(|(id, s)| (id.clone(), Arc::clone(&s.scrollback)))
                .collect(),
            Err(_) => return Vec::new(),
        };
        let mut out = Vec::new();
        for (id, scrollback) in entries {
            if out.len() >= total {
                break;
            }
            let bytes = match scrollback.lock() {
                Ok(sb) => sb.snapshot().0,
                Err(_) => continue,
            };
            let text = String::from_utf8_lossy(&bytes);
            let stripped = strip_ansi(&text);
            let cap = per_session.min(total - out.len());
            for (line, snippet) in
                match_output_lines(&stripped, &needle_lower, cap, OUTPUT_SNIPPET_MAX_CHARS)
            {
                out.push((id.clone(), line, snippet));
            }
        }
        out
    }

    /// Number of registered sessions. Currently used only by the (unix-only,
    /// PTY-spawning) tests.
    #[cfg(all(test, unix))]
    pub fn session_count(&self) -> usize {
        self.lock_sessions().map(|s| s.len()).unwrap_or(0)
    }

    /// A session's child pid — on unix also its **process-group id** (#354). Used only by the
    /// unix PTY tests, to assert the whole group is gone after an exit / a kill.
    #[cfg(all(test, unix))]
    pub fn session_pid(&self, id: &str) -> Option<u32> {
        self.lock_sessions().ok()?.get(id)?.pid
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
        // Inherit the parent environment so the child can resolve PATH etc. — with the
        // AppImage-injected vars scrubbed out on Linux (#350; a byte-for-byte no-op on
        // macOS/Windows and outside an AppImage) — then make sure it has a sensible TERM
        // for the TUI. `CommandBuilder` starts from an empty env set, so a var the scrub
        // omits is genuinely absent from the child.
        for (key, value) in crate::child_env::child_env_vars() {
            cmd.env(key, value);
        }
        // Give the child the **restored** login-shell PATH (#345/#360) rather than this
        // process's minimal GUI PATH: `portable-pty` resolves the program against the
        // builder's own PATH entry, and `claude` itself shells out to node/git/ripgrep.
        // `effective_path` blocks only while a first-launch (cache-miss) probe is still
        // in flight — never on the window's critical path (the boot resume runs on a
        // background thread, and by the time a user can click "New session" the probe has
        // long landed). In debug builds / on Windows it is this process's own PATH, so the
        // child env is byte-for-byte what the `vars_os` copy above already gave it.
        if let Some(path) = crate::path_env::effective_path() {
            cmd.env("PATH", path);
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
        // The child is **owned by the exit waiter** (#354), which blocks in `wait()` and is the
        // single emitter of `Exited`. The kill paths keep only a cloned *killer* (a signalling
        // handle portable-pty hands out for exactly this split) and the pid — on unix also the
        // **process-group id**, since portable-pty's unix spawn `setsid()`s the child.
        let pid = child.process_id();
        let killer: Arc<Mutex<Box<dyn ChildKiller + Send + Sync>>> =
            Arc::new(Mutex::new(child.clone_killer()));
        let exit = Arc::new(ExitState::default());
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
            last_report: AtomicU64::new(0),
            last_resize: AtomicU64::new(0),
            seeded: AtomicBool::new(seeded),
            uses_claude_log,
        });
        if let Ok(mut map) = self.activity.lock() {
            map.insert(id.clone(), Arc::clone(&activity_state));
        }

        let reader_handle = std::thread::spawn({
            let id = id.clone();
            let scrollback = Arc::clone(&scrollback);
            let activity = Arc::clone(&self.activity);
            let state = Arc::clone(&activity_state);
            let exit = Arc::clone(&exit);
            let events = events.clone();
            let base = self.base;
            move || {
                reader_loop(
                    id,
                    reader,
                    &scrollback,
                    &events,
                    &state,
                    base,
                    &activity,
                    &exit,
                )
            }
        });

        // The exit waiter (#354) owns the `Child` and blocks in `wait()`, so the `Exited` event
        // is driven by the agent's process actually terminating rather than by the PTY reader
        // hitting EOF — which on unix only happens once **every** holder of the slave fd (an MCP
        // server, a tool child) is gone, and so used to delay the exit by seconds.
        let waiter_handle = std::thread::spawn({
            let id = id.clone();
            let exit = Arc::clone(&exit);
            let state = Arc::clone(&activity_state);
            let activity = Arc::clone(&self.activity);
            move || exit_waiter(id, child, pid, exit, events, state, activity)
        });

        let session = Session {
            name: name.clone(),
            cwd: cwd.to_path_buf(),
            master,
            writer,
            killer,
            pid,
            exit,
            scrollback,
            _reader: reader_handle,
            _waiter: waiter_handle,
        };
        // A same-id respawn (Restart, #63) supersedes the previous PTY generation. Silence it
        // (its late exit must never be attributed to the fresh session — the frontend consumes
        // an `intentionalKills` flag exactly once) and make sure it is really dead, so a stale
        // generation can't leak a live child. Normally it exited long ago and this is a no-op.
        let previous = self.lock_sessions()?.insert(id.clone(), session);
        if let Some(previous) = previous {
            previous.exit.silent.store(true, Ordering::SeqCst);
            // Only signal a generation that is still running. In the normal Restart case the old
            // child is long dead and already reaped — and once its group is empty its pid may
            // have been recycled, so signalling it would be the one way `killpg` could reach a
            // process that isn't ours. Its waiter has already done any descendant cleanup.
            if !previous.exit.reaped.load(Ordering::SeqCst) {
                kill_now(&previous);
            }
        }

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

/// Reads a session's PTY until it closes, pushing bytes to scrollback and the event channel.
///
/// It no longer emits the `Exited` event (#354): the PTY master only reports EOF once **every**
/// holder of the slave fd is gone — including claude's subprocesses (MCP servers, tool children)
/// — so an exit derived from it arrived seconds late, or not at all. The session's
/// [`exit_waiter`] is now the **sole** emitter (exactly one `Exited` per PTY generation, which
/// the frontend's consume-once `intentionalKills` bookkeeping relies on). All this loop owes the
/// waiter is the `reader_done` flag, set **after** its last `Output` has been sent, so trailing
/// output still precedes the exit.
#[allow(clippy::too_many_arguments)]
fn reader_loop(
    id: String,
    mut reader: Box<dyn Read + Send>,
    scrollback: &Arc<Mutex<Scrollback>>,
    events: &Sender<SessionEvent>,
    state: &Arc<ActivityState>,
    base: Instant,
    activity: &Activity,
    exit: &Arc<ExitState>,
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
                // Push to scrollback and read back the running total under the SAME lock,
                // so the offset stamped on this live event exactly matches the offset the
                // scrollback snapshot reports — the invariant the frontend dedupe relies on.
                let offset = match scrollback.lock() {
                    Ok(mut sb) => {
                        sb.push(&chunk);
                        sb.total
                    }
                    // Poisoned lock: fall back to a best-effort offset so output still flows.
                    Err(_) => 0,
                };
                if events
                    .send(SessionEvent::Output {
                        id: id.clone(),
                        bytes: chunk,
                        offset,
                    })
                    .is_err()
                {
                    break; // receiver dropped (app shutting down)
                }
            }
        }
    }

    // Stop tracking activity — but only if the map still points to *our* atomic
    // (a restart with the same id may have replaced it; don't drop the new one).
    forget_activity(activity, &id, state);

    // Every `Output` for this generation has now been sent, so the waiter may emit `Exited`
    // without racing ahead of trailing output (#354). This is also how the waiter learns that
    // the PTY slave is finally free — if it stays unset, descendants are still holding it open.
    exit.reader_done.store(true, Ordering::SeqCst);
}

/// Stop tracking a session's activity stamps — but only if the map still points at **our**
/// atomic (a Restart under the same id may already have replaced it; don't drop the new one).
/// Idempotent, and called from both the reader loop and the exit waiter (#354).
fn forget_activity(activity: &Activity, id: &str, state: &Arc<ActivityState>) {
    if let Ok(mut map) = activity.lock() {
        if matches!(map.get(id), Some(a) if Arc::ptr_eq(a, state)) {
            map.remove(id);
        }
    }
}

/// Poll `flag` for up to `ms`, returning whether it became set (#354). Used to wait — bounded —
/// on the reader's EOF and on the child being reaped, without dragging in a condvar.
fn wait_flag(flag: &AtomicBool, ms: u64) -> bool {
    let deadline = Instant::now() + Duration::from_millis(ms);
    loop {
        if flag.load(Ordering::SeqCst) {
            return true;
        }
        if Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(Duration::from_millis(EXIT_POLL_MS));
    }
}

/// Best-effort SIGHUP to everything still running under this session's PTY (#354).
///
/// Unix: the child's whole **process group**. portable-pty `setsid()`s the child at spawn, so
/// `pgid == pid` and the group contains exactly its own descendants (claude's MCP servers / tool
/// children) — never anything else of ours. Safe even after the leader has been reaped: POSIX
/// keeps a pid reserved while it is still a live pgid, so the id cannot have been recycled while
/// any group member lives.
#[cfg(unix)]
fn hangup_group(pid: Option<u32>) {
    if let Some(pid) = pid.filter(|p| *p > 1) {
        unsafe { libc::killpg(pid as libc::pid_t, libc::SIGHUP) };
    }
}

/// Windows: a no-op — the ConPTY kill path is deliberately unchanged (#354). The direct child is
/// terminated by `ChildKiller::kill()` (`TerminateProcess`), exactly as before; there is no job
/// object / process-tree kill.
#[cfg(windows)]
fn hangup_group(_pid: Option<u32>) {}

/// Best-effort SIGKILL to the session's whole process group — the escalation after
/// [`hangup_group`] when the agent (or one of its descendants) ignored the hangup (#354). Same
/// unix-only pgid semantics; see [`hangup_group`].
#[cfg(unix)]
fn kill_group(pid: Option<u32>) {
    if let Some(pid) = pid.filter(|p| *p > 1) {
        unsafe { libc::killpg(pid as libc::pid_t, libc::SIGKILL) };
    }
}

/// Windows: a no-op, for the same reason as [`hangup_group`] (#354).
#[cfg(windows)]
fn kill_group(_pid: Option<u32>) {}

/// Signal a session's child — and, on unix, its whole **process group** — to die, **without
/// blocking the caller** (#354).
///
/// `kill_session` runs inside a Tauri command (and inside the #294 recurring rotation), and
/// portable-pty's unix `Child::kill()` sends SIGHUP to the *direct pid only*, then sleeps up to
/// ~200ms before escalating — a stall the user felt as "exit is slow", while claude's
/// descendants survived as orphans (#31) and kept the PTY slave open. Here the SIGHUP goes out
/// to the whole group immediately and the SIGKILL escalation runs on a short-lived detached
/// thread. The `Exited` event is still emitted (exactly once) by the session's exit waiter when
/// the child actually dies, so the frontend's `intentionalKills` bookkeeping is unchanged.
fn kill_now(session: &Session) {
    #[cfg(unix)]
    if session.pid.is_some() {
        hangup_group(session.pid);
        let pid = session.pid;
        let exit = Arc::clone(&session.exit);
        std::thread::spawn(move || {
            if !wait_flag(&exit.reaped, KILL_GRACE_MS) {
                // The child ignored SIGHUP → force it, group-wide.
                kill_group(pid);
            }
        });
        return;
    }
    // Windows (and the pathological unix child with no pid): portable-pty's killer —
    // `TerminateProcess` on Windows, i.e. exactly the pre-#354 behavior.
    if let Ok(mut killer) = session.killer.lock() {
        let _ = killer.kill();
    }
}

/// Owns a session's `Child` and turns its **real termination** into the `Exited` event (#354).
///
/// Previously the exit was derived from the reader's EOF — but on unix a PTY master only EOFs
/// once **every** holder of the slave fd is gone, and claude's subprocesses (MCP servers, tool
/// children) inherit it. So an agent that had already exited kept its card alive for seconds
/// ("instances exit slow"). `wait()` returns the moment the direct child dies, regardless of
/// those descendants.
#[allow(clippy::too_many_arguments)]
fn exit_waiter(
    id: String,
    mut child: Box<dyn Child + Send + Sync>,
    pid: Option<u32>,
    exit: Arc<ExitState>,
    events: Sender<SessionEvent>,
    state: Arc<ActivityState>,
    activity: Activity,
) {
    // 1. Block until the agent's own process terminates, and reap it. Same code mapping as
    //    before: portable-pty maps a **signal death to exit code 1**, never 0 — so a killed
    //    agent can never be misread as a clean code-0 exit and have its record forgotten (#63).
    let code = child.wait().ok().map(|status| status.exit_code() as i32);
    exit.reaped.store(true, Ordering::SeqCst);

    // 2. Give the reader a bounded moment to drain the tail and hit EOF, so trailing output
    //    still precedes `Exited`. If it doesn't EOF, descendants are still holding the PTY slave
    //    open: hang up the whole group, then escalate. (Windows: both signals are no-ops, so
    //    only the bounded wait applies.)
    if !wait_flag(&exit.reader_done, EXIT_DRAIN_MS) {
        hangup_group(pid);
        if !wait_flag(&exit.reader_done, EXIT_HUP_GRACE_MS) {
            kill_group(pid);
        }
    }

    // 3. Stop tracking activity (idempotent with the reader's own call, and guarded so a Restart
    //    under the same id keeps its fresh state).
    forget_activity(&activity, &id, &state);

    // 4. A silenced generation — app shutdown via `kill_all`, or a stale same-id respawn — emits
    //    nothing. On shutdown the persisted records MUST survive so sessions auto-resume on the
    //    next boot (#30/#63).
    if exit.silent.load(Ordering::SeqCst) {
        return;
    }
    let _ = events.send(SessionEvent::Exited { id, code });
}

/// Pure busy/idle hysteresis (#315). `active_fast` = real output within `BUSY_WINDOW_MS`
/// (already echo/has-work-guarded by the caller); `active_hold` = real output within
/// `BACKGROUND_HOLD_MS` (same guards). Mutates `st` and returns the busy value to emit.
///
/// - Normal mode: become busy on fresh `active_fast`; while busy, stay busy only while
///   `active_fast`, else settle to idle at ~`BUSY_WINDOW_MS` (snappy — a clean single turn).
/// - On the idle→busy edge, if we settled to idle within `BACKGROUND_HOLD_MS` ago, it's
///   flickering → go `sticky`.
/// - Sticky mode: stay busy while `active_hold` (bridges burst gaps up to `BACKGROUND_HOLD_MS`);
///   only settle to idle after that long fully quiet. Clearing `sticky` happens on the settle.
///
/// Note: `active_fast` implies `active_hold` (700ms ⊂ 5000ms), so entering sticky right at the
/// re-activation and then holding on `active_hold` is consistent. A genuinely quiet stretch
/// longer than `BACKGROUND_HOLD_MS` (e.g. a long single tool call with no output) legitimately
/// settles to idle — that is *not* the #315 flicker and is intentionally left to settle.
///
/// Whether the most recent output is attributable to an automatic, non-work event that
/// happened at `stamp` (a focus/mouse report #403, or a PTY resize): the event exists
/// (`stamp != 0`), it came at/after the last real keystroke (`stamp >= inp`, so an event
/// during a real turn's typing doesn't qualify), the output arrived at/after it
/// (`out >= stamp`), and did so within the event's repaint window. Shared by the monitor's
/// report- and resize-repaint attributions; pure so it's unit-testable.
fn repaint_attributable(stamp: u64, inp: u64, out: u64, window_ms: u64) -> bool {
    stamp != 0 && stamp >= inp && out >= stamp && out.saturating_sub(stamp) <= window_ms
}

/// `suppress_on` (#403) gates the **idle→busy edge only**: when it is set — the recent output is
/// attributable to a focus/mouse-report repaint or a resize-triggered repaint — a currently-idle
/// session (`!emitted`) is held idle instead of flipping to busy for a tick when a panel is
/// merely focused/hovered/reparented. An already-busy session is untouched, so #185's protection
/// of a working agent is preserved, and once the repaint window elapses (output still flowing) a
/// real turn wins on the next tick.
fn decide_busy(
    st: &mut BusyDecision,
    now: u64,
    active_fast: bool,
    active_hold: bool,
    suppress_on: bool,
) -> bool {
    let prev = st.emitted;
    let busy = if st.sticky { active_hold } else { active_fast };
    // A currently-idle session whose only recent output is a focus/mouse-report repaint
    // must NOT flip to busy (#403). Gates the idle→busy edge only: an already-busy
    // session (prev == true) is untouched, so #185's protection is preserved.
    let busy = if suppress_on && !st.emitted {
        false
    } else {
        busy
    };

    // Flicker detection: a re-activation soon after a settle → sticky (background/paused turn).
    if !prev
        && busy
        && !st.sticky
        && st.settled_at != 0
        && now.saturating_sub(st.settled_at) <= BACKGROUND_HOLD_MS
    {
        st.sticky = true;
    }
    // On the busy→idle edge, remember when we settled and leave sticky mode.
    if prev && !busy {
        st.settled_at = now;
        st.sticky = false;
    }
    st.emitted = busy;
    busy
}

/// Derives each session's busy/idle state from output activity (#42) and emits a
/// `State` event on every transition (debounced — never per tick). Runs until the
/// event receiver is dropped (app shutdown).
///
/// Two-window hysteresis (#315): a **clean single turn** settles to idle ~`BUSY_WINDOW_MS`
/// after its last output (snappy yellow "needs input"). But once a session's dot would
/// otherwise *flicker* — a background process / subagent / paused turn repainting in bursts
/// more than `BUSY_WINDOW_MS` apart, so it went quiet then re-activated within
/// `BACKGROUND_HOLD_MS` — that session goes **sticky** and holds solid blue, bridging burst
/// gaps until output has been fully quiet for `BACKGROUND_HOLD_MS`. The busy-*on* latency and
/// the #55/#116 echo/has-work guards are unchanged; the sticky decision only affects the
/// busy→idle settle.
fn monitor_loop(
    activity: Activity,
    events: Sender<SessionEvent>,
    title_tx: Sender<(String, bool)>,
    base: Instant,
) {
    // Per-session busy-decision hysteresis state (#315), so we only emit on change and can
    // hold blue through background bursts. A reused id starts fresh with a `Default`.
    let mut decisions: HashMap<String, BusyDecision> = HashMap::new();
    loop {
        std::thread::sleep(Duration::from_millis(MONITOR_TICK_MS));
        let now = base.elapsed().as_millis() as u64;
        // Snapshot the two raw guarded activity signals per session under the lock, then
        // release it before sending. Both read the same atomics; `active_fast` gates the
        // clean-turn settle, `active_hold` the sticky background hold (#315).
        let snapshot: Vec<(String, bool, bool, bool, bool)> = {
            let map = match activity.lock() {
                Ok(map) => map,
                Err(poisoned) => poisoned.into_inner(),
            };
            map.iter()
                .map(|(id, state)| {
                    let out = state.last_output.load(Ordering::Relaxed);
                    let inp = state.last_input.load(Ordering::Relaxed);
                    let rep = state.last_report.load(Ordering::Relaxed);
                    let rz = state.last_resize.load(Ordering::Relaxed);
                    let seeded = state.seeded.load(Ordering::Relaxed);
                    // Busy requires the session to actually *have work to do* (#116):
                    // either the user has submitted input (`inp != 0`) or it booted
                    // prompt-seeded (#93). So claude's pre-input startup paint on a
                    // fresh interactive session no longer reads as busy (which used
                    // to latch the #112 "needs input" yellow before any prompt).
                    let has_work = inp != 0 || seeded;
                    // Output that arrived meaningfully *after* the last keystroke, so the
                    // terminal's echo of typing doesn't read as Claude working (#55). With
                    // no keystrokes yet (inp == 0, a seeded session) any recent output counts.
                    let echo_ok = inp == 0 || out.saturating_sub(inp) >= INPUT_ECHO_MS;
                    let recent = has_work && out != 0 && echo_ok;
                    // `active_fast` = output within the fast window (a clean turn's settle);
                    // `active_hold` = within the longer sticky window (#315). fast ⊂ hold.
                    let active_fast = recent && now.saturating_sub(out) < BUSY_WINDOW_MS;
                    let active_hold = recent && now.saturating_sub(out) < BACKGROUND_HOLD_MS;
                    // The recent output is attributable to an automatic focus/mouse
                    // report's repaint (#403) or to a resize-triggered repaint (the
                    // SIGWINCH from reparenting a pooled terminal / a window drag).
                    // Either suppresses the idle→busy edge only (see `decide_busy`) —
                    // an already-busy session is untouched (#185).
                    let report_repaint = repaint_attributable(rep, inp, out, REPORT_REPAINT_MS);
                    let resize_repaint = repaint_attributable(rz, inp, out, RESIZE_REPAINT_MS);
                    (
                        id.clone(),
                        active_fast,
                        active_hold,
                        report_repaint || resize_repaint,
                        state.uses_claude_log,
                    )
                })
                .collect()
        };
        // Forget sessions that are gone (killed/exited) so a reused id starts fresh.
        let live: HashSet<&str> = snapshot.iter().map(|(id, ..)| id.as_str()).collect();
        decisions.retain(|id, _| live.contains(id.as_str()));
        for (id, active_fast, active_hold, repaint_suppress, uses_claude_log) in &snapshot {
            let st = decisions.entry(id.clone()).or_default();
            let prev = st.emitted;
            let busy = decide_busy(st, now, *active_fast, *active_hold, *repaint_suppress);
            if prev != busy {
                if events
                    .send(SessionEvent::State {
                        id: id.clone(),
                        busy,
                    })
                    .is_err()
                {
                    return; // receiver dropped (app shutting down)
                }
                // Poke the title worker on BOTH edges, off the hot path. The
                // busy→idle settle re-reads claude's freshly (re)written `ai-title`
                // (#97); the idle→busy onset arms the same ~30s re-read burst so a
                // mid-turn `EnterWorktree` surfaces the session's new `cwd` (the
                // relocation signal) while the agent is still working, not only at
                // settle. Reads are per-id change-deduped, so the extra edge costs
                // nothing when nothing changed. Best-effort: a dead worker never
                // stalls the monitor tick.
                let _ = title_tx.send((id.clone(), *uses_claude_log));
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
    let mut last_cwd: HashMap<String, String> = HashMap::new();
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
            if read_and_emit_title(
                &id,
                uses_claude_log,
                &events,
                &mut last,
                &mut last_forkable,
                &mut last_cwd,
            )
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
    last_cwd: &mut HashMap<String, String>,
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
    // Current working directory (agent relocation): the log tail's `cwd` moves
    // when the agent enters/leaves a worktree. Read BEFORE the title bail-out —
    // a session may have a cwd (every line carries one) long before any
    // `ai-title` materializes. Emitted on change only, like the title.
    if let Some(cwd) = crate::title::read_session_cwd(id) {
        if last_cwd.get(id) != Some(&cwd) {
            last_cwd.insert(id.to_string(), cwd.clone());
            if events
                .send(SessionEvent::Cwd {
                    id: id.to_string(),
                    cwd,
                })
                .is_err()
            {
                return Err(());
            }
        }
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
/// (fallback `/bin/zsh` on macOS, `/bin/bash`→`/bin/sh` on Linux) on unix; PowerShell —
/// `pwsh.exe`, else `powershell.exe`, else `%COMSPEC%`/`cmd.exe` — on Windows.
fn default_shell() -> String {
    // macOS: `$SHELL` else `/bin/zsh` — byte-for-byte the original behavior.
    #[cfg(target_os = "macos")]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
    }
    // Other unix (Linux/BSD, #345): delegate to the testable helper below.
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        non_macos_unix_shell()
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

/// Linux/BSD default plain-terminal shell (#345): the user's `$SHELL` (essentially
/// always set in a desktop session), else the first existing of `/bin/bash`, `/bin/sh`
/// — `/bin/zsh` (the macOS fallback) is not a safe Linux default (often not installed).
/// Gated `any(<linux/bsd>, test)` so the macOS host still type-checks + unit-tests it
/// even though the real build arm isn't compiled there.
#[cfg(any(all(unix, not(target_os = "macos")), test))]
fn non_macos_unix_shell() -> String {
    if let Ok(shell) = std::env::var("SHELL") {
        if !shell.is_empty() {
            return shell;
        }
    }
    for candidate in ["/bin/bash", "/bin/sh"] {
        if std::path::Path::new(candidate).exists() {
            return candidate.to_string();
        }
    }
    "/bin/sh".to_string()
}

/// Resolve `program` to an executable path via `PATH` (or a direct path). Unix:
/// the historic behavior (a `/` means a direct path; otherwise scan `PATH`).
///
/// The PATH comes from `path_env::effective_path()`, **not** the process env (#360): on
/// a GUI launch the restored login-shell PATH is resolved by a background probe, and
/// this is the gate that waits for it — finding `claude` outranks a bounded wait, and it
/// only ever waits on a cache-miss boot. In debug builds and on Windows no probe arms,
/// so it is exactly this process's own PATH, as before.
#[cfg(unix)]
pub(crate) fn find_on_path(program: &str) -> Option<PathBuf> {
    if program.contains('/') {
        let direct = PathBuf::from(program);
        return is_executable(&direct).then_some(direct);
    }
    let paths = crate::path_env::effective_path()?;
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
pub(crate) fn find_on_path(program: &str) -> Option<PathBuf> {
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
    // Same seam as the unix arm (#360) — on Windows no probe ever arms, so this is the
    // process's own (registry-inherited) PATH and resolution is unchanged (#140).
    let paths = crate::path_env::effective_path()?;
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

    // --- Linux/BSD default-shell fallback (#345) ---
    // Runs on every OS (the helper is `test`-widened) so the macOS host type-checks the
    // Linux arm. It must always yield a non-empty shell: `$SHELL` when set, else an
    // existing `/bin/bash`/`/bin/sh` (or the `/bin/sh` last resort).
    #[test]
    fn non_macos_unix_shell_is_never_empty() {
        assert!(!non_macos_unix_shell().is_empty());
    }

    // --- Global search: ANSI strip + output line matching (#337) ---

    #[test]
    fn strip_ansi_removes_color_and_cursor_codes_keeps_text() {
        // A CSI color sequence around plain text.
        assert_eq!(strip_ansi("\u{1b}[31mhello\u{1b}[0m world"), "hello world");
        // A cursor-move CSI (final byte `H`) is dropped, text preserved.
        assert_eq!(strip_ansi("\u{1b}[2;5Hfoo"), "foo");
        // An OSC title set terminated by BEL is dropped.
        assert_eq!(strip_ansi("\u{1b}]0;my title\u{07}bar"), "bar");
        // An OSC terminated by ST (ESC \) is dropped.
        assert_eq!(strip_ansi("\u{1b}]0;t\u{1b}\\baz"), "baz");
        // Plain text (incl. newline / tab) survives untouched.
        assert_eq!(strip_ansi("a\tb\nc"), "a\tb\nc");
        // A lone C0 control (e.g. BEL) is dropped, not emitted.
        assert_eq!(strip_ansi("x\u{07}y"), "xy");
    }

    #[test]
    fn strip_ansi_cursor_forward_becomes_spaces() {
        // A cursor-forward move (CUF, final byte `C`) approximates claude's column spacing:
        // `A\u{1b}[3CB` is visually `A   B`, so it emits 3 spaces instead of collapsing to `AB`.
        assert_eq!(strip_ansi("A\u{1b}[3CB"), "A   B");
        // An empty parameter defaults to 1 space.
        assert_eq!(strip_ansi("A\u{1b}[CB"), "A B");
        // A pathological parameter clamps to CURSOR_FORWARD_SPACE_CAP (never balloons).
        let huge = strip_ansi("A\u{1b}[999999CB");
        assert_eq!(huge, format!("A{}B", " ".repeat(CURSOR_FORWARD_SPACE_CAP)));
        // Every OTHER CSI final byte still emits nothing — a cursor-position move stays fully
        // removed (guards against over-eager parameter parsing spilling spaces).
        assert_eq!(strip_ansi("\u{1b}[2;5Hfoo"), "foo");
    }

    #[test]
    fn strip_ansi_cursor_forward_enables_phrase_match() {
        // End-to-end fidelity win: claude spaces words with a non-erasing single CUF
        // (`ESC[1C`), so `A\u{1b}[1CB` is visually `A B`. After CUF→spaces the user's typed
        // phrase (`a b`) matches, where the old wholesale-drop collapsed it to `AB` and
        // missed. (A wider `ESC[3C` gap emits the literal `A   B` — searchable at that exact
        // spacing — this asserts the common single-space case a user would actually type.)
        let stripped = strip_ansi("A\u{1b}[1CB");
        assert_eq!(stripped, "A B");
        let hits = match_output_lines(&stripped, "a b", 5, OUTPUT_SNIPPET_MAX_CHARS);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].0, 1);
    }

    #[test]
    fn match_output_lines_is_case_insensitive_with_line_numbers() {
        let text = "First line\nSecond has NEEDLE here\nthird needle again\nnothing";
        let hits = match_output_lines(text, "needle", 10, OUTPUT_SNIPPET_MAX_CHARS);
        assert_eq!(hits.len(), 2);
        // 1-based line numbers, case-insensitive match.
        assert_eq!(hits[0].0, 2);
        assert!(hits[0].1.contains("NEEDLE"));
        assert_eq!(hits[1].0, 3);
        assert!(hits[1].1.contains("needle"));
    }

    #[test]
    fn match_output_lines_caps_per_session_and_ignores_blank_needle() {
        let text = "match a\nmatch b\nmatch c";
        let hits = match_output_lines(text, "match", 2, OUTPUT_SNIPPET_MAX_CHARS);
        assert_eq!(hits.len(), 2, "per-session cap honored");
        // A blank needle yields nothing (never every line).
        assert!(match_output_lines(text, "", 10, OUTPUT_SNIPPET_MAX_CHARS).is_empty());
    }

    #[test]
    fn match_output_lines_windows_long_lines_around_the_match() {
        let prefix = "z".repeat(400);
        let line = format!("{prefix}NEEDLE{}", "z".repeat(400));
        let hits = match_output_lines(&line, "needle", 5, OUTPUT_SNIPPET_MAX_CHARS);
        assert_eq!(hits.len(), 1);
        let snip = &hits[0].1;
        // Windowed: contains the match, is clamped, and has ellipsis markers.
        assert!(snip.to_lowercase().contains("needle"));
        assert!(snip.chars().count() <= OUTPUT_SNIPPET_MAX_CHARS + 2);
        assert!(snip.contains('…'));
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

    // Busy/idle hysteresis (#315). These drive the pure `decide_busy` directly with
    // synthetic `now` / `active_fast` / `active_hold`, so there are no threads or real
    // timing — they run on every platform alongside the other pure-logic tests.

    #[test]
    fn decide_busy_settles_a_clean_turn_fast() {
        // A normal single turn: continuous output, then quiet ONCE (no re-activation) →
        // settles the instant `active_fast` drops (~BUSY_WINDOW_MS), and never goes sticky.
        let mut st = BusyDecision::default();
        // Output flowing → busy (fast window active; hold is a superset, also active).
        assert!(decide_busy(&mut st, 1_000, true, true, false));
        assert!(st.emitted);
        assert!(!st.sticky);
        // Quiet past the fast window but within the hold window, and NO prior settle to
        // re-activate against → settles to idle immediately, staying in normal mode.
        assert!(!decide_busy(&mut st, 1_800, false, true, false));
        assert!(!st.emitted);
        assert!(!st.sticky, "a clean single turn must not go sticky");
        assert_eq!(st.settled_at, 1_800);
    }

    #[test]
    fn decide_busy_holds_blue_through_background_bursts() {
        let mut st = BusyDecision::default();
        // First turn goes busy, then settles once (records settled_at).
        assert!(decide_busy(&mut st, 1_000, true, true, false));
        assert!(!decide_busy(&mut st, 1_800, false, true, false));
        assert_eq!(st.settled_at, 1_800);
        assert!(!st.sticky);
        // A quick re-activation within BACKGROUND_HOLD_MS of that settle → flicker → sticky.
        assert!(decide_busy(&mut st, 2_400, true, true, false));
        assert!(st.sticky, "a quick re-activation must arm sticky mode");
        assert!(st.emitted);
        // Now background bursts arrive >BUSY_WINDOW_MS apart: each tick is quiet on the fast
        // window but still active on the hold window. Busy must stay TRUE throughout — no
        // blue→yellow→blue flicker.
        for now in [3_400_u64, 4_400, 5_400, 6_400] {
            assert!(
                decide_busy(&mut st, now, false, true, false),
                "sticky must hold blue through burst gaps (now={now})"
            );
            assert!(st.emitted);
            assert!(st.sticky);
        }
        // Finally fully quiet past the hold window → emits false exactly once, sticky cleared.
        assert!(!decide_busy(&mut st, 12_000, false, false, false));
        assert!(!st.emitted);
        assert!(!st.sticky, "settling clears sticky mode");
        assert_eq!(st.settled_at, 12_000);
    }

    #[test]
    fn decide_busy_first_activation_is_not_sticky() {
        // A session's very first busy edge has no prior settle (settled_at == 0) and must
        // enter NORMAL mode, never be mis-read as flicker.
        let mut st = BusyDecision::default();
        assert_eq!(st.settled_at, 0);
        assert!(decide_busy(&mut st, 500, true, true, false));
        assert!(st.emitted);
        assert!(!st.sticky, "the first activation must not be sticky");
    }

    #[test]
    fn decide_busy_fresh_turn_after_long_idle_is_not_sticky() {
        let mut st = BusyDecision::default();
        // A turn runs and settles at t.
        assert!(decide_busy(&mut st, 1_000, true, true, false));
        assert!(!decide_busy(&mut st, 1_800, false, true, false));
        let settled = st.settled_at;
        assert_eq!(settled, 1_800);
        // A brand-new turn starts well beyond BACKGROUND_HOLD_MS later → NOT flicker, so it
        // stays in normal mode and settles fast on the next quiet tick.
        let later = settled + BACKGROUND_HOLD_MS + 1;
        assert!(decide_busy(&mut st, later, true, true, false));
        assert!(!st.sticky, "a fresh turn after a long idle is not flicker");
        // Next quiet on the fast window → settles immediately (snappy), still not sticky.
        assert!(!decide_busy(&mut st, later + 800, false, true, false));
        assert!(!st.emitted);
        assert!(!st.sticky);
    }

    #[test]
    fn decide_busy_report_repaint_does_not_wake_an_idle_session() {
        // An IDLE agent (dot yellow) is focused/hovered: claude repaints once in response
        // to the focus report, so `active_fast` reads true for a tick — but the output is
        // attributable to the report (`suppress_on = true`). The dot must stay idle (#403):
        // no idle→busy edge, so the Attention queue never removes-and-re-adds the card.
        let mut st = BusyDecision::default();
        assert!(
            !decide_busy(&mut st, 1_000, true, true, true),
            "a focus-report repaint must not flip an idle session to busy"
        );
        assert!(!st.emitted);
        assert!(!st.sticky);
        assert_eq!(st.settled_at, 0, "no phantom settle was recorded");
    }

    #[test]
    fn decide_busy_report_repaint_leaves_a_working_session_busy() {
        // A BUSY agent (continuous output) is focused. The focus report fires while it is
        // already working, so even though `suppress_on = true` this tick, an already-busy
        // session must stay busy — #185's protection of a working agent is preserved. The
        // suppression gates the idle→busy edge only, never a busy→busy hold.
        let mut st = BusyDecision::default();
        assert!(decide_busy(&mut st, 1_000, true, true, false)); // real work → busy
        assert!(st.emitted);
        assert!(
            decide_busy(&mut st, 1_100, true, true, true),
            "a report during ongoing work must keep the dot blue"
        );
        assert!(st.emitted);
    }

    #[test]
    fn decide_busy_without_suppression_still_goes_busy() {
        // Sanity contrast: the very same fresh `active_fast` tick with `suppress_on = false`
        // (no report attribution) still turns the dot blue — genuine work is never suppressed.
        let mut st = BusyDecision::default();
        assert!(decide_busy(&mut st, 1_000, true, true, false));
        assert!(st.emitted);
    }

    #[test]
    fn decide_busy_real_turn_wins_after_report_window_elapses() {
        // A real turn that *starts* with a focus report (e.g. the user clicks in, then the
        // agent works): the first tick is suppressed (report-attributed), but once the
        // report-repaint window elapses the output keeps flowing and `suppress_on` turns
        // false — the next tick must flip to busy. Genuine sustained work always wins.
        let mut st = BusyDecision::default();
        assert!(
            !decide_busy(&mut st, 1_000, true, true, true),
            "the report-attributed first tick is suppressed"
        );
        assert!(!st.emitted);
        // Output is still flowing a beat later, now beyond the report-repaint window, so the
        // monitor no longer attributes it to the report (`suppress_on = false`).
        assert!(
            decide_busy(&mut st, 1_400, true, true, false),
            "a sustained burst past the report window must go busy"
        );
        assert!(st.emitted);
    }

    // The shared repaint-attribution math (focus/mouse reports #403 + PTY resizes).
    // Pure — drives `repaint_attributable` directly, no threads or real timing.

    #[test]
    fn repaint_attributable_requires_an_event() {
        // No report/resize ever happened (stamp == 0, the sentinel) → output is never
        // attributed to one, whatever the other timestamps say.
        assert!(!repaint_attributable(0, 0, 1_000, RESIZE_REPAINT_MS));
        assert!(!repaint_attributable(0, 500, 1_000, REPORT_REPAINT_MS));
    }

    #[test]
    fn repaint_attributable_ignores_an_event_before_the_last_keystroke() {
        // The event predates the last real keystroke (stamp < inp): the user typed
        // *after* it, so the following output is a real turn, never event-attributed.
        assert!(!repaint_attributable(
            1_000,
            1_500,
            1_600,
            RESIZE_REPAINT_MS
        ));
    }

    #[test]
    fn repaint_attributable_ignores_output_before_the_event() {
        // The last output predates the event (out < stamp): nothing repainted yet, so
        // there is nothing to attribute (and nothing to suppress).
        assert!(!repaint_attributable(2_000, 0, 1_500, RESIZE_REPAINT_MS));
    }

    #[test]
    fn repaint_attributable_within_the_window() {
        // Output lands shortly after the event → attributed (suppressed on the idle edge).
        assert!(repaint_attributable(1_000, 0, 1_400, RESIZE_REPAINT_MS));
        // Boundary: exactly at the window edge still counts (<=).
        assert!(repaint_attributable(
            1_000,
            0,
            1_000 + RESIZE_REPAINT_MS,
            RESIZE_REPAINT_MS
        ));
        // An event stamped at/after the keystroke qualifies too (stamp >= inp).
        assert!(repaint_attributable(1_000, 1_000, 1_200, REPORT_REPAINT_MS));
    }

    #[test]
    fn repaint_attributable_expires_past_the_window() {
        // Output still flowing beyond the window is a genuine turn — attribution ends,
        // so sustained real work always wins on the next monitor tick.
        assert!(!repaint_attributable(
            1_000,
            0,
            1_001 + RESIZE_REPAINT_MS,
            RESIZE_REPAINT_MS
        ));
    }

    #[test]
    fn scrollback_is_bounded_and_keeps_the_tail() {
        let mut sb = Scrollback::new(8);
        sb.push(b"abcdef");
        sb.push(b"ghij");
        let (snapshot, end) = sb.snapshot();
        assert_eq!(snapshot.len(), 8);
        assert_eq!(&snapshot, b"cdefghij");
        // `total` counts ALL bytes ever pushed (6 + 4), even the 2 evicted — so it's the
        // absolute end-offset the live stream and the dedupe agree on.
        assert_eq!(end, 10);
    }

    #[test]
    fn scrollback_total_is_monotonic_across_eviction() {
        let mut sb = Scrollback::new(4);
        sb.push(b"aaaa");
        sb.push(b"bbbb");
        sb.push(b"cc");
        let (snapshot, end) = sb.snapshot();
        // Only the last 4 bytes are retained, but `total` keeps counting.
        assert_eq!(&snapshot, b"bbcc");
        assert_eq!(end, 10);
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
    fn custom_agent_with_no_command_is_a_clear_spawn_error() {
        // Custom (#325) with no command must fail with a clear `Spawn` error, not a
        // phantom `"custom"` binary lookup (which would read as BinaryNotFound).
        let (mgr, _rx) = manager();
        let err = mgr
            .spawn_session_with_prompt(tmp(), None, None, "custom", None, None)
            .unwrap_err();
        assert!(matches!(err, SessionError::Spawn(_)));
        // An all-whitespace command tokenizes to nothing → also a Spawn error.
        let err = mgr
            .spawn_session_with_prompt(tmp(), None, None, "custom", Some("   "), None)
            .unwrap_err();
        assert!(matches!(err, SessionError::Spawn(_)));
    }

    #[test]
    fn custom_agent_resolves_the_parsed_program_on_path() {
        // A custom command whose program isn't on PATH surfaces the SAME typed
        // BinaryNotFound the built-in agents do, naming the parsed program — so the
        // ClaudeMissing banner can name it (#325). Args after the program don't change
        // that; the parse is exercised directly in agents.rs's tokenizer tests.
        let (mgr, _rx) = manager();
        let err = mgr
            .spawn_session_with_prompt(
                tmp(),
                None,
                Some("do a thing"),
                "custom",
                Some("recue-nonexistent-custom-xyz --flag"),
                None,
            )
            .unwrap_err();
        match err {
            SessionError::BinaryNotFound(program) => {
                assert_eq!(program, "recue-nonexistent-custom-xyz");
            }
            other => panic!("expected BinaryNotFound(program), got {other:?}"),
        }
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
                Ok(SessionEvent::Cwd { .. }) => {}
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

    // --- Fast, reliable exit + process-group kill (#354) ---

    /// True once **nothing** is left in `pid`'s process group: `killpg(pgid, 0)` — the
    /// existence probe, which delivers no signal — fails (ESRCH). On unix `pid` is also the
    /// pgid, because portable-pty `setsid()`s the child at spawn.
    #[cfg(unix)]
    fn group_gone(pid: u32) -> bool {
        unsafe { libc::killpg(pid as libc::pid_t, 0) != 0 }
    }

    /// Poll `pred` until it holds or `timeout` elapses; returns whether it held.
    #[cfg(unix)]
    fn wait_until(mut pred: impl FnMut() -> bool, timeout: Duration) -> bool {
        let deadline = Instant::now() + timeout;
        loop {
            if pred() {
                return true;
            }
            if Instant::now() >= deadline {
                return false;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
    }

    /// The stand-in for a lingering claude subprocess (an MCP server / tool child): a
    /// backgrounded 30s `sleep` that **inherits the PTY slave** and **ignores SIGHUP** (an
    /// ignored disposition survives fork+exec).
    ///
    /// The `trap` is load-bearing, not paranoia: when a session leader holding a controlling
    /// terminal dies, the kernel SIGHUPs its foreground process group — so a *plain* background
    /// child is killed for us and the master EOFs anyway, and a test using one would pass even
    /// against the pre-#354 code (verified). A descendant that shrugs the hangup off is the
    /// reported case: the master then never EOFs at all (verified), the old EOF-driven `Exited`
    /// never arrives, and the pid-only kill leaves it orphaned (#31).
    #[cfg(unix)]
    const STUBBORN_DESCENDANT: &str = r#"(trap "" HUP; sleep 30) &"#;

    /// A PTY master only reports EOF once **every** holder of the slave fd is gone — and
    /// claude's subprocesses inherit it. So the old EOF-driven exit kept an already-exited
    /// agent's card alive for seconds ("instances exit slow"). Here `sh` leaves a
    /// [`STUBBORN_DESCENDANT`] behind and exits 0: the `Exited` event must still arrive promptly
    /// (#354 — pre-fix the reader stayed blocked and it never came), still **after** the
    /// trailing output, and the descendant must be cleaned up rather than orphaned (#31).
    #[cfg(unix)]
    #[test]
    fn exit_is_reported_even_when_descendants_hold_the_pty() {
        let (mgr, rx) = manager();
        let script = format!("{STUBBORN_DESCENDANT} printf bye; exit 0");
        let info = mgr
            .spawn_program("sh", &["-c", &script], &tmp(), None)
            .expect("spawn sh");
        let pid = mgr.session_pid(&info.id).expect("session pid");

        let started = Instant::now();
        let mut output = Vec::new();
        let exit = loop {
            match rx.recv_timeout(Duration::from_secs(5)) {
                Ok(SessionEvent::Output { bytes, .. }) => output.extend(bytes),
                Ok(SessionEvent::Exited { code, .. }) => break code,
                Ok(_) => {}
                Err(_) => panic!("timed out waiting for the exit event"),
            }
        };
        assert_eq!(exit, Some(0));
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "the exit must not wait on the lingering descendant"
        );
        // Trailing output still precedes `Exited` (the waiter waits on the reader's EOF).
        assert!(String::from_utf8_lossy(&output).contains("bye"));
        // …and the descendant that was holding the slave open is hung up, not orphaned (#31).
        assert!(
            wait_until(|| group_gone(pid), Duration::from_secs(3)),
            "the child's process group must be gone"
        );
    }

    /// `kill_session` must return **immediately** (portable-pty's `Child::kill()` sleeps ~200ms
    /// before escalating, inside the Tauri command), free the slot, and take out the child's
    /// **whole process group** — pre-#354 it SIGHUPed the direct pid only, so a
    /// [`STUBBORN_DESCENDANT`] survived as an orphan (#31). It emits **exactly one** `Exited`
    /// (the frontend consumes its `intentionalKills` flag once), whose code is **never**
    /// `Some(0)`: portable-pty maps a signal death to 1, so `isCleanExit` can never auto-forget
    /// a killed agent's record (#63).
    #[cfg(unix)]
    #[test]
    fn kill_session_is_prompt_and_kills_the_whole_group() {
        let (mgr, rx) = manager();
        let script = format!("{STUBBORN_DESCENDANT} cat");
        let info = mgr
            .spawn_program("sh", &["-c", &script], &tmp(), None)
            .expect("spawn sh");
        let pid = mgr.session_pid(&info.id).expect("session pid");
        // Let the shell get as far as backgrounding the `sleep`.
        std::thread::sleep(Duration::from_millis(300));

        let started = Instant::now();
        mgr.kill_session(&info.id).expect("kill");
        let elapsed = started.elapsed();
        assert!(
            elapsed < Duration::from_millis(150),
            "kill_session must not block the caller (took {elapsed:?})"
        );
        assert_eq!(mgr.session_count(), 0);
        assert!(
            wait_until(|| group_gone(pid), Duration::from_secs(3)),
            "the child AND its backgrounded descendant must be gone"
        );

        let mut exits = Vec::new();
        let deadline = Instant::now() + Duration::from_millis(1500);
        while Instant::now() < deadline {
            if let Ok(SessionEvent::Exited { code, .. }) =
                rx.recv_timeout(Duration::from_millis(100))
            {
                exits.push(code);
            }
        }
        assert_eq!(exits.len(), 1, "exactly one Exited per PTY generation");
        assert_ne!(
            exits[0],
            Some(0),
            "a killed agent must never read as a clean (record-deleting) exit"
        );
    }

    /// App shutdown (`kill_all`) must be **silent** (#354): now that the exit fires promptly, an
    /// `Exited` could reach the still-live webview, and an agent that exits 0 on SIGHUP would
    /// read as a clean exit — `isCleanExit` would delete its persisted record and the session
    /// would NOT come back on the next launch. A quit keeps sessions (#30/#63). It must still
    /// empty the registry and leave no orphaned process group (#31).
    #[cfg(unix)]
    #[test]
    fn kill_all_is_silent_and_leaves_no_process_group() {
        let (mgr, rx) = manager();
        let script = format!("{STUBBORN_DESCENDANT} cat");
        let one = mgr
            .spawn_program("sh", &["-c", &script], &tmp(), None)
            .expect("spawn one");
        let two = mgr
            .spawn_program("sh", &["-c", &script], &tmp(), None)
            .expect("spawn two");
        let pid_one = mgr.session_pid(&one.id).expect("pid one");
        let pid_two = mgr.session_pid(&two.id).expect("pid two");
        std::thread::sleep(Duration::from_millis(300));

        mgr.kill_all();
        assert_eq!(mgr.session_count(), 0);
        assert!(
            wait_until(
                || group_gone(pid_one) && group_gone(pid_two),
                Duration::from_secs(3)
            ),
            "no orphaned process group may survive a quit"
        );

        let deadline = Instant::now() + Duration::from_secs(1);
        while Instant::now() < deadline {
            if let Ok(SessionEvent::Exited { .. }) = rx.recv_timeout(Duration::from_millis(100)) {
                panic!("kill_all must emit no Exited — the persisted records would be deleted");
            }
        }
    }

    /// The standing regression guard for the bounded-parallel boot resume (#355): four
    /// threads spawn through **one** `SessionManager` at once. Every session must register
    /// under its own id and stream its own `Output` + a final `Exited` — no lost, doubled,
    /// or cross-wired events, no wedged reader thread. (Concurrent spawns are safe because
    /// `spawn_with_id` holds the map lock only for the O(1) insert (#260) and `portable-pty`
    /// cloexecs both pty fds and closes every fd ≥ 3 in the child's `pre_exec`, so one
    /// thread's fresh pty can never leak into another thread's `fork`.)
    #[cfg(unix)]
    #[test]
    fn concurrent_spawns_register_every_session() {
        const N: usize = 4;
        let (tx, rx) = mpsc::channel();
        let mgr = Arc::new(SessionManager::new(tx));

        let spawns: Vec<_> = (0..N)
            .map(|_| {
                let mgr = Arc::clone(&mgr);
                std::thread::spawn(move || {
                    mgr.spawn_program("sh", &["-c", "printf 'hi-from-pty'"], &tmp(), None)
                        .expect("concurrent spawn sh")
                        .id
                })
            })
            .collect();
        let ids: Vec<String> = spawns
            .into_iter()
            .map(|handle| handle.join().expect("spawn thread"))
            .collect();

        let unique: HashSet<&String> = ids.iter().collect();
        assert_eq!(unique.len(), N, "each spawn must get its own id");
        assert_eq!(mgr.session_count(), N, "every session must be registered");

        // Drain until every session has exited (or we time out), collecting per-id output.
        let mut output: HashMap<String, Vec<u8>> = HashMap::new();
        let mut exited: HashSet<String> = HashSet::new();
        let deadline = Instant::now() + Duration::from_secs(10);
        while exited.len() < N && Instant::now() < deadline {
            match rx.recv_timeout(Duration::from_millis(250)) {
                Ok(SessionEvent::Output { id, bytes, .. }) => {
                    output.entry(id).or_default().extend(bytes);
                }
                Ok(SessionEvent::Exited { id, code }) => {
                    assert_eq!(code, Some(0), "clean exit for {id}");
                    assert!(exited.insert(id), "a session exited twice");
                }
                Ok(_) => {}
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }

        assert_eq!(
            exited.len(),
            N,
            "timed out waiting for every session to exit"
        );
        for id in &ids {
            assert!(exited.contains(id), "no Exited event for {id}");
            let bytes = output.get(id).cloned().unwrap_or_default();
            assert!(
                String::from_utf8_lossy(&bytes).contains("hi-from-pty"),
                "no output for {id}"
            );
        }
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
        let (snapshot, end) = mgr.scrollback(&info.id).expect("scrollback");
        assert!(String::from_utf8_lossy(&snapshot).contains("scrollback-marker"));
        // The end-offset covers at least the replayed bytes (the dedupe invariant).
        assert!(end >= snapshot.len() as u64 && end >= "scrollback-marker".len() as u64);
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

    #[cfg(unix)]
    #[test]
    fn focus_report_stamps_last_report_not_last_input() {
        // #403: an automatic focus/mouse report is recorded in `last_report` (so the
        // monitor can attribute a focus-triggered repaint to it) but must NOT stamp
        // `last_input` (#185 preserved). A real keystroke does the opposite.
        let (mgr, _rx) = manager();
        let info = mgr
            .spawn_program("sh", &["-c", "sleep 2"], &tmp(), None)
            .expect("spawn sh");

        mgr.write_stdin(&info.id, "\x1b[I")
            .expect("write focus report");
        {
            let map = mgr.activity.lock().expect("activity lock");
            let st = map.get(&info.id).expect("activity state");
            assert!(
                st.last_report.load(Ordering::Relaxed) > 0,
                "a focus report must stamp last_report (#403)"
            );
            assert_eq!(
                st.last_input.load(Ordering::Relaxed),
                0,
                "a focus report must NOT stamp last_input (#185)"
            );
        }

        // A real keystroke stamps last_input and leaves last_report as it was.
        let report_at = {
            let map = mgr.activity.lock().expect("activity lock");
            map.get(&info.id)
                .unwrap()
                .last_report
                .load(Ordering::Relaxed)
        };
        mgr.write_stdin(&info.id, "x").expect("write keystroke");
        {
            let map = mgr.activity.lock().expect("activity lock");
            let st = map.get(&info.id).expect("activity state");
            assert!(
                st.last_input.load(Ordering::Relaxed) > 0,
                "a real keystroke must stamp last_input (#55)"
            );
            assert_eq!(
                st.last_report.load(Ordering::Relaxed),
                report_at,
                "a real keystroke must not touch last_report"
            );
        }
        let _ = mgr.kill_session(&info.id);
    }

    #[cfg(unix)]
    #[test]
    fn resize_repaint_does_not_wake_an_idle_session() {
        // The Attention-queue "blink": reparenting a pooled terminal into a
        // differently-sized slot (entering the Attention agent pane, a window drag)
        // fires `resize_pty` → SIGWINCH → the TUI repaints. That repaint used to read
        // as fresh work and flip a confirmed-idle agent busy for a settle cycle —
        // ejecting it from the Attention queue the instant it surfaced. It is now
        // attributed to the resize (`last_resize` + `RESIZE_REPAINT_MS`) and must not
        // produce an idle→busy edge.
        let (mgr, rx) = manager();
        // Seeded (#116) so the startup print reads as work; the trap then repaints on
        // SIGWINCH the way a full-screen TUI does. The short-sleep loop lets sh run
        // the trap promptly (traps run between commands).
        let info = mgr
            .spawn_program_seeded(
                "sh",
                &[
                    "-c",
                    "trap 'printf winch-repaint' WINCH; printf go; \
                     i=0; while [ $i -lt 60 ]; do sleep 0.1; i=$((i+1)); done",
                ],
                &tmp(),
            )
            .expect("spawn sh");

        // The seeded startup output reads busy, then settles idle (~BUSY_WINDOW_MS).
        let mut saw_busy = false;
        let deadline = Instant::now() + Duration::from_secs(2);
        while Instant::now() < deadline && !saw_busy {
            if let Ok(SessionEvent::State { busy: true, .. }) =
                rx.recv_timeout(Duration::from_millis(100))
            {
                saw_busy = true;
            }
        }
        assert!(saw_busy, "seeded startup output should read as busy");
        let mut saw_idle = false;
        let deadline = Instant::now() + Duration::from_secs(3);
        while Instant::now() < deadline && !saw_idle {
            if let Ok(SessionEvent::State { busy: false, .. }) =
                rx.recv_timeout(Duration::from_millis(100))
            {
                saw_idle = true;
            }
        }
        assert!(saw_idle, "the session should settle idle before the resize");

        // Resize to a size different from the spawn size — the kernel delivers
        // SIGWINCH only on an actual change.
        mgr.resize_pty(&info.id, DEFAULT_COLS - 20, DEFAULT_ROWS - 5)
            .expect("resize pty");

        // The trap's repaint lands within `RESIZE_REPAINT_MS` of the stamp; watch well
        // past both it and a monitor tick — no busy edge may appear.
        let mut woke = false;
        let watch = Instant::now() + Duration::from_millis(1_200);
        while Instant::now() < watch {
            if let Ok(SessionEvent::State { busy: true, .. }) =
                rx.recv_timeout(Duration::from_millis(100))
            {
                woke = true;
                break;
            }
        }
        // Prove the repaint actually happened (the suppression was exercised rather
        // than the signal never arriving): the trap's marker is in the scrollback.
        let (bytes, _) = mgr.scrollback(&info.id).expect("scrollback");
        let repainted = String::from_utf8_lossy(&bytes).contains("winch-repaint");
        let _ = mgr.kill_session(&info.id);
        assert!(repainted, "the SIGWINCH trap should have repainted");
        assert!(
            !woke,
            "a resize-triggered repaint must not flip an idle session to busy"
        );
    }

    #[cfg(unix)]
    #[test]
    fn resize_stamps_last_resize_not_last_input() {
        // A `resize_pty` is recorded in `last_resize` (so the monitor can attribute the
        // SIGWINCH repaint to it) but must never stamp `last_input` (it is not a
        // keystroke — it must not create #116 "work to do" or an #55 echo window), and a
        // real keystroke must leave `last_resize` untouched.
        let (mgr, _rx) = manager();
        let info = mgr
            .spawn_program("sh", &["-c", "sleep 2"], &tmp(), None)
            .expect("spawn sh");

        mgr.resize_pty(&info.id, DEFAULT_COLS - 10, DEFAULT_ROWS)
            .expect("resize pty");
        let resize_at = {
            let map = mgr.activity.lock().expect("activity lock");
            let st = map.get(&info.id).expect("activity state");
            assert_eq!(
                st.last_input.load(Ordering::Relaxed),
                0,
                "a resize must NOT stamp last_input"
            );
            let at = st.last_resize.load(Ordering::Relaxed);
            assert!(at > 0, "a resize must stamp last_resize");
            at
        };

        mgr.write_stdin(&info.id, "x").expect("write keystroke");
        {
            let map = mgr.activity.lock().expect("activity lock");
            let st = map.get(&info.id).expect("activity state");
            assert!(
                st.last_input.load(Ordering::Relaxed) > 0,
                "a real keystroke must stamp last_input (#55)"
            );
            assert_eq!(
                st.last_resize.load(Ordering::Relaxed),
                resize_at,
                "a real keystroke must not touch last_resize"
            );
        }
        let _ = mgr.kill_session(&info.id);
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

    // --- coalesce_output_events (#346) ---

    /// An `Output` event whose `offset` is the absolute END offset of the chunk
    /// (matching the reader thread: offset = running total after the push).
    fn out_ev(id: &str, bytes: &[u8], offset: u64) -> SessionEvent {
        SessionEvent::Output {
            id: id.into(),
            bytes: bytes.to_vec(),
            offset,
        }
    }

    #[test]
    fn coalesce_merges_consecutive_contiguous_same_session_outputs() {
        let merged = coalesce_output_events(vec![
            out_ev("a", b"he", 2),
            out_ev("a", b"llo", 5),
            out_ev("a", b" world", 11),
        ]);
        assert_eq!(merged, vec![out_ev("a", b"hello world", 11)]);
    }

    #[test]
    fn coalesce_keeps_last_offset_so_start_math_is_preserved() {
        // The frontend dedupe computes `start = offset - bytes.length`
        // (replayDedupe.ts); a merged run must yield the FIRST chunk's start.
        let merged = coalesce_output_events(vec![
            out_ev("a", b"xyz", 103), // start = 100
            out_ev("a", b"pq", 105),
        ]);
        match &merged[..] {
            [SessionEvent::Output { bytes, offset, .. }] => {
                assert_eq!(offset - bytes.len() as u64, 100);
                assert_eq!(bytes, b"xyzpq");
            }
            other => panic!("expected one merged Output, got {other:?}"),
        }
    }

    #[test]
    fn coalesce_splits_on_session_change_preserving_order() {
        let events = vec![
            out_ev("a", b"1", 1),
            out_ev("b", b"2", 1),
            out_ev("a", b"3", 2),
        ];
        // Interleaved sessions never merge (chunk 3 doesn't continue chunk 1's run —
        // there's a "b" between them) and order is untouched.
        assert_eq!(coalesce_output_events(events.clone()), events);
    }

    #[test]
    fn coalesce_flushes_before_non_output_events_in_order() {
        let exited = SessionEvent::Exited {
            id: "a".into(),
            code: Some(0),
        };
        let merged = coalesce_output_events(vec![
            out_ev("a", b"bye", 3),
            exited.clone(),
            out_ev("a", b"??", 5),
        ]);
        // The Exited stays strictly between the two outputs — a lifecycle event is
        // never reordered around (or swallowed into) an output run.
        assert_eq!(
            merged,
            vec![out_ev("a", b"bye", 3), exited, out_ev("a", b"??", 5)]
        );
    }

    #[test]
    fn coalesce_splits_non_contiguous_offsets() {
        // A Restart under the same id resets the session's Scrollback total to 0, so
        // the stale reader's final chunk and the new reader's first are NOT contiguous
        // and must not merge (merging would corrupt the frontend's replay dedupe).
        let events = vec![out_ev("a", b"old", 4096), out_ev("a", b"new", 3)];
        assert_eq!(coalesce_output_events(events.clone()), events);
    }

    #[test]
    fn coalesce_respects_max_bytes_cap() {
        let big = vec![b'x'; COALESCE_MAX_BYTES];
        let events = vec![
            out_ev("a", &big, COALESCE_MAX_BYTES as u64),
            out_ev("a", b"more", COALESCE_MAX_BYTES as u64 + 4),
        ];
        // The first run is already at the cap, so the follow-up flushes separately.
        assert_eq!(coalesce_output_events(events.clone()), events);
    }

    #[test]
    fn coalesce_passes_through_non_output_only_input() {
        let events = vec![
            SessionEvent::State {
                id: "a".into(),
                busy: true,
            },
            SessionEvent::Name {
                id: "a".into(),
                name: "t".into(),
            },
            SessionEvent::Forkable {
                id: "a".into(),
                forkable: true,
            },
        ];
        assert_eq!(coalesce_output_events(events.clone()), events);
    }

    #[test]
    fn coalesce_empty_is_empty() {
        assert_eq!(coalesce_output_events(vec![]), vec![]);
    }

    // --- Output hot-path throughput benchmark (#358) ---

    /// Throughput of the PTY output hot path — the only CPU-bound work between a `read()`
    /// on the PTY and the `session://output` emit: [`Scrollback::push`] (VecDeque churn
    /// under the 256 KB cap), [`coalesce_output_events`] (#346's contiguous-run merge), and
    /// `commands::encode_output` (#261's base64). Not a correctness test and not a
    /// regression gate — it exists so the `[profile.release]` `opt-level` choice (`"s"` vs
    /// `3`, #358) stays reproducible instead of being an opinion. `#[ignore]`d because it is
    /// a measurement, not an assertion (and it churns 64 MB three times).
    ///
    /// Run it against the profile under test:
    ///
    /// ```text
    /// cargo test --manifest-path src-tauri/Cargo.toml --release \
    ///   -- --ignored --nocapture bench_output_hot_path
    /// ```
    ///
    /// (`cargo test --release` builds the test with the `bench` profile, which inherits
    /// `[profile.release]`; run it ~5× and take the median per stage.) The decision rule
    /// #358 applied: keep the size-oriented `opt-level = "s"` unless it is >15% slower on
    /// the aggregate and some stage drops below ~200 MB/s — a busy `claude` TUI repaint
    /// storm produces single-digit MB/s, so anything at ≥200 MB/s is nowhere near a
    /// bottleneck.
    #[test]
    #[ignore]
    fn bench_output_hot_path() {
        /// Synthetic PTY output pushed through each stage.
        const TOTAL: usize = 64 * 1024 * 1024;
        /// 8 KB reads, exactly like `reader_loop`.
        const CHUNKS: usize = TOTAL / READ_CHUNK;
        /// Events per coalesce batch — a plausible forwarder drain (32 × 8 KB = 256 KB, so
        /// the merged run also hits `COALESCE_MAX_BYTES` and the flush path is exercised).
        const BATCH: usize = 32;

        // A claude TUI repaint is mostly ESC sequences + ASCII; vary the bytes so nothing
        // folds into a constant.
        let chunk: Vec<u8> = (0..READ_CHUNK).map(|i| (i % 251) as u8).collect();

        // 1) Scrollback::push — the reader thread's per-chunk write under the 256 KB cap.
        let mut sb = Scrollback::new(SCROLLBACK_CAP);
        let t = std::time::Instant::now();
        for _ in 0..CHUNKS {
            sb.push(&chunk);
        }
        let push = t.elapsed();

        // 2) coalesce_output_events — contiguous same-session runs, so the merge is taken.
        let batches = CHUNKS / BATCH;
        let t = std::time::Instant::now();
        let mut merged = 0usize;
        for b in 0..batches {
            let events: Vec<SessionEvent> = (0..BATCH)
                .map(|i| {
                    let n = (b * BATCH + i + 1) as u64;
                    SessionEvent::Output {
                        id: "bench".to_string(),
                        bytes: chunk.clone(),
                        offset: n * READ_CHUNK as u64,
                    }
                })
                .collect();
            merged += coalesce_output_events(events).len();
        }
        let coalesce = t.elapsed();

        // 3) encode_output — the base64 the forwarder puts on the wire.
        let t = std::time::Instant::now();
        let mut encoded = 0usize;
        for _ in 0..CHUNKS {
            encoded += crate::commands::encode_output(&chunk).len();
        }
        let encode = t.elapsed();

        let mb = TOTAL as f64 / (1024.0 * 1024.0);
        let rate = |d: std::time::Duration| mb / d.as_secs_f64();
        println!(
            "bench_output_hot_path: {mb:.0} MB | push {push:?} ({:.0} MB/s) | \
             coalesce {coalesce:?} ({:.0} MB/s, {merged} events out) | \
             encode {encode:?} ({:.0} MB/s, {encoded} b64 bytes)",
            rate(push),
            rate(coalesce),
            rate(encode),
        );
    }
}
