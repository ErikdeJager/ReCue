import { describe, expect, it } from "vitest";

import {
  agentCaps,
  agentIsUntested,
  agentSupportsResume,
  SELECTABLE_AGENTS,
} from "./agents";

describe("agent capability mirror (#142)", () => {
  it("claude resumes and auto-names", () => {
    expect(agentSupportsResume("claude")).toBe(true);
    expect(agentCaps("claude").supportsAutoName).toBe(true);
  });

  it("codex does not resume or auto-name", () => {
    expect(agentSupportsResume("codex")).toBe(false);
    expect(agentCaps("codex").supportsAutoName).toBe(false);
  });

  it("opencode does not resume or auto-name", () => {
    expect(agentSupportsResume("opencode")).toBe(false);
    expect(agentCaps("opencode").supportsAutoName).toBe(false);
    expect(agentCaps("opencode").displayName).toBe("OpenCode");
  });

  it("flags codex + opencode as untested, claude as recommended", () => {
    expect(agentIsUntested("claude")).toBe(false);
    expect(agentIsUntested("codex")).toBe(true);
    expect(agentIsUntested("opencode")).toBe(true);
    // An unknown / null agent falls back to Claude → not untested.
    expect(agentIsUntested(null)).toBe(false);
  });

  it("an unknown / null / empty agent falls back to Claude (matches agent_spec)", () => {
    expect(agentCaps("nope").id).toBe("claude");
    expect(agentCaps(null).id).toBe("claude");
    expect(agentCaps(undefined).id).toBe("claude");
    expect(agentCaps("").id).toBe("claude");
  });

  it("offers claude + codex + opencode as the selectable agents, in order", () => {
    expect(SELECTABLE_AGENTS.map((a) => a.id)).toEqual([
      "claude",
      "codex",
      "opencode",
    ]);
  });
});
