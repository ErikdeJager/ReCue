import { describe, expect, it } from "vitest";

import { railDotState } from "./railDotState";

describe("railDotState (UI v2 §6, task 374)", () => {
  it("reads 'running' while the session is busy", () => {
    expect(railDotState(true, false)).toBe("running");
    // Busy wins regardless of the has-been-active flag.
    expect(railDotState(true, true)).toBe("running");
  });

  it("reads 'awaiting input' once it has worked and gone idle (#112)", () => {
    expect(railDotState(false, true)).toBe("awaiting input");
  });

  it("reads 'idle' for a fresh session that never worked", () => {
    expect(railDotState(false, false)).toBe("idle");
  });
});
