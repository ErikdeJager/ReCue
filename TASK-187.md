# Task 187

### 187. [x] "Save current canvas as template" — seed the Template Editor from a live canvas

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

Canvas templates (#117/#118) are reusable saved layouts whose leaves hold inert **action
blocks** (`new-agent` / `new-terminal` / `open-file` / `open-diff` / `open-kanban` /
`open-filetree`) instead of live content. Today a template is built **from scratch** in the
full-screen **`TemplateEditor`** (`src/components/TemplateEditor/TemplateEditor.tsx`),
dragging blocks from a palette. The user wants the reverse on-ramp: after assembling a
canvas they like (the active tab, with real agents/files/diffs/kanban/terminals), **turn
that live canvas into a template** in one action — opening the Template Editor
**pre-populated** with equivalent blocks, where file/kanban blocks already carry the
correct relative path, so they only need to name + tweak + Save.

**Goal & why.** Add a **"Save current canvas as template…"** action that:

1. Takes the **active canvas's** live BSP layout (`canvases.find(activeCanvasId).layout`).
2. Maps each live leaf's `CanvasContent` → the equivalent template **block** content
   (the inverse of #118's instantiation), preserving the split structure + `sizes`.
3. Opens the `TemplateEditor` seeded with that block tree (and a sensible default name),
   where the user finishes and Saves to the existing `canvas_templates` blob.

This removes the tedium of rebuilding a layout block-by-block and makes "I want this exact
setup again, in another repo" a two-click flow (save → later "New tab from template…").

**The mapping (live content → block) — the heart of this task.** The block registry
(`src/components/Canvas/templateBlocks.ts`, `BLOCK_REGISTRY`) already carries a **`liveKind`**
field on every block (the live kind it instantiates into). So the inverse is a **reverse
lookup**: for a live leaf of kind `K`, find the block whose `liveKind === K`.

| Live `CanvasContent.kind` | → Block kind     | Config carried over                               |
|---------------------------|------------------|---------------------------------------------------|
| `agent`                   | `new-agent`      | custom session **name** if set (see below); **no prompt** |
| `terminal`                | `new-terminal`   | none                                              |
| `file`                    | `open-file`      | `file` (the repo-relative path); **drop** `repoPath` |
| `diff`                    | `open-diff`      | none (working-tree diff; see out-of-scope)        |
| `kanban`                  | `open-kanban`    | `file` (the board's repo-relative path); drop `repoPath` |
| `filetree`                | `open-filetree`  | none                                              |
| `scheduled`, `pending`    | — (no block)     | **dropped** (collapse the split, like `removeLeaf`) |

- **`repoPath` is intentionally dropped** — a template is folder-agnostic; the repo is
  chosen when the template is *used* (`TemplateUseModal`, #118). Only the relative `file`
  travels.
- **Agent name, not prompt.** A live agent has a running conversation, not a single
  "initial prompt," so `prompt` is **not** recoverable → leave it empty (the user can add
  one in the editor before saving). The agent's **custom name** (`session.name`, if the
  user renamed it — #57) is worth carrying as the block's `name` (#136). The auto-title
  (#97) is **not** carried (it's not a deliberate label). Resolving the name needs the
  `sessions` list, so the store action injects a `resolveAgentName(sessionId)` callback
  into the otherwise-pure mapper.

**Where it lives.** Add a fourth item to the **▾ Templates menu** in
`src/components/Canvas/CanvasTabs.tsx` (which already has "New tab from template…", "New
template…", "Manage templates…"): **"Save current canvas as template…"**, placed after
"New template…". **Disabled** (greyed, like the existing `disabled={!hasTemplates}` item)
when the active canvas has no panels (`layout` is null) — nothing to save.

**Seeding the editor.** `TemplateEditor` currently seeds its draft `layout`/`name` from
`existing?.layout` when `templateEditorId` is set, else empty. Add an optional **seed**:

- New store state `templateEditorSeed: CanvasNode | null` (and `templateEditorSeedName:
  string | null`), set by a new action `openTemplateEditorFromCanvas()` and **cleared by
  `closeTemplateEditor()`**.
- `openTemplateEditorFromCanvas()`: read the active layout; compute the block tree via the
  new mapper; if the result is `null` (e.g. a canvas of only scheduled/pending panels),
  **toast** "This canvas has nothing to save as a template" and return; else set
  `templateEditorOpen: true, templateEditorId: null, templateEditorSeed: <tree>,
  templateEditorSeedName: <active canvas name>`.
- `TemplateEditor`'s `useState` initializers: `layout` → `existing?.layout` clone, else
  `seed` clone, else `null`; `name` → `existing?.name ?? seedName ?? ""`. (Seed is cloned
  with the same `JSON.parse(JSON.stringify(...))` deep-copy already used for `existing`.)

**Scope.** Active canvas only; produces an **unsaved** draft in the editor (the user must
Save — consistent with "New template…"). Works whether or not the active canvas is detached
(#84) since the layout lives in the store either way. Main-window-only (the tab strip /
Templates menu only exists there, like all other template actions).

**Out of scope.**
- Recovering an agent's original prompt (not knowable from a live session).
- Preserving a branch-compare diff (#81): `open-diff` is working-tree only, so a
  compare-diff panel becomes a plain working-diff block. (Acceptable; note it.)
- Auto-saving the template (the editor's Save flow is unchanged).
- Any change to instantiation (#118) or the block registry's kinds.

**Concrete files/symbols.**
- **New** `src/components/Canvas/canvasToTemplate.ts` — pure `canvasToTemplate(layout,
  resolveAgentName?)` (mirrors `templateInstantiate.ts`'s shape/placement).
- **New** `src/components/Canvas/canvasToTemplate.test.ts` — unit tests.
- `src/components/Canvas/templateBlocks.ts` — reuse `BLOCK_REGISTRY` `liveKind`; optionally
  add a helper `blockForLiveKind(kind): BlockDescriptor | undefined` (reverse lookup) so the
  mapping has a single source of truth.
- `src/store.ts` — add `templateEditorSeed` / `templateEditorSeedName` state (near
  `templateEditorId`, ~line 585/1227), `openTemplateEditorFromCanvas()` action (near
  `openTemplateEditor`, ~line 2070), and clear the seed in `closeTemplateEditor`.
- `src/components/TemplateEditor/TemplateEditor.tsx` — read the seed in the `useState`
  initializers (lines ~234–239).
- `src/components/Canvas/CanvasTabs.tsx` — add the menu item (~line 280) + a `canSave`
  derive from the active canvas's layout.

**Subtasks**

1. [x] **Reverse-lookup helper** in `templateBlocks.ts`: `blockForLiveKind(liveKind)` finds
   the `BLOCK_REGISTRY` entry whose `liveKind` matches (undefined for non-block kinds).
2. [x] **Pure mapper** `canvasToTemplate.ts`:
   - [x] `canvasToTemplate(layout, resolveAgentName?)` → `CanvasNode | null`.
   - [x] Leaf → `blockForLiveKind(content.kind)`; none → `null` (drop). Else
         `{ kind: desc.kind }` + `file` (when `desc.config === "file"` and truthy) +
         `name` (when `desc.liveKind === "agent"` and the resolver returns one). Reuses the
         leaf's existing `id` (pure/deterministic).
   - [x] Split → map both; both null → null; one null → the survivor (collapse); else
         `{ ...node, a, b }` keeping `dir` + `sizes`.
3. [x] **Unit tests** `canvasToTemplate.test.ts` (6 `it`s, all green): each live kind →
   block kind (+ id reuse); file/kanban carry the relative path and drop `repoPath`; agent
   carries the resolver's name and omits it (and `prompt`) when absent; scheduled/pending
   dropped + collapse; empty/all-dropped → `null`; mixed nested tree preserves
   `dir`/`sizes`/order.
4. [x] **Store**: `templateEditorSeed`/`templateEditorSeedName` (default null);
   `openTemplateEditorFromCanvas()` (maps the active layout with an agent-name resolver
   over `sessions`, toasts + no-ops on null, else opens a new-template editor carrying the
   seed); seed cleared in **both** `closeTemplateEditor` **and** `openTemplateEditor` (so a
   real/blank-template open never inherits a stale seed).
5. [x] **TemplateEditor**: `name` falls back to `seedName`, `layout` to a deep-clone of the
   `seed`, when not editing an `existing` template.
6. [x] **CanvasTabs**: added the **"Save current canvas as template…"** item after "New
   template…", `onClick` → `openTemplateEditorFromCanvas()` + closes the menu, `disabled`
   when the active layout is null (`canSaveAsTemplate`).
7. [x] **Verify** — `npm run build`, `npm run lint`, `npm test` (257, +6) green; **no Rust
   changes**. The end-to-end manual flow is **runtime-unverified** in this autonomous loop
   (no GUI session) — see Notes; the mapping is unit-tested and the save/instantiate path
   is unchanged.

**Acceptance criteria**

- [x] A **"Save current canvas as template…"** item exists in the Canvas ▾ Templates menu,
      disabled when the active canvas is empty (`disabled={!canSaveAsTemplate}`).
- [x] Triggering it opens the **Template Editor pre-populated** with one block per live
      panel, structure + `sizes` preserved, `open-file`/`open-kanban` carrying the relative
      path and `new-agent` carrying the agent's custom name when set. _(Logic unit-tested;
      editor seeding wired via `templateEditorSeed`; live render runtime-unverified — see
      Notes.)_
- [x] `scheduled`/`pending` panels are omitted (split collapses); a canvas with nothing
      templatable shows a toast ("This canvas has nothing to save as a template") and does
      not open the editor.
- [x] The opened draft is **unsaved** until Save (`openTemplateEditorFromCanvas` only sets
      editor state; the editor deep-clones the seed; `onSave` → `saveTemplate(name, layout,
      editingId=null)` creates the template only on Save). Saving makes it usable via "New
      tab from template…".
- [x] `canvasToTemplate` is a pure, unit-tested function; `npm run build`, `npm run lint`,
      `npm test` pass; no Rust changes.

**Notes**

- **Autonomous refine (2026-06-26):** the user is no longer responding; decisions below were
  made to the best judgment and are also logged in `ASSUMPTIONS.md`.
  - Trigger = a new item in the existing **▾ Templates menu** (most consistent with "New
    template…"); not a separate toolbar button.
  - Mapping reuses the registry's `liveKind` (single source of truth); reuses existing
    leaf/split ids (keeps the mapper pure); preserves split `dir` + `sizes`.
  - Agent blocks carry the **custom** session name only (not auto-title, not prompt —
    prompt is unrecoverable from a live session).
  - `diff` → `open-diff` is working-tree only; a branch-compare (#81) is not preserved.
  - Default template name = the active canvas's tab name (editable before Save).
  - All-dropped / empty canvas → toast + no-op rather than opening an empty editor.
  - Seeding via new `templateEditorSeed`/`templateEditorSeedName` store fields, cleared on
    `closeTemplateEditor` (mirrors how the editor is mounted-only-while-open).
- **Depends on: none** — the template system (#117/#118), block registry, `TemplateEditor`,
  `templateInstantiate.ts`, and the `canvas_templates` blob are all **already shipped**. The
  other Refine cards ("double click drag bar renames", "Keybinds for panel creation") are
  unrelated. Independent of #186 (canvas equalize) too.
- **References:** `templateBlocks.ts` (`BLOCK_REGISTRY`, `liveKind`, `newBlockContent`);
  `templateInstantiate.ts` (the forward mapping this inverts); `TemplateEditor.tsx` (draft
  seeding at lines ~234–239, block config UI); `CanvasTabs.tsx` (Templates menu ~lines
  262–303); `store.ts` (`openTemplateEditor`/`closeTemplateEditor` ~2070, `templateEditorId`
  ~585); `CanvasContent` fields in `src/types/index.ts:226`. CLAUDE.md "Canvas templates
  (#117/#118)".

**Implementation notes (2026-06-26 — done)**

- Implemented exactly as planned. Files: **new** `canvasToTemplate.ts` +
  `canvasToTemplate.test.ts`; `templateBlocks.ts` (+`blockForLiveKind`); `store.ts`
  (seed state + `openTemplateEditorFromCanvas` + seed clearing in
  `open`/`closeTemplateEditor` + import); `TemplateEditor.tsx` (seed fallback in the
  `useState` initializers); `CanvasTabs.tsx` (menu item + `canSaveAsTemplate`). **No
  backend/Rust changes.**
- **Mapping is the registry inverse:** `blockForLiveKind` reverse-looks-up
  `BLOCK_REGISTRY` by `liveKind`, so the live→block mapping has the same single source of
  truth as #118's block→live instantiation. `repoPath` is dropped (folder-agnostic
  template); only the relative `file` and an agent's **custom** name travel; `prompt` is
  intentionally empty (unrecoverable from a live session).
- **Unsaved-until-Save** preserved: `openTemplateEditorFromCanvas` only sets editor state
  (seed + open). The editor deep-clones the seed into its draft (so editing never mutates
  the store seed or the live canvas), and `onSave` → `saveTemplate(name, layout, null)`
  creates the template only on Save (verified `saveTemplate` treats a null id as create).
- **Seed lifecycle:** cleared on `closeTemplateEditor` **and** on `openTemplateEditor`
  (defensive — so "New template…"/edit never inherit a stale canvas seed even though the
  full-screen editor makes that ordering unreachable in practice).
- **Runtime-unverified (autonomous loop, no GUI session):** subtask-7's end-to-end flow
  (build a canvas → Save as template → editor opens pre-populated with correct blocks /
  names / paths / proportions → Save → reuse via "New tab from template…"). The pure
  mapping is unit-tested (6 cases) and the editor-seeding + save/instantiate paths reuse
  existing, shipped code, but the live editor render and the menu gesture were not
  exercised in a running app. Mirrors the #84/#186 precedent of recording
  runtime-unverified UI behaviour; recommend a quick manual pass on the next
  `npm run tauri dev`.
- **Known limitation (per scope):** a branch-compare diff panel (#81) maps to a plain
  working-tree `open-diff` block (the compare refs aren't preserved); `diff` blocks carry
  no config. Acceptable and documented in the plan's Out-of-scope.
