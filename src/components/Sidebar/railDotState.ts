/**
 * Human-readable state for a collapsed-rail agent dot's tooltip (UI v2 §6,
 * task 374). Mirrors the BusyIndicator's three states (#112): busy → "running",
 * idle after having worked → "awaiting input", fresh (never active) → "idle".
 */
export const railDotState = (
  busy: boolean,
  hasBeenActive: boolean,
): "running" | "awaiting input" | "idle" =>
  busy ? "running" : hasBeenActive ? "awaiting input" : "idle";
