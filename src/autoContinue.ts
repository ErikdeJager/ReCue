// Auto-continue Claude agents after the usage limit resets (#296).
//
// Pure decision logic for the opt-in "Auto continue after limit reset" behavior:
// when the five-hour usage window is exhausted, ReCue captures the running Claude
// sessions + the known reset time, waits for the window to reset (watching BOTH the
// reset time AND the usage percentage dropping), then nudges each captured agent so
// it resumes its work. Kept side-effect-free here (no IPC, no timers) so it's fully
// unit-testable; the store wires it into the usage poll and performs the actual
// keystroke injection. Frontend-only + platform-neutral (`writeStdin` bytes are the
// same on macOS and Windows).

/** Usage percentage at which the five-hour window is considered exhausted. The live
 * OAuth endpoint can report a hair under 100 at the cap, so arming uses a small
 * tolerance below this (`ARM_THRESHOLD_PCT`). */
export const LIMIT_REACHED_PCT = 100;

/** Tolerance below {@link LIMIT_REACHED_PCT} that still counts as "limit reached". */
export const LIMIT_REACHED_TOLERANCE = 0.5;

/** Effective arming threshold — `usedPercent >= 99.5` reads as the limit reached. */
export const ARM_THRESHOLD_PCT = LIMIT_REACHED_PCT - LIMIT_REACHED_TOLERANCE;

/** Usage percentage the snapshot must drop below to confirm the window has reset.
 * A fresh window reports well under this; combined with the known reset time it
 * guards against firing mid-window on a noisy reading. */
export const RESET_CONFIRM_PCT = 90;

/** Tighter usage-poll cadence while armed and waiting for the reset (ms), so the
 * continue fires promptly after the window turns over. Bounded — never faster. */
export const ARMED_POLL_MS = 45_000;

/** Transient runtime state of the auto-continue machine — NOT persisted (only the
 * boolean setting is). `armed` means the limit has been detected and we're waiting
 * for the reset; `sessionIds` is the set of live Claude sessions captured at that
 * moment, to be nudged once the window resets. */
export interface AutoContinueState {
  armed: boolean;
  /** Epoch ms the usage window resets, captured at arm time; `null` when the API
   * omitted it (fall back to the percentage-drop signal alone). */
  resetsAtMs: number | null;
  /** Live Claude session ids captured when the limit was detected. */
  sessionIds: string[];
}

/** The disarmed resting state — a shared constant so an unchanged evaluation returns
 * the same reference (no needless store write / re-render). */
export const IDLE_AUTO_CONTINUE: AutoContinueState = {
  armed: false,
  resetsAtMs: null,
  sessionIds: [],
};

/** The usage snapshot the reducer reads — mirrors the store's `usage` slice. */
export interface AutoContinueUsage {
  usedPercent: number | null;
  resetsAtMs: number | null;
  available: boolean;
}

/** The settings the reducer gates on. */
export interface AutoContinueConfig {
  /** The `autoContinueAfterLimit` setting. */
  enabled: boolean;
  /** The `defaultAgent` setting — the feature is Claude-only. */
  defaultAgent: string;
}

export interface AutoContinueResult {
  /** The next machine state. */
  next: AutoContinueState;
  /** Session ids to send the continue sequence to *now* (empty unless a reset just
   * fired). */
  fireIds: string[];
}

/**
 * Pure predicate: does this usage snapshot read as the five-hour limit reached?
 * True exactly when usage data is available, `usedPercent` is known, and it has
 * hit the {@link ARM_THRESHOLD_PCT} arming threshold (`>= 99.5`). Fail-safe: returns
 * false whenever usage is unavailable/unknown. Shared so the reducer's arm branch,
 * the per-agent auto-continue checkbox (#305), and the "Enable auto restart on limit
 * reset" prompt button (#309) all agree on one definition rather than open-coding the
 * threshold. Takes a narrow structural type (`usedPercent` + `available`), so both the
 * full store `usage` slice and a `{ usedPercent, available }` literal satisfy it.
 * Frontend-only + pure.
 */
export function isLimitReached(usage: {
  usedPercent: number | null;
  available: boolean;
}): boolean {
  return (
    usage.available &&
    usage.usedPercent != null &&
    usage.usedPercent >= ARM_THRESHOLD_PCT
  );
}

/**
 * Pure reducer for the auto-continue machine.
 *
 * - Inert (disarm, no fire) when the feature is off, the default agent isn't Claude,
 *   or usage data is unavailable — fail-open so a missing snapshot never nudges.
 * - **Arm** when not yet armed and the snapshot reports the limit reached
 *   (`usedPercent >= ARM_THRESHOLD_PCT`) and there is at least one live Claude session
 *   to nudge — capturing the reset time + the current live-Claude id set.
 * - **Fire** when armed and the window has reset: the known reset time has passed
 *   (or none is known) AND `usedPercent` has dropped below {@link RESET_CONFIRM_PCT}.
 *   The fired set is the captured ids still live now; then disarm.
 * - Otherwise stay put (same-reference return).
 */
export function evaluateAutoContinue(
  prev: AutoContinueState,
  usage: AutoContinueUsage,
  now: number,
  config: AutoContinueConfig,
  liveClaudeIds: string[],
): AutoContinueResult {
  // Inert: off / non-Claude / no usage data → disarm and never fire.
  if (
    !config.enabled ||
    config.defaultAgent !== "claude" ||
    !usage.available ||
    usage.usedPercent == null
  ) {
    return { next: prev.armed ? IDLE_AUTO_CONTINUE : prev, fireIds: [] };
  }

  const used = usage.usedPercent;

  if (!prev.armed) {
    // Arm when the limit is reached and there are live Claude sessions to nudge.
    // The early-return above already guaranteed `available` + `usedPercent != null`,
    // so `isLimitReached` here is equivalent to the old inline `used >= ARM_THRESHOLD_PCT`.
    if (isLimitReached(usage) && liveClaudeIds.length > 0) {
      return {
        next: {
          armed: true,
          resetsAtMs: usage.resetsAtMs,
          sessionIds: [...liveClaudeIds],
        },
        fireIds: [],
      };
    }
    return { next: prev, fireIds: [] };
  }

  // Armed: fire once the window has reset — the known time has passed (or none was
  // captured) AND usage has dropped below the confirm threshold.
  const timeReset = prev.resetsAtMs == null || now >= prev.resetsAtMs;
  if (timeReset && used < RESET_CONFIRM_PCT) {
    const live = new Set(liveClaudeIds);
    const fireIds = prev.sessionIds.filter((id) => live.has(id));
    return { next: IDLE_AUTO_CONTINUE, fireIds };
  }

  // Still armed, still waiting.
  return { next: prev, fireIds: [] };
}
