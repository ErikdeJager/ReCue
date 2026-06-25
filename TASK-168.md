# TASK-168

### 1. [x] Collapsible left panel — minimize the sidebar to an icon rail

**Status:** Done · _(Not started | In progress | Done)_
**Depends on:** none
**Created:** 2026-06-25

**Description**

Make the left **Sidebar** (`src/components/Sidebar/Sidebar.tsx` + `Sidebar.module.css`)
**collapsible** to a narrow icon **rail**. Today the sidebar is a full-width panel
(drag-resizable + width-persisted, #108) showing the New-session / Schedule buttons, the
Overview↔Canvas `ViewSwitch`, then repo groups — each a repo-colored `Folder` marker +
name + session count + `+`, with `SessionRow`s (carrying `BusyIndicator` activity dots),
non-agent item rows, schedules, and nested worktree sub-groups — plus a footer Settings
gear. The user wants to **minimize** this panel to a compact rail that shows **only**:

- the repo **folder icons** (one per repo, repo-colored, the existing `Folder` marker),
- the per-session **activity dots** (`BusyIndicator`s) for each repo's sessions,
- a single **New-session** `+` button,

…while **context menus keep working** (right-click a folder icon → the repo menu;
right-click a worktree icon → the worktree menu). Per the user's decisions (see **Notes**),
the rail additionally keeps the **Schedule** button, a **compact Overview/Canvas view
switch**, the footer **Settings** gear, and a **per-worktree rail icon** (a branch glyph)
nested under each parent repo. The collapse is toggled by a **chevron button** in the
sidebar footer **and** by **⌘B**, and the collapsed/expanded state **persists across
restarts**.

This is a frontend-plus-thin-persistence change. The collapsed flag persists exactly like
the #108 sidebar **width**: a dedicated Rust value (`get_sidebar_collapsed` /
`set_sidebar_collapsed`), kept **separate from the Settings blob** so it's a live UI toggle
the Settings-modal draft can never clobber. Copy the `sidebar_width` plumbing end-to-end and
swap `u32`→`bool`.

**How the two states behave**

- **Expanded (today's layout):** unchanged, except the footer gains a **collapse**
  chevron next to the Settings gear, and the width is the persisted `sidebarWidth` with the
  #108 drag-resize handle active.
- **Collapsed (the new rail):** the `aside` is a **fixed narrow width** (~56px — define a
  `SIDEBAR_RAIL_WIDTH` constant; the persisted `sidebarWidth` is **left untouched** so
  expanding restores it). The #108 **resize handle is hidden** (you can't drag a fixed
  rail; expand via the toggle / ⌘B). Top→bottom, centered as icon-only buttons:
  1. **New session** `+` → `openNewSession()` (tooltip "New session ⌘N").
  2. **Schedule** clock → `openSchedule()` (tooltip "Schedule session ⌘⇧N").
  3. **Compact view switch** — an icon-only Overview/Canvas toggle.
  4. Per repo: the repo-colored **`Folder`** icon button. **Left-click** filters Overview
     to that repo + `setView("overview")` (today's `repoTitle` behavior). **Right-click**
     opens the existing repo context menu (`setMenu({ repo, x, y })`). Directly beneath it,
     a vertical stack of that repo's **session dots** — one `BusyIndicator` per session in
     `repoSessions`, fed by `sessionBusy[id]` / `sessionActive[id]`, each wrapped so its
     tooltip names the session.
  5. For each of the repo's **worktrees**: a branch-glyph rail icon (reuse `WorktreeHeader`
     in a new `compact` icon-only mode that keeps its right-click menu) followed by that
     worktree's session dots.
  6. **Footer:** the Settings gear **and** the collapse/expand chevron, stacked vertically
     (the rail is too narrow for them side by side).

