import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";
import { Copy, ExternalLink, GripVertical, X } from "lucide-react";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { mergeRepoOrder, repoColor, useStore } from "../../store";
import { repoName, sessionLabel } from "../../paths";
import type { OverviewPanel, SessionView } from "../../types";
// The Focus inspector's diff component is already parameterized by { repoPath,
// active }, so the Overview diff panel (#39) reuses it directly — one source.
import BusyIndicator from "../BusyIndicator/BusyIndicator";
import DiffInspector from "../DiffInspector/DiffInspector";
import EmptyState from "../EmptyState/EmptyState";
import FileViewer from "../FileViewer/FileViewer";
import Terminal from "../Terminal/Terminal";
import styles from "./Overview.module.css";

/**
 * Shared column chrome (#38): every Overview column — an agent terminal, a diff
 * panel (#39), or a markdown panel (#41) — renders inside this frame (repo-color
 * top band, drag handle, header with a title + actions, and a body). It is a
 * dnd-kit sortable item (#43): keyed by a stable `id` (session id / panel id) so
 * a drag-reorder reparents the DOM node — React never remounts it and the
 * persistent terminal pool (#18) is untouched.
 */
interface PanelColumnProps {
  id: string;
  color: string;
  groupStart: boolean;
  selected?: boolean;
  title: ReactNode;
  /** Optional slot before the title (e.g. the agent activity indicator, #71). */
  leading?: ReactNode;
  actions: ReactNode;
  onClickBody?: () => void;
  children: ReactNode;
}

function PanelColumn({
  id,
  color,
  groupStart,
  selected = false,
  title,
  leading,
  actions,
  onClickBody,
  children,
}: PanelColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  // `--card-color` drives the repo-colored selection frame (#50) — a pseudo-
  // element can't read an inline style, so expose the dynamic color as a var.
  const style = {
    borderTopColor: color,
    transform: CSS.Transform.toString(transform),
    transition,
    "--card-color": color,
  } as CSSProperties;
  return (
    <div
      ref={setNodeRef}
      data-item-id={id}
      className={`${styles.card} ${selected ? styles.cardSelected : ""} ${groupStart ? styles.cardGroupStart : ""} ${isDragging ? styles.cardDragging : ""}`}
      style={style}
    >
      {/* The whole title bar is the drag handle (#70): dnd-kit attributes make it
          focusable for keyboard + screen-reader drag; the grip is just a visual
          hint. The .actions group stops pointerdown so its buttons stay clickable
          and never start a drag. The body (a sibling) stays separately clickable. */}
      <header className={styles.header} {...attributes} {...listeners}>
        <span className={styles.dragHandle} title="Drag to reorder" aria-hidden>
          <GripVertical size={14} strokeWidth={1.5} />
        </span>
        {leading}
        <div className={styles.titleBlock}>{title}</div>
        <div
          className={styles.actions}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {actions}
        </div>
      </header>
      <div className={styles.body} onClick={onClickBody}>
        {children}
      </div>
    </div>
  );
}

interface SessionCardProps {
  session: SessionView;
  branch: string;
  color: string;
  groupStart: boolean;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onCopyResume: () => void;
  onOpenInZed: () => void;
  onRemove: () => void;
}

function SessionCard({
  session,
  branch,
  color,
  groupStart,
  selected,
  busy,
  onSelect,
  onCopyResume,
  onOpenInZed,
  onRemove,
}: SessionCardProps) {
  // Unified label rule (#67): name is primary with the branch as the subtitle;
  // with no name the branch (folder name when non-git) is primary and there is
  // no subtitle. The repo color dot stays as the "which repo" badge.
  const { primary, subtitle } = sessionLabel(
    session.name,
    branch || repoName(session.repoPath),
  );
  const title = (
    <>
      <span className={styles.name}>{primary}</span>
      <span className={styles.meta}>
        <span className={styles.metaDot} style={{ background: color }} />
        {subtitle && <span className={styles.metaText}>{subtitle}</span>}
      </span>
    </>
  );
  const actions = (
    <>
      {/* Copy `claude --resume <id>` (#28) — re-homed here post-Focus (#86). */}
      <button
        type="button"
        className={styles.action}
        onClick={onCopyResume}
        title="Copy resume command (claude --resume <id>)"
        aria-label="Copy resume command"
      >
        <Copy size={15} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        className={styles.action}
        onClick={onOpenInZed}
        title="Open in Zed"
        aria-label="Open in Zed"
      >
        <ExternalLink size={15} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        className={styles.action}
        onClick={onRemove}
        title="Remove (kill + forget)"
        aria-label="Remove session"
      >
        <X size={15} strokeWidth={1.5} />
      </button>
    </>
  );
  return (
    // Clicking the card body selects it (highlight in place); Expand goes to
    // Focus. The terminal inside keeps its own click-to-focus.
    <PanelColumn
      id={session.id}
      color={color}
      groupStart={groupStart}
      selected={selected}
      title={title}
      leading={<BusyIndicator busy={busy} />}
      actions={actions}
      onClickBody={onSelect}
    >
      <Terminal sessionId={session.id} />
    </PanelColumn>
  );
}

