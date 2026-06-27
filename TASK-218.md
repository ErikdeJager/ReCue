### 218. [x] Nest scheduled worktree sessions under a worktree sub-group (sidebar) + worktree badge on Overview

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

When a session is **scheduled for a worktree** — via the worktree button or
**Ctrl/⌘+Enter** in the schedule step of the new-session modal — the pending
scheduled item shows up under the **regular in-folder location** of the parent repo
in the sidebar, instead of nested under a **worktree** sub-group the way a **live**
worktree agent does. This task makes a scheduled worktree session nest under a
worktree sub-group in the sidebar (with the full worktree header), and adds the
missing "worktree" badge on its Overview card so it reads as a worktree everywhere a
live worktree agent does.

**Why it happens (grounding):**

- A **live** worktree agent is a `PersistedSession` (`src-tauri/src/store.rs`, TS
  mirror `src/types/index.ts` — has `worktree_parent?`) whose `repo_path` is the
  isolated **worktree folder** and `worktree_parent` is the **parent repo**. The
  sidebar nests it via:
  - `src/components/Sidebar/Sidebar.tsx:1174-1175` —
    `worktreeAgents = sessions.filter(s => s.worktreeParent === repo)` and
    `worktreePaths = unique(worktreeAgents.map(s => s.repoPath))`.
  - `Sidebar.tsx:1280-1316` — each worktree path renders a `WorktreeHeader` +
    its agent rows.
- A **scheduled** worktree session is a `ScheduledSession`
  (`store.rs:108-139`, TS `src/types/index.ts`) that stores only
  `cwd = <parent repo>` plus a `worktree: bool` flag and the `branch` /
  `create_branch` / `branch_base` intent — **no worktree path**. The worktree folder
  is created only at **fire time** (`prepare_worktree_for_schedule`,
  `src-tauri/src/commands.rs:896-917`).
- The sidebar groups schedule rows by the **parent repo**:
  `Sidebar.tsx:1263-1275` → `schedules.filter(s => s.cwd === repo)`. With no worktree
  path, a worktree schedule therefore lands in the **parent repo group**, never a
  worktree sub-group. The worktree sub-group rendering (`Sidebar.tsx:1280-1316`)
  iterates **live agents only**, so it never includes schedules.

**The fix is enabled by a key fact:** the worktree destination path is
**deterministic and fully computable at schedule time** — `worktree_path(store, cwd,
branch)` (`src-tauri/src/commands.rs:1069-1082`) depends only on `store.data_dir()`,
the parent-repo path, and the branch name (all known when the schedule is created,
including for a `create_branch` new branch, since the new branch name is stored on the
schedule). Fire time already computes the same path
(`prepare_worktree_for_schedule` → `worktree_path(store, &sched.cwd, branch)`,
`commands.rs:905`). So we can compute + persist that path on the `ScheduledSession` at
creation, and the sidebar can nest the schedule under a worktree sub-group keyed by
that path — the **same key** the live session will use after it fires (so the
scheduled sub-group seamlessly becomes the live one, no duplicate).

**Scope (decided with the user):**

