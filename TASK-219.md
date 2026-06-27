### 219. [ ] Move the sidebar collapse button to the far right of the footer button row

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-28

**Description**

In the left panel (sidebar) **footer button row**, move the **collapse/expand** button
to the **far right**, while the other footer buttons (Settings, Feedback) stay on the
left. Today all three buttons are packed together at the left of the row; the collapse
button should sit at the far right edge (e.g. `justify-content: space-between`, or a
`margin-left: auto` on the collapse button).

**Grounding (current state):**

- The footer lives in `src/components/Sidebar/Sidebar.tsx:1762-1802`. It's a flex row
  (`styles.footer`) containing **three** `styles.footerButton`s in this DOM order:
  1. **Settings** gear (`onClick={() => setSettingsOpen(true)}`, `SettingsIcon`),
  2. **Feedback** (`onClick={() => void openUrl(FEEDBACK_FORM_URL)}`, `Bug` icon, #210),
  3. **Collapse/expand** sidebar (`onClick={() => toggleSidebarCollapsed()}`,
     `PanelLeftClose` / `PanelLeftOpen`, #168) — the one to move.
- The footer's CSS is `src/components/Sidebar/Sidebar.module.css`:
  - `.footer` (lines 105-112): `display:flex; align-items:center; gap:var(--space-2);
    height:36px; padding:0 var(--space-8);` — a horizontal row with all buttons
    bunched left, separated only by the gap.
  - `.footerButton` (lines 114-133): the shared 30×26 icon-button style for all three.
  - `.footerCollapsed` (lines 893-898): when the sidebar is **collapsed** to the icon
    rail, the footer switches to `flex-direction:column` (a vertical stack), applied
    via `${sidebarCollapsed ? styles.footerCollapsed : ""}` on the footer
    (`Sidebar.tsx:1763`).
- There is **no other button** in this footer row. The in-app **UpdateIndicator**
  (#190) and the **usage bar** (#154) render *above* the footer
  (`Sidebar.tsx:1750-1757`), not in it, so they are not affected.

**Goal:** in the **expanded** footer, Settings and Feedback remain grouped at the left
edge and the collapse button is pushed to the far right edge of the row.

**Out of scope:**

- The **collapsed icon rail** vertical stack (`.footerCollapsed`): "far right" is a
  horizontal concept that doesn't apply to a one-column rail, so the collapsed-rail
  layout stays exactly as-is (collapse button remains last in the vertical stack). Make
  sure the new horizontal-only styling does **not** disturb the collapsed column
  (e.g. a `margin-left:auto` must be reset/neutralized under `.footerCollapsed` so the
  collapse icon stays centered in the rail, not shoved to one side).
- No change to button order for Settings/Feedback, to icons, handlers, tooltips, or to
  `toggleSidebarCollapsed` behavior / the ⌘B (Ctrl+B) shortcut.
- No new buttons, no behavior changes — purely the horizontal position of the collapse
  button in the expanded footer.

**Cross-platform (hard requirement):** this is a pure CSS-layout change with no
OS-specific code; it must look correct on both macOS (WKWebView) and Windows
(WebView2/Chromium). Prefer a standard flex approach (`margin-left:auto` or a grouped
`justify-content:space-between`) that renders identically on both engines — no
macOS-only `-webkit-` tricks. The existing ⌘↔Ctrl tooltip already routes through
`kbdHint` and is untouched.

**Subtasks**

1. [ ] In `src/components/Sidebar/Sidebar.module.css`, push the collapse button to the
   far right of the **expanded** `.footer` row. Recommended: add a modifier class
   (e.g. `.footerCollapseToggle { margin-left: auto; }`) applied to the collapse
   button, OR group the left buttons and use `justify-content: space-between` on
   `.footer`. Whichever is chosen, the Settings + Feedback buttons must stay flush left
   and the collapse button flush right.
2. [ ] Neutralize the new rule under the collapsed rail: ensure `.footerCollapsed` (the
   `flex-direction:column` stack) is unaffected — e.g.
   `.footerCollapsed .footerCollapseToggle { margin-left: 0; }` — so the collapse icon
   stays centered/last in the vertical rail exactly as today.
3. [ ] In `src/components/Sidebar/Sidebar.tsx` (~line 1785-1801), apply the modifier
   class to the collapse `<button>` (e.g.
   `className={`${styles.footerButton} ${styles.footerCollapseToggle}`}`). Leave the
   Settings and Feedback buttons unchanged.
4. [ ] Verify: `npm run build`, `npm run lint`, `npm run format:check`.

**Acceptance criteria**

- [ ] In the **expanded** sidebar, the footer shows Settings and Feedback at the left
      edge and the collapse/expand button at the **far right** edge of the row.
- [ ] Clicking the collapse button still toggles the sidebar (and ⌘B / Ctrl+B still
      works); Settings still opens Settings; Feedback still opens the form.
- [ ] In the **collapsed** icon rail, the footer is unchanged — the three buttons stack
      vertically as before, the collapse icon centered in the rail (no horizontal
      shove).
- [ ] Renders correctly on both macOS and Windows (standard flex; no engine-specific
      hacks).
- [ ] `npm run build`, `npm run lint`, `npm run format:check` pass.

**Notes**

- No user questions were needed — the card is precise ("far right", "all other buttons
  stay on the left", "e.g. using justify-between"). The only edge case, the collapsed
  vertical rail, has an obvious answer (leave its stack unchanged); decided here and
  captured in Out of scope / Subtask 2.
- Implementation tip: with exactly three flex items, `justify-content: space-between`
  on `.footer` would spread *all three* apart (Settings far-left, Feedback centered,
  Collapse far-right), which is **not** desired. Prefer `margin-left:auto` on the
  collapse button (keeps Settings+Feedback grouped left), or wrap Settings+Feedback in
  a left group `<div>` and use `space-between` between that group and the lone collapse
  button.
- References: `Sidebar.tsx:1762-1802` (footer JSX), `Sidebar.module.css:105-133`
  (`.footer` / `.footerButton`), `Sidebar.module.css:893-898` (`.footerCollapsed`).
