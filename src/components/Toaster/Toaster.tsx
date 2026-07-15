import { Check, CircleAlert, Info } from "lucide-react";

import { useStore } from "../../store";
import type { ToastTone } from "../../types";
import styles from "./Toaster.module.css";

/**
 * Bottom-center toast stack (#32, restyled by UI v2 task 376 — spec §10).
 * Toasts rise in (180ms), auto-dismiss (the timer lives in the store), and
 * dismiss early on click. Tone is encoded by the leading Lucide icon:
 * success → green check, error → red alert, info → accent info.
 */
function toneIcon(tone: ToastTone) {
  if (tone === "success")
    return (
      <span className={`${styles.icon} ${styles.success}`} aria-hidden="true">
        <Check size={13} strokeWidth={2.5} />
      </span>
    );
  if (tone === "error")
    return (
      <span className={`${styles.icon} ${styles.error}`} aria-hidden="true">
        <CircleAlert size={13} />
      </span>
    );
  return (
    <span className={`${styles.icon} ${styles.info}`} aria-hidden="true">
      <Info size={13} />
    </span>
  );
}

function Toaster() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className={styles.toaster} role="status" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className={styles.toast}
          onClick={() => dismiss(toast.id)}
          title="Dismiss"
          aria-label={`Dismiss notification: ${toast.message}`}
        >
          {toneIcon(toast.tone)}
          <span className={styles.message}>{toast.message}</span>
        </button>
      ))}
    </div>
  );
}

export default Toaster;
