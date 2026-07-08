// Pure classifier for the Linux software-WebGL fallback (#346).
//
// On Linux, WebKitGTK can hand xterm's WebGL addon a context that "works" but is
// software-rasterized (Mesa llvmpipe/softpipe/lavapipe, or SwiftShader) — every
// terminal frame then renders on the CPU, which reads as laggy input echo and slow
// paint across the whole agent wall. When the probed renderer string names a
// software rasterizer, the pool skips the WebGL addon so xterm falls back to its
// DOM renderer (the same fallback detached windows already use, #105). Kept pure
// (no DOM/xterm imports) so it's unit-testable; the one-time DOM probe lives in
// terminalPool.

/** True when a `WEBGL_debug_renderer_info` / `RENDERER` string names a software
 * rasterizer. An empty/unknown string is NOT software — WebGL is only skipped
 * when we *know* it's CPU-rendered. */
export function isSoftwareWebGLRenderer(renderer: string): boolean {
  return /llvmpipe|softpipe|swiftshader|lavapipe|software/i.test(renderer);
}
