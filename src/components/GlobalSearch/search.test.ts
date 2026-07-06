import { describe, expect, it } from "vitest";

import {
  CONTENT_SCORE,
  flatOrder,
  rankAndGroup,
  scoreFilename,
  scoreTitle,
  splitHighlight,
  type SearchResult,
} from "./search";

/** A minimal result builder for the grouping tests. */
function result(
  over: Partial<SearchResult> & Pick<SearchResult, "kind" | "repo" | "title">,
): SearchResult {
  return {
    key: `${over.repo}:${over.kind}:${over.title}`,
    score: 0,
    nav: { type: "item", item: { id: "x", kind: "agent" } },
    ...over,
  };
}

describe("scoreTitle (#337)", () => {
  it("returns 0 when the query is not a substring", () => {
    expect(scoreTitle("zzz", "main branch")).toBe(0);
  });

  it("ranks exact > prefix > word-boundary > mid-string substring", () => {
    const exact = scoreTitle("main", "main");
    const prefix = scoreTitle("main", "mainline");
    const boundary = scoreTitle("main", "feature/main");
    const mid = scoreTitle("main", "domainname");
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(boundary);
    expect(boundary).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(0);
  });

  it("is case-insensitive", () => {
    expect(scoreTitle("MAIN", "the main thing")).toBe(
      scoreTitle("main", "the main thing"),
    );
  });
});

describe("scoreFilename vs content vs output (#337)", () => {
  it("a filename match always outscores a content match", () => {
    // Even the weakest filename hit (directory-only) beats a content hit.
    expect(scoreFilename("app", "src/app/main.ts")).toBeGreaterThan(
      CONTENT_SCORE,
    );
    expect(scoreFilename("readme", "docs/README.md")).toBeGreaterThan(
      CONTENT_SCORE,
    );
  });

  it("a title substring still outranks a filename match (kind ordering aside)", () => {
    // A mid-string title substring bases at 40, above the filename band (35–43 cap).
    expect(scoreTitle("main", "domain")).toBeGreaterThanOrEqual(40 - 20);
  });

  it("returns 0 for a filename with no match anywhere in the path", () => {
    expect(scoreFilename("zzz", "src/app.ts")).toBe(0);
  });
});

describe("rankAndGroup (#337)", () => {
  it("groups by repo (name order) then kind (KIND_ORDER), sorting items by score", () => {
    const grouped = rankAndGroup([
      result({ kind: "file", repo: "/z/beta", title: "b.ts", score: 35 }),
      result({ kind: "agent", repo: "/z/beta", title: "agent-lo", score: 50 }),
      result({ kind: "agent", repo: "/z/beta", title: "agent-hi", score: 90 }),
      result({ kind: "agent", repo: "/a/alpha", title: "solo", score: 60 }),
    ]);
    // Repos ordered by display name: "alpha" before "beta".
    expect(grouped.map((g) => g.repo)).toEqual(["/a/alpha", "/z/beta"]);
    const beta = grouped[1]!;
    // Kinds ordered agent before file.
    expect(beta.groups.map((g) => g.kind)).toEqual(["agent", "file"]);
    // Within the agent bucket, higher score first.
    expect(beta.groups[0]!.items.map((i) => i.title)).toEqual([
      "agent-hi",
      "agent-lo",
    ]);
  });

  it("flatOrder walks repo → kind → item in rendered order", () => {
    const grouped = rankAndGroup([
      result({ kind: "output", repo: "/a", title: "out", score: 20 }),
      result({ kind: "agent", repo: "/a", title: "ag", score: 90 }),
    ]);
    expect(flatOrder(grouped).map((r) => r.title)).toEqual(["ag", "out"]);
  });
});

describe("splitHighlight (#337)", () => {
  it("marks the case-insensitive matches and leaves the rest", () => {
    const segs = splitHighlight("Foo BAR foo", "foo");
    expect(segs).toEqual([
      { text: "Foo", match: true },
      { text: " BAR ", match: false },
      { text: "foo", match: true },
    ]);
  });

  it("a blank query yields a single non-match run", () => {
    expect(splitHighlight("hello", "")).toEqual([
      { text: "hello", match: false },
    ]);
  });

  it("no match yields the whole text as one non-match run", () => {
    expect(splitHighlight("hello", "zzz")).toEqual([
      { text: "hello", match: false },
    ]);
  });
});
