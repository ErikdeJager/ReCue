import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  Clock,
  FolderOpen,
  GitBranch,
  Plus,
  RefreshCw,
} from "lucide-react";

import { noAutoCapitalize } from "../../inputProps";
import {
  fetchRemotes,
  listBranches,
  listSkills,
  pickDirectory,
} from "../../ipc";
import { repoName } from "../../paths";
import { kbdHint } from "../../platform";
import { useStore } from "../../store";
import {
  formatFireTime,
  type IntervalUnit,
  intervalToSeconds,
  parseWhen,
  SCHEDULE_TIME_HINT,
} from "../../time";
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

// The local name a remote ref pulls into (#180): strip the first path segment
// (the remote name), so `origin/feature/foo` → `feature/foo`. Matches the backend
// dedup split (`split_once('/')`).
const remoteShortName = (ref: string) => {
  const i = ref.indexOf("/");
  return i === -1 ? ref : ref.slice(i + 1);
};

// Default launch time for a new schedule (#93/#268): the natural-language field is
// seeded with a short relative duration, so the prefilled time is sensibly future
// and demonstrates the accepted syntax.
const DEFAULT_WHEN = "in 5 min";

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
  const platform = useStore((s) => s.platform);
  const close = useStore((s) => s.closeNewSession);
  const spawnSession = useStore((s) => s.spawnSession);
  const spawnWorktreeSession = useStore((s) => s.spawnWorktreeSession);
  const createBranchSession = useStore((s) => s.createBranchSession);
  const createBranchWorktreeSession = useStore(
    (s) => s.createBranchWorktreeSession,
  );
  const scheduleMode = useStore((s) => s.scheduleMode);
  const scheduleSession = useStore((s) => s.scheduleSession);
  const recurringMode = useStore((s) => s.recurringMode);
  const createRecurring = useStore((s) => s.createRecurring);
  // Both schedule + recurring modes defer creation to a final step (no immediate
  // spawn / worktree-in-branch / remote-pull) — several branch-step behaviors gate
  // on this shared flag rather than `scheduleMode` alone (#294).
  const deferMode = scheduleMode || recurringMode;
  // Branches preloaded by the per-repo start path (#127): when set, open straight at
  // the branch step seeded with these (no folder step, no second list_branches).
  const initialBranches = useStore((s) => s.newSessionInitialBranches);
  // Per-repo start (#263): open straight at the branch step but WITHOUT preloaded
  // branches — the modal appears instantly and loads them itself. A non-git folder
  // resolves to no branches and spawns directly + closes (the #127 no-modal behavior).
  const atBranch = useStore((s) => s.newSessionAtBranch);

  const [step, setStep] = useState<
    "folder" | "branch" | "schedule" | "recurring"
  >("folder");
  const [cwd, setCwd] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  // null = branches not yet loaded for this folder; an empty list = resolved
  // non-git (no branch step).
  const [branches, setBranches] = useState<BranchList | null>(null);
  const [branchQuery, setBranchQuery] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  // Remote branches (#180): the highlighted remote ref (e.g. `origin/feature-x`),
  // mutually exclusive with `selectedBranch` / `addBranchActive` as the active row.
  // `fetchingRemotes` shows a "fetching…" hint while the on-open `git fetch` runs.
  const [selectedRemote, setSelectedRemote] = useState<string | null>(null);
  const [fetchingRemotes, setFetchingRemotes] = useState(false);
  // Schedule step (#93/#268): launch time as a free-text natural-language string
  // (parsed by `parseWhen`), optional prompt + name.
  const [fireAt, setFireAt] = useState("");
  const [prompt, setPrompt] = useState("");
  const [schedName, setSchedName] = useState("");
  // Recurring step (#294): the repeat interval (amount + unit). First run reuses the
  // `fireAt` field (default "now" for recurring); prompt/name are shared with schedule.
  const [intervalAmount, setIntervalAmount] = useState("1");
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>("hour");
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
  // Inline error on the schedule step (#259): a worktree schedule now creates its
  // worktree + branch eagerly at schedule time, so a bad/duplicate branch surfaces here
  // (like `branchError` on the branch step) instead of only as a toast.
  const [schedError, setSchedError] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const fireAtRef = useRef<HTMLInputElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const recentsRef = useRef<HTMLDivElement>(null);
  const branchFilterRef = useRef<HTMLInputElement>(null);
  const branchesRef = useRef<HTMLDivElement>(null);
  const newBranchNameRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // The repo whose branches were preloaded for a branch-step open (#127): while set,
  // the branch-detection effect keeps the seeded branches (skips its own reload) until
  // cwd settles to this repo, then clears it (a later folder change reloads normally).
  const preloadCwd = useRef<string | null>(null);
  // Marks a per-repo branch-step open whose branches load lazily (#263): the
  // branch-detection effect, on resolving the folder as non-git (no branches), spawns
  // directly + closes instead of showing the (empty) branch step. Consumed once.
  const autoBranchStep = useRef(false);
  // The element focused before the dialog opened, restored on close (a11y #49).
  const openerRef = useRef<HTMLElement | null>(null);

  // Reset / prefill each time the panel opens. Default the folder to the prefill
  // repo (per-repo +) else the most-recent folder, so ⌘N → Enter quick-advances.
  useEffect(() => {
    if (!open) return;
    const mostRecent = useStore.getState().recents[0] ?? null;
    // Common resets (#93/#114/#123/#124) — independent of which step we open at.
    setQuery("");
    setBusy(false);
    setBranchQuery("");
    // Recurring defaults its first run to "now" (immediate); schedule uses a short
    // future duration so the demo time is sensibly in the future (#294).
    setFireAt(recurringMode ? "now" : DEFAULT_WHEN);
    setPrompt("");
    setSchedName("");
    setIntervalAmount("1");
    setIntervalUnit("hour");
    setPickerActive(false);
    setAddBranchActive(false);
    setNewBranchName("");
    setBranchError(null);
    setSchedError(null);
    setSelectedRemote(null);
    setFetchingRemotes(false);
    if (initialBranches && prefillRepo) {
      // #127: per-repo start on a git folder — open straight at the branch step with
      // the preloaded branch list (folder step skipped; no second list_branches).
      const current = initialBranches.all.includes(initialBranches.current)
        ? initialBranches.current
        : (sortBranches(initialBranches.all)[0] ?? null);
      setStep("branch");
      setCwd(prefillRepo);
      setBranches(initialBranches);
      setSelectedBranch(current);
      setNewBranchBase(
        initialBranches.current || sortBranches(initialBranches.all)[0] || "",
      );
      // Tell the detection effect to keep these seeded branches (skip its reload).
      preloadCwd.current = prefillRepo;
      autoBranchStep.current = false;
    } else if (atBranch && prefillRepo) {
      // #263: per-repo start without preloaded branches — open instantly at the branch
      // step with the list still loading. The detection effect (deps [open, cwd]) does
      // the list_branches and fills it; here we only set the step + clear the seed, and
      // flag the auto branch-step so a non-git resolution spawns directly + closes.
      setStep("branch");
      setCwd(prefillRepo);
      setBranches(null);
      setSelectedBranch(null);
      preloadCwd.current = null;
      autoBranchStep.current = true;
    } else {
      setStep("folder");
      setCwd(prefillRepo ?? mostRecent);
      setBranches(null);
      setSelectedBranch(null);
      preloadCwd.current = null;
      autoBranchStep.current = false;
    }
  }, [open, prefillRepo, initialBranches, atBranch, recurringMode]);

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
    // #127: while a per-repo branch-step preload is pending, keep the seeded branches
    // — don't reload or clear them; consume the marker once cwd settles to that repo
    // (then a later folder change reloads normally).
    if (preloadCwd.current) {
      if (cwd === preloadCwd.current) preloadCwd.current = null;
      return;
    }
    if (!open || !cwd) {
      setBranches(null);
      setSelectedBranch(null);
      return;
    }
    const folder = cwd;
    let cancelled = false;
    void listBranches(cwd)
      .then((bl) => {
        if (cancelled) return;
        // #263: a per-repo branch-step open (no preloaded branches) that resolves to a
        // non-git folder has no branch to pick — spawn directly + close, preserving
        // #127's no-modal behavior now that the modal opened instantly. Consume the flag.
        if (autoBranchStep.current) {
          autoBranchStep.current = false;
          if (bl.all.length === 0) {
            useStore.getState().closeNewSession();
            void useStore.getState().spawnSession(folder);
            return;
          }
        }
        setBranches(bl);
        setSelectedBranch(
          bl.all.includes(bl.current)
            ? bl.current
            : (sortBranches(bl.all)[0] ?? null),
        );
        setSelectedRemote(null);
        setBranchQuery("");
        // Reset the "+ add branch" form for the new folder; default its base to the
        // folder's current branch (#124).
        setAddBranchActive(false);
        setNewBranchName("");
        setBranchError(null);
        setNewBranchBase(bl.current || sortBranches(bl.all)[0] || "");
      })
      .catch(() => {
        if (cancelled) return;
        // #263: a failed detection on a per-repo branch-step open reads as non-git too
        // (matches the old startRepoSession catch) — spawn directly + close.
        if (autoBranchStep.current) {
          autoBranchStep.current = false;
          useStore.getState().closeNewSession();
          void useStore.getState().spawnSession(folder);
          return;
        }
        setBranches({ all: [], current: "", remote: [] });
        setSelectedBranch(null);
        setSelectedRemote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, cwd]);

  // Auto-fetch remote branches when the branch step opens for a git folder (#180):
  // `git fetch --prune` (best-effort), then re-list to pick up freshly-fetched
  // remotes (and any new locals). Shows local branches immediately (never blocks on
  // the fetch); an offline/auth-failing repo degrades to the cached remote refs.
  // Runs for both the folder→branch path and the #127 preload (whose seeded
  // branches may lack `remote`). New-session only — schedule mode is unchanged.
  useEffect(() => {
    if (!open || step !== "branch" || deferMode || !cwd) return;
    const folder = cwd;
    let cancelled = false;
    setFetchingRemotes(true);
    void fetchRemotes(folder)
      .catch(() => {
        // Best-effort: swallow offline / auth / no-remote failures.
      })
      .then(() => (cancelled ? null : listBranches(folder)))
      .then((bl) => {
        // Refresh only the lists; keep the user's current selection untouched.
        if (!cancelled && bl) setBranches(bl);
      })
      .catch(() => {
        // A failed re-list leaves the already-shown branches in place.
      })
      .finally(() => {
        if (!cancelled) setFetchingRemotes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, step, cwd, deferMode]);

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

  // Schedule / recurring step: focus the launch-time input when it's shown (#93/#294).
  useEffect(() => {
    if (!open || (step !== "schedule" && step !== "recurring")) return;
    const timer = setTimeout(() => fireAtRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open, step]);

  // Load the chosen folder's slash-command skills for the prompt autocomplete
  // (#114, schedule/recurring modes only). Best-effort: failure → empty list.
  useEffect(() => {
    if (!open || !deferMode || !cwd) {
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
  }, [open, deferMode, cwd]);

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

  // Keep the selected branch (local or remote, #180) scrolled into view as ↑/↓
  // move it — important when the filter input holds focus and the buttons don't.
  useEffect(() => {
    if (step !== "branch") return;
    const el = branchesRef.current?.querySelector(
      '[aria-selected="true"]',
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedBranch, selectedRemote, step]);

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
  // #263: the per-repo "+" opens the branch step before branches have loaded — show a
  // "loading…" affordance and gate its actions until the list resolves. The folder→branch
  // and #127 paths already have branches when the branch step shows, so this is inert there.
  const branchesLoading = step === "branch" && branches === null;

  // Remote branches (#180): in git order, filtered by the same branch filter.
  // Hidden in schedule mode (selecting one is an immediate pull-&-start, not a
  // schedule), so the schedule flow is unchanged.
  const sortedRemotes = deferMode ? [] : (branches?.remote ?? []);
  const remoteList = bq
    ? sortedRemotes.filter((r) => r.toLowerCase().includes(bq))
    : sortedRemotes;
  // The selectable rows inside the branch listbox, in DOM order: locals then
  // remotes. The roving nav + the post-list "+ add branch" option traverse this.
  const rows: { kind: "local" | "remote"; value: string }[] = [
    ...branchList.map((b) => ({ kind: "local" as const, value: b })),
    ...remoteList.map((r) => ({ kind: "remote" as const, value: r })),
  ];
  const currentRowIndex = () => {
    if (selectedRemote !== null)
      return rows.findIndex(
        (r) => r.kind === "remote" && r.value === selectedRemote,
      );
    if (selectedBranch !== null)
      return rows.findIndex(
        (r) => r.kind === "local" && r.value === selectedBranch,
      );
    return -1;
  };
  // Select the row at `index` (clearing the add-branch highlight); optionally move
  // DOM focus to its button (querySelectorAll order matches `rows`).
  const selectRow = (index: number, focus: boolean) => {
    const row = rows[index];
    if (!row) return;
    if (row.kind === "local") {
      setSelectedBranch(row.value);
      setSelectedRemote(null);
    } else {
      setSelectedRemote(row.value);
    }
    setAddBranchActive(false);
    if (focus) {
      branchesRef.current
        ?.querySelectorAll<HTMLButtonElement>("[data-branch],[data-remote]")
        [index]?.focus();
    }
  };

  const willCheckout =
    folderIsGit && !!selectedBranch && selectedBranch !== branches?.current;
  const runningInFolder = sessions.filter(
    (s) => s.repoPath === cwd && s.exitedCode === undefined,
  ).length;
  // A remote row is the active selection (a pull-&-start, which checks out a new
  // local branch in the folder → destructive when agents already run there).
  const isRemoteActive =
    !deferMode && selectedRemote !== null && !addBranchActive;
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
    // #263: no-op while the branch step is still loading its list (no selection yet).
    if (!cwd || !canCreate || branchesLoading) return;
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

  // Pull a remote branch locally (#180): create a local tracking branch named
  // after the remote (`origin/feature-x` → `feature-x`), based on the remote ref,
  // check it out **in the folder**, and start — reusing #124's create-branch path.
  // The destructive-confirm warning (agents running here) shows like the local
  // checkout-and-start path. The store returns `true` or an inline error message.
  const confirmRemoteCheckout = async () => {
    if (!cwd || busy || selectedRemote === null) return;
    setBusy(true);
    setBranchError(null);
    const result = await createBranchSession(
      cwd,
      remoteShortName(selectedRemote),
      selectedRemote,
    );
    if (result === true) close();
    else {
      setBranchError(result);
      setBusy(false);
    }
  };

  // ⌘⏎ on a remote row (#180): pull it into an isolated worktree on the new local
  // tracking branch (no folder checkout, so no destructive confirm) — mirrors the
  // local-branch worktree path via #124's create-branch-as-worktree.
  const confirmRemoteWorktree = async () => {
    if (!cwd || busy || selectedRemote === null) return;
    setBusy(true);
    setBranchError(null);
    const result = await createBranchWorktreeSession(
      cwd,
      remoteShortName(selectedRemote),
      selectedRemote,
    );
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
      if (deferMode) goToDeferFromBranch();
      else if (event.metaKey || event.ctrlKey) void confirmAddBranchWorktree();
      else void confirmAddBranch();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setAddBranchActive(false);
      // Return to the last selectable row — a remote (#180) if any, else a local.
      const els = branchesRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-branch],[data-remote]",
      );
      const lastIndex = (els?.length ?? 0) - 1;
      if (lastIndex >= 0) selectRow(lastIndex, true);
      else branchFilterRef.current?.focus();
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
    else if (deferMode) setStep(recurringMode ? "recurring" : "schedule");
    else void create();
  };

  const backToFolder = () => {
    setBranchQuery("");
    setStep("folder");
  };

  // Schedule / recurring mode (#93/#294): advance the branch step → the final step
  // (launch-time for schedule, interval for recurring).
  const goToDeferStep = () => {
    if (!cwd || busy) return;
    setStep(recurringMode ? "recurring" : "schedule");
  };

  // Schedule / recurring + "+ add branch" (#125/#294): validate the new-branch name,
  // then advance (the branch is created at create/fire time, not now).
  const goToDeferFromBranch = () => {
    if (addBranchActive && !newBranchName.trim()) {
      setBranchError("Enter a branch name");
      return;
    }
    goToDeferStep();
  };

  const backFromDeferStep = () => setStep(folderIsGit ? "branch" : "folder");

  // Create the schedule from the launch-time step (#93/#268): parse the
  // natural-language launch time → unix secs (blocking on an unreadable value),
  // carry the optional branch/name/prompt. A "+ add branch" intent (#125) records
  // the new branch (created at fire time). `asWorktree` is the worktree variant of
  // the action (#204) — the "Worktree ⌘⏎" button / keybind, mirroring the branch
  // step's create() vs createWorktree() split. Git folders only (a worktree needs a
  // branch), so it's gated on folderIsGit.
  const submitSchedule = async (asWorktree: boolean) => {
    if (!cwd || busy) return;
    const when = parseWhen(fireAt, new Date());
    if (!when) return;
    const fireSecs = Math.floor(when.at.getTime() / 1000);
    const useNewBranch = addBranchActive && !!newBranchName.trim();
    // A worktree schedule (#198) always needs a branch (its worktree is on one),
    // even the current branch — so pass `selectedBranch` regardless of `willCheckout`.
    const useWorktree = asWorktree && folderIsGit;
    const branchArg = useNewBranch
      ? newBranchName.trim()
      : useWorktree || willCheckout
        ? (selectedBranch ?? null)
        : null;
    setBusy(true);
    setSchedError(null);
    const result = await scheduleSession(
      cwd,
      branchArg,
      schedName.trim() || null,
      prompt.trim() || null,
      fireSecs,
      useNewBranch,
      useNewBranch ? newBranchBase : null,
      useWorktree,
    );
    // `true` on success; else an error string (e.g. a worktree schedule's bad/duplicate
    // branch — its worktree is created eagerly now, #259) shown inline so the user can
    // fix it. Stay open on error.
    if (result === true) close();
    else {
      setSchedError(result);
      setBusy(false);
    }
  };

  // Resolve the recurring first-run time (#294): a blank / "now" field runs on the
  // next poll tick (≤5s); anything else is parsed like the schedule step. Returns unix
  // secs, or null when the text is present but unreadable.
  const resolveFirstFire = (): number | null => {
    const raw = fireAt.trim().toLowerCase();
    if (raw === "" || raw === "now") return Math.floor(Date.now() / 1000);
    const when = parseWhen(fireAt, new Date());
    return when ? Math.floor(when.at.getTime() / 1000) : null;
  };

  // Create the recurring session from the recurring step (#294): compute the interval
  // seconds (amount + unit, floored at 1 min), resolve the first-run time, carry the
  // branch/name/prompt exactly like `submitSchedule`. `asWorktree` is the "Worktree
  // ⌘⏎" variant (git folders only).
  const submitRecurring = async (asWorktree: boolean) => {
    if (!cwd || busy) return;
    const firstFire = resolveFirstFire();
    if (firstFire === null) return;
    const intervalSecs = intervalToSeconds(
      Number(intervalAmount),
      intervalUnit,
    );
    const useNewBranch = addBranchActive && !!newBranchName.trim();
    const useWorktree = asWorktree && folderIsGit;
    const branchArg = useNewBranch
      ? newBranchName.trim()
      : useWorktree || willCheckout
        ? (selectedBranch ?? null)
        : null;
    setBusy(true);
    setSchedError(null);
    const result = await createRecurring(
      cwd,
      branchArg,
      schedName.trim() || null,
      prompt.trim() || null,
      intervalSecs,
      firstFire,
      useNewBranch,
      useNewBranch ? newBranchBase : null,
      useWorktree,
    );
    if (result === true) close();
    else {
      setSchedError(result);
      setBusy(false);
    }
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

  // Filter the branch list as the user types; keep a row selected (top match —
  // locals first, then remotes #180) so Enter always starts something.
  const onBranchQueryChange = (value: string) => {
    setBranchQuery(value);
    setAddBranchActive(false); // re-filtering returns the highlight to a branch (#124)
    const vq = value.trim().toLowerCase();
    const nlLocal = vq
      ? sortedBranches.filter((b) => b.toLowerCase().includes(vq))
      : sortedBranches;
    const nlRemote = vq
      ? sortedRemotes.filter((r) => r.toLowerCase().includes(vq))
      : sortedRemotes;
    const localStillValid =
      selectedRemote === null &&
      selectedBranch !== null &&
      nlLocal.includes(selectedBranch);
    const remoteStillValid =
      selectedRemote !== null && nlRemote.includes(selectedRemote);
    if (localStillValid || remoteStillValid) return;
    if (nlLocal.length > 0) {
      setSelectedBranch(nlLocal[0] ?? null);
      setSelectedRemote(null);
    } else if (nlRemote.length > 0) {
      setSelectedBranch(null);
      setSelectedRemote(nlRemote[0] ?? null);
    } else {
      setSelectedBranch(null);
      setSelectedRemote(null);
    }
  };

  // Move the highlight one row down/up across the combined local→remote list;
  // ArrowDown past the last row activates "+ add branch". `focus` moves DOM focus
  // (listbox nav) vs. keeping it (filter-input nav). Returns whether it moved.
  const moveRow = (down: boolean, focus: boolean) => {
    const cur = currentRowIndex();
    if (down) {
      if (cur >= rows.length - 1) {
        setAddBranchActive(true);
        return;
      }
      selectRow(cur < 0 ? 0 : cur + 1, focus);
    } else {
      if (cur <= 0) return; // already at the first row — stay
      selectRow(cur - 1, focus);
    }
  };

  // ⌘⏎ in the branch step: start in an isolated worktree (#74) — a remote row pulls
  // into a worktree (#180), else the selected local branch. In a defer mode
  // (schedule/recurring) it advances to the final step instead of spawning.
  const startWorktreeFromBranch = () => {
    if (deferMode) return;
    if (selectedRemote !== null) void confirmRemoteWorktree();
    else void createWorktree();
  };

  // ↑/↓ in the branch filter input: move the selection only (keep typing focus).
  // Enter falls through to the form submit (start).
  const onBranchQueryKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) => {
    // ⌘⏎ starts in an isolated worktree (#74/#180); plain Enter falls through to the
    // form submit (normal start in the repo folder). No worktree in schedule mode.
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      startWorktreeFromBranch();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    moveRow(event.key === "ArrowDown", false);
  };

  // ↑/↓ roving over the branch list; Enter starts (gated by canCreate). Branch
  // buttons are type=button, so Enter wouldn't submit the form — handle it here.
  const onBranchKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      // Schedule / recurring mode (#93/#294): advance to the final step. Else ⌘⏎ =
      // worktree (#74/#180), plain Enter = normal start (a remote row pulls + starts).
      if (deferMode) goToDeferStep();
      else if (event.metaKey || event.ctrlKey) startWorktreeFromBranch();
      else if (selectedRemote !== null) void confirmRemoteCheckout();
      else void create();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    moveRow(event.key === "ArrowDown", true);
  };

  // Keep Tab focus inside the dialog (focus-trap, a11y #49). Excludes roving
  // tabindex=-1 elements (e.g. unselected branch buttons, #61).
  const onTrapKeyDown = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    // Schedule step (#204): ⌘⏎ / Ctrl+⏎ schedules into an isolated worktree —
    // mirroring the branch step's worktree keybind. Plain ⏎ submits a normal
    // schedule via the form's onSubmit. Handled at the form level so it fires from
    // any schedule-step field; when the prompt's skill menu is open SkillAutocomplete
    // intercepts Enter to drive the menu (#114), so this only runs with it closed.
    if (
      (step === "schedule" || step === "recurring") &&
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey)
    ) {
      event.preventDefault();
      if (step === "recurring") void submitRecurring(true);
      else void submitSchedule(true);
      return;
    }
    if (event.key !== "Tab" || !formRef.current) return;
    const focusable = formRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

  // Live interpretation of the natural-language launch time (#268) — drives the
  // preview line and gates the schedule submit/worktree buttons. Recomputed on each
  // render (cheap, pure) so a fresh `now` keeps "tomorrow" rolling current.
  const scheduleWhen =
    step === "schedule" || step === "recurring"
      ? parseWhen(fireAt, new Date())
      : null;
  // Recurring's first-run field also accepts blank / "now" as immediate (#294).
  const recurringFirstOk =
    step === "recurring" &&
    (fireAt.trim() === "" ||
      fireAt.trim().toLowerCase() === "now" ||
      scheduleWhen !== null);
  const intervalOk = Number(intervalAmount) >= 1;
  const modalTitle = recurringMode
    ? "Recurring session"
    : scheduleMode
      ? "Schedule session"
      : "New session";

  return (
    <div className={styles.overlay} onClick={close}>
      <form
        ref={formRef}
        className={styles.popover}
        role="dialog"
        aria-modal="true"
        aria-label={modalTitle}
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
            // #263: ignore Enter while branches are still loading (no selection yet).
            if (branchesLoading) return;
            if (addBranchActive) {
              if (deferMode) goToDeferFromBranch();
              else void confirmAddBranch();
            } else if (deferMode) goToDeferStep();
            else if (selectedRemote !== null) void confirmRemoteCheckout();
            else void create();
          } else if (step === "recurring") {
            // Plain ⏎ = create the recurring; ⌘⏎ (worktree) via onTrapKeyDown.
            void submitRecurring(false);
          } else {
            // Plain ⏎ = normal schedule; ⌘⏎ (worktree) is handled in onTrapKeyDown.
            void submitSchedule(false);
          }
        }}
      >
        <h2 className={styles.title}>
          {recurringMode ? (
            <RefreshCw size={15} strokeWidth={2} className={styles.titleIcon} />
          ) : scheduleMode ? (
            <Clock size={15} strokeWidth={2} className={styles.titleIcon} />
          ) : (
            <Plus size={15} strokeWidth={2} className={styles.titleIcon} />
          )}
          {modalTitle}
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
                  {...noAutoCapitalize}
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
                {...noAutoCapitalize}
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
              {branchesLoading ? (
                <p className={styles.empty}>Loading branches…</p>
              ) : branchList.length === 0 &&
                remoteList.length === 0 &&
                !fetchingRemotes ? (
                <p className={styles.empty}>No matching branches.</p>
              ) : (
                <>
                  {branchList.map((b) => {
                    const active =
                      b === selectedBranch &&
                      selectedRemote === null &&
                      !addBranchActive;
                    return (
                      <button
                        key={b}
                        type="button"
                        role="option"
                        aria-selected={active}
                        data-branch
                        tabIndex={active ? 0 : -1}
                        className={`${styles.branch} ${active ? styles.branchActive : ""}`}
                        onClick={() => {
                          setSelectedBranch(b);
                          setSelectedRemote(null);
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
                    );
                  })}

                  {/* Remote branches (#180): pulled into a local tracking branch on
                      select. Shown only in new-session mode, below the locals; the
                      "fetching…" hint reflects the on-open git fetch. */}
                  {(remoteList.length > 0 || fetchingRemotes) && (
                    <>
                      <p className={styles.remoteHeader}>
                        Remote branches
                        {fetchingRemotes && (
                          <span className={styles.remoteFetching}>
                            fetching…
                          </span>
                        )}
                      </p>
                      {remoteList.map((r) => {
                        const active = r === selectedRemote && !addBranchActive;
                        return (
                          <button
                            key={r}
                            type="button"
                            role="option"
                            aria-selected={active}
                            data-remote
                            tabIndex={active ? 0 : -1}
                            className={`${styles.branch} ${active ? styles.branchActive : ""}`}
                            onClick={() => {
                              setSelectedRemote(r);
                              setSelectedBranch(null);
                              setAddBranchActive(false);
                            }}
                            title={`${r} — pull into a local branch`}
                          >
                            <GitBranch size={13} strokeWidth={1.5} />
                            <span className={styles.branchName}>{r}</span>
                          </button>
                        );
                      })}
                    </>
                  )}
                </>
              )}
            </div>

            {/* "+ add branch" (#124/#125): the create-a-new-branch option after all
                existing branches — outside the listbox (like #123's folder picker)
                so its own Enter/click activates it, not the list's start handler.
                Both modes: in schedule mode (#125) it records intent (created at fire
                time) instead of creating now. Hidden while branches load (#263). */}
            {!branchesLoading && (
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
            )}

            {/* Inline new-branch form (#124/#125): name + base dropdown (default
                current branch). New-session: Enter creates + starts, ⌘⏎ as a worktree.
                Schedule: Enter advances; the branch is created when the schedule fires. */}
            {addBranchActive && (
              <div className={styles.addBranchForm}>
                <input
                  ref={newBranchNameRef}
                  className={styles.search}
                  {...noAutoCapitalize}
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

            {!deferMode &&
              (isDestructive || addBranchActive || isRemoteActive) &&
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
                    ) : isRemoteActive ? (
                      <>
                        Pulling{" "}
                        <strong>
                          {selectedRemote
                            ? remoteShortName(selectedRemote)
                            : ""}
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
                  offered when scheduling / recurring (the worktree option moves to the
                  final step's "Worktree ⌘⏎"). "+ add branch" creates it as a worktree. */}
              {!deferMode && (
                <button
                  type="button"
                  className={styles.cancel}
                  onClick={() =>
                    addBranchActive
                      ? void confirmAddBranchWorktree()
                      : isRemoteActive
                        ? void confirmRemoteWorktree()
                        : void createWorktree()
                  }
                  disabled={
                    !cwd ||
                    busy ||
                    branchesLoading ||
                    (addBranchActive
                      ? !newBranchName.trim()
                      : isRemoteActive
                        ? false
                        : !selectedBranch)
                  }
                  title={
                    isRemoteActive
                      ? "Pull into an isolated git worktree"
                      : "Start in an isolated git worktree"
                  }
                >
                  Worktree{" "}
                  <kbd className={styles.btnKbd}>
                    {kbdHint(platform, "⌘⏎", "Ctrl+↵")}
                  </kbd>
                </button>
              )}
              <button
                type="submit"
                className={styles.create}
                disabled={
                  !canCreate ||
                  branchesLoading ||
                  (addBranchActive && !newBranchName.trim())
                }
              >
                {deferMode
                  ? "Next"
                  : addBranchActive
                    ? "Create & start"
                    : isRemoteActive
                      ? "Pull & start"
                      : "Start"}
                <kbd className={styles.btnKbd}>⏎</kbd>
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Final step (#93/#294): schedule = launch time; recurring = interval +
                first run. Both carry an optional prompt + name. Back returns to the
                branch step (git) or the folder step (non-git). */}
            <button
              type="button"
              className={styles.folderBack}
              onClick={backFromDeferStep}
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

            {/* Recurring: the repeat interval (#294). */}
            {step === "recurring" && (
              <>
                <p className={styles.label}>Repeat every</p>
                <div className={styles.intervalRow}>
                  <input
                    className={styles.intervalAmount}
                    {...noAutoCapitalize}
                    type="number"
                    min={1}
                    value={intervalAmount}
                    onChange={(event) =>
                      setIntervalAmount(event.currentTarget.value)
                    }
                    aria-label="Repeat amount"
                  />
                  <select
                    className={styles.intervalUnit}
                    value={intervalUnit}
                    onChange={(event) =>
                      setIntervalUnit(event.currentTarget.value as IntervalUnit)
                    }
                    aria-label="Repeat unit"
                  >
                    <option value="minute">Minutes</option>
                    <option value="hour">Hours</option>
                    <option value="day">Days</option>
                  </select>
                </div>
              </>
            )}

            <p className={styles.label}>
              {step === "recurring" ? "First run" : "Launch time"}
            </p>
            <input
              ref={fireAtRef}
              className={styles.search}
              {...noAutoCapitalize}
              type="text"
              value={fireAt}
              onChange={(event) => setFireAt(event.currentTarget.value)}
              placeholder={
                step === "recurring"
                  ? "now, or e.g. 1h, 15:00, tomorrow 9am"
                  : "e.g. 1h, 15:00, 6pm, tomorrow 9am"
              }
              aria-label={step === "recurring" ? "First run" : "Launch time"}
            />
            {/* Persistent helper + a live interpretation of what was typed (#268). */}
            <p className={styles.timeHint}>{SCHEDULE_TIME_HINT}</p>
            {fireAt.trim() !== "" &&
              (step === "recurring" &&
              ["", "now"].includes(fireAt.trim().toLowerCase()) ? (
                <p className={styles.timePreview} aria-live="polite">
                  Runs now, then {intervalOk ? "on" : ""} the interval.
                </p>
              ) : scheduleWhen ? (
                <p className={styles.timePreview} aria-live="polite">
                  {step === "recurring" ? "First runs" : "Starts"}{" "}
                  {formatFireTime(Math.floor(scheduleWhen.at.getTime() / 1000))}{" "}
                  · {scheduleWhen.label}
                </p>
              ) : (
                <p className={styles.timeError} aria-live="polite">
                  Couldn’t read that time.
                </p>
              ))}

            <p className={styles.label}>Prompt (optional)</p>
            <SkillAutocomplete
              className={styles.promptInput}
              value={prompt}
              onChange={setPrompt}
              skills={skills}
              rows={3}
              ariaLabel="Initial prompt"
            />

            <p className={styles.label}>Name (optional)</p>
            <input
              className={styles.search}
              {...noAutoCapitalize}
              type="text"
              value={schedName}
              placeholder="Custom name…"
              onChange={(event) => setSchedName(event.currentTarget.value)}
              aria-label="Custom name"
            />

            {/* Inline error (#259/#294): a worktree schedule/recurring creates its
                worktree + branch eagerly, so a bad/duplicate branch surfaces here. */}
            {schedError && (
              <p className={styles.branchError} role="alert">
                {schedError}
              </p>
            )}

            <div className={styles.actions}>
              <button type="button" className={styles.cancel} onClick={close}>
                Cancel <kbd className={styles.btnKbd}>esc</kbd>
              </button>
              {/* Isolated worktree (#198/#204/#294): the worktree variant of the
                  primary action — mirroring the branch step's "Worktree ⌘⏎". Git
                  folders only; the worktree is created on the chosen branch. */}
              {folderIsGit && (
                <button
                  type="button"
                  className={styles.cancel}
                  onClick={() =>
                    step === "recurring"
                      ? void submitRecurring(true)
                      : void submitSchedule(true)
                  }
                  disabled={
                    step === "recurring"
                      ? !cwd || busy || !intervalOk || !recurringFirstOk
                      : !cwd || busy || !scheduleWhen
                  }
                  title={
                    step === "recurring"
                      ? "Repeat into an isolated git worktree"
                      : "Schedule into an isolated git worktree"
                  }
                >
                  Worktree{" "}
                  <kbd className={styles.btnKbd}>
                    {kbdHint(platform, "⌘⏎", "Ctrl+↵")}
                  </kbd>
                </button>
              )}
              <button
                type="submit"
                className={styles.create}
                disabled={
                  step === "recurring"
                    ? !cwd || busy || !intervalOk || !recurringFirstOk
                    : !cwd || busy || !scheduleWhen
                }
              >
                {step === "recurring" ? "Create" : "Schedule"}{" "}
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
