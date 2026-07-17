import { describe, expect, it } from "vitest";

import { rankFileMatches, scoreFilePath } from "./fileRank";

describe("scoreFilePath (task 415)", () => {
  it("returns 0 when the query is absent from the path", () => {
    expect(scoreFilePath("zzz", "docs/readme.md")).toBe(0);
  });

  it("returns 0 for an empty or whitespace-only query", () => {
    expect(scoreFilePath("", "docs/readme.md")).toBe(0);
    expect(scoreFilePath("   ", "docs/readme.md")).toBe(0);
  });

  it("ranks exact > prefix > word-boundary > mid-substring > directory-only", () => {
    const exact = scoreFilePath("readme", "readme");
    const prefix = scoreFilePath("read", "readme.md");
    const boundary = scoreFilePath("readme", "docs/old-readme.md");
    const mid = scoreFilePath("adm", "readme.md");
    const dirOnly = scoreFilePath("docs", "docs/readme.md");
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(boundary);
    expect(boundary).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(dirOnly);
    expect(dirOnly).toBeGreaterThan(0);
  });

  it("is case-insensitive", () => {
    expect(scoreFilePath("README", "readme.md")).toBe(
      scoreFilePath("readme", "readme.md"),
    );
    expect(scoreFilePath("README", "readme.md")).toBeGreaterThan(0);
  });

  it("scores the acceptance-criteria prefix case as a basename prefix", () => {
    // "functional design.md" begins with the query → prefix tier (80), higher than the
    // directory-only match "functional design/index.md" (20).
    expect(scoreFilePath("functional design", "functional design.md")).toBe(80);
    expect(
      scoreFilePath("functional design", "functional design/index.md"),
    ).toBe(20);
  });
});

describe("rankFileMatches (task 415)", () => {
  const FIXTURE = [
    // Deliberately NOT best-first, to prove the reorder does the work.
    "functional design/index.md",
    "archive/old functional design draft.md",
    "docs/functional design.md",
    "functional design.md",
  ];

  it("orders the acceptance-criteria fixture best-match first", () => {
    expect(rankFileMatches("functional design", FIXTURE)).toEqual([
      "functional design.md", // basename prefix (80), shortest path
      "docs/functional design.md", // basename prefix (80), longer path
      "archive/old functional design draft.md", // in-basename, below the prefixes
      "functional design/index.md", // directory-only (20), last
    ]);
  });

  it("keeps every input (reorders, never drops)", () => {
    const ranked = rankFileMatches("functional design", FIXTURE);
    expect(ranked).toHaveLength(FIXTURE.length);
    expect([...ranked].sort()).toEqual([...FIXTURE].sort());
  });

  it("breaks a same-tier tie by shorter path first", () => {
    // Both are exact basenames of "notes.md" — the shallower path wins.
    const ranked = rankFileMatches("notes.md", [
      "deep/nested/notes.md",
      "notes.md",
    ]);
    expect(ranked).toEqual(["notes.md", "deep/nested/notes.md"]);
  });

  it("returns the input order unchanged for an empty query", () => {
    const input = ["b/x.md", "a/y.md", "z.md"];
    expect(rankFileMatches("", input)).toEqual(input);
    expect(rankFileMatches("   ", input)).toEqual(input);
  });

  it("does not mutate its input array", () => {
    const input = [
      "functional design/index.md",
      "docs/functional design.md",
      "functional design.md",
    ];
    const snapshot = [...input];
    rankFileMatches("functional design", input);
    expect(input).toEqual(snapshot);
  });

  it("is deterministic and stable", () => {
    const a = rankFileMatches("functional design", FIXTURE);
    const b = rankFileMatches("functional design", FIXTURE);
    expect(a).toEqual(b);
  });

  it("ranks a basename match above a directory-only match", () => {
    const ranked = rankFileMatches("design", [
      "design/notes.md", // directory-only
      "src/design.ts", // basename match
    ]);
    expect(ranked).toEqual(["src/design.ts", "design/notes.md"]);
  });
});
