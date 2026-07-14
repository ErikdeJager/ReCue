import { describe, expect, it } from "vitest";

import {
  decideTerminalRenderer,
  isSoftwareWebGLRenderer,
} from "./webglRenderer";

describe("isSoftwareWebGLRenderer (#346)", () => {
  it("flags the known software rasterizers", () => {
    for (const soft of [
      "llvmpipe (LLVM 17.0.6, 256 bits)",
      "Mesa llvmpipe (LLVM 15.0.7, 128 bits)",
      "softpipe",
      "Google SwiftShader",
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)))",
      "lavapipe (LLVM 17.0.6)",
      "Software Rasterizer",
    ]) {
      expect(isSoftwareWebGLRenderer(soft), soft).toBe(true);
    }
  });

  it("passes real GPU renderer strings", () => {
    for (const hw of [
      "NVIDIA GeForce RTX 4070/PCIe/SSE2",
      "AMD Radeon RX 7800 XT (radeonsi, navi32, LLVM 17.0.6)",
      "Mesa Intel(R) UHD Graphics 770 (ADL-S GT1)",
      "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)",
      "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    ]) {
      expect(isSoftwareWebGLRenderer(hw), hw).toBe(false);
    }
  });

  it("treats an empty/unknown string as NOT software", () => {
    // Only skip WebGL when we know it's CPU-rendered — an unreadable renderer
    // string keeps the original GPU path.
    expect(isSoftwareWebGLRenderer("")).toBe(false);
    expect(isSoftwareWebGLRenderer("Generic Renderer")).toBe(false);
  });

  it("matches case-insensitively", () => {
    expect(isSoftwareWebGLRenderer("LLVMPIPE")).toBe(true);
    expect(isSoftwareWebGLRenderer("SOFTWARE rasterizer")).toBe(true);
  });
});

describe("decideTerminalRenderer (#357)", () => {
  const HARDWARE = "Mesa Intel(R) Graphics (RPL-P)";
  const SOFTWARE = "llvmpipe (LLVM 17.0.6, 256 bits)";

  it('"dom" always uses the DOM renderer, whatever the probe saw', () => {
    for (const renderer of [HARDWARE, SOFTWARE, "", null]) {
      const d = decideTerminalRenderer("dom", renderer);
      expect(d.webgl, String(renderer)).toBe(false);
      expect(d.reason).toBe("forced in Settings");
    }
  });

  it('"webgl" always loads the addon — the user override beats the probe', () => {
    // The point of the setting: a box whose renderer string WebKitGTK masks (or that the
    // heuristic reads wrong) can still opt back into GPU glyph rendering.
    for (const renderer of [HARDWARE, SOFTWARE, "", null]) {
      const d = decideTerminalRenderer("webgl", renderer);
      expect(d.webgl, String(renderer)).toBe(true);
      expect(d.reason).toBe("forced in Settings");
    }
  });

  it('"auto" keeps WebGL on a hardware renderer (the #346 probe, unchanged)', () => {
    for (const hw of [
      HARDWARE,
      "NVIDIA GeForce RTX 4070/PCIe/SSE2",
      "AMD Radeon RX 7800 XT (radeonsi, navi32, LLVM 17.0.6)",
      // An unreadable-but-present string is NOT software, so WebGL stands.
      "Generic Renderer",
    ]) {
      const d = decideTerminalRenderer("auto", hw);
      expect(d.webgl, hw).toBe(true);
      expect(d.reason).toBe(hw);
    }
  });

  it('"auto" falls back to DOM on a software rasterizer, naming it', () => {
    const d = decideTerminalRenderer("auto", SOFTWARE);
    expect(d.webgl).toBe(false);
    expect(d.reason).toBe(`software rasterizer: ${SOFTWARE}`);
    expect(decideTerminalRenderer("auto", "Google SwiftShader").webgl).toBe(
      false,
    );
  });

  it('"auto" falls back to DOM when there is no WebGL context at all', () => {
    const d = decideTerminalRenderer("auto", null);
    expect(d.webgl).toBe(false);
    expect(d.reason).toBe("no WebGL context");
  });
});