The rail shows **no** text labels, **no** non-agent item rows (files/diffs/terminals/
kanban/schedules), and **no** per-session select rows — to reach an individual session or
item, the user **expands** the sidebar (the user's explicit navigation choice; see Notes).
Activity dots are **indicators only** (not click-to-select) for the same reason.

**Scope (in scope):**

- Persist a `sidebar_collapsed` boolean (Rust value + IPC + store), mirroring `sidebar_width`.
- A footer **collapse/expand chevron** toggle and a **⌘B** shortcut (main window only).
- A **collapsed rail** rendering inside `Sidebar` (folder icons + per-session dots +
  worktree rail icons + the New/Schedule/view-switch/Settings icons), with the repo and
  worktree **context menus still functional**.
- A **`compact`** prop on `ViewSwitch` (icon-only) and on `WorktreeHeader` (icon-only,
  menu intact).
- Hiding the #108 resize handle and fixing the width while collapsed.

**Out of scope (explicit):**

- **No** per-repo **flyout/popover** listing sessions in the rail; **no** click-to-select
  on the activity dots; **no** hover-to-expand. Navigation to an individual session/item
  is done by **expanding** the sidebar (user decision).
- **No** aggregate per-repo activity dot — show the **per-session** dots (user decision).
- **No** non-agent item rows, schedule rows, or session-name rows in the rail.
- **No** change to the expanded layout beyond adding the footer collapse chevron.
- **No** change to the detached **CanvasWindow** (#84) — it has no sidebar; the ⌘B handler
  must be **main-window only** (guard on `IS_MAIN_WINDOW`).
- **No** animation requirement (a CSS width transition is welcome but optional, and must
  respect `prefers-reduced-motion`).
- **No** Settings-screen option for the default collapsed state (the live toggle + its
  persistence is the whole feature).

**Subtasks**

1. [ ] **Persist the flag (Rust).** Mirror `sidebar_width` end-to-end, `u32`→`bool`:
   - `src-tauri/src/store.rs`: add `pub sidebar_collapsed: Option<bool>` to the persisted
     state struct (next to `sidebar_width`, ~line 188; `Option` + serde-default so an older
     `sessions.json` upgrades cleanly). Add `pub fn sidebar_collapsed(&self) -> Option<bool>`
     and `pub fn set_sidebar_collapsed(&self, collapsed: bool) -> io::Result<()>` mirroring
     `sidebar_width()` / `set_sidebar_width()` (~lines 446–453).
   - `src-tauri/src/commands.rs`: add `get_sidebar_collapsed(store) -> Option<bool>` and
     `set_sidebar_collapsed(store, collapsed: bool) -> Result<(), SessionError>`, copying
     `get_sidebar_width` / `set_sidebar_width` (~lines 924–933).
   - `src-tauri/src/lib.rs`: register `commands::get_sidebar_collapsed` and
     `commands::set_sidebar_collapsed` in the `invoke_handler!` list (next to the
     `sidebar_width` entries, ~lines 195–196).
2. [ ] **IPC wrappers.** In `src/ipc.ts`, next to `getSidebarWidth` / `setSidebarWidth`
   (~line 295), add:
   - `getSidebarCollapsed = () => invoke<boolean | null>("get_sidebar_collapsed")`
   - `setSidebarCollapsed = (collapsed: boolean) => invoke<void>("set_sidebar_collapsed", { collapsed })`
3. [ ] **Store state + actions (`src/store.ts`).**
   - Add to the store interface (near `sidebarWidth`, ~line 486): `sidebarCollapsed: boolean;`
     and the reducers `setSidebarCollapsed: (collapsed: boolean) => void;` and
     `toggleSidebarCollapsed: () => void;`.
   - Default state (~line 1066, next to `sidebarWidth: SIDEBAR_WIDTH_DEFAULT`):
     `sidebarCollapsed: false,`.
   - Implement the reducers near `setSidebarWidth` (~line 1070): `setSidebarCollapsed`
     sets the state and persists via `void ipc.setSidebarCollapsed(c).catch(() => {})`
     (only when `IS_MAIN_WINDOW`, matching how the width persist is main-window-relevant —
     a no-op persist from a detached window is harmless, but gate it for clarity);
     `toggleSidebarCollapsed` = `get().setSidebarCollapsed(!get().sidebarCollapsed)`. No
     debounce needed (toggling is rare).
   - Boot load (the `Promise.all` at ~line 1419 and the `set({...})` at ~line 1485): add
     `ipc.getSidebarCollapsed()` to the `Promise.all`, destructure `rawSidebarCollapsed`,
     compute `const sidebarCollapsed = rawSidebarCollapsed ?? false;`, and include
     `sidebarCollapsed` in the final `set({...})`. (A **detached** window has no sidebar, so
     it doesn't matter there, but loading it is harmless.)
4. [ ] **`ViewSwitch` compact mode** (`src/components/ViewSwitch/ViewSwitch.tsx` + css). Add
   an optional `compact?: boolean` prop. When `compact`, render the two options as
   **icon-only** buttons (Lucide `LayoutGrid` for Overview, `PanelsTopLeft` for Canvas —
   both already used in the app) with `aria-label`/`title` "Overview"/"Canvas", reusing the
   same `setView` + `aria-selected` logic; stack/size them to fit the ~56px rail. Keep the
   default (labelled) rendering unchanged for the expanded sidebar.
5. [ ] **`WorktreeHeader` compact mode** (`Sidebar.tsx`). Add an optional `compact?: boolean`
   prop. When `compact`, render **icon-only**: just the `GitBranch` glyph (no name, no
   "worktree" badge), keeping `title={path}` and the **entire existing right-click menu**
   (New session / Views / Reveal / Copy / Close worktree) intact. The expanded rendering is
   unchanged when `compact` is false/absent.
6. [ ] **Collapse toggle in the footer** (`Sidebar.tsx`). In the `.footer`, add a chevron
   toggle button beside the Settings gear: when **expanded** show `PanelLeftClose` (Lucide)
   with title "Collapse sidebar ⌘B"; when **collapsed** show `PanelLeftOpen` with title
   "Expand sidebar ⌘B". `onClick={() => toggleSidebarCollapsed()}`. Wire
   `sidebarCollapsed` / `toggleSidebarCollapsed` from the store at the top of `Sidebar`.
7. [ ] **Render the collapsed rail** (`Sidebar.tsx` + `Sidebar.module.css`).
   - Read `sidebarCollapsed` from the store. Set the `aside` width to
     `sidebarCollapsed ? SIDEBAR_RAIL_WIDTH : sidebarWidth` (define a module-level
     `const SIDEBAR_RAIL_WIDTH = 56;`), add a `styles.collapsed` class to the `aside` when
     collapsed, and **don't render the resize handle** when collapsed.
   - When collapsed, render a distinct compact tree (reusing the existing data — `repos`,
     `repoSessions`, `worktreePaths`, `sessionBusy`, `sessionActive`, `repoColors`,
     `branches`, the same `menu`/`setMenu` repo-menu state, and `startRepoSession`):
     - Top icon buttons: **New session** (`+` → `openNewSession`), **Schedule** (clock →
       `openSchedule`), **compact `ViewSwitch`** (`<ViewSwitch compact />`).
     - Per repo: a **folder-icon button** — `onClick` filters Overview
       (`setOverviewRepoFilter(repo); setView("overview")`), `onContextMenu` opens the repo
       menu via the **same** `setMenu({ repo, x, y })` clamp logic the expanded repo header
       uses (extract that handler so both call sites share it). Tint with
       `repoColor(repo, repoColors)`. Mark the active-filter repo (`isFiltered`).
     - Beneath it, a vertical stack of **session dots**: for each `s` in `repoSessions`,
       render `<BusyIndicator busy={sessionBusy[s.id] ?? false} hasBeenActive={sessionActive[s.id] ?? false} label={sessionLabel(s.name, autoNameOn ? s.autoName : null, baseLabel).primary} />`
       wrapped in a small non-interactive span carrying the same `label` as `title` (the
       dots are indicators only — not click-to-select; see Notes).
     - Per worktree of the repo: `<WorktreeHeader compact path=… branch=… parent=… agentCount=… />`
       (right-click menu intact) followed by that worktree's session dots, mirroring the repo
       block. Reuse the existing `worktreePaths` / `wtAgents` computation.
   - The big repo **context menu JSX** at the bottom of `Sidebar` and the per-`WorktreeHeader`
     menu are unchanged and render over the rail (they're absolutely positioned at the
     cursor) — so context menus keep working in both states.
   - CSS: add a `.collapsed` modifier and rail styles (centered column, ~56px, hidden
     handle, vertically-stacked footer, hidden text). Use design tokens only.
8. [ ] **⌘B shortcut** (`src/useKeyboardNav.ts`). Add a handler: `(e.metaKey || e.ctrlKey)
   && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b"` → `preventDefault()` +
   `stopPropagation()`, and **only when `IS_MAIN_WINDOW`** call
   `useStore.getState().toggleSidebarCollapsed()` (no-op/inert in a detached canvas window,
   matching the ⌘N / ⌘⇧N pattern). Update the shortcut comment block at the top of the file.
9. [ ] **Verify & polish.** Run the full check suite (see Acceptance criteria) and manually
   exercise: toggle via the footer chevron and ⌘B; confirm the rail shows folder icons +
   per-session dots + worktree icons + New/Schedule/view-switch/Settings; confirm a busy
   session's dot shimmers and a settled one is yellow in the rail; right-click a folder icon
   (repo menu) and a worktree icon (worktree menu) while collapsed; collapse, quit, relaunch
   → still collapsed; expand → the previous (persisted) width returns.

**Acceptance criteria**

- [ ] A **collapse chevron** in the sidebar footer and the **⌘B** shortcut both toggle the
  sidebar between full and a narrow icon **rail** (⌘B is inert in a detached canvas window).
- [ ] **Collapsed**, the sidebar shows only: a New-session `+`, a Schedule clock, a compact
  Overview/Canvas switch, then per repo a repo-colored **folder icon** with that repo's
  **per-session activity dots** stacked beneath it, each worktree as its own **branch icon**
  (with its dots) under the parent, and a footer with the **Settings** gear + the
  expand chevron. No text labels, no item/schedule/session rows.
- [ ] The per-session **dots reflect live state** (blue shimmer while busy, yellow when
  settled, gray when fresh) and tooltip the session's name.
- [ ] **Context menus work while collapsed:** right-clicking a folder icon opens the repo
  menu (New session / Views / Reveal / Copy / Change color / Kill all / Close all / Forget);
  right-clicking a worktree icon opens the worktree menu (New session / Views / Reveal /
  Copy / Close worktree). Left-clicking a folder icon filters Overview to that repo.
- [ ] While collapsed the **resize handle is gone** and the width is fixed; **expanding**
  restores the previously persisted width.
- [ ] The collapsed/expanded state **persists across an app restart** (stored as
  `sidebar_collapsed`, separate from the Settings blob; an older `sessions.json` with no
  such field loads as expanded).
- [ ] The **expanded** sidebar is unchanged apart from the new footer chevron.
- [ ] All green: `npm run build`, `npm run lint`, `npm test`, `npm run format:check`,
  `cargo test --manifest-path src-tauri/Cargo.toml`, and `npm run lint:rust`.

**Notes**

- **User decisions (refine Q&A, 2026-06-25):**
  1. **Toggle →** a **chevron button** in the sidebar **plus ⌘B**; the collapsed state
     **persists** across restarts.
  2. **Navigation in collapsed mode →** clicking a repo's folder icon **filters Overview**
     to that repo (today's repo-title behavior); to reach/select an **individual session or
     item, the user expands** the sidebar. (Hence: no rail flyout, and the activity dots are
     **indicators only**, not click-to-select — keeping the rail faithful to "expand to
     navigate".)
  3. **Activity balls →** show the **per-session** `BusyIndicator` dots stacked under each
     folder icon (not a single aggregate dot per repo).
  4. **Rail controls →** keep **everything** as icons: New `+`, Schedule, a compact view
     switch, the footer Settings gear, **and a per-worktree rail icon** (branch glyph) under
     its parent repo.
- **Persistence pattern to copy (#108 `sidebar_width`):** `store.rs` field + `sidebar_width()`
  / `set_sidebar_width()` (~188, 446); `commands.rs` `get_sidebar_width` / `set_sidebar_width`
  (~924); `lib.rs` `invoke_handler` registration (~195); `ipc.ts` `getSidebarWidth` /
  `setSidebarWidth` (~295); `store.ts` state `sidebarWidth` (~486/1066), `setSidebarWidth`
  (~1070), boot `Promise.all` (~1419) + `set({...})` (~1485). Swap `u32`→`bool`; no
  clamping/debounce needed.
- **Reference symbols:**
  - `src/components/Sidebar/Sidebar.tsx` — `Sidebar` (the `aside`, ~1073), the repo header
    `onContextMenu` clamp + `setMenu` (~1146), `repoTitle` click → filter Overview (~1174),
    `WorktreeHeader` (~740), `renderPanelRows` (~1014, **not** used in the rail), the
    `.footer` Settings gear (~1305), the resize handle (~1080), and the per-repo
    `repoSessions` / `worktreePaths` / `wtAgents` computation (~1121–1141, 1254).
  - `src/components/BusyIndicator/BusyIndicator.tsx` — the dot; `label` overrides its
    tooltip text (use the session name).
  - `src/components/ViewSwitch/ViewSwitch.tsx` — segmented control to give a `compact` mode.
  - `src/paths.ts` — `sessionLabel` (the dot tooltip's `.primary`), `repoName`.
  - `src/store.ts` — `repoColor`, `repoColors`, `sessionBusy`, `sessionActive`,
    `setOverviewRepoFilter`, `setView`, `openNewSession`, `openSchedule`, `startRepoSession`.
  - `src/useKeyboardNav.ts` — the ⌘N / ⌘⇧N / ⌘\ handlers to mirror for ⌘B (capture-phase,
    `IS_MAIN_WINDOW`-guarded).
- **Lucide icons** to import: `PanelLeftClose` / `PanelLeftOpen` (the footer toggle),
  `LayoutGrid` (compact view-switch Overview), and the already-imported `PanelsTopLeft`,
  `Plus`, `Clock`, `Folder`, `GitBranch`.
- **Tests:** the feature is mostly UI; the existing `npm test` suite must stay green. A small
  optional `store.test.ts` case for `toggleSidebarCollapsed` (default false → toggles → calls
  `ipc.setSidebarCollapsed`) is encouraged but not required (no pure logic beyond the toggle).
- **Why `Depends on: none`:** this edits the existing `Sidebar` and adds a thin persisted
  flag; nothing it needs is produced by another open task. The only other open card, #167
  (file tree viewer), is unrelated and produces nothing this consumes. The prior #113→#115
  history (collapsible **repo folders**, reverted) is a different feature (folding a repo's
  child rows) and is not affected here.

- **Implementation notes (2026-06-25):** All subtasks shipped as specified. The
  `sidebar_collapsed` bool was plumbed end-to-end mirroring `sidebar_width`
  (store.rs field + getter/setter, commands.rs `get/set_sidebar_collapsed`, lib.rs
  `invoke_handler`, ipc.ts `getSidebarCollapsed`/`setSidebarCollapsed`, store.ts state +
  `setSidebarCollapsed`/`toggleSidebarCollapsed` + boot `Promise.all`). `ViewSwitch`
  gained a `compact` icon-only mode (LayoutGrid/PanelsTopLeft); `WorktreeHeader` a
  `compact` icon-only mode (GitBranch glyph, menu intact). The repo context-menu open
  handler was extracted to a shared `openRepoMenu(repo, event)` used by both the
  expanded header and the rail folder icon. The collapsed rail renders New/Schedule/
  compact-ViewSwitch icons + per-repo folder icons with per-session `BusyIndicator` dots
  + per-worktree branch icons; resize handle hidden + width fixed to
  `SIDEBAR_RAIL_WIDTH` (56px) while collapsed; footer stacks Settings gear + the
  PanelLeftClose/PanelLeftOpen chevron. ⌘B added to `useKeyboardNav` (capture-phase,
  `IS_MAIN_WINDOW`-guarded). Added the optional `toggleSidebarCollapsed` store test and
  primed `getSidebarCollapsed` in `store.refresh.test.ts`'s ipc mock (the boot
  `Promise.all` now calls it). All checks green: `npm run build` / `npm run lint` /
  `npm test` (221) / `npm run format:check` / `cargo test` / `npm run lint:rust` /
  `cargo fmt --check`.
