import { describe, expect, it } from "vitest";

import { shouldHoverFocus } from "./hoverFocus";

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
