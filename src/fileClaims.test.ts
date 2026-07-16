// Pure same-file soft-claim helpers (task 435): the claimKey/claimsToMap key
// scheme, the foreign-holder lookup, and the full claimIntent truth table.
import { describe, expect, it } from "vitest";

import {
  type ClaimIntent,
  claimIntent,
  claimKey,
  claimsToMap,
  heldElsewhere,
} from "./fileClaims";
import type { FileClaim } from "./types";

function claim(repo: string, file: string, window: string): FileClaim {
  return { repo_path: repo, file, window };
}

describe("claimKey / claimsToMap", () => {
  it("round-trips a claim list into a lookup map", () => {
    const map = claimsToMap([
      claim("/repo", "a.md", "main"),
      claim("/repo", "b.md", "canvas-1"),
    ]);
    expect(map[claimKey("/repo", "a.md")]).toBe("main");
    expect(map[claimKey("/repo", "b.md")]).toBe("canvas-1");
    expect(Object.keys(map)).toHaveLength(2);
  });

  it("keeps two files in one repo distinct (the NUL join is collision-free)", () => {
    // Without the NUL separator "/repo/a" + "b.md" and "/repo" + "a/b.md" could
    // collide; with it they never do.
    expect(claimKey("/repo/a", "b.md")).not.toBe(claimKey("/repo", "a/b.md"));
  });

  it("treats a Windows-style repo path as an opaque key (no normalization)", () => {
    const map = claimsToMap([claim("C:\\repo", "notes.md", "main")]);
    expect(map[claimKey("C:\\repo", "notes.md")]).toBe("main");
    // A different spelling is a different key — exact-string matching.
    expect(map[claimKey("C:/repo", "notes.md")]).toBeUndefined();
  });

  it("returns an empty map for no claims", () => {
    expect(claimsToMap([])).toEqual({});
  });
});

describe("heldElsewhere", () => {
  const map = claimsToMap([
    claim("/repo", "a.md", "canvas-1"),
    claim("/repo", "b.md", "main"),
  ]);

  it("returns the foreign holder's label", () => {
    expect(heldElsewhere(map, "/repo", "a.md", "main")).toBe("canvas-1");
  });

  it("returns null for a claim held by this window", () => {
    expect(heldElsewhere(map, "/repo", "b.md", "main")).toBeNull();
  });

  it("returns null for a free file", () => {
    expect(heldElsewhere(map, "/repo", "free.md", "main")).toBeNull();
    expect(heldElsewhere({}, "/repo", "a.md", "main")).toBeNull();
  });
});

describe("claimIntent — the pinned truth table", () => {
  // claim    when !held && !lockedByOther && (focused || dirty);
  // release  when  held && !focused && !dirty (lockedByOther is impossible-with-
  //          held in practice, but the table pins "none" there regardless);
  // none     in every lockedByOther state and all remaining combinations.
  const expected = (s: {
    held: boolean;
    focused: boolean;
    dirty: boolean;
    lockedByOther: boolean;
  }): ClaimIntent => {
    if (s.lockedByOther) return "none";
    if (!s.held && (s.focused || s.dirty)) return "claim";
    if (s.held && !s.focused && !s.dirty) return "release";
    return "none";
  };

  it("matches the pinned outcome for all 16 combinations", () => {
    for (const held of [false, true]) {
      for (const focused of [false, true]) {
        for (const dirty of [false, true]) {
          for (const lockedByOther of [false, true]) {
            const s = { held, focused, dirty, lockedByOther };
            expect(claimIntent(s), JSON.stringify(s)).toBe(expected(s));
          }
        }
      }
    }
  });

  it("claims on focus or dirty when free (the Kanban drag path is dirty-only)", () => {
    expect(
      claimIntent({
        held: false,
        focused: true,
        dirty: false,
        lockedByOther: false,
      }),
    ).toBe("claim");
    // A drag mutates via setText without ever focusing an editor.
    expect(
      claimIntent({
        held: false,
        focused: false,
        dirty: true,
        lockedByOther: false,
      }),
    ).toBe("claim");
  });

  it("releases only when held AND blurred AND clean", () => {
    expect(
      claimIntent({
        held: true,
        focused: false,
        dirty: false,
        lockedByOther: false,
      }),
    ).toBe("release");
    // A manual-mode dirty buffer keeps the claim past blur.
    expect(
      claimIntent({
        held: true,
        focused: false,
        dirty: true,
        lockedByOther: false,
      }),
    ).toBe("none");
    // Still focused → keep the claim.
    expect(
      claimIntent({
        held: true,
        focused: true,
        dirty: false,
        lockedByOther: false,
      }),
    ).toBe("none");
  });

  it("never claims or releases while locked by another window", () => {
    for (const held of [false, true]) {
      for (const focused of [false, true]) {
        for (const dirty of [false, true]) {
          expect(
            claimIntent({ held, focused, dirty, lockedByOther: true }),
          ).toBe("none");
        }
      }
    }
  });

  it("does nothing for an idle, clean, unheld editor (the steady state)", () => {
    expect(
      claimIntent({
        held: false,
        focused: false,
        dirty: false,
        lockedByOther: false,
      }),
    ).toBe("none");
  });
});
