//! 5-hour Claude session-usage reader (#154).
//!
//! Reads the user's Claude OAuth access token (the `~/.claude/.credentials.json`
//! file first, then the macOS Keychain) and GETs the undocumented
//! `https://api.anthropic.com/api/oauth/usage` endpoint — the same source Claude
//! Code's own `/usage` uses — returning a tiny serializable snapshot of the
//! **five-hour** window's used-percentage + reset time.
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

use std::time::Duration;

use serde::Serialize;

const USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
const OAUTH_BETA: &str = "oauth-2025-04-20";
/// The `claude-code/<ver>` prefix is what moves the request off the throttled
/// bucket; the exact patch version is not validated by the endpoint, so a
/// roughly-current constant is enough.
const CLAUDE_CODE_UA: &str = "claude-code/2.1.0";
const HTTP_TIMEOUT: Duration = Duration::from_secs(8);

/// What the frontend receives. `used_percent` is validated + clamped to 0–100 here;
/// `resets_at` is passed through raw (an ISO-8601 string, or a stringified unix
/// timestamp) so JS owns the countdown clock without a date crate in Rust.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSnapshot {
    /// 0–100, clamped.
    pub used_percent: f64,
    /// Raw `resets_at` (ISO-8601 or stringified unix secs/ms), or `None`.
    pub resets_at: Option<String>,
}

/// Frontend-polled command (~180s cadence). Sync → Tauri runs it off the main
/// thread, so the bounded blocking call won't freeze the UI. Fail-open: any
/// failure → `None` → the bar hides.
#[tauri::command]
pub fn claude_session_usage() -> Option<UsageSnapshot> {
    let token = read_oauth_token()?;
    let body = fetch_usage(&token)?; // token dropped right after this returns
    parse_snapshot(&body)
}

/// Read the OAuth access token: the prompt-free file first, then the Keychain.
fn read_oauth_token() -> Option<String> {
    read_token_from_file().or_else(read_token_from_keychain)
}

/// `~/.claude/.credentials.json` — prompt-free. Located via `$HOME` like `title.rs`.
/// Often absent on macOS (where the Keychain is canonical), present on Linux.
fn read_token_from_file() -> Option<String> {
    let home = std::env::var_os("HOME")?;
    let path = std::path::PathBuf::from(home)
        .join(".claude")
        .join(".credentials.json");
    let raw = std::fs::read_to_string(path).ok()?;
    token_from_json(&raw)
}

/// macOS Keychain item `Claude Code-credentials` — its password value is the same
/// JSON blob. NOTE: the first access triggers a one-time Keychain allow-prompt
/// (ClaudeCue is a different app than `claude`); a denial errors here and we fail
/// open (bar hidden).
fn read_token_from_keychain() -> Option<String> {
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

/// Tolerant token extraction: `claudeAiOauth.accessToken` (the macOS shape) else a
/// top-level `access_token`. Never logs the value.
fn token_from_json(raw: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(raw.trim()).ok()?;
    let tok = v
        .get("claudeAiOauth")
        .and_then(|o| o.get("accessToken"))
        .or_else(|| v.get("access_token"))
        .and_then(|t| t.as_str())?;
    let tok = tok.trim();
    if tok.is_empty() {
        None
    } else {
        Some(tok.to_string())
    }
}

/// One blocking HTTPS GET. ureq maps any `>= 400` status (incl. 401/403/429) to
/// `Err`, which we collapse to `None` (fail-open, no retry storm this tick).
fn fetch_usage(token: &str) -> Option<serde_json::Value> {
    let resp = ureq::get(USAGE_URL)
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
    })
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

    #[test]
    fn token_from_both_shapes() {
        assert_eq!(
            token_from_json(r#"{"claudeAiOauth":{"accessToken":" abc "}}"#).as_deref(),
            Some("abc")
        );
        assert_eq!(
            token_from_json(r#"{"access_token":"xyz"}"#).as_deref(),
            Some("xyz")
        );
        assert_eq!(token_from_json(r#"{"claudeAiOauth":{}}"#), None);
        assert_eq!(
            token_from_json(r#"{"claudeAiOauth":{"accessToken":""}}"#),
            None
        );
        assert_eq!(token_from_json("not json"), None);
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
}
