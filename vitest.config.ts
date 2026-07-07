import { defineConfig } from "vitest/config";

// Store/logic tests run in Node (no DOM needed). Component rendering tests, if
// added later, can switch to jsdom.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      // `npm run test:coverage` (v8 provider — works on Windows + macOS, no extra
      // native toolchain). Scopes coverage to the pure-logic modules we unit-test;
      // React components / IPC wiring are exercised by the app, not vitest.
      //
      // "Front end needs only logic tests — ignore UI" (#345 follow-up): the gate below
      // measures the pure-logic surface (parsers, reducers, path/time/diff/kanban/search
      // helpers, …), NOT UI/integration code. Excluded as UI: React components (`.tsx`),
      // React hooks (`use*.ts`), the Zustand store + Tauri IPC/updater/notification wiring
      // (`store.ts`/`ipc.ts`/`updater.ts`/`notify.ts`), DOM/xterm/OS-drag glue
      // (`terminalPool.ts`/`osFileDrop.ts`/`ownership.ts`/`inputProps.ts`), and dev-only
      // mock tooling (`devMock.ts`) — all exercised by the running app, not vitest.
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.d.ts",
        "src/**/*.tsx", // React components (UI) — incl. main.tsx
        "src/**/use*.ts", // React hooks (DOM/lifecycle glue)
        "src/store.ts", // Zustand store: state + Tauri IPC wiring (integration)
        "src/ipc.ts", // typed Tauri command wrappers (IPC)
        "src/updater.ts", // in-app updater IPC glue
        "src/notify.ts", // native-notification glue
        "src/devMock.ts", // dev-only mock tooling
        "src/osFileDrop.ts", // OS drag-drop window/DOM hook
        "src/ownership.ts", // session-owner hook
        "src/inputProps.ts", // input-attribute UI helper
        "src/components/Terminal/terminalPool.ts", // xterm/DOM terminal pool
      ],
      // Hard gate: the tested logic surface must stay ≥75% line coverage (enforced by
      // `npm run test:coverage` locally and the CI frontend job).
      thresholds: {
        lines: 75,
      },
    },
  },
});
