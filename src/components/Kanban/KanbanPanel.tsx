import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { readTextFile } from "../../ipc";
import { type Board, parseBoard } from "./kanban";
import styles from "./KanbanPanel.module.css";

// Hot-reload poll while visible (the #44 FileViewer pattern) so an external edit
// — the user, or later an AI/claude editing the same `.md` — updates the board.
const POLL_MS = 1000;

interface KanbanPanelProps {
  repoPath: string;
  /** Repo-relative `.md` board path. */
  file: string;
  /** Only fetch/poll while shown. */
  active: boolean;
}

/**
 * Read-only Kanban board (#142): reads the `.md` via `readTextFile`, parses it
 * with #141's `parseBoard`, and lays out the columns left-to-right (the strip
 * scrolls horizontally when many columns / the panel is narrow), each with its
 * cards. A card shows its title and renders its markdown **body** via the
 * react-markdown + remark-gfm stack (#44, no raw HTML) — display focuses on text
 * formatting, so a card with no body shows nothing extra. Hot-reloads by polling
 * while visible, bailing when the content is unchanged (preserves scroll).
 * Editing + write-back is #143.
 */
function KanbanPanel({ repoPath, file, active }: KanbanPanelProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(
    async (silent = false) => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const next = await readTextFile(repoPath, file);
        setError(false);
        // The raw text doubles as the change signature: an unchanged poll returns
        // the same string so React bails (no re-parse / re-render), preserving
        // scroll. We re-parse only when the content actually changed.
        setContent((cur) => (cur === next ? cur : next));
      } catch {
        if (!silent) {
          setContent(null);
          setError(true);
        }
      } finally {
        inFlight.current = false;
      }
    },
    [repoPath, file],
  );

  // Fetch when shown / on file change.
  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  // Poll for hot-reload while visible; pause when hidden, catch up on regain.
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (timer === undefined && !document.hidden) {
        timer = setInterval(() => void load(true), POLL_MS);
      }
    };
    const stop = () => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        void load(true);
        start();
      }
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, load]);

  const board: Board | null = useMemo(
    () => (content === null ? null : parseBoard(content)),
    [content],
  );

  if (error) {
    return <div className={styles.message}>Couldn’t read {file}.</div>;
  }
  if (content === null || board === null) {
    return <div className={styles.message}>Loading…</div>;
  }
  if (board.columns.length === 0) {
    // A `.md` with no kanban structure renders as an empty board — authoring it
    // (adding columns/cards + writing back) is #143.
    return <div className={styles.message}>No board columns yet.</div>;
  }

  return (
    <div className={styles.board}>
      {board.columns.map((col, ci) => (
        <section className={styles.column} key={`${col.name}-${ci}`}>
          <header className={styles.columnHeader}>
            <span className={styles.columnName}>{col.name}</span>
            <span className={styles.count}>{col.cards.length}</span>
          </header>
          <div className={styles.cards}>
            {col.cards.length === 0 ? (
              <div className={styles.empty}>No cards</div>
            ) : (
              col.cards.map((card, idx) => (
                <article
                  key={idx}
                  className={`${styles.card} ${card.checked ? styles.cardDone : ""}`}
                >
                  <div className={styles.cardTitle}>
                    {card.title.trim() || (
                      <span className={styles.untitled}>Untitled</span>
                    )}
                  </div>
                  {card.body.trim() && (
                    <div className={styles.cardBody}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {card.body}
                      </ReactMarkdown>
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

export default KanbanPanel;
