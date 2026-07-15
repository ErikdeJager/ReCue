// Pure decision for the in-repo branch pickers' type-to-filter behavior (#408): as
// the user types, the top matching branch stays highlighted (locals before remotes,
// #180); when the typed text matches NO existing branch, the picker converts the
// query into a create-branch action pre-filled with that text, so Enter (or
// ⌘/Ctrl+Enter) creates a new branch instead of forcing a click on "+ add branch".
//
// Shared by the New-session modal branch step and the sidebar "Checkout branch…"
// picker; split out so it's unit-testable and the components stay thin.

/** The picker's next action for a typed filter value. */
export type BranchFilterMatch =
  | { kind: "local"; value: string }
  | { kind: "remote"; value: string }
  | { kind: "create"; name: string }
  | { kind: "none" };

/**
 * Resolve a typed branch-filter value to the next picker action. `filteredLocals`
 * / `filteredRemotes` are already narrowed to the matches for `query`, in display
 * order. The top matching local wins, else the top matching remote; when neither
 * matches, a **non-empty** (trimmed) query becomes the create fallback carrying the
 * trimmed query as the new branch name, while an empty / whitespace-only query with
 * no matches is `"none"` (nothing to highlight, nothing to create).
 */
export function matchBranchFilter(
  query: string,
  filteredLocals: string[],
  filteredRemotes: string[],
): BranchFilterMatch {
  if (filteredLocals.length > 0) {
    return { kind: "local", value: filteredLocals[0]! };
  }
  if (filteredRemotes.length > 0) {
    return { kind: "remote", value: filteredRemotes[0]! };
  }
  const name = query.trim();
  if (name !== "") {
    return { kind: "create", name };
  }
  return { kind: "none" };
}
