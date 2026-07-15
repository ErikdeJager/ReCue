import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

import styles from "./NewSessionModal.module.css";

/** The panel's fixed width + its spacing from the icon / the viewport edges. */
const PANEL_WIDTH = 300;
const GAP = 6; // gap between the icon and the panel
const EDGE = 8; // min distance the panel keeps from every viewport edge

/** Fixed-position offsets for the portaled panel: `right` is always set (it hugs
 * the icon's right edge), and exactly one of `top` / `bottom` (above vs below). */
type PopoverPos = { top?: number; bottom?: number; right: number };

/**
 * The "i" beside the "Run in dev container" toggle: a small click-popover (the
 * `ViewsPopover` pattern — shared `menu-pop` chrome, outside-click + Escape close)
 * that states, tersely, what a containerized agent can and cannot do. The key
 * transparency point: git credentials are NOT mounted, so the agent can commit but
 * cannot push.
 *
 * The panel is **portaled to `document.body`** and positioned with `getBoundingClientRect`
 * (#416): the New Session modal is itself a 300px fixed popover with `overflow-y: auto`,
 * so an in-flow absolute panel got clipped by the modal's scroll box. It anchors
 * above-and-to-the-left of the icon, clamps ≥8px from every viewport edge, and flips
 * below when there isn't room above.
 *
 * Escape subtlety: the NewSessionModal closes itself from a window-level **bubble**
 * keydown listener, so this popover's Escape handler registers in the **capture**
 * phase and stops propagation — Escape with the popover open closes only the
 * popover, never the modal underneath it.
 */
function ContainerInfoPopover() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopoverPos | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const recompute = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    // Horizontal: align the panel's right edge with the icon's, then clamp so the
    // panel stays ≥ EDGE from both viewport edges (narrow windows keep it on-screen).
    let right = window.innerWidth - rect.right;
    const maxRight = window.innerWidth - PANEL_WIDTH - EDGE; // keeps left ≥ EDGE
    if (right > maxRight) right = maxRight;
    if (right < EDGE) right = EDGE;
    // Vertical: prefer above the icon; flip below when it wouldn't fit. panelH is 0
    // until the panel has mounted, which reads as "fits above" for the first pass —
    // `attachPanel` then re-measures with the real height.
    const panelH = panelRef.current?.offsetHeight ?? 0;
    if (rect.top - GAP - panelH >= EDGE) {
      setPos({ bottom: window.innerHeight - rect.top + GAP, right });
    } else {
      setPos({ top: rect.bottom + GAP, right });
    }
  }, []);

  // Re-measure the instant the portaled panel mounts, so the above/below flip uses
  // its real height (the first pass positions it above with height 0). Runs once per
  // open — the callback identity is stable, so React never re-invokes it on updates.
  const attachPanel = useCallback(
    (node: HTMLDivElement | null) => {
      panelRef.current = node;
      if (node) recompute();
    },
    [recompute],
  );

  // Position on open (and clear on close), before paint. The panel mounts from this
  // first pass; `attachPanel` then re-measures to flip it below if there's no room.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    recompute();
  }, [open, recompute]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      // Portaled panel: a click inside the panel OR the trigger is not "outside".
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Capture-phase: runs before (and suppresses) the modal's own
        // window-level Escape-to-close listener.
        event.stopPropagation();
        event.preventDefault();
        setOpen(false);
      }
    };
    // A scroll of the modal moves the icon out from under the panel — close rather
    // than chase it; a window resize just re-anchors.
    const onScroll = () => setOpen(false);
    const onResize = () => recompute();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, recompute]);

  return (
    <span
      ref={triggerRef}
      className={styles.infoRoot}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={styles.infoBtn}
        aria-label="About dev containers"
        aria-expanded={open}
        title="What can a containerized agent do?"
        onClick={() => setOpen((o) => !o)}
      >
        <Info size={13} strokeWidth={2} aria-hidden />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={attachPanel}
            className={`menu-pop ${styles.infoPop}`}
            style={{
              position: "fixed",
              ...pos,
              width: PANEL_WIDTH,
              zIndex: 1000,
            }}
            role="note"
            aria-label="About dev containers"
          >
            <div className="menu-section">Containerized agent</div>
            <p className={styles.infoText}>
              Runs claude in an isolated Docker container. Only this folder is
              mounted (at <code>/work</code>), plus a private per-session home
              that keeps claude signed in and resumable.
            </p>
            <p className={styles.infoText}>
              <strong>Can</strong> edit files in this folder, run commands
              isolated from your system, and create branches + commit — commits
              land in your repo immediately.
            </p>
            <p className={styles.infoText}>
              <strong>Cannot</strong> push or pull remotes — git credentials are
              not mounted, so push from your own terminal — or touch files
              outside this folder. Auto-naming is off (the agent shows its
              branch).
            </p>
            <p className={styles.infoMeta}>
              Requires Docker. First use builds a small local image (one time).
            </p>
          </div>,
          document.body,
        )}
    </span>
  );
}

export default ContainerInfoPopover;
