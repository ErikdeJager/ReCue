#!/usr/bin/env bash
# Generate a STABLE self-signed code-signing certificate for CI and set the four repo
# secrets that make ReCue's macOS release builds sign with it — so mic/voice + protected
# folder permissions actually work and PERSIST for downloaders, with NO Apple account.
# (#292 built the entitlements/Hardened-Runtime machinery; #314 the local signer; this
# brings the same stable signature to CI releases.)
#
# WHAT IT DOES
# ------------
# 1. Creates (or REUSES) one self-signed `codeSigning` cert + key, bundled as a `.p12`.
# 2. base64-encodes it and sets these GitHub Actions secrets on the repo (via `gh`):
#      APPLE_CERTIFICATE           — base64 of the .p12
#      APPLE_CERTIFICATE_PASSWORD  — the .p12 password
#      APPLE_SIGNING_IDENTITY      — the cert CN ("ReCue Self Signed")
#      KEYCHAIN_PASSWORD           — a throwaway CI-keychain password
#    (It deliberately does NOT set APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID — leaving
#    those unset selects the sign-only path in release.yml, i.e. no notarization. Add
#    those three later, plus a real Developer ID identity, to also notarize.)
#
# WHY CERT REUSE MATTERS
# ----------------------
# macOS TCC keys a granted permission to the app's Designated Requirement, which for a
# self-signed build derives from THIS cert. Reuse the SAME cert for every release and the
# DR stays byte-identical, so a grant given once persists across updates. A different cert
# would re-prompt users after each update. So this script SAVES the cert to a backup dir
# ($RECUE_CERT_DIR, default ~/.recue-signing) and, on re-run, REUSES it instead of minting a
# new one. Keep that backup (a password manager is ideal). To intentionally rotate the cert
# (accepting a one-time re-prompt for everyone), pass RECUE_FORCE_NEW_CERT=1.
#
# USAGE
# -----
#   bash scripts/gen-macos-ci-cert.sh            # create-or-reuse + set the 4 secrets
#   RECUE_FORCE_NEW_CERT=1 bash scripts/...      # mint a fresh cert (rotates the identity)
#   RECUE_CERT_DIR=/path bash scripts/...        # store the backup elsewhere
#   RECUE_REPO=owner/name bash scripts/...       # target a specific repo (else auto-detect)
#
# Requires `openssl`. `gh` (authenticated, repo admin) is used to set the secrets; if it is
# missing the script prints the values so you can paste them into
# Settings ▸ Secrets and variables ▸ Actions yourself.
set -euo pipefail

CN="ReCue Self Signed" # becomes APPLE_SIGNING_IDENTITY — must match the cert CN exactly
cert_dir="${RECUE_CERT_DIR:-$HOME/.recue-signing}"
p12="$cert_dir/ReCue-CI.p12"
passfile="$cert_dir/ReCue-CI.pass"

note() { printf 'gen-macos-ci-cert: %s\n' "$*"; }
warn() { printf '\n\033[1;33m%s\033[0m\n' "$*" >&2; }

command -v openssl >/dev/null 2>&1 || {
	warn "openssl not found — cannot generate the certificate."
	exit 1
}

mkdir -p "$cert_dir"
chmod 700 "$cert_dir" 2>/dev/null || true

# ---------------------------------------------------------------------------
# Create-or-reuse the .p12 (reuse keeps the Designated Requirement stable)
# ---------------------------------------------------------------------------
if [ "${RECUE_FORCE_NEW_CERT:-0}" != "1" ] && [ -f "$p12" ] && [ -f "$passfile" ]; then
	note "reusing existing cert: $p12 (grants stay valid across releases)"
	p12pw="$(cat "$passfile")"
