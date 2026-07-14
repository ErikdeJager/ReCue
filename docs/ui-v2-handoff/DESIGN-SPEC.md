# ReCue v2 — Design Specification

The reference implementation is `ReCue-v2-demo.html`. Where prose and demo disagree, the demo wins.

---

## 1. Design principles

1. **Terminal-native identity.** JetBrains Mono is the only typeface — chrome, labels,
   buttons, everything. The whole app reads like a beautifully organized terminal.
2. **Blocky geometry.** Panels and everything inside them have **square corners (0px)**.
   Small radii (5–7px) survive only on sidebar chrome controls; dots/pills stay round.
   Corner language must never mix within one surface.
3. **Calm layered dark.** Catppuccin Mocha. Crust (`#11111b`) is the content stage,
   mantle (`#181825`) is chrome, base (`#1e1e2e`) is panels. Hairline borders, no glass,
   shadows only under floating chrome (menus, modals, toasts).
4. **The wave is the signature.** A live flow-field animation (gold-on-dark strands) owns
   every empty pixel of the content stage — but **never sits under text you read**.
   Panels are opaque; the wave lives in the gaps and empty states.
5. **Terminals are the point.** Agent terminals get maximum space: full panel width,
   flush to panel edges, bottom-anchored at the prompt, dense type.
6. **Buttons read as buttons.** Interactive controls are bounded blocks (visible fill or
   border), compact (22–28px tall), never oversized.

## 2. Foundations

### 2.1 Palette (Catppuccin Mocha)

Surfaces
- `#11111b` crust — content stage (Overview/Canvas background), terminal + inset bodies
- `#181825` mantle — sidebar, rail, canvas tab strip zone (transparent over stage wave)
- `#1e1e2e` base — panels, cards, menus, modals, buttons-on-mantle
- `#313244` surface0 — selection fill, active segment thumbs, hover fills, count chips
- `#45475a` surface1 — idle dots, grips, stronger hover

Text
- `#cdd6f4` primary · `#a6adc8` secondary · `#6c7086` muted · `#45475a` faint

Borders
- Hairline `rgba(205,214,244,.08)` (panels `.08–.12`, strong `.14–.16`)

Status (never used for brand, brand never used for status)
- Running `#89b4fa` (blue, pulses) · Awaiting `#f9e2af` (yellow, steady)
- Done `#a6e3a1` · Error `#f38ba8` · Idle `#45475a`
- Diff: `+ #a6e3a1` on `rgba(166,227,161,.1)`, `− #f38ba8` on `rgba(243,139,168,.1)`,
  hunk header `#89b4fa` on `rgba(137,180,250,.07)`

Repo identity colors: each repo has a color (demo: ReCue peach `#fab387`, cc-lib blue
`#89b4fa`, notes green `#a6e3a1`) used for its folder icon and card top-bands.

### 2.2 Accent system (critical UX)

- The accent is **user-selectable** in Settings → Appearance (10 Catppuccin swatches).
  Default: Peach `#fab387`.
- Implement as one CSS variable (`--accent`). Every accent-tinted element derives from it:
  filled primary buttons (accent bg, `#11111b` text), tinted buttons/borders via
  color-mix (10% fill / 35% border / 18% hover), usage-bar fill, selected-card ring,
  update icon, blockquote tint, active swatch ring, slider fill+thumb.
- **Changing the accent recolors the UI and every wave instantly, live** — no reload.
  This is a demo-proven wow moment; preserve it.

### 2.3 Typography (JetBrains Mono only)

- 12px default UI · 11.5px sidebar rows/menu items · 11px buttons, file rows, body text
- 12–12.5px panel/card titles, weight 600 · metas 10px muted
- Terminals: **10.5px / 1.55** (cramped on purpose) · diffs 10.5px / 1.65
- Micro-labels (kbd hints, badges, chips): 9–9.5px
- Weights: 400 default, 600 titles/actives/primaries, 700 wordmark only.
- Keyboard hints render inline right-aligned in their control, 9–9.5px, dimmed
  (opacity ~.55 on filled, `#6c7086` on ghost).

### 2.4 Geometry & spacing

- Radii: **0 panels & everything inside them** · 5–7px sidebar chrome controls ·
  999px dots, count chips, demo chip.
