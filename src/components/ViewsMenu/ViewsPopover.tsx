import { type ReactNode, useEffect, useRef, useState } from "react";

import ViewsMenu from "./ViewsMenu";
import styles from "./ViewsPopover.module.css";

/**
 * Shared popover host for the add-view menu (#164/#165): a trigger (rendered by the
 * caller) that toggles a popover containing the shared {@link ViewsMenu} scoped to
 * `repoPath`. Dismisses on outside-click + Escape and stops `pointerdown` on its
 * root so opening it never starts a Canvas move-leaf / Overview card drag (mirrors
 * `FileSwitcher`). Used by the clickable worktree badge (#164) and the normal-agent
 * "open view" button (#165) — one popover + one action set.
 */
function ViewsPopover({
  repoPath,
  renderTrigger,
  align = "right",
}: {
  repoPath: string;
  renderTrigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  /** Which edge the popover anchors to — "left" for a left-placed trigger (the
   * worktree badge), "right" for a right-placed one (a header action button). */
  align?: "left" | "right";
}) {
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
      {renderTrigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          className={`menu-pop ${styles.popover} ${align === "left" ? styles.alignLeft : styles.alignRight}`}
          role="menu"
          aria-label="Open a view"
        >
          {/* Section header (UI v2 §10, task 375) — the demo's "OPEN A VIEW"
              label; CSS uppercases it. */}
          <div className="menu-section">Open a view</div>
          <ViewsMenu repoPath={repoPath} onClose={() => setOpen(false)} />
        </div>
      )}
    </span>
  );
}

export default ViewsPopover;
