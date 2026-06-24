import { useEffect, useRef, useState } from "react";
import { ChevronDown, FolderOpen } from "lucide-react";

import { listFiles, pickFile } from "../../ipc";
import { splitPath } from "../../paths";
import FilePicker from "../FilePicker/FilePicker";
import styles from "./FileSwitcher.module.css";

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

interface FileSwitcherProps {
  /** The viewer's repo — the picker lists this repo's files only (#90). */
  repoPath: string;
  /** The currently-shown file (repo-relative); its basename is the trigger label. */
  file: string;
  /** Switch the viewer to the chosen repo-relative file. */
  onPick: (file: string) => void;
  /** Open an absolute file picked via the native dialog (#163) — `repoPath` is the
   * file's parent dir, `file` its basename. Absent → the Browse… option is hidden. */
  onPickAbsolute?: (repoPath: string, file: string) => void;
  /** Class for the filename label, so it matches the host header's title style. */
  nameClassName?: string;
}

/**
 * The file-viewer header's filename rendered as a **switcher** (#90): a button
 * (basename + ▾ caret) that opens a searchable popover of the repo's files
 * (reusing `FilePicker` #56); picking one swaps the viewer in place. Self-contained
 * — it loads `listFiles(repoPath)` when opened and dismisses on pick / outside-click
 * / Escape. Shared by the Overview file column and Canvas file panel headers. It
 * stops pointerdown so opening it never starts the Overview card's drag (#43/#70).
 */
function FileSwitcher({
  repoPath,
  file,
  onPick,
  onPickAbsolute,
  nameClassName,
}: FileSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<string[] | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);

  // Load the repo's files when the popover opens (same list as the repo menu's
  // "File viewer" add, #82).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFiles(null);
    void listFiles(repoPath)
      .then((list) => {
        if (!cancelled) setFiles(list);
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, repoPath]);

  // Dismiss on outside-click + Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span
      ref={rootRef}
      className={styles.root}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((o) => !o)}
        title={`${basename(file)} — switch file`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={nameClassName}>{basename(file)}</span>
        <ChevronDown
          size={12}
          strokeWidth={1.5}
          className={styles.caret}
          aria-hidden
        />
      </button>
      {open && (
        <div className={styles.popover} role="dialog" aria-label="Switch file">
          <FilePicker
            files={files}
            onPick={(f) => {
              onPick(f);
              setOpen(false);
            }}
          />
          {/* Open any file on disk via the native dialog (#163) — its parent dir
              becomes the viewer's repo so the existing read/write path is reused. */}
          {onPickAbsolute && (
            <button
              type="button"
              className={styles.browse}
              onClick={() => {
                setOpen(false);
                void pickFile().then((path) => {
                  if (!path) return;
                  const { dir, base } = splitPath(path);
                  onPickAbsolute(dir, base);
                });
              }}
            >
              <FolderOpen size={13} strokeWidth={1.5} />
              Browse…
            </button>
          )}
        </div>
      )}
    </span>
  );
}

export default FileSwitcher;
