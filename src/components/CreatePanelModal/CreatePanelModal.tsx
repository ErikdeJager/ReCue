import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChevronLeft, FolderOpen, Plus } from "lucide-react";

import { pickDirectory } from "../../ipc";
import { noAutoCapitalize } from "../../inputProps";
import { repoName } from "../../paths";
import { useStore } from "../../store";
import type { OverviewPanel } from "../../types";
import FilePicker from "../FilePicker/FilePicker";
import styles from "./CreatePanelModal.module.css";
import {
  PANEL_TYPES,
  type PanelTypeKey,
  panelTypeForDigit,
} from "./panelTypes";

// The non-agent types map to an `overviewPanels` kind (a File viewer is a
// `markdown` panel; the rest are 1:1). `session` is handled separately (spawns an
// agent via `startRepoSession`), so it's excluded here.
const OVERVIEW_KIND: Record<
  Exclude<PanelTypeKey, "session">,
  OverviewPanel["kind"]
> = {
  file: "markdown",
  diff: "diff",
  terminal: "terminal",
  kanban: "kanban",
  filetree: "filetree",
};

/**
 * The ⌘K "Create panel" launcher (#189): a keyboard-first, two-step modal to spawn
 * any panel type in a chosen repo-or-worktree. **Type step** — the six panel types
 * with digit hints (click or press 1–6). **Target step** — pick an open repo /
 * worktree (from recents + live session folders) or Browse… Per type it then
 * **reuses the shipped creation actions**: `session` → `startRepoSession` (its
 * branch/worktree flow); `file`/`kanban` → a `FilePicker` → `addOverviewPanel` /
 * `createKanbanBoard`; `diff`/`terminal`/`filetree` → `addOverviewPanel` directly.
 * New panels land in the sidebar + Overview (and are draggable into Canvas), exactly
 * like the Views menu — never auto-inserted into the active Canvas layout.
 *
 * Opened via ⌘K (type step) or ⌘⌥1–6 (straight to the target step for that type).
 * Mounted only while open (App gates on `createPanelOpen`), so its draft state seeds
 * fresh from `createPanelType` each open. Centered, focus-trapped, Escape /
 * outside-click close. Main-window only.
 */
