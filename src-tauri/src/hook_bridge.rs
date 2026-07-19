//! Turn-complete hook bridge — a loopback listener + per-agent config so a spawned
//! agent CLI can tell ReCue the instant a turn finishes, driving the Attention queue's
//! *immediate* admission instead of the ~5 s output-activity heuristic (`SessionEvent::State`).
//!
//! **How each agent reaches us** (all POST `127.0.0.1:<port>/turn?token=..&kind=..[&sid=..]`):
//! - **claude** — its native `http` hook (`Stop` → `kind=finished`,
//!   `Notification[permission_prompt]` → `kind=approval`, `Notification[idle_prompt]` →
//!   `kind=finished`), injected per-session via `--settings <file>`. Correlation is free:
//!   the posted event JSON's `session_id` is the very id we pass `--session-id`.
//! - **codex** — its `notify` program (`-c notify=[...]`) runs *our own binary* as
//!   `recue --hook-forward <url> <session-id>` (see [`maybe_run_hook_forward`]), which POSTs
//!   and exits. Codex only fires `agent-turn-complete`, so it reports `finished` only.
//! - **opencode** — a bundled JS plugin (via `OPENCODE_CONFIG_DIR`) whose `event` hook maps
//!   `session.idle` → `finished` / `permission.updated` → `approval` and `fetch`es the URL,
//!   reading the token-bearing base URL + ReCue session id from `RECUE_HOOK_URL` /
//!   `RECUE_SESSION_ID` env.
//!
//! **Fail-open everywhere.** A bind/write failure disables the bridge and every spawn
//! injects nothing (heuristic-only); the listener always answers `204` so an agent CLI
//! never surfaces a hook error; a dead port just times out best-effort. **Host PTY sessions
//! only** — a container agent can't reach a host loopback port (no host-gateway), so the
//! spawn path gates injection on `container.is_none()` (containers stay heuristic-only).
//!
//! codex/opencode are **untested** agents in ReCue; their exact flag/plugin shapes here
//! follow the documented CLIs and **must be verified against the installed binary** (the
//! same discipline as `agents.rs`).

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Manager, Runtime};

use crate::pty::{SessionManager, TurnState};

/// Cap on the request bytes we buffer (a turn callback is a few hundred bytes).
const MAX_REQUEST_BYTES: usize = 64 * 1024;
/// Per-connection read timeout so a hung/slow peer can't wedge its worker thread.
const READ_TIMEOUT: Duration = Duration::from_secs(2);
/// Timeout for the `--hook-forward` POST so a dead listener never hangs codex's notify.
const FORWARD_TIMEOUT: Duration = Duration::from_secs(2);

/// Immutable-after-boot hook configuration, stored once on the [`SessionManager`]
/// (`OnceLock`) so every spawn path reads it without threading a param through all the
/// spawn call sites. `enabled` is the live Settings toggle (`turnCompleteHooks`), flipped
/// by `set_settings` through [`sync_enabled`].
pub struct HookConfig {
    port: u16,
    token: String,
    claude_settings: PathBuf,
    opencode_config_dir: PathBuf,
    enabled: AtomicBool,
}

impl HookConfig {
    /// Whether injection is currently on (the runtime Settings toggle).
    pub fn enabled(&self) -> bool {
        self.enabled.load(Ordering::Relaxed)
    }

    /// Flip the live Settings toggle (called from `set_settings`).
    pub fn set_enabled(&self, on: bool) {
        self.enabled.store(on, Ordering::Relaxed);
    }

    /// The base callback URL carrying the auth token (no `kind`/`sid` yet).
    fn base_url(&self) -> String {
        format!("http://127.0.0.1:{}/turn?token={}", self.port, self.token)
    }

