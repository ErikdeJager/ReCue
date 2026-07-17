import type { ReactNode } from "react";

import styles from "./SegmentedControl.module.css";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Hover tooltip on the segment. */
  title?: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the tablist. */
  ariaLabel: string;
  /** Rounded sidebar-chrome look (well radius 7 / thumb 5, 20px segments);
   * default is the square panel-toolbar look (22px segments, radius 0). */
  chrome?: boolean;
  /** Segments split the width evenly (sidebar) vs hug their content (toolbars). */
  stretch?: boolean;
  /** Extra class on the root (layout). */
  className?: string;
}

/**
 * Shared segmented control (UI v2 task 372, DESIGN-SPEC.md §2) — the generic
 * presentation-only primitive behind ViewSwitch's expanded mode (and the later
 * UI v2 cards' toolbars): a crust well holding flat segments, the active one a
 * Surface0 thumb. ARIA tablist with roving tabindex + arrow-key nav, ported
 * from ViewSwitch (#49). Square by default (in-panel); `chrome` rounds the
 * well/thumb for sidebar-chrome placement.
 */
function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  chrome = false,
  stretch = false,
  className,
}: SegmentedControlProps<T>) {
  const rootClass = [
    styles.group,
    chrome ? styles.chrome : "",
    stretch ? styles.stretch : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  // Roving tabindex: exactly one segment must stay tabbable. When `value` matches no
  // option — e.g. ViewSwitch on the Canvas view, whose value isn't among the two main
  // segments (#406) — fall back to the first segment so the control never drops out of
  // the keyboard tab order entirely.
  const selectedIdx = options.findIndex((o) => o.value === value);
  const tabbableIdx = selectedIdx === -1 ? 0 : selectedIdx;

  return (
    <div
      className={rootClass}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={(event) => {
        // Roving arrow-key nav per the ARIA tablist pattern (#49).
        const idx = options.findIndex((o) => o.value === value);
        let next = idx;
        if (event.key === "ArrowRight" || event.key === "ArrowDown")
          next = (idx + 1) % options.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
          next = (idx - 1 + options.length) % options.length;
        else return;
        event.preventDefault();
        const option = options[next];
        if (!option) return;
        onChange(option.value);
        const tabs =
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            '[role="tab"]',
          );
        tabs[next]?.focus();
      }}
    >
      {options.map((option, i) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            title={option.title}
            tabIndex={i === tabbableIdx ? 0 : -1}
            className={selected ? styles.active : styles.option}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
