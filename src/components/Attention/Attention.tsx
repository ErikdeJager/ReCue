import { useEffect, useMemo, useState } from "react";
import { CheckCheck, Inbox, Maximize2, X } from "lucide-react";

import { effectiveRepo, repoName, sessionLabel } from "../../paths";
import { kbdHint } from "../../platform";
import { ownedChildSessionIds, useStore } from "../../store";
import { useKeybindLabel } from "../../useKeybind";
import type { DiffLineCounts, SessionView } from "../../types";
import AgentHeaderMenu from "../AgentHeaderMenu/AgentHeaderMenu";
import BusyIndicator from "../BusyIndicator/BusyIndicator";
import { diffCountBadge } from "../Sidebar/diffCounts";
import ItemContent from "../ItemContent/ItemContent";
import { attentionQueue, formatIdleAge } from "./attentionQueue";
import styles from "./Attention.module.css";

/** The compact green `+A` / red `−D` working-tree line-count stat (#335), reused in the
 * queue card and the right-pane header. Renders nothing when there's no badge. */
function DiffStat({
  counts,
  enabled,
}: {
  counts: DiffLineCounts | undefined;
  enabled: boolean;
}) {
  const badge = diffCountBadge(counts, enabled);
  if (!badge) return null;
  return (
    <span
      className={styles.diffStat}
      aria-label={`${badge.added} added, ${badge.removed} removed lines`}
    >
      {badge.added > 0 && (
        <span className={styles.diffAdd}>+{badge.added}</span>
      )}
      {badge.removed > 0 && (
        <span className={styles.diffDel}>−{badge.removed}</span>
      )}
    </span>
  );
}

interface QueueCardProps {
  primary: string;
  metaLine: string;
  counts: DiffLineCounts | undefined;
  showDiffLineCounts: boolean;
  idleLabel: string;
  hasBeenActive: boolean;
  active: boolean;
  onSelect: () => void;
}

/** One waiting-agent card in the triage queue: a busy dot (yellow "awaiting" once the
 * agent has worked, gray "NEW" while it never has — task 410), the agent name, its
 * repo · branch, its working-tree +/- stat, and an IDLE / NEW marker + idle age. A pure
 * select target — the destructive Remove (kill + forget) now lives in the right-pane
 * agent header (task 412), on the agent it acts on. */
function QueueCard({
  primary,
  metaLine,
  counts,
  showDiffLineCounts,
  idleLabel,
  hasBeenActive,
  active,
  onSelect,
}: QueueCardProps) {
  return (
    <div
      className={`${styles.card} ${active ? styles.cardActive : ""}`}
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <BusyIndicator busy={false} hasBeenActive={hasBeenActive} />
      <div className={styles.cardInfo}>
        <span className={styles.cardName}>{primary}</span>
        <span className={styles.cardMeta}>{metaLine}</span>
        <span className={styles.cardFooter}>
          {hasBeenActive ? (
            <span className={styles.idleTag}>IDLE</span>
          ) : (
            <span className={styles.newTag}>NEW</span>
          )}
          {idleLabel && <span className={styles.idleAge}>{idleLabel}</span>}
          <DiffStat counts={counts} enabled={showDiffLineCounts} />
        </span>
      </div>
    </div>
  );
}

/**
 * The **Attention** view (#398, expanded by task 410): a FIFO triage queue for every
 * agent that currently needs the user — a freshly **started** agent that hasn't worked
 * yet ("NEW") as well as an active-but-idle "awaiting" agent (#112, "IDLE"). It drops an
 * agent the moment it goes busy and re-surfaces it once the store's **admission grace**
 * (`ATTENTION_GRACE_MS`) confirms the settle — so a mid-turn output pause never flickers
 * a working agent's card in and out. Oldest wait first.
 *
 * Two panes over the shared wave background (transparent, like Overview): a middle
 * **queue** of idle-agent cards and a right **agent** pane showing the selected agent's
 * real live pooled terminal — rendered ONLY through the shared {@link ItemContent} (#157),
 * so the #18 terminal pool and its per-window guards apply exactly as everywhere
 * else. There is no reply/input box — the user types straight into the terminal.
 *
 * Selection is the shared `selectedId`, so ⌘E (big mode), the sidebar highlight, and the
 * Shift+↑/↓ queue nav (`useKeyboardNav`) all cooperate. The right-pane header × — and the
 * app-wide ⌘W (`closeFocusedPanel`) — REMOVE (kill + forget) the focused agent; ⌘⏎ only
 * dismisses it (leaves the queue, keeps the agent alive).
 */
