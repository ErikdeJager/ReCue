import { useEffect, useMemo, useState } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { Copy, Eye, Terminal as TerminalIcon } from "lucide-react";
import type { Element, ElementContent } from "hast";
import ReactMarkdown from "react-markdown";
import type { ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";

import { noAutoCapitalize } from "../../inputProps";
import { kbdHint } from "../../platform";
import { useStore } from "../../store";
import { useAutoSaveFile } from "../../useAutoSaveFile";
import ClaimBanner from "../ClaimBanner/ClaimBanner";
import {
  makeCheckboxComponents,
  rehypeTaskListPositions,
} from "../markdownCheckboxes";
import SegmentedControl from "../SegmentedControl/SegmentedControl";
import { detectMode, prismLang } from "./fileType";
import { EOF_DELETION, type GutterMarkers } from "./gutter";
import { LINE_CAP, lineTruncation, nextVisible } from "./lineCap";
import { MermaidCode } from "./MermaidBlock";
import { highlightToHtml } from "./prism";
import { useFileDiffGutter } from "./useFileDiffGutter";
import styles from "./FileViewer.module.css";

// Above this, skip render/highlight and show plain raw text so a big file can't
// jank — and keep it read-only (no editing), for perf (#148).
const LARGE_BYTES = 256 * 1024;

// Stable empty-lines fallback so the `lines` memo doesn't allocate while text is null.
const EMPTY: string[] = [];

interface FileViewerProps {
  repoPath: string;
  /** Repo-relative file path. */
  file: string;
  /** Only fetch/poll while shown. */
  active: boolean;
}

/** Read-only Prism-highlighted code (#44). Prism escapes the source, so the
 * injected markup is its own token spans only — no raw file HTML. When `markers`
 * are present (the git-diff gutter, #324) the code sits beside a per-line gutter
 * column inside a shared vertical scroller, so the two stay in lockstep with no JS
 * scroll-sync. */
function CodeBlock({
  code,
  lang,
  markers,
}: {
  code: string;
  lang: string;
  markers: GutterMarkers | null;
}) {
  const html = useMemo(() => highlightToHtml(code, lang), [code, lang]);
  const lineCount = useMemo(() => code.split("\n").length, [code]);
  // No gutter (clean / non-git / no diff) → the plain read-only <pre>, byte-for-byte
  // the pre-#324 behavior (its own scroller). With a gutter, the <pre> sits inside a
  // shared vertical scroller beside the gutter column.
  if (!markers) {
    return (
      <pre className={`${styles.raw} ${styles.code}`}>
        <code
          className={`language-${lang}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </pre>
    );
  }
  return (
    <div className={styles.codeGutterWrap}>
      <LineGutter lineCount={lineCount} markers={markers} />
      <pre className={`${styles.raw} ${styles.code} ${styles.codeWithGutter}`}>
        <code
          className={`language-${lang}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </pre>
    </div>
  );
}

/** The left git-diff gutter column (#324) — one cell per source line, aligned to the
 * code `<pre>` by sharing its font-size / line-height. A green/yellow inset bar marks
 * an added/modified line; a red dot marks a "removed above" boundary (an
 * `EOF_DELETION` dot sits at the bottom edge of the last cell). Purely decorative, so
 * `aria-hidden`. Colors are `--status-*` tokens → identical on WKWebView / WebView2. */
function LineGutter({
  lineCount,
  markers,
}: {
  lineCount: number;
  markers: GutterMarkers;
}) {
  const cells = [];
  for (let n = 1; n <= lineCount; n++) {
    const change = markers.lines.get(n);
    const classes = [styles.gutterCell];
    if (change === "added") classes.push(styles.gutterAdded);
    else if (change === "modified") classes.push(styles.gutterModified);
    if (markers.deletions.has(n)) classes.push(styles.gutterDeletion);
    if (n === lineCount && markers.deletions.has(EOF_DELETION))
      classes.push(styles.gutterDeletionEof);
    cells.push(<div key={n} className={classes.join(" ")} />);
  }
  return (
    <div className={styles.diffGutter} aria-hidden="true">
      {cells}
    </div>
  );
}

/** Concatenate all descendant text of a hast node (a code block's source text). */
function hastText(node: ElementContent): string {
  if (node.type === "text") return node.value;
  if (node.type === "element") return node.children.map(hastText).join("");
  return "";
}

/**
 * Pull the raw source text + `language-*` tag out of a markdown code block's hast
 * `pre` node (its child `<code>`). Returns `null` when there is no `<code>` child —
 * i.e. not a code block (no such `pre` exists without raw HTML, which is disabled) —
 * so such a `pre` renders untouched.
 */
function preCodeInfo(
  node: Element | undefined,
): { text: string; lang: string | null } | null {
  const code = node?.children.find(
    (child): child is Element =>
      child.type === "element" && child.tagName === "code",
  );
  if (!code) return null;
  const className = code.properties?.className;
  const classes = Array.isArray(className) ? className.map(String) : [];
  const langClass = classes.find((c) => c.startsWith("language-"));
  return {
    text: hastText(code),
    lang: langClass ? langClass.slice("language-".length) : null,
  };
}

/**
 * Rendered-markdown `pre` override (#271) — wraps a fenced code block so a small
 * **Copy** button (revealed on hover/focus) can copy the snippet's raw text. The
 * wrapper is the positioning context, so the button stays pinned to the block's
 * top-right even when the `<pre>` scrolls horizontally; the `<pre>` keeps its
 * `.markdown pre` styling and Prism token spans untouched. Wired only at the
 * FileViewer call site (like the `MermaidCode` override), so Kanban / PatchNotes /
 * Settings markdown are unaffected. **Mermaid** fences render their own diagram via
 * the `code` override, so they're excluded here (guarded on the `language-mermaid`
 * class); a non-code `pre` is left untouched. Pure WebView UI + `navigator.clipboard`
 * (via the store's `copyToClipboard`), so it behaves identically on macOS and Windows.
 */
function CodeBlockWithCopy({
  node,
  children,
  ...rest
}: ComponentPropsWithoutRef<"pre"> & ExtraProps) {
  const copyToClipboard = useStore((s) => s.copyToClipboard);
  const info = preCodeInfo(node);
  if (!info || info.lang === "mermaid") {
    return <pre {...rest}>{children}</pre>;
  }
  const snippet = info.text.replace(/\n$/, "");
  return (
    <div className={styles.codeBlock}>
      <pre {...rest}>{children}</pre>
      <button
        type="button"
        className={styles.copyCode}
        onClick={() => void copyToClipboard(snippet, "code")}
        title="Copy code"
        aria-label="Copy code"
      >
        <Copy size={13} strokeWidth={1.5} />
      </button>
    </div>
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
 * markdown can't inject HTML. While **another window** soft-claims this file
 * (task 435, `lockedBy`) the whole editor renders read-only — banner + readOnly
 * textarea + non-interactive checkboxes + disabled Save — narrowing the old
 * cross-window last-write-wins tradeoff; "Take over" transfers the claim.
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
    lockedBy,
    takeOver,
  } = useAutoSaveFile(repoPath, file, active);
  // Read-only mirror of the hook's hard setText/save gates (task 435).
  const locked = lockedBy !== null;
  const platform = useStore((s) => s.platform);
  const [showRaw, setShowRaw] = useState(false);
  // Line-cap reveal state (#413): read-only render sinks show only the first
  // `visibleLines` lines until the user reveals more.
  const [visibleLines, setVisibleLines] = useState(LINE_CAP);

  const mode = detectMode(file);

  // Reset the raw toggle + the line-cap reveal per file.
  useEffect(() => {
    setShowRaw(false);
    setVisibleLines(LINE_CAP);
  }, [file]);

  // Split into lines once so the line-cap (#413) can slice the read-only render sinks.
  // Computed before the early returns (rules of hooks) — `text` may be null, in which
  // case there are no lines and nothing is truncated.
  const lines = useMemo(
    () => (text === null ? EMPTY : text.split("\n")),
    [text],
  );

  // Derived view flags — computed before the early returns so the memo/gutter hooks
  // (which must run unconditionally, rules of hooks) can key off them. `text` may be
  // null here; the guards below tolerate it and the null return still short-circuits
  // render.
  const tooLarge = text !== null && text.length > LARGE_BYTES;
  const renderMarkdown = mode === "markdown" && !showRaw && !tooLarge;
  // Editable raw text (#148): markdown in Raw mode or a plain-text file, not too
  // large. Rendered markdown, the Prism code view, and large files stay read-only.
  const editable =
    !tooLarge && ((mode === "markdown" && showRaw) || mode === "text");

  // Line-cap (#413): the read-only render sinks (rendered markdown, Prism code,
  // read-only raw <pre> — everything but the editable textarea) show only the first
  // `visibleLines` lines until the user reveals more. The editable textarea always
  // holds the full buffer so an auto-save / ⌘S never writes a truncated file.
  const capActive = !editable;
  const trunc = lineTruncation(lines.length, visibleLines);
  const truncated = capActive && trunc.truncated;
  const displayText = truncated
    ? lines.slice(0, visibleLines).join("\n")
    : (text ?? "");

  // Clickable task-list checkboxes in the rendered markdown (#173): a toggle flips
  // the source marker and routes through `setText` (so the #162 save mode applies).
  // Memoized on the buffer so the map isn't rebuilt every render. `setText` is stable.
  // While a rendered-markdown file is truncated (#413) the checkboxes are read-only and
  // the source is the truncated string (offsets must match the exact rendered text), so
  // a toggle can never write a partial buffer back to disk.
  // Mermaid diagrams in rendered markdown (#254): merge the opt-in `code` override
  // (a ` ```mermaid ` block → an SVG diagram; every other code fence unchanged) — wired
  // only here, so Kanban / PatchNotes / Settings markdown stay unaffected. The `pre`
  // override (#271) adds a hover Copy button to fenced code blocks, also FileViewer-only.
  const markdownComponents = useMemo(
    () => ({
      ...makeCheckboxComponents({
        source: renderMarkdown ? displayText : (text ?? ""),
        // Non-interactive while truncated (#413) OR claimed by another window
        // (task 435 — setText is hard-gated anyway; this is the UX mirror).
        interactive: !(renderMarkdown && truncated) && !locked,
        onToggle: setText,
      }),
      code: MermaidCode,
      pre: CodeBlockWithCopy,
    }),
    [text, setText, displayText, renderMarkdown, truncated, locked],
  );

  const lang = mode === "code" && !tooLarge ? prismLang(file) : undefined;
  // Git-diff gutter (#324): enabled only for the read-only Prism **code** view — a
  // curated, not-too-large code file (small files never reach the read-only <pre>, so
  // the code view is the sole clean, line-addressable target). The hook is a no-op
  // (returns null) for every other view / when inactive, and fails open.
  const gutterEnabled = text !== null && lang !== undefined;
  const markers = useFileDiffGutter(
    repoPath,
    file,
    active,
    text,
    gutterEnabled,
  );

  if (error) {
    return <div className={styles.message}>Couldn’t read {file}.</div>;
  }
  if (text === null) {
    return <div className={styles.message}>Loading…</div>;
  }

  // Rendered markdown is now writable too (#173, clickable checkboxes), so the
  // toolbar's save/status surfaces for any non-large markdown/text file — not just
  // the raw/text textarea (`editable`). The textarea itself stays gated by `editable`.
  const writable = !tooLarge && (mode === "markdown" || mode === "text");
  const showToolbar = (mode === "markdown" && !tooLarge) || editable;

  return (
    <div className={styles.viewer}>
      {/* Another window is this file's authoritative editor (task 435). */}
      {locked && <ClaimBanner onTakeOver={takeOver} />}
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
              disabled={!dirty || locked}
              title={
                locked
                  ? "Read-only — being edited in another window"
                  : dirty
                    ? `Save (${kbdHint(platform, "⌘S", "Ctrl+S")})`
                    : "Saved"
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
          {/* The Rendered/Raw toggle is markdown-only (rendered ↔ raw source) —
              the shared SegmentedControl atom (UI v2 §8; two segments always shown
              with the active highlighted, #73). */}
          {mode === "markdown" && !tooLarge && (
            <SegmentedControl<"rendered" | "raw">
              ariaLabel="View mode"
              value={showRaw ? "raw" : "rendered"}
              onChange={(v) => setShowRaw(v === "raw")}
              options={[
                {
                  value: "rendered",
                  label: (
                    <>
                      <Eye size={12} strokeWidth={1.5} aria-hidden /> Rendered
                    </>
                  ),
                  title: "Rendered markdown",
                },
                {
                  value: "raw",
                  label: (
                    <>
                      <TerminalIcon size={12} strokeWidth={1.5} aria-hidden />{" "}
                      Raw
                    </>
                  ),
                  title: "Raw source (editable)",
                },
              ]}
            />
          )}
        </div>
      )}
      {tooLarge && (
        <div className={styles.notice}>Large file — showing raw text.</div>
      )}
      {/* The read-only render sinks are fed `displayText` (the first `visibleLines`
          lines while truncated, #413) so a huge file paints instantly; the editable
          textarea keeps the full `text` so a save never writes a partial buffer. */}
      {renderMarkdown ? (
        <div className={styles.markdown}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeTaskListPositions]}
            components={markdownComponents}
          >
            {displayText}
          </ReactMarkdown>
        </div>
      ) : lang ? (
        <CodeBlock code={displayText} lang={lang} markers={markers} />
      ) : editable ? (
        // Editable raw text, auto-saving via the hook (#148). Always the FULL
        // buffer. readOnly while another window claims the file (task 435).
        <textarea
          className={styles.editor}
          {...noAutoCapitalize}
          value={text}
          readOnly={locked}
          spellCheck={false}
          onChange={(event) => setText(event.currentTarget.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          aria-label={`Edit ${file}`}
        />
      ) : (
        <pre className={styles.raw}>{displayText}</pre>
      )}
      {/* Reveal footer (#413) — a fixed bottom bar below the scrolling content. Shows
          how much of the file is rendered and reveals more on demand. The live status
          is announced; both reveals are real focusable buttons. */}
      {truncated && (
        <div
          className={styles.moreBar}
          role="group"
          aria-label="Reveal more lines"
        >
          <span className={styles.moreCount} role="status" aria-live="polite">
            Showing {trunc.shown.toLocaleString()} of{" "}
            {trunc.total.toLocaleString()} lines
          </span>
          <button
            type="button"
            className={styles.moreBtn}
            onClick={() => setVisibleLines((v) => nextVisible(v, trunc.total))}
          >
            Show {trunc.nextChunk.toLocaleString()} more lines
          </button>
          <button
            type="button"
            className={styles.moreLink}
            onClick={() => setVisibleLines(trunc.total)}
          >
            Show all
          </button>
        </div>
      )}
    </div>
  );
}

export default FileViewer;
