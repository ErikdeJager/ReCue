# TASK-243

### 243. [ ] Give the repo's own branch line (#236) its own right-click context menu

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-28

**Description**

In the sidebar, each top-level repo "folder" group renders, on its own line below the
folder header, the repo's **current branch** — the `GitBranch` icon + branch name added
by #236 (`repoBranchLine`, `src/components/Sidebar/Sidebar.tsx` ~L1307–1328). Today that
branch line is a `<button>` with **only an `onClick`** (filter Overview to the repo) and
**no `onContextMenu`** — so right-clicking it does nothing.

This is asymmetric with a **worktree's** branch header (`WorktreeHeader`, same file
~L940–1164): a worktree's branch row *does* have a rich right-click menu (New session,
Views, Reveal, Copy absolute path, Pull, and a destructive **Close worktree**). The user
wants the **regular branch** (the repo's own branch line — i.e. the actual checked-out
directory, *not* a worktree) to get an equivalent right-click menu — but, because this is
the real repo directory rather than an app-managed worktree, it must **not** offer any
"remove"/"forget"/"close-the-tree" destructive action; the only destructive actions are
the ones that operate on the *contents* of that folder.

**Important scope decision (confirmed with the user):** the repo **folder header** already
opens a *full* context menu via `openRepoMenu` (New session, Views, Reveal, Copy path,
Pull, Change color, Kill all agents, Close all items, Forget folder — the `menu` block at
`Sidebar.tsx` ~L2098–2326). **Leave that header menu exactly as it is.** This task adds a
**new, separate menu on the branch line only**. The two menus deliberately differ: the
branch-line menu has **no "Forget folder"** (and no worktree-style "remove"), and it adds
two items the header menu lacks (**Copy branch name**, **Fetch**).

**Branch-line context menu — final contents (in order):**

