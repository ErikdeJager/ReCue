import { describe, expect, it } from "vitest";

import { highlightToHtml } from "./prism";

describe("highlightToHtml curated grammars (#44/#150/#227)", () => {
  // Each snippet contains a keyword the grammar must tokenize, so a resolved grammar
  // emits a `<span class="token …">`. If a component failed to load (e.g. php without
  // markup-templating, or a wrong dependency order), the language falls back to escaped
  // plain text with no token spans — so this also guards Prism's dependency order.
  const cases: Array<[string, string]> = [
    ["csharp", "var x = 1;"],
    ["go", "package main"],
    ["lua", "local x = 1"],
    ["sql", "SELECT 1"],
    ["ruby", "def foo; end"],
    ["php", "<?php echo 1; ?>"],
    ["groovy", "def x = 1"],
    ["kotlin", "val x = 1"],
    // A few already-curated languages, for regression coverage.
    ["typescript", "const x: number = 1;"],
    ["java", "class A {}"],
  ];

  it.each(cases)("highlights %s (grammar resolves)", (lang, code) => {
    expect(highlightToHtml(code, lang)).toContain('class="token');
  });

  it("falls back to escaped plain text for an uncurated language", () => {
    expect(highlightToHtml("a < b && c > d", "no-such-lang")).toBe(
      "a &lt; b &amp;&amp; c &gt; d",
    );
  });
});
