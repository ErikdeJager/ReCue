import { describe, expect, it } from "vitest";

import { payloadToContent } from "./canvasDrop";

describe("payloadToContent (#47/#142)", () => {
  it("maps a file drag payload to file content", () => {
    expect(
      payloadToContent({ kind: "file", repoPath: "/repo/a", file: "x.md" }),
    ).toEqual({ kind: "file", repoPath: "/repo/a", file: "x.md" });
  });

  it("maps a kanban drag payload to kanban content (#142)", () => {
    expect(
      payloadToContent({
        kind: "kanban",
        repoPath: "/repo/a",
        file: "board.md",
      }),
    ).toEqual({ kind: "kanban", repoPath: "/repo/a", file: "board.md" });
  });

  it("ignores a kanban payload with no file", () => {
    expect(
      payloadToContent({ kind: "kanban", repoPath: "/repo/a" }),
    ).toBeNull();
  });
});
