import { useEffect, useMemo, useState } from "react";
import { Code2, Eye } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { noAutoCapitalize } from "../../inputProps";
import { kbdHint } from "../../platform";
import { useStore } from "../../store";
import { useAutoSaveFile } from "../../useAutoSaveFile";
import {
  makeCheckboxComponents,
  rehypeTaskListPositions,
} from "../markdownCheckboxes";
import { detectMode, prismLang } from "./fileType";
import { highlightToHtml } from "./prism";
import styles from "./FileViewer.module.css";

// Above this, skip render/highlight and show plain raw text so a big file can't
// jank — and keep it read-only (no editing), for perf (#148).
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
 * Universal file viewer (#44) — the single content component reused by Overview
 * columns (#41) and Canvas panels (#47). Markdown renders formatted with an
 * eye/code toggle to raw; curated code files get lightweight Prism highlighting;
 * everything else is raw mono. Reads + hot-reloads via the shared
 * `useAutoSaveFile` hook (#148). In **markdown Raw** mode or for a **plain-text**
 * file (and not too large), the raw view is an **editable** monospace textarea
 * that **auto-saves** debounced (#148, no save button); rendered markdown, the
 * Prism code view, and large files stay read-only. No `rehype-raw`, so untrusted
 * markdown can't inject HTML.
 */
function FileViewer({ repoPath, file, active }: FileViewerProps) {
  const {
    text,
    error,
    status,
    setText,
    dirty,
    manual,
    save,
    onFocus,
    onBlur,
    onCompositionStart,
    onCompositionEnd,
  } = useAutoSaveFile(repoPath, file, active);
  const platform = useStore((s) => s.platform);
  const [showRaw, setShowRaw] = useState(false);

  const mode = detectMode(file);

  // Reset the raw toggle per file.
  useEffect(() => setShowRaw(false), [file]);

  // Clickable task-list checkboxes in the rendered markdown (#173): a toggle flips
  // the source marker and routes through `setText` (so the #162 save mode applies).
  // Memoized on the buffer so the map isn't rebuilt every render. `setText` is stable.
  const markdownComponents = useMemo(
    () =>
      makeCheckboxComponents({
        source: text ?? "",
        interactive: true,
        onToggle: setText,
      }),
    [text, setText],
  );

  if (error) {
    return <div className={styles.message}>Couldn’t read {file}.</div>;
  }
  if (text === null) {
    return <div className={styles.message}>Loading…</div>;
  }

  const tooLarge = text.length > LARGE_BYTES;
  const renderMarkdown = mode === "markdown" && !showRaw && !tooLarge;
  const lang = mode === "code" && !tooLarge ? prismLang(file) : undefined;
  // Editable raw text (#148): markdown in Raw mode or a plain-text file, not too
  // large. Rendered markdown, the Prism code view, and large files stay read-only.
  const editable =
    !tooLarge && ((mode === "markdown" && showRaw) || mode === "text");
  // Rendered markdown is now writable too (#173, clickable checkboxes), so the
  // toolbar's save/status surfaces for any non-large markdown/text file — not just
  // the raw/text textarea (`editable`). The textarea itself stays gated by `editable`.
  const writable = !tooLarge && (mode === "markdown" || mode === "text");
  const showToolbar = (mode === "markdown" && !tooLarge) || editable;

  return (
    <div className={styles.viewer}>
      {showToolbar && (
        <div className={styles.toolbar}>
          {/* Auto mode (#148): a subtle "Saving…/Saved" hint. Manual mode (#162):
              a Save button in its place (enabled when dirty). Its margin-right:auto
              keeps the Rendered/Raw toggle on the right when both show. */}
          {writable && manual ? (
            <button
              type="button"
              className={styles.saveBtn}
              onClick={() => save()}
              disabled={!dirty}
              title={
                dirty ? `Save (${kbdHint(platform, "⌘S", "Ctrl+S")})` : "Saved"
              }
            >
              {dirty ? "Save" : "Saved"}
            </button>
          ) : (
            writable &&
            status !== "idle" && (
              <span className={styles.status} role="status">
                {status === "saving"
                  ? "Saving…"
                  : status === "saved"
                    ? "Saved"
                    : "Save failed"}
              </span>
            )
          )}
          {/* The eye/code toggle is markdown-only (rendered ↔ raw source). Two
              segments always shown with the active highlighted (#73). */}
          {mode === "markdown" && !tooLarge && (
            <div
              className={styles.segmented}
              role="group"
              aria-label="View mode"
            >
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
          )}
        </div>
      )}
      {tooLarge && (
        <div className={styles.notice}>Large file — showing raw text.</div>
      )}
      {renderMarkdown ? (
        <div className={styles.markdown}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeTaskListPositions]}
            components={markdownComponents}
          >
            {text}
          </ReactMarkdown>
        </div>
      ) : lang ? (
        <CodeBlock code={text} lang={lang} />
      ) : editable ? (
        // Editable raw text, auto-saving via the hook (#148).
        <textarea
          className={styles.editor}
          {...noAutoCapitalize}
          value={text}
          spellCheck={false}
          onChange={(event) => setText(event.currentTarget.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          aria-label={`Edit ${file}`}
        />
      ) : (
        <pre className={styles.raw}>{text}</pre>
      )}
    </div>
  );
}

export default FileViewer;
