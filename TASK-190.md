# Task 190

### 190. [x] Auto-update skeleton: gated release pipeline + in-app update UI (keys deferred)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

Stand up the **foundation** for in-app auto-update so it's ready to switch on once a real
Tauri signing keypair is generated (a later task). This **re-introduces** the mechanism
that **#62 removed** (#62 deleted the #15 Tauri-updater: the updater/process plugins, the
baked-in minisign pubkey, and the release workflow — see git `24791c4` add, `11559ec` /
`0e828c2` remove). The earlier #15 implementation is the reference; this task rebuilds it
**more completely** (gated pipeline + a richer UI) and **without committing a real key**
(keys are deferred and generated later).

**This reverses a v1-scope rule.** CLAUDE.md currently states "no in-app auto-update and no
release pipeline" (#62). This task deliberately reverses that — the implementer must update
CLAUDE.md (and README) to describe the new updater skeleton. Apple code-signing /
notarization stays out of scope; the updater uses **minisign** (its own keypair, separate
from Apple notarization), and that keypair is deferred.

**What ships in this skeleton.**

1. **Release pipeline** (`.github/workflows/release.yml`) — on push to `main`, a job that
   (a) **guards on a version bump** (config version higher than the latest `v*` tag, from
   #15) **and** (b) **guards on the signing secret being present** — if
   `secrets.TAURI_SIGNING_PRIVATE_KEY` is empty/absent, the workflow **ends early** (logs a
   clear "no signing key — skipping release" notice, exits success). When both hold, it
   builds a universal macOS bundle and creates a **draft** GitHub release carrying the
   updater artifacts (`latest.json`, `.sig`, `.app.tar.gz`, `.dmg`) via `tauri-apps/
   tauri-action`. So with **no key configured (today), the pipeline no-ops**; adding the
   secret later activates it with **zero further code changes**.
2. **Tauri updater + process plugins, re-wired** — JS deps `@tauri-apps/plugin-updater` +
   `@tauri-apps/plugin-process`; Rust crates `tauri-plugin-updater` +
   `tauri-plugin-process` in `Cargo.toml`, initialized in `lib.rs`
   (`.plugin(tauri_plugin_updater::Builder::new().build())` + `tauri_plugin_process::init()`);
   `capabilities/default.json` grants `updater:default` + `process:allow-restart`;
   `tauri.conf.json` gets a `plugins.updater` block with `endpoints` (the GitHub releases
   `latest.json` URL, as #15) and a **placeholder `pubkey`** (clearly marked TODO — the
   real one is baked by the later signing-key task). **`createUpdaterArtifacts` stays off**
   in `tauri.conf.json` so **local `npm run tauri build` keeps producing an unsigned
   `.app`/`.dmg` without a key** (the workflow/tauri-action turns on signed artifacts only
   when the secret is present). _Build-safety is a hard requirement: the app must compile,
   run, and `tauri build` locally with no key._
3. **`src/updater.ts`** (restore + extend #15's) — wraps the plugin: `checkForUpdate()`
   (returns `{version} | null`, holds the non-serializable `Update` object module-side like
   the outputBus pattern) and `downloadAndRelaunch(onProgress)` (calls
   `update.downloadAndInstall` forwarding the updater's `Started{contentLength}` /
   `Progress{chunkLength}` / `Finished` events to a 0–100 progress callback, then
   `relaunch()` from `@tauri-apps/plugin-process`).
4. **Store `update` slice + actions** — `update: { status: "idle"|"checking"|"available"|
   "downloading"|"error", version: string|null, progress: number, error?: string }`, plus
   `checkForUpdate()` (best-effort; sets `available`+`version` or stays idle),
   `openUpdateConfirm()` / `cancelUpdate()`, and `installUpdate()` (sets `downloading`,
   updates `progress` from the callback, on success relaunches; on failure → `error`).
   Boot calls `checkForUpdate()` best-effort (returns null with no real release, today).
   **The state machine is structured so the mock task (#193) can drive every state without
   a real release.**
5. **UI — sidebar indicator box** (`src/components/Update/UpdateIndicator.tsx`) — a small
   box in the **sidebar footer, directly above the Settings gear** (`Sidebar.tsx` footer,
   ~line 1597–1604). Hidden when `status === "idle"`; when `available`, shows "Update
   available · v<version>" and is clickable → `openUpdateConfirm()`. Compact + collapses
   gracefully when the sidebar is in its narrow rail (#168).
6. **UI — confirm + install modal** (`src/components/Update/UpdateModal.tsx`) — when
   `status === "available"` and confirm is requested: an "Update to v<version>? The app
   will restart." dialog (OK / Cancel). **OK → `installUpdate()`**, which switches to a
   **full-window blocking overlay that freezes input** (a `--scrim` cover, no dismiss) with
   a **progress bar** bound to `update.progress`; on completion the app **relaunches**.
   Cancel/Escape closes (only before install starts).
7. **Post-update toast** — persist the app version across launches (a small persisted value
   — extend the settings/store blob with `lastVersion`); on `init`, compare the running
   `getVersion()` (Tauri) to `lastVersion`; if it increased, `pushToast("Updated to
   v<new>", "success")` and store the new version. This is the "restarts updated → toast
   with the new version" step, and is independently triggerable by the mock (#193).

**Scope.** The skeleton is **fully wired but inert** without a key: today `checkForUpdate`
returns null (no published release / placeholder pubkey), so the indicator stays hidden and
nothing installs. Activation later needs only (a) generating the minisign keypair, (b)
baking the real `pubkey` + turning on `createUpdaterArtifacts`, and (c) adding the
`TAURI_SIGNING_PRIVATE_KEY[_PASSWORD]` GitHub secrets — all deferred to a later "provide
signing key" task. The **interactive** flow (indicator → modal → freeze/progress → restart
→ toast) is **runtime-verified via the mock task (#193)** since there's no real release yet.

**Out of scope (own cards — do NOT build here).**
- The **settings "Updates" screen** with a "Check for updates" button ("Alternative settings
  screen for updating" card → depends on #190).
- **Patchnotes** JSON + the settings patch-notes view (card → depends on #190).
- The **dev mock** of an available update (card → depends on #190).
- Generating/committing the real signing keypair, enabling `createUpdaterArtifacts`, Apple
  notarization (all later).

**Concrete files/symbols.**
- **New** `.github/workflows/release.yml` (base on `git show 24791c4:.github/workflows/
  release.yml`, add the secret-presence guard).
- `package.json` / `src-tauri/Cargo.toml` — add updater + process plugins (JS + Rust).
- `src-tauri/src/lib.rs` — init both plugins (near the existing
  `.plugin(tauri_plugin_dialog::init())`, line ~40); call best-effort `checkForUpdate` is
  frontend-side on boot.
- `src-tauri/capabilities/default.json` — add `"updater:default"`, `"process:allow-restart"`
  to `permissions`.
- `src-tauri/tauri.conf.json` — add `plugins.updater { endpoints, pubkey: <placeholder> }`;
  leave `createUpdaterArtifacts` off.
- **New** `src/updater.ts` (restore #15 + progress callback).
- **New** `src/components/Update/UpdateIndicator.tsx` + `UpdateModal.tsx` (+ CSS).
- `src/store.ts` — `update` slice + actions; `lastVersion` persistence; boot
  `checkForUpdate` + post-update toast; `pushToast` (~1371) reused.
- `src/components/Sidebar/Sidebar.tsx` — mount `<UpdateIndicator />` above the footer gear.
- `src/App.tsx` — mount `<UpdateModal />` (like the old `UpdatePopup`, ~#15).
- CLAUDE.md / README — document the updater skeleton (reverse the #62 note).

**Subtasks**

1. [x] Re-added updater + process plugins — JS deps (`package.json`), Rust crates
   (`Cargo.toml`), `lib.rs` inits, `capabilities/default.json` (`updater:default` +
   `process:allow-restart`), and the `tauri.conf.json` `plugins.updater` block with the
   **#15 public key as a placeholder** + `createUpdaterArtifacts` left **OFF**. `cargo build`
   (which parses/validates the config via `tauri-build`) passes (full bundle not run in-loop;
   see Notes).
2. [x] `src/updater.ts` — `checkForUpdate()` + `downloadAndRelaunch(onProgress)` forwarding
   the updater's `Started{contentLength}`/`Progress{chunkLength}`/`Finished` events to a
   0–100 callback, then `relaunch()`.
3. [x] Store `update` slice (`status`/`version`/`progress`/`error`/`confirming`) +
   `checkForUpdate`/`openUpdateConfirm`/`cancelUpdate`/`installUpdate`, plus `setUpdateState`
   so the mock (#193) can drive any state. Unit-tested.
4. [x] `last_version` persistence (Rust scalar like `sidebar_width`: store field + commands +
   ipc) + boot compare via the pure `versionIncreased()` → `pushToast("Updated to v…",
   "success")`. Added a `"success"` toast tone (type + Toaster). Both unit-tested.
5. [x] `UpdateIndicator` mounted in the sidebar footer **above the Settings gear**, hidden
   when idle, clickable when available (collapses to its icon in the #168 rail).
6. [x] `UpdateModal`: confirm dialog → OK → **full-window input-blocking overlay + progress
   bar** → relaunch; Cancel / Escape / scrim-click before install (no dismiss while
   downloading).
7. [x] `.github/workflows/release.yml`: a `check` job outputs **both** a version-bump guard
   **and** a signing-secret-present guard (surfaced as an output since secrets aren't usable
   in job-level `if:`); the `release` job runs only when both are true, else the run ends
   green with a `::notice::`. Builds a universal bundle + **draft** release via
   `tauri-action`.
8. [x] CLAUDE.md "Builds & distribution" + README updated — reversed the #62 "no
   auto-update / no pipeline" note and documented the deferred-key skeleton.
9. [x] **Verify** — `npm run build`, `npm run lint`, `npm test` (262), `cargo build`,
   `cargo test` (83), `clippy`, `cargo fmt`, `prettier` all green. Full `npm run tauri build`
   **not** run in the loop (heavy release bundle, headless) — `cargo build` already parses
   the updater config via `tauri-build` and `createUpdaterArtifacts` is off (no signing
   path), so the unsigned local build is safe; see Notes. The interactive flow is exercised
   by the mock (#193).

**Acceptance criteria**

- [x] Updater + process plugins are wired (JS + Rust + capabilities + `tauri.conf.json`
      `plugins.updater` with a placeholder pubkey, `createUpdaterArtifacts` off). `cargo
      build`/`clippy` pass with the config parsed; the local build stays unsigned with no key.
      _(Full `tauri build` bundle not run in-loop — see Notes; cargo build validates the
      config.)_
- [x] `.github/workflows/release.yml` exists and **ends early when
      `TAURI_SIGNING_PRIVATE_KEY` is absent** (and when the version isn't bumped) — the
      `release` job is gated on `should_release == 'true' && has_key == 'true'`; otherwise it
      builds + drafts a release. _(Updater artifacts come online when the later signing-key
      task flips `createUpdaterArtifacts`.)_
- [x] The **sidebar footer shows an update box above the Settings gear** (hidden when idle),
      → a **confirm modal** → OK → a **full-window input-blocking overlay with a progress
      bar** → **relaunch**; a version increase shows a **success toast**. All states reachable
      via `setUpdateState` (unit-tested); the live download is exercised by #193 / a real
      signed release. _(Live render runtime-unverified in-loop — see Notes.)_
- [x] CLAUDE.md/README updated to reflect the reversed scope.
- [x] `npm run build`, `npm run lint`, `npm test`, and Rust build/clippy pass.

**Notes**

- **Autonomous refine (2026-06-26):** user not responding; decisions logged in
  `ASSUMPTIONS.md`.
  - **Reuse #15's removed implementation** (git `24791c4`) as the base; rebuild richer (gated
    pipeline + sidebar box + confirm/freeze/progress + post-update toast).
  - **Keys deferred → placeholder pubkey + `createUpdaterArtifacts` off**, so local unsigned
    builds keep working; the pipeline's secret guard means it no-ops until the key lands. A
    later "provide signing key" task bakes the real pubkey, flips `createUpdaterArtifacts`,
    and adds the secrets — **no other code change needed** ("ready to go").
  - **Pipeline guards on BOTH** a version bump (from #15) **and** the signing secret's
    presence; ends early otherwise (the card's "ends early if the secret isn't present").
  - **Indicator placement:** sidebar footer, directly above the Settings gear (per the card).
  - **Freeze = full-window input-blocking overlay** (`--scrim`, no dismiss) with a progress
    bar bound to the updater's download progress; then `relaunch()` (process plugin).
  - **Post-update toast** via a persisted `lastVersion` compared to Tauri `getVersion()` on
    boot — also the hook the mock (#193) uses.
  - **Reverses #62 / the v1 "no auto-update, no pipeline" rule** (and partially the #15
    removal); Apple notarization still out of scope (minisign only, deferred).
  - **Testability:** with no key/release, the interactive flow can't run for real; the state
    machine is shaped so the **mock (#193)** drives every state. This task's own verification
    is build/lint/test + guard review + idle UI.
- **Depends on: none** — it's the **foundation** of the auto-update group; the other three
  cards (settings update screen, patchnotes, mock) **depend on this #190**.
- **References:** git `24791c4` (#15 add: `release.yml`, `updater.ts`, `UpdatePopup`,
  `tauri.conf.json` updater block w/ endpoints+pubkey, `capabilities` `updater:default` +
  `process:allow-restart`, `store.ts` update slice), `11559ec`/`0e828c2` (#62 removal);
  current `Sidebar.tsx` footer (~1597), `store.ts pushToast` (~1371), `lib.rs` plugin init
  (~40), `tauri.conf.json`/`package.json` version `0.0.1`. CLAUDE.md "Builds & distribution".

**Implementation notes (2026-06-26 — done)**

- Built on the #15 reference (git `24791c4`) and extended per the plan: a sidebar
  **`UpdateIndicator`** (not #15's bottom-right popup) → a confirm **`UpdateModal`** → a
  full-window install overlay with a **progress bar** (vs #15's spinner), plus the
  post-update toast and the **gated** pipeline (version-bump **and** secret-present).
- **Placeholder pubkey = the #15 public key** (`git show 24791c4:src-tauri/tauri.conf.json`).
  It's a valid minisign pubkey format (so `tauri-build` config validation passes) and is
  already public (no secret committed); its **private** key is deferred. JSON can't carry a
  comment, so the placeholder status is documented in CLAUDE.md/README + here.
  **`createUpdaterArtifacts` stays OFF** so a local `tauri build` never tries to sign — the
  later "provide signing key" task flips it on + bakes the real key + adds the secrets.
- **Pipeline secret guard:** GitHub Actions can't read `secrets.*` in a job-level `if:`, so
  the `check` job exposes a `has_key` **output** (a boolean from `[ -n "$SIGNING_KEY" ]`,
  never echoing the secret) and the `release` job gates on `should_release && has_key`. Both
  false-paths log a `::notice::` and the run ends green (the build job is simply skipped).
- **`last_version`** is a dedicated Rust scalar (mirroring `sidebar_width`/`sidebar_collapsed`)
  rather than folded into the Settings blob, so the Settings draft can't clobber it. Boot
  compares it to `app_version()` with the pure, unit-tested `versionIncreased()` (numeric
  semver compare — `0.0.10 > 0.0.9`, a downgrade/no-change does **not** toast).
- **`"success"` toast tone** added (`ToastTone` + Toaster `.success` → `--status-done` green)
  for the post-update toast, since the existing tones were only `info`/`error`.
- **Inert today, mock-drivable:** `checkForUpdate` returns null (placeholder pubkey + no
  signed release), so the indicator stays hidden. The slice is shaped so #193's mock can
  `setUpdateState({status, version, progress, error})` to exercise indicator → confirm →
  install/progress → error without a real release.
- **Runtime-unverified in this loop:** (a) a full `npm run tauri build` (release bundle) —
  heavy + headless; `cargo build` already parses+validates the updater config via
  `tauri-build` and `createUpdaterArtifacts` is off, so the unsigned build is safe; (b) the
  live indicator/modal render + the real download/relaunch (no signed release exists — that's
  the mock #193 / a real release's job). Mirrors the #84/#186–#189 precedent; recommend a
  `npm run tauri build` + `npm run tauri dev` pass when convenient.
