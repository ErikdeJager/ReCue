import { useStore } from "../../store";
import styles from "./Toaster.module.css";

/**
 * Bottom-right toast stack (#32). Toasts animate in and auto-dismiss (the timer
 * lives in the store); clicking a toast dismisses it early. When the bottom-right
 * UpdatePopup is showing, the stack is raised above it so they don't overlap.
 */
function Toaster() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  const update = useStore((s) => s.update);

  if (toasts.length === 0) return null;

  const popupVisible =
    update.available && !update.dismissed && !update.installing;

  return (
    <div
      className={`${styles.toaster} ${popupVisible ? styles.raised : ""}`}
      role="status"
      aria-live="polite"
    >
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
