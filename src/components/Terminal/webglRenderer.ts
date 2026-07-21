// Pure classifiers for the terminal renderer choice: the Linux software-WebGL
// fallback (#346/#347) and, since task 453, the cross-platform Settings override.
//
// On Linux, WebKitGTK can hand xterm's WebGL addon a context that "works" but is
// software-rasterized (Mesa llvmpipe/softpipe/lavapipe, or SwiftShader) — every
// terminal frame then renders on the CPU, which reads as laggy input echo and slow
// paint across the whole agent wall. When the probed renderer string names a
// software rasterizer, the pool skips the WebGL addon so xterm falls back to its
// DOM renderer (the same fallback detached windows already used, #105). Kept pure
// (no DOM/xterm imports) so it's unit-testable; the one-time DOM probe lives in
// terminalPool — and it stays **Linux-only**: macOS/Windows never construct the
// probe canvas (task 453 broadens only the *mode*, not the probe).
//
// This is a **fail-safe**, not a policy: it reacts to whatever GL the webview ended up
// with. Its main *cause* of firing was #346's own DMA-BUF workaround (disabling DMA-BUF
// drops the webview — and thus its WebGL — to CPU rendering), which #347 stops applying
// on healthy/hybrid Mesa boxes. So on a correctly-detected machine the probe now reads a
// hardware renderer ("Mesa Intel(R) Graphics …") and WebGL is used again; the check stays
// for the stacks that genuinely land on llvmpipe.

/** True when a `WEBGL_debug_renderer_info` / `RENDERER` string names a software
 * rasterizer. An empty/unknown string is NOT software — WebGL is only skipped
 * when we *know* it's CPU-rendered. */
export function isSoftwareWebGLRenderer(renderer: string): boolean {
  return /llvmpipe|softpipe|swiftshader|lavapipe|software/i.test(renderer);
}

/** The persisted Settings → Rendering terminal-renderer mode (#357; cross-platform
 * since task 453 — the persisted key is still named `linuxTerminalRenderer` for blob
 * compatibility): `"auto"` runs the probe above on Linux (and keeps WebGL, no probe, on
 * macOS/Windows), `"webgl"` / `"dom"` override it on every OS. Mirrors the TS
 * `Settings.linuxTerminalRenderer` union. */
export type TerminalRendererMode = "auto" | "webgl" | "dom";

/** Which xterm renderer to use, and a human reason for the Settings readout + the
 * one-time console diagnostic. */
export interface TerminalRendererDecision {
  /** Load xterm's `WebglAddon`? (false ⇒ its DOM renderer.) */
  webgl: boolean;
  /** Why — e.g. `"forced in Settings"`, `"software rasterizer: llvmpipe (…)"`. */
  reason: string;
}

/**
 * Resolve the terminal renderer (#357). Pure: the caller supplies the already-probed
 * renderer string (`null` when there is no WebGL context at all).
 *
 * The **user override wins over the probe** — a box whose renderer string WebKitGTK masks,
 * or that the heuristic reads wrong, is exactly why this setting exists (Tauri's own
 * Linux-graphics guidance recommends shipping the switch). `"auto"` is unchanged #346
 * behavior: no WebGL context, or a software rasterizer (llvmpipe/SwiftShader), ⇒ the DOM
 * renderer, which beats CPU-rendered GL.
 */
export function decideTerminalRenderer(
  mode: TerminalRendererMode,
  renderer: string | null,
): TerminalRendererDecision {
  if (mode === "webgl") return { webgl: true, reason: "forced in Settings" };
  if (mode === "dom") return { webgl: false, reason: "forced in Settings" };
  if (renderer === null) return { webgl: false, reason: "no WebGL context" };
  if (isSoftwareWebGLRenderer(renderer))
    return { webgl: false, reason: `software rasterizer: ${renderer}` };
  return { webgl: true, reason: renderer };
}

/** Cross-platform resolution (task 453): the forced modes win on every OS; "auto"
 * keeps WebGL on macOS/Windows WITHOUT a probe (the pre-453 short-circuit — the
 * probe canvas is never constructed off Linux), and on Linux defers to the #346/#357
 * decideTerminalRenderer over the probed renderer string. `renderer` is only
 * meaningful when `linux` is true; callers pass null otherwise. */
export function decideTerminalRendererForPlatform(
  linux: boolean,
  mode: TerminalRendererMode,
  renderer: string | null,
): TerminalRendererDecision {
  if (!linux) {
    if (mode === "webgl") return { webgl: true, reason: "forced in Settings" };
    if (mode === "dom") return { webgl: false, reason: "forced in Settings" };
    return { webgl: true, reason: "GPU renderer" };
  }
  return decideTerminalRenderer(mode, renderer);
}
