import { Eye, EyeOff } from "lucide-react";

import { ensureNotificationPermission } from "../../notify";
import { useStore } from "../../store";
import type { SessionView } from "../../types";

import styles from "./WatchButton.module.css";

interface WatchButtonProps {
  session: SessionView;
  /** Base class from the host surface (Overview `styles.action` / Canvas
   * `styles.panelClose`) so sizing + hover match the sibling header buttons. */
  className?: string;
  /** Icon size in px (Overview uses 15, Canvas 14 — matching their siblings). */
  iconSize?: number;
}

/**
 * Per-agent "watch" toggle (#336) — a small reusable header icon button. When watch
 * is on, a native OS notification pops up each time this agent finishes a turn / needs
 * input (its busy→idle edge, fired from `store.setBusy`). Reflects the session's
 * persisted `watch` flag (Eye = watched/accent, EyeOff = muted) and flips it via
 * `toggleWatch`, staying in sync with the sidebar context-menu item (same store flag).
 *
 * Opt-in ensures notification permission at click time (`ensureNotificationPermission`)
 * so the OS prompt appears when the user first asks to watch, not on the first edge.
 * Frontend-only + platform-neutral, so it behaves identically on macOS and Windows.
 */
function WatchButton({ session, className, iconSize = 15 }: WatchButtonProps) {
  const toggleWatch = useStore((s) => s.toggleWatch);
  const watched = session.watch ?? false;

  return (
    <button
      type="button"
      // stopPropagation/preventDefault on pointerdown so a click can't start the
      // Overview card / #144 Canvas header drag (both wire drag listeners on the
      // header this sits inside) — the same guard AutoContinueToggle uses.
      onPointerDown={(event) => {
        event.stopPropagation();
        event.preventDefault();
      }}
      onClick={() => {
        toggleWatch(session.id);
        // Ensure permission at opt-in time; a no-op when turning watch off (harmless).
        if (!watched) void ensureNotificationPermission();
      }}
      className={`${className ?? ""} ${watched ? styles.active : ""}`.trim()}
      aria-pressed={watched}
      title={
        watched
          ? "Stop watching this agent"
          : "Watch: notify when this agent finishes or needs input"
      }
      aria-label={watched ? "Stop watching agent" : "Watch agent"}
    >
      {watched ? (
        <Eye size={iconSize} strokeWidth={1.5} color="var(--accent)" />
      ) : (
        <EyeOff size={iconSize} strokeWidth={1.5} />
      )}
    </button>
  );
}

export default WatchButton;
