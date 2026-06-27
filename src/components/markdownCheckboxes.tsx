//! Clickable GFM task-list checkboxes for rendered markdown (#173). Shared by the
//! universal `FileViewer` (#44) and the Kanban card bodies (#143), this reverses the
//! #52 "task-list checkboxes are never editable" rule for those two render sites:
//! a click toggles the underlying source marker `- [ ]` ⇄ `- [x]` and persists via
//! each call site's existing `useAutoSaveFile` buffer (honoring the #162 save mode).
//!
//! The mapping problem (rendered checkbox → source marker): remark-gfm turns a task
//! item into a hast `<input type="checkbox" disabled>` that has **no source position**
//! of its own, but its nearest ancestor `<li>` element **does** (the original source
//! offsets). So `rehypeTaskListPositions` stamps each task-checkbox input with its
//! nearest `<li>`'s start/end offsets; the `input` component override reads them and,
//! on toggle, `toggleTaskMarker` flips the first `[ ]`/`[x]` marker in that source
//! slice. Offsets are relative to the exact string handed to `<ReactMarkdown>` (the
//! whole file for FileViewer, the de-indented `card.body` for a Kanban card), so the
//! flipped string is the new source with no extra bookkeeping. This is robust against
//! `[ ]`-looking text inside fenced code blocks (the parser never makes those into
//! task items, so they're never stamped) — unlike a naive line-index regex.

import type { MouseEvent } from "react";
import type { Element, Root } from "hast";
import type { Components } from "react-markdown";
import { visitParents } from "unist-util-visit-parents";

import { openUrl } from "../ipc";

/**
 * Pure: is `href` an `http`/`https` URL? Only such links open externally (#182);
 * anything else (relative path, `mailto:`, `tel:`, `#anchor`, empty) is a neutralized
 * no-op. Exported for unit tests.
 */
export function isExternalHref(href: string | undefined): boolean {
  return /^https?:\/\//i.test(href ?? "");
}

/**
 * Intercept a rendered-markdown link click (#182). Always `preventDefault` so a plain
 * anchor can never navigate the Tauri webview in place (which would swap out the SPA);
 * an `http(s)` href is then opened in the system browser via the #109 `openUrl` →
 * Rust `open_url` path. Non-web schemes are simply neutralized.
 */
function onLinkClick(
  event: MouseEvent<HTMLAnchorElement>,
  href?: string,
): void {
  event.preventDefault();
  if (isExternalHref(href)) void openUrl(href!).catch(() => {});
}

/**
 * A reusable react-markdown `components` map whose `a` override routes clicks through
 * {@link onLinkClick} (#182). `node` is intentionally **not** destructured/spread onto
 * the DOM `<a>` (react-markdown v9 passes it), exactly as the `input` override avoids
 * spreading. Merged into {@link makeCheckboxComponents} (so FileViewer markdown views
 * and Kanban card bodies get it for free) and applied directly at the `CardPreview`
 * render site, which builds no checkbox map.
 */
export const markdownLinkComponents: Components = {
  a({ href, children }) {
    return (
      <a href={href} onClick={(event) => onLinkClick(event, href)}>
        {children}
      </a>
    );
  },
};

/**
 * Rehype plugin: stamp every GFM task-list checkbox `<input>` with the source
 * offsets of its nearest ancestor `<li>` (which carries `position`, unlike the
 * synthesized input). Read back off `node.properties` by {@link makeCheckboxComponents}
 * — never spread to the DOM, so no invalid-attribute warnings.
 */
export function rehypeTaskListPositions() {
  return (tree: Root): void => {
    visitParents(tree, "element", (node: Element, ancestors) => {
      const props = node.properties;
      if (node.tagName !== "input" || !props || props.type !== "checkbox")
        return;
      // Walk up to the nearest `<li>` element that has real source offsets.
      for (let i = ancestors.length - 1; i >= 0; i--) {
        const anc = ancestors[i];
        if (
          anc &&
          anc.type === "element" &&
          anc.tagName === "li" &&
          anc.position?.start.offset != null &&
          anc.position?.end.offset != null
        ) {
          props.dataSrcStart = anc.position.start.offset;
          props.dataSrcEnd = anc.position.end.offset;
          break;
        }
      }
    });
  };
}

/**
 * Pure: flip the first task-list marker inside `source.slice(start, end)` between
 * `[ ]` and `[x]`, returning the full updated `source`. Returns `null` when the
 * slice isn't a task-list item (so a non-task `<li>` leaves the source untouched).
 * Exported for unit tests.
 */
export function toggleTaskMarker(
  source: string,
  start: number,
  end: number,
): string | null {
  const slice = source.slice(start, end);
  const m = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/.exec(slice);
  if (!m) return null;
  const prefix = m[1] ?? "";
  const marker = m[2] ?? " ";
  // Absolute offset of the single char between the brackets.
  const at = start + prefix.length + 1;
  const flipped = marker === " " ? "x" : " ";
  return source.slice(0, at) + flipped + source.slice(at + 1);
}

/** Read the offsets stamped by {@link rehypeTaskListPositions}, or null if missing. */
function readOffsets(
  properties: Record<string, unknown> | undefined,
): [number, number] | null {
  if (!properties) return null;
  const start = Number(properties.dataSrcStart);
  const end = Number(properties.dataSrcEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return null;
  return [start, end];
}

/**
 * Build a react-markdown `components` map whose `input` override makes GFM
 * task-list checkboxes clickable. When `interactive` and the node carries valid
 * offsets, it renders a **native enabled** checkbox that, on toggle, computes the
 * flipped source via {@link toggleTaskMarker} and calls `onToggle(next)`. Otherwise
 * (non-interactive, or no offsets) it renders the default **disabled** checkbox,
 * preserving the read-only look (#52). Pair with `rehypePlugins:
 * [rehypeTaskListPositions]` at the call site; `source` is the exact string passed
 * to that `<ReactMarkdown>`.
 */
export function makeCheckboxComponents(opts: {
  source: string;
  interactive: boolean;
  onToggle: (nextSource: string) => void;
}): Components {
  const { source, interactive, onToggle } = opts;
  return {
    // Links open in the external browser, never in-place (#182).
    ...markdownLinkComponents,
    input(props) {
      const properties = props.node?.properties as
        | Record<string, unknown>
        | undefined;
      const isChecked = properties?.checked === true;
      const offsets = readOffsets(properties);
      if (!interactive || !offsets) {
        // Read-only contexts keep today's disabled, restyled checkbox (#52).
        return <input type="checkbox" checked={isChecked} disabled readOnly />;
      }
      const [start, end] = offsets;
      return (
        <input
          type="checkbox"
          checked={isChecked}
          // Stop the click bubbling into card edit/drag handlers (Kanban).
          onClick={(event) => event.stopPropagation()}
          onChange={() => {
            const next = toggleTaskMarker(source, start, end);
            if (next !== null) onToggle(next);
          }}
        />
      );
    },
  };
}
