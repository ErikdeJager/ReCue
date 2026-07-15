import { AlertTriangle, LayoutGrid, PanelsTopLeft } from "lucide-react";

import { ownedChildSessionIds, useStore } from "../../store";
import type { View } from "../../types";
import { attentionQueue } from "../Attention/attentionQueue";
import SegmentedControl, {
  type SegmentedOption,
} from "../SegmentedControl/SegmentedControl";
import styles from "./ViewSwitch.module.css";

const OPTIONS: { value: View; label: string; icon: typeof LayoutGrid }[] = [
  { value: "overview", label: "Overview", icon: LayoutGrid },
  { value: "canvas", label: "Canvas", icon: PanelsTopLeft },
  { value: "attention", label: "Attention", icon: AlertTriangle },
];

/**
 * Segmented Overview / Canvas / Attention control (#25, #46, #75, #398). Lives in the
 * sidebar, under the New session button, so it's always visible. The expanded mode
 * renders through the shared `SegmentedControl` atom (UI v2 task 372) in its rounded
 * `chrome` look; with `compact` (#168) it renders as icon-only buttons stacked to fit
 * the collapsed sidebar rail. The **Attention** segment (#398) is icon-only (the lucide
 * `AlertTriangle`, accessible name "Attention") with a live count badge = the number of
 * idle agents awaiting the user; the badge hides at 0.
 */
function ViewSwitch({ compact = false }: { compact?: boolean }) {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  // The live Attention queue size (#398) — a number selector so the badge re-renders
  // only when the count changes (never on unrelated store writes).
  const attentionCount = useStore(
    (s) =>
      attentionQueue({
        sessions: s.sessions,
        sessionBusy: s.sessionBusy,
        sessionActive: s.sessionActive,
        dismissed: s.dismissedAttention,
        idleSince: s.sessionIdleSince,
        recurringChildIds: ownedChildSessionIds(s.recurrings),
      }).length,
  );

  const go = (value: View) => setView(value);

  if (!compact) {
    const options: SegmentedOption<View>[] = OPTIONS.map(
      ({ value, label, icon: Icon }) =>
        value === "attention"
          ? {
              value,
              title: "Attention",
              label: (
                <span className={styles.attnLabel}>
                  <Icon size={14} strokeWidth={1.5} aria-hidden />
                  <span className={styles.srOnly}>Attention</span>
                  {attentionCount > 0 && (
                    <span className={styles.count}>{attentionCount}</span>
                  )}
                </span>
              ),
            }
          : { value, label },
    );
    return (
      <SegmentedControl
        options={options}
        value={view}
        onChange={go}
        ariaLabel="View"
        chrome
        stretch
      />
    );
  }

  return (
    <div
      className={styles.groupCompact}
      role="tablist"
      aria-label="View"
      onKeyDown={(event) => {
        // Roving arrow-key nav per the ARIA tablist pattern (#49).
        const idx = OPTIONS.findIndex((o) => o.value === view);
        let next = idx;
        if (event.key === "ArrowRight" || event.key === "ArrowDown")
          next = (idx + 1) % OPTIONS.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
          next = (idx - 1 + OPTIONS.length) % OPTIONS.length;
        else return;
        event.preventDefault();
        const option = OPTIONS[next];
        if (!option) return;
        go(option.value);
        const tabs =
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            '[role="tab"]',
          );
        tabs[next]?.focus();
      }}
    >
      {OPTIONS.map((option) => {
        const selected = view === option.value;
        const Icon = option.icon;
        const showCount = option.value === "attention" && attentionCount > 0;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={option.label}
            title={option.label}
            tabIndex={selected ? 0 : -1}
            className={selected ? styles.iconActive : styles.iconOption}
            onClick={() => go(option.value)}
          >
            <Icon size={14} strokeWidth={1.5} aria-hidden />
            {showCount && (
              <span className={styles.countCompact}>{attentionCount}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default ViewSwitch;
