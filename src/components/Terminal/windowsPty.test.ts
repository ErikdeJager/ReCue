import { describe, expect, it } from "vitest";

import { windowsPtyOption } from "./windowsPty";

describe("windowsPtyOption", () => {
  it("is set (conpty + build number) only on Windows", () => {
    expect(windowsPtyOption("windows", 22631)).toEqual({
      backend: "conpty",
      buildNumber: 22631,
    });
    expect(windowsPtyOption("windows", 0)).toEqual({
      backend: "conpty",
      buildNumber: 0,
    });
  });

  it("is absent on macOS / other platforms (constructor unchanged there)", () => {
    expect(windowsPtyOption("macos", 22631)).toBeUndefined();
    expect(windowsPtyOption("linux", 22631)).toBeUndefined();
    expect(windowsPtyOption("", 0)).toBeUndefined();
  });
});
