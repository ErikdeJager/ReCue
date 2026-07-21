// Pure file-type detection for the universal viewer (#44). Kept dependency-free
// (no Prism import) so it's cheap to unit-test and import.

export type ViewerMode = "markdown" | "code" | "text";

/**
 * File extension → Prism language id (curated set). Only these languages are
 * bundled (see `prism.ts`); anything else falls back to plain text, keeping the
 * bundle small. Markdown is handled as a render mode, not via this map.
 */
const LANG_BY_EXT: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  rs: "rust",
  py: "python",
  java: "java",
  json: "json",
  jsonc: "json",
  css: "css",
  scss: "css",
  html: "markup",
  htm: "markup",
  xml: "markup",
  svg: "markup",
  vue: "markup",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  toml: "toml",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  properties: "properties",
  yaml: "yaml",
  yml: "yaml",
  // Extended curated set (#227): C#, Go, Lua, SQL, Ruby, PHP, and Gradle (Groovy DSL
  // `.gradle`; Kotlin DSL `.gradle.kts`/`.kt`). POM (`pom.xml`) needs no entry — it's
  // XML → `markup` already. `fileExt("build.gradle.kts")` is "kts" (last segment).
  cs: "csharp",
  go: "go",
  lua: "lua",
  sql: "sql",
  rb: "ruby",
  php: "php",
  phtml: "php",
  gradle: "groovy",
  kts: "kotlin",
  kt: "kotlin",
};

/** Lowercase extension of a path, or "" for none (dotfiles count as none). Splits on
 * `/` **or** `\` so a path carrying native Windows separators still yields the right
 * basename (#224 Windows parity); a `/`-only path is unchanged. */
export function fileExt(file: string): string {
  const base = file.split(/[\\/]/).pop() ?? file;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/** Prism language for an extension-less config dotfile detected by **filename**
 * (#150): `.env` / `.env.local` / `.env.*` are KEY=value files with no extension
 * (`fileExt` returns ""), highlighted with the `properties` grammar. */
function langByFilename(file: string): string | undefined {
  const base = file.split(/[\\/]/).pop() ?? file;
  return base === ".env" || base.startsWith(".env.") ? "properties" : undefined;
}

/** The Prism language for a code file, or undefined when it isn't curated code. */
export function prismLang(file: string): string | undefined {
  return LANG_BY_EXT[fileExt(file)] ?? langByFilename(file);
}

/** How the viewer should render a file: rendered markdown, highlighted code, or raw text. */
export function detectMode(file: string): ViewerMode {
  const ext = fileExt(file);
  if (ext === "md" || ext === "markdown") return "markdown";
  return prismLang(file) !== undefined ? "code" : "text";
}

/**
 * Extensions of binary / non-text formats the viewer can't render (task 455) —
 * the FileTree lists such files as real rows but gates opening them (a click
 * toasts "can't preview" instead of creating a doomed viewer panel:
 * `read_text_file` fails on non-UTF-8 / oversized content).
 */
// Mirror of SKIP_EXTS in src-tauri/src/files.rs — keep in sync.
const NON_VIEWABLE_EXTS: Set<string> = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
  "icns",
  "tiff",
  "pdf",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "zip",
  "gz",
  "tgz",
  "bz2",
  "xz",
  "7z",
  "rar",
  "tar",
  "mp4",
  "mov",
  "avi",
  "webm",
  "mkv",
  "mp3",
  "wav",
  "ogg",
  "flac",
  "exe",
  "dll",
  "so",
  "dylib",
  "bin",
  "wasm",
  "node",
  "class",
  "o",
  "a",
  "lib",
  "obj",
  "dmg",
  "iso",
  "jar",
]);

/** Image extensions (task 455) — used only to pick the Image icon for a
 * non-openable tree row. NOT svg, which is viewable markup. */
const IMAGE_EXTS: Set<string> = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
  "icns",
  "tiff",
]);

/** Whether the viewer can preview `file` (task 455): everything except the known
 * binary extensions. Extensionless files (`LICENSE`, `Dockerfile`) are viewable. */
export function isViewableFile(file: string): boolean {
  return !NON_VIEWABLE_EXTS.has(fileExt(file));
}

/** The icon family a FileTree row should use for `file` (task 455): "text" for
 * anything previewable, else "image" for image formats, else generic "binary". */
export function fileIconKind(file: string): "text" | "image" | "binary" {
  if (isViewableFile(file)) return "text";
  return IMAGE_EXTS.has(fileExt(file)) ? "image" : "binary";
}
