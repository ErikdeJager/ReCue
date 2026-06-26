# Task 189

### 189. [x] Keyboard-driven panel-creation modal (⌘K) + per-type quick shortcuts

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

Creating a panel today takes a few clicks: an **agent** via ⌘N → `NewSessionModal`
(folder → branch) or the repo menu's "New session here"; a **view** (file / diff /
terminal / kanban / filetree) via the repo context-menu's **Views** section
(`ViewsMenu`, #82/#164) or the file picker. The user wants a faster, keyboard-first way to
spawn any panel type: a single shortcut opens a **"Create panel" modal** where they pick a
**type** and a **target folder (repo or repo-worktree)**; plus **per-type shortcuts** so a
specific panel type can be created in one gesture.

**Goal & why.** A quick, discoverable, keyboard-driven launcher that **reuses the existing
creation actions** so it stays consistent with — and as a faster alternative to — the
Views menu and ⌘N. It's an explicit "nice to have" for power users.

**⚠️ Keybinding collision — the central design decision.** The user suggested "**Cmd+1 =
session, Cmd+2 = file view**", but **⌘1–9 are already bound globally** to *jump to canvas N*
(#76, `useKeyboardNav.ts`). So plain ⌘1–9 **cannot** be reused for panel types. ⌘⇧+digit is
also unsafe (⌘⇧3/4/5 are macOS system screenshots). Resolution (autonomous — user
unavailable):

- **Opener:** add a single global shortcut **⌘K / Ctrl+K** (currently free; the
  command-palette convention) to open the Create-panel modal at the **type** step.
- **In-modal digit keys 1–6** select the panel type (shown as visible hints next to each
  type) and advance to the target step — this is the primary, discoverable realization of
  the user's "1 = session, 2 = file…" idea, with **no global collision** (mirrors how
  `NewSessionModal` repurposes ⌘1–9 for recents while it's open).
- **Global per-type shortcuts ⌘⌥1–6** (Cmd+Option+digit, a free combo) open the modal
  **directly at the target step** for that type — the literal "individual panel keybind"
  the user asked for, honored with a non-colliding modifier. Like all ⌘-combos these never
  reach a focused PTY.

**Type registry (digit order).** `1` Session (agent) · `2` File viewer · `3` Diff viewer ·
`4` Terminal · `5` Kanban board · `6` File tree. This reuses the **same set** the
`ViewsMenu` (#82/#164) + block registry (`templateBlocks.ts`) already expose, so it stays
in sync with the addable types.

**Modal flow (reuse-heavy — the modal mostly orchestrates existing store actions).**

1. **Type step** — a list of the 6 types with icons + digit hints. Click or press 1–6.
   (When opened via ⌘⌥N, this step is pre-resolved and skipped.)
2. **Target step** — pick the folder: a list of **currently-open repos and their
   worktrees** (derive from the sidebar repo set / `recents` + active `session.repoPath`
   values, which already include worktree folders #74), plus a **Browse…** folder picker
   and recents (reuse the `NewSessionModal` folder UX). This is the "repo or repo-worktree
   selection" step.
3. **Create**, by type (reusing shipped actions):
   - **Session** → close the modal and call **`startRepoSession(folder)`** (#127) — which
     opens the new-session flow at the **branch/worktree** step for a git folder (or spawns
     directly for a non-git folder). No reimplementation of branch/worktree logic.
   - **File / Kanban** → show the shared **`FilePicker`** (#56; Kanban scoped to `.md` with
     the create-or-open flow #151), then `addOverviewPanel(folder, "file"|"kanban", file)`
     / `createKanbanBoard(folder, name)`.
   - **Diff / Terminal / File tree** → `addOverviewPanel(folder, kind)` directly.

**Where new panels land.** Through the **same path as the Views menu**: agents via
`startRepoSession`/`spawnSession`, views via `addOverviewPanel` → an
`overviewPanels[repo]` entry, so the new panel appears in the **sidebar tree + Overview**
and is **draggable into Canvas** (#47/#59). The modal does **not** auto-insert into the
active Canvas BSP layout (that would need a split-target decision) — consistent with how
every other "add a view" entry behaves today.

**Scope.** Main-window only (it needs the sidebar/Overview to host the panel; the shortcut
is swallowed-but-inert in detached canvas windows, like ⌘N). Inert while another modal
(`newSessionOpen`, the new modal itself) is open. Reuses `NewSessionModal`'s modal chrome
(centered, focus-trapped) and the `FilePicker`.

**Out of scope.**
- Auto-inserting the new panel into the active Canvas layout (future enhancement; for now
  it lands in sidebar/Overview and is draggable in).
- Changing the existing ⌘1–9 canvas-jump (#76) or any other current shortcut.
- Adding a *new* panel/view type (this only adds a new way to invoke the existing six).
- A full "command palette" (fuzzy actions) — this is a focused panel launcher only.

**Concrete files/symbols.**
- **New** `src/components/CreatePanelModal/CreatePanelModal.tsx` (+ `.module.css`) — the
  two-step modal; mirror `NewSessionModal`'s chrome/focus-trap and reuse `FilePicker`.
- `src/store.ts` — add `createPanelOpen: boolean` + `createPanelType: string | null`
  (pre-selected type for the ⌘⌥N path) state and `openCreatePanel(type?)` /
  `closeCreatePanel()` actions (near `openNewSession`/`startRepoSession`, ~lines 665–672).
  Reuse `addOverviewPanel` (~1765), `createKanbanBoard` (~1835), `startRepoSession`,
  `spawnSession`, `recents`.
- `src/useKeyboardNav.ts` — add ⌘K (open at type step) and ⌘⌥1–6 (open at target step for
  type N); both **main-window only**, both **skipped while `createPanelOpen` ||
  `newSessionOpen`**, both `preventDefault`+`stopPropagation` in the capture phase.
- `src/App.tsx` — mount `<CreatePanelModal />` when `createPanelOpen` (next to
  `NewSessionModal`).
- Reuse refs: `ViewsMenu.tsx` (the action set + which types need a `FilePicker`),
  `NewSessionModal` (folder step UX), `paths.ts` (`effectiveRepo`/`repoName`).
- Optionally extract the 6-type list into a tiny shared module so the modal, the digit map,
  and `ViewsMenu` read one list.

**Subtasks**

1. [x] **Store**: `createPanelOpen`/`createPanelType` state + `openCreatePanel(type?)` /
   `closeCreatePanel()` (near `openNewSession`).
2. [x] **CreatePanelModal** (+ `.module.css`): type step (6 types + digit hints, click/1–6)
   → target step (open repos+worktrees from `recents` ∪ live `session.repoPath`, search +
   Browse…) → per-type create (session→`startRepoSession`; file/kanban→`FilePicker`→
   `addOverviewPanel("markdown"/"kanban")`/`createKanbanBoard`; diff/terminal/filetree→
   `addOverviewPanel` directly). Pre-selected `createPanelType` opens at the target step.
   Centered scrim, focus-trap, Escape + outside-click close.
3. [x] **Keyboard** (`useKeyboardNav.ts`): ⌘K → `openCreatePanel()`; ⌘⌥`1`–`6` →
   `openCreatePanel(panelTypeForDigit(N))` (matched via `e.code` `Digit1`–`Digit6` since
   Option+digit composes a glyph in `e.key`). Main-window only; skip while `createPanelOpen
   || newSessionOpen`; capture-phase `preventDefault`+`stopPropagation`. Shortcut comment
   block updated.
4. [x] **Mount** `<CreatePanelModal />` in `App.tsx` under `createPanelOpen`.
5. [x] **Docs**: new shortcuts noted in the `useKeyboardNav.ts` comment (the authoritative
   list). CLAUDE.md's shortcut mentions are left to the periodic `/update-docs` pass.
6. [x] **Verify** — `npm run build`, `npm run lint`, `npm test` (259, +2) green; **no Rust
   changes**. A pure unit test covers the digit→type registry. The interactive flow is
   **runtime-unverified** in this autonomous loop (no GUI session) — see Notes.

**Acceptance criteria**

- [x] **⌘K** opens a Create-panel modal listing the 6 panel types with digit hints; picking
      a type then a folder creates that panel via the existing actions (agents through
      `startRepoSession`'s branch/worktree flow; views through `addOverviewPanel`/
      `FilePicker`/`createKanbanBoard`). _(Wired; live render runtime-unverified — see Notes.)_
- [x] In the modal, pressing **1–6** selects the corresponding type; **⌘⌥1–6** open the
      modal straight to the folder step for that type (`panelTypeForDigit`, unit-tested).
- [x] New panels appear in the **sidebar + Overview** (and are draggable into Canvas), the
      same as the Views menu — they go through the identical `addOverviewPanel` /
      `startRepoSession` path; the modal never auto-inserts into the active Canvas layout.
- [x] The existing **⌘1–9 canvas-jump (#76) is unchanged** (the new ⌘⌥digit requires
      `altKey`; canvas-jump requires `!altKey` — mutually exclusive); no new shortcut
      reaches a focused PTY (all ⌘-based, capture-phase `preventDefault`+`stopPropagation`);
      main-window-only; inert while `createPanelOpen || newSessionOpen`.
- [x] `npm run build`, `npm run lint`, `npm test` pass; no Rust changes.

**Notes**

- **Autonomous refine (2026-06-26):** user not responding; decisions below also logged in
  `ASSUMPTIONS.md`.
  - **Opener = ⌘K** (free; palette convention). The user's literal "Cmd+1" is impossible —
    ⌘1–9 is canvas-jump (#76) — and ⌘⇧+digit clashes with macOS screenshots (⌘⇧3/4/5), so
    per-type quick keys are **in-modal digits 1–6** (primary) + **global ⌘⌥1–6** (the literal
    "individual panel keybind", with a free modifier).
  - **Type order:** 1 Session · 2 File · 3 Diff · 4 Terminal · 5 Kanban · 6 File tree,
    reusing the `ViewsMenu`/block-registry set so it stays in sync with addable types.
  - **Target step lists open repos + their worktrees + recents + Browse**, reusing the
    new-session folder UX; this is the "repo or repo-worktree selection".
  - **The modal orchestrates existing actions** (`startRepoSession` #127, `addOverviewPanel`,
    `createKanbanBoard`, `FilePicker`) — no new creation logic, no new view type.
  - **New panels land in sidebar/Overview** (Views path), draggable to Canvas; **not**
    auto-inserted into the active Canvas BSP (left as a future enhancement to avoid a
    split-target decision).
  - Main-window only; inert while another modal is open; ⌘-combos never reach the PTY.
- **Depends on: none** — `ViewsMenu`/`addOverviewPanel` (#82/#164), `startRepoSession`
  (#127), `spawnSession`/`createKanbanBoard`, `FilePicker` (#56), and `useKeyboardNav` are
  all shipped. Independent of #186 / #187 / #188. (It does **not** add an addable view type,
  so it does not affect the #82 Views-menu dependency rule.)
- **References:** `useKeyboardNav.ts` (full shortcut list, the ⌘1–9 canvas-jump + the
  capture-phase pattern); `ViewsMenu.tsx` (the per-type create actions + which need a
  `FilePicker`); `store.ts` (`openNewSession`/`startRepoSession` ~665, `addOverviewPanel`
  ~1765, `createKanbanBoard` ~1835, `recents`); `NewSessionModal` (modal chrome + folder
  UX). CLAUDE.md "Scheduled/new-session flow" + "Sidebar tree (#45/#59)" + keyboard notes.

**Implementation notes (2026-06-26 — done)**

- New files: `components/CreatePanelModal/CreatePanelModal.tsx` + `.module.css` (centered
  command-palette modal), `panelTypes.ts` (the shared 6-type registry + `panelTypeForDigit`)
  + `panelTypes.test.ts`. Edited: `store.ts` (state + open/close actions), `useKeyboardNav.ts`
  (⌘K + ⌘⌥1–6), `App.tsx` (mount). **No backend/Rust changes.**
- **Reuse-only creation** — the modal calls the shipped actions (`startRepoSession` #127 for
  agents, `addOverviewPanel`/`createKanbanBoard` + the shared `FilePicker` for views). A File
  viewer maps to the `markdown` overview-panel kind (matching `ViewsMenu`). No new view type,
  no branch/worktree logic re-implemented, no auto-insert into the active Canvas BSP (panels
  land in sidebar/Overview, draggable in — exactly like the Views menu).
- **Keybinding collision resolved as planned:** ⌘1–9 (canvas-jump, `!altKey`) is untouched;
  the per-type keys are in-modal digits 1–6 (primary, discoverable) + global **⌘⌥1–6**. The
  ⌘⌥ handler matches `e.code` (`Digit1`–`Digit6`) because macOS Option+digit composes a glyph
  in `e.key` (e.g. Option-1 = "¡"); using `e.code` makes it layout/glyph-proof.
- **Shared registry** (`panelTypes.ts`) is the single source the modal, the in-modal digit
  map, and the keyboard handler read — kept in sync with the addable set (mirrors
  `ViewsMenu`/`templateBlocks`). The folder list = `recents` ∪ live `session.repoPath`s
  (worktree folders included, #74), deduped, + Browse…
- **Guards:** main-window-only (`IS_MAIN_WINDOW`), capture-phase `preventDefault`+
  `stopPropagation` (never reaches a focused PTY), inert while `createPanelOpen ||
  newSessionOpen` (the scope the plan specified; other modals like Settings aren't guarded —
  an accepted edge case).
- **Runtime-unverified (autonomous loop, no GUI session):** the live ⌘K / ⌘⌥N gestures, the
  modal's two-step flow, and that a created panel actually appears in the sidebar/Overview.
  The digit→type mapping is unit-tested and every creation path reuses shipped, exercised
  actions; the wiring is type-checked and lint/format clean. Mirrors the #84/#186/#187/#188
  precedent; recommend a manual pass on the next `npm run tauri dev` (incl. confirming ⌘1–9
  still jumps canvases and the combos don't leak into a focused terminal).
