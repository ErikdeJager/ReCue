// Platform-dependent **display** strings (#143/#345). The host OS family (`"macos"` /
// `"windows"` / `"linux"`, `""` until loaded) is read once at boot from the backend
// `platform()` command and cached in the store (`platform`); these helpers turn it into
// the right labels. Keyboard *handling* stays platform-agnostic (`metaKey || ctrlKey`) —
// only what the user *sees* changes, so macOS renders exactly as before.

/** True on Windows (#143). */
export function isWindows(platform: string): boolean {
  return platform === "windows";
}

/** True on Linux (Arch/Ubuntu/Mint & others, #345). */
export function isLinux(platform: string): boolean {
  return platform === "linux";
}

/** The OS file manager's "reveal" label — "Reveal in Explorer" on Windows, "Reveal in
 * File Manager" on Linux (generic across Nautilus/Dolphin/Nemo/Thunar), the original
 * "Reveal in Finder" on macOS (#129/#133/#143/#345). */
export function revealLabel(platform: string): string {
  if (isWindows(platform)) return "Reveal in Explorer";
  if (isLinux(platform)) return "Reveal in File Manager";
  return "Reveal in Finder";
}

/** Render a keyboard hint for the platform: the macOS glyph form on macOS, a
 * "Ctrl+…" form on Windows **and Linux** (both use Ctrl, #143/#345). Pass the exact
 * strings to show for each. Before the platform loads (`""`) this shows the macOS
 * glyphs, matching the prior behavior. */
export function kbdHint(platform: string, mac: string, win: string): string {
  return isWindows(platform) || isLinux(platform) ? win : mac;
}

/** Join a folder `root` with a repo-relative path into an **OS-native** absolute
 * path (#143). The backend reports relative paths as `/`-separated on every OS
 * (`files.rs`), while `root` carries native separators — so a naive `${root}/${rel}`
 * yields mixed separators on Windows, which `explorer /select` rejects and which
 * read wrong when copied. This normalizes to backslashes on Windows (forward slashes
 * on macOS, identical to the prior behavior) and trims any trailing root separator so
 * there's never a doubled one. */
export function joinPath(platform: string, root: string, rel: string): string {
  const trimmed = root.replace(/[\\/]+$/, "");
  const joined = `${trimmed}/${rel}`;
  return isWindows(platform) ? joined.replace(/\//g, "\\") : joined;
}
