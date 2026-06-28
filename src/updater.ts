// In-app auto-update (Tauri updater + process plugins) — the #190 skeleton,
// re-introducing #15 (removed by #62) and extending it with a download-progress
// callback. Inert until a real signing keypair is generated (deferred): the
// configured pubkey is a placeholder and no signed release is published, so
// `check()` returns null today.
//
// The `Update` object returned by `check()` carries methods (downloadAndInstall),
// so it can't live in the Zustand store. We hold it module-side and expose only the
// serializable version to the store — mirroring the outputBus pattern.

import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

let pending: Update | null = null;

export interface UpdateInfo {
  version: string;
  /** Release notes carried in `latest.json` (`update.body`, #192) — markdown, or
   * null when the release provides none. */
  notes: string | null;
}

// Dev-only mock (#193): when set (via the `window.__recue` helpers, dev gated),
// `checkForUpdate` / `downloadAndRelaunch` use fake data + a timer-driven progress
// loop instead of the real plugin — so the whole update UI is exercisable without a
// signed release. Always null in production (the registrar is tree-shaken out).
let mock: UpdateInfo | null = null;

/** Arm/disarm the dev mock update (#193). */
export function setMockUpdate(info: UpdateInfo | null): void {
  mock = info;
}

/** Whether a dev mock update is armed (#193) — `installUpdate` uses this to fire the
 *  post-update toast instead of relaunching. */
export function isMockUpdate(): boolean {
  return mock !== null;
}

/** Check the configured endpoint for a newer published release. Returns the new
 *  version + notes (and stashes the pending `Update`), or null when up to date /
 *  offline / outside Tauri / no signed release. A dev mock (#193) short-circuits. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (mock) return mock;
  const update = await check();
  pending = update;
  return update
    ? { version: update.version, notes: update.body ?? null }
    : null;
}

/**
 * Download + install the pending update, then relaunch into the new version.
 * `onProgress` is called with 0–100 as the download streams (driven by the
 * updater's `Started{contentLength}` / `Progress{chunkLength}` / `Finished`
 * events), so the UI can bind a progress bar to it.
 */
export async function downloadAndRelaunch(
  onProgress?: (percent: number) => void,
): Promise<void> {
  if (mock) {
    // Dev mock (#193): simulate the download (0→100) and skip the real relaunch —
    // the store's `installUpdate` fires the post-update toast on return instead.
    await simulateProgress(onProgress);
    return;
  }
  if (!pending) throw new Error("no pending update");
  let total = 0;
  let downloaded = 0;
  await pending.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? 0;
        downloaded = 0;
        onProgress?.(0);
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.(
          total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0,
        );
        break;
      case "Finished":
        onProgress?.(100);
        break;
    }
  });
  await relaunch();
}

/** Dev mock (#193): drive `onProgress` 0→100 over ~1.2s, then resolve. */
function simulateProgress(
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve) => {
    let pct = 0;
    onProgress?.(0);
    const id = setInterval(() => {
      pct = Math.min(100, pct + 10);
      onProgress?.(pct);
      if (pct >= 100) {
        clearInterval(id);
        resolve();
      }
    }, 120);
  });
}
