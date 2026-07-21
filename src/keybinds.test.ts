import { describe, expect, it } from "vitest";

import {
  captureProblem,
  chordForAction,
  chordLabel,
  CONTAINER_TOGGLE_CHORD,
  eventChord,
  eventKeyToken,
  isBareAltChord,
  isEditableTarget,
  isTerminalTarget,
  KEYBIND_ACTIONS,
  keybindConflicts,
  keybindMapFor,
  normalizeChord,
  reservedChords,
  resolveKeybindMap,
} from "./keybinds";

/** A keydown-shaped object; only what the chord logic reads. */
function ev(
  code: string,
  opts: Partial<{
    meta: boolean;
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    key: string;
  }> = {},
) {
  return {
    metaKey: opts.meta ?? false,
    ctrlKey: opts.ctrl ?? false,
    altKey: opts.alt ?? false,
    shiftKey: opts.shift ?? false,
    key: opts.key ?? "",
    code,
  };
}

/** An element-shaped object; only what the target predicates read. */
function fakeEl(opts: {
  tag: string;
  isContentEditable?: boolean;
  insideXterm?: boolean;
}): Element {
  return {
    tagName: opts.tag.toUpperCase(),
    isContentEditable: opts.isContentEditable ?? false,
    closest: (selector: string): Element | null =>
      selector === ".xterm" && opts.insideXterm ? ({} as Element) : null,
  } as unknown as Element;
}

describe("KEYBIND_ACTIONS registry", () => {
  it("carries the reworked default set", () => {
    const defaults = Object.fromEntries(
      KEYBIND_ACTIONS.map((a) => [a.id, a.defaultChord]),
    );
    // The new binds of the rework…
    expect(defaults["view-overview"]).toBe("alt+1");
    expect(defaults["view-attention"]).toBe("alt+2");
    expect(defaults["view-canvas"]).toBe("alt+3");
    expect(defaults["close-panel"]).toBe("mod+w");
    expect(defaults["open-settings"]).toBe("mod+,");
    expect(defaults["big-mode"]).toBe("mod+e");
    // …the carried-over set…
    expect(defaults["new-session"]).toBe("mod+n");
    expect(defaults["schedule-session"]).toBe("mod+shift+n");
    expect(defaults["open-launcher"]).toBe("mod+k");
    expect(defaults["global-search"]).toBe("mod+f");
    expect(defaults["toggle-sidebar"]).toBe("mod+b");
    expect(defaults["dense-panels"]).toBe("mod+d");
    // …the "Open in editor" pair…
    expect(defaults["open-in-editor"]).toBe("mod+o");
    expect(defaults["choose-editor"]).toBe("mod+shift+o");
    // …the Multi-window 10/16 new-window chord…
    expect(defaults["new-window"]).toBe("mod+alt+n");
    // …and the removed chords are bound to nothing (⌘T / ⌘1–9 / ⌘\).
    const bound = new Set(Object.values(defaults));
    expect(bound.has("mod+t")).toBe(false);
    expect(bound.has("mod+1")).toBe(false);
    expect(bound.has("mod+\\")).toBe(false);
  });

  it("has unique ids, labels, groups, and canonical unique defaults", () => {
    const ids = KEYBIND_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const defaults = KEYBIND_ACTIONS.map((a) => a.defaultChord);
    expect(new Set(defaults).size).toBe(defaults.length);
    for (const a of KEYBIND_ACTIONS) {
      expect(a.label.trim().length).toBeGreaterThan(0);
      expect(a.group.trim().length).toBeGreaterThan(0);
      // Every default is already canonical (normalizeChord is idempotent on it).
      expect(normalizeChord(a.defaultChord)).toBe(a.defaultChord);
    }
  });

  it("never defaults to a reserved chord on any platform", () => {
    for (const platform of ["macos", "windows", "linux", ""]) {
      const reserved = reservedChords(platform);
      for (const a of KEYBIND_ACTIONS) {
        expect(reserved.has(a.defaultChord)).toBe(false);
      }
    }
  });
});

