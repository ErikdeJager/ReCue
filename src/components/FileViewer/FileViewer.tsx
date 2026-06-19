import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Code2, Eye } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { readTextFile } from "../../ipc";
import { detectMode, prismLang } from "./fileType";
import { highlightToHtml } from "./prism";
import styles from "./FileViewer.module.css";

// Hot-reload poll while visible (#40 pattern). ~1s feels live without hammering disk.
const POLL_MS = 1000;
// Above this, skip render/highlight and show plain raw text so a big file can't jank.
const LARGE_BYTES = 256 * 1024;

interface FileViewerProps {
  repoPath: string;
  /** Repo-relative file path. */
  file: string;
  /** Only fetch/poll while shown. */
  active: boolean;
}

/** Read-only Prism-highlighted code (#44). Prism escapes the source, so the
 * injected markup is its own token spans only — no raw file HTML. */
function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const html = useMemo(() => highlightToHtml(code, lang), [code, lang]);
  return (
    <pre className={`${styles.raw} ${styles.code}`}>
      <code
        className={`language-${lang}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </pre>
  );
}

/**
 * Universal read-only file viewer (#44) — the single content component reused by
 * the Focus inspector (#40), Overview columns (#41), and Canvas panels (#47).
 * Markdown renders formatted with an eye/code toggle to raw; curated code files
 * get lightweight Prism highlighting; everything else is raw mono. Hot-reloads
 * by polling while visible and only re-renders when the content actually changed
 * (preserves scroll otherwise). No `rehype-raw`, so untrusted markdown can't
 * inject HTML. Large files fall back to raw text to stay smooth.
 */
function FileViewer({ repoPath, file, active }: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const inFlight = useRef(false);

  const mode = detectMode(file);

  const load = useCallback(
    async (silent = false) => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const next = await readTextFile(repoPath, file);
        setError(false);
        // The content doubles as the change signature: returning the same string
        // makes React bail out (no re-render), so scroll is preserved on an
        // unchanged poll.
        setContent((cur) => (cur === next ? cur : next));
      } catch {
        // A transient poll failure keeps the last good content; an explicit load
        // surfaces the error.
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

  // Fetch when shown / on file change; reset the raw toggle per file.
  useEffect(() => {
    if (active) void load();
  }, [active, load]);
  useEffect(() => setShowRaw(false), [file]);

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

  if (error) {
    return <div className={styles.message}>Couldn’t read {file}.</div>;
  }
  if (content === null) {
    return <div className={styles.message}>Loading…</div>;
  }

  const tooLarge = content.length > LARGE_BYTES;
  const renderMarkdown = mode === "markdown" && !showRaw && !tooLarge;
  const lang = mode === "code" && !tooLarge ? prismLang(file) : undefined;

  return (
    <div className={styles.viewer}>
      {/* The eye/code toggle is markdown-only (rendered ↔ raw source). */}
      {mode === "markdown" && !tooLarge && (
        <div className={styles.toolbar}>
          {/* Two-segment Rendered / Raw toggle (#73): both options always shown
              with the active one highlighted, so returning to the rendered view
              is obvious (the old lone corner icon read as one-way). */}
          <div className={styles.segmented} role="group" aria-label="View mode">
            <button
              type="button"
              className={`${styles.segment} ${!showRaw ? styles.segmentActive : ""}`}
              onClick={() => setShowRaw(false)}
              aria-pressed={!showRaw}
            >
              <Eye size={13} strokeWidth={1.5} />
              Rendered
            </button>
            <button
              type="button"
              className={`${styles.segment} ${showRaw ? styles.segmentActive : ""}`}
              onClick={() => setShowRaw(true)}
              aria-pressed={showRaw}
            >
              <Code2 size={13} strokeWidth={1.5} />
              Raw
            </button>
          </div>
        </div>
      )}
      {tooLarge && (
        <div className={styles.notice}>Large file — showing raw text.</div>
      )}
      {renderMarkdown ? (
        <div className={styles.markdown}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      ) : lang ? (
        <CodeBlock code={content} lang={lang} />
      ) : (
        <pre className={styles.raw}>{content}</pre>
      )}
    </div>
  );
}

export default FileViewer;
