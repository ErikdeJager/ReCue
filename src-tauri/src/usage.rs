//! 5-hour Claude session-usage reader (#154).
//!
//! Reads the user's Claude OAuth access token (the `~/.claude/.credentials.json`
//! file first, then the macOS Keychain) and GETs the undocumented
//! `https://api.anthropic.com/api/oauth/usage` endpoint — the same source Claude
//! Code's own `/usage` uses — returning a tiny serializable snapshot of the
//! **five-hour** window's used-percentage + reset time.
//!
//! Token selection is **expiry-aware** (#316): recent Claude Code versions can leave
//! an **expired** access token in `~/.claude/.credentials.json` while keeping a fresh
//! one in the macOS Keychain, so we prefer the file token only while it is *not*
//! expired (its `expiresAt`, epoch ms) and otherwise fall through to the Keychain.
//! A fresh file token short-circuits the Keychain read entirely (no gratuitous
//! Keychain allow-prompt). Windows/Linux have no Keychain, so the file is the sole
//! source there — and Claude keeps it fresh there anyway.
//!
//! EVERYTHING here is fail-open: a missing token, an HTTP error (401/403/429/5xx),
//! a response-shape mismatch, or a missing `five_hour` block all return `None` so
//! the UI simply hides the usage bar. The OAuth token NEVER crosses into JS (only
//! the `UsageSnapshot` does) and is NEVER logged — it lives only inside the
//! `Authorization` header string and is dropped when the request returns.
//!
//! The endpoint and its response shape are community-reverse-engineered and
//! undocumented (same fragility class as the `--session-id`/`--resume` flags in
//! CLAUDE.md). The `User-Agent: claude-code/<ver>` header is load-bearing: without
//! it the endpoint lands in an aggressively rate-limited bucket (persistent 429s).

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;

const USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
const OAUTH_BETA: &str = "oauth-2025-04-20";
/// The `claude-code/<ver>` prefix is what moves the request off the throttled
/// bucket; the exact patch version is not validated by the endpoint, so a
/// roughly-current constant is enough (kept loosely in step with the installed CLI).
const CLAUDE_CODE_UA: &str = "claude-code/2.1.193";
const HTTP_TIMEOUT: Duration = Duration::from_secs(8);

/// What the frontend receives. `used_percent` is validated + clamped to 0–100 here;
/// `resets_at` is passed through raw (an ISO-8601 string, or a stringified unix
/// timestamp) so JS owns the countdown clock without a date crate in Rust.
///
/// `buckets` (#370) carries **every** usage window the API reports (five-hour, weekly,
/// …) as a generic list, so the sidebar's expandable "all usage" viewer is adaptive —
/// a new metric added by Anthropic appears with no code change. The `used_percent` /
/// `resets_at` scalars keep the five-hour window verbatim for the existing bar, so
/// nothing about the five-hour path changes; `buckets` is purely additive.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSnapshot {
    /// 0–100, clamped.
    pub used_percent: f64,
    /// Raw `resets_at` (ISO-8601 or stringified unix secs/ms), or `None`.
    pub resets_at: Option<String>,
    /// All usage windows the API reports (#370), adaptive; the frontend orders/labels.
    pub buckets: Vec<UsageBucket>,
}

/// One usage window (#370): a top-level object in the usage response that carries a
/// percentage (`five_hour`, `seven_day`, …). Serialized camelCase like `UsageSnapshot`.
/// `key` is the raw API key; the frontend humanizes + orders it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageBucket {
    /// Raw API key, e.g. `"five_hour"`.
    pub key: String,
    /// 0–100, clamped.
    pub used_percent: f64,
    /// Raw `resets_at` (ISO-8601 or stringified unix secs/ms), or `None`.
    pub resets_at: Option<String>,
}

/// An OAuth access token plus its optional expiry (epoch **milliseconds**). A token
/// whose expiry is unknown (`None`) is treated as **usable** — we never filter out a
/// token just because the credentials source omitted or mangled `expiresAt`.
#[derive(Debug, Clone, PartialEq)]
struct OauthToken {
    access_token: String,
    /// Epoch ms, iff the source carried a numeric `expiresAt` / `expires_at`.
    expires_at: Option<i64>,
}

impl OauthToken {
    /// Expired iff we KNOW the expiry and `now` is at/after it. Unknown expiry ⇒ not
    /// expired (usable), so a missing/garbled field never hides the bar.
    fn is_expired(&self, now_ms: i64) -> bool {
        self.expires_at.is_some_and(|e| now_ms >= e)
    }
}

