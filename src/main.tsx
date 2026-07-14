import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles/fonts.css"; // bundled Inter Variable (latin) — the Linux UI font (#363)
import "./styles/tokens.css";
import "./styles/global.css";
import { applyPlatformAttribute, detectPlatform } from "./platform";
import App from "./App";

// Linux UI font (#363): tag <html> with the OS family BEFORE the first render, so the
// `:root[data-platform="linux"]` --ui override in tokens.css is already in effect on the
// very first painted frame (the backend platform() signal is an async IPC — too late, it
// would flip the font mid-boot). Runs in the main window AND in a detached canvas window
// (#84), which load the same entry. The store re-applies the authoritative backend value
// once it lands. On macOS/Windows this only records the platform — --ui is unchanged, and
// the bundled woff2 is never fetched (no element resolves to "Inter Variable").
applyPlatformAttribute(detectPlatform(navigator.userAgent, navigator.platform));

// Dev-only update mock (#193): registers `window.__recue` so the update UI can be
// exercised without a real release. The `import.meta.env.DEV` guard + dynamic import
// let Vite tree-shake the mock module out of a production build.
if (import.meta.env.DEV) {
  void import("./devMock").then((m) => m.registerDevMock());
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
