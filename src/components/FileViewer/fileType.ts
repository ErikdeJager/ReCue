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

/** Lowercase extension of a path, or "" for none (dotfiles count as none). */
export function fileExt(file: string): string {
  const base = file.split("/").pop() ?? file;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/** Prism language for an extension-less config dotfile detected by **filename**
 * (#150): `.env` / `.env.local` / `.env.*` are KEY=value files with no extension
 * (`fileExt` returns ""), highlighted with the `properties` grammar. */
function langByFilename(file: string): string | undefined {
  const base = file.split("/").pop() ?? file;
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
