### 214. [ ] Make the collapsed sidebar rail much narrower

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-27

**Description**

When the sidebar is collapsed to its icon rail (#168), the rail is **56px** wide —
noticeably wider than the ~36px buttons it contains, leaving a lot of empty gutter on
each side. Make the collapsed rail **much narrower** — only slightly wider than its
icons/buttons.

Grounding (read before implementing):

- `SIDEBAR_RAIL_WIDTH = 56` (`src/components/Sidebar/Sidebar.tsx:49`), applied as the
  `<aside>` width when `sidebarCollapsed` (~line 1427).
- Rail buttons: `.railButton` and `.railFolder` are `width: 36px; height: 32px`
  (`src/components/Sidebar/Sidebar.module.css` ~775 and ~819); `.railWorktree` is
  `32×28` (~861); icons are 16–18px. `.footerButton` is similar.
- `.rail` has only **vertical** padding (`var(--space-12) 0 var(--space-8)`, ~764) and
  `.railRepos` `var(--space-6) 0` (~797) — so the horizontal slack is purely
  `(railWidth − buttonWidth)/2 = (56 − 36)/2 = 10px` per side.
- Centering: `.collapsed { align-items: center }` (~760); `.rail`, `.railRepos`,
  `.railRepo`, `.railWorktreeGroup`, `.railDots` all `align-items: center`. The
  active-filter box (`.railFolderActive`) and hover backgrounds are button-sized, so
  narrowing the rail won't clip them as long as the buttons fit.

Fix: reduce `SIDEBAR_RAIL_WIDTH` from 56 to **~44** (a 36px button + ~4px gutter each
side). Verify everything still centers and nothing clips: the New / Schedule /
view-switch buttons, repo folder icons, per-session activity dots (`BusyIndicator` in
its ~14px slot), worktree glyphs, the collapsed footer (gear / feedback / chevron,
stacked via `.footerCollapsed`), and the collapsed `UpdateIndicator` icon. Keep
`overflow: hidden` so nothing spills. Optionally tighten the buttons to 34/32px and
the rail to ~40px for an even snugger look — but 44px keeping 36px buttons is the
recommended minimal change.

**Scope / out of scope**

- In scope: the collapsed icon-rail width (and any small CSS tweaks needed so its
  contents stay centered/visible at the narrower width).
- Out of scope: the **expanded** sidebar width (#108, the separate `sidebar_width`
  value + drag handle); what the rail displays; the collapse/expand toggle behavior
  (chevron / ⌘B / background menu).

**Subtasks**

1. [ ] Change `SIDEBAR_RAIL_WIDTH` from `56` to `44` in
   `src/components/Sidebar/Sidebar.tsx`.
2. [ ] In `Sidebar.module.css`, verify the rail contents center within 44px with a
   small gutter; adjust button/folder/worktree widths only if needed so nothing
   clips. Confirm the collapsed footer and the collapsed `UpdateIndicator` icon fit.
3. [ ] Sanity-check the active-filter box (`.railFolderActive`), hover backgrounds,
   and the activity dots are not clipped at the narrower width.
4. [ ] Grep for any test/snapshot referencing the old `56` rail width and update it
   (the constant is local to `Sidebar.tsx`; likely none).
5. [ ] Docs: update `CLAUDE.md` only if it cites a rail width (it currently does not).

**Acceptance criteria**

- [ ] The collapsed sidebar rail is ~44px wide (down from 56) — only slightly wider
      than its 36px buttons.
- [ ] All rail elements (New / Schedule / view-switch buttons, repo folder icons,
      activity dots, worktree glyphs, footer gear / feedback / chevron, collapsed
      update icon) remain centered, fully visible, and clickable; right-click menus
      still open.
- [ ] The expanded sidebar width is unaffected.
- [ ] `npm run lint`, `npm run build`, and `npm test` pass.

**Notes**

- Decided autonomously (refine loop, user not answering — see `ASSUMPTIONS.md`).
- Target **44px** (36px button + 4px gutter each side) as "only slightly wider"; the
  final value is tunable by the implementer after a visual check. Buttons can drop to
  34/32px with a ~40px rail for an even tighter look.
- Pure constant + CSS change; no new state, no persistence change.
