// Pure value→fill mapping for the custom Slider (#122). Split from the component
// so the .tsx only exports a component (react-refresh) and the logic is unit-testable.

/**
 * The accent-fill percentage (0–100) from the minimum up to `value` (#122),
 * clamped. Drives the slider track's value-based fill.
 */
export function fillPercent(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  const pct = ((value - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, pct));
}
