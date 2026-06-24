import { ChevronDown } from "lucide-react";

import ViewsPopover from "../ViewsMenu/ViewsPopover";
import styles from "./WorktreeViewsBadge.module.css";

/**
 * The per-agent **"worktree"** badge (#74) made **clickable** (#164): a button that
 * opens the shared add-view popover ({@link ViewsPopover} → `ViewsMenu`) scoped to
 * the worktree folder (`repoPath`), so a diff / file / kanban / terminal can be
 * opened against the worktree and appear as a left-panel row + Overview column.
 * Rendered in the Canvas panel header and the Overview agent-card header.
 */
function WorktreeViewsBadge({ repoPath }: { repoPath: string }) {
  return (
    <ViewsPopover
      repoPath={repoPath}
      align="left"
      renderTrigger={({ open, toggle }) => (
        <button
          type="button"
          className={styles.badge}
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          title="Open a view in this worktree"
        >
          worktree
          <ChevronDown
            size={10}
            strokeWidth={1.5}
            className={styles.caret}
            aria-hidden
          />
        </button>
      )}
    />
  );
}

export default WorktreeViewsBadge;
