import { beforeEach, describe, expect, it, vi } from "vitest";

// #361: the in-app updater must NEVER touch a distro-packaged install. A Linux release
// binary with no `$APPIMAGE` (pacman / the AUR `recue-bin` / the `.deb`) is owned by the
// package manager, and Tauri's Linux updater can only replace an AppImage anyway — so the
// store short-circuits `checkForUpdate` (no network call at all) and refuses
// `installUpdate`. These tests assert that against a mocked `./updater`, and — just as
// importantly — that every OTHER install kind (macOS `.app`, the Windows installer, the
// Linux AppImage, and the "" pre-load default) still drives the real updater exactly as
// before. That second half is the regression guard for macOS/Windows/AppImage.
vi.mock("./updater", () => ({
  checkForUpdate: vi.fn().mockResolvedValue(null),
  downloadAndRelaunch: vi.fn().mockResolvedValue(undefined),
  isMockUpdate: vi.fn().mockReturnValue(false),
  setMockUpdate: vi.fn(),
}));

import { useStore } from "./store";
import * as updater from "./updater";

const m = vi.mocked;

const IDLE_UPDATE = {
  status: "idle" as const,
  version: null,
  notes: null,
  progress: 0,
  confirming: false,
  error: undefined,
};

beforeEach(() => {
  m(updater.checkForUpdate).mockClear().mockResolvedValue(null);
  m(updater.downloadAndRelaunch).mockClear().mockResolvedValue(undefined);
  m(updater.isMockUpdate).mockClear().mockReturnValue(false);
  useStore.setState({
    installKind: "",
    update: { ...IDLE_UPDATE },
    toasts: [],
  });
});

describe("checkForUpdate — the package-manager gate (#361)", () => {
  it("never calls the updater on a distro-packaged (system) install", async () => {
    useStore.setState({ installKind: "system" });

    await useStore.getState().checkForUpdate();

    // No network check whatsoever — the whole point: pacman owns the binary.
    expect(updater.checkForUpdate).not.toHaveBeenCalled();
    // …and the slice stays idle, so the sidebar indicator can never appear.
    expect(useStore.getState().update.status).toBe("idle");
    expect(useStore.getState().update.version).toBeNull();
  });

  it("still calls the updater on an AppImage install (unchanged behavior)", async () => {
    m(updater.checkForUpdate).mockResolvedValue({
      version: "9.9.9",
      notes: "# notes",
    });
    useStore.setState({ installKind: "appimage" });

    await useStore.getState().checkForUpdate();

    expect(updater.checkForUpdate).toHaveBeenCalledTimes(1);
    expect(useStore.getState().update.status).toBe("available");
    expect(useStore.getState().update.version).toBe("9.9.9");
    expect(useStore.getState().update.notes).toBe("# notes");
  });

  it("still calls the updater on a bundle install (macOS .app / Windows installer)", async () => {
    m(updater.checkForUpdate).mockResolvedValue({
      version: "2.0.0",
      notes: null,
    });
    useStore.setState({ installKind: "bundle" });

    await useStore.getState().checkForUpdate();

    expect(updater.checkForUpdate).toHaveBeenCalledTimes(1);
    expect(useStore.getState().update.status).toBe("available");
    expect(useStore.getState().update.version).toBe("2.0.0");
  });

  it("still calls the updater before the install kind has loaded ('')", async () => {
    // The pre-load default must read as self-updating — otherwise a boot-time check
    // racing the `install_kind()` read would be silently skipped on every OS.
    m(updater.checkForUpdate).mockResolvedValue({
      version: "1.3.0",
      notes: null,
    });

    await useStore.getState().checkForUpdate();

    expect(updater.checkForUpdate).toHaveBeenCalledTimes(1);
    expect(useStore.getState().update.status).toBe("available");
  });
});

describe("installUpdate — the package-manager gate (#361)", () => {
  it("refuses to install on a distro-packaged (system) install and toasts", async () => {
    // Defense in depth: the check gate means "available" is unreachable here, but the
    // #193 dev mock writes the status directly — so this must never overwrite the binary.
    useStore.setState({
      installKind: "system",
      update: { ...IDLE_UPDATE, status: "available", version: "9.9.9" },
    });

    await useStore.getState().installUpdate();

    expect(updater.downloadAndRelaunch).not.toHaveBeenCalled();
    expect(useStore.getState().update.status).toBe("idle");
    const toasts = useStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toMatch(/package manager/i);
  });

  it("still downloads + relaunches on an AppImage install (unchanged behavior)", async () => {
    useStore.setState({
      installKind: "appimage",
      update: { ...IDLE_UPDATE, status: "available", version: "9.9.9" },
    });

    await useStore.getState().installUpdate();

    expect(updater.downloadAndRelaunch).toHaveBeenCalledTimes(1);
    // Real mode relaunches and never returns; the mocked call resolves, leaving the
    // "downloading" status the action set (no mock → no post-update toast).
    expect(useStore.getState().update.status).toBe("downloading");
    expect(useStore.getState().toasts).toHaveLength(0);
  });
});