/// The blocking usage fetch (~180s cadence, 45s while armed): read the OAuth
/// token, GET the usage endpoint, parse the snapshot. Every step is fail-open — a
/// missing token, an HTTP error, or a shape mismatch each returns `None` (bar
/// hides), with a token-free `usage_diag` breadcrumb.
///
/// Runs on the **auto-continue engine thread** (task 430, `autocontinue::run`) —
/// never the main thread (#328: the blocking credentials read, the up-to-8s `ureq`
/// HTTPS GET, and the macOS `security` subprocess spawn would freeze the whole
/// native UI until the request returned; the old frontend-polled
/// `claude_session_usage` command wrapped this in `spawn_blocking` for the same
/// reason, before Rust took over the poll).
pub(crate) fn usage_snapshot_blocking() -> Option<UsageSnapshot> {
    let token = read_oauth_token()?.access_token; // token dropped right after fetch
    snapshot_from_fetch(fetch_usage(&token))
}

/// The fetch-result → snapshot step of `usage_snapshot_blocking` (factored out
/// for the unit tests): an HTTP miss and a response-shape mismatch each fail
/// open to `None`, with a token-free `usage_diag` breadcrumb naming which step.
fn snapshot_from_fetch(body: Option<serde_json::Value>) -> Option<UsageSnapshot> {
    let Some(body) = body else {
        usage_diag("http miss");
        return None;
    };
    match parse_snapshot(&body) {
        Some(snap) => Some(snap),
        None => {
            usage_diag("parse miss");
            None
        }
    }
}

/// Read the OAuth token, expiry-aware and prompt-frugal (#316): a **fresh** file
/// token short-circuits and the Keychain is never touched (no allow-prompt). Only a
/// missing/expired file token falls through to the Keychain, and `select_token`
/// (pure) picks the non-expired source, preferring the file. The Keychain step is
/// macOS-only (`read_token_from_keychain` is a no-op stub elsewhere), so on
/// **Windows/Linux** the credentials file is the sole source — canonical there anyway,
/// since they have no Keychain and `claude` keeps the file token fresh (#140).
fn read_oauth_token() -> Option<OauthToken> {
    let now_ms = now_ms();
    pick_oauth_token(read_token_from_file(), read_token_from_keychain, now_ms)
}

/// Core of `read_oauth_token`, with the Keychain read as a **lazy** closure
/// (factored out so the unit tests can prove the prompt-frugal short-circuit):
/// a fresh file token returns WITHOUT invoking the Keychain read (no
/// allow-prompt, #316); otherwise `select_token` (pure) picks over both
/// sources, with the token-free diagnostics.
fn pick_oauth_token(
    file: Option<OauthToken>,
    read_keychain: impl FnOnce() -> Option<OauthToken>,
    now_ms: i64,
) -> Option<OauthToken> {
    // Common path: a fresh file token — return it WITHOUT reading the Keychain.
    if file.as_ref().is_some_and(|t| !t.is_expired(now_ms)) {
        return file;
    }
    let keychain = read_keychain();
    let picked = select_token(file, keychain, now_ms);
    match &picked {
        None => usage_diag("no token"),
        Some(t) if t.is_expired(now_ms) => usage_diag("token expired, no fresher source"),
        Some(_) => {}
    }
    picked
}

/// Pure, testable token selector: prefer a **non-expired** token (file first, then
/// Keychain); if none is fresh, fall back to whichever is present (file preferred)
/// even when expired — preserving today's fail-open-at-HTTP behavior (the stale token
/// simply 401s and the bar hides). Empty inputs ⇒ `None`.
fn select_token(
    file: Option<OauthToken>,
    keychain: Option<OauthToken>,
    now_ms: i64,
) -> Option<OauthToken> {
    if file.as_ref().is_some_and(|t| !t.is_expired(now_ms)) {
        return file;
    }
    if keychain.as_ref().is_some_and(|t| !t.is_expired(now_ms)) {
        return keychain;
    }
    file.or(keychain)
}

/// Current wall-clock epoch **milliseconds**. Fail-open to `0` on the (impossible)
/// pre-1970 error, which just makes every known-expiry token read as not-yet-expired.
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// `~/.claude/.credentials.json` — prompt-free. Located via the cross-platform
/// `home_dir()` (`$HOME` on unix, `%USERPROFILE%` on Windows, #140) like `title.rs`.
/// Often absent on macOS (where the Keychain is canonical), present on Windows/Linux.
fn read_token_from_file() -> Option<OauthToken> {
    let raw = read_raw_credentials_from(credentials_path()?)?;
    token_from_json(&raw)
}

/// `~/.claude/.credentials.json` via the cross-platform `home_dir()` (never raw `$HOME`).
fn credentials_path() -> Option<std::path::PathBuf> {
    Some(
        crate::path_env::home_dir()?
            .join(".claude")
            .join(".credentials.json"),
    )
}

