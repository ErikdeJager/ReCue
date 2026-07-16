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
//
// #351 defers *creation* without touching any of that: `Terminal.tsx` calls
// `mountTerminal` only once its slot first becomes visible (a latching
// IntersectionObserver gate, `useVisibleOnce.ts`), so an Overview wall of N agents no
// longer builds N xterms + N WebGL contexts + N scrollback replays at boot. The replays
// that do happen are serialized through a bounded FIFO queue (`replayQueue.ts`), and live
// bytes arriving before a host exists are simply not subscribed — the backend's retained
// `Scrollback` replays them at creation (exactly the path a session not rendered in the
// current view already took). Creation is deferred; a host is still NEVER disposed or
// recycled on a scroll-out / view switch — that is the #18 invariant above.

import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
// The WebGL addon (~107 kB) is the one xterm piece that is already conditional at
// runtime (main window + a non-software rasterizer), so it is `import()`ed on demand in
// `createHost` and kept out of the first-paint bundle (#356). xterm core + fit +
// web-links + the xterm CSS stay static — terminals ARE the app's first paint and must
// never wait on a chunk. The type import is erased at compile time (no runtime edge).
import type { WebglAddon } from "@xterm/addon-webgl";
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
import { focusedTerminalElement } from "./hoverFocus";
import { effectiveCursorBlink, reducedMotionActive } from "./motionPolicy";
import { makePasteKeyHandler } from "./pasteHandler";
import {
  PENDING_CAP_BYTES,
  type PendingChunk,
  pushPending,
} from "./pendingOutput";
import { terminalsToDispose } from "./poolReconcile";
import { dedupeAgainstScrollback } from "./replayDedupe";
import { createReplayQueue } from "./replayQueue";
import styles from "./Terminal.module.css";
import {
  TERMINAL_BG_DARKEST,
  terminalBackgroundColor,
} from "./terminalBackground";
import { webglFallback } from "./webglFallback";
import {
  decideTerminalRenderer,
  type TerminalRendererDecision,
  type TerminalRendererMode,
} from "./webglRenderer";
import { windowsPtyOption } from "./windowsPty";

// Coalesce the frames of a view re-tile / inspector slide / window drag into a
// single resize after layout settles. Long enough to outlast a 200ms CSS slide
// (the observer keeps firing during the animation, resetting the timer), short
// enough to still feel instant.
const RESIZE_DEBOUNCE_MS = 120;

// Scrollback replays are SERIALIZED (#351). Hydrating a terminal is an IPC round-trip
// plus an ANSI parse of up to 256 KB on the single WebView main thread; several of those
// racing each other (a boot straight into an Overview wall, or a fast scroll across it)
// means nothing paints until they all finish. One at a time — with a macrotask yield
// between jobs — makes the first terminal paint as fast as a single replay and keeps input
// echo responsive while the rest fill in. Raise this if first-paint latency for the LAST
// terminal ever matters more than main-thread smoothness.
const MAX_CONCURRENT_REPLAYS = 1;
const replays = createReplayQueue(MAX_CONCURRENT_REPLAYS);

// A `term.write` callback must never be able to wedge the replay queue (a terminal
// disposed mid-write, or an xterm that never calls back).
const WRITE_TIMEOUT_MS = 2000;

/** Resolve once the write has been parsed by xterm — or after a safety timeout.
 * Awaiting the write callback is what actually spreads the ANSI parse across the
 * queue: the next terminal's fetch only starts after this one has been parsed. */
function writeAndWait(term: XTerm, bytes: Uint8Array): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, WRITE_TIMEOUT_MS);
    try {
      term.write(bytes, done);
    } catch {
      done();
    }
  });
}

// A focus request for a session whose terminal does not exist yet (#351): the Canvas's
// active-leaf effect can call `focusTerminal` a frame before the visibility gate creates
// the host. The request is replayed by the next `mountTerminal` for that id, and expires
// so a stale request can never steal focus much later.
const PENDING_FOCUS_MS = 3000;
let pendingFocus: { id: string; at: number } | null = null;

