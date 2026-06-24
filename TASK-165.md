### 165. [x] "Open view" button on normal (non-worktree) agents — scoped to the agent's folder

**Status:** Done
**Depends on:** #164
**Created:** 2026-06-24

**Description**

#164 made the **worktree** badge clickable → a menu that opens views (diff / file /
terminal / kanban) scoped to that worktree. This card asks for the **same affordance on
normal agents**: "Just like the earlier task for a worktree agent button, normal agents
should have a similar button. A button to create any kind of panel inside their current
directory. … for a 'normal' branch or 'normal' folder/repo this option shows items to
create for the folder. While the worktree button shows items to create for that
specific worktree."

**Goal / why:** give every agent one-click access to "open a view in my folder" — a
diff, a file, a terminal, a kanban — without going to the repo's sidebar menu. A
worktree agent already gets this via its clickable badge (#164); a normal agent has no
badge, so it needs a dedicated header **button**. Both open the *same* menu (the shared
`ViewsMenu` from #164); the only difference is the scope path, which is just the agent's
`repoPath` (a normal agent's `repoPath` is its repo/folder; a worktree agent's is the
worktree).

**Grounding (concrete files / symbols):**

- **Shared menu (from #164):** the `ViewsMenu` component extracted in #164 — given a
  `repoPath`, it lists the addable views (File viewer → `FilePicker`; Diff; Terminal;
  Kanban board → `.md` `FilePicker`) and calls `addOverviewPanel(repoPath, kind, file?)`
  (`store.ts:538`), which registers an `overviewPanels[repoPath]` entry → a left-panel
  row (#59/#152) + an Overview column. **This task reuses that component** rather than
  re-deriving the action set.
- **Agent header action groups** (where the button goes):
  - Canvas: `src/components/Canvas/CanvasSurface.tsx` — the agent panel header
    `styles.panelActions` group (Fork / Copy-resume / Close, plus the #157 Maximize
    button), ≈ lines 283-308.
  - Overview: `src/components/Overview/Overview.tsx` — the agent card `actions` group
    (Fork / Copy-resume / Remove + #157 Maximize), ≈ lines 186-225.
- **Worktree vs normal:** a worktree agent has `session.worktreeParent` set and shows
  the clickable "worktree" badge (#164); a normal agent has `worktreeParent` undefined
  and no badge. Detect normal via `content.kind === "agent" && !session.worktreeParent`.
- **Scope path:** `session.repoPath` — for a normal agent this is the repo/folder, so
  `addOverviewPanel(repoPath, …)` registers under the repo and groups in that repo's
  cluster (standard behavior; **no special grouping** needed, unlike #164's worktree
  case).

**Scope:** add an "open view" icon button to **non-worktree** agents' Canvas panel
header and Overview card header, opening the shared `ViewsMenu` (#164) scoped to
`session.repoPath`.

**Explicitly out of scope:**

- **Worktree agents** — they already get this via the clickable badge (#164); do not
  add a second affordance for them (gate the button on `!session.worktreeParent`).
- Non-agent items (terminals / files / diffs) — the button is an agent-folder
  affordance.
- Creating a **new agent / new session** from this menu (that's the repo "New session"
  menu and the "Worktree context menu" card) — this menu only **opens views**, matching
  #164's set.
- Changing `ViewsMenu` / `addOverviewPanel` / the view kinds (reused as-is).

**Subtasks**

1. [ ] Reuse the shared `ViewsMenu` component produced by **#164** (no new action set).
   If #164's extraction left it Sidebar-internal, ensure it's a standalone reusable
   component first (that work belongs to #164; this task depends on it).
2. [ ] Add an **"open view"** icon button to the agent header action groups —
   `CanvasSurface` `panelActions` (≈283-308) and Overview agent `actions` (≈186-225) —
   **only when** `content.kind === "agent" && !session.worktreeParent`. Use an
   on-system Lucide icon (e.g. `Plus` or `PanelsTopLeft`/`LayoutGrid`), `title="Open a
   view in this folder"`, `aria-haspopup="menu"`/`aria-expanded`.
3. [ ] Clicking toggles the `ViewsMenu` popover scoped to `session.repoPath`; dismiss on
   outside-click + Escape (same pattern as #164 / `FileSwitcher`). `onPointerDown`
   stop-propagation so the click never starts a Canvas move-leaf drag / Overview card
   drag.
4. [ ] Each action calls `addOverviewPanel(session.repoPath, kind, file?)`; verify the
   created view appears as a left-panel row + an Overview column in the agent's **repo
   cluster** (standard grouping — no worktree special-casing).
5. [ ] **Verify:** `npm run build`, `npm run lint`, `npm test`. Manual: for a **normal**
   agent, the button shows in both the Canvas panel header and the Overview card header;
   clicking opens the menu; Open diff / file / terminal / kanban each create the view in
   the agent's folder, appearing in the left panel + Overview. A **worktree** agent
   shows **no** new button (still uses its badge from #164). The repo Views menu (#82)
   is unchanged.

**Acceptance criteria**

- [ ] Normal (non-worktree) agents show an "open view" button in their Canvas panel
      header **and** Overview card header.
- [ ] Clicking opens the shared `ViewsMenu` (the same menu as #164's badge and the #82
      repo menu) scoped to the agent's folder/repo.
- [ ] Selecting an action opens that view in the agent's folder, appearing as a
      left-panel row + Overview column in the repo's cluster.
- [ ] Worktree agents are unaffected — no duplicate button (they use the #164 badge).
- [ ] The button click never starts a drag; the popover dismisses on outside-click /
      Escape.
- [ ] `npm run build`, `npm run lint`, `npm test` pass.

**Notes**

- **Design split (deliberate):** worktree agents get the affordance via the clickable
  **badge** (#164); normal agents get it via a header **button** (this task). Both open
  the same `ViewsMenu` scoped to `session.repoPath`, so the only real difference is the
  path — exactly the "folder vs that specific worktree" distinction the card calls out.
  *Alternative considered:* a uniform button on **all** agents (worktree included),
  making the #164 badge redundant — rejected to avoid two affordances doing the same
  thing on worktree agents and to honor the card's framing ("normal agents should have a
  similar button"). The implementer may revisit if a uniform button reads better.
- **No special grouping** here (unlike #164): a normal agent's `repoPath` is its repo,
  so the opened view groups in that repo's cluster via the existing `overviewPanels`
  rendering.
- **Depends on #164** for the shared `ViewsMenu` component and the agent-header
  views-affordance pattern. (The sibling "Worktree context menu" card will likely also
  depend on #164 and reuse the same menu.)
- **Task numbering:** highest existing is #164 (TASK-154…164.md; board #158–#164;
  `TASK_ARCHIVE.md` ≤ #153). Hence #165.
- **References:** `CanvasSurface.tsx` (agent `panelActions` ≈283-308),
  `Overview.tsx` (agent `actions` ≈186-225), TASK-164 (`ViewsMenu`, badge pattern),
  `store.ts:538` (`addOverviewPanel`), `FileSwitcher/FileSwitcher.tsx` (popover
  dismiss pattern), `paths.ts` (`effectiveRepo`).

**Implementation note (done 2026-06-24)**

- **Shared popover** `components/ViewsMenu/ViewsPopover.tsx` extracted from #164's
  `WorktreeViewsBadge`: open/dismiss (outside-click + Escape) + `pointerdown`
  stop-propagation + the popover surface, hosting the shared `ViewsMenu`. Takes an
  `align` ("left" for the left-placed badge, "right" for a header action button) so
  the popover stays on-screen. `WorktreeViewsBadge` was refactored to use it
  (align="left") — #164's behavior preserved.
- **`OpenViewButton`** (`components/OpenViewButton/`): an icon button (Lucide
  `PanelsTopLeft`, `aria-haspopup="menu"`/`aria-expanded`, "Open a view in this
  folder") wrapping `ViewsPopover` scoped to the agent's `repoPath`. `className` +
  `iconSize` match the host action-button styling.
- Wired into the agent header action groups **gated on `content.kind === "agent" &&
  !session.worktreeParent`** — `CanvasSurface` `panelActions` (class `panelClose`)
  and Overview `SessionCard` `actions` (class `action`, iconSize 15). Worktree agents
  show no button (they keep the #164 badge).
- No special grouping (a normal agent's `repoPath` is its repo, so the opened view
  groups in that repo's cluster via the existing `overviewPanels` rendering). The
  drag-safety is doubly ensured (the action group + ViewsPopover both stop
  pointerdown).
- `npm run build`, `npm run lint`, `npm run format:check`, and `npm test` (212) all
  pass. Subtask 5 manual walk-through is interactive; the wiring reuses #164's proven
  popover + action set.
