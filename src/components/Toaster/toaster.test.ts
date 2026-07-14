import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// UI v2 toast contract guard (task 376, spec §10) — the platform.test.ts idiom:
// vitest runs in node, so the component's CSS module and TSX are read off disk
// and asserted as text. Guards the bottom-center anchor, the v2 floating-chrome
// tokens (Task 372), the 180ms rise, and the tone→Lucide-icon mapping.

const css = readFileSync(
  new URL("./Toaster.module.css", import.meta.url),
  "utf8",
);
const tsx = readFileSync(new URL("./Toaster.tsx", import.meta.url), "utf8");

describe("UI v2 toast contract (task 376)", () => {
  it("anchors the stack bottom-center (left:50% + translateX(-50%), no right anchor)", () => {
    expect(css).toMatch(/left:\s*50%/);
    expect(css).toMatch(/translateX\(-50%\)/);
    // No right-anchored container remains (the pre-v2 bottom-right stack).
    expect(css).not.toMatch(/^\s*right:/m);
  });

  it("uses the v2 floating-chrome tokens (Task 372)", () => {
    expect(css).toContain("var(--shadow-toast)");
    expect(css).toContain("var(--radius-window)");
    expect(css).toContain("var(--bg-panel)");
    expect(css).toContain("var(--border-strong)");
  });

  it("keeps the 180ms toast-in rise on the motion tokens", () => {
    expect(css).toMatch(
      /animation:\s*toast-in\s+var\(--dur-slow\)\s+var\(--ease-out\)/,
    );
  });

  it("encodes tone with Lucide icons colored by the status tokens", () => {
    expect(tsx).toContain("Check");
    expect(tsx).toContain("CircleAlert");
    expect(tsx).toContain("Info");
    expect(css).toContain("var(--status-done)");
    expect(css).toContain("var(--status-error)");
  });
});
