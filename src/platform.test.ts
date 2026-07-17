import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  applyPlatformAttribute,
  detectPlatform,
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

// The real user-agent strings the three shipped WebViews report (#363): WKWebView
// (macOS), WebView2/Chromium (Windows), WebKitGTK via wry (Linux).
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const WIN_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
const LINUX_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

describe("detectPlatform — synchronous OS family from the WebView (#363)", () => {
  it("detects macOS (WKWebView)", () => {
    expect(detectPlatform(MAC_UA, "MacIntel")).toBe("macos");
  });

  it("detects Windows (WebView2)", () => {
    expect(detectPlatform(WIN_UA, "Win32")).toBe("windows");
  });

  it("detects Linux (WebKitGTK / wry)", () => {
    expect(detectPlatform(LINUX_UA, "Linux x86_64")).toBe("linux");
  });

  it('returns "" when the platform is unknown — the unchanged macOS/default stack', () => {
    expect(detectPlatform("", "")).toBe("");
  });

  it("never mistakes macOS/Windows for Linux (order matters)", () => {
    // A Chromium UA on Windows carries "X11"/"Linux"-free strings, but a Windows box
    // could still report an odd navigator.platform — Windows and macOS are checked first.
    expect(detectPlatform(WIN_UA, "Linux")).toBe("windows");
    expect(detectPlatform(MAC_UA, "Linux")).toBe("macos");
  });

  it("composes with the existing display helpers", () => {
    expect(isLinux(detectPlatform(LINUX_UA, ""))).toBe(true);
    expect(isWindows(detectPlatform(WIN_UA, ""))).toBe(true);
    expect(isLinux(detectPlatform(MAC_UA, "MacIntel"))).toBe(false);
  });

  it("applyPlatformAttribute is a no-op without a DOM (these tests run in node)", () => {
    expect(() => applyPlatformAttribute("linux")).not.toThrow();
    expect(() => applyPlatformAttribute("")).not.toThrow();
  });
});

// --- The --ui regression guard (UI v2 task 372) ----------------------------------------
// One typeface on every OS (DESIGN-SPEC.md §2.3): the bundled JetBrains Mono is the UI
// face everywhere, identical to --mono. This supersedes the #363 Linux-only Inter seam —
// src/styles/fonts.css is deleted and tokens.css carries no data-platform selector (the
// data-platform attribute machinery in platform.ts stays as the platform-CSS seam; it
// just has no --ui consumer anymore). Vitest runs in node, so the CSS is read off disk.

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const norm = (v: string) => v.replace(/\s+/g, " ").trim();

const tokensCss = stripComments(
  readFileSync(new URL("./styles/tokens.css", import.meta.url), "utf8"),
);

/** The families of a `--ui:` declaration, in order. */
function uiFamilies(value: string): string[] {
  return norm(value)
    .split(",")
    .map((f) => f.trim());
}

describe("v2 UI font (task 372)", () => {
  it("declares exactly one --ui stack — no per-platform override anywhere", () => {
    const decls = tokensCss.match(/--ui:\s*[^;]+;/g);
    expect(decls).toHaveLength(1);
  });

  it("leads with the bundled JetBrains Mono and ends in a generic monospace", () => {
    const match = /--ui:\s*([^;]+);/.exec(tokensCss);
    expect(match).not.toBeNull();
    const families = uiFamilies(match![1]);
    // The bundled face is first, so every OS is deterministic (offline, never a CDN) …
    expect(families[0]).toBe('"JetBrains Mono"');
    // … and the tail ends in a generic, so codepoints outside the bundled subsets
    // fall through to a system mono face — no tofu.
    expect(families[families.length - 1]).toBe("monospace");
  });

  it("carries no data-platform selector — the #363 Linux --ui override is retired", () => {
    expect(tokensCss).not.toContain("data-platform");
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
