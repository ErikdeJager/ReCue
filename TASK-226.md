### 226. [x] Replace the agent-header "worktree" badge with a folder + branch indicator (every agent)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

On an agent's header (Overview card + Canvas panel), **remove the "worktree" badge**
(#213) and instead show a **folder + branch indicator for every agent** — the folder and
branch that specific agent is working on — mirroring how a **Kanban / file panel header
shows `folder · branch`**. So every agent header reads e.g. `myrepo · main`, and a
worktree agent reads `myrepo · feature-x` (its repo + isolated branch) rather than a
separate "worktree" tag.

**Grounding:**

- **Overview agent header** (`src/components/Overview/Overview.tsx`, `SessionCard`,
  ~lines 225-245): renders the agent name (`primary` from `sessionLabel`), then a
  **worktree badge gated on `session.worktreeParent`** (`styles.worktreeBadge`, #213/#96),
  then a **fork badge** gated on `session.forkedFrom`. It does **not** show folder·branch.
  `branch` is available (`branches[session.repoPath]`, passed at ~line 757).
- **Canvas agent header** (`src/components/Canvas/CanvasSurface.tsx`, `LeafPanel`,
  ~lines 108-131, 270-285): for agents it computes `agentLabel` (the name) and
  **explicitly sets `metaText = null`** (lines ~130-131) — so agents show **no**
  folder·branch — then renders the worktree badge (gated `content.kind === "agent" &&
  session?.worktreeParent`) and the fork badge. `repoPath = content.repoPath ??
  session?.repoPath`; `branch = branches[repoPath]`.
- **The pattern to mirror** (non-agent panels already do this):
  - Overview `ExtraPanel` (~lines 398-403): `<span className={styles.meta}><span
    className={styles.metaText}>{repoName(repoPath)}{branch && ` · ${branch}`}</span></span>`
    (CSS `.meta`/`.metaText` in `Overview.module.css:212-226` — muted, mono,
    `--fs-meta-sm`, ellipsis).
  - Canvas `LeafPanel` (~line 274): `{metaText && <span
    className={styles.panelMeta}>{metaText}</span>}` where for non-agents `metaText =
    `${repoName(repoPath)}${branch ? ` · ${branch}` : ""}`` (CSS `.panelMeta` in
    `Canvas.module.css:341-348`).
- **Per-session folder + branch** (`src/paths.ts`): `repoName(path)` = last path segment
  (splits on `/` or `\`); `effectiveRepo(session)` = `worktreeParent ?? repoPath` (#96);
  branch = `branches[session.repoPath]` (the worktree's own branch for a worktree agent,
  #212/#74).
- **The worktree badge today** is rendered in exactly two agent-header sites (Overview +
  Canvas), both gated on `worktreeParent`; the `worktreeBadge` CSS class is **also** used
  by the **fork** badge and the **ScheduleCard** (Overview ~lines 479-481, a #218
  scheduled-session badge).

**Decided approach (autonomous — see Notes/ASSUMPTIONS.md):**

1. **Remove the worktree badge from both agent-header sites** (the
   `session.worktreeParent`-gated `worktreeBadge` in Overview `SessionCard` and Canvas
   `LeafPanel`). **Keep the `worktreeBadge` CSS class** (still used by the fork badge +
   ScheduleCard).
2. **Show a folder + branch indicator for every agent** in both headers, styled like the
   non-agent panels:
   - **Folder = `repoName(effectiveRepo(session))`** — the **parent repo** name for a
     worktree agent (so it reads "myrepo", not the sanitized worktree-folder basename),
     and the repo itself for a normal agent.
   - **Branch = `branches[session.repoPath]`** — the agent's actual current branch (the
     worktree's branch for a worktree agent).
   - Render `${folder}${branch ? ` · ${branch}` : ""}` using the existing `.meta`/
     `.metaText` (Overview) and `.panelMeta` (Canvas) classes (muted, mono, truncating).
   - Overview: add the `.meta` span in `SessionCard`'s title area (after the name / fork
     badge), mirroring `ExtraPanel`.
   - Canvas: **stop nulling `metaText` for agents** — compute it for agents too
     (`repoName(effectiveRepo) · branch`), so the existing `{metaText && …}` render shows
     it.
3. **Keep the fork badge** (`session.forkedFrom`) — it's a distinct provenance marker
   (a fork shares the source's title), not the worktree concept the card targets.

**Out of scope:**

- The **ScheduleCard** "worktree" badge (Overview ~lines 479-481), freshly added for a
  scheduled session by #218 — the card is about **agent** headers, and a scheduled card
  already shows `repoName(cwd) · branch` in its meta. Leave it (a later task can reconcile
  scheduled cards if desired). Note: removing the agent worktree badge while keeping the
  scheduled one is an accepted, deliberate scope boundary.
- The **fork** badge (kept).
- The sidebar (this is Overview + Canvas headers only; the sidebar's own worktree
  sub-grouping/header is unrelated and unchanged).
- The repo color band/dot (unchanged); no new "worktree"-ness marker is added — per the
  card, folder + branch *is* the new indicator.

**Cross-platform (hard requirement):** pure frontend; `repoName`/`effectiveRepo` already
split on `/` or `\` (#143); no OS-specific code; renders identically on macOS and Windows.

**Subtasks**

1. [ ] **Overview `SessionCard`** (`Overview.tsx`): remove the `worktreeParent`-gated
   `worktreeBadge`; add a `.meta`/`.metaText` folder·branch indicator
   (`repoName(effectiveRepo(session))` + `branch`) shown for every agent, after the name
   (keep the fork badge). Import `effectiveRepo` if not already.
2. [ ] **Canvas `LeafPanel`** (`CanvasSurface.tsx`): compute `metaText` for agents
   (`repoName(effectiveRepo(session))` + `branch`) instead of `null`; remove the
   `worktreeParent`-gated `worktreeBadge` (keep the fork badge).
3. [ ] Verify both headers show `folder · branch` for normal **and** worktree agents
   (worktree shows parent repo + its branch), with proper truncation; the fork badge
   still shows for forks; the ScheduleCard is unchanged.
4. [ ] `npm run build`, `npm run lint`, `npm test`, `npm run format:check` pass.

**Acceptance criteria**

- [ ] Every agent header (Overview card + Canvas panel) shows a subtle **`folder ·
      branch`** indicator (muted/mono, like the Kanban/file panel headers), for normal
      **and** worktree agents.
- [ ] A **worktree** agent shows its **parent repo name + its worktree branch** (e.g.
      `myrepo · feature-x`), not a separate "worktree" badge and not the sanitized
      worktree-folder basename.
- [ ] The standalone **"worktree" badge is gone** from agent headers; the **fork** badge
      remains; the `worktreeBadge` CSS class is retained (fork + ScheduleCard still use it).
- [ ] The indicator stays in sync with branch changes (it reads `branches[repoPath]`,
      already refreshed per #212).
- [ ] `npm run build`, `npm run lint`, `npm test`, `npm run format:check` pass.

**Notes**

- **Autonomous decisions (user not answering; logged in `ASSUMPTIONS.md`):**
  - *Folder = `effectiveRepo` (parent repo) name, branch = `branches[repoPath]`* — so a
    worktree reads "myrepo · feature-x" (meaningful) rather than the sanitized
    worktree-folder basename ("feature-x · feature-x").
  - *Keep the fork badge* (distinct concept); *remove only the worktree badge* on agent
    headers as the card asks; the explicit "worktree" word is intentionally dropped in
    favor of folder·branch.
  - *ScheduleCard's #218 worktree badge left as-is* (agents only); accepted minor
    inconsistency, flagged for a possible follow-up.
  - *Minor redundancy when an agent has no custom name* (the name may already be the
    branch) is accepted — it matches how non-agent panels always show the folder·branch
    context line.
- **Depends on: none** — builds on shipped #213 (badge), #96 (`effectiveRepo`), #212
  (`branches`). Independent of #225 (which adds a branch badge to **sidebar folder**
  headers — a different component).
- References: `Overview.tsx:225-245` (SessionCard header), `:398-403` (ExtraPanel meta
  pattern), `:479-481` (ScheduleCard badge, out of scope), `Overview.module.css:200-226`
  (`.worktreeBadge`/`.meta`/`.metaText`), `CanvasSurface.tsx:108-131` (`metaText` for
  agents = null today), `:270-285` (badge sites), `Canvas.module.css:341-360`
  (`.panelMeta`/`.worktreeBadge`), `paths.ts:32-34`/`:57-62` (`repoName`/`effectiveRepo`),
  `sessionLabel` (`paths.ts:127-138`), store `branches`.
