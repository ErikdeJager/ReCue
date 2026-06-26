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
}

/** Check the configured endpoint for a newer published release. Returns the new
 *  version (and stashes the pending `Update`), or null when up to date / offline /
 *  outside Tauri / no signed release. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const update = await check();
  pending = update;
  return update ? { version: update.version } : null;
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