- Sidebar width 248px (expanded) / 44px (rail). Panel gap on stage: **8px** (0 in dense).
  Stage padding: 12px Overview, 10px Canvas panes (0 in dense).
- Row heights (sidebar): repo header 24 · branch label 17 · agent row 26 · file row 22 ·
  worktree label 20. Buttons: primary/secondary 26 · icon buttons 22–28.
- Panel headers: **fixed heights, always** — 36px Overview cards, 30px Canvas panels.
  Metas ellipsize; headers never wrap or grow.

### 2.5 Elevation & motion

- Flat surfaces separated by hairlines. Shadows ONLY on floating chrome:
  menus `0 12px 44px rgba(0,0,0,.55)`, modals `0 24px 80px rgba(0,0,0,.6)`,
  toasts `0 12px 40px rgba(0,0,0,.5)`.
- Motion: fast and functional. Menus/modals: 130–160ms scale-in (.97→1) + scrim fade.
  Toast: 180ms rise. Running dots: 1.6s opacity pulse (1→.4). Terminal cursor: 1.1s
  step blink. Hover states: instant.
- **Reduce motion** (setting + OS preference): freeze waves on a settled frame, disable
  pulse/blink/entrances. Never remove the elements themselves.

## 3. The wave background

Mental model: thousands of seeded strands drift through a flow field leaving fading
trails; trails accumulate into slow glowing waves. Engine: `assets/WaveEngine.js`
(vendored). All strands derive from ONE hue = the user's accent; background is flat crust.

Placement & tuned configs (density auto-scales with canvas area):

| Surface | density | speed | primaryWaves | trailLength | Notes |
|---|---|---|---|---|---|
| Overview stage (behind/between cards) | 420 | 0.85 | 0.04 | 3.4 | Visible in 8px gaps + around cards |
| Canvas view (ONE canvas behind tab strip AND panes) | 420 | 0.8 | 0.035 | 3.4 | The tab strip is transparent chrome over the same animation — never a separate strip animation |
| Empty states (first launch, empty repo) | 950 | 1.05 | 0.07 | 3.4 | The wave becomes the hero; transition by live-updating config, not remount |

Rules
- **Random seed every launch** — a fresh pattern each time the app opens.
- Recolors live from `--accent` (`primaryColor`), background = crust.
- Dense mode fully covers it on that surface — expected, fine.
- Sits behind ALL content; nothing readable is ever placed directly on it except
  empty-state copy (which gets a text shadow) and the transparent tab strip.
- Pause when window hidden; freeze under reduced motion; ~45–60fps cap.

## 4. App frame

No titlebar row of our own: the window's traffic lights / OS controls float over the
top-left of the sidebar zone (macOS) or the OS frame (Win/Linux). **Nothing may be
docked into that zone.** Root = sidebar (mantle) + main stage (crust), full-bleed.

## 5. Sidebar — expanded (248px, mantle)

Top cluster (10px padding, 4px gaps)
1. **New session** — 26px full-width block. Accent-tinted: 10% fill, 35% border,
   accent text, 600. `+` icon 12px left, `⌘N` hint right. Hover: 18% fill.
2. **Schedule session** row — same 26px format, neutral (base fill, hairline border,
   secondary text), clock icon, `⌘⇧N` hint. Beside it a 26×26 `…` block button →
   scheduling menu (Schedule session…, New recurring session…, Manage schedules…).
   New session and Schedule session are deliberately the SAME format.
3. **View switch** — segmented control, crust well (2px pad, radius 7), two equal
   options 20px tall: Overview / Canvas. Active: surface0 thumb, primary 600 text.

Repo tree (scrollable)
- **Repo header** 24px: folder icon in repo color, name 600 (muted if empty), count
  chip (crust pill, 9px), hover-revealed `+` (new session here). Click = filter wall
  to this repo (click again = show all). Right-click = repo context menu.
- **Branch label** 17px muted, 10px: branch icon + name. The branch/worktree is the
  container: **everything below it belongs to that checkout.**