1. **Sidebar nesting** — a worktree schedule nests under a worktree sub-group keyed by
   its computed worktree path, rendered with the **full existing `WorktreeHeader`**
   (branch label + "worktree" cue + open-view `+` + context menu Reveal / Copy path /
   Pull / New session / Close worktree). Reuse is intentional even though the worktree
   folder doesn't exist on disk until fire time: Copy path works; Reveal / Pull /
   Close-worktree are best-effort and already toast on failure. (User chose "Reuse
   full WorktreeHeader".)
2. **Overview consistency** — add the static **"worktree" badge** to the Overview
   `ScheduleCard` header (`src/components/Overview/Overview.tsx` `ScheduleCard`,
   ~lines 462-510) when `schedule.worktree`, mirroring the live worktree agent's card
   badge (`Overview.tsx:240-241`, `styles.worktreeBadge`). The Canvas/sidebar rich
   **`ScheduledPanel` already renders this badge** (`ScheduledPanel.tsx:122-123`) — no
   change needed there; just confirm it stays. (User chose "Also badge Overview +
   ScheduledPanel".)

**Out of scope:**

- Changing **when** the worktree folder is physically created — it stays created at
  **fire time** (`prepare_worktree_for_schedule`). This task only makes the *pending*
  item display nest correctly; it does not pre-create the worktree on disk.
- Any change to non-worktree scheduled sessions (they keep grouping under their repo
  by `cwd`).
- The sidebar `ScheduleRow` itself does **not** gain a separate "worktree" badge — the
  surrounding `WorktreeHeader` already supplies the worktree cue.
- Overview/Canvas **clustering** is unchanged: both live worktree agents and scheduled
  sessions already cluster under the parent repo via `effectiveRepo` (`src/paths.ts`),
  which is correct; only the Overview card **badge** is added.

**Cross-platform (hard requirement):** introduce **no** new OS-specific code. The
worktree path is computed entirely backend-side by the existing `worktree_path` helper
(already uses `sanitize_seg` / `windows_safe_seg` and `store.data_dir()`), so the
stored path is OS-native (backslashes on Windows). The sidebar groups by **string
equality** of that path and labels via `repoName(wt)` which already splits on `/` or
`\` (`src/paths.ts`, #143). Verify the fix walks identically on macOS and Windows: the
fired live session's `repo_path` must be **byte-identical** to the schedule's stored
`worktree_path` so the sub-group key matches after firing (it will, since both go
through `worktree_path`).

**Subtasks**

1. [ ] **Backend — persist the worktree path on the schedule.**
   - In `src-tauri/src/store.rs`, add a field to `ScheduledSession`:
     `worktree_path: Option<String>` with a serde default (`#[serde(default)]`) so
     older `sessions.json` records load as `None`.
   - In `src-tauri/src/commands.rs` `create_schedule`, when `worktree == true` and a
     non-empty `branch` is present, compute `worktree_path(store, &cwd, &branch)` and
     store it as `Some(path_string)` on the new `ScheduledSession` (leave `None`
     otherwise). `create_schedule` already holds `store: State<'_, Store>`, so
     `store.data_dir()` is available. Note `worktree_path` returns a `PathBuf` — use
     `.to_string_lossy().to_string()`.
   - In `prepare_worktree_for_schedule` (`commands.rs:896-917`), **prefer the stored
     `sched.worktree_path`** when present (fall back to recomputing
     `worktree_path(...)` if `None`, for old records). This guarantees fire-time and
     create-time paths stay identical, so the fired live session's `repo_path` matches
     the schedule's stored path and the sub-group merges cleanly.
2. [ ] **TS type mirror.** Add `worktree_path?: string | null` to the
   `ScheduledSession` interface in `src/types/index.ts` (snake_case, matching the
   other fields `fire_at` / `created_at` / `create_branch` / `branch_base` — these are
   serialized as-is from Rust serde, no camelCase transform).
3. [ ] **Sidebar — nest worktree schedules under a worktree sub-group**
   (`src/components/Sidebar/Sidebar.tsx`, the `RepoGroup` render ~lines 1163-1316):
   - Compute the set of scheduled worktree sessions for this repo:
     `schedules.filter(s => s.cwd === repo && s.worktree && s.worktree_path)`.
   - Build `worktreePaths` from the **union** of live worktree agents' `repoPath`
     (existing `worktreeAgents`) **and** those schedules' `worktree_path` (deduped),
     so a worktree that currently has only a scheduled session still gets a sub-group.
   - Change the **parent-repo** schedule filter (`Sidebar.tsx:1263-1275`) to **exclude**
     worktree schedules that have a `worktree_path`:
     `schedules.filter(s => s.cwd === repo && !(s.worktree && s.worktree_path))` — so a
     worktree schedule no longer renders at the parent level.
   - In the worktree sub-group map (`Sidebar.tsx:1280-1316`), for each worktree path
     `wt`, also render `<ScheduleRow>`s for
     `schedules.filter(s => s.worktree_path === wt)` (alongside the existing live
     `wtAgents` rows). Keep `selectItem({ kind: "scheduled", id: s.id, repoPath: s.cwd })`
     for the schedule row's `onOpen` (its logical home is still the parent repo
     identity).
   - `WorktreeHeader` props for a sub-group: `path = wt`; `branch` should prefer the
     live `branches[wt]` when known, else fall back to the schedule's `branch` (so a
     not-yet-fired worktree shows the real branch, not the sanitized folder basename);
     `parent = wtAgents[0]?.worktreeParent ?? <a scheduled session's cwd for this wt>`;
     `agentCount = wtAgents.length`.
4. [ ] **Overview — worktree badge on the schedule card.** In
   `src/components/Overview/Overview.tsx` `ScheduleCard` (~lines 462-510), render a
   static `<span className={styles.worktreeBadge}>worktree</span>` in the card header
   when `schedule.worktree` (mirror the session card at `Overview.tsx:240-241`; the
   `worktreeBadge` class already exists in `Overview.module.css`).
