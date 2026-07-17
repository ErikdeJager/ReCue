import { describe, expect, it } from "vitest";

import { sanitizeProposal, shaveProposalRows } from "./sizeProposal";

describe("sanitizeProposal (task 427)", () => {
  it("returns null for an undefined proposal (unmeasurable container)", () => {
    expect(sanitizeProposal(undefined)).toBeNull();
  });

  it("returns null for NaN dimensions", () => {
    expect(sanitizeProposal({ cols: NaN, rows: 24 })).toBeNull();
    expect(sanitizeProposal({ cols: 80, rows: NaN })).toBeNull();
  });

  it("returns null for non-finite dimensions", () => {
    expect(sanitizeProposal({ cols: Infinity, rows: 24 })).toBeNull();
    expect(sanitizeProposal({ cols: 80, rows: -Infinity })).toBeNull();
  });

  it("returns null for non-positive dimensions", () => {
    expect(sanitizeProposal({ cols: 0, rows: 24 })).toBeNull();
    expect(sanitizeProposal({ cols: 80, rows: 0 })).toBeNull();
    expect(sanitizeProposal({ cols: -5, rows: 24 })).toBeNull();
  });

  it("passes a normal proposal through as integers", () => {
    expect(sanitizeProposal({ cols: 80, rows: 24 })).toEqual({
      cols: 80,
      rows: 24,
    });
  });

  it("floors fractional dimensions and clamps to ≥ 1", () => {
    expect(sanitizeProposal({ cols: 80.9, rows: 24.2 })).toEqual({
      cols: 80,
      rows: 24,
    });
    // 0 < dim < 1 is positive, so it sanitizes — clamped up to a 1-cell grid
    // rather than a bogus 0 that xterm would reject.
    expect(sanitizeProposal({ cols: 0.5, rows: 0.5 })).toEqual({
      cols: 1,
      rows: 1,
    });
  });
});

describe("shaveProposalRows (task 427 — the #262 shave on a proposal)", () => {
  it("shaves one row when the painted rows overflow the content box by more than 1px", () => {
    // 24 rows × 17px = 408px against a 400px box: clearly clipped.
    expect(shaveProposalRows(24, 17, 400)).toBe(23);
  });

  it("does not shave at exactly contentH + 1 (sub-pixel tolerance boundary)", () => {
    // rows*cellH == contentH + 1 is tolerated rounding, not a clipped row.
    expect(shaveProposalRows(20, 20.05, 400)).toBe(20); // 401 == 400 + 1
    expect(shaveProposalRows(20, 20.1, 400)).toBe(19); // 402 > 400 + 1
  });

  it("does not shave when the rows fit", () => {
    expect(shaveProposalRows(24, 16, 400)).toBe(24); // 384 ≤ 401
  });

  it("never shaves a 1-row proposal", () => {
    expect(shaveProposalRows(1, 1000, 10)).toBe(1);
  });

  it("leaves the rows unchanged when cell metrics are unreadable", () => {
    expect(shaveProposalRows(24, undefined, 400)).toBe(24);
  });

  it("leaves the rows unchanged when the content height is not positive", () => {
    expect(shaveProposalRows(24, 17, 0)).toBe(24);
    expect(shaveProposalRows(24, 17, -5)).toBe(24);
  });

  it("clamps the shaved result to ≥ 1", () => {
    expect(shaveProposalRows(2, 100, 10)).toBe(1);
  });
});
