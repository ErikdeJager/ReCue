import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  Clock,
  FolderOpen,
  GitBranch,
  Plus,
} from "lucide-react";

import { listBranches, listSkills, pickDirectory } from "../../ipc";
import { repoName } from "../../paths";
import { useStore } from "../../store";
import { toLocalInput } from "../../time";
import type { BranchList, SkillInfo } from "../../types";
import SkillAutocomplete from "../SkillAutocomplete/SkillAutocomplete";
import { moveFolderHighlight } from "./folderNav";
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

// Default lead time for a new schedule (#93): 5 minutes out, so the prefilled
// launch time is sensibly in the future.
const DEFAULT_LEAD_MS = 5 * 60 * 1000;

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
  const createBranchSession = useStore((s) => s.createBranchSession);
  const createBranchWorktreeSession = useStore(
    (s) => s.createBranchWorktreeSession,
  );
  const scheduleMode = useStore((s) => s.scheduleMode);
  const scheduleSession = useStore((s) => s.scheduleSession);

  const [step, setStep] = useState<"folder" | "branch" | "schedule">("folder");
  const [cwd, setCwd] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  // null = branches not yet loaded for this folder; an empty list = resolved
  // non-git (no branch step).
  const [branches, setBranches] = useState<BranchList | null>(null);
  const [branchQuery, setBranchQuery] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  // Schedule step (#93): launch time (datetime-local string), optional prompt + name.
  const [fireAt, setFireAt] = useState("");
  const [prompt, setPrompt] = useState("");
  const [schedName, setSchedName] = useState("");
  // Slash-command skills for the chosen folder (#114) — feeds the prompt
  // autocomplete; best-effort, so it degrades to an empty list (no dropdown).
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  // The "Choose folder" picker is keyboard-highlighted (#123) — a virtual option
  // after the recents (ArrowDown past the last recent; Enter opens it).
  const [pickerActive, setPickerActive] = useState(false);
  // "+ add branch" (#124): the create-a-new-branch option below the branch list.
  // When active, an inline form (name + base) shows; Enter creates + starts, ⌘⏎
  // creates as a worktree. New-session (immediate) path only — schedule mode is #125.
  const [addBranchActive, setAddBranchActive] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchBase, setNewBranchBase] = useState("");
  const [branchError, setBranchError] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const fireAtRef = useRef<HTMLInputElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const recentsRef = useRef<HTMLDivElement>(null);
  const branchFilterRef = useRef<HTMLInputElement>(null);
  const branchesRef = useRef<HTMLDivElement>(null);
  const newBranchNameRef = useRef<HTMLInputElement>(null);
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
    setFireAt(toLocalInput(new Date(Date.now() + DEFAULT_LEAD_MS)));
    setPrompt("");
    setSchedName("");
    setPickerActive(false);
    setAddBranchActive(false);
    setNewBranchName("");
    setBranchError(null);
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
        // Reset the "+ add branch" form for the new folder; default its base to the
        // folder's current branch (#124).
        setAddBranchActive(false);
        setNewBranchName("");
        setBranchError(null);
        setNewBranchBase(bl.current || sortBranches(bl.all)[0] || "");
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

  // "+ add branch" (#124): when it becomes active, focus the new-branch name input
  // so the user can type immediately (the highlight is state-based, like #123).
  useEffect(() => {
    if (!addBranchActive) return;
    const timer = setTimeout(() => newBranchNameRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [addBranchActive]);

  // Schedule step (#93): focus the launch-time input when it's shown.
  useEffect(() => {
    if (!open || step !== "schedule") return;
    const timer = setTimeout(() => fireAtRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open, step]);

  // Load the chosen folder's slash-command skills for the prompt autocomplete
  // (#114, schedule mode only). Best-effort: any failure leaves the list empty.
  useEffect(() => {
    if (!open || !scheduleMode || !cwd) {
      setSkills([]);
      return;
    }
    let cancelled = false;
    void listSkills(cwd)
      .then((s) => {
        if (!cancelled) setSkills(s);
      })
      .catch(() => {
        if (!cancelled) setSkills([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, scheduleMode, cwd]);

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

  // Keep the highlighted recent — or the folder picker (#123) — scrolled into view
  // as ↑/↓ / ⌘1–9 move the highlight.
  useEffect(() => {
    if (step !== "folder") return;
    if (pickerActive) {
      chooseRef.current?.scrollIntoView({ block: "nearest" });
      return;
    }
    const el = recentsRef.current?.querySelector(
      '[aria-selected="true"]',
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [cwd, step, pickerActive]);

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
  const canCreate = !!cwd && !busy;

  const pick = async () => {
    setPickerActive(false);
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

  // "+ add branch" (#124): create + check out a new branch from the chosen base and
  // start a normal agent. The store returns `true` on success, else an error message
  // (invalid / already-existing name) shown inline; on error we stay open.
  const confirmAddBranch = async () => {
    if (!cwd || busy) return;
    const name = newBranchName.trim();
    if (!name) {
      setBranchError("Enter a branch name");
      return;
    }
    setBusy(true);
    setBranchError(null);
    const result = await createBranchSession(cwd, name, newBranchBase);
    if (result === true) close();
    else {
      setBranchError(result);
      setBusy(false);
    }
  };

  // ⌘⏎ on "+ add branch" (#124): create the new branch as an isolated worktree (#74)
  // and start the agent there (no checkout of the repo folder).
  const confirmAddBranchWorktree = async () => {
    if (!cwd || busy) return;
    const name = newBranchName.trim();
    if (!name) {
      setBranchError("Enter a branch name");
      return;
    }
    setBusy(true);
    setBranchError(null);
    const result = await createBranchWorktreeSession(cwd, name, newBranchBase);
    if (result === true) close();
    else {
      setBranchError(result);
      setBusy(false);
    }
  };

  // New-branch name input keys (#124/#125): in new-session mode Enter creates +
  // starts (⌘⏎ as a worktree); in schedule mode Enter advances to the launch-time
  // step (no worktree — #125). ArrowUp returns to the branch list.
  const onNewBranchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (scheduleMode) goToScheduleFromBranch();
      else if (event.metaKey || event.ctrlKey) void confirmAddBranchWorktree();
      else void confirmAddBranch();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setAddBranchActive(false);
      const btns =
        branchesRef.current?.querySelectorAll<HTMLButtonElement>(
          "[data-branch]",
        );
      (btns?.[btns.length - 1] ?? branchFilterRef.current)?.focus();
    }
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
    else if (scheduleMode) setStep("schedule");
    else void create();
  };

  const backToFolder = () => {
    setBranchQuery("");
    setStep("folder");
  };

  // Schedule mode (#93): advance the branch step → the launch-time step.
  const goToSchedule = () => {
    if (!cwd || busy) return;
    setStep("schedule");
  };

  // Schedule mode + "+ add branch" (#125): validate the new-branch name, then advance
  // to the launch-time step (the branch is created when the schedule fires, not now).
  const goToScheduleFromBranch = () => {
    if (addBranchActive && !newBranchName.trim()) {
      setBranchError("Enter a branch name");
      return;
    }
    goToSchedule();
  };

  const backFromSchedule = () => setStep(folderIsGit ? "branch" : "folder");

  // Create the schedule from the launch-time step (#93): parse the local
  // datetime-local value → unix secs, carry the optional branch/name/prompt. A
  // "+ add branch" intent (#125) records the new branch (created at fire time).
  const submitSchedule = async () => {
    if (!cwd || busy) return;
    const ms = new Date(fireAt).getTime();
    if (!Number.isFinite(ms)) return;
    const useNewBranch = addBranchActive && !!newBranchName.trim();
    const branchArg = useNewBranch
      ? newBranchName.trim()
      : willCheckout
        ? (selectedBranch ?? null)
        : null;
    setBusy(true);
    const ok = await scheduleSession(
      cwd,
      branchArg,
      schedName.trim() || null,
      prompt.trim() || null,
      Math.floor(ms / 1000),
      useNewBranch,
      useNewBranch ? newBranchBase : null,
    );
    if (ok) close();
    else setBusy(false);
  };

  // Filter as the user types; keep a folder selected (the top match) so Enter
  // always advances something.
  const onQueryChange = (value: string) => {
    setQuery(value);
    // Typing re-filters the recents → return the highlight to a recent (#123).
    setPickerActive(false);
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
    // Enter while the folder picker is highlighted opens it (#123) — handled here
    // (not just the form submit) so it works even if the submit button is disabled.
    if (event.key === "Enter" && pickerActive) {
      event.preventDefault();
      void pick();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && /^[1-9]$/.test(event.key)) {
      event.preventDefault();
      const r = list[Number(event.key) - 1];
      if (r) {
        setCwd(r);
        setPickerActive(false);
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      // The picker is a virtual option after the recents (#123): ArrowDown past the
      // last recent (or from a filtered-empty list) highlights it; ArrowUp returns.
      const next = moveFolderHighlight(
        { index: activeIndex, picker: pickerActive },
        list.length,
        event.key === "ArrowDown" ? "down" : "up",
      );
      setPickerActive(next.picker);
      if (!next.picker) {
        const r = list[next.index];
        if (r) setCwd(r);
      }
    }
  };

  // Filter the branch list as the user types; keep a branch selected (top match)
  // so Enter always starts something.
  const onBranchQueryChange = (value: string) => {
    setBranchQuery(value);
    setAddBranchActive(false); // re-filtering returns the highlight to a branch (#124)
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
    if (b) setSelectedBranch(b);
    return next;
  };

  // ↑/↓ in the branch filter input: move the selection only (keep typing focus).
  // Enter falls through to the form submit (start).
  const onBranchQueryKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) => {
    // ⌘⏎ starts in an isolated worktree (#74); plain Enter falls through to the
    // form submit (normal start in the repo folder). No worktree in schedule mode.
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (!scheduleMode) void createWorktree();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const down = event.key === "ArrowDown";
    // ArrowDown past the last branch (or from a filtered-empty list) highlights the
    // "+ add branch" option (#124; also in schedule mode #125); ArrowUp is handled
    // in its input.
    if (down) {
      const i = selectedBranch ? branchList.indexOf(selectedBranch) : -1;
      if (i >= branchList.length - 1) {
        setAddBranchActive(true);
        return;
      }
    }
    moveBranch(down ? 1 : -1);
  };

  // ↑/↓ roving over the branch list; Enter starts (gated by canCreate). Branch
  // buttons are type=button, so Enter wouldn't submit the form — handle it here.
  const onBranchKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      // Schedule mode (#93): advance to the launch-time step. Else ⌘⏎ = worktree
      // (#74), plain Enter = normal start.
      if (scheduleMode) goToSchedule();
      else if (event.metaKey || event.ctrlKey) void createWorktree();
      else void create();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const down = event.key === "ArrowDown";
    // ArrowDown past the last branch (or from a filtered-empty list) highlights the
    // "+ add branch" option (#124; also in schedule mode #125); ArrowUp is handled
    // in its input.
    if (down) {
      const i = selectedBranch ? branchList.indexOf(selectedBranch) : -1;
      if (i >= branchList.length - 1) {
        setAddBranchActive(true);
        return;
      }
    }
    const next = moveBranch(down ? 1 : -1);
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
        aria-label={scheduleMode ? "Schedule session" : "New session"}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onTrapKeyDown}
        onSubmit={(event) => {
          event.preventDefault();
          if (step === "folder") {
            // Enter on the highlighted folder picker opens it (#123); otherwise
            // advance with the highlighted recent.
            if (pickerActive) void pick();
            else void advanceFromFolder();
          } else if (step === "branch") {
            if (addBranchActive) {
              if (scheduleMode) goToScheduleFromBranch();
              else void confirmAddBranch();
            } else if (scheduleMode) goToSchedule();
            else void create();
          } else {
            void submitSchedule();
          }
        }}
      >
        <h2 className={styles.title}>
          {scheduleMode ? (
            <Clock size={15} strokeWidth={2} className={styles.titleIcon} />
          ) : (
            <Plus size={15} strokeWidth={2} className={styles.titleIcon} />
          )}
          {scheduleMode ? "Schedule session" : "New session"}
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
                        aria-selected={recent === cwd && !pickerActive}
                        className={`${styles.recent} ${recent === cwd && !pickerActive ? styles.recentActive : ""}`}
                        onClick={() => {
                          setCwd(recent);
                          setPickerActive(false);
                        }}
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
                // Keyboard-highlightable as a virtual option after the recents
                // (#123): ArrowDown past the last recent selects it, Enter opens it.
                aria-selected={pickerActive}
                className={`${styles.pickButton} ${pickerActive ? styles.pickButtonActive : ""}`}
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
                {scheduleMode
                  ? "Continue"
                  : folderResolved && !folderIsGit
                    ? "Start"
                    : "Continue"}
                <kbd className={styles.btnKbd}>⏎</kbd>
              </button>
            </div>
          </>
        ) : step === "branch" ? (
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
                    aria-selected={b === selectedBranch && !addBranchActive}
                    data-branch
                    tabIndex={b === selectedBranch && !addBranchActive ? 0 : -1}
                    className={`${styles.branch} ${b === selectedBranch && !addBranchActive ? styles.branchActive : ""}`}
                    onClick={() => {
                      setSelectedBranch(b);
                      setAddBranchActive(false);
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

            {/* "+ add branch" (#124/#125): the create-a-new-branch option after all
                existing branches — outside the listbox (like #123's folder picker)
                so its own Enter/click activates it, not the list's start handler.
                Both modes: in schedule mode (#125) it records intent (created at fire
                time) instead of creating now. */}
            <button
              type="button"
              aria-selected={addBranchActive}
              className={`${styles.branch} ${styles.addBranch} ${addBranchActive ? styles.branchActive : ""}`}
              onClick={() => setAddBranchActive(true)}
              title="Create a new branch"
            >
              <Plus size={13} strokeWidth={1.5} />
              <span className={styles.branchName}>add branch</span>
            </button>

            {/* Inline new-branch form (#124/#125): name + base dropdown (default
                current branch). New-session: Enter creates + starts, ⌘⏎ as a worktree.
                Schedule: Enter advances; the branch is created when the schedule fires. */}
            {addBranchActive && (
              <div className={styles.addBranchForm}>
                <input
                  ref={newBranchNameRef}
                  className={styles.search}
                  type="text"
                  value={newBranchName}
                  placeholder="New branch name…"
                  onChange={(event) => {
                    setNewBranchName(event.currentTarget.value);
                    setBranchError(null);
                  }}
                  onKeyDown={onNewBranchKeyDown}
                  aria-label="New branch name"
                />
                <label className={styles.baseRow}>
                  <span className={styles.baseLabel}>from</span>
                  <select
                    className={styles.baseSelect}
                    value={newBranchBase}
                    onChange={(event) =>
                      setNewBranchBase(event.currentTarget.value)
                    }
                    aria-label="Base branch"
                  >
                    {sortedBranches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                        {b === branches?.current ? " (current)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {branchError && (
                  <p className={styles.branchError} role="alert">
                    {branchError}
                  </p>
                )}
              </div>
            )}

            {!scheduleMode &&
              (isDestructive || addBranchActive) &&
              runningInFolder > 0 && (
                <div className={styles.warning}>
                  <AlertTriangle
                    size={14}
                    strokeWidth={1.5}
                    className={styles.warnIcon}
                  />
                  <span className={styles.warnText}>
                    {addBranchActive ? (
                      <>
                        Creating{" "}
                        <strong>
                          {newBranchName.trim() || "a new branch"}
                        </strong>{" "}
                        checks it out, changing the working tree under{" "}
                      </>
                    ) : (
                      <>
                        Checking out <strong>{selectedBranch}</strong> changes
                        the working tree under{" "}
                      </>
                    )}
                    {runningInFolder} running agent
                    {runningInFolder > 1 ? "s" : ""} in this folder.
                  </span>
                </div>
              )}

            <div className={styles.actions}>
              <button type="button" className={styles.cancel} onClick={close}>
                Cancel <kbd className={styles.btnKbd}>esc</kbd>
              </button>
              {/* Isolated worktree (#74): its own folder + separate checkout. Not
                  offered when scheduling (#93 part 1 schedules a normal agent). When
                  "+ add branch" is active, it creates the new branch as a worktree (#124). */}
              {!scheduleMode && (
                <button
                  type="button"
                  className={styles.cancel}
                  onClick={() =>
                    addBranchActive
                      ? void confirmAddBranchWorktree()
                      : void createWorktree()
                  }
                  disabled={
                    !cwd ||
                    busy ||
                    (addBranchActive ? !newBranchName.trim() : !selectedBranch)
                  }
                  title="Start in an isolated git worktree"
                >
                  Worktree <kbd className={styles.btnKbd}>⌘⏎</kbd>
                </button>
              )}
              <button
                type="submit"
                className={styles.create}
                disabled={
                  !canCreate || (addBranchActive && !newBranchName.trim())
                }
              >
                {scheduleMode
                  ? "Next"
                  : addBranchActive
                    ? "Create & start"
                    : "Start"}
                <kbd className={styles.btnKbd}>⏎</kbd>
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Schedule step (#93): launch time + optional prompt + optional name.
                Back returns to the branch step (git) or the folder step (non-git). */}
            <button
              type="button"
              className={styles.folderBack}
              onClick={backFromSchedule}
              aria-label="Back"
            >
              <ChevronLeft size={14} strokeWidth={1.5} />
              <span className={styles.folderBackName}>
                {addBranchActive && newBranchName.trim()
                  ? `new: ${newBranchName.trim()}`
                  : folderIsGit && selectedBranch
                    ? selectedBranch
                    : cwd
                      ? repoName(cwd)
                      : ""}
              </span>
              <span className={styles.folderBackHint}>back</span>
            </button>

            <p className={styles.label}>Launch time</p>
            <input
              ref={fireAtRef}
              className={styles.search}
              type="datetime-local"
              value={fireAt}
              onChange={(event) => setFireAt(event.currentTarget.value)}
              aria-label="Launch time"
            />

            <p className={styles.label}>Prompt (optional)</p>
            <SkillAutocomplete
              className={styles.promptInput}
              value={prompt}
              onChange={setPrompt}
              skills={skills}
              placeholder="Initial prompt for claude…"
              rows={3}
              ariaLabel="Initial prompt"
            />

            <p className={styles.label}>Name (optional)</p>
            <input
              className={styles.search}
              type="text"
              value={schedName}
              placeholder="Custom name…"
              onChange={(event) => setSchedName(event.currentTarget.value)}
              aria-label="Custom name"
            />

            <div className={styles.actions}>
              <button type="button" className={styles.cancel} onClick={close}>
                Cancel <kbd className={styles.btnKbd}>esc</kbd>
              </button>
              <button
                type="submit"
                className={styles.create}
                disabled={!cwd || busy || !fireAt}
              >
                Schedule <kbd className={styles.btnKbd}>⏎</kbd>
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

export default NewSessionModal;
