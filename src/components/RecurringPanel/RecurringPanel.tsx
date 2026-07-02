import { useEffect, useRef, useState } from "react";
import {
  GitBranch,
  Pencil,
  RefreshCw,
  Terminal as TerminalIcon,
} from "lucide-react";

import { noAutoCapitalize } from "../../inputProps";
import { listSkills } from "../../ipc";
import { useSessionOwners } from "../../ownership";
import { repoName } from "../../paths";
import { useStore } from "../../store";
import {
  formatInterval,
  formatNextRun,
  type IntervalUnit,
  intervalToSeconds,
  parseWhen,
  SCHEDULE_TIME_HINT,
  secondsToInterval,
  toLocalInput,
} from "../../time";
import type { SkillInfo } from "../../types";
import { ownedHere } from "../../windowContext";
import DetachedNote from "../DetachedNote/DetachedNote";
import SkillAutocomplete from "../SkillAutocomplete/SkillAutocomplete";
import Terminal from "../Terminal/Terminal";
import styles from "./RecurringPanel.module.css";

// Debounce for the auto-saving editor fields (#294): long enough to coalesce typing,
// short enough that an edit persists well before the next fire could rotate the child.
const SAVE_DEBOUNCE_MS = 600;

// Refresh the "next run in …" countdown on a gentle tick so it stays live without
// depending on unrelated store churn.
const TICK_MS = 30_000;

/**
 * The recurring-session panel (#294): the shared body for the Overview recurring card
 * and the Canvas recurring panel. Keys on the recurring `id`, so a fire only swaps the
 * hosted child terminal — no new surface is created. When a child is running it renders
 * that child's pooled terminal; otherwise a "next run in …" placeholder. A small header
 * bar shows the repo/interval/countdown and toggles an **auto-saving** editor (interval
 * amount+unit / next-run time / name / prompt). Cancelling is done from the surrounding
 * sidebar row / Overview card × (#306).
 */
