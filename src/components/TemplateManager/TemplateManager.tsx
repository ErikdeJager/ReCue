import { useEffect, useRef, useState } from "react";
import { Copy, Pencil, Plus, Trash2, X } from "lucide-react";

import { useStore } from "../../store";
import styles from "./TemplateManager.module.css";

/**
 * "Manage templates" view (#117): a centered modal listing the saved Canvas
 * templates, each with **Edit** (reopen in the editor), **Rename** (inline),
 * **Duplicate**, and **Delete** (confirm-gated per #103). A "New template" button
 * opens the editor empty. Scrim / Escape / the × close it.
 */
function TemplateManager() {
  const templates = useStore((s) => s.canvasTemplates);
  const close = useStore((s) => s.closeTemplateManager);
  const openEditor = useStore((s) => s.openTemplateEditor);
  const renameTemplate = useStore((s) => s.renameTemplate);
  const duplicateTemplate = useStore((s) => s.duplicateTemplate);
  const deleteTemplate = useStore((s) => s.deleteTemplate);
  const confirmDestructive = useStore((s) => s.settings.confirmDestructive);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // The template pending a delete confirm (#103); null when not confirming.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // Guards the rename `onBlur` so an explicit cancel/commit doesn't double-fire
  // (mirrors the SessionRow #57 pattern): Escape cancels without committing.
  const renameSettled = useRef(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const beginRename = (id: string, name: string) => {
    renameSettled.current = false;
    setRenamingId(id);
    setDraft(name);
  };
  // Enter / blur commit; Escape cancels. The guard avoids a double-commit (and a
  // commit-on-cancel) when clearing `renamingId` blurs the unmounting input.
  const commitRename = (id: string) => {
    if (renameSettled.current) return;
    renameSettled.current = true;
    renameTemplate(id, draft);
    setRenamingId(null);
  };
  const cancelRename = () => {
    renameSettled.current = true;
    setRenamingId(null);
  };

  const onDelete = (id: string) => {
    // Confirm-gated unless turned off in Settings (#103): the first click arms the
    // confirm, the second deletes.
    if (confirmDestructive && confirmId !== id) {
      setConfirmId(id);
      return;
    }
    deleteTemplate(id);
    setConfirmId(null);
  };

  return (
    <div className={styles.overlay} onClick={close}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Manage templates"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>Manage templates</h2>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={close}
            title="Close"
            aria-label="Close"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </header>

        <div className={styles.list}>
          {templates.length === 0 ? (
            <p className={styles.empty}>
              No templates yet. Create one to save a reusable workspace layout.
            </p>
          ) : (
            templates.map((t) => (
              <div key={t.id} className={styles.row}>
                {renamingId === t.id ? (
                  <input
                    className={styles.renameInput}
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitRename(t.id);
                      } else if (event.key === "Escape") {
                        // Cancel the rename (discard the draft) without closing the
                        // modal: stopPropagation keeps the window Escape→close handler
                        // from firing, and cancelRename guards the onBlur commit.
                        event.preventDefault();
                        event.stopPropagation();
                        cancelRename();
                      }
                    }}
                    onBlur={() => commitRename(t.id)}
                    aria-label="Template name"
                  />
                ) : (
                  <span className={styles.name} title={t.name}>
                    {t.name}
                  </span>
                )}
                <span className={styles.actions}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => openEditor(t.id)}
                    title="Edit"
                    aria-label={`Edit ${t.name}`}
                  >
                    <Pencil size={14} strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => beginRename(t.id, t.name)}
                    title="Rename"
                    aria-label={`Rename ${t.name}`}
                  >
                    <span className={styles.renameGlyph}>Aa</span>
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => duplicateTemplate(t.id)}
                    title="Duplicate"
                    aria-label={`Duplicate ${t.name}`}
                  >
                    <Copy size={14} strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${styles.danger} ${confirmId === t.id ? styles.dangerArmed : ""}`}
                    onClick={() => onDelete(t.id)}
                    onMouseLeave={() =>
                      confirmId === t.id && setConfirmId(null)
                    }
                    title={
                      confirmId === t.id ? "Click again to delete" : "Delete"
                    }
                    aria-label={`Delete ${t.name}`}
                  >
                    {confirmId === t.id ? (
                      <span className={styles.confirmText}>Delete?</span>
                    ) : (
                      <Trash2 size={14} strokeWidth={1.5} />
                    )}
                  </button>
                </span>
              </div>
            ))
          )}
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.newBtn}
            onClick={() => openEditor(null)}
          >
            <Plus size={14} strokeWidth={1.5} /> New template
          </button>
        </footer>
      </div>
    </div>
  );
}

export default TemplateManager;
