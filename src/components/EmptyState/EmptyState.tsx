import { Plus } from "lucide-react";

import TipRow from "../TipRow/TipRow";
import { useKeybindLabel } from "../../useKeybind";
import styles from "./EmptyState.module.css";

interface EmptyStateProps {
  onNewSession?: () => void;
}

/**
 * First-launch hero (UI v2 §7, task 379) — sits directly on the boosted hero
 * wave (task 377): the "ReCue" wordmark, one compact accent "New session"
 * button, and a random startup tip from `src/tips.json` (the shared `TipRow`,
 * extracted in task 424) with a small "tip" affordance that shuffles to a
 * different tip. Reused by the Overview wall (task #11) when the app is truly
 * empty.
 */
function EmptyState({ onNewSession }: EmptyStateProps) {
  const newSessionKey = useKeybindLabel("new-session");
  return (
    <div className={styles.empty}>
      <div className={styles.wordmark}>
        Re<span className={styles.accent}>Cue</span>
      </div>
      {onNewSession && (
        <button type="button" className={styles.button} onClick={onNewSession}>
          <Plus size={12} strokeWidth={2.4} />
          New session
          {newSessionKey && (
            <span className="kbd-hint kbd-hint-onfill">{newSessionKey}</span>
          )}
        </button>
      )}
      <TipRow />
    </div>
  );
}

export default EmptyState;
