import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

import {
  commitDiff,
  compareBranches,
  listBranches,
  listCommits,
  workingDiff,
} from "../../ipc";
import { repoName } from "../../paths";
import { useStore } from "../../store";
import type {
  BranchList,
  CommitInfo,
  FileDiff,
  HunkLine,
  WorkingDiff,
} from "../../types";

import { prismLang } from "../FileViewer/fileType";
import { highlightToHtml } from "../FileViewer/prism";
import { type DisplayMode, diffNavDelta } from "./diffNav";
import { type DiffSortOrder, reconcileOccurrence, sortFiles } from "./diffSort";
import styles from "./DiffInspector.module.css";

/** Human label for a file's status code (badge tooltip, #231). */
function statusLabel(status: FileDiff["status"]): string {
  return status === "A" ? "Added" : status === "D" ? "Deleted" : "Modified";
}

/** A small square status badge (M/A/D) reusing the file-glyph tint (#231). */
function StatusBadge({ status }: { status: FileDiff["status"] }) {
  return (
    <span
      className={`${styles.badge} ${glyphClass(status)}`}
      title={statusLabel(status)}
      aria-label={statusLabel(status)}
    >
      {status}
    </span>
  );
}

/** A file's name in bold mono with its subdirectory on a muted second line (#231).
 * Paths are repo-relative + `/`-separated (backend), so split on `/`. */
function FileLabel({ path }: { path: string }) {
  const slash = path.lastIndexOf("/");
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const dir = slash >= 0 ? path.slice(0, slash + 1) : "";
  return (
    <span className={styles.fileLabel}>
      <span className={styles.fileName}>{name}</span>
      {dir && <span className={styles.fileSubpath}>{dir}</span>}
    </span>
  );
}

/** Green +adds / red −dels counts (#231). */
function CountsPair({ add, del }: { add: number; del: number }) {
  return (
    <span className={styles.countsPair}>
      <span className={styles.add}>+{add}</span>
      <span className={styles.del}>−{del}</span>
    </span>
  );
}

/** A diff line's code text, syntax-highlighted (#229) when `lang` is known, else
 * plain. `highlightToHtml` HTML-escapes its input (Prism + the escape fallback), so
 * the injected markup carries no raw file HTML — safe to `dangerouslySetInnerHTML`.
 * Per-line tokenization (lightweight; cross-line constructs aren't stitched). */
function CodeContent({
  text,
  lang,
}: {
  text: string;
  lang: string | undefined;
}) {
  if (lang) {
    return (
      <span
        className={styles.content}
        dangerouslySetInnerHTML={{ __html: highlightToHtml(text, lang) }}
      />
    );
  }
  return <span className={styles.content}>{text}</span>;
}

// Poll the working-tree diff while the inspector is open so agent edits appear
// on their own (#29). ~1.5s feels live without hammering `git`.
const POLL_MS = 1500;

interface DiffInspectorProps {
  repoPath: string;
  /** Whether the inspector is open — diff is only (re)fetched while visible. */
  active: boolean;
}

type DiffMode = "unified" | "split";
/** Diff source: working tree vs HEAD (#81), a two-branch compare (#81), or a single
 * commit's diff (#230). */
type DiffSource = "working" | "compare" | "commits";

// Latest-N commits listed in Commits mode (mirrors the backend cap); the cap is
// surfaced in the picker so a large history reads as bounded.
const MAX_COMMITS = 100;

// Cap rows rendered per file so a huge diff can't jank the panel (no
// virtualization in v1 — see the pass-2 punch list).
const MAX_DIFF_ROWS = 600;

function UnifiedRow({
  line,
  lang,
}: {
  line: HunkLine;
  lang: string | undefined;
}) {
  if (line.type === "hunk") {
    return <div className={styles.hunkHeader}>{line.text}</div>;
  }
  const rowClass =
    line.type === "add"
      ? styles.addRow
      : line.type === "del"
        ? styles.delRow
        : "";
  const marker = line.type === "add" ? "+" : line.type === "del" ? "−" : " ";
  return (
    <div className={`${styles.line} ${rowClass}`}>
      <span className={styles.gutter}>{line.old_no ?? ""}</span>
      <span className={styles.gutter}>{line.new_no ?? ""}</span>
      <span className={styles.marker}>{marker}</span>
      <CodeContent text={line.text} lang={lang} />
    </div>
  );
}