    /// Per-agent spawn injection for `agent_id` (`claude`/`codex`/`opencode`; anything
    /// else — including `custom` — gets nothing). `session_id` is ReCue's own id (already
    /// the `--session-id` we pass claude; baked into the codex/opencode callbacks for
    /// correlation). Returns `(extra_cli_args, extra_env)`.
    pub fn injection(
        &self,
        agent_id: &str,
        session_id: &str,
    ) -> (Vec<String>, Vec<(String, String)>) {
        match agent_id {
            // claude: load our Stop/Notification http hooks as ADDITIONAL settings for
            // this session. claude 2.1.x `--settings` = "load additional settings" — it
            // merges with (never replaces) the user's own hooks. Verified against the
            // installed CLI; fails open if a future version changes this.
            "claude" => (
                vec![
                    "--settings".to_string(),
                    self.claude_settings.to_string_lossy().into_owned(),
                ],
                Vec::new(),
            ),
            // codex: `notify` runs a program with the event JSON as a trailing argv. Point
            // it at our own binary's `--hook-forward` subcommand and bake the ReCue session
            // id in (codex's payload carries only codex's own ids). If we can't resolve our
            // exe, skip codex injection (fail-open → heuristic). **Verify `-c notify=[…]`
            // is honored on the installed codex.**
            "codex" => match std::env::current_exe() {
                Ok(exe) => {
                    let url = format!("{}&kind=finished", self.base_url());
                    let notify = codex_notify_toml(&exe.to_string_lossy(), &url, session_id);
                    (vec!["-c".to_string(), notify], Vec::new())
                }
                Err(_) => (Vec::new(), Vec::new()),
            },
            // opencode: point OPENCODE_CONFIG_DIR at our plugin dir and pass the base URL +
            // session id as env the bundled plugin reads. **Verify OPENCODE_CONFIG_DIR is
            // additive + the plugin/event shape on the installed opencode.**
            "opencode" => (
                Vec::new(),
                vec![
                    (
                        "OPENCODE_CONFIG_DIR".to_string(),
                        self.opencode_config_dir.to_string_lossy().into_owned(),
                    ),
                    ("RECUE_HOOK_URL".to_string(), self.base_url()),
                    ("RECUE_SESSION_ID".to_string(), session_id.to_string()),
                ],
            ),
            _ => (Vec::new(), Vec::new()),
        }
    }
}

/// Read the `turnCompleteHooks` toggle from the (opaque) settings blob. **Default ON** —
/// only an explicit `false` disables, so an older `sessions.json` upgrades cleanly.
pub fn hooks_enabled(settings: &serde_json::Value) -> bool {
    settings
        .get("turnCompleteHooks")
        .and_then(serde_json::Value::as_bool)
        != Some(false)
}

/// Push the current `turnCompleteHooks` toggle into the live [`HookConfig`] after a
/// settings write (called from `set_settings`). Best-effort / fail-soft (a no-op when the
/// manager or bridge isn't present, e.g. tests).
pub fn sync_enabled<R: Runtime>(app: &AppHandle<R>, store: &crate::store::Store) {
    let enabled = hooks_enabled(&store.settings());
    if let Some(mgr) = app.try_state::<SessionManager>() {
        mgr.set_hooks_enabled(enabled);
    }
}

/// Handle a `recue --hook-forward <url> <session-id> [event-json]` invocation (codex's
/// `notify` program), POSTing the callback to the running ReCue's loopback listener and
/// returning `true` so [`crate::run`] exits **before** `tauri::Builder` (a fall-through
/// would make the single-instance plugin pop a spurious window on every codex turn).
/// Returns `false` for a normal launch. Fail-open: never errors out to the caller.
pub fn maybe_run_hook_forward() -> bool {
    let mut args = std::env::args();
    let _bin = args.next();
    if args.next().as_deref() != Some("--hook-forward") {
        return false;
    }
    if let (Some(url), Some(sid)) = (args.next(), args.next()) {
        // `url` already carries `?token=..&kind=finished`; append the ReCue session id.
        let full = format!("{url}&sid={sid}");
        let _ = ureq::post(&full).timeout(FORWARD_TIMEOUT).call();
    }
    true
}

/// The bridge lifecycle entry point.
pub struct HookBridge;

impl HookBridge {
    /// Bind the loopback listener, write the per-agent config files, spawn the accept
    /// thread, and return the [`HookConfig`] to store on the [`SessionManager`]. Returns
    /// `None` (bridge disabled → heuristic-only) if the socket can't bind or a config file
    /// can't be written. Never blocks; never fails a spawn.
    pub fn start<R: Runtime>(handle: AppHandle<R>, enabled: bool) -> Option<HookConfig> {
        let listener = TcpListener::bind(("127.0.0.1", 0)).ok()?;
        let port = listener.local_addr().ok()?.port();
        let token = new_token();

        let store = handle.state::<crate::store::Store>();
        let hooks_dir = store.data_dir()?.join("agent-hooks");
        let claude_settings = hooks_dir.join("claude-settings.json");
        let opencode_config_dir = hooks_dir.join("opencode");
        // Overwrite every boot — the port + token rotate per launch, so a stale file would
        // point at a dead port / wrong token.
        write_config_files(&claude_settings, &opencode_config_dir, port, &token).ok()?;

        {
            let token = token.clone();
            std::thread::spawn(move || serve(listener, token, handle));
        }

        Some(HookConfig {
            port,
            token,
            claude_settings,
            opencode_config_dir,
            enabled: AtomicBool::new(enabled),
        })
    }
}

