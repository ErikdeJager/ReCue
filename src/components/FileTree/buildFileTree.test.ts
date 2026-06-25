import { describe, expect, it } from "vitest";

import { buildFileTree } from "./buildFileTree";

describe("buildFileTree (#167)", () => {
  it("returns an empty array for an empty list", () => {
    expect(buildFileTree([])).toEqual([]);
  });

  it("renders top-level files as leaves", () => {
    expect(buildFileTree(["README.md"])).toEqual([
      { name: "README.md", path: "README.md", type: "file" },
    ]);
  });

  it("nests files under folders by their path segments", () => {
    const tree = buildFileTree(["src/store.ts"]);
    expect(tree).toEqual([
      {
        name: "src",
        path: "src",
        type: "folder",
        children: [{ name: "store.ts", path: "src/store.ts", type: "file" }],
      },
    ]);
  });

  it("builds deep nesting, reusing intermediate folders", () => {
    const tree = buildFileTree([
      "src/components/Sidebar/Sidebar.tsx",
      "src/components/Sidebar/Sidebar.module.css",
    ]);
    const src = tree[0];
    expect(src?.type).toBe("folder");
    const components = src?.children?.[0];
    expect(components?.name).toBe("components");
    const sidebar = components?.children?.[0];
    expect(sidebar?.name).toBe("Sidebar");
    expect(sidebar?.children?.map((c) => c.name)).toEqual([
      // Alphabetical at the leaf level.
      "Sidebar.module.css",
      "Sidebar.tsx",
    ]);
  });

  it("sorts folders before files at each level", () => {
    const tree = buildFileTree(["zeta.txt", "alpha/one.ts", "beta.md"]);
    expect(tree.map((n) => `${n.type}:${n.name}`)).toEqual([
      "folder:alpha",
      "file:beta.md",
      "file:zeta.txt",
    ]);
  });

  it("sorts mixed folders and files alphabetically within their group (case-insensitive)", () => {
    const tree = buildFileTree([
      "Zoo/a.ts",
      "apple/b.ts",
      "Banana.md",
      "apricot.md",
    ]);
    expect(tree.map((n) => `${n.type}:${n.name}`)).toEqual([
      "folder:apple",
      "folder:Zoo",
      "file:apricot.md",
      "file:Banana.md",
    ]);
  });

  it("ignores blank/whitespace entries", () => {
    expect(buildFileTree(["", "  ", "a.ts"])).toEqual([
      { name: "a.ts", path: "a.ts", type: "file" },
    ]);
  });
});
