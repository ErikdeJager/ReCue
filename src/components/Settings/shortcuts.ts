// Keyboard-shortcut reference data for the Settings → Shortcuts pane. Since the
// keybind rework this lists only the **fixed, contextual** chords — the ones
// hardcoded in `useKeyboardNav.ts` / component-scoped handlers that are NOT
// rebindable. The rebindable actions render above this list as live, editable
// rows driven by the `src/keybinds.ts` registry (`KEYBIND_ACTIONS`) + the
// `settings.keybinds` overrides — never duplicated here, so the two can't drift.
//
// Cross-platform: each shortcut carries a `mac` and a `win` string; the pane feeds
// them through `kbdHint(platform, mac, win)` so macOS renders glyphs (⌘/⇧/⌥) and
// Windows/Linux render the "Ctrl+…" form. For a chord identical on both platforms
// (single letters / arrows) the two strings are the same.

export interface Shortcut {
  /** The macOS glyph form (e.g. "⌘S"). */
  mac: string;
  /** The Windows/Linux form (e.g. "Ctrl+S"). */
  win: string;
  /** What the shortcut does. */
  description: string;
}

export interface ShortcutGroup {
  /** The group heading (e.g. "Navigation"). */
  title: string;
  shortcuts: Shortcut[];
}

/** The grouped, cross-platform reference of **fixed** (non-rebindable) shortcuts
 * shown below the editable bindings in Settings → Shortcuts. */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      {
        mac: "⇧←/→",
        win: "Shift+←/→",
        description: "Select previous / next column (Overview)",
      },
      {
        mac: "⇧↑/↓",
        win: "Shift+↑/↓",
        description: "Select previous / next agent (Attention)",
      },
      {
        mac: "⇧ + arrows",
        win: "Shift + arrows",
        description: "Move the focused panel (Canvas)",
      },
    ],
  },
  {
    title: "Panels & Attention",
    shortcuts: [
      {
        mac: "⌘⌥1–⌘⌥6",
        win: "Ctrl+Alt+1–6",
        description:
          "Create panel by type (session/file/diff/terminal/kanban/tree)",
      },
      {
        mac: "⌘⏎",
        win: "Ctrl+Enter",
        description: "Dismiss the selected agent (Attention)",
      },
    ],
  },
  {
    title: "Files & Diff",
    shortcuts: [
      {
        mac: "⌘S",
        win: "Ctrl+S",
        description: "Save the focused file (manual-save mode only)",
      },
      {
        mac: "←/→",
        win: "←/→",
        description: "Previous / next file in the diff viewer (Focused mode)",
      },
      {
        mac: "↑/↓",
        win: "↑/↓",
        description: "Previous / next file in the diff viewer (Accordion mode)",
      },
      {
        mac: "S",
        win: "S",
        description: "Toggle “Seen” on the current diff file",
      },
    ],
  },
];