/// A 128-bit random token (re-minted each launch), hex, in the callback URL query.
fn new_token() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

/// Accept loop: one detached worker thread per connection so a slow peer can't
/// head-of-line-block near-simultaneous turn signals from other agents. Runs for the app's
/// lifetime (the listener never closes; the thread dies with the process).
fn serve<R: Runtime>(listener: TcpListener, token: String, handle: AppHandle<R>) {
    for stream in listener.incoming() {
        let Ok(sock) = stream else { continue };
        let token = token.clone();
        let handle = handle.clone();
        std::thread::spawn(move || {
            let _ = handle_conn(sock, &token, &handle);
        });
    }
}

fn handle_conn<R: Runtime>(
    mut sock: TcpStream,
    token: &str,
    handle: &AppHandle<R>,
) -> std::io::Result<()> {
    let _ = sock.set_read_timeout(Some(READ_TIMEOUT));
    // Read the request head, then the Content-Length body (claude carries `session_id`
    // there; codex/opencode POST an empty body with `sid` in the query).
    let mut buf: Vec<u8> = Vec::new();
    let mut chunk = [0u8; 1024];
    loop {
        let n = match sock.read(&mut chunk) {
            Ok(0) => break, // EOF
            Ok(n) => n,
            Err(_) => break, // timeout / reset — parse whatever we have
        };
        buf.extend_from_slice(&chunk[..n]);
        if buf.len() >= MAX_REQUEST_BYTES {
            break;
        }
        if let Some(head_end) = header_end(&buf) {
            let need = content_length(&buf[..head_end]).unwrap_or(0);
            if buf.len() >= head_end + need {
                break; // full request
            }
        }
    }

    if let Some(head_end) = header_end(&buf) {
        let body = &buf[head_end..];
        if let Some(target) = request_target(&buf[..head_end]) {
            if let Some((Some(sid), state)) = parse_turn(&target, body, token) {
                let mgr = handle.state::<SessionManager>();
                // Reject a stale/foreign id so a spoofer can't drive an arbitrary card.
                if mgr.has_session(&sid) {
                    mgr.broadcast_turn(&sid, state);
                }
            }
        }
    }

    // Always answer 204 (never a 4xx) so an agent CLI never reads a failing hook.
    let _ = sock
        .write_all(b"HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    Ok(())
}

// ---- pure request parsing (unit-tested) -------------------------------------------------

/// Byte index just past the `\r\n\r\n` header terminator, if present.
fn header_end(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|w| w == b"\r\n\r\n").map(|p| p + 4)
}

/// The `Content-Length` value from a request head (case-insensitive), if any.
fn content_length(head: &[u8]) -> Option<usize> {
    let text = std::str::from_utf8(head).ok()?;
    text.split("\r\n").find_map(|line| {
        let (k, v) = line.split_once(':')?;
        if k.trim().eq_ignore_ascii_case("content-length") {
            v.trim().parse().ok()
        } else {
            None
        }
    })
}

/// The request-target (2nd token of the request line, e.g. `/turn?token=..`).
fn request_target(head: &[u8]) -> Option<String> {
    let line_end = head.windows(2).position(|w| w == b"\r\n")?;
    let line = std::str::from_utf8(&head[..line_end]).ok()?;
    let mut parts = line.split(' ');
    let _method = parts.next()?;
    parts.next().map(|t| t.to_string())
}

