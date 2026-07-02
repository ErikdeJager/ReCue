import { RotateCw } from "lucide-react";

import { isLimitReached } from "../../autoContinue";
import { isClaudeActive, useStore } from "../../store";
import styles from "./AutoContinuePrompt.module.css";

/**
 * Sidebar-footer prompt button (#309), mounted directly above the usage bar (where
 * the update indicator sits). When the Claude five-hour usage window is exhausted
 * (limit reached / 100%) and the "Auto continue after limit reset" setting is still
 * off, it offers a one-click **"Enable auto restart on limit reset"** — turning that
 * setting on (idempotent). It disappears once auto-continue is on.
 *
 * Modelled on {@link ../Update/UpdateIndicator}: a quiet inset chip with an accent
 * hover light-up + a gentle continuous attention glow (degrades to a static glow
 * under reduced motion via the global.css killswitch). Collapses to an icon-only
 * chip in the narrow rail, the full label carried by `title` / `aria-label`.
 *
 * Hidden unless: the active set is Claude, the prompt isn't suppressed
 * (`promptEnableAutoContinueAtLimit`), auto-continue is off, and the usage snapshot
 * reads as the limit reached ({@link isLimitReached}). Frontend-only + pure gating
 * (Zustand + CSS tokens), so identical on macOS and Windows.
 */
function AutoContinuePrompt() {
  const claudeActive = useStore(isClaudeActive);
  const available = useStore((s) => s.usage.available);
  const usedPercent = useStore((s) => s.usage.usedPercent);
  const autoContinueAfterLimit = useStore(
    (s) => s.settings.autoContinueAfterLimit,
  );
  const promptEnabled = useStore(
    (s) => s.settings.promptEnableAutoContinueAtLimit,
  );
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const enableAutoContinueAfterLimit = useStore(
    (s) => s.enableAutoContinueAfterLimit,
  );

  if (
    !claudeActive ||
    !promptEnabled ||
    autoContinueAfterLimit ||
    !isLimitReached({ usedPercent, available })
  ) {
    return null;
  }

  const label = "Enable auto restart on limit reset";

  return (
    <button
      type="button"
      className={`${styles.prompt} ${styles.promptGlow} ${
        collapsed ? styles.promptCollapsed : ""
      }`}
      onClick={() => enableAutoContinueAfterLimit()}
      title={label}
      aria-label={label}
    >
      <RotateCw size={13} strokeWidth={1.5} className={styles.promptIcon} />
      {!collapsed && (
        <span className={styles.promptText}>
          <span className={styles.promptTitle}>{label}</span>
        </span>
      )}
    </button>
  );
}

export default AutoContinuePrompt;
