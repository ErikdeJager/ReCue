import styles from "./DesignSample.module.css";

/**
 * Temporary design-system proof. Renders on `--bg-base` using design tokens and
 * the bundled JetBrains Mono font, and exercises the `caret-blink` keyframe
 * (which the reduced-motion killswitch disables). Replaced by the real app
 * shell in task #7 — kept now so the visual foundation is verifiable.
 */
function DesignSample() {
  return (
    <section className={styles.sample}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>Design tokens</p>
        <h1 className={styles.title}>ClaudeCue</h1>
        <p className={styles.subtitle}>
          Dark theme · system UI font · JetBrains Mono
        </p>

        <div className={styles.swatches}>
          <div
            className={styles.swatch}
            style={{ background: "var(--bg-elevated)" }}
          >
            elevated
          </div>
          <div
            className={styles.swatch}
            style={{ background: "var(--accent)" }}
          >
            accent
          </div>
          <div
            className={styles.swatch}
            style={{ background: "var(--bg-hover)" }}
          >
            hover
          </div>
        </div>

        <pre className={styles.terminal}>
          {"$ claude --version\nclaudecue ready"}
          <span className={styles.caret} aria-hidden="true" />
        </pre>
      </div>
    </section>
  );
}

export default DesignSample;
