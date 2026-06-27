### 215. [x] Tighten the update indicator's margin + add a hover light-up

**Status:** Done
**Depends on:** none
**Created:** 2026-06-27

**Description**

The sidebar-footer **update indicator** chip (`UpdateIndicator`, #190, restyled #203)
currently sits with a fairly generous inset and a very quiet hover. This task makes two
small visual tweaks the user asked for: **reduce its margin** (but keep a little) and
add a **hover "light-up"** effect so it reads as clearly interactive on hover.

Grounding (read before implementing):

- Component: `src/components/Update/UpdateIndicator.tsx` — a `<button className={styles.indicator}>`
  shown only when `update.status` is `"available"` or `"error"` (else returns `null`);
  collapses to icon-only in the rail (`indicatorCollapsed`).
- Styles: `src/components/Update/Update.module.css`. The relevant rules:
  - `.indicator` (lines ~4–18): `margin: 0 var(--space-8) var(--space-8)` (no top,
    `space-8` left/right, `space-8` bottom); hairline border; transparent fill;
    `transition: background var(--dur-fast) var(--ease-out)`.
  - `.indicator:hover` (lines ~20–23): only `background: var(--bg-hover)` — a very
    subtle change (the "quiet" #203 treatment).
  - `.indicatorError` / `.indicatorError:hover` (lines ~30–38): error variant with a
    `--status-error` border.
  - `.indicatorIcon` (lines ~41–44): the icon stays `--accent` (the one color touch).

Changes:

1. **Reduce the margin** from `var(--space-8)` to `var(--space-4)` on the sides and
   bottom (keep a little inset so it still ties to the footer below it — don't drop to
   0). Keep the collapsed-rail centering (`indicatorCollapsed`) working.
2. **Hover light-up:** on `.indicator:hover`, in addition to (or instead of) the
   `--bg-hover` fill, brighten the chip — recommended: `border-color: var(--accent)`
   (or `--accent-dim`) + a faint accent-tinted background (e.g. `--accent-dim` /
   `--bg-hover`) so it visibly "lights up," with the accent icon already present. Add
   `border-color` to the `transition` so it eases. Apply an analogous light-up to
   `.indicatorError:hover` using the error color (`--status-error` border tint) so the
   error variant stays consistent.

Keep it tasteful and on-token — this is the #203 "quiet at rest, clear on hover"
chip, not a loud button. Use design tokens only (no off-system colors).

**Scope / out of scope**

- In scope: `.indicator` margin + `.indicator:hover` / `.indicatorError:hover` in
  `Update.module.css`.
- Out of scope: the chip's layout/content, the install overlay/dialog styles, the
  first-appearance attention animation (that is **#216**, which builds on this).

**Subtasks**

1. [x] Reduce `.indicator` margin to `var(--space-4)` sides/bottom (keep a small
   inset).
2. [x] Add a hover light-up to `.indicator:hover` (accent border + faint accent
   tint), and add `border-color` to the `.indicator` transition.
3. [x] Mirror the light-up on `.indicatorError:hover` with the error color.
4. [x] Verify the collapsed-rail chip (`indicatorCollapsed`) still centers and looks
   right at the tighter margin (cross-check with #203's centering + the upcoming #214
   narrower rail if both land).
5. [x] Exercise via the dev mock (#193, `window.__claudecue.mockUpdate(...)` /
   "Simulate update") to see the available + error states; `npm run lint` +
   `npm run build`.

**Acceptance criteria**

- [x] The update indicator's outer margin is smaller than today but still has a small
      inset (not flush to the sidebar edges).
- [x] Hovering the chip produces a clear "light-up" (accent-tinted border + subtle
      fill) that eases in/out; the error variant lights up in its error color.
- [x] Collapsed-rail icon chip still centers and renders correctly.
- [x] `npm run lint` and `npm run build` pass.

**Notes**

- Decided autonomously (refine loop, user not answering — see `ASSUMPTIONS.md`).
- Token-only restyle; recommended margin `var(--space-4)` and an accent-border + faint
  `--accent-dim`/`--bg-hover` hover — exact values tunable by the implementer.
- **#216** (one-time appearance animation) touches the same `.indicator` element — it
  is sequenced **after** this task to avoid edit conflicts.
