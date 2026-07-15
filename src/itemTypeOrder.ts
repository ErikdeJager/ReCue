// The **one canonical order** for every menu that lists creatable item/panel types
// (task 392). The ⌘K launcher (`panelTypes.ts`), the repo/worktree "Views" menus +
// header "open a view" popover (`ViewsMenu`), and the Canvas template palette
// (`templateBlocks.ts`) all derive their order from this single source, so they can
// never drift out of sync. Dependency-free + pure so it's trivially unit-testable and
// identical on macOS/Windows/Linux.

/** A creatable item/panel type key. Registries map their own keys onto these. */
export type ItemTypeKey =
  | "session"
  | "terminal"
  | "filetree"
  | "file"
  | "diff"
  | "kanban";

/**
 * The canonical order — Session · Terminal · File tree · File viewer · Diff viewer ·
 * Kanban board (task 392, the ⌘K 1–6 labels). Every creatable-type menu renders (or
 * asserts against) this order; the "Session" entry is dropped by menus that don't
 * offer it inline (e.g. `ViewsMenu`, whose "New session here" lives at the bottom).
 */
export const ITEM_TYPE_ORDER: readonly ItemTypeKey[] = [
  "session",
  "terminal",
  "filetree",
  "file",
  "diff",
  "kanban",
];

/**
 * The rank of an item-type key in the canonical order (0..5). An unknown key sorts
 * **last** (`ITEM_TYPE_ORDER.length`) rather than throwing, so a caller can pass any
 * string without a guard.
 */
export function itemTypeRank(key: ItemTypeKey): number {
  const i = ITEM_TYPE_ORDER.indexOf(key);
  return i === -1 ? ITEM_TYPE_ORDER.length : i;
}

/**
 * A **stable** copy of `items` sorted into canonical item-type order via `keyOf`.
 * Stable so entries with an equal (or unknown) rank keep their source order.
 */
export function byItemTypeOrder<T>(
  items: readonly T[],
  keyOf: (t: T) => ItemTypeKey,
): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        itemTypeRank(keyOf(a.item)) - itemTypeRank(keyOf(b.item)) ||
        a.index - b.index,
    )
    .map((entry) => entry.item);
}
