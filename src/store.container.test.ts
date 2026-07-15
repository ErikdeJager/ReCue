import { beforeEach, describe, expect, it, vi } from "vitest";

// Dev-container sessions: exercise the store's spawn actions against a mocked IPC
// layer to assert the `container` opt-in is forwarded (and stays `undefined` for
// every existing caller), plus the record→view mapping of `container_image`. Own
// ./ipc mock, isolated per-file by Vitest (the store.autoContinue.test.ts pattern).
// The fire-and-forget `refreshRepoGit()` volley the spawn actions kick off touches
// the read fns below; they resolve empty so nothing rejects unhandled.
vi.mock("./ipc", () => ({
  spawnSession: vi.fn(),
  spawnWorktreeAgent: vi.fn(),
  spawnWorktreeAgentNewBranch: vi.fn(),
  createBranch: vi.fn().mockResolvedValue(undefined),
  checkoutBranch: vi.fn().mockResolvedValue(undefined),
  currentBranches: vi.fn().mockResolvedValue({}),
  githubWebUrls: vi.fn().mockResolvedValue({}),
  diffLineCounts: vi.fn().mockResolvedValue({}),
  branchAheadBehind: vi.fn().mockResolvedValue({}),
  setSettings: vi.fn().mockResolvedValue(undefined),
}));

import * as ipc from "./ipc";
import { toSessionView, useStore } from "./store";
import type { SessionRecord } from "./types";

const m = vi.mocked;

function record(id: string, extra?: Partial<SessionRecord>): SessionRecord {
  return {
    id,
    claude_session_id: id,
    repo_path: `/repo/${id}`,
    name: null,
    created_at: 0,
    ...extra,
  };
}

beforeEach(() => {
  m(ipc.spawnSession).mockReset().mockResolvedValue(record("s1"));
  m(ipc.spawnWorktreeAgent).mockReset().mockResolvedValue(record("w1"));
  m(ipc.spawnWorktreeAgentNewBranch)
    .mockReset()
    .mockResolvedValue(record("nb1"));
});

describe("toSessionView — container_image mapping", () => {
  it("maps container_image → containerImage and defaults absent to null", () => {
    expect(
      toSessionView(record("c1", { container_image: "recue-agent:latest" }))
        .containerImage,
    ).toBe("recue-agent:latest");
    expect(toSessionView(record("h1")).containerImage).toBeNull();
    expect(
      toSessionView(record("h2", { container_image: null })).containerImage,
    ).toBeNull();
  });
});

describe("spawn actions — the dev-container opt-in is forwarded", () => {
  it("spawnSession forwards container=true as the 5th ipc arg", async () => {
    await useStore
      .getState()
      .spawnSession("/repo/a", undefined, undefined, true);
    expect(ipc.spawnSession).toHaveBeenCalledWith(
      "/repo/a",
      undefined,
      undefined,
      "claude",
      true,
    );
  });

  it("spawnSession omits container for existing callers (undefined, not false)", async () => {
    await useStore.getState().spawnSession("/repo/a");
    expect(ipc.spawnSession).toHaveBeenCalledWith(
      "/repo/a",
      undefined,
      undefined,
      "claude",
      undefined,
    );
  });

  it("spawnWorktreeSession forwards container=true", async () => {
    await useStore.getState().spawnWorktreeSession("/repo/a", "feat", true);
    expect(ipc.spawnWorktreeAgent).toHaveBeenCalledWith(
      "/repo/a",
      "feat",
      "claude",
      true,
    );
  });

  it("createBranchSession creates the branch, then spawns with the flag", async () => {
    const result = await useStore
      .getState()
      .createBranchSession("/repo/a", "feat", "main", true);
    expect(result).toBe(true);
    expect(ipc.createBranch).toHaveBeenCalledWith("/repo/a", "feat", "main");
    expect(ipc.spawnSession).toHaveBeenCalledWith(
      "/repo/a",
      undefined,
      undefined,
      "claude",
      true,
    );
  });

  it("createBranchWorktreeSession forwards container=true", async () => {
    const result = await useStore
      .getState()
      .createBranchWorktreeSession("/repo/a", "feat", "main", true);
    expect(result).toBe(true);
    expect(ipc.spawnWorktreeAgentNewBranch).toHaveBeenCalledWith(
      "/repo/a",
      "feat",
      "main",
      "claude",
      true,
    );
  });

  it("a container spawn's record lands in the store with its badge field", async () => {
    m(ipc.spawnSession).mockResolvedValue(
      record("c9", { container_image: "recue-agent:latest" }),
    );
    await useStore
      .getState()
      .spawnSession("/repo/a", undefined, undefined, true);
    const session = useStore.getState().sessions.find((s) => s.id === "c9");
    expect(session?.containerImage).toBe("recue-agent:latest");
  });
});
