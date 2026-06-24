// Shared item-title helpers (#157). The single-line display title for a content
// descriptor, used by Canvas panel headers, the drag ghost (#155), and the big-mode
// modal (#157). Kept in its own module (no React) so both `CanvasSurface` and the
// modal import it without a cycle through `ItemContent`.

import { repoName, sessionLabel } from "../../paths";
import type { CanvasContent, SessionView } from "../../types";
import { blockPlaceholderLabel } from "../Canvas/templateBlocks";

/** A panel's title from its content refs alone (no session lookup): a file's
 * basename, "Diff"/"Terminal"/"Scheduled", a pending template block's label, else
 * the content's `label`. Agents resolve their live label via {@link itemTitle}. */
export function panelTitle(content: CanvasContent): string {
  if (content.kind === "file") return content.file?.split("/").pop() ?? "File";
  if (content.kind === "kanban")
    return content.file?.split("/").pop() ?? "Kanban";
  if (content.kind === "diff") return "Diff";
  if (content.kind === "terminal") return "Terminal";
  if (content.kind === "scheduled") return "Scheduled";
  // A pending template panel (#118) shows its block's label until it resolves.
  if (content.kind === "pending")
    return content.block ? blockPlaceholderLabel(content.block) : "Panel";
  return content.label ?? "Panel";
}

/** The single-line title for any item — an agent's resolved label (name/auto/branch,
 * #95/#97) looked up live from the store's sessions/branches, else {@link panelTitle}. */
export function itemTitle(
  content: CanvasContent,
  sessions: SessionView[],
  branches: Record<string, string>,
  autoNameOn: boolean,
): string {
  if (content.kind === "agent") {
    const session = sessions.find((s) => s.id === content.sessionId);
    const repoPath = content.repoPath ?? session?.repoPath ?? "";
    const branch = branches[repoPath] ?? "";
    return sessionLabel(
      session?.name,
      autoNameOn ? session?.autoName : null,
      branch || repoName(repoPath),
    ).primary;
  }
  return panelTitle(content);
}
