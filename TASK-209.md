### 209. [x] Fix the missing space between "Current version" and the version number in Settings → Updates

**Status:** Done
**Depends on:** none
**Created:** 2026-06-27

**Description**

In **Settings → Updates**, the line above the "Check for updates" button renders as
**"Current version0.0.1"** — the label and the version number are stuck together with no
space.

**Root cause** (found in the repo):

- `src/components/Settings/Settings.tsx` (~lines 367–372) renders:
  ```jsx
  <div className={styles.field}>
    <span className={styles.fieldLabel}>
      Current version
      <span className={styles.fieldValue}>{appVer || "—"}</span>
    </span>
  </div>
  ```
- `.fieldLabel` (`Settings.module.css` ~106) is `display: flex; align-items: baseline;
  justify-content: space-between;` — intended to push the label left and the value right.
- **But** the wrapping `.updates` container (~259) is `display: flex; flex-direction:
  column; align-items: flex-start;`. With `align-items: flex-start`, the `.field` (and thus
  `.fieldLabel`) **shrink-wraps to its content instead of stretching to full width**. With no
  extra width, `justify-content: space-between` has nothing to distribute, so the two
  children — the text node `"Current version"` and the `.fieldValue` span — sit **directly
  adjacent**: `Current version0.0.1`. (The same class is used by the "Update available" field
  at ~415, which has the identical latent issue — `Update availablev1.2.3`.)

**Goal:** put a visible space between the label and the value. The cleanest, root-cause fix
is to add a small **`gap`** to `.fieldLabel`, which separates the two flex children whether
the row is shrink-wrapped (the actual case here → a fixed gap) or stretched (space-between
still spreads them, gap as the minimum). This fixes both "Current version" and "Update
available" with one line and no markup change.

**Scope**

1. In `src/components/Settings/Settings.module.css`, add `gap: var(--space-8);` (or
   `var(--space-6)`) to the `.fieldLabel` rule.

**Out of scope**

- No JSX/markup restructure (no `{" "}` hack, no colon) — the CSS `gap` is the correct fix
  and covers every `.fieldLabel` usage.
- No change to `.field`, `.fieldValue`, `.updates`, or any other Settings layout.
- No change to what version string is shown (`appVer`).

**Subtasks**

1. [x] Add `gap` to `.fieldLabel` in `Settings.module.css`.
2. [x] `npm run build` + `npm run lint` + Prettier pass.
3. [x] Verify in Settings → Updates that it now reads "Current version  0.0.1" with a clear
   space (and the "Update available" field, reachable via the #193 dev mock, is likewise
   spaced).

**Acceptance criteria**

- [x] The Settings → Updates "Current version" line shows a visible space between the label
  and the version number.
- [x] The "Update available" field (same `.fieldLabel`) is also correctly spaced.
- [x] No markup change was needed; `npm run build`, `npm run lint`, and Prettier pass.

**Notes**

- **Autonomous refine (2026-06-27).** Per the `ASSUMPTIONS.md` standing directive
  (2026-06-26); decisions logged under TASK-209:
  - Fixed via a **`gap` on `.fieldLabel`** (root cause: shrink-wrap under `.updates`
    `align-items: flex-start` collapsing `space-between`), over a per-instance `{" "}` JSX
    space — the CSS fix is general and also corrects the "Update available" field.
- Key files: `src/components/Settings/Settings.tsx` (~367–372, the field), `src/components/
  Settings/Settings.module.css` (`.fieldLabel` ~106, `.updates` ~259).
- Independent of any open task.

**Implementation (done 2026-06-27)**

- `Settings.module.css` `.fieldLabel`: added `gap: var(--space-8)` (with an explanatory
  comment). This separates the label text node from the `.fieldValue` span even when
  `.updates` (`align-items: flex-start`) shrink-wraps the row and collapses
  `justify-content: space-between` — fixing both "Current version 0.0.1" and the
  "Update available" field with one line, no markup change.
- Verified: `prettier --check`, `npm run build`, and `npm run lint` all pass (CSS-only, no
  test impact).
