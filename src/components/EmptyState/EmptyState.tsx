import { useState } from "react";
import { Lightbulb, Plus } from "lucide-react";

import { useStore } from "../../store";
import { nextTipIndex, randomTipIndex, renderTip, TIPS } from "../../tips";
import { useKeybindLabel } from "../../useKeybind";
import styles from "./EmptyState.module.css";

interface EmptyStateProps {
  onNewSession?: () => void;
}

/**
 * First-launch hero (UI v2 §7, task 379) — sits directly on the boosted hero
 * wave (task 377): the "ReCue" wordmark, one compact accent "New session"
 * button, and a random startup tip from `src/tips.json` with a small "tip"
 * affordance that shuffles to a different tip. Reused by the Overview wall
 * (task #11) when the app is truly empty.
 */
function EmptyState({ onNewSession }: EmptyStateProps) {
  const platform = useStore((s) => s.platform);
  const newSessionKey = useKeybindLabel("new-session");
  const [tipIdx, setTipIdx] = useState(() => randomTipIndex(TIPS.length));
  const tip = TIPS[tipIdx];
  const renderedTip = tip ? renderTip(platform, tip) : "";
  return (
    <div className={styles.empty}>
      <div className={styles.wordmark}>ReCue</div>
      {onNewSession && (
        <button type="button" className={styles.button} onClick={onNewSession}>
          <Plus size={12} strokeWidth={2.4} />
          New session
          {newSessionKey && (
            <span className="kbd-hint kbd-hint-onfill">{newSessionKey}</span>
          )}
        </button>
      )}
      {tip && (
        <div className={styles.tipRow}>
          <button
            type="button"
            className={styles.tipButton}
            onClick={() => setTipIdx((i) => nextTipIndex(i, TIPS.length))}
            title="Show another tip"
            aria-label="Show another tip"
          >
            <Lightbulb size={11} strokeWidth={1.8} aria-hidden />
            tip
          </button>
          <span className={styles.tipText} title={renderedTip}>
            {renderedTip}
          </span>
        </div>
      )}
    </div>
  );
}

export default EmptyState;
