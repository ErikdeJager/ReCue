// Latching visibility gate for terminal creation (#351).
//
// Overview's wall used to mount EVERY session's xterm at boot: each `createHost` builds an
// XTerm (+ its own WebGL context), fetches up to 256 KB of scrollback over a sync
// main-thread command, ANSI-parses it, awaits font loads and does a resize IPC. Ten resumed
// agents meant ten eager hosts racing on the single WebView main thread — the dominant boot
// cost, worst on Linux/WebKitGTK. This hook lets `Terminal` create its pooled xterm only
// once its card actually becomes visible.
//
// It LATCHES: once visible it never flips back, because a pooled terminal is created once
// and reparented — never disposed on scroll-out (the #18 invariant; a re-replay at a
// different width would garble claude's cursor-positioned TUI). We defer creation, we never
// recycle.

import {
  createContext,
  type RefObject,
  useContext,
  useEffect,
  useState,
} from "react";

/**
 * The scroll container terminals should be observed against, or `null` for the viewport.
 *
 * **Why this exists:** `IntersectionObserver` clips the target against every intermediate
 * scroll container *before* applying `rootMargin`, so a viewport-rooted observer can never
 * see a card that is scrolled out of Overview's horizontally scrolling `overflow-x: auto`
 * wall — the pre-load margin would be dead and a card would only mount the instant it
 * became visible. Overview therefore provides its wall element here. Everywhere else the
 * context stays `null` ⇒ the viewport root, which is exactly right for Canvas panels, the
 * big-mode modal, and detached canvas windows.
 */
export const TerminalScrollRootContext =
  createContext<RefObject<HTMLElement | null> | null>(null);

/**
 * Pre-load margin around the root. The horizontal figure (600px ≥ 1.5 cards at the 400px
 * default `--overview-card-min`) keeps the next card or two warm so scrolling the wall
 * reveals an already-painted terminal rather than an empty one.
 */
export const MOUNT_ROOT_MARGIN = "200px 600px";

/**
 * True once `ref`'s element has intersected the observer root (plus `rootMargin`) at least
 * once. Starts `true` — i.e. degrades to today's eager mount — when `IntersectionObserver`
 * is unavailable, so the gate can never be worse than the behavior it replaces.
 */
export function useVisibleOnce(
  ref: RefObject<HTMLElement | null>,
  rootMargin: string = MOUNT_ROOT_MARGIN,
): boolean {
  const scrollRoot = useContext(TerminalScrollRootContext);
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;
    // Refs are attached during commit — before child effects run — so a provider's ref
    // (Overview's wall) is already populated by the time this effect builds the observer.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting || entry.intersectionRatio > 0) {
            setVisible(true);
            observer.disconnect();
            return;
          }
        }
      },
      { root: scrollRoot?.current ?? null, rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rootMargin, scrollRoot, visible]);

  return visible;
}
