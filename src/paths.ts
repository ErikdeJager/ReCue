/** The last path segment (folder name) of a path, for display. */
export function repoName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
