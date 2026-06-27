### 228. [ ] Make agents in the collapsed sidebar rail clickable (left-click select + right-click menu)

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-28

**Description**

When the sidebar is **collapsed** to the icon rail (#168/#214), agents render as **status
dots only** with no interactivity. Make them respond to **left-click (select / jump to the
agent)** and **right-click (the agent context menu)** — the same behavior as the expanded
sidebar rows.

**Grounding:**

- The collapsed rail is built in `src/components/Sidebar/Sidebar.tsx` (`rail`, ~lines
  1611-1705). Each session is rendered by the `dot(s, base)` helper (lines 1645-1655) as
  a bare `<BusyIndicator>` with a `label` (tooltip) — **no `onClick`, no `onContextMenu`,
  no selected state**. Repo sessions: `repoSessions.map((s) => dot(s, baseLabel))`
  (line 1675); worktree agents: `wtAgents.map((s) => dot(s, wtBranch))` (line 1694).
  A right-click currently bubbles to `railRepos`/`railRepo`'s `openBgMenu`/repo menu.
- The **expanded** `SessionRow` (`Sidebar.tsx:281-...`) is the behavior to mirror:
  - **Left-click** → `onSelect` → the parent passes `selectItem({ kind:"agent", id:
    session.id, repoPath: session.repoPath })` (e.g. `Sidebar.tsx:1257`).
  - **Right-click** → an inline context menu (state `menu`, `Sidebar.tsx:319-378`) with
    items: **Rename** (begins an inline editor, `:441-451`), **Fork conversation**
    (`forkSession`, gated by `forkUnavailableReason`/`canFork`, `:455-473`), **Copy
    session ID** (`copyToClipboard(session.claudeSessionId)`, shown only when
    `agentSupportsResume`, `:476-488`), **Open in canvas** (`openSessionInCanvas`,
    `:492-...`), and **Remove** (`removeSession`, further down).
  - It's also draggable into Canvas (`useDraggable`, `:306-314`).

**Decided approach (autonomous — see Notes/ASSUMPTIONS.md):**

1. **Make each rail dot a clickable target.** Change `dot()` to wrap the `<BusyIndicator>`
   in a `<button>` (or focusable element) with:
   - `onClick` → `selectItem({ kind:"agent", id: s.id, repoPath: s.repoPath })`.
   - `onContextMenu` → `preventDefault()` + **`stopPropagation()`** (so it opens the
     **agent** menu, not the rail's background/repo menu) → open the agent context menu at
     the cursor.
   - `title` / `aria-label` = the agent's label (`sessionLabel(...).primary`), preserving
     the existing tooltip.
   - a **selected** visual state when `s.id === selectedId` (mirror the expanded
     `rowSelected`).
   Apply to **both** the repo-session dots and the worktree-agent dots.
2. **Right-click menu = the same agent menu as `SessionRow`.** To avoid divergence,
   **extract the agent menu actions into a shared helper** (e.g. a `useAgentRowActions
   (session)` hook or an `agentRowMenuItems(session, …)` builder) returning the handlers +
   availability (Fork incl. `canFork`/`forkReason`, Copy session ID incl. `canResume`,
   Open in canvas, Remove, Rename) and have **both** `SessionRow` and the rail render their
   menu from it (reuse the existing `RowContextMenu` renderer or the same inline-menu
   markup). Keep the menu position-clamping already used in `SessionRow`
   (`Sidebar.tsx:372-377`).
3. **Rename from the rail** (the one item with no room for an inline editor in the narrow
   rail): **expand the sidebar first, then begin the inline rename on the now-visible row.**
   i.e. the rail's Rename calls `toggleSidebarCollapsed()` (expand) + selects the session +
   triggers its inline rename (via a transient store flag, e.g. `pendingRenameSessionId`,
   that the expanded `SessionRow` consumes on mount/update to auto-`beginRename`, then
   clears). **Acceptable fallback** if that plumbing is judged too heavy: omit **Rename**
   from the rail menu (rename remains available after expanding) while keeping all other
   items. Recommended: the expand-and-rename flow.

**Out of scope:**

- **Drag-into-Canvas** from the rail dots — the card asks only for click behavior; keep
  drag to the expanded rows.
- The rail's **repo folder** button (already clickable: filters Overview / repo menu) and
  the **worktree header** (already has its own menu in compact mode) — unchanged.
- Non-agent items (files/diffs/terminals/schedules) — they don't appear in the rail dots;
  unchanged.

**Cross-platform (hard requirement):** pure frontend; right-click `onContextMenu` +
`clientX/clientY` positioning are standard and identical on macOS and Windows; no
OS-specific code. (Reuse the existing menu component so its clamping/dismiss behavior is
inherited.)

**Subtasks**

1. [ ] Extract the agent context-menu actions/items shared between `SessionRow` and the
   rail (a `useAgentRowActions`/`agentRowMenuItems` helper), preserving the exact items +
   gating (Fork `canFork`/`forkReason`, Copy ID `canResume`, Open in canvas, Remove,
   Rename).
2. [ ] Update the rail `dot()` helper to render a clickable button: `onClick` → select,
   `onContextMenu` (stopPropagation) → the shared agent menu, tooltip/aria-label, and a
   selected state. Apply to repo + worktree dots.
3. [ ] Implement Rename-from-rail (expand + select + auto-begin rename via a transient
   `pendingRenameSessionId`), or the documented fallback (omit Rename in rail).
4. [ ] Add `.railDot` (button reset + hover + selected) styles in `Sidebar.module.css`;
   ensure the dot's footprint/alignment in `railDots` is unchanged.
5. [ ] `npm run build`, `npm run lint`, `npm test`, `npm run format:check` pass.

**Acceptance criteria**

- [ ] In the **collapsed** rail, **left-clicking** an agent dot selects/jumps to that agent
      (same as the expanded row), and the dot shows a selected state when active.
- [ ] **Right-clicking** an agent dot opens the **agent context menu** (Fork conversation /
      Copy session ID / Open in canvas / Remove, plus Rename per the chosen approach) — not
      the rail's background/repo menu — with the same gating as the expanded row.
- [ ] Works for both normal-repo and worktree agents in the rail.
- [ ] The status-dot appearance/footprint is preserved; the expanded sidebar behavior is
      unchanged; no regression to the rail's repo/worktree controls.
- [ ] `npm run build`, `npm run lint`, `npm test`, `npm run format:check` pass.

**Notes**

- **Autonomous decisions (user not answering; logged in `ASSUMPTIONS.md`):**
  - *Left-click = `selectItem` agent select/jump; right-click = the same agent menu as the
    expanded row*, sharing the menu via an extracted helper so the two never diverge.
  - *Rename from the rail = expand + auto-begin inline rename* (the inline editor doesn't
    fit the narrow rail); documented fallback = omit Rename in the rail.
  - *Drag-into-Canvas from the rail is out of scope* (card is click-only).
- **Depends on: none** — builds on the shipped collapsed rail (#168/#214) and the
  `SessionRow` agent menu (#57/#131/#132/#142/#153).
- References: `Sidebar.tsx:1611-1705` (rail), `:1645-1655` (`dot()` helper to make
  clickable), `:1673-1696` (repo + worktree dots), `:281-...` (`SessionRow`), `:319-378`
  (right-click menu + clamp), `:441-...` (menu items: Rename/Fork/Copy ID/Open in
  canvas/Remove), `:1257` (`selectItem` agent payload), `selectedId` in the store,
  `Sidebar.module.css` (`railDots`/`row`/`rowSelected`).
