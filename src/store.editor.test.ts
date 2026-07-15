import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// "Open in editor" store actions against a mocked IPC layer (the
// store.refresh.test.ts pattern — this file owns its own ./ipc mock; Vitest
// isolates module mocks per file). Only the functions these actions touch are
// mocked: `detectEditors` / `openInEditor` for the launches, `getSettings` /
// `setSettings` for chooseEditor's fresh-read persist through saveSettings.
vi.mock("./ipc", () => ({
  detectEditors: vi.fn(),
  openInEditor: vi.fn(),
  getSettings: vi.fn(),
  setSettings: vi.fn(),
}));

import * as ipc from "./ipc";
import { DEFAULT_SETTINGS, useStore } from "./store";
import type { EditorInfo } from "./types";

const m = vi.mocked;

const CHOICES: EditorInfo[] = [
  {
    id: "vscode",
    display_name: "Visual Studio Code",
    found: true,
    via: "PATH",
  },
  { id: "zed", display_name: "Zed", found: false, via: null },
];

/** Flush the microtask queue so fire-and-forget promises settle. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  m(ipc.detectEditors).mockResolvedValue(CHOICES);
  m(ipc.openInEditor).mockResolvedValue(undefined);
  m(ipc.getSettings).mockResolvedValue(null);
  m(ipc.setSettings).mockResolvedValue(undefined);
  useStore.setState({
    settings: { ...DEFAULT_SETTINGS },
    editorPickerOpen: false,
    editorPickerPath: null,
    editorChoices: null,
    toasts: [],
  });
});

afterEach(() => {
  useStore.setState({
    editorPickerOpen: false,
    editorPickerPath: null,
    editorChoices: null,
    toasts: [],
  });
});

describe("openInEditor", () => {
  it("opens the picker (and kicks detection) when no editor is chosen yet", async () => {
    await useStore.getState().openInEditor("/repo/a");
    const s = useStore.getState();
    expect(s.editorPickerOpen).toBe(true);
    expect(s.editorPickerPath).toBe("/repo/a");
    expect(ipc.detectEditors).toHaveBeenCalledTimes(1);
    expect(ipc.openInEditor).not.toHaveBeenCalled();
    await flush();
    expect(useStore.getState().editorChoices).toEqual(CHOICES);
  });

  it("launches the preferred editor directly when one is remembered", async () => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, preferredEditor: "vscode" },
    });
    await useStore.getState().openInEditor("/repo/a");
    expect(ipc.openInEditor).toHaveBeenCalledWith("/repo/a", "vscode");
    expect(useStore.getState().editorPickerOpen).toBe(false);
  });

  it("toasts and reopens the picker on BinaryNotFound (stale choice self-heal)", async () => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, preferredEditor: "zed" },
    });
    m(ipc.openInEditor).mockRejectedValue({
      kind: "BinaryNotFound",
      message: "`Zed` was not found on PATH",
    });
    await useStore.getState().openInEditor("/repo/a");
    const s = useStore.getState();
    expect(s.toasts.some((t) => t.tone === "error")).toBe(true);
    expect(s.editorPickerOpen).toBe(true);
    expect(s.editorPickerPath).toBe("/repo/a");
  });

  it("toasts other launch failures without reopening the picker", async () => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, preferredEditor: "vscode" },
    });
    m(ipc.openInEditor).mockRejectedValue({
      kind: "Io",
      message: "`/repo/a` is not a folder",
    });
    await useStore.getState().openInEditor("/repo/a");
    const s = useStore.getState();
    expect(s.toasts.some((t) => t.message.includes("not a folder"))).toBe(true);
    expect(s.editorPickerOpen).toBe(false);
  });
});

describe("openEditorPicker", () => {
  it("drops a late detection result once the picker was dismissed", async () => {
    let resolveDetect: (v: EditorInfo[]) => void = () => {};
    m(ipc.detectEditors).mockImplementation(
      () => new Promise((resolve) => (resolveDetect = resolve)),
    );
    useStore.getState().openEditorPicker("/repo/a");
    useStore.getState().closeEditorPicker();
    resolveDetect(CHOICES);
    await flush();
    expect(useStore.getState().editorChoices).toBeNull();
  });

  it("falls back to the empty list when detection fails", async () => {
    m(ipc.detectEditors).mockRejectedValue(new Error("no backend"));
    useStore.getState().openEditorPicker("/repo/a");
    await flush();
    expect(useStore.getState().editorChoices).toEqual([]);
  });
});

describe("chooseEditor", () => {
  it("persists the choice and launches when Remember is checked", async () => {
    useStore.getState().openEditorPicker("/repo/a");
    await useStore.getState().chooseEditor("vscode", true);
    expect(useStore.getState().editorPickerOpen).toBe(false);
    expect(ipc.setSettings).toHaveBeenCalledTimes(1);
    const written = m(ipc.setSettings).mock.calls[0]?.[0] as {
      preferredEditor: string | null;
    };
    expect(written.preferredEditor).toBe("vscode");
    expect(ipc.openInEditor).toHaveBeenCalledWith("/repo/a", "vscode");
  });

  it("launches without persisting when Remember is unchecked", async () => {
    useStore.getState().openEditorPicker("/repo/a");
    await useStore.getState().chooseEditor("vscode", false);
    expect(ipc.setSettings).not.toHaveBeenCalled();
    expect(ipc.openInEditor).toHaveBeenCalledWith("/repo/a", "vscode");
    expect(useStore.getState().settings.preferredEditor).toBeNull();
  });

  it("always persists a custom command (the backend reads it off the blob)", async () => {
    useStore.getState().openEditorPicker("/repo/a");
    await useStore.getState().chooseEditor("custom", false, "  zed {path}  ");
    expect(ipc.setSettings).toHaveBeenCalledTimes(1);
    const written = m(ipc.setSettings).mock.calls[0]?.[0] as {
      preferredEditor: string | null;
      customEditorCommand: string;
    };
    // Remember was unchecked: the command is saved, the preference is not.
    expect(written.preferredEditor).toBeNull();
    expect(written.customEditorCommand).toBe("zed {path}");
    expect(ipc.openInEditor).toHaveBeenCalledWith("/repo/a", "custom");
  });

  it("merges over the freshly-read persisted blob, not this window's copy", async () => {
    // The persisted blob differs from this (stale, detached-window) store copy —
    // remembering an editor must carry the fresh value through. Uses a field with
    // no saveSettings runtime reaction so only the merge itself is under test.
    m(ipc.getSettings).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      confirmDestructive: !DEFAULT_SETTINGS.confirmDestructive,
    });
    useStore.getState().openEditorPicker("/repo/a");
    await useStore.getState().chooseEditor("vscode", true);
    const written = m(ipc.setSettings).mock.calls[0]?.[0] as {
      confirmDestructive: boolean;
      preferredEditor: string | null;
    };
    expect(written.confirmDestructive).toBe(
      !DEFAULT_SETTINGS.confirmDestructive,
    );
    expect(written.preferredEditor).toBe("vscode");
  });
});