interface TerminalHost {
  /** Persistent DOM node holding the xterm; reparented between slots. */
  container: HTMLDivElement;
  term: XTerm;
  fit: FitAddon;
  /** The slot currently displaying this terminal, or null when parked. */
  slot: HTMLElement | null;
  /** The attached WebGL addon, or undefined when this terminal renders via xterm's DOM
   * renderer (a detached window #105, a software rasterizer #346, a Settings override
   * #357, or a failed/lost GL context). Lives on the host — not a `createHost` closure
   * local — so `applyTerminalRenderer` can add/remove it on the RUNNING xterm. */
  webgl?: WebglAddon;
  /** Attach the WebGL addon to the live xterm (lazy `import()`, #356). Idempotent and
   * best-effort: any failure leaves the DOM renderer, exactly as today. */
  loadWebgl: () => Promise<void>;
  /** Detach it → xterm reverts to its DOM renderer (the very path `onContextLoss`
   * already takes). Never disposes the host. */
  unloadWebgl: () => void;
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
  // 1.0 (#367): tracks DEFAULT_SETTINGS.terminalLineHeight, used for any xterm created
  // before applyTerminalSettings runs.
  lineHeight: 1.0,
  cursorBlink: true,
  // 25 (#414) = a slightly brightened background; tracks
  // DEFAULT_SETTINGS.terminalBackgroundLightness, used for any xterm created before
  // applyTerminalSettings runs. 0 is the near-black `--terminal-bg` base.
  // `resolveTerminalBg` interpolates from the live `--terminal-bg` toward gray by this
  // slider value.
  background: 25,
};

/** The concrete terminal background hex for the current lightness setting (#390),
 * interpolated from the live `--terminal-bg` token (default near-black `#11111b`)
 * toward the gray endpoint. Read fresh so a theme change to the base still flows
 * through. Falls back to the darkest base outside a DOM (unit tests). */
function resolveTerminalBg(): string {
  const base =
    typeof document !== "undefined"
      ? cssToken("--terminal-bg", TERMINAL_BG_DARKEST)
      : TERMINAL_BG_DARKEST;
  return terminalBackgroundColor(currentTerminalSettings.background, base);
}

/** Whether reduced motion is in force right now (UI v2 §2.5, task 383): the app's
 * Settings toggle (read from the store — `set({ settings })` runs before
 * `applySettingsEffects`, so this is already current on Save) OR the OS
 * `prefers-reduced-motion` query. `currentTerminalSettings.cursorBlink` keeps the
 * user's RAW setting, so un-toggling reduced motion restores blink on the next
 * apply. */
function reducedMotionNow(): boolean {
  let appSetting = false;
  try {
    appSetting = useStore.getState().settings.reduceMotion;
  } catch {
    appSetting = false; // store not ready (unit tests) — the media query decides
  }
  return reducedMotionActive(appSetting);
}

// Linux software-WebGL fallback (#346): WebKitGTK can hand out a WebGL context that
// is silently software-rasterized (llvmpipe/SwiftShader — e.g. NVIDIA driver or
// DMA-BUF trouble), so the addon "works" but every terminal frame renders on the
// CPU. Probe the renderer string ONCE per app and skip the WebGL addon when it names
// a software rasterizer — xterm then uses its DOM renderer (the detached-window
// fallback, #105), which is faster than software GL. macOS/Windows never construct
// the probe canvas and always keep WebGL, so their rendering is byte-for-byte
// unchanged.
//
// #357 splits the memo in two: the raw probe is cached here, while the *decision* is
// recomputed from it plus the persisted Settings mode — so the user can override a probe
// their machine defeats (WebKitGTK masks the renderer string on some stacks; Tauri's own
// Linux-graphics guidance is to ship the switch), live, without re-probing.
//
// `undefined` = not probed yet; `null` = probed, no WebGL context at all.
let probedRendererMemo: string | null | undefined;

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

/** The probed renderer string, run at most once per window (Linux only — every caller
 * is behind an `isLinux` guard, so macOS/Windows never build the probe canvas). */
