import { Minimize2 } from "lucide-react";

import { useStore } from "../../store";
import styles from "./MaximizedNote.module.css";

/**
 * Shown in place of an item's content while it is open in **big mode** (#157). A
 * pooled terminal (#18) and the single auto-save hook (#148) may render in only one
 * DOM slot at a time, so while an item is maximized its source panel/column shows
 * this note instead of the live content (the same one-live-render-site principle as
 * the #84 `DetachedNote`). The button restores the item by closing big mode.
 */
function MaximizedNote() {
  const closeMaximized = useStore((s) => s.closeMaximized);
  return (
    <div className={styles.note}>
      <p className={styles.text}>Shown in big mode</p>
      <button
        type="button"
        className="btn btn-neutral"
        onClick={() => closeMaximized()}
      >
        <Minimize2 size={14} strokeWidth={1.5} /> Close big mode
      </button>
    </div>
  );
}

export default MaximizedNote;