function SplitRow({
  line,
  lang,
}: {
  line: HunkLine;
  lang: string | undefined;
}) {
  if (line.type === "hunk") {
    return <div className={styles.hunkHeader}>{line.text}</div>;
  }
  const showLeft = line.type === "context" || line.type === "del";
  const showRight = line.type === "context" || line.type === "add";
  return (
    <div className={styles.splitLine}>
      <div
        className={`${styles.splitCell} ${line.type === "del" ? styles.delRow : ""}`}
      >
        {showLeft && (
          <>
            <span className={styles.gutter}>{line.old_no ?? ""}</span>
            <CodeContent text={line.text} lang={lang} />
          </>
        )}
      </div>
      <div
        className={`${styles.splitCell} ${line.type === "add" ? styles.addRow : ""}`}
      >
        {showRight && (
          <>
            <span className={styles.gutter}>{line.new_no ?? ""}</span>
            <CodeContent text={line.text} lang={lang} />
          </>
        )}
      </div>
    </div>
  );
}

function DiffFile({ file, mode }: { file: FileDiff; mode: DiffMode }) {
  if (file.binary) {
    return <div className={styles.binary}>Binary file — no preview.</div>;
  }
  const Row = mode === "split" ? SplitRow : UnifiedRow;
  // Detect the language once per file (#229) from its path; undefined → plain text.
  const lang = prismLang(file.path);
  const truncated = file.hunks.length > MAX_DIFF_ROWS;
  const rows = truncated ? file.hunks.slice(0, MAX_DIFF_ROWS) : file.hunks;
  return (
    <div className={styles.code}>
      {rows.map((line, i) => (
        <Row key={i} line={line} lang={lang} />
      ))}
      {truncated && (
        <div className={styles.truncated}>
          Showing the first {MAX_DIFF_ROWS} of {file.hunks.length} lines — open
          the file for the full diff.
        </div>
      )}
    </div>
  );
}

function glyphClass(status: FileDiff["status"]): string {
  if (status === "A") return styles.glyphAdd ?? "";
  if (status === "D") return styles.glyphDel ?? "";
  return styles.glyphMod ?? "";
}

/**
 * The diff viewer (#13/#39/#47): a changed-files list + unified/split body. By
 * default it shows the repo's **working tree vs HEAD** (`working_diff`, polled
 * #29); a **Compare** source toggle (#81) instead shows a two-dot
 * `git diff base target` between two local branches, rendered in the same body.
 * The compare source + branches persist on the repo's diff panel.
 */
