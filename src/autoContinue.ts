// Auto-continue after limit reset (#296) — pure UI-side helpers.
//
// The engine lives in Rust (`src-tauri/src/autocontinue.rs`, task 430): one usage
// poll + arm/wait/fire reducer + nudge executor per app, so the multi-window
// epic's N windows can never double-nudge. This file keeps only the pure UI-side
// pieces — the #305/#309 limit predicate (`isLimitReached`) shared by the
// per-agent checkbox and the "Enable auto restart on limit reset" prompt, plus the
// mirrored machine-state type (`AutoContinueState`, fed by the Rust engine's
// `autocontinue://changed` events into the store's read-only mirror).

/** Usage percentage at which the five-hour window is considered exhausted. The live
 * OAuth endpoint can report a hair under 100 at the cap, so the limit check uses a
 * small tolerance below this (`ARM_THRESHOLD_PCT`). */
export const LIMIT_REACHED_PCT = 100;

/** Tolerance below {@link LIMIT_REACHED_PCT} that still counts as "limit reached". */
export const LIMIT_REACHED_TOLERANCE = 0.5;

/** Effective limit-reached threshold — `usedPercent >= 99.5` reads as the limit
 * reached. Mirrors the Rust engine's `ARM_THRESHOLD_PCT` (its arm branch uses the
 * same value), so the UI's "limit reached" and the engine's arming always agree. */
export const ARM_THRESHOLD_PCT = LIMIT_REACHED_PCT - LIMIT_REACHED_TOLERANCE;

/** Transient runtime state of the auto-continue machine — NOT persisted (only the
 * boolean setting is). `armed` means the limit has been detected and the Rust
 * engine is waiting for the reset; `sessionIds` is the set of live Claude sessions
 * captured at that moment, to be nudged once the window resets. A read-only mirror
 * of the engine's state since task 430. */
export interface AutoContinueState {
  armed: boolean;
  /** Epoch ms the usage window resets, captured at arm time; `null` when the API
   * omitted it (the engine falls back to the percentage-drop signal alone). */
  resetsAtMs: number | null;
  /** Live Claude session ids captured when the limit was detected. */
  sessionIds: string[];
}

/** The disarmed resting state — a shared constant so an unchanged mirror keeps
 * the same reference (no needless store write / re-render). */
export const IDLE_AUTO_CONTINUE: AutoContinueState = {
  armed: false,
  resetsAtMs: null,
  sessionIds: [],
};

/**
 * Pure predicate: does this usage snapshot read as the five-hour limit reached?
 * True exactly when usage data is available, `usedPercent` is known, and it has
 * hit the {@link ARM_THRESHOLD_PCT} threshold (`>= 99.5`). Fail-safe: returns
 * false whenever usage is unavailable/unknown. Shared so the per-agent
 * auto-continue checkbox (#305) and the "Enable auto restart on limit reset"
 * prompt button (#309) agree on one definition — the same value the Rust engine's
 * arm branch uses. Takes a narrow structural type (`usedPercent` + `available`),
 * so both the full store `usage` slice and a `{ usedPercent, available }` literal
 * satisfy it. Pure + platform-neutral.
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
