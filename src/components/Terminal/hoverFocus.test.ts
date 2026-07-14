import { describe, expect, it } from "vitest";

import {
  focusedTerminalElement,
  shouldHoverFocus,
  shouldHoverSelect,
} from "./hoverFocus";

// The vitest environment here is `node` (see vitest.config.ts), so there is no real
// DOM / jsdom. `shouldHoverFocus` only reads `.closest(".xterm")`, `.tagName` and
// `.isContentEditable`, so a minimal fake Element exercises the whole contract without
// pulling in jsdom as a dependency.
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

describe("shouldHoverFocus (#368)", () => {
  it("is always false when the setting is disabled", () => {
    expect(shouldHoverFocus(false, null)).toBe(false);
    expect(shouldHoverFocus(false, fakeEl({ tag: "div" }))).toBe(false);
    expect(shouldHoverFocus(false, fakeEl({ tag: "input" }))).toBe(false);
    expect(
      shouldHoverFocus(false, fakeEl({ tag: "textarea", insideXterm: true })),
    ).toBe(false);
  });

  it("focuses when nothing is focused (enabled + null)", () => {
    expect(shouldHoverFocus(true, null)).toBe(true);
  });

  it("focuses when focus is on a non-editable element (a plain <div>)", () => {
    expect(shouldHoverFocus(true, fakeEl({ tag: "div" }))).toBe(true);
  });

  it("does NOT steal focus from a real text field", () => {
    expect(shouldHoverFocus(true, fakeEl({ tag: "input" }))).toBe(false);
    expect(shouldHoverFocus(true, fakeEl({ tag: "textarea" }))).toBe(false);
    expect(shouldHoverFocus(true, fakeEl({ tag: "select" }))).toBe(false);
  });

  it("does NOT steal focus from a contenteditable element", () => {
    expect(
      shouldHoverFocus(true, fakeEl({ tag: "div", isContentEditable: true })),
    ).toBe(false);
  });

  it("DOES move focus away from another terminal (xterm helper textarea)", () => {
    // xterm's focused element is its own helper <textarea> living inside `.xterm`;
    // the `.closest(".xterm")` short-circuit treats it as OK to leave.
    expect(
      shouldHoverFocus(true, fakeEl({ tag: "textarea", insideXterm: true })),
    ).toBe(true);
  });

  it("treats any descendant of an .xterm container as OK to leave", () => {
    expect(
      shouldHoverFocus(true, fakeEl({ tag: "span", insideXterm: true })),
    ).toBe(true);
  });
});

describe("shouldHoverSelect (#371)", () => {
  it("is always false when the setting is disabled", () => {
    expect(shouldHoverSelect(false, 0, null)).toBe(false);
    expect(shouldHoverSelect(false, 0, fakeEl({ tag: "div" }))).toBe(false);
  });

  it("is false whenever a pointer button is held (drags never hover-select)", () => {
    expect(shouldHoverSelect(true, 1, null)).toBe(false); // primary button
    expect(shouldHoverSelect(true, 2, null)).toBe(false); // secondary button
    expect(shouldHoverSelect(true, 4, fakeEl({ tag: "div" }))).toBe(false);
    expect(
      shouldHoverSelect(true, 1, fakeEl({ tag: "span", insideXterm: true })),
    ).toBe(false);
  });

  it("delegates to shouldHoverFocus when no button is held", () => {
    // Allowed: nothing focused, a plain div, an xterm descendant.
    expect(shouldHoverSelect(true, 0, null)).toBe(true);
    expect(shouldHoverSelect(true, 0, fakeEl({ tag: "div" }))).toBe(true);
    expect(
      shouldHoverSelect(
        true,
        0,
        fakeEl({ tag: "textarea", insideXterm: true }),
      ),
    ).toBe(true);
    // Blocked: real text fields outside .xterm (#368 guard preserved).
    expect(shouldHoverSelect(true, 0, fakeEl({ tag: "input" }))).toBe(false);
    expect(shouldHoverSelect(true, 0, fakeEl({ tag: "textarea" }))).toBe(false);
    expect(shouldHoverSelect(true, 0, fakeEl({ tag: "select" }))).toBe(false);
    expect(
      shouldHoverSelect(
        true,
        0,
        fakeEl({ tag: "div", isContentEditable: true }),
      ),
    ).toBe(false);
  });
});

describe("focusedTerminalElement (#371)", () => {
  it("returns null when nothing is focused", () => {
    expect(focusedTerminalElement(null)).toBeNull();
  });

  it("returns null for a focused element outside .xterm (a real text field)", () => {
    expect(focusedTerminalElement(fakeEl({ tag: "textarea" }))).toBeNull();
    expect(focusedTerminalElement(fakeEl({ tag: "div" }))).toBeNull();
  });

  it("returns the element itself for an .xterm descendant (the helper textarea)", () => {
    const el = fakeEl({ tag: "textarea", insideXterm: true });
    expect(focusedTerminalElement(el)).toBe(el);
  });
});