- Children indent 12px under the branch label:
  - **Agent rows** 26px: status dot 7px (+2.5px tinted ring; running pulses) · title
    (ellipsis) · diff counts `+n`/`−n` 9.5px green/red · hover-revealed ✕ (kill+forget).
    Selected: surface0 fill (radius 6). Click selects (syncs card ring); right-click
    context menu; selection also visible on the Overview wall.
  - **Item rows** 22px, muted-secondary: file (CLAUDE.md), kanban (KANBAN.md),
    diff, scheduled (clock icon + right-aligned time), recurring (refresh icon +
    `recurring` badge), terminal. Click opens the matching Canvas panel. Hover ✕.
- **Worktree group** after the main-branch items: 20px label (branch icon, name,
  `worktree` badge, `+`), its children indent 24px.
- Empty repo (notes): dimmed name, accent `+` always visible.

Footer
- **Update pill** 28px hairline block: accent download icon, "Update available",
  version right-muted → opens Settings → Updates.
- **Usage meter**: 10px meta row ("Resets in 2h 14m" / "63%") over a 4px crust track
  with accent fill. Hide both update + usage on fresh install.
- Icon row: settings gear · bug report · (right) collapse.

**First-launch sidebar**: tree area is replaced by a centered empty block — folder-open
icon, "No folders yet", two-line explainer ("Sessions group by the folder they run in"),
and two neutral block buttons: **Open a folder…** and **Clone a repo…**.

## 6. Sidebar — collapsed rail (44px, mantle)

Toggled by the footer collapse button; expand button lives at the rail bottom.
Top→bottom, all 28px-wide controls, centered:
1. `+` New session (accent-tinted block)
2. divider
3. Overview / Canvas icon buttons (grid / panels icons; active = surface0 fill)
4. divider
5. **Per-repo stacks: folder icon (repo color) with the repo's agents underneath as
   7px activity dots** — blue pulse running, yellow awaiting, gray idle. Tooltip =
   session name + state. Clicking a dot selects that agent and jumps to Overview.
   Folder click = filter. (Hidden on fresh install.)
6. flexible space · settings gear · expand.

## 7. Overview — the agent wall (crust stage + wave)

- Full-bleed crust; wave behind everything; 12px padding; **cards share the full
  remaining width AND height equally** (flex row, 8px gaps). No fixed card widths.
- **Filter bar appears ONLY when filtered**: "Showing **repo** · Show all" (11px). No
  chrome otherwise — the default wall is uncluttered.
- **Agent card anatomy** (base bg, hairline border, square):
  1. **2px repo-color band** across the full top — solid, never faded (folder identity).
  2. **36px header**: grip (drag-reorder affordance) · status dot · title 600 12px w/
     optional `fork` badge · meta "repo · branch" 10px muted (ellipsis) · four 24px
     ghost icon actions: open-a-view (menu), more (fork/copy-resume/watch), big mode
     (⌘E), remove ✕ (red hover).
  3. **Terminal, flush** — full width/height of the remaining card, crust bg, ONLY a
     hairline top border, no side/bottom padding on the panel (the pre keeps its own
     8–10px text inset). Content is bottom-anchored at the prompt like a real terminal.
     ANSI palette from tokens; blinking block cursor.
- **Diff card**: same band/header; body = summary row ("3 files changed +72 −9",
  hairline-underlined) + diff lines, flush like terminals.
- Selection: 1px accent ring drawn on the card edge (inset ring, square) — synced
  both ways with the sidebar row selection.
- Card click selects. All destructive/major actions confirm via toast in the demo.
- **Empty repo state** (filter on a repo with no sessions): centered on the wave —
  "No sessions in **repo** yet", an accent New session button, and the line
  "the wave keeps you company until then".
- **First-launch hero**: wave boosted (950/1.05/.07) + centered wordmark "ReCue"
  (20px/700, subtle text shadow) + ONE compact accent button "New session ⌘N".
  Nothing else. No taglines, no tutorials.

## 8. Canvas — split-panel workspace (crust + shared wave)

One wave canvas spans the ENTIRE view (strip + panes); the tab strip is transparent
chrome on top of it.

Tab strip (6px 10px padding)
- **Tab blocks 24px**: active = base fill + hairline border, primary 600 11px;
  inactive = ghost muted. Each tab: label · pop-out icon (own OS window) · ✕.
  Closing a tab with live panels asks via the Close dialog (Board demo).
