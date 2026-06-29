import { useEffect, useState } from "react";

import { isClaudeActive, useStore } from "../../store";
import { formatResetCountdown } from "../../time";
import styles from "./Usage.module.css";

/**
 * The thin separator above the sidebar footer (#154), which doubles as a Claude
 * 5-hour session-usage bar.
 *
 * - No usage data (no token, fetch failed, or a non-Claude agent): it's just a plain
 *   full-width hairline — an ordinary separator between the footer buttons and the
 *   panel contents above.
 * - Usage received: the same hairline track fills left→right with the % of the
 *   5-hour limit used (accent fill; a fixed vivid `--usage-critical` red at >=90%),
 *   and a meta row above it shows the reset countdown (left) and the % (right). At
 *   0% the fill is empty, so the bar still reads as a plain separator — but "0%" is
 *   shown on the right.
 *
 * The 180s store poll (started at boot) feeds it; this component only renders + ticks
 * the countdown. In the collapsed rail the meta row is dropped (no room) — just the
 * track shows.
 */
function UsageBar() {
  const claudeActive = useStore(isClaudeActive);
  const available = useStore((s) => s.usage.available);
  const usedPercent = useStore((s) => s.usage.usedPercent);
  const resetsAtMs = useStore((s) => s.usage.resetsAtMs);
  const collapsed = useStore((s) => s.sidebarCollapsed);

  // Re-render the countdown each ~30s while visible. Self-cleaning; the data itself
  // is refreshed independently by the 180s store poll.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const showUsage = claudeActive && available && usedPercent != null;

  // No usage to show → a plain hairline separator.
  if (!showUsage) {
    return (
      <div className={styles.usage} role="separator">
        <div className={styles.track} />
      </div>
    );
  }

  const pct = Math.max(0, Math.min(100, usedPercent));
  // Critical (red) state once usage reaches 90% of the 5-hour limit.
  const critical = pct >= 90;
  const rounded = Math.round(pct);
  const countdown =
    resetsAtMs != null
      ? `Resets in ${formatResetCountdown(resetsAtMs, now)}`
      : "";
  const label = `Claude 5-hour usage ${rounded} percent${
    countdown ? `, ${countdown}` : ""
  }`;

  const track = (
    <div className={styles.track}>
      <div
        className={`${styles.fill} ${critical ? styles.fillCritical : ""}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );

  // Collapsed rail: no room for the meta row — the filled track alone is the bar.
  if (collapsed) {
    return (
      <div
        className={styles.usage}
        title={`${rounded}% of 5-hour limit used`}
        aria-label={label}
      >
        {track}
      </div>
    );
  }

  return (
    <div className={styles.usage} aria-label={label}>
      <div className={styles.meta}>
        <span className={styles.reset}>{countdown}</span>
        <span className={styles.percent}>{rounded}%</span>
      </div>
      {track}
    </div>
  );
}

export default UsageBar;
