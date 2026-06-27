### 210. [ ] Add a feedback button (bug icon) in the sidebar footer that opens the feedback Google Form

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-27

**Description**

Add a **feedback / bug-report button** to the sidebar footer, next to the Settings gear in
the bottom-left, that opens the bug-report / feature-request **Google Form** in the user's
default browser.

**Grounding facts:**

- The sidebar footer is in `src/components/Sidebar/Sidebar.tsx` (~lines 1653–1678): a
  `<div className={styles.footer …}>` holding the **Settings gear** button
  (`SettingsIcon`, `setSettingsOpen(true)`) and the **collapse/expand chevron**
  (`PanelLeftClose`/`PanelLeftOpen`). Both use `styles.footerButton`. When the sidebar is
  collapsed to the rail, `styles.footerCollapsed` stacks the buttons vertically.
- Opening an external URL is already supported: `src/ipc.ts` exports
  `openUrl(url)` → `invoke("open_url", { url })` (the dependency-free Rust `open_url`,
  http/https only, shells out to macOS `open`; used for ⌘-click links, #109). No new command
  needed.
- Icons are from **lucide-react**; the bug icon is `Bug`.

**The form URL** (provided by the user):
`https://docs.google.com/forms/d/e/1FAIpQLSf-EOSBcCTLUN-00UhBGj4XJ27ky7d2ZQp8YcOLwAVvTUkXGw/viewform?usp=publish-editor`

**Goal:** a third footer button (Lucide `Bug`), placed next to the Settings gear, that on
click calls `openUrl(FORM_URL)`; styled like the existing footer buttons; works in both the
expanded sidebar and the collapsed rail.

**Decisions (made autonomously — see Notes):**

- **Placement:** immediately **after the Settings gear** (footer order: Settings →
  Feedback → collapse chevron), so it's "next to Settings" in the bottom-left as asked.
- **Icon:** Lucide **`Bug`** (the card says "bug icon"), `size={16} strokeWidth={1.5}` to
  match the gear/chevron.
- **Action:** `openUrl(FORM_URL)` — opens in the default browser. No confirm gate (opening a
  URL is non-destructive); the form collects nothing until the user submits it.
- **URL used verbatim** as the user supplied it. (Note: `?usp=publish-editor` looks like a
  Google Forms *publish-editor preview* parameter rather than the public response link; if
  the button opens an editor/preview instead of the live form, swap to the public
  `…/viewform` share URL. Flagged, not changed — honoring the pasted URL.)
- **Main-window only** by construction (the sidebar only renders in the main window).

**Scope**

1. In `Sidebar.tsx`, import `Bug` from `lucide-react` and `openUrl` from `../../ipc` (check
   existing imports; `openUrl` may need adding). Add a module-level `const FEEDBACK_FORM_URL
   = "…"` constant.
2. Add a `<button type="button" className={styles.footerButton}>` between the Settings and
   collapse buttons, `onClick={() => void openUrl(FEEDBACK_FORM_URL)}`, with `title="Send
   feedback"` and an `aria-label`, rendering `<Bug size={16} strokeWidth={1.5} />`.
3. Confirm it lays out correctly in the collapsed rail (`footerCollapsed` already stacks
   children — the new button stacks too; no CSS change expected).

**Out of scope**

- No in-app feedback form/modal — it deliberately opens the external Google Form.
- No new Rust command (reuse `open_url`).
- No telemetry / no prefilling the form / no app-version query params.
- No settings entry or keyboard shortcut for feedback.

**Subtasks**

1. [ ] Add the `Bug` import, the `openUrl` import (if missing), and the
   `FEEDBACK_FORM_URL` constant in `Sidebar.tsx`.
2. [ ] Render the feedback footer button next to the Settings gear, wired to
   `openUrl(FEEDBACK_FORM_URL)`, with title + aria-label.
3. [ ] `npm run build`, `npm run lint`, `npm run format:check` pass.
4. [ ] Manually verify: the bug button appears next to Settings (expanded and collapsed),
   clicking it opens the form URL in the default browser, and the footer layout is intact.

**Acceptance criteria**

- [ ] A bug-icon button sits in the sidebar footer next to the Settings gear (bottom-left),
  in both expanded and collapsed states.
- [ ] Clicking it opens the feedback Google Form URL in the default browser via `openUrl`.
- [ ] It matches the existing footer-button styling (`footerButton`, 16px icon) and has an
  accessible `title`/`aria-label`.
- [ ] `npm run build`, `npm run lint`, and Prettier pass.

**Notes**

- **Autonomous refine (2026-06-27).** Per the `ASSUMPTIONS.md` standing directive
  (2026-06-26); decisions logged under TASK-210:
  - Placement after the Settings gear; Lucide `Bug` icon; `openUrl` (no new command); no
    confirm gate.
  - **URL caveat:** `?usp=publish-editor` may be an editor-preview link; used verbatim per
    the user, flagged for a swap to the public `…/viewform` URL if it opens the editor.
- Key files: `src/components/Sidebar/Sidebar.tsx` (footer ~1653–1678; existing
  `footerButton`s), `src/ipc.ts` (`openUrl` ~396), `src/components/Sidebar/
  Sidebar.module.css` (`.footer` / `.footerButton` / `.footerCollapsed`).
- Independent of any open task.
