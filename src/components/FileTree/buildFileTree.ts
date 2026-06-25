// Pure file-tree builder (#167). Turns the flat, repo-relative path list returned
// by the backend `list_files` command (e.g. `["README.md", "src/store.ts"]`) into a
// nested structure of folder + file nodes, grouped client-side. Kept dependency-free
// and unit-tested, like `canvasTree.ts` — all the tree logic lives here so the
// `FileTree` component stays a thin renderer.

/** One node in the file tree: a folder (with `children`) or a file leaf. `path` is
 * the repo-relative path (folders include a trailing-less full path, e.g. `src/components`);
 * `name` is the last segment shown in the row. */
export interface FileTreeNode {
  /** Last path segment — the label rendered in the row. */
  name: string;
  /** Full repo-relative path (e.g. `src/components/Sidebar.tsx`). */
  path: string;
  type: "folder" | "file";
  /** Child nodes for a folder, sorted folders-before-files then alphabetically;
   * absent for a file leaf. */
  children?: FileTreeNode[];
}

/** A mutable folder accumulator used while grouping; converted to `FileTreeNode`s
 * by `finalize`. */
interface FolderAcc {
  name: string;
  path: string;
  folders: Map<string, FolderAcc>;
  files: { name: string; path: string }[];
}

function emptyFolder(name: string, path: string): FolderAcc {
  return { name, path, folders: new Map(), files: [] };
}

/** Recursively turn a folder accumulator's children into sorted `FileTreeNode`s:
 * folders first (alphabetical, case-insensitive), then files (alphabetical). */
function finalize(acc: FolderAcc): FileTreeNode[] {
  const folders = [...acc.folders.values()]
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    )
    .map<FileTreeNode>((f) => ({
      name: f.name,
      path: f.path,
      type: "folder",
      children: finalize(f),
    }));
  const files = acc.files
    .slice()
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    )
    .map<FileTreeNode>((f) => ({ name: f.name, path: f.path, type: "file" }));
  return [...folders, ...files];
}

/**
 * Build a nested file tree from a flat list of repo-relative paths (#167). Each path
 * is split on `/`; intermediate segments become folder nodes (created on demand),
 * the final segment a file leaf. Folders sort before files, each alphabetically.
 * Empty / blank entries are ignored. Pure + deterministic.
 */
export function buildFileTree(paths: string[]): FileTreeNode[] {
  const root = emptyFolder("", "");
  for (const raw of paths) {
    const path = raw.trim();
    if (!path) continue;
    const segments = path.split("/").filter((s) => s.length > 0);
    if (segments.length === 0) continue;
    let folder = root;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const segment = segments[i] as string;
      const folderPath = segments.slice(0, i + 1).join("/");
      let child = folder.folders.get(segment);
      if (!child) {
        child = emptyFolder(segment, folderPath);
        folder.folders.set(segment, child);
      }
      folder = child;
    }
    const fileName = segments[segments.length - 1] as string;
    // Skip a duplicate file leaf at the same level (defensive; `list_files` is unique).
    if (!folder.files.some((f) => f.name === fileName)) {
      folder.files.push({ name: fileName, path });
    }
  }
  return finalize(root);
}
