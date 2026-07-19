import styles from "./BusyIndicator.module.css";

interface BusyIndicatorProps {
  /** A Blue dot with a sheen sweeping across it while true; a calm dimmed dot
   * when false (#88; the sweep restored by task 385). */
  busy: boolean;
  /** The session has been active at least once (#112). When not `busy`, this turns
   * the dot yellow ("finished / needs input") instead of the never-active gray.
   * Ignored while `busy`. */
  hasBeenActive?: boolean;
  /** The agent is blocked on a tool/permission approval, per its own hook
   * (turn-complete hook bridge). When not `busy`, renders a static red dot ("Needs
   * approval") — more urgent than the yellow settled state. Ignored while `busy`. */
  needsApproval?: boolean;
  /** Accessible label + hover tooltip; defaults to the current state. */
  label?: string;
}

/**
 * The agent activity indicator (#88, supersedes #71's spinner arc; third state
 * added in #112; the pre-UI-v2 sweep restored by task 385 — visual-only, the
 * 3-state + sticky semantics, props, and aria/title are untouched): one dot in a
 * fixed 14px slot with three states so the footprint never shifts. **Busy** — a
 * `--status-running` (blue) dot gaining a soft Claude-style **shimmer** (a sheen
 * sweeping across it) while the session is working. **Settled** — once the agent
 * has been active and gone idle again, a solid `--status-awaiting` (yellow) dot
 * with a soft glow and no animation, reading as "finished, needs your input".
 * **Fresh** — a never-active session is a calm `--status-idle` (gray) dot. Always
 * rendered. Motion respects the global `prefers-reduced-motion` killswitch
 * (`src/styles/global.css`), which stops the sweep and leaves a solid glowing blue
 * dot, still distinct from idle; the settled and fresh dots are already static.
 * All visuals live in `BusyIndicator.module.css` (markup only).
 */
function BusyIndicator({
  busy,
  hasBeenActive = false,
  needsApproval = false,
  label,
}: BusyIndicatorProps) {
  // Precedence: busy (blue) > needs-approval (red) > settled (yellow) > fresh (gray).
  const approval = !busy && needsApproval;
  const settled = !busy && !approval && hasBeenActive;
  const text =
    label ??
    (busy
      ? "Working…"
      : approval
        ? "Needs approval"
        : settled
          ? "Finished — needs input"
          : "Idle");
  const stateClass = busy
    ? styles.busy
    : approval
      ? styles.approval
      : settled
        ? styles.settled
        : "";
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