- Aux 22px ghost buttons: `+` new tab (⌘T) · templates menu (template icon + chevron:
  new-from-template / new template / save canvas as template / manage) · distribute
  panels evenly.

Panels (base bg, hairline border, square, 30px headers: grip · repo dot/status ·
title 600 · meta 10px · header-scoped actions · ✕). Splits separated by 8px gaps
(wave peeks through; 0 in dense).

- **Workspace tab**: FileViewer (42%) | right column: agent Terminal (55%) over
  DiffInspector (45%).
  - FileViewer: toolbar row "Saved" + segmented **Rendered | Raw** (crust well, 22px
    segments, active surface0). Rendered = styled markdown (17px h1, 13px h2, 11px
    body/1.7, inline code chips, accent-left-bordered blockquote). Raw = flush mono
    pre with light syntax tinting.
  - Terminal panel: identical rules to card terminals (flush, bottom-anchored).
  - DiffInspector: header meta "2 files +128 −24" + segmented **Focused | Accordion**;
    focused mode = pager row (‹ › arrows + centered file pill: yellow `M` chip,
    filename, `1/2`, chevron) then that file's hunks. Arrows cycle files.
- **Board tab**: full-panel Kanban. Toolbar: "Saved" + segmented **Board | Raw**.
  Columns 250px (crust, hairline): 8px color-dot + name 600 11px + count; cards
  (base, hairline, 8px pad): 12px checkbox + 11px title + 9.5px muted meta
  ("PR: #118 · Dependencies: 357"); done cards: checked green box, strikethrough,
  60% opacity. Ghost "+ Add card" per column; dashed "+ Add column" block.
  Raw = the markdown source in a flush textarea.
