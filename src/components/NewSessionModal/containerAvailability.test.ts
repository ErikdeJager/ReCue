import { describe, expect, it } from "vitest";

import {
  containerToggleState,
  DOCKER_RECHECK_MS,
} from "./containerAvailability";

describe("containerToggleState (dev-container toggle gating)", () => {
  it("hides the toggle when docker isn't installed — or before the probe answers", () => {
    // No flash for docker-less installs: unknown renders exactly like absent.
    expect(containerToggleState("absent")).toBe("hidden");
    expect(containerToggleState("unknown")).toBe("hidden");
  });

  it("blocks (disabled + start-Docker hint) when installed but not running", () => {
    expect(containerToggleState("stopped")).toBe("blocked");
  });

  it("is ready only when the daemon answered", () => {
    expect(containerToggleState("running")).toBe("ready");
  });

  it("re-probes on a humane interval while blocked", () => {
    // Slow enough not to hammer the CLI, fast enough that starting Docker
    // enables the toggle without reopening the modal.
    expect(DOCKER_RECHECK_MS).toBeGreaterThanOrEqual(2000);
    expect(DOCKER_RECHECK_MS).toBeLessThanOrEqual(10000);
  });
});
