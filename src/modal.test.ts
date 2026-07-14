import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

/**
 * Anti-drift guard for the UI v2 centered-modal primitive (task 378, spec §10 / the
 * demo modal contract): `src/styles/modal.css` is a global stylesheet consumed by
 * class composition across the whole modal fleet (CanvasClose, Onboarding,
 * CreatePanel, GlobalSearch, the Template fleet, CloneRepo, Update, BigMode) — no
 * import ties the consumers to it, so pin the contract points here the way
 * theme.test.ts pins the pre-paint hexes.
 */
describe("the modal.css primitive (task 378)", () => {
  const css = read("./styles/modal.css");

  it("scrims with var(--scrim) and centers via flex", () => {
    const scrim = css.match(/\.modal-scrim\s*\{([^}]*)\}/);
    expect(scrim).not.toBeNull();
    const body = scrim![1];
    expect(body).toContain("position: fixed");
    expect(body).toContain("inset: 0");
    expect(body).toContain("background: var(--scrim)");
    expect(body).toMatch(/animation:\s*modal-scrim-in 150ms/);
  });

  it("pops a Base dialog with the demo-exact 12px radius + --shadow-modal", () => {
    const pop = css.match(/\.modal-pop\s*\{([^}]*)\}/);
    expect(pop).not.toBeNull();
    const body = pop![1];
    expect(body).toContain("background: var(--bg-panel)");
    expect(body).toContain("border: 1px solid var(--border-strong)");
    expect(body).toContain("border-radius: 12px");
    expect(body).toContain("box-shadow: var(--shadow-modal)");
    expect(body).toContain("max-width: 92vw");
    expect(body).toMatch(/animation:\s*modal-pop-in 160ms/);
  });

  it("keyframes the .97→1 pop", () => {
    const frames = css.match(/@keyframes modal-pop-in\s*\{([\s\S]*?)\n\}/);
    expect(frames).not.toBeNull();
    expect(frames![1]).toContain("scale(0.97)");
    expect(frames![1]).toContain("scale(1)");
    expect(css).toContain("@keyframes modal-scrim-in");
  });

  it("action buttons are 28px at var(--radius-chrome)", () => {
    const btn = css.match(/\.modal-btn\s*\{([^}]*)\}/);
    expect(btn).not.toBeNull();
    expect(btn![1]).toContain("height: 28px");
    expect(btn![1]).toContain("border-radius: var(--radius-chrome)");
    expect(btn![1]).toContain("font-size: var(--fs-meta)");
  });

  it("the danger variant is red-tinted with a plain fallback first", () => {
    const danger = css.match(/\.modal-btn-danger\s*\{([^}]*)\}/);
    expect(danger).not.toBeNull();
    const body = danger![1];
    // Plain fallback declared before the color-mix fill (older WebViews).
    expect(body.indexOf("var(--status-error-dim)")).toBeGreaterThan(-1);
    expect(body.indexOf("var(--status-error-dim)")).toBeLessThan(
      body.indexOf("color-mix("),
    );
    expect(body).toContain(
      "color-mix(in srgb, var(--status-error) 14%, transparent)",
    );
    expect(body).toContain("color: var(--status-error)");
    expect(body).toContain("font-weight: 600");
  });

  it("the primary variant is the accent fill with --accent-fg text", () => {
    const primary = css.match(/\.modal-btn-primary\s*\{([^}]*)\}/);
    expect(primary).not.toBeNull();
    expect(primary![1]).toContain("background: var(--accent)");
    expect(primary![1]).toContain("color: var(--accent-fg)");
  });

  it("kbd hints are borderless micro, inheriting (dimmed) on filled buttons", () => {
    const kbd = css.match(/\.modal-kbd\s*\{([^}]*)\}/);
    expect(kbd).not.toBeNull();
    expect(kbd![1]).toContain("font-size: var(--fs-micro)");
    expect(kbd![1]).not.toContain("border");
    expect(css).toMatch(
      /\.modal-btn-danger \.modal-kbd,\s*\n\.modal-btn-primary \.modal-kbd\s*\{[^}]*color: inherit;[^}]*opacity: 0\.7;/,
    );
  });

  it("is imported once in main.tsx (after menu.css)", () => {
    const main = read("./main.tsx");
    expect(main).toContain('import "./styles/modal.css";');
    expect(main.indexOf('import "./styles/modal.css";')).toBeGreaterThan(
      main.indexOf('import "./styles/menu.css";'),
    );
  });
});
