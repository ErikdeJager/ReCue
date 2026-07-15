import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { repoName } from "../../paths";
import { useStore } from "../../store";
import { useKeybindLabel } from "../../useKeybind";
import Checkbox from "../Checkbox/Checkbox";
import styles from "./EditorPicker.module.css";

/**
 * "Open in editor" picker. Shown on the first use (no `preferredEditor` yet), on
 * the choose-editor chord (default ⌘⇧O), and as the `BinaryNotFound` self-heal
 * when a remembered editor turns out to be gone. Lists the **detected** editors
 * (the store kicked a fresh `detect_editors` sweep on open; `editorChoices` is
 * `null` while it's in flight) plus a custom-command row — the inclusivity valve
 * for terminal editors and anything else (`alacritty -e nvim {path}`).
 *
 * "Remember my choice" is **checked by default**: picking persists
 * `preferredEditor` so the next ⌘O launches instantly; unchecking keeps the
 * preference unset so every use asks again. A custom command always persists —
 * the backend reads it off the settings blob at launch time.
 *
 * Mirrors the OnboardingModal conventions (modal-scrim/modal-pop, autofocus, a
 * Tab focus-trap, Escape/scrim to dismiss). Rendered in the main window's
 * ModalHost AND in detached canvas windows (#84) — their agent headers carry the
 * same ⋯ menu and the open/choose chords work there too.
 */
function EditorPickerModal() {
  const path = useStore((s) => s.editorPickerPath);
  const choices = useStore((s) => s.editorChoices);
  const preferred = useStore((s) => s.settings.preferredEditor);
  const savedCommand = useStore((s) => s.settings.customEditorCommand);
  const choose = useStore((s) => s.chooseEditor);
  const close = useStore((s) => s.closeEditorPicker);
  const rePickHint = useKeybindLabel("choose-editor");

  const [remember, setRemember] = useState(true);
  const [customOpen, setCustomOpen] = useState(preferred === "custom");
  const [command, setCommand] = useState(savedCommand);
  const dialogRef = useRef<HTMLDivElement>(null);

  const detected = choices?.filter((c) => c.found) ?? null;

  // Autofocus the first editor row (else the custom toggle); wire Escape.
  useEffect(() => {
    const first = dialogRef.current?.querySelector<HTMLButtonElement>(
      "button[data-editor], button[data-custom-toggle]",
    );
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // Minimal focus trap: cycle Tab/Shift+Tab among the dialog's controls
  // (the OnboardingModal pattern, widened to the input).
  const onDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      "button, input:not([type='checkbox'])",
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const confirmCustom = () => {
    if (command.trim() === "") return;
    void choose("custom", remember, command);
  };

  return (
    <div className={`modal-scrim ${styles.overlay}`} onClick={close}>
      <div
        ref={dialogRef}
        className={`modal-pop ${styles.dialog}`}
        role="dialog"
        aria-modal="true"
        aria-label="Open in editor"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onDialogKeyDown}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>Open in editor</h2>
          <p className={styles.subtitle}>
            {path
              ? `Pick the editor that opens “${repoName(path)}”. `
              : "Pick the editor ReCue opens folders with. "}
            Change it any time in Settings → Editor
            {rePickHint ? ` or with ${rePickHint}` : ""}.
          </p>
        </header>
        <div className={styles.choices}>
          {detected === null && (
            <p className={styles.note}>Detecting installed editors…</p>
          )}
          {detected !== null && detected.length === 0 && (
            <p className={styles.note}>
              No editors detected — use a custom command below.
            </p>
          )}
          {detected?.map((c) => (
            <button
              key={c.id}
              type="button"
              data-editor={c.id}
              className={`${styles.choice} ${preferred === c.id ? styles.choiceCurrent : ""}`}
              onClick={() => void choose(c.id, remember)}
            >
              <span className={styles.choiceRow}>
                <span className={styles.choiceName}>{c.display_name}</span>
                <span className={styles.badge}>
                  {preferred === c.id ? "Current" : (c.via ?? "")}
                </span>
              </span>
            </button>
          ))}
          <button
            type="button"
            data-custom-toggle
            className={`${styles.choice} ${customOpen ? styles.choiceOpen : ""} ${preferred === "custom" ? styles.choiceCurrent : ""}`}
            onClick={() => setCustomOpen((o) => !o)}
            aria-expanded={customOpen}
          >
            <span className={styles.choiceRow}>
              <span className={styles.choiceName}>Custom command…</span>
              {preferred === "custom" && (
                <span className={styles.badge}>Current</span>
              )}
            </span>
          </button>
          {customOpen && (
            <div className={styles.customBody}>
              <div className={styles.customRow}>
                <input
                  type="text"
                  className={styles.commandInput}
                  value={command}
                  onChange={(event) => setCommand(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      confirmCustom();
                    }
                  }}
                  placeholder="alacritty -e nvim {path}"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  aria-label="Custom editor command"
                />
                <button
                  type="button"
                  className={styles.customConfirm}
                  disabled={command.trim() === ""}
                  onClick={confirmCustom}
                >
                  Open
                </button>
              </div>
              <p className={styles.help}>
                A program and its arguments (quote to group) — not a shell line.
                Every <code>{"{path}"}</code> is replaced with the folder;
                without it the folder is appended last. Terminal editors go
                through their emulator, e.g.{" "}
                <code>alacritty -e nvim {"{path}"}</code>.
              </p>
            </div>
          )}
        </div>
        <div className={styles.actions}>
          <Checkbox
            checked={remember}
            onChange={setRemember}
            label="Remember my choice"
          />
          <button type="button" className={styles.cancel} onClick={close}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default EditorPickerModal;