describe("eventKeyToken", () => {
  it("prefers the physical code for letters, digits, and punctuation", () => {
    expect(eventKeyToken(ev("KeyW", { key: "w" }))).toBe("w");
    // ⌥1 on macOS composes "¡" in e.key — the physical Digit1 still wins.
    expect(eventKeyToken(ev("Digit1", { alt: true, key: "¡" }))).toBe("1");
    expect(eventKeyToken(ev("Numpad3", { key: "3" }))).toBe("3");
    expect(eventKeyToken(ev("Comma", { key: "," }))).toBe(",");
    expect(eventKeyToken(ev("Backslash", { key: "\\" }))).toBe("\\");
    expect(eventKeyToken(ev("Enter", { key: "Enter" }))).toBe("enter");
  });

  it("falls back to e.key for F-keys and rejects bare modifiers", () => {
    expect(eventKeyToken(ev("F5", { key: "F5" }))).toBe("f5");
    expect(eventKeyToken(ev("MetaLeft", { key: "Meta" }))).toBeNull();
    expect(eventKeyToken(ev("ShiftLeft", { key: "Shift" }))).toBeNull();
    expect(eventKeyToken(ev("CapsLock", { key: "CapsLock" }))).toBeNull();
  });
});

describe("eventChord — platform-resolved mod", () => {
  it("maps ⌘ to mod on macOS (and before the platform loads)", () => {
    expect(eventChord(ev("KeyW", { meta: true }), "macos")).toBe("mod+w");
    expect(eventChord(ev("KeyW", { meta: true }), "")).toBe("mod+w");
  });

  it("keeps macOS ⌃ distinct from ⌘ so readline chords pass through", () => {
    expect(eventChord(ev("KeyE", { ctrl: true }), "macos")).toBe("ctrl+e");
    // ⌃⌘F (#399 native fullscreen) is NOT mod+f — it must fall through unmatched.
    expect(eventChord(ev("KeyF", { meta: true, ctrl: true }), "macos")).toBe(
      "mod+ctrl+f",
    );
  });

  it("maps Ctrl to mod on Windows and Linux", () => {
    expect(eventChord(ev("KeyW", { ctrl: true }), "windows")).toBe("mod+w");
    expect(eventChord(ev("KeyW", { ctrl: true }), "linux")).toBe("mod+w");
    expect(eventChord(ev("KeyF", { meta: true }), "windows")).toBe("super+f");
  });

  it("orders modifiers canonically and returns null without a key", () => {
    expect(
      eventChord(ev("KeyN", { meta: true, shift: true, alt: true }), "macos"),
    ).toBe("mod+alt+shift+n");
    expect(eventChord(ev("MetaLeft", { meta: true }), "macos")).toBeNull();
  });

  it("serializes the new default chords from real event shapes", () => {
    expect(eventChord(ev("Digit1", { alt: true, key: "¡" }), "macos")).toBe(
      "alt+1",
    );
    expect(eventChord(ev("Digit2", { alt: true }), "windows")).toBe("alt+2");
    expect(eventChord(ev("Comma", { meta: true, key: "," }), "macos")).toBe(
      "mod+,",
    );
  });
});

describe("normalizeChord", () => {
  it("canonicalizes order and case, and is idempotent", () => {
    expect(normalizeChord("shift+MOD+n")).toBe("mod+shift+n");
    expect(normalizeChord("mod+shift+n")).toBe("mod+shift+n");
    expect(normalizeChord("ALT+3")).toBe("alt+3");
  });

  it("rejects invalid chords as unbound instead of crashing dispatch", () => {
    expect(normalizeChord("")).toBe("");
    expect(normalizeChord("mod+")).toBe("");
    expect(normalizeChord("bogus+w")).toBe("");
    expect(normalizeChord("mod+mod+w")).toBe("");
    expect(normalizeChord("mod+notakey")).toBe("");
    expect(normalizeChord("w+mod")).toBe("");
  });
});

describe("chordForAction / resolveKeybindMap", () => {
  it("uses the default when no override exists", () => {
    expect(chordForAction("close-panel", undefined)).toBe("mod+w");
    expect(chordForAction("close-panel", {})).toBe("mod+w");
  });

  it("honors overrides, unbinding, and normalizes persisted junk", () => {
    expect(
      chordForAction("close-panel", { "close-panel": "mod+shift+x" }),
    ).toBe("mod+shift+x");
    expect(chordForAction("close-panel", { "close-panel": "" })).toBe("");
    expect(chordForAction("close-panel", { "close-panel": "garbage" })).toBe(
      "",
    );
  });

  it("maps chords to actions with deterministic first-wins on forced dupes", () => {
    const map = resolveKeybindMap({});
    expect(map.get("mod+w")).toBe("close-panel");
    expect(map.get("alt+2")).toBe("view-attention");
    // Forcing new-session onto mod+w via a hand-edited blob: close-panel is
    // earlier in the registry, so it keeps the chord; the dupe stays unbound.
    const forced = resolveKeybindMap({ "new-session": "mod+w" });
    expect(forced.get("mod+w")).toBe("close-panel");
    expect([...forced.values()].filter((a) => a === "new-session")).toEqual([]);
  });

  it("caches by overrides identity", () => {
    const overrides = { "close-panel": "mod+shift+x" };
    expect(keybindMapFor(overrides)).toBe(keybindMapFor(overrides));
    expect(keybindMapFor({ ...overrides })).not.toBe(keybindMapFor(overrides));
  });
});

