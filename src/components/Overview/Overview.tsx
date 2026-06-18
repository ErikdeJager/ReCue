import { useStore } from "../../store";
import EmptyState from "../EmptyState/EmptyState";
import styles from "./Overview.module.css";

/**
 * Overview placeholder. The live, side-by-side agent wall lands in task #11;
 * for now it lists session cards or shows the empty state.
 */
function Overview() {
  const sessions = useStore((s) => s.sessions);
  const select = useStore((s) => s.select);
  const openNewSession = useStore((s) => s.openNewSession);

  if (sessions.length === 0) {
    return <EmptyState onNewSession={() => openNewSession()} />;
  }

  return (
    <div className={styles.wall}>
      {sessions.map((session) => (
        <button
          key={session.id}
          type="button"
          className={styles.card}
          onClick={() => select(session.id)}
        >
          <span className={styles.name}>
            {session.name ?? session.repoPath}
          </span>
          <span className={styles.meta}>{session.repoPath}</span>
        </button>
      ))}
    </div>
  );
}

export default Overview;
