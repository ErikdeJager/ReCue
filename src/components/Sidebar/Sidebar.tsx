import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

import { repoName } from "../../paths";
import {
  dedupeBranchLabels,
  REPO_PALETTE,
  repoColor,
  repoOrder,
  useStore,
} from "../../store";
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
  const forgetRepo = useStore((s) => s.forgetRepo);
  const setView = useStore((s) => s.setView);
  const overviewRepoFilter = useStore((s) => s.overviewRepoFilter);
  const setOverviewRepoFilter = useStore((s) => s.setOverviewRepoFilter);
  const repoColors = useStore((s) => s.repoColors);
  const setRepoColor = useStore((s) => s.setRepoColor);

  // Right-click repo context menu (#31/#35), anchored at the cursor. `menuMode`
  // switches between the item list, the destructive Forget confirm, and the
  // color picker.
  const [menu, setMenu] = useState<{
    repo: string;
    x: number;
    y: number;
  } | null>(null);
  const [menuMode, setMenuMode] = useState<"menu" | "confirm" | "color">(
    "menu",
  );
  const closeMenu = () => {
    setMenu(null);
    setMenuMode("menu");
  };

  const repos = repoOrder(recents, sessions);
  const reposKey = repos.join("\n");

  useEffect(() => {
    // Refresh branch labels only when the set of repos changes — not on every
    // session mutation (exit, output) that allocates a new sessions array.
    void refreshBranches();
  }, [refreshBranches, reposKey]);

  // Escape dismisses the context menu (keyboard-dismissable).
  useEffect(() => {
    if (!menu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(null);
        setMenuMode("menu");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  // Running (non-exited) agents in the menu's repo — gates the confirm step.
  const menuRunning = menu
    ? sessions.filter(
        (s) => s.repoPath === menu.repo && s.exitedCode === undefined,
      ).length
    : 0;

  return (
    <aside className={styles.sidebar} aria-label="Sessions">
      <button
        type="button"
        className={styles.newButton}
        onClick={() => openNewSession()}
      >
        <Plus size={16} strokeWidth={1.5} />
        New session
        <kbd className={styles.kbd}>⌘N</kbd>
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
          const isFiltered = overviewRepoFilter === repo;
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
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenu({ repo, x: event.clientX, y: event.clientY });
                  setMenuMode("menu");
                }}
              >
                {/* Left-click a repo title filters Overview to it (toggle);
                    right-click opens the #31 context menu. */}
                <button
                  type="button"
                  className={`${styles.repoTitle} ${isFiltered ? styles.repoActive : ""}`}
                  onClick={() => {
                    setOverviewRepoFilter(repo);
                    setView("overview");
                  }}
                  title={`Filter Overview to ${repoName(repo)}`}
                  aria-pressed={isFiltered}
                >
                  <span
                    className={styles.repoDot}
                    style={{ background: repoColor(repo, repoColors) }}
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

              {repoSessions.map((session, i) => (
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

      {menu && (
        <>
          <div
            className={styles.menuOverlay}
            onClick={closeMenu}
            onContextMenu={(event) => {
              event.preventDefault();
              closeMenu();
            }}
          />
          <div
            className={styles.menu}
            style={{ left: menu.x, top: menu.y }}
            role="menu"
          >
            {menuMode === "color" ? (
              <div className={styles.colorPicker}>
                <div className={styles.swatches}>
                  {REPO_PALETTE.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      className={`${styles.swatch} ${repoColor(menu.repo, repoColors) === hex ? styles.swatchActive : ""}`}
                      style={{ background: hex }}
                      onClick={() => {
                        void setRepoColor(menu.repo, hex);
                        closeMenu();
                      }}
                      title={hex}
                      aria-label={`Set color ${hex}`}
                    />
                  ))}
                </div>
                <label className={styles.customColor}>
                  <span>Custom</span>
                  <input
                    type="color"
                    value={repoColor(menu.repo, repoColors)}
                    onChange={(event) =>
                      void setRepoColor(menu.repo, event.currentTarget.value)
                    }
                  />
                </label>
              </div>
            ) : menuMode === "confirm" ? (
              <button
                type="button"
                role="menuitem"
                className={styles.menuDanger}
                onClick={() => {
                  void forgetRepo(menu.repo);
                  closeMenu();
                }}
              >
                Kill {menuRunning} agent{menuRunning === 1 ? "" : "s"} & forget?
              </button>
            ) : (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => setMenuMode("color")}
                >
                  Change color…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    // Confirm first only when agents are running in this folder.
                    if (menuRunning > 0) setMenuMode("confirm");
                    else {
                      void forgetRepo(menu.repo);
                      closeMenu();
                    }
                  }}
                >
                  Forget folder
                </button>
              </>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

export default Sidebar;