describe("chordLabel", () => {
  it("renders macOS glyphs in the app's ⌘⌥⇧ order", () => {
    expect(chordLabel("mod+shift+n", "macos")).toBe("⌘⇧N");
    expect(chordLabel("alt+1", "macos")).toBe("⌥1");
    expect(chordLabel("mod+,", "")).toBe("⌘,");
    expect(chordLabel("mod+enter", "macos")).toBe("⌘⏎");
    expect(chordLabel("ctrl+e", "macos")).toBe("⌃E");
  });

  it("renders the Ctrl+/Alt+ word form on Windows and Linux", () => {
    expect(chordLabel("mod+shift+n", "windows")).toBe("Ctrl+Shift+N");
    expect(chordLabel("alt+1", "linux")).toBe("Alt+1");
    expect(chordLabel("mod+,", "windows")).toBe("Ctrl+,");
    expect(chordLabel("mod+enter", "linux")).toBe("Ctrl+Enter");
  });

  it("renders unbound and invalid chords as empty", () => {
    expect(chordLabel("", "macos")).toBe("");
    expect(chordLabel("junk", "windows")).toBe("");
  });
});

describe("captureProblem", () => {
  it("requires a real modifier unless the key is an F-key", () => {
    expect(captureProblem("w", "close-panel", {}, "macos")).toEqual({
      kind: "needs-modifier",
    });
    expect(captureProblem("shift+w", "close-panel", {}, "macos")).toEqual({
      kind: "needs-modifier",
    });
    expect(captureProblem("f6", "close-panel", {}, "macos")).toBeNull();
    expect(captureProblem("alt+w", "close-panel", {}, "macos")).toBeNull();
  });

  it("refuses reserved chords per platform", () => {
    expect(captureProblem("mod+s", "close-panel", {}, "macos")).toEqual({
      kind: "reserved",
    });
    expect(captureProblem("mod+q", "close-panel", {}, "macos")).toEqual({
      kind: "reserved",
    });
    expect(captureProblem("mod+alt+3", "close-panel", {}, "windows")).toEqual({
      kind: "reserved",
    });
    // macOS-only reservations don't leak onto Windows/Linux…
    expect(captureProblem("mod+q", "close-panel", {}, "windows")).toBeNull();
    // …and ⇧⌘W (the Close Window menu item) is macOS-reserved.
    expect(captureProblem("mod+shift+w", "close-panel", {}, "macos")).toEqual({
      kind: "reserved",
    });
    expect(
      captureProblem("mod+shift+w", "close-panel", {}, "linux"),
    ).toBeNull();
  });

  it("refuses another action's effective chord and names it", () => {
    expect(captureProblem("mod+f", "close-panel", {}, "macos")).toEqual({
      kind: "taken",
      takenBy: "global-search",
    });
    // Re-capturing an action's own current chord is fine (a no-op assign).
    expect(captureProblem("mod+w", "close-panel", {}, "macos")).toBeNull();
    // A freed default is assignable: global-search rebound away, mod+f is open.
    expect(
      captureProblem("mod+f", "close-panel", { "global-search": "mod+g" }, ""),
    ).toBeNull();
  });
});

describe("keybindConflicts", () => {
  it("is empty for defaults and flags blob-forced duplicates", () => {
    expect(keybindConflicts({}).size).toBe(0);
    const conflicts = keybindConflicts({ "new-session": "mod+w" });
    expect(conflicts.get("mod+w")).toEqual(["close-panel", "new-session"]);
  });
});

