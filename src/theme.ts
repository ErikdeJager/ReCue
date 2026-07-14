/**
 * The pre-paint theme mirror (#348).
 *
 * The authoritative theme lives in the opaque Rust `settings` blob (#100/#333) and
 * only reaches the frontend after an async IPC — far too late for the *first* frame.
 * So `applySettingsEffects` (store.ts) mirrors it into `localStorage`, and the inline
 * boot script in `index.html` reads it synchronously before the bundle even parses.
 * Best-effort: a missing / stale mirror just means today's behavior (one dark→light
 * flip once the settings IPC lands), and it self-heals on that same launch.
 */

/** UI theme (#333). Mirrors `Settings["theme"]`. */
export type Theme = "dark" | "light";

/** localStorage key holding a synchronous mirror of `settings.theme` (#348). */
export const THEME_STORAGE_KEY = "recue.theme";

/**
 * Pre-paint background per theme — MUST equal `--bg-base` in `src/styles/tokens.css`
 * (`:root` / `:root[data-theme="light"]`), the inline `<style>` in `index.html`, and
 * `background_for_theme()` in `src-tauri/src/commands.rs`. Catppuccin Mocha Base for
 * dark, Latte Base for light (#33/#333). The TS/HTML/CSS trio is guarded by the
 * anti-drift assertion in `theme.test.ts`.
 */
export const THEME_BG: Record<Theme, string> = {
  dark: "#1e1e2e",
  light: "#eff1f5",
};

/** Parse a stored mirror value. Pure: anything that isn't a known theme ⇒ `null`. */
export function themeFromStored(raw: string | null | undefined): Theme | null {
  if (raw === "dark" || raw === "light") return raw;
  return null;
}

/**
 * Read the mirrored theme. Never throws: `localStorage` is absent in node (tests)
 * and can throw in a locked-down WebView — either way we fall back to `null` (the
 * caller keeps the dark default).
 */
export function readStoredTheme(
  storage?: Pick<Storage, "getItem">,
): Theme | null {
  try {
    const store = storage ?? globalThis.localStorage;
    if (!store) return null;
    return themeFromStored(store.getItem(THEME_STORAGE_KEY));
  } catch {
    return null; // storage unavailable / blocked
  }
}

/** Write the theme mirror. Best-effort — never throws (see `readStoredTheme`). */
export function storeTheme(
  theme: Theme,
  storage?: Pick<Storage, "setItem">,
): void {
  try {
    const store = storage ?? globalThis.localStorage;
    if (!store) return;
    store.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // storage unavailable / blocked — the mirror is a disposable accelerator
  }
}
