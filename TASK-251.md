# TASK-251

### 251. [ ] Repo branch line: show the active-filter selection the same way a worktree branch does

**Status:** Not started · _(Not started | In progress | Done)_
**Depends on:** none
**Created:** 2026-06-28

**Description**

In the left sidebar, clicking a **branch** filters the Overview to that branch's
changes (then switches to the Overview view). There are two such clickable branch
affordances:

1. A **worktree** branch — the `WorktreeHeader` name (`Sidebar.tsx:1000-1015`),
   which calls `setOverviewRepoFilter(path, "all")`.
2. The repo's **own (primary) branch line** — the `RepoBranchLine` component
   (`Sidebar.tsx:1233-1255`), which calls `setOverviewRepoFilter(repo, "own")`
   (the #247 "own" mode, hiding worktrees).

When a **worktree** branch is the active filter, its row shows a clear,
prominent **selection box**:

```css
.worktreeActive { background: var(--accent-dim); }          /* Sidebar.module.css:890 */
.worktreeActive .worktreeName { color: var(--accent); }     /* Sidebar.module.css:894 */
```

— i.e. an accent-dim filled box (the `.worktreeHeader` has
`border-radius: var(--radius-chip)`) **plus** accent-colored branch text.

But when the repo's **own branch line** is the active filter, it only changes the
text color — **no selection box**:

```css
.repoBranchActive { color: var(--accent); }                 /* Sidebar.module.css:342-344 */
```

(`.repoBranchLine` has no `border-radius` either.) The comment there
(`Sidebar.module.css:340-341`) notes it was meant to lean on "the header itself
carries the selection box" — but the branch line filters the **"own"** mode, which
sets `branchActive` (not `folderActive`), so the repo **header does not light**
(`Sidebar.tsx:1541-1544`, `1624-1630`). The result: selecting the repo's own
branch reads as a faint text tint, while selecting a worktree branch gets a full
accent-dim box. They don't look or feel the same — which is the reported bug.

**Goal:** make the repo's own branch line's **active-filter selection** look and
feel the same as a worktree branch's — an accent-dim selection box with rounded
corners plus the accent branch text. This is a CSS-only change in
`src/components/Sidebar/Sidebar.module.css`.

**Scope**

- Update `.repoBranchActive` (and `.repoBranchLine` for the corner radius) so the
  active repo branch line shows the same accent-dim selection box as
  `.worktreeActive`.

**Out of scope**

- The **worktree** branch selection (`.worktreeActive` / `.worktreeName`) — it is
  the reference "good" behavior; leave it unchanged.
- The repo **header**'s own active state (`.repoActive`, the "all" filter) — its
  selection box (#68) is unchanged; this task only fixes the **branch line**'s
  ("own" filter) selection.
- The structural / identity differences that are **intentional** and must stay:
  the worktree "worktree" badge (`.worktreeBadge`, the #240 cue that distinguishes
  a worktree branch from the repo's own branch line — the repo branch line must
  **not** gain a badge), the branch line's deliberate row height (22px) and icon
  column alignment with agent rows (#236), and its font size
  (`--fs-meta-xs` on `.repoBranchText`). Only the **selection treatment**
  (background box + corner radius + accent text) is being unified, not row
  height / font size / badges.
- No TSX/logic change — the `isFiltered` wiring already exists
  (`Sidebar.tsx:1235`, `RepoBranchLine`'s `isFiltered={branchActive}`).

**Subtasks**

1. [ ] In `src/components/Sidebar/Sidebar.module.css`, add
   `border-radius: var(--radius-chip);` to **`.repoBranchLine`**
   (`Sidebar.module.css:320-334`) so the active fill has rounded corners matching
   `.worktreeHeader` (the radius is invisible while the background is transparent,
   exactly as on `.worktreeHeader`).
2. [ ] Add `background: var(--accent-dim);` to **`.repoBranchActive`**
   (`Sidebar.module.css:342-344`), keeping the existing `color: var(--accent);`.
   This mirrors `.worktreeActive { background: var(--accent-dim); }` +
   `.worktreeActive .worktreeName { color: var(--accent); }`.
3. [ ] Update the now-stale comment above `.repoBranchActive`
   (`Sidebar.module.css:340-341`) — it currently says the active state only tints
   the text because "the header itself carries the selection box"; reword it to
   note the branch line now carries its own accent-dim selection box, mirroring
   `.worktreeActive` (since the "own" filter does not light the header).
4. [ ] Verify visually: with the repo's own branch line as the active Overview
   filter, its row shows the same accent-dim rounded selection box + accent text
   as an active worktree branch; an inactive branch line still renders muted with
   only the hover text-color change.

**Acceptance criteria**

- [ ] When the repo's own branch line is the active Overview filter, it shows an
  accent-dim selection box with rounded corners **and** accent-colored branch text
  — visually matching an active worktree branch (`.worktreeActive`).
- [ ] An **inactive** repo branch line is unchanged (muted text, transparent
  background, hover lightens the text only).
- [ ] The worktree branch selection, the repo header's "all"-filter selection
  (`.repoActive`), the "worktree" badge, and the branch line's row height / icon
  alignment / font size are all unchanged.
- [ ] `npm run build` (type-check) and `npm run lint` pass.
- [ ] **Works on both macOS and Windows** — pure CSS using existing design tokens
  (`--accent-dim`, `--accent`, `--radius-chip`) with no `-webkit-`-only properties,
  vibrancy, or newly-introduced `color-mix`, so WKWebView (macOS) and
  WebView2/Chromium (Windows) render it identically; no `#[cfg]` gating or
  `platform` signal is involved.

**Notes**

- **Interpretation (no user question needed):** the card says the branch "does not
  show the selection like it does for other worktree branches. The UI needs to
  look and feel the same." Grounding in the CSS pinned the exact gap: worktree
  branches get `.worktreeActive`'s accent-dim box; the repo's own branch line's
  `.repoBranchActive` only tints the text. The fix is to give the branch line the
  same accent-dim selection box. The fuzzy phrase "look and feel the same" is
  scoped to the **selection** treatment (the specific complaint), not to row
  height / font size / the deliberately-different "worktree" badge — those are
  intentional per #236/#240 and are explicitly kept (see Out of scope).
- **Relationship to #250:** #250 also touches the repo branch line, but in
  `Sidebar.tsx` (gating *whether* it renders when the folder has no own items) —
  this task is CSS-only in `Sidebar.module.css` (styling its *active* state). No
  file overlap and no logical dependency; the active-state styling applies
  whenever the branch line is shown and active, regardless of #250. `Depends on:
  none`.
- Token reference: `--accent-dim`, `--accent`, `--radius-chip` are the same tokens
  `.worktreeActive` / `.worktreeHeader` use, so the match is exact.
- No automated test covers CSS appearance; verify by running the app, clicking the
  repo's branch line, and comparing its selected look to a selected worktree
  branch.
