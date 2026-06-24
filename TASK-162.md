### 162. [x] Settings: auto-save vs manual save (⌘S), with a Save button in manual mode

**Status:** Done
**Depends on:** none
**Created:** 2026-06-24

**Description**

Add a global Settings choice between **auto-save** (today's behavior, the default) and
**manual save**. The card: "Inside the settings, the user should be able to choose
between auto save and manual save options. Auto save is the default option, but should
the user choose to manually save, the cmd+s button saves files and the auto save
indicator changes to a save button instead. Ensure that the entire plan keeps in
account for all the different places that may save files."

**Goal / why:** some users don't want every edit written to disk continuously; give
them an explicit manual-save mode (⌘S / a Save button) while keeping auto-save the
default so nothing changes for everyone else.

**Key insight — one chokepoint covers every file save.** Every editable **file** write
already routes through the shared **`src/useAutoSaveFile.ts`** hook (#148): the
**FileViewer** raw/plain-text editor (#148) and the **KanbanPanel** Board + Raw editors
(#149) are its only consumers. Implementing the mode there covers "all the different
places that may save files" in one place. (The **ScheduledPanel** auto-saves a
*schedule record* via `update_schedule`, not a file — out of scope; see Notes.)

**Grounding (concrete files / symbols):**

- `src/useAutoSaveFile.ts` — the hook. `setText` (≈ 100-108) marks dirty + sets status
  "saving" + `scheduleWrite` (debounced `writeNow`, ≈ 67-98). `onBlur` flushes (≈
  192-200); the per-file cleanup effect flushes a pending write on unmount/file-switch
  (≈ 136-151); the poll/`load` reconcile skips while `dirty`/`focused` (≈ 110-133). The
  returned `AutoSaveFile` exposes `text/error/status/setText/onFocus/onBlur/
  onComposition*` — **no `save()` or `dirty` today**.
- `src/types/index.ts` — `interface Settings` (≈ 183) and `src/store.ts`
  `DEFAULT_SETTINGS` (≈ 259-269, e.g. `confirmDestructive`, `canvasCloseBehavior`,
  `autoName`, `defaultView`); the blob is merged over `DEFAULT_SETTINGS`
  (`loadSettings`, ≈ 276) so adding a field upgrades old `sessions.json` cleanly.
- `src/components/Settings/Settings.tsx` — the modal (sections Terminal / Sessions /
  Appearance / Behavior / Data & About); a draft applied on Save via
  `applySettingsEffects`. New toggle goes in **Behavior**.
- Status UI to convert: `FileViewer.tsx` ≈ 88-93 (`{editable && status !== "idle" &&
  <span class=status role=status>Saving…/Saved</span>}`) and the Kanban toolbar
  (`KanbanPanel.tsx` uses `status` ≈ 352, rendered in `.toolbar`/`.status`).
- `src/useKeyboardNav.ts` — global shortcuts via `window.addEventListener("keydown",
  onKeyDown, true)` (capture phase), `(e.metaKey || e.ctrlKey)` + key + `preventDefault`
  (≈ 30-156). Add ⌘/Ctrl+S here.

**Scope:** a `Settings` toggle (default auto), manual-save support in `useAutoSaveFile`
(buffer-dirty + explicit `save()`), a ⌘S handler that saves the focused file, and a
Save-button rendering of the indicator in manual mode for both FileViewer and Kanban
toolbars.

**Explicitly out of scope:**

- ScheduledPanel's debounced schedule-record save (not a file write). Note it for
  awareness but don't change it.
- Per-file or per-panel save-mode (the setting is **global**).
- A dirty-file "unsaved changes" close confirmation prompt (manual mode flushes on
  unmount/file-switch as a safety net instead — see Notes).
- Reworking the kanban edit→buffer timing (that's **#160**; this task governs
  buffer→disk timing, which composes with it).

**Subtasks**

1. [ ] **Setting:** add `autoSave: boolean` to `Settings` (`types/index.ts`) and to
   `DEFAULT_SETTINGS` (`store.ts`) defaulting to **`true`** (auto). In
   `Settings.tsx` Behavior section, add a toggle "Auto-save files" with helper text
   (when off: "Save manually with ⌘S or the Save button"). Persist via the existing
   settings draft/Save flow.
2. [ ] **`useAutoSaveFile` manual mode:** read `autoSave` from the store inside the
   hook.
   - **Auto (true):** unchanged behavior.
   - **Manual (false):** `setText` updates the buffer + marks `dirty` but does **not**
     `scheduleWrite`; status reflects unsaved (extend `SaveStatus` with `"dirty"`/
     `"unsaved"`, or expose a `dirty: boolean`). Add `save(): void` that flushes the
     dirty buffer via `writeNow`. Keep the poll/`load` reconcile (never clobber unsaved
     edits). **Blur does not flush** in manual mode; **unmount / file-switch still
     flushes** dirty content (data-loss safety — document). On mode switch, reconcile:
     manual→auto schedules a write if dirty; auto→manual cancels the pending debounce
     but keeps the dirty buffer.
   - Extend the returned `AutoSaveFile` with `dirty: boolean`, `save: () => void`, and
     `manual: boolean` (or `mode`).
3. [ ] **Saver registry** (`src/saverRegistry.ts`, a tiny non-React singleton like
   `outputBus`/`terminalPool`): mounted editable buffers register `{ id, file, focused,
   isDirty(), save() }` (via the hook's effect; focus tracked through `onFocus`/
   `onBlur`). Expose `saveFocused()` — saves the focused registered saver, or, if none
   is focused, **all** currently-dirty savers (so ⌘S always "saves files").
4. [ ] **⌘S shortcut:** in `useKeyboardNav` (capture phase), handle `(meta|ctrl)+s`:
   when `settings.autoSave === false`, `preventDefault()` and call
   `saverRegistry.saveFocused()`. In auto mode, leave default (no-op or browser
   default; do not hijack).
5. [ ] **Save-button UI:** in manual mode, both the FileViewer toolbar (≈ 88-93) and
   the Kanban toolbar render a **Save button** in place of the "Saving…/Saved" status —
   primary/enabled labeled "Save" when `dirty`, muted/disabled "Saved" when clean;
   clicking calls `save()`. In auto mode, keep the existing status hint. Use on-system
   tokens; keep the toolbar layout (status/segmented) intact.
6. [ ] **Coverage check:** confirm both file savers (FileViewer raw/text, Kanban
   Board/Raw) respect the mode via the single hook; manually confirm no other code path
   writes a file outside `useAutoSaveFile` (grep `writeTextFile` usage). Note
   ScheduledPanel is record-save, not file-save (unchanged).
7. [ ] **Tests:** unit-test the manual-mode hook logic where feasible (dirty set on
   `setText` without write; `save()` flushes; mode-switch reconcile) — extract pure
   helpers if needed, or test the registry's `saveFocused` selection. Existing
   `useAutoSaveFile`/kanban tests must still pass in auto mode.
8. [ ] **Verify:** `npm run build`, `npm run lint`, `npm test`. Manual: default
   (auto) unchanged; switch to manual in Settings → editing a file/kanban shows a Save
   button (not "Saving…"); ⌘S and the button both write; no write happens on
   keystroke/blur/debounce; switching files or closing a panel with unsaved edits still
   saves (no silent loss); flip back to auto → debounced auto-save resumes.

**Acceptance criteria**

- [ ] Settings has an "Auto-save files" toggle (default **on**); the choice persists
      across restarts.
- [ ] With auto-save **on**, behavior is unchanged (debounced writes + "Saving…/Saved"
      hint) for FileViewer and Kanban.
- [ ] With auto-save **off**: edits are **not** written on keystroke/blur/debounce; the
      indicator becomes a **Save** button (enabled when dirty), and **⌘S** saves the
      focused file. Both FileViewer and Kanban honor this.
- [ ] No file-saving path bypasses the setting (all route through `useAutoSaveFile`).
- [ ] Unsaved edits are not silently lost when switching files or closing a panel in
      manual mode (flush-on-unmount safety).
- [ ] `npm run build`, `npm run lint`, `npm test` pass.

**Notes**

- **Single chokepoint:** because FileViewer and Kanban are the only `useAutoSaveFile`
  consumers, the mode is implemented once in the hook + the two toolbars — satisfying
  "all the different places that may save files." ScheduledPanel saves a schedule
  *record* (via `update_schedule`), not a file, so it's deliberately excluded.
- **⌘S target:** saves the **focused** editor's file; if no editor is focused, saves
  **all** dirty file buffers. Conventional document behavior, but robust to multiple
  open panels. (Alternative: focused-only no-op when unfocused — chose save-all-dirty so
  ⌘S never appears to do nothing while edits are pending.)
- **Manual-mode flush exceptions:** blur does **not** flush (that would be auto-ish),
  but unmount / file-switch **does** (so closing a panel can't silently lose work). A
  full "discard?" prompt is out of scope.
- **Interaction with #160 / #161:** #160 (kanban commit-on-confirm) governs *edit →
  buffer* timing; this task governs *buffer → disk* timing — orthogonal and composing
  (a confirmed edit marks dirty; ⌘S/Save flushes). #161 (kanban UI polish) styles the
  kanban toolbar including this indicator/Save button — whichever of #161/#162 lands
  second should reconcile the Save-button styling there. The FileViewer toolbar is the
  independent primary surface, so this task is **not** blocked by the kanban tasks.
- **Task numbering:** highest existing is #161 (TASK-154…161.md; board #156–#161;
  `TASK_ARCHIVE.md` ≤ #153). Hence #162.
- **Dependencies:** none — all infrastructure exists (Settings #100, `useAutoSaveFile`
  #148, `useKeyboardNav`).
- **References:** `useAutoSaveFile.ts` (`setText`/`scheduleWrite`/`writeNow`/`onBlur`/
  cleanup), `types/index.ts:183` (`Settings`), `store.ts:259` (`DEFAULT_SETTINGS`),
  `Settings/Settings.tsx` (Behavior section + `applySettingsEffects`),
  `FileViewer/FileViewer.tsx:88-93` (status), `Kanban/KanbanPanel.tsx` (toolbar status
  ≈ 352), `useKeyboardNav.ts` (capture-phase shortcuts), `ipc.ts` (`writeTextFile`).

**Implementation note (done 2026-06-24)**

All subtasks shipped:
- **Setting:** `autoSave: boolean` added to `Settings` + `DEFAULT_SETTINGS`
  (default **true**); a "Auto-save files" checkbox + mode-aware helper in the
  Settings → Behavior section, persisted via the existing draft/Save flow (merged
  over `DEFAULT_SETTINGS`, so old `sessions.json` upgrades cleanly).
- **`useAutoSaveFile` manual mode:** reads `settings.autoSave` (via a ref so the
  stable callbacks aren't re-created). Auto = unchanged. Manual: `setText` marks the
  buffer dirty but does **not** schedule a write; `onBlur` does **not** flush;
  `save()` flushes on demand; a mode-switch effect reconciles (auto→manual cancels
  the debounce + keeps the dirty buffer, manual→auto schedules a write if dirty).
  **Unmount / file-switch still flushes dirty content in both modes** (data-loss
  safety). New `AutoSaveFile` fields: `dirty`, `manual`, `save`. `dirty` is mirrored
  into state (for the button) alongside the ref the reload-reconcile reads.
- **Saver registry** (`src/saverRegistry.ts`, a non-React singleton): each mounted
  buffer registers `{isFocused, isDirty, save}`; `saveFocused()` saves the focused
  editor, or — if none is focused — every dirty buffer (so ⌘S never no-ops while
  edits are pending). Unit-tested (`saverRegistry.test.ts`).
- **⌘S** in `useKeyboardNav` (capture phase): in manual mode `preventDefault` +
  `saveFocused()`; in auto mode it leaves the keystroke alone. Works in main +
  detached windows (both can host editors).
- **Save-button UI:** both the FileViewer and Kanban toolbars render an accent
  **Save** button (disabled muted "Saved" when clean) in place of the
  "Saving…/Saved" hint when `manual`; auto mode keeps the hint. Shared `.saveBtn`
  styling (on-system tokens), toolbar layout intact.
- **Coverage:** the only non-hook `writeTextFile` caller is the #151 *create-board*
  one-shot file creation (not an editing save) — all editing saves route through the
  hook. ScheduledPanel saves a *record* (`update_schedule`), not a file — untouched.
- `npm run build`, `npm run lint`, `npm run format:check`, and `npm test` (209, +4)
  all pass. Subtask 8 manual walk-through is interactive; the hook's manual logic is
  structural + the registry selection is unit-tested.
