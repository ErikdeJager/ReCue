import { describe, expect, it, vi } from "vitest";

import { makePasteKeyHandler, type PasteKeyEvent } from "./pasteHandler";

// Flush the handler's fire-and-forget clipboard read.
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

const keyEvent = (over: Partial<PasteKeyEvent> = {}): PasteKeyEvent => ({
  type: "keydown",
  ctrlKey: true,
  altKey: false,
  metaKey: false,
  key: "v",
  preventDefault: vi.fn(),
  ...over,
});

const makeDeps = (
  over: Partial<Parameters<typeof makePasteKeyHandler>[0]> = {},
) => ({
  isWin: () => true,
  paste: vi.fn(),
  readText: vi.fn(async () => "clip text"),
  saveImage: vi.fn(async () => null),
  ...over,
});

describe("makePasteKeyHandler", () => {
  it("Windows Ctrl+V pastes the clipboard text exactly once and preventDefaults (no native double paste)", async () => {
    const deps = makeDeps();
    const handler = makePasteKeyHandler(deps);
    const event = keyEvent();

    expect(handler(event)).toBe(false);
    await flush();

    // preventDefault is the double-paste fix: it suppresses the browser's default
    // Ctrl+V action, so xterm's native `paste` listener never fires a second paste.
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(deps.paste).toHaveBeenCalledTimes(1);
    expect(deps.paste).toHaveBeenCalledWith("clip text");
    expect(deps.saveImage).not.toHaveBeenCalled();
  });

  it("intercepts Ctrl+Shift+V the same way (key reported as 'V')", async () => {
    const deps = makeDeps();
    const handler = makePasteKeyHandler(deps);
    const event = keyEvent({ key: "V" });

    expect(handler(event)).toBe(false);
    await flush();

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(deps.paste).toHaveBeenCalledExactlyOnceWith("clip text");
  });

  it("falls back to the clipboard image path when there is no text — still preventDefaulted", async () => {
    const deps = makeDeps({
      readText: vi.fn(async () => null),
      saveImage: vi.fn(async () => "C:\\Temp\\recue-paste-1.png"),
    });
    const handler = makePasteKeyHandler(deps);
    const event = keyEvent();

    expect(handler(event)).toBe(false);
    await flush();

    // Even an image paste must cancel the default action, or an empty native
    // paste event would still be dispatched to xterm.
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(deps.paste).toHaveBeenCalledExactlyOnceWith(
      "C:\\Temp\\recue-paste-1.png",
    );
  });

  it("pastes nothing on a clipboard failure (best-effort), still swallowing the chord", async () => {
    const deps = makeDeps({
      readText: vi.fn(async () => {
        throw new Error("clipboard unavailable");
      }),
    });
    const handler = makePasteKeyHandler(deps);
    const event = keyEvent();

    expect(handler(event)).toBe(false);
    await flush();

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(deps.paste).not.toHaveBeenCalled();
  });

  it("pastes nothing when the clipboard holds neither text nor an image", async () => {
    const deps = makeDeps({ readText: vi.fn(async () => null) });
    const handler = makePasteKeyHandler(deps);

    expect(handler(keyEvent())).toBe(false);
    await flush();

    expect(deps.paste).not.toHaveBeenCalled();
  });

  it("is a no-op off Windows — native ⌘V/paste stays untouched", async () => {
    const deps = makeDeps({ isWin: () => false });
    const handler = makePasteKeyHandler(deps);
    const event = keyEvent();

    expect(handler(event)).toBe(true);
    await flush();

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(deps.readText).not.toHaveBeenCalled();
    expect(deps.paste).not.toHaveBeenCalled();
  });

  it("ignores non-paste chords and non-keydown events (Ctrl+C stays the agent's SIGINT)", async () => {
    const deps = makeDeps();
    const handler = makePasteKeyHandler(deps);

    const cases: PasteKeyEvent[] = [
      keyEvent({ key: "c" }), // Ctrl+C — never touched
      keyEvent({ ctrlKey: false }), // plain v
      keyEvent({ altKey: true }), // Ctrl+Alt+V (AltGr)
      keyEvent({ metaKey: true }), // Meta involved
      keyEvent({ type: "keyup" }), // only keydown is handled
    ];
    for (const event of cases) {
      expect(handler(event)).toBe(true);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    await flush();

    expect(deps.readText).not.toHaveBeenCalled();
    expect(deps.paste).not.toHaveBeenCalled();
  });
});
