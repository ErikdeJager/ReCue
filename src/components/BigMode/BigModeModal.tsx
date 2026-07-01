import { useEffect } from "react";
import { X } from "lucide-react";

import { useStore } from "../../store";
import { itemStillPresent } from "../Canvas/canvasDrop";
import ItemContent from "../ItemContent/ItemContent";
import { itemTitle } from "../ItemContent/itemTitle";
import styles from "./BigModeModal.module.css";

/**
 * "Big mode" (#157): a near-fullscreen overlay showing a single maximized item
 * (agent / terminal / file / kanban / diff / scheduled) at full size, over a dimmed
 * scrim. The modal's `ItemContent` is the **only** live render of that item — every
 * source panel/column shows a `MaximizedNote` placeholder while it is open (the
 * one-live-render-site rule that keeps the #18 pooled terminal and the #148
 * auto-save hook single). Rendered at the top level of each window (main + detached)
 * while `maximizedItem` is set; closes on the close button, scrim, or Esc (gated so
 * a focused terminal keeps its own Esc), and auto-closes if the item disappears.
 */
function BigModeModal() {
  const maximizedItem = useStore((s) => s.maximizedItem);
  const closeMaximized = useStore((s) => s.closeMaximized);
  const sessions = useStore((s) => s.sessions);
  const branches = useStore((s) => s.branches);
  const autoNameOn = useStore((s) => s.settings.autoName);
  // Lifecycle inputs (#157 subtask 7): auto-close when the item is gone.
  const overviewPanels = useStore((s) => s.overviewPanels);
  const schedules = useStore((s) => s.schedules);
  const recurrings = useStore((s) => s.recurrings);
  const canvases = useStore((s) => s.canvases);

  // Auto-close when the maximized item no longer resolves to a live session /
  // panel / schedule / recurring (agent exited or removed, panel closed, schedule
  // fired, recurring cancelled) — no orphaned overlay.
  useEffect(() => {
    if (!maximizedItem) return;
    if (
      !itemStillPresent(maximizedItem, {
        sessions,
        overviewPanels,
        schedules,
        recurrings,
        canvases,
      })
    ) {
      closeMaximized();
    }
  }, [
    maximizedItem,
    sessions,
    overviewPanels,
    schedules,
    recurrings,
    canvases,
    closeMaximized,
  ]);

  // Esc-to-close, gated to non-terminal focus: a focused xterm consumes keystrokes,
  // so don't steal Esc from it (the close button + scrim remain the primary closers).
  useEffect(() => {
    if (!maximizedItem) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (target && target.closest(".xterm")) return;
      event.preventDefault();
      closeMaximized();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [maximizedItem, closeMaximized]);

  if (!maximizedItem) return null;
  const title = itemTitle(maximizedItem, sessions, branches, autoNameOn);

  return (
    // mousedown (not click) on the scrim closes — a click that starts inside the
    // body and releases on the scrim won't accidentally close.
    <div className={styles.overlay} onMouseDown={() => closeMaximized()}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Big mode"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <span className={styles.title} title={title}>
            {title}
          </span>
          <button
            type="button"
            className={styles.close}
            onClick={() => closeMaximized()}
            title="Close big mode"
            aria-label="Close big mode"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </header>
        <div className={styles.body}>
          <ItemContent content={maximizedItem} active inModal />
        </div>
      </div>
    </div>
  );
}

export default BigModeModal;
