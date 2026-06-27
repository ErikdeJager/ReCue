### 216. [x] One-time attention animation on the update indicator when it first appears

**Status:** Done
**Depends on:** #215
**Created:** 2026-06-27

**Description**

When the update indicator first appears on app open (i.e. the first time it becomes
visible in a session because an update is available), play a **one-time
attention-grabbing animation** — a ping / glow / border pulse — to draw the eye, then
let it settle to its **normal** resting look. The animation must **not** loop or replay
on every re-render; it plays once per app session.

Grounding (read before implementing):

- Component: `src/components/Update/UpdateIndicator.tsx` — returns `null` while
  idle/checking/downloading, and renders the `<button className={styles.indicator}>`
  when `update.status === "available"` (or `"error"`). So "first appears" = the first
  time this component renders its button in a session.
- Styles: `src/components/Update/Update.module.css` (`.indicator` and friends).
- **Reduced-motion is handled globally:** `src/styles/global.css` has a
  `body.reduce-motion *` killswitch (lines ~114–129) that the store toggles on
  Save/boot; any new keyframe animation is automatically disabled there — no per-rule
  guard needed (but don't rely on the animation for layout/visibility).
- **One-shot animation precedent:** `src/components/FileTree/FileTree.module.css`
  `@keyframes reveal-flash` (~line 295, the #202 "Reveal in tree" flash) — a finite
  attention flash applied via a transient class. Mirror that pattern.

Implementation approach (recommended):

1. Add an `@keyframes` (e.g. `update-announce`) in `Update.module.css` that pulses the
   chip's **glow/border** a few times (finite `animation-iteration-count`, ~2–3) then
   ends — e.g. animate `box-shadow`/`border-color` between a normal and an
   accent-glow state. Prefer a **glow/border pulse** over a scale "ping" so there is
   **no layout shift / reflow** in the sidebar column. End state must equal the normal
   resting style from **#215** (so it "settles to normal").
2. Apply the animation via a transient class (e.g. `.indicatorAnnounce`) added only on
   the **first** appearance in a session. Guard replays with a **session-once flag** —
   a module-level boolean in `UpdateIndicator.tsx` (simplest) or a store flag (e.g.
   `update.announced`) set once the animation has been applied — so collapse-toggle
   re-renders or a status flip away-and-back don't replay it.
3. Ensure it composes with #215's hover light-up (the hover and the one-shot animation
   shouldn't fight — the announce animation runs once on mount; hover takes over after).

**Scope / out of scope**

- In scope: a one-time, finite attention animation on first appearance + a
  session-once guard so it doesn't loop/replay; reduced-motion respected (via the
  global killswitch).
- Out of scope: the margin/hover restyle (that is **#215**); animating the error
  variant differently (apply the same announce, or skip it for errors — implementer's
  call, default: apply to the "available" appearance only); persisting "announced"
  across app restarts (it should play once **per app open**, so a per-session flag is
  correct — do **not** persist it).

**Subtasks**

1. [x] Add `@keyframes update-announce` (glow/border pulse, finite count, ends at the
   normal resting style) to `Update.module.css` + an `.indicatorAnnounce` class.
2. [x] In `UpdateIndicator.tsx`, apply `.indicatorAnnounce` only on the first
   appearance in a session, guarded by a session-once flag (module-level ref or a
   store `update.announced` flag) so it never loops/replays.
3. [x] Confirm it settles to the #215 resting look and doesn't shift sidebar layout.
4. [x] Verify it is disabled under reduced motion (`body.reduce-motion`).
5. [x] Exercise via the dev mock (#193): `clearUpdate()` then `mockUpdate(...)` to see
   the first-appearance animation; toggle collapse to confirm it doesn't replay.
   `npm run lint` + `npm run build`.

**Acceptance criteria**

- [x] The first time the update indicator appears after app open, it plays a single
      finite attention animation (ping/glow/border), then rests at the normal #215 look.
- [x] It does **not** loop, and does **not** replay on re-render (collapse toggle) or
      when the status flips away and back within the same session.
- [x] No sidebar layout shift while it animates.
- [x] The animation is disabled under reduced motion.
- [x] `npm run lint` and `npm run build` pass.

**Notes**

- Decided autonomously (refine loop, user not answering — see `ASSUMPTIONS.md`).
- "When it first appears on app open" → a **per-session** one-shot (not persisted); a
  module-level/store flag prevents replays. Recommended a glow/border pulse (no
  reflow) over a scale ping. Mirror the `reveal-flash` (#202) one-shot pattern.
- **Depends on #215** — both edit the same `.indicator` element + `Update.module.css`;
  sequencing lowest-first avoids edit conflicts (this builds on #215's resting style,
  not a cycle).
