import { useEffect, useRef, useState } from "react";
import { GitBranch } from "lucide-react";

import { noAutoCapitalize } from "../../inputProps";
import { listSkills } from "../../ipc";
import { repoName } from "../../paths";
import { useStore } from "../../store";
import {
  formatFireTime,
  parseWhen,
  SCHEDULE_TIME_HINT,
  toLocalInput,
} from "../../time";
import type { SkillInfo } from "../../types";
import SkillAutocomplete from "../SkillAutocomplete/SkillAutocomplete";
import styles from "./ScheduledPanel.module.css";

// Debounce for the auto-saving fields (#94): long enough to coalesce typing,
// short enough that an edit persists well before the schedule could fire.
const SAVE_DEBOUNCE_MS = 600;

/**
 * The pending scheduled-session panel (#94): the shared body for the Overview
 * scheduled card and the Canvas scheduled panel. Shows the target branch + repo
 * and an **editable** launch time, name, and **big prompt** — all **auto-saving**
 * (debounced) to the record via #93's `update_schedule` command — plus a Cancel
 * control. Once the schedule fires (engine, #93), the record is gone and this
 * shows a "no longer pending" note (it becomes a normal live agent elsewhere).
 */
function ScheduledPanel({ scheduleId }: { scheduleId: string }) {
  const schedule = useStore((s) =>
    s.schedules.find((x) => x.id === scheduleId),
  );
  const updateSchedule = useStore((s) => s.updateSchedule);
  const cancelSchedule = useStore((s) => s.cancelSchedule);

  // Local editing buffers, seeded from the record (and re-seeded when the id
  // changes or the record first loads — not on our own save echoes).
  const [prompt, setPrompt] = useState(schedule?.prompt ?? "");
  const [name, setName] = useState(schedule?.name ?? "");
  // The launch time is a free-text natural-language field (#268). `fireText` is what
  // the user sees/edits; `fireSecs` is the last VALID resolved unix time, seeded from
  // the record. Decoupling them means editing the name/prompt re-saves the existing
  // time (not a re-parse of the seeded text), so the time never drifts; only editing
  // the time field itself moves `fireSecs`. The seed is the machine `toLocalInput`
  // value, which `parseWhen` round-trips exactly.
  const [fireText, setFireText] = useState(
    schedule ? toLocalInput(new Date(schedule.fire_at * 1000)) : "",
  );
  const [fireSecs, setFireSecs] = useState(schedule?.fire_at ?? 0);
  // Slash-command skills for this schedule's folder (#114) — the prompt
  // autocomplete; best-effort, so a failure just leaves the list empty.
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cwd = schedule?.cwd;
  useEffect(() => {
    if (!cwd) return;
    let cancelled = false;
    void listSkills(cwd)
      .then((s) => {
        if (!cancelled) setSkills(s);
      })
      .catch(() => {
        if (!cancelled) setSkills([]);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  useEffect(() => {
    if (!schedule) return;
    setPrompt(schedule.prompt ?? "");
    setName(schedule.name ?? "");
    setFireText(toLocalInput(new Date(schedule.fire_at * 1000)));
    setFireSecs(schedule.fire_at);
    // Seed once per schedule (id appears / changes); not on field echoes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleId, schedule?.id]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  if (!schedule) {
    return (
      <div className={styles.gone}>This schedule is no longer pending.</div>
    );
  }

  // Debounced persist of all three mutable fields (#93 update command takes them
  // together). The launch time is passed already resolved (unix secs) by the
  // callers, so name/prompt edits keep the last valid time as-is (#268).
  const queueSave = (nextPrompt: string, nextName: string, secs: number) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void updateSchedule(
        scheduleId,
        nextPrompt.trim() || null,
        nextName.trim() || null,
        secs,
      );
    }, SAVE_DEBOUNCE_MS);
  };

  // The launch-time field changed (#268): show the new text immediately; only when
  // it parses do we move the resolved time + persist. An unreadable value keeps the
  // last valid `fireSecs` (and the preview shows a gentle "couldn't read" note).
  const onFireTextChange = (value: string) => {
    setFireText(value);
    const when = parseWhen(value, new Date());
    if (when) {
      const secs = Math.floor(when.at.getTime() / 1000);
      setFireSecs(secs);
      queueSave(prompt, name, secs);
    }
  };

  // Live interpretation of the current launch-time text, for the preview line.
  const fireWhen = parseWhen(fireText, new Date());

  const branch = schedule.branch ?? "";
  return (
    <div className={styles.panel}>
      <div className={styles.meta}>
        <GitBranch
          size={13}
          strokeWidth={1.5}
          className={styles.metaIcon}
          aria-hidden
        />
        <span className={styles.metaText}>
          {repoName(schedule.cwd)}
          {branch
            ? schedule.create_branch
              ? ` · will create ${branch}`
              : ` · will check out ${branch}`
            : ""}
        </span>
        {/* Read-only worktree intent (#198): the agent launches into an isolated
            worktree, created on this branch at fire time. */}
        {schedule.worktree && (
          <span className={styles.worktreeBadge}>worktree</span>
        )}
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Launch time</span>
        <input
          className={styles.input}
          {...noAutoCapitalize}
          type="text"
          value={fireText}
          placeholder="e.g. 1h, 15:00, 6pm, tomorrow 9am"
          onChange={(event) => onFireTextChange(event.currentTarget.value)}
          aria-label="Launch time"
        />
        <span className={styles.timeHint}>{SCHEDULE_TIME_HINT}</span>
        {fireText.trim() !== "" &&
          (fireWhen ? (
            <span className={styles.timePreview} aria-live="polite">
              Starts {formatFireTime(Math.floor(fireWhen.at.getTime() / 1000))}{" "}
              · {fireWhen.label}
            </span>
          ) : (
            <span className={styles.timeError} aria-live="polite">
              Couldn’t read that time.
            </span>
          ))}
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Name</span>
        <input
          className={styles.input}
          {...noAutoCapitalize}
          type="text"
          value={name}
          placeholder="Custom name…"
          onChange={(event) => {
            setName(event.currentTarget.value);
            queueSave(prompt, event.currentTarget.value, fireSecs);
          }}
          aria-label="Custom name"
        />
      </label>

      <label className={`${styles.field} ${styles.promptField}`}>
        <span className={styles.label}>Prompt</span>
        <SkillAutocomplete
          className={styles.prompt}
          value={prompt}
          onChange={(next) => {
            setPrompt(next);
            queueSave(next, name, fireSecs);
          }}
          skills={skills}
          placeholder="Initial prompt for claude (optional)…"
          ariaLabel="Initial prompt"
          fill
        />
      </label>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.cancel}
          onClick={() => void cancelSchedule(scheduleId)}
        >
          Cancel schedule
        </button>
      </div>
    </div>
  );
}

export default ScheduledPanel;