function CreatePanelModal() {
  const seedType = useStore((s) => s.createPanelType) as PanelTypeKey | null;
  const recents = useStore((s) => s.recents);
  const sessions = useStore((s) => s.sessions);
  const close = useStore((s) => s.closeCreatePanel);
  const startRepoSession = useStore((s) => s.startRepoSession);
  const addOverviewPanel = useStore((s) => s.addOverviewPanel);
  const createKanbanBoard = useStore((s) => s.createKanbanBoard);

  // Seeded once at mount (the modal remounts on each open). A pre-selected type
  // (⌘⌥1–6) skips the type step.
  const [step, setStep] = useState<"type" | "target" | "file">(
    seedType ? "target" : "type",
  );
  const [typeKey, setTypeKey] = useState<PanelTypeKey | null>(seedType);
  const [folder, setFolder] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const firstTypeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // The target folders: open repos + their worktrees (live session `repoPath`s,
  // which include #74 worktree folders) unioned with `recents`, deduped in order.
  const folders = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of recents) {
      if (!seen.has(r)) {
        seen.add(r);
        out.push(r);
      }
    }
    for (const s of sessions) {
      if (s.repoPath && !seen.has(s.repoPath)) {
        seen.add(s.repoPath);
        out.push(s.repoPath);
      }
    }
    return out;
  }, [recents, sessions]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? folders.filter(
        (f) =>
          repoName(f).toLowerCase().includes(q) || f.toLowerCase().includes(q),
      )
    : folders;

  // Reset the highlight to the top whenever the filter changes.
  useEffect(() => setActiveIndex(0), [query]);

  // Focus per step: the first type chip (type step) or the folder search (target).
  // The FilePicker autofocuses its own input (file step).
  useEffect(() => {
    const t = setTimeout(() => {
      if (step === "type") firstTypeRef.current?.focus();
      else if (step === "target") searchRef.current?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [step]);

  // Capture the opener; restore focus to it on close (a11y, like NewSessionModal #49).
  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    return () => openerRef.current?.focus?.();
  }, []);

  const selectType = (key: PanelTypeKey) => {
    setTypeKey(key);
    setStep("target");
  };

  const chooseFolder = (f: string) => {
    if (typeKey === "session") {
      // Reuse the per-repo start (#127): a git folder opens the branch/worktree
      // step, a non-git folder spawns immediately. No branch logic re-implemented.
      close();
      void startRepoSession(f);
      return;
    }
    if (typeKey === "file" || typeKey === "kanban") {
      setFolder(f);
      setStep("file");
      return;
    }
    if (typeKey) {
      void addOverviewPanel(f, OVERVIEW_KIND[typeKey]);
      close();
    }
  };

  const browse = async () => {
    const dir = await pickDirectory().catch(() => null);
    if (dir) chooseFolder(dir);
  };

  const backToType = () => {
    setStep("type");
    setQuery("");
  };

  // Dialog-level keys: digit 1–6 selects a type (type step); Tab is trapped inside.
  const onDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (step === "type" && /^[1-6]$/.test(event.key)) {
      const key = panelTypeForDigit(Number(event.key));
      if (key) {
        event.preventDefault();
        selectType(key);
      }
      return;
    }
    // Focus-trap (a11y #49): keep Tab inside the dialog.
    if (event.key === "Tab" && dialogRef.current) {
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
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
    }
  };

  // Folder search keys: ↑/↓ move the highlight, Enter chooses the highlighted folder.
  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      if (filtered.length === 0) return;
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      if (filtered.length === 0) return;
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const f = filtered[activeIndex];
      if (f) chooseFolder(f);
    }
  };

  const typeLabel = typeKey
    ? PANEL_TYPES.find((t) => t.key === typeKey)?.label
    : "";

  return (
    <div className={`modal-scrim ${styles.overlay}`} onClick={close}>
      <div
        ref={dialogRef}
        className={`modal-pop ${styles.dialog}`}
        role="dialog"
        aria-modal="true"
        aria-label="Create panel"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onDialogKeyDown}
      >
        <h2 className={styles.title}>
          <Plus size={15} strokeWidth={2} className={styles.titleIcon} />
          Create panel
        </h2>

        {step === "type" ? (
          <>
            <p className={styles.label}>Choose a type</p>
            <div
              className={styles.types}
              role="listbox"
              aria-label="Panel type"
            >
              {PANEL_TYPES.map((t, i) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.key}
                    ref={i === 0 ? firstTypeRef : undefined}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className={styles.type}
                    onClick={() => selectType(t.key)}
                  >
                    <Icon
                      size={15}
                      strokeWidth={1.5}
                      className={styles.typeIcon}
                    />
                    <span className={styles.typeLabel}>{t.label}</span>
                    <kbd className="modal-kbd">{i + 1}</kbd>
                  </button>
                );
              })}
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className="modal-btn modal-btn-neutral"
                onClick={close}
              >
                Cancel <kbd className="modal-kbd">esc</kbd>
              </button>
            </div>
          </>
        ) : step === "target" ? (
          <>
            <button
              type="button"
              className={styles.back}
              onClick={backToType}
              aria-label="Change type"
            >
              <ChevronLeft size={14} strokeWidth={1.5} />
              <span className={styles.backName}>{typeLabel}</span>
              <span className={styles.backHint}>change type</span>
            </button>

            <p className={styles.label}>Folder</p>
            <input
              ref={searchRef}
              className={styles.search}
              {...noAutoCapitalize}
              type="text"
              value={query}
              placeholder="Search open repos & worktrees…"
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={onSearchKeyDown}
              aria-label="Search folders"
            />
            <div className={styles.folders} role="listbox" aria-label="Folders">
              {filtered.length === 0 ? (
                <p className={styles.empty}>No matching folders.</p>
              ) : (
                filtered.map((f, i) => (
                  <button
                    key={f}
                    type="button"
                    role="option"
                    aria-selected={i === activeIndex}
                    className={`${styles.folder} ${i === activeIndex ? styles.folderActive : ""}`}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => chooseFolder(f)}
                    title={f}
                  >
                    <span className={styles.folderName}>{repoName(f)}</span>
                    <span className={styles.folderPath}>{f}</span>
                  </button>
                ))
              )}
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className="modal-btn modal-btn-neutral"
                onClick={close}
              >
                Cancel <kbd className="modal-kbd">esc</kbd>
              </button>
              <button
                type="button"
                className="modal-btn modal-btn-neutral"
                onClick={() => void browse()}
              >
                <FolderOpen size={15} strokeWidth={1.5} />
                Browse…
              </button>
            </div>
          </>
        ) : (
          // File / Kanban: pick (or, for Kanban, create) the board/file in `folder`.
          folder && (
            <>
              <button
                type="button"
                className={styles.back}
                onClick={() => setStep("target")}
                aria-label="Change folder"
              >
                <ChevronLeft size={14} strokeWidth={1.5} />
                <span className={styles.backName}>{repoName(folder)}</span>
                <span className={styles.backHint}>change folder</span>
              </button>
              <FilePicker
                repoPath={folder}
                ext={typeKey === "kanban" ? ".md" : undefined}
                onPick={(f) => {
                  void addOverviewPanel(
                    folder,
                    typeKey === "kanban" ? "kanban" : "markdown",
                    f,
                  );
                  close();
                }}
                onCreate={
                  typeKey === "kanban"
                    ? (name) => {
                        void createKanbanBoard(folder, name);
                        close();
                      }
                    : undefined
                }
                createSuffix={typeKey === "kanban" ? ".md" : undefined}
              />
            </>
          )
        )}
      </div>
    </div>
  );
}

export default CreatePanelModal;
