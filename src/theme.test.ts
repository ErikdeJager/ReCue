import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  THEME_BG,
  THEME_STORAGE_KEY,
  readStoredTheme,
  storeTheme,
  themeFromStored,
  type Theme,
} from "./theme";

/** Minimal in-memory Storage stand-in (vitest runs in node — no localStorage). */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

/** A storage that throws on every access (a locked-down WebView / disabled storage). */
const throwingStorage = {
  getItem: (): string => {
    throw new Error("storage blocked");
  },
  setItem: (): void => {
    throw new Error("storage blocked");
  },
};

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

describe("themeFromStored", () => {
  it("accepts the two known themes", () => {
    expect(themeFromStored("dark")).toBe("dark");
    expect(themeFromStored("light")).toBe("light");
  });

  it("rejects anything else", () => {
    expect(themeFromStored(null)).toBeNull();
    expect(themeFromStored(undefined)).toBeNull();
    expect(themeFromStored("")).toBeNull();
    expect(themeFromStored("Light")).toBeNull();
    expect(themeFromStored("system")).toBeNull();
  });
});

describe("the theme mirror (#348)", () => {
  it("round-trips through a storage", () => {
    const storage = fakeStorage();
    storeTheme("light", storage);
    expect(storage.data.get(THEME_STORAGE_KEY)).toBe("light");
    expect(readStoredTheme(storage)).toBe("light");

    storeTheme("dark", storage);
    expect(readStoredTheme(storage)).toBe("dark");
  });

  it("reads null from an empty or garbage store", () => {
    expect(readStoredTheme(fakeStorage())).toBeNull();
    expect(
      readStoredTheme(fakeStorage({ [THEME_STORAGE_KEY]: "chartreuse" })),
    ).toBeNull();
  });

  it("never throws when storage is absent (node) or blocked", () => {
    // No storage argument and no globalThis.localStorage in the node test env.
    expect(() => storeTheme("light")).not.toThrow();
    expect(readStoredTheme()).toBeNull();

    expect(() => storeTheme("dark", throwingStorage)).not.toThrow();
    expect(readStoredTheme(throwingStorage)).toBeNull();
  });
});

/**
 * Anti-drift guard (#348): the pre-paint background is duplicated in three places that
 * cannot import each other — the TS mirror, the inline `<style>` in `index.html` (the
 * only styling that exists before the bundle parses), and the `--bg-base` token in
 * `src/styles/tokens.css` (the real theme). If they drift, the first painted frame no
 * longer matches the app and the flash comes back. (The Rust side —
 * `background_for_theme` in `src-tauri/src/commands.rs` — carries the same hexes and is
 * covered by its own unit test.)
 */
describe("pre-paint background hexes stay in sync", () => {
  const html = read("../index.html");
  const tokens = read("./styles/tokens.css");

  const grab = (source: string, pattern: RegExp, what: string): string => {
    const match = source.match(pattern);
    if (!match) throw new Error(`could not find ${what}`);
    return match[1].toLowerCase();
  };

  it("index.html matches THEME_BG", () => {
    const dark = grab(
      html,
      /\bhtml\s*\{[^}]*background:\s*(#[0-9a-fA-F]{6})/,
      "the html background in index.html",
    );
    const light = grab(
      html,
      /\bhtml\[data-theme="light"\]\s*\{[^}]*background:\s*(#[0-9a-fA-F]{6})/,
      'the html[data-theme="light"] background in index.html',
    );
    expect(dark).toBe(THEME_BG.dark);
    expect(light).toBe(THEME_BG.light);
  });

  it("tokens.css --bg-base matches THEME_BG", () => {
    const dark = grab(
      tokens,
      /:root\s*\{[\s\S]*?--bg-base:\s*(#[0-9a-fA-F]{6})/,
      "--bg-base in :root",
    );
    const light = grab(
      tokens,
      /:root\[data-theme="light"\]\s*\{[\s\S]*?--bg-base:\s*(#[0-9a-fA-F]{6})/,
      '--bg-base in :root[data-theme="light"]',
    );
    expect(dark).toBe(THEME_BG.dark);
    expect(light).toBe(THEME_BG.light);
  });

  it("the boot script in index.html reads the mirror key", () => {
    expect(html).toContain(`localStorage.getItem("${THEME_STORAGE_KEY}")`);
    const themes: Theme[] = ["dark", "light"];
    expect(Object.keys(THEME_BG).sort()).toEqual(themes.sort());
  });
});

/**
 * v2 foundation tokens (task 372): the stage vars + dense hook and the derived accent
 * tints are the contract later UI v2 cards (dense mode #2, Overview/Canvas stages #5/#6)
 * build on — pin them so they can't silently drift out of tokens.css.
 */
describe("v2 foundation tokens (task 372)", () => {
  const tokens = read("./styles/tokens.css");

  it("declares the three stage vars with the §2.4 values", () => {
    expect(tokens).toMatch(/--stage-gap:\s*8px\s*;/);
    expect(tokens).toMatch(/--stage-pad-overview:\s*12px\s*;/);
    expect(tokens).toMatch(/--stage-pad-canvas:\s*10px\s*;/);
  });

  it("a :root.dense rule zeroes all three stage vars", () => {
    const block = tokens.match(/:root\.dense\s*\{([^}]*)\}/);
    expect(block).not.toBeNull();
    const body = block![1];
    expect(body).toMatch(/--stage-gap:\s*0px\s*;/);
    expect(body).toMatch(/--stage-pad-overview:\s*0px\s*;/);
    expect(body).toMatch(/--stage-pad-canvas:\s*0px\s*;/);
  });

  it("derives the accent tints from the single var(--accent) via color-mix", () => {
    for (const tint of ["fill", "border", "hover"]) {
      const decl = tokens.match(
        new RegExp(`--accent-tint-${tint}:\\s*([^;]+);`),
      );
      expect(decl, `--accent-tint-${tint} exists`).not.toBeNull();
      expect(decl![1]).toContain("color-mix(");
      expect(decl![1]).toContain("var(--accent)");
    }
  });
});

/**
 * Token hygiene guard (task 383): parallel reskin cards merging into tokens.css can
 * each bring their own copy of a token (the epic's known near-miss: `--text-faint`
 * from tasks 379/380). A duplicate declaration is silent — last-one-wins — so a merge
 * can flip a color without any diff on the consumer. Pin it: every custom property is
 * declared exactly once per top-level block.
 */
describe("token hygiene (task 383)", () => {
  const tokens = read("./styles/tokens.css");

  // Top-level blocks only: a selector line followed by a body up to the first
  // column-0 closing brace (tokens.css has no nested rules).
  const blocks = [...tokens.matchAll(/^([^{\n][^\n{]*)\{([\s\S]*?)^\}/gm)];

  it("finds the three theme blocks", () => {
    const selectors = blocks.map(([, sel]) => sel.trim());
    expect(selectors).toContain(":root");
    expect(selectors).toContain(":root.dense");
    expect(selectors).toContain(':root[data-theme="light"]');
  });

  it.each(blocks.map(([, sel, body]) => [sel.trim(), body]))(
    "declares each custom property exactly once in %s",
    (_sel, body) => {
      const names = [...body.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]);
      const seen = new Set<string>();
      const dupes = new Set<string>();
      for (const name of names) {
        if (seen.has(name)) dupes.add(name);
        seen.add(name);
      }
      expect([...dupes]).toEqual([]);
    },
  );
});
