# TASK-247

### 247. [ ] Overview filter: clicking the repo's own branch line shows only that branch (hide worktrees)

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-28

**Description**

The sidebar has three click-to-filter affordances that narrow the **Overview** wall, and
the user wants them to mean three **different** things:

1. **Click a repo folder header/name** → show **everything** for that folder: the repo's
   own agents **and** all its worktree agents. *(current behavior — keep it.)*
2. **Click a worktree branch** (a `WorktreeHeader` name) → show **only that worktree's**
   agents. *(current behavior — keep it.)*
3. **Click the repo's own branch line** — the #236 `repoBranchLine` (GitBranch icon +
   branch name on its own line under the folder header; "the branch indicator that is not
   a worktree, but the branch inside the directory") → show **only that branch**, i.e. the
   repo's **own (non-worktree) directory agents**, with **all of its worktrees hidden**.
   *(NEW — this is the change.)*

**The problem:** today #1 and #3 are identical. Both the folder name (`Sidebar.tsx`
RepoGroup ~L1276–1279) and the branch line (~L1311–1314) call `setOverviewRepoFilter(repo)`
with the same repo path, and the filter predicate (`sessionInFilter`, `paths.ts` ~L111–117)
matches the repo's own agents **and** its worktree agents (a worktree agent's
`effectiveRepo` is its parent repo). So clicking the branch line shows everything, exactly
like clicking the folder — there's no way to say "just this directory's branch, hide the
worktrees."

**Root cause / why a model change is needed:** the Overview filter is a single
`overviewRepoFilter: string | null` (a folder path). For a **repo path**, the same value
has to mean two different things now — "all (incl. worktrees)" when it came from the folder
header, vs "own only (excl. worktrees)" when it came from the branch line. A bare path
can't carry that intent, so the filter needs a **mode/scope** alongside the path.

