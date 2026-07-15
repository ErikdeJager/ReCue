import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      "src-tauri",
      "*.config.js",
      "*.config.ts",
      // Vendored verbatim (task 377, sha256-pinned by waveEngine.test.ts) — never
      // edited, so never linted (its bare `catch (e) {}` trips no-unused-vars).
      "src/vendor/WaveEngine.js",
      // UI v2 handoff reference material (untracked/local-only), not app code.
      "docs",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // vite-env.d.ts uses a triple-slash reference by design.
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },
  {
    // Node CI/build helper scripts (#192 patchnotes-to-md) — Node globals, not browser.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
  },
  prettier,
);
