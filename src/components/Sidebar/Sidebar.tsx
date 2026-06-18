import { useEffect, useState } from "react";
import { ChevronRight, Plus, X } from "lucide-react";

import { repoName } from "../../paths";
import { repoOrder, useStore } from "../../store";
import type { SessionView } from "../../types";
import styles from "./Sidebar.module.css";

interface SessionRowProps {
  session: SessionView;
  branch: string;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

function SessionRow({
  session,
  branch,
  selected,
  onSelect,
  onRemove,
}: SessionRowProps) {
  return (
    <div className={`${styles.row} ${selected ? styles.rowSelected : ""}`}>
      <button type="button" className={styles.rowMain} onClick={onSelect}>
        <span className={styles.rowName}>
          {session.name ?? repoName(session.repoPath)}
        </span>
        <span className={styles.rowBranch}>{branch || "no branch"}</span>
      </button>
      <button
        type="button"
        className={styles.remove}
        onClick={onRemove}
        title="Remove (kill + forget)"
        aria-label="Remove session"
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}

/**
 * Left sidebar: New session button + sessions grouped by repository. Repos come
 * from persisted recents unioned with active-session repos, so a repo stays
 * listed (greyed, with a coral +) even when it has no active sessions.
 */
function Sidebar() {
  const sessions = useStore((s) => s.sessions);
  const recents = useStore((s) => s.recents);
  const branches = useStore((s) => s.branches);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const removeSession = useStore((s) => s.removeSession);
  const spawnSession = useStore((s) => s.spawnSession);
  const openNewSession = useStore((s) => s.openNewSession);
  const refreshBranches = useStore((s) => s.refreshBranches);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    void refreshBranches();
  }, [refreshBranches, sessions, recents]);

  const repos = repoOrder(recents, sessions);

  const toggle = (repo: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(repo)) next.delete(repo);
      else next.add(repo);
      return next;
    });

  return (
    <aside className={styles.sidebar} aria-label="Sessions">
      <button
        type="button"
        className={styles.newButton}
        onClick={() => openNewSession()}
      >
        <Plus size={16} strokeWidth={1.5} />
        New session
      </button>

      <div className={styles.repos}>
        {repos.length === 0 && (
          <p className={styles.emptyHint}>No repositories yet.</p>
        )}

        {repos.map((repo) => {
          const repoSessions = sessions.filter((s) => s.repoPath === repo);
          const isEmpty = repoSessions.length === 0;
          const isCollapsed = collapsed.has(repo);

          return (
            <div key={repo} className={styles.group}>
              <div
                className={`${styles.repoHeader} ${isEmpty ? styles.repoEmpty : ""}`}
              >
                <button
                  type="button"
                  className={styles.repoToggle}
                  onClick={() => toggle(repo)}
                  title={repo}
                >
                  <ChevronRight
                    size={14}
                    strokeWidth={1.5}
                    className={`${styles.chevron} ${isCollapsed ? "" : styles.chevronOpen}`}
                  />
                  <span className={styles.repoName}>{repoName(repo)}</span>
                  {!isEmpty && (
                    <span className={styles.count}>{repoSessions.length}</span>
                  )}
                </button>
                <button
                  type="button"
                  className={`${styles.plus} ${isEmpty ? styles.plusCoral : ""}`}
                  onClick={() => void spawnSession(repo)}
                  title="New session in this repo"
                  aria-label="New session in this repo"
                >
                  <Plus size={14} strokeWidth={1.5} />
                </button>
              </div>

              {!isCollapsed &&
                repoSessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    branch={branches[repo] ?? ""}
                    selected={session.id === selectedId}
                    onSelect={() => select(session.id)}
                    onRemove={() => void removeSession(session.id)}
                  />
                ))}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

export default Sidebar;
