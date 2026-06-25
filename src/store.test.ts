import { beforeEach, describe, expect, it, vi } from "vitest";

import { collectLeaves } from "./components/Canvas/canvasTree";
import {
  accentCompanions,
  adjacentSessionId,
  dedupeBranchLabels,
  isCleanExit,
  mergeRepoOrder,
  REPO_PALETTE,
  repoColor,
  repoOrder,
  useStore,
} from "./store";
import type { CanvasContent, CanvasNode, SessionView } from "./types";

function session(id: string): SessionView {
  return {
    id,
    claudeSessionId: id,
    repoPath: `/repo/${id}`,
    name: null,
    createdAt: 0,
  };
}

describe("accentCompanions (#107)", () => {
  it("derives --accent-dim as the accent at 0.14 alpha", () => {
    // Peach default = rgb(250, 179, 135).
    expect(accentCompanions("#fab387").dim).toBe("rgba(250, 179, 135, 0.14)");
  });

  it("uses a dark fg + a valid lighter hover for every (light pastel) palette color", () => {
    for (const hex of REPO_PALETTE) {
      const c = accentCompanions(hex);
      expect(c.fg).toBe("#11111b"); // all REPO_PALETTE swatches are light pastels
      expect(c.hover).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("uses a light fg on a dark accent", () => {
    expect(accentCompanions("#1e1e2e").fg).toBe("#ffffff");
  });

  it("falls back for an unparseable hex", () => {
    expect(accentCompanions("nope")).toEqual({
      hover: "nope",
      dim: "nope",
      fg: "#11111b",
    });
  });
});

beforeEach(() => {
  vi.useRealTimers();
  useStore.setState({
    sessions: [],
    selectedId: null,
    view: "overview",
    overviewRepoFilter: null,
    recents: [],
    branches: {},
    repoColors: {},
    overviewPanels: {},
    overviewOrder: {},
    canvases: [{ id: "canvas-1", name: "Canvas 1", layout: null }],
    activeCanvasId: "canvas-1",
    liftedLeaf: null,
    maximizedItem: null,
    canvasTemplates: [],
    sessionBusy: {},
    sessionActive: {},
    claudeMissing: false,
    toasts: [],
    newSessionOpen: false,
    newSessionRepo: null,
  });
});

describe("app store", () => {
  it("switches the view", () => {
    useStore.getState().setView("canvas");
    expect(useStore.getState().view).toBe("canvas");
  });

  it("selecting a session highlights it without changing the view (#22)", () => {
    expect(useStore.getState().view).toBe("overview");
    useStore.getState().select("abc");
    expect(useStore.getState().selectedId).toBe("abc");
    // Selection is decoupled from the view — it must not force Focus.
    expect(useStore.getState().view).toBe("overview");
  });

  it("toggles the sidebar collapsed flag (#168)", () => {
    // Defaults to expanded; the footer chevron / ⌘B toggle it.
    expect(useStore.getState().sidebarCollapsed).toBe(false);
    useStore.getState().toggleSidebarCollapsed();
    expect(useStore.getState().sidebarCollapsed).toBe(true);
    useStore.getState().setSidebarCollapsed(false);
    expect(useStore.getState().sidebarCollapsed).toBe(false);
    // A redundant set is a no-op (same value).
    useStore.getState().setSidebarCollapsed(false);
    expect(useStore.getState().sidebarCollapsed).toBe(false);
  });

  it("markConnected clears the boot reconnecting flag (#30)", () => {
    useStore.setState({ sessions: [{ ...session("s1"), reconnecting: true }] });
    useStore.getState().markConnected("s1");
    expect(useStore.getState().sessions[0]?.reconnecting).toBe(false);
  });

  it("markExited clears reconnecting and records the exit code", () => {
    useStore.setState({ sessions: [{ ...session("s1"), reconnecting: true }] });
    useStore.getState().markExited("s1", 1);
    expect(useStore.getState().sessions[0]?.reconnecting).toBe(false);
    expect(useStore.getState().sessions[0]?.exitedCode).toBe(1);
  });

  it("setBusy tracks and clears a session's working state (#42)", () => {
    useStore.getState().setBusy("s1", true);
    expect(useStore.getState().sessionBusy.s1).toBe(true);
    // Idle deletes the key rather than storing false.
    useStore.getState().setBusy("s1", false);
    expect(useStore.getState().sessionBusy.s1).toBeUndefined();
    // A redundant update keeps the same map reference (no needless re-render).
    useStore.getState().setBusy("s2", true);
    const ref = useStore.getState().sessionBusy;
    useStore.getState().setBusy("s2", true);
    expect(useStore.getState().sessionBusy).toBe(ref);
  });

  it("tracks 'has been active' for the third yellow/settled state (#112)", () => {
    // Fresh: never active → gray (no flag).
    expect(useStore.getState().sessionActive.s1).toBeUndefined();
    // First activity (busy) sets the flag → blue while working.
    useStore.getState().setBusy("s1", true);
    expect(useStore.getState().sessionBusy.s1).toBe(true);
    expect(useStore.getState().sessionActive.s1).toBe(true);
    // Going idle clears busy but KEEPS the active flag → yellow "settled".
    useStore.getState().setBusy("s1", false);
    expect(useStore.getState().sessionBusy.s1).toBeUndefined();
    expect(useStore.getState().sessionActive.s1).toBe(true);
    // Going busy again leaves yellow (blue) and the flag stays set.
    useStore.getState().setBusy("s1", true);
    expect(useStore.getState().sessionActive.s1).toBe(true);
    // Removing the session clears both per-session flags.
    useStore.setState({ sessions: [session("s1")] });
    useStore.getState().dropSession("s1");
    expect(useStore.getState().sessionActive.s1).toBeUndefined();
    expect(useStore.getState().sessionBusy.s1).toBeUndefined();
  });

  it("markExited clears a busy flag (an exited session isn't working) (#42)", () => {
    useStore.setState({ sessions: [session("s1")], sessionBusy: { s1: true } });
    useStore.getState().markExited("s1", 0);
    expect(useStore.getState().sessionBusy.s1).toBeUndefined();
  });

  it("setOverviewRepoFilter toggles, switches, and clears (#34)", () => {
    useStore.getState().setOverviewRepoFilter("/repo/x");
    expect(useStore.getState().overviewRepoFilter).toBe("/repo/x");
    // clicking the active repo clears it
    useStore.getState().setOverviewRepoFilter("/repo/x");
    expect(useStore.getState().overviewRepoFilter).toBeNull();
    // another repo sets it; null is "Show all"
    useStore.getState().setOverviewRepoFilter("/repo/y");
    expect(useStore.getState().overviewRepoFilter).toBe("/repo/y");
    useStore.getState().setOverviewRepoFilter(null);
    expect(useStore.getState().overviewRepoFilter).toBeNull();
  });

  it("forgetRepo drops the repo's sessions + recent, selection, and filter (#31/#34)", async () => {
    useStore.setState({
      sessions: [
        { ...session("a"), repoPath: "/repo/x" },
        { ...session("b"), repoPath: "/repo/y" },
      ],
      recents: ["/repo/x", "/repo/y"],
      selectedId: "a",
      view: "canvas",
      overviewRepoFilter: "/repo/x",
    });
    // ipc calls reject without a Tauri host and are caught; the state update runs.
    await useStore.getState().forgetRepo("/repo/x");
    expect(useStore.getState().sessions.map((s) => s.id)).toEqual(["b"]);
    expect(useStore.getState().recents).toEqual(["/repo/y"]);
    expect(useStore.getState().selectedId).toBeNull();
    expect(useStore.getState().view).toBe("overview");
    expect(useStore.getState().overviewRepoFilter).toBeNull();
  });

  it("upserts (de-duplicating by id) and drops sessions, fixing selection", () => {
    useStore.getState().upsertSession(session("s1"));
    useStore.getState().upsertSession(session("s1"));
    useStore.getState().select("s1");
    useStore.getState().setView("canvas"); // simulate viewing s1 in a canvas
    expect(useStore.getState().sessions).toHaveLength(1);

    useStore.getState().dropSession("s1");
    expect(useStore.getState().sessions).toHaveLength(0);
    expect(useStore.getState().selectedId).toBeNull();
    // Removing the selected session returns to Overview (#75).
    expect(useStore.getState().view).toBe("overview");
  });

  it("marks a session as exited, then running again (restart)", () => {
    useStore.getState().upsertSession(session("s1"));
    useStore.getState().markExited("s1", 0);
    expect(useStore.getState().sessions[0]?.exitedCode).toBe(0);
    useStore.getState().markRunning("s1");
    expect(useStore.getState().sessions[0]?.exitedCode).toBeUndefined();
  });

  it("forgetExitedSession drops a clean-exited agent + toasts 'Agent exited' (#63)", async () => {
    useStore.setState({
      sessions: [session("s1"), session("s2")],
      selectedId: "s1",
      view: "canvas",
    });
    // ipc.killSession rejects without a Tauri host and is caught; the local
    // forget still runs (kill + forget locally regardless).
    await useStore.getState().forgetExitedSession("s1");
    expect(useStore.getState().sessions.map((s) => s.id)).toEqual(["s2"]);
    // The selected agent vanishing returns to Overview (#75).
    expect(useStore.getState().selectedId).toBeNull();
    expect(useStore.getState().view).toBe("overview");
    expect(useStore.getState().toasts.map((t) => t.message)).toContain(
      "Agent exited",
    );
  });

  it("restartSession resolves false (and toasts an error) when resume fails (#63)", async () => {
    useStore.setState({ sessions: [{ ...session("s1"), exitedCode: 1 }] });
    // No Tauri host → ipc.resumeSession rejects → the action reports failure so
    // the caller skips the terminal reset; the session stays exited.
    const ok = await useStore.getState().restartSession("s1");
    expect(ok).toBe(false);
    expect(useStore.getState().sessions[0]?.exitedCode).toBe(1);
    expect(useStore.getState().toasts.at(-1)?.tone).toBe("error");
  });

  it("sets the claude-missing flag", () => {
    useStore.getState().setClaudeMissing(true);
    expect(useStore.getState().claudeMissing).toBe(true);
  });

  it("pushes a toast that auto-dismisses", () => {
    vi.useFakeTimers();
    const id = useStore.getState().pushToast("hello");
    expect(useStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(4000);
    expect(useStore.getState().toasts.find((t) => t.id === id)).toBeUndefined();
  });

  it("dismisses a toast manually", () => {
    const id = useStore.getState().pushToast("hello");
    useStore.getState().dismissToast(id);
    expect(useStore.getState().toasts).toHaveLength(0);
  });

  it("opens and closes the new-session modal with an optional repo", () => {
    useStore.getState().openNewSession("/repo/a");
    expect(useStore.getState().newSessionOpen).toBe(true);
    expect(useStore.getState().newSessionRepo).toBe("/repo/a");
    useStore.getState().closeNewSession();
    expect(useStore.getState().newSessionOpen).toBe(false);
    expect(useStore.getState().newSessionRepo).toBeNull();
  });
});

describe("repoOrder", () => {
  it("sorts groups alphabetically by repo name, not by recents order", () => {
    const recents = ["/repo/zeta", "/repo/alpha"]; // recent-first, non-alphabetical
    const sessions = [{ ...session("s1"), repoPath: "/repo/mid" }];
    expect(repoOrder(recents, sessions)).toEqual([
      "/repo/alpha",
      "/repo/mid",
      "/repo/zeta",
    ]);
  });

  it("de-duplicates repos shared by recents and sessions", () => {
    const sessions = [{ ...session("s1"), repoPath: "/repo/a" }];
    expect(repoOrder(["/repo/a"], sessions)).toEqual(["/repo/a"]);
  });

  it("is stable regardless of spawn/recents order (no reorder on new agent)", () => {
    expect(repoOrder(["/repo/b", "/repo/a"], [])).toEqual(
      repoOrder(["/repo/a", "/repo/b"], []),
    );
    expect(repoOrder(["/repo/b", "/repo/a"], [])).toEqual([
      "/repo/a",
      "/repo/b",
    ]);
  });

  it("orders case-insensitively and breaks name ties on the full path", () => {
    // Names apple / Banana / Cherry -> case-insensitive alphabetical.
    expect(repoOrder(["/x/Banana", "/z/Cherry", "/y/apple"], [])).toEqual([
      "/y/apple",
      "/x/Banana",
      "/z/Cherry",
    ]);
    // Same displayed name "app" -> deterministic tiebreak on the full path.
    expect(repoOrder(["/two/app", "/one/app"], [])).toEqual([
      "/one/app",
      "/two/app",
    ]);
  });
});

describe("dedupeBranchLabels", () => {
  it("indexes repeated labels, leaving the first bare", () => {
    expect(dedupeBranchLabels(["main", "main", "main"])).toEqual([
      "main",
      "main (2)",
      "main (3)",
    ]);
  });

  it("leaves distinct labels untouched", () => {
    expect(dedupeBranchLabels(["main", "dev"])).toEqual(["main", "dev"]);
  });

  it("indexes each label group independently, preserving order", () => {
    expect(dedupeBranchLabels(["main", "dev", "main"])).toEqual([
      "main",
      "dev",
      "main (2)",
    ]);
  });

  it("returns an empty array for no sessions", () => {
    expect(dedupeBranchLabels([])).toEqual([]);
  });
});

describe("overview panels (#38)", () => {
  const panels = [
    { id: "p1", kind: "diff" as const },
    { id: "p2", kind: "markdown" as const, file: "a.md" },
    { id: "p3", kind: "markdown" as const, file: "b.md" },
  ];

  it("removes a panel and drops the repo entry when empty", async () => {
    useStore.setState({ overviewPanels: { "/repo/a": [...panels] } });
    await useStore.getState().removeOverviewPanel("/repo/a", "p2");
    expect(
      useStore.getState().overviewPanels["/repo/a"]?.map((p) => p.id),
    ).toEqual(["p1", "p3"]);
    await useStore.getState().removeOverviewPanel("/repo/a", "p1");
    await useStore.getState().removeOverviewPanel("/repo/a", "p3");
    expect(useStore.getState().overviewPanels["/repo/a"]).toBeUndefined();
  });

  it("reorderOverview persists a repo cluster's drag order (#43)", async () => {
    await useStore.getState().reorderOverview("/repo/a", ["s2", "p1", "s1"]);
    expect(useStore.getState().overviewOrder["/repo/a"]).toEqual([
      "s2",
      "p1",
      "s1",
    ]);
  });
});

describe("repo items — overviewPanels as the single source (#59)", () => {
  it("addOverviewPanel dedups: one diff per repo, one markdown per file", async () => {
    const add = () => useStore.getState().addOverviewPanel;
    await add()("/repo/a", "markdown", "docs/x.md");
    await add()("/repo/a", "markdown", "docs/x.md"); // dup file → no-op
    await add()("/repo/a", "diff");
    await add()("/repo/a", "diff"); // dup diff → no-op
    await add()("/repo/a", "markdown", "docs/y.md");

    const items = useStore.getState().overviewPanels["/repo/a"] ?? [];
    expect(items.filter((p) => p.kind === "diff")).toHaveLength(1);
    expect(
      items.filter((p) => p.kind === "markdown").map((p) => p.file),
    ).toEqual(["docs/x.md", "docs/y.md"]);
  });

  it("addOverviewPanel adds a kanban board, deduped by file (#142)", async () => {
    const add = () => useStore.getState().addOverviewPanel;
    await add()("/repo/a", "kanban", "board.md");
    await add()("/repo/a", "kanban", "board.md"); // dup file → no-op
    await add()("/repo/a", "kanban", "other.md");
    // A markdown file viewer of the same path is a distinct panel kind.
    await add()("/repo/a", "markdown", "board.md");

    const items = useStore.getState().overviewPanels["/repo/a"] ?? [];
    expect(items.filter((p) => p.kind === "kanban").map((p) => p.file)).toEqual(
      ["board.md", "other.md"],
    );
    expect(items.filter((p) => p.kind === "markdown")).toHaveLength(1);
  });

  it("removeOverviewPanel drops the item (and its repo entry when empty)", async () => {
    await useStore.getState().addOverviewPanel("/repo/a", "markdown", "z.md");
    const id = useStore.getState().overviewPanels["/repo/a"]?.[0]?.id ?? "";
    await useStore.getState().removeOverviewPanel("/repo/a", id);
    expect(useStore.getState().overviewPanels["/repo/a"]).toBeUndefined();
  });
});

describe("action toasts (#83)", () => {
  const lastToast = () => {
    const { toasts } = useStore.getState();
    return toasts[toasts.length - 1]?.message;
  };

  it("addOverviewPanel toasts 'Opened …'; a deduped re-add toasts 'Already open'", async () => {
    const add = useStore.getState().addOverviewPanel;
    await add("/repo/a", "diff");
    expect(lastToast()).toBe("Opened diff viewer");
    await add("/repo/a", "markdown", "docs/readme.md");
    expect(lastToast()).toBe("Opened readme.md"); // basename, not the full path
    await add("/repo/a", "diff"); // dup diff → no second "Opened"
    expect(lastToast()).toBe("Already open");
    const opened = useStore
      .getState()
      .toasts.filter((t) => t.message.startsWith("Opened "));
    expect(opened).toHaveLength(2);
  });

  it("removeOverviewPanel toasts a kind-aware 'Closed …'", async () => {
    await useStore
      .getState()
      .addOverviewPanel("/repo/a", "markdown", "src/main.ts");
    const id = useStore.getState().overviewPanels["/repo/a"]?.[0]?.id ?? "";
    await useStore.getState().removeOverviewPanel("/repo/a", id);
    expect(lastToast()).toBe("Closed main.ts");
  });

  it("canvas add / rename / close each toast; a no-op rename doesn't", () => {
    const s = () => useStore.getState();
    s().addCanvas();
    expect(lastToast()).toBe("Canvas created");
    const canvases = s().canvases;
    const created = canvases[canvases.length - 1];
    const cid = created?.id ?? "";
    s().renameCanvas(cid, created?.name ?? ""); // unchanged → no toast
    expect(lastToast()).toBe("Canvas created");
    s().renameCanvas(cid, "Renamed");
    expect(lastToast()).toBe("Canvas renamed");
    s().closeCanvas(cid);
    expect(lastToast()).toBe("Canvas closed");
  });
});

describe("mergeRepoOrder (#43)", () => {
  it("keeps the saved order for present items", () => {
    expect(mergeRepoOrder(["b", "a", "c"], ["a", "b", "c"])).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("appends present items missing from the saved order (new agents)", () => {
    // saved had a, c; b and d are new → appended in their default order.
    expect(mergeRepoOrder(["c", "a"], ["a", "b", "c", "d"])).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });

  it("drops saved keys no longer present (closed items)", () => {
    expect(mergeRepoOrder(["a", "gone", "b"], ["b", "a"])).toEqual(["a", "b"]);
  });

  it("returns the default order when nothing was saved", () => {
    expect(mergeRepoOrder([], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });
});

describe("repoColor", () => {
  it("returns the assigned color when set", () => {
    expect(repoColor("/repo/a", { "/repo/a": "#abcdef" })).toBe("#abcdef");
  });

  it("derives a stable palette default when unassigned (#35)", () => {
    const c = repoColor("/repo/a", {});
    expect(REPO_PALETTE).toContain(c);
    expect(repoColor("/repo/a", {})).toBe(c); // stable across calls
  });
});

describe("adjacentSessionId", () => {
  const ss = [session("a"), session("b"), session("c")];

  it("returns null when there are no sessions", () => {
    expect(adjacentSessionId([], null, 1)).toBeNull();
    expect(adjacentSessionId([], "a", -1)).toBeNull();
  });

  it("selects the first when nothing is selected or the id is unknown", () => {
    expect(adjacentSessionId(ss, null, 1)).toBe("a");
    expect(adjacentSessionId(ss, null, -1)).toBe("a");
    expect(adjacentSessionId(ss, "zzz", 1)).toBe("a");
  });

  it("moves to the next / previous in order", () => {
    expect(adjacentSessionId(ss, "a", 1)).toBe("b");
    expect(adjacentSessionId(ss, "b", 1)).toBe("c");
    expect(adjacentSessionId(ss, "b", -1)).toBe("a");
  });

  it("wraps around at the ends", () => {
    expect(adjacentSessionId(ss, "c", 1)).toBe("a"); // last -> first
    expect(adjacentSessionId(ss, "a", -1)).toBe("c"); // first -> last
  });

  it("stays on the only session when there is one", () => {
    expect(adjacentSessionId([session("solo")], "solo", 1)).toBe("solo");
    expect(adjacentSessionId([session("solo")], "solo", -1)).toBe("solo");
  });
});

describe("isCleanExit (#63)", () => {
  it("treats code 0 while running (not intentional) as a clean exit → forget", () => {
    expect(isCleanExit(0, false, false)).toBe(true);
  });

  it("keeps non-zero / unknown exits as a recoverable overlay (not clean)", () => {
    expect(isCleanExit(1, false, false)).toBe(false);
    expect(isCleanExit(137, false, false)).toBe(false);
    expect(isCleanExit(null, false, false)).toBe(false);
  });

  it("never auto-forgets during the boot resume window (#30)", () => {
    // A code-0 exit while booting keeps the overlay + Restart instead of vanishing.
    expect(isCleanExit(0, true, false)).toBe(false);
  });

  it("never auto-forgets an intentional kill (Remove/Forget toasts on its own)", () => {
    expect(isCleanExit(0, false, true)).toBe(false);
  });
});

describe("canvas templates (#117)", () => {
  it("saveTemplate creates a new template and returns its id", () => {
    const id = useStore.getState().saveTemplate("Dev workspace", null);
    const templates = useStore.getState().canvasTemplates;
    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({ id, name: "Dev workspace" });
  });

  it("saveTemplate with an existing id updates in place (no new record)", () => {
    const id = useStore.getState().saveTemplate("First", null);
    const layout = {
      type: "leaf" as const,
      id: "leaf-1",
      content: { kind: "new-agent" },
    };
    const sameId = useStore
      .getState()
      .saveTemplate("First (edited)", layout, id);
    expect(sameId).toBe(id);
    const templates = useStore.getState().canvasTemplates;
    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({
      id,
      name: "First (edited)",
      layout,
    });
  });

  it("blank name falls back to a placeholder", () => {
    useStore.getState().saveTemplate("   ", null);
    expect(useStore.getState().canvasTemplates[0]?.name).toBe(
      "Untitled template",
    );
  });

  it("renameTemplate updates the name; blank is ignored", () => {
    const id = useStore.getState().saveTemplate("Old", null);
    useStore.getState().renameTemplate(id, "New");
    expect(useStore.getState().canvasTemplates[0]?.name).toBe("New");
    useStore.getState().renameTemplate(id, "  ");
    expect(useStore.getState().canvasTemplates[0]?.name).toBe("New");
  });

  it("duplicateTemplate appends a copy with an independent layout", () => {
    const layout = {
      type: "leaf" as const,
      id: "leaf-1",
      content: { kind: "open-file", file: "README.md" },
    };
    const id = useStore.getState().saveTemplate("Base", layout, null);
    useStore.getState().duplicateTemplate(id);
    const templates = useStore.getState().canvasTemplates;
    expect(templates).toHaveLength(2);
    expect(templates[1]?.name).toBe("Base copy");
    // The copy's layout is a deep clone, not the same object reference.
    expect(templates[1]?.layout).not.toBe(templates[0]?.layout);
    expect(templates[1]?.layout).toEqual(templates[0]?.layout);
  });

  it("deleteTemplate removes the template", () => {
    const id = useStore.getState().saveTemplate("Gone", null);
    useStore.getState().deleteTemplate(id);
    expect(useStore.getState().canvasTemplates).toEqual([]);
  });

  it("openTemplateEditor / close toggle the editor flags", () => {
    useStore.getState().openTemplateEditor("t1");
    expect(useStore.getState().templateEditorOpen).toBe(true);
    expect(useStore.getState().templateEditorId).toBe("t1");
    expect(useStore.getState().templateManagerOpen).toBe(false);
    useStore.getState().closeTemplateEditor();
    expect(useStore.getState().templateEditorOpen).toBe(false);
    expect(useStore.getState().templateEditorId).toBe(null);
  });
});

describe("canvas template instantiation (#118)", () => {
  const pendingTab = (block: { kind: string; file?: string }): CanvasNode => ({
    type: "leaf",
    id: "L",
    content: { kind: "pending", repoPath: "/repo/x", block },
  });

  it("useTemplate replaces a sole empty canvas in place (pending panels), switches to Canvas (#142)", () => {
    const layout: CanvasNode = {
      type: "leaf",
      id: "lt",
      content: { kind: "new-terminal" },
    };
    const id = useStore.getState().saveTemplate("Term", layout, null);
    // beforeEach seeds a single empty "Canvas 1" → the template replaces it in
    // place (no leftover empty tab) rather than appending (#142).
    useStore.getState().useTemplate(id, "/repo/x");
    const s = useStore.getState();
    expect(s.canvases.length).toBe(1);
    expect(s.view).toBe("canvas");
    const tab = s.canvases[0];
    expect(tab?.name).toBe("Term");
    expect(s.activeCanvasId).toBe(tab?.id);
    // The leaf opens as a pending panel bound to the chosen folder (resolution is
    // async + rejects host-less, but the tab opens immediately).
    const leaf = collectLeaves(tab?.layout ?? null)[0];
    expect(leaf?.content.kind).toBe("pending");
    expect(leaf?.content.block).toEqual({ kind: "new-terminal" });
    expect(leaf?.content.repoPath).toBe("/repo/x");
  });

  it("useTemplate appends (removes nothing) when 2+ canvases exist (#142)", () => {
    const layout: CanvasNode = {
      type: "leaf",
      id: "lt",
      content: { kind: "new-terminal" },
    };
    const id = useStore.getState().saveTemplate("Term", layout, null);
    // 2+ canvases — even though both are empty, always append and remove none.
    useStore.setState({
      canvases: [
        { id: "c1", name: "Canvas 1", layout: null },
        { id: "c2", name: "Canvas 2", layout: null },
      ],
      activeCanvasId: "c1",
    });
    useStore.getState().useTemplate(id, "/repo/x");
    const s = useStore.getState();
    expect(s.canvases.length).toBe(3);
    expect(s.canvases.map((c) => c.id)).toEqual([
      "c1",
      "c2",
      expect.any(String),
    ]);
    const tab = s.canvases[2];
    expect(tab?.name).toBe("Term");
    expect(s.activeCanvasId).toBe(tab?.id);
  });

  it("useTemplate appends when the sole canvas has panels (#142)", () => {
    const layout: CanvasNode = {
      type: "leaf",
      id: "lt",
      content: { kind: "new-terminal" },
    };
    const id = useStore.getState().saveTemplate("Term", layout, null);
    // A single canvas that HAS panels survives — append beside it.
    useStore.setState({
      canvases: [
        {
          id: "c1",
          name: "Canvas 1",
          layout: pendingTab({ kind: "new-terminal" }),
        },
      ],
      activeCanvasId: "c1",
    });
    useStore.getState().useTemplate(id, "/repo/x");
    const s = useStore.getState();
    expect(s.canvases.length).toBe(2);
    expect(s.canvases[0]?.id).toBe("c1");
    const tab = s.canvases[1];
    expect(tab?.name).toBe("Term");
    expect(s.activeCanvasId).toBe(tab?.id);
  });

  it("resolveTemplateBlock sets an inline error when a block can't resolve", async () => {
    useStore.setState({
      canvases: [
        { id: "c1", name: "T", layout: pendingTab({ kind: "open-diff" }) },
      ],
      activeCanvasId: "c1",
    });
    // Host-less: ipc.isGitRepo rejects → the panel records an inline error and
    // RETAINS its block so Retry can re-run it.
    await useStore.getState().resolveTemplateBlock("c1", "L");
    const leaf = collectLeaves(
      useStore.getState().canvases[0]?.layout ?? null,
    )[0];
    expect(leaf?.content.kind).toBe("pending");
    expect(leaf?.content.error).toBeTruthy();
    expect(leaf?.content.block).toEqual({ kind: "open-diff" });
  });

  it("pickTemplateBlockFile replaces the pending block's relative path", () => {
    useStore.setState({
      canvases: [
        {
          id: "c1",
          name: "T",
          layout: pendingTab({ kind: "open-file", file: "missing.md" }),
        },
      ],
      activeCanvasId: "c1",
    });
    useStore.getState().pickTemplateBlockFile("c1", "L", "README.md");
    const leaf = collectLeaves(
      useStore.getState().canvases[0]?.layout ?? null,
    )[0];
    expect(leaf?.content.block).toEqual({
      kind: "open-file",
      file: "README.md",
    });
  });

  it("pickTemplateBlockFile preserves an open-kanban block kind (#154)", () => {
    useStore.setState({
      canvases: [
        {
          id: "c1",
          name: "T",
          layout: pendingTab({ kind: "open-kanban", file: "missing.md" }),
        },
      ],
      activeCanvasId: "c1",
    });
    // Picking a file for a kanban block must keep it kanban (resolves into a
    // KanbanPanel), not silently degrade to an open-file viewer.
    useStore.getState().pickTemplateBlockFile("c1", "L", "TASKS.md");
    const leaf = collectLeaves(
      useStore.getState().canvases[0]?.layout ?? null,
    )[0];
    expect(leaf?.content.block).toEqual({
      kind: "open-kanban",
      file: "TASKS.md",
    });
  });

  it("openTemplateUse / close toggle the chooser flag", () => {
    useStore.getState().openTemplateUse();
    expect(useStore.getState().templateUseOpen).toBe(true);
    useStore.getState().closeTemplateUse();
    expect(useStore.getState().templateUseOpen).toBe(false);
  });
});

describe("canvas panel lift (#155)", () => {
  // split(s1){ a: agent(L1, A), b: file(L2) } — two panels in the active tab.
  const twoPanels = (): CanvasNode => ({
    type: "split",
    id: "s1",
    dir: "row",
    sizes: [50, 50],
    a: { type: "leaf", id: "L1", content: { kind: "agent", sessionId: "A" } },
    b: {
      type: "leaf",
      id: "L2",
      content: { kind: "file", repoPath: "/repo/x", file: "a.md" },
    },
  });

  const seed = (layout: CanvasNode | null) => {
    useStore.setState({
      canvases: [{ id: "c1", name: "T", layout }],
      activeCanvasId: "c1",
      liftedLeaf: null,
    });
  };

  it("beginCanvasLift records the active tab + leaf without touching the layout", () => {
    const layout = twoPanels();
    seed(layout);
    useStore.getState().beginCanvasLift("L1");
    const s = useStore.getState();
    expect(s.liftedLeaf).toEqual({ canvasId: "c1", leafId: "L1" });
    // The persisted layout is unchanged (same reference) — the lift is transient.
    expect(s.canvases[0]?.layout).toBe(layout);
  });

  it("commit moves the lifted panel to the target edge, preserving id + content", () => {
    seed(twoPanels());
    useStore.getState().beginCanvasLift("L1");
    // Drop L1 onto L2's right edge → order becomes L2, L1.
    useStore.getState().commitCanvasLift("L2", "right");
    const s = useStore.getState();
    expect(s.liftedLeaf).toBeNull();
    const leaves = collectLeaves(s.canvases[0]?.layout ?? null);
    expect(leaves.map((l) => l.id)).toEqual(["L2", "L1"]);
    // The moved panel keeps its id AND agent content (so the pooled terminal reparents).
    expect(leaves.find((l) => l.id === "L1")?.content).toEqual({
      kind: "agent",
      sessionId: "A",
    });
  });

  it("commit of a sole panel onto the center keeps it as the single leaf", () => {
    const sole: CanvasNode = {
      type: "leaf",
      id: "L1",
      content: { kind: "agent", sessionId: "A" },
    };
    seed(sole);
    useStore.getState().beginCanvasLift("L1");
    useStore.getState().commitCanvasLift("canvas-center", "left");
    const s = useStore.getState();
    expect(s.liftedLeaf).toBeNull();
    // Already the whole tree — restored in place, unchanged.
    expect(s.canvases[0]?.layout).toEqual(sole);
  });

  it("cancel restores the panel — the persisted layout is byte-for-byte unchanged", () => {
    const layout = twoPanels();
    seed(layout);
    useStore.getState().beginCanvasLift("L1");
    useStore.getState().cancelCanvasLift();
    const s = useStore.getState();
    expect(s.liftedLeaf).toBeNull();
    // Never mutated during the lift → same reference as before.
    expect(s.canvases[0]?.layout).toBe(layout);
  });
});

describe("big mode (#157)", () => {
  it("maximizeItem sets the overlay item; closeMaximized clears it", () => {
    const content = { kind: "agent" as const, sessionId: "s1", repoPath: "/r" };
    useStore.getState().maximizeItem(content);
    expect(useStore.getState().maximizedItem).toEqual(content);
    useStore.getState().closeMaximized();
    expect(useStore.getState().maximizedItem).toBeNull();
  });

  it("closeMaximized is a no-op when nothing is maximized", () => {
    expect(useStore.getState().maximizedItem).toBeNull();
    useStore.getState().closeMaximized();
    expect(useStore.getState().maximizedItem).toBeNull();
  });
});

describe("canvas tab close behavior (#137)", () => {
  const agentLayout = (sessionId: string): CanvasNode => ({
    type: "leaf",
    id: `leaf-${sessionId}`,
    content: { kind: "agent", sessionId, repoPath: `/repo/${sessionId}` },
  });
  const s = () => useStore.getState();
  const seed = (behavior: "ask" | "kill" | "keep") => {
    useStore.setState({
      sessions: [session("a1")],
      canvases: [
        { id: "c-full", name: "Full", layout: agentLayout("a1") },
        { id: "c-empty", name: "Empty", layout: null },
      ],
      activeCanvasId: "c-full",
      settings: { ...s().settings, canvasCloseBehavior: behavior },
      canvasClosePromptId: null,
    });
  };

  it("closes an empty tab silently (no prompt) in every mode", () => {
    for (const mode of ["ask", "kill", "keep"] as const) {
      seed(mode);
      s().requestCloseCanvas("c-empty");
      expect(s().canvasClosePromptId).toBeNull();
      expect(s().canvases.some((c) => c.id === "c-empty")).toBe(false);
    }
  });

  it("'ask' opens the prompt for a tab with contents; cancel leaves it open", () => {
    seed("ask");
    s().requestCloseCanvas("c-full");
    expect(s().canvasClosePromptId).toBe("c-full");
    expect(s().canvases.some((c) => c.id === "c-full")).toBe(true); // not closed yet
    s().cancelCloseCanvas();
    expect(s().canvasClosePromptId).toBeNull();
    expect(s().canvases.some((c) => c.id === "c-full")).toBe(true);
  });

  it("'keep' closes the tab without killing its agent", () => {
    seed("keep");
    s().requestCloseCanvas("c-full");
    expect(s().canvasClosePromptId).toBeNull();
    expect(s().canvases.some((c) => c.id === "c-full")).toBe(false);
    expect(s().sessions.some((x) => x.id === "a1")).toBe(true); // agent survives
  });

  it("confirming kill drops the tab's agent from sessions and closes the tab", async () => {
    seed("ask");
    s().requestCloseCanvas("c-full");
    await s().confirmCloseCanvas("c-full", true);
    expect(s().canvasClosePromptId).toBeNull();
    expect(s().canvases.some((c) => c.id === "c-full")).toBe(false);
    expect(s().sessions.some((x) => x.id === "a1")).toBe(false); // killed + dropped
  });
});

describe("left panel as source of truth (#152)", () => {
  const s = () => useStore.getState();
  const leaf = (id: string, content: CanvasContent): CanvasNode => ({
    type: "leaf",
    id,
    content,
  });
  const split = (a: CanvasNode, b: CanvasNode): CanvasNode => ({
    type: "split",
    id: "sp",
    dir: "row",
    sizes: [50, 50],
    a,
    b,
  });

  it("removeOverviewPanel cascades into every Canvas tab showing the item", async () => {
    // A file panel in the left panel, shown in a Canvas leaf beside a terminal.
    useStore.setState({
      overviewPanels: {
        "/repo/x": [{ id: "p1", kind: "markdown", file: "a.md" }],
      },
      canvases: [
        {
          id: "c1",
          name: "C1",
          layout: split(
            leaf("lf", { kind: "file", repoPath: "/repo/x", file: "a.md" }),
            leaf("lt", {
              kind: "terminal",
              repoPath: "/repo/x",
              sessionId: "t9",
            }),
          ),
        },
      ],
      activeCanvasId: "c1",
    });
    await s().removeOverviewPanel("/repo/x", "p1");
    // Gone from the left panel (Overview mirrors this) ...
    expect(s().overviewPanels["/repo/x"]).toBeUndefined();
    // ... and the Canvas split collapsed to the surviving terminal leaf.
    const leaves = collectLeaves(s().canvases[0]?.layout ?? null);
    expect(leaves.map((l) => l.content.kind)).toEqual(["terminal"]);
  });

  it("dropSession cascades agent leaves out of Canvas, keeping siblings", () => {
    useStore.setState({
      sessions: [session("a1")],
      canvases: [
        {
          id: "c1",
          name: "C1",
          layout: split(
            leaf("la", {
              kind: "agent",
              sessionId: "a1",
              repoPath: "/repo/a1",
            }),
            leaf("lb", {
              kind: "agent",
              sessionId: "a2",
              repoPath: "/repo/a2",
            }),
          ),
        },
      ],
      activeCanvasId: "c1",
    });
    s().dropSession("a1");
    const leaves = collectLeaves(s().canvases[0]?.layout ?? null);
    expect(leaves.map((l) => l.content.sessionId)).toEqual(["a2"]);
  });

  it("cancelSchedule removes the schedule's Canvas panel", async () => {
    useStore.setState({
      schedules: [{ id: "sch1", cwd: "/repo/x", fire_at: 0, created_at: 0 }],
      canvases: [
        {
          id: "c1",
          name: "C1",
          layout: leaf("ls", {
            kind: "scheduled",
            scheduleId: "sch1",
            repoPath: "/repo/x",
          }),
        },
      ],
      activeCanvasId: "c1",
    });
    await s().cancelSchedule("sch1");
    expect(s().schedules).toHaveLength(0);
    expect(collectLeaves(s().canvases[0]?.layout ?? null)).toHaveLength(0);
  });

  it("leaves unrelated Canvas panels untouched", async () => {
    useStore.setState({
      overviewPanels: { "/repo/x": [{ id: "p1", kind: "diff" }] },
      canvases: [
        {
          id: "c1",
          name: "C1",
          layout: leaf("lf", {
            kind: "file",
            repoPath: "/repo/x",
            file: "a.md",
          }),
        },
      ],
      activeCanvasId: "c1",
    });
    // Removing the diff panel must not disturb the unrelated file leaf.
    await s().removeOverviewPanel("/repo/x", "p1");
    expect(collectLeaves(s().canvases[0]?.layout ?? null)).toHaveLength(1);
  });
});

describe("openSessionInCanvas (#153)", () => {
  const s = () => useStore.getState();
  const agentLeaf = (id: string, sessionId: string): CanvasNode => ({
    type: "leaf",
    id,
    content: { kind: "agent", sessionId, repoPath: `/repo/${sessionId}` },
  });

  it("creates a new 'Canvas N' tab when the agent isn't in any canvas", () => {
    useStore.setState({
      sessions: [session("a1")],
      canvases: [{ id: "c1", name: "Canvas 1", layout: null }],
      activeCanvasId: "c1",
      view: "overview",
      detachedCanvasIds: [],
    });
    s().openSessionInCanvas("a1");
    const st = s();
    expect(st.canvases).toHaveLength(2);
    const tab = st.canvases[1];
    expect(tab?.name).toBe("Canvas 2");
    expect(st.activeCanvasId).toBe(tab?.id);
    expect(st.view).toBe("canvas");
    const leaves = collectLeaves(tab?.layout ?? null);
    expect(leaves).toHaveLength(1);
    expect(leaves[0]?.content).toMatchObject({
      kind: "agent",
      sessionId: "a1",
    });
    expect(st.activeLeafId).toBe(leaves[0]?.id);
    expect(st.selectedId).toBe("a1");
  });

  it("focuses the agent's existing tab instead of duplicating it", () => {
    useStore.setState({
      sessions: [session("a1")],
      canvases: [
        { id: "c1", name: "Canvas 1", layout: null },
        { id: "c2", name: "Canvas 2", layout: agentLeaf("L", "a1") },
      ],
      activeCanvasId: "c1",
      view: "overview",
      detachedCanvasIds: [],
    });
    s().openSessionInCanvas("a1");
    const st = s();
    expect(st.canvases).toHaveLength(2); // no new tab
    expect(st.activeCanvasId).toBe("c2");
    expect(st.activeLeafId).toBe("L");
    expect(st.view).toBe("canvas");
    expect(st.selectedId).toBe("a1");
  });

  it("raises a detached window without switching the main view (#84)", () => {
    useStore.setState({
      sessions: [session("a1")],
      canvases: [
        { id: "c1", name: "Canvas 1", layout: null },
        { id: "c2", name: "Canvas 2", layout: agentLeaf("L", "a1") },
      ],
      activeCanvasId: "c1",
      view: "overview",
      detachedCanvasIds: ["c2"],
    });
    s().openSessionInCanvas("a1");
    const st = s();
    expect(st.canvases).toHaveLength(2); // no new tab
    expect(st.view).toBe("overview"); // main view unchanged
    expect(st.activeCanvasId).toBe("c1"); // unchanged
    expect(st.selectedId).toBe("a1"); // row still highlighted
  });
});

describe("forkability gating (#138)", () => {
  const s = () => useStore.getState();

  it("setForkable updates the session flag and is a no-op for an unknown id", () => {
    useStore.setState({ sessions: [session("f1")] });
    // Seeded undefined (fail-open → forkable in the UI); setForkable flips it.
    s().setForkable("f1", false);
    expect(s().sessions.find((x) => x.id === "f1")?.forkable).toBe(false);
    s().setForkable("f1", true);
    expect(s().sessions.find((x) => x.id === "f1")?.forkable).toBe(true);
    // An unknown id (e.g. a shell terminal also poked by the title worker) is a no-op.
    s().setForkable("missing", false);
    expect(s().sessions).toHaveLength(1);
  });
});