- **Ops tab**: git-tinted FileTree (45%) | ScheduledPanel (55%).
  - FileTree: search field ("Search files & contents…") + refresh; 24px rows with
    chevrons/folder/file icons; git states color the row: M yellow, A green,
    D red + strikethrough, ignored faint.
  - ScheduledPanel: context line (branch icon, "ReCue · will check out main",
    `worktree` badge); Launch time field + hint line ("Type a time or duration — e.g.
    1h, 30m, 15:00, 6pm, tomorrow 9am") + accent resolve line ("Starts today 6:00 PM ·
    in 2h 41m"); Name field; Prompt textarea; accent **▶ Start now** bottom-right.
- **Canvas empty state** (no tabs): centered on the wave — panels icon, "No panels
  yet", "Open a view from a session, or start with an empty tab", ghost "New tab ⌘T".

## 9. Dense mode (new in v2)

- Toggle: **⌘D** or Settings → Appearance → "Dense panels".
- Effect: every stage gap and pane padding collapses to 0 — Overview cards and Canvas
  splits tile edge-to-edge, background fully covered. Hairlines keep panels separated.
- Purpose: maximum terminal real estate on small screens / focus sessions.
- State persists like any setting; toast confirms toggle.

## 10. Floating chrome

All floating chrome: base bg, strong hairline, radius ~10, deep shadow, 130–160ms pop.

- **Menus** (popovers + right-click context menus): 28px items, 11.5px, icon 13px
  muted, hover surface0; 9.5px letterspaced section labels; hairline separators;
  danger items red text + red-tint hover. Agent menu: Rename / Fork conversation /
  Copy session ID / — / Remove. Repo menu: New session / VIEWS (File viewer…, Diff,
  Kanban board…) / — / Checkout branch…, Reveal in Finder / — / Kill all agents,
  Forget folder (danger). Click-away or Esc closes.
- **New session** — anchored popover near the New session button (NOT a centered
  modal), 300px, two dots progress. Step 1 Folder: search field, recent folders
  (name + dimmed path, top pre-selected), "Choose another…", Cancel esc / Continue ⏎.
  Step 2 Branch: back row ("‹ ReCue · change folder"), branch search, branch list
  (current marked), "+ add branch", **Worktree ⌘⏎** / **Start ⏎**.
- **Settings modal** — 740×540 centered on scrim `rgba(17,17,27,.8)`. Left mantle nav
  190px (9 sections, 30px items, active surface0). Content 18–20px padding. Footer:
  Reset to defaults (left) · Cancel / accent Save (right).
  Sections: Terminal (font-size + line-height sliders — accent fill-to-thumb on crust
  track, value readouts; cursor-blink check) · Appearance (theme segment Dark/Light —
  light toasts "lands after dark is nailed"; 10 accent swatches — live recolor;
  Reduce motion; Dense panels) · Rendering (DMA-BUF Auto/On/Off + help text; terminal
  renderer Auto/WebGL/DOM) · Behavior (default view; confirm destructive; close-tab
  policy Ask/Always/Never) · Sessions (auto-name; agent Claude/Codex/OpenCode +
  untested note; auto-continue) · Kanban (column color rules) · Updates (version,
  accent Update button, What's-new box) · Shortcuts (⌘N, ⌘⇧N, ⌘T, ⌘E, ⌘D) ·
  Data & About (open data folder, clear recents, versions).
  Checkboxes: 15px squares, accent-filled + crust check when on.
- **Onboarding** — centered 470px: "Choose your coding agent", three stacked choice
  cards (crust, hairline; Claude Code first with accent border + `Recommended` chip;
  others `Untested`), each with a one-line support description; "Decide later" ghost.
- **Close-tab dialog** — 440px: yellow alert icon + "Close "Board"?", body explains
  Kill vs Keep, buttons: Cancel esc · **Kill & close K** (red-tinted) · **Keep &
  close ↵** (accent).
- **Toasts** — bottom-center pill block, accent check icon + 11.5px message,
  ~2.2s auto-dismiss, 180ms rise.

## 11. Interaction rules & keyboard

- Selection is ONE model: sidebar row ↔ wall card, always in sync.
- Repo filter: repo header (or rail folder) click toggles; "Show all" resets;
  filtering to an empty repo shows the empty-repo wave state.
- Item rows / "open a view" actions land in Canvas on the right panel type.
- Hover reveals row-level actions (✕, +); they must not shift layout (reserve space).
- Every interactive element has a hover state (fill or text-brighten) and a tooltip
  (`title`) where its icon isn't self-evident.
- Keyboard: **⌘N** new session · **⌘⇧N** schedule · **⌘T** new canvas tab ·
  **⌘E** big mode · **⌘D** dense · **Esc** closes topmost floating chrome.
- Status semantics: pulse = actively working; steady yellow = waiting on the user
  (needs attention); gray = idle. The accent NEVER encodes status.

## 12. v1 → v2 parity checklist

Everything here exists in v1 and MUST exist in v2 (all present in the demo):
sidebar repo groups w/ colors + counts · branch lines · worktree sub-groups · agent
rows w/ busy states + diff counts + remove · file/kanban/diff/terminal/scheduled/
recurring rows · New session (⌘N) + Schedule (⌘⇧N) + `…` menu · Overview⇄Canvas
switch · update indicator · five-hour usage bar · settings/bug/collapse footer ·
agent wall w/ terminal + diff cards, drag handles, card actions (open-view/more/big
mode/remove), fork chips · filter by repo + Show all · Canvas tabs (rename/pop-out/
close/add/templates/distribute) · FileViewer rendered⇄raw · agent Terminal ·
DiffInspector focused⇄accordion + file pager · Kanban board⇄raw + columns/cards ·
FileTree w/ git states + search · ScheduledPanel editor + Start now · Settings ×9
sections with all controls · New-session 2-step flow (folder→branch, worktree
option) · Onboarding agent picker · Canvas-close Kill/Keep/Cancel · context menus
(agent, repo) · toasts · light theme (deferred to a later milestone, ships after
dark) · accent picker.

New in v2 (additive): wave background system · dense mode (⌘D) · collapsed rail with
per-agent activity dots · first-launch + empty-repo + empty-canvas states · unified
26px action-button cluster · branch-scoped item nesting.

## 13. Open items (design intent for later milestones)

- Card drag-reorder on the wall (grip is the handle) and panel drag/resize in Canvas
  splits — affordances exist; interactions to be implemented in the real app.
- Big mode (⌘E): the selected agent's terminal takes the full stage.
- Light theme (Catppuccin Latte): tokens exist in v1; port after dark ships.
- Wave settings (optional): a "Background" section could expose intensity/off; keep
  defaults tuned as specified above.
