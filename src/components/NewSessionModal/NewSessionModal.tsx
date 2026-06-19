import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { AlertTriangle, FolderOpen, GitBranch, Plus } from "lucide-react";

import { listBranches, pickDirectory } from "../../ipc";
import { repoName } from "../../paths";
import { useStore } from "../../store";
import type { BranchList } from "../../types";
import Checkbox from "../Checkbox/Checkbox";
import styles from "./NewSessionModal.module.css";

/**
 * Start-a-new-agent panel (#53, supersedes #27's bottom-left popover): a panel
 * that **expands from the New session button** (top-left, scale-from-corner;
 * reduced-motion → instant via the global killswitch). The flow leads with the
 * **fast path — recent folders** (recognition over recall), then "Choose
 * another…", then git **branch detection** (when the folder is a repo, pick one
 * to check out first), an optional name, and a destructive-checkout
 * acknowledgement (custom Checkbox #52) when switching a branch under a running
 * agent. Every entry point — the top button, ⌘N (#26), the per-repo + — opens
 * this same model (prefilled when a repo is known). Function is unchanged from
 * #27: state in the store (`newSessionOpen`/`newSessionRepo`); `spawnSession`
 * does the checkout + spawn, persists/selects/toasts. Autofocus + Enter create;
 * Escape / outside-click close.
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

  const nameRef = useRef<HTMLInputElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // The element focused before the dialog opened, restored on close (a11y #49).
  const openerRef = useRef<HTMLElement | null>(null);

  // Reset / prefill each time the panel opens.
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

  // Focus the right first control on open: the name when a folder is already
  // known (per-repo + / prefilled — straight to naming + Enter), otherwise the
  // folder picker (the user's first decision is which folder).
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      if (prefillRepo) nameRef.current?.focus();
      else chooseRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
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

  // Capture the opener on open; restore focus to it on close (a11y #49) so
  // keyboard focus doesn't get dumped on <body> when the dialog dismisses.
  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement as HTMLElement | null;
    } else {
      openerRef.current?.focus?.();
      openerRef.current = null;
    }
  }, [open]);

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

  // Keep Tab focus inside the dialog (focus-trap, a11y #49).
  const onTrapKeyDown = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Tab" || !formRef.current) return;
    const focusable = formRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={styles.overlay} onClick={close}>
      <form
        ref={formRef}
        className={styles.popover}
        role="dialog"
        aria-modal="true"
        aria-label="New session"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onTrapKeyDown}
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <h2 className={styles.title}>
          <Plus size={15} strokeWidth={2} className={styles.titleIcon} />
          New session
        </h2>

        {/* Folder — lead with recents (the fast path), then choose another. */}
        <p className={styles.label}>Folder</p>
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
        <div className={styles.pickRow}>
          <button
            ref={chooseRef}
            type="button"
            className={styles.pickButton}
            onClick={() => void pick()}
          >
            <FolderOpen size={15} strokeWidth={1.5} />
            {recents.length > 0 ? "Choose another…" : "Choose folder…"}
          </button>
          <span className={cwd ? styles.path : styles.pathEmpty}>
            {cwd ?? "No folder selected"}
          </span>
        </div>

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
          Name <span className={styles.optional}>optional</span>
        </label>
        <input
          ref={nameRef}
          id="session-name"
          className={styles.input}
          value={name}
          placeholder={cwd ? repoName(cwd) : "Folder name"}
          onChange={(event) => setName(event.currentTarget.value)}
        />

        {isDestructive && (
          <div className={styles.warning}>
            <AlertTriangle
              size={14}
              strokeWidth={1.5}
              className={styles.warnIcon}
            />
            <Checkbox
              className={styles.warnCheckbox}
              checked={acknowledged}
              onChange={setAcknowledged}
              label={
                <>
                  Checking out <strong>{selectedBranch}</strong> changes the
                  working tree under {runningInFolder} running agent
                  {runningInFolder > 1 ? "s" : ""} in this folder.
                </>
              }
            />
          </div>
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
