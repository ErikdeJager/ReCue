# Task 191

### 191. [x] Settings → "Updates" section: check for updates + review what will be installed

**Status:** Done
**Depends on:** #190
**Created:** 2026-06-26

**Description**

Add a dedicated **"Updates"** section to the Settings modal — the review-and-install
surface the user opens "when they want to update, to see what will be installed". It pairs
with the auto-update skeleton (#190): #190 wires the updater plugins, the `update` store
state/actions (`checkForUpdate` / `installUpdate` / `update.status|version|progress`), the
sidebar indicator box, and the freeze/progress/restart install flow. This task gives that
machinery a **manual, detailed home** in Settings: a **"Check for updates"** button, the
current vs. available version, and a place to show **what will be installed** before
committing.

**Goal & why.** Beyond #190's minimal auto-detected "update available → confirm" path, give
the user an explicit screen to (a) **manually check** for updates on demand, (b) **see the
available version and what's in it**, and (c) **install** from there. This is also the
surface the patch-notes view (#192) renders into ("what will be installed").

**The Settings modal today** (`src/components/Settings/Settings.tsx`) is a `SECTIONS` array
(`Terminal` / `Appearance` / `Behavior` / `Sessions` / `Data & About`) with a `section`
state switching the rendered pane; the "Data & About" pane already shows the app version via
`ipc.appVersion()`. Edits elsewhere are draft-staged and applied on **Save**, but action
panes (Data & About's "clear recents", "open data folder") call store actions **immediately**
— the Updates pane follows that **immediate-action** pattern (checking/installing is not a
draft-staged setting).

**What this adds.**

1. **A new `"updates"` section** in `SECTIONS` (icon e.g. Lucide `RefreshCw` /
   `DownloadCloud`, label "Updates"), with its own render block.
2. **Pane contents** (driven by #190's `update` store slice):
   - **Current version** (reuse the `appVersion()` already fetched for About).
   - A **"Check for updates"** button → `checkForUpdate()` (#190). While
     `update.status === "checking"` show a spinner/"Checking…"; results:
     **"You're up to date"** (idle/no update), **"Update available — v<version>"**, or an
     **error** line (`update.error`).
   - When an update is available: the **new version**, a **"what will be installed"** region
     — a **slot/placeholder** the patch-notes view (#192) fills (for this task, a labelled
     empty container + the version is sufficient) — and an **"Update now"** button →
     `installUpdate()` (#190's download→freeze/progress→relaunch flow).
   - While `update.status === "downloading"`, reflect `update.progress` (the full-window
     freeze overlay from #190 still covers the app during install).
3. **Deep-link from the #190 indicator** — clicking the sidebar update indicator opens
   **Settings at the Updates section** (rather than only #190's bare confirm modal). Extend
   the open path: `setSettingsOpen(open, section?)` (or a `settingsSection` store field the
   modal reads as its initial `section`), so the indicator calls
   `setSettingsOpen(true, "updates")`. This makes the Updates pane the primary "review then
   install" surface; #190's minimal confirm modal becomes redundant for the indicator path
   (keep or drop it — see Notes; reuse all of #190's install/progress/restart machinery
   either way).

**Scope.** A Settings section + the deep-link; **reuses #190's** store state, actions, and
install/freeze/progress/restart flow — **no new updater logic**. The actual "what's new"
content is **#192** (this task leaves a labelled slot).

**Out of scope.**
- The **patch-notes JSON + rendering** ("what will be installed" content) — that's #192,
  which renders into the slot this task provides.
- The **dev mock** of an available update — #193 (used to exercise this pane's states).
- Any change to the updater plugins / pipeline / signing (in #190 / later).
- Re-checking on a timer / background polling (boot-time check is #190's; this adds a manual
  button only).

**Concrete files/symbols.**
- `src/components/Settings/Settings.tsx` — add the `"updates"` entry to `SECTIONS` (~line
  31) and a `{section === "updates" && (…)}` render block; read the `update` slice +
  `checkForUpdate`/`installUpdate` from the store; reuse `appVer`.
- `src/components/Settings/Settings.module.css` — pane styles (status line, version rows,
  the patch-notes slot, the action buttons — mirror the Data/About + Behavior styles).
- `src/store.ts` — extend `setSettingsOpen` to accept an optional initial section (or add
  `settingsSection`); the `Section` type gains `"updates"`.
- `src/components/Update/UpdateIndicator.tsx` (from #190) — on click,
  `setSettingsOpen(true, "updates")` instead of (or in addition to) opening #190's confirm
  modal.

**Subtasks**

1. [x] Added `"updates"` to the `Section` type + `SECTIONS` (label "Updates", Lucide
   `RefreshCw`).
2. [x] Rendered the Updates pane: current version (reuses the About `appVersion()` fetch); a
   "Check for updates" button → `checkForUpdate()` (spinner + "Checking…" while checking,
   disabled while checking/downloading); status feedback — `idle` → "You're up to date",
   `error` → `update.error`, `available` → the new version + a labelled **"What's new" slot**
   (`whatsNewSlot`, carries `data-update-version` for #192) + an **"Update now & restart"**
   button → `installUpdate()`; `downloading` → an inline progress bar bound to
   `update.progress` (the #190 full-window freeze overlay still covers the app).
3. [x] Extended `setSettingsOpen(open, section?)` + a `settingsSection` store field (cleared
   on close / a plain open); the modal seeds its initial `section` from it. The #190
   `UpdateIndicator` now opens `setSettingsOpen(true, "updates")` instead of the confirm
   modal.
4. [x] CSS for the pane (`.updates`, status/error lines, `.whatsNew*` slot, `.updateProgress`
   bar, the accent `.updateNow` CTA, a `.spin` keyframe).
5. [x] **Verify** — `npm run build`, `npm run lint`, `npm test` (263, +1) green; **no Rust
   changes**. The live update flow is **runtime-unverified** (needs a real release/key —
   exercised via the #193 mock once it lands); see Notes. Added a store unit test for the
   deep-link.

**Acceptance criteria**

- [x] Settings has an **"Updates"** section with a **"Check for updates"** button, the
      current version, and clear status (checking / up to date / available v<version> /
      error).
- [x] When an update is available, the pane shows the **new version**, a **labelled slot for
      "what will be installed"** (the `whatsNewSlot`, filled by #192), and an **"Update now"**
      button that runs #190's install (freeze/progress/restart) flow via `installUpdate()`.
- [x] The **#190 sidebar indicator opens Settings directly at the Updates section**
      (`setSettingsOpen(true, "updates")` → the modal seeds `section` from `settingsSection`).
- [x] No new updater/plugin/pipeline logic is added here (all reused from #190 — the pane
      only calls `checkForUpdate`/`installUpdate` + reads the `update` slice).
- [x] `npm run build`, `npm run lint`, `npm test` pass; no Rust changes.

**Notes**

- **Autonomous refine (2026-06-26):** user not responding; decisions logged in
  `ASSUMPTIONS.md`.
  - **"Alternative settings screen" = a new "Updates" section in the existing Settings
    modal** (not a separate window), consistent with the modal's section pattern.
  - **Reuses #190 entirely** (store state, `checkForUpdate`/`installUpdate`, freeze/progress/
    restart) — adds only UI + a deep-link. No new updater logic.
  - **The indicator deep-links here**; this Updates pane becomes the primary "review what
    will be installed, then install" surface. #190's minimal confirm modal is now redundant
    for that path — the implementer may drop it or keep it as a quick path (reconcile with
    #190; either way reuse the same install flow). Recorded so an implementer doesn't build
    two competing confirm surfaces.
  - **"What will be installed" = a labelled slot** here; the actual patch-notes content is
    **#192** (which depends on this).
  - Update actions are **immediate** (not draft-staged), like Data & About's actions.
- **Depends on: #190** — needs its `update` store slice, `checkForUpdate`/`installUpdate`,
  the indicator, and the install flow. **#192 (patchnotes) depends on this #191** (renders
  into the "What's new" slot); **#193 (mock) is the way to exercise these panes** before a
  real signed release exists.
- **References:** `Settings.tsx` (`SECTIONS` ~31, `section` state ~78, About version fetch
  ~92, Data pane ~327); `store.ts` `setSettingsOpen`; TASK-190.md (the `update` slice +
  indicator + install flow). CLAUDE.md "Settings (#100/#102/#103/#107/#119)".

**Implementation notes (2026-06-26 — done)**

- Files: `Settings.tsx` (the `"updates"` section + pane), `Settings.module.css` (pane
  styles), `store.ts` (`settingsSection` field + `setSettingsOpen(open, section?)`),
  `store.test.ts` (deep-link test), `UpdateIndicator.tsx` (deep-link onClick). **No Rust
  changes**; **no new updater logic** — the pane only reads #190's `update` slice and calls
  its `checkForUpdate`/`installUpdate`.
- **Deep-link:** `setSettingsOpen(open, section?)` stores an optional `settingsSection`
  (cleared on close and on a plain gear open, so the gear always lands on Terminal). The
  Settings modal is mounted-only-while-open and seeds its `section` `useState` from
  `settingsSection`. The indicator scrim covers the sidebar, so the deep-link only ever fires
  from a *closed* Settings → the fresh-mount seed always applies (no already-open edge case).
- **Naming gotcha:** the store slice is read as `updateState` in `Settings.tsx` because the
  component already has a local `update<K>(key, value)` settings-draft helper that would
  shadow a slice named `update`.
- **#190 confirm modal kept, not dropped:** the indicator now deep-links to the Updates pane
  (the richer review surface), so #190's `UpdateModal` **confirm dialog** is dormant
  (nothing calls `openUpdateConfirm` anymore). Its **install overlay** (status
  `downloading`) is still essential and reused — clicking "Update now" → `installUpdate()` →
  `downloading` → the full-window freeze/progress overlay covers the app (incl. the Settings
  modal) → relaunch. Left `openUpdateConfirm`/`cancelUpdate` in the store for the #193 mock.
- **"You're up to date" semantics:** `update.status === "idle"` shows it; #190's boot
  `checkForUpdate` already resolves to `idle` when there's no update, and the manual button
  re-checks. Outside Tauri (dev/test) the check catches → idle, so the pane reads "up to
  date" rather than erroring.
- **Runtime-unverified (autonomous loop, no GUI session + no signed release):** the live
  pane render and the actual check/install. All states are reachable via #193's
  `setUpdateState`; the wiring is type-checked, lint/format clean, and the deep-link is
  unit-tested. Mirrors the #190 precedent; recommend a pass once #193 lands (and a real
  release later).
