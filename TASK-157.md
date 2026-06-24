### 157. [ ] "Big mode" — maximize any item into a full-window modal overlay

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-24

**Description**

Add a **maximize ("big mode")** affordance to every item's top bar. The card: "Items,
such as agents, files, kanban, diff, and all other items; should have a little
increase-size icon in their top bar. Clicking this on any item will open it in a modal
overlay, displaying that one item in a big screen that uses all width and height."

**Goal / why:** a small terminal/file/diff/kanban column is often too cramped to read
or work in. A one-click maximize opens that single item in a near-fullscreen overlay,
then restores it on close — no rearranging panels or popping out a window.

**Where items have a top bar today:**

- **Canvas panels:** `src/components/Canvas/CanvasSurface.tsx` — the panel `<header>`
  with the `styles.panelActions` group (Fork / Copy-resume / Close buttons, ≈ lines
  283-308). Content is produced by the inline `renderContent()` (≈ lines 175-195),
  which maps `content.kind` → `<Terminal>` / `<FileViewer>` / `<KanbanPanel>` /
  `<DiffInspector>` / `<ScheduledPanel>` / `<TemplatePendingPanel>`, with the **#84
  ownership guard** (`ownedHere(owners, sessionId)` → `<DetachedNote>` when another
  window owns the PTY).
- **Overview columns:** `src/components/Overview/Overview.tsx` — `PanelColumn`'s
  header `styles.actions` group (≈ lines 110-115; the agent actions block ≈ lines
  186-225, the non-agent panel actions ≈ lines 296-308). Overview renders content via
  its **own** inline mapping (DiffInspector / Terminal / KanbanPanel / FileViewer, ≈
  lines 318-337) — a second copy of the same kind→component logic.

**Hard constraints this must respect:**

