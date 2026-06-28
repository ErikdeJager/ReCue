import { describe, expect, it } from "vitest";

import type { CanvasNode, CanvasTemplate } from "../../types";
import { leafIds } from "./canvasTree";
import {
  fileBlockTarget,
  instantiateTemplate,
  pendingContent,
  resolvedContent,
} from "./templateInstantiate";

// Deterministic id generator for tests.
function counter() {
  let n = 0;
  return () => `id-${++n}`;
}

const layout: CanvasNode = {
  type: "split",
  id: "s1",
  dir: "row",
  sizes: [60, 40],
  a: { type: "leaf", id: "l1", content: { kind: "new-agent", prompt: "go" } },
  b: {
    type: "leaf",
    id: "l2",
    content: { kind: "open-file", file: "README.md" },
  },
};

const template: CanvasTemplate = { id: "t1", name: "Dev", layout };

describe("instantiateTemplate (#118)", () => {
  it("creates a tab named after the template with all-new ids", () => {
    const tab = instantiateTemplate(template, "/repo/x", counter());
    expect(tab.name).toBe("Dev");
    expect(tab.id).toBe("id-1");
    // Every id is regenerated — none of the template's original ids survive.
    const ids = leafIds(tab.layout);
    expect(ids).not.toContain("l1");
    expect(ids).not.toContain("l2");
    expect(new Set(ids).size).toBe(ids.length); // unique
  });

  it("turns each leaf into a pending panel bound to the chosen folder", () => {
    const tab = instantiateTemplate(template, "/repo/x", counter());
    const split = tab.layout;
    if (!split || split.type !== "split") throw new Error("expected a split");
    expect(split.dir).toBe("row");
    expect(split.sizes).toEqual([60, 40]);
    const a = split.a;
    const b = split.b;
    if (a.type !== "leaf" || b.type !== "leaf")
      throw new Error("expected leaves");
    expect(a.content).toEqual({
      kind: "pending",
      repoPath: "/repo/x",
      block: { kind: "new-agent", prompt: "go" },
    });
    expect(b.content).toEqual({
      kind: "pending",
      repoPath: "/repo/x",
      block: { kind: "open-file", file: "README.md" },
    });
  });

  it("preserves a new-agent block's custom name onto the pending leaf (#136)", () => {
    const named: CanvasTemplate = {
      id: "t2",
      name: "Named",
      layout: {
        type: "leaf",
        id: "l1",
        content: { kind: "new-agent", name: "Backend", prompt: "go" },
      },
    };
    const tab = instantiateTemplate(named, "/repo/x", counter());
    const leaf = tab.layout;
    if (!leaf || leaf.type !== "leaf") throw new Error("expected a leaf");
    // The name (and prompt) survive on the pending block so Retry re-spawns with it.
    expect(leaf.content.block).toEqual({
      kind: "new-agent",
      name: "Backend",
      prompt: "go",
    });
  });

  it("handles an empty template (null layout)", () => {
    const tab = instantiateTemplate(
      { id: "t", name: "Empty", layout: null },
      "/repo/x",
      counter(),
    );
    expect(tab.layout).toBeNull();
  });
});

describe("pendingContent + resolvedContent (#118)", () => {
  it("pendingContent copies the block (no shared reference)", () => {
    const block = { kind: "open-file", file: "a.md" };
    const pending = pendingContent(block, "/repo/x");
    expect(pending.block).toEqual(block);
    expect(pending.block).not.toBe(block);
  });

  it("maps a resolved block to live content by its live kind", () => {
    expect(
      resolvedContent({ kind: "new-agent", prompt: "x" }, "/repo/x", {
        sessionId: "sess-1",
      }),
    ).toEqual({ kind: "agent", sessionId: "sess-1", repoPath: "/repo/x" });

    expect(
      resolvedContent({ kind: "new-terminal" }, "/repo/x", {
        sessionId: "term-1",
      }),
    ).toEqual({ kind: "terminal", sessionId: "term-1", repoPath: "/repo/x" });

    expect(
      resolvedContent({ kind: "open-file", file: "README.md" }, "/repo/x", {}),
    ).toEqual({ kind: "file", repoPath: "/repo/x", file: "README.md" });

    // The kanban block (#154) carries BOTH repoPath + file (the KanbanPanel needs
    // both); it must not fall through to the default branch that drops `file`.
    expect(
      resolvedContent({ kind: "open-kanban", file: "TASKS.md" }, "/repo/x", {}),
    ).toEqual({ kind: "kanban", repoPath: "/repo/x", file: "TASKS.md" });

    expect(resolvedContent({ kind: "open-diff" }, "/repo/x", {})).toEqual({
      kind: "diff",
      repoPath: "/repo/x",
    });
  });

  it("maps an absolute file block via its parent dir as root (#224)", () => {
    expect(
      resolvedContent(
        {
          kind: "open-file",
          file: "/Users/you/notes.md",
          filePathMode: "absolute",
        },
        "/repo/x",
        {},
      ),
    ).toEqual({ kind: "file", repoPath: "/Users/you", file: "notes.md" });
  });
});

describe("fileBlockTarget (#224)", () => {
  it("resolves a bare relative file from the chosen folder (no filePathMode)", () => {
    expect(
      fileBlockTarget({ kind: "open-file", file: "README.md" }, "/repo/x"),
    ).toEqual({
      repoPath: "/repo/x",
      file: "README.md",
    });
  });

  it("resolves an explicit relative subpath from the chosen folder", () => {
    expect(
      fileBlockTarget(
        {
          kind: "open-file",
          file: "src/components/App.tsx",
          filePathMode: "relative",
        },
        "/repo/x",
      ),
    ).toEqual({ repoPath: "/repo/x", file: "src/components/App.tsx" });
  });

  it("normalizes a relative path's backslashes to `/` so it resolves cross-OS (#224)", () => {
    // A template authored on Windows may store native separators; the backend
    // reports/accepts repo-relative paths `/`-separated on every OS, so normalize.
    expect(
      fileBlockTarget(
        {
          kind: "open-file",
          file: "src\\components\\App.tsx",
          filePathMode: "relative",
        },
        "/repo/x",
      ),
    ).toEqual({ repoPath: "/repo/x", file: "src/components/App.tsx" });
  });

  it("resolves a POSIX absolute path via its own parent dir as root", () => {
    expect(
      fileBlockTarget(
        {
          kind: "open-file",
          file: "/Users/you/notes.md",
          filePathMode: "absolute",
        },
        "/repo/x",
      ),
    ).toEqual({ repoPath: "/Users/you", file: "notes.md" });
  });

  it("resolves a Windows absolute path (backslashes) via its parent dir", () => {
    expect(
      fileBlockTarget(
        {
          kind: "open-file",
          file: "C:\\Users\\you\\notes.md",
          filePathMode: "absolute",
        },
        "/repo/x",
      ),
    ).toEqual({ repoPath: "C:\\Users\\you", file: "notes.md" });
  });

  it("falls back to relative + empty file when file is unset", () => {
    expect(fileBlockTarget({ kind: "open-file" }, "/repo/x")).toEqual({
      repoPath: "/repo/x",
      file: "",
    });
  });
});