/// The credentials file's **verbatim** contents (blank/unreadable ⇒ `None`). Explicit
/// path so the unit test can point it at a temp file. Never logged.
fn read_raw_credentials_from(path: std::path::PathBuf) -> Option<String> {
    let raw = std::fs::read_to_string(path).ok()?;
    if raw.trim().is_empty() {
        None
    } else {
        Some(raw)
    }
}

/// The RAW credentials JSON blob (verbatim — refresh token and any future fields ride
/// along) for seeding a dev-container's per-session home. Deliberately NOT the parsed
/// `OauthToken`, which keeps only the access token + expiry and would strand the
/// container's `claude` without a refresh path. Freshness-aware like `read_oauth_token`
/// (#316): a file whose access token is still valid wins (no Keychain allow-prompt);
/// otherwise the macOS Keychain blob, falling back to the stale file as a last resort
/// (its refresh token may still work). Never logged.
pub(crate) fn read_raw_credentials() -> Option<String> {
    let file = credentials_path().and_then(read_raw_credentials_from);
    let now_ms = now_ms();
    pick_raw_credentials(file, read_raw_keychain, now_ms)
}

/// Core of `read_raw_credentials`, with the Keychain read as a **lazy** closure
/// (factored out so the unit tests can prove the no-gratuitous-prompt path): a
/// file blob whose access token is still valid wins WITHOUT invoking the
/// Keychain; otherwise the Keychain blob, falling back to the stale file as a
/// last resort (its refresh token may still work).
fn pick_raw_credentials(
    file: Option<String>,
    read_keychain: impl FnOnce() -> Option<String>,
    now_ms: i64,
) -> Option<String> {
    if let Some(raw) = &file {
        if token_from_json(raw).is_some_and(|t| !t.is_expired(now_ms)) {
            return file;
        }
    }
    read_keychain().or(file)
}

/// The macOS Keychain blob, verbatim (`security … -w` prints the item's password —
/// the same JSON `claude` writes to the credentials file). Same one-time allow-prompt
/// caveat as `read_token_from_keychain`.
#[cfg(target_os = "macos")]
fn read_raw_keychain() -> Option<String> {
    let out = std::process::Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            "Claude Code-credentials",
            "-w",
        ])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let raw = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if raw.is_empty() {
        None
    } else {
        Some(raw)
    }
}

/// Non-macOS stub — no Keychain; the credentials file is the only raw source.
#[cfg(not(target_os = "macos"))]
fn read_raw_keychain() -> Option<String> {
    None
}

/// macOS Keychain item `Claude Code-credentials` — its password value is the same
/// JSON blob. NOTE: the first access triggers a one-time Keychain allow-prompt
/// (ReCue is a different app than `claude`); a denial errors here and we fail
/// open (bar hidden). The `security` CLI is macOS-only, so this is gated to macOS;
/// on Windows/Linux the credentials file above is the sole token source.
#[cfg(target_os = "macos")]
fn read_token_from_keychain() -> Option<OauthToken> {
    let out = std::process::Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            "Claude Code-credentials",
            "-w",
        ])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    token_from_json(&String::from_utf8_lossy(&out.stdout))
}

/// Non-macOS stub: there is no Keychain (Windows/Linux), so the credentials file is
/// the only source. Keeps `read_oauth_token`'s fall-through identical across platforms.
#[cfg(not(target_os = "macos"))]
fn read_token_from_keychain() -> Option<OauthToken> {
    None
}

/// Tolerant token extraction: `claudeAiOauth.accessToken` (the macOS shape) else a
/// top-level `access_token`, plus the matching expiry (`claudeAiOauth.expiresAt` else
/// top-level `expires_at`, epoch ms). Never logs the value. Missing/garbage expiry ⇒
/// `expires_at: None` (unknown ⇒ usable). Returns `None` when the access token is
/// empty/absent.
fn token_from_json(raw: &str) -> Option<OauthToken> {
    let v: serde_json::Value = serde_json::from_str(raw.trim()).ok()?;
    let oauth = v.get("claudeAiOauth");
    let tok = oauth
        .and_then(|o| o.get("accessToken"))
        .or_else(|| v.get("access_token"))
        .and_then(|t| t.as_str())?;
    let tok = tok.trim();
    if tok.is_empty() {
        return None;
    }
    let expires_at = oauth
        .and_then(|o| o.get("expiresAt"))
        .or_else(|| v.get("expires_at"))
        .and_then(value_to_epoch_ms);
    Some(OauthToken {
        access_token: tok.to_string(),
        expires_at,
    })
}

