import { type ReactNode } from "react";
import { Check } from "lucide-react";

import styles from "./Checkbox.module.css";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible label beside the box; its text is the control's accessible name. */
  label?: ReactNode;
  disabled?: boolean;
  /** Accessible name when there's no visible label (or to override it). */
  ariaLabel?: string;
  /** Extra class on the root `<label>` (layout, e.g. `flex: 1`). */
  className?: string;
}

/**
 * On-system checkbox (#52) — the single checkbox used app-wide instead of a
 * native `<input type="checkbox">`. A visually-hidden but real input keeps full
 * semantics (Space toggles, `:focus-visible`, screen-reader checked state, native
 * label association); a custom Catppuccin box renders the visual state, driven by
 * the input's `:checked` / `:focus-visible` / `:disabled` via sibling selectors.
 */
function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
  ariaLabel,
  className,
}: CheckboxProps) {
  return (
    <label
      className={`${styles.root} ${disabled ? styles.disabled : ""} ${className ?? ""}`}
    >
      <input
        type="checkbox"
        className={styles.input}
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span className={styles.box} aria-hidden="true">
        {/* 11px clears the 15px v2 box's 13px interior (task 372). */}
        <Check className={styles.check} size={11} strokeWidth={3} />
      </span>
      {label !== undefined && <span className={styles.label}>{label}</span>}
    </label>
  );
}

export default Checkbox;
