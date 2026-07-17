import type { DockerStatus } from "../../types";

/** What the branch step renders for the dev-container toggle. */
export type ContainerToggleState =
  /** No docker CLI installed (or the probe hasn't answered / isn't available —
   * non-Tauri test runs): the toggle row doesn't render at all. */
  | "hidden"
  /** Docker is installed but the daemon isn't running: the toggle renders
   * disabled, telling the user to start Docker. */
  | "blocked"
  /** Docker is installed and running: the toggle is usable. */
  | "ready";

/** Map the probed docker runtime state (plus the "unknown" pre-probe value) to
 * the toggle's render state. Pure — the modal's render + chord gate both key off
 * it, so "hidden" can never diverge between them. */
export function containerToggleState(
  status: DockerStatus | "unknown",
): ContainerToggleState {
  if (status === "running") return "ready";
  if (status === "stopped") return "blocked";
  return "hidden";
}

/** How often the branch step re-probes while docker reads as stopped, so starting
 * Docker enables the toggle live (no modal reopen). Only polled in that one state. */
export const DOCKER_RECHECK_MS = 3500;

/** Whether to show the inline first-run build indicator beside the Start button
 * (#416): only when the toggle is ON, a one-time image build is in flight, and the
 * toggle isn't blocked (a blocked/stopped docker never reaches a build). Pure so the
 * render site and its unit test can't diverge. */
export function showBuildIndicator(
  useContainer: boolean,
  building: boolean,
  blocked: boolean,
): boolean {
  return useContainer && building && !blocked;
}
