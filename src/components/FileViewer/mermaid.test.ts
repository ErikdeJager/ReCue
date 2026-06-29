import { describe, expect, it, vi } from "vitest";

import { isMermaidClassName, renderMermaidSvg } from "./mermaid";

describe("isMermaidClassName", () => {
  it("matches a language-mermaid fenced block", () => {
    expect(isMermaidClassName("language-mermaid")).toBe(true);
    // react-markdown can add extra classes around the language token.
    expect(isMermaidClassName("hljs language-mermaid")).toBe(true);
    expect(isMermaidClassName("language-mermaid extra")).toBe(true);
  });

  it("does not match other languages or inline code", () => {
    expect(isMermaidClassName("language-ts")).toBe(false);
    expect(isMermaidClassName("language-mermaidish")).toBe(false);
    expect(isMermaidClassName("mermaid")).toBe(false); // not the language- tag
    expect(isMermaidClassName(undefined)).toBe(false); // inline code (no class)
    expect(isMermaidClassName("")).toBe(false);
  });
});

describe("renderMermaidSvg", () => {
  it("returns the rendered SVG on success", async () => {
    const load = vi.fn().mockResolvedValue({
      initialize: vi.fn(),
      render: vi.fn().mockResolvedValue({ svg: "<svg>ok</svg>" }),
    });
    const out = await renderMermaidSvg(load, "mermaid-1", "graph TD; A-->B");
    expect(out).toBe("<svg>ok</svg>");
  });

  it("returns null (→ code-block fallback) when rendering throws", async () => {
    const load = vi.fn().mockResolvedValue({
      initialize: vi.fn(),
      render: vi.fn().mockRejectedValue(new Error("Parse error")),
    });
    const out = await renderMermaidSvg(load, "mermaid-1", "not a diagram");
    expect(out).toBeNull();
  });

  it("returns null when the lazy import itself fails", async () => {
    const load = vi.fn().mockRejectedValue(new Error("chunk load failed"));
    const out = await renderMermaidSvg(load, "mermaid-1", "graph TD; A-->B");
    expect(out).toBeNull();
  });
});
