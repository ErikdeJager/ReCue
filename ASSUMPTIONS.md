# Assumptions

This file records assumptions and judgment calls made **autonomously** when the user is
not available to answer clarifying questions.

## Standing directive (2026-06-26)

The user stated they will no longer respond in the refine/loop chat. From now on, when a
question would normally go to the user, **make the best decision yourself, proceed, and
record the assumption here** (newest entries at the bottom of the relevant task section).
Each entry: what was ambiguous, the decision taken, and the rationale — enough that the
choice can be revisited later.

---

## TASK-186 — Distribute Canvas panels evenly

The user *did* answer the two refine questions before going silent (recorded in
TASK-186.md Notes): both a tab-strip button **and** a border double-click; "equal size for
every panel" semantics. The following were decided autonomously (the user delegated UX
judgment with "see if this … has good UX"):

- **Border double-click scope = the double-clicked split's subtree (region), not the whole
  canvas.** The tab-strip button equalizes the whole canvas; the border gesture evens out
  only the panels that border divides. Rationale: two distinct, learnable tools beat two
  triggers for the identical action. Trivial to switch to whole-canvas later
  (`equalizeCanvas()` vs `equalizeCanvas(node.id)`).
- **"Equal" = equal area via leaf-count weighting** (each split's sizes ∝ its children's
  leaf counts). Provably gives every panel an equal share; for a simple row it is exact
  equal widths. Chosen over per-split 50/50 (which the user explicitly rejected).
- **Sizes stored as percentages summing to 100** (e.g. `[33.33, 66.67]`) to match the rest
  of the codebase (`[50,50]`, `[70,30]`), even though react-resizable-panels would accept
  relative weights.
- **Visual update via the `Group` `groupRef` imperative `setLayout`, never a key-bump
  remount.** `defaultLayout` is initial-only; a remount would churn the #18 terminal pool.
  A guarded reconcile effect (skip when the live layout already matches) keeps user
  drag-resize a no-op and avoids feedback loops.
- **Button is main-window-only** (the tab strip doesn't exist in detached canvas windows
  #84); the border double-click is the equalize affordance there. Accepted rather than
  duplicating the button into detached windows.
- **Icon = a Lucide "even grid" glyph (`LayoutGrid`/`Grid2x2`), label "Distribute panels
  evenly."** Matches the user's own word "distribute"; final glyph left to the implementer.
- **Button disabled when the active canvas has < 2 panels** (nothing to equalize).
- **10% min-size floor accepted as-is:** equal area past ~10 panels in one nesting chain
  can't dip below each Panel's `minSize="10%"`; the library clamps. No special handling —
  fine for typical 2–6 panel canvases.

---

## TASK-187 — "Save current canvas as template"

- **Trigger = a new item in the existing ▾ Templates menu** ("Save current canvas as
  template…"), not a separate toolbar button. Most consistent with "New template…".
- **Live→block mapping reuses the registry's `liveKind`** (reverse lookup, single source of
  truth) and **reuses each leaf's existing id** so the mapper stays pure/deterministic (no
  `crypto.randomUUID`; the editor deep-clones on open and instantiation reassigns ids).
  Split `dir` + `sizes` preserved.
- **Agent blocks carry the custom session name only** — not the auto-title (#97, not a
  deliberate label) and **not a prompt** (a live agent has a conversation, not a single
  recoverable initial prompt). The user can add a prompt in the editor before saving.
- **`repoPath` dropped** from file/kanban blocks (templates are folder-agnostic; the repo is
  chosen at use time). Only the relative `file` path travels.
