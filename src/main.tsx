import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles/tokens.css";
import "./styles/global.css";
import App from "./App";

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
