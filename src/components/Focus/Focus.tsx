import { useState } from "react";
import { Copy, ExternalLink, PanelRight } from "lucide-react";

import { repoName } from "../../paths";
import { useStore } from "../../store";
import Terminal from "../Terminal/Terminal";
import ViewSwitch from "../ViewSwitch/ViewSwitch";
import styles from "./Focus.module.css";

// Extensible tab strip — more inspector tabs can be added here later.
const TABS = [{ id: "diff", label: "Diff" }];

/**
 * Single-session view: a large terminal filling the area, a toolbar (view
 * switch, copy-able session chip, Open in Zed, inspector toggle), and a
 * collapsible inspector with an extensible tab strip. The Diff tab's content is
 * filled in task #13.
 */
function Focus() {
  const selectedId = useStore((s) => s.selectedId);
  const sessions = useStore((s) => s.sessions);
  const branches = useStore((s) => s.branches);
  const inspectorOpen = useStore((s) => s.inspectorOpen);
  const toggleInspector = useStore((s) => s.toggleInspector);
  const openInZed = useStore((s) => s.openInZed);
  const copyToClipboard = useStore((s) => s.copyToClipboard);

  const [activeTab, setActiveTab] = useState("diff");

  const session = sessions.find((x) => x.id === selectedId);
  const branch = session ? (branches[session.repoPath] ?? "") : "";

  return (
    <div className={styles.focus}>
      <div className={styles.toolbar}>
        <ViewSwitch />
        {session && (
          <>
            <button
              type="button"
              className={styles.chip}
              onClick={() => void copyToClipboard(session.id, "session id")}
              title="Copy session id"
            >
              <span className={styles.chipText}>
                {repoName(session.repoPath)}
                {branch && ` · ${branch}`} · {session.id.slice(0, 8)}
              </span>
              <Copy size={13} strokeWidth={1.5} />
            </button>
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
                    <p className={styles.placeholder}>
                      The working-tree diff inspector is filled in task #13.
                    </p>
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
