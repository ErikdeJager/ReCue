// The panel types the ⌘K Create-panel launcher (#189) can spawn, in digit order
// (1–6) — the in-modal number keys and the global ⌘⌥1–6 both index this list. It
// reuses the same addable set the `ViewsMenu` (#82/#164) + block registry
// (`templateBlocks.ts`) expose (agent + the five non-agent views), so the launcher
// stays in sync with the addable types. Kept tiny + icon-carrying so the modal, the
// digit map, and the keyboard handler read one source of truth.

import {
  Bot,
  FileDiff,
  FileText,
  FolderTree,
  type LucideIcon,
  SquareKanban,
  TerminalSquare,
} from "lucide-react";

/** A launchable panel type. `session` spawns an agent; the rest are Overview views. */
export type PanelTypeKey =
  | "session"
  | "file"
  | "diff"
  | "terminal"
  | "kanban"
  | "filetree";

export interface PanelType {
  key: PanelTypeKey;
  /** Menu label, e.g. "File viewer". */
  label: string;
  icon: LucideIcon;
}

/** Digit order 1–6: Session · File · Diff · Terminal · Kanban · File tree (#189). */
export const PANEL_TYPES: PanelType[] = [
  { key: "session", label: "Session", icon: Bot },
  { key: "file", label: "File viewer", icon: FileText },
  { key: "diff", label: "Diff viewer", icon: FileDiff },
  { key: "terminal", label: "Terminal", icon: TerminalSquare },
  { key: "kanban", label: "Kanban board", icon: SquareKanban },
  { key: "filetree", label: "File tree", icon: FolderTree },
];

/** The panel type for a 1-based digit (⌘⌥N / in-modal N), or undefined out of range. */
export function panelTypeForDigit(digit: number): PanelTypeKey | undefined {
  return PANEL_TYPES[digit - 1]?.key;
}

/**
 * The launcher's type-step filter (#189, task 391): a case-insensitive **substring**
 * match over the type labels, preserving `PANEL_TYPES`' order. An empty / whitespace
 * query returns the whole list. Pure — the filter-as-you-type source of truth.
 */
export function filterPanelTypes(query: string): PanelType[] {
  const q = query.trim().toLowerCase();
  return q
    ? PANEL_TYPES.filter((t) => t.label.toLowerCase().includes(q))
    : PANEL_TYPES;
}
