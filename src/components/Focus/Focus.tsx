import { useEffect, useState } from "react";
import { Copy, ExternalLink, PanelRight } from "lucide-react";

import { listFiles } from "../../ipc";
import { repoName } from "../../paths";
import { repoColor, useStore } from "../../store";
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
  const openFile = useStore((s) => s.openFile);

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
          // An explicit pick "opens" the file → register it in the sidebar tree (#45).
          const picked = event.currentTarget.value;
          setFile(picked);
          void openFile(repoPath, picked);
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

  const [activeTab, setActiveTab] = useState("diff");

  const session = sessions.find((x) => x.id === selectedId);
  const branch = session ? (branches[session.repoPath] ?? "") : "";
  const busy = session ? (sessionBusy[session.id] ?? false) : false;
  // Repo color identity (#35), shown as the toolbar badge + a subtle top rule so
  // Focus matches the sidebar/Overview color for this repo (#37).
  const color = session ? repoColor(session.repoPath, repoColors) : undefined;

  return (
    <div
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
                {branch && `${branch} · `}
                {session.id.slice(0, 8)}
              </span>
              <Copy size={13} strokeWidth={1.5} />
            </button>
            {busy && <BusyIndicator />}
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
              className={`${styles.inspector} ${inspectorOpen ? styles.inspectorOpen : ""}`}
              aria-hidden={!inspectorOpen}
            >
              <div className={styles.inspectorInner}>
                <div className={styles.tabStrip} role="tablist">
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === tab.id}
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
