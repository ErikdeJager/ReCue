import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
} from "react";
import { TriangleAlert } from "lucide-react";

import { repoName, sessionLabel } from "../../paths";
import { useStore } from "../../store";
import styles from "./ConfirmRemoveModal.module.css";

/**
 * The ⌘W/Ctrl+W destructive-close confirm (task 448), shown while `removePrompt` is
 * set: the keyboard fall-through of `closeFocusedPanel` (#425 — remove the selected
 * Overview/Attention agent, cancel a schedule / recurring) now honors the
 * `confirmDestructive` setting (#103) instead of acting silently — hover-focus
 * (`autoFocusOnHover`) selects the card under the cursor, so an unconfirmed chord
 * could kill an agent the user only hovered. The mouse × stays un-gated. Mirrors the
 * CanvasCloseModal pattern: scrim + Escape cancel, `role="dialog"`/`aria-modal`, a
 * Tab focus-trap over the two buttons, the danger action autofocused (Enter confirms
 * via native activation — no window Enter handler, so it can never double-fire).
 */
function ConfirmRemoveModal() {
  const prompt = useStore((s) => s.removePrompt);
  const sessions = useStore((s) => s.sessions);
  const schedules = useStore((s) => s.schedules);
  const recurrings = useStore((s) => s.recurrings);
  const branches = useStore((s) => s.branches);
  const autoNameOn = useStore((s) => s.settings.autoName);
  const confirmRemovePrompt = useStore((s) => s.confirmRemovePrompt);
  const cancelRemovePrompt = useStore((s) => s.cancelRemovePrompt);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dangerRef = useRef<HTMLButtonElement>(null);

  // Resolve the target against the live state; a vanished target (the agent
  // exited / the schedule fired while the modal was up) auto-dismisses below.
  const session =
    prompt?.kind === "agent"
      ? (sessions.find((x) => x.id === prompt.id) ?? null)
      : null;
  const schedule =
    prompt?.kind === "schedule"
      ? (schedules.find((x) => x.id === prompt.id) ?? null)
      : null;
  const recurring =
    prompt?.kind === "recurring"
      ? (recurrings.find((x) => x.id === prompt.id) ?? null)
      : null;
  const target = session ?? schedule ?? recurring;

  // Stale-target guard (the BigModeModal auto-close precedent): dismiss rather than
  // confirm-remove something that no longer exists.
  useEffect(() => {
    if (prompt && !target) cancelRemovePrompt();
  }, [prompt, target, cancelRemovePrompt]);

  // Autofocus the danger action and wire Escape → cancel. Enter is left to the
  // autofocused button's native activation (the CanvasCloseModal pattern).
  useEffect(() => {
    dangerRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelRemovePrompt();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancelRemovePrompt]);

  // Minimal focus trap: cycle Tab/Shift+Tab among the dialog's buttons.
  const onDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable =
      dialogRef.current?.querySelectorAll<HTMLElement>("button");
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

  if (!prompt || !target) return null;

  // Per-kind copy. The agent label mirrors Attention's `labelFor` resolution
  // (custom name → claude's auto-title when the #97 setting is on → branch/folder).
  let title: string;
  let body: string;
  let action: string;
  if (session) {
    const { primary } = sessionLabel(
      session.name,
      autoNameOn ? session.autoName : null,
      branches[session.repoPath] || repoName(session.repoPath),
    );
    title = `Remove “${primary}”?`;
    body =
      "The agent is killed and its session forgotten — its terminal and conversation leave every window.";
    action = "Remove";
  } else if (schedule) {
    const name = schedule.name || schedule.branch || repoName(schedule.cwd);
    title = `Cancel scheduled session “${name}”?`;
    body = "The pending launch is discarded.";
    action = "Cancel schedule";
  } else {
    const rec = recurring as NonNullable<typeof recurring>;
    const name = rec.name || rec.branch || repoName(rec.cwd);
    title = `Cancel recurring session “${name}”?`;
    body = "Its rotating agent is removed too.";
    action = "Cancel recurring";
  }

  return (
    <div
      className={`modal-scrim ${styles.overlay}`}
      onClick={cancelRemovePrompt}
    >
      <div
        ref={dialogRef}
        className={`modal-pop ${styles.dialog}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onDialogKeyDown}
      >
        <header className={styles.header}>
          <TriangleAlert
            size={15}
            strokeWidth={2}
            className={styles.headerIcon}
            aria-hidden
          />
          <h2 className={styles.title}>{title}</h2>
        </header>
        <p className={styles.body}>{body}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className="modal-btn modal-btn-neutral"
            onClick={cancelRemovePrompt}
          >
            Cancel <kbd className="modal-kbd">Esc</kbd>
          </button>
          <button
            type="button"
            ref={dangerRef}
            className="modal-btn modal-btn-danger"
            onClick={confirmRemovePrompt}
          >
            {action} <kbd className="modal-kbd">↵</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmRemoveModal;
