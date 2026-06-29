import { useEffect, useId, useState } from "react";
import type { Components } from "react-markdown";

import { isMermaidClassName, loadMermaid, renderMermaidSvg } from "./mermaid";
import styles from "./FileViewer.module.css";

/**
 * Mermaid diagram rendering for the FileViewer's rendered markdown (#254). A
 * ` ```mermaid ` fenced block becomes a Mermaid SVG; any other code fence (and inline
 * code) renders unchanged. Mermaid is a large library, so it is **lazy-loaded** (see
 * `./mermaid`) — a markdown file with no diagram never pulls the chunk — and
 * **bundled/offline** (no CDN). A diagram that fails to parse falls back to the original
 * code block + a subtle error note, never crashing the viewer. The override is
 * **opt-in** (wired only at the FileViewer call site), so Kanban / PatchNotes / Settings
 * markdown are unaffected.
 */
function MermaidBlock({ chart }: { chart: string }) {
  // mermaid needs a unique, valid DOM id per render; useId is stable per instance but
  // contains colons, which aren't valid id chars — strip them.
  const rawId = useId();
  const id = `mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setFailed(false);
    // Latest-wins: a fast source change can't paint a stale diagram.
    void renderMermaidSvg(loadMermaid, id, chart).then((result) => {
      if (cancelled) return;
      if (result === null) setFailed(true);
      else setSvg(result);
    });
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (failed) {
    // Fall back to the original fenced code block + a subtle, muted error note.
    return (
      <>
        <pre className={styles.raw}>
          <code className="language-mermaid">{chart}</code>
        </pre>
        <p className={styles.mermaidError}>Could not render Mermaid diagram.</p>
      </>
    );
  }
  if (svg === null) {
    return <p className={styles.mermaidLoading}>Rendering diagram…</p>;
  }
  // `svg` is produced by mermaid under securityLevel:"strict" (DOMPurify-sanitized),
  // so injecting it is safe and consistent with the no-raw-HTML policy.
  return (
    <div className={styles.mermaid} dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

/**
 * A react-markdown `code` override that renders a ` ```mermaid ` block as a diagram and
 * passes every other fenced/inline code through the **default** rendering faithfully
 * (FileViewer doesn't otherwise override `code`). Wired only at the FileViewer call
 * site, so the mermaid behavior is opt-in.
 */
export const MermaidCode: Components["code"] = ({ className, children }) => {
  if (isMermaidClassName(className)) {
    return <MermaidBlock chart={String(children).replace(/\n$/, "")} />;
  }
  return <code className={className}>{children}</code>;
};

export default MermaidBlock;
