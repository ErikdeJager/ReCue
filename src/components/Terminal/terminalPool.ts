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
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import { decodeOutputB64 } from "../../decodeOutput";
import {
  clipboardReadText,
  openUrl,
  resizePty,
  saveClipboardImage,
  sessionScrollback,
  writeStdin,
} from "../../ipc";
import { onSessionOutput } from "../../outputBus";
import { isLinux, isWindows } from "../../platform";
import { useStore } from "../../store";
import { IS_MAIN_WINDOW } from "../../windowContext";
import { makePasteKeyHandler } from "./pasteHandler";
import { terminalsToDispose } from "./poolReconcile";
import { dedupeAgainstScrollback } from "./replayDedupe";
import styles from "./Terminal.module.css";
import { isSoftwareWebGLRenderer } from "./webglRenderer";
import { windowsPtyOption } from "./windowsPty";

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

// The WebGL glyph atlas is SHARED by every pooled terminal of identical config (xterm's
// addon-webgl caches one TextureAtlas per config), so it only needs clearing ONCE — the
// first time the real font has loaded (#221). Guarding it stops a later spawn from wiping
// the shared atlas out from under the already-running agents (the post-spawn "font jumble").
let fontAtlasRebuilt = false;

/** Live xterm options (#100): applied to new terminals at creation and to every
 * pooled terminal when the user saves Settings. Defaults match the original
 * hard-coded values, so behavior is unchanged until a setting is saved. */
let currentTerminalSettings = {
  fontSize: 12.5,
  lineHeight: 1.2,
  cursorBlink: true,
};

// Linux software-WebGL fallback (#346): WebKitGTK can hand out a WebGL context that
// is silently software-rasterized (llvmpipe/SwiftShader — e.g. NVIDIA driver or
// DMA-BUF trouble), so the addon "works" but every terminal frame renders on the
// CPU. Probe the renderer string ONCE per app and skip the WebGL addon when it names
// a software rasterizer — xterm then uses its DOM renderer (the detached-window
// fallback, #105), which is faster than software GL. macOS/Windows short-circuit to
// `true` and never construct the probe canvas, so their rendering is byte-for-byte
// unchanged.
let webglAllowedMemo: boolean | undefined;

/** Read the WebGL renderer string from a throwaway context, or null if WebGL is
 * unavailable at all. */
function probeWebglRendererString(): string | null {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return null;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer: unknown = info
      ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return typeof renderer === "string" ? renderer : null;
  } catch {
    return null;
  }
}

function webglAllowed(): boolean {
  if (webglAllowedMemo !== undefined) return webglAllowedMemo;
  const { platform } = useStore.getState();
  // Platform signal not loaded yet (outside Tauri, or a pre-init host): keep WebGL
  // and do NOT memoize, so a later Linux terminal still gets the real probe. Boot
  // loads the platform before the first refresh (store `init`), so in practice
  // every host creation sees a real value.
  if (platform === "") return true;
  if (!isLinux(platform)) {
    webglAllowedMemo = true;
    return webglAllowedMemo;
  }
  const renderer = probeWebglRendererString();
  webglAllowedMemo = renderer !== null && !isSoftwareWebGLRenderer(renderer);
  if (!webglAllowedMemo) {
    console.warn(
      `[recue] terminals: skipping WebGL renderer (software rasterizer${renderer ? `: ${renderer}` : " — no WebGL context"}); using the DOM renderer`,
    );
  }
  return webglAllowedMemo;
}

/**
 * Apply the Settings terminal options (#100) to every live pooled terminal and to
 * any created later. xterm `options` are mutable; a debounced refit follows the
 * metric change so `claude`'s TUI repaints at the new cell size.
 */
export function applyTerminalSettings(s: {
  fontSize: number;
  lineHeight: number;
  cursorBlink: boolean;
}): void {
  currentTerminalSettings = { ...s };
  for (const host of hosts.values()) {
    host.term.options.fontSize = s.fontSize;
    host.term.options.lineHeight = s.lineHeight;
    host.term.options.cursorBlink = s.cursorBlink;
    host.scheduleResize();
  }
}