function RecurringPanel({ recurringId }: { recurringId: string }) {
  const recurring = useStore((s) =>
    s.recurrings.find((x) => x.id === recurringId),
  );
  const sessions = useStore((s) => s.sessions);
  const updateRecurring = useStore((s) => s.updateRecurring);
  const owners = useSessionOwners();

  const [editing, setEditing] = useState(false);
  // Local editing buffers, seeded from the record (re-seeded when the id changes /
  // the record first loads — not on our own save echoes).
  const seedInterval = secondsToInterval(recurring?.interval_secs ?? 3600);
  const [amount, setAmount] = useState(String(seedInterval.amount));
  const [unit, setUnit] = useState<IntervalUnit>(seedInterval.unit);
  const [name, setName] = useState(recurring?.name ?? "");
  const [prompt, setPrompt] = useState(recurring?.prompt ?? "");
  // Free-text next-run time (like the schedule step); `nextText` is what the user
  // edits, `nextSecs` the last VALID resolved unix time (seeded from the record).
  const [nextText, setNextText] = useState(
    recurring ? toLocalInput(new Date(recurring.next_fire_at * 1000)) : "",
  );
  const [nextSecs, setNextSecs] = useState(recurring?.next_fire_at ?? 0);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [, setTick] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cwd = recurring?.cwd;
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

  // Re-seed the editor buffers once per recurring (id appears / changes); not on
  // field echoes (which would clobber the user's in-progress edit).
  useEffect(() => {
    if (!recurring) return;
    const seed = secondsToInterval(recurring.interval_secs);
    setAmount(String(seed.amount));
    setUnit(seed.unit);
    setName(recurring.name ?? "");
    setPrompt(recurring.prompt ?? "");
    setNextText(toLocalInput(new Date(recurring.next_fire_at * 1000)));
    setNextSecs(recurring.next_fire_at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurringId, recurring?.id]);

  // Live countdown ticker.
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  if (!recurring) {
    return (
      <div className={styles.gone}>
        This recurring session no longer exists.
      </div>
    );
  }

  // Debounced persist of all mutable fields (the update command takes them together).
  const queueSave = (
    nextPrompt: string,
    nextName: string,
    intervalSecs: number,
    secs: number,
  ) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void updateRecurring(
        recurringId,
        nextPrompt.trim() || null,
        nextName.trim() || null,
        intervalSecs,
        secs,
      );
    }, SAVE_DEBOUNCE_MS);
  };

  const currentInterval = () => intervalToSeconds(Number(amount), unit);

  const onAmountChange = (value: string) => {
    setAmount(value);
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 1) {
      queueSave(prompt, name, intervalToSeconds(parsed, unit), nextSecs);
    }
  };

  const onUnitChange = (value: IntervalUnit) => {
    setUnit(value);
    queueSave(prompt, name, intervalToSeconds(Number(amount), value), nextSecs);
  };

  const onNextTextChange = (value: string) => {
    setNextText(value);
    const when = parseWhen(value, new Date());
    if (when) {
      const secs = Math.floor(when.at.getTime() / 1000);
      setNextSecs(secs);
      queueSave(prompt, name, currentInterval(), secs);
    }
  };

  const childId = recurring.current_session_id ?? null;
  const child = childId ? sessions.find((s) => s.id === childId) : undefined;
  const branch = recurring.branch ?? "";

  // The body: the editor (when open), else the live child terminal, else a placeholder.
  let body: React.ReactNode;
  if (editing) {
    body = (
      <div className={styles.form}>
        <label className={styles.field}>
          <span className={styles.label}>Repeat every</span>
          <div className={styles.intervalRow}>
            <input
              className={styles.amount}
              {...noAutoCapitalize}
              type="number"
              min={1}
              value={amount}
              onChange={(e) => onAmountChange(e.currentTarget.value)}
              aria-label="Repeat amount"
            />
            <select
              className={styles.unit}
              value={unit}
              onChange={(e) =>
                onUnitChange(e.currentTarget.value as IntervalUnit)
              }
              aria-label="Repeat unit"
            >
              <option value="minute">Minutes</option>
              <option value="hour">Hours</option>
              <option value="day">Days</option>
            </select>
          </div>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Next run</span>
          <input
            className={styles.input}
            {...noAutoCapitalize}
            type="text"
            value={nextText}
            placeholder="e.g. now, 1h, 15:00, tomorrow 9am"
            onChange={(e) => onNextTextChange(e.currentTarget.value)}
            aria-label="Next run time"
          />
          <span className={styles.timeHint}>{SCHEDULE_TIME_HINT}</span>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Name</span>
          <input
            className={styles.input}
            {...noAutoCapitalize}
            type="text"
            value={name}
            placeholder="Custom name…"
            onChange={(e) => {
              setName(e.currentTarget.value);
              queueSave(
                prompt,
                e.currentTarget.value,
                currentInterval(),
                nextSecs,
              );
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
              queueSave(next, name, currentInterval(), nextSecs);
            }}
            skills={skills}
            placeholder="Prompt sent to each fresh agent (optional)…"
            ariaLabel="Recurring prompt"
            fill
          />
        </label>
      </div>
    );
  } else if (child && childId) {
    // One PTY renders in one window (#84): defer to the owning window otherwise.
    body = ownedHere(owners, childId) ? (
      <Terminal sessionId={childId} />
    ) : (
      <DetachedNote ownerLabel={owners[childId]} />
    );
  } else {
    body = (
      <div className={styles.placeholder}>
        <RefreshCw size={20} strokeWidth={1.5} aria-hidden />
        <span className={styles.placeholderText}>
          {formatNextRun(recurring.next_fire_at)}
        </span>
        <span className={styles.placeholderSub}>
          A fresh agent spawns {formatInterval(recurring.interval_secs)}.
        </span>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.meta}>
        {child ? (
          <TerminalIcon
            size={13}
            strokeWidth={1.5}
            className={styles.metaIcon}
            aria-hidden
          />
        ) : (
          <GitBranch
            size={13}
            strokeWidth={1.5}
            className={styles.metaIcon}
            aria-hidden
          />
        )}
        <span className={styles.metaText}>
          {repoName(recurring.cwd)}
          {branch ? ` · ${branch}` : ""} ·{" "}
          {formatInterval(recurring.interval_secs)}
        </span>
        {recurring.worktree && (
          <span className={styles.worktreeBadge}>worktree</span>
        )}
        <span className={styles.spacer} />
        <span className={styles.nextRun}>
          {formatNextRun(recurring.next_fire_at)}
        </span>
        <button
          type="button"
          className={`${styles.iconBtn} ${editing ? styles.iconBtnActive : ""}`}
          onClick={() => setEditing((e) => !e)}
          title={editing ? "Done editing" : "Edit recurring session"}
          aria-label={editing ? "Done editing" : "Edit recurring session"}
          aria-pressed={editing}
        >
          <Pencil size={13} strokeWidth={1.5} />
        </button>
      </div>
      <div className={styles.body}>{body}</div>
    </div>
  );
}

export default RecurringPanel;