/// Validate + decode a turn callback: the query `token` must match, `kind` must be
/// `finished`/`approval`, and the session id comes from `sid` (query) or `session_id`
/// (body, for claude). Returns `(session_id?, state)` — the caller still checks the id is
/// live. Pure, so unit-testable without a socket/manager.
fn parse_turn(
    target: &str,
    body: &[u8],
    expected_token: &str,
) -> Option<(Option<String>, TurnState)> {
    let query = target.split_once('?').map(|(_, q)| q).unwrap_or("");
    let (mut token, mut kind, mut sid) = (None, None, None);
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            match k {
                "token" => token = Some(v),
                "kind" => kind = Some(v),
                "sid" => sid = Some(v),
                _ => {}
            }
        }
    }
    if token != Some(expected_token) {
        return None;
    }
    let state = match kind {
        Some("finished") => TurnState::Finished,
        Some("approval") => TurnState::Approval,
        _ => return None,
    };
    let sid = sid
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| body_session_id(body));
    Some((sid, state))
}

/// Extract `session_id` from a claude hook's JSON body.
fn body_session_id(body: &[u8]) -> Option<String> {
    if body.is_empty() {
        return None;
    }
    let v: serde_json::Value = serde_json::from_slice(body).ok()?;
    v.get("session_id")
        .and_then(serde_json::Value::as_str)
        .map(str::to_string)
}

// ---- config-file templates --------------------------------------------------------------

fn write_config_files(
    claude_settings: &Path,
    opencode_config_dir: &Path,
    port: u16,
    token: &str,
) -> std::io::Result<()> {
    if let Some(parent) = claude_settings.parent() {
        std::fs::create_dir_all(parent)?;
    }
    write_private(claude_settings, &claude_settings_json(port, token))?;
    // opencode reads plugins from `<config-dir>/plugin/` (singular). **Verify against the
    // installed opencode** — it's an untested agent.
    let plugin_dir = opencode_config_dir.join("plugin");
    std::fs::create_dir_all(&plugin_dir)?;
    write_private(&plugin_dir.join("recue-turn.js"), OPENCODE_PLUGIN_JS)?;
    Ok(())
}

/// Overwrite `path` (truncating), owner-only (0600) on unix — the file carries the token.
/// Windows relies on the app-data dir ACL (same posture as `container::write_once_private`).
fn write_private(path: &Path, contents: &str) -> std::io::Result<()> {
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    file.write_all(contents.as_bytes())
}

/// The claude `--settings` payload: Stop + Notification http hooks with the callback URL
/// (kind encoded per hook, so we never parse claude's notification wording).
fn claude_settings_json(port: u16, token: &str) -> String {
    let finished = format!("http://127.0.0.1:{port}/turn?token={token}&kind=finished");
    let approval = format!("http://127.0.0.1:{port}/turn?token={token}&kind=approval");
    serde_json::json!({
        "hooks": {
            "Stop": [ { "hooks": [ { "type": "http", "url": finished } ] } ],
            "Notification": [
                { "matcher": "permission_prompt", "hooks": [ { "type": "http", "url": approval } ] },
                { "matcher": "idle_prompt", "hooks": [ { "type": "http", "url": finished } ] }
            ]
        }
    })
    .to_string()
}

/// A TOML `notify = [...]` value for codex's `-c` override, running our binary as the
/// notify program. Strings are TOML **basic** (double-quoted) with `\`/`"` escaped, so a
/// Windows exe path (`C:\…\recue.exe`) is safe.
fn codex_notify_toml(exe: &str, url: &str, session_id: &str) -> String {
    format!(
        "notify=[{},{},{},{}]",
        toml_basic(exe),
        toml_basic("--hook-forward"),
        toml_basic(url),
        toml_basic(session_id),
    )
}

/// Quote a string as a TOML basic (double-quoted) string.
fn toml_basic(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            _ => out.push(c),
        }
    }
    out.push('"');
    out
}

