import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import type { SkillInfo } from "../../types";
import { noAutoCapitalize } from "../../inputProps";
import {
  applyInsertion,
  detectTrigger,
  filterSkills,
  type TriggerMatch,
} from "./slashCommands";
import styles from "./SkillAutocomplete.module.css";

interface SkillAutocompleteProps {
  /** Controlled value of the prompt textarea. */
  value: string;
  /** Fires on every change — typing **and** a programmatic skill insertion — so
   * the caller's own change path (e.g. auto-save) runs for both. */
  onChange: (value: string) => void;
  /** Skills/commands to offer (from `listSkills(cwd)`); may be empty. */
  skills: SkillInfo[];
  placeholder?: string;
  rows?: number;
  /** Applied to the textarea so it inherits each call site's field styling. */
  className?: string;
  ariaLabel?: string;
  /** Grow to fill a flex-column field and let the textarea fill it (ScheduledPanel
   * — the "big" prompt editor). Off (default) keeps fixed `rows` (the modal). */
  fill?: boolean;
}

/**
 * A prompt textarea with a `/`-triggered slash-command dropdown (#114): typing
 * `/` in command position opens a small menu of the skills `claude` would offer,
 * filtering as you type; ↑/↓ move, Enter/Tab/click insert `/<name> `, Escape
 * dismisses. Used by both the `NewSessionModal` schedule step and `ScheduledPanel`.
 *
 * **Container-key guard:** while the menu is open it `preventDefault` +
 * `stopPropagation`s Enter / Tab / Escape / ↑ / ↓, so those keys drive the menu
 * and never reach the surrounding modal (form submit / Escape-to-close / focus
 * trap) or Canvas keyboard nav. With the menu closed the keys behave as normal.
 */
function SkillAutocomplete({
  value,
  onChange,
  skills,
  placeholder,
  rows = 3,
  className,
  ariaLabel,
  fill = false,
}: SkillAutocompleteProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [trigger, setTrigger] = useState<TriggerMatch | null>(null);
  const [active, setActive] = useState(0);

  const matches = useMemo(
    () => (trigger ? filterSkills(skills, trigger.query) : []),
    [skills, trigger],
  );
  const menuOpen = trigger !== null && matches.length > 0;

  // Clamp the highlight when the match list shrinks under the filter.
  useEffect(() => {
    if (active >= matches.length) setActive(0);
  }, [matches.length, active]);

  // Keep the highlighted option scrolled into view.
  useEffect(() => {
    if (!menuOpen) return;
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active, menuOpen]);

  // Recompute the active trigger from the textarea's current value + caret.
  const sync = (nextValue: string, caret: number) => {
    setTrigger(detectTrigger(nextValue, caret));
    setActive(0);
  };

  const close = () => setTrigger(null);

  const accept = (s: SkillInfo) => {
    if (!trigger) return;
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? value.length;
    const next = applyInsertion(value, caret, trigger.start, s.name);
    onChange(next.value);
    setTrigger(null);
    // Restore the caret after the controlled value re-renders.
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(next.caret, next.caret);
      }
    });
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (!menuOpen) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        event.stopPropagation();
        setActive((a) => Math.min(a + 1, matches.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        event.stopPropagation();
        setActive((a) => Math.max(a - 1, 0));
        break;
      case "Enter":
      case "Tab": {
        event.preventDefault();
        event.stopPropagation();
        const s = matches[active];
        if (s) accept(s);
        break;
      }
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
      default:
        break;
    }
  };

  return (
    <div className={`${styles.wrap} ${fill ? styles.wrapFill : ""}`}>
      <textarea
        ref={taRef}
        className={className}
        {...noAutoCapitalize}
        value={value}
        placeholder={placeholder}
        rows={rows}
        aria-label={ariaLabel}
        aria-expanded={menuOpen}
        aria-autocomplete="list"
        role="combobox"
        aria-controls={menuOpen ? "skill-autocomplete-list" : undefined}
        onChange={(event) => {
          const v = event.currentTarget.value;
          onChange(v);
          sync(v, event.currentTarget.selectionStart ?? v.length);
        }}
        onKeyUp={(event) => {
          // Arrow/Home/End/click navigation can move the caret without an
          // onChange — re-evaluate the trigger so the menu tracks the caret.
          if (!menuOpen) return;
          sync(
            event.currentTarget.value,
            event.currentTarget.selectionStart ?? 0,
          );
        }}
        onKeyDown={onKeyDown}
        onBlur={close}
      />
      {menuOpen && (
        <div
          ref={listRef}
          id="skill-autocomplete-list"
          className={styles.menu}
          role="listbox"
          aria-label="Slash commands"
        >
          {matches.map((s, i) => (
            <button
              key={`${s.source}:${s.name}`}
              type="button"
              role="option"
              aria-selected={i === active}
              className={`${styles.option} ${i === active ? styles.optionActive : ""}`}
              title={s.description || s.name}
              // Keep focus on the textarea so onBlur doesn't close before click.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => accept(s)}
            >
              <span className={styles.name}>/{s.name}</span>
              {s.description && (
                <span className={styles.desc}>{s.description}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default SkillAutocomplete;