function probedRenderer(): string | null {
  if (probedRendererMemo === undefined) {
    probedRendererMemo = probeWebglRendererString();
  }
  return probedRendererMemo;
}

// The frontend counterpart of the Rust DMA-BUF boot line (#347): log the renderer
// decision so a real-box report shows both halves. Keyed by reason, so it logs once per
// distinct outcome — including once more if the user changes the setting (which is the
// one time a *new* line is worth having).
let loggedRendererReason: string | undefined;

/** Which renderer this window's terminals should use, from the persisted Settings mode
 * (#357) and the one-time probe (#346). Recomputed on demand — cheap (the probe is
 * memoized). macOS/Windows short-circuit to WebGL **without probing**, whatever the
 * persisted value happens to be, so they are byte-for-byte unchanged. */
function rendererDecision(): TerminalRendererDecision {
  const { platform, settings } = useStore.getState();
  // Platform signal not loaded yet (outside Tauri, or a pre-init host): keep WebGL and do
  // NOT probe, so a later Linux terminal still gets the real decision. Boot loads the
  // platform before the first refresh (store `init`), so in practice every host creation
  // sees a real value — and `applySettingsEffects` re-converges the pool afterwards anyway.
  if (platform === "") return { webgl: true, reason: "platform not loaded" };
  if (!isLinux(platform)) return { webgl: true, reason: "GPU renderer" };

  const decision = decideTerminalRenderer(
    settings.linuxTerminalRenderer,
    probedRenderer(),
  );
  if (loggedRendererReason !== decision.reason) {
    loggedRendererReason = decision.reason;
    if (decision.webgl) {
      console.info(`[recue] terminals: WebGL renderer (${decision.reason})`);
    } else {
      console.warn(
        `[recue] terminals: skipping WebGL renderer (${decision.reason}); using the DOM renderer`,
      );
    }
  }
  return decision;
}

/**
 * May a terminal in this window attach xterm's WebGL addon *right now*? The AND of the two
 * independent gates, deliberately in this order:
 *
 *   1. The **#364 context-loss latch**. Once any terminal in this window has suffered an
 *      UNRECOVERED WebGL context loss, none re-attaches the addon for the rest of the run
 *      — a GPU that dropped one context will drop the next, so retrying is a context storm
 *      on an already-sick driver. Checked FIRST, so a fallen-back window never even
 *      constructs the #346 probe canvas — and, crucially, **the latch beats the #357
 *      Settings override**: a user forcing "WebGL" on a window that already lost a context
 *      does NOT get the addon back (it would re-run exactly the failure the latch caught).
 *      Only a relaunch re-arms it.
 *   2. The **#346/#357 decision** — the one-time software-rasterizer probe folded together
 *      with the persisted Settings mode (auto / force-webgl / force-dom).
 *
 * Callers add the third constraint, `IS_MAIN_WINDOW` (#105 — a detached canvas window
 * always renders through xterm's DOM renderer).
 */
function webglPermitted(): boolean {
  return webglFallback.allowsWebgl() && rendererDecision().webgl;
}

/**
 * Apply the Linux terminal-renderer override (#357) to the **live** pool — without
 * disposing any host. That is the #18 invariant: a dispose would replay scrollback whose
 * absolute cursor moves were encoded for another width, garbling `claude`'s TUI. xterm
 * supports loading **and** disposing the WebGL addon on a *running* terminal (disposing it
 * reverts to the DOM renderer — the exact path `onContextLoss` already takes), so the swap
 * is an addon operation, never a terminal one.
 *
 * A converge-to-target loop: it only acts on a host whose addon state differs from the
 * target, so it is safe to call repeatedly (it runs on every Save, and on boot after the
 * settings blob loads). No-op off Linux and in a detached canvas window (#105 — those
 * always use the DOM renderer). The target is `webglPermitted()`, so a window latched to
 * DOM by a context loss (#364) stays there even if the user then forces "WebGL".
 */
