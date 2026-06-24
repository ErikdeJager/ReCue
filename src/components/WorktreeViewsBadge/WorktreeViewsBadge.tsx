import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import ViewsMenu from "../ViewsMenu/ViewsMenu";
import styles from "./WorktreeViewsBadge.module.css";

/**
 * The per-agent **"worktree"** badge (#74) made **clickable** (#164): a button that
 * opens a popover of the worktree-scoped add-view actions (the shared `ViewsMenu`),
 * so a diff / file / kanban / terminal can be opened against the worktree folder
 * (`repoPath`) and appear as a left-panel row + Overview column. Rendered in the
 * Canvas panel header and the Overview agent-card header. Dismisses on outside-click
 * + Escape; stops `pointerdown` so opening it never starts a Canvas/Overview drag
 * (mirrors `FileSwitcher`).
 */
function WorktreeViewsBadge({ repoPath }: { repoPath: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span
      ref={rootRef}
      className={styles.root}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={styles.badge}
        onClick={() => setOpen((o) => !o)}
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
      {open && (
        <div
          className={styles.popover}
          role="menu"
          aria-label="Open worktree view"
        >
          <ViewsMenu repoPath={repoPath} onClose={() => setOpen(false)} />
        </div>
      )}
    </span>
  );
}

export default WorktreeViewsBadge;