function Attention() {
  const sessions = useStore((s) => s.sessions);
  const sessionBusy = useStore((s) => s.sessionBusy);
  const sessionActive = useStore((s) => s.sessionActive);
  const dismissedAttention = useStore((s) => s.dismissedAttention);
  const attentionEligible = useStore((s) => s.attentionEligible);
  const sessionIdleSince = useStore((s) => s.sessionIdleSince);
  const recurrings = useStore((s) => s.recurrings);
  const selectedId = useStore((s) => s.selectedId);
  const branches = useStore((s) => s.branches);
  const diffLineCounts = useStore((s) => s.diffLineCounts);
  const autoNameOn = useStore((s) => s.settings.autoName);
  const showDiffLineCounts = useStore((s) => s.settings.showDiffLineCounts);
  const platform = useStore((s) => s.platform);
  // The transient repo/folder/branch filter shared with the Overview wall (#34/#445) —
  // a sidebar folder/branch/worktree click narrows the queue exactly as it narrows
  // Overview, with a `Showing <repo>` indicator + `Show all` clear-button below.
  const filter = useStore((s) => s.overviewRepoFilter);
  const setOverviewRepoFilter = useStore((s) => s.setOverviewRepoFilter);
  const select = useStore((s) => s.select);
  const dismissAllAttention = useStore((s) => s.dismissAllAttention);
  const removeSession = useStore((s) => s.removeSession);
  const maximizeItem = useStore((s) => s.maximizeItem);
  const bigModeKey = useKeybindLabel("big-mode");
  const closePanelKey = useKeybindLabel("close-panel");

  const recurringChildIds = useMemo(
    () => ownedChildSessionIds(recurrings),
    [recurrings],
  );
  const queue = useMemo(
    () =>
      attentionQueue({
        sessions,
        sessionBusy,
        sessionActive,
        dismissed: dismissedAttention,
        eligible: attentionEligible,
        idleSince: sessionIdleSince,
        recurringChildIds,
        filter,
      }),
    [
      sessions,
      sessionBusy,
      sessionActive,
      dismissedAttention,
      attentionEligible,
      sessionIdleSince,
      recurringChildIds,
      filter,
    ],
  );

  // Effective selection: keep the shared selectedId when it's a queue member, else the
  // top of the queue (auto-select the oldest idle agent first).
  const activeId = queue.some((q) => q.id === selectedId)
    ? selectedId
    : (queue[0]?.id ?? null);

  // Reconcile the shared selection to the effective id — guarded so it only writes when
  // the two actually differ, so there's no set-state loop.
  useEffect(() => {
    if (selectedId !== activeId) select(activeId);
  }, [activeId, selectedId, select]);

  // Live idle-age labels: re-render every ~30s so "just now" → "Xm ago" ticks over.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const activeSession = queue.find((q) => q.id === activeId) ?? null;

  const labelFor = (session: SessionView) => {
    const branch = branches[session.repoPath] ?? "";
    const fallback = branch || repoName(session.repoPath);
    const { primary } = sessionLabel(
      session.name,
      autoNameOn ? session.autoName : null,
      fallback,
    );
    const metaLine = `${repoName(effectiveRepo(session))}${branch ? ` · ${branch}` : ""}`;
    return { primary, metaLine, branch };
  };

  const activeLabel = activeSession ? labelFor(activeSession) : null;

  return (
    <div className={styles.attention}>
      <div className={styles.queuePane}>
        <div className={styles.queueHeader}>
          <span className={styles.queueTitle}>
            Attention <span className={styles.queueDot}>·</span> {queue.length}{" "}
            waiting
          </span>
          {queue.length > 0 && (
            <button
              type="button"
              className={styles.dismissAll}
              onClick={() => dismissAllAttention()}
              title="Dismiss all"
              aria-label="Dismiss all"
            >
              <CheckCheck size={15} strokeWidth={1.5} />
            </button>
          )}
        </div>
        {/* Filter indicator (#445) — mirrors Overview's `.filterBar`. Rendered above
            both the queue list AND the empty block so the filter is always clearable.
            Only shown while a repo/folder/branch filter is set (shared with Overview). */}
        {filter && (
          <div className={styles.filterBar}>
            <span className={styles.filterLabel}>
              Showing <strong>{repoName(filter.path)}</strong>
              {/* "own" mode narrows to the repo's own branch — worktrees hidden. */}
              {filter.mode === "own" && " · this branch"}
            </span>
            <button
              type="button"
              className={styles.showAll}
              onClick={() => setOverviewRepoFilter(null)}
            >
              Show all
            </button>
          </div>
        )}
        {queue.length === 0 ? (
          <div className={styles.empty}>
            <Inbox size={30} strokeWidth={1.5} aria-hidden />
            {filter ? (
              <span className={styles.emptyTitle}>
                No agents waiting in {repoName(filter.path)}
              </span>
            ) : (
              <>
                <span className={styles.emptyTitle}>All caught up</span>
                <span className={styles.emptyHint}>
                  No agents are waiting on you.
                </span>
              </>
            )}
          </div>
        ) : (
          <div className={styles.queueList}>
            {queue.map((session) => {
              const { primary, metaLine } = labelFor(session);
              return (
                <QueueCard
                  key={session.id}
                  primary={primary}
                  metaLine={metaLine}
                  counts={diffLineCounts[session.repoPath]}
                  showDiffLineCounts={showDiffLineCounts}
                  idleLabel={formatIdleAge(sessionIdleSince[session.id], now)}
                  hasBeenActive={sessionActive[session.id] ?? false}
                  active={session.id === activeId}
                  onSelect={() => select(session.id)}
                />
              );
            })}
          </div>
        )}
        {/* Keybind tips for working the queue — only while there's something queued.
            Fixed contextual chords via kbdHint (the shortcuts.ts strings verbatim);
            rebindable actions via useKeybindLabel, hidden when unbound (""). */}
        {queue.length > 0 && (
          <div className={styles.queueFooter}>
            <span className={styles.footerItem}>
              <kbd className="kbd-chip">
                {kbdHint(platform, "⇧↑/↓", "Shift+↑/↓")}
              </kbd>
              navigate
            </span>
            <span className={styles.footerItem}>
              <kbd className="kbd-chip">
                {kbdHint(platform, "⌘⏎", "Ctrl+Enter")}
              </kbd>
              dismiss
            </span>
            {closePanelKey && (
              <span className={styles.footerItem}>
                <kbd className="kbd-chip">{closePanelKey}</kbd>
                remove
              </span>
            )}
            {bigModeKey && (
              <span className={styles.footerItem}>
                <kbd className="kbd-chip">{bigModeKey}</kbd>
                big mode
              </span>
            )}
          </div>
        )}
      </div>
      <div className={styles.agentPane}>
        {activeSession && activeLabel ? (
          <>
            <header className={styles.agentHeader}>
              <div className={styles.agentTitleBlock}>
                <span className={styles.agentName}>{activeLabel.primary}</span>
                <span className={styles.agentMeta}>
                  {activeLabel.metaLine}
                  <DiffStat
                    counts={diffLineCounts[activeSession.repoPath]}
                    enabled={showDiffLineCounts}
                  />
                </span>
              </div>
              <div className={styles.agentActions}>
                <AgentHeaderMenu
                  session={activeSession}
                  className={styles.action}
                  iconSize={15}
                />
                <button
                  type="button"
                  className={styles.action}
                  onClick={() =>
                    maximizeItem({
                      kind: "agent",
                      sessionId: activeSession.id,
                      repoPath: activeSession.repoPath,
                    })
                  }
                  title={
                    bigModeKey
                      ? `Open in big mode (${bigModeKey})`
                      : "Open in big mode"
                  }
                  aria-label="Open in big mode"
                >
                  <Maximize2 size={15} strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  className={`${styles.action} ${styles.actionDanger}`}
                  onClick={() => void removeSession(activeSession.id)}
                  title="Remove (kill + forget)"
                  aria-label="Remove session"
                >
                  <X size={15} strokeWidth={1.5} />
                </button>
              </div>
            </header>
            <div className={styles.agentBody}>
              <ItemContent
                content={{
                  kind: "agent",
                  sessionId: activeSession.id,
                  repoPath: activeSession.repoPath,
                }}
                active
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default Attention;
