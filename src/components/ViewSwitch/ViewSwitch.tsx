import { AlertTriangle, LayoutGrid, PanelsTopLeft } from "lucide-react";

import { useStore } from "../../store";
import type { View } from "../../types";
import SegmentedControl, {
  type SegmentedOption,
} from "../SegmentedControl/SegmentedControl";
import styles from "./ViewSwitch.module.css";

// Order shared by the compact rail (Overview → Attention → Canvas, #406). Expanded
// mode builds its own two-segment array + a standalone Canvas button below.
const OPTIONS: { value: View; label: string; icon: typeof LayoutGrid }[] = [
  { value: "overview", label: "Overview", icon: LayoutGrid },
  { value: "attention", label: "Attention", icon: AlertTriangle },
  { value: "canvas", label: "Canvas", icon: PanelsTopLeft },
];

/**
 * View switcher (#25, #46, #75, #398, #405, #406). Lives in the sidebar, under the New
 * session button, so it's always visible. **Overview** and **Attention** are the two
 * prominent, equal-weight *main* views; **Canvas** is a visually smaller, de-emphasized
 * *secondary* view (#406). The expanded mode renders the two main views through the
 * shared `SegmentedControl` atom (UI v2 task 372, its rounded `chrome` look) followed by
 * a smaller standalone Canvas button in the same row; with `compact` (#168) it renders
 * as icon-only buttons stacked to fit the collapsed sidebar rail, in the same
 * Overview → Attention → Canvas order (Canvas subtly de-emphasized). The **Attention**
 * control (#398) is icon-only (the lucide `AlertTriangle`, accessible name "Attention")
 * with no queue-count badge (#405).
 */
function ViewSwitch({ compact = false }: { compact?: boolean }) {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  const go = (value: View) => setView(value);

  if (!compact) {
    // Overview + Attention are the two equal-weight main segments; Canvas is a
    // separate, visibly smaller secondary button appended after the control (#406).
    // With only two segments in the control, `view === "canvas"` leaves neither
    // segment active here — the standalone Canvas button carries the active state
    // instead (the intended "Canvas is a secondary mode" affordance).
    const mainOptions: SegmentedOption<View>[] = [
      { value: "overview", label: "Overview" },
      {
        value: "attention",
        title: "Attention",
        label: (
          <span className={styles.attnLabel}>
            <AlertTriangle size={14} strokeWidth={1.5} aria-hidden />
            <span className={styles.srOnly}>Attention</span>
          </span>
        ),
      },
    ];
    const canvasActive = view === "canvas";
    return (
      <div className={styles.expanded}>
        <SegmentedControl
          options={mainOptions}
          value={view}
          onChange={go}
          ariaLabel="View"
          chrome
          stretch
          className={styles.mainControl}
        />
        <button
          type="button"
          className={canvasActive ? styles.canvasBtnActive : styles.canvasBtn}
          aria-label="Canvas"
          title="Canvas"
          aria-pressed={canvasActive}
          onClick={() => go("canvas")}
        >
          <PanelsTopLeft size={14} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
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
        const isCanvas = option.value === "canvas";
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={option.label}
            title={option.label}
            tabIndex={selected ? 0 : -1}
            className={[
              selected ? styles.iconActive : styles.iconOption,
              isCanvas ? styles.iconCanvas : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => go(option.value)}
          >
            <Icon size={14} strokeWidth={1.5} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

export default ViewSwitch;
