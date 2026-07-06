// Native OS notification helper (#336) — backs the per-agent "watch" feature: a
// native toast pops up when a watched agent finishes a turn / needs input (its
// busy→idle edge). Delivery goes through the cross-platform Tauri notification
// plugin (`@tauri-apps/plugin-notification`), so this is platform-neutral — native
// on both macOS and Windows, no `#[cfg]` / OS-specific code in ReCue.
//
// Everything here is **best-effort**: permission is ensured lazily, every call is
// wrapped so a denied grant or an unavailable plugin silently no-ops rather than
// throwing (there is no in-app toast fallback — that's out of scope).

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

/**
 * Ensure notification permission is granted, requesting it once if the state is
 * still `"default"`. Called at opt-in time (turning on watch for an agent, or the
 * global "Watch all agents" setting) so the OS prompt appears when the user asks
 * for notifications rather than only on the first busy→idle edge. Returns `true`
 * when notifications may be sent. Never throws — a failure resolves `false`.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    if (await isPermissionGranted()) return true;
    const result = await requestPermission();
    return result === "granted";
  } catch {
    // Plugin unavailable (e.g. non-Tauri context) — silently give up.
    return false;
  }
}

/**
 * Fire a native OS notification for a watched agent that just reached its busy→idle
 * edge (#336). `title` is the agent's display label; `body` is a generic "finished
 * or needs input" message (we deliberately don't distinguish the two — one message
 * covers both). Best-effort: ensures permission first and swallows any error, so a
 * denied grant just means no notification. Fire-and-forget by the caller.
 */
export async function notifyAgentReady(
  title: string,
  body: string,
): Promise<void> {
  try {
    if (!(await ensureNotificationPermission())) return;
    sendNotification({ title, body });
  } catch {
    // Best-effort — never surface a delivery failure to the caller.
  }
}
