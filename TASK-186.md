# Task 186

### 186. [x] Distribute Canvas panels evenly (tab-strip button + border double-click)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

The Canvas (#46/#47) is a binary **BSP tree** (`src/components/Canvas/canvasTree.ts`):
every `split` node carries `sizes: [a, b]` (two percentage shares) and is rendered as a
react-resizable-panels `Group` (`CanvasSurface.tsx`). New panels are added by
`splitLeaf`, which always creates the split `sizes: [50, 50]`. Because the tree is
binary, three panels added to one row nest as
`split(row, leaf1, split(row, leaf2, leaf3))` and end up **50% / 25% / 25%** — visibly
uneven. The user wants a one-shot "distribute / equalize" action that rebalances an
existing layout so **every panel is the same size** (the design-tool "distribute"
operation), without changing the add-time halving behavior.

**Goal & why.** Give the user two ways to even out a canvas:

1. A **"Distribute evenly" button** in the Canvas **tab strip** (`CanvasTabs.tsx`,
   alongside the existing `+` and `▾ Templates` controls) — equalizes the **whole active
   canvas**.
2. **Double-clicking the border** (the resize `Separator`) **between two panels** —
   equalizes just the **region that border divides** (the subtree rooted at that
   `Separator`'s split), giving the user a precise "even out these panels" gesture.

**Semantics ("even" = equal area, leaf-count weighting).** To make every leaf equal
**area**, set each split's `sizes` proportional to the **number of leaves in each child
subtree**: for split `S` with `na` leaves under `a` and `nb` under `b`, use
`sizes = [na/(na+nb) * 100, nb/(na+nb) * 100]`. By induction this gives every leaf an
equal share `1/total` regardless of how rows/cols nest — and for a simple N-panel row it
collapses to exactly equal widths (a 3-panel row → true thirds). This is what the user
confirmed (see Notes): "things on the same row or column are just as big as each other."
(The naive alternative — resetting each split to `[50, 50]` — leaves a 3-panel row at
50/25/25 and was explicitly rejected.)

**The implementation wrinkle (read this before coding).** A `Group`'s `defaultLayout`
prop is **initial-only** ("remembered between page reloads") — changing it after mount
does **not** re-apply to a live Group. Today nothing does a *pure size change* on a
mounted Group: drag-resize updates the lib's own state (we only mirror it to the store in
`onLayoutChanged` for persistence), and `moveLeaf`/`removeLeaf` change *structure* (new
split ids → the Group remounts → `defaultLayout` applies). Equalize is the **first**
programmatic size-only change, so committing the new tree to the store is **not enough to
update the view**. `Group` exposes an **imperative handle** via the `groupRef` prop
(`GroupImperativeHandle` with `getLayout()` / `setLayout(layout)`); push the new sizes
through that — **never** by bumping a React `key` (a remount would tear down the panel
subtree and churn the #18 pooled terminals). The reconcile must be **remount-free** so a
busy agent terminal keeps its scrollback.

**Border double-click feasibility (verified against the installed
`react-resizable-panels`).** `Separator`'s props are
`Omit<HTMLAttributes<HTMLDivElement>, "role" | "tabIndex">` plus extras, so it forwards a
standard **`onDoubleClick`** through `...rest`. It also has a **`disableDoubleClick`**
prop because it ships a built-in double-click handler — but that built-in only resets a
panel to its `panelConstraints.defaultSize`, and our `<Panel>`s set **only `minSize="10%"`
(no `defaultSize`)**, so the built-in is currently **inert**. Set `disableDoubleClick` on
our Separators (to fully own the gesture and avoid any future conflict) and attach our own
`onDoubleClick`. The handler runs inside `renderNode(node)` where the split's `node.id` is
in scope, so it knows exactly which split to equalize.

**Scope.** Active canvas only. The button equalizes the whole active layout; the border
double-click equalizes the subtree of the double-clicked split (a distinct, useful "even
this region" action — not a duplicate of the button). Both go through the same store
action + the same imperative reconcile, persist via the existing `setActiveCanvasLayout`
(which already broadcasts `canvas://changed` so a detached window #84 picks it up), and
work in detached canvas windows via the border gesture (detached windows have no tab
strip, so the button is main-window-only — acceptable).

**Out of scope.**
- Changing the add-time `[50, 50]` halving in `splitLeaf` (the user said that part "is
  fine").
- Animating the resize (apply instantly).
- Any per-tab right-click context menu (none exists; not building one here).
- The separate Refine card "double click drag bar renames" — that double-clicks the
  **agent header bar** (`styles.panelHeader`) to rename; **this** task double-clicks the
  **Separator** between panels. Different DOM targets, no conflict (call it out so an
  implementer doesn't conflate them).

**Concrete files/symbols.**
- `src/components/Canvas/canvasTree.ts` — add pure ops (`leafCount`, `equalize`,
  `equalizeSplit`, `collectSplits`). Mirror the existing identity-preserving style
  (unchanged subtrees keep object identity).
- `src/components/Canvas/canvasTree.test.ts` — add unit tests.
- `src/components/Canvas/CanvasSurface.tsx` — `renderNode` builds each `Group`; add a
  `groupRef` registry, a guarded reconcile effect, and the Separator `onDoubleClick` +
  `disableDoubleClick`. Existing `setActiveCanvasLayout` / `activeLayout()` helpers are
  already here.
- `src/components/Canvas/CanvasTabs.tsx` — add the button next to `+`/`▾ Templates`
  (reuse the `styles.tabAdd` class).
- `src/store.ts` — add an `equalizeCanvas(splitId?)` action (near
  `setActiveCanvasLayout`, line ~1975).
- `src/components/Canvas/Canvas.module.css` — minor (button reuses `.tabAdd`; optionally a
  hover cue on `.handle` to hint double-click).

**Subtasks**

1. [x] **Pure ops in `canvasTree.ts`:**
   - [x] `leafCount(node: CanvasNode): number` — leaves in the subtree.
   - [x] `equalize(node: CanvasNode): CanvasNode` — every split's `sizes` =
         `[leafCount(a)/(leafCount(a)+leafCount(b))*100, …]`; recurses children first;
         identity-preserving when children **and** sizes already match (so already-even
         regions don't re-render and the op is idempotent).
   - [x] `equalizeSplit(tree, splitId)` — replaces only the named split's subtree with
         `equalize(subtree)`, identity-preserving elsewhere; unchanged when not found / a
         leaf id.
   - [x] `collectSplits(tree)` → `{ id, aId, bId, sizes }[]` for every split (drives the
         reconcile effect's `setLayout`).
2. [x] **Unit tests in `canvasTree.test.ts`** (7 new `it`s, all green): `leafCount`;
   single-leaf `equalize` no-op (same ref); 3-panel row → outer `[100/3, 200/3]` /
   inner `[50,50]` with each leaf area ≈ 33.33 via `leafRects`; mixed 5-leaf row/col →
   each leaf area ≈ 20; idempotent (re-equalize returns same ref); `equalizeSplit` scoping
   (sibling identity kept, outer sizes untouched, unknown/leaf id → same ref);
   `collectSplits` listing.
3. [x] **Store action `equalizeCanvas(splitId?: string)`** (`store.ts`, beside
   `setActiveCanvasLayout`): reads the active layout, computes `equalize` (no id) or
   `equalizeSplit`, no-ops when there's no layout or it's already even (same ref), else
   commits via `setActiveCanvasLayout` (persist + broadcast). Added to the store type +
   imports.
4. [x] **CanvasSurface — imperative reconcile (remount-free):**
   - [x] `groupHandles = useRef<Map<string, GroupImperativeHandle>>(new Map())`; each
         `Group` gets `groupRef={(handle) => handle ? set(node.id, handle) :
         delete(node.id)}`. (`GroupImperativeHandle` imported from
         `react-resizable-panels`; verified the `groupRef` prop + handle's
         `getLayout`/`setLayout` against the installed `dist/*.d.ts`.)
   - [x] `useEffect(..., [rawLayout])` walks `collectSplits(rawLayout)`, and for each split
         with a registered handle whose live sizes differ from target by ≥0.5% calls
         `handle.setLayout({ [aId], [bId] })`. The tolerance guard makes it a no-op on
         user drag-resize and structural remounts (no feedback with `onLayoutChanged`),
         doing real work only right after an equalize.
   - [x] Separator: `disableDoubleClick` + `onDoubleClick={() => equalizeCanvas(node.id)}`
         + a discoverability `title`; keeps `className={styles.handle}`.
5. [x] **CanvasTabs — "Distribute evenly" button:** next to `+`/`▾ Templates`, reuses
   `styles.tabAdd`, Lucide `Grid2x2`, `title`/`aria-label` "Distribute panels evenly",
   `onClick={() => equalizeCanvas()}`, **disabled** when the active canvas's layout is
   null or a leaf (`<2` panels), derived from `canvases`/`activeCanvasId`.
6. [x] **Styling** (`Canvas.module.css`): added `.tabAdd:disabled` (greyed, `opacity .4`,
   default cursor) + scoped the hover to `:not(:disabled)`. (Left `.handle`'s cursor
   alone — the `title` tooltip covers discoverability without overriding the resize
   cursor.)
7. [x] **Verify** — `npm run build`, `npm run lint`, `npm test` (251) all green; **no Rust
   changes**. The interactive checks (a)–(f) are **runtime-unverified** in this autonomous
   loop (no GUI session); the logic is covered by unit tests + the verified imperative-API
   types. See Notes.

**Acceptance criteria**

- [x] `equalize`, `equalizeSplit`, `leafCount`, `collectSplits` exist in `canvasTree.ts`
      with passing unit tests covering: 3-panel row → equal thirds, mixed nested → equal
      area, idempotent on an already-even tree, and `equalizeSplit` scoping.
- [x] A **"Distribute evenly"** button is present in the Canvas tab strip; clicking it
      calls `equalizeCanvas()` → equal-area sizes pushed into the live Groups via the
      imperative handle (no `key` bump → **no terminal remount**, pool intact). Disabled
      when the active canvas has fewer than 2 panels. _(Behaviour runtime-unverified — see
      Notes; logic unit-tested.)_
- [x] **Double-clicking the border between two panels** calls `equalizeCanvas(node.id)`
      (equalizes that split's region); the library's built-in Separator double-click is
      suppressed via `disableDoubleClick`.
- [x] The equalized sizes **persist across reload** (written through
      `setActiveCanvasLayout` → `ipc.setCanvases`) and **sync to a detached canvas window**
      (#84) (same broadcast path as resize; the other window's reconcile effect re-applies
      them). _(Cross-window sync runtime-unverified — inherits the existing resize path.)_
- [x] No change to add-time `[50,50]` halving (`splitLeaf` untouched); the agent
      **header-bar** drag/rename target (`styles.panelHeader`) is untouched.
- [x] `npm run build`, `npm run lint`, `npm test` pass; no Rust changes.

**Notes**

- **User answers (refine, 2026-06-26):**
  - *Trigger:* "Tab-strip button, but also done automatically by double clicking the
    borders between cards. See if this is possible and has good UX." → Both affordances;
    feasibility of the border double-click was investigated and **confirmed** (see below).
  - *Semantics:* chose **"Equal size for every panel"** (leaf-count weighting) over the
    "reset every split to 50/50" alternative (which leaves a 3-panel row at 50/25/25).
- **Decision made by the refine agent (the user delegated UX judgment with "see if this
  … has good UX"):** the **button** equalizes the **whole canvas**; the **border
  double-click** equalizes only the **subtree of that split** (the region the border
  divides). This gives two distinct, learnable tools rather than two triggers for the
  identical action. If the user later prefers border-double-click to equalize the *whole*
  canvas, it's a one-line change (call `equalizeCanvas()` instead of
  `equalizeCanvas(node.id)`).
- **Feasibility findings (verified against the installed `react-resizable-panels`
  `dist/*.d.ts` + `.js`):**
  - `Separator` forwards `onDoubleClick` (its props extend `HTMLAttributes<HTMLDivElement>`)
    and has a `disableDoubleClick` prop; its built-in double-click only resets a panel to
    `panelConstraints.defaultSize`, which our Panels don't set (`minSize="10%"` only) → the
    built-in is inert today. We set `disableDoubleClick` and use our own handler.
  - `Group.defaultLayout` is initial-only; programmatic size changes must go through the
    `groupRef` imperative handle (`GroupImperativeHandle.setLayout`). The reconcile effect
    is the mechanism. **Do not** remount Groups (would churn the #18 terminal pool).
- **Edge case — the 10% min-size floor:** each `<Panel minSize="10%">` clamps to 10% of
  its Group. Equal *area* across many panels can require a side below 10% (e.g. a 1-vs-10
  leaf split → ~9.09%), which the library clamps to 10% — so perfect equal area isn't
  achievable past ~10 panels in one nesting chain. Acceptable; for typical canvases (2–6
  panels) it's exact. No special handling required.
- **Not to be confused with** the separate Refine card *"double click drag bar renames"*
  (double-clicking the agent **header bar** to rename). That targets `styles.panelHeader`;
  this task targets the `Separator`. Independent and non-conflicting.
- **References:** `canvasTree.ts` (`splitLeaf` sizes `[50,50]`, `appendLeaf` `[70,30]`,
  `leafRects` for area math, `updateSizes` for the identity-preserving pattern);
  `CanvasSurface.tsx` `renderNode`/`commitResize`/`activeLayout`; `CanvasTabs.tsx`
  (`+`/Templates controls); CLAUDE.md "Canvas (#46/#47/#58)" + the #84 cross-window sync
  note.

**Implementation notes (2026-06-26 — done)**

- Implemented exactly as planned. Files changed: `canvasTree.ts` (+`leafCount`,
  `equalize`, `equalizeSplit`, `collectSplits`), `canvasTree.test.ts` (+7 tests),
  `store.ts` (+`equalizeCanvas` action/type/import), `CanvasSurface.tsx` (groupRef
  registry + reconcile effect + Separator double-click), `CanvasTabs.tsx` (button),
  `Canvas.module.css` (`.tabAdd:disabled`). **No backend/Rust changes.**
- **Imperative-API verification:** confirmed against
  `node_modules/react-resizable-panels/dist/react-resizable-panels.d.ts` that `Group`
  takes a `groupRef?: Ref<GroupImperativeHandle | null>` and the handle exposes
  `getLayout()` / `setLayout({ [panelId]: number })`, and that `Separator` forwards
  `onDoubleClick` (props extend `HTMLAttributes`) and accepts `disableDoubleClick`. So a
  callback `groupRef` and our own double-click handler are both valid; the build
  type-checks them.
- **No feedback loop:** `equalizeCanvas` persists the equalized tree first (via
  `setActiveCanvasLayout`), then the `[rawLayout]` effect makes the live Group match. The
  ≥0.5% tolerance guard means: (a) a user drag-resize writes the dragged sizes to the
  store, the effect sees the Group already at those sizes → no-op; (b) after an equalize,
  `setLayout` may fire `onLayoutChanged` → `commitResize` writes the applied (clamped)
  sizes back → the effect re-runs and finds a match → converges in one extra pass. No
  remount (no `key` bump), so the #18 pooled terminals reparent and keep scrollback.
- **Two distinct tools (refine-agent UX decision, kept):** the tab-strip button
  equalizes the **whole** active canvas; the **border double-click** equalizes only that
  split's **subtree**. Changing the border to equalize the whole canvas is a one-liner
  (`equalizeCanvas()` instead of `equalizeCanvas(node.id)`).
- **Runtime-unverified (autonomous loop, no GUI session):** subtask-7 checks (a)–(f) —
  button → equal thirds; mixed → equal area; border double-click scoping; persist across
  reload; cross-window (#84) sync; busy-terminal scrollback survives. The pure layout math
  is unit-tested and the imperative wiring uses the verified API + the existing
  persist/broadcast path (identical to drag-resize), but the DOM gestures and live Group
  `setLayout` behaviour were not exercised in a running app. Mirrors the #84 precedent of
  recording runtime-unverified UI behaviour. Recommend a quick manual pass when next
  running `npm run tauri dev`.
- **Edge case (unchanged from plan):** `<Panel minSize="10%">` clamps each side to ≥10%,
  so perfect equal area isn't reachable past ~10 panels in one nesting chain; fine for
  typical 2–6-panel canvases. No special handling.
