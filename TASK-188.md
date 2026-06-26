# Task 188

### 188. [ ] Double-click a panel / card header to rename the agent inline

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-26

**Description**

An agent's **header bar** is the primary **drag handle**: in the Canvas the whole
`<header>` of a panel carries the dnd-kit move listeners (#144,
`CanvasSurface.tsx` `LeafPanel`), and in the Overview the whole card `<header>` is the
sortable drag handle (#70, `Overview.tsx` `PanelColumn`). Today renaming an agent is only
reachable from the **sidebar row context menu** (#57, "Rename") — there's no way to rename
straight from the panel/card you're looking at. The user wants a **double-click on the
header bar** to start an **inline rename** of the agent, typing a custom name in place.

**Goal & why.** Add a **double-click-to-rename** affordance to the agent header bar on both
surfaces that already use the header as a drag handle:

- **Canvas** — double-clicking an **agent** panel's header opens an inline `<input>` in
  place of the title; Enter/blur commits, Escape cancels.
- **Overview** — same on an **agent** card's header/title.

The rename writes through the existing `renameSession(id, name)` store action (#57), which
every name surface (sidebar / Overview / Canvas) reads optimistically from `session.name`,
so the new name appears everywhere immediately. This makes naming an agent a direct,
in-place gesture instead of a hunt through the sidebar menu.

**Behavior (mirrors the proven patterns already in the repo).** The codebase already does
double-click-to-rename on a *draggable* element — `CanvasTabs.tsx`'s tab label
(`onDoubleClick={() => setEditing(true)}` on a dnd-kit sortable) — and has a complete
inline-rename state machine in `Sidebar.tsx` (`editing` / `draft` / `committed` refs,
`beginRename` / `finishRename` / `cancelRename`, Enter & blur commit, Escape cancels, a
`committed` guard so Enter-then-blur doesn't double-commit). Reuse that exact pattern:

- The input is **seeded with the current custom name** (`session.name ?? ""`) and shows the
  **derived label** (branch / auto-title) as its **placeholder** — identical to the sidebar
  rename input.
- **Committing an empty string clears the custom name** (`renameSession` trims → `null`),
  reverting to the auto-title (#97) / branch label. Intended, matches the sidebar.
- The double-click handler calls `event.preventDefault()` so it doesn't select the title
  text, and only fires for **agent** panels (`content.kind === "agent"` with a resolved
  `session`).
- The `<input>` **stops `pointerdown` propagation** so the header's drag listeners don't
  grab it (mirroring how the header's `.actions` / `.panelActions` group and the
  `FileSwitcher` already stop pointerdown to stay interactive).

**Drag vs. double-click — why they coexist.** Both surfaces' `PointerSensor` use a 4px
activation distance, so a stationary double-click never starts a drag, and a drag (pointer
movement) never enters rename. This is the same coexistence `CanvasTabs` already relies on.

**Scope — agents only.** Only **agent** headers get the rename. Non-agent panels
(file / diff / terminal / kanban / filetree) keep a **derived** title (filename, "Diff",
etc.) with no custom-name concept, so double-clicking their header does nothing special.
Scheduled panels have their own name editor (`ScheduledPanel`, #94) and are excluded here.

**Surfaces — Canvas + Overview headers only.** Applied to the two header **bars** the user
means by "drag bar". The **sidebar** already has inline rename via its row context menu
(#57) and its rows are list items, not header bars — left unchanged.

**Out of scope.**
- Renaming non-agent panels / files / diffs / terminals / kanban / scheduled.
- Adding double-click rename to sidebar rows (already have menu rename #57).
- Any change to `renameSession` / persistence (`ipc.renameSession`, the `name` field).
- The separate "distribute evenly" border double-click (#186) — that targets the
  **`Separator`** between panels, a different DOM element; **no conflict** (call it out so
  an implementer doesn't conflate the two double-click gestures).

**Concrete files/symbols.**
- `src/components/Canvas/CanvasSurface.tsx` — `LeafPanel`: the agent title currently renders
  as `<span className={styles.panelTitle} title={titleText}>{titleText}</span>` (the file
  branch uses `FileSwitcher`). Add `editing`/`draft` state + the input; wire `onDoubleClick`
  on the title (agent branch only). The header (`<header className={styles.panelHeader}>`)
  holds the drag listeners.
- `src/components/Overview/Overview.tsx` — `SessionCard` builds `title = <span
  className={styles.name}>{primary}</span>` and passes it into `PanelColumn` (whose
  `<header>` is the drag handle). Manage `editing`/`draft` in `SessionCard` and render the
  input as the `title` node when editing, with `onDoubleClick` on the name span to enter
  edit. (No `PanelColumn` signature change needed — the input lives inside the `title`
  ReactNode and stops its own pointerdown.)
- `src/store.ts` — reuse `renameSession` (line ~2889); no change.
- `src/components/Sidebar/Sidebar.tsx` — reference pattern only (lines ~288–373).
- `src/components/Canvas/CanvasTabs.tsx` — reference pattern (double-click on a draggable).
- CSS: add a rename-input class to `Canvas.module.css` and `Overview.module.css` (mirror the
  sidebar's `renameInput` / the tab strip's `tabInput`).

**Subtasks**

1. [ ] **Canvas `LeafPanel`:** add `editing` / `draft` state and a `committed` ref (copy the
   sidebar's `beginRename`/`finishRename`/`cancelRename`). When `content.kind === "agent"`
   and `session`: render the title span with `onDoubleClick={(e) => { e.preventDefault();
   beginRename(); }}`; when `editing`, render an `<input>` instead (autofocus, `value=draft`,
   `placeholder={agentLabel.primary}`, Enter→finish / Escape→cancel / blur→finish, commit via
   `renameSession(session.id, draft)`), with `onPointerDown` stopping propagation so the
   header drag doesn't start. Leave the file/diff/etc. title rendering untouched.
2. [ ] **Overview `SessionCard`:** same state machine; build `title` as either the name span
   (with `onDoubleClick` → begin rename) or the `<input>` when editing (same commit/cancel
   semantics, `onPointerDown` stop-propagation). Pass it into `PanelColumn` as before.
3. [ ] **Styles:** add a header rename-input class in `Canvas.module.css` and
   `Overview.module.css` sized to the title area (mirror `Sidebar`'s `renameInput`).
4. [ ] **Verify** — `npm run build`, `npm run lint`, `npm test` green; Rust untouched.
   Manual (or note as runtime-unverified): in Canvas, double-click an agent panel header →
   input appears → type a name → Enter → the name updates in the panel, the Overview card,
   and the sidebar row simultaneously; Escape cancels; committing empty reverts to the
   branch/auto-title; double-clicking a **file** panel header does nothing; grabbing the
   header and dragging still reorders/repositions (no accidental rename), and a double-click
   never starts a drag. Repeat the double-click rename on an Overview agent card.

**Acceptance criteria**

- [ ] Double-clicking an **agent** panel header in the **Canvas** opens an inline rename
      input; committing updates `session.name` and the new name shows across Canvas /
      Overview / sidebar; Escape cancels; an empty commit clears the custom name (reverts to
      auto-title / branch).
- [ ] The same double-click rename works on **Overview** agent cards.
- [ ] Double-clicking a **non-agent** panel/card header does **not** start a rename.
- [ ] Header **drag** still works on both surfaces; a stationary double-click never starts a
      drag, and a drag never enters rename.
- [ ] No regression to #186's separator double-click (different element); `npm run build`,
      `npm run lint`, `npm test` pass; no Rust changes.

**Notes**

- **Autonomous refine (2026-06-26):** user not responding; decisions below also logged in
  `ASSUMPTIONS.md`.
  - **Renamable = agents only.** Non-agent panels (file/diff/terminal/kanban/filetree) have
    derived titles and no custom-name concept; scheduled panels have their own name editor
    (#94). Double-clicking their header is a no-op.
  - **Surfaces = Canvas panel headers + Overview agent card headers** (the "drag bars"). The
    sidebar already has inline rename via its context menu (#57) and its rows aren't header
    bars → left unchanged.
  - **Input seeds the current custom name, placeholder = derived label, empty commit
    clears** — identical to the sidebar rename, via the same `renameSession` semantics
    (`trim() → null`).
  - **Coexists with dragging** via the existing 4px PointerSensor activation distance; the
    input stops `pointerdown` so the header drag can't grab it. Pattern already proven by
    `CanvasTabs` (double-click rename on a draggable tab) and the sidebar rename machine.
  - **Distinct from #186** (separator double-click = "distribute evenly"): this is the panel
    **header** double-click = rename. Different DOM targets, no conflict.
- **Depends on: none** — `renameSession` (#57), the draggable headers (#70/#144), and the
  inline-rename pattern (sidebar #57 / `CanvasTabs`) are all already shipped. Independent of
  #186 and #187.
- **References:** `Sidebar.tsx` inline rename (lines ~288–373); `CanvasTabs.tsx` tab rename
  (`onDoubleClick`); `CanvasSurface.tsx` `LeafPanel` header/title (lines ~150–208);
  `Overview.tsx` `PanelColumn`/`SessionCard` (lines ~90–173); `store.ts renameSession`
  (~2889). CLAUDE.md "Canvas (#46/#47/#58)" + "Sidebar tree (#45/#59)" rename notes.
