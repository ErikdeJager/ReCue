import styles from "./Titlebar.module.css";

/**
 * Custom 38px window chrome.
 *
 * The native macOS traffic lights are kept and overlaid on the left via
 * `titleBarStyle: "Overlay"` + `trafficLightPosition` (configured in
 * tauri.conf.json); this bar supplies the drag region and the centered title.
 *
 * The whole bar is a `data-tauri-drag-region`. Any interactive control added
 * here later must opt out (e.g. `data-tauri-drag-region={false}`) so it stays
 * clickable instead of dragging the window.
 */
function Titlebar() {
  return (
    <header className={styles.titlebar} data-tauri-drag-region>
      <span className={styles.title}>ClaudeCue</span>
    </header>
  );
}

export default Titlebar;
