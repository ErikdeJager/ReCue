import { useEffect } from "react";
import { Download } from "lucide-react";

import { useStore } from "../../store";
import styles from "./Update.module.css";

/**
 * Update confirm + install UI (#190). Two phases, both self-gated on the store's
 * `update` slice so this can be mounted unconditionally:
 *
 * - **Confirm** (status `available` + `confirming`): an "Update to v<version>? The
 *   app will restart." dialog. Cancel / Escape / scrim-click closes it (only before
 *   install starts).
 * - **Installing** (status `downloading`): a **full-window, input-blocking overlay**
 *   (a `--scrim` cover with no dismiss) showing a progress bar bound to
 *   `update.progress`; on completion the app relaunches into the new version.
 */
function UpdateModal() {
  const status = useStore((s) => s.update.status);
  const version = useStore((s) => s.update.version);
  const progress = useStore((s) => s.update.progress);
  const confirming = useStore((s) => s.update.confirming);
  const cancelUpdate = useStore((s) => s.cancelUpdate);
  const installUpdate = useStore((s) => s.installUpdate);

  const showConfirm = status === "available" && confirming;
  const installing = status === "downloading";

  // Escape cancels the confirm dialog — but never during install (no dismiss).
  useEffect(() => {
    if (!showConfirm) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelUpdate();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showConfirm, cancelUpdate]);

  if (installing) {
    // Full-window blocking overlay — captures all input until relaunch (#190).
    return (
      <div
        className={`modal-scrim ${styles.overlay}`}
        role="alertdialog"
        aria-modal="true"
        aria-label="Installing update"
      >
        <div className={`modal-pop ${styles.installBox}`}>
          <p className={styles.installTitle}>
            Updating{version ? ` to v${version}` : ""}…
          </p>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={styles.progressBar}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className={styles.installHint}>
            The app will restart when the update finishes.
          </p>
        </div>
      </div>
    );
  }

  if (!showConfirm) return null;

  return (
    <div className={`modal-scrim ${styles.overlay}`} onClick={cancelUpdate}>
      <div
        className={`modal-pop ${styles.dialog}`}
        role="dialog"
        aria-modal="true"
        aria-label="Update available"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className={styles.title}>
          <Download size={16} strokeWidth={2} className={styles.titleIcon} />
          Update to v{version}?
        </h2>
        <p className={styles.body}>
          The app will download the update and restart.
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className="modal-btn modal-btn-neutral"
            onClick={cancelUpdate}
          >
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn modal-btn-primary"
            onClick={() => void installUpdate()}
          >
            Update &amp; restart
          </button>
        </div>
      </div>
    </div>
  );
}

export default UpdateModal;
