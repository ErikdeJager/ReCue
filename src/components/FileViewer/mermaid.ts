// Mermaid loading + rendering helpers for the FileViewer (#254). Pure (no JSX/React),
// so they're unit-testable without bundling mermaid and live separately from the
// `MermaidBlock` component (keeps that file component-only for fast-refresh).

/** Minimal shape of the bits of the mermaid module we use (keeps the test fake tiny). */
export interface MermaidLike {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, chart: string) => Promise<{ svg: string }>;
}

// Initialize mermaid exactly once across the app (module-level guard).
let initialized = false;

/**
 * Lazy-load + one-time-initialize mermaid. Mermaid is a large library, so the dynamic
 * `import()` keeps it in its own async chunk — a markdown file with no diagram never
 * pulls it. Dark theme to match the app; strict security (DOMPurify-sanitized output,
 * no scripts/click handlers — consistent with the no-raw-HTML policy); a system/sans
 * font stack so nothing is fetched from the network (offline rule, both OSes).
 */
export async function loadMermaid(): Promise<MermaidLike> {
  const mermaid = (await import("mermaid")).default as unknown as MermaidLike;
  if (!initialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: "dark",
      securityLevel: "strict",
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    });
    initialized = true;
  }
  return mermaid;
}

/**
 * Render `chart` to an SVG string, or `null` on any failure (invalid syntax, load
 * error). Pure w.r.t. the injected `load` so it's unit-testable without bundling
 * mermaid: the app passes the real {@link loadMermaid}, tests pass a fake.
 */
export async function renderMermaidSvg(
  load: () => Promise<MermaidLike>,
  id: string,
  chart: string,
): Promise<string | null> {
  try {
    const mermaid = await load();
    const { svg } = await mermaid.render(id, chart);
    return svg;
  } catch {
    return null;
  }
}

/** Pure: does a react-markdown `code` className mark a Mermaid fenced block
 * (` ```mermaid `)? Only the explicit `language-mermaid` tag triggers a diagram. */
export function isMermaidClassName(className: string | undefined): boolean {
  return /(^|\s)language-mermaid(\s|$)/.test(className ?? "");
}
