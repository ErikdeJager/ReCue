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

  it("reports hiddenCount 0 and keeps single-arg calls working (task 393)", () => {
    const grouped = rankAndGroup([
      result({ kind: "agent", repo: "/a/alpha", title: "solo", score: 60 }),
    ]);
    expect(grouped[0]!.hiddenCount).toBe(0);
  });
});

describe("rankAndGroup active-first ordering (task 393)", () => {
  it("surfaces an active repo before an inactive one alphabetically later", () => {
    const grouped = rankAndGroup(
      [
        result({ kind: "agent", repo: "/r/alpha", title: "a", score: 50 }),
        result({ kind: "agent", repo: "/r/zeta", title: "z", score: 50 }),
      ],
      { activeRepos: new Set(["/r/zeta"]) },
    );
    // "zeta" is active → it renders above the alphabetically-earlier inactive "alpha".
    expect(grouped.map((g) => g.repo)).toEqual(["/r/zeta", "/r/alpha"]);
  });

  it("keeps alphabetical order among repos of the same activeness", () => {
    const grouped = rankAndGroup(
      [
        result({ kind: "agent", repo: "/r/zeta", title: "z", score: 50 }),
        result({ kind: "agent", repo: "/r/beta", title: "b", score: 50 }),
        result({ kind: "agent", repo: "/i/delta", title: "d", score: 50 }),
        result({ kind: "agent", repo: "/i/charlie", title: "c", score: 50 }),
      ],
      { activeRepos: new Set(["/r/zeta", "/r/beta"]) },
    );
    // Both active repos first (beta < zeta), then both inactive (charlie < delta).
    expect(grouped.map((g) => g.repo)).toEqual([
      "/r/beta",
      "/r/zeta",
      "/i/charlie",
      "/i/delta",
    ]);
  });

  it("defaults to alphabetical order when no repo is active", () => {
    const grouped = rankAndGroup([
      result({ kind: "agent", repo: "/r/zeta", title: "z", score: 50 }),
      result({ kind: "agent", repo: "/r/alpha", title: "a", score: 50 }),
    ]);
    expect(grouped.map((g) => g.repo)).toEqual(["/r/alpha", "/r/zeta"]);
  });
});

describe("rankAndGroup per-repo cap (task 393)", () => {
  it("caps a repo at 6 items and records the hidden overflow", () => {
    const results = Array.from({ length: 9 }, (_, i) =>
      result({
        kind: "file",
        repo: "/r/big",
        title: `f${i}.ts`,
        score: 100 - i,
      }),
    );
    const grouped = rankAndGroup(results);
    const rg = grouped[0]!;
    const total = rg.groups.reduce((n, g) => n + g.items.length, 0);
    expect(total).toBe(6);
    expect(rg.hiddenCount).toBe(3);
  });

  it("shows no overflow for a repo at or under the cap", () => {
    const results = Array.from({ length: 6 }, (_, i) =>
      result({
        kind: "file",
        repo: "/r/six",
        title: `f${i}.ts`,
        score: 100 - i,
      }),
    );
    const grouped = rankAndGroup(results);
    const rg = grouped[0]!;
    const total = rg.groups.reduce((n, g) => n + g.items.length, 0);
    expect(total).toBe(6);
    expect(rg.hiddenCount).toBe(0);
  });

  it("fills the cap across kind sections in KIND_ORDER (4 agent + 3 file → 4 + 2)", () => {
    const results = [
      ...Array.from({ length: 4 }, (_, i) =>
        result({
          kind: "agent",
          repo: "/r/mix",
          title: `a${i}`,
          score: 90 - i,
        }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        result({
          kind: "file",
          repo: "/r/mix",
          title: `f${i}.ts`,
          score: 40 - i,
        }),
      ),
    ];
    const grouped = rankAndGroup(results);
    const rg = grouped[0]!;
    const agents = rg.groups.find((g) => g.kind === "agent")!;
    const files = rg.groups.find((g) => g.kind === "file")!;
    expect(agents.items.length).toBe(4);
    expect(files.items.length).toBe(2);
    expect(rg.hiddenCount).toBe(1);
  });

  it("drops an entire kind section once the cap is exhausted", () => {
    const results = [
      ...Array.from({ length: 6 }, (_, i) =>
        result({
          kind: "agent",
          repo: "/r/full",
          title: `a${i}`,
          score: 90 - i,
        }),
      ),
      result({ kind: "file", repo: "/r/full", title: "z.ts", score: 40 }),
      result({ kind: "output", repo: "/r/full", title: "o", score: 20 }),
    ];
    const grouped = rankAndGroup(results);
    const rg = grouped[0]!;
    expect(rg.groups.map((g) => g.kind)).toEqual(["agent"]);
    expect(rg.hiddenCount).toBe(2);
  });

  it("flatOrder excludes the capped-out items", () => {
    const results = Array.from({ length: 9 }, (_, i) =>
      result({
        kind: "file",
        repo: "/r/big",
        title: `f${i}.ts`,
        score: 100 - i,
      }),
    );
    const grouped = rankAndGroup(results);
    expect(flatOrder(grouped)).toHaveLength(6);
  });

  it("honors a custom perRepoCap", () => {
    const results = Array.from({ length: 5 }, (_, i) =>
      result({ kind: "file", repo: "/r/c", title: `f${i}.ts`, score: 100 - i }),
    );
    const grouped = rankAndGroup(results, { perRepoCap: 2 });
    expect(flatOrder(grouped)).toHaveLength(2);
    expect(grouped[0]!.hiddenCount).toBe(3);
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
