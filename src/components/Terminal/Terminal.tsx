import { useEffect, useRef } from "react";

import { useStore } from "../../store";
import { mountTerminal, resetTerminal, unmountTerminal } from "./terminalPool";
import { useVisibleOnce } from "./useVisibleOnce";
import styles from "./Terminal.module.css";

interface TerminalProps {
  sessionId: string;
  /** Set for a plain terminal item (#72): marks this a non-agent PTY (no claude
   * resume) and supplies the shell's cwd so Restart can respawn it. */
  repoPath?: string;
}

/**
 * Presentation-only terminal bound to a single PTY id. The xterm instance is
 * owned by the persistent terminal pool (`terminalPool.ts`); this component is
 * just the *slot* the pool reparents the live node into while the PTY is shown
 * here. Because the instance outlives this component, switching views reparents
 * (never disposes/recreates) the terminal — no scrollback replay, no garbled
 * redraw. Embedded by the Overview wall (#11), Focus (#12), Canvas (#47), and —
 * for plain shell terminal items — repo terminal panels (#72).
 *
 * The pool node is attached on **first visibility** (#351): the mount is gated by a
 * latching IntersectionObserver (`useVisibleOnce`, rooted at Overview's scrolling wall),
 * so an off-screen card costs nothing at boot. The gate only defers *creation* — once a
 * terminal exists it is still never disposed on a scroll-out or a view switch (#18).
 * The exit / reconnecting overlays below are plain React and render regardless, so an
 * exited off-screen agent still shows its overlay + Restart when it is scrolled to.
 */
function Terminal({ sessionId, repoPath }: TerminalProps) {
  const slotRef = useRef<HTMLDivElement>(null);
  // The wrapper always has a laid-out box (the slot can be 0×0 before xterm opens in it),
  // so it is what the visibility observer watches.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const visible = useVisibleOnce(wrapperRef);
  // A terminal item (#72) is a non-agent PTY: it isn't in `sessions`, so its
  // exit state lives in `terminalExits` and Restart respawns the shell.
  const isItem = repoPath !== undefined;
  const session = useStore((s) => s.sessions.find((x) => x.id === sessionId));
  const terminalExit = useStore((s) => s.terminalExits[sessionId]);
  const restartSession = useStore((s) => s.restartSession);
  const restartTerminal = useStore((s) => s.restartTerminal);

  const exitedCode = isItem ? terminalExit : session?.exitedCode;
  const reconnecting = isItem ? false : session?.reconnecting;

  // Create + attach the pooled terminal only once this card/panel is actually visible
  // (#351). `unmountTerminal` no-ops for a session with no host, so an un-gated card
  // unmounting (view switch, big mode) stays safe.
  useEffect(() => {
    if (!visible) return;
    const slot = slotRef.current;
    if (!slot) return;
    mountTerminal(sessionId, slot);
    return () => unmountTerminal(sessionId, slot);
  }, [sessionId, visible]);

  // Restart: an agent resumes via `claude --resume` (#63); a terminal item (#72)
  // respawns its shell. On success, reset the pooled terminal so the relaunched
  // PTY repaints into a clean xterm instead of the dead session's last screen.
  const handleRestart = async () => {
    const ok =
      isItem && repoPath
        ? await restartTerminal(sessionId, repoPath)
        : await restartSession(sessionId);
    if (ok) resetTerminal(sessionId);
  };

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <div ref={slotRef} className={styles.slot} />
      {exitedCode === undefined && reconnecting && (
        <div className={styles.exitOverlay} role="status">
          <p className={styles.exitText}>Reconnecting…</p>
        </div>
      )}
      {exitedCode !== undefined && (
        <div className={styles.exitOverlay} role="alert">
          <p className={styles.exitText}>
            Process exited{exitedCode != null ? ` (code ${exitedCode})` : ""}
          </p>
          <button
            type="button"
            className={styles.restart}
            onClick={() => void handleRestart()}
          >
            Restart
          </button>
        </div>
      )}
    </div>
  );
}

export default Terminal;
