import { PanelsTopLeft } from "lucide-react";

import ViewsPopover from "../ViewsMenu/ViewsPopover";

/**
 * The **"open view"** header button for a **normal (non-worktree)** agent (#165):
 * the same affordance the clickable worktree badge gives a worktree agent (#164),
 * but as an icon button since a normal agent has no badge. Opens the shared add-view
 * popover ({@link ViewsPopover} → `ViewsMenu`) scoped to the agent's folder
 * (`repoPath`), so a diff / file / kanban / terminal opens in that repo's cluster.
 * `className` matches the host's action-button styling (Canvas `panelClose` /
 * Overview `action`).
 */
function OpenViewButton({
  repoPath,
  className,
  iconSize = 14,
}: {
  repoPath: string;
  className?: string;
  iconSize?: number;
}) {
  return (
    <ViewsPopover
      repoPath={repoPath}
      renderTrigger={({ open, toggle }) => (
        <button
          type="button"
          className={className}
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          title="Open a view in this folder"
          aria-label="Open a view in this folder"
        >
          <PanelsTopLeft size={iconSize} strokeWidth={1.5} />
        </button>
      )}
    />
  );
}

export default OpenViewButton;
