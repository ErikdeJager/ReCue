import { useEffect, useRef, useState } from "react";
import { Copy, Eye, EyeOff, GitFork, MoreHorizontal } from "lucide-react";

import { agentSupportsResume } from "../../agents";
import { ensureNotificationPermission } from "../../notify";
import { forkUnavailableReason } from "../../paths";
import { useStore } from "../../store";
import type { SessionView } from "../../types";

import styles from "./AgentHeaderMenu.module.css";

/**
 * The shared **"…" (more-actions) menu** (#340) for an agent panel header. It folds
 * the three secondary agent actions — **Fork conversation** (#126/#138/#142), **Copy
 * resume command** (#28), and the per-agent **Watch** toggle (#336) — from separate
 * always-visible icon buttons into one dropdown, so the Overview card / Canvas panel /
 * Big-mode header stays uncluttered while all three stay one click away. Rendered
 * identically at every agent-header site (one source of truth).
 *
 * Modeled on {@link ../ViewsMenu/ViewsPopover} — a self-contained popover host that
 * dismisses on outside `mousedown` + `Escape` and stops `pointerdown` on its root so
 * opening it never starts the Overview card (#70) / Canvas move-leaf (#144) drag.
 *
 * Gating preserved from the old inline buttons:
 * - **Fork** is disabled (dimmed, `aria-disabled`, no-op click) when
 *   `forkUnavailableReason(session)` is non-null — the source has no on-disk turn yet
 *   (#138) or the agent can't fork at all (Codex/OpenCode/Custom, #142); the reason is
 *   the hover tooltip. `aria-disabled` (not the native `disabled`) keeps the tooltip.
 * - **Copy resume command** is rendered **only** when `agentSupportsResume(agent)`.
 *
 * Frontend-only + platform-neutral, so it behaves identically on macOS and Windows.
 */
function AgentHeaderMenu({
  session,
  className,
  iconSize = 15,
  align = "right",
}: {
  session: SessionView;
  /** Base class from the host surface (Overview `styles.action` / Canvas
   * `styles.panelClose` / Big-mode `styles.close`) so the trigger matches its
   * sibling header icon buttons. */
  className?: string;
  /** Trigger icon size in px (Overview 15 / Canvas 14 / Big mode 16). */
  iconSize?: number;
  /** Which edge the popover anchors to — "right" for a right-placed header action
   * button (the default), "left" otherwise, so it stays on-screen. */
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  const forkSession = useStore((s) => s.forkSession);
  const copyToClipboard = useStore((s) => s.copyToClipboard);
  const toggleWatch = useStore((s) => s.toggleWatch);

  const forkReason = forkUnavailableReason(session);
  const canFork = forkReason === null;
  const canResume = agentSupportsResume(session.agent);
  const watched = session.watch ?? false;

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span
      ref={rootRef}
      className={styles.root}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={className}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="More actions"
        aria-label="More actions"
      >
        <MoreHorizontal size={iconSize} strokeWidth={1.5} />
      </button>
      {open && (
        <div
          className={`${styles.popover} ${align === "left" ? styles.alignLeft : styles.alignRight}`}
          role="menu"
          aria-label="Agent actions"
        >
          {/* Fork the conversation into a new parallel session (#126); gated
              (#138/#142) — a disabled item is aria-disabled (not native `disabled`,
              so the reason tooltip still shows) with a no-op click. */}
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            aria-disabled={!canFork}
            title={
              forkReason ?? "Fork conversation into a new parallel session"
            }
            onClick={() => {
              if (canFork) {
                void forkSession(session.id);
                setOpen(false);
              }
            }}
          >
            <GitFork size={14} strokeWidth={1.5} className={styles.icon} />
            Fork conversation
          </button>
          {/* Copy `claude --resume <id>` (#28) — only for agents that resume by id. */}
          {canResume && (
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              title="Copy resume command (claude --resume <id>)"
              onClick={() => {
                void copyToClipboard(
                  `claude --resume ${session.id}`,
                  "resume command",
                );
                setOpen(false);
              }}
            >
              <Copy size={14} strokeWidth={1.5} className={styles.icon} />
              Copy resume command
            </button>
          )}
          <div className={styles.sep} role="separator" />
          {/* Per-agent "watch" toggle (#336) — notify on this agent's busy→idle edge;
              ensures notification permission at opt-in time (mirroring WatchButton). */}
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            title={
              watched
                ? "Stop watching this agent"
                : "Watch: notify when this agent finishes or needs input"
            }
            onClick={() => {
              toggleWatch(session.id);
              if (!watched) void ensureNotificationPermission();
              setOpen(false);
            }}
          >
            {watched ? (
              <Eye
                size={14}
                strokeWidth={1.5}
                className={styles.icon}
                color="var(--accent)"
              />
            ) : (
              <EyeOff size={14} strokeWidth={1.5} className={styles.icon} />
            )}
            {watched ? "Stop watching" : "Watch"}
          </button>
        </div>
      )}
    </span>
  );
}

export default AgentHeaderMenu;
