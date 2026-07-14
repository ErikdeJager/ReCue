import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// Guard the UI v2 shared menu primitive (task 375, DESIGN-SPEC.md §10): the
// stylesheet is read off disk (the fs-read idiom, like platform.test.ts's
// tokens.css guard) and checked for the §10 contract points, so a refactor
// can't silently drop the one menu look every context menu / popover shares.
const menuCss = readFileSync(
  new URL("./styles/menu.css", import.meta.url),
  "utf8",
);
const mainTsx = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");

describe("menu.css — the shared §10 menu primitive (task 375)", () => {
  it("is imported once in main.tsx, after atoms.css", () => {
    expect(mainTsx).toContain('import "./styles/menu.css";');
    expect(mainTsx.indexOf("./styles/menu.css")).toBeGreaterThan(
      mainTsx.indexOf("./styles/atoms.css"),
    );
  });

  it("floats on the deep menu shadow with the 10px window radius", () => {
    expect(menuCss).toContain("box-shadow: var(--shadow-menu)");
    expect(menuCss).toContain("border-radius: var(--radius-window)");
  });

  it("scales in from 0.97 (the 130ms menu-pop-in entry)", () => {
    expect(menuCss).toContain("scale(0.97)");
    expect(menuCss).toContain("@keyframes menu-pop-in");
  });

  it("items are 28px flex rows at the row type size", () => {
    expect(menuCss).toContain("height: 28px");
    expect(menuCss).toContain("font-size: var(--fs-row)");
  });

  it("section labels are uppercase micro", () => {
    expect(menuCss).toContain("text-transform: uppercase");
    expect(menuCss).toContain("font-size: var(--fs-micro)");
  });

  it("danger items use the red status token", () => {
    expect(menuCss).toMatch(
      /\.menu-item-danger\s*\{[^}]*var\(--status-error\)/,
    );
  });
});