1. **New session** → `startRepoSession(repo)` (mirrors the header `+` and the header
   menu's "New session"; skips the folder step for a known git folder).
2. — separator —
3. **Views** section header (`styles.menuSection`) + `<ViewsMenu repoPath={repo}
   includeNewSession={false} onClose={close} />` (the shared #164 add-view set:
   file / diff / terminal / kanban — identical to the header and worktree menus).
4. — separator —
5. **Reveal in Finder / Reveal in Explorer** → `revealPath(repo)` (label from
   `revealLabel(platform)`).
6. **Copy path** → `copyToClipboard(repo, "path")`.
7. **Copy branch name** *(new)* → `copyToClipboard(branch, "branch name")` (toasts
   "Copied branch name").
8. **Pull** → `pullFolder(repo)` (`git pull --ff-only`, #181 — the branch line only
   renders when `branches[repo]` is known, so a current branch always exists here; no
   `branches[repo] &&` guard needed inside this menu).
9. **Fetch** *(new)* → a new `fetchFolder(repo)` store action (`git fetch --prune`,
   reusing the existing `fetch_remotes` backend — see Subtask 1).
10. **Change color…** → enters an in-menu color sub-mode showing the `REPO_PALETTE`
    swatches + the custom `<input type="color">`, each calling `setRepoColor(repo, hex)`
    — a verbatim copy of the header menu's `menuMode === "color"` block
    (`Sidebar.tsx` ~L2113–2145).
11. — separator —
12. **Kill all agents** *(destructive)* → `killAllAgents(repo)`. Shown **only** when the
    repo has running agents (count includes worktree agents — see the gating note below).
    Confirm-gated by `settings.confirmDestructive` (mirror the header menu's
    `confirm-kill` step: "Kill N agent(s)?").
13. **Close all items** *(destructive)* → `closeAllItems(repo)`. Shown when the repo has
    any agents or panels. Confirm-gated only when agents are running (mirror the header
    menu's `confirm-close` step: "Close all items (kill N agents)?").

**Explicitly NOT in this menu:** no "Forget folder" (#31), no worktree-style "Close
worktree"/remove, no other folder-removal affordance. (Forget folder remains reachable via
the unchanged repo **header** menu, so no capability is lost.)

**Out of scope:**
- Any change to the repo **header** context menu (`openRepoMenu` / the `menu` block) — it
  stays byte-for-byte as is.
- Any change to the **worktree** header menu.
- Adding the new "Copy branch name" / "Fetch" items to the header menu (they live on the
  branch-line menu only, per the confirmed scope).
- New backend git commands — "Fetch" reuses the existing `fetch_remotes` command.
- The collapsed sidebar rail (the branch line isn't rendered there).
- The other Refine cards (Kanban editing) — unrelated.

**Subtasks**

1. [ ] **Add a `fetchFolder` store action** (`src/store.ts`), mirroring `pullFolder`
   (~L3694):
   - Signature on the store interface (near `pullFolder` ~L1188–1191):
     `fetchFolder: (cwd: string) => Promise<void>;` with a short doc comment.
   - Implementation: `await ipc.fetchRemotes(cwd)` (the existing IPC wrapper in
     `src/ipc.ts` ~L324, `invoke<void>("fetch_remotes", { cwd })`, which surfaces git's
     stderr as a thrown error — the Rust `fetch_remotes`/`git::fetch_remotes` returns
     `Result<(), _>` and errors on non-zero status). On success `pushToast("Fetched <repo
     name>")` (use `repoName(cwd)` for a friendly label); on a thrown error
     `pushToast(<message>, "error")`. After a successful fetch, call the existing
     `refreshBranches()` so any branch movement is reflected. No new Rust, no new capability
     (the command is already registered + permitted for the #180 branch picker).
2. [ ] **Extract the branch line into a self-contained component** — e.g. `RepoBranchLine`
   — in `Sidebar.tsx`, mirroring the `WorktreeHeader` pattern (own `useRowMenu()` +
   local mode state + an inline `styles.menu` overlay). Props: `repo: string`,
   `branch: string`, `isFiltered: boolean`. Move the existing branch-line `<button>`
   markup (the `repoBranchLine` button, its `GitBranch` icon, `repoBranchText`, the
   filter `onClick`, `aria-pressed`, titles) into it verbatim, and add
   `onContextMenu={openMenu}` to the button. In `RepoGroup`, keep the existing
   `{branches[repo] && ( ... )}` guard and render `<RepoBranchLine repo={repo}
   branch={branches[repo]} isFiltered={isFiltered} />` in place of the inline button.
3. [ ] **Implement the menu** inside `RepoBranchLine`, reusing existing styles
   (`styles.menu`, `menuOverlay`, `menuItem`, `menuItemDanger`, `menuSection`,
   `menuSeparator`, `menuDanger`, `colorPicker`, `swatches`, `swatch`, `swatchActive`,
   `customColor`) — **no new CSS expected**. Use a local mode state
   (`"menu" | "color" | "confirm-kill" | "confirm-close"`, default `"menu"`) exactly
   mirroring the header menu's `menuMode` minus the `confirm` (forget) mode. Render the
   items in the order listed above. Pull the needed store hooks/imports:
   `startRepoSession`, `revealPath` (already an `ipc` import at the top of the file),
   `copyToClipboard`, `pullFolder`, `fetchFolder` (new), `killAllAgents`, `closeAllItems`,
   `setRepoColor`, `repoColors`, `settings.confirmDestructive`, `platform`,
   `setOverviewRepoFilter`, `setView`, plus `ViewsMenu`, `REPO_PALETTE`, `repoColor`.
4. [ ] **Wire destructive-action gating** to match the header menu's counts (computed
   inside the component from `sessions` + `overviewPanels`):
   - `runningAll` = sessions where `(s.repoPath === repo || s.worktreeParent === repo)
     && s.exitedCode === undefined` (mirrors `menuRunningAll`, `Sidebar.tsx` ~L1673).
   - `agentCount` = sessions where `s.repoPath === repo || s.worktreeParent === repo`
     (mirrors `menuAgentCount` ~L1680).
   - `panelCount` = `overviewPanels[repo]?.length ?? 0` (mirrors `menuPanelCount` ~L1685).
   - Show **Kill all agents** only when `runningAll > 0`; confirm via `confirm-kill` when
     `confirmDestructive`, else act directly. Show **Close all items** when
     `agentCount > 0 || panelCount > 0`; confirm via `confirm-close` only when
     `confirmDestructive && runningAll > 0`, else act directly. (Copy the header menu's
     logic at `Sidebar.tsx` ~L2269–2304 and confirm buttons ~L2158–2185.)
5. [ ] **Confirm the click-vs-context-menu interaction:** a left-click on the branch line
   must still filter Overview (unchanged); a right-click must `event.preventDefault()` +
   `stopPropagation()` (already handled by `useRowMenu.openMenu`) and open the new menu.
   The branch line is a sibling of `repoHeader` (which carries the dnd-kit drag
   listeners), so the new `onContextMenu` does not interfere with folder drag-reorder
   (#211) — verify a folder can still be dragged by its header.
6. [ ] **Verify the build & lint pass** and the menu renders/behaves correctly:
   `npm run build`, `npm run lint`, `npm test`, `cargo test --manifest-path
   src-tauri/Cargo.toml` (the last only if you touched Rust — you should not need to).

**Acceptance criteria**

- [ ] Right-clicking a repo's **branch line** (the GitBranch + branch-name line under the
  folder header) opens a context menu; right-clicking elsewhere on the header still opens
  the unchanged full repo menu.
- [ ] The branch-line menu contains, in order: **New session**, **Views** (file / diff /
  terminal / kanban), **Reveal in Finder/Explorer**, **Copy path**, **Copy branch name**,
  **Pull**, **Fetch**, **Change color…**, **Kill all agents** (when agents run),
  **Close all items** (when agents/panels exist). It contains **no "Forget folder"** and
  **no worktree-style remove**.
- [ ] **Copy branch name** copies the current branch text and toasts "Copied branch name".
- [ ] **Fetch** runs `git fetch --prune` on the folder, toasts success ("Fetched …") or
  git's error, and refreshes the sidebar branch labels on success.
- [ ] **Change color…** opens the same swatch palette + custom-color picker as the header
  menu and updates the repo color.
- [ ] **Kill all agents** / **Close all items** behave exactly like the header menu's
  equivalents, including the `confirmDestructive` confirm step and the count-based
  visibility, and never offer to forget/remove the folder.
- [ ] A left-click on the branch line still filters Overview; the folder can still be
  drag-reordered by its header (#211 unbroken).
- [ ] The repo **header** context menu, the **worktree** menu, and the branch line's
  visual appearance are all unchanged.
- [ ] **Works on both macOS and Windows.** All actions reuse existing cross-platform seams
  — `revealLabel`/`revealPath`, `copyToClipboard`, `pullFolder`, the new `fetchFolder`
  (whose `git fetch` goes through the Rust `hidden_command` `CREATE_NO_WINDOW` guard, so
  no console flash on Windows), `ViewsMenu`, `REPO_PALETTE`/`setRepoColor`. No
  OS-divergent code is added (no new keyboard shortcuts, no hardcoded paths, no raw
  shell-outs). `npm run build`, `npm run lint`, and `npm test` pass.

**Notes**

- **User-confirmed decisions (step 5 Q&A, 2026-06-28):**
  - *Menu scope:* "Branch line gets its own slim menu" — the repo **header** menu stays
    unchanged; the branch line gets a **new, separate** menu. (Yes, the two menus overlap
    heavily; this asymmetry is intentional and what the user asked for.)
  - *Destructive actions:* "Close all items + Kill all agents" — keep both, **drop
    Forget folder** (and any worktree-style remove). This satisfies the card's "the only
    destructive option should be to kill all items inside that tree" while preserving the
    existing bulk actions.
  - *Extra non-destructive options:* the user's multi-select picked **Reveal + Copy path +
    Change color** (already on the header menu), **Copy branch name** (new), and **Fetch**
    (new) — and also ticked "Just New session / Views / Pull". The last is contradictory
    with the additive picks; interpreted as "definitely keep the base three" rather than
    "exclude the rest," so the menu includes all of: New session, Views, Pull, Reveal,
    Copy path, Change color, Copy branch name, Fetch.
- The branch line only renders for a **git folder with a known current branch**
  (`branches[repo]`), so this menu naturally never appears for a non-git folder — Pull /
  Fetch / Copy-branch-name always have a real branch to act on.
- The card itself said "Investigate what other options I may have missed and ask about
  what content should be displayed here" — hence the up-front clarifying questions; the
  resolved contents above are the answer.
- Reference points in `src/components/Sidebar/Sidebar.tsx`: branch line ~L1307–1328;
  `WorktreeHeader` (the pattern to mirror) ~L940–1164; the header repo menu (counts +
  color mode + destructive steps to copy) ~L1666–1685 and ~L2098–2326; `useRowMenu`
  ~L77–96. Store: `pullFolder` ~L3694, `copyToClipboard` ~L3685 (`store.ts`); IPC
  `fetchRemotes` ~L324 (`ipc.ts`). Backend `fetch_remotes` → `git::fetch_remotes`
  (`git.rs` ~L383, already `hidden_command`-guarded; `commands.rs` ~L1006).
- Pre-existing limitation worth a glance: `useRowMenu` clamps the menu position to
  `window.innerHeight - 96`; this menu is roughly as tall as the header repo menu, so
  verify it doesn't clip off-screen near the sidebar bottom (the header menu shares this
  clamp and is acceptable — match its behavior).
