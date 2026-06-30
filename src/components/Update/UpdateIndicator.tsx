import { Download } from "lucide-react";

import { useStore } from "../../store";
import styles from "./Update.module.css";

/**
 * Sidebar-footer update box (#190), mounted directly above the Settings gear.
 * Hidden while the updater is idle/checking/downloading; when an update is
 * available it shows "Update available · v<version>" and, on click, **opens
 * Settings at the Updates section** (#191 — the review-then-install surface).
 * Collapses to just its icon in the narrow rail (#168). An `error` status shows a
 * compact "Update failed" that also opens the Updates pane.
 *
 * While an update is available the chip carries a continuous, gentle glowing
 * accent border (#287, `styles.indicatorGlow` — superseding the #216 one-shot
 * pulse): a slow breathing border/shadow that persists the whole time the update
 * is available and reduces to a static glow under reduced motion. The error
 * variant gets no glow.
 *
 * Inert today (no signed release → `checkForUpdate` returns null), but every state
 * is reachable via the dev mock (#193).
 */
function UpdateIndicator() {
  const status = useStore((s) => s.update.status);
  const version = useStore((s) => s.update.version);
  const error = useStore((s) => s.update.error);
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);

  if (status !== "available" && status !== "error") return null;
  const isError = status === "error";

  return (
    <button
      type="button"
      className={`${styles.indicator} ${
        isError ? styles.indicatorError : styles.indicatorGlow
      } ${collapsed ? styles.indicatorCollapsed : ""}`}
      onClick={() => setSettingsOpen(true, "updates")}
      title={
        isError
          ? (error ?? "Update failed — open Updates")
          : `Update available · v${version ?? ""} — open Updates`
      }
      aria-label={
        isError
          ? "Update failed, open Updates settings"
          : `Update available version ${version}, open Updates settings`
      }
    >
      <Download size={13} strokeWidth={1.5} className={styles.indicatorIcon} />
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
