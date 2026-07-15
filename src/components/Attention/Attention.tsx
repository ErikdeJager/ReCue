import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { CheckCheck, Inbox, Maximize2, X } from "lucide-react";

import { effectiveRepo, repoName, sessionLabel } from "../../paths";
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
  active: boolean;
  confirmDestructive: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

/** One idle-agent card in the triage queue. The yellow "awaiting" dot, the agent name,
 * its repo · branch, its working-tree +/- stat, an IDLE marker + idle age, and a hover
 * × that does the destructive Remove (kill + forget) — confirm-gated with an inline
 * two-step arm when `confirmDestructive` is on (#103), matching the sidebar pattern. */
function QueueCard({
  primary,
  metaLine,
  counts,
  showDiffLineCounts,
  idleLabel,
  active,
  confirmDestructive,
  onSelect,
  onRemove,
}: QueueCardProps) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | null>(null);
  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };
  // Auto-disarm on unmount so a stale timer never fires into a gone component.
  useEffect(() => clearTimer, []);

  const disarm = () => {
    clearTimer();
    setArmed(false);
  };

  const handleRemove = (event: ReactMouseEvent) => {
    event.stopPropagation(); // don't also select the card
    if (confirmDestructive && !armed) {
      setArmed(true);
      clearTimer();
      timer.current = window.setTimeout(() => setArmed(false), 2500);
      return;
    }
    disarm();
    onRemove();
  };

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
      <BusyIndicator busy={false} hasBeenActive />
      <div className={styles.cardInfo}>
        <span className={styles.cardName}>{primary}</span>
        <span className={styles.cardMeta}>{metaLine}</span>
        <span className={styles.cardFooter}>
          <span className={styles.idleTag}>IDLE</span>
          {idleLabel && <span className={styles.idleAge}>{idleLabel}</span>}
          <DiffStat counts={counts} enabled={showDiffLineCounts} />
        </span>
      </div>
      <button
        type="button"
        className={`${styles.cardRemove} ${armed ? styles.cardRemoveArmed : ""}`}
        onClick={handleRemove}
        onBlur={disarm}
        title={
          armed
            ? "Click again to remove (kill + forget)"
            : "Remove (kill + forget)"
        }
        aria-label="Remove session"
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}

/**
 * The **Attention** view (#398): a FIFO triage queue for agents that have gone idle and
 * likely need the user (an active-but-idle "awaiting" agent, #112). Oldest-idle first.
 *
 * Two panes over the shared wave background (transparent, like Overview): a middle
 * **queue** of idle-agent cards and a right **agent** pane showing the selected agent's
 * real live pooled terminal — rendered ONLY through the shared {@link ItemContent} (#157),
 * so the #18 terminal pool + #84 ownership guard apply exactly as everywhere else (a
 * PTY owned by a detached window shows a DetachedNote automatically). There is no
 * reply/input box — the user types straight into the terminal.
 *
 * Selection is the shared `selectedId`, so ⌘E (big mode), the sidebar highlight, and the
 * Shift+↑/↓ queue nav (`useKeyboardNav`) all cooperate; ⌘⏎ dismisses the selected agent.
 */
function Attention() {
  const sessions = useStore((s) => s.sessions);
  const sessionBusy = useStore((s) => s.sessionBusy);
  const sessionActive = useStore((s) => s.sessionActive);
  const dismissedAttention = useStore((s) => s.dismissedAttention);
  const sessionIdleSince = useStore((s) => s.sessionIdleSince);
  const recurrings = useStore((s) => s.recurrings);
  const selectedId = useStore((s) => s.selectedId);
  const branches = useStore((s) => s.branches);
  const diffLineCounts = useStore((s) => s.diffLineCounts);
  const autoNameOn = useStore((s) => s.settings.autoName);
  const showDiffLineCounts = useStore((s) => s.settings.showDiffLineCounts);
  const confirmDestructive = useStore((s) => s.settings.confirmDestructive);
  const select = useStore((s) => s.select);
  const dismissAllAttention = useStore((s) => s.dismissAllAttention);
  const removeSession = useStore((s) => s.removeSession);
  const maximizeItem = useStore((s) => s.maximizeItem);
  const bigModeKey = useKeybindLabel("big-mode");

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
        idleSince: sessionIdleSince,
        recurringChildIds,
      }),
    [
      sessions,
      sessionBusy,
      sessionActive,
      dismissedAttention,
      sessionIdleSince,
      recurringChildIds,
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
            idle
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
        {queue.length === 0 ? (
          <div className={styles.empty}>
            <Inbox size={30} strokeWidth={1.5} aria-hidden />
            <span className={styles.emptyTitle}>All caught up</span>
            <span className={styles.emptyHint}>
              No agents are waiting on you.
            </span>
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
                  active={session.id === activeId}
                  confirmDestructive={confirmDestructive}
                  onSelect={() => select(session.id)}
                  onRemove={() => void removeSession(session.id)}
                />
              );
            })}
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
