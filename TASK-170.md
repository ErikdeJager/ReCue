# TASK-170

### 1. [x] Stop macOS auto-capitalizing (and auto-correcting) every text input

**Status:** Done · _(Not started | In progress | Done)_
**Depends on:** none
**Created:** 2026-06-25

**Description**

**The annoyance.** On macOS, text fields in ClaudeCue auto-capitalize the first letter
of what you type (e.g. the **new-branch name** input turns `fix-foo` into `Fix-foo`).
This is macOS's system text substitution ("Capitalize words automatically") leaking into
the app's WKWebView (the webview Tauri uses on macOS). For a developer tool — git branch
names, file paths, session/template names, search filters, and prompts to `claude` that
often begin with `/` — capitalizing the first letter is almost never wanted; the field
should **keep whatever letter was typed**.

**The fix.** Disable the macOS capitalization/correction on text-entry fields by setting
the HTML attributes **`autoCapitalize="none"`** and **`autoCorrect="off"`** on them. Per
the user's decisions (see Notes), apply this to **all** `<input type="text">` and
`<textarea>` fields **app-wide** (not just identifier fields). On macOS WKWebView the
**reliable** lever for the first-letter capitalization is `autoCorrect="off"` *together
with* `autoCapitalize="none"` — capitalization rides on the auto-correct/substitution
layer — so both attributes are set. **Spell-check is intentionally left untouched**: red
squiggle underlines (`spellcheck`) don't change typed text, so existing `spellCheck`
settings stay as they are and no new `spellCheck` is added.

This is a **frontend-only** change — adding two attributes to each text field (and to the
shared `SkillAutocomplete` textarea, which both prompt fields reuse). No backend, no store,
no behavior change beyond what the OS does to typed characters.

**Why a shared constant.** To keep it consistent and greppable across ~20 fields in ~10
files (and to make future fields easy to opt in), define one shared props object and spread
it into every targeted field, rather than hand-typing the two attributes each time.

**Field inventory (verified 2026-06-25).** Apply the attributes to every field below.
The line numbers are approximate anchors — **grep for `<input` / `<textarea>` in each file**
to find the current element; they may have shifted (and #167/#168/#169 may have landed
first — re-grep the whole `src/` tree, see Subtask 4).

_Text fields to update (apply `autoCapitalize="none"` + `autoCorrect="off"`):_

- `src/components/Sidebar/Sidebar.tsx` (~311) — **session rename** input.
- `src/components/FileViewer/FileViewer.tsx` (~155) — editable **file content** textarea
  (already has `spellCheck={false}` — keep it; just add the two attrs).
- `src/components/Canvas/CanvasTabs.tsx` (~75) — **canvas tab rename** input.
- `src/components/ScheduledPanel/ScheduledPanel.tsx` (~137) — scheduled session **custom
  name** input. _(The prompt field here is a `SkillAutocomplete` — handled once in
  `SkillAutocomplete.tsx` below.)_
- `src/components/SkillAutocomplete/SkillAutocomplete.tsx` (~133) — the **prompt textarea**.
  This single component backs **both** prompt inputs (ScheduledPanel ~152 and
  NewSessionModal ~1020), so editing it once covers both.
- `src/components/NewSessionModal/NewSessionModal.tsx`:
  - (~710) **search recent folders** input,
  - (~806) **filter branches** input,
  - (~875) **new branch name** input _(the field the user explicitly called out)_,
  - (~1031) scheduled session **custom name** input.
- `src/components/Kanban/KanbanPanel.tsx`:
  - (~152) **card title** input,
  - (~213) **card body** markdown textarea,
  - (~302) **column name** input,
  - (~655) **raw board markdown** textarea (already `spellCheck={false}` — keep it).
