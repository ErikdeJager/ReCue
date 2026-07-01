// Pure helper for xterm.js's `windowsPty` terminal option, split out from
// `terminalPool.ts` so it's unit-testable in the Node test env without importing
// xterm.js / its CSS side effects.

import { isWindows } from "../../platform";

/**
 * The xterm.js `windowsPty` option for the current platform — set only on **Windows**,
 * where terminals are hosted on a ConPTY pseudo-console (`launch_target` always routes
 * through the OS ConPTY). Telling xterm the backend + real build number enables its
 * ConPTY-correct scrollback/reflow handling (reflow at `buildNumber >= 21376`). On
 * macOS this returns `undefined`, so the option is **absent** and the terminal is
 * constructed exactly as before — no behavior change.
 */
export function windowsPtyOption(
  platform: string,
  buildNumber: number,
): { backend: "conpty"; buildNumber: number } | undefined {
  return isWindows(platform) ? { backend: "conpty", buildNumber } : undefined;
}
