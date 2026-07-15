import { useEffect, useRef, useState } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";

import {
  captureProblem,
  chordForAction,
  chordLabel,
  eventChord,
  KEYBIND_ACTIONS,
  keybindConflicts,
  setKeybindCapture,
  type KeybindActionId,
  type KeybindOverrides,
} from "../../keybinds";
import { kbdHint } from "../../platform";
import styles from "./Settings.module.css";
import { SHORTCUT_GROUPS } from "./shortcuts";

/** The registry's groups in display order (first occurrence wins). */
const ACTION_GROUPS = [...new Set(KEYBIND_ACTIONS.map((a) => a.group))];

/** Human message for a rejected capture. */
function problemMessage(
  problem: NonNullable<ReturnType<typeof captureProblem>>,
): string {
  if (problem.kind === "needs-modifier") {
    return "Add a modifier (or use an F-key) — bare keys would shadow typing.";
  }
  if (problem.kind === "reserved") {
    return "That combination is reserved by the app or the OS.";
  }
  const taken = KEYBIND_ACTIONS.find((a) => a.id === problem.takenBy);
  return `Already used by “${taken?.label ?? problem.takenBy}”.`;
}

/**
 * Settings → Shortcuts (keybind rework, supersedes the #318 read-only pane): the
 * rebindable actions as **editable** rows — click a chord chip, press the new
 * combination (Backspace unbinds, Esc cancels), reset a changed row to its
 * default — over the fixed contextual reference (`shortcuts.ts`). Edits stage in
 * the modal draft like every other section and persist on Save.
 *
 * While recording, `setKeybindCapture` gates the global dispatcher
 * (`useKeyboardNav`) so the pressed chord is captured instead of executed, and a
 * window **capture-phase** listener owns the keydown before the dialog's own
 * Escape/focus-trap handler can see it.
 */
function ShortcutsPane({
  platform,
  keybinds,
  onChange,
}: {
  platform: string;
  keybinds: KeybindOverrides;
  onChange: (next: KeybindOverrides) => void;
}) {
  const [recordingId, setRecordingId] = useState<KeybindActionId | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The draft the recorder validates against — a ref so the (stable) window
  // listener always sees the latest overrides without re-arming per keystroke.
  const keybindsRef = useRef(keybinds);
  keybindsRef.current = keybinds;
  const recordingRef = useRef<KeybindActionId | null>(null);
  recordingRef.current = recordingId;

  // Blob-forced duplicates (the recorder itself refuses conflicts): badge both rows.
  const conflicted = new Set([...keybindConflicts(keybinds).values()].flat());

  const assign = (id: KeybindActionId, chord: string) => {
    const action = KEYBIND_ACTIONS.find((a) => a.id === id);
    const next: KeybindOverrides = { ...keybindsRef.current };
    // Recording the default again clears the override instead of storing a
    // redundant copy (so future default changes still reach this install).
    if (action && chord === action.defaultChord) delete next[id];
    else next[id] = chord;
    onChange(next);
  };

  // Recording: own the next keydown ahead of everything (window capture phase —
  // before the dialog's Escape handler and before any React synthetic handler),
  // with the global dispatcher gated off via setKeybindCapture.
  useEffect(() => {
    if (!recordingId) return;
    setKeybindCapture(true);
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const id = recordingRef.current;
      if (!id) return;
      if (e.key === "Escape") {
        setRecordingId(null);
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        assign(id, "");
        setRecordingId(null);
        return;
      }
      const chord = eventChord(e, platform);
      if (!chord) return; // bare modifier — keep recording
      const problem = captureProblem(chord, id, keybindsRef.current, platform);
      if (problem) {
        setError(problemMessage(problem));
        return; // keep recording so the user can try another combo
      }
      assign(id, chord);
      setRecordingId(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      setKeybindCapture(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingId, platform]);

  const startRecording = (id: KeybindActionId) => {
    setError(null);
    setRecordingId(id);
  };

  return (
    <div className={styles.shortcutsSection}>
      <p className={styles.helpText}>
        Click a shortcut, then press the new combination —{" "}
        {kbdHint(platform, "⌫", "Backspace")} removes it,{" "}
        {kbdHint(platform, "Esc", "Esc")} cancels. Changes apply on Save.
      </p>
      {ACTION_GROUPS.map((group) => (
        <div key={group} className={styles.shortcutGroup}>
          <span className={styles.fieldLabel}>{group}</span>
          <ul className={styles.shortcutList}>
            {KEYBIND_ACTIONS.filter((a) => a.group === group).map((action) => {
              const chord = chordForAction(action.id, keybinds);
              const overridden = keybinds[action.id] !== undefined;
              const recording = recordingId === action.id;
              const label = chordLabel(chord, platform);
              return (
                <li key={action.id} className={styles.shortcutRow}>
                  <span className={styles.shortcutDesc}>
                    {action.label}
                    {conflicted.has(action.id) && (
                      <span
                        className={styles.keybindConflict}
                        title="This combination is bound to more than one action — only the first runs. Rebind one of them."
                      >
                        <TriangleAlert size={12} strokeWidth={1.5} />
                      </span>
                    )}
                  </span>
                  <span className={styles.keybindControls}>
                    {overridden && !recording && (
                      <button
                        type="button"
                        className={styles.keybindReset}
                        title={`Reset to default (${
                          chordLabel(action.defaultChord, platform) || "unbound"
                        })`}
                        aria-label={`Reset ${action.label} to default`}
                        onClick={() => {
                          setError(null);
                          const next = { ...keybindsRef.current };
                          delete next[action.id];
                          onChange(next);
                        }}
                      >
                        <RotateCcw size={12} strokeWidth={1.5} />
                      </button>
                    )}
                    <button
                      type="button"
                      className={`${styles.keybindChip} ${
                        recording ? styles.keybindChipRecording : ""
                      } ${!recording && !label ? styles.keybindChipUnbound : ""}`}
                      title={
                        recording
                          ? "Press the new combination"
                          : `Change the ${action.label} shortcut`
                      }
                      onClick={() =>
                        recording
                          ? setRecordingId(null)
                          : startRecording(action.id)
                      }
                      onBlur={() => {
                        if (recordingRef.current === action.id) {
                          setRecordingId(null);
                        }
                      }}
                    >
                      {recording ? "Press keys…" : label || "Unbound"}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {error && (
        <p className={styles.keybindError} role="alert">
          {error}
        </p>
      )}

      {/* Fixed, contextual chords — reference only (the pre-rework #318 look). */}
      <p className={styles.helpText}>
        Fixed shortcuts — contextual, and can&rsquo;t be changed:
      </p>
      {SHORTCUT_GROUPS.map((group) => (
        <div key={group.title} className={styles.shortcutGroup}>
          <span className={styles.fieldLabel}>{group.title}</span>
          <ul className={styles.shortcutList}>
            {group.shortcuts.map((shortcut) => (
              <li key={shortcut.description} className={styles.shortcutRow}>
                {/* Label-left / key-chip-right (UI v2 §10); the chip is the
                    task-372 `.kbd-chip` atom (atoms.css, global). */}
                <span className={styles.shortcutDesc}>
                  {shortcut.description}
                </span>
                <kbd className={`kbd-chip ${styles.shortcutKey}`}>
                  {kbdHint(platform, shortcut.mac, shortcut.win)}
                </kbd>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default ShortcutsPane;
