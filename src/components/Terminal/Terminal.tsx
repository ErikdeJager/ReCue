import { useEffect, useRef } from "react";

import { useStore } from "../../store";
import { mountTerminal, resetTerminal, unmountTerminal } from "./terminalPool";
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
 */
function Terminal({ sessionId, repoPath }: TerminalProps) {
  const slotRef = useRef<HTMLDivElement>(null);
  // A terminal item (#72) is a non-agent PTY: it isn't in `sessions`, so its
  // exit state lives in `terminalExits` and Restart respawns the shell.
  const isItem = repoPath !== undefined;
  const session = useStore((s) => s.sessions.find((x) => x.id === sessionId));
  const terminalExit = useStore((s) => s.terminalExits[sessionId]);
  const restartSession = useStore((s) => s.restartSession);
  const restartTerminal = useStore((s) => s.restartTerminal);

  const exitedCode = isItem ? terminalExit : session?.exitedCode;
  const reconnecting = isItem ? false : session?.reconnecting;

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    mountTerminal(sessionId, slot);
    return () => unmountTerminal(sessionId, slot);
  }, [sessionId]);

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
    <div className={styles.wrapper}>
      <div ref={slotRef} className={styles.slot} />
      {exitedCode === undefined && reconnecting && (
        <div className={styles.exitOverlay}>
          <p className={styles.exitText}>Reconnecting…</p>
        </div>
      )}
      {exitedCode !== undefined && (
        <div className={styles.exitOverlay}>
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
