import { LayoutGrid, PanelsTopLeft } from "lucide-react";

import { useStore } from "../../store";
import type { View } from "../../types";
import styles from "./ViewSwitch.module.css";

const OPTIONS: { value: View; label: string; icon: typeof LayoutGrid }[] = [
  { value: "overview", label: "Overview", icon: LayoutGrid },
  { value: "canvas", label: "Canvas", icon: PanelsTopLeft },
];

/**
 * Segmented Overview / Canvas control (#25, #46, #75). Lives in the sidebar,
 * under the New session button, so it's always visible. With `compact` (#168) it
 * renders as icon-only buttons stacked to fit the collapsed sidebar rail.
 */
function ViewSwitch({ compact = false }: { compact?: boolean }) {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  const go = (value: View) => setView(value);

  return (
    <div
      className={compact ? styles.groupCompact : styles.group}
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
            aria-label={compact ? option.label : undefined}
            title={compact ? option.label : undefined}
            tabIndex={selected ? 0 : -1}
            className={
              compact
                ? selected
                  ? styles.iconActive
                  : styles.iconOption
                : selected
                  ? styles.active
                  : styles.option
            }
            onClick={() => go(option.value)}
          >
            {compact ? (
              <Icon size={16} strokeWidth={1.5} aria-hidden />
            ) : (
              option.label
            )}
          </button>
        );
      })}
    </div>
  );
}

export default ViewSwitch;
