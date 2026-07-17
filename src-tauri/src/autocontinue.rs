//! Auto-continue after limit reset — the Rust engine (task 430; ports
//! #296/#297/#305/#309 from `src/autoContinue.ts` + `store.ts` so N windows can
//! never double-nudge; exactly one executor per app).
//!
//! When the five-hour usage window is exhausted, ReCue captures the running Claude
//! sessions + the known reset time, waits for the window to reset (watching BOTH the
//! reset time AND the usage percentage dropping), then nudges each captured agent
//! (Enter → `continue` → Enter) so it resumes its work. The decision logic
//! (`evaluate`) and its inputs (`poll_gate` / `engine_config` / `live_claude_ids` /
//! `fetch_due` / `parse_resets_at`) are pure and fully unit-tested; the thin `run`
//! loop wires them to the single per-app usage poll and the PTY keystroke seam.
//!
//! **Why Rust owns the poll (task 430):** the OAuth usage endpoint aggressively 429s
//! below ~180 s (see the `usage.rs` module doc), so the app must never grow two
//! independent pollers — and the frontend's old main-window-only poll gate died
//! with the N-full-windows epic (task 434). Rust runs the one poll (180 s
//! disarmed / 45 s armed),
//! emits each snapshot as `usage://changed` (`Option<UsageSnapshot>`, `null` =
//! unavailable) and the machine state as `autocontinue://changed` — each only on
//! change, the task-428 conventions — and serves late subscribers via the
//! `auto_continue_snapshot` command over a shared cache.
//!
//! Cross-platform by construction: a plain thread, `ureq` HTTPS (via `usage.rs`),
//! `SessionManager::write_stdin` (the same bytes on macOS, Windows, and Linux), and
//! Tauri events (global to all windows on all three OSes). No `#[cfg]` arms.

use std::collections::HashSet;
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

use crate::pty::SessionManager;
use crate::store::{PersistedSession, Store};
use crate::usage::UsageSnapshot;

/// Usage percentage at which the window reads as exhausted and the machine arms —
/// the TS `LIMIT_REACHED_PCT` (100) minus `LIMIT_REACHED_TOLERANCE` (0.5): the live
/// OAuth endpoint can report a hair under 100 at the cap.
pub const ARM_THRESHOLD_PCT: f64 = 99.5;
/// Usage percentage the snapshot must drop below to confirm the window has reset.
/// A fresh window reports well under this; combined with the known reset time it
/// guards against firing mid-window on a noisy reading.
pub const RESET_CONFIRM_PCT: f64 = 90.0;
/// Disarmed usage-poll cadence (#154): the endpoint aggressively 429s below ~180 s
/// even with the claude-code User-Agent.
pub const USAGE_POLL_MS: u64 = 180_000;
/// Tighter usage-poll cadence while armed and waiting for the reset (#296), so the
/// continue fires promptly after the window turns over. Bounded — never faster.
pub const ARMED_POLL_MS: u64 = 45_000;
/// Engine wake tick / poke latency (the `SCHEDULE_POLL_SECS` precedent): the loop
/// re-reads settings + sessions and re-evaluates every ~5 s; fetches stay on the
/// poll cadence above.
pub const ENGINE_TICK_MS: u64 = 5_000;
/// Milliseconds between the three keystrokes of the auto-continue nudge (#296) — a
/// tiny gap so claude's TUI registers Enter, the typed text, and Enter as separate
/// events rather than a single paste.
pub const CONTINUE_KEY_DELAY_MS: u64 = 120;

/// Transient runtime state of the auto-continue machine — NOT persisted (only the
/// boolean setting is; the machine dies with the process, as it did frontend-side).
/// `armed` means the limit has been detected and we're waiting for the reset;
/// `session_ids` is the set of live Claude sessions captured at that moment, to be
/// nudged once the window resets. Serialized camelCase — the exact shape the
/// frontend's `AutoContinueState` mirror expects. `Default` is the TS
/// `IDLE_AUTO_CONTINUE` disarmed resting state.
#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AutoContinueState {
    pub armed: bool,
    /// Epoch ms the usage window resets, captured at arm time; `None` when the API
    /// omitted it (fall back to the percentage-drop signal alone).
    pub resets_at_ms: Option<i64>,
    /// Live Claude session ids captured when the limit was detected.
    pub session_ids: Vec<String>,
}

/// The usage snapshot the reducer reads — the port of the TS `AutoContinueUsage`
/// (the store's `usage` slice shape).
#[derive(Debug, Clone, PartialEq)]
pub struct UsageInput {
    pub used_percent: Option<f64>,
    pub resets_at_ms: Option<i64>,
    pub available: bool,
}

impl UsageInput {
    /// The gated-off / fetch-failed "no data" input — the reducer disarms on it.
    pub fn unavailable() -> Self {
        UsageInput {
            used_percent: None,
            resets_at_ms: None,
            available: false,
        }
    }
}

/// The settings the reducer gates on — the TS `AutoContinueConfig`.
#[derive(Debug, Clone, PartialEq)]
pub struct Config {
    /// The `autoContinueAfterLimit` setting (opt-in, default off).
    pub enabled: bool,
    /// The `defaultAgent` setting — the feature is Claude-only.
    pub default_agent: String,
}

