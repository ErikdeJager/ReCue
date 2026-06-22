import type { CSSProperties, ReactNode } from "react";

import { fillPercent } from "./sliderFill";
import styles from "./Slider.module.css";

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Visible label above the track; its text is the control's accessible name. */
  label?: ReactNode;
  /** Formatted current value shown beside the label (e.g. `12.5px`, `1.0`). */
  valueLabel?: ReactNode;
  /** Accessible name when there's no visible label (or to override it). */
  ariaLabel?: string;
  disabled?: boolean;
  /** Extra class on the root `<label>` (layout). */
  className?: string;
}

/**
 * On-system slider (#122) — the single slider used app-wide instead of a native
 * `<input type="range">`. Follows the Checkbox (#52) precedent: a **real** range
 * input keeps full semantics (←/→ · Home/End · PageUp/Down, `:focus-visible`, the
 * correct ARIA value/min/max, label association, the caller's `onChange`), styled
 * custom via `appearance: none` + the cross-browser track/thumb pseudo-elements
 * (`Slider.module.css`). The accent **fill up to the thumb** is value-driven through
 * an inline `--fill` CSS variable. Tokens only; reduced-motion safe.
 */
function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  valueLabel,
  ariaLabel,
  disabled = false,
  className,
}: SliderProps) {
  const fillStyle = {
    "--fill": `${fillPercent(value, min, max)}%`,
  } as CSSProperties;

  return (
    <label
      className={`${styles.root} ${disabled ? styles.disabled : ""} ${className ?? ""}`}
    >
      {(label !== undefined || valueLabel !== undefined) && (
        <span className={styles.header}>
          {label !== undefined && <span className={styles.label}>{label}</span>}
          {valueLabel !== undefined && (
            <span className={styles.value}>{valueLabel}</span>
          )}
        </span>
      )}
      <input
        type="range"
        className={styles.input}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        style={fillStyle}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

export default Slider;
