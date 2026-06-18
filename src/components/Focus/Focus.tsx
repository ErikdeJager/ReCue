import { useStore } from "../../store";
import Terminal from "../Terminal/Terminal";
import styles from "./Focus.module.css";

/**
 * Focus placeholder: the selected session's terminal fills the area. The
 * toolbar (copy chip, Open in Zed, inspector toggle) and the diff inspector
 * land in tasks #12 / #13.
 */
function Focus() {
  const selectedId = useStore((s) => s.selectedId);
  const sessions = useStore((s) => s.sessions);
  const session = sessions.find((x) => x.id === selectedId);

  return (
    <div className={styles.focus}>
      {session ? (
        <Terminal key={session.id} sessionId={session.id} />
      ) : (
        <p className={styles.hint}>Select a session to focus it.</p>
      )}
    </div>
  );
}

export default Focus;
