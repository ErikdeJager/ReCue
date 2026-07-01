import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { FolderOpen, GitBranch } from "lucide-react";

import { pickDirectory } from "../../ipc";
import { noAutoCapitalize } from "../../inputProps";
import { useStore } from "../../store";
import styles from "./CloneRepoModal.module.css";

/**
 * The Clone Repo modal (#295) — opened from the sidebar ⋯ session-options menu (#294)
 * and the background context menu's "Clone Repo…". Takes a **git URL** and a
 * **destination parent directory** (native folder dialog via `pickDirectory`), then
 * clones into `<parent>/<repo-name>`. `git clone` already lands the working tree on the
 * repository's **default branch** (`main` / `master` / …), so the backend only fabricates
 * a `main` for a truly empty / branch-less clone (#298); the folder is registered as a
 * repo and a `claude` session starts on that default branch — all via the store
 * `cloneRepo` action. A "Cloning…" busy state disables the inputs and blocks
 * double-submits; a clone failure (bad URL / auth / network / existing dest) shows git's
 * stderr inline and closes nothing.
 *
 * Store-driven (`cloneRepoOpen` + `closeCloneRepo`/`cloneRepo`), centered, focus-trapped
 * (Tab stays inside), Escape / outside-click close, URL auto-focused, Enter submits.
 * Mounted once in App.tsx (returns null when closed); local draft state resets on each
 * open. Main-window only. Cross-platform: the backend builds the dest path and shells
 * out to git, so this UI has no OS-specific path handling.
 */
function CloneRepoModal() {
  const open = useStore((s) => s.cloneRepoOpen);
  const close = useStore((s) => s.closeCloneRepo);
  const cloneRepo = useStore((s) => s.cloneRepo);

  const [url, setUrl] = useState("");
  const [parent, setParent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Reset the draft each time the modal opens, and focus the URL field. Capture the
  // opener so focus is restored to it on close (a11y, like NewSessionModal #49).
  useEffect(() => {
    if (!open) return;
    setUrl("");
    setParent(null);
    setBusy(false);
    setError(null);
    openerRef.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => urlRef.current?.focus(), 0);
    return () => {
      clearTimeout(t);
      openerRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const canClone = url.trim().length > 0 && !!parent && !busy;

  const chooseParent = async () => {
    const dir = await pickDirectory().catch(() => null);
    if (dir) setParent(dir);
  };

  const submit = async () => {
    if (!canClone) return;
    setBusy(true);
    setError(null);
    const result = await cloneRepo(url.trim(), parent!);
    if (result === true) {
      close();
    } else {
      setError(result);
      setBusy(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit();
  };

  const onDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!busy) close();
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

  return (
    <div
      className={styles.overlay}
      onClick={() => {
        if (!busy) close();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Clone repository"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onDialogKeyDown}
      >
        <h2 className={styles.title}>
          <GitBranch size={15} strokeWidth={2} className={styles.titleIcon} />
          Clone Repo
        </h2>

        <form onSubmit={onSubmit}>
          <label className={styles.label} htmlFor="clone-url">
            Git URL
          </label>
          <input
            id="clone-url"
            ref={urlRef}
            className={styles.input}
            {...noAutoCapitalize}
            type="text"
            value={url}
            placeholder="https://github.com/owner/repo.git"
            disabled={busy}
            onChange={(event) => setUrl(event.currentTarget.value)}
            aria-label="Git URL"
          />

          <p className={styles.label}>Destination folder</p>
          <div className={styles.destRow}>
            <span
              className={`${styles.destPath} ${parent ? "" : styles.destPlaceholder}`}
              title={parent ?? undefined}
            >
              {parent ?? "No folder chosen"}
            </span>
            <button
              type="button"
              className={styles.pickButton}
              onClick={() => void chooseParent()}
              disabled={busy}
            >
              <FolderOpen size={15} strokeWidth={1.5} />
              Choose…
            </button>
          </div>
          <p className={styles.hint}>
            The repo clones into a new folder here (named for the URL) and opens
            on its default branch.
          </p>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancel}
              onClick={close}
              disabled={busy}
            >
              Cancel
            </button>
            <button type="submit" className={styles.clone} disabled={!canClone}>
              {busy ? "Cloning…" : "Clone"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CloneRepoModal;