/// The reducer's output — the TS `AutoContinueResult`.
#[derive(Debug, Clone, PartialEq)]
pub struct EvalResult {
    /// The next machine state.
    pub next: AutoContinueState,
    /// Session ids to send the continue sequence to *now* (empty unless a reset
    /// just fired).
    pub fire_ids: Vec<String>,
}

/// Pure reducer for the auto-continue machine — a line-for-line port of the TS
/// `evaluateAutoContinue` (#296, formerly `src/autoContinue.ts`).
///
/// - Inert (disarm, no fire) when the feature is off, the default agent isn't
///   Claude, or usage data is unavailable — fail-open so a missing snapshot never
///   nudges.
/// - **Arm** when not yet armed and the snapshot reports the limit reached
///   (`used_percent >= ARM_THRESHOLD_PCT`) and there is at least one live Claude
///   session to nudge — capturing the reset time + the current live-Claude id set.
/// - **Fire** when armed and the window has reset: the known reset time has passed
///   (or none is known) AND `used_percent` has dropped below [`RESET_CONFIRM_PCT`].
///   The fired set is the captured ids still live now; then disarm.
/// - Otherwise stay put (an equal-state return; the frontend applies are
///   equality-guarded, and the engine emits only on change).
pub fn evaluate(
    prev: &AutoContinueState,
    usage: &UsageInput,
    now_ms: i64,
    config: &Config,
    live_claude_ids: &[String],
) -> EvalResult {
    // Inert: off / non-Claude / no usage data → disarm and never fire.
    let used = match usage.used_percent {
        Some(used) if config.enabled && config.default_agent == "claude" && usage.available => used,
        _ => {
            return EvalResult {
                next: if prev.armed {
                    AutoContinueState::default()
                } else {
                    prev.clone()
                },
                fire_ids: Vec::new(),
            };
        }
    };

    if !prev.armed {
        // Arm when the limit is reached and there are live Claude sessions to nudge.
        if used >= ARM_THRESHOLD_PCT && !live_claude_ids.is_empty() {
            return EvalResult {
                next: AutoContinueState {
                    armed: true,
                    resets_at_ms: usage.resets_at_ms,
                    session_ids: live_claude_ids.to_vec(),
                },
                fire_ids: Vec::new(),
            };
        }
        return EvalResult {
            next: prev.clone(),
            fire_ids: Vec::new(),
        };
    }

    // Armed: fire once the window has reset — the known time has passed (or none was
    // captured) AND usage has dropped below the confirm threshold.
    let time_reset = prev.resets_at_ms.is_none_or(|t| now_ms >= t);
    if time_reset && used < RESET_CONFIRM_PCT {
        let live: HashSet<&str> = live_claude_ids.iter().map(String::as_str).collect();
        let fire_ids = prev
            .session_ids
            .iter()
            .filter(|id| live.contains(id.as_str()))
            .cloned()
            .collect();
        return EvalResult {
            next: AutoContinueState::default(),
            fire_ids,
        };
    }

    // Still armed, still waiting.
    EvalResult {
        next: prev.clone(),
        fire_ids: Vec::new(),
    }
}

/// Convert the usage endpoint's raw `resets_at` — an ISO-8601 string, or a unix
/// timestamp in seconds or milliseconds as a numeric string — to epoch ms. The port
/// of `parseResetsAt` (`src/time.ts`), which the reducer needs Rust-side; JS keeps
/// its own copy for display formatting.
///
/// Hand-rolled RFC3339-subset parser (`YYYY-MM-DDTHH:MM:SS`, an optional `.fff…`
/// fraction — ignored beyond ms — then `Z` or `±HH:MM`/`±HHMM`) over the standard
/// days-from-civil arithmetic. Deliberately **no date crate** (the `usage.rs`
/// stance: the whole usage feature is a best-effort read of an undocumented
/// endpoint, not worth a dependency); anything unparseable degrades to `None`, on
/// which the reducer falls back to the percentage-drop signal alone — never a panic
/// or a mis-fire.
pub fn parse_resets_at(raw: Option<&str>) -> Option<i64> {
    let raw = raw?.trim();
    if raw.is_empty() {
        return None;
    }
    // All digits ⇒ a stringified unix timestamp: >= 1e12 is already ms, else secs.
    if raw.bytes().all(|b| b.is_ascii_digit()) {
        let n: i64 = raw.parse().ok()?;
        return Some(if n >= 1_000_000_000_000 { n } else { n * 1000 });
    }
    parse_rfc3339_ms(raw)
}

