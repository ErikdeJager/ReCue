import { useEffect, useRef } from "react";

import { useStore } from "../../store";
import { mountTerminal, resetTerminal, unmountTerminal } from "./terminalPool";
import styles from "./Terminal.module.css";

interface TerminalProps {
  sessionId: string;
}

/**
 * Presentation-only terminal bound to a single session id. The xterm instance
 * itself is owned by the persistent terminal pool (see `terminalPool.ts`); this
 * component is just the *slot* the pool reparents the live terminal node into
 * while the session is shown here. Because the instance outlives this
 * component, switching Overview↔Focus reparents (never disposes/recreates) the
 * terminal — no scrollback replay, no garbled redraw. Embedded by the Overview
 * wall (#11) and Focus view (#12).
 */
function Terminal({ sessionId }: TerminalProps) {
  const slotRef = useRef<HTMLDivElement>(null);
  const session = useStore((s) => s.sessions.find((x) => x.id === sessionId));
  const exitedCode = session?.exitedCode;
  const reconnecting = session?.reconnecting;
  const restartSession = useStore((s) => s.restartSession);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    mountTerminal(sessionId, slot);
    return () => unmountTerminal(sessionId, slot);
  }, [sessionId]);

  // Restart (#63): resume the backend PTY, then — only on success — reset the
  // pooled terminal so the relaunched `claude --resume` repaints into a clean
  // xterm instead of appending onto the dead session's last screen.
  const handleRestart = async () => {
    if (await restartSession(sessionId)) resetTerminal(sessionId);
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