function DiffInspector({ repoPath, active }: DiffInspectorProps) {
  const [diff, setDiff] = useState<WorkingDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  // Line mode (#237): unified vs split. Seeded once from the global setting; the
  // in-panel toggle overrides it for this panel/session and persists back as the new
  // default for the next-opened diff viewer (mirrors `displayMode` below).
  const [mode, setMode] = useState<DiffMode>(
    () => useStore.getState().settings.diffLineMode,
  );

  // Branch-compare state (#81), seeded from the repo's persisted diff panel so a
  // configured compare view survives view switches / restart.
  const diffPanel = () =>
    (useStore.getState().overviewPanels[repoPath] ?? []).find(
      (p) => p.kind === "diff",
    );
  const [source, setSource] = useState<DiffSource>(() => {
    const s = diffPanel()?.diff_source;
    return s === "compare" || s === "commits" ? s : "working";
  });
  const [base, setBase] = useState<string | null>(
    () => diffPanel()?.compare_base ?? null,
  );
  const [target, setTarget] = useState<string | null>(
    () => diffPanel()?.compare_target ?? null,
  );
  const [branchList, setBranchList] = useState<BranchList | null>(null);
  // Commits source (#230): the bounded commit list + the selected commit's sha,
  // seeded from the persisted diff panel so a configured commits view survives.
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [commitSha, setCommitSha] = useState<string | null>(
    () => diffPanel()?.commit_sha ?? null,
  );
  const setDiffCompare = useStore((s) => s.setDiffCompare);
  // Display mode (#231): focused single-file (default) vs accordion cards. Seeded once
  // from the global setting; the in-panel toggle overrides it for this panel/session.
  const [displayMode, setDisplayMode] = useState<DisplayMode>(
    () => useStore.getState().settings.diffDisplayMode,
  );
  // File ordering (#258): `occurrence` (default — newly-changed files append to the
  // bottom, re-changes don't reorder) vs `alphabetical`. Seeded once from the global
  // setting; the in-panel toggle overrides it for this panel/session and persists back.
  const [sortOrder, setSortOrder] = useState<DiffSortOrder>(
    () => useStore.getState().settings.diffSortOrder,
  );
  // Focused-mode file picker popover open state (#231).
  const [pickerOpen, setPickerOpen] = useState(false);

  // Persist the display-style toggles (#237): set this panel's local state AND write
  // the choice back to settings so the next-opened diff viewer defaults to it. Reading
  // `getState().settings` at call time avoids clobbering a concurrent change to another
  // field; `saveSettings` is idempotent (store + persist + effects) — fine for a toggle.
  // Already-open panels keep their own local mode (they only seed once at mount), so
  // this never retroactively re-syncs them.
  const saveSettings = useStore((s) => s.saveSettings);
  const chooseDisplayMode = (next: DisplayMode) => {
    setDisplayMode(next);
    void saveSettings({
      ...useStore.getState().settings,
      diffDisplayMode: next,
    });
  };
  const chooseLineMode = (next: DiffMode) => {
    setMode(next);
    void saveSettings({ ...useStore.getState().settings, diffLineMode: next });
  };
  const chooseSortOrder = (next: DiffSortOrder) => {
    setSortOrder(next);
    void saveSettings({ ...useStore.getState().settings, diffSortOrder: next });
  };

  // Signature of the last applied diff (skip re-render when a poll finds no
  // change) and an in-flight guard (never overlap fetches).
  const sigRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  // Load the branch list (compare pickers) and default base/target once (#81):
  // base = current branch, target = main/master if present.
  useEffect(() => {
    let cancelled = false;
    void listBranches(repoPath)
      .then((bl) => {
        if (cancelled) return;
        setBranchList(bl);
        setBase((b) => b ?? (bl.current || bl.all[0] || null));
        setTarget(
          (t) =>
            t ?? bl.all.find((x) => x === "main" || x === "master") ?? null,
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [repoPath]);

  // Persist the source + branches/commit on the repo's diff panel (#81/#230).
  useEffect(() => {
    setDiffCompare(repoPath, {
      diff_source: source,
      compare_base: base ?? undefined,
      compare_target: target ?? undefined,
      commit_sha: commitSha ?? undefined,
    });
  }, [repoPath, source, base, target, commitSha, setDiffCompare]);

  // Load the commit list in Commits mode (#230) — bounded backend-side. Auto-select
  // the most recent commit when none is chosen yet, so the body isn't empty.
  useEffect(() => {
    if (!active || source !== "commits") return;
    let cancelled = false;
    void listCommits(repoPath, MAX_COMMITS)
      .then((list) => {
        if (cancelled) return;
        setCommits(list);
        setCommitSha((cur) =>
          cur && list.some((c) => c.sha === cur) ? cur : (list[0]?.sha ?? null),
        );
      })
      .catch(() => {
        if (!cancelled) setCommits([]);
      });
    return () => {
      cancelled = true;
    };
  }, [active, source, repoPath]);

  const load = useCallback(
    async (silent = false) => {
      // Compare mode needs both branches; commits mode needs a selected commit.
      // Until then, show the pick state.
      if (source === "compare" && (!base || !target)) {
        sigRef.current = null;
        setDiff(null);
        setError(false);
        return;
      }
      if (source === "commits" && !commitSha) {
        sigRef.current = null;
        setDiff(null);
        setError(false);
        return;
      }
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      if (!silent) setLoading(true);
      try {
        const next =
          source === "compare"
            ? await compareBranches(repoPath, base as string, target as string)
            : source === "commits"
              ? await commitDiff(repoPath, commitSha as string)
              : await workingDiff(repoPath);
        const sig = JSON.stringify(next);
        // Only update state when the diff actually changed — an unchanged poll
        // is invisible (no re-render, so selection + scroll are preserved).
        if (sig !== sigRef.current) {
          sigRef.current = sig;
          setDiff(next);
        }
        setError(false);
      } catch {
        // A transient background-poll failure keeps the last good diff; an
        // explicit/initial load surfaces the empty/error state.
        if (!silent) {
          sigRef.current = null;
          setDiff(null);
          setError(true);
        }
      } finally {
        if (!silent) setLoading(false);
        inFlightRef.current = false;
      }
    },
    [repoPath, source, base, target, commitSha],
  );

  // Fetch (with spinner) when visible / on repo or source/branch change.
  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  // Poll only in working-tree mode (#29) — branch compares change only on new
  // commits, so they reload on selection change + manual Refresh instead.
  useEffect(() => {
    if (!active || source !== "working") return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (timer === undefined && !document.hidden) {
        timer = setInterval(() => void load(true), POLL_MS);
      }
    };
    const stop = () => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        void load(true); // catch up immediately, then resume polling
        start();
      }
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, source, load]);

  const files = useMemo(() => diff?.files ?? [], [diff]);

  // Occurrence tracking (#258): remember the order in which files first became changed,
  // so "occurrence" mode appends a newly-changed file to the **bottom** and never
  // reorders a file that re-changes. The sequence is **per-panel-session** (not
  // persisted — only the mode preference is): on (re)mount it seeds from git's emission
  // order, then tracks occurrence going forward. `reconcileOccurrence` is idempotent
  // when the path set is unchanged, so recomputing it during render (incl. StrictMode's
  // double-invoke) is safe. Keyed on the path set so it only advances when files change.
  const seqRef = useRef<{ seq: Record<string, number>; counter: number }>({
    seq: {},
    counter: 0,
  });
  const pathsSig = files.map((file) => file.path).join("\n");
  const seq = useMemo(() => {
    const next = reconcileOccurrence(
      seqRef.current.seq,
      files.map((file) => file.path),
      seqRef.current.counter,
    );
    seqRef.current = next;
    return next.seq;
    // `files` is recomputed from `pathsSig`; depending on the signature avoids churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathsSig]);

  // The displayed list: ordered by the chosen mode. Used everywhere `files` drove the
  // list before (the picker, the i/N index, nav wraparound, the accordion cards).
  const orderedFiles = useMemo(
    () => sortFiles(files, sortOrder, seq),
    [files, sortOrder, seq],
  );

  const activeFile =
    orderedFiles.find((file) => file.path === selectedFile) ??
    orderedFiles[0] ??
    null;

  const selectedCommit = commits.find((c) => c.sha === commitSha);
  // Header label: the selected commit (short sha · subject) in Commits mode, else the
  // diff summary's branch / "base → target".
  const summaryLabel =
    source === "commits" && selectedCommit
      ? `${selectedCommit.short_sha} · ${selectedCommit.subject}`
      : diff?.summary.branch || "—";
  // Panel header (#231): "repo · branch" (the wireframe's "ReCue · main").
  const headerLabel = `${repoName(repoPath)} · ${summaryLabel}`;

  // Focused-mode navigation (#231): cycle through the changed files (wraps).
  const activeIndex = activeFile
    ? orderedFiles.findIndex((f) => f.path === activeFile.path)
    : -1;
  const stepFile = (delta: number) => {
    if (orderedFiles.length === 0) return;
    const i = (activeIndex + delta + orderedFiles.length) % orderedFiles.length;
    setSelectedFile(orderedFiles[i]?.path ?? null);
    setPickerOpen(false);
  };

  // Arrow-key file navigation (#255), **panel-scoped** so multiple diff panels (Overview
  // columns, Canvas panels, detached windows) never move each other. Focused mode: ←/→
  // step files (Up/Down stay free for body scroll); Accordion mode: ↑/↓ step the open
  // card. Plain unmodified arrows only — identical on macOS and Windows (no
  // metaKey||ctrlKey). Ignored while a text input / select / branch-or-commit picker /
  // the focused-mode file-picker listbox has focus, and when there are <2 files.
  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (orderedFiles.length < 2) return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
      return;
    if (
      (event.target as HTMLElement).closest(
        "input, textarea, select, [contenteditable], [role=listbox], [role=combobox]",
      )
    ) {
      return;
    }
    const delta = diffNavDelta(event.key, displayMode);
    if (delta === null) return;
    event.preventDefault();
    stepFile(delta);
  };

  // Accordion mode (#255): keep the open card in view after a keyboard step. `block:
  // "nearest"` is a no-op when the card is already visible, so a mouse click on an
  // on-screen card never triggers a jarring scroll (only an off-screen move scrolls).
  const openCardRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (displayMode !== "accordion") return;
    openCardRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeFile?.path, displayMode]);

  const emptyMessage = loading
    ? "Loading…"
    : error
      ? "Couldn’t produce this diff."
      : source === "compare"
        ? !base || !target
          ? "Pick a base and target branch to compare."
          : "No differences between these branches."
        : source === "commits"
          ? commits.length === 0
            ? "No commits in this repository."
            : !commitSha
              ? "Pick a commit to view its changes."
              : "This commit has no file changes."
          : "No changes yet on this branch.";

  return (
    // Focusable + panel-scoped key handling (#255): arrow keys step between files only
    // when this panel has focus, so other diff panels / terminals are unaffected.
    <div className={styles.panel} tabIndex={0} onKeyDown={onPanelKeyDown}>
      <div className={styles.summary}>
        <div className={styles.summaryRow}>
          <span className={styles.branch} title={headerLabel}>
            {headerLabel}
          </span>
          <div className={styles.summaryActions}>
            {/* Display mode (#231): focused single-file vs accordion cards. */}
            <div className={styles.modeToggle}>
              <button
                type="button"
                className={
                  displayMode === "focused" ? styles.modeActive : styles.mode
                }
                aria-pressed={displayMode === "focused"}
                onClick={() => chooseDisplayMode("focused")}
                title="Focused single file"
              >
                Focused
              </button>
              <button
                type="button"
                className={
                  displayMode === "accordion" ? styles.modeActive : styles.mode
                }
                aria-pressed={displayMode === "accordion"}
                onClick={() => chooseDisplayMode("accordion")}
                title="Accordion files"
              >
                Accordion
              </button>
            </div>
            {/* File ordering (#258): occurrence (newest-changed at the bottom) vs A–Z. */}
            <div className={styles.modeToggle}>
              <button
                type="button"
                className={
                  sortOrder === "occurrence" ? styles.modeActive : styles.mode
                }
                aria-pressed={sortOrder === "occurrence"}
                onClick={() => chooseSortOrder("occurrence")}
                title="Order by when each file first changed (newest at the bottom)"
              >
                Recent
              </button>
              <button
                type="button"
                className={
                  sortOrder === "alphabetical" ? styles.modeActive : styles.mode
                }
                aria-pressed={sortOrder === "alphabetical"}
                onClick={() => chooseSortOrder("alphabetical")}
                title="Order alphabetically (A–Z)"
              >
                A–Z
              </button>
            </div>
            <div className={styles.modeToggle}>
              <button
                type="button"
                className={mode === "unified" ? styles.modeActive : styles.mode}
                aria-pressed={mode === "unified"}
                onClick={() => chooseLineMode("unified")}
              >
                Unified
              </button>
              <button
                type="button"
                className={mode === "split" ? styles.modeActive : styles.mode}
                aria-pressed={mode === "split"}
                onClick={() => chooseLineMode("split")}
              >
                Split
              </button>
            </div>
            <button
              type="button"
              className={styles.refresh}
              onClick={() => void load()}
              title="Refresh diff"
              aria-label="Refresh diff"
            >
              <RefreshCw
                size={14}
                strokeWidth={1.5}
                className={loading ? styles.spinning : ""}
              />
            </button>
          </div>
        </div>

        {/* Source toggle (#81/#230): working tree vs HEAD, a two-branch compare, or a
            single commit's diff. */}
        <div className={styles.sourceRow}>
          <div className={styles.modeToggle}>
            <button
              type="button"
              className={source === "working" ? styles.modeActive : styles.mode}
              aria-pressed={source === "working"}
              onClick={() => setSource("working")}
            >
              Working tree
            </button>
            <button
              type="button"
              className={source === "compare" ? styles.modeActive : styles.mode}
              aria-pressed={source === "compare"}
              onClick={() => setSource("compare")}
            >
              Compare
            </button>
            <button
              type="button"
              className={source === "commits" ? styles.modeActive : styles.mode}
              aria-pressed={source === "commits"}
              onClick={() => setSource("commits")}
            >
              Commits
            </button>
          </div>
          {/* Commit picker (#230): the bounded recent-commit list; selecting one shows
              its diff in the body. The cap is surfaced so a long history reads bounded. */}
          {source === "commits" && (
            <div className={styles.comparePickers}>
              <select
                className={styles.branchSelect}
                value={commitSha ?? ""}
                onChange={(e) => setCommitSha(e.currentTarget.value || null)}
                aria-label="Commit"
                disabled={commits.length === 0}
              >
                {commits.length === 0 && <option value="">No commits</option>}
                {commits.map((c) => (
                  <option key={c.sha} value={c.sha}>
                    {c.short_sha} · {c.subject} ({c.author} · {c.date})
                  </option>
                ))}
              </select>
              {commits.length >= MAX_COMMITS && (
                <span className={styles.capNote}>latest {MAX_COMMITS}</span>
              )}
            </div>
          )}
          {source === "compare" && branchList && (
            <div className={styles.comparePickers}>
              <select
                className={styles.branchSelect}
                value={base ?? ""}
                onChange={(e) => setBase(e.currentTarget.value)}
                aria-label="Base branch"
              >
                {branchList.all.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <span className={styles.compareArrow}>→</span>
              <select
                className={styles.branchSelect}
                value={target ?? ""}
                onChange={(e) => setTarget(e.currentTarget.value)}
                aria-label="Target branch"
              >
                {branchList.all.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className={styles.counts}>
          {diff
            ? `${diff.summary.files_changed} file${diff.summary.files_changed === 1 ? "" : "s"} changed `
            : "— "}
          {diff && (
            <>
              <span className={styles.add}>+{diff.summary.adds}</span>{" "}
              <span className={styles.del}>−{diff.summary.dels}</span>
            </>
          )}
        </div>
      </div>

      {orderedFiles.length === 0 ? (
        <div className={styles.empty}>{emptyMessage}</div>
      ) : displayMode === "accordion" ? (
        // Accordion (#231): single-open file cards — exactly one is expanded
        // (`activeFile`); clicking another card's header switches which is open, so
        // the diff you read is never ambiguous. Inline `DiffFile` keeps Unified/Split
        // + #229 highlighting.
        <div className={styles.accordion}>
          {orderedFiles.map((file) => {
            const open = file.path === activeFile?.path;
            return (
              <div
                key={file.path}
                className={`${styles.card} ${open ? styles.cardOpen : ""}`}
              >
                <button
                  type="button"
                  ref={open ? openCardRef : undefined}
                  className={styles.cardHeader}
                  onClick={() => setSelectedFile(file.path)}
                  aria-expanded={open}
                  aria-keyshortcuts="ArrowUp ArrowDown"
                  title={file.path}
                >
                  <StatusBadge status={file.status} />
                  <FileLabel path={file.path} />
                  <CountsPair add={file.add} del={file.del} />
                </button>
                {open && (
                  <div className={styles.cardBody}>
                    <DiffFile file={file} mode={mode} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        // Focused (#231, default): one file fills the body; a nav strip (‹ prev, a
        // picker pill with the i/N index, › next) steps through / jumps between files.
        <>
          <div className={styles.focusNav}>
            <button
              type="button"
              className={styles.navArrow}
              onClick={() => stepFile(-1)}
              disabled={orderedFiles.length < 2}
              title="Previous file (←)"
              aria-label="Previous file"
              aria-keyshortcuts="ArrowLeft"
            >
              <ChevronLeft size={16} strokeWidth={1.5} />
            </button>
            <div className={styles.pickerWrap}>
              <button
                type="button"
                className={styles.pickerPill}
                onClick={() => setPickerOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={pickerOpen}
                title={activeFile?.path}
              >
                {activeFile && <StatusBadge status={activeFile.status} />}
                <span className={styles.pickerName}>
                  {activeFile ? (activeFile.path.split("/").pop() ?? "—") : "—"}
                </span>
                <span className={styles.pickerIndex}>
                  {activeIndex + 1}/{orderedFiles.length}
                </span>
                <ChevronDown size={14} strokeWidth={1.5} />
              </button>
              {pickerOpen && (
                <>
                  <div
                    className={styles.pickerBackdrop}
                    onClick={() => setPickerOpen(false)}
                  />
                  <div className={styles.pickerMenu} role="listbox">
                    {orderedFiles.map((file) => (
                      <button
                        key={file.path}
                        type="button"
                        role="option"
                        aria-selected={file.path === activeFile?.path}
                        className={`${styles.pickerItem} ${file.path === activeFile?.path ? styles.pickerItemActive : ""}`}
                        onClick={() => {
                          setSelectedFile(file.path);
                          setPickerOpen(false);
                        }}
                        title={file.path}
                      >
                        <StatusBadge status={file.status} />
                        <span className={styles.pickerItemPath}>
                          {file.path}
                        </span>
                        <CountsPair add={file.add} del={file.del} />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              className={styles.navArrow}
              onClick={() => stepFile(1)}
              disabled={orderedFiles.length < 2}
              title="Next file (→)"
              aria-label="Next file"
              aria-keyshortcuts="ArrowRight"
            >
              <ChevronRight size={16} strokeWidth={1.5} />
            </button>
          </div>
          {activeFile && (
            <div className={styles.focusSubheader}>
              <span className={styles.focusPath}>{activeFile.path}</span>
              <CountsPair add={activeFile.add} del={activeFile.del} />
            </div>
          )}
          <div className={styles.body}>
            {activeFile && <DiffFile file={activeFile} mode={mode} />}
          </div>
        </>
      )}
    </div>
  );
}

export default DiffInspector;
