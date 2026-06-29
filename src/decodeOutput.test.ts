import { describe, expect, it } from "vitest";

import { decodeOutputB64 } from "./decodeOutput";

// Encode bytes -> base64 the way the Rust backend does (the test mirror of
// `commands::encode_output`), so the round-trip assertion is independent of the
// decoder under test.
function encodeBytes(bytes: number[]): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

describe("decodeOutputB64", () => {
  it("round-trips arbitrary byte sequences exactly", () => {
    const cases: number[][] = [
      [],
      [104, 101, 108, 108, 111], // "hello"
      [0x1b, 0x5b, 0x30, 0x6d], // ESC [ 0 m
      [0, 27, 91, 49, 255, 254, 0, 128, 10, 13], // nulls + high bytes
    ];
    for (const bytes of cases) {
      const decoded = decodeOutputB64(encodeBytes(bytes));
      expect(Array.from(decoded)).toEqual(bytes);
    }
  });

  it("returns an empty Uint8Array for the empty string", () => {
    const decoded = decodeOutputB64("");
    expect(decoded).toBeInstanceOf(Uint8Array);
    expect(decoded.length).toBe(0);
  });

  it("preserves all 256 byte values", () => {
    const bytes = Array.from({ length: 256 }, (_, i) => i);
    const decoded = decodeOutputB64(encodeBytes(bytes));
    expect(Array.from(decoded)).toEqual(bytes);
  });
});
