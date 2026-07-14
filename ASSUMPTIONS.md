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
  **Updated for Task 282:** `deps:` now also includes **282** (the pre-release Windows-parity
  audit must land before v1.0.2 is cut). PLAN-281.md's Dependencies section is updated to match.

## Task 282 — Windows parity audit (pre-release gate for v1.0.2)
- The terse card ("Using the '/windows-parity-audit' skill … check the system for windows
  compatibility … Do this before release task 281") is refined as a **fix-mode** audit, not a
  report-only pass: the explicit purpose is to ensure parity *before shipping*, so the task
  audits → confirms → **applies remediations** through ReCue's established seams (macOS arm
  byte-for-byte, Windows arm additive + `#[cfg]`/`platform`-gated).
- **Always produces a reviewable PR.** Because the pipeline deliverable is a PR, the implementer
  **always appends a dated audit entry to the tracked `TRAJECTORY_TO_WINDOWS.md`** (scope ·
  findings or explicit "clean" · fixes · pending real-box checks) — so the diff is non-empty
  and durable even in the (likely, given the port's maturity) case of few/zero code fixes.
- **The implementer cannot fan out `Agent` subagents** (the `worktree-implementer` has only
  Bash/Read/Write/Edit/Glob/Grep). So the plan directs it to run the skill's
  `windows-landmines.md` **grep seeds itself** (single-agent, all 13 categories) and confirm
  each hit by reading — rather than the skill's default Explore fan-out. The catalog is built
  for this grep-driven sweep.
- **`deps: 280`** — the audit covers the **final** shipping code, so it gates on the last
  in-flight feature fix (Task 280) to avoid auditing a moving target; 257–279 are already
  archived. The release (281) depends on 282, giving the order **280 → 282 → 281**.
- Scope = whole codebase, with extra confirmation effort on the newest, possibly-unaudited
  code since the port stabilized (#202/#231/#237/#252/#253/#254/#255/#275/#277/#278). Out of
  scope: the version bump/patch notes (Task 281) and performing the real-box manual checks
  (those are logged for a maintainer, not run in CI).

## Task 283

- **"Next column" = the immediately adjacent column to the right** in document/array order
  (`board.columns[fromCol + 1]`). Columns render left-to-right in `columns` order, so "move all
  one column to the right" is unambiguous; the **rightmost column gets no button** (nothing to
  its right, and no left variant was requested).
- **An empty column shows no button.** The pure op no-ops on an empty source, and a dead button
  is noise — so the button renders only when `canMoveRight && cards.length > 0`.
- **Cards append into the target** (after its existing cards), matching `moveCard`/`addCard`
  which both append, rather than prepend.
- **Moved cards keep their `checked` state** — no auto-"complete" even when the target is the
  Obsidian `**Complete**` lane. Drag-moves preserve `checked` verbatim; this op matches that, and
  `complete` is inert outside parse/serialize.
- **No confirm gate.** The move is non-destructive and trivially reversible (one markdown write;
  target cards untouched), so it is not gated behind `settings.confirmDestructive`, consistent
  with the ungated drag card-moves.
- **Icon/placement:** a single right-arrow lucide icon (`ArrowRightToLine`/`ChevronsRight`) in the
  existing hover-revealed `.columnActions` header span, reusing `styles.colBtn` — no new CSS, no
  new column-level chrome beyond this one button.

## Task 284

- **Chosen chord: ⌘E / Ctrl+E (Cmd/Ctrl+E).** *(Revised: the first pick `⌘⇧M` was returned by
  the user as "a bad keybind — think of something simpler", so this is now a simpler two-key
  chord.)* E = **E**nlarge/**E**xpand to big mode (matches the `Maximize2` icon). On macOS
  ⌘-combos never reach the terminal (the capture-phase handler `stopPropagation`s it), so it is
  fully Claude-safe; it deliberately avoids `⌘M`/`Ctrl+M` because **`Ctrl+M` is carriage-return
  (Enter)** in a terminal — a direct in-Claude conflict — and `⌘M` is the macOS *minimize*
  shortcut.
- **Rejected alternatives (recorded so the implementer doesn't re-litigate):** `⌘⇧M` — rejected
  by the user as not simple enough; `⌘M`/`Ctrl+M` — `Ctrl+M` is the terminal carriage-return and
  `⌘M` is macOS minimize; `⌘⏎` — already the worktree-create gesture in the NewSessionModal
  (#74/#204); bound app letters S/N/B/K/T and `⌘⇧N` (schedule) are taken.
- **Windows tradeoff (accepted):** the capture-phase handler shadows `Ctrl+E` (readline
  end-of-line) inside Windows terminals — consistent with the app already shadowing
  `Ctrl+B/K/N/T/S`; Claude Code's TUI does not rely on `Ctrl+E`. macOS has no such tradeoff.
- **Toggle semantics:** one chord both opens (when closed) and closes (when open) — `if
  (maximizedItem) closeMaximized() else maximize the selected item`. Pressing it with **nothing
  selected** is a **safe no-op** (no empty modal).
- **"Selected item" = `selectedId`,** resolved to a `CanvasContent` the same way the existing
  click-to-maximize buttons supply one — preferring the active Canvas leaf's `content` in Canvas
  view, else mapping the session/schedule/Overview-panel id (reusing `overviewPanelToContent`).
- **Works in both windows and both views** (Overview + Canvas, main + detached canvas) — not
  gated on `IS_MAIN_WINDOW`, since big mode is mounted in the detached window too.
- **Discoverability:** the chord hint is appended to the existing `Maximize2` button tooltips via
  `kbdHint`/the cached `platform` signal (⌘ on macOS, Ctrl on Windows) — never a hardcoded ⌘.
- The Windows keyboard path is a GUI real-box check; logged to `TRAJECTORY_TO_WINDOWS.md` if it
  can't be unit-verified, per the cross-platform requirement.

## Task 285

- **"Near the agent on that branch/worktree" = insert immediately after the agent that shares the
  new panel's folder.** A worktree agent's `repoPath` *is* the worktree folder, and every panel
  entry point already passes that folder as `addOverviewPanel`'s `repoPath`, so the anchor is the
  session with `s.repoPath === repoPath` (the worktree agent; for a normal repo, that repo's
  agent). On a tie, prefer the **selected** agent in that folder.
- **A "specific branch" is identified by its folder, not a new branch field.** ReCue tracks
  branch per repo path and a worktree is the concrete per-branch folder; folder identity is what
  the entry points already carry, so no new plumbing/field is introduced.
- **Reposition only when an agent shares the folder.** If no agent runs in the panel's folder
  (the ordinary "add a panel to a repo" case), the established **append-at-end** behavior is left
  untouched — this is an additive nicety for the worktree/active-agent case, not a global
  reordering of all panel creation.
- **Implemented inside `addOverviewPanel`** (one source of truth) so all entry points — worktree
  card header `OpenViewButton`, sidebar `WorktreeHeader` `ViewsMenu`, ExtraPanel header,
  `CreatePanelModal`, `openFileFromTree` — benefit at once. **Dedup hits and terminal-spawn
  failures do not reposition.**
- **Persistence reuses `reorderOverview` → `set_overview_order`** (the existing drag path); the
  render order is computed via the same `overviewClusters`/`mergeRepoOrder` the UI uses so it
  can't drift, and a later manual drag still wins and persists.
- **Overview-only.** The sidebar already nests a worktree's agents and panels together under its
  `WorktreeHeader`, so adjacency there is inherent; only the Overview cluster's intra-order needed
  fixing.

## Task 286

- **"The update modal (inside settings)" = the Settings → Updates pane**, not the separate
  sidebar-indicator `UpdateModal` confirm dialog. The patch-notes-vs-install-button layout the
  card describes only exists in the Settings → Updates section (`Settings.tsx`, `section ===
  "updates"`); the confirm dialog has no patch notes.
- **"Above the patchnotes" means the not-yet-installed update's "What's new" block** (the
  release-carried `updateState.notes`) shown in the available/downloading `.field`. The fix
  moves the **"Update now & restart"** button (and the downloading progress bar that replaces
  it) to sit immediately under the "Update available · v<version>" label, before that notes
  block. The running-version `PatchNotes` ("What's new in this version") section is unrelated
  and left as-is.
- **Pure render-order change, no scroll cap added.** The card's concern ("button moved off
  screen") is solved by ordering the button first; adding a `max-height`/scroll to the notes
  slot is not required and is out of scope.

## Task 287

- **"The install available popup in the bottom left" = the sidebar-footer `UpdateIndicator`
  chip** (`src/components/Update/UpdateIndicator.tsx`), shown above the Settings gear when an
  update is available. It is the only update-related element with a "blinking" animation (the
  #216 `update-announce` 3× pulse) and the only one positioned bottom-left.
- **The new effect is a CONTINUOUS (infinite) gentle glow, not a one-shot.** The card asks for
  something "easy to spot"; the existing one-shot pulse only shows for ~2s on first appearance,
  so it is replaced with a slow, low-intensity infinite breathing glow that runs the whole time
  the update is available. **This deliberately overrides #216's one-shot `updateAnnounced`
  guard**, which is removed.
- **"Glowing border with a transition in color" = a soft accent box-shadow + a border-color
  that eases within the accent family** (accent ↔ accent-hover), never going fully transparent
  (which is what made the old pulse read as a blink).
- **Reduced motion = static glow.** Because the global killswitch only zeroes animation timing,
  the glow class also sets a static resting box-shadow/border (matching the 0%/100% keyframe), so
  reduce-motion users still see a clearly-distinguished static glowing border.
- **Scope = the available state only.** The "Update failed" error variant keeps its current
  treatment (no glow added).

## Task 288

- **"A simple '>' arrow" = the Lucide `ChevronRight` icon.** It is the closest single-glyph `>`
  chevron in the project's icon set (lucide-react), matching the card's request over the current
  `ArrowRightToLine` (→|).
- **Same metrics, glyph only.** Size (13), stroke (1.5), title/aria-label, visibility condition,
  and the `moveAllCardsRight` handler are all preserved; only the rendered icon changes.
- **This is the app's Kanban board UI** (`components/Kanban/KanbanPanel.tsx`, the #283 move-all
  button), not the development pipeline's `KANBAN.md` files.

## Task 289

- **"Prefilled prompt" = the placeholder text, not an actual value.** I traced every path: the
  schedule modal's `prompt` state is always `""` (init + reset), `SkillAutocomplete` is fully
  controlled with no internal default, `openSchedule` seeds nothing, and the backend
  `create_schedule` drops a blank prompt with no default injected at fire time. The only thing
  visible in the empty field is the placeholder `"Initial prompt for claude…"`, which the user
  reads as a pre-filled prompt — so "just leave it empty" means **remove that placeholder**.
- **Scope = the NewSessionModal schedule step only.** The "Prompt (optional)" label already
  names the field, so no placeholder is needed there. The separate `ScheduledPanel` (editing an
  existing schedule, where a saved prompt shows as a real value) is intentionally left unchanged,
  and the immediate new-session flow has no prompt field at all.
- **`ariaLabel="Initial prompt"` is kept** so the field retains an accessible name without the
  visible placeholder.

## Task 290

Card (terse): "Resolve any dependency vulnerabilities (if there are any). Make sure to check
everything properly and audit. If no vulnerabilities are found, you may drop this task."

- **Audited BOTH ecosystems, not just npm.** "Check everything properly" for a Tauri app means
  the npm/Vite frontend (`npm audit`) **and** the Rust/Cargo backend (`cargo audit` over
  `src-tauri/Cargo.lock`). I installed `cargo-audit` (0.22.2) and ran both.
- **Did NOT drop the task.** The card allows dropping "if no vulnerabilities are found", but
  `npm audit` found **1 low-severity** vulnerability (esbuild `>=0.27.3 <0.28.1`,
  GHSA-g7r4-m6w7-qqqr, dev-server file-read on Windows), transitive via `vite@7.3.5`. It is
  genuine and fixable, so the task proceeds.
- **"Resolve vulnerabilities" = fix actual security VULNERABILITIES; the Rust advisory
  WARNINGS are documented-and-accepted, not chased.** `cargo audit` returns **0 vulnerabilities**
  but 18 warnings (16 unmaintained + 2 unsound), all transitive: 10 gtk-rs GTK3 crates + `glib`
  (Linux-only Tauri webkit backend, not compiled on macOS/Windows), plus `proc-macro-error`,
  the `unic-*` family, and `anyhow` (not a direct dep; ReCue uses `thiserror`). None are
  exploitable and none have a ReCue-side fix (they'd require upstream Tauri changes). I judged
  chasing them out of scope and instead have the plan document them as reviewed/accepted.
- **Fix mechanism = bump `vite` to `^7.3.6` (NOT vite 8.x) + move esbuild to 0.28.1.** vite
  7.3.6 (a patch already inside the repo's `^7.0.4` range) declares `esbuild "^0.27.0 ||
  ^0.28.0"`, so it officially supports the fixed esbuild 0.28.1. Chose the minimal in-major
  patch bump over a vite-8 major upgrade (lower risk) and over blindly force-overriding esbuild
  under vite 7.3.5 (which only supports `^0.27.0`). Noted that a vite bump alone won't upgrade
  the already-satisfying transitive esbuild, so the plan explicitly also moves esbuild
  (`npm update esbuild`, or an `overrides.esbuild` fallback) and verifies with a green
  `npm run build`/`npm test`.
- **Durability + no CI gate.** The fix must persist (commit `package-lock.json`), but adding
  `npm audit`/`cargo audit` to CI was not requested, so it's out of scope.

## Task 291

Card (terse): "Filetree folder contextmenu should have additional options: Copy absolute path,
Copy relateive path, Reveal in finder, Rename".

- **Scope = the FOLDER branch of the FileTree's existing inline context menu only.** The card
  says "folder contextmenu". The FileTree already has its own inline menu (not the Sidebar's
  `RowContextMenu`); its **file** branch already implements Reveal + Copy absolute + Copy
  relative, and its folder branch has only New folder… / Delete folder. So the work is adding
  the four items to the folder branch. **"relateive" is read as "relative".**
- **NOT adding Rename to the file menu.** The card asks for the folder menu; files aren't in
  scope. The new generic `rename_path` command means a later card could add a file Rename
  cheaply, but I kept this task to folders to avoid scope creep.
- **Reveal semantics for a folder = OPEN the folder (`revealPath`/`os_open`), not select-in-
  parent (`revealFileInFinder`/`open -R` / `explorer /select`).** Chosen to match ReCue's
  established precedent for **folders** (the sidebar repo menu's "Reveal in Finder" opens the
  repo folder via `reveal_path`) and to reuse the FileTree file-menu code verbatim. The
  select-in-parent variant was considered and rejected for consistency.
- **Rename needs a NEW backend command `rename_path(repo, from, to)`.** No in-repo rename/move
  exists (`move_into_repo` only moves an *external* path *in* and forces the source basename).
  Reuse the existing validators — `confine` (in-repo, rejects `..`/symlink/escape) +
  `validate_new_segment`/`windows_safe_seg` (rejects separators + Windows-reserved names) — plus
  a no-clobber check and `fs::rename`. This is cross-platform by construction (CLAUDE.md hard
  requirement).
- **Rename UX = inline input reusing the New-folder form (a new `"rename"` menu mode), seeded
  with the current name, Enter-to-commit / Escape-cancel, blank/unchanged = no-op, NOT
  confirm-gated** (a rename is reversible; matches ungated *New folder…*, unlike gated Delete).
- **Menu item order:** New folder… → Rename… → Reveal → Copy absolute path → Copy relative path
  → Delete folder (danger, last) — mirrors the file menu's reveal/copy ordering and keeps the
  destructive action at the bottom.

## Task 292

Card (terse): mic/voice prompt asks ~5×, allowing each time still doesn't work; same for the
Downloads folder. "Investigate the issue and solve it."

- **Diagnosed as a macOS TCC + code-signing bug with ONE shared root cause** (mic *and*
  Downloads). Confirmed against Apple's TCC model and `anthropics/claude-code#33023`: the mic
  needs the **`com.apple.security.device.audio-input` entitlement in the code signature** (the
  `NSMicrophoneUsageDescription` in Info.plist is present but **not sufficient**), entitlements
  **only apply under Hardened Runtime**, and TCC only **persists** grants for an app with a
  **stable code signature**. ReCue today has **no entitlements file, no Hardened Runtime, and no
  Apple code-signing identity** (the pipeline's "signed" = minisign *updater* artifacts only).
  So: the prompt appears (usage string) but access is denied after Allow (no entitlement) and
  never remembered (unstable signature) → "asks 5×, still fails."
- **Deliberately REVERSING the project's "no code signing / notarization" scope decision.** It
  is the direct cause of the bug, so solving the card requires introducing signing + Hardened
  Runtime + entitlements. Chose this over any app-code workaround (there is none — the request
  comes from the child `claude` process). Recorded like prior reversals (Settings #100,
  multi-window #84, Fork #126).
- **Kept it ONE card (not split into local-fix vs CI-notarization).** The user's report doesn't
  distinguish a local build from the distributed DMG, so the plan delivers both: the always-free
  entitlements/Info.plist/Hardened-Runtime config + a **local self-signed/ad-hoc signing script**
  (fixes the user's machine with no Apple account) **and** guarded **Developer-ID + notarization
  CI wiring** (distribution-grade persistence, activated when the maintainer adds secrets).
- **Entitlements kept minimal:** `audio-input` (required) + `disable-library-validation` (so a
  Hardened-Runtime app with a non-Apple signature still launches). **Explicitly NOT enabling the
  App Sandbox** (would break PTY spawning / filesystem reads; folder access is TCC-governed, not
  sandbox-governed) and not adding JIT entitlements unless a launch failure proves they're needed.
- **Downloads symptom** handled by the same signing-persistence fix plus adding the protected-
  folder usage strings (`NSDownloadsFolderUsageDescription` + Documents/Desktop/RemovableVolumes)
  so the folder prompt is attributable and reasoned; assumed the request is attributed to **ReCue**
  as the responsible process (per the existing Info.plist rationale), to be confirmed on a real box.
- **All changes are macOS-bundle-only** (Info.plist / Entitlements.plist / `bundle.macOS` /
  release.yml macOS leg) — Windows & Linux untouched, honoring the cross-platform requirement.
  Verification is largely **manual on a real Mac** (a GUI/TCC/signing path that can't be CI-tested).

## Task 293

Card (terse): right-clicking the left panel base (not an item) should offer "Kill all agents" and
"Close all items" that act on all agents/items across ALL folders.

- **Append to the EXISTING empty-area background menu (#172), not a new menu.** The sidebar
  already has a target-guarded right-click "background" menu (`openBgMenu` on the repo-list
  container, only firing on the empty base, feeding `bgMenuItems`→`RowContextMenu`). The two
  global items are appended there; no new trigger is built. This also covers the collapsed rail's
  empty area and the "No repositories yet." hint for free.
- **Global "Close all items" mirrors the per-repo #91 semantics:** kill all agents + remove all
  non-agent items (file/diff viewers + shell terminals w/ PTYs), but **keep folders in `recents`
  and do NOT cancel schedules** (cancelling schedules / forgetting folders is the more
  destructive Forget-folder path, not requested here).
- **Items shown conditionally, mirroring per-repo:** "Kill all agents" only when ≥1 agent runs
  app-wide; "Close all items" only when ≥1 agent runs OR ≥1 non-agent item exists — so the menu
  never offers a no-op destructive item.
- **Honor `confirmDestructive` (#103) via a small backward-compatible inline-confirm extension to
  `RowContextMenu`** (an optional `confirmLabel` on `RowMenuItem`; first click swaps to a danger
  confirm button), rather than adding a modal. The flat background menu can't do the per-repo
  inline confirm-mode swap today, and every existing caller omitting `confirmLabel` is unaffected.
  Confirm for "Close all items" only when it would actually kill agents (mirrors per-repo).
- **Reuse the existing store helpers** (`killAgentsInRepo`/`closeRepoItems`) by iterating the
  authoritative parent-folder set (`worktreeParent ?? repoPath` ∪ recents ∪ overviewPanels keys),
  so worktree agents are killed via their parent with correct #74 ref-counted cleanup and one
  summary toast (no per-folder toast spam).
- **Pure frontend/store** (no OS-specific code) → identical on macOS and Windows.

## Task 294 — Three-dots session-options menu + Recurring sessions

Card: "Next to the 'schedule session' button, make a small button with three dots ... dropdown
menu with additional session options. The first option ... is a 'recurring session' ... repeats ...
It can both be scheduled ... but also repeated. User enters a 'repeats' field (e.g. every hour /
every day). Stays available in the left panel as long as active. When the trigger hits, the previous
session process is killed and the new session spawned in its stead, in the same panel (so it doesn't
constantly spawn new panels)."

Interpretations chosen (assume-variant):

- **Foundational split.** This card builds BOTH the reusable ⋯ overflow menu (shared infrastructure)
  AND its first item, the Recurring session. Later cards (Clone Repo, Auto-continue) add their own
  entries to the same menu and therefore depend on this one. The menu is not shipped empty — the
  Recurring item is its first, testable entry. Kept as one card because splitting the menu from its
  only item, or the recurring backend from its UI, yields untestable/non-shippable halves.
- **Recurring session = a first-class persisted record that OWNS a rotating child agent session**,
  modeled closely on the existing Scheduled-session subsystem (#93/#94) but persistent + self-re-arming.
  Not a bare session, and not a one-shot ScheduledSession. This is the model that cleanly satisfies
  every clause of the card (scheduled OR immediate first run; stays in the sidebar; same panel).
- **"Same panel" / "doesn't spawn new panels"** = the sidebar row / Overview card / Canvas panel key
  on the stable **recurring id** (new content `kind: "recurring"`) and render the *current* child
  session's pooled terminal, so a fire only swaps the hosted child terminal — never creates a new
  row/column/panel. The child session is **owned, not independently listed** (excluded from the normal
  session row/card lists via the recurrings' `current_session_id` set); its PTY is kept alive by adding
  those ids to the `App.tsx` reconcile `active` set.
- **Fire semantics:** on each interval fire the poll loop kills + forgets the previous child (no
  lingering exit overlay), spawns a **fresh** claude session (new uuid, NOT `--resume`) seeded with the
  recurring session's prompt, sets `current_session_id`, advances `next_fire_at += interval_secs`, and
  emits `recurring://fired`. Fresh-each-cycle (not resume) is the read of "spawned in its stead"; it
  also sidesteps any `--session-id <existing>` reuse ambiguity.
- **"Repeats" field** = a numeric amount + unit dropdown (**Minutes / Hours / Days**), minimum **1
  minute**, stored as `interval_secs`. No cron / weekday scheduling (out of scope).
- **"Can both be scheduled":** the recurring creation step has an optional **first-run time**
  (free-text, default "now" via the existing `parseWhen`). Immediate = `next_fire_at = now` (fires on
  next ≤5s poll tick); scheduled = a future `next_fire_at`.
- **Restart/catch-up:** recurring records persist across restarts; on boot nothing auto-spawns unless
  due, then the first poll tick fires anything overdue once (mirroring schedule catch-up) and resumes
  cadence. A child live at shutdown is gone on boot (PTY not resumed); the item shows a "next run in …"
  placeholder until the next fire.
- **Failure handling:** unlike a one-shot schedule (which is dropped on fire error), a recurring record
  is KEPT on spawn failure and its `next_fire_at` is still advanced, so a failing folder can't hot-loop.
- **Menu placement:** the ⋯ button sits immediately right of the expanded-sidebar "Schedule session"
  button (both wrapped in a flex row); the dropdown reuses the existing `RowContextMenu` primitive; the
  same items are also added to the background (empty-area) context menu. The collapsed icon rail is left
  unchanged (out of scope).
- **Cross-platform:** no new shell-outs beyond reused git seams; ⋯ button/menu/CSS use design tokens +
  existing primitives → identical on macOS and Windows.

## Task 295 — Clone Repo

Card: "Clone option; clones git repo and checks out main branch. Creates main branch if doesnt exist.
Also in the dots menu next to schedule session. 'Clone Repo' it will start a session inside the newly
cloned repo on the default branch."

Interpretations chosen (assume-variant):

- **Destination = a user-picked parent directory; the repo clones into `<parent>/<repo-name>`**, with
  the name derived from the URL basename (strip trailing `/` and `.git`; handle `https://…/owner/repo.git`
  and `git@host:owner/repo.git`). Matches plain `git clone <url>` behavior. Refuse if the derived folder
  already exists and is non-empty (no overwrite — data safety).
- **"Checks out main / creates main if missing"** = after clone, if a local `main` branch exists check it
  out, else create `main` from the cloned HEAD (`git checkout -b main`, which also covers an unborn/empty
  clone) and check it out. The card's closing "on the default branch" is read as this same `main`.
- **Auto-start a session on success**, on `main`, as a normal interactive agent (no seeded prompt),
  reusing the existing `spawnSession` path — no extra new-session modal step.
- **Synchronous clone with a busy state**: the modal shows "Cloning…", disables inputs, blocks until the
  backend returns, and shows git's stderr inline on failure. Large clones block the modal (accepted for v1;
  flag in TRAJECTORY if async is wanted later).
- **Fail-fast on auth**: reuse the `fetch_remotes`/`pull_ff` network guards — `GIT_TERMINAL_PROMPT=0` +
  `GIT_SSH_COMMAND="ssh -oBatchMode=yes"` — so an authed/private remote errors instead of hanging a GUI
  process on a credential prompt (no in-app credential UI in scope).
- **Menu entry** "Clone Repo…" is added to the ⋯ dropdown built in Task 294 and to the sidebar background
  context menu, opening a dedicated `CloneRepoModal`.
- **Cross-platform**: git shell-out via `hidden_command`; dest path via `PathBuf::join`; frontend passes
  whole paths (backend computes/returns the dest) — identical on macOS and Windows.

## Task 296 — Auto-continue Claude agents after the usage limit resets

Card: "Auto continue after limit is reset. In the dots menu ... a checkable option; shows a checkmark
if enabled (also show it in settings). Only show this option if claude code is the default agent,
otherwise the setting is disabled by default / shown disabled in settings. When the limit is reached it
knows when it will reset; waits for the limit to hit 0% again (do not poll alone, also look at the known
reset time). Once it resets, sends input to all claude agents that were running: enter, 'continue',
enter."

Interpretations chosen (assume-variant):

- **Single boolean setting** `autoContinueAfterLimit` (default false) backs both the ⋯-menu checkable
  item and a Settings → Sessions toggle; they stay in sync.
- **Claude-only gating:** the ⋯-menu item is shown only when `defaultAgent === "claude"`; the Settings
  toggle is always visible but disabled/greyed and treated as off when the default agent isn't Claude
  (with a "requires Claude as default agent" hint), re-applying the stored value when switched back.
- **Frontend/store-only** — no backend changes. `usage.rs` already returns `usedPercent` + `resetsAt`,
  and `write_stdin` already accepts arbitrary bytes; the arm/wait/fire state machine lives in the store,
  main-window-only, driven by the existing usage poll. Runtime arm-state is transient (not persisted).
- **Limit-reached signal = the usage snapshot** (`usedPercent >= ~100`), NOT terminal-output scraping
  (the monitor never inspects output content; scraping claude's message is fragile and out of scope).
- **Reset confirmation uses BOTH signals** (honoring "do not poll alone"): reset ⇔ `now >= resetsAtMs`
  AND `usedPercent` dropped below a confirm threshold (~90). If the API omits `resetsAt`, fall back to
  the percentage dropping alone.
- **Tighter polling while armed** (~45s) so the continue fires promptly after reset, reverting to the
  180s base cadence when disarmed; bounded, main-window-only.
- **Nudge target = the live Claude sessions captured at the moment the limit was detected**, intersected
  with those still alive (and still Claude) at reset time; exited/newer unrelated sessions are skipped.
  Non-Claude agents are never nudged.
- **Continue sequence follows the card literally** — per session, in order: Enter (`"\r"`), type
  `"continue"`, Enter (`"\r"`), with tiny inter-send delays; isolated in a `sendContinue(id)` helper so
  the exact sequence is a one-line change if a real rate-limited Claude session shows the leading Enter
  is unhelpful (fallback `"continue\r"`). Flagged for real-CLI sanity check.
- **Checkable menu item** = extend the existing `RowMenuItem` (Sidebar.tsx) with an optional
  `checked?: boolean` (backward-compatible, like the #293 `confirmLabel` extension) rendering a leading
  checkmark; all existing menu items are unaffected.
- **Fail-open:** unavailable usage data ⇒ the feature is inert (no false nudges).
- **Cross-platform:** frontend-only; `writeStdin` is platform-neutral → identical on macOS and Windows.

## Task 297 — Per-agent opt-out for auto-continue-after-limit

Card: "Expand on the auto continue feature. Individual agents show a little 'Auto continue after limit
reset is enabled' per agent with a clickable checkbox that will disable this feature for one specific
agent. This gives user full control over the flow."

Interpretations chosen (assume-variant):

- **Per-session opt-out persisted on the session record** as `auto_continue_disabled: bool`
  (`#[serde(default)]` false = active), set via a small `set_session_auto_continue(id, disabled)` command
  — mirroring existing per-session persisted flags (rename/`has_been_active`). Persisted (not transient)
  so a disabled long-running/resumed agent stays disabled across restarts ("full control"); auto-cleaned
  when the session is removed.
- **Default = inherit the global setting:** a new agent is not disabled, so with the global option on it
  participates; unchecking the box disables it for that agent only, never touching other agents or the
  global setting.
- **Visibility:** the per-agent checkbox is shown ONLY for Claude agents AND only when the global
  `autoContinueAfterLimit` (Task 296) is enabled — when the global option is off (or the agent isn't
  Claude) there's nothing to opt out of, so it's hidden.
- **Placement:** on the agent's Overview card (`AgentCard`) and its Canvas panel (`CanvasSurface`) — the
  two agent surfaces with room for chrome; the Canvas control stops event propagation so it doesn't start
  the #144 header drag. The cramped 10px sidebar row is left unchanged (out of scope). Label wording:
  "Auto continue after limit reset"; checked = active for this agent.
- **Fire-step exclusion:** the Task 296 auto-continue fire step excludes sessions with
  `auto_continue_disabled === true` (preferably by filtering the `liveClaudeIds` fed into the pure
  `evaluateAutoContinue` reducer at the call site, keeping the reducer agnostic), covered by a unit test.
- **Cross-platform:** a `#[serde(default)]` record field + a tiny command + frontend UI, no OS-specific
  code → identical on macOS and Windows.

## Task 298

Card: "In the clone model it says 'clones repo and checks out main'. But this is false. It clones
and checks out the default branch (or should, check if this behaviour is configured). IF NO BRANCH
EXISTS. Then it needs to create a main branch and check it out. You can also just remove this
comment entirely from the clone modal. But make sure the flow works correctly."

- **Primary intent = correctness of the flow, not just the copy.** The card gives two options
  (fix the flow to land on the default branch, OR just remove the misleading comment) but ends
  with "make sure the flow works correctly." Interpreted the primary requirement as: the clone
  should land on the **repository's actual default branch** (whatever the remote HEAD points at),
  not a forced `main`. The current backend `git::ensure_main` fabricates a `main` from HEAD for a
  `master`-default repo — that is the bug.
- **"IF NO BRANCH EXISTS → create main":** interpreted "no branch exists" as the **empty/unborn
  clone** (a remote with zero commits, so `git clone` leaves an unborn HEAD with no branch). Only
  that degenerate case creates a local `main`. A normal non-empty clone already has HEAD on its
  default branch (git does this), so the post-clone step should leave it alone.
- **The modal copy is fixed, not deleted.** The card allows removing the comment entirely, but a
  short accurate hint is better UX, so reworded it to say the clone "opens on its default branch"
  rather than removing it (removal would also be acceptable). Chose the reword.
- **Kept the clone command sync-shaped here** (no async refactor) — the non-blocking/phantom-folder
  work is deliberately split into Task 299 (which depends on 298) so 298 stays a small, safe
  correctness fix.

## Task 299

Card: "Cloning a repo can take a long time. It blocks the entire UI. It should be a background
non-blocking process. Show a 'phantom folder' in the UI left panel with a progress bar underneath
of the cloning process."

- **Progress bar = indeterminate/animated, not a real percentage.** Parsing `git clone --progress`
  stderr for byte percentages is finicky and adds cross-platform test burden; the card says
  "progress bar underneath of the cloning process" without requiring a percentage. Chose an
  **indeterminate animated bar** (with a static reduced-motion fallback) as the requirement; real
  percentage streaming is explicitly a possible future enhancement, out of scope.
- **Modal closes immediately on submit** and the clone proceeds in the background; success/failure
  is reported via **toast** (not the now-closed modal's inline error). This is the natural way to
  make it "non-blocking" from the user's view.
- **Phantom folder is a transient, in-memory, non-draggable placeholder** rendered outside the
  dnd-kit `SortableContext` in the sidebar repo list, labeled with the repo name derived from the
  URL. Not persisted across restarts; concurrent clones each get their own keyed phantom.
- **Backend goes async off the main thread** (`spawn_blocking` / async command) while keeping the
  same IPC name/shape (`clone_repo` → dest path / git error), so only the threading changes.
- **Collapsed rail:** phantoms may be omitted (or shown as a minimal indicator) in the collapsed
  rail — an acceptable simplification to avoid rail layout churn.
- **Depends on Task 298** so the background flow builds on the corrected default-branch behavior +
  fixed modal copy (and to avoid two tasks editing the clone modal/command in parallel).

## Task 300

Card: "Recurring agents dont spawn imidiatly when running them woth the 'now' parameter. They
instead start their first run after the first interval time has been started. Another issue: When
spawning a reoccuring agent; two panels are spawned. Both these panels have the same parameters but
only one shows the agent. There are some serious logic problems with the recurring sessions.
Inspect it carefully and Fix these bugs."

- **Two-panels root cause = non-idempotent optimistic add.** `store.ts createRecurring` does
  `recurrings: [record, ...s.recurrings]` with no dedupe by id; it races the backend
  `recurring://changed` broadcast (and the immediate poll-fire broadcast for a "now" recurring),
  producing two records with the same id → two identical cards, one blank (a pooled xterm attaches
  to only one DOM node). Fix: dedupe by id. Applied the same fix to the sibling `createSchedule`
  (identical latent pattern) as low-risk hardening.
- **"now" not immediate root cause = the 5s poll owns the first fire.** The create path already
  sends `first_fire_at = now`, but the poll sleeps 5s before firing and only ticks every 5s, and
  the visible card immediately shows "next run in {interval}" while the child attaches elsewhere —
  so the user perceives a delayed first run. Fix: **fire the first run at create time** when
  `first_fire_at <= now` (reuse `fire_one_recurring`, best-effort, then return the post-fire
  record). This makes "now" instant AND closes the race window driving the two-panel bug. Future
  first-fire times still wait for the poll tick (unchanged; ≤5s granularity accepted).
- **onFired hardened** so a fired event arriving before the optimistic add lands cannot leave the
  child rendered as its own standalone column (guard the child as owned / rely on the imminent
  broadcast). The child must never appear as an independent agent column.
- **No data-model or poll-cadence redesign, no "run now" button for existing recurrings** — only
  the create-time "now" and the duplicate/ghost bugs are in scope.

## Task 301

Card: "Schedule session button; if it doesnt fit on a single line, the text should have ellipses
and be cut off. Also the clock icon should not increase or decrease in size, it should always be
the same size. Also decrease the padding of the '…' button (button with dropdown menu) on the
horizontal axis. (it should keep the same height). From a users perspective, these buttons always
have the same height. That means text should not wrap."

- **Ellipsis via a wrapping `<span>` around the label** (the label is currently a bare text node,
  which can't ellipsize) with `flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis;
  white-space:nowrap`. The icon and the `<kbd>` hint get `flex-shrink:0` so only the label
  truncates.
- **"decrease the padding of the '…' button on the horizontal axis":** the `.dotsButton` already
  has `padding: 0`; its horizontal footprint is the fixed `width: 30px`. Interpreted "decrease
  horizontal padding" as **make the button narrower** — reduce `width: 30px` → ~`24px`. Height is
  untouched (kept equal via the row's `align-items: stretch`), matching "keep the same height."
- **Scope limited to the schedule action row** (the expanded-sidebar Schedule button + its "…"
  button). The collapsed-rail icon button and the New-session button are left as-is.

## Task 302

Card: "The checkmark of 'auto continue after limit reset' should be after (behind) the text not in
front."

- **"after (behind) the text" = render the checkmark to the right of / after the label**, inline
  immediately after the label text. Chose the minimal change: reorder the `RowContextMenu` renderer
  so the label comes first then the checkmark slot, and swap `.menuCheck` `margin-right` →
  `margin-left`. Right-aligning the checkmark to the far edge (flex + `margin-left:auto`) is
  optional polish only if it reads better without disturbing the danger/confirm variants.
- **Shared renderer is fine to edit:** `RowContextMenu` is shared, but "Auto continue after limit
  reset" is the only checkable item, so the reorder affects only it in practice. Did not touch the
  separate `Checkbox`-based `AutoContinueToggle` per-agent strip (different component, not what the
  card means).

## Task 303

Card: "The following options are not supposed to be in the context menu of the left panel, when
user rightclicks the plane (not any one folder, but the background plane). New session, Recurring
session, Auto continue after limit reset. Also, make the 'clone Repo' option appear underneath the
'new folder' button."

- **Only `bgMenuItems` (the background/plane menu) is edited.** Removed exactly the three named
  items (New session, Recurring session…, Auto continue after limit reset) and moved Clone Repo… to
  be the item **directly after** New folder….
- **"Schedule session" stays** in the background menu — the card did not ask to remove it.
- **`autoContinueItem`, `openNewSession`, `openRecurring` remain defined** (still used by the
  New-session button / the "…" dots menu), so removing them from this one array causes no
  unused-symbol errors.
- Together with Task 304 this reorganizes menus so Clone Repo lives solely in the background menu
  (under New folder) and the dots menu holds the session-creation extras.

## Task 304

Card: "Remove the clone repo button from the '…' context menu next to the schedule session button."

- **Only the `dotsMenuItems` array's Clone Repo… entry is removed.** `openCloneRepo` stays
  referenced by the background menu (Task 303), so no unused-symbol error.
- **Depends on Task 303** so the two adjacent menu-array edits land in sequence (avoids a merge
  conflict on the same `Sidebar.tsx` region) and preserves the "Clone Repo has exactly one home"
  invariant — it must remain reachable from the background menu, which 303 guarantees.

## Task 305

Card: "The checkmark for auto continue on limit reset checkbox should only be shown on agents
if the limit has actually been reached."

- **What counts as "limit reached"** → reuse the auto-continue machine's own arming predicate
  exactly: `usage.available && usage.usedPercent != null && usage.usedPercent >= ARM_THRESHOLD_PCT`
  (99.5%). The checkbox appears precisely when `evaluateAutoContinue` would arm — no new threshold
  invented.
- **When usage is unavailable/unknown** (no token, fetch failed, non-Claude session active, or
  `usedPercent == null`) → **hide** the checkbox (fail-safe). The store's `refreshUsage` already
  forces `usage.available = false` in all those cases.
- **No separate `isClaudeActive` gate in the component** → the store already sets
  `usage.available = false` whenever a non-Claude session is active, so `isLimitReached(usage)`
  implicitly encodes it; the component keeps its existing per-session `isClaude` check.
- **Shared helper** → introduce a single pure `isLimitReached(usage: AutoContinueUsage): boolean`
  in `src/autoContinue.ts` (co-located with `ARM_THRESHOLD_PCT`), consumed by both this task and
  Task 309 rather than open-coding the threshold twice. The `evaluateAutoContinue` reducer is left
  intact (additive helper only) to avoid churning the well-covered #296 logic.
- **Test strategy** → Vitest runs in the `node` env (no jsdom), so verification is via new pure
  `isLimitReached` unit tests in `src/autoContinue.test.ts` plus `npm run build`/`lint` and a manual
  smoke check — no component render test.
- Frontend-only + platform-neutral (identical on macOS and Windows).

## Task 306

Card: "Reoccuring sessions have a cancel button (and also the default 'x' close button). They
effectively do the same thing, you can remove the cancel button."

- **"Reoccuring sessions" mapping** → the code has **both** a one-shot `ScheduledPanel` (#94) **and**
  a genuine recurring `RecurringPanel` (#294), and both carry the identical redundant in-panel Cancel
  button. Since the user wrote "Reoccuring," the Cancel button is removed from **both** panels (covers
  the scheduled scope and the user's literal word, keeping the sibling components consistent). If only
  scheduled is wanted, drop the RecurringPanel edits.
- **Canvas / detached-window cancel path** → a Canvas panel header × only removes the leaf (it does
  not cancel the schedule), unlike the sidebar × and Overview × which cancel. The in-panel Cancel
  button is removed anyway, because every pending schedule/recurring is always cancellable from the
  sidebar row (hover-× + right-click "Cancel") and the Overview card × in the main window — no global
  capability is lost.
- **Keep store actions + "Start now"** → `cancelSchedule` / `cancelRecurring` store actions stay (used
  by sidebar + Overview); only the now-unused per-panel selectors and `.cancel` CSS are removed. The
  "Start now" button and all editing fields stay.
- No tests reference the panels' Cancel buttons. Frontend-only + platform-neutral.

## Task 307

Card: "While cloning, show a responsive loading bar with a glowing indicator. Showing that its not
stuck and is still going."

- **"Glowing indicator" concrete visual** → a moving accent "comet" glint (horizontal gradient core,
  brighter in the middle) sweeping across the bar, plus a soft accent `box-shadow` glow on the track
  that gently breathes. Uses `transform` for the sweep + `box-shadow`/`background`/`filter` for glow
  (compositor-cheap, no layout shift), mirroring the existing update-glow + BusyIndicator shimmer.
- **Keep it indeterminate** → no fake percentage; `role="progressbar"` stays with no `aria-valuenow`.
  Real % is Task 308's backend concern, explicitly out of scope here.
- **Reduced-motion fallback** → all sweep/breathe motion stops; a **static** accent glow remains so
  the bar still reads "working" without motion.
- **Scope** → enhance **both** the expanded phantom bar (`.phantomTrack`/`.phantomBar`) and the
  collapsed-rail folder icon (`.railPhantom`, a subtle accent drop-shadow glow).
- **CSS-only** → reuses the existing `.phantomTrack > .phantomBar` markup verbatim; new
  `@keyframes clone-glow` in `global.css`; no TSX/logic/Rust/IPC/store changes. Sweep easing switched
  to plain `ease-in-out` so the glint doesn't decelerate mid-track (which could read as a stall).
- **Cross-platform** → only `color-mix` (each with a plain-color fallback per repo convention),
  `linear-gradient`, `box-shadow`, `filter: drop-shadow`, `transform` — identical on WKWebView and
  WebView2/Chromium; no macOS-only `-webkit-`/vibrancy effects.

## Task 309

Card: "When session limit is reached (100%) a button should appear above the session usage bar (same
place as update button). This button says 'Enable auto restart on limit reset'. This will also enable
the auto continue setting. (button is not shown if setting is already enabled). (button can be disabled
in settings, causing it to not appear)."

- **Limit-reached definition** → reuse the shared pure `isLimitReached(usage)` in `src/autoContinue.ts`
  (`available && usedPercent != null && usedPercent >= ARM_THRESHOLD_PCT`, 99.5). Same signal Task 305
  keys off — soft consistency, no hard dependency; the reducer's arm branch is refactored to call it
  (behavior-preserving).
- **New suppression setting** → `promptEnableAutoContinueAtLimit: boolean`, default `true` (prompt shown
  by default; toggled off in Settings → Sessions). Added to the TS `Settings` type + `DEFAULT_SETTINGS`;
  the Rust `get_settings`/`set_settings` blob is opaque so **no Rust change** (verified `mergeSettings`
  spreads defaults then the raw blob, so an older `sessions.json` upgrades cleanly).
- **Button label wording** → use the card's verbatim **"Enable auto restart on limit reset"** rather
  than aligning to the "Auto continue after limit reset" checkbox wording, since the user wrote that
  label explicitly.
- **Dismissal on click** → no separate per-session dismiss; clicking sets `autoContinueAfterLimit = true`
  (idempotent, via a new `enableAutoContinueAfterLimit` store action reusing `saveSettings`), and the
  button self-hides because its visibility condition no longer holds.
- **Placement** → mounted between `<UpdateIndicator />` and `<UsageBar />` in `Sidebar.tsx` (directly
  above the usage bar); both may show simultaneously. Collapsed rail → icon-only centered chip (full
  label via `title`/`aria-label`), modelled on `UpdateIndicator`. Hidden when usage unavailable,
  `usedPercent` null, limit not reached, setting already on, or a non-Claude agent is active.
- **Cross-platform / reduced-motion** → frontend-only, on-system tokens only, glow via
  `box-shadow`/`border-color` breathe degrading to a static glow under reduced motion; no `color-mix`
  without fallback, no layout shift — identical on macOS and Windows.

## Task 308

Card: "Cloning git repos is really slow. Maybe because it clones the entire history? … Investigate and
propose a fix." (User required explicit approval before advancing — **approved** to proceed with the
blobless partial-clone fix below.)

- **Root cause** → `git::clone_repo` (`src-tauri/src/git.rs` ~line 486) runs a plain
  `git clone <url> <dest>` with no `--depth`, `--filter`, or `--single-branch`, so it downloads the
  entire object DB — every commit, tree, and **every version of every file (all blobs) across all
  history and all branches**. The blob history dominates the bytes on a large repo.
- **Recommended fix (approved)** → add **`--filter=blob:none`** (a blobless partial clone): full commit
  history + every branch ref still come down, but file blobs are fetched **lazily on demand**, so the
  initial clone is far faster. Chosen over `--depth 1` (strips history, cripples agent
  `git log`/`blame`/`bisect`) and `--single-branch` (would break the #180 remote-branch picker), because
  it preserves full history + all branches so `claude` agents and ReCue's `list_branches` /
  `fetch_remotes` / worktrees keep working.
- **Configurable vs fixed** → **fixed default, no Setting.** Simplest correct default; a toggle would add
  UX complexity for no real benefit.
- **Graceful degradation** → **rely on git's built-in fallback** — verified on git 2.55 that when the
  transport can't apply the filter (unsupported server or a local/`file://` origin), git degrades to a
  full clone and still exits 0 (only a warning, which `clone_repo` already swallows on the success path).
  No manual retry logic added.
- **Scope** → speed fix only; the clone-progress/loading-bar UX is Task 307's concern and is untouched.
  Backend-only (`src-tauri/src/git.rs`): add the arg, refresh the doc-comment, add one full-history-
  preservation unit test. Cross-platform (one added arg through the shared `hidden_command`).

## Task 310

Card: "In the schedule session modal. The input field for 'Launch time' already has an input 'in 5 min'
written beforehand. This input field should be empty when the modal is opened."

- **Placeholder — keep the existing one, add nothing new.** The schedule-step input already has
  `placeholder="e.g. 1h, 15:00, 6pm, tomorrow 9am"` plus a persistent `SCHEDULE_TIME_HINT` helper line
  beneath it — both currently masked while the field holds `in 5 min`. Blanking the field simply reveals
  the existing guidance; no new placeholder is warranted.
- **Submit gating is already safe for an empty field — no new guard needed.** `parseWhen("")` returns
  `null`, and `scheduleWhen` already gates both the "Schedule" and "Worktree" buttons (disabled when
  `!scheduleWhen`), while `submitSchedule` guards `if (!when) return`. The plan relies on the existing
  gating and adds no validation.
- **Scope limited to the schedule step's "Launch time" field only.** The recurring step's "First run"
  field (seeded `"now"` to mean run-immediately) and the `ScheduledPanel`/`RecurringPanel` editors (seeded
  from the record's real `fire_at`/`next_fire_at`) are left untouched — only the `NewSessionModal` schedule
  seed changes; recurring keeps `"now"`.
- **Remove the now-dead `DEFAULT_WHEN` constant** (rather than leave it referenced only in a comment) to
  avoid an unused-variable lint error, and refresh the adjacent comment.
- Areas touched: `src/components/NewSessionModal/NewSessionModal.tsx` (remove `DEFAULT_WHEN`; on-open reset
  becomes `setFireAt(recurringMode ? "now" : "")`). Frontend-only + platform-neutral; no test changes.

## Task 311

Card: "The modal opened by clicking 'new tab from template' should also allow the user to enter a custom
name. The newly created tab will spawn with this name. This is an optional field."

- **Field placement** → on the modal's **step 2 (folder step)**, inserted after the folder picker and
  before the Cancel / "Open template" actions row (the final confirm step where "Open template" lives).
  Not on step 1 (template list).
- **Label** → `Tab name (optional)` (matching NewSessionModal's `Name (optional)` convention, but worded
  "Tab name" so it's clear it names the Canvas tab, not an agent).
- **Placeholder** → the chosen template's name (`chosen?.name`, fallback `"Custom name…"`), so the user
  sees exactly what the tab will be called if they leave it blank.
- **Blank-field default** → whitespace-only/empty ⇒ the tab is named after the **template**
  (`tabName.trim() || template.name`), byte-for-byte today's behavior. Entered value is trimmed before use.
- **Scope of the name** → it names the **Canvas tab** (`CanvasTab.name`), explicitly separate from the
  template's per-block `new-agent` name (#136), which is untouched.
- **When it applies** → at instantiation time, threaded through `useTemplate(templateId, cwd, tabName?)` →
  `instantiateTemplate(template, cwd, genId, tabName?)` — a new optional trailing parameter, additive and
  backward-compatible.
- **Toast copy** → unchanged (`Opened template "<template.name>"`), it references the template not the new
  tab name; called out as optionally changeable but default is no change.
- **No explicit state reset needed** → the modal is conditionally mounted (`{templateUseOpen && …}`), so the
  new `tabName` `useState` resets on each open.
- Areas touched: `src/components/Canvas/templateInstantiate.ts` (+test), `src/store.ts` (+`store.test.ts`),
  `src/components/TemplateUseModal/TemplateUseModal.tsx` + `.module.css`. Pure frontend, platform-neutral.

## Task 312

Card: "Add to gitignore option inside the context menu of the file tree items (files and folders)."

- **Pattern format — files** → repo-root-relative POSIX path, leading slash, **no** trailing slash,
  e.g. `/src/foo.ts`.
- **Pattern format — folders** → leading slash **and** trailing slash, e.g. `/build/` (restricts the
  pattern to a directory). Dir-vs-file is derived **server-side** from the confined path's metadata, not a
  frontend flag.
- **Leading-slash anchoring** chosen deliberately: matches only that exact path from the repo root (no
  accidental ignore of same-named files elsewhere) and guarantees the written line never begins with `#`/`!`
  (neutralizes gitignore comment/negation leading-char semantics).
- **Glob metacharacters in a path are NOT escaped** — literal path written as-is; escaping `*?[]\` is out of
  scope (real source paths almost never contain them).
- **Idempotence = exact-line match** (`line.trim() == pattern`); if present ⇒ no write, return `false`. Does
  not detect equivalent-but-differently-written existing entries (e.g. unanchored `src/foo.ts`).
- **Create `.gitignore` if absent**; if the existing file's last line lacks a trailing newline, insert one
  before appending; append `pattern` + `\n`.
- **Not confirm-gated** — non-destructive, one click writes immediately (unlike Delete).
- **Toast copy** → appended ⇒ "Added to .gitignore" (success); already present ⇒ "Already in .gitignore"
  (info); failure ⇒ the typed error or "Could not update .gitignore" (error).
- **Tree refreshes** on success (bump `fileTreeRefresh[repo]` + `refreshFileStatuses(repo)`). Documented
  caveat: git does not ignore already-tracked paths, so an already-tracked file/folder won't visually dim
  (correct git behavior, not a bug).
- **New Rust surface** → command `add_to_gitignore(repo: String, path: String) -> Result<bool, SessionError>`;
  `files.rs` helper `add_to_gitignore(repo, rel) -> Result<bool, String>` (the sixth deliberate `files.rs`
  write). Returned `bool` = "was appended" (drives the toast).
- **Only the FileTree's `repoPath` root `.gitignore`** is written (same path `file_statuses` runs on); no
  nested/per-directory `.gitignore`.
- **Menu item always shown** for both files and folders regardless of git-repo status (writing a `.gitignore`
  into a non-git folder is harmless); label "Add to .gitignore" (identical macOS/Windows), positioned between
  "Copy relative path" and Delete, non-danger `menuItem` style.
- Areas touched: `src-tauri/src/files.rs` (+tests), `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`
  (handler reg), `src/ipc.ts`, `src/store.ts`, `src/components/FileTree/FileTree.tsx`.

## Task 313

Card: "The loading bar while cloning a repo looks terrible. Just make it a normal loading bar (revert task
that made this glow and stuff)."

- **This is a straight CSS-only revert of task #307** (the "glowing, alive indeterminate progress bar",
  commit `eaa7575`), which added all the glow/shimmer — the card's "revert task that made this glow"
  maps unambiguously to #307. The plan restores the pre-#307 (#299) plain bar.
- **The bar stays indeterminate** (a solid accent stripe sliding across a flat track via the pre-existing
  `clone-progress` sweep), not made determinate — a `git clone` gives no reliable percent. Keeps
  `role="progressbar"` with no `aria-valuenow`.
- **Style match** → restore #299's own plain treatment (a `--bg-hover` track + solid `--accent` stripe),
  already an on-system, token-only pattern consistent with the app's other bars (Update install
  `.progressBar` + `UsageBar` `.fill` both use a plain `var(--accent)` fill). Not remodeled after another
  component.
- **Collapsed-rail glow included in the revert** (not just the expanded bar): #307 added glow to both
  surfaces, so `.railPhantom`'s `filter: drop-shadow` is removed too, while **keeping** its `clone-pulse`
  opacity breathe (predates #307). Narrower reading noted: the rail change is the only "beyond the literal
  loading bar" item and could be dropped.
- **All bundled #307 tweaks restored** (track `4px→3px`, bar `45%→40%`, timing `1.15s ease-in-out →
  1.2s var(--ease-out)`) for a faithful revert; cosmetic, could be left as-is without affecting glow removal.
- **"Cloning…" row layout, dim (`opacity: 0.75`), label, folder marker, resolve-to-real-repo behavior all
  preserved** — no `Sidebar.tsx` markup change, no `store.ts` change; only CSS values + doc comments.
- **Exact glow rules to strip:** `src/components/Sidebar/Sidebar.module.css` — `.phantomTrack` (box-shadow
  lines + `animation: clone-glow`, `height:4px`), `.phantomBar` (comet `linear-gradient` bg — keep solid
  `background: var(--accent)` fallback — `width:45%`, `clone-progress 1.15s`), `.railPhantom` (two
  `filter: drop-shadow` lines); `src/styles/global.css` — remove the whole `@keyframes clone-glow` block.
- Areas touched: `src/components/Sidebar/Sidebar.module.css`, `src/styles/global.css`. No TS/Rust/markup.

## Task 314

Card: "When an agent needs permission on a macOS computer (e.g. mic for voice input) macOS asks a total of
6 times if ReCue can use the mic; clicking Allow each time doesn't help — the agent can't pick up voice.
Not exclusive to mic (also folders/system settings). Investigate and resolve; do deep research."

- **Empirically-confirmed root cause** (planner inspected the actual built `ReCue.app` on macOS 26.5.1 with
  `codesign`/`spctl`): a plain `npm run tauri build` produces a **linker-signed ad-hoc** app —
  `flags=0x20002(adhoc,linker-signed)`, **Hardened Runtime OFF**, **zero entitlements** (no `audio-input`),
  a **broken signature** (`Info.plist=not bound`, `Sealed Resources=none`), signing `Identifier=recue-…`
  (not `com.recue.app`), DR = a per-build `cdhash`. So `tauri build` **never applies** #292's
  `bundle.macOS.entitlements`/Hardened Runtime — the Tauri macOS bundler only does so when a signing identity
  is configured. #292 built the machinery; the default local/CI build silently bypasses it → the bug persists.
- **Both symptoms explained:** (a) "Allow never works" ⇒ the `audio-input` entitlement is absent + Hardened
  Runtime off, so macOS can't grant even after Allow (same for folders); (b) "asks 6 times / never persists"
  ⇒ the DR is a per-build `cdhash` + the signature is malformed, so TCC can't record/match a durable grant —
  every fresh access attempt (voice-tool polling, each new agent child, retries) re-prompts. "6" tracks
  access attempts, not a constant.
- **Process-attribution is NOT broken** — portable-pty spawns the child without disclaiming responsibility,
  so macOS already attributes the TCC request to ReCue. A runtime Rust change
  (`responsibility_spawnattrs_setdisclaim`) was evaluated and **rejected** (would make it worse). No
  `pty.rs`/frontend/in-app-UI change warranted.
- **JIT/unsigned-memory (research item 5) is a non-issue** — `node` execs as its own separately-signed
  binary (ReCue's entitlements don't govern it) and WKWebView JIT runs in Apple-signed helpers, so no
  `cs.allow-jit`/`allow-unsigned-executable-memory` needed. `Entitlements.plist` stays as-is.
- **Chosen fix (scope: bundle/script/docs only, NO runtime code):** (1) harden
  `scripts/sign-macos-local.sh` to always embed entitlements + Hardened Runtime with `-i com.recue.app`,
  default to / steer toward a **stable self-signed identity** (auto-detect, optional non-interactive create
  via `RECUE_CREATE_IDENTITY=1`, loudly-warned ad-hoc fallback — never a silent broken sign), fail-closed
  verification; (2) add a one-command `npm run build:mac`/`sign:mac` convenience so the re-sign step (whose
  omission causes the bug) can't be forgotten; (3) rewrite `docs/macos-permissions.md` root-cause + recipe +
  recovery; optional one-clause `CLAUDE.md` note.
- **Local vs Apple-account split (recorded honestly):** a **local** build is fully fixable **without an
  Apple account** via a stable self-signed cert (entitlement present ⇒ Allow works; cert-based DR ⇒ grants
  persist across rebuilds). A **downloaded release** that "just works" for arbitrary users needs the
  **Developer-ID + notarization** path (Apple account + the dormant `APPLE_*` CI secrets) — the only thing
  that also clears Gatekeeper. An optional middle path (sign CI releases with a fixed self-signed cert in a
  secret ⇒ stable TCC DR without an Apple account, Gatekeeper still warns) was evaluated and chosen to be
  **documented as future work, not wired** this task.
- **Verification on a real Mac (CI can't test GUI TCC):** automated criteria assert signature correctness
  (`codesign -dv` shows `runtime` + `Identifier=com.recue.app`; `codesign -d --entitlements` lists
  `audio-input`; `codesign --verify --strict` passes; `codesign -d -r -` shows a non-`cdhash` DR identical
  across two same-cert rebuilds). Manual smoke: `tccutil reset Microphone com.recue.app`, move to
  `/Applications` (defeat App Translocation), `xattr -dr com.apple.quarantine`, then confirm one prompt →
  Allow sticks → survives relaunch + rebuild.
- **Cross-platform** → entirely macOS-scoped; no Windows/Linux code path or behavior change; the signer +
  npm convenience are macOS-only.
- Areas touched: `scripts/sign-macos-local.sh`, `package.json` (macOS-only convenience scripts),
  `docs/macos-permissions.md`, optionally a one-clause `CLAUDE.md` note. No Rust/TS/CSS; no
  `Entitlements.plist`/`Info.plist`/`tauri.conf.json`/`release.yml` changes.

## Task 315

**Ask-variant — answers confirmed by the user via clarifying questions.**

Card: "Fix the activity-indicator flicker when an agent runs a background process — the dot
should always stay blue while a background agent is still busy, instead of rapidly switching
blue↔yellow (~0.5s)."

Root cause (established from the code): the backend monitor (`src-tauri/src/pty.rs`,
`monitor_loop`) derives busy/idle from output timing — `busy = true` only while output flowed
within a **700ms window** (`BUSY_WINDOW_MS`), re-evaluated every 200ms. A background process
(background bash task, subagent, long tool call) repaints Claude's TUI only intermittently, so
output arrives in bursts spaced **>700ms apart**: each burst flips busy→true (blue), then 700ms
of quiet flips it→false (yellow), then the next burst flips it back — the observed flicker. The
frontend `BusyIndicator` merely mirrors the store's `sessionBusy`, so the fix is purely in the
backend timing logic.

Clarifying questions asked & **user-confirmed answers**:

1. **Fix approach → "Smart flicker suppression"** (chosen over a blanket longer window, and over
   parsing Claude's on-screen background-task indicator). A normal, single finished turn still
   settles to yellow quickly (~700ms, unchanged). Only once the dot starts **oscillating**
   (output resumes shortly after it went quiet) do we switch that session into a **sticky** mode
   that holds it solid blue until activity truly stops. Agent-agnostic (pure output timing; works
   for claude/codex/opencode alike); no TUI parsing.
2. **Hold duration → "~5 seconds."** Once sticky, hold blue until there has been **no output for
   ~5s** (`BACKGROUND_HOLD_MS = 5000`), then settle to yellow. The same ~5s window is reused as
   the "re-arm" window for flicker detection: a re-activation within 5s of a settle is treated as
   flicker → sticky. Consequence the user accepted: a genuinely-finished **background** task (or a
   turn with internal >700ms pauses) takes up to ~5s to show the yellow "needs input" dot.

Derived decisions (implementation, not separately asked — natural consequences of the above):
- Keep `BUSY_WINDOW_MS = 700` for busy-**on** and for the normal (non-sticky) settle, so a plain
  turn stays snappy. Add one new constant `BACKGROUND_HOLD_MS = 5000` for the sticky hold + the
  flicker re-arm window.
- Sticky is entered on an idle→busy edge that occurs within `BACKGROUND_HOLD_MS` of the previous
  busy→idle settle (guarded so the first-ever activation and an unrelated fresh turn long after a
  settle are **not** treated as flicker). Sticky is cleared on the true busy→idle settle.
- The busy→idle **title-worker poke** (#97/#212/#252 branch + file-status refresh) now fires once
  at the true settle instead of on every flicker cycle — strictly less redundant work; those
  refreshes are debounced + idempotent, so no downstream change.
- Factor the per-tick decision into a **pure, unit-tested** helper (mirroring `next_due_wait`) so
  the hysteresis is covered by tests that run on both macOS and Windows.
- No frontend/CSS change (`BusyIndicator` and the store `setBusy` dedup already handle it);
  cross-platform-neutral (pure Rust timing, no OS-specific code).

## Task 317

Card: The "Schedule session" button text ellipsis-truncates on overflow; the same behaviour
should apply to the "New session" button.

Assume-mode decisions:

- **Current-state confirmation (matches the card).** Verified the real CSS/markup: the
  **"Schedule session"** button (`.scheduleButton`) already truncates — its label sits in a
  `<span className={styles.scheduleLabel}>` with `overflow:hidden; text-overflow:ellipsis;
  white-space:nowrap`, and the button carries `flex:1; min-width:0` (#301). The **"New session"**
  button (`.newButton`) does **not**: its "New session" text is a bare text node (an anonymous
  flex item CSS can't target) and `.newButton` lacks `min-width:0`. So the fix targets only the
  New session button, mirroring Schedule exactly — confirming the card's premise (not the
  "both missing it" fallback).
- **No native `title` tooltip added.** The reference "Schedule session" button has no `title`, and
  the card asks for the "same behaviour," so the fix omits a hover tooltip to keep the two buttons
  identical. Trivial to add later if wanted.
- **New, uniquely-named CSS classes (`.newIcon`, `.newLabel`) rather than reusing
  `.scheduleIcon`/`.scheduleLabel`.** The module has a pre-existing duplicate `.scheduleIcon` rule
  whose second definition also sets `color: var(--status-running)`; reusing it on the `+` icon
  would leak that status color, so parallel classes copy only the truncation behavior.
- **Scope limited to the expanded top-of-sidebar primary button.** The collapsed rail's icon-only
  button (no label) and the other New-session entry points (repo header `+`, worktree `+`, context
  menus) are out of scope.
- Pure cross-platform CSS (`text-overflow:ellipsis` + `min-width:0`); identical on macOS/Windows.
## Task 319

Card: Clearing recent folders inside Settings (removing all folders) should have a confirmation.

Assume-mode decisions:

- **Gate on the existing `confirmDestructive` setting rather than an always-on confirm.** Every
  sibling destructive action (TemplateManager delete, FileTree delete, KanbanPanel column delete,
  Sidebar "Forget folder" / "Kill all agents" / "Close worktree") honors the #103
  `confirmDestructive` toggle: confirm when on (the default), act immediately when off. "Clear
  recents" mirrors that exactly for consistency — low-stakes but no in-app undo, so a guard is
  warranted, while respecting the user's global toggle.
- **Reuse the established inline two-click confirm mechanism, not a new modal or `window.confirm`.**
  The app's confirm-destructive pattern is a purely-local React inline confirm: first click arms a
  local `useState` flag and relabels/danger-styles the button; second click performs; `onMouseLeave`
  cancels. No shared confirm-dialog component and no OS dialog exists. The "Clear recents" button
  follows the `TemplateManager` delete affordance 1:1 (armed relabel + danger-style class +
  `onMouseLeave` cancel). Inherently cross-platform (pure React state + CSS tokens; identical on
  WKWebView/WebView2).
- **Copy wording:** armed button reads "Clear all recent folders?" (title "Click again to clear all
  recent folders"); the existing success toast text is kept. Easily adjusted.
- **No reset-on-section-change logic beyond `onMouseLeave`:** the Settings modal remounts fresh each
  open, so armed state can't leak across opens — matching TemplateManager.
- No backend/IPC/store changes; frontend-only (`Settings.tsx` + `Settings.module.css`).
## Task 318

Card: A read-only Settings page listing all keyboard shortcuts so the user can discover the keybinds.

Assume-mode decisions:

- **Section label & icon:** eighth Settings section named **"Shortcuts"** (short enough for the
  ~168px nav) with the Lucide `Keyboard` icon (verified present in lucide-react). "Keyboard
  shortcuts" risked wrapping the nav button.
- **Nav placement:** inserted just before "Data & About" so that utility/about pane stays last.
- **Shortcut inventory scope:** the **global** shortcuts from `useKeyboardNav.ts` plus the
  widely-relevant **contextual** ones that already carry user-facing hints (`⌘S` save; DiffInspector
  `←/→`, `↑/↓`, `S`). Deliberately **excluded transient in-dialog accelerators** (CanvasCloseModal
  K/↵/Esc, CreatePanelModal 1–6/Esc, NewSessionModal `⌘⏎`/in-modal `⌘1–9` recents, generic
  Esc/Enter) — surfaced inline in their own dialogs; would bloat/duplicate a global reference. No
  shortcuts invented; every entry is code-verified.
- **Grouping:** four logical groups — Sessions / Panels & Canvas / Navigation / Files & Diff.
- **Data-module location:** a typed `SHORTCUT_GROUPS` list colocated in a new
  `src/components/Settings/shortcuts.ts` (next to the consuming section), matching the
  component-colocation convention rather than a top-level `src/shortcuts.ts`.
- **Cross-platform rendering:** each shortcut stores explicit `mac`/`win` strings rendered through
  `kbdHint(platform, mac, win)` (⌘ glyphs on macOS, Ctrl+… on Windows); platform-identical chords
  (diff arrows, `S`) use the same string for both.
- **kbd chip styling:** modeled on the existing bordered `.kbd` in `CanvasCloseModal.module.css`,
  using only existing design tokens.
- **Optional test:** a small `shortcuts.test.ts` data-shape check recommended (fits the repo's test
  culture); flagged optional since the change is display-only.
- All additive; no keyboard handlers modified. Overlaps Task 319 only in a distinct region of
  `Settings.tsx` (new `shortcuts` section vs. 319's `data` section) — independently implementable.
## Task 316

Card: Claude Code was updated recently and the five-hour usage % bar now shows nothing (falls back
to hidden). Investigate what changed and fix it.

Assume-mode decisions (root cause established empirically on the real machine, claude 2.1.193 —
not guessed):

- **Root cause is a stale/expired on-disk OAuth token, not an endpoint/schema change.** Evidence:
  the fresh macOS-Keychain token returns HTTP 200 with exactly the shape ReCue already parses
  (`five_hour.utilization`, `five_hour.resets_at`), while the on-disk
  `~/.claude/.credentials.json` token is ~35h old and returns HTTP 401. ReCue reads the file
  first (`read_token_from_file().or_else(read_token_from_keychain)`), so on macOS it uses the
  expired file token and never falls through to the fresh Keychain one. Recent Claude Code keeps
  the canonical token in the Keychain but leaves a stale file behind — contradicting the code's
  "file often absent on macOS" assumption.
- **Fix approach: expiry-aware token selection (file → Keychain), not a rewrite of the read
  pipeline.** The endpoint URL, `oauth-2025-04-20` beta header, User-Agent scheme, and response
  fields are all still present in the current CLI and confirmed working, so the fix is scoped to
  token *selection*.
- **Rejected reading a local usage file:** verified no usage/rate-limit snapshot file exists under
  `~/.claude`, so the OAuth API remains the sole source (documented as a justified non-goal).
- **Rejected implementing OAuth token refresh:** using `refreshToken` would race Claude and needs
  the client-id/token endpoint; since Claude keeps a fresh token in the Keychain, using it is
  sufficient. If both sources are expired, fail-open (bar hidden) is acceptable.
- **No frontend changes:** the `UsageSnapshot` shape is unchanged; the bar hides only because the
  backend returns `None`. Store/IPC/`UsageBar` stay as-is.
- **Two low-risk hardening items (recommended, not root cause):** bump the stale `CLAUDE_CODE_UA`
  constant (`claude-code/2.1.0` → current) and add token-free failure diagnostics for future drift.
- **Schema-drift defensiveness:** `expiresAt` treated as epoch-ms with an "unknown expiry ⇒ usable"
  guard, so a future field change degrades to today's behavior rather than falsely hiding a working
  bar. Keychain stays macOS-gated; Windows/Linux (no Keychain, canonical fresh file token)
  unchanged.
- Backend-only: `src-tauri/src/usage.rs` (token type + expiry-aware `read_oauth_token`/
  `select_token`, extended `token_from_json`, UA bump, diagnostics, unit tests).

## Task 322 — Remove the redundant header "+" add-card button from Kanban columns

- The "column top header +" is the `styles.colAdd` `<button>` in `BoardColumn`'s `<header>`
  (`src/components/Kanban/KanbanPanel.tsx`, a bare `<Plus size={14}/>`); the "'+ Add card' button
  inside the column" is the `styles.addCard` button at the bottom of the card list. Both call the
  same `openComposer` handler, so removing the header one orphans nothing.
- Interpreted the task as also removing the now-dead `.colAdd` / `.colAdd:hover` CSS rules (not
  just the JSX element), and touching up two stale doc comments that describe the header "+".
  Kept `.addCard` and the composer fully intact.
- No new tests planned — this deletes a duplicate control only; existing add-card behavior via the
  retained button is unchanged. Verified via grep that no keyboard shortcut or test depends on
  `colAdd`/the header add button.
- Platform-neutral (pure CSS/React UI change).

## Task 323 — Remove the post-drag focus border on Kanban cards

- Root cause is an app CSS rule, not just a browser default: `KanbanPanel.module.css`
  `.card:focus-within { border-color: var(--accent); }` fires because dnd-kit (`useSortable`)
  makes the card `<article>` focusable and restores focus to it after a drag (dnd-kit
  `RestoreFocus`, default on). The app-wide `:focus-visible { outline: 2px solid var(--accent) }`
  in `global.css` may also paint an offset ring. Fix suppresses both on the card article via a
  `.card:focus { border-color: var(--border-hairline); outline: none; }` rule.
- Preserve the edit-mode accent cue: `.card:focus-within` stays so a card being *edited* (its
  `<textarea>` focused) still shows the accent border. Interpreted "remove the focus border after
  dragging" narrowly — scope to `.card:focus` (article itself focused = post-drag/tab).
- Chose the CSS fix over disabling dnd-kit focus restoration (`restoreFocus: false`), to preserve
  keyboard drag continuity; CSS approach also covers plain-Tab focus.
- Accepted accessibility trade-off (recorded in plan): the card article's own keyboard focus ring
  is also removed. Inner controls, editing, hover lift, and focus restoration are left intact. A
  narrower mouse-only alternative (`.card:focus:not(:focus-visible)`) is noted as a fallback.
- Cross-platform: plain `outline: none` + `border-color` revert (no `-webkit-`/macOS-only
  assumption) — gone on both WKWebView (macOS) and WebView2/Chromium (Windows).
- CSS-only change: `src/components/Kanban/KanbanPanel.module.css` (one additive `.card:focus` rule).

## Task 326 — Setting to disable session-usage display (and auth-token access)

- Setting name & default: `showSessionUsage`, default `true` (matches today's behaviour). Added to
  the settings blob (`Settings` type + `DEFAULT_SETTINGS`); older `sessions.json` blobs default to
  ON via `mergeSettings`.
- Settings section: placed in **Sessions** (alongside auto-name / auto-continue toggles) — a
  Claude-session concern, and the auto-continue rows depend on it.
- "Completely prevents token access" interpretation: the guard lives in the frontend caller
  (`refreshUsage` early-returns before any `ipc.claudeSessionUsage()`, plus `startUsagePolling`
  doesn't start when off). Verified `claude_session_usage` (`usage.rs`, `lib.rs:302`) is the SOLE
  token-read path, so guarding it fully satisfies "never accesses the token." No Rust change.
- When disabled, UsageBar renders the plain hairline separator (identical to today's no-data
  state), not `null` — preserving footer structure while removing all usage data.
- Auto-continue interaction (#296/#309): disabling usage makes auto-continue inert automatically
  (usage unavailable → reducer disarms; #309 prompt hides). Additionally greys out the "Auto
  continue after limit reset" Settings checkbox when usage is off, with a "Requires session usage
  to be enabled." note — so a user can't arm a feature that can't fire.
- Runtime toggle: wired through `saveSettings` to start/stop the poll immediately and clear the
  `usage` slice on disable (bar disappears at once), not only on next restart.
- Areas touched: `src/types/index.ts`, `src/store.ts` (`DEFAULT_SETTINGS`, `refreshUsage`,
  `startUsagePolling`, `saveSettings`), `src/components/Usage/UsageBar.tsx`,
  `src/components/Settings/Settings.tsx`, new `src/store.usage.test.ts`. Overlaps sibling 325 on
  `UsageBar.tsx` render guard (additive, merge-lane resolvable). No Rust changes.

## Task 324 — Git-diff gutter in the file viewer (uncommitted change markers)

- How to get per-line status: add a focused `file_diff(repo, file)` command (`git diff HEAD --
  <path>` + the existing pure `parse_unified_diff`, with the #183 `--no-index /dev/null` fallback
  for untracked files) rather than reusing whole-repo `working_diff` (too heavy to poll for one
  open file). Mirrors the scoped `commit_diff`/`compare_branches` read pattern. Add-vs-modify-vs-
  delete classification stays a pure TS helper (`gutterMarkers`), unit-tested.
- Scope of views: gutter applies to the Prism `CodeBlock` (curated code) view ONLY. Small
  non-code/plain-text/markdown-raw files render as an editable `<textarea>` (no per-line DOM, and
  an unsaved buffer diverges from the on-disk diff); the read-only raw `<pre>` is reached only for
  >256 KB files. So editable views, rendered markdown, and large files are out of scope.
- Marker semantics (VS Code dirty-diff convention): pure insertion → green ("added");
  deletion-then-addition → yellow ("modified"); deletion with no replacement → a red dot at the
  line boundary (EOF-sentinel for trailing deletions).
- Refresh trigger = a self-contained ~2 s poll (paused when hidden, plus refetch on content
  change), rather than the #212 busy→idle `fileStatuses` signal — guarantees the gutter clears
  within ~2 s of a manual terminal commit regardless of trees/agents.
- Cross-platform: git shell-out reuses `hidden_command` (CREATE_NO_WINDOW); the `/dev/null`
  untracked arg is already proven on Windows by #183; colors use
  `--status-done`/`--status-awaiting`/`--status-error` tokens.
- Fail-open: any git/parse miss or non-git folder → `file_diff` returns `null` → no gutter.
- Areas touched: `src-tauri/src/git.rs` (+`commands.rs`,`lib.rs`) for `file_diff`; `src/ipc.ts`;
  new `src/components/FileViewer/gutter.ts`(+test) and `useFileDiffGutter.ts`; `FileViewer.tsx` +
  `FileViewer.module.css` for the gutter column.

## Task 325 — Custom coding-agent command in Settings

- Storage: `customAgentCommand` is a new field in the settings blob (per the card). Backend stores
  settings as opaque `serde_json::Value`, so it reads the key directly via `store.settings()` at
  each spawn site — no new Rust scalar/persistence command; works for the Rust schedule/recurring
  fire loops too.
- Command shape: the custom command is an argv (program + args), parsed by a simple whitespace/
  quote tokenizer — NOT a shell line (no pipes, redirection, `&&`, env expansion, globbing;
  documented in-code + Settings help). Routes through the existing `find_on_path`/`launch_target`
  seam (PATHEXT + `cmd.exe /C` for `.cmd`/`.bat`), so identical on macOS/Windows.
- Seeding: interactive launch = the bare parsed command in cwd; a prompt-seeded launch
  (schedule/recurring/template new-agent) appends the prompt as a trailing positional arg —
  best-effort, since an arbitrary CLI may not accept a positional prompt.
- Capabilities: custom owns its own session identity — `supports_resume=false`,
  `supports_auto_name=false` (like Codex/OpenCode): boot resume skips it, Restart returns
  `ResumeUnsupported`, Fork unavailable, label falls back to the branch.
- Usage bar: NO change to `isClaudeActive` — it already treats any non-`"claude"` id (incl.
  `"custom"`) as non-Claude, so the usage bar hides automatically once a session records
  `agent: "custom"`. Added a regression test instead of editing the gate. Kept independent of
  sibling Task 326's manual "disable usage" setting.
- `agent_info`: for custom, the `--version` probe runs against the configured command's program
  (not the literal `"custom"`), by adding `store` to the command + resolving the program from
  settings; `binary_name` becomes that program (fallback `"custom"`). Empty/missing → `version: None`.
- Onboarding: Custom is excluded from the first-launch picker (an unentered command can't be
  presence-detected). `SELECTABLE_AGENTS` stays `[claude, codex, opencode]`; a new
  `SETTINGS_AGENTS` list (adds Custom) backs the Settings selector.
- Empty command: selecting Custom with a blank command doesn't block Save; the spawn fails with a
  clear toast, and an unresolvable program surfaces the existing `ClaudeMissing` banner.
- "Untested" marking: reuses `agentIsUntested(id) = id !== "claude"` — custom is untested for free.
- Areas touched: `src-tauri/src/agents.rs`, `pty.rs`, `commands.rs`; `src/agents.ts`,
  `src/types/index.ts`, `src/store.ts`, `src/components/Settings/Settings.tsx`; `src/store.test.ts`.

---

## TASK-327 — Open the repo's GitHub page from the sidebar folder menu

Add a "View on GitHub" item to the sidebar repo/folder (and worktree header) context menu that
opens the repository's GitHub page in the browser, shown only when the folder is a git repo with
a GitHub remote. Autonomous decisions (assume-mode — subagents can't ask):

- **Which remote** → Prefer `origin`; if absent, use the **first** remote from `git remote`; if
  the repo has no remote, hide the item. `origin` is the near-universal canonical-remote
  convention; first-remote fallback covers renamed remotes; hiding when there is none keeps it
  honest.
- **What counts as a GitHub remote** → Host must be **exactly `github.com`** (case-insensitive).
  GitLab/Bitbucket/other hosts **and GitHub Enterprise** hosts hide the item. The card said
  "github.com only unless trivially generalizable"; GHE hosts aren't reliably detectable, so
  restricting to `github.com` is the safe reading for a menu literally labelled "View on GitHub".
  A follow-up could add a configurable enterprise-host list.
- **URL normalization** → Normalize HTTPS/`http`/SCP-SSH (`git@github.com:owner/repo.git`)/
  `ssh://`/`git://` forms to `https://github.com/<owner>/<repo>`, stripping trailing `.git`,
  trailing slash, userinfo, and port; `http://` upgrades to `https://`; owner/repo casing
  preserved. Any URL not yielding host `github.com` **and** a two-segment `owner/repo` path
  returns `None` (item hidden). One pure, unit-tested function modeled on `repo_dir_name`.
- **Menu label & placement** → Label **"View on GitHub"** (platform-neutral, not routed through
  `kbdHint`/`revealLabel`), placed in the non-destructive utility group right after **Pull**, no
  leading icon (matching the existing text-only menu items).
- **Worktree header menu** → **Also** gets the item, resolved from the **parent repo's** cached
  GitHub URL (`githubUrls[parent]`), since a worktree shares its parent's remotes.
- **Refresh cadence / caching (the performance constraint)** → A store map `githubUrls` filled by
  a new `refreshGithubUrls` action, refreshed on the **same cadence as `branches`/`fileStatuses`**:
  on load + repo-set change and on the debounced busy→idle edge (#212/#252), full-replace +
  shallow-equality guard. The menu render reads only the cached map — **zero git work at
  menu-open time** — directly satisfying "the context menu must still open quickly".
- **Icon** → None, matching the surrounding text-only menu buttons.
- **Cross-platform** → The new remote-URL read goes through `git::hidden_command()`; the browser
  open reuses the http/https-only cross-platform `open_url` (#217). Behavior identical on
  macOS/Windows.
- Areas touched: `src-tauri/src/git.rs` (pure normalizer + git read + tests), `commands.rs` +
  `lib.rs` (batched `github_web_urls` command), `src/ipc.ts`, `src/store.ts` (`githubUrls` +
  `refreshGithubUrls` + cadence wiring), `src/components/Sidebar/Sidebar.tsx`.

## Task 328 — Move the five-hour usage fetch off the main thread (async, non-blocking)

- **Root cause is the sync Rust command, not the frontend.** `claude_session_usage` is a
  synchronous `#[tauri::command] pub fn`; in Tauri 2 sync commands run on the main
  (webview) event-loop thread, so its blocking `ureq` GET (8s timeout) + credentials file
  read + macOS `security` subprocess freeze the whole UI. The frontend `refreshUsage`
  already `await`s off a `setInterval` (not on any render path), so no frontend change is
  needed. "Make it Async (multi thread)" is interpreted as: make the Rust command async and
  offload its blocking work — where the actual freeze lives.
- **Fix approach = `async fn` + `tauri::async_runtime::spawn_blocking`, reusing `ureq`.** Chose
  the minimal, already-precedented fix (identical to the #316 conversion of git commands
  `current_branch`/`fetch_remotes`/etc.) rather than swapping in an async HTTP client like
  `reqwest`. `spawn_blocking` moves the existing blocking client off the main thread with
  zero new dependencies and the smallest surface area, fully eliminating the freeze.
- **Poll cadence unchanged.** Kept `USAGE_POLL_MS = 180_000` and `ARMED_POLL_MS = 45_000` — the
  card is about lag/freeze, not staleness, and the endpoint aggressively 429s below 180s.
- **Fail-open preserved, including a `spawn_blocking` join error.** A task panic collapses to
  `None` via `.await.ok().flatten()`, matching "any miss hides the bar"; return type stays
  `Option<UsageSnapshot>` so no IPC/frontend contract change.
- **Cross-platform parity is inherent.** `spawn_blocking` is OS-agnostic; the macOS Keychain
  fallback stays `#[cfg(target_os = "macos")]`-gated inside the moved body, so behavior is
  byte-for-byte identical on macOS and Windows — only the thread changes. The command's
  existing doc comment ("Sync → Tauri runs it off the main thread") is factually wrong and is
  corrected as part of the fix.
- **Areas touched:** `src-tauri/src/usage.rs` only — extract the current command body into a
  private `usage_snapshot_blocking()` helper and add a `pub async fn claude_session_usage()`
  wrapper. No frontend, `lib.rs`, or `ipc.ts` changes.

## Task 329 — DiffInspector accordion cards: enforce a readable min-width and scroll on overflow

- **Root cause is the flex crush, not just missing scroll.** The card's `overflow:hidden` gives
  each accordion card a flexbox automatic-min-size of 0, so `flex-shrink:1` collapses cards
  toward 0 height when there are many — the "too small to view" / y-overflow symptom. Resolved
  the y-axis ask by adding `flex-shrink:0` to `.card` so the existing `.accordion
  { overflow-y:auto }` actually scrolls instead of crushing. Interpreted "allow scrolling on
  y-overflow" as "make the already-present y-scroll engage."
- **Minimum-width value = 320px.** The card doesn't specify a number. Picked a fixed 320px:
  readable for a 12px-mono diff body + line-number gutters and header (badge/filename/counts),
  and deliberately below the Overview column min (`--overview-card-min` default 400px, #176) so
  the common Overview case never triggers horizontal scroll — the floor only bites in narrow
  Canvas splits.
- **Fixed px, not the `--overview-card-min` variable.** Kept the diff-card floor local and
  predictable across Overview/Canvas/BigMode, since that variable means "Overview column width,"
  not "diff card width."
- **Narrow-panel behavior = horizontal scroll.** The card names only y-overflow scrolling, but
  enforcing a min-width forces a decision for panels narrower than the min. Chose horizontal
  scroll (`.accordion` → `overflow:auto` on both axes), mirroring the Overview wall's "overflow
  horizontally instead of squeezing" precedent, rather than letting the panel dictate a smaller
  width.
- **Scope = Accordion only; Focused untouched.** The card says "accordions," so changes are
  limited to `.accordion`/`.card`. Focused mode uses separate classes and is verified as
  non-regressed.
- **Min-width applies to one `.card` rule covering both states.** The card asks for a floor
  "collapsed and expanded"; a single `min-width` on `.card` satisfies both since the same
  element wraps header and (when open) body.
- **Areas touched:** `src/components/DiffInspector/DiffInspector.module.css` only — add
  `flex-shrink:0` + `min-width:320px` to `.card`, change `.accordion` `overflow-y:auto` →
  `overflow:auto`. Pure WebView CSS (no `.tsx`/Rust/native changes), identical on macOS/Windows.

## Task 330 — Load diff-viewer and file-tree git reads off the webview thread (async)

- **Root cause chosen: blocking Rust I/O on the webview thread, not too-frequent re-fetch or
  off-screen polling.** `working_diff`, `file_statuses`, `file_diff`, `list_commits`,
  `commit_diff`, and `compare_branches` are plain synchronous `#[tauri::command] pub fn` in
  `commands.rs`, so their `git` shell-out + hunk parse blocks the webview thread on every ~1.5s
  poll — whereas the branch reads (`current_branches`/`list_branches`/`fetch_remotes`) were
  already moved to `spawn_blocking`. Concrete fix: convert these six reads to `async fn` +
  `tauri::async_runtime::spawn_blocking`, mirroring the established #200/#299/`fetch_remotes`
  pattern. Matches the card's ask ("use multi threading/Async to load the diffs in the
  background").
- **"Other panels" scope = include the FileTree's `file_statuses`, exclude the rest.** The
  FileTree status read is the identical one-line mechanism and is the panel the card names, so
  it's in scope. `file_diff` (FileViewer gutter) and the diff viewer's compare/commit sources are
  converted in the same sweep for consistency (same pattern, trivial). Excluded
  `pull_branch`/`checkout_branch`/`create_branch` — user-initiated one-shots, not polled, so not
  a source of "constant" lag; noted as deferred.
- **No frontend behavior change.** `src/ipc.ts` uses `invoke<T>()` (Promise-returning) and
  `lib.rs` registers commands by bare name, so a sync→async conversion is fully transparent to
  the IPC contract and registration. Left `DiffInspector.tsx`'s poll cadence,
  `inFlightRef`/`sigRef`, and `JSON.stringify(next)` change-detection untouched.
- **Rejected the frontend `JSON.stringify`→lighter-fingerprint optimization** to avoid a
  correctness regression: a summary/counts-only signature could miss a same-count content edit
  and show a stale diff (the card requires the diff still reflect the latest state). After the
  git work moves off-thread, the residual stringify is a minor JS cost, not a freeze — so no new
  frontend pure helper / Vitest test is added.
- **Fail-open on blocking-task join error via `Default`.** To let `working_diff`'s
  `spawn_blocking(...).unwrap_or_default()` compile, add `#[derive(Default)]` to `DiffSummary`
  and `WorkingDiff` in `git.rs` (the other return types — `Vec<...>`, `Option<...>` — already
  have `Default`). Near-unreachable path (only on a task panic); degrades to the same empty value
  the sync version could return.
- **Cross-platform:** `spawn_blocking` is OS-neutral and the moved git calls still go through
  `git::hidden_command()` (the Windows `CREATE_NO_WINDOW` guard) unchanged; no new `#[cfg]`
  divergence — both OS arms stay byte-for-byte equivalent.
- **Areas touched:** `src-tauri/src/commands.rs` (six diff/status commands → async
  `spawn_blocking`) and `src-tauri/src/git.rs` (`Default` derives on `DiffSummary`/`WorkingDiff`).
  No frontend files.

## Task 331 — "New session here" on a worktree agent nests under the existing worktree instead of registering a stray sidebar folder

- **"Reuse the existing worktree" = the new agent JOINS the existing worktree's nested sub-group**
  (same worktree folder `repoPath` → same sub-group; #74 already supports multiple agents per
  worktree), not a second/separate worktree. Chosen because the card explicitly wants "another
  agent nested under that same worktree."
- **Fix spans backend + frontend, not frontend-only.** The Rust `spawn_session` command durably
  persists `worktree_parent: None` and `touch_recent(worktreeFolder)`, which would re-introduce
  the stray top-level folder on the next `refresh()`/reboot even if the frontend patched its
  optimistic state. So the backend must be corrected; the frontend change only keeps the
  optimistic UI consistent.
- **Detection method = reuse the recorded `worktree_parent` of an existing session at the same
  `repo_path`** (mirrors the frontend `worktreeParentOf`), rather than a git-based worktree probe.
  Chosen for reliability, consistency with how the app already tracks worktree membership, and
  because it matches an opaque string identifier (separator-agnostic, identical on
  macOS/Windows) with no path parsing.
- **The "New session here" UX for a worktree stays an instant, no-modal spawn on the worktree's
  current branch** (no branch step introduced) — aligns with #213 "scoped to its worktree folder"
  + #177. Only grouping/recents change, not the spawn flow.
- **Centralize in the backend `spawn_session` command** so every entry point routing through
  `ipc.spawnSession` (OpenViewButton "New session here", `NewSessionModal` instant/branch spawn,
  `CreatePanelModal`, Canvas template `new-agent`, `createBranchSession`) nests correctly at once.
  Fork (#126) and schedule/recurring (#93/#294) already nest and are left unchanged.
- **Accepted edge case (out of scope):** a worktree that currently has only a non-agent panel and
  zero session records (no live/exited agent) can't have its parent resolved from the session
  store, so its panel's "New session here" would still register a top-level folder. Rare, not the
  reported bug (a worktree *agent*'s button always has a live session); noted as a known
  limitation for a follow-up.
- **Areas touched:** `src-tauri/src/commands.rs` (new `worktree_parent_for_cwd` helper +
  `spawn_session` sets `worktree_parent`/`touch_recent` parent + Rust test), `src/store.ts`
  (`spawnSession`/`createBranchSession` optimistic recents use `record.worktree_parent ?? cwd`),
  `src/store.test.ts` and optionally `src/paths.test.ts` (grouping tests).

## Task 332 — Esc-to-cancel in session modals must not exit macOS fullscreen

- **Which modals count as "session modals":** scoped to the create/schedule/manage-session
  family — `NewSessionModal` (New/Schedule/Recurring), `TemplateUseModal` (new tab from template →
  spawns agents), `CloneRepoModal`, `CanvasCloseModal`, `CreatePanelModal`, `OnboardingModal`.
  Excluded the `Settings` modal (not session-specific) and sidebar context-menus/rename inputs
  (popovers, not modals).
- **Actual code changes are only two files.** An audit found that 5 of the 7 Esc-cancel modals
  already call `event.preventDefault()`. Only `NewSessionModal` (`window` Esc listener) and
  `TemplateUseModal` (`window` Esc listener) omit it — those are the real fix. The rest are
  confirmed-compliant, no edits.
- **Universal `preventDefault()`, no platform gate / no fullscreen detection.** Applied
  unconditionally rather than only-when-macOS-fullscreen, because `preventDefault()` on Esc is
  harmless on Windows and when not fullscreen, and it's more robust than detecting fullscreen
  state. Matches CLAUDE.md's "macOS behavior fixed, Windows unaffected" seam.
- **No shared hook / refactor.** Kept the minimal per-modal one-line change rather than extracting
  a `useModalEscape` hook, since most modals already comply — the smallest correct change wins.
- **Verification is build/lint/test + a manual macOS-fullscreen smoke check.** The native
  fullscreen-exit path is WKWebView-only and can't be exercised in jsdom/CI, so it's flagged for
  interactive verification per the repo's GUI-path convention.
- **Areas touched:** `src/components/NewSessionModal/NewSessionModal.tsx` and
  `src/components/TemplateUseModal/TemplateUseModal.tsx` — add `event.preventDefault()` to each
  modal's window-level Esc keydown listener. Frontend-only; no Rust.

## Task 334 — Clear the Overview folder filter when selecting an agent it would hide

- **"Deselect" = clear the filter entirely** (set `overviewRepoFilter` to `null`), not switch the
  filter to the clicked agent's folder. The card says "the filter should deselect," so it clears.
- **Scoped to agent rows only.** `selectItem` is shared by all sidebar item kinds (files, diffs,
  terminals, kanban, filetree, scheduled, recurring), but the card says "agent," so the guard
  fires only for `item.kind === "agent"`; other item kinds leave the filter intact.
- **Selecting an agent already visible under the filter leaves the filter intact** — only a
  *mismatch* (an agent the filter would hide) clears it. Determined via the wall's own
  `sessionInFilter` predicate.
- **Judged by the wall's visibility predicate, not raw path equality.** Reusing `sessionInFilter`
  means: under an `"all"` repo filter a worktree agent of that repo (same cluster via
  `effectiveRepo`, #96) is considered visible so the filter stays; under an `"own"` filter a
  same-repo worktree agent is hidden so selecting it clears the filter. This natural consequence
  matches the card's intent ("the clicked agent should be visible rather than hidden by the
  mismatched filter").
- **Applies regardless of view (Overview or Canvas).** The guard runs before `selectItem`'s view
  branching. Clearing the filter while in Canvas is harmless (the filter only narrows the Overview
  wall) and keeps the sidebar's filtered-header highlight consistent when the user returns to
  Overview.
- **Areas touched:** `src/store.ts` (add a filter-clear guard at the top of the `selectItem`
  action; no new imports — `sessionInFilter` is already imported) and `src/store.test.ts` (new
  `#334` unit tests beside the existing `setOverviewRepoFilter` tests). Pure frontend/store logic —
  inherently cross-platform.

## Task 333 — Light mode theme option in Settings (Catppuccin Latte)

- **Light palette = Catppuccin Latte.** Mirrors #33's Mocha remap; enumerated a full Latte-based
  value for every color token in `tokens.css`. Latte is the natural light sibling and gives proper
  contrast on light surfaces (the pale Mocha pastels would wash out).
- **Terminal stays dark in both themes.** claude's TUI is dark-designed. Achieved by keeping
  `--terminal-bg`/`--terminal-selection` un-overridden and introducing a stable `--terminal-fg`
  token (value = current foreground) that terminalPool reads instead of the flipping
  `--text-primary`. Terminals therefore don't need re-theming on a runtime switch.
- **Mechanism = `data-theme="light"` attribute on `<html>` + a `:root[data-theme="light"]` token
  override block** (not a `body.light` class). This is load-bearing: the custom accent is written
  inline on `<html>`, so putting the theme on the same element lets inline correctly win — a
  `body.light` rule would silently break the custom accent in light mode.
- **No "System/Auto" option** — explicit Dark/Light only for v1 (out of scope).
- **`REPO_PALETTE` and the Settings accent-swatch palette are NOT re-themed** — they are persisted
  brand/identity colors; re-theming would break stored repo colors. Left as-is.
- **Accent for light mode's default = Latte Peach (`#fe640b`)** with `--accent-fg: #ffffff` for
  readability; a custom accent still overrides in both themes. Accepted minor caveat: the
  Appearance "default" swatch chip (`#fab387`) won't exactly match the applied Latte Peach in
  light mode.
- **Toggle lives in Settings → Appearance** as a Dark/Light **segmented control** (reusing the
  existing `styles.segmented` pattern), placed above Accent color.
- **Accepted minor first-paint flash** (theme applies async in `init()`, same as existing
  accent/reduce-motion behavior) — not addressed.
- **CLAUDE.md is updated by the implementer** — this card reverses the documented "Dark theme
  only" / "no light mode" rules (like #84/#100/#126 reversals); the plan calls out the exact lines
  and the Settings architecture paragraph.
- **Areas touched:** `src/types/index.ts` (Settings type), `src/store.ts` (`DEFAULT_SETTINGS` +
  `applySettingsEffects`), `src/styles/tokens.css` (light token block + `--terminal-fg`),
  `src/components/Terminal/terminalPool.ts` (foreground token), `src/components/Settings/Settings.tsx`
  (Appearance toggle), `src/store.test.ts` (tests), `CLAUDE.md` (doc reversal). No backend/Rust
  changes.

## Task 335 — Per-agent added/removed line counts in the sidebar

- **Scope = sidebar only.** The card says "left panel", so the +N/−N badge is added to sidebar
  agent (`SessionRow`) rows only. Overview card headers / Canvas panel headers are explicitly out
  of scope (noted as a possible future extension).
- **Untracked files are included.** The green +N total includes lines in brand-new untracked
  (non-`.gitignore`d) files, counted via a bounded, binary-skipping, size-capped newline read in
  Rust — because `git diff --numstat HEAD` alone would omit a fresh agent's newly created files and
  show a misleading +0. Removed lines come solely from tracked numstat (untracked files have no
  removals). Bounded by the existing `MAX_UNTRACKED_FILES` (2000) + a per-file byte cap; can be
  dropped later with no frontend change if it proves heavy.
- **Map key = the agent's working-tree path (`session.repoPath`).** Counts are per working tree, so
  worktree agents key by their own worktree cwd. Multiple agents sharing a folder show the same
  totals (expected).
- **Setting: `showDiffLineCounts`, default `true`, in Settings → Appearance** (it's a visual
  toggle, alongside reduce-motion / Overview-min-width). When off, no badge renders **and** the
  store performs zero `diff_line_counts` git reads (self-guarded action).
- **Colors:** additions → `--status-done` (green), removals → `--status-error` (red) — on-system
  tokens, matching the FileTree #252 tinting convention. No hardcoded colors.
- **Zero state:** a clean tree (both counts 0) hides the badge entirely (no `+0 −0`). Adds-only
  shows just `+N`; dels-only shows just `−N`.
- **Format:** `+123` (green) then `−45` (red) using the Unicode minus `−` (U+2212) to match `+`
  width, in mono at `--fs-meta-xs` with tabular numerals; the badge is hidden during inline rename
  to avoid crowding the input. The agent name ellipsizes (`text-overflow: ellipsis`) with the
  badge in a non-shrinking slot.
- **"Multi-threaded / async / non-blocking"** is satisfied by a batched `async` Tauri command
  running the git work on `spawn_blocking` (the established #330 pattern), fetched in the store on
  the existing debounced busy→idle / load / checkout cadence — never on the render path.
- **Areas touched:** `src-tauri/src/git.rs`, `commands.rs`, `lib.rs`; `src/types/index.ts`,
  `src/ipc.ts`, `src/store.ts`; `src/components/Sidebar/Sidebar.tsx` + `Sidebar.module.css` + new
  `diffCounts.ts`/`diffCounts.test.ts`; `src/components/Settings/Settings.tsx`.

## Task 336

Per-agent "watch" notifications — native popup when a watched agent finishes or needs input.

- **Notification mechanism = native OS notification via the Tauri `notification` plugin**
  (`@tauri-apps/plugin-notification` + `tauri-plugin-notification`), not an in-app toast. Chosen
  because the card says "popup" and the value of watch is being alerted while the app is unfocused;
  the plugin is cross-platform (macOS + Windows). No plugin existed, so the plan adds it (Cargo dep,
  `lib.rs` init, `notification:default` capability, JS dep).
- **Trigger = the existing busy→idle transition** (the single `setBusy(id,false)` edge in
  `store.ts`, the same edge that turns the `BusyIndicator` yellow). "Finished what it was doing" and
  "has a question" are indistinguishable at the monitor level, so one generic notification body
  ("Finished or awaiting your input") covers both.
- **Fires on every busy→idle transition** for an effectively-watched agent (each finished turn), not
  just the first — that is the meaning of "watch." No focus-based suppression (fires regardless of
  whether ReCue/that agent is focused); noted as a possible future refinement.
- **Effective watch = `settings.watchAllAgents || session.watch`.** Global default OFF, per-agent
  default OFF. The two toggle entry points control the **per-agent** flag only (mirroring the
  auto-continue global+per-agent pattern); when "watch all" is on, all agents notify regardless of
  their per-agent flag, and per-agent values are retained for when the global switch is turned off.
- **Notification permission is requested at opt-in time** (when a user turns watch on per-agent or
  turns on "watch all") and re-checked before each send (`isPermissionGranted`), silently skipping
  if denied/unavailable — so ReCue never prompts on launch and a denied prompt never breaks the
  busy→idle path.
- **Fired only from the main window** (`IS_MAIN_WINDOW` guard) to avoid duplicate notifications from
  detached canvas windows (session events are window-global); also suppressed during boot-resume.
- **Recurring-owned child sessions are excluded** from watch notifications (no watch toggle UI;
  render only inside the recurring surface), so a global "watch all" doesn't spam on each rotation.
- **Clicking the notification does nothing beyond the OS default** (no focus-window / select-agent
  deep link) — kept out of scope for cross-platform simplicity.
- **Reusable action shape for Task 340:** the plan exposes a shared `WatchButton` component +
  `toggleWatch(id)` store action so Task 340 can fold Watch into its "…" dropdown.
- **Icon:** lucide `Eye`/`EyeOff` for the toggle (matching the feature name "watch").
- **Areas touched:** Rust `store.rs`/`commands.rs`/`lib.rs` + `Cargo.toml`/`capabilities` (new
  `watch` per-session flag, `set_session_watch` command, notification plugin); TS `types/index.ts`,
  `ipc.ts`, `store.ts` (`setBusy` firing, `setWatch`/`toggleWatch`, `watchAllAgents` setting), new
  `src/notify.ts` + `src/components/WatchButton/`; `Sidebar.tsx`, `Overview.tsx`,
  `CanvasSurface.tsx`, `Settings.tsx`; `package.json`; `TRAJECTORY_TO_WINDOWS.md`.

## Task 337

Global search modal (⌘F / Ctrl+F) across agents, terminals & files.

- **Terminal-output search IS included, best-effort.** Rather than shipping the ~256 KB-per-session
  scrollback to React, a new bounded Rust command `search_session_output` ANSI-strips each live
  session's retained scrollback and substring-matches server-side (keeping bytes off the React
  thread, per convention). It covers only live/recently-exited sessions' in-memory scrollback tail
  (`SCROLLBACK_CAP` ~256 KB) — **not** persisted `~/.claude/projects/*.jsonl` history — is plain
  case-insensitive substring, ANSI stripping is heuristic, and any failure degrades silently. The
  implementer may downgrade it to a non-goal if too costly, but the plan includes it.
- **"Files" = both open file/diff/kanban viewer panels AND files on disk across every sidebar repo**
  (filename via `search_files` + content via `search_file_contents`), not just open viewers.
- **Searchable item kinds:** agents, shell terminals, file/diff/kanban viewer panels, and scheduled
  + recurring sessions — matched by display title/label. Recurring-owned child sessions are excluded
  (matching Overview).
- **Main-window only.** ⌘F/Ctrl+F is gated on `IS_MAIN_WINDOW` like ⌘N/⌘K/⌘T, since results
  navigate the sidebar/Overview which only exist there; a detached canvas window's ⌘F is inert.
- **Debounce + thresholds:** search is debounced (~180ms); file-content and terminal-output search
  require query length ≥ 2 (filename/title match at ≥ 1); results capped per repo/kind.
- **Ranking is a client-side heuristic** (exact > prefix > word-boundary > substring for titles;
  titles > filenames > content > terminal-output), grouped by repo then item type — not a fuzzy lib.
- **Activation reuses existing actions:** an open item → `selectItem` (view-aware jump, #79); a
  not-yet-open file → `addOverviewPanel(repo, "markdown", file)` then `selectItem`; a terminal-output
  hit → selects its agent. No new Overview↔Canvas switching beyond what `selectItem` already does.
- **Areas touched:** Rust `src-tauri/src/{pty.rs,commands.rs,lib.rs}` (new scrollback-search
  command); frontend `src/{ipc.ts,store.ts,useKeyboardNav.ts,App.tsx}`; new
  `src/components/GlobalSearch/` (component + CSS module + pure `search.ts` ranking/grouping/
  highlight helper + tests).

## Task 338

Branch ahead/behind indicator (↑/↓ vs upstream) in the sidebar.

- **Scope — which branches get the indicator:** "each branch displayed inside a folder" =
  the **current/checked-out branch of each folder shown in the sidebar** — the repo's own branch
  line (`RepoBranchLine`) and each worktree sub-group header (`WorktreeHeader`). The branch *picker*
  lists (`list_branches`) are **not** annotated. A worktree with only a pending schedule (no live
  checkout, absent from the `branches` map) gets no badge.
- **No network fetch / staleness:** reads against the **already-fetched** remote-tracking ref
  (`git rev-list --left-right --count HEAD...@{upstream}`, purely-local). Does **not** trigger
  `git fetch` on any refresh tick (could hang/rate-limit a private remote in a GUI process). Counts
  are **"as of the last fetch"**; a `↓N` appears only after an app Fetch/Pull or an in-terminal
  fetch observes remote commits. Refreshes on the same cadence as the branch label (load, repo-set
  change, busy→idle edge, focus/visibility poll) plus immediately after app-initiated
  fetch/pull/checkout/branch-create.
- **No Settings toggle:** ships **always-on** with no Settings field — a cheap purely-local git read
  with no privacy surface (unlike #335's per-file diff read). A reviewer could add a toggle later.
- **Rendering / format:** `↑N ↓M` using `↑`(U+2191)/`↓`(U+2193); each side shown **only when its
  count > 0** (ahead-only → `↑N`, behind-only → `↓M`); in-sync (`0/0`), no-upstream, or non-git
  renders **nothing**. Ahead tinted `--status-done` (green), behind `--status-awaiting` (yellow),
  muted mono — on-system tokens only.
- **Map absence semantics:** the batch command **omits** no-upstream/non-git folders from the
  returned map (mirroring `github_web_urls`), so absence = "no indicator"; a present `{0,0}` is also
  hidden by the pure badge helper.
- **Areas touched:** `src-tauri/src/git.rs` (new `AheadBehind` + pure parser + reader),
  `commands.rs` + `lib.rs` (new `branch_ahead_behind` batch command), `src/types/index.ts`,
  `src/ipc.ts`, `src/store.ts` (new `branchAheadBehind` map + `refreshBranchAheadBehind` on the
  branch-refresh cadence), `src/components/Sidebar/Sidebar.tsx` + `Sidebar.module.css`, new
  `src/components/Sidebar/branchStatus.ts` (+ `.test.ts`). Incidental file overlap with Task 336 /
  Task 337 in `Sidebar.tsx`/`store.ts` — no shared abstraction; merge lane resolves any conflict.

## Task 339

Enter key submits the "New tab from template" modal.

- **Enter semantics per step:** On the **template** step, plain Enter *advances* to the folder step
  (equivalent to "Continue"), only when a template is selected; on the **folder** step, plain Enter
  *launches* the template into a new Canvas tab (equivalent to "Open template"), only when the
  primary button is enabled (`cwd && templateId`). "Complete the launch … once all information is
  ready" = Enter advances between steps and fires the final launch, gated by the same conditions
  that enable each step's primary button.
- **Plain Enter only (no modifiers):** no ⌘/Ctrl variant (unlike NewSessionModal's ⌘⏎ worktree).
  Enter is identical on macOS/Windows; the handler ignores metaKey/ctrlKey/altKey so it never
  hijacks a future chord.
- **Initial focus nudge:** on entering the folder step the optional tab-name input is auto-focused
  so Enter is immediately live (folder defaults to most-recent, so launch is usually valid on
  arrival). Chose focusing the input (lets the user optionally name the tab, Enter still submits via
  implicit form submission) over focusing the launch button.
- **List Enter acts on the current selection, not a Tab-focused row:** the modal has no arrow-key
  roving and rows are `type="button"`, so the new list `onKeyDown` runs the step action on the
  *currently selected* template/folder. Keyboard users change selection with **Space**, then Enter.
  No auto-select of the first row.
- **No component test added:** Vitest runs the `node` env (no jsdom) with no component-render tests,
  so verification is build + lint + manual smoke check.
- **Areas touched:** single file — `src/components/TemplateUseModal/TemplateUseModal.tsx` (dialog
  `<div>`→`<form onSubmit>`, step-aware `submitStep`/`onSubmit`/`onListKeyDown`, focus the tab-name
  input on the folder step, "Continue"/"Open template" `type="submit"`). No store, CSS, or Rust.

## Task 340

Consolidate agent header actions (Fork / Copy resume / Watch) into a "…" menu. Depends on Task 336.

- **Which actions go in the "…" menu vs. stay direct:** exactly the three the card names — **Fork
  conversation**, **Copy resume command**, and **Watch** — move into the "…" dropdown.
  **`OpenViewButton`, Maximize (⌘E/Ctrl+E), and Remove/Close stay as direct icon buttons** (primary
  affordances / a keyboard-shortcut action, not named by the card). The `AutoContinueToggle`
  subheader strip is untouched.
- **Menu primitive reused:** a new shared `AgentHeaderMenu` component modeled on the existing
  `ViewsPopover`/`ViewsMenu` pattern (`src/components/ViewsMenu/`) — self-contained popover host
  (render-prop trigger, outside-click + Escape dismissal, pointerdown-stopped so it never starts the
  header drag), `role="menuitem"` icon+label rows with design-token CSS. Trigger uses lucide
  `MoreHorizontal`. Not a new menu system; no refactor of `ViewsPopover`.
- **Big mode included as an additive extension:** the Big-mode modal header currently has no agent
  actions (only title + Close), so adding the "…" menu there is net-new. Included (agent items only)
  for cross-site consistency; flagged as droppable if it complicates. Minor wrinkle: Escape while
  the popover is open also closes Big mode (both window-level listeners) — acceptable as-is.
- **Watch is folded in as a menu row, superseding Task 336's standalone `WatchButton` in the
  headers.** This task removes the two `WatchButton` usages from the Overview + Canvas headers and
  renders Watch inside the menu (reusing 336's `toggleWatch` + `ensureNotificationPermission`). The
  `WatchButton` component file is left in place as harmless dead code (deletion optional/out of
  scope). **Merge/build note:** overlaps Task 336 in `Overview.tsx` + `CanvasSurface.tsx` — 340
  expects 336's `toggleWatch`/permission helper to exist and replaces its header `WatchButton`.
- **Sidebar `AgentContextMenu` is explicitly left unchanged** — already a right-click dropdown, not
  a panel header, so out of scope.
- **Per-site differences:** the shared component takes a `className` prop so each host styles the
  trigger with its own icon-button class (Overview `styles.action`/iconSize 15, Canvas
  `styles.panelClose`/iconSize 14, Big mode `styles.close`/iconSize 16); behavior/items identical.
- **No cross-platform shortcut routing needed in the menu:** the resume command is the literal
  `claude --resume <id>` on both OSes and the menu adds no keyboard shortcuts, so `kbdHint`/
  `revealLabel` aren't required here (the untouched Maximize button keeps its `kbdHint` tooltip).
- **Areas touched:** new `src/components/AgentHeaderMenu/` (`.tsx` + `.module.css`); edits to
  `src/components/Overview/Overview.tsx`, `src/components/Canvas/CanvasSurface.tsx`,
  `src/components/BigMode/BigModeModal.tsx`.

## Task 341 — Kanban card editor: auto-continue `-` bullet lists on Shift+Enter

- **Which key fires it:** In the Kanban card editor plain **Enter commits** the card and never
  inserts a newline; **Shift+Enter is the newline key**. Per the card's "shift+enter" wording,
  smart continuation fires on **Shift+Enter only**; plain Enter still commits unchanged.
- **Which textareas are in scope:** "kanban item" was read as **both** card-composition
  textareas — editing an existing card **and** the Add-card composer — since both compose a
  card's title+body identically (both already hint "Shift+Enter for detail lines"). The board
  **Raw**-view textarea and the FileViewer raw-markdown textarea are **out of scope** (separate
  whole-file markdown surfaces).
- **Which markers:** **`-` only** (dash), matching the card verbatim and the Kanban `-`
  convention. `*`, `+`, and ordered (`1.`) lists are **out of scope**; the pure helper centralizes
  the marker match so a follow-up can extend it in one place.
- **Task-list items:** `- [ ] `/`- [x] ` are still `-` bullets (and Kanban cards are
  checklist-oriented), so continuing a task item is **in scope** and produces a **fresh unchecked**
  `- [ ] ` (a checked source continues unchecked).
- **Empty bullet on Shift+Enter:** **Terminates the list** — the empty `- ` (or `- [ ] `) prefix
  is removed and the caret lands on the now-blank line; no second empty bullet is added (standard
  "double-Enter exits the list"). No new line is inserted in this case.
- **Indentation:** Leading whitespace (spaces/tabs) is **preserved** on the continued bullet, so
  nested/indented sub-bullets keep their indent.
- **Caret / mid-line / selection:** The helper operates on the caret position — mid-line
  Shift+Enter **splits** the text (right side becomes the new bullet's content); a non-collapsed
  **selection is replaced** (deleted) before continuing.
- **Title line not special-cased:** The helper is line-based and doesn't distinguish the title
  line (line 1); a `-` on the title line would also continue (harmless, keeps the helper pure).
- **Non-bullet lines & a bare `-`:** Helper returns `null` so the native Shift+Enter newline
  happens unchanged; a lone `-` with no following space is not a bullet.
- **Implementation technique:** The textareas are **controlled** React inputs, so on Shift+Enter
  over a bullet the handler `preventDefault`s, computes `{value, caret}` via the pure helper,
  pushes it through the existing setter with **`flushSync`**, then restores the caret with
  `setSelectionRange` (avoids caret flicker).
- **Cross-platform:** Pure WebView string logic on **Shift+Enter** (no `Cmd`/`Ctrl` chord, no
  native/path/shell code) — identical on macOS (WKWebView) and Windows (WebView2).
- **Areas touched:** new `src/components/Kanban/smartList.ts` + `smartList.test.ts` (pure helper +
  Vitest tests); edits to `src/components/Kanban/KanbanPanel.tsx` (import `flushSync` +
  `applySmartNewline`, add a module-level key handler, wire it into the two card-textarea
  `onKeyDown` handlers). No engine, CSS, or backend changes.

## Task 342 — Note that Dark mode is the recommended theme in Settings → Appearance

- **Exact wording:** chose **"Dark mode is the recommended experience."** — short, neutral, names
  no platform, no keyboard shortcut (so no `kbdHint` routing needed; renders identically on macOS
  and Windows as pure WebView copy).
- **Placement:** inside the existing Theme `.field` wrapper in the Appearance section of
  `src/components/Settings/Settings.tsx`, directly **under the Dark/Light segmented toggle** (after
  the `.segmented` `</div>`, before the `.field` `</div>`). The `.field` wrapper is
  `flex-direction:column`, so it stacks cleanly with consistent spacing.
- **Visibility:** **always visible** (static hint), not only when Light is selected — simplest and
  communicates the recommendation regardless of current selection.
- **Class/token reused:** the established `.helpText` class in `Settings.module.css`
  (`color: var(--text-muted); font-size: var(--fs-meta-sm); line-height:1.4`, from #162), already
  used for muted description lines elsewhere in the same modal. No new CSS class; `--text-muted` is
  theme-aware in `tokens.css`, so it reads correctly in both Dark and Light.
- **No test file:** copy-only change with no pure logic; verification is `npm run build` / `lint` /
  `format:check` plus a `tauri dev` smoke check.
- **Areas touched:** `src/components/Settings/Settings.tsx` (Appearance → Theme field) only — no
  CSS or backend changes.

## Task 343 — Fix and polish Light-mode theming (Dark unchanged)

- **Root-cause framing:** the theme is 100% token-driven with zero existing per-component
  `[data-theme]` overrides and no literally-black border colors. All listed bugs diagnosed as one
  of four token-level causes: (a) 9 non-terminal surfaces reuse the intentionally-dark
  `--terminal-bg`; (b) the busy sheen uses `--text-primary` (flips dark in Latte); (c) low-contrast
  Latte `--text-muted`/`--text-secondary`; (d) too-bright Latte accent.
- **"Kanban background is black" → Canvas panel backdrop.** The Kanban Board view has no bg of its
  own; it's black only when mounted as a **Canvas panel** (`.panel` backdrop is `--terminal-bg`)
  and in the **Raw** editor (also `--terminal-bg`). Overview-mounted boards already inherit a light
  bg. Fix targets the Canvas `.panel` + Kanban `.rawEditor`, not the board itself.
- **"Borders between agents are black" → dark panel boxes, not literal borders.** Primary fix is
  the `--content-bg` flip (Canvas agent panels stop being black boxes). One additional Light-only
  Overview override gives adjacent agent columns an opaque light-slate separator (`#acb0be`, Latte
  Surface2), since a translucent hairline vanishes against abutting dark terminal bodies. This is
  the ONLY per-component override.
- **Clean-CSS convention:** token-layer first (extend the Latte block + two new *alias* tokens
  whose base value equals the token they replace, so Dark is byte-for-byte identical);
  per-component overrides only where tokens can't express it, written as
  `:global([data-theme="light"]) .localClass { … }` (mirroring the existing
  `:global(body.reduce-motion)` pattern). Only 1 such override total.
- **New tokens:** `--content-bg` (base `= var(--terminal-bg)`; Latte `#dce0e8`) for the 9
  non-terminal surfaces incl. rendered markdown; `--busy-sheen` (base `= var(--text-primary)`;
  Latte `#eff1f5`) for the busy glint.
- **Contrast targets:** Latte `--text-secondary` #6c6f85→**#5c5f77** (~5:1), `--text-muted`
  #8c8fa1→**#6c6f85** (~4:1). Muted deliberately lands ~4:1 (not full 4.5:1) to preserve the
  primary>secondary>muted hierarchy. `--text-primary` unchanged (already ~6:1).
- **"Slightly darker" accent quantified:** ~11% darker peach — `--accent` #fe640b→**#e05a0a**,
  `--accent-hover` #ff7a30→**#f56b17**, `--accent-dim` alpha updated, `--accent-fg` kept `#ffffff`.
  Flagged as tunable.
- **Custom-accent-wins guarantee:** the custom accent writes `--accent`/`-hover`/`-dim`/`-fg`
  **inline on `<html>`** (higher specificity than `:root[data-theme="light"]`), so editing the
  Latte *default* accent tokens does not override it. Verified in `store.ts` `applySettingsEffects`.
- **Dark-unchanged guarantee:** the base `:root` block only *gains* two alias lines (no existing
  value edited); every component swap resolves to the same computed color in Dark
  (`--content-bg`→#11111b, `--busy-sheen`→#cdd6f4); the terminal (`Terminal.module.css .wrapper`,
  `terminalPool.ts` xterm theme, `--terminal-*` Latte non-override) is untouched. `git diff
  tokens.css` audit step provided.
- **color-mix fallback:** **no new `color-mix()` is introduced** — only the input token of the
  already-shipping busy-sheen color-mix is swapped; everything else is plain hex/`var()`. Identical
  on WKWebView and WebView2/Chromium; no new plain-color fallback needed.
- **Beyond-the-listed fixes (all Light-only):** FileViewer rendered-markdown dark-on-dark (via
  `--content-bg`), FileViewer code/raw/editor/diff-gutter surfaces, the Overview placeholder, and
  improved accent-as-link-text legibility (side effect of the darker accent). Broader restyling
  excluded to keep the diff minimal.
- **No unit-test changes:** CSS-token work; `accentCompanions` (the only theme-related tested
  logic) is untouched.
- **Areas touched:** `src/styles/tokens.css` (the bulk), plus `--terminal-bg`→`--content-bg` swaps
  in `components/FileViewer/FileViewer.module.css`, `components/Canvas/Canvas.module.css`,
  `components/Overview/Overview.module.css` (+ 1 Light-only separator override),
  `components/Kanban/KanbanPanel.module.css`, and a one-line busy-sheen swap in
  `components/BusyIndicator/BusyIndicator.module.css`.

## Task 344 — Sidebar agent rows: overlap diff-line counts and the × in one hover-swapped slot

- **At-rest content for no-diff rows:** matched today's behavior exactly — nothing shows at rest,
  × on hover. The `.trailing` slot keeps a `min-width:24px` so the × slot is still reserved for
  clean/no-diff rows, identical to now.
- **Agent-rows-only scope:** `.row` / `.remove` / `.diffCounts` / `.diffAdd` / `.diffDel` are used
  **only** by `SessionRow`. Non-agent rows (file/diff/terminal/scheduled/recurring) use their own
  `.fileClose` / `.scheduleCancel` classes and show no counts; the collapsed rail uses
  `.railDot*`. All untouched — the swap applies to agent rows only.
- **Technique = CSS visibility, not conditional render:** the counts keep their conditional React
  render (`{!editing && badge && …}`, unchanged); the hover-swap is pure CSS with **no** hover
  React state. The existing `.row:hover .diffCounts` changes from `display:none` to
  `visibility:hidden` so the counts' box is preserved on hover, keeping the trailing slot width
  stable.
- **No-layout-shift approach:** the diff counts are the only in-flow child of a shared `.trailing`
  wrapper (so they define the slot width, clamped to the ×'s 24px min); the × is
  `position:absolute; right:0` (out of flow, no width) and overlays the same slot. Because the
  counts stay `visibility:hidden` (box preserved) on hover, the slot width — and thus the agent
  name width — never changes rest↔hover. Literal "counts on top of the ×, swap on hover."
- **× hover/focus trigger preserved:** the × still reveals via the existing
  `.row:hover .remove { opacity:1 }`; its `onClick`/`title`/`aria-label`/Lucide `<X>` unchanged.
  Added `pointer-events:none` at rest → `pointer-events:auto` on hover so the overlapping invisible
  × can't intercept a click over the counts at rest; keyboard focusability of the `<button>` is
  unchanged.
- **Counts are non-interactive:** no click behavior today, and stay non-interactive — on hover they
  simply yield the slot to the ×.
- **Cross-platform:** pure CSS/DOM hover swap, no OS primitive, reuses existing diff-count color
  tokens (no new color / no new `color-mix`) — identical on WKWebView and WebView2/Chromium.
- **No tests:** CSS/markup only; no pure logic, no Rust/IPC/store change.
- **Areas touched:** `src/components/Sidebar/Sidebar.tsx` (`SessionRow` markup — wrap badge + × in
  one `.trailing` span) and `src/components/Sidebar/Sidebar.module.css` (new `.trailing`,
  absolutely-positioned `.remove` with `pointer-events` guard, `.diffCounts` hover →
  `visibility:hidden`).

## Task 347

Fix the Linux DMA-BUF workaround misfiring on hybrid Intel+NVIDIA GPUs (GPU-aware detection)

- Core rule chosen: auto-disable DMA-BUF only when the NVIDIA blob is the *only* renderer (no Mesa-driven DRM card), when GL is explicitly PRIME-routed to NVIDIA (`__GLX_VENDOR_LIBRARY_NAME=nvidia` / `__NV_PRIME_RENDER_OFFLOAD=1`), or in a VM with no native Mesa GPU. Any Mesa card present (hybrid iGPU+dGPU, nouveau, AMD/Intel, VM w/ passthrough) keeps DMA-BUF.
- nvidia-open is *detected and logged* separately but gates identically to the proprietary blob (it ships the same proprietary userspace EGL the workaround targets) — the card grouped it with nouveau; deliberately not done, because the hybrid/Mesa-present rule is what actually fixes the reported box, and an nvidia-open-only desktop still needs the workaround.
- No NVIDIA driver-version gate: the version is parsed for the diagnostic log only (a wrong threshold would risk a blank/garbled webview, worse than slow).
- VM detection tightened to require two independent signals (CPUID `hypervisor` flag + DMI/hypervisor-node/virtual-GPU corroboration, or exact DMI hit + only-virtual GPUs), with an explicit bare-metal Xen dom0 exclusion (`/proc/xen/capabilities` contains `control_d`) and exact (not substring) DMI matching, killing the "standard pc"/"kvm" false positives.
- GPU inventory read from `/sys/class/drm/card<N>` (driver symlink basename, PCI vendor-id fallback) rather than counting render nodes — same signal, more precise, and trivially pure-testable.
- Settings seam: a tri-state `RendererOverride` (Auto/ForceDisable/ForceKeep) resolved today from `RECUE_DISABLE_DMABUF` only, with an in-code note that a persisted setting must be read before `tauri::Builder` (GTK reads env at init). No Tauri command / IPC / settings field added here (future card).
- `src/components/Terminal/webglRenderer.ts` keeps its logic unchanged (it is a correct consequence-level fail-safe); only its comment plus a one-time Linux `console.info` of the WebGL renderer string in `terminalPool.ts` are added for support diagnostics.
- One boot diagnostic line is printed on Linux for BOTH outcomes (kept / disabled) with the evidence — #346 only logged the disable case, which is why the misfire was invisible.
- No app version bump / patch-notes file (mirrors #346; releases are batched by the maintainer).

## Task 349

Linux: native file dialogs follow ReCue's theme (fix always-white Adwaita dialogs in the AppImage)

- Committed to fix option (a) — correct `GTK_THEME` at boot before GTK init — and explicitly rejected (b) the tauri-plugin-dialog `xdg-portal` feature (hard-requires a running xdg-desktop-portal backend; on a minimal/wlroots box dialogs would stop working entirely, turning a cosmetic bug into a functional one), keeping (b) documented in TRAJECTORY_TO_LINUX.md as the fallback. Also rejected unsetting `GTK_THEME` (the user's system theme may not exist/render against the AppImage's bundled GTK — the reason the hook forces Adwaita) and runtime tao `set_theme` (needs a direct `gtk` dep and is a no-op while `GTK_THEME` is set).
- Source of truth for the variant is ReCue's own persisted `settings.theme` (#333), not the system color-scheme: the dialog belongs to the app, and it is deterministic + unit-testable. Missing/unreadable/unknown → `Adwaita:dark`, matching the frontend `DEFAULT_SETTINGS.theme = "dark"` (fail-open).
- Only the Adwaita *variant* is chosen (`Adwaita:dark` / `Adwaita:light`) — the family the AppImage actually bundles — never a different theme name.
- Scoped the env write to the AppImage-polluted environment only (`APPIMAGE`/`APPDIR` present). A dev / distro-package Linux run leaves `GTK_THEME` untouched so a themed desktop is not downgraded to Adwaita; making non-AppImage dialogs follow ReCue's theme is an explicit non-goal.
- Accepted that a theme toggle re-themes native dialogs only on the **next launch** (GTK reads `GTK_THEME` at init; post-boot env mutation is thread-unsafe). Surfaced as a muted Linux-only hint under Settings → Appearance → Theme.
- Escape hatches: honor the hook's `APPIMAGE_GTK_THEME` (never clobber it) and add a new `RECUE_GTK_THEME=<literal value>` force override, mirroring `RECUE_DISABLE_DMABUF` (#346); documented in TRAJECTORY_TO_LINUX.md + a one-liner in README's Linux section.
- Reading the theme before the Tauri app exists means resolving `sessions.json` directly: `$XDG_DATA_HOME` (if absolute) else `$HOME/.local/share`, + the hardcoded identifier `com.recue.app`. Guarded by a unit test that parses `tauri.conf.json` via `include_str!` so the identifier can't drift; any read failure fails open to dark.
- New module `src-tauri/src/linux_gtk.rs` (mirrors `linux_webkit.rs`) rather than extending `linux_webkit.rs`, to avoid colliding with Task 347, which edits that file; the only shared touchpoint is an appended call in `run()`.

## Task 350

Scrub the AppImage-injected environment from every child process ReCue spawns

- Scoped the fix to one shared seam rather than only `pty.rs::spawn_with_id`, per the card's hint: a new `src-tauri/src/child_env.rs` wired into the PTY spawn, `git::hidden_command` (all git + `<cli> --version` probes), the OS openers (`os_open`/`open_url`/`reveal_file_in_finder`/`reveal_file_linux` — `xdg-open`/`dbus-send`), and `path_env`'s login-shell PATH probe.
- Gated the real work `#[cfg(all(unix, not(target_os = "macos")))]` (Linux/BSD) rather than the card's `#[cfg(unix)]`, so macOS stays byte-for-byte; the pure helpers are `, test)`-widened + `cfg_attr(test, allow(dead_code))` per the `explorer_select_arg`/`reveal_file_linux`/`should_disable_dmabuf` precedent (clippy runs `--all-targets -D warnings`).
- The scrub arms only when `APPDIR` or `APPIMAGE` is present in the env map, making a dev/`.deb`/pacman/macOS/Windows run a provable identity transform (pinned by the first unit test); `scrub_command` makes zero `env*` calls when the diff is empty.
- Chose a value-based rule (strip `$APPDIR`-owned / `/tmp/.mount_…` `:`-segments from ANY var) plus a small explicit drop-list (`APPDIR`/`APPIMAGE`/`APPIMAGE_UUID`/`ARGV0`/`OWD`, and the tauri linuxdeploy-gtk scalars `GTK_THEME`/`GDK_BACKEND`) instead of enumerating vars — automatically covers PATH, LD_LIBRARY_PATH, XDG_DATA_DIRS, GIO_MODULE_DIR, GDK_PIXBUF_*, GSETTINGS_SCHEMA_DIR, GI_TYPELIB_PATH, PYTHONPATH, PERLLIB, QT_PLUGIN_PATH, GST_*.
- A var emptied by filtering is removed (never left as `""`, since an empty `LD_LIBRARY_PATH` segment means CWD to the loader); `PATH` is on a NEVER_UNSET list so it is never emptied/unset, and binary resolution (`find_on_path`) still uses ReCue's own process PATH.
- Restore `APPIMAGE_ORIGINAL_<VAR>` backups verbatim when an AppRun variant stashed them, and drop the `APPIMAGE_ORIGINAL_*` keys themselves from the child env (defensive; harmless when absent).
- Left `WEBKIT_DISABLE_DMABUF_RENDERER` (set by ReCue itself in #346) in the child env — not AppImage-injected and inert for CLI children; recorded as an explicit non-goal.
- Complementary with Task 349 (dark GTK dialogs): that card SETS `GTK_THEME` for ReCue's own process, this one STRIPS it from children under the AppImage only; outside an AppImage the scrub stays a no-op (deliberate boundary, noted in non-goals as the single place a follow-up would extend).
- Non-UTF-8 env vars are passed through verbatim (they cannot be AppImage vars) and env ordering between the scrubbed and passthrough groups is treated as insignificant to a child.
- macOS-only spawns (`usage.rs`'s `security`, `lib.rs`'s `tccutil`) are left untouched; no frontend/TS change. Docs: CLAUDE.md (layout + seams list) and TRAJECTORY_TO_LINUX.md (dated entry + real-box checklist).

## Task 348

Eliminate the white startup flash: hidden-until-painted windows + themed pre-paint background

- Pre-paint color = the theme's `--bg-base` (#1e1e2e Mocha / #eff1f5 Latte), not `--bg-sidebar`/`--terminal-bg`; duplicated in `index.html`, `src/theme.ts` and `commands.rs` with a vitest sync-guard against `tokens.css`.
- The window learns the theme pre-paint from a best-effort `recue.theme` localStorage mirror written by `applySettingsEffects` (all windows share one origin); the Rust settings blob stays the source of truth. A missing/stale mirror degrades to today's behavior (one dark→light flip) and self-heals that same launch — no white flash either way. Chose this over creating the main window from a Rust builder with an `initialization_script` (bigger, riskier change).
- Reveal is a new app-owned Rust command `reveal_window` invoked from a React mount effect, NOT `getCurrentWindow().show()` — avoids widening `capabilities/default.json` with `core:window:allow-show` and matches the existing Rust-owned window commands (open/focus/close_canvas_window).
- Reveal fires on React's first commit (0 ms timer + rAF, whichever first, idempotent) rather than waiting for the settings/session IPC, so backend latency can never delay the window.
- Added a Rust-side reveal fallback (show any still-hidden window after 2 s) so a crashed bundle / dead dev server can never leave the app running-but-invisible — the main hazard is a hidden WebView possibly throttling rAF.
- Added beyond the card's literal text: a `set_theme_background` command called from `saveSettings` on a theme change, so already-open windows' native background is updated (no stale-color gutter on resize); plus `show()` on the focus/existing-window branches of the canvas-window commands.
- Detached canvas windows get the same treatment (`.visible(false)` + `.background_color(theme)`), and the reveal hook lives in `App()` — the shared root of both the main and canvas-window routes.
- No `color-scheme` declaration is added (explicit background suffices; avoids UA form-control/scrollbar restyling), and no bundle/code-splitting work is assumed (Task 356).

## Task 351

Lazy-mount Overview terminals — visibility-gated xterm creation + a bounded scrollback-replay queue

- Committed to two of the card's three fix directions: an IntersectionObserver deferred-mount gate + a bounded FIFO scrollback-replay queue (MAX_CONCURRENT_REPLAYS = 1). Rejected the third ("smaller initial tail, rest on idle") — it needs a new backend `session_scrollback` parameter and trades away user-visible history for a win the gate already delivers.
- "Virtualize" is read as **deferred creation only**, never recycling: once a terminal is created it is never disposed/parked on scroll-out. Disposing on scroll-out would re-enter the #18 garbled-redraw trap for zero boot benefit.
- The gate lives in `Terminal.tsx` (not Overview), so it applies to every terminal surface — Overview, Canvas panels, big mode (#157), detached windows (#84) — via the one component, rather than adding an Overview-only code path.
- Bytes arriving while a session has no terminal are dropped by `outputBus` and recovered from the backend's 256 KB `Scrollback` at creation (deduped by absolute offset). This is already today's behavior for any session not rendered in the current view (e.g. booting into Canvas view), so no new mechanism is introduced; history older than the 256 KB window is not recoverable — accepted.
- The IntersectionObserver root is provided by Overview (its scrolling wall) through a small React context, because IO clips against intermediate scroll containers *before* applying `rootMargin` — a viewport-rooted observer could not pre-load off-screen wall cards. Pre-load margin chosen as "200px 600px" (≥1.5 cards at the 400px default column min-width).
- `focusTerminal` gains a short-lived (3 s) pending-focus so a Canvas panel focused before its deferred mount still receives keystrokes; without it the CanvasSurface active-leaf effect would silently no-op.
- The pre-replay pending buffer is capped (2 MB, oldest dropped) only until the scrollback fetch is dispatched — provably gap-free, since the backend pushes to its Scrollback before emitting, so pre-dispatch chunks are ≤ the snapshot's end offset.
- Non-terminal Overview panels (FileViewer / DiffInspector / Kanban / FileTree / Scheduled / Recurring) are NOT gated in this task (smaller mount cost); noted as a follow-up that can reuse the same hook.
- No backend change and no new user setting: `session_scrollback` stays sync (Tasks 353/355 own that), and the rollback path is two constants.
- Docs updated as part of the task (repo convention): a `(#351)` note in CLAUDE.md and closing the "Overview terminal virtualization" future-work item in TRAJECTORY_TO_LINUX.md with real-box verification checks.

## Task 355

Bounded-parallel boot resume + a one-shot claude project-log index

- Dropped "resume visible/selected sessions first" from scope: `selectedId` is not persisted at all, and `canvases`/`settings` are deliberately opaque frontend-owned JSON blobs the Rust store must not parse; with a 4-wide pool the reordering win is a few hundred ms. Records are dispatched in persisted order. (Visibility is Task 351's concern.)
- Fixed pool width `RESUME_CONCURRENCY = 4`, clamped to the record count; not derived from `available_parallelism` (the work is process-creation/IO-bound, and a wider pool just piles concurrent spawns onto the OS during first paint).
- The projects-dir cache is a **boot-scoped snapshot** (`title::ProjectLogIndex`, built once, dropped when the loop ends) rather than a global/TTL cache — the live title worker keeps its per-call `locate_log`, so a project dir created after boot is always seen and there is nothing to invalidate.
- The index lists each project dir's `*.jsonl` filenames (name -> dir) instead of only caching the dir list, making lookups O(1) and the cost O(M) rather than O(N x M) stats; a project dir whose listing fails falls back to the old per-dir `is_file` probe so Found/Absent/Unknown (and the fail-open Fork guard) semantics are preserved exactly.
- New `src-tauri/src/boot.rs` module (rather than growing `lib.rs`) so the pool + worker-count helpers are unit-testable without a Tauri app; `lib.rs`'s setup block collapses to one call.
- No batching of `Store::set_forkable` and no new events/error toasts: it already persists only on change (~zero writes on a normal boot), and a failed resume stays best-effort (`let _ =`) so the child's own exit remains the single existing signal.
- Frontend is explicitly untouched: `booting` / `RECONNECT_BACKSTOP_MS` / the #30 reconnecting flow stay as-is (faster resume only makes more resumes land inside that window).
- `SessionManager`/`pty.rs` production code is unchanged (already concurrency-safe per #260; portable-pty 0.9.0 cloexecs pty fds + closes fds>=3 in the child on unix and passes bInheritHandles=FALSE on Windows) — only a unix-gated concurrent-spawn regression test is added there.

## Task 352

Batch the boot IPC waterfall — one aggregated `boot_state` command + parallel event listeners + a no-flash loading gate

- Aggregate: added ONE new Rust command `boot_state` (async, `Result<BootState, SessionError>`, `spawn_blocking` for the Windows `cmd /C ver` probe) returning all 21 boot reads (sessions, recents, repo colors, overview panels/order, legacy open_files, canvas_layout/canvases/templates, settings, sidebar width/collapsed, repo_order, diff_seen, schedules, recurrings, last_version, app_version, platform, windows_build, detached_canvas_ids). Chose async over sync to keep the Windows probe off the webview main thread and to match #308/#330; noted a sync fallback in the plan's risks.
- Every existing command and `ipc.ts` wrapper is KEPT and still registered (per the card) — some become boot-unused; they remain the API surface for Settings/About and other call sites. No command deleted.
- Boot ordering: the 13 `listen` registrations are batched (`Promise.all` inside each `subscribe*Events` + across the four) and the `boot_state` fetch is started in parallel with them, but the payload is APPLIED only after the subscription await resolves — preserving today's "listeners exist before any event can land" invariant. Result: 14 invokes in 2 concurrent waves (was 34 invokes in 22 sequential waves).
- `platform` + `windowsBuild` must land in the SAME store `set()` as `sessions` (the #346 invariant: terminalPool reads them at host-creation time) — made an explicit acceptance criterion + test.
- Kept the `refresh()` action name (now a thin `bootState()` fetch + `applyBootState()` apply) so `src/store.refresh.test.ts` keeps its entry point; the view/onboarding/prune/file-tree-poll steps stay init-only, and all IS_MAIN_WINDOW-only side effects (legacy open_files clear, terminal respawn, canvas migration persist, update toast + setLastVersion, usage poll) are preserved verbatim — so the detached canvas window (#84) boots identically.
- Loading state: interpreted "minimal" as a `booted: boolean` store flag gating three empty-state affordances (Overview `EmptyState`, Sidebar "No repositories yet.", CanvasSurface's empty-canvas hint) to render NOTHING until the payload lands — no spinner/skeleton, deliberately complementary to Task 348's pre-paint window-show gate. `booted` also flips true when `boot_state` fails (outside Tauri), so the UI never hangs blank.
- Single point of failure accepted: one command replaces three independent try/catch groups; `boot_state` is infallible server-side (in-memory store reads) and the only realistic failure ("not inside Tauri") already sank all three groups before.
- Extracted only ONE new pure module (`src/boot.ts` → `resolveCanvases`, the canvas-tab/legacy-migration/detached-override branch) + its test, keeping the rest of the derivation inside the store action to avoid an import cycle with `store.ts`.
- Out of scope: the sidebar's post-boot git refreshes (Task 359), `maybeOnboardAgent`'s 3 `agent_info` probes, `pruneMissingFolders`' `dir_exists` calls (all already void-ed/off the critical path), and the boot resume loop (Task 355).

## Task 353

Move the straggler sync Tauri commands (PTY spawn/kill/scrollback, agent probes, git writes) off the webview main thread

- Conversion recipe: converted commands take an owned `app: AppHandle` (no `State<'_, _>` args) and resolve `app.state::<SessionManager>()` / `app.state::<Store>()` INSIDE the `spawn_blocking` closure — `State` is a non-`'static` borrow and can never be captured. This also keeps the two non-`Result` commands (`agent_info`, `search_session_output`) non-`Result` (Tauri forces `Result` only when a borrowed `State` arg is present in an async command), so `src/ipc.ts` needs no change.
- No `SessionManager`/`Store` restructuring: their `std::sync::Mutex`es stay (no `tokio::sync`, no `Arc<SessionManager>` managed-state swap). No guard can cross an `.await` because every lock is taken inside a sync method called from inside the blocking closure — and the `Send` bound on Tauri's spawned command future makes the alternative a compile error. `pty.rs` / `store.rs` are untouched (also minimizes conflict with Tasks 350/354).
- KEEP SYNC (justified per-command, as the card asked): `write_stdin` (per-keystroke; the work is microseconds, and async would break FIFO ordering — `terminalPool.ts` fires it un-awaited from xterm `onData`, so two racing tasks could reach the PTY out of order); `resize_pty` (cheap ioctl, same un-awaited fire-and-forget ordering hazard, stale-size regression for no win); `list_sessions` (in-memory `Vec` clone).
- The blocking-`write_all` problem for `write_stdin` is called out as a NON-GOAL + follow-up card (it needs a per-session writer thread + FIFO channel in `pty.rs`, not `spawn_blocking`).
- Scope rule chosen: convert every sync command that spawns a process or shells out to git. That adds 6 commands beyond the card's list — `spawn_worktree_agent`, `spawn_worktree_agent_new_branch`, `search_session_output` (N x 256KB scan per search keystroke), and `pull_branch` / `checkout_branch` / `create_branch` (the trio #330 explicitly deferred; `pull_branch` is a network call on the main thread) — plus `create_schedule` / `create_recurring` / `fire_schedule_now` (eager `git worktree add` and inline PTY spawn). 17 commands total.
- Explicitly NOT converted (documented, not silent): the `files.rs` family, `list_skills`, `save_clipboard_image`, `open_url`/`reveal_path`/`open_data_folder`, and the in-memory store getters/setters — a different family; `search_file_contents` flagged as the one plausible remaining straggler for a follow-up card.
- No automated command-level test is added (the repo has no `tauri::test` mock-app harness and the change is structural); acceptance rests on compile-time guarantees (`Send` bound), clippy `-D warnings`, the unchanged existing test suites, and enumerated manual smoke checks (GUI responsiveness is not CI-assertable — logged per the #345 TRAJECTORY convention).
- `#[tauri::command(async)]` is explicitly rejected in favor of `async fn` + `spawn_blocking` (it would run blocking bodies on tokio worker threads).

## Task 354

Fast, reliable session exit — kill the PTY process group and derive `Exited` from the child, not the reader's EOF

- Root cause confirmed in the vendored crate: portable-pty 0.9.0's unix spawn ALREADY calls `setsid()` in `pre_exec` (src/unix.rs:257), so the child is a session/process-group leader (pgid == pid). No `pre_exec`/`setsid` of our own is needed — `killpg(child_pid)` is already correct and can only reach the agent's own descendants. Assumed we therefore add only `libc` (unix-only, already in the lock file via portable-pty) and not `nix`.
- Interpreted "treat child-wait completion as exit" as the primary fix AND kept the group kill: a per-session exit-waiter thread owns the `Child`, blocks in `wait()`, and becomes the SOLE emitter of `Exited`; the reader thread stops emitting it (exactly-once preserved, so the frontend's consume-once `intentionalKills` contract is untouched).
- To avoid losing trailing output (the waiter could beat the reader's last Output), the waiter waits on a bounded `reader_done` flag (150ms) before emitting, then hangs up lingering descendants (SIGHUP group) and escalates (SIGKILL) after a further 250ms. Chose these bounds over emitting instantly; worst-case added exit latency ~400ms, normally a few ms.
- Preserved exit-code semantics by construction: portable-pty maps a signal death to exit code 1 (never 0), so a killed agent can never be misread as a clean code-0 exit and get its record forgotten (#63). Documented + asserted in a test rather than adding a new "killed" flag to the event payload.
- Shutdown safety: added an `ExitState::silent` flag that `kill_all` sets before signalling, so a shutdown kill emits NO `Exited` at all (a claude that traps SIGHUP and exits 0 could otherwise reach a still-live webview and delete records, breaking #30's "quit keeps sessions"). `kill_session`, by contrast, still emits exactly one `Exited` (today's behavior) so `intentionalKills` bookkeeping is unchanged.
- `kill_session` made non-blocking (SIGHUP to the group immediately; SIGKILL escalation on a short detached thread after 500ms), replacing portable-pty's ~200ms in-call sleep. `kill_all` pays ONE shared 200ms grace then a SIGKILL sweep (instead of ~200ms x N serially), inline rather than via detached threads (which may not survive process exit → orphans).
- Signal choice: SIGHUP first (matching portable-pty's and a terminal's semantics), not SIGTERM; escalate to SIGKILL.
- Windows/ConPTY kill left byte-for-byte as-is (TerminateProcess via portable-pty's ChildKiller); no job-object process-tree kill (explicit non-goal). Windows still inherits the platform-neutral child-wait-driven `Exited` (an improvement, cfg-free).
- Added Restart hardening: a same-id respawn silences + kills any stale prior generation, so a stale waiter's late exit can't be attributed to the fresh session.
- Chose NOT to also killpg the tty's foreground process group (`MasterPty::process_group_leader`) — the setsid'd child's own group already covers claude's non-detached descendants; a descendant that setsid's itself is documented as a known, best-effort limitation.
- No frontend changes: `isCleanExit` / `forgetExitedSession` / `intentionalKills` / the Restart overlay are all deliberately untouched.

## Task 357

Settings → Rendering (Linux-only): DMA-BUF + terminal-renderer overrides with a boot-decision readout

- Surfaced as a dedicated Linux-only **Rendering** section in the Settings nav (icon MonitorCog, after Appearance), not rows inside Appearance: these are engine/diagnostic switches plus a log readout, and a filtered SECTIONS array makes the whole thing vanish on macOS/Windows (Appearance stays byte-identical there). Includes a guard clamping a deep-linked "rendering" section id to the default on non-Linux.
- Setting names/polarity chosen: `linuxDmabufRenderer: "auto" | "on" | "off"` (names the *renderer*: "off" ⇒ ForceDisable ⇒ sets WEBKIT_DISABLE_DMABUF_RENDERER=1) and `linuxTerminalRenderer: "auto" | "webgl" | "dom"`, both defaulting to "auto" so existing installs and other OSes are unchanged. The env var keeps its inverted sense (RECUE_DISABLE_DMABUF=1 = disable), so the plan asserts both directions in tests.
- Precedence: user-exported WEBKIT_DISABLE_DMABUF_RENDERER > RECUE_DISABLE_DMABUF > persisted Settings > auto-detection (i.e. Task 347's rules 1–2 stay unchanged; the setting is only consulted when no env override exists). A setting rendered ineffective by an env var is *shown as such* in the readout rather than silently ignored.
- The persisted DMA-BUF mode is read from `sessions.json` on disk at boot (before tauri::Builder / GTK init) via a NEW shared Rust module `early_settings.rs` — which also becomes the home for Task 349's identical need. Instruction is conditional: rewire `linux_gtk.rs` onto it only if that file already exists at implementation time; do not depend on 349.
- The terminal-renderer override is applied **live** by loading/disposing the WebglAddon on the existing pooled xterms (never disposing a host — the #18 no-replay invariant; no clearTextureAtlas, per #221), with a documented fallback to "applies to newly opened terminals" if a real box shows artifacts. DMA-BUF is restart-scoped and the UI says so.
- The frontend learns the boot decision via a new read-only `renderer_diagnostics` Tauri command returning an `Option<RendererReport>` captured in a `OnceLock` at boot (exact log line + reason + evidence + what decided it + the normalized setting in effect at boot); it returns null on macOS/Windows. Comparing the draft against `report.setting` (normalized) is what drives the "Restart to apply" note without a spurious note on a fresh install.
- No in-app "Restart now" button (a relaunch would kill every running agent's PTY) — deliberately out of scope; a Copy-diagnostics button (existing clipboard write, #282) is included instead for bug reports.
- Rust command payload fields stay snake_case (the AgentInfo precedent — no serde rename_all in commands.rs); the TS interface mirrors them verbatim.
