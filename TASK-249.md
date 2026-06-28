# TASK-249

### 249. [ ] Canvas tab-strip icon buttons: shrink the new-tab/Templates/Distribute cluster to match the × close button

**Status:** Done · _(Not started | In progress | Done)_
**Depends on:** none
**Created:** 2026-06-28

**Description**

In the Canvas view, the tab strip (`src/components/Canvas/CanvasTabs.tsx`,
styled by `src/components/Canvas/Canvas.module.css`) renders a row of icon
buttons whose box sizes are inconsistent:

- The **per-tab `×` close** button — `.tabClose` — is a **20×20px** box with a
  14px `X` icon (`Canvas.module.css:86`).
- The **`+` new-tab** button — `.tabAdd` — is a **24×24px** box with a 14px
  `Plus` icon (`Canvas.module.css:110`).
- The **`Templates ▾`** trigger and the **Distribute-evenly** grid button both
  reuse the **same `.tabAdd`** class, so they are also **24px** tall. (Templates ▾
  holds two icons — `LayoutTemplate` 14px + `ChevronDown` 11px; Distribute uses
  `.tabAdd` plus `.tabDistribute`, which only adds `margin-left: auto`.)

The result is the `+` (and the Templates/Distribute buttons) read visibly bigger
than the `×` on each tab. The raw request: make the new-tab button the **same
size as the `×` button**.

**Decision (confirmed with the user):** match the **whole right-side cluster** to
the `×` size, not just the `+` — so the strip's controls all share the `×`
button's height. Concretely:

- The **`+` new-tab** button → **20×20px** (a 20px square, matching `×`).
- The **Distribute-evenly** button → **20×20px** (single icon, also a square).
- The **`Templates ▾`** trigger → **20px tall**, but keep its **natural
  (auto) width** because it carries two icons (the label glyph + the chevron); a
  20px-wide square would clip them. Only its height needs to match.

The `×`, `+`, and Distribute icons are already all 14px, so **only the box
dimensions change** — no icon-size edits are needed. (The `×` close button is the
reference size and **stays at 20×20** — do not enlarge it.)

**Scope**

- Resize the `.tabAdd`-based buttons in the Canvas tab strip so the `+` and
  Distribute buttons are 20×20 and the Templates ▾ trigger is 20px tall.
- This is a CSS-only change in `Canvas.module.css`, with a small markup tweak in
  `CanvasTabs.tsx` only if a new class is needed for the Templates ▾ trigger's
  auto width (see Subtasks).

**Out of scope**

- The per-tab **`×` close** button (`.tabClose`) — it is the reference size and
  must remain **20×20** (unchanged).
- The per-tab **pop-out / focus-window** button (`.tabPopOut`, 18px, 13px icon) —
  not part of the right-side add/templates/distribute cluster and not mentioned by
  the request; leave it as-is.
- Tab **labels**, the inline-rename **input** (`.tabInput`), the tab body
  (`.tab`), or any spacing/layout of the strip (`.tabStrip` gap/padding) beyond
  what the box-size change requires.
- No behavioral change — purely visual sizing.

**Subtasks**

1. [ ] In `Canvas.module.css`, change `.tabAdd` from `width: 24px; height: 24px;`
   to **`width: 20px; height: 20px;`** (`Canvas.module.css:110-114`). This makes
   the `+` and Distribute buttons 20×20 squares (both are single-icon, so a square
   is correct).
2. [ ] Give the **Templates ▾** trigger an **auto width at 20px height** so its
   two icons aren't clipped by the new 20px square width. Add a small dedicated
   modifier class, e.g. `.tabMenuTrigger`, that overrides:
   - `width: auto;`
   - a little horizontal padding so the two icons breathe, e.g.
     `padding: 0 var(--space-2);` (2px) — tune to taste, keep it tight,
   - optionally `gap: var(--space-1);` (1px) between the label icon and the
     chevron (`.tabAdd` currently sets no gap).
   Apply it in `CanvasTabs.tsx` on the Templates button alongside `.tabAdd`:
   `className={`${styles.tabAdd} ${styles.tabMenuTrigger}`}` (around
   `CanvasTabs.tsx:282`). Leave the `+` button (`CanvasTabs.tsx:269`) and the
   Distribute button (`CanvasTabs.tsx:355`, `${styles.tabAdd} ${styles.tabDistribute}`)
   unchanged in markup — they inherit the new 20px `.tabAdd` size automatically.
3. [ ] Update the now-stale comment on `.tabClose` (`Canvas.module.css:88-89`),
   which currently reads "still well under the 24px add (+) button" — the `+` is
   now the same 20px size, so reword (e.g. note the box now matches the `+`/strip
   icon buttons) to avoid misleading the next reader.
4. [ ] Verify the Templates ▾ button still shows both its icons (label glyph +
   chevron) without clipping at the new 20px height, and that the `+` and
   Distribute buttons are visually the same size as a tab's `×`.

**Acceptance criteria**

- [ ] In the Canvas tab strip, the **`+` new-tab** button and the
  **Distribute-evenly** button render as **20×20px** boxes — the same size as a
  tab's **`×` close** button.
- [ ] The **`Templates ▾`** trigger is **20px tall** (matching the `×`), with both
  its icons (`LayoutTemplate` + `ChevronDown`) fully visible and not clipped.
- [ ] The **`×` close** button is unchanged (still 20×20).
- [ ] No regression to the strip's hover styling, the dropdown menu behavior
  (open/close, positioning), drag-to-reorder, or the disabled state of Distribute
  (`.tabAdd:disabled`) and the menu items.
- [ ] `npm run build` (type-check) and `npm run lint` pass.
- [ ] **Works on both macOS and Windows** — this is a pure CSS Module change using
  `width`/`height`/`padding`/flex with no `-webkit-`-only properties, vibrancy, or
  `color-mix` introduced, so WKWebView (macOS) and WebView2/Chromium (Windows)
  render it identically; no `#[cfg]` gating or platform signal is involved.

**Notes**

- **User decision (step 5 question):** asked whether to resize only the `+`
  (literal reading of "both the same size") or the whole right-side cluster. User
  chose **"Whole cluster matches ×"** — so `+`, Distribute, and the Templates ▾
  trigger all match the `×` button's size (Templates ▾ matches height only, with
  auto width for its two icons). The `×` close button is the reference and stays
  20×20.
- The `.tabAdd` class is **shared** by the `+`, `Templates ▾`, and Distribute
  buttons, which is why simply changing `.tabAdd` to 20px is the right base move
  and only the Templates trigger needs an extra auto-width override. (A
  `min-width: 20px` on the menu trigger would also keep it from collapsing below
  the square baseline if its icons were ever removed, but is optional.)
- Token reference: `--space-1: 1px`, `--space-2: 2px`, `--space-4: 4px`,
  `--radius-chip: 5px` (`src/styles/tokens.css:86-100`). The icons are all 14px
  (`X`, `Plus`, `Grid2x2`) except the chevron (11px) in the Templates trigger.
- No automated tests cover CSS sizing; verification is visual (run the app, open
  the Canvas view, compare the `+`/Templates/Distribute buttons against a tab's
  `×`).
