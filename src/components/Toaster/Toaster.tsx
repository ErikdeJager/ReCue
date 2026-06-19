import { useStore } from "../../store";
import styles from "./Toaster.module.css";

/**
 * Bottom-right toast stack (#32). Toasts animate in and auto-dismiss (the timer
 * lives in the store); clicking a toast dismisses it early.
 */
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
          className={`${styles.toast} ${toast.tone === "error" ? styles.error : ""}`}
          onClick={() => dismiss(toast.id)}
          title="Dismiss"
          aria-label={`Dismiss notification: ${toast.message}`}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}

export default Toaster;
