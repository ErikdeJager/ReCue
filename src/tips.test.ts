import { describe, expect, it } from "vitest";

import {
  CHORD_RE,
  nextTipIndex,
  randomTipIndex,
  renderTip,
  TIPS,
} from "./tips";

describe("tips catalog (task 379)", () => {
  it("ships at least 10 short single-line tips", () => {
    expect(TIPS.length).toBeGreaterThanOrEqual(10);
    for (const tip of TIPS) {
      expect(typeof tip).toBe("string");
      expect(tip.trim().length).toBeGreaterThan(0);
      expect(tip).not.toMatch(/[\r\n]/);
      expect(tip.length).toBeLessThanOrEqual(100);
    }
  });

  it("every ⌘/⌥ chord in every tip matches the chord pattern (anti-typo)", () => {
    for (const tip of TIPS) {
      // A chord lead is ⌘, or a ⌥ NOT sitting in modifier position after ⌘
      // (the keybind rework's bare ⌥-digit view chords).
      const chars = [...tip];
      const leadCount = chars.filter(
        (ch, i) => ch === "⌘" || (ch === "⌥" && chars[i - 1] !== "⌘"),
      ).length;
      const matches = [...tip.matchAll(CHORD_RE)];
      expect(matches.length, `unrecognized ⌘/⌥ chord in tip: "${tip}"`).toBe(
        leadCount,
      );
    }
  });
});

describe("renderTip", () => {
  it("is identity on macOS and before the platform loads", () => {
    const tip = "⌘E opens the selected agent or panel in big mode";
    expect(renderTip("macos", tip)).toBe(tip);
    expect(renderTip("", tip)).toBe(tip);
  });

  it.each(["windows", "linux"])("converts plain chords on %s", (platform) => {
    expect(renderTip(platform, "⌘E opens big mode")).toBe(
      "Ctrl+E opens big mode",
    );
  });

  it("converts shift chords (⌘⇧N → Ctrl+Shift+N)", () => {
    expect(renderTip("windows", "⌘⇧N schedules an agent")).toBe(
      "Ctrl+Shift+N schedules an agent",
    );
  });

  it("converts return chords (⌘⏎ → Ctrl+Enter)", () => {
    expect(renderTip("linux", "⌘⏎ starts a worktree")).toBe(
      "Ctrl+Enter starts a worktree",
    );
  });

  it("converts alt chords (⌘⌥K → Ctrl+Alt+K)", () => {
    expect(renderTip("windows", "⌘⌥K does a thing")).toBe(
      "Ctrl+Alt+K does a thing",
    );
  });

  it("converts every chord in a multi-chord tip", () => {
    expect(renderTip("windows", "⌘1–⌘9 jump straight to a Canvas tab")).toBe(
      "Ctrl+1–Ctrl+9 jump straight to a Canvas tab",
    );
  });

  it("converts bare ⌥ view chords (⌥1 → Alt+1, keybind rework)", () => {
    expect(renderTip("linux", "⌥1, ⌥2 and ⌥3 switch views")).toBe(
      "Alt+1, Alt+2 and Alt+3 switch views",
    );
    // A modifier ⌥ after ⌘ still reads as Ctrl+Alt+…
    expect(renderTip("windows", "⌘⌥K does a thing")).toBe(
      "Ctrl+Alt+K does a thing",
    );
  });
});

describe("randomTipIndex", () => {
  it("stays in [0, count) across seeded rands", () => {
    for (const r of [0, 0.1, 0.5, 0.9, 0.999999]) {
      const idx = randomTipIndex(15, () => r);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(15);
    }
  });

  it("clamps a hostile rand and an empty catalog", () => {
    expect(randomTipIndex(15, () => 1)).toBe(14);
    expect(randomTipIndex(0)).toBe(0);
  });
});

describe("nextTipIndex", () => {
  it("is in range and never returns the current index when count > 1", () => {
    for (let current = 0; current < 5; current++) {
      for (const r of [0, 0.2, 0.5, 0.8, 0.999999]) {
        const next = nextTipIndex(current, 5, () => r);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(5);
        expect(next).not.toBe(current);
      }
    }
  });

  it("returns 0 for a single-tip catalog", () => {
    expect(nextTipIndex(0, 1)).toBe(0);
  });
});