else
	[ -f "$p12" ] && warn "RECUE_FORCE_NEW_CERT=1 — minting a NEW cert (users will be re-prompted once)."
	note "creating self-signed code-signing cert: CN=$CN"
	tmp="$(mktemp -d)"
	trap 'rm -rf "$tmp"' EXIT
	key="$tmp/key.pem"
	crt="$tmp/cert.pem"
	cfg="$tmp/openssl.cnf"
	p12pw="$(openssl rand -base64 24 | tr -d '\n')"

	cat >"$cfg" <<-EOF
		[req]
		distinguished_name = dn
		x509_extensions    = ext
		prompt             = no
		[dn]
		CN = $CN
		[ext]
		basicConstraints     = critical, CA:false
		keyUsage             = critical, digitalSignature
		extendedKeyUsage     = critical, codeSigning
	EOF

	openssl req -x509 -newkey rsa:2048 -keyout "$key" -out "$crt" \
		-days 3650 -nodes -config "$cfg" >/dev/null 2>&1 || {
		warn "openssl could not generate the certificate."
		exit 1
	}

	# -legacy (3DES/SHA1): OpenSSL 3.x defaults to AES/PBES2, which macOS `security import`
	# silently imports WITHOUT the private key (→ no usable identity → the bundler skips
	# signing). LibreSSL doesn't know -legacy but already defaults to the compatible algos.
	if ! openssl pkcs12 -export -legacy -inkey "$key" -in "$crt" -out "$p12" \
		-passout "pass:$p12pw" -name "$CN" >/dev/null 2>&1; then
		openssl pkcs12 -export -inkey "$key" -in "$crt" -out "$p12" \
			-passout "pass:$p12pw" -name "$CN" >/dev/null 2>&1 || {
			warn "openssl could not bundle the .p12."
			exit 1
		}
	fi

	printf '%s' "$p12pw" >"$passfile"
	chmod 600 "$p12" "$passfile" 2>/dev/null || true
	note "saved cert backup: $p12"
	note "  KEEP THIS FILE — reuse it every release so permissions persist across updates."
fi

cert_b64="$(openssl base64 -A -in "$p12")"
keychain_pw="$(openssl rand -base64 18 | tr -d '\n')" # throwaway; need not be stable

# ---------------------------------------------------------------------------
# Set the four signing secrets (or print them if gh is unavailable)
# ---------------------------------------------------------------------------
# Resolve the target repo explicitly and pass it with -R on every call. (Avoids a bash 3.2
# empty-array expansion, which errors under `set -u` — macOS ships bash 3.2.)
set_secrets_with_gh() {
	command -v gh >/dev/null 2>&1 || return 1
	gh auth status >/dev/null 2>&1 || return 1
	local repo="${RECUE_REPO:-}"
	[ -n "$repo" ] || repo="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
	[ -n "$repo" ] || return 1
	printf '%s' "$cert_b64" | gh secret set APPLE_CERTIFICATE -R "$repo" >/dev/null 2>&1 || return 1
	printf '%s' "$p12pw" | gh secret set APPLE_CERTIFICATE_PASSWORD -R "$repo" >/dev/null 2>&1 || return 1
	printf '%s' "$CN" | gh secret set APPLE_SIGNING_IDENTITY -R "$repo" >/dev/null 2>&1 || return 1
	printf '%s' "$keychain_pw" | gh secret set KEYCHAIN_PASSWORD -R "$repo" >/dev/null 2>&1 || return 1
	printf 'gen-macos-ci-cert: target repo: %s\n' "$repo"
	return 0
}

echo
if set_secrets_with_gh; then
	note "set repo secrets via gh: APPLE_CERTIFICATE, APPLE_CERTIFICATE_PASSWORD, APPLE_SIGNING_IDENTITY, KEYCHAIN_PASSWORD"
	note "the next release built from main will be self-signed (sign-only, no notarization)."
else
	warn "===================================================================="
	warn " gh not available/authenticated (or set failed). Add these repo"
	warn " secrets manually: Settings ▸ Secrets and variables ▸ Actions."
	warn "===================================================================="
	echo "APPLE_SIGNING_IDENTITY = $CN"
	echo "APPLE_CERTIFICATE_PASSWORD = $p12pw"
	echo "KEYCHAIN_PASSWORD = $keychain_pw"
	echo "APPLE_CERTIFICATE = (base64 below — the whole block)"
	echo "----------------------------8<----------------------------"
	printf '%s\n' "$cert_b64"
	echo "----------------------------8<----------------------------"
fi

echo
note "done. Do NOT set APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID unless you have a real"
note "Developer ID identity + Apple account and want notarized (Gatekeeper-clean) builds."
note "See docs/macos-permissions.md."
