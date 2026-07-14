import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/atoms.css";
import "./styles/menu.css";
import { applyPlatformAttribute, detectPlatform } from "./platform";
import App from "./App";

// Platform-CSS seam (#363, retained by UI v2 task 372): tag <html> with the OS family
// BEFORE the first render, so any platform-conditional CSS is already in effect on the
// very first painted frame (the backend platform() signal is an async IPC — too late).
// Runs in the main window AND in a detached canvas window (#84), which load the same
// entry. The store re-applies the authoritative backend value once it lands. Its old
// --ui consumer (the Linux-only Inter override) is retired — JetBrains Mono is the UI
// face on every OS — but the attribute stays as the seam for platform-conditional CSS.
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
