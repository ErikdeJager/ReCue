import { describe, expect, it } from "vitest";

import { isLinux, isWindows, joinPath, kbdHint, revealLabel } from "./platform";

describe("platform display helpers (#143/#345)", () => {
  it("detects Windows only", () => {
    expect(isWindows("windows")).toBe(true);
    expect(isWindows("macos")).toBe(false);
    expect(isWindows("linux")).toBe(false);
    // "" (before the boot read resolves) is treated as non-Windows → macOS labels.
    expect(isWindows("")).toBe(false);
  });

  it("detects Linux only (#345)", () => {
    expect(isLinux("linux")).toBe(true);
    expect(isLinux("macos")).toBe(false);
    expect(isLinux("windows")).toBe(false);
    expect(isLinux("")).toBe(false);
  });

  it("revealLabel switches Finder ↔ Explorer ↔ File Manager", () => {
    expect(revealLabel("windows")).toBe("Reveal in Explorer");
    expect(revealLabel("macos")).toBe("Reveal in Finder");
    expect(revealLabel("linux")).toBe("Reveal in File Manager");
    expect(revealLabel("")).toBe("Reveal in Finder");
  });

  it("kbdHint picks the platform's string (Ctrl on Windows+Linux, macOS default before load)", () => {
    expect(kbdHint("windows", "⌘N", "Ctrl+N")).toBe("Ctrl+N");
    expect(kbdHint("linux", "⌘N", "Ctrl+N")).toBe("Ctrl+N");
    expect(kbdHint("macos", "⌘N", "Ctrl+N")).toBe("⌘N");
    expect(kbdHint("", "⌘N", "Ctrl+N")).toBe("⌘N");
  });

  it("joinPath builds OS-native absolute paths from a /-relative file", () => {
    // macOS: forward slashes, identical to the prior `${root}/${file}` behavior.
    expect(joinPath("macos", "/Users/me/repo", "src/a.ts")).toBe(
      "/Users/me/repo/src/a.ts",
    );
    // Windows: the whole path normalizes to backslashes (explorer /select needs it).
    expect(joinPath("windows", "C:\\Users\\me\\repo", "src/a.ts")).toBe(
      "C:\\Users\\me\\repo\\src\\a.ts",
    );
    // A trailing separator on the root never doubles up.
    expect(joinPath("macos", "/Users/me/repo/", "a.md")).toBe(
      "/Users/me/repo/a.md",
    );
    expect(joinPath("windows", "C:\\repo\\", "a.md")).toBe("C:\\repo\\a.md");
  });
});
