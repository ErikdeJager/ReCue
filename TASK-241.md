# TASK-241

### 241. [x] Add an attention-grabbing glowing tooltip beside the sidebar feedback (bug-report) button

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

The sidebar footer has a **feedback / bug-report button** (#210) — a `Bug` icon
(`src/components/Sidebar/Sidebar.tsx`, ~lines 1992–2002: a `.footerButton` with
`onClick={() => void openUrl(FEEDBACK_FORM_URL)}`, `title="Send feedback"`), sitting at
the **bottom-left** of the app. It's easy to miss. This task adds an **attention-grabbing,
glowing tooltip** to the **right** of that button reading **"Report bugs and request
features"**, to draw the eye to it.

**Behavior (per the user's decisions, step 5):**

- **Appears automatically** when the sidebar mounts (i.e. on app launch / main-window
  open).
- **Disappears after 10 seconds**, OR **as soon as the user hovers (or focuses) the
  feedback button** — whichever comes first.
- **Every launch:** it shows on **every** app startup (no "seen" persistence — purely
  frontend, no backend flag needed). Auto-hides each time per the rule above.
- **Expanded sidebar only:** do **not** show it in the collapsed icon rail (the ~44px
  rail has no horizontal room for a tooltip to its right). When `sidebarCollapsed` is
  true, the nudge is not rendered.
- **Text:** exactly **"Report bugs and request features"** (easily adjustable; this is the
  card's example wording, confirmed).

**Grounding (current code).**

- `src/components/Sidebar/Sidebar.tsx`: the footer (`.footer`, ~line 1980) holds the
  Settings gear, the **feedback button** (~1994), and the collapse toggle. `Bug` is
  already imported (line 17). `sidebarCollapsed` is already in scope (used for
  `.footerCollapsed`). The Sidebar mounts only in the **main window**, so the nudge is
  inherently main-window-only.
- **Reusable attention-glow pattern:** `src/components/Update/Update.module.css`
  (~lines 50–72) — the #216 `@keyframes update-announce` (accent border +
  `box-shadow` ring/glow pulse, box-shadow/border only so **no layout shift**) and
  `.indicatorAnnounce { animation: update-announce 0.7s var(--ease-out) 3 }`. Mirror this
  aesthetic. The global reduced-motion killswitch (`src/styles/global.css`) clamps
  iteration-count to 1 and zeroes durations, so animations must **end at the resting
  style** to settle correctly under `prefers-reduced-motion` / `body.reduce-motion`.
- No generic tooltip component exists (the app uses native `title`); this is a small
  bespoke element, not a new shared component.

**Subtasks**

1. [ ] **State + timers** in `Sidebar()`: add a `feedbackNudgeDismissed` boolean state
   (starts `false`). The nudge renders when `!feedbackNudgeDismissed && !sidebarCollapsed`.
   Start a **10s** `setTimeout` that sets it dismissed; start the countdown when the nudge
   **first becomes visible** (so a launch-in-collapsed-then-expand still shows it once),
   and clear the timer on unmount / on dismiss. (A `useEffect` keyed on the
   visible condition is a clean way to start the timer once.)
2. [ ] **Dismiss on hover/focus:** add `onMouseEnter` + `onFocus` handlers to the
   **feedback button** that set `feedbackNudgeDismissed = true` (clicking implies hover,
   so the open-form path is covered). Keep the button's existing `title`/`aria-label`.
3. [ ] **Render the tooltip:** wrap the feedback button in a `position: relative` element
   (or render the tooltip as an absolutely-positioned sibling) and place a
   `.feedbackNudge` pill **to the right** of it (`left: 100%`, a small left margin, vertically
   centered). Use `white-space: nowrap`; allow it to **overflow the sidebar's right edge**
   into the content area (so the full text shows regardless of sidebar width) — ensure no
   clipping ancestor cuts it off (if the footer/sidebar clips, render the pill from a
   higher, non-clipping container or raise its stacking with a high `z-index`). Add a small
   left-pointing caret toward the button (optional, nice-to-have). Set the pill
   `pointer-events: none` (it must not intercept the button hover) and `aria-hidden="true"`
   (the button is already labeled; avoid a duplicate screen-reader announcement).
4. [ ] **Glow styling + animation** (`Sidebar.module.css`): style `.feedbackNudge` as a
   small rounded pill (`--bg-elevated` bg, `--accent` border, `--text-primary` text,
   `--fs-meta-sm`/`--fs-meta`), with an **accent glow** `box-shadow` and a **gentle
   pulsing** animation echoing `update-announce` (accent ring/glow pulse, box-shadow/border
   only — no layout shift). Fade in on appear and fade out on dismiss. **Reduced motion:**
   under `body.reduce-motion` (and via the global killswitch) drop the pulse and keep a
   static accent glow (the keyframe must resolve to the resting style so a clamped run
   settles).
5. [ ] **Verify:** `npm run build`, `npm run lint`, `npm test`. Manual: on launch the
   glowing "Report bugs and request features" tooltip appears to the right of the
   bottom-left bug button; it vanishes after ~10s, and immediately on hovering the button;
   it does **not** appear in the collapsed rail; under reduced motion it shows a static
   glow (no pulse); clicking the button still opens the feedback form.

**Acceptance criteria**

- [x] On app launch (expanded sidebar), a **glowing** tooltip reading **"Report bugs and
      request features"** appears **to the right** of the bottom-left feedback (bug) button.
- [x] It **auto-hides after ~10 seconds**, and **immediately when the user hovers/focuses**
      the feedback button (whichever first).
- [x] It appears on **every** launch (no persisted "seen" state).
- [x] It is **not** shown when the sidebar is **collapsed**.
- [x] The glow/pulse respects reduced motion (static glow, no animation under
      `body.reduce-motion` / `prefers-reduced-motion`); the tooltip causes **no layout
      shift** and does not block the button's click/hover.
- [x] The feedback button still opens the feedback form on click; its `title`/`aria-label`
      are unchanged.
- [x] `npm run build`, `npm run lint`, `npm test` pass. Pure frontend — identical on macOS
      and Windows (the Sidebar mounts only in the main window).

**Notes**

- **User answers (step 5):** **every launch** (no persistence); **expanded sidebar only**
  (skip the collapsed rail); text **"Report bugs and request features"**.
- **Reuse references:** the #216 `update-announce` glow keyframe + `.indicatorAnnounce`
  (`Update.module.css`) as the glow/pulse template (box-shadow/border only, reduced-motion
  safe); `FEEDBACK_FORM_URL` + `openUrl` (#210/#217) are unchanged.
- **No backend needed:** "every launch" means a plain `useState`-driven nudge with a 10s
  timeout — no new persisted flag, no Rust change. (Had the choice been "once ever",
  a dedicated scalar like `last_version` would have been needed; it is not.)
- **Positioning caveat:** the footer is a flex row; the pill should be absolutely
  positioned and allowed to overflow the sidebar's right edge so its full text shows at any
  sidebar width — watch for a clipping `overflow` ancestor and raise `z-index`/render from a
  non-clipping container if needed.
- **Dependencies:** none — independent frontend feature on shipped code (#210 feedback
  button, #216 glow pattern). No relation to the other Refine/READY cards.
- **Cross-platform:** pure React + CSS; no OS-specific code. Renders identically in
  WKWebView (macOS) and WebView2 (Windows).
