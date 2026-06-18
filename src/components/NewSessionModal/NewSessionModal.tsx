import { useEffect, useState } from "react";
import { AlertTriangle, FolderOpen, GitBranch } from "lucide-react";

import { listBranches, pickDirectory } from "../../ipc";
import { repoName } from "../../paths";
import { useStore } from "../../store";
import type { BranchList } from "../../types";
import styles from "./NewSessionModal.module.css";

/**
 * Compact bottom-left popover to start a session (#27): folder picker +
 * recent-folder chips + optional name, plus git **branch detection** — when the
 * folder is a repo its local branches are listed; picking one checks it out
 * before the agent starts. A destructive-checkout warning appears (and must be
 * acknowledged) when the chosen branch differs from the current one *and* an
 * agent is already running in that folder. State lives in the store
 * (`newSessionOpen` / `newSessionRepo`); `spawnSession` does the checkout +
 * spawn, adds to the store + recents, selects it, and toasts.
 */
function NewSessionModal() {
  const open = useStore((s) => s.newSessionOpen);
  const prefillRepo = useStore((s) => s.newSessionRepo);
  const recents = useStore((s) => s.recents);
  const sessions = useStore((s) => s.sessions);
  const close = useStore((s) => s.closeNewSession);
  const spawnSession = useStore((s) => s.spawnSession);

  const [cwd, setCwd] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [branches, setBranches] = useState<BranchList | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  // Reset / prefill each time the popover opens.
  useEffect(() => {
    if (open) {
      setCwd(prefillRepo);
      setName("");
      setBusy(false);
      setBranches(null);
      setSelectedBranch(null);
      setAcknowledged(false);
    }
  }, [open, prefillRepo]);

  // Detect branches whenever the chosen folder changes; default to the current.
  useEffect(() => {
    if (!open || !cwd) {
      setBranches(null);
      setSelectedBranch(null);
      return;
    }
    let cancelled = false;
    void listBranches(cwd)
      .then((list) => {
        if (cancelled) return;
        setBranches(list);
        setSelectedBranch(
          list.all.includes(list.current) ? list.current : null,
        );
        setAcknowledged(false);
      })
      .catch(() => {
        if (!cancelled) {
          setBranches(null);
          setSelectedBranch(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, cwd]);

  // Escape closes the popover.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  const willCheckout =
    !!branches &&
    branches.all.length > 0 &&
    !!selectedBranch &&
    selectedBranch !== branches.current;
  const runningInFolder = sessions.filter(
    (s) => s.repoPath === cwd && s.exitedCode === undefined,
  ).length;
  const isDestructive = willCheckout && runningInFolder > 0;
  const canCreate = !!cwd && !busy && (!isDestructive || acknowledged);

  const pick = async () => {
    const dir = await pickDirectory().catch(() => null);
    if (dir) setCwd(dir);
  };

  const create = async () => {
    if (!cwd || !canCreate) return;
    setBusy(true);
    const ok = await spawnSession(
      cwd,
      name.trim() || repoName(cwd),
      willCheckout ? (selectedBranch ?? undefined) : undefined,
    );
    if (ok) close();
    else setBusy(false); // stay open so the error (e.g. dirty tree) can be fixed
  };

  return (
    <div className={styles.overlay} onClick={close}>
      <form
        className={styles.popover}
        role="dialog"
        aria-modal="true"
        aria-label="New session"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <h2 className={styles.title}>New session</h2>

        <p className={styles.label}>Working directory</p>
        <div className={styles.pickRow}>
          <button
            type="button"
            className={styles.pickButton}
            onClick={() => void pick()}
          >
            <FolderOpen size={15} strokeWidth={1.5} />
            Choose…
          </button>
          <span className={cwd ? styles.path : styles.pathEmpty}>
            {cwd ?? "No folder selected"}
          </span>
        </div>

        {recents.length > 0 && (
          <div className={styles.chips}>
            {recents.slice(0, 6).map((recent) => (
              <button
                key={recent}
                type="button"
                className={`${styles.chip} ${recent === cwd ? styles.chipActive : ""}`}
                onClick={() => setCwd(recent)}
                title={recent}
              >
                {repoName(recent)}
              </button>
            ))}
          </div>
        )}

        {branches && branches.all.length > 0 && (
          <>
            <p className={styles.label}>Branch</p>
            <div className={styles.branches}>
              {branches.all.map((b) => (
                <button
                  key={b}
                  type="button"
                  className={`${styles.branch} ${b === selectedBranch ? styles.branchActive : ""}`}
                  onClick={() => {
                    setSelectedBranch(b);
                    setAcknowledged(false);
                  }}
                  title={b}
                >
                  <GitBranch size={13} strokeWidth={1.5} />
                  <span className={styles.branchName}>{b}</span>
                  {b === branches.current && (
                    <span className={styles.branchCurrent}>current</span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        <label className={styles.label} htmlFor="session-name">
          Name (optional)
        </label>
        <input
          id="session-name"
          className={styles.input}
          value={name}
          placeholder={cwd ? repoName(cwd) : "Folder name"}
          onChange={(event) => setName(event.currentTarget.value)}
          autoFocus
        />

        {isDestructive && (
          <label className={styles.warning}>
            <AlertTriangle
              size={14}
              strokeWidth={1.5}
              className={styles.warnIcon}
            />
            <span className={styles.warnText}>
              Checking out <strong>{selectedBranch}</strong> changes the working
              tree under {runningInFolder} running agent
              {runningInFolder > 1 ? "s" : ""} in this folder.
            </span>
            <input
              type="checkbox"
              className={styles.warnCheck}
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.currentTarget.checked)}
              aria-label="Acknowledge that this may disrupt running agents"
            />
          </label>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={close}>
            Cancel
          </button>
          <button type="submit" className={styles.create} disabled={!canCreate}>
            {willCheckout ? "Checkout & start" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default NewSessionModal;
