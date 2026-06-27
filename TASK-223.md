### 223. [ ] Add a "distribute panels evenly" button to the Template Editor

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-28

**Description**

The live Canvas has a **"Distribute panels evenly"** button (#186) that rebalances its
split layout so every panel has equal area. The **Template Editor** (the BSP surface for
authoring Canvas templates, #117) has no such button. Add the same affordance to the
Template Editor so a template's blocks can be evenly distributed too.

**Grounding:**

- The equalize logic is a **pure op already shipped** (#186):
  `equalize(node: CanvasNode): CanvasNode` in
  `src/components/Canvas/canvasTree.ts:253` (rebalances so every leaf has equal area;
  weights each split by its subtree leaf count). The live canvas calls it via the store
  `equalizeCanvas` action (`src/store.ts:2430`), and the button lives on the Canvas tab
  strip (`src/components/Canvas/CanvasTabs.tsx:378-389`, `Grid2x2` icon, label
  "Distribute panels evenly", gated by `canEqualize` = ≥2 panels).
- The **Template Editor** is `src/components/TemplateEditor/TemplateEditor.tsx`:
  - It holds the working tree in **local state**: `const [layout, setLayout] =
    useState<CanvasNode | null>(...)` (line 239), seeded deep-cloned from `existing?.layout
    ?? seed`.
  - It already imports and uses `canvasTree` ops (`splitLeaf`, `removeLeaf`,
    `updateSizes`, `updateLeafContent`) and mutates via `setLayout(...)`
    (`TemplateEditor.tsx:262-298`).
  - It has a **toolbar** `<header className={styles.toolbar}>` (line 335) with a name
    input and a **"Save template"** button (line 351-352) — the natural home for the new
    button.
  - Splits render with **react-resizable-panels** `Group key={node.id}` +
    `defaultLayout={{ [a.id]: sizes[0], [b.id]: sizes[1] }}` (`TemplateEditor.tsx:302-323`).
    `defaultLayout` is **initial-only**, and the group key is the stable `node.id`.
- **The template blocks are inert placeholders** — there is **no live PTY / terminal pool**
  in the Template Editor (unlike the live canvas). This matters for how equalize takes
  visual effect (below).

**Why a plain `setLayout(equalize(layout))` isn't enough on its own:** because
`defaultLayout` is initial-only and each `Group`'s key is its (unchanged) `node.id`,
mutating only `node.sizes` won't move the borders — react-resizable-panels won't re-read
the new sizes. The live canvas (#186) works around this with an **imperative** Group-ref
`setLayout` specifically to avoid remounting the terminal pool. **The Template Editor has
no terminals**, so the simplest correct approach is to **remount the BSP surface** after
equalize (a one-shot key bump) so every `Group` re-reads its `defaultLayout` from the
now-equalized `node.sizes`. A remount of inert blocks is harmless.

**Decided approach (autonomous — see Notes/ASSUMPTIONS.md):**

1. **Add a toolbar button** to the Template Editor (next to "Save template"), reusing the
   live canvas's icon + label for consistency: `Grid2x2` (already imported in
   `CanvasTabs`), title/aria-label **"Distribute panels evenly"**.
2. **On click:** `setLayout((l) => (l ? equalize(l) : l))` (import `equalize` from
   `../Canvas/canvasTree`) **and bump a remount nonce** so the BSP surface re-reads the
   equalized sizes. Implement the nonce by keying the surface wrapper that renders
   `renderNode(layout)` (`TemplateEditor.tsx:379`, the `{layout ? renderNode(layout) :
   <CenterDrop/>}` region) on an incrementing counter, incremented only by the equalize
   action (not by drag-resize, so interactive resizing is unaffected).
3. **Gate the button** (disabled) when the layout has **< 2 leaves** (nothing to
   distribute), mirroring `canEqualize` in `CanvasTabs`. Reuse the leaf-count helper in
   `canvasTree.ts` (the `leafCount`/`countLeaves` used by `equalize`, line ~236) — export
   it if needed — or count leaves inline.
4. **Persist correctly:** equalize mutates the local `layout` state, so the equalized
   sizes are saved on "Save template" exactly like any other edit (`onSave` →
   `saveTemplate(name, layout, editingId)`, line 327-328). No store/blob change.

**Out of scope:**

- The live Canvas distribute button (#186) — unchanged.
- A border/separator double-click equalize gesture inside the editor (the live canvas has
  a region double-click per #186; the card only asks for a **button**, so keep it to the
  button — a double-click gesture can be a later task if wanted).
- Changing `equalize`'s semantics (equal-area weighting stays as #186 defined).

**Cross-platform (hard requirement):** pure frontend; no OS-specific code; renders
identically on macOS and Windows. No keyboard handler added (button only).

**Subtasks**

1. [ ] Import `equalize` (and a leaf-count helper, exporting it from `canvasTree.ts` if
   not already) into `TemplateEditor.tsx`.
2. [ ] Add a `Grid2x2` "Distribute panels evenly" button to the toolbar (`styles.toolbar`,
   near "Save template"), disabled when the layout has < 2 leaves.
3. [ ] Wire its onClick to `setLayout((l) => equalize(l))` + a remount-nonce bump; key the
   `renderNode(layout)` surface region on the nonce so the panels re-read the equalized
   sizes. Ensure normal drag-resize does **not** bump the nonce.
4. [ ] Confirm: distributing evens all panels in the editor; saving persists the new
   sizes; build/lint/format pass (`npm run build`, `npm run lint`, `npm run format:check`).

**Acceptance criteria**

- [ ] The Template Editor toolbar has a "Distribute panels evenly" button (same icon/label
      as the live Canvas), **disabled** when there are fewer than 2 panels.
- [ ] Clicking it rebalances the template's panels to **equal area** (same behavior as the
      live Canvas distribute, via the shared `equalize` op), and the borders visibly move
      to the equalized positions.
- [ ] Drag-resizing borders still works and is **not** disrupted by the new button
      (no surface remount on a normal resize).
- [ ] Saving the template persists the equalized sizes (re-opening the template shows the
      even layout).
- [ ] `npm run build`, `npm run lint`, `npm run format:check` pass.

**Notes**

- **Autonomous decisions (user not answering; logged in `ASSUMPTIONS.md`):**
  - *Reuse the shipped pure `equalize` op* (#186) — same equal-area semantics and the
    same `Grid2x2` / "Distribute panels evenly" icon+label for consistency.
  - *Visual update via a one-shot surface remount nonce* (not the live canvas's imperative
    Group-ref `setLayout`), because the Template Editor's blocks are **inert** (no terminal
    pool to preserve) — so a remount is the simplest reliable way to re-read the
    initial-only `defaultLayout`.
  - *Button only, no double-click gesture* — the card asks for "the same button"; the
    border-double-click half of #186 is out of scope.
- **Depends on: none** — builds on shipped #186 (`equalize`) and #117 (Template Editor);
  no open task is a prerequisite.
- References: `canvasTree.ts:236` (leaf count), `canvasTree.ts:253` (`equalize`),
  `store.ts:2430` (`equalizeCanvas`, the live-canvas equivalent), `CanvasTabs.tsx:378-389`
  (the live button + `canEqualize` gate), `TemplateEditor.tsx:239` (`layout` state),
  `:288-325` (`renderNode` + `Group`/`defaultLayout`), `:335-354` (toolbar + Save),
  `:379` (surface render region to key on the nonce).
