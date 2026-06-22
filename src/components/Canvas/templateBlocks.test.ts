import { describe, expect, it } from "vitest";

import type { CanvasContent } from "../../types";
import {
  BLOCK_REGISTRY,
  blockDescriptor,
  blockPlaceholderLabel,
  isBlockContent,
  newBlockContent,
} from "./templateBlocks";

describe("templateBlocks registry (#117)", () => {
  it("exposes the v1 block kinds, each mapped to a live content kind", () => {
    const kinds = BLOCK_REGISTRY.map((b) => b.kind);
    expect(kinds).toEqual([
      "new-agent",
      "new-terminal",
      "open-file",
      "open-diff",
    ]);
    expect(blockDescriptor("new-agent")?.liveKind).toBe("agent");
    expect(blockDescriptor("open-file")?.liveKind).toBe("file");
  });

  it("blockDescriptor returns undefined for a non-block kind", () => {
    expect(blockDescriptor("agent")).toBeUndefined();
    expect(blockDescriptor("nope")).toBeUndefined();
  });

  it("isBlockContent distinguishes block kinds from live content", () => {
    expect(isBlockContent({ kind: "new-agent" })).toBe(true);
    expect(isBlockContent({ kind: "open-file" })).toBe(true);
    expect(isBlockContent({ kind: "agent" })).toBe(false);
    expect(isBlockContent({ kind: "file" })).toBe(false);
  });

  it("newBlockContent makes a bare descriptor of the given kind", () => {
    expect(newBlockContent("new-terminal")).toEqual({ kind: "new-terminal" });
  });
});

describe("blockPlaceholderLabel (#117)", () => {
  const label = (c: CanvasContent) => blockPlaceholderLabel(c);

  it("uses the plain label for config-less blocks", () => {
    expect(label({ kind: "new-terminal" })).toBe("Open terminal");
    expect(label({ kind: "open-diff" })).toBe("Open diff");
  });

  it("appends the file path for an open-file block", () => {
    expect(label({ kind: "open-file", file: "README.md" })).toBe(
      "Open file: README.md",
    );
    // No path yet → just the label.
    expect(label({ kind: "open-file" })).toBe("Open file");
  });

  it("appends a truncated prompt for a new-agent block", () => {
    expect(label({ kind: "new-agent", prompt: "fix the bug" })).toBe(
      "Start session: fix the bug",
    );
    expect(label({ kind: "new-agent" })).toBe("Start session");
    const long = "x".repeat(60);
    expect(label({ kind: "new-agent", prompt: long })).toBe(
      `Start session: ${"x".repeat(40)}…`,
    );
  });

  it("falls back to the raw kind for an unknown block", () => {
    expect(label({ kind: "mystery" })).toBe("mystery");
  });
});
