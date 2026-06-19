import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Copy, ExternalLink, PanelRight } from "lucide-react";

import { listFiles } from "../../ipc";
import { repoName, sessionLabel } from "../../paths";
import {
  INSPECTOR_MAX_WIDTH,
  INSPECTOR_MIN_WIDTH,
  repoColor,
  useStore,
} from "../../store";
import BusyIndicator from "../BusyIndicator/BusyIndicator";
import DiffInspector from "../DiffInspector/DiffInspector";
import FileViewer from "../FileViewer/FileViewer";
import Terminal from "../Terminal/Terminal";
import styles from "./Focus.module.css";

// Extensible tab strip — more inspector tabs can be added here later.
const TABS = [
  { id: "diff", label: "Diff" },
  { id: "files", label: "Files" },
];

/**
 * Files tab content (#44, generalizing #40): pick any repo file and view it with
 * the shared `FileViewer` (markdown rendered, code highlighted, else raw). The
 * file list is fetched per repo; defaults to a README.
 */
function FileTab({ repoPath, active }: { repoPath: string; active: boolean }) {
  const [files, setFiles] = useState<string[]>([]);
  const [file, setFile] = useState<string | null>(null);
  const addOverviewPanel = useStore((s) => s.addOverviewPanel);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void listFiles(repoPath)
      .then((list) => {
        if (cancelled) return;
        setFiles(list);
        setFile((cur) =>
          cur && list.includes(cur)
            ? cur
            : (list.find((f) => /readme/i.test(f)) ?? list[0] ?? null),
        );
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [repoPath, active]);

  if (files.length === 0) {
    return <div className={styles.mdEmpty}>No files in this repo.</div>;
  }
  return (
    <div className={styles.mdTab}>
      <select
        className={styles.fileSelect}
        value={file ?? ""}
        onChange={(event) => {
          // An explicit pick "opens" the file → register it as the repo's file
          // item (#59, deduped in the store): shows in the sidebar + Overview.
          const picked = event.currentTarget.value;
          setFile(picked);
          void addOverviewPanel(repoPath, "markdown", picked);
        }}
        aria-label="File"
      >
        {files.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      {file && <FileViewer repoPath={repoPath} file={file} active={active} />}
    </div>
  );
}

/**
 * Single-session view: a large terminal filling the area, a toolbar (colored
 * repo badge #37, copy-able session chip, Open in Zed, inspector toggle), and a
 * collapsible inspector with an extensible tab strip. The Overview/Focus switch
 * lives in the sidebar (#25).
 */
function Focus() {
  const selectedId = useStore((s) => s.selectedId);
  const sessions = useStore((s) => s.sessions);
  const branches = useStore((s) => s.branches);
  const inspectorOpen = useStore((s) => s.inspectorOpen);
  const toggleInspector = useStore((s) => s.toggleInspector);
  const openInZed = useStore((s) => s.openInZed);
  const copyToClipboard = useStore((s) => s.copyToClipboard);
  const repoColors = useStore((s) => s.repoColors);
  const sessionBusy = useStore((s) => s.sessionBusy);
  const inspectorWidth = useStore((s) => s.inspectorWidth);
  const setInspectorWidth = useStore((s) => s.setInspectorWidth);
  const persistInspectorWidth = useStore((s) => s.persistInspectorWidth);

  const [activeTab, setActiveTab] = useState("diff");
  // Inspector resize (#51). `resizing` suppresses the open/close width transition
  // so the panel tracks the pointer 1:1. The width is driven through a CSS var,
  // set imperatively (below) — not via React state — so dragging never re-renders
  // the heavy inspector content (diff / markdown); state is committed on release.
  const rootRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef<{ x: number; w: number; cur: number } | null>(null);

  // Keep the committed width on the CSS var (mount + after a commit), before
  // paint so there's no flash. Skipped during a drag (`inspectorWidth` doesn't
  // change then), so the live imperative value below isn't clobbered.
  useLayoutEffect(() => {
    rootRef.current?.style.setProperty(
      "--inspector-width",
      `${inspectorWidth}px`,
    );
  }, [inspectorWidth]);

  const clampWidth = (px: number) =>
    Math.round(
      Math.min(INSPECTOR_MAX_WIDTH, Math.max(INSPECTOR_MIN_WIDTH, px)),
    );

  const onResizeDown = (event: React.PointerEvent) => {
    event.preventDefault();
    dragRef.current = {
      x: event.clientX,
      w: inspectorWidth,
      cur: inspectorWidth,
    };
    setResizing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onResizeMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    // Dragging left (toward the terminal) widens the inspector; update the var
    // directly so the panel + content reflow without a React render.
    drag.cur = clampWidth(drag.w - (event.clientX - drag.x));
    rootRef.current?.style.setProperty("--inspector-width", `${drag.cur}px`);
  };
  const onResizeUp = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setResizing(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
    setInspectorWidth(drag.cur); // commit (matches the live var → no jump)
    persistInspectorWidth();
  };
  const onResizeKey = (event: React.KeyboardEvent) => {
    const step =
      event.key === "ArrowLeft" ? 24 : event.key === "ArrowRight" ? -24 : 0;
    if (step === 0) return;
    event.preventDefault();
    setInspectorWidth(useStore.getState().inspectorWidth + step);
    persistInspectorWidth();
  };

  const session = sessions.find((x) => x.id === selectedId);
  const branch = session ? (branches[session.repoPath] ?? "") : "";
  // Unified label (#67) for the resume chip: name primary, branch the subtitle.
  const chipLabel = session
    ? sessionLabel(session.name, branch || repoName(session.repoPath))
    : null;
  const busy = session ? (sessionBusy[session.id] ?? false) : false;
  // Repo color identity (#35), shown as the toolbar badge + a subtle top rule so
  // Focus matches the sidebar/Overview color for this repo (#37).
  const color = session ? repoColor(session.repoPath, repoColors) : undefined;

  return (
    <div
      ref={rootRef}
      className={styles.focus}
      style={color ? { borderTopColor: color } : undefined}
    >
      <div className={styles.toolbar}>
        {session && (
          <>
            {/* Colored repo badge (#37) — matches the Overview/sidebar color. */}
            <span className={styles.badge}>
              <span className={styles.badgeDot} style={{ background: color }} />
              <span className={styles.badgeName}>
                {repoName(session.repoPath)}
              </span>
            </span>
            <button
              type="button"
              className={styles.chip}
              onClick={() =>
                void copyToClipboard(
                  `claude --resume ${session.id}`,
                  "resume command",
                )
              }
              title="Copy resume command (claude --resume <id>)"
            >
              <span className={styles.chipText}>
                {chipLabel?.primary}
                {chipLabel?.subtitle ? ` · ${chipLabel.subtitle}` : ""}
                {` · ${session.id.slice(0, 8)}`}
              </span>
              <Copy size={13} strokeWidth={1.5} />
            </button>
            <BusyIndicator busy={busy} />
            <div className={styles.spacer} />
            <button
              type="button"
              className={styles.toolButton}
              onClick={() => void openInZed(session.repoPath)}
              title="Open in Zed"
              aria-label="Open in Zed"
            >
              <ExternalLink size={16} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              className={`${styles.toolButton} ${inspectorOpen ? styles.toolButtonActive : ""}`}
              onClick={toggleInspector}
              title="Toggle inspector"
              aria-label="Toggle inspector"
              aria-pressed={inspectorOpen}
            >
              <PanelRight size={16} strokeWidth={1.5} />
            </button>
          </>
        )}
        {!session && <div className={styles.spacer} />}
      </div>

      <div className={styles.stage}>
        {session ? (
          <>
            <div className={styles.terminalArea}>
              <Terminal key={session.id} sessionId={session.id} />
            </div>
            <div
              className={`${styles.inspector} ${inspectorOpen ? styles.inspectorOpen : ""} ${resizing ? styles.inspectorResizing : ""}`}
              aria-hidden={!inspectorOpen}
            >
              {inspectorOpen && (
                <div
                  className={`${styles.inspectorHandle} ${resizing ? styles.inspectorHandleActive : ""}`}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize inspector"
                  aria-valuenow={inspectorWidth}
                  aria-valuemin={INSPECTOR_MIN_WIDTH}
                  aria-valuemax={INSPECTOR_MAX_WIDTH}
                  tabIndex={0}
                  onPointerDown={onResizeDown}
                  onPointerMove={onResizeMove}
                  onPointerUp={onResizeUp}
                  onKeyDown={onResizeKey}
                />
              )}
              <div className={styles.inspectorInner}>
                <div
                  className={styles.tabStrip}
                  role="tablist"
                  onKeyDown={(event) => {
                    // Roving arrow-key nav per the ARIA tablist pattern (#49).
                    const idx = TABS.findIndex((t) => t.id === activeTab);
                    let next = idx;
                    if (event.key === "ArrowRight" || event.key === "ArrowDown")
                      next = (idx + 1) % TABS.length;
                    else if (
                      event.key === "ArrowLeft" ||
                      event.key === "ArrowUp"
                    )
                      next = (idx - 1 + TABS.length) % TABS.length;
                    else return;
                    event.preventDefault();
                    const tab = TABS[next];
                    if (!tab) return;
                    setActiveTab(tab.id);
                    const tabs =
                      event.currentTarget.querySelectorAll<HTMLButtonElement>(
                        '[role="tab"]',
                      );
                    tabs[next]?.focus();
                  }}
                >
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === tab.id}
                      tabIndex={activeTab === tab.id ? 0 : -1}
                      className={
                        activeTab === tab.id ? styles.tabActive : styles.tab
                      }
                      onClick={() => setActiveTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className={styles.inspectorBody}>
                  {activeTab === "diff" && (
                    <DiffInspector
                      key={session.repoPath}
                      repoPath={session.repoPath}
                      active={inspectorOpen}
                    />
                  )}
                  {activeTab === "files" && (
                    <FileTab
                      key={session.repoPath}
                      repoPath={session.repoPath}
                      active={inspectorOpen}
                    />
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className={styles.hint}>Select a session to focus it.</p>
        )}
      </div>
    </div>
  );
}

export default Focus;
