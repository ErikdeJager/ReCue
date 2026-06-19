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
    <div className={styles.group} role="tablist" aria-label="View">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={view === option.value}
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