export function applyTerminalRenderer(): void {
  if (!IS_MAIN_WINDOW) return;
  if (!isLinux(useStore.getState().platform)) return;
  const wantWebgl = webglPermitted();
  for (const host of hosts.values()) {
    if (wantWebgl && !host.webgl) {
      void host.loadWebgl();
    } else if (!wantWebgl && host.webgl) {
      host.unloadWebgl();
    } else {
      continue; // already on the target renderer
    }
    // Repaint every row at the new renderer and re-fit (the cell metrics can differ a
    // hair between the GL and DOM renderers). NEVER `clearTextureAtlas()`: the atlas is
    // SHARED across the pool, so clearing it from under the other terminals is the #221
    // "font jumble" — and the font has long since loaded by now anyway.
    host.term.refresh(0, host.term.rows - 1);
    host.scheduleResize();
  }
}

/** The terminal half of the Settings → Rendering diagnostics (#357): the persisted mode,
 * the renderer actually in use, the probed renderer string, and why. Runs the probe on
 * demand, so the readout works with **zero** terminals open. */
export function terminalRendererReport(): {
  mode: TerminalRendererMode;
  active: "webgl" | "dom";
  renderer: string | null;
  reason: string;
} {
  const { platform, settings } = useStore.getState();
  const decision = rendererDecision();
  // The #364 latch overrides the decision (including a forced "webgl"), so the readout has
  // to say so — otherwise Settings would claim WebGL on a window that fell back to the DOM
  // renderer after an unrecovered context loss.
  const webgl = decision.webgl && webglFallback.allowsWebgl();
  const latched = decision.webgl && !webgl;
  return {
    mode: settings.linuxTerminalRenderer,
    // A detached canvas window is always DOM (#105), whatever the decision says.
    active: IS_MAIN_WINDOW && webgl ? "webgl" : "dom",
    renderer: isLinux(platform) ? probedRenderer() : null,
    reason: latched
      ? "WebGL context lost and not restored; DOM renderer for the rest of this run"
      : decision.reason,
  };
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
  background: number;
}): void {
  currentTerminalSettings = { ...s };
  // Effective blink (UI v2 §2.5, task 383): xterm's canvas cursor is out of reach
  // of the CSS reduced-motion killswitch, so gate it here — an options mutation on
  // the live xterm, never a host dispose (#18).
  const blink = effectiveCursorBlink(s.cursorBlink, reducedMotionNow());
  // Terminal background lightness (#390): compute the concrete hex once and apply it
  // to every live host in this same synchronous pass, so all pooled terminals converge
  // together (not the #221 shared-atlas hazard). Reassign the whole `theme` object —
  // mutating a nested field won't trigger xterm's update — and never clear the atlas.
  const bg = resolveTerminalBg();
  for (const host of hosts.values()) {
    host.term.options.fontSize = s.fontSize;
    host.term.options.lineHeight = s.lineHeight;
    host.term.options.cursorBlink = blink;
    host.term.options.theme = {
      ...host.term.options.theme,
      background: bg,
      cursorAccent: bg,
    };
    host.scheduleResize();
  }
  // Publish to the wrapper padding-frame CSS (#390): the wrapper reads
  // `var(--terminal-bg-user, var(--terminal-bg))`, so setting it here keeps the frame
  // in lockstep with the xterm canvas. Runs per-document on boot + Save, covering the
  // main window and each detached canvas window (#84).
  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--terminal-bg-user", bg);
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

  // Configurable terminal background (#390): the same interpolated hex backs both the
  // xterm canvas and its cursor-contrast color, so a terminal created after a Save
  // opens at the chosen lightness.
  const bg = resolveTerminalBg();

  const term = new XTerm({
    fontFamily: cssToken(
      "--mono",
      '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
    ),
    fontSize: currentTerminalSettings.fontSize,
    lineHeight: currentTerminalSettings.lineHeight,
    // Gated by reduced motion (UI v2 §2.5, task 383) — see applyTerminalSettings.
    cursorBlink: effectiveCursorBlink(
      currentTerminalSettings.cursorBlink,
      reducedMotionNow(),
    ),
    allowProposedApi: true,
    ...(windowsPty ? { windowsPty } : {}),
    theme: {
      // #390: both the canvas background and the cursor's contrast color follow the
      // configurable terminal-background lightness (default 0 = `#11111b`, unchanged).
      background: bg,
      foreground: cssToken("--terminal-fg", "#cdd6f4"),
      cursor: cssToken("--accent", "#fab387"),
      cursorAccent: bg,
      selectionBackground: cssToken(
        "--terminal-selection",
        "rgba(88, 91, 112, 0.5)",
      ),
      // ANSI palette from tokens (UI v2 §7, task 379) — creation-time read like the
      // bg/fg/cursor entries above; identical values for every pooled terminal, so
      // the shared WebGL glyph atlas (#221) stays shared.
      black: cssToken("--terminal-ansi-black", "#45475a"),
      red: cssToken("--terminal-ansi-red", "#f38ba8"),
      green: cssToken("--terminal-ansi-green", "#a6e3a1"),
      yellow: cssToken("--terminal-ansi-yellow", "#f9e2af"),
      blue: cssToken("--terminal-ansi-blue", "#89b4fa"),
      magenta: cssToken("--terminal-ansi-magenta", "#f5c2e7"),
      cyan: cssToken("--terminal-ansi-cyan", "#94e2d5"),
      white: cssToken("--terminal-ansi-white", "#bac2de"),
      brightBlack: cssToken("--terminal-ansi-bright-black", "#585b70"),
      brightRed: cssToken("--terminal-ansi-bright-red", "#f38ba8"),
      brightGreen: cssToken("--terminal-ansi-bright-green", "#a6e3a1"),
      brightYellow: cssToken("--terminal-ansi-bright-yellow", "#f9e2af"),
      brightBlue: cssToken("--terminal-ansi-bright-blue", "#89b4fa"),
      brightMagenta: cssToken("--terminal-ansi-bright-magenta", "#f5c2e7"),
      brightCyan: cssToken("--terminal-ansi-bright-cyan", "#94e2d5"),
      brightWhite: cssToken("--terminal-ansi-bright-white", "#a6adc8"),
    },
  });

  const fit = new FitAddon();
  term.loadAddon(fit);
  // Park before opening so the container is attached + measurable.
  parkingLayer().appendChild(container);
  term.open(container);

  // Set by `host.dispose()`. Hoisted above the WebGL block so the async addon load (and
  // the scrollback replay / font-atlas rebuild further down) can bail out when the host
  // was torn down while their promise was in flight.
  let disposed = false;

  const safeFit = () => {
    try {
      fit.fit();
    } catch {
      // container not measurable yet (e.g. mid-transition); ignore
    }
  };

  // The host record is built up front (#357) so the WebGL addon can live ON it rather than
  // in a closure local — that is what lets `applyTerminalRenderer` add/remove the addon on
  // this RUNNING xterm later, without ever disposing the host (#18). The function fields
  // are filled in below, as they always were.
  const host: TerminalHost = {
    container,
    term,
    fit,
    slot: null,
    webgl: undefined,
    loadWebgl: () => Promise.resolve(),
    unloadWebgl: () => {},
    scheduleResize: () => {},
    dispose: () => {},
  };

  // Best-effort GPU renderer; fall back to the default DOM renderer. Skipped in a
  // detached canvas window (#84/#105): a freshly-opened native window renders agent
  // TUIs with doubled/ghosted glyphs and misaligned box-drawing — a known WebGL
  // glyph-atlas / devicePixelRatio artifact in a secondary window — so detached
  // windows use the DOM renderer (visually equivalent, no artifact). Also skipped on
  // Linux when the one-time probe says WebGL is software-rasterized (#346) or the user
  // forced the DOM renderer in Settings → Rendering (#357) — see `rendererDecision`.
  // The main window on macOS/Windows keeps WebGL, so its rendering is provably unchanged.
  // And skipped once ANY terminal in this window has suffered an UNRECOVERED WebGL
  // context loss (#364): a GPU that dropped one context (OOM / driver reset / suspend,
  // likeliest on WebKitGTK) will drop the next one too, so re-attaching would be a
  // context storm on an already-sick driver. `webglPermitted()` checks that latch BEFORE
  // the #346/#357 decision, so a fallen-back window doesn't even construct the probe
  // canvas — and the latch outranks a forced "webgl" from Settings.
  //
  // The addon is fetched as its own chunk (#356), so the terminal paints its first
  // frame(s) on xterm's DOM renderer and swaps to WebGL a few ms later, when the chunk
  // resolves — xterm supports `loadAddon` after `open()`, which is exactly the order the
  // code already used, only synchronously. When the decision is DOM (a detached window, a
  // software rasterizer, the Settings override, or the #364 latch) the chunk is never even
  // requested. Any failure (chunk error, WebGL ctor throw) leaves `host.webgl` undefined ⇒
  // the DOM renderer, as today.
  //
  // Because the load is async, the #364 handler is attached to the addon *instance the
  // chunk resolves to*, and both guards are re-checked after the await: `disposed` (the
  // host was torn down mid-load — never attach to a dead terminal) and the latch (another
  // terminal in this window lost its context while our chunk was in flight — attaching now
  // would be exactly the context storm the latch exists to prevent).
  //
  // The renderer record starts at "dom" for every host, which is literally true until the
  // chunk resolves, and is upgraded to "webgl" only once the addon has actually attached.
  webglFallback.noteRenderer(sessionId, "dom");
  host.loadWebgl = async () => {
    // The latch is re-checked here too (not just at the call site) so the #357 live toggle
    // can never re-attach the addon on a window that already lost a context.
    if (disposed || host.webgl || !webglFallback.allowsWebgl()) return;
    try {
      const { WebglAddon } = await import("@xterm/addon-webgl");
      // Re-check after the await: the host may have been disposed, a concurrent call may
      // have won the race, or another terminal in this window may have latched the whole
      // window to DOM (#364) — while the chunk was in flight.
      if (disposed || host.webgl || !webglFallback.allowsWebgl()) return;
      const addon = new WebglAddon();
      addon.onContextLoss(() => {
        // Fired ONLY when the context was not restored within the addon's ~3s window,
        // i.e. the renderer is dead (the addon handles a *recovered* loss internally, so
        // there is nothing to re-attach or retry). Disposing the addon is the documented
        // recovery: xterm swaps its render service back to the DOM renderer and re-lays
        // out the SAME buffer — no host dispose, no scrollback replay, so the #18 pool
        // invariant holds and `claude`'s width-specific TUI is not garbled.
        //
        // Clear our reference FIRST: the #221 font-atlas block below runs async (it awaits
        // `webglReady` + the font load), and on a disposed addon it would both call into a
        // dead renderer AND burn the one-shot module-global `fontAtlasRebuilt` flag that
        // the other live terminals still need.
        host.webgl = undefined;
        if (webglFallback.noteContextLoss(sessionId)) {
          console.warn(
            "[recue] terminals: WebGL context lost and not restored; falling back to xterm's DOM renderer for the rest of this run",
          );
        }
        addon.dispose();
        // Belt-and-braces repaint: the addon's own dispose already sets the DOM renderer
        // and re-handles the resize, but a forced refresh guarantees the rows repaint from
        // the existing buffer even if that internal path changes in a future xterm.
        try {
          term.refresh(0, term.rows - 1);
        } catch {
          // terminal already torn down — nothing to repaint
        }
      });
      term.loadAddon(addon);
      host.webgl = addon;
      webglFallback.noteRenderer(sessionId, "webgl");
    } catch {
      // Chunk error or WebGL ctor throw ⇒ stay on the DOM renderer (already the recorded
      // state). NOT a context loss, so the window is deliberately not latched.
      host.webgl = undefined;
    }
  };
  host.unloadWebgl = () => {
    if (!host.webgl) return;
    host.webgl.dispose(); // xterm reverts to its DOM renderer
    host.webgl = undefined;
    webglFallback.noteRenderer(sessionId, "dom");
  };
  const webglReady: Promise<void> =
    IS_MAIN_WINDOW && webglPermitted() ? host.loadWebgl() : Promise.resolve();

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

  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  // The cols/rows last successfully sent to the PTY — a same-size reparent (view
  // switch into an identically-sized slot) skips the `resize_pty` IPC entirely. On
  // unix the kernel already dedupes the SIGWINCH, but ConPTY can repaint on any
  // resize call, and skipping also spares the IPC churn. Reset on a failed send so
  // it retries; a Restart disposes + recreates the whole host, so no stale carry-over.
  let lastPtySize: { cols: number; rows: number } | null = null;
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
    if (lastPtySize?.cols === term.cols && lastPtySize?.rows === term.rows) {
      return; // the PTY already has this size — nothing to tell it
    }
    lastPtySize = { cols: term.cols, rows: term.rows };
    void resizePty(sessionId, term.cols, term.rows).catch(() => {
      lastPtySize = null; // retry on the next resize rather than believing a failed send
    });
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
  const pending: PendingChunk[] = [];
  // While the host still waits its turn in the replay queue (#351) the buffer is CAPPED:
  // those bytes are all ≤ the snapshot's `end` (the backend rings them before emitting),
  // so dropping the oldest can never leave a hole above `end` — see pendingOutput.ts.
  // The moment the fetch is dispatched we keep every byte, because everything above `end`
  // must survive for `dedupeAgainstScrollback`.
  let trimmable = true;
  const unsubscribe = onSessionOutput(sessionId, (bytes, offset) => {
    if (!replayed) {
      pushPending(
        pending,
        { bytes, offset },
        trimmable ? PENDING_CAP_BYTES : Number.POSITIVE_INFINITY,
      );
      return;
    }
    // After replay, live is always newer than the snapshot, but dedupe defensively in
    // case a chunk straddling the boundary arrives late.
    const fresh = dedupeAgainstScrollback(bytes, offset, scrollbackEnd);
    if (fresh.length === 0) return;
    writeBuffer.push(fresh);
    scheduleFlush();
  });

  /** Write the buffered live chunks that the snapshot didn't already cover, then open the
   * gate so subsequent output writes straight through. */
  const flushPending = () => {
    for (const { bytes, offset } of pending) {
      const fresh = dedupeAgainstScrollback(bytes, offset, scrollbackEnd);
      if (fresh.length) term.write(fresh);
    }
    pending.length = 0;
    replayed = true;
  };

  // Hydration is QUEUED, not run eagerly (#351): the subscription above is already live
  // (installed synchronously), so nothing is missed while this waits its turn — bytes are
  // buffered, and the backend's retained scrollback covers whatever the buffer drops.
  // `disposed` is declared up by the WebGL block (#356 hoisted it so the lazily imported
  // addon can bail out too); this job reads the same flag.
  replays.enqueue(sessionId, async () => {
    if (disposed) return;
    trimmable = false; // from here on, keep every byte (see pendingOutput.ts)
    try {
      const reply = await sessionScrollback(sessionId);
      scrollbackEnd = reply.end;
      // base64 → bytes (#346): the reply carries the retained scrollback as a compact
      // string (the #261 live-output encoding) instead of a JSON integer array that
      // cost a megabyte-plus parse per terminal mount.
      const replayBytes = decodeOutputB64(reply.b64);
      if (!disposed && replayBytes.length)
        await writeAndWait(term, replayBytes);
    } catch {
      // no scrollback / backend unavailable — leave scrollbackEnd at 0 so nothing is
      // dropped (every live chunk then writes in full).
    }
    if (disposed) return;
    flushPending();
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
    // Wait for the (lazily imported, #356) WebGL addon to have attached — or to have been
    // skipped/failed — so the one-shot atlas rebuild below still sees the real value of
    // `host.webgl` and runs exactly once, exactly when the GL renderer is in play. Never
    // rejects (`loadWebgl` is already `.catch`ed), and resolves immediately when the
    // decision was the DOM renderer.
    await webglReady;
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
    // (`host.webgl` undefined — a detached window #105, a software rasterizer #346, or the
    // #357 Settings override), which has no shared GL atlas.
    //
    // This is also why `applyTerminalRenderer` (#357) must NOT clear the atlas when it
    // attaches the addon to a running terminal: same shared-atlas hazard, and by then the
    // font has long been loaded and the atlas already rebuilt.
    if (host.webgl && !fontAtlasRebuilt) {
      fontAtlasRebuilt = true;
      host.webgl.clearTextureAtlas();
    }
    const family = term.options.fontFamily;
    term.options.fontFamily = "monospace";
    term.options.fontFamily = family;
    term.refresh(0, term.rows - 1);
    safeFit();
  })();

  host.dispose = () => {
    disposed = true;
    // A queued-but-unstarted hydration for a disposed host must never run (#351). An
    // already-running one is left alone — the `disposed` flag makes its remaining steps
    // no-ops, and it still releases its queue slot.
    replays.cancel(sessionId);
    if (resizeTimer !== undefined) clearTimeout(resizeTimer);
    // Flush any buffered tail bytes (and cancel the pending frame) before the term
    // goes away, so a final burst isn't dropped on teardown (#261).
    if (writeRaf !== undefined) cancelAnimationFrame(writeRaf);
    flushWrites();
    observer.disconnect();
    unsubscribe();
    dataSub.dispose();
    webLinks.dispose();
    host.webgl?.dispose();
    // Keep the renderer record bounded (reconcile / resetTerminal / detached-window churn
    // all route through here). The context-loss LATCH is deliberately not cleared (#364).
    webglFallback.forget(sessionId);
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
 *
 * Since #351 the caller (`Terminal.tsx`) only calls this once the slot has become
 * visible, so "first use" is first visibility rather than React mount.
 */
export function mountTerminal(sessionId: string, slot: HTMLElement): void {
  const host = ensureHost(sessionId);
  host.slot = slot;
  if (host.container.parentElement !== slot) {
    slot.appendChild(host.container);
  }
  host.scheduleResize();
  // Land a focus request that arrived before this host existed (#351).
  if (
    pendingFocus?.id === sessionId &&
    Date.now() - pendingFocus.at < PENDING_FOCUS_MS
  ) {
    pendingFocus = null;
    host.term.focus();
  }
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
 * before the resumed PTY's first output arrives — the output subscription is installed
 * synchronously in `createHost`; only its scrollback hydration is queued (#351), and the
 * pending buffer holds whatever the resumed PTY emits meanwhile.
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
 * subsequent keystrokes go to it. If the host does not exist yet (the #351 visibility
 * gate creates it a frame later), remember the request so the next `mountTerminal` for
 * this session lands it — otherwise switching to a Canvas tab (a tab click, or
 * hover-focus onto a fresh panel) and typing immediately would go nowhere. */
export function focusTerminal(sessionId: string): void {
  const host = hosts.get(sessionId);
  if (host) {
    pendingFocus = null;
    host.term.focus();
    return;
  }
  pendingFocus = { id: sessionId, at: Date.now() };
}

/** Unfocus whichever pooled xterm currently holds keyboard focus (#371): entering a
 * non-terminal panel with hover-focus on must stop keystrokes reaching the previous
 * agent. Also clears a pending focus request so a queued focus can't land after the
 * pointer has moved on. Never disposes a host (#18). */
export function blurTerminals(): void {
  pendingFocus = null;
  focusedTerminalElement(document.activeElement)?.blur();
}

/**
 * Dispose terminals whose sessions have been removed. Call when the session list
 * changes; an exited-but-still-listed session keeps its terminal (and overlay).
 */
export function reconcileTerminals(active: Iterable<string>): void {
  for (const id of terminalsToDispose(hosts.keys(), active)) {
    hosts.get(id)?.dispose();
    hosts.delete(id);
    if (pendingFocus?.id === id) pendingFocus = null;
  }
}