- **`diff` → `open-diff` is working-tree only**; a branch-compare (#81) panel is not
  preserved as a compare.
- **`scheduled`/`pending` panels are dropped** (split collapses like `removeLeaf`); a canvas
  with nothing templatable → toast + no-op (don't open an empty editor).
- **Default template name = the active canvas's tab name** (editable before Save).
- **Seeding via new `templateEditorSeed`/`templateEditorSeedName` store fields**, cleared in
  `closeTemplateEditor` (mirrors the mounted-only-while-open editor). The draft is unsaved
  until the user hits Save (consistent with "New template…").
- **Depends on: none** — the whole template system (#117/#118) is already shipped.

---

## TASK-188 — Double-click header to rename the agent

- **Renamable = agents only.** Non-agent panels (file/diff/terminal/kanban/filetree) have
  derived titles with no custom-name concept; scheduled panels have their own name editor
  (#94). Double-clicking their header is a no-op.
- **Surfaces = Canvas panel headers + Overview agent card headers** (the "drag bars"). The
  sidebar already has inline rename via its row context menu (#57) and its rows aren't
  header bars, so it's left unchanged.
- **Reuse the existing inline-rename machine** (sidebar #57 / `CanvasTabs` double-click):
  input seeds the current custom name, placeholder = the derived label, **empty commit
  clears** the custom name (reverts to auto-title/branch) via `renameSession`'s
  `trim()→null`. Enter/blur commit, Escape cancels, `committed` guard prevents double-commit.
- **Coexists with dragging** via the existing 4px PointerSensor activation distance; the
  rename `<input>` stops `pointerdown` so the header's drag listeners can't grab it.
  `preventDefault` on the double-click stops title-text selection.
- **Distinct DOM target from #186** (separator double-click = distribute evenly); the header
  double-click = rename. No conflict.
- **Depends on: none** — `renameSession`, draggable headers (#70/#144), and the inline-rename
  pattern are all shipped.

---

## TASK-189 — Keyboard-driven panel-creation modal

- **The user's literal "Cmd+1 = session" is impossible**: ⌘1–9 are already global
  canvas-jump (#76), and ⌘⇧+digit clashes with macOS screenshots (⌘⇧3/4/5). Resolution:
  - **Opener = ⌘K** (free; command-palette convention) → opens the modal at the type step.
  - **In-modal digits 1–6** select the type (primary, discoverable realization of "1=session,
    2=file…").
  - **Global ⌘⌥1–6** open the modal at the folder step for that type (the literal "individual
    panel keybind" with a free modifier; ⌘-combos never reach the PTY).
- **Type order:** 1 Session · 2 File · 3 Diff · 4 Terminal · 5 Kanban · 6 File tree — reuses
  the `ViewsMenu`/block-registry set so it stays in sync with addable types (adds **no** new
  view type, so the #82 Views-menu dependency rule is unaffected).
- **The modal orchestrates existing actions** — session → `startRepoSession(folder)` (reuses
  the #127 branch/worktree flow); file/kanban → `FilePicker` → `addOverviewPanel`/
  `createKanbanBoard`; diff/terminal/filetree → `addOverviewPanel`. No new creation logic.
- **Target step = folder**: open repos + their worktrees + recents + Browse… (reuses the
  new-session folder UX). This is the "repo or repo-worktree selection".
- **New panels land in sidebar + Overview** (Views path), draggable into Canvas; **not**
  auto-inserted into the active Canvas BSP layout (deferred to avoid a split-target decision).
- **Main-window only; inert while another modal is open.** Existing ⌘1–9 canvas-jump
  unchanged.
- **Depends on: none** — all underlying machinery is shipped.

---

## TASK-190 — Auto-update skeleton (keys deferred)

- **Reverses #62 + reuses #15.** Rebuild the removed #15 updater (git `24791c4`) as the base,
  richer (gated pipeline + sidebar box + confirm/freeze/progress + post-update toast). The
  implementer updates CLAUDE.md/README to undo the #62 "no auto-update / no pipeline" note.
- **Keys deferred → placeholder pubkey + `createUpdaterArtifacts` OFF**, so local
  `tauri build` keeps producing an **unsigned** bundle with no key (build-safety is a hard
  requirement). A later "provide signing key" task bakes the real pubkey, flips
  `createUpdaterArtifacts`, and adds the GitHub secrets — no other code change ("ready to go").
- **Pipeline guards on BOTH a version bump (from #15) AND the signing-secret presence**; ends
  early otherwise (the card's "ends early if the secret isn't present"). Draft release per
  version via `tauri-action`.
- **Indicator = a box in the sidebar footer above the Settings gear** (per the card). **Freeze
  = a full-window input-blocking `--scrim` overlay** + progress bar bound to the updater's
  download events; then `relaunch()`.
- **Post-update toast** via a persisted `lastVersion` compared to Tauri `getVersion()` on boot
  — also the hook the mock (#193) reuses.
- **Testability:** with no key/release the live download can't run; the store `update` state
  machine is shaped so the **mock task (#193) drives every state**. #190's own verification is
  build/lint/test + workflow-guard review + idle UI rendering.
- **Depends on: none** — it is the **foundation**; the other 3 update cards (settings update
  screen, patchnotes, mock) depend on #190.

---

## TASK-191 — Settings → "Updates" section

- **"Alternative settings screen" = a new "Updates" section in the existing Settings modal**
  (not a separate window), following the modal's `SECTIONS` pattern.
- **Reuses #190 entirely** (the `update` slice, `checkForUpdate`/`installUpdate`, freeze/
  progress/restart) — adds only UI + a deep-link. No new updater logic.
- **The #190 indicator deep-links here** (`setSettingsOpen(true, "updates")`), making the
  Updates pane the primary "review what will be installed → install" surface; #190's minimal
  confirm modal becomes redundant for that path (implementer reconciles — don't build two
  competing confirm surfaces).
- **"What will be installed" = a labelled slot** in this pane; the patch-notes content is
  **#192** (which renders into it).
- **Update actions are immediate** (not draft-staged), like Data & About's actions.
- **Depends on: #190.** #192 (patchnotes) depends on this #191; #193 (mock) is how these panes
  get exercised before a real signed release exists.

---

## TASK-192 — Patch notes (baked-in JSON + release-carried notes)

- **Smart solution for "read notes of a not-yet-installed update":** carry the new version's
  notes **in the release** via the Tauri updater `latest.json` `notes` / `update.body`
  (generated from that version's patch-notes JSON); the running older app renders
  `update.notes`. The baked-in JSON is the authored **source** + the current/past changelog.
- **One JSON file per version** under `src/patchnotes/<version>.json`,
  `{version,date,changes:[{category,items[]}]}`, categories feature/fix/improvement/other;
  loaded via `import.meta.glob` (eager), normalized best-effort; rendered with the existing
  react-markdown stack (no new dep).
- **Pipeline:** a guard that the bumped version has a matching patch-notes file (else end
  early) + a step that generates the release body from it (`scripts/patchnotes-to-md.mjs`).
- **Extends #190's `update` slice with a `notes` field** (populated from `update.body`),
  rendered into **#191's "What's new" slot**.
- **Depends on: #190, #191.** #193 (mock) should set `update.notes` so this view is testable
  before a real release.
- **Working-tree note:** an implementing agent was concurrently editing Canvas/store files
  (#186, since completed) — this refine staged only its own 3 files, never `-A`.

---

## TASK-193 — Dev-only mock update

- **"Insert a command" = a dev-gated `window.__recue` console helper** (`mockUpdate`/
  `mockProgress`/`mockError`/`clearUpdate`), plus an optional dev-only "Simulate update"
  button in the #191 Updates pane.
- **Dev-only via `import.meta.env.DEV`** — registered under the guard so it's absent from
  production builds (verify it's gone in `tauri build`).
- **Simulated install** = a **mock flag in `updater.ts`**: `installUpdate` animates progress
  0→100 on a timer and fires the post-update toast **without** the real plugin or a relaunch.
- **Sets `update.notes`** (the #192 field) so it exercises the patch-notes render too.
- **Depends on: #190, #191, #192** — the mock exists to test the full update UI; it drives
  every field those three add. Matches the lowest-number-first implement order.

---

## TASK-194 — Kanban optional card checkbox

- **Tri-state `Card.checked: boolean | null`** (null = no checkbox `- title`, false = `- [ ]`,
  true = `- [x]`) — minimal lossless model, chosen over a separate `hasCheckbox` flag.
- **Parse:** a plain-bullet branch tried **after** `CARD_RE` (so checkbox cards still win);
  **serialize** emits `null` as `- title` for a byte-stable round-trip.
- **Render:** `KanbanPanel` omits the `<Checkbox>` + `cardDone` for a null card (both render
  sites); still draggable/editable/deletable.
- **UI-created cards still default to `- [ ]`**; plain bullets originate from the markdown. No
  new UI to toggle a checkbox on/off. Only `- ` bullets (not `*`/`+`/numbered).
- **Depends on: none** — self-contained engine + minimal render change; independent of the
  "Clean up Kanban card UI" card (which should account for the optional checkbox).

---

## TASK-195 — Clean up Kanban card UI

- **Web-researched pattern adopted** (Trello/Linear/shadcn-kanban): **edit+delete hidden at
  rest, revealed on `.card:hover`/`:focus-within`** in a top-right cluster; **title full-width**;
  checkbox + grip kept quiet. Frees the title of the crowding action icons.
- **Keyboard/touch fallback:** reveal on `:focus-within` (not hover-only) + keep click-to-edit
  on the title, so actions never depend solely on hover.
- **Layout/CSS-only** — no dnd re-architecture, no new card content (labels/dates); all
  behavior (toggle/edit/delete/drag/body-checkboxes) preserved; `CardPreview` kept consistent.
- **Must render #194's `null` (no-checkbox) card** (title flush-left, no gap) — hence the dep.
- **Depends on: #194** — building before it would conflict on `KanbanPanel`'s checkbox render;
  lowest-number-first implements #194 first.

---

## TASK-196 — Worktree header: icon marker + inline new-session button

- **Drop the literal "worktree" text badge**; keep the existing `GitBranch` icon (already
  distinguishes a worktree from the repo's `Folder` icon #128) + an accessible "worktree"
  title. `FolderGit2` noted as a clearer alternative; minimal change keeps `GitBranch`.
- **Inline "+" mirrors the repo header's `+`** → `spawnWorktreeSession(parent, branch)` (a
  session, like the repo `+` does `startRepoSession`); disabled when the parent is unknown.
  Other panel types stay in the worktree's right-click `ViewsMenu` (#164), exactly as for repos.
- **Layout-only** beyond that; compact rail unchanged; right-click menu intact.
- **Depends on: none** — reuses shipped `spawnWorktreeSession` (#166) + the repo `+` pattern.
  Sibling worktree cards (filter-on-click, schedule-into-worktree, auto-delete guard) touch the
  same component but aren't prerequisites.

---

## TASK-197 — Click a worktree to filter Overview

- The Overview filter matches `effectiveRepo === filter`, but a worktree's `effectiveRepo` is
  its **parent** (#96) → broaden the predicate to `effectiveRepo === filter || repoPath ===
  filter` so a worktree folder can be the filter; make the worktree header name clickable →
  `setOverviewRepoFilter(dest)` (toggle), no view switch. **Depends on #196** (same
  `WorktreeHeader`, sequenced to avoid edit conflicts).

## TASK-198 — Schedule a session into a worktree

- Add a serde-default `worktree` flag to `ScheduledSession`; an **explicit "Start in a
  worktree" toggle** in the schedule branch step (clearer than a hidden ⌘⏎ for a deferred
  flow); create the worktree at **fire time** (`worktree_add[_new_branch]`, like #125 defers
  branch creation); **cancel cleanup reuses #199's broadened guard** so a cancelled schedule
  never orphans a worktree. **Depends on #199.**

## TASK-199 — Worktree auto-delete guard (THE confirmed bug)

- The card asked to verify the guard covers all item types — it **does not**:
  `cleanupWorktreeIfEmpty` (store.ts ~2737) counts **agents only**. So authored as a **fix**
  (not removed): a pure `worktreeHasItems(state, dest)` counting sessions + `overviewPanels
  [dest]` + schedules; trigger on **every** close (panel/schedule too, not just agent); count
  exited-but-shown agents; dirty worktree still kept. **Depends on: none** (foundational for
  #198/#200).

## TASK-200 — Worktree removal must not freeze the UI

- Root cause: `remove_worktree` is a **sync** `#[tauri::command]` → runs on the **main thread**
  → the FS delete freezes the webview. Fix = make it `async` + `tauri::async_runtime::
  spawn_blocking`; frontend cleanup made fire-and-forget (item removed instantly, dir deletes
  in background, dirty-kept toast preserved). **Depends on #199** (shared cleanup path).

## TASK-201 — One "New session" in the folder/worktree menu

- Add `includeNewSession?: boolean` (default true) to the shared `ViewsMenu`; the repo context
  menu **and** the worktree header menu (both already render a top-level "New session") pass
  `false`; the standalone `WorktreeViewsBadge` popover keeps it. Keep the top-level action
  (repo: `startRepoSession` branch-aware; worktree: `spawnWorktreeSession` reuse). **Depends
  on: none.**

## TASK-202 — File-tree search (filename + content)

- Content search is **absent** (only filename `search_files`) → new bounded backend
  `search_file_contents` (reuse `search_collect` walk + skip/validation, size/per-file/result
  caps, deterministic, truncation surfaced); plain case-insensitive substring (no regex);
  **in-panel** (tree↔results toggle), snippet "mini viewer" with the match highlighted, per-
  result **Reveal in tree** (new expand-to-path) + **Open** (reuse existing file-open).
  Sizable but kept as one card; adds no new view type. **Depends on: none.**

## TASK-203 — Restyle the sidebar-footer update indicator

Pure visual restyle of the shipped #190 `UpdateIndicator` chip (`Update.module.css`
`.indicator*`). Card asked for: inset from the sidebar edges, smaller, thinner, slicker,
less prominent. Decided autonomously (refine loop, user not answering):

- **Margin = `var(--space-8)` sides/bottom**, aligning with the footer's `0
  var(--space-8)` inset directly below — over the New/Schedule buttons' 12px — so the chip
  ties to the footer it sits above. Drop `width: 100%` (column-flex child stretches by
  default; margins inset it). Trivially retunable.
- **Single-line label** (icon + title + version on one baseline row) as the primary
  "thinner" move, over keeping the 2-line stack with smaller fonts.
- **Hairline border (`--border-hairline`) + transparent fill, accent reserved to the
  icon**, with a subtle `--bg-hover` hover (not the current full accent flood) — the
  "less-prominent / slicker" treatment. Over keeping a lighter accent border or removing
  the border entirely. Icon stays accent so it still reads as a positive, actionable hint.
- **Error variant restyled to match** (inset, single-line, subtle) rather than left as-is.
- **Collapsed rail:** keep icon-only, but center it (`justify-content: center`/modifier)
  so the new margins don't left-stick the icon. **Depends on: none.**

## TASK-204 — Schedule modal: worktree checkbox → ⌘⏎ button/keybind

The new-session and schedule flows are the **same** `NewSessionModal` but express the
"isolated worktree" choice differently: new-session uses a "Worktree ⌘⏎" button + ⌘⏎
keybind in the branch step (#74); schedule uses a checkbox in the schedule step (#198). Card
asked to unify on the new-session pattern. Decided autonomously (refine loop, user not
answering):

- **The worktree button lands on the schedule step (the final action step), next to
  "Schedule", NOT the schedule flow's branch step** — the pattern is "the worktree variant
  of the *primary action* button," and the schedule flow's primary action is Schedule (the
  branch step only advances). Keeps the choice on the same screen the checkbox was on.
- **⌘⏎ / Ctrl+⏎ active across the whole schedule step**, plain ⏎ = normal schedule, and
  Enter still inserts a newline in the prompt textarea / drives the open #114 skill menu.
- **`submitSchedule(asWorktree: boolean)` param** over a retained `worktree` state toggled
  by the button — mirrors the branch step's `create()` vs `createWorktree()` split, avoids
  a setState-before-submit race. Remove `worktree`/`setWorktree`, the `.scheduleWorktree`
  CSS, and the now-unused `Checkbox` import.
- **Backend + `ScheduledPanel` untouched** — `scheduleSession(..., useWorktree)` (#198)
  already takes the flag; ScheduledPanel only shows a read-only "worktree" badge.
  **Depends on: none** (all referenced code ships today).

## TASK-205 — Canvas tab bar: + dropdown + move distribute right

Reorg of the `CanvasTabs` toolbar (+ / distribute / Templates ▾). Card: turn + into a
dropdown offering "New tab" or a template option; move distribute elsewhere (right). Decided
autonomously (refine loop, user not answering):

- **+ dropdown holds the two tab-creation items only** — "New tab" (`addCanvas`) and "New
  tab from template…" (`openTemplateUse`); the latter **moves out of** Templates ▾ into +.
- **Templates ▾ kept for template management** (New template… / Save current canvas as
  template… / Manage templates…). Rejected folding everything into + (a + "add" affordance
  housing "Manage templates…" is semantically off, and broader than the card asked).
- **Distribute (Grid2x2) moves to the far right** via `margin-left: auto`, action/gating
  unchanged. Dropdowns stay `position: fixed` (escape the strip's overflow-x clip, #129).
  **Depends on: none.**

## TASK-206 — ⌘T new-Canvas-tab keybind + UI hint

- **⌘T / Ctrl+T** (unused; conventional "new tab"). Treated as a *create* action (like
  ⌘N/⌘K) → works from anywhere in the **main window** and **switches to Canvas** then
  `addCanvas()` (over a Canvas-view-only scoping like ⌘1–9, which would dead-end from
  Overview). Main-window only, inert while new-session/create-panel modals are open.
- **Surfaced** as a `⌘T` `<kbd>` on the **"New tab"** item of #205's + dropdown + the
  trigger tooltip + the useKeyboardNav legend. **Depends on #205** (the dropdown item is the
  hint's home; #206 builds on #205, not a cycle).

## TASK-207 — Sidebar click in Canvas: jump to Overview if not in canvas

`selectItem` (store.ts) in Canvas view: present-in-active-tab → jump to panel; **not present
→ today deselects + toasts "not present in canvas"** (a dead end). Change the not-present
branch to `set({ view: "overview", selectedId: item.id })`. Decided autonomously:

- **Applies to all item kinds, not just agents** (card says "agent", but the dead-end is
  identical for file/diff/terminal/kanban/schedule and Overview has a column for each, #174).
  Easy to scope to agents later.
- **"Present" = the active canvas tab** (selectItem's existing scope; never switches tabs);
  cross-tab jumps stay with the "Open in canvas" context action / `openSessionInCanvas`
  (#153).
- **No toast on switch**; intentionally reverses #79's "never auto-switch Overview↔Canvas"
  for the not-present case only. selectItem is main-window only (no detached edge).
  **Depends on: none.**

## TASK-208 — Rewrite v0.0.1 patch notes as a first-release intro

Content-only rewrite of `src/patchnotes/0.0.1.json` (today an internal changelog). Card:
introduce what the app is + frame as the first/initial release, not a list of recent
implementations. Decided autonomously:

- Schema has no free-text intro field, so use two categories — **"welcome"** (what ReCue
  is + "first release") and **"highlights"** (Overview / Canvas / sidebar at a high level).
  Arbitrary categories Title-Case via `categoryLabel`.
- Keep `version` 0.0.1 and `date` 2026-06-26. Provided concrete recommended JSON in the
  plan; wording polishable. **Depends on: none** (content-only; no code touched).

## TASK-209 — Fix missing space in Settings → Updates "Current version"

"Current version0.0.1" renders stuck. **Root cause:** `.updates` is `align-items:
flex-start`, so `.field`/`.fieldLabel` shrink-wrap → `.fieldLabel`'s `justify-content:
space-between` collapses → the label text and `.fieldValue` span sit adjacent. Decided:

- Fix via **`gap: var(--space-8)` on `.fieldLabel`** (one line, `Settings.module.css`) — the
  root-cause fix; also corrects the identical "Update available" field (same class). Over a
  per-instance `{" "}` JSX space. **Depends on: none.**

## TASK-210 — Feedback (bug) button in the sidebar footer

Add a Lucide **`Bug`** footer button next to the Settings gear that `openUrl(FORM_URL)`s the
feedback Google Form. Decided autonomously:

- Placement **after the Settings gear** (Settings → Feedback → collapse chevron); 16px icon
  matching the gear; reuse `openUrl` (`src/ipc.ts`, the existing `open_url` command) — no new
  Rust command. No confirm gate (opening a URL is non-destructive). Main-window only (sidebar
  only renders there). Works in the collapsed rail (`footerCollapsed` stacks it).
- **URL used verbatim** as pasted; `?usp=publish-editor` may be a Forms editor-preview link —
  flagged in the plan to swap for the public `…/viewform` URL if it opens the editor.
  **Depends on: none.**

## TASK-211 — Reorder folders in the sidebar by dragging

Card: drag folders up/down to reorder, no separate drag handle. Decided autonomously
(refine loop, user not answering):

- **Reuse the app-level `DndContext` (App.tsx), don't nest a new one.** The sidebar's
  draggable rows (`SessionRow`/`FileRow`/…) are bound to that context so they drop into
  Canvas; a nested context around the repo list would rebind them and break that. Add a
  `SortableContext` (vertical) inside the sidebar as a descendant, handle the
  folder-sort drag in App.tsx `onDragEnd` keyed by a `repohead:` id prefix.
- **Whole repo header is the grip** (no handle) — spread `useSortable` listeners on the
  header; the existing 4px PointerSensor activation distance keeps the title/`+`/right-
  click working.
- **Persist as a dedicated Rust `repo_order: Vec<String>`** (mirror `sidebar_width`
  #108), separate from the Settings blob so a draft can't clobber it.
- **Displayed order = `mergeRepoOrder(folderOrder, repoOrder(...))`** (reuse the pure
  helper) so a spawned repo appends and a forgotten one drops without scrambling.
- **Collapsed-rail drag reordering + worktree-subgroup reordering are out of scope**;
  the rail still reflects the saved order (renders the same `repos`). **Depends on: none.**

## TASK-212 — Keep the worktree branch label in sync after an in-terminal checkout

Card: worktree branch label goes stale when the agent `git checkout`s inside the
worktree. Decided autonomously:

- **Root cause is *when* `refreshBranches` runs, not the backend.** `current_branches`
  already resolves worktree HEADs and is already called with worktree paths (every
  session's `repoPath` is included via `repoOrder`). It just isn't re-run after an
  in-terminal checkout (only on repo-set change + app-initiated spawns/checkouts).
- **Fix = debounced `refreshBranches()` on the session busy→idle edge**, mirroring the
  #97 title-reader cadence; chosen over a poll timer (chattier + laggier).
- **Covers both worktree and normal-repo labels** in one batched call — the worktree is
  the motivating case, but the identical repo staleness is fixed for free; scoping to
  worktrees only would help nothing. A small lag (updates at next idle settle) is
  accepted. **Depends on: none.**

## TASK-213 — Worktree agent header: normal open-view button + static "worktree" badge

Card: "make a worktree agent use the same context-menu button as a normal agent, and
turn the 'worktree' button into a non-clickable badge." Grounded via an Explore sweep;
decided autonomously:

- **"the same context-menu button" = the views-popover trigger on Overview/Canvas
  headers** (`OpenViewButton`). Worktree agents already share the **sidebar** context
  menu (same `SessionRow`); the affordance that actually differs is the clickable
  `WorktreeViewsBadge` (text "worktree") shown *instead of* `OpenViewButton`.
- `OpenViewButton` and `WorktreeViewsBadge` **wrap the same `ViewsPopover`**, so:
  render `OpenViewButton` for worktree agents too (drop the `!worktreeParent` gate;
  `repoPath = session.repoPath` is the worktree folder, so views still open in the
  worktree), and replace the clickable badge with a **static**
  `<span class={worktreeBadge}>worktree</span>` (same class as the "fork" badge).
- **Only Overview + Canvas headers**; sidebar already unified, ScheduledPanel badge
  already static. Remove `WorktreeViewsBadge` if it becomes unused. **Depends on: none.**

## TASK-214 — Make the collapsed sidebar rail much narrower

Card: collapsed rail much narrower, only slightly wider than its icons/buttons.
Decided autonomously:

- **`SIDEBAR_RAIL_WIDTH` 56 → 44** (36px buttons + ~4px gutter each side). The rail's
  10px-per-side slack today comes purely from `(56−36)/2`. Final value tunable after a
  visual check; buttons could drop to 34/32 with a ~40px rail for an even tighter look.
- Pure constant + CSS change, no new state; verify nothing clips (dots, worktree
  glyphs, collapsed footer, collapsed UpdateIndicator icon). **Depends on: none.**

## TASK-215 — Tighten the update indicator margin + hover light-up

Card: reduce the update button's margin (keep a little) + add a hover light-up.
Decided autonomously (refine loop, user not answering):

- **Margin `var(--space-8)` → `var(--space-4)`** sides/bottom (keep a small inset, not
  flush). **Hover light-up = accent-tinted border + faint accent fill** (over the
  current bare `--bg-hover`), with `border-color` added to the transition; error
  variant lights up in `--status-error`. Token-only; exact values tunable.
- **Depends on: none.** Sibling **#216** (appearance animation) touches the same
  `.indicator` element → sequenced after this.

## TASK-216 — One-time attention animation on first appearance

Card: one-time ping/glow/border on the update button when it first appears on app
open, then normal. Decided autonomously:

- **Per-session one-shot, NOT persisted** ("on app open" = once per session). Guard
  replays (collapse re-render, status flip) with a module-level/store `announced`
  flag. Recommended a **glow/border pulse (no reflow)** over a scale ping; finite
  iteration then settle to #215's resting look. Mirror the `reveal-flash` (#202)
  one-shot precedent.
- **Reduced motion handled by the global `body.reduce-motion` killswitch** — no
  per-rule guard. **Depends on #215** (same `.indicator`/`Update.module.css`; builds
  on #215's resting style, sequenced lowest-first to avoid edit conflicts).

## TASK-217 — Fix feedback (bug) button opening a folder instead of the browser on Windows

Card: bug button opens the documents folder on Windows instead of the feedback forum
in the browser. Decided autonomously:

- **Root cause:** `open_url` (commands.rs) is hardcoded to macOS `open`; Windows has no
  such URL-opener, so it opens a folder. **Fix = cross-platform default-browser open**
  — recommended the **`open` crate** (`open::that_detached`, handles Windows quoting +
  shell-free), platform-`cfg` `Command` (`cmd /C start "" <url>` on Windows) as the
  dep-free fallback. Keep the `is_http_url` guard.
- **Scope tension flagged:** CLAUDE.md says macOS-only, but this is a Windows bug
  report → user is evidently on Windows. Task fixes **only** `open_url`; the other
  `open`-based Finder "reveal" commands and broader Windows support are out of scope
  and left to the user. Fix is harmless on macOS regardless. **Depends on: none.**

## TASK-218 — Nest scheduled worktree sessions under a worktree sub-group + Overview badge

Card: a session scheduled for a worktree shows in the parent repo's in-folder location
instead of nested under a worktree like a live worktree agent. The two UX questions were
**answered by the user before they went silent** (recorded as confirmed, not assumed):

- **Header for a not-yet-fired scheduled worktree = the full existing `WorktreeHeader`**
  (branch + worktree cue + open-view `+` + Reveal/Copy/Pull/New/Close menu), accepting
  best-effort failures while the folder doesn't exist yet (Copy path works).
  _(over a lighter scheduled-only header)_ — **user-confirmed.**
- **Scope = sidebar nesting + add the "worktree" badge to the Overview schedule card**
  (the `ScheduledPanel` already shows one). _(over sidebar-only)_ — **user-confirmed.**

Autonomous decisions in the plan:

- **Persist a computed `worktree_path` on `ScheduledSession`** (Rust `Option<String>`
  serde-default `None` + TS mirror), computed at `create_schedule` via the existing
  deterministic `worktree_path(store, cwd, branch)`. Rationale: the path is fully
  determined at schedule time and fire time already computes the identical path, so the
  scheduled sub-group key equals the live session's `repo_path` after firing → clean
  merge, no duplicate. The frontend can't compute it (no `data_dir`), so the backend
  must supply it. Fire time prefers the stored value (recompute fallback for old records).
- **Old schedules (no `worktree_path`) keep grouping at the parent level** and still fire
  via the recompute fallback — only their pending-item nesting is unavailable. Accepted.
- **No separate badge on the sidebar `ScheduleRow`** — the `WorktreeHeader` supplies the
  worktree cue. **Depends on: none** (worktrees #74, schedules #93/#94, scheduled-worktree
  #198, sidebar nesting all shipped).

## TASK-219 — Move the sidebar collapse button to the far right of the footer row

Card is precise ("far right", "all other buttons stay on the left", "e.g. justify-between").
Decided autonomously (user not answering):

- **Collapsed icon-rail left unchanged.** "Far right" is horizontal-only; the collapsed
  footer is a vertical `flex-direction:column` stack. The new positioning
  (`margin-left:auto` on the collapse button) must be neutralized under `.footerCollapsed`
  so the icon stays centered in the rail. _(over reflowing the rail too)_
- **"All other buttons" = Settings + Feedback only** — the only other buttons in the row;
  the UpdateIndicator (#190) + usage bar (#154) render above the footer, unaffected.
- **Prefer `margin-left:auto` on the collapse button over `justify-content:space-between`
  on `.footer`** — with three flex items, `space-between` would also spread Settings and
  Feedback apart rather than keeping them grouped left. **Depends on: none.**

## TASK-220 — Make Ctrl+V paste (text + images) work in terminals on Windows

Card: on Windows, terminals can't receive pasted text/images; fix paste. Grounded via an
Explore sweep — root cause: no clipboard addon/plugin and no custom key handler, so macOS
⌘V works (native WebKit paste → xterm) but Windows **Ctrl+V** is treated as the control
byte `^V` (0x16) and never pastes. Decided autonomously (user not answering):

- **Clipboard read = the Tauri clipboard-manager plugin**, not
  `navigator.clipboard.readText()` (unreliable/permission-gated under WebView2). Adds a
  JS+Rust dependency + a `clipboard-manager:*` capability — the smallest robust option.
- **Intercept via `attachCustomKeyEventHandler`** on Windows for **Ctrl+V and
  Ctrl+Shift+V**, returning `false` so xterm doesn't also emit `^V`. macOS keeps native
  ⌘V and leaves Ctrl+V as `^V`. Gated by the store `platform` signal (`isWindows`).
- **Ctrl+C stays SIGINT** — copy (Ctrl+C / Ctrl+Shift+C / copy-on-selection) is **out of
  scope**; the card is paste-only.
- **Paste injection = `term.paste(text)`** (respects bracketed-paste mode) over raw
  `writeStdin`, so multi-line paste works like macOS.
- **Images = save the clipboard image to a temp PNG and paste its file path** (Claude
  accepts image paths) — chosen because it doesn't depend on Claude's internal clipboard
  mechanism and, since the key is fully intercepted, can't double-handle. The image path
  + the live `claude` CLI on Windows **can't be unit-tested here** (GUI + ConPTY +
  clipboard) → flagged for real-box verification recorded in `TRAJECTORY_TO_WINDOWS.md`,
  per the CLAUDE.md untestable-path rule. If Windows testing shows Claude needs a
  different image signal, adjust that path only — the **text** paste fix stands.
- **Assumption:** the Windows `claude` attaches an image given its file path in the
  prompt (per its image-paste / drag-drop support). **Depends on: none** (self-contained;
  it adds its own clipboard dependency).

## TASK-221 — Fix the terminal font rendering "jiggly" on Windows

Card: terminal glyphs look weird/jiggly on Windows (esp. "C"); JetBrains Mono likely not
loading in the terminal. Grounded: the main window renders xterm via the **WebGL addon**,
and the only post-font-load step is `document.fonts.ready.then(safeFit)` — which re-fits
size but never rebuilds the WebGL glyph atlas or re-measures the cell; a canvas/WebGL
renderer also never triggers the browser to fetch the `@font-face`. Decided autonomously
(user not answering):

- **Primary fix = explicit `document.fonts.load()` for JetBrains Mono + rebuild the WebGL
  atlas / re-measure after it loads** (`webgl.clearTextureAtlas()`, re-apply font options,
  `term.refresh`, `fit.fit()`), replacing the bare `safeFit`. Chosen because it addresses
  the most likely root cause (atlas built with fallback metrics before the webfont loads)
  and **keeps GPU rendering**; harmless on macOS.
- **Documented fallback = DOM renderer on Windows** (generalize the existing
  `IS_MAIN_WINDOW` WebGL gate to `IS_MAIN_WINDOW && !isWindows(platform)`), mirroring the
  detached-window precedent that already drops WebGL for "a known WebGL glyph-atlas /
  devicePixelRatio artifact." Applied only if the primary fix doesn't fully resolve the
  jiggle on a real Windows box; trades GPU acceleration on Windows for guaranteed-correct
  text.
- **Windows-only GUI rendering path — not unit-testable here** (no Windows box / live
  WebView2 + ConPTY) → implement-for-both, verify on a real box, log the resolving path to
  `TRAJECTORY_TO_WINDOWS.md`. **Assumption:** the `@fontsource` bundle is intact (works on
  macOS); the defect is in *applying* it under WebGL on Windows, not a corrupt font.
  **Depends on: none.**

### Process note (concurrent dev pipeline)

While refining #218–#221, a concurrent dev pipeline implemented **#218** in the **same
working tree** (uncommitted: `commands.rs`, `store.rs`, `Overview.tsx`, `Sidebar.tsx`,
`paths.ts`, `paths.test.ts`, `types/index.ts`, plus its `TASK-218.md` `[x]` + `KANBAN.md`
#218→DONE move). To avoid the shared-worktree race, every refine commit stages **only its
own explicit paths** (`TASK-<N>.md`, `KANBAN.md`, `ASSUMPTIONS.md`) — never `git add -A`,
never the pipeline's code files or `TASK-218.md`.

## TASK-222 — Revert Canvas "+" to a plain new-tab button; move "from template" into Templates menu

Card: revert #205 — the "new canvas tab" + should be a simple plus that creates an empty
canvas; move create-from-template back into the Templates dropdown. Grounded in
`CanvasTabs.tsx` (current post-#205 state: + is a dropdown with "New tab" / "New tab from
template…"; Templates ▾ holds management only). Decided autonomously (user not answering):

- **Revert scope = only the "+" dropdown + the template-entry relocation** (exactly the
  card). The other #205 change — distribute-evenly moved to the right edge — is **left
  intact** because the card doesn't mention it.
- **"New tab from template…" placement = top of the Templates ▾ menu** (primary "use"
  action above the management items); implementer may instead match the exact pre-#205
  order via `git show 54d1083^:src/components/Canvas/CanvasTabs.tsx`.
- **#206 (⌘T) preserved** — the keybind still creates a new tab; its hint stays on the +
  tooltip + keyboard legend; only the `<kbd>` inside the removed + menu item is dropped.
- **Depends on: none** — refines shipped #205/#206/#117/#118 code.

## TASK-223 — Add a "distribute panels evenly" button to the Template Editor

Card: the canvas has an evenly-distribute button (#186); add the same to the template
editor. Grounded: the pure `equalize(node)` op (`canvasTree.ts:253`) is reusable on any
`CanvasNode` tree; the Template Editor holds its tree in local `layout` state and renders
splits with react-resizable-panels `Group` + initial-only `defaultLayout`. Decided
autonomously (user not answering):

- **Reuse the shipped pure `equalize` op + the same `Grid2x2` "Distribute panels evenly"
  icon/label** as the live canvas (#186), placed in the editor toolbar next to "Save
  template".
- **Visual update via a one-shot surface remount nonce**, not the live canvas's imperative
  Group-ref `setLayout`. The live canvas avoids remount to protect the terminal pool; the
  Template Editor's blocks are **inert** (no PTYs), so keying the surface on an
  equalize-only nonce to re-read the initial-only `defaultLayout` is the simplest reliable
  approach. Normal drag-resize must not bump the nonce.
- **Gate disabled when < 2 leaves**; equalized sizes persist on Save like any edit.
- **Button only — no border double-click gesture** (the card asks for "the same button";
  #186's separator-double-click half is out of scope). **Depends on: none** (builds on
  shipped #186 + #117).

## TASK-224 — Canvas template file block: full paths + relative/absolute choice

Card: open-file template block should support full paths (folders + filename), not just a
bare filename, plus a relative/absolute choice (relative = project root, absolute =
filesystem root). Grounded via Explore: the block stores only `file: string`; the editor
is a bare relative-filename input; instantiation joins `file` to the chosen `cwd`; the
backend confines to a repo (`repo.join`), so relative subpaths **already** work, and an
absolute file opens via the shipped **#163 parent-dir-as-root** trick (`splitPath` →
`{repoPath: parentDir, file: basename}`). Decided autonomously (user not answering):

- **Explicit `filePathMode?: "relative" | "absolute"` field** (default relative when
  absent) over inferring absolute-ness from the path — matches the card's "choice",
  clearer on re-edit, back-compatible.
- **No backend `files.rs` change** — relative subpaths already validate via `repo.join`
  (treats `/` as a separator on Windows too); absolute reuses the #163 split-to-parent
  pattern. A shared pure `fileBlockTarget(block, cwd)` helper feeds both
  `templateInstantiate` and `resolveTemplateBlock`.
- **Add a "Browse…" picker in absolute mode** (reuse `pickFile`), mirroring #163.
- **Absolute templates are machine/OS-specific by design** (documented in the helper
  text); relative ones stay portable (stored `/`-separated). Resolve failures already
  degrade gracefully (pending + Retry, #118). **Depends on: none** (builds on
  #117/#118/#163 + the cross-platform `splitPath`/`joinPath` helpers).

## TASK-225 — Subtle current-branch badge next to each sidebar folder, synced from any source

Card: show a subtle grayed-out branch badge next to each folder name, kept in sync from
any source (agent, terminal typing, etc.), "likely needs polling." Grounded: the store
already has `branches` + `refreshBranches`; #212 refreshes on the busy→idle edge + app
actions + repo-set change, but the repo header renders only the folder name/count (no
branch). Decided autonomously (user not answering):

- **Reuse the shipped `branches` map / `refreshBranches`** (no backend change) — the badge
  just renders `branches[repo]`, muted + small + truncating; expanded sidebar only;
  nothing for non-git folders. Worktree sub-headers already show their branch (out of
  scope).
- **Sync = keep #212's event refresh + add (a) a focus/visibilitychange refresh and (b) a
  ~15s visible-only interval poll** (paused when `document.hidden`, batches all repos in
  one `currentBranches` call). The card explicitly asks for polling; #212 alone misses
  external/idle-repo checkouts. Interval is tunable; this deliberately augments #212's
  "no poll timer" choice because the requirement is broader. **Depends on: none.**

### Process note (board now has a concurrent archiver too)

Besides the dev pipeline implementing READY cards, a DONE→archive process is moving
completed cards out of `KANBAN.md`'s DONE into `TASK_ARCHIVE.md`. Refine commits continue
to stage only `TASK-<N>.md` + `KANBAN.md` + `ASSUMPTIONS.md` explicitly and never touch
DONE/code/`TASK_ARCHIVE.md`, so the loops don't collide.

## TASK-226 — Replace agent-header worktree badge with a folder + branch indicator

Card: remove the "worktree" badge on agent headers; instead every agent header shows the
folder + branch that agent works on (like the Kanban header shows its folder). Grounded
via Explore: Overview `SessionCard` + Canvas `LeafPanel` show a `worktreeParent`-gated
"worktree" badge and (Canvas) explicitly null the folder·branch meta for agents; non-agent
panels already show `repoName · branch` via `.meta`/`.panelMeta`. Decided autonomously
(user not answering):

- **Folder = `repoName(effectiveRepo(session))` (parent repo), branch =
  `branches[session.repoPath]`** — so a worktree agent reads "myrepo · feature-x" (its repo
  + isolated branch), not the sanitized worktree-folder basename. Shown for **every** agent.
- **Remove the worktree badge from both agent-header sites; keep the `worktreeBadge` CSS
  class** (still used by the fork badge + the #218 ScheduleCard badge).
- **Keep the fork badge** (distinct provenance concept); the explicit "worktree" word is
  intentionally dropped in favor of folder·branch.
- **ScheduleCard's #218 worktree badge left as-is** (card = agent headers only; scheduled
  cards already show `repoName(cwd) · branch`); accepted minor inconsistency, flagged for a
  possible follow-up. Minor name/branch redundancy when an agent has no custom name is
  accepted (matches non-agent panels). **Depends on: none** (builds on #213/#96/#212;
  independent of #225's sidebar-folder badge).

## TASK-227 — Extend file-viewer syntax highlighting to more languages

Card: add syntax highlighting in the file viewer for a list of common languages; "keep it
fast/non-blocking; consider lazy loading if a naive approach is slow or hard to maintain;
pick the best approach." Grounded: highlighting already exists (Prism, #44/#150) via
`fileType.ts` (ext→lang map) + `prism.ts` (static imports + `highlightToHtml`); Java/Rust/
JS-TS/HTML/CSS/JSON/YAML/Python/POM(xml) already covered. Decided autonomously (user not
answering):

- **Static imports, not lazy loading.** Per the card's own criterion (lazy only if naive
  is slow/hard-to-maintain): a Tauri **desktop** app loads its bundle from local disk and
  the missing Prism components are tiny (~KB each), so static is neither slow nor hard to
  maintain, and it preserves the deterministic **no-async-flash** UX the current code
  chose. Lazy would re-highlight after load (a regression).
- **Add:** C#(`cs`), Go(`go`), Lua(`lua`), SQL(`sql`), Ruby(`rb`), PHP(`php`), Gradle
  (`gradle`→groovy, `kts`/`kt`→kotlin). **POM** = existing `xml`→markup (no change).
- **Mind Prism dependency order** (markup-templating before php; clike-extenders after
  core) — wrong order silently disables a grammar. **Depends on: none**; the later
  diff-viewer highlighting card depends on **this** (reuses `prismLang`/`highlightToHtml`).

## TASK-228 — Make agents in the collapsed sidebar rail clickable

Card: when the sidebar is collapsed, agents are status-dots-only; make them respond to
left/right click like the expanded rows. Grounded: the rail `dot()` helper renders a bare
`<BusyIndicator>` with no handlers; `SessionRow` is the behavior to mirror (left =
`selectItem` agent; right = menu Rename/Fork/Copy session ID/Open in canvas/Remove).
Decided autonomously (user not answering):

- **Left-click = `selectItem` select/jump; right-click = the same agent menu** as the
  expanded row, shared via an extracted `useAgentRowActions`/`agentRowMenuItems` helper so
  the two never diverge; `stopPropagation` so it opens the agent menu, not the rail
  background/repo menu. Add a selected state to the active dot.
- **Rename from the rail = expand the sidebar + auto-begin the inline rename** (the inline
  editor doesn't fit the narrow rail), via a transient `pendingRenameSessionId` the
  expanded `SessionRow` consumes. Documented fallback: omit Rename in the rail.
- **Drag-into-Canvas from the rail is out of scope** (card is click-only). **Depends on:
  none** (builds on the shipped rail #168/#214 + the SessionRow menu #57/#131/#142/#153).

## TASK-229 — Syntax-highlight the diff viewer

Card: extend syntax highlighting (same languages as the file-viewer task) to the diff
viewer. Grounded: `DiffInspector`'s `UnifiedRow`/`SplitRow` render line code as plain text;
the file's `path` is available; #227 exposes pure `prismLang` + `highlightToHtml`. Decided
autonomously (user not answering):

- **Reuse #227's `prismLang(file.path)` + `highlightToHtml`** (no duplicated language
  config); highlight via `dangerouslySetInnerHTML` (safe — `highlightToHtml` escapes input
  and falls back to plain escaped text for uncurated types). Keep the `+`/`−` markers and
  add/del/context row backgrounds unchanged; share the FileViewer's Prism token CSS.
- **Per-line highlighting** (lightweight; accepts imperfect cross-line tokenization of
  block comments/template strings) — matches the card's "lightweight" intent.
- **Depends on #227** — it provides the extended language set + the
  `prismLang`/`highlightToHtml` surface, and both touch the shared highlight infra, so #229
  lands after #227. (First task in this batch with a non-`none` dependency.)

## TASK-230 — Add a "Commits" source to the diff viewer

Card: add a "commits" option that lists previous commits; clicking one shows its diff.
Grounded: the DiffInspector has a `DiffSource` toggle (working/compare #81) + persisted
panel state; the backend has `working_diff`/`compare_branches` + the shared
`parse_unified_diff`; no commit commands exist. Decided autonomously (user not answering):

- **Commits = a third `DiffSource`** (Working/Compare/Commits), reusing the existing diff
  body. Two new **read-only** git commands: `list_commits(cwd, limit)` (bounded `git log`,
  ~100, cap surfaced) + `commit_diff(cwd, sha)` (`git show --format=` → `parse_unified_diff`;
  handles root + normal commits; merge commits accept git's default).
- **Persist the source + selected sha** on the repo's diff panel (ephemeral fallback
  allowed).
- **Reads only** — consistent with the read-mostly git rule; all git via the
  cross-platform `run_git`/hidden-command helper. **Depends on: none**; the later diff-viewer
  **redesign** card depends on this (must keep commits available), and #229 highlighting
  applies to commit diffs for free.

## TASK-231 — Redesign the diff viewer UI with selectable display modes

Card: redesign the diff viewer with two display modes (Accordion + Focused single-file) +
a setting to pick the default (default = focused), keeping all existing functionality
(working/compare/commits/worktree + Unified/Split). Grounded: `FileDiff`/`WorkingDiff`
already carry status + +/− counts + the summary (no backend change); Settings has a clear
segmented-control pattern. Decided autonomously (user not answering):

- **Mode setting = global `diffDisplayMode: "focused" | "accordion"` (default "focused")**
  in Settings → Behavior (a "default …" setting like `defaultView`), **plus an in-panel
  quick toggle** (local, seeded from the setting). Per-panel persisted override deferred.
- **Accordion = single-open cards** (status badge + filename + muted subpath line + +/−
  counts), inline diff on expand. **Focused = single file + ‹ ›/picker-pill (i/N) nav.**
- **All sources preserved** (Working/Compare/**Commits #230**/worktree); diff rows inherit
  **#229 highlighting**. **No backend/type change** (data already present).
- **Depends on #229, #230** — must preserve commits + inherit highlighting; all three edit
  `DiffInspector` → land after them, lowest-number-first.

**Wireframes (update):** the user later supplied two wireframes (Accordion "01" + Focused
"03"); they're transcribed in TASK-231.md's "Wireframe spec" section (images live in the
conversation, not committable as binaries). Earlier the plan said none existed — corrected.

## TASK-232 — Scheduled task time: show only the time when the date is today

Card: a scheduled task in the left panel shows full date+time; if the date is today, show
only the time. Grounded: shared `formatFireTime` (`src/time.ts`) always renders "Jun 21,
3:45 PM"; used by the sidebar `ScheduleRow` + Overview `ScheduleCard`. Decided
autonomously (user not answering):

- **Change the shared `formatFireTime`** (benefits sidebar + Overview consistently, not a
  sidebar-only variant) so a same-local-calendar-day fire time formats **time-only**, else
  the existing month/day + time. **Inject an optional `now` param** for unit-testing the
  "today" check. Keep the sidebar's full-date hover tooltip. **Depends on: none** (small
  tweak to the shipped #93/#94 time helper).

## TASK-233 — Redesign the in-app Kanban board UI

Card: reinvent the KanbanPanel (checkbox top-left + full-width text + tight padding;
detail/meta lines as dimmed monospace secondary lines; inline add-card composer; per-column
header with accent dot + UPPERCASE caps + count + "+"; each column its own accent). Grounded
via Explore. Decided autonomously (user not answering):

- **No engine change** — the kanban.ts `Card.body` **already round-trips** tab-indented
  detail lines verbatim (like READY cards' Plan/Depends). The work is **rendering** the
  body as **dimmed monospace** (restyle `.cardBody`, keep ReactMarkdown so links/task
  checkboxes #194 still work).
- **Per-column accent derived from the Catppuccin palette by column index** (reuse
  `repoColor`/`REPO_PALETTE`) — the markdown format has nowhere to store color and must stay
  unchanged ("keep it functional with the markdown format").
- **Inline composer:** Enter submits, Shift+Enter = detail line; first line→title,
  rest→body; opened by the column "+" and the bottom dashed "+ Add card".
- **Card stays a drag source** via a whole-card grip + activation-distance guard (no
  separate grip column), honoring "checkbox top-left + full-width text".
- **No wireframe file exists** — built from the inline brief; match a wireframe if the user
  sends one (as for #231). Large but cohesive; splittable if needed. **Depends on: none**
  (builds on #141–#151/#194/#195 + `repoColor`).

## TASK-234 — Kanban card hover-lift animation (drag affordance)

**Direct user request (2026-06-28):** a Kanban card should "jump up slightly when hovered…
smooth animation with a little flair so the user understands they can pick it up and drag
it. But don't overdo it." Decided autonomously (user not answering questions):

- **Subtle CSS-only hover lift**: `.card:not(.cardDragging):hover` → `transform:
  translateY(-2px)` (≈2–3px) + a subtle `box-shadow` + `cursor: grab`, eased via
  `--dur-fast`/`--ease-out`. No big scale/rotation ("don't overdo it").
- **Don't fight dnd-kit**: inline drag transform already overrides the hover transform;
  additionally don't apply the lift while dragging; `grabbing` cursor during drag.
- **Reduced-motion aware** (global killswitch / scoped rule disables it).
- **Depends on #233** — both edit `.card`; the lift layers on the redesigned resting style
  (sequenced after to avoid conflict/rework).

## TASK-252 — Color file-tree rows by git status

Card: "File tree should show git changes. Green for new and yellow for edited files. If
something was deleted out of a folder, it should be marked in red." Grounded: the single
`FileTree` (#167) renders only on-disk entries via `list_dir` (repo-relative POSIX paths);
`working_diff` already yields per-file `M`/`A`/`D` (untracked-as-Added #183); the
`--status-done`/`-awaiting`/`-error` tokens are the established green/yellow/red; #212's
`scheduleBranchRefresh` busy→idle cadence is the refresh hook. Decided autonomously (refine
loop, user not answering — standing directive 2026-06-26):

- **Deletions = a red strikethrough "ghost" row in the parent folder + a red ancestor
  roll-up**, not folder-red only. The card's "marked in red" is best served by showing
  *what* was deleted in place; the roll-up covers collapsed/missing parents. Fallback if
  ghost-row injection fights the lazy tree: red ancestor roll-up alone.
- **Folders roll up new/edited too** (highest-severity descendant color, red>yellow>green),
  not just deletions — IDE convention, reuses the same machinery the deletion rule needs,
  restrictable to red-only later.
- **Color = tint name text + icon** (no dot/letter badge) — reads the card's "green for
  new / yellow for edited" as coloring the file label.
- **New lightweight `file_statuses` (`git status --porcelain=v1 -z --untracked-files=all`)
  via `run_git`/`hidden_command`**, not the heavyweight `working_diff` (full hunks + a git
  spawn per untracked file), to keep the busy→idle refresh cheap; `working_diff` reuse is
  the fallback. Renames → del(old)+add(new), mirroring `parse_unified_diff`.
- **Status held in the store (`fileStatuses`, mirroring `branches`)**, refreshed once per
  repo on load + the #212 busy→idle edge + the FileTree Refresh button — not per FileTree
  instance.
- **Out of scope:** coloring #202 search results, staged/unstaged split, diff-on-click for
  a ghost row, non-git folders (fail-open, no coloring). Cross-platform: only the git
  shell-out is OS-sensitive and it reuses the established hidden-command seam; both
  porcelain and `list_dir` paths are POSIX-`/` repo-relative so the lookup matches on
  macOS and Windows (no `#[cfg]` needed). **Depends on: none.**

## TASK-253 — Drag OS files into the file tree to move them into the repo

Card: "Allow for files to be dragged into ReCue, especially the file tree. Items should be
moved to this location once they are dropped in. User can also drag and drop into folders or
the root of the file tree. There is visual UI feedback…" Grounded: no OS drag-drop wiring
exists; in-app DnD is dnd-kit on a `PointerSensor` (won't clash with an OS file drop, which
comes via Tauri's webview drag-drop event); `files.rs confine()` is the write-validation
pattern; `pushToast` exists; `core:default` covers drag-drop events for `["main","canvas-*"]`.
Decided autonomously (refine loop, user not answering — standing directive 2026-06-26):

- **Move, not copy** — the card says "moved" twice. Implemented safely (same-volume
  `fs::rename`; cross-volume copy-then-remove so a failure can't lose data). Flagged that
  drag-from-Finder often *copies*; copy / a modifier-key toggle is a one-line follow-up.
- **Scope = external OS files → tree folders/root only.** "Drag into folders or the root"
  reads as *where incoming files land*, not intra-tree reorg (separate dnd-kit interaction,
  future card). Keeps `Depends on: none`.
- **Collisions refuse (no overwrite)**; auto-suffix noted as alternative. **No confirm gate**
  (drag is intentional + move is data-safe).
- **Drop resolution = window-global Tauri `onDragDropEvent` + DOM hit-test**
  (`data-filetree-droptarget`/`-repo` markers + `elementFromPoint`), because the event isn't
  bound to a DOM element. **Physical→CSS position via `devicePixelRatio`** (Retina + Windows
  fractional scaling). Listener registered in the main shell **and** the detached
  `CanvasWindow` (each its own webview).
- **Directories moved recursively.** Backend `move_into_repo` derives the basename from the
  source `Path` (no frontend `splitPath`); destination confined to repo, source intentionally
  unconfined (user's explicit drag, like #163 native-dialog consent). Adds the **second**
  `files.rs` write after `write_text_file` (#141) — update CLAUDE.md's read-mostly note.
- **Cross-platform:** `fs` move (no shell, no `hidden_command`); GUI drag can't be CI-tested →
  implement for both OSes, log the real-box check (WebView2 drop, fractional-DPR hit-test,
  cross-volume move) in `TRAJECTORY_TO_WINDOWS.md`. **Depends on: none.**

## TASK-254 — Render Mermaid diagrams in rendered markdown (file viewer)

Card: "Markdown mermaid integration… generate mermaid diagrams in markdown render view if a
mermaid diagram is detected." Grounded: `FileViewer` renders markdown via react-markdown +
remark-gfm (no raw HTML); its `components` come from the shared `makeCheckboxComponents`
(`markdownCheckboxes.tsx`, already overriding `a`/`input`) — a `code` override is the hook;
`mermaid` is not yet a dependency. Decided autonomously (refine loop, user not answering —
standing directive 2026-06-26):

- **Library = `mermaid`, lazy-loaded (dynamic import) + bundled offline** (no CDN, per the
  fonts-offline rule); large lib → only loads when a diagram is present.
- **Detection = the ` ```mermaid ` language fence only** (GitHub/Obsidian convention), not
  heuristic sniffing of untagged blocks.
- **Scope = FileViewer rendered markdown only**, via an **opt-in `mermaid` flag** on the
  shared factory, so Kanban/PatchNotes/Settings markdown stay unchanged (Kanban = future).
- **Invalid diagram → fall back to the raw code block + a subtle error**, never crash.
- **Dark theme + `securityLevel: "strict"` + an offline font** (fits the dark UI + no-raw-HTML
  policy); token `themeVariables` is optional polish.
- **`code` override:** intercept `className` `language-mermaid` → `<MermaidBlock>`; else render
  the default `<code>` faithfully (FileViewer overrides no `code` today). Async render via
  `mermaid.render(useId(), chart)` → `dangerouslySetInnerHTML`, latest-wins guard.
- **Cross-platform:** pure WebView SVG, no native/path/shell code, no platform branching;
  works on WKWebView + WebView2 alike. **Depends on: none.** (Adds the `mermaid` npm dep.)

## TASK-255 — Keyboard navigation between files in the diff viewer

Card: "In the diff view I want to use the arrow keys (or some other keyboard shortcut) to
jump between files when in focussed mode. Also look at accordion mode for a way to jump
between items." Grounded: `DiffInspector` already has Focused (‹/› + i/N picker, pure
`stepFile` wrap, #231) and Accordion (single-open cards) modes (#237 persists them); the panel
root isn't focusable and there's no key handling; `useKeyboardNav` is global. Decided
autonomously (refine loop, user not answering — standing directive 2026-06-26):

- **Plain (unmodified) arrows, direction matched to layout:** Focused = **Left/Right** (the
  ‹/› strip), Accordion = **Up/Down** (vertical list). Minimizes scroll conflict — Focused
  leaves ↑/↓ for body scroll; Accordion takes ↑/↓ for stepping (wheel/PageUp-Down still
  scroll). Alt+Arrow modifier variant is the noted fallback.
- **Panel-scoped `onKeyDown` + `tabIndex={0}`, NOT the global `useKeyboardNav`** — multiple
  diff panels + detached windows mount at once, so a global handler can't know which to move;
  scoping to the focused panel keeps terminals/inputs/other panels unaffected. Guard ignores
  inputs/selects/contenteditable/listbox/combobox + held modifiers + `files.length < 2`.
- **Reuse the existing `stepFile` (wraps)** for both modes (consistent with the ‹/› buttons);
  clamping is a trivial alternative. **Scroll the active accordion card into view** after a
  keyboard step (`scrollIntoView({block:"nearest"})`).
- **Out of scope:** in-picker listbox arrow selection, a modifier shortcut, vim/hjkl, body-
  scroll changes. **Cross-platform:** unmodified arrows identical on macOS/Windows, no
  `platform`/`#[cfg]` branching; any future modifier shortcut must use `metaKey||ctrlKey`.
  **Depends on: none** (builds on shipped #231/#237).

## TASK-256 — Release v1.0.1

Card: "Increment version number to 1.0.1. Write a patchnotes file for v1.0.1 based on all
changes since release tag 1.0.0. Run all tests, satisfy all clippy warnings, no tests fail.
Commit & push directly to main." Grounded: version is in `src-tauri/tauri.conf.json` (gate-read)
+ `package.json`, both `1.0.0`; patch notes are `src/patchnotes/<version>.json`
(`{version,date,changes:[{category,items}]}`, categories feature/fix/improvement/other via
`patchnotes.ts`); push to main auto-triggers `release.yml` (version-gate → draft release →
signed macOS+Windows builds; maintainer publishes). Changes since `v1.0.0`: #252 (file-tree git
colors), #253 (drag OS files into tree), #254 (mermaid), #255 (diff keyboard nav). Decided
autonomously (refine loop, user not answering — standing directive 2026-06-26):

- **Bump both `tauri.conf.json` AND `package.json`** (in sync today; gate reads tauri.conf).
- **Patch-notes categories = feature/improvement/fix** (not the launch `welcome` group); items
  are user-facing prose, not task numbers. Regenerate the list from `git log v1.0.0..HEAD` +
  DONE/archive at implementation time (more tasks may land first).
- **Push directly to main, no branch/PR** — explicitly requested + required to trigger the
  on-push release pipeline.
- **The version bump is intentional + user-requested**, overriding the refine/loop agent's
  standing "never bump the version" guard (which guards against *accidental* bumps). The
  *implementing* agent performs the bump; the refine agent only writes the plan — I did not
  touch the version.
- **Out of scope:** building/signing/tagging/publishing (pipeline + maintainer do those);
  release infra / updater / keys. Run full green suite: build, lint, format:check, test,
  lint:rust (clippy -D warnings), cargo test. **Depends on: none** (documents already-merged
  work; captures main's state at implementation time).

---

# 2026-06-30 batch — PLAN column drained (tasks 257–281)

The PLAN column held 23 terse cards. Sketched their dependency picture, then refined them
into 25 tasks (#257–#281). Card "input lag/multithreading" → two independent tasks (260
stdin-lock, 261 output-path); card "scheduled worktree" → two tasks (259 eager creation,
279 duplicate-folder). The release card (281) depends on all 24 others. Per the standing
directive (2026-06-26) all interpretation calls below were made autonomously.

## Task 257 — Larger / resizable Kanban card inputs
- Pure sizing change: `rows={3}`→`rows={5}` on the composer + inline-edit textareas, add
  `min-height: 88px` / `max-height: 320px`; `resize: vertical` already present (the drag
  affordance). No behavioral change. **Foundational** for 276/277.

## Task 258 — Diff sort by occurrence (default) vs alphabetical
- "By occurrence" has **no backend metadata** — derived client-side: track the order a file
  first becomes changed (a `path→seq` map per panel); re-change never reorders; a file that
  leaves the diff then reappears is "new" (bottom). **The occurrence sequence is per-panel-
  session, not persisted**; only the sort-mode *preference* is persisted (in the settings
  blob, mirroring `diffDisplayMode`). On fresh mount the list seeds from git's order.
- Default = occurrence (per card). Pure ordering helper extracted + unit-tested.
- **Foundational** for 278 (seen-marker), which interacts with occurrence ordering.

## Task 259 — Eager worktree+branch creation at schedule time
- Chose **option 1 (create eagerly at `create_schedule`)** over lazy creation: far cleaner
  support — every "create item in worktree" path just works once folder+branch exist; lazy
  creation would need to intercept every such path. Cost: a worktree exists for the pending
  schedule's lifetime; cleaned up on cancel (ref-counted, dirty worktree kept — #74 policy).
- **Worktree-creation failure at schedule time is surfaced inline and the schedule is not
  created** (same UX as immediate-worktree validation). Fire path made idempotent (skip
  creation when the worktree dir already exists, both create-branch and existing-branch).
- `deps: none`. Yields the dependent **Task 279** (duplicate top-level folder fix).

## Task 260 — Stdin write-path lock contention (input lag, part 1)
- Root cause: `write_stdin`/`resize_pty`/`scrollback` hold the **global** `sessions` mutex
  across **blocking** PTY writes/resize/256KB-snapshot, so a backpressured terminal stalls
  every other terminal's keystrokes. Fix: per-session `Arc<Mutex>` for `writer`/`master`
  (already so for `child`/`scrollback`); clone the Arc under the brief global lock, drop it,
  then do the blocking op under the per-session lock. **Chose the per-session-lock approach
  over a per-session writer thread** (lower risk, sufficient); thread variant only if this
  proves insufficient. `deps: none`, parallel with 261.

## Task 261 — Output payload + write throttling (input lag, part 2)
- Root cause: output bytes shipped as a **JSON integer array** (`Vec<u8>`→`[27,91,...]`),
  ~4 chars/byte, one event per 8KB read → saturates the single WebView main thread, lagging
  even React inputs. Fix: (A) **base64** payload (cheap `atob` decode) — chosen baseline over
  a Tauri binary `Channel` (portable, low-risk; pick one not both); (B) **rAF-coalesced**
  `term.write` in terminalPool; (C) drop the per-chunk `sessions.find` reconnecting scan.
- **Out of scope:** changing reader chunk size / backend time-window batching (keeps latency
  predictable + the diff reviewable). `deps: none`, parallel with 260.

## Task 262 — Terminal last line below the screen
- #178 already added vertical padding; bug persists intermittently due to **sub-row fit
  rounding** (line-height makes the real cell taller than FitAddon assumes → one row too
  many → last row clipped). Fix = more bottom padding (≈20px) **plus** a conservative fit
  guard (reduce rows by one when the rendered height would overflow the content box,
  best-effort via xterm metrics, guarded). `deps: none`.

## Task 263 — Modal opens slowly
- **Card's guess corrected:** the remote `git fetch` is already async/off the open path.
  Real cause = a pre-open `await ipc.listBranches(repo)` in `store.ts startRepoSession`
  gating the per-repo modal. Fix = open immediately with `initialBranches: null`; the
  modal's existing branch-detection effect fills the list async. `deps: none`.

## Task 264 — File tree auto-refresh
- **Polling chosen over fs-watch** (no `notify` crate; card sanctions polling). Reuse the
  existing `fileTreeRefresh` per-repo signal (re-lists loaded levels, preserves expansion).
  Triggers: busy→idle edge re-list (not just re-tint), a ~5s visibility-gated poll, and
  window focus. `deps: none`.

## Task 265 — Scheduled worktree card header (3 lines)
- Cause: `ScheduleCard` drops name/worktree-badge/meta as three direct children of the
  `.titleBlock` flex-column → 3 rows + full-width badge. Fix = wrap name+badge in the
  existing `.agentTitle` row (mirror `SessionCard`). Pure UI; `deps: none`.

## Task 266 — Checkout branch in repo context menu
- New `"checkout"` `menuMode` sub-panel (mirrors the `"color"` sub-mode) with a branch
  picker (local + cached remote via `sortBranches`) + create-new. New store actions
  `checkoutFolderBranch`/`createFolderBranch` (model on `pullFolder`); **no agent spawned**
  (distinct from `spawnSession`'s checkout). Reuse existing `checkout_branch`/`create_branch`
  commands (no backend change). Show the running-agents destructive advisory. `deps: none`.

## Task 267 — File-tree folder/file context menu (new folder, delete)
- Folder rows get a new context menu (New folder…/Delete folder); file rows gain Delete.
  Two new path-validated `files.rs` writes — `create_dir` + `delete_path` (the 3rd/4th
  deliberate writes) — strictly confined (canonicalize, `starts_with` repo, **refuse repo
  root**, reject symlinks/`..`, no clobber), reserved-name guard for new folders. Deletes
  confirm-gated (Settings #103). Refresh via the existing `fileTreeRefresh` bump. `deps: none`.

## Task 268 — Natural-language launch-time input
- **Custom parser in `time.ts`, no new date lib** (offline ethos). Covers durations
  (1h/30m/1 hour), clock times (15:00/6pm/9:30am), today/tomorrow prefixes, explicit-date
  fallback. **A bare time already past today rolls to tomorrow.** Free-text input + static
  hint + live "Starts <date/time>" preview, replacing both `datetime-local` widgets. Invalid
  input disables submit. `deps: none`.

## Task 269 — Start now button
- New backend `fire_schedule_now(id)` command, extracted from a shared `fire_one_schedule`
  helper factored out of `fire_due_schedules`; reuses the existing `schedule://fired` →
  `onFired` transition. Button in ScheduledPanel + Overview card + sidebar row.
- **`deps: 259`** — serialized after eager-worktree (both restructure the fire path; avoids
  a risky merge in worktree/spawn code and guarantees fire-now reuses the eager worktree).

## Task 270 — Gray out gitignored files/folders
- Add `--ignored=matching` to the `git status` read + a `FileStatus::Ignored` ("I") variant;
  parser stops dropping `!` entries. Frontend: `statusIgnored` tint (`--text-muted`).
  **Ignored is kept OUT of the folder severity roll-up** (an ignored child must not gray a
  tracked parent); a folder grays only when the directory itself is ignored. `deps: none`.

## Task 271 — Copy button on rendered markdown code blocks
- A `pre` override added to FileViewer's `markdownComponents` (alongside the existing
  `code: MermaidCode`) renders a hover-revealed Copy button per fenced block, using
  `store.copyToClipboard`. **Scoped to FileViewer only** (Mermaid precedent) — Kanban/
  PatchNotes/Settings unaffected; inline code + mermaid diagrams excluded. `deps: none`.

## Task 272 — Usage meter red at 90%
- One-line threshold change `pct >= 95` → `pct >= 90` in `UsageBar.tsx` + matching comment
  updates. `deps: none`.

## Task 273 — Canvas "+" tab icon size
- The button boxes are already 20px-equal; the `Plus` glyph just *looks* lighter than
  `LayoutTemplate`/`Grid2x2`. Fix = bump `<Plus size={14}>` → `size={16}` (and strokeWidth
  if needed). `deps: none`.

## Task 274 — Template editor block-config layout
- "Kanban template editor" = the **Canvas `TemplateEditor`**. Two CSS fixes: path-mode
  buttons `.pathModeBtn` drop `flex:1` → `flex:0 0 auto` + min-width (compact pair); prompt
  `.configInput`/`.configField` flex to fill (raise min-height ~140px). `deps: none`.

## Task 275 — Export/import Canvas templates
- User's "Kanban template" = the **Canvas Template** system. **Import included** (round-trip
  for sharing). Export via native save dialog + `write_text_file(parentDir, base)` reusing
  the #163 parent-dir-as-root consent trick; import via `pickFile` + `read_text_file` +
  validated `parseTemplateJson` + `saveTemplate` (fresh id). Add `dialog:allow-save`
  capability if missing. No new backend write command. `deps: none`.

## Task 276 — Kanban: Enter creates card + reopens composer
- `submitComposer` success path stops calling `cancelComposer()`; instead clears text + keeps
  `composing=true` + re-focuses. Empty Enter / Escape still close. `deps: 257` (built on the
  resized composer; same file).

## Task 277 — Kanban: transient undo on card delete
- New panel-local `lastDeleted {col,idx,card}` (component state → non-persisted) captured
  before `deleteCard`; new pure `insertCardAt` op (kanbanOps) for undo; undo affordance
  rendered at the deleted spot in BoardColumn; overwritten by the next delete; cleared on
  file switch. `deps: 276` (serialize the kanban-UI cluster 257→276→277).

## Task 278 — Diff seen marker (3-state)
- Client-side per-file **content digest** (`status|add|del|hash(hunks)`) detects
  changed-since-seen (no backend metadata). **Persisted in a dedicated Rust `diff_seen`
  scalar** (`{repoPath:{filePath:digest}}`), kept out of the settings blob (so the Settings
  draft can't clobber it). Icons-only (Eye/Check/AlertCircle), button + `s` keybind (works
  with a single file; plain key, cross-platform), both Focused + Accordion, visible hints.
  `deps: 258` (shared DiffInspector; interacts with occurrence ordering).

## Task 279 — Scheduled worktree duplicate top-level folder
- Cause: `onFired` prepends the **worktree folder** to `recents` → a phantom top-level
  RepoGroup (live-only artifact; backend adds the parent `sched.cwd` instead). Fix: for a
  worktree session, `onFired` adds the **parent** (or nothing) to recents, matching the
  interactive worktree path + a restart. `deps: 259`.

## Task 280 — Canvas "no longer pending" (fire + detached)
- (1) On fire, **rewrite scheduled canvas leaves** to the new live session id (pure
  `rewriteScheduledLeaves`, preserve leaf id; persist via `setCanvases` which broadcasts
  `canvas://changed`). (2) Detached windows are schedule-blind (main-window-only gating):
  **load schedules in detached windows + sync** (prefer a `schedule://changed` broadcast
  mirroring `canvas://changed`; minimal fallback = re-`listSchedules` on
  `schedule://fired`/`canvas://changed`). `deps: 279` (both edit `onFired`).

## Task 281 — Release v1.0.2
- Bump `tauri.conf.json` + `package.json` to 1.0.2; author `src/patchnotes/1.0.2.json`
  (categories feature/improvement/fix, user-facing prose, **regenerated from
  `git log v1.0.1..HEAD` + TASK_ARCHIVE at implementation time**). The *implementing* agent
  performs the bump (refine lane never bumps). Push to main triggers the pipeline → draft →
  maintainer publishes. Out of scope: build/sign/publish. Mirrors #256.
- **`deps:` ALL of 257–280** — the release gates on every refined task being implemented.
