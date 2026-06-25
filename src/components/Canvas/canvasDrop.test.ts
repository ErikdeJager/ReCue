import { describe, expect, it } from "vitest";

import type { CanvasNode } from "../../types";
import {
  itemStillPresent,
  overviewPanelToContent,
  payloadToContent,
  sameItem,
} from "./canvasDrop";

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

  it("maps a filetree drag payload to filetree content (#167)", () => {
    expect(payloadToContent({ kind: "filetree", repoPath: "/repo/a" })).toEqual(
      { kind: "filetree", repoPath: "/repo/a" },
    );
  });
});

describe("sameItem (#157)", () => {
  it("matches agents/terminals by sessionId", () => {
    expect(
      sameItem(
        { kind: "agent", sessionId: "s1", repoPath: "/a" },
        { kind: "agent", sessionId: "s1", repoPath: "/b" },
      ),
    ).toBe(true);
    expect(
      sameItem(
        { kind: "agent", sessionId: "s1" },
        { kind: "agent", sessionId: "s2" },
      ),
    ).toBe(false);
    // Different kinds never match, even with the same sessionId.
    expect(
      sameItem(
        { kind: "agent", sessionId: "s1" },
        { kind: "terminal", sessionId: "s1" },
      ),
    ).toBe(false);
  });

  it("matches file/kanban by repoPath + file, diff by repoPath", () => {
    expect(
      sameItem(
        { kind: "file", repoPath: "/a", file: "x.md" },
        { kind: "file", repoPath: "/a", file: "x.md" },
      ),
    ).toBe(true);
    expect(
      sameItem(
        { kind: "file", repoPath: "/a", file: "x.md" },
        { kind: "file", repoPath: "/a", file: "y.md" },
      ),
    ).toBe(false);
    expect(
      sameItem(
        { kind: "diff", repoPath: "/a" },
        { kind: "diff", repoPath: "/a" },
      ),
    ).toBe(true);
    expect(
      sameItem(
        { kind: "diff", repoPath: "/a" },
        { kind: "diff", repoPath: "/b" },
      ),
    ).toBe(false);
  });

  it("matches scheduled by scheduleId; an item with no key never matches", () => {
    expect(
      sameItem(
        { kind: "scheduled", scheduleId: "sc1" },
        { kind: "scheduled", scheduleId: "sc1" },
      ),
    ).toBe(true);
    // No sessionId on either → not the same item (avoids a false placeholder).
    expect(sameItem({ kind: "agent" }, { kind: "agent" })).toBe(false);
  });
});

describe("overviewPanelToContent (#157)", () => {
  it("maps each Overview panel kind to its live content", () => {
    expect(overviewPanelToContent({ id: "p", kind: "diff" }, "/r")).toEqual({
      kind: "diff",
      repoPath: "/r",
    });
    expect(overviewPanelToContent({ id: "t", kind: "terminal" }, "/r")).toEqual(
      {
        kind: "terminal",
        sessionId: "t",
        repoPath: "/r",
      },
    );
    expect(
      overviewPanelToContent({ id: "k", kind: "kanban", file: "b.md" }, "/r"),
    ).toEqual({ kind: "kanban", repoPath: "/r", file: "b.md" });
    expect(
      overviewPanelToContent({ id: "m", kind: "markdown", file: "R.md" }, "/r"),
    ).toEqual({ kind: "file", repoPath: "/r", file: "R.md" });
    expect(overviewPanelToContent({ id: "f", kind: "filetree" }, "/r")).toEqual(
      {
        kind: "filetree",
        repoPath: "/r",
      },
    );
  });
});

describe("itemStillPresent (#157)", () => {
  const base = {
    sessions: [] as { id: string }[],
    overviewPanels: {} as Record<string, import("../../types").OverviewPanel[]>,
    schedules: [] as { id: string }[],
    canvases: [] as { layout: CanvasNode | null }[],
  };

  it("an agent is present iff it's still in sessions", () => {
    expect(
      itemStillPresent(
        { kind: "agent", sessionId: "s1" },
        { ...base, sessions: [{ id: "s1" }] },
      ),
    ).toBe(true);
    expect(itemStillPresent({ kind: "agent", sessionId: "s1" }, base)).toBe(
      false,
    );
  });

  it("a schedule is present iff it's still in schedules", () => {
    expect(
      itemStillPresent(
        { kind: "scheduled", scheduleId: "sc1" },
        { ...base, schedules: [{ id: "sc1" }] },
      ),
    ).toBe(true);
    expect(
      itemStillPresent({ kind: "scheduled", scheduleId: "sc1" }, base),
    ).toBe(false);
  });

  it("a file/diff is present via an Overview panel or a Canvas leaf", () => {
    // Via an Overview markdown panel.
    expect(
      itemStillPresent(
        { kind: "file", repoPath: "/r", file: "x.md" },
        {
          ...base,
          overviewPanels: {
            "/r": [{ id: "p", kind: "markdown", file: "x.md" }],
          },
        },
      ),
    ).toBe(true);
    // Via a Canvas leaf.
    const layout: CanvasNode = {
      type: "leaf",
      id: "L",
      content: { kind: "diff", repoPath: "/r" },
    };
    expect(
      itemStillPresent(
        { kind: "diff", repoPath: "/r" },
        { ...base, canvases: [{ layout }] },
      ),
    ).toBe(true);
    // Absent from both → gone.
    expect(
      itemStillPresent({ kind: "file", repoPath: "/r", file: "x.md" }, base),
    ).toBe(false);
  });
});
