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
 * Start-a-new-agent panel (#53 → keyboard-speed pass #61). A **keyboard-first
 * launcher**: recents are a type-ahead-filtered, ↑/↓-navigable list with **⌘1–9**
 * quick-select; the highlighted recent is the target folder, so **⌘N then Enter
 * launches the most-recent folder** on its current branch (the zero-input common
 * case). Once a folder is set, branches are ↑/↓-navigable and Enter starts
 * (checkout & start for a non-current branch). Inline kbd hints throughout.
 *
 * Function is unchanged from #27 — `spawnSession` does folder / recents / branch /
 * `git checkout` / destructive-confirm / spawn; this pass only changes how fast
 * the keyboard drives it. a11y (#49): focus-trap, focus-restore, Escape /
 * outside-click close.
 */
function NewSessionModal() {
  const open = useStore((s) => s.newSessionOpen);
  const prefillRepo = useStore((s) => s.newSessionRepo);
  const recents = useStore((s) => s.recents);
  const sessions = useStore((s) => s.sessions);
  const close = useStore((s) => s.closeNewSession);
  const spawnSession = useStore((s) => s.spawnSession);

  const [cwd, setCwd] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [branches, setBranches] = useState<BranchList | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const recentsRef = useRef<HTMLDivElement>(null);
  const branchesRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // The element focused before the dialog opened, restored on close (a11y #49).
  const openerRef = useRef<HTMLElement | null>(null);

  // Reset / prefill each time the panel opens. Default the folder to the prefill
  // repo (per-repo +) else the most-recent folder, so ⌘N → Enter quick-launches.
  useEffect(() => {
    if (!open) return;
    const mostRecent = useStore.getState().recents[0] ?? null;
    setCwd(prefillRepo ?? mostRecent);
    setQuery("");
    setName("");
    setBusy(false);
    setBranches(null);
    setSelectedBranch(null);
    setAcknowledged(false);
  }, [open, prefillRepo]);

  // Focus the search on open (keyboard-first) — or the folder picker when there
  // are no recents to search.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      if (searchRef.current) searchRef.current.focus();
      else chooseRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [open]);

  // Detect branches whenever the chosen folder changes; default to the current.
  useEffect(() => {
    if (!open || !cwd) {
      setBranches(null);
      setSelectedBranch(null);
      return;
    }
    let cancelled = false;
    void listBranches(cwd)
      .then((bl) => {
        if (cancelled) return;
        setBranches(bl);
        setSelectedBranch(bl.all.includes(bl.current) ? bl.current : null);
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

  // Capture the opener on open; restore focus to it on close (a11y #49).
  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement as HTMLElement | null;
    } else {
      openerRef.current?.focus?.();
      openerRef.current = null;
    }
  }, [open]);

  // Keep the highlighted recent scrolled into view as ↑/↓ / ⌘1–9 move it.
  useEffect(() => {
    const el = recentsRef.current?.querySelector(
      '[aria-selected="true"]',
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [cwd]);

  if (!open) return null;

  // Substring type-ahead over recents (repo name + full path).
  const q = query.trim().toLowerCase();
  const list = q
    ? recents.filter(
        (r) =>
          repoName(r).toLowerCase().includes(q) || r.toLowerCase().includes(q),
      )
    : recents;
  const activeIndex = list.findIndex((r) => r === cwd);

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
    if (dir) {
      setQuery("");
      setCwd(dir);
    }
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

  // Filter as the user types; keep a folder selected (the top match) so Enter
  // always launches something.
  const onQueryChange = (value: string) => {
    setQuery(value);
    const qq = value.trim().toLowerCase();
    const nl = qq
      ? recents.filter(
          (r) =>
            repoName(r).toLowerCase().includes(qq) ||
            r.toLowerCase().includes(qq),
        )
      : recents;
    if (cwd === null || !nl.includes(cwd)) {
      if (nl[0]) setCwd(nl[0]);
    }
  };

  // Keyboard nav over the recents list (#61): ⌘1–9 jump to a recent; ↑/↓ move the
  // highlight (= the target folder). Enter falls through to the form submit (start).
  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if ((event.metaKey || event.ctrlKey) && /^[1-9]$/.test(event.key)) {
      event.preventDefault();
      const r = list[Number(event.key) - 1];
      if (r) setCwd(r);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (list.length === 0) return;
      const next =
        activeIndex < 0
          ? 0
          : Math.min(
              Math.max(activeIndex + (event.key === "ArrowDown" ? 1 : -1), 0),
              list.length - 1,
            );
      const r = list[next];
      if (r) setCwd(r);
    }
  };

  // ↑/↓ roving over the branch list (#61): move + select the adjacent branch;
  // Enter starts (with the destructive-confirm gate intact via canCreate).
  const onBranchKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!branches) return;
    if (event.key === "Enter") {
      event.preventDefault();
      void create();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const all = branches.all;
    if (all.length === 0) return;
    const i = selectedBranch ? all.indexOf(selectedBranch) : -1;
    const next =
      i < 0
        ? 0
        : Math.min(
            Math.max(i + (event.key === "ArrowDown" ? 1 : -1), 0),
            all.length - 1,
          );
    const b = all[next];
    if (!b) return;
    setSelectedBranch(b);
    setAcknowledged(false);
    branchesRef.current
      ?.querySelectorAll<HTMLButtonElement>("[data-branch]")
      [next]?.focus();
  };

  // Keep Tab focus inside the dialog (focus-trap, a11y #49). Excludes roving
  // tabindex=-1 elements (e.g. unselected branch buttons, #61).
  const onTrapKeyDown = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Tab" || !formRef.current) return;
    const focusable = formRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

        {/* Folder — a keyboard-first launcher (#61): type to filter, ↑/↓ to move,
            ⌘1–9 to jump, ⏎ to start. "Choose folder…" handles a new folder. */}
        <p className={styles.label}>Folder</p>
        {recents.length > 0 && (
          <>
            <input
              ref={searchRef}
              className={styles.search}
              type="text"
              value={query}
              placeholder="Search recent folders…"
              onChange={(event) => onQueryChange(event.currentTarget.value)}
              onKeyDown={onSearchKeyDown}
              aria-label="Search recent folders"
            />
            <div
              ref={recentsRef}
              className={styles.recents}
              role="listbox"
              aria-label="Recent folders"
            >
              {list.length === 0 ? (
                <p className={styles.empty}>No matching folders.</p>
              ) : (
                list.map((recent, i) => (
                  <button
                    key={recent}
                    type="button"
                    role="option"
                    aria-selected={recent === cwd}
                    className={`${styles.recent} ${recent === cwd ? styles.recentActive : ""}`}
                    onClick={() => setCwd(recent)}
                    title={recent}
                  >
                    <span className={styles.recentName}>
                      {repoName(recent)}
                    </span>
                    <span className={styles.recentPath}>{recent}</span>
                    {i < 9 && <kbd className={styles.recentKbd}>⌘{i + 1}</kbd>}
                  </button>
                ))
              )}
            </div>
          </>
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
          {cwd && !recents.includes(cwd) && (
            <span className={styles.path}>{cwd}</span>
          )}
        </div>

        {branches && branches.all.length > 0 && (
          <>
            <p className={styles.label}>Branch</p>
            <div
              ref={branchesRef}
              className={styles.branches}
              role="listbox"
              aria-label="Branch"
              onKeyDown={onBranchKeyDown}
            >
              {branches.all.map((b) => (
                <button
                  key={b}
                  type="button"
                  role="option"
                  aria-selected={b === selectedBranch}
                  data-branch
                  tabIndex={b === selectedBranch ? 0 : -1}
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

        {/* kbd hints (#61) — make the keyboard path discoverable. */}
        <p className={styles.hints}>
          <kbd>⏎</kbd> start
          {recents.length > 0 && (
            <>
              {" · "}
              <kbd>⌘1–9</kbd> recent <kbd>↑↓</kbd> move
            </>
          )}
          {" · "}
          <kbd>esc</kbd> cancel
        </p>

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
