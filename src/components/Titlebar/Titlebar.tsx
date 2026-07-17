import styles from "./Titlebar.module.css";

/**
 * Slim, ReCue-themed window title-bar strip (task 444) — reintroduces a custom title bar
 * cleanly, reversing #19 (which removed the earlier overlay chrome because it broke
 * dragging / mis-positioned the traffic lights).
 *
 * On **macOS** the window is `titleBarStyle: "Overlay"` with a hidden native title and a
 * fixed traffic-light position (tauri.conf.json's main window + `create_app_window`), so
 * the webview extends under the title bar and the native traffic lights float over this
 * strip. The strip paints `--surface-mantle` (continuous with the sidebar chrome) and
 * follows the light/dark theme live. It is a single `data-tauri-drag-region` element with
 * no title text and no children, so it drags the window and preserves native
 * double-click-zoom / snapping (`core:default` already grants `startDragging`, per #19).
 *
 * On **Windows/Linux** the strip is `display: none` (see the CSS Module — revealed only
 * via the macOS `data-platform` seam #363): native decorations own the caption there, and
 * their theme is synced to ReCue's via the backend's `set_theme` (lib.rs setup /
 * `set_theme_background`). So the same `<Titlebar />` renders nothing off macOS — no empty
 * band — and `.app-body` fills the window as before.
 *
 * Mounted as the first child of `.app` in `MainApp.tsx` (a `flex-direction: column`
 * container), so on macOS it reserves 30px above `.app-body`.
 *
 * NOTE: any later interactive control placed inside the strip MUST opt out of the drag
 * region with `data-tauri-drag-region={false}`, or clicks on it start a window drag.
 */
function Titlebar() {
  return <header className={styles.titlebar} data-tauri-drag-region />;
}

export default Titlebar;
