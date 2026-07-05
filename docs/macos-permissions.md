# macOS permissions: microphone / voice, protected folders, system settings (#292 / #314 / #321)

This document explains why ReCue's macOS permission prompts (microphone / voice
dictation, protected folders like Downloads / Documents / Desktop, and system
settings) used to **prompt repeatedly and never actually work**, the **empirically
confirmed root cause**, and the steps to build, sign, and verify a working `.app` —
both locally (no Apple account) and in CI (**self-signed sign-only** or **notarized
Developer ID** releases).

> **#321** brings the fix to the **shipped** app: `release.yml` now signs CI releases
> (self-signed with 4 secrets, or Developer-ID + notarized with all 7), and a one-time
> macOS-only `tccutil reset` at boot re-asks the permission after an update. All macOS-only
> and `#[cfg]`-gated — Windows and Linux builds/behavior are byte-for-byte unchanged.

## The symptom

Using voice with an agent inside a ReCue session triggered the macOS microphone
prompt repeatedly (~6×), and even after pressing **Allow** every time, the mic never
worked. The same repeated-prompt-then-fail happened for protected-folder access
(Downloads / Documents / Desktop) and system-settings access.

ReCue itself has **no** microphone / audio / folder code. Voice and folder access are
requested by the child `claude` process running inside ReCue's PTY; macOS attributes
that request to the **responsible** process — ReCue — which is why
`src-tauri/Info.plist` declares `NSMicrophoneUsageDescription` and the other usage
strings. (Child-process attribution is **not** the problem: `portable-pty` spawns
without disclaiming responsibility, so macOS already attributes the request to ReCue.)

## Root cause (empirically confirmed on-box)

**Task #292 built the correct machinery, but a plain `npm run tauri build` never
applies it.** `bundle.macOS.entitlements` (`Entitlements.plist`) and the Hardened
Runtime are only used by the Tauri macOS bundler **when a signing identity is
configured**. With no identity — the local default, and the dormant-CI default — the
bundler leaves the binary in its **linker-signed ad-hoc** state and re-signs nothing.

Inspecting an unsigned `ReCue.app` (`codesign -dv --verbose=4` + `codesign -d
--entitlements -` + `spctl`) shows every defect:

| Inspection | Unsigned `tauri build` output | What it means |
| --- | --- | --- |
| `Identifier=` | `recue-…` (linker-derived) | **not** `com.recue.app` — TCC can't key a grant to the bundle id |
| `flags=` | `0x20002(adhoc,linker-signed)` | **no** `0x10000` "runtime" → **Hardened Runtime OFF** |
| `Signature=` | `adhoc` | no certificate, no stable identity |
| `Info.plist=` | `not bound` | the plist isn't sealed into the signature |
| `Sealed Resources=` | `none` | bundle resources aren't sealed |
| entitlements | 0 `audio-input` | the mic entitlement is **absent** |
| `designated =>` | `cdhash H"…"` | Designated Requirement pinned to **this exact binary's hash** |
| `spctl -a` | "code has no resources but signature indicates they must be present" | the signature is malformed |

So **both** failure halves are present in every unsigned build:

1. **"Allow" never works.** The `com.apple.security.device.audio-input` entitlement is
   **absent** and the Hardened Runtime is **off**, so macOS cannot grant mic access
   even after you tap Allow. The `NSMicrophoneUsageDescription` string alone is **not**
   enough — the entitlement must be present in the signature, and entitlements are only
   honored under the Hardened Runtime. The same is true for protected folders and
   system settings: the usage string is only half the fix.

2. **Prompts repeat / never persist.** macOS **TCC** (Transparency, Consent & Control)
   keys a grant by **service + bundle id + the app's Designated Requirement (DR)**
   captured at grant time. An ad-hoc / linker-signed binary has a **per-build `cdhash`
   DR** and a malformed signature, so TCC can't record or match a durable grant — every
   rebuild (and often every access attempt) looks like a **brand-new app**, and the
   prompt returns.

### Why a stable identity fixes persistence (no Apple account needed)

The DR is what makes a grant stick:

- **Self-signed cert (not ad-hoc)** → the DR references **that cert's hash** → it is
  **stable across rebuilds** as long as the same cert signs → grants persist. **No
  Apple account required.** (Gatekeeper still warns for a *downloaded* build — that is
  a separate concern from TCC; see below.)
