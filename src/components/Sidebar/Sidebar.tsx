import { useEffect, useState } from "react";
import { ChevronRight, Plus, X } from "lucide-react";

import { repoName } from "../../paths";
import { dedupeBranchLabels, repoOrder, useStore } from "../../store";
import type { SessionView } from "../../types";
import ViewSwitch from "../ViewSwitch/ViewSwitch";
import styles from "./Sidebar.module.css";

interface SessionRowProps {
  session: SessionView;
  /** Primary label: the (deduped) branch, or folder name for a non-git repo. */
  label: string;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

function SessionRow({
  session,
  label,
  selected,
  onSelect,
  onRemove,
}: SessionRowProps) {
  return (
    <div className={`${styles.row} ${selected ? styles.rowSelected : ""}`}>
      <button type="button" className={styles.rowMain} onClick={onSelect}>
        <span className={styles.rowPrimary}>{label}</span>
        {session.name && (
          <span className={styles.rowSecondary}>{session.name}</span>
        )}
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

  const repos = repoOrder(recents, sessions);
  const reposKey = repos.join("\n");

  useEffect(() => {
    // Refresh branch labels only when the set of repos changes — not on every
    // session mutation (exit, output) that allocates a new sessions array.
    void refreshBranches();
  }, [refreshBranches, reposKey]);

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

      <div className={styles.viewSwitch}>
        <ViewSwitch />
      </div>

      <div className={styles.repos}>
        {repos.length === 0 && (
          <p className={styles.emptyHint}>No repositories yet.</p>
        )}

        {repos.map((repo) => {
          const repoSessions = sessions.filter((s) => s.repoPath === repo);
          const isEmpty = repoSessions.length === 0;
          const isCollapsed = collapsed.has(repo);
          // Primary label = the repo's branch, or the folder name when non-git /
          // not yet known. All sessions in a group share it, so index duplicates.
          const baseLabel = (branches[repo] ?? "") || repoName(repo);
          const rowLabels = dedupeBranchLabels(
            repoSessions.map(() => baseLabel),
          );

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
                repoSessions.map((session, i) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    // rowLabels has one entry per session; fallback satisfies
                    // noUncheckedIndexedAccess and is never reached at runtime.
                    label={rowLabels[i] ?? baseLabel}
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