/// The bundled opencode plugin: maps `session.idle`/`permission.updated` to a turn
/// callback, reading the token-bearing base URL + session id from env. Static (no per-boot
/// interpolation — the URL/id come from env), so it never needs rewriting.
const OPENCODE_PLUGIN_JS: &str = r#"// Auto-generated by ReCue — turn-complete bridge. Do not edit.
export const RecueTurnPlugin = async () => {
  const base = process.env.RECUE_HOOK_URL;
  const sid = process.env.RECUE_SESSION_ID;
  const post = (kind) => {
    if (!base || !sid) return;
    const url = base + "&kind=" + kind + "&sid=" + encodeURIComponent(sid);
    try {
      fetch(url, { method: "POST" }).catch(() => {});
    } catch (_) {}
  };
  return {
    event: async ({ event }) => {
      if (!event || typeof event.type !== "string") return;
      if (event.type === "session.idle") post("finished");
      else if (event.type === "permission.updated") post("approval");
    },
  };
};
"#;

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg(port: u16, token: &str) -> HookConfig {
        HookConfig {
            port,
            token: token.to_string(),
            claude_settings: PathBuf::from("/data/agent-hooks/claude-settings.json"),
            opencode_config_dir: PathBuf::from("/data/agent-hooks/opencode"),
            enabled: AtomicBool::new(true),
        }
    }

    #[test]
    fn hooks_enabled_defaults_on_and_only_false_disables() {
        assert!(hooks_enabled(&serde_json::json!({})));
        assert!(hooks_enabled(
            &serde_json::json!({ "turnCompleteHooks": true })
        ));
        assert!(hooks_enabled(&serde_json::json!({ "other": 1 })));
        assert!(!hooks_enabled(
            &serde_json::json!({ "turnCompleteHooks": false })
        ));
        // Non-bool is ignored → default on.
        assert!(hooks_enabled(
            &serde_json::json!({ "turnCompleteHooks": "no" })
        ));
    }

    #[test]
    fn parse_turn_requires_matching_token_and_valid_kind() {
        // Good, sid in query.
        assert_eq!(
            parse_turn("/turn?token=abc&kind=finished&sid=s1", b"", "abc"),
            Some((Some("s1".to_string()), TurnState::Finished))
        );
        assert_eq!(
            parse_turn("/turn?token=abc&kind=approval&sid=s2", b"", "abc"),
            Some((Some("s2".to_string()), TurnState::Approval))
        );
        // Wrong token → rejected.
        assert_eq!(
            parse_turn("/turn?token=xxx&kind=finished&sid=s1", b"", "abc"),
            None
        );
        // Missing/unknown kind → rejected.
        assert_eq!(parse_turn("/turn?token=abc&sid=s1", b"", "abc"), None);
        assert_eq!(
            parse_turn("/turn?token=abc&kind=working&sid=s1", b"", "abc"),
            None
        );
    }

    #[test]
    fn parse_turn_falls_back_to_body_session_id() {
        // No sid query → read claude's body session_id.
        let body = br#"{"session_id":"body-id","hook_event_name":"Stop"}"#;
        assert_eq!(
            parse_turn("/turn?token=abc&kind=finished", body, "abc"),
            Some((Some("body-id".to_string()), TurnState::Finished))
        );
        // sid query wins over body.
        assert_eq!(
            parse_turn("/turn?token=abc&kind=finished&sid=q", body, "abc"),
            Some((Some("q".to_string()), TurnState::Finished))
        );
        // No sid anywhere → None id (caller drops it).
        assert_eq!(
            parse_turn("/turn?token=abc&kind=finished", b"", "abc"),
            Some((None, TurnState::Finished))
        );
    }

    #[test]
    fn header_and_content_length_parse() {
        let req = b"POST /turn?token=t HTTP/1.1\r\nContent-Length: 5\r\n\r\nhello";
        let end = header_end(req).unwrap();
        assert_eq!(&req[end..], b"hello");
        assert_eq!(content_length(&req[..end]), Some(5));
        assert_eq!(request_target(&req[..end]).unwrap(), "/turn?token=t");
        // No body / no content-length.
        let req2 = b"POST /turn?token=t&kind=finished&sid=s HTTP/1.1\r\nHost: x\r\n\r\n";
        let end2 = header_end(req2).unwrap();
        assert_eq!(content_length(&req2[..end2]), None);
    }

    #[test]
    fn claude_injection_appends_settings_flag() {
        let (args, env) = cfg(1234, "tok").injection("claude", "sess-1");
        assert_eq!(args[0], "--settings");
        assert!(args[1].ends_with("claude-settings.json"));
        assert!(env.is_empty());
    }

    #[test]
    fn codex_injection_bakes_hook_forward_and_session_id() {
        let (args, env) = cfg(1234, "tok").injection("codex", "sess-2");
        assert_eq!(args[0], "-c");
        assert!(args[1].starts_with("notify=["));
        assert!(args[1].contains("--hook-forward"));
        assert!(args[1].contains("kind=finished"));
        assert!(args[1].contains("sess-2"));
        assert!(env.is_empty());
    }

    #[test]
    fn opencode_injection_sets_config_dir_and_env() {
        let (args, env) = cfg(1234, "tok").injection("opencode", "sess-3");
        assert!(args.is_empty());
        let map: std::collections::HashMap<_, _> = env.into_iter().collect();
        assert!(map["OPENCODE_CONFIG_DIR"].ends_with("opencode"));
        assert!(map["RECUE_HOOK_URL"].contains("token=tok"));
        assert_eq!(map["RECUE_SESSION_ID"], "sess-3");
    }

    #[test]
    fn custom_and_unknown_agents_get_no_injection() {
        for agent in ["custom", "", "nope"] {
            let (args, env) = cfg(1, "t").injection(agent, "s");
            assert!(args.is_empty(), "{agent} should inject no args");
            assert!(env.is_empty(), "{agent} should inject no env");
        }
    }

    #[test]
    fn toml_basic_escapes_backslashes_and_quotes() {
        assert_eq!(toml_basic("a"), "\"a\"");
        assert_eq!(
            toml_basic(r"C:\Users\me\recue.exe"),
            "\"C:\\\\Users\\\\me\\\\recue.exe\""
        );
        assert_eq!(toml_basic("say \"hi\""), "\"say \\\"hi\\\"\"");
    }

    #[test]
    fn codex_notify_toml_is_a_valid_toml_array_assignment() {
        let s = codex_notify_toml(
            r"C:\a\recue.exe",
            "http://127.0.0.1:9/turn?token=t&kind=finished",
            "sid-1",
        );
        // Parses back as TOML with a 4-element notify array, backslashes intact.
        let parsed: toml_lite::Value = toml_lite::parse(&s);
        let arr = parsed.array("notify");
        assert_eq!(arr.len(), 4);
        assert_eq!(arr[0], r"C:\a\recue.exe");
        assert_eq!(arr[1], "--hook-forward");
        assert_eq!(arr[3], "sid-1");
    }

    #[test]
    fn claude_settings_json_has_three_http_hooks_with_the_port_and_token() {
        let json = claude_settings_json(4321, "secret");
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        let stop = &v["hooks"]["Stop"][0]["hooks"][0];
        assert_eq!(stop["type"], "http");
        assert!(stop["url"].as_str().unwrap().contains("127.0.0.1:4321"));
        assert!(stop["url"].as_str().unwrap().contains("token=secret"));
        assert!(stop["url"].as_str().unwrap().ends_with("kind=finished"));
        // Notification matchers distinguish approval vs idle.
        let notif = v["hooks"]["Notification"].as_array().unwrap();
        let approval = notif
            .iter()
            .find(|n| n["matcher"] == "permission_prompt")
            .unwrap();
        assert!(approval["hooks"][0]["url"]
            .as_str()
            .unwrap()
            .ends_with("kind=approval"));
        let idle = notif
            .iter()
            .find(|n| n["matcher"] == "idle_prompt")
            .unwrap();
        assert!(idle["hooks"][0]["url"]
            .as_str()
            .unwrap()
            .ends_with("kind=finished"));
    }

    // A tiny TOML reader — just enough to validate `codex_notify_toml` output without
    // pulling a `toml` dependency into the crate.
    mod toml_lite {
        pub struct Value(String);
        pub fn parse(s: &str) -> Value {
            Value(s.to_string())
        }
        impl Value {
            /// Extract the string elements of `<key>=[ "a", "b", ... ]`.
            pub fn array(&self, key: &str) -> Vec<String> {
                let rest = self
                    .0
                    .split_once(&format!("{key}=["))
                    .expect("key not found")
                    .1;
                let inner = rest.split_once(']').expect("no closing bracket").0;
                let mut out = Vec::new();
                let mut chars = inner.chars().peekable();
                while let Some(&c) = chars.peek() {
                    if c == '"' {
                        chars.next();
                        let mut s = String::new();
                        while let Some(c) = chars.next() {
                            match c {
                                '\\' => match chars.next() {
                                    Some('\\') => s.push('\\'),
                                    Some('"') => s.push('"'),
                                    Some('n') => s.push('\n'),
                                    Some('r') => s.push('\r'),
                                    Some('t') => s.push('\t'),
                                    Some(o) => s.push(o),
                                    None => {}
                                },
                                '"' => break,
                                _ => s.push(c),
                            }
                        }
                        out.push(s);
                    } else {
                        chars.next();
                    }
                }
                out
            }
        }
    }
}
