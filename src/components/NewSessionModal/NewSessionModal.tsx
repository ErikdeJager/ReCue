import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  FolderOpen,
  GitBranch,
  Plus,
} from "lucide-react";

import { listBranches, pickDirectory } from "../../ipc";
import { repoName } from "../../paths";
import { useStore } from "../../store";
import type { BranchList } from "../../types";
import Checkbox from "../Checkbox/Checkbox";
import styles from "./NewSessionModal.module.css";

// Well-known branches pinned to the top of the branch list, in this order (#66).
const BRANCH_PRIORITY = ["main", "master", "dev", "develop"];
const branchRank = (b: string) => {
  const i = BRANCH_PRIORITY.indexOf(b);
  return i === -1 ? BRANCH_PRIORITY.length : i;
};
// Stable priority sort (Array.prototype.sort is stable): the pinned branches
// first in BRANCH_PRIORITY order, then the rest in git's original order.
const sortBranches = (all: string[]) =>
  all.slice().sort((a, b) => branchRank(a) - branchRank(b));

// Only show the branch filter once the list is long enough to need it (#66).
const BRANCH_FILTER_THRESHOLD = 4;

/**
 * Start-a-new-agent panel — a two-step, keyboard-driven flow (#66, rework of
 * #53/#61).
 *
 * **Step 1 — Folder:** the recents search is auto-focused; type to filter, ↑/↓
 * to highlight a folder (⌘1–9 still jumps, silently). Enter *advances* to the
 * branch step for a git repo, or starts immediately for a non-git folder.
 *
 * **Step 2 — Branch** (git only): focus lands on the branch picker; a filter
 * input appears when there are >4 branches. main/master/dev/develop are pinned
 * to the top and the current branch is the default selection. Enter starts
 * (checkout-&-start for a non-current branch, with the destructive-confirm gate
 * from #27). Sessions created here have **no custom name** — naming is via the
 * sidebar rename (#57); label display is #67.
 *
 * a11y (#49): focus-trap, focus-restore, Escape / outside-click close.
 */