1. **One pooled terminal renders in one DOM slot at a time (#18/#84).** A `<Terminal>`
   is a reparented node from `terminalPool`. If the modal AND the underlying panel both
   mount `<Terminal sessionId=X>`, they fight over the node. The established solution is
   the **#84 ownership model**: the non-owner renders a `DetachedNote` placeholder
   instead of the live content. Big mode must do the same **within one window** — while
   an item is maximized, its source panel/column renders a placeholder and the modal is
   the sole live render.
2. **Single auto-save instance (#148).** `FileViewer` (raw) and `KanbanPanel` use
   `useAutoSaveFile` (poll + debounced write). Two simultaneous mounts would double-poll
   and race writes. The same "one live render site" rule fixes this for file/kanban/
   scheduled too.
3. The terminal **reparents + resizes** cleanly into any slot (pool + `ResizeObserver`
   → `resize_pty`), so a big modal host is just another slot — closing reparents it
   back at the panel's width with no reload. Reuse the existing `<Terminal>` (a pool
   host), do not hand-roll one.

**Scope:** a per-window, single-item "big mode" overlay reachable from a maximize icon
on both Canvas panels and Overview columns, for every live content kind (agent,
terminal, file, kanban, diff, scheduled), rendering the live item full-size while the
source shows a placeholder, restoring on close.

**Explicitly out of scope:**

- Maximizing more than one item at once (a single global maximize slot).
- A keyboard shortcut to maximize (icon click only; possible follow-up).
- Resizable/draggable big mode (fixed near-fullscreen) and pop-out to a **native**
  window (that's #84 detach; big mode is an in-window overlay).
- `pending` template panels (no stable content to maximize) — no maximize icon there.

**Subtasks**

1. [ ] **Identity helper (pure):** add `sameItem(a: CanvasContent, b: CanvasContent):
   boolean` (agent/terminal → `sessionId`; file/kanban → `repoPath` + `file`; diff →
   `repoPath`; scheduled → `scheduleId`). Model it on the existing dedup logic in
   `canvasDrop.ts isDuplicate`. Unit-test it.
2. [ ] **Store state (transient, not persisted, per-window):** add `maximizedItem:
   CanvasContent | null` plus `maximizeItem(content)` and `closeMaximized()`. Exclude
   it from anything serializing state.
3. [ ] **Shared content renderer:** extract `CanvasSurface.renderContent` into a
   reusable `components/ItemContent/ItemContent.tsx` (`{ content, active }` → the right
   child, preserving the `ownedHere`→`DetachedNote` guard, reading `owners`/`sessions`/
   `settings` from the store as CanvasSurface does). Reuse it in **both** the Canvas
   panel body and the Overview column body (replacing the two inline copies) **and** in
   the new modal — one source of truth. (Coordinate: the in-flight #155 also edits
   `CanvasSurface`; this is not a hard dependency but rebase carefully.)
4. [ ] **Maximize affordance:** add a maximize button (Lucide `Maximize2`, `size={15}`)
   to the actions group in (a) `CanvasSurface` `panelActions` and (b) Overview
   `PanelColumn` actions for every item kind (agent **and** non-agent), `title="Open in
   big mode"`, `aria-label`. `onClick={() => maximizeItem(content)}`. In Canvas the
   `.panelActions` wrapper already `stopPropagation`s pointerdown so the click won't
   start a move-leaf drag — keep that. Do not add it to `pending` panels.
5. [ ] **BigModeModal (App-level):** new `components/BigMode/BigModeModal.tsx` mirroring
   the `Settings`/`CanvasCloseModal` pattern — `--scrim` backdrop, `role="dialog"`
   `aria-modal`, focus-trap, a header with the item title (reuse `panelTitle` /
   `sessionLabel`) + a close button, and a body rendering `<ItemContent content=
   {maximizedItem} active />`. Size it **near-fullscreen** ("all width and height"): a
   small inset (e.g. `inset: var(--space-16)` or ~96vw×94vh) so the scrim and a thin
   header remain. Mount it in `App.tsx` (and in `CanvasWindow.tsx` for detached
   windows) when `maximizedItem` is set. Close on close-button, scrim click, and Esc —
   **Esc caveat:** a focused terminal consumes keystrokes, so make the close button +
   scrim the primary closers and gate Esc-close to when the event target is not inside
   the terminal (document/capture-level handler). Respect reduced-motion.
6. [ ] **One live render site:** in `ItemContent` (or its call sites), when
   `maximizedItem` is set and `sameItem(content, maximizedItem)` **and** this is not the
   modal's own instance, render a new `MaximizedNote` placeholder (mirror
   `DetachedNote`: "Shown in big mode" + a "Close big mode" button calling
   `closeMaximized`) instead of the live content. Pass a flag (e.g. `inModal`) so the
   modal's `ItemContent` always renders live. This guarantees the pooled terminal /
   auto-save hook mounts in exactly one place.
7. [ ] **Lifecycle guards:** if the maximized item disappears while open (agent exits/
   removed, panel/overview item closed, schedule cancelled), auto-close the modal — an
   effect that calls `closeMaximized()` when `maximizedItem` no longer resolves to a
   live session/panel/schedule.
8. [ ] **Detached windows (#84):** big mode is per-window (own store + own modal). The
   modal's `ItemContent` already shows `DetachedNote` if the window doesn't own the PTY
   — acceptable; optionally hide the maximize icon when `!ownedHere`. Mount the modal in
   `CanvasWindow` too.
9. [ ] **Styling:** `BigModeModal.module.css` + `MaximizedNote.module.css`, on-system
   tokens only, dark theme, reduced-motion killswitch honored.
10. [ ] **Tests:** unit-test `sameItem`; test the store `maximizeItem`/`closeMaximized`
    set/clear (and that removing the underlying session/panel clears it if that logic is
    in the store). Modal UI verified manually.
11. [ ] **Verify:** `npm run build`, `npm run lint`, `npm test` pass. Manual: from both
    Overview and Canvas, maximize each kind (agent, terminal, file, kanban, diff,
    scheduled) → fills the screen, the source panel shows the placeholder, the terminal
    is interactive at full size and the file/kanban editable; close via button/scrim/Esc
    restores it with **no** terminal reload; removing the item while maximized closes the
    modal; repeat in a detached canvas window.

**Acceptance criteria**

- [ ] Every item top bar — Canvas panel header and Overview column header — for agent /
      terminal / file / kanban / diff / scheduled shows a maximize icon (not on
      `pending` panels).
- [ ] Clicking it opens that one item in a modal overlay that fills (nearly) all width
      and height, over a dimmed scrim.
- [ ] The modal renders the **live** item (terminal interactive; file/kanban editable;
      diff live), while the underlying panel/column shows a "shown in big mode"
      placeholder — the pooled terminal and any auto-save hook run in exactly one place.
- [ ] Closing via the close button, scrim click, or Esc restores the item to its
      panel/column with **no** terminal reload (pool reparents back).
- [ ] Works from both Overview and Canvas, in the main window and a detached canvas
      window.
- [ ] Removing/closing/exiting the underlying item while maximized auto-closes the
      modal (no orphaned overlay).
- [ ] `npm run build`, `npm run lint`, `npm test` pass; `sameItem` + store-action tests
      included.

**Notes**

- **Assumption — "all width and height"** = a near-fullscreen modal (small inset +
  thin header), reusing the app's existing modal pattern, rather than literally edge-to-
  edge (keeps the scrim/close affordance visible).
- **Assumption — one-live-render-site rule** (source panel shows a `MaximizedNote`
  placeholder while maximized) is the chosen way to satisfy the #18 pool constraint and
  the #148 single-auto-save invariant simultaneously — the same principle as #84
  ownership, with a new placeholder mirroring `DetachedNote`.
- **Refactor note:** extracting a shared `ItemContent` removes the existing
  Overview/CanvasSurface render duplication and is what lets the modal reuse the exact
  same rendering (including the #84 guard). Flagged because **#155** is concurrently
  editing `CanvasSurface` — coordinate the merge; no hard dependency.
- **Esc conflict:** a focused terminal swallows keystrokes, so Esc-to-close is gated to
  non-terminal focus; close button + scrim are the primary closers.
- **Could be split** if too large for one pass (e.g. 157a: shared `ItemContent` +
  big mode for non-terminal items; 157b: terminal big mode via pool reparent) — but it's
  one cohesive feature and the subtasks decompose it; implement as one unless blocked.
- **Task numbering:** highest existing is #156 (TASK-154/155/156.md; board #155/#156;
  `TASK_ARCHIVE.md` ≤ #153). Hence #157.
- **Dependencies:** none — builds on shipped infra: the #18 terminal pool, the #84
  ownership/`DetachedNote` model, the app modal pattern (Settings/CanvasCloseModal), and
  the existing content kinds. Independent of #155 (canvas drag) and #156 (kanban scroll).
- **References:** `CanvasSurface.tsx` (`renderContent`, `panelActions`),
  `Overview.tsx` (`PanelColumn`, actions, content mapping ≈ 318-337),
  `DetachedNote/DetachedNote.tsx`, `Settings/Settings.tsx` +
  `CanvasCloseModal/CanvasCloseModal.tsx` (modal pattern), `terminalPool.ts`,
  `ownership.ts` / `windowContext.ts` (`ownedHere`), `canvasDrop.ts` (`isDuplicate`).
