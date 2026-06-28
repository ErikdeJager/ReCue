import { describe, expect, it } from "vitest";

import {
  allPatchnotes,
  categoryLabel,
  compareVersions,
  latestPatchnotes,
  normalizePatchNotes,
  patchnotesFor,
  patchnotesToMarkdown,
} from "./patchnotes";

describe("patchnotes (#192)", () => {
  it("labels known categories and Title-Cases unknown ones", () => {
    expect(categoryLabel("feature")).toBe("Features");
    expect(categoryLabel("FIX")).toBe("Fixes");
    expect(categoryLabel("improvement")).toBe("Improvements");
    expect(categoryLabel("security")).toBe("Security"); // unknown → Title-Case
    expect(categoryLabel("")).toBe("Other");
  });

  it("compares versions numerically, not lexically", () => {
    expect(compareVersions("0.0.2", "0.0.1")).toBeGreaterThan(0);
    expect(compareVersions("0.0.10", "0.0.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("0.0.1", "0.0.1")).toBe(0);
  });

  it("normalizes a well-formed object and drops empty groups", () => {
    const out = normalizePatchNotes({
      version: "1.2.3",
      date: "2026-01-01",
      changes: [
        { category: "feature", items: ["A", "  ", "B"] },
        { category: "fix", items: [] }, // empty → dropped
        { items: ["no category"] }, // category defaults to "other"
      ],
    });
    expect(out).toEqual({
      version: "1.2.3",
      date: "2026-01-01",
      changes: [
        { category: "feature", items: ["A", "B"] },
        { category: "other", items: ["no category"] },
      ],
    });
  });

  it("returns null for malformed notes", () => {
    expect(normalizePatchNotes(null)).toBeNull();
    expect(normalizePatchNotes("nope")).toBeNull();
    expect(normalizePatchNotes({ date: "x", changes: [] })).toBeNull(); // no version
    expect(normalizePatchNotes({ version: "1.0.0", changes: [] })).toBeNull(); // no non-empty changes
    expect(
      normalizePatchNotes({ version: "1.0.0", changes: [{ items: [] }] }),
    ).toBeNull();
  });

  it("renders grouped markdown with headings + bullets", () => {
    const md = patchnotesToMarkdown({
      version: "1.0.0",
      date: "2026-01-01",
      changes: [
        { category: "feature", items: ["Added X", "Added Y"] },
        { category: "fix", items: ["Fixed Z"] },
      ],
    });
    expect(md).toBe(
      [
        "### Features",
        "- Added X",
        "- Added Y",
        "",
        "### Fixes",
        "- Fixed Z",
      ].join("\n"),
    );
  });

  it("loads the in-repo seed and exposes it sorted newest-first", () => {
    // The 1.0.0 first-release seed ships in src/patchnotes/.
    const seed = patchnotesFor("1.0.0");
    expect(seed).not.toBeNull();
    expect(seed?.version).toBe("1.0.0");
    expect(seed?.changes.length).toBeGreaterThan(0);
    // allPatchnotes is sorted newest-first; latest is the highest version present.
    expect(latestPatchnotes()).toBe(allPatchnotes[0]);
    for (let i = 1; i < allPatchnotes.length; i++) {
      expect(
        compareVersions(
          allPatchnotes[i - 1]!.version,
          allPatchnotes[i]!.version,
        ),
      ).toBeGreaterThan(0);
    }
  });
});
