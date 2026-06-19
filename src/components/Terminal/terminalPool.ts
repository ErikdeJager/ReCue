// Persistent terminal pool.
//
// `claude` is a full-screen TUI: it emits cursor-positioned escape sequences
// computed for a *specific* PTY width/height. Two things used to corrupt that
// (task #18): (1) the app mounts EITHER Overview OR Focus, so a `<Terminal>`
// React component was disposed + recreated on every view switch — and on
// recreate it replayed server-side scrollback whose absolute cursor moves were
// encoded for a different width; (2) the resize observer resized the PTY on
// every tick, so during a re-tile / inspector slide the PTY was resized
// repeatedly mid-redraw.
//
// The fix: own exactly ONE xterm instance per session here, decoupled from
// React's view mounting. Each instance lives in its own DOM node that is
// *reparented* into whichever view slot is currently showing it (Overview card
// or Focus stage) and *parked* off-screen otherwise — never disposed on a view
// switch. Scrollback is therefore replayed exactly once (at creation), and
// resizes are debounced + only applied while visible, so `claude` repaints once
// at a stable size instead of mid-redraw. Terminal bytes still flow through the
// output bus, never React state (core convention).

import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import { resizePty, sessionScrollback, writeStdin } from "../../ipc";
import { onSessionOutput } from "../../outputBus";
import { terminalsToDispose } from "./poolReconcile";
import styles from "./Terminal.module.css";

// Coalesce the frames of a view re-tile / inspector slide / window drag into a
// single resize after layout settles. Long enough to outlast a 200ms CSS slide
// (the observer keeps firing during the animation, resetting the timer), short
// enough to still feel instant.
const RESIZE_DEBOUNCE_MS = 120;

interface TerminalHost {
  /** Persistent DOM node holding the xterm; reparented between slots. */
  container: HTMLDivElement;
  term: XTerm;
  fit: FitAddon;
  /** The slot currently displaying this terminal, or null when parked. */
  slot: HTMLElement | null;
  /** Debounced fit + PTY resize; no-op while parked/unmeasurable. */
  scheduleResize: () => void;
  dispose: () => void;
}

const hosts = new Map<string, TerminalHost>();
let parking: HTMLDivElement | null = null;

function cssToken(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

/**
 * A lazily-created off-screen layer that holds terminals not currently shown in
 * a view. It is laid out (positioned, sized) so a parked terminal stays
 * measurable — xterm misbehaves at 0×0 — without being visible or interactive.
 */
function parkingLayer(): HTMLDivElement {
  if (!parking) {
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.left = "-99999px";
    el.style.top = "0";
    el.style.width = "800px";
    el.style.height = "600px";
    el.style.overflow = "hidden";
    el.setAttribute("aria-hidden", "true");
    el.dataset.terminalParking = "true";
    document.body.appendChild(el);
    parking = el;
  }
  return parking;
}

function createHost(sessionId: string): TerminalHost {
  const container = document.createElement("div");
  // CSS-module class names are typed `string | undefined`; coerce for the DOM
  // `className` setter (the class always resolves at runtime).
  container.className = styles.terminal ?? "";

  const term = new XTerm({
    fontFamily: cssToken(
      "--mono",
      '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
    ),
    fontSize: 12.5,
    lineHeight: 1.5,
    cursorBlink: true,
    allowProposedApi: true,
    theme: {
      background: cssToken("--terminal-bg", "#11111b"),
      foreground: cssToken("--text-primary", "#cdd6f4"),
      cursor: cssToken("--accent", "#fab387"),
      cursorAccent: cssToken("--terminal-bg", "#11111b"),
      selectionBackground: cssToken(
        "--terminal-selection",
        "rgba(88, 91, 112, 0.5)",
      ),
    },
  });

  const fit = new FitAddon();
  term.loadAddon(fit);
  // Park before opening so the container is attached + measurable.
  parkingLayer().appendChild(container);
  term.open(container);

  // Best-effort GPU renderer; fall back to the default DOM renderer.
  let webgl: WebglAddon | undefined;
  try {
    const addon = new WebglAddon();
    addon.onContextLoss(() => addon.dispose());
    term.loadAddon(addon);
    webgl = addon;
  } catch {
    webgl = undefined;
  }

  const safeFit = () => {
    try {
      fit.fit();
    } catch {
      // container not measurable yet (e.g. mid-transition); ignore
    }
  };

  const host: TerminalHost = {
    container,
    term,
    fit,
    slot: null,
    scheduleResize: () => {},
    dispose: () => {},
  };

  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  const applyResize = () => {
    resizeTimer = undefined;
    // Never resize a parked / unmeasurable terminal: bogus cols/rows would make
    // `claude` repaint at the wrong size. It is refitted when a slot shows it.
    if (host.slot === null) return;
    if (container.offsetWidth === 0 || container.offsetHeight === 0) return;
    safeFit();
    void resizePty(sessionId, term.cols, term.rows).catch(() => {});
  };
  const scheduleResize = () => {
    if (resizeTimer !== undefined) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyResize, RESIZE_DEBOUNCE_MS);
  };
  host.scheduleResize = scheduleResize;

  // Keystrokes / paste -> stdin. Ignore rejections (e.g. a session whose PTY is
  // still resuming in the background after boot).
  const dataSub = term.onData((data) => {
    void writeStdin(sessionId, data).catch(() => {});
  });

  // Buffer live output until the historical scrollback has been replayed, so
  // history and live bytes do not interleave. Because the host outlives the
  // views, this runs exactly ONCE per session — never again on a view switch.
  let replayed = false;
  const pending: Uint8Array[] = [];
  const unsubscribe = onSessionOutput(sessionId, (bytes) => {
    if (replayed) term.write(bytes);
    else pending.push(bytes);
  });

  let disposed = false;
  void sessionScrollback(sessionId)
    .then((bytes) => {
      if (!disposed && bytes.length) term.write(Uint8Array.from(bytes));
    })
    .catch(() => {
      // no scrollback / backend unavailable
    })
    .finally(() => {
      if (disposed) return;
      for (const chunk of pending) term.write(chunk);
      pending.length = 0;
      replayed = true;
    });

  // Reflow when the container's box changes (view re-tile, inspector slide,
  // window resize, or a reparent into a differently-sized slot).
  const observer = new ResizeObserver(scheduleResize);
  observer.observe(container);
  void document.fonts?.ready.then(safeFit);

  host.dispose = () => {
    disposed = true;
    if (resizeTimer !== undefined) clearTimeout(resizeTimer);
    observer.disconnect();
    unsubscribe();
    dataSub.dispose();
    webgl?.dispose();
    term.dispose();
    container.remove();
  };

  return host;
}

