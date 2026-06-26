import { Download } from "lucide-react";

import { useStore } from "../../store";
import styles from "./Update.module.css";

/**
 * Sidebar-footer update box (#190), mounted directly above the Settings gear.
 * Hidden while the updater is idle/checking/downloading; when an update is
 * available it shows "Update available · v<version>" and opens the confirm modal
 * on click. Collapses to just its icon in the narrow rail (#168). An `error`
 * status shows a compact "Update failed" that re-opens the confirm (retry).
 *
 * Inert today (no signed release → `checkForUpdate` returns null), but every state
 * is reachable via the dev mock (#193).
 */
function UpdateIndicator() {
  const status = useStore((s) => s.update.status);
  const version = useStore((s) => s.update.version);
  const error = useStore((s) => s.update.error);
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const openUpdateConfirm = useStore((s) => s.openUpdateConfirm);

  if (status !== "available" && status !== "error") return null;
  const isError = status === "error";

  return (
    <button
      type="button"
      className={`${styles.indicator} ${isError ? styles.indicatorError : ""}`}
      onClick={openUpdateConfirm}
      title={
        isError
          ? (error ?? "Update failed — click to retry")
          : `Update available · v${version ?? ""}`
      }
      aria-label={
        isError
          ? "Update failed, retry"
          : `Update available, version ${version}`
      }
    >
      <Download size={15} strokeWidth={1.5} className={styles.indicatorIcon} />
      {!collapsed && (
        <span className={styles.indicatorText}>
          <span className={styles.indicatorTitle}>
            {isError ? "Update failed" : "Update available"}
          </span>
          {!isError && version && (
            <span className={styles.indicatorVersion}>v{version}</span>
          )}
        </span>
      )}
    </button>
  );
}

export default UpdateIndicator;
