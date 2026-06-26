# TASK-174

### 174. [ ] Shift+arrow Overview navigation selects every panel kind, not just agents

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-26

**Description**

In the **Overview** wall, **Shift+←/→** keyboard navigation today steps **only
through agent terminals** and silently skips every non-agent column — file viewers,
diff panels, shell terminals, kanban boards, file-tree panels (#167), and pending
scheduled-session cards. The user wants Shift+arrows to reach **all** panel kinds:
"No matter what kind of panel, I should be able to select it with the shift + arrow
keys."

**Where the gap is.** The global key handler lives in
`src/useKeyboardNav.ts`. Its Overview branch (the block guarded by
`state.view === "overview"`, near the bottom of `onKeyDown`) does:

```ts
// Overview: only ←/→ navigate agents (#24); ↑/↓ pass through.
if (key === "ArrowLeft" || key === "ArrowRight") {
  e.preventDefault();
  e.stopPropagation();
  const id = adjacentSessionId(
    state.sessions,
    state.selectedId,
    key === "ArrowRight" ? 1 : -1,
  );
  if (id) state.select(id);
}
```

`adjacentSessionId(sessions, selectedId, delta)` (`src/store.ts`, ~line 198) iterates
**`state.sessions` only**, so the cursor can never land on a panel/schedule column.

**Why this is a refactor, not a one-liner.** The Overview wall renders a single
horizontal row of columns whose **visual order** is computed *inside* the `Overview`
component (`src/components/Overview/Overview.tsx`, the `clusters` block ~lines
524–617): group sessions by `effectiveRepo`, attribute each `overviewPanels` entry to
its cluster (worktree panels cluster under their parent repo via `clusterRepoOf`), add
pending `schedules`, sort repos alphabetically by `repoName`, and within each repo
order items by the persisted drag order merged with the live default order
(`mergeRepoOrder(overviewOrder[repo] ?? [], defaultKeys)`). The flat list of item ids,
in exactly that rendered order, is what Shift+←/→ must walk. To keep keyboard nav and
the rendered wall from drifting, **extract that ordering into one pure, shared,
unit-tested function** and have both the keyboard handler and the `Overview` component
consume it.

Each column kind already supports being selected: `SessionCard`, `ExtraPanel`, and
`ScheduleCard` all take a `selected` prop, all set `data-item-id={id}` via
`PanelColumn`, all add `styles.cardSelected` when `id === selectedId`, and the
`Overview` `useEffect` on `selectedId` already scrolls `[data-item-id="…"]` into view.
So once `state.select(id)` is called with a **panel** or **schedule** id, the
highlight + scroll-into-view already work — **no change to selection rendering is
needed**. The only missing piece is keyboard nav reaching those ids.

**Decisions from the user (refine Q&A, 2026-06-26 — see Notes):**

- **Scope: Overview only.** Canvas Shift+arrows (`store.moveCanvasFocus` →
  `collectLeaves`/`spatialNeighbor`) already reach **every** leaf kind (agent / file /
  diff / terminal / kanban / filetree / scheduled). Investigation found no panel kind
  Canvas misses, so **Canvas is left untouched**.
- **Axis: Left/Right only.** The Overview wall is a single horizontal row, so ←/→ is
  the navigation axis. **Shift+↑/↓ keep passing through** to a focused terminal (e.g.
  claude/shell scrollback) exactly as today (#24). Do **not** hijack ↑/↓.

**Out of scope**

- **Canvas** navigation (`moveCanvasFocus`) — already covers all panel kinds; no
  change.
- **Shift+↑/↓** behavior in Overview — stays as a pass-through.
- The visual selection treatment (`cardSelected` frame, scroll-into-view) — already
  works for every column kind; no styling change.
- What "selected" *does* beyond the existing highlight + scroll-into-view (no new
  action such as auto-maximize is introduced).
- Mouse/click selection — already selects any column via `onClickBody`/`select`; no
  change.
- The second Refine card "Filetree open double" — a separate, independent task.

**Subtasks**

1. [ ] **Extract the Overview ordering into a pure function** in `src/store.ts`
   (next to `adjacentSessionId` / `mergeRepoOrder`, which already live there and are
   unit-tested). Suggested name `overviewClusterKeys` (or `flatOverviewItemIds`).
   - Signature: take a narrow, serializable input object —
     `{ sessions: SessionView[]; overviewPanels: Record<string, OverviewPanel[]>;
     overviewOrder: Record<string, string[]>; schedules: ScheduledSession[];
     filter: string | null }` — and return the **ordered list of item ids**
     (`string[]`) exactly as the wall renders them (or return `{ repo, keys }[]` and
     derive the flat list with `.flatMap(c => c.keys)` — your call, but expose the flat
     id list).
   - Replicate the `Overview` `clusters` logic precisely: apply the repo `filter`
     (`effectiveRepo(s) === filter`); build `panelsByCluster` with worktree→parent
     attribution (`clusterRepoOf`); collect the repo set (repos with shown agents, with
     non-empty panel clusters respecting the filter, and with schedules respecting the
     filter); sort repos by `repoName(...).toLowerCase()` then path; per repo compute
     `defaultKeys = [...agentIds, ...panelIds, ...scheduleIds]` then
     `mergeRepoOrder(overviewOrder[repo] ?? [], defaultKeys)`; **drop empty clusters**.
     The result must equal the on-screen left-to-right column order.
2. [ ] **Have `Overview.tsx` consume the shared function** so the rendered order and
   the nav order cannot diverge. Refactor the `clusters` computation to derive each
   cluster's `keys` from the extracted function (the component still builds its `byKey`
   map and `items` array locally for rendering — only the **ordering/keys** must come
   from the shared helper). Verify the wall renders identically (same grouping, same
   per-repo order, same filter behavior, same empty-cluster drop).
3. [ ] **Add a flat-list adjacency helper** in `src/store.ts`: a small pure
   `adjacentId(ids: string[], selectedId: string | null, delta: number): string | null`
   that mirrors `adjacentSessionId`'s semantics on a plain id array — empty → `null`;
   `selectedId` not in `ids` (or `null`) → first id; otherwise wrap-around modulo
   (`(((i + delta) % n) + n) % n`). (`adjacentSessionId` can optionally be reimplemented
   in terms of it — `adjacentId(sessions.map(s => s.id), …)` — but that is not required.)
4. [ ] **Rewrite the Overview branch of `useKeyboardNav.ts`** so Shift+←/→ steps the
   full flat list:
   - Compute `const ids = overviewClusterKeys({ sessions, overviewPanels,
     overviewOrder, schedules, filter: overviewRepoFilter })` from `useStore.getState()`
     (the handler already reads `state` via `getState()`).
   - On `ArrowLeft`/`ArrowRight`: `preventDefault()` + `stopPropagation()`, then
     `const id = adjacentId(ids, state.selectedId, key === "ArrowRight" ? 1 : -1);` and
     `if (id) state.select(id);`.
   - Leave Shift+↑/↓ passing through (do not intercept). Keep the existing
     `state.newSessionOpen` guard and the Canvas/detached-window branch unchanged.
   - Confirm the store-state field name for the filter is `overviewRepoFilter` (used in
     `Overview` as `s.overviewRepoFilter`).
5. [ ] **Unit tests** in `src/store.test.ts` (alongside the existing `mergeRepoOrder`
   and any `adjacentSessionId` tests):
   - `overviewClusterKeys`: ordering across two repos (alphabetical by `repoName`),
     mixed item kinds interleaved per the persisted `overviewOrder`, a worktree panel
     attributed to its parent cluster, the repo `filter` narrowing to one cluster, and
     empty clusters dropped — assert the exact flat id order.
   - `adjacentId`: empty list → `null`; unknown/`null` selection → first id; forward and
     backward wrap-around at the ends.
6. [ ] **Manual/spec check of the round trip:** selecting a panel or schedule id via
   `state.select(...)` highlights that column (`cardSelected`) and scrolls it into view
   (the existing `data-item-id` effect) — confirm no rendering change is required for
   non-agent columns (it already keys off `selectedId`).
7. [ ] Run `npm run build`, `npm run lint`, `npm test`, `npm run format:check`, and
   `cargo test --manifest-path src-tauri/Cargo.toml` (+ `npm run lint:rust`); fix any
   issues. (No Rust changes are expected — this is frontend-only — but run the Rust
   checks per repo convention.)

**Acceptance criteria**

- [ ] In **Overview**, pressing **Shift+→** repeatedly moves the selection across
      **every** column in left-to-right rendered order — agent terminals **and** file,
      diff, terminal, kanban, file-tree, and scheduled columns — and **Shift+←** moves
      the opposite direction. No column kind is skipped.
- [ ] The selected column (of any kind) shows the repo-colored selection frame
      (`cardSelected`) and is scrolled into view, just as clicking it does today.
- [ ] Navigation order **exactly matches** the on-screen column order, including the
      persisted per-repo drag order (`overviewOrder`) and worktree-panel clustering; it
      wraps around at both ends; with no current selection, Shift+→ / Shift+← selects the
      first column.
- [ ] When an **Overview repo filter** (`overviewRepoFilter`) is active, navigation is
      confined to the visible (filtered) columns only.
- [ ] **Shift+↑/↓** in Overview still pass through to the focused terminal (unchanged);
      **Canvas** Shift+arrow spatial navigation is unchanged.
- [ ] The Overview wall renders identically after the ordering extraction (no visual
      or ordering regression).
- [ ] New unit tests for the ordering function and the adjacency helper pass.
- [ ] `npm run build`, `npm run lint`, `npm test`, `npm run format:check`,
      `cargo test`, and `npm run lint:rust` all pass.

**Notes**

- **User decisions (refine Q&A, 2026-06-26):**
  - **Scope = Overview only.** Canvas already navigates every panel kind
    (`moveCanvasFocus` → `collectLeaves`/`spatialNeighbor`); the user chose not to touch
    it. The defect is specific to the Overview wall's agent-only `adjacentSessionId` nav.
  - **Axis = Left/Right only.** ←/→ navigate all columns; Shift+↑/↓ keep passing through
    to a focused terminal. Chosen because the wall is a single horizontal row and to
    avoid stealing Shift+↑/↓ from claude/shell scrollback.
- **Assumptions (reasonable defaults, not separately confirmed):**
  - **Wrap-around** at the ends and **"no selection → first column"** are preserved from
    the existing `adjacentSessionId` behavior for consistency.
  - "Select" keeps its current meaning — highlight the column frame + scroll it into
    view (and keep the sidebar/Canvas `selectedId` in sync, #79). No new side effect is
    added.
- **Grounding references:**
  - `src/useKeyboardNav.ts` — the global key handler; the Overview branch (`state.view
    === "overview"`, the `ArrowLeft`/`ArrowRight` block) is what changes. The Canvas
    branch (`state.view === "canvas" || !IS_MAIN_WINDOW` → `moveCanvasFocus`) and the
    `newSessionOpen` guard stay as-is.
  - `src/store.ts` — `adjacentSessionId` (~line 198) and `mergeRepoOrder` (~line 184)
    are the existing pure, exported, tested helpers to sit beside; `select` (sets
    `selectedId`); `moveCanvasFocus` (Canvas nav, for reference — already all-kinds).
  - `src/components/Overview/Overview.tsx` — the `clusters` ordering block (~lines
    524–617: `effectiveRepo` grouping, `panelsByCluster`/`clusterRepoOf` worktree
    attribution, `repoList` sort, `mergeRepoOrder`, empty-cluster `.filter`), the
    `ColumnItem` union (agent | panel | schedule), `PanelColumn` (`data-item-id`,
    `cardSelected`), and the `selectedId` scroll-into-view `useEffect`.
  - `src/paths.ts` — `effectiveRepo`, `repoName` (used by the ordering).
  - `src/store.test.ts` — existing `mergeRepoOrder` tests; add the new tests here.
- **Verification limit:** the autonomous/agent implementer should runtime-check the
  keyboard nav in `npm run tauri dev` if possible; otherwise rely on the unit tests of
  the ordering/adjacency plus the existing per-column selection rendering (which already
  ships and works for clicks).