- `src/components/TemplateManager/TemplateManager.tsx` (~98) — **template rename** input.
- `src/components/FilePicker/FilePicker.tsx` (~115) — **search / create board** input.
- `src/components/TemplateEditor/TemplateEditor.tsx`:
  - (~137) block **agent name** input,
  - (~157) block **initial prompt** textarea,
  - (~172) block **file path** input,
  - (~332) **template name** input.

_Non-text inputs — DO NOT touch (auto-capitalize doesn't apply):_

- `Sidebar.tsx` (~1356) `<input type="color">`, `ScheduledPanel.tsx` (~123) &
  `NewSessionModal.tsx` (~1010) `<input type="datetime-local">`, `Checkbox.tsx` (~37)
  `<input type="checkbox">`, `Slider.tsx` (~60) `<input type="range">`.

**Scope (in scope):**

- A shared constant (e.g. `export const noAutoCapitalize = { autoCapitalize: "none",
  autoCorrect: "off" } as const;`) spread into every text `<input>`/`<textarea>` listed
  above.
- Editing `SkillAutocomplete.tsx` once to cover both prompt sites.
- Re-grepping `src/` at implementation time to catch any text field added since this plan
  (Subtask 4) and applying the same treatment.

**Out of scope (explicit):**

- **No** changes to non-text inputs (checkbox / range / color / datetime-local).
- **No** changes to `spellCheck` anywhere — keep existing `spellCheck={false}` on the two
  fields that have it; do **not** add or remove `spellCheck` elsewhere (underlines don't
  alter typed text, and the user asked only to preserve typed casing).
- **No** backend, store, IPC, or styling changes; **no** new component or behavior.
- **No** ESLint rule / CI guard to enforce the attribute on *future* inputs (the shared
  constant + this sweep is the whole task; a lint rule could be a later task if wanted).
- **No** change to the underlying WKWebView text-checking configuration (we use per-field
  HTML attributes, not a native-side toggle).

**Subtasks**

1. [ ] **Add the shared props constant.** Create a tiny module — recommended
   `src/inputProps.ts` — exporting
   `export const noAutoCapitalize = { autoCapitalize: "none", autoCorrect: "off" } as const;`
   (`autoCapitalize` and `autoCorrect` are both valid React DOM attributes; `autoCorrect`
   is the WebKit attribute typed as `string` in React's typings). _(Inline attributes on
   each field are an acceptable alternative, but the shared constant is preferred for
   consistency.)_
2. [ ] **Apply to every text field** in the inventory above: spread `{...noAutoCapitalize}`
   onto each `<input type="text">` / un-typed text `<input>` / `<textarea>` (importing the
   constant per file). For `FileViewer.tsx` and `KanbanPanel.tsx`'s raw textarea, **keep**
   the existing `spellCheck={false}` and just add the spread.
3. [ ] **Cover the shared prompt input once** by editing `SkillAutocomplete.tsx`'s
   `<textarea>` (~133), which both `ScheduledPanel` and `NewSessionModal` reuse.
4. [ ] **Safeguard re-grep.** Run `grep -rn "<input\|<textarea" src/ --include="*.tsx"`
   and confirm **every** text `<input>`/`<textarea>` either carries the spread or is a
   deliberately-excluded non-text input (checkbox/range/color/datetime-local). Apply the
   spread to any text field not already covered (e.g. one introduced by #167/#168/#169 if
   those landed first).
5. [ ] **Build & verify.** Run the full check suite (see Acceptance criteria). Then in
   `npm run tauri dev` on macOS, type into the **new-branch name** field and confirm the
   first letter is **no longer auto-capitalized**, and spot-check a few others (session
   rename, branch filter, a Kanban card title, a template name, the schedule prompt) keep
   exactly the casing typed.

**Acceptance criteria**

- [ ] Typing a lowercase first letter into the **new-branch name** input (and the other
  listed text fields) **keeps it lowercase** — macOS no longer capitalizes the first
  letter. Verified in a real `npm run tauri dev` macOS run.
- [ ] Every `<input type="text">` / text `<input>` / `<textarea>` under `src/` has
  `autoCapitalize="none"` **and** `autoCorrect="off"` (via the shared constant or inline);
  a `grep` for `<input`/`<textarea>` shows no uncovered text field.
- [ ] Non-text inputs (checkbox, range, color, datetime-local) are **unchanged**.
- [ ] `spellCheck` is unchanged everywhere — the two existing `spellCheck={false}` fields
  keep it; no other field gains or loses spell-check.
- [ ] No backend / store / IPC / CSS changes; the diff is purely the new constant module
  plus the added attributes/imports.
- [ ] All green: `npm run build`, `npm run lint`, `npm test`, `npm run format:check`
  (and `cargo` checks are unaffected — no Rust change).

**Notes**

- **User decisions (refine Q&A, 2026-06-25):**
  1. **Scope → ALL text fields app-wide** (every text `<input>`/`<textarea>`), not just
     identifier/search fields. Rationale (user-endorsed): a developer tool where
     capitalization is rarely wanted — `claude` prompts often start with `/`, Kanban card
     bodies are markdown, file content is code — so "keep whatever was typed" is the safe
     default everywhere.
  2. **Behaviors → `autoCapitalize="none"` + `autoCorrect="off"`** on the targeted fields.
     The user accepted that turning off auto-correct is what actually stops the macOS
     first-letter capitalization (it rides the substitution layer) and also keeps
     auto-correct from mangling identifiers. **Spell-check is left untouched.**
- **macOS mechanism caveat:** the capitalization is a WKWebView/macOS text-substitution
  behavior, so it can only be confirmed in a real macOS app run (`npm run tauri dev`), not
  in unit tests. `autoCapitalize` alone is historically iOS-oriented; pairing it with
  `autoCorrect="off"` is the dependable combination on macOS WebKit.
- **Field inventory** was produced by an exhaustive sweep of all `<input>`/`<textarea>`
  under `src/components/` (2026-06-25): 13 identifier/technical fields, 3 search/filter,
  6 free-prose (incl. the shared `SkillAutocomplete` textarea, which covers two prompt
  sites), and 5 non-text inputs (excluded). Line numbers are anchors — grep to locate the
  live element.
- **Why `Depends on: none`:** this edits **existing** text fields; nothing it needs is
  produced by another open task. #167 (file tree viewer) adds **no** text input — its
  "filtered flat list" is the `list_files` result, not a search box (rename/create are
  out of scope there). #168 (collapsible sidebar rail) adds only icon buttons, no text
  input. #169 (auto-name refresh) is backend-only. The Subtask-4 re-grep covers the
  unlikely case any of them lands a new field before this task runs.

- **Implementation notes (2026-06-25):** Frontend-only. Added `src/inputProps.ts`
  exporting `noAutoCapitalize = { autoCapitalize: "none", autoCorrect: "off" } as const`
  and spread it into all 19 text `<input>`/`<textarea>` fields across the 10 files in the
  inventory (Sidebar rename; FileViewer editor; CanvasTabs rename; ScheduledPanel name;
  SkillAutocomplete textarea — covering both prompt sites; NewSessionModal search/branch
  filter/new-branch/sched-name; KanbanPanel card-title/card-body/column-name/raw; Template
  Manager rename; FilePicker search; TemplateEditor agent-name/prompt/file-path/template-name).
  `#167`/`#168`/`#169` had landed first and added **no** new text fields (confirmed by the
  Subtask-4 re-grep). `spellCheck={false}` preserved on FileViewer + Kanban raw; non-text
  inputs (color/checkbox/range/datetime-local) untouched. All green: npm build / lint /
  test (221) / format:check; no Rust change. The macOS WKWebView first-letter behavior is
  a native text-substitution effect, so the live "lowercase stays lowercase" confirmation
  (Subtask 5 / first acceptance bullet) was **not** runtime-verified in a `tauri dev` macOS
  session in this autonomous loop — the attributes are the documented, dependable lever.
