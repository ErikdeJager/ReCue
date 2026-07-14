import { LayoutGrid, PanelsTopLeft } from "lucide-react";

import { useStore } from "../../store";
import type { View } from "../../types";
import SegmentedControl from "../SegmentedControl/SegmentedControl";
import styles from "./ViewSwitch.module.css";

const OPTIONS: { value: View; label: string; icon: typeof LayoutGrid }[] = [
  { value: "overview", label: "Overview", icon: LayoutGrid },
  { value: "canvas", label: "Canvas", icon: PanelsTopLeft },
];

/**
 * Segmented Overview / Canvas control (#25, #46, #75). Lives in the sidebar,
 * under the New session button, so it's always visible. The expanded mode
 * renders through the shared `SegmentedControl` atom (UI v2 task 372) in its
 * rounded `chrome` look; with `compact` (#168) it renders as icon-only buttons
 * stacked to fit the collapsed sidebar rail (card 4 owns the rail restyle).
 */
function ViewSwitch({ compact = false }: { compact?: boolean }) {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  const go = (value: View) => setView(value);

  if (!compact) {
    return (
      <SegmentedControl
        options={OPTIONS.map(({ value, label }) => ({ value, label }))}
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
            <Icon size={16} strokeWidth={1.5} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

export default ViewSwitch;
