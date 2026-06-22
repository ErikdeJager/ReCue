import { useEffect, useRef, useState } from "react";
import { GitBranch } from "lucide-react";

import { listSkills } from "../../ipc";
import { repoName } from "../../paths";
import { useStore } from "../../store";
import { toLocalInput } from "../../time";
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
  const [fireAt, setFireAt] = useState(
    schedule ? toLocalInput(new Date(schedule.fire_at * 1000)) : "",
  );
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
    setFireAt(toLocalInput(new Date(schedule.fire_at * 1000)));
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
  // together). An invalid/empty time falls back to the stored fire time.
  const queueSave = (
    nextPrompt: string,
    nextName: string,
    nextFire: string,
  ) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const ms = new Date(nextFire).getTime();
      const at = Number.isFinite(ms) ? Math.floor(ms / 1000) : schedule.fire_at;
      void updateSchedule(
        scheduleId,
        nextPrompt.trim() || null,
        nextName.trim() || null,
        at,
      );
    }, SAVE_DEBOUNCE_MS);
  };

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
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Launch time</span>
        <input
          className={styles.input}
          type="datetime-local"
          value={fireAt}
          onChange={(event) => {
            setFireAt(event.currentTarget.value);
            queueSave(prompt, name, event.currentTarget.value);
          }}
          aria-label="Launch time"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Name</span>
        <input
          className={styles.input}
          type="text"
          value={name}
          placeholder="Custom name…"
          onChange={(event) => {
            setName(event.currentTarget.value);
            queueSave(prompt, event.currentTarget.value, fireAt);
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
            queueSave(next, name, fireAt);
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