5. [ ] **Confirm ScheduledPanel** still shows its existing worktree badge
   (`ScheduledPanel.tsx:122-123`) — no change expected; just verify it renders for a
   worktree schedule on the Canvas panel and any sidebar rich-panel surface.
6. [ ] **Tests.**
   - Extend the Rust serde round-trip test in `store.rs` (~lines 942-964) to cover
     `worktree_path`: a record with `Some(path)` round-trips, and an older record
     **without** the field loads as `None`.
   - If practical, extract the worktree-path **union** grouping into a small pure
     helper (e.g. in `src/paths.ts` or a Sidebar-local pure function) and add a Vitest
     asserting: a live agent + a schedule on the same path collapse to one sub-group;
     a schedule-only path produces a sub-group; non-worktree schedules stay at the
     parent level. If extraction is disproportionate, rely on `npm run build`
     type-check + the manual checks below and say so.
7. [ ] **Lint/format/build green:** `npm run build`, `npm run lint`,
   `npm test`, `npm run lint:rust`, `cargo test --manifest-path src-tauri/Cargo.toml`.

**Acceptance criteria**

- [ ] Scheduling a session for a **worktree** (worktree button or Ctrl/⌘+Enter in the
      schedule step) shows the pending item **nested under a worktree sub-group** in
      the sidebar — under a `WorktreeHeader` for the target branch — not at the parent
      repo's in-folder level.
- [ ] When that schedule **fires**, the resulting **live** worktree agent appears in
      the **same** worktree sub-group (no duplicate sub-group, no orphaned scheduled
      row) — because the fired session's `repo_path` equals the schedule's stored
      `worktree_path`.
- [ ] A **non-worktree** scheduled session is unchanged: it still groups under its
      repo by `cwd`.
- [ ] The scheduled session's **Overview card** shows a static "worktree" badge when
      it's a worktree schedule, matching a live worktree agent's card; the
      `ScheduledPanel` (Canvas/sidebar rich panel) continues to show its worktree badge.
- [ ] `ScheduledSession` carries `worktree_path` (Rust + TS); older persisted
      schedules without the field load cleanly (`None` / undefined) and behave as
      before (worktree schedules created **before** this change have `worktree_path =
      None`, so they keep grouping at the parent level until re-created — acceptable,
      and they still fire correctly via the recompute fallback).
- [ ] No new OS-specific code; the path is computed by the existing cross-platform
      `worktree_path` helper, grouping is string/path-key based, and the change is
      verified to behave identically on macOS and Windows.
- [ ] All test/lint/build commands above pass.

**Notes**

- **User decisions (step 5):**
  - *Worktree header for a not-yet-fired worktree:* **reuse the full `WorktreeHeader`**
    (branch + worktree cue + open-view + context menu). Reveal/Pull/Close-worktree are
    best-effort and toast on failure while the folder doesn't exist yet; Copy path
    works. (Chosen over a lighter scheduled-only header.)
  - *Scope:* **also add the "worktree" badge to the Overview schedule card** (and keep
    the ScheduledPanel badge) for full consistency, in addition to the sidebar nesting.
    (Chosen over sidebar-only.)
- **Assumptions:**
  - The `ScheduledPanel` edit flow (`update_schedule`, #94) edits only launch time /
    name / prompt (and cancel) — it does **not** change `branch` / `worktree` — so the
    stored `worktree_path` cannot go stale after creation. If a future change lets the
    user edit the branch of a worktree schedule, recompute `worktree_path` there too.
  - The fire-time fallback (recompute when `worktree_path` is `None`) keeps
    pre-existing schedules working; only the *nesting* is unavailable for schedules
    created before this change (they show at the parent level, as today).
- **Key references:** `store.rs:108-139` (struct), `store.rs:942-964` (serde test),
  `commands.rs:723-761` (`create_schedule`), `commands.rs:896-917`
  (`prepare_worktree_for_schedule`), `commands.rs:1069-1082` (`worktree_path`),
  `Sidebar.tsx:1163-1316` (repo group + worktree nesting + schedule rows),
  `Overview.tsx:462-510` (`ScheduleCard`), `Overview.tsx:240-241` (live worktree
  badge), `ScheduledPanel.tsx:120-123` (existing badge), `src/paths.ts`
  (`effectiveRepo` / `repoName`, cross-platform `splitPath`).
