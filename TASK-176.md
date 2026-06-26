# TASK-176

### 176. [x] Configurable Overview panel minimum width (Settings → Appearance)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

In **Overview** mode the "agent wall" lays each repo's columns out as equal-width flex
items that grow to fill the wall but never shrink below a fixed minimum, so excess
columns scroll horizontally instead of squeezing thin. That minimum is hard-coded in the
`.card` rule of `src/components/Overview/Overview.module.css`:

```css
.card {
  ...
  flex: 1 0 360px;   /* flex-grow:1  flex-shrink:0  flex-basis:360px → 360px floor */
  ...
}
```

The raw request ("increase the minimum width very slightly so there's a bit more space
for the elements") has been **upgraded by the user into a configurable setting**: the
user should be able to set the Overview panel minimum width themselves in the **Settings**
modal. The previous default (360px) becomes a user-adjustable value whose **default is
400px** (the value the user picked for the "slight increase", so users who never open
Settings still get the improvement).

**Approach — a CSS variable driven by a new setting.** ClaudeCue's Settings system
(#100/#102/#107) stages edits in a modal-local **draft** and, on **Save**, runs
`saveSettings` → `applySettingsEffects(settings)` (`src/store.ts`), which already pushes
imperative effects to the DOM (accent tokens on `document.documentElement`, the
reduce-motion body class) and live terminals. We add one more effect: set a CSS custom
property `--overview-card-min` to `<value>px`, and have `.card` read it:

```css
.card { flex: 1 0 var(--overview-card-min, 400px); }
```

So the slider's value flows: draft → Save → `applySettingsEffects` sets
`--overview-card-min` on `:root` → the (possibly already-mounted) Overview `.card`s reflow
to the new floor immediately. The `400px` CSS fallback matches the default for the first
paint before any JS runs. No backend change: settings persist as the existing opaque
`settings` blob (`get_settings`/`set_settings`), and `mergeSettings` already merges a
persisted (possibly older, key-missing) blob over `DEFAULT_SETTINGS`, so an old
`sessions.json` upgrades cleanly — the new key takes its 400 default.

**Control & placement (decided — see Notes):** a `Slider` (the same component the
Terminal section uses for font size / line height) in the **Appearance** section, since
this is a visual/layout preference alongside the accent color + reduce-motion. Range
**320–600px, step 20px**, default **400px** (320 lets a user pack more columns tighter
than today's 360; 600 is a generous upper bound).

**Scope**

- Add a `overviewPanelMinWidth: number` field to the `Settings` interface + a `400`
  default in `DEFAULT_SETTINGS`.
- Apply it as the `--overview-card-min` CSS variable in `applySettingsEffects`.
- Change `.card`'s `flex` to read `var(--overview-card-min, 400px)`.
- Add a labeled `Slider` to the **Appearance** section of the Settings modal, wired to the
  draft like the other controls (applies on Save).

**Out of scope**

- The **Canvas** panel sizing (react-resizable-panels) — Overview only, per the card.
- Per-repo or per-column width overrides — a single global value.
- A separate "maximum width" / fixed-width mode — columns still `flex-grow` to fill; this
  only sets the floor (the scroll threshold).
- Any Rust/backend change — the `settings` blob is opaque and merged TS-side.

**Subtasks**

1. [ ] **Type:** in `src/types/index.ts`, add to the `Settings` interface (e.g. under an
   "Appearance" grouping, near `accentColor`/`reduceMotion`):
   `/** Overview column minimum width in px (320–600). */ overviewPanelMinWidth: number;`
2. [ ] **Default:** in `src/store.ts`, add `overviewPanelMinWidth: 400,` to
   `DEFAULT_SETTINGS` (~line 389). (`mergeSettings` then back-fills it for older persisted
   blobs automatically.)
3. [ ] **Apply effect:** in `applySettingsEffects` (`src/store.ts` ~line 440), **inside the
   DOM-guarded block** (after the `if (typeof document === "undefined") return;` guard,
   alongside the accent `setProperty` calls), add:
   `root.style.setProperty("--overview-card-min", \`${s.overviewPanelMinWidth}px\`);`
   (Always set it — unlike accent there's no "default = unset" case, since the CSS fallback
   only covers the pre-JS paint.)
4. [ ] **CSS:** in `src/components/Overview/Overview.module.css`, change the `.card` rule
   from `flex: 1 0 360px;` to `flex: 1 0 var(--overview-card-min, 400px);`. (Keep the
   explanatory comment above it accurate — it still "never shrinks below the min".)
5. [ ] **Settings UI:** in `src/components/Settings/Settings.tsx`, in the
   `section === "appearance"` block (after the accent swatches / near the reduce-motion
   checkbox), add a `Slider`:
   ```tsx
   <Slider
     label="Overview panel min width"
     valueLabel={`${draft.overviewPanelMinWidth}px`}
     min={320}
     max={600}
     step={20}
     value={draft.overviewPanelMinWidth}
     onChange={(v) => update("overviewPanelMinWidth", v)}
   />
   ```
   (Mirrors the Terminal section's font-size slider exactly; `update` already handles the
   draft.)
6. [ ] **Verify the merge path:** confirm a persisted settings blob lacking the new key
   loads with `overviewPanelMinWidth === 400` (via `mergeSettings`) and that
   `applySettingsEffects` runs on boot (`src/store.ts` ~lines 1612/1729) so the CSS var is
   set before/while Overview mounts.
7. [ ] Run `npm run build`, `npm run lint`, `npm test`, `npm run format:check`, and
   `cargo test --manifest-path src-tauri/Cargo.toml` (+ `npm run lint:rust`); fix any
   issues. (Frontend-only; Rust unaffected but run per convention.)
8. [ ] Sanity-check in `npm run tauri dev` if available: Settings → Appearance shows the
   slider; dragging it and pressing **Save** widens/narrows the Overview columns live (the
   floor before horizontal scroll changes); the value persists across an app restart;
   **Cancel/Escape** discards an un-saved change.

**Acceptance criteria**

- [ ] Settings → **Appearance** has an "Overview panel min width" slider (320–600px, step
      20), defaulting to **400px**, wired to the draft and applied on **Save** (Cancel /
      Escape / scrim discard, like every other setting).
- [ ] Changing it and saving updates the Overview column minimum width **live** (columns
      reflow; the horizontal-scroll threshold tracks the value) without a reload.
- [ ] The value **persists** across app restarts; a pre-existing `sessions.json` without
      the key loads at the 400 default with no error (clean `mergeSettings` upgrade).
- [ ] Overview columns still `flex-grow` to fill the wall on a wide window (no fixed/capped
      width); only the minimum/scroll-floor is governed by the setting.
- [ ] `.card` uses `flex: 1 0 var(--overview-card-min, 400px)`; no other layout rule
      changed; Canvas panels are unaffected.
- [ ] `npm run build`, `npm run lint`, `npm test`, `npm run format:check`, `cargo test`,
      and `npm run lint:rust` all pass.

**Notes**

- **User direction (this conversation, 2026-06-26):** the user interrupted the simpler
  "bump 360→400" refinement and asked to **make it a configurable setting** the user can
  set in Settings, as its **own task** (#175 — the file-tree task — was already picked up,
  so this is authored fresh as #176). They said "whatever you prefer" on the details, so
  the refine agent decided:
  - **Default = 400px** (the value the user picked earlier for the "slight increase", so
    the out-of-box behavior still improves on today's 360).
  - **Section = Appearance** (a visual/layout preference; sits with accent + reduce-motion).
  - **Control = `Slider`**, **range 320–600px, step 20** (mirrors the Terminal font-size /
    line-height sliders; 320 allows tighter packing than today, 600 a generous ceiling).
  These are reasonable defaults — adjust if the user later prefers a different section or
  range.
- **Grounding references:**
  - `src/components/Overview/Overview.module.css` — `.card { flex: 1 0 360px; }` (~line 70),
    the only width rule; `.wall` is `display:flex; overflow-x:auto` (columns are
    horizontally-scrolling flex children, so raising the basis raises the scroll threshold).
  - `src/types/index.ts:184` — the `Settings` interface (add the field).
  - `src/store.ts` — `DEFAULT_SETTINGS` (~389), `mergeSettings` (~404, back-fills missing
    keys), `applySettingsEffects` (~440, DOM-guarded CSS-var application; mirror the accent
    `root.style.setProperty` calls), `saveSettings` (~1743, applies effects on Save), and
    the boot/load `applySettingsEffects` calls (~1612/1729).
  - `src/components/Settings/Settings.tsx` — the draft/`update` model (~109), the `Slider`
    import + the Terminal section's slider usage (~179), and the `section === "appearance"`
    block (~206) where the new slider goes.
  - `src/components/Slider/Slider.tsx` (#122) — the slider component (`label`, `valueLabel`,
    `min`, `max`, `step`, `value`, `onChange`).
- No new persistence/IPC: the `settings` blob is opaque (`get_settings`/`set_settings`),
  so the Rust side needs no change. No dependencies — the Settings system and Overview CSS
  all exist today.
