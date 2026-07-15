// The panel types the ⌘K Create-panel launcher (#189) can spawn, in digit order
// (1–6) — the in-modal number keys and the global ⌘⌥1–6 both index this list. It
// reuses the same addable set the `ViewsMenu` (#82/#164) + block registry
// (`templateBlocks.ts`) expose (agent + the five non-agent views), and — since task
// 392 — derives its order from the **one canonical source** (`itemTypeOrder.ts`) they
// all share, so every menu agrees. Kept tiny + icon-carrying so the modal, the digit
// map, and the keyboard handler read one source of truth.

import {
  Bot,
  FileDiff,
  FileText,
  FolderTree,
  type LucideIcon,
  SquareKanban,
  TerminalSquare,
} from "lucide-react";

import { byItemTypeOrder, type ItemTypeKey } from "../../itemTypeOrder";

/** A launchable panel type. `session` spawns an agent; the rest are Overview views.
 * Aliases the shared `ItemTypeKey` (task 392); the `PanelTypeKey` name is retained
 * for existing consumers. */
export type PanelTypeKey = ItemTypeKey;

export interface PanelType {
  key: PanelTypeKey;
  /** Menu label, e.g. "File viewer". */
  label: string;
  icon: LucideIcon;
}

/** The six addable types (labels/icons unchanged). Declaration order is irrelevant —
 * `PANEL_TYPES` sorts them into the shared canonical order below. */
const PANEL_TYPE_ENTRIES: PanelType[] = [
  { key: "session", label: "Session", icon: Bot },
  { key: "file", label: "File viewer", icon: FileText },
  { key: "diff", label: "Diff viewer", icon: FileDiff },
  { key: "terminal", label: "Terminal", icon: TerminalSquare },
  { key: "kanban", label: "Kanban board", icon: SquareKanban },
  { key: "filetree", label: "File tree", icon: FolderTree },
];

/** Digit order 1–6: Session · Terminal · File tree · File viewer · Diff viewer ·
 * Kanban board — the one canonical order (task 392, `itemTypeOrder.ts`). */
export const PANEL_TYPES: PanelType[] = byItemTypeOrder(
  PANEL_TYPE_ENTRIES,
  (t) => t.key,
);

/** The panel type for a 1-based digit (⌘⌥N / in-modal N), or undefined out of range. */
export function panelTypeForDigit(digit: number): PanelTypeKey | undefined {
  return PANEL_TYPES[digit - 1]?.key;
}
