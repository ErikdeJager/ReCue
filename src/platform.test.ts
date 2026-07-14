import { describe, expect, it } from "vitest";

import {
  isLinux,
  isWindows,
  joinPath,
  kbdHint,
  revealLabel,
  selfUpdates,
} from "./platform";

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

describe("selfUpdates — the in-app updater gate (#361)", () => {
  it("is true for every self-managed install kind", () => {
    // macOS .app / Windows installer / any dev build.
    expect(selfUpdates("bundle")).toBe(true);
    // A Linux AppImage: Tauri's Linux updater replaces exactly that file.
    expect(selfUpdates("appimage")).toBe(true);
    // Before the boot read resolves — the pre-load default must preserve today's
    // behavior on macOS/Windows/AppImage (it never reads as package-managed).
    expect(selfUpdates("")).toBe(true);
  });

  it("is false only for a distro-packaged system install", () => {
    // pacman / the AUR recue-bin / the .deb: the package manager owns the binary.
    expect(selfUpdates("system")).toBe(false);
  });

  it("treats an unknown kind as self-updating (fail-open)", () => {
    // A future/garbage value must never silently disable the updater everywhere.
    expect(selfUpdates("something-else")).toBe(true);
  });
});