function panelLabel(panel: OverviewPanel): string {
  if (panel.kind === "diff") return "Diff";
  if (panel.kind === "terminal") return "Terminal";
  return panel.file?.split("/").pop() || "File";
}

interface ExtraPanelProps {
  panel: OverviewPanel;
  repoPath: string;
  branch: string;
  color: string;
  groupStart: boolean;
  selected: boolean;
  onClose: () => void;
}

function ExtraPanel({
  panel,
  repoPath,
  branch,
  color,
  groupStart,
  selected,
  onClose,
}: ExtraPanelProps) {
  const title = (
    <>
      <span className={styles.name}>{panelLabel(panel)}</span>
      <span className={styles.meta}>
        <span className={styles.metaDot} style={{ background: color }} />
        <span className={styles.metaText}>
          {repoName(repoPath)}
          {branch && ` · ${branch}`}
        </span>
      </span>
    </>
  );
  const actions = (
    <button
      type="button"
      className={styles.action}
      onClick={onClose}
      title="Close panel"
      aria-label="Close panel"
    >
      <X size={15} strokeWidth={1.5} />
    </button>
  );
  return (
    <PanelColumn
      id={panel.id}
      color={color}
      groupStart={groupStart}
      selected={selected}
      title={title}
      actions={actions}
    >
      {panel.kind === "diff" ? (
        // Reuse the Focus inspector's diff component (#39), bound to this repo
        // and always active so it polls (#29) while the column is shown.
        <DiffInspector repoPath={repoPath} active />
      ) : panel.kind === "terminal" ? (
        // Terminal item (#72): the panel id is the shell PTY id, rendered by the
        // same pooled <Terminal>. repoPath marks it a non-agent (Restart respawns
        // the shell; no busy/branch/claude-resume).
        <Terminal sessionId={panel.id} repoPath={repoPath} />
      ) : panel.file ? (
        // File panel (#41/#44): the shared FileViewer renders the panel's saved
        // file by type (markdown/code/text), always active so it hot-reloads.
        <FileViewer repoPath={repoPath} file={panel.file} active />
      ) : (
        // A file panel is always created with a file; this is a guard.
        <div className={styles.placeholder}>No file selected.</div>
      )}
    </PanelColumn>
  );
}

type ColumnItem =
  | { kind: "agent"; session: SessionView }
  | { kind: "panel"; panel: OverviewPanel };

/**
 * The Overview "agent wall" (#38): a customizable arrangement of equal-width
 * columns grouped by repo — each repo's live agent terminals plus its
 * user-managed extra panels (diff/markdown). Columns scroll horizontally past
 * capacity; the sidebar repo filter (#34/#36) narrows it to one repo. Items
 * **drag to reorder within their repo cluster** (#43, dnd-kit) and the order
 * persists per repo.
 */