**How the filter currently works** (so the implementer can keep #1/#2 byte-for-byte):
- `sessionInFilter(session, filter)` (`paths.ts` ~L111): `!filter` → all; else
  `effectiveRepo(session) === filter || session.repoPath === filter`. A **repo** filter
  matches own agents (both clauses) **and** worktree agents (their `effectiveRepo` =
  parent). A **worktree** filter matches only that worktree's agents (`repoPath ===
  filter`).
- The shared pure `overviewClusters({ sessions, overviewPanels, overviewOrder, schedules,
  filter })` (`store.ts` ~L359) builds the visible columns + keys and is consumed by **both**
  the Overview wall (`Overview.tsx` ~L672) **and** the keyboard nav (`useKeyboardNav.ts`),
  so the filter must be applied **there** (one source of truth) — not just in the
  component. It uses `sessionInFilter` for agents and a `folderInFilter(folder)` predicate
  (~L379) for panels/schedules (a worktree-path panel maps to its parent cluster via
  `clusterRepoOf`).
- `overviewRepoFilter` is **transient** (not persisted: default `null` on load, only read
  at runtime — `store.ts` L711/L1492; `forgetRepo` clears it at ~L3585), so **no migration
  is required**.

**Goal:** introduce a filter **mode** (`"all" | "own"`) so:
- Folder header click → `{ path: repo, mode: "all" }` (everything — current).
- Branch-line click → `{ path: repo, mode: "own" }` (repo's own non-worktree agents +
  the repo's own directory panels/schedules; worktree agents, worktree-path panels, and
  worktree schedules hidden).
- Worktree name click → `{ path: worktreePath, mode: "all" }` (only that worktree — current;
  mode is irrelevant for a worktree path since it has no sub-worktrees).

**Scope (decided defaults — see Notes; the card fully specifies the core, these are the
natural secondary choices):**
- The **"own"** filter hides **worktree agents**, **worktree-path panels** (file/diff/
  terminal/kanban viewers opened on a worktree), and **worktree schedules**
  (`scheduleNestsUnderWorktree`). It **keeps** the repo's own directory agents, the repo's
  own panels (`overviewPanels[repo]`), and the repo's own schedules.
- The filter only affects the **Overview wall** (and its keyboard nav). The **sidebar tree
  is not filtered** — it always shows every folder, branch line, and worktree (the card
  says "filter overviewmode", triggered *from* the left panel).
- Active-state highlight: the **folder header** highlights only for `mode: "all"`; the
  **branch line** highlights only for `mode: "own"`; a worktree header highlights when the
  filter path equals its path. (Today a single `isFiltered` highlights both header and
  branch line — split it.)

**Out of scope:**
- The branch line's **right-click** menu (that's TASK-243; this card only changes the
  **left-click** filter). They touch the same element via different handlers — no conflict.
- Persisting the filter across restarts (it's transient today; keep it transient).
- Any change to folder-filter (#1) or worktree-filter (#2) behavior beyond carrying the
  new `mode` field.

**Subtasks**

1. [ ] **Define the filter type.** In the appropriate shared module (e.g. `paths.ts` next
   to `sessionInFilter`, or `store.ts`), add
   `export type OverviewFilter = { path: string; mode: "all" | "own" } | null;` and use it
   everywhere `overviewRepoFilter` is typed. (Chosen over a parallel `mode` field to keep a
   single source of truth.)
2. [ ] **Store** (`src/store.ts`):
   - Change `overviewRepoFilter: string | null` → `OverviewFilter` (field ~L711, default
     `null` ~L1492).
   - Change `setOverviewRepoFilter` to `(path: string | null, mode?: "all" | "own") =>
     void` (default `mode = "all"`). Toggle semantics: if the current filter has the **same
     path AND same mode**, clear to `null`; otherwise set `{ path, mode }`. (So clicking the
     branch line while the folder "all" filter is active **switches** to "own"; clicking the
     same affordance again clears.)
   - Update `overviewClusters` (~L359): change `filter: string | null` →
     `OverviewFilter`; make `folderInFilter` and the `shown`/schedule/panel predicates
     **mode-aware** — for `mode: "own"`, a folder matches only when `folder === filter.path`
     (so worktree-path panels/schedules are excluded), and agents come from the mode-aware
     `sessionInFilter`; for `mode: "all"`, keep today's logic (`folder === filter.path ||
     clusterRepoOf(folder) === filter.path`). Ensure schedules are filtered the same way
     (a `scheduleNestsUnderWorktree` schedule is hidden under "own").
   - Update the `forgetRepo` cleanup (~L3585): compare `s.overviewRepoFilter?.path ===
     repoPath` instead of `=== repoPath`.
3. [ ] **Predicate** (`src/paths.ts`): change `sessionInFilter(session, filter:
   OverviewFilter)`:
   - `!filter` → `true`.
   - `filter.mode === "own"` → `session.repoPath === filter.path && !session.worktreeParent`.
   - else (`"all"`) → `effectiveRepo(session) === filter.path || session.repoPath ===
     filter.path` (unchanged logic).
4. [ ] **Sidebar** (`src/components/Sidebar/Sidebar.tsx`):
   - Folder name `onClick` (RepoGroup ~L1276) → `setOverviewRepoFilter(repo, "all")`.
   - Branch line `onClick` (~L1311) → `setOverviewRepoFilter(repo, "own")`.
   - Worktree name `onClick` (WorktreeHeader ~L1004) → `setOverviewRepoFilter(path, "all")`.
   - Replace the single `isFiltered` in RepoGroup with two: `folderActive =
     filter?.path === repo && filter.mode === "all"` (drives `repoActive` on the header +
     its `aria-pressed`) and `branchActive = filter?.path === repo && filter.mode ===
     "own"` (drives `repoBranchActive` on the branch line + its `aria-pressed`). In
     WorktreeHeader, `isFiltered = filter?.path === path`.
   - Update every `overviewRepoFilter` read in the file to the new shape.
5. [ ] **Overview** (`src/components/Overview/Overview.tsx`): thread the `OverviewFilter`
   through (the local `shown` at ~L627 already flows through the updated `sessionInFilter`;
   the columns flow through the updated `overviewClusters`). Update the **filter bar label**
   (~L722–735): `mode: "all"` → `Showing <repoName(filter.path)>` (unchanged); `mode:
   "own"` → `Showing <repoName(filter.path)> · this branch` (conveys worktrees hidden).
   "Show all" still calls `setOverviewRepoFilter(null)`.
6. [ ] **Keyboard nav** (`src/useKeyboardNav.ts`): update its `overviewClusters` call / any
   filter typing to the new `OverviewFilter` so the wall and Shift+←/→ nav stay in sync.
7. [ ] **Tests:** update and extend `src/paths.test.ts` (`sessionInFilter`) and
   `src/store.test.ts` (`overviewClusters`) for the new `{ path, mode }` filter — add cases
   proving `mode: "own"` excludes worktree agents/panels/schedules while `mode: "all"`
   keeps them, and that folder/worktree filters are unchanged.
8. [ ] Run `npm run build`, `npm run lint`, `npm test`, and verify manually: with a repo
   that has both in-directory agents and a worktree, clicking the folder shows both,
   clicking the branch line shows only the in-directory agents (worktree column gone),
   clicking the worktree shows only the worktree; the active highlight tracks the right
   element; "Show all" clears.

**Acceptance criteria**

- [ ] Clicking the repo **folder header/name** filters Overview to **everything** in that
  folder (own agents + worktree agents) — unchanged.
- [ ] Clicking a **worktree branch** filters Overview to **only that worktree** — unchanged.
- [ ] Clicking the repo's **own branch line** (#236) filters Overview to **only the repo's
  own (non-worktree) agents** and its own directory panels/schedules — **all worktrees of
  that repo are hidden**.
- [ ] Clicking the same affordance again clears the filter; clicking the branch line while
  the folder "all" filter is active switches to the "own" view (and vice-versa).
- [ ] The active-state highlight is on the **folder header** for the "all" filter and on the
  **branch line** for the "own" filter (not both), and on a worktree header for a worktree
  filter.
- [ ] The Overview filter bar distinguishes the two repo modes (e.g. "Showing repo" vs
  "Showing repo · this branch").
- [ ] The wall and the Shift+←/→ keyboard nav agree (both go through the updated
  `overviewClusters`); the sidebar tree itself is unfiltered.
- [ ] `npm run build`, `npm run lint`, and `npm test` (incl. updated `paths.test.ts` /
  `store.test.ts`) all pass.
- [ ] **Works on both macOS and Windows.** This is pure frontend filter/state logic and
  CSS-class toggling — no paths, shell-outs, native open/reveal, or platform key handling —
  so it behaves identically on both platforms.

**Notes**

- The card fully specifies the **core** three behaviors, so no clarifying question was
  needed on intent. Decisions made for the **unspecified secondary** details (logged here
  per the user's preference to decide-and-record during refine rather than block):
  - **Model:** a `{ path, mode: "all" | "own" }` filter object (single source of truth),
    not a parallel boolean — chosen to keep `sessionInFilter`/`overviewClusters` clean.
  - **"own" hides** worktree agents + worktree-path panels + worktree schedules; **keeps**
    the repo's own agents/panels/schedules (the "directory branch" content). This is the
    natural reading of "shows ONLY that branch, worktrees are hidden."
  - **Toggle:** clicking the branch line while folder-"all" is active switches to "own"
    (doesn't clear); clicking the active affordance again clears.
  - **Label copy** "· this branch" is a reasonable default; adjust if a clearer phrasing is
    preferred.
- `overviewRepoFilter` is transient (not persisted), so changing its type needs **no
  migration**; just update the in-memory field, setter, and the `forgetRepo` cleanup.
- This card and **TASK-243** (branch-line right-click menu) both touch the `repoBranchLine`
  element but via different handlers (`onClick` filter here vs `onContextMenu` menu there) —
  no dependency, but if both land expect a tiny merge around that element.
- Consumers to update (grep-verified): `store.ts`, `paths.ts`, `Overview.tsx`,
  `Sidebar.tsx`, `useKeyboardNav.ts`, plus `paths.test.ts` / `store.test.ts`.
- Key references: `sessionInFilter` `paths.ts:111`; `effectiveRepo` `paths.ts:57`;
  `overviewClusters` `store.ts:359`; `setOverviewRepoFilter` `store.ts:1591`; branch line
  `Sidebar.tsx:1307`; folder click `Sidebar.tsx:1276`; worktree click `Sidebar.tsx:1004`;
  Overview filter bar `Overview.tsx:722`.
