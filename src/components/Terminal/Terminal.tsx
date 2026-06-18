import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";

import { resizePty, sessionScrollback, writeStdin } from "../../ipc";
import { onSessionOutput } from "../../outputBus";
import { useStore } from "../../store";
import styles from "./Terminal.module.css";

interface TerminalProps {
  sessionId: string;
}

function cssToken(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

/**
 * Reusable, presentation-only terminal bound to a single session id. Renders the
 * live PTY stream (via the output bus), replays server-side scrollback on mount,
 * sends keystrokes to stdin, and keeps the PTY sized to its container. Embedded
 * by the Overview wall (#11) and Focus view (#12).
 */
function Terminal({ sessionId }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const exitedCode = useStore(
    (s) => s.sessions.find((x) => x.id === sessionId)?.exitedCode,
  );
  const restartSession = useStore((s) => s.restartSession);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      fontFamily: cssToken(
        "--mono",
        '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
      ),
      fontSize: 12.5,
      lineHeight: 1.5,
      cursorBlink: true,
      allowProposedApi: true,
      theme: {
        background: cssToken("--terminal-bg", "#0e0e10"),
        foreground: cssToken("--text-primary", "#ededef"),
        cursor: cssToken("--accent", "#d97757"),
        cursorAccent: cssToken("--terminal-bg", "#0e0e10"),
        selectionBackground: "rgba(217, 119, 87, 0.25)",
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);

    // Best-effort GPU renderer; fall back to the default DOM renderer.
    let webgl: WebglAddon | undefined;
    try {
      const addon = new WebglAddon();
      addon.onContextLoss(() => addon.dispose());
      term.loadAddon(addon);
      webgl = addon;
    } catch {
      webgl = undefined;
    }

    const safeFit = () => {
      try {
        fit.fit();
      } catch {
        // container not measurable yet (e.g. hidden); ignore
      }
    };
    safeFit();
    void document.fonts?.ready.then(safeFit);

    // Keystrokes / paste -> stdin. Ignore rejections (e.g. a session whose PTY
    // is still resuming in the background after boot).
    const dataSub = term.onData((data) => {
      void writeStdin(sessionId, data).catch(() => {});
    });

    // Buffer live output until the historical scrollback has been replayed, so
    // history and live bytes do not interleave.
    let replayed = false;
    const pending: Uint8Array[] = [];
    const unsubscribe = onSessionOutput(sessionId, (bytes) => {
      if (replayed) term.write(bytes);
      else pending.push(bytes);
    });

    let disposed = false;
    void sessionScrollback(sessionId)
      .then((bytes) => {
        if (!disposed && bytes.length) term.write(Uint8Array.from(bytes));
      })
      .catch(() => {
        // no scrollback / backend unavailable
      })
      .finally(() => {
        if (disposed) return;
        for (const chunk of pending) term.write(chunk);
        pending.length = 0;
        replayed = true;
      });

    // Keep the PTY sized to the container.
    const observer = new ResizeObserver(() => {
      safeFit();
      void resizePty(sessionId, term.cols, term.rows).catch(() => {});
    });
    observer.observe(container);
    void resizePty(sessionId, term.cols, term.rows);

    return () => {
      disposed = true;
      observer.disconnect();
      unsubscribe();
      dataSub.dispose();
      webgl?.dispose();
      term.dispose();
    };
  }, [sessionId]);

  return (
    <div className={styles.wrapper}>
      <div ref={containerRef} className={styles.terminal} />
      {exitedCode !== undefined && (
        <div className={styles.exitOverlay}>
          <p className={styles.exitText}>
            Process exited{exitedCode != null ? ` (code ${exitedCode})` : ""}
          </p>
          <button
            type="button"
            className={styles.restart}
            onClick={() => void restartSession(sessionId)}
          >
            Restart
          </button>
        </div>
      )}
    </div>
  );
}

export default Terminal;