function NewSessionModal() {
  const open = useStore((s) => s.newSessionOpen);
  const prefillRepo = useStore((s) => s.newSessionRepo);
  const recents = useStore((s) => s.recents);
  const sessions = useStore((s) => s.sessions);
  const close = useStore((s) => s.closeNewSession);
  const spawnSession = useStore((s) => s.spawnSession);
  const spawnWorktreeSession = useStore((s) => s.spawnWorktreeSession);

  const [step, setStep] = useState<"folder" | "branch">("folder");
  const [cwd, setCwd] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  // null = branches not yet loaded for this folder; an empty list = resolved
  // non-git (no branch step).
  const [branches, setBranches] = useState<BranchList | null>(null);
  const [branchQuery, setBranchQuery] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const recentsRef = useRef<HTMLDivElement>(null);
  const branchFilterRef = useRef<HTMLInputElement>(null);
  const branchesRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // The element focused before the dialog opened, restored on close (a11y #49).
  const openerRef = useRef<HTMLElement | null>(null);

  // Reset / prefill each time the panel opens. Default the folder to the prefill
  // repo (per-repo +) else the most-recent folder, so ⌘N → Enter quick-advances.
  useEffect(() => {
    if (!open) return;
    const mostRecent = useStore.getState().recents[0] ?? null;
    setStep("folder");
    setCwd(prefillRepo ?? mostRecent);
    setQuery("");
    setBusy(false);
    setBranches(null);
    setBranchQuery("");
    setSelectedBranch(null);
    setAcknowledged(false);
  }, [open, prefillRepo]);

  // Focus the recents search whenever the folder step is shown (open or Back) —
  // or the folder picker when there are no recents to search.
  useEffect(() => {
    if (!open || step !== "folder") return;
    const timer = setTimeout(() => {
      if (searchRef.current) searchRef.current.focus();
      else chooseRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [open, step]);

  // Detect branches whenever the chosen folder changes; default the selection to
  // the current branch (else the top pinned branch). list_branches returns an
  // empty list for a non-git folder, so it never rejects in practice — the catch
  // is a safety net that also reads as "non-git".
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
        setSelectedBranch(
          bl.all.includes(bl.current)
            ? bl.current
            : (sortBranches(bl.all)[0] ?? null),
        );
        setBranchQuery("");
        setAcknowledged(false);
      })
      .catch(() => {
        if (!cancelled) {
          setBranches({ all: [], current: "" });
          setSelectedBranch(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, cwd]);

  // Branch step: focus the filter (when shown) else the selected branch button.
  useEffect(() => {
    if (!open || step !== "branch") return;
    const showFilter =
      !!branches && branches.all.length > BRANCH_FILTER_THRESHOLD;
    const timer = setTimeout(() => {
      if (showFilter && branchFilterRef.current) {
        branchFilterRef.current.focus();
      } else {
        const el = branchesRef.current?.querySelector(
          '[aria-selected="true"]',
        ) as HTMLElement | null;
        (el ?? branchesRef.current)?.focus();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [open, step, branches]);

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
    if (step !== "folder") return;
    const el = recentsRef.current?.querySelector(
      '[aria-selected="true"]',
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [cwd, step]);

  // Keep the selected branch scrolled into view as ↑/↓ move it — important when
  // the filter input holds focus and the buttons don't.
  useEffect(() => {
    if (step !== "branch") return;
    const el = branchesRef.current?.querySelector(
      '[aria-selected="true"]',
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedBranch, step]);

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

  // Priority-sorted, then filtered branch list (the order the step renders).
  const sortedBranches = branches ? sortBranches(branches.all) : [];
  const bq = branchQuery.trim().toLowerCase();
  const branchList = bq
    ? sortedBranches.filter((b) => b.toLowerCase().includes(bq))
    : sortedBranches;
  const showBranchFilter =
    !!branches && branches.all.length > BRANCH_FILTER_THRESHOLD;
  const folderResolved = branches !== null;
  const folderIsGit = !!branches && branches.all.length > 0;

  const willCheckout =
    folderIsGit && !!selectedBranch && selectedBranch !== branches?.current;
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
    // No custom name from creation anymore (#66) — naming is via rename (#57),
    // display is #67. spawnSession sends a null name to the backend.
    const ok = await spawnSession(
      cwd,
      undefined,
      willCheckout ? (selectedBranch ?? undefined) : undefined,
    );
    if (ok) close();
    else setBusy(false); // stay open so the error (e.g. dirty tree) can be fixed
  };

  // ⌘⏎ in the branch step (#74): start the agent in an isolated git worktree for
  // the selected existing branch (its own folder), instead of the repo folder.
  const createWorktree = async () => {
    if (!cwd || busy || !selectedBranch) return;
    setBusy(true);
    const ok = await spawnWorktreeSession(cwd, selectedBranch);
    if (ok) close();
    else setBusy(false);
  };

  // Folder step Enter / primary button: advance to the branch step for a git
  // repo, or start immediately for a non-git folder. Resolves branches first if
  // they haven't loaded yet, so a fast ⌘N → Enter still does the right thing.
  const advanceFromFolder = async () => {
    if (!cwd || busy) return;
    let bl = branches;
    if (bl === null) {
      bl = await listBranches(cwd).catch(() => ({ all: [], current: "" }));
      setBranches(bl);
      setSelectedBranch(
        bl.all.includes(bl.current)
          ? bl.current
          : (sortBranches(bl.all)[0] ?? null),
      );
    }
    if (bl.all.length > 0) setStep("branch");
    else void create();
  };

  const backToFolder = () => {
    setBranchQuery("");
    setStep("folder");
  };

  // Filter as the user types; keep a folder selected (the top match) so Enter
  // always advances something.
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

  // Keyboard nav over the recents list (#61): ⌘1–9 jump to a recent (kept,
  // unhinted); ↑/↓ move the highlight (= target folder). Enter falls through to
  // the form submit, which advances the step.
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

  // Filter the branch list as the user types; keep a branch selected (top match)
  // so Enter always starts something.
  const onBranchQueryChange = (value: string) => {
    setBranchQuery(value);
    const vq = value.trim().toLowerCase();
    const nl = vq
      ? sortedBranches.filter((b) => b.toLowerCase().includes(vq))
      : sortedBranches;
    if (selectedBranch === null || !nl.includes(selectedBranch)) {
      setSelectedBranch(nl[0] ?? null);
    }
  };

  // Move + select the adjacent branch in the (filtered) list; returns its index.
  const moveBranch = (delta: number) => {
    if (branchList.length === 0) return -1;
    const i = selectedBranch ? branchList.indexOf(selectedBranch) : -1;
    const next =
      i < 0 ? 0 : Math.min(Math.max(i + delta, 0), branchList.length - 1);
    const b = branchList[next];
    if (b) {
      setSelectedBranch(b);
      setAcknowledged(false);
    }
    return next;
  };

  // ↑/↓ in the branch filter input: move the selection only (keep typing focus).
  // Enter falls through to the form submit (start).
  const onBranchQueryKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) => {
    // ⌘⏎ starts in an isolated worktree (#74); plain Enter falls through to the
    // form submit (normal start in the repo folder).
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void createWorktree();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    moveBranch(event.key === "ArrowDown" ? 1 : -1);
  };

  // ↑/↓ roving over the branch list; Enter starts (gated by canCreate). Branch
  // buttons are type=button, so Enter wouldn't submit the form — handle it here.
  const onBranchKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      // ⌘⏎ = start in an isolated worktree (#74); Enter = normal start.
      if (event.metaKey || event.ctrlKey) void createWorktree();
      else void create();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const next = moveBranch(event.key === "ArrowDown" ? 1 : -1);
    if (next >= 0) {
      branchesRef.current
        ?.querySelectorAll<HTMLButtonElement>("[data-branch]")
        [next]?.focus();
    }
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
          if (step === "folder") void advanceFromFolder();
          else void create();
        }}
      >
        <h2 className={styles.title}>
          <Plus size={15} strokeWidth={2} className={styles.titleIcon} />
          New session
        </h2>

        {step === "folder" ? (
          <>
            {/* Folder step — keyboard-first launcher (#61/#66): type to filter,
                ↑/↓ to move, ⌘1–9 to jump, ⏎ to continue/start. */}
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
                    list.map((recent) => (
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

            <div className={styles.actions}>
              <button type="button" className={styles.cancel} onClick={close}>
                Cancel <kbd className={styles.btnKbd}>esc</kbd>
              </button>
              <button
                type="submit"
                className={styles.create}
                disabled={!cwd || busy}
              >
                {folderResolved && !folderIsGit ? "Start" : "Continue"}
                <kbd className={styles.btnKbd}>⏎</kbd>
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Branch step (git only) — back affordance, filter (>4), list. */}
            <button
              type="button"
              className={styles.folderBack}
              onClick={backToFolder}
              aria-label="Change folder"
            >
              <ChevronLeft size={14} strokeWidth={1.5} />
              <span className={styles.folderBackName}>
                {cwd ? repoName(cwd) : ""}
              </span>
              <span className={styles.folderBackHint}>change folder</span>
            </button>

            <p className={styles.label}>Branch</p>
            {showBranchFilter && (
              <input
                ref={branchFilterRef}
                className={styles.search}
                type="text"
                value={branchQuery}
                placeholder="Filter branches…"
                onChange={(event) =>
                  onBranchQueryChange(event.currentTarget.value)
                }
                onKeyDown={onBranchQueryKeyDown}
                aria-label="Filter branches"
              />
            )}
            <div
              ref={branchesRef}
              className={styles.branches}
              role="listbox"
              aria-label="Branch"
              onKeyDown={onBranchKeyDown}
            >
              {branchList.length === 0 ? (
                <p className={styles.empty}>No matching branches.</p>
              ) : (
                branchList.map((b) => (
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
                    {b === branches?.current && (
                      <span className={styles.branchCurrent}>current</span>
                    )}
                  </button>
                ))
              )}
            </div>

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
                Cancel <kbd className={styles.btnKbd}>esc</kbd>
              </button>
              {/* Isolated worktree (#74): its own folder + separate checkout. */}
              <button
                type="button"
                className={styles.cancel}
                onClick={() => void createWorktree()}
                disabled={!cwd || busy || !selectedBranch}
                title="Start in an isolated git worktree"
              >
                Worktree <kbd className={styles.btnKbd}>⌘⏎</kbd>
              </button>
              <button
                type="submit"
                className={styles.create}
                disabled={!canCreate}
              >
                {willCheckout ? "Checkout & start" : "Start"}
                <kbd className={styles.btnKbd}>⏎</kbd>
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

export default NewSessionModal;
