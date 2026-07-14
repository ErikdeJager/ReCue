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

// --- The --ui regression guard (#363) -------------------------------------------------
// The acceptance criterion "macOS and Windows render byte-for-byte identically" enforced
// mechanically: the shared :root --ui stack must never be edited, the Linux override must
// exist and lead with the BUNDLED family, and that family must actually be bundled.
// Vitest runs in node, so the CSS is read off disk rather than through the DOM.

/** The UI stack as it has always been — the macOS (-apple-system → San Francisco) and
 * Windows (system-ui → Segoe UI) resolution. Must never change. */
const ORIGINAL_UI =
  '-apple-system, "SF Pro Text", ui-sans-serif, system-ui, sans-serif';

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const norm = (v: string) => v.replace(/\s+/g, " ").trim();

const tokensCss = stripComments(
  readFileSync(new URL("./styles/tokens.css", import.meta.url), "utf8"),
);
const fontsCss = stripComments(
  readFileSync(new URL("./styles/fonts.css", import.meta.url), "utf8"),
);

/** The families of a `--ui:` declaration, in order. */
function uiFamilies(value: string): string[] {
  return norm(value)
    .split(",")
    .map((f) => f.trim());
}

describe("UI font tokens (#363)", () => {
  it("leaves the shared :root --ui stack exactly as it was (macOS + Windows unchanged)", () => {
    // The first --ui declaration in the file is the :root one (Prettier may wrap the
    // value across lines, so whitespace is normalized before comparing).
    const match = /--ui:\s*([^;]+);/.exec(tokensCss);
    expect(match).not.toBeNull();
    expect(norm(match![1])).toBe(ORIGINAL_UI);
  });

  it("declares a Linux-only --ui override that leads with the bundled Inter", () => {
    const block = /:root\[data-platform="linux"\]\s*\{([^}]*)\}/.exec(
      tokensCss,
    );
    expect(block).not.toBeNull();

    const decl = /--ui:\s*([^;]+);/.exec(block![1]);
    expect(decl).not.toBeNull();

    const families = uiFamilies(decl![1]);
    // The bundled face is first, so Linux is deterministic on every distro …
    expect(families[0]).toBe('"Inter Variable"');
    // … and the tail still ends in a generic, so non-latin codepoints (outside the
    // bundled subset's unicode-range) fall through to a system face — no tofu.
    expect(families[families.length - 1]).toBe("sans-serif");
    expect(norm(decl![1])).not.toBe(ORIGINAL_UI);
  });

  it("bundles the family the Linux override names — offline, never a CDN", () => {
    expect(fontsCss).toMatch(/font-family:\s*"Inter Variable"/);
    expect(fontsCss).toMatch(/inter-latin-wght-normal\.woff2/);
    // Only the latin subset ships (one 48,256 B file instead of all seven subsets).
    expect(fontsCss.match(/@font-face/g)).toHaveLength(1);
    expect(fontsCss).toMatch(/unicode-range:/);
    // The src resolves inside the bundle (a bare package specifier Vite emits as an
    // asset) — never an http(s) URL.
    expect(fontsCss).not.toMatch(/url\(\s*["']?https?:/);
  });
});
