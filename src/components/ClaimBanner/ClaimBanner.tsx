import styles from "./ClaimBanner.module.css";

/**
 * Slim read-only banner over an auto-save editor whose file another window has
 * soft-claimed (Multi-window task 435). Modeled on the #84 detached-note pattern — the
 * "owned by another window" affordance — but a banner rather than a content
 * replacement: the read-only view below stays visible and live-follows the other
 * window's saves via the hot-reload poll. **Take over** transfers the claim to
 * this window unconditionally (the hook's `takeOver`); the former holder flips
 * to read-only via the `file_claims://changed` broadcast. Shared by the
 * FileViewer (#148) and the KanbanPanel (#141–#151).
 */
function ClaimBanner({ onTakeOver }: { onTakeOver: () => void }) {
  return (
    <div className={styles.banner} role="status">
      <span className={styles.text}>Being edited in another window</span>
      <button type="button" className="btn btn-neutral" onClick={onTakeOver}>
        Take over
      </button>
    </div>
  );
}

export default ClaimBanner;
