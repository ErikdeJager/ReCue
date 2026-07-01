import { useStore } from "../../store";
import type { SessionView } from "../../types";
import Checkbox from "../Checkbox/Checkbox";

import styles from "./AutoContinueToggle.module.css";

interface AutoContinueToggleProps {
  session: SessionView;
  /** Extra class on the root strip (layout tweaks per surface). */
  className?: string;
}

/**
 * Per-agent opt-out for auto-continue-after-limit (#297). Refines the global
 * `autoContinueAfterLimit` feature (#296): when it's on, each Claude agent shows this
 * compact **"Auto continue after limit reset"** checkbox (checked = the agent
 * participates). Unchecking it sets the session's persisted `autoContinueDisabled` flag
 * so that one agent is excluded from the fire step, without touching the global setting
 * or any other agent.
 *
 * Renders **nothing** unless the global option is on AND the session is a Claude agent
 * (a legacy null agent predates #101 and is claude) — there's nothing to opt out of for
 * a non-Claude agent or when the feature is off. Frontend-only + platform-neutral, so it
 * behaves identically on macOS and Windows.
 */
function AutoContinueToggle({ session, className }: AutoContinueToggleProps) {
  const enabled = useStore((s) => s.settings.autoContinueAfterLimit);
  const setAutoContinueDisabled = useStore((s) => s.setAutoContinueDisabled);

  const isClaude = (session.agent ?? "claude") === "claude";
  if (!enabled || !isClaude) return null;

  return (
    // stopPropagation so a click can't start the Overview card / #144 Canvas header
    // drag (both wire drag listeners on the header this may sit inside/next to).
    <div
      className={`${styles.strip} ${className ?? ""}`}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Checkbox
        className={styles.checkbox}
        checked={!session.autoContinueDisabled}
        onChange={(v) => setAutoContinueDisabled(session.id, !v)}
        label="Auto continue after limit reset"
      />
    </div>
  );
}

export default AutoContinueToggle;
