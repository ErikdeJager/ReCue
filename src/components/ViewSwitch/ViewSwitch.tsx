import { useStore } from "../../store";
import type { View } from "../../types";
import styles from "./ViewSwitch.module.css";

const OPTIONS: { value: View; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "focus", label: "Focus" },
  { value: "canvas", label: "Canvas" },
];

/**
 * Segmented Overview / Focus / Canvas control (#25, #46). Lives in the sidebar,
 * under the New session button, so it's always visible. Choosing Focus goes
 * through `showFocus` so it focuses the selected (or first) agent.
 */
function ViewSwitch() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const showFocus = useStore((s) => s.showFocus);

  const go = (value: View) => {
    if (value === "focus") showFocus();
    else setView(value);
  };

  return (
    <div
      className={styles.group}
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
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={view === option.value}
          tabIndex={view === option.value ? 0 : -1}
          className={view === option.value ? styles.active : styles.option}
          onClick={() => go(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default ViewSwitch;
