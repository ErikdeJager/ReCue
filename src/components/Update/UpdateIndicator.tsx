import { Download } from "lucide-react";

import { useStore } from "../../store";
import styles from "./Update.module.css";

// One-shot guard (#216): the announce animation plays once per app session — the
// first time the indicator appears for an *available* update. Module-level (shared
// across remounts) and deliberately NOT persisted, so it replays on a fresh app
// open. Set on `animationend` rather than at render so it's robust to React
// StrictMode's dev double-mount (the throwaway mount is unmounted before its
// animation ends, so the flag is set by the surviving mount that actually plays).
let updateAnnounced = false;

/**
 * Sidebar-footer update box (#190), mounted directly above the Settings gear.
 * Hidden while the updater is idle/checking/downloading; when an update is
 * available it shows "Update available · v<version>" and, on click, **opens
 * Settings at the Updates section** (#191 — the review-then-install surface).
 * Collapses to just its icon in the narrow rail (#168). An `error` status shows a
 * compact "Update failed" that also opens the Updates pane.
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

  // Play the one-time attention pulse (#216) only on the first *available*
  // appearance this session (not for the error variant). The element only mounts
  // when it appears, so the CSS animation can't replay on a re-render (collapse
  // toggle / hover); the flag additionally guards a status flip away-and-back.
  const announce = !isError && !updateAnnounced;

  return (
    <button
      type="button"
      className={`${styles.indicator} ${isError ? styles.indicatorError : ""} ${
        collapsed ? styles.indicatorCollapsed : ""
      } ${announce ? styles.indicatorAnnounce : ""}`}
      onAnimationEnd={() => {
        // The announce pulse finished (its only animation) — never replay it.
        updateAnnounced = true;
      }}
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