/// The RFC3339-subset arm of [`parse_resets_at`]: date `T` time, optional fraction,
/// mandatory `Z` or numeric offset. Returns epoch ms, or `None` on any shape/range
/// violation.
fn parse_rfc3339_ms(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    // "YYYY-MM-DDTHH:MM:SS" is 19 bytes; an offset or Z must follow.
    if b.len() < 20 || b[4] != b'-' || b[7] != b'-' || b[13] != b':' || b[16] != b':' {
        return None;
    }
    if b[10] != b'T' && b[10] != b't' && b[10] != b' ' {
        return None;
    }
    let year: i64 = s.get(0..4)?.parse().ok()?;
    let month: u32 = s.get(5..7)?.parse().ok()?;
    let day: u32 = s.get(8..10)?.parse().ok()?;
    let hour: i64 = s.get(11..13)?.parse().ok()?;
    let minute: i64 = s.get(14..16)?.parse().ok()?;
    let second: i64 = s.get(17..19)?.parse().ok()?;
    if !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
        || hour > 23
        || minute > 59
        || second > 60
    {
        return None;
    }
    // Optional fraction: keep ms precision, ignore further digits.
    let mut i = 19;
    let mut frac_ms: i64 = 0;
    if b.get(i) == Some(&b'.') {
        i += 1;
        let start = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        if i == start {
            return None; // a bare "." with no digits
        }
        let digits = &s[start..i.min(start + 3)];
        let parsed: i64 = digits.parse().ok()?;
        frac_ms = parsed * 10_i64.pow(3 - digits.len() as u32);
    }
    // Offset: "Z", or ±HH:MM / ±HHMM.
    let offset_min: i64 = match b.get(i) {
        Some(&b'Z') | Some(&b'z') if i + 1 == b.len() => 0,
        Some(&sign @ (b'+' | b'-')) => {
            let rest = &s[i + 1..];
            let (hh, mm) = match rest.len() {
                5 if rest.as_bytes()[2] == b':' => (rest.get(0..2)?, rest.get(3..5)?),
                4 => (rest.get(0..2)?, rest.get(2..4)?),
                _ => return None,
            };
            let hh: i64 = hh.parse().ok()?;
            let mm: i64 = mm.parse().ok()?;
            if hh > 23 || mm > 59 {
                return None;
            }
            let total = hh * 60 + mm;
            if sign == b'-' {
                -total
            } else {
                total
            }
        }
        _ => return None,
    };
    // Days-from-civil (Howard Hinnant's algorithm): civil date → days since epoch.
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400; // [0, 399]
    let mp = (i64::from(month) + 9) % 12; // [0, 11], March = 0
    let doy = (153 * mp + 2) / 5 + i64::from(day) - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    let secs = days * 86_400 + hour * 3_600 + minute * 60 + second - offset_min * 60;
    Some(secs * 1000 + frac_ms)
}

/// The #326 privacy gate + the `isClaudeActive` port (formerly `store.ts`): fetch
/// usage only when the bar is enabled (`showSessionUsage`; a missing key reads
/// **true**, the frontend `DEFAULT_SETTINGS`) and EVERY tracked session runs claude
/// (a missing/legacy agent deserializes to `"claude"`, #101). No poll ⇒ no
/// OAuth-token access — which also preserves today's implicit "auto-continue needs
/// the usage bar enabled". While gated, usage reads unavailable and the machine
/// disarms (fail-open).
pub fn poll_gate(settings: &serde_json::Value, sessions: &[PersistedSession]) -> bool {
    let show = settings
        .get("showSessionUsage")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(true);
    show && sessions.iter().all(|s| s.agent == "claude")
}

/// Read the reducer's [`Config`] off the raw settings blob: `enabled` =
/// `autoContinueAfterLimit` (missing ⇒ **false**, the opt-in default), plus
/// `defaultAgent` (missing ⇒ `"claude"`) — the frontend `DEFAULT_SETTINGS` values,
/// so a never-saved blob (`null`) fails to the same defaults.
pub fn engine_config(settings: &serde_json::Value) -> Config {
    Config {
        enabled: settings
            .get("autoContinueAfterLimit")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false),
        default_agent: settings
            .get("defaultAgent")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("claude")
            .to_string(),
    }
}

/// The #296/#297 arm/fire candidate set: persisted records with a claude agent ∧
/// not per-agent opted out (`auto_continue_disabled`, #297) ∧ a currently-running
/// PTY (`running` = `SessionManager::live_session_ids()`). Stricter than the old
/// frontend `exitedCode === undefined`, which also counted still-reconnecting boot
/// records — nudging is best-effort either way. Shell terminals (no record) and
/// exited/never-resumed sessions are excluded.
pub fn live_claude_ids(records: &[PersistedSession], running: &HashSet<String>) -> Vec<String> {
    records
        .iter()
        .filter(|r| r.agent == "claude" && !r.auto_continue_disabled && running.contains(&r.id))
        .map(|r| r.id.clone())
        .collect()
}

/// Whether the usage poll is due: 45 s armed / 180 s disarmed since the last fetch;
/// a first run (`None`) fetches immediately. (The gate-off→on transition also
/// fetches immediately — handled in the `run` loop, which tracks the gate edge.)
pub fn fetch_due(elapsed_ms: Option<u64>, armed: bool) -> bool {
    match elapsed_ms {
        None => true,
        Some(elapsed) => elapsed >= if armed { ARMED_POLL_MS } else { USAGE_POLL_MS },
    }
}

/// The engine's shared cache: the latest usage snapshot + machine state, served by
/// [`auto_continue_snapshot`] so a window that subscribes late (boot, a detached
/// window) reads current values with no missed-event race. Serialized camelCase —
/// the `auto_continue_snapshot` reply shape.
#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    /// The latest usage snapshot; `None` = unavailable (gated off / fetch failed).
    pub usage: Option<UsageSnapshot>,
    /// The auto-continue machine state.
    pub auto_continue: AutoContinueState,
}

/// Tauri-managed wrapper for the shared [`Snapshot`] cache.
///
/// **Invariant: the engine writes `Shared` BEFORE emitting** `usage://changed` /
/// `autocontinue://changed`, so `auto_continue_snapshot` is always ≥ any event a
/// subscriber saw — a subscribe-then-fetch boot sequence can never regress to an
/// older value.
#[derive(Default)]
pub struct Shared(pub Mutex<Snapshot>);

