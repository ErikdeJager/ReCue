// Keyboard-shortcut reference data for the Settings → Shortcuts pane (#318). This
// is a **read-only** display list — it mirrors the handlers wired in
// `useKeyboardNav.ts` (global) and a few component-scoped handlers, but it does
// not bind or rebind anything.
//
// Cross-platform: each shortcut carries a `mac` and a `win` string; the pane feeds
// them through `kbdHint(platform, mac, win)` so macOS renders glyphs (⌘/⇧/⌥) and
// Windows renders the "Ctrl+…" form. For a chord identical on both platforms
// (single letters / arrows) the two strings are the same.

export interface Shortcut {
  /** The macOS glyph form (e.g. "⌘N"). */
  mac: string;
  /** The Windows form (e.g. "Ctrl+N"). */
  win: string;
  /** What the shortcut does. */
  description: string;
}

export interface ShortcutGroup {
  /** The group heading (e.g. "Sessions"). */
  title: string;
  shortcuts: Shortcut[];
}

/** The grouped, cross-platform shortcut reference shown in Settings → Shortcuts. */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Sessions",
    shortcuts: [
      { mac: "⌘N", win: "Ctrl+N", description: "New session" },
      { mac: "⌘⇧N", win: "Ctrl+Shift+N", description: "Schedule session" },
    ],
  },
  {
    title: "Panels & Canvas",
    shortcuts: [
      { mac: "⌘K", win: "Ctrl+K", description: "Open the panel launcher" },
      {
        mac: "⌘⌥1–⌘⌥6",
        win: "Ctrl+Alt+1–6",
        description:
          "Create panel by type (session/file/diff/terminal/kanban/tree)",
      },
      { mac: "⌘T", win: "Ctrl+T", description: "New Canvas tab" },
      {
        mac: "⌘E",
        win: "Ctrl+E",
        description: "Toggle big mode for the selected item",
      },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { mac: "⌘\\", win: "Ctrl+\\", description: "Toggle Overview ↔ Canvas" },
      {
        mac: "⌘1–⌘9",
        win: "Ctrl+1–9",
        description: "Jump to canvas N (Canvas view)",
      },
      {
        mac: "⌘B",
        win: "Ctrl+B",
        description: "Collapse / expand the sidebar",
      },
      {
        mac: "⇧←/→",
        win: "Shift+←/→",
        description: "Select previous / next column (Overview)",
      },
      {
        mac: "⇧ + arrows",
        win: "Shift + arrows",
        description: "Move the focused panel (Canvas)",
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
