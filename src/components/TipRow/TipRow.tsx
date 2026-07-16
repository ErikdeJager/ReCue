import { useState } from "react";
import { Lightbulb } from "lucide-react";

import { useStore } from "../../store";
import { nextTipIndex, randomTipIndex, renderTip, TIPS } from "../../tips";
import styles from "./TipRow.module.css";

/**
 * Rotating startup tip (UI v2 task 379, extracted in task 424) — a tiny ghost
 * "tip" chip (a Lightbulb + the word "tip") next to one random startup tip from
 * `src/tips.json`; clicking the chip shuffles to a different tip. Shared by the
 * empty-state hero (`EmptyState`) and the filtered-Overview empty state.
 */
function TipRow() {
  const platform = useStore((s) => s.platform);
  const [tipIdx, setTipIdx] = useState(() => randomTipIndex(TIPS.length));
  const tip = TIPS[tipIdx];
  if (!tip) return null;
  const renderedTip = renderTip(platform, tip);
  return (
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
  );
}

export default TipRow;