/// Tauri-managed poke channel into the engine loop (`Mutex` because `Sender` is
/// `!Sync`, the `SessionManager::events` pattern).
pub struct Poke(pub Mutex<Sender<()>>);

/// Wake the engine now (best-effort): `set_settings` calls this so toggling
/// `showSessionUsage` / `autoContinueAfterLimit` reacts within one wake instead of
/// the next tick. Fail-soft when unmanaged (e.g. unit tests) or the engine exited.
pub fn poke<R: Runtime>(app: &AppHandle<R>) {
    if let Some(poke) = app.try_state::<Poke>() {
        if let Ok(tx) = poke.0.lock() {
            let _ = tx.send(());
        }
    }
}

/// The boot-time state fetch for the frontend mirrors (task 430): the cached usage
/// snapshot + auto-continue machine state, exactly what the `usage://changed` /
/// `autocontinue://changed` events carry. A cheap mutex read — fine on the main
/// thread.
#[tauri::command]
pub fn auto_continue_snapshot(shared: State<'_, Shared>) -> Snapshot {
    shared.0.lock().unwrap_or_else(|p| p.into_inner()).clone()
}

/// Milliseconds since the unix epoch (the reducer's `now`).
fn now_epoch_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// The engine loop — spawned once per app in `lib.rs` `.setup()` (next to the #93
/// scheduler thread). Wakes every [`ENGINE_TICK_MS`] (or instantly on a poke),
/// fetches the usage snapshot only when the poll gate is open AND the fetch is due
/// (or the gate just opened), re-evaluates the machine against the cached snapshot,
/// publishes state (cache first, then on-change emits), and sends the nudge for any
/// fired session directly.
///
/// Safety property: evaluating every wake against a **cached** snapshot can never
/// fire early — the arm-time snapshot reads ≥ 99.5, and firing needs `< 90`, which
/// only a fresh post-reset fetch can report. Nudges run inline on the engine thread
/// (bounded: a handful of sessions × 240 ms; the next wake just slips). A panic here
/// kills only this thread (`panic = "unwind"`, the #358 rule) — no lock is
/// `unwrap()`ed (poisoned mutexes recover via `into_inner`).
pub fn run<R: Runtime>(app: AppHandle<R>, rx: Receiver<()>) {
    let mut state = AutoContinueState::default();
    let mut cached: Option<UsageSnapshot> = None;
    let mut last_fetch: Option<Instant> = None;
    let mut last_gate = false;

    loop {
        let (settings, records) = {
            let store = app.state::<Store>();
            (store.settings(), store.sessions())
        };
        let gate = poll_gate(&settings, &records);
        if gate {
            let elapsed = last_fetch.map(|t| t.elapsed().as_millis() as u64);
            // Fetch when due (180 s / 45 s armed), on first run, or the instant the
            // gate opens (mirrors the old fetch-on-enable). Never while gated off —
            // the #326 rule: no poll ⇒ no OAuth-token access.
            if fetch_due(elapsed, state.armed) || !last_gate {
                cached = crate::usage::usage_snapshot_blocking();
                last_fetch = Some(Instant::now());
            }
        } else {
            // Gated off: usage reads unavailable (and the reducer disarms below).
            cached = None;
        }

        let usage_input = match &cached {
            Some(snap) => UsageInput {
                used_percent: Some(snap.used_percent),
                resets_at_ms: parse_resets_at(snap.resets_at.as_deref()),
                available: true,
            },
            None => UsageInput::unavailable(),
        };
        let running: HashSet<String> = app
            .state::<SessionManager>()
            .live_session_ids()
            .into_iter()
            .collect();
        let result = evaluate(
            &state,
            &usage_input,
            now_epoch_ms(),
            &engine_config(&settings),
            &live_claude_ids(&records, &running),
        );

        // Publish: write the Shared cache BEFORE emitting (see `Shared`), then emit
        // each event only on change (the task-428 conventions; the frontend applies
        // are equality-guarded, so the emit guard is a webview-traffic saving, not a
        // correctness requirement).
        let (usage_changed, state_changed) = {
            let shared = app.state::<Shared>();
            let mut snap = shared.0.lock().unwrap_or_else(|p| p.into_inner());
            let usage_changed = snap.usage != cached;
            let state_changed = snap.auto_continue != result.next;
            snap.usage.clone_from(&cached);
            snap.auto_continue = result.next.clone();
            (usage_changed, state_changed)
        };
        if usage_changed {
            let _ = app.emit("usage://changed", &cached);
        }
        if state_changed {
            let _ = app.emit("autocontinue://changed", &result.next);
        }

        // The nudge (#296): Enter → `continue` → Enter with small gaps, per fired
        // session, best-effort — a dead PTY / write error just means that agent
        // isn't nudged, never a surfaced error. The exact sequence is isolated here
        // so a real-CLI sanity check can adjust it in one place (e.g. drop the
        // leading Enter to `"continue\r"`). `write_stdin` stamps `last_input` (#55),
        // exactly as the old frontend nudge did, so busy semantics are unchanged.
        for id in &result.fire_ids {
            let manager = app.state::<SessionManager>();
            let _ = manager.write_stdin(id, "\r");
            thread::sleep(Duration::from_millis(CONTINUE_KEY_DELAY_MS));
            let _ = manager.write_stdin(id, "continue");
            thread::sleep(Duration::from_millis(CONTINUE_KEY_DELAY_MS));
            let _ = manager.write_stdin(id, "\r");
        }

        state = result.next;
        last_gate = gate;

        match rx.recv_timeout(Duration::from_millis(ENGINE_TICK_MS)) {
            // A poke (settings changed) or the tick elapsing both re-run the loop.
            Ok(()) | Err(RecvTimeoutError::Timeout) => {}
            // Every sender dropped (app teardown) — stop the engine.
            Err(RecvTimeoutError::Disconnected) => return,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(id: &str) -> PersistedSession {
        PersistedSession {
            id: id.to_string(),
            claude_session_id: id.to_string(),
            repo_path: "/repo/x".to_string(),
            name: None,
            created_at: 0,
            worktree_parent: None,
            auto_name: None,
            has_been_active: false,
            agent: "claude".to_string(),
            forked_from: None,
            forkable: true,
            auto_continue_disabled: false,
            watch: false,
            container_image: None,
            current_cwd: None,
        }
    }

    fn agent_record(id: &str, agent: &str) -> PersistedSession {
        PersistedSession {
            agent: agent.to_string(),
            ..record(id)
        }
    }

    fn usage(used_percent: Option<f64>, resets_at_ms: Option<i64>, available: bool) -> UsageInput {
        UsageInput {
            used_percent,
            resets_at_ms,
            available,
        }
    }

    fn armed(resets_at_ms: Option<i64>, session_ids: &[&str]) -> AutoContinueState {
        AutoContinueState {
            armed: true,
            resets_at_ms,
            session_ids: session_ids.iter().map(|s| s.to_string()).collect(),
        }
    }

    fn ids(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    /// The TS suite's `CLAUDE_ON` config: feature on, claude the default agent.
    fn claude_on() -> Config {
        Config {
            enabled: true,
            default_agent: "claude".to_string(),
        }
    }

    // --- evaluate: constants + arming (mirrors src/autoContinue.test.ts) ---

    #[test]
    fn constants_match_the_ts_values() {
        assert_eq!(ARM_THRESHOLD_PCT, 99.5);
        assert_eq!(RESET_CONFIRM_PCT, 90.0);
        assert_eq!(USAGE_POLL_MS, 180_000);
        assert_eq!(ARMED_POLL_MS, 45_000);
        assert_eq!(CONTINUE_KEY_DELAY_MS, 120);
    }

    #[test]
    fn arms_at_the_limit_capturing_reset_time_and_ids() {
        let res = evaluate(
            &AutoContinueState::default(),
            &usage(Some(100.0), Some(5_000), true),
            1_000,
            &claude_on(),
            &ids(&["a", "b"]),
        );
        assert_eq!(
            res.next,
            AutoContinueState {
                armed: true,
                resets_at_ms: Some(5_000),
                session_ids: ids(&["a", "b"]),
            }
        );
        assert!(res.fire_ids.is_empty());
    }

    #[test]
    fn arms_at_the_99_5_tolerance() {
        let res = evaluate(
            &AutoContinueState::default(),
            &usage(Some(99.5), Some(5_000), true),
            1_000,
            &claude_on(),
            &ids(&["a"]),
        );
        assert!(res.next.armed);
    }

    #[test]
    fn does_not_arm_below_the_tolerance() {
        let res = evaluate(
            &AutoContinueState::default(),
            &usage(Some(99.4), Some(5_000), true),
            1_000,
            &claude_on(),
            &ids(&["a"]),
        );
        assert_eq!(res.next, AutoContinueState::default());
        assert!(res.fire_ids.is_empty());
    }

    #[test]
    fn does_not_arm_with_no_live_claude_sessions() {
        let res = evaluate(
            &AutoContinueState::default(),
            &usage(Some(100.0), Some(5_000), true),
            1_000,
            &claude_on(),
            &[],
        );
        assert!(!res.next.armed);
    }

    // --- evaluate: staying armed ---

    #[test]
    fn stays_armed_while_over_the_limit_before_reset() {
        let prev = armed(Some(10_000), &["a", "b"]);
        let res = evaluate(
            &prev,
            &usage(Some(100.0), Some(10_000), true),
            5_000, // now < resets_at_ms
            &claude_on(),
            &ids(&["a", "b"]),
        );
        assert_eq!(res.next, prev);
        assert!(res.fire_ids.is_empty());
    }

    #[test]
    fn stays_armed_when_time_passed_but_percent_still_high() {
        let prev = armed(Some(10_000), &["a"]);
        let res = evaluate(
            &prev,
            &usage(Some(95.0), Some(10_000), true), // >= RESET_CONFIRM_PCT
            20_000,                                 // now >= resets_at_ms
            &claude_on(),
            &ids(&["a"]),
        );
        assert_eq!(res.next, prev);
        assert!(res.fire_ids.is_empty());
    }

    #[test]
    fn stays_armed_when_percent_dropped_but_time_not_passed() {
        let prev = armed(Some(10_000), &["a"]);
        let res = evaluate(
            &prev,
            &usage(Some(5.0), Some(10_000), true),
            5_000, // now < resets_at_ms
            &claude_on(),
            &ids(&["a"]),
        );
        assert_eq!(res.next, prev);
        assert!(res.fire_ids.is_empty());
    }

    // --- evaluate: firing ---

    #[test]
    fn fires_when_both_time_passed_and_percent_dropped() {
        let prev = armed(Some(10_000), &["a", "b"]);
        let res = evaluate(
            &prev,
            &usage(Some(5.0), Some(10_000), true),
            20_000,
            &claude_on(),
            &ids(&["a", "b"]),
        );
        assert_eq!(res.next, AutoContinueState::default());
        assert_eq!(res.fire_ids, ids(&["a", "b"]));
    }

    #[test]
    fn fires_only_the_captured_sessions_still_live() {
        let prev = armed(Some(10_000), &["a", "b", "c"]);
        let res = evaluate(
            &prev,
            &usage(Some(5.0), Some(10_000), true),
            20_000,
            &claude_on(),
            &ids(&["a", "c", "d"]), // b exited, d is new/unrelated
        );
        assert_eq!(res.fire_ids, ids(&["a", "c"]));
    }

    #[test]
    fn unknown_reset_time_fires_on_the_percent_drop_alone() {
        let prev = armed(None, &["a"]);
        let res = evaluate(
            &prev,
            &usage(Some(5.0), None, true),
            123_456,
            &claude_on(),
            &ids(&["a"]),
        );
        assert_eq!(res.next, AutoContinueState::default());
        assert_eq!(res.fire_ids, ids(&["a"]));
    }

    #[test]
    fn does_not_fire_at_exactly_the_confirm_threshold() {
        let prev = armed(Some(10_000), &["a"]);
        let res = evaluate(
            &prev,
            &usage(Some(RESET_CONFIRM_PCT), Some(10_000), true),
            20_000,
            &claude_on(),
            &ids(&["a"]),
        );
        assert_eq!(res.next, prev);
        assert!(res.fire_ids.is_empty());
    }

    // --- evaluate: inert / never fires ---

    #[test]
    fn never_arms_or_fires_when_the_feature_is_off() {
        let off = Config {
            enabled: false,
            default_agent: "claude".to_string(),
        };
        // Would-arm snapshot:
        let res = evaluate(
            &AutoContinueState::default(),
            &usage(Some(100.0), Some(1), true),
            0,
            &off,
            &ids(&["a"]),
        );
        assert_eq!(res.next, AutoContinueState::default());
        assert!(res.fire_ids.is_empty());
        // Would-fire snapshot while armed → disarm, no fire.
        let prev = armed(Some(10_000), &["a"]);
        let res = evaluate(
            &prev,
            &usage(Some(5.0), Some(10_000), true),
            20_000,
            &off,
            &ids(&["a"]),
        );
        assert_eq!(res.next, AutoContinueState::default());
        assert!(res.fire_ids.is_empty());
    }

    #[test]
    fn never_arms_or_fires_when_the_default_agent_is_not_claude() {
        let codex = Config {
            enabled: true,
            default_agent: "codex".to_string(),
        };
        let res = evaluate(
            &AutoContinueState::default(),
            &usage(Some(100.0), Some(1), true),
            0,
            &codex,
            &ids(&["a"]),
        );
        assert_eq!(res.next, AutoContinueState::default());
        assert!(res.fire_ids.is_empty());
        let prev = armed(Some(10_000), &["a"]);
        let res = evaluate(
            &prev,
            &usage(Some(5.0), Some(10_000), true),
            20_000,
            &codex,
            &ids(&["a"]),
        );
        assert_eq!(res.next, AutoContinueState::default());
        assert!(res.fire_ids.is_empty());
    }

    #[test]
    fn disarms_without_firing_when_usage_goes_unavailable() {
        let prev = armed(Some(10_000), &["a"]);
        let res = evaluate(
            &prev,
            &UsageInput::unavailable(),
            20_000,
            &claude_on(),
            &ids(&["a"]),
        );
        assert_eq!(res.next, AutoContinueState::default());
        assert!(res.fire_ids.is_empty());
    }

    #[test]
    fn disarms_when_used_percent_is_none_even_if_marked_available() {
        let prev = armed(Some(10_000), &["a"]);
        let res = evaluate(
            &prev,
            &usage(None, Some(10_000), true),
            20_000,
            &claude_on(),
            &ids(&["a"]),
        );
        assert_eq!(res.next, AutoContinueState::default());
        assert!(res.fire_ids.is_empty());
    }

    #[test]
    fn unchanged_evaluation_returns_an_equal_state_and_no_fire_ids() {
        // Inert + already disarmed → equal Default, no fire.
        let res = evaluate(
            &AutoContinueState::default(),
            &UsageInput::unavailable(),
            0,
            &claude_on(),
            &[],
        );
        assert_eq!(res.next, AutoContinueState::default());
        assert!(res.fire_ids.is_empty());
        // Under-threshold + disarmed → equal Default too.
        let res = evaluate(
            &AutoContinueState::default(),
            &usage(Some(10.0), Some(5_000), true),
            1_000,
            &claude_on(),
            &ids(&["a"]),
        );
        assert_eq!(res.next, AutoContinueState::default());
        assert!(res.fire_ids.is_empty());
    }

    // --- parse_resets_at ---

    #[test]
    fn parses_the_api_iso_form_with_numeric_offset() {
        // Cross-checked against JS `Date.parse("2026-04-11T07:00:00+00:00")`.
        assert_eq!(
            parse_resets_at(Some("2026-04-11T07:00:00+00:00")),
            Some(1_775_890_800_000)
        );
        // A non-zero offset shifts back to UTC.
        assert_eq!(
            parse_resets_at(Some("2026-04-11T07:00:00+02:00")),
            Some(1_775_883_600_000)
        );
        // The compact ±HHMM offset form.
        assert_eq!(
            parse_resets_at(Some("2026-04-11T07:00:00-0100")),
            Some(1_775_894_400_000)
        );
    }

    #[test]
    fn parses_the_z_form_and_fractions() {
        assert_eq!(
            parse_resets_at(Some("2026-04-11T07:00:00Z")),
            Some(1_775_890_800_000)
        );
        // Fractions keep ms precision; further digits are ignored.
        assert_eq!(
            parse_resets_at(Some("2026-04-11T07:00:00.5Z")),
            Some(1_775_890_800_500)
        );
        assert_eq!(
            parse_resets_at(Some("2026-04-11T07:00:00.123456Z")),
            Some(1_775_890_800_123)
        );
    }

    #[test]
    fn parses_stringified_unix_timestamps() {
        // Seconds (the API's other observed shape) → ms.
        assert_eq!(parse_resets_at(Some("1760166000")), Some(1_760_166_000_000));
        // Already-ms magnitude (>= 1e12) passes through.
        assert_eq!(
            parse_resets_at(Some("1760166000000")),
            Some(1_760_166_000_000)
        );
    }

    #[test]
    fn cross_checks_a_known_epoch_value() {
        // 2020-01-01T00:00:00Z = 1_577_836_800 epoch secs (a well-known constant).
        assert_eq!(
            parse_resets_at(Some("2020-01-01T00:00:00Z")),
            Some(1_577_836_800_000)
        );
    }

    #[test]
    fn garbage_and_absent_inputs_return_none() {
        assert_eq!(parse_resets_at(None), None);
        assert_eq!(parse_resets_at(Some("")), None);
        assert_eq!(parse_resets_at(Some("soon")), None);
        assert_eq!(parse_resets_at(Some("2026-04-11")), None); // date only
        assert_eq!(parse_resets_at(Some("2026-04-11T07:00:00")), None); // no offset
        assert_eq!(parse_resets_at(Some("2026-13-11T07:00:00Z")), None); // bad month
        assert_eq!(parse_resets_at(Some("2026-04-32T07:00:00Z")), None); // bad day
        assert_eq!(parse_resets_at(Some("2026-04-11T25:00:00Z")), None); // bad hour
        assert_eq!(parse_resets_at(Some("2026-04-11T07:00:00.Z")), None); // empty fraction
        assert_eq!(parse_resets_at(Some("2026-04-11T07:00:00+2:00")), None); // bad offset
    }

    #[test]
    fn rfc3339_separator_and_offset_edges() {
        // The two tolerated date-time separators besides 'T' (lowercase, space)…
        assert_eq!(
            parse_resets_at(Some("2026-04-11t07:00:00z")),
            Some(1_775_890_800_000)
        );
        assert_eq!(
            parse_resets_at(Some("2026-04-11 07:00:00Z")),
            Some(1_775_890_800_000)
        );
        // …and any other separator refuses.
        assert_eq!(parse_resets_at(Some("2026-04-11X07:00:00Z")), None);
        // Offsets must be ±HH:MM or ±HHMM — other lengths refuse…
        assert_eq!(parse_resets_at(Some("2026-04-11T07:00:00+02")), None);
        assert_eq!(parse_resets_at(Some("2026-04-11T07:00:00+02000")), None);
        // …and in-range: shape-valid hour 25 / minute 60 are refused.
        assert_eq!(parse_resets_at(Some("2026-04-11T07:00:00+25:00")), None);
        assert_eq!(parse_resets_at(Some("2026-04-11T07:00:00+00:60")), None);
        // A trailing designator that is neither Z nor a numeric offset…
        assert_eq!(parse_resets_at(Some("2026-04-11T07:00:00UTC")), None);
        // …a Z that isn't final…
        assert_eq!(parse_resets_at(Some("2026-04-11T07:00:00Zx")), None);
        // …and a fraction that runs to end-of-string with no offset at all.
        assert_eq!(parse_resets_at(Some("2026-04-11T07:00:00.5")), None);
    }

    // --- poll_gate ---

    #[test]
    fn poll_gate_defaults_open_on_a_missing_or_null_blob() {
        assert!(poll_gate(&serde_json::Value::Null, &[]));
        assert!(poll_gate(&serde_json::json!({}), &[record("a")]));
    }

    #[test]
    fn poll_gate_closes_when_show_session_usage_is_false() {
        let settings = serde_json::json!({ "showSessionUsage": false });
        assert!(!poll_gate(&settings, &[]));
        assert!(!poll_gate(&settings, &[record("a")]));
    }

    #[test]
    fn poll_gate_closes_when_any_session_runs_a_non_claude_agent() {
        let settings = serde_json::json!({ "showSessionUsage": true });
        assert!(poll_gate(&settings, &[record("a"), record("b")]));
        assert!(!poll_gate(
            &settings,
            &[record("a"), agent_record("b", "codex")]
        ));
        assert!(!poll_gate(&settings, &[agent_record("a", "opencode")]));
    }

    // --- engine_config ---

    #[test]
    fn engine_config_reads_the_settings_with_frontend_defaults() {
        // Missing keys / a never-saved blob fail to DEFAULT_SETTINGS.
        let cfg = engine_config(&serde_json::Value::Null);
        assert!(!cfg.enabled);
        assert_eq!(cfg.default_agent, "claude");
        let cfg = engine_config(&serde_json::json!({
            "autoContinueAfterLimit": true,
            "defaultAgent": "codex",
        }));
        assert!(cfg.enabled);
        assert_eq!(cfg.default_agent, "codex");
    }

    // --- live_claude_ids ---

    #[test]
    fn live_claude_ids_selects_running_claude_records_without_opt_out() {
        let disabled = PersistedSession {
            auto_continue_disabled: true,
            ..record("optout")
        };
        let records = vec![
            record("live"),
            record("dead"),
            disabled,
            agent_record("codex1", "codex"),
        ];
        let running: HashSet<String> = ["live", "optout", "codex1", "shell-term"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        // "dead" has no running PTY; "optout" is per-agent disabled (#297); "codex1"
        // isn't claude; "shell-term" has no record. Only "live" qualifies.
        assert_eq!(live_claude_ids(&records, &running), ids(&["live"]));
    }

    // --- fetch_due ---

    #[test]
    fn fetch_due_first_run_and_cadences() {
        // First run fetches immediately.
        assert!(fetch_due(None, false));
        assert!(fetch_due(None, true));
        // Disarmed: the 180 s cadence.
        assert!(!fetch_due(Some(USAGE_POLL_MS - 1), false));
        assert!(fetch_due(Some(USAGE_POLL_MS), false));
        // Armed: the tighter 45 s cadence.
        assert!(!fetch_due(Some(ARMED_POLL_MS - 1), true));
        assert!(fetch_due(Some(ARMED_POLL_MS), true));
        // The armed cadence never applies while disarmed.
        assert!(!fetch_due(Some(ARMED_POLL_MS), false));
    }

    // --- serialization shapes ---

    #[test]
    fn auto_continue_state_serializes_camel_case() {
        let state = armed(Some(5_000), &["a"]);
        let json = serde_json::to_value(&state).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "armed": true,
                "resetsAtMs": 5_000,
                "sessionIds": ["a"],
            })
        );
        // Default = the TS IDLE_AUTO_CONTINUE shape.
        let idle = serde_json::to_value(AutoContinueState::default()).unwrap();
        assert_eq!(
            idle,
            serde_json::json!({
                "armed": false,
                "resetsAtMs": null,
                "sessionIds": [],
            })
        );
    }

    #[test]
    fn snapshot_serializes_camel_case() {
        let json = serde_json::to_value(Snapshot::default()).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "usage": null,
                "autoContinue": { "armed": false, "resetsAtMs": null, "sessionIds": [] },
            })
        );
    }

    /// A unique on-disk store path per test run (the store.rs `temp_path` pattern —
    /// module-private there, so mirrored here).
    fn temp_store_path(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join("recue-autocontinue-glue-tests");
        std::fs::create_dir_all(&dir).expect("create temp dir");
        dir.join(format!("{tag}-{}.json", uuid::Uuid::new_v4()))
    }

    #[test]
    fn engine_loop_publishes_gated_off_state_and_stops_on_disconnect() {
        let app = tauri::test::mock_app();
        let handle = app.handle();
        let store = Store::load(temp_store_path("engine"));
        // Gate the poll OFF (the #326 rule) so the pass never touches credentials
        // or the network — exactly the state this test asserts gets published.
        store
            .set_settings(serde_json::json!({ "showSessionUsage": false }))
            .expect("settings write");
        app.manage(store);
        let (ev_tx, _ev_rx) = std::sync::mpsc::channel();
        app.manage(SessionManager::new(ev_tx));
        app.manage(Shared::default());
        // Pre-seed a stale usage value so the gated-off pass publishes a change
        // (cache written, `usage://changed` emitted).
        {
            let shared = app.state::<Shared>();
            shared.0.lock().expect("fresh mutex").usage = Some(UsageSnapshot {
                used_percent: 55.0,
                resets_at: None,
                buckets: Vec::new(),
            });
        }

        let (tx, rx) = std::sync::mpsc::channel::<()>();
        let engine_handle = handle.clone();
        let engine = std::thread::spawn(move || run(engine_handle, rx));
        // Every sender dropped = app teardown: the engine finishes its current
        // pass, sees Disconnected, and returns.
        drop(tx);
        engine.join().expect("engine thread exits cleanly");

        let snap = auto_continue_snapshot(app.state());
        assert_eq!(snap.usage, None, "gated off ⇒ usage reads unavailable");
        assert_eq!(snap.auto_continue, AutoContinueState::default());
    }

    #[test]
    fn poke_is_soft_without_state_and_sends_with_it() {
        let app = tauri::test::mock_app();
        let handle = app.handle();
        poke(handle); // unmanaged (unit tests / teardown) → silent no-op
        let (tx, rx) = std::sync::mpsc::channel::<()>();
        app.manage(Poke(Mutex::new(tx)));
        poke(handle);
        assert!(rx.try_recv().is_ok(), "poke must wake the engine channel");
    }
}
