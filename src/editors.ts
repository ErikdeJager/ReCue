// Frontend mirror of the Rust editor catalog ("Open in editor"). The backend
// (`src-tauri/src/editors.rs`) is the single source of truth for how each editor
// is detected and launched; this mirrors only the **ids + labels** so the Settings
// → Editor select can render every option synchronously (detection results only
// annotate) and a saved `preferredEditor` always resolves to a label. Keep in sync
// with the Rust `CATALOG` — same ids, same order.

export interface EditorOption {
  /** Stable id persisted in `settings.preferredEditor`. */
  id: string;
  /** Human label for the picker / Settings. */
  label: string;
}

/** Every built-in editor, in the Rust catalog's order. `"custom"` is not listed —
 * the picker/Settings render it as their own explicit row/option. */
export const EDITORS: readonly EditorOption[] = [
  { id: "vscode", label: "Visual Studio Code" },
  { id: "cursor", label: "Cursor" },
  { id: "windsurf", label: "Windsurf" },
  { id: "zed", label: "Zed" },
  { id: "sublime", label: "Sublime Text" },
  { id: "notepadpp", label: "Notepad++" },
  { id: "textmate", label: "TextMate" },
  { id: "kate", label: "Kate" },
  { id: "idea", label: "IntelliJ IDEA" },
  { id: "webstorm", label: "WebStorm" },
  { id: "pycharm", label: "PyCharm" },
  { id: "phpstorm", label: "PhpStorm" },
  { id: "rustrover", label: "RustRover" },
  { id: "goland", label: "GoLand" },
  { id: "clion", label: "CLion" },
  { id: "rider", label: "Rider" },
  { id: "androidstudio", label: "Android Studio" },
  { id: "fleet", label: "Fleet" },
];

/** Display label for an editor id — `"custom"` and unknown ids get readable
 * fallbacks (an unknown id can only come from a hand-edited settings blob). */
export function editorLabel(id: string): string {
  if (id === "custom") return "Custom command";
  return EDITORS.find((e) => e.id === id)?.label ?? id;
}
