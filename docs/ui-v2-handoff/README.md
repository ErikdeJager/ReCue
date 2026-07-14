# ReCue v2 — UI Redesign Handoff

This package specifies the **visual design and user experience** of the ReCue v2 update.
It is written for the implementing agent (Claude Code). Technical implementation choices
(component structure, state management, rendering strategy) are yours; **the visuals and
UX described here are the contract.**

Nothing functional from v1 is removed. v2 is the same product with a modernized,
terminal-native skin, a live animated backdrop, and a handful of additive UX features
(dense mode, collapsed rail, richer empty states).

## Package contents

| Path | What it is |
|---|---|
| `DESIGN-SPEC.md` | **The main document.** Complete visual + UX specification, surface by surface. |
| `ReCue-v2-demo.html` | Self-contained clickable demo of the entire redesign. Open in any browser. This is the reference implementation of the spec — when in doubt, match the demo. |
| `screenshots/` | Reference captures of every major state (named in reading order). |
| `assets/WaveEngine.js` | The wave-background simulation, **vendored verbatim from Monarch — do not edit or refactor it.** Tune only via its config object. |
| `assets/fx.js` | The demo's tiny wave host (canvas sizing, rAF loop, live recolor, reduced-motion). Reference for how the engine expects to be driven; rewrite as a proper React host in the real app (see the original `recue-animated-background-handoff` bundle, which contains `WaveBackground.tsx`, a ready React host). |

## How to review

1. Open `ReCue-v2-demo.html`. Click everything: view switch, repo filters, cards,
   canvas tabs, seg toggles, settings (all nine sections), new-session flow, context
   menus (right-click agent rows / repo headers), the sidebar collapse button, and the
   `demo: populated/empty` chip (bottom-right — demo helper only, not product UI).
2. Read `DESIGN-SPEC.md` top to bottom with the demo open beside it.
3. Compare against screenshots if a state is unclear.

## Hard constraints (do not violate)

- **The OS titlebar is immutable.** No app content, info, or controls in the traffic-light
  bar. The design must work identically on macOS, Windows, and Linux; the app's top edge
  is the sidebar/content itself.
- **No glass.** No translucent frosted surfaces, no backdrop blur. Every surface is opaque.
- **No functionality lost from v1.** A parity checklist is at the end of DESIGN-SPEC.md.
- **`WaveEngine.js` is vendored.** Same seed + size + config ⇒ same pattern. Change the
  look only through config.
