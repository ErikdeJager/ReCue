# TASK-237

### 237. [ ] Persist the diff viewer's display modes (focus/accordion + unified/split) so the last choice becomes the default for new viewers

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-28

**Description**

The diff viewer (`DiffInspector`) has an in-panel **focus/accordion** display toggle
(#231) and a **unified/split** line toggle. Today, changing either toggle only updates
that panel's local React state — the choice is **not remembered**, so the next diff
viewer the user opens reverts to the global default. This task makes the **last-chosen
display mode the default for newly-opened diff viewers**, by persisting both toggles to
settings.

**Per the user's decisions (step 5):**

1. **Scope = both display-style toggles:** persist **focus/accordion** *and*
   **unified/split**. The **source** toggle (working / compare / commits) is **out of
   scope** — it stays non-persisted (it's context-specific, and the selected
   commit/branch-compare already persists per panel via `overviewPanels`, #81/#230).
2. **Only new viewers:** changing the mode inside one open diff viewer must **not**
   retroactively change other **already-open** diff viewers — each keeps its current
   per-panel mode (the #231 "toggle this panel independently" behavior is preserved).
   The new choice only becomes the default for the **next** diff viewer opened.
3. **Same setting (single source of truth):** the in-panel toggle writes to the **same
   persisted settings value** that drives the default — no separate "last used" field.
   For focus/accordion that value already exists (`settings.diffDisplayMode`); for
   unified/split a matching new setting is added.

**Grounding (current code).**

- `src/components/DiffInspector/DiffInspector.tsx`:
  - `displayMode` (`DisplayMode = "focused" | "accordion"`) is seeded **once** from the
    global setting (line ~254): `useState<DisplayMode>(() =>
    useStore.getState().settings.diffDisplayMode)`. The two toggle buttons (~lines
    457–474) call `setDisplayMode("focused")` / `setDisplayMode("accordion")` — local
    state only, no persistence.
  - `mode` (`DiffMode = "unified" | "split"`) is **hardcoded** (line 226):
    `useState<DiffMode>("unified")`. Its toggle buttons (~lines 480–490) call
    `setMode("unified")` / `setMode("split")` — local state only, no seed, no
    persistence.
  - The **source** toggle (`source` = working/compare/commits, ~lines 514–533) is the
    one to leave unchanged.
- `src/types/index.ts:251` — `diffDisplayMode: "focused" | "accordion"` on the `Settings`
  type. (Add `diffLineMode` here.)
- `src/store.ts:517` — `DEFAULT_SETTINGS` contains `diffDisplayMode: "focused"`. (Add
  `diffLineMode: "unified"`.) `saveSettings(settings)` (line ~2197) merges the settings
  into the store, runs `applySettingsEffects`, and persists via `ipc.setSettings`.
- `src/components/Settings/Settings.tsx:355–379` — the existing "Diff display mode"
  segmented control (`update("diffDisplayMode", v)` over `["focused","accordion"]`) with
  helpText "How the diff viewer lays out changed files. Each diff panel can still be
  toggled independently." (Add a sibling "Diff line mode" control beside it.)

**Why "only new viewers" falls out naturally:** each panel seeds its local `displayMode`
/ `mode` **once** at mount and otherwise keeps independent local state. Persisting the
toggle to settings does **not** re-read into already-mounted panels, so open panels keep
their mode while newly-mounted panels seed from the updated setting. Keep this
seed-once + local-state structure — do **not** convert `displayMode`/`mode` into values
read live from the store (that would sync all open panels, which decision (2) forbids).

**Scope / out of scope.**

- **In scope:** persist focus/accordion (`diffDisplayMode`, reuse existing) and
  unified/split (new `diffLineMode`); seed both from settings; add a Settings control for
  the new `diffLineMode` so the two display-style toggles are symmetric and the
  single-source-of-truth holds (Settings reflects the last in-panel choice).
- **Out of scope:** the source toggle (working/compare/commits); the selected
  commit/branch-compare persistence (already handled, #81/#230); any backend change
  (settings already persist as one opaque blob — adding a field upgrades cleanly via the
  `DEFAULT_SETTINGS` merge); live-syncing already-open panels.

**Subtasks**

1. [ ] **Add the new setting:**
   - `src/types/index.ts`: add `diffLineMode: "unified" | "split"` to the `Settings`
     type (next to `diffDisplayMode`).
   - `src/store.ts`: add `diffLineMode: "unified"` to `DEFAULT_SETTINGS` (line ~517).
     Older persisted `settings.json` blobs upgrade cleanly because settings are merged
     over `DEFAULT_SETTINGS`.
2. [ ] **Seed the line mode from settings** in `DiffInspector.tsx`: change line 226
   `useState<DiffMode>("unified")` → `useState<DiffMode>(() =>
   useStore.getState().settings.diffLineMode)` (mirroring how `displayMode` is seeded).
   Leave `displayMode`'s existing seed as-is.
3. [ ] **Persist on toggle** in `DiffInspector.tsx`: read `settings` + `saveSettings`
   from the store, and make the four display-style toggle buttons set local state **and**
   persist. E.g. add wrappers:
   - `chooseDisplayMode(next)`: `setDisplayMode(next); void saveSettings({
     ...useStore.getState().settings, diffDisplayMode: next })`
   - `chooseLineMode(next)`: `setMode(next); void saveSettings({
     ...useStore.getState().settings, diffLineMode: next })`
   Wire the focus/accordion buttons to `chooseDisplayMode` and the unified/split buttons
   to `chooseLineMode`. (Use `useStore.getState().settings` at call time so a concurrent
   change to another setting field isn't clobbered. `saveSettings` already updates the
   store + persists + re-applies effects idempotently — acceptable for an occasional
   toggle. A dedicated granular store action is an acceptable alternative if preferred,
   but is not required.) Do **not** touch the `source` toggle.
4. [ ] **Add the Settings control** for the new line mode in `Settings.tsx`, directly
   after the existing "Diff display mode" field (~line 379): a sibling "Diff line mode"
   segmented control over `[["unified","Unified"],["split","Split"]]` using
   `update("diffLineMode", v)` / `draft.diffLineMode`, with a short helpText. Optionally
   tweak the existing "Diff display mode" helpText to note the last in-panel choice
   becomes the default for new panels.
5. [ ] **Verify:** `npm run build`, `npm run lint`, `npm test` pass. Manually: open a
   diff viewer, switch to Accordion + Split, close it, open a new diff viewer → it
   defaults to Accordion + Split; a second diff viewer left open does **not** change when
   you toggle the first; the Settings → Diff controls reflect the last in-panel choice.

**Acceptance criteria**

- [ ] Toggling **focus/accordion** in a diff viewer makes that choice the default the
      **next time a diff viewer is opened** (persists across the session and app restart).
- [ ] Toggling **unified/split** in a diff viewer likewise becomes the default for the
      next diff viewer (a new `diffLineMode` setting, default `"unified"`, persisted).
- [ ] Changing the mode in one open diff viewer does **not** change other diff viewers
      that are **already open** — only newly-opened viewers inherit the change.
- [ ] The in-panel toggles and the **Settings** controls share one value each (single
      source of truth): the Settings → Diff display mode / Diff line mode controls reflect
      the last in-panel choice, and setting them in Settings changes the default for new
      viewers.
- [ ] The **source** toggle (working/compare/commits) and the selected commit / branch
      compare are unchanged.
- [ ] `npm run build`, `npm run lint`, and `npm test` pass. Pure frontend — identical on
      macOS and Windows (per the cross-platform requirement; settings persist as one
      opaque blob, no backend change).

**Notes**

- **User answers (step 5):** (1) persist **both** focus/accordion and unified/split, not
  the source toggle; (2) **only new viewers** inherit a change — already-open panels keep
  their mode (preserve per-panel local state, seed-once); (3) **same setting / single
  source of truth** — the in-panel toggle writes to the same persisted value the Settings
  control drives.
- **Assumption (minor, recorded):** because unified/split had no Settings control,
  honoring "single source of truth" + symmetry with `diffDisplayMode` means adding a
  parallel "Diff line mode" Settings control. If a Settings control for it is *not*
  wanted, drop subtask 4 and keep the persisted field only (the in-panel toggle still
  works); the field still exists so new viewers inherit the last choice.
- **Reuse references:** `DiffInspector`'s existing `displayMode` seed
  (`useStore.getState().settings.diffDisplayMode`) is the exact pattern for the new
  `mode` seed; the Settings "Diff display mode" segmented control is the template for the
  new "Diff line mode" control; `saveSettings` is the existing persistence path.
- **Builds on shipped code** (#231 display mode + `diffDisplayMode` setting, #230 commits,
  #81 compare) — all Done. **Depends on: none.**
- **Cross-platform:** pure frontend; settings already persist via the existing
  cross-platform `set_settings` blob. No OS-specific code.
