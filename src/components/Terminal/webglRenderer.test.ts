import { describe, expect, it } from "vitest";

import { isSoftwareWebGLRenderer } from "./webglRenderer";

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
