import { ExternalLink } from "lucide-react";

import { useStore } from "../../store";
import { ownerCanvasId } from "../../windowContext";
import styles from "./DetachedNote.module.css";

/**
 * Shown in place of a terminal whose PTY is rendered in **another** window (#84).
 * A live `claude`/shell PTY is sized for one width and renders in exactly one
 * window (the #18 constraint); the window that doesn't own it shows this note with
 * a button to raise the window that does. Used by the Overview wall and Canvas
 * panels alike.
 */
function DetachedNote({ ownerLabel }: { ownerLabel?: string }) {
  const focusCanvasWindow = useStore((s) => s.focusCanvasWindow);
  const canvasId = ownerCanvasId(ownerLabel);
  return (
    <div className={styles.note}>
      <p className={styles.text}>Running in a separate window</p>
      {canvasId && (
        <button
          type="button"
          className="btn btn-neutral"
          onClick={() => focusCanvasWindow(canvasId)}
        >
          <ExternalLink size={14} strokeWidth={1.5} /> Focus window
        </button>
      )}
    </div>
  );
}

export default DetachedNote;