function ensureHost(sessionId: string): TerminalHost {
  let host = hosts.get(sessionId);
  if (!host) {
    host = createHost(sessionId);
    hosts.set(sessionId, host);
  }
  return host;
}

/**
 * Show the session's terminal in `slot`, creating it on first use. Reparents the
 * single live xterm node into the slot (no dispose/recreate) and refits it to
 * the slot's size so `claude` repaints once at the right dimensions.
 */
export function mountTerminal(sessionId: string, slot: HTMLElement): void {
  const host = ensureHost(sessionId);
  host.slot = slot;
  if (host.container.parentElement !== slot) {
    slot.appendChild(host.container);
  }
  host.scheduleResize();
}

/**
 * Park the session's terminal off-screen (keeps it alive) when its slot
 * unmounts. Guarded by ownership: if a newer mount already claimed the host
 * (e.g. an Overview→Focus swap moved it first), this stale release is a no-op.
 */
export function unmountTerminal(sessionId: string, slot: HTMLElement): void {
  const host = hosts.get(sessionId);
  if (!host || host.slot !== slot) return;
  host.slot = null;
  parkingLayer().appendChild(host.container);
}

/**
 * Reset a session's pooled terminal so a relaunched PTY repaints cleanly (#63,
 * Restart). The existing host already replayed its scrollback once and still
 * shows the dead session's final screen, so a resumed `claude --resume` would
 * append onto that stale content (the root cause of the broken Restart). Dispose
 * the host and recreate a fresh one in the same slot: it refetches the (now
 * fresh) backend scrollback and re-subscribes to live output, so the relaunched
 * agent paints from a clean state. Recreate eagerly so the new host is listening
 * before the resumed PTY's first output arrives.
 */
export function resetTerminal(sessionId: string): void {
  const stale = hosts.get(sessionId);
  const slot = stale?.slot ?? null;
  if (stale) {
    stale.dispose();
    hosts.delete(sessionId);
  }
  if (slot) mountTerminal(sessionId, slot);
  else ensureHost(sessionId);
}

/** Focus the pooled xterm for `sessionId` (Canvas panel keyboard nav, #76) so
 * subsequent keystrokes go to it. No-op if it isn't mounted. */
export function focusTerminal(sessionId: string): void {
  hosts.get(sessionId)?.term.focus();
}

/**
 * Dispose terminals whose sessions have been removed. Call when the session list
 * changes; an exited-but-still-listed session keeps its terminal (and overlay).
 */
export function reconcileTerminals(active: Iterable<string>): void {
  for (const id of terminalsToDispose(hosts.keys(), active)) {
    hosts.get(id)?.dispose();
    hosts.delete(id);
  }
}
