import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
} from "react";
import { TriangleAlert } from "lucide-react";

import { useStore } from "../../store";
import { collectLeaves } from "../Canvas/canvasTree";
import styles from "./CanvasCloseModal.module.css";

/**
 * Close-a-Canvas-tab prompt (#137), shown in the "Ask" mode when the tab being closed
 * has contents. Three single-key choices so the user can move fast without the mouse:
 * **K** → Kill & close (kill the tab's agents + shell terminals, remove its
 * file/diff/terminal/scheduled items from the sidebar + Overview), **Enter** → Keep &
 * close (the safe default — just drop the tab), **Esc** → Cancel. Mirrors the
 * TemplateUseModal pattern (scrim + Escape + `role="dialog"`/`aria-modal`), the default
 * Keep button autofocused, plus a Tab focus-trap over its buttons. Rendered at the App
 * top level while `canvasClosePromptId` is set.
 */
function CanvasCloseModal() {
  const promptId = useStore((s) => s.canvasClosePromptId);
  const canvases = useStore((s) => s.canvases);
  const confirmCloseCanvas = useStore((s) => s.confirmCloseCanvas);
  const cancelCloseCanvas = useStore((s) => s.cancelCloseCanvas);
  const dialogRef = useRef<HTMLDivElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  const canvas = canvases.find((c) => c.id === promptId);

  // Autofocus the safe default (Keep), and wire the global keybinds: K → kill, Esc →
  // cancel. Enter is left to the autofocused Keep button's native activation (so it
  // never double-fires alongside a window handler).
  useEffect(() => {
    keepRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelCloseCanvas();
      } else if (event.key === "k" || event.key === "K") {
        event.preventDefault();
        if (promptId) void confirmCloseCanvas(promptId, true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [promptId, confirmCloseCanvas, cancelCloseCanvas]);

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

  if (!promptId) return null;

  // Contents summary (#137): what Kill & close would remove.
  const leaves = collectLeaves(canvas?.layout ?? null);
  const by = (kind: string) =>
    leaves.filter((l) => l.content.kind === kind).length;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const parts: string[] = [];
  for (const [kind, word] of [
    ["agent", "agent"],
    ["terminal", "terminal"],
    ["file", "file"],
    ["kanban", "board"],
    ["diff", "diff"],
    ["scheduled", "schedule"],
  ] as const) {
    const n = by(kind);
    if (n) parts.push(plural(n, word));
  }
  const summary = parts.length ? parts.join(", ") : "this tab's contents";

  return (
    <div className={styles.overlay} onClick={cancelCloseCanvas}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Close canvas"
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
          <h2 className={styles.title}>Close “{canvas?.name ?? "Canvas"}”?</h2>
        </header>
        <p className={styles.body}>
          This tab contains {summary}. <strong>Kill &amp; close</strong> removes
          them from the sidebar and Overview too;{" "}
          <strong>Keep &amp; close</strong> just closes the tab.
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancel}
            onClick={cancelCloseCanvas}
          >
            Cancel <kbd className={styles.kbd}>Esc</kbd>
          </button>
          <button
            type="button"
            className={styles.danger}
            onClick={() => void confirmCloseCanvas(promptId, true)}
          >
            Kill &amp; close <kbd className={styles.kbd}>K</kbd>
          </button>
          <button
            type="button"
            ref={keepRef}
            className={styles.primary}
            onClick={() => void confirmCloseCanvas(promptId, false)}
          >
            Keep &amp; close <kbd className={styles.kbd}>↵</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

export default CanvasCloseModal;