/// Read an epoch-millisecond value tolerantly: a JSON integer, a JSON float
/// (truncated), or a numeric string. Anything else ⇒ `None` (unknown expiry).
fn value_to_epoch_ms(v: &serde_json::Value) -> Option<i64> {
    match v {
        serde_json::Value::Number(n) => n.as_i64().or_else(|| n.as_f64().map(|f| f as i64)),
        serde_json::Value::String(s) => {
            let s = s.trim();
            s.parse::<i64>()
                .ok()
                .or_else(|| s.parse::<f64>().ok().map(|f| f as i64))
        }
        _ => None,
    }
}

/// A single-line, **token-free** fail-open diagnostic (#316): only a coarse category —
/// never the token, headers, or response body — so "why did the usage bar vanish?" is
/// answerable from logs without ever leaking a secret.
fn usage_diag(category: &str) {
    eprintln!("usage: {category}");
}

/// One blocking HTTPS GET of the real usage endpoint. See `fetch_usage_at`.
fn fetch_usage(token: &str) -> Option<serde_json::Value> {
    fetch_usage_at(USAGE_URL, token)
}

/// Core of `fetch_usage` over an explicit URL (factored out so the unit tests
/// can point it at a loopback responder). ureq maps any `>= 400` status (incl.
/// 401/403/429) to `Err`, which we collapse to `None` (fail-open, no retry
/// storm this tick).
fn fetch_usage_at(url: &str, token: &str) -> Option<serde_json::Value> {
    let resp = ureq::get(url)
        .timeout(HTTP_TIMEOUT)
        .set("Authorization", &format!("Bearer {token}"))
        .set("anthropic-beta", OAUTH_BETA)
        .set("User-Agent", CLAUDE_CODE_UA)
        .call();
    let body = resp.ok()?.into_string().ok()?;
    serde_json::from_str(&body).ok()
}

/// Defensive parse: require a `five_hour` block; accept `utilization` OR
/// `used_percentage`; require a finite number; clamp 0–100. `resets_at` is
/// stringified for JS. Any mismatch → `None`.
fn parse_snapshot(v: &serde_json::Value) -> Option<UsageSnapshot> {
    let fh = v.get("five_hour")?;
    let used = fh
        .get("utilization")
        .or_else(|| fh.get("used_percentage"))
        .and_then(serde_json::Value::as_f64)?;
    if !used.is_finite() {
        return None;
    }
    let resets_at = fh.get("resets_at").and_then(value_to_string);
    Some(UsageSnapshot {
        used_percent: used.clamp(0.0, 100.0),
        resets_at,
        buckets: parse_buckets(v),
    })
}

/// Adaptive scan of every usage window in the response (#370): iterate the top-level
/// object and keep each `(key, val)` where `val` is an object carrying a **finite**
/// `utilization` OR `used_percentage` number. Non-object values and objects without a
/// numeric percentage (metadata fields) are skipped — genuine windows always carry a
/// percentage. Clamped 0–100; `resets_at` is stringified for JS. `serde_json` has no
/// `preserve_order` here, so iteration is deterministic (alphabetical); the frontend
/// owns the final ordering + labels.
fn parse_buckets(v: &serde_json::Value) -> Vec<UsageBucket> {
    let Some(obj) = v.as_object() else {
        return Vec::new();
    };
    obj.iter()
        .filter_map(|(key, val)| {
            let val = val.as_object()?;
            let pct = val
                .get("utilization")
                .or_else(|| val.get("used_percentage"))
                .and_then(serde_json::Value::as_f64)?;
            if !pct.is_finite() {
                return None;
            }
            Some(UsageBucket {
                key: key.clone(),
                used_percent: pct.clamp(0.0, 100.0),
                resets_at: val.get("resets_at").and_then(value_to_string),
            })
        })
        .collect()
}

