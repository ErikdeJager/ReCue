import styles from "./BusyIndicator.module.css";

interface BusyIndicatorProps {
  /** A Blue ringed dot pulsing while true; a calm dimmed dot when false (#88,
   * restyled by UI v2 task 372). */
  busy: boolean;
  /** The session has been active at least once (#112). When not `busy`, this turns
   * the dot yellow ("finished / needs input") instead of the never-active gray.
   * Ignored while `busy`. */
  hasBeenActive?: boolean;
  /** Accessible label + hover tooltip; defaults to the current state. */
  label?: string;
}

/**
 * The agent activity indicator (#88, supersedes #71's spinner arc; third state
 * added in #112; restyled by UI v2 task 372 — visual-only, the 3-state + sticky
 * semantics, props, and aria/title are untouched): one 7px ringed dot in a fixed
 * 14px slot with three states so the footprint never shifts. **Busy** — a
 * `--status-running` (blue) dot + tinted ring with a gentle opacity pulse while
 * the session is working. **Settled** — once the agent has been active and gone
 * idle again, a steady `--status-awaiting` (yellow) dot + ring and no animation,
 * reading as "finished, needs your input". **Fresh** — a never-active session is
 * a calm `--status-idle` (gray) dot, no ring. Always rendered. Motion respects
 * the global `prefers-reduced-motion` killswitch (`src/styles/global.css`), which
 * freezes the pulse at full opacity — a solid blue ringed dot, still distinct
 * from idle; the settled and fresh dots are already static. All visuals live in
 * `BusyIndicator.module.css` (markup only).
 */
function BusyIndicator({
  busy,
  hasBeenActive = false,
  label,
}: BusyIndicatorProps) {
  // Yellow only applies once active and now idle; busy always wins (blue).
  const settled = !busy && hasBeenActive;
  const text =
    label ?? (busy ? "Working…" : settled ? "Finished — needs input" : "Idle");
  const stateClass = busy ? styles.busy : settled ? styles.settled : "";
  return (
    <span
      className={`${styles.ball} ${stateClass}`}
      role="status"
      aria-label={text}
      title={text}
    />
  );
}

export default BusyIndicator;
