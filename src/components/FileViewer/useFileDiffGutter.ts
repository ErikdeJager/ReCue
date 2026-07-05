//! Lightweight per-file diff poll (#324) feeding the FileViewer code view's git-diff
//! gutter. Fetches `fileDiff(repo, file)` on mount / active + on a ~2 s interval while
//! visible (paused when hidden, caught up on re-show) and whenever the file's content
//! changes (so committing in a terminal clears the markers within a poll). Fully
//! fail-open: any error keeps the markers `null` (no gutter), never throws.

import { useEffect, useMemo, useState } from "react";

import { fileDiff } from "../../ipc";
import { gutterMarkers, type GutterMarkers } from "./gutter";

// Re-check the diff on this cadence while visible — a couple seconds is snappy enough
// to clear the gutter shortly after a terminal commit without hammering `git`.
const POLL_MS = 2000;

/**
 * Fetch + poll the single-file git diff and classify it into gutter markers (#324).
 * A no-op (returns `null`) unless both `active` (the panel is shown) and `enabled`
 * (this is the code view) hold — so a rendered-markdown / editable / large-file view
 * never fetches. Re-fetches on `text` change (content edit / hot-reload / commit) and
 * resets to `null` on a `file` switch.
 */
export function useFileDiffGutter(
  repoPath: string,
  file: string,
  active: boolean,
  text: string | null,
  enabled: boolean,
): GutterMarkers | null {
  const [markers, setMarkers] = useState<GutterMarkers | null>(null);

  // Clear immediately on a file switch so a stale gutter never flashes on the next file.
  useEffect(() => {
    setMarkers(null);
  }, [file]);

  useEffect(() => {
    if (!active || !enabled) {
      setMarkers(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const fetchOnce = async () => {
      try {
        const resp = await fileDiff(repoPath, file);
        if (cancelled) return;
        setMarkers(resp ? gutterMarkers(resp.hunks) : null);
      } catch {
        // Fail-open: a git miss / non-git folder / parse error → no gutter.
        if (!cancelled) setMarkers(null);
      }
    };

    const start = () => {
      if (timer === undefined && !document.hidden) {
        timer = setInterval(() => void fetchOnce(), POLL_MS);
      }
    };
    const stop = () => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        void fetchOnce();
        start();
      }
    };

    void fetchOnce();
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // `text` is a dependency so a content change (edit / hot-reload / commit)
    // triggers an immediate refetch.
  }, [repoPath, file, active, enabled, text]);

  return useMemo(() => markers, [markers]);
}
