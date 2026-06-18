import { ExternalLink, Maximize2, X } from "lucide-react";

import { repoName } from "../../paths";
import { useStore } from "../../store";
import type { SessionView } from "../../types";
import EmptyState from "../EmptyState/EmptyState";
import Terminal from "../Terminal/Terminal";
import styles from "./Overview.module.css";

interface SessionCardProps {
  session: SessionView;
  branch: string;
  onExpand: () => void;
  onOpenInZed: () => void;
  onRemove: () => void;
}

function SessionCard({
  session,
  branch,
  onExpand,
  onOpenInZed,
  onRemove,
}: SessionCardProps) {
  return (
    <div className={styles.card}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.name}>
            {session.name ?? repoName(session.repoPath)}
          </span>
          <span className={styles.meta}>
            {repoName(session.repoPath)}
            {branch && ` · ${branch}`}
          </span>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.action}
            onClick={onExpand}
            title="Expand to Focus"
            aria-label="Expand to Focus"
          >
            <Maximize2 size={15} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            className={styles.action}
            onClick={onOpenInZed}
            title="Open in Zed"
            aria-label="Open in Zed"
          >
            <ExternalLink size={15} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            className={styles.action}
            onClick={onRemove}
            title="Remove (kill + forget)"
            aria-label="Remove session"
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>
      </header>
      <div className={styles.body}>
        <Terminal sessionId={session.id} />
      </div>
    </div>
  );
}

/**
 * The Overview "agent wall": every active session as an equal-width terminal
 * column. Columns fill the area and scroll horizontally once they hit their
 * min-width. Cards are uniform — no status pills/glow in v1.
 */
function Overview() {
  const sessions = useStore((s) => s.sessions);
  const branches = useStore((s) => s.branches);
  const select = useStore((s) => s.select);
  const setView = useStore((s) => s.setView);
  const openInZed = useStore((s) => s.openInZed);
  const removeSession = useStore((s) => s.removeSession);
  const openNewSession = useStore((s) => s.openNewSession);

  if (sessions.length === 0) {
    return <EmptyState onNewSession={() => openNewSession()} />;
  }

  // Expand is the intentional Focus affordance: select, then switch the view
  // explicitly (selection alone no longer forces Focus — see store `select`).
  const expand = (id: string) => {
    select(id);
    setView("focus");
  };

  return (
    <div className={styles.wall}>
      {sessions.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          branch={branches[session.repoPath] ?? ""}
          onExpand={() => expand(session.id)}
          onOpenInZed={() => void openInZed(session.repoPath)}
          onRemove={() => void removeSession(session.id)}
        />
      ))}
    </div>
  );
}

export default Overview;