function Overview() {
  const sessions = useStore((s) => s.sessions);
  const branches = useStore((s) => s.branches);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const openInZed = useStore((s) => s.openInZed);
  const copyToClipboard = useStore((s) => s.copyToClipboard);
  const removeSession = useStore((s) => s.removeSession);
  const openNewSession = useStore((s) => s.openNewSession);
  const filter = useStore((s) => s.overviewRepoFilter);
  const setOverviewRepoFilter = useStore((s) => s.setOverviewRepoFilter);
  const repoColors = useStore((s) => s.repoColors);
  const overviewPanels = useStore((s) => s.overviewPanels);
  const overviewOrder = useStore((s) => s.overviewOrder);
  const removeOverviewPanel = useStore((s) => s.removeOverviewPanel);
  const reorderOverview = useStore((s) => s.reorderOverview);
  const sessionBusy = useStore((s) => s.sessionBusy);

  // Drag with a small activation distance so clicking the handle doesn't start a
  // drag; keyboard sensor makes reordering accessible (#43).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Scroll the selected item's column into view when the selection changes (#79)
  // — so clicking a sidebar item in Overview reveals its column.
  const wallRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedId) return;
    wallRef.current
      ?.querySelector(`[data-item-id="${selectedId}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedId]);

  // The welcome empty state only when there's truly nothing — no agents and no
  // extra panels (a repo can have a diff/markdown panel without an agent, #39/#41).
  const anyPanels = Object.values(overviewPanels).some(
    (list) => list.length > 0,
  );
  if (sessions.length === 0 && !anyPanels) {
    return <EmptyState onNewSession={() => openNewSession()} />;
  }

  // The sidebar repo filter (#34) narrows the wall to one repo's agents.
  const shown = filter
    ? sessions.filter((s) => s.repoPath === filter)
    : sessions;

  // Always group by repo: sidebar's alphabetical order (#20), agents contiguous
  // within a repo (stable by createdAt) — the default order before any drag.
  const ordered = [...shown].sort((a, b) => {
    const byName = repoName(a.repoPath)
      .toLowerCase()
      .localeCompare(repoName(b.repoPath).toLowerCase());
    if (byName !== 0) return byName;
    const byPath = a.repoPath.localeCompare(b.repoPath);
    if (byPath !== 0) return byPath;
    return a.createdAt - b.createdAt;
  });

  // Repos to render: those with agents, plus those with extra panels (respecting
  // the filter) — so a diff/markdown panel shows even with no agent in the repo.
  const repoSet = new Set<string>();
  for (const s of ordered) repoSet.add(s.repoPath);
  for (const repo of Object.keys(overviewPanels)) {
    if (
      (overviewPanels[repo]?.length ?? 0) > 0 &&
      (!filter || repo === filter)
    ) {
      repoSet.add(repo);
    }
  }
  const repoList = [...repoSet].sort((a, b) => {
    const byName = repoName(a)
      .toLowerCase()
      .localeCompare(repoName(b).toLowerCase());
    return byName !== 0 ? byName : a.localeCompare(b);
  });

  // Per repo: the drag-reordered item list (#43). The saved order is merged with
  // the live items (agents by createdAt, then panels) so a spawn appends and an
  // exit drops out without scrambling the rest.
  const clusters = repoList
    .map((repo) => {
      const agents = ordered.filter((s) => s.repoPath === repo);
      const extras = overviewPanels[repo] ?? [];
      const defaultKeys = [
        ...agents.map((s) => s.id),
        ...extras.map((p) => p.id),
      ];
      const keys = mergeRepoOrder(overviewOrder[repo] ?? [], defaultKeys);
      const byKey = new Map<string, ColumnItem>();
      for (const s of agents) byKey.set(s.id, { kind: "agent", session: s });
      for (const p of extras) byKey.set(p.id, { kind: "panel", panel: p });
      const items = keys
        .map((k) => byKey.get(k))
        .filter((x): x is ColumnItem => x !== undefined);
      return { repo, keys, items };
    })
    .filter((c) => c.items.length > 0);

  // Map every item key → its repo, so a drag can be constrained to its cluster.
  const keyToRepo = new Map<string, string>();
  for (const c of clusters) for (const k of c.keys) keyToRepo.set(k, c.repo);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const repo = keyToRepo.get(activeId);
    // Within-cluster only: ignore a drop that landed over another repo's column.
    if (!repo || keyToRepo.get(overId) !== repo) return;
    const cluster = clusters.find((c) => c.repo === repo);
    if (!cluster) return;
    const oldIndex = cluster.keys.indexOf(activeId);
    const newIndex = cluster.keys.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    void reorderOverview(repo, arrayMove(cluster.keys, oldIndex, newIndex));
  };

  return (
    <div className={styles.overview}>
      {filter && (
        <div className={styles.filterBar}>
          <span className={styles.filterLabel}>
            Showing <strong>{repoName(filter)}</strong>
          </span>
          <button
            type="button"
            className={styles.showAll}
            onClick={() => setOverviewRepoFilter(null)}
          >
            Show all
          </button>
        </div>
      )}
      {clusters.length === 0 ? (
        <div className={styles.filterEmpty}>
          {filter ? "Nothing to show for this repo." : "No agents yet."}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <div ref={wallRef} className={styles.wall}>
            {clusters.map((cluster, clusterIdx) => (
              <SortableContext
                key={cluster.repo}
                items={cluster.keys}
                strategy={horizontalListSortingStrategy}
              >
                {cluster.items.map((item, itemIdx) => {
                  // Divider before every cluster except the first rendered one.
                  const groupStart = clusterIdx > 0 && itemIdx === 0;
                  const color = repoColor(cluster.repo, repoColors);
                  const branch = branches[cluster.repo] ?? "";
                  if (item.kind === "agent") {
                    const session = item.session;
                    return (
                      <SessionCard
                        key={session.id}
                        session={session}
                        branch={branch}
                        color={color}
                        groupStart={groupStart}
                        selected={session.id === selectedId}
                        busy={sessionBusy[session.id] ?? false}
                        onSelect={() => select(session.id)}
                        onCopyResume={() =>
                          void copyToClipboard(
                            `claude --resume ${session.id}`,
                            "resume command",
                          )
                        }
                        onOpenInZed={() => void openInZed(session.repoPath)}
                        onRemove={() => void removeSession(session.id)}
                      />
                    );
                  }
                  return (
                    <ExtraPanel
                      key={item.panel.id}
                      panel={item.panel}
                      repoPath={cluster.repo}
                      branch={branch}
                      color={color}
                      groupStart={groupStart}
                      selected={item.panel.id === selectedId}
                      onClose={() =>
                        void removeOverviewPanel(cluster.repo, item.panel.id)
                      }
                    />
                  );
                })}
              </SortableContext>
            ))}
          </div>
        </DndContext>
      )}
    </div>
  );
}

export default Overview;
