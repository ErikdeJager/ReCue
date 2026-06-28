import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
} from "react";

import { agentIsUntested } from "../../agents";
import { useStore } from "../../store";
import styles from "./Onboarding.module.css";

/**
 * First-launch coding-agent picker. Shown once (gated by the `onboarded` settings
 * flag) when **2+** agent CLIs are detected on PATH — if only one is installed the
 * store auto-selects it silently instead, and if none are installed nothing shows.
 *
 * Claude Code is the recommended agent; Codex and OpenCode are untested (no resume /
 * fork / auto-naming / usage meter), badged accordingly. Picking a row records it as
 * `defaultAgent`; Escape / scrim keeps the current default. Mirrors the
 * CanvasCloseModal conventions (scrim + `role="dialog"`/`aria-modal`, autofocus, a
 * Tab focus-trap, Escape to dismiss).
 */
function OnboardingModal() {
  const choices = useStore((s) => s.onboardingChoices);
  const choose = useStore((s) => s.chooseOnboardingAgent);
  const dismiss = useStore((s) => s.dismissOnboarding);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Autofocus the recommended (Claude) row if present, else the first; wire Escape.
  useEffect(() => {
    const buttons =
      dialogRef.current?.querySelectorAll<HTMLButtonElement>(
        "button[data-agent]",
      );
    const recommended = dialogRef.current?.querySelector<HTMLButtonElement>(
      'button[data-recommended="true"]',
    );
    (recommended ?? buttons?.[0])?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  // Minimal focus trap: cycle Tab/Shift+Tab among the dialog's buttons.
  const onDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable =
      dialogRef.current?.querySelectorAll<HTMLElement>("button");
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    <div className={styles.overlay} onClick={dismiss}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Choose your coding agent"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onDialogKeyDown}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>Choose your coding agent</h2>
          <p className={styles.subtitle}>
            ReCue can run sessions under different coding-agent CLIs. Pick the
            one new sessions should use — you can change this anytime in
            Settings.
          </p>
        </header>
        <div className={styles.choices}>
          {choices.map((a) => {
            const untested = agentIsUntested(a.id);
            return (
              <button
                key={a.id}
                type="button"
                data-agent={a.id}
                data-recommended={!untested}
                className={styles.choice}
                onClick={() => void choose(a.id)}
              >
                <span className={styles.choiceRow}>
                  <span className={styles.choiceName}>{a.display_name}</span>
                  <span
                    className={`${styles.badge} ${untested ? styles.untested : styles.recommended}`}
                  >
                    {untested ? "Untested" : "Recommended"}
                  </span>
                </span>
                <span className={styles.choiceDesc}>
                  {untested
                    ? "Experimental — resume, fork, auto-naming, and the usage meter aren't available."
                    : "Full support — resume, fork, auto-naming, and the usage meter."}
                </span>
              </button>
            );
          })}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.later} onClick={dismiss}>
            Decide later
          </button>
        </div>
      </div>
    </div>
  );
}

export default OnboardingModal;
