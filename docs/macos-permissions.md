# macOS permissions: microphone / voice and protected-folder access (#292)

This document explains why ReCue's macOS permission prompts (microphone / voice
dictation, and protected folders like Downloads / Documents / Desktop) used to
**prompt repeatedly and never actually work**, how the fix is structured, and the
steps to build, sign, and verify a working `.app` — both locally (no Apple account)
and in CI (notarized Developer ID releases).

> This is a **macOS-bundle-only** change. Windows and Linux builds and app behavior
> are unchanged; no runtime Rust/TypeScript/CSS is touched.

## The problem

Using voice with an agent inside a ReCue session triggered the macOS microphone
prompt repeatedly (~5×), and even after pressing **Allow** every time, the mic never
worked. The same repeated-prompt-then-fail happened for protected-folder access
(Downloads / Documents / Desktop).

ReCue itself has **no** microphone / audio / folder code. Voice and folder access are
requested by the child `claude` process running inside ReCue's PTY; macOS attributes
that request to the **responsible** process — ReCue — which is why
`src-tauri/Info.plist` declares `NSMicrophoneUsageDescription` and the other usage
strings.

## Root cause (a macOS TCC + code-signing problem, not app logic)

1. **Mic silently denied even after "Allow".** The entitlement
   `com.apple.security.device.audio-input` was **absent** from ReCue's code
   signature. The `NSMicrophoneUsageDescription` string alone is **not** sufficient —
   the entitlement must be present in the signature, and entitlements only take effect
   under the **Hardened Runtime**. ReCue previously had no entitlements file, no
   Hardened Runtime, and no macOS signing identity.

2. **Prompts repeat and never persist.** macOS TCC (Transparency, Consent & Control)
   pins a permission grant to the app's **code signature + bundle id**. An
   unsigned / ad-hoc app has **no stable signature**, so macOS treats it as a brand-new
   app on every launch — hence "asks 5 times, still doesn't work", for both the mic and
   the Downloads-folder prompt.

## The fix

All changes are macOS-bundle-only:

- **`src-tauri/Entitlements.plist`** (new) declares the code-signature entitlements:
  - `com.apple.security.device.audio-input = true` — the missing microphone
    entitlement.
  - `com.apple.security.cs.disable-library-validation = true` — lets a Hardened-Runtime
    app load libraries not signed by a matching Apple identity (required so an
    ad-hoc / self-signed local build launches; harmless under a real Developer ID
    signature).

  The **App Sandbox** (`com.apple.security.app-sandbox`) is deliberately **not**
  enabled — ReCue spawns child `claude` PTYs and reads the user's repos across the
  filesystem, which the sandbox would confine.

- **`src-tauri/tauri.conf.json`** points `bundle.macOS.entitlements` at that file. The
  Tauri v2 macOS bundler applies the **Hardened Runtime** (`codesign --options runtime`)
  during signing.

- **`src-tauri/Info.plist`** adds the four protected-folder usage strings
  (`NSDownloadsFolderUsageDescription`, `NSDocumentsFolderUsageDescription`,
  `NSDesktopFolderUsageDescription`, `NSRemovableVolumesUsageDescription`) alongside the
  existing mic / speech strings, so a `claude` agent reaching into those directories
  triggers a single, clearly-labeled prompt.

- **A stable signature** so grants persist:
  - **CI (`.github/workflows/release.yml`)** — the macOS build leg accepts standard
    Apple signing / notarization secrets and, when present, produces a **notarized
    Developer ID** build. The env is **guarded**: absent secrets → today's ad-hoc
    fallback, build still succeeds (see below).
  - **Local (`scripts/sign-macos-local.sh`)** — re-signs a built `ReCue.app` with the
    Hardened Runtime + these entitlements using a **self-signed** certificate (stable)
    or **ad-hoc** (works, but per-build), for developers with no Apple account.

## Build + sign locally (no Apple account)

```bash
# 1. Build the app bundle.
npm run tauri build

# 2. Sign it with Hardened Runtime + entitlements.
#    Ad-hoc (quick, but identity changes each build → grants reset on rebuild):
./scripts/sign-macos-local.sh \
  src-tauri/target/universal-apple-darwin/release/bundle/macos/ReCue.app

#    OR, for a STABLE identity so grants persist across rebuilds, use a self-signed cert:
SIGN_IDENTITY="ReCue Self-Signed" ./scripts/sign-macos-local.sh \
  src-tauri/target/universal-apple-darwin/release/bundle/macos/ReCue.app
```

> If you built a single-arch (non-universal) bundle, the path is under
> `src-tauri/target/release/bundle/macos/ReCue.app` instead.

### Create a stable self-signed certificate (one time)

1. Open **Keychain Access**.
2. Menu: **Keychain Access ▸ Certificate Assistant ▸ Create a Certificate…**
3. Name it (e.g. `ReCue Self-Signed`), Identity Type **Self Signed Root**, Certificate
   Type **Code Signing**. Create.
4. Set `SIGN_IDENTITY` to that exact name when running the script. Because the same
   certificate signs every rebuild, the signature is stable and a granted permission
   persists across rebuilds (an ad-hoc `-` identity does not).

### Verify the signature

```bash
codesign -dv --verbose=4 <path>/ReCue.app
#   → expect the flags line to include "runtime" (Hardened Runtime is on).

codesign -d --entitlements - <path>/ReCue.app
#   → expect it to list com.apple.security.device.audio-input.
```

## Notarized releases in CI

The macOS leg of `.github/workflows/release.yml` will produce a **signed + notarized**
Developer ID build once a maintainer adds these repo secrets
(**Settings ▸ Secrets and variables ▸ Actions**):

| Secret | What it is |
| --- | --- |
| `APPLE_CERTIFICATE` | base64 of the Developer ID Application `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` export password |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Your Name (TEAMID)` |
| `KEYCHAIN_PASSWORD` | any throwaway password for the CI keychain |
| `APPLE_ID` | the Apple ID email (for notarization) |
| `APPLE_PASSWORD` | an app-specific password for that Apple ID |
| `APPLE_TEAM_ID` | the 10-character Apple Developer Team ID |

These are **optional and guarded**: they are only wired into the **macOS** build step,
and only when set. With none configured, the build falls back to today's ad-hoc
signing and still succeeds — the Windows leg and the minisign updater signing
(`TAURI_SIGNING_PRIVATE_KEY*`) are unaffected either way.

## Recovery for users who already hit the broken build

If you ran an earlier (unsigned) build, macOS may have cached a broken/denied grant for
ReCue. After installing a properly-signed build, reset it once:

```bash
# Reset ReCue's microphone grant so the next launch prompts cleanly.
tccutil reset Microphone com.recue.app
```

Then:

1. Open **System Settings ▸ Privacy & Security ▸ Microphone** (and **▸ Files and
   Folders**) and remove any stale **ReCue** entry.
2. Relaunch ReCue.
3. Use voice / touch a protected folder inside a session — you should get a **single**
   prompt, tap **Allow** once, and it works and persists across relaunches.

> `tccutil reset` accepts a service (e.g. `Microphone`) and the bundle id
> (`com.recue.app`). There is no folder-scoped `tccutil` service name for the
> per-folder grants; removing the stale ReCue row under **Files and Folders** in System
> Settings is the manual equivalent.