/// A JSON string → its inner string; a JSON number → its decimal text; else `None`.
fn value_to_string(v: &serde_json::Value) -> Option<String> {
    match v {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::cell::Cell;
    use std::sync::mpsc;

    fn tok(access: &str, expires_at: Option<i64>) -> OauthToken {
        OauthToken {
            access_token: access.to_string(),
            expires_at,
        }
    }

    /// The dev-container seed reads the credentials file **verbatim** — unknown
    /// fields (above all the refresh token) must survive, which is exactly why the
    /// parsed `OauthToken` readers couldn't be reused for seeding.
    #[test]
    fn raw_credentials_are_returned_verbatim() {
        let mut path = std::env::temp_dir();
        path.push(format!("recue-usage-raw-{}.json", std::process::id()));
        let blob = r#"{"claudeAiOauth":{"accessToken":"abc","refreshToken":"keep-me","expiresAt":1760000000000,"futureField":true}}"#;
        std::fs::write(&path, blob).unwrap();
        assert_eq!(
            read_raw_credentials_from(path.clone()).as_deref(),
            Some(blob),
            "the blob must ride through untouched"
        );
        // Blank / missing files read as no credentials, not as an empty seed.
        std::fs::write(&path, "   ").unwrap();
        assert_eq!(read_raw_credentials_from(path.clone()), None);
        let _ = std::fs::remove_file(&path);
        assert_eq!(read_raw_credentials_from(path), None);
    }

    #[test]
    fn token_from_both_shapes() {
        let t = token_from_json(r#"{"claudeAiOauth":{"accessToken":" abc "}}"#).unwrap();
        assert_eq!(t.access_token, "abc");
        assert_eq!(t.expires_at, None);

        let t = token_from_json(r#"{"access_token":"xyz"}"#).unwrap();
        assert_eq!(t.access_token, "xyz");
        assert_eq!(t.expires_at, None);

        assert_eq!(token_from_json(r#"{"claudeAiOauth":{}}"#), None);
        assert_eq!(
            token_from_json(r#"{"claudeAiOauth":{"accessToken":""}}"#),
            None
        );
        assert_eq!(token_from_json("not json"), None);
    }

    #[test]
    fn token_reads_expiry_number_and_string() {
        // JSON number (macOS shape).
        let t =
            token_from_json(r#"{"claudeAiOauth":{"accessToken":"a","expiresAt":1760000000000}}"#)
                .unwrap();
        assert_eq!(t.access_token, "a");
        assert_eq!(t.expires_at, Some(1_760_000_000_000));

        // Numeric string.
        let t =
            token_from_json(r#"{"claudeAiOauth":{"accessToken":"a","expiresAt":"1760000000000"}}"#)
                .unwrap();
        assert_eq!(t.expires_at, Some(1_760_000_000_000));

        // Top-level snake_case shape.
        let t = token_from_json(r#"{"access_token":"a","expires_at":1234}"#).unwrap();
        assert_eq!(t.expires_at, Some(1234));

        // A JSON float truncates to i64.
        let t = token_from_json(r#"{"access_token":"a","expires_at":1234.9}"#).unwrap();
        assert_eq!(t.expires_at, Some(1234));
    }

    #[test]
    fn token_expiry_absent_or_garbage_is_none() {
        for raw in [
            r#"{"claudeAiOauth":{"accessToken":"a"}}"#,
            r#"{"claudeAiOauth":{"accessToken":"a","expiresAt":"soon"}}"#,
            r#"{"claudeAiOauth":{"accessToken":"a","expiresAt":null}}"#,
            r#"{"claudeAiOauth":{"accessToken":"a","expiresAt":true}}"#,
            r#"{"claudeAiOauth":{"accessToken":"a","expiresAt":{}}}"#,
        ] {
            let t = token_from_json(raw).unwrap();
            assert_eq!(t.access_token, "a");
            assert_eq!(t.expires_at, None, "raw: {raw}");
        }
    }

    #[test]
    fn is_expired_semantics() {
        let known = tok("a", Some(1000));
        assert!(known.is_expired(1000), "at expiry ⇒ expired");
        assert!(known.is_expired(1001));
        assert!(!known.is_expired(999));
        // Unknown expiry ⇒ usable (never filtered out).
        assert!(!tok("a", None).is_expired(i64::MAX));
    }

    #[test]
    fn select_prefers_fresh_and_falls_back() {
        let now = 1_000_000_i64;
        let fresh = |id: &str| Some(tok(id, Some(now + 10_000)));
        let stale = |id: &str| Some(tok(id, Some(now - 10_000)));
        let unknown = |id: &str| Some(tok(id, None));

        // Fresh file used; Keychain irrelevant.
        assert_eq!(
            select_token(fresh("file"), fresh("kc"), now)
                .unwrap()
                .access_token,
            "file"
        );
        // Fresh file with no Keychain (Windows/Linux, or macOS Keychain absent).
        assert_eq!(
            select_token(fresh("file"), None, now).unwrap().access_token,
            "file"
        );
        // Expired file ⇒ fresh Keychain wins (the #316 bug's fix).
        assert_eq!(
            select_token(stale("file"), fresh("kc"), now)
                .unwrap()
                .access_token,
            "kc"
        );
        // Missing file ⇒ fresh Keychain used (unchanged fall-through).
        assert_eq!(
            select_token(None, fresh("kc"), now).unwrap().access_token,
            "kc"
        );
        // Unknown-expiry file is usable ⇒ preferred over the Keychain.
        assert_eq!(
            select_token(unknown("file"), fresh("kc"), now)
                .unwrap()
                .access_token,
            "file"
        );
        // All expired ⇒ fall back to file (preferred), even though expired.
        assert_eq!(
            select_token(stale("file"), stale("kc"), now)
                .unwrap()
                .access_token,
            "file"
        );
        // Only an expired Keychain present ⇒ fall back to it.
        assert_eq!(
            select_token(None, stale("kc"), now).unwrap().access_token,
            "kc"
        );
        // Nothing anywhere ⇒ None (bar hides).
        assert_eq!(select_token(None, None, now), None);
    }

    #[test]
    fn pick_oauth_token_short_circuits_on_a_fresh_file_token() {
        let now = 1_000_000_i64;
        let picked = pick_oauth_token(
            Some(tok("file", Some(now + 60_000))),
            || unreachable!("a fresh file token must never trigger the Keychain read (#316)"),
            now,
        );
        assert_eq!(picked.unwrap().access_token, "file");
    }

    #[test]
    fn pick_oauth_token_reads_the_keychain_only_on_the_slow_path() {
        let now = 1_000_000_i64;
        // Expired file → the Keychain IS read, and its fresh token wins.
        let keychain_read = Cell::new(false);
        let picked = pick_oauth_token(
            Some(tok("file", Some(now - 60_000))),
            || {
                keychain_read.set(true);
                Some(tok("kc", Some(now + 60_000)))
            },
            now,
        );
        assert_eq!(picked.unwrap().access_token, "kc");
        assert!(keychain_read.get());
        // Nothing anywhere → None (the "no token" breadcrumb path).
        assert_eq!(pick_oauth_token(None, || None, now), None);
        // Only an expired token left → still returned (it just 401s and the bar
        // hides — the "token expired, no fresher source" breadcrumb path).
        let picked = pick_oauth_token(Some(tok("file", Some(now - 1))), || None, now);
        assert_eq!(picked.unwrap().access_token, "file");
    }

    #[test]
    fn pick_raw_credentials_prefers_a_fresh_file_without_touching_the_keychain() {
        let now = 1_000_000_i64;
        let fresh = format!(
            r#"{{"claudeAiOauth":{{"accessToken":"a","refreshToken":"keep","expiresAt":{}}}}}"#,
            now + 60_000
        );
        let got = pick_raw_credentials(
            Some(fresh.clone()),
            || unreachable!("a fresh file blob must never trigger the Keychain read"),
            now,
        );
        assert_eq!(got.as_deref(), Some(fresh.as_str()), "verbatim file blob");
    }

    #[test]
    fn pick_raw_credentials_falls_through_to_keychain_then_stale_file() {
        let now = 1_000_000_i64;
        let stale = format!(
            r#"{{"claudeAiOauth":{{"accessToken":"a","expiresAt":{}}}}}"#,
            now - 60_000
        );
        // Stale file + a Keychain blob → the Keychain wins.
        assert_eq!(
            pick_raw_credentials(Some(stale.clone()), || Some("kc-blob".to_string()), now)
                .as_deref(),
            Some("kc-blob")
        );
        // Stale file, no Keychain → the stale file is the last resort (its
        // refresh token may still work).
        assert_eq!(
            pick_raw_credentials(Some(stale.clone()), || None, now).as_deref(),
            Some(stale.as_str())
        );
        // A blob with no parseable token still rides through as the last resort.
        assert_eq!(
            pick_raw_credentials(Some("junk".to_string()), || None, now).as_deref(),
            Some("junk")
        );
        // Nothing anywhere → None.
        assert_eq!(pick_raw_credentials(None, || None, now), None);
    }

    #[test]
    fn now_ms_is_epoch_milliseconds() {
        let now = now_ms();
        // Milliseconds, not seconds: any clock this can run on is far past 2020
        // (~1.6e12 ms) and far before the year 2500 (~1.7e13 ms). A seconds-unit
        // regression (~1.7e9) or a nanoseconds one (~1.7e18) fails loudly.
        assert!(now > 1_600_000_000_000, "not epoch ms: {now}");
        assert!(now < 17_000_000_000_000, "not epoch ms: {now}");
    }

    #[test]
    fn credentials_path_is_the_claude_file_under_home() {
        // Every test environment (unix `HOME` / Windows `USERPROFILE`) has a home.
        let home = crate::path_env::home_dir().expect("test env has a home dir");
        assert_eq!(
            credentials_path(),
            Some(home.join(".claude").join(".credentials.json"))
        );
    }

    /// Differential over the REAL credentials file (read-only): `read_token_from_file`
    /// is exactly the path → raw-read → parse composition. Plain `assert!` (never
    /// `assert_eq!`) so a failure can never Debug-print a real token.
    #[test]
    fn read_token_from_file_is_the_read_then_parse_composition() {
        let via_parts = credentials_path()
            .and_then(read_raw_credentials_from)
            .and_then(|raw| token_from_json(&raw));
        assert!(
            read_token_from_file() == via_parts,
            "read_token_from_file must equal credentials_path → read → token_from_json"
        );
    }

    /// Off macOS there is no Keychain: the stubs report nothing, so the top-level
    /// readers must equal their file-only compositions — the documented "the
    /// credentials file is the sole source" contract (#140). macOS is excluded
    /// because there the real Keychain fns would spawn `security` (an allow-prompt).
    #[cfg(not(target_os = "macos"))]
    #[test]
    fn off_macos_the_credentials_file_is_the_sole_source() {
        assert_eq!(read_token_from_keychain(), None);
        assert_eq!(read_raw_keychain(), None);
        // Plain `assert!` so a failure never Debug-prints a real token.
        assert!(read_oauth_token() == read_token_from_file());
        assert!(read_raw_credentials() == credentials_path().and_then(read_raw_credentials_from));
    }

    #[test]
    fn parses_utilization_and_iso_resets() {
        let v = json!({"five_hour":{"utilization":33.0,"resets_at":"2026-04-11T07:00:00+00:00"}});
        let s = parse_snapshot(&v).unwrap();
        assert_eq!(s.used_percent, 33.0);
        assert_eq!(s.resets_at.as_deref(), Some("2026-04-11T07:00:00+00:00"));
    }

    #[test]
    fn accepts_alt_field_and_clamps_and_numeric_resets() {
        let v = json!({"five_hour":{"used_percentage":140,"resets_at":1760166000}});
        let s = parse_snapshot(&v).unwrap();
        assert_eq!(s.used_percent, 100.0);
        assert_eq!(s.resets_at.as_deref(), Some("1760166000"));
    }

    #[test]
    fn missing_block_or_field_is_none() {
        assert!(parse_snapshot(&json!({"seven_day":{}})).is_none());
        assert!(parse_snapshot(&json!({"five_hour":{}})).is_none());
        assert!(parse_snapshot(&json!({"five_hour":{"utilization":"nope"}})).is_none());
    }

    #[test]
    fn parse_buckets_includes_all_windows() {
        let v = json!({
            "five_hour": {"utilization": 33.0, "resets_at": "2026-04-11T07:00:00+00:00"},
            "seven_day": {"used_percentage": 12, "resets_at": 1760166000},
        });
        let buckets = parse_buckets(&v);
        assert_eq!(buckets.len(), 2);
        let fh = buckets.iter().find(|b| b.key == "five_hour").unwrap();
        assert_eq!(fh.used_percent, 33.0);
        assert_eq!(fh.resets_at.as_deref(), Some("2026-04-11T07:00:00+00:00"));
        // The alternate percent field + numeric resets are accepted just like five_hour.
        let sd = buckets.iter().find(|b| b.key == "seven_day").unwrap();
        assert_eq!(sd.used_percent, 12.0);
        assert_eq!(sd.resets_at.as_deref(), Some("1760166000"));
    }

    #[test]
    fn parse_buckets_is_adaptive_and_clamps() {
        // A key the code has never heard of is still surfaced (#370 adaptivity), and its
        // percentage is clamped 0–100 exactly like the five-hour scalar.
        let v = json!({
            "monthly": {"utilization": 140.0},
            "five_hour": {"utilization": 10.0},
        });
        let buckets = parse_buckets(&v);
        let monthly = buckets.iter().find(|b| b.key == "monthly").unwrap();
        assert_eq!(monthly.used_percent, 100.0);
        assert_eq!(monthly.resets_at, None);
    }

    #[test]
    fn parse_buckets_skips_non_windows() {
        // Non-object values and objects without a numeric percentage (metadata) are
        // skipped — only genuine windows (carrying a percentage) survive.
        let v = json!({
            "five_hour": {"utilization": 5.0},
            "version": "1.2.3",
            "meta": {"note": "no percentage here"},
            "bad_pct": {"utilization": "nope"},
        });
        let buckets = parse_buckets(&v);
        assert_eq!(buckets.len(), 1);
        assert_eq!(buckets[0].key, "five_hour");
    }

    #[test]
    fn snapshot_carries_all_buckets() {
        let v = json!({
            "five_hour": {"utilization": 33.0, "resets_at": "x"},
            "seven_day": {"utilization": 50.0},
        });
        let s = parse_snapshot(&v).unwrap();
        // Five-hour scalars unchanged…
        assert_eq!(s.used_percent, 33.0);
        assert_eq!(s.resets_at.as_deref(), Some("x"));
        // …and the generic list carries every window.
        assert_eq!(s.buckets.len(), 2);
        assert!(s.buckets.iter().any(|b| b.key == "five_hour"));
        assert!(s.buckets.iter().any(|b| b.key == "seven_day"));
    }

    #[test]
    fn parse_buckets_of_a_non_object_response_is_empty() {
        assert!(parse_buckets(&json!(["not", "an", "object"])).is_empty());
        assert!(parse_buckets(&json!("string")).is_empty());
    }

    #[test]
    fn value_to_string_accepts_only_strings_and_numbers() {
        assert_eq!(value_to_string(&json!("iso")), Some("iso".to_string()));
        assert_eq!(
            value_to_string(&json!(1760166000)),
            Some("1760166000".to_string())
        );
        assert_eq!(value_to_string(&json!(null)), None);
        assert_eq!(value_to_string(&json!(true)), None);
        assert_eq!(value_to_string(&json!({})), None);
    }

    #[test]
    fn snapshot_from_fetch_fails_open_on_miss_and_mismatch() {
        // HTTP miss → None (the "http miss" breadcrumb path).
        assert_eq!(snapshot_from_fetch(None), None);
        // A body without a five_hour block → None (the "parse miss" path).
        assert_eq!(snapshot_from_fetch(Some(json!({"seven_day":{}}))), None);
        // A well-shaped body rides through parse_snapshot unchanged.
        let snap = snapshot_from_fetch(Some(json!({"five_hour":{"utilization":12.5}}))).unwrap();
        assert_eq!(snap.used_percent, 12.5);
        assert_eq!(snap.resets_at, None);
    }

    /// A one-shot loopback HTTP responder: accepts a single connection, reads the
    /// request head, hands it back through the channel, and answers with the given
    /// status line + body. ureq speaks plain http to 127.0.0.1, so `fetch_usage_at`
    /// is exercised offline and deterministically.
    fn one_shot_http(
        status_line: &'static str,
        body: &'static str,
    ) -> (String, mpsc::Receiver<String>) {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let (mut sock, _) = listener.accept().expect("one connection arrives");
            let mut req = Vec::new();
            let mut buf = [0u8; 1024];
            // A GET has no body — read until the blank line ends the head
            // (or the peer closes early: n == 0).
            loop {
                let n = sock.read(&mut buf).unwrap_or(0);
                req.extend_from_slice(&buf[..n]);
                if n == 0 || req.ends_with(b"\r\n\r\n") {
                    break;
                }
            }
            let _ = tx.send(String::from_utf8_lossy(&req).into_owned());
            let resp = format!(
                "{status_line}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            let _ = sock.write_all(resp.as_bytes());
        });
        (format!("http://{addr}/"), rx)
    }

    #[test]
    fn fetch_usage_at_parses_a_200_body_and_sends_the_load_bearing_headers() {
        let (url, rx) = one_shot_http(
            "HTTP/1.1 200 OK",
            r#"{"five_hour":{"utilization":42.5,"resets_at":"soon"}}"#,
        );
        let body = fetch_usage_at(&url, "tok-123").expect("a 200 JSON body parses");
        assert_eq!(body["five_hour"]["utilization"], json!(42.5));
        let req = rx.recv().unwrap();
        assert!(req.starts_with("GET / HTTP/1.1"), "req: {req}");
        assert!(req.contains("Authorization: Bearer tok-123"), "req: {req}");
        // The claude-code UA moves the request off the throttled bucket, and the
        // beta header authorizes the OAuth token — both load-bearing.
        assert!(
            req.contains(&format!("User-Agent: {CLAUDE_CODE_UA}")),
            "req: {req}"
        );
        assert!(
            req.contains(&format!("anthropic-beta: {OAUTH_BETA}")),
            "req: {req}"
        );
    }

    #[test]
    fn fetch_usage_at_fails_open_on_http_errors_and_bad_bodies() {
        // 401 (ureq maps ≥400 to Err) → None, fail-open.
        let (url, _rx) = one_shot_http("HTTP/1.1 401 Unauthorized", "{}");
        assert_eq!(fetch_usage_at(&url, "tok"), None);
        // A 200 whose body isn't JSON → None.
        let (url, _rx) = one_shot_http("HTTP/1.1 200 OK", "not json");
        assert_eq!(fetch_usage_at(&url, "tok"), None);
        // Nothing listening at all (connection refused) → None.
        let port = std::net::TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port();
        assert_eq!(
            fetch_usage_at(&format!("http://127.0.0.1:{port}/"), "tok"),
            None
        );
    }
}
