import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";

import { pickDirectory } from "../../ipc";
import { repoName } from "../../paths";
import { useStore } from "../../store";
import styles from "./NewSessionModal.module.css";

/**
 * Modal to start a session: choose a working directory (folder picker +
 * recent-folder chips) and an optional name, then spawn `claude` there. State
 * lives in the store (`newSessionOpen` / `newSessionRepo`); `spawnSession`
 * already adds to the store + recents, selects it, and toasts.
 */
function NewSessionModal() {
  const open = useStore((s) => s.newSessionOpen);
  const prefillRepo = useStore((s) => s.newSessionRepo);
  const recents = useStore((s) => s.recents);
  const close = useStore((s) => s.closeNewSession);
  const spawnSession = useStore((s) => s.spawnSession);

  const [cwd, setCwd] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset / prefill each time the modal opens.
  useEffect(() => {
    if (open) {
      setCwd(prefillRepo);
      setName("");
      setBusy(false);
    }
  }, [open, prefillRepo]);

  // Escape closes the modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  const pick = async () => {
    const dir = await pickDirectory().catch(() => null);
    if (dir) setCwd(dir);
  };

  const create = async () => {
    if (!cwd || busy) return;
    setBusy(true);
    await spawnSession(cwd, name.trim() || repoName(cwd));
    close();
  };

  return (
    <div className={styles.overlay} onClick={close}>
      <form
        className={styles.sheet}
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
            <FolderOpen size={16} strokeWidth={1.5} />
            Choose folder…
          </button>
          <span className={cwd ? styles.path : styles.pathEmpty}>
            {cwd ?? "No folder selected"}
          </span>
        </div>

        {recents.length > 0 && (
          <div className={styles.chips}>
            {recents.map((recent) => (
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

        <label className={styles.label} htmlFor="session-name">
          Name (optional)
        </label>
        <input
          id="session-name"
          className={styles.input}
          value={name}
          placeholder={cwd ? repoName(cwd) : "Defaults to the folder name"}
          onChange={(event) => setName(event.currentTarget.value)}
          autoFocus
        />

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={close}>
            Cancel
          </button>
          <button
            type="submit"
            className={styles.create}
            disabled={!cwd || busy}
          >
            Create
          </button>
        </div>
      </form>
    </div>
  );
}

export default NewSessionModal;