- **Ad-hoc / linker-signed (`-`)** → no cert → the DR degrades to `cdhash H"<hash>"` →
  every rebuild is a new app to TCC → the prompt returns every time.
- **Developer ID cert** → the DR references the **Team ID** → stable, and (once
  **notarized**) also clears Gatekeeper for arbitrary downloaders.

The **Hardened Runtime** (`codesign --options runtime`, CodeDirectory flag `0x10000`)
is required for entitlements like `audio-input` to be honored at all.

> **App Translocation gotcha.** A *quarantined* app run from `~/Downloads` executes
> from a randomized, read-only mount, which defeats a stable identity until you move it
> to `/Applications`. Always move a downloaded ReCue to `/Applications` (and, for a
> local build, prefer running it from `/Applications`), and clear quarantine with
> `xattr -dr com.apple.quarantine <app>`.

## The fix

The machinery from **#292** is correct — the missing piece (**#314**) is that the
re-sign step is **mandatory**, and the local signer now **defaults to a stable
identity** instead of silently reproducing the broken ad-hoc state.

- **`src-tauri/Entitlements.plist`** declares the code-signature entitlements:
  - `com.apple.security.device.audio-input = true` — the missing microphone entitlement.
  - `com.apple.security.cs.disable-library-validation = true` — lets a self-signed
    Hardened-Runtime app load libraries not signed by the same identity (so it
    launches). Harmless under a real Developer ID signature.

  The **App Sandbox** is deliberately **not** enabled — ReCue spawns child `claude`
  PTYs and reads the user's repos across the filesystem, which the sandbox would confine.
  The file is kept **comment-free** (#321): the Tauri bundler passes it verbatim to
  `codesign`, whose AMFI entitlements parser can reject an XML comment block
  (`AMFIUnserializeXML: syntax error`). The rationale that used to live in the file is in
  this doc instead.

- **`src-tauri/Info.plist`** carries the mic / speech strings plus the four
  protected-folder usage strings (`NSDownloadsFolderUsageDescription`,
  `NSDocumentsFolderUsageDescription`, `NSDesktopFolderUsageDescription`,
  `NSRemovableVolumesUsageDescription`).

- **`scripts/sign-macos-local.sh`** (rewritten in #314) force-re-signs a built
  `ReCue.app` with the Hardened Runtime + these entitlements + `-i com.recue.app`
  (fixing the wrong `Identifier`) using a **stable** identity, and **verifies** the
  result — failing loudly if anything is wrong.

- **CI (`.github/workflows/release.yml`)** — the macOS leg now **signs releases** in one
  of two modes, selected purely by which secrets are set (#321): **sign-only** with a
  stable self-signed cert (4 signing secrets — no Apple account), or **sign + notarize**
  with a Developer ID (all 7 secrets). With **no** secrets it falls back to ad-hoc and the
  build still succeeds. See [Signed releases in CI](#signed-releases-in-ci) below.

- **One-time re-ask after an update (`src-tauri/src/lib.rs`, macOS-only, #321)** — when a
  user updates from an old ad-hoc build into a properly-signed one, the signature (DR)
  changes so macOS *should* re-ask — but a stale/denied TCC row can suppress the fresh
  prompt. On the first boot of a build carrying the persisted `perm_reprompt_done` flag,
  ReCue best-effort `tccutil reset`s its Microphone / SpeechRecognition grants so the user
  is re-asked **once** (and now Allow works), then never nags again. `#[cfg(target_os =
  "macos")]`-gated; a no-op on Windows/Linux.

## Build + sign locally (no Apple account)

The recommended one-command path (macOS only) builds, creates/reuses a stable
self-signed identity, signs, and verifies:

```bash
npm run build:mac
```

Under the hood that runs `npm run tauri build` and then, with
`RECUE_CREATE_IDENTITY=1`, `scripts/sign-macos-local.sh <the built .app>` (resolving
the universal `ReCue.app`, falling back to the single-arch path).

Prefer the explicit two steps? They're equivalent:

```bash
# 1. Build the bundle.
npm run tauri build

# 2. Create-or-reuse a stable self-signed identity, sign, and verify.
RECUE_CREATE_IDENTITY=1 ./scripts/sign-macos-local.sh \
  src-tauri/target/universal-apple-darwin/release/bundle/macos/ReCue.app
```

> If you built a single-arch (non-universal) bundle, the path is under
> `src-tauri/target/release/bundle/macos/ReCue.app` instead.

### How the signer resolves the identity

`scripts/sign-macos-local.sh <path-to-ReCue.app>` picks the identity in this order:

1. **`$SIGN_IDENTITY`**, if set — used verbatim (a Developer ID or any existing cert).
2. else a local identity named **`$RECUE_SIGN_IDENTITY_NAME`** (default
   `"ReCue Local Signing"`) if it already exists in your keychain — reused, so grants
   persist across rebuilds.
3. else, if **`RECUE_CREATE_IDENTITY=1`**, it **creates** that self-signed
   code-signing identity non-interactively (login keychain — may ask for your login
   password once) and uses it.
4. otherwise it **refuses** to ad-hoc-sign (which would silently reproduce the broken,
   non-persistent state) and tells you how to fix it. Set **`RECUE_ALLOW_ADHOC=1`** to
   force an ad-hoc signature anyway — for a throwaway check only; grants will **not**
   persist.

The first `RECUE_CREATE_IDENTITY=1` run creates `"ReCue Local Signing"`; every later
run auto-detects and reuses it, so the DR (and therefore your granted permissions)
stays stable across rebuilds. To use your own cert instead of the auto-created one,
create a **Code Signing** "Self Signed Root" certificate in **Keychain Access ▸
Certificate Assistant ▸ Create a Certificate…** and pass its exact name via
`SIGN_IDENTITY="Your Cert Name"`.

### Verify the signature ("good" looks like this)

The signer asserts all of these and exits non-zero if any fails, but you can check by
hand:

```bash
codesign -dv --verbose=4 <app>
#   → the flags line includes "runtime"  (Hardened Runtime ON)
#   → Identifier=com.recue.app           (NOT recue-…)

codesign -d --entitlements - <app>
#   → lists com.apple.security.device.audio-input
#     and com.apple.security.cs.disable-library-validation

codesign --verify --strict --verbose=2 <app>
#   → passes (no "code has no resources…" style error)

codesign -d -r - <app>
#   → a cert/identifier-based designated requirement,
#     NOT `designated => cdhash H"…"`  (cdhash means grants will NOT persist)

spctl -a -vvv -t exec <app>
#   → no longer reports "code has no resources but signature indicates they must be
#     present". (A self-signed build is still "rejected" by Gatekeeper — that is
#     expected and separate from TCC; see Notarized releases below.)
```

**Grants persist across rebuilds with a stable identity.** Re-signing a *rebuilt* app
with the same identity yields the **same** `codesign -d -r -` designated requirement,
which is exactly why TCC keeps your earlier grant.

## Recovery (if an earlier broken build already poisoned TCC)

If you ran an earlier unsigned/ad-hoc build, macOS may have cached a broken or denied
grant. After installing a properly-signed build:

```bash
# 1. Reset ReCue's microphone grant so the next launch prompts cleanly.
tccutil reset Microphone com.recue.app

# 2. For a downloaded build, clear quarantine (defeats a stale/denied state).
xattr -dr com.apple.quarantine <path-to-ReCue.app>
```

Then:

1. Open **System Settings ▸ Privacy & Security** and remove any **stale ReCue rows**
   under **Microphone** and **Files and Folders** (there is no folder-scoped `tccutil`
   service name, so removing the row is the manual equivalent).
2. **Move ReCue to `/Applications`** — running a quarantined app from `~/Downloads`
   triggers **App Translocation** (a randomized read-only mount) that defeats the
   stable identity.
3. Relaunch ReCue.
4. Use voice / touch a protected folder inside a session — you should get a **single**
   prompt, tap **Allow** once, and it works and **persists** across relaunches and
   rebuilds (with a stable identity).

## Signed releases in CI

The macOS leg of `.github/workflows/release.yml` signs the release, in one of **two
modes selected purely by which repo secrets are set** (Settings ▸ Secrets and variables ▸
Actions). Everything is **guarded**: with no signing secrets, the build falls back to
ad-hoc and still succeeds; the Windows leg and the minisign updater signing
(`TAURI_SIGNING_PRIVATE_KEY*`) are unaffected in every mode.

### Mode B — self-signed, sign-only (no Apple account) — the default for this repo

Gives **downloaders** a **stable TCC DR** (grants work + persist across updates) with no
Apple account. Gatekeeper still warns on first download (right-click ▸ **Open** once).

**One-time setup** — run this once and keep the generated `.p12` (reuse it every release
so the DR — and users' granted permissions — stay stable):

```bash
bash scripts/gen-macos-ci-cert.sh
```

It creates a self-signed code-signing cert (`~/.recue-signing/ReCue-CI.p12`) and sets the
four **signing** secrets via `gh` (or prints them if `gh` is unavailable):

| Secret | What it is |
| --- | --- |
| `APPLE_CERTIFICATE` | base64 of the self-signed code-signing `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` export password |
| `APPLE_SIGNING_IDENTITY` | the cert **CN** — `ReCue Self Signed` |
| `KEYCHAIN_PASSWORD` | any throwaway password for the CI keychain |

Do **not** set `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` — leaving them unset keeps
CI in sign-only mode (no notarization attempt). To rotate the cert deliberately (accepting
a one-time re-prompt for everyone) run `RECUE_FORCE_NEW_CERT=1 bash scripts/gen-macos-ci-cert.sh`.

### Mode A — Developer ID + notarized (Gatekeeper-clean, needs an Apple account)

A distributed release that "just works" (no Gatekeeper warning) for arbitrary users. Add
**all seven** secrets — the four above (with `APPLE_SIGNING_IDENTITY` = `Developer ID
Application: Your Name (TEAMID)`) plus:

| Secret | What it is |
| --- | --- |
| `APPLE_ID` | the Apple ID email (for notarization) |
| `APPLE_PASSWORD` | an app-specific password for that Apple ID |
| `APPLE_TEAM_ID` | the 10-character Apple Developer Team ID |

### Why the workflow splits signing from notarization

The Tauri bundler reads these env vars with `std::env::var_os`, which returns `Some("")`
for a **present-but-empty** variable (not `None`). So the "Configure Apple signing" step:

- exports the **signing** vars only when a real certificate + identity are present (an
  empty `APPLE_CERTIFICATE` would make `security import` fail the whole bundle); and
- exports the **notarization** vars only when **all three** are non-empty — otherwise an
  empty `APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` reads as "notarization requested" and
  the bundler tries to notarize with empty creds and **fails the build**. Left unset, the
  bundler cleanly logs "skipping app notarization" and signs-only.

A CI step then asserts the built `.app` is correctly signed (Hardened Runtime + the
`audio-input` entitlement + a non-`cdhash` DR); it's skipped on the ad-hoc fallback.

## Updating from an older build

Existing users get the fix through the **in-app updater**, which is smoother than a fresh
download:

- The updater replaces the `.app` **in place**, so the updated bundle is **not
  quarantined** → **no Gatekeeper warning** on update (only a fresh DMG download warns).
- The old build's signature was ad-hoc; the new one is self-signed — a **different**
  Designated Requirement — so macOS re-asks the permission once, and the one-time
  `tccutil reset` (#321) clears any stale/denied TCC row that could otherwise suppress the
  prompt. Tap **Allow** once; it now works and persists.
- Every **later** update signed with the **same** cert keeps the DR identical → the grant
  persists with no re-prompt.

If a prompt still doesn't appear (deeply poisoned state), run the manual recovery above
(`tccutil reset Microphone com.recue.app`, remove stale **Files and Folders** rows, move
to `/Applications`).

## Summary

| Signature | Mic "Allow" works? | Grants persist? | Gatekeeper (download) | Needs Apple account? |
| --- | --- | --- | --- | --- |
| Unsigned / ad-hoc (plain `tauri build`) | ❌ | ❌ (`cdhash` DR) | ❌ | — |
| Local self-signed (`npm run build:mac`) | ✅ | ✅ (cert DR, stable) | ❌ warns | No |
| **CI self-signed** (`gen-macos-ci-cert.sh`, 4 secrets) | ✅ | ✅ (cert DR, stable) | ❌ warns | No |
| Developer ID + notarized (all 7 secrets) | ✅ | ✅ (Team-ID DR) | ✅ | Yes |
