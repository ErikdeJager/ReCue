import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

import styles from "./NewSessionModal.module.css";

/**
 * The "i" beside the "Run in dev container" toggle: a small click-popover (the
 * `ViewsPopover` pattern — shared `menu-pop` chrome, outside-click + Escape close)
 * that states, tersely, what a containerized agent can and cannot do. The key
 * transparency point: git credentials are NOT mounted, so the agent can commit but
 * cannot push.
 *
 * Escape subtlety: the NewSessionModal closes itself from a window-level **bubble**
 * keydown listener, so this popover's Escape handler registers in the **capture**
 * phase and stops propagation — Escape with the popover open closes only the
 * popover, never the modal underneath it.
 */
function ContainerInfoPopover() {
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
      if (event.key === "Escape") {
        // Capture-phase: runs before (and suppresses) the modal's own
        // window-level Escape-to-close listener.
        event.stopPropagation();
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <span
      ref={rootRef}
      className={styles.infoRoot}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={styles.infoBtn}
        aria-label="About dev containers"
        aria-expanded={open}
        title="What can a containerized agent do?"
        onClick={() => setOpen((o) => !o)}
      >
        <Info size={13} strokeWidth={2} aria-hidden />
      </button>
      {open && (
        <div
          className={`menu-pop ${styles.infoPop}`}
          role="note"
          aria-label="About dev containers"
        >
          <div className="menu-section">Containerized agent</div>
          <p className={styles.infoText}>
            Runs claude in an isolated Docker container. Only this folder is
            mounted (at <code>/work</code>), plus a private per-session home
            that keeps claude signed in and resumable.
          </p>
          <p className={styles.infoText}>
            <strong>Can</strong> edit files in this folder, run commands
            isolated from your system, and create branches + commit — commits
            land in your repo immediately.
          </p>
          <p className={styles.infoText}>
            <strong>Cannot</strong> push or pull remotes — git credentials are
            not mounted, so push from your own terminal — or touch files outside
            this folder. Auto-naming is off (the agent shows its branch).
          </p>
          <p className={styles.infoMeta}>
            Requires Docker. First use builds a small local image (one time).
          </p>
        </div>
      )}
    </span>
  );
}

export default ContainerInfoPopover;