function cssToken(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

/**
 * The CSS-pixel height of one rendered terminal row (#262), read from xterm's
 * render metrics. xterm exposes no public getter for this, so we read the
 * internal render service **defensively**: any shape change (or a not-yet-measured
 * terminal) returns `undefined` and the caller falls back to the FitAddon-only
 * behavior — it never throws. This is a pure WebView measurement (xterm's own cell
 * sizing), identical under WKWebView (macOS) and WebView2 (Windows).
 */
function rowHeightCss(term: XTerm): number | undefined {
  try {
    const core = (
      term as unknown as {
        _core?: {
          _renderService?: {
            dimensions?: { css?: { cell?: { height?: number } } };
          };
        };
      }
    )._core;
    const h = core?._renderService?.dimensions?.css?.cell?.height;
    return typeof h === "number" && h > 0 ? h : undefined;
  } catch {
    return undefined;
  }
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

  // ConPTY handling on Windows (absent on macOS, so the constructor is unchanged there).
  const { platform, windowsBuild } = useStore.getState();
  const windowsPty = windowsPtyOption(platform, windowsBuild);

  const term = new XTerm({
    fontFamily: cssToken(
      "--mono",
      '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
    ),
    fontSize: currentTerminalSettings.fontSize,
    lineHeight: currentTerminalSettings.lineHeight,
    cursorBlink: currentTerminalSettings.cursorBlink,
    allowProposedApi: true,
    ...(windowsPty ? { windowsPty } : {}),
    theme: {
      background: cssToken("--terminal-bg", "#11111b"),
      foreground: cssToken("--terminal-fg", "#cdd6f4"),
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

  // Best-effort GPU renderer; fall back to the default DOM renderer. Skipped in a
  // detached canvas window (#84/#105): a freshly-opened native window renders agent
  // TUIs with doubled/ghosted glyphs and misaligned box-drawing — a known WebGL
  // glyph-atlas / devicePixelRatio artifact in a secondary window — so detached
  // windows use the DOM renderer (visually equivalent, no artifact). Also skipped on
  // Linux when the one-time probe says WebGL is software-rasterized (#346, see
  // `webglAllowed` above). The main window on macOS/Windows keeps WebGL, so its
  // rendering is provably unchanged.
  let webgl: WebglAddon | undefined;
  if (IS_MAIN_WINDOW && webglAllowed()) {
    try {
      const addon = new WebglAddon();
      addon.onContextLoss(() => addon.dispose());
      term.loadAddon(addon);
      webgl = addon;
    } catch {
      webgl = undefined;
    }
  }

  // Clickable http/https links (#109). Hover underlines a URL; the custom activate
  // handler opens it only on a ⌘/Ctrl-click (`metaKey || ctrlKey`, #143 — Ctrl on
  // Windows, ⌘ on macOS) — a plain click is left to the terminal/TUI (drag-to-select,
  // claude's own mouse handling). Opening goes through the backend `open_url`, which
  // rejects any non-http(s) scheme, instead of the addon's default `window.open`.
  // Shared by every terminal kind (agent + shell #72) since the pool owns them all.
  const webLinks = new WebLinksAddon((event, uri) => {
    if (event.metaKey || event.ctrlKey) void openUrl(uri).catch(() => {});
  });
  term.loadAddon(webLinks);

  // Windows paste (#220): on Windows we intercept the Ctrl+V / Ctrl+Shift+V chord,
  // read the OS clipboard ourselves, and paste it via `term.paste` (bracketed-paste-
  // aware) — returning false so xterm does NOT also emit ^V, and preventDefault-ing
  // the keydown so the browser's default paste action does NOT fire xterm's native
  // `paste` listener a second time (the double-paste bug — see pasteHandler.ts).
  // macOS/Linux are untouched: ⌘V keeps its native paste and Ctrl+V stays ^V (we
  // only act when `isWindows`). Ctrl+C is never touched, so it remains the agent's
  // SIGINT. Platform is read live from the store (set once at boot, long before any
  // keystroke). Shared by agent + shell terminals.
  term.attachCustomKeyEventHandler(
    makePasteKeyHandler({
      isWin: () => isWindows(useStore.getState().platform),
      paste: (text) => term.paste(text),
      readText: clipboardReadText,
      saveImage: saveClipboardImage,
    }),
  );

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
    // Conservative bottom-clearance guard (#262). FitAddon picks
    // rows = floor(contentHeight / cellHeight) from xterm's measured cell height,
    // but the *painted* row can be a hair taller (sub-pixel rounding at certain
    // font-size/line-height combos), so rows × cellHeight can exceed the padded
    // content box and push the last row — claude's prompt / input line — below the
    // panel's bottom edge (the reported "last line falls out of view" bug, which
    // only a clear used to fix). When that would happen, tell the PTY one fewer row
    // so the last line is always fully visible. Best-effort: a failed metrics read
    // (`rowHeightCss` → undefined) or `term.resize` just keeps the FitAddon result,
    // never throwing. Pure WebView measurement, identical on macOS / Windows.
    const cellH = rowHeightCss(term);
    if (cellH !== undefined && term.rows > 1) {
      const cs = getComputedStyle(container);
      const padV =
        (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const contentH = container.clientHeight - padV;
      // Tolerate sub-pixel rounding; only shave when a full visible row is clipped.
      if (contentH > 0 && term.rows * cellH > contentH + 1) {
        try {
          term.resize(term.cols, term.rows - 1);
        } catch {
          // keep the FitAddon result on any resize failure
        }
      }
    }
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

  // rAF-coalesced writes (#261): under heavy output (a long build/log) a separate
  // `term.write` per ~8 KB IPC chunk floods the single WebView main thread, starving
  // React's keystroke handling everywhere (the Kanban textarea, a second terminal).
  // Instead buffer the frame's chunks and flush them in ONE `term.write` on the next
  // animation frame, so a burst costs one parse + one repaint per frame. Ordering is
  // preserved (FIFO), and a steady stream still flushes ~60×/s so latency stays low.
  let writeBuffer: Uint8Array[] = [];
  let writeRaf: number | undefined;
  const flushWrites = () => {
    writeRaf = undefined;
    if (writeBuffer.length === 0) return;
    const chunks = writeBuffer;
    writeBuffer = [];
    // Concatenate the frame's chunks so xterm parses the whole burst in a single
    // write — much cheaper than one write call per chunk.
    let total = 0;
    for (const c of chunks) total += c.length;
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    term.write(merged);
  };
  const scheduleFlush = () => {
    if (writeRaf === undefined) writeRaf = requestAnimationFrame(flushWrites);
  };

  // Buffer live output until the historical scrollback has been replayed, so
  // history and live bytes do not interleave. Because the host outlives the
  // views, this runs exactly ONCE per session — never again on a view switch.
  // Each chunk keeps its absolute end-offset so we can drop the scrollback ↔ live
  // OVERLAP on a fresh spawn (which otherwise double-paints startup → stray glyph).
  let replayed = false;
  let scrollbackEnd = 0;
  const pending: { bytes: Uint8Array; offset: number }[] = [];
  const unsubscribe = onSessionOutput(sessionId, (bytes, offset) => {
    if (!replayed) {
      pending.push({ bytes, offset });
      return;
    }
    // After replay, live is always newer than the snapshot, but dedupe defensively in
    // case a chunk straddling the boundary arrives late.
    const fresh = dedupeAgainstScrollback(bytes, offset, scrollbackEnd);
    if (fresh.length === 0) return;
    writeBuffer.push(fresh);
    scheduleFlush();
  });

  let disposed = false;
  void sessionScrollback(sessionId)
    .then((reply) => {
      scrollbackEnd = reply.end;
      // base64 → bytes (#346): the reply carries the retained scrollback as a compact
      // string (the #261 live-output encoding) instead of a JSON integer array that
      // cost a megabyte-plus parse per terminal mount.
      const replayBytes = decodeOutputB64(reply.b64);
      if (!disposed && replayBytes.length) {
        term.write(replayBytes);
      }
    })
    .catch(() => {
      // no scrollback / backend unavailable — leave scrollbackEnd at 0 so nothing is
      // dropped (every live chunk then writes in full).
    })
    .finally(() => {
      if (disposed) return;
      for (const { bytes, offset } of pending) {
        const fresh = dedupeAgainstScrollback(bytes, offset, scrollbackEnd);
        if (fresh.length) term.write(fresh);
      }
      pending.length = 0;
      replayed = true;
    });

  // Reflow when the container's box changes (view re-tile, inspector slide,
  // window resize, or a reparent into a differently-sized slot).
  const observer = new ResizeObserver(scheduleResize);
  observer.observe(container);

  // Make JetBrains Mono actually load + apply in the terminal (#221, worst on Windows).
  // A canvas/WebGL renderer draws glyphs into a texture rather than laying out DOM text,
  // so the bundled webfont is never fetched on xterm's behalf and `document.fonts.ready`
  // can resolve before (or without) it — leaving the WebGL glyph atlas built with
  // fallback-font metrics (the subtly "jiggly" look, "C" especially). So explicitly load
  // the faces, then rebuild the atlas + re-measure the character cell with the now-loaded
  // font. OS-neutral and harmless on macOS (already crisp — re-measuring after the real
  // font loads stays correct there). Guarded against a host disposed mid-load.
  void (async () => {
    const size = currentTerminalSettings.fontSize;
    try {
      await Promise.all(
        [400, 500, 700].map((weight) =>
          document.fonts.load(`${weight} ${size}px "JetBrains Mono"`),
        ),
      );
    } catch {
      // a missing/unsupported face rejects load(); fall through to a best-effort refit
    }
    try {
      await document.fonts?.ready;
    } catch {
      // ignore — proceed to the best-effort rebuild regardless
    }
    if (disposed) return;
    // Rebuild the GL atlas and force xterm to re-measure the cell with the loaded font.
    // Re-applying fontFamily (via a transient that never paints — both writes are
    // synchronous within this frame) triggers xterm's char-size service to re-measure;
    // clearing the atlas makes the next render re-rasterize glyphs at the corrected
    // metrics. `refresh` repaints every row; `safeFit` recomputes cols/rows for the
    // possibly-changed cell size.
    //
    // The atlas is SHARED across every pooled terminal of identical config, so clear it only
    // the FIRST time the real font has loaded. Doing it on every spawn wiped the shared atlas
    // out from under the already-running agents — whose render models still referenced the
    // old glyph slots — scrambling their output until a reflow re-warmed it (the post-spawn
    // "font jumble"). Every later terminal shares the already-corrected atlas; the fontFamily
    // re-measure below still repaints IT (a full model clear via the options-change handler),
    // so its glyphs are crisp without disturbing anyone else's. No-op with the DOM renderer
    // (`webgl` undefined, e.g. detached windows #105), which has no shared GL atlas.
    if (webgl && !fontAtlasRebuilt) {
      fontAtlasRebuilt = true;
      webgl.clearTextureAtlas();
    }
    const family = term.options.fontFamily;
    term.options.fontFamily = "monospace";
    term.options.fontFamily = family;
    term.refresh(0, term.rows - 1);
    safeFit();
  })();

  host.dispose = () => {
    disposed = true;
    if (resizeTimer !== undefined) clearTimeout(resizeTimer);
    // Flush any buffered tail bytes (and cancel the pending frame) before the term
    // goes away, so a final burst isn't dropped on teardown (#261).
    if (writeRaf !== undefined) cancelAnimationFrame(writeRaf);
    flushWrites();
    observer.disconnect();
    unsubscribe();
    dataSub.dispose();
    webLinks.dispose();
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