describe("isEditableTarget", () => {
  it("flags real text inputs but never xterm's helper textarea", () => {
    expect(isEditableTarget(fakeEl({ tag: "input" }))).toBe(true);
    expect(isEditableTarget(fakeEl({ tag: "textarea" }))).toBe(true);
    expect(isEditableTarget(fakeEl({ tag: "select" }))).toBe(true);
    expect(
      isEditableTarget(fakeEl({ tag: "div", isContentEditable: true })),
    ).toBe(true);
    expect(
      isEditableTarget(fakeEl({ tag: "textarea", insideXterm: true })),
    ).toBe(false);
    expect(isEditableTarget(fakeEl({ tag: "div" }))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe("isBareAltChord (#449)", () => {
  it("flags alt-only (and alt+shift) chords — the glyph-composing class", () => {
    expect(isBareAltChord("alt+1")).toBe(true);
    expect(isBareAltChord("alt+2")).toBe(true);
    expect(isBareAltChord("alt+3")).toBe(true);
    expect(isBareAltChord("alt+shift+2")).toBe(true);
  });

  it("never flags mod-bearing chords or the empty chord", () => {
    expect(isBareAltChord("mod+alt+n")).toBe(false);
    expect(isBareAltChord("mod+w")).toBe(false);
    expect(isBareAltChord("ctrl+alt+2")).toBe(false);
    expect(isBareAltChord("super+alt+1")).toBe(false);
    expect(isBareAltChord("mod+shift+n")).toBe(false);
    expect(isBareAltChord("")).toBe(false);
  });
});

describe("isTerminalTarget (#449)", () => {
  it("flags targets inside .xterm (the hoverFocus contract)", () => {
    expect(
      isTerminalTarget(fakeEl({ tag: "textarea", insideXterm: true })),
    ).toBe(true);
  });

  it("rejects plain inputs, null, and closest-less objects", () => {
    expect(isTerminalTarget(fakeEl({ tag: "input" }))).toBe(false);
    expect(isTerminalTarget(null)).toBe(false);
    expect(isTerminalTarget({} as EventTarget)).toBe(false);
  });
});

describe("bare-⌥ pass-through regression (#449, pure layer)", () => {
  it("an ⌥2-composed glyph still resolves to the alt+2 view chord — and that chord is bare-alt", () => {
    // Nordic ⌥2 composes "@" in e.key; the physical Digit2 wins in eventChord.
    const chord = eventChord(ev("Digit2", { alt: true, key: "@" }), "macos");
    expect(chord).toBe("alt+2");
    expect(keybindMapFor({}).get("alt+2")).toBe("view-attention");
    // The dispatcher's guard classifies it as glyph-capable, so it passes
    // through in editable / focused-terminal targets.
    expect(isBareAltChord("alt+2")).toBe(true);
  });

  it("an AltGr-shaped Ctrl+Alt chord serializes mod-bearing — NOT bare-alt", () => {
    // AltGr on Windows delivers ctrl+alt; ń over KeyN → "mod+alt+n" stays
    // unguarded (the documented new-window caveat).
    const chord = eventChord(
      ev("KeyN", { ctrl: true, alt: true, key: "ń" }),
      "windows",
    );
    expect(chord).toBe("mod+alt+n");
    expect(isBareAltChord(chord as string)).toBe(false);
  });
});

describe("CONTAINER_TOGGLE_CHORD (dev-container toggle, new-session modal)", () => {
  it("matches ⌘⇧C on macOS and Ctrl+Shift+C on Windows/Linux via eventChord", () => {
    // The modal's form handler compares eventChord(e, platform) to this constant.
    expect(
      eventChord(ev("KeyC", { meta: true, shift: true, key: "C" }), "macos"),
    ).toBe(CONTAINER_TOGGLE_CHORD);
    for (const platform of ["windows", "linux"]) {
      expect(
        eventChord(ev("KeyC", { ctrl: true, shift: true, key: "C" }), platform),
      ).toBe(CONTAINER_TOGGLE_CHORD);
    }
  });

  it("does not match near-miss chords", () => {
    // No shift → plain copy; must never toggle.
    expect(eventChord(ev("KeyC", { meta: true, key: "c" }), "macos")).not.toBe(
      CONTAINER_TOGGLE_CHORD,
    );
    // Alt added → a different chord.
    expect(
      eventChord(ev("KeyC", { meta: true, shift: true, alt: true }), "macos"),
    ).not.toBe(CONTAINER_TOGGLE_CHORD);
    // On macOS a bare Ctrl+Shift+C is a terminal-bound ctrl-chord, not the toggle.
    expect(
      eventChord(ev("KeyC", { ctrl: true, shift: true }), "macos"),
    ).not.toBe(CONTAINER_TOGGLE_CHORD);
  });

  it("is reserved on every platform so the recorder refuses to rebind onto it", () => {
    for (const platform of ["macos", "windows", "linux", ""]) {
      expect(reservedChords(platform).has(CONTAINER_TOGGLE_CHORD)).toBe(true);
    }
  });

  it("labels as ⌘⇧C on macOS and Ctrl+Shift+C on Windows/Linux", () => {
    expect(chordLabel(CONTAINER_TOGGLE_CHORD, "macos")).toBe("⌘⇧C");
    expect(chordLabel(CONTAINER_TOGGLE_CHORD, "windows")).toBe("Ctrl+Shift+C");
    expect(chordLabel(CONTAINER_TOGGLE_CHORD, "linux")).toBe("Ctrl+Shift+C");
  });
});
