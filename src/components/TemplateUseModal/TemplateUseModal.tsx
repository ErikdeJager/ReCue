import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChevronLeft, FolderOpen, LayoutTemplate } from "lucide-react";

import { pickDirectory } from "../../ipc";
import { noAutoCapitalize } from "../../inputProps";
import { repoName } from "../../paths";
import { useStore } from "../../store";
import styles from "./TemplateUseModal.module.css";

/**
 * "New tab from template" chooser (#118): step 1 pick a saved template, step 2 pick
 * the target **folder** (recents + folder picker, reusing the #66 folder UX). On
 * "Open template" it instantiates the template into a new Canvas tab against that one
 * folder and resolves each block (`useTemplate`). Scrim / Escape close it.
 */
function TemplateUseModal() {
  const templates = useStore((s) => s.canvasTemplates);
  const recents = useStore((s) => s.recents);
  const close = useStore((s) => s.closeTemplateUse);
  // Aliased off `use*` so eslint's rules-of-hooks doesn't read the store action as
  // a React hook when it's called from a plain handler below.
  const runTemplate = useStore((s) => s.useTemplate);
  const openEditor = useStore((s) => s.openTemplateEditor);

  const [step, setStep] = useState<"template" | "folder">("template");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [cwd, setCwd] = useState<string | null>(recents[0] ?? null);
  // Optional custom name for the new Canvas tab (#311); blank keeps the template's
  // name. The modal unmounts on close, so no explicit reset is needed.
  const [tabName, setTabName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault(); // (#332) don't leak Esc to macOS fullscreen exit
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // Focus the tab-name input when the folder step opens so plain Enter can submit
  // (launch) immediately — the folder usually defaults to the most-recent recent (#339).
  useEffect(() => {
    if (step === "folder") nameRef.current?.focus();
  }, [step]);

  const chosen = templates.find((t) => t.id === templateId);

  const pick = async () => {
    const dir = await pickDirectory().catch(() => null);
    if (dir) setCwd(dir);
  };

  const open = () => {
    if (!templateId || !cwd) return;
    runTemplate(templateId, cwd, tabName);
  };

  // Enter-to-submit (#339): advance on the template step, launch on the folder step —
  // mirrors NewSessionModal's form-level submit. Both `setStep`/`open` already no-op
  // when their step isn't ready, so a disabled primary stays inert.
  const submitStep = () => {
    if (step === "template") {
      if (templateId) setStep("folder");
    } else {
      open(); // open() no-ops when !templateId || !cwd, and closes on success
    }
  };
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitStep();
  };
  // The list rows are `type="button"`, so Enter on a focused row wouldn't submit the
  // form on its own; run the step action here. Plain Enter only (no ⌘/Ctrl/Alt chord).
  const onListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.metaKey || event.ctrlKey || event.altKey)
      return;
    event.preventDefault();
    submitStep();
  };

  return (
    <div className={styles.overlay} onClick={close}>
      <form
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="New tab from template"
        onClick={(event) => event.stopPropagation()}
        onSubmit={onSubmit}
      >
        <header className={styles.header}>
          <LayoutTemplate
            size={15}
            strokeWidth={2}
            className={styles.headerIcon}
            aria-hidden
          />
          <h2 className={styles.title}>New tab from template</h2>
        </header>

        {step === "template" ? (
          <>
            <p className={styles.label}>Template</p>
            {templates.length === 0 ? (
              <p className={styles.empty}>
                No templates yet. Create one first, then open it here.
              </p>
            ) : (
              <div
                className={styles.list}
                role="listbox"
                aria-label="Templates"
                onKeyDown={onListKeyDown}
              >
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="option"
                    aria-selected={t.id === templateId}
                    className={`${styles.row} ${t.id === templateId ? styles.rowActive : ""}`}
                    onClick={() => setTemplateId(t.id)}
                    onDoubleClick={() => {
                      setTemplateId(t.id);
                      setStep("folder");
                    }}
                    title={t.name}
                  >
                    <span className={styles.rowName}>{t.name}</span>
                  </button>
                ))}
              </div>
            )}
            <div className={styles.actions}>
              <button type="button" className={styles.cancel} onClick={close}>
                Cancel
              </button>
              {templates.length === 0 ? (
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => openEditor(null)}
                >
                  New template…
                </button>
              ) : (
                <button
                  type="submit"
                  className={styles.primary}
                  disabled={!templateId}
                >
                  Continue
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              className={styles.back}
              onClick={() => setStep("template")}
            >
              <ChevronLeft size={14} strokeWidth={1.5} />
              {chosen?.name ?? "Template"}
            </button>
            <p className={styles.label}>Folder</p>
            {recents.length > 0 && (
              <div
                className={styles.list}
                role="listbox"
                aria-label="Recent folders"
                onKeyDown={onListKeyDown}
              >
                {recents.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="option"
                    aria-selected={r === cwd}
                    className={`${styles.row} ${r === cwd ? styles.rowActive : ""}`}
                    onClick={() => setCwd(r)}
                    title={r}
                  >
                    <span className={styles.rowName}>{repoName(r)}</span>
                    <span className={styles.rowPath}>{r}</span>
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              className={styles.pickButton}
              onClick={() => void pick()}
            >
              <FolderOpen size={15} strokeWidth={1.5} />
              {recents.length > 0 ? "Choose another…" : "Choose folder…"}
            </button>
            {cwd && !recents.includes(cwd) && (
              <p className={styles.path}>{cwd}</p>
            )}
            <p className={styles.label}>Tab name (optional)</p>
            <input
              ref={nameRef}
              className={styles.nameInput}
              type="text"
              value={tabName}
              onChange={(event) => setTabName(event.currentTarget.value)}
              placeholder={chosen?.name ?? "Custom name…"}
              aria-label="Tab name"
              {...noAutoCapitalize}
            />
            <div className={styles.actions}>
              <button type="button" className={styles.cancel} onClick={close}>
                Cancel
              </button>
              <button
                type="submit"
                className={styles.primary}
                disabled={!cwd || !templateId}
              >
                Open template
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

export default TemplateUseModal;
