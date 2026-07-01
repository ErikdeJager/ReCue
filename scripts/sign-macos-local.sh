#!/usr/bin/env bash
# Re-sign a locally built ReCue.app with the Hardened Runtime + ReCue's entitlements
# so macOS permissions (microphone / voice, and protected-folder access) actually
# work AND persist across relaunches. macOS-only. (#292)
#
# WHY this exists
# ---------------
# macOS TCC (Transparency, Consent & Control) pins a permission grant to the app's
# CODE SIGNATURE + bundle id. Two things must be true for a "mic"/"Downloads" prompt
# to appear once, stick after "Allow", and survive relaunch:
#   1. the com.apple.security.device.audio-input entitlement is present in the
#      signature (the NSMicrophoneUsageDescription string in Info.plist is NOT
#      enough on its own), AND the app is signed with the Hardened Runtime
#      (codesign --options runtime); and
#   2. the signature is STABLE across builds. An unsigned/ad-hoc app has no stable
#      identity, so macOS treats each launch as a brand-new app — hence "asks 5
#      times, still doesn't work".
#
# `npm run tauri build` already applies bundle.macOS.entitlements (Entitlements.plist)
# with the Hardened Runtime when a signing identity is configured. This script is the
# no-Apple-account fallback: it FORCE re-signs an already-built .app with the same
# entitlements + Hardened Runtime using either a self-signed certificate (stable,
# recommended) or an ad-hoc signature (works, but changes every build so grants do
# not persist between rebuilds).
#
# USAGE
# -----
#   ./scripts/sign-macos-local.sh <path-to-ReCue.app>
#
# e.g. after a universal build:
#   ./scripts/sign-macos-local.sh \
#     src-tauri/target/universal-apple-darwin/release/bundle/macos/ReCue.app
#
# Ad-hoc (default — quick, but per-build identity → grants reset on each rebuild):
#   ./scripts/sign-macos-local.sh path/to/ReCue.app
#
# Self-signed, STABLE identity (recommended — grants persist across rebuilds):
#   SIGN_IDENTITY="ReCue Self-Signed" ./scripts/sign-macos-local.sh path/to/ReCue.app
#
# CREATE A STABLE SELF-SIGNED CERTIFICATE (one time)
# --------------------------------------------------
# 1. Open Keychain Access.
# 2. Menu: Keychain Access ▸ Certificate Assistant ▸ Create a Certificate…
# 3. Name it (e.g. "ReCue Self-Signed"), Identity Type: "Self Signed Root",
#    Certificate Type: "Code Signing". Create.
# 4. Set SIGN_IDENTITY to that exact name (as above). Because the same certificate
#    signs every rebuild, the code signature is stable, so a granted permission
#    persists across rebuilds (an ad-hoc `-` identity does not).
#
# VERIFY THE SIGNATURE (after signing)
# ------------------------------------
#   codesign -dv --verbose=4 <path-to-ReCue.app>
#       → expect the flags line to include "runtime" (Hardened Runtime is on).
#   codesign -d --entitlements - <path-to-ReCue.app>
#       → expect it to list com.apple.security.device.audio-input.
#
# ONE-TIME RECOVERY (if an earlier broken build already poisoned TCC)
# ------------------------------------------------------------------
#   tccutil reset Microphone com.recue.app
# and remove any stale "ReCue" row under System Settings ▸ Privacy & Security ▸
# Microphone (and ▸ Files and Folders), then relaunch and re-grant once. See
# docs/macos-permissions.md for the full walkthrough.
set -euo pipefail

app="${1:?usage: sign-macos-local.sh <path-to-ReCue.app>}"
[ -d "$app" ] || {
	echo "sign-macos-local: no such .app bundle: $app" >&2
	exit 1
}

# Entitlements live next to this script's repo (…/scripts/ → …/src-tauri/Entitlements.plist).
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
entitlements="$here/../src-tauri/Entitlements.plist"
[ -f "$entitlements" ] || {
	echo "sign-macos-local: entitlements not found: $entitlements" >&2
	exit 1
}

# Default to an ad-hoc signature ("-"); override with SIGN_IDENTITY for a stable
# self-signed (or Developer ID) identity so grants persist across rebuilds.
identity="${SIGN_IDENTITY:--}"

if [ "$identity" = "-" ]; then
	echo "sign-macos-local: signing AD-HOC (identity '-'). Grants will NOT persist across"
	echo "                  rebuilds — set SIGN_IDENTITY to a self-signed cert for stability."
else
	echo "sign-macos-local: signing with identity: $identity"
fi

# --force: replace any existing signature. --deep: also sign nested code (frameworks,
# helpers). --options runtime: enable the Hardened Runtime so the entitlements apply.
codesign --force --deep --options runtime \
	--entitlements "$entitlements" \
	--sign "$identity" \
	"$app"

echo "sign-macos-local: signed $app"
echo "sign-macos-local: verifying…"
codesign -dv --verbose=4 "$app" 2>&1 | grep -i 'flags' || true
echo "sign-macos-local: entitlements in signature:"
codesign -d --entitlements - "$app" 2>/dev/null | grep -i 'audio-input' || true
echo "sign-macos-local: done. If an old build already broke TCC, run:"
echo "    tccutil reset Microphone com.recue.app"
